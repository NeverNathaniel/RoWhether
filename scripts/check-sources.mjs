// A live check of every source the curated locations use (phase 1 plan P1.19; 02
// "Tests"). By hand, never in CI: the owner runs it before shipping, and when a provider
// announces a change.
//
//   node scripts/check-sources.mjs              every record in data/
//   node scripts/check-sources.mjs hanover-boathouse lake-natoma
//
// For each record it takes the bindings the app would make (bindingsFor), asks each URL
// as the browser does, with Origin: https://rowhether.com and the User-Agent of
// agent.mjs, and prints the status, the access-control-allow-origin header and whether
// the parser accepts the answer. A source that does not answer, answers badly, lacks
// the CORS header, breaks its parser or answers with nothing in it (but alerts) is a
// failure, and the check carries on. Exit status 1 when any failed. A location's
// bindings are asked together, as the app does.
// Pure functions are exported for the tests.
import { pathToFileURL } from 'node:url';
import { get } from './locations/agent.mjs';
import { collectLocations } from './locations/plugin.mjs';
import { resolveLocation } from '../src/location.js';
import { bindingsFor } from '../src/sources/index.js';
import { SITE_URL } from '../src/config.js';

export const ORIGIN = new URL(SITE_URL).origin;

// Whether a browser at our origin may read the answer.
export function corsOk(headers) {
  const v = headers.get('access-control-allow-origin');
  return v === '*' || v === ORIGIN;
}

// What a parser gave, in a few words: how many items, or which parts it holds.
export function shape(value) {
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (value && typeof value === 'object') return Object.entries(value).map(([k, x]) => (Array.isArray(x) ? `${k} ${x.length}` : x == null ? `${k} none` : k)).join(', ') || 'nothing';
  return String(value);
}

// Whether a parser gave nothing: no items, no keys, or only empty lists and nulls. A 200
// that holds nothing is what a wrong or retired gauge answers with.
export function holdsNothing(v) {
  if (Array.isArray(v)) return v.length === 0;
  if (!v || typeof v !== 'object') return v == null;
  const lists = Object.values(v).filter(Array.isArray);
  return lists.length ? lists.every(l => !l.length) : Object.values(v).every(x => x == null);
}

// Only alerts may come back empty: no alert is the usual day.
const MAY_BE_EMPTY = new Set(['alerts']);

// One binding asked and read: { slot, url, ok, status, cors, note }. `note` is what the
// parser gave when ok, else everything that went wrong.
export async function checkBinding(b, { fetch: send } = {}) {
  const out = { slot: b.slot, url: b.url, ok: false, status: null, cors: null, note: '' };
  let r;
  try { r = await get(b.url, { headers: { Origin: ORIGIN }, fetch: send }); } catch (e) { return { ...out, note: e.message }; }
  out.status = r.status;
  out.cors = r.headers.get('access-control-allow-origin');
  if (r.status !== 200) return { ...out, note: `HTTP ${r.status}` };
  let json;
  try { json = JSON.parse(r.text); } catch (e) { return { ...out, note: `not JSON: ${e.message}` }; }
  const problems = [];
  if (!corsOk(r.headers)) problems.push(`no access-control-allow-origin for ${ORIGIN}`);
  let parsed;
  try {
    parsed = b.parse(json);
    if (!MAY_BE_EMPTY.has(b.slot) && holdsNothing(parsed)) problems.push('the answer holds nothing');
  } catch (e) { problems.push(`parser: ${e.message}`); }
  return problems.length ? { ...out, note: problems.join('; ') } : { ...out, ok: true, note: shape(parsed) };
}

// Every binding of a location, each on its own.
export const checkLocation = (loc, { fetch: send, bindings = bindingsFor } = {}) => Promise.all(bindings(loc).map(b => checkBinding(b, { fetch: send })));

// The lines printed for a location: a row for each binding, and the URL under a failure.
export function resultLines(slug, results) {
  const lines = [slug];
  for (const r of results) {
    lines.push(`  ${r.slot.padEnd(9)} ${String(r.status ?? 'none').padEnd(5)} cors ${(r.cors ?? 'none').padEnd(22)} ${r.ok ? 'ok  ' : 'FAIL'} ${r.note}`);
    if (!r.ok) lines.push(`    ${r.url}`);
  }
  return lines;
}

export function summary(results) {
  const bad = results.filter(r => !r.ok).length;
  return `${results.length} request${results.length === 1 ? '' : 's'}: ${results.length - bad} ok, ${bad} failed.`;
}

// The records named on the command line, in the order of the list, or all of them.
export function pick(list, names) {
  const unknown = names.filter(n => !list.some(({ rec }) => rec.slug === n));
  if (unknown.length) throw new Error(`No location named ${unknown.join(', ')} in data/locations.`);
  return names.length ? list.filter(({ rec }) => names.includes(rec.slug)) : list;
}

// Checks the named records, or all, and prints what it finds. Gives the exit status: 1 when
// any binding failed, else 0. A name that is no record throws.
export async function run(names, { check = checkLocation, log = console.log } = {}) {
  const all = [];
  for (const { rec, waterway } of pick(collectLocations(), names)) {
    const results = await check(resolveLocation(rec, { waterway }));
    log(resultLines(rec.slug, results).join('\n'));
    all.push(...results);
  }
  log(`\n${summary(all)}`);
  return all.some(r => !r.ok) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => { console.error(e.message); process.exit(2); });
}
