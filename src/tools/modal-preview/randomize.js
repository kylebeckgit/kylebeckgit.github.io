// Client-side rolls. No network. A material picks a musical range, Wild
// picks a plausible hybrid, and a failed quality check is rolled again.

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
  bell: { decay: [0.1, 0.65], decayKf: [-0.05, 0.4], absorb: [-0.1, 0.3], disperse: [0.28, 0.72], normalize: [0.05, 0.5], detune: [-0.12, 0.18], position: [0.08, 0.36], density: [8, 16, 32], tune: [-6, 6] },
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

function sampleTarget(rng, material, wildness) {
  const w = clamp(Number(wildness) || 0, 0, 1);
  const family = material === 'wild' ? pick(rng, FAMILIES) : material;
  const knobs = sampleFromRange(rng, expandedRange(family, w));
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
  knobs.density = nearestDensity(knobs.density, w > 0.45 ? [8, 16, 32] : (RANGES[family] || RANGES.any).density);
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
    if (fund.decay < 0.05 || fund.decay > 36) reasons.push('decay');
  }
  const decays = list.map((partial) => partial.decay);
  if (decays.some((value) => value < 0.02 || value > 48)) reasons.push('decay');
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
  const clearPitch = loudIndex >= 0 && loudIndex < 4;
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

export function describeKnobs(knobs, material, partials = []) {
  const decay = knobs.decay;
  const long = decay > 0.32;
  const short = decay < -0.28;
  const bright = knobs.normalize > 0.18 || (knobs.absorb < -0.18 && knobs.normalize > -0.15);
  const dark = !bright && (knobs.normalize < -0.22 || knobs.absorb > 0.38);
  const muted = knobs.absorb > 0.42;
  const detuned = Math.abs(knobs.detune) > 0.12;
  const slight = detuned && Math.abs(knobs.detune) <= 0.3;
  const inharmonic = knobs.disperse > 0.3;
  const compressed = knobs.disperse < -0.28;
  const fastHighs = knobs.decayKf > 0.38;
  const ringingHighs = knobs.decayKf < -0.38;
  const sparse = knobs.density <= 8;
  const fund = partials[0];
  const later = partials[Math.min(6, Math.max(0, partials.length - 1))];
  const highsOutlast = fund && later && later.decay > fund.decay * 1.2 && later.ratio > fund.ratio * 2;

  const named = material === 'wild' || material === 'any'
    ? (inharmonic ? 'bell' : short && muted ? 'wooden' : long && bright ? 'glass' : short ? 'skin' : 'metal')
    : { metal: 'metal', wood: 'wooden', glass: 'glass', skin: 'skin', bell: 'bell' }[material] || 'metal';

  const noun = named === 'glass'
    ? (short ? 'ping' : 'shimmer')
    : named === 'wooden'
      ? 'knock'
      : named === 'skin'
        ? 'thump'
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
  if (bright && muted) unusual.push('a glassy top and woody damping');
  else if (bright && (named === 'wooden' || named === 'skin')) unusual.push('a glassy top');
  else if (muted && (named === 'glass' || named === 'bell' || named === 'metal')) unusual.push('woody damping');
  if (short && (named === 'bell' || inharmonic) && !unusual.some((item) => item.includes('skin'))) unusual.push('a skin-like decay');

  const lead = [];
  if (long && !unusual.some((item) => item.includes('long'))) lead.push('long');
  else if (short && !unusual.some((item) => item.includes('skin-like'))) lead.push('short');
  if (bright && !unusual.some((item) => item.includes('glassy'))) lead.push('bright');
  else if (dark && !unusual.some((item) => item.includes('woody'))) lead.push('dark');

  let text = `${lead.join(' ')} ${named} ${noun}`.replace(/\s+/g, ' ').trim();
  if (unusual.length) text += ` with ${unusual.slice(0, 2).join(' and ')}`;
  else {
    const tail = [];
    if (muted) tail.push('muted');
    if (detuned) tail.push(slight ? 'slightly detuned' : 'detuned');
    if (tail.length) text += `, ${tail.join(', ')}`;
  }
  text = cap(text);
  if (wordCount(text) > 12 && unusual.length > 1) {
    text = cap(`${lead.join(' ')} ${named} ${noun} with ${unusual[0]}`.replace(/\s+/g, ' ').trim());
  }
  if (wordCount(text) > 12) text = cap(`${lead.join(' ')} ${named} ${noun}`.trim());
  return text;
}

export function descriptionAgrees(text, knobs, partials = []) {
  const line = String(text || '');
  const lower = line.toLowerCase();
  if (wordCount(line) > 12 || wordCount(line) < 2) return false;
  if (line !== cap(line)) return false;
  if (knobs.decay > 0.4 && /\bshort\b/.test(lower)) return false;
  if (knobs.decay < -0.4 && /\blong\b/.test(lower)) return false;
  if (/\bglass\b/.test(lower) && !(knobs.normalize > 0.05 || knobs.absorb < 0.15 || knobs.decay > 0.2)) return false;
  if (/\bwoody\b|\bdamped\b|\bmuted\b/.test(lower) && !(knobs.absorb > 0.28)) return false;
  if (/\bbright\b/.test(lower) && !(knobs.normalize > 0.12 || (knobs.absorb < -0.12 && knobs.normalize > -0.15))) return false;
  if (/\bdark\b/.test(lower) && !(knobs.normalize < -0.12 || knobs.absorb > 0.28)) return false;
  if (/\bdetuned\b/.test(lower) && !(Math.abs(knobs.detune) > 0.1)) return false;
  if (/\bsparse\b/.test(lower) && !(knobs.density <= 8)) return false;
  if (/\bstretched\b|\binharmonic\b/.test(lower) && !(knobs.disperse > 0.25)) return false;
  if (/\btight\b/.test(lower) && !(knobs.disperse < -0.2)) return false;
  if (/\bdie fast\b/.test(lower) && !(knobs.decayKf > 0.35)) return false;
  if (/\bglassy\b/.test(lower) && !(knobs.normalize > 0.12 || (knobs.absorb < -0.12 && knobs.normalize > -0.15))) return false;
  if (/\bskin-like\b/.test(lower) && !(knobs.decay < -0.2)) return false;
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
    const target = sampleTarget(rng, family, wildness);
    const knobs = mixKnobs(current || identityKnobs(), target, amount, locks);
    const partials = shapePartials(base, toShape(knobs));
    const quality = assessQuality(partials, knobs);
    const description = describeKnobs(knobs, family, partials);
    const candidate = { knobs, partials, quality, description, material: family };
    if (!best || quality.score > best.quality.score) best = candidate;
    if (quality.ok && descriptionAgrees(description, knobs, partials)) return candidate;
  }
  return best;
}
