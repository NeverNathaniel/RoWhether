// scripts/budget.mjs and the lazy chunk list (P1.2a; 07 10.6 item 3, 08 17.3).
// The script reads dist/ from the folder above its own, so each case copies it to
// a scratch folder with a small stand-in for dist/ and runs it there. The real
// build's numbers are the budget step's in CI; these cases are for what it must
// refuse: a lazy chunk that is missing, loaded by the page, or in the wrong
// place in the precache.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// A passing dist/ for one location, "a", a views chunk, a suggest-form chunk and a picker
// chunk with its stylesheet (the last two always in the precache: the cases below break the
// views chunk, and each case for the others breaks one thing). Each option is a thing to break.
const FORM = 'assets/suggest-form-ghi.js';
const PICKER = 'assets/picker-jkl.js';
const PICKER_CSS = 'assets/picker-mno.css';
function setup({ head = '', precache = ['index.html', 'assets/index-abc.js', 'assets/index-abc.css', 'locations/index.json', 'locations/a.json', 'assets/views-def.js'], chunk = 'assets/views-def.js', form = FORM, formCached = true, picker = PICKER, pickerCached = true, pickerCss = PICKER_CSS, pickerCssCached = true } = {}) {
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(SCRIPT, join(dir, 'scripts/budget.mjs'));
  put('budget.json', JSON.stringify({ phase: 1, js: 1e6, css: 1e6, html: 1e6, precacheKiB: 1000 }));
  put('dist/index.html', page(head));
  put('dist/a.html', page(head).replace('<title>RoWhether</title>', '<title>A rowing conditions</title>').replace(/(canonical" href|og:url" content)="https:\/\/rowhether.com\/"/g, '$1="https://rowhether.com/a"'));
  put('dist/assets/index-abc.js', 'export const x = 1;\n'.repeat(50));
  put('dist/assets/index-abc.css', 'a { color: red }\n'.repeat(50));
  if (chunk) put(`dist/${chunk}`, 'export const views = {};\n'.repeat(80));
  if (form) put(`dist/${form}`, 'export const form = {};\n'.repeat(40));
  if (picker) put(`dist/${picker}`, 'export const picker = {};\n'.repeat(60));
  if (pickerCss) put(`dist/${pickerCss}`, '.pk { color: red }\n'.repeat(20));
  put('dist/locations/index.json', JSON.stringify({ locations: [{ slug: 'a' }] }));
  put('dist/locations/a.json', '{}');
  const cached = [...precache, ...(formCached ? [FORM] : []), ...(picker && pickerCached ? [picker] : []), ...(pickerCss && pickerCssCached ? [pickerCss] : [])];
  put('dist/sw.js', `precacheAndRoute([${cached.map(u => `{url:"${u}",revision:null}`).join(',')}],{});`);
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
    expect(r.out).toMatch(/ok\s+Lazy chunks views, suggest-form, picker/);
    expect(r.out).toMatch(/views\s+[\d,]+ B gzip, 2,000 B raw, precached\s+\(assets\/views-def\.js\)/);
    expect(r.out).toMatch(/suggest-form\s+[\d,]+ B gzip, 960 B raw, precached\s+\(assets\/suggest-form-ghi\.js\)/);
    expect(r.out).toMatch(/picker\s+[\d,]+ B gzip, 1,560 B raw, precached\s+\(assets\/picker-jkl\.js\)/);
    const report = JSON.parse(readFileSync(join(dir, 'dist/budget-report.json'), 'utf8'));
    expect(report.ok).toBe(true);
    expect(report.lazy.chunks).toMatchObject([
      { name: 'views', file: 'assets/views-def.js', precache: true, precached: true },
      { name: 'suggest-form', file: FORM, precache: true, precached: true },
      { name: 'picker', file: PICKER, precache: true, precached: true }
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

  // The picker works offline only with its styles: a chunk that imports a stylesheet has it as a file of its own.
  it("fails when the picker's stylesheet is not in the precache", () => {
    setup({ pickerCssCached: false });
    const r = run();
    expect(r.code).toBe(1);
    expect(r.out).toContain(`The service worker does not precache ${PICKER_CSS}, the stylesheet of the picker chunk.`);
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
