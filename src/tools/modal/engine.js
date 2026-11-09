// Physical starting points for a 64-partial modal profile.
// Ratios are real series, then stiffness, brightness, damping, odd/even, and an optional seed.

export const PARTIALS = 64;

export const PRESETS = [
  { id: 'string', label: 'String' },
  { id: 'bar', label: 'Bar' },
  { id: 'bell', label: 'Bell' },
  { id: 'plate', label: 'Plate' },
  { id: 'membrane', label: 'Membrane' },
  { id: 'open-pipe', label: 'Open pipe' },
  { id: 'closed-pipe', label: 'Closed pipe' },
];

const PRESET_IDS = new Set(PRESETS.map((p) => p.id));

// Free-free bar bending eigenvalues (cos βL cosh βL = 1). Higher modes use (2n+1)π/2.
const BAR_BETA = [4.730040744862704, 7.853204624095838, 10.995607838001671, 14.137165491257464, 17.278759657399481];

// Minor-third bell, relative to the prime (Fletcher & Rossing): hum, prime, tierce, quint, nominal.
const BELL_NAMED = [0.5, 1, 1.2, 1.5, 2, 2.5, 3, 4];

// Strike levels in dB relative to the nominal. A tuned bell's nominal leads,
// the tierce is the next strongest musical partial, and the hum sits well down
// at the attack even though it rings the longest (Rossing, Acoustics of Bells).
const BELL_STRIKE_DB = [ -18, -9, -5, -12, 0, -7, -9, -14 ];

// Flexural modes of a bowl, relative to the (2,0) singing mode. Sparse on purpose.
const GLASS_RATIOS = [1, 2.32, 4.21, 6.58, 9.41, 12.7];

function barBeta(n) {
  if (n <= BAR_BETA.length) return BAR_BETA[n - 1];
  return ((2 * n + 1) * Math.PI) / 2;
}

function besselJ(order, x) {
  let term = 1;
  for (let i = 1; i <= order; i++) term *= x / (2 * i);
  let sum = term;
  for (let k = 1; k < 60; k++) {
    term *= -(x * x) / (4 * k * (k + order));
    sum += term;
    if (Math.abs(term) < 1e-15 * (Math.abs(sum) + 1)) break;
  }
  return sum;
}

let membraneZeros = null;
function membraneAlphas() {
  if (membraneZeros) return membraneZeros;
  const zeros = [];
  for (let m = 0; m <= 24; m++) {
    let x = Math.max(0.5, m + 1);
    let guard = 0;
    while (zeros.filter((z) => z.m === m).length < 8 && guard < 400) {
      guard++;
      const j = besselJ(m, x);
      const jn = besselJ(m, x + 0.05);
      if (j === 0 || j * jn < 0) {
        let a = x;
        let b = x + 0.05;
        let fa = besselJ(m, a);
        for (let i = 0; i < 40; i++) {
          const mid = (a + b) / 2;
          const fm = besselJ(m, mid);
          if (fa * fm <= 0) b = mid;
          else { a = mid; fa = fm; }
        }
        const z = (a + b) / 2;
        if (!zeros.some((item) => Math.abs(item.z - z) < 0.02)) zeros.push({ m, z });
        x = z + 0.4;
      } else {
        x += 0.05;
      }
      if (x > 80) break;
    }
  }
  zeros.sort((a, b) => a.z - b.z);
  membraneZeros = zeros.map((item) => item.z);
  return membraneZeros;
}

function bellStrikeDb(ratio) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < BELL_NAMED.length; i++) {
    const dist = Math.abs(Math.log(ratio / BELL_NAMED[i]));
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  if (bestDist < 0.045) return BELL_STRIKE_DB[best];
  const octaves = Math.log2(Math.max(ratio, 1e-6) / 2);
  return -6 * Math.max(octaves, 0) - 8;
}

function baseRatios(preset, voice) {
  if (voice === 'glass') return GLASS_RATIOS.slice();
  if (preset === 'string' || preset === 'open-pipe') {
    return Array.from({ length: PARTIALS }, (_, i) => i + 1);
  }
  if (preset === 'closed-pipe') {
    return Array.from({ length: PARTIALS }, (_, i) => 1 + 2 * i);
  }
  if (preset === 'bar') {
    const b1 = barBeta(1);
    return Array.from({ length: PARTIALS }, (_, i) => (barBeta(i + 1) / b1) ** 2);
  }
  if (preset === 'bell') {
    const ratios = BELL_NAMED.slice();
    let n = 9;
    while (ratios.length < PARTIALS) {
      ratios.push(0.5 * n);
      n += 1;
    }
    return ratios.slice(0, PARTIALS);
  }
  if (preset === 'plate') {
    // Simply supported square plate: frequency ∝ m² + n², relative to the (1,1) mode.
    const modes = [];
    for (let m = 1; m <= 16; m++) {
      for (let n = 1; n <= 16; n++) modes.push(m * m + n * n);
    }
    modes.sort((a, b) => a - b);
    const fund = modes[0];
    return modes.slice(0, PARTIALS).map((value) => value / fund);
  }
  if (preset === 'membrane') {
    const zeros = membraneAlphas();
    const fund = zeros[0];
    return zeros.slice(0, PARTIALS).map((value) => value / fund);
  }
  return Array.from({ length: PARTIALS }, (_, i) => i + 1);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

export function defaultControls() {
  return {
    preset: 'string',
    stiffness: 0,
    brightness: 0,
    damping: 0.35,
    oddEven: 0,
    seed: 0,
  };
}

export function sanitizeControls(input) {
  const base = defaultControls();
  const preset = PRESET_IDS.has(input?.preset) ? input.preset : base.preset;
  const num = (value, lo, hi, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
  };
  const seedNum = Number(input?.seed);
  const countNum = Number(input?.count);
  const voice = input?.voice === 'glass' || input?.voice === 'gong' ? input.voice : '';
  return {
    preset,
    stiffness: num(input?.stiffness, 0, 1, base.stiffness),
    brightness: num(input?.brightness, -1, 1, base.brightness),
    damping: num(input?.damping, 0, 1, base.damping),
    oddEven: num(input?.oddEven, -1, 1, base.oddEven),
    seed: Number.isFinite(seedNum) ? Math.trunc(clamp(seedNum, 0, 1_000_000_000)) : 0,
    voice,
    count: Number.isFinite(countNum) && countNum > 0 ? Math.round(clamp(countNum, 1, PARTIALS)) : PARTIALS,
  };
}

export function buildPartials(rawControls) {
  const controls = sanitizeControls(rawControls);
  let ratios = baseRatios(controls.preset, controls.voice).slice(0, controls.count).map((ratio, index) => {
    const n = index + 1;
    const b = controls.stiffness * 0.0005;
    return ratio * Math.sqrt(1 + b * n * n);
  });
  if (controls.seed > 0) {
    const rand = mulberry32(controls.seed);
    ratios = ratios.map((ratio) => ratio * (1 + (rand() - 0.5) * 0.03));
  }
  const order = ratios.map((ratio, index) => ({ ratio, index })).sort((a, b) => a.ratio - b.ratio);
  const min = order[0].ratio || 1;
  const tilt = -8 + controls.brightness * 14;
  const partials = order.map(({ ratio }, sortedIndex) => {
    const octaves = Math.log2(Math.max(ratio, 1e-6) / min);
    let gainDb = tilt * octaves;
    const odd = sortedIndex % 2 === 0;
    gainDb += controls.oddEven * (odd ? 8 : -8);
    // Decay is T60 in seconds: the time for this partial to fall 60 dB.
    const decay = (2.8 * (1.05 - 0.85 * controls.damping)) / 2 ** (octaves * (0.3 + controls.damping * 1.4));
    return {
      ratio,
      gainDb,
      decay: clamp(decay, 0.05, 30),
    };
  });
  if (controls.preset === 'bell') {
    partials.forEach((partial, index) => {
      const octaves = Math.log2(Math.max(partial.ratio, 1e-6) / min);
      partial.gainDb = bellStrikeDb(partial.ratio) + controls.brightness * 4 * octaves;
      partial.gainDb += controls.oddEven * (index % 2 === 0 ? 6 : -6);
    });
  }
  if (controls.voice === 'gong') {
    for (const partial of partials) {
      const toward = Math.abs(Math.log2(partial.ratio / 2.7));
      partial.gainDb = partial.ratio >= 1.8 && partial.ratio <= 4.2 ? -5 * toward : -9 - 4 * toward;
    }
  }
  if (controls.preset === 'open-pipe') {
    const fund = partials[0].ratio || 1;
    for (const partial of partials) {
      const harm = partial.ratio / fund;
      const octaves = Math.log2(Math.max(harm, 1));
      if (harm < 1.5) partial.gainDb -= 3;
      else if (harm < 6.5) partial.gainDb += 3.5;
      partial.gainDb += octaves * 2.4;
      partial.decay = clamp(partial.decay * (1 + 0.5 * Math.min(octaves, 4)), 0.05, 30);
    }
  }
  if (controls.seed > 0) {
    const rand = mulberry32(controls.seed + 17);
    for (const partial of partials) partial.gainDb += (rand() - 0.5) * 4;
  }
  const peak = Math.max(...partials.map((partial) => partial.gainDb));
  for (const partial of partials) partial.gainDb = clamp(partial.gainDb - peak, -96, 0);
  return partials;
}

export function toCsv(partials) {
  const lines = ['Ratio;GainDB;Decay'];
  for (const partial of partials) {
    lines.push(`${partial.ratio.toFixed(4)};${partial.gainDb.toFixed(2)};${partial.decay.toFixed(3)}`);
  }
  return lines.join('\n') + '\n';
}

export function fromCsv(text) {
  const rows = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const header = rows[0].split(/[;,]/).map((cell) => cell.trim().toLowerCase());
  const ratioAt = header.indexOf('ratio');
  const gainAt = header.indexOf('gaindb');
  const decayAt = header.indexOf('decay');
  if (ratioAt < 0 || gainAt < 0 || decayAt < 0) {
    throw new Error('The file needs columns Ratio, GainDB and Decay.');
  }
  const delimiter = rows[0].includes(';') ? ';' : ',';
  const partials = [];
  for (const line of rows.slice(1)) {
    if (line.startsWith('//')) continue;
    const cells = line.split(delimiter);
    const ratio = Number(cells[ratioAt]);
    const gainDb = Number(cells[gainAt]);
    const decay = Number(cells[decayAt]);
    if (![ratio, gainDb, decay].every(Number.isFinite) || ratio <= 0) continue;
    partials.push({ ratio, gainDb, decay });
    if (partials.length === 256) break;
  }
  if (!partials.length) throw new Error('No partials were found in that file.');
  return partials;
}

export const NOTE_BUTTONS = ['C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5'];

export function noteFrequency(name) {
  const match = /^([A-G])(#)?(-?\d)$/.exec(name);
  if (!match) return 440;
  const semis = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const offset = semis[match[1]] + (match[2] ? 1 : 0) + (Number(match[3]) - 4) * 12;
  return 440 * 2 ** (offset / 12);
}
