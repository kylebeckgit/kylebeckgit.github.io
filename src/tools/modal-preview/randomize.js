// Client-side rolls. No network. A material picks a musical range, Wild
// picks a plausible hybrid, and a failed quality check is rolled again.

import { buildPartials } from './engine.js';
import { shapePartials } from './shape.js';
import { barsStayDistinct } from './modal-view.js';

export const MATERIALS = ['metal', 'wood', 'glass', 'skin', 'bell', 'any', 'wild'];

export const KNOB_KEYS = ['tune', 'detune', 'decay', 'decayKf', 'position', 'density', 'absorb', 'disperse', 'normalize'];

const DENSITIES = [8, 16, 32, 64, 128, 256];

const RANGES = {
  metal: { decay: [0.05, 0.7], decayKf: [-0.2, 0.4], absorb: [-0.15, 0.35], disperse: [-0.1, 0.4], normalize: [-0.05, 0.45], detune: [-0.18, 0.22], position: [0.08, 0.32], density: [16, 32], tune: [-6, 6] },
  wood: { decay: [-0.65, 0.05], decayKf: [0.15, 0.7], absorb: [0.2, 0.7], disperse: [-0.2, 0.12], normalize: [-0.55, 0.0], detune: [-0.12, 0.12], position: [0.14, 0.5], density: [8, 16, 32], tune: [-6, 6] },
  glass: { decay: [0.3, 0.85], decayKf: [-0.15, 0.25], absorb: [-0.4, 0.1], disperse: [-0.05, 0.28], normalize: [0.1, 0.65], detune: [-0.1, 0.16], position: [0.06, 0.26], density: [8, 16, 32], tune: [-6, 6] },
  skin: { decay: [-0.9, -0.25], decayKf: [0.25, 0.8], absorb: [0.3, 0.8], disperse: [-0.08, 0.3], normalize: [-0.7, -0.15], detune: [-0.2, 0.2], position: [0.28, 0.7], density: [8, 16, 32], tune: [-6, 6] },
  bell: { decay: [0.1, 0.65], decayKf: [-0.05, 0.4], absorb: [-0.1, 0.3], disperse: [-0.035, 0.035], normalize: [0.05, 0.5], detune: [-0.12, 0.18], position: [0.08, 0.36], density: [8, 16, 32], tune: [-6, 6] },
  any: { decay: [-0.55, 0.75], decayKf: [-0.3, 0.55], absorb: [-0.35, 0.6], disperse: [-0.25, 0.55], normalize: [-0.5, 0.55], detune: [-0.22, 0.25], position: [0.06, 0.6], density: [8, 16, 32], tune: [-8, 8] },
};

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

export function defaultLocks() {
  return {
    tune: true,
    detune: false,
    decay: false,
    decayKf: false,
    position: false,
    density: false,
    absorb: false,
    disperse: false,
    normalize: false,
  };
}

export function identityKnobs() {
  return {
    tune: 0,
    detune: 0,
    decay: 0,
    decayKf: 0,
    position: 0.18,
    density: 16,
    absorb: 0,
    disperse: 0,
    normalize: 0,
  };
}

export function createRollHistory(limit = 10) {
  return { past: [], future: [], limit };
}

export function pushRoll(history, snapshot) {
  history.past.push(snapshot);
  while (history.past.length > history.limit) history.past.shift();
  history.future = [];
  return history;
}

export function undoRoll(history, current) {
  if (!history.past.length) return null;
  history.future.push(current);
  while (history.future.length > history.limit) history.future.shift();
  return history.past.pop();
}

export function redoRoll(history, current) {
  if (!history.future.length) return null;
  history.past.push(current);
  while (history.past.length > history.limit) history.past.shift();
  return history.future.pop();
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function sampleRange(rng, range) {
  return lerp(range[0], range[1], rng());
}

function nearestDensity(value, allowed = DENSITIES) {
  let best = allowed[0];
  let score = Infinity;
  for (const step of allowed) {
    const delta = Math.abs(step - value);
    if (delta < score) {
      score = delta;
      best = step;
    }
  }
  return best;
}

const FAMILIES = ['metal', 'wood', 'glass', 'skin', 'bell'];

const LIMITS = {
  tune: [-12, 12],
  detune: [-0.62, 0.62],
  decay: [-0.95, 0.95],
  decayKf: [-0.92, 0.92],
  position: [0.03, 0.88],
  absorb: [-0.8, 0.88],
  disperse: [-0.92, 0.92],
  normalize: [-0.85, 0.85],
};

function sampleFromRange(rng, range) {
  return {
    tune: Math.round(sampleRange(rng, range.tune)),
    detune: sampleRange(rng, range.detune),
    decay: sampleRange(rng, range.decay),
    decayKf: sampleRange(rng, range.decayKf),
    position: sampleRange(rng, range.position),
    density: pick(rng, range.density),
    absorb: sampleRange(rng, range.absorb),
    disperse: sampleRange(rng, range.disperse),
    normalize: sampleRange(rng, range.normalize),
  };
}

function sampleMaterialKnobs(rng, material) {
  return sampleFromRange(rng, RANGES[material] || RANGES.any);
}

function expandedRange(material, wildness) {
  const base = RANGES[material] || RANGES.any;
  const w = clamp(Number(wildness) || 0, 0, 1);
  const range = {
    density: w > 0.45 ? [8, 16, 32] : base.density.slice(),
  };
  for (const key of ['tune', 'detune', 'decay', 'decayKf', 'position', 'absorb', 'disperse', 'normalize']) {
    range[key] = [
      lerp(base[key][0], LIMITS[key][0], w),
      lerp(base[key][1], LIMITS[key][1], w),
    ];
  }
  return range;
}

function sampleTarget(rng, material, wildness, family) {
  const w = clamp(Number(wildness) || 0, 0, 1);
  const source = family || material;
  const knobs = sampleFromRange(rng, expandedRange(source, w));
  if (w > 0 && rng() < w * 0.9) {
    const donor = pick(rng, FAMILIES.filter((name) => name !== family));
    const trait = pick(rng, ['normalize', 'absorb', 'decay', 'decayKf', 'disperse']);
    const borrowed = sampleRange(rng, RANGES[donor][trait]);
    knobs[trait] = lerp(knobs[trait], borrowed, 0.5 + 0.5 * w);
  }
  if (w > 0.05 && rng() < w) {
    const key = pick(rng, ['disperse', 'decayKf', 'absorb', 'detune', 'normalize']);
    const corner = key === 'detune'
      ? (rng() < 0.5 ? LIMITS.detune[0] : LIMITS.detune[1])
      : (rng() < 0.5 ? LIMITS[key][0] : LIMITS[key][1]);
    knobs[key] = lerp(knobs[key], corner, 0.35 + 0.65 * w);
  }
  if (w > 0.55 && rng() < 0.35) knobs.density = 8;
  knobs.tune = Math.round(knobs.tune);
  knobs.density = nearestDensity(knobs.density, w > 0.45 ? [8, 16, 32] : (RANGES[source] || RANGES.any).density);
  // At rest, Disperse of a few hundredths keeps the main partials inside
  // about 50 cents of the reference series. Absorb stays in the material range.
  if (w <= 0) {
    const absorb = (RANGES[source] || RANGES.metal).absorb;
    knobs.disperse = clamp(knobs.disperse, -0.035, 0.035);
    knobs.absorb = clamp(knobs.absorb, absorb[0], absorb[1]);
  }
  knobs.position = clamp(knobs.position, 0.02, 0.98);
  knobs.detune = clamp(knobs.detune, -1, 1);
  return knobs;
}

export function materialCenter(material) {
  const range = RANGES[material === 'wild' ? 'any' : material] || RANGES.any;
  const knobs = {};
  for (const key of ['tune', 'detune', 'decay', 'decayKf', 'position', 'absorb', 'disperse', 'normalize']) {
    knobs[key] = (range[key][0] + range[key][1]) / 2;
  }
  knobs.density = range.density[Math.floor((range.density.length - 1) / 2)];
  return knobs;
}

export function knobDistance(knobs, material) {
  const center = materialCenter(material);
  const range = RANGES[material === 'wild' ? 'any' : material] || RANGES.any;
  let sum = 0;
  let count = 0;
  for (const key of ['decay', 'decayKf', 'absorb', 'disperse', 'normalize', 'detune', 'position']) {
    const half = Math.max(0.04, (range[key][1] - range[key][0]) / 2);
    sum += Math.abs(knobs[key] - center[key]) / half;
    count += 1;
  }
  const span = Math.max(...range.density) - Math.min(...range.density);
  sum += Math.abs(knobs.density - center.density) / Math.max(8, span / 2);
  return sum / (count + 1);
}

function mixKnobs(current, target, amount, locks) {
  const mix = clamp(0.08 + 0.92 * clamp(Number(amount) || 0, 0, 1), 0, 1);
  const next = {};
  for (const key of KNOB_KEYS) {
    if (locks?.[key]) {
      next[key] = current[key];
      continue;
    }
    if (key === 'density') {
      next[key] = mix > 0.55 ? target[key] : nearestDensity(lerp(current[key], target[key], mix));
      continue;
    }
    if (key === 'tune') {
      next[key] = Math.round(lerp(current[key], target[key], mix));
      continue;
    }
    next[key] = lerp(current[key], target[key], mix);
  }
  next.position = clamp(next.position, 0.02, 0.98);
  next.detune = clamp(next.detune, -1, 1);
  next.tune = clamp(Math.round(next.tune), -48, 48);
  for (const key of ['decay', 'decayKf', 'absorb', 'disperse', 'normalize']) next[key] = clamp(next[key], -1, 1);
  return next;
}

// Mode sets are the physical series already used by the preview engine.
// Skin: circular-membrane Bessel zeros (Fletcher & Rossing).
// Wood: free-free bar, (βn/β1)^2 with β from cos βL cosh βL = 1, so
// 1, 2.756, 5.404, 8.933… A tuned marimba bar is the optional voice.
// Metal: simply supported square plate, frequency ∝ m² + n².
// Bell: minor-third church bell relative to the prime: hum 0.5, prime 1,
// tierce 1.2, quint 1.5, nominal 2 (Fletcher & Rossing; Rossing, Acoustics of Bells).
// Glass: singing-bowl / wine-glass (n,0) series 1, 2.8, 5.2, 8.1…
// (Inácio, Henrique & Antunes, Acta Acustica 92, 2006), with the glass T60.
// Factory Zebra CSVs were only a listening reference and are not shipped.
const FAMILY_CONTROLS = {
  skin: { preset: 'membrane', damping: 1, brightness: -0.55 },
  wood: { preset: 'bar', damping: 0.86, brightness: -0.35 },
  metal: { preset: 'plate', damping: 0.22, brightness: 0.2 },
  bell: { preset: 'bell', damping: 0.12, brightness: 0.05 },
  glass: { preset: 'plate', voice: 'glass', damping: 0.08, brightness: 0.45 },
};

function dropClose(partials, minCents = 30) {
  const sorted = [...partials].sort((a, b) => a.ratio - b.ratio);
  const kept = [];
  for (const partial of sorted) {
    if (!kept.length) {
      kept.push(partial);
      continue;
    }
    if (centsBetween(kept[kept.length - 1].ratio, partial.ratio) < minCents) continue;
    if (partial.ratio / kept[0].ratio > 48) break;
    kept.push(partial);
  }
  return kept;
}

function scaleFundDecay(partials, seconds) {
  const fund = partials[0]?.decay || 1;
  const gain = seconds / fund;
  return partials.map((partial) => ({
    ...partial,
    decay: clamp(partial.decay * gain, 0.04, 30),
  }));
}

function extendBowl(partials) {
  // Inácio's Bowl 1 stops at the (8,0) mode. Higher circumferential modes
  // follow the thin-shell (n² − 1) trend so a denser comb still begins on
  // the measured 1, 2.8, 5.2, 8.1… series instead of interpolating it.
  const out = partials.slice();
  const fundDecay = partials[0]?.decay || 8;
  for (let n = 9; out.length < 36; n++) {
    const ratio = (n * n - 1) / 3;
    const rise = Math.max(ratio - 1, 0) ** 0.85;
    out.push({
      ratio,
      gainDb: -4 - 1.4 * (n - 8),
      decay: clamp(fundDecay / (1 + 0.42 * rise), 0.08, 30),
    });
  }
  return out;
}

export function familyPartials(family, variant) {
  const controls = { ...(FAMILY_CONTROLS[family] || FAMILY_CONTROLS.metal) };
  if (family === 'wood' && variant === 'marimba') controls.voice = 'marimba';
  let partials = buildPartials(controls);
  if (family === 'glass') partials = extendBowl(partials);
  partials = dropClose(partials);
  // The engine's generic T60 tops out just under 3 s. Scale the whole slope
  // so a plate or bell can actually ring, and a membrane can thump.
  // Glass and marimba already carry a measured T60 in the engine.
  const fundSeconds = { skin: 0.45, wood: 0.85, metal: 4.5, bell: 6.5 }[family];
  if (fundSeconds && variant !== 'marimba') partials = scaleFundDecay(partials, fundSeconds);
  // The bell series is stored from the hum at 0.5. Scale the whole set so
  // the hum is ratio 1 and the prime stays an octave above it.
  return normalizePitch(partials);
}

function normalizePitch(partials) {
  const ratios = partials.map((partial) => partial.ratio).filter((ratio) => ratio > 0);
  const lowest = Math.min(...ratios);
  if (!(lowest > 0)) return partials;
  return partials
    .map((partial) => ({ ...partial, ratio: partial.ratio / lowest }))
    .sort((a, b) => a.ratio - b.ratio);
}

function capDensity(knobs, partials, locks) {
  if (locks?.density) return knobs;
  const room = Math.max(4, partials.length);
  const allowed = DENSITIES.filter((step) => step <= room);
  const choices = allowed.length ? allowed : [Math.min(room, 8)];
  return { ...knobs, density: nearestDensity(knobs.density, choices) };
}

function blendPartials(a, b, mix) {
  // Both series already start at ratio 1. Pair them in ratio order and blend
  // in log frequency, so a hum at 0.5 is never averaged with a bar at 1.
  const lefts = normalizePitch(a);
  const rights = normalizePitch(b);
  const count = Math.min(lefts.length, rights.length, 24);
  const out = [];
  for (let i = 0; i < count; i++) {
    const left = lefts[Math.min(i, lefts.length - 1)];
    const right = rights[Math.min(i, rights.length - 1)];
    out.push({
      ratio: Math.exp((1 - mix) * Math.log(left.ratio) + mix * Math.log(Math.max(right.ratio, 1e-6))),
      gainDb: left.gainDb * (1 - mix) + right.gainDb * mix,
      decay: left.decay * (1 - mix) + right.decay * mix,
    });
  }
  return normalizePitch(dropClose(out, 25));
}

function profileFor(rng, material, wildness, family) {
  const w = clamp(Number(wildness) || 0, 0, 1);
  const chosen = family || material;
  const variant = chosen === 'wood' && w > 0.55 && rng() < w * 0.35 ? 'marimba' : '';
  let partials = familyPartials(chosen, variant);
  if ((material === 'wild' || material === 'any') && w > 0.2 && rng() < w * 0.85) {
    const other = pick(rng, FAMILIES.filter((name) => name !== chosen));
    partials = blendPartials(partials, familyPartials(other), 0.2 + 0.55 * w * rng());
  } else if (material !== 'any' && material !== 'wild' && w > 0.35 && rng() < w * 0.7) {
    const other = pick(rng, FAMILIES.filter((name) => name !== chosen));
    partials = blendPartials(partials, familyPartials(other), 0.15 + 0.4 * w * rng());
  }
  return { family: chosen, partials: normalizePitch(partials) };
}

function toShape(knobs) {
  return {
    absorb: knobs.absorb,
    disperse: knobs.disperse,
    decay: knobs.decay,
    decayKf: knobs.decayKf,
    normalize: knobs.normalize,
    tune: knobs.tune,
    density: knobs.density,
  };
}

function centsBetween(a, b) {
  if (!(a > 0) || !(b > 0)) return 0;
  return Math.abs(1200 * Math.log2(b / a));
}

export function assessQuality(partials, knobs) {
  const reasons = [];
  if (!partials?.length || partials.length < 4) reasons.push('thin');
  const list = partials || [];
  let peak = -Infinity;
  let energy = 0;
  let slammed = 0;
  for (const partial of list) {
    if (!Number.isFinite(partial.ratio) || !Number.isFinite(partial.gainDb) || !Number.isFinite(partial.decay)) {
      reasons.push('unstable');
      break;
    }
    peak = Math.max(peak, partial.gainDb);
    energy += 10 ** (partial.gainDb / 20);
    if (partial.gainDb > -1) slammed += 1;
  }
  if (peak < -30 || energy < 0.2) reasons.push('silent');
  if (slammed >= 4) reasons.push('clipped');
  const fund = list[0];
  if (fund) {
    if (fund.decay < 0.005 || fund.decay > 36) reasons.push('decay');
  }
  const decays = list.map((partial) => partial.decay);
  if (decays.some((value) => value < 0.005 || value > 48)) reasons.push('decay');
  let clumps = 0;
  for (let i = 1; i < Math.min(list.length, 8); i++) {
    if (centsBetween(list[i - 1].ratio, list[i].ratio) < 8) clumps += 1;
  }
  if (clumps >= 2) reasons.push('clumped');
  const span = list.length > 1 ? list[list.length - 1].ratio / list[0].ratio : 1;
  if (!(span > 1.4) || span > 80) reasons.push('spread');
  let loudest = list[0];
  for (const partial of list) if (partial.gainDb > loudest.gainDb) loudest = partial;
  const loudIndex = list.indexOf(loudest);
  const highEnergy = list.filter((partial) => partial.ratio > list[0].ratio * 6)
    .reduce((sum, partial) => sum + 10 ** (partial.gainDb / 20), 0);
  const harsh = highEnergy > energy * 0.62 && list.some((partial) => partial.ratio > list[0].ratio * 6 && partial.decay > 2 && partial.gainDb > peak - 8);
  if (harsh) reasons.push('harsh');
  const clearPitch = loudIndex >= 0 && loudIndex < 6;
  const controlledNoise = knobs.density >= 16 && fund && fund.decay < 1.4 && peak - (list[Math.min(5, list.length - 1)]?.gainDb ?? -80) < 36;
  if (!clearPitch && !controlledNoise) reasons.push('center');
  if (Math.abs(knobs.detune) > 0.8) reasons.push('view');
  if (list.length && !barsStayDistinct(list, knobs)) reasons.push('merged');
  const ok = reasons.length === 0;
  return { ok, reasons, score: ok ? 10 : 10 - reasons.length };
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function cap(text) {
  const clean = text.replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '');
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function centsOff(actual, expected) {
  if (!(actual > 0) || !(expected > 0)) return 9999;
  return Math.abs(1200 * Math.log2(actual / expected));
}

export function spectrumTone(partials) {
  const list = partials || [];
  const lowest = Math.min(...list.map((partial) => partial.ratio).filter((ratio) => ratio > 0));
  let high = 0;
  let all = 0;
  let moment = 0;
  for (const partial of list) {
    const power = 10 ** (partial.gainDb / 10);
    const ratio = partial.ratio / (lowest || 1);
    all += power;
    moment += power * ratio;
    if (ratio >= 3) high += power;
  }
  const share = all > 0 ? high / all : 0;
  const centroid = all > 0 ? moment / all : 1;
  const bright = share >= 0.2 || centroid >= 3;
  const dark = !bright && share <= 0.1 && centroid <= 2.2;
  return { share, centroid, bright, dark };
}

export function soundFacts(partials) {
  const list = partials || [];
  const lowest = Math.min(...list.map((partial) => partial.ratio).filter((ratio) => ratio > 0));
  const rel = list.map((partial) => partial.ratio / (lowest || 1));
  const near = (index, target, cents) => rel[index] != null && centsOff(rel[index], target) <= cents;
  const harmonic = near(1, 2, 45) && near(2, 3, 45);
  return {
    harmonic,
    inharmonic: !harmonic && rel.length > 2,
    bar: near(1, 2.756, 80) && near(2, 5.404, 110),
    membrane: near(1, 1.594, 70),
    bowl: near(1, 2.8, 80) && near(2, 5.2, 110),
    bellish: near(1, 2, 40) && near(2, 2.4, 40) && near(3, 3, 40),
    damped: highsDieQuickly(list),
    fund: Number(list[0]?.decay) || 0,
  };
}

function highsDieQuickly(partials) {
  if (!partials?.length) return false;
  const fund = partials[0];
  const highs = partials.filter((partial) => partial.ratio > fund.ratio * 2.2);
  if (highs.length < 2) return false;
  return highs.every((partial) => partial.decay < fund.decay * 0.4 && partial.decay < 1);
}

export function describeKnobs(knobs, material, partials = []) {
  const seconds = Number(partials[0]?.decay);
  const long = seconds > 3;
  const short = seconds > 0 && seconds < 1.2;
  const tone = spectrumTone(partials);
  const bright = tone.bright;
  const dark = tone.dark;
  const muted = highsDieQuickly(partials);
  const detuned = Math.abs(knobs.detune) > 0.12;
  const slight = detuned && Math.abs(knobs.detune) <= 0.3;
  const inharmonic = knobs.disperse > 0.3;
  const compressed = knobs.disperse < -0.28;
  const fastHighs = knobs.decayKf > 0.38;
  const ringingHighs = knobs.decayKf < -0.38;
  const sparse = knobs.density <= 8 && material !== 'glass' && material !== 'wood';
  const fund = partials[0];
  const later = partials[Math.min(6, Math.max(0, partials.length - 1))];
  const highsOutlast = fund && later && later.decay > fund.decay * 1.2 && later.ratio > fund.ratio * 2;

  const facts = soundFacts(partials);
  const heard = facts.membrane ? 'skin'
    : facts.bar ? 'wooden'
      : facts.bowl ? 'glass'
        : facts.bellish ? 'bell'
          : 'metal';
  let named = { metal: 'metal', wood: 'wooden', glass: 'glass', skin: 'skin', bell: 'bell' }[material] || 'metal';
  if (named === 'bell' && !facts.bellish) named = heard;
  if (named === 'wooden' && !(facts.bar || facts.damped)) named = heard;
  if (named === 'skin' && !facts.membrane) named = heard;
  if (named === 'glass' && !facts.bowl) named = heard;
  const brief = facts.fund > 0 && facts.fund < 1.5;
  const knock = facts.fund > 0 && facts.fund < 1;

  const noun = named === 'glass'
    ? (brief ? 'ping' : 'shimmer')
    : named === 'wooden'
      ? (knock ? 'knock' : (long ? 'ring' : 'tone'))
      : named === 'skin'
        ? (brief ? 'thump' : (long ? 'ring' : 'tone'))
        : named === 'bell'
          ? 'strike'
          : (long ? 'ring' : 'tone');

  const unusual = [];
  if (sparse && long) unusual.push('a sparse long tail');
  else if (sparse) unusual.push('sparse partials');
  if (inharmonic) unusual.push('stretched partials');
  if (compressed) unusual.push('tight spacing');
  if (fastHighs) unusual.push('upper notes that die fast');
  if (ringingHighs && highsOutlast) unusual.push('highs that outlast the low');
  const woody = muted && knobs.absorb > 0.28;
  if (bright && woody) unusual.push('a glassy top and woody damping');
  else if (bright && (named === 'wooden' || named === 'skin')) unusual.push('a glassy top');
  else if (woody && (named === 'glass' || named === 'bell' || named === 'metal')) unusual.push('woody damping');
  if (short && (named === 'bell' || inharmonic) && !unusual.some((item) => item.includes('skin'))) unusual.push('a skin-like decay');

  const lead = [];
  if (long && !unusual.some((item) => item.includes('long'))) lead.push('long');
  else if (short && !unusual.some((item) => item.includes('skin-like'))) lead.push('short');
  if (bright && !unusual.some((item) => item.includes('glassy'))) lead.push('bright');
  else if (dark && !unusual.some((item) => item.includes('woody'))) lead.push('dark');

  let text = `${lead.join(' ')} ${named} ${noun}`.replace(/\s+/g, ' ').trim();
  if (unusual.length) text += ` with ${unusual.slice(0, 2).join(' and ')}`;
  const tail = [];
  if (!unusual.length && muted) tail.push('muted');
  if (detuned) tail.push(slight ? 'slightly detuned' : 'detuned');
  if (tail.length) {
    const extra = `${text}, ${tail.join(', ')}`;
    if (wordCount(extra) <= 12) text = extra;
  }
  text = cap(text);
  if (wordCount(text) > 12 && unusual.length > 1) {
    text = cap(`${lead.join(' ')} ${named} ${noun} with ${unusual[0]}`.replace(/\s+/g, ' ').trim());
  }
  if (wordCount(text) > 12) text = cap(`${lead.join(' ')} ${named} ${noun}`.trim());
  const rounded = Math.round(seconds);
  if (rounded >= 2) {
    const timed = `${text}, about ${rounded} seconds`;
    if (wordCount(timed) <= 12) text = timed;
  }
  return text;
}

export function descriptionAgrees(text, knobs, partials = []) {
  const line = String(text || '');
  const lower = line.toLowerCase();
  if (wordCount(line) > 12 || wordCount(line) < 2) return false;
  if (line !== cap(line)) return false;
  const fundDecay = Number(partials[0]?.decay);
  const about = lower.match(/about (\d+) seconds?/);
  if (about && Math.abs(Number(about[1]) - fundDecay) > 0.55) return false;
  if (/\bshort\b/.test(lower) && !(fundDecay < 1.2)) return false;
  if (/\blong\b/.test(lower) && !(fundDecay > 3)) return false;
  if (/\bmuted\b/.test(lower) && !highsDieQuickly(partials)) return false;
  if (/\bwoody\b|\bdamped\b/.test(lower) && !(knobs.absorb > 0.28)) return false;
  const tone = spectrumTone(partials);
  if (/\bbright\b/.test(lower) && !tone.bright) return false;
  if (/\bdark\b/.test(lower) && !tone.dark) return false;
  if (/\bdetuned\b/.test(lower) && !(Math.abs(knobs.detune) > 0.1)) return false;
  if (/\bsparse\b/.test(lower) && !(knobs.density <= 8)) return false;
  if (/\bstretched\b|\binharmonic\b/.test(lower) && !(knobs.disperse > 0.25)) return false;
  if (/\btight\b/.test(lower) && !(knobs.disperse < -0.2)) return false;
  if (/\bdie fast\b/.test(lower) && !(knobs.decayKf > 0.35)) return false;
  if (/\bglassy\b/.test(lower) && !tone.bright) return false;
  if (/\bknock\b/.test(lower) && !(fundDecay < 1)) return false;
  if (/\b(thump|ping)\b/.test(lower) && !(fundDecay < 1.5)) return false;
  const facts = soundFacts(partials);
  if (/\bbell\b/.test(lower) && !facts.bellish) return false;
  if (/\bwooden\b|\bwood\b/.test(lower) && !(facts.bar || facts.damped)) return false;
  if (/\bskin\b/.test(lower) && !/skin-like/.test(lower) && !facts.membrane) return false;
  if (/\bglass\b/.test(lower) && !facts.bowl) return false;
  if (/\bskin-like\b/.test(lower) && !(fundDecay < 1.2)) return false;
  if (/\bbeat\b/.test(lower)) return false;
  if (/\bclustered\b/.test(lower)) return false;
  const fund = partials[0];
  const later = partials[Math.min(6, Math.max(0, partials.length - 1))];
  if (/\bhighs keep ringing\b|\bhighs outlast\b/.test(lower)) {
    if (!(fund && later && later.decay > fund.decay * 1.15)) return false;
  }
  return true;
}

export function rollSound({ base, current, material = 'any', amount = 1, wildness = 0.3, locks = defaultLocks(), seed = 1 }) {
  const rng = mulberry32(seed);
  const family = MATERIALS.includes(material) ? material : 'any';
  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const picked = family === 'any' || family === 'wild' ? pick(rng, FAMILIES) : family;
    const target = sampleTarget(rng, family, wildness, picked);
    const profile = profileFor(rng, family, wildness, picked);
    const knobs = capDensity(mixKnobs(current || identityKnobs(), target, amount, locks), profile.partials, locks);
    // Zebra is told to leave Position and Detune at 0. The page uses the
    // same values, so the drawing and the note match the CSV. Detune is not
    // baked into the ratios; that would move the series off its reference.
    if (!locks?.detune) knobs.detune = 0;
    if (!locks?.position) knobs.position = 0.02;
    const partials = shapePartials(profile.partials, toShape(knobs));
    const quality = assessQuality(partials, knobs);
    const description = describeKnobs(knobs, profile.family, partials);
    const candidate = { knobs, partials, profile: profile.partials, quality, description, material: family };
    if (!best || quality.score > best.quality.score) best = candidate;
    if (quality.ok && descriptionAgrees(description, knobs, partials)) return candidate;
  }
  return best;
}
