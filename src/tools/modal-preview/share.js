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

export function encodeShare(profile = {}) {
  const controls = sanitizeControls(profile.controls || {});
  const packed = {
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
    p: (Array.isArray(profile.partials) ? profile.partials : []).slice(0, 32).map((partial) => [
      clamp(partial?.ratio, 0.05, 80, 4, null),
      clamp(partial?.gainDb, -60, 0, 2, -12),
      clamp(partial?.decay, 0.05, 30, 3, 1),
    ]).filter((row) => row[0] != null),
  };
  return encodeBytes(JSON.stringify(packed));
}

export function shareUrl(profile, href = '') {
  const base = String(href || '').split('#')[0];
  return `${base}#s=${encodeShare(profile)}`;
}

export async function presentShare(url, { status, field } = {}) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
    await navigator.clipboard.writeText(url);
    if (status) status.textContent = 'Link copied';
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
    const partials = (Array.isArray(parsed.p) ? parsed.p : []).slice(0, 32).map((row) => {
      if (!Array.isArray(row)) return null;
      const ratio = clamp(row[0], 0.05, 80, 4, null);
      if (ratio == null) return null;
      return {
        ratio,
        gainDb: clamp(row[1], -60, 0, 2, -12),
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
