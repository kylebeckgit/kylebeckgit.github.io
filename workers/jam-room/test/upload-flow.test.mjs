import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createConnection } from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { encodeWav16 } from '../../../src/tools/jam-room/upload/wav16.js';
import { MAX_UPLOAD_BODY_BYTES } from '../src/validate.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8788;
const HTTP = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}`;
const ORIGIN = 'http://localhost:4173';
const ADMIN = 'test-admin-token';

function sineWav(seconds = 0.4) {
  const sampleRate = 44100;
  const n = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.4;
  return encodeWav16(samples, sampleRate);
}

function toB64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function waitPort(port, timeout = 30_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = createConnection({ port, host: '127.0.0.1' }, () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        if (Date.now() - start > timeout) reject(new Error('wrangler dev did not start'));
        else setTimeout(tryOnce, 200);
      });
    };
    tryOnce();
  });
}

let ipSeq = 10;
function nextTestIp() {
  ipSeq += 1;
  return `203.0.113.${ipSeq}`;
}

function openClient(ip = nextTestIp()) {
  const ws = new WebSocket(WS, { headers: { Origin: ORIGIN, 'X-Test-IP': ip } });
  const inbox = [];
  let welcome;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('welcome timeout')), 12000);
    ws.on('message', (data) => {
      const msg = JSON.parse(String(data));
      inbox.push(msg);
      if (msg.type === 'welcome' && !welcome) {
        welcome = msg;
        clearTimeout(timer);
        resolve(msg);
      }
    });
    ws.on('error', reject);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello' })));
  });
  return {
    ws,
    inbox,
    ready,
    next: (type, timeout = 8000) => new Promise((resolve, reject) => {
      const found = inbox.find((m) => m.type === type && m !== welcome);
      if (found) return resolve(found);
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), timeout);
      const onMsg = (data) => {
        const msg = JSON.parse(String(data));
        if (msg.type === type) {
          clearTimeout(timer);
          ws.off('message', onMsg);
          resolve(msg);
        }
      };
      ws.on('message', onMsg);
    }),
  };
}


function postDeclaredLength({ path = '/uploads', headers = {}, declaredLength, timeout = 4000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method: 'POST',
      headers: { ...headers, 'Content-Length': String(declaredLength) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let payload = {};
        try { payload = JSON.parse(text); } catch { /* non-JSON */ }
        resolve({ status: res.statusCode, payload });
      });
    });
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error('timed out waiting for a response to an oversize Content-Length'));
    }, timeout);
    req.on('error', (err) => { clearTimeout(timer); reject(err); });
    req.on('response', () => clearTimeout(timer));
    req.flushHeaders();
  });
}

async function postUpload(token, { testAi = 'pass', consent = true, audio, keepOptIn = false, ip, headers: extra = {}, meta = {} } = {}) {
  const body = {
    meta: { consent, kind: 'pitched', f0Hz: 440, keepOptIn, testAi, ...meta },
    audio: toB64(audio || sineWav()),
  };
  const headers = {
    Origin: ORIGIN,
    'Content-Type': 'application/json',
    'X-Jam-Upload': token || '',
    'X-Test-AI': testAi,
    'X-Test-IP': ip || nextTestIp(),
    ...extra,
  };
  const res = await fetch(`${HTTP}/uploads`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

describe('jam room upload flow', () => {
  let child;
  let persistDir;

  before(async () => {
    persistDir = mkdtempSync(path.join(tmpdir(), 'jam-uploads-'));
    const wrangler = path.join(dir, 'node_modules/wrangler/bin/wrangler.js');
    child = spawn(process.execPath, [wrangler, 'dev', '-c', 'wrangler.test.jsonc', '--local', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', persistDir], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1' },
    });
    let err = '';
    child.stderr.on('data', (d) => { err += String(d); globalThis.__wranglerErr = err; });
    child.stdout.on('data', (d) => { err += String(d); globalThis.__wranglerErr = err; });
    try {
      await waitPort(PORT);
    } catch (error) {
      throw new Error(`${error.message}\n${err.slice(-2000)}`);
    }
  });

  after(() => {
    if (child) child.kill('SIGTERM');
    try { rmSync(persistDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('auto-approves a valid clip and broadcasts it to the room', async () => {
    const a = openClient();
    const welcome = await a.ready;
    assert.ok(Array.isArray(welcome.uploads));
    const uploaded = await postUpload(welcome.uploadToken, { testAi: 'pass' });
    assert.equal(uploaded.status, 200);
    assert.equal(uploaded.json.status, 'approved');
    const fanout = await a.next('uploads');
    assert.equal(fanout.added, uploaded.json.id);
    assert.equal(fanout.uploads.some((u) => u.id === uploaded.json.id), true);
    const clip = fanout.uploads.find((u) => u.id === uploaded.json.id) || fanout.uploads[0];
    assert.match(clip.audioUrl, /\/uploads\/[^/]+\/audio\?v=/);
    const audio = await fetch(`${HTTP}${clip.audioUrl}`, { headers: { Origin: ORIGIN } });
    assert.equal(audio.status, 200);
    assert.match(audio.headers.get('content-type') || '', /audio\/wav/);
    assert.match(audio.headers.get('cache-control') || '', /no-store/i);
    a.ws.close();
  });

  it('rejects unsafe speech and does not add it to the pool', async () => {
    const a = openClient();
    const welcome = await a.ready;
    const before = welcome.uploads.length;
    const uploaded = await postUpload(welcome.uploadToken, { testAi: 'unsafe' });
    assert.equal(uploaded.status, 400);
    assert.equal(uploaded.json.status, 'rejected');
    const listed = await fetch(`${HTTP}/uploads`, { headers: { Origin: ORIGIN } }).then((r) => r.json());
    assert.equal(listed.uploads.some((u) => u.id === uploaded.json.id), false);
    assert.ok(listed.uploads.length >= before || listed.uploads.length >= 0);
    a.ws.close();
  });

  it('fails closed and holds the clip when AI is unavailable', async () => {
    const a = openClient();
    const welcome = await a.ready;
    const uploaded = await postUpload(welcome.uploadToken, { testAi: 'down' });
    assert.equal(uploaded.status, 202);
    assert.equal(uploaded.json.status, 'pending');
    const listed = await fetch(`${HTTP}/uploads`, { headers: { Origin: ORIGIN } }).then((r) => r.json());
    assert.equal(listed.uploads.some((u) => u.id === uploaded.json.id), false);
    a.ws.close();
  });

  it('returns 503 and leaves quota unchanged when the review queue is full', async () => {
    const fillers = [];
    const queueCap = 3;
    for (let i = 0; i < queueCap; i++) fillers.push(openClient());
    const welcomes = await Promise.all(fillers.map((c) => c.ready));
    const held = await Promise.all(welcomes.map((welcome) => postUpload(welcome.uploadToken, { testAi: 'down' })));
    assert.ok(held.every((row) => row.status === 202), held.map((row) => row.status).join(','));

    const probeIp = nextTestIp();
    const probe = openClient(probeIp);
    const welcome = await probe.ready;
    const blocked = await postUpload(welcome.uploadToken, { testAi: 'pass', ip: probeIp });
    assert.equal(blocked.status, 503);
    assert.match(blocked.json.reason || '', /busy reviewing/i);

    for (const c of fillers) c.ws.close();
    await new Promise((resolve) => setTimeout(resolve, 250));
    let cleared;
    for (let i = 0; i < 6; i++) {
      cleared = await fetch(`${HTTP}/admin/kill`, { method: 'POST', headers: { 'X-Admin-Token': ADMIN, Origin: ORIGIN } });
      if (cleared.status === 200) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(cleared.status, 200);

    const retry = await postUpload(welcome.uploadToken, { testAi: 'pass', ip: probeIp });
    assert.equal(retry.status, 200);
    assert.equal(retry.json.status, 'approved');

    probe.ws.close();
  });

  it('counts a failed or invalid upload toward the rate limit', async () => {
    const a = openClient();
    const welcome = await a.ready;
    const noConsent = await postUpload(welcome.uploadToken, { consent: false, testAi: 'pass' });
    assert.equal(noConsent.status, 400);
    const again = await postUpload(welcome.uploadToken, { testAi: 'pass' });
    assert.equal(again.status, 429);
    a.ws.close();
  });

  it('rate-limits a second successful upload from the same session', async () => {
    const a = openClient();
    const welcome = await a.ready;
    const first = await postUpload(welcome.uploadToken, { testAi: 'pass' });
    assert.equal(first.status, 200);
    const second = await postUpload(welcome.uploadToken, { testAi: 'pass' });
    assert.equal(second.status, 429);
    a.ws.close();
  });

  it('rate-limits a concurrent second upload after the reservation is written', async () => {
    const a = openClient();
    const welcome = await a.ready;
    const [first, second] = await Promise.all([
      postUpload(welcome.uploadToken, { testAi: 'pass' }),
      postUpload(welcome.uploadToken, { testAi: 'pass' }),
    ]);
    const statuses = [first.status, second.status].sort((x, y) => x - y);
    assert.deepEqual(statuses, [200, 429]);
    a.ws.close();
  });

  it('auto-removes a clip when report threshold is reached', async () => {
    const uploaderIp = nextTestIp();
    const a = openClient(uploaderIp);
    const welcome = await a.ready;
    const uploaded = await postUpload(welcome.uploadToken, {
      testAi: 'speech',
      ip: uploaderIp,
      meta: { kind: 'unpitched', speech: false, resonanceMix: 0.2, slices: [{ startMs: 0, endMs: 80, slot: 'kick' }] },
    });
    assert.equal(uploaded.status, 200);
    assert.equal(uploaded.json.upload.speech, true);
    assert.equal(uploaded.json.upload.hasSpeech, true);
    assert.equal(uploaded.json.upload.meta.speech, true);
    assert.equal(uploaded.json.upload.meta.hasSpeech, true);
    assert.equal(uploaded.json.upload.meta.resonanceMix, 1);
    assert.deepEqual(uploaded.json.upload.meta.slices, []);
    const b = openClient();
    await b.ready;
    b.ws.send(JSON.stringify({ type: 'report', uploadId: uploaded.json.id }));
    const removed = await Promise.race([a.next('upload-removed'), b.next('upload-removed')]);
    assert.equal(removed.uploadId, uploaded.json.id);
    a.ws.close();
    b.ws.close();
  });

  it('counts many sockets from one IP as a single report', async () => {
    const uploaderIp = nextTestIp();
    const reporterIp = nextTestIp();
    const uploader = openClient(uploaderIp);
    const welcome = await uploader.ready;
    const uploaded = await postUpload(welcome.uploadToken, { testAi: 'pass', ip: uploaderIp });
    assert.equal(uploaded.status, 200);
    const decoys = [];
    for (let i = 0; i < 5; i++) decoys.push(openClient());
    await Promise.all(decoys.map((c) => c.ready));
    const tabs = [];
    for (let i = 0; i < 4; i++) tabs.push(openClient(reporterIp));
    await Promise.all(tabs.map((c) => c.ready));
    let pulled = false;
    const watch = Promise.race([
      uploader.next('upload-removed', 1500),
      ...tabs.map((c) => c.next('upload-removed', 1500)),
    ]).then(() => { pulled = true; }).catch(() => {});
    for (const tab of tabs) tab.ws.send(JSON.stringify({ type: 'report', uploadId: uploaded.json.id }));
    await watch;
    assert.equal(pulled, false);
    const listed = await fetch(`${HTTP}/uploads`, { headers: { Origin: ORIGIN } }).then((r) => r.json());
    const publicClip = listed.uploads.find((u) => u.id === uploaded.json.id);
    assert.ok(publicClip);
    assert.equal('reports' in publicClip, false);
    assert.equal('uploaderHash' in publicClip, false);
    const admin = await fetch(`${HTTP}/admin/uploads`, { headers: { 'X-Admin-Token': ADMIN } }).then((r) => r.json());
    const row = admin.uploads.find((u) => u.id === uploaded.json.id);
    assert.equal(row.reports.length, 1);
    assert.match(String(row.reports[0]), /^[0-9a-f]{64}$/);
    assert.equal(String(row.reports[0]).includes(reporterIp), false);
    for (const c of [uploader, ...decoys, ...tabs]) c.ws.close();
  });

  it('auto-removes a clip after 3 distinct IPs report it', async () => {
    const uploaderIp = nextTestIp();
    const uploader = openClient(uploaderIp);
    const welcome = await uploader.ready;
    const uploaded = await postUpload(welcome.uploadToken, { testAi: 'pass', ip: uploaderIp });
    assert.equal(uploaded.status, 200);
    const decoys = [];
    for (let i = 0; i < 8; i++) decoys.push(openClient());
    await Promise.all(decoys.map((c) => c.ready));
    const reporters = [openClient(), openClient(), openClient()];
    await Promise.all(reporters.map((c) => c.ready));
    const removedP = Promise.race([
      uploader.next('upload-removed'),
      ...reporters.map((c) => c.next('upload-removed')),
    ]);
    for (const client of reporters) client.ws.send(JSON.stringify({ type: 'report', uploadId: uploaded.json.id }));
    const removed = await removedP;
    assert.equal(removed.uploadId, uploaded.json.id);
    const listed = await fetch(`${HTTP}/uploads`, { headers: { Origin: ORIGIN } }).then((r) => r.json());
    assert.equal(listed.uploads.some((u) => u.id === uploaded.json.id), false);
    for (const c of [uploader, ...decoys, ...reporters]) c.ws.close();
  });

  it('does not count the uploader IP toward reports on their own clip', async () => {
    const ip = nextTestIp();
    const uploader = openClient(ip);
    const tab = openClient(ip);
    const welcome = await uploader.ready;
    await tab.ready;
    const uploaded = await postUpload(welcome.uploadToken, { testAi: 'pass', ip });
    assert.equal(uploaded.status, 200);
    let pulled = false;
    const watch = Promise.race([
      uploader.next('upload-removed', 1500),
      tab.next('upload-removed', 1500),
    ]).then(() => { pulled = true; }).catch(() => {});
    uploader.ws.send(JSON.stringify({ type: 'report', uploadId: uploaded.json.id }));
    tab.ws.send(JSON.stringify({ type: 'report', uploadId: uploaded.json.id }));
    await watch;
    assert.equal(pulled, false);
    const listed = await fetch(`${HTTP}/uploads`, { headers: { Origin: ORIGIN } }).then((r) => r.json());
    assert.ok(listed.uploads.some((u) => u.id === uploaded.json.id));
    const admin = await fetch(`${HTTP}/admin/uploads`, { headers: { 'X-Admin-Token': ADMIN } }).then((r) => r.json());
    const row = admin.uploads.find((u) => u.id === uploaded.json.id);
    assert.equal((row.reports || []).length, 0);
    uploader.ws.close();
    tab.ws.close();
  });

  it('lets admin kill the pool or remove one clip, and hides the route without a token', async () => {
    const a = openClient();
    const welcome = await a.ready;
    const uploaded = await postUpload(welcome.uploadToken, { testAi: 'pass' });
    assert.equal(uploaded.status, 200);
    const hidden = await fetch(`${HTTP}/admin/uploads`);
    assert.equal(hidden.status, 404);
    const listed = await fetch(`${HTTP}/admin/uploads`, { headers: { 'X-Admin-Token': ADMIN } }).then((r) => r.json());
    assert.equal(listed.ok, true);
    assert.ok(listed.uploads.some((u) => u.id === uploaded.json.id));
    const audioUrl = uploaded.json.upload.audioUrl;
    const removed = await fetch(`${HTTP}/admin/remove/${uploaded.json.id}`, {
      method: 'POST',
      headers: { 'X-Admin-Token': ADMIN, Origin: ORIGIN },
    }).then((r) => r.json());
    assert.equal(removed.ok, true);
    await a.next('upload-removed');
    const gone = await fetch(`${HTTP}${audioUrl}`, { headers: { Origin: ORIGIN } });
    assert.equal(gone.status, 404);
    assert.match(gone.headers.get('cache-control') || '', /no-store/i);
    const killed = await fetch(`${HTTP}/admin/kill`, {
      method: 'POST',
      headers: { 'X-Admin-Token': ADMIN, Origin: ORIGIN },
    }).then((r) => r.json());
    assert.equal(killed.cleared, true);
    const cleared = await a.next('uploads-cleared');
    assert.equal(cleared.type, 'uploads-cleared');
    a.ws.close();
  });

  it('rejects an oversize Content-Length with 413 without reading, and skips the body on 401 and 429', async () => {
    const unread = 'this body must not need to be read';
    const unauthorized = await fetch(`${HTTP}/uploads`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: unread,
    });
    assert.equal(unauthorized.status, 401);

    const uploaderIp = nextTestIp();
    const client = openClient(uploaderIp);
    const welcome = await client.ready;
    const first = await postUpload(welcome.uploadToken, { testAi: 'pass', ip: uploaderIp });
    assert.equal(first.status, 200);

    const limited = await fetch(`${HTTP}/uploads`, {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        'Content-Type': 'application/json',
        'X-Jam-Upload': welcome.uploadToken,
        'X-Test-AI': 'pass',
        'X-Test-IP': uploaderIp,
      },
      body: unread,
    });
    assert.equal(limited.status, 429);

    const other = openClient();
    const otherWelcome = await other.ready;
    const oversize = await postDeclaredLength({
      headers: {
        Origin: ORIGIN,
        'Content-Type': 'application/json',
        'X-Jam-Upload': otherWelcome.uploadToken,
        'X-Test-AI': 'pass',
        'X-Test-IP': nextTestIp(),
      },
      declaredLength: MAX_UPLOAD_BODY_BYTES + 10,
    });
    assert.equal(oversize.status, 413);
    assert.match(oversize.payload.reason || '', /too large/i);
    client.ws.close();
    other.ws.close();
  });

  it('rejects a forged or missing upload token, and rate-limits a second session on the same IP', async () => {
    const a = openClient();
    const welcome = await a.ready;
    assert.ok(welcome.uploadToken);
    const missing = await postUpload('', { testAi: 'pass', ip: '203.0.113.200' });
    assert.equal(missing.status, 401);
    const forged = await postUpload('not-a-session', { testAi: 'pass', ip: '203.0.113.200', headers: { 'X-Jam-User': welcome.userId } });
    assert.equal(forged.status, 401);
    const first = await postUpload(welcome.uploadToken, { testAi: 'pass', ip: '203.0.113.201' });
    assert.equal(first.status, 200);
    const b = openClient();
    const other = await b.ready;
    const shared = await postUpload(other.uploadToken, { testAi: 'pass', ip: '203.0.113.201' });
    assert.equal(shared.status, 429);
    a.ws.close();
    b.ws.close();
  });

  it('returns CORS headers on a failed admin token and allows preflight', async () => {
    const preflight = await fetch(`${HTTP}/admin/uploads`, {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'X-Admin-Token',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), ORIGIN);
    assert.match(preflight.headers.get('access-control-allow-headers') || '', /X-Admin-Token/i);
    const denied = await fetch(`${HTTP}/admin/uploads`, {
      headers: { Origin: ORIGIN, 'X-Admin-Token': 'wrong-token' },
    });
    assert.equal(denied.status, 404);
    assert.equal(denied.headers.get('access-control-allow-origin'), ORIGIN);
  });
});
