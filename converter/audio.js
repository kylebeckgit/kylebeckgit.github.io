/* converter/audio.js */

/**
 * Audio processing and WAV encoding.
 */

async function processAudio(audioBuffer, settings) {
    const { targetRate, optimizeLoops, loopStart, loopEnd, loop } = settings;
    const originalRate = audioBuffer.sampleRate;

    // If targetRate is 0, keep original (no resampling)
    const destRate = (targetRate && targetRate > 0) ? targetRate : originalRate;

    let resultBuffer = audioBuffer;
    let resultLoopStart = loopStart;
    let resultLoopEnd = loopEnd;

    // Resample if needed
    if (destRate !== originalRate) {
        const ratio = destRate / originalRate;
        const newLength = Math.round(audioBuffer.length * ratio);

        const offlineCtx = new OfflineAudioContext(audioBuffer.numberOfChannels, newLength, destRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineCtx.destination);
        source.start(0);

        resultBuffer = await offlineCtx.startRendering();

        // Scale loop points
        if (loop) {
            resultLoopStart = Math.round(loopStart * ratio);
            resultLoopEnd = Math.round(loopEnd * ratio);
        }
    }

    // Optimize Loops (Click Reduction)
    if (loop && optimizeLoops && resultBuffer.numberOfChannels > 0) {
        // Logic from elmconv.py: minimize |samples[end] - samples[start]|
        // Search range +/- 5 samples
        const range = 5;
        let data = resultBuffer.getChannelData(0); // Use left channel for optimization
        const len = data.length;

        let bestStart = resultLoopStart;
        let bestEnd = resultLoopEnd;
        let minDiff = Infinity;

        // Keep bounds safe
        const sMin = Math.max(0, resultLoopStart - range);
        const sMax = Math.min(len - 1, resultLoopStart + range);
        const eMin = Math.max(0, resultLoopEnd - range);
        const eMax = Math.min(len - 1, resultLoopEnd + range);

        // Calculate current diff first
        if (resultLoopStart < len && resultLoopEnd < len) {
            minDiff = Math.abs(data[resultLoopEnd] - data[resultLoopStart]);
        }

        for (let s = sMin; s <= sMax; s++) {
            for (let e = eMin; e <= eMax; e++) {
                if (e <= s) continue;

                const diff = Math.abs(data[e] - data[s]);
                if (diff < minDiff) {
                    minDiff = diff;
                    bestStart = s;
                    bestEnd = e;
                }
            }
        }
        resultLoopStart = bestStart;
        resultLoopEnd = bestEnd;
    }

    return {
        buffer: resultBuffer,
        loopStart: resultLoopStart,
        loopEnd: resultLoopEnd
    };
}

function encodeWAV(audioBuffer, metadata) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16; // Converting to 16-bit for simplicity/compatibility (Source was 24-bit in Python, but 16 is fine for web)
    // If we want 24-bit, we need custom packing. 16-bit is easier with DataView.

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;

    const dataLength = audioBuffer.length * blockAlign;
    const bufferLength = 44 + dataLength; // Header + Data

    // smpl chunk size
    // 36 bytes header + 1 loop (24 bytes) = 60 bytes + 8 (ID/Size) = 68 bytes
    // Optional padding if odd
    const smplChunkSize = metadata.embedLoop ? 68 : 0;

    const arrayBuffer = new ArrayBuffer(bufferLength + smplChunkSize);
    const view = new DataView(arrayBuffer);

    /* RIFF chunk descriptor */
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength + smplChunkSize, true); // file size - 8
    writeString(view, 8, 'WAVE');

    /* fmt sub-chunk */
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, format, true); // AudioFormat
    view.setUint16(22, numChannels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, byteRate, true); // ByteRate
    view.setUint16(32, blockAlign, true); // BlockAlign
    view.setUint16(34, bitDepth, true); // BitsPerSample

    /* data sub-chunk */
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    // Write PCM samples
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
            let sample = audioBuffer.getChannelData(channel)[i];
            // Clip
            sample = Math.max(-1, Math.min(1, sample));
            // Scale to 16-bit
            sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, sample, true);
            offset += 2;
        }
    }

    // Write smpl chunk if requested
    if (metadata.embedLoop) {
        writeString(view, offset, 'smpl');
        view.setUint32(offset + 4, 60, true); // Size

        const note = metadata.note || 60;
        const period = Math.floor(1e9 / sampleRate);

        view.setUint32(offset + 8, 0, true); // Manufacturer
        view.setUint32(offset + 12, 0, true); // Product
        view.setUint32(offset + 16, period, true); // Sample Period
        view.setUint32(offset + 20, note, true); // Unity Note
        view.setUint32(offset + 24, 0, true); // Pitch Fraction
        view.setUint32(offset + 28, 0, true); // SMPTE Format
        view.setUint32(offset + 32, 0, true); // SMPTE Offset
        view.setUint32(offset + 36, 1, true); // Num Sample Loops
        view.setUint32(offset + 40, 0, true); // Sampler Data

        // Loop 1
        view.setUint32(offset + 44, 0, true); // Cue Point ID
        view.setUint32(offset + 48, 0, true); // Type (0=Forward)
        view.setUint32(offset + 52, metadata.loopStart || 0, true); // Start
        view.setUint32(offset + 56, metadata.loopEnd || 0, true); // End
        view.setUint32(offset + 60, 0, true); // Fraction
        view.setUint32(offset + 64, 0, true); // Play Count
    }

    return arrayBuffer;
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
