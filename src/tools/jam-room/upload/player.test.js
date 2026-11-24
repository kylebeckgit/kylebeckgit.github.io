import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clipIsSpeech, resonateClip, resolvePlaybackRate, samplesForApprovedClip, sliceClip } from './player.js';

function sine(hz, seconds, sampleRate = 22050) {
  const n = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = Math.sin(2 * Math.PI * hz * i / sampleRate) * 0.4;
  return samples;
}

describe('upload playback', () => {
  it('renders speech at 100 percent wet through the resonator', () => {
    const samples = sine(220, 0.2);
    const result = resonateClip(samples, 22050, { speech: true, resonanceMix: 1, kind: 'pitched', recordedMidi: 57, targetMidi: 62 }, { keyRoot: 'D', mood: 'calm', materials: { melody: 'glass' } });
    assert.equal(result.mix, 1);
    assert.ok(result.samples.length > 0);
    let peak = 0;
    for (const s of result.samples) peak = Math.max(peak, Math.abs(s));
    assert.ok(peak > 0.05);
  });

  it('maps pitched clips toward the current room note and slices unpitched hits', () => {
    const play = resolvePlaybackRate({ kind: 'pitched', recordedMidi: 60, targetMidi: 64 }, { keyRoot: 'C', mood: 'calm' });
    assert.ok(play.rate > 1);
    const clip = sine(200, 1, 1000);
    const sliced = sliceClip(clip, 1000, { slices: [{ startMs: 100, endMs: 200, slot: 'hat' }] });
    assert.equal(sliced.length, 100);
  });

  it('skips slicing when the server marks a clip as speech, even if meta.kind is unpitched', () => {
    const clip = sine(200, 1, 1000);
    const slices = [{ startMs: 100, endMs: 200, slot: 'hat' }, { startMs: 300, endMs: 400, slot: 'snare' }];
    const unpitched = { kind: 'unpitched', speech: false, resonanceMix: 0.4, slices };
    const sliced = samplesForApprovedClip(clip, 1000, { meta: unpitched }, 0);
    assert.equal(sliced.speech, false);
    assert.equal(sliced.samples.length, 100);

    const byFlag = samplesForApprovedClip(clip, 1000, { speech: true, hasSpeech: true, meta: unpitched }, 0);
    assert.equal(byFlag.speech, true);
    assert.equal(byFlag.samples.length, clip.length);
    assert.equal(byFlag.samples, clip);
    assert.equal(byFlag.meta.resonanceMix, 1);
    assert.equal(byFlag.meta.speech, true);

    const byHasSpeech = samplesForApprovedClip(clip, 1000, { hasSpeech: true, meta: { ...unpitched } }, 1);
    assert.equal(byHasSpeech.samples.length, clip.length);

    const serverNo = samplesForApprovedClip(clip, 1000, { speech: false, hasSpeech: false, meta: { ...unpitched, speech: true } }, 0);
    assert.equal(serverNo.speech, false);
    assert.equal(serverNo.samples.length, 100);

    assert.equal(clipIsSpeech({ speech: true, meta: { kind: 'unpitched' } }), true);
    assert.equal(clipIsSpeech({ speech: false, meta: { speech: true, kind: 'unpitched' } }), false);
  });

  it('applies the resolved playback rate to the dry path so pitched clips land in the room key', () => {
    const sampleRate = 22050;
    const hz = 220;
    const samples = sine(hz, 0.5, sampleRate);
    const meta = { kind: 'pitched', recordedMidi: 57, targetMidi: 62, resonanceMix: 0, speech: false };
    const room = { keyRoot: 'D', mood: 'calm', materials: { melody: 'glass' } };
    const play = resolvePlaybackRate(meta, room);
    assert.ok(play.rate > 1.2);
    const result = resonateClip(samples, sampleRate, meta, room);
    assert.equal(result.rate, play.rate);
    assert.ok(Math.abs(result.samples.length - samples.length / play.rate) < sampleRate * 0.05);
    const got = estimateHz(result.samples, sampleRate);
    const want = hz * play.rate;
    assert.ok(Math.abs(got - want) < 8, `expected ~${want} Hz, got ${got}`);

    const speech = resonateClip(samples, sampleRate, { ...meta, speech: true, resonanceMix: 1 }, room);
    assert.equal(speech.rate, 1);
  });
});

function estimateHz(samples, sampleRate) {
  const minP = Math.floor(sampleRate / 800);
  const maxP = Math.min(Math.floor(sampleRate / 80), Math.floor(samples.length / 2));
  let best = minP;
  let bestCorr = -Infinity;
  for (let p = minP; p <= maxP; p++) {
    let sum = 0;
    for (let i = 0; i + p < samples.length; i++) sum += samples[i] * samples[i + p];
    if (sum > bestCorr) {
      bestCorr = sum;
      best = p;
    }
  }
  return sampleRate / best;
}
