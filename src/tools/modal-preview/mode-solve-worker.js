import { solveFlatModes } from './mode-solve.js';

let latest = 0;

self.onmessage = (event) => {
  const message = event.data || {};
  if (!message.id || message.cancel) return;
  latest = message.id;
  const id = message.id;
  const started = performance.now();
  const solved = solveFlatModes(message);
  if (id !== latest) return;
  self.postMessage({
    id,
    key: `${message.shape}|${message.model}|${message.material}`,
    modes: solved.modes,
    nodes: solved.nodes,
    ms: performance.now() - started,
  });
};
