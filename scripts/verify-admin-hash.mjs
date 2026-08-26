import crypto from 'node:crypto';

const password = String(process.env.ADMIN_PASSWORD || '');
const encoded = String(process.env.ADMIN_PASSWORD_HASH || '');

const [kind, iterationsRaw, saltB64, digestB64] = encoded.split('$');
if (kind !== 'pbkdf2' || Number(iterationsRaw) !== 100_000 || !saltB64 || !digestB64) {
  console.error('Hash format is not a Doges PBKDF2-100000 hash.');
  process.exit(2);
}

const expected = Buffer.from(digestB64, 'base64url');
const actual = crypto.pbkdf2Sync(password, Buffer.from(saltB64, 'base64url'), 100_000, expected.length, 'sha256');

console.log(crypto.timingSafeEqual(actual, expected) ? 'MATCH' : 'NO MATCH');
