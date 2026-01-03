/* converter/app.js */

document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const convertBtn = document.getElementById('convert-btn');
    const logOutput = document.getElementById('log-output');
    const progressBar = document.getElementById('progress-bar');

    let loadedFiles = new Map(); // Store file objects: name -> File
    let inputInstrumentFiles = []; // .exs or .sfz files

    // Logging utility
    function log(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.textContent = message;
        logOutput.appendChild(entry);
        logOutput.scrollTop = logOutput.scrollHeight;
    }

    // Handle Drag & Drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });

    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    function handleFiles(files) {
        let newInstruments = 0;
        let newSamples = 0;

        for (let file of files) {
            loadedFiles.set(file.name, file);
            const ext = file.name.split('.').pop().toLowerCase();

            if (ext === 'exs' || ext === 'sfz') {
                inputInstrumentFiles.push(file);
                newInstruments++;
            } else if (['wav', 'aif', 'aiff', 'mp3', 'flac'].includes(ext)) {
                newSamples++;
            }
        }

        if (newInstruments > 0 || newSamples > 0) {
            log(`Loaded ${newInstruments} instrument(s) and ${newSamples} sample(s).`, 'success');
            log(`Total files ready: ${loadedFiles.size}`);
        }

        updateUI();
    }

    function updateUI() {
        convertBtn.disabled = inputInstrumentFiles.length === 0;
        if (inputInstrumentFiles.length > 0) {
            dropZone.innerHTML = `<p>${inputInstrumentFiles.length} Instrument(s) Ready to Convert</p><p class="sub-text">${loadedFiles.size} Total Files Loaded (Drag more to add)</p>`;
        }
    }

    // Main Conversion Logic
    convertBtn.addEventListener('click', async () => {
        convertBtn.disabled = true;
        log('Starting conversion...', 'info');
        progressBar.style.width = '0%';

        const RESAMPLE_RATE = parseInt(document.getElementById('resample-rate').value);
        const OPTIMIZE_LOOPS = document.getElementById('optimize-loops').checked;
        const EMBED_LOOP = document.getElementById('embed-loop').checked;

        try {
            const zip = new JSZip();
            let processedCount = 0;
            const totalInstruments = inputInstrumentFiles.length;

            for (const instrumentFile of inputInstrumentFiles) {
                log(`Parsing ${instrumentFile.name}...`);

                // 1. Parse Instrument
                let zoneData = [];
                const ext = instrumentFile.name.split('.').pop().toLowerCase();

                if (ext === 'exs') {
                    const buffer = await instrumentFile.arrayBuffer();
                    zoneData = parseEXS(buffer, instrumentFile.name, loadedFiles);
                } else if (ext === 'sfz') {
                    const text = await instrumentFile.text();
                    zoneData = parseSFZ(text, instrumentFile.name, loadedFiles);
                }

                if (!zoneData || zoneData.length === 0) {
                    log(`Warning: No zones found in ${instrumentFile.name}`, 'error');
                    continue;
                }

                log(`  Found ${zoneData.length} zones. Processing audio...`);

                // 2. Process Audio & Write to Zip
                const safeName = instrumentFile.name.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9]/gi, '_');
                const instrumentDir = zip.folder(safeName);

                // Track unique samples to avoid re-processing duplicates
                const processedSamples = new Set();

                for (const zone of zoneData) {
                    // If sample name is missing or not found, skip
                    if (!zone.sourceFile) {
                        // Try to find file in loadedFiles by name, including case-insensitive search
                        const foundFile = findFile(zone.sampleName);
                        if (foundFile) {
                            zone.sourceFile = foundFile;
                        } else {
                            log(`  Missing sample: ${zone.sampleName}`, 'error');
                            continue;
                        }
                    }

                    const sampleFileName = zone.newFileName || zone.sampleName; // Should be set by parser/prep

                    if (!processedSamples.has(sampleFileName)) {
                        processedSamples.add(sampleFileName);

                        try {
                            // Read and Process Audio
                            const arrayBuffer = await zone.sourceFile.arrayBuffer();
                            const audioContext = new (window.AudioContext || window.webkitAudioContext)();

                            // Decode
                            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                            // Resample & Loop Optimize
                            const processedBuffer = await processAudio(audioBuffer, {
                                targetRate: RESAMPLE_RATE,
                                optimizeLoops: OPTIMIZE_LOOPS,
                                loopStart: zone.loopStart,
                                loopEnd: zone.loopEnd,
                                loop: zone.loop
                            });

                            // Update zone loop points based on processing (resampling scaling)
                            if (processedBuffer.loopStart !== undefined) zone.loopStart = processedBuffer.loopStart;
                            if (processedBuffer.loopEnd !== undefined) zone.loopEnd = processedBuffer.loopEnd;

                            // Encode to WAV with smpl chunk
                            const wavBytes = encodeWAV(processedBuffer.buffer, {
                                loop: zone.loop,
                                loopStart: zone.loopStart,
                                loopEnd: zone.loopEnd,
                                note: zone.keyCenter,
                                embedLoop: EMBED_LOOP
                            });

                            instrumentDir.file(sampleFileName, wavBytes);

                        } catch (err) {
                            log(`  Error processing sample ${zone.sampleName}: ${err}`, 'error');
                        }
                    }
                }

                // 3. Generate .elmulti
                const elmultiContent = generateElmulti(zoneData, safeName);
                instrumentDir.file(`${safeName}.elmulti`, elmultiContent);

                processedCount++;
                progressBar.style.width = `${(processedCount / totalInstruments) * 100}%`;
            }

            if (processedCount === 0) {
                log('Error: No instruments were successfully converted. The zip file was not generated.', 'error');
                log('Please ensure your .exs files are valid and not corrupted.', 'error');
            } else {
                // 4. Download Zip
                log('Generating Zip file...', 'info');
                const content = await zip.generateAsync({ type: "blob" });
                const url = URL.createObjectURL(content);
                const a = document.createElement('a');
                a.href = url;
                a.download = "elmulti_converted.zip";
                a.click();
                URL.revokeObjectURL(url);

                log('Conversion complete! Download started.', 'success');
            }

        } catch (error) {
            console.error(error);
            log(`Fatal Error: ${error.message}`, 'error');
        } finally {
            convertBtn.disabled = false;
        }
    });

    function findFile(name) {
        if (!name) return null;
        if (loadedFiles.has(name)) return loadedFiles.get(name);

        // Fuzzy Match: Compare basenames (ignoring paths) and extensions
        // EXS might say "MacHD:Users:Music:Samples:Kick.wav"
        // User uploaded "Kick.wav"

        // 1. Extract basename from search target
        // Handle both / and \ separators
        const searchBase = name.replace(/\\/g, '/').split('/').pop().toLowerCase();

        // 2. Search loaded files
        for (let [key, val] of loadedFiles) {
            const loadedBase = key.toLowerCase(); // key is the filename (e.g. "Kick.wav")

            if (loadedBase === searchBase) {
                return val;
            }

            // Try matching without extension? (Rarely needed but possible)
        }

        return null;
    }
});
