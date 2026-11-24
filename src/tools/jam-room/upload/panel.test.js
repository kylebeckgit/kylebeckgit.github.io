import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createUploadLock, mountUploadPanel, withUploadErrorStatus } from './panel.js';

describe('upload session lock', () => {
  it('uses one state machine for record and file, and only the matching token can release it', () => {
    const lock = createUploadLock();
    const arm = lock.enter('arming');
    assert.ok(arm);
    assert.equal(lock.phase, 'arming');
    assert.equal(lock.blocked, true);
    assert.equal(lock.enter('arming'), 0);
    assert.equal(lock.enter('submitting'), 0);

    const rec = lock.advance(arm, 'recording');
    assert.equal(rec, arm);
    assert.equal(lock.phase, 'recording');
    assert.equal(lock.enter('submitting'), 0);

    const submit = lock.advance(arm, 'submitting');
    assert.equal(submit, arm);
    assert.equal(lock.phase, 'submitting');
    assert.equal(lock.release(arm + 1), false);
    assert.equal(lock.phase, 'submitting');
    assert.equal(lock.release(arm), true);
    assert.equal(lock.phase, 'idle');
    assert.equal(lock.release(arm), false);

    const file = lock.enter('submitting');
    assert.ok(file);
    assert.notEqual(file, arm);
    assert.equal(lock.enter('arming'), 0);
    assert.equal(lock.release(arm), false);
    assert.equal(lock.phase, 'submitting');
    assert.equal(lock.release(file), true);
    assert.equal(lock.idle, true);
  });

  it('disables the file input while the session is not idle', () => {
    const fileInput = { disabled: false, addEventListener() {}, value: '', files: null };
    const recordBtn = { disabled: false, addEventListener() {} };
    const stopBtn = { disabled: true, addEventListener() {} };
    const root = {
      querySelector(sel) {
        if (sel.includes('file')) return fileInput;
        if (sel.includes('record')) return recordBtn;
        if (sel.includes('stop')) return stopBtn;
        return null;
      },
      addEventListener() {},
      matches() { return false; },
    };
    const lock = createUploadLock();
    const panel = mountUploadPanel(root, { lock });
    assert.equal(fileInput.disabled, false);
    assert.equal(recordBtn.disabled, false);
    lock.enter('arming');
    panel.syncControls();
    assert.equal(fileInput.disabled, true);
    assert.equal(recordBtn.disabled, true);
    assert.equal(stopBtn.disabled, true);
    lock.advance(1, 'recording');
    panel.syncControls();
    assert.equal(fileInput.disabled, true);
    assert.equal(stopBtn.disabled, false);
    lock.advance(1, 'submitting');
    panel.syncControls();
    assert.equal(fileInput.disabled, true);
    assert.equal(stopBtn.disabled, true);
    lock.release(1);
    panel.syncControls();
    assert.equal(fileInput.disabled, false);
    assert.equal(recordBtn.disabled, false);
  });
});

describe('mic upload errors', () => {
  it('shows an error status when the mic submit path throws', async () => {
    const messages = [];
    const result = await withUploadErrorStatus(
      async () => { throw new Error('network down'); },
      (text) => messages.push(text),
      'The recording could not be sent.',
    );
    assert.equal(result, null);
    assert.deepEqual(messages, ['network down']);
    const fallback = [];
    await withUploadErrorStatus(
      async () => { throw new Error(); },
      (text) => fallback.push(text),
      'The recording could not be sent.',
    );
    assert.deepEqual(fallback, ['The recording could not be sent.']);
  });
});
