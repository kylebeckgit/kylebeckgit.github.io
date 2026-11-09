import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { defaultCamera, paintModalView } from './modal-view.js';

function stubContext() {
  return {
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
    fill() {},
    fillRect() {},
    fillText() {},
    clearRect() {},
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    globalAlpha: 1,
    font: '',
    textBaseline: '',
  };
}

function partials(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ ratio: (i + 1) / 4, gainDb: -((i * 17) % 70), decay: (i % 12) * 0.4 });
  }
  return out;
}

test('256 partials in the glow style draw at 60 fps', () => {
  const ctx = stubContext();
  const list = partials(256);
  const colors = { card: '#fbf8f2', line: '#d8d0c1', accent: '#d4421c', ink: '#1a1916', muted: '#6a655c', font: 'Figtree' };
  const start = performance.now();
  for (let frame = 0; frame < 60; frame++) {
    paintModalView(ctx, list, {
      width: 900,
      height: 320,
      camera: { ...defaultCamera(), yaw: frame * 0.01 },
      style: 'glow',
      colors,
      selected: frame % 256,
    });
  }
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 1000, `60 glow frames took ${elapsed.toFixed(1)} ms`);
});
