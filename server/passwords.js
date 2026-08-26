import { b64url, fromB64url, timingSafeEqual } from './crypto.js';

const enc = new TextEncoder();

export const PBKDF2_ITERATIONS = 100_000;
export const MIN_PASSWORD_LENGTH = 16;

async function derive(password, salt, length = 32) {
  const material = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(password)),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    material,
    length * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const value = String(password || '');
  if (value.length < MIN_PASSWORD_LENGTH || value.length > 128) {
    throw new Error(`Password must be ${MIN_PASSWORD_LENGTH}-128 characters`);
  }
  const salt = new Uint8Array(18);
  crypto.getRandomValues(salt);
  const digest = await derive(value, salt, 32);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(digest)}`;
}

export async function verifyPassword(password, encoded) {
  try {
    const [kind, iterationsRaw, saltB64, digestB64] = String(encoded || '').split('$');
    if (kind !== 'pbkdf2' || Number(iterationsRaw) !== PBKDF2_ITERATIONS) return false;
    const salt = fromB64url(saltB64);
    const expected = fromB64url(digestB64);
    if (salt.length < 12 || expected.length !== 32) return false;
    const actual = await derive(String(password || ''), salt, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export const DUMMY_PASSWORD_HASH =
  'pbkdf2$100000$RE9HRVMtRFVNTVktU0FMVC0yMDI2$BvpuJPD_4QtHHb8tUOfraa7Y_G_N5iam_IrgreVyKmc';
