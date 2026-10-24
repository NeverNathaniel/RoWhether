// USGS water data adapters (OGC API): the latest readings, the last 48 hours of
// flow and 30 days of daily means. Pure: no DOM, no storage.
import { HOUR } from '../config.js';
const USGS_OGC = 'https://api.waterdata.usgs.gov/ogcapi/v1';
const HOST = 'https://api.waterdata.usgs.gov';
// Discharge in cfs and water temperature in °C.
const Q = '00060', TEMP = '00010';

export function parseRiver(d, b) {
  const { flow, temp } = b.params;
  const out = {};
  // A gauge can list several series for one parameter, some of them ended years
  // ago: the newest reading is kept, and the later one when two share a time.
  const put = (k, v, t) => { if (!(out[k]?.t > t)) out[k] = { v, t }; };
  for (const f of d.features || []) {
    const p = f.properties || {};
    const v = parseFloat(p.value), t = Date.parse(p.time);
    if (isNaN(v) || !p.monitoring_location_id) continue;
    if (p.monitoring_location_id === flow && p.parameter_code === Q) put('flow', v, t);
    if (p.monitoring_location_id === temp && p.parameter_code === TEMP) put('waterC', v, t);
  }
  return out;
}
export function parseFlow(d) {
  return (d.features || [])
    .map(f => ({ t: Date.parse(f.properties.time), v: parseFloat(f.properties.value) }))
    .filter(x => !isNaN(x.t) && !isNaN(x.v))
    .sort((a, b) => a.t - b.t);
}

// The zone's offset from UTC at a time, in ms, read from its own name for it
// ("GMT-04:00"; plain "GMT" is none).
const offsetIn = tz => {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' });
  return t => {
    const m = /([+\-\u2212])(\d\d):(\d\d)/.exec(f.formatToParts(t).find(p => p.type === 'timeZoneName').value);
    return m ? (m[1] === '+' ? 1 : -1) * (m[2] * 60 + +m[3]) * 6e4 : 0;
  };
};

// Daily mean flow. Dates are local days in the gauge's zone, which the binding names
// (`params.tz`: the flow row's, else the location's); each point sits at local noon.
// The zone's offset is read at 12:00 UTC that day, then again at the first answer, so a
// day the clocks change is right in a zone east of UTC as well as west. There is no
// default zone: Intl would take the device's.
export function parseFlowDays(d, b) {
  const features = d.features || [], tz = b?.params?.tz;
  if (features.length && !tz) throw new Error('parseFlowDays needs a time zone.');
  const off = features.length && offsetIn(tz);
  return features
    .map(f => {
      const t0 = Date.parse(`${f.properties.time}T12:00:00Z`);
      return { t: isNaN(t0) ? NaN : t0 - off(t0 - off(t0)), v: parseFloat(f.properties.value) };
    })
    .filter(x => !isNaN(x.t) && !isNaN(x.v))
    .sort((a, b) => a.t - b.t);
}

// One flow row (the waterway's gauge) serves the latest value, the 48 hour
// series and the daily means; `river` also reads the water temperature row.
const flowId = rows => ({ id: rows[0].ref });
// The daily means also need the zone the gauge's days are in.
const dayId = (rows, loc) => ({ ...flowId(rows), tz: rows[0].tz || loc.tz });

export const latest = {
  key: 'usgs-latest', slot: 'river', regions: ['US'], via: 'browser', hosts: [HOST],
  refreshMs: null, staleMs: 24 * HOUR,
  bind: rows => ({ flow: rows.find(r => r.role === 'flow')?.ref, temp: rows.find(r => r.role === 'water_temp')?.ref }),
  // The flow gauge first, then the temperature gauge, and each one's parameter. A
  // gauge that serves both is listed once. Without `limit` the service answers
  // 10 readings at most, and a gauge can list more series than that.
  url: b => {
    const have = [[b.params.flow, Q], [b.params.temp, TEMP]].filter(g => g[0]);
    return `${USGS_OGC}/collections/latest-continuous/items?monitoring_location_id=${[...new Set(have.map(g => g[0]))].join(',')}&parameter_code=${have.map(g => g[1]).join(',')}&f=json&limit=50`;
  },
  parse: parseRiver,
  label: () => 'USGS river gauges'
};

export const recent = {
  key: 'usgs-recent', slot: 'flow', regions: ['US'], via: 'browser', hosts: [HOST],
  refreshMs: null, staleMs: 24 * HOUR,
  bind: flowId,
  url: b => `${USGS_OGC}/collections/continuous/items?monitoring_location_id=${b.params.id}&parameter_code=${Q}&time=P2D&limit=1000&properties=time,value&f=json`,
  parse: parseFlow,
  label: () => 'USGS flow history'
};

export const daily = {
  key: 'usgs-daily', slot: 'flowDays', regions: ['US'], via: 'browser', hosts: [HOST],
  refreshMs: null, staleMs: 7 * 24 * HOUR,
  bind: dayId,
  url: b => `${USGS_OGC}/collections/daily/items?monitoring_location_id=${b.params.id}&parameter_code=${Q}&statistic_id=00003&time=P30D&limit=100&properties=time,value&f=json`,
  parse: parseFlowDays,
  label: () => 'USGS daily flow'
};
