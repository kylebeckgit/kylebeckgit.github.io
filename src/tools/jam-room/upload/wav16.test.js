import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeWav16,
  encodeWav16,
  MAX_FMT_SIZE,
  MAX_WAV_CHUNKS,
  MAX_WAV_SECONDS,
} from './wav16.js';

function tone(seconds, sampleRate, hz = 440, amp = 0.4) {
  const n = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = Math.sin((2 * Math.PI * hz * i) / sampleRate) * amp;
  return samples;
}

function writeStr(view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function buildWav({
  sampleRate = 44100,
  samples,
  dataBytes,
  fmtSize = 16,
  channels = 1,
  bits = 16,
  format = 1,
  byteRate,
  blockAlign,
  extraBeforeData,
  filePad = 0,
} = {}) {
  const pcm = samples || new Float32Array(32);
  const pcmBytes = pcm.length * 2;
  const declaredData = dataBytes == null ? pcmBytes : dataBytes;
  let extras = 0;
  if (extraBeforeData) extras = extraBeforeData.length;
  const bytes = new Uint8Array(44 + extras + pcmBytes + filePad);
  const view = new DataView(bytes.buffer);
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, fmtSize, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate ?? sampleRate * channels * (bits / 8), true);
  view.setUint16(32, blockAlign ?? channels * (bits / 8), true);
  view.setUint16(34, bits, true);
  let offset = 20 + Math.max(16, Math.min(fmtSize, 16));
  if (fmtSize > 16 && 20 + fmtSize <= bytes.byteLength) {
    offset = 20 + fmtSize;
  } else {
    offset = 36;
  }
  if (extraBeforeData) {
    bytes.set(extraBeforeData, 36);
    offset = 36 + extraBeforeData.length;
  }
  writeStr(view, offset, 'data');
  view.setUint32(offset + 4, declaredData, true);
  offset += 8;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    if (offset + 2 <= bytes.byteLength) {
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    offset += 2;
  }
  return bytes;
}

function junkChunk(id, size, pad = true) {
  const body = size + (pad && size % 2 === 1 ? 1 : 0);
  const bytes = new Uint8Array(8 + body);
  const view = new DataView(bytes.buffer);
  writeStr(view, 0, id);
  view.setUint32(4, size, true);
  return bytes;
}

describe('decodeWav16 hardening', () => {
  it('round-trips 16-bit mono pcm, including 96 kHz', () => {
    for (const rate of [44100, 96000]) {
      const samples = tone(0.2, rate);
      const decoded = decodeWav16(encodeWav16(samples, rate));
      assert.equal(decoded.sampleRate, rate);
      assert.equal(decoded.channels, 1);
      assert.equal(decoded.bits, 16);
      assert.equal(decoded.samples.length, samples.length);
      assert.ok(Math.abs(decoded.samples[10] - samples[10]) < 0.0001);
    }
  });

  it('rejects a huge declared data size without allocating from it', () => {
    const wav = encodeWav16(tone(0.05, 44100), 44100);
    const copy = new Uint8Array(wav);
    new DataView(copy.buffer, copy.byteOffset, copy.byteLength).setUint32(40, 0xffffffff, true);
    const before = process.memoryUsage().heapUsed;
    assert.throws(() => decodeWav16(copy), /invalid wav chunk|wav too long|expected/);
    const after = process.memoryUsage().heapUsed;
    assert.ok(after - before < 16 * 1024 * 1024, `decoder allocated too much: ${after - before} bytes`);
  });

  it('rejects a data chunk larger than the remaining bytes', () => {
    const wav = buildWav({ samples: tone(0.02, 8000), sampleRate: 8000, dataBytes: 8000 * 2 });
    assert.throws(() => decodeWav16(wav), /invalid wav chunk/);
  });

  it('rejects a zero or huge fmt size', () => {
    const base = encodeWav16(tone(0.05, 44100), 44100);
    const zero = new Uint8Array(base);
    new DataView(zero.buffer).setUint32(16, 0, true);
    assert.throws(() => decodeWav16(zero), /invalid wav format|invalid wav chunk/);
    const huge = new Uint8Array(base);
    new DataView(huge.buffer).setUint32(16, 0xffffffff, true);
    assert.throws(() => decodeWav16(huge), /invalid wav format|invalid wav chunk/);
    const overMax = buildWav({ fmtSize: MAX_FMT_SIZE + 1, samples: tone(0.05, 44100) });
    assert.throws(() => decodeWav16(overMax), /invalid wav format|invalid wav chunk/);
  });

  it('walks odd-size padded chunks and rejects a missing pad that runs off the file', () => {
    const samples = tone(0.05, 8000);
    const odd = junkChunk('JUNK', 1, true);
    const ok = buildWav({ samples, sampleRate: 8000, extraBeforeData: odd });
    const decoded = decodeWav16(ok);
    assert.equal(decoded.sampleRate, 8000);
    assert.equal(decoded.samples.length, samples.length);

    const noPad = junkChunk('JUNK', 1, false);
    const clipped = buildWav({ samples, sampleRate: 8000, extraBeforeData: noPad });
    // Drop the pad that would have sat after the 1-byte junk, leaving data misaligned
    // and the odd chunk flush against EOF if we truncate after junk.
    const truncated = clipped.subarray(0, 36 + noPad.length);
    assert.throws(() => decodeWav16(truncated), /invalid wav chunk|expected|wav too short|not a wav/);
  });

  it('rejects inconsistent format headers', () => {
    assert.throws(() => decodeWav16(buildWav({ channels: 2, samples: tone(0.05, 44100) })), /mono|invalid wav format|expected/);
    assert.throws(() => decodeWav16(buildWav({ bits: 8, byteRate: 44100, blockAlign: 1, samples: tone(0.05, 44100) })), /expected 16-bit/);
    assert.throws(() => decodeWav16(buildWav({ format: 3, samples: tone(0.05, 44100) })), /expected 16-bit/);
    assert.throws(() => decodeWav16(buildWav({ blockAlign: 4, samples: tone(0.05, 44100) })), /invalid wav format/);
    assert.throws(() => decodeWav16(buildWav({ byteRate: 1, samples: tone(0.05, 44100) })), /invalid wav format/);
  });

  it('enforces max samples (rate times max seconds) before allocating', () => {
    const rate = 8000;
    const maxSamples = Math.floor(rate * MAX_WAV_SECONDS);
    const over = encodeWav16(new Float32Array(maxSamples + 1), rate);
    const before = process.memoryUsage().heapUsed;
    assert.throws(() => decodeWav16(over), /wav too long/);
    const after = process.memoryUsage().heapUsed;
    assert.ok(after - before < 8 * 1024 * 1024, `decoder allocated too much: ${after - before} bytes`);
    const fit = encodeWav16(new Float32Array(Math.floor(rate * MAX_PROCESSED_SECONDS_SAFE())), rate);
    const decoded = decodeWav16(fit);
    assert.equal(decoded.sampleRate, rate);
    assert.equal(decoded.samples.length, Math.floor(rate * MAX_PROCESSED_SECONDS_SAFE()));
  });

  it('rejects too many chunks and truncated headers', () => {
    const junks = [];
    for (let i = 0; i < MAX_WAV_CHUNKS + 2; i++) junks.push(...junkChunk('JUNK', 0, false));
    const many = buildWav({
      samples: tone(0.05, 8000),
      sampleRate: 8000,
      extraBeforeData: Uint8Array.from(junks),
    });
    assert.throws(() => decodeWav16(many), /invalid wav chunk/);
    const short = encodeWav16(tone(0.05, 44100), 44100).subarray(0, 20);
    assert.throws(() => decodeWav16(short), /wav too short/);
    const midChunk = encodeWav16(tone(0.05, 44100), 44100).subarray(0, 40);
    assert.throws(() => decodeWav16(midChunk), /invalid wav chunk|expected|wav too short/);
  });
});

function MAX_PROCESSED_SECONDS_SAFE() {
  return 4;
}
