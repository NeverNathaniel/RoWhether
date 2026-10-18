// Functional checks that do not compare pixels. Date is pinned with
// page.clock.setFixedTime to 12:00 Eastern on the june-calm day. Without a
// fixed time every fixture hour is in the past and the page shows the No data
// screen, which is too short to test the tab bar. Timers stay real.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { SCENARIOS, routeAll, ready } from './fixtures.js';

// Not the machine's zone or language, so a line that reads the screen's instead
// of the location's fails here and not only on someone else's laptop (review Z11).
test.use({ timezoneId: 'Pacific/Auckland', locale: 'de-DE' });

const scenario = SCENARIOS['june-calm'];
const clock = scenario.clock(12);
// The nine URLs and names P0.1 recorded in a golden file. The page must ask for
// exactly these, not only for something the fixtures answer on the same path.
const GOLDEN = JSON.parse(readFileSync(new URL('../golden/june-calm-1200-default.json', import.meta.url), 'utf8'));
const TABS = ['now', 'week', 'wind', 'river', 'storms', 'fog', 'temperature', 'rain', 'light', 'air'];

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
      await page.evaluate(() => window.scrollTo(0, 700));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
      const top = await page.evaluate(() => document.getElementById('tabs').getBoundingClientRect().top);
      expect(Math.abs(top), `tab bar top at ${hash || 'home'}`).toBeLessThanOrEqual(1);
    }
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

  test('every upstream aborted: the page says every source was blocked', async ({ page }) => {
    const seen = await routeAll(page, scenario, clock, { abort: true });
    await page.goto('/');
    await ready(page);
    await expect(page.locator('#verdict')).toHaveText('No data.');
    await expect(page.locator('#why')).toContainText('Every data source was blocked');
    expect(seen.served).toEqual([]);
    expect(seen.aborted.length).toBeGreaterThanOrEqual(9);
  });

  // What an old build left in storage (08 8.3), read by this one with every
  // upstream request aborted, so the first hero can only come from the saved copy
  // (review Z7). A cache the app wrote itself stands in for the old one.
  test.describe('upgrade from the old keys', () => {
    test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' });

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
});
