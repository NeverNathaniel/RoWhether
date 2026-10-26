// NWS National Water Prediction Service adapter: the river forecast for a
// gauge, and the tide forecast of a tidal point. Pure: no DOM, no storage.
import { HOUR } from '../config.js';

// NWS stage and flow forecast. Flow is the secondary series, usually in kcfs.
// Missing values come as -999.
export function parseFlowForecast(d) {
  const k = /kcfs/i.test(d.secondaryUnits || '') ? 1000 : 1;
  const pts = (d.data || [])
    .map(p => ({ t: Date.parse(p.validTime), v: typeof p.secondary === 'number' && p.secondary >= 0 ? p.secondary * k : NaN }))
    .filter(x => !isNaN(x.t) && !isNaN(x.v))
    .sort((a, b) => a.t - b.t);
  return { issued: Date.parse(d.issuedTime) || null, pts };
}

export const riverForecast = {
  key: 'nwps-forecast', slot: 'flowFcst', regions: ['US'], via: 'browser', hosts: ['https://api.water.noaa.gov'],
  refreshMs: null, staleMs: 24 * HOUR,
  bind: ([row]) => ({ lid: row.ref }),
  url: b => `https://api.water.noaa.gov/nwps/v1/gauges/${b.params.lid}/stageflow/forecast`,
  parse: parseFlowForecast,
  label: () => 'the NWS river forecast'
};

// NWS tide forecast: hourly heights as the primary series, flow missing (-999). Heights
// are rounded to a tenth, so a turn often holds two equal hours: the high or low is the
// middle of that run. The first and last points have a neighbour on one side only.
export function parseTide(d, b) {
  if (!/tide/i.test(d.primaryName || '')) throw new Error('Not a tide forecast');
  const s = (d.data || [])
    .map(p => ({ t: Date.parse(p.validTime), h: typeof p.primary === 'number' && p.primary > -900 ? p.primary : NaN }))
    .filter(x => !isNaN(x.t) && !isNaN(x.h))
    .sort((a, b) => a.t - b.t);
  const events = [];
  for (let i = 1, j; i < s.length - 1; i = j + 1) {
    for (j = i; j < s.length - 1 && s[j + 1].h === s[i].h; j++);
    if (j < s.length - 1 && (s[i].h - s[i - 1].h) * (s[i].h - s[j + 1].h) > 0) events.push({ t: (s[i].t + s[j].t) / 2, h: s[i].h, type: s[i].h > s[i - 1].h ? 'H' : 'L' });
  }
  return { station: b?.label ?? null, unit: (d.primaryUnits || 'ft').toLowerCase(), issued: Date.parse(d.issuedTime) || null, series: s, events };
}

export const tideForecast = {
  key: 'nwps-tide', slot: 'tide', regions: ['US'], via: 'browser', hosts: ['https://api.water.noaa.gov'],
  refreshMs: null, staleMs: 24 * HOUR,
  bind: ([row]) => ({ lid: row.ref }),
  url: b => `https://api.water.noaa.gov/nwps/v1/gauges/${b.params.lid}/stageflow/forecast`,
  parse: parseTide,
  label: () => 'the NWS tide forecast'
};
