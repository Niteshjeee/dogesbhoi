import { badRequest, forbidden, json, readJson, sameOrigin, cleanText, unauthorized, notFound } from '../../../../server/http.js';
import { verifySession } from '../../../../server/auth.js';

export async function onRequestPut({ request, env, params }) {
  if (!sameOrigin(request)) return forbidden();
  if (!await verifySession(request, env.SESSION_SECRET)) return unauthorized();
  const current = await env.DB.prepare('SELECT id FROM dogs WHERE id=?').bind(params.id).first();
  if (!current) return notFound();
  let body;
  try { body = await readJson(request, 350_000); } catch { return badRequest('Invalid request'); }
  const name = cleanText(body.name,60);
  if (!name) return badRequest('Name required');
  const sex = ['male','female','unknown'].includes(body.sex) ? body.sex : 'unknown';
  const vaccination = ['yes','no','unknown'].includes(body.vaccinationStatus) ? body.vaccinationStatus : 'unknown';
  const sterilized = ['yes','no','unknown'].includes(body.sterilizedStatus) ? body.sterilizedStatus : 'unknown';
  const active = body.active === false ? 0 : 1;
  await env.DB.prepare(`UPDATE dogs SET name=?,sex=?,color=?,area=?,description=?,vaccination_status=?,sterilized_status=?,active=?,updated_at=? WHERE id=?`)
    .bind(name,sex,cleanText(body.color,60),cleanText(body.area,100),cleanText(body.description,500),vaccination,sterilized,active,Date.now(),params.id).run();
  return json({ ok:true });
}
