// P1.2a: the nine detail views are one lazy chunk. renderDetail() draws the
// view's name and "Loading." until the view's module has arrived, imports it
// once, and draws when it lands. The loads here are stand-ins that the test
// settles by hand, on a fake page; the real import is the browser checks'.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeDom, uninstallFakeDom } from './helpers/fakedom.js';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const ORDER = ['week', 'wind', 'river', 'storms', 'fog', 'temperature', 'rain', 'light', 'air'];
const flush = () => new Promise(done => setTimeout(done, 0));

let app, VIEWS, renderDetail, dom;

// A view module that draws a marker for its key and the day it was given.
const fake = key => ({ key, name: key, summary: () => '', render: (m, day) => ({ day: day || 'd0', html: `<h3>drawn ${key} ${day || 'none'}</h3>` }) });

// Every view's load becomes one that the test settles. loads[key].calls counts the imports started.
function hold() {
  const loads = {};
  for (const v of VIEWS) {
    const l = loads[v.key] = { calls: 0 };
    v.load = () => { l.calls++; return new Promise((ok, no) => { l.ok = () => ok(fake(v.key)); l.no = no; }); };
  }
  return loads;
}

const body = () => dom.el('detailBody');
const open = (name, day = null) => { app.view = { name, day }; renderDetail(); };

// A fresh registry for each test: what has loaded is module state in index.js.
beforeEach(async () => {
  vi.resetModules();
  dom = installFakeDom();
  ({ app } = await import('../src/state.js'));
  ({ VIEWS, renderDetail } = await import('../src/render/detail/index.js'));
  Object.assign(app, { model: {}, errors: {}, view: null, detailDay: null });
});
afterEach(() => uninstallFakeDom());

describe('the view registry', () => {
  it('lists the nine views in tab order', () => {
    expect(VIEWS.map(v => v.key)).toEqual(ORDER);
  });

  it('gives each view the key and name its module carries, and loads that module from views.js', async () => {
    const { MODULES } = await import('../src/render/detail/views.js');
    expect(Object.keys(MODULES).sort()).toEqual([...ORDER].sort());
    for (const v of VIEWS) {
      const mod = await v.load();
      expect(mod, v.key).toBe(MODULES[v.key]);
      expect([mod.key, mod.name], v.key).toEqual([v.key, v.name]);
      expect(typeof mod.summary).toBe('function');
      expect(typeof mod.render).toBe('function');
    }
  });

  it('is the only place in src/ that imports a view module', () => {
    const views = new Set(ORDER.map(k => join(SRC, 'render/detail', `${k}.js`)));
    const files = [];
    (function walk(dir) {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.js')) files.push(p);
      }
    })(SRC);
    const importers = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.[^'"]+)['"]/g)) {
        if (views.has(resolve(dirname(file), m[1]))) importers.push(`${file.slice(SRC.length)} imports ${m[1]}`);
      }
    }
    expect(importers.every(x => x.startsWith('render/detail/views.js '))).toBe(true);
    expect(importers).toHaveLength(ORDER.length);
  });
});

describe('renderDetail with a lazy module', () => {
  it('shows the name and Loading., and no data-view, while the module has not arrived', () => {
    const loads = hold();
    open('wind');
    expect(body().innerHTML).toContain('<h2 id="detailTitle" class="vh">Wind</h2>');
    expect(body().textContent).toContain('Loading.');
    expect(body().dataset.view).toBeUndefined();
    expect(loads.wind.calls).toBe(1);
  });

  it('draws the view and sets data-view when the module arrives', async () => {
    const loads = hold();
    open('wind', '2026-10-14');
    loads.wind.ok();
    await flush();
    expect(body().innerHTML).toBe('<h3>drawn wind 2026-10-14</h3>');
    expect(body().dataset.view).toBe('wind');
  });

  it('draws a view with the day it was asked for, else the day last picked', async () => {
    const loads = hold();
    app.detailDay = '2026-10-15';
    open('wind');
    loads.wind.ok();
    await flush();
    expect(body().innerHTML).toBe('<h3>drawn wind 2026-10-15</h3>');
    open('wind', '2026-10-16');
    expect(body().innerHTML).toBe('<h3>drawn wind 2026-10-16</h3>');
  });

  it('draws the open view, not the one that asked, when a switch comes before the load resolves', async () => {
    const loads = hold();
    open('wind');
    open('river');
    loads.wind.ok();
    await flush();
    expect(body().innerHTML).not.toContain('wind');
    expect(body().textContent).toContain('Loading.');
    expect(body().dataset.view).toBeUndefined();
    loads.river.ok();
    await flush();
    expect(body().innerHTML).toBe('<h3>drawn river none</h3>');
    expect(body().dataset.view).toBe('river');
  });

  it('draws nothing when no view is open by the time the module arrives, and uses it without a second import later', async () => {
    const loads = hold();
    open('wind');
    const loading = body().innerHTML;
    app.view = null;
    loads.wind.ok();
    await flush();
    expect(body().innerHTML).toBe(loading);
    expect(body().dataset.view).toBeUndefined();
    open('wind');
    expect(body().innerHTML).toBe('<h3>drawn wind none</h3>');
    expect(loads.wind.calls).toBe(1);
  });

  it('starts one import for two calls before it resolves, and none once the module is in', async () => {
    const loads = hold();
    open('wind');
    renderDetail();
    expect(loads.wind.calls).toBe(1);
    loads.wind.ok();
    await flush();
    renderDetail();
    expect(loads.wind.calls).toBe(1);
  });

  it('keeps Loading. when the import fails, and tries again on the next call', async () => {
    const loads = hold();
    open('wind');
    const loading = body().innerHTML;
    loads.wind.no(new Error('chunk failed'));
    await flush();
    expect(body().innerHTML).toBe(loading);
    expect(body().dataset.view).toBeUndefined();
    expect(loads.wind.calls).toBe(1);
    renderDetail();
    expect(loads.wind.calls).toBe(2);
    expect(body().innerHTML).toBe(loading);
    loads.wind.ok();
    await flush();
    expect(body().innerHTML).toBe('<h3>drawn wind none</h3>');
    expect(body().dataset.view).toBe('wind');
  });

  it('says there is no data, as it did, when the forecast failed and the module has not arrived', () => {
    const loads = hold();
    Object.assign(app, { model: null, errors: { wx: true } });
    open('wind');
    expect(body().textContent).toContain('No data yet. Check the connection, then tap Refresh.');
    expect(body().dataset.view).toBeUndefined();
    // The chunk is read at once, so it is in by the time the forecast arrives.
    expect(loads.wind.calls).toBe(1);
  });

  it('says Loading. with no forecast yet and no failure, and sets no data-view once the module is in', async () => {
    const loads = hold();
    app.model = null;
    open('wind');
    loads.wind.ok();
    await flush();
    expect(body().textContent).toContain('Loading.');
    expect(body().dataset.view).toBeUndefined();
  });

  it('draws nothing and starts nothing on the home screen', () => {
    const loads = hold();
    renderDetail();
    expect(body().written).toBe(false);
    expect(Object.values(loads).map(l => l.calls)).toEqual(new Array(9).fill(0));
  });
});
