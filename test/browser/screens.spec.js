// Before and after screenshots (08 section 14.1): the home screen, one Day by
// day row opened, and four tabs, at midday and at 9 PM, on a calm June day and
// a foggy October day. Chromium at 390 px light and 1280 px dark.
//
// The page clock is installed at the hour, so the app's own dates, "Updated"
// time and today's periods are fixed. Pixels differ between machines, so this
// spec is compared where the baseline was made (13.5), not in CI.
import { test, expect } from '@playwright/test';
import { SCENARIOS, routeAll, ready } from './fixtures.js';

const DAYS = ['june-calm', 'october-fog'];
const HOURS = [12, 21];
const TABS = ['week', 'wind', 'river', 'fog'];

const shot = { fullPage: true, animations: 'disabled', maxDiffPixelRatio: 0 };

// Nothing under the pointer or in focus, so no hover or focus ring is drawn.
async function settle(page) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await ready(page);
}

test.describe('screens', { tag: '@visual' }, () => {
  for (const name of DAYS) {
    for (const hr of HOURS) {
      const scenario = SCENARIOS[name];
      const clock = scenario.clock(hr);
      const tag = `${name}-${String(hr).padStart(2, '0')}00`;

      test.describe(tag, () => {
        test.beforeEach(async ({ page }) => {
          await page.clock.install({ time: clock });
          await routeAll(page, scenario, clock);
        });

        test('home', async ({ page }) => {
          await page.goto('/');
          await settle(page);
          await expect(page).toHaveScreenshot(`${tag}-home.png`, shot);
        });

        test('a day by day row opened', async ({ page }) => {
          await page.goto('/');
          await ready(page);
          const row = page.locator('#days details.period').first();
          await row.locator('summary').click();
          await row.locator('.forecast').waitFor();
          await settle(page);
          await expect(page).toHaveScreenshot(`${tag}-row.png`, shot);
        });

        for (const tab of TABS) {
          test(`#${tab}`, async ({ page }) => {
            await page.goto(`/#${tab}`);
            await settle(page);
            await expect(page.locator('#detail')).toBeVisible();
            await expect(page).toHaveScreenshot(`${tag}-${tab}.png`, shot);
          });
        }
      });
    }
  }
});
