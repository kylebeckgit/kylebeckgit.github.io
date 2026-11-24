// Hidden modal stream page. Unlock and play through the existing audio
// session helpers and resonator renderer; do not invent a second synth.

import { beginAudio, installGestureUnlock, playSilentUnlock, resumeInGesture, SILENT_MODE_HINT } from './audio-session.js';
import { defaultCamera, paintModalView } from './modal-view.js';
import { renderPreview, scaleToPeak } from './resonator.js';
import {
  buildStrikeBody,
  bufferStopTime,
  createImpulse,
  createStreamPlanner,
  limiterCurve,
  masterGainForCap,
  mergePlan,
  nowPlaying,
  strikeLabel,
} from './stream.js';

const LOOKAHEAD = 3.5;
const WET = 0.16;
const DRY = 0.86;

function canvasColors() {
  const style = getComputedStyle(document.documentElement);
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    card: read('--card', '#fbf8f2'),
    bg: read('--bg', '#f2ede3'),
    line: read('--line', '#d8d0c1'),
    accent: read('--accent', '#d4421c'),
    muted: read('--muted', '#6a655c'),
    ink: read('--fg', '#1f1d1a'),
    font: getComputedStyle(document.body).fontFamily,
  };
}

function setText(el, text) {
  if (el) el.textContent = text || '';
}

export function mountStream(root) {
  if (!root) return null;
  const startBtn = root.querySelector('[data-start]');
  const stopBtn = root.querySelector('[data-stop]');
  const nowEl = root.querySelector('[data-now]');
  const canvas = root.querySelector('[data-view]');
  const errorEl = root.querySelector('[data-play-error]');
  const state = {
    audio: null,
    master: null,
    playing: false,
    startAt: 0,
    seed: 1,
    plannedUntil: 0,
    planner: null,
    plan: [],
    started: new Set(),
    sources: [],
    current: null,
    timer: 0,
    raf: 0,
    camera: defaultCamera(),
  };

  function setPlaying(on) {
    state.playing = on;
    if (startBtn) startBtn.disabled = on;
    if (stopBtn) stopBtn.disabled = !on;
  }

  function ensureGraph() {
    const ctx = beginAudio(state.audio);
    if (!ctx) throw new Error('This browser cannot play audio.');
    state.audio = ctx;
    resumeInGesture(ctx);
    playSilentUnlock(ctx);
    if (state.master) return ctx;
    const master = ctx.createGain();
    master.gain.value = masterGainForCap();
    const limiter = ctx.createWaveShaper();
    limiter.curve = limiterCurve();
    limiter.oversample = '2x';
    const dry = ctx.createGain();
    dry.gain.value = DRY;
    const wet = ctx.createGain();
    wet.gain.value = WET;
    const conv = ctx.createConvolver();
    const impulse = createImpulse(ctx.sampleRate, 1.35, Math.random);
    const buffer = ctx.createBuffer(1, impulse.length, ctx.sampleRate);
    if (buffer.copyToChannel) buffer.copyToChannel(impulse, 0);
    else buffer.getChannelData(0).set(impulse);
    conv.buffer = buffer;
    master.connect(dry);
    master.connect(conv);
    conv.connect(wet);
    dry.connect(limiter);
    wet.connect(limiter);
    limiter.connect(ctx.destination);
    state.master = master;
    return ctx;
  }

  function streamTime() {
    if (!state.audio) return 0;
    return state.audio.currentTime - state.startAt;
  }

  function pruneStarted() {
    const live = new Set(state.plan.map((strike) => strike.time));
    for (const time of state.started) {
      if (!live.has(time)) state.started.delete(time);
    }
  }

  function extendPlan(until) {
    if (!state.planner) state.planner = createStreamPlanner(state.seed);
    const result = state.planner.planUntil(until);
    // Prune only against the audio clock, never against a future strike time.
    state.plan = mergePlan(state.plan, result.added, Math.max(0, streamTime()));
    state.plannedUntil = result.plannedUntil;
    pruneStarted();
  }

  function stopSources() {
    for (const source of state.sources) {
      try { source.stop(); } catch { /* already stopped */ }
      try { source.disconnect(); } catch { /* already gone */ }
    }
    state.sources = [];
    state.started.clear();
  }

  function playStrike(strike) {
    if (state.started.has(strike.time)) return;
    const ctx = state.audio;
    const when = state.startAt + strike.time;
    if (when + 0.05 < ctx.currentTime) return;
    let samples;
    try {
      const body = buildStrikeBody(strike);
      if (!body.partials.length) return;
      const raw = renderPreview(body.partials, {
        fundamental: body.fundamental,
        velocity: strike.velocity,
        position: 0.18,
        exciter: strike.exciter,
        hardness: strike.hardness,
        sampleRate: ctx.sampleRate,
        seconds: body.seconds,
      });
      samples = scaleToPeak(raw, strike.peak);
      strike.partials = body.partials;
    } catch {
      return;
    }
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    if (buffer.copyToChannel) buffer.copyToChannel(samples, 0);
    else buffer.getChannelData(0).set(samples);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(state.master);
    source.start(when);
    source.stop(bufferStopTime(when, buffer));
    source.onended = () => {
      state.sources = state.sources.filter((node) => node !== source);
    };
    state.sources.push(source);
    state.started.add(strike.time);
  }

  function dueStrikes(now) {
    const ctx = state.audio;
    return state.plan.filter((strike) => {
      if (state.started.has(strike.time)) return false;
      if (strike.time > now + LOOKAHEAD) return false;
      return state.startAt + strike.time + 0.05 >= ctx.currentTime;
    });
  }

  function syncNowPlaying() {
    const current = nowPlaying(state.plan, state.started, streamTime());
    if (current !== state.current) {
      state.current = current;
      setText(nowEl, current ? strikeLabel(current) : '');
    }
    return current;
  }

  function tick() {
    if (!state.playing || !state.audio) return;
    const now = streamTime();
    extendPlan(now + LOOKAHEAD + 1);
    for (const strike of dueStrikes(now)) playStrike(strike);
    syncNowPlaying();
    state.timer = window.setTimeout(tick, 180);
  }

  function paint() {
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const width = canvas.clientWidth || 640;
    const height = canvas.clientHeight || 280;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = canvasColors();
    if (state.playing) syncNowPlaying();
    const partials = state.current?.partials || [];
    if (!partials.length) {
      ctx.fillStyle = colors.bg || colors.card;
      ctx.fillRect(0, 0, width, height);
    } else {
      paintModalView(ctx, partials, {
        width,
        height,
        camera: state.camera,
        style: 'eco',
        colors,
        invertPanel: false,
        position: 0.18,
        now: performance.now(),
      });
    }
    if (state.playing) state.raf = window.requestAnimationFrame(paint);
  }

  async function start() {
    setText(errorEl, '');
    try {
      const ctx = ensureGraph();
      stopSources();
      state.seed = (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0 || 1;
      state.planner = createStreamPlanner(state.seed);
      state.plan = [];
      state.plannedUntil = 0;
      state.current = null;
      setText(nowEl, '');
      const pending = resumeInGesture(ctx);
      playSilentUnlock(ctx);
      if (pending) await pending;
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        setText(errorEl, SILENT_MODE_HINT);
      }
      state.startAt = ctx.currentTime + 0.12;
      setPlaying(true);
      tick();
      if (state.raf) window.cancelAnimationFrame(state.raf);
      state.raf = window.requestAnimationFrame(paint);
    } catch (err) {
      setPlaying(false);
      setText(errorEl, err?.message || 'This browser cannot play audio.');
    }
  }

  function stop() {
    window.clearTimeout(state.timer);
    state.timer = 0;
    if (state.raf) window.cancelAnimationFrame(state.raf);
    state.raf = 0;
    stopSources();
    state.playing = false;
    state.current = null;
    setPlaying(false);
    setText(nowEl, '');
    paint();
  }

  startBtn?.addEventListener('click', () => { start(); });
  stopBtn?.addEventListener('click', () => { stop(); });
  setPlaying(false);
  installGestureUnlock(root, () => {
    state.audio = beginAudio(state.audio);
    return state.audio;
  });
  paint();
  return { start, stop, state };
}
