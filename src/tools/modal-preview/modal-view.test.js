import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { clampCamera, defaultCamera, frameMotion, paintModalView } from './modal-view.js';
import { shapePartials } from './shape.js';

function stubContext() {
  const ctx = {
    strokes: 0,
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() { ctx.strokes += 1; },
    fill() {},
    fillRect() {},
    fillText() {},
    clearRect() {},
    save() {},
    restore() {},
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    globalAlpha: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
  };
  return ctx;
}

function partials(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ ratio: i + 1, gainDb: -i * 0.7, decay: 2.2 / 2 ** (i * 0.08) });
  }
  return out;
}

const colors = { accent: '#d4421c' };

test('resting motion leaves the camera and the partials for a later pass', () => {
  const list = partials(4);
  const camera = defaultCamera();
  const frame = frameMotion({ partials: list, camera, time: 0 });
  assert.equal(frame.partials, list);
  assert.equal(frame.camera, camera);
  assert.equal(frame.time, 0);
});

test('the prism stays inside the canvas at the default angle and a drag', () => {
  const ctx = stubContext();
  const list = partials(64);
  const points = [];
  ctx.lineTo = (x, y) => { points.push({ x, y }); };
  ctx.moveTo = (x, y) => { points.push({ x, y }); };
  for (const camera of [defaultCamera(), clampCamera({ yaw: 1.8, pitch: 0.3, distance: 3.6 })]) {
    points.length = 0;
    paintModalView(ctx, list, { width: 960, height: 460, style: 'fast', colors, camera });
    assert.ok(points.length > 30);
    for (const point of points) {
      assert.ok(point.x >= -1 && point.x <= 961, `x ${point.x}`);
      assert.ok(point.y >= -1 && point.y <= 461, `y ${point.y}`);
    }
  }
});

test('256 modes in the glow style draw at 60 fps', () => {
  const ctx = stubContext();
  const many = partials(256);
  const start = performance.now();
  for (let frame = 0; frame < 60; frame++) {
    paintModalView(ctx, many, {
      width: 960,
      height: 460,
      style: 'glow',
      colors,
      camera: defaultCamera(),
      selected: frame % 256,
    });
  }
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 1000, `60 glow frames took ${elapsed.toFixed(1)} ms`);
});

test('density keeps the outline while absorb only nudges the highs', () => {
  const list = partials(16);
  const same = shapePartials(list, { absorb: 0, disperse: 0, decay: 0, density: 16 });
  assert.equal(same.length, 16);
  assert.ok(Math.abs(same[0].ratio - list[0].ratio) < 1e-6);
  assert.ok(Math.abs(same[15].decay - list[15].decay) < 1e-6);

  const sparse = shapePartials(list, { density: 8 });
  assert.equal(sparse.length, 8);
  assert.ok(sparse[7].ratio > list[12].ratio);

  const dense = shapePartials(list, { density: 32 });
  assert.equal(dense.length, 32);
  assert.ok(dense[31].ratio > list[14].ratio);

  const absorbed = shapePartials(list, { absorb: 1, density: 16 });
  const low = absorbed[0].decay / list[0].decay;
  const high = absorbed[15].decay / list[15].decay;
  assert.ok(high < low);
  assert.ok(high > 0.25);

  const spread = shapePartials(list, { disperse: 1, density: 16 });
  assert.ok(spread[15].ratio > list[15].ratio * 1.2);
});
