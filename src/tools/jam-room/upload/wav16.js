// 16-bit mono WAV encode/decode for processed uploads.

import { MAX_PROCESSED_SECONDS } from './dsp.js';

export const MAX_WAV_SECONDS = MAX_PROCESSED_SECONDS + 0.05;
export const MAX_FMT_SIZE = 40;
export const MAX_WAV_CHUNKS = 64;

export function encodeWav16(samples, sampleRate) {
  const n = samples.length;
  const bytes = new ArrayBuffer(44 + n * 2);
  const view = new DataView(bytes);
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, n * 2, true);
  let offset = 44;
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(bytes);
}

export function decodeWav16(bytes) {
  const buf = bytes.buffer === undefined ? bytes : bytes;
  const view = new DataView(buf.buffer || buf, buf.byteOffset || 0, buf.byteLength || buf.length);
  if (view.byteLength < 44) throw new Error('wav too short');
  const riff = readStr(view, 0, 4);
  const wave = readStr(view, 8, 4);
  if (riff !== 'RIFF' || wave !== 'WAVE') throw new Error('not a wav file');
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  let format = 0;
  let dataOffset = 0;
  let dataBytes = 0;
  let chunks = 0;
  let sawFmt = false;
  while (offset + 8 <= view.byteLength) {
    if (++chunks > MAX_WAV_CHUNKS) throw new Error('invalid wav chunk');
    const id = readStr(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    const remaining = view.byteLength - dataStart;
    if (!Number.isFinite(size) || size < 0 || size > remaining) {
      throw new Error('invalid wav chunk');
    }
    if (id === 'fmt ') {
      if (size < 16 || size > MAX_FMT_SIZE) throw new Error('invalid wav format');
      format = view.getUint16(dataStart, true);
      channels = view.getUint16(dataStart + 2, true);
      sampleRate = view.getUint32(dataStart + 4, true);
      const byteRate = view.getUint32(dataStart + 8, true);
      const blockAlign = view.getUint16(dataStart + 12, true);
      bits = view.getUint16(dataStart + 14, true);
      if (format !== 1) throw new Error('expected 16-bit pcm wav');
      if (bits !== 16 || !Number.isFinite(channels) || channels < 1) {
        throw new Error('expected 16-bit pcm wav');
      }
      if (blockAlign !== channels * (bits / 8)) throw new Error('invalid wav format');
      if (byteRate !== sampleRate * blockAlign) throw new Error('invalid wav format');
      sawFmt = true;
    } else if (id === 'data') {
      if (!sawFmt) throw new Error('invalid wav format');
      dataOffset = dataStart;
      dataBytes = size;
      break;
    }
    let next = dataStart + size;
    if (size % 2 === 1) {
      if (next >= view.byteLength) throw new Error('invalid wav chunk');
      next += 1;
    }
    if (next <= offset || next > view.byteLength) throw new Error('invalid wav chunk');
    offset = next;
  }
  if (!dataOffset || bits !== 16 || format !== 1) throw new Error('expected 16-bit pcm wav');
  if (channels !== 1) throw new Error('expected mono wav');
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new Error('unsupported sample rate');
  }
  const remaining = view.byteLength - dataOffset;
  if (dataBytes > remaining) throw new Error('invalid wav chunk');
  const usable = Math.min(dataBytes, remaining) & ~1;
  if (usable < 2) throw new Error('wav too short');
  const count = usable / 2;
  const maxSamples = Math.floor(sampleRate * MAX_WAV_SECONDS);
  if (count > maxSamples) throw new Error('wav too long');
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = view.getInt16(dataOffset + i * 2, true) / 0x8000;
  }
  return { samples, sampleRate, channels, bits, durationMs: (count / sampleRate) * 1000 };
}

function writeStr(view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function readStr(view, offset, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}
