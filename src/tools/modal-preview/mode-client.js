import { flatSpec, specKey } from './mode-solve.js';

export { flatSpec, patternNote, specKey } from './mode-solve.js';

const cache = new Map();
const times = new Map();
let worker = null;
let workerFailed = false;

function solver() {
  if (worker || workerFailed) return worker;
  try {
    worker = new Worker(new URL('./mode-solve-worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('error', () => { workerFailed = true; });
  } catch {
    workerFailed = true;
    worker = null;
  }
  return worker;
}

export function solveMs(body) {
  const spec = flatSpec(body);
  if (!spec) return null;
  return times.get(specKey(spec)) ?? null;
}

export function cachedModes(body) {
  const spec = flatSpec(body);
  if (!spec) return null;
  return cache.get(specKey(spec)) || null;
}

export function trackFlatModes(repaint) {
  let stop = () => {};
  let pending = '';
  return (body) => {
    const spec = flatSpec(body);
    if (!spec) {
      stop();
      pending = '';
      return null;
    }
    const key = specKey(spec);
    const hit = cache.get(key);
    if (hit) return hit;
    if (pending !== key) {
      stop();
      pending = key;
      stop = ensureFlatModes(body, (modes, ms) => {
        times.set(key, ms);
        if (pending === key) pending = '';
        repaint();
      });
    }
    return null;
  };
}

export function ensureFlatModes(body, onReady) {
  const spec = flatSpec(body);
  if (!spec) return () => {};
  const key = specKey(spec);
  const hit = cache.get(key);
  if (hit) {
    onReady(hit);
    return () => {};
  }
  const thread = solver();
  if (!thread) return () => {};
  const onMessage = (event) => {
    if (event.data?.key !== key) return;
    cache.set(key, event.data.modes);
    thread.removeEventListener('message', onMessage);
    onReady(event.data.modes, event.data.ms);
  };
  thread.addEventListener('message', onMessage);
  thread.postMessage({ id: key, ...spec });
  return () => thread.removeEventListener('message', onMessage);
}
