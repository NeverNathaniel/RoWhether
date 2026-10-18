// Check a Turnstile token with Cloudflare's siteverify API. The token must
// have been made for this action, so one form's token cannot pass for another's.
export async function verifyTurnstile(env, token, ip, action = 'suggest') {
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip || '' })
    });
    if (!r.ok) return false;
    const result = await r.json();
    return result.success === true && result.action === action;
  } catch {
    return false;
  }
}
