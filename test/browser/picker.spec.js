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

  // P1.12: the same check on the records the build wrote, one page for each, so a location added
  // later is covered without a new line here.
  test('fits the name of every built location in two lines at 360 px, on the real records', async ({ page }) => {
    const { locations } = JSON.parse(readFileSync(new URL('../../dist/locations/index.json', import.meta.url), 'utf8'));
    expect(locations.map(l => l.slug)).toEqual(expect.arrayContaining(['putney-landing', 'hanover-boathouse', 'boathouse-row', 'lake-quinsigamond', 'lake-natoma', 'lake-carnegie']));
    await page.setViewportSize({ width: 360, height: 844 });
    for (const { slug, name } of locations) {
      await page.goto(`/${slug}`);
      await ready(page);
      await expect(page.locator('#locName')).toHaveText(name);
      expect(await lines(page, '#locName'), `${name} at 360 px`).toBeLessThanOrEqual(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${name} overflows`).toBeLessThanOrEqual(0);
      expect(await page.evaluate(() => getComputedStyle(document.getElementById('title')).fontSize), `${name} (${name.length} characters)`).toBe(name.length > 18 ? '20px' : '24px');
      // The actions stay on one row beside Updated, as for Putney.
      expect(await lines(page, '#updated'), `${name}: Updated`).toBe(1);
      await expect(page.locator('#settingsBtn')).toBeInViewport();
    }
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
    // The build's record is newer than the saved one, whatever revision a later step gives Putney.
    expect(PUTNEY_FILE.revision).toBeGreaterThan(old.revision);
  });
});

// ---------- Picking a location (P1.6; 07 5.1, 5.2, 4.7, 12.1, 12.2) ----------
const AFTER = Date.UTC(2027, 3, 1, 16); // after the first-visit window
const ROOT_TITLE = 'RoWhether: pick a location';
const entry = (slug, name, locality, waterway, region, over = {}) => ({ slug, name, shortName: name.split(' ')[0], locality, waterway, lat: 42, lon: -72, tz: 'America/New_York', country: 'US', region, waterType: 'river', status: 'published', revision: 1, ...over });
// The curated list as the build will write it, so the sheet has rows from several regions to sort and group.
// Each is where it is (plan section 4), so a distance from a position means something.
const INDEX = {
  v: 1,
  locations: [
    entry('putney-landing', 'Putney Landing', 'Putney, VT', 'Connecticut River', 'US-VT', { status: 'verified', revision: PUTNEY_FILE.revision, lat: 42.9607, lon: -72.5219 }),
    entry('hanover-boathouse', 'Hanover boathouse', 'Hanover, NH', 'Connecticut River', 'US-NH', { lat: 43.70552, lon: -72.29763 }),
    entry('boathouse-row', 'Boathouse Row', 'Philadelphia, PA', 'Schuylkill River', 'US-PA', { lat: 39.96941, lon: -75.18711 }),
    entry('lake-quinsigamond', 'Lake Quinsigamond', 'Worcester, MA', 'Lake Quinsigamond', 'US-MA', { waterType: 'lake', lat: 42.29043, lon: -71.75505 }),
    entry('lake-natoma', 'Lake Natoma', 'Folsom, CA', 'Lake Natoma', 'US-CA', { waterType: 'lake', lat: 38.63453, lon: -121.21918 }),
    entry('thompson-boat-center', 'Thompson Boat Center', 'Washington, DC', 'Potomac River', 'US-DC', { lat: 38.90053, lon: -77.05834 }),
    entry('lake-carnegie', 'Lake Carnegie', 'Princeton, NJ', 'Lake Carnegie', 'US-NJ', { waterType: 'lake', lat: 40.33932, lon: -74.65048 })
  ]
};
// The records the page may open: Putney's at the other addresses, with their own names.
const FILES = Object.fromEntries(['hanover-boathouse', 'lake-natoma', 'lake-carnegie', 'lake-quinsigamond'].map(slug => {
  const e = INDEX.locations.find(l => l.slug === slug);
  return [slug, record(slug, { name: e.name, status: 'published', subtitle: `${e.waterway} at ${e.locality}.`, tz: 'America/New_York', tzLabel: 'Eastern' })];
}));
const path = page => new URL(page.url()).pathname;
const stored = (page, key) => page.evaluate(k => localStorage.getItem(k), key);
const asks = page => { const urls = []; page.on('request', r => urls.push(new URL(r.url()).pathname)); return urls; };
function watchConsole(page) {
  const bad = [];
  page.on('pageerror', e => bad.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (!['error', 'warning'].includes(m.type()) || m.text() === 'Service Worker registration blocked by Playwright') return;
    const { url = '' } = m.location();
    if (/Failed to load resource.*404/.test(m.text()) && /\/api\/(info|suggest)(\?|$)/.test(url)) return;
    bad.push(`${m.type()}: ${m.text()} (${url})`);
  });
  return bad;
}

test.describe('the first visit to "/"', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
  });

  test('inside the window shows Putney Landing with a note above the hero, in place of the Settings reminder, and stores no location', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await expect(page.locator('#pickNote')).toBeVisible();
    await expect(page.locator('#pickNote p')).toHaveText('Not your water? Pick a location.');
    await expect(page.locator('#pickNote button')).toHaveText(['Dismiss', 'Pick a location']);
    // One note at a time: nothing is saved here, so the Settings reminder would show without it.
    await expect(page.locator('#setNudge')).toBeHidden();
    const tops = await page.evaluate(() => ['pickNote', 'hero'].map(id => document.getElementById(id).getBoundingClientRect().top));
    expect(tops[0], 'the note is above the hero').toBeLessThan(tops[1]);
    expect(path(page)).toBe('/');
    expect(await stored(page, 'rowhether-last-v1')).toBeNull();
    await expect(page.locator('#locName')).toHaveText('Putney Landing');
    await expect(page).toHaveTitle('Putney Landing rowing conditions');
  });

  test('"Pick a location" opens the sheet, and Escape closes it with focus back on the button', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.locator('#pickNoteBtn').click();
    await expect(page.getByRole('dialog', { name: 'Change location' })).toBeVisible();
    await expect(page.locator('#pickTitle')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('#pickNoteBtn')).toBeFocused();
    await expect(page.locator('#pickNote')).toBeVisible();
  });

  test('a reload without an answer shows the note again. Dismiss ends it, brings the Settings reminder back, and "/" is Putney at its address from then on', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.reload();
    await ready(page);
    await expect(page.locator('#pickNote')).toBeVisible();
    expect(path(page)).toBe('/');
    expect(await stored(page, 'rowhether-last-v1')).toBeNull();
    await page.locator('#pickNoteLater').click();
    await expect(page.locator('#pickNote')).toBeHidden();
    await expect(page.locator('#setNudge')).toBeVisible();
    expect(await stored(page, 'rowhether-last-v1')).toBe('putney-landing');
    expect(await stored(page, 'rowhether-pickhint-v1')).toBe('1');
    expect(path(page), 'the address waits for the next visit').toBe('/');
    await page.reload();
    await ready(page);
    await expect(page.locator('#pickNote')).toBeHidden();
    expect(path(page)).toBe('/putney-landing');
  });

  test('picking Putney Landing from the sheet answers the note the same way', async ({ page }) => {
    await serve(page, { index: INDEX });
    await page.goto('/');
    await ready(page);
    await page.locator('#pickNoteBtn').click();
    await page.locator('#picker .pk-cur .pk-row, #picker .plist .pk-row').first().click();
    await expect(page.locator('#pickNote')).toBeHidden();
    expect(path(page)).toBe('/putney-landing');
    expect(await stored(page, 'rowhether-last-v1')).toBe('putney-landing');
    await expect(page.locator('#setNudge')).toBeVisible();
  });

  test('picking another location from the sheet opens it, and Back returns to Putney at "/" without the note', async ({ page }) => {
    await serve(page, { index: INDEX, ...FILES });
    await page.goto('/');
    await ready(page);
    await page.locator('#pickNoteBtn').click();
    await page.locator('#picker .pk-row', { hasText: 'Lake Natoma' }).last().click();
    await expect(page.locator('#locName')).toHaveText('Lake Natoma');
    await ready(page);
    expect(path(page)).toBe('/lake-natoma');
    await expect(page.locator('#pickNote')).toBeHidden();
    expect(await stored(page, 'rowhether-last-v1')).toBe('lake-natoma');
    await page.goBack();
    await expect(page.locator('#locName')).toHaveText('Putney Landing');
    expect(path(page)).toBe('/');
    await expect(page.locator('#pickNote')).toBeHidden();
    expect(await stored(page, 'rowhether-last-v1'), 'showing Putney again did not choose it').toBe('lake-natoma');
  });

  // The record Putney had before P1.5: saved in this browser, and replaced once the index has been read.
  test('keeps the note when a newer record of Putney replaces the saved one', async ({ page }) => {
    const old = { ...PUTNEY_FILE, revision: 2, copy: { ...PUTNEY_FILE.copy, credits: OLD_CREDITS } };
    await page.addInitScript(rec => { localStorage.setItem('rowhether-migrated-v1', '1'); localStorage.setItem('rowhether-loc-v1:putney-landing', rec); }, JSON.stringify({ record: old, fetchedAt: clock }));
    let release;
    const gate = new Promise(done => { release = done; });
    await page.route('**/locations/index.json', async route => { await gate; await route.fallback(); });
    await page.goto('/');
    await ready(page);
    await expect(page.locator('#pickNote')).toBeVisible();
    await expect(page.locator('#credits a')).toHaveCount(0);
    release();
    await expect(page.locator('#credits a')).toHaveCount(6);
    await expect(page.locator('#pickNote')).toBeVisible();
    await expect(page.locator('#setNudge')).toBeHidden();
    expect(path(page)).toBe('/');
  });

  test('after the window, with nothing stored, "/" is the picker page: no tabs, no Refresh or Settings, nothing asked of any weather source', async ({ page }) => {
    const bad = watchConsole(page);
    const seen = await routeAll(page, scenario, clock);
    await page.clock.setFixedTime(AFTER);
    await page.goto('/');
    await expect(page.locator('.pk-q')).toBeVisible();
    await expect(page.locator('#notFound h2')).toHaveText('Where do you row?');
    await expect(page.locator('#notFound .lede')).toHaveText('Pick your launch site. RoWhether checks wind, fog, storms, river flow and daylight there, hour by hour, and says Go, Caution or Stay off.');
    await expect(page.locator('#locName')).toHaveText('RoWhether');
    await expect(page).toHaveTitle(ROOT_TITLE);
    for (const id of ['tabs', 'actions', 'home', 'detail', 'credits']) await expect(page.locator(`#${id}`), id).toBeHidden();
    await expect(page.locator('#refreshBtn')).toBeHidden();
    await expect(page.locator('#settingsBtn')).toBeHidden();
    // The built list: the groups by region name, each place with its town and water (P1.12 to P1.14).
    await expect(page.locator('#notFound .pk-group')).toHaveText(['California', 'District of Columbia', 'Massachusetts', 'New Hampshire', 'New Jersey', 'Pennsylvania', 'Vermont']);
    await expect(page.locator('#notFound .pk-row')).toHaveText([
      /Lake Natoma\s*Gold River, CA\./, /Thompson Boat Center\s*Washington, DC\. Potomac River\./, /Lake Quinsigamond\s*Shrewsbury, MA\./, /Hanover boathouse\s*Hanover, NH\. Connecticut River\./, /Lake Carnegie\s*Princeton, NJ\./,
      /Boathouse Row\s*Philadelphia, PA\. Schuylkill River\./, /Putney Landing\s*Putney, VT\. Connecticut River\./
    ]);
    await expect(page.locator('#notFound .pk-here')).toHaveCount(0);
    // The list is long: it is not read out when the page draws it (07 12.3).
    await expect(page.locator('#notFound .pk')).toHaveAttribute('aria-live', 'off');
    expect(path(page)).toBe('/');
    expect(seen.served).toEqual([]);
    expect(await stored(page, 'rowhether-last-v1')).toBeNull();
    expect(bad).toEqual([]);
    // The same on the next visit: nothing was chosen.
    await page.reload();
    await expect(page.locator('.pk-q')).toBeVisible();
  });

  test('the picker page at 360 px does not scroll sideways, lists the regions in order, and searches with no request', async ({ page }) => {
    await serve(page, { index: INDEX, ...FILES });
    await page.setViewportSize({ width: 360, height: 780 });
    await page.clock.setFixedTime(AFTER);
    await page.goto('/');
    await expect(page.locator('.pk-q')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await expect(page.locator('#notFound .pk-group')).toHaveText(['California', 'District of Columbia', 'Massachusetts', 'New Hampshire', 'New Jersey', 'Pennsylvania', 'Vermont']);
    await expect(page.locator('#notFound h4.pk-group').first()).toBeVisible();
    const requests = asks(page);
    await page.locator('.pk-q').pressSequentially('put');
    await expect(page.locator('.pk-found .pk-row')).toHaveCount(1);
    await expect(page.locator('.pk-found .pk-row')).toContainText('Putney Landing');
    await expect(page.locator('.pk-rest')).toBeHidden();
    // The town search is the one request typing can lead to, and it waits for a pause (see "town search").
    expect(requests.filter(p => p !== '/v1/search'), 'no request from the first key to the last').toEqual([]);
    // Tab reaches the result, which is a link (the Near me button may come first), and Enter opens it.
    const first = page.locator('.pk-found .pk-row');
    for (let i = 0; i < 3 && !(await first.evaluate(a => a === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    await page.clock.setFixedTime(clock); // the forecasts are cut at this moment
    await page.keyboard.press('Enter');
    await ready(page);
    expect(path(page)).toBe('/putney-landing');
    await expect(page).toHaveTitle('Putney Landing rowing conditions');
    await expect(page.locator('#pageAnnounce')).toHaveText('Showing Putney Landing.');
    await expect(page.locator('#title')).toBeFocused();
    expect(await stored(page, 'rowhether-last-v1')).toBe('putney-landing');
    // Back is the picker again, though "/" would now open the location just chosen.
    await page.goBack();
    await expect(page.locator('.pk-q')).toBeVisible();
    expect(path(page)).toBe('/');
    await expect(page).toHaveTitle(ROOT_TITLE);
    await expect(page.locator('#tabs')).toBeHidden();
  });
});

test.describe('the sheet', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
    await serve(page, { index: INDEX, ...FILES });
  });

  test('is opened by Enter on the location name, takes focus on its heading, and Escape returns focus to the name', async ({ page }) => {
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Change location' })).toBeVisible();
    await expect(page.locator('#pickTitle')).toHaveText('Change location');
    await expect(page.locator('#pickTitle')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('#locBtn')).toBeFocused();
  });

  test('lists the current location first with "Showing now", then all of them by region, each row a link with its place and water', async ({ page }) => {
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    const rows = page.locator('#picker .pk-row');
    await expect(rows.first()).toContainText('Putney Landing');
    await expect(rows.first().locator('.pk-here')).toHaveText('Showing now');
    await expect(page.locator('#picker .pk-here')).toHaveCount(1);
    await expect(rows.first().locator('.pk-sub')).toHaveText('Putney, VT. Connecticut River.');
    await expect(page.locator('#picker h3')).toHaveText(['All locations']);
    await expect(page.locator('#picker .pk-group')).toHaveText(['California', 'District of Columbia', 'Massachusetts', 'New Hampshire', 'New Jersey', 'Pennsylvania', 'Vermont']);
    // Locality and waterway are left out when they repeat the name.
    await expect(page.locator('#picker .pk-row', { hasText: 'Lake Natoma' }).locator('.pk-sub')).toHaveText('Folsom, CA.');
    expect(await rows.evaluateAll(as => as.map(a => a.getAttribute('href') + (a.hasAttribute('data-nav') ? ' nav' : '')))).toEqual([
      '/putney-landing nav', '/lake-natoma nav', '/thompson-boat-center nav', '/lake-quinsigamond nav', '/hanover-boathouse nav', '/lake-carnegie nav', '/boathouse-row nav', '/putney-landing nav'
    ]);
    // The suggestion line waits for the form to be configured, which it is not here.
    await expect(page.locator('#picker .pk-sug')).toBeHidden();
    await expect(page.locator('#picker .dlg-actions button')).toHaveText('Close');
    await page.locator('#picker .pk-x').click();
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('#locBtn')).toBeFocused();
    await page.locator('#locBtn').click();
    await page.locator('#picker .dlg-actions button').click();
    await expect(page.locator('#picker')).toBeHidden();
  });

  test('searches from 2 characters, best match first, and the matches replace the lists', async ({ page }) => {
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    const q = page.getByLabel('Find a location');
    await expect(q).toHaveAttribute('type', 'search');
    await expect(q).toHaveAttribute('placeholder', 'Boathouse, lake, river or town');
    await expect(q).toHaveAttribute('autocomplete', 'off');
    await expect(q).toHaveAttribute('enterkeyhint', 'search');
    await q.fill('l');
    await expect(page.locator('.pk-found .pk-row')).toHaveCount(0);
    await expect(page.locator('.pk-rest')).toBeVisible();
    // Two characters are enough. A name that starts with them comes before a name with a word that does.
    await q.fill('la');
    await expect(page.locator('.pk-found .pk-name')).toHaveText(['Lake Carnegie', 'Lake Natoma', 'Lake Quinsigamond', 'Putney Landing']);
    await expect(page.locator('.pk-rest')).toBeHidden();
    await q.fill('lak');
    await expect(page.locator('.pk-found .pk-name')).toHaveText(['Lake Carnegie', 'Lake Natoma', 'Lake Quinsigamond']);
    await q.fill('boat');
    await expect(page.locator('.pk-found .pk-name')).toHaveText(['Boathouse Row', 'Hanover boathouse', 'Thompson Boat Center']);
    await q.fill('worcester');
    await expect(page.locator('.pk-found .pk-name')).toHaveText(['Lake Quinsigamond']);
    await q.fill('Quinsigamónd'); // accents do not matter
    await expect(page.locator('.pk-found .pk-name')).toHaveText(['Lake Quinsigamond']);
    await q.fill('Quinsigamund');
    await expect(page.locator('.pk-found')).toContainText('Nothing matches "Quinsigamund". Check the spelling, or search for a town.');
    await q.fill('<b>x</b>');
    await expect(page.locator('.pk-found b')).toHaveCount(0);
    await expect(page.locator('.pk-found')).toContainText('Nothing matches "<b>x</b>".');
    await q.fill('');
    await expect(page.locator('.pk-found')).toHaveText('');
    await expect(page.locator('.pk-rest')).toBeVisible();
  });

  test('choosing a row opens the location, closes the sheet, moves focus to the title, says where it is and scrolls to the top; Recent then lists the one left', async ({ page }) => {
    await page.goto('/putney-landing');
    await ready(page);
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.locator('#locBtn').click();
    await page.locator('#picker .pk-rest .pk-row', { hasText: 'Hanover boathouse' }).click();
    await expect(page.locator('#locName')).toHaveText('Hanover boathouse');
    await ready(page);
    await expect(page.locator('#picker')).toBeHidden();
    expect(path(page)).toBe('/hanover-boathouse');
    await expect(page).toHaveTitle('Hanover boathouse rowing conditions');
    await expect(page.locator('#pageAnnounce')).toHaveText('Showing Hanover boathouse.');
    await expect(page.locator('#title')).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await stored(page, 'rowhether-last-v1')).toBe('hanover-boathouse');
    // The sheet now: Hanover is showing, Putney is recent.
    await page.locator('#locBtn').click();
    await expect(page.locator('#picker .pk-row').first()).toContainText('Hanover boathouse');
    await expect(page.locator('#picker h3')).toHaveText(['Recent', 'All locations']);
    await expect(page.locator('#picker .pk-rest .plist').first().locator('.pk-name')).toHaveText(['Putney Landing']);
  });

  test('a modified click on a row is left to the browser, and the sheet stays', async ({ page }) => {
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    await page.locator('#picker .pk-rest .pk-row', { hasText: 'Lake Carnegie' }).click({ modifiers: ['Shift'], trial: true });
    // A shift click opens a window in a real browser. Here the click is not sent, only the page's own handling is read.
    const kept = await page.evaluate(() => {
      const a = [...document.querySelectorAll('#picker .pk-rest .pk-row')].find(x => x.textContent.includes('Lake Carnegie'));
      const e = new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true });
      a.dispatchEvent(e);
      return { prevented: e.defaultPrevented, open: document.getElementById('picker').open };
    });
    expect(kept).toEqual({ prevented: false, open: true });
    expect(path(page)).toBe('/putney-landing');
  });

  test('rises from the bottom edge at 360 px and is a centered dialog at 1280 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    await expect(page.locator('#picker')).toBeVisible();
    let box = await page.locator('#picker').boundingBox();
    expect(box.x).toBe(0);
    expect(box.width).toBe(360);
    expect(Math.round(box.y + box.height)).toBe(780);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#picker')).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.locator('#locBtn').click();
    await expect(page.locator('#picker')).toBeVisible();
    box = await page.locator('#picker').boundingBox();
    expect(box.width).toBeLessThanOrEqual(34 * 16);
    expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(2);
    expect(box.y).toBeGreaterThan(0);
  });

  test('is not read until the first tap on the location name, and then is read once, with its styles', async ({ page }) => {
    const requests = asks(page);
    await page.goto('/putney-landing');
    await ready(page);
    expect(requests.filter(p => /\/picker-/.test(p)), 'before the first tap').toEqual([]);
    await page.locator('#locBtn').click();
    await expect(page.locator('#picker')).toBeVisible();
    expect(requests.filter(p => /\/picker-.*\.js$/.test(p))).toHaveLength(1);
    expect(requests.filter(p => /\/picker-.*\.css$/.test(p))).toHaveLength(1);
    await page.keyboard.press('Escape');
    await page.locator('#locBtn').click();
    await expect(page.locator('#picker')).toBeVisible();
    expect(requests.filter(p => /\/picker-/.test(p)), 'the second tap reads nothing more').toHaveLength(2);
    await expect(page.locator('#picker .pk-row')).not.toHaveCount(0);
  });

  // Some browsers refuse showModal() on a dialog that is open (Chromium now ignores it), so the page is made to.
  test('a second tap while the first is still loading opens one sheet, and the page says nothing about it', async ({ page }) => {
    await page.addInitScript(() => {
      const show = HTMLDialogElement.prototype.showModal;
      HTMLDialogElement.prototype.showModal = function () { if (this.open) throw new DOMException('The dialog is open.', 'InvalidStateError'); return show.call(this); };
    });
    const bad = watchConsole(page);
    await page.goto('/putney-landing');
    await ready(page);
    await page.evaluate(() => { const b = document.getElementById('locBtn'); b.click(); b.click(); });
    await expect(page.locator('#picker')).toBeVisible();
    await expect(page.locator('#picker .pk-q')).toHaveCount(1);
    await page.waitForTimeout(200);
    expect(bad).toEqual([]);
  });
});

test.describe('?open=picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
    await serve(page, { index: INDEX, ...FILES });
  });

  test('over a location opens the sheet once the location is drawn, and the query leaves the address', async ({ page }) => {
    await page.goto('/putney-landing?open=picker#wind');
    await expect(page.locator('#picker')).toBeVisible();
    await expect(page.locator('#picker .pk-here')).toHaveCount(1);
    expect(new URL(page.url()).search).toBe('');
    expect(new URL(page.url()).hash).toBe('#wind');
  });

  // Nothing had focus when it opened, so there is no control for the browser to give focus back to.
  test('Escape returns focus to the location name when nothing had focus', async ({ page }) => {
    await page.goto('/putney-landing?open=picker');
    await expect(page.locator('#picker')).toBeVisible();
    await expect(page.locator('#pickTitle')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('#locBtn')).toBeFocused();
  });

  test('at "/" opens the sheet over the last location, and with none stored is the picker page, even inside the window', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('rowhether-last-v1', 'lake-natoma'));
    await page.goto('/?open=picker');
    await expect(page.locator('#picker')).toBeVisible();
    await expect(page.locator('#picker .pk-row').first()).toContainText('Lake Natoma');
    expect(path(page) + new URL(page.url()).search).toBe('/lake-natoma');
  });

  test('with nothing stored it is the picker page, not Putney with its note', async ({ page }) => {
    await page.goto('/?open=picker');
    await expect(page.locator('#notFound h2')).toHaveText('Where do you row?');
    await expect(page.locator('#pickNote')).toBeHidden();
    expect(path(page) + new URL(page.url()).search).toBe('/');
  });
});

test.describe('the picker page that arrives late', () => {
  test('does not draw over a location opened while the list was loading, nor change the title', async ({ page }) => {
    await routeAll(page, scenario, clock);
    let release;
    const gate = new Promise(done => { release = done; });
    await page.route('**/locations/index.json', async route => { await gate; await route.fallback(); });
    await page.clock.setFixedTime(AFTER);
    await page.goto('/');
    await expect(page.locator('#notFound')).toBeVisible(); // the page, with the list still to come
    await page.clock.setFixedTime(clock);
    await page.evaluate(() => { history.pushState(null, '', '/putney-landing'); dispatchEvent(new PopStateEvent('popstate')); });
    await ready(page);
    const listed = page.waitForResponse(r => r.url().endsWith('/locations/index.json'));
    release();
    await listed;
    await page.evaluate(() => new Promise(done => setTimeout(done, 50)));
    await expect(page.locator('#notFound .pk')).toHaveCount(0);
    await expect(page).toHaveTitle('Putney Landing rowing conditions');
    await expect(page.locator('#notFound')).toBeHidden();
  });
});

test.describe('an address with no location', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: clock });
  });

  test('has the search under its words, filled in with the address, and picking from it opens the location (R9)', async ({ page }) => {
    const bad = watchConsole(page);
    const seen = await routeAll(page, scenario, clock);
    // An address no record is at (Lake Quinsigamond was one until P1.13 gave it a record).
    await page.goto('/lake-nowhere');
    await expect(page.locator('#notFound h2')).toHaveText('No location here');
    await expect(page.locator('#notFound')).toContainText('No location at rowhether.com/lake-nowhere.');
    const q = page.locator('#notFound .pk-q');
    await expect(q).toHaveValue('lake nowhere');
    await expect(page.locator('#notFound .pk-found')).toContainText('Nothing matches "lake nowhere". Check the spelling, or search for a town.');
    // Nothing else is on the page: no list of every location, no tabs.
    await expect(page.locator('#notFound h3')).toHaveCount(0);
    await expect(page.locator('#tabs')).toBeHidden();
    // The tab comes back with the page like this: no request.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.clock.runFor(11 * 60e3);
    expect(seen.served).toEqual([]);
    await q.fill('putney');
    await page.locator('#notFound .pk-row').click();
    await page.clock.runFor(50);
    await ready(page);
    expect(path(page)).toBe('/putney-landing');
    await expect(page.locator('#verdict')).toHaveText('Go.');
    await expect(page.locator('#notFound')).toBeHidden();
    expect(seen.served).toHaveLength(9);
    await expect(page.locator('#title')).toBeFocused();
    expect(bad).toEqual([]);
  });

  test('an address that is not a slug has it too, from its words', async ({ page }) => {
    await routeAll(page, scenario, clock);
    await page.goto('/Putney-Landing/extra');
    await expect(page.locator('#notFound .pk-q')).toHaveValue('putney landing extra');
    await expect(page.locator('#notFound .pk-found')).toContainText('Nothing matches');
    await page.locator('#notFound .pk-q').fill('putney');
    await expect(page.locator('#notFound .pk-found .pk-row')).toHaveCount(1);
  });

  test('a location that did not load keeps its retry button and gains the search', async ({ page }) => {
    await routeAll(page, scenario, clock);
    // The index lists it and its file is a failure: the page cannot say whether it exists.
    await serve(page, { index: { v: 1, locations: [...INDEX.locations, entry('lake-broken', 'Lake Broken', 'Nowhere, VT', null, 'US-VT')] } });
    await page.route('**/locations/lake-broken.json', route => route.abort('failed'));
    await page.goto('/lake-broken');
    await expect(page.locator('#notFound h2')).toHaveText('Could not load this location');
    await expect(page.locator('#retryBtn')).toBeVisible();
    await expect(page.locator('#notFound .pk-q')).toBeVisible();
    await expect(page.locator('#notFound .pk-q')).toHaveValue('');
  });
});

// The page for no location is drawn again while an earlier draw is still waiting for the list of
// locations (a slow connection: Try again, or Back between two addresses). The newer draw is the
// page, and the earlier one is dropped when it answers, not drawn beside it.
test.describe('the page for no location drawn again before the list arrives', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
  });
  // The list is held until release(). waiting() counts the requests held, answers() those answered.
  async function holdList(page) {
    const held = []; let answered = 0;
    page.on('response', r => { if (r.url().endsWith('/locations/index.json')) answered++; });
    await page.route('**/locations/index.json', async route => { await new Promise(done => held.push(done)); await route.fallback(); });
    return { waiting: () => held.length, answers: () => answered, release: () => held.forEach(done => done()) };
  }

  test('Try again on a location that did not load, with the first search still waiting, leaves one search box', async ({ page }) => {
    await page.route('**/locations/lake-broken.json', route => route.abort('failed'));
    const list = await holdList(page);
    await page.goto('/lake-broken');
    await expect(page.locator('#notFound h2')).toHaveText('Could not load this location');
    await page.locator('#retryBtn').click();
    await expect.poll(list.waiting).toBe(2);
    list.release();
    await expect.poll(list.answers).toBe(2);
    await page.evaluate(() => new Promise(done => setTimeout(done, 100)));
    await expect(page.locator('#notFound .pk-q')).toHaveCount(1);
    await expect(page.locator('#retryBtn')).toHaveCount(1);
  });

  test('Back between two addresses with no location, the first search answering last, leaves the search of the newer one', async ({ page }) => {
    const list = await holdList(page);
    await page.goto('/Aaa');
    await expect(page.locator('#notFound h2')).toHaveText('No location here');
    await page.evaluate(() => { history.pushState(null, '', '/Bbb'); dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.locator('#notFound')).toContainText('No location at rowhether.com/Bbb.');
    await expect.poll(list.waiting).toBe(2);
    list.release();
    await expect.poll(list.answers).toBe(2);
    await page.evaluate(() => new Promise(done => setTimeout(done, 100)));
    await expect(page.locator('#notFound .pk-q')).toHaveCount(1);
    await expect(page.locator('#notFound .pk-q')).toHaveValue('bbb');
  });
});

test.describe('the suggestion line', () => {
  test('shows in the sheet and the page when the suggestion form is configured, and closes the sheet to open the form', async ({ page }) => {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
    await page.route('**/api/suggest', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, siteKey: 'test-key' }) }));
    await page.goto('/putney-landing');
    await ready(page);
    await expect(page.locator('#suggestBtn')).toBeVisible();
    await page.locator('#locBtn').click();
    await expect(page.locator('#picker .pk-sug')).toBeVisible();
    await expect(page.locator('#picker .pk-sug button')).toHaveText('Suggest a location');
    await page.locator('#picker .pk-sug button').click();
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('#suggest')).toBeVisible();
  });

  test('is on the picker page too, worded as a question', async ({ page }) => {
    await routeAll(page, scenario, clock);
    await page.route('**/api/suggest', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, siteKey: 'test-key' }) }));
    await page.clock.setFixedTime(AFTER);
    await page.goto('/');
    await expect(page.locator('#notFound .pk-sug')).toBeVisible();
    await expect(page.locator('#notFound .pk-sug')).toContainText('Not here? Suggest a location');
  });
});

// ---------- Near me, the town search and the picker offline (P1.7; 07 5.2.1, 5.2.2, 9.4) ----------
const DOCK = { latitude: 42.96, longitude: -72.52 };
const GEOCODE = /^https:\/\/geocoding-api\.open-meteo\.com\/v1\/search\?/;
// Request events reach the test a moment after the page makes the request. Wait for them before saying none was made.
const settle = page => page.waitForTimeout(300);
// The names the town search was asked for, in order.
function townAsks(page) {
  const names = [];
  page.on('request', r => { if (GEOCODE.test(r.url())) names.push(new URL(r.url()).searchParams.get('name')); });
  return { names };
}
// A page whose clock stands still from the moment it has drawn, so the pause before a town search and
// the wait between two end only when the test runs the clock. Timers, but not the network, follow it.
async function stillClock(page, url = '/putney-landing') {
  await page.clock.install({ time: clock });
  await page.goto(url);
  await ready(page);
  await page.clock.pauseAt(clock + 60e3);
}
// Counts the calls to getCurrentPosition. `how` is what a call does: 'real' asks the browser, 'timeout' and
// 'refused' fail as the browser would, 'hold' waits for the test to answer (window.__geo.later[0].ok(...)).
// 'denied' also makes the permissions API say so.
async function stubGeo(page, how) {
  await page.addInitScript(how => {
    const geo = (window.__geo = { calls: [], later: [] });
    const real = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (ok, no, opts) => {
      geo.calls.push(opts || { noOptions: true }); // a call is a call, whatever it passes
      if (how === 'real') real(ok, no, opts);
      else if (how === 'timeout') no({ code: 3, message: 'Timeout expired' });
      else if (how === 'refused') no({ code: 1, message: 'User denied Geolocation' });
      else geo.later.push({ ok, no });
    };
    if (how === 'denied') navigator.permissions.query = async () => ({ state: 'denied' });
  }, how);
}
const geoCalls = page => page.evaluate(() => window.__geo.calls);
// The tap's call reaches the stub a moment after the click, since the permissions query comes first: wait for it
// before a test answers or interrupts it, or window.__geo.later[0] can still be missing.
const geoAsked = (page, n = 1) => expect.poll(async () => (await geoCalls(page)).length).toBe(n);
const SAT = (lat, lon) => ({ coords: { latitude: lat, longitude: lon } });
const NEAR_DENIED = 'Location is off for this site. Search by name, or allow location for rowhether.com in your browser settings.';
const NEAR_LOST = 'Could not find your position. Try again, or search by name.';
const TOWN_FAIL = 'Town search is not available right now. Location names still work.';

test.describe('Near me', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
    await serve(page, { index: INDEX, ...FILES });
  });

  test('is a button under the search with its hint, in the sheet, on the picker page and under a missing address', async ({ page }) => {
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    await expect(page.locator('#picker .pk-q')).toBeVisible();
    const labels = await page.locator('#picker .pk-label, #picker .pk-near').evaluateAll(els => els.map(el => el.className));
    expect(labels, 'the button follows the search box').toEqual(['pk-label', 'pk-near']);
    await expect(page.getByRole('button', { name: 'Near me' })).toBeVisible();
    await expect(page.locator('#picker .pk-hint')).toHaveText('Uses your position once to sort the list. It is not stored.');
    await expect(page.getByRole('button', { name: 'Near me' })).toHaveAccessibleDescription('Uses your position once to sort the list. It is not stored.');
    await page.keyboard.press('Escape');
    await page.evaluate(() => localStorage.clear()); // "/" would open the location left last
    await page.clock.setFixedTime(AFTER);
    await page.goto('/');
    await expect(page.locator('#notFound .pk-near button')).toHaveText('Near me');
    await expect(page.locator('#notFound .pk-hint')).toBeVisible();
    await page.goto('/lake-nowhere');
    await expect(page.locator('#notFound .pk-near button')).toHaveText('Near me');
  });

  // The real permission and the real geolocation, set by the context to the dock.
  test.describe('granted at the dock', () => {
    test.use({ geolocation: DOCK, permissions: ['geolocation'] });

    test('lists the locations within 100 km nearest first under "Near you", each with its distance in miles, and says how many', async ({ page, context }) => {
      await stubGeo(page, 'real');
      const bad = watchConsole(page);
      await page.goto('/putney-landing');
      await ready(page);
      await page.locator('#locBtn').click();
      await expect(page.locator('#picker .pk-q')).toBeVisible();
      expect(await geoCalls(page), 'opening the sheet asks for no position').toEqual([]);
      const keys = await page.evaluate(() => Object.keys(localStorage).sort());
      const seen = [];
      page.on('request', r => seen.push(r.url()));
      await page.getByRole('button', { name: 'Near me' }).click();
      await expect(page.locator('#picker .pk-found h3')).toHaveText('Near you');
      await expect(page.locator('#picker .pk-found .pk-name')).toHaveText(['Putney Landing', 'Hanover boathouse', 'Lake Quinsigamond']);
      await expect(page.locator('#picker .pk-found .pk-dist')).toHaveText(['0.1 mi', '53 mi', '60 mi']);
      await expect(page.locator('#picker .pk-found .pk-row').first().locator('.pk-here')).toHaveText('Showing now');
      await expect(page.locator('#picker .pk-rest')).toBeHidden();
      await expect(page.locator('#picker .pk-say')).toHaveText('3 locations near you.');
      await expect(page.locator('#picker .pk-say')).toHaveAttribute('role', 'status');
      await expect(page.locator('#picker .pk-near button')).toBeEnabled();
      await expect(page.locator('#picker .pk-near button')).toHaveText('Near me');
      expect(await geoCalls(page)).toEqual([{ enableHighAccuracy: false, maximumAge: 600000, timeout: 10000 }]);
      // Nothing is sent or kept: no request, and no new key.
      expect(seen, 'the position goes nowhere').toEqual([]);
      expect(await page.evaluate(() => Object.keys(localStorage).sort())).toEqual(keys);
      expect(bad).toEqual([]);
      // A row opens its location, as any row does.
      await page.locator('#picker .pk-found .pk-row', { hasText: 'Hanover boathouse' }).click();
      await expect(page.locator('#locName')).toHaveText('Hanover boathouse');
      expect(path(page)).toBe('/hanover-boathouse');
    });

    test('rounds the position to 2 decimals before it sorts: 42.9649, -72.5249 is 0.1 mi from the dock, not 0.3', async ({ page, context }) => {
      await context.setGeolocation({ latitude: 42.9649, longitude: -72.5249 });
      await stubGeo(page, 'real');
      await page.goto('/putney-landing');
      await ready(page);
      await page.locator('#locBtn').click();
      await page.getByRole('button', { name: 'Near me' }).click();
      await expect(page.locator('#picker .pk-found .pk-dist').first()).toHaveText('0.1 mi');
    });

    test('works from the picker page, and typing afterwards brings the matches back', async ({ page }) => {
      await page.clock.setFixedTime(AFTER);
      await page.goto('/');
      await page.getByRole('button', { name: 'Near me' }).click();
      await expect(page.locator('#notFound .pk-found .pk-name')).toHaveText(['Putney Landing', 'Hanover boathouse', 'Lake Quinsigamond']);
      await expect(page.locator('#notFound .pk-rest')).toBeHidden();
      await page.locator('#notFound .pk-q').fill('lak');
      await expect(page.locator('#notFound .pk-found .pk-name')).toHaveText(['Lake Carnegie', 'Lake Natoma', 'Lake Quinsigamond']);
      await expect(page.locator('#notFound .pk-found .pk-dist')).toHaveCount(0);
      await page.locator('#notFound .pk-q').fill('');
      await expect(page.locator('#notFound .pk-rest')).toBeVisible();
      await expect(page.locator('#notFound .pk-found')).toHaveText('');
    });

    // The button is disabled while it waits, and a disabled button gives up focus. 07 12.1: Tab to "Near me",
    // Enter. The viewer must still be on the button when the answer comes, so the next Tab is the first result.
    test('keyboard: Enter on Near me leaves focus on it, and the next Tab is the first result', async ({ page }) => {
      await stubGeo(page, 'real');
      await page.goto('/putney-landing');
      await ready(page);
      await page.locator('#locBtn').click();
      const near = page.getByRole('button', { name: 'Near me' });
      await near.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('#picker .pk-found h3')).toHaveText('Near you');
      await expect(near).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#picker .pk-found .pk-row').first()).toBeFocused();
    });
  });

  // The note carries the help and timeout lines. A live region is read out when text is put into it, but not
  // when it is shown with the text already in it, so it stays in the page while empty and takes no room.
  test('the note is a live region that is in the page while it is empty, and takes no room', async ({ page }) => {
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    const note = page.locator('#picker .pk-note');
    await expect(note).toHaveAttribute('role', 'status');
    await expect(note).toHaveText('');
    const shape = await note.evaluate(el => { const css = getComputedStyle(el); return { display: css.display, height: el.getBoundingClientRect().height, margin: css.marginTop + css.marginBottom }; });
    expect(shape.display, 'display none takes the region out of the page').not.toBe('none');
    expect(shape.height).toBe(0);
    expect(shape.margin).toBe('0px0px');
  });

  test('keyboard: the help line for a refusal leaves focus on Near me', async ({ page }) => {
    await stubGeo(page, 'denied');
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    const near = page.getByRole('button', { name: 'Near me' });
    await near.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#picker .pk-note')).toHaveText(NEAR_DENIED);
    await expect(near).toBeFocused();
  });

  test('far from every location says so, and leaves the lists', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 0, longitude: 0 });
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    await page.getByRole('button', { name: 'Near me' }).click();
    await expect(page.locator('#picker .pk-note')).toHaveText('No locations within 100 km of you. Search by name.');
    await expect(page.locator('#picker .pk-note')).toHaveAttribute('role', 'status');
    await expect(page.locator('#picker .pk-found')).toHaveText('');
    await expect(page.locator('#picker .pk-rest')).toBeVisible();
    await page.locator('#picker .pk-q').fill('lak');
    await expect(page.locator('#picker .pk-note')).toBeHidden();
  });

  test('with the permission denied shows the help line at once and never asks the browser for a position', async ({ page }) => {
    await stubGeo(page, 'denied');
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    expect(await geoCalls(page)).toEqual([]);
    await page.getByRole('button', { name: 'Near me' }).click();
    await expect(page.locator('#picker .pk-note')).toHaveText(NEAR_DENIED);
    expect(await geoCalls(page), 'getCurrentPosition is never called').toEqual([]);
    await expect(page.locator('#picker .pk-near button')).toBeEnabled();
    await expect(page.locator('#picker .pk-rest')).toBeVisible();
    await page.getByRole('button', { name: 'Near me' }).click();
    await expect(page.locator('#picker .pk-note')).toHaveText(NEAR_DENIED);
    expect(await geoCalls(page)).toEqual([]);
  });

  test('a refusal at the prompt gives the same help line', async ({ page }) => {
    await stubGeo(page, 'refused');
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    await page.getByRole('button', { name: 'Near me' }).click();
    await expect(page.locator('#picker .pk-note')).toHaveText(NEAR_DENIED);
    expect(await geoCalls(page)).toHaveLength(1);
  });

  test('a timeout says it could not find the position, and the next tap tries again', async ({ page }) => {
    await stubGeo(page, 'timeout');
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    await page.getByRole('button', { name: 'Near me' }).click();
    await expect(page.locator('#picker .pk-note')).toHaveText(NEAR_LOST);
    await expect(page.locator('#picker .pk-near button')).toBeEnabled();
    await expect(page.locator('#picker .pk-near button')).toHaveText('Near me');
    await page.getByRole('button', { name: 'Near me' }).click();
    await expect.poll(async () => (await geoCalls(page)).length).toBe(2);
    await expect(page.locator('#picker .pk-note')).toHaveText(NEAR_LOST);
  });

  test('while it waits the button says "Finding you" and is disabled, and a second tap asks nothing more', async ({ page }) => {
    await stubGeo(page, 'hold');
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    await page.getByRole('button', { name: 'Near me' }).click();
    const wait = page.locator('#picker .pk-near button');
    await expect(wait).toHaveText('Finding you');
    await expect(wait).toBeDisabled();
    await geoAsked(page);
    await wait.click({ force: true }).catch(() => {});
    expect(await geoCalls(page)).toHaveLength(1);
    await page.evaluate(([lat, lon]) => window.__geo.later[0].ok({ coords: { latitude: lat, longitude: lon } }), [42.96, -72.52]);
    await expect(page.locator('#picker .pk-found h3')).toHaveText('Near you');
    await expect(wait).toHaveText('Near me');
    await expect(wait).toBeEnabled();
  });

  test('a position that arrives after the sheet closed breaks nothing, and the next sheet starts clean', async ({ page }) => {
    await stubGeo(page, 'hold');
    const bad = watchConsole(page);
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    await page.getByRole('button', { name: 'Near me' }).click();
    await geoAsked(page);
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__geo.later[0].ok({ coords: { latitude: 42.96, longitude: -72.52 } }));
    await page.locator('#locBtn').click();
    await expect(page.locator('#picker .pk-found')).toHaveText('');
    await expect(page.locator('#picker .pk-near button')).toHaveText('Near me');
    expect(bad).toEqual([]);
  });

  test('a position that arrives after the viewer has typed does not take the box away from them', async ({ page }) => {
    await stubGeo(page, 'hold');
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    await page.getByRole('button', { name: 'Near me' }).click();
    await geoAsked(page);
    await page.locator('#picker .pk-q').fill('lak');
    await page.evaluate(() => window.__geo.later[0].ok({ coords: { latitude: 42.96, longitude: -72.52 } }));
    await expect(page.locator('#picker .pk-near button')).toHaveText('Near me');
    await expect(page.locator('#picker .pk-q'), 'focus stays in the box the viewer is typing in').toBeFocused();
    await expect(page.locator('#picker .pk-q')).toHaveValue('lak');
    await expect(page.locator('#picker .pk-found .pk-name')).toHaveText(['Lake Carnegie', 'Lake Natoma', 'Lake Quinsigamond']);
    await expect(page.locator('#picker .pk-found h3')).toHaveCount(0);
    await expect(page.locator('#picker .pk-say')).toHaveText('');
  });

  // Typing starts the pause before a town search, and the tap lands inside it. The search is asked for when the
  // pause ends, and that must not take the tap's answer with it.
  test('a tap made inside the pause after typing still gets its answer when the pause ends', async ({ page }) => {
    await stubGeo(page, 'hold');
    const asks = townAsks(page);
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    await page.locator('#picker .pk-q').fill('lak');
    await page.getByRole('button', { name: 'Near me' }).click();
    await geoAsked(page);
    await expect.poll(() => asks.names, 'the pause ended and the town search went out').toEqual(['lak']);
    await page.evaluate(() => window.__geo.later[0].ok({ coords: { latitude: 42.96, longitude: -72.52 } }));
    await expect(page.locator('#picker .pk-found h3')).toHaveText('Near you');
    await expect(page.locator('#picker .pk-found .pk-name')).toHaveText(['Putney Landing', 'Hanover boathouse', 'Lake Quinsigamond']);
  });
});

test.describe('the town search', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
    await serve(page, { index: INDEX, ...FILES });
  });

  const open = async page => {
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    return page.locator('#picker .pk-q');
  };

  test('lists up to 5 places as "<name>, <admin1>, <country>" under the matches, and the matches stay', async ({ page }) => {
    const q = await open(page);
    await q.fill('worcester');
    await expect(page.locator('#picker .pk-places h3')).toHaveText('Places');
    await expect(page.locator('#picker .pk-place')).toHaveText([
      'Worcester, Massachusetts, United States', 'Worcester, Western Cape, South Africa', 'Worcester, England, United Kingdom',
      'Barry, Illinois, United States', 'Worcester, New York, United States'
    ]);
    await expect(page.locator('#picker .pk-found .pk-name')).toHaveText(['Lake Quinsigamond']);
    // Places come after the matches on the page, and a place is a button, not a row.
    const order = await page.locator('#picker .pk-found, #picker .pk-places').evaluateAll(els => els.map(el => el.className));
    expect(order).toEqual(['pk-found', 'pk-places']);
    await expect(page.locator('#picker .pk-place').first()).toHaveJSProperty('tagName', 'BUTTON');
    await expect(page.locator('#picker .pk-places .pk-row')).toHaveCount(0);
    await expect(page.locator('#picker .pk-found .pk-row')).toHaveCount(1);
  });

  test('choosing a place lists the locations within 50 km of it, nearest first, with no distance, and says how many', async ({ page }) => {
    const q = await open(page);
    await q.fill('worcester');
    await page.getByRole('button', { name: 'Worcester, Massachusetts, United States' }).click();
    await expect(page.locator('#picker .pk-found h3')).toHaveText('Near Worcester, Massachusetts');
    await expect(page.locator('#picker .pk-found .pk-name')).toHaveText(['Lake Quinsigamond']);
    await expect(page.locator('#picker .pk-found .pk-dist')).toHaveCount(0);
    await expect(page.locator('#picker .pk-say')).toHaveText('1 location near Worcester, Massachusetts.');
    // The places stay, so another can be chosen: one with no location near it says so.
    await page.getByRole('button', { name: 'Worcester, Western Cape, South Africa' }).click();
    await expect(page.locator('#picker .pk-found')).toHaveText('No locations within 50 km of Worcester, Western Cape.');
    await expect(page.locator('#picker .pk-found h3')).toHaveCount(0);
    await expect(page.locator('#picker .pk-say')).toHaveText('No locations within 50 km of Worcester, Western Cape.');
    // A location chosen from the first answer opens, as any row does.
    await page.getByRole('button', { name: 'Worcester, Massachusetts, United States' }).click();
    await page.locator('#picker .pk-found .pk-row').click();
    await expect(page.locator('#locName')).toHaveText('Lake Quinsigamond');
  });

  test('with no location near any of the places, says so, and then that a town is the way on', async ({ page }) => {
    await serve(page, { index: { v: 1, locations: INDEX.locations.filter(l => ['putney-landing', 'hanover-boathouse'].includes(l.slug)) } });
    const q = await open(page);
    await q.fill('worcester');
    await expect(page.locator('#picker .pk-place')).toHaveCount(5);
    await expect(page.locator('#picker .pk-found')).toHaveText('No locations match "worcester". Pick a town to see locations near it.');
    await page.getByRole('button', { name: 'Worcester, Massachusetts, United States' }).click();
    await expect(page.locator('#picker .pk-found')).toHaveText('No locations within 50 km of Worcester, Massachusetts.');
  });

  test('with no location near the place, offers to suggest one when the form is configured, and opens it', async ({ page }) => {
    await page.route('**/api/suggest', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, siteKey: 'test-key' }) }));
    const q = await open(page);
    await q.fill('worcester');
    await page.getByRole('button', { name: 'Worcester, Western Cape, South Africa' }).click();
    await expect(page.locator('#picker .pk-found')).toHaveText('No locations within 50 km of Worcester, Western Cape.');
    await expect(page.locator('#picker .pk-sug button')).toBeVisible();
    await expect(page.locator('#picker .pk-sug button')).toHaveText('Suggest a location');
    await page.locator('#picker .pk-sug button').click();
    await expect(page.locator('#suggest')).toBeVisible();
  });

  test('with no match anywhere, says it is looking for towns until the answer, then that nothing matches', async ({ page }) => {
    let release;
    const gate = new Promise(done => { release = done; });
    await page.route(GEOCODE, async route => { await gate; await route.fallback(); });
    const q = await open(page);
    await q.fill('zzqxj');
    await expect(page.locator('#picker .pk-found')).toHaveText('No locations match "zzqxj". Looking for towns.');
    await page.waitForTimeout(500); // past the pause: the request is out and held
    await expect(page.locator('#picker .pk-found')).toHaveText('No locations match "zzqxj". Looking for towns.');
    release();
    await expect(page.locator('#picker .pk-found')).toHaveText('Nothing matches "zzqxj". Check the spelling, or search for a town.');
    await expect(page.locator('#picker .pk-places')).toHaveText('');
  });

  test('fails with a line that leaves the names working: a refused connection, and an answer that is not ok', async ({ page }) => {
    const q = await open(page);
    await page.route(GEOCODE, route => route.abort('failed'));
    await q.fill('worcester');
    await expect(page.locator('#picker .pk-places')).toHaveText(TOWN_FAIL);
    await expect(page.locator('#picker .pk-found .pk-name')).toHaveText(['Lake Quinsigamond']);
    await page.unroute(GEOCODE);
    await page.route(GEOCODE, route => route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":true,"reason":"Daily API request limit exceeded."}' }));
    await q.fill('worcestr');
    await expect(page.locator('#picker .pk-places')).toHaveText(TOWN_FAIL);
    await expect(page.locator('#picker .pk-found')).toHaveText('Nothing matches "worcestr". Check the spelling, or search for a town.');
    // Enter asks again, and a good answer replaces the failure.
    await page.unroute(GEOCODE);
    await q.fill('worcester');
    await q.press('Enter');
    await expect(page.locator('#picker .pk-place').first()).toBeVisible();
    await expect(page.locator('#picker .pk-places')).not.toContainText('not available');
  });

  test('escapes what the host sends', async ({ page }) => {
    await page.route(GEOCODE, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ name: '<img src=x onerror=window.pwned=1>Bay', admin1: '<b>Evil</b> & Co', country: 'Land', latitude: 1, longitude: 2 }] }) }));
    const q = await open(page);
    await q.fill('bay');
    await expect(page.locator('#picker .pk-place')).toHaveText('<img src=x onerror=window.pwned=1>Bay, <b>Evil</b> & Co, Land');
    await expect(page.locator('#picker .pk-places img, #picker .pk-places b')).toHaveCount(0);
    expect(await page.evaluate(() => window.pwned)).toBeUndefined();
    await page.locator('#picker .pk-place').click();
    await expect(page.locator('#picker .pk-found')).toHaveText('No locations within 50 km of <img src=x onerror=window.pwned=1>Bay, <b>Evil</b> & Co.');
  });

  test('drops an answer for text that has changed since', async ({ page }) => {
    const held = [];
    await page.route(GEOCODE, async route => { held.push(route); });
    const asks = townAsks(page);
    const q = await open(page);
    await q.fill('worcester');
    await q.press('Enter');
    await expect.poll(() => asks.names).toEqual(['worcester']);
    await q.fill('putney');
    await held[0].fallback();
    await page.waitForTimeout(300);
    await expect(page.locator('#picker .pk-places')).toHaveText('');
    await expect(page.locator('#picker .pk-found .pk-name')).toHaveText(['Putney Landing']);
  });

  test('writes the typed text as text in the lines about towns', async ({ page }) => {
    let release;
    const gate = new Promise(done => { release = done; });
    await page.route(GEOCODE, async route => {
      await gate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [{ name: 'Elsewhere', admin1: 'Nowhere', country: 'Land', latitude: 1, longitude: 2 }] }) });
    });
    const q = await open(page);
    await q.fill('<i id=typed>zz</i>');
    await expect(page.locator('#picker .pk-found')).toHaveText('No locations match "<i id=typed>zz</i>". Looking for towns.');
    await expect(page.locator('#typed')).toHaveCount(0);
    release();
    await expect(page.locator('#picker .pk-found')).toHaveText('No locations match "<i id=typed>zz</i>". Pick a town to see locations near it.');
    await expect(page.locator('#typed')).toHaveCount(0);
  });

  test('is not asked for the address under a missing page, until the viewer presses Enter or types', async ({ page }) => {
    const asks = townAsks(page);
    await page.goto('/lake-nowhere');
    const q = page.locator('#notFound .pk-q');
    await expect(q).toHaveValue('lake nowhere');
    await page.waitForTimeout(700);
    expect(asks.names, 'the words of the address are a guess, and go nowhere').toEqual([]);
    await expect(page.locator('#notFound .pk-found')).toContainText('Nothing matches "lake nowhere". Check the spelling, or search for a town.');
    await q.press('Enter');
    await expect.poll(() => asks.names).toEqual(['lake nowhere']);
    await expect(page.locator('#notFound .pk-found')).toContainText('Nothing matches "lake nowhere"');
  });

  // Near me is a separate question from the towns. A refusal ends it and says so, and the town search that was
  // already out is still wanted: its answer must not be dropped, leaving "Looking for towns." up for good.
  test('a town answer that is out when Near me is tapped and refused still arrives', async ({ page }) => {
    let release;
    const gate = new Promise(done => { release = done; });
    await page.route(GEOCODE, async route => { await gate; await route.fallback(); });
    await stubGeo(page, 'denied');
    const asks = townAsks(page);
    const q = await open(page);
    await q.fill('worcester');
    await expect.poll(() => asks.names).toEqual(['worcester']);
    await page.getByRole('button', { name: 'Near me' }).click();
    await expect(page.locator('#picker .pk-note')).toHaveText(NEAR_DENIED);
    release();
    await expect(page.locator('#picker .pk-place').first()).toBeVisible();
    await expect(page.locator('#picker .pk-found')).not.toContainText('Looking for towns');
    await expect(page.locator('#picker .pk-note')).toHaveText(NEAR_DENIED);
  });
});

// The page's clock stands still here, so these tests move it by hand.
test.describe('the town search with the clock held', () => {
  test.beforeEach(async ({ page }) => {
    await routeAll(page, scenario, clock);
    await serve(page, { index: INDEX, ...FILES });
  });

  // Each key starts the pause again. With the clock held, a slow machine cannot end a pause between two keys.
  test('waits for a pause in the typing, then asks once with the whole text', async ({ page }) => {
    const asks = townAsks(page);
    await stillClock(page);
    await page.locator('#locBtn').click();
    const q = page.locator('#picker .pk-q');
    for (const key of 'worcester') {
      await q.press(key);
      await page.clock.runFor(250); // well inside the pause
    }
    await settle(page);
    expect(asks.names, 'nothing while the keys are still coming').toEqual([]);
    await page.clock.runFor(49);
    await settle(page);
    expect(asks.names, '299 ms after the last key is not a pause yet').toEqual([]);
    await page.clock.runFor(1);
    await expect.poll(() => asks.names).toEqual(['worcester']);
    await page.clock.runFor(2000);
    await settle(page);
    expect(asks.names).toEqual(['worcester']);
  });

  test('asks at the end of the pause, not before, and an Enter asks at once and cancels the pause', async ({ page }) => {
    const asks = townAsks(page);
    await stillClock(page);
    await page.locator('#locBtn').click();
    const q = page.locator('#picker .pk-q');
    await q.fill('worcester');
    await page.clock.runFor(299);
    expect(asks.names, '299 ms is not a pause yet').toEqual([]);
    await page.clock.runFor(1);
    await expect.poll(() => asks.names).toEqual(['worcester']);
    await page.clock.runFor(300); // the wait between two asks is over
    await q.fill('putney');
    await q.press('Enter');
    await expect.poll(() => asks.names.length).toBe(2);
    expect(asks.names[1], 'asked at once, with no time passed').toBe('putney');
    await page.clock.runFor(2000);
    await settle(page);
    expect(asks.names, 'the pause that Enter cancelled asks nothing more').toEqual(['worcester', 'putney']);
  });

  test('asks at most once per 300 ms: a second Enter within the wait asks when it ends', async ({ page }) => {
    const asks = townAsks(page);
    await stillClock(page);
    await page.locator('#locBtn').click();
    const q = page.locator('#picker .pk-q');
    await q.fill('wor');
    await q.press('Enter');
    await expect.poll(() => asks.names).toEqual(['wor']);
    await q.fill('worc');
    await q.press('Enter');
    await page.waitForTimeout(400); // real time passes, the page's does not
    expect(asks.names, 'held back').toEqual(['wor']);
    await page.clock.runFor(299);
    expect(asks.names).toEqual(['wor']);
    await page.clock.runFor(1);
    await expect.poll(() => asks.names).toEqual(['wor', 'worc']);
    // Only the last of several is asked, and Enter twice for the same text asks once.
    await q.fill('worce');
    await q.press('Enter');
    await q.fill('worces');
    await q.press('Enter');
    await q.press('Enter');
    await page.clock.runFor(1000);
    await expect.poll(() => asks.names).toEqual(['wor', 'worc', 'worces']);
  });

  test('an ask held back by the wait is dropped when the sheet closes first', async ({ page }) => {
    const asks = townAsks(page);
    await stillClock(page);
    await page.locator('#locBtn').click();
    const q = page.locator('#picker .pk-q');
    await q.fill('wor');
    await q.press('Enter');
    await expect.poll(() => asks.names).toEqual(['wor']);
    await q.fill('worc');
    await q.press('Enter'); // held back: the last ask was under 300 ms ago
    await page.locator('#picker .pk-x').click();
    await page.clock.runFor(2000);
    await settle(page);
    expect(asks.names).toEqual(['wor']);
  });

  test('is not asked when the sheet closes first, or when a row is chosen', async ({ page }) => {
    const asks = townAsks(page);
    await stillClock(page);
    await page.locator('#locBtn').click();
    const q = page.locator('#picker .pk-q');
    await q.fill('worcester');
    await page.locator('#picker .pk-x').click(); // Escape in a search box clears it first
    await page.clock.runFor(2000);
    await page.locator('#locBtn').click();
    await page.locator('#picker .pk-q').fill('lake natoma');
    await page.locator('#picker .pk-found .pk-row').click();
    await page.clock.runFor(2000);
    await settle(page);
    expect(asks.names).toEqual([]);
  });

  // The answer replaces the box, so the pause that was running for the text in it is over: the town search must
  // not go out afterwards for words that are no longer there.
  test('is not asked for text that a Near me answer has taken out of the box', async ({ page }) => {
    const asks = townAsks(page);
    await stubGeo(page, 'hold');
    await stillClock(page);
    await page.locator('#locBtn').click();
    await page.locator('#picker .pk-q').fill('worcester');
    await page.getByRole('button', { name: 'Near me' }).click();
    await geoAsked(page);
    await page.evaluate(() => window.__geo.later[0].ok({ coords: { latitude: 42.96, longitude: -72.52 } }));
    await expect(page.locator('#picker .pk-found h3')).toHaveText('Near you');
    await expect(page.locator('#picker .pk-q')).toHaveValue('');
    await page.clock.runFor(2000);
    await settle(page);
    expect(asks.names, 'the pause ended after the box was cleared').toEqual([]);
  });

  // No row is chosen and nothing is closed: the address changes under the page (Back, a link). What is held for
  // the picker page is dropped because the page is no longer there.
  test('on the picker page, an ask held back by the wait is dropped when the page moves on', async ({ page }) => {
    const asks = townAsks(page);
    await page.clock.install({ time: AFTER });
    await page.goto('/');
    const q = page.locator('#notFound .pk-q');
    await expect(q).toBeVisible();
    await page.clock.pauseAt(AFTER + 60e3);
    await q.fill('wor');
    await q.press('Enter');
    await expect.poll(() => asks.names).toEqual(['wor']);
    await q.fill('worc');
    await q.press('Enter'); // held back: the last ask was under 300 ms ago
    await page.evaluate(() => { history.pushState(null, '', '/putney-landing'); dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.locator('#locName')).toHaveText('Putney Landing');
    await page.clock.runFor(2000);
    await settle(page);
    expect(asks.names).toEqual(['wor']);
  });
});

// The line for a connection lost after the page loaded. Offline from the start is the offline describe's.
test.describe('the hero with nothing saved', () => {
  test('Refresh after the connection is lost says there is no forecast saved, and online it did not', async ({ page, context }) => {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock, { abort: true });
    await page.goto('/putney-landing');
    await ready(page);
    await expect(page.locator('#verdict')).toHaveText('No data.');
    await expect(page.locator('#why')).toContainText('Every data source was blocked');
    await context.setOffline(true);
    await page.locator('#refreshBtn').click();
    await expect(page.locator('#why')).toHaveText('No forecast saved for this location on this phone yet. Connect to load it.');
    await context.setOffline(false);
    await page.locator('#refreshBtn').click();
    await expect(page.locator('#why')).toContainText('Every data source was blocked');
  });
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });

  // After one online visit the worker holds the shell, the picker chunk and the record files. Everything
  // the page asks for from then on is answered by it, or fails as a network request does.
  async function online(page) {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
    await page.goto('/putney-landing');
    await ready(page);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  }
  async function goOffline(page, context) {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await context.setOffline(true);
    await page.reload();
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  }

  test('the picker still opens from the precache, finds Putney, and says the town search is not available', async ({ page, context }) => {
    const requests = asks(page);
    const crashed = [];
    page.on('pageerror', e => crashed.push(e.message));
    await online(page);
    expect(requests.filter(p => /\/picker-/.test(p)), 'the chunk was not read online: it comes from the precache').toEqual([]);
    await goOffline(page, context);
    await ready(page);
    await page.locator('#locBtn').click();
    await expect(page.locator('#picker .pk-q')).toBeVisible();
    await expect(page.locator('#picker .pk-here')).toHaveText('Showing now');
    // The list is the built one, so it grows as locations are added: say what must be there, not all that is.
    await expect(page.locator('#picker .pk-group', { hasText: 'Vermont' })).toHaveCount(1);
    const q = page.locator('#picker .pk-q');
    await q.fill('put');
    await expect(page.locator('#picker .pk-found .pk-name')).toHaveText(['Putney Landing']);
    await expect(page.locator('#picker .pk-places')).toHaveText(TOWN_FAIL);
    await q.fill('zzzz');
    await expect(page.locator('#picker .pk-found')).toContainText('Nothing matches "zzzz"');
    // Near me needs no connection.
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation(DOCK);
    await page.getByRole('button', { name: 'Near me' }).click();
    await expect(page.locator('#picker .pk-found h3')).toHaveText('Near you');
    await expect(page.locator('#picker .pk-found .pk-name').first()).toHaveText('Putney Landing');
    await expect(page.locator('#picker .pk-found .pk-dist').first()).toHaveText('0.1 mi');
    expect(crashed).toEqual([]);
  });

  test('a location with no saved forecast shows its header and tabs from the precached record, and the hero says it has none', async ({ page, context }) => {
    const crashed = [];
    page.on('pageerror', e => crashed.push(e.message));
    await online(page);
    // Forget what this phone saved for Putney: its forecast and its record, not where it was left.
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^rowhether-(cache|loc)-v\d+:putney-landing$/.test(k)) localStorage.removeItem(k); });
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => /putney-landing/.test(k)))).toEqual([]);
    await goOffline(page, context);
    await ready(page);
    await expect(page.locator('#locName')).toHaveText('Putney Landing');
    await expect(page.locator('#sub')).toContainText('Connecticut River at the Putney Rowing Club docks');
    await expect(page.locator('#tabs a')).toHaveText(['Now', 'Week', 'Wind', 'River', 'Storms', 'Fog', 'Temperature', 'Rain', 'Light', 'Air']);
    await expect(page.locator('#verdict')).toHaveText('No data.');
    await expect(page.locator('#why')).toHaveText('No forecast saved for this location on this phone yet. Connect to load it.');
    await expect(page.locator('#updated')).toHaveText('Not loaded');
    // The record was read from the precache and saved again.
    expect(await page.evaluate(() => localStorage.getItem('rowhether-loc-v1:putney-landing') !== null)).toBe(true);
    // Back on the network, Refresh loads it.
    await context.setOffline(false);
    await routeAll(page, scenario, clock);
    await page.locator('#refreshBtn').click();
    await expect(page.locator('#verdict')).toHaveText('Go.');
    expect(crashed).toEqual([]);
  });

  test('a saved forecast is still shown offline, with no line about a missing one', async ({ page, context }) => {
    await online(page);
    await goOffline(page, context);
    await ready(page);
    await expect(page.locator('#verdict')).toHaveText('Go.');
    await expect(page.locator('#why')).not.toContainText('No forecast saved');
    await expect(page.locator('#updated')).toHaveText(/^Saved /);
  });
});
