// Optional Describe endpoint for the modal editor. Not deployed from this repo.
// CORS allows only https://kyle-beck.com. Limits are enforced in one Durable Object.

const MODEL = '@cf/meta/llama-3.2-3b-instruct';
const ORIGIN = 'https://kyle-beck.com';
const PER_IP_PER_HOUR = 8;
const DAILY_CEILING = 400;
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
    const gate = await env.LIMITER.get(env.LIMITER.idFromName('global')).fetch('https://limiter/check', {
      method: 'POST',
      body: JSON.stringify({ ip }),
    });
    const limit = await gate.json();
    if (!limit.allowed) return json({ error: limit.reason }, 429);

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
  constructor(ctx) {
    this.storage = ctx.storage;
  }

  async fetch(request) {
    const { ip } = await request.json();
    const now = Date.now();
    const hour = String(Math.floor(now / 3_600_000));
    const day = new Date(now).toISOString().slice(0, 10);
    const state = (await this.storage.get('state')) || { day, dayCount: 0, hours: {} };
    if (state.day !== day) {
      state.day = day;
      state.dayCount = 0;
      state.hours = {};
    }
    if (!state.hours[hour]) state.hours = { [hour]: {} };
    const used = state.hours[hour][ip] || 0;
    if (used >= PER_IP_PER_HOUR) return Response.json({ allowed: false, reason: 'ip' });
    if (state.dayCount >= DAILY_CEILING) return Response.json({ allowed: false, reason: 'day' });
    state.hours[hour][ip] = used + 1;
    state.dayCount += 1;
    await this.storage.put('state', state);
    return Response.json({ allowed: true });
  }
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
