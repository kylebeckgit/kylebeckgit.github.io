// iOS plays web audio through the ringer. Silent mode mutes it unless the
// page asks for a playback session. Safari 16.4+ / iOS 17.

export const SILENT_MODE_HINT = 'No sound? Turn off silent mode on your iPhone.';

export function prepareAudioSession(nav = globalThis.navigator) {
  try {
    const session = nav?.audioSession;
    if (session && typeof session === 'object' && 'type' in session) session.type = 'playback';
  } catch {
    // Missing or read-only on browsers that do not implement the API.
  }
}

export function audioContextClass(win = globalThis.window) {
  return win?.AudioContext || win?.webkitAudioContext || null;
}

// Resume inside the gesture. Playback is requested before resume, including
// when iOS has left the context interrupted or suspended.
export function resumeInGesture(ctx, nav = globalThis.navigator) {
  prepareAudioSession(nav);
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

export function playSilentUnlock(ctx) {
  if (!ctx?.createBuffer) return;
  try {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
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
