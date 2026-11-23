// A shared sound is a compact JSON blob in the page hash. Nothing is sent.

import { noteFrequency, noteNameFromHz, playedFundamental, sanitizeControls } from './engine.js';

const VERSION = 1;
const MATERIALS = new Set(['metal', 'wood', 'glass', 'skin', 'stone', 'ceramic', 'plastic', 'cardboard', 'air', 'water', 'void', 'rubber', 'ice', 'string']);
const SHAPES = new Set(['bar', 'plate', 'membrane', 'shell', 'bowl', 'tube', 'string', 'box', 'cavity']);
const SIZES = new Set(['tiny', 'small', 'medium', 'large', 'huge']);
const EXCITERS = new Set(['click', 'mallet', 'burst', 'bow', 'file']);

function round(value, digits) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const scale = 10 ** digits;
  return Math.round(n * scale) / scale;
}

function clamp(value, lo, hi, digits, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const next = Math.min(hi, Math.max(lo, n));
  return digits == null ? next : round(next, digits);
}

function plain(value, max) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlToBytes(token) {
  const padded = token.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((token.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const MAX_PARTIALS = 256;
const MAX_TOKEN = 7500;

function quantizePartials(partials) {
  return (Array.isArray(partials) ? partials : []).slice(0, MAX_PARTIALS).map((partial) => [
    clamp(partial?.ratio, 0.05, 80, 4, null),
    clamp(partial?.gainDb, -96, 0, 2, -12),
    clamp(partial?.decay, 0.05, 30, 3, 1),
  ]).filter((row) => row[0] != null);
}

function packPartialBytes(rows) {
  const bytes = new Uint8Array(rows.length * 8);
  const view = new DataView(bytes.buffer);
  rows.forEach((row, index) => {
    const offset = index * 8;
    view.setUint32(offset, Math.round(row[0] * 10000), true);
    view.setInt16(offset + 4, Math.round(row[1] * 100), true);
    view.setUint16(offset + 6, Math.round(row[2] * 1000), true);
  });
  return bytes;
}

function unpackPartialBytes(bytes) {
  if (bytes.length % 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const partials = [];
  for (let offset = 0; offset + 8 <= bytes.length && partials.length < MAX_PARTIALS; offset += 8) {
    const ratio = clamp(view.getUint32(offset, true) / 10000, 0.05, 80, 4, null);
    if (ratio == null) continue;
    partials.push({
      ratio,
      gainDb: clamp(view.getInt16(offset + 4, true) / 100, -96, 0, 2, -12),
      decay: clamp(view.getUint16(offset + 6, true) / 1000, 0.05, 30, 3, 1),
    });
  }
  return partials;
}

function metadata(profile) {
  const controls = sanitizeControls(profile.controls || {});
  return {
    v: VERSION,
    n: plain(profile.name, 80),
    d: plain(profile.description, 160),
    o: plain(profile.objectName || profile.name, 80),
    m: MATERIALS.has(profile.material) ? profile.material : '',
    h: SHAPES.has(profile.shape) ? profile.shape : '',
    z: SIZES.has(profile.size) ? profile.size : 'medium',
    x: EXCITERS.has(profile.exciter) ? profile.exciter : 'mallet',
    hd: clamp(profile.hardness, 0, 1, 2, 0.5),
    vel: clamp(profile.velocity, 0, 1, 2, 0.8),
    pos: clamp(profile.position, 0.02, 0.98, 2, 0.18),
    det: clamp(profile.detune, -1, 1, 3, 0),
    ...(Number(profile.fundamental) > 0 ? { hz: clamp(profile.fundamental, 20, 8000, 3, 0) } : {}),
    ...(Number(profile.referenceHz) > 0 ? { rh: clamp(profile.referenceHz, 20, 8000, 3, 0) } : {}),
    c: {
      preset: controls.preset,
      stiffness: round(controls.stiffness, 3),
      brightness: round(controls.brightness, 3),
      damping: round(controls.damping, 3),
      oddEven: round(controls.oddEven, 3),
      seed: controls.seed,
      count: controls.count,
      voice: controls.voice,
      decayScale: round(controls.decayScale, 3),
      pitchScale: round(controls.pitchScale, 3),
      variation: controls.variation,
      variationTilt: round(controls.variationTilt, 2),
      variationDecay: round(controls.variationDecay, 3),
      variationLift: round(controls.variationLift, 3),
    },
  };
}

// One base64url blob: version byte, JSON length, UTF-8 metadata, then raw partial bytes.
function encodeToken(profile, rows) {
  const json = new TextEncoder().encode(JSON.stringify(metadata(profile)));
  const partials = packPartialBytes(rows);
  const out = new Uint8Array(3 + json.length + partials.length);
  out[0] = VERSION;
  out[1] = json.length & 0xff;
  out[2] = (json.length >> 8) & 0xff;
  out.set(json, 3);
  out.set(partials, 3 + json.length);
  return bytesToBase64Url(out);
}

export function buildShare(profile = {}, { maxToken = MAX_TOKEN } = {}) {
  const source = Array.isArray(profile.partials) ? profile.partials : [];
  let rows = quantizePartials(source);
  let shortened = source.length > rows.length;
  let token = encodeToken(profile, rows);
  while (token.length > maxToken && rows.length > 1) {
    let quiet = 0;
    for (let index = 1; index < rows.length; index++) {
      if (rows[index][1] < rows[quiet][1]) quiet = index;
    }
    rows = rows.filter((_, index) => index !== quiet);
    shortened = true;
    token = encodeToken(profile, rows);
  }
  return { token, shortened };
}

export function encodeShare(profile = {}) {
  return buildShare(profile).token;
}

export function shareUrl(profile, href = '') {
  const base = String(href || '').split('#')[0];
  const built = buildShare(profile);
  return { url: `${base}#s=${built.token}`, shortened: built.shortened };
}

// Pitch for a decoded share. A library fundamental wins over pitchScale,
// which is clamped and would play a low object such as Slinky too high.
export function sharedPitch(profile, { note = 'A4' } = {}) {
  const fundamental = Number(profile?.fundamental);
  const referenceHz = Number(profile?.referenceHz);
  const hearFundamental = fundamental > 0
    ? fundamental
    : playedFundamental(profile?.controls?.pitchScale, noteFrequency(note));
  return {
    hearFundamental,
    playReferenceHz: referenceHz > 0 ? referenceHz : 0,
    note: fundamental > 0 ? noteNameFromHz(fundamental) : note,
  };
}

export async function presentShare(url, { status, field, message = 'Link copied' } = {}) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
    await navigator.clipboard.writeText(url);
    if (status) status.textContent = message;
    if (field) field.hidden = true;
  } catch {
    if (field) {
      field.hidden = false;
      field.value = url;
      field.focus();
      field.select();
    }
    if (status) status.textContent = 'Select the link to copy it.';
  }
}

function readShare(bytes) {
  if (bytes.length < 3 || bytes[0] !== VERSION) return null;
  const jsonLength = bytes[1] | (bytes[2] << 8);
  if (jsonLength < 2 || 3 + jsonLength > bytes.length) return null;
  const parsed = JSON.parse(new TextDecoder().decode(bytes.subarray(3, 3 + jsonLength)));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.v !== VERSION) return null;
  const partials = unpackPartialBytes(bytes.subarray(3 + jsonLength));
  if (!partials) return null;
  return { ...parsed, partials };
}

export function decodeShare(hash) {
  try {
    const match = /(?:^|#|&)s=([A-Za-z0-9_-]+)/.exec(String(hash || ''));
    if (!match) return null;
    const bytes = base64UrlToBytes(match[1]);
    const parsed = readShare(bytes);
    if (!parsed) return null;
    const controls = sanitizeControls(parsed.c || {});
    const partials = parsed.partials;
    return {
      name: plain(parsed.n, 80) || 'Shared sound',
      description: plain(parsed.d, 160),
      objectName: plain(parsed.o, 80) || plain(parsed.n, 80) || 'Shared sound',
      material: MATERIALS.has(parsed.m) ? parsed.m : '',
      shape: SHAPES.has(parsed.h) ? parsed.h : '',
      size: SIZES.has(parsed.z) ? parsed.z : 'medium',
      exciter: EXCITERS.has(parsed.x) ? parsed.x : 'mallet',
      hardness: clamp(parsed.hd, 0, 1, 2, 0.5),
      velocity: clamp(parsed.vel, 0, 1, 2, 0.8),
      position: clamp(parsed.pos, 0.02, 0.98, 2, 0.18),
      detune: clamp(parsed.det, -1, 1, 3, 0),
      ...(Number(parsed.hz) > 0 ? { fundamental: clamp(parsed.hz, 20, 8000, 3, 0) } : {}),
      ...(Number(parsed.rh) > 0 ? { referenceHz: clamp(parsed.rh, 20, 8000, 3, 0) } : {}),
      controls,
      partials,
    };
  } catch {
    return null;
  }
}
