// The real page against the golden outputs (08 14.2, review Z1). The golden
// cases build their own state and call the render functions, so they never run
// the page's own path: storage, fetchAll, the parsers, render(), the Day by day
// rows and the tab router. This spec loads the page with the golden fixtures
// and compares what it draws with what the capture drew for the same inputs:
//
//   the home screen   every element the golden file lists, from the file itself
//   full forecasts    each Day by day row, opened, against forecastPanel()
//   the tabs          each view, for its default day and every other day
//
// The capture runs here in Node through Vite's own module loader. Playwright's
// loader cannot import the JSON files that src/putney.js reads, so a plain
// import of the capture would stop working when state.js starts to use them
// (P0.7). Its HTML is parsed by the page and compared as text with the white
// space collapsed, so a change in how the browser serializes a tag cannot fail it.
//
// Date is pinned to each case's clock, and the zone and locale are not the
// machine's (review Z11), so a line that reads the screen's zone fails here.
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { test, expect } from '@playwright/test';
import { SCENARIOS, routeAll, ready, tabDrawn } from './fixtures.js';

test.use({ timezoneId: 'Pacific/Auckland', locale: 'de-DE' });

const GOLDEN = new URL('../golden/', import.meta.url);
const golden = name => JSON.parse(readFileSync(new URL(`${name}.json`, GOLDEN), 'utf8'));
const sha = s => createHash('sha256').update(s).digest('hex');

// The nine default cases and the nine custom cases run at 390 px and the wide
// one at 1280 px, the two projects of playwright.config.js. A default case runs
// with empty storage. A custom case starts with the settings the capture used
// (the values of CUSTOM that differ from BASE, and the heading of its location)
// saved in rowhether-settings-v2, as the dialog saves them, so what the page
// reads back from storage is checked against the same golden files (FC5, FC9).
const files = readdirSync(GOLDEN).map(f => f.replace(/\.json$/, ''));
const NARROW = files.filter(n => /^(june-calm|october-fog|april-high-water|fall-back)-\d{4}-(default|custom)$/.test(n));
const WIDE = ['june-calm-1200-wide'];
const TABS = ['week', 'wind', 'river', 'storms', 'fog', 'temperature', 'rain', 'light', 'air'];

// The capture, loaded once per worker.
let loaded;
function loadCapture() {
  loaded ??= (async () => {
    const vite = await createServer({ configFile: false, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false, watch: null } });
    try { return await vite.ssrLoadModule('/test/golden/capture.js'); } finally { await vite.close(); }
  })();
  return loaded;
}

// Every string the capture wrote for one case at one page width, by name.
async function drawn(name, width) {
  const { ALL_CASES, capture } = await loadCapture();
  const c = ALL_CASES.find(x => x.name === name);
  const html = {};
  const real = Date.now;
  Date.now = () => c.clock;
  try { capture(c.scenario, c.clock, c.settings, { loc: c.loc, width, sink: (k, s) => { html[k] = s; } }); } finally { Date.now = real; }
  return html;
}

// Text of an HTML string as the browser reads it, white space collapsed.
const textOf = (page, html) => page.evaluate(h => {
  const t = document.createElement('template');
  t.innerHTML = h;
  return t.content.textContent.replace(/\s+/g, ' ').trim();
}, html);

// Go to a view and give back what the page drew in it. The views load as a lazy
// chunk (P1.2a), so wait until the page says the one asked for has drawn.
async function view(page, hash) {
  await page.evaluate(h => new Promise(done => { location.hash = h; setTimeout(done, 0); }), hash);
  const key = hash.split('/')[0];
  if (key) await tabDrawn(page, key);
  return page.evaluate(() => document.getElementById('detailBody').textContent.replace(/\s+/g, ' ').trim());
}

// What a viewer of a custom case has saved: the limits that differ from the
// defaults, and the course heading, written plainly and not by the app's own
// code, so a step that drops one of them shows here.
async function savedFor() {
  const { BASE, CUSTOM, LOCS } = await loadCapture();
  const values = Object.fromEntries(Object.entries(CUSTOM).filter(([k, v]) => v !== BASE[k]));
  values.heading = LOCS.custom.course.heading;
  return { 'rowhether-migrated-v1': '1', 'rowhether-settings-v2': JSON.stringify({ 'putney-landing': { saved: 1, values } }) };
}

function parity(name, hr, scenarioName) {
  test(name, async ({ page }) => {
    const scenario = SCENARIOS[scenarioName], clock = scenario.clock(hr);
    await page.clock.setFixedTime(clock);
    const seen = await routeAll(page, scenario, clock);
    if (name.endsWith('-custom')) {
      await page.addInitScript(items => { for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v); }, await savedFor());
    }
    await page.goto('/');
    await ready(page);
    expect(seen.missing).toEqual([]);
    const want = golden(name);

    // The home screen, against the golden file. `updated` is left out: the page
    // fetches at the clock, and the capture's data came three minutes before.
    for (const [id, w] of Object.entries(want.home)) {
      if (id === 'updated') continue;
      const have = await page.evaluate(i => { const e = document.getElementById(i); return { text: e.textContent, hidden: !!e.hidden }; }, id);
      expect(have.hidden, `#${id} hidden`).toBe(w.hidden);
      // An empty container was only flagged by the render code.
      if (w.innerHTML === '') continue;
      const text = typeof w.textContent === 'string' ? have.text : { length: have.text.length, sha256: sha(have.text) };
      expect(text, `#${id}`).toEqual(w.textContent);
    }

    // Chart widths follow the page, so the capture draws at the page's width.
    await view(page, 'week');
    const width = await page.evaluate(() => document.getElementById('detail').clientWidth);
    const html = await drawn(name, width);

    // The tabs, each for its default day first: a picked day carries from view
    // to view, so the explicit days come after.
    for (const key of TABS) expect(await view(page, key), `#${key}`).toBe(await textOf(page, html[`views/${key}/null.html`]));
    for (const key of TABS) {
      for (const day of Object.keys(want.views[key].days).filter(d => d !== 'null')) {
        expect(await view(page, `${key}/${day}`), `#${key}/${day}`).toBe(await textOf(page, html[`views/${key}/${day}.html`]));
      }
    }

    // Each full forecast, opened. The toggle event is async, so wait for them all.
    await view(page, '');
    const ids = Object.keys(want.forecasts);
    expect(await page.locator('#days details.period').count(), 'rows on the page').toBe(ids.length);
    await page.evaluate(() => document.querySelectorAll('#days details.period').forEach(d => { d.open = true; }));
    await expect(page.locator('#days .forecast')).toHaveCount(ids.length);
    for (const id of ids) {
      const have = await page.locator(`#days details[data-id="${id}"] .forecast`).evaluate(e => e.textContent.replace(/\s+/g, ' ').trim());
      expect(have, `forecast ${id}`).toBe(await textOf(page, html[`forecasts/${id}.html`]));
    }
  });
}

test.describe('the page equals the golden outputs', () => {
  for (const [list, wide] of [[NARROW, false], [WIDE, true]]) {
    for (const name of list) {
      const [, scenarioName, hh] = /^(.+)-(\d\d)00-/.exec(name);
      test.describe(name, () => {
        test.skip(({ viewport }) => (viewport.width >= 1000) !== wide, `${name} runs at ${wide ? 1280 : 390} px`);
        parity(name, +hh, scenarioName);
      });
    }
  }
});
