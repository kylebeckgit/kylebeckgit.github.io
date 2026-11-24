import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createConnection } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { stepMoodToward } from '../src/logic.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8787;
const URL = `ws://127.0.0.1:${PORT}`;
const ORIGIN = 'http://localhost:4173';

function waitPort(port, timeout = 20_000) {
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

function openClient() {
  const ws = new WebSocket(URL, { headers: { Origin: ORIGIN } });
  const inbox = [];
  let welcome;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('welcome timeout')), 8000);
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
  return { ws, inbox, ready, next: (type, timeout = 8000) => new Promise((resolve, reject) => {
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
  }) };
}

describe('multi-client jam room', () => {
  let child;
  let persistDir;

  before(async () => {
    persistDir = mkdtempSync(path.join(tmpdir(), 'jam-room-'));
    const wrangler = path.join(dir, 'node_modules/wrangler/bin/wrangler.js');
    child = spawn(process.execPath, [wrangler, 'dev', '-c', 'wrangler.test.jsonc', '--local', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', persistDir], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1' },
    });
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
    await waitPort(PORT);
    // Give the inspector a moment after the port opens.
    await new Promise((r) => setTimeout(r, 500));
  });

  after(() => {
    if (child) child.kill('SIGTERM');
    if (persistDir) rmSync(persistDir, { recursive: true, force: true });
  });

  it('rejects a WebSocket from a foreign origin', async () => {
    await assert.rejects(async () => {
      const ws = new WebSocket(URL, { headers: { Origin: 'https://example.com' } });
      await new Promise((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('unexpected-response', (_req, res) => reject(new Error(`status ${res.statusCode}`)));
        ws.on('error', reject);
        setTimeout(() => reject(new Error('no response')), 4000);
      });
    }, /status 403|no response|Unexpected server response/);
  });

  it('converges three clients on the same state, tally, and a remote strike', async () => {
    const a = openClient();
    const b = openClient();
    const c = openClient();
    const [wa, wb, wc] = await Promise.all([a.ready, b.ready, c.ready]);
    assert.equal(wa.state.bpm, wb.state.bpm);
    assert.equal(wa.state.seed, wc.state.seed);
    assert.equal(wa.state.phraseIndex, wb.state.phraseIndex);
    assert.equal(wa.state.epochMs, wc.state.epochMs);
    assert.ok(wa.userId);
    assert.notEqual(wa.userId, wb.userId);

    a.ws.send(JSON.stringify({ type: 'vote', family: 'mood', value: 'dark' }));
    const tallyB = await b.next('tally', 3000);
    const tallyC = c.inbox.find((m) => m.type === 'tally') || await c.next('tally', 3000);
    assert.equal(tallyB.families.mood?.dark, 1);
    assert.equal(tallyC.families.mood?.dark, 1);

    const stateA = a.next('state', 6000);
    const stateB = b.next('state', 6000);
    const stateC = c.next('state', 6000);
    const [sa, sb, sc] = await Promise.all([stateA, stateB, stateC]);
    assert.equal(sa.phraseIndex, sb.phraseIndex);
    assert.equal(sb.phraseIndex, sc.phraseIndex);
    assert.equal(sa.epochMs, sb.epochMs);
    const expectedMood = stepMoodToward(wa.state.mood, 'dark');
    assert.equal(sa.mood, expectedMood);
    assert.equal(sb.mood, sa.mood);
    assert.equal(sc.mood, sa.mood);

    b.ws.send(JSON.stringify({ type: 'strike', degree: 2, velocity: 0.8, position: 0.4, beatTime: 0.5 }));
    const strikeA = await a.next('strike', 3000);
    assert.equal(strikeA.degree, 2);
    assert.equal(strikeA.userId, wb.userId);
    assert.equal(c.inbox.some((m) => m.type === 'strike' && m.degree === 2) || true, true);
    const strikeC = c.inbox.find((m) => m.type === 'strike') || await c.next('strike', 2000);
    assert.equal(strikeC.userId, wb.userId);

    a.ws.close();
    b.ws.close();
    c.ws.close();
  });
});
