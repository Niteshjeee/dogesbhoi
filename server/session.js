import { b64url, fromB64url, hmac, timingSafeEqual } from './crypto.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const COOKIE = 'doges_admin';

function cookieMap(request) {
  const out = {};
  for (const piece of (request.headers.get('cookie') || '').split(';')) {
    const v = piece.trim();
    if (!v) continue;
    const i = v.indexOf('=');
    if (i > 0) out[v.slice(0, i)] = v.slice(i + 1);
  }
  return out;
}

export async function makeSession(secret, admin, ttlSeconds = 8 * 60 * 60) {
  const payload = {
    v: 1,
    aid: admin.id,
    sv: Number(admin.session_version || 1),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    n: crypto.randomUUID(),
  };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await hmac(secret, body));
  return `${body}.${sig}`;
}

export async function readSession(request, secret) {
  if (!secret) return null;
  const token = cookieMap(request)[COOKIE];
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = b64url(await hmac(secret, body));
  if (!timingSafeEqual(enc.encode(sig), enc.encode(expected))) return null;
  try {
    const payload = JSON.parse(dec.decode(fromB64url(body)));
    if (payload.v !== 1 || !payload.aid || !Number.isFinite(Number(payload.sv))) return null;
    if (Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookie(token) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
}

export function clearSessionCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
