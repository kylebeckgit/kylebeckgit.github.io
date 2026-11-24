import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { corsHeaders, notFound } from './origins.js';

describe('admin CORS', () => {
  it('keeps a 404 for a bad token and still sends CORS headers for an allowed origin', async () => {
    const origin = 'https://kyle-beck.com';
    const denied = notFound(origin);
    assert.equal(denied.status, 404);
    assert.equal(denied.headers.get('Access-Control-Allow-Origin'), origin);
    assert.match(denied.headers.get('Access-Control-Allow-Headers') || '', /X-Admin-Token/);
    const preflight = corsHeaders(origin);
    assert.equal(preflight['Access-Control-Allow-Origin'], origin);
    assert.match(preflight['Access-Control-Allow-Methods'], /GET/);
    const foreign = notFound('https://example.com');
    assert.equal(foreign.status, 404);
    assert.equal(foreign.headers.get('Access-Control-Allow-Origin'), null);
  });
});
