// Each partial is its own wireframe right triangle. Nothing connects them.
//
// The picture is oblique, like Zebra's Partials view. Level is screen-vertical,
// so the front edge never leans. Frequency runs down-right. Decay runs up-right.
// Yaw turns that pair around the vertical. Pitch only changes how steeply
// decay rises. It does not tilt the verticals.
//
//   x  frequency
//   y  level
//   z  decay
//
// Motion lives in aimSlices / sampleSlices. Match by index. A profile change
// eases for MORPH_MS with ease-out. New indices grow from zero height. Indices
// that leave shrink and fade. Detune is not part of that tween: paint applies
// it live, spreading or bunching frequency while height and depth stay put.

export const MORPH_MS = 260;

export const PLANE = {
  // Resting three-quarter. Frequency falls down-right at a shallow angle.
  // Decay rises up-right at about 30 degrees. The frequency run is short
  // next to the bar height, and the longest tail is only a little longer
  // than the tallest bar.
  yaw: 0.02,
  pitch: 0.58,
  focal: 9.5,
  pitchMin: 0.5,
  pitchMax: 0.95,
  span: 4.2,
  height: 2.7,
  depth: 3.4,
  ratioLo: 0.35,
  ratioHi: 48,
  styles: {
    eco: { width: 1.15, alpha: 0.95, halo: 0, haloAlpha: 0 },
    fast: { width: 1.2, alpha: 1, halo: 6, haloAlpha: 0.38 },
    glow: { width: 1.35, alpha: 1, halo: 9, haloAlpha: 0.5 },
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
  return {
    t: frequencyT(partial?.ratio),
    height: levelHeight(partial?.gainDb),
    depth: decayDepth(partial?.decay),
    alpha,
  };
}

export function frequencyT(ratio) {
  const value = Math.max(Number(ratio) || PLANE.ratioLo, 1e-6);
  const logLo = Math.log2(PLANE.ratioLo);
  const logHi = Math.log2(PLANE.ratioHi);
  return clamp((Math.log2(value) - logLo) / (logHi - logLo), 0, 1);
}

export function levelHeight(gainDb) {
  const number = Number(gainDb);
  const db = clamp(Number.isFinite(number) ? number : -60, -60, 0);
  return (db + 60) / 60;
}

export function decayDepth(decay) {
  const seconds = clamp(Number(decay) || 0, 0, 24);
  return clamp(Math.pow(seconds / 9, 0.8), 0, 1);
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
  const count = Math.max(shown.length, next.length);
  const from = [];
  const to = [];
  for (let i = 0; i < count; i++) {
    const target = next[i] || { ...(shown[i] || sliceFromPartial(null, 0)), height: 0, depth: 0, alpha: 0 };
    if (shown[i]) from.push(shown[i]);
    else from.push({ t: target.t, height: 0, depth: 0, alpha: 0 });
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
    for (const point of [
      screenOf(view, world.x, 0, 0),
      screenOf(view, world.x, world.y, 0),
      screenOf(view, world.x, 0, world.z),
    ]) {
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
  const capScale = Math.min((width * 0.62) / spanX, (height * 0.62) / spanY);
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
  const slices = options.slices || (partials || []).map((partial) => sliceFromPartial(partial, 1));
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
  drawFloor(ctx, slices, detune, place, camera, palette);
  const order = slices.map((slice, index) => ({ slice, index }));
  order.sort((a, b) => worldOf(b.slice, detune).z - worldOf(a.slice, detune).z);
  for (const item of order) {
    if (item.index === selected) continue;
    strokeTriangle(ctx, item.slice, detune, place, camera, look, palette, style, 1);
  }
  if (selected >= 0 && slices[selected]) {
    strokeTriangle(ctx, slices[selected], detune, place, camera, { ...look, width: look.width + 0.8, halo: Math.max(look.halo, 3), haloAlpha: 0.4 }, palette, style, 1);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return slices.map((slice) => projectSlice(slice, detune, place, camera).crest);
}

export function hitPartial(partials, camera, width, height, x, y, detune = 0, fit = null) {
  const slices = partials?.[0] && 't' in partials[0]
    ? partials
    : (partials || []).map((partial) => sliceFromPartial(partial, 1));
  const view = clampCamera(camera);
  const used = fit || measureFit(slices, view, width, height, detune);
  const place = placement(used, width, height);
  let best = -1;
  let score = 14;
  for (let i = 0; i < slices.length; i++) {
    if (slices[i].alpha < 0.2) continue;
    const tri = projectSlice(slices[i], detune, place, view);
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

function drawFloor(ctx, slices, detune, place, camera, palette) {
  const visible = slices.filter((slice) => slice && slice.alpha > 0.2);
  if (visible.length < 2) return;
  const worlds = visible.map((slice) => worldOf(slice, detune));
  let minX = Infinity;
  let maxX = -Infinity;
  for (const world of worlds) {
    if (world.x < minX) minX = world.x;
    if (world.x > maxX) maxX = world.x;
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = palette.ink;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 1;
  line(ctx, place(camera, minX, 0, 0), place(camera, maxX, 0, 0));
  ctx.globalAlpha = 0.1;
  const reach = PLANE.depth * 0.22;
  for (let i = 1; i <= 2; i++) {
    const z = (reach * i) / 2;
    line(ctx, place(camera, minX, 0, z), place(camera, maxX, 0, z));
  }
  ctx.globalAlpha = 1;
}

function strokeTriangle(ctx, slice, detune, place, camera, look, palette, style, alphaScale) {
  if (!slice || slice.alpha < 0.015) return;
  const tri = projectSlice(slice, detune, place, camera);
  const fade = slice.alpha * alphaScale;
  const topsOnly = style === 'eco';
  if (look.halo > 0) {
    ctx.save();
    ctx.globalCompositeOperation = palette.bloom;
    ctx.strokeStyle = palette.wire;
    ctx.globalAlpha = look.haloAlpha * fade;
    ctx.lineWidth = look.halo;
    line(ctx, tri.crest, tri.back);
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = palette.wire;
  ctx.lineWidth = look.width;
  ctx.globalAlpha = look.alpha * fade;
  line(ctx, tri.crest, tri.back);
  if (!topsOnly) {
    ctx.strokeStyle = palette.ink;
    ctx.globalAlpha = 0.9 * fade;
    ctx.lineWidth = 1.05;
    line(ctx, tri.foot, tri.crest);
    ctx.globalAlpha = 0.55 * fade;
    ctx.lineWidth = 1;
    line(ctx, tri.foot, tri.back);
  }
}

export function layoutTriangles(slices, camera, width, height, detune = 0) {
  const view = clampCamera(camera);
  const fit = measureFit(slices, view, width, height, detune);
  const place = placement(fit, width, height);
  return slices.map((slice) => projectSlice(slice, detune, place, view));
}

function projectSlice(slice, detune, place, camera) {
  const world = worldOf(slice, detune);
  return {
    foot: place(camera, world.x, 0, 0),
    crest: place(camera, world.x, world.y, 0),
    back: place(camera, world.x, 0, world.z),
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
  // Turn frequency and decay around the vertical. Level is not rotated,
  // so a front edge stays a vertical line at every yaw.
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  // Tuned so a full-height bar and a full-length tail meet at about 30 degrees
  // up-right, and the tail is a little longer than the bar.
  const tailRise = camera.pitch * 2.8;
  return {
    x: x1 + z1,
    y: y * 1.15 - x1 * 0.29 + z1 * tailRise,
    depth: z1,
  };
}

function sitePalette(colors) {
  const panel = colors?.bg || '#f2ede3';
  return {
    panel,
    ink: colors?.ink || '#1a1916',
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
    height: a.height + (b.height - a.height) * eased,
    depth: a.depth + (b.depth - a.depth) * eased,
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
