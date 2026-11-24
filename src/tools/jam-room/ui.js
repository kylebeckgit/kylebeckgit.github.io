// Hidden jam-room preview. Unlock and play through the existing audio
// session helpers and resonator renderer.

import { beginAudio, installGestureUnlock, playSilentUnlock, resumeInGesture, SILENT_MODE_HINT } from '../modal-preview/audio-session.js';
import { defaultCamera, paintModalView } from '../modal-preview/modal-view.js';
import { limiterCurve } from '../modal-preview/stream.js';
import {
  barBeatLabel,
  crowdScale,
  midiForDegree,
  msPerBeat,
  noteName,
  hzFromMidi,
  panForUser,
  parseCommand,
  planPhraseEvents,
  shouldPlayRemoteStrike,
  mergeRemoteStrikes,
} from '../../../workers/jam-room/src/logic.js';
import { createJamClient, resolveWsUrl } from './client.js';
import { delayBeats, LEVEL, modeCap, renderBedBuffer, renderStrike, spaceWet } from './engine.js';
import { createImpulse } from '../modal-preview/stream.js';
import { createRingBuffer, downloadBlob, pushSamples, ringToWav } from './wav.js';

const LOOKAHEAD_BEATS = 8;
const CROWD_CAP = 24;
const USER_VOICES = 3;

export function canStartAudio(mode, flags = {}) {
  if (flags.unlocking || flags.playing) return false;
  return mode === 'room' || mode === 'solo';
}

export function shouldResyncSchedule(type, prevState, nextState) {
  if (type === 'welcome' || type === 'solo') return true;
  if (type !== 'state') return false;
  if (!prevState || !nextState) return true;
  return prevState.epochMs !== nextState.epochMs || prevState.phraseIndex !== nextState.phraseIndex;
}

export function clockSnapshot(state) {
  return { epochMs: state?.epochMs || 0, phraseIndex: state?.phraseIndex || 0 };
}

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

function mobileCap() {
  return modeCap(typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || ''));
}

export function mountJamRoom(root) {
  if (!root) return null;
  const startBtn = root.querySelector('[data-start]');
  const stopBtn = root.querySelector('[data-stop]');
  const keepBtn = root.querySelector('[data-keep]');
  const nowEl = root.querySelector('[data-now]');
  const statusEl = root.querySelector('[data-status]');
  const roomEl = root.querySelector('[data-room]');
  const tallyEl = root.querySelector('[data-tally]');
  const errorEl = root.querySelector('[data-play-error]');
  const canvas = root.querySelector('[data-view]');
  const form = root.querySelector('[data-command-form]');
  const input = root.querySelector('[data-command]');
  const client = createJamClient({ url: resolveWsUrl(root) });

  const state = {
    audio: null,
    buses: null,
    playing: false,
    unlocking: false,
    current: null,
    timer: 0,
    raf: 0,
    camera: defaultCamera(),
    sources: [],
    crowd: [],
    scheduled: new Set(),
    clock: clockSnapshot(client.state),
    remotes: [],
    strikers: new Map(),
    lastPartials: [],
    bed: null,
    ring: null,
    recorder: null,
  };

  function setPlaying(on) {
    state.playing = on;
    if (startBtn) startBtn.disabled = !canStartAudio(client.mode, { unlocking: state.unlocking, playing: on });
    if (stopBtn) stopBtn.disabled = !on;
    if (keepBtn) keepBtn.disabled = !on && !(state.ring && state.ring.filled);
  }

  function roomLabel() {
    if (client.mode === 'room') return 'Connected to the room.';
    if (client.mode === 'solo') return 'The room is offline. This is a solo jam.';
    return 'Connecting to the room.';
  }

  function formatTally() {
    const s = client.state;
    const label = barBeatLabel(s, client.nowMs());
    const lines = [`${label.bar}:${label.beat}  next phrase in ${label.bars - label.bar + 1} bars`];
    const families = client.tally?.families || {};
    const names = Object.keys(families);
    if (!names.length) lines.push('No votes this phrase.');
    for (const family of names) {
      const parts = Object.entries(families[family]).map(([k, n]) => `${k} ${n}`).join(', ');
      lines.push(`${family}: ${parts}`);
    }
    lines.push(`${s.keyRoot} ${s.mood}, ${s.bpm} bpm, density ${s.density}`);
    return lines.join('\n');
  }

  function refreshMeta() {
    setText(roomEl, roomLabel());
    setText(tallyEl, formatTally());
  }

  function ensureGraph() {
    const ctx = beginAudio(state.audio);
    if (!ctx) throw new Error('This browser cannot play audio.');
    state.audio = ctx;
    resumeInGesture(ctx);
    playSilentUnlock(ctx);
    if (state.buses) return ctx;
    const melody = ctx.createGain();
    const pulse = ctx.createGain();
    const crowd = ctx.createGain();
    const bed = ctx.createGain();
    const duck = ctx.createGain();
    duck.gain.value = 1;
    crowd.connect(duck);
    const mix = ctx.createGain();
    melody.connect(mix);
    pulse.connect(mix);
    duck.connect(mix);
    bed.connect(mix);
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const delayWet = ctx.createGain();
    dry.gain.value = 0.86;
    wet.gain.value = spaceWet(client.state.space);
    delayWet.gain.value = client.state.space > 0 ? 0.18 : 0;
    const delay = ctx.createDelay(2);
    const delayFb = ctx.createGain();
    delayFb.gain.value = client.state.space >= 2 ? 0.28 : client.state.space > 0 ? 0.16 : 0;
    delay.delayTime.value = delaySeconds();
    const conv = ctx.createConvolver();
    const impulse = createImpulse(ctx.sampleRate, 1.5, Math.random);
    const buffer = ctx.createBuffer(1, impulse.length, ctx.sampleRate);
    if (buffer.copyToChannel) buffer.copyToChannel(impulse, 0);
    else buffer.getChannelData(0).set(impulse);
    conv.buffer = buffer;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 3;
    comp.attack.value = 0.008;
    comp.release.value = 0.16;
    const limiter = ctx.createWaveShaper();
    limiter.curve = limiterCurve();
    limiter.oversample = '2x';
    const out = ctx.createGain();
    out.gain.value = 0.89;
    mix.connect(dry);
    mix.connect(conv);
    mix.connect(delay);
    delay.connect(delayFb);
    delayFb.connect(delay);
    delay.connect(delayWet);
    conv.connect(wet);
    dry.connect(comp);
    wet.connect(comp);
    delayWet.connect(comp);
    comp.connect(limiter);
    limiter.connect(out);
    out.connect(ctx.destination);
    attachRecorder(ctx, out);
    state.buses = { melody, pulse, crowd, bed, duck, mix, dry, wet, delay, delayFb, delayWet, out };
    return ctx;
  }

  function delaySeconds() {
    const beats = delayBeats(client.state.space);
    if (!beats) return 0.001;
    return (beats * msPerBeat(client.state.bpm)) / 1000;
  }

  function applySpace() {
    if (!state.buses) return;
    state.buses.wet.gain.value = spaceWet(client.state.space);
    state.buses.delayWet.gain.value = client.state.space > 0 ? 0.18 : 0;
    state.buses.delayFb.gain.value = client.state.space >= 2 ? 0.28 : client.state.space > 0 ? 0.16 : 0;
    state.buses.delay.delayTime.value = delaySeconds();
  }

  function attachRecorder(ctx, node) {
    state.ring = createRingBuffer(ctx.sampleRate, 30);
    const rec = ctx.createScriptProcessor(4096, 1, 1);
    rec.onaudioprocess = (event) => {
      if (!state.playing) return;
      pushSamples(state.ring, event.inputBuffer.getChannelData(0));
    };
    const silent = ctx.createGain();
    silent.gain.value = 0;
    node.connect(rec);
    rec.connect(silent);
    silent.connect(ctx.destination);
    state.recorder = rec;
  }

  function audioTimeForBeat(beatTime) {
    const whenMs = client.state.epochMs + beatTime * msPerBeat(client.state.bpm);
    return state.audio.currentTime + (whenMs - client.nowMs()) / 1000;
  }

  function playBuffer(samples, when, dest, pan = 0) {
    const ctx = state.audio;
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    if (buffer.copyToChannel) buffer.copyToChannel(samples, 0);
    else buffer.getChannelData(0).set(samples);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    let node = source;
    if (pan && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      source.connect(panner);
      node = panner;
    }
    node.connect(dest);
    const startAt = Math.max(when, ctx.currentTime + 0.01);
    source.start(startAt);
    source.stop(startAt + buffer.duration);
    const handle = { source, start: startAt, dest };
    source.onended = () => {
      state.sources = state.sources.filter((item) => item !== handle);
    };
    state.sources.push(handle);
    return handle;
  }

  function scheduleEvent(event, dest, phraseIndex) {
    const key = `${phraseIndex}:${event.layer}:${event.beat}:${event.midi}:${event.ghost ? 'g' : 'x'}`;
    if (state.scheduled.has(key)) return;
    const when = audioTimeForBeat(event.beat);
    if (when + 0.05 < state.audio.currentTime) return;
    if (when > state.audio.currentTime + (LOOKAHEAD_BEATS * msPerBeat(client.state.bpm)) / 1000 + 0.2) return;
    let body;
    try {
      body = renderStrike(event, state.audio.sampleRate, { maxModes: mobileCap() });
    } catch {
      return;
    }
    if (!body) return;
    state.scheduled.add(key);
    const handle = playBuffer(body.samples, when, dest);
    handle.partials = body.partials;
    handle.layer = event.layer;
    handle.label = `${event.layer}, ${event.note}`;
    handle.event = event;
  }

  function schedulePhrase() {
    if (!state.playing || !state.audio) return;
    if (client.mode !== 'room' && client.mode !== 'solo') return;
    const plan = planPhraseEvents(client.state);
    const idx = client.state.phraseIndex;
    for (const event of plan.melody) scheduleEvent(event, state.buses.melody, idx);
    for (const event of plan.pulse) scheduleEvent(event, state.buses.pulse, idx);
  }

  function restartBed() {
    if (!state.playing || !state.audio) return;
    const seconds = Math.max(1.5, (2 * (client.state.beatsPerBar || 4) * msPerBeat(client.state.bpm)) / 1000);
    let samples;
    try {
      samples = renderBedBuffer(client.state, state.audio.sampleRate, seconds);
    } catch {
      return;
    }
    if (state.bed) {
      try { state.bed.source.stop(state.audio.currentTime + 0.05); } catch { /* already */ }
    }
    const ctx = state.audio;
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    if (buffer.copyToChannel) buffer.copyToChannel(samples, 0);
    else buffer.getChannelData(0).set(samples);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(state.buses.bed);
    source.start();
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.06);
    state.bed = { source, gain };
  }

  function playCrowd(strike, local) {
    if (!state.playing || !state.audio) return;
    const scale = crowdScale(client.state.mood);
    const midi = midiForDegree(client.state.keyRoot, strike.degree, scale, 1);
    const when = audioTimeForBeat(strike.beatTime);
    if (when + 0.08 < state.audio.currentTime && !local) return;
    const event = {
      beat: strike.beatTime,
      midi,
      hz: hzFromMidi(midi),
      note: noteName(midi),
      degree: strike.degree,
      velocity: strike.velocity,
      position: strike.position,
      layer: 'crowd',
      material: client.state.materials.crowd,
      peak: local ? LEVEL.crowd * 1.35 : LEVEL.crowd,
    };
    let body;
    try {
      body = renderStrike(event, state.audio.sampleRate, { maxModes: mobileCap() });
    } catch {
      return;
    }
    if (!body) return;
    pruneCrowd();
    if (state.crowd.length >= CROWD_CAP) stealCrowd();
    const userVoices = state.crowd.filter((v) => v.userId === strike.userId);
    if (userVoices.length >= USER_VOICES) {
      userVoices.sort((a, b) => a.start - b.start)[0]?.source.stop();
    }
    const handle = playBuffer(body.samples, Math.max(when, state.audio.currentTime + 0.01), state.buses.crowd, local ? 0 : panForUser(strike.userId));
    handle.userId = strike.userId || 'local';
    handle.partials = body.partials;
    handle.layer = 'crowd';
    handle.label = local ? `you, ${event.note}` : `${event.note}`;
    handle.event = event;
    state.crowd.push(handle);
    state.lastPartials = body.partials;
    state.current = handle;
    setText(nowEl, handle.label);
  }

  function pruneCrowd() {
    const now = state.audio?.currentTime || 0;
    state.crowd = state.crowd.filter((v) => v.start + 6 > now);
  }

  function stealCrowd() {
    const sorted = state.crowd.slice().sort((a, b) => a.start - b.start);
    const victim = sorted[0];
    if (!victim) return;
    try { victim.source.stop(); } catch { /* already */ }
    state.crowd = state.crowd.filter((v) => v !== victim);
  }

  function duckCheck() {
    if (!state.buses) return;
    const now = state.audio.currentTime;
    const melodyOn = state.sources.some((s) => s.layer === 'melody' && s.start <= now && s.start + 1.2 > now);
    const target = melodyOn ? LEVEL.duck : 1;
    state.buses.duck.gain.setTargetAtTime(target, now, 0.04);
  }

  function activeStrikers() {
    const cutoff = Date.now() - msPerBeat(client.state.bpm) * (client.state.beatsPerBar || 4);
    for (const [id, at] of state.strikers) {
      if (at < cutoff) state.strikers.delete(id);
    }
    return state.strikers.size;
  }

  function onRemoteStrike(msg) {
    if (msg.userId && msg.userId === client.userId) return;
    if (msg.userId) state.strikers.set(msg.userId, Date.now());
    state.remotes.push(msg);
    const users = activeStrikers();
    const merged = mergeRemoteStrikes(state.remotes.splice(0, state.remotes.length), users);
    for (const strike of merged) {
      if (!shouldPlayRemoteStrike(users)) continue;
      playCrowd(strike, false);
    }
  }

  function localStrike(degree, velocity, position) {
    if (!state.playing) return;
    const beatTime = client.beatTime();
    const payload = { degree, velocity, position, beatTime, userId: client.userId || 'local' };
    playCrowd(payload, true);
    client.strike(payload);
  }

  function pointerToStrike(event) {
    const box = canvas.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    const scale = crowdScale(client.state.mood);
    const span = scale.length * 2;
    const degree = Math.max(0, Math.min(span - 1, Math.floor(x * span)));
    const velocity = Math.max(0.15, Math.min(1, 1 - y));
    const cx = 0.5;
    const cy = 0.55;
    const dist = Math.min(1, Math.hypot(x - cx, y - cy) * 1.6);
    return { degree, velocity, position: dist };
  }

  function stopSources() {
    for (const handle of state.sources) {
      try { handle.source.stop(); } catch { /* already */ }
    }
    state.sources = [];
    state.crowd = [];
    state.scheduled.clear();
    if (state.bed) {
      try { state.bed.source.stop(); } catch { /* already */ }
      state.bed = null;
    }
  }

  function tick() {
    if (!state.playing) return;
    schedulePhrase();
    duckCheck();
    refreshMeta();
    const current = [...state.sources, ...state.crowd]
      .filter((s) => s.start <= state.audio.currentTime && s.partials)
      .sort((a, b) => b.start - a.start)[0];
    if (current && current !== state.current) {
      state.current = current;
      state.lastPartials = current.partials || [];
      setText(nowEl, current.label || '');
    }
    state.timer = window.setTimeout(tick, 120);
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
    const partials = state.current?.partials || state.lastPartials || [];
    if (!partials.length) {
      ctx.fillStyle = colors.bg || colors.card;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = colors.line;
      ctx.beginPath();
      ctx.ellipse(width * 0.5, height * 0.55, width * 0.22, height * 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
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

  function resyncSchedule() {
    state.clock = clockSnapshot(client.state);
    applySpace();
    if (!state.playing || !state.audio) return;
    state.scheduled.clear();
    restartBed();
    schedulePhrase();
  }

  async function start() {
    if (!canStartAudio(client.mode, { unlocking: state.unlocking, playing: state.playing })) return;
    setText(errorEl, '');
    state.unlocking = true;
    setPlaying(false);
    try {
      const ctx = ensureGraph();
      stopSources();
      applySpace();
      const pending = resumeInGesture(ctx);
      playSilentUnlock(ctx);
      if (pending) await pending;
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        setText(errorEl, SILENT_MODE_HINT);
      }
      state.unlocking = false;
      setPlaying(true);
      restartBed();
      schedulePhrase();
      tick();
      if (state.raf) window.cancelAnimationFrame(state.raf);
      state.raf = window.requestAnimationFrame(paint);
    } catch (err) {
      state.unlocking = false;
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

  function keepJam() {
    if (!state.ring || !state.ring.filled) return;
    const wav = ringToWav(state.ring);
    if (wav) downloadBlob(wav.blob, wav.name);
  }

  canvas?.addEventListener('pointerdown', (event) => {
    if (!state.playing) return;
    event.preventDefault();
    const hit = pointerToStrike(event);
    localStrike(hit.degree, hit.velocity, hit.position);
  });

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
    const keys = 'ASDFGHJKL';
    const i = keys.indexOf(event.key.toUpperCase());
    if (i < 0) return;
    event.preventDefault();
    localStrike(i, 0.7, 0.45);
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input?.value || '';
    const parsed = parseCommand(text);
    if (!parsed) {
      if (input) input.value = '';
      return;
    }
    client.command(text);
    if (input) input.value = '';
  });

  startBtn?.addEventListener('click', () => { start(); });
  stopBtn?.addEventListener('click', () => { stop(); });
  keepBtn?.addEventListener('click', () => { keepJam(); });

  client.on((type, detail) => {
    if (shouldResyncSchedule(type, state.clock, client.state)) resyncSchedule();
    if (type === 'welcome' || type === 'solo') setPlaying(state.playing);
    if (type === 'strike') onRemoteStrike(detail);
    refreshMeta();
  });

  setPlaying(false);
  refreshMeta();
  installGestureUnlock(root, () => {
    state.audio = beginAudio(state.audio);
    return state.audio;
  });
  client.connect();
  paint();
  return { start, stop, client, state };
}

