/* converter/parsers.js */

/**
 * Parsers for EXS24 and SFZ formats.
 */

// =============================================================================
// SFZ Parser (Simplified)
// =============================================================================

function parseSFZ(text, filename, fileMap) {
    const zoneData = [];

    // Remove comments
    text = text.replace(/\/\/.*/g, ""); // // comment
    text = text.replace(/\/\*[\s\S]*?\*\//g, ""); // /* comment */

    // Collection of Opcodes
    let globalOpcodes = {};
    let masterOpcodes = {};
    let groupOpcodes = {};

    // Strategy: Split by regex headers and assume sequential processing
    const parts = text.split(/<(control|global|master|group|region)>/i);
    // parts[0] = before first header, parts[1] = header name, parts[2] = content

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

    zoneData.sort((a, b) => a.minvel - b.minvel);
    zoneData.sort((a, b) => a.pitch - b.pitch);
    return zoneData;
}

function parseOpcodes(text) {
    const opcodes = {};
    if (!text) return opcodes;
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    const cleanText = lines.join(' ');

    // Match key=value
    const matches = [...cleanText.matchAll(/([a-zA-Z0-9_]+)=([^=]+?)(?=\s+[a-zA-Z0-9_]+=|$)/g)];
    for (const m of matches) {
        opcodes[m[1].toLowerCase()] = m[2].trim();
    }
    return opcodes;
}

function createZoneFromSFZ(opcodes, fileMap) {
    const sampleRel = opcodes.sample.replace(/\\/g, '/');
    const sampleName = sampleRel.split('/').pop();

    let pitch = 60;
    if (opcodes.pitch_keycenter) pitch = parseNote(opcodes.pitch_keycenter);
    else if (opcodes.key) pitch = parseNote(opcodes.key);

    const transpose = parseInt(opcodes.transpose || 0);
    const keyCenter = pitch - transpose;
    const lovel = parseInt(opcodes.lovel || 0);
    const hivel = parseInt(opcodes.hivel || 127);
    const loopMode = opcodes.loop_mode || opcodes.loopmode || 'no_loop';
    const loop = (loopMode === 'loop_sustain' || loopMode === 'loop_continuous');
    const loopStart = parseInt(opcodes.loop_start || opcodes.loopstart || 0);
    const loopEnd = parseInt(opcodes.loop_end || opcodes.loopend || 0);
    const newFileName = `${sampleName.replace(/\.[^/.]+$/, "")}_${pitch}_v${lovel}.wav`;

    return {
        pitch, keyCenter, minvel: lovel, maxvel: hivel, sampleName, sourceFile: null,
        loop, loopStart, loopEnd, newFileName
    };
}

function parseNote(noteStr) {
    if (!isNaN(noteStr)) return parseInt(noteStr);
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
    const oct = Math.floor(midi / 12) - 2;
    return `${notes[midi % 12]}${oct}`;
}

// =============================================================================
// EXS24 Parser (Robust)
// =============================================================================

function parseEXS(buffer, filename, fileMap) {
    const view = new DataView(buffer);

    // debug hex helper
    const toHex = (n) => '0x' + n.toString(16).toUpperCase().padStart(8, '0');
    const getHexBytes = (start, len) => {
        let s = '';
        for (let i = 0; i < len && start + i < buffer.byteLength; i++) {
            s += view.getUint8(start + i).toString(16).padStart(2, '0').toUpperCase() + ' ';
        }
        return s;
    };

    console.log("Parsing EXS...", filename, "Size:", buffer.byteLength);

    const logEl = document.getElementById('log-output');
    if (logEl) {
        const magicTest = view.getUint32(16, true);
        const d = document.createElement('div');
        d.style.fontFamily = 'monospace';
        d.style.fontSize = '0.8em';
        d.innerHTML = `DEBUG: Magic=${toHex(magicTest)}<br>Header=${getHexBytes(0, 16)}...<br>At 84=${getHexBytes(84, 16)}`;
        logEl.appendChild(d);
        logEl.scrollTop = logEl.scrollHeight;
    }

    const fileSize = buffer.byteLength;
    let isLittleEndian = true; // Placeholder

    // -------------------------------------------------------------------------
    // Structure Discovery Scan
    // -------------------------------------------------------------------------
    console.log("Starting Structure Discovery Scan (Assumed Big Endian)...");

    const potentialIDs = {};
    const scannerOffsets = [];

    for (let pos = 84; pos < fileSize - 12; pos += 4) {
        // Assume Big Endian 
        const val1 = view.getUint32(pos, false); // Possible Size?
        const val2 = view.getUint32(pos + 4, false); // Possible ID?

        if (val1 > 16 && val1 < 1000000) {
            if (val2 < 0x10000000) {
                const idHex = toHex(val2);
                if (!potentialIDs[idHex]) potentialIDs[idHex] = 0;
                potentialIDs[idHex]++;
                if (potentialIDs[idHex] <= 3) {
                    scannerOffsets.push(`Candidate at ${pos}: Size=${val1} ID=${idHex}`);
                }
            }
        }
    }

    const sortedIDs = Object.entries(potentialIDs).sort((a, b) => b[1] - a[1]);
    console.log("Top Candidate Chunk IDs:", sortedIDs.slice(0, 5));

    if (logEl) {
        const d = document.createElement('div');
        d.style.fontFamily = 'monospace'; d.style.fontSize = '0.7em';
        d.innerHTML = `SCAN RESULTS:<br>${sortedIDs.slice(0, 5).map(e => `ID ${e[0]}: ${e[1]} count`).join('<br>')}`;
        logEl.appendChild(d);
    }

    // Determine Zone ID Candidate from Scan
    let zoneIdCandidate = 0x01000101;
    let sampleIdCandidate = 0x03000101;

    // Using simple heuristic: Most frequent is ZoneLoop or Param, 2nd is Sample?
    // Zones are usually most numerous.
    if (sortedIDs.length > 0) zoneIdCandidate = parseInt(sortedIDs[0][0], 16);
    if (sortedIDs.length > 1 && sortedIDs[1]) sampleIdCandidate = parseInt(sortedIDs[1][0], 16);

    // -------------------------------------------------------------------------
    // Parsing Loop
    // -------------------------------------------------------------------------
    // We treat the file as Big Endian as confirmed by previous analysis
    isLittleEndian = false;

    // Forensic String Hunt (v9)
    // We need to find where the sample names are to deduce chunk structure.
    console.log("Forensic String Hunt: Looking for .wav/.aif references...");
    const stringCandidates = [];
    const minAscii = 32; const maxAscii = 126;

    // Scan typical filename extensions
    const ext1 = [0x2E, 0x77, 0x61, 0x76]; // .wav
    const ext2 = [0x2E, 0x61, 0x69, 0x66]; // .aif
    const ext3 = [0x2E, 0x63, 0x61, 0x66]; // .caf (logic often uses this)

    for (let i = 84; i < fileSize - 4; i++) {
        // Check for extension
        const b0 = view.getUint8(i); const b1 = view.getUint8(i + 1);
        const b2 = view.getUint8(i + 2); const b3 = view.getUint8(i + 3);

        let foundExt = false;
        if (b0 === 0x2E && b1 === 0x77 && b2 === 0x61 && b3 === 0x76) foundExt = true;
        if (b0 === 0x2E && b1 === 0x61 && b2 === 0x69 && b3 === 0x66) foundExt = true;

        if (foundExt) {
            // Found extension. Backtrack to find start of string (null char)
            let start = i;
            while (start > 84 && view.getUint8(start - 1) !== 0) {
                start--;
            }
            const strLen = (i + 4) - start;
            const foundStr = getString(view, start, strLen);
            stringCandidates.push({ offset: start, name: foundStr });
        }
    }

    console.log("Found String Candidates:", stringCandidates);
    if (logEl) {
        const d = document.createElement('div');
        d.style.fontFamily = 'monospace'; d.style.fontSize = '0.7em';
        d.innerHTML = `STRINGS FOUND:<br>${stringCandidates.slice(0, 5).map(e => `${e.name} @ ${e.offset}`).join('<br>')}`;
        logEl.appendChild(d);
    }

    // Adjust logic: If we found strings, can we deduce the chunk?
    // Sample Name is usually at offset + 20 in a chunk? Or offset + 420 (filename)?
    // If we assume the string *starts* at `chunkOffset + 420` (standard EXS filename offset),
    // Then `chunkOffset = stringOffset - 420`.
    // Let's test this hypothesis.

    if (stringCandidates.length > 0) {
        const firstStr = stringCandidates[0];
        const hypothesticalChunkStart = firstStr.offset - 20; // Try Name offset first?
        // Or -420?
        console.log(`Hypothesis: Chunk starts at ${hypothesticalChunkStart}?`);
    }

    const ZONES = [];
    const SAMPLES = [];

    // Linear scan using the discovered IDs
    // Instead of hopping linked list (broken in this file), we scan looking for candidates

    for (let pos = 84; pos < fileSize - 12; pos += 4) {
        const val1 = view.getUint32(pos, false); // Size
        const val2 = view.getUint32(pos + 4, false); // ID

        if (val1 > 16 && val1 < 1000000) {
            if (val2 === zoneIdCandidate) {
                ZONES.push({ offset: pos, size: val1 + 84, isLE: false });
            } else if (val2 === sampleIdCandidate) {
                SAMPLES.push({ offset: pos, size: val1 + 84, isLE: false });
            }
            // Add standard fallback
            else if (val2 === 0x01000101 || val2 === 0x03000101) {
                if (val2 === 0x01000101) ZONES.push({ offset: pos, size: val1 + 84, isLE: false });
                if (val2 === 0x03000101) SAMPLES.push({ offset: pos, size: val1 + 84, isLE: false });
            }
        }
    }

    // -------------------------------------------------------------------------
    // Process Data
    // -------------------------------------------------------------------------

    // Process Samples
    const sampleMap = {};
    SAMPLES.forEach((chk, index) => {
        // Name: offset + 20, 64 chars
        // Path: offset + 164, 256 chars
        // FileName: offset + 420, 256 chars
        const name = getString(view, chk.offset + 20, 64);
        const fileName = getString(view, chk.offset + 420, 256) || name;
        const rate = view.getInt32(chk.offset + 92, false); // BE
        sampleMap[index] = { name, fileName, rate };
        // We might need to map by ID if the index isn't sequential? 
        // Standard EXS links Zone->Sample by index.
    });

    // Process Zones
    const parsedZones = [];
    ZONES.forEach(chk => {
        const off = chk.offset;

        const rootNote = view.getUint8(off + 85);
        const minVel = view.getUint8(off + 93);
        const maxVel = view.getUint8(off + 94);
        const sampleIndex = view.getUint32(off + 176, false); // BE

        const loopStart = view.getInt32(off + 104, false);
        const loopEnd = view.getInt32(off + 108, false);
        const loopOpts = view.getUint8(off + 117);
        const loopOn = (loopOpts & 1) !== 0;

        // Resolve Sample
        // If sampleIndex is not 0-based but an ID? Logic Auto Sampler often matches by order.
        let sampleInfo = sampleMap[sampleIndex];
        // Fallback: if sampleIndex > count, use modulo (hack) or just try to match index in list
        if (!sampleInfo && SAMPLES[sampleIndex]) sampleInfo = sampleMap[sampleIndex];
        // If still null, just pick the corresponding sample if count matches
        if (!sampleInfo && ZONES.length === SAMPLES.length) {
            // Maybe 1:1 mapping?
            // sampleInfo = sampleMap[ZONES.indexOf(chk)]; 
            // Logic sometimes does one sample per zone.
        }

        if (!sampleInfo) return;

        const pitch = rootNote;
        const newFileName = `${sampleInfo.fileName.replace(/\.[^/.]+$/, "")}_${pitch}_v${minVel}.wav`;

        parsedZones.push({
            pitch, keyCenter: pitch, minvel: minVel, maxvel: maxVel,
            sampleName: sampleInfo.fileName,
            sourceFile: null,
            loop: loopOn, loopStart, loopEnd, newFileName
        });
    });

    return parsedZones;
}

function getString(view, offset, maxLength) {
    let str = "";
    for (let i = 0; i < maxLength && offset + i < view.byteLength; i++) {
        const code = view.getUint8(offset + i);
        if (code === 0) break;
        str += String.fromCharCode(code);
    }
    return str;
}
