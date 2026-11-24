// Jam room Worker. One SQLite Durable Object holds the shared clock and
// state. Clients render audio locally. Hibernation WebSockets only.

import { DurableObject } from 'cloudflare:workers';
import {
  applyVote,
  cloneState,
  createRoom,
  nextCloseAtMs,
  parseCommand,
  STRIKES_PER_BEAT,
  strikeBeatInRange,
  takeStrikeToken,
  tallyView,
  wakeRoom,
} from './logic.js';
import { allowedOrigin, corsHeaders } from './origins.js';
import { createTallyBroadcaster, TALLY_MIN_MS } from './tally.js';

const ROOM_NAME = 'main';
const MAX_SOCKETS = 80;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      if (!allowedOrigin(origin)) return new Response('Forbidden', { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const upgrade = request.headers.get('Upgrade') || '';
    if (upgrade.toLowerCase() === 'websocket') {
      if (!allowedOrigin(origin)) return new Response('Forbidden', { status: 403 });
      const stub = env.JAM_ROOM.getByName(ROOM_NAME);
      return stub.fetch(request);
    }

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json({ ok: true, service: 'jam-room' }, 200, corsHeaders(origin));
    }

    if (request.method === 'POST' && url.pathname === '/reset') {
      if (!checkAdmin(request, env)) return new Response('Not found', { status: 404 });
      const stub = env.JAM_ROOM.getByName(ROOM_NAME);
      const result = await stub.reset();
      return json(result, 200, corsHeaders(origin));
    }

    return new Response('Not found', { status: 404, headers: corsHeaders(origin) });
  },
};

export class JamRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.room = null;
    this.tallyBroadcaster = createTallyBroadcaster({
      minMs: TALLY_MIN_MS,
      send: (now) => this.broadcast({ type: 'tally', ...tallyView(this.room, now) }),
    });
    ctx.blockConcurrencyWhile(async () => {
      await this.load();
    });
  }

  async load() {
    const stored = await this.ctx.storage.get('room');
    const now = Date.now();
    const options = testOptions(this.env);
    if (stored?.state) {
      this.room = createRoom(now, { state: stored.state, cooldowns: stored.cooldowns, ...options });
      this.room.votes = stored.votes || {};
      this.room.commands = stored.commands || {};
      if (options.barsPerPhrase) this.room.state.barsPerPhrase = options.barsPerPhrase;
      if (options.bpm && !stored.state?.epochMs) this.room.state.bpm = options.bpm;
    } else {
      this.room = createRoom(now, options);
    }
    if (!this.room.state.epochMs) this.room.state.epochMs = now;
  }

  async save() {
    await this.ctx.storage.put('room', {
      state: cloneState(this.room.state),
      votes: this.room.votes,
      cooldowns: this.room.cooldowns,
      commands: this.room.commands,
    });
  }

  async reset() {
    const now = Date.now();
    this.room = createRoom(now, testOptions(this.env));
    await this.ctx.storage.deleteAll();
    await this.save();
    this.tallyBroadcaster.clear();
    await this.scheduleClose();
    this.broadcast({ type: 'state', ...cloneState(this.room.state), serverMs: now });
    this.broadcast({ type: 'tally', ...tallyView(this.room, now) });
    return { ok: true, state: cloneState(this.room.state) };
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/reset') {
      const body = await this.reset();
      return Response.json(body);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= MAX_SOCKETS) {
      return new Response('Room is full', { status: 503 });
    }

    const now = Date.now();
    await this.syncToNow(now);
    this.ctx.acceptWebSocket(server);
    const userId = crypto.randomUUID();
    server.serializeAttachment({ userId, strikeBeats: [] });
    this.send(server, { type: 'welcome', userId, state: cloneState(this.room.state), tally: tallyView(this.room, now), serverMs: now });
    await this.scheduleClose();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      msg = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return;
    }
    const attachment = ws.deserializeAttachment() || {};
    const userId = attachment.userId;
    if (!userId) return;
    const now = Date.now();

    if (msg.type === 'hello') {
      await this.syncToNow(now);
      this.send(ws, { type: 'welcome', userId, state: cloneState(this.room.state), tally: tallyView(this.room, now), serverMs: now });
      return;
    }

    if (msg.type === 'ping') {
      this.send(ws, { type: 'pong', t: msg.t, serverMs: now });
      return;
    }

    if (msg.type === 'vote') {
      let vote = { family: msg.family, value: msg.value };
      if (typeof msg.text === 'string') {
        const parsed = parseCommand(msg.text);
        if (!parsed) return;
        vote = parsed;
      }
      const result = applyVote(this.room, userId, vote.family, vote.value, now);
      if (!result.ok) return;
      await this.save();
      this.broadcastTally(now);
      return;
    }

    if (msg.type === 'strike') {
      const degree = Number(msg.degree);
      const velocity = clamp01(msg.velocity);
      const position = clamp01(msg.position);
      const beatTime = Number(msg.beatTime);
      if (!Number.isFinite(degree) || !Number.isFinite(beatTime)) return;
      if (!strikeBeatInRange(this.room.state, beatTime, now)) return;
      const bucket = takeStrikeToken(attachment.strikeBucket, now);
      attachment.strikeBucket = { tokens: bucket.tokens, updatedAt: bucket.updatedAt };
      if (!bucket.ok) {
        ws.serializeAttachment(attachment);
        return;
      }
      const beat = Math.floor(beatTime);
      const recent = (attachment.strikeBeats || []).filter((b) => b === beat);
      if (recent.length >= STRIKES_PER_BEAT) {
        ws.serializeAttachment(attachment);
        return;
      }
      attachment.strikeBeats = [...(attachment.strikeBeats || []).filter((b) => b >= beat - 2), beat];
      ws.serializeAttachment(attachment);
      this.broadcast({
        type: 'strike',
        userId,
        degree,
        velocity,
        position,
        beatTime,
      }, ws);
    }
  }

  async webSocketClose(ws, code, reason) {
    try {
      if (code >= 1000 && code < 5000 && code !== 1004 && code !== 1005 && code !== 1006 && code !== 1015) {
        ws.close(code, reason);
      } else {
        ws.close();
      }
    } catch {
      // already closed
    }
    if (this.ctx.getWebSockets().length === 0) {
      try { await this.ctx.storage.deleteAlarm(); } catch { /* none */ }
    }
  }

  async webSocketError(ws) {
    try { ws.close(); } catch { /* already gone */ }
  }

  async alarm() {
    const now = Date.now();
    await this.syncToNow(now);
    await this.scheduleClose();
  }

  // Catch up an idle room in one step, then broadcast at most once.
  async syncToNow(now = Date.now()) {
    const sockets = this.ctx.getWebSockets().length;
    const result = wakeRoom(this.room, now, Math.max(1, sockets));
    if (!result.advanced) return result;
    await this.save();
    if (sockets > 0) {
      this.broadcast({ type: 'state', ...result.state, serverMs: now, applied: result.applied });
      this.broadcast({ type: 'tally', ...tallyView(this.room, now) });
    }
    return result;
  }

  async scheduleClose() {
    if (this.ctx.getWebSockets().length === 0) {
      try { await this.ctx.storage.deleteAlarm(); } catch { /* none */ }
      return;
    }
    const closeAt = nextCloseAtMs(this.room.state);
    const when = Math.max(Date.now() + 20, closeAt);
    await this.ctx.storage.setAlarm(when);
  }

  send(ws, payload) {
    try { ws.send(JSON.stringify(payload)); } catch { /* closed */ }
  }

  broadcast(payload, except) {
    const body = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      if (except && socket === except) continue;
      try { socket.send(body); } catch { /* closed */ }
    }
  }

  broadcastTally(now) {
    this.tallyBroadcaster.request(now);
  }
}

function checkAdmin(request, env) {
  const secret = String(env.ADMIN_RESET || '');
  if (!secret) return false;
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (request.headers.get('X-Admin-Reset') || '');
  if (!token || token.length !== secret.length) return false;
  const a = new TextEncoder().encode(token);
  const b = new TextEncoder().encode(secret);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function testOptions(env) {
  if (String(env.TEST_SHORT_PHRASE || '') === 'true') return { barsPerPhrase: 1, bpm: 120 };
  return {};
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
