// The Metrics tab's numbers (P1.18; 07 14.3 and 14.5): the open counter's points, read back through
// the Analytics SQL binding. One query gives a count for each day, location, first or return, and
// home screen or browser, over the window and the same number of days before it; the rest is
// added up here. Days are UTC days. Whether the account lets the binding read the dataset is
// not known until the owner opens the tab (docs read 2026-10-26, developers.cloudflare.com/analytics/sql-api/workers-binding/).
import { addDays } from '../src/format.js';

// The dataset each instance writes (wrangler.jsonc: OPENS). A Preview counts apart from production.
export const datasetFor = env => (env.APP_ENV === 'dev' ? 'rowhether_opens_dev' : 'rowhether_opens');

const ROWS = 10000, TOP = 20;
const utcDay = t => new Date(t).toISOString().slice(0, 10);

// 1 to 30, 7 when missing or not a number.
export const clampDays = raw => {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 7 : Math.min(30, Math.max(1, n));
};

// The binding takes one SELECT with named parameters, no tenancy and no FORMAT. Counts use the
// sample interval, which is 1 until the index is busy enough to be sampled.
export function metricsQuery(env, { days, now }) {
  const start = `${addDays(utcDay(now), 1 - 2 * days)}T00:00:00.000Z`;
  const query = `SELECT formatDateTime(timestamp, '%Y-%m-%d', 'Etc/UTC') AS day, index1 AS slug, blob2 AS k, blob3 AS m, SUM(_sample_interval) AS opens FROM events.analyticsEngine."${datasetFor(env)}" WHERE timestamp >= $start GROUP BY day, slug, k, m ORDER BY day LIMIT ${ROWS}`;
  return { query, params: { start } };
}

// The answer: totals for the window and the one before it, and the top locations of the window
// with a count for each of its days, oldest first. A count may arrive as text (a 64 bit integer).
export function summarize(rows, { days, now }) {
  const to = utcDay(now);
  const keys = Array.from({ length: 2 * days }, (_, i) => addDays(to, i + 1 - 2 * days)); // oldest first
  const at = new Map(keys.map((k, i) => [k, i]));
  const zero = () => ({ opens: 0, firsts: 0, standalone: 0 });
  const totals = zero(), prior = zero(), by = new Map();
  for (const r of rows) {
    const i = at.get(r?.day), n = Number(r?.opens);
    if (i === undefined || typeof r.slug !== 'string' || !(n > 0)) continue;
    const t = i >= days ? totals : prior;
    t.opens += n;
    if (r.k === 'first') t.firsts += n;
    if (r.m === 'standalone') t.standalone += n;
    if (i < days) continue;
    const l = by.get(r.slug) || by.set(r.slug, { slug: r.slug, opens: 0, series: Array(days).fill(0) }).get(r.slug);
    l.opens += n;
    l.series[i - days] += n;
  }
  const locations = [...by.values()].sort((a, b) => b.opens - a.opens || (a.slug < b.slug ? -1 : 1)).slice(0, TOP);
  return { days, from: keys[days], to, totals, prior, locations };
}

// Throws when the query fails or does not answer with rows.
export async function readMetrics(env, { days, now = Date.now() }) {
  const rows = (await env.ANALYTICS_SQL.query(metricsQuery(env, { days, now })))?.data;
  if (!Array.isArray(rows)) throw new Error('no rows');
  return { env: env.APP_ENV || 'production', ...summarize(rows, { days, now }), truncated: rows.length >= ROWS };
}
