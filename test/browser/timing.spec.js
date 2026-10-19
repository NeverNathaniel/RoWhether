// Timing baseline: how soon the hero is drawn from the saved copy of the data,
// with the CPU four times slower and no network. Chromium only, because CPU
// throttling is a Chromium DevTools call.
//
// Each run, in a fresh context with service workers allowed:
//   1. load online with the fixtures, so the shell is precached and the data
//      is saved to localStorage;
//   2. wait for navigator.serviceWorker.ready;
//   3. CDP Emulation.setCPUThrottlingRate 4, go offline, reload;
//   4. read performance.getEntriesByName('hero')[0].startTime, set by
//      render() in src/render/index.js.
// Date is pinned with page.clock.setFixedTime to 12:00 Eastern on the
// june-calm day. Timers stay real; with the real clock every fixture hour is
// past, buildModel returns null and no hero is drawn.
//
// Playwright 1.56.1's clock, even in fixed time mode, replaces window.performance
// with a fake whose mark() does nothing and whose getEntriesByName() returns
// nothing, so performance.mark('hero') would leave no entry. keepRealPerformance
// runs before the clock's own init script (it is registered first, on the
// context) and turns the clock's assignment into a no-op, so performance stays
// the browser's own: real marks and a real timeline.
//
// Prints the median of 5 (after one warm-up run). TIMING_BASELINE_MS, if set, fails the run when the
// median is more than 20% above it (P0.14).
import { test, expect } from '@playwright/test';
import { SCENARIOS, routeAll, ready } from './fixtures.js';

const RUNS = 5;
// One more run first, not counted: the first load of a browser that has just
// started is the slowest, and would be one of the five.
const WARMUP = 1;
const scenario = SCENARIOS['june-calm'];
const clock = scenario.clock(12);

// Runs in the page before the clock. window.performance keeps the browser's object.
function keepRealPerformance() {
  const real = window.performance;
  Object.defineProperty(window, 'performance', { configurable: true, enumerable: true, get: () => real, set: () => {} });
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

test.describe('timing', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CPU throttling is Chromium only');
  test.setTimeout(180000);

  test(`first hero from the saved copy, CPU 4x slower, offline (median of ${RUNS})`, async ({ browser, baseURL }, testInfo) => {
    const { viewport, colorScheme } = testInfo.project.use;
    const heroAt = [], warm = [];
    for (let i = -WARMUP; i < RUNS; i++) {
      const context = await browser.newContext({ baseURL, viewport, colorScheme, serviceWorkers: 'allow' });
      try {
        await context.addInitScript(keepRealPerformance); // before the clock
        const page = await context.newPage();
        await page.clock.setFixedTime(clock);
        await routeAll(page, scenario, clock);
        await page.goto('/');
        await ready(page);
        // Active means installed, so the shell is precached. The worker claims
        // this first page (clientsClaim) and serves the reload.
        await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));

        // Offline for real: no fixtures, so the upstream fetches fail and the
        // first hero can only come from the saved copy.
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await context.setOffline(true);
        await page.reload();
        // Short, so a saved copy that is not found (saved and read under
        // different keys) fails here and says so, and does not read as a hang.
        await page.waitForFunction(() => performance.getEntriesByName('hero').length > 0, null, { timeout: 15000 });
        (i < 0 ? warm : heroAt).push(await page.evaluate(() => performance.getEntriesByName('hero')[0].startTime));
        // Served by the worker, drawn from the saved copy and not from a fetch.
        expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
        await expect(page.locator('#updated')).toHaveText(/^Saved data from/);
        // The refresh failed too, and must not have emptied the saved copy (review Z3).
        await expect(page.locator('#refreshBtn')).toBeEnabled();
        await expect(page.locator('#verdict')).not.toHaveText('No data.');
      } finally {
        await context.close();
      }
    }
    const med = median(heroAt);
    const line = `timing ${testInfo.project.name}: hero at ${med.toFixed(1)} ms median of ${RUNS} (runs ${heroAt.map(v => v.toFixed(1)).join(', ')}; warm-up ${warm.map(v => v.toFixed(1)).join(', ')}) on ${browser.version()}`;
    console.log(line);
    testInfo.annotations.push({ type: 'timing', description: line });
    expect(med).toBeGreaterThan(0);
    const base = Number(process.env.TIMING_BASELINE_MS);
    if (base) expect(med, `median ${med.toFixed(1)} ms against the baseline ${base} ms`).toBeLessThanOrEqual(base * 1.2);
  });
});
