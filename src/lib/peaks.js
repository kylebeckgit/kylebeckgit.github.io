// Build-time waveform peaks. Reads 16-bit PCM WAV from public/ when a demo has a file;
// otherwise returns a flat placeholder so nothing pretends to be real audio.
import fs from 'node:fs';
import path from 'node:path';
export function peaks(file, n = 120) {
  if (file) {
    const fp = path.join(process.cwd(), 'public', file);
    if (fs.existsSync(fp) && fp.endsWith('.wav')) {
      const b = fs.readFileSync(fp);
      let o = 12, fmt, data;
      while (o < b.length - 8) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4);
        if (id === 'fmt ') fmt = { ch: b.readUInt16LE(o + 10), bits: b.readUInt16LE(o + 22) };
        if (id === 'data') { data = [o + 8, sz]; break; } o += 8 + sz + (sz & 1); }
      if (fmt && data && fmt.bits === 16) {
        const frames = Math.floor(data[1] / (2 * fmt.ch)), step = Math.max(1, Math.floor(frames / n)), out = [];
        for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step; j < Math.min(frames, (i + 1) * step); j += 4) { const v = Math.abs(b.readInt16LE(data[0] + j * 2 * fmt.ch)) / 32768; if (v > m) m = v; } out.push(+m.toFixed(3)); }
        const max = Math.max(...out, 0.001); return { real: true, values: out.map((v) => +(v / max).toFixed(3)) };
      }
    }
  }
  return { real: false, values: Array.from({ length: n }, () => 0.06) };
}
