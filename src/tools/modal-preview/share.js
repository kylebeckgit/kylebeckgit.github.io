// A shared sound is a compact JSON blob in the page hash. Nothing is sent.

import { sanitizeControls } from './engine.js';

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

function encodeBytes(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function decodeBytes(token) {
  const padded = token.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((token.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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

function packPartials(rows) {
  const bytes = new Uint8Array(rows.length * 8);
  const view = new DataView(bytes.buffer);
  rows.forEach((row, index) => {
    const offset = index * 8;
    view.setUint32(offset, Math.round(row[0] * 10000), true);
    view.setInt16(offset + 4, Math.round(row[1] * 100), true);
    view.setUint16(offset + 6, Math.round(row[2] * 1000), true);
  });
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return encodeBytes(binary);
}

function unpackPartials(token) {
  const binary = decodeBytes(token);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (bytes.length % 8) return [];
  const view = new DataView(bytes.buffer);
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

function packed(profile, rows) {
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
    q: packPartials(rows),
  };
}

export function buildShare(profile = {}, { maxToken = MAX_TOKEN } = {}) {
  const source = Array.isArray(profile.partials) ? profile.partials : [];
  let rows = quantizePartials(source);
  let shortened = source.length > rows.length;
  let token = encodeBytes(JSON.stringify(packed(profile, rows)));
  while (token.length > maxToken && rows.length > 1) {
    let quiet = 0;
    for (let index = 1; index < rows.length; index++) {
      if (rows[index][1] < rows[quiet][1]) quiet = index;
    }
    if (quiet === 0) quiet = rows.length - 1;
    rows = rows.filter((_, index) => index !== quiet);
    shortened = true;
    token = encodeBytes(JSON.stringify(packed(profile, rows)));
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

export function decodeShare(hash) {
  try {
    const match = /(?:^|#|&)s=([A-Za-z0-9_-]+)/.exec(String(hash || ''));
    if (!match) return null;
    const parsed = JSON.parse(decodeBytes(match[1]));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.v !== VERSION) return null;
    const controls = sanitizeControls(parsed.c || {});
    const partials = typeof parsed.q === 'string'
      ? unpackPartials(parsed.q)
      : (Array.isArray(parsed.p) ? parsed.p : []).slice(0, MAX_PARTIALS).map((row) => {
        if (!Array.isArray(row)) return null;
        const ratio = clamp(row[0], 0.05, 80, 4, null);
        if (ratio == null) return null;
        return {
          ratio,
          gainDb: clamp(row[1], -96, 0, 2, -12),
          decay: clamp(row[2], 0.05, 30, 3, 1),
        };
      }).filter(Boolean);
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
      controls,
      partials,
    };
  } catch {
    return null;
  }
}
