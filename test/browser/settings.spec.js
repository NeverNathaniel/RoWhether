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
    await page.goto('/putney-landing');
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

  // The test above changes four fields, and a field that holds its default reads
  // back the same whether or not its own value got through (FC9). The next two
  // change all 13, and the order rules on Save.
  const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('rowhether-settings-v2'))['putney-landing'].values);
  const asNumbers = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)]));
  const fillAll = async (page, changes) => {
    for (const [k, v] of Object.entries(changes)) await field(page, k).fill(v);
  };
  const save = async page => {
    await page.locator('#setForm button[value="save"]').click();
    await expect(page.locator('#settings')).toBeHidden();
  };
  const readBack = async (page, expected) => {
    await openSettings(page);
    expect(await values(page)).toEqual(FIELDS.map(k => expected[k]));
    await page.keyboard.press('Escape');
  };

  test('every field changed is saved, applied and read back after a reload', async ({ page }) => {
    // Each value differs from the default and passes the dialog's rules.
    const CHANGED = { heading: '40', windCaution: '8', windOff: '20', gustCaution: '15', gustOff: '30', rainCaution: '50', rainOff: '85', coldCombined: '120', waterOverride: '55', flowCaution: '15000', flowOff: '35000', aqiCaution: '101', aqiOff: '180' };
    expect(Object.keys(CHANGED).sort()).toEqual([...FIELDS].sort());
    FIELDS.forEach((k, i) => expect(CHANGED[k], k).not.toBe(DEFAULT_VALUES[i]));
    await page.goto('/putney-landing');
    await ready(page);
    await openSettings(page);
    await fillAll(page, CHANGED);
    await save(page);

    // Applied at once, and every field kept as a number.
    await expect(page.locator('#compassCap')).toContainText('upstream heading 40°');
    await expect(page.locator('#why')).toContainText('55°F water');
    await readBack(page, CHANGED);
    expect(await stored(page)).toEqual(asNumbers(CHANGED));

    // After a reload the page reads all 13 again, and the views quote them.
    await page.reload();
    await ready(page);
    await expect(page.locator('#compassCap')).toContainText('upstream heading 40°');
    await readBack(page, CHANGED);
    expect(await stored(page)).toEqual(asNumbers(CHANGED));
    const view = async hash => {
      await page.evaluate(h => { location.hash = h; }, hash);
      return page.locator('#detail').textContent();
    };
    await expect.poll(() => view('#wind')).toContain('Caution at 8 mph wind or 15 mph gusts, stay off at 20 or 30.');
    await expect.poll(() => view('#rain')).toMatch(/Caution 50%[\s\S]*Stay off 85%/);
    await expect.poll(() => view('#air')).toMatch(/Caution 101[\s\S]*Stay off 180/);
    await expect.poll(() => view('#temperature')).toContain('120');
  });

  test('Save raises a stay off level that is under its caution, for every pair', async ({ page }) => {
    await page.goto('/putney-landing');
    await ready(page);
    await openSettings(page);
    // Each stay off level is below its caution: wind, gusts, rain chance, flow and air quality.
    await fillAll(page, { windCaution: '30', windOff: '20', gustCaution: '30', gustOff: '20', rainCaution: '80', rainOff: '70', flowCaution: '30000', flowOff: '25000', aqiCaution: '200', aqiOff: '120' });
    await save(page);
    const raised = { windCaution: '30', windOff: '30', gustCaution: '30', gustOff: '30', rainCaution: '80', rainOff: '80', flowCaution: '30000', flowOff: '30000', aqiCaution: '200', aqiOff: '200' };
    const expected = Object.fromEntries(FIELDS.map((k, i) => [k, raised[k] ?? DEFAULT_VALUES[i]]));
    await readBack(page, expected);
    expect(await stored(page)).toEqual(asNumbers(raised));
    await page.reload();
    await ready(page);
    await readBack(page, expected);
  });

  test('Plan a row keeps the length and the time of day across a reload', async ({ page }) => {
    await page.goto('/putney-landing#week');
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
