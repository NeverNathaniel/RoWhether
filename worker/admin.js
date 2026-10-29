// The owner's routes, everything under /api/admin/ (P1.18; 03 3.7, 08 7.3). Cloudflare Access
// answers before the Worker runs, and the Worker checks its token again (worker/auth/access.js):
// nothing here answers a request before that check. Until the owner has set Access up, every path
// answers 503 and no one gets in. Phase 2 adds routes here, behind a site role as well.
import { accessConfigured, verifyAccess } from './auth/access.js';
import { clampDays, readMetrics } from './metrics.js';
import { T } from '../src/copy/admin.js';

// Errors are 08 7.2's: { error, message }. Nothing here is kept by a browser or a proxy.
const answer = (status, body, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
const fail = (status, error, message, headers) => answer(status, { error, message }, headers);

// `verify` and `now` are for tests.
export async function handleAdmin(request, env, { verify = verifyAccess, now = Date.now() } = {}) {
  if (!accessConfigured(env)) return fail(503, 'not_configured', T.setup);
  if (!(await verify(request, env))) return fail(403, 'not_allowed', T.signIn);
  const url = new URL(request.url);
  if (request.method !== 'GET') return fail(405, 'method_not_allowed', 'That method is not allowed here.', { Allow: 'GET' });
  if (url.pathname !== '/api/admin/metrics') return fail(404, 'not_found', 'Not found.');
  if (!env.ANALYTICS_SQL) return fail(503, 'not_configured', T.setup);
  try {
    return answer(200, await readMetrics(env, { days: clampDays(url.searchParams.get('days')), now }));
  } catch (e) {
    return fail(502, 'unavailable', 'Could not do that right now. Try again later.');
  }
}
