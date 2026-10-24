// Bundle budget check (08 sections 11.2 and 14.2 P0.3).
//
//   npm run build && node scripts/budget.mjs
//
// Reads dist/index.html and finds the main script and stylesheet it links.
// Gzips those two and the page itself at level 9 (zlib, no dependency), adds
// up the precache from the entries in dist/sw.js, and compares all four with
// budget.json. Prints every file in dist/assets/ with its raw and gzip size,
// writes dist/budget-report.json with the same numbers, and exits 1 when
// anything is over or when a name it needs cannot be found.
//
// It also checks the location files (P1.2): every record in
// dist/locations/index.json has its locations/<slug>.json and its <slug>.html,
// the service worker precaches the index and the record files, and it
// precaches no <slug>.html shell (a shell is for a first visit and a link
// preview; navigations fall back to the precached index.html). A shell is the
// built index.html with six tags swapped, so it links the same hashed script
// and stylesheet; any other difference would leave a shared link blank.
//
// And the lazy chunks (P1.2a; 07 10.5 and 10.6 item 3, 08 17.3): each one in
// LAZY is built from a dynamic import(), so it is dist/assets/<name>-<hash>.js.
// It must exist, the page must not load or preload it, and the service worker
// precaches it or not as LAZY says. Each chunk's gzip size is printed. It has
// no size budget (08 11.2).
//
// The report is written even when the check fails, so CI can upload it.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, constants } from 'node:zlib';
import { join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const KIB = 1024;

const fmt = (n) => n.toLocaleString('en-US');
const gzipSize = (buf) => gzipSync(buf, { level: constants.Z_BEST_COMPRESSION }).length;
const fail = (message) => {
  console.error(`budget: ${message}`);
  process.exit(1);
};

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return fail(`cannot read ${file}. Run npm run build first.`);
  }
}

// The value of one attribute in a tag, in either quote style.
function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  return m ? (m[1] ?? m[2]) : null;
}

// A URL from the page or the service worker, as a path under dist/.
function distPath(url) {
  return posix.normalize(url.replace(/^[a-z]+:\/\/[^/]+/i, '').replace(/^\/+/, '').split(/[?#]/)[0]);
}

function mainFiles(html) {
  const script = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]).find((t) => attr(t, 'src') && /\/assets\/index-/.test(attr(t, 'src')));
  const sheet = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((t) => /stylesheet/i.test(attr(t, 'rel') || '') && attr(t, 'href'));
  if (!script) fail('dist/index.html links no main script (a script with src under /assets/index-).');
  if (!sheet) fail('dist/index.html links no stylesheet.');
  return { js: distPath(attr(script, 'src')), css: distPath(attr(sheet, 'href')) };
}

// Every entry in the precacheAndRoute list, duplicates included. The plugin
// lists six URLs twice (the glob and the extra assets), so the list has 17
// entries and 12 distinct URLs. The service worker stores each URL once, so
// the budget counts distinct URLs. The build log's "262.92 KiB" is a different
// number: it sums the 11 glob files and leaves out manifest.webmanifest.
function precacheEntries(sw) {
  const start = sw.indexOf('precacheAndRoute([');
  if (start < 0) fail('dist/sw.js has no precacheAndRoute list.');
  const end = sw.indexOf(']', start);
  const list = sw.slice(start, end);
  const urls = [...list.matchAll(/\burl:"([^"]+)"/g)].map((m) => distPath(m[1]));
  if (!urls.length) fail('dist/sw.js lists no precache entries.');
  return urls;
}

function sizeOf(path) {
  const file = join(DIST, path);
  if (!existsSync(file)) fail(`dist/${path} is named but missing.`);
  return statSync(file).size;
}

// 08 8.4: while the list has this many records or fewer, each file is precached.
const PRECACHE_RECORDS_MAX = 50;

// The lines of index.html that a shell swaps (shellHtml in
// scripts/locations/plugin.mjs). Every other line of a shell is the page's own.
const SHELL_TAGS = ['<title>', '<meta name="description"', '<link rel="canonical"', '<meta property="og:url"', '<meta property="og:title"', '<meta property="og:description"'];

// Why a shell is not index.html with the six tags swapped, or null.
function shellDifference(page, shell) {
  if (page.length !== shell.length) return `has ${shell.length} lines, and index.html has ${page.length}`;
  const swapped = (a, b) => SHELL_TAGS.some((t) => a.startsWith(t) && b.startsWith(t));
  const at = page.findIndex((line, i) => line !== shell[i] && !swapped(line, shell[i]));
  return at < 0 ? null : `differs from index.html on line ${at + 1}, which is not a tag a shell swaps`;
}

// What is wrong with the location files in dist/, as a list of sentences.
function locationProblems(distinct) {
  const index = JSON.parse(readText(join(DIST, 'locations/index.json')));
  const slugs = (index.locations || []).map((l) => l.slug);
  const page = readText(join(DIST, 'index.html')).split('\n');
  // Every record file in dist/locations, not only the ones the index lists:
  // none of their shells may be precached either.
  const records = readdirSync(join(DIST, 'locations')).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.slice(0, -'.json'.length));
  const problems = [];
  for (const slug of slugs) {
    if (!existsSync(join(DIST, 'locations', `${slug}.json`))) problems.push(`locations/index.json lists ${slug}, and dist/locations/${slug}.json is missing.`);
    if (!existsSync(join(DIST, `${slug}.html`))) problems.push(`locations/index.json lists ${slug}, and dist/${slug}.html is missing.`);
    else {
      const why = shellDifference(page, readText(join(DIST, `${slug}.html`)).split('\n'));
      if (why) problems.push(`dist/${slug}.html ${why}.`);
    }
  }
  for (const slug of records) {
    if (distinct.includes(`${slug}.html`)) problems.push(`The service worker precaches ${slug}.html. A location's shell is not precached (globIgnores in vite.config.js).`);
  }
  const wanted = ['locations/index.json', ...(records.length <= PRECACHE_RECORDS_MAX ? records.map((s) => `locations/${s}.json`) : [])];
  for (const path of wanted) {
    if (!distinct.includes(path)) problems.push(`The service worker does not precache ${path}.`);
  }
  return { records: slugs, problems };
}

// The lazy chunks. P1.5 moved the suggestion form out of the main script to make
// room (07 10.3, plan 7.3); P1.6 added the picker; P1.14 and P1.18 add tide and admin.
const LAZY = [{ name: 'views', precache: true }, { name: 'suggest-form', precache: true }, { name: 'picker', precache: true }];

// The files the page loads or preloads: its scripts, and its modulepreload and
// preload links. A lazy chunk is read with import() and is in none of them.
function pageFiles(html) {
  const urls = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => attr(m[0], 'src'));
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (/(^|\s)(module)?preload(\s|$)/i.test(attr(m[0], 'rel') || '')) urls.push(attr(m[0], 'href'));
  }
  return urls.filter(Boolean).map((u) => posix.basename(distPath(u)));
}

// Each lazy chunk's files, and what is wrong with them as a list of sentences.
function lazyChunks(assets, html, distinct) {
  const loaded = pageFiles(html);
  const chunks = [];
  const problems = [];
  for (const { name, precache } of LAZY) {
    const files = assets.filter((a) => new RegExp(`^assets/${name}-[^/]+\\.js$`).test(a.file));
    if (!files.length) problems.push(`dist/assets has no ${name}-*.js. The ${name} chunk is missing, or is not named after its file.`);
    for (const f of loaded.filter((x) => x.startsWith(`${name}-`))) problems.push(`dist/index.html loads ${f}. A lazy chunk is read with import(), never as a script or a preload.`);
    for (const f of files) {
      const cached = distinct.includes(f.file);
      if (precache && !cached) problems.push(`The service worker does not precache ${f.file}.`);
      if (!precache && cached) problems.push(`The service worker precaches ${f.file}, a chunk that is not precached.`);
      chunks.push({ name, file: f.file, raw: f.raw, gzip: f.gzip, precache, precached: cached });
    }
    // A chunk that imports a stylesheet has it as its own file (assets/<name>-*.css): offline, the chunk needs it.
    for (const f of assets.filter((a) => new RegExp(`^assets/${name}-[^/]+\\.css$`).test(a.file))) {
      const cached = distinct.includes(f.file);
      if (precache && !cached) problems.push(`The service worker does not precache ${f.file}, the stylesheet of the ${name} chunk.`);
      if (!precache && cached) problems.push(`The service worker precaches ${f.file}, the stylesheet of a chunk that is not precached.`);
    }
  }
  return { chunks, problems };
}

const budget = JSON.parse(readText(join(ROOT, 'budget.json')));
for (const key of ['js', 'css', 'html', 'precacheKiB']) {
  if (typeof budget[key] !== 'number') fail(`budget.json has no number for "${key}".`);
}

const htmlBuf = Buffer.from(readText(join(DIST, 'index.html')));
const main = mainFiles(htmlBuf.toString('utf8'));
const jsBuf = readFileSync(join(DIST, main.js));
const cssBuf = readFileSync(join(DIST, main.css));

const entries = precacheEntries(readText(join(DIST, 'sw.js')));
const distinct = [...new Set(entries)];
const precacheBytes = distinct.reduce((sum, path) => sum + sizeOf(path), 0);

const assets = readdirSync(join(DIST, 'assets'), { withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => {
    const buf = readFileSync(join(DIST, 'assets', e.name));
    return { file: `assets/${e.name}`, raw: buf.length, gzip: gzipSize(buf) };
  })
  .sort((a, b) => a.file.localeCompare(b.file));

const checks = [
  { name: 'Main JS', file: main.js, raw: jsBuf.length, value: gzipSize(jsBuf), limit: budget.js, unit: 'B' },
  { name: 'CSS', file: main.css, raw: cssBuf.length, value: gzipSize(cssBuf), limit: budget.css, unit: 'B' },
  { name: 'HTML', file: 'index.html', raw: htmlBuf.length, value: gzipSize(htmlBuf), limit: budget.html, unit: 'B' },
  { name: 'Precache', file: `${entries.length} entries, ${distinct.length} distinct`, raw: precacheBytes, value: precacheBytes / KIB, limit: budget.precacheKiB, unit: 'KiB' }
].map((c) => ({ ...c, over: c.value > c.limit }));

const places = locationProblems(distinct);
const lazy = lazyChunks(assets, htmlBuf.toString('utf8'), distinct);

console.log(`Budget for phase ${budget.phase} (budget.json). Main files are gzip at level 9.\n`);
for (const c of checks) {
  const value = c.unit === 'KiB' ? c.value.toFixed(2) : fmt(c.value);
  const limit = c.unit === 'KiB' ? c.limit.toFixed(2) : fmt(c.limit);
  const room = c.unit === 'KiB' ? (c.limit - c.value).toFixed(2) : fmt(c.limit - c.value);
  console.log(`${c.over ? 'OVER' : 'ok  '}  ${c.name.padEnd(8)} ${value} ${c.unit} of ${limit} ${c.unit}, ${c.over ? `${room.replace('-', '')} over` : `${room} to spare`}  (${c.file})`);
}
console.log('\nPrecache is the raw size of each distinct URL in dist/sw.js.');
console.log(`${places.problems.length ? 'OVER' : 'ok  '}  Locations ${places.records.length} in the index: ${places.records.join(', ') || 'none'}`);
for (const line of places.problems) console.log(`      ${line}`);
console.log(`${lazy.problems.length ? 'OVER' : 'ok  '}  Lazy chunks ${LAZY.map((l) => l.name).join(', ')}`);
for (const c of lazy.chunks) console.log(`      ${c.name.padEnd(8)} ${fmt(c.gzip)} B gzip, ${fmt(c.raw)} B raw, ${c.precached ? 'precached' : 'not precached'}  (${c.file})`);
for (const line of lazy.problems) console.log(`      ${line}`);

const width = Math.max(...assets.map((a) => a.file.length));
console.log(`\nFiles in dist/assets (${assets.length}):`);
console.log(`${'file'.padEnd(width)}  ${'raw B'.padStart(9)}  ${'gzip B'.padStart(9)}`);
for (const a of assets) {
  const tag = a.file === main.js || a.file === main.css ? '  main' : lazy.chunks.some((c) => c.file === a.file) ? '  lazy' : '';
  console.log(`${a.file.padEnd(width)}  ${fmt(a.raw).padStart(9)}  ${fmt(a.gzip).padStart(9)}${tag}`);
}

const over = checks.filter((c) => c.over);
const report = {
  phase: budget.phase,
  ok: over.length === 0 && places.problems.length === 0 && lazy.problems.length === 0,
  budget: { js: budget.js, css: budget.css, html: budget.html, precacheKiB: budget.precacheKiB },
  main: {
    js: { file: main.js, raw: checks[0].raw, gzip: checks[0].value },
    css: { file: main.css, raw: checks[1].raw, gzip: checks[1].value },
    html: { file: 'index.html', raw: checks[2].raw, gzip: checks[2].value }
  },
  precache: {
    entries: entries.length,
    distinct: distinct.length,
    bytes: precacheBytes,
    kib: Number((precacheBytes / KIB).toFixed(2)),
    files: distinct
  },
  assets,
  locations: { records: places.records, problems: places.problems },
  lazy: { chunks: lazy.chunks, problems: lazy.problems },
  over: [...over.map((c) => c.name), ...(places.problems.length ? ['Locations'] : []), ...(lazy.problems.length ? ['Lazy chunks'] : [])]
};
writeFileSync(join(DIST, 'budget-report.json'), `${JSON.stringify(report, null, 2)}\n`);

if (report.over.length) {
  console.error(`\nbudget: over for ${report.over.join(', ')}. A budget changes only in a commit that says why (08 section 11.2).`);
  process.exit(1);
}
console.log('\nWithin budget. Report written to dist/budget-report.json.');
