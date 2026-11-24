import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mountJamAdmin, sendAdminRequest } from './admin.js';

describe('jam room admin requests', () => {
  it('sets the existing failure copy when fetch throws a network or CORS error', async () => {
    const result = await sendAdminRequest({
      api: 'https://jam-room.example',
      path: '/admin/uploads',
      token: 'secret',
      fetch: async () => { throw new TypeError('Failed to fetch'); },
    });
    assert.equal(result.ok, false);
    assert.equal(result.message, 'The request failed.');

    const messages = [];
    const statusEl = { textContent: '' };
    const root = {
      getAttribute() { return 'https://jam-room.example'; },
      querySelector(sel) {
        if (sel.includes('status')) return statusEl;
        if (sel.includes('token')) return { value: 'secret' };
        if (sel.includes('list')) return { replaceChildren() {}, append() {} };
        if (sel.includes('load') || sel.includes('kill')) return { addEventListener() {} };
        return null;
      },
    };
    const admin = mountJamAdmin(root, {
      fetch: async () => { throw new TypeError('Failed to fetch'); },
    });
    Object.defineProperty(statusEl, 'textContent', {
      set(value) { messages.push(value); },
      get() { return messages.at(-1) || ''; },
    });
    await admin.load();
    assert.equal(messages.at(-1), 'The request failed.');
  });
});
