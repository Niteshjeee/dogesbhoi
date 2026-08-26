import { json, unauthorized } from '../../../server/http.js';
import { verifySession } from '../../../server/auth.js';
export async function onRequestGet({ request, env }) {
  if (!await verifySession(request, env.SESSION_SECRET)) return unauthorized();
  const { results } = await env.DB.prepare(`
    SELECT s.id,s.dog_id,d.name dog_name,s.latitude,s.longitude,s.accuracy_m,s.condition,s.note,s.confidence,s.moderation_status,s.risk_reason,s.created_at
    FROM sightings s JOIN dogs d ON d.id=s.dog_id
    ORDER BY CASE s.moderation_status WHEN 'review' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END, s.created_at DESC LIMIT 200
  `).all();
  return json({ sightings: results });
}
