// The generator keeps its own variations. The designer is a separate body
// until Open in designer copies the chosen partials across.

import { SILENT_MODE_HINT, beginAudio, installGestureUnlock, playSilentUnlock, prepareAudioSession, resumeInGesture, audioContextClass } from './audio-session.js';
import { audiblePartials, defaultControls, heardSeconds, playedFundamental, previewPartials, sanitizeControls } from './engine.js';
import { combHeights, defaultCamera, hitPartial, paintModalView, sliceFromPartial, spaceByLog } from './modal-view.js';
import { paintObject } from './object-view.js';
import { describePrompt } from './recipes.js';
import { renderPreview, scaleToPeak } from './resonator.js';
import { mountStudio } from './studio.js';
import { assessQuality, createRollHistory, defaultLocks, identityKnobs, pushRoll, redoRoll, rollSound, undoRoll } from './randomize.js';

const EVERYDAY = [
  'wood block', 'glass bowl', 'gong', 'marimba', 'ceramic bowl', 'prayer bell', 'cowbell',
  'string', 'plate', 'chime', 'wind chime', 'stone', 'bamboo', 'log drum', 'crystal',
  'cymbal', 'flute', 'kalimba', 'handpan', 'wine glass', 'music box', 'anvil', 'cajon',
  'temple block', 'clave', 'vibraphone', 'didgeridoo', 'clarinet', 'typewriter', 'trash can',
  'cardboard box', 'plastic bottle', 'church bell', 'singing bowl', 'thumb piano',
];
const MATERIALS = ['glass', 'wood', 'ice', 'stone', 'metal', 'skin', 'clay', 'water'];
const ADJECTIVES = ['tiny', 'huge', 'broken', 'frozen', 'rusty', 'hollow', 'distant', 'alien', 'underwater'];
const STATES = ['melting', 'burning', 'underwater', 'inside out', 'frozen', 'hollow'];
const ABSTRACTS = [
  'the color of rust',
  'a memory of rain',
  'a memory of thunder',
  'a memory of a bell',
  'distant rain',
  'alien thunder',
];

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
  return list[Math.floor(rng() * list.length)];
}

const CLASHES = [
  ['frozen', 'melting'],
  ['frozen', 'burning'],
  ['burning', 'underwater'],
  ['burning', 'ice'],
  ['burning', 'water'],
];

function clashes(left, right) {
  return CLASHES.some(([a, b]) => (left === a && right === b) || (left === b && right === a));
}

function statesFor(adjective, material) {
  const states = STATES.filter((state) => state !== adjective && !clashes(adjective, state) && !clashes(material, state));
  return states.length ? states : ['inside out'];
}

export function highWildPrompts() {
  const prompts = [];
  for (const noun of EVERYDAY) {
    for (const material of MATERIALS) prompts.push(`${noun} made of ${material}`);
    prompts.push(`planet-sized ${noun}`, `a ${noun} the size of a grain of sand`, `${noun} in a cathedral at the bottom of the sea`);
    for (const state of STATES) prompts.push(`${state} ${noun}`);
  }
  prompts.push(...ABSTRACTS);
  for (const adjective of ADJECTIVES) {
    for (const noun of EVERYDAY) {
      for (const material of MATERIALS) {
        for (const state of statesFor(adjective, material)) {
          prompts.push(`${adjective} ${noun} made of ${material}, ${state}`);
        }
      }
    }
  }
  return prompts;
}

export function promptSpaceSize() {
  const everyday = EVERYDAY.length;
  const mid = ADJECTIVES.length * EVERYDAY.length + MATERIALS.length * EVERYDAY.length;
  const high = highWildPrompts().length;
  return { everyday, mid, high, total: everyday + mid + high };
}

export const HIGH_WILDNESS = 0.7;

export function promptForRoll(seed, wildness = 0.3) {
  const rng = mulberry32(Number(seed) || 1);
  const wild = Math.min(1, Math.max(0, Number(wildness) || 0));
  const object = () => pick(rng, EVERYDAY);
  const material = () => pick(rng, MATERIALS);
  const adjective = () => pick(rng, ADJECTIVES);
  const state = () => pick(rng, STATES);
  if (wild < 0.34) return object();
  if (wild < HIGH_WILDNESS) {
    return rng() < 0.55 ? `${adjective()} ${object()}` : `${material()} ${object()}`;
  }
  const roll = rng();
  const noun = object();
  if (roll < 0.07) return `${noun} made of ${material()}`;
  if (roll < 0.13) return `planet-sized ${noun}`;
  if (roll < 0.19) return `a ${noun} the size of a grain of sand`;
  if (roll < 0.26) return `${state()} ${noun}`;
  if (roll < 0.33) return `${noun} in a cathedral at the bottom of the sea`;
  if (roll < 0.38) return pick(rng, ABSTRACTS);
  const adj = adjective();
  const mat = material();
  return `${adj} ${noun} made of ${mat}, ${pick(rng, statesFor(adj, mat))}`;
}

const BLEND_VOICES = [
  { preset: 'bar', voice: '', count: 6 },
  { preset: 'bell', voice: '', count: 7 },
  { preset: 'plate', voice: '', count: 7 },
  { preset: 'membrane', voice: '', count: 6 },
  { preset: 'string', voice: '', count: 7 },
  { preset: 'plate', voice: 'glass', count: 6 },
  { preset: 'plate', voice: 'crystal', count: 7 },
];

function copyPartial(partial) {
  return { ratio: partial.ratio, gainDb: partial.gainDb, decay: partial.decay };
}

function spacePartials(partials) {
  const sorted = partials.filter((partial) => partial.ratio > 0).sort((a, b) => a.ratio - b.ratio);
  const kept = [];
  for (const partial of sorted) {
    const prev = kept[kept.length - 1];
    if (prev && Math.abs(1200 * Math.log2(partial.ratio / prev.ratio)) < 40) continue;
    kept.push(partial);
    if (kept.length === 10) break;
  }
  return kept;
}

function logPitch(rng) {
  const t = rng();
  return 0.25 * 16 ** t;
}

function shapeWild(base, rng) {
  const lists = [base];
  const extras = rng() > 0.42 ? 2 : 1;
  for (let i = 0; i < extras; i++) {
    const spec = pick(rng, BLEND_VOICES);
    lists.push(previewPartials(sanitizeControls({
      preset: spec.preset,
      voice: spec.voice,
      count: spec.count,
      stiffness: 0.05 + rng() * 0.9,
      brightness: rng() * 1.6 - 0.8,
      damping: 0.05 + rng() * 0.85,
      seed: 1 + Math.floor(rng() * 9000),
    })));
  }
  let donors = spacePartials(lists.flat().map(copyPartial));
  if (donors.length < 5) return null;
  const count = 6 + Math.floor(rng() * 3);
  const family = donors.slice(0, count);
  while (family.length < count) family.push(donors[family.length % donors.length]);
  const templates = [
    [1, 1.09, 1.2, 1.34, 7.2, 16],
    [1, 6.2, 16, 34],
    [1, 2.02, 2.98, 4.05, 5.1, 6.4],
    [1, 1.35, 2.4, 9.5, 11.2, 30],
  ];
  const template = templates[Math.floor(rng() * templates.length)];
  const root = 0.55 + rng() * 1.1;
  let partials = family.slice(0, template.length).map((partial, index) => ({
    ...partial,
    ratio: root * template[index] * (0.97 + rng() * 0.06),
  }));
  partials = spacePartials(partials.sort((a, b) => a.ratio - b.ratio));
  if (partials.length < 4) return null;
  const decayMode = rng();
  const floorRatio = partials[0].ratio;
  partials = partials.map((partial, index) => {
    const high = partial.ratio > floorRatio * 6;
    let decay;
    if (high || decayMode < 0.3) decay = 0.05 + rng() * 0.12;
    else if (decayMode < 0.7) decay = index % 2 === 0 ? 0.05 + rng() * 0.12 : 18 + rng() * 12;
    else decay = 0.4 + rng() * 4;
    return { ...partial, decay: Math.min(30, Math.max(0.05, decay)) };
  });
  const loud = rng() < 0.6 ? partials.length - 1 : Math.floor(rng() * Math.min(3, partials.length));
  partials = partials.map((partial, index) => ({
    ...partial,
    gainDb: index === loud ? 0 : (partial.ratio > floorRatio * 6 ? -14 - rng() * 10 : -5 - rng() * 12),
  }));
  return partials;
}

function applyWildPlan(partials, controls) {
  const tilt = Number(controls?.variationTilt) || 0;
  const decayMul = Number(controls?.variationDecay) || 1;
  const lift = Number(controls?.variationLift) || 0;
  const floor = Math.min(...partials.map((partial) => partial.ratio));
  const longest = Math.max(...partials.map((partial) => partial.decay));
  let next = partials.map((partial) => {
    const octaves = Math.log2(Math.max(partial.ratio, 1e-9) / floor);
    let decay = Math.min(30, Math.max(0.05, partial.decay * decayMul));
    if (lift && partial.decay < longest * 0.92) decay = Math.min(30, Math.max(decay, longest * lift));
    const high = partial.ratio > floor * 6;
    if (high && decay > 1.6 && tilt > 0) decay = 0.4;
    return { ...partial, gainDb: partial.gainDb + tilt * octaves, decay };
  });
  const peak = Math.max(...next.map((partial) => partial.gainDb));
  next = next.map((partial) => ({ ...partial, gainDb: partial.gainDb - peak }));
  const loudest = next.reduce((best, partial) => (partial.gainDb > best.gainDb ? partial : best), next[0]);
  return next.map((partial) => (
    partial === loudest
      ? { ...partial, gainDb: 0 }
      : { ...partial, gainDb: Math.min(partial.gainDb, -3.2) }
  ));
}

export function wildenVariation(variation, seed, wildness) {
  const rng = mulberry32((Number(seed) || 1) ^ 0x9e3779b9);
  const controls = sanitizeControls(variation.controls || {});
  const base = previewPartials(controls);
  let partials = null;
  let detune = 0;
  let position = variation.position ?? 0.18;
  for (let attempt = 0; attempt < 28 && !partials; attempt++) {
    const candidate = shapeWild(base, rng);
    if (!candidate) continue;
    detune = (rng() * 1.1 - 0.55) * Math.min(1, wildness);
    position = 0.04 + rng() * 0.78;
    const knobs = { detune, density: candidate.length, position, absorb: 0, decay: 0 };
    const quality = assessQuality(candidate, knobs);
    if (quality.ok) partials = candidate;
  }
  if (!partials) partials = spacePartials(base.map(copyPartial)).slice(0, 8);
  const pitch = logPitch(rng);
  return {
    ...variation,
    position,
    detune,
    partials: partials.map(copyPartial),
    controls: sanitizeControls({ ...controls, pitchScale: pitch, decayScale: 0.25 + rng() * 3.5 }),
  };
}

export function nudgeVariation(variation, seed, wildness) {
  const rng = mulberry32((Number(seed) || 1) ^ 0x51f1);
  const controls = sanitizeControls(variation.controls || {});
  const built = previewPartials(controls).map(copyPartial);
  const fund = built[0]?.ratio || 1;
  const stretch = 1 + (rng() * 2 - 1) * 0.22 * (wildness / 0.7);
  const decayGain = 0.3 + rng() * 2.5;
  let partials = spacePartials(built.map((partial) => ({
    ...partial,
    ratio: fund * (partial.ratio / fund) ** stretch,
    decay: Math.min(30, Math.max(0.05, partial.decay * decayGain)),
  })));
  const pitch = (controls.pitchScale || 1) * (0.62 + rng() * 0.9);
  const next = {
    ...variation,
    partials,
    controls: sanitizeControls({ ...controls, pitchScale: pitch }),
  };
  const quality = assessQuality(partials, { detune: 0, density: partials.length, position: next.position || 0.18 });
  if (!quality.ok) {
    return {
      ...variation,
      controls: sanitizeControls({ ...controls, pitchScale: pitch, decayScale: (controls.decayScale || 1) * decayGain }),
    };
  }
  return next;
}

function shiftWildPartials(partials, delta) {
  const floor = Math.min(...partials.map((partial) => partial.ratio));
  const longest = Math.max(...partials.map((partial) => partial.decay));
  let next = partials.map((partial) => {
    const octaves = Math.log2(Math.max(partial.ratio, 1e-9) / floor);
    let decay = Math.min(30, Math.max(0.05, partial.decay * delta.decay));
    if (delta.lift && partial.decay < longest * 0.92) {
      decay = Math.min(30, Math.max(decay, partial.decay + (longest - partial.decay) * delta.lift));
    }
    return { ...partial, gainDb: partial.gainDb + delta.tilt * octaves, decay };
  });
  const peak = Math.max(...next.map((partial) => partial.gainDb));
  next = next.map((partial) => ({ ...partial, gainDb: partial.gainDb - peak }));
  const loudest = next.reduce((best, partial) => (partial.gainDb > best.gainDb ? partial : best), next[0]);
  next = next.map((partial) => (
    partial === loudest
      ? { ...partial, gainDb: 0 }
      : { ...partial, gainDb: Math.min(partial.gainDb, -3.2) }
  ));
  // A long high partial only fails the gate when it is also loud. Quiet highs keep their tail.
  return next.map((partial) => (
    partial.ratio > floor * 6 && partial.decay > 2 && partial.gainDb > -8
      ? { ...partial, decay: 1.5 }
      : partial
  ));
}

function keepWildBody(source, card) {
  const from = source.controls || {};
  const to = card.controls || {};
  const delta = {
    tilt: (to.variationTilt || 0) - (from.variationTilt || 0),
    decay: (to.variationDecay || 1) / (from.variationDecay || 1),
    lift: (to.variationLift || 0) - (from.variationLift || 0),
  };
  const knobs = { detune: source.detune || 0, density: source.partials.length, position: source.position || 0.18 };
  let partials = shiftWildPartials(source.partials, delta);
  if (!assessQuality(partials, knobs).ok) {
    partials = shiftWildPartials(source.partials, {
      tilt: delta.tilt * 0.45,
      decay: 1 + (delta.decay - 1) * 0.45,
      lift: delta.lift * 0.45,
    });
  }
  if (!assessQuality(partials, knobs).ok) partials = source.partials.map(copyPartial);
  return {
    ...card,
    partials: partials.map(copyPartial),
    position: source.position,
    detune: source.detune || 0,
    controls: sanitizeControls({ ...to, pitchScale: to.pitchScale || from.pitchScale || 1 }),
  };
}

export function dressVariations(variations, seed, wildness, source = null) {
  if (source?.partials?.length) return variations.map((card) => keepWildBody(source, card));
  const amount = Math.min(1, Math.max(0, Number(wildness) || 0));
  if (amount >= HIGH_WILDNESS) {
    const base = wildenVariation(variations[0], seed, amount);
    return variations.map((card, index) => {
      const partials = index === 0 ? base.partials : applyWildPlan(base.partials, card.controls);
      const knobs = { detune: base.detune || 0, density: partials.length, position: base.position || 0.18 };
      const quality = assessQuality(partials, knobs);
      return {
        ...card,
        partials: quality.ok ? partials.map(copyPartial) : base.partials.map(copyPartial),
        position: base.position,
        detune: base.detune || 0,
        controls: sanitizeControls({ ...card.controls, pitchScale: base.controls.pitchScale }),
      };
    });
  }
  if (amount >= 0.34) {
    return variations.map((variation, index) => nudgeVariation(variation, seed + index * 17, amount));
  }
  return variations;
}

export function snapshotVariation(variation) {
  const controls = sanitizeControls(variation?.controls || variation || {});
  const fundamental = playedFundamental(controls.pitchScale);
  const built = variation?.partials?.length
    ? variation.partials
    : audiblePartials(previewPartials(controls), { fundamental, sampleRate: 48000 });
  const partials = built.map((partial) => ({
    ratio: partial.ratio,
    gainDb: partial.gainDb,
    decay: partial.decay,
  }));
  return {
    name: variation?.name || 'Modal profile',
    controls,
    partials,
    fundamental,
    exciter: variation?.exciter || 'mallet',
    hardness: variation?.hardness ?? 0.5,
    position: variation?.position ?? 0.18,
    detune: variation?.detune || 0,
    velocity: variation?.velocity ?? 0.8,
    material: variation?.material || '',
    shape: variation?.shape || '',
    size: variation?.size || '',
    voice: controls.voice || '',
    preset: controls.preset,
  };
}

export function createGeneratorSession() {
  return { past: [], future: [], turn: null, seed: 1 };
}

export function loadGeneratorTurn(session, prompt) {
  if (session.turn) {
    session.past.push(session.turn);
    if (session.past.length > 12) session.past.shift();
  }
  session.future = [];
  const variations = describePrompt(prompt);
  session.turn = { prompt, variations, selected: 0 };
  return session.turn;
}

export function selectGenerator(session, index) {
  if (!session.turn) return null;
  const count = session.turn.variations.length;
  session.turn.selected = Math.max(0, Math.min(count - 1, index));
  return session.turn.variations[session.turn.selected];
}

export function undoGenerator(session) {
  if (!session.past.length) return null;
  if (session.turn) session.future.push(session.turn);
  session.turn = session.past.pop();
  return session.turn;
}

export function redoGenerator(session) {
  if (!session.future.length) return null;
  if (session.turn) session.past.push(session.turn);
  session.turn = session.future.pop();
  return session.turn;
}

export function rollGenerator(session, { wildness = 0.3, seed } = {}) {
  const nextSeed = Number.isFinite(seed) ? seed : (session.seed = (session.seed + 1) >>> 0);
  const amount = Math.min(1, Math.max(0, Number(wildness) || 0));
  const prompt = promptForRoll(nextSeed, amount);
  const turn = loadGeneratorTurn(session, prompt);
  if (amount >= 0.34) {
    turn.variations = dressVariations(turn.variations, nextSeed, amount);
    session.turn = turn;
  }
  return { prompt, turn };
}

export function currentSnapshot(session) {
  const variation = session.turn?.variations?.[session.turn.selected];
  return variation ? snapshotVariation(variation) : null;
}

export function createDesignerSession() {
  const controls = defaultControls();
  return {
    partials: previewPartials(controls).map((partial) => ({ ...partial })),
    knobs: identityKnobs(),
    history: createRollHistory(),
  };
}

export function randomizeDesigner(session, seed, { material = 'any', wildness = 0.3, amount = 1 } = {}) {
  const current = {
    partials: session.partials.map((partial) => ({ ...partial })),
    knobs: { ...session.knobs },
  };
  pushRoll(session.history, current);
  const rolled = rollSound({
    base: session.partials,
    current: session.knobs,
    material,
    amount,
    wildness,
    locks: defaultLocks(),
    seed,
  });
  session.knobs = { ...rolled.knobs };
  session.partials = rolled.partials.map((partial) => ({ ...partial }));
  return rolled;
}

export function undoDesigner(session) {
  const restored = undoRoll(session.history, {
    partials: session.partials.map((partial) => ({ ...partial })),
    knobs: { ...session.knobs },
  });
  if (!restored) return null;
  session.partials = restored.partials.map((partial) => ({ ...partial }));
  session.knobs = { ...restored.knobs };
  return restored;
}

export function redoDesigner(session) {
  const restored = redoRoll(session.history, {
    partials: session.partials.map((partial) => ({ ...partial })),
    knobs: { ...session.knobs },
  });
  if (!restored) return null;
  session.partials = restored.partials.map((partial) => ({ ...partial }));
  session.knobs = { ...restored.knobs };
  return restored;
}

export function handoffPayload(session) {
  const snap = currentSnapshot(session);
  if (!snap) return null;
  return {
    name: snap.name,
    controls: { ...snap.controls },
    partials: snap.partials.map((partial) => ({ ...partial })),
    exciter: snap.exciter,
    hardness: snap.hardness,
    position: snap.position,
    detune: snap.detune || 0,
    velocity: snap.velocity,
  };
}

function paintObjectCanvas(canvas, snap, { selected = -1, age = null } = {}) {
  if (!canvas || canvas.hidden) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth || 420;
  const height = canvas.clientHeight || 280;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const style = getComputedStyle(document.documentElement);
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  paintObject(ctx, {
    width,
    height,
    body: snap || {},
    partials: snap?.partials || [],
    selected,
    age,
    colors: {
      card: read('--card', '#fbf8f2'),
      accent: read('--accent', '#d4421c'),
      ink: read('--fg', '#1f1d1a'),
    },
  });
}

// The 3D preview spaces partials in equal steps. A click has to use that
// same spacing, not the log of the ratio.
export function previewHitSlices(partials, position = 0.18) {
  const slices = (partials || []).map((partial) => sliceFromPartial(partial, 1));
  spaceByLog(slices);
  return combHeights(slices, position);
}

function paintPreview(canvas, partials, { detune = 0, position = 0.18 } = {}) {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth || 420;
  const height = canvas.clientHeight || 280;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const style = getComputedStyle(document.documentElement);
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  paintModalView(ctx, partials, {
    width,
    height,
    camera: defaultCamera(),
    style: 'fast',
    colors: {
      card: read('--card', '#fbf8f2'),
      bg: read('--bg', '#f2ede3'),
      line: read('--line', '#d8d0c1'),
      accent: read('--accent', '#d4421c'),
      muted: read('--muted', '#6a655c'),
      ink: read('--fg', '#1f1d1a'),
      font: getComputedStyle(document.body).fontFamily,
    },
    invertPanel: true,
    selected: -1,
    detune,
    position,
    now: performance.now(),
  });
}

function playSnapshot(audioState, snap) {
  const AudioCtx = audioContextClass();
  if (!AudioCtx || !snap?.partials?.length) return;
  prepareAudioSession();
  if (!audioState.ctx) audioState.ctx = new AudioCtx();
  const ctx = audioState.ctx;
  const resumed = resumeInGesture(ctx);
  playSilentUnlock(ctx);
  Promise.resolve(resumed).then(() => {
    const hint = audioState.hint;
    if (!hint) return;
    hint.textContent = (ctx.state === 'suspended' || ctx.state === 'interrupted') ? SILENT_MODE_HINT : '';
  }).catch(() => {
    if (audioState.hint) audioState.hint.textContent = SILENT_MODE_HINT;
  });
  const seconds = heardSeconds(snap.partials, { exciter: snap.exciter });
  const samples = scaleToPeak(renderPreview(snap.partials, {
    fundamental: snap.fundamental,
    velocity: snap.velocity,
    position: snap.position,
    exciter: snap.exciter,
    hardness: snap.hardness,
    sampleRate: ctx.sampleRate,
    seconds,
    matchGains: true,
  }), 0.45);
  try { audioState.source?.stop(); } catch { /* already stopped */ }
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  if (buffer.copyToChannel) buffer.copyToChannel(samples, 0);
  else buffer.getChannelData(0).set(samples);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  audioState.source = source;
}

export function mountGenerator(root, { openInDesigner } = {}) {
  if (!root || typeof document === 'undefined') return null;
  const canvas = root.querySelector('[data-gen-view]');
  const objectCanvas = root.querySelector('[data-gen-object]');
  const audioState = { ctx: null, source: null, hint: root.querySelector('[data-gen-audio]'), snap: null, selected: -1, strike: 0, frame: 0 };
  let seed = 1;

  function paintCurrent(age = null) {
    const snap = audioState.snap;
    if (!snap) return;
    if (!canvas?.hidden) paintPreview(canvas, snap.partials, snap);
    paintObjectCanvas(objectCanvas, snap, { selected: audioState.selected, age });
  }

  function kickGenObject() {
    if (!objectCanvas || objectCanvas.hidden || audioState.frame) return;
    const frame = () => {
      const age = audioState.strike ? (performance.now() - audioState.strike) / 1000 : null;
      paintCurrent(audioState.strike ? age : null);
      const alive = audioState.strike && (audioState.snap?.partials || []).some((partial) => age < Math.max(0.4, partial.decay || 0.2) * 1.2);
      if (alive) audioState.frame = requestAnimationFrame(frame);
      else {
        audioState.frame = 0;
        if (audioState.strike) {
          audioState.strike = 0;
          paintCurrent(null);
        }
      }
    };
    audioState.frame = requestAnimationFrame(frame);
  }

  function showSnap(variation, { hear = false } = {}) {
    const snap = snapshotVariation(variation);
    audioState.snap = snap;
    if (audioState.frame) cancelAnimationFrame(audioState.frame);
    audioState.frame = 0;
    if (!hear) audioState.strike = 0;
    paintCurrent(null);
    if (hear) {
      audioState.strike = performance.now();
      playSnapshot(audioState, snap);
      kickGenObject();
    }
  }

  const controller = mountStudio(root, {
    applyRecipe(variation, { hear = false } = {}) {
      showSnap(variation, { hear });
    },
    setName() {},
    profileFromState() { return null; },
    decorateVariations(variations, current) {
      seed = (seed + 1) >>> 0;
      return dressVariations(variations, seed, Number(wild?.value || 0), current);
    },
    openInDesigner(variation) {
      if (!openInDesigner) return;
      openInDesigner(snapshotVariation(variation));
    },
  });
  const wild = root.querySelector('[data-gen-wild]');
  const wildOut = root.querySelector('[data-gen-wild-out]');
  wild?.addEventListener('input', () => {
    if (wildOut) wildOut.textContent = Number(wild.value).toFixed(2);
  });
  root.querySelector('[data-gen-hear]')?.addEventListener('click', () => {
    const variation = controller?.current();
    if (!variation) return;
    showSnap(variation, { hear: true });
  });
  for (const button of root.querySelectorAll('.gen-preview [data-view-mode]')) {
    button.addEventListener('click', () => {
      const object = button.dataset.viewMode === 'object';
      if (canvas) canvas.hidden = object;
      if (objectCanvas) objectCanvas.hidden = !object;
      for (const peer of root.querySelectorAll('.gen-preview [data-view-mode]')) {
        peer.setAttribute('aria-pressed', String(peer === button));
      }
      const age = audioState.strike ? (performance.now() - audioState.strike) / 1000 : null;
      paintCurrent(audioState.strike ? age : null);
      if (object && audioState.strike) kickGenObject();
    });
  }
  canvas?.addEventListener('pointerup', (event) => {
    const snap = audioState.snap;
    if (!snap?.partials?.length || canvas.hidden) return;
    const rect = canvas.getBoundingClientRect();
    const slices = previewHitSlices(snap.partials, snap.position);
    audioState.selected = hitPartial(slices, defaultCamera(), canvas.clientWidth, canvas.clientHeight, event.clientX - rect.left, event.clientY - rect.top, snap.detune || 0);
    const age = audioState.strike ? (performance.now() - audioState.strike) / 1000 : null;
    paintCurrent(audioState.strike ? age : null);
  });
  const session = createGeneratorSession();
  root.querySelector('[data-gen-roll]')?.addEventListener('click', () => {
    seed = (seed + 1) >>> 0;
    const wildness = Number(wild?.value || 0);
    const rolled = rollGenerator(session, { wildness, seed: (Date.now() ^ seed) >>> 0 });
    controller?.showTurn(rolled.prompt, rolled.turn.variations, true);
  });
  installGestureUnlock(root, () => {
    const ctx = beginAudio(audioState.ctx);
    if (ctx) audioState.ctx = ctx;
    return audioState.ctx;
  });
  window.addEventListener('resize', () => {
    if (!audioState.snap) return;
    const age = audioState.strike ? (performance.now() - audioState.strike) / 1000 : null;
    paintCurrent(audioState.strike ? age : null);
  });
  return controller;
}

export function applyHandoff(designer, payload) {
  designer.name = payload.name;
  designer.controls = { ...payload.controls };
  designer.partials = payload.partials.map((partial) => ({
    ratio: partial.ratio,
    gainDb: partial.gainDb,
    decay: partial.decay,
  }));
  designer.custom = true;
  designer.exciter = payload.exciter;
  designer.hardness = payload.hardness;
  designer.position = payload.position;
  designer.detune = payload.detune || 0;
  if (designer.knobs) designer.knobs.detune = payload.detune || 0;
  designer.velocity = payload.velocity;
  return designer;
}
