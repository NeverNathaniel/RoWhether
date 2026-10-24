// A new build takes over without the browser being closed (B1 in
// docs/full-app/reviews/phase-0-browser-check.md).
//
// With injectRegister false, vite-plugin-pwa 1.3.0 leaves skipWaiting and
// clientsClaim out of the worker, so a new worker waited until every client of
// the old one was gone and an installed phone app could stay on the old build
// for days. vite.config.js now asks for both. This spec serves two real builds
// of the tree at one address: an older one built here with another version
// string, then dist/ (the build the web server made), and checks that a visitor
// who has the first gets the second without a restart. Both builds carry the
// worker under test, so undoing the two lines in vite.config.js fails the spec.
//
// Service workers are allowed here (the config blocks them elsewhere). The
// upstream hosts are answered from the fixtures, so nothing leaves the machine.
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { SCENARIOS, routeAll, ready } from './fixtures.js';

test.use({ serviceWorkers: 'allow' });

const scenario = SCENARIOS['june-calm'];
const clock = scenario.clock(12);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const NEW_DIST = join(ROOT, 'dist');
const CACHE_KEY = 'rowhether-cache-v2:putney-landing';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

// The page's own build, from the script tag in its index.html.
const mainOf = dist => readFileSync(join(dist, 'index.html'), 'utf8').match(/assets\/(index-[^"']+\.js)/)[1];

let tmp, OLD_DIST, OLD_MAIN, NEW_MAIN, server, origin, serving;
// Requests for /sw.js, which is how the browser checks for a new worker, and the
// count when the older build was last reloaded.
let swChecks = 0, swChecksAtReload = 0;

test.setTimeout(90000);

test.beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'rowhether-update-'));
  OLD_DIST = join(tmp, 'old');
  // The same tree under another version string, so the main script has another name.
  execFileSync(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', OLD_DIST, '--emptyOutDir'], {
    cwd: ROOT,
    env: { ...process.env, WORKERS_CI_COMMIT_SHA: 'oldbuild' },
    stdio: 'pipe'
  });
  OLD_MAIN = mainOf(OLD_DIST);
  NEW_MAIN = mainOf(NEW_DIST);
  expect(OLD_MAIN, 'the two builds must differ').not.toBe(NEW_MAIN);

  // public/_headers, as Cloudflare applies it: the worker is always revalidated.
  server = http.createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/sw.js') swChecks++;
    const file = join(serving, path === '/' ? 'index.html' : path);
    if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const cache = path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': cache });
    res.end(readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise(resolve => (server ? server.close(resolve) : resolve()));
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

// Which build the page runs, from its main script. A page that is mid-reload has
// no execution context for a moment, which reads as null.
const runningBuild = page => page.evaluate(() => document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src').split('/').pop()).catch(() => null);

// Count the main frame's page loads from this build's address.
function countLoads(page) {
  let loads = 0;
  page.on('framenavigated', f => { if (f === page.mainFrame() && f.url().startsWith(origin)) loads++; });
  return () => loads;
}

async function open(page) {
  await page.clock.setFixedTime(clock);
  await routeAll(page, scenario, clock);
  await page.goto(`${origin}/`);
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
}

// A returning visitor of the older build: installed, and controlled by its worker.
async function visitOlderBuild(page) {
  serving = OLD_DIST;
  const loads = countLoads(page);
  await open(page);
  swChecksAtReload = swChecks;
  await page.reload(); // the second visit
  await ready(page);
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the worker controls the page').toBe(true);
  expect(await runningBuild(page)).toBe(OLD_MAIN);
  return loads;
}

// Deploy: the same address now serves the newer build. Then wait for the page to
// be on it, without closing the browser or touching the worker by hand.
async function expectTakeover(page, loads, trigger, mostLoads) {
  const saved = await page.evaluate(k => localStorage.getItem(k), CACHE_KEY);
  expect(saved, 'a forecast is saved before the update').not.toBeNull();
  serving = NEW_DIST;
  const before = loads();
  await trigger();
  await expect.poll(() => runningBuild(page), { message: 'the page is on the new build', timeout: 20000 }).toBe(NEW_MAIN);
  await ready(page);
  await page.waitForTimeout(1000); // long enough to see a second, unwanted reload
  expect(loads() - before, 'reloaded once, by itself, and no more').toBeLessThanOrEqual(mostLoads);
  // No worker left waiting, the old build's files gone from the cache, the saved forecast kept.
  const state = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const files = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) files.push(new URL(req.url).pathname);
    return { waiting: !!reg.waiting, controlled: !!navigator.serviceWorker.controller, mains: files.filter(p => /\/assets\/index-.*\.js$/.test(p)) };
  });
  expect(state).toEqual({ waiting: false, controlled: true, mains: [`/assets/${NEW_MAIN}`] });
  expect(await page.evaluate(k => localStorage.getItem(k), CACHE_KEY)).toBe(saved);
}

// A first install claims the page, so it is offline ready at once, and does not reload it.
test('a first install takes the page at once and does not reload it', async ({ page }) => {
  serving = OLD_DIST;
  const loads = countLoads(page);
  await open(page);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { message: 'the first install claims the page', timeout: 5000 }).toBe(true);
  await page.waitForTimeout(1000);
  expect(loads(), 'the first visit loaded once').toBe(1);
});

test('a reload brings in the new build without closing the browser', async ({ page }) => {
  const loads = await visitOlderBuild(page);
  // The reload is the visitor's. The page then finds the new worker on its own and
  // reloads once more (or, if the worker is found first, only the visitor's reload).
  await expectTakeover(page, loads, () => page.reload(), 2);
});

test('the update check the page makes on coming back brings in the new build, with one reload', async ({ page }) => {
  const loads = await visitOlderBuild(page);
  // Chromium checks the worker once more about a second after a page load, and that
  // check would find the deploy by itself. Wait for it (up to 5 s) to be answered by
  // the older build, so that after the deploy only the page's own check can.
  const until = Date.now() + 5000;
  while (swChecks <= swChecksAtReload && Date.now() < until) await page.waitForTimeout(100);
  // An installed app often resumes without a reload, so src/main.js checks for a new
  // version each time the page comes back to the foreground, at most every 5
  // minutes. The visitor comes back 5 minutes later, and the page's own check runs.
  // The clock then goes back, so the new build's first refresh saves the forecast
  // at the same time as before and the saved copy can be compared as it was.
  await expectTakeover(page, loads, async () => {
    await page.clock.setFixedTime(clock + 5 * 60 * 1000);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.clock.setFixedTime(clock);
  }, 1);
});
