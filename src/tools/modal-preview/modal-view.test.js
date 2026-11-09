import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { aimSlices, clampCamera, createFitMotion, createSliceMotion, defaultCamera, detuneT, followFit, frameMotion, layoutTriangles, paintModalView, PLANE, sampleSlices, sliceFromPartial, worldOf } from './modal-view.js';
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

test('yaw can turn a full circle and pitch stays off the poles', () => {
  const turned = clampCamera({ yaw: 4, pitch: 0.5 });
  assert.ok(Math.abs(turned.yaw - 4) > 0.2);
  assert.ok(Math.abs(turned.yaw) <= Math.PI);
  assert.equal(clampCamera({ yaw: 0, pitch: 0 }).pitch, PLANE.pitchMin);
  assert.equal(clampCamera({ yaw: 0, pitch: 2 }).pitch, PLANE.pitchMax);
  assert.ok(PLANE.pitchMax < Math.PI / 2);
  assert.ok(PLANE.pitchMin > 0);
});

test('each partial is its own triangle and eco draws only the tops', () => {
  const list = partials(8);
  const quiet = worldOf(sliceFromPartial(list[7]));
  const loud = worldOf(sliceFromPartial(list[0]));
  assert.ok(loud.y > quiet.y);
  assert.ok(loud.x < quiet.x);
  const long = worldOf(sliceFromPartial({ ratio: 2, gainDb: -6, decay: 8 }));
  const short = worldOf(sliceFromPartial({ ratio: 2, gainDb: -6, decay: 0.3 }));
  assert.ok(long.z > short.z * 2);
  assert.equal(long.y, short.y);
  const spread = detuneT(0.9, 1) - detuneT(0.2, 1);
  const rest = detuneT(0.9, 0) - detuneT(0.2, 0);
  assert.ok(spread > rest);
  assert.equal(worldOf(sliceFromPartial(list[3]), 1).y, worldOf(sliceFromPartial(list[3]), 0).y);

  const eco = stubContext();
  const fast = stubContext();
  paintModalView(eco, list, { width: 960, height: 460, style: 'eco', colors, camera: defaultCamera() });
  paintModalView(fast, list, { width: 960, height: 460, style: 'fast', colors, camera: defaultCamera() });
  assert.ok(fast.strokes > eco.strokes);
});

test('the resting wedge is a dense comb with short up-right tails', () => {
  const list = [];
  const fund = 8.6;
  for (let i = 0; i < 16; i++) {
    const harm = i + 1;
    list.push({ ratio: harm, gainDb: -20 * Math.log10(harm), decay: fund / harm });
  }
  const tris = layoutTriangles(list.map((partial) => sliceFromPartial(partial)), defaultCamera(), 800, 520, 0);
  const first = tris[0];
  const last = tris[15];
  const bar = Math.abs(first.foot.y - first.crest.y);
  const tail = Math.hypot(first.back.x - first.crest.x, first.back.y - first.crest.y);
  const run = Math.hypot(last.foot.x - first.foot.x, last.foot.y - first.foot.y);
  const tailDeg = Math.atan2(first.crest.y - first.back.y, first.back.x - first.crest.x) * 180 / Math.PI;
  const freqDeg = Math.atan2(last.foot.y - first.foot.y, last.foot.x - first.foot.x) * 180 / Math.PI;
  assert.ok(Math.abs(first.foot.x - first.crest.x) < 0.75);
  assert.ok(first.crest.y < first.foot.y);
  const rise = first.crest.y - first.back.y;
  assert.ok(rise / bar > 0.32 && rise / bar < 1.6, `rise/bar ${rise / bar}`);
  assert.ok(tail / bar > 1.5 && tail / bar < 4.6, `tail/bar ${tail / bar}`);
  assert.ok(run / bar > 2.2 && run / bar < 2.9, `run/bar ${run / bar}`);
  assert.ok(tailDeg > 6 && tailDeg < 42, `tail ${tailDeg}`);
  assert.ok(freqDeg > 28 && freqDeg < 38, `freq ${freqDeg}`);
  const lastH = Math.abs(last.foot.y - last.crest.y);
  assert.ok(lastH / bar > 0.58 && lastH / bar < 0.8, `last/first ${lastH / bar}`);
  const lipX = first.floor.x - first.foot.x;
  const lipY = first.foot.y - first.floor.y;
  assert.ok(lipY > 0, `rear rail should sit above the front, ${lipY}`);
  const lip = Math.hypot(lipX, first.floor.y - first.foot.y);
  const lastLip = Math.hypot(last.floor.x - last.foot.x, last.floor.y - last.foot.y);
  assert.ok(lip / lastLip > 3, `the first rung should cross much further than the last, ${lip / lastLip}`);
});

test('the triangles stay inside the canvas at the resting angle and a full turn', () => {
  const ctx = stubContext();
  const list = partials(64).map((partial, index) => index < 4 ? { ...partial, decay: 18 } : partial);
  const points = [];
  ctx.lineTo = (x, y) => { points.push({ x, y }); };
  ctx.moveTo = (x, y) => { points.push({ x, y }); };
  for (const camera of [defaultCamera(), clampCamera({ yaw: Math.PI, pitch: 0.4 }), clampCamera({ yaw: 1.8, pitch: 0.9 })]) {
    for (const detune of [0, 1]) {
      points.length = 0;
      paintModalView(ctx, list, { width: 960, height: 460, style: 'fast', colors, camera, detune });
      assert.ok(points.length > 30);
      for (const point of points) {
        assert.ok(point.x >= 8 && point.x <= 952, `x ${point.x}`);
        assert.ok(point.y >= 8 && point.y <= 452, `y ${point.y}`);
      }
    }
  }
});

test('zooming in eases and zooming out stays tight enough to fit', () => {
  const motion = createFitMotion();
  const wide = followFit(motion, { scale: 1, cx: 0, cy: 0 }, 0);
  assert.equal(wide.scale, 1);
  const tighter = followFit(motion, { scale: 0.4, cx: 12, cy: -4 }, 0);
  assert.ok(tighter.scale <= 0.4);
  assert.equal(tighter.cx, 12);
  followFit(motion, { scale: 0.4, cx: 12, cy: -4 }, 1000);
  const opening = followFit(motion, { scale: 1.2, cx: 12, cy: -4 }, 1120);
  assert.ok(opening.scale > 0.4 && opening.scale < 1.2);
  assert.equal(motion.moving, true);
});

test('a density change eases by index, growing the new slices from zero', () => {
  const motion = createSliceMotion();
  const before = partials(4);
  aimSlices(motion, before, 0, 0);
  const atRest = sampleSlices(motion, 0);
  assert.equal(atRest.length, 4);
  aimSlices(motion, partials(7), 1000, 260);
  const born = sampleSlices(motion, 1000);
  assert.equal(born.length, 7);
  assert.equal(born[6].height, 0);
  assert.equal(born[6].alpha, 0);
  assert.ok(Math.abs(born[0].t - atRest[0].t) < 1e-6);
  const mid = sampleSlices(motion, 1000 + 130);
  assert.ok(mid[6].height > 0 && mid[6].height < sliceFromPartial(partials(7)[6]).height);
  assert.ok(mid[0].height > Math.min(atRest[0].height, sliceFromPartial(partials(7)[0]).height) - 1e-6);
  const done = sampleSlices(motion, 1000 + 260);
  assert.ok(Math.abs(done[6].height - sliceFromPartial(partials(7)[6]).height) < 1e-6);
  assert.equal(done[6].alpha, 1);
  aimSlices(motion, partials(2), 2000, 260);
  const leaving = sampleSlices(motion, 2000);
  assert.ok(leaving.length >= 7);
  assert.equal(leaving[6].alpha, 1);
  const gone = sampleSlices(motion, 2000 + 260);
  assert.equal(gone.length, 2);
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
  assert.ok(Math.abs(sparse[7].ratio - list[7].ratio) < 1e-6);

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
