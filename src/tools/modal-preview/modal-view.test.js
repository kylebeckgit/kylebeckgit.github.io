import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { aimSlices, clampCamera, createFitMotion, createSliceMotion, defaultCamera, detuneT, followFit, frameMotion, hitPartial, layoutTriangles, paintModalView, PLANE, sampleSlices, sliceFromPartial, spaceByLog, worldOf } from './modal-view.js';
import { shapePartials } from './shape.js';
import { rollSound } from './randomize.js';

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
  assert.ok(rise / bar > 0.08 && rise / bar < 2.4, `rise/bar ${rise / bar}`);
  assert.ok(tail / bar > 1.2 && tail / bar < 6.5, `tail/bar ${tail / bar}`);
  assert.ok(run / bar > 3.2 && run / bar < 6.4, `run/bar ${run / bar}`);
  assert.ok(tailDeg > 1 && tailDeg < 42, `tail ${tailDeg}`);
  assert.ok(freqDeg > 16 && freqDeg < 38, `freq ${freqDeg}`);
  const lastH = Math.abs(last.foot.y - last.crest.y);
  assert.ok(lastH / bar > 0.58 && lastH / bar < 0.8, `last/first ${lastH / bar}`);
  const lipX = first.floor.x - first.foot.x;
  const lipY = first.foot.y - first.floor.y;
  assert.ok(lipY > 0, `rear rail should sit above the front, ${lipY}`);
  const lip = Math.hypot(lipX, first.floor.y - first.foot.y);
  const lastLip = Math.hypot(last.floor.x - last.foot.x, last.floor.y - last.foot.y);
  const step = Math.hypot(tris[1].foot.x - first.foot.x, tris[1].foot.y - first.foot.y);
  assert.ok(lip / step > 0.55 && lip / step < 1.7, `rail gap / bar step ${lip / step}`);
  assert.ok(Math.abs(lip - lastLip) / lip < 0.35, `rails stay parallel ${lip / lastLip}`);
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

function chordDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  if (len < 1e-6) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

test('a click near the midpoint of a sagging tail hits that partial', () => {
  const list = [];
  for (let i = 0; i < 16; i++) {
    const harm = i + 1;
    list.push({ ratio: harm, gainDb: -20 * Math.log10(harm), decay: 8.6 / harm });
  }
  const slices = spaceByLog(list.map((partial) => sliceFromPartial(partial)));
  const camera = defaultCamera();
  const tris = layoutTriangles(slices, camera, 800, 520, 0);
  for (const index of [0, 2]) {
    const curve = tris[index].curve;
    const mid = curve[Math.floor(curve.length / 2)];
    const gap = chordDistance(mid, tris[index].crest, tris[index].back);
    assert.ok(gap > 14, `partial ${index} midpoint is ${gap.toFixed(1)}px off the straight chord`);
    assert.equal(hitPartial(slices, camera, 800, 520, mid.x, mid.y), index);
  }
});

test('a click on the cropped top of a right-hand post hits that post', () => {
  const list = [];
  for (let i = 0; i < 16; i++) {
    const harm = i + 1;
    list.push({ ratio: harm, gainDb: -20 * Math.log10(harm), decay: 8.6 / harm });
  }
  const slices = spaceByLog(list.map((partial) => sliceFromPartial(partial)));
  const camera = defaultCamera();
  const tris = layoutTriangles(slices, camera, 800, 520, 0);
  const bar = Math.abs(tris[0].foot.y - tris[0].crest.y);
  const paintedTop = tris[15].foot.y - bar * 0.94;
  const y = (paintedTop + tris[15].crest.y) / 2;
  assert.ok(y < tris[15].crest.y - 8, 'the cropped post rises above the raw crest');
  assert.equal(hitPartial(slices, camera, 800, 520, tris[15].foot.x, y), 15);
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

function stringProfile(count = 16) {
  const rows = [];
  for (let n = 1; n <= count; n++) {
    rows.push({ ratio: n, gainDb: -20 * Math.log10(n), decay: 1 / n });
  }
  return rows;
}

function assertOwnDecayCurves(partials, label) {
  const slices = spaceByLog(partials.map((partial) => sliceFromPartial(partial)));
  const tris = layoutTriangles(slices, defaultCamera(), 800, 520, 0);
  assert.equal(tris.length, slices.length, label);
  const longest = Math.max(...slices.map((slice) => slice.seconds));
  const rows = slices.map((slice, index) => ({ slice, tri: tris[index], index }));
  const qualifying = rows.filter((row) => row.slice.seconds >= longest * 0.25 - 1e-9);
  assert.ok(qualifying.length >= 2, `${label} has ${qualifying.length} long partials`);
  const starts = [];
  const scales = [];
  for (const row of qualifying) {
    const curve = row.tri.worldCurve;
    assert.ok(curve && curve.length >= 2, `${label} partial ${row.index} has no curve`);
    const top = worldOf(row.slice);
    assert.ok(Math.abs(curve[0].x - top.x) < 1e-6, `${label} partial ${row.index} leaves another bar`);
    assert.ok(Math.abs(curve[0].y - top.y) < 1e-6, `${label} partial ${row.index} misses the bar top`);
    assert.ok(Math.abs(curve[0].z) < 1e-6, `${label} partial ${row.index} starts behind the bar`);
    for (const point of curve) {
      assert.ok(Math.abs(point.x - top.x) < 1e-6, `${label} partial ${row.index} curve drifts off its bar`);
    }
    assert.ok(curve[curve.length - 1].y < curve[0].y * 0.2, `${label} partial ${row.index} does not fall`);
    const zLen = curve[curve.length - 1].z - curve[0].z;
    scales.push(zLen / row.slice.seconds);
    starts.push(curve[0].x);
  }
  const distinct = new Set(starts.map((x) => x.toFixed(4)));
  assert.equal(distinct.size, qualifying.length, `${label} curves share a bar`);
  assert.ok(distinct.size > 1, `${label} curves are only drawn from the front bar`);
  for (const scale of scales) {
    const error = Math.abs(scale - scales[0]) / scales[0];
    assert.ok(error <= 0.1, `${label} decay-axis scale ${scale} vs ${scales[0]}`);
  }
  for (const row of rows) {
    const curve = row.tri.worldCurve;
    assert.ok(curve && curve.length >= 2, `${label} partial ${row.index} has no curve`);
    const zLen = curve[curve.length - 1].z - curve[0].z;
    assert.ok(zLen + 1e-9 >= PLANE.decayReach * 0.1, `${label} partial ${row.index} is a dot`);
    const screen = Math.hypot(row.tri.back.x - row.tri.curve[0].x, row.tri.back.y - row.tri.curve[0].y);
    assert.ok(screen >= 8, `${label} partial ${row.index} screen length ${screen.toFixed(1)}`);
  }
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = ~0;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(~crc >>> 0);
  return Buffer.concat([head, body, tail]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function shotContext(width, height) {
  const data = Buffer.alloc(width * height * 4);
  const state = { strokeStyle: '#000000', fillStyle: '#000000', lineWidth: 1, globalAlpha: 1, filter: 'none', path: [] };
  const stack = [];
  const parse = (hex) => {
    const match = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!match) return [28, 28, 28];
    const value = parseInt(match[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };
  const blend = (x, y, rgb, alpha) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) return;
    const offset = (iy * width + ix) * 4;
    const a = Math.max(0, Math.min(1, alpha));
    data[offset] = data[offset] * (1 - a) + rgb[0] * a;
    data[offset + 1] = data[offset + 1] * (1 - a) + rgb[1] * a;
    data[offset + 2] = data[offset + 2] * (1 - a) + rgb[2] * a;
    data[offset + 3] = 255;
  };
  const strokeLine = (a, b) => {
    if (state.filter && state.filter !== 'none') return;
    const rgb = parse(state.strokeStyle);
    const radius = Math.max(0.6, state.lineWidth / 2);
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const r2 = radius * radius;
      for (let yy = Math.floor(y - radius); yy <= Math.ceil(y + radius); yy++) {
        for (let xx = Math.floor(x - radius); xx <= Math.ceil(x + radius); xx++) {
          if ((xx - x) ** 2 + (yy - y) ** 2 <= r2) blend(xx, yy, rgb, state.globalAlpha);
        }
      }
    }
  };
  return {
    data,
    beginPath() { state.path = []; },
    moveTo(x, y) { state.path.push({ x, y, move: true }); },
    lineTo(x, y) { state.path.push({ x, y }); },
    closePath() {},
    stroke() {
      let prev = null;
      for (const point of state.path) {
        if (point.move || !prev) prev = point;
        else strokeLine(prev, point);
        if (!point.move) prev = point;
      }
    },
    fill() {},
    fillRect(x, y, w, h) {
      if (state.filter && state.filter !== 'none') return;
      const rgb = parse(state.fillStyle);
      const x0 = Math.max(0, Math.floor(x));
      const y0 = Math.max(0, Math.floor(y));
      const x1 = Math.min(width, Math.ceil(x + w));
      const y1 = Math.min(height, Math.ceil(y + h));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) blend(xx, yy, rgb, state.globalAlpha);
      }
    },
    clearRect() {},
    save() { stack.push({ ...state, path: state.path }); },
    restore() { Object.assign(state, stack.pop() || {}); },
    set strokeStyle(value) { state.strokeStyle = value; },
    get strokeStyle() { return state.strokeStyle; },
    set fillStyle(value) { state.fillStyle = value; },
    get fillStyle() { return state.fillStyle; },
    set lineWidth(value) { state.lineWidth = value; },
    get lineWidth() { return state.lineWidth; },
    set globalAlpha(value) { state.globalAlpha = value; },
    get globalAlpha() { return state.globalAlpha; },
    set filter(value) { state.filter = value; },
    get filter() { return state.filter; },
    set lineCap(value) {},
    set lineJoin(value) {},
    set globalCompositeOperation(value) {},
  };
}

test('each long partial has its own decay curve', () => {
  const rolls = [
    ['bell', 2],
    ['bell', 9],
    ['glass', 5],
    ['wood', 36],
    ['metal', 5],
    ['wild', 1],
    ['wild', 7],
  ];
  const profiles = [['string', stringProfile()]];
  for (const [material, seed] of rolls) {
    const rolled = rollSound({ material, wildness: material === 'wild' ? 1 : 0.4, amount: 1, seed });
    profiles.push([`${material}-s${seed}`, rolled.partials]);
  }
  const dir = process.env.MODAL_CURVE_SHOTS || '/tmp/modal-curve-shots';
  mkdirSync(dir, { recursive: true });
  const colors = { accent: '#d4421c', bg: '#f4efe6', fg: '#241f1a', muted: '#6d675f' };
  for (const [label, partials] of profiles) {
    assertOwnDecayCurves(partials, label);
    const width = 800;
    const height = 520;
    const ctx = shotContext(width, height);
    paintModalView(ctx, partials, { width, height, style: 'glow', colors, camera: defaultCamera() });
    writeFileSync(`${dir}/${label}.png`, encodePng(width, height, ctx.data));
  }
});
