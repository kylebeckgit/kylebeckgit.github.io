// The generator keeps its own variations. The designer is a separate body
// until Open in designer copies the chosen partials across.

import { SILENT_MODE_HINT, beginAudio, installGestureUnlock, playSilentUnlock, prepareAudioSession, resumeInGesture, audioContextClass } from './audio-session.js';
import { audiblePartials, defaultControls, heardSeconds, playedFundamental, previewPartials, sanitizeControls } from './engine.js';
import { defaultCamera, paintModalView } from './modal-view.js';
import { describePrompt } from './recipes.js';
import { renderPreview, scaleToPeak } from './resonator.js';
import { mountStudio } from './studio.js';
import { createRollHistory, defaultLocks, identityKnobs, pushRoll, redoRoll, rollSound, undoRoll } from './randomize.js';

const CALM = [
  'wood block', 'glass bowl', 'gong', 'marimba', 'ceramic bowl', 'bell', 'string',
  'skin', 'plate', 'tube', 'chime', 'stone', 'bamboo', 'ice', 'log drum', 'crystal',
];
const WILD = [
  'broken glass', 'underwater bell', 'frozen lake', 'rusty pipe', 'alien chime',
  'distant thunder', 'chandelier', 'hollow log', 'tiny bell', 'huge gong', 'black hole',
];
const ADJECTIVES = ['tiny', 'huge', 'broken', 'frozen', 'rusty', 'hollow', 'distant', 'alien'];

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

export function promptForRoll(seed, wildness = 0.3) {
  const rng = mulberry32(Number(seed) || 1);
  const wild = Number(wildness) >= 0.66;
  if (wild && rng() < 0.55) return `${pick(rng, ADJECTIVES)} ${pick(rng, CALM)}`;
  return pick(rng, wild ? WILD : CALM);
}

export function snapshotVariation(variation) {
  const controls = sanitizeControls(variation?.controls || variation || {});
  const fundamental = playedFundamental(controls.pitchScale);
  const partials = audiblePartials(previewPartials(controls), { fundamental, sampleRate: 48000 }).map((partial) => ({
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
    velocity: variation?.velocity ?? 0.8,
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
  const prompt = promptForRoll(nextSeed, wildness);
  return { prompt, turn: loadGeneratorTurn(session, prompt) };
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
    velocity: snap.velocity,
  };
}

function paintPreview(canvas, partials) {
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
    detune: 0,
    position: 0.18,
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
  const audioState = { ctx: null, source: null, hint: root.querySelector('[data-gen-audio]') };
  let seed = 1;
  const controller = mountStudio(root, {
    applyRecipe(variation, { hear = false } = {}) {
      const snap = snapshotVariation(variation);
      paintPreview(canvas, snap.partials);
      if (hear) playSnapshot(audioState, snap);
    },
    setName() {},
    profileFromState() { return null; },
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
    const snap = snapshotVariation(variation);
    paintPreview(canvas, snap.partials);
    playSnapshot(audioState, snap);
  });
  root.querySelector('[data-gen-roll]')?.addEventListener('click', () => {
    seed = (seed + 1) >>> 0;
    const prompt = promptForRoll((Date.now() ^ seed) >>> 0, Number(wild?.value || 0));
    controller?.showFresh(prompt, true);
  });
  installGestureUnlock(root, () => {
    const ctx = beginAudio(audioState.ctx);
    if (ctx) audioState.ctx = ctx;
    return audioState.ctx;
  });
  window.addEventListener('resize', () => {
    const variation = controller?.current();
    if (variation) paintPreview(canvas, snapshotVariation(variation).partials);
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
  designer.velocity = payload.velocity;
  return designer;
}
