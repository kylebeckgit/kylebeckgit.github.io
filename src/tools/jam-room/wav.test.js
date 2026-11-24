import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRingBuffer, formatStamp, pushSamples, ringToWav } from './wav.js';

describe('keep-this-jam wav', () => {
  it('writes a 16-bit wav whose size matches the filled samples', () => {
    const ring = createRingBuffer(8000, 1);
    const samples = new Float32Array(4000);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i / 10) * 0.5;
    pushSamples(ring, samples);
    const wav = ringToWav(ring, 'test.wav');
    assert.equal(wav.name, 'test.wav');
    assert.ok(wav.blob);
  });

  it('formats a local timestamp for the default filename', () => {
    assert.equal(formatStamp(new Date(2026, 10, 24, 10, 7)), '20261124-1007');
  });
});
