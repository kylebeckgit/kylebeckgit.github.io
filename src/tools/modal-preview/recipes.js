// Local stand-in for the model. It reads a sentence as a physical object
// (what it is, how it is played, how it dies) and the editor's existing
// series turns that into partials. It does not invent 64 numbers.

import { planVariation, sanitizeControls } from './engine.js';
import { ADJECTIVES, hashFallback, matchReading, sceneId } from './vocabulary.js';

export const STARTERS = [
  starter('Soft glass bowl', 'A glass bowl struck softly, with a long shimmer.', 'plate', { stiffness: 0.18, brightness: 0.28, damping: 0.16, oddEven: 0, seed: 0 }, { exciter: 'mallet', hardness: 0.22, position: 0.16 }),
  starter('Rosewood bar', 'A rosewood bar, warm and fairly short.', 'bar', { stiffness: 0.16, brightness: -0.22, damping: 0.5, oddEven: 0, seed: 0 }, { exciter: 'mallet', hardness: 0.48, position: 0.22 }),
  starter('Prayer bell', 'A small prayer bell with a long ring.', 'bell', { stiffness: 0.36, brightness: 0.3, damping: 0.18, oddEven: 0, seed: 0 }, { exciter: 'mallet', hardness: 0.35, position: 0.12 }),
  starter('Gamelan pot', 'A gamelan pot, inharmonic and fairly bright.', 'bell', { stiffness: 0.64, brightness: 0.16, damping: 0.32, oddEven: 0.08, seed: 0 }, { exciter: 'mallet', hardness: 0.5, position: 0.2 }),
  starter('Log drum', 'A hollow log drum, dark and short.', 'membrane', { stiffness: 0.06, brightness: -0.35, damping: 0.74, oddEven: 0, seed: 0 }, { exciter: 'mallet', hardness: 0.62, position: 0.4 }),
  starter('Bowed plate', 'A large metal plate, bowed.', 'plate', { stiffness: 0.22, brightness: 0.05, damping: 0.28, oddEven: 0.15, seed: 0 }, { exciter: 'bow', hardness: 0.4, position: 0.14 }),
];

function starter(name, line, preset, controls, play) {
  return {
    name,
    objectName: name,
    line,
    controls: { preset, ...controls },
    exciter: play.exciter,
    hardness: play.hardness,
    position: play.position,
    velocity: 0.8,
  };
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function hashString(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) || 1;
}

export function objectName(text) {
  const source = String(text || '').toLowerCase();
  return matchReading(source).object?.name || matchReading(source).material?.name || '';
}

function familyOf(text) {
  const reading = matchReading(text);
  if (reading.object || reading.material) return reading;
  if (sceneId(text)) return { scene: sceneId(text) };
  return null;
}

function neutralRecipe() {
  return {
    objectName: 'Neutral',
    controls: { preset: 'string', voice: 'neutral', count: 8, stiffness: 0, brightness: 0, damping: 0.35, oddEven: 0, seed: 0 },
    exciter: 'click',
    hardness: 0.4,
    position: 0.18,
    velocity: 0.7,
    recognized: false,
    empty: true,
  };
}

function blankRecipe() {
  return {
    objectName: 'Profile',
    controls: { preset: 'plate', stiffness: 0.12, brightness: 0.1, damping: 0.35, oddEven: 0, seed: 0 },
    exciter: 'mallet',
    hardness: 0.45,
    position: 0.18,
    velocity: 0.8,
    recognized: false,
  };
}

function applyEntry(recipe, entry, promptText) {
  recipe.objectName = entry.name;
  recipe.material = entry.material;
  recipe.shape = entry.shape;
  recipe.size = entry.size || 'medium';
  recipe.traits = [...(entry.traits || [])];
  recipe.fallback = Boolean(entry.fallback);
  recipe.controls.preset = entry.preset;
  recipe.controls.stiffness = entry.stiffness ?? 0;
  recipe.controls.brightness = entry.brightness ?? 0;
  recipe.controls.damping = entry.damping ?? 0.35;
  recipe.controls.oddEven = entry.oddEven ?? 0;
  recipe.controls.voice = entry.voice || '';
  recipe.controls.count = entry.count || 64;
  recipe.controls.pitchScale = entry.pitchScale || 1;
  const spread = hashString(entry.name);
  if (entry.fallback) recipe.controls.seed = entry.seed || 1;
  else if (entry.seed) recipe.controls.seed = hashString(promptText || entry.name);
  else recipe.controls.seed = spread % 800000;
  if (entry.role === 'material') {
    recipe.controls.count = clamp((recipe.controls.count || 16) + (spread % 7) - 3, 3, 64);
    recipe.controls.brightness = clamp(recipe.controls.brightness + (((spread >> 4) % 9) - 4) * 0.06, -1, 1);
    recipe.controls.damping = clamp(recipe.controls.damping + (((spread >> 8) % 7) - 3) * 0.05, 0, 1);
    recipe.controls.stiffness = clamp((recipe.controls.stiffness || 0) + (((spread >> 12) % 7) - 3) * 0.04, 0, 1);
  }
  recipe.controls.variation = '';
  recipe.controls.variationTilt = 0;
  recipe.controls.variationDecay = 1;
  recipe.controls.variationLift = 0;
  recipe.exciter = entry.exciter || 'mallet';
  recipe.hardness = entry.hardness ?? 0.5;
  recipe.position = entry.position ?? recipe.position ?? 0.18;
  recipe.velocity = entry.velocity ?? recipe.velocity ?? 0.8;
  recipe.recognized = true;
}

function overlayMaterial(recipe, material) {
  if (!material || material.material === recipe.material) return;
  recipe.material = material.material;
  recipe.controls.brightness = clamp(recipe.controls.brightness + (material.brightness ?? 0) * 0.45, -1, 1);
  recipe.controls.damping = clamp(recipe.controls.damping + Math.max(-0.2, Math.min(0.2, (material.damping ?? 0.4) - 0.4)), 0, 1);
  if (recipe.controls.voice === 'glass' || recipe.controls.voice === 'crystal') recipe.controls.voice = '';
  recipe.traits = [...(recipe.traits || []), material.material];
}

function applyAdjectives(recipe, text) {
  for (const adjective of ADJECTIVES) {
    if (!adjective.test.test(text)) continue;
    if (adjective.size) recipe.size = adjective.size;
    if (adjective.material) recipe.material = adjective.material;
    if (adjective.damping) recipe.controls.damping = clamp(recipe.controls.damping + adjective.damping, 0, 1);
    if (adjective.brightness) recipe.controls.brightness = clamp(recipe.controls.brightness + adjective.brightness, -1, 1);
    if (adjective.stiffness) recipe.controls.stiffness = clamp(recipe.controls.stiffness + adjective.stiffness, 0, 1);
    if (adjective.oddEven) recipe.controls.oddEven = clamp((recipe.controls.oddEven || 0) + adjective.oddEven, -1, 1);
    if (adjective.countScale) recipe.controls.count = clamp(Math.round((recipe.controls.count || 16) * adjective.countScale), 3, 64);
    if (adjective.hardness != null) recipe.hardness = adjective.hardness;
    if (adjective.velocity != null) recipe.velocity = adjective.velocity;
    if (adjective.decayScale) recipe.controls.decayScale = (recipe.controls.decayScale || 1) * adjective.decayScale;
    if (adjective.pitchScale) recipe.controls.pitchScale = (recipe.controls.pitchScale || 1) * adjective.pitchScale;
    if (adjective.seed) recipe.controls.seed = hashString(text);
    recipe.traits = [...(recipe.traits || []), adjective.label];
  }
}

function applyImagery(recipe, text) {
  const broken = /\bbroken\b|\bcracked\b|\bshattered\b|\bsplintered\b/.test(text);
  if (broken && recipe.material === 'glass') {
    recipe.controls.preset = 'plate';
    recipe.controls.voice = '';
    recipe.controls.brightness = Math.max(recipe.controls.brightness, 0.7);
    recipe.controls.damping = Math.max(recipe.controls.damping, 0.78);
    recipe.controls.stiffness = Math.max(recipe.controls.stiffness, 0.72);
    recipe.controls.seed = hashString(text);
    recipe.controls.count = Math.max(12, Math.min(28, recipe.controls.count || 16));
    recipe.controls.decayScale = Math.min(recipe.controls.decayScale || 1, 0.28);
    recipe.traits = [...new Set([...(recipe.traits || []), 'bright', 'short', 'noisy'])];
  }
}

function composeReading(recipe, text) {
  const body = `a ${recipe.size || 'medium'} ${recipe.material || 'unknown'} ${recipe.shape || 'body'}`;
  const traits = [...new Set(recipe.traits || [])].filter(Boolean);
  const tail = traits.length ? `, ${traits.join(', ')}` : '';
  if (recipe.fallback) return `No listed object. Heard “${text}” as ${body}${tail}.`;
  return `${recipe.objectName}: ${body}${tail}.`;
}

function applyWords(recipe, text, refine) {
  const controls = recipe.controls;
  if (/soft|gentle|quietly|feather/.test(text)) {
    recipe.hardness = 0.22;
    recipe.velocity = 0.55;
    if (recipe.exciter !== 'bow') recipe.exciter = 'mallet';
  }
  if (/hard strike|struck hard|heavy/.test(text)) {
    recipe.hardness = 0.85;
    recipe.velocity = 0.95;
  }
  if (refine) {
    if (/darker|dark|warm|dull|wood/.test(text)) controls.brightness -= /darker/.test(text) ? 0.32 : 0.22;
    if (/brighter|bright|thin|glassy/.test(text)) controls.brightness += 0.3;
    if (/wood/.test(text)) controls.damping += 0.16;
    if (/shorter|short tail|tighter|drier|muted/.test(text)) controls.damping += 0.28;
    if (/longer|long tail|shimmer|sustain|ring/.test(text)) controls.damping -= 0.22;
    // The knobs are already against the clamp on a black hole or a gong.
    // Move the plan that Hear is actually playing.
    if (/darker|dark|warm|dull/.test(text)) controls.variationTilt = (controls.variationTilt || 0) - (/darker/.test(text) ? 18 : 12);
    if (/brighter|bright|thin|glassy/.test(text)) controls.variationTilt = (controls.variationTilt || 0) + 14;
    if (/shorter|short tail|tighter|drier|muted/.test(text)) {
      controls.variationDecay = Math.max(0.2, (controls.variationDecay || 1) * 0.62);
      controls.variationLift = 0;
    }
    if (/longer|long tail|shimmer|sustain|ring/.test(text)) {
      controls.variationDecay = Math.min(4, (controls.variationDecay || 1) * 1.45);
    }
  } else {
    if (/dark|warm|dull/.test(text)) controls.brightness -= 0.28;
    if (/bright|thin|glassy/.test(text) && !/not bright/.test(text)) controls.brightness += 0.12;
    if (/wood/.test(text) && controls.preset !== 'bar') {
      controls.brightness -= 0.18;
      controls.damping += 0.14;
    }
    if (/short|tight|dry|muted/.test(text)) controls.damping += 0.26;
    if (/long|shimmer|sustain|ring/.test(text)) controls.damping -= 0.2;
  }
  if (/detun|beating|imperfect|chorus|out of tune/.test(text)) {
    controls.stiffness += refine ? 0.14 : 0.12;
    controls.seed = hashString(text) % 900000;
  }
  if (/nylon/.test(text)) {
    controls.brightness -= 0.16;
    controls.damping += 0.14;
  }
  if (/holz|madera|\bbois\b|legno/.test(text)) {
    controls.brightness -= 0.16;
    controls.damping += 0.12;
    if (!recipe.recognized) {
      controls.preset = 'bar';
      recipe.recognized = true;
    }
  }
  if (/metall|\bmetal\b|acier|acero|ottone|messing|bronze|brass/.test(text)) controls.damping -= 0.06;
  if (/kleine|klein|\bsmall\b|tiny|小さな/.test(text)) {
    controls.damping += 0.1;
    controls.brightness += 0.06;
  }
  if (/寺|temple/.test(text) && controls.preset === 'bell') {
    controls.brightness -= 0.1;
    controls.damping -= 0.05;
  }
  if (/\bbow(?:ed|ing)?\b/.test(text)) recipe.exciter = 'bow';
  else if (/pluck|picked/.test(text)) recipe.exciter = 'click';
  else if (/blow|breath/.test(text)) recipe.exciter = 'burst';
  else if (/struck|mallet|tap/.test(text) && recipe.exciter !== 'bow') recipe.exciter = 'mallet';
  if (/edge|rim/.test(text)) recipe.position = 0.08;
  if (/cent(er|re)/.test(text)) recipe.position = 0.48;
  controls.stiffness = clamp(controls.stiffness, 0, 1);
  controls.brightness = clamp(controls.brightness, -1, 1);
  controls.damping = clamp(controls.damping, 0, 1);
  controls.oddEven = clamp(controls.oddEven, -1, 1);
  recipe.hardness = clamp(recipe.hardness, 0, 1);
  recipe.velocity = clamp(recipe.velocity, 0, 1);
  recipe.position = clamp(recipe.position, 0.02, 0.98);
}

export function readRecipe(prompt, current = null) {
  const text = String(prompt || '').toLowerCase();
  const recipe = current ? {
    objectName: current.objectName || 'Profile',
    material: current.material,
    shape: current.shape,
    size: current.size,
    traits: [...(current.traits || [])],
    fallback: false,
    controls: { ...current.controls },
    exciter: current.exciter,
    hardness: current.hardness,
    position: current.position,
    velocity: current.velocity ?? 0.8,
    recognized: true,
  } : blankRecipe();
  const reading = matchReading(text);
  const scene = sceneId(text);
  const named = reading.object || (scene ? matchReading(scene).object : null);
  if (!current || named) {
    const entry = named || (!current ? reading.material : null);
    if (entry) applyEntry(recipe, entry, text);
    else if (!current && text.trim()) applyEntry(recipe, hashFallback(text, hashString(text)), text);
  }
  if (reading.object && reading.material && reading.material.material !== recipe.material) {
    overlayMaterial(recipe, reading.material);
  }
  applyAdjectives(recipe, text);
  applyImagery(recipe, text);
  applyWords(recipe, text, Boolean(current));
  recipe.reading = composeReading(recipe, text);
  recipe.controls = sanitizeControls(recipe.controls);
  return recipe;
}

function axes(text) {
  const wantsShort = /short|tight|dry|muted/.test(text);
  const wantsLong = /long|shimmer|sustain|ring|tail/.test(text) && !wantsShort;
  const wantsDetune = /detun|beating|imperfect|chorus/.test(text);
  // The fourth card is a contrast, so a prompt that already asks for a long
  // shimmer does not get a second card that cannot get any longer.
  const fourth = wantsLong && wantsDetune
    ? { key: 'detune', stiffness: 0.18, name: (object) => `Detuned ${object.toLowerCase()}`, line: 'More stiffness, so the upper partials sit further from the harmonic series.' }
    : wantsLong
      ? { key: 'dry', damping: 0.28, name: (object) => `Short ${object.toLowerCase()}`, line: 'The same object, with the partials dying faster.' }
      : wantsShort
        ? { key: 'long', damping: -0.24, name: (object) => `Long ${object.toLowerCase()}`, line: 'Lower damping, so the high partials hang on.' }
        : wantsDetune
          ? { key: 'detune', stiffness: 0.18, name: (object) => `Detuned ${object.toLowerCase()}`, line: 'More stiffness, so the upper partials sit further from the harmonic series.' }
          : { key: 'long', damping: -0.22, name: (object) => `Long ${object.toLowerCase()}`, line: 'Lower damping, so the high partials hang on.' };
  return [
    { key: 'close', name: (object) => object, line: 'The closest reading of the description.' },
    { key: 'bright', brightness: 0.3, damping: 0.05, name: (object) => `Bright ${object.toLowerCase()}`, line: 'The same body, with more energy in the high partials.' },
    { key: 'dark', brightness: -0.32, damping: 0.12, name: (object) => `Dark ${object.toLowerCase()}`, line: 'Less top, and a little more damping.' },
    fourth,
  ];
}

function shift(recipe, axis) {
  const controls = { ...recipe.controls };
  if (axis.brightness) controls.brightness = clamp(controls.brightness + axis.brightness, -1, 1);
  if (axis.damping) controls.damping = clamp(controls.damping + axis.damping, 0, 1);
  if (axis.stiffness) controls.stiffness = clamp(controls.stiffness + axis.stiffness, 0, 1);
  // The knob step still moves the panel. The plan is what the voice formulas
  // cannot do: a gong drops brightness, and a black hole is already at both clamps.
  const plan = planVariation(recipe.controls, controls, axis.key);
  return sanitizeControls({ ...controls, ...plan });
}

function withPlay(core, controls, name, line) {
  return {
    name,
    objectName: core.objectName,
    line,
    controls,
    exciter: core.exciter,
    hardness: core.hardness,
    position: core.position,
    velocity: core.velocity,
    recognized: core.recognized,
    material: core.material,
    shape: core.shape,
    size: core.size,
    traits: core.traits,
    reading: core.reading,
    fallback: core.fallback,
  };
}

function blendControls(from, to, amount) {
  const mix = (key) => from[key] + (to[key] - from[key]) * amount;
  return sanitizeControls({
    preset: to.preset,
    stiffness: mix('stiffness'),
    brightness: mix('brightness'),
    damping: mix('damping'),
    oddEven: mix('oddEven'),
    seed: to.seed,
    voice: to.voice,
    count: to.count,
    decayScale: (from.decayScale ?? 1) + ((to.decayScale ?? 1) - (from.decayScale ?? 1)) * amount,
    pitchScale: (from.pitchScale ?? 1) + ((to.pitchScale ?? 1) - (from.pitchScale ?? 1)) * amount,
    variationTilt: (from.variationTilt || 0) + ((to.variationTilt || 0) - (from.variationTilt || 0)) * amount,
    variationDecay: (from.variationDecay || 1) + ((to.variationDecay || 1) - (from.variationDecay || 1)) * amount,
    variationLift: (from.variationLift || 0) + ((to.variationLift || 0) - (from.variationLift || 0)) * amount,
    variation: from.variation === to.variation
      ? (to.variation || '')
      : ((amount >= 0.5 ? to.variation : from.variation) || ''),
  });
}

function pushFurther(core, previous) {
  const controls = { ...core.controls };
  for (const key of ['stiffness', 'brightness', 'damping', 'oddEven']) {
    const delta = core.controls[key] - previous.controls[key];
    if (Math.abs(delta) > 0.001) controls[key] = core.controls[key] + delta * 0.65;
  }
  return sanitizeControls(controls);
}

function sideStep(core, text) {
  const controls = { ...core.controls };
  const object = core.objectName.toLowerCase();
  if (/dark|warm|dull|wood/.test(text)) {
    controls.damping += 0.18;
    controls.variationDecay = Math.max(0.2, (controls.variationDecay || 1) * 0.7);
    controls.variationLift = 0;
    return { controls: sanitizeControls(controls), name: `Shorter ${object}`, line: 'The darker reading, with a shorter tail.' };
  }
  if (/short|tight|dry|muted/.test(text)) {
    controls.brightness -= 0.2;
    controls.variationTilt = (controls.variationTilt || 0) - 10;
    return { controls: sanitizeControls(controls), name: `Darker ${object}`, line: 'The shorter reading, with less top.' };
  }
  if (/long|shimmer|sustain|ring/.test(text)) {
    controls.brightness += 0.18;
    controls.variationTilt = (controls.variationTilt || 0) + 10;
    return { controls: sanitizeControls(controls), name: `Brighter ${object}`, line: 'The longer reading, with a brighter top.' };
  }
  if (/detun|beating|imperfect|chorus/.test(text)) {
    controls.damping -= 0.12;
    controls.variationDecay = Math.min(4, (controls.variationDecay || 1) * 1.35);
    return { controls: sanitizeControls(controls), name: `Longer ${object}`, line: 'The detuned reading, left to ring longer.' };
  }
  controls.stiffness += 0.12;
  return { controls: sanitizeControls(controls), name: `Stiffer ${object}`, line: 'The same change, with a less harmonic top.' };
}

function graded(core, previous, text) {
  const object = core.objectName;
  const side = sideStep(core, text);
  return [
    withPlay(core, core.controls, object, 'The change, applied to the variation you had selected.'),
    withPlay(core, pushFurther(core, previous), `Further ${object.toLowerCase()}`, 'The same change, pushed a bit further.'),
    withPlay(core, blendControls(previous.controls, core.controls, 0.45), `Halfway ${object.toLowerCase()}`, 'Partway back toward the variation you had.'),
    withPlay(core, side.controls, side.name, side.line),
  ];
}

export function describePrompt(prompt, current = null) {
  if (!current && !String(prompt || '').trim()) {
    const core = neutralRecipe();
    return [withPlay(core, sanitizeControls(core.controls), 'Neutral', 'Try describing an object. This is only a plain tone.')];
  }
  const core = readRecipe(prompt, current);
  const text = String(prompt || '').toLowerCase();
  if (current && !familyOf(text)) return graded(core, current, text);
  return axes(text).map((axis) => withPlay(core, shift(core, axis), axis.name(core.objectName), axis.line));
}

export function fileSlug(name) {
  const slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  return `${slug || 'modal-profile'}.csv`;
}
