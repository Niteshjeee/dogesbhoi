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
import { getOwner } from '../../../server/authz.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../../../server/passwords.js';
import { audit } from '../../../server/audit.js';

export async function onRequestGet({ request, env }) {
  const owner = await getOwner(request, env);
  if (!owner) return unauthorized();

  const { results } = await env.DB.prepare(`
    SELECT id,username,role,active,created_at,updated_at,last_login_at
    FROM admins
    ORDER BY
      CASE role WHEN 'owner' THEN 0 ELSE 1 END,
      username ASC
  `).all();

  return json({
    admins: results,
    currentAdminId: owner.id
  });
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return forbidden();

  const owner = await getOwner(request, env);
  if (!owner) return unauthorized();

  let body;
  try {
    body = await readJson(request, 12_000);
  } catch {
    return badRequest('Invalid request');
  }

  const username = normalizeUsername(body.username);
  const password = String(body.password || '');
  const role = ['owner','admin'].includes(body.role) ? body.role : 'admin';

  if (!validUsername(username)) {
    return badRequest('Username must be 3-32 lowercase letters, numbers, dot, underscore or hyphen');
  }

  if (password.length < MIN_PASSWORD_LENGTH || password.length > 128) {
    return badRequest(`Password must be ${MIN_PASSWORD_LENGTH}-128 characters`);
  }

  const exists = await env.DB.prepare(
    'SELECT id FROM admins WHERE username=? LIMIT 1'
  ).bind(username).first();

  if (exists) return badRequest('Username already exists');

  const passwordHash = await hashPassword(password);
  const id = `ADM-${crypto.randomUUID()}`;
  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO admins(
      id,username,password_hash,role,active,
      session_version,created_at,updated_at
    )
    VALUES(?,?,?,?,1,1,?,?)
  `).bind(
    id,
    username,
    passwordHash,
    role,
    now,
    now
  ).run();

  await audit(env, owner, 'admin.create', 'admin', id, `${username}:${role}`);

  return json({
    ok: true,
    admin: { id, username, role, active: 1 }
  }, 201);
}
