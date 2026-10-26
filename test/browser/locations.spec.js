// The curated locations, one at a time (phase 1 plan P1.12; 07 13, 01 16.5). Every location in
// the built list opens from its own address with the june-calm scenario at noon, and the fixtures
// answer whichever gauge, station and forecast point it asks for (fixtures.js). A location added
// to data/ with no entry in PLACES fails the first check, so it cannot join the list unchecked.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { SCENARIOS, routeAll, ready, tabDrawn, hold } from './fixtures.js';

// A device in the zone of these locations: no "ahead of you" line, and every time is local.
test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

const scenario = SCENARIOS['june-calm'];
const clock = scenario.clock(12);
const BUILT = JSON.parse(readFileSync(new URL('../../dist/locations/index.json', import.meta.url), 'utf8')).locations;
const RIVER_TABS = ['Now', 'Week', 'Wind', 'River', 'Storms', 'Fog', 'Temperature', 'Rain', 'Light', 'Air'];
// Still water has no River tab (01 9.7).
const LAKE_TABS = RIVER_TABS.filter(t => t !== 'River');
// Tidal water has the Tide tab after Wind (01 9.7).
const TIDAL_TABS = ['Now', 'Week', 'Wind', 'Tide', ...RIVER_TABS.slice(3)];

// What each location shows (plan 4.1). `station`, `gauge` and `lid` are the ids its requests carry
// (a lake has no `lid`, and only Natoma has a `gauge`, for its water temperature; `tide` is the point of
// a tidal place's tide forecast), `obs` is the name
// its observation goes by, `flow` is whether it has a River flow fact, and `credits` are the links
// under the footer's first sentence (Putney's are in picker.spec.js).
const PLACES = {
  'putney-landing': {
    name: 'Putney Landing', sub: 'Connecticut River at the Putney Rowing Club docks. All times Eastern.', badge: false,
    tabs: RIVER_TABS, flow: true, obs: 'Keene', station: 'KEEN', gauge: 'USGS-01154500', lid: 'WLPN3'
  },
  'hanover-boathouse': {
    name: 'Hanover boathouse', sub: 'Connecticut River at the Hanover boathouse, above Wilder Dam. All times Eastern.', badge: true,
    tabs: RIVER_TABS, flow: true, obs: 'Lebanon', station: 'KLEB', gauge: 'USGS-01144500', lid: 'WLBN3',
    credits: [
      ['Open-Meteo', 'https://open-meteo.com/'],
      ['Burlington', 'https://www.weather.gov/btv/'],
      ['Gray', 'https://www.weather.gov/gyx/'],
      ['01144500 at West Lebanon', 'https://waterdata.usgs.gov/monitoring-location/USGS-01144500/'],
      ['NWS Northeast River Forecast Center', 'https://water.noaa.gov/gauges/wlbn3']
    ]
  },
  'boathouse-row': {
    name: 'Boathouse Row', sub: 'Schuylkill River at Boathouse Row, above Fairmount Dam. All times Eastern.', badge: true,
    tabs: RIVER_TABS, flow: true, obs: 'Philadelphia', station: 'KPHL', gauge: 'USGS-01474500', lid: 'PADP1',
    credits: [
      ['Open-Meteo', 'https://open-meteo.com/'],
      ['National Weather Service, Mount Holly', 'https://www.weather.gov/phi/'],
      ['01474500 at Philadelphia', 'https://waterdata.usgs.gov/monitoring-location/USGS-01474500/'],
      ['NWS Middle Atlantic River Forecast Center', 'https://water.noaa.gov/gauges/padp1']
    ]
  },
  'thompson-boat-center': {
    name: 'Thompson Boat Center', sub: 'Tidal Potomac River at Georgetown. All times Eastern.', badge: true,
    tabs: TIDAL_TABS, flow: true, obs: 'Reagan National', station: 'KDCA', gauge: 'USGS-01646500', lid: 'BRKM2', tide: 'GTND2',
    credits: [
      ['Open-Meteo', 'https://open-meteo.com/'],
      ['National Weather Service, Baltimore/Washington', 'https://www.weather.gov/lwx/'],
      ['01646500 at Little Falls', 'https://waterdata.usgs.gov/monitoring-location/USGS-01646500/'],
      ['NWS Middle Atlantic River Forecast Center', 'https://water.noaa.gov/gauges/gtnd2']
    ]
  },
  'lake-quinsigamond': {
    name: 'Lake Quinsigamond', sub: 'Lake Quinsigamond at the Donahue Rowing Center. All times Eastern.', badge: true,
    tabs: LAKE_TABS, flow: false, obs: 'Worcester', station: 'KORH',
    credits: [['Open-Meteo', 'https://open-meteo.com/'], ['National Weather Service, Boston', 'https://www.weather.gov/box/']]
  },
  'lake-natoma': {
    name: 'Lake Natoma', sub: 'Lake Natoma above Nimbus Dam. Releases from Folsom Dam can change the current. All times Pacific, 3 hours behind you.', badge: true,
    tabs: LAKE_TABS, flow: false, obs: 'Mather', station: 'KMHR', gauge: 'USGS-11446500',
    credits: [
      ['Open-Meteo', 'https://open-meteo.com/'],
      ['National Weather Service, Sacramento', 'https://www.weather.gov/sto/'],
      ['11446500 at Fair Oaks', 'https://waterdata.usgs.gov/monitoring-location/USGS-11446500/']
    ]
  },
  'lake-carnegie': {
    name: 'Lake Carnegie', sub: 'Lake Carnegie at the Shea Rowing Center. All times Eastern.', badge: true,
    tabs: LAKE_TABS, flow: false, obs: 'Trenton', station: 'KTTN',
    credits: [['Open-Meteo', 'https://open-meteo.com/'], ['National Weather Service, Mount Holly', 'https://www.weather.gov/phi/']]
  }
};

// The console must be empty. The 404s for /api/info and /api/suggest are what a static host
// answers, and Playwright says it blocked the service worker (playwright.config.js).
function watchConsole(page) {
  const bad = [];
  page.on('pageerror', e => bad.push(`pageerror: ${e.message}`));
  page.on('console', m => {
    if (!['error', 'warning'].includes(m.type()) || m.text() === 'Service Worker registration blocked by Playwright') return;
    const { url = '' } = m.location();
    if (/Failed to load resource.*404/.test(m.text()) && /\/api\/(info|suggest)$/.test(url)) return;
    bad.push(`${m.type()}: ${m.text()} (${url})`);
  });
  return bad;
}
// A fact in On the water now, found by its label.
const fact = (page, label) => page.locator('#facts .fact').filter({ has: page.locator('dt', { hasText: new RegExp(`^\\s*${label}\\s*$`) }) });
const stored = (page, key) => page.evaluate(k => localStorage.getItem(k), key);
const creditLinks = page => page.locator('#credits a').evaluateAll(as => as.map(a => [a.textContent, a.getAttribute('href')]));

test('the list the build wrote is the list checked here', () => {
  expect(BUILT.map(l => l.slug).sort()).toEqual(Object.keys(PLACES).sort());
});

for (const [slug, p] of Object.entries(PLACES)) {
  test.describe(slug, () => {
    let seen;
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(clock);
      seen = await routeAll(page, scenario, clock);
    });

    test('opens at its own address with a clean console, every request answered and its own ids asked for', async ({ page }) => {
      const bad = watchConsole(page);
      await page.goto(`/${slug}`);
      await ready(page);
      await expect(page.locator('#verdict')).toHaveText(/^(Go|Caution|Stay off)\.$/);
      expect(new URL(page.url()).pathname).toBe(`/${slug}`);
      expect(bad).toEqual([]);
      expect(seen.aborted).toEqual([]);
      expect(seen.missing).toEqual([]);
      expect(seen.served, 'its own station').toContain(`https://api.weather.gov/stations/${p.station}/observations/latest`);
      // A river asks for its forecast point and its gauge's three answers (the latest reading, the 48 hour series
      // and the daily means). Still water asks for neither, and a lake with a water temperature gauge asks for its latest reading alone.
      // Only the points its record names: the river forecast point, and for a tidal place the tide point (P1.14).
      const points = seen.served.filter(u => new URL(u).hostname === 'api.water.noaa.gov').map(u => u.match(/^https:\/\/api\.water\.noaa\.gov\/nwps\/v1\/gauges\/([A-Z0-9]+)\/stageflow\/forecast$/)?.[1]);
      expect(points.slice().sort(), 'its own forecast points, and no other').toEqual([p.lid, p.tide].filter(Boolean).sort());
      const usgs = seen.served.filter(u => new URL(u).hostname === 'api.waterdata.usgs.gov');
      expect(usgs).toHaveLength(p.flow ? 3 : p.gauge ? 1 : 0);
      for (const u of usgs) expect(u, 'its own gauge').toMatch(new RegExp(`monitoring_location_id=${p.gauge}[&,]`));
    });

    test('names itself: the title, the name, the line under it and the badge', async ({ page }) => {
      await page.goto(`/${slug}`);
      await ready(page);
      await expect(page).toHaveTitle(`${p.name} rowing conditions`);
      await expect(page.locator('#locName')).toHaveText(p.name);
      await expect(page.locator('#sub')).toHaveText(p.sub);
      await expect(page.locator('#locBadges')).toBeVisible({ visible: p.badge });
      if (p.badge) await expect(page.locator('#locBadges .badge')).toHaveText('Not confirmed on site');
    });

    if (p.credits) test('credits the offices, the gauge and the river forecast it reads, each with a link', async ({ page }) => {
      await page.goto(`/${slug}`);
      await ready(page);
      expect(await creditLinks(page)).toEqual(p.credits);
      expect(await page.locator('#credits').textContent()).not.toMatch(/[\[\]]|https?:/);
    });

    test('has the tabs its water has, and no others', async ({ page }) => {
      await page.goto(`/${slug}`);
      await ready(page);
      await expect(page.locator('#tabs a')).toHaveText(p.tabs);
    });

    test('draws every tab inside the width of the page', async ({ page }, testInfo) => {
      const widths = [...new Set([testInfo.project.use.viewport.width, 360])];
      for (const width of widths) {
        await page.setViewportSize({ width, height: 844 });
        for (const tab of p.tabs.map(t => t.toLowerCase())) {
          await page.goto(tab === 'now' ? `/${slug}` : `/${slug}#${tab}`);
          await ready(page);
          if (tab !== 'now') await tabDrawn(page, tab);
          const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(over, `${slug} ${tab} at ${width} px overflows by ${over} px`).toBeLessThanOrEqual(0);
        }
      }
    });

    test('shows River flow only where it has a flow binding', async ({ page }) => {
      await page.goto(`/${slug}`);
      await ready(page);
      await expect(fact(page, 'River flow')).toHaveCount(p.flow ? 1 : 0);
      await expect(page.locator('#tabs a[data-tab="river"]')).toHaveCount(p.flow ? 1 : 0);
    });

    test('names only the source that did not answer, under the hero, and keeps the verdict', async ({ page }) => {
      await page.route('https://api.weather.gov/stations/*/observations/latest', route => route.abort('failed'));
      await page.goto(`/${slug}`);
      await ready(page);
      await expect(page.locator('#statusNote')).toHaveText(`Could not reach ${p.obs} observations. Showing the last data received where available.`);
      await expect(page.locator('#verdict')).toHaveText(/^(Go|Caution|Stay off)\.$/);
    });
  });
}

test.describe('hanover-boathouse', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
  });

  test('reads its flow at West Lebanon, has no water temperature to show, and labels the banks VT and NH', async ({ page }) => {
    await page.goto('/hanover-boathouse');
    await ready(page);
    await expect(page.locator('#tabs a[data-tab="river"]')).toHaveText('River');
    await expect(fact(page, 'River flow').locator('.val')).toContainText('cfs');
    await expect(fact(page, 'River flow').locator('.note')).toContainText('West Lebanon gauge below Wilder Dam');
    await expect(fact(page, 'Water').locator('.val')).toHaveText('--');
    await expect(fact(page, 'Water').locator('.note')).toHaveText('No water temperature here. Add a dock reading in Settings.');
    await expect(fact(page, 'Measured at Lebanon').locator('.note')).toContainText('Lebanon airport, 5 mi south.');
    await expect(page.locator('#compass .c-bank')).toHaveText(['VT', 'NH']);
    await expect(page.locator('#compassCap')).toContainText('upstream heading 40°');
    // The note under Wind is Putney's kind of sentence, from the heading of 40 degrees.
    await expect(fact(page, 'Wind').locator('.note')).toContainText('Tailwind rowing upstream, headwind coming back.');
  });
});

test.describe('boathouse-row', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
  });

  // The record stores no banks, so they are made from the heading of 330 degrees: the right
  // side faces 60 (northeast) and the left 240 (southwest).
  test('labels the banks NE and SW, and reads the water temperature from its flow gauge', async ({ page }) => {
    await routeAll(page, scenario, clock);
    await page.goto('/boathouse-row');
    await ready(page);
    await expect(page.locator('#compass .c-bank')).toHaveText(['SW', 'NE']);
    await expect(page.locator('#compassCap')).toContainText('upstream heading 330°');
    await expect(fact(page, 'Water').locator('.val')).toContainText('°');
    await expect(fact(page, 'Water').locator('.note')).toContainText('USGS gauge at Fairmount Dam, about 200 m downstream.');
    await expect(fact(page, 'River flow').locator('.note')).toContainText('USGS gauge at Fairmount Dam, just below Boathouse Row.');
  });

  test('says which bank a crosswind comes off, from the wind of the day and from the other side', async ({ page }) => {
    // The scenario's wind at noon is from the south-south-west (212 degrees): 118 degrees to the
    // left of the heading, so off the left bank.
    await routeAll(page, scenario, clock);
    await page.goto('/boathouse-row');
    await ready(page);
    await expect(fact(page, 'Wind').locator('.note')).toHaveText('From SSW. Crosswind off the southwest bank.');
    // From the north-east (45 degrees) it is 75 degrees to the right of the heading: off the right bank.
    await routeAll(page, scenario, clock, {
      edit: raw => {
        raw.wx.current.wind_direction_10m = 45;
        raw.wx.hourly.wind_direction_10m = raw.wx.hourly.wind_direction_10m.map(() => 45);
      }
    });
    await page.goto('/boathouse-row');
    await ready(page);
    await expect(fact(page, 'Wind').locator('.note')).toHaveText('From NE. Crosswind off the northeast bank.');
  });
});

// ---------- Still water (P1.13; 01 9.7, 10.5, 15.9) ----------
// A lake or a reservoir has no current: no River tab, no flow, and a compass that draws the lake.
const LAKES = ['lake-quinsigamond', 'lake-natoma', 'lake-carnegie'];

test.describe('still water', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
    await routeAll(page, scenario, clock);
  });

  test('has no River tab, and an address ending #river opens Now and takes the hash out of the address', async ({ page }) => {
    for (const slug of LAKES) {
      await page.goto(`/${slug}#river`);
      await ready(page);
      await expect(page.locator('#tabs a[data-tab="river"]'), slug).toHaveCount(0);
      await expect(page.locator('#tabs a[aria-current="page"]'), slug).toHaveText('Now');
      await expect(page.locator('#home'), slug).toBeVisible();
      await expect(page.locator('#detail'), slug).toBeHidden();
      const at = new URL(page.url());
      expect([at.pathname, at.hash], slug).toEqual([`/${slug}`, '']);
    }
  });

  test("Carnegie's compass draws the lake and the Wind fact says only the direction", async ({ page }) => {
    await page.goto('/lake-carnegie');
    await ready(page);
    const lake = page.locator('#compass ellipse.c-river');
    await expect(lake).toHaveCount(1);
    expect(await lake.evaluate(e => [e.getAttribute('rx'), e.getAttribute('ry'), e.getAttribute('transform')])).toEqual(['50', '6', 'rotate(-55)']);
    // No river bar, no flow arrow and no bank labels; the wind arrow is there.
    await expect(page.locator('#compass .c-bank, #compass .c-flow, #compass rect')).toHaveCount(0);
    await expect(page.locator('#compass .c-wind')).toHaveCount(1);
    await expect(page.locator('#compassCap')).toHaveText('Wind from SSW across about 1.9 mi of open water.');
    await expect(fact(page, 'Wind').locator('.note')).toHaveText('From SSW.');
    await expect(page.locator('#compass')).toHaveAttribute('aria-label', 'Wind direction relative to the lake');
  });

  test('draws the lake in the full forecast of an opened row, with no river words', async ({ page }) => {
    await page.goto('/lake-carnegie');
    await ready(page);
    const row = page.locator('#days details.period').first();
    await row.locator('summary').click();
    await row.locator('.forecast').waitFor();
    const svg = row.locator('.forecast svg[aria-label="Forecast wind direction relative to the lake"]');
    await expect(svg.locator('ellipse.c-river')).toHaveCount(1);
    await expect(svg.locator('.c-bank, .c-flow, rect')).toHaveCount(0);
    await expect(row.locator('.forecast figcaption')).toHaveText('Wind mostly from SSW across about 0.8 mi of open water.');
    await expect(row.locator('.forecast')).not.toContainText(/River runs|upstream heading|River flow/);
  });

  test('the Wind tab at Carnegie has no arrows and no Course column, and says why', async ({ page }) => {
    await page.goto('/lake-carnegie#wind');
    await ready(page);
    await tabDrawn(page, 'wind');
    const body = page.locator('#detailBody');
    await expect(body.locator('.carrow')).toHaveCount(0);
    await expect(body.locator('th', { hasText: 'Course' })).toHaveCount(0);
    await expect(body.locator('th', { hasText: 'Water' })).toHaveCount(1);
    await expect(body.locator('.how')).toContainText('Head and crosswind are not shown because no course is set here.');
    await expect(body).not.toContainText(/Headwind|Tailwind|upstream|NaN|undefined/);
  });

  test('the Wind tab at Quinsigamond, which has a heading, keeps its arrows and its Course column', async ({ page }) => {
    await page.goto('/lake-quinsigamond#wind');
    await ready(page);
    await tabDrawn(page, 'wind');
    const body = page.locator('#detailBody');
    expect(await body.locator('.carrow').count()).toBeGreaterThan(0);
    await expect(body.locator('th', { hasText: 'Course' })).toHaveCount(1);
    await expect(body.locator('.how')).toContainText('The course heading is 166°, set in Settings.');
    await expect(body).not.toContainText(/NaN|undefined/);
  });

  test('a heading course on a lake draws the course bar and shore labels, with no flow arrow and no river line', async ({ page }) => {
    await page.goto('/lake-quinsigamond');
    await ready(page);
    await expect(page.locator('#compass .c-bank')).toHaveText(['E', 'W']);
    await expect(page.locator('#compass rect.c-river')).toHaveCount(1);
    await expect(page.locator('#compass .c-flow, #compass ellipse')).toHaveCount(0);
    await expect(page.locator('#compassCap')).toHaveText(/^Wind from \w+ across about \d\.\d mi of open water\.$/);
    await expect(page.locator('#compassCap')).not.toContainText('River runs');
  });

  for (const [slug, what] of [['lake-carnegie', 'lake'], ['lake-quinsigamond', 'lake'], ['lake-natoma', 'reservoir']]) {
    test(`the Week view's opened day at ${slug} says "This is a ${what}. Flow is not checked."`, async ({ page }) => {
      await page.goto(`/${slug}#week`);
      await ready(page);
      await tabDrawn(page, 'week');
      const day = page.locator('#detailBody details.wday').first();
      await day.locator('summary').click();
      await expect(day.locator('.wmore')).toContainText(`This is a ${what}. Flow is not checked.`);
      await expect(day.locator('.wmore')).not.toContainText('No river gauge here');
    });
  }

  test('Natoma, for a viewer in Eastern time, says Pacific and shows every time in Pacific', async ({ page }) => {
    await page.goto('/lake-natoma');
    await ready(page);
    await expect(page.locator('#sub')).toHaveText('Lake Natoma above Nimbus Dam. Releases from Folsom Dam can change the current. All times Pacific, 3 hours behind you.');
    // The clock is noon in Eastern time and 9 AM at the lake.
    await expect(page.locator('#updated')).toHaveText('Updated 9 AM');
    // Sunrise and sunset are the lake's, in Pacific time: 8:41 AM to 11:32 PM would be the same instants in Eastern.
    await expect(fact(page, 'Daylight').locator('.val')).toHaveText('5:41 AM to 8:32 PM');
  });

  test('the town search for Worcester, on the real list, offers Lake Quinsigamond within 50 km', async ({ page }) => {
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    await page.locator('#picker .pk-q').fill('worcester');
    await page.getByRole('button', { name: 'Worcester, Massachusetts, United States' }).click();
    await expect(page.locator('#picker .pk-found h3')).toHaveText('Near Worcester, Massachusetts');
    await expect(page.locator('#picker .pk-found .pk-name')).toHaveText(['Lake Quinsigamond']);
    await page.getByRole('button', { name: 'Worcester, Western Cape, South Africa' }).click();
    await expect(page.locator('#picker .pk-found')).toHaveText('No locations within 50 km of Worcester, Western Cape.');
  });
});

// ---------- Tidal water (P1.14; 01 9.4, 9.7) ----------
// Thompson Boat Center reads a tide forecast beside its river: the Tide tab after Wind, a Tide fact on Now
// and the way the tide runs in the water state. The fixtures answer GTND2 with 72 hourly heights from the
// page clock (test/fixtures/tide.js): h = 4.0 + 1.6 sin(2 pi t / 12.42 h) ft from noon, so the water is
// rising at noon, with a high of 5.6 ft about 3 hours on (3 PM) and a low of 2.4 ft about 9 hours on (9 PM).
test.describe('tidal water', () => {
  const SLUG = 'thompson-boat-center';
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(clock);
  });

  test('has the Tide tab after Wind and before River, and labels the banks VA and DC', async ({ page }) => {
    await routeAll(page, scenario, clock);
    await page.goto(`/${SLUG}`);
    await ready(page);
    await expect(page.locator('#tabs a')).toHaveText(['Now', 'Week', 'Wind', 'Tide', 'River', 'Storms', 'Fog', 'Temperature', 'Rain', 'Light', 'Air']);
    await expect(page.locator('#compass .c-bank')).toHaveText(['VA', 'DC']);
    await expect(page.locator('#compassCap')).toContainText('upstream heading 285°');
    // The river is Little Falls, and the water temperature comes from the same gauge.
    await expect(fact(page, 'River flow').locator('.note')).toContainText('USGS gauge at Little Falls, about 5 mi upstream.');
    await expect(fact(page, 'Water').locator('.val')).toContainText('°');
  });

  test('gives the Tide fact on Now, linked to the Tide tab, with the next high and low', async ({ page }) => {
    await routeAll(page, scenario, clock);
    await page.goto(`/${SLUG}`);
    await ready(page);
    const tide = fact(page, 'Tide');
    await expect(tide).toHaveCount(1);
    await expect(tide.locator('.val')).toHaveText(/^\d\.\d ft rising$/);
    await expect(tide.locator('.note')).toHaveText(/^High about \d+\u00a0PM, 5\.[56] ft\. Low about \d+\u00a0PM, [12]\.\d ft\.$/);
    await expect(tide.locator('a.flink')).toHaveAttribute('href', '#tide');
    // The water state says which way the tide runs, and the wind sentence has no current in it.
    await expect(fact(page, 'Water state').locator('.note')).toContainText(/Flood tide, rising until about \d+\u00a0PM\./);
    await expect(fact(page, 'Wind').locator('.note')).not.toContainText('against current');
    await tide.locator('a.flink').click();
    await tabDrawn(page, 'tide');
    await expect(page.locator('#tabs a[aria-current="page"]')).toHaveText('Tide');
    expect(new URL(page.url()).hash).toBe('#tide');
  });

  test('draws the Tide tab from its own chunk: the strip, the labeled highs and lows and the table, and a tap fills the readout', async ({ page }) => {
    await routeAll(page, scenario, clock);
    const chunks = [];
    page.on('request', r => { if (/\/assets\/tide-[^/]+\.js$/.test(new URL(r.url()).pathname)) chunks.push(new URL(r.url()).pathname); });
    await page.goto(`/${SLUG}`);
    await ready(page);
    expect(chunks, 'the chunk waits for the tab').toEqual([]);
    await page.locator('#tabs a[data-tab="tide"]').click();
    await tabDrawn(page, 'tide');
    expect(chunks).toHaveLength(1);
    const body = page.locator('#detailBody');
    await expect(body.locator('.lede')).toHaveText(/^High about \d+\u00a0PM, 5\.[56] ft\. Low about \d+\u00a0PM, [12]\.\d ft\.$/);
    // 72 hours of heights from noon reach noon on the fourth day: four days of the strip have a high (the last from
    // the hours it has), the other three none, and none has a status color.
    const vals = await body.locator('.sval').allTextContents();
    expect(vals).toHaveLength(7);
    expect(vals.slice(0, 4).every(v => /^High \d\.\d\u00a0ft$/.test(v)), vals.join(' | ')).toBe(true);
    expect(vals.slice(4)).toEqual(Array(3).fill('No tide forecast'));
    expect(await body.locator('.strack i').evaluateAll(is => is.map(i => i.getAttribute('data-lvl')))).toEqual(vals.map(() => ''));
    // The chart labels the highs and lows of the rowing window, and the table lists the hours.
    await expect(body.locator('svg .cval').first()).toHaveText(/^about \d+(:\d\d)?\u00a0[AP]M, \d\.\d ft$/);
    await expect(body.locator('svg text', { hasText: 'Tide height, ft' })).toHaveCount(1);
    await body.locator('details.twin summary').click();
    await expect(body.locator('table.hours thead th')).toHaveText(['Time', 'Height', 'Tide']);
    // Today's hours run from the clock to sunset: the forecast starts at noon.
    expect(await body.locator('table.hours tbody tr').count()).toBeGreaterThanOrEqual(8);
    await expect(body.locator('table.hours tbody td').filter({ hasText: /^(Rising|Falling)$/ }).first()).toBeVisible();
    await expect(body.locator('.how')).toContainText('Tide heights are the National Weather Service forecast for the Potomac at Georgetown, in feet, hourly for 3 days.');
    await expect(body.locator('.how')).toContainText('Tide is shown for information. It does not change Go, Caution or Stay off.');
    // Tapping the chart fills the readout with the hour under the finger.
    const readout = body.locator('.readout');
    await expect(readout).toHaveText('Tap the chart for an hour.');
    await body.locator('svg rect.hit').nth(5).click({ force: true });
    await expect(readout).toHaveText(/^\d+\u00a0[AP]M: \d\.\d ft, (rising|falling)\.$/);
    await expect(body).not.toContainText(/NaN|undefined/);
  });

  test("keeps the text of every day of the Tide strip inside its button, at the project's width and at 360 px", async ({ page }, testInfo) => {
    await routeAll(page, scenario, clock);
    await page.goto(`/${SLUG}#tide`);
    await ready(page);
    await tabDrawn(page, 'tide');
    const body = page.locator('#detailBody');
    // Four days with a high and three with none, so the longest word ("forecast") is in the row.
    await expect(body.locator('.sval')).toHaveText([...Array(4).fill('High 5.6 ft'), ...Array(3).fill('No tide forecast')]);
    // Seven days share the row, so a word wider than a button would run over the day beside it. The text's own
    // line boxes are measured, not the value's box: a value with the page's `.wrap` class was a padded 40 px box,
    // and its word ran out of it.
    for (const width of [...new Set([testInfo.project.use.viewport.width, 360])]) {
      await page.setViewportSize({ width, height: 844 });
      const spill = await body.locator('.sday').evaluateAll(bs => bs.map(b => {
        const r = b.getBoundingClientRect(), range = document.createRange();
        range.selectNodeContents(b.querySelector('.sval'));
        return Math.max(0, ...[...range.getClientRects()].map(x => Math.max(r.left - x.left, x.right - r.right)));
      }));
      expect(Math.max(...spill), `at ${width} px a value runs ${Math.max(...spill)} px out of its day`).toBeLessThanOrEqual(0.5);
    }
  });

  test('opens straight at #tide, and shows every day of the strip', async ({ page }) => {
    await routeAll(page, scenario, clock);
    await page.goto(`/${SLUG}#tide`);
    await ready(page);
    await tabDrawn(page, 'tide');
    await expect(page.locator('#tabs a[aria-current="page"]')).toHaveText('Tide');
    await page.locator('#detailBody .sday').nth(1).click();
    await expect(page.locator('#detailBody .dhead')).toHaveText(/^Tomorrow, first light to sunset$/);
    await expect(page.locator('#detailBody svg .cval').first()).toBeVisible();
    // A day past the 3 days of the forecast says so and draws no chart.
    await page.locator('#detailBody .sday').last().click();
    await expect(page.locator('#detailBody .dnote')).toContainText('The forecast covers about 3 days.');
    await expect(page.locator('#detailBody svg.cchart')).toHaveCount(0);
  });

  test('says so when the tide forecast did not load, names it under the hero and keeps the verdict', async ({ page }) => {
    await routeAll(page, scenario, clock);
    await page.route('https://api.water.noaa.gov/nwps/v1/gauges/GTND2/stageflow/forecast', route => route.abort('failed'));
    await page.goto(`/${SLUG}`);
    await ready(page);
    await expect(page.locator('#statusNote')).toHaveText('Could not reach the NWS tide forecast. Showing the last data received where available.');
    await expect(page.locator('#verdict')).toHaveText(/^(Go|Caution|Stay off)\.$/);
    await expect(fact(page, 'Tide').locator('.val')).toHaveText('--');
    await expect(fact(page, 'Tide').locator('.note')).toHaveText('NWS tide forecast unavailable.');
    await page.goto(`/${SLUG}#tide`);
    await tabDrawn(page, 'tide');
    await expect(page.locator('#detailBody')).toContainText('The tide forecast is not available right now. Try Refresh.');
  });

  test("Putney has no Tide tab, never asks for the chunk, and #tide there opens Now with the hash taken out", async ({ page }) => {
    await routeAll(page, scenario, clock);
    const chunks = [];
    page.on('request', r => { if (/\/assets\/tide-/.test(r.url())) chunks.push(r.url()); });
    await page.goto('/putney-landing#tide');
    await ready(page);
    await expect(page.locator('#tabs a[data-tab="tide"]')).toHaveCount(0);
    await expect(page.locator('#tabs a[aria-current="page"]')).toHaveText('Now');
    expect(new URL(page.url()).hash).toBe('');
    await expect(fact(page, 'Tide')).toHaveCount(0);
    // Every tab Putney has, opened once: the views chunk loads and the tide chunk does not.
    for (const tab of ['week', 'wind', 'river', 'storms', 'fog', 'temperature', 'rain', 'light', 'air']) {
      await page.locator(`#tabs a[data-tab="${tab}"]`).click();
      await tabDrawn(page, tab);
    }
    expect(chunks).toEqual([]);
  });

  test('says Stay off for a Small Craft Advisory in force for the tidal Potomac, and names it', async ({ page }) => {
    // A zone product for ANZ535: no polygon, so it applies to the dock (plan 4.8). It runs from 2 hours
    // before the clock to 6 hours after it.
    await routeAll(page, scenario, clock, {
      edit: raw => {
        const t = h => new Date(clock + h * 3600000).toISOString();
        raw.alerts.features = [{
          id: 'urn:oid:2.49.0.1.840.0.sca', type: 'Feature', geometry: null,
          properties: {
            id: 'urn:oid:2.49.0.1.840.0.sca', areaDesc: 'Tidal Potomac from Key Bridge to Indian Head MD', sent: t(-3), effective: t(-2), onset: t(-2), expires: t(6), ends: t(6),
            status: 'Actual', messageType: 'Alert', category: 'Met', severity: 'Minor', certainty: 'Likely', urgency: 'Expected', event: 'Small Craft Advisory',
            sender: 'w-nws.webmaster@noaa.gov', senderName: 'NWS Baltimore MD/Washington DC', headline: 'Small Craft Advisory issued for the tidal Potomac',
            description: 'South winds 15 to 20 knots with gusts up to 25 knots.', instruction: 'Inexperienced mariners should avoid navigating in these conditions.', response: 'Avoid'
          }
        }];
      }
    });
    await page.goto(`/${SLUG}`);
    await ready(page);
    await expect(page.locator('#verdict')).toHaveText('Stay off.');
    await expect(page.locator('#why')).toContainText('Small Craft Advisory');
  });

  test('asks for the alerts of the marine zone as well as the land zones', async ({ page }) => {
    const seen = await routeAll(page, scenario, clock);
    await page.goto(`/${SLUG}`);
    await ready(page);
    expect(seen.served).toContain('https://api.weather.gov/alerts/active?zone=DCZ001,DCC001,VAZ054,VAC013,ANZ535');
  });

  test('is in the picker under the District of Columbia and opens from it', async ({ page }) => {
    await routeAll(page, scenario, clock);
    await page.goto('/putney-landing');
    await ready(page);
    await page.locator('#locBtn').click();
    await expect(page.locator('#picker .pk-row', { hasText: 'Thompson Boat Center' }).locator('.pk-sub')).toHaveText('Washington, DC. Potomac River.');
    await page.locator('#picker a[href="/thompson-boat-center"]').click();
    await ready(page);
    await expect(page.locator('#locName')).toHaveText('Thompson Boat Center');
    await expect(page.locator('#tabs a[data-tab="tide"]')).toHaveCount(1);
    await expect(fact(page, 'Tide')).toHaveCount(1);
  });
});

// R9: a slow answer for one place never lands in another, and a switch starts its own refresh.
// Putney is opened and its nine answers are held. Hanover is picked from the sheet: its own
// requests are answered at once, and its page is drawn from its own record. The answers for
// Putney then come, failed in one check and whole in the other (a late answer that succeeds
// must land nowhere either: it would write Putney's numbers under Hanover's saved copy).
test.describe('switching between the real locations', () => {
  async function pickHanoverOverHeldPutney(page) {
    await page.clock.setFixedTime(clock);
    const seen = await routeAll(page, scenario, clock);
    // Putney's nine requests are held. Everything after them is answered from the fixtures.
    const out = await hold(page, 9);
    await page.goto('/putney-landing');
    await expect.poll(() => out.held.length).toBe(9);
    expect(out.held.map(r => r.request().url()).filter(u => /KLEB|USGS-01144500|WLBN3/.test(u)), 'nothing of Hanover is held').toEqual([]);

    // The sheet lists the built locations, by region.
    await page.locator('#locBtn').click();
    await expect(page.locator('#picker .pk-group')).toHaveText(['California', 'District of Columbia', 'Massachusetts', 'New Hampshire', 'New Jersey', 'Pennsylvania', 'Vermont']);
    await page.locator('#picker a[href="/hanover-boathouse"]').click();
    await ready(page);
    await expect(page.locator('#locName')).toHaveText('Hanover boathouse');
    expect(new URL(page.url()).pathname).toBe('/hanover-boathouse');
    await expect(page.locator('#verdict')).toHaveText(/^(Go|Caution|Stay off)\.$/);
    // Nothing of Putney is left in the header or the footer.
    await expect(page.locator('#sub')).toHaveText(PLACES['hanover-boathouse'].sub);
    await expect(page.locator('#locBadges .badge')).toHaveText('Not confirmed on site');
    await expect(page).toHaveTitle('Hanover boathouse rowing conditions');
    expect(await creditLinks(page), "Hanover's credits, not Putney's").toEqual(PLACES['hanover-boathouse'].credits);
    // Hanover's own requests went out while Putney's were still waiting, and were answered.
    expect(seen.served).toContain('https://api.weather.gov/stations/KLEB/observations/latest');
    expect(seen.served).toContain('https://api.water.noaa.gov/nwps/v1/gauges/WLBN3/stageflow/forecast');
    expect(seen.served.filter(u => u.includes('monitoring_location_id=USGS-01144500'))).toHaveLength(3);
    expect(out.held, 'Putney\'s are still held').toHaveLength(9);

    const key = 'rowhether-cache-v2:hanover-boathouse';
    const before = { verdict: await page.locator('#verdict').textContent(), why: await page.locator('#why').textContent(), updated: await page.locator('#updated').textContent(), saved: await stored(page, key) };
    expect(JSON.parse(before.saved).data.river.flow.v, 'Hanover saved a forecast of its own').toBeGreaterThan(0);
    expect(JSON.parse(before.saved).data.river.waterC, 'Hanover has no water temperature gauge').toBeUndefined();
    return { seen, out, key, before };
  }

  // What Hanover's page and saved copy must still be after Putney's answers have come and gone.
  async function expectHanoverUnchanged(page, { key, before }) {
    await expect(page.locator('#locName')).toHaveText('Hanover boathouse');
    await expect(page.locator('#statusNote')).toBeHidden();
    await expect(page.locator('#verdict')).toHaveText(before.verdict);
    await expect(page.locator('#why')).toHaveText(before.why);
    await expect(page.locator('#updated')).toHaveText(before.updated);
    await expect(page.locator('#sub')).toHaveText(PLACES['hanover-boathouse'].sub);
    expect(await creditLinks(page)).toEqual(PLACES['hanover-boathouse'].credits);
    expect(await stored(page, key), "Hanover's saved copy is as it was").toBe(before.saved);
    expect(await stored(page, 'rowhether-cache-v2:putney-landing'), "a dropped answer is not saved as Putney's").toBeNull();
  }

  test("with Putney's answers held, picking Hanover draws Hanover at once, and the late answers, failed, change nothing", async ({ page }) => {
    const hanover = await pickHanoverOverHeldPutney(page);
    // Now Putney's answers come, all failed. They are for a place that is no longer open, and the app
    // warns about each failed source, so only a page error is a bug from here.
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await hanover.out.release();
    await page.waitForLoadState('networkidle');
    await expectHanoverUnchanged(page, hanover);
    expect(errors).toEqual([]);
  });

  test("with Putney's answers held, picking Hanover draws Hanover at once, and the late answers, whole, change nothing", async ({ page }) => {
    const hanover = await pickHanoverOverHeldPutney(page);
    const answered = hanover.seen.served.length;
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await hanover.out.answer();
    // All nine of Putney's answers reach the page: the fixtures served them, Putney's gauge among them.
    await expect.poll(() => hanover.seen.served.length - answered).toBe(9);
    expect(hanover.seen.served.slice(answered)).toContain('https://api.weather.gov/stations/KEEN/observations/latest');
    expect(hanover.seen.served.slice(answered).some(u => u.includes('monitoring_location_id=USGS-01154500'))).toBe(true);
    await page.waitForLoadState('networkidle');
    await expectHanoverUnchanged(page, hanover);
    expect(errors).toEqual([]);
  });
});
