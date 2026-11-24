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
import { createJamClient, resolveHttpUrl, resolveWsUrl } from './client.js';
import { delayBeats, LEVEL, modeCap, renderBedBuffer, renderStrike, spaceWet } from './engine.js';
import { createImpulse } from '../modal-preview/stream.js';
import { createRingBuffer, downloadBlob, pushSamples, ringToWav } from './wav.js';
import { mountUploadPanel } from './upload/panel.js';
import { decodeUploadWav, resonateClip, samplesForApprovedClip } from './upload/player.js';
import { readStreamCapped } from '../../../workers/jam-room/src/body.js';

const LOOKAHEAD_BEATS = 8;
export const CROWD_CAP = 24;
export const USER_VOICES = 3;

export function applyVoiceCaps(voices, options = {}) {
  const cap = options.cap ?? CROWD_CAP;
  const userCap = options.userCap ?? USER_VOICES;
  const userId = options.userId;
  const now = options.now;
  const maxAge = options.maxAge ?? 6;
  const live = [];
  const stop = [];
  for (const voice of voices || []) {
    if (Number.isFinite(now) && Number.isFinite(voice.start) && !voice.pending && voice.start + maxAge <= now) {
      stop.push(voice);
    } else {
      live.push(voice);
    }
  }
  live.sort((a, b) => (a.start || 0) - (b.start || 0));
  while (live.length >= cap) stop.push(live.shift());
  if (userId != null && userId !== '') {
    const mine = live.filter((voice) => voice.userId === userId);
    while (mine.length >= userCap) {
      const victim = mine.shift();
      live.splice(live.indexOf(victim), 1);
      stop.push(victim);
    }
  }
  for (const voice of stop) voice.cancelled = true;
  return { keep: live, stop };
}

export function shouldStartPendingVoice(token) {
  return Boolean(token) && !token.cancelled;
}

export function bumpPlaybackSession(state) {
  state.playbackSession = (Number(state.playbackSession) || 0) + 1;
  return state.playbackSession;
}

export function shouldStartSessionVoice(token, session) {
  if (!shouldStartPendingVoice(token)) return false;
  if (token.session !== session) return false;
  return true;
}

export function cancelPlaybackTokens(state) {
  const tokens = [];
  for (const token of (state.autoplayTokens || new Map()).values()) {
    token.cancelled = true;
    if (token.handle?.source) {
      try { token.handle.source.stop(); } catch { /* already */ }
    }
    if (token.source && token.source !== token.handle?.source) {
      try { token.source.stop(); } catch { /* already */ }
    }
    tokens.push(token);
  }
  state.autoplayTokens?.clear();
  for (const token of state.uploadCrowd || []) {
    token.cancelled = true;
    if (token.source) {
      try { token.source.stop(); } catch { /* already */ }
    }
    if (token.handle?.source && token.handle.source !== token.source) {
      try { token.handle.source.stop(); } catch { /* already */ }
    }
    tokens.push(token);
  }
  return tokens;
}

export function endPlaybackSession(state) {
  const cancelled = cancelPlaybackTokens(state);
  const session = bumpPlaybackSession(state);
  return { cancelled, session };
}

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

export function upcomingAutoplayPhrase(phraseIndex) {
  return (Number(phraseIndex) || 0) + 1;
}

export function uploadClipBeat(index, state = {}) {
  const phraseBeats = (state.beatsPerBar || 4) * (state.barsPerPhrase || 8) || 32;
  let beat = (index % 8) * 2 + (index % 2) * 0.5;
  if (beat >= phraseBeats) beat = Math.max(0, phraseBeats - 0.25);
  return beat;
}

export function uploadSchedulePlan(clipId, index, state = {}, targetPhrase = 0) {
  const phraseBeats = (state.beatsPerBar || 4) * (state.barsPerPhrase || 8) || 32;
  const beatInPhrase = uploadClipBeat(index, state);
  const current = Number(state.phraseIndex) || 0;
  const phrase = Number(targetPhrase) || 0;
  return {
    key: `${phrase}:${beatInPhrase}:upload:${clipId}`,
    beat: beatInPhrase + (phrase - current) * phraseBeats,
    targetPhrase: phrase,
    beatInPhrase,
    clipId,
  };
}

export function pruneUploadScheduleKeys(scheduled, phraseIndex) {
  const floor = Number(phraseIndex) || 0;
  for (const key of [...scheduled]) {
    const phrase = Number(String(key).split(':')[0]);
    if (Number.isFinite(phrase) && phrase < floor) scheduled.delete(key);
  }
  return scheduled;
}

export function autoplayClipIdFromKey(key) {
  const text = String(key);
  const at = text.indexOf(':upload:');
  return at < 0 ? '' : text.slice(at + ':upload:'.length);
}

export function dropUnselectedAutoplayKeys(scheduled, targetPhrase, selectedIds) {
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const dropped = [];
  for (const key of [...scheduled]) {
    const phrase = Number(String(key).split(':')[0]);
    if (phrase !== targetPhrase) continue;
    const clipId = autoplayClipIdFromKey(key);
    if (ids.has(clipId)) continue;
    scheduled.delete(key);
    dropped.push(key);
  }
  return dropped;
}

export function planUpcomingAutoplay(clips, state = {}, limit = AUTOPLAY_PER_PHRASE) {
  const targetPhrase = upcomingAutoplayPhrase(state.phraseIndex);
  const chosen = selectAutoplayClips(clips, targetPhrase, state, limit);
  return {
    targetPhrase,
    clips: chosen,
    plans: chosen.map((clip, index) => uploadSchedulePlan(clip.id, index, state, targetPhrase)),
  };
}

export const AUTOPLAY_PER_PHRASE = 4;

export function clipApprovedAt(clip) {
  const n = Number(clip?.approvedAt ?? clip?.meta?.approvedAt ?? clip?.createdAt);
  return Number.isFinite(n) ? n : 0;
}

export function firstFullPhraseIndex(approvedAt, state = {}) {
  const phraseBeats = (state.beatsPerBar || 4) * (state.barsPerPhrase || 8);
  const phraseMs = msPerBeat(state.bpm) * phraseBeats;
  const epochMs = state.epochMs || 0;
  const phraseIndex = Number(state.phraseIndex) || 0;
  const approved = Number(approvedAt);
  if (!Number.isFinite(approved) || !(phraseMs > 0)) return phraseIndex + 1;
  return phraseIndex + Math.ceil((approved - epochMs) / phraseMs - 1e-9);
}

function compareAutoplayClips(a, b) {
  const delta = clipApprovedAt(a) - clipApprovedAt(b);
  if (delta !== 0) return delta;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

export function selectAutoplayClips(clips, phraseIndex, state = {}, limit = AUTOPLAY_PER_PHRASE) {
  const pool = [...(clips || [])].filter((clip) => clip && clip.id != null).sort(compareAutoplayClips);
  if (pool.length <= limit) return pool;
  const debut = [];
  const rest = [];
  const phrase = Number(phraseIndex) || 0;
  for (const clip of pool) {
    if (firstFullPhraseIndex(clipApprovedAt(clip), state) === phrase) debut.push(clip);
    else rest.push(clip);
  }
  const chosen = debut.length > limit ? debut.slice(-limit) : debut.slice();
  const need = limit - chosen.length;
  if (need <= 0 || rest.length === 0) return chosen;
  if (rest.length <= need) return chosen.concat(rest);
  const start = ((phrase % rest.length) + rest.length) % rest.length;
  for (let i = 0; i < need; i++) chosen.push(rest[(start + i) % rest.length]);
  return chosen;
}

export function uploadPlayDestinations(buses, meta = {}) {
  const dests = [];
  if (buses?.uploadRoom) dests.push(buses.uploadRoom);
  else if (buses?.mix) dests.push(buses.mix);
  if (meta?.keepOptIn && buses?.uploadKeep) dests.push(buses.uploadKeep);
  return dests;
}

export function beatAudioTime(state, beatTime, nowMs, audioNow) {
  const whenMs = (state?.epochMs || 0) + beatTime * msPerBeat(state?.bpm);
  return audioNow + (whenMs - nowMs) / 1000;
}

export function audioBufferOptions(samples, contextRate, sourceRate) {
  const sampleRate = sourceRate || contextRate;
  return { length: samples.length, sampleRate };
}

export function dropClipVoices(map, clipId) {
  const ids = clipId == null ? [...map.keys()] : [clipId];
  const stopped = [];
  for (const id of ids) {
    for (const handle of map.get(id) || []) {
      try { handle.source.stop(); } catch { /* already */ }
      stopped.push(handle);
    }
    map.delete(id);
  }
  return stopped;
}

export function canPlayApprovedClip(playing, muted, uploads, clipId) {
  if (!playing || !clipId) return false;
  if (muted && typeof muted.has === 'function' && muted.has(clipId)) return false;
  return (uploads || []).some((clip) => clip && clip.id === clipId);
}

export function retireMissingUploads(cache, voices, uploads) {
  const keep = new Set((uploads || []).map((clip) => clip && clip.id).filter(Boolean));
  const dropped = new Set();
  for (const id of [...(cache || new Map()).keys()]) {
    if (!keep.has(id)) {
      cache.delete(id);
      dropped.add(id);
    }
  }
  for (const id of [...(voices || new Map()).keys()]) {
    if (!keep.has(id)) dropped.add(id);
  }
  for (const id of dropped) dropClipVoices(voices, id);
  return [...dropped];
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
  const client = createJamClient({ url: resolveWsUrl(root), apiUrl: resolveHttpUrl(root) });

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
    uploadCache: new Map(),
    uploadScheduled: new Set(),
    playbackSession: 0,
    autoplayPlan: { phrase: -1, ids: new Set() },
    autoplayTokens: new Map(),
    uploadVoices: new Map(),
    uploadCrowd: [],
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
    const record = ctx.createGain();
    const uploadRoom = ctx.createGain();
    const uploadKeep = ctx.createGain();
    uploadRoom.gain.value = 0.7;
    uploadKeep.gain.value = 0.7;
    uploadRoom.connect(mix);
    const keepMix = ctx.createGain();
    melody.connect(keepMix);
    pulse.connect(keepMix);
    duck.connect(keepMix);
    bed.connect(keepMix);
    uploadKeep.connect(keepMix);
    const keepDry = ctx.createGain();
    const keepWet = ctx.createGain();
    const keepDelayWet = ctx.createGain();
    keepDry.gain.value = 0.86;
    keepWet.gain.value = spaceWet(client.state.space);
    keepDelayWet.gain.value = client.state.space > 0 ? 0.18 : 0;
    const keepDelay = ctx.createDelay(2);
    const keepDelayFb = ctx.createGain();
    keepDelayFb.gain.value = client.state.space >= 2 ? 0.28 : client.state.space > 0 ? 0.16 : 0;
    keepDelay.delayTime.value = delaySeconds();
    const keepConv = ctx.createConvolver();
    keepConv.buffer = buffer;
    const keepComp = ctx.createDynamicsCompressor();
    keepComp.threshold.value = -14;
    keepComp.knee.value = 10;
    keepComp.ratio.value = 3;
    keepComp.attack.value = 0.008;
    keepComp.release.value = 0.16;
    const keepLimiter = ctx.createWaveShaper();
    keepLimiter.curve = limiterCurve();
    keepLimiter.oversample = '2x';
    keepMix.connect(keepDry);
    keepMix.connect(keepConv);
    keepMix.connect(keepDelay);
    keepDelay.connect(keepDelayFb);
    keepDelayFb.connect(keepDelay);
    keepDelay.connect(keepDelayWet);
    keepConv.connect(keepWet);
    keepDry.connect(keepComp);
    keepWet.connect(keepComp);
    keepDelayWet.connect(keepComp);
    keepComp.connect(keepLimiter);
    keepLimiter.connect(record);
    limiter.connect(out);
    out.connect(ctx.destination);
    attachRecorder(ctx, record);
    state.buses = {
      melody, pulse, crowd, bed, duck, mix, dry, wet, delay, delayFb, delayWet, out, record,
      uploadRoom, uploadKeep, keepMix, keepWet, keepDelay, keepDelayFb, keepDelayWet, keepLimiter,
    };
    return ctx;
  }

  function delaySeconds() {
    const beats = delayBeats(client.state.space);
    if (!beats) return 0.001;
    return (beats * msPerBeat(client.state.bpm)) / 1000;
  }

  function applySpace() {
    if (!state.buses) return;
    const wet = spaceWet(client.state.space);
    const delayW = client.state.space > 0 ? 0.18 : 0;
    const fb = client.state.space >= 2 ? 0.28 : client.state.space > 0 ? 0.16 : 0;
    const time = delaySeconds();
    state.buses.wet.gain.value = wet;
    state.buses.delayWet.gain.value = delayW;
    state.buses.delayFb.gain.value = fb;
    state.buses.delay.delayTime.value = time;
    if (state.buses.keepWet) {
      state.buses.keepWet.gain.value = wet;
      state.buses.keepDelayWet.gain.value = delayW;
      state.buses.keepDelayFb.gain.value = fb;
      state.buses.keepDelay.delayTime.value = time;
    }
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
    return beatAudioTime(client.state, beatTime, client.nowMs(), state.audio.currentTime);
  }

  function playBuffer(samples, when, dest, pan = 0, sampleRate) {
    const ctx = state.audio;
    const rate = audioBufferOptions(samples, ctx.sampleRate, sampleRate).sampleRate;
    const buffer = ctx.createBuffer(1, samples.length, rate);
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
    const outputs = Array.isArray(dest) ? dest : [dest];
    for (const output of outputs) {
      if (output) node.connect(output);
    }
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
    scheduleUploads();
  }

  function clipAudioUrl(clip) {
    const path = clip.audioUrl || `/uploads/${clip.id}/audio`;
    if (/^https?:/i.test(path)) return path;
    return `${String(client.apiUrl || '').replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  }

  async function bufferForClip(clip) {
    if (state.uploadCache.has(clip.id)) return state.uploadCache.get(clip.id);
    const pending = (async () => {
      let res;
      try {
        res = await fetch(clipAudioUrl(clip));
      } catch {
        throw new Error('clip missing');
      }
      if (!res.ok) throw new Error('clip missing');
      const packed = await readStreamCapped(res.body, 1024 * 1024);
      if (packed.tooLarge || !packed.bytes?.byteLength) throw new Error('clip missing');
      return decodeUploadWav(packed.bytes);
    })();
    state.uploadCache.set(clip.id, pending);
    try {
      return await pending;
    } catch (err) {
      state.uploadCache.delete(clip.id);
      throw err;
    }
  }

  function scheduleUploads() {
    const clips = (client.uploads || []).filter((clip) => !client.muted.has(clip.id));
    if (!clips.length || !state.buses) return;
    const current = client.state.phraseIndex;
    pruneUploadScheduleKeys(state.uploadScheduled, current);
    const planned = planUpcomingAutoplay(clips, client.state, AUTOPLAY_PER_PHRASE);
    const selectedIds = new Set(planned.clips.map((clip) => clip.id));
    state.autoplayPlan = { phrase: planned.targetPhrase, ids: selectedIds };
    const dropped = dropUnselectedAutoplayKeys(state.uploadScheduled, planned.targetPhrase, selectedIds);
    for (const key of dropped) cancelAutoplayToken(key);
    planned.clips.forEach((clip, index) => {
      const plan = planned.plans[index];
      if (state.uploadScheduled.has(plan.key)) return;
      const when = audioTimeForBeat(plan.beat);
      if (when + 0.05 < state.audio.currentTime) return;
      const token = { autoplayPhrase: planned.targetPhrase, clipId: clip.id, cancelled: false, handle: null, session: state.playbackSession };
      state.uploadScheduled.add(plan.key);
      state.autoplayTokens.set(plan.key, token);
      void playApprovedClip(clip, when, index, token).then((handle) => {
        token.handle = handle || null;
        if (!handle || token.cancelled) {
          if (handle?.source) {
            try { handle.source.stop(); } catch { /* already */ }
          }
          state.autoplayTokens.delete(plan.key);
        }
      });
    });
  }

  function cancelAutoplayToken(key) {
    const token = state.autoplayTokens.get(key);
    if (token) {
      token.cancelled = true;
      if (token.handle?.source) {
        try { token.handle.source.stop(); } catch { /* already */ }
      }
    }
    state.autoplayTokens.delete(key);
  }

  function clipStillPlayable(clipId) {
    return Boolean(state.audio && state.buses && canPlayApprovedClip(state.playing, client.muted, client.uploads, clipId));
  }

  async function playApprovedClip(clip, when, index, token) {
    if (token && !shouldStartSessionVoice(token, state.playbackSession)) return;
    if (!clipStillPlayable(clip.id)) return;
    let decoded;
    try { decoded = await bufferForClip(clip); }
    catch { return; }
    if (token && !shouldStartSessionVoice(token, state.playbackSession)) return;
    if (!clipStillPlayable(clip.id)) return;
    const prepared = samplesForApprovedClip(decoded.samples, decoded.sampleRate, clip, index);
    let body;
    try {
      body = resonateClip(prepared.samples, decoded.sampleRate, prepared.meta, client.state, { degree: index, peak: 0.18 });
    } catch {
      return;
    }
    if (token && !shouldStartSessionVoice(token, state.playbackSession)) return;
    if (!clipStillPlayable(clip.id)) return;
    if (token && !shouldStartSessionVoice(token, state.playbackSession)) return;
    if (!state.playing) return;
    if (token?.autoplayPhrase != null) {
      const plan = state.autoplayPlan;
      if (!plan || plan.phrase !== token.autoplayPhrase || !plan.ids.has(clip.id)) return;
    }
    const dests = uploadPlayDestinations(state.buses, prepared.meta);
    const startAt = Math.max(when || state.audio.currentTime + 0.05, state.audio.currentTime + 0.02);
    const handle = playBuffer(body.samples, startAt, dests, 0, decoded.sampleRate);
    trackUploadVoice(clip.id, handle);
    return handle;
  }

  function trackUploadVoice(clipId, handle) {
    if (!handle || !clipId) return;
    handle.clipId = clipId;
    const list = state.uploadVoices.get(clipId) || [];
    list.push(handle);
    state.uploadVoices.set(clipId, list);
    const previous = handle.source.onended;
    handle.source.onended = () => {
      if (typeof previous === 'function') previous();
      const cur = (state.uploadVoices.get(clipId) || []).filter((item) => item !== handle);
      if (cur.length) state.uploadVoices.set(clipId, cur);
      else state.uploadVoices.delete(clipId);
    };
  }

  function stopUploadVoices(clipId) {
    dropClipVoices(state.uploadVoices, clipId);
    if (clipId == null) {
      for (const key of [...state.autoplayTokens.keys()]) cancelAutoplayToken(key);
      state.uploadScheduled.clear();
      return;
    }
    const needle = `:upload:${clipId}`;
    for (const key of [...state.uploadScheduled]) {
      if (key.endsWith(needle)) {
        cancelAutoplayToken(key);
        state.uploadScheduled.delete(key);
      }
    }
  }

  function stopCrowdVoice(voice) {
    if (!voice) return;
    if (voice.source) {
      try { voice.source.stop(); } catch { /* already */ }
    }
    if (voice.handle?.source && voice.handle.source !== voice.source) {
      try { voice.handle.source.stop(); } catch { /* already */ }
    }
  }

  function playUploadCrowd(strike, local) {
    const clips = (client.uploads || []).filter((clip) => !client.muted.has(clip.id));
    if (!clips.length) return false;
    const clip = clips[Math.abs(Math.floor(strike.degree || 0)) % clips.length];
    const when = audioTimeForBeat(strike.beatTime);
    if (when + 0.08 < state.audio.currentTime && !local) return true;
    const userId = strike.userId || 'local';
    const capped = applyVoiceCaps(state.uploadCrowd, {
      cap: CROWD_CAP,
      userCap: USER_VOICES,
      userId,
      now: state.audio.currentTime,
    });
    for (const voice of capped.stop) stopCrowdVoice(voice);
    state.uploadCrowd = capped.keep;
    const token = { userId, start: Math.max(when, state.audio.currentTime + 0.01), pending: true, clipId: clip.id, session: state.playbackSession };
    state.uploadCrowd.push(token);
    void playApprovedClip(clip, token.start, Math.floor(strike.degree || 0), token).then((handle) => {
      if (!handle || !shouldStartSessionVoice(token, state.playbackSession)) {
        if (handle?.source) {
          try { handle.source.stop(); } catch { /* already */ }
        }
        state.uploadCrowd = state.uploadCrowd.filter((item) => item !== token);
        return;
      }
      token.handle = handle;
      token.source = handle.source;
      token.start = handle.start;
      token.pending = false;
      handle.userId = userId;
      const previous = handle.source.onended;
      handle.source.onended = () => {
        if (typeof previous === 'function') previous();
        state.uploadCrowd = state.uploadCrowd.filter((item) => item !== token);
      };
    });
    return true;
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
    if (client.state.materials?.crowd === 'upload') {
      if (playUploadCrowd(strike, local)) return;
    }
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
    cancelPlaybackTokens(state);
    for (const handle of state.sources) {
      try { handle.source.stop(); } catch { /* already */ }
    }
    state.sources = [];
    state.crowd = [];
    state.scheduled.clear();
    state.uploadScheduled.clear();
    dropClipVoices(state.uploadVoices, null);
    state.uploadCrowd = [];
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
    // Keep uploadScheduled: each phrase has one selection, keyed by that
    // phrase, so a resync does not start the upcoming set twice.
    restartBed();
    schedulePhrase();
  }

  async function start() {
    if (!canStartAudio(client.mode, { unlocking: state.unlocking, playing: state.playing })) return;
    setText(errorEl, '');
    const session = bumpPlaybackSession(state);
    state.unlocking = true;
    setPlaying(false);
    try {
      const ctx = ensureGraph();
      stopSources();
      applySpace();
      const pending = resumeInGesture(ctx);
      playSilentUnlock(ctx);
      if (pending) await pending;
      if (state.playbackSession !== session) {
        state.unlocking = false;
        return;
      }
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
    state.unlocking = false;
    endPlaybackSession(state);
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
    if (type === 'uploads' || type === 'upload-removed' || type === 'uploads-cleared' || type === 'welcome' || type === 'mute') {
      if (type === 'mute' && detail?.muted && detail?.uploadId) stopUploadVoices(detail.uploadId);
      if (type === 'uploads' || type === 'upload-removed' || type === 'uploads-cleared' || type === 'welcome') {
        const dropped = retireMissingUploads(state.uploadCache, state.uploadVoices, client.uploads || []);
        for (const id of dropped) {
          const needle = `:upload:${id}`;
          for (const key of [...state.uploadScheduled]) {
            if (key.endsWith(needle)) {
              cancelAutoplayToken(key);
              state.uploadScheduled.delete(key);
            }
          }
        }
        if (type === 'uploads-cleared') {
          for (const key of [...state.autoplayTokens.keys()]) cancelAutoplayToken(key);
          state.uploadScheduled.clear();
        }
      }
      panel?.renderList(client.uploads, client.muted);
    }
    refreshMeta();
  });

  const panel = mountUploadPanel(root.querySelector('[data-upload-panel]'), {
    client,
    getAudioContext: () => {
      try { return ensureGraph(); } catch { return state.audio; }
    },
    getRoomState: () => client.state,
    upload: (bytes, meta) => client.postUpload(bytes, meta),
    onMute: (id) => {
      client.toggleMute(id);
      panel?.renderList(client.uploads, client.muted);
    },
    onReport: (id) => {
      client.report(id);
    },
  });
  panel?.renderList(client.uploads, client.muted);

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

