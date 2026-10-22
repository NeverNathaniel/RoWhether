// Functional checks that do not compare pixels. Date is pinned with
// page.clock.setFixedTime to 12:00 Eastern on the june-calm day. Without a
// fixed time every fixture hour is in the past and the page shows the No data
// screen, which is too short to test the tab bar. Timers stay real.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { SCENARIOS, routeAll, ready, tabDrawn, hold, loadCapture } from './fixtures.js';

// Not the machine's zone or language, so a line that reads the screen's instead
// of the location's fails here and not only on someone else's laptop (review Z11).
test.use({ timezoneId: 'Pacific/Auckland', locale: 'de-DE' });

const scenario = SCENARIOS['june-calm'];
const clock = scenario.clock(12);
// The nine URLs and names P0.1 recorded in a golden file. The page must ask for
// exactly these, not only for something the fixtures answer on the same path.
const GOLDEN = JSON.parse(readFileSync(new URL('../golden/june-calm-1200-default.json', import.meta.url), 'utf8'));
const TABS = ['now', 'week', 'wind', 'river', 'storms', 'fog', 'temperature', 'rain', 'light', 'air'];
// The record the build wrote for Putney, which the page fetches from /locations/putney-landing.json.
const PUTNEY_FILE = JSON.parse(readFileSync(new URL('../../dist/locations/putney-landing.json', import.meta.url), 'utf8'));
// Another location, which the page can open: Putney's record at another address, with the
// course turned east. Its sources are Putney's, so the fixtures answer it.
const LAKE_FILE = { ...PUTNEY_FILE, slug: 'lake-test', name: 'Lake Test', course: { ...PUTNEY_FILE.course, heading: 90 } };
const seedStorage = (page, items) => page.addInitScript(entries => { for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); }, items);
// A move inside the page, as the picker will make it: the address changes and popstate follows.
const moveTo = (page, path) => page.evaluate(p => { history.pushState(null, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
// An iPhone in Safari: the user agent that gets the install bar and its written steps.
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';

// What the console must not show. Two things the test setup causes are let
// through: the 404s for /api/info and /api/suggest (the fixtures answer as a
// static host does, and Chromium logs every 404 it sees), and Playwright's own
// note that it blocked service worker registration (playwright.config.js).
function watchConsole(page) {
  const bad = [];
  page.on('pageerror', e => bad.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (!['error', 'warning'].includes(m.type())) return;
    if (m.text() === 'Service Worker registration blocked by Playwright') return;
    const { url = '' } = m.location();
    if (/Failed to load resource.*404/.test(m.text()) && /\/api\/(info|suggest)$/.test(url)) return;
    bad.push(`${m.type()}: ${m.text()} (${url})`);
  });
  return bad;
}

test.describe('smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
  });

  test('the console is clean and every source is read from the fixtures', async ({ page }) => {
    const bad = watchConsole(page);
    const seen = await routeAll(page, scenario, clock);
    await page.goto('/');
    await ready(page);
    for (const tab of TABS.slice(1)) {
      await page.goto(`/#${tab}`);
      await expect(page.locator('#detail')).toBeVisible();
      await tabDrawn(page, tab);
    }
    expect(bad).toEqual([]);
    // Exactly the nine golden requests, none aborted and none unmatched.
    expect(seen.aborted).toEqual([]);
    expect(seen.missing).toEqual([]);
    expect([...seen.served].sort()).toEqual(GOLDEN.sources.map(x => x[1]).sort());
  });

  test('the home screen and every tab fit the page width', async ({ page }, testInfo) => {
    await routeAll(page, scenario, clock);
    const widths = [...new Set([testInfo.project.use.viewport.width, 360])];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      for (const tab of TABS) {
        await page.goto(tab === 'now' ? '/' : `/#${tab}`);
        await ready(page);
        if (tab !== 'now') await tabDrawn(page, tab);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `${tab} at ${width} px overflows by ${over} px`).toBeLessThanOrEqual(0);
      }
    }
  });

  test('the tab bar stays pinned when the page scrolls', async ({ page }) => {
    await routeAll(page, scenario, clock);
    for (const hash of ['', '#wind']) {
      await page.goto(`/${hash}`);
      await ready(page);
      if (hash) await tabDrawn(page, hash.slice(1));
      await page.evaluate(() => window.scrollTo(0, 700));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
      const top = await page.evaluate(() => document.getElementById('tabs').getBoundingClientRect().top);
      expect(Math.abs(top), `tab bar top at ${hash || 'home'}`).toBeLessThanOrEqual(1);
    }
  });

  // P1.2a: the nine views are one lazy chunk, views-<hash>.js. The first hero
  // needs none of it, so a page with no tab in its address never asks for it;
  // the first tab opened does, once; and a start at a tab address draws the tab.
  test.describe('the views chunk', () => {
    const chunk = u => /\/assets\/views-[^/]+\.js$/.test(new URL(u).pathname);
    const requests = page => { const seen = []; page.on('request', r => { if (chunk(r.url())) seen.push(r.url()); }); return seen; };

    test('is not requested before the first tab opens, and is requested once after', async ({ page }) => {
      const seen = requests(page);
      await routeAll(page, scenario, clock);
      await page.goto('/');
      await ready(page);
      // Open a Day by day row too: nothing on the home screen reads a view.
      const row = page.locator('#days details.period').first();
      await row.locator('summary').click();
      await row.locator('.forecast').waitFor();
      await page.waitForLoadState('networkidle');
      expect(seen, 'requests for the views chunk on the home screen').toEqual([]);
      await page.locator('#tabs a[data-tab="wind"]').click();
      await tabDrawn(page, 'wind');
      expect(seen).toHaveLength(1);
      await page.locator('#tabs a[data-tab="fog"]').click();
      await tabDrawn(page, 'fog');
      await page.locator('#tabs a[data-tab="week"]').click();
      await tabDrawn(page, 'week');
      expect(seen, 'one request serves every tab').toHaveLength(1);
    });

    test('a start at a tab address draws the tab, with one request for the chunk', async ({ page }) => {
      const seen = requests(page);
      await routeAll(page, scenario, clock);
      await page.goto('/#wind');
      await ready(page);
      await tabDrawn(page, 'wind');
      await expect(page.locator('#tabs a[data-tab="wind"]')).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('#detailBody')).not.toContainText('Loading.');
      await expect(page.locator('#detailBody .strip')).toBeVisible();
      expect(seen).toHaveLength(1);
    });

    // The import fails: the tab says Loading. and nothing else breaks. Chromium
    // remembers a failed import for the life of the page (checked on 141), so the
    // retry that a refresh makes cannot draw the tab here; a reload does. Chromium
    // logs the failed request, so only a page error is a bug.
    test('a failed load keeps Loading., leaves the home screen working, and a reload draws the tab', async ({ page }) => {
      const bad = [];
      page.on('pageerror', e => bad.push(e.message));
      await routeAll(page, scenario, clock);
      const blocked = url => chunk(url.href), abort = r => r.abort('failed');
      await page.route(blocked, abort);
      await page.goto('/#wind');
      await ready(page);
      await expect(page.locator('#detailBody')).toContainText('Loading.');
      await expect(page.locator('#detailBody')).not.toHaveAttribute('data-view', /.*/);
      await page.locator('#refreshBtn').click();
      await ready(page);
      await expect(page.locator('#detailBody')).toContainText('Loading.');
      await page.locator('#tabs a[data-tab="now"]').click();
      await expect(page.locator('#verdict')).toHaveText('Go.');
      await page.unroute(blocked, abort);
      await page.goto('/#wind');
      await page.reload();
      await ready(page);
      await tabDrawn(page, 'wind');
      await expect(page.locator('#detailBody')).not.toContainText('Loading.');
      expect(bad).toEqual([]);
    });

    // After one online visit the worker has the chunk, so a tab opens with no network.
    test.describe('offline', () => {
      test.use({ serviceWorkers: 'allow' });

      test('after one online visit, a tab opens from the precache', async ({ page, context }) => {
        const bad = [];
        page.on('pageerror', e => bad.push(e.message));
        await routeAll(page, scenario, clock);
        await page.goto('/');
        await ready(page);
        await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
        // No fixtures and no network: only the worker and the saved copy answer.
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        await context.setOffline(true);
        await page.reload();
        await ready(page);
        expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
        await page.locator('#tabs a[data-tab="river"]').click();
        await tabDrawn(page, 'river');
        await expect(page.locator('#detailBody')).not.toContainText('Loading.');
        await page.locator('#tabs a[data-tab="week"]').click();
        await tabDrawn(page, 'week');
        expect(bad).toEqual([]);
      });
    });
  });

  // Some browsers throw from the localStorage property itself (site data
  // blocked), not from getItem. A guard that reads it at import, or checks
  // `typeof localStorage` outside a try, passes in Node and in a normal browser
  // and leaves a blank page here (review Z8).
  test('storage that throws on access: the page still draws and Plan a row opens', async ({ page }) => {
    const bad = watchConsole(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() { throw new DOMException('The operation is insecure.', 'SecurityError'); }
      });
    });
    await routeAll(page, scenario, clock);
    await page.goto('/');
    await ready(page);
    await expect(page.locator('#verdict')).toHaveText('Go.');
    await page.goto('/#week');
    await expect(page.locator('#detail h3', { hasText: 'Plan a row' })).toBeVisible();
    expect(bad).toEqual([]);
  });

  // Dock reports and the Dev label draw only when /api/info says so, and the
  // fixtures answer it 404, so no other spec runs them. render() hands them the
  // model: a report is compared with the forecast water state for its hour
  // (review Z12). Routes registered last answer first, so these go in after routeAll.
  test('dock reports: the Dev label, and a report set against the forecast', async ({ page }) => {
    await routeAll(page, scenario, clock);
    await page.route('**/api/info', r => r.fulfill({ json: { env: 'dev', reports: true } }));
    await page.route('**/api/reports', r => r.fulfill({ json: { enabled: true, hours: 3, reports: [{ t: clock - 20 * 60e3, water: 'chop', fog: 'patchy', debris: false }] } }));
    await page.goto('/');
    await ready(page);
    await expect(page.locator('#envBadge')).toBeVisible();
    await expect(page.locator('#envBadge')).toHaveText('Dev');
    await expect(page.locator('#dockReports .dock-sum')).toBeVisible();
    await expect(page.locator('#dockReports .dock-sum')).toHaveText('At the dock: Chop, patchy fog, 20 min ago (11:40 AM). The forecast said light chop.');
  });

  // The click handler, not only shareText(): the title, the text and the link the
  // share sheet is given (review Z13). A page with no /api/info is production.
  test('Share this forecast gives the share sheet the title, the text and the link', async ({ page }) => {
    await page.addInitScript(() => {
      window.__shared = [];
      Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.__shared.push(data); } });
    });
    await routeAll(page, scenario, clock);
    await page.goto('/');
    await ready(page);
    await page.locator('#shareBtn').click();
    await expect.poll(() => page.evaluate(() => window.__shared)).toEqual([{ title: 'Putney Landing rowing forecast', text: GOLDEN.share, url: 'https://rowhether.com/' }]);
  });

  // A section the viewer opened, and a Day by day row, stay open through the
  // 10 minute refresh (review Z14). The fake page the golden cases draw on has
  // no querySelectorAll, so only a browser can see this. The old node is marked,
  // so the wait is for the redraw and not for the click.
  test.describe('a refresh keeps open what the viewer opened', () => {
    async function refreshed(page, selector) {
      await page.locator(selector).first().evaluate(e => { e.dataset.old = '1'; });
      await page.locator('#refreshBtn').click();
      await expect(page.locator(`${selector}[data-old]`)).toHaveCount(0);
      await ready(page);
    }

    test('an Hour by hour section in a tab', async ({ page }) => {
      await routeAll(page, scenario, clock);
      await page.goto('/#wind');
      await ready(page);
      const first = page.locator('#detailBody details[data-keep]').first();
      await first.locator('summary').click();
      await expect(first).toHaveJSProperty('open', true);
      await refreshed(page, '#detailBody details[data-keep]');
      await expect(first).toHaveJSProperty('open', true);
    });

    test('a Day by day row on the home screen', async ({ page }) => {
      await routeAll(page, scenario, clock);
      await page.goto('/');
      await ready(page);
      const first = page.locator('#days details.period').first();
      await first.locator('summary').click();
      await expect(first.locator('.forecast')).toHaveCount(1);
      await refreshed(page, '#days details.period');
      await expect(first).toHaveJSProperty('open', true);
      await expect(first.locator('.forecast')).toHaveCount(1);
    });
  });

  // P0.7: the settings dialog saves only what differs from Putney's defaults
  // and the page reads it back. test/browser/settings.spec.js has the long form.
  test('a changed setting survives a reload, and only the changes are stored', async ({ page }) => {
    // The dialog closes before its close event runs, so poll for what was stored.
    const stored = () => page.evaluate(() => (JSON.parse(localStorage.getItem('rowhether-settings-v2') || '{}')['putney-landing'] || {}));
    const save = async () => {
      await page.locator('#setForm button[value="save"]').click();
      await expect(page.locator('#settings')).toBeHidden();
    };
    await routeAll(page, scenario, clock);
    await page.goto('/');
    await ready(page);
    await page.locator('#settingsBtn').click();
    await page.locator('#setForm [name="windCaution"]').fill('8');
    await page.locator('#setForm [name="waterOverride"]').fill('55');
    await save();
    // Only the two changes, and the dock reading as a number.
    await expect.poll(async () => (await stored()).values).toEqual({ windCaution: 8, waterOverride: 55 });
    expect((await stored()).saved).toBeGreaterThan(0);
    await page.reload();
    await ready(page);
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#setForm [name="windCaution"]')).toHaveValue('8');
    await expect(page.locator('#setForm [name="windOff"]')).toHaveValue('15');
    await expect(page.locator('#setForm [name="waterOverride"]')).toHaveValue('55');
    // Back to the defaults: no values, and the reminder stays hidden.
    await page.locator('#resetSet').click();
    await save();
    await expect.poll(async () => (await stored()).values).toEqual({});
    expect((await stored()).saved).toBeGreaterThan(0);
    await page.reload();
    await ready(page);
    await expect(page.locator('#setNudge')).toBeHidden();
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#setForm [name="windCaution"]')).toHaveValue('10');
  });

  // P1.4: addresses. A location is at /<slug>, and "/" opens the last one (07 5.1).
  test.describe('addresses and locations', () => {
    const stored = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));

    test('"/" with nothing stored draws Putney and keeps the address, and the last location is not stored', async ({ page }) => {
      const bad = watchConsole(page);
      await routeAll(page, scenario, clock);
      await page.goto('/');
      await ready(page);
      await expect(page.locator('#verdict')).toHaveText('Go.');
      expect(new URL(page.url()).pathname).toBe('/');
      const keys = Object.keys(await stored(page));
      // Putney at "/" is not the visitor's choice yet (07 5.1 step 3). What the page loaded is kept.
      expect(keys).not.toContain('rowhether-last-v1');
      expect(keys).toEqual(expect.arrayContaining(['rowhether-loc-v1:putney-landing', 'rowhether-cache-v2:putney-landing', 'rowhether-cache-index-v1', 'rowhether-recent-v1']));
      expect(bad).toEqual([]);
    });

    test('/putney-landing draws Putney, and stores it as the last location, the record, the index and the recent list', async ({ page }) => {
      const bad = watchConsole(page);
      await routeAll(page, scenario, clock);
      await page.goto('/putney-landing');
      await ready(page);
      await expect(page.locator('#verdict')).toHaveText('Go.');
      expect(new URL(page.url()).pathname).toBe('/putney-landing');
      const all = await stored(page);
      expect(all['rowhether-last-v1']).toBe('putney-landing');
      expect(JSON.parse(all['rowhether-loc-v1:putney-landing']).record).toEqual(PUTNEY_FILE);
      expect(Object.keys(JSON.parse(all['rowhether-cache-index-v1']))).toEqual(['putney-landing']);
      expect(JSON.parse(all['rowhether-recent-v1'])).toEqual(['putney-landing']);
      expect(bad).toEqual([]);
    });

    // An old link, rowhether.com/#wind, with a location stored: the address is replaced, in
    // the same history entry and with no reload. A counter in sessionStorage sees a reload.
    test('"/#wind" with a last location becomes /putney-landing#wind, with no reload and no new history entry', async ({ page }) => {
      await seedStorage(page, { 'rowhether-last-v1': 'putney-landing', 'rowhether-migrated-v1': '1' });
      await page.addInitScript(() => {
        sessionStorage.loads = String(Number(sessionStorage.loads || 0) + 1);
        sessionStorage.length0 = String(history.length); // before the page's own script has run
      });
      await routeAll(page, scenario, clock);
      await page.goto('/#wind');
      await ready(page);
      await tabDrawn(page, 'wind');
      const at = new URL(page.url());
      expect(at.pathname + at.hash).toBe('/putney-landing#wind');
      const [now, before, loads] = await page.evaluate(() => [history.length, Number(sessionStorage.length0), sessionStorage.loads]);
      expect(loads, 'page loads').toBe('1');
      expect(now, 'history entries: the address was replaced, not added').toBe(before);
      await expect(page.locator('#tabs a[data-tab="wind"]')).toHaveAttribute('aria-current', 'page');
    });

    test('a tab address under /putney-landing opens the tab, and a tab link keeps the location in the address', async ({ page }) => {
      await routeAll(page, scenario, clock);
      await page.goto('/putney-landing#fog/2026-06-16');
      await ready(page);
      await tabDrawn(page, 'fog');
      await page.locator('#tabs a[data-tab="wind"]').click();
      await tabDrawn(page, 'wind');
      const at = new URL(page.url());
      expect(at.pathname + at.hash).toBe('/putney-landing#wind');
      await page.locator('#tabs a[data-tab="now"]').click();
      await expect(page.locator('#home')).toBeVisible();
      expect(new URL(page.url()).pathname).toBe('/putney-landing');
    });

    // R1 (owner, 2026-10-21): the saved forecast stays on screen at start, whatever its age. A
    // copy two days old still holds the hour the clock is at, so the hero says what buildModel()
    // gives for it, and not "No data.", while every upstream request is out.
    test('a saved forecast two days older than the clock draws its hero, with every upstream request held', async ({ page }) => {
      await routeAll(page, scenario, clock);
      await page.goto('/putney-landing');
      await ready(page);
      const later = clock + 48 * 3600e3;
      // What the code says for that copy at the later clock, from the same fixtures.
      const { buildModel, dataFrom, BASE, locWith } = await loadCapture();
      // Putney with the course at its own heading, 15, which is Putney.
      const m = buildModel(locWith(15), dataFrom(scenario.raw(clock)), BASE, later);
      expect(m.daytime, 'the later clock is in daylight').toBe(true);
      const word = ['Go.', 'Caution.', 'Stay off.'][m.cur.a.lvl];

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.clock.setFixedTime(later);
      await routeAll(page, scenario, later);
      const out = await hold(page);
      await page.reload();
      await expect(page.locator('#verdict')).toHaveText(word);
      await expect(page.locator('#verdict')).not.toHaveText('No data.');
      await expect(page.locator('#updated')).toHaveText('Refreshing');
      expect(out.held.length, 'the refresh is out').toBeGreaterThan(0);
      await out.release();
    });

    // 07 13, 01 16.5: an install that has only the old keys opens on Putney, and the saved
    // hero is there before any upstream request is answered.
    test('an old install opens at /putney-landing and draws its saved hero while every upstream request is held', async ({ page }) => {
      const bad = [];
      page.on('pageerror', e => bad.push(e.message));
      await routeAll(page, scenario, clock);
      await page.goto('/putney-landing');
      await ready(page);
      const cache = await page.evaluate(() => localStorage.getItem('rowhether-cache-v2:putney-landing'));
      const old = {
        'putney-rowing-settings-v1': JSON.stringify({ heading: 20, windCaution: 10, windOff: 15, gustCaution: 18, gustOff: 25, rainCaution: '', rainOff: 90, coldCombined: 100, flowCaution: 20000, flowOff: 28000, waterOverride: '55', aqiCaution: 151, aqiOff: 201 }),
        'putney-rowing-cache-v1': cache
      };
      await page.evaluate(seed => { localStorage.clear(); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); }, old);
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await routeAll(page, scenario, clock);
      const out = await hold(page);
      await page.goto('/');
      await expect(page.locator('#verdict')).toHaveText('Go.');
      await expect(page.locator('#updated')).toHaveText('Refreshing');
      expect(out.held.length, 'the refresh is out').toBeGreaterThan(0);
      expect(new URL(page.url()).pathname).toBe('/putney-landing');
      await expect(page.locator('#compassCap')).toContainText('upstream heading 20°');
      await expect(page.locator('#setNudge')).toBeHidden();
      await page.locator('#settingsBtn').click();
      await expect(page.locator('#setForm [name="heading"]')).toHaveValue('20');
      await expect(page.locator('#setForm [name="rainCaution"]')).toHaveValue('');
      await expect(page.locator('#setForm [name="waterOverride"]')).toHaveValue('55');
      await page.keyboard.press('Escape');
      await out.release();
      expect(bad).toEqual([]);
    });

    // A saved record is used at once, and the precached index decides after the first draw whether it is
    // still the current one (R14). The index is held so that the first draw is seen.
    test.describe('a saved record and the index', () => {
      const seedRecord = (page, record, fetchedAt = clock) => seedStorage(page, { 'rowhether-migrated-v1': '1', 'rowhether-loc-v1:putney-landing': JSON.stringify({ record, fetchedAt }) });
      const OLD = { ...PUTNEY_FILE, revision: 1, course: { ...PUTNEY_FILE.course, heading: 40 } };
      const savedRecord = page => page.evaluate(() => JSON.parse(localStorage.getItem('rowhether-loc-v1:putney-landing')));

      test('is replaced when the index lists a newer revision, after the first draw', async ({ page }) => {
        await seedRecord(page, OLD);
        await routeAll(page, scenario, clock);
        let release;
        const gate = new Promise(done => { release = done; });
        await page.route('**/locations/index.json', async route => { await gate; await route.fallback(); });
        await page.goto('/putney-landing');
        await ready(page);
        // The saved record drew the page: its heading, though the file the build wrote has another.
        await expect(page.locator('#compassCap')).toContainText('upstream heading 40°');
        release();
        await expect(page.locator('#compassCap')).toContainText('upstream heading 15°');
        await ready(page);
        const record = await savedRecord(page);
        expect(record.record.revision).toBe(PUTNEY_FILE.revision);
        expect(record.record.course.heading).toBe(15);
        expect(record.fetchedAt).toBe(clock);
      });

      test('is kept when its revision is the index revision', async ({ page }) => {
        await seedRecord(page, { ...OLD, revision: PUTNEY_FILE.revision });
        await routeAll(page, scenario, clock);
        const indexed = page.waitForResponse(r => r.url().endsWith('/locations/index.json'));
        await page.goto('/putney-landing');
        await ready(page);
        await indexed;
        await page.waitForLoadState('networkidle');
        await expect(page.locator('#compassCap')).toContainText('upstream heading 40°');
        expect((await savedRecord(page)).record.course.heading).toBe(40);
      });

      test('is fetched again once it is over a day old, even with the index revision', async ({ page }) => {
        await seedRecord(page, { ...OLD, revision: PUTNEY_FILE.revision }, clock - 25 * 3600e3);
        await routeAll(page, scenario, clock);
        await page.goto('/putney-landing');
        await ready(page);
        await page.waitForLoadState('networkidle');
        // The file has the same revision, so the page keeps what it drew, and the copy is dated again.
        await expect(page.locator('#compassCap')).toContainText('upstream heading 40°');
        const record = await savedRecord(page);
        expect(record.fetchedAt).toBe(clock);
        expect(record.record.course.heading).toBe(15);
      });
    });

    // R4: the record is judged by its body. A host may send .json as text/plain or octet-stream.
    for (const type of ['text/plain', 'application/octet-stream']) {
      test(`a record served as ${type} still opens the location`, async ({ page }) => {
        await routeAll(page, scenario, clock);
        await page.route('**/locations/putney-landing.json', route => route.fulfill({ status: 200, contentType: type, body: JSON.stringify(PUTNEY_FILE) }));
        await page.goto('/putney-landing');
        await ready(page);
        await expect(page.locator('#verdict')).toHaveText('Go.');
      });
    }

    test('an HTML page where the record should be, as a single-page fallback gives, is not taken for one', async ({ page }) => {
      await routeAll(page, scenario, clock);
      await page.route('**/locations/putney-landing.json', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>RoWhether</title>' }));
      await page.goto('/putney-landing');
      await expect(page.locator('#notFound')).toContainText('Could not load this location');
    });

    test('a location that does not load says so, with a button that tries again', async ({ page }) => {
      await routeAll(page, scenario, clock);
      await page.route('**/locations/putney-landing.json', route => route.abort('failed'));
      await page.goto('/putney-landing');
      await expect(page.locator('#notFound')).toBeVisible();
      await expect(page.locator('#notFound')).toContainText('Could not load this location');
      for (const id of ['tabs', 'home', 'detail', 'actions']) await expect(page.locator(`#${id}`), id).toBeHidden();
      await page.unroute('**/locations/putney-landing.json');
      await page.getByRole('button', { name: 'Try again' }).click();
      await ready(page);
      await expect(page.locator('#verdict')).toHaveText('Go.');
      await expect(page.locator('#notFound')).toBeHidden();
      await expect(page.locator('#tabs')).toBeVisible();
    });

    // R9: a slow answer for one place never lands in another, and a switch starts its own refresh.
    test('opening another location while the first one\'s answers are out draws the second, and drops the first\'s late answers', async ({ page }) => {
      const bad = watchConsole(page);
      await routeAll(page, scenario, clock);
      await page.route('**/locations/lake-test.json', route => route.fulfill({ json: LAKE_FILE }));
      // Putney's nine requests are held. Everything after them is answered.
      const out = await hold(page, 9);
      await page.goto('/putney-landing');
      await expect.poll(() => out.held.length).toBe(9);
      await moveTo(page, '/lake-test');
      await ready(page);
      await expect(page.locator('#verdict')).toHaveText('Go.');
      await expect(page.locator('#compassCap')).toContainText('upstream heading 90°');
      expect(new URL(page.url()).pathname).toBe('/lake-test');
      const mine = await stored(page);
      expect(mine['rowhether-last-v1']).toBe('lake-test');
      expect(JSON.parse(mine['rowhether-recent-v1'])).toEqual(['lake-test', 'putney-landing']);
      expect(Object.keys(JSON.parse(mine['rowhether-cache-index-v1'])).sort()).toEqual(['lake-test', 'putney-landing']);
      expect(bad, 'the console before the late answers').toEqual([]);
      // Now Putney's answers come, all failed. They are for a place that is no longer open.
      // The app warns about each failed source, so only a page error is a bug from here.
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await out.release();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#statusNote')).toBeHidden();
      await expect(page.locator('#updated')).toHaveText(/^Updated/);
      await expect(page.locator('#refreshBtn')).toBeEnabled();
      expect((await stored(page))['rowhether-cache-v2:putney-landing'], 'a dropped answer is not saved').toBeUndefined();
      expect(errors).toEqual([]);
    });

    // The first location's refresh and the second's are both out. The first one's answers come
    // while the second's are still out: the Refresh button stays off for the second one's.
    test('a late answer for the first location does not free the Refresh button of the second', async ({ page }) => {
      await routeAll(page, scenario, clock);
      await page.route('**/locations/lake-test.json', route => route.fulfill({ json: LAKE_FILE }));
      const warnings = [];
      page.on('console', m => { if (m.type() === 'warning' && m.text().includes('Failed to fetch')) warnings.push(m.text()); });
      const out = await hold(page, 18);
      await page.goto('/putney-landing');
      await expect.poll(() => out.held.length).toBe(9);
      await moveTo(page, '/lake-test');
      await expect.poll(() => out.held.length).toBe(18);
      await expect(page.locator('#refreshBtn')).toBeDisabled();
      // Putney's nine fail. Each one is warned about when it fails.
      await out.release(9);
      await expect.poll(() => warnings.length).toBe(9);
      await expect(page.locator('#refreshBtn'), 'the second location is still refreshing').toBeDisabled();
      await expect(page.locator('#updated')).toHaveText('Refreshing');
      await out.release();
      await expect(page.locator('#refreshBtn')).toBeEnabled();
    });

    // A record that comes after another address was asked for is not opened.
    test('a record that arrives after another location was asked for is not opened', async ({ page }) => {
      await routeAll(page, scenario, clock);
      let release;
      const gate = new Promise(done => { release = done; });
      await page.route('**/locations/lake-test.json', async route => { await gate; await route.fulfill({ json: LAKE_FILE }); });
      await page.goto('/putney-landing');
      await ready(page);
      await moveTo(page, '/lake-test');
      await moveTo(page, '/putney-landing');
      await expect(page.locator('#compassCap')).toContainText('upstream heading 15°');
      release();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#compassCap')).toContainText('upstream heading 15°');
      expect(new URL(page.url()).pathname).toBe('/putney-landing');
      expect((await stored(page))['rowhether-last-v1']).toBe('putney-landing');
    });

    // A saved record is checked against the index after the first draw. If another location
    // is open by then, the answer is not for it.
    test('a newer record that arrives after the location was left is not opened', async ({ page }) => {
      await seedStorage(page, { 'rowhether-migrated-v1': '1', 'rowhether-loc-v1:putney-landing': JSON.stringify({ record: { ...PUTNEY_FILE, revision: 1, course: { ...PUTNEY_FILE.course, heading: 40 } }, fetchedAt: clock }) });
      await routeAll(page, scenario, clock);
      await page.route('**/locations/lake-test.json', route => route.fulfill({ json: LAKE_FILE }));
      let release;
      const gate = new Promise(done => { release = done; });
      await page.route('**/locations/index.json', async route => { await gate; await route.fallback(); });
      await page.goto('/putney-landing');
      await ready(page);
      await expect(page.locator('#compassCap')).toContainText('upstream heading 40°');
      await moveTo(page, '/lake-test');
      await expect(page.locator('#compassCap')).toContainText('upstream heading 90°');
      release();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('#compassCap')).toContainText('upstream heading 90°');
      expect(new URL(page.url()).pathname).toBe('/lake-test');
    });

    // No page has such a link yet (the picker's rows are P1.6's), so the test adds one. The handler is
    // seen from a listener after it: it records whether the app took the click, and turns a modified
    // click into nothing, so no tab opens.
    test('a link with data-nav opens its location in the page, and a modified click is left to the browser', async ({ page }) => {
      await routeAll(page, scenario, clock);
      await page.route('**/locations/lake-test.json', route => route.fulfill({ json: LAKE_FILE }));
      await page.goto('/putney-landing');
      await ready(page);
      await page.evaluate(() => {
        document.body.insertAdjacentHTML('beforeend', '<a id="go" data-nav href="/lake-test">Lake</a><a id="out" data-nav href="https://example.com/x">Out</a>');
        window.__taken = [];
        document.addEventListener('click', e => { window.__taken.push(e.defaultPrevented); if (e.ctrlKey || e.metaKey || e.shiftKey || e.button || e.target.id === 'out') e.preventDefault(); });
      });
      for (const [what, options] of [['ctrl', { modifiers: ['Control'] }], ['meta', { modifiers: ['Meta'] }], ['shift', { modifiers: ['Shift'] }], ['middle', { button: 'middle' }]]) {
        await page.locator('#go').click(options);
        expect(new URL(page.url()).pathname, what).toBe('/putney-landing');
      }
      await page.locator('#out').click();
      expect(new URL(page.url()).hostname, 'a link to another site is left alone').toBe('localhost');
      // A middle click is an auxclick, which the page never sees as a click. The others it saw and left alone.
      expect(await page.evaluate(() => window.__taken)).toEqual([false, false, false, false]);
      const loads = await page.evaluate(() => { sessionStorage.mark = '1'; return history.length; });
      await page.locator('#go').click();
      await expect(page.locator('#compassCap')).toContainText('upstream heading 90°');
      expect(new URL(page.url()).pathname).toBe('/lake-test');
      expect(await page.evaluate(() => window.__taken.at(-1)), 'the app took the click').toBe(true);
      expect(await page.evaluate(() => history.length), 'one entry added').toBe(loads + 1);
      // Back goes to the first location, in the page.
      await page.goBack();
      await expect(page.locator('#compassCap')).toContainText('upstream heading 15°');
      expect(new URL(page.url()).pathname).toBe('/putney-landing');
    });

    test('back to the first location after another draws it again from the record and the saved forecast', async ({ page }) => {
      await routeAll(page, scenario, clock);
      await page.route('**/locations/lake-test.json', route => route.fulfill({ json: LAKE_FILE }));
      await page.goto('/putney-landing');
      await ready(page);
      await moveTo(page, '/lake-test');
      await expect(page.locator('#compassCap')).toContainText('upstream heading 90°');
      await ready(page);
      await moveTo(page, '/putney-landing#wind');
      await tabDrawn(page, 'wind');
      await ready(page);
      await page.locator('#tabs a[data-tab="now"]').click();
      await expect(page.locator('#compassCap')).toContainText('upstream heading 15°');
      expect((await stored(page))['rowhether-last-v1']).toBe('putney-landing');
    });

    // Every key a location reads carries its slug. Putney is the only location the build has, so the
    // second one is Putney's record at another address, with a saved forecast and settings of its own
    // and none of Putney's forecast. A location that read Putney's keys would draw nothing while its
    // requests are held, show Putney's limit, or hide its reminder because Putney's settings were saved.
    test('a second location reads its own saved forecast, settings and reminder, and not Putney\'s', async ({ page }) => {
      await routeAll(page, scenario, clock);
      await page.goto('/putney-landing');
      await ready(page);
      const cache = await page.evaluate(() => localStorage.getItem('rowhether-cache-v2:putney-landing'));
      const seed = settings => page.evaluate(items => {
        localStorage.clear();
        for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
      }, {
        'rowhether-migrated-v1': '1',
        'rowhether-loc-v1:lake-test': JSON.stringify({ record: LAKE_FILE, fetchedAt: clock }),
        'rowhether-cache-v2:lake-test': cache,
        'rowhether-settings-v2': JSON.stringify({ 'putney-landing': { saved: clock, values: { windCaution: 8 } }, ...settings })
      });
      await seed({ 'lake-test': { saved: clock, values: { windCaution: 12 } } });
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await routeAll(page, scenario, clock);
      const out = await hold(page);
      await page.goto('/lake-test');
      await expect(page.locator('#verdict')).toHaveText('Go.');
      await expect(page.locator('#updated')).toHaveText('Refreshing');
      await expect(page.locator('#setNudge')).toBeHidden();
      await page.locator('#settingsBtn').click();
      await expect(page.locator('#setForm [name="windCaution"]')).toHaveValue('12');
      await page.keyboard.press('Escape');
      // Nothing saved for this location: Putney's saved settings do not hide its reminder or set its limits.
      await seed({});
      await page.reload();
      await expect(page.locator('#verdict')).toHaveText('Go.');
      await expect(page.locator('#setNudge')).toBeVisible();
      await page.locator('#settingsBtn').click();
      await expect(page.locator('#setForm [name="windCaution"]')).toHaveValue('10');
      await page.keyboard.press('Escape');
      await out.release();
    });

    // The first start of a new build, with nothing saved here: the record is in the worker's precache,
    // so a phone that has just updated opens its location with no network (07 13, 01 16.5).
    test.describe('with the service worker and no network', () => {
      test.use({ serviceWorkers: 'allow' });

      for (const [what, first, then] of [['at its address', '/putney-landing', '/putney-landing#wind'], ['at "/"', '/', '/']]) {
        test(`the record comes from the precache when none is saved: ${what}`, async ({ page, context }) => {
          const bad = [];
          page.on('pageerror', e => bad.push(e.message));
          await routeAll(page, scenario, clock);
          await page.goto(first);
          await ready(page);
          await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
          await page.reload();
          await ready(page);
          expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
          await page.evaluate(() => localStorage.clear());
          await page.unrouteAll({ behavior: 'ignoreErrors' });
          await context.setOffline(true);
          await page.goto('about:blank'); // a new document, also for an address that differs by its hash
          await page.goto(then);
          await expect(page.locator('#tabs')).toBeVisible();
          await expect(page.locator('#notFound')).toBeHidden();
          await expect(page.locator(`#tabs a[data-tab="${then.includes('#') ? 'wind' : 'now'}"]`)).toHaveAttribute('aria-current', 'page');
          expect(new URL(page.url()).pathname).toBe(new URL(then, page.url()).pathname);
          expect((await stored(page))['rowhether-loc-v1:putney-landing'], 'the record is saved').toBeTruthy();
          expect(bad).toEqual([]);
        });
      }
    });
  });

  test('every upstream aborted: the page says every source was blocked', async ({ page }) => {
    const seen = await routeAll(page, scenario, clock, { abort: true });
    await page.goto('/');
    await ready(page);
    await expect(page.locator('#verdict')).toHaveText('No data.');
    await expect(page.locator('#why')).toContainText('Every data source was blocked');
    expect(seen.served).toEqual([]);
    expect(seen.aborted.length).toBeGreaterThanOrEqual(9);
  });

  // A source that fails on a refresh keeps its last good copy, on screen and in
  // storage (review Z3). A fetchAll that wrote every slot, the failed ones as
  // undefined, would send the page to No data on the first failed refresh and
  // save the emptied copy. Playwright runs the last route registered first, so
  // the aborts go in after routeAll.
  test.describe('a refresh that fails', () => {
    const CACHE = 'rowhether-cache-v2:putney-landing';
    const NOTE = 'Could not reach USGS river gauges. Showing the last data received where available.';

    // Load with the fixtures, then reload with `abort` added. The reload draws
    // from the saved copy and then refreshes, so the page after it is the
    // outcome of a failed refresh.
    async function failedRefresh(page, abort) {
      await routeAll(page, scenario, clock);
      await page.goto('/');
      await ready(page);
      const before = {
        verdict: await page.locator('#verdict').textContent(),
        why: await page.locator('#why').textContent(),
        facts: await page.locator('#facts').textContent(),
        cache: await page.evaluate(k => JSON.parse(localStorage.getItem(k)), CACHE)
      };
      expect(before.cache.data.wx, 'the first load saved a forecast').toBeTruthy();
      expect(before.cache.data.river, 'the first load saved the river reading').toBeTruthy();
      expect(before.facts).toContain('cfs');
      await abort(page);
      await page.reload();
      await ready(page);
      return before;
    }

    // The page and the saved copy read as they did before the refresh.
    async function expectKept(page, before) {
      await expect(page.locator('#verdict')).toHaveText(before.verdict);
      await expect(page.locator('#why')).toHaveText(before.why);
      expect(await page.locator('#facts').textContent()).toBe(before.facts);
      expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)), CACHE)).toEqual(before.cache);
    }

    test('every source aborted: the last data stays on screen and in storage', async ({ page }) => {
      const before = await failedRefresh(page, p => routeAll(p, scenario, clock, { abort: true }));
      await expect(page.locator('#verdict')).not.toHaveText('No data.');
      await expect(page.locator('#updated')).toHaveText(/^Saved data from/);
      await expect(page.locator('#statusNote')).toBeVisible();
      await expectKept(page, before);
    });

    test('one source aborted: it is named, and its last data stays', async ({ page }) => {
      const before = await failedRefresh(page, p => p.route(/latest-continuous/, r => r.abort('failed')));
      await expect(page.locator('#statusNote')).toHaveText(NOTE);
      await expect(page.locator('#updated')).toHaveText(/^Updated/);
      await expectKept(page, before);
    });
  });

  // What an old build left in storage (08 8.3), read by this one with every
  // upstream request aborted, so the first hero can only come from the saved copy
  // (review Z7). A cache the app wrote itself stands in for the old one.
  test.describe('upgrade from the old keys', () => {
    test.use({ userAgent: IPHONE_UA });

    const OLD_DEFAULTS = { heading: 15, windCaution: 10, windOff: 15, gustCaution: 18, gustOff: 25, rainCaution: 60, rainOff: 90, coldCombined: 100, flowCaution: 20000, flowOff: 28000, waterOverride: '', aqiCaution: 151, aqiOff: 201 };
    const NEW_KEYS = ['rowhether-cache-v2:putney-landing', 'rowhether-install-v1', 'rowhether-last-v1', 'rowhether-migrated-v1', 'rowhether-nudge-v1', 'rowhether-plan-v1', 'rowhether-settings-v2'];
    const bar = page => page.locator('#installBar');

    test('the saved forecast, settings, plan and install choice come across', async ({ page }) => {
      // Every source fails here on purpose, so the console is not clean; a page error is a bug.
      const bad = [];
      page.on('pageerror', e => bad.push(e.message));
      // A load online, to get a cache the app saved.
      await routeAll(page, scenario, clock);
      await page.goto('/');
      await ready(page);
      const cache = await page.evaluate(() => localStorage.getItem('rowhether-cache-v2:putney-landing'));
      expect(cache, 'the first load saved a cache').not.toBeNull();

      // Back to what an old build wrote, and nothing else.
      const old = {
        'putney-rowing-settings-v1': JSON.stringify({ ...OLD_DEFAULTS, heading: 20, rainCaution: '', waterOverride: '55' }),
        'putney-rowing-cache-v1': cache,
        'putney-rowing-plan-v1': JSON.stringify({ minutes: 120, when: 'afternoon' }),
        'putney-rowing-install-v2': JSON.stringify({ dismissed: 5, never: true }),
        'putney-rowing-nudge-v1': '1'
      };
      await page.evaluate(seed => { localStorage.clear(); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); }, old);
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      const seen = await routeAll(page, scenario, clock, { abort: true });
      await page.reload();
      await ready(page);

      // The forecast comes from the saved copy.
      expect(seen.served).toEqual([]);
      await expect(page.locator('#updated')).toHaveText(/^Saved data from/);
      await expect(page.locator('#verdict')).toHaveText('Go.');
      await expect(page.locator('#why')).toContainText('55°F water');
      // The heading, the blank level, the dock reading, no reminder, no install bar.
      await expect(page.locator('#compassCap')).toContainText('upstream heading 20°');
      await expect(page.locator('#setNudge')).toBeHidden();
      await expect(bar(page)).toBeHidden();
      await page.locator('#settingsBtn').click();
      const fields = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#setForm input')].map(i => [i.name, i.value])));
      expect(fields).toEqual({ heading: '20', windCaution: '10', windOff: '15', gustCaution: '18', gustOff: '25', rainCaution: '', rainOff: '90', coldCombined: '100', waterOverride: '55', flowCaution: '20000', flowOff: '28000', aqiCaution: '151', aqiOff: '201' });
      await page.keyboard.press('Escape');
      // Plan a row.
      await page.goto('/#week');
      await expect(page.locator('#detail button[data-plan-min="120"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#detail button[data-plan-when="afternoon"]')).toHaveAttribute('aria-pressed', 'true');

      // In storage: the new keys, the old ones left alone, the last place and the marker.
      const stored = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
      for (const k of NEW_KEYS) expect(stored[k], k).toBeDefined();
      for (const [k, v] of Object.entries(old)) expect(stored[k], k).toBe(v);
      expect(stored['rowhether-last-v1']).toBe('putney-landing');
      expect(stored['rowhether-migrated-v1']).toBe('1');
      expect(stored['rowhether-install-v1']).toBe(old['putney-rowing-install-v2']);
      expect(stored['rowhether-plan-v1']).toBe(old['putney-rowing-plan-v1']);
      expect(stored['rowhether-cache-v2:putney-landing']).toBe(cache);
      expect(JSON.parse(stored['rowhether-settings-v2'])['putney-landing'].values).toEqual({ heading: 20, rainCaution: '', waterOverride: 55 });
      expect(bad).toEqual([]);

      // The control: without the install choice the bar does show in this browser.
      await page.evaluate(() => localStorage.removeItem('rowhether-install-v1'));
      await page.goto('/');
      await page.reload();
      await ready(page);
      await expect(bar(page)).toBeVisible();
    });
  });

  // The install bar is fixed over the bottom of the page, so the page keeps room
  // for it (B2 in docs/full-app/reviews/phase-0-browser-check.md). The bar is taller
  // with Don't show again, and its text wraps at narrow widths, so the room follows
  // the bar's measured height: the last footer line has to end above the bar, the
  // room is the bar and 2.25rem (its offset and some air), and it never drops under
  // 10rem, which a first visit's bar at 360 px has always had.
  test.describe('the footer clears the install bar', () => {
    test.use({ userAgent: IPHONE_UA });

    const seed = (page, dismissed) => page.evaluate(v => localStorage.setItem('rowhether-install-v1', v), JSON.stringify({ dismissed, never: false }));
    // Scrolled to the very bottom of the page.
    const measure = page => page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const bar = document.getElementById('installBar').getBoundingClientRect();
      const lastLine = [...document.querySelectorAll('footer p')].pop().getBoundingClientRect();
      return {
        height: bar.height,
        clearance: bar.top - lastLine.bottom,
        room: parseFloat(getComputedStyle(document.querySelector('.wrap')).paddingBottom),
        atBottom: Math.abs(window.scrollY + window.innerHeight - document.documentElement.scrollHeight) < 1
      };
    });
    // The gap between the last footer line and the bar once the page has settled at the bottom.
    const clearance = page => async () => { const m = await measure(page); return m.atBottom ? m.clearance : -Infinity; };

    for (const { width, dismissed } of [
      { width: 360, dismissed: 0 }, // the first visit: no Don't show again, the room it always had
      { width: 360, dismissed: 5 }, // B2: Don't show again adds a row
      { width: 390, dismissed: 5 },
      { width: 320, dismissed: 5 }, // the text wraps more
      { width: 600, dismissed: 0 }, // one row, short: the room stays 10rem
      { width: 600, dismissed: 5 }
    ]) {
      test(`${width} px, ${dismissed} dismissals stored`, async ({ page }) => {
        await routeAll(page, scenario, clock);
        await page.goto('/');
        await ready(page);
        await seed(page, dismissed);
        await page.setViewportSize({ width, height: 740 });
        await page.reload();
        await ready(page);
        await expect(page.locator('#installBar')).toBeVisible();
        await expect(page.locator('#installNever')).toBeVisible({ visible: dismissed >= 5 });
        await expect.poll(clearance(page), { message: 'the last footer line ends above the bar' }).toBeGreaterThanOrEqual(0);
        const m = await measure(page);
        // The room is the bar, its offset and some air, and not less than 10rem (160 px).
        expect(Math.abs(m.room - Math.max(160, Math.round(m.height) + 36)), `room ${m.room} px for a bar ${m.height} px tall`).toBeLessThanOrEqual(1);
      });
    }

    test('the room follows the bar when the width changes', async ({ page }) => {
      await routeAll(page, scenario, clock);
      await page.setViewportSize({ width: 600, height: 740 });
      await page.goto('/');
      await ready(page);
      await seed(page, 5);
      await page.reload();
      await ready(page);
      await expect(page.locator('#installNever')).toBeVisible();
      await expect.poll(clearance(page)).toBeGreaterThanOrEqual(0);
      const wide = await measure(page);
      // A narrower screen wraps the bar into more lines, with no reload in between.
      await page.setViewportSize({ width: 320, height: 740 });
      await expect.poll(async () => (await measure(page)).height, { message: 'the bar grew' }).toBeGreaterThan(wide.height + 20);
      await expect.poll(clearance(page), { message: 'the last footer line ends above the taller bar' }).toBeGreaterThanOrEqual(0);
    });
  });
});

// A page with no location: nothing is fetched from any weather or river service, for as long as
// no location is open (R9). The fake clock runs the page's own timers, the 10 minute refresh
// among them, and tells the page the tab is visible again.
test.describe('an address with no location', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: clock });
  });

  // Requests to anything but the preview server itself.
  const outside = page => { const urls = []; page.on('request', r => { if (!['localhost', '127.0.0.1'].includes(new URL(r.url()).hostname)) urls.push(r.url()); }); return urls; };

  test('/no-such-place says there is no location, asks nothing, and opens Putney when the history moves there', async ({ page }) => {
    const bad = watchConsole(page);
    const urls = outside(page);
    const seen = await routeAll(page, scenario, clock);
    await page.goto('/no-such-place');
    await expect(page.locator('#notFound')).toBeVisible();
    await expect(page.locator('#notFound h2')).toHaveText('No location here');
    await expect(page.locator('#notFound')).toContainText('No location at rowhether.com/no-such-place.');
    for (const id of ['tabs', 'home', 'detail', 'actions']) await expect(page.locator(`#${id}`), id).toBeHidden();
    await expect(page.locator('#refreshBtn')).toBeHidden();
    await expect(page.locator('#settingsBtn')).toBeHidden();

    // The tab comes back, the clock runs past the 10 minute refresh: still nothing asked.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.clock.runFor(11 * 60e3);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.clock.runFor(11 * 60e3);
    expect(urls, 'requests to other hosts').toEqual([]);
    expect(seen.served).toEqual([]);
    expect(bad).toEqual([]);

    // Back to a location by the history: its requests go out and its hero draws.
    await moveTo(page, '/putney-landing');
    await ready(page);
    await expect(page.locator('#verdict')).toHaveText('Go.');
    await expect(page.locator('#notFound')).toBeHidden();
    await expect(page.locator('#tabs')).toBeVisible();
    expect(seen.served).toHaveLength(9);
    expect(bad).toEqual([]);
  });

  // Leaving a location for one that is not there: the one that was open stops refreshing.
  test('leaving Putney for a location that does not exist asks nothing more, though the page stays open for 10 minutes', async ({ page }) => {
    const bad = watchConsole(page);
    const seen = await routeAll(page, scenario, clock);
    await page.goto('/putney-landing');
    await ready(page);
    expect(seen.served).toHaveLength(9);
    await moveTo(page, '/nowhere-land');
    await expect(page.locator('#notFound')).toContainText('No location at rowhether.com/nowhere-land.');
    await page.clock.runFor(11 * 60e3);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.clock.runFor(11 * 60e3);
    expect(seen.served, 'no request after the move').toHaveLength(9);
    expect(bad).toEqual([]);
  });

  test('an address that is not a slug is not looked up either: /Putney-Landing/extra', async ({ page }) => {
    const bad = watchConsole(page);
    const seen = await routeAll(page, scenario, clock);
    const files = [];
    page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/locations/')) files.push(new URL(r.url()).pathname); });
    await page.goto('/Putney-Landing/extra');
    await expect(page.locator('#notFound')).toContainText('No location at rowhether.com/Putney-Landing/extra.');
    expect(files).toEqual([]);
    expect(seen.served).toEqual([]);
    expect(bad).toEqual([]);
  });

  // An address with a long word in it, such as a mistyped one, wraps inside the panel.
  test.describe('at 360 px', () => {
    test.use({ viewport: { width: 360, height: 700 } });

    for (const path of [`/${'a'.repeat(300)}`, `/${'x'.repeat(40)}/${'y'.repeat(40)}.html`]) {
      test(`a long address does not scroll the page sideways: ${path.slice(0, 12)}`, async ({ page }) => {
        await routeAll(page, scenario, clock);
        await page.goto(path);
        await expect(page.locator('#notFound')).toBeVisible();
        const [page_, panel] = await page.evaluate(() => [document.documentElement, document.getElementById('notFound')].map(e => e.scrollWidth - e.clientWidth));
        expect(page_, 'the page').toBeLessThanOrEqual(0);
        expect(panel, 'the panel').toBeLessThanOrEqual(0);
      });
    }
  });

  // The form is offered here and on the picker, where no location is open (R9). The page's own
  // code builds the context, so a line that reads the location without a guard throws on send.
  async function sendSuggestion(page, path) {
    const posted = [];
    await routeAll(page, scenario, clock);
    await page.route('https://challenges.cloudflare.com/**', route => route.fulfill({ contentType: 'text/javascript', body: 'window.turnstile = { render() { return "w"; }, getResponse() { return "token"; }, reset() {} };' }));
    await page.route('**/api/suggest', route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: true, siteKey: 'test-key' } });
      posted.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true } });
    });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(path);
    await page.locator('#suggestBtn').click();
    await page.locator('#sugText').fill('Please add Lake Quinsigamond to the list of places.');
    await page.locator('#sugSend').click();
    await expect(page.locator('#sugDone')).toBeVisible();
    expect(errors).toEqual([]);
    return posted;
  }

  test('the suggestion form sends no settings and no location from a page with none', async ({ page }) => {
    const [post] = await sendSuggestion(page, '/no-such-place');
    expect(post.context).toMatchObject({ location: null, settings: null });
  });

  test('the suggestion form names the location, and sends its settings, from a location', async ({ page }) => {
    const [post] = await sendSuggestion(page, '/putney-landing');
    expect(post.context.location).toBe('putney-landing');
    expect(post.context.settings).toMatchObject({ heading: 15, windCaution: 10, flowOff: 28000 });
  });
});
