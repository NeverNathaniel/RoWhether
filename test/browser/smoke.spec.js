// Functional checks that do not compare pixels. Date is pinned with
// page.clock.setFixedTime to 12:00 Eastern on the june-calm day. Without a
// fixed time every fixture hour is in the past and the page shows the No data
// screen, which is too short to test the tab bar. Timers stay real.
import { test, expect } from '@playwright/test';
import { SCENARIOS, routeAll, ready } from './fixtures.js';

const scenario = SCENARIOS['june-calm'];
const clock = scenario.clock(12);
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
    // Nine upstream requests, none aborted and none unmatched.
    expect(seen.aborted).toEqual([]);
    expect(seen.missing).toEqual([]);
    expect(seen.served.length).toBeGreaterThanOrEqual(9);
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

  test('every upstream aborted: the page says every source was blocked', async ({ page }) => {
    const seen = await routeAll(page, scenario, clock, { abort: true });
    await page.goto('/');
    await ready(page);
    await expect(page.locator('#verdict')).toHaveText('No data.');
    await expect(page.locator('#why')).toContainText('Every data source was blocked');
    expect(seen.served).toEqual([]);
    expect(seen.aborted.length).toBeGreaterThanOrEqual(9);
  });
});
