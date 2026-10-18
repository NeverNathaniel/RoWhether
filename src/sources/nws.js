// National Weather Service adapters: active alerts at a point and the latest
// observation at a station. Pure: no DOM, no storage.
import { cToF } from '../format.js';

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

export const alerts = {
  key: 'nws-alerts', slot: 'alerts', regions: ['US'], via: 'browser', hosts: ['https://api.weather.gov'],
  refreshMs: null, staleMs: null,
  // The row's ref is `point:<lat>,<lon>` (01 4.4). Any other form reads the
  // location's own point until zone lists arrive in phase 1.
  bind: ([row], loc) => ({ point: row?.ref?.startsWith('point:') ? row.ref.slice(6) : `${loc.lat},${loc.lon}` }),
  url: b => `https://api.weather.gov/alerts/active?point=${b.params.point}`,
  parse: parseAlerts,
  label: () => 'NWS alerts'
};

export const obs = {
  key: 'nws-obs', slot: 'obs', regions: ['US'], via: 'browser', hosts: ['https://api.weather.gov'],
  refreshMs: null, staleMs: null,
  bind: ([row]) => ({ station: row.ref }),
  url: b => `https://api.weather.gov/stations/${b.params.station}/observations/latest`,
  parse: parseObs,
  label: b => `${b.label || b.params?.station || 'Weather station'} observations`
};
