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
    measureText(text) { return { width: String(text).length * 7 }; },
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

test('the scene stays inside the canvas and the modes stay upright', () => {
  const ctx = stubContext();
  ctx.measureText = (text) => ({ width: String(text).length * 7 });
  const list = partials(64);
  const colors = { card: '#24211d', bg: '#161513', line: '#3a362f', accent: '#d4421c', ink: '#f2ede3', muted: '#c4bdb2', font: 'Figtree' };
  const points = [];
  const original = ctx.lineTo;
  ctx.lineTo = (x, y) => { points.push({ x, y }); original.call(ctx, x, y); };
  ctx.moveTo = (x, y) => { points.push({ x, y }); };
  for (const yaw of [-0.8, 0.2, 0.55, 1.4]) {
    points.length = 0;
    paintModalView(ctx, list, {
      width: 900,
      height: 320,
      camera: { ...defaultCamera(), yaw, pitch: 0.35 + Math.abs(yaw) * 0.1 },
      style: 'fast',
      colors,
    });
    assert.ok(points.length > 10);
    for (const point of points) {
      assert.ok(point.x >= -1 && point.x <= 901, `x ${point.x} at yaw ${yaw}`);
      assert.ok(point.y >= -1 && point.y <= 321, `y ${point.y} at yaw ${yaw}`);
    }
  }
});

test('256 partials in the glow style draw at 60 fps', () => {
  const ctx = stubContext();
  const list = partials(256);
  const colors = { card: '#fbf8f2', bg: '#f2ede3', line: '#d8d0c1', accent: '#d4421c', ink: '#1a1916', muted: '#6a655c', font: 'Figtree' };
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
