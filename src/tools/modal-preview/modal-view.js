// Each partial is its own wireframe slice, oblique like Zebra's Partials view.
//
//   x  frequency, evenly spaced, falling down-right at about 32 degrees
//   y  level, screen-vertical, on a compressed dB scale
//   z  decay time, rising up-right. Long decays leave the comb.
//
// Each slice is three lines. A vertical front in the ink color. An accent
// line beside that bar: every bar inside the comb has a near-vertical accent
// a short depth behind it. Only the two longest decays leave the comb, the
// fundamental sagging to about the fourth crest and then rising straight,
// the octave running parallel just below it. On the floor, a heavy front
// rail and a parallel back rail a short depth behind it run the full width.
// The left-hand rungs continue up-right along depth and cross a few more
// rails parallel to the front, so the hatch sits under the bars. Stroke
// width tracks the view. A wide blurred pass sits under the sharp strokes.
// Yaw turns frequency and decay around the vertical, so the fronts stay
// vertical. Pitch only changes how steeply decay rises.
//
// Motion lives in aimSlices / sampleSlices. Match by index. A profile change
// eases for MORPH_MS with ease-out. New indices grow from zero height. Indices
// that leave shrink and fade. Detune is not part of that tween: paint applies
// it live, spreading or bunching frequency while height and depth stay put.

export const MORPH_MS = 260;

export const PLANE = {
  // Resting view. The floor run is about five bar-heights long.
  yaw: 0,
  pitch: 0.55,
  focal: 9.5,
  pitchMin: 0.35,
  pitchMax: 0.85,
  span: 2.72,
  height: 1.29,
  depth: 3.15,
  // Below this fraction of the longest decay the accent stays a vertical
  // line beside the bar. The two longest (string: fundamental and octave)
  // are the only tails.
  airRel: 0.46,
  // Accent sits just beside the ink bar. Close enough to glow into it,
  // far enough that the bar stays the ink colour.
  accentZ: 0.05,
  // Back rail, close enough that the glow fuses it with the front into
  // one heavy ribbon.
  ribbonZ: 0.04,
  // Floor hatch under bars 1 to about 6. Deep enough to cross, short
  // enough to stay in the lower left.
  latticeZ: [0.18, 0.32, 0.48],
  ratioLo: 0.35,
  ratioHi: 48,
  styles: {
    eco: { width: 1.05, alpha: 0.95, halo: 3.2, haloAlpha: 0.26 },
    fast: { width: 1.3, alpha: 1, halo: 5, haloAlpha: 0.32 },
    glow: { width: 1.45, alpha: 1, halo: 7.5, haloAlpha: 0.42 },
  },
};

export function defaultCamera() {
  return { yaw: PLANE.yaw, pitch: PLANE.pitch, distance: PLANE.focal };
}

export function clampCamera(camera) {
  const base = camera || defaultCamera();
  let yaw = Number(base.yaw);
  if (!Number.isFinite(yaw)) yaw = PLANE.yaw;
  yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  let pitch = Number(base.pitch);
  if (!Number.isFinite(pitch)) pitch = PLANE.pitch;
  return {
    yaw,
    pitch: clamp(pitch, PLANE.pitchMin, PLANE.pitchMax),
    distance: PLANE.focal,
  };
}

// Camera stays put. Slice motion is aimSlices, not this function.
export function frameMotion({ partials, camera, time = 0 }) {
  return { partials, camera, time };
}

export function sliceFromPartial(partial, alpha = 1) {
  const gainDb = Number(partial?.gainDb);
  return {
    t: frequencyT(partial?.ratio),
    ratio: Math.max(0, Number(partial?.ratio) || 0),
    gainDb: Number.isFinite(gainDb) ? gainDb : 0,
    height: levelHeight(partial?.gainDb),
    depth: decayDepth(partial?.decay),
    seconds: clamp(Number(partial?.decay) || 0.05, 0.05, 40),
    alpha,
  };
}

// A plucked string's Position puts nodes on some partials. Apply that in
// amplitude, then draw the result on the same compressed scale.
export function combHeights(slices, position) {
  const pos = Number(position);
  if (!Number.isFinite(pos) || pos <= 0.02) return slices;
  const placed = Math.min(0.98, Math.max(0.02, pos));
  const amps = slices.map((slice, index) => {
    const db = Number.isFinite(slice?.gainDb) ? slice.gainDb : -60;
    const weight = Math.abs(Math.sin(Math.PI * (index + 1) * placed));
    return Math.pow(10, db / 20) * (0.08 + 0.92 * weight);
  });
  const peak = Math.max(1e-6, ...amps);
  return slices.map((slice, index) => ({
    ...slice,
    height: levelHeight(20 * Math.log10(Math.max(amps[index] / peak, 1e-6))),
  }));
}

export function frequencyT(ratio) {
  const value = Math.max(Number(ratio) || PLANE.ratioLo, 1e-6);
  const logLo = Math.log2(PLANE.ratioLo);
  const logHi = Math.log2(PLANE.ratioHi);
  return clamp((Math.log2(value) - logLo) / (logHi - logLo), 0, 1);
}

export function levelHeight(gainDb) {
  const number = Number(gainDb);
  const db = clamp(Number.isFinite(number) ? number : -60, -90, 0);
  // A wide window, so a large drop in level only shortens the bar a little.
  const floor = -78;
  return clamp((db - floor) / -floor, 0, 1);
}

export function decayDepth(decay) {
  const seconds = clamp(Number(decay) || 0, 0, 24);
  // Steep on purpose: the fundamental's tail is long, the next is shorter,
  // and the rest stay down among the bars.
  return clamp(Math.pow(seconds / 8.5, 0.72), 0, 1);
}

function evenT(index, count) {
  if (count <= 1) return 0.5;
  return index / (count - 1);
}

// A log of harmonic number spreads the first octave and packs the highs.
// The string picture does the other thing: bars 1–5 sit closer than the
// rest, so the floor position is ratio^1.35, normalized across the set.
// Detune still spreads whatever spacing this produces.
export function spaceByLog(slices) {
  const usable = slices.filter((slice) => slice && Number(slice.ratio) > 0);
  if (usable.length < 2) {
    slices.forEach((slice, index) => { if (slice) slice.t = evenT(index, slices.length); });
    return slices;
  }
  const power = 1.35;
  const bent = usable.map((slice) => slice.ratio ** power);
  const lo = Math.min(...bent);
  const hi = Math.max(...bent);
  const span = hi - lo;
  if (span < 1e-6) {
    usable.forEach((slice, index) => { slice.t = evenT(index, usable.length); });
    return slices;
  }
  usable.forEach((slice, index) => { slice.t = (bent[index] - lo) / span; });
  return slices;
}

// Positive detune spreads frequency away from the low end. Negative bunches
// it. Height and depth are left alone.
export function detuneT(t, detune) {
  const spread = 1 + clamp(Number(detune) || 0, -1, 1) * 0.72;
  const pivot = 0.28;
  return pivot + (t - pivot) * spread;
}

export function createSliceMotion() {
  return { from: [], to: [], t0: 0, dur: 0 };
}

export function aimSlices(motion, partials, now, duration = MORPH_MS) {
  const shown = sampleSlices(motion, now);
  const next = partials.map((partial) => sliceFromPartial(partial, 1));
  spaceByLog(next);
  const count = Math.max(shown.length, next.length);
  const from = [];
  const to = [];
  for (let i = 0; i < count; i++) {
    const target = next[i] || { ...(shown[i] || sliceFromPartial(null, 0)), height: 0, depth: 0, alpha: 0 };
    if (shown[i]) from.push(shown[i]);
    else from.push({ t: target.t, height: 0, depth: 0, alpha: 0, ratio: target.ratio, gainDb: target.gainDb });
    to.push(target);
  }
  motion.from = from;
  motion.to = to;
  motion.t0 = now;
  motion.dur = duration > 0 ? duration : 0;
  return motion;
}

export function sampleSlices(motion, now) {
  const count = Math.max(motion?.from?.length || 0, motion?.to?.length || 0);
  if (!count) return [];
  const dur = motion.dur || 0;
  const t = dur <= 0 ? 1 : clamp((now - motion.t0) / dur, 0, 1);
  const eased = 1 - (1 - t) ** 3;
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(lerpSlice(motion.from[i], motion.to[i], eased));
  }
  if (t >= 1) {
    while (out.length && out[out.length - 1].alpha <= 0.02) out.pop();
  }
  return out;
}

export function slicesMoving(motion, now) {
  if (!motion?.dur) return false;
  return now < motion.t0 + motion.dur;
}

const FIT_MARGIN = 22;

export function measureFit(slices, camera, width, height, detune = 0) {
  const view = clampCamera(camera);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const list = slices?.length ? slices : [sliceFromPartial({ ratio: 1, gainDb: 0, decay: 1 })];
    const clock = longestSeconds(list);
    const air = airFrame(list, clock, detune);
    for (const slice of list) {
      if (!slice || (slice.alpha < 0.04 && slice.height < 0.02 && slice.depth < 0.02)) continue;
      const world = worldOf(slice, detune);
      const shape = drawShape(Math.max(0.05, Number(slice.seconds) || 0.2), clock);
      const samples = [
        { x: world.x, y: 0, z: 0 },
        { x: world.x, y: world.y, z: 0 },
        floorBack(world, landingDepth(shape)),
        ...tailWorld(slice, world, clock, air),
      ];
    for (const sample of samples) {
      const point = screenOf(view, sample.x, sample.y, sample.z);
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
  }
  if (!Number.isFinite(minX)) {
    minX = -1;
    maxX = 1;
    minY = -1;
    maxY = 1;
  }
  const spanX = Math.max(0.001, maxX - minX);
  const spanY = Math.max(0.001, maxY - minY);
  const fitScale = Math.min(
    (width - FIT_MARGIN * 2) / spanX,
    (height - FIT_MARGIN * 2) / spanY,
  );
  // Don't blow a compact wedge up to the edges. Still shrink if a turn
  // or a detune spread would otherwise leave the canvas.
  const capScale = Math.min((width * 0.9) / spanX, (height * 0.84) / spanY);
  const scale = Math.min(fitScale, capScale);
  return { scale, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function createFitMotion() {
  return { shown: null, now: 0, moving: false };
}

// Zooming in eases. Zooming out tracks the slices immediately so the tails
// never leave the canvas. The center stays on the current bounds.
export function followFit(motion, ideal, now) {
  if (!motion.shown) {
    motion.shown = { scale: ideal.scale, cx: ideal.cx, cy: ideal.cy };
    motion.now = now;
    motion.moving = false;
    return motion.shown;
  }
  const dt = Math.min(0.05, Math.max(0, (now - motion.now) / 1000));
  motion.now = now;
  const k = dt > 0 ? 1 - Math.exp(-dt / 0.11) : 0;
  let scale = motion.shown.scale + (ideal.scale - motion.shown.scale) * k;
  scale = Math.min(scale, ideal.scale);
  motion.shown = { scale, cx: ideal.cx, cy: ideal.cy };
  motion.moving = ideal.scale - scale > ideal.scale * 0.012;
  return motion.shown;
}

export function paintModalView(ctx, partials, options = {}) {
  const { width, height, style = 'fast', colors, selected = -1, detune = 0 } = options;
  const camera = clampCamera(options.camera);
  const rawSlices = options.slices || spaceSlices(partials);
  const slices = combHeights(rawSlices, options.position);
  const look = PLANE.styles[style] || PLANE.styles.fast;
  const palette = sitePalette(colors, options.invertPanel !== false);
  const ideal = measureFit(slices, camera, width, height, detune);
  const fit = options.fitMotion ? followFit(options.fitMotion, ideal, options.now ?? 0) : ideal;
  const place = placement(fit, width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.panel;
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const clock = longestSeconds(slices);
  const weight = lineWeight(fit.scale) * (style === 'eco' ? 0.85 : style === 'glow' ? 1.12 : 1);
  // Two stacked blooms. The wide one fills the gaps between close lines.
  // The tighter one brightens the mesh those overlaps make.
  // Cream bloom stays soft so neighbours keep a dark gap. Accent bloom
  // is softer still, a tint rather than a second set of bars.
  const wide = Math.max(3.5, weight * (style === 'eco' ? 1.1 : 1.55));
  const tight = Math.max(2, weight * (style === 'eco' ? 0.7 : 0.95));
  ctx.save();
  ctx.filter = `blur(${wide}px)`;
  ctx.globalCompositeOperation = palette.bloom;
  drawSlices(ctx, slices, detune, place, camera, look, palette, clock, style, selected, true, weight, 1.25, 0.26, 0.12, 0.16);
  ctx.restore();
  ctx.save();
  ctx.filter = `blur(${tight}px)`;
  ctx.globalCompositeOperation = palette.bloom;
  drawSlices(ctx, slices, detune, place, camera, look, palette, clock, style, selected, true, weight, 1.08, 0.2, 0.08, 0.12);
  ctx.restore();
  drawSlices(ctx, slices, detune, place, camera, look, palette, clock, style, selected, false, weight, 1, 1, 0.48, 0.55);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const air = airFrame(slices, clock, detune);
  return slices.map((slice) => projectSlice(slice, detune, place, camera, clock, air).crest);
}

export function hitPartial(partials, camera, width, height, x, y, detune = 0, fit = null) {
  const slices = partials?.[0] && 't' in partials[0]
    ? partials
    : (partials || []).map((partial) => sliceFromPartial(partial, 1));
  const view = clampCamera(camera);
  const used = fit || measureFit(slices, view, width, height, detune);
  const place = placement(used, width, height);
  const clock = longestSeconds(slices);
  const air = airFrame(slices, clock, detune);
  let best = -1;
  let score = 14;
  for (let i = 0; i < slices.length; i++) {
    if (slices[i].alpha < 0.2) continue;
    const tri = projectSlice(slices[i], detune, place, view, clock, air);
    const distance = Math.min(
      distanceToSegment(x, y, tri.foot.x, tri.foot.y, tri.crest.x, tri.crest.y),
      distanceToSegment(x, y, tri.crest.x, tri.crest.y, tri.back.x, tri.back.y),
      distanceToSegment(x, y, tri.foot.x, tri.foot.y, tri.back.x, tri.back.y),
    );
    if (distance < score) {
      score = distance;
      best = i;
    }
  }
  return best;
}

export function worldOf(slice, detune = 0) {
  const t = detuneT(slice.t, detune);
  return {
    x: (t - 0.5) * PLANE.span,
    y: clamp(slice.height, 0, 1.2) * PLANE.height,
    z: clamp(slice.depth, 0, 1) * PLANE.depth,
  };
}

function spaceSlices(partials) {
  const slices = (partials || []).map((partial) => sliceFromPartial(partial, 1));
  return spaceByLog(slices);
}

function showDecay(slices) {
  const max = Math.max(0, ...slices.map((slice) => slice?.depth || 0));
  if (max < 1e-4) return slices;
  return slices.map((slice) => ({ ...slice, depth: (slice?.depth || 0) / max }));
}

function floorBack(world, z = PLANE.ribbonZ) {
  return { x: world.x, y: 0, z };
}

// Stroke width is about 1/150 of the floor's screen length, so a small
// canvas and the full panel stay the same picture.
function lineWeight(scale) {
  const graphic = Math.max(80, scale * PLANE.span);
  return graphic / 52;
}

// Short rungs stop at the back rail. The left-hand ones run out to the
// furthest floor line so they cross the hatch.
function landingDepth(shape) {
  if (shape.longRung) return PLANE.latticeZ[PLANE.latticeZ.length - 1];
  return PLANE.ribbonZ;
}

function longestSeconds(slices) {
  let max = 0.05;
  for (const slice of slices || []) {
    if (!slice || slice.alpha < 0.08) continue;
    const seconds = Number(slice.seconds);
    if (seconds > max) max = seconds;
  }
  return max;
}

// Anything under the two longest decays is a vertical accent beside its bar.
// longRung marks the left-hand floor rungs that cross the hatch.
function drawShape(seconds, maxSeconds) {
  const rel = Math.max(0.02, Math.max(0.02, seconds) / Math.max(0.05, maxSeconds));
  if (rel >= PLANE.airRel) {
    return { air: true, tight: false, longRung: true, rel };
  }
  return { air: false, tight: true, longRung: rel >= 0.14, rel };
}

// The longest decay anchors the tails. Later air partials share its x so
// they stay parallel instead of splaying off their own bars.
function airFrame(slices, clock, detune) {
  const air = [];
  for (const slice of slices || []) {
    if (!slice || slice.alpha < 0.08) continue;
    const seconds = Math.max(0.05, Number(slice.seconds) || 0.2);
    if (!drawShape(seconds, clock).air) continue;
    air.push(slice);
  }
  air.sort((a, b) => b.seconds - a.seconds);
  if (!air.length) return { anchorX: 0, anchorY: PLANE.height, rankOf: () => 0 };
  const head = worldOf(air[0], detune);
  const rank = new Map(air.map((slice, index) => [slice, index]));
  const ordered = (slices || [])
    .filter((slice) => slice && slice.alpha >= 0.08 && slice.height >= 0.02)
    .map((slice) => worldOf(slice, detune))
    .sort((a, b) => a.x - b.x);
  return {
    anchorX: head.x,
    anchorY: head.y,
    rankOf: (slice) => rank.get(slice) ?? 0,
    crests: ordered.slice(0, 5),
    railRight: ordered.length ? ordered[ordered.length - 1].x : head.x + PLANE.span,
  };
}

function fromRestScreen(x, sx, sy) {
  const z = (sx - x) / 0.78;
  const y = (-sy) - (x * -0.625) - (z * 0.6375);
  return { x, y, z };
}

function restScreen(x, y, z) {
  return {
    sx: x + (z * 0.78),
    sy: -(y + (x * -0.625) + (z * 0.6375)),
  };
}

// Where this partial must pass so its screen position sits on another crest.
function onCrest(x, crest) {
  const target = restScreen(crest.x, crest.y, 0);
  const z = Math.max(0, (target.sx - x) / 0.78);
  const y = (-target.sy) - (x * -0.625) - (z * 0.6375);
  return { x, y, z };
}

// Starts on bar 1's crest, runs down-right across the next crests, then
// rises straight to a tip past the right end of the front rail.
function tailSpline(x, y0, crests, railRight, steps) {
  const guides = (crests && crests.length) ? crests : [{ x, y: y0 }];
  const keys = guides.map((crest, index) => (index === 0 ? { x, y: y0, z: 0 } : onCrest(x, crest)));
  const crest = restScreen(x, y0, 0);
  const tip = fromRestScreen(x, Math.max(railRight + 0.55, crest.sx + 2.6), crest.sy - (y0 * 0.72));
  const points = [];
  const sagN = Math.max(8, Math.round(steps * 0.42));
  for (let i = 0; i <= sagN; i++) {
    const t = (i / sagN) * (keys.length - 1);
    const index = Math.min(keys.length - 2, Math.floor(t));
    const u = t - index;
    const a = keys[index];
    const b = keys[Math.min(keys.length - 1, index + 1)];
    const bow = Math.sin(u * Math.PI) * y0 * 0.01;
    const sx = restScreen(a.x, a.y, a.z).sx + ((restScreen(b.x, b.y, b.z).sx - restScreen(a.x, a.y, a.z).sx) * u);
    // Bow downward, so the sag is concave and never kicks up off bar 1.
    const sy = restScreen(a.x, a.y, a.z).sy + ((restScreen(b.x, b.y, b.z).sy - restScreen(a.x, a.y, a.z).sy) * u) + bow;
    points.push(fromRestScreen(x, sx, sy));
  }
  const prev = points[points.length - 2];
  const botP = points[points.length - 1];
  const bot = restScreen(botP.x, botP.y, botP.z);
  const prevS = restScreen(prev.x, prev.y, prev.z);
  const tipS = restScreen(tip.x, tip.y, tip.z);
  const arrive = { x: bot.sx - prevS.sx, y: bot.sy - prevS.sy };
  const depart = { x: tipS.sx - bot.sx, y: tipS.sy - bot.sy };
  const aLen = Math.hypot(arrive.x, arrive.y) || 1;
  const dLen = Math.hypot(depart.x, depart.y) || 1;
  let sx = bot.sx;
  let sy = bot.sy;
  const fillet = 16;
  const step = y0 * 0.085;
  for (let i = 1; i <= fillet; i++) {
    const t = i / (fillet + 1);
    const dx = ((arrive.x / aLen) * (1 - t)) + ((depart.x / dLen) * t);
    const dy = ((arrive.y / aLen) * (1 - t)) + ((depart.y / dLen) * t);
    const len = Math.hypot(dx, dy) || 1;
    sx += (dx / len) * step;
    sy += (dy / len) * step;
    points.push(fromRestScreen(x, sx, sy));
  }
  const riseN = Math.max(6, steps - points.length + 1);
  for (let i = 1; i <= riseN; i++) {
    const u = i / riseN;
    points.push(fromRestScreen(x, sx + ((tipS.sx - sx) * u), sy + ((tipS.sy - sy) * u)));
  }
  return points;
}

function screenArcEnd(points, fraction) {
  const seen = points.map((point) => restScreen(point.x, point.y, point.z));
  let total = 0;
  const at = [0];
  for (let i = 1; i < seen.length; i++) {
    total += Math.hypot(seen[i].sx - seen[i - 1].sx, seen[i].sy - seen[i - 1].sy);
    at.push(total);
  }
  const stop = total * fraction;
  let end = 1;
  while (end < at.length - 1 && at[end] < stop) end += 1;
  return end;
}

function tailWorld(slice, world, maxSeconds, air) {
  const seconds = Math.max(0.05, Number(slice?.seconds) || 0.2);
  const shape = drawShape(seconds, maxSeconds || seconds);
  if (!shape.air) {
    const z = PLANE.accentZ;
    const top = world.y;
    return [
      { x: world.x, y: top, z: 0 },
      { x: world.x, y: top * 0.97, z },
      { x: world.x, y: top * 0.02, z },
    ];
  }
  const rank = air?.rankOf(slice) ?? 0;
  const x = air?.anchorX ?? world.x;
  const y0 = air?.anchorY ?? world.y;
  const full = tailSpline(x, y0, air?.crests, air?.railRight ?? x + PLANE.span, 36);
  if (rank === 0) return full;
  // Same curve, tucked just under the fundamental, ending at about 40% of
  // its length. Later tails stop sooner.
  const reach = Math.max(0.22, 0.40 - (rank - 1) * 0.08);
  const end = screenArcEnd(full, reach);
  const tuck = 0.08 + (rank - 1) * 0.035;
  return full.slice(0, end + 1).map((point) => ({ x: point.x, y: point.y - tuck, z: point.z }));
}

function strokePath(ctx, points, color, width, alpha) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.stroke();
}

function glow(ctx, points, color, look, alpha) {
  if (look.halo > 0) strokePath(ctx, points, color, look.halo, look.haloAlpha * alpha);
  strokePath(ctx, points, color, look.width, look.alpha * alpha);
}

function hatchLimit(placed, detune) {
  const xs = placed.map((item) => worldOf(item.slice, detune).x).sort((a, b) => a - b);
  if (xs.length < 2) return Infinity;
  return xs[0] + 0.27 * (xs[xs.length - 1] - xs[0]);
}

function drawSlices(ctx, slices, detune, place, camera, look, palette, clock, style, selected, bloom, weight, bulk = 1, alpha = 1, accentAlpha = alpha, hatchAlpha = alpha) {
  const ink = { width: weight * bulk, alpha, halo: 0, haloAlpha: 0 };
  const accent = { width: weight * 0.5 * bulk, alpha: accentAlpha, halo: 0, haloAlpha: 0 };
  const tail = { width: weight * bulk, alpha: 1, halo: 0, haloAlpha: 0 };
  const octave = { width: weight * 0.78 * bulk, alpha: 1, halo: 0, haloAlpha: 0 };
  const rail = { width: weight * bulk, alpha, halo: 0, haloAlpha: 0 };
  const rung = { width: weight * 0.72 * bulk, alpha: hatchAlpha, halo: 0, haloAlpha: 0 };
  const air = airFrame(slices, clock, detune);
  const visible = [];
  for (let index = 0; index < slices.length; index++) {
    const slice = slices[index];
    if (!slice || slice.alpha < 0.04 || slice.height < 0.02) continue;
    visible.push(slice);
  }
  const placed = visible.map((slice) => ({
    slice,
    tri: projectSlice(slice, detune, place, camera, clock, air),
    shape: drawShape(Math.max(0.05, Number(slice.seconds) || 0.2), clock),
  }));
  placed.sort((a, b) => worldOf(a.slice, detune).x - worldOf(b.slice, detune).x);
  const limit = hatchLimit(placed, detune);
  if (style !== 'eco') {
    const atDepth = (group, z) => group.map((item) => {
      const world = worldOf(item.slice, detune);
      return place(camera, world.x, 0, z);
    });
    glow(ctx, atDepth(placed, 0), palette.ink, rail, 1);
    glow(ctx, atDepth(placed, PLANE.ribbonZ), palette.ink, rail, 1);
    const hatched = placed.filter((item) => worldOf(item.slice, detune).x <= limit);
    for (const z of PLANE.latticeZ) {
      glow(ctx, atDepth(hatched, z), palette.ink, rung, 1);
    }
    for (const item of placed) {
      const world = worldOf(item.slice, detune);
      // One rung per bar, back along depth. The left ones run far enough
      // to cross the neighbouring curve-feet, which is the lattice.
      const rungZ = world.x <= limit ? 0.7 : PLANE.ribbonZ;
      const far = place(camera, world.x, 0, rungZ);
      glow(ctx, [item.tri.foot, far], palette.ink, world.x <= limit ? rung : ink, item.slice.alpha);
      glow(ctx, [item.tri.foot, item.tri.crest], palette.ink, ink, item.slice.alpha);
    }
  }
  for (const item of placed) {
    const world = worldOf(item.slice, detune);
    if (item.shape.air) {
      const rank = air.rankOf(item.slice);
      const look = rank === 0 ? tail : octave;
      const strength = bloom ? (rank === 0 ? 0.95 : 0.7) : (rank === 0 ? 1 : 0.82);
      glow(ctx, item.tri.curve, palette.wire, look, strength);
      continue;
    }
    const left = world.x <= limit;
    const strength = left ? (bloom ? 0.55 : 0.9) : (bloom ? accentAlpha * 1.6 : 0.66);
    glow(ctx, item.tri.curve, palette.wire, accent, Math.min(1, strength));
  }
  if (bloom || selected < 0 || !slices[selected]) return;
  const slice = slices[selected];
  const tri = projectSlice(slice, detune, place, camera, clock, air);
  if (style !== 'eco') {
    glow(ctx, [tri.foot, tri.crest], palette.ink, { ...ink, width: ink.width + weight * 0.35 }, 1);
    glow(ctx, [tri.foot, tri.floor], palette.ink, ink, 1);
  }
  glow(ctx, tri.curve, palette.wire, { ...accent, width: accent.width + weight * 0.3 }, 1);
}

export function layoutTriangles(slices, camera, width, height, detune = 0) {
  const view = clampCamera(camera);
  const spaced = spaceByLog(slices.map((slice) => ({ ...slice })));
  const fit = measureFit(spaced, view, width, height, detune);
  const place = placement(fit, width, height);
  const clock = longestSeconds(spaced);
  const air = airFrame(spaced, clock, detune);
  return spaced.map((slice) => projectSlice(slice, detune, place, view, clock, air));
}

function projectSlice(slice, detune, place, camera, maxSeconds, air) {
  const world = worldOf(slice, detune);
  const seconds = Math.max(0.05, Number(slice?.seconds) || 0.2);
  const shape = drawShape(seconds, maxSeconds || seconds);
  const rear = floorBack(world, landingDepth(shape));
  const curve = tailWorld(slice, world, maxSeconds, air).map((point) => place(camera, point.x, point.y, point.z));
  return {
    foot: place(camera, world.x, 0, 0),
    crest: place(camera, world.x, world.y, 0),
    back: curve[curve.length - 1],
    floor: place(camera, rear.x, rear.y, rear.z),
    curve,
  };
}

function placement(fit, width, height) {
  return (camera, x, y, z) => {
    const point = screenOf(camera, x, y, z);
    return {
      x: width / 2 + (point.x - fit.cx) * fit.scale,
      y: height / 2 + (point.y - fit.cy) * fit.scale,
    };
  };
}

function screenOf(camera, x, y, z) {
  const point = rawProject(x, y, z, camera);
  return { x: point.x, y: -point.y };
}

function rawProject(x, y, z, camera) {
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  // Frequency and decay turn around the vertical. Level does not, so a
  // front edge stays vertical at every yaw.
  const xr = x * cy + z * sy;
  const zr = -x * sy + z * cy;
  const rise = 0.85 + (camera.pitch - PLANE.pitch) * 1.15;
  return {
    x: xr * 1 + zr * 0.78,
    y: y + xr * -0.625 + zr * 0.75 * rise,
    depth: zr,
  };
}

function mixHex(a, b, t) {
  const parse = (hex) => {
    const match = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
    return match ? parseInt(match[1], 16) : null;
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa == null || pb == null) return a;
  const channel = (shift) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${[channel(16), channel(8), channel(0)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function sitePalette(colors, invert = true) {
  const bg = colors?.bg || '#f2ede3';
  const fg = colors?.ink || colors?.fg || '#1f1d1a';
  // --muted is the site's lighter dark. Zebra's panel is a mid grey, not black.
  const muted = colors?.muted || '#6a655c';
  const panel = invert ? mixHex(fg, muted, 0.42) : bg;
  return {
    panel,
    ink: invert ? bg : fg,
    wire: colors?.accent || '#d4421c',
    bloom: invert ? 'lighter' : 'source-over',
  };
}

function luminance(color) {
  const hex = String(color || '').trim();
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return 180;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return (r + g + b) / 3;
}

function lerpSlice(from, to, eased) {
  const a = from || { t: to?.t || 0, height: 0, depth: 0, alpha: 0 };
  const b = to || { t: a.t, height: 0, depth: 0, alpha: 0 };
  return {
    t: a.t + (b.t - a.t) * eased,
    gainDb: (a.gainDb || 0) + ((b.gainDb || 0) - (a.gainDb || 0)) * eased,
    height: a.height + (b.height - a.height) * eased,
    depth: a.depth + (b.depth - a.depth) * eased,
    seconds: (a.seconds || b.seconds || 0.2) + ((b.seconds || a.seconds || 0.2) - (a.seconds || b.seconds || 0.2)) * eased,
    alpha: a.alpha + (b.alpha - a.alpha) * eased,
  };
}

function line(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function distanceToSegment(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = dx * dx + dy * dy;
  if (len < 1e-6) return Math.hypot(px - x0, py - y0);
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
