// iOS plays web audio through the ringer. Silent mode mutes it unless the
// page asks for a playback session. Safari 16.4+ / iOS 17.

export const SILENT_MODE_HINT = 'No sound? Turn off silent mode on your iPhone.';

// Eight samples of almost-silence. iOS will not promote a muted or empty
// element to a playback session, so the first sample is 1/32767.
const SILENT_WAV = 'data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YRAAAAABAAAAAAAAAAAAAAAAAAAA';

export function prepareAudioSession(nav = globalThis.navigator) {
  try {
    const session = nav?.audioSession;
    if (session && typeof session === 'object' && 'type' in session) session.type = 'playback';
  } catch {
    // Missing or read-only on browsers that do not implement the API.
  }
}

// A hidden HTML audio element covers iPhones that have no audioSession API
// yet, and cases where a one-sample Web Audio unlock starts while the
// context is still suspended.
export function playHtmlUnlock(doc = globalThis.document) {
  if (!doc) return null;
  try {
    let el = doc.querySelector?.('[data-ios-audio-unlock]');
    if (!el) {
      if (typeof doc.createElement !== 'function') return null;
      el = doc.createElement('audio');
      el.setAttribute('data-ios-audio-unlock', '');
      el.setAttribute('playsinline', '');
      el.setAttribute('webkit-playsinline', '');
      el.setAttribute('aria-hidden', 'true');
      el.playsInline = true;
      el.preload = 'auto';
      el.controls = false;
      el.tabIndex = -1;
      el.src = SILENT_WAV;
      if (el.style) el.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none';
      (doc.body || doc.documentElement)?.appendChild(el);
    }
    const pending = el.play?.();
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    return pending || null;
  } catch {
    return null;
  }
}

export function audioContextClass(win = globalThis.window) {
  return win?.AudioContext || win?.webkitAudioContext || null;
}

// Resume inside the gesture. Playback is requested before resume, including
// when iOS has left the context interrupted or suspended.
export function resumeInGesture(ctx, nav = globalThis.navigator, doc = globalThis.document) {
  prepareAudioSession(nav);
  playHtmlUnlock(doc);
  if (!ctx) return null;
  try {
    if (ctx.state === 'interrupted' || ctx.state === 'suspended' || ctx.state !== 'running') return ctx.resume();
    return ctx.resume();
  } catch {
    return null;
  }
}

export function beginAudio(existing, win = globalThis.window, nav = globalThis.navigator) {
  prepareAudioSession(nav);
  const AudioCtx = audioContextClass(win);
  const ctx = existing || (AudioCtx ? new AudioCtx() : null);
  if (!ctx) return null;
  resumeInGesture(ctx, nav);
  return ctx;
}

export function playSilentUnlock(ctx, doc = globalThis.document) {
  playHtmlUnlock(doc);
  if (!ctx?.createBuffer) return;
  try {
    const rate = ctx.sampleRate || 44100;
    // One sample can already have passed by the time a suspended WebKit
    // context starts running, so hold a short silent buffer instead.
    const frames = Math.max(1, Math.floor(rate * 0.05));
    const buffer = ctx.createBuffer(1, frames, rate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  } catch {
    // A missing destination still leaves the playback session in place.
  }
}

export function installGestureUnlock(root, getContext) {
  if (!root || root.dataset?.audioUnlock === 'on') return;
  if (root.dataset) root.dataset.audioUnlock = 'on';
  let once = false;
  const fire = () => {
    const ctx = getContext();
    if (!ctx) return;
    resumeInGesture(ctx);
    if (!once) {
      playSilentUnlock(ctx);
      once = true;
    }
  };
  root.addEventListener('pointerup', fire, true);
  root.addEventListener('touchend', fire, true);
}
