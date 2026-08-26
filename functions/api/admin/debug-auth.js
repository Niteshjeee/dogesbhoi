import { json } from '../../../server/http.js';
import { verifyPassword } from '../../../server/auth.js';

const DEMO_HASH =
  'pbkdf2$310000$ZGVtby1kb2dlcy1zYWx0LTIwMjY$gudqtQkTJr9kNNkAqyprsvAE28Frl9SmDUVsqdKg_F8';

export async function onRequestGet({ env }) {

  const storedHash =
    String(env.ADMIN_PASSWORD_HASH || '');

  const envHashIsExactDemo =
    storedHash === DEMO_HASH;

  const demoPasswordWorksWithEnvHash =
    storedHash
      ? await verifyPassword(
          'DogesDemo@2026!',
          storedHash
        )
      : false;

  return json({
    adminUsernameConfigured:
      Boolean(env.ADMIN_USERNAME),

    usernameIsDogesAdmin:
      String(env.ADMIN_USERNAME || '') ===
      'doges-admin',

    passwordHashConfigured:
      Boolean(storedHash),

    hashLength:
      storedHash.length,

    hashFormatCorrect:
      storedHash.startsWith('pbkdf2$') &&
      storedHash.split('$').length === 4,

    envHashIsExactDemo,

    demoPasswordWorksWithEnvHash,

    sessionSecretConfigured:
      Boolean(env.SESSION_SECRET),

    ipHashSecretConfigured:
      Boolean(env.IP_HASH_SECRET),

    dbConfigured:
      Boolean(env.DB)
  });
}
