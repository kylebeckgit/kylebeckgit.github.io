// Perspective view of a modal profile.
// Frequency, level, and relative decay follow the Zebra 3 user guide.
// The camera is far enough that the modes stay nearly vertical, then the
// whole scene is fitted into the canvas so nothing is clipped.

export function defaultCamera() {
  return { yaw: 0.48, pitch: 0.22, distance: 8.5 };
}

const FLOOR = { x: 2.55, z: 0.95 };

export function paintModalView(ctx, partials, options) {
  const { width, height, camera, style = 'fast', colors, selected = -1 } = options;
  const scene = layoutScene(partials, camera || defaultCamera(), width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = colors.bg || colors.card;
  ctx.fillRect(0, 0, width, height);
  const eco = style === 'eco';
  const glow = style === 'glow';
  drawFloor(ctx, scene.project, colors, eco);
  const order = scene.placed.map((item, index) => ({
    item,
    index,
    depth: scene.project(item.x, item.y, item.z).depth,
  }));
  order.sort((a, b) => b.depth - a.depth);
  for (const entry of order) {
    if (entry.index === selected) continue;
    strokePartial(ctx, scene.project, entry.item, colors, glow, false);
  }
  if (selected >= 0 && scene.placed[selected]) {
    strokePartial(ctx, scene.project, scene.placed[selected], colors, glow, true);
  }
  labelAxes(ctx, scene, colors, width, height);
  return scene.feet;
}

export function hitPartial(partials, camera, width, height, x, y) {
  const scene = layoutScene(partials, camera || defaultCamera(), width, height);
  let best = -1;
  let score = 16;
  for (let i = 0; i < scene.placed.length; i++) {
    const item = scene.placed[i];
    const foot = scene.project(item.x, 0, item.z);
    const head = scene.project(item.x, item.y, item.z);
    const distance = distanceToSegment(x, y, foot.x, foot.y, head.x, head.y);
    if (distance < score) {
      score = distance;
      best = i;
    }
  }
  return best;
}

export function layoutScene(partials, camera, width, height) {
  const placed = placePartials(partials);
  const samples = [];
  const maxY = Math.max(0.15, ...placed.map((item) => item.y));
  for (const x of [-FLOOR.x, FLOOR.x]) {
    for (const z of [-FLOOR.z, FLOOR.z]) {
      samples.push(rawProject(x, 0, z, camera));
      samples.push(rawProject(x, maxY, z, camera));
    }
  }
  samples.push(rawProject(0, 0, -FLOOR.z - 0.42, camera));
  samples.push(rawProject(FLOOR.x + 0.5, 0, -FLOOR.z, camera));
  samples.push(rawProject(-FLOOR.x - 0.55, maxY, FLOOR.z, camera));
  for (const item of placed) {
    samples.push(rawProject(item.x, 0, item.z, camera));
    samples.push(rawProject(item.x, item.y, item.z, camera));
  }
  const fit = fitTransform(samples, width, height);
  const project = (x, y, z) => fit(rawProject(x, y, z, camera));
  return {
    placed,
    project,
    feet: placed.map((item) => project(item.x, 0, item.z)),
    ratioOf: (ratio) => {
      const x = ratioToX(ratio, placed.meta);
      return x == null ? null : project(x, 0, -FLOOR.z);
    },
  };
}

function placePartials(partials) {
  const meta = { logMin: 0, logSpan: 1, decayMin: 0, decaySpan: 1 };
  if (!partials.length) return Object.assign([], { meta });
  const logs = [];
  const decays = [];
  for (const partial of partials) {
    logs.push(Math.log2(Math.max(partial.ratio, 1e-3)));
    decays.push(Math.log(Math.max(0.02, Number(partial.decay) || 0.02)));
  }
  meta.logMin = Math.min(...logs);
  meta.logSpan = Math.max(...logs) - meta.logMin || 1;
  meta.decayMin = Math.min(...decays);
  meta.decaySpan = Math.max(...decays) - meta.decayMin || 1;
  const placed = partials.map((partial, index) => {
    const log = logs[index];
    const gain = Math.max(-80, Math.min(0, Number(partial.gainDb) || 0));
    // Pure log2 packs every ratio above about 8 into the last fifth of the floor.
    // The axis stays in log-frequency order; a power above 1 gives the upper
    // octaves enough width to separate, and the same idea opens up short decays.
    const ratioT = Math.pow((log - meta.logMin) / meta.logSpan, 1.65);
    const decayT = Math.pow((decays[index] - meta.decayMin) / meta.decaySpan, 0.55);
    return {
      x: ratioT * (FLOOR.x * 2) - FLOOR.x,
      y: ((gain + 80) / 80) * 0.42,
      z: decayT * (FLOOR.z * 2) - FLOOR.z,
      ratio: partial.ratio,
    };
  });
  placed.meta = meta;
  return placed;
}

function ratioToX(ratio, meta) {
  if (!meta) return null;
  const log = Math.log2(Math.max(ratio, 1e-3));
  const t = (log - meta.logMin) / meta.logSpan;
  if (t < -0.02 || t > 1.02) return null;
  return Math.pow(Math.max(0, Math.min(1, t)), 1.65) * (FLOOR.x * 2) - FLOOR.x;
}

function rawProject(x, y, z, camera) {
  const yaw = camera.yaw;
  const pitch = camera.pitch;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const y2 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  // Long focal length: depth barely changes the scale, so a vertical mode stays upright.
  const focal = 16;
  const persp = focal / (focal + z2 * 0.35);
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
  const marginX = Math.max(36, width * 0.045);
  const marginTop = Math.max(22, height * 0.08);
  const marginBottom = Math.max(26, height * 0.1);
  const spanX = Math.max(0.08, maxX - minX);
  const spanY = Math.max(0.08, maxY - minY);
  const fit = Math.min((width - marginX * 2) / spanX, (height - marginTop - marginBottom) / spanY);
  const zoom = Math.min(fit, Math.max(width, height) * 2.2);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const targetY = marginTop + (height - marginTop - marginBottom) / 2;
  return (sample) => ({
    x: width / 2 + (sample.x - midX) * zoom,
    y: targetY - (sample.y - midY) * zoom,
    depth: sample.depth,
  });
}

function drawFloor(ctx, project, colors, eco) {
  const corners = [
    project(-FLOOR.x, 0, -FLOOR.z),
    project(FLOOR.x, 0, -FLOOR.z),
    project(FLOOR.x, 0, FLOOR.z),
    project(-FLOOR.x, 0, FLOOR.z),
  ];
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fillStyle = colors.card;
  ctx.globalAlpha = eco ? 0.35 : 0.72;
  ctx.fill();
  ctx.globalAlpha = eco ? 0.28 : 0.55;
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1;
  const steps = eco ? 3 : 6;
  for (let i = 0; i <= steps; i++) {
    const x = -FLOOR.x + (FLOOR.x * 2 * i) / steps;
    strokeWorld(ctx, project, x, 0, -FLOOR.z, x, 0, FLOOR.z);
  }
  const depthSteps = eco ? 2 : 4;
  for (let i = 0; i <= depthSteps; i++) {
    const z = -FLOOR.z + (FLOOR.z * 2 * i) / depthSteps;
    strokeWorld(ctx, project, -FLOOR.x, 0, z, FLOOR.x, 0, z);
  }
  ctx.globalAlpha = 1;
}

function strokeWorld(ctx, project, x0, y0, z0, x1, y1, z1) {
  const a = project(x0, y0, z0);
  const b = project(x1, y1, z1);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function strokePartial(ctx, project, item, colors, glow, selected) {
  const foot = project(item.x, 0, item.z);
  const head = project(item.x, item.y, item.z);
  const color = selected || item.y > 0.78 ? colors.accent : colors.ink;
  if (glow) {
    ctx.strokeStyle = colors.accent;
    ctx.globalAlpha = selected ? 0.4 : 0.16;
    ctx.lineWidth = selected ? 7 : 5;
    line(ctx, foot, head);
    ctx.globalAlpha = selected ? 0.65 : 0.32;
    ctx.lineWidth = selected ? 3.5 : 2.4;
    line(ctx, foot, head);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = selected ? 2.4 : 1.2;
  line(ctx, foot, head);
  ctx.lineWidth = 1;
}

function line(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function labelAxes(ctx, scene, colors, width, height) {
  ctx.font = `500 12px ${colors.font}`;
  ctx.textBaseline = 'top';
  const taken = [];
  const ratioAnchor = scene.project(FLOOR.x, 0, -FLOOR.z);
  const decayAnchor = scene.project(-FLOOR.x, 0, FLOOR.z);
  const peak = Math.max(0.2, ...scene.placed.map((item) => item.y));
  const levelAnchor = scene.project(-FLOOR.x - 0.35, peak, FLOOR.z);
  placeLabel(ctx, 'Ratio', ratioAnchor, width, height, taken, colors, 1, 1);
  placeLabel(ctx, 'Decay', decayAnchor, width, height, taken, colors, -1, 1);
  placeLabel(ctx, 'Level', levelAnchor, width, height, taken, colors, -1, -1);
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = colors.muted;
  ctx.font = `500 11px ${colors.font}`;
  const meta = scene.placed.meta;
  if (!meta) return;
  for (const ratio of [0.5, 1, 2, 4, 8, 16, 32]) {
    const x = ratioToX(ratio, meta);
    if (x == null) continue;
    const tick = scene.project(x, 0, -FLOOR.z - 0.22);
    const label = String(ratio);
    const box = { x: tick.x - ctx.measureText(label).width / 2, y: tick.y + 16, w: ctx.measureText(label).width, h: 12 };
    if (box.x < 4 || box.x + box.w > width - 4 || box.y + box.h > height - 2) continue;
    if (taken.some((item) => overlaps(item, box))) continue;
    ctx.fillText(label, box.x, box.y);
    taken.push(box);
  }
  ctx.globalAlpha = 1;
}

function placeLabel(ctx, text, anchor, width, height, taken, colors, preferX, preferY) {
  const w = ctx.measureText(text).width;
  const h = 14;
  const gaps = [10, 18, 28, 40];
  const tries = [];
  for (const gap of gaps) {
    tries.push({ x: anchor.x + preferX * gap - (preferX < 0 ? w : 0), y: anchor.y + preferY * gap });
    tries.push({ x: anchor.x - w / 2, y: anchor.y + preferY * (gap + 6) });
    tries.push({ x: anchor.x + preferX * (gap + w * 0.2) - w / 2, y: anchor.y + 4 });
  }
  let choice = tries[tries.length - 1];
  for (const candidate of tries) {
    const box = { x: candidate.x, y: candidate.y, w, h };
    if (box.x < 4 || box.y < 2 || box.x + box.w > width - 4 || box.y + box.h > height - 4) continue;
    if (taken.some((item) => overlaps(item, box))) continue;
    choice = candidate;
    break;
  }
  const box = {
    x: Math.max(4, Math.min(choice.x, width - w - 4)),
    y: Math.max(2, Math.min(choice.y, height - h - 2)),
    w,
    h,
  };
  ctx.fillStyle = colors.muted;
  ctx.fillText(text, box.x, box.y);
  taken.push(box);
}

function overlaps(a, b) {
  return a.x < b.x + b.w + 6 && a.x + a.w + 6 > b.x && a.y < b.y + b.h + 4 && a.y + a.h + 4 > b.y;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
