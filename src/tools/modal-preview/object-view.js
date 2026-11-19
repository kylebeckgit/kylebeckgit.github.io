// Stylized picture of the sounding body. Mode lines follow the textbook
// family for that shape. The partials the ear hears are the ones drawn.

const SIZE = { tiny: 0.46, small: 0.6, medium: 0.74, large: 0.88, huge: 0.98 };

const SHADES = {
  wood: ['#8d5a34', '#5c3a22', '#e7b89a'],
  metal: ['#8e928c', '#3c403c', '#f4f1ea'],
  glass: ['#d5e3ea', '#6d8b96', '#f7fbff'],
  skin: ['#c4a574', '#7a5a32', '#efe0c4'],
  stone: ['#9a948a', '#4e4a44', '#d9d3c8'],
  ceramic: ['#c46a45', '#6e3424', '#f0c2a8'],
  ice: ['#d5e7ef', '#7aa0b0', '#ffffff'],
  water: ['#6f93a8', '#2c4a5c', '#d5e8f2'],
  void: ['#1c1916', '#d4421c', '#3a332c'],
  cardboard: ['#c4a06a', '#7a5a32', '#ead7b4'],
  plastic: ['#d7d2c8', '#6a655c', '#ffffff'],
  air: ['#c5d0d6', '#6a7c86', '#f4f7f8'],
  string: ['#c2a36a', '#5c4324', '#f0e2c4'],
  rubber: ['#6e6a64', '#2e2c29', '#b5b0a8'],
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
  if (SHADES[named]) return named;
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

export function modeSamples(family, index, count = 48) {
  const shape = modeShape(family, index);
  const samples = [];
  for (let i = 0; i < count; i++) {
    const x = i / (count - 1);
    let y = 0;
    if (family === 'bar') y = Math.sin((shape.nodes + 1) * Math.PI * x);
    else if (family === 'string' || family === 'tube') y = Math.sin(shape.loops * Math.PI * x);
    else y = Math.sin((index + 1) * Math.PI * x);
    samples.push(y);
  }
  return samples;
}

function shadeOf(key, accent) {
  return SHADES[key] || [accent, '#3c403c', '#f4f1ea'];
}

function level(gainDb) {
  return 10 ** (Math.max(-60, Math.min(0, Number(gainDb) || 0)) / 20);
}

function envelope(age, decay) {
  if (!(age >= 0)) return 1;
  const t60 = Math.max(0.05, Number(decay) || 0.2);
  return 10 ** (-3 * age / t60);
}

function rounded(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function paintObject(ctx, options) {
  const width = options.width;
  const height = options.height;
  const colors = options.colors || {};
  const accent = colors.accent || '#d4421c';
  const ink = colors.ink || '#1f1d1a';
  const card = colors.card || '#fbf8f2';
  const family = bodyFamily(options.body || {});
  const material = materialKey(options.body || {});
  const [fill, edge, sheen] = shadeOf(material, accent);
  const sizeName = String(options.body?.size || 'medium').toLowerCase();
  const scale = SIZE[sizeName] || SIZE.medium;
  const partials = options.partials || [];
  const selected = Number.isInteger(options.selected) ? options.selected : -1;
  const age = options.age;
  const playing = Number.isFinite(age) && age >= 0;

  ctx.fillStyle = card;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  const unit = Math.min(width, height) * 0.42 * scale;
  drawBody(ctx, family, unit, fill, edge, sheen, accent);

  const shown = partials
    .map((partial, index) => ({ partial, index, amp: level(partial.gainDb) }))
    .sort((a, b) => b.amp - a.amp)
    .slice(0, 12);
  if (selected >= 0 && selected < partials.length && !shown.some((row) => row.index === selected)) {
    shown.push({ partial: partials[selected], index: selected, amp: level(partials[selected].gainDb) });
  }
  for (const row of shown) {
    const live = playing ? envelope(age, row.partial.decay) : (row.index === selected ? 1 : 0);
    if (live < 0.02 && row.index !== selected) continue;
    const phase = playing ? Math.sin((1.4 + (row.index % 5) * 0.45) * age * Math.PI * 2) : 1;
    drawMode(ctx, family, row.index, unit, phase * live * (0.35 + row.amp), row.index === selected, accent, ink);
  }
  ctx.restore();
}

function drawBody(ctx, family, unit, fill, edge, sheen, accent) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.5, unit * 0.035);
  ctx.strokeStyle = edge;
  ctx.fillStyle = fill;
  if (family === 'bar') {
    rounded(ctx, -unit, -unit * 0.16, unit * 2, unit * 0.32, unit * 0.08);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = sheen;
    rounded(ctx, -unit * 0.92, -unit * 0.1, unit * 1.5, unit * 0.06, unit * 0.03);
    ctx.fill();
  } else if (family === 'string') {
    ctx.fillStyle = edge;
    rounded(ctx, -unit * 1.05, -unit * 0.08, unit * 0.08, unit * 0.7, 2);
    ctx.fill();
    rounded(ctx, unit * 0.97, -unit * 0.08, unit * 0.08, unit * 0.7, 2);
    ctx.fill();
    ctx.strokeStyle = fill;
    ctx.lineWidth = Math.max(2, unit * 0.04);
    ctx.beginPath();
    ctx.moveTo(-unit, unit * 0.22);
    ctx.lineTo(unit, unit * 0.22);
    ctx.stroke();
  } else if (family === 'membrane' || family === 'plate') {
    ctx.beginPath();
    ctx.ellipse(0, 0, unit * (family === 'plate' ? 0.95 : 1.05), unit * (family === 'plate' ? 0.95 : 0.72), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = sheen;
    ctx.lineWidth = Math.max(1, unit * 0.02);
    ctx.beginPath();
    ctx.ellipse(-unit * 0.08, -unit * 0.08, unit * 0.55, unit * 0.28, -0.4, 0, Math.PI * 2);
    ctx.stroke();
  } else if (family === 'shell') {
    ctx.beginPath();
    ctx.moveTo(-unit * 0.72, -unit * 0.15);
    ctx.quadraticCurveTo(-unit * 0.95, unit * 0.85, 0, unit * 0.95);
    ctx.quadraticCurveTo(unit * 0.95, unit * 0.85, unit * 0.72, -unit * 0.15);
    ctx.quadraticCurveTo(0, -unit * 0.45, -unit * 0.72, -unit * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -unit * 0.15, unit * 0.72, unit * 0.18, 0, 0, Math.PI * 2);
    ctx.fillStyle = sheen;
    ctx.fill();
    ctx.stroke();
  } else if (family === 'tube') {
    rounded(ctx, -unit * 0.22, -unit, unit * 0.44, unit * 2, unit * 0.18);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.ellipse(0, -unit, unit * 0.22, unit * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-unit * 0.7, -unit * 0.15);
    ctx.lineTo(unit * 0.15, -unit * 0.55);
    ctx.lineTo(unit * 0.9, -unit * 0.15);
    ctx.lineTo(unit * 0.9, unit * 0.7);
    ctx.lineTo(-unit * 0.7, unit * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-unit * 0.7, -unit * 0.15);
    ctx.lineTo(-unit * 0.15, -unit * 0.55);
    ctx.lineTo(unit * 0.15, -unit * 0.55);
    ctx.lineTo(unit * 0.9, -unit * 0.15);
    ctx.closePath();
    ctx.fillStyle = sheen;
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(unit * 0.15, -unit * 0.55);
    ctx.lineTo(unit * 0.15, unit * 0.35);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawMode(ctx, family, index, unit, amount, hot, accent, ink) {
  ctx.save();
  ctx.strokeStyle = hot ? accent : ink;
  ctx.fillStyle = hot ? accent : ink;
  ctx.globalAlpha = hot ? 0.95 : 0.55;
  ctx.lineWidth = hot ? Math.max(2.25, unit * 0.045) : Math.max(1.25, unit * 0.028);
  const amp = unit * 0.22 * amount;
  if (family === 'bar' || family === 'string') {
    const y0 = family === 'string' ? unit * 0.22 : 0;
    const samples = modeSamples(family, index, 40);
    ctx.beginPath();
    samples.forEach((y, i) => {
      const x = -unit + (i / (samples.length - 1)) * unit * 2;
      const py = y0 - y * amp;
      if (i === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    });
    ctx.stroke();
  } else if (family === 'tube') {
    const samples = modeSamples('tube', index, 36);
    const edge = (y) => unit * 0.22 + Math.abs(y) * amp * 0.7;
    ctx.beginPath();
    samples.forEach((y, i) => {
      const py = -unit + (i / (samples.length - 1)) * unit * 2;
      const x = edge(y);
      if (i === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    });
    for (let i = samples.length - 1; i >= 0; i--) {
      const py = -unit + (i / (samples.length - 1)) * unit * 2;
      ctx.lineTo(-edge(samples[i]), py);
    }
    ctx.closePath();
    const fade = ctx.globalAlpha;
    ctx.globalAlpha = fade * 0.28;
    ctx.fill();
    ctx.globalAlpha = fade;
    ctx.stroke();
  } else if (family === 'membrane' || family === 'plate') {
    const shape = modeShape(family, index);
    const rx = unit * (family === 'plate' ? 0.95 : 1.05);
    const ry = unit * (family === 'plate' ? 0.95 : 0.72);
    for (let ring = 1; ring <= shape.rings; ring++) {
      const grow = 1 + amount * 0.08 * Math.sin(ring);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * ring / (shape.rings + 0.4) * grow, ry * ring / (shape.rings + 0.4) * grow, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let spoke = 0; spoke < shape.spokes; spoke++) {
      const angle = (Math.PI * spoke) / shape.spokes;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * rx, Math.sin(angle) * ry);
      ctx.lineTo(-Math.cos(angle) * rx, -Math.sin(angle) * ry);
      ctx.stroke();
    }
  } else if (family === 'shell') {
    const meridians = modeShape('shell', index).meridians;
    for (let i = 0; i < meridians; i++) {
      const side = (i / meridians - 0.5) * 2;
      const x = side * unit * 0.62 * (1 + amount * 0.15);
      ctx.beginPath();
      ctx.moveTo(x * 0.35, -unit * 0.2);
      ctx.quadraticCurveTo(x, unit * 0.2, x * 0.2, unit * 0.82);
      ctx.stroke();
    }
  } else {
    const panels = modeShape('box', index).panels;
    for (let i = 0; i < panels; i++) {
      const y = -unit * 0.05 + i * unit * 0.22;
      ctx.beginPath();
      ctx.moveTo(-unit * 0.62, y + amount * unit * 0.04);
      ctx.lineTo(unit * 0.8, y - amount * unit * 0.04);
      ctx.stroke();
    }
  }
  ctx.restore();
}
