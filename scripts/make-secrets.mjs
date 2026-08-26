import crypto from 'node:crypto';

console.log(`SESSION_SECRET=${crypto.randomBytes(32).toString('base64url')}`);
console.log(`IP_HASH_SECRET=${crypto.randomBytes(32).toString('base64url')}`);
