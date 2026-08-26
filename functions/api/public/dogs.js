import { json } from '../../../server/http.js';
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(`
    SELECT d.id,d.name,d.sex,d.color,d.area,d.vaccination_status,d.sterilized_status,
      (SELECT s.created_at FROM sightings s WHERE s.dog_id=d.id AND s.moderation_status='accepted' ORDER BY s.created_at DESC LIMIT 1) AS last_seen_at
    FROM dogs d WHERE d.active=1 ORDER BY COALESCE(last_seen_at,d.created_at) DESC LIMIT 100
  `).all();
  return json({ dogs: results });
}
