import { hzFromMidi, midiForDegree, crowdScale, noteName } from '../../../../workers/jam-room/src/logic.js';
import { materialPartials } from '../engine.js';
import { renderPreview, scaleToPeak } from '../../modal-preview/resonator.js';
import { clampRateForPlay } from './musical.js';
import { shiftSamples } from './dsp.js';
import { decodeWav16 } from './wav16.js';

export function resolvePlaybackRate(meta, roomState, degree = 0) {
  const scale = crowdScale(roomState?.mood || 'calm');
  const target = Number.isFinite(Number(meta?.targetMidi))
    ? Number(meta.targetMidi)
    : midiForDegree(roomState?.keyRoot || 'D', degree, scale, 1);
  if (meta?.kind === 'pitched' && Number.isFinite(Number(meta.recordedMidi))) {
    return clampRateForPlay(meta.recordedMidi, target);
  }
  return { rate: 1, midi: target, cents: 0 };
}

export function resonateClip(samples, sampleRate, meta, roomState, options = {}) {
  const mix = meta?.speech ? 1 : Math.min(1, Math.max(0, Number(meta?.resonanceMix ?? 0.4)));
  const play = resolvePlaybackRate(meta, roomState, options.degree || 0);
  const speech = Boolean(meta?.speech);
  const rate = speech ? 1 : play.rate;
  const tuned = speech ? samples : shiftSamples(samples, rate);
  const fundamental = hzFromMidi(play.midi);
  const partials = materialPartials(roomState?.materials?.melody || 'glass', { position: options.position ?? 0.4, maxModes: options.maxModes || 6 });
  const wet = renderPreview(partials, {
    sampleRate,
    seconds: Math.min(4, Math.max(0.12, tuned.length / sampleRate)),
    fundamental,
    velocity: options.velocity ?? 0.7,
    position: options.position ?? 0.4,
    exciter: 'file',
    file: tuned,
    unitGain: true,
  });
  if (mix >= 0.999 || speech) {
    return { samples: scaleToPeak(wet, options.peak ?? 0.2), partials, midi: play.midi, note: noteName(play.midi), mix: 1, rate };
  }
  const length = Math.max(tuned.length, wet.length);
  const out = new Float32Array(length);
  const dryGain = 1 - mix;
  for (let i = 0; i < length; i++) {
    const dry = i < tuned.length ? tuned[i] * dryGain : 0;
    const wetS = i < wet.length ? wet[i] * mix : 0;
    out[i] = dry + wetS;
  }
  return { samples: scaleToPeak(out, options.peak ?? 0.2), partials, midi: play.midi, note: noteName(play.midi), mix, rate };
}

export function sliceClip(samples, sampleRate, meta, index = 0) {
  const slices = Array.isArray(meta?.slices) ? meta.slices : [];
  if (!slices.length) return samples;
  const slice = slices[index % slices.length];
  const start = Math.max(0, Math.floor((Number(slice.startMs) || 0) / 1000 * sampleRate));
  const end = Math.min(samples.length, Math.floor((Number(slice.endMs) || 0) / 1000 * sampleRate));
  if (end <= start + 8) return samples;
  return samples.subarray(start, end);
}

export function decodeUploadWav(bytes) {
  return decodeWav16(bytes);
}


export function clipIsSpeech(clip, meta) {
  const source = clip && typeof clip === 'object' && !Array.isArray(clip) ? clip : {};
  const m = meta || source.meta || {};
  if ('speech' in source || 'hasSpeech' in source) {
    return Boolean(source.speech || source.hasSpeech);
  }
  return Boolean(m.speech || m.hasSpeech);
}

export function playbackMetaForClip(clip, meta) {
  const m = { ...(meta || clip?.meta || {}) };
  if (clipIsSpeech(clip, m)) {
    m.speech = true;
    m.hasSpeech = true;
    m.resonanceMix = 1;
  }
  return m;
}

export function samplesForApprovedClip(samples, sampleRate, clip, index = 0) {
  const meta = playbackMetaForClip(clip, clip?.meta);
  if (clipIsSpeech(clip, meta)) {
    return { samples, meta, speech: true };
  }
  if (meta.kind === 'unpitched') {
    return { samples: sliceClip(samples, sampleRate, meta, index), meta, speech: false };
  }
  return { samples, meta, speech: false };
}

