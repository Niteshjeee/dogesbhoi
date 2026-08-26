import { badRequest, forbidden, json, readJson, sameOrigin, unauthorized } from '../../../server/http.js';
import { verifyPassword, makeSession, sessionCookie } from '../../../server/auth.js';
import { verifyTurnstile } from '../../../server/turnstile.js';
import { hashReporter } from '../../../server/crypto.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return forbidden();
  if (!env.SESSION_SECRET || !env.ADMIN_PASSWORD_HASH || !env.IP_HASH_SECRET) return json({ error: 'Admin security is not configured' }, 503);
  let body;
  try { body = await readJson(request, 12_000); } catch { return badRequest('Invalid request'); }
  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (!await verifyTurnstile(env.TURNSTILE_SECRET_KEY, body.turnstileToken, ip, 'admin_login')) return badRequest('Human verification failed');

  const reporterHash = await hashReporter(env.IP_HASH_SECRET, ip, request.headers.get('user-agent') || '');
  await env.DB.prepare('DELETE FROM admin_login_attempts WHERE created_at<?').bind(Date.now() - 24 * 60 * 60_000).run();
  const since = Date.now() - 15 * 60_000;
  const count = await env.DB.prepare('SELECT COUNT(*) c FROM admin_login_attempts WHERE reporter_hash=? AND created_at>?').bind(reporterHash, since).first();
  if (Number(count?.c || 0) >= 8) return json({ error: 'Too many login attempts. Try again later.' }, 429);

  const validUser = String(body.username || '') === String(env.ADMIN_USERNAME || 'admin');
  const validPass = await verifyPassword(String(body.password || ''), env.ADMIN_PASSWORD_HASH);
  if (!validUser || !validPass) {
    await env.DB.prepare('INSERT INTO admin_login_attempts(reporter_hash,created_at) VALUES(?,?)').bind(reporterHash, Date.now()).run();
    return unauthorized('Invalid login');
  }

  await env.DB.prepare('DELETE FROM admin_login_attempts WHERE reporter_hash=?').bind(reporterHash).run();
  const token = await makeSession(env.SESSION_SECRET);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token) });
}
