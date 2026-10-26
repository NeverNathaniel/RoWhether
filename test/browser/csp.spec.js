// The built app under the headers of public/_headers (phase 1 plan P1.17, 08 10.11). `vite preview`
// does not apply that file, so here every response from the app's own address is given the headers of
// its `/*` rule, and the browser enforces them as it would on the host. A violation is reported by the
// page's own `securitypolicyviolation` event, which the browser fires for each blocked load, so a screen
// that asks for a host the policy does not list fails here, and not only on production.
//
// What this cannot reach: the service worker's own requests (Playwright does not route them), and the
// Turnstile widget, which the fixtures never answer. The hand check in the P1.17 progress entry ran the
// worker under `wrangler dev`, which applies the file as the host does.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { SCENARIOS, routeAll, ready, tabDrawn } from './fixtures.js';
import { parseHeadersFile } from '../helpers/headers.js';

const scenario = SCENARIOS['june-calm'];
const clock = scenario.clock(12);
const POLICY = parseHeadersFile(readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8')).find(r => r.path === '/*').headers;
const TABS = ['week', 'wind', 'river', 'storms', 'fog', 'temperature', 'rain', 'light', 'air'];
const DOCK = { latitude: 42.96, longitude: -72.52 };

// The headers on every response of the app's own address except /api/*, which the host's Worker
// answers and which the fixtures stub. Registered after routeAll(), so it takes the request first.
// Returns the violations the page reports, `directive: blocked address`, in order.
async function enforce(page, baseURL) {
  const seen = [];
  await page.exposeFunction('__violation', text => seen.push(text));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => window.__violation(`${e.violatedDirective}: ${e.blockedURI}`), true);
  });
  await page.route(url => url.origin === new URL(baseURL).origin && !url.pathname.startsWith('/api/'), async route => {
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), ...POLICY } });
  });
  return seen;
}

// A page at `url` with the fixtures answering upstream, the headers applied, and the clock pinned.
// With `suggest`, /api/suggest says the suggestion form is on, as it is with the secrets set.
async function open(page, baseURL, url, { suggest = false } = {}) {
  await page.clock.setFixedTime(clock);
  const requests = await routeAll(page, scenario, clock);
  if (suggest) await page.route('**/api/suggest', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, siteKey: 'test-key' }) }));
  const seen = await enforce(page, baseURL);
  await page.goto(url);
  await ready(page);
  return { seen, requests };
}
const hosts = served => [...new Set(served.map(u => new URL(u).host))].sort();

test('the browser enforces the headers here: a host and an inline script the policy does not allow are reported', async ({ page, baseURL }) => {
  const { seen } = await open(page, baseURL, '/putney-landing');
  const response = await page.evaluate(() => fetch('/putney-landing').then(r => r.headers.get('content-security-policy')));
  expect(response, 'the page is served with the policy').toBe(POLICY['content-security-policy']);
  await page.evaluate(async () => {
    try { await fetch('https://example.com/'); } catch { /* blocked */ }
    const s = document.createElement('script');
    s.textContent = 'window.__ran = true';
    document.body.append(s);
  });
  // Only these two, so a hole the page itself falls into at load does not blur what this one shows.
  await expect.poll(() => seen.filter(v => /example\.com|inline/.test(v)).sort()).toEqual(['connect-src: https://example.com/', 'script-src-elem: inline']);
  expect(await page.evaluate(() => window.__ran), 'the inline script did not run').toBeUndefined();
});

test('Now, a day row, every tab and Settings raise no violation, and every source host answers', async ({ page, baseURL }) => {
  const { seen, requests } = await open(page, baseURL, '/putney-landing');
  expect(hosts(requests.served), 'the page reached each upstream host the policy lists for Putney').toEqual([
    'air-quality-api.open-meteo.com', 'api.open-meteo.com', 'api.water.noaa.gov', 'api.waterdata.usgs.gov', 'api.weather.gov'
  ]);
  await page.locator('#days details > summary').first().click();
  await page.waitForSelector('.forecast');
  for (const tab of TABS) {
    await page.goto(`/putney-landing#${tab}`);
    await tabDrawn(page, tab);
  }
  await page.goto('/putney-landing');
  await ready(page);
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settings')).toBeVisible();
  expect(seen).toEqual([]);
});

test('the picker, its town search and the suggestion form raise no violation', async ({ page, baseURL }) => {
  const { seen, requests } = await open(page, baseURL, '/putney-landing', { suggest: true });
  await page.locator('#locBtn').click();
  await page.locator('#picker .pk-q').fill('Worcester');
  await expect(page.locator('#picker .pk-place').first()).toBeVisible();
  expect(requests.served.filter(u => u.startsWith('https://geocoding-api.open-meteo.com/')), 'the town search was answered').toHaveLength(1);
  // The picker's own line opens the suggestion form, which adds the Turnstile script. The fixtures never
  // answer that host, so the test ends the request with an abort: one the policy had refused would fail
  // with ERR_BLOCKED_BY_CSP and not ERR_FAILED.
  const script = page.waitForEvent('requestfailed', r => r.url().startsWith('https://challenges.cloudflare.com/turnstile/'));
  await page.locator('#picker .pk-sug button').click();
  await expect(page.locator('#suggest')).toBeVisible();
  expect((await script).failure().errorText).toBe('net::ERR_FAILED');
  expect(seen).toEqual([]);
});

test.describe('Near me', () => {
  test.use({ geolocation: DOCK, permissions: ['geolocation'] });

  test('is allowed by the Permissions-Policy and raises no violation', async ({ page, baseURL }) => {
    const { seen } = await open(page, baseURL, '/putney-landing');
    await page.locator('#locBtn').click();
    await page.getByRole('button', { name: 'Near me' }).click();
    await expect(page.locator('#picker .pk-found h3')).toHaveText('Near you');
    await expect(page.locator('#picker .pk-found .pk-name').first()).toHaveText('Putney Landing');
    expect(seen).toEqual([]);
  });
});

test('a lake and a tidal location, the privacy page and a missing address raise no violation', async ({ page, baseURL }) => {
  const { seen, requests } = await open(page, baseURL, '/lake-natoma');
  await page.goto('/lake-natoma#wind');
  await tabDrawn(page, 'wind');
  await page.goto('/thompson-boat-center');
  await ready(page);
  await page.goto('/thompson-boat-center#tide');
  await tabDrawn(page, 'tide');
  expect(requests.served.some(u => /\/GTND2\//.test(u)), 'the tide forecast was answered').toBe(true);
  await page.goto('/privacy');
  await expect(page.locator('h1').first()).toHaveText('Privacy');
  await page.goto('/lake-nowhere');
  await expect(page.locator('#notFound .pk-q')).toBeVisible();
  expect(seen).toEqual([]);
});
