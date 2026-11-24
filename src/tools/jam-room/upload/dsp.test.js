import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePitchYin,
  dbFromAmp,
  isNearSilence,
  isPureNoise,
  normalizeAndLimit,
  peakAbs,
  resample,
  rms,
  TARGET_RATE,
  trimSilence,
} from './dsp.js';
import { nearestScaleMidi, pickBestSlices, playbackRateToMidi } from './musical.js';
import { prepareUploadSamples, processSamples, rejectIfTooLarge, selectBestProcessedWindow } from './process.js';
import { decodeWav16, encodeWav16 } from './wav16.js';

function sine(hz, seconds, sampleRate = 44100, amp = 0.4) {
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin(2 * Math.PI * hz * i / sampleRate) * amp;
  return out;
}

function noise(seconds, sampleRate = 44100) {
  const n = Math.floor(sampleRate * seconds);
  const out = new Float32Array(n);
  let x = 1;
  for (let i = 0; i < n; i++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    out[i] = (x / 0xffffffff) * 2 - 1;
  }
  return out;
}

describe('upload dsp', () => {
  it('trims leading silence, normalizes, and rejects near-silence', () => {
    const sampleRate = 44100;
    const quiet = new Float32Array(sampleRate);
    const tone = sine(440, 0.4, sampleRate, 0.5);
    const mixed = new Float32Array(quiet.length + tone.length);
    mixed.set(tone, quiet.length);
    const trimmed = trimSilence(mixed, sampleRate);
    assert.ok(trimmed.length < mixed.length * 0.6);
    const limited = normalizeAndLimit(tone);
    assert.ok(peakAbs(limited) <= 10 ** (-1 / 20) + 1e-6);
    assert.equal(isNearSilence(new Float32Array(2205), sampleRate), true);
  });

  it('detects a pitched tone with YIN and maps it to the room scale', () => {
    const sampleRate = 44100;
    const samples = sine(220, 0.6, sampleRate, 0.5);
    const pitch = analyzePitchYin(samples, sampleRate);
    assert.equal(pitch.pitched, true);
    assert.ok(Math.abs(pitch.f0Hz - 220) < 5);
    const mapped = nearestScaleMidi(220, 'A', 'calm');
    // A2 is 110, A3 is 220, which is in the A major pentatonic.
    assert.ok(Math.abs(mapped.hz - 220) < 1);
    assert.equal(playbackRateToMidi(57, 59), 2 ** (2 / 12));
  });

  it('finds a delayed note after leading silence, then processSamples analyzes the trimmed buffer', () => {
    const sampleRate = 44100;
    const silence = new Float32Array(sampleRate);
    const tone = sine(220, 0.6, sampleRate, 0.5);
    const delayed = new Float32Array(silence.length + tone.length);
    delayed.set(tone, silence.length);
    const pitch = analyzePitchYin(delayed, sampleRate);
    assert.equal(pitch.pitched, true);
    assert.ok(Math.abs(pitch.f0Hz - 220) < 5);
    const processed = processSamples(delayed, sampleRate, { keyRoot: 'A', mood: 'calm' });
    assert.equal(processed.ok, true);
    assert.equal(processed.meta.kind, 'pitched');
    assert.ok(Math.abs(processed.meta.f0Hz - 220) < 5);
    assert.ok(processed.samples.length < delayed.length * 0.8);
  });

  it('rejects pure noise and oversize files, and processes a tone to 4 s or less', () => {
    const sampleRate = 44100;
    assert.equal(isPureNoise(noise(0.8, sampleRate), sampleRate), true);
    assert.ok(rejectIfTooLarge(5 * 1024 * 1024 + 1));
    assert.equal(rejectIfTooLarge(1024), null);
    const long = sine(330, 6, sampleRate, 0.4);
    const result = processSamples(long, sampleRate, { keyRoot: 'D', mood: 'calm' });
    assert.equal(result.ok, true);
    assert.ok(result.samples.length / sampleRate <= 4.01);
    assert.equal(result.meta.kind, 'pitched');
    const tiny = processSamples(sine(440, 0.02, sampleRate, 0.01), sampleRate, { keyRoot: 'D', mood: 'calm' });
    assert.equal(tiny.ok, false);
  });

  it('picks a spread of unpitched slices and forces speech to 100 percent resonance', () => {
    const hits = [
      { startMs: 0, endMs: 120, slot: 'hat' },
      { startMs: 200, endMs: 400, slot: 'kick' },
      { startMs: 500, endMs: 620, slot: 'snare' },
    ];
    const picked = pickBestSlices(hits, {});
    assert.deepEqual(picked.map((s) => s.slot).sort(), ['hat', 'kick', 'snare']);
    const tone = sine(196, 0.5, 44100, 0.4);
    const result = processSamples(tone, 44100, { keyRoot: 'G', mood: 'calm' }, { speech: true });
    assert.equal(result.ok, true);
    assert.equal(result.meta.speech, true);
    assert.equal(result.meta.resonanceMix, 1);
  });

  it('round-trips a 16-bit wav', () => {
    const samples = sine(100, 0.1, 44100, 0.25);
    const bytes = encodeWav16(samples, 44100);
    const decoded = decodeWav16(bytes);
    assert.equal(decoded.sampleRate, 44100);
    assert.ok(Math.abs(decoded.durationMs - 100) < 2);
    assert.ok(Math.abs(rms(decoded.samples) - rms(samples)) < 0.02);
    assert.ok(dbFromAmp(peakAbs(decoded.samples)) < 0);
  });

  it('resamples processed clips to TARGET_RATE so 88.2 and 96 kHz uploads encode as valid wavs', () => {
    for (const rate of [88200, 96000]) {
      const samples = sine(440, 0.4, rate, 0.4);
      const result = processSamples(samples, rate, { keyRoot: 'D', mood: 'calm' });
      assert.equal(result.ok, true);
      assert.equal(result.sampleRate, TARGET_RATE);
      const expected = Math.round(result.meta.durationMs / 1000 * TARGET_RATE);
      assert.ok(Math.abs(result.samples.length - expected) <= 2);
      const wav = encodeWav16(result.samples, result.sampleRate);
      const decoded = decodeWav16(wav);
      assert.equal(decoded.sampleRate, TARGET_RATE);
      assert.ok(decoded.samples.length > TARGET_RATE * 0.2);
    }
    const unchanged = resample(sine(440, 0.1, TARGET_RATE, 0.3), TARGET_RATE, TARGET_RATE);
    assert.equal(unchanged.length, Math.floor(TARGET_RATE * 0.1));
  });

  it('keeps an 8 second take and uses the densest 4 second window, not the first 4 seconds', () => {
    const sampleRate = 8000;
    const samples = new Float32Array(sampleRate * 8);
    for (let i = 0; i < sampleRate * 4; i++) samples[i] = 0.03 * Math.sin(2 * Math.PI * 80 * i / sampleRate);
    for (let hit = 0; hit < 6; hit++) {
      const start = sampleRate * 4 + Math.floor(hit * sampleRate * 0.5);
      for (let i = 0; i < Math.floor(sampleRate * 0.04); i++) samples[start + i] = 0.9;
    }
    const windowed = selectBestProcessedWindow(samples, sampleRate);
    assert.equal(windowed.usedBestWindow, true);
    assert.ok(windowed.start > 0);
    assert.ok(windowed.start <= sampleRate * 4);
    assert.ok(windowed.start + windowed.samples.length >= sampleRate * 6.5);
    assert.ok(windowed.samples.length / sampleRate <= 4.01);
    const prepared = prepareUploadSamples(samples, sampleRate);
    assert.equal(prepared.ok, true);
    assert.equal(prepared.usedBestWindow, true);
    assert.ok(prepared.windowStart > 0);
    assert.ok(prepared.samples.length / sampleRate <= 4.01);
    assert.ok(rms(prepared.samples) > rms(samples.subarray(0, sampleRate * 4)));
    const short = prepareUploadSamples(sine(440, 2, sampleRate, 0.4), sampleRate);
    assert.equal(short.ok, true);
    assert.equal(short.usedBestWindow, false);
  });
});
