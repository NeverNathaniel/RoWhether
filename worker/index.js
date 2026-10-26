// Cloudflare Worker entry. Serves the built app from ./dist and handles the
// API routes: /api/info, /api/suggest, /api/reports and the owner's /api/admin/*.
// Static assets are served first except for /api/* (see run_worker_first in wrangler.jsonc).
import { suggestConfig, handleSuggest } from './suggest.js';
import { listReports, addReport } from './reports.js';
import { handleAdmin } from './admin.js';
import { isSlug } from '../src/location.js';

const notAllowed = allow => new Response('Method not allowed', { status: 405, headers: { Allow: allow } });

// The open counter (07 14.3): the app sends the location it shows ('none' on the picker
// page and the not found page), whether this is a first start here, and whether it runs
// from the home screen. One Analytics Engine point per start, made from those three words
// and the instance name only: no address, user agent, country or account is read. A missing
// or bad word writes nothing.
const FIRST_OR_RETURN = ['first', 'return'], HOME_OR_BROWSER = ['standalone', 'browser'];
function countOpen(env, query) {
  const loc = query.get('loc'), k = query.get('k'), m = query.get('m');
  if (!env.OPENS || !(loc === 'none' || isSlug(loc)) || !FIRST_OR_RETURN.includes(k) || !HOME_OR_BROWSER.includes(m)) return;
  try {
    env.OPENS.writeDataPoint({ indexes: [loc], blobs: [env.APP_ENV || 'production', k, m], doubles: [1] });
  } catch (e) { /* the count is lost, the answer is not */ }
}

// Which instance this is (production or a Preview such as dev) and which
// server features are on, so the app can label itself and hide what is off.
// It counts the start that asks (above).
export function info(env, url) {
  if (url) countOpen(env, url.searchParams);
  return new Response(JSON.stringify({ env: env.APP_ENV || 'production', reports: !!env.DB }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), { pathname } = url;
    if (pathname === '/api/info') return request.method === 'GET' ? info(env, url) : notAllowed('GET');
    if (pathname === '/api/suggest') {
      if (request.method === 'GET') return suggestConfig(env);
      if (request.method === 'POST') return handleSuggest(request, env);
      return notAllowed('GET, POST');
    }
    if (pathname === '/api/reports') {
      if (request.method === 'GET') return listReports(env);
      if (request.method === 'POST') return addReport(request, env);
      return notAllowed('GET, POST');
    }
    if (pathname.startsWith('/api/admin/')) return handleAdmin(request, env);
    if (pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  }
};
