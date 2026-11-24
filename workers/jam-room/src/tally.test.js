import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTallyBroadcaster, planTallySend, TALLY_MIN_MS } from './tally.js';

describe('tally trailing flush', () => {
  it('sends immediately, then defers until the end of the 250 ms window', () => {
    assert.deepEqual(planTallySend(null, 0), { send: true, delayMs: 0 });
    assert.deepEqual(planTallySend(1000, 1000 + TALLY_MIN_MS), { send: true, delayMs: 0 });
    assert.deepEqual(planTallySend(1000, 1100), { send: false, delayMs: 150 });
  });

  it('flushes the last throttled tally within about 250 ms', () => {
    let now = 10_000;
    const sent = [];
    const timers = new Map();
    let nextId = 1;
    const gate = createTallyBroadcaster({
      minMs: TALLY_MIN_MS,
      now: () => now,
      send: (t) => sent.push(t),
      setTimeout: (fn, ms) => {
        const id = nextId++;
        timers.set(id, { fn, at: now + ms });
        return id;
      },
      clearTimeout: (id) => { timers.delete(id); },
    });

    function advance(ms) {
      const target = now + ms;
      while (true) {
        let soon = null;
        for (const [id, timer] of timers) {
          if (timer.at <= target && (!soon || timer.at < soon.at)) soon = { id, ...timer };
        }
        if (!soon) {
          now = target;
          return;
        }
        now = soon.at;
        timers.delete(soon.id);
        soon.fn();
      }
    }

    gate.request(now);
    assert.deepEqual(sent, [10_000]);
    now = 10_040;
    gate.request(now);
    now = 10_080;
    gate.request(now);
    now = 10_120;
    gate.request(now);
    assert.deepEqual(sent, [10_000]);
    assert.equal(timers.size, 1);
    advance(250);
    assert.equal(sent.length, 2);
    assert.equal(sent[1], 10_250);
    assert.equal(timers.size, 0);

    now = 10_250 + TALLY_MIN_MS;
    gate.request(now);
    assert.equal(sent.length, 3);
    assert.equal(sent[2], 10_500);
  });
});
