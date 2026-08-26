import {
  badRequest,
  forbidden,
  json,
  readJson,
  sameOrigin,
  unauthorized,
  notFound
} from '../../../../server/http.js';
import { getAdmin } from '../../../../server/authz.js';
import { audit } from '../../../../server/audit.js';

export async function onRequestPatch({ request, env, params }) {
  if (!sameOrigin(request)) return forbidden();

  const admin = await getAdmin(request, env);
  if (!admin) return unauthorized();

  const row = await env.DB.prepare(`
    SELECT id,dog_id,moderation_status
    FROM sightings WHERE id=?
  `).bind(params.id).first();

  if (!row) return notFound('Sighting not found');

  let body;
  try {
    body = await readJson(request, 5_000);
  } catch {
    return badRequest('Invalid request');
  }

  if (!['accepted','review','rejected'].includes(body.status)) {
    return badRequest('Invalid status');
  }

  const confidence =
    body.status === 'rejected'
      ? 'low'
      : (
          ['high','medium','low'].includes(body.confidence)
            ? body.confidence
            : 'medium'
        );

  await env.DB.prepare(`
    UPDATE sightings
    SET moderation_status=?,confidence=?
    WHERE id=?
  `).bind(body.status, confidence, params.id).run();

  await audit(
    env,
    admin,
    `sighting.${body.status}`,
    'sighting',
    params.id,
    `dog=${row.dog_id}`
  );

  return json({ ok: true });
}
