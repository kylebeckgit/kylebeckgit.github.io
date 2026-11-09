// Fixed-camera wedge of a modal profile.
//
// Axis inference from the Zebra 3 reference shots (Factory Chaotic Bell, 64
// modes, 150% GUI) and the user guide:
//   Frequency runs along the spine of the wedge. Disperse at 100 spreads the
//   modes apart along that spine and opens the fan.
//   Amplitude is where each line sits off the spine, so the outline is the
//   spectrum.
//   Relative decay is the length of each line. Absorb at 100 damps the modes,
//   high ones first, and the sheet collapses into a short ridge.
// The guide calls the graphic a 3D view of frequency, amplitude, and relative
// decay. The shots show one fixed steep camera, no floor, and no axis names.
// Each mode is one line. Stacked, the lines read as a sheet. Eco thins that
// sheet, fast draws every line, glow blooms it.
//
// WEDGE is the whole look. A later recording of a knob can retune these
// numbers without changing how a mode is placed or stroked.

export const WEDGE = {
  yaw: 0.7,
  pitch: 0.66,
  focal: 3.4,
  perspective: 0.62,
  span: 5.4,
  amp: 1.85,
  length: 2.8,
  dirX: 0.08,
  dirY: -0.12,
  dirZ: 1,
  freqOctaves: 5.6,
  decayLo: 0.04,
  decayHi: 6,
  marginX: 0.06,
  marginY: 0.1,
  panel: '#1c1a17',
  line: '#f2ede3',
  styles: {
    eco: { stride: 2, width: 0.85, alpha: 0.55, halo: 0, haloAlpha: 0, composite: 'source-over' },
    fast: { stride: 1, width: 1.05, alpha: 0.72, halo: 0, haloAlpha: 0, composite: 'source-over' },
    glow: { stride: 1, width: 1.35, alpha: 0.95, halo: 8, haloAlpha: 0.34, composite: 'source-over' },
  },
};

export function defaultCamera() {
  return { yaw: WEDGE.yaw, pitch: WEDGE.pitch, distance: WEDGE.focal };
}

export function paintModalView(ctx, partials, options) {
  const { width, height, style = 'fast', colors, selected = -1 } = options;
  const look = WEDGE.styles[style] || WEDGE.styles.fast;
  const scene = layoutScene(partials, width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = WEDGE.panel;
  ctx.fillRect(0, 0, width, height);
  ctx.lineCap = 'butt';
  const accent = colors?.accent || '#d4421c';
  const order = scene.modes
    .map((mode, index) => ({ mode, index }))
    .sort((a, b) => b.mode.depth - a.mode.depth);
  ctx.save();
  ctx.globalCompositeOperation = look.composite;
  for (const entry of order) {
    if (entry.index === selected) continue;
    if (look.stride > 1 && entry.index % look.stride !== 0) continue;
    strokeMode(ctx, entry.mode, look, WEDGE.line, false);
  }
  ctx.restore();
  if (selected >= 0 && scene.modes[selected]) {
    strokeMode(ctx, scene.modes[selected], { ...look, width: look.width + 1.1, alpha: 1, halo: Math.max(look.halo, 4), haloAlpha: 0.35 }, accent, true);
  }
  return scene.modes.map((mode) => mode.a);
}

export function hitPartial(partials, _camera, width, height, x, y) {
  const scene = layoutScene(partials, width, height);
  let best = -1;
  let score = 14;
  for (let i = 0; i < scene.modes.length; i++) {
    const mode = scene.modes[i];
    const distance = distanceToSegment(x, y, mode.a.x, mode.a.y, mode.b.x, mode.b.y);
    if (distance < score) {
      score = distance;
      best = i;
    }
  }
  return best;
}

export function layoutScene(partials, width, height) {
  const placed = placeModes(partials);
  const samples = frameCorners(placed).map((point) => rawProject(point.x, point.y, point.z));
  for (const mode of placed) {
    samples.push(rawProject(mode.x0, mode.y0, mode.z0));
    samples.push(rawProject(mode.x1, mode.y1, mode.z1));
  }
  const fit = fitTransform(samples, width, height);
  const modes = placed.map((mode) => {
    const a = fit(rawProject(mode.x0, mode.y0, mode.z0));
    const b = fit(rawProject(mode.x1, mode.y1, mode.z1));
    return { a, b, depth: (a.depth + b.depth) / 2, amp: mode.amp };
  });
  return { modes, placed };
}

function placeModes(partials) {
  if (!partials.length) return [];
  const fund = Math.min(...partials.map((partial) => partial.ratio));
  const lo = Math.log(WEDGE.decayLo);
  const hi = Math.log(WEDGE.decayHi);
  return partials.map((partial) => {
    const oct = Math.log2(Math.max(partial.ratio, 1e-6) / fund);
    const x = (oct / WEDGE.freqOctaves) * WEDGE.span;
    const amp = 10 ** (Math.max(-80, Math.min(0, Number(partial.gainDb) || 0)) / 20);
    const decayT = clamp((Math.log(Math.max(WEDGE.decayLo, Number(partial.decay) || WEDGE.decayLo)) - lo) / (hi - lo), 0, 1.4);
    const len = Math.max(0.03, decayT) * WEDGE.length;
    const y = amp * WEDGE.amp;
    return {
      x0: x,
      y0: y,
      z0: 0,
      x1: x + len * WEDGE.dirX,
      y1: y + len * WEDGE.dirY,
      z1: len * WEDGE.dirZ,
      amp,
    };
  });
}

function frameCorners(placed) {
  // A full-level, full-decay mode at either end of the modes actually shown.
  // The frame stays put when Absorb shortens the lines, and it grows when
  // Disperse pushes a mode further along the spine.
  const len = WEDGE.length;
  const xs = placed.length ? placed.map((mode) => mode.x0) : [0, WEDGE.span];
  const minX = Math.min(...xs);
  const maxX = Math.max(minX + WEDGE.span * 0.5, ...xs);
  const points = [];
  for (const x of [minX, maxX]) {
    points.push({ x, y: WEDGE.amp * 0.15, z: 0 });
    points.push({ x, y: WEDGE.amp, z: 0 });
    points.push({ x: x + len * WEDGE.dirX, y: WEDGE.amp + len * WEDGE.dirY, z: len * WEDGE.dirZ });
  }
  return points;
}

function rawProject(x, y, z) {
  const cy = Math.cos(WEDGE.yaw);
  const sy = Math.sin(WEDGE.yaw);
  const cp = Math.cos(WEDGE.pitch);
  const sp = Math.sin(WEDGE.pitch);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const y2 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  const denom = WEDGE.focal + z2 * WEDGE.perspective;
  const persp = clamp(WEDGE.focal / Math.max(0.45, denom), 0.45, 1.65);
  return { x: x1 * persp, y: y2 * persp, depth: z2, persp };
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
  const spanX = Math.max(0.05, maxX - minX);
  const spanY = Math.max(0.05, maxY - minY);
  const zoom = Math.min((width - marginX * 2) / spanX, (height - marginY * 2) / spanY);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  return (sample) => ({
    x: width / 2 + (sample.x - midX) * zoom,
    y: height / 2 - (sample.y - midY) * zoom,
    depth: sample.depth,
    persp: sample.persp,
  });
}

function strokeMode(ctx, mode, look, color, accent) {
  const persp = Math.max(mode.a.persp || 1, mode.b.persp || 1);
  const weight = accent ? 1 : 0.28 + 0.72 * Math.sqrt(Math.max(0, Math.min(1, mode.amp)));
  if (look.halo > 0) {
    ctx.globalAlpha = look.haloAlpha * weight;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.min(look.halo, 5);
    line(ctx, mode.a, mode.b);
  }
  ctx.globalAlpha = look.alpha * weight;
  ctx.strokeStyle = color;
  ctx.lineWidth = look.width * (0.8 + 0.35 * clamp(persp, 0.45, 1.65));
  line(ctx, mode.a, mode.b);
  ctx.globalAlpha = 1;
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
