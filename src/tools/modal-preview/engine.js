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

// Singing bowl (n,0) modes. Inácio, Henrique & Antunes, Acta Acustica united
// with Acustica 92 (2006), Table I, Bowl 1 (180 mm): 1, 2.8, 5.2, 8.1, 11.6,
// 15.6, 19.9 for (2,0) through (8,0). Glass bowls use the same series.
const BOWL_RATIOS = [1, 2.8, 5.2, 8.1, 11.6, 15.6, 19.9];

// Japanese bonsho, not a Western minor-third bell. Low modes are the Muromachi
// bell in Nishiguchi & Takasawa, J. Acoust. Soc. Jpn. 53 (1997) Table 1,
// divided by the (4,0) mode at 137.89 Hz. The upper partials are Obata &
// Tesima's series as quoted by Rossing, J. Acoust. Soc. Jpn. (E) 10 (1989):
// 247, 624, 850, 1100, 1380, 1640, 2050 Hz, kept only above the body modes.
const BONSHO_RATIOS = [1, 2.207, 2.906, 2.998, 3.308, 3.331, 4.068, 5.587, 6.64, 8.3, 9.45, 10.7];

// Mug. Bossart, Fleury & Apffel, arXiv:2501.01180 (2025): the handle splits the
// rim mode into 2800 and 2940 Hz, a ratio of 1.05. The modes above that follow
// the wine-glass series 2.32, 4.25, 6.63, 9.38.
const CUP_RATIOS = [1, 1.05, 2.32, 4.25, 6.63, 9.38];

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

function marimbaRatios() {
  // Undercut bar, tuned near 1:4:10. Bork, Applied Acoustics 46 (1995);
  // Rossing, Science of Percussion Instruments (1997). Higher modes stay on
  // the free-free bar once they sit above that tuned third.
  const b1 = barBeta(1);
  const free = Array.from({ length: 12 }, (_, i) => (barBeta(i + 1) / b1) ** 2);
  const tuned = [1, 4, 10];
  for (const ratio of free) if (ratio > 10.5) tuned.push(ratio);
  return tuned;
}

function gongRatios() {
  // Rossing, Percussive Notes (Fall 1982): axisymmetric modes of a Japanese
  // tamtam at 39, 162, 195, 318, 854, 879 and 1000 Hz, plus the radial family
  // f = 29 m^1.17 Hz from the same article. Legge & Fletcher, J. Acoust. Soc.
  // Am. 86 (1989): the high cluster grows satellite peaks a few percent away.
  const axis = [39, 162, 195, 318, 854, 879, 1000].map((freq) => freq / 39);
  const radial = [];
  for (let m = 3; m <= 14; m++) radial.push((29 * m ** 1.17) / 39);
  const cluster = [];
  for (const ratio of axis) {
    if (ratio < 15) continue;
    cluster.push(ratio * 0.975, ratio, ratio * 1.028);
  }
  const all = [...axis, ...radial, ...cluster].sort((a, b) => a - b);
  const out = [];
  for (const ratio of all) {
    if (out.length && Math.abs(ratio - out[out.length - 1]) / out[out.length - 1] < 0.008) continue;
    out.push(ratio);
  }
  return out;
}

function shellRatios() {
  // Donnell thin-shell frequencies for a short can (L/R = 1.7, h/R = 0.012,
  // ν = 0.29). Leissa, Vibration of Shells (NASA SP-288); the ring-frequency
  // picture is Cremer, Heckl & Ungar, Structure-Borne Sound.
  const nu = 0.29;
  const hOverR = 0.012;
  const lengthOverR = 1.7;
  const beta2 = (hOverR * hOverR) / 12;
  const modes = [];
  for (let m = 1; m <= 4; m++) {
    const lambda = (m * Math.PI) / lengthOverR;
    for (let n = 2; n <= 9; n++) {
      const k2 = lambda * lambda + n * n;
      const membrane = ((1 - nu * nu) * lambda ** 4) / (k2 * k2);
      const bending = beta2 * k2 * k2;
      modes.push(Math.sqrt(membrane + bending));
    }
  }
  modes.sort((a, b) => a - b);
  const fund = modes[0];
  const ratios = [];
  for (const value of modes) {
    const ratio = value / fund;
    if (ratios.length && ratio - ratios[ratios.length - 1] < 0.02) continue;
    ratios.push(ratio);
    if (ratios.length === 20) break;
  }
  return ratios;
}

function baseRatios(preset, voice) {
  if (voice === 'glass') return BOWL_RATIOS.slice();
  if (voice === 'gong') return gongRatios();
  if (voice === 'bonsho') return BONSHO_RATIOS.slice();
  if (voice === 'marimba') return marimbaRatios();
  if (voice === 'cup') return CUP_RATIOS.slice();
  if (voice === 'shell') return shellRatios();
  if (voice === 'neutral') return [1, 2, 3, 4, 5, 6, 7, 8];
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
  const voices = new Set(['glass', 'gong', 'bonsho', 'marimba', 'cup', 'shell', 'neutral']);
  const voice = voices.has(input?.voice) ? input.voice : '';
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
  if (controls.preset === 'bell' && !controls.voice) {
    partials.forEach((partial, index) => {
      const octaves = Math.log2(Math.max(partial.ratio, 1e-6) / min);
      partial.gainDb = bellStrikeDb(partial.ratio) + controls.brightness * 4 * octaves;
      partial.gainDb += controls.oddEven * (index % 2 === 0 ? 6 : -6);
    });
  }
  if (controls.voice === 'gong') {
    // The delayed shimmer sits on the high cluster, not the fundamental.
    for (const partial of partials) {
      const dist = Math.abs(Math.log2(partial.ratio / 22.5));
      partial.gainDb = partial.ratio > 12 ? -4.5 * dist : -11 - 2.5 * Math.abs(Math.log2(partial.ratio));
    }
  }
  if (controls.voice === 'bonsho' || controls.voice === 'glass' || controls.voice === 'gong' || controls.voice === 'marimba' || controls.voice === 'cup' || controls.voice === 'shell' || controls.voice === 'neutral') {
    const fund = {
      bonsho: 14,
      glass: 9,
      gong: 12,
      marimba: 2.4,
      cup: 2.2,
      shell: 1.8,
      neutral: 1.35,
    }[controls.voice];
    const slope = controls.voice === 'marimba' || controls.voice === 'cup' || controls.voice === 'shell' ? 0.85 : 0.42;
    const scale = 1.2 - controls.damping;
    for (const partial of partials) {
      const rise = Math.max(partial.ratio - 1, 0) ** 0.85;
      partial.decay = clamp((fund * scale) / (1 + slope * rise), 0.08, 30);
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

function dropCloseTwins(partials, minCents = 55) {
  // A 20 ms fit cannot separate modes a few dozen cents apart, and a quieter
  // twin still leaks into the louder one's level. Keep the lower frequency.
  if (!partials.length) return partials;
  const kept = [partials[0]];
  for (let i = 1; i < partials.length; i++) {
    const cents = 1200 * Math.log2(partials[i].ratio / kept[kept.length - 1].ratio);
    if (cents < minCents) continue;
    kept.push(partials[i]);
  }
  return kept;
}

export function previewPartials(rawControls) {
  const controls = sanitizeControls(rawControls);
  const partials = buildPartials(controls);
  // A plucked string rings for seconds. Fletcher & Rossing, The Physics of
  // Musical Instruments: partials stay harmonic, and internal friction plus
  // air damping take the upper ones first. Rubber is left on the short curve.
  let tuned = partials;
  if (controls.preset === 'string' && controls.voice !== 'neutral' && controls.damping < 0.7) {
    const fundRatio = partials[0]?.ratio || 1;
    const fundSeconds = 11 * (1 - 0.62 * controls.damping);
    tuned = partials.map((partial) => {
      const harm = Math.max(1, partial.ratio / fundRatio);
      // String.csv rolls off about 1/n. That is −20 dB per decade, not the
      // steeper default tilt, which drew the second partial as a cliff.
      return {
        ...partial,
        gainDb: clamp(-20 * Math.log10(harm), -96, 0),
        decay: clamp(fundSeconds / harm ** 0.85, 0.08, 30),
      };
    });
  }
  if (controls.voice === 'shell') {
    // The raw Donnell list has modes about 90–100 cents apart. A search that
    // wide locks onto the neighbor, about −90 to −100 cents, even though the
    // resonator is playing the listed frequency. Keep only modes a 20 ms fit
    // can assign, still on the shell formula.
    return dropCloseTwins(tuned, 110);
  }
  if (controls.preset === 'membrane' || controls.voice === 'bonsho' || controls.voice === 'glass' || controls.voice === 'gong') {
    return dropCloseTwins(tuned);
  }
  return tuned;
}

// If stiffness moved the partial nearest ratio 1, move the note with it.
// Then ratio × fundamental is the frequency the resonator plays.
export function alignReference(partials, fundamental) {
  if (!partials.length) return { partials, fundamental };
  let ref = partials[0];
  for (const partial of partials) {
    if (Math.abs(Math.log(partial.ratio)) < Math.abs(Math.log(ref.ratio))) ref = partial;
  }
  if (!(ref.ratio > 0) || Math.abs(ref.ratio - 1) <= 1e-4) return { partials, fundamental };
  const scale = ref.ratio;
  return {
    fundamental: fundamental * scale,
    partials: partials.map((partial) => ({ ...partial, ratio: partial.ratio / scale })),
  };
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
