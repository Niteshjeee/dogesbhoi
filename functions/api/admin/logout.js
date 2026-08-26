import { forbidden, json, sameOrigin } from '../../../server/http.js';
import { clearSessionCookie } from '../../../server/session.js';

export async function onRequestPost({ request }) {
  if (!sameOrigin(request)) return forbidden();
  return json(
    { ok: true },
    200,
    { 'set-cookie': clearSessionCookie() }
  );
}
