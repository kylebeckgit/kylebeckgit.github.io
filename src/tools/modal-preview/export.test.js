import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { renderPreview, strikeWeight } from './resonator.js';
import {
  A4_HZ,
  ZEBRA_DECAY_MAX,
  ZEBRA_PARTIAL_LIMIT_HZ,
  audiblePartials,
  exportFileName,
  fromCsv,
  zebraDecayKnob,
  zebraDecaySeconds,
  zebraExport,
} from './engine.js';
import { rollSound } from './randomize.js';

function rowsOf(csv) {
  return csv.trim().split('\n').slice(1).map((line) => {
    const [ratio, gainDb, decay] = line.split(';').map(Number);
    return { ratio, gainDb, decay };
  });
}

function assertRoundTrip(partials, description) {
  const preview = audiblePartials(partials);
  const exported = zebraExport(partials, { description });
  const rows = rowsOf(exported.csv);
  assert.equal(exported.knob, zebraDecayKnob(exported.tmax));
  assert.ok(exported.knob >= 0 && exported.knob <= 100);
  assert.equal(Math.max(...rows.map((row) => row.decay)), 1);
  for (const row of rows) {
    assert.ok(row.decay > 0 && row.decay <= 1, row.decay);
    assert.ok(row.ratio * A4_HZ <= ZEBRA_PARTIAL_LIMIT_HZ, row.ratio);
  }
  // Half a step of Zebra's integer Decay knob is 2^0.05, about 3.5%.
  const step = 2 ** (0.5 / 10) - 1;
  rows.forEach((row, index) => {
    const rendered = zebraDecaySeconds(row.decay, exported.knob);
    const target = preview[index].decay;
    const error = Math.abs(rendered - target) / target;
    assert.ok(error <= step + 1e-9, `${description} ${error} knob ${exported.knob}`);
  });
  assert.match(exported.filename, new RegExp(`_decay${exported.knob}\\.csv$`));
  assert.equal(exported.filename.includes('zebra3_ai_profile'), false);
  assert.equal(exported.hint, `In Zebra, set Decay to ${exported.knob}, Position 0, other modal knobs at 0. Rows stop at 6 kHz when the fundamental is A4.`);
  return exported;
}

test('exported decay is a fraction and the knob restores the preview', () => {
  for (const material of ['wood', 'bell', 'wild']) {
    for (let seed = 1; seed <= 12; seed++) {
      const rolled = rollSound({
        material,
        wildness: material === 'wild' ? 1 : 0.3,
        amount: 1,
        seed,
      });
      assertRoundTrip(rolled.partials, rolled.description);
    }
  }
});

test('a decay longer than Zebra can play caps at knob 100', () => {
  const exported = zebraExport([
    { ratio: 1, gainDb: 0, decay: 40 },
    { ratio: 2.5, gainDb: -8, decay: 48 },
  ], { description: 'Long bell strike' });
  assert.equal(exported.knob, 100);
  assert.equal(exported.tmax, ZEBRA_DECAY_MAX);
  assert.equal(exported.filename, 'long-bell-strike_decay100.csv');
  const rows = rowsOf(exported.csv);
  assert.equal(Math.max(...rows.map((row) => row.decay)), 1);
  const rendered = rows.map((row) => zebraDecaySeconds(row.decay, 100));
  assert.ok(Math.max(...rendered) <= ZEBRA_DECAY_MAX + 1e-9);
  for (const seconds of rendered) {
    assert.ok(Math.abs(seconds - Math.min(seconds, ZEBRA_DECAY_MAX)) < 1e-6);
  }
});

test('an exported file imports back to the preview decays', () => {
  const rolled = rollSound({ material: 'bell', wildness: 1, amount: 1, seed: 4 });
  const preview = audiblePartials(rolled.partials);
  const exported = zebraExport(rolled.partials, { description: rolled.description });
  const restored = fromCsv(exported.csv, { filename: exported.filename });
  assert.equal(restored.length, preview.length);
  const step = 2 ** (0.5 / 10) - 1;
  restored.forEach((partial, index) => {
    const error = Math.abs(partial.decay - preview[index].decay) / preview[index].decay;
    assert.ok(error <= step + 1e-9, `${partial.decay} vs ${preview[index].decay}`);
    assert.equal(partial.ratio, Number(preview[index].ratio.toFixed(4)));
  });
  const renamed = fromCsv(exported.csv, { filename: exported.filename.replace(/\.csv$/, ' (1).csv') });
  assert.ok(Math.abs(renamed[0].decay - restored[0].decay) < 1e-6);
  const legacy = fromCsv('Ratio;GainDB;Decay\n1.0000;0.00;4.500\n2.0000;-6.00;2.250\n', { filename: 'old-profile.csv' });
  assert.equal(legacy[0].decay, 4.5);
  assert.equal(legacy[1].decay, 2.25);
});

test('a gong glide bends the low partials', () => {
  const sampleRate = 48000;
  const options = { fundamental: 220, sampleRate, seconds: 1.6, matchGains: true };
  const plain = renderPreview([{ ratio: 1, gainDb: 0, decay: 4 }], options);
  const bent = renderPreview([{ ratio: 1, gainDb: 0, decay: 4 }], {
    ...options,
    glide: { cents: 35, seconds: 0.45, maxRatio: 6 },
  });
  function rate(samples) {
    const start = Math.floor(0.6 * sampleRate);
    const end = Math.floor(1.5 * sampleRate);
    let count = 0;
    for (let i = start + 1; i < end; i++) {
      if (samples[i - 1] <= 0 && samples[i] > 0) count += 1;
    }
    return count;
  }
  const cents = 1200 * Math.log2(rate(bent) / rate(plain));
  assert.ok(Math.abs(cents - 35) < 8, `glide landed at ${cents.toFixed(1)} cents`);
  const high = renderPreview([{ ratio: 8, gainDb: 0, decay: 4 }], {
    ...options,
    glide: { cents: 35, seconds: 0.45, maxRatio: 6 },
  });
  const highPlain = renderPreview([{ ratio: 8, gainDb: 0, decay: 4 }], options);
  const highCents = 1200 * Math.log2(rate(high) / rate(highPlain));
  assert.ok(Math.abs(highCents) < 8, `a partial above the glide limit moved ${highCents.toFixed(1)} cents`);
});

test('a resting position does not duck the fundamental', () => {
  assert.equal(strikeWeight(0, 0.02), 1);
  assert.equal(strikeWeight(7, 0.02), 1);
  assert.ok(Math.abs(strikeWeight(0, 0.18) - Math.sin(Math.PI * 0.18)) < 1e-9);
  const worklet = readFileSync(new URL('../../../modal-preview-resonator.worklet.js', import.meta.url), 'utf8');
  assert.match(worklet, /pos <= 0\.02\) return 1/);
});

function mixedRowLevels(samples, partials, fundamental, sampleRate) {
  // One damped sinusoid per row, solved together so a short neighbor is not
  // counted as part of a louder mode.
  const n = Math.min(samples.length, Math.floor(0.2 * sampleRate));
  const count = partials.length;
  const cols = count * 2;
  const column = Array.from({ length: cols }, () => new Float64Array(n));
  partials.forEach((partial, index) => {
    const tau = partial.decay / Math.log(1000);
    const radius = Math.exp(-1 / (tau * sampleRate));
    const omega = (2 * Math.PI * fundamental * partial.ratio) / sampleRate;
    let env = 1;
    for (let i = 0; i < n; i++) {
      column[index * 2][i] = env * Math.cos(omega * i);
      column[index * 2 + 1][i] = env * Math.sin(omega * i);
      env *= radius;
    }
  });
  const y = Float64Array.from(samples.subarray(0, n));
  const ata = Array.from({ length: cols }, () => new Float64Array(cols));
  const atb = new Float64Array(cols);
  for (let a = 0; a < cols; a++) {
    let dot = 0;
    for (let i = 0; i < n; i++) dot += column[a][i] * y[i];
    atb[a] = dot;
    for (let b = a; b < cols; b++) {
      let prod = 0;
      for (let i = 0; i < n; i++) prod += column[a][i] * column[b][i];
      ata[a][b] = prod;
      ata[b][a] = prod;
    }
  }
  const matrix = ata.map((row, index) => { const copy = Array.from(row); copy.push(atb[index]); return copy; });
  for (let i = 0; i < cols; i++) {
    let pivot = i;
    for (let row = i + 1; row < cols; row++) if (Math.abs(matrix[row][i]) > Math.abs(matrix[pivot][i])) pivot = row;
    [matrix[i], matrix[pivot]] = [matrix[pivot], matrix[i]];
    const scale = matrix[i][i] || 1e-30;
    for (let col = i; col <= cols; col++) matrix[i][col] /= scale;
    for (let row = 0; row < cols; row++) {
      if (row === i) continue;
      const factor = matrix[row][i];
      for (let col = i; col <= cols; col++) matrix[row][col] -= factor * matrix[i][col];
    }
  }
  return partials.map((_, index) => Math.hypot(matrix[index * 2][cols], matrix[index * 2 + 1][cols]));
}

test('a mixed preview stays within 2 dB of GainDB on every row', () => {
  for (const material of ['wood', 'skin', 'any', 'wild']) {
    const rolled = rollSound({ material, wildness: 0, amount: 1, seed: 3 });
    const partials = audiblePartials(rolled.partials).slice(0, 8);
    assert.ok(partials.some((partial) => partial.decay < 0.12), material);
    const sampleRate = 48000;
    const fundamental = 440;
    const samples = renderPreview(partials, { fundamental, sampleRate, seconds: 0.25, matchGains: true });
    const levels = mixedRowLevels(samples, partials, fundamental, sampleRate);
    partials.forEach((partial, index) => {
      const heard = 20 * Math.log10(levels[index] / levels[0]);
      const wanted = partial.gainDb - partials[0].gainDb;
      const error = Math.abs(heard - wanted);
      assert.ok(error <= 2, `${material} row ${index + 1} t60 ${partial.decay.toFixed(3)} err ${error.toFixed(2)} dB`);
    });
  }
});

test('rows above 6 kHz at A4 and above Nyquist stay out of the file', () => {
  const exported = zebraExport([
    { ratio: 1, gainDb: 0, decay: 2 },
    { ratio: 10, gainDb: -6, decay: 1.2 },
    { ratio: ZEBRA_PARTIAL_LIMIT_HZ / A4_HZ + 0.2, gainDb: -12, decay: 0.8 },
    { ratio: 40, gainDb: -18, decay: 0.4 },
  ], { fundamental: 8000, sampleRate: 48000, description: 'Bright metal ring' });
  const rows = rowsOf(exported.csv);
  assert.ok(rows.length >= 1 && rows.length < 4);
  for (const row of rows) {
    assert.ok(row.ratio * A4_HZ <= ZEBRA_PARTIAL_LIMIT_HZ);
    assert.ok(row.ratio * 8000 <= 24000);
  }
  assert.equal(exported.filename.startsWith('bright-metal-ring_decay'), true);
});
