// Location records: the copy saved in this browser, the file the build wrote
// for each location, and the index of them all (07 and 01 7.4). A file is judged
// by its body and never by its content type: a static host may send .json as
// text/plain, and the single-page fallback answers a missing file with
// index.html and 200 (R4).
import { loadRecord, saveRecord } from './storage.js';
import { RECORD_MAX_AGE } from './config.js';

const isRecord = (r, slug) => !!r && r.v === 1 && r.slug === slug;
const rev = r => r.revision ?? 1;

// The parsed JSON of an answer, or null when it is not JSON. A network error throws.
async function body(url) {
  const r = await fetch(url);
  try { return JSON.parse(await r.text()); } catch (e) { return null; }
}

// The record saved in this browser, as { record, fetchedAt }, or null.
export function cachedRecord(slug) {
  const c = loadRecord(slug);
  return c && isRecord(c.record, slug) ? c : null;
}

let index = null; // locations/index.json, once read
export async function fetchIndex() {
  if (index) return index;
  try {
    const x = await body('/locations/index.json');
    if (x && x.v === 1 && Array.isArray(x.locations)) index = x;
  } catch (e) { /* offline */ }
  return index;
}

// { record } for the location's file. { missing: true } when the index has no such
// location. { failed: true } when the answer cannot tell: a network error, or a
// location the index lists whose file did not come.
export async function fetchRecord(slug) {
  try {
    const rec = await body(`/locations/${slug}.json`);
    if (isRecord(rec, slug)) return { record: rec };
    const list = await fetchIndex();
    if (list && !list.locations.some(l => l.slug === slug)) return { missing: true };
  } catch (e) { /* offline */ }
  return { failed: true };
}

// The record to open in place of a saved one, or null. The index says whether the
// revision changed, so a deploy that edits a record reaches an installed copy on
// its next start. A copy over a day old is fetched again whatever the index says
// (01 7.4). Whatever is fetched is saved, which dates the copy again; it is given
// back only when its revision is not the saved one's.
export async function newerRecord({ record, fetchedAt }, now = Date.now()) {
  const listed = (await fetchIndex())?.locations.find(l => l.slug === record.slug);
  if (now - fetchedAt <= RECORD_MAX_AGE && (!listed || rev(listed) === rev(record))) return null;
  const { record: got } = await fetchRecord(record.slug);
  if (!got) return null;
  saveRecord(record.slug, got);
  return rev(got) === rev(record) ? null : got;
}
