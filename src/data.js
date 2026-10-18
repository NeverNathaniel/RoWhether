// Fetch from the keyless public APIs. The parsers live with their adapters in
// src/sources/ and are re-exported here under their old names.
import { SRC } from './config.js';
import { alertLevel, speedToMph, parseAlerts, parseObs } from './sources/nws.js';
import { parseRiver, parseFlow, parseFlowDays } from './sources/usgs.js';
import { parseFlowForecast } from './sources/nwps.js';
import { parseAQ, parseModels } from './sources/openmeteo.js';

export { alertLevel, speedToMph, parseAlerts, parseObs, parseRiver, parseFlow, parseFlowDays, parseFlowForecast, parseAQ, parseModels };

export async function fetchJSON(url, ms = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

const PARSE = { wx: d => d, alerts: parseAlerts, obs: parseObs, river: parseRiver, flow: parseFlow, flowDays: parseFlowDays, flowFcst: parseFlowForecast, aq: parseAQ, models: parseModels };

// Fetch every source in parallel. Each one fails on its own.
// Returns { data, errors } where data holds only the sources that succeeded.
export async function fetchAll() {
  const keys = Object.keys(SRC);
  const res = await Promise.allSettled(keys.map(k => fetchJSON(SRC[k]()).then(PARSE[k])));
  const data = {}, errors = {};
  res.forEach((r, i) => {
    const k = keys[i];
    if (r.status === 'fulfilled') data[k] = r.value;
    else { errors[k] = true; console.warn(k, r.reason); }
  });
  return { data, errors };
}
