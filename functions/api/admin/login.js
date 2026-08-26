import {
  badRequest,
  forbidden,
  json,
  normalizeUsername,
  readJson,
  sameOrigin,
  unauthorized,
  validUsername
} from '../../../server/http.js';
import { verifyTurnstile } from '../../../server/turnstile.js';
import { hashReporter } from '../../../server/crypto.js';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../../../server/passwords.js';
import { makeSession, sessionCookie } from '../../../server/session.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return forbidden();

  if (
    !env.DB ||
    !env.SESSION_SECRET ||
    !env.IP_HASH_SECRET ||
    !env.TURNSTILE_SECRET_KEY ||
    !env.TURNSTILE_HOSTNAMES
  ) {
    return json({ error: 'Admin security is not configured' }, 503);
  }

  let body;
  try {
    body = await readJson(request, 12_000);
  } catch {
    return badRequest('Invalid request');
  }

  const username = normalizeUsername(body.username);
  const password = String(body.password || '');
  const ip = request.headers.get('CF-Connecting-IP') || '';

  const human = await verifyTurnstile(
    env,
    body.turnstileToken,
    ip,
    'admin_login'
  );
  if (!human) return badRequest('Human verification failed');

  const reporterHash = await hashReporter(
    env.IP_HASH_SECRET,
    ip,
    request.headers.get('user-agent') || ''
  );

  const now = Date.now();
  await env.DB.prepare(
    'DELETE FROM admin_auth_attempts WHERE created_at<?'
  ).bind(now - 24 * 60 * 60_000).run();

  const reporterCount = await env.DB.prepare(`
    SELECT COUNT(*) c
    FROM admin_auth_attempts
    WHERE reporter_hash=? AND created_at>?
  `).bind(reporterHash, now - 15 * 60_000).first();

  const userCount = await env.DB.prepare(`
    SELECT COUNT(*) c
    FROM admin_auth_attempts
    WHERE username_key=? AND created_at>?
  `).bind(username.slice(0, 32), now - 60 * 60_000).first();

  if (
    Number(reporterCount?.c || 0) >= 8 ||
    Number(userCount?.c || 0) >= 20
  ) {
    return json(
      { error: 'Too many login attempts. Try again later.' },
      429
    );
  }

  let admin = null;
  if (validUsername(username)) {
    admin = await env.DB.prepare(`
      SELECT id,username,password_hash,role,active,session_version
      FROM admins
      WHERE username=?
      LIMIT 1
    `).bind(username).first();
  }

  const passwordOk = await verifyPassword(
    password,
    admin?.password_hash || DUMMY_PASSWORD_HASH
  );

  const valid =
    Boolean(admin) &&
    Number(admin.active) === 1 &&
    passwordOk;

  if (!valid) {
    await env.DB.prepare(`
      INSERT INTO admin_auth_attempts(
        reporter_hash,username_key,created_at
      )
      VALUES(?,?,?)
    `).bind(reporterHash, username.slice(0, 32), now).run();

    return unauthorized('Invalid login');
  }

  await env.DB.prepare(`
    DELETE FROM admin_auth_attempts
    WHERE reporter_hash=? OR username_key=?
  `).bind(reporterHash, username).run();

  await env.DB.prepare(`
    UPDATE admins
    SET last_login_at=?,updated_at=?
    WHERE id=?
  `).bind(now, now, admin.id).run();

  const token = await makeSession(env.SESSION_SECRET, admin);

  return json(
    {
      ok: true,
      admin: {
        id: admin.id,
        username: admin.username,
        role: admin.role
      }
    },
    200,
    { 'set-cookie': sessionCookie(token) }
  );
}
