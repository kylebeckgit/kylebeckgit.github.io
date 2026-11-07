// Optional Describe endpoint. Not deployed from this repo.
// Membership checks stay off unless MEMBERSHIP_ENABLED is the string "true".
// CORS allows only https://kyle-beck.com.

const MODEL = '@cf/meta/llama-3.2-3b-instruct';
const ORIGIN = 'https://kyle-beck.com';
const FREE_PER_IP_PER_DAY = 5;
const MEMBER_PER_DAY = 40;
const GLOBAL_PER_DAY = 400;
const LICENSE_CACHE_MS = 10 * 60 * 1000;
const PRESETS = new Set(['string', 'bar', 'bell', 'plate', 'membrane', 'open-pipe', 'closed-pipe']);

const SYSTEM = `You set controls for a modal synthesis editor. Reply with JSON only, no markdown.
Keys, all required:
preset: one of string, bar, bell, plate, membrane, open-pipe, closed-pipe
stiffness: number from 0 to 1
brightness: number from -1 to 1
damping: number from 0 to 1
oddEven: number from -1 (even partials) to 1 (odd partials)
seed: integer from 0 to 1000000
Use string for bowed or plucked strings, bar for xylophone or marimba bars, bell for bells, plate for metal plates, membrane for drums, open-pipe for flutes, closed-pipe for clarinets.`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (origin !== ORIGIN) return new Response('Forbidden', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
    if (request.method !== 'POST') return json({ error: 'method' }, 405);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'json' }, 400); }
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 500) : '';
    if (!prompt) return json({ error: 'prompt' }, 400);

    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const licenseKey = typeof body?.licenseKey === 'string' ? body.licenseKey.trim() : '';
    const gate = await env.LIMITER.get(env.LIMITER.idFromName('global')).fetch('https://limiter/check', {
      method: 'POST',
      body: JSON.stringify({ ip, licenseKey }),
    });
    const limit = await gate.json();
    if (!limit.allowed) return json({ error: limit.reason }, limit.reason === 'license' ? 403 : 429);

    let raw;
    try {
      const result = await env.AI.run(MODEL, {
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: prompt },
        ],
        max_tokens: 200,
        temperature: 0.2,
      });
      raw = result.response || result.result?.response || result.choices?.[0]?.message?.content || '';
    } catch {
      return json({ error: 'model' }, 502);
    }

    try {
      return json({ controls: parseControls(raw) });
    } catch {
      return json({ error: 'validation' }, 422);
    }
  },
};

export class Limiter {
  constructor(ctx, env) {
    this.storage = ctx.storage;
    this.env = env;
  }

  async fetch(request) {
    const { ip, licenseKey } = await request.json();
    const membershipOn = String(this.env.MEMBERSHIP_ENABLED || '').toLowerCase() === 'true';
    let memberId = '';
    if (membershipOn && licenseKey) {
      const verdict = await this.cachedLicense(licenseKey);
      if (!verdict.ok) return Response.json({ allowed: false, reason: 'license' });
      memberId = verdict.id;
    }

    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const state = (await this.storage.get('quotas')) || { day, global: 0, ip: {}, member: {} };
    if (state.day !== day) {
      state.day = day;
      state.global = 0;
      state.ip = {};
      state.member = {};
    }
    if (state.global >= GLOBAL_PER_DAY) return Response.json({ allowed: false, reason: 'day' });

    if (memberId) {
      const used = state.member[memberId] || 0;
      if (used >= MEMBER_PER_DAY) return Response.json({ allowed: false, reason: 'member' });
      state.member[memberId] = used + 1;
    } else {
      const used = state.ip[ip] || 0;
      if (used >= FREE_PER_IP_PER_DAY) return Response.json({ allowed: false, reason: 'ip' });
      state.ip[ip] = used + 1;
    }
    state.global += 1;
    await this.storage.put('quotas', state);
    return Response.json({ allowed: true, member: Boolean(memberId) });
  }

  async cachedLicense(licenseKey) {
    const hash = await sha256(licenseKey);
    const cacheKey = `lic:${hash}`;
    const cached = await this.storage.get(cacheKey);
    if (cached && cached.exp > Date.now()) return cached;
    const verdict = await validateLicense(licenseKey, this.env.MEMBERSHIP_PRODUCT_ID);
    const stored = { ...verdict, exp: Date.now() + LICENSE_CACHE_MS };
    await this.storage.put(cacheKey, stored);
    return stored;
  }
}

export function interpretLicense(payload, expectedProductId) {
  if (!payload || payload.valid !== true) return { ok: false };
  const license = payload.license_key || {};
  if (license.status !== 'active') return { ok: false };
  if (license.expires_at && Date.parse(license.expires_at) < Date.now()) return { ok: false };
  const productId = String(payload.meta?.product_id ?? '');
  if (!expectedProductId || productId !== String(expectedProductId)) return { ok: false };
  const id = String(license.id ?? '');
  if (!id) return { ok: false };
  return { ok: true, id };
}

async function validateLicense(licenseKey, expectedProductId) {
  if (!expectedProductId) return { ok: false };
  let payload;
  try {
    const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ license_key: licenseKey }),
    });
    payload = await response.json();
  } catch {
    return { ok: false };
  }
  return interpretLicense(payload, expectedProductId);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseControls(raw) {
  const text = String(raw).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('shape');
  const value = JSON.parse(text.slice(start, end + 1));
  if (!PRESETS.has(value.preset)) throw new Error('preset');
  const num = (key, lo, hi) => {
    const n = Number(value[key]);
    if (!Number.isFinite(n)) throw new Error(key);
    return Math.min(hi, Math.max(lo, n));
  };
  const seed = Number(value.seed);
  return {
    preset: value.preset,
    stiffness: num('stiffness', 0, 1),
    brightness: num('brightness', -1, 1),
    damping: num('damping', 0, 1),
    oddEven: num('oddEven', -1, 1),
    seed: Number.isFinite(seed) ? Math.trunc(Math.min(1_000_000, Math.max(0, seed))) : 0,
  };
}

function cors() {
  return {
    'access-control-allow-origin': ORIGIN,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  };
}

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: cors() });
}
