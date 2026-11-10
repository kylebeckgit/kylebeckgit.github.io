// Each partial is its own wireframe slice, oblique like Zebra's Partials view.
//
//   x  frequency, evenly spaced, falling down-right at about 32 degrees
//   y  level, screen-vertical, on a compressed dB scale that keeps the first crests tall
//   z  decay time, rising up-right. Long decays leave the comb.
//
// Each slice is three lines. A vertical front in the ink color. An accent
// line beside that bar: the left-hand bars keep a bright accent in the mesh,
// and the right-hand accent sits on its bar so the pair is one stroke. Only
// the two longest decays leave the comb. The fundamental follows the traced
// Zebra centerline: a shallow sag along the crests, then a long rise that
// bows and ends just past the rail. The octave runs under it for about 40%
// of that arc. On the floor, a front rail and a close back rail run the full
// width. Under the first bars, short diagonals cross in both directions
// and blur into a weave. The two tails are accent blended toward the page
// cream, with a wide soft glow. Stroke width tracks the view. A blurred
// pass sits under the sharp strokes.
// Yaw turns frequency and decay around the vertical, so the fronts stay
// vertical. Pitch only changes how steeply decay rises.
//
// Motion lives in aimSlices / sampleSlices. Match by index. A profile change
// eases for MORPH_MS with ease-out. New indices grow from zero height. Indices
// that leave shrink and fade. Detune is not part of that tween: paint applies
// it live, spreading or bunching frequency while height and depth stay put.

export const MORPH_MS = 260;

// Knobs the String 16 picture is tuned with. paintModalView may override
// them for a comparison pass; the defaults are what the page draws.
const TUNE = {
  // Lightness stays at this mix of --fg and --muted. panelCool then pulls
  // the red/blue gap in, so the grey is less warm at the same luminance.
  panelMix: 0.34,
  panelCool: 0.55,
  tailGlow: 0.62,
  octaveGlow: 0.44,
  tailSharp: 0.92,
  octaveSharp: 0.7,
  // Core is accent blended toward the page cream, so the tails stay warm
  // but read as a soft bright pair.
  tailCream: 0.74,
  octaveCream: 0.62,
  // Tip sits just past the right end of the front rail.
  tailReach: 1.04,
  // Left accent is a tint in the mesh, not a separate stroke.
  leftSharp: 0.72,
  leftWidth: 0.85,
  leftGlow: 0.55,
  // Right accent is a tint in the stroke, not a second edge.
  rightSharp: 0.14,
  accentZ: 0,
  accentZLeft: 0.04,
  rungZ: 1.7,
  hatchAlpha: 0.78,
  hatchGlow: 0.36,
};
let activeTune = null;
function tune() {
  return activeTune || TUNE;
}

export const PLANE = {
  // Resting view. The floor run is about five bar-heights long.
  yaw: 0,
  pitch: 0.55,
  focal: 9.5,
  pitchMin: 0.35,
  pitchMax: 0.85,
  span: 2.4,
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
  ribbonZ: 0.14,
  // Floor hatch under bars 1 to about 6. Evenly spaced, and tall enough
  // that the crossings run up through those bars, not only along the floor.
  latticeZ: [0.5, 1.0, 1.5, 2.0],
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
    // A light comb. The old 8% floor turned the right-hand bars into a zigzag.
    return Math.pow(10, db / 20) * (0.74 + 0.26 * weight);
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
  // Linear in the wide window, so the sixteen bars taper smoothly.
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

// Equal steps along the floor, in ratio order. A power of the ratio opens
// a visible gap partway down the comb. Detune still spreads this spacing.
export function spaceByLog(slices) {
  const usable = slices.filter((slice) => slice && Number(slice.ratio) > 0);
  if (usable.length < 2) {
    slices.forEach((slice, index) => { if (slice) slice.t = evenT(index, slices.length); });
    return slices;
  }
  const ordered = [...usable].sort((a, b) => a.ratio - b.ratio);
  ordered.forEach((slice, index) => { slice.t = index / (ordered.length - 1); });
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
  activeTune = { ...TUNE, ...(options.tune || {}) };
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
  const wide = Math.max(2.4, weight * (style === 'eco' ? 0.7 : 1.05));
  const tight = Math.max(1.4, weight * (style === 'eco' ? 0.45 : 0.62));
  const scene = Math.max(3.5, weight * 0.9);
  ctx.save();
  ctx.filter = `blur(${scene}px)`;
  ctx.globalCompositeOperation = palette.bloom;
  drawSlices(ctx, slices, detune, place, camera, look, palette, clock, style, selected, true, weight, 1.15, 0.1, 0.05, 0.08);
  ctx.restore();
  ctx.save();
  ctx.filter = `blur(${wide}px)`;
  ctx.globalCompositeOperation = palette.bloom;
  drawSlices(ctx, slices, detune, place, camera, look, palette, clock, style, selected, true, weight, 1.12, 0.13, 0.06, 0.1);
  ctx.restore();
  ctx.save();
  ctx.filter = `blur(${tight}px)`;
  ctx.globalCompositeOperation = palette.bloom;
  drawSlices(ctx, slices, detune, place, camera, look, palette, clock, style, selected, true, weight, 1.04, 0.1, 0.04, 0.08);
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
  return graphic / 32;
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
  const span = ordered.length > 1 ? ordered[ordered.length - 1].x - ordered[0].x : PLANE.span;
  return {
    anchorX: head.x,
    anchorY: head.y,
    rankOf: (slice) => rank.get(slice) ?? 0,
    crests: ordered.slice(0, 6),
    railRight: ordered.length ? ordered[ordered.length - 1].x : head.x + PLANE.span,
    // Bars 1–6. Same cut the floor hatch uses.
    hatchX: ordered.length ? ordered[0].x + 0.5 * span : head.x,
  };
}

// Floor slope at rest, screen-y down per world-x. Steeper than the old 0.625
// so the comb's run matches the crop, and short enough that the figure is compact.
const FLOOR_SHEAR = 0.74;
const DEPTH_X = 0.78;

function depthRise(pitch = PLANE.pitch) {
  return 0.75 * (0.85 + (pitch - PLANE.pitch) * 1.15);
}

function fromRestScreen(x, sx, sy) {
  const z = (sx - x) / DEPTH_X;
  const y = (-sy) - (x * -FLOOR_SHEAR) - (z * depthRise());
  return { x, y, z };
}

function restScreen(x, y, z) {
  return {
    sx: x + (z * DEPTH_X),
    sy: -(y + (x * -FLOOR_SHEAR) + (z * depthRise())),
  };
}

// Along the crests of bars 1 to 5, nearly straight, then a long straight rise.
// The rounded bowl sat above the bars instead of on them.
function tailSpline(x, y0, crests, railRight, steps) {
  const guides = (crests && crests.length) ? crests : [{ x, y: y0 }];
  const screens = guides.map((crest, index) => (
    index === 0 ? restScreen(x, y0, 0) : restScreen(crest.x, crest.y, 0)
  ));
  const points = [];
  const sagN = Math.max(8, Math.round((steps || 24) * 0.45));
  const lastGuide = screens.length - 1;
  if (lastGuide <= 0) {
    points.push(fromRestScreen(x, screens[0].sx, screens[0].sy));
  } else {
    for (let i = 0; i <= sagN; i++) {
      const t = (i / sagN) * lastGuide;
      const index = Math.min(lastGuide - 1, Math.floor(t));
      const u = t - index;
      const a = screens[index];
      const b = screens[index + 1];
      const sx = a.sx + (b.sx - a.sx) * u;
      const sy = a.sy + (b.sy - a.sy) * u;
      points.push(fromRestScreen(x, sx, sy));
    }
  }
  const last = screens[lastGuide];
  const prev = screens[Math.max(0, lastGuide - 1)];
  const start = screens[0];
  // Shallow rise. The tip sits only a little above bar 1, not a steep climb.
  const riseRad = 18 * Math.PI / 180;
  const tipSy = start.sy - y0 * 0.42;
  const climb = Math.max(0.15, last.sy - tipSy);
  const span = climb / Math.sin(riseRad);
  const arrive = { x: last.sx - prev.sx, y: last.sy - prev.sy };
  const aLen = Math.hypot(arrive.x, arrive.y) || 1;
  const depart = { x: Math.cos(riseRad), y: -Math.sin(riseRad) };
  let sx = last.sx;
  let sy = last.sy;
  const step = span / 26;
  // A circular bend from the crest slope up into the shallow rise.
  let ang = Math.atan2(arrive.y, arrive.x);
  const target = Math.atan2(depart.y, depart.x);
  const arcSteps = 12;
  for (let i = 1; i <= arcSteps; i++) {
    const a = ang + (target - ang) * (i / arcSteps);
    sx += Math.cos(a) * step * 0.55;
    sy += Math.sin(a) * step * 0.55;
    points.push(fromRestScreen(x, sx, sy));
  }
  let guard = 0;
  while (sy > tipSy && guard < 48) {
    sx += depart.x * step;
    sy += depart.y * step;
    points.push(fromRestScreen(x, sx, sy));
    guard += 1;
  }
  return points;
}

function tailWorld(slice, world, maxSeconds, air) {
  const seconds = Math.max(0.05, Number(slice?.seconds) || 0.2);
  const shape = drawShape(seconds, maxSeconds || seconds);
  if (!shape.air) {
    // Left accents stand just off the bar so the mesh reads accent-and-cream.
    // Right accents share the bar's x, so no second edge appears.
    const left = world.x <= (air?.hatchX ?? world.x);
    const z = left ? tune().accentZLeft : tune().accentZ;
    const top = world.y;
    if (!left) {
      return [
        { x: world.x, y: top, z: 0 },
        { x: world.x, y: top * 0.97, z },
        { x: world.x, y: top * 0.02, z },
      ];
    }
    // A shallow curve through the left block, not a second straight edge.
    return [
      { x: world.x, y: top, z: 0 },
      { x: world.x, y: top * 0.68, z: z * 1.35 },
      { x: world.x, y: top * 0.34, z: z * 0.7 },
      { x: world.x, y: top * 0.02, z: z * 0.25 },
    ];
  }
  const rank = air?.rankOf(slice) ?? 0;
  const x = air?.anchorX ?? world.x;
  const y0 = air?.anchorY ?? world.y;
  const full = tailSpline(x, y0, air?.crests, air?.railRight ?? x + PLANE.span, 36);
  if (rank === 0) return full;
  // The octave leaves the fundamental around bar 4–5 and runs below it,
  // parallel and shorter.
  const seen = full.map((point) => restScreen(point.x, point.y, point.z));
  let bottom = 0;
  for (let i = 1; i < seen.length; i++) {
    if (seen[i].sy > seen[bottom].sy) bottom = i;
  }
  const start = Math.max(0, bottom - 4);
  const remain = full.length - start;
  const end = Math.min(full.length, start + Math.max(6, Math.round(remain * (0.46 - (rank - 1) * 0.1))));
  const tuck = 0.09 + (rank - 1) * 0.04;
  return full.slice(start, end).map((point) => ({ x: point.x, y: point.y - tuck, z: point.z }));
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
  return xs[0] + 0.5 * (xs[xs.length - 1] - xs[0]);
}

function drawSlices(ctx, slices, detune, place, camera, look, palette, clock, style, selected, bloom, weight, bulk = 1, alpha = 1, accentAlpha = alpha, hatchAlpha = alpha) {
  const ink = { width: weight * bulk, alpha, halo: 0, haloAlpha: 0 };
  const accent = { width: weight * 0.5 * bulk, alpha: accentAlpha, halo: 0, haloAlpha: 0 };
  // Wide under the blur, a lighter core on the sharp pass. The pair stays soft.
  const tailW = bloom ? weight * (bulk > 1.15 ? 2.7 : 1.7) : weight * 1.55;
  const tail = { width: tailW, alpha: 1, halo: 0, haloAlpha: 0 };
  const octave = { width: tailW * 0.74, alpha: 1, halo: 0, haloAlpha: 0 };
  const rail = { width: weight * 2.6 * bulk, alpha, halo: 0, haloAlpha: 0 };
  // Bloom strokes are wide enough that neighbouring lines share one glow.
  const rungW = bloom ? weight * (bulk > 1.15 ? 1.15 : 0.85) : weight * 0.48;
  const rung = { width: rungW, alpha: bloom ? tune().hatchGlow : tune().hatchAlpha, halo: 0, haloAlpha: 0 };
  const meshTint = mixHex(palette.wire, palette.paper, 0.62);
  const tailColor = mixHex(palette.wire, palette.paper, tune().tailCream);
  const octaveColor = mixHex(palette.wire, palette.paper, tune().octaveCream);
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
    // Inside the first bars, from just under the crests down to the floor.
    // Depth rays ran up-right and stuck out above the crest line.
    for (let i = 0; i < hatched.length; i++) {
      const item = hatched[i];
      const world = worldOf(item.slice, detune);
      const next = hatched[i + 1];
      const nxt = next ? worldOf(next.slice, detune) : null;
      // Several drops inside each bar, all starting below the crest.
      for (const frac of [0.82, 0.55, 0.28]) {
        const top = place(camera, world.x, world.y * frac, 0);
        glow(ctx, [top, item.tri.foot], meshTint, rung, item.slice.alpha);
      }
      if (!nxt) continue;
      const cap = Math.min(world.y, nxt.y);
      const midX = (world.x + nxt.x) / 2;
      glow(ctx, [place(camera, midX, cap * 0.8, 0), place(camera, midX, 0, 0)], meshTint, rung, item.slice.alpha);
      glow(ctx, [place(camera, world.x, cap * 0.78, 0), next.tri.foot], meshTint, rung, item.slice.alpha);
      glow(ctx, [item.tri.foot, place(camera, nxt.x, cap * 0.62, 0)], meshTint, rung, item.slice.alpha);
      const skip = hatched[i + 2];
      if (skip) {
        const far = worldOf(skip.slice, detune);
        const low = Math.min(cap, far.y);
        glow(ctx, [place(camera, world.x, low * 0.7, 0), skip.tri.foot], meshTint, rung, item.slice.alpha);
      }
    }
    for (const item of placed) {
      const world = worldOf(item.slice, detune);
      if (world.x > limit) {
        const far = place(camera, world.x, 0, PLANE.ribbonZ);
        glow(ctx, [item.tri.foot, far], palette.ink, ink, item.slice.alpha);
      }
      glow(ctx, [item.tri.foot, item.tri.crest], palette.ink, ink, item.slice.alpha);
    }
  }
  for (const item of placed) {
    const world = worldOf(item.slice, detune);
    if (item.shape.air) {
      const rank = air.rankOf(item.slice);
      const look = rank === 0 ? tail : octave;
      const strength = bloom
        ? (rank === 0 ? tune().tailGlow : tune().octaveGlow)
        : (rank === 0 ? tune().tailSharp : tune().octaveSharp);
      const color = rank === 0 ? tailColor : octaveColor;
      glow(ctx, item.tri.curve, color, look, strength);
      // The head of each tail is the bar's cream, so the join glows as one stroke.
      const headCount = Math.max(3, Math.round(item.tri.curve.length * 0.18));
      const head = item.tri.curve.slice(0, headCount);
      const join = mixHex(color, palette.ink, 0.8);
      glow(ctx, head, join, { ...look, width: look.width * (bloom ? 1.05 : 1.15) }, bloom ? strength * 0.35 : 1);
      continue;
    }
    const left = world.x <= limit;
    const width = weight * (left ? (bloom ? 0.9 : tune().leftWidth) : 0.5) * (left ? 1 : bulk);
    const strength = left
      ? (bloom ? tune().leftGlow : tune().leftSharp)
      : (bloom ? accentAlpha * 1.8 : tune().rightSharp);
    glow(ctx, item.tri.curve, left ? meshTint : palette.wire, { ...accent, width }, Math.min(1, strength));
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
    x: xr * 1 + zr * DEPTH_X,
    y: y + xr * -FLOOR_SHEAR + zr * 0.75 * rise,
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

function coolHex(hex, amount) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!match || !(amount > 0)) return hex;
  let r = parseInt(match[1].slice(0, 2), 16);
  let g = parseInt(match[1].slice(2, 4), 16);
  let b = parseInt(match[1].slice(4, 6), 16);
  const before = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  const delta = (r - b) * amount * 0.5;
  r -= delta;
  b += delta;
  const after = (0.2126 * r) + (0.7152 * g) + (0.0722 * b) || 1;
  const scale = before / after;
  const channel = (value) => Math.max(0, Math.min(255, Math.round(value * scale))).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function sitePalette(colors, invert = true) {
  const bg = colors?.bg || '#f2ede3';
  const fg = colors?.ink || colors?.fg || '#1f1d1a';
  // --muted is the site's lighter dark. Zebra's panel is a mid grey, not black.
  const muted = colors?.muted || '#6a655c';
  const mixed = mixHex(fg, muted, tune().panelMix);
  const panel = invert ? coolHex(mixed, tune().panelCool) : bg;
  return {
    panel,
    ink: invert ? bg : fg,
    paper: bg,
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
