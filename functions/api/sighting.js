import { badRequest, forbidden, json, readJson, sameOrigin, cleanText } from '../../server/http.js';
import { verifyTurnstile } from '../../server/turnstile.js';
import { hashReporter } from '../../server/crypto.js';
import { assessSighting, distanceKm } from '../../server/risk.js';

const CONDITIONS = new Set(['seen','safe','injured','hungry','with_puppies','afraid','needs_help']);

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return forbidden();
  let body;
  try { body = await readJson(request, 16_000); } catch { return badRequest('Invalid request'); }

  const dogId = cleanText(body.dogId, 80);
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const accuracy = Number(body.accuracy);
  const condition = CONDITIONS.has(body.condition) ? body.condition : 'seen';
  const note = cleanText(body.note, 250);
  if (!dogId || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 5000) return badRequest('Invalid location');

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const okHuman = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, body.turnstileToken, ip, 'sighting');
  if (!okHuman) return badRequest('Human verification failed');

  const dog = await env.DB.prepare('SELECT id FROM dogs WHERE id=? AND active=1').bind(dogId).first();
  if (!dog) return badRequest('Unknown dog');

  if (!env.IP_HASH_SECRET) return json({ error: 'Server security is not configured' }, 503);
  const reporterHash = await hashReporter(env.IP_HASH_SECRET, ip, request.headers.get('user-agent') || '');
  const tenMinAgo = Date.now() - 10 * 60_000;
  const oneHourAgo = Date.now() - 60 * 60_000;
  const perDog = await env.DB.prepare('SELECT COUNT(*) c FROM sightings WHERE reporter_hash=? AND dog_id=? AND created_at>?').bind(reporterHash, dogId, tenMinAgo).first();
  const global = await env.DB.prepare('SELECT COUNT(*) c FROM sightings WHERE reporter_hash=? AND created_at>?').bind(reporterHash, oneHourAgo).first();
  if (Number(perDog?.c || 0) >= 3 || Number(global?.c || 0) >= 20) return json({ error: 'Too many reports. Please try later.' }, 429);

  const previous = await env.DB.prepare(`SELECT latitude,longitude,created_at,reporter_hash FROM sightings WHERE dog_id=? AND moderation_status='accepted' ORDER BY created_at DESC LIMIT 1`).bind(dogId).first();
  let corroborator = false;
  if (previous && previous.reporter_hash !== reporterHash && Date.now() - previous.created_at < 6 * 60 * 60_000) {
    corroborator = distanceKm(previous.latitude, previous.longitude, latitude, longitude) <= 0.5;
  }
  const risk = assessSighting({ latitude, longitude, accuracy, previous, corroborator });
  const id = `S-${crypto.randomUUID()}`;
  const createdAt = Date.now();
  await env.DB.prepare(`INSERT INTO sightings(id,dog_id,latitude,longitude,accuracy_m,condition,note,confidence,moderation_status,risk_reason,reporter_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id,dogId,latitude,longitude,Math.round(accuracy),condition,note,risk.confidence,risk.status,risk.reasons.join(','),reporterHash,createdAt).run();

  return json({ ok: true, sighting: { id, moderationStatus: risk.status, confidence: risk.confidence, createdAt } }, 201);
}
