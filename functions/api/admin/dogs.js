import {
  badRequest,
  forbidden,
  json,
  readJson,
  sameOrigin,
  cleanText,
  unauthorized
} from '../../../server/http.js';
import { getAdmin } from '../../../server/authz.js';
import { audit } from '../../../server/audit.js';

export async function onRequestGet({ request, env }) {
  const admin = await getAdmin(request, env);
  if (!admin) return unauthorized();

  const { results } = await env.DB.prepare(`
    SELECT id,name,sex,color,area,
           vaccination_status,sterilized_status,
           active,created_at,updated_at
    FROM dogs
    ORDER BY created_at DESC
    LIMIT 300
  `).all();

  return json({ dogs: results });
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return forbidden();

  const admin = await getAdmin(request, env);
  if (!admin) return unauthorized();

  let body;
  try {
    body = await readJson(request, 350_000);
  } catch {
    return badRequest('Invalid request');
  }

  const name = cleanText(body.name, 60);
  if (!name) return badRequest('Name is required');

  const sex = ['male','female','unknown'].includes(body.sex)
    ? body.sex : 'unknown';
  const vaccination = ['yes','no','unknown'].includes(body.vaccinationStatus)
    ? body.vaccinationStatus : 'unknown';
  const sterilized = ['yes','no','unknown'].includes(body.sterilizedStatus)
    ? body.sterilizedStatus : 'unknown';

  const photoData = String(body.photoData || '');
  if (
    photoData &&
    (
      !photoData.startsWith('data:image/webp;base64,') ||
      photoData.length > 220_000
    )
  ) {
    return badRequest('Photo must be compressed WebP under about 160 KB');
  }

  const id = `DG-${crypto.randomUUID()}`;
  const now = Date.now();

  await env.DB.prepare(`
    INSERT INTO dogs(
      id,name,sex,color,area,description,
      vaccination_status,sterilized_status,
      photo_data,active,created_at,updated_at
    )
    VALUES(?,?,?,?,?,?,?,?,?,1,?,?)
  `).bind(
    id,
    name,
    sex,
    cleanText(body.color, 60),
    cleanText(body.area, 100),
    cleanText(body.description, 500),
    vaccination,
    sterilized,
    photoData,
    now,
    now
  ).run();

  await audit(env, admin, 'dog.create', 'dog', id, name);

  return json({ ok: true, dog: { id, name } }, 201);
}
