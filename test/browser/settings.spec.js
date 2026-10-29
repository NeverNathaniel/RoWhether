// The Settings dialog round trip and the Plan a row choices, through the page
// (review Z6). P0.7 rewrites how Settings are saved, so these were first run on
// the code before it and are kept unchanged through P0.14: what a person sets
// applies at once, survives a reload, and Reset goes back to the defaults. P1.10
// changes two expected values in them: a saved flow limit is stored with its gauge.
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
  // A saved flow limit is kept with the gauge it was set for (P1.10, 01 11.1).
  const GAUGE = 'usgs-ogc:USGS-01154500:cfs';
  const withGauge = o => ({ ...asNumbers(o), limitBasis: { flow: GAUGE } });
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
    expect(await stored(page)).toEqual(withGauge(CHANGED));

    // After a reload the page reads all 13 again, and the views quote them.
    await page.reload();
    await ready(page);
    await expect(page.locator('#compassCap')).toContainText('upstream heading 40°');
    await readBack(page, CHANGED);
    expect(await stored(page)).toEqual(withGauge(CHANGED));
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
    expect(await stored(page)).toEqual(withGauge(raised));
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

// P1.10 (01 11.1, 11.6; 07 5.13): the dialog is built from the location shown. For Putney it keeps
// its 13 fields and gains the location's words: placeholders and a line under a changed field, the
// place's name in the intro, Use location defaults, flow limits that can be left blank, and the
// gauge a flow limit was set for. The checks above pass as they were.
test.describe('settings built from the location', () => {
  const GAUGE = 'usgs-ogc:USGS-01154500:cfs', OTHER = 'usgs-ogc:USGS-09999999:cfs';
  const NOTE = 'Your flow limits were for a different gauge. Set them again for this gauge.';
  // Storage a visit starts with, written once: a later reload keeps what the page saved.
  const seed = (page, values) => page.addInitScript(([v]) => {
    if (localStorage.getItem('rowhether-migrated-v1')) return;
    localStorage.setItem('rowhether-migrated-v1', '1');
    localStorage.setItem('rowhether-settings-v2', JSON.stringify({ 'putney-landing': { saved: 1, values: v } }));
  }, [values]);
  const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('rowhether-settings-v2'))['putney-landing'].values);
  // The dialog is hidden a moment before its close handler has saved, so the values are polled.
  const storedIs = (page, expected) => expect.poll(() => stored(page)).toEqual(expected);
  const save = async page => {
    await page.locator('#setForm button[value="save"]').click();
    await expect(page.locator('#settings')).toBeHidden();
  };
  const line = (page, name) => page.locator(`#own-${name}`);

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
  });

  test("Putney's dialog and reminder carry the location's words", async ({ page }) => {
    await page.goto('/putney-landing');
    await ready(page);
    await expect(page.locator('#setNudge p')).toHaveText('Set your own limits in Settings. Until you do, Go, Caution and Stay off use starting values for wind, gusts, rain, cold water and river flow.');
    await openSettings(page);
    await expect(page.locator('#setIntro')).toHaveText('Match these to your program, boat class and coach coverage. Saved in this browser for Putney Landing.');
    await expect(page.locator('#resetSet')).toHaveText('Use location defaults');
    await expect(page.locator('#setCourse')).toBeVisible();
    await expect(page.locator('#setFlow')).toBeVisible();
    await expect(page.locator('#setFlow legend')).toHaveText('River flow at North Walpole, cfs');
    await expect(page.locator('#setFlow .note')).toHaveText('Since 2016 the median day is about 6,900 cfs. 20,000 is roughly the top 10% of days, 28,000 the top 5%.');
    // Flow keeps the step of 100 it had, and neither flow box is required, as rain chance and air quality are not.
    for (const k of ['flowCaution', 'flowOff']) {
      await expect(field(page, k)).toHaveAttribute('step', '100');
      await expect(field(page, k)).not.toHaveAttribute('required');
    }
    // Each box names the location's default. The dock reading keeps its own words.
    const placeholders = await page.evaluate(names => names.map(n => document.querySelector(`#setForm [name="${n}"]`).placeholder), FIELDS);
    expect(placeholders).toEqual(FIELDS.map((k, i) => (k === 'waterOverride' ? 'Use gauge' : `Location default ${DEFAULT_VALUES[i]}`)));
    // At the defaults there is no line under any field.
    expect(await page.locator('#setForm .own').evaluateAll(els => els.map(e => e.textContent))).toEqual(Array(12).fill(''));
    await expect(page.locator('#setForm .own:not(:empty)')).toHaveCount(0);
    // An empty line takes no room, so two stacked boxes sit as close as they did before the lines.
    // (An empty block has an empty box, which toBeHidden() counts as hidden, so that does not show it.)
    const gap = await page.evaluate(() => {
      const box = n => document.querySelector(`#setForm [name="${n}"]`).closest('label').getBoundingClientRect();
      return box('windOff').top - box('windCaution').bottom;
    });
    expect(gap).toBeCloseTo(0, 1);
  });

  test('a field that is not at the default says so, and says nothing again at the default', async ({ page }) => {
    await page.goto('/putney-landing');
    await ready(page);
    await openSettings(page);
    await field(page, 'windCaution').fill('8');
    await expect(line(page, 'windCaution')).toHaveText('Your setting. Location default 10.');
    await expect(line(page, 'windCaution')).toBeVisible();
    await expect(line(page, 'windOff')).toBeHidden();
    // A level turned off is a setting.
    await field(page, 'rainCaution').fill('');
    await expect(line(page, 'rainCaution')).toHaveText('Your setting. Location default 60.');
    await field(page, 'flowOff').fill('30000');
    await expect(line(page, 'flowOff')).toHaveText('Your setting. Location default 28000.');
    await field(page, 'windCaution').fill('10');
    await expect(line(page, 'windCaution')).toHaveText('');
    // After a save the line is there when the dialog opens again, and Use location defaults clears them.
    await save(page);
    await openSettings(page);
    await expect(line(page, 'flowOff')).toHaveText('Your setting. Location default 28000.');
    await expect(line(page, 'rainCaution')).toHaveText('Your setting. Location default 60.');
    await page.locator('#resetSet').click();
    expect(await values(page)).toEqual(DEFAULT_VALUES);
    await expect(page.locator('#setForm .own:not(:empty)')).toHaveCount(0);
  });

  test('flow limits left blank save, turn the flow check off, and read back blank', async ({ page }) => {
    // Flow limits of 500 and 1,000 cfs make the verdict of the day's 5,929 cfs Stay off (P1.9's check).
    await seed(page, { flowCaution: 500, flowOff: 1000, limitBasis: { flow: GAUGE } });
    await page.goto('/putney-landing');
    await ready(page);
    await expect(page.locator('#verdict')).toHaveText('Stay off.');
    await expect(page.locator('#why')).toContainText('High water at 5,929 cfs');
    await openSettings(page);
    expect(await values(page)).toContain('500');
    await field(page, 'flowCaution').fill('');
    await field(page, 'flowOff').fill('');
    await save(page);
    await expect(page.locator('#verdict')).toHaveText('Go.');
    await expect(page.locator('#why')).not.toContainText('High water at');
    await storedIs(page, { flowCaution: '', flowOff: '', limitBasis: { flow: GAUGE } });
    await page.reload();
    await ready(page);
    await expect(page.locator('#verdict')).toHaveText('Go.');
    await openSettings(page);
    expect(await values(page)).toEqual(DEFAULT_VALUES.map((v, i) => (FIELDS[i] === 'flowCaution' || FIELDS[i] === 'flowOff' ? '' : v)));
    await expect(field(page, 'flowCaution')).toHaveAttribute('placeholder', 'Location default 20000');
    await expect(line(page, 'flowCaution')).toHaveText('Your setting. Location default 20000.');
  });

  test('a flow limit saved with no gauge named still applies, and is saved with the gauge on the next Save', async ({ page }) => {
    await seed(page, { flowCaution: 500, flowOff: 1000 });
    await page.goto('/putney-landing');
    await ready(page);
    await expect(page.locator('#verdict')).toHaveText('Stay off.');
    await openSettings(page);
    await field(page, 'windOff').fill('14');
    await save(page);
    await storedIs(page, { flowCaution: 500, flowOff: 1000, windOff: 14, limitBasis: { flow: GAUGE } });
    await expect(page.locator('#verdict')).toHaveText('Stay off.');
  });

  test('flow limits set for another gauge are not used and not lost, until they are set again', async ({ page }) => {
    await seed(page, { windCaution: 8, flowCaution: 500, flowOff: 1000, limitBasis: { flow: OTHER } });
    await page.goto('/putney-landing');
    await ready(page);
    // The same limits that make the verdict Stay off above are for another gauge, so the verdict does not read them.
    await expect(page.locator('#verdict')).toHaveText('Go.');
    await expect(page.locator('#why')).not.toContainText('High water at');
    await openSettings(page);
    expect(await values(page)).toEqual(['15', '8', '15', '18', '25', '60', '90', '100', '', '20000', '28000', '151', '201']);
    await expect(page.locator('#setFlow .note').first()).toHaveText(NOTE);
    await expect(line(page, 'flowCaution')).toHaveText('');
    // Saving something else keeps them, with the gauge they were for.
    await field(page, 'windOff').fill('14');
    await save(page);
    await storedIs(page, { windCaution: 8, windOff: 14, flowCaution: 500, flowOff: 1000, limitBasis: { flow: OTHER } });
    // The River tab says so as well.
    await page.evaluate(() => { location.hash = '#river'; });
    await expect(page.locator('#detail .how')).toContainText(NOTE);
    await page.evaluate(() => { location.hash = '#now'; });
    // Setting a flow limit for this gauge takes the old ones out, and the new one applies at once.
    await openSettings(page);
    await field(page, 'flowCaution').fill('500');
    await save(page);
    await storedIs(page, { windCaution: 8, windOff: 14, flowCaution: 500, limitBasis: { flow: GAUGE } });
    await expect(page.locator('#verdict')).toHaveText('Caution.');
    await expect(page.locator('#why')).toContainText('Elevated flow at 5,929 cfs');
    await openSettings(page);
    await expect(page.locator('#setFlow')).not.toContainText(NOTE);
  });

  test('the dialog fits at 360 px with the lines and the note', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await seed(page, { windCaution: 8, flowCaution: 500, flowOff: 1000, limitBasis: { flow: OTHER } });
    await page.goto('/putney-landing');
    await ready(page);
    await openSettings(page);
    // A line under every limit field, the longest ones, and the note under the flow boxes.
    const changes = { heading: '40', windCaution: '8', windOff: '20', gustCaution: '15', gustOff: '30', rainCaution: '', rainOff: '85', coldCombined: '120', flowCaution: '15000', flowOff: '35000', aqiCaution: '', aqiOff: '180' };
    for (const [k, v] of Object.entries(changes)) await field(page, k).fill(v);
    await expect(page.locator('#setForm .own:not(:empty)')).toHaveCount(Object.keys(changes).length);
    await page.locator('#setFlow').scrollIntoViewIfNeeded();
    const fit = await page.evaluate(() => {
      const dlg = document.getElementById('settings'), box = dlg.getBoundingClientRect(), out = [];
      const inside = (what, el) => {
        const r = el.getBoundingClientRect();
        if (r.width && (r.left < box.left - 0.5 || r.right > box.right + 0.5)) out.push(`${what} ${Math.round(r.left)} to ${Math.round(r.right)}`);
      };
      for (const el of dlg.querySelectorAll('input, button, .own:not(:empty), .note, legend, label')) inside(el.name || el.id || el.className || el.tagName, el);
      return { out, dialog: dlg.scrollWidth - dlg.clientWidth, page: document.documentElement.scrollWidth - innerWidth };
    });
    expect(fit.out).toEqual([]);
    expect(fit.dialog).toBeLessThanOrEqual(0);
    expect(fit.page).toBeLessThanOrEqual(0);
    // The buttons are all there to press: Use location defaults, Cancel and Save.
    for (const b of ['#resetSet', '#setForm button[value="cancel"]', '#setForm button[value="save"]']) await expect(page.locator(b)).toBeVisible();
  });
});

// P1.13: the dialog at still water has no flow fields (a lake has no gauge), and no Course field when the
// lake has no course set. Its limits, Save and Reset work as they do at a river.
test.describe('settings at still water', () => {
  const LIMITS = FIELDS.filter(k => !['heading', 'flowCaution', 'flowOff'].includes(k));
  const stored = (page, slug) => page.evaluate(s => JSON.parse(localStorage.getItem('rowhether-settings-v2') || '{}')[s]?.values ?? null, slug);
  const read = (page, names) => page.evaluate(ns => ns.map(n => document.querySelector(`#setForm [name="${n}"]`).value), names);

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
  });

  test('at Carnegie, a lake with no course, has no Course and no flow fields, and Save keeps only what differs', async ({ page }) => {
    await page.goto('/lake-carnegie');
    await ready(page);
    await expect(page.locator('#setNudge p')).toHaveText('Set your own limits in Settings. Until you do, Go, Caution and Stay off use starting values for wind, gusts, rain and cold water.');
    await expect(page.locator('#verdict')).toHaveText('Go.');
    await openSettings(page);
    await expect(page.locator('#setIntro')).toHaveText('Match these to your program, boat class and coach coverage. Saved in this browser for Lake Carnegie.');
    await expect(page.locator('#setCourse')).toBeHidden();
    await expect(field(page, 'heading')).toBeDisabled();
    await expect(page.locator('#setFlow')).toBeHidden();
    await expect(page.locator('#setForm [name="flowCaution"], #setForm [name="flowOff"]')).toHaveCount(0);
    for (const k of LIMITS) await expect(field(page, k), k).toHaveCount(1);
    expect(await read(page, LIMITS)).toEqual(['10', '15', '18', '25', '60', '90', '100', '', '151', '201']);

    // The wind of the day is 7 mph: a caution line of 6 makes it Caution, and only that line is stored.
    await field(page, 'windCaution').fill('6');
    await expect(page.locator('#own-windCaution')).toHaveText('Your setting. Location default 10.');
    await page.locator('#setForm button[value="save"]').click();
    await expect(page.locator('#settings')).toBeHidden();
    await expect(page.locator('#verdict')).toHaveText('Caution.');
    await expect.poll(() => stored(page, 'lake-carnegie')).toEqual({ windCaution: 6 });
    await page.reload();
    await ready(page);
    await expect(page.locator('#verdict')).toHaveText('Caution.');
    await openSettings(page);
    expect(await read(page, LIMITS)).toEqual(['6', '15', '18', '25', '60', '90', '100', '', '151', '201']);

    // Use location defaults puts every box back, and Save then stores nothing.
    await page.locator('#resetSet').click();
    expect(await read(page, LIMITS)).toEqual(['10', '15', '18', '25', '60', '90', '100', '', '151', '201']);
    await page.locator('#setForm button[value="save"]').click();
    await expect(page.locator('#settings')).toBeHidden();
    await expect(page.locator('#verdict')).toHaveText('Go.');
    await expect.poll(() => stored(page, 'lake-carnegie')).toEqual({});
  });

  test('at Quinsigamond, a lake with a heading, shows the Course field and still no flow fields', async ({ page }) => {
    await page.goto('/lake-quinsigamond');
    await ready(page);
    await openSettings(page);
    await expect(page.locator('#setCourse')).toBeVisible();
    await expect(field(page, 'heading')).toBeEnabled();
    await expect(field(page, 'heading')).toHaveValue('166');
    await expect(page.locator('#setFlow')).toBeHidden();
    await expect(page.locator('#setForm [name="flowCaution"], #setForm [name="flowOff"]')).toHaveCount(0);
    await field(page, 'heading').fill('200');
    await page.locator('#setForm button[value="save"]').click();
    await expect(page.locator('#settings')).toBeHidden();
    await expect(page.locator('#compass g[transform="rotate(200)"] rect.c-river')).toHaveCount(1);
    await expect.poll(() => stored(page, 'lake-quinsigamond')).toEqual({ heading: 200 });
  });

  test('at Natoma, which reads a water temperature and no flow, has no flow fields either', async ({ page }) => {
    await page.goto('/lake-natoma');
    await ready(page);
    await openSettings(page);
    await expect(page.locator('#setFlow')).toBeHidden();
    await expect(field(page, 'waterOverride')).toHaveCount(1);
    await expect(field(page, 'waterOverride')).toHaveAttribute('placeholder', 'Use gauge');
  });
});
