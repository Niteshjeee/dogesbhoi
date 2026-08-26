import { badRequest, forbidden, json, readJson, sameOrigin, unauthorized, notFound } from '../../../../server/http.js';
import { verifySession } from '../../../../server/auth.js';
export async function onRequestPatch({ request, env, params }) {
  if (!sameOrigin(request)) return forbidden();
  if (!await verifySession(request, env.SESSION_SECRET)) return unauthorized();
  const row = await env.DB.prepare('SELECT id FROM sightings WHERE id=?').bind(params.id).first();
  if (!row) return notFound();
  let body;
  try { body = await readJson(request, 5000); } catch { return badRequest('Invalid request'); }
  if (!['accepted','review','rejected'].includes(body.status)) return badRequest('Invalid status');
  const confidence = body.status === 'rejected' ? 'low' : (['high','medium','low'].includes(body.confidence) ? body.confidence : 'medium');
  await env.DB.prepare('UPDATE sightings SET moderation_status=?,confidence=? WHERE id=?').bind(body.status,confidence,params.id).run();
  return json({ ok:true });
}
