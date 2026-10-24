// What the browser specs share: answering every upstream request from the
// golden fixtures, and waiting until the home screen has drawn.
//
// The responses come from test/fixtures/golden.js, the same ones the golden
// cases use, so a screenshot and a golden file describe the same data. The
// app's own parsers run on them in the browser.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { SCENARIOS } from '../fixtures/golden.js';

export { SCENARIOS };

// Open-Meteo's town search as recorded for "Worcester" (test/fixtures/sources/). Any other
// name has no match, which the host answers with no `results`.
const WORCESTER = JSON.parse(readFileSync(new URL('../fixtures/sources/geocode-worcester.json', import.meta.url), 'utf8'));

// Which response each upstream request gets, by host and path. The wx and
// models requests share one path (the forecast endpoint) and differ only in the
// models parameter, so that one is told apart by the query.
const UPSTREAM = {
  'api.open-meteo.com': {
    '/v1/forecast': (raw, url) => (url.searchParams.has('models') ? raw.models : raw.wx)
  },
  'air-quality-api.open-meteo.com': { '/v1/air-quality': raw => raw.aq },
  'api.weather.gov': {
    '/alerts/active': raw => raw.alerts,
    '/stations/KEEN/observations/latest': raw => raw.obs
  },
  'api.waterdata.usgs.gov': {
    '/ogcapi/v1/collections/latest-continuous/items': raw => raw.river,
    '/ogcapi/v1/collections/continuous/items': raw => raw.flow,
    '/ogcapi/v1/collections/daily/items': raw => raw.flowDays
  },
  'api.water.noaa.gov': {
    '/nwps/v1/gauges/WLPN3/stageflow/forecast': raw => raw.flowFcst
  },
  'geocoding-api.open-meteo.com': {
    '/v1/search': (raw, url) => (/^worcester$/i.test(url.searchParams.get('name') || '') ? WORCESTER : { generationtime_ms: 0.05 })
  }
};

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);
const CORS = { 'access-control-allow-origin': '*' };

// Route every request the page makes.
//   scenario  an entry of SCENARIOS (test/fixtures/golden.js)
//   clock     the moment the page's Date is pinned to; the fixtures are cut there
//   options   { abort: true } aborts the upstream hosts instead (every source blocked)
// The preview server's own origin passes through, except /api/*, which answers
// 404 as a static host does (so /api/info and /api/suggest report "not here").
// Any other external host aborts. Returns the requests seen, for assertions.
export async function routeAll(page, scenario, clock, { abort = false } = {}) {
  const raw = scenario.raw(clock);
  const seen = { served: [], aborted: [], missing: [] };
  await page.route(/.*/, route => {
    const req = route.request();
    const url = new URL(req.url());
    if (LOCAL.has(url.hostname)) {
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
      return route.continue();
    }
    const table = UPSTREAM[url.hostname];
    if (req.method() === 'OPTIONS' && table) {
      return route.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-methods': 'GET', 'access-control-allow-headers': '*' } });
    }
    const pick = !abort && table && table[url.pathname];
    if (!pick) {
      (table && !abort ? seen.missing : seen.aborted).push(url.href);
      return route.abort('failed');
    }
    seen.served.push(url.href);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(pick(raw, url)) });
  });
  return seen;
}

// Wait until the home screen has drawn what the fixtures gave it: a verdict
// word, a finished refresh, and the web fonts.
export async function ready(page) {
  await page.waitForFunction(() => {
    const verdict = document.getElementById('verdict');
    const updated = document.getElementById('updated');
    const refresh = document.getElementById('refreshBtn');
    return verdict && verdict.textContent.trim() !== '' &&
      updated && /^(Updated|Saved|Not loaded)/.test(updated.textContent) &&
      refresh && !refresh.disabled;
  });
  await page.evaluate(() => document.fonts.ready);
}

// Wait until a tab has drawn. The detail views are a lazy chunk (P1.2a), so a
// page opened at #wind says "Loading." first. #detailBody takes data-view only
// once the module for that view has drawn it.
export function tabDrawn(page, key) {
  return page.waitForSelector(`#detailBody[data-view="${key}"]`, { state: 'attached' });
}

// The golden capture, loaded in Node through Vite's own module loader, once per
// worker. Playwright's loader cannot import the JSON files that src/putney.js
// reads. It gives the specs the golden inputs and what the code computes from them.
let loaded;
export function loadCapture() {
  loaded ??= (async () => {
    const vite = await createServer({ configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } });
    try { return await vite.ssrLoadModule('/test/golden/capture.js'); } finally { await vite.close(); }
  })();
  return loaded;
}

// Every upstream request left unanswered, until release() aborts them. Registered
// after routeAll(), so it takes the request first. With `only`, it holds the first
// `only` requests and lets the rest on to the fixtures, so a second location's
// answers can arrive while the first one's are still out.
const UPSTREAM_HOSTS = Object.keys(UPSTREAM);
export async function hold(page, only = Infinity) {
  const held = [];
  await page.route(url => UPSTREAM_HOSTS.includes(url.hostname), route => {
    if (held.length < only) held.push(route); else route.fallback();
  });
  // release(n) aborts the first n held requests, or all of them.
  return { held, release: (n = held.length) => Promise.all(held.splice(0, n).map(r => r.abort('failed').catch(() => {}))) };
}
