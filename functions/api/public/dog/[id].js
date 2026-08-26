import { json, notFound } from '../../../../server/http.js';

export async function onRequestGet({ env, params }) {
  const dog = await env.DB.prepare(`
    SELECT id,name,sex,color,area,description,
           vaccination_status,sterilized_status,
           photo_data,created_at
    FROM dogs
    WHERE id=? AND active=1
    LIMIT 1
  `).bind(params.id).first();

  if (!dog) return notFound('Dog not found');

  const { results } = await env.DB.prepare(`
    SELECT id,latitude,longitude,accuracy_m,
           condition,note,confidence,created_at
    FROM sightings
    WHERE dog_id=?
      AND moderation_status='accepted'
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(params.id).all();

  return json({ dog, sightings: results });
}
