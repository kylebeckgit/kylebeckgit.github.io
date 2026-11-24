import assert from 'node:assert/strict';
import test from 'node:test';
import { playHtmlUnlock, playSilentUnlock, prepareAudioSession, resumeInGesture, SILENT_MODE_HINT } from './audio-session.js';

test('prepareAudioSession does nothing when the browser has no audio session', () => {
  assert.doesNotThrow(() => prepareAudioSession(undefined));
  assert.doesNotThrow(() => prepareAudioSession({}));
  assert.doesNotThrow(() => prepareAudioSession({ audioSession: null }));
});

test('prepareAudioSession asks Safari for playback', () => {
  const session = { type: 'auto' };
  prepareAudioSession({ audioSession: session });
  assert.equal(session.type, 'playback');
});

test('playback is set before resume, including an interrupted context', () => {
  const order = [];
  const session = {
    set type(value) {
      order.push(`type:${value}`);
      this.current = value;
    },
    get type() {
      return this.current;
    },
  };
  const nav = { audioSession: session };
  for (const state of ['suspended', 'interrupted']) {
    order.length = 0;
    const ctx = {
      state,
      resume() {
        order.push('resume');
        return Promise.resolve();
      },
    };
    const pending = resumeInGesture(ctx, nav);
    assert.equal(typeof pending?.then, 'function');
    assert.deepEqual(order, ['type:playback', 'resume']);
  }
  assert.equal(SILENT_MODE_HINT, 'No sound? Turn off silent mode on your iPhone.');
});

test('playHtmlUnlock starts a silent playsinline element', () => {
  const plays = [];
  const nodes = [];
  const el = {
    setAttribute(name, value) { this[name] = value; },
    play() { plays.push('play'); return Promise.resolve(); },
    style: { cssText: '' },
    tabIndex: 0,
  };
  const doc = {
    createElement(tag) {
      assert.equal(tag, 'audio');
      return el;
    },
    querySelector(sel) { return sel === '[data-ios-audio-unlock]' ? (nodes[0] || null) : null; },
    documentElement: {
      appendChild(node) { nodes.push(node); return node; },
    },
  };
  playHtmlUnlock(doc);
  assert.equal(el.playsInline, true);
  assert.equal(el.playsinline, '');
  assert.equal(el['webkit-playsinline'], '');
  assert.equal(el['aria-hidden'], 'true');
  assert.match(el.src, /^data:audio\/wav;base64,/);
  assert.deepEqual(plays, ['play']);
  assert.equal(nodes[0], el);

  plays.length = 0;
  playHtmlUnlock(doc);
  assert.deepEqual(plays, ['play']);
  assert.equal(nodes.length, 1);
});

test('playSilentUnlock starts a short silent buffer and the HTML element', () => {
  const started = [];
  const ctx = {
    sampleRate: 44100,
    destination: {},
    createBuffer(channels, length, rate) {
      return { channels, length, rate };
    },
    createBufferSource() {
      return {
        buffer: null,
        connect() {},
        start() { started.push(this.buffer.length); },
      };
    },
  };
  const plays = [];
  const doc = {
    querySelector() { return { play() { plays.push('play'); } }; },
  };
  playSilentUnlock(ctx, doc);
  assert.equal(started[0], 2205);
  assert.deepEqual(plays, ['play']);
});

test('playSilentUnlock and playHtmlUnlock do nothing without a document or context', () => {
  assert.doesNotThrow(() => playHtmlUnlock(undefined));
  assert.doesNotThrow(() => playSilentUnlock(null, undefined));
  assert.doesNotThrow(() => playSilentUnlock({}));
});
