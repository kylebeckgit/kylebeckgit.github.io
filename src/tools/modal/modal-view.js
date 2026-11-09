// Straight wedge of the modal face, matched to the Zebra 3 frame at 00:12.
//
// The bright face is a triangle, not the spectrum outline. Its left edge is
// the low-frequency end, its top and bottom edges are straight, and they
// meet at a sharp tip. Level and decay stay inside that outline: the rungs
// are faint lines across the face, and they do not move the silhouette.
// Cyan lines stack along the top edge. The lid is a second pair, parallel
// to that edge and closed by a short right-angle hook at its far end.
//
// WEDGE is the look and the drag limits. Retune numbers here.

export const WEDGE = {
  // Default camera. The left edge projects vertical and the long axis
  // runs down-right, with the tip left of the right side of the box.
  yaw: -1,
  pitch: 0.35,
  focal: 7,
  perspective: 0.25,
  yawMin: -1.7,
  yawMax: 2.25,
  pitchMin: 0.16,
  pitchMax: 1.35,
  span: 7,
  leftH: 2.5,
  tipY: 0.2,
  tipZ: 1,
  // Empty raw-space around the triangle so the tip sits lower-middle
  // and the lid has room above the top edge.
  padRight: 0.48,
  padBelow: 0.34,
  padAbove: 0.42,
  marginX: 0.06,
  marginY: 0.06,
  // Cyan stack along the top, then the lid further out. Fractions of the
  // left-edge length, so they scale with the canvas.
  stackCount: 4,
  stackGap: 0.013,
  stackEnd: 0.97,
  lidInner: 0.1,
  lidOuter: 0.24,
  lidStart: 0.04,
  lidEnd: 0.55,
  rungAlpha: 0.16,
  tipSize: 0.055,
  panel: '#1c1a17',
  line: '#f2ede3',
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
  const fit = fitFrame(view, width, height);
  const project = (x, y, z) => fit(rawProject(x, y, z, view));
  const tl = project(0, WEDGE.leftH, 0);
  const bl = project(0, 0, 0);
  const tip = project(WEDGE.span, WEDGE.tipY, WEDGE.tipZ);
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
  return { modes, tl, bl, tip, project };
}

function fitFrame(camera, width, height) {
  const home = clampCamera(defaultCamera());
  const frame = [rawProject(0, WEDGE.leftH, 0, home), rawProject(0, 0, 0, home), rawProject(WEDGE.span, WEDGE.tipY, WEDGE.tipZ, home)];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const sample of frame) {
    if (sample.x < minX) minX = sample.x;
    if (sample.x > maxX) maxX = sample.x;
    if (sample.y < minY) minY = sample.y;
    if (sample.y > maxY) maxY = sample.y;
  }
  const spanX = Math.max(0.08, maxX - minX);
  const spanY = Math.max(0.08, maxY - minY);
  const samples = [
    rawProject(0, WEDGE.leftH, 0, camera),
    rawProject(0, 0, 0, camera),
    rawProject(WEDGE.span, WEDGE.tipY, WEDGE.tipZ, camera),
    { x: minX, y: maxY + spanY * WEDGE.padAbove },
    { x: maxX + spanX * WEDGE.padRight, y: minY - spanY * WEDGE.padBelow },
    { x: minX, y: minY - spanY * WEDGE.padBelow },
    { x: maxX + spanX * WEDGE.padRight, y: maxY + spanY * WEDGE.padAbove },
  ];
  return fitTransform(samples, width, height);
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

function fitTransform(samples, width, height) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const sample of samples) {
    if (sample.x < minX) minX = sample.x;
    if (sample.x > maxX) maxX = sample.x;
    if (sample.y < minY) minY = sample.y;
    if (sample.y > maxY) maxY = sample.y;
  }
  const marginX = width * WEDGE.marginX;
  const marginY = height * WEDGE.marginY;
  const spanX = Math.max(0.08, maxX - minX);
  const spanY = Math.max(0.08, maxY - minY);
  const zoom = Math.min((width - marginX * 2) / spanX, (height - marginY * 2) / spanY);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return (sample) => ({
    x: width / 2 + (sample.x - midX) * zoom,
    y: height / 2 - (sample.y - midY) * zoom,
  });
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
  ctx.strokeStyle = WEDGE.line;
  ctx.globalAlpha = Math.min(1, 0.95 * alphaScale);
  ctx.lineWidth = 1.35;
  strokeEdges(ctx, tl, bl, tip, shift);
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
  const inner = left * WEDGE.lidInner;
  const outer = left * WEDGE.lidOuter;
  const near = lerp(tl, tip, WEDGE.lidStart);
  const far = lerp(tl, tip, WEDGE.lidEnd);
  const a0 = add(near, scale(normal, inner));
  const a1 = add(far, scale(normal, inner));
  const b0 = add(near, scale(normal, outer));
  const b1 = add(far, scale(normal, outer));
  if (look.halo > 0) {
    ctx.globalAlpha = look.haloAlpha * alphaScale;
    ctx.lineWidth = look.halo;
    line(ctx, shiftPoint(a0, shift), shiftPoint(a1, shift));
    line(ctx, shiftPoint(b0, shift), shiftPoint(b1, shift));
    ctx.lineWidth = 1.15;
  }
  ctx.globalAlpha = WEDGE.wireAlpha * alphaScale;
  line(ctx, shiftPoint(a0, shift), shiftPoint(a1, shift));
  line(ctx, shiftPoint(b0, shift), shiftPoint(b1, shift));
  line(ctx, shiftPoint(a1, shift), shiftPoint(b1, shift));
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

function strokeEdges(ctx, tl, bl, tip, shift) {
  line(ctx, shiftPoint(tl, shift), shiftPoint(bl, shift));
  line(ctx, shiftPoint(bl, shift), shiftPoint(tip, shift));
  line(ctx, shiftPoint(tip, shift), shiftPoint(tl, shift));
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
