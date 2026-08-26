function allowedHosts(env) {
  return new Set(
    String(env.TURNSTILE_HOSTNAMES || '')
      .split(',')
      .map(v => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function verifyTurnstile(env, token, ip, expectedAction) {
  const secret = String(env.TURNSTILE_SECRET_KEY || '');
  const response = String(token || '');
  const hosts = allowedHosts(env);
  if (!secret || !response || response.length > 2048 || hosts.size === 0) return false;

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
  try { data = await res.json(); } catch { return false; }
  if (data.success !== true) return false;
  if (expectedAction && data.action !== expectedAction) return false;
  if (!hosts.has(String(data.hostname || '').toLowerCase())) return false;
  return true;
}
