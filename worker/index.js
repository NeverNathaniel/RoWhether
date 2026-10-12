// Cloudflare Worker entry. Serves the built app from ./dist and handles the
// one API route, /api/suggest. Static assets are served first except for
// /api/* (see run_worker_first in wrangler.jsonc).
import { suggestConfig, handleSuggest } from './suggest.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/suggest') {
      if (request.method === 'GET') return suggestConfig(env);
      if (request.method === 'POST') return handleSuggest(request, env);
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, POST' } });
    }
    if (pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  }
};
