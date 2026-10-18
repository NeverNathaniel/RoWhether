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
