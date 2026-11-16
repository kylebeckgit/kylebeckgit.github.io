import assert from 'node:assert/strict';
import test from 'node:test';
import { previewPartials, defaultControls } from './engine.js';
import { shapePartials } from './shape.js';
import { combHeights, decayStrandSegments, defaultCamera, layoutTriangles, paintModalView, sliceFromPartial } from './modal-view.js';

const colors = { accent: '#d4421c', bg: '#f4efe6', fg: '#241f1a', muted: '#6d675f' };
const WIDTH = 800;
const HEIGHT = 520;

const BASE = {
  absorb: 0,
  disperse: 0,
  decay: 0,
  decayKf: 0,
  normalize: 0,
  tune: 0,
  density: 16,
  detune: 0,
  position: 0.18,
};

// Endpoints, a midpoint, and the settings that used to throw a fan of strands.
const KNOBS = {
  tune: [-48, 0, 10, 48],
  detune: [-1, -0.48, 0, 1],
  decay: [-1, 0, 0.67, 1],
  decayKf: [-1, -0.66, 0, 1],
  position: [0.02, 0.11, 0.18, 0.98],
  density: [8, 16, 64, 256],
  absorb: [-1, -0.39, 0, 1],
  disperse: [-1, 0, 0.58, 1],
  normalize: [-1, 0, 0.18, 1],
};

const SHAPE_KEYS = ['absorb', 'disperse', 'decay', 'decayKf', 'normalize', 'tune', 'density'];

function stubContext() {
  const points = [];
  return {
    points,
    beginPath() {},
    moveTo(x, y) { points.push({ x, y }); },
    lineTo(x, y) { points.push({ x, y }); },
    closePath() {},
    stroke() {},
    fill() {},
    fillRect() {},
    clearRect() {},
    save() {},
    restore() {},
  };
}

function shaped(settings) {
  const shape = {};
  for (const key of SHAPE_KEYS) shape[key] = settings[key];
  return shapePartials(previewPartials(defaultControls()), shape);
}

function longTails(tris) {
  return tris.filter((tri) => {
    const curve = tri.curve || [];
    if (curve.length < 2) return false;
    const a = curve[0];
    const b = curve[curve.length - 1];
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    return dx > 28 && dx > dy * 0.4;
  }).length;
}

function laneCrossings(tris, segments) {
  const bars = tris
    .map((tri) => tri)
    .filter((tri) => tri?.foot && tri?.crest)
    .sort((a, b) => a.foot.x - b.foot.x);
  let crossings = 0;
  for (const segment of segments) {
    let owner = 0;
    let best = Infinity;
    for (let i = 0; i < bars.length; i++) {
      const dx = Math.abs(bars[i].foot.x - segment.start.x);
      if (dx < best) {
        best = dx;
        owner = i;
      }
    }
    for (let step = 0; step <= 16; step++) {
      const t = step / 16;
      const x = segment.start.x + (segment.end.x - segment.start.x) * t;
      const y = segment.start.y + (segment.end.y - segment.start.y) * t;
      for (let i = 0; i < bars.length; i++) {
        if (i === owner) continue;
        const bar = bars[i];
        const gap = Math.abs(bar.foot.x - bars[owner].foot.x);
        const radius = Math.min(1.75, gap * 0.35);
        const top = Math.min(bar.crest.y, bar.foot.y);
        const bottom = Math.max(bar.crest.y, bar.foot.y);
        // Through the neighbor post itself. Depth behind the crest is this post's lane.
        if (Math.abs(x - bar.foot.x) <= radius && y > top + 3 && y < bottom - 3) crossings += 1;
      }
    }
  }
  return crossings;
}

function assess(settings) {
  const partials = shaped(settings);
  const slices = combHeights(partials.map((partial) => sliceFromPartial(partial, 1)), settings.position);
  const camera = defaultCamera();
  const tris = layoutTriangles(slices, camera, WIDTH, HEIGHT, settings.detune);
  const segments = decayStrandSegments(slices, camera, WIDTH, HEIGHT, settings.detune);
  const crossings = laneCrossings(tris, segments);
  const tails = longTails(tris);
  const ctx = stubContext();
  paintModalView(ctx, partials, {
    width: WIDTH,
    height: HEIGHT,
    style: 'fast',
    colors,
    camera,
    detune: settings.detune,
    position: settings.position,
  });
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const tri of tris) {
    const samples = [tri.foot, tri.crest, tri.back, tri.floor, ...(tri.curve || [])];
    for (const point of samples) {
      if (!point) continue;
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
  }
  for (const segment of segments) {
    for (const point of [segment.start, segment.end]) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
  }
  const margin = 16;
  const box = {
    minX: minX - margin,
    maxX: maxX + margin,
    minY: minY - margin,
    maxY: maxY + margin,
  };
  let outside = 0;
  for (const point of ctx.points) {
    if (point.x < box.minX || point.x > box.maxX || point.y < box.minY || point.y > box.maxY) outside += 1;
  }
  let spanX = 0;
  let spanY = 0;
  if (Number.isFinite(minX)) {
    spanX = maxX - minX;
    spanY = maxY - minY;
  }
  return {
    tails,
    crossings,
    outside,
    points: ctx.points.length,
    foot: tris[0].foot,
    span: Math.hypot(spanX, spanY),
  };
}

test('the reported knob settings keep the strands on the comb', () => {
  const settings = {
    ...BASE,
    tune: 10,
    detune: -0.48,
    decay: 0.67,
    decayKf: -0.66,
    position: 0.11,
    density: 16,
    absorb: -0.39,
    disperse: 0.58,
    normalize: 0.18,
  };
  const frame = assess(settings);
  assert.ok(frame.points > 40, 'the figure drew');
  assert.ok(frame.tails >= 2, `${frame.tails} decay curves left their own bars`);
  assert.equal(frame.crossings, 0, `${frame.crossings} strand samples crossed a neighbor`);
  assert.equal(frame.outside, 0, `${frame.outside} points left the figure`);
});

test('strand length grows with decay and stays out of neighboring posts', () => {
  const partials = shaped(BASE);
  const slices = combHeights(partials.map((partial) => sliceFromPartial(partial, 1)), BASE.position);
  const camera = defaultCamera();
  const segments = decayStrandSegments(slices, camera, WIDTH, HEIGHT, 0);
  const length = (segment) => Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
  const longest = length(segments[0]);
  const shortest = length(segments[segments.length - 1]);
  assert.ok(longest > shortest * 2.4, `decay length ${longest.toFixed(1)} vs ${shortest.toFixed(1)}`);
  assert.ok(segments[0].depth > segments[segments.length - 1].depth * 2.4);
  const narrow = { ...BASE, density: 256, decay: 1, decayKf: -1, detune: 1 };
  const packed = shaped(narrow);
  const packedSlices = combHeights(packed.map((partial) => sliceFromPartial(partial, 1)), narrow.position);
  const packedSegments = decayStrandSegments(packedSlices, camera, 320, 240, narrow.detune);
  const bars = layoutTriangles(packedSlices, camera, 320, 240, narrow.detune);
  assert.equal(laneCrossings(bars, packedSegments), 0);
});

test('every knob, alone and in pairs, stays on the figure', () => {
  const names = Object.keys(KNOBS);
  let frames = 0;
  const checkStep = (settings, previous) => {
    const frame = assess(settings);
    frames += 1;
    assert.ok(frame.tails >= 2, `${frame.tails} decay curves at ${JSON.stringify(settings)}`);
    assert.equal(frame.outside, 0, `${frame.outside} points left the figure at ${JSON.stringify(settings)}`);
    if (previous) {
      const jump = Math.hypot(frame.foot.x - previous.foot.x, frame.foot.y - previous.foot.y);
      const ratio = frame.span / previous.span;
      assert.ok(jump < 220, `frame jumped ${jump.toFixed(0)}px at ${JSON.stringify(settings)}`);
      assert.ok(ratio < 1.85 && ratio > 1 / 1.85, `scale jumped ${ratio.toFixed(2)} at ${JSON.stringify(settings)}`);
    }
    return frame;
  };
  for (const name of names) {
    let previous = null;
    for (const value of KNOBS[name]) {
      previous = checkStep({ ...BASE, [name]: value }, previous);
    }
  }
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      const aValues = [KNOBS[a][0], KNOBS[a][Math.floor(KNOBS[a].length / 2)], KNOBS[a][KNOBS[a].length - 1]];
      const bValues = [KNOBS[b][0], KNOBS[b][Math.floor(KNOBS[b].length / 2)], KNOBS[b][KNOBS[b].length - 1]];
      for (const av of aValues) {
        let previous = null;
        for (const bv of bValues) {
          previous = checkStep({ ...BASE, [a]: av, [b]: bv }, previous);
        }
      }
    }
  }
  assert.ok(frames > 200, `only swept ${frames} frames`);
});
