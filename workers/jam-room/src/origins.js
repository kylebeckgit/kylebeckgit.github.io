const SITE = 'https://kyle-beck.com';

export function allowedOrigin(origin) {
  if (!origin) return false;
  if (origin === SITE) return true;
  try {
    const url = new URL(origin);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === '::1';
    if (!local) return false;
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function corsHeaders(origin) {
  if (!allowedOrigin(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Reset, X-Admin-Token, X-Jam-User, X-Jam-Upload, X-Test-AI, X-Test-IP',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export function notFound(origin) {
  return new Response('Not found', { status: 404, headers: corsHeaders(origin) });
}
