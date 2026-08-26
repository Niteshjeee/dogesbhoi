export async function verifyTurnstile(request, env, token, ip, expectedAction) {
  const secret = String(env.TURNSTILE_SECRET_KEY || '');
  const response = String(token || '');
  if (!secret || !response || response.length > 2048) return false;

  let requestHost = '';
  try {
    requestHost = new URL(request.url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!requestHost) return false;

  const body = new URLSearchParams({ secret, response });
  if (ip) body.set('remoteip', ip);

  let res;
  try {
    res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return false;
  }

  if (!res.ok) return false;

  let data;
  try {
    data = await res.json();
  } catch {
    return false;
  }

  if (data.success !== true) return false;
  if (expectedAction && data.action !== expectedAction) return false;
  if (String(data.hostname || '').toLowerCase() !== requestHost) return false;
  return true;
}
