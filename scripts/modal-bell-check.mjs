import { writeFile, mkdir } from 'node:fs/promises';
import { buildPartials, toCsv } from '../src/tools/modal/engine.js';
import { analyzeSamples } from '../src/tools/modal/analyze.js';
import { renderPreview, peakStats, workletSource } from '../src/tools/modal/resonator.js';

const sampleRate = 44100;
const prime = 220;
const recipe = [
  { ratio: 0.5, gainDb: -9, decay: 4.2 },
  { ratio: 1, gainDb: 0, decay: 3.4 },
  { ratio: 1.2, gainDb: -3.5, decay: 2.6 },
  { ratio: 1.5, gainDb: -6, decay: 2.2 },
  { ratio: 2, gainDb: -8, decay: 1.8 },
  { ratio: 2.5, gainDb: -11, decay: 1.4 },
  { ratio: 3, gainDb: -13, decay: 1.15 },
  { ratio: 4, gainDb: -16, decay: 0.9 },
];

function synthesizeBell() {
  const seconds = 6;
  const length = Math.floor(sampleRate * seconds);
  const out = new Float32Array(length);
  for (const partial of recipe) {
    const amp = 10 ** (partial.gainDb / 20);
    const tau = partial.decay / Math.log(1000);
    const freq = prime * partial.ratio;
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      out[i] += amp * Math.exp(-t / tau) * Math.sin(2 * Math.PI * freq * t);
    }
  }
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) for (let i = 0; i < length; i++) out[i] = (out[i] / peak) * 0.7;
  return out;
}

function nearest(partials, ratio) {
  let best = partials[0];
  let error = Infinity;
  for (const partial of partials) {
    const next = Math.abs(partial.ratio - ratio);
    if (next < error) {
      error = next;
      best = partial;
    }
  }
  return best;
}

function wavBytes(samples, rate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
}

const worklet = workletSource();
if (!worklet.includes('registerProcessor') || !worklet.includes('function processSample')) {
  throw new Error('Worklet source is missing the resonator.');
}

const bell = synthesizeBell();
const auto = analyzeSamples(bell, sampleRate, { thresholdDb: 40, maxPartials: 16 });
const guided = analyzeSamples(bell, sampleRate, { fundamental: prime, thresholdDb: 40, maxPartials: 16 });

const harmonic = new Float32Array(sampleRate * 2);
for (const ratio of [1, 2, 3, 4, 5]) {
  const amp = 1 / ratio;
  for (let i = 0; i < harmonic.length; i++) {
    const t = i / sampleRate;
    harmonic[i] += amp * Math.exp(-t / 1.2) * Math.sin(2 * Math.PI * 196 * ratio * t);
  }
}
const harmonicResult = analyzeSamples(harmonic, sampleRate, { thresholdDb: 40, maxPartials: 8 });
console.log('harmonic auto fundamental', harmonicResult.fundamental.toFixed(2), 'expected 196');

const noisy = new Float32Array(bell.length);
let seed = 0x1234567;
for (let i = 0; i < bell.length; i++) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  noisy[i] = bell[i] + ((seed / 4294967296) * 2 - 1) * 0.02;
}
const noisyResult = analyzeSamples(noisy, sampleRate, { fundamental: prime, thresholdDb: 30, maxPartials: 16 });
console.log('noisy partials', noisyResult.partials.length, 'fallback', noisyResult.usedFallbackDecay);

console.log('auto fundamental', auto.fundamental.toFixed(2));
console.log('guided partials', guided.partials.length);
let ratioSum = 0;
let decaySum = 0;
for (const expected of recipe) {
  const found = nearest(guided.partials, expected.ratio);
  const ratioError = (100 * (found.ratio - expected.ratio)) / expected.ratio;
  const decayError = (100 * (found.decay - expected.decay)) / expected.decay;
  ratioSum += Math.abs(ratioError);
  decaySum += Math.abs(decayError);
  console.log(
    `ratio ${expected.ratio.toFixed(2)} -> ${found.ratio.toFixed(4)} (${ratioError.toFixed(2)}%), ` +
    `T60 ${expected.decay.toFixed(2)} -> ${found.decay.toFixed(3)} (${decayError.toFixed(1)}%)`,
  );
}
console.log('mean abs ratio error %', (ratioSum / recipe.length).toFixed(3));
console.log('mean abs decay error %', (decaySum / recipe.length).toFixed(1));

const csv = toCsv(guided.partials);
if (!csv.startsWith('Ratio;GainDB;Decay\n') || csv.includes('//')) {
  throw new Error('CSV header changed.');
}

const profile = buildPartials({ preset: 'bell', stiffness: 0, brightness: 0, damping: 0.35, oddEven: 0, seed: 0 });
const outDir = '/tmp/modal-examples';
await mkdir(outDir, { recursive: true });
let bytes = 0;
for (const exciter of ['click', 'mallet', 'bow']) {
  const audio = renderPreview(profile, {
    exciter,
    fundamental: 220,
    velocity: 0.85,
    position: 0.22,
    hardness: 0.65,
    seconds: 3.2,
    sampleRate,
    releaseAt: exciter === 'bow' ? 2.4 : 3.2,
  });
  const stats = peakStats(audio);
  const file = `${outDir}/${exciter}.wav`;
  const data = wavBytes(audio, sampleRate);
  await writeFile(file, data);
  bytes += data.length;
  console.log(exciter, 'peak', stats.peak.toFixed(3), 'rms', stats.rms.toFixed(3), 'bytes', data.length);
}
console.log('example bytes', bytes);
if (bytes > 15 * 1024 * 1024) throw new Error('Examples are over 15 MB.');
