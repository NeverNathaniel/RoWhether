// The source adapters and the bindings a location uses (02, 08 K3). Pure: no
// DOM, no storage, so the Worker can import it too.
import { forecast, airQuality, models } from './openmeteo.js';
import { alerts, obs } from './nws.js';
import { latest, recent, daily } from './usgs.js';
import { riverForecast } from './nwps.js';

// The order requests are made, errors are listed and failures are named.
export const SLOT_ORDER = ['wx', 'alerts', 'obs', 'river', 'flow', 'flowDays', 'flowFcst', 'aq', 'models'];

// A stored row names a provider (01 4.4). Each provider has one fetcher per
// slot, and bindingsFor() derives the fetcher from the row. Exported so a test
// can check every row of a stored record against it.
export const PROVIDERS = {
  'open-meteo': [forecast, airQuality, models],
  'nws-alerts': [alerts],
  'nws-obs': [obs],
  'usgs-ogc': [latest, recent, daily],
  nwps: [riverForecast]
};
// Fetchers by key.
export const ADAPTERS = Object.fromEntries(Object.values(PROVIDERS).flat().map(a => [a.key, a]));
// Forecast, air quality and the models need no row: Open-Meteo at the point (01 4.1).
const IMPLICIT = ['wx', 'aq', 'models'];

const fetcher = (provider, slot) => (PROVIDERS[provider] || []).find(a => a.slot === slot);

// One binding for each slot the location has a source for, in SLOT_ORDER. A
// slot with no source is left out, which is not a failure (01 8.5). A binding
// holds its slot, its fetcher's key, the options and label read from the
// stored rows, the URL (already built) and `parse`, which is all fetchAll needs.
// The texts read a row's note from the row itself (sourceRow in location.js).
export function bindingsFor(loc, now = Date.now()) {
  const out = [];
  for (const slot of SLOT_ORDER) {
    const rows = loc.sources?.[slot] || [];
    // Only the rows a fetcher can read give the binding its ids and its name. An
    // info row is never read for the call (01 4.2); phase 1 draws it in the River view.
    const usable = rows.filter(r => r.mode !== 'info' && fetcher(r.adapter, slot)), row = usable[0];
    // With no rows at all, only the three implicit slots have a source.
    const a = row ? fetcher(row.adapter, slot) : !rows.length && IMPLICIT.includes(slot) ? fetcher('open-meteo', slot) : null;
    if (!a) continue;
    const b = { slot, adapter: a.key, params: a.bind(usable, loc), label: row?.label ?? null };
    b.url = a.url(b, loc, now);
    b.parse = json => a.parse(json, b, loc);
    out.push(b);
  }
  return out;
}

// The slots a refresh in this visit failed for whose last good fetch is older than
// the adapter's staleMs (02, 08 K9), each with that time, or null when it was never
// held. A slot with no failure is not stale, however old: a saved forecast is
// drawn whole at start. A time that cannot be read is not fresh.
export function staleSlots(bindings, fetched, errors, now) {
  const out = new Map();
  for (const b of bindings) {
    const t = fetched?.[b.slot], max = ADAPTERS[b.adapter]?.staleMs;
    if (errors?.[b.slot] && max != null && !(now - t <= max)) out.set(b.slot, t ?? null);
  }
  return out;
}

// What the failure note calls a source: "Could not reach ...". Without a
// binding it names the slot's own source.
export function labelFor(slot, binding) {
  const a = ADAPTERS[binding?.adapter] || Object.values(ADAPTERS).find(x => x.slot === slot);
  return a ? a.label(binding || {}) : slot;
}
