// Shared jam-room state, voting, clock, and deterministic phrase planning.
// Numbers follow /workspace/jam-room/musical-design.md and are starting points.

export const MOOD_RING = ['calm', 'bright', 'drift', 'dark', 'tense'];
export const KEY_ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'Bb'];
export const KEY_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, Bb: 10 };
export const KEY_MIDI = { C: 48, D: 50, E: 52, F: 53, G: 55, A: 57, Bb: 58 };

export const MOODS = {
  calm:  { scale: [0, 2, 4, 7, 9],        melodyOctaves: 2,   melodyFrom: 12, pulse: 'quarters-sparse', bed: 'root-fifth' },
  bright:{ scale: [0, 2, 4, 6, 7, 9, 11], melodyOctaves: 2,   melodyFrom: 12, pulse: 'eighths-light',   bed: 'root-fifth-ninth' },
  dark:  { scale: [0, 2, 3, 5, 7, 8, 10], melodyOctaves: 1.5, melodyFrom: 0,  pulse: 'quarters-heavy',  bed: 'root-fifth-sub' },
  tense: { scale: [0, 1, 3, 5, 7, 8, 10], melodyOctaves: 1.5, melodyFrom: 0,  pulse: 'eighths-sync',    bed: 'root-flat2' },
  drift: { scale: [0, 2, 3, 5, 7, 9, 10], melodyOctaves: 2,   melodyFrom: 12, pulse: 'dotted-quarters', bed: 'root-fifth-octave' },
};

export const LAYER_MATERIALS = {
  melody: ['glass', 'metal', 'wood', 'string'],
  crowd: ['glass', 'metal', 'wood', 'skin', 'string'],
  pulse: ['metal', 'wood', 'skin'],
  bed: ['bowed'],
};

export const DEFAULT_STATE = Object.freeze({
  epochMs: 0,
  bpm: 84,
  beatsPerBar: 4,
  barsPerPhrase: 8,
  phraseIndex: 0,
  keyRoot: 'D',
  mood: 'calm',
  density: 2,
  space: 1,
  materials: Object.freeze({ melody: 'glass', crowd: 'wood', pulse: 'metal', bed: 'bowed' }),
  pending: Object.freeze({ drop: false, hold: false }),
  seed: 123456,
});

export const BPM_MIN = 60;
export const BPM_MAX = 120;
export const TEMPO_STEP = 4;
export const DENSITY_MIN = 0;
export const DENSITY_MAX = 4;
export const SPACE_MIN = 0;
export const SPACE_MAX = 2;
export const KEY_COOLDOWN = 4;
export const MATERIAL_COOLDOWN = 1;
export const DROP_COOLDOWN = 6;
export const HOLD_COOLDOWN = 2;
export const COMMAND_RATE = 6;
export const COMMAND_WINDOW_MS = 10_000;
export const STRIKES_PER_BEAT = 4;
export const STRIKE_RATE = 8;
export const STRIKE_BURST = 12;
export const STRIKE_WINDOW_MS = 1000;
export const STRIKE_BEAT_SLACK = 16;
export const PING_SAMPLE = 5;
export const SCHEDULE_AHEAD_MS = 100;

export function cloneState(state = DEFAULT_STATE) {
  const src = state || DEFAULT_STATE;
  return {
    epochMs: src.epochMs || 0,
    bpm: clamp(src.bpm, BPM_MIN, BPM_MAX, DEFAULT_STATE.bpm),
    beatsPerBar: 4,
    barsPerPhrase: Math.max(1, src.barsPerPhrase || 8),
    phraseIndex: Math.max(0, src.phraseIndex | 0),
    keyRoot: KEY_ROOTS.includes(src.keyRoot) ? src.keyRoot : 'D',
    mood: MOOD_RING.includes(src.mood) ? src.mood : 'calm',
    density: clamp(src.density, DENSITY_MIN, DENSITY_MAX, 2),
    space: clamp(src.space, SPACE_MIN, SPACE_MAX, 1),
    materials: {
      melody: pickMaterial('melody', src.materials?.melody, 'glass'),
      crowd: pickMaterial('crowd', src.materials?.crowd, 'wood'),
      pulse: pickMaterial('pulse', src.materials?.pulse, 'metal'),
      bed: 'bowed',
    },
    pending: { drop: Boolean(src.pending?.drop), hold: Boolean(src.pending?.hold) },
    seed: (src.seed >>> 0) || 123456,
  };
}

export function createRoom(nowMs = 0, options = {}) {
  const state = cloneState(options.state || DEFAULT_STATE);
  if (!state.epochMs) state.epochMs = nowMs || 0;
  if (options.barsPerPhrase) state.barsPerPhrase = options.barsPerPhrase;
  if (options.bpm) state.bpm = clamp(options.bpm, BPM_MIN, BPM_MAX, state.bpm);
  return {
    state,
    votes: {},
    cooldowns: { key: 0, material: 0, drop: 0, hold: 0, ...(options.cooldowns || {}) },
    commands: {},
  };
}

export function msPerBeat(bpm) {
  const tempo = clamp(bpm, BPM_MIN, BPM_MAX, 84);
  return 60_000 / tempo;
}

export function beatsPerPhrase(state) {
  const s = state || DEFAULT_STATE;
  return (s.beatsPerBar || 4) * (s.barsPerPhrase || 8);
}

export function phraseDurationMs(state) {
  return msPerBeat(state.bpm) * beatsPerPhrase(state);
}

export function beatsSinceEpoch(state, nowMs, offsetMs = 0) {
  const elapsed = (nowMs + offsetMs) - (state.epochMs || 0);
  return elapsed / msPerBeat(state.bpm);
}

export function nextBoundaryMs(state) {
  return (state.epochMs || 0) + phraseDurationMs(state);
}

export function nextCloseAtMs(state) {
  return nextBoundaryMs(state) - msPerBeat(state.bpm);
}

// How many phrase closes should already have happened by nowMs.
// 0 if the current phrase is still open for votes.
export function phrasesDue(state, nowMs) {
  const epoch = state.epochMs || 0;
  const now = Number(nowMs);
  if (!Number.isFinite(now)) return 0;
  const beatMs = msPerBeat(state.bpm);
  const phraseMs = beatMs * beatsPerPhrase(state);
  if (!(phraseMs > 0) || !(beatMs > 0)) return 0;
  const closeAt = epoch + phraseMs - beatMs;
  if (now < closeAt) return 0;
  return Math.floor((now - closeAt) / phraseMs) + 1;
}

function jumpPhrases(room, skipped, nowMs) {
  const duration = phraseDurationMs(room.state);
  const next = cloneState(room.state);
  next.phraseIndex = room.state.phraseIndex + skipped;
  next.epochMs = room.state.epochMs + skipped * duration;
  next.pending = { drop: false, hold: false };
  room.state = next;
  room.votes = {};
  return { state: cloneState(next), applied: [], skipped, boundaryMs: next.epochMs, nowMs };
}

// Advance a room to the phrase that should be current at nowMs.
// When only one close is due, votes are applied as usual. When the
// room has been idle across two or more phrase closes, jump in one
// step, drop stale votes, and leave cooldowns as absolute phrase
// indexes so they expire naturally. Callers should broadcast at most
// once and then schedule the next close in the future.
export function wakeRoom(room, nowMs, roomSize = 1) {
  const due = phrasesDue(room.state, nowMs);
  if (due === 0) {
    return {
      advanced: false,
      skipped: 0,
      broadcasts: 0,
      state: cloneState(room.state),
      applied: [],
      nextCloseAtMs: nextCloseAtMs(room.state),
    };
  }
  const result = closePhrase(room, nowMs, roomSize);
  return {
    advanced: true,
    skipped: result.skipped,
    broadcasts: 1,
    state: result.state,
    applied: result.applied,
    nextCloseAtMs: nextCloseAtMs(room.state),
  };
}

export function barBeatLabel(state, nowMs, offsetMs = 0) {
  const beats = Math.max(0, beatsSinceEpoch(state, nowMs, offsetMs));
  const barLen = state.beatsPerBar || 4;
  const phrase = beatsPerPhrase(state);
  const pos = beats % phrase;
  const bar = Math.floor(pos / barLen) + 1;
  const beat = Math.floor(pos % barLen) + 1;
  return { bar, beat, bars: state.barsPerPhrase || 8, leftoverBeats: pos };
}

export function quantizeNextSixteenth(state, nowMs, offsetMs = 0) {
  const beats = beatsSinceEpoch(state, nowMs, offsetMs);
  const step = 0.25;
  const next = Math.ceil((beats + 1e-9) / step) * step;
  return next;
}

export function median(values) {
  const list = (values || []).filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!list.length) return 0;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

// Round-trip samples are { t, serverMs, receivedMs }. Offset so that now + offset ~= server time.
export function offsetFromPings(samples) {
  const recent = (samples || []).slice(-PING_SAMPLE);
  const offsets = recent.map((s) => {
    const rtt = s.receivedMs - s.t;
    return s.serverMs - (s.t + rtt / 2);
  });
  return median(offsets);
}

// Token bucket: burst of STRIKE_BURST, refill at STRIKE_RATE per second.
export function takeStrikeToken(bucket, nowMs, options = {}) {
  const rate = options.rate ?? STRIKE_RATE;
  const burst = options.burst ?? STRIKE_BURST;
  const now = Number(nowMs);
  if (!Number.isFinite(now)) return { ok: false, tokens: 0, updatedAt: 0 };
  const last = Number(bucket?.updatedAt);
  const prev = bucket?.tokens;
  const filled = (prev == null || !Number.isFinite(last))
    ? burst
    : Math.min(burst, prev + Math.max(0, now - last) * rate / 1000);
  if (filled < 1) return { ok: false, tokens: filled, updatedAt: now };
  return { ok: true, tokens: filled - 1, updatedAt: now };
}

export function strikeBeatInRange(state, beatTime, nowMs, slack = STRIKE_BEAT_SLACK) {
  if (!Number.isFinite(Number(beatTime))) return false;
  const current = beatsSinceEpoch(state, nowMs);
  if (!Number.isFinite(current)) return false;
  return Math.abs(Number(beatTime) - current) <= slack;
}

export function clamp(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pickMaterial(layer, value, fallback) {
  if (layer === 'crowd' && value === 'upload') return 'upload';
  const allowed = LAYER_MATERIALS[layer] || [];
  return allowed.includes(value) ? value : fallback;
}

export function stepKey(root, dir) {
  const from = KEY_PC[KEY_ROOTS.includes(root) ? root : 'D'];
  const target = (from + (dir > 0 ? 7 : -7) + 120) % 12;
  let best = KEY_ROOTS[0];
  let bestDist = 99;
  for (const key of KEY_ROOTS) {
    const pc = KEY_PC[key];
    const dist = Math.min((pc - target + 12) % 12, (target - pc + 12) % 12);
    if (dist < bestDist) {
      best = key;
      bestDist = dist;
      continue;
    }
    if (dist !== bestDist) continue;
    const cand = (pc - target + 12) % 12;
    const cur = (KEY_PC[best] - target + 12) % 12;
    if (dir > 0) {
      if (cand !== 0 && cand < 6 && (cur === 0 || cur > 6 || cand < cur)) best = key;
    } else if (cand > 6 && (cur <= 6 || cand > cur)) {
      best = key;
    }
  }
  return best;
}

export function stepMoodToward(current, target) {
  const a = MOOD_RING.indexOf(current);
  const b = MOOD_RING.indexOf(target);
  if (a < 0) return MOOD_RING.includes(target) ? target : 'calm';
  if (b < 0 || a === b) return MOOD_RING[a];
  const fwd = (b - a + MOOD_RING.length) % MOOD_RING.length;
  const back = (a - b + MOOD_RING.length) % MOOD_RING.length;
  if (fwd <= back) return MOOD_RING[(a + 1) % MOOD_RING.length];
  return MOOD_RING[(a - 1 + MOOD_RING.length) % MOOD_RING.length];
}

export function scaleForMood(mood) {
  return (MOODS[mood] || MOODS.calm).scale.slice();
}

export function crowdScale(mood) {
  const scale = scaleForMood(mood);
  if (mood === 'tense' || mood === 'dark') return scale.filter((semi) => semi !== 1 && semi !== 8);
  return scale;
}

export function parseCommand(text) {
  const raw = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!raw.startsWith('!')) return null;
  const parts = raw.slice(1).split(' ');
  const cmd = parts[0];
  const a = parts[1] || '';
  const b = parts[2] || '';
  if (cmd === 'tempo' && (a === 'up' || a === 'down')) return { family: 'tempo', value: a };
  if (cmd === 'mood' && MOOD_RING.includes(a)) return { family: 'mood', value: a };
  if (cmd === 'key' && (a === 'up' || a === 'down')) return { family: 'key', value: a };
  if (cmd === 'density' && (a === 'more' || a === 'less')) return { family: 'density', value: a };
  if (cmd === 'space' && (a === 'dry' || a === 'wet')) return { family: 'space', value: a };
  if (cmd === 'drop') return { family: 'drop', value: true };
  if (cmd === 'hold') return { family: 'hold', value: true };
  if (cmd === 'material') {
    if (a === 'upload') return { family: 'material', value: 'crowd:upload' };
    if (a === 'crowd' && b === 'upload') return { family: 'material', value: 'crowd:upload' };
    if (a === 'crowd' && LAYER_MATERIALS.crowd.includes(b)) return { family: 'material', value: `crowd:${b}` };
    if (LAYER_MATERIALS.crowd.includes(a) || LAYER_MATERIALS.melody.includes(a)) {
      return { family: 'material', value: a };
    }
  }
  return null;
}

export function allowCommand(room, userId, nowMs) {
  const id = String(userId || '');
  const now = nowMs || 0;
  const times = (room.commands[id] || []).filter((t) => now - t < COMMAND_WINDOW_MS);
  if (times.length >= COMMAND_RATE) {
    room.commands[id] = times;
    return false;
  }
  times.push(now);
  room.commands[id] = times;
  return true;
}

export function applyVote(room, userId, family, value, nowMs) {
  if (!allowCommand(room, userId, nowMs)) return { ok: false, reason: 'rate' };
  const parsed = normalizeVote(family, value);
  if (!parsed) return { ok: false, reason: 'invalid' };
  const id = String(userId || '');
  if (!room.votes[id]) room.votes[id] = {};
  room.votes[id][parsed.family] = parsed.value;
  return { ok: true, family: parsed.family, value: parsed.value };
}

function normalizeVote(family, value) {
  if (family === 'tempo' && (value === 'up' || value === 'down')) return { family, value };
  if (family === 'mood' && MOOD_RING.includes(value)) return { family, value };
  if (family === 'key' && (value === 'up' || value === 'down')) return { family, value };
  if (family === 'density' && (value === 'more' || value === 'less')) return { family, value };
  if (family === 'space' && (value === 'dry' || value === 'wet')) return { family, value };
  if (family === 'drop') return { family, value: true };
  if (family === 'hold') return { family, value: true };
  if (family === 'material') {
    if (value === 'upload' || value === 'crowd:upload') return { family, value: 'crowd:upload' };
    if (typeof value === 'string' && value.startsWith('crowd:')) {
      const mat = value.slice(6);
      if (mat === 'upload' || LAYER_MATERIALS.crowd.includes(mat)) return { family, value: `crowd:${mat}` };
    }
    if (LAYER_MATERIALS.crowd.includes(value) || LAYER_MATERIALS.melody.includes(value)) {
      return { family, value };
    }
  }
  return null;
}

export function tallyVotes(room) {
  const families = {};
  for (const perUser of Object.values(room.votes || {})) {
    for (const [family, value] of Object.entries(perUser)) {
      const key = value === true ? 'yes' : String(value);
      if (!families[family]) families[family] = {};
      families[family][key] = (families[family][key] || 0) + 1;
    }
  }
  return families;
}

export function tallyView(room, nowMs) {
  return {
    phraseIndex: room.state.phraseIndex,
    closeAtMs: nextCloseAtMs(room.state),
    boundaryMs: nextBoundaryMs(room.state),
    families: tallyVotes(room),
    nowMs: nowMs || 0,
  };
}

function votesFor(room, family) {
  const counts = {};
  let total = 0;
  for (const perUser of Object.values(room.votes || {})) {
    if (perUser[family] === undefined) continue;
    const key = perUser[family] === true ? 'yes' : String(perUser[family]);
    counts[key] = (counts[key] || 0) + 1;
    total += 1;
  }
  return { counts, total };
}

function plurality(counts) {
  let best = null;
  let bestN = 0;
  let tie = false;
  for (const [key, n] of Object.entries(counts)) {
    if (n > bestN) {
      best = key;
      bestN = n;
      tie = false;
    } else if (n === bestN) {
      tie = true;
    }
  }
  if (!best || tie) return null;
  return { value: best, n: bestN };
}

function majority(counts, total) {
  const win = plurality(counts);
  if (!win) return null;
  if (win.n > total / 2) return win;
  return null;
}

function cooldownReady(room, name) {
  return room.state.phraseIndex >= (room.cooldowns[name] || 0);
}

function applyMaterialValue(state, value) {
  if (value === 'upload' || value === 'crowd:upload') {
    state.materials.crowd = 'upload';
    return;
  }
  if (value.startsWith('crowd:')) {
    const mat = value.slice(6);
    if (mat === 'upload' || LAYER_MATERIALS.crowd.includes(mat)) state.materials.crowd = mat;
    return;
  }
  if (LAYER_MATERIALS.melody.includes(value)) {
    state.materials.melody = value;
    return;
  }
  if (LAYER_MATERIALS.crowd.includes(value)) state.materials.crowd = value;
}

export function closePhrase(room, nowMs, roomSize = 1) {
  const due = phrasesDue(room.state, nowMs);
  if (due > 1) return jumpPhrases(room, due, nowMs);

  const size = Math.max(1, roomSize | 0);
  const applied = [];
  const next = cloneState(room.state);
  const boundaryMs = nextBoundaryMs(room.state);

  const tempoVote = votesFor(room, 'tempo');
  const tempoWin = majority(tempoVote.counts, tempoVote.total);
  if (tempoWin) {
    const dir = tempoWin.value === 'up' ? 1 : -1;
    const bpm = clamp(next.bpm + dir * TEMPO_STEP, BPM_MIN, BPM_MAX, next.bpm);
    if (bpm !== next.bpm) {
      next.bpm = bpm;
      applied.push({ family: 'tempo', value: tempoWin.value, bpm });
    }
  }

  const moodVote = votesFor(room, 'mood');
  const moodWin = plurality(moodVote.counts);
  if (moodWin) {
    const mood = stepMoodToward(next.mood, moodWin.value);
    if (mood !== next.mood) {
      next.mood = mood;
      applied.push({ family: 'mood', value: moodWin.value, mood });
    }
  }

  const keyVote = votesFor(room, 'key');
  const keyWin = plurality(keyVote.counts);
  if (keyWin && (keyVote.total >= 2 || keyVote.total >= 0.2 * size) && cooldownReady(room, 'key')) {
    const keyRoot = stepKey(next.keyRoot, keyWin.value === 'up' ? 1 : -1);
    if (keyRoot !== next.keyRoot) {
      next.keyRoot = keyRoot;
      room.cooldowns.key = next.phraseIndex + 1 + KEY_COOLDOWN;
      applied.push({ family: 'key', value: keyWin.value, keyRoot });
    }
  }

  const matVote = votesFor(room, 'material');
  const matWin = plurality(matVote.counts);
  if (matWin && cooldownReady(room, 'material')) {
    applyMaterialValue(next, matWin.value);
    room.cooldowns.material = next.phraseIndex + 1 + MATERIAL_COOLDOWN;
    applied.push({ family: 'material', value: matWin.value });
  }

  const densVote = votesFor(room, 'density');
  const densWin = majority(densVote.counts, densVote.total);
  if (densWin) {
    const density = clamp(next.density + (densWin.value === 'more' ? 1 : -1), DENSITY_MIN, DENSITY_MAX, next.density);
    if (density !== next.density) {
      next.density = density;
      applied.push({ family: 'density', value: densWin.value, density });
    }
  }

  const spaceVote = votesFor(room, 'space');
  const spaceWin = majority(spaceVote.counts, spaceVote.total);
  if (spaceWin) {
    const space = clamp(next.space + (spaceWin.value === 'wet' ? 1 : -1), SPACE_MIN, SPACE_MAX, next.space);
    if (space !== next.space) {
      next.space = space;
      applied.push({ family: 'space', value: spaceWin.value, space });
    }
  }

  const dropVote = votesFor(room, 'drop');
  next.pending.drop = Boolean(dropVote.total >= 0.3 * size && cooldownReady(room, 'drop'));
  if (next.pending.drop) {
    room.cooldowns.drop = next.phraseIndex + 1 + DROP_COOLDOWN;
    applied.push({ family: 'drop', value: true });
  }

  const holdVote = votesFor(room, 'hold');
  next.pending.hold = Boolean(holdVote.total >= 1 && cooldownReady(room, 'hold'));
  if (next.pending.hold) {
    room.cooldowns.hold = next.phraseIndex + 1 + HOLD_COOLDOWN;
    applied.push({ family: 'hold', value: true });
  }

  next.phraseIndex = room.state.phraseIndex + 1;
  next.epochMs = boundaryMs;
  room.state = next;
  room.votes = {};
  return { state: cloneState(next), applied, skipped: 1, boundaryMs, nowMs };
}

export function hash32(text) {
  let h = 2166136261;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function phraseRng(seed, phraseIndex, label) {
  return mulberry32(hash32(`${seed >>> 0}|${phraseIndex | 0}|${label}`));
}

export function midiForDegree(keyRoot, degreeIndex, scale, octaveOffset = 0) {
  const scaleNotes = scale && scale.length ? scale : MOODS.calm.scale;
  const i = ((degreeIndex % scaleNotes.length) + scaleNotes.length) % scaleNotes.length;
  const oct = Math.floor(degreeIndex / scaleNotes.length) + octaveOffset;
  const root = KEY_MIDI[keyRoot] ?? 50;
  return root + scaleNotes[i] + oct * 12;
}

export function noteName(midi) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
  const m = Math.round(midi);
  const pc = ((m % 12) + 12) % 12;
  const name = names[pc];
  // Display Bb for pitch class 10 to match allowed roots; C# etc. stay sharps.
  const shown = pc === 10 ? 'Bb' : name;
  const octave = Math.floor(m / 12) - 1;
  return `${shown}${octave}`;
}

export function hzFromMidi(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function pulseBeats(mood, bars, beatsPerBar, rng) {
  const total = bars * beatsPerBar;
  const beats = [];
  const pattern = (MOODS[mood] || MOODS.calm).pulse;
  if (pattern === 'eighths-light' || pattern === 'eighths-sync') {
    for (let b = 0; b < total; b += 0.5) {
      if (pattern === 'eighths-sync' && Math.floor(b * 2) % 3 === 1) {
        if (rng() < 0.7) beats.push(b);
        continue;
      }
      if (pattern === 'eighths-light' && rng() < 0.35) continue;
      beats.push(b);
    }
    return beats;
  }
  if (pattern === 'dotted-quarters') {
    for (let b = 0; b < total; b += 1.5) beats.push(b);
    return beats;
  }
  for (let b = 0; b < total; b += 1) {
    if (pattern === 'quarters-sparse' && b % 2 === 1 && rng() < 0.65) continue;
    if (pattern === 'quarters-heavy' && b % 4 === 2 && rng() < 0.3) beats.push(b + 0.5);
    beats.push(b);
  }
  return beats;
}

export function planPhraseEvents(state) {
  const s = cloneState(state);
  const mood = MOODS[s.mood] || MOODS.calm;
  const scale = scaleForMood(s.mood);
  const bars = s.barsPerPhrase;
  const barLen = s.beatsPerBar;
  const total = bars * barLen;
  const dropBars = s.pending.drop ? 2 : 0;
  const melody = [];
  const pulse = [];
  const pulseRng = phraseRng(s.seed, s.phraseIndex, 'pulse');
  const melodyRng = phraseRng(s.seed, s.phraseIndex, 'melody');

  if (s.density >= 1) {
    const beats = pulseBeats(s.mood, bars, barLen, pulseRng);
    for (const beat of beats) {
      if (beat < dropBars * barLen) continue;
      const fifth = pulseRng() < 0.35;
      const midi = (KEY_MIDI[s.keyRoot] ?? 50) + (fifth ? 7 : 0);
      pulse.push({
        beat,
        midi,
        hz: hzFromMidi(midi),
        note: noteName(midi),
        degree: fifth ? 1 : 0,
        velocity: 0.4 + pulseRng() * 0.25,
        position: 0.35 + pulseRng() * 0.3,
        layer: 'pulse',
        ghost: false,
        material: s.materials.pulse,
      });
    }
    if (s.density >= 4) {
      for (let beat = 0.5; beat < total; beat += 2) {
        if (beat < dropBars * barLen) continue;
        if (pulseRng() < 0.45) continue;
        const midi = (KEY_MIDI[s.keyRoot] ?? 50);
        pulse.push({
          beat,
          midi,
          hz: hzFromMidi(midi),
          note: noteName(midi),
          degree: 0,
          velocity: 0.22 + pulseRng() * 0.12,
          position: 0.5,
          layer: 'pulse',
          ghost: true,
          material: s.materials.pulse,
        });
      }
    }
  }

  if (s.density >= 2) {
    const useEighths = s.bpm <= 100;
    const step = useEighths ? 0.5 : 1;
    const sparse = s.density === 2;
    const cells = Math.floor(bars / 2);
    for (let cell = 0; cell < cells; cell++) {
      const start = cell * 2 * barLen;
      const isCall = cell % 2 === 0;
      const notes = sparse ? (isCall ? 3 : 2) : (isCall ? 5 : 4);
      let beat = start;
      for (let n = 0; n < notes; n++) {
        beat += step * (sparse && melodyRng() < 0.25 ? 2 : 1);
        if (beat >= start + 2 * barLen) break;
        if (beat < dropBars * barLen) continue;
        const span = Math.max(1, Math.round(mood.melodyOctaves * scale.length));
        const degree = Math.floor(melodyRng() * span);
        const midi = midiForDegree(s.keyRoot, degree, scale, Math.round(mood.melodyFrom / 12));
        melody.push({
          beat,
          midi,
          hz: hzFromMidi(midi),
          note: noteName(midi),
          degree,
          velocity: 0.46 + melodyRng() * 0.28,
          position: 0.25 + melodyRng() * 0.45,
          layer: 'melody',
          material: s.materials.melody,
        });
      }
    }
  }

  return { melody, pulse, totalBeats: total, dropBars };
}

export function bedPartials(mood) {
  const voicing = (MOODS[mood] || MOODS.calm).bed;
  if (voicing === 'root-fifth-ninth') return [0, 7, 14];
  if (voicing === 'root-fifth-sub') return [0, 7, -12];
  if (voicing === 'root-flat2') return [0, 1];
  if (voicing === 'root-fifth-octave') return [0, 7, 12];
  return [0, 7];
}

export function thinningProbability(activeStrikers) {
  if (!(activeStrikers > 12)) return 1;
  return 12 / activeStrikers;
}

export function shouldPlayRemoteStrike(activeStrikers, rng = Math.random) {
  const p = thinningProbability(activeStrikers);
  if (p >= 1) return true;
  return rng() < p;
}

export function mergeRemoteStrikes(strikes, activeUsers) {
  if (!(activeUsers > 30)) return strikes || [];
  const groups = new Map();
  for (const strike of strikes || []) {
    const sixteenth = Math.round(strike.beatTime * 4) / 4;
    const key = `${sixteenth}|${strike.degree}`;
    const prev = groups.get(key);
    if (!prev) {
      groups.set(key, { ...strike, beatTime: sixteenth });
    } else if ((strike.velocity || 0) > (prev.velocity || 0)) {
      groups.set(key, { ...prev, ...strike, beatTime: sixteenth, velocity: strike.velocity });
    }
  }
  return [...groups.values()];
}

export function panForUser(userId) {
  const h = hash32(String(userId || 'anon'));
  return ((h % 2000) / 1000) - 1;
}

export function snapHeldDegree(degree, fromScale, toScale) {
  const from = fromScale && fromScale.length ? fromScale : MOODS.calm.scale;
  const to = toScale && toScale.length ? toScale : from;
  const oct = Math.floor(degree / from.length);
  const semi = from[((degree % from.length) + from.length) % from.length];
  let best = 0;
  let bestDist = 99;
  for (let i = 0; i < to.length; i++) {
    const dist = Math.min(Math.abs(to[i] - semi), 12 - Math.abs(to[i] - semi));
    if (dist < bestDist) {
      best = i + oct * to.length;
      bestDist = dist;
    }
  }
  return best;
}
