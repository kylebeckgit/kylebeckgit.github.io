import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav16 } from '../../../src/tools/jam-room/upload/wav16.js';
import {
  allowUploadKeys,
  allowUploadRate,
  decideUploadAdmission,
  MAX_UPLOAD_BODY_BYTES,
  PENDING_CAP,
  pruneUploadRates,
  MAX_JSON_BODY_BYTES,
  readBodyCapped,
  readJsonCapped,
  refundUploadKeys,
  reportThreshold,
  sanitizeMeta,
  shouldAutoRemove,
  validateUpload,
} from './validate.js';

function sineWav(hz = 440, seconds = 0.4, sampleRate = 44100, amp = 0.4) {
  const n = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = Math.sin(2 * Math.PI * hz * i / sampleRate) * amp;
  return encodeWav16(samples, sampleRate);
}

describe('upload validation and reports', () => {
  it('accepts a consented wav and rejects silence, missing consent, and clipping', () => {
    const ok = validateUpload(sineWav(), { consent: true, kind: 'pitched', f0Hz: 440 });
    assert.equal(ok.ok, true);
    assert.equal(ok.meta.consent, true);
    const silent = encodeWav16(new Float32Array(44100 * 0.2), 44100);
    assert.equal(validateUpload(silent, { consent: true }).ok, false);
    assert.equal(validateUpload(sineWav(), { consent: false }).ok, false);
    const high = validateUpload(sineWav(440, 0.4, 96000), { consent: true, kind: 'pitched', f0Hz: 440 });
    assert.equal(high.ok, true);
    assert.equal(high.decoded.sampleRate, 44100);
  });

  it('enforces 1 upload per 5 minutes and 10 per day', () => {
    const now = 1_000_000;
    const history = {};
    const first = allowUploadRate(history, now, 'u1');
    assert.equal(first.ok, true);
    history.u1 = first.times;
    assert.equal(allowUploadRate(history, now + 60_000, 'u1').ok, false);
    const later = allowUploadRate(history, now + 5 * 60 * 1000, 'u1');
    assert.equal(later.ok, true);
    history.u1 = Array.from({ length: 10 }, (_, i) => now + i * 6 * 60 * 1000);
    assert.equal(allowUploadRate(history, now + 11 * 6 * 60 * 1000, 'u1').ok, false);
  });

  it('prunes stale rate-limit entries and applies the cap to every key', () => {
    const now = 10_000_000;
    const history = {
      stale: [now - 25 * 60 * 60 * 1000],
      fresh: [now - 6 * 60 * 1000],
    };
    const pruned = pruneUploadRates(history, now);
    assert.equal('stale' in pruned, false);
    assert.deepEqual(pruned.fresh, [now - 6 * 60 * 1000]);
    const allowed = allowUploadKeys(history, now, ['token:a', 'ip:203.0.113.1']);
    assert.equal(allowed.ok, true);
    assert.equal(allowed.rates['token:a'].includes(now), true);
    assert.equal(allowed.rates['ip:203.0.113.1'].includes(now), true);
    const blocked = allowUploadKeys(allowed.rates, now + 60_000, ['token:b', 'ip:203.0.113.1']);
    assert.equal(blocked.ok, false);
  });

  it('does not reserve quota when the review queue is full, and can refund a reservation', () => {
    const now = 20_000_000;
    const rates = { 'token:a': [now - 6 * 60 * 1000] };
    const full = decideUploadAdmission({
      pendingCount: PENDING_CAP,
      rates,
      now,
      keys: ['token:a', 'ip:hash'],
    });
    assert.equal(full.ok, false);
    assert.equal(full.status, 503);
    assert.equal(full.reserved, false);
    assert.equal((full.rates['token:a'] || []).includes(now), false);
    assert.equal('ip:hash' in (full.rates || {}), false);

    const open = decideUploadAdmission({
      pendingCount: PENDING_CAP - 1,
      rates,
      now,
      keys: ['token:a', 'ip:hash'],
    });
    assert.equal(open.ok, true);
    assert.equal(open.reserved, true);
    assert.equal(open.rates['token:a'].includes(now), true);
    const refunded = refundUploadKeys(open.rates, now, ['token:a', 'ip:hash']);
    assert.equal((refunded['token:a'] || []).includes(now), false);
    assert.equal('ip:hash' in refunded, false);
    assert.deepEqual(refunded['token:a'], [now - 6 * 60 * 1000]);
  });

  it('auto-pulls a clip at 3 reports or 20 percent of the room, whichever is lower', () => {
    assert.equal(reportThreshold(4), 1);
    assert.equal(reportThreshold(10), 2);
    assert.equal(reportThreshold(20), 3);
    assert.equal(shouldAutoRemove(1, 4), true);
    assert.equal(shouldAutoRemove(2, 20), false);
    assert.equal(shouldAutoRemove(3, 20), true);
  });

  it('caps request bodies even when Content-Length is missing or too small', async () => {
    const huge = 'x'.repeat(MAX_UPLOAD_BODY_BYTES + 1);
    const missing = await readBodyCapped(new Request('https://example.com', { method: 'POST', body: huge }));
    assert.equal(missing.tooLarge, true);
    const lie = await readBodyCapped(new Request('https://example.com', {
      method: 'POST',
      headers: { 'Content-Length': '12' },
      body: huge,
    }));
    assert.equal(lie.tooLarge, true);
    const okBody = '{"ok":true}';
    const ok = await readBodyCapped(new Request('https://example.com', { method: 'POST', body: okBody }));
    assert.equal(ok.tooLarge, false);
    assert.equal(new TextDecoder().decode(ok.bytes), okBody);
  });

  it('rejects a huge Content-Length without reading the body, and aborts a chunked body over the cap', async () => {
    let gotReader = 0;
    const declared = await readBodyCapped({
      headers: { get: (name) => name.toLowerCase() === 'content-length' ? String(MAX_UPLOAD_BODY_BYTES + 10) : null },
      body: {
        getReader() {
          gotReader += 1;
          throw new Error('oversize Content-Length must not start a reader');
        },
        cancel() { gotReader += 1; },
      },
    });
    assert.equal(declared.tooLarge, true);
    assert.equal(declared.bytes, null);
    assert.equal(gotReader, 0);

    let pulls = 0;
    let cancelled = false;
    const chunk = new Uint8Array(32 * 1024);
    const stream = new ReadableStream({
      pull(controller) {
        pulls += 1;
        if (pulls > 80) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
      },
      cancel() { cancelled = true; },
    });
    const cap = 80 * 1024;
    const chunked = await readBodyCapped(new Request('https://example.com', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    }), cap);
    assert.equal(chunked.tooLarge, true);
    assert.equal(cancelled, true);
    assert.ok(pulls * chunk.byteLength > cap);
    assert.ok(pulls * chunk.byteLength <= cap + chunk.byteLength * 2);

    const jsonTooBig = await readJsonCapped(new Request('https://example.com', {
      method: 'POST',
      headers: { 'Content-Length': String(MAX_JSON_BODY_BYTES + 1) },
      body: new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(8)); controller.close(); } }),
      duplex: 'half',
    }));
    assert.equal(jsonTooBig.tooLarge, true);
    assert.equal(jsonTooBig.value, null);
  });

  it('drops non-finite pitch metadata', () => {
    const meta = sanitizeMeta({ consent: true, kind: 'pitched', f0Hz: Infinity, recordedMidi: Infinity });
    assert.equal(meta.f0Hz, null);
    assert.equal(meta.recordedMidi, null);
  });
});
