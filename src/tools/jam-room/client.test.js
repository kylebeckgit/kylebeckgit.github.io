import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createJamClient } from './client.js';

function createClock(start = 1_000_000) {
  let now = start;
  const timers = new Map();
  let nextId = 1;
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { fn, at: now + Number(ms) });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    pending() { return timers.size; },
    advance(ms) {
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
    },
  };
}

function fakeSocketClass(holder) {
  return class FakeSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      this.listeners = { open: [], message: [], close: [], error: [] };
      holder.socket = this;
    }

    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    }

    send(data) {
      this.sent.push(JSON.parse(String(data)));
    }

    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      for (const fn of this.listeners.close || []) fn();
    }

    open() {
      this.readyState = 1;
      for (const fn of this.listeners.open || []) fn();
    }

    receive(msg) {
      const event = { data: JSON.stringify(msg) };
      for (const fn of this.listeners.message || []) fn(event);
    }

    pings() {
      return this.sent.filter((m) => m.type === 'ping');
    }
  };
}

function welcomeMessage() {
  return {
    type: 'welcome',
    userId: 'user-1',
    state: { epochMs: 1, bpm: 84, beatsPerBar: 4, barsPerPhrase: 8, phraseIndex: 0, keyRoot: 'D', mood: 'calm', density: 2, space: 1, materials: { melody: 'glass', crowd: 'wood', pulse: 'metal', bed: 'bowed' }, pending: { drop: false, hold: false }, seed: 1 },
    tally: { phraseIndex: 0, families: {} },
    serverMs: 1,
  };
}

describe('jam client ping loop', () => {
  it('starts a single ping loop when welcome sets the room mode, and clears it on close', () => {
    const clock = createClock();
    const holder = {};
    const client = createJamClient({
      url: 'wss://jam-room.example',
      WebSocket: fakeSocketClass(holder),
      setTimeout: (...args) => clock.setTimeout(...args),
      clearTimeout: (id) => clock.clearTimeout(id),
      pingMs: 1000,
      timeoutMs: 30_000,
    });
    client.connect();
    holder.socket.open();
    assert.equal(client.mode, 'connecting');
    assert.equal(holder.socket.pings().length, 0);
    assert.ok(holder.socket.sent.some((m) => m.type === 'hello'));

    holder.socket.receive(welcomeMessage());
    assert.equal(client.mode, 'room');
    assert.equal(holder.socket.pings().length, 1);

    holder.socket.receive(welcomeMessage());
    assert.equal(holder.socket.pings().length, 1);

    clock.advance(1000);
    assert.equal(holder.socket.pings().length, 2);
    clock.advance(1000);
    assert.equal(holder.socket.pings().length, 3);

    const pingsBeforeClose = holder.socket.pings().length;
    client.disconnect();
    clock.advance(5000);
    assert.equal(holder.socket.pings().length, pingsBeforeClose);
    assert.equal(clock.pending(), 0);
  });
});

describe('jam client connect timeout', () => {
  it('stays connecting after the socket opens, and falls back to solo if welcome never arrives', () => {
    const clock = createClock();
    const holder = {};
    const events = [];
    const client = createJamClient({
      url: 'wss://jam-room.example',
      WebSocket: fakeSocketClass(holder),
      setTimeout: (...args) => clock.setTimeout(...args),
      clearTimeout: (id) => clock.clearTimeout(id),
      pingMs: 1000,
      timeoutMs: 4000,
    });
    client.on((type) => events.push(type));
    client.connect();
    holder.socket.open();
    assert.equal(client.mode, 'connecting');
    clock.advance(3999);
    assert.equal(client.mode, 'connecting');
    clock.advance(1);
    assert.equal(client.mode, 'solo');
    assert.ok(events.includes('solo'));
    assert.equal(holder.socket.pings().length, 0);
  });

  it('cancels the connect timeout when welcome arrives', () => {
    const clock = createClock();
    const holder = {};
    const client = createJamClient({
      url: 'wss://jam-room.example',
      WebSocket: fakeSocketClass(holder),
      setTimeout: (...args) => clock.setTimeout(...args),
      clearTimeout: (id) => clock.clearTimeout(id),
      pingMs: 10_000,
      timeoutMs: 4000,
    });
    client.connect();
    holder.socket.open();
    clock.advance(1000);
    holder.socket.receive(welcomeMessage());
    assert.equal(client.mode, 'room');
    clock.advance(5000);
    assert.equal(client.mode, 'room');
  });
});

describe('jam client solo clock', () => {
  it('schedules the next solo phrase close in server time, including a non-zero offset', () => {
    const clock = createClock(1_000_000);
    const holder = {};
    const states = [];
    const client = createJamClient({
      url: 'wss://jam-room.example',
      WebSocket: fakeSocketClass(holder),
      setTimeout: (...args) => clock.setTimeout(...args),
      clearTimeout: (id) => clock.clearTimeout(id),
      now: () => clock.now(),
      pingMs: 60_000,
      timeoutMs: 60_000,
    });
    client.on((type) => {
      if (type === 'state') states.push(client.state.phraseIndex);
    });
    client.connect();
    holder.socket.open();
    const welcome = welcomeMessage();
    welcome.state = { ...welcome.state, epochMs: 1_000_000, bpm: 60, barsPerPhrase: 8, phraseIndex: 0 };
    holder.socket.receive(welcome);
    client.offsetMs = 250;
    assert.equal(client.nowMs(), 1_000_250);
    holder.socket.close();
    assert.equal(client.mode, 'solo');
    // Vote close is 31 s after the server epoch. With a 250 ms offset the
    // local timer must fire 250 ms earlier than Date.now() alone would.
    clock.advance(30_749);
    assert.equal(client.state.phraseIndex, 0);
    assert.deepEqual(states, []);
    clock.advance(1);
    assert.equal(client.state.phraseIndex, 1);
    assert.equal(client.state.epochMs, 1_032_000);
    assert.deepEqual(states, [1]);
  });
});

describe('jam client upload errors', () => {
  it('returns an error status when postUpload fetch throws', async () => {
    const holder = {};
    const client = createJamClient({
      url: 'wss://jam-room.example',
      WebSocket: fakeSocketClass(holder),
      fetch: async () => { throw new Error('Failed to fetch'); },
    });
    client.connect();
    holder.socket.open();
    const welcome = welcomeMessage();
    welcome.uploadToken = 'tok-1';
    holder.socket.receive(welcome);
    assert.equal(client.mode, 'room');
    const result = await client.postUpload(new Uint8Array([1, 2, 3]), { consent: true });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'The upload could not be sent.');
    client.disconnect();
  });
});
