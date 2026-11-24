// Streaming, length-capped reads of untrusted request bodies.
// Never buffer a body with arrayBuffer(), text(), or json().

export const MAX_JSON_BODY_BYTES = 16 * 1024;

export async function cancelRequestBody(request) {
  const body = request?.body;
  if (!body || typeof body.cancel !== 'function') return;
  try { await body.cancel(); } catch { /* already locked, closed, or consumed */ }
}

export async function readStreamCapped(stream, maxBytes) {
  if (!stream) return { tooLarge: false, bytes: new Uint8Array(0) };
  const reader = typeof stream.getReader === 'function' ? stream.getReader() : null;
  if (!reader) return { tooLarge: false, bytes: new Uint8Array(0) };
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* already */ }
      return { tooLarge: true, bytes: null };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { tooLarge: false, bytes };
}

export async function readBodyCapped(request, maxBytes) {
  const declared = Number(request?.headers?.get?.('Content-Length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { tooLarge: true, bytes: null };
  }
  return readStreamCapped(request?.body, maxBytes);
}

export async function readJsonCapped(request, maxBytes = MAX_JSON_BODY_BYTES) {
  const result = await readBodyCapped(request, maxBytes);
  if (result.tooLarge) return { tooLarge: true, value: null };
  if (!result.bytes?.byteLength) return { tooLarge: false, value: null };
  try {
    return { tooLarge: false, value: JSON.parse(new TextDecoder().decode(result.bytes)) };
  } catch {
    return { tooLarge: false, value: null, invalid: true };
  }
}
