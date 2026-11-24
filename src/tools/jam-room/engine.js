// Client-side materials and strike bodies for the jam room.
// Uses the existing resonator renderer. Material tables are starting points
// from the musical design, not measured physics.

import { renderPreview, scaleToPeak } from '../modal-preview/resonator.js';
import { heardSeconds } from '../modal-preview/engine.js';

export const MATERIALS = {
  glass:  { ratios: [1, 2.32, 4.25, 6.63],            gains: [1, 0.5, 0.25, 0.12],        t60: 3.5, damping: 0.15, exciter: 'click',  hardness: 0.85 },
  metal:  { ratios: [1, 2.756, 5.404, 8.933],          gains: [1, 0.6, 0.35, 0.2],         t60: 2.5, damping: 0.1,  exciter: 'click',  hardness: 0.9 },
  wood:   { ratios: [1, 3.93, 9.0],                    gains: [1, 0.3, 0.1],               t60: 0.6, damping: 0.6,  exciter: 'mallet', hardness: 0.25 },
  skin:   { ratios: [1, 1.594, 2.136, 2.296, 2.653],   gains: [1, 0.7, 0.5, 0.4, 0.3],     t60: 0.5, damping: 0.4,  exciter: 'burst',  hardness: 0.4 },
  string: { ratios: [1, 2, 3, 4, 5, 6],                gains: [1, 0.5, 0.33, 0.25, 0.2, 0.16], t60: 2.0, damping: 0.25, exciter: 'mallet', hardness: 0.45 },
  bowed:  { ratios: [1, 2, 3, 4],                      gains: [1, 0.4, 0.2, 0.1],          t60: 20,  damping: 0.2,  exciter: 'bow',    hardness: 0.2 },
};

export const LEVEL = {
  bed: 10 ** (-18 / 20),
  pulse: 10 ** (-14 / 20),
  melody: 10 ** (-12 / 20),
  crowd: 10 ** (-16 / 20),
  holdBoost: 10 ** (4 / 20),
  duck: 10 ** (-3 / 20),
};

export function materialPartials(name, { position = 0.5, maxModes = 6 } = {}) {
  const mat = MATERIALS[name] || MATERIALS.wood;
  const count = Math.min(mat.ratios.length, maxModes);
  const out = [];
  for (let i = 0; i < count; i++) {
    const ratio = mat.ratios[i];
    let gain = mat.gains[i] ?? 0.1;
    const n = i + 1;
    if (n > 1 && n % 2 === 1) gain *= 0.5 + 0.5 * position;
    const decay = mat.t60 / (1 + mat.damping * (ratio - 1));
    out.push({ ratio, gainDb: 20 * Math.log10(Math.max(1e-6, gain)), decay });
  }
  return out;
}

export function modeCap(mobile) {
  return mobile ? 5 : 8;
}

export function renderStrike(event, sampleRate, options = {}) {
  const material = event.material || 'wood';
  const mat = MATERIALS[material] || MATERIALS.wood;
  const maxModes = options.maxModes || 6;
  const partials = materialPartials(material, { position: event.position ?? 0.4, maxModes });
  if (!partials.length) return null;
  const heard = heardSeconds(partials, { exciter: mat.exciter });
  const seconds = Math.min(material === 'bowed' ? 8 : 5.5, Math.max(0.25, heard));
  const raw = renderPreview(partials, {
    fundamental: event.hz > 0 ? event.hz : 440,
    velocity: Math.min(1, Math.max(0, event.velocity ?? 0.5)),
    position: 0.02,
    exciter: mat.exciter,
    hardness: mat.hardness,
    sampleRate,
    seconds: event.seconds || seconds,
    releaseAt: mat.exciter === 'bow' ? (event.seconds || seconds) : undefined,
  });
  const peak = event.peak ?? LEVEL[event.layer] ?? LEVEL.crowd;
  return { samples: scaleToPeak(raw, peak), partials, seconds: raw.length / sampleRate };
}

export function renderBedBuffer(state, sampleRate, seconds) {
  const root = ( { C: 48, D: 50, E: 52, F: 53, G: 55, A: 57, Bb: 58 }[state.keyRoot] ) ?? 50;
  const voicing = state.mood === 'bright' ? [0, 7, 14]
    : state.mood === 'dark' ? [0, 7, -12]
    : state.mood === 'tense' ? [0, 1]
    : state.mood === 'drift' ? [0, 7, 12]
    : [0, 7];
  const length = Math.max(8, Math.floor(sampleRate * seconds));
  const mix = new Float32Array(length);
  const peak = LEVEL.bed * (state.pending?.hold ? LEVEL.holdBoost : 1);
  for (const interval of voicing) {
    const midi = root + interval;
    const hz = 440 * 2 ** ((midi - 69) / 12);
    const body = renderStrike({
      hz,
      velocity: 0.7,
      position: 0.3,
      material: 'bowed',
      layer: 'bed',
      peak: 1,
      seconds,
    }, sampleRate, { maxModes: 4 });
    if (!body) continue;
    const gain = 1 / voicing.length;
    for (let i = 0; i < length; i++) mix[i] += (body.samples[i] || 0) * gain;
  }
  return scaleToPeak(mix, peak);
}

export function spaceWet(space) {
  if (space <= 0) return 0.10;
  if (space >= 2) return 0.45;
  return 0.25;
}

export function delayBeats(space) {
  if (space <= 0) return 0;
  if (space >= 2) return 0.75;
  return 1;
}
