import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareAudioSession, resumeInGesture, SILENT_MODE_HINT } from './audio-session.js';

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
