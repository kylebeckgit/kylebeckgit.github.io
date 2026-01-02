/* converter/parsers.js */

/**
 * Parsers for EXS24 and SFZ formats.
 */

// =============================================================================
// SFZ Parser
// =============================================================================

function parseSFZ(text, filename, fileMap) {
    const zoneData = [];

    // Remove comments
    text = text.replace(/\/\/.*/g, ""); // // comment
    text = text.replace(/\/\*[\s\S]*?\*\//g, ""); // /* comment */

    // Split by headers <group>, <region>, etc.
    // We care mainly about <region>
    // Simple regex-based parsing (simplified compared to Python version but functional for most)

    // Collect global/master/group opcodes to merge into regions
    let globalOpcodes = {};
    let masterOpcodes = {};
    let groupOpcodes = {};

    // Normalize newlines
    const lines = text.split(/\r?\n/);

    let currentHeader = null;
    let currentOpcodes = {};

    // Simple state machine
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        const headerMatch = line.match(/^<(\w+)>(.*)/);
        if (headerMatch) {
            // New header found
            // Commit previous opcodes if it was a region (already done per line in this simple parsers?)
            // Actually, SFZ structure is Opcode Opcode <header> Opcode...
            // We need to parse opcodes and apply them to the CURRENT scope

            const headerName = headerMatch[1].toLowerCase();
            currentHeader = headerName;

            if (headerName === 'region') {
                // Merge inheritance
                currentOpcodes = { ...globalOpcodes, ...masterOpcodes, ...groupOpcodes };
                processAttributes(headerMatch[2], currentOpcodes); // inline attributes like <region>sample=foo

                // We can't push yet, we need to read following lines until next header
                // Wait, standard SFZ parsers usually accumulate. 
                // Let's change strategy: Split by <headers>
            } else if (headerName === 'group') {
                groupOpcodes = { ...globalOpcodes, ...masterOpcodes };
                processAttributes(headerMatch[2], groupOpcodes);
                currentOpcodes = groupOpcodes;
            } else if (headerName === 'master') {
                masterOpcodes = { ...globalOpcodes };
                processAttributes(headerMatch[2], masterOpcodes);
                currentOpcodes = masterOpcodes;
            } else if (headerName === 'global') {
                globalOpcodes = {};
                processAttributes(headerMatch[2], globalOpcodes);
                currentOpcodes = globalOpcodes;
            } else if (headerName === 'control') {
                // Ignore control for now
                currentOpcodes = {};
            }
        } else {
            // It's an opcode line
            processAttributes(line, currentOpcodes);

            // If we are in a region, every line adds to the current region definition.
            // BUT, multiple regions are usually defined sequentially.
            // The simpliest robust way is to treat <region> as a marker that starts a new object in the list.
        }
    }

    // Re-parsing Strategy: Regex split is safer
    // Find all <region> blocks and parse them.
    // This simplistic parser assumes standard formatting. A full parser is complex.
    // Let's use the Python logic's approach: split by header pattern.

    // Reset for robust approach
    const parts = text.split(/<(control|global|master|group|region)>/i);
    // parts[0] is stuff before first header
    // parts[1] is first header name
    // parts[2] is content of first header
    // ...

    globalOpcodes = {};
    masterOpcodes = {};
    groupOpcodes = {};

    let i = 1;
    while (i < parts.length) {
        const header = parts[i].toLowerCase();
        const content = parts[i + 1];
        const opcodes = parseOpcodes(content);

        if (header === 'global') globalOpcodes = opcodes;
        else if (header === 'master') masterOpcodes = opcodes;
        else if (header === 'group') groupOpcodes = opcodes;
        else if (header === 'region') {
            const merged = { ...globalOpcodes, ...masterOpcodes, ...groupOpcodes, ...opcodes };
            if (merged.sample) {
                zoneData.push(createZoneFromSFZ(merged, fileMap));
            }
        }

        i += 2;
    }

    // Sort
    zoneData.sort((a, b) => a.minvel - b.minvel);
    zoneData.sort((a, b) => a.pitch - b.pitch);

    return zoneData;
}

function parseOpcodes(text) {
    const opcodes = {};
    // match key=value
    // handle values with spaces? SFZ is tricky. usually key=value key=value
    // Value can be anything until next key=

    const opcodeRegex = /([a-zA-Z0-9_]+)=([^=]+)(?=$|\s+[a-zA-Z0-9_]+=)/g;
    // This regex is imperfect for spaces in filenames but works for common cases
    // Better: split by space, but filenames have spaces.

    // Let's try matching key=value where value doesn't contain '=' 
    // and we trim the end which might be the start of next key

    // Alternative: Python version logic
    // key = match.group(1), value = match.group(2).strip()

    // We can clean lines first
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    const cleanText = lines.join(' ');

    const matches = [...cleanText.matchAll(/([a-zA-Z0-9_]+)=([^=]+?)(?=\s+[a-zA-Z0-9_]+=|$)/g)];
    for (const m of matches) {
        opcodes[m[1].toLowerCase()] = m[2].trim();
    }
    return opcodes;
}

function createZoneFromSFZ(opcodes, fileMap) {
    const sampleRel = opcodes.sample.replace(/\\/g, '/');
    const sampleName = sampleRel.split('/').pop();

    // Pitch logic
    let pitch = 60; // C3
    if (opcodes.pitch_keycenter) {
        pitch = parseNote(opcodes.pitch_keycenter);
    } else if (opcodes.key) {
        pitch = parseNote(opcodes.key);
    }

    const transpose = parseInt(opcodes.transpose || 0);
    const keyCenter = pitch - transpose;

    const lovel = parseInt(opcodes.lovel || 0);
    const hivel = parseInt(opcodes.hivel || 127);

    // Loop logic
    const loopMode = opcodes.loop_mode || opcodes.loopmode || 'no_loop';
    const loop = (loopMode === 'loop_sustain' || loopMode === 'loop_continuous');

    const loopStart = parseInt(opcodes.loop_start || opcodes.loopstart || 0);
    const loopEnd = parseInt(opcodes.loop_end || opcodes.loopend || 0);

    // Filename generation
    const velLayer = lovel; // Simplified velocity layer assignment
    const noteName = midiToNoteName(pitch);
    // RR not fully supported in this simple parser yet
    const newFileName = `${sampleName.replace(/\.[^/.]+$/, "")}_${pitch}_v${lovel}.wav`;

    return {
        pitch: pitch,
        keyCenter: keyCenter,
        minvel: lovel,
        maxvel: hivel,
        fileIndex: -1, // Not used primarily
        sampleName: sampleName, // Original filename
        sourceFile: null, // Will be filled by finding file
        loop: loop,
        loopStart: loopStart,
        loopEnd: loopEnd,
        loopCrossfade: 0, // Not implementing xfade processing in JS version yet
        newFileName: newFileName
    };
}

function parseNote(noteStr) {
    if (!isNaN(noteStr)) return parseInt(noteStr);

    // Parse C4, F#3 etc.
    const match = noteStr.match(/^([A-G])([#b]?)(-?\d+)$/i);
    if (!match) return 60;

    const note = match[1].toUpperCase();
    const acc = match[2];
    const octave = parseInt(match[3]);

    const map = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let midi = map[note] + (octave + 1) * 12;
    if (acc === '#') midi++;
    if (acc === 'b') midi--;

    return midi;
}

function midiToNoteName(midi) {
    const notes = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
    const oct = Math.floor(midi / 12) - 2; // Tonverk C0=24? No C3=60. C0 is usually 12 or 24.
    // If C3(60) -> 60/12 = 5. 5-offset=3 -> offset=2.
    // C0(12) -> 12/12 = 1. 1-2 = -1. 
    // Let's stick to Python logic: (midi // 12) - 2
    const n = notes[midi % 12];
    return `${n}${oct}`;
}

// =============================================================================
// EXS24 Parser
// =============================================================================

function parseEXS(buffer, filename, fileMap) {
    const view = new DataView(buffer);
    const zones = [];
    const samples = [];

    // debug hex helper
    const toHex = (n) => '0x' + n.toString(16).toUpperCase().padStart(8, '0');
    const getHexBytes = (start, len) => {
        let s = '';
        for (let i = 0; i < len && start + i < buffer.byteLength; i++) {
            s += view.getUint8(start + i).toString(16).padStart(2, '0').toUpperCase() + ' ';
        }
        return s;
    };

    console.log("Parsing EXS...", filename);
    console.log(`File Size: ${buffer.byteLength}`);
    const magicTest = view.getUint32(16, true);
    console.log(`Magic (LE read at 16): ${toHex(magicTest)}`);
    console.log(`Header (0-32): ${getHexBytes(0, 32)}`);
    console.log(`Data at 84: ${getHexBytes(84, 32)}`);

    // Log this to UI too
    const logEl = document.getElementById('log-output');
    if (logEl) {
        const d = document.createElement('div');
        d.style.fontFamily = 'monospace';
        d.style.fontSize = '0.8em';
        d.innerHTML = `DEBUG: Magic=${toHex(magicTest)}<br>Header=${getHexBytes(0, 16)}...<br>At 84=${getHexBytes(84, 16)}`;
        logEl.appendChild(d);
        logEl.scrollTop = logEl.scrollHeight;
    }

    let isLittleEndian = true;
    const fileSize = buffer.byteLength;

    // Override: The debug output 0x0B size confirms Little Endian data despite TBOS magic.
    // Logic Auto Sampler seems to mess up the header endianness flag.
    console.log("Forcing Little Endian based on visual analysis of Size=11 (0x0B).");
    isLittleEndian = true;

    // DEBUG: Walk the first few chunks to understand the ID map
    let debugOffset = 84;
    let chunksLog = "CHUNKS: ";
    for (let i = 0; i < 20 && debugOffset < fileSize - 12; i++) {
        const sz = view.getUint32(debugOffset + 4, isLittleEndian);
        const id = view.getUint32(debugOffset + 8, isLittleEndian);
        chunksLog += `[#${i} off=${debugOffset} sz=${sz} id=0x${id.toString(16).toUpperCase()}] `;

        // Chunk size in EXS includes the header? Or is it 84+sz?
        // If sz is 11, and we move 11 bytes, we might land in middle.
        // Standard EXS interpretation: 
        // nextOffset = currentOffset + 84 + size? Or just size?
        // Let's assume size is data size, and header is 84? No.
        // Python code says: size = 84 + size_read

        // If size is 11... 84+11=95.
        // Let's try that.
        debugOffset += (84 + sz);
    }
    console.log(chunksLog);
    // UI Log
    if (logEl) {
        const d = document.createElement('div');
        d.style.fontFamily = 'monospace';
        d.style.fontSize = '0.7em';
        d.innerText = chunksLog;
        logEl.appendChild(d);
    }

    // Helper to read chunks
    let offset = 84;

    const ZONES = [];
    const SAMPLES = [];

    while (offset < fileSize) {
        if (offset + 12 > fileSize) break; // Safety

        // Chunk size is at offset+4 (UInt32)
        // But header logic says: size = 84 + size_in_bytes ?? No, check python.
        // Python: size = 84 + struct.unpack(..., offset+4) -- NO wait
        // EXSChunk.size: 84 is NOT added. It reads size from offset+4.
        // Wait, `self._size = 84 + struct.unpack`. This is unusual.
        // It implies the size field DOES NOT include the 84 byte common header?? 
        // Or simpler: The chunk header is 84 bytes??
        // Python code: `size = 84 + struct.unpack_from("<I", self.instrument.data, self.offset + 4)[0]`
        // Yes, the chunk header is likely 84 bytes or the offset calculation implies it.
        // Let's assume the Python logic is correct.

        const chunkSizeData = view.getUint32(offset + 4, isLittleEndian);
        const chunkSize = 84 + chunkSizeData;
        const chunkId = view.getUint32(offset + 8, isLittleEndian);

        // Parse based on ID
        if (chunkId === 0x01000101 || chunkId === 0x41000101) { // Zone
            ZONES.push({ offset, size: chunkSize });
        } else if (chunkId === 0x03000101 || chunkId === 0x43000101) { // Sample
            SAMPLES.push({ offset, size: chunkSize });
        }

        offset += chunkSize;
    }

    // FALLBACK: If we found no zones, try a brute-force scan.
    // This handles files with corrupted headers, non-standard offsets, or mixed endianness issues.
    if (ZONES.length === 0) {
        console.log("Strict parsing failed to find zones. Attempting brute-force scan...");

        const scanStep = 4; // Align to 4 bytes
        let scanOffset = 84;

        while (scanOffset < fileSize - 12) {
            // Read raw bytes to be agnostic
            const b0 = view.getUint8(scanOffset + 8);
            const b1 = view.getUint8(scanOffset + 9);
            const b2 = view.getUint8(scanOffset + 10);
            const b3 = view.getUint8(scanOffset + 11);

            // Zone ID: 0x01000101
            // LE Bytes: 01 01 00 01
            // BE Bytes: 01 00 01 01

            let foundZone = false;
            let foundSample = false;
            let chunkIsLE = true;

            // Check Zone
            if (b0 === 1 && b1 === 1 && b2 === 0 && b3 === 1) { // LE Zone
                foundZone = true; chunkIsLE = true;
            } else if (b0 === 1 && b1 === 0 && b2 === 1 && b3 === 1) { // BE Zone
                foundZone = true; chunkIsLE = false;
            }

            // Check Sample (0x03000101) -> LE: 01 01 00 03 | BE: 03 00 01 01
            if (!foundZone) {
                if (b0 === 1 && b1 === 1 && b2 === 0 && b3 === 3) { // LE Sample
                    foundSample = true; chunkIsLE = true;
                } else if (b0 === 3 && b1 === 0 && b2 === 1 && b3 === 1) { // BE Sample
                    foundSample = true; chunkIsLE = false;
                }
            }

            if (foundZone || foundSample) {
                // Validate size
                const sizeCheck = 84 + view.getUint32(scanOffset + 4, chunkIsLE);
                if (sizeCheck > 84 && sizeCheck < 100000) {
                    // Valid chunk found
                    console.log(`Scanner found ${foundZone ? 'Zone' : 'Sample'} at ${scanOffset} (Size: ${sizeCheck}, LE: ${chunkIsLE})`);

                    if (foundZone) ZONES.push({ offset: scanOffset, size: sizeCheck, isLE: chunkIsLE });
                    if (foundSample) SAMPLES.push({ offset: scanOffset, size: sizeCheck, isLE: chunkIsLE });

                    scanOffset += sizeCheck;

                    // If we found something, maybe update our global assumption?
                    // But mixed files are possible (rare). Let's stick effectively to what we found.
                    // The actual parsing loop below relies on `isLittleEndian`. 
                    // We need to update that logic to use the per-chunk endianness if we want to be safe, 
                    // OR just update the global flag if it's currently 0.

                    // For now, let's assume consistent endianness once found.
                    isLittleEndian = chunkIsLE;
                    continue;
                }
            }

            scanOffset += scanStep;
        }
        console.log(`Scan found ${ZONES.length} zones and ${SAMPLES.length} samples.`);
    }

    // Process Samples first to map them
    const sampleMap = {}; // ID/Index -> SampleInfo
    // In Python: `exs.samples` list is populated in order.
    // We can just preserve the array order.

    SAMPLES.forEach((chk, index) => {
        // Use chunk specific endianness if we tracked it, otherwise global
        const useLE = (chk.isLE !== undefined) ? chk.isLE : isLittleEndian;

        // Name: offset + 20, 64 chars
        // Path: offset + 164, 256 chars
        // FileName: offset + 420, 256 chars

        const name = getString(view, chk.offset + 20, 64);
        const path = getString(view, chk.offset + 164, 256);
        const fileName = getString(view, chk.offset + 420, 256) || name;

        // Sample Rate: offset + 92 (Int32)
        const rate = view.getInt32(chk.offset + 92, useLE);

        sampleMap[index] = { name, fileName, path, rate };
    });

    // Process Zones
    const parsedZones = [];

    ZONES.forEach(chk => {
        const off = chk.offset;
        const useLE = (chk.isLE !== undefined) ? chk.isLE : isLittleEndian;

        // Root Note: offset + 85 (Byte)
        const rootNote = view.getUint8(off + 85);

        // Velocity: 93 (min), 94 (max)
        const minVel = view.getUint8(off + 93);
        const maxVel = view.getUint8(off + 94);

        // Sample Index: offset + 176 (UInt32)
        const sampleIndex = view.getUint32(off + 176, useLE);

        // Loop Info
        const loopStart = view.getInt32(off + 104, useLE);
        const loopEnd = view.getInt32(off + 108, useLE); // Inclusive in EXS? Python says yes.
        const loopOpts = view.getUint8(off + 117);
        const loopOn = (loopOpts & 1) !== 0;

        const sampleInfo = sampleMap[sampleIndex];
        if (!sampleInfo) return; // Zone points to invalid sample

        // Construct Zone Object
        // We need to resolve the file from `fileMap` using sampleInfo.fileName

        const pitch = rootNote;
        const noteName = midiToNoteName(pitch);
        const newFileName = `${sampleInfo.fileName.replace(/\.[^/.]+$/, "")}_${pitch}_v${minVel}.wav`;

        parsedZones.push({
            pitch: pitch,
            keyCenter: pitch, // EXS usually same
            minvel: minVel,
            maxvel: maxVel,
            sampleName: sampleInfo.fileName,
            sampleIndex: sampleIndex, // debug
            sourceFile: null, // to be resolved in app.js
            loop: loopOn,
            loopStart: loopStart,
            loopEnd: loopEnd,
            newFileName: newFileName
        });
    });

    return parsedZones;
}

function getString(view, offset, maxLength) {
    let str = "";
    for (let i = 0; i < maxLength; i++) {
        const code = view.getUint8(offset + i);
        if (code === 0) break;
        str += String.fromCharCode(code);
    }
    return str;
}
