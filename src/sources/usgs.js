// USGS water data adapters (OGC API): the latest readings, the last 48 hours of
// flow and 30 days of daily means. Pure: no DOM, no storage.
const USGS_OGC = 'https://api.waterdata.usgs.gov/ogcapi/v0';
const HOST = 'https://api.waterdata.usgs.gov';
// Discharge in cfs and water temperature in °C.
const Q = '00060', TEMP = '00010';

// Putney's gauges, for a caller with no binding yet (until P0.8).
const PUTNEY_GAUGES = { params: { flow: 'USGS-01154500', temp: 'USGS-01161280' } };

export function parseRiver(d, b = PUTNEY_GAUGES) {
  const { flow, temp } = b.params;
  const out = {};
  for (const f of d.features || []) {
    const p = f.properties || {};
    const v = parseFloat(p.value), t = Date.parse(p.time);
    if (isNaN(v) || !p.monitoring_location_id) continue;
    if (p.monitoring_location_id === flow && p.parameter_code === Q) out.flow = { v, t };
    if (p.monitoring_location_id === temp && p.parameter_code === TEMP) out.waterC = { v, t };
  }
  return out;
}
export function parseFlow(d) {
  return (d.features || [])
    .map(f => ({ t: Date.parse(f.properties.time), v: parseFloat(f.properties.value) }))
    .filter(x => !isNaN(x.t) && !isNaN(x.v))
    .sort((a, b) => a.t - b.t);
}

// Daily mean flow. Dates are local days; each point sits at noon Eastern
// (16:00 UTC is noon EDT, 11 AM EST, close enough for a daily point).
export function parseFlowDays(d) {
  return (d.features || [])
    .map(f => ({ t: Date.parse(`${f.properties.time}T16:00:00Z`), v: parseFloat(f.properties.value) }))
    .filter(x => !isNaN(x.t) && !isNaN(x.v))
    .sort((a, b) => a.t - b.t);
}

// One flow row (the waterway's gauge) serves the latest value, the 48 hour
// series and the daily means; `river` also reads the water temperature row.
const flowId = rows => ({ id: rows[0].ref });

export const latest = {
  key: 'usgs-latest', slot: 'river', regions: ['US'], via: 'browser', hosts: [HOST],
  refreshMs: null, staleMs: null,
  bind: rows => ({ flow: rows.find(r => r.role === 'flow')?.ref, temp: rows.find(r => r.role === 'water_temp')?.ref }),
  // The flow gauge first, then the temperature gauge, and each one's parameter.
  url: b => {
    const have = [[b.params.flow, Q], [b.params.temp, TEMP]].filter(g => g[0]);
    return `${USGS_OGC}/collections/latest-continuous/items?monitoring_location_id=${have.map(g => g[0]).join(',')}&parameter_code=${have.map(g => g[1]).join(',')}&f=json`;
  },
  parse: parseRiver,
  label: () => 'USGS river gauges'
};

export const recent = {
  key: 'usgs-recent', slot: 'flow', regions: ['US'], via: 'browser', hosts: [HOST],
  refreshMs: null, staleMs: null,
  bind: flowId,
  url: b => `${USGS_OGC}/collections/continuous/items?monitoring_location_id=${b.params.id}&parameter_code=${Q}&time=P2D&limit=1000&properties=time,value&f=json`,
  parse: parseFlow,
  label: () => 'USGS flow history'
};

export const daily = {
  key: 'usgs-daily', slot: 'flowDays', regions: ['US'], via: 'browser', hosts: [HOST],
  refreshMs: null, staleMs: null,
  bind: flowId,
  url: b => `${USGS_OGC}/collections/daily/items?monitoring_location_id=${b.params.id}&parameter_code=${Q}&statistic_id=00003&time=P30D&limit=100&properties=time,value&f=json`,
  parse: parseFlowDays,
  label: () => 'USGS daily flow'
};
