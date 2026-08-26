import { b64url, fromB64url, hmac, timingSafeEqual } from './crypto.js';

const enc = new TextEncoder();

function cookieMap(request) {
  return Object.fromEntries((request.headers.get('cookie') || '').split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('=');
    return [v.slice(0, i), v.slice(i + 1)];
  }));
}

export async function verifyPassword(password, encoded) {
  try {
    const [kind, iterationsRaw, saltB64, expectedB64] = String(encoded || '').split('$');
    if (kind !== 'pbkdf2') return false;
    const iterations = Number(iterationsRaw);
    if (!Number.isFinite(iterations) || iterations < 100_000 || iterations > 1_000_000) return false;
    const salt = fromB64url(saltB64);
    const expected = fromB64url(expectedB64);
    const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, expected.length * 8);
    return timingSafeEqual(new Uint8Array(bits), expected);
  } catch {
    return false;
  }
}

export async function makeSession(secret, ttlSeconds = 8 * 60 * 60) {
  const payload = { exp: Math.floor(Date.now() / 1000) + ttlSeconds, n: crypto.randomUUID() };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await hmac(secret, body));
  return `${body}.${sig}`;
}

export async function verifySession(request, secret) {
  if (!secret) return false;
  const token = cookieMap(request).doges_admin;
  if (!token) return false;
  const [body, sig] = token.split('.');
  if (!body || !sig) return false;
  const expected = b64url(await hmac(secret, body));
  if (!timingSafeEqual(enc.encode(sig), enc.encode(expected))) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    return Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function sessionCookie(token) {
  return `doges_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
}

export function clearSessionCookie() {
  return 'doges_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}
