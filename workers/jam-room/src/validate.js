import { decodeWav16 } from '../../../src/tools/jam-room/upload/wav16.js';
import {
  cancelRequestBody,
  MAX_JSON_BODY_BYTES,
  readBodyCapped as readBodyCappedStream,
  readJsonCapped,
  readStreamCapped,
} from './body.js';

import {
  MAX_PROCESSED_SECONDS,
  TARGET_RATE,
  clipCount,
  dbFromAmp,
  isNearSilence,
  isPureNoise,
  peakAbs,
  resample,
  rms,
} from '../../../src/tools/jam-room/upload/dsp.js';

export const MAX_UPLOAD_BYTES = 1024 * 1024;
export const MAX_UPLOAD_BODY_BYTES = MAX_UPLOAD_BYTES * 2 + 8192;
export const UPLOAD_RATE_MS = 5 * 60 * 1000;
export const UPLOAD_DAY_MS = 24 * 60 * 60 * 1000;
export const UPLOADS_PER_DAY = 10;
export const POOL_CAP = 16;
export const PENDING_CAP = 32;
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const PENDING_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const MAX_WS_MESSAGE_BYTES = 8192;
export const MAX_UPLOAD_ID_LENGTH = 80;

export { cancelRequestBody, MAX_JSON_BODY_BYTES, readJsonCapped, readStreamCapped };

export function readBodyCapped(request, maxBytes = MAX_UPLOAD_BODY_BYTES) {
  return readBodyCappedStream(request, maxBytes);
}

export function sanitizeMeta(raw = {}) {
  const kind = raw.kind === 'unpitched' ? 'unpitched' : 'pitched';
  const resonance = raw.speech ? 1 : clamp(Number(raw.resonanceMix), 0, 1, 0.4);
  const slices = Array.isArray(raw.slices)
    ? raw.slices.slice(0, 8).map((s) => ({
      startMs: clamp(Number(s.startMs), 0, 8000, 0),
      endMs: clamp(Number(s.endMs), 0, 8000, 0),
      slot: ['kick', 'snare', 'hat'].includes(s.slot) ? s.slot : 'snare',
    })).filter((s) => s.endMs > s.startMs)
    : [];
  return {
    kind,
    f0Hz: kind === 'pitched' && Number.isFinite(Number(raw.f0Hz)) && Number(raw.f0Hz) > 0 ? Number(raw.f0Hz) : null,
    recordedMidi: Number.isFinite(Number(raw.recordedMidi)) ? Number(raw.recordedMidi) : null,
    centsOffset: Number.isFinite(Number(raw.centsOffset)) ? Number(raw.centsOffset) : 0,
    targetMidi: Number.isFinite(Number(raw.targetMidi)) ? Number(raw.targetMidi) : null,
    slices: kind === 'unpitched' ? slices : [],
    durationMs: clamp(Number(raw.durationMs), 0, MAX_PROCESSED_SECONDS * 1000, 0),
    loudnessLufsApprox: Number(raw.loudnessLufsApprox),
    peakDb: Number(raw.peakDb),
    resonanceMix: resonance,
    speech: Boolean(raw.speech),
    keepOptIn: Boolean(raw.keepOptIn),
    consent: Boolean(raw.consent),
    clientVersion: String(raw.clientVersion || '1').slice(0, 16),
    source: String(raw.source || '').slice(0, 32),
  };
}

export function validateUpload(bytes, rawMeta) {
  if (!rawMeta || rawMeta.consent !== true) {
    return { ok: false, reason: 'Consent is required.' };
  }
  if (!bytes || bytes.byteLength < 44 || bytes.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: 'That file is not a valid sound.' };
  }
  let decoded;
  try {
    decoded = decodeWav16(bytes);
  } catch {
    return { ok: false, reason: 'Upload a 16-bit mono wav.' };
  }
  if (decoded.sampleRate !== TARGET_RATE) {
    const samples = resample(decoded.samples, decoded.sampleRate, TARGET_RATE);
    decoded = {
      ...decoded,
      samples,
      sampleRate: TARGET_RATE,
      durationMs: (samples.length / TARGET_RATE) * 1000,
    };
  }
  if (decoded.durationMs > MAX_PROCESSED_SECONDS * 1000 + 50) {
    return { ok: false, reason: 'Keep the processed sound to about 4 seconds.' };
  }
  if (isNearSilence(decoded.samples, decoded.sampleRate)) {
    return { ok: false, reason: 'That recording was too quiet.' };
  }
  if (isPureNoise(decoded.samples, decoded.sampleRate)) {
    return { ok: false, reason: 'That recording sounds like noise.' };
  }
  if (clipCount(decoded.samples, -0.05) > decoded.samples.length * 0.02) {
    return { ok: false, reason: 'That recording is clipped.' };
  }
  const meta = sanitizeMeta({
    ...rawMeta,
    durationMs: decoded.durationMs,
    peakDb: dbFromAmp(peakAbs(decoded.samples)),
    loudnessLufsApprox: dbFromAmp(rms(decoded.samples)),
  });
  return { ok: true, meta, decoded };
}

export function pruneUploadRates(history, now) {
  const next = {};
  for (const [key, times] of Object.entries(history || {})) {
    const kept = (times || []).filter((t) => now - t < UPLOAD_DAY_MS);
    if (kept.length) next[key] = kept;
  }
  return next;
}

export function allowUploadRate(history, now, userId) {
  const id = String(userId || '');
  if (!id) return { ok: false, reason: 'Join the room before uploading.', times: [] };
  const times = (history[id] || []).filter((t) => now - t < UPLOAD_DAY_MS);
  if (times.some((t) => now - t < UPLOAD_RATE_MS)) return { ok: false, reason: 'Wait a few minutes before uploading again.', times };
  if (times.length >= UPLOADS_PER_DAY) return { ok: false, reason: 'The daily upload limit is 10.', times };
  times.push(now);
  return { ok: true, times };
}

export function allowUploadKeys(history, now, keys) {
  const rates = pruneUploadRates(history, now);
  const unique = [...new Set((keys || []).map((key) => String(key || '')).filter(Boolean))];
  if (!unique.length) return { ok: false, reason: 'Join the room before uploading.', rates };
  for (const key of unique) {
    const probe = allowUploadRate(rates, now, key);
    if (!probe.ok) return { ok: false, reason: probe.reason, rates };
  }
  for (const key of unique) {
    rates[key] = allowUploadRate(rates, now, key).times;
  }
  return { ok: true, rates };
}

export function refundUploadKeys(history, now, keys) {
  const rates = pruneUploadRates(history, now);
  const unique = [...new Set((keys || []).map((key) => String(key || '')).filter(Boolean))];
  for (const key of unique) {
    const times = [...(rates[key] || [])];
    const idx = times.lastIndexOf(now);
    if (idx >= 0) times.splice(idx, 1);
    if (times.length) rates[key] = times;
    else delete rates[key];
  }
  return rates;
}

export function decideUploadAdmission({ pendingCount, pendingCap = PENDING_CAP, rates, now, keys }) {
  const pruned = pruneUploadRates(rates, now);
  if ((Number(pendingCount) || 0) >= pendingCap) {
    return {
      ok: false,
      reserved: false,
      status: 503,
      reason: 'The room is busy reviewing sounds.',
      rates: pruned,
    };
  }
  const allowed = allowUploadKeys(pruned, now, keys);
  if (!allowed.ok) return { ...allowed, reserved: false, status: 429 };
  return { ...allowed, reserved: true, status: 200 };
}

export function reportThreshold(roomSize) {
  const size = Math.max(1, roomSize | 0);
  return Math.max(1, Math.min(3, Math.ceil(0.2 * size)));
}

export function shouldAutoRemove(reportCount, roomSize) {
  return reportCount >= reportThreshold(roomSize);
}

function clamp(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

