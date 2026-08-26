import {
  badRequest,
  forbidden,
  json,
  readJson,
  sameOrigin,
  unauthorized,
  notFound
} from '../../../../server/http.js';
import { getOwner } from '../../../../server/authz.js';
import { audit } from '../../../../server/audit.js';

export async function onRequestPatch({ request, env, params }) {
  if (!sameOrigin(request)) return forbidden();

  const owner = await getOwner(request, env);
  if (!owner) return unauthorized();

  if (params.id === owner.id) {
    return badRequest('You cannot disable your own admin account');
  }

  const target = await env.DB.prepare(`
    SELECT id,username,role,active
    FROM admins WHERE id=?
  `).bind(params.id).first();

  if (!target) return notFound('Admin not found');

  let body;
  try {
    body = await readJson(request, 4_000);
  } catch {
    return badRequest('Invalid request');
  }

  if (typeof body.active !== 'boolean') {
    return badRequest('active must be true or false');
  }

  if (
    target.role === 'owner' &&
    body.active === false &&
    Number(target.active) === 1
  ) {
    const owners = await env.DB.prepare(`
      SELECT COUNT(*) c
      FROM admins
      WHERE role='owner' AND active=1
    `).first();

    if (Number(owners?.c || 0) <= 1) {
      return badRequest('At least one active owner must remain');
    }
  }

  const now = Date.now();
  await env.DB.prepare(`
    UPDATE admins
    SET active=?,session_version=session_version+1,updated_at=?
    WHERE id=?
  `).bind(body.active ? 1 : 0, now, params.id).run();

  await audit(
    env,
    owner,
    body.active ? 'admin.enable' : 'admin.disable',
    'admin',
    params.id,
    target.username
  );

  return json({ ok: true });
}
