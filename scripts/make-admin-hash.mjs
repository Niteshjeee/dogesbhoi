import crypto from 'node:crypto';
const password = process.env.ADMIN_PASSWORD;
if (!password || password.length < 12) {
  console.error('Set ADMIN_PASSWORD to a strong password of at least 12 characters.');
  process.exit(1);
}
const iterations = 310000;
const salt = crypto.randomBytes(18);
const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const b64url = b => Buffer.from(b).toString('base64url');
console.log(`ADMIN_PASSWORD_HASH=pbkdf2$${iterations}$${b64url(salt)}$${b64url(hash)}`);
console.log(`SESSION_SECRET=${crypto.randomBytes(32).toString('base64url')}`);
console.log(`IP_HASH_SECRET=${crypto.randomBytes(32).toString('base64url')}`);
