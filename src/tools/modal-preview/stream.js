// Generative scheduler for the hidden modal stream preview.
// Sounds come from the existing object library and material rolls; this
// module only chooses what to strike, when, and how loud.

import { heardSeconds, noteNameFromHz } from './engine.js';
import { OBJECTS, objectById, baseProfile } from './objects.js';
import { defaultLocks, identityKnobs, mulberry32, rollSound } from './randomize.js';

export const MAX_VOICES = 4;
export const PEAK_PER_VOICE = 0.28;
export const CLIP_CEILING = 0.95;
export const MAX_PARTIALS = 16;
export const MAX_RING_SECONDS = 5.5;
export const STREAM_MATERIALS = ['wood', 'skin', 'metal', 'bell', 'glass'];
// A minor pentatonic, plus Dorian color tones (B, F#).
export const SCALE_PITCH_CLASSES = [9, 11, 0, 2, 4, 6, 7];
export const PENTATONIC_CLASSES = [9, 0, 2, 4, 7];
export const DORIAN_COLOR = [11, 6];
const ROOT_MIDI = 57; // A3

const RING_BY_MATERIAL = {
  wood: 2.2,
  skin: 1.9,
  metal: 4.2,
  bell: 5.0,
  glass: 4.6,
  stone: 3.2,
};

export function masterGainForCap(peakPerVoice = PEAK_PER_VOICE, cap = MAX_VOICES, ceiling = CLIP_CEILING) {
  const product = peakPerVoice * cap;
  if (!(product > 0)) return 0;
  // Nudge down so peak * cap * gain stays at or under the ceiling in float math.
  let gain = ceiling / product;
  while (peakPerVoice * cap * gain > ceiling) gain = Math.nextDown?.(gain) ?? gain * (1 - Number.EPSILON);
  return gain;
}

export function linearPeakCeiling(peakPerVoice = PEAK_PER_VOICE, cap = MAX_VOICES, master = masterGainForCap()) {
  return peakPerVoice * cap * master;
}

export function limiterCurve(size = 1024) {
  const curve = new Float32Array(size);
  const knee = Math.tanh(1.35);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.35) / knee;
  }
  return curve;
}

export function streamClimate(timeSec) {
  const t = Math.max(0, Number(timeSec) || 0);
  const densPhase = (t / (7 * 60)) * 2 * Math.PI;
  const interval = 1.85 + Math.cos(densPhase) * 1.35;
  const regPhase = (t / (11 * 60)) * 2 * Math.PI;
  const register = 62 + Math.sin(regPhase) * 12;
  const matCycle = 9 * 60;
  const matPos = (t / matCycle) * STREAM_MATERIALS.length;
  const matIndex = ((Math.floor(matPos) % STREAM_MATERIALS.length) + STREAM_MATERIALS.length) % STREAM_MATERIALS.length;
  const materialBlend = matPos - Math.floor(matPos);
  return {
    interval,
    register,
    material: STREAM_MATERIALS[matIndex],
    nextMaterial: STREAM_MATERIALS[(matIndex + 1) % STREAM_MATERIALS.length],
    materialBlend,
    hardness: 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t / 93)),
  };
}

export function pickMaterial(rng, climate) {
  if ((climate.materialBlend || 0) > 0.72 && rng() < climate.materialBlend) return climate.nextMaterial;
  return climate.material;
}

export function pickNote(rng, climate) {
  const useColor = climate.interval > 1.8 && rng() < 0.22;
  const steps = useColor ? DORIAN_COLOR : PENTATONIC_CLASSES;
  const pitchClass = steps[Math.floor(rng() * steps.length) % steps.length];
  let midi = ROOT_MIDI + ((pitchClass - (ROOT_MIDI % 12) + 12) % 12);
  const target = Number(climate.register) || 62;
  while (midi < target - 8) midi += 12;
  while (midi > target + 8) midi -= 12;
  if (rng() < 0.18) midi += rng() < 0.5 ? -12 : 12;
  midi = Math.min(84, Math.max(36, midi));
  const hz = 440 * 2 ** ((midi - 69) / 12);
  return { midi, hz, note: noteNameFromHz(hz) };
}

export function isScalePitch(midi) {
  return SCALE_PITCH_CLASSES.includes(((Number(midi) % 12) + 12) % 12);
}

function objectsFor(material) {
  if (material === 'bell') return OBJECTS.filter((object) => /bell|bowl/.test(object.id));
  if (material === 'skin') return [];
  if (material === 'metal') {
    return OBJECTS.filter((object) => object.material === 'metal' && !/cymbal|waterphone|slinky/.test(object.id));
  }
  return OBJECTS.filter((object) => object.material === material);
}

function estimatedRing(material, interval) {
  const base = RING_BY_MATERIAL[material] || 3;
  const shortened = interval < 0.9 ? 0.62 : interval < 1.3 ? 0.8 : 1;
  return Math.min(MAX_RING_SECONDS, Math.max(1.4, base * shortened));
}

function pick(rng, list) {
  if (!list.length) return null;
  return list[Math.floor(rng() * list.length) % list.length];
}

export function makeStrike(rng, time, climate) {
  const material = pickMaterial(rng, climate);
  const pitch = pickNote(rng, climate);
  const pool = objectsFor(material);
  const useObject = pool.length > 0 && rng() < 0.55;
  const object = useObject ? pick(rng, pool) : null;
  const velocity = 0.42 + rng() * 0.36;
  const exciter = !object && material === 'skin' ? 'mallet' : rng() < 0.18 ? 'click' : 'mallet';
  return {
    time,
    midi: pitch.midi,
    hz: pitch.hz,
    note: pitch.note,
    source: object ? 'object' : 'material',
    objectId: object?.id || null,
    objectName: object?.name || material[0].toUpperCase() + material.slice(1),
    material: object?.material || material,
    rollSeed: Math.floor(rng() * 0xffffffff) >>> 0,
    velocity,
    hardness: Math.min(1, Math.max(0, climate.hardness + (rng() - 0.5) * 0.16)),
    exciter,
    peak: PEAK_PER_VOICE,
    ringSeconds: estimatedRing(object?.material || material, climate.interval),
  };
}

export function overlappingAt(strikes, time) {
  return (strikes || []).filter((strike) => strike.time <= time && time < strike.time + strike.ringSeconds);
}

export function overlappingCount(active, time) {
  let count = 0;
  for (const prev of active || []) {
    if (prev.time <= time && time < prev.time + prev.ringSeconds) count += 1;
  }
  return count;
}

export function applyVoiceCap(strikes, cap = MAX_VOICES) {
  const kept = [];
  for (const strike of strikes || []) {
    if (overlappingCount(kept, strike.time) < cap) kept.push(strike);
  }
  return kept;
}

// Keep strikes that have not yet started, or that are still ringing at atTime.
export function pruneStrikes(strikes, atTime) {
  const t = Number(atTime) || 0;
  return (strikes || []).filter((strike) => strike.time >= t || strike.time + strike.ringSeconds > t);
}

// Append newly planned strikes, then drop only what has already finished at now.
export function mergePlan(plan, added, now) {
  const next = [];
  const seen = new Set();
  for (const strike of [...(plan || []), ...(added || [])]) {
    if (seen.has(strike.time)) continue;
    seen.add(strike.time);
    next.push(strike);
  }
  return pruneStrikes(next, now);
}

export function nowPlaying(plan, started, streamTime) {
  const times = started instanceof Set ? started : new Set(started || []);
  const active = overlappingAt((plan || []).filter((strike) => times.has(strike.time)), streamTime);
  if (!active.length) return null;
  return active.reduce((latest, strike) => (strike.time >= latest.time ? strike : latest));
}

export const PLAN_CHUNK = 24;

// Incremental planner. Carries the RNG and the next strike time so each
// window only generates new strikes. `ringing` is voice-cap bookkeeping and
// must not be used as the live playback plan: it is pruned at future strike
// times, which would drop short notes that still need scheduling.
export function createStreamPlanner(seed, options = {}) {
  const cap = options.maxVoices ?? MAX_VOICES;
  const rng = mulberry32(seed >>> 0);
  let nextTime = 0.12 + rng() * 0.35;
  let plannedUntil = 0;
  let ringing = [];

  function planUntil(end) {
    const until = Math.max(0, Number(end) || 0);
    const added = [];
    let work = 0;
    while (nextTime < until) {
      const t = nextTime;
      ringing = pruneStrikes(ringing, t);
      work += ringing.length;
      const climate = streamClimate(t);
      const strike = makeStrike(rng, t, climate);
      work += ringing.length;
      if (overlappingCount(ringing, strike.time) < cap) {
        ringing.push(strike);
        added.push(strike);
      }
      const jitter = 0.7 + rng() * 0.6;
      nextTime += Math.max(0.28, climate.interval * jitter);
    }
    plannedUntil = Math.max(plannedUntil, until);
    work += ringing.length;
    return { added, work, plannedUntil };
  }

  return {
    planUntil,
    get plannedUntil() { return plannedUntil; },
    get nextTime() { return nextTime; },
  };
}

export function planStream(seed, durationSec, options = {}) {
  const planner = createStreamPlanner(seed, options);
  return planner.planUntil(Math.max(0, Number(durationSec) || 0)).added;
}

export function capPartials(partials, max = MAX_PARTIALS) {
  const list = (partials || []).filter((partial) => partial.ratio > 0).sort((a, b) => a.ratio - b.ratio);
  if (list.length <= max) return list.map((partial) => ({ ...partial }));
  const rest = list.slice(1).sort((a, b) => b.gainDb - a.gainDb).slice(0, max - 1);
  return [list[0], ...rest].sort((a, b) => a.ratio - b.ratio).map((partial) => ({ ...partial }));
}

export function buildStrikeBody(strike) {
  let partials = [];
  if (strike?.source === 'object' && strike.objectId) {
    const object = objectById(strike.objectId);
    partials = baseProfile(object);
  } else {
    const rolled = rollSound({
      current: { ...identityKnobs(), density: 16 },
      material: STREAM_MATERIALS.includes(strike?.material) ? strike.material : 'any',
      amount: 1,
      wildness: 0.18,
      locks: { ...defaultLocks(), tune: true, density: true },
      seed: (strike?.rollSeed || 1) >>> 0,
    });
    partials = rolled?.partials || [];
  }
  partials = capPartials(partials);
  const fundamental = strike?.hz > 0 ? strike.hz : 440;
  const heard = heardSeconds(partials, { exciter: strike?.exciter || 'mallet' });
  const seconds = Math.min(strike?.ringSeconds || MAX_RING_SECONDS, heard, MAX_RING_SECONDS);
  return { partials, fundamental, seconds };
}

export function strikeLabel(strike) {
  if (!strike) return '';
  return `${strike.objectName}, ${strike.note}`;
}

export function createImpulse(sampleRate, seconds = 1.4, rng = Math.random) {
  const rate = sampleRate > 0 ? sampleRate : 44100;
  const length = Math.max(8, Math.floor(rate * seconds));
  const data = new Float32Array(length);
  const decay = rate * 0.28;
  for (let i = 0; i < length; i++) {
    data[i] = (rng() * 2 - 1) * Math.exp(-i / decay);
  }
  return data;
}

// AudioBuffer.duration is already seconds. Dividing it by sampleRate
// stops the note after a few samples.
export function bufferStopTime(startTime, buffer) {
  const when = Number(startTime) || 0;
  const duration = Number(buffer?.duration);
  if (Number.isFinite(duration) && duration >= 0) return when + duration;
  const length = Number(buffer?.length);
  const rate = Number(buffer?.sampleRate);
  if (length > 0 && rate > 0) return when + length / rate;
  return when;
}
