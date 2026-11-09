// Straight wedge of the modal face, matched to the Zebra 3 frame at 00:12.
//
// The bright face is a triangle, not the spectrum outline. Its left edge is
// the low-frequency end, its top and bottom edges are straight, and they
// meet at a sharp tip. Level and decay stay inside that outline: the rungs
// are faint lines across the face, and they do not move the silhouette.
// Cyan lines stack along the top edge. The lid is two lines that leave that
// edge about a third and a half of the way along and rise up-right, with a
// short right-angle hook at the far end.
//
// WEDGE is the look and the drag limits. Retune numbers here.

export const WEDGE = {
  // Default camera. The left edge projects vertical and the long axis
  // runs down-right, with the tip left of the right side of the box.
  yaw: -0.56,
  pitch: 0.6,
  focal: 10,
  perspective: 0.4,
  yawMin: -1.7,
  yawMax: 2.25,
  pitchMin: 0.08,
  pitchMax: 1.35,
  span: 6,
  leftH: 4,
  tipY: 0.8,
  tipZ: 0.5,
  // Resting placement in the box. The top-left corner sits at a quarter of
  // the height, the left edge is tall, and a 45 degree top edge lands the
  // tip near the horizontal middle at about 80 percent of the height.
  originX: 0.05,
  originY: 0.25,
  leftScreen: 0.393,
  stackCount: 4,
  stackGap: 0.012,
  stackEnd: 0.97,
  lidFrom: 0.33,
  lidTo: 0.5,
  lidReach: 0.78,
  rungAlpha: 0.16,
  tipSize: 0.055,
  panel: '#1c1a17',
  line: '#f2ede3',
  bottom: '#fbf9f4',
  bottomWire: 0.42,
  wire: '#7ed4cc',
  wireAlpha: 0.92,
  styles: {
    eco: { width: 0.75, alpha: 0.55, halo: 0, haloAlpha: 0, solid: false },
    fast: { width: 1.15, alpha: 0.85, halo: 0, haloAlpha: 0, solid: true },
    glow: { width: 1.15, alpha: 0.72, halo: 6, haloAlpha: 0.28, solid: true },
  },
};

export function defaultCamera() {
  return { yaw: WEDGE.yaw, pitch: WEDGE.pitch, distance: WEDGE.focal };
}

export function clampCamera(camera) {
  const base = camera || defaultCamera();
  return {
    yaw: clamp(base.yaw, WEDGE.yawMin, WEDGE.yawMax),
    pitch: clamp(base.pitch, WEDGE.pitchMin, WEDGE.pitchMax),
    distance: WEDGE.focal,
  };
}

export function paintModalView(ctx, partials, options) {
  const { width, height, style = 'fast', colors, selected = -1, camera, detune = 0 } = options;
  const look = WEDGE.styles[style] || WEDGE.styles.fast;
  const scene = layoutScene(partials, camera, width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = WEDGE.panel;
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  const accent = colors?.accent || '#d4421c';
  const smear = Math.max(-1, Math.min(1, detune)) * 7;
  if (smear) drawSheet(ctx, scene, look, selected, smear, 0.45);
  drawSheet(ctx, scene, look, selected, 0, 1);
  if (selected >= 0 && scene.modes[selected]) {
    const mode = scene.modes[selected];
    strokeRung(ctx, mode, { width: look.width + 1.1, alpha: 1, halo: 3, haloAlpha: 0.35 }, accent);
  }
  return scene.modes.map((mode) => mode.base);
}

export function hitPartial(partials, camera, width, height, x, y) {
  const scene = layoutScene(partials, camera, width, height);
  let best = -1;
  let score = 12;
  for (let i = 0; i < scene.modes.length; i++) {
    const mode = scene.modes[i];
    const distance = distanceToSegment(x, y, mode.base.x, mode.base.y, mode.crest.x, mode.crest.y);
    if (distance < score) {
      score = distance;
      best = i;
    }
  }
  return best;
}

export function layoutScene(partials, camera, width, height) {
  const view = clampCamera(camera);
  const place = placement(width, height);
  const rawTl = place(view, 0, WEDGE.leftH, 0);
  const rawBl = place(view, 0, 0, 0);
  const rawTip = place(view, WEDGE.span, WEDGE.tipY, WEDGE.tipZ);
  const fit = contain([rawTl, rawBl, rawTip, ...lidEnds(rawTl, rawBl, rawTip)], width, height);
  const tl = fit(rawTl);
  const bl = fit(rawBl);
  const tip = fit(rawTip);
  const last = Math.max(1, partials.length - 1);
  const modes = partials.map((partial, index) => {
    const t = index / last;
    return {
      base: lerp(bl, tip, t),
      crest: lerp(tl, tip, t),
      t,
      amp: 10 ** (Math.max(-72, Math.min(0, Number(partial.gainDb) || 0)) / 20),
    };
  });
  return { modes, tl, bl, tip, project: (x, y, z) => place(view, x, y, z) };
}

// Pin the resting left edge, then keep that same screen scale while dragging.
function placement(width, height) {
  const home = clampCamera(defaultCamera());
  const origin = screenOf(home, 0, WEDGE.leftH, 0);
  const foot = screenOf(home, 0, 0, 0);
  const scale = (height * WEDGE.leftScreen) / (Math.hypot(foot.x - origin.x, foot.y - origin.y) || 1);
  const ox = width * WEDGE.originX - origin.x * scale;
  const oy = height * WEDGE.originY - origin.y * scale;
  return (camera, x, y, z) => {
    const point = screenOf(camera, x, y, z);
    return { x: point.x * scale + ox, y: point.y * scale + oy };
  };
}

function screenOf(camera, x, y, z) {
  const point = rawProject(x, y, z, camera);
  return { x: point.x, y: -point.y };
}

function lidEnds(tl, bl, tip) {
  const edge = norm(sub(tip, tl));
  let normal = { x: edge.y, y: -edge.x };
  if (dot(normal, sub(bl, tl)) > 0) normal = { x: -normal.x, y: -normal.y };
  const reach = (Math.hypot(bl.x - tl.x, bl.y - tl.y) || 1) * WEDGE.lidReach;
  return [WEDGE.lidFrom, WEDGE.lidTo].map((t) => add(lerp(tl, tip, t), scale(normal, reach)));
}

function contain(points, width, height) {
  const pad = 6;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  if (minX >= pad && minY >= pad && maxX <= width - pad && maxY <= height - pad) return (point) => point;
  const zoom = Math.min((width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxY - minY));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return (point) => ({ x: width / 2 + (point.x - cx) * zoom, y: height / 2 + (point.y - cy) * zoom });
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
  const denom = camera.distance + z2 * WEDGE.perspective;
  const persp = clamp(camera.distance / Math.max(0.25, denom), 0.25, 2.4);
  return { x: x1 * persp, y: y2 * persp, depth: z2 };
}

function drawSheet(ctx, scene, look, selected, shift, alphaScale) {
  const { modes, tl, bl, tip } = scene;
  if (!tl || !bl || !tip) return;
  const fuse = modes.length >= 64 && look.solid;
  ctx.fillStyle = WEDGE.line;
  ctx.strokeStyle = WEDGE.line;
  if (fuse) {
    ctx.globalAlpha = 0.94 * alphaScale;
    fillTriangle(ctx, tl, bl, tip, shift);
  }
  ctx.globalAlpha = (fuse ? WEDGE.rungAlpha : Math.min(0.7, look.alpha)) * alphaScale;
  ctx.lineWidth = fuse ? 1 : look.width;
  ctx.strokeStyle = fuse ? WEDGE.wire : WEDGE.line;
  for (let i = 0; i < modes.length; i++) {
    if (i === selected) continue;
    const mode = modes[i];
    line(ctx, shiftPoint(mode.base, shift), shiftPoint(mode.crest, shift));
  }
  strokeEdges(ctx, tl, bl, tip, shift, alphaScale);
  drawTopWire(ctx, tl, bl, tip, look, shift, alphaScale);
  drawTip(ctx, tl, bl, tip, shift, alphaScale);
  ctx.globalAlpha = 1;
}

function drawTopWire(ctx, tl, bl, tip, look, shift, alphaScale) {
  const edge = norm(sub(tip, tl));
  let normal = { x: edge.y, y: -edge.x };
  const down = sub(bl, tl);
  if (dot(normal, down) > 0) normal = { x: -normal.x, y: -normal.y };
  const left = Math.hypot(bl.x - tl.x, bl.y - tl.y) || 1;
  const gap = left * WEDGE.stackGap;
  ctx.strokeStyle = WEDGE.wire;
  ctx.lineWidth = 1.15;
  const end = lerp(tl, tip, WEDGE.stackEnd);
  if (look.halo > 0) {
    ctx.globalAlpha = look.haloAlpha * alphaScale;
    ctx.lineWidth = look.halo;
    strokeOffset(ctx, tl, end, normal, gap * 2, shift);
    ctx.lineWidth = 1.15;
  }
  ctx.globalAlpha = WEDGE.wireAlpha * alphaScale;
  for (let i = 1; i <= WEDGE.stackCount; i++) strokeOffset(ctx, tl, end, normal, gap * i, shift);
  const reach = left * WEDGE.lidReach;
  const startA = lerp(tl, tip, WEDGE.lidFrom);
  const startB = lerp(tl, tip, WEDGE.lidTo);
  const endA = add(startA, scale(normal, reach));
  const endB = add(startB, scale(normal, reach));
  if (look.halo > 0) {
    ctx.globalAlpha = look.haloAlpha * alphaScale;
    ctx.lineWidth = look.halo;
    line(ctx, shiftPoint(startA, shift), shiftPoint(endA, shift));
    line(ctx, shiftPoint(startB, shift), shiftPoint(endB, shift));
    ctx.lineWidth = 1.15;
  }
  ctx.globalAlpha = WEDGE.wireAlpha * alphaScale;
  line(ctx, shiftPoint(startA, shift), shiftPoint(endA, shift));
  line(ctx, shiftPoint(startB, shift), shiftPoint(endB, shift));
  line(ctx, shiftPoint(endA, shift), shiftPoint(endB, shift));
}

function drawTip(ctx, tl, bl, tip, shift, alphaScale) {
  const back = norm(sub(mid(tl, bl), tip));
  const side = { x: -back.y, y: back.x };
  const size = Math.hypot(bl.x - tl.x, bl.y - tl.y) * WEDGE.tipSize;
  ctx.strokeStyle = WEDGE.wire;
  ctx.globalAlpha = WEDGE.wireAlpha * alphaScale;
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const d = (size * i) / 3;
    const p = add(tip, scale(back, d));
    const half = d * 0.42;
    line(ctx, shiftPoint(add(p, scale(side, -half)), shift), shiftPoint(add(p, scale(side, half)), shift));
  }
  for (const s of [-0.28, 0.28]) {
    const a = add(tip, scale(side, s * size));
    line(ctx, shiftPoint(a, shift), shiftPoint(add(a, scale(back, size * 0.95)), shift));
  }
}

function fillTriangle(ctx, tl, bl, tip, shift) {
  const a = shiftPoint(tl, shift);
  const b = shiftPoint(bl, shift);
  const c = shiftPoint(tip, shift);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(b.x, b.y);
  ctx.closePath();
  ctx.fill();
}

function strokeEdges(ctx, tl, bl, tip, shift, alphaScale) {
  ctx.strokeStyle = WEDGE.line;
  ctx.globalAlpha = Math.min(1, 0.95 * alphaScale);
  ctx.lineWidth = 1.35;
  line(ctx, shiftPoint(tl, shift), shiftPoint(bl, shift));
  line(ctx, shiftPoint(tip, shift), shiftPoint(tl, shift));
  ctx.strokeStyle = WEDGE.bottom;
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.7;
  line(ctx, shiftPoint(bl, shift), shiftPoint(tip, shift));
  const edge = norm(sub(tip, bl));
  let outward = { x: edge.y, y: -edge.x };
  if (dot(outward, sub(tl, bl)) > 0) outward = { x: -outward.x, y: -outward.y };
  const offset = scale(outward, 1.6);
  ctx.strokeStyle = WEDGE.wire;
  ctx.globalAlpha = WEDGE.bottomWire * alphaScale;
  ctx.lineWidth = 1.05;
  line(ctx, shiftPoint(add(bl, offset), shift), shiftPoint(add(tip, offset), shift));
}

function strokeOffset(ctx, a, b, normal, distance, shift) {
  const o = scale(normal, distance);
  line(ctx, shiftPoint(add(a, o), shift), shiftPoint(add(b, o), shift));
}

function strokeRung(ctx, mode, look, color) {
  ctx.strokeStyle = color;
  if (look.halo) {
    ctx.globalAlpha = look.haloAlpha;
    ctx.lineWidth = look.halo;
    line(ctx, mode.base, mode.crest);
  }
  ctx.globalAlpha = look.alpha;
  ctx.lineWidth = look.width;
  line(ctx, mode.base, mode.crest);
  ctx.globalAlpha = 1;
}

function line(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function shiftPoint(point, shift) {
  return shift ? { x: point.x + shift, y: point.y } : point;
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scale(v, k) {
  return { x: v.x * k, y: v.y * k };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function norm(v) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
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
