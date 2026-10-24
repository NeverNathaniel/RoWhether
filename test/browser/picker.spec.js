// The header, the footer and the app name (phase 1 plan P1.5; 07 4.3, 6.1 to 6.4, 13).
// The picker behind the location name is P1.6's, and its checks join this file then.
// The page clock is 12:00 Eastern on the june-calm day, in a Putney regular's zone
// unless a case says another: the subtitle names the difference between the viewer's
// zone and the location's, so the zone has to be one the case chose.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { SCENARIOS, routeAll, ready, tabDrawn } from './fixtures.js';

test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

const scenario = SCENARIOS['june-calm'];
const clock = scenario.clock(12);
const DAY = 24 * 3600e3;
const GOLDEN = JSON.parse(readFileSync(new URL('../golden/june-calm-1200-default.json', import.meta.url), 'utf8'));
const PUTNEY_FILE = JSON.parse(readFileSync(new URL('../../dist/locations/putney-landing.json', import.meta.url), 'utf8'));
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const LINE = 'Connecticut River at the Putney Rowing Club docks. All times Eastern';
// What Putney's record said until P1.5: the credits as plain text, the Albany office alone.
const OLD_CREDITS = 'Forecast from Open-Meteo (NOAA HRRR and GFS models). Alerts and Keene observations from the National Weather Service, Albany. River flow from USGS gauge 01154500 at North Walpole, water temperature from 01161280 near Northfield. River forecast from the NWS Northeast River Forecast Center. Air quality from Open-Meteo (Copernicus CAMS), and the model comparison from GFS, ECMWF, GEM and ICON via Open-Meteo.';

// A location the page can open: Putney's record at another address, with its own words.
const record = (slug, over = {}) => ({ ...PUTNEY_FILE, slug, ...over });
const serve = (page, files) => page.route('**/locations/*.json', route => {
  const slug = new URL(route.request().url()).pathname.split('/').pop().replace('.json', '');
  return files[slug] ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(files[slug]) }) : route.fallback();
});
// How many lines an inline element's text takes.
const lines = (page, sel) => page.evaluate(s => document.querySelector(s).getClientRects().length, sel);
const mid = (page, sel) => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return r.top + r.height / 2; }, sel);

test.describe('the header', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
  });

  test('names the location in a button with a chevron after it, and says what it does', async ({ page }) => {
    await page.goto('/putney-landing');
    await ready(page);
    await expect(page).toHaveTitle('Putney Landing rowing conditions');
    const btn = page.locator('#locBtn');
    await expect(btn).toHaveText('Putney Landing');
    await expect(btn).toHaveAccessibleName('Putney Landing');
    await expect(btn).toHaveAccessibleDescription('Change location');
    // The hint is for screen readers: one clipped pixel, so it takes no room beside the title.
    expect((await page.locator('#locHint').boundingBox()).width).toBeLessThanOrEqual(1);
    await expect(btn).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(btn).toHaveAttribute('aria-controls', 'picker');
    await expect(page.locator('#sub')).toHaveText(`${LINE}.`);
    await expect(page.locator('#locBadges')).toBeHidden();
    // The chevron is after the name, in the muted color the updated time has, and the name is the title's.
    const box = await page.evaluate(() => {
      const r = id => document.querySelector(id).getBoundingClientRect();
      const css = (id, p) => getComputedStyle(document.querySelector(id))[p];
      return { name: r('#locName'), chev: r('.loc-chev'), chevColor: css('.loc-chev', 'color'), muted: css('#updated', 'color'), ink: css('#title', 'color'), btnColor: css('#locBtn', 'color'), size: css('#locBtn', 'fontSize'), titleSize: css('#title', 'fontSize'), weight: css('#locBtn', 'fontWeight') };
    });
    expect(box.chev.left).toBeGreaterThanOrEqual(box.name.right);
    expect(box.chev.width).toBeGreaterThan(5);
    expect(box.chevColor).toBe(box.muted);
    expect(box.btnColor).toBe(box.ink);
    expect(box.size).toBe(box.titleSize);
    expect(box.weight).toBe('700');
  });

  // 07 4.3 measured "Saved data from 10:41 AM" (163 px) wrapping Settings onto a second row at 360 px. The
  // row has room for a label of 123 px (320 px of content, the two buttons 176 px, two gaps and a margin).
  // "Saved 6:41 AM" (82 px) and a weekday with a whole hour ("Saved Sun 12 PM", 110 px) fit. A weekday with
  // minutes ("Saved Wed 12:59 PM", 133 px) and the dated form for a copy a week old or more ("Saved Jun 7,
  // 10:41 AM", 141 px) do not, so Settings takes a second row, as it did for every saved copy. The title, the
  // label and the page width hold for all of them.
  test('stays one title line and one actions row at 360 px, with Updated and with Saved', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 844 });
    await page.goto('/putney-landing');
    await ready(page);
    const state = async what => {
      expect(await lines(page, '#locName'), `${what}: the title wraps`).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${what}: the page scrolls sideways`).toBeLessThanOrEqual(0);
      const ys = await Promise.all(['#updated', '#refreshBtn', '#settingsBtn'].map(s => mid(page, s)));
      return Math.max(...ys) - Math.min(...ys);
    };
    await expect(page.locator('#updated')).toHaveText(/^Updated /);
    expect(await state('Updated')).toBeLessThan(3);

    // The saved copy from this noon, from yesterday, from a Wednesday at the widest time of day, and from a week ago.
    for (const [ago, pattern, oneRow] of [
      [0, /^Saved 12\sPM$/, true],
      [DAY, /^Saved Sun 12\sPM$/, true],
      [5 * DAY - 59 * 60e3, /^Saved Wed 12:59\sPM$/, false],
      [8 * DAY + 79 * 60e3, /^Saved Jun 7, 10:41\sAM$/, false]
    ]) {
      await page.evaluate(([t]) => { const k = 'rowhether-cache-v2:putney-landing'; const c = JSON.parse(localStorage.getItem(k)); c.updated = t; localStorage.setItem(k, JSON.stringify(c)); }, [clock - ago]);
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await routeAll(page, scenario, clock, { abort: true });
      await page.reload();
      await ready(page);
      await expect(page.locator('#updated')).toHaveText(pattern);
      const spread = await state(await page.locator('#updated').textContent());
      if (oneRow) expect(spread, 'the actions are on one row').toBeLessThan(3);
      // The label itself is one line, and both buttons are on the screen.
      expect(await lines(page, '#updated')).toBe(1);
      await expect(page.locator('#refreshBtn')).toBeInViewport();
      await expect(page.locator('#settingsBtn')).toBeInViewport();
    }
  });

  test('the title, the line and the badge for a location the owner has not confirmed on site', async ({ page }) => {
    await serve(page, { 'lake-test': record('lake-test', { name: 'Lake Test', status: 'published', subtitle: 'A lake.', tz: 'America/New_York', tzLabel: 'Eastern' }) });
    await page.goto('/lake-test');
    await ready(page);
    await expect(page.locator('#locName')).toHaveText('Lake Test');
    await expect(page.locator('#sub')).toHaveText('A lake. All times Eastern.');
    await expect(page.locator('#locBadges')).toBeVisible();
    await expect(page.locator('#locBadges .badge')).toHaveText('Not confirmed on site');
    await expect(page).toHaveTitle('Lake Test rowing conditions');
    await expect(page.locator('#installText')).toHaveText('Add RoWhether to your home screen. It opens on Lake Test in one tap.');
    // Back at Putney, none of it is left.
    await page.evaluate(() => { history.pushState(null, '', '/putney-landing'); dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.locator('#locName')).toHaveText('Putney Landing');
    await expect(page.locator('#locBadges')).toBeHidden();
    await expect(page).toHaveTitle('Putney Landing rowing conditions');
  });

  // 07 4.3, 13: every curated name takes at most two lines at 360 px, and a name over 18
  // characters steps the title down to 1.25 rem there.
  test('fits every curated name in two lines at 360 px, and steps a long one down', async ({ page }) => {
    const names = ['Putney Landing', 'Hanover boathouse', 'Boathouse Row', 'Lake Quinsigamond', 'Lake Natoma', 'Thompson Boat Center', 'Lake Carnegie', 'Peter Jay Sharp Boathouse'];
    await serve(page, Object.fromEntries(names.map((n, i) => [`name-${i}`, record(`name-${i}`, { name: n })])));
    await page.setViewportSize({ width: 360, height: 844 });
    for (const [i, name] of names.entries()) {
      await page.goto(`/name-${i}`);
      await ready(page);
      await expect(page.locator('#locName')).toHaveText(name);
      expect(await lines(page, '#locName'), `${name} at 360 px`).toBeLessThanOrEqual(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${name} overflows`).toBeLessThanOrEqual(0);
      const size = await page.evaluate(() => getComputedStyle(document.getElementById('title')).fontSize);
      expect(size, `${name} (${name.length} characters)`).toBe(name.length > 18 ? '20px' : '24px');
    }
    // At 1280 px the long name keeps the title's size.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/name-5');
    await ready(page);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('title')).fontSize)).toBe('24px');
  });

  test('says only RoWhether on an address with no location', async ({ page }) => {
    await page.goto('/no-such-place');
    await expect(page.locator('#notFound')).toBeVisible();
    await expect(page.locator('#locName')).toHaveText('RoWhether');
    await expect(page.locator('#sub')).toHaveText('');
    await expect(page.locator('#locBadges')).toBeHidden();
    await expect(page.locator('#credits')).toBeHidden();
    await expect(page).toHaveTitle('RoWhether');
  });
});

// The subtitle: today's line for a viewer in Putney's zone, and the difference for another.
for (const [zone, tail] of [
  ['America/New_York', '.'],
  ['America/Chicago', ', 1 hour ahead of you.'],
  ['America/Los_Angeles', ', 3 hours ahead of you.'],
  ['Asia/Kolkata', ', 9 hours 30 minutes behind you.'],
  ['Pacific/Auckland', ', 16 hours behind you.']
]) {
  test.describe(`the subtitle on a device in ${zone}`, () => {
    test.use({ timezoneId: zone });

    test(`ends "${tail}" and every time on the screen is still Eastern`, async ({ page }) => {
      await page.clock.setFixedTime(clock);
      await routeAll(page, scenario, clock);
      await page.goto('/putney-landing');
      await ready(page);
      await expect(page.locator('#sub')).toHaveText(`${LINE}${tail}`);
      // The hero, the header and a tab's first line are what the golden file has for Eastern.
      await expect(page.locator('#holds')).toHaveText(GOLDEN.home.holds.textContent);
      await expect(page.locator('#updated')).toHaveText(/^Updated 12\sPM$/);
      await page.goto('/putney-landing#light');
      await tabDrawn(page, 'light');
      await expect(page.locator('#detail .lede')).toHaveText(GOLDEN.views.light.summary.text);
    });
  });
}

test.describe('the app name', () => {
  test('the built manifest names RoWhether, keeps the app identity, and the page links it', async ({ page, request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest).toMatchObject({ name: 'RoWhether', short_name: 'RoWhether', id: '/', start_url: './', scope: './', display: 'standalone' });
    expect(manifest.description).toBe('Go, caution or stay off: rowing conditions for your launch site, hour by hour.');
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
    await page.goto('/putney-landing');
    await ready(page);
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'RoWhether');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
    // The page at "/" keeps Putney's title, description and link preview through the 90 days (07 6.5).
    const root = await (await request.get('/')).text();
    for (const tag of ['<title>Putney Landing rowing conditions</title>', '<link rel="canonical" href="https://rowhether.com/">', '<meta property="og:title" content="Putney Landing rowing conditions">', '<meta name="description" content="Go, caution or stay off: rowing conditions on the Connecticut River at Putney Landing, VT.">']) {
      expect(root, tag).toContain(tag);
    }
  });

  test.describe('on an iPhone', () => {
    test.use({ userAgent: IPHONE_UA });

    test('the install bar, the steps and Settings say RoWhether and where it opens', async ({ page }) => {
      await page.clock.setFixedTime(clock);
      await routeAll(page, scenario, clock);
      await page.goto('/putney-landing');
      await ready(page);
      await expect(page.locator('#installBar')).toBeVisible();
      await expect(page.locator('#installText')).toHaveText('Add RoWhether to your home screen. It opens on Putney Landing in one tap.');
      await expect(page.locator('#installBar img')).toHaveAttribute('src', '/icon-192.png');
      await page.locator('#installGo').click();
      await expect(page.locator('#install')).toBeVisible();
      await expect(page.locator('#install .note')).toHaveText('Then open RoWhether from its icon. It opens on your last location and keeps the last forecast for when you are offline.');
      await page.keyboard.press('Escape');
      await page.locator('#settingsBtn').click();
      await expect(page.locator('#setInstall .note')).toHaveText('Add RoWhether to your home screen. It opens on your last location in one tap.');
      await page.keyboard.press('Escape');
      // No page text still says the old name.
      expect(await page.evaluate(() => document.body.innerText + document.title + [...document.querySelectorAll('meta')].map(m => m.content).join(' '))).not.toMatch(/Putney Row\b/);
    });
  });
});

test.describe('the footer', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
  });

  test('credits the NWS offices in Albany and Gray, with a link for every source', async ({ page }) => {
    await page.goto('/putney-landing');
    await ready(page);
    const credits = page.locator('#credits');
    await expect(credits).toContainText('Alerts from the National Weather Service offices in Albany and Gray, and Keene observations from the National Weather Service.');
    const links = await credits.locator('a').evaluateAll(as => as.map(a => [a.textContent, a.getAttribute('href'), a.target, a.rel]));
    expect(links).toEqual([
      ['Open-Meteo', 'https://open-meteo.com/', '_blank', 'noopener'],
      ['Albany', 'https://www.weather.gov/aly/', '_blank', 'noopener'],
      ['Gray', 'https://www.weather.gov/gyx/', '_blank', 'noopener'],
      ['01154500 at North Walpole', 'https://waterdata.usgs.gov/monitoring-location/USGS-01154500/', '_blank', 'noopener'],
      ['01161280 near Northfield', 'https://waterdata.usgs.gov/monitoring-location/USGS-01161280/', '_blank', 'noopener'],
      ['NWS Northeast River Forecast Center', 'https://water.noaa.gov/gauges/wlpn3', '_blank', 'noopener']
    ]);
    // The text shows no bracket or address, and the second paragraph is as it was.
    expect(await credits.textContent()).not.toMatch(/[\[\]]|https?:/);
    await expect(page.locator('footer p').last()).toHaveText('Thresholds are starting points, not club rules. Lightning: off the water at the first thunder, back on 30 minutes after the last. Look at the water before you launch.');
  });

  // R14: a record saved before this step has the old credits. It draws at once, and the
  // index, once read, brings in the record the build wrote.
  test('shows the new credits once the index has been read, for a saved record with the old ones', async ({ page }) => {
    const old = { ...PUTNEY_FILE, revision: 2, copy: { ...PUTNEY_FILE.copy, credits: OLD_CREDITS } };
    await page.addInitScript(rec => { localStorage.setItem('rowhether-migrated-v1', '1'); localStorage.setItem('rowhether-loc-v1:putney-landing', rec); }, JSON.stringify({ record: old, fetchedAt: clock }));
    let release;
    const gate = new Promise(done => { release = done; });
    await page.route('**/locations/index.json', async route => { await gate; await route.fallback(); });
    await page.goto('/putney-landing');
    await ready(page);
    await expect(page.locator('#credits')).toContainText('National Weather Service, Albany.');
    await expect(page.locator('#credits a')).toHaveCount(0);
    release();
    await expect(page.locator('#credits a')).toHaveCount(6);
    await expect(page.locator('#credits')).not.toContainText('National Weather Service, Albany.');
    expect(PUTNEY_FILE.revision).toBe(3);
  });
});
