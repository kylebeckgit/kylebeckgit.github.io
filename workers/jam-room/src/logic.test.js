import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyVote,
  barBeatLabel,
  beatsSinceEpoch,
  cloneState,
  closePhrase,
  createRoom,
  crowdScale,
  DEFAULT_STATE,
  median,
  msPerBeat,
  nextBoundaryMs,
  nextCloseAtMs,
  offsetFromPings,
  parseCommand,
  phraseDurationMs,
  phrasesDue,
  planPhraseEvents,
  quantizeNextSixteenth,
  scaleForMood,
  stepKey,
  stepMoodToward,
  STRIKE_BURST,
  STRIKE_RATE,
  strikeBeatInRange,
  takeStrikeToken,
  tallyVotes,
  thinningProbability,
  mergeRemoteStrikes,
  wakeRoom,
} from './logic.js';

function roomAt(now = 1_000_000, extra = {}) {
  const room = createRoom(now, extra);
  return room;
}

function voteAll(room, entries, now = 1_000_000) {
  for (const [id, family, value] of entries) {
    const result = applyVote(room, id, family, value, now);
    assert.equal(result.ok, true, `${id} ${family}`);
  }
}

describe('parseCommand', () => {
  it('accepts the documented commands and ignores other text', () => {
    assert.deepEqual(parseCommand('!tempo up'), { family: 'tempo', value: 'up' });
    assert.deepEqual(parseCommand('  !MOOD Dark '), { family: 'mood', value: 'dark' });
    assert.deepEqual(parseCommand('!material crowd glass'), { family: 'material', value: 'crowd:glass' });
    assert.deepEqual(parseCommand('!material wood'), { family: 'material', value: 'wood' });
    assert.deepEqual(parseCommand('!drop'), { family: 'drop', value: true });
    assert.equal(parseCommand('hello'), null);
    assert.equal(parseCommand('!mood spicy'), null);
    assert.equal(parseCommand('!tempo left'), null);
  });
});

describe('clock', () => {
  it('places the vote close one beat before the phrase boundary', () => {
    const state = cloneState({ ...DEFAULT_STATE, epochMs: 0, bpm: 60, barsPerPhrase: 8 });
    assert.equal(msPerBeat(60), 1000);
    assert.equal(phraseDurationMs(state), 32_000);
    assert.equal(nextBoundaryMs(state), 32_000);
    assert.equal(nextCloseAtMs(state), 31_000);
    const label = barBeatLabel(state, 0);
    assert.equal(label.bar, 1);
    assert.equal(label.beat, 1);
    assert.equal(beatsSinceEpoch(state, 4500), 4.5);
    assert.equal(barBeatLabel(state, 4500).bar, 2);
    assert.equal(barBeatLabel(state, 4500).beat, 1);
  });

  it('quantizes strikes to the next 16th and medians ping offsets', () => {
    const state = cloneState({ ...DEFAULT_STATE, epochMs: 0, bpm: 60 });
    assert.equal(quantizeNextSixteenth(state, 100), 0.25);
    assert.equal(quantizeNextSixteenth(state, 250), 0.5);
    assert.equal(median([3, 1, 2]), 2);
    const offset = offsetFromPings([
      { t: 1000, serverMs: 1100, receivedMs: 1040 },
      { t: 2000, serverMs: 2108, receivedMs: 2040 },
      { t: 3000, serverMs: 3102, receivedMs: 3040 },
      { t: 4000, serverMs: 4100, receivedMs: 4040 },
      { t: 5000, serverMs: 5104, receivedMs: 5040 },
    ]);
    assert.ok(Math.abs(offset - 80) < 15);
  });
});

describe('keys and moods', () => {
  it('moves by a fifth and skips to the nearest allowed root', () => {
    assert.equal(stepKey('C', 1), 'G');
    assert.equal(stepKey('G', 1), 'D');
    assert.equal(stepKey('D', 1), 'A');
    assert.equal(stepKey('A', 1), 'E');
    assert.equal(stepKey('E', 1), 'C'); // theoretical B, tie toward up
    assert.equal(stepKey('C', -1), 'F');
    assert.equal(stepKey('F', -1), 'Bb');
  });

  it('steps one mood along the ring toward the winner', () => {
    assert.equal(stepMoodToward('calm', 'calm'), 'calm');
    assert.equal(stepMoodToward('calm', 'bright'), 'bright');
    assert.equal(stepMoodToward('calm', 'tense'), 'tense');
    assert.equal(stepMoodToward('calm', 'dark'), 'tense');
  });
});

describe('voting and cooldowns', () => {
  it('lets a later vote in the same phrase overwrite an earlier one', () => {
    const room = roomAt();
    voteAll(room, [['u1', 'tempo', 'up'], ['u1', 'tempo', 'down']]);
    const tally = tallyVotes(room);
    assert.deepEqual(tally.tempo, { down: 1 });
  });

  it('applies a majority tempo change and anchors a new epoch at the boundary', () => {
    const room = roomAt(0, { state: { ...DEFAULT_STATE, epochMs: 0, bpm: 84, barsPerPhrase: 8 } });
    const boundary = nextBoundaryMs(room.state);
    voteAll(room, [['a', 'tempo', 'up'], ['b', 'tempo', 'up'], ['c', 'tempo', 'down']]);
    const result = closePhrase(room, boundary - 1000, 3);
    assert.equal(result.state.bpm, 88);
    assert.equal(result.state.epochMs, boundary);
    assert.equal(result.state.phraseIndex, 1);
    assert.equal(room.votes.a, undefined);
  });

  it('leaves state alone on a tie', () => {
    const room = roomAt(0, { state: { ...DEFAULT_STATE, epochMs: 0, bpm: 84 } });
    voteAll(room, [['a', 'tempo', 'up'], ['b', 'tempo', 'down']]);
    const result = closePhrase(room, 1000, 2);
    assert.equal(result.state.bpm, 84);
  });

  it('clamps tempo, density and space', () => {
    const room = roomAt(0, { state: { ...DEFAULT_STATE, epochMs: 0, bpm: 120, density: 4, space: 2 } });
    voteAll(room, [['a', 'tempo', 'up'], ['a', 'density', 'more'], ['a', 'space', 'wet']]);
    const result = closePhrase(room, 1000, 1);
    assert.equal(result.state.bpm, 120);
    assert.equal(result.state.density, 4);
    assert.equal(result.state.space, 2);
  });

  it('enforces the key cooldown and key threshold', () => {
    const room = roomAt(0, { state: { ...DEFAULT_STATE, epochMs: 0, keyRoot: 'D' } });
    applyVote(room, 'only', 'key', 'up', 0);
    let result = closePhrase(room, 1000, 1);
    assert.equal(result.state.keyRoot, 'A'); // 1 vote is 100% of a 1-person room
    voteAll(room, [['only', 'key', 'up']]);
    result = closePhrase(room, result.boundaryMs + 1000, 1);
    assert.equal(result.state.keyRoot, 'A'); // cooldown
  });

  it('requires 30 percent of the room for a drop and then cools down', () => {
    const room = roomAt(0, { state: { ...DEFAULT_STATE, epochMs: 0 } });
    applyVote(room, 'a', 'drop', true, 0);
    let result = closePhrase(room, 1000, 10);
    assert.equal(result.state.pending.drop, false);
    voteAll(room, [['a', 'drop', true], ['b', 'drop', true], ['c', 'drop', true]]);
    result = closePhrase(room, result.boundaryMs + 1000, 10);
    assert.equal(result.state.pending.drop, true);
    voteAll(room, [['a', 'drop', true], ['b', 'drop', true], ['c', 'drop', true]]);
    result = closePhrase(room, result.boundaryMs + 1000, 10);
    assert.equal(result.state.pending.drop, false);
  });

  it('applies hold from a single vote', () => {
    const room = roomAt(0, { state: { ...DEFAULT_STATE, epochMs: 0 } });
    applyVote(room, 'a', 'hold', true, 0);
    const result = closePhrase(room, 1000, 8);
    assert.equal(result.state.pending.hold, true);
  });

  it('rate-limits command votes', () => {
    const room = roomAt(0);
    for (let i = 0; i < 6; i++) {
      assert.equal(applyVote(room, 'spammer', 'tempo', 'up', 1000 + i).ok, true);
    }
    assert.equal(applyVote(room, 'spammer', 'tempo', 'down', 1500).ok, false);
    assert.deepEqual(tallyVotes(room).tempo, { up: 1 });
  });

  it('sets melody material, or crowd when asked or when the material is crowd-only', () => {
    const room = roomAt(0, { state: { ...DEFAULT_STATE, epochMs: 0 } });
    applyVote(room, 'a', 'material', 'metal', 0);
    let result = closePhrase(room, 1000, 1);
    assert.equal(result.state.materials.melody, 'metal');
    result = closePhrase(room, result.boundaryMs + 1000, 1);
    applyVote(room, 'a', 'material', 'crowd:skin', result.boundaryMs);
    result = closePhrase(room, result.boundaryMs + 1000, 1);
    assert.equal(result.state.materials.crowd, 'skin');
  });
});

describe('phrase planning', () => {
  it('is deterministic for the same seed and phrase index', () => {
    const state = cloneState({ ...DEFAULT_STATE, epochMs: 0, density: 3, seed: 99, phraseIndex: 4 });
    const a = planPhraseEvents(state);
    const b = planPhraseEvents(state);
    assert.deepEqual(a, b);
    assert.ok(a.melody.length > 0);
    assert.ok(a.pulse.length > 0);
  });

  it('keeps the bed-only start of a drop and adds layers with density', () => {
    const silent = planPhraseEvents(cloneState({ ...DEFAULT_STATE, density: 0, pending: { drop: false, hold: false } }));
    assert.equal(silent.melody.length, 0);
    assert.equal(silent.pulse.length, 0);
    const dropped = planPhraseEvents(cloneState({ ...DEFAULT_STATE, density: 3, pending: { drop: true, hold: false } }));
    assert.ok(dropped.melody.every((n) => n.beat >= 8));
    assert.ok(dropped.pulse.every((n) => n.beat >= 8));
  });

  it('uses a pentatonic crowd subset in tense and dark', () => {
    assert.deepEqual(crowdScale('tense'), scaleForMood('tense').filter((s) => s !== 1 && s !== 8));
    assert.ok(!crowdScale('dark').includes(8));
  });
});

describe('crowd scaling', () => {
  it('thins and merges remote strikes as the room grows', () => {
    assert.equal(thinningProbability(12), 1);
    assert.equal(thinningProbability(24), 0.5);
    const merged = mergeRemoteStrikes([
      { beatTime: 1.01, degree: 2, velocity: 0.2 },
      { beatTime: 0.99, degree: 2, velocity: 0.8 },
      { beatTime: 2, degree: 0, velocity: 0.3 },
    ], 31);
    assert.equal(merged.length, 2);
    const first = merged.find((s) => s.degree === 2);
    assert.equal(first.velocity, 0.8);
  });
});

describe('idle catch-up', () => {
  it('still applies votes when only the current phrase is due', () => {
    const room = roomAt(0, { state: { ...DEFAULT_STATE, epochMs: 0, bpm: 60, barsPerPhrase: 8 } });
    voteAll(room, [['a', 'mood', 'dark']]);
    const closeAt = nextCloseAtMs(room.state);
    assert.equal(phrasesDue(room.state, closeAt - 1), 0);
    assert.equal(phrasesDue(room.state, closeAt), 1);
    const result = closePhrase(room, closeAt + 500, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.state.mood, 'tense');
    assert.equal(result.state.phraseIndex, 1);
    assert.equal(result.state.epochMs, 32_000);
  });

  it('jumps an overnight-idle room in one step and broadcasts once', () => {
    const start = 1_000_000;
    const room = roomAt(start, {
      state: { ...DEFAULT_STATE, epochMs: start, bpm: 60, barsPerPhrase: 8, phraseIndex: 0, mood: 'calm' },
    });
    room.cooldowns.key = 4;
    room.state.pending.drop = true;
    voteAll(room, [['a', 'mood', 'dark'], ['a', 'tempo', 'up']], start);
    const now = start + 10 * 60 * 60 * 1000;
    const due = phrasesDue(room.state, now);
    assert.ok(due > 1000, `expected more than a thousand missed closes, got ${due}`);

    const wake = wakeRoom(room, now, 2);
    assert.equal(wake.broadcasts, 1);
    assert.equal(wake.skipped, due);
    assert.equal(wake.state.phraseIndex, due);
    assert.equal(wake.state.epochMs, start + due * 32_000);
    assert.equal(wake.state.mood, 'calm');
    assert.equal(wake.state.bpm, 60);
    assert.deepEqual(room.votes, {});
    assert.equal(wake.state.pending.drop, false);
    assert.ok(wake.nextCloseAtMs > now);
    assert.equal(phrasesDue(room.state, now), 0);
    assert.ok(room.state.phraseIndex >= room.cooldowns.key);

    const again = wakeRoom(room, now, 2);
    assert.equal(again.broadcasts, 0);
    assert.equal(again.skipped, 0);
    assert.equal(again.state.phraseIndex, wake.state.phraseIndex);
    assert.equal(again.state.epochMs, wake.state.epochMs);
  });
});

describe('strike limits', () => {
  it('allows a burst of 12 then refills at 8 per second, and drops the extras', () => {
    let bucket = null;
    const allowed = [];
    for (let i = 0; i < 13; i++) {
      const result = takeStrikeToken(bucket, 1000);
      bucket = result;
      allowed.push(result.ok);
    }
    assert.deepEqual(allowed, Array(STRIKE_BURST).fill(true).concat([false]));
    const later = takeStrikeToken(bucket, 1000 + 125);
    assert.equal(later.ok, true);
    // From empty, one second refills at the configured rate, not the burst cap.
    bucket = { tokens: 0, updatedAt: 1000 };
    let okCount = 0;
    for (let i = 0; i < STRIKE_RATE + 1; i++) {
      const result = takeStrikeToken(bucket, 2000);
      bucket = result;
      if (result.ok) okCount += 1;
    }
    assert.equal(okCount, STRIKE_RATE);
    assert.equal(bucket.ok, false);
  });

  it('rejects beatTimes far from the server clock', () => {
    const state = cloneState({ ...DEFAULT_STATE, epochMs: 0, bpm: 60 });
    assert.equal(strikeBeatInRange(state, 4, 4000), true);
    assert.equal(strikeBeatInRange(state, 4 + 16, 4000), true);
    assert.equal(strikeBeatInRange(state, 4 - 16, 4000), true);
    assert.equal(strikeBeatInRange(state, 4 + 16.01, 4000), false);
    assert.equal(strikeBeatInRange(state, 4 - 16.01, 4000), false);
    assert.equal(strikeBeatInRange(state, Infinity, 4000), false);
    assert.equal(strikeBeatInRange(state, NaN, 4000), false);
  });
});
