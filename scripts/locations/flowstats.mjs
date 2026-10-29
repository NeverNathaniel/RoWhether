// Flow statistics for a gauge (phase 1 plan P1.19; 02 "Default flow thresholds from
// history"; 01 11.3). For a location with a gauge it prints the `stats` the flow binding
// keeps, the limits flowDefaults() suggests from them, and the sentence for the
// Settings note, `copy.flowStats`.
//
//   node scripts/locations/flowstats.mjs USGS-01154500
//
// It asks USGS for the daily means from January 1 ten years back to yesterday, in one
// request with limit=10000 (a second page, at most 5, only if the answer links one).
// Percentiles are by linear interpolation between the closest ranks, on all days of the
// year, as Putney's were. Pure functions are exported for the tests.
import { pathToFileURL } from 'node:url';
import { getJSON as fetchJSON } from './agent.mjs';
import { flowDefaults, MIN_FLOW_DAYS } from '../../src/location.js';

const DAILY = 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/daily/items';
const MAX_PAGES = 5;
const PERCENTILES = { p50: 0.5, p65: 0.65, p88: 0.88, p90: 0.9, p95: 0.95 };

// A USGS site as the binding names it: "USGS-01154500", from that or from the number.
export function siteId(arg) {
  const m = /^(?:USGS-)?(\d{8,15})$/i.exec(arg ?? '');
  if (!m) throw new Error('Usage: node scripts/locations/flowstats.mjs <USGS id>, such as USGS-01154500 or 01154500.');
  return `USGS-${m[1]}`;
}

// January 1 ten years back, to yesterday, as dates in UTC (the latest day lags by a day or
// two anyway). In 2026 that is 2016-01-01 to 2026-10-25.
export function flowWindow(now = Date.now()) {
  const t = new Date(now), y = t.getUTCFullYear();
  return { from: `${y - 10}-01-01`, to: new Date(Date.UTC(y, t.getUTCMonth(), t.getUTCDate() - 1)).toISOString().slice(0, 10) };
}

// The one request for the window: daily means (statistic 00003) of discharge (00060).
export const dailyUrl = (id, { from, to }) => `${DAILY}?monitoring_location_id=${id}&parameter_code=00060&statistic_id=00003&time=${from}/${to}&limit=10000&properties=time,value&skipGeometry=true&f=json`;

// The days with a value in an answer, as [{ day, v }], oldest first. The API lists them in
// the order of their ids, and the value is text. A day with no value, one that is not a
// number and a negative one (USGS marks a missing reading -999999) are left out. A day
// listed twice counts once.
export function dailyValues(answer) {
  const byDay = new Map();
  for (const f of answer?.features || []) {
    const day = f?.properties?.time, v = parseFloat(f?.properties?.value);
    if (typeof day === 'string' && day && v >= 0) byDay.set(day, v);
  }
  return [...byDay].map(([day, v]) => ({ day, v })).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

// The daily means of a gauge over the window.
export async function fetchDaily(id, { now = Date.now(), getJSON = fetchJSON } = {}) {
  let features = [], url = dailyUrl(id, flowWindow(now));
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const answer = await getJSON(url);
    features = features.concat(answer?.features || []);
    url = answer?.links?.find(l => l?.rel === 'next')?.href;
  }
  return dailyValues({ features });
}

// The value below which a share `p` (0 to 1) of the sorted values lie, interpolating
// linearly between the two closest ranks. Not a number for no values.
export function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p, lo = Math.floor(i);
  return lo + 1 < sorted.length ? sorted[lo] + (sorted[lo + 1] - sorted[lo]) * (i - lo) : sorted[lo];
}

// The binding's `stats`: the days it covers and the percentiles, to the nearest cfs.
export function flowStats(rows) {
  const values = rows.map(r => r.v).sort((a, b) => a - b), days = rows.map(r => r.day).sort();
  return { from: days[0], to: days.at(-1), days: rows.length, ...Object.fromEntries(Object.entries(PERCENTILES).map(([k, p]) => [k, Math.round(percentile(values, p))])) };
}

// The share of days at or above a limit: the call's own test (flow >= limit).
export const shareAtOrAbove = (rows, limit) => rows.filter(r => r.v >= limit).length / rows.length;

const num = n => n.toLocaleString('en-US');
// The Settings note (01 11.3): "Since 2016 the median day is about 6,900 cfs. 20,000 is the
// top 12% of days, 28,000 the top 5%."
export function flowSentence(rows, stats, { flowCaution, flowOff }) {
  const top = limit => Math.round(shareAtOrAbove(rows, limit) * 100);
  return `Since ${stats.from.slice(0, 4)} the median day is about ${num(Number(stats.p50.toPrecision(2)))} cfs. ${num(flowCaution)} is the top ${top(flowCaution)}% of days, ${num(flowOff)} the top ${top(flowOff)}%.`;
}

// A flat object on one line, as the data files keep `stats`.
const inline = o => `{ ${Object.entries(o).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')} }`;

// What the script prints.
export function flowReport(id, rows) {
  if (!rows.length) return `${id}: No daily means in the window. Check the id, and that the gauge reports discharge as a daily mean.`;
  const stats = flowStats(rows), d = flowDefaults(stats);
  const out = [`${id}, daily mean flow, ${stats.from} to ${stats.to}, ${stats.days} days.`, '', 'stats, for the flow binding:', inline(stats), ''];
  if (!d) out.push(stats.days < MIN_FLOW_DAYS ? `Not enough history to suggest flow limits: ${num(MIN_FLOW_DAYS)} days are needed. Leave the limits blank, or set them by hand.` : 'The 88th or 95th percentile of the daily means is no flow, so no limits are suggested. Leave the limits blank, or set them by hand.');
  else out.push('Suggested limits, for thresholds and flow.against:', `flowCaution  ${d.flowCaution}`, `flowOff      ${d.flowOff}`, `against      [${d.against.map(([flow, k]) => `[${flow}, ${k}]`).join(', ')}]`, '', 'copy.flowStats:', flowSentence(rows, stats, d));
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let id;
  try { id = siteId(process.argv[2]); } catch (e) { console.error(e.message); process.exit(2); }
  try { console.log(flowReport(id, await fetchDaily(id))); } catch (e) { console.error(`${id}: ${e.message}`); process.exit(1); }
}
