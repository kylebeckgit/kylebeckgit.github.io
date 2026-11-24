import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canStartAudio, clockSnapshot, shouldResyncSchedule } from './ui.js';

describe('jam room start and resync', () => {
  it('holds Start until the client is in room or solo mode', () => {
    assert.equal(canStartAudio('connecting'), false);
    assert.equal(canStartAudio('room'), true);
    assert.equal(canStartAudio('solo'), true);
    assert.equal(canStartAudio('room', { unlocking: true }), false);
    assert.equal(canStartAudio('solo', { playing: true }), false);
  });

  it('reschedules, clears keys, and re-plans on welcome, solo, and epoch changes', () => {
    const local = clockSnapshot({ epochMs: 1_000_000, phraseIndex: 0 });
    const welcome = { epochMs: 1_000_500, phraseIndex: 0 };
    const sameEpoch = { epochMs: 1_000_500, phraseIndex: 0 };
    const nextPhrase = { epochMs: 1_032_500, phraseIndex: 1 };
    assert.equal(shouldResyncSchedule('welcome', local, welcome), true);
    assert.equal(shouldResyncSchedule('solo', local, local), true);
    assert.equal(shouldResyncSchedule('state', welcome, nextPhrase), true);
    assert.equal(shouldResyncSchedule('state', nextPhrase, sameEpoch), true);
    assert.equal(shouldResyncSchedule('state', nextPhrase, { epochMs: 1_032_500, phraseIndex: 1 }), false);
    assert.equal(shouldResyncSchedule('tally', nextPhrase, nextPhrase), false);
    assert.equal(shouldResyncSchedule('strike', nextPhrase, nextPhrase), false);
  });
});
