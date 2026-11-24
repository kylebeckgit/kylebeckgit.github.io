// WebSocket client for the jam room. Falls back to a local solo session
// if the backend is down.

import {
  applyVote,
  beatsSinceEpoch,
  cloneState,
  closePhrase,
  createRoom,
  DEFAULT_STATE,
  nextCloseAtMs,
  offsetFromPings,
  parseCommand,
  quantizeNextSixteenth,
  tallyView,
} from '../../../workers/jam-room/src/logic.js';

export const DEFAULT_WS_URL = 'wss://jam-room.kbsound.workers.dev';

export function resolveWsUrl(root, loc = globalThis.location) {
  const query = loc ? new URLSearchParams(loc.search).get('ws') : null;
  if (query) return query;
  const attr = root?.getAttribute?.('data-ws-url');
  if (attr) return attr;
  return DEFAULT_WS_URL;
}

export function createJamClient(options = {}) {
  const url = options.url || DEFAULT_WS_URL;
  const Socket = options.WebSocket || globalThis.WebSocket;
  const schedule = options.setTimeout || setTimeout;
  const cancel = options.clearTimeout || clearTimeout;
  const clockNow = options.now || Date.now;
  const pingMs = options.pingMs || 5000;
  const listeners = new Set();
  const pings = [];
  const client = {
    url,
    mode: 'connecting',
    userId: '',
    state: cloneState({ ...DEFAULT_STATE, epochMs: options.nowMs || clockNow() }),
    tally: null,
    offsetMs: 0,
    socket: null,
    timer: 0,
    pingTimer: 0,
    connectTimer: 0,
    closed: false,
    lastError: '',
    room: null,
  };

  function nowMs() {
    return clockNow() + client.offsetMs;
  }

  function emit(type, detail) {
    for (const fn of listeners) fn(type, detail, client);
  }

  function handleMessage(msg, receivedMs) {
    if (msg.type === 'welcome' || msg.type === 'state') {
      if (msg.userId) client.userId = msg.userId;
      client.state = cloneState(msg.state || msg);
      client.mode = 'room';
      client.lastError = '';
      if (msg.tally) client.tally = msg.tally;
      clearConnectTimeout();
      startPingLoop();
      emit(msg.type === 'welcome' ? 'welcome' : 'state', msg);
      return;
    }
    if (msg.type === 'pong') {
      pings.push({ t: msg.t, serverMs: msg.serverMs, receivedMs });
      if (pings.length > 8) pings.shift();
      client.offsetMs = offsetFromPings(pings);
      emit('pong', msg);
      return;
    }
    if (msg.type === 'tally') {
      client.tally = msg;
      emit('tally', msg);
      return;
    }
    if (msg.type === 'strike') {
      emit('strike', msg);
    }
  }

  function goSolo(reason) {
    if (client.closed) return;
    const socket = client.socket;
    client.socket = null;
    if (socket) {
      try { socket.close(); } catch { /* ignore */ }
    }
    stopPingLoop();
    clearConnectTimeout();
    if (client.mode !== 'solo') {
      client.mode = 'solo';
      client.lastError = reason || 'The room is offline.';
      client.room = createRoom(nowMs(), { state: client.state });
      if (!client.room.state.epochMs) client.room.state.epochMs = nowMs();
      client.state = cloneState(client.room.state);
      client.tally = tallyView(client.room, nowMs());
      scheduleSolo();
      emit('solo', { reason: client.lastError });
    }
  }

  function scheduleSolo() {
    cancel(client.timer);
    const wait = Math.max(20, nextCloseAtMs(client.state) - nowMs());
    client.timer = schedule(() => {
      if (client.mode !== 'solo' || client.closed) return;
      const result = closePhrase(client.room, nowMs(), 1);
      client.state = result.state;
      client.tally = tallyView(client.room, nowMs());
      emit('state', { type: 'state', ...result.state, applied: result.applied });
      emit('tally', client.tally);
      scheduleSolo();
    }, wait);
  }

  function connect() {
    if (client.closed) return;
    cancel(client.timer);
    client.timer = 0;
    client.mode = 'connecting';
    let socket;
    try {
      socket = new Socket(url);
    } catch {
      goSolo('The room is offline.');
      return;
    }
    client.socket = socket;
    stopPingLoop();
    clearConnectTimeout();
    client.connectTimer = schedule(() => {
      client.connectTimer = 0;
      if (client.mode === 'connecting') goSolo('The room is offline.');
    }, options.timeoutMs || 4000);
    socket.addEventListener('open', () => {
      try { socket.send(JSON.stringify({ type: 'hello' })); } catch { /* ignore */ }
    });
    socket.addEventListener('message', (event) => {
      try {
        handleMessage(JSON.parse(event.data), clockNow());
      } catch { /* ignore */ }
    });
    socket.addEventListener('close', () => {
      if (!client.closed) goSolo('The room is offline.');
    });
    socket.addEventListener('error', () => {
      if (client.mode === 'connecting') goSolo('The room is offline.');
    });
  }

  function clearConnectTimeout() {
    cancel(client.connectTimer);
    client.connectTimer = 0;
  }

  function stopPingLoop() {
    cancel(client.pingTimer);
    client.pingTimer = 0;
  }

  function startPingLoop() {
    if (client.closed || client.mode !== 'room') return;
    if (client.pingTimer) return;
    ping();
  }

  function ping() {
    if (client.closed || client.mode !== 'room' || !client.socket || client.socket.readyState !== 1) {
      stopPingLoop();
      return;
    }
    try { client.socket.send(JSON.stringify({ type: 'ping', t: clockNow() })); } catch { /* ignore */ }
    client.pingTimer = schedule(ping, pingMs);
  }

  function send(payload) {
    if (client.mode !== 'room' || !client.socket || client.socket.readyState !== 1) return false;
    try {
      client.socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  client.on = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  client.connect = connect;
  client.disconnect = () => {
    client.closed = true;
    cancel(client.timer);
    clearConnectTimeout();
    stopPingLoop();
    if (client.socket) try { client.socket.close(); } catch { /* ignore */ }
  };
  client.vote = (family, value) => {
    if (client.mode === 'solo' && client.room) {
      const result = applyVote(client.room, 'solo', family, value, nowMs());
      if (result.ok) {
        client.tally = tallyView(client.room, nowMs());
        emit('tally', client.tally);
      }
      return result.ok;
    }
    return send({ type: 'vote', family, value });
  };
  client.command = (text) => {
    const parsed = parseCommand(text);
    if (!parsed) return false;
    return client.vote(parsed.family, parsed.value);
  };
  client.strike = (payload) => send({ type: 'strike', ...payload });
  client.nowMs = nowMs;
  client.beatTime = () => quantizeNextSixteenth(client.state, clockNow(), client.offsetMs);
  client.beats = () => beatsSinceEpoch(client.state, clockNow(), client.offsetMs);
  return client;
}
