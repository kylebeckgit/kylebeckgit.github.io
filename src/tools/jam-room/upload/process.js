// Full in-browser (and testable) upload pipeline.

import {
  MAX_FILE_BYTES,
  MAX_PROCESSED_SECONDS,
  MAX_RAW_SECONDS,
  analyzePitchYin,
  dbFromAmp,
  detectOnsets,
  highPassAndDc,
  isNearSilence,
  isPureNoise,
  normalizeAndLimit,
  peakAbs,
  resample,
  rms,
  sliceHits,
  TARGET_RATE,
  trimSilence,
} from './dsp.js';
import { nearestScaleMidi, pickBestSlices } from './musical.js';

export function prepareUploadSamples(samples, sampleRate) {
  if (!samples || !samples.length) return { ok: false, reason: 'That recording is too short. Try again.' };
  const rawSeconds = samples.length / sampleRate;
  if (rawSeconds > MAX_RAW_SECONDS + 0.05) return { ok: false, reason: 'Keep the recording to about 8 seconds.' };
  let work = samples;
  if (rawSeconds > MAX_RAW_SECONDS) work = samples.subarray(0, Math.floor(sampleRate * MAX_RAW_SECONDS));
  work = trimSilence(work, sampleRate);
  if (isNearSilence(work, sampleRate)) return { ok: false, reason: 'That recording was too quiet. Try again.' };
  work = highPassAndDc(work, sampleRate);
  work = normalizeAndLimit(work);
  if (isNearSilence(work, sampleRate)) return { ok: false, reason: 'That recording was too quiet. Try again.' };
  if (isPureNoise(work, sampleRate)) return { ok: false, reason: 'That recording sounds like noise. Try a clearer sound.' };
  const windowed = selectBestProcessedWindow(work, sampleRate);
  return {
    ok: true,
    samples: windowed.samples,
    sampleRate,
    usedBestWindow: windowed.usedBestWindow,
    windowStart: windowed.start,
  };
}

export function envelopeOnsets(samples, sampleRate) {
  const hop = Math.max(1, Math.floor(sampleRate * 0.01));
  const frame = Math.max(hop, Math.floor(sampleRate * 0.02));
  const values = [];
  for (let i = 0; i + frame <= samples.length; i += hop) {
    let energy = 0;
    for (let j = 0; j < frame; j++) energy += samples[i + j] * samples[i + j];
    values.push(energy);
  }
  const times = [];
  const minGap = 0.06;
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const cur = values[i];
    if (cur > 1e-6 && cur > prev * 2.5) {
      const t = (i * hop) / sampleRate;
      if (!times.length || t - times[times.length - 1] >= minGap) times.push(t);
    }
  }
  return times;
}

export function selectBestProcessedWindow(samples, sampleRate, maxSeconds = MAX_PROCESSED_SECONDS) {
  const maxLen = Math.floor(sampleRate * maxSeconds);
  if (!samples || samples.length <= maxLen) {
    return { samples: samples || new Float32Array(0), start: 0, usedBestWindow: false };
  }
  const onsets = envelopeOnsets(samples, sampleRate);
  const hop = Math.max(1, Math.floor(sampleRate * 0.05));
  const prefix = new Float64Array(samples.length + 1);
  for (let i = 0; i < samples.length; i++) prefix[i + 1] = prefix[i] + samples[i] * samples[i];
  let bestStart = 0;
  let bestOnsets = -1;
  let bestEnergy = -1;
  const consider = (start) => {
    const end = start + maxLen;
    const startSec = start / sampleRate;
    const endSec = end / sampleRate;
    let count = 0;
    for (const t of onsets) {
      if (t >= startSec && t < endSec) count++;
    }
    const energy = prefix[end] - prefix[start];
    if (count > bestOnsets || (count === bestOnsets && energy > bestEnergy)) {
      bestOnsets = count;
      bestEnergy = energy;
      bestStart = start;
    }
  };
  for (let start = 0; start + maxLen <= samples.length; start += hop) consider(start);
  const last = samples.length - maxLen;
  if (last > 0) consider(last);
  return { samples: samples.subarray(bestStart, bestStart + maxLen), start: bestStart, usedBestWindow: true };
}

export function finishProcessedClip(work, sampleRate, roomState, options = {}) {
  const pitch = options.pitch || analyzePitchYin(work, sampleRate);
  const keyRoot = roomState?.keyRoot || 'D';
  const mood = roomState?.mood || 'calm';
  let meta;
  if (pitch.pitched && pitch.f0Hz) {
    const mapped = nearestScaleMidi(pitch.f0Hz, keyRoot, mood);
    meta = {
      kind: 'pitched',
      f0Hz: pitch.f0Hz,
      recordedMidi: mapped.recordedMidi,
      centsOffset: mapped.cents,
      targetMidi: mapped.midi,
      slices: [],
      durationMs: (work.length / sampleRate) * 1000,
      loudnessLufsApprox: dbFromAmp(rms(work)),
      peakDb: dbFromAmp(peakAbs(work)),
      resonanceMix: options.resonanceMix ?? 0.4,
      source: pitch.source || 'yin',
    };
  } else {
    const onsets = options.onsets || detectOnsets(work, sampleRate);
    const hits = sliceHits(work, sampleRate, onsets);
    meta = {
      kind: 'unpitched',
      f0Hz: null,
      recordedMidi: null,
      centsOffset: 0,
      slices: pickBestSlices(hits, roomState),
      durationMs: (work.length / sampleRate) * 1000,
      loudnessLufsApprox: dbFromAmp(rms(work)),
      peakDb: dbFromAmp(peakAbs(work)),
      resonanceMix: options.resonanceMix ?? 0.4,
      source: pitch.source || 'yin',
    };
  }
  if (options.speech) {
    meta.speech = true;
    meta.resonanceMix = 1;
  }
  work = resample(work, sampleRate, TARGET_RATE);
  meta.durationMs = (work.length / TARGET_RATE) * 1000;
  return { ok: true, samples: work, sampleRate: TARGET_RATE, meta };
}

export function processSamples(samples, sampleRate, roomState, options = {}) {
  const prepared = prepareUploadSamples(samples, sampleRate);
  if (!prepared.ok) return prepared;
  return finishProcessedClip(prepared.samples, prepared.sampleRate, roomState, options);
}

export function rejectIfTooLarge(bytes) {
  if (bytes > MAX_FILE_BYTES) return 'That file is over 5 MB.';
  return null;
}
