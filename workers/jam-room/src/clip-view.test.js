import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clipAudioPath, publicClip, publicMeta } from './clip-view.js';

describe('public clip view', () => {
  it('lets the server speech column override client meta, mix, and slices', () => {
    const meta = publicMeta({
      kind: 'unpitched',
      speech: false,
      resonanceMix: 0.2,
      slices: [{ startMs: 0, endMs: 80, slot: 'kick' }],
    }, 1, 0);
    assert.equal(meta.speech, true);
    assert.equal(meta.hasSpeech, true);
    assert.equal(meta.resonanceMix, 1);
    assert.deepEqual(meta.slices, []);
    assert.equal(meta.kind, 'unpitched');

    const ignored = publicMeta({
      kind: 'unpitched',
      speech: true,
      hasSpeech: true,
      resonanceMix: 1,
      slices: [{ startMs: 10, endMs: 40, slot: 'hat' }],
    }, 0, 0);
    assert.equal(ignored.speech, false);
    assert.equal(ignored.hasSpeech, false);
    assert.equal(ignored.resonanceMix, 1);
    assert.equal(ignored.slices.length, 1);

    const clip = publicClip({
      id: 'c1',
      createdAt: 1,
      speech: 1,
      keepOptIn: 0,
      meta: { kind: 'unpitched', speech: false, slices: [{ startMs: 0, endMs: 50 }] },
    });
    assert.equal(clip.speech, true);
    assert.equal(clip.hasSpeech, true);
    assert.equal(clip.meta.speech, true);
    assert.deepEqual(clip.meta.slices, []);
    assert.equal(clip.approvedAt, 1);
    const stamped = publicClip({
      id: 'c2',
      createdAt: 1,
      approvedAt: 9,
      meta: { approvedAt: 8, kind: 'pitched' },
    });
    assert.equal(stamped.approvedAt, 9);
    const fromMeta = publicClip({
      id: 'c3',
      createdAt: 1,
      meta: { approvedAt: 8, kind: 'pitched' },
    });
    assert.equal(fromMeta.approvedAt, 8);
    assert.equal(fromMeta.audioUrl, '/uploads/c3/audio?v=8');
    assert.equal(clipAudioPath('c3', 8), '/uploads/c3/audio?v=8');
    assert.equal(publicClip({ id: 'c1', createdAt: 1, speech: 1, keepOptIn: 0, meta: {} }).audioUrl, '/uploads/c1/audio?v=1');
  });
});
