// Fetch from the keyless public APIs and parse each response into plain data.
import { SRC, GAUGE_FLOW, GAUGE_TEMP, MODELS } from './config.js';
import { cToF } from './format.js';

export async function fetchJSON(url, ms = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

export function alertLevel(ev) {
  return /Tornado|Thunderstorm|Flash Flood|Flood Warning|High Wind|Wind Advisory|Extreme Wind|Dense Fog|Winter Storm Warning|Ice Storm|Blizzard/i.test(ev) ? 2 : 1;
}
export function parseAlerts(d) {
  return (d.features || []).map(f => {
    const p = f.properties || {};
    const start = Date.parse(p.onset || p.effective) || 0;
    const end = Date.parse(p.ends || p.expires) || 8.64e15;
    return { event: p.event || 'Alert', headline: p.headline || '', desc: p.description || '', instr: p.instruction || '', start, end, lvl: alertLevel(p.event || '') };
  });
}
export function speedToMph(q) {
  if (!q || q.value == null) return null;
  if (/m_s-1/.test(q.unitCode || '')) return q.value * 2.23694;
  return q.value * 0.621371; // km/h
}
export function parseObs(d) {
  const p = d.properties || {};
  return {
    t: Date.parse(p.timestamp) || null,
    tempF: p.temperature && p.temperature.value != null ? cToF(p.temperature.value) : null,
    wind: speedToMph(p.windSpeed), gust: speedToMph(p.windGust),
    dir: p.windDirection ? p.windDirection.value : null,
    text: p.textDescription || ''
  };
}
export function parseRiver(d) {
  const out = {};
  for (const f of d.features || []) {
    const p = f.properties || {};
    const v = parseFloat(p.value), t = Date.parse(p.time);
    if (isNaN(v)) continue;
    if (p.monitoring_location_id === GAUGE_FLOW && p.parameter_code === '00060') out.flow = { v, t };
    if (p.monitoring_location_id === GAUGE_TEMP && p.parameter_code === '00010') out.waterC = { v, t };
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

const num = v => (v == null || v === '' || isNaN(v) ? null : +v);

// Hourly US AQI and PM2.5 (µg/m³), with times in ms.
export function parseAQ(d) {
  const H = d.hourly || {};
  return (H.time || [])
    .map((t, i) => ({ t: t * 1000, aqi: num(H.us_aqi && H.us_aqi[i]), pm25: num(H.pm2_5 && H.pm2_5[i]) }))
    .filter(x => x.aqi != null || x.pm25 != null);
}

// Hourly sustained wind and precipitation from each compared model, in the
// order of MODELS. A model missing from the response is left out.
export function parseModels(d) {
  const H = d.hourly || {};
  const ids = MODELS.map(x => x.id).filter(id => H[`wind_speed_10m_${id}`] || H[`precipitation_${id}`]);
  const col = (k, id, i) => num(H[`${k}_${id}`] && H[`${k}_${id}`][i]);
  return {
    ids,
    hours: (H.time || []).map((t, i) => ({
      t: t * 1000,
      wind: ids.map(id => col('wind_speed_10m', id, i)),
      precip: ids.map(id => col('precipitation', id, i))
    }))
  };
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
