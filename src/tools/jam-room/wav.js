// Write a 30-second mono WAV from a ring buffer of Float32 samples.

export function createRingBuffer(sampleRate, seconds = 30) {
  const length = Math.max(8, Math.floor(sampleRate * seconds));
  return { data: new Float32Array(length), write: 0, filled: 0, sampleRate, length };
}

export function pushSamples(ring, samples) {
  if (!ring || !samples?.length) return;
  for (let i = 0; i < samples.length; i++) {
    ring.data[ring.write] = samples[i];
    ring.write = (ring.write + 1) % ring.length;
    if (ring.filled < ring.length) ring.filled += 1;
  }
}

export function ringToWav(ring, filename) {
  const count = ring.filled;
  if (!count) return null;
  const start = ring.filled < ring.length ? 0 : ring.write;
  const pcm = new Int16Array(count);
  for (let i = 0; i < count; i++) {
    const s = Math.max(-1, Math.min(1, ring.data[(start + i) % ring.length] || 0));
    pcm[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  const bytes = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, ring.sampleRate, true);
  view.setUint32(28, ring.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, bytes, true);
  new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer));
  const stamp = formatStamp(new Date());
  const name = filename || `kyle-beck-jam-room-${stamp}.wav`;
  return { blob: new Blob([buffer], { type: 'audio/wav' }), name };
}

export function formatStamp(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}${m}${d}-${h}${min}`;
}

export function downloadBlob(blob, name, doc = globalThis.document) {
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
