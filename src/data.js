// Fetch from the keyless public APIs. The parsers live with their adapters in
// src/sources/ and are re-exported here under their old names.
import { bindingsFor } from './sources/index.js';
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

// Fetch every source the location has, in parallel. Each one fails on its own.
// Returns { data, errors } keyed by slot, where data holds only the sources
// that succeeded, so a failed one never overwrites the last good copy.
export async function fetchAll(loc) {
  const bs = bindingsFor(loc);
  const res = await Promise.allSettled(bs.map(b => fetchJSON(b.url).then(json => b.parse(json, b))));
  const data = {}, errors = {};
  res.forEach((r, i) => {
    const k = bs[i].slot;
    if (r.status === 'fulfilled') data[k] = r.value;
    else { errors[k] = true; console.warn(k, r.reason); }
  });
  return { data, errors };
}
