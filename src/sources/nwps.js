// NWS National Water Prediction Service adapter: the river forecast for a
// gauge. Pure: no DOM, no storage.
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
