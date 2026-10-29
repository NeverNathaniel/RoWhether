// A fetch for the tests that run a curation script as a person does:
// node --import <this file> scripts/check-sources.mjs putney-landing. Nothing reaches the
// network.
//   STUB_FETCH=down      every request fails, as with no connection
//   STUB_FETCH=fixtures  Putney's nine sources answer from test/fixtures/sources/, and its
//                        gauge's ten years of daily means from usgs-01154500-daily.json
//                        (for the request flowstats.mjs makes, and only for that gauge).
//                        Any other request is a 404.
// Each request writes a line of JSON to stderr: { url, ua, origin }.
import { readFileSync } from 'node:fs';

const read = name => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

// The USGS answer for the daily means of the request in the fixture: a feature for each day
// with a value, the value as text.
function dailyMeans() {
  const fx = read('usgs-01154500-daily.json');
  const day = i => new Date(Date.parse(`${fx.from}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10);
  return { type: 'FeatureCollection', features: fx.values.flatMap((v, i) => (v === null ? [] : [{ properties: { time: day(i), value: String(v) } }])) };
}

function answer(u) {
  const q = u.searchParams, path = u.pathname;
  switch (u.hostname) {
    case 'api.open-meteo.com': return path === '/v1/forecast' ? read(q.has('models') ? 'sources/models.json' : 'sources/wx.json') : null;
    case 'air-quality-api.open-meteo.com': return path === '/v1/air-quality' ? read('sources/aq.json') : null;
    case 'api.weather.gov':
      if (path === '/alerts/active') return read('sources/alerts.json');
      return path === '/stations/KEEN/observations/latest' ? read('sources/obs.json') : null;
    case 'api.water.noaa.gov': return path === '/nwps/v1/gauges/WLPN3/stageflow/forecast' ? read('sources/flowFcst.json') : null;
    case 'api.waterdata.usgs.gov': {
      if (q.get('monitoring_location_id') !== 'USGS-01154500' && !path.endsWith('/latest-continuous/items')) return null;
      if (path.endsWith('/latest-continuous/items')) return read('sources/river.json');
      if (path.endsWith('/collections/continuous/items')) return read('sources/flow.json');
      if (!path.endsWith('/collections/daily/items')) return null;
      // flowstats.mjs asks for a window of dates, check-sources.mjs for the last 30 days.
      return /^\d{4}-01-01\/\d{4}-\d\d-\d\d$/.test(q.get('time')) && q.get('limit') === '10000' && q.get('statistic_id') === '00003' && q.get('parameter_code') === '00060' ? dailyMeans() : q.get('time') === 'P30D' ? read('sources/flowDays.json') : null;
    }
    default: return null;
  }
}

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url), h = init.headers || {};
  process.stderr.write(`${JSON.stringify({ url: u.href, ua: h['User-Agent'] ?? null, origin: h.Origin ?? null })}\n`);
  if (process.env.STUB_FETCH === 'down') throw new TypeError('fetch failed');
  const body = process.env.STUB_FETCH === 'fixtures' ? answer(u) : null;
  return body ? new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } }) : new Response('Not found', { status: 404 });
};
