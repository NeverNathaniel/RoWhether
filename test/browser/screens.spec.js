// Before and after screenshots (08 section 14.1): the home screen, one Day by
// day row opened, and four tabs, at midday and at 9 PM, on a calm June day and
// a foggy October day. Chromium at 390 px light and 1280 px dark.
//
// The page clock is installed at the hour, so the app's own dates, "Updated"
// time and today's periods are fixed.
//
// The baseline is local and git-ignored (FD3). Pixels differ between machines,
// so the images are made and compared on the same machine, and never in CI,
// which runs `--grep-invert @visual`. The 48 images of the P0.2 baseline were
// committed in 743e8cd and deleted in P0.14, and that commit still holds the last
// copy (`git show 743e8cd:test/browser/__screenshots__/<name>.png`).
//
// Make the baseline from the commit you are on, then compare later changes with it:
//
//   npx playwright test --grep @visual --update-snapshots
//   npx playwright test --grep @visual
//
// A run with no baseline fails and writes nothing. Only --update-snapshots writes.
//
// Make it from another commit, the one before a change you want to compare, in a
// worktree so your own tree stays as it is. A commit before this file needs this
// spec and playwright.config.js copied in, so that it reads VISUAL_BASELINE:
//
//   git worktree add ../rowhether-base <commit>
//   ln -s "$PWD/node_modules" ../rowhether-base/node_modules
//   cp playwright.config.js ../rowhether-base/
//   cp test/browser/screens.spec.js ../rowhether-base/test/browser/
//   (cd ../rowhether-base && VISUAL_BASELINE=/absolute/folder npx playwright test --grep @visual --update-snapshots)
//   VISUAL_BASELINE=/absolute/folder npx playwright test --grep @visual
//   git worktree remove --force ../rowhether-base
//
// The `ln` and `cp` lines are only for a commit that has no node_modules of its
// own or predates this spec. Phase 0 changed no pixel, so a baseline made from
// 743e8cd matches HEAD of phase 0 at maxDiffPixelRatio 0.
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
