export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

export function badRequest(message) { return json({ error: message }, 400); }
export function unauthorized(message = 'Unauthorized') { return json({ error: message }, 401); }
export function forbidden(message = 'Forbidden') { return json({ error: message }, 403); }
export function notFound(message = 'Not found') { return json({ error: message }, 404); }

export async function readJson(request, maxBytes = 400_000) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
  return JSON.parse(text || '{}');
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return origin === new URL(request.url).origin;
}

export function cleanText(value, max = 250) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
}
