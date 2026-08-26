import { json, unauthorized } from '../../../server/http.js';
import { getAdmin } from '../../../server/authz.js';

export async function onRequestGet({ request, env }) {
  const admin = await getAdmin(request, env);
  if (!admin) return unauthorized();

  return json({
    authenticated: true,
    admin: {
      id: admin.id,
      username: admin.username,
      role: admin.role
    }
  });
}
