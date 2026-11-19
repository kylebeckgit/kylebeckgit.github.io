// Stylized picture of the sounding body. The shape is shaded as an object
// at a fixed angle. The loudest partials bend that surface; a hovered or
// soloed partial is the only bend, in the site accent.
// --accent in src/styles/global.css.
export const ACCENT = '#d4421c';

const SIZE = { tiny: 0.46, small: 0.6, medium: 0.74, large: 0.88, huge: 0.98 };
const CARD = '#fbf8f2';
const MODE_LIMIT = 4;

const TONE = {
  wood: { lit: '#e7c4a4', mid: '#8d5a34', shade: '#5c3a22', rim: '#f3ddc8', kind: 'grain' },
  metal: { lit: '#f7f4ee', mid: '#a7aaa4', shade: '#3c403c', rim: '#ffffff', kind: 'sheen' },
  glass: { lit: '#f7fbff', mid: '#c5d8e2', shade: '#6d8b96', rim: '#ffffff', kind: 'glass' },
  skin: { lit: '#efe0c4', mid: '#c4a574', shade: '#7a5a32', rim: '#f6ead4', kind: 'matte' },
  stone: { lit: '#d4cdc2', mid: '#9a948a', shade: '#4e4a44', rim: '#e4ddd2', kind: 'matte' },
  ceramic: { lit: '#f0c2a8', mid: '#c46a45', shade: '#6e3424', rim: '#f8dccb', kind: 'gloss' },
  ice: { lit: '#ffffff', mid: '#d5e7ef', shade: '#7aa0b0', rim: '#ffffff', kind: 'glass' },
  water: { lit: '#d5e8f2', mid: '#6f93a8', shade: '#2c4a5c', rim: '#f4fbff', kind: 'glass' },
  void: { lit: '#3a332c', mid: '#1c1916', shade: '#0e0d0b', rim: ACCENT, kind: 'void' },
  cardboard: { lit: '#ead7b4', mid: '#c4a06a', shade: '#7a5a32', rim: '#f3e6cc', kind: 'matte' },
  plastic: { lit: '#ffffff', mid: '#d7d2c8', shade: '#6a655c', rim: '#ffffff', kind: 'gloss' },
  air: { lit: '#f4f7f8', mid: '#c5d0d6', shade: '#6a7c86', rim: '#ffffff', kind: 'glass' },
  string: { lit: '#f0e2c4', mid: '#c2a36a', shade: '#5c4324', rim: '#f7edd8', kind: 'grain' },
  rubber: { lit: '#b5b0a8', mid: '#6e6a64', shade: '#2e2c29', rim: '#d4d0c8', kind: 'matte' },
};

export function bodyFamily(body = {}) {
  const shape = String(body.shape || '').toLowerCase();
  const preset = String(body.preset || body.controls?.preset || '').toLowerCase();
  const voice = String(body.voice || body.controls?.voice || '').toLowerCase();
  if (shape === 'cavity' || shape === 'box') return 'box';
  if (shape === 'tube') return 'tube';
  if (shape === 'string') return 'string';
  if (shape === 'membrane') return 'membrane';
  if (shape === 'shell' || shape === 'bowl') return 'shell';
  if (shape === 'plate') return 'plate';
  if (shape === 'bar') return 'bar';
  if (preset === 'open-pipe' || preset === 'closed-pipe') return 'tube';
  if (preset === 'string') return 'string';
  if (preset === 'membrane') return 'membrane';
  if (preset === 'bell' || voice === 'cup' || voice === 'bonsho') return 'shell';
  if (preset === 'plate') return 'plate';
  if (preset === 'bar') return 'bar';
  if (voice === 'abyss' || voice === 'rumble') return 'shell';
  return 'bar';
}

export function materialKey(body = {}) {
  const named = String(body.material || '').toLowerCase();
  if (TONE[named]) return named;
  const voice = String(body.voice || body.controls?.voice || '').toLowerCase();
  if (voice === 'glass' || voice === 'crystal') return 'glass';
  if (voice === 'gong') return 'metal';
  if (voice === 'cup') return 'ceramic';
  if (voice === 'block' || voice === 'marimba') return 'wood';
  if (voice === 'abyss' || voice === 'rumble') return 'void';
  const family = bodyFamily(body);
  if (family === 'membrane') return 'skin';
  if (family === 'string') return 'string';
  if (family === 'box') return 'wood';
  return 'metal';
}

export function materialFinish(key) {
  return (TONE[key] || TONE.metal).kind;
}

// Bar: 1, 2, 3 interior nodes. String and tube: 1, 2, 3 loops.
// Plate and membrane: spokes then another ring. Shell: 2, 3, 4 meridians.
export function modeShape(family, index = 0) {
  const n = Math.max(0, Math.floor(Number(index) || 0));
  if (family === 'bar') return { family: 'bar', nodes: n + 1 };
  if (family === 'string' || family === 'tube') return { family, loops: n + 1 };
  if (family === 'membrane' || family === 'plate') {
    return { family, spokes: n % 4, rings: 1 + Math.floor(n / 4) };
  }
  if (family === 'shell') return { family: 'shell', meridians: 2 + (n % 6) };
  return { family: 'box', panels: 1 + (n % 4) };
}

export function modeDisplacement(family, index, t) {
  const shape = modeShape(family, index);
  const x = Math.max(0, Math.min(1, Number(t) || 0));
  if (family === 'bar') return Math.sin((shape.nodes + 1) * Math.PI * x);
  if (family === 'string' || family === 'tube') return Math.sin(shape.loops * Math.PI * x);
  if (family === 'plate' || family === 'membrane') {
    return shape.spokes ? Math.cos(shape.spokes * x * Math.PI * 2) : Math.sin(shape.rings * Math.PI * x);
  }
  if (family === 'shell') return Math.sin(shape.meridians * Math.PI * x);
  return Math.sin(shape.panels * Math.PI * x);
}

export function modeSamples(family, index, count = 48) {
  const samples = [];
  const n = Math.max(2, count);
  for (let i = 0; i < n; i++) samples.push(modeDisplacement(family, index, i / (n - 1)));
  return samples;
}

function hexToRgb(hex) {
  const h = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function mixHex(a, b, t) {
  const from = hexToRgb(a) || hexToRgb(ACCENT);
  const to = hexToRgb(b) || hexToRgb(CARD);
  const u = Math.max(0, Math.min(1, Number(t) || 0));
  return rgbToHex(
    from[0] + (to[0] - from[0]) * u,
    from[1] + (to[1] - from[1]) * u,
    from[2] + (to[2] - from[2]) * u,
  );
}

// Solo uses the site accent. Other modes use a lighter tint of that same hue.
export function accentTint(accent, hot, card = CARD) {
  const base = hexToRgb(accent) ? String(accent).trim().toLowerCase() : ACCENT;
  if (hot) return base;
  return mixHex(base, hexToRgb(card) ? card : CARD, 0.38);
}

function level(gainDb) {
  return 10 ** (Math.max(-60, Math.min(0, Number(gainDb) || 0)) / 20);
}

export function modeEnvelope(age, decay) {
  if (!(age >= 0)) return 1;
  const t60 = Math.max(0.05, Number(decay) || 0.2);
  return 10 ** (-3 * age / t60);
}

export function shownModes(partials = [], { selected = -1, age = null, limit = MODE_LIMIT } = {}) {
  const list = Array.isArray(partials) ? partials : [];
  const playing = Number.isFinite(age) && age >= 0;
  const rows = list.map((partial, index) => {
    const amp = level(partial?.gainDb);
    const env = playing ? modeEnvelope(age, partial?.decay) : 1;
    return { index, amp, env, weight: amp * env };
  });
  const solo = Number.isInteger(selected) && selected >= 0 && selected < list.length;
  if (solo) return [{ ...rows[selected], hot: true }];
  return rows
    .filter((row) => row.amp > 0.02)
    .sort((a, b) => b.amp - a.amp || a.index - b.index)
    .slice(0, Math.max(1, limit))
    .map((row) => ({ ...row, hot: false }));
}

function rounded(ctx, x, y, w, h, r) {
  const radius = Math.min(Math.max(0, r), Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function faceGradient(ctx, x0, y0, x1, y1, tone, hotTint) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  if (hotTint) {
    g.addColorStop(0, mixHex(hotTint, '#ffffff', 0.28));
    g.addColorStop(0.45, hotTint);
    g.addColorStop(1, mixHex(hotTint, tone.shade, 0.55));
    return g;
  }
  if (tone.kind === 'matte') {
    g.addColorStop(0, mixHex(tone.mid, tone.lit, 0.28));
    g.addColorStop(0.55, tone.mid);
    g.addColorStop(1, tone.shade);
  } else if (tone.kind === 'glass' || tone.kind === 'void') {
    g.addColorStop(0, tone.rim);
    g.addColorStop(0.32, tone.lit);
    g.addColorStop(1, tone.shade);
  } else {
    g.addColorStop(0, tone.lit);
    g.addColorStop(0.38, tone.mid);
    g.addColorStop(1, tone.shade);
  }
  return g;
}

function paintFinish(ctx, tone, unit, across) {
  if (tone.kind === 'grain') {
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = tone.shade;
    ctx.lineWidth = Math.max(1, unit * 0.012);
    const lines = across ? 5 : 4;
    for (let i = 0; i < lines; i++) {
      const t = (i + 1) / (lines + 1);
      ctx.beginPath();
      if (across) {
        ctx.moveTo(-unit, -unit * 0.5 + t * unit);
        ctx.lineTo(unit, -unit * 0.5 + t * unit);
      } else {
        ctx.moveTo(-unit * 0.85 + t * unit * 1.7, -unit);
        ctx.lineTo(-unit * 0.85 + t * unit * 1.7, unit);
      }
      ctx.stroke();
    }
    ctx.restore();
  } else if (tone.kind === 'sheen' || tone.kind === 'gloss') {
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = tone.kind === 'sheen' ? 0.55 : 0.35;
    ctx.fillStyle = tone.rim;
    ctx.beginPath();
    ctx.ellipse(-unit * 0.15, -unit * 0.08, unit * 0.38, unit * 0.05, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function paintObject(ctx, options) {
  const width = options.width;
  const height = options.height;
  const colors = options.colors || {};
  const accent = hexToRgb(colors.accent) ? colors.accent.trim() : ACCENT;
  const card = hexToRgb(colors.card) ? colors.card.trim() : CARD;
  const family = bodyFamily(options.body || {});
  const material = materialKey(options.body || {});
  const tone = TONE[material] || TONE.metal;
  const sizeName = String(options.body?.size || 'medium').toLowerCase();
  const scale = SIZE[sizeName] || SIZE.medium;
  const partials = options.partials || [];
  const selected = Number.isInteger(options.selected) ? options.selected : -1;
  const age = options.age;
  const playing = Number.isFinite(age) && age >= 0;
  const modes = shownModes(partials, { selected, age });
  const solo = modes.length === 1 && modes[0].hot;

  ctx.fillStyle = card;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  const unit = Math.min(width, height) * 0.42 * scale;
  const flare = modes.reduce((sum, mode) => {
    const motion = playing ? Math.sin(phaseOf(mode.index, age)) * mode.env : 1;
    return sum + Math.min(0.08, Math.abs(motion) * mode.amp * 0.05);
  }, 0);

  const motionOf = (mode) => (playing ? Math.sin(phaseOf(mode.index, age)) * mode.env : 1);
  const shift = (familyName, t) => {
    let y = 0;
    for (const mode of modes) {
      const motion = motionOf(mode);
      if (playing && Math.abs(motion) < 0.04) continue;
      const gain = mode.hot ? 1 : 0.55 * mode.amp;
      y += modeDisplacement(familyName, mode.index, t) * motion * gain;
    }
    return y;
  };

  contactShadow(ctx, family, unit, tone.shade);
  drawBody(ctx, family, unit, tone, flare, shift);

  const ordered = [...modes].sort((a, b) => a.amp - b.amp);
  for (const mode of ordered) {
    const motion = motionOf(mode);
    if (playing && Math.abs(motion) < 0.04) continue;
    const bend = motion * (solo ? 1 : 0.45 + mode.amp * 0.4);
    const fade = Math.max(0.08, Math.min(1, Math.abs(motion))) * (mode.hot ? 0.92 : 0.34 + mode.amp * 0.36);
    const tint = accentTint(accent, mode.hot, card);
    ctx.save();
    ctx.globalAlpha = fade;
    drawBend(ctx, family, mode.index, unit, bend, tint, tone, mode.hot);
    ctx.restore();
  }
  ctx.restore();
}

function phaseOf(index, age) {
  return (1.4 + (index % 5) * 0.45) * age * Math.PI * 2;
}

function contactShadow(ctx, family, unit, shade) {
  ctx.save();
  ctx.fillStyle = shade;
  ctx.globalAlpha = 0.14;
  if (family === 'bar' || family === 'string') {
    ctx.beginPath();
    ctx.ellipse(unit * 0.04, unit * 0.34, unit * 0.86, unit * 0.07, 0, 0, Math.PI * 2);
  } else if (family === 'tube') {
    ctx.beginPath();
    ctx.ellipse(unit * 0.04, unit * 1.08, unit * 0.28, unit * 0.07, 0, 0, Math.PI * 2);
  } else if (family === 'shell') {
    ctx.beginPath();
    ctx.ellipse(unit * 0.06, unit * 1.02, unit * 0.7, unit * 0.09, 0, 0, Math.PI * 2);
  } else if (family === 'box') {
    ctx.beginPath();
    ctx.ellipse(unit * 0.1, unit * 0.78, unit * 0.72, unit * 0.08, 0, 0, Math.PI * 2);
  } else {
    ctx.beginPath();
    ctx.ellipse(unit * 0.06, unit * 0.78, unit * 0.72, unit * 0.1, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

function drawBody(ctx, family, unit, tone, flare, shift) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.25, unit * 0.02);
  ctx.strokeStyle = tone.shade;
  const glass = tone.kind === 'glass';
  if (family === 'bar') {
    drawBarSlab(ctx, unit, (t) => -shift('bar', t) * unit * 0.2, tone, null, glass);
  } else if (family === 'string') {
    drawBridge(ctx, -unit * 1.02, unit, tone);
    drawBridge(ctx, unit * 0.94, unit, tone);
    drawStringCord(ctx, unit, (t) => -shift('string', t) * unit * 0.2, tone, null);
  } else if (family === 'membrane' || family === 'plate') {
    drawDisk(ctx, unit, family, (angle) => 1 + shift(family, angle / (Math.PI * 2)) * 0.08, tone, null, glass);
  } else if (family === 'shell') {
    drawShell(ctx, unit, flare, tone, null, glass);
  } else if (family === 'tube') {
    drawTube(ctx, unit, (t) => Math.abs(shift('tube', t)) * unit * 0.08, tone, null, glass);
  } else {
    drawBox(ctx, unit, (t) => shift('box', t) * unit * 0.06, tone, null);
  }
}

function drawBend(ctx, family, index, unit, bend, tint, tone, hot) {
  if (family === 'bar') {
    drawCrest(ctx, unit, (t) => -modeDisplacement('bar', index, t) * unit * 0.26 * bend, tint, hot);
  } else if (family === 'string') {
    drawStringCord(ctx, unit, (t) => -modeDisplacement('string', index, t) * unit * 0.3 * bend, tone, tint);
  } else if (family === 'membrane' || family === 'plate') {
    drawDiskRidges(ctx, unit, family, index, bend, tint);
  } else if (family === 'shell') {
    drawShellRibs(ctx, unit, index, bend, tint);
  } else if (family === 'tube') {
    drawTubeCrest(ctx, unit, index, bend, tint);
  } else {
    drawBox(ctx, unit, (t) => modeDisplacement('box', index, t) * unit * 0.08 * bend, tone, tint);
  }
}

function drawCrest(ctx, unit, yAt, tint, hot) {
  const samples = 32;
  ctx.beginPath();
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const x = -unit + t * unit * 2;
    const y = yAt(t);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(hot ? 4 : 3, unit * (hot ? 0.11 : 0.075));
  ctx.strokeStyle = mixHex(tint, '#3c403c', 0.42);
  ctx.stroke();
  ctx.lineWidth = Math.max(hot ? 2.4 : 1.6, unit * (hot ? 0.07 : 0.042));
  ctx.strokeStyle = tint;
  ctx.stroke();
}

function drawTubeCrest(ctx, unit, index, bend, tint) {
  const samples = 28;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2.4, unit * 0.05);
  ctx.strokeStyle = tint;
  for (const sign of [1, -1]) {
    ctx.beginPath();
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const y = -unit + t * unit * 2;
      const bulge = Math.abs(modeDisplacement('tube', index, t) * bend) * unit * 0.2;
      const x = sign * (unit * 0.26 + bulge);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function ribbon(ctx, pts, half, ox, oy) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + ox, y - half + oy) : ctx.moveTo(x + ox, y - half + oy)));
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0] + ox, pts[i][1] + half + oy);
  ctx.closePath();
}

function drawBarSlab(ctx, unit, yAt, tone, tint, glass) {
  const samples = 28;
  const half = unit * 0.16;
  const depth = unit * 0.055;
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    pts.push([-unit + t * unit * 2, yAt(t)]);
  }
  ribbon(ctx, pts, half, depth, depth);
  ctx.fillStyle = tint ? mixHex(tint, tone.shade, 0.45) : tone.shade;
  ctx.fill();

  ribbon(ctx, pts, half, 0, 0);
  ctx.fillStyle = faceGradient(ctx, 0, -half, 0, half, tone, tint);
  ctx.save();
  if (glass) ctx.globalAlpha *= 0.72;
  ctx.fill();
  ctx.strokeStyle = tint ? mixHex(tint, tone.shade, 0.4) : tone.shade;
  ctx.stroke();
  if (!tint) paintFinish(ctx, tone, unit, false);
  ctx.restore();
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y - half + unit * 0.028) : ctx.moveTo(x, y - half + unit * 0.028)));
  ctx.save();
  ctx.strokeStyle = tint ? mixHex(tint, '#ffffff', 0.35) : tone.rim;
  ctx.globalAlpha *= 0.9;
  ctx.lineWidth = Math.max(1, unit * 0.018);
  ctx.stroke();
  ctx.restore();
}

function drawBridge(ctx, x, unit, tone) {
  ctx.save();
  ctx.translate(x, unit * 0.05);
  rounded(ctx, 0, 0, unit * 0.08, unit * 0.62, unit * 0.02);
  ctx.fillStyle = faceGradient(ctx, 0, 0, unit * 0.08, 0, tone, null);
  ctx.fill();
  ctx.strokeStyle = tone.shade;
  ctx.stroke();
  ctx.restore();
}

function drawStringCord(ctx, unit, yAt, tone, tint) {
  const samples = 32;
  ctx.beginPath();
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const x = -unit + t * unit * 2;
    const y = unit * 0.22 + yAt(t);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2.5, unit * (tint ? 0.055 : 0.04));
  ctx.strokeStyle = tint || tone.shade;
  ctx.stroke();
  ctx.lineWidth = Math.max(1.25, unit * 0.018);
  ctx.strokeStyle = tint ? mixHex(tint, '#ffffff', 0.4) : tone.rim;
  ctx.stroke();
}

function diskRadii(unit, family) {
  return family === 'plate' ? [unit * 0.95, unit * 0.95] : [unit * 1.05, unit * 0.72];
}

function drawDisk(ctx, unit, family, grow, tone, tint, glass) {
  const [rx, ry] = diskRadii(unit, family);
  const steps = 40;
  const trace = (scale) => {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const g = grow(angle);
      const x = Math.cos(angle) * rx * g * scale;
      const y = Math.sin(angle) * ry * g * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  trace(1);
  ctx.save();
  ctx.translate(unit * 0.05, unit * 0.07);
  ctx.fillStyle = tint ? mixHex(tint, tone.shade, 0.5) : tone.shade;
  ctx.fill();
  ctx.restore();
  trace(1);
  ctx.fillStyle = faceGradient(ctx, -rx, -ry, rx * 0.4, ry, tone, tint);
  ctx.save();
  if (glass) ctx.globalAlpha *= 0.7;
  ctx.fill();
  ctx.strokeStyle = tint ? mixHex(tint, tone.shade, 0.4) : tone.shade;
  ctx.stroke();
  if (!tint) paintFinish(ctx, tone, unit, true);
  ctx.restore();
  if (!tint && tone.kind !== 'matte') {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-rx * 0.18, -ry * 0.22, rx * 0.42, ry * 0.16, -0.6, Math.PI * 0.15, Math.PI * 1.15);
    ctx.strokeStyle = tone.rim;
    ctx.globalAlpha *= 0.7;
    ctx.lineWidth = Math.max(1.25, unit * 0.025);
    ctx.stroke();
    ctx.restore();
  }
}

function drawDiskRidges(ctx, unit, family, index, bend, tint) {
  const shape = modeShape(family, index);
  const [rx, ry] = diskRadii(unit, family);
  ctx.strokeStyle = tint;
  ctx.lineWidth = Math.max(1.5, unit * 0.035 * (0.45 + Math.min(1, Math.abs(bend))));
  ctx.lineCap = 'round';
  for (let ring = 1; ring <= shape.rings; ring++) {
    const f = ring / (shape.rings + 0.65);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * f, ry * f, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let spoke = 0; spoke < shape.spokes; spoke++) {
    const angle = (Math.PI * spoke) / shape.spokes + bend * 0.04;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * rx * 0.92, Math.sin(angle) * ry * 0.92);
    ctx.lineTo(-Math.cos(angle) * rx * 0.92, -Math.sin(angle) * ry * 0.92);
    ctx.stroke();
  }
}

function traceShell(ctx, unit, flare) {
  const w = 1 + flare;
  ctx.beginPath();
  ctx.moveTo(-unit * 0.72 * w, -unit * 0.15);
  ctx.quadraticCurveTo(-unit * 0.98 * w, unit * 0.82, 0, unit * 0.96);
  ctx.quadraticCurveTo(unit * 0.98 * w, unit * 0.82, unit * 0.72 * w, -unit * 0.15);
  ctx.quadraticCurveTo(0, -unit * 0.5, -unit * 0.72 * w, -unit * 0.15);
  ctx.closePath();
}

function drawShell(ctx, unit, flare, tone, tint, glass) {
  ctx.save();
  ctx.translate(unit * 0.05, unit * 0.07);
  traceShell(ctx, unit, flare);
  ctx.fillStyle = tint ? mixHex(tint, tone.shade, 0.5) : tone.shade;
  ctx.fill();
  ctx.restore();
  traceShell(ctx, unit, flare);
  ctx.fillStyle = faceGradient(ctx, 0, -unit * 0.4, 0, unit, tone, tint);
  ctx.save();
  if (glass) ctx.globalAlpha *= 0.74;
  ctx.fill();
  ctx.strokeStyle = tone.shade;
  ctx.stroke();
  if (!tint) paintFinish(ctx, tone, unit, true);
  ctx.restore();
  const lip = unit * (0.72 + flare * 0.4);
  ctx.beginPath();
  ctx.ellipse(0, -unit * 0.15, lip, unit * 0.18, 0, 0, Math.PI * 2);
  ctx.fillStyle = tint ? mixHex(tint, tone.shade, 0.35) : tone.shade;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -unit * 0.15, lip * 0.78, unit * 0.11, 0, 0, Math.PI * 2);
  ctx.fillStyle = mixHex(tone.shade, '#1f1d1a', 0.35);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -unit * 0.17, lip * 0.92, unit * 0.08, 0, Math.PI, Math.PI * 2);
  ctx.strokeStyle = tint ? mixHex(tint, '#ffffff', 0.35) : tone.rim;
  ctx.lineWidth = Math.max(1.25, unit * 0.02);
  ctx.stroke();
}

function drawShellRibs(ctx, unit, index, bend, tint) {
  const meridians = modeShape('shell', index).meridians;
  const push = unit * 0.05 * bend;
  ctx.save();
  traceShell(ctx, unit, 0);
  ctx.clip();
  ctx.lineCap = 'round';
  for (let i = 0; i < meridians; i++) {
    const side = (i / (meridians - 1 || 1) - 0.5) * 2;
    const x = side * unit * 0.5 + push * (0.35 + Math.abs(side));
    ctx.beginPath();
    ctx.moveTo(x * 0.42, -unit * 0.12);
    ctx.quadraticCurveTo(x * 1.15, unit * 0.28, x * 0.22, unit * 0.78);
    ctx.lineWidth = Math.max(2, unit * 0.055);
    ctx.strokeStyle = tint;
    ctx.stroke();
    ctx.lineWidth = Math.max(1, unit * 0.016);
    ctx.strokeStyle = mixHex(tint, '#ffffff', 0.45);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTube(ctx, unit, extra, tone, tint, glass) {
  const samples = 26;
  const trace = (shift) => {
    ctx.beginPath();
    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1);
      const y = -unit + t * unit * 2;
      const x = unit * 0.26 + extra(t);
      if (i === 0) ctx.moveTo(x + shift, y + shift);
      else ctx.lineTo(x + shift, y + shift);
    }
    for (let i = samples - 1; i >= 0; i--) {
      const t = i / (samples - 1);
      const y = -unit + t * unit * 2;
      ctx.lineTo(-(unit * 0.26 + extra(t)) + shift, y + shift);
    }
    ctx.closePath();
  };
  const depth = unit * 0.05;
  trace(depth);
  ctx.fillStyle = tint ? mixHex(tint, tone.shade, 0.5) : tone.shade;
  ctx.fill();
  trace(0);
  ctx.fillStyle = faceGradient(ctx, -unit * 0.3, 0, unit * 0.3, 0, tone, tint);
  ctx.save();
  if (glass) ctx.globalAlpha *= 0.72;
  ctx.fill();
  ctx.strokeStyle = tint ? mixHex(tint, tone.shade, 0.35) : tone.shade;
  ctx.stroke();
  if (!tint && tone.kind === 'sheen') {
    ctx.beginPath();
    ctx.moveTo(-unit * 0.1, -unit * 0.82);
    ctx.lineTo(-unit * 0.1, unit * 0.82);
    ctx.strokeStyle = tone.rim;
    ctx.globalAlpha *= 0.65;
    ctx.lineWidth = Math.max(1.5, unit * 0.03);
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(0, -unit, unit * 0.26, unit * 0.09, 0, 0, Math.PI * 2);
  ctx.fillStyle = tint ? mixHex(tint, tone.lit, 0.4) : tone.lit;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -unit, unit * 0.16, unit * 0.05, 0, 0, Math.PI * 2);
  ctx.fillStyle = tone.shade;
  ctx.fill();
  ctx.strokeStyle = tint ? mixHex(tint, '#ffffff', 0.3) : tone.rim;
  ctx.lineWidth = Math.max(1, unit * 0.015);
  ctx.beginPath();
  ctx.ellipse(0, -unit * 1.01, unit * 0.22, unit * 0.045, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
}

function drawBox(ctx, unit, bow, tone, tint) {
  ctx.beginPath();
  ctx.moveTo(-unit * 0.7, -unit * 0.15 + bow(0));
  ctx.lineTo(-unit * 0.12, -unit * 0.55);
  ctx.lineTo(unit * 0.18, -unit * 0.55);
  ctx.lineTo(unit * 0.9, -unit * 0.15 + bow(1));
  ctx.closePath();
  ctx.fillStyle = tint ? mixHex(tint, tone.lit, 0.35) : tone.lit;
  ctx.fill();
  ctx.strokeStyle = tone.shade;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(unit * 0.18, -unit * 0.55);
  ctx.lineTo(unit * 0.9, -unit * 0.15);
  ctx.lineTo(unit * 0.9, unit * 0.7);
  ctx.lineTo(unit * 0.18, unit * 0.35);
  ctx.closePath();
  ctx.fillStyle = tone.shade;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-unit * 0.7, -unit * 0.15);
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ctx.lineTo(-unit * 0.7 + t * unit * 1.6, -unit * 0.15 + bow(t) * 0.25);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    ctx.lineTo(-unit * 0.7 + t * unit * 1.6, unit * 0.7 + bow(t));
  }
  ctx.closePath();
  ctx.fillStyle = faceGradient(ctx, -unit * 0.7, -unit * 0.15, unit * 0.9, unit * 0.7, tone, tint);
  ctx.fill();
  ctx.stroke();
  if (!tint) {
    ctx.save();
    ctx.clip();
    paintFinish(ctx, tone, unit, true);
    ctx.restore();
  }
}
