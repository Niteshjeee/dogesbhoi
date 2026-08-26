import { json } from '../../server/http.js';

export async function onRequestGet({ env }) {
  return json({
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || ''
  });
}
