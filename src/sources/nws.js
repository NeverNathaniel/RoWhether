// National Weather Service adapters: active alerts at a point and the latest
// observation at a station. Pure: no DOM, no storage.
import { HOUR } from '../config.js';
import { cToF } from '../format.js';

// Whole event names that are Stay off, beside the patterns below: the marine
// warnings and the Small Craft Advisory (README row 11; owner, 2026-10-21, R18). A
// name must match whole, so "Dust Storm Warning" is not "Storm Warning".
export const STAY_OFF_EVENTS = ['Small Craft Advisory', 'Gale Warning', 'Storm Warning', 'Special Marine Warning', 'Hurricane Force Wind Warning', 'Hurricane Warning', 'Storm Surge Warning', 'Tropical Storm Warning'];
const WHOLE = new RegExp(`^(${STAY_OFF_EVENTS.join('|')})$`, 'i');
export function alertLevel(ev) {
  return WHOLE.test(ev) || /Tornado|Thunderstorm|Flash Flood|Flood Warning|High Wind|Wind Advisory|Extreme Wind|Dense Fog|Winter Storm Warning|Ice Storm|Blizzard/i.test(ev) ? 2 : 1;
}
// Whether the polygon of a storm-based warning holds the dock point. Ray casting
// over each ring of a Polygon, or of each polygon of a MultiPolygon, with the
// inner rings as holes. An alert with no geometry, or one drawn in a shape this
// cannot read, applies as listed: the unknown side is to show it.
const inRing = (ring, x, y) => ring.reduce((c, [xi, yi], i) => {
  const [xj, yj] = ring[(i || ring.length) - 1];
  return (yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi ? !c : c;
}, false);
const inPoly = ([outer, ...holes], x, y) => inRing(outer, x, y) && !holes.some(h => inRing(h, x, y));
export function covers(g, lat, lon) {
  try {
    if (g?.type === 'Polygon') return inPoly(g.coordinates, lon, lat);
    if (g?.type === 'MultiPolygon') return g.coordinates.some(p => inPoly(p, lon, lat));
  } catch { /* an unreadable shape applies */ }
  return true;
}

// `b` is the binding: with the dock point in it, a polygon alert applies only
// where it covers the dock. Without one (a bare call) nothing is dropped.
export function parseAlerts(d, b) {
  const at = b?.params, here = Number.isFinite(at?.lat) && Number.isFinite(at?.lon);
  return (d.features || []).filter(f => !here || covers(f.geometry, at.lat, at.lon)).map(f => {
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
  refreshMs: null, staleMs: HOUR,
  // The row's ref is `zones:<code>,<code>` or `point:<lat>,<lon>` (01 4.4). Any
  // other form reads the location's own point. The dock point goes along for the
  // polygon rule in parseAlerts.
  bind: ([row], loc) => {
    const ref = row?.ref || '', at = { lat: loc.lat, lon: loc.lon };
    return ref.startsWith('zones:') ? { zones: ref.slice(6), ...at } : { point: ref.startsWith('point:') ? ref.slice(6) : `${loc.lat},${loc.lon}`, ...at };
  },
  url: b => `https://api.weather.gov/alerts/active?${b.params.zones ? `zone=${b.params.zones}` : `point=${b.params.point}`}`,
  parse: parseAlerts,
  label: () => 'NWS alerts'
};

export const obs = {
  key: 'nws-obs', slot: 'obs', regions: ['US'], via: 'browser', hosts: ['https://api.weather.gov'],
  refreshMs: null, staleMs: 3 * HOUR,
  bind: ([row]) => ({ station: row.ref }),
  url: b => `https://api.weather.gov/stations/${b.params.station}/observations/latest`,
  parse: parseObs,
  label: b => `${b.label || b.params?.station || 'Weather station'} observations`
};
