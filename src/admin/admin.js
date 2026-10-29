// The owner's page at /admin (P1.18; 07 5.14, 14.5). A lazy chunk, read only for this address and never
// precached (07 10.5). Cloudflare Access stands in front of the address and of /api/admin/*; the page
// only asks the Worker for the numbers and says why when it cannot have them. One tab, Metrics: the
// opens of the last 7 days beside the 7 before, and the top locations with a sparkline each.
//
// The page imports nothing of the app but its own words and styles. What it uses of the app comes in as `kit`
// (see src/route.js): a lazy chunk that imports a module the main script also holds makes the bundler
// cut that module out of the main script into a second file the page loads at start, and the first
// screen pays for it (plan 7.3; the budget script counts it).
import '../styles/admin.css';
import { T } from '../copy/admin.js';

const DAYS = 7;

// What GET /api/admin/metrics says, as { state, data }. Access, when its sign in has lapsed, answers a
// fetch with a redirect to its own host: asked with redirect 'manual' that is an opaque redirect, not a
// network error, so it reads as a sign in and not as no connection.
export async function load(days = DAYS) {
  let r;
  try { r = await fetch(`/api/admin/metrics?days=${days}`, { cache: 'no-store', redirect: 'manual' }); } catch (e) { return { state: 'offline' }; }
  if (r.type === 'opaqueredirect' || r.status === 401 || r.status === 403) return { state: 'signin' };
  if (r.status === 503) return { state: 'setup' };
  try {
    const data = r.ok && await r.json();
    if (data && data.totals && data.prior && Array.isArray(data.locations)) return { state: 'ok', data };
  } catch (e) { /* not JSON: a host with no /api answers with the page */ }
  return { state: 'failed' };
}

// The rows of the table. Each place has the name the list of locations gives it; the picker and the
// missing page have a name of their own; and every other name is added into one row, since anyone can
// send one (the Worker takes any word shaped like an address). With no list (`names` null) a place
// keeps its address.
export function placeRows(locs, names) {
  const rows = [], other = { name: T.other, opens: 0, series: [] };
  for (const l of locs) {
    const name = l.slug === 'none' ? T.none : names ? names.get(l.slug) : l.slug;
    if (name !== undefined) { rows.push({ name, opens: l.opens, series: l.series }); continue; }
    other.opens += l.opens;
    l.series.forEach((v, i) => { other.series[i] = (other.series[i] || 0) + v; });
  }
  if (other.opens) rows.push(other);
  return rows.sort((a, b) => b.opens - a.opens);
}

const num = n => n.toLocaleString('en-US');
const share = t => `${t.opens ? Math.round(100 * t.standalone / t.opens) : 0}%`;
// "Oct 20" for a day key, in a fixed language and zone: the page is the same for every viewer.
const dayName = k => new Date(`${k}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// The Metrics tab for the Worker's answer.
export function metricsHtml(d, names, { esc, fact, sparkline }) {
  const { totals: t, prior: p, days: n } = d;
  const line = (label, v, pv) => fact(label, v, `${T.before(n)}: ${pv}`);
  const rows = placeRows(d.locations, names);
  const table = rows.length
    ? `<div class="hours-wrap"><table class="hours"><thead><tr><th>${T.place}</th><th>${T.opens}</th><th>${T.eachDay}</th></tr></thead><tbody>${rows.map(r =>
      `<tr><td>${esc(r.name)}</td><td>${num(r.opens)}</td><td>${sparkline(r.series.map((v, i) => ({ t: i, v })), T.spark(r.name))}</td></tr>`).join('')}</tbody></table></div>`
    : `<p class="note">${T.empty}</p>`;
  return `<div class="adm"><h2 class="vh">${T.tab}</h2>
<p class="lede">${T.last(n)}, ${dayName(d.from)} to ${dayName(d.to)}. ${T.utc} ${T.counted(esc(d.env))}</p>
<dl class="facts">${line(T.opens, num(t.opens), num(p.opens))}${line(T.firsts, num(t.firsts), num(p.firsts))}${line(T.standalone, share(t), share(p))}</dl>
<p class="note">${T.firstsNote}</p>
<h3>${T.places}</h3>${table}${rows.some(r => r.name === T.other) ? `<p class="note">${T.otherNote}</p>` : ''}${d.truncated ? `<p class="note">${T.truncated}</p>` : ''}</div>`;
}

const retry = text => `<p>${text}</p><p><button id="retryBtn">${T.try}</button></p>`;
// A full page load, not a move inside the app: it reaches Access (the worker does not answer /admin).
const signIn = `<p>${T.signIn}</p><p><a href="/admin">${T.signInLink}</a></p>`;

let drawn = 0; // counts the draws: an answer for an earlier one, or for a page left since, is dropped

// Draws the page: its header and its one tab, then the numbers (or why there are none) once they come.
export async function showAdmin(kit) {
  const { page, showOffline, fetchIndex } = kit, el = id => document.getElementById(id), mine = ++drawn;
  const draw = html => { page(`<div class="adm"><h2 class="vh">${T.tab}</h2>${html}</div>`); el('tabs').hidden = false; };
  draw(`<p class="lede">${T.loading}</p>`);
  el('locName').textContent = document.title = T.title;
  el('sub').innerHTML = `${T.purpose} <a href="/" data-nav>${T.back}</a>`;
  el('tabs').innerHTML = `<a href="#metrics" data-tab="metrics" aria-current="page">${T.tab}</a>`;
  const [r, list] = await Promise.all([load(), fetchIndex()]);
  if (mine !== drawn || location.pathname !== '/admin') return;
  if (r.state === 'offline') { showOffline(); return; }
  if (r.state === 'ok') { page(metricsHtml(r.data, list ? new Map(list.locations.map(l => [l.slug, l.name])) : null, kit)); el('tabs').hidden = false; return; }
  draw(r.state === 'setup' ? `<p>${T.setup}</p>` : r.state === 'signin' ? signIn : retry(T.failed));
}
