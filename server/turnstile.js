export async function verifyTurnstile(secret, token, ip, expectedAction) {
  if (!secret || !token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  if (!res.ok) return false;
  const data = await res.json();
  if (data.success !== true) return false;
  if (expectedAction && data.action !== expectedAction) return false;
  return true;
}
