import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { paintModalView } from './modal-view.js';
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
    measureText(text) { return { width: String(text).length * 7 }; },
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineCap: 'butt',
    font: '',
    textBaseline: '',
  };
  return ctx;
}

function partials(count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ ratio: i + 1, gainDb: -i * 1.1, decay: 2.2 / 2 ** (i * 0.12) });
  }
  return out;
}

const colors = { accent: '#d4421c' };

test('the fixed wedge stays inside the canvas', () => {
  const ctx = stubContext();
  const list = partials(64);
  const points = [];
  ctx.lineTo = (x, y) => { points.push({ x, y }); };
  ctx.moveTo = (x, y) => { points.push({ x, y }); };
  paintModalView(ctx, list, { width: 900, height: 420, style: 'fast', colors });
  assert.ok(points.length > 20);
  for (const point of points) {
    assert.ok(point.x >= -1 && point.x <= 901, `x ${point.x}`);
    assert.ok(point.y >= -1 && point.y <= 421, `y ${point.y}`);
  }
});

test('eco draws fewer strokes than fast, and glow stays cheap at 256 modes', () => {
  const list = partials(64);
  const eco = stubContext();
  const fast = stubContext();
  paintModalView(eco, list, { width: 900, height: 420, style: 'eco', colors });
  paintModalView(fast, list, { width: 900, height: 420, style: 'fast', colors });
  assert.ok(eco.strokes < fast.strokes);

  const glow = stubContext();
  const many = partials(256);
  const start = performance.now();
  for (let frame = 0; frame < 60; frame++) {
    paintModalView(glow, many, { width: 900, height: 420, style: 'glow', colors, selected: frame % 256 });
  }
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 1000, `60 glow frames took ${elapsed.toFixed(1)} ms`);
});

test('absorb, disperse, and density rewrite the partial list', () => {
  const list = partials(16);
  const same = shapePartials(list, { absorb: 0, disperse: 0, decay: 0, density: 16 });
  assert.equal(same.length, 16);
  assert.ok(Math.abs(same[0].ratio - list[0].ratio) < 1e-9);
  assert.ok(Math.abs(same[0].decay - list[0].decay) < 1e-9);
  assert.ok(Math.abs(same[15].ratio - list[15].ratio) < 1e-6);

  const absorbed = shapePartials(list, { absorb: 1, density: 16 });
  assert.ok(absorbed[15].decay < list[15].decay * 0.2);
  assert.ok(absorbed[15].decay / list[15].decay < absorbed[0].decay / list[0].decay);
  assert.ok(absorbed[15].gainDb < list[15].gainDb);

  const spread = shapePartials(list, { disperse: 1, density: 16 });
  assert.ok(Math.abs(spread[0].ratio - list[0].ratio) < 1e-9);
  assert.ok(spread[15].ratio > list[15].ratio * 1.5);

  const thin = shapePartials(list, { density: 8 });
  assert.equal(thin.length, 8);
  assert.ok(thin[7].ratio < list[15].ratio);
});
