// scripts/budget.mjs and the lazy chunk list (P1.2a; 07 10.6 item 3, 08 17.3).
// The script reads dist/ from the folder above its own, so each case copies it to
// a scratch folder with a small stand-in for dist/ and runs it there. The real
// build's numbers are the budget step's in CI; these cases are for what it must
// refuse: a lazy chunk that is missing, loaded by the page, or in the wrong
// place in the precache.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../scripts/budget.mjs', import.meta.url));

// index.html with the six lines a location's shell swaps, one to a line.
const page = (extra = '') => `<!doctype html>
<html lang="en">
<head>
<title>RoWhether</title>
<meta name="description" content="Rowing conditions.">
<link rel="canonical" href="https://rowhether.com/">
<meta property="og:url" content="https://rowhether.com/">
<meta property="og:title" content="RoWhether">
<meta property="og:description" content="Rowing conditions.">
<link rel="stylesheet" crossorigin href="/assets/index-abc.css">
<script type="module" crossorigin src="/assets/index-abc.js"></script>
${extra}</head>
<body>x</body>
</html>
`;

let dir;
const put = (path, text) => { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), text); };

// A passing dist/ for one location, "a", a views chunk, a suggest-form chunk, a picker
// chunk with its stylesheet and a tide chunk (the last three always in the precache: the cases below
// break the views chunk, and each case for the others breaks one thing). Each option is a thing to break.
const FORM = 'assets/suggest-form-ghi.js';
const PICKER = 'assets/picker-jkl.js';
const PICKER_CSS = 'assets/picker-mno.css';
const TIDE = 'assets/tide-pqr.js';
const PRIVACY_CSS = 'assets/privacy-stu.css';
const ADMIN = 'assets/admin-vwx.js';
const ADMIN_CSS = 'assets/admin-yza.css';
// The navigation route as the build writes it: the fallback to index.html, minus what the denylist names.
// /admin is in it (P1.18): the owner's page is behind Cloudflare Access, which a navigation must reach.
const ADMIN_DENY = '/^\\/admin(\\/|\\?|$)/';
const DENY = `/^\\/api\\//,/^\\/(privacy|terms|about)$/,${ADMIN_DENY}`;
function setup({ head = '', precache = ['index.html', 'assets/index-abc.js', 'assets/index-abc.css', 'locations/index.json', 'locations/a.json', 'assets/views-def.js'], chunk = 'assets/views-def.js', form = FORM, formCached = true, picker = PICKER, pickerCached = true, pickerCss = PICKER_CSS, pickerCssCached = true, tide = TIDE, tideCached = true, privacy = true, privacyCached = true, privacyCss = PRIVACY_CSS, privacyCssCached = true, admin = ADMIN, adminCached = false, adminCss = null, adminCssCached = false, deny = DENY } = {}) {
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(SCRIPT, join(dir, 'scripts/budget.mjs'));
  put('budget.json', JSON.stringify({ phase: 1, js: 1e6, css: 1e6, html: 1e6, precacheKiB: 1000, extraCss: [], extraJs: [] }));
  put('dist/index.html', page(head));
  put('dist/a.html', page(head).replace('<title>RoWhether</title>', '<title>A rowing conditions</title>').replace(/(canonical" href|og:url" content)="https:\/\/rowhether.com\/"/g, '$1="https://rowhether.com/a"'));
  put('dist/assets/index-abc.js', 'export const x = 1;\n'.repeat(50));
  put('dist/assets/index-abc.css', 'a { color: red }\n'.repeat(50));
  if (chunk) put(`dist/${chunk}`, 'export const views = {};\n'.repeat(80));
  if (form) put(`dist/${form}`, 'export const form = {};\n'.repeat(40));
  if (picker) put(`dist/${picker}`, 'export const picker = {};\n'.repeat(60));
  if (pickerCss) put(`dist/${pickerCss}`, '.pk { color: red }\n'.repeat(20));
  if (tide) put(`dist/${tide}`, 'export const tide = {};\n'.repeat(30));
  if (admin) put(`dist/${admin}`, 'export const admin = {};\n'.repeat(25));
  if (adminCss) put(`dist/${adminCss}`, '.adm { color: red }\n'.repeat(10));
  if (privacy) put('dist/privacy.html', `<!doctype html><title>RoWhether privacy</title>${privacyCss ? `<link rel="stylesheet" href="/${privacyCss}">` : ''}`);
  if (privacyCss) put(`dist/${privacyCss}`, 'body { color: red }\n'.repeat(10));
  put('dist/locations/index.json', JSON.stringify({ locations: [{ slug: 'a' }] }));
  put('dist/locations/a.json', '{}');
  const cached = [...precache, ...(formCached ? [FORM] : []), ...(picker && pickerCached ? [picker] : []), ...(pickerCss && pickerCssCached ? [pickerCss] : []), ...(tide && tideCached ? [tide] : []), ...(admin && adminCached ? [admin] : []), ...(adminCss && adminCssCached ? [adminCss] : []), ...(privacy && privacyCached ? ['privacy.html'] : []), ...(privacyCss && privacyCssCached ? [privacyCss] : [])];
  const route = deny === null ? '' : `e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("index.html"),{denylist:[${deny}]}))`;
  put('dist/sw.js', `precacheAndRoute([${cached.map(u => `{url:"${u}",revision:null}`).join(',')}],{});${route}`);
}

const run = (script = join(dir, 'scripts/budget.mjs')) => {
  const r = spawnSync(process.execPath, [script], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
};

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'budget-lazy-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the lazy chunk list in scripts/budget.mjs', () => {
  it('passes a build whose chunks are in the precache and not in the page, and prints their sizes', () => {
    setup();
    const r = run();
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/ok\s+Lazy chunks views, suggest-form, picker, tide, admin/);
    expect(r.out).toMatch(/views\s+[\d,]+ B gzip, 2,000 B raw, precached\s+\(assets\/views-def\.js\)/);
    expect(r.out).toMatch(/suggest-form\s+[\d,]+ B gzip, 960 B raw, precached\s+\(assets\/suggest-form-ghi\.js\)/);
    expect(r.out).toMatch(/picker\s+[\d,]+ B gzip, 1,560 B raw, precached\s+\(assets\/picker-jkl\.js\)/);
    expect(r.out).toMatch(/tide\s+[\d,]+ B gzip, 720 B raw, precached\s+\(assets\/tide-pqr\.js\)/);
    expect(r.out).toMatch(/admin\s+[\d,]+ B gzip, 625 B raw, not precached\s+\(assets\/admin-vwx\.js\)/);
    const report = JSON.parse(readFileSync(join(dir, 'dist/budget-report.json'), 'utf8'));
    expect(report.ok).toBe(true);
    expect(report.lazy.chunks).toMatchObject([
      { name: 'views', file: 'assets/views-def.js', precache: true, precached: true },
      { name: 'suggest-form', file: FORM, precache: true, precached: true },
      { name: 'picker', file: PICKER, precache: true, precached: true },
      { name: 'tide', file: TIDE, precache: true, precached: true },
      { name: 'admin', file: ADMIN, precache: false, precached: false }
    ]);
    expect(report.lazy.problems).toEqual([]);
  });

  it('fails when no file in dist/assets is named views-*.js', () => {
    setup({ chunk: null, precache: ['index.html', 'assets/index-abc.js', 'assets/index-abc.css', 'locations/index.json', 'locations/a.json'] });
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('dist/assets has no views-*.js');
    const report = JSON.parse(readFileSync(join(dir, 'dist/budget-report.json'), 'utf8'));
    expect(report.over).toEqual(['Lazy chunks']);
    expect(report.ok).toBe(false);
  });

  it('fails when the suggestion form chunk is missing, or is not in the precache', () => {
    setup({ form: null, formCached: false });
    let r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('dist/assets has no suggest-form-*.js');
    setup({ formCached: false });
    r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain(`The service worker does not precache ${FORM}.`);
    setup({ head: `<link rel="modulepreload" href="/${FORM}">\n` });
    expect(run().out).toContain('dist/index.html loads suggest-form-ghi.js');
  });

  it('fails when the picker chunk is missing, is not in the precache, or is loaded by the page', () => {
    setup({ picker: null, pickerCss: null });
    let r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('dist/assets has no picker-*.js');
    setup({ pickerCached: false });
    r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain(`The service worker does not precache ${PICKER}.`);
    setup({ head: `<link rel="modulepreload" href="/${PICKER}">\n` });
    r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('dist/index.html loads picker-jkl.js');
  });

  it('fails when the tide chunk is missing, is not in the precache, or is loaded by the page', () => {
    setup({ tide: null });
    let r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('dist/assets has no tide-*.js');
    setup({ tideCached: false });
    r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain(`The service worker does not precache ${TIDE}.`);
    setup({ head: `<link rel="modulepreload" href="/${TIDE}">\n` });
    r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('dist/index.html loads tide-pqr.js');
  });

  // The admin chunk is the one that is not precached (P1.18, 07 10.5): the owner's page is read from the network.
  it('fails when the admin chunk is missing, is in the precache, or is loaded by the page', () => {
    setup({ admin: null });
    let r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('dist/assets has no admin-*.js');
    setup({ adminCached: true });
    r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain(`The service worker precaches ${ADMIN}, a chunk that is not precached.`);
    setup({ head: `<link rel="modulepreload" href="/${ADMIN}">\n` });
    r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('dist/index.html loads admin-vwx.js');
  });

  it("passes an admin stylesheet that is not precached, and fails one that is", () => {
    setup({ adminCss: ADMIN_CSS });
    let r = run();
    expect(r.code, r.out).toBe(0);
    setup({ adminCss: ADMIN_CSS, adminCssCached: true });
    r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain(`The service worker precaches ${ADMIN_CSS}, the stylesheet of a chunk that is not precached.`);
  });

  // A bundler can split the main script and have the page load the part at start (P1.14): its bytes still load before the first screen.
  describe('Main JS', () => {
    const STATE = 'assets/state-xyz.js';
    const gz = (file) => gzipSync(readFileSync(join(dir, 'dist', file)), { level: 9 }).length;
    const report = () => JSON.parse(readFileSync(join(dir, 'dist/budget-report.json'), 'utf8'));

    it('is the main script alone when the page loads no other script', () => {
      setup();
      const r = run();
      expect(r.code, r.out).toBe(0);
      expect(report().main.js).toMatchObject({ file: 'assets/index-abc.js', files: ['assets/index-abc.js'], gzip: gz('assets/index-abc.js') });
    });

    // The second script is allowed only when budget.json names it (P1.16, R12).
    const named = (extraJs) => put('budget.json', JSON.stringify({ phase: 1, js: 1e6, css: 1e6, html: 1e6, precacheKiB: 1000, extraCss: [], extraJs }));

    it('adds a chunk the page preloads, and names it', () => {
      setup({ head: `<link rel="modulepreload" crossorigin href="/${STATE}">\n` });
      named(['state']);
      put(`dist/${STATE}`, Array.from({ length: 400 }, (_, i) => `export const s${i} = ${i * 7919};`).join('\n'));
      const r = run();
      expect(r.code, r.out).toBe(0);
      const js = report().main.js;
      expect(js.files).toEqual(['assets/index-abc.js', STATE]);
      expect(js.gzip).toBe(gz('assets/index-abc.js') + gz(STATE));
      expect(js.gzip).toBeGreaterThan(gz('assets/index-abc.js') + 500);
      expect(r.out).toMatch(/Main JS\s+[\d,]+ B of [\d,]+ B, [\d,]+ to spare\s+\(assets\/index-abc\.js and assets\/state-xyz\.js\)/);
    });

    it('is over its row when the chunk the page preloads takes it over, though the main script alone is under', () => {
      setup({ head: `<link rel="modulepreload" crossorigin href="/${STATE}">\n` });
      put(`dist/${STATE}`, Array.from({ length: 400 }, (_, i) => `export const s${i} = ${i * 7919};`).join('\n'));
      put('budget.json', JSON.stringify({ phase: 1, js: gz('assets/index-abc.js') + 100, css: 1e6, html: 1e6, precacheKiB: 1000, extraCss: [], extraJs: ['state'] }));
      const r = run();
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/OVER\s+Main JS/);
    });

    it('fails with a sentence when the page loads a script that is not in dist/', () => {
      setup({ head: `<link rel="modulepreload" crossorigin href="/${STATE}">\n` });
      const r = run();
      expect(r.code).toBe(1);
      expect(r.out).toContain(`dist/index.html loads ${STATE}, which is not in dist/.`);
    });
  });

  // The picker works offline only with its styles: a chunk that imports a stylesheet has it as a file of its own.
  it("fails when the picker's stylesheet is not in the precache", () => {
    setup({ pickerCssCached: false });
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain(`The service worker does not precache ${PICKER_CSS}, the stylesheet of the picker chunk.`);
  });

  it("fails when the service worker precaches the stylesheet of a chunk that is marked not precached", () => {
    setup({ pickerCached: false });
    const copy = join(dir, 'scripts/budget.mjs');
    const text = readFileSync(copy, 'utf8');
    expect(text).toContain("{ name: 'picker', precache: true }");
    writeFileSync(copy, text.replace("{ name: 'picker', precache: true }", "{ name: 'picker', precache: false }"));
    const r = run(copy);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`The service worker precaches ${PICKER_CSS}, the stylesheet of a chunk that is not precached.`);
    expect(r.out).not.toContain(`precaches ${PICKER},`);
  });

  it('passes a chunk with no stylesheet of its own', () => {
    setup({ pickerCss: null });
    expect(run().code).toBe(0);
  });

  it('fails when a file is named for another chunk, since the name is what the checks look for', () => {
    setup({ chunk: 'assets/vw-def.js', precache: ['index.html', 'assets/index-abc.js', 'assets/index-abc.css', 'locations/index.json', 'locations/a.json', 'assets/vw-def.js'] });
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('dist/assets has no views-*.js');
  });

  it('fails when index.html preloads the chunk as a module', () => {
    setup({ head: '<link rel="modulepreload" crossorigin href="/assets/views-def.js">\n' });
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('dist/index.html loads views-def.js');
  });

  it('fails when index.html preloads the chunk as a script, or loads it with a script tag', () => {
    setup({ head: '<link rel="preload" as="script" href="/assets/views-def.js">\n' });
    expect(run().out).toContain('dist/index.html loads views-def.js');
    setup({ head: '<script type="module" src="/assets/views-def.js"></script>\n' });
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('dist/index.html loads views-def.js');
  });

  it('does not take another file in the page for the chunk', () => {
    setup({ head: '<link rel="modulepreload" href="/assets/index-views-def.js">\n<link rel="stylesheet" href="/assets/views.css">\n' });
    put('dist/assets/index-views-def.js', 'export const v = 1;\n');
    const r = run();
    expect(r.out).not.toContain('dist/index.html loads');
  });

  it('fails when the service worker does not precache a chunk that should be', () => {
    setup({ precache: ['index.html', 'assets/index-abc.js', 'assets/index-abc.css', 'locations/index.json', 'locations/a.json'] });
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('The service worker does not precache assets/views-def.js.');
  });

  it('fails when the service worker precaches a chunk that is marked not precached', () => {
    setup();
    const copy = join(dir, 'scripts/budget.mjs');
    const text = readFileSync(copy, 'utf8');
    expect(text).toContain("{ name: 'views', precache: true }");
    writeFileSync(copy, text.replace("{ name: 'views', precache: true }", "{ name: 'views', precache: false }"));
    const r = run(copy);
    expect(r.code).toBe(1);
    expect(r.out).toContain('The service worker precaches assets/views-def.js, a chunk that is not precached.');
  });
});

// One stylesheet and one script at start (P1.16, R12). Two pages that share a stylesheet make Vite cut
// the shared part into a file of its own, and index.html then links two: the CSS line would measure
// the small one and never fail. So the page may link more than one only when budget.json names it.
describe('the files the page loads at start', () => {
  const SHARED = 'assets/shared-123.css';
  const STATE = 'assets/state-xyz.js';
  const link = `<link rel="stylesheet" crossorigin href="/${SHARED}">\n`;
  const preload = `<link rel="modulepreload" crossorigin href="/${STATE}">\n`;
  const lists = (extraCss = [], extraJs = []) => put('budget.json', JSON.stringify({ phase: 1, js: 1e6, css: 1e6, html: 1e6, precacheKiB: 1000, extraCss, extraJs }));
  const report = () => JSON.parse(readFileSync(join(dir, 'dist/budget-report.json'), 'utf8'));
  const gz = (file) => gzipSync(readFileSync(join(dir, 'dist', file)), { level: 9 }).length;
  const withShared = (head = link) => {
    setup({ head });
    put(`dist/${SHARED}`, Array.from({ length: 200 }, (_, i) => `.s${i}{margin:${i * 7919}px}`).join('\n'));
    put(`dist/${STATE}`, Array.from({ length: 200 }, (_, i) => `export const s${i} = ${i * 7919};`).join('\n'));
  };

  it('passes one stylesheet and one script, and a privacy page of its own that index.html does not link', () => {
    setup(); // with dist/privacy.html, its own stylesheet and both precached
    const r = run();
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/ok\s+Page files 1 script, 1 stylesheet/);
    expect(report().main.css).toMatchObject({ file: 'assets/index-abc.css', files: ['assets/index-abc.css'], gzip: gz('assets/index-abc.css') });
  });

  it('fails when the page links a second stylesheet that budget.json does not name', () => {
    withShared();
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/OVER\s+Page files/);
    expect(r.out).toContain(`The page links 2 stylesheets: assets/index-abc.css, ${SHARED}.`);
    expect(r.out).toContain('extraCss');
    expect(report().over).toEqual(['Page files']);
    expect(report().ok).toBe(false);
  });

  it('adds a second stylesheet that budget.json names, and counts its bytes in the CSS line', () => {
    withShared();
    lists(['shared']);
    const r = run();
    expect(r.code, r.out).toBe(0);
    const css = report().main.css;
    expect(css.files).toEqual(['assets/index-abc.css', SHARED]);
    expect(css.gzip).toBe(gz('assets/index-abc.css') + gz(SHARED));
    expect(css.gzip).toBeGreaterThan(gz('assets/index-abc.css') + 200);
    expect(r.out).toMatch(/CSS\s+[\d,]+ B of [\d,]+ B, [\d,]+ to spare\s+\(assets\/index-abc\.css and assets\/shared-123\.css\)/);
  });

  it('is over its row when the second stylesheet takes the CSS line over, though the first alone is under', () => {
    withShared();
    put('budget.json', JSON.stringify({ phase: 1, js: 1e6, css: gz('assets/index-abc.css') + 50, html: 1e6, precacheKiB: 1000, extraCss: ['shared'], extraJs: [] }));
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/OVER\s+CSS/);
  });

  it('fails when the page loads a second script that budget.json does not name, and passes it named', () => {
    withShared(preload);
    let r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain(`The page starts 2 scripts: assets/index-abc.js, ${STATE}.`);
    expect(r.out).toContain('extraJs');
    lists([], ['state']);
    r = run();
    expect(r.code, r.out).toBe(0);
    expect(report().main.js.files).toEqual(['assets/index-abc.js', STATE]);
  });

  it('names a file by what comes before its hash, so a longer name does not name a shorter one', () => {
    withShared();
    for (const names of [['share'], ['shared-123'], ['assets/shared'], ['']]) {
      lists(names);
      expect(run().code, names.join()).toBe(1);
    }
    lists(['shared']);
    expect(run().code).toBe(0);
  });

  it('fails when a stylesheet the page links is not in dist/', () => {
    setup({ head: link });
    lists(['shared']);
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain(`dist/index.html links ${SHARED}, which is not in dist/.`);
  });

  it('fails with a sentence when budget.json has no list for the extra files', () => {
    setup();
    put('budget.json', JSON.stringify({ phase: 1, js: 1e6, css: 1e6, html: 1e6, precacheKiB: 1000 }));
    let r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('budget.json has no list for "extraCss".');
    put('budget.json', JSON.stringify({ phase: 1, js: 1e6, css: 1e6, html: 1e6, precacheKiB: 1000, extraCss: [], extraJs: 'state' }));
    r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('budget.json has no list for "extraJs".');
  });
});

// The static pages are files the host serves (P1.16, 07 4.2): in dist/, in the precache, and named in the
// service worker's navigation denylist. The precache route answers first for a page that is precached, so the
// denylist is what keeps /privacy from index.html if that entry is ever lost.
describe('the static pages', () => {
  const report = () => JSON.parse(readFileSync(join(dir, 'dist/budget-report.json'), 'utf8'));

  it('passes a privacy page that is built, precached and in the denylist, and says so', () => {
    setup();
    const r = run();
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/ok\s+Static pages privacy/);
    expect(report().static).toEqual({ pages: ['privacy'], denied: ['admin'], problems: [] });
    expect(report().ok).toBe(true);
  });

  it('fails when dist/privacy.html is missing', () => {
    setup({ privacy: false });
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/OVER\s+Static pages/);
    expect(r.out).toContain('dist/privacy.html is missing.');
    expect(report().over).toEqual(['Static pages']);
    expect(report().ok).toBe(false);
  });

  it('fails when the service worker does not precache it', () => {
    setup({ privacyCached: false });
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('The service worker does not precache privacy.html, so /privacy does not open offline.');
  });

  it('fails when the stylesheet the page links is not precached, so it would open unstyled offline', () => {
    setup({ privacyCssCached: false });
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain('The service worker does not precache assets/privacy-stu.css, which privacy.html links, so /privacy opens unstyled offline.');
    expect(report().over).toEqual(['Static pages']);
  });

  it('fails when the denylist does not name /privacy, and when there is no navigation route', () => {
    setup({ deny: '/^\\/api\\//' });
    let r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain("The service worker's navigation denylist does not name /privacy");
    setup({ deny: null });
    r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain("The service worker's navigation denylist does not name /privacy");
  });

  // The denylist is read as text. A file that put code there would still be only read: the check fails
  // for the missing pattern, and the code is not run (exit code 7 would be its trace).
  it('reads the denylist and never runs it', () => {
    setup({ deny: '/^\\/api\\//,process.exit(7)' });
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain("The service worker's navigation denylist does not name /privacy");
  });

  it('takes any pattern that matches /privacy, and not one that only looks like it', () => {
    setup({ deny: `/^\\/api\\//,/^\\/privacy$/,${ADMIN_DENY}` });
    expect(run().code).toBe(0);
    setup({ deny: `/^\\/api\\//,/^\\/privacy-policy$/,${ADMIN_DENY}` });
    expect(run().code).toBe(1);
    setup({ deny: `/^\\/api\\//,/^\\/(terms|about)$/,${ADMIN_DENY}` });
    expect(run().code).toBe(1);
  });

  // The owner's page is drawn by the app, so the fallback would answer it with index.html (P1.18). Cloudflare Access
  // stands in front of /admin and meets only a navigation that reaches the network: a worker that answered it from the
  // precache would show the shell and then fail to read the numbers, with no way to sign in.
  it('fails when the denylist does not name /admin, and says why', () => {
    setup({ deny: '/^\\/api\\//,/^\\/(privacy|terms|about)$/' });
    let r = run();
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/OVER\s+Static pages/);
    expect(r.out).toContain("The service worker's navigation denylist does not name /admin");
    expect(r.out).toContain('Cloudflare Access');
    expect(r.out).not.toContain('does not name /privacy');
    expect(report().over).toEqual(['Static pages']);
    setup({ deny: null });
    r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain("The service worker's navigation denylist does not name /admin");
  });

  it('takes a pattern that matches /admin, and not one that only looks like it', () => {
    setup({ deny: '/^\\/api\\//,/^\\/(privacy|terms|about)$/,/^\\/admin$/' });
    expect(run().code).toBe(0);
    setup({ deny: '/^\\/api\\//,/^\\/(privacy|terms|about)$/,/^\\/administrator$/' });
    expect(run().code).toBe(1);
    setup({ deny: '/^\\/api\\//,/^\\/(privacy|terms|about)$/,/^\\/mod(\\/|$)/' });
    expect(run().code).toBe(1);
  });
});
