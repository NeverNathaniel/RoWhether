// Cloudflare Worker entry. Serves the built app from ./dist and handles the
// API routes: /api/info, /api/suggest and /api/reports. Static assets are
// served first except for /api/* (see run_worker_first in wrangler.jsonc).
import { suggestConfig, handleSuggest } from './suggest.js';
import { listReports, addReport } from './reports.js';

const notAllowed = allow => new Response('Method not allowed', { status: 405, headers: { Allow: allow } });

// Which instance this is (production or a Preview such as dev) and which
// server features are on, so the app can label itself and hide what is off.
export function info(env) {
  return new Response(JSON.stringify({ env: env.APP_ENV || 'production', reports: !!env.DB }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/info') return request.method === 'GET' ? info(env) : notAllowed('GET');
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
    if (pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  }
};
