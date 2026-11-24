// Jam room Worker. One SQLite Durable Object holds the shared clock,
// state, and approved upload clips. Clients render audio locally.
// Hibernation WebSockets only. Uploads are moderated automatically.

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
import { publicClip } from './clip-view.js';
import { allowedOrigin, corsHeaders, notFound } from './origins.js';
import { createTallyBroadcaster, TALLY_MIN_MS } from './tally.js';
import { moderateClip } from './moderation.js';
import { hashReporterId, roomSizeFromHashes } from './reporters.js';
import {
  decideUploadAdmission,
  MAX_JSON_BODY_BYTES,
  MAX_UPLOAD_BODY_BYTES,
  MAX_UPLOAD_ID_LENGTH,
  MAX_WS_MESSAGE_BYTES,
  PENDING_CAP,
  PENDING_MAX_AGE_MS,
  pruneUploadRates,
  readBodyCapped,
  refundUploadKeys,
  shouldAutoRemove,
  validateUpload,
} from './validate.js';
import {
  addReport,
  approvedPool,
  clearPool,
  countUploads,
  deleteRejectedAndExpired,
  deleteUpload,
  evictOldestIfNeeded,
  getUpload,
  initUploadSchema,
  insertUpload,
  listUploads,
  updateUpload,
} from './store.js';

const ROOM_NAME = 'main';
const MAX_SOCKETS = 80;
const RETENTION_ALARM_MS = 60 * 60 * 1000;
const PENDING_RETRY_MS = 10 * 60 * 1000;

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
      const tooLarge = await rejectOversizeJson(request, corsHeaders(origin));
      if (tooLarge) return tooLarge;
      if (!checkSecret(request, env, 'ADMIN_RESET')) {
        await settleRequestBody(request, MAX_JSON_BODY_BYTES);
        return new Response('Not found', { status: 404 });
      }
      const stub = env.JAM_ROOM.getByName(ROOM_NAME);
      const result = await stub.reset();
      return json(result, 200, corsHeaders(origin));
    }

    if (isUploadPath(url.pathname) || isAdminPath(url.pathname)) {
      if (isAdminPath(url.pathname)) {
        if (!checkSecret(request, env, 'ADMIN_TOKEN')) {
          await settleRequestBody(request, MAX_JSON_BODY_BYTES);
          return notFound(origin);
        }
        const tooLarge = await rejectOversizeJson(request, corsHeaders(origin));
        if (tooLarge) return tooLarge;
      } else if (!allowedOrigin(origin)) {
        await settleRequestBody(request);
        return new Response('Forbidden', { status: 403 });
      }
      const stub = env.JAM_ROOM.getByName(ROOM_NAME);
      return stub.fetch(request);
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
    initUploadSchema(this.ctx.storage.sql);
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
    await this.ctx.storage.delete('room');
    await this.save();
    this.tallyBroadcaster.clear();
    await this.scheduleClose();
    this.broadcast({ type: 'state', ...cloneState(this.room.state), serverMs: now });
    this.broadcast({ type: 'tally', ...tallyView(this.room, now) });
    return { ok: true, state: cloneState(this.room.state) };
  }

  async fetch(request) {
    try {
      return await this.dispatch(request);
    } catch {
      return new Response('Internal error', { status: 500 });
    }
  }

  async dispatch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/reset') {
      const body = await this.reset();
      return Response.json(body);
    }

    if (isAdminPath(url.pathname) || isUploadPath(url.pathname)) {
      return this.handleHttp(request, url);
    }

    const upgrade = request.headers.get('Upgrade') || '';
    if (upgrade.toLowerCase() !== 'websocket') {
      return new Response('Not found', { status: 404 });
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
    const uploadToken = crypto.randomUUID();
    const reporterHash = await this.hashRequestIp(request);
    server.serializeAttachment({ userId, uploadToken, strikeBeats: [], reporterHash });
    this.send(server, this.welcomePayload(userId, uploadToken, now));
    await this.scheduleClose();
    return new Response(null, { status: 101, webSocket: client });
  }

  async handleHttp(request, url) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);
    const now = Date.now();

    if (request.method === 'POST' && url.pathname === '/uploads') {
      return this.handleUpload(request, headers, now);
    }

    if (request.method === 'GET' && url.pathname === '/uploads') {
      return json({ ok: true, uploads: publicUploads(this.ctx.storage.sql) }, 200, headers);
    }

    const audio = url.pathname.match(/^\/uploads\/([^/]+)\/audio$/);
    if (request.method === 'GET' && audio) {
      const audioHeaders = { ...headers, 'Cache-Control': 'no-store' };
      if (audio[1].length > MAX_UPLOAD_ID_LENGTH) return new Response('Not found', { status: 404, headers: audioHeaders });
      const row = getUpload(this.ctx.storage.sql, audio[1]);
      if (!row || row.status !== 'approved' || !row.audio) return new Response('Not found', { status: 404, headers: audioHeaders });
      return new Response(row.audio, {
        status: 200,
        headers: {
          ...audioHeaders,
          'Content-Type': 'audio/wav',
        },
      });
    }

    const oversizeAdmin = isAdminPath(url.pathname) ? await rejectOversizeJson(request, headers) : null;
    if (oversizeAdmin) return oversizeAdmin;

    if (request.method === 'POST' && url.pathname === '/admin/kill') {
      clearPool(this.ctx.storage.sql);
      this.broadcast({ type: 'uploads-cleared', serverMs: now });
      return json({ ok: true, cleared: true }, 200, headers);
    }

    const remove = url.pathname.match(/^\/admin\/remove\/([^/]+)$/);
    if (request.method === 'POST' && remove) {
      if (remove[1].length > MAX_UPLOAD_ID_LENGTH) return new Response('Not found', { status: 404, headers });
      const row = getUpload(this.ctx.storage.sql, remove[1]);
      if (row) deleteUpload(this.ctx.storage.sql, remove[1]);
      this.broadcast({ type: 'upload-removed', uploadId: remove[1], serverMs: now });
      return json({ ok: true, removed: remove[1] }, 200, headers);
    }

    if (request.method === 'GET' && url.pathname === '/admin/uploads') {
      return json({ ok: true, uploads: listUploads(this.ctx.storage.sql) }, 200, headers);
    }

    return new Response('Not found', { status: 404, headers });
  }

  welcomePayload(userId, uploadToken, now) {
    return {
      type: 'welcome',
      userId,
      uploadToken,
      state: cloneState(this.room.state),
      tally: tallyView(this.room, now),
      uploads: publicUploads(this.ctx.storage.sql),
      serverMs: now,
    };
  }

  findUploadSession(token) {
    const want = String(token || '');
    if (!want) return null;
    for (const socket of this.ctx.getWebSockets()) {
      const att = socket.deserializeAttachment() || {};
      if (att.uploadToken && att.uploadToken === want) {
        return { userId: att.userId, uploadToken: att.uploadToken };
      }
    }
    return null;
  }

  async withUploadRates(now, fn) {
    const run = async () => {
      const rates = pruneUploadRates(await this.ctx.storage.get('uploadRates') || {}, now);
      return fn(rates);
    };
    if (typeof this.ctx.blockConcurrencyWhile === 'function') {
      return this.ctx.blockConcurrencyWhile(run);
    }
    return run();
  }

  async pruneStoredRates(now) {
    return this.withUploadRates(now, async (rates) => {
      await this.ctx.storage.put('uploadRates', rates);
      return rates;
    });
  }

  async reserveUploadRate(now, keys) {
    return this.withUploadRates(now, async (rates) => {
      const pendingCount = countUploads(this.ctx.storage.sql, 'pending');
      const allowed = decideUploadAdmission({ pendingCount, pendingCap: pendingCap(this.env), rates, now, keys });
      if (allowed.reserved) await this.ctx.storage.put('uploadRates', allowed.rates);
      return allowed;
    });
  }

  async refundUploadRate(now, keys) {
    return this.withUploadRates(now, async (rates) => {
      const next = refundUploadKeys(rates, now, keys);
      await this.ctx.storage.put('uploadRates', next);
      return next;
    });
  }

  async handleUpload(request, headers, now) {
    const declared = Number(request.headers.get('Content-Length') || 0);
    if (Number.isFinite(declared) && declared > MAX_UPLOAD_BODY_BYTES) {
      return json({ ok: false, reason: 'That file is too large.' }, 413, headers);
    }
    const session = this.findUploadSession(request.headers.get('X-Jam-Upload') || '');
    if (!session?.userId) {
      await settleRequestBody(request);
      return json({ ok: false, reason: 'Join the room before uploading.' }, 401, headers);
    }
    const userId = session.userId;

    const keys = [`token:${session.uploadToken}`];
    const uploaderHash = await this.hashRequestIp(request);
    if (uploaderHash) keys.push(`ip:${uploaderHash}`);
    const allowed = await this.reserveUploadRate(now, keys);
    if (!allowed.ok) {
      await settleRequestBody(request);
      return json({ ok: false, reason: allowed.reason }, allowed.status || 429, headers);
    }

    let stored = false;
    try {
    const body = await readBodyCapped(request, MAX_UPLOAD_BODY_BYTES);
    if (body.tooLarge) {
      return json({ ok: false, reason: 'That file is too large.' }, 413, headers);
    }

    let bytes;
    let rawMeta = {};
    const contentType = request.headers.get('Content-Type') || '';
    try {
      const parsed = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: body.bytes,
      });
      if (contentType.includes('multipart/form-data')) {
        const form = await parsed.formData();
        const file = form.get('audio');
        rawMeta = parseMeta(form.get('meta'));
        bytes = file ? new Uint8Array(await file.arrayBuffer()) : null;
      } else {
        const payload = body.bytes.byteLength ? JSON.parse(new TextDecoder().decode(body.bytes)) : {};
        rawMeta = payload.meta || {};
        bytes = payload.audio ? Uint8Array.from(atob(payload.audio), (c) => c.charCodeAt(0)) : null;
      }
    } catch {
      return json({ ok: false, reason: 'That file is not a valid sound.' }, 400, headers);
    }

    const checked = validateUpload(bytes, rawMeta);
    if (!checked.ok) return json({ ok: false, reason: checked.reason }, 400, headers);

    const id = crypto.randomUUID();
    const meta = { ...checked.meta, speech: Boolean(checked.meta.speech) };
    stored = true;
    insertUpload(this.ctx.storage.sql, {
      id,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      userId,
      meta,
      audio: bytes,
      reports: [],
      speech: meta.speech,
      keepOptIn: meta.keepOptIn,
      uploaderHash,
    });

    let review;
    try {
      review = await this.reviewUpload(id, bytes, request, rawMeta);
    } catch {
      review = { ok: false, status: 'pending', reason: 'Review is temporarily unavailable.', failClosed: true };
    }
    if (review.status === 'rejected') {
      deleteUpload(this.ctx.storage.sql, id);
      return json({ ok: false, status: 'rejected', reason: review.reason }, 400, headers);
    }
    if (review.status === 'pending') {
      updateUpload(this.ctx.storage.sql, id, { status: 'pending', updatedAt: now });
      await this.scheduleClose();
      return json({ ok: true, status: 'pending', id, reason: review.reason }, 202, headers);
    }

    meta.speech = Boolean(review.speech || meta.speech);
    if (meta.speech) meta.resonanceMix = 1;
    meta.approvedAt = now;
    evictOldestIfNeeded(this.ctx.storage.sql);
    updateUpload(this.ctx.storage.sql, id, {
      status: 'approved',
      updatedAt: now,
      speech: meta.speech ? 1 : 0,
      meta: JSON.stringify(meta),
    });
    evictOldestIfNeeded(this.ctx.storage.sql);
    const approved = publicUploads(this.ctx.storage.sql);
    this.broadcast({ type: 'uploads', uploads: approved, added: id, serverMs: now });
    return json({ ok: true, status: 'approved', id, upload: approved.find((u) => u.id === id) }, 200, headers);
    } catch {
      if (!stored) {
        try { await this.refundUploadRate(now, keys); } catch { /* keep fail-closed */ }
      }
      return json({ ok: false, reason: 'Review is temporarily unavailable.' }, 500, headers);
    }
  }

  async reviewUpload(id, bytes, request, rawMeta) {
    const mock = mockAi(this.env, request, rawMeta);
    return moderateClip(bytes, { ai: this.env.AI, mock });
  }

  async retryPending(now) {
    const pending = listUploads(this.ctx.storage.sql, 'pending');
    let changed = false;
    for (const row of pending) {
      if (now - row.createdAt > PENDING_MAX_AGE_MS) {
        deleteUpload(this.ctx.storage.sql, row.id);
        changed = true;
        continue;
      }
      if (now - (row.updatedAt || row.createdAt) < PENDING_RETRY_MS) continue;
      const full = getUpload(this.ctx.storage.sql, row.id);
      if (!full?.audio) {
        deleteUpload(this.ctx.storage.sql, row.id);
        changed = true;
        continue;
      }
      let review;
      try {
        review = await moderateClip(full.audio, { ai: this.env.AI, mock: mockAi(this.env) });
      } catch {
        review = { ok: false, status: 'pending', reason: 'Review is temporarily unavailable.', failClosed: true };
      }
      if (review.status === 'rejected') {
        deleteUpload(this.ctx.storage.sql, row.id);
        changed = true;
        continue;
      }
      if (review.status === 'pending') {
        updateUpload(this.ctx.storage.sql, row.id, { updatedAt: now });
        continue;
      }
      const meta = { ...(full.meta || {}) };
      meta.speech = Boolean(review.speech || meta.speech);
      if (meta.speech) meta.resonanceMix = 1;
      meta.approvedAt = now;
      updateUpload(this.ctx.storage.sql, row.id, {
        status: 'approved',
        updatedAt: now,
        speech: meta.speech ? 1 : 0,
        meta: JSON.stringify(meta),
      });
      evictOldestIfNeeded(this.ctx.storage.sql);
      changed = true;
    }
    if (changed) {
      this.broadcast({ type: 'uploads', uploads: publicUploads(this.ctx.storage.sql), serverMs: now });
    }
  }

  reportClip(uploadId, reporterHash, now) {
    const updated = addReport(this.ctx.storage.sql, uploadId, reporterHash, now);
    if (!updated) return { ok: false };
    const roomSize = this.roomSizeFromSockets();
    if (shouldAutoRemove(updated.reports.length, roomSize)) {
      deleteUpload(this.ctx.storage.sql, uploadId);
      this.broadcast({ type: 'upload-removed', uploadId, serverMs: now });
      return { ok: true, removed: true };
    }
    return { ok: true, reports: updated.reports.length };
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try {
      const size = typeof raw === 'string' ? raw.length : (raw?.byteLength || 0);
      if (size > MAX_WS_MESSAGE_BYTES) return;
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
      const uploadToken = attachment.uploadToken || crypto.randomUUID();
      if (!attachment.uploadToken) {
        attachment.uploadToken = uploadToken;
        ws.serializeAttachment(attachment);
      }
      this.send(ws, this.welcomePayload(userId, uploadToken, now));
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

    if (msg.type === 'report' && typeof msg.uploadId === 'string') {
      this.reportClip(msg.uploadId, attachment.reporterHash, now);
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
      await this.scheduleClose();
    }
  }

  async webSocketError(ws) {
    try { ws.close(); } catch { /* already gone */ }
  }

  async alarm() {
    const now = Date.now();
    await this.syncToNow(now);
    deleteRejectedAndExpired(this.ctx.storage.sql, now);
    await this.pruneStoredRates(now);
    await this.retryPending(now);
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
    const now = Date.now();
    const retentionAt = now + RETENTION_ALARM_MS;
    if (this.ctx.getWebSockets().length === 0) {
      await this.ctx.storage.setAlarm(retentionAt);
      return;
    }
    const closeAt = Math.max(now + 20, nextCloseAtMs(this.room.state));
    await this.ctx.storage.setAlarm(Math.min(closeAt, retentionAt));
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

  async getReporterSalt() {
    if (this.reporterSalt) return this.reporterSalt;
    let salt = await this.ctx.storage.get('reporterSalt');
    if (typeof salt !== 'string' || salt.length < 32) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      salt = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      await this.ctx.storage.put('reporterSalt', salt);
    }
    this.reporterSalt = salt;
    return salt;
  }

  async hashRequestIp(request) {
    const ip = requestIp(request, this.env);
    if (!ip) return '';
    return hashReporterId(await this.getReporterSalt(), ip);
  }

  roomSizeFromSockets() {
    const hashes = [];
    for (const socket of this.ctx.getWebSockets()) {
      const att = socket.deserializeAttachment() || {};
      if (att.reporterHash) hashes.push(att.reporterHash);
    }
    return roomSizeFromHashes(hashes);
  }
}

function publicUploads(sql) {
  return approvedPool(sql).map(publicClip);
}

function parseMeta(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function isUploadPath(pathname) {
  return pathname === '/uploads' || pathname.startsWith('/uploads/');
}

function isAdminPath(pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

function checkSecret(request, env, name) {
  const secret = String(env[name] || '');
  if (!secret) return false;
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : (request.headers.get(name === 'ADMIN_TOKEN' ? 'X-Admin-Token' : 'X-Admin-Reset') || '');
  if (!token || token.length !== secret.length) return false;
  const a = new TextEncoder().encode(token);
  const b = new TextEncoder().encode(secret);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function mockAi(env, request, rawMeta) {
  if (String(env.TEST_MOCK_AI || '') !== 'true') return null;
  const header = request?.headers?.get?.('X-Test-AI');
  const meta = rawMeta?.testAi;
  return header || meta || 'pass';
}

function testOptions(env) {
  if (String(env.TEST_SHORT_PHRASE || '') === 'true') return { barsPerPhrase: 1, bpm: 120 };
  return {};
}

function pendingCap(env) {
  if (String(env?.TEST_MOCK_AI || '') === 'true') {
    const n = Number(env?.TEST_PENDING_CAP);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return PENDING_CAP;
}

function requestIp(request, env) {
  if (String(env?.TEST_MOCK_AI || '') === 'true') {
    const testIp = request.headers.get('X-Test-IP');
    if (testIp) return String(testIp).trim();
  }
  return String(request.headers.get('CF-Connecting-IP') || '').trim();
}

async function settleRequestBody(request, maxBytes = MAX_UPLOAD_BODY_BYTES) {
  // Finish the body with the capped reader so workerd does not later throw
  // "Can't read from request stream after response has been sent."
  try { await readBodyCapped(request, maxBytes); } catch { /* already consumed or closed */ }
}

async function rejectOversizeJson(request, headers = {}) {
  const declared = Number(request?.headers?.get?.('Content-Length') || 0);
  if (Number.isFinite(declared) && declared > MAX_JSON_BODY_BYTES) {
    return json({ ok: false, reason: 'That request is too large.' }, 413, headers);
  }
  return null;
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
