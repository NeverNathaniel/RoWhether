// The curated locations in the build (01 7.2 and 7.3, phase 1 plan P1.2).
//
// data/ holds one JSON file per location and per waterway. The build checks all
// of them, and fails with the file and field of every problem. It then writes
// into dist/:
//
//   locations/index.json    the picker's list (published and verified records)
//   locations/<slug>.json   one record, with its waterway inside
//   <slug>.html             index.html with the location's own title, description,
//                           canonical and Open Graph tags. A first visit and a
//                           link preview run no script, so they read this one.
//
// The two JSON paths are precached by the service worker. The shells are not
// (vite.config.js lists them in globIgnores), and scripts/budget.mjs checks that.
// Pure functions are exported for the tests; the plugin is the thin part.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, parse } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLocation, validateWaterway, resolveSources } from '../../src/location.js';
import { SITE_URL } from '../../src/config.js';
import { esc } from '../../src/format.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// Names the build writes at the top of dist/, besides what public/ holds (read
// below). A slug equal to one would clash with that file or its address.
const BUILD_NAMES = ['assets', 'locations', 'sw', 'registerSW', 'manifest', 'privacy', 'index', 'favicon', 'apple-touch-icon'];
const BUILD_PREFIXES = ['workbox-', 'icon-'];

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const problem = (field, code, message) => ({ field, code, message });

// A slug the build or public/ already uses, as a test.
function takenByBuild(root) {
  const names = new Set(BUILD_NAMES);
  const pub = join(root, 'public');
  if (existsSync(pub)) for (const f of readdirSync(pub)) { names.add(f); names.add(parse(f).name); }
  return slug => names.has(slug) || BUILD_PREFIXES.some(p => slug.startsWith(p));
}

// Every record under data/, checked. Returns [{ rec, waterway, file }] sorted by
// slug, with `waterway` the record's own waterway record (null on a draft with
// none). Throws one error that lists `<file>: <field> <code> <message>` for each
// problem, so a bad file fails the build with its name and field.
export function collectLocations(root = ROOT) {
  const lines = [];
  const note = (file, p) => lines.push(`${file}: ${p.field || '(file)'} ${p.code} ${p.message}`);
  const read = dir => {
    const folder = join(root, 'data', dir);
    if (!existsSync(folder)) return [];
    return readdirSync(folder).filter(f => f.endsWith('.json')).sort().map(f => {
      const file = `data/${dir}/${f}`;
      try { return { file, name: f.slice(0, -'.json'.length), value: JSON.parse(readFileSync(join(folder, f), 'utf8')) }; }
      catch (e) { note(file, problem('', 'json', e.message)); return null; }
    }).filter(Boolean);
  };

  const waterways = new Map();
  for (const { file, name, value } of read('waterways')) {
    validateWaterway(value).forEach(p => note(file, p));
    if (!isObj(value)) continue;
    if (value.id !== name) note(file, problem('id', 'file_name', `The file is ${name}.json, so the id must be ${name}.`));
    waterways.set(value.id, value);
  }

  const taken = takenByBuild(root);
  const slugs = new Map();
  const list = [];
  for (const { file, name, value: rec } of read('locations')) {
    const waterway = isObj(rec) && rec.waterway != null ? waterways.get(rec.waterway) ?? null : null;
    // The waterway goes in because P1.10's rules need it (01 4.3: a flow limit
    // needs a flow binding, which may sit on the waterway).
    validateLocation(rec, { waterway }).forEach(p => note(file, p));
    if (!isObj(rec)) continue;
    // The app refuses a record that is not version 1 (P1.4), so the build does too.
    if (rec.v !== 1) note(file, problem('v', 'required', 'Use "v": 1. The app does not read a record without it.'));
    if (rec.slug !== name) note(file, problem('slug', 'file_name', `The file is ${name}.json, so the slug must be ${name}.`));
    if (typeof rec.slug === 'string') {
      if (taken(rec.slug)) note(file, problem('slug', 'build_name', 'That address is a file the build or public/ writes.'));
      if (slugs.has(rec.slug)) note(file, problem('slug', 'duplicate', `Also the slug of ${slugs.get(rec.slug)}.`));
      else slugs.set(rec.slug, file);
    }
    if (rec.waterway != null && !waterways.has(rec.waterway)) note(file, problem('waterway', 'not_found', `No file data/waterways/${rec.waterway}.json.`));
    for (const k of ['credits', 'description']) {
      if (!rec.copy?.[k]) note(file, problem(`copy.${k}`, 'required', 'Required.'));
    }
    if (resolveSources(rec, waterway).flow && !rec.copy?.flowStats) note(file, problem('copy.flowStats', 'required', 'Required when the location has a flow binding.'));
    list.push({ rec, waterway, file });
  }

  if (lines.length) throw new Error(`The data files have ${lines.length} problem${lines.length === 1 ? '' : 's'}:\n${lines.join('\n')}`);
  return list.sort((a, b) => (a.rec.slug < b.rec.slug ? -1 : a.rec.slug > b.rec.slug ? 1 : 0));
}

// The picker's index entries (01 7.2): published and verified records only,
// sorted by slug. There is no `generated` time, so a build repeats byte for byte.
export function summaries(list) {
  return list
    .filter(({ rec }) => rec.status === 'published' || rec.status === 'verified')
    .map(({ rec, waterway }) => ({
      slug: rec.slug, name: rec.name, shortName: rec.shortName, locality: rec.locality ?? null,
      waterway: waterway?.name ?? null, lat: rec.lat, lon: rec.lon, tz: rec.tz,
      country: rec.country, region: rec.region ?? null, waterType: rec.waterType,
      status: rec.status, revision: rec.revision ?? 1
    }))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

// What locations/<slug>.json holds: the record, and its whole waterway record.
// The app resolves the sources itself, with the same resolveLocation() as the build.
export const recordFile = (rec, waterway) => ({ ...rec, waterwayRecord: waterway });

// A page that is not a draft is served. A draft is checked and never written.
const served = list => list.filter(({ rec }) => rec.status !== 'draft');

// The JSON files of the build, by path under dist/, as text.
export function locationFiles(list) {
  const files = { 'locations/index.json': JSON.stringify({ v: 1, locations: summaries(list) }) };
  for (const { rec, waterway } of served(list)) files[`locations/${rec.slug}.json`] = JSON.stringify(recordFile(rec, waterway));
  return files;
}

// One tag in the page, replaced. A tag that is not there exactly once is an
// error, so a later edit of index.html cannot quietly leave a shell unchanged.
function swap(html, pattern, to) {
  const found = html.match(new RegExp(pattern.source, 'g'))?.length ?? 0;
  if (found !== 1) throw new Error(`index.html needs exactly one ${pattern.source}, found ${found}.`);
  return html.replace(pattern, () => to);
}

// index.html with the title, description, canonical and Open Graph tags of one
// location. Nothing else changes. `waterway` is not read yet.
export function shellHtml(html, rec, waterway) {
  const title = esc(`${rec.name} rowing conditions`);
  const description = esc(rec.copy.description);
  const url = esc(`${SITE_URL}${rec.slug}`);
  let out = html;
  out = swap(out, /<title>[^<]*<\/title>/, `<title>${title}</title>`);
  out = swap(out, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${description}">`);
  out = swap(out, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  out = swap(out, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  out = swap(out, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${title}">`);
  out = swap(out, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${description}">`);
  return out;
}

// The slugs' shell names, from the file names under data/locations, for the
// service worker's globIgnores. It reads no file, so a broken one does not stop
// the config from loading; the build checks the files.
export function shellNames(root = ROOT) {
  const folder = join(root, 'data', 'locations');
  if (!existsSync(folder)) return [];
  return readdirSync(folder).filter(f => f.endsWith('.json')).map(f => `${f.slice(0, -'.json'.length)}.html`).sort();
}

export function locationsPlugin() {
  let root = ROOT;
  let list = [];
  const load = () => { list = collectLocations(root); };
  return {
    name: 'rowhether-locations',
    // After Vite's own plugins, so the bundle already holds the final index.html.
    enforce: 'post',
    configResolved(config) { root = config.root; },
    buildStart() { load(); },
    generateBundle(_, bundle) {
      const page = bundle['index.html'];
      if (!page) this.error('The locations plugin found no index.html in the bundle.');
      const html = typeof page.source === 'string' ? page.source : Buffer.from(page.source).toString('utf8');
      for (const [fileName, source] of Object.entries(locationFiles(list))) this.emitFile({ type: 'asset', fileName, source });
      for (const { rec, waterway } of served(list)) this.emitFile({ type: 'asset', fileName: `${rec.slug}.html`, source: shellHtml(html, rec, waterway) });
    },
    // vite dev: the two JSON paths come from memory, read again when data/ changes.
    configureServer(server) {
      const data = join(root, 'data');
      server.watcher.add(data);
      server.watcher.on('all', (_event, file) => {
        if (!file.startsWith(data)) return;
        try { load(); } catch (e) { server.config.logger.error(e.message); }
      });
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0].replace(/^\//, '');
        const files = locationFiles(list);
        if (!Object.hasOwn(files, path)) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(files[path]);
      });
    }
  };
}
