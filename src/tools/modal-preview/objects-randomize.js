// Rolls inside one object from objects.js. The object supplies the series
// (its base profile); a roll moves the knobs inside the object's own musical
// ranges and nudges the profile a little, the way two examples of the same
// object differ. Wildness widens both, and past 0.7 it also bends the series.
// No network.

import { shapePartials } from './shape.js';
import {
  EXTREME_WILDNESS,
  assessQuality,
  defaultLocks,
  expandedFrom,
  identityKnobs,
  mixKnobs,
  mulberry32,
  exoticAmount,
  wildenPartials,
  sampleFromRange,
  toShape,
} from './randomize.js';
import { baseProfile, objectById } from './objects.js';

const MAX_PARTIALS = 256;
const MAX_RATIO = 80;
const STEPS = [8, 16, 32, 64, 128, 256];

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function between(rng, lo, hi) {
  return lerp(lo, hi, rng());
}

function cents(ratio, amount) {
  return ratio * 2 ** (amount / 1200);
}

function tidy(partials) {
  const sorted = partials
    .filter((p) => [p.ratio, p.gainDb, p.decay].every(Number.isFinite) && p.ratio > 0)
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, MAX_PARTIALS);
  const peak = Math.max(...sorted.map((p) => p.gainDb));
  return sorted.map((p) => ({
    ratio: p.ratio,
    gainDb: clamp(p.gainDb - (peak > 0 || peak < -3 ? peak : 0), -96, 0),
    decay: clamp(p.decay, 0.05, 30),
  }));
}

// A different example of the same object. Strength 0 returns the base.
export function mutateProfile(rng, object, strength, exotic = 0) {
  const m = object.mutate;
  const s = clamp(strength, 0, EXTREME_WILDNESS);
  const x = clamp(Number(exotic) || 0, 0, 1);
  let list = baseProfile(object);
  if (s <= 0 && !(x > 0)) return list;
  if (s <= 0) return tidy(wildenPartials(rng, list, x));
  const jitter = m.ratioJitterCents * (0.25 + 0.75 * s) * (1 + 1.5 * x);
  const gainJitter = m.gainJitterDb * (0.3 + 0.7 * s) * (1 + x);
  const scale = Math.exp(lerp(Math.log(1), Math.log(between(rng, m.decayScale[0], m.decayScale[1])), Math.min(1, s)));
  list = list.map((p, i) => ({
    ratio: i === 0 ? p.ratio : cents(p.ratio, between(rng, -jitter, jitter)),
    gainDb: p.gainDb + between(rng, -gainJitter, gainJitter),
    decay: p.decay * scale * between(rng, 0.88, 1.12),
  }));
  if (m.pairSplitCents && s > 0.15) {
    const chance = clamp(0.3 + 0.4 * s, 0, 0.9);
    const twins = [];
    for (let i = 0; i < list.length; i++) {
      const near = list.some((q, j) => j !== i && Math.abs(1200 * Math.log2(q.ratio / list[i].ratio)) < 20);
      if (near || rng() > chance || list.length + twins.length >= MAX_PARTIALS) continue;
      const split = between(rng, m.pairSplitCents[0], m.pairSplitCents[1]) * (1 + 0.6 * x);
      twins.push({
        ratio: cents(list[i].ratio, rng() < 0.5 ? split : -split),
        gainDb: list[i].gainDb - between(rng, 0.5, 3),
        decay: list[i].decay * between(rng, 0.8, 1),
      });
    }
    list = list.concat(twins);
  }
  if (x > 0) list = wildenPartials(rng, list, x);
  return tidy(list);
}

function fitRange(partials, knobs, locks) {
  // Keep every row inside the share limit of 80 by lowering Tune if needed.
  let shaped = shapePartials(partials, toShape(knobs));
  const top = Math.max(...shaped.map((p) => p.ratio));
  if (top > MAX_RATIO && !locks?.tune) {
    const drop = Math.ceil(12 * Math.log2(top / MAX_RATIO));
    knobs.tune = clamp(knobs.tune - drop, -48, 48);
    shaped = shapePartials(partials, toShape(knobs));
  }
  return shaped;
}

// Pairs and clusters are the point of several objects, so the clump and
// merged-bar reasons do not count against them.
export function assessObject(partials, knobs) {
  const quality = assessQuality(partials, knobs);
  const reasons = quality.reasons.filter((reason) => reason !== 'clumped' && reason !== 'merged');
  const top = Math.max(...partials.map((p) => p.ratio));
  if (top > MAX_RATIO) reasons.push('limits');
  return { ok: reasons.length === 0, reasons, score: reasons.length ? 10 - reasons.length : 10 };
}

function snapDensity(rng, knobs, count, locks, current, wild) {
  if (locks?.density) {
    knobs.density = Math.min(count, Math.max(1, Math.round(current?.density || count)));
    return;
  }
  knobs.density = count;
  const cut = Math.max(wild > 0.8 ? 0.2 : 0, 0.35 * exoticAmount(wild));
  if (cut && rng() < cut) {
    const options = STEPS.filter((step) => step < count && step >= 4);
    if (options.length) knobs.density = options[Math.floor(rng() * options.length)];
  }
}

export function describeObjectRoll(object, knobs, partials) {
  const bits = [];
  if (knobs.decay > 0.28) bits.push('long');
  else if (knobs.decay < -0.28) bits.push('short');
  if (knobs.normalize > 0.2 || knobs.absorb < -0.18) bits.push('bright');
  else if (knobs.normalize < -0.22 || knobs.absorb > 0.38) bits.push('dark');
  if (knobs.disperse > 0.25) bits.push('stretched');
  else if (knobs.disperse < -0.25) bits.push('compressed');
  let close = 0;
  for (let i = 1; i < partials.length; i++) {
    if (Math.abs(1200 * Math.log2(partials[i].ratio / partials[i - 1].ratio)) < 25) close += 1;
  }
  if (close >= 2) bits.push('beating pairs');
  return bits.length ? `${object.name}, ${bits.join(', ')}` : object.name;
}

export function loadObject(object) {
  const profile = baseProfile(object);
  const knobs = { ...identityKnobs(), density: profile.length, position: 0.02, detune: 0 };
  // Identity knobs leave the series exactly as published, so skip the reshape.
  const partials = baseProfile(object);
  return {
    knobs,
    partials,
    profile,
    quality: assessObject(partials, knobs),
    description: `${object.name}, base profile`,
    material: 'object',
    object: object.id,
  };
}

export function rollObject({ object, current, amount = 1, wildness = 0.3, locks = defaultLocks(), seed = 1 }) {
  const obj = typeof object === 'string' ? objectById(object) : object;
  if (!obj) throw new Error('Unknown object');
  const rng = mulberry32(seed);
  const wild = clamp(Number(wildness) || 0, 0, EXTREME_WILDNESS);
  const exotic = exoticAmount(wild);
  const strength = wild * (0.2 + 0.8 * clamp(Number(amount) || 0, 0, 1));
  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const profile = mutateProfile(rng, obj, strength, exotic);
    const range = expandedFrom({ ...obj.mutate, detune: [-0.1, 0.1], density: [8] }, wild);
    const target = sampleFromRange(rng, range);
    const knobs = mixKnobs(current || identityKnobs(), target, amount, locks);
    snapDensity(rng, knobs, profile.length, locks, current, wild);
    if (!locks?.detune) knobs.detune = 0;
    if (!locks?.position) knobs.position = 0.02;
    const partials = fitRange(profile, knobs, locks);
    const quality = assessObject(partials, knobs);
    const candidate = {
      knobs,
      partials,
      profile,
      quality,
      description: describeObjectRoll(obj, knobs, partials),
      material: 'object',
      object: obj.id,
    };
    if (!best || quality.score > best.quality.score) best = candidate;
    if (quality.ok) return candidate;
  }
  return best;
}
