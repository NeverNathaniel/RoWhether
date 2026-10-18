// The Settings dialog round trip and the Plan a row choices, through the page
// (review Z6). P0.7 rewrites how Settings are saved, so these were first run on
// the code before it and are kept unchanged through P0.14: what a person sets
// applies at once, survives a reload, and Reset goes back to the defaults.
// Date is pinned to 12:00 Eastern on the june-calm day, as in smoke.spec.js.
import { test, expect } from '@playwright/test';
import { SCENARIOS, routeAll, ready } from './fixtures.js';

// Not the machine's zone or language (review Z11).
test.use({ timezoneId: 'Pacific/Auckland', locale: 'de-DE' });

const scenario = SCENARIOS['june-calm'];
const clock = scenario.clock(12);

// The 13 fields in the order the dialog shows them.
const FIELDS = ['heading', 'windCaution', 'windOff', 'gustCaution', 'gustOff', 'rainCaution', 'rainOff', 'coldCombined', 'waterOverride', 'flowCaution', 'flowOff', 'aqiCaution', 'aqiOff'];
const DEFAULT_VALUES = ['15', '10', '15', '18', '25', '60', '90', '100', '', '20000', '28000', '151', '201'];

const field = (page, name) => page.locator(`#setForm [name="${name}"]`);
const values = page => page.evaluate(names => names.map(n => document.querySelector(`#setForm [name="${n}"]`).value), FIELDS);

async function openSettings(page) {
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settings')).toBeVisible();
}

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
  });

  test('a saved change applies at once, survives a reload, and Reset goes back to the defaults', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await expect(page.locator('#setNudge')).toBeVisible();
    await expect(page.locator('#compassCap')).toContainText('upstream heading 15°');
    await openSettings(page);
    expect(await values(page)).toEqual(DEFAULT_VALUES);
    await page.locator('#resetSet').click();
    expect(await values(page)).toEqual(DEFAULT_VALUES);

    // A heading, a limit, a level turned off with a blank, and a dock reading.
    await field(page, 'heading').fill('20');
    await field(page, 'windCaution').fill('8');
    await field(page, 'rainCaution').fill('');
    await field(page, 'waterOverride').fill('55');
    await page.locator('#setForm button[value="save"]').click();
    await expect(page.locator('#settings')).toBeHidden();

    // Applied without a reload: the reminder is gone and the page reads the new values.
    await expect(page.locator('#setNudge')).toBeHidden();
    await expect(page.locator('#compassCap')).toContainText('upstream heading 20°');
    await expect(page.locator('#why')).toContainText('55°F water');

    const saved = ['20', '8', '15', '18', '25', '', '90', '100', '55', '20000', '28000', '151', '201'];
    await openSettings(page);
    expect(await values(page)).toEqual(saved);
    await page.keyboard.press('Escape');

    // And after a reload.
    await page.reload();
    await ready(page);
    await expect(page.locator('#setNudge')).toBeHidden();
    await expect(page.locator('#compassCap')).toContainText('upstream heading 20°');
    await expect(page.locator('#why')).toContainText('55°F water');
    await openSettings(page);
    expect(await values(page)).toEqual(saved);

    // Reset fills the defaults (a blank water field), and saving them puts the page back.
    await page.locator('#resetSet').click();
    expect(await values(page)).toEqual(DEFAULT_VALUES);
    await page.locator('#setForm button[value="save"]').click();
    await expect(page.locator('#settings')).toBeHidden();
    await expect(page.locator('#compassCap')).toContainText('upstream heading 15°');
    await page.reload();
    await ready(page);
    await expect(page.locator('#setNudge')).toBeHidden();
    await expect(page.locator('#compassCap')).toContainText('upstream heading 15°');
    await openSettings(page);
    expect(await values(page)).toEqual(DEFAULT_VALUES);
  });

  test('Plan a row keeps the length and the time of day across a reload', async ({ page }) => {
    await page.goto('/#week');
    await ready(page);
    const pick = (attr, val) => page.locator(`#detail button[data-${attr}="${val}"]`);
    await pick('plan-min', '120').click();
    await pick('plan-when', 'afternoon').click();
    await expect(pick('plan-min', '120')).toHaveAttribute('aria-pressed', 'true');
    await expect(pick('plan-when', 'afternoon')).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await ready(page);
    await expect(pick('plan-min', '120')).toHaveAttribute('aria-pressed', 'true');
    await expect(pick('plan-when', 'afternoon')).toHaveAttribute('aria-pressed', 'true');
    await expect(pick('plan-min', '90')).toHaveAttribute('aria-pressed', 'false');
  });
});
