import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyVoiceCaps, audioBufferOptions, AUTOPLAY_PER_PHRASE, beatAudioTime, bumpPlaybackSession, canPlayApprovedClip, canStartAudio, cancelPlaybackTokens, clockSnapshot, CROWD_CAP, dropClipVoices, dropUnselectedAutoplayKeys, endPlaybackSession, firstFullPhraseIndex, planUpcomingAutoplay, pruneUploadScheduleKeys, retireMissingUploads, selectAutoplayClips, shouldResyncSchedule, shouldStartPendingVoice, shouldStartSessionVoice, upcomingAutoplayPhrase, uploadClipBeat, uploadPlayDestinations, uploadSchedulePlan, USER_VOICES } from './ui.js';
import { msPerBeat } from '../../../workers/jam-room/src/logic.js';

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

describe('upload scheduling and playback', () => {
  it('schedules upcoming autoplay only inside that next phrase, not wrapped into a later one', () => {
    const state = { epochMs: 1_000_000, phraseIndex: 5, bpm: 120, beatsPerBar: 4, barsPerPhrase: 8 };
    const phraseBeats = 32;
    const nowMs = state.epochMs + 1000;
    const target = upcomingAutoplayPhrase(state.phraseIndex);
    assert.equal(target, 6);
    const plan = uploadSchedulePlan('clip-a', 0, state, target);
    assert.equal(plan.targetPhrase, 6);
    assert.ok(plan.beatInPhrase >= 0);
    assert.ok(plan.beatInPhrase < phraseBeats);
    assert.ok(plan.beat >= phraseBeats);
    assert.ok(plan.beat < phraseBeats * 2);
    const audioNow = 10;
    const when = beatAudioTime(state, plan.beat, nowMs, audioNow);
    const nextStart = beatAudioTime(state, phraseBeats, nowMs, audioNow);
    const nextEnd = beatAudioTime(state, phraseBeats * 2, nowMs, audioNow);
    assert.ok(when >= nextStart - 0.0001);
    assert.ok(when <= nextEnd + 0.0001);
    const beatInPhrase = uploadClipBeat(0, state);
    assert.equal(beatInPhrase, plan.beatInPhrase);
    assert.ok(beatInPhrase < phraseBeats);
  });

  it('builds an upload buffer at the clip sample rate, not the context rate', () => {
    const samples = new Float32Array(22050);
    const opts = audioBufferOptions(samples, 48000, 22050);
    assert.equal(opts.sampleRate, 22050);
    assert.equal(opts.length, 22050);
    assert.equal(opts.length / opts.sampleRate, 1);
    const fallback = audioBufferOptions(samples, 48000);
    assert.equal(fallback.sampleRate, 48000);
    assert.notEqual(samples.length / 48000, 1);
  });

  it('stops active sources for a muted or removed clip, and all sources when the pool is cleared', () => {
    const stopped = [];
    const map = new Map();
    const add = (id) => {
      const handle = { source: { stop() { stopped.push(id); } }, clipId: id };
      map.set(id, [...(map.get(id) || []), handle]);
    };
    add('a');
    add('b');
    dropClipVoices(map, 'a');
    assert.deepEqual(stopped, ['a']);
    assert.equal(map.has('a'), false);
    dropClipVoices(map, null);
    assert.deepEqual(stopped, ['a', 'b']);
    assert.equal(map.size, 0);
  });

  it('rechecks playing, mute, and the pool after the clip has loaded', () => {
    const uploads = [{ id: 'clip-a' }, { id: 'clip-b' }];
    const muted = new Set();
    assert.equal(canPlayApprovedClip(true, muted, uploads, 'clip-a'), true);
    assert.equal(canPlayApprovedClip(false, muted, uploads, 'clip-a'), false);
    muted.add('clip-a');
    assert.equal(canPlayApprovedClip(true, muted, uploads, 'clip-a'), false);
    muted.delete('clip-a');
    assert.equal(canPlayApprovedClip(true, muted, [{ id: 'clip-b' }], 'clip-a'), false);
  });

  it('stops voices and drops cache for clips missing from a new pool list, including a clear', () => {
    const stopped = [];
    const voices = new Map();
    const cache = new Map();
    const add = (id) => {
      cache.set(id, { id });
      voices.set(id, [{ source: { stop() { stopped.push(id); } }, clipId: id }]);
    };
    add('old');
    add('kept');
    const dropped = retireMissingUploads(cache, voices, [{ id: 'kept' }]);
    assert.deepEqual(dropped, ['old']);
    assert.equal(cache.has('old'), false);
    assert.equal(cache.has('kept'), true);
    assert.equal(voices.has('old'), false);
    assert.deepEqual(stopped, ['old']);
    retireMissingUploads(cache, voices, []);
    assert.equal(cache.size, 0);
    assert.equal(voices.size, 0);
    assert.deepEqual(stopped, ['old', 'kept']);
  });

  it('keeps the upcoming phrase plan across a boundary so a resync does not start it twice', () => {
    const state = { epochMs: 1_000_000, phraseIndex: 2, bpm: 120, beatsPerBar: 4, barsPerPhrase: 8 };
    const phraseBeats = 32;
    const beatMs = msPerBeat(state.bpm);
    const nowMs = state.epochMs + 1000;
    const first = uploadSchedulePlan('clip-a', 0, state, upcomingAutoplayPhrase(state.phraseIndex));
    assert.equal(first.targetPhrase, 3);
    assert.ok(first.beat >= phraseBeats);
    assert.ok(first.beat < phraseBeats * 2);
    const audioNow = 10;
    const whenFirst = beatAudioTime(state, first.beat, nowMs, audioNow);

    const nextState = {
      ...state,
      epochMs: state.epochMs + phraseBeats * beatMs,
      phraseIndex: 3,
    };
    const nextNow = nextState.epochMs;
    const nextAudioNow = audioNow + (nextNow - nowMs) / 1000;
    const nextUpcoming = uploadSchedulePlan('clip-a', 0, nextState, upcomingAutoplayPhrase(nextState.phraseIndex));
    assert.equal(nextUpcoming.targetPhrase, 4);
    assert.notEqual(nextUpcoming.key, first.key);

    const scheduled = new Set([first.key]);
    pruneUploadScheduleKeys(scheduled, 3);
    assert.equal(scheduled.has(first.key), true);
    const samePhrase = uploadSchedulePlan('clip-a', 0, nextState, 3);
    assert.equal(samePhrase.key, first.key);
    const whenSame = beatAudioTime(nextState, samePhrase.beat, nextNow, nextAudioNow);
    assert.ok(Math.abs(whenFirst - whenSame) < 0.0001);
    pruneUploadScheduleKeys(scheduled, 4);
    assert.equal(scheduled.size, 0);
  });
});

describe('upload autoplay rotation', () => {
  const stateAt = (phraseIndex, epochMs = 1_000_000) => ({
    epochMs,
    phraseIndex,
    bpm: 120,
    beatsPerBar: 4,
    barsPerPhrase: 8,
  });

  function pool(count, approvedAt) {
    return Array.from({ length: count }, (_, i) => ({
      id: `clip-${i}`,
      createdAt: approvedAt,
      approvedAt,
    }));
  }

  it('plays a newly approved clip in its first full phrase even when the pool is larger than 4', () => {
    const phraseMs = 16_000;
    const current = stateAt(10, 2_000_000);
    const older = pool(6, current.epochMs - 5 * phraseMs);
    const newest = { id: 'new-clip', createdAt: current.epochMs - 500, approvedAt: current.epochMs - 500 };
    const clips = [...older, newest];
    assert.equal(firstFullPhraseIndex(newest.approvedAt, current), 10);
    const chosen = selectAutoplayClips(clips, 10, current);
    assert.equal(chosen.length, AUTOPLAY_PER_PHRASE);
    assert.ok(chosen.some((clip) => clip.id === 'new-clip'));
    // Mid-phrase approval waits until the next phrase, and is not stuck behind the oldest four.
    const mid = { id: 'mid-clip', createdAt: current.epochMs + 200, approvedAt: current.epochMs + 200 };
    assert.equal(firstFullPhraseIndex(mid.approvedAt, current), 11);
    const thisPhrase = selectAutoplayClips([...clips, mid], 10, current);
    assert.equal(thisPhrase.some((clip) => clip.id === 'mid-clip'), false);
    const nextState = stateAt(11, current.epochMs + phraseMs);
    const nextPhrase = selectAutoplayClips([...clips, mid], 11, nextState);
    assert.ok(nextPhrase.some((clip) => clip.id === 'mid-clip'));
    assert.equal(nextPhrase.length, AUTOPLAY_PER_PHRASE);
  });

  it('rotates through a pool larger than 4 so every clip is scheduled', () => {
    const phraseMs = 16_000;
    const start = stateAt(20, 3_000_000);
    const clips = pool(7, start.epochMs - 8 * phraseMs);
    const seen = new Set();
    const previous = [];
    for (let i = 0; i < clips.length; i++) {
      const state = stateAt(start.phraseIndex + i, start.epochMs + i * phraseMs);
      const chosen = selectAutoplayClips(clips, state.phraseIndex, state);
      assert.equal(chosen.length, AUTOPLAY_PER_PHRASE);
      const ids = chosen.map((clip) => clip.id);
      assert.equal(new Set(ids).size, AUTOPLAY_PER_PHRASE);
      // Same inputs always pick the same clips, in the same order.
      assert.deepEqual(selectAutoplayClips(clips, state.phraseIndex, state).map((clip) => clip.id), ids);
      // Shuffled input order must not change the choice.
      const shuffled = [...clips].reverse();
      assert.deepEqual(selectAutoplayClips(shuffled, state.phraseIndex, state).map((clip) => clip.id), ids);
      ids.forEach((id) => seen.add(id));
      previous.push(ids.join(','));
    }
    assert.equal(seen.size, clips.length);
    assert.ok(new Set(previous).size > 1);
  });

  it('never starts more than 4 clips per phrase and does not carry another phrase\'s set across a boundary', () => {
    const phraseMs = 16_000;
    const start = stateAt(20, 3_000_000);
    const clips = pool(7, start.epochMs - 8 * phraseMs);
    const scheduled = new Set();
    const startsByPhrase = new Map();
    for (let i = 0; i < 8; i++) {
      const state = stateAt(start.phraseIndex + i, start.epochMs + i * phraseMs);
      const planned = planUpcomingAutoplay(clips, state);
      assert.equal(planned.targetPhrase, state.phraseIndex + 1);
      assert.ok(planned.plans.length <= AUTOPLAY_PER_PHRASE);
      pruneUploadScheduleKeys(scheduled, state.phraseIndex);
      const selected = new Set(planned.clips.map((clip) => clip.id));
      dropUnselectedAutoplayKeys(scheduled, planned.targetPhrase, selected);
      const phraseBeats = 32;
      for (const plan of planned.plans) {
        assert.equal(plan.targetPhrase, planned.targetPhrase);
        assert.ok(plan.beatInPhrase >= 0 && plan.beatInPhrase < phraseBeats);
        assert.ok(plan.beat >= phraseBeats);
        assert.ok(plan.beat < phraseBeats * 2);
        if (scheduled.has(plan.key)) continue;
        scheduled.add(plan.key);
        const list = startsByPhrase.get(plan.targetPhrase) || [];
        list.push(plan.clipId);
        startsByPhrase.set(plan.targetPhrase, list);
      }
    }
    assert.ok(startsByPhrase.size >= 7);
    for (const [phrase, ids] of startsByPhrase) {
      assert.ok(ids.length <= AUTOPLAY_PER_PHRASE, `phrase ${phrase} started ${ids.length}`);
      assert.equal(new Set(ids).size, ids.length, `phrase ${phrase} had duplicates`);
    }
  });

  it('routes every upload through the in-room chain and only adds keepOptIn clips to the keep export', () => {
    const uploadRoom = { name: 'room' };
    const uploadKeep = { name: 'keep' };
    const mix = { name: 'mix' };
    const buses = { uploadRoom, uploadKeep, mix };
    const live = uploadPlayDestinations(buses, { keepOptIn: false });
    const keep = uploadPlayDestinations(buses, { keepOptIn: true });
    assert.deepEqual(live, [uploadRoom]);
    assert.deepEqual(keep, [uploadRoom, uploadKeep]);
    assert.equal(live.includes(uploadKeep), false);
    assert.equal(keep.includes(uploadRoom), true);
  });
});

describe('upload crowd voice caps', () => {
  it('applies CROWD_CAP and USER_VOICES by stopping the oldest sources', () => {
    const stopped = [];
    const voices = [];
    for (let i = 0; i < CROWD_CAP; i++) {
      voices.push({ userId: i % 2 === 0 ? 'a' : 'b', start: i, source: { stop() { stopped.push(i); } } });
    }
    const overCap = applyVoiceCaps(voices, { cap: CROWD_CAP, userCap: USER_VOICES, userId: 'c', now: 0 });
    assert.equal(overCap.keep.length, CROWD_CAP - 1);
    assert.equal(overCap.stop.length, 1);
    assert.equal(overCap.stop[0].start, 0);

    const userVoices = [
      { userId: 'me', start: 1, source: { stop() { stopped.push('u1'); } } },
      { userId: 'me', start: 2, source: { stop() { stopped.push('u2'); } } },
      { userId: 'me', start: 3, source: { stop() { stopped.push('u3'); } } },
      { userId: 'you', start: 4, source: { stop() { stopped.push('y'); } } },
    ];
    const overUser = applyVoiceCaps(userVoices, { cap: CROWD_CAP, userCap: USER_VOICES, userId: 'me' });
    assert.equal(overUser.stop.length, 1);
    assert.equal(overUser.stop[0].userId, 'me');
    assert.equal(overUser.stop[0].start, 1);
    assert.equal(overUser.keep.filter((v) => v.userId === 'me').length, 2);
    assert.equal(overUser.keep.some((v) => v.userId === 'you'), true);
  });

  it('marks evicted pending tokens cancelled so a late buffer load cannot start them', () => {
    const pending = { userId: 'a', start: 0, pending: true };
    const voices = [pending];
    for (let i = 1; i < CROWD_CAP; i++) {
      voices.push({ userId: 'b', start: i, source: { stop() {} } });
    }
    const started = [];
    const result = applyVoiceCaps(voices, { cap: CROWD_CAP, userCap: USER_VOICES, userId: 'c', now: 0 });
    assert.equal(result.stop.includes(pending), true);
    assert.equal(pending.cancelled, true);
    assert.equal(shouldStartPendingVoice(pending), false);
    if (shouldStartPendingVoice(pending)) started.push('pending');
    assert.deepEqual(started, []);
    assert.equal(result.keep.includes(pending), false);

    const mine = { userId: 'me', start: 1, pending: true };
    const overUser = applyVoiceCaps([
      mine,
      { userId: 'me', start: 2, source: { stop() {} } },
      { userId: 'me', start: 3, source: { stop() {} } },
    ], { cap: CROWD_CAP, userCap: USER_VOICES, userId: 'me' });
    assert.equal(overUser.stop[0], mine);
    assert.equal(mine.cancelled, true);
    assert.equal(shouldStartPendingVoice(mine), false);
    assert.equal(shouldStartPendingVoice({ pending: true }), true);
  });
});

describe('playback session after stop', () => {
  function resolveFetch(token, state, started) {
    if (!state.playing) return;
    if (!shouldStartSessionVoice(token, state.playbackSession)) return;
    started.push(token.id);
  }

  function freshState() {
    return {
      playbackSession: 0,
      playing: false,
      autoplayTokens: new Map(),
      uploadCrowd: [],
    };
  }

  it('does not start a clip when its fetch resolves after Stop', () => {
    const state = freshState();
    state.playing = true;
    const session = bumpPlaybackSession(state);
    const token = { id: 'late', session, cancelled: false, handle: { source: { stopped: false, stop() { this.stopped = true; } } } };
    state.autoplayTokens.set('late', token);
    endPlaybackSession(state);
    state.playing = false;
    const started = [];
    resolveFetch(token, state, started);
    assert.equal(started.length, 0);
    assert.equal(token.cancelled, true);
    assert.equal(token.handle.source.stopped, true);
    assert.equal(shouldStartSessionVoice(token, state.playbackSession), false);
  });

  it('after Stop then Start, a late fetch starts only the new session clip, once', () => {
    const state = freshState();
    state.playing = true;
    const first = bumpPlaybackSession(state);
    let starts = 0;
    const oldHandle = { source: { stop() {} } };
    const oldToken = { id: 'old', session: first, cancelled: false, handle: oldHandle };
    state.autoplayTokens.set('old', oldToken);
    const crowd = { id: 'crowd', session: first, cancelled: false, pending: true, source: { stop() { this.stopped = true; } } };
    state.uploadCrowd.push(crowd);

    endPlaybackSession(state);
    state.playing = false;
    assert.equal(oldToken.cancelled, true);
    assert.equal(crowd.cancelled, true);

    const second = bumpPlaybackSession(state);
    cancelPlaybackTokens(state);
    state.playing = true;
    const fresh = { id: 'new', session: second, cancelled: false };
    const scheduled = new Set();
    const started = [];
    const tryStart = (token) => {
      if (!state.playing || !shouldStartSessionVoice(token, state.playbackSession)) return;
      if (scheduled.has(token.id)) return;
      scheduled.add(token.id);
      started.push(token.id);
    };
    tryStart(oldToken);
    tryStart(crowd);
    tryStart(fresh);
    tryStart(fresh);
    assert.deepEqual(started, ['new']);
    assert.notEqual(first, second);
  });
});
