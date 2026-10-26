// Cloudflare Access in front of the owner's routes (P1.18; 03 3.7). Access answers before the
// Worker runs and puts a signed token in Cf-Access-Jwt-Assertion. The Worker checks it as well:
// the signature against the team's published keys, the issuer (the team) and the audience (this
// application's AUD tag). Until the owner has set both values, nothing is accepted.
import { createRemoteJWKSet, jwtVerify } from 'jose';

// The owner's values start as OWNER-SETS-... placeholders in wrangler.jsonc (plan 11).
const set = v => typeof v === 'string' && v.trim() !== '' && !v.trim().startsWith('OWNER-SETS');
export const accessConfigured = env => set(env.ACCESS_TEAM_DOMAIN) && set(env.ACCESS_AUD);

// "team.cloudflareaccess.com", or the same with https:// and a slash, as https://team.cloudflareaccess.com.
const issuer = env => `https://${env.ACCESS_TEAM_DOMAIN.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;

// A team's key set is fetched once and kept for the life of the isolate (jose refreshes it as keys rotate).
const keySets = new Map();
const keysFor = iss => keySets.get(iss) || keySets.set(iss, createRemoteJWKSet(new URL(`${iss}/cdn-cgi/access/certs`))).get(iss);

// The token's claims when the request carries a token Access signed for this application, else null.
// `jwks` stands in for the team's key set, for tests.
export async function verifyAccess(request, env, { jwks } = {}) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !accessConfigured(env)) return null;
  const iss = issuer(env);
  try {
    return (await jwtVerify(token, jwks || keysFor(iss), { issuer: iss, audience: env.ACCESS_AUD.trim() })).payload;
  } catch (e) {
    return null;
  }
}
