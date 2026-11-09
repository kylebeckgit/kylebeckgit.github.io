// Browser-side partial analysis. Nothing here is uploaded.
// Frequencies use a long FFT and parabolic interpolation.
// Decay is a T60 fit, the same unit as the Decay column.

function fft(real, imag) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = real[i];
      real[i] = real[j];
      real[j] = tr;
      const ti = imag[i];
      imag[i] = imag[j];
      imag[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const uRe = real[i + j];
        const uIm = imag[i + j];
        const vRe = real[i + j + half] * wRe - imag[i + j + half] * wIm;
        const vIm = real[i + j + half] * wIm + imag[i + j + half] * wRe;
        real[i + j] = uRe + vRe;
        imag[i + j] = uIm + vIm;
        real[i + j + half] = uRe - vRe;
        imag[i + j + half] = uIm - vIm;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
}

function hann(real, length) {
  if (length < 2) return;
  for (let i = 0; i < length; i++) {
    real[i] *= 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1));
  }
}

function parabola(left, mid, right) {
  const denom = left - 2 * mid + right;
  if (!(Math.abs(denom) > 1e-18)) return { delta: 0, value: mid };
  const delta = Math.max(-0.6, Math.min(0.6, (0.5 * (left - right)) / denom));
  return { delta, value: mid - 0.25 * (left - right) * delta };
}

function nextPow2(value) {
  let n = 1;
  while (n < value) n <<= 1;
  return n;
}

function magnitudeSpectrum(samples, fftSize) {
  const real = new Float64Array(fftSize);
  const imag = new Float64Array(fftSize);
  const length = Math.min(samples.length, fftSize);
  for (let i = 0; i < length; i++) real[i] = samples[i];
  hann(real, length);
  fft(real, imag);
  const bins = fftSize >> 1;
  const mag = new Float64Array(bins);
  for (let k = 0; k < bins; k++) mag[k] = Math.hypot(real[k], imag[k]);
  return mag;
}

function detectFundamental(samples, sampleRate) {
  const tauMin = Math.max(2, Math.floor(sampleRate / 1200));
  const tauMax = Math.min(samples.length - 8, Math.floor(sampleRate / 40));
  const width = Math.min(samples.length - tauMax - 1, Math.floor(sampleRate * 0.2));
  if (width < 256 || tauMax <= tauMin) return null;
  const diff = new Float64Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < width; i++) {
      const delta = samples[i] - samples[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }
  const cmnd = new Float64Array(tauMax + 2);
  let running = 0;
  let bestTau = tauMin;
  let best = Infinity;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += diff[tau];
    const value = running > 0 ? (diff[tau] * tau) / running : 1;
    cmnd[tau] = value;
    if (tau >= tauMin && value < best) {
      best = value;
      bestTau = tau;
    }
    if (tau >= tauMin && value < 0.12) {
      return sampleRate / refineLagFrom(cmnd, tau);
    }
  }
  if (!(best < 0.5)) return null;
  return sampleRate / refineLagFrom(cmnd, bestTau);
}

function refineLagFrom(values, tau) {
  const left = values[tau - 1] ?? values[tau];
  const mid = values[tau];
  const right = values[tau + 1] ?? values[tau];
  return tau + parabola(left, mid, right).delta;
}

function localPeaks(mag, sampleRate, fftSize) {
  const peaks = [];
  const minBin = Math.max(2, Math.floor((30 * fftSize) / sampleRate));
  const maxBin = Math.min(mag.length - 2, Math.floor((sampleRate * 0.45 * fftSize) / sampleRate));
  for (let k = minBin; k <= maxBin; k++) {
    if (mag[k] < mag[k - 1] || mag[k] < mag[k + 1]) continue;
    const dbL = mag[k - 1] > 0 ? 20 * Math.log10(mag[k - 1]) : -240;
    const dbM = mag[k] > 0 ? 20 * Math.log10(mag[k]) : -240;
    const dbR = mag[k + 1] > 0 ? 20 * Math.log10(mag[k + 1]) : -240;
    const fit = parabola(dbL, dbM, dbR);
    const freq = ((k + fit.delta) * sampleRate) / fftSize;
    const amp = 10 ** (fit.value / 20);
    if (freq > 30 && amp > 0) peaks.push({ freq, amp });
  }
  peaks.sort((a, b) => b.amp - a.amp);
  return peaks;
}

const NOTE_SEMIS = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function parseRoot(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const hz = Number(raw.replace(/hz/i, '').trim());
  if (Number.isFinite(hz) && hz >= 20 && hz <= 5000 && !/[a-z]/i.test(raw.replace(/hz/i, ''))) return hz;
  const match = /^([A-Ga-g])([#b♯♭])?(-?\d)$/.exec(raw.replace(/\s+/g, ''));
  if (!match) return null;
  let semi = NOTE_SEMIS[match[1].toUpperCase()];
  if (match[2] === '#' || match[2] === '♯') semi += 1;
  if (match[2] === 'b' || match[2] === '♭') semi -= 1;
  const octave = Number(match[3]);
  const freq = 440 * 2 ** ((semi + (octave - 4) * 12) / 12);
  return freq >= 20 && freq <= 5000 ? freq : null;
}

export function frequencyToNote(hz) {
  if (!(hz > 0)) return '';
  const semisFromC4 = Math.round(12 * Math.log2(hz / 261.6255653005986));
  const name = NOTE_NAMES[((semisFromC4 % 12) + 12) % 12];
  const octave = 4 + Math.floor(semisFromC4 / 12);
  return `${name}${octave}`;
}

function peakNear(peaks, freq) {
  let best = null;
  let error = 0.045;
  for (const peak of peaks) {
    const rel = Math.abs(peak.freq - freq) / freq;
    if (rel < error) {
      error = rel;
      best = peak;
    }
  }
  return best;
}

function explainCandidate(f0, peaks) {
  let matched = 0;
  let possible = 0;
  let rootAmp = 0;
  let onsetAtRoot = 0;
  for (const peak of peaks) {
    const weight = peak.amp * (0.4 + 0.6 * (peak.onset ?? 1));
    possible += weight;
    const ratio = peak.freq / f0;
    const harmonic = Math.round(ratio);
    if (harmonic < 1 || harmonic > 48) continue;
    const tol = Math.min(0.05, 0.03 + 0.0015 * harmonic);
    if (Math.abs(ratio - harmonic) / harmonic <= tol) matched += weight;
    if (Math.abs(ratio - 1) <= 0.04) {
      rootAmp = Math.max(rootAmp, peak.amp);
      onsetAtRoot = Math.max(onsetAtRoot, peak.onset ?? 1);
    }
  }
  return { matched, possible, rootAmp, onsetAtRoot, coverage: possible > 0 ? matched / possible : 0 };
}

function candidateValue(f0, peaks, strongest) {
  const explained = explainCandidate(f0, peaks);
  const octaveUp = peakNear(peaks, f0 * 2);
  const third = peakNear(peaks, f0 * 3);
  const fourth = peakNear(peaks, f0 * 4);
  let factor = 1;
  // A quiet partial an octave under a much stronger one is the hum, not the strike.
  if (explained.rootAmp > 0 && octaveUp && octaveUp.amp > explained.rootAmp * 2.2 && octaveUp.amp >= strongest * 0.45) {
    factor = 0.38;
  } else if (explained.rootAmp === 0) {
    const evenOnly = octaveUp && fourth && !third;
    if (evenOnly || !octaveUp) factor = 0.2;
    else factor = 1.08;
  }
  const onset = 0.75 + 0.25 * explained.onsetAtRoot;
  return { ...explained, value: explained.matched * factor * onset, f0 };
}

export function selectRoot(peaks) {
  if (!peaks?.length) return null;
  const strongest = peaks[0].amp || 1;
  const strong = peaks.filter((peak) => peak.amp >= strongest * 0.1 && peak.freq >= 30 && peak.freq <= 2500);
  const lows = [...strong].sort((a, b) => a.freq - b.freq).slice(0, 8);
  const candidates = new Set();
  for (const peak of lows) {
    candidates.add(peak.freq);
    if (peak.freq / 2 >= 30) candidates.add(peak.freq / 2);
    if (peak.freq * 2 <= 4000) candidates.add(peak.freq * 2);
  }
  if (peaks.yin) {
    candidates.add(peaks.yin);
    if (peaks.yin / 2 >= 30) candidates.add(peaks.yin / 2);
    if (peaks.yin * 2 <= 4000) candidates.add(peaks.yin * 2);
  }
  const ranked = [];
  for (const f0 of candidates) {
    if (!(f0 >= 30 && f0 <= 2000)) continue;
    const scored = candidateValue(f0, peaks.slice(0, 20), strongest);
    const snapped = peakNear(peaks, f0);
    scored.f0 = snapped && Math.abs(snapped.freq - f0) / f0 < 0.04 ? snapped.freq : f0;
    ranked.push(scored);
  }
  ranked.sort((a, b) => b.value - a.value);
  const best = ranked[0];
  if (!best) return { hz: peaks[0].freq, confidence: 'low' };
  const lowestReal = lows[0]?.freq || peaks[0].freq;
  const missing = ranked.find((item) => (
    item.rootAmp <= 0
    && Math.abs(item.f0 * 2 - lowestReal) / lowestReal < 0.04
    && peakNear(peaks, item.f0 * 3)
    && item.coverage > 0.55
  ));
  if (missing && (best.rootAmp < strongest * 0.2 || missing.value >= best.value * 0.85)) {
    return { hz: missing.f0, confidence: missing.coverage > 0.75 ? 'high' : 'medium' };
  }
  const missingStack = best.rootAmp <= 0 && peakNear(peaks, best.f0 * 2) && peakNear(peaks, best.f0 * 3);
  if (best.rootAmp < strongest * 0.2 && !missingStack) {
    const loud = peaks.filter((peak) => peak.amp >= strongest * 0.4 && peak.freq <= 2000);
    loud.sort((a, b) => a.freq - b.freq);
    return { hz: (loud[0] || peaks[0]).freq, confidence: 'medium' };
  }
  if (best.coverage < 0.32 && !missingStack) {
    const loud = peaks.filter((peak) => peak.amp >= strongest * 0.45 && peak.freq <= 2000);
    loud.sort((a, b) => (b.onset ?? 1) - (a.onset ?? 1) || a.freq - b.freq);
    const low = [...loud].sort((a, b) => a.freq - b.freq)[0];
    return { hz: (low || peaks[0]).freq, confidence: 'low' };
  }
  const up = candidateValue(best.f0 * 2, peaks.slice(0, 20), strongest);
  const down = best.f0 / 2 >= 30 ? candidateValue(best.f0 / 2, peaks.slice(0, 20), strongest) : null;
  let hz = best.f0;
  let margin = best.value / Math.max(up.value, down?.value || 0, 1e-9);
  const upPeak = peakNear(peaks, best.f0 * 2);
  const here = peakNear(peaks, best.f0);
  if (here && upPeak && upPeak.amp > here.amp * 2.2 && upPeak.amp >= strongest * 0.45 && up.value > best.value * 0.45) {
    hz = upPeak.freq;
    margin = up.value / Math.max(best.value, 1e-9);
  } else if (down && !(here && here.amp > (peakNear(peaks, best.f0 / 2)?.amp || 0) * 2)) {
    margin = best.value / Math.max(down.value, up.value, 1e-9);
  }
  const confidence = margin > 1.3 && best.coverage > 0.4 ? 'high' : margin > 1.08 ? 'medium' : 'low';
  return { hz, confidence };
}

function chooseFundamental(samples, sampleRate, peaks, requested) {
  const set = typeof requested === 'number' ? requested : parseRoot(requested);
  if (Number.isFinite(set) && set >= 20 && set <= 5000) {
    return { hz: set, confidence: 'set' };
  }
  const yin = detectFundamental(samples, sampleRate);
  peaks.yin = yin || 0;
  return selectRoot(peaks);
}

function keepPeaks(peaks, fundamental, thresholdDb, maxCount) {
  if (!peaks.length || !(fundamental > 0)) return [];
  const strongest = peaks[0].amp;
  const floor = strongest * 10 ** (-Math.abs(thresholdDb) / 20);
  const spacing = Math.max(10, fundamental * 0.045);
  const kept = [];
  for (const peak of peaks) {
    if (peak.amp < floor) continue;
    if (kept.some((item) => Math.abs(item.freq - peak.freq) < spacing)) continue;
    kept.push(peak);
    if (kept.length >= maxCount) break;
  }
  kept.sort((a, b) => a.freq - b.freq);
  return kept;
}

function amplitudeAt(mag, freq, sampleRate, fftSize) {
  const bin = (freq * fftSize) / sampleRate;
  const k = Math.round(bin);
  if (k < 1 || k >= mag.length - 1) return 0;
  const dbL = mag[k - 1] > 0 ? 20 * Math.log10(mag[k - 1]) : -240;
  const dbM = mag[k] > 0 ? 20 * Math.log10(mag[k]) : -240;
  const dbR = mag[k + 1] > 0 ? 20 * Math.log10(mag[k + 1]) : -240;
  return 10 ** (parabola(dbL, dbM, dbR).value / 20);
}

function fitT60(times, amps) {
  let max = 0;
  for (const amp of amps) if (amp > max) max = amp;
  if (!(max > 0)) return null;
  const floor = max * 0.03;
  let n = 0;
  let sumT = 0;
  let sumL = 0;
  let sumTT = 0;
  let sumTL = 0;
  for (let i = 0; i < times.length; i++) {
    if (!(amps[i] > floor)) continue;
    const t = times[i];
    const logAmp = Math.log(amps[i]);
    n += 1;
    sumT += t;
    sumL += logAmp;
    sumTT += t * t;
    sumTL += t * logAmp;
  }
  if (n < 4) return null;
  const denom = n * sumTT - sumT * sumT;
  if (!(Math.abs(denom) > 1e-9)) return null;
  const slope = (n * sumTL - sumT * sumL) / denom;
  if (!(slope < -0.05)) return null;
  const tau = -1 / slope;
  const t60 = tau * Math.log(1000);
  if (!(t60 > 0.03 && t60 < 40)) return null;
  return t60;
}

export function analyzeSamples(samples, sampleRate, options = {}) {
  if (!samples?.length || !(sampleRate > 0)) {
    throw new Error('That recording is empty.');
  }
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (!(peak > 1e-5)) throw new Error('That recording is silent.');
  const usable = samples.length > sampleRate * 12 ? samples.subarray(0, Math.floor(sampleRate * 12)) : samples;
  const freqLength = Math.min(usable.length, Math.floor(sampleRate * 1.2));
  const freqSamples = usable.subarray(0, freqLength);
  const fftSize = Math.min(131072, nextPow2(Math.max(16384, freqLength)));
  const mag = magnitudeSpectrum(freqSamples, fftSize);
  const peaks = localPeaks(mag, sampleRate, fftSize);
  if (!peaks.length) throw new Error('No spectral peaks were found.');
  attachOnset(peaks, usable, sampleRate);
  const chosen = chooseFundamental(usable, sampleRate, peaks, options.fundamental);
  const fundamental = chosen?.hz;
  if (!(fundamental > 0)) throw new Error('Set the fundamental and try again.');
  const threshold = Number.isFinite(Number(options.thresholdDb)) ? Number(options.thresholdDb) : 40;
  const maxCount = Math.min(64, Math.max(1, Math.trunc(Number(options.maxPartials) || 64)));
  const kept = keepPeaks(peaks, fundamental, threshold, maxCount);
  if (!kept.length) throw new Error('No partials are above the threshold.');

  const frame = 4096;
  const hop = 1024;
  const frames = [];
  for (let start = 0; start + frame <= usable.length && frames.length < 180; start += hop) {
    const slice = usable.subarray(start, start + frame);
    frames.push({
      time: (start + frame / 2) / sampleRate,
      mag: magnitudeSpectrum(slice, frame),
    });
  }
  const tracks = kept.map(() => ({ times: [], amps: [] }));
  for (const frameData of frames) {
    for (let i = 0; i < kept.length; i++) {
      tracks[i].times.push(frameData.time);
      tracks[i].amps.push(amplitudeAt(frameData.mag, kept[i].freq, sampleRate, frame));
    }
  }
  const fitted = kept.map((peak, index) => fitT60(tracks[index].times, tracks[index].amps));
  const fallback = fitted.filter((value) => value).sort((a, b) => a - b)[Math.floor(fitted.filter(Boolean).length / 2)] || 1.2;
  const strongest = Math.max(...kept.map((peak) => peak.amp));
  const partials = kept.map((peak, index) => ({
    ratio: peak.freq / fundamental,
    gainDb: 20 * Math.log10(peak.amp / strongest),
    decay: fitted[index] || fallback,
  }));
  return {
    fundamental,
    confidence: chosen.confidence,
    note: frequencyToNote(fundamental),
    partials,
    usedFallbackDecay: fitted.some((value) => !value),
  };
}

function attachOnset(peaks, samples, sampleRate) {
  const length = Math.min(samples.length, Math.max(2048, Math.floor(sampleRate * 0.08)));
  const fftSize = nextPow2(length);
  const early = magnitudeSpectrum(samples.subarray(0, length), fftSize);
  let maxRatio = 0;
  for (const peak of peaks) {
    const earlyAmp = amplitudeAt(early, peak.freq, sampleRate, fftSize);
    peak.onset = earlyAmp / (peak.amp + 1e-12);
    if (peak.onset > maxRatio) maxRatio = peak.onset;
  }
  if (maxRatio > 0) {
    for (const peak of peaks) peak.onset = Math.min(1, peak.onset / maxRatio);
  }
}

export function estimateRoot(samples, sampleRate) {
  const result = analyzeSamples(samples, sampleRate, { maxPartials: 16, thresholdDb: 50 });
  return { hz: result.fundamental, note: result.note, confidence: result.confidence };
}

function mixToMono(audioBuffer) {
  const length = audioBuffer.length;
  const channels = audioBuffer.numberOfChannels;
  const mono = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i] / channels;
  }
  return { sampleRate: audioBuffer.sampleRate, samples: mono };
}

function readFourcc(view, offset) {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

function decodeAiff(buffer) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12 || readFourcc(view, 0) !== 'FORM') return null;
  const kind = readFourcc(view, 8);
  if (kind !== 'AIFF' && kind !== 'AIFC') return null;
  let offset = 12;
  let channels = 0;
  let frames = 0;
  let bits = 0;
  let sampleRate = 0;
  let ssnd = null;
  while (offset + 8 <= view.byteLength) {
    const id = readFourcc(view, offset);
    const size = view.getUint32(offset + 4, false);
    const start = offset + 8;
    if (id === 'COMM' && start + 18 <= view.byteLength) {
      channels = view.getUint16(start, false);
      frames = view.getUint32(start + 2, false);
      bits = view.getUint16(start + 6, false);
      sampleRate = readFloat80(view, start + 8);
    } else if (id === 'SSND') {
      const dataOffset = view.getUint32(start, false);
      ssnd = start + 8 + dataOffset;
    }
    offset = start + size + (size % 2);
  }
  if (!ssnd || channels < 1 || frames < 1 || !(sampleRate > 0)) return null;
  if (bits !== 16 && bits !== 24) return null;
  const bytesPer = bits / 8;
  const samples = new Float32Array(frames);
  const scale = bits === 16 ? 32768 : 8388608;
  for (let i = 0; i < frames; i++) {
    let mixed = 0;
    for (let c = 0; c < channels; c++) {
      const at = ssnd + (i * channels + c) * bytesPer;
      if (at + bytesPer > view.byteLength) break;
      let value = 0;
      if (bits === 16) value = view.getInt16(at, false);
      else value = (view.getUint8(at) << 16) | (view.getUint8(at + 1) << 8) | view.getUint8(at + 2);
      if (bits === 24 && value & 0x800000) value |= ~0xffffff;
      mixed += value / scale;
    }
    samples[i] = mixed / channels;
  }
  return { sampleRate, samples };
}

function readFloat80(view, offset) {
  const exponent = ((view.getUint8(offset) & 0x7f) << 8) | view.getUint8(offset + 1);
  let mantissa = 0;
  for (let i = 0; i < 8; i++) mantissa = mantissa * 256 + view.getUint8(offset + 2 + i);
  if (exponent === 0 && mantissa === 0) return 0;
  return Math.pow(2, exponent - 16383) * (mantissa / Math.pow(2, 63));
}

export async function decodeRecording(file, audioContext) {
  const buffer = await file.arrayBuffer();
  try {
    const audio = await audioContext.decodeAudioData(buffer.slice(0));
    return mixToMono(audio);
  } catch {
    const aiff = decodeAiff(buffer);
    if (aiff) return aiff;
    throw new Error('Could not read that recording. Use wav, mp3, or uncompressed aiff.');
  }
}

export function resampleMono(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;
  const length = Math.max(1, Math.round((samples.length * toRate) / fromRate));
  const out = new Float32Array(length);
  const step = fromRate / toRate;
  for (let i = 0; i < length; i++) {
    const pos = i * step;
    const index = Math.floor(pos);
    const frac = pos - index;
    const a = samples[index] || 0;
    const b = samples[Math.min(index + 1, samples.length - 1)] || 0;
    out[i] = a * (1 - frac) + b * frac;
  }
  return out;
}
