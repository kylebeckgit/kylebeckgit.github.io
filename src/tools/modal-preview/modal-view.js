// Each partial is its own wireframe slice, oblique like Zebra's Partials view.
//
//   x  frequency, evenly spaced, falling down-right at about 32 degrees
//   y  level, screen-vertical, on a compressed dB scale
//   z  decay time, rising up-right. Long decays leave the comb.
//
// Each slice is a triangle. The front is vertical. A short rung runs up-left
// to a second floor rail. The accent hypotenuse closes that triangle, so the
// diagonals cross the comb. Position combs the displayed levels.
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
  // Drawing-only envelope. The stored T60 is the sound and is not changed.
  // A shared linear clock cannot separate the string's second partial (~0.55
  // of the longest) from the third (~0.39): the second would die with the
  // third, or both would cross the comb. The picture keeps decays near the
  // longest in the air and drops the rest inside a rung or two.
  sag: 0.72,
  knee: 0.5,
  // Short floor depth, straight back along the decay axis. Same length on every slice.
  floorZ: 0.28,
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
  for (const slice of list) {
    if (!slice || (slice.alpha < 0.04 && slice.height < 0.02 && slice.depth < 0.02)) continue;
    const world = worldOf(slice, detune);
    const samples = [
      { x: world.x, y: 0, z: 0 },
      { x: world.x, y: world.y, z: 0 },
      floorBack(world),
      ...tailWorld(slice, world, longestSeconds(list)),
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
  const palette = sitePalette(colors);
  const ideal = measureFit(slices, camera, width, height, detune);
  const fit = options.fitMotion ? followFit(options.fitMotion, ideal, options.now ?? 0) : ideal;
  const place = placement(fit, width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.panel;
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const order = slices.map((slice, index) => ({ slice, index }));
  order.sort((a, b) => a.slice.t - b.slice.t);
  const clock = longestSeconds(slices);
  const haze = [];
  const flying = [];
  for (const item of order) {
    if (item.index === selected) continue;
    const shape = drawShape(item.slice.seconds, clock);
    (shape.floor ? haze : flying).push(item);
  }
  // Short decays are the haze inside the comb. The fronts paint over them
  // so the pickets stay the bright edge and the accent reads as fill.
  for (const item of haze) strokeTail(ctx, item.slice, detune, place, camera, look, palette, 1, clock);
  if (style !== 'eco') {
    for (const item of order) {
      if (item.index === selected) continue;
      strokeStructure(ctx, item.slice, detune, place, camera, look, palette, 1);
    }
    drawRails(ctx, order.map((item) => item.slice), detune, place, camera, palette, look);
  }
  for (const item of flying) strokeTail(ctx, item.slice, detune, place, camera, look, palette, 1, clock);
  if (selected >= 0 && slices[selected]) {
    const chosen = { ...look, width: look.width + 0.4, halo: Math.max(look.halo, 3.5), haloAlpha: Math.max(look.haloAlpha, 0.4) };
    if (style !== 'eco') strokeStructure(ctx, slices[selected], detune, place, camera, chosen, palette, 1);
    strokeTail(ctx, slices[selected], detune, place, camera, chosen, palette, 1, clock);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return slices.map((slice) => projectSlice(slice, detune, place, camera, clock).crest);
}

export function hitPartial(partials, camera, width, height, x, y, detune = 0, fit = null) {
  const slices = partials?.[0] && 't' in partials[0]
    ? partials
    : (partials || []).map((partial) => sliceFromPartial(partial, 1));
  const view = clampCamera(camera);
  const used = fit || measureFit(slices, view, width, height, detune);
  const place = placement(used, width, height);
  const clock = longestSeconds(slices);
  let best = -1;
  let score = 14;
  for (let i = 0; i < slices.length; i++) {
    if (slices[i].alpha < 0.2) continue;
    const tri = projectSlice(slices[i], detune, place, view, clock);
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

function drawRails(ctx, slices, detune, place, camera, palette, look) {
  const visible = slices.filter((slice) => slice && slice.alpha > 0.35 && slice.height > 0.02);
  if (visible.length < 2) return;
  const front = [];
  const back = [];
  for (const slice of visible) {
    const world = worldOf(slice, detune);
    const rear = floorBack(world);
    front.push(place(camera, world.x, 0, 0));
    back.push(place(camera, rear.x, rear.y, rear.z));
  }
  const rail = { ...look, width: look.width * 0.55, halo: look.halo * 0.4, haloAlpha: look.haloAlpha * 0.35 };
  glow(ctx, back, palette.ink, rail, 0.42);
  glow(ctx, front, palette.ink, rail, 0.5);
}

function floorBack(world) {
  return { x: world.x, y: 0, z: PLANE.floorZ };
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

// Reach is how far along the depth axis the curve travels. Drop is the
// exponent at that tip, so height = level * exp(-drop * u). Long decays
// stay in the air. Shorter ones reach the floor inside the comb.
function drawShape(seconds, maxSeconds) {
  const rel = Math.max(0.02, Math.max(0.05, seconds) / Math.max(0.05, maxSeconds));
  if (rel >= PLANE.knee) {
    // Same gentle sag on every long tail. Length follows the decay, so the
    // octave is shorter than the fundamental and still ends in the air.
    return { reach: 0.34 + 0.66 * rel, drop: PLANE.sag, floor: false };
  }
  // Only decays close to the knee still cross the comb. Much shorter
  // ones would draw a second copy of the bar, so they stay in the front.
  const t = rel / 0.4;
  const reach = Math.min(0.17, 0.16 * Math.max(t, 0) ** 2.2);
  return { reach: reach < 0.055 ? 0 : reach, drop: 2.35, floor: true };
}

function tailWorld(slice, world, maxSeconds) {
  const steps = 22;
  const seconds = Math.max(0.05, Number(slice?.seconds) || 0.2);
  const { reach, drop } = drawShape(seconds, maxSeconds || seconds);
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const env = Math.exp(-drop * u);
    points.push({ x: world.x, y: world.y * env, z: u * reach * PLANE.depth });
    if (i > 2 && env < 0.07) break;
  }
  return points;
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

function strokeStructure(ctx, slice, detune, place, camera, look, palette, alphaScale) {
  if (!slice || slice.alpha < 0.04 || slice.height < 0.02) return;
  const tri = projectSlice(slice, detune, place, camera);
  const fade = slice.alpha * alphaScale;
  const front = { ...look, width: look.width * 1.4, halo: look.halo * 1.45, haloAlpha: Math.min(0.5, look.haloAlpha * 1.25) };
  const rung = { ...look, width: Math.max(0.6, look.width * 0.4), halo: look.halo * 0.3, haloAlpha: look.haloAlpha * 0.25 };
  glow(ctx, [tri.foot, tri.crest], palette.ink, front, fade);
  glow(ctx, [tri.foot, tri.floor], palette.ink, rung, fade * 0.38);
}

function strokeTail(ctx, slice, detune, place, camera, look, palette, alphaScale, maxSeconds) {
  if (!slice || slice.alpha < 0.04 || slice.height < 0.02) return;
  const tri = projectSlice(slice, detune, place, camera, maxSeconds);
  const shape = drawShape(slice.seconds, maxSeconds || slice.seconds);
  if (!shape.floor) {
    glow(ctx, tri.curve, palette.wire, look, slice.alpha * alphaScale);
    return;
  }
  if (shape.reach < 0.05) return;
  // Bright near the crest, quiet at the floor, so the short decays pile up
  // as a haze in the comb instead of a row of hard scallops.
  const lookTail = {
    ...look,
    width: Math.max(0.9, look.width * 0.85),
    halo: look.halo * 2.1,
    haloAlpha: Math.min(0.72, look.haloAlpha * 1.8),
  };
  const points = tri.curve;
  const chunks = 4;
  const last = points.length - 1;
  for (let c = 0; c < chunks; c++) {
    const i0 = Math.floor(c * last / chunks);
    const i1 = Math.ceil((c + 1) * last / chunks);
    const fade = 1 - (c / chunks) * 0.55;
    glow(ctx, points.slice(i0, i1 + 1), palette.wire, lookTail, slice.alpha * alphaScale * fade);
  }
}

export function layoutTriangles(slices, camera, width, height, detune = 0) {
  const view = clampCamera(camera);
  const spaced = spaceByLog(slices.map((slice) => ({ ...slice })));
  const fit = measureFit(spaced, view, width, height, detune);
  const place = placement(fit, width, height);
  const clock = longestSeconds(spaced);
  return spaced.map((slice) => projectSlice(slice, detune, place, view, clock));
}

function projectSlice(slice, detune, place, camera, maxSeconds) {
  const world = worldOf(slice, detune);
  const rear = floorBack(world);
  const curve = tailWorld(slice, world, maxSeconds).map((point) => place(camera, point.x, point.y, point.z));
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

function sitePalette(colors) {
  const panel = colors?.bg || '#f2ede3';
  return {
    panel,
    ink: colors?.ink || colors?.fg || '#1f1d1a',
    wire: colors?.accent || '#d4421c',
    bloom: luminance(panel) < 90 ? 'lighter' : 'source-over',
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
