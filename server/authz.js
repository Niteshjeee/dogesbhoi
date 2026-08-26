import { readSession } from './session.js';

export async function getAdmin(request, env) {
  const payload = await readSession(request, env.SESSION_SECRET);
  if (!payload || !env.DB) return null;
  const admin = await env.DB.prepare(`
    SELECT id,username,role,active,session_version,created_at,last_login_at
    FROM admins WHERE id=? LIMIT 1
  `).bind(payload.aid).first();
  if (!admin || Number(admin.active) !== 1) return null;
  if (Number(admin.session_version) !== Number(payload.sv)) return null;
  return admin;
}

export async function getOwner(request, env) {
  const admin = await getAdmin(request, env);
  return admin?.role === 'owner' ? admin : null;
}
