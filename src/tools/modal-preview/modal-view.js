// Each partial is its own wireframe right triangle. Nothing connects them.
//
//   x  frequency, left to right
//   y  level, up from the floor
//   z  decay, front to back
//
// A triangle is three lines: the vertical on the front plane, the floor line
// running back, and the sloping top that joins them. The lid is those tops
// seen together. Eco draws only the tops. Glow is Fast plus a bloom.
//
// Motion lives in aimSlices / sampleSlices. Match by index. A profile change
// eases for MORPH_MS with ease-out. New indices grow from zero height. Indices
// that leave shrink and fade. Detune is not part of that tween: paint applies
// it live, spreading or bunching frequency while height and depth stay put.

export const MORPH_MS = 260;

export const PLANE = {
  yaw: -0.62,
  pitch: 0.58,
  focal: 9.5,
  perspective: 0.34,
  pitchMin: 0.2,
  pitchMax: 1.15,
  span: 7.2,
  height: 2.7,
  depth: 3.4,
  ratioLo: 0.35,
  ratioHi: 48,
  styles: {
    eco: { width: 1.15, alpha: 0.9, halo: 0 },
    fast: { width: 1.2, alpha: 0.92, halo: 0 },
    glow: { width: 1.35, alpha: 1, halo: 7, haloAlpha: 0.45 },
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
  return Math.pow(seconds / 8, 0.7);
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

export function paintModalView(ctx, partials, options = {}) {
  const { width, height, style = 'fast', colors, selected = -1, detune = 0 } = options;
  const camera = clampCamera(options.camera);
  const slices = options.slices || (partials || []).map((partial) => sliceFromPartial(partial, 1));
  const look = PLANE.styles[style] || PLANE.styles.fast;
  const palette = sitePalette(colors);
  const place = placement(width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.panel;
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
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

export function hitPartial(partials, camera, width, height, x, y, detune = 0) {
  const slices = partials?.[0] && 't' in partials[0]
    ? partials
    : (partials || []).map((partial) => sliceFromPartial(partial, 1));
  const place = placement(width, height);
  const view = clampCamera(camera);
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
    z: clamp(slice.depth, 0, 1.6) * PLANE.depth,
  };
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
    if (!topsOnly) {
      line(ctx, tri.foot, tri.crest);
      line(ctx, tri.foot, tri.back);
    }
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = look.width;
  ctx.globalAlpha = look.alpha * fade;
  ctx.strokeStyle = palette.wire;
  line(ctx, tri.crest, tri.back);
  if (!topsOnly) {
    ctx.strokeStyle = palette.ink;
    ctx.globalAlpha = 0.72 * fade;
    line(ctx, tri.foot, tri.crest);
    line(ctx, tri.foot, tri.back);
  }
}

function projectSlice(slice, detune, place, camera) {
  const world = worldOf(slice, detune);
  return {
    foot: place(camera, world.x, 0, 0),
    crest: place(camera, world.x, world.y, 0),
    back: place(camera, world.x, 0, world.z),
  };
}

function placement(width, height) {
  const home = defaultCamera();
  const margin = 16;
  const corners = fieldCorners();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const corner of corners) {
    const point = screenOf(home, corner.x, corner.y, corner.z);
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  const scale = Math.min(
    (width - margin * 2) / Math.max(0.001, maxX - minX),
    (height - margin * 2) / Math.max(0.001, maxY - minY),
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return (camera, x, y, z) => {
    const point = screenOf(camera, x, y, z);
    return {
      x: width / 2 + (point.x - cx) * scale,
      y: height / 2 + (point.y - cy) * scale,
    };
  };
}

function fieldCorners() {
  const xs = [-PLANE.span * 0.62, PLANE.span * 0.62];
  const ys = [0, PLANE.height];
  const zs = [0, PLANE.depth];
  const corners = [];
  for (const x of xs) for (const y of ys) for (const z of zs) corners.push({ x, y, z });
  return corners;
}

function screenOf(camera, x, y, z) {
  const point = rawProject(x, y, z, camera);
  return { x: point.x, y: -point.y };
}

function rawProject(x, y, z, camera) {
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const y2 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  const denom = camera.distance + z2 * PLANE.perspective;
  const persp = clamp(camera.distance / Math.max(0.3, denom), 0.3, 2.2);
  return { x: x1 * persp, y: y2 * persp, depth: z2 };
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
