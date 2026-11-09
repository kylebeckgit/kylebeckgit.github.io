// Perspective view of a modal profile.
// Axes follow the Zebra 3 user guide: frequency, amplitude, and relative decay.
// This is our own projection in the site palette, not a copy of u-he's artwork.

export function defaultCamera() {
  return { yaw: 0.42, pitch: 0.46, distance: 2.45 };
}

export function paintModalView(ctx, partials, options) {
  const { width, height, camera, style = 'fast', colors, selected = -1 } = options;
  const cam = camera || defaultCamera();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = colors.card;
  ctx.fillRect(0, 0, width, height);
  const placed = placePartials(partials);
  const project = (x, y, z) => projectPoint(x, y, z, cam, width, height);
  const eco = style === 'eco';
  const glow = style === 'glow';
  drawFloor(ctx, project, colors, eco);
  const order = placed.map((item, index) => ({ item, index, depth: project(item.x, item.y, item.z).depth }));
  order.sort((a, b) => b.depth - a.depth);
  for (const entry of order) {
    if (entry.index === selected) continue;
    strokePartial(ctx, project, entry.item, colors, glow, false);
  }
  if (selected >= 0 && placed[selected]) strokePartial(ctx, project, placed[selected], colors, glow, true);
  labelAxes(ctx, project, colors, width);
  return placed.map((item) => project(item.x, 0, item.z));
}

export function hitPartial(partials, camera, width, height, x, y) {
  const placed = placePartials(partials);
  const project = (px, py, pz) => projectPoint(px, py, pz, camera, width, height);
  let best = -1;
  let score = 18;
  for (let i = 0; i < placed.length; i++) {
    const foot = project(placed[i].x, 0, placed[i].z);
    const head = project(placed[i].x, placed[i].y, placed[i].z);
    const distance = distanceToSegment(x, y, foot.x, foot.y, head.x, head.y);
    if (distance < score) {
      score = distance;
      best = i;
    }
  }
  return best;
}

function placePartials(partials) {
  if (!partials.length) return [];
  let min = Infinity;
  let max = -Infinity;
  let decayMin = Infinity;
  let decayMax = -Infinity;
  for (const partial of partials) {
    const log = Math.log(Math.max(partial.ratio, 1e-4));
    const decay = Math.max(0, Number(partial.decay) || 0);
    if (log < min) min = log;
    if (log > max) max = log;
    if (decay < decayMin) decayMin = decay;
    if (decay > decayMax) decayMax = decay;
  }
  const span = max - min || 1;
  const decaySpan = decayMax - decayMin;
  return partials.map((partial) => {
    const log = Math.log(Math.max(partial.ratio, 1e-4));
    const gain = Math.max(-80, Math.min(0, Number(partial.gainDb) || 0));
    const decay = Math.max(0, Number(partial.decay) || 0);
    const depth = decaySpan > 0.05 ? (decay - decayMin) / decaySpan : 0.5;
    return {
      x: ((log - min) / span) * 2.2 - 1.1,
      y: ((gain + 80) / 80) * 1.15,
      z: depth * 1.7 - 0.85,
    };
  });
}

function projectPoint(x, y, z, camera, width, height) {
  const cy = Math.cos(camera.yaw);
  const sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch);
  const sp = Math.sin(camera.pitch);
  const eyeX = sy * cp * camera.distance;
  const eyeY = sp * camera.distance;
  const eyeZ = cy * cp * camera.distance;
  const forwardX = -eyeX / camera.distance;
  const forwardY = -eyeY / camera.distance;
  const forwardZ = -eyeZ / camera.distance;
  const rightX = -forwardZ;
  const rightZ = forwardX;
  const rightLen = Math.hypot(rightX, rightZ) || 1;
  const rx = rightX / rightLen;
  const rz = rightZ / rightLen;
  const upX = -rz * forwardY;
  const upY = rz * forwardX - rx * forwardZ;
  const upZ = rx * forwardY;
  const dx = x - eyeX;
  const dy = y - eyeY;
  const dz = z - eyeZ;
  const depth = dx * forwardX + dy * forwardY + dz * forwardZ;
  const sx = dx * rx + dz * rz;
  const syv = dx * upX + dy * upY + dz * upZ;
  const scale = (height * 0.92) / Math.max(0.25, depth);
  return {
    x: width / 2 + sx * scale,
    y: height * 0.64 - syv * scale,
    depth,
  };
}

function drawFloor(ctx, project, colors, eco) {
  const corners = [
    project(-1.15, 0, -0.95),
    project(1.15, 0, -0.95),
    project(1.15, 0, 0.95),
    project(-1.15, 0, 0.95),
  ];
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fillStyle = colors.line;
  ctx.globalAlpha = eco ? 0.12 : 0.28;
  ctx.fill();
  ctx.globalAlpha = eco ? 0.35 : 0.7;
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1;
  const steps = eco ? 3 : 6;
  for (let i = 0; i <= steps; i++) {
    const x = -1.15 + (2.3 * i) / steps;
    const a = project(x, 0, -0.95);
    const b = project(x, 0, 0.95);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  const depthSteps = eco ? 2 : 4;
  for (let i = 0; i <= depthSteps; i++) {
    const z = -0.95 + (1.9 * i) / depthSteps;
    const a = project(-1.15, 0, z);
    const b = project(1.15, 0, z);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function strokePartial(ctx, project, item, colors, glow, selected) {
  const foot = project(item.x, 0, item.z);
  const head = project(item.x, item.y, item.z);
  const color = selected ? colors.accent : item.y > 0.72 ? colors.accent : colors.ink;
  if (glow) {
    ctx.strokeStyle = colors.accent;
    ctx.globalAlpha = selected ? 0.45 : 0.18;
    ctx.lineWidth = selected ? 7 : 5;
    line(ctx, foot, head);
    ctx.globalAlpha = selected ? 0.7 : 0.35;
    ctx.lineWidth = selected ? 3.5 : 2.5;
    line(ctx, foot, head);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = selected ? 2.4 : 1.25;
  line(ctx, foot, head);
  ctx.lineWidth = 1;
}

function line(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function labelAxes(ctx, project, colors, width) {
  const ratio = project(1.15, 0, -0.95);
  const decay = project(-1.15, 0, 0.95);
  const level = project(-1.15, 1.05, -0.95);
  ctx.fillStyle = colors.muted;
  ctx.font = `500 12px ${colors.font}`;
  ctx.textBaseline = 'top';
  ctx.fillText('Ratio', Math.min(width - 48, ratio.x), ratio.y + 4);
  ctx.fillText('Decay', Math.max(8, decay.x - 36), decay.y + 4);
  ctx.fillText('Level', Math.max(8, level.x), Math.max(4, level.y - 16));
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
