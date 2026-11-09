// Local stand-in for the model. It reads a sentence as a physical object
// (what it is, how it is played, how it dies) and the editor's existing
// series turns that into partials. It does not invent 64 numbers.

import { sanitizeControls } from './engine.js';

const FAMILIES = [
  { test: /rubber/, preset: 'string', stiffness: 0.01, brightness: -0.4, damping: 0.82, oddEven: 0, exciter: 'click', hardness: 0.3 },
  { test: /mug|ceramic|porcelain|\bcup\b/, preset: 'bell', voice: 'cup', count: 8, stiffness: 0.02, brightness: -0.08, damping: 0.48, oddEven: 0, exciter: 'mallet', hardness: 0.45 },
  { test: /\bcan\b|\btin\b/, preset: 'plate', voice: 'shell', count: 20, stiffness: 0.02, brightness: 0.12, damping: 0.42, oddEven: 0, exciter: 'mallet', hardness: 0.7 },
  { test: /tube|aluminium|aluminum|röhre|\brohr\b|tuyau|\btubo\b/, preset: 'open-pipe', stiffness: 0.04, brightness: 0.18, damping: 0.22, oddEven: 0, exciter: 'mallet', hardness: 0.55 },
  { test: /gamelan|bonang|gender|gangsa/, preset: 'bell', stiffness: 0.62, brightness: 0.12, damping: 0.3, oddEven: 0.05, exciter: 'mallet', hardness: 0.45 },
  { test: /clarinett?|closed pipe/, preset: 'closed-pipe', stiffness: 0.02, brightness: -0.05, damping: 0.42, oddEven: 0.85, exciter: 'burst', hardness: 0.4 },
  { test: /flute|shakuhachi|panpipe|open pipe/, preset: 'open-pipe', stiffness: 0.02, brightness: 0.1, damping: 0.48, oddEven: 0.1, exciter: 'burst', hardness: 0.35 },
  { test: /drum|membrane|skin|djembe|log|trommel|tambou?r|tamburo/, preset: 'membrane', stiffness: 0.08, brightness: -0.25, damping: 0.72, oddEven: 0, exciter: 'mallet', hardness: 0.6 },
  { test: /bonsho|梵鐘|鐘/, preset: 'bell', voice: 'bonsho', count: 12, stiffness: 0, brightness: 0, damping: 0.12, oddEven: 0, exciter: 'mallet', hardness: 0.4 },
  { test: /gong|cymbal|tam-?tam/, preset: 'plate', voice: 'gong', count: 40, stiffness: 0, brightness: 0.02, damping: 0.12, oddEven: 0, exciter: 'mallet', hardness: 0.7 },
  { test: /singing bowl|glass bowl|crystal bowl|crystal|verre|vidrio|\bglas\b|\bglass\b/, preset: 'plate', voice: 'glass', count: 12, stiffness: 0.02, brightness: -0.08, damping: 0.08, oddEven: 0, exciter: 'mallet', hardness: 0.25 },
  { test: /bell|chime|glocke|cloche|campana/, preset: 'bell', stiffness: 0.04, brightness: 0, damping: 0.2, oddEven: 0, exciter: 'mallet', hardness: 0.42 },
  { test: /stahlplatte|\bplatte\b|blech|\bplate\b|\bsteel\b/, preset: 'plate', voice: '', count: 64, stiffness: 0.05, brightness: 0.48, damping: 0.3, oddEven: 0, exciter: 'mallet', hardness: 0.72 },
  { test: /marimba|xylophone|vibraphone|rosewood|wood bar|\bbar\b/, preset: 'bar', voice: 'marimba', count: 12, stiffness: 0.04, brightness: -0.12, damping: 0.42, oddEven: 0, exciter: 'mallet', hardness: 0.55 },
  { test: /piano|guitar|harp|string|pluck|saite|cuerda|\bcorde\b/, preset: 'string', stiffness: 0.04, brightness: 0.05, damping: 0.4, oddEven: 0, exciter: 'click', hardness: 0.5 },
];

const OBJECT_NAMES = [
  [/glass bowl|crystal bowl/, 'Glass bowl'],
  [/singing bowl/, 'Singing bowl'],
  [/gamelan/, 'Gamelan'],
  [/marimba/, 'Marimba'],
  [/xylophone/, 'Xylophone'],
  [/rosewood/, 'Rosewood bar'],
  [/prayer bell|temple bell/, 'Prayer bell'],
  [/鐘|bonsho|梵鐘/, 'Bonsho'],
  [/glocke|cloche|campana/, 'Bell'],
  [/bell/, 'Bell'],
  [/gong/, 'Gong'],
  [/stahlplatte|\bplatte\b/, 'Plate'],
  [/cymbal/, 'Cymbal'],
  [/drum/, 'Drum'],
  [/flute/, 'Flute'],
  [/clarinet/, 'Clarinet'],
  [/guitar/, 'Guitar'],
  [/piano/, 'Piano'],
  [/metal plate|\bplate\b/, 'Metal plate'],
  [/bowl/, 'Bowl'],
  [/string/, 'String'],
];

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
  for (const [test, name] of OBJECT_NAMES) {
    if (test.test(source)) return name;
  }
  return '';
}

function mentions(text, test) {
  const re = new RegExp(test.source, test.flags.includes('g') ? test.flags : `${test.flags}g`);
  let match;
  while ((match = re.exec(text))) {
    const before = text.slice(Math.max(0, match.index - 64), match.index);
    if (/\bnot\b|\bno\b|n't\b/.test(before)) continue;
    return true;
  }
  return false;
}

function familyOf(text) {
  for (const family of FAMILIES) {
    if (mentions(text, family.test)) return family;
  }
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

function applyFamily(recipe, family) {
  recipe.controls.preset = family.preset;
  recipe.controls.stiffness = family.stiffness;
  recipe.controls.brightness = family.brightness;
  recipe.controls.damping = family.damping;
  recipe.controls.oddEven = family.oddEven;
  recipe.controls.voice = family.voice || '';
  recipe.controls.count = family.count || 64;
  recipe.exciter = family.exciter;
  recipe.hardness = family.hardness;
  recipe.recognized = true;
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
    controls: { ...current.controls },
    exciter: current.exciter,
    hardness: current.hardness,
    position: current.position,
    velocity: current.velocity ?? 0.8,
    recognized: true,
  } : blankRecipe();
  const family = familyOf(text);
  if (family && (!current || family.test.test(text))) applyFamily(recipe, family);
  const named = objectName(text);
  if (named) recipe.objectName = named;
  applyWords(recipe, text, Boolean(current));
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
  return sanitizeControls(controls);
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
    return { controls: sanitizeControls(controls), name: `Shorter ${object}`, line: 'The darker reading, with a shorter tail.' };
  }
  if (/short|tight|dry|muted/.test(text)) {
    controls.brightness -= 0.2;
    return { controls: sanitizeControls(controls), name: `Darker ${object}`, line: 'The shorter reading, with less top.' };
  }
  if (/long|shimmer|sustain|ring/.test(text)) {
    controls.brightness += 0.18;
    return { controls: sanitizeControls(controls), name: `Brighter ${object}`, line: 'The longer reading, with a brighter top.' };
  }
  if (/detun|beating|imperfect|chorus/.test(text)) {
    controls.damping -= 0.12;
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
