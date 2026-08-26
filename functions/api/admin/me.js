import { json, unauthorized } from '../../../server/http.js';
import { verifySession } from '../../../server/auth.js';
export async function onRequestGet({ request, env }) {
  if (!await verifySession(request, env.SESSION_SECRET)) return unauthorized();
  return json({ authenticated: true, username: env.ADMIN_USERNAME || 'admin' });
}
