import crypto from 'node:crypto';

const username = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || '');
const role = String(process.env.ADMIN_ROLE || 'owner').trim().toLowerCase();

if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
  console.error('Set ADMIN_USERNAME to 3-32 chars: lowercase letters, numbers, dot, underscore or hyphen.');
  process.exit(1);
}

if (password.length < 16 || password.length > 128) {
  console.error('Set ADMIN_PASSWORD to a strong password of 16-128 characters.');
  process.exit(1);
}

if (!['owner', 'admin'].includes(role)) {
  console.error('ADMIN_ROLE must be owner or admin.');
  process.exit(1);
}

const iterations = 100_000;
const salt = crypto.randomBytes(18);
const digest = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
const hash = `pbkdf2$${iterations}$${salt.toString('base64url')}$${digest.toString('base64url')}`;
const id = `ADM-${crypto.randomUUID()}`;
const now = Date.now();

console.log('-- Paste this ONE statement into your D1 SQL console:');
console.log(`INSERT INTO admins(id,username,password_hash,role,active,session_version,created_at,updated_at) VALUES('${id}','${username}','${hash}','${role}',1,1,${now},${now});`);
