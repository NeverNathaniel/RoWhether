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

console.log(`Budget for phase ${budget.phase} (budget.json). Main files are gzip at level 9.\n`);
for (const c of checks) {
  const value = c.unit === 'KiB' ? c.value.toFixed(2) : fmt(c.value);
  const limit = c.unit === 'KiB' ? c.limit.toFixed(2) : fmt(c.limit);
  const room = c.unit === 'KiB' ? (c.limit - c.value).toFixed(2) : fmt(c.limit - c.value);
  console.log(`${c.over ? 'OVER' : 'ok  '}  ${c.name.padEnd(8)} ${value} ${c.unit} of ${limit} ${c.unit}, ${c.over ? `${room.replace('-', '')} over` : `${room} to spare`}  (${c.file})`);
}
console.log('\nPrecache is the raw size of each distinct URL in dist/sw.js.');

const width = Math.max(...assets.map((a) => a.file.length));
console.log(`\nFiles in dist/assets (${assets.length}):`);
console.log(`${'file'.padEnd(width)}  ${'raw B'.padStart(9)}  ${'gzip B'.padStart(9)}`);
for (const a of assets) {
  const tag = a.file === main.js || a.file === main.css ? '  main' : '';
  console.log(`${a.file.padEnd(width)}  ${fmt(a.raw).padStart(9)}  ${fmt(a.gzip).padStart(9)}${tag}`);
}

const over = checks.filter((c) => c.over);
const report = {
  phase: budget.phase,
  ok: over.length === 0,
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
  over: over.map((c) => c.name)
};
writeFileSync(join(DIST, 'budget-report.json'), `${JSON.stringify(report, null, 2)}\n`);

if (over.length) {
  console.error(`\nbudget: over for ${over.map((c) => c.name).join(', ')}. A budget changes only in a commit that says why (08 section 11.2).`);
  process.exit(1);
}
console.log('\nWithin budget. Report written to dist/budget-report.json.');
