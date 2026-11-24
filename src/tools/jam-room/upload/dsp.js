// Browser and Node-safe DSP for jam-room uploads. Numbers follow
// /workspace/jam-room/upload-spec.md and are starting points.

export const MAX_RAW_SECONDS = 8;
export const MAX_PROCESSED_SECONDS = 4;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const TARGET_LUFS = -16;
export const TRUE_PEAK_DB = -1;
export const TRIM_DB = -50;
export const MIN_PEAK_DB = -45;
export const MIN_TRIMMED_MS = 50;
export const TARGET_RATE = 44100;

export function dbFromAmp(amp) {
  const a = Math.abs(Number(amp));
  if (!(a > 0)) return -Infinity;
  return 20 * Math.log10(a);
}

export function ampFromDb(db) {
  if (!Number.isFinite(db)) return 0;
  return 10 ** (db / 20);
}

export function peakAbs(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  return peak;
}

export function rms(samples, start = 0, end = samples.length) {
  const a = Math.max(0, start | 0);
  const b = Math.min(samples.length, end | 0);
  if (b <= a) return 0;
  let sum = 0;
  for (let i = a; i < b; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (b - a));
}

export function downmix(buffer) {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
  const length = buffer.length;
  const mix = new Float32Array(length);
  const channels = buffer.numberOfChannels;
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mix[i] += data[i] / channels;
  }
  return mix;
}

export function trimSilence(samples, sampleRate, cutoffDb = TRIM_DB) {
  const win = Math.max(1, Math.round(sampleRate * 0.01));
  const floor = ampFromDb(cutoffDb);
  let first = 0;
  while (first + win <= samples.length && rms(samples, first, first + win) < floor) first += win;
  let last = samples.length;
  while (last - win >= first && rms(samples, last - win, last) < floor) last -= win;
  const pre = Math.round(sampleRate * 0.005);
  const start = Math.max(0, first - pre);
  const cut = samples.slice(start, last);
  const fade = Math.min(cut.length, Math.round(sampleRate * 0.02));
  for (let i = 0; i < fade; i++) cut[cut.length - 1 - i] *= i / fade;
  return cut;
}

export function highPassAndDc(samples, sampleRate, cutoff = 40) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / sampleRate;
  const a = rc / (rc + dt);
  const out = new Float32Array(samples.length);
  let prevY = 0;
  let prevX = 0;
  let mean = 0;
  for (let i = 0; i < samples.length; i++) mean += samples[i];
  mean /= Math.max(1, samples.length);
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i] - mean;
    prevY = a * (prevY + x - prevX);
    prevX = x;
    out[i] = prevY;
  }
  return out;
}

export function normalizeAndLimit(samples, targetLufs = TARGET_LUFS, peakDb = TRUE_PEAK_DB) {
  const current = dbFromAmp(rms(samples));
  const gain = Number.isFinite(current) ? ampFromDb(targetLufs - current) : 1;
  const ceiling = ampFromDb(peakDb);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i] * gain;
    if (s > ceiling) s = ceiling;
    else if (s < -ceiling) s = -ceiling;
    out[i] = s;
  }
  return out;
}

export function clipCount(samples, db = -0.1) {
  const thresh = ampFromDb(db);
  let n = 0;
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) >= thresh) n++;
  return n;
}

export function zeroCrossingRate(samples) {
  if (samples.length < 2) return 0;
  let n = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) n++;
  }
  return n / (samples.length - 1);
}

export function maxAutocorr(samples, sampleRate, minHz = 60, maxHz = 1500) {
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(samples.length - 2, Math.floor(sampleRate / minHz));
  let energy = 0;
  for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
  if (energy < 1e-12) return { lag: 0, value: 0 };
  let best = 0;
  let bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const end = samples.length - lag;
    for (let i = 0; i < end; i++) sum += samples[i] * samples[i + lag];
    const v = sum / energy;
    if (v > best) {
      best = v;
      bestLag = lag;
    }
  }
  return { lag: bestLag, value: best };
}

export function isNearSilence(samples, sampleRate) {
  const durationMs = (samples.length / sampleRate) * 1000;
  if (durationMs < MIN_TRIMMED_MS) return true;
  return dbFromAmp(peakAbs(samples)) < MIN_PEAK_DB;
}

// Pure noise: almost no tonal peak and a very high zero-crossing rate.
export function isPureNoise(samples, sampleRate) {
  const peak = maxAutocorr(samples, sampleRate);
  const zcr = zeroCrossingRate(samples);
  const crest = dbFromAmp(peakAbs(samples)) - dbFromAmp(rms(samples));
  return peak.value < 0.2 && zcr > 0.25 && crest < 6;
}

export function yinFrame(samples, sampleRate, { threshold = 0.12, minHz = 60, maxHz = 1500 } = {}) {
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(Math.floor(samples.length / 2) - 1, Math.floor(sampleRate / minHz));
  if (maxLag <= minLag) return { f0: 0, confidence: 0 };
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0;
    const n = samples.length - tau;
    for (let i = 0; i < n; i++) {
      const diff = samples[i] - samples[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  const cmndf = new Float32Array(maxLag + 1);
  cmndf[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    running += d[tau];
    cmndf[tau] = d[tau] * tau / Math.max(1e-12, running);
  }
  let tau = minLag;
  for (; tau <= maxLag; tau++) {
    if (cmndf[tau] < threshold) {
      while (tau + 1 <= maxLag && cmndf[tau + 1] < cmndf[tau]) tau++;
      break;
    }
  }
  if (tau >= maxLag || cmndf[tau] >= threshold) return { f0: 0, confidence: 0 };
  const s0 = cmndf[tau - 1] ?? cmndf[tau];
  const s1 = cmndf[tau];
  const s2 = cmndf[tau + 1] ?? cmndf[tau];
  const denom = 2 * s1 - s2 - s0;
  const refined = tau + (denom ? (s0 - s2) / (2 * denom) : 0);
  return { f0: sampleRate / refined, confidence: Math.max(0, Math.min(1, 1 - s1)) };
}

export function analyzePitchYin(samples, sampleRate) {
  const frame = Math.max(1, Math.round(sampleRate * 0.04));
  const hop = Math.max(1, Math.round(sampleRate * 0.01));
  if (!samples?.length || samples.length < frame) return { pitched: false, f0Hz: null, frames: 0, confident: 0 };
  const results = [];
  for (let start = 0; start + frame <= samples.length; start += hop) {
    results.push(yinFrame(samples.subarray(start, start + frame), sampleRate));
  }
  const isConf = (r) => r.confidence > 0.8 && r.f0 >= 60 && r.f0 <= 1500;
  const windowFrames = Math.max(1, Math.round((sampleRate * 0.5 - frame) / hop) + 1);
  let bestStart = 0;
  let bestCount = -1;
  for (let i = 0; i < results.length; i++) {
    const end = Math.min(results.length, i + windowFrames);
    let count = 0;
    for (let j = i; j < end; j++) if (isConf(results[j])) count++;
    if (count > bestCount) {
      bestCount = count;
      bestStart = i;
    }
  }
  const window = results.slice(bestStart, bestStart + windowFrames);
  const confident = window.filter(isConf).map((r) => r.f0);
  const pitched = confident.length >= 0.6 * Math.max(1, window.length);
  const sorted = confident.slice().sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  return { pitched, f0Hz: pitched ? median : null, frames: results.length, confident: confident.length };
}

export function spectralCentroid(frame, sampleRate) {
  let num = 0;
  let den = 0;
  const n = frame.length;
  // Real DFT magnitude, skip DC.
  for (let k = 1; k < n / 2; k++) {
    let re = 0;
    let im = 0;
    const w = 2 * Math.PI * k / n;
    for (let i = 0; i < n; i++) {
      re += frame[i] * Math.cos(w * i);
      im -= frame[i] * Math.sin(w * i);
    }
    const mag = Math.hypot(re, im);
    const hz = k * sampleRate / n;
    num += hz * mag;
    den += mag;
  }
  return den > 0 ? num / den : 0;
}

export function detectOnsets(samples, sampleRate) {
  const size = 1024;
  const hop = 256;
  const fluxes = [];
  let prev = new Float32Array(size / 2);
  for (let start = 0; start + size <= samples.length; start += hop) {
    const frame = samples.subarray(start, start + size);
    const mag = new Float32Array(size / 2);
    for (let k = 1; k < size / 2; k++) {
      let re = 0;
      let im = 0;
      const w = 2 * Math.PI * k / size;
      for (let i = 0; i < size; i++) {
        re += frame[i] * Math.cos(w * i);
        im -= frame[i] * Math.sin(w * i);
      }
      mag[k] = Math.hypot(re, im);
    }
    let flux = 0;
    for (let k = 1; k < mag.length; k++) flux += Math.max(0, mag[k] - prev[k]);
    fluxes.push({ at: start / sampleRate, flux });
    prev = mag;
  }
  const onsets = [];
  const minGap = 0.06;
  for (let i = 0; i < fluxes.length; i++) {
    const window = fluxes.slice(Math.max(0, i - 10), i).map((f) => f.flux);
    const median = window.length ? window.slice().sort((a, b) => a - b)[Math.floor(window.length / 2)] : 0;
    const thresh = median * 1.5 + 1e-4;
    if (fluxes[i].flux >= thresh) {
      const t = fluxes[i].at;
      if (!onsets.length || t - onsets[onsets.length - 1] >= minGap) onsets.push(t);
    }
  }
  if (!onsets.length) onsets.push(0);
  return onsets;
}

export function sliceHits(samples, sampleRate, onsets, maxHits = 8) {
  const hits = [];
  const used = onsets.slice(0, maxHits);
  for (let i = 0; i < used.length; i++) {
    const start = Math.floor(used[i] * sampleRate);
    const maxEnd = Math.min(samples.length, start + Math.round(sampleRate * 0.5));
    const next = i + 1 < used.length ? Math.floor(used[i + 1] * sampleRate) : maxEnd;
    const end = Math.min(maxEnd, next);
    const slice = samples.slice(start, Math.max(start + 1, end));
    const fade = Math.min(slice.length, Math.round(sampleRate * 0.005));
    for (let f = 0; f < fade; f++) {
      slice[f] *= f / fade;
      slice[slice.length - 1 - f] *= f / fade;
    }
    const frame = slice.subarray(0, Math.min(slice.length, 1024));
    hits.push({
      startMs: (start / sampleRate) * 1000,
      endMs: (end / sampleRate) * 1000,
      centroid: spectralCentroid(frame, sampleRate),
      samples: slice,
    });
  }
  const byCentroid = hits.slice().sort((a, b) => a.centroid - b.centroid);
  for (const hit of hits) {
    if (hit === byCentroid[0]) hit.slot = 'kick';
    else if (hit === byCentroid[byCentroid.length - 1]) hit.slot = 'hat';
    else hit.slot = 'snare';
  }
  return hits;
}

export function hzToMidi(hz) {
  if (!(hz > 0)) return 0;
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function centsBetween(fromHz, toHz) {
  if (!(fromHz > 0) || !(toHz > 0)) return 0;
  return 1200 * Math.log2(toHz / fromHz);
}

export function resample(samples, fromRate, toRate) {
  if (!samples || !samples.length) return samples || new Float32Array(0);
  const from = Number(fromRate);
  const to = Number(toRate);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) return samples;
  if (from === to) return samples;
  const outLength = Math.max(1, Math.round(samples.length * to / from));
  if (outLength === samples.length) return samples;
  const out = new Float32Array(outLength);
  if (outLength === 1) {
    out[0] = samples[0];
    return out;
  }
  const scale = (samples.length - 1) / (outLength - 1);
  for (let i = 0; i < outLength; i++) {
    const x = i * scale;
    const i0 = Math.floor(x);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const frac = x - i0;
    out[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
  }
  return out;
}

export function shiftSamples(samples, rate) {
  const r = Number(rate);
  if (!samples?.length || !Number.isFinite(r) || r <= 0 || Math.abs(r - 1) < 1e-4) return samples;
  return resample(samples, r, 1);
}
