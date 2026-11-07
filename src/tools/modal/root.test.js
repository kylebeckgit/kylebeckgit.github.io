import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateRoot } from './analyze.js';

const sampleRate = 44100;

function synthesize(partials, seconds = 2.4) {
  const length = Math.floor(sampleRate * seconds);
  const out = new Float32Array(length);
  for (const partial of partials) {
    const amp = 10 ** ((partial.gainDb || 0) / 20);
    const tau = (partial.decay || 1.8) / Math.log(1000);
    const freq = partial.freq;
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      out[i] += amp * Math.exp(-t / tau) * Math.sin(2 * Math.PI * freq * t);
    }
  }
  return out;
}

function expectNear(actual, expected, label) {
  const error = Math.abs(actual - expected) / expected;
  assert.ok(error < 0.02, `${label}: got ${actual.toFixed(2)} Hz, expected ${expected.toFixed(2)} Hz (${(error * 100).toFixed(2)}%)`);
  return error;
}

test('harmonic string locks to the fundamental', () => {
  const f0 = 196;
  const partials = [1, 2, 3, 4, 5, 6].map((n) => ({ freq: f0 * n, gainDb: -6 * (n - 1) }));
  const root = estimateRoot(synthesize(partials), sampleRate);
  expectNear(root.hz, f0, 'string');
  console.log('string', root.note, root.hz.toFixed(2), root.confidence);
});

test('bell prefers the prime over a quiet hum', () => {
  const prime = 220;
  const partials = [
    { freq: prime * 0.5, gainDb: -14 },
    { freq: prime, gainDb: 0 },
    { freq: prime * 1.2, gainDb: -4 },
    { freq: prime * 1.5, gainDb: -7 },
    { freq: prime * 2, gainDb: -9 },
    { freq: prime * 2.5, gainDb: -12 },
    { freq: prime * 3, gainDb: -14 },
    { freq: prime * 4, gainDb: -16 },
  ];
  const root = estimateRoot(synthesize(partials), sampleRate);
  expectNear(root.hz, prime, 'bell');
  console.log('bell', root.note, root.hz.toFixed(2), root.confidence);
});

test('bar uses its inharmonic fundamental', () => {
  const betas = [4.730040744862704, 7.853204624095838, 10.995607838001671, 14.137165491257464, 17.278759657399481];
  const f0 = 180;
  const partials = betas.map((beta, index) => ({
    freq: f0 * (beta / betas[0]) ** 2,
    gainDb: -5 * index,
  }));
  const root = estimateRoot(synthesize(partials), sampleRate);
  expectNear(root.hz, f0, 'bar');
  console.log('bar', root.note, root.hz.toFixed(2), root.confidence);
});

test('stretched piano stays on the tuned fundamental', () => {
  const f0 = 440;
  const stiffness = 0.0004;
  const partials = [];
  for (let n = 1; n <= 8; n++) {
    partials.push({ freq: n * f0 * Math.sqrt(1 + stiffness * n * n), gainDb: -4 * (n - 1) });
  }
  const root = estimateRoot(synthesize(partials), sampleRate);
  expectNear(root.hz, f0, 'piano');
  console.log('piano', root.note, root.hz.toFixed(2), root.confidence);
});

test('missing fundamental is recovered from the harmonic stack', () => {
  const f0 = 130.81;
  const partials = [2, 3, 4, 5, 6].map((n, index) => ({ freq: f0 * n, gainDb: -3 * index }));
  const root = estimateRoot(synthesize(partials), sampleRate);
  expectNear(root.hz, f0, 'missing');
  console.log('missing', root.note, root.hz.toFixed(2), root.confidence);
});
