// Stylized picture of the sounding body. The shape is shaded as an object
// at a fixed angle. The loudest partials bend that surface; a hovered or
// soloed partial is the only bend, in the site accent.
// --accent in src/styles/global.css.
export const ACCENT = '#d4421c';

// How far each body reaches from center, in units, including its shadow.
const REACH = {
  bar: { x: 1.02, y: 0.36, span: 2.02 },
  string: { x: 1.12, y: 0.82, span: 2.24 },
  plate: { x: 1.02, y: 1.06, span: 2.05 },
  membrane: { x: 1.12, y: 0.85, span: 2.1 },
  shell: { x: 0.82, y: 0.86, span: 1.62 },
  flared: { x: 0.82, y: 0.86, span: 1.62 },
  bowl: { x: 0.85, y: 0.72, span: 1.66 },
  tube: { x: 0.4, y: 1.08, span: 2.14 },
  box: { x: 0.95, y: 0.85, span: 1.9 },
  cowbell: { x: 0.53, y: 0.67, span: 1.27 },
  handpan: { x: 0.77, y: 0.36, span: 1.53 },
  disc: { x: 0.93, y: 1.07, span: 1.9 },
  goblet: { x: 0.52, y: 0.6, span: 1.2 },
};
// Fraction of the stage's shorter side the body should occupy, shadow included.
const FILL = { tiny: 0.75, small: 0.78, medium: 0.8, large: 0.83, huge: 0.85 };
const CARD = '#fbf8f2';
const MODE_LIMIT = 3;
const BAND = 0.038;

const TONE = {
  wood: { lit: '#e8c39a', mid: '#8d5a34', shade: '#4a2e18', rim: '#f4e0c8', kind: 'grain' },
  metal: { lit: '#f4f1ea', mid: '#9aa09a', shade: '#2c302c', rim: '#ffffff', kind: 'sheen' },
  glass: { lit: '#f7fbff', mid: '#d7e7ee', shade: '#6d8b96', rim: '#ffffff', kind: 'glass' },
  skin: { lit: '#efe0c4', mid: '#c4a574', shade: '#7a5a32', rim: '#f6ead4', kind: 'matte' },
  stone: { lit: '#b7b1a6', mid: '#7a746c', shade: '#3a3632', rim: '#d4cec4', kind: 'matte', speckle: true },
  ceramic: { lit: '#f0c2a8', mid: '#c46a45', shade: '#6e3424', rim: '#f8dccb', kind: 'gloss' },
  ice: { lit: '#ffffff', mid: '#d5e7ef', shade: '#7aa0b0', rim: '#ffffff', kind: 'glass' },
  water: { lit: '#d5e8f2', mid: '#6f93a8', shade: '#2c4a5c', rim: '#f4fbff', kind: 'glass' },
  void: { lit: '#3a332c', mid: '#1c1916', shade: '#0e0d0b', rim: ACCENT, kind: 'void' },
  cardboard: { lit: '#ead7b4', mid: '#c4a06a', shade: '#7a5a32', rim: '#f3e6cc', kind: 'matte' },
  plastic: { lit: '#f7f4ef', mid: '#d5cfc4', shade: '#6e685f', rim: '#ffffff', kind: 'gloss' },
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

export function objectUnit(width, height, family = 'bar', size = 'medium') {
  const key = REACH[family] ? family : (FIT_ALIAS[family] || 'bar');
  const reach = REACH[key] || REACH.bar;
  const name = String(size || 'medium').toLowerCase();
  const fill = FILL[name] || FILL.medium;
  const span = reach.span || 2 * Math.max(reach.x, reach.y);
  const limit = Math.min(width, height);
  const fitted = (fill * limit) / span;
  const capW = (width * 0.92) / (2 * reach.x);
  const capH = (height * 0.92) / (2 * reach.y);
  return Math.min(fitted, capW, capH);
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
  if (family === 'shell') {
    const patterns = [
      { meridians: 2, circles: 0 },
      { meridians: 2, circles: 1 },
      { meridians: 3, circles: 1 },
      { meridians: 3, circles: 2 },
      { meridians: 4, circles: 1 },
    ];
    return { family: 'shell', ...patterns[n % patterns.length] };
  }
  return { family: 'box', panels: 1 + (n % 4) };
}

const FIT_ALIAS = { flared: 'shell', bowl: 'shell', cowbell: 'box', disc: 'plate', handpan: 'shell' };

export function shellKind(body = {}) {
  const name = `${body.name || ''} ${body.objectName || ''}`.toLowerCase();
  const shape = String(body.shape || '').toLowerCase();
  const voice = String(body.voice || body.controls?.voice || '').toLowerCase();
  const text = `${name} ${shape} ${voice}`;
  if (/wine\s*glass|wineglass|\bgoblet\b/.test(text)) return 'goblet';
  if (/handpan|\bhang\b/.test(text)) return 'handpan';
  if (/gong|cymbal|tam-tam|tam tam/.test(text) || voice === 'gong') return 'disc';
  if (/cowbell/.test(text)) return 'cowbell';
  if (/singing bowl|\bbowl\b/.test(text) || shape === 'bowl') return 'bowl';
  if (/church|hand bell|prayer|bonsho|carillon|tower|\bbell\b/.test(text) || voice === 'bonsho' || voice === 'cup') return 'flared';
  if (bodyFamily(body) === 'shell') return 'flared';
  return '';
}

export function drawKind(body = {}) {
  return shellKind(body) || bodyFamily(body);
}

const MATERIAL_LABEL = {
  wood: 'Wood', metal: 'Metal', glass: 'Glass', skin: 'Skin', stone: 'Stone',
  ceramic: 'Ceramic', ice: 'Ice', water: 'Water', void: 'Void', cardboard: 'Cardboard',
  plastic: 'Plastic', air: 'Air', string: 'String', rubber: 'Rubber',
};

const KIND_LABEL = {
  flared: 'shell', bowl: 'bowl', cowbell: 'bell', disc: 'disc', handpan: 'handpan', goblet: 'goblet',
  bar: 'bar', plate: 'plate', membrane: 'membrane', tube: 'tube', string: 'string', box: 'box', shell: 'shell',
};

export function objectCaption(body = {}, { selected = -1, count = 0 } = {}) {
  if (!Number.isInteger(selected) || selected < 0 || count < 1) return '';
  const material = MATERIAL_LABEL[materialKey(body)] || 'Metal';
  const word = KIND_LABEL[drawKind(body)] || 'body';
  return `${material} ${word}, mode ${selected + 1} of ${count}`;
}

export function bodySignature(body = {}, partials = []) {
  const head = (partials || []).slice(0, 3).map((partial) => Math.round((Number(partial?.ratio) || 0) * 100)).join('.');
  return `${materialKey(body)}|${drawKind(body)}|${body.size || ''}|${head}`;
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

function paintSurface(ctx, tone, unit, across, sheen) {
  ctx.save();
  ctx.clip();
  if (tone.kind === 'grain') {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = tone.shade;
    ctx.lineWidth = Math.max(1, unit * 0.012);
    const lines = across ? 5 : 4;
    for (let i = 0; i < lines; i++) {
      const t = (i + 1) / (lines + 1);
      ctx.beginPath();
      if (across) {
        ctx.moveTo(-unit, -unit * 0.55 + t * unit * 1.1);
        ctx.lineTo(unit, -unit * 0.55 + t * unit * 1.1);
      } else {
        ctx.moveTo(-unit * 0.85 + t * unit * 1.7, -unit);
        ctx.lineTo(-unit * 0.85 + t * unit * 1.7, unit);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  if (tone.speckle) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = tone.shade;
    const specks = [[-0.22, 0.08], [0.18, -0.12], [0.05, 0.22], [-0.08, -0.18], [0.28, 0.16], [-0.3, 0.2]];
    for (const [sx, sy] of specks) {
      ctx.beginPath();
      ctx.ellipse(sx * unit, sy * unit, unit * 0.014, unit * 0.01, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (tone.kind === 'sheen' && sheen) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = tone.rim;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(sheen.cx, sheen.cy + i * sheen.ry * 0.55, sheen.rx * 1.15, Math.max(1.5, sheen.ry * 0.22), -0.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  } else if (tone.kind === 'glass' && sheen) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#d7e7ee';
    ctx.beginPath();
    ctx.ellipse(sheen.cx + unit * 0.08, sheen.cy + unit * 0.06, sheen.rx * 0.7, sheen.ry * 0.55, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (sheen && tone.kind === 'gloss') {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = tone.rim;
    ctx.beginPath();
    ctx.ellipse(sheen.cx, sheen.cy, sheen.rx * 1.2, sheen.ry * 0.7, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (sheen && tone.kind !== 'matte' && tone.kind !== 'grain' && tone.kind !== 'void') {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = tone.rim;
    ctx.beginPath();
    ctx.ellipse(sheen.cx, sheen.cy, Math.max(2, sheen.rx), Math.max(2, sheen.ry), -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
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
  const partials = options.partials || [];
  const selected = Number.isInteger(options.selected) ? options.selected : -1;
  const age = options.age;
  const playing = Number.isFinite(age) && age >= 0;
  const listed = shownModes(partials, { selected: -1, age });
  const modes = listed.map((mode) => ({ ...mode, hot: mode.index === selected }));
  if (selected >= 0 && !modes.some((mode) => mode.hot)) {
    modes.push(...shownModes(partials, { selected, age }));
  }
  const solo = modes.length === 1 && modes[0].hot;

  ctx.fillStyle = card;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  const kind = drawKind(options.body || {});
  const unit = objectUnit(width, height, kind, sizeName);
  // A bowl hangs below its rim. Shift it up so the picture, not the rim, is centered.
  if (kind === 'bowl') ctx.translate(0, -unit * 0.36);
  const now = Number.isFinite(options.now) ? options.now : 0;
  const flare = modes.reduce((sum, mode) => {
    const motion = playing ? Math.sin(phaseOf(mode.index, age)) * mode.env : 1;
    return sum + Math.min(0.08, Math.abs(motion) * mode.amp * 0.05);
  }, 0);

  const motionOf = (mode) => {
    if (!playing) return 1 + 0.035 * Math.sin(now / 900 + mode.index * 0.7);
    return Math.sin(phaseOf(mode.index, age)) * mode.env;
  };
  const shift = (familyName, t) => {
    let y = 0;
    for (const mode of modes) {
      const motion = motionOf(mode);
      if (playing && Math.abs(motion) < 0.04) continue;
      const gain = mode.hot ? 0.72 : 0.32 * mode.amp;
      y += modeDisplacement(familyName, mode.index, t) * motion * gain;
    }
    return y;
  };

  contactShadow(ctx, kind, family, unit, tone.shade);
  drawBody(ctx, family, unit, tone, flare, shift, kind);

  ctx.save();
  clipBody(ctx, family, unit, flare, shift, kind);
  const ordered = [...modes].sort((a, b) => a.amp - b.amp);
  for (const mode of ordered) {
    const motion = motionOf(mode);
    const bend = motion * (solo ? 0.85 : 0.4 + mode.amp * 0.35);
    const tint = mode.hot ? accent : accentTint(accent, false, card);
    ctx.save();
    ctx.globalAlpha = 1;
    drawBend(ctx, family, mode.index, unit, bend, tint, mode.hot, kind, options.solvedModes);
    ctx.restore();
  }
  if (kind === 'handpan') drawHandpanFace(ctx, unit, tone);
  ctx.restore();
  ctx.restore();
}

function phaseOf(index, age) {
  return (1.4 + (index % 5) * 0.45) * age * Math.PI * 2;
}

function contactShadow(ctx, kind, family, unit, shade) {
  // y is just under the lowest painted point of that body, so the shadow sits on the ground.
  const place = kind === 'handpan'
    ? [0, unit * 0.32, unit * 0.7, unit * 0.03]
    : kind === 'flared'
      ? [0, unit * 0.78, unit * 0.7, unit * 0.035]
      : kind === 'cowbell'
        ? [0, unit * 0.64, unit * 0.52, unit * 0.03]
        : kind === 'goblet'
          ? [0, unit * 0.66, unit * 0.42, unit * 0.028]
          : kind === 'disc'
          ? [0, unit * 1.02, unit * 0.78, unit * 0.04]
          : kind === 'bowl' || family === 'shell'
            ? [0, unit * 1.02, unit * 0.64, unit * 0.038]
            : family === 'tube'
              ? [0, unit * 1.05, unit * 0.36, unit * 0.032]
              : family === 'bar'
                ? [0, unit * 0.28, unit * 0.9, unit * 0.032]
                : family === 'string'
                  ? [0, unit * 0.74, unit * 0.95, unit * 0.032]
                  : family === 'plate'
                    ? [0, unit * 1.0, unit * 0.8, unit * 0.035]
                    : family === 'membrane'
                      ? [0, unit * 0.84, unit * 0.86, unit * 0.035]
                      : [0, unit * 0.8, unit * 0.68, unit * 0.035];
  ctx.save();
  ctx.fillStyle = shade;
  ctx.globalAlpha = 0.22;
  ctx.beginPath();
  ctx.ellipse(place[0], place[1], place[2] * 0.62, place[3] * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.1;
  ctx.beginPath();
  ctx.ellipse(place[0], place[1] + place[3] * 0.2, place[2], place[3], 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function clipBody(ctx, family, unit, flare, shift, kind) {
  if (kind === 'goblet') {
    traceGobletBowl(ctx, unit);
  } else if (kind === 'flared' || kind === 'cowbell' || kind === 'handpan' || kind === 'disc' || kind === 'bowl') {
    traceSilhouette(ctx, kind, unit, flare);
  } else if (family === 'bar') {
    const pts = barPoints(unit, (t) => -shift('bar', t) * unit * 0.16);
    ribbon(ctx, pts, unit * 0.22, 0, 0);
  } else if (family === 'string') {
    ctx.beginPath();
    ctx.rect(-unit * 1.2, -unit * 0.05, unit * 2.4, unit * 0.55);
  } else if (family === 'plate') {
    traceSquare(ctx, unit);
  } else if (family === 'membrane') {
    const [rx, ry] = diskRadii(unit, family);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  } else if (family === 'shell') {
    traceShell(ctx, unit, flare);
  } else if (family === 'tube') {
    traceTube(ctx, unit, (t) => tubeBulge(unit, shift, t), 0);
  } else {
    ctx.beginPath();
    ctx.moveTo(-unit * 0.72, -unit * 0.16);
    ctx.lineTo(unit * 0.92, -unit * 0.16);
    ctx.lineTo(unit * 0.92, unit * 0.72);
    ctx.lineTo(-unit * 0.72, unit * 0.72);
    ctx.closePath();
  }
  ctx.clip();
}

function drawBody(ctx, family, unit, tone, flare, shift, kind) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.25, unit * 0.02);
  ctx.strokeStyle = tone.shade;
  const glass = tone.kind === 'glass';
  if (kind === 'goblet') {
    drawGoblet(ctx, unit, tone, glass);
  } else if (kind === 'flared' || kind === 'cowbell' || kind === 'handpan' || kind === 'disc' || kind === 'bowl') {
    drawSilhouette(ctx, kind, unit, flare, tone, null, glass);
  } else if (family === 'bar') {
    drawBarSlab(ctx, unit, (t) => -shift('bar', t) * unit * 0.16, tone, null, glass);
  } else if (family === 'string') {
    drawBridge(ctx, -unit * 1.02, unit, tone);
    drawBridge(ctx, unit * 0.94, unit, tone);
    drawStringCord(ctx, unit, (t) => -shift('string', t) * unit * 0.2, tone, null);
  } else if (family === 'plate') {
    drawSquarePlate(ctx, unit, tone, null, glass);
  } else if (family === 'membrane') {
    drawDisk(ctx, unit, family, (angle) => 1 + shift(family, angle / (Math.PI * 2)) * 0.08, tone, null, glass);
  } else if (family === 'shell') {
    drawSilhouette(ctx, kind || 'flared', unit, flare, tone, null, glass);
  } else if (family === 'tube') {
    drawTube(ctx, unit, (t) => tubeBulge(unit, shift, t), tone, null, glass);
  } else {
    drawBox(ctx, unit, (t) => shift('box', t) * unit * 0.06, tone, null);
  }
}

function drawBend(ctx, family, index, unit, bend, tint, hot, kind, solved) {
  const width = Math.max(1.5, unit * (hot ? BAND * 1.35 : BAND));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = tint;
  const solvedMode = solved?.[index] || (solved?.length ? solved[index % solved.length] : null);
  if (kind === 'goblet') {
    ctx.save();
    ctx.translate(0, -unit * 0.16);
    ctx.beginPath();
    ctx.ellipse(0, 0, unit * 0.46, unit * 0.34, 0, 0, Math.PI * 2);
    ctx.clip();
    drawDiskRidges(ctx, unit, 'plate', index, width, [unit * 0.46, unit * 0.34]);
    ctx.restore();
    return;
  }
  if (solvedMode && (kind === 'disc' || family === 'plate' || family === 'membrane')) {
    drawSolvedLines(ctx, unit, kind, family, solvedMode.lines, width);
    return;
  }
  if (family === 'bar') {
    drawCrest(ctx, unit, (t) => -modeDisplacement('bar', index, t) * unit * 0.1 * bend);
    if (hot) drawBarNodes(ctx, unit, index, width);
  } else if (family === 'string') {
    drawCrest(ctx, unit, (t) => unit * 0.22 - modeDisplacement('string', index, t) * unit * 0.16 * bend);
  } else if (kind === 'disc') {
    ctx.save();
    ctx.translate(0, unit * 0.08);
    drawDiskRidges(ctx, unit, 'plate', index, width, [unit * 0.9, unit * 0.9]);
    ctx.restore();
  } else if (family === 'plate') {
    drawSquareRidges(ctx, unit, index, width);
  } else if (family === 'membrane') {
    drawDiskRidges(ctx, unit, family, index, width);
  } else if (kind === 'flared' || kind === 'bowl' || kind === 'cowbell' || kind === 'handpan' || family === 'shell') {
    drawShellRibs(ctx, unit, index, width, kind || 'flared');
  } else if (family === 'tube') {
    drawTubeBand(ctx, unit, index, bend);
  } else {
    drawBoxBend(ctx, unit, (t) => modeDisplacement('box', index, t) * unit * 0.05 * bend, tint);
  }
}

function drawBarNodes(ctx, unit, index, width) {
  const waves = modeShape('bar', index).nodes + 1;
  ctx.save();
  ctx.setLineDash([Math.max(2, width * 1.6), Math.max(3, width * 2.2)]);
  ctx.lineWidth = Math.max(1, width * 0.7);
  for (let k = 1; k < waves; k++) {
    const x = -unit + (k / waves) * unit * 2;
    ctx.beginPath();
    ctx.moveTo(x, -unit * 0.1);
    ctx.lineTo(x, unit * 0.1);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCrest(ctx, unit, yAt) {
  const samples = 36;
  ctx.beginPath();
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const x = -unit + t * unit * 2;
    const y = yAt(t);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawTubeBand(ctx, unit, index, bend) {
  const samples = 28;
  ctx.lineWidth = Math.max(ctx.lineWidth, unit * 0.055);
  ctx.beginPath();
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const y = -unit * 0.86 + t * unit * 1.72;
    const x = modeDisplacement('tube', index, t) * bend * unit * 0.15;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function barPoints(unit, yAt) {
  const samples = 40;
  const pts = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    pts.push([-unit + t * unit * 2, yAt(t)]);
  }
  return pts;
}

function ribbon(ctx, pts, half, ox, oy) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + ox, y - half + oy) : ctx.moveTo(x + ox, y - half + oy)));
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0] + ox, pts[i][1] + half + oy);
  ctx.closePath();
}

function drawBarSlab(ctx, unit, yAt, tone, tint, glass) {
  const half = unit * 0.22;
  const dx = unit * 0.016;
  const dy = unit * 0.02;
  const pts = barPoints(unit, yAt);
  const shade = tint ? mixHex(tint, tone.shade, 0.4) : tone.shade;

  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + half) : ctx.moveTo(x, y + half)));
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0] + dx, pts[i][1] + half + dy);
  ctx.closePath();
  ctx.fillStyle = shade;
  ctx.fill();

  const end = pts[pts.length - 1];
  ctx.beginPath();
  ctx.moveTo(end[0], end[1] - half);
  ctx.lineTo(end[0] + dx, end[1] - half + dy * 0.3);
  ctx.lineTo(end[0] + dx, end[1] + half + dy);
  ctx.lineTo(end[0], end[1] + half);
  ctx.closePath();
  ctx.fill();

  ribbon(ctx, pts, half, 0, 0);
  ctx.fillStyle = faceGradient(ctx, -unit, -half, unit * 0.2, half, tone, tint);
  ctx.save();
  if (glass) ctx.globalAlpha *= 0.72;
  ctx.fill();
  if (!tint) paintSurface(ctx, tone, unit, false, { cx: -unit * 0.28, cy: -half * 0.35, rx: unit * 0.42, ry: half * 0.28 });
  ctx.restore();

  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y - half) : ctx.moveTo(x, y - half)));
  ctx.lineTo(end[0], end[1] + half);
  ctx.lineTo(end[0] + dx, end[1] + half + dy);
  for (let i = pts.length - 2; i >= 0; i--) ctx.lineTo(pts[i][0] + dx, pts[i][1] + half + dy);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.1, unit * 0.009);
  ctx.strokeStyle = shade;
  ctx.stroke();
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
  ctx.lineWidth = Math.max(2.5, unit * (tint ? 0.05 : 0.055));
  ctx.strokeStyle = tint || tone.mid;
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
  ctx.save();
  ctx.translate(unit * 0.05, unit * 0.07);
  trace(1);
  ctx.fillStyle = tint ? mixHex(tint, tone.shade, 0.5) : tone.shade;
  ctx.fill();
  ctx.restore();
  trace(1);
  ctx.fillStyle = faceGradient(ctx, -rx, -ry, rx * 0.4, ry, tone, tint);
  ctx.save();
  if (glass) ctx.globalAlpha *= 0.7;
  ctx.fill();
  ctx.lineWidth = Math.max(1.15, unit * 0.012);
  ctx.strokeStyle = tint ? mixHex(tint, tone.shade, 0.4) : tone.shade;
  ctx.stroke();
  if (!tint) paintSurface(ctx, tone, unit, true, { cx: -rx * 0.22, cy: -ry * 0.24, rx: rx * 0.42, ry: ry * 0.26 });
  ctx.restore();
}

function squareHalf(unit) {
  return unit * 0.88;
}

function traceSquare(ctx, unit) {
  const s = squareHalf(unit);
  ctx.beginPath();
  ctx.rect(-s, -s, s * 2, s * 2);
  ctx.closePath();
}

function drawSquarePlate(ctx, unit, tone, tint, glass) {
  const s = squareHalf(unit);
  const dx = unit * 0.03;
  const dy = unit * 0.035;
  ctx.beginPath();
  ctx.rect(-s + dx, -s + dy, s * 2, s * 2);
  ctx.fillStyle = tint ? mixHex(tint, tone.shade, 0.45) : tone.shade;
  ctx.fill();
  traceSquare(ctx, unit);
  ctx.fillStyle = faceGradient(ctx, -s, -s, s * 0.2, s, tone, tint);
  ctx.save();
  if (glass) ctx.globalAlpha *= 0.72;
  ctx.fill();
  ctx.lineWidth = Math.max(1.15, unit * 0.012);
  ctx.strokeStyle = tone.shade;
  ctx.stroke();
  if (!tint) paintSurface(ctx, tone, unit, true, { cx: -s * 0.25, cy: -s * 0.28, rx: s * 0.35, ry: s * 0.18 });
  ctx.restore();
}

function drawSquareRidges(ctx, unit, index, width) {
  const s = squareHalf(unit) * 0.92;
  const lines = 1 + (index % 3);
  ctx.lineWidth = width;
  for (let i = 1; i <= lines; i++) {
    const x = -s + (2 * s * i) / (lines + 1);
    ctx.beginPath();
    ctx.moveTo(x, -s);
    ctx.lineTo(x, s);
    ctx.stroke();
  }
  if (index > 2) {
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.lineTo(s, 0);
    ctx.stroke();
  }
}

function placeSolved(x, y, unit, kind, family) {
  if (kind === 'disc') return [x * unit * 0.9, unit * 0.08 + y * unit * 0.9];
  if (family === 'membrane') {
    const [rx, ry] = diskRadii(unit, family);
    return [x * rx, y * ry];
  }
  const s = squareHalf(unit);
  return [x * s, y * s];
}

function drawSolvedLines(ctx, unit, kind, family, lines, width) {
  const place = (x, y) => placeSolved(x, y, unit, kind, family);
  ctx.lineWidth = width;
  for (const segment of lines || []) {
    if (!segment || segment.length < 2) continue;
    ctx.beginPath();
    segment.forEach(([x, y], i) => {
      const [px, py] = place(x, y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
}

function drawDiskRidges(ctx, unit, family, index, width, radii) {
  const shape = modeShape(family, index);
  const [rx, ry] = radii || diskRadii(unit, family);
  ctx.lineWidth = width;
  for (let ring = 1; ring <= shape.rings; ring++) {
    const f = ring / (shape.rings + 0.65);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * f, ry * f, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let spoke = 0; spoke < shape.spokes; spoke++) {
    const angle = (Math.PI * spoke) / shape.spokes;
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
  ctx.lineWidth = Math.max(1.15, unit * 0.012);
  ctx.strokeStyle = tone.shade;
  ctx.stroke();
  if (!tint) paintSurface(ctx, tone, unit, true, { cx: -unit * 0.22, cy: -unit * 0.05, rx: unit * 0.28, ry: unit * 0.16 });
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

// Half-width of a church bell, mouth down. The crown rounds out to the
// shoulder. Below the shoulder the side only gets wider: a gently concave
// waist, then the sound bow and the flared lip.
export function flaredHalf(n) {
  const y = Number(n) || 0;
  const shoulderY = -0.06;
  const shoulder = 0.4;
  const lipY = 0.68;
  const lip = 0.76;
  if (y <= -0.5) return 0.1;
  if (y < shoulderY) {
    const t = (y + 0.5) / (shoulderY + 0.5);
    const u = Math.max(0, Math.min(1, t));
    return 0.1 + (shoulder - 0.1) * Math.sin(u * Math.PI / 2);
  }
  const t = Math.max(0, Math.min(1, (y - shoulderY) / (lipY - shoulderY)));
  return shoulder + (lip - shoulder) * Math.pow(t, 1.55);
}

function handpanHalf(n) {
  const cy = 0.06;
  const ry = 0.32;
  const rx = 0.76;
  const dy = (n - cy) / ry;
  if (dy <= -1 || dy >= 0.08) return 0;
  const clamped = Math.max(-1, Math.min(1, dy));
  return rx * Math.sqrt(1 - clamped * clamped);
}

function bellHalf(kind, y, unit) {
  const n = y / unit;
  if (kind === 'bowl') return unit * (0.55 + 0.15 * Math.sin(Math.max(0, n) * 1.4));
  if (kind === 'handpan') return handpanHalf(n) * unit;
  return flaredHalf(n) * unit;
}

function drawCowbellRibs(ctx, unit, index, width) {
  const shape = modeShape('shell', index);
  const meridians = Math.min(4, shape.meridians);
  ctx.lineWidth = Math.max(width, unit * 0.05);
  const topL = -0.32;
  const topR = 0.16;
  const botL = -0.46;
  const botR = 0.32;
  const topY = -0.46;
  const faceBot = 0.54;
  const lineBot = 0.46;
  const uBot = (lineBot - topY) / (faceBot - topY);
  const xL = topL + (botL - topL) * uBot;
  const xR = topR + (botR - topR) * uBot;
  for (let i = 0; i < meridians; i++) {
    const t = (i + 0.5) / meridians;
    ctx.beginPath();
    ctx.moveTo((topL + (topR - topL) * t) * unit, topY * unit);
    ctx.lineTo((xL + (xR - xL) * t) * unit, lineBot * unit);
    ctx.stroke();
  }
  const sideT = 0.55;
  const edgeTopX = 0.16;
  const edgeBotX = 0.16 + (0.32 - 0.16) * uBot;
  const outerTopX = 0.34;
  const outerBotX = 0.34 + (0.5 - 0.34) * uBot;
  const outerTopY = -0.38;
  const outerBotY = -0.38 + (0.46 - -0.38) * uBot;
  ctx.beginPath();
  ctx.moveTo((edgeTopX + (outerTopX - edgeTopX) * sideT) * unit, (topY + (outerTopY - topY) * sideT) * unit);
  ctx.lineTo((edgeBotX + (outerBotX - edgeBotX) * sideT) * unit, (lineBot + (outerBotY - lineBot) * sideT) * unit);
  ctx.stroke();
  ctx.save();
  ctx.setLineDash([Math.max(3, width * 2), Math.max(4, width * 2.4)]);
  ctx.lineWidth = Math.max(1.4, width * 0.85);
  for (let circle = 1; circle <= (shape.circles || 0); circle++) {
    const u = circle / ((shape.circles || 1) + 1);
    const y = topY + (lineBot - topY) * u;
    const x0 = topL + (botL - topL) * u;
    const x1 = topR + (botR - topR) * u;
    const outerX = 0.34 + (0.5 - 0.34) * u;
    const outerY = -0.38 + (0.46 - -0.38) * u;
    ctx.beginPath();
    ctx.moveTo(x0 * unit, y * unit);
    ctx.lineTo(x1 * unit, y * unit);
    ctx.lineTo((x1 + (outerX - x1) * 0.7) * unit, (y + (outerY - y) * 0.7) * unit);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShellRibs(ctx, unit, index, width, kind) {
  if (kind === 'cowbell') {
    drawCowbellRibs(ctx, unit, index, width);
    return;
  }
  const shape = modeShape('shell', index);
  const meridians = Math.min(4, shape.meridians);
  const profile = kind === 'bowl' ? 'bowl' : kind === 'handpan' ? 'handpan' : 'flared';
  const y0 = profile === 'bowl' ? -unit * 0.05 : profile === 'handpan' ? -unit * 0.18 : -unit * 0.28;
  const y1 = profile === 'bowl' ? unit * 0.7 : profile === 'handpan' ? unit * 0.04 : unit * 0.56;
  ctx.lineWidth = Math.max(width, unit * 0.034);
  const steps = 22;
  for (let i = 0; i < meridians; i++) {
    const side = meridians === 1 ? 0 : (i / (meridians - 1) - 0.5) * 2;
    ctx.beginPath();
    let started = false;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const y = y0 + (y1 - y0) * u;
      const half = bellHalf(profile, y, unit);
      if (half < unit * 0.02) continue;
      const x = side * half * (profile === 'handpan' ? 0.78 : 0.8);
      if (!started) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      started = true;
    }
    if (started) ctx.stroke();
  }
  ctx.save();
  ctx.setLineDash([Math.max(3, width * 2), Math.max(4, width * 2.4)]);
  ctx.lineWidth = Math.max(1.25, width * 0.8);
  for (let circle = 1; circle <= (shape.circles || 0); circle++) {
    const y = y0 + (y1 - y0) * (circle / ((shape.circles || 1) + 1));
    const rx = bellHalf(profile, y, unit) * 0.88;
    if (rx < unit * 0.04) continue;
    ctx.beginPath();
    ctx.ellipse(0, y, rx, unit * (profile === 'handpan' ? 0.04 : 0.05), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function traceFlared(ctx, unit, flare) {
  const w = 1 + flare * 0.5;
  const top = -0.42;
  const bot = 0.68;
  const steps = 26;
  const xAt = (n) => flaredHalf(n) * unit * w;
  ctx.beginPath();
  ctx.moveTo(-xAt(bot), bot * unit);
  for (let i = steps; i >= 0; i--) {
    const n = top + ((bot - top) * i) / steps;
    ctx.lineTo(-xAt(n), n * unit);
  }
  ctx.quadraticCurveTo(-unit * 0.02, -unit * 0.5, -unit * 0.045, -unit * 0.46);
  ctx.quadraticCurveTo(-unit * 0.07, -unit * 0.64, 0, -unit * 0.66);
  ctx.quadraticCurveTo(unit * 0.07, -unit * 0.64, unit * 0.045, -unit * 0.46);
  ctx.quadraticCurveTo(unit * 0.02, -unit * 0.5, xAt(top), top * unit);
  for (let i = 0; i <= steps; i++) {
    const n = top + ((bot - top) * i) / steps;
    ctx.lineTo(xAt(n), n * unit);
  }
  ctx.quadraticCurveTo(0, unit * 0.78, -xAt(bot), bot * unit);
  ctx.closePath();
}

function drawDiscBoss(ctx, unit, tone) {
  const cy = -unit * 0.02;
  const rx = unit * 0.16;
  const ry = unit * 0.12;
  ctx.beginPath();
  ctx.ellipse(unit * 0.012, cy + unit * 0.016, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = mixHex(tone.mid, tone.shade, 0.45);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
  const boss = ctx.createRadialGradient(-rx * 0.4, cy - ry * 0.5, unit * 0.015, 0, cy, rx);
  boss.addColorStop(0, mixHex(tone.lit, tone.mid, 0.28));
  boss.addColorStop(0.5, tone.mid);
  boss.addColorStop(1, mixHex(tone.mid, tone.shade, 0.22));
  ctx.fillStyle = boss;
  ctx.fill();
}

function traceGobletBowl(ctx, unit) {
  ctx.beginPath();
  ctx.moveTo(-unit * 0.48, -unit * 0.42);
  ctx.bezierCurveTo(-unit * 0.5, -unit * 0.05, -unit * 0.22, unit * 0.16, 0, unit * 0.18);
  ctx.bezierCurveTo(unit * 0.22, unit * 0.16, unit * 0.5, -unit * 0.05, unit * 0.48, -unit * 0.42);
  ctx.quadraticCurveTo(0, -unit * 0.5, -unit * 0.48, -unit * 0.42);
  ctx.closePath();
}

function drawGoblet(ctx, unit, tone, glass) {
  ctx.beginPath();
  ctx.ellipse(0, unit * 0.58, unit * 0.42, unit * 0.07, 0, 0, Math.PI * 2);
  ctx.fillStyle = tone.mid;
  ctx.fill();
  ctx.strokeStyle = tone.shade;
  ctx.lineWidth = Math.max(1.1, unit * 0.012);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-unit * 0.035, unit * 0.16);
  ctx.lineTo(unit * 0.035, unit * 0.16);
  ctx.lineTo(unit * 0.05, unit * 0.52);
  ctx.lineTo(-unit * 0.05, unit * 0.52);
  ctx.closePath();
  ctx.fillStyle = tone.mid;
  ctx.fill();
  ctx.stroke();
  traceGobletBowl(ctx, unit);
  ctx.fillStyle = faceGradient(ctx, -unit * 0.2, -unit * 0.4, unit * 0.1, unit * 0.2, tone, null);
  ctx.save();
  if (glass) ctx.globalAlpha *= 0.72;
  ctx.fill();
  ctx.strokeStyle = tone.shade;
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(0, -unit * 0.4, unit * 0.46, unit * 0.07, 0, 0, Math.PI * 2);
  ctx.strokeStyle = tone.shade;
  ctx.stroke();
  if (!glass) return;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = tone.rim;
  ctx.beginPath();
  ctx.ellipse(-unit * 0.12, -unit * 0.22, unit * 0.12, unit * 0.16, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function hitObjectMode(options, x, y) {
  const body = options.body || {};
  const kind = drawKind(body);
  const family = bodyFamily(body);
  const width = options.width;
  const height = options.height;
  const unit = objectUnit(width, height, kind, body.size);
  let px = x - width / 2;
  let py = y - height / 2;
  if (kind === 'bowl') py += unit * 0.36;
  const modes = shownModes(options.partials || [], { selected: -1, limit: 8 });
  const solved = options.solvedModes;
  let best = -1;
  let bestDistance = Math.max(10, unit * 0.07);
  const consider = (index, ax, ay, bx, by) => {
    const distance = pointSegmentDistance(px, py, ax, ay, bx, by);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  };
  for (const mode of modes) {
    const lines = solved?.[mode.index]?.lines;
    if (lines && (kind === 'disc' || family === 'plate' || family === 'membrane')) {
      for (const line of lines) {
        for (let i = 1; i < line.length; i++) {
          const a = placeSolved(line[i - 1][0], line[i - 1][1], unit, kind, family);
          const b = placeSolved(line[i][0], line[i][1], unit, kind, family);
          consider(mode.index, a[0], a[1], b[0], b[1]);
        }
      }
    }
  }
  return best;
}

function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len < 1e-8 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function traceSilhouette(ctx, kind, unit, flare) {
  const w = 1 + flare * 0.5;
  if (kind === 'flared') {
    traceFlared(ctx, unit, flare);
    return;
  }
  ctx.beginPath();
  if (kind === 'cowbell') {
    ctx.moveTo(-unit * 0.32, -unit * 0.46);
    ctx.lineTo(unit * 0.16, -unit * 0.46);
    ctx.lineTo(unit * 0.34, -unit * 0.38);
    ctx.lineTo(unit * 0.5, unit * 0.46);
    ctx.lineTo(unit * 0.32, unit * 0.54);
    ctx.lineTo(-unit * 0.46, unit * 0.54);
  } else if (kind === 'handpan') {
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI * (1 + i / steps);
      const x = Math.cos(a) * unit * 0.76;
      const y = unit * 0.06 + Math.sin(a) * unit * 0.32;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = steps; i >= 0; i--) {
      const a = Math.PI * (i / steps);
      const x = Math.cos(a) * unit * 0.76;
      const y = unit * 0.06 + Math.sin(a) * unit * 0.22;
      ctx.lineTo(x, y);
    }
  } else if (kind === 'disc') {
    ctx.ellipse(0, unit * 0.08, unit * 0.9, unit * 0.9, 0, 0, Math.PI * 2);
  } else {
    ctx.moveTo(-unit * 0.72 * w, -unit * 0.15);
    ctx.quadraticCurveTo(-unit * 0.98 * w, unit * 0.82, 0, unit * 0.96);
    ctx.quadraticCurveTo(unit * 0.98 * w, unit * 0.82, unit * 0.72 * w, -unit * 0.15);
    ctx.quadraticCurveTo(0, -unit * 0.5, -unit * 0.72 * w, -unit * 0.15);
  }
  ctx.closePath();
}

function drawSilhouette(ctx, kind, unit, flare, tone, tint, glass) {
  const crisp = kind === 'flared' || kind === 'cowbell' || kind === 'handpan';
  if (!crisp) {
    ctx.save();
    ctx.translate(unit * 0.03, unit * 0.035);
    traceSilhouette(ctx, kind, unit, flare);
    ctx.fillStyle = tint ? mixHex(tint, tone.shade, 0.45) : tone.shade;
    ctx.fill();
    ctx.restore();
  }
  traceSilhouette(ctx, kind, unit, flare);
  const vertical = kind === 'disc' || kind === 'handpan';
  ctx.fillStyle = faceGradient(ctx, vertical ? -unit : 0, -unit * 0.7, vertical ? unit * 0.3 : 0, unit * 0.8, tone, tint);
  ctx.save();
  if (glass || tone.kind === 'glass') ctx.globalAlpha *= 0.74;
  ctx.fill();
  ctx.lineWidth = Math.max(1.1, unit * 0.01);
  ctx.strokeStyle = tone.shade;
  ctx.stroke();
  if (!tint) paintSurface(ctx, tone, unit, true, { cx: -unit * 0.18, cy: kind === 'flared' ? -unit * 0.28 : -unit * 0.08, rx: unit * 0.26, ry: unit * 0.12 });
  ctx.restore();
  if (kind === 'flared') {
    const bow = (sign) => {
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const n = 0.36 + (0.28 * i) / 8;
        const x = sign * flaredHalf(n) * unit * (1 + flare * 0.5) * 0.86;
        if (i === 0) ctx.moveTo(x, n * unit);
        else ctx.lineTo(x, n * unit);
      }
    };
    ctx.lineWidth = Math.max(3, unit * 0.045);
    ctx.strokeStyle = tone.shade;
    ctx.lineCap = 'round';
    bow(1);
    ctx.stroke();
    bow(-1);
    ctx.stroke();
    const lip = flaredHalf(0.64) * unit * (1 + flare * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, unit * 0.66, lip * 0.86, unit * 0.085, 0, 0, Math.PI * 2);
    ctx.fillStyle = mixHex(tone.shade, '#141210', 0.5);
    ctx.fill();
    ctx.lineWidth = Math.max(2.2, unit * 0.028);
    ctx.strokeStyle = mixHex(tone.mid, tone.shade, 0.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, unit * 0.67, lip * 0.62, unit * 0.045, 0, 0, Math.PI * 2);
    ctx.fillStyle = mixHex(tone.shade, '#12100e', 0.72);
    ctx.fill();
  } else if (kind === 'disc') {
    drawDiscBoss(ctx, unit, tone);
  } else if (kind === 'handpan') {
    ctx.beginPath();
    const steps = 24;
    ctx.moveTo(unit * 0.76, unit * 0.06);
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI * (i / steps);
      ctx.lineTo(Math.cos(a) * unit * 0.76, unit * 0.06 + Math.sin(a) * unit * 0.22);
    }
    ctx.closePath();
    ctx.fillStyle = tone.shade;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, unit * 0.06, unit * 0.76, unit * 0.05, 0, 0, Math.PI * 2);
    ctx.strokeStyle = mixHex(tone.lit, tone.mid, 0.35);
    ctx.lineWidth = Math.max(1.6, unit * 0.02);
    ctx.stroke();
  } else if (kind === 'cowbell') {
    ctx.beginPath();
    ctx.moveTo(unit * 0.16, -unit * 0.46);
    ctx.lineTo(unit * 0.34, -unit * 0.38);
    ctx.lineTo(unit * 0.5, unit * 0.46);
    ctx.lineTo(unit * 0.32, unit * 0.54);
    ctx.closePath();
    ctx.fillStyle = tone.shade;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-unit * 0.32, -unit * 0.46);
    ctx.lineTo(-unit * 0.18, -unit * 0.58);
    ctx.lineTo(unit * 0.34, -unit * 0.38);
    ctx.lineTo(unit * 0.16, -unit * 0.46);
    ctx.closePath();
    ctx.fillStyle = mixHex(tone.mid, tone.lit, 0.28);
    ctx.fill();
    ctx.strokeStyle = tone.shade;
    ctx.lineWidth = Math.max(1.4, unit * 0.016);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-unit * 0.32, -unit * 0.46);
    ctx.lineTo(unit * 0.16, -unit * 0.46);
    ctx.lineTo(unit * 0.32, unit * 0.54);
    ctx.lineTo(-unit * 0.46, unit * 0.54);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(unit * 0.16, -unit * 0.46);
    ctx.lineTo(unit * 0.32, unit * 0.54);
    ctx.lineWidth = Math.max(2, unit * 0.022);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-unit * 0.07, unit * 0.54, unit * 0.3, unit * 0.048, 0, 0, Math.PI * 2);
    ctx.fillStyle = mixHex(tone.shade, '#141210', 0.55);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-unit * 0.07, unit * 0.548, unit * 0.2, unit * 0.026, 0, 0, Math.PI * 2);
    ctx.fillStyle = mixHex(tone.shade, '#12100e', 0.7);
    ctx.fill();
  }
}

function drawHandpanFace(ctx, unit, tone) {
  ctx.beginPath();
  ctx.ellipse(0, -unit * 0.02, unit * 0.1, unit * 0.055, 0, 0, Math.PI * 2);
  ctx.fillStyle = mixHex(tone.lit, tone.mid, 0.15);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-unit * 0.015, -unit * 0.038, unit * 0.045, unit * 0.02, 0, 0, Math.PI * 2);
  ctx.fillStyle = tone.lit;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, unit * 0.005, unit * 0.07, unit * 0.018, 0, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.strokeStyle = mixHex(tone.mid, tone.shade, 0.35);
  ctx.lineWidth = Math.max(1, unit * 0.01);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 8;
    const x = Math.cos(angle) * unit * 0.4;
    const y = -unit * 0.02 + Math.sin(angle) * unit * 0.12;
    const rot = Math.cos(angle) * 0.4;
    ctx.beginPath();
    ctx.ellipse(x, y, unit * 0.08, unit * 0.036, rot, 0, Math.PI * 2);
    ctx.fillStyle = mixHex(tone.lit, tone.mid, 0.5);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x, y + unit * 0.01, unit * 0.062, unit * 0.016, rot, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.strokeStyle = mixHex(tone.shade, tone.mid, 0.35);
    ctx.lineWidth = Math.max(1, unit * 0.01);
    ctx.stroke();
  }
}

function tubeBulge(unit, shift, t) {
  return Math.min(unit * 0.06, Math.abs(shift('tube', t)) * unit * 0.035);
}

function traceTube(ctx, unit, extra, shift) {
  const samples = 32;
  const half = unit * 0.34;
  ctx.beginPath();
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const y = -unit + t * unit * 2;
    const x = half + extra(t);
    if (i === 0) ctx.moveTo(x + shift, y + shift);
    else ctx.lineTo(x + shift, y + shift);
  }
  for (let i = samples - 1; i >= 0; i--) {
    const t = i / (samples - 1);
    const y = -unit + t * unit * 2;
    ctx.lineTo(-(half + extra(t)) + shift, y + shift);
  }
  ctx.closePath();
}

function drawTube(ctx, unit, extra, tone, tint, glass) {
  ctx.save();
  ctx.translate(unit * 0.035, unit * 0.04);
  traceTube(ctx, unit, extra, 0);
  ctx.fillStyle = tint ? mixHex(tint, tone.shade, 0.5) : tone.shade;
  ctx.fill();
  ctx.restore();
  traceTube(ctx, unit, extra, 0);
  ctx.fillStyle = faceGradient(ctx, -unit * 0.3, 0, unit * 0.3, 0, tone, tint);
  ctx.save();
  if (glass) ctx.globalAlpha *= 0.72;
  ctx.fill();
  ctx.lineWidth = Math.max(1.15, unit * 0.012);
  ctx.strokeStyle = tint ? mixHex(tint, tone.shade, 0.35) : tone.shade;
  ctx.stroke();
  if (!tint) paintSurface(ctx, tone, unit, true, { cx: -unit * 0.1, cy: -unit * 0.2, rx: unit * 0.12, ry: unit * 0.36 });
  ctx.restore();
  const mouth = unit * 0.34 + extra(0);
  ctx.beginPath();
  ctx.ellipse(0, -unit, mouth, unit * 0.1, 0, 0, Math.PI * 2);
  ctx.fillStyle = tint ? mixHex(tint, tone.lit, 0.4) : tone.lit;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -unit, mouth * 0.62, unit * 0.055, 0, 0, Math.PI * 2);
  ctx.fillStyle = tone.shade;
  ctx.fill();
  ctx.strokeStyle = tint ? mixHex(tint, '#ffffff', 0.3) : tone.rim;
  ctx.lineWidth = Math.max(1, unit * 0.012);
  ctx.beginPath();
  ctx.ellipse(0, -unit * 1.02, mouth * 0.86, unit * 0.045, 0, Math.PI, Math.PI * 2);
  ctx.stroke();
}

function drawBoxBend(ctx, unit, bow, tint) {
  ctx.beginPath();
  const steps = 16;
  ctx.moveTo(-unit * 0.7, -unit * 0.15);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ctx.lineTo(-unit * 0.7 + t * unit * 1.6, -unit * 0.15 + bow(t) * 0.25);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    ctx.lineTo(-unit * 0.7 + t * unit * 1.6, unit * 0.7 + bow(t));
  }
  ctx.closePath();
  ctx.fillStyle = tint;
  ctx.fill();
  ctx.strokeStyle = tint;
  ctx.stroke();
}

function drawBox(ctx, unit, bow, tone, tint) {
  const depth = unit * 0.045;
  const steps = 16;
  ctx.beginPath();
  ctx.moveTo(unit * 0.9, -unit * 0.15);
  ctx.lineTo(unit * 0.9 + depth, -unit * 0.15 + depth);
  ctx.lineTo(unit * 0.9 + depth, unit * 0.7 + bow(1) + depth);
  ctx.lineTo(unit * 0.9, unit * 0.7 + bow(1));
  ctx.closePath();
  ctx.fillStyle = tone.shade;
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = -unit * 0.7 + t * unit * 1.6;
    const y = unit * 0.7 + bow(t);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    ctx.lineTo(-unit * 0.7 + t * unit * 1.6 + depth, unit * 0.7 + bow(t) + depth);
  }
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-unit * 0.7, -unit * 0.15 + bow(0));
  ctx.lineTo(-unit * 0.12, -unit * 0.55);
  ctx.lineTo(unit * 0.18, -unit * 0.55);
  ctx.lineTo(unit * 0.9, -unit * 0.15 + bow(1));
  ctx.closePath();
  ctx.fillStyle = tint ? mixHex(tint, tone.lit, 0.35) : tone.lit;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-unit * 0.7, -unit * 0.15);
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
  if (!tint) paintSurface(ctx, tone, unit, true, { cx: -unit * 0.2, cy: unit * 0.05, rx: unit * 0.28, ry: unit * 0.16 });

  ctx.beginPath();
  ctx.moveTo(-unit * 0.7, -unit * 0.15);
  ctx.lineTo(-unit * 0.12, -unit * 0.55);
  ctx.lineTo(unit * 0.18, -unit * 0.55);
  ctx.lineTo(unit * 0.9, -unit * 0.15);
  ctx.lineTo(unit * 0.9 + depth, -unit * 0.15 + depth);
  ctx.lineTo(unit * 0.9 + depth, unit * 0.7 + bow(1) + depth);
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    ctx.lineTo(-unit * 0.7 + t * unit * 1.6 + depth, unit * 0.7 + bow(t) + depth);
  }
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.1, unit * 0.009);
  ctx.strokeStyle = tone.shade;
  ctx.stroke();
}
