import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  audioForBasicPitch,
  BASIC_PITCH_RATE,
  disposeTensors,
  onsetTimesFromNotes,
  pitchFromNotes,
  runBasicPitch,
} from './pitch-model.js';
import { midiToHz } from './dsp.js';

function fakeTensor(values) {
  let disposed = false;
  return {
    dataSync() {
      if (disposed) throw new Error('tensor already disposed');
      return values;
    },
    dispose() {
      if (disposed) throw new Error('double dispose');
      disposed = true;
    },
    get disposed() { return disposed; },
  };
}

function sine(hz, seconds, sampleRate = 44100, amp = 0.5) {
  const n = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / (sampleRate * 0.02), (n - i) / (sampleRate * 0.02));
    samples[i] = Math.sin(2 * Math.PI * hz * i / sampleRate) * amp * env;
  }
  return samples;
}

async function loadGraphModelFromDir(dir) {
  const tf = await import('@tensorflow/tfjs');
  await tf.setBackend('cpu');
  await tf.ready();
  const modelJSON = JSON.parse(readFileSync(path.join(dir, 'model.json'), 'utf8'));
  const manifest = modelJSON.weightsManifest || [];
  const weightSpecs = [];
  const chunks = [];
  for (const group of manifest) {
    weightSpecs.push(...(group.weights || []));
    for (const name of group.paths || []) {
      chunks.push(readFileSync(path.join(dir, name)));
    }
  }
  const weightData = Buffer.concat(chunks).buffer;
  return tf.loadGraphModel({
    load: async () => ({
      modelTopology: modelJSON.modelTopology,
      format: modelJSON.format,
      generatedBy: modelJSON.generatedBy,
      convertedBy: modelJSON.convertedBy,
      weightSpecs,
      weightData,
    }),
  });
}

function modelDir() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../../../models/basic-pitch'),
    path.resolve(process.cwd(), 'models/basic-pitch'),
  ];
  return candidates.find((dir) => existsSync(path.join(dir, 'model.json')));
}

describe('pitch model helpers', () => {
  it('disposes TF.js tensors after dataSync, including when reading throws', () => {
    const tensors = [fakeTensor([0, 0.8]), fakeTensor([0.9])];
    assert.equal(disposeTensors(tensors), 2);
    assert.equal(tensors.every((t) => t.disposed), true);
    assert.equal(disposeTensors(tensors), 0);
    const broken = [fakeTensor([0.9])];
    try { onsetTimesFromNotes(); } catch { /* n/a */ }
    assert.equal(disposeTensors(broken), 1);
  });

  it('offsets onset times across windows and picks the strongest note for f0', () => {
    const notes = [
      { startTimeSeconds: 0.05, durationSeconds: 0.1, amplitude: 0.2, pitchMidi: 60 },
      { startTimeSeconds: 1.2, durationSeconds: 0.8, amplitude: 0.9, pitchMidi: 69 },
      { startTimeSeconds: 1.22, durationSeconds: 0.1, amplitude: 0.2, pitchMidi: 81 },
    ];
    const times = onsetTimesFromNotes(notes);
    assert.deepEqual(times, [0.05, 1.2]);
    const pitch = pitchFromNotes(notes);
    assert.equal(pitch.pitched, true);
    assert.equal(pitch.midi, 69);
    assert.ok(Math.abs(pitch.f0Hz - midiToHz(69)) < 0.01);
    const audio = audioForBasicPitch(sine(440, 0.2, 44100), 44100);
    assert.ok(Math.abs(audio.length / BASIC_PITCH_RATE - 0.2) < 0.01);
  });
});

describe('basic pitch model', () => {
  it('detects the MIDI note of a 440 Hz sine with the real model and no YIN fallback', { timeout: 120000 }, async () => {
    const dir = modelDir();
    assert.ok(dir, 'models/basic-pitch/model.json should exist');
    const graph = await loadGraphModelFromDir(dir);
    const { BasicPitch } = await import('@spotify/basic-pitch');
    const model = new BasicPitch(Promise.resolve(graph));
    const samples = sine(440, 2, 44100, 0.5);
    const result = await runBasicPitch(samples, 44100, model);
    assert.equal(result.source, 'basic-pitch');
    assert.equal(result.pitched, true);
    assert.ok(Number.isFinite(result.midi), `expected a MIDI note, got ${result.midi}`);
    assert.ok(Math.abs(result.midi - 69) <= 1, `expected MIDI 69 (A4), got ${result.midi}`);
    assert.ok(Math.abs(result.f0Hz - 440) < 30, `expected ~440 Hz, got ${result.f0Hz}`);
  });
});
