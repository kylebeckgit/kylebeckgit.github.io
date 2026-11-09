// Oblique prism of a modal profile, matched to the Zebra 3 walkthrough.
//
// Axis reading from the Density and profile segments (Factory Chaotic Bell):
//   Modes are spaced along a fixed spine. Density changes how many rungs
//   share that spine: 8 is a sparse wireframe, 256 is a solid sheet, and the
//   outline stays put.
//   Level is the crest of each rung, so the outline is the spectrum.
//   Decay is the depth of the rung. In the recording Absorb, Normalize, and
//   Decay only nudge that crest; they do not rebuild the prism.
//   A little of the spacing follows log frequency, so Tune slides the sheet
//   and a profile with stretched ratios changes the outline.
// The rungs connect a spine polyline to a crest polyline. The first and last
// rungs are drawn as end caps, which is the small grid at the tip.
//
// WEDGE is the look and the drag limits. Retune numbers here.

export const WEDGE = {
  // Resting view from the walkthrough frame at 00:12: the bright face runs
  // down-right at about 45 degrees, and it is about 3.2 times longer than thick.
  yaw: -1.1,
  pitch: 0.75,
  focal: 1.4,
  perspective: 1.1,
  yawMin: -1.7,
  yawMax: 2.25,
  pitchMin: 0.16,
  pitchMax: 1.35,
  span: 5.4,
  amp: 1.7,
  // Depth opens the face for every partial. leftWidth adds more at the low
  // end, so that side is wider than the tip. decayDepth only nudges it.
  depth: 1.45,
  leftWidth: 1.7,
  decayDepth: 0.35,
  spine: 0.14,
  // The cyan wire sits just above the cream face. The lid is a flat plane
  // over the low partials, closing with a corner partway along the slab.
  float: 0.1,
  planeLift: 1.2,
  planeEnd: 0.46,
  step: 8,
  tipSpan: 0.04,
  tipRise: 0.28,
  decayLo: 0.05,
  decayHi: 4.5,
  marginX: 0.07,
  marginY: 0.08,
  panel: '#1c1a17',
  line: '#f2ede3',
  wire: '#7ed4cc',
  wireAlpha: 0.95,
  styles: {
    eco: { width: 0.75, alpha: 0.9, halo: 0, haloAlpha: 0, solid: false },
    fast: { width: 1.25, alpha: 0.85, halo: 0, haloAlpha: 0, solid: true },
    glow: { width: 1.2, alpha: 0.72, halo: 7, haloAlpha: 0.28, solid: true },
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
  ctx.lineJoin = 'round';
  const accent = colors?.accent || '#d4421c';
  const smear = Math.max(-1, Math.min(1, detune)) * 7;
  if (smear) drawSheet(ctx, scene, look, WEDGE.line, selected, smear, 0.45);
  drawSheet(ctx, scene, look, WEDGE.line, selected, 0, 1);
  if (selected >= 0 && scene.modes[selected]) {
    const mode = scene.modes[selected];
    strokeRung(ctx, mode, { width: look.width + 1.3, alpha: 1, halo: 4, haloAlpha: 0.4 }, accent);
    strokeRung(ctx, { base: mode.wireBase, crest: mode.wireCrest }, { width: look.width + 0.8, alpha: 1, halo: 3, haloAlpha: 0.35 }, accent);
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
  const placed = placeModes(partials);
  const samples = [];
  for (const mode of placed) {
    samples.push(rawProject(mode.x, 0, mode.z0, view));
    samples.push(rawProject(mode.x, mode.y, mode.z1, view));
    if (mode.t <= WEDGE.planeEnd) samples.push(rawProject(mode.x, mode.y + WEDGE.planeLift, mode.z1, view));
  }
  if (placed.length) {
    const last = placed[placed.length - 1];
    const yMax = Math.max(last.y, WEDGE.amp * WEDGE.tipRise);
    const xNear = last.x - WEDGE.span * WEDGE.tipSpan;
    for (const x of [xNear, last.x]) {
      samples.push(rawProject(x, yMax, last.z1, view));
      samples.push(rawProject(x, 0, last.z0, view));
    }
  }
  if (!samples.length) samples.push(rawProject(0, 0, 0, view), rawProject(WEDGE.span, WEDGE.amp, WEDGE.depth, view));
  const fit = fitTransform(samples, width, height);
  const project = (x, y, z) => fit(rawProject(x, y, z, view));
  const modes = placed.map((mode) => ({
    base: project(mode.x, 0, mode.z0),
    crest: project(mode.x, mode.y, mode.z1),
    wireBase: project(mode.x, 0, mode.z0),
    wireCrest: project(mode.x, mode.y, mode.z1),
    plane: null,
    cap: project(mode.x, mode.y * 0.5, mode.z1),
    world: mode,
    depth: mode.x,
    amp: mode.amp,
  }));
  raiseWire(modes, project);
  return { modes, project };
}

// The cyan copy sits a short step off the cream, toward the top plane.
// The plane itself runs parallel to the spine and closes with a right-angle cap.
function raiseWire(modes, project) {
  if (modes.length < 2) return;
  const origin = project(0, 0, 0);
  const up = project(0, 1, 0);
  const unit = Math.hypot(up.x - origin.x, up.y - origin.y) || 1;
  const lift = unit * WEDGE.planeLift;
  const floatLift = unit * WEDGE.float;
  const tail = modes[modes.length - 1].base;
  const head = modes[0].base;
  const sx = tail.x - head.x;
  const sy = tail.y - head.y;
  const len = Math.hypot(sx, sy) || 1;
  const px = sy / len;
  const py = -sx / len;
  const left = modes[0].crest;
  for (const mode of modes) {
    mode.wireBase = { x: mode.base.x + px * floatLift, y: mode.base.y + py * floatLift };
    mode.wireCrest = { x: mode.crest.x + px * floatLift, y: mode.crest.y + py * floatLift };
    if (mode.world.t <= WEDGE.planeEnd) {
      mode.plane = {
        x: left.x + sx * mode.world.t + px * lift,
        y: left.y + sy * mode.world.t + py * lift,
      };
    }
  }
}

function placeModes(partials) {
  if (!partials.length) return [];
  const fund = Math.min(...partials.map((partial) => partial.ratio));
  const top = Math.max(...partials.map((partial) => partial.ratio));
  const logSpan = Math.log2(top / fund) || 1;
  const lo = Math.log(WEDGE.decayLo);
  const hi = Math.log(WEDGE.decayHi);
  const last = Math.max(1, partials.length - 1);
  return partials.map((partial, index) => {
    const indexT = index / last;
    const logT = Math.log2(Math.max(partial.ratio, 1e-6) / fund) / logSpan;
    const u = indexT * 0.74 + logT * 0.26;
    const amp = 10 ** (Math.max(-72, Math.min(0, Number(partial.gainDb) || 0)) / 20);
    const level = 0.46 + 0.54 * Math.sqrt(amp);
    const decayT = clamp((Math.log(Math.max(WEDGE.decayLo, Number(partial.decay) || WEDGE.decayLo)) - lo) / (hi - lo), 0.08, 1);
    const left = 1 - indexT;
    return {
      x: u * WEDGE.span,
      y: level * WEDGE.amp,
      z0: WEDGE.spine,
      z1: WEDGE.depth + left * WEDGE.leftWidth + decayT * WEDGE.decayDepth,
      t: indexT,
      amp,
    };
  });
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
  const persp = clamp(camera.distance / Math.max(0.55, denom), 0.42, 1.85);
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

function drawSheet(ctx, scene, look, color, selected, shift, alphaScale) {
  const modes = scene.modes;
  if (!modes.length) return;
  const count = modes.length;
  const fuse = count >= 64 && look.solid;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  if (fuse) {
    ctx.globalAlpha = 0.92 * alphaScale;
    fillFace(ctx, modes, shift);
    if (look.halo > 0) {
      ctx.globalAlpha = look.haloAlpha * alphaScale;
      ctx.lineWidth = look.halo;
      strokeStepped(ctx, modes.map((mode) => shiftPoint(mode.crest, shift)));
    }
  } else {
    const rungAlpha = Math.min(0.92, look.alpha * alphaScale);
    if (look.halo > 0) {
      ctx.globalAlpha = look.haloAlpha * alphaScale;
      ctx.lineWidth = look.halo;
      strokeStepped(ctx, modes.map((mode) => shiftPoint(mode.crest, shift)));
    }
    ctx.globalAlpha = rungAlpha;
    ctx.lineWidth = look.width;
    for (let i = 0; i < modes.length; i++) {
      if (i === selected) continue;
      const mode = modes[i];
      line(ctx, shiftPoint(mode.base, shift), shiftPoint(mode.crest, shift));
    }
  }
  drawWire(ctx, scene, look, shift, alphaScale, selected);
  ctx.globalAlpha = 1;
}

function drawWire(ctx, scene, look, shift, alphaScale, selected) {
  const modes = scene.modes;
  if (modes.length < 2) return;
  ctx.strokeStyle = WEDGE.wire;
  const stride = Math.max(1, Math.round(modes.length / 18));
  if (look.halo > 0) {
    ctx.globalAlpha = look.haloAlpha * alphaScale;
    ctx.lineWidth = look.halo;
    strokeStepped(ctx, modes.map((mode) => shiftPoint(mode.wireCrest, shift)));
    strokePoly(ctx, lidPoints(modes, shift));
  }
  ctx.globalAlpha = WEDGE.wireAlpha * alphaScale;
  ctx.lineWidth = Math.max(1, look.width);
  for (let i = 0; i < modes.length; i += stride) {
    if (i === selected) continue;
    const mode = modes[i];
    line(ctx, shiftPoint(mode.wireBase, shift), shiftPoint(mode.wireCrest, shift));
  }
  const last = modes.length - 1;
  if (last % stride !== 0 && last !== selected) {
    line(ctx, shiftPoint(modes[last].wireBase, shift), shiftPoint(modes[last].wireCrest, shift));
  }
  strokePoly(ctx, modes.map((mode) => shiftPoint(mode.wireBase, shift)));
  strokeStepped(ctx, modes.map((mode) => shiftPoint(mode.wireCrest, shift)));
  const lid = lidPoints(modes, shift);
  if (lid.length > 1) {
    strokePoly(ctx, lid);
    const cap = modes.findLast((mode) => mode.plane);
    line(ctx, shiftPoint(modes[0].wireCrest, shift), lid[0]);
    line(ctx, shiftPoint(cap.wireCrest, shift), lid[lid.length - 1]);
  }
  ctx.lineWidth = 1;
  strokeTipGrid(ctx, scene, shift);
}

function lidPoints(modes, shift) {
  const points = [];
  for (const mode of modes) {
    if (!mode.plane) break;
    points.push(shiftPoint(mode.plane, shift));
  }
  return points;
}

function fillFace(ctx, modes, shift) {
  ctx.beginPath();
  const first = shiftPoint(modes[0].base, shift);
  ctx.moveTo(first.x, first.y);
  for (const mode of modes) {
    const point = shiftPoint(mode.base, shift);
    ctx.lineTo(point.x, point.y);
  }
  for (let i = modes.length - 1; i >= 0; i--) {
    const point = shiftPoint(modes[i].crest, shift);
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  ctx.fill();
}

function strokeStepped(ctx, points) {
  if (points.length < 2) return;
  const step = WEDGE.step;
  ctx.beginPath();
  let x = points[0].x;
  let y = points[0].y;
  ctx.moveTo(x, y);
  for (let i = 1; i < points.length; i++) {
    const nx = Math.round(points[i].x / step) * step;
    const ny = Math.round(points[i].y / step) * step;
    if (nx === x && ny === y) continue;
    ctx.lineTo(nx, y);
    ctx.lineTo(nx, ny);
    x = nx;
    y = ny;
  }
  ctx.stroke();
}

function strokeTipGrid(ctx, scene, shift) {
  const last = scene.modes[scene.modes.length - 1];
  if (!last?.world) return;
  const world = last.world;
  const yMax = Math.max(world.y, WEDGE.amp * WEDGE.tipRise);
  const xNear = world.x - WEDGE.span * WEDGE.tipSpan;
  const ySteps = 4;
  const zSteps = 3;
  const xs = [xNear, world.x];
  for (const x of xs) {
    for (let i = 0; i <= ySteps; i++) {
      const y = yMax * (i / ySteps);
      line(ctx, shiftPoint(scene.project(x, y, world.z0), shift), shiftPoint(scene.project(x, y, world.z1), shift));
    }
    for (let i = 0; i <= zSteps; i++) {
      const z = world.z0 + (world.z1 - world.z0) * (i / zSteps);
      line(ctx, shiftPoint(scene.project(x, 0, z), shift), shiftPoint(scene.project(x, yMax, z), shift));
    }
  }
  for (let i = 0; i <= ySteps; i++) {
    const y = yMax * (i / ySteps);
    line(ctx, shiftPoint(scene.project(xNear, y, world.z1), shift), shiftPoint(scene.project(world.x, y, world.z1), shift));
  }
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

function strokeCap(ctx, mode, shift) {
  const mid = shiftPoint(mode.cap, shift);
  const base = shiftPoint(mode.base, shift);
  const crest = shiftPoint(mode.crest, shift);
  line(ctx, base, crest);
  line(ctx, base, mid);
  line(ctx, mid, crest);
}

function strokePoly(ctx, points) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
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
