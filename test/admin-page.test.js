import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { installFakeDom, uninstallFakeDom } from './helpers/fakedom.js';
import { T } from '../src/copy/admin.js';

// The owner's page, its side of the Metrics tab (P1.18; 07 5.14, 14.5): what it asks, what it says for each
// answer, and what it draws. The Worker's side is in admin.test.js.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const INDEX = { v: 1, locations: [{ slug: 'putney-landing', name: 'Putney Landing' }, { slug: 'lake-natoma', name: 'Lake Natoma' }] };
const DATA = {
  env: 'production', days: 7, from: '2026-10-20', to: '2026-10-26', truncated: false,
  totals: { opens: 412, firsts: 38, standalone: 128 }, prior: { opens: 1380, firsts: 29, standalone: 300 },
  locations: [
    { slug: 'putney-landing', opens: 300, series: [10, 20, 30, 40, 50, 60, 90] },
    { slug: 'lake-natoma', opens: 70, series: [5, 5, 10, 10, 10, 15, 15] },
    { slug: 'none', opens: 30, series: [1, 2, 3, 4, 5, 6, 9] },
    { slug: 'made-up-name', opens: 12, series: [0, 0, 0, 0, 0, 2, 10] }
  ]
};
const json = (body, init = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

let dom, admin, route, kit, asked, answer, indexAnswer, path;
beforeEach(async () => {
  dom = installFakeDom();
  path = '/admin';
  vi.stubGlobal('location', { get pathname() { return path; } });
  asked = [];
  answer = () => json(DATA);
  indexAnswer = () => json(INDEX);
  vi.stubGlobal('fetch', async (url, init) => {
    asked.push([String(url), init]);
    if (String(url) === '/locations/index.json') return indexAnswer();
    const a = answer();
    if (a instanceof Error) throw a;
    return a;
  });
  vi.resetModules();
  route = await import('../src/route.js');
  admin = await import('../src/admin/admin.js');
  // What src/route.js hands the page: the page imports none of it (src/admin/admin.js says why).
  const { esc } = await import('../src/format.js'), { fact, sparkline } = await import('../src/render/parts.js'), { fetchIndex } = await import('../src/locations.js');
  kit = { page: route.page, showOffline: route.showOffline, esc, fact, sparkline, fetchIndex };
});
afterEach(() => { uninstallFakeDom(); vi.unstubAllGlobals(); });

const body = () => dom.el('notFound').innerHTML;
const text = () => dom.el('notFound').textContent;

describe('load', () => {
  it('asks for the metrics of 7 days, with no cache, and no following of a redirect', async () => {
    await admin.load();
    expect(asked).toEqual([['/api/admin/metrics?days=7', { cache: 'no-store', redirect: 'manual' }]]);
  });
  it('reads the numbers the Worker sends', async () => {
    expect(await admin.load()).toEqual({ state: 'ok', data: DATA });
  });
  it('reads a 503 as not set up, and a 403, a 401 and a redirect Access makes as a sign in', async () => {
    answer = () => json({ error: 'not_configured' }, { status: 503 });
    expect((await admin.load()).state).toBe('setup');
    for (const status of [403, 401]) {
      answer = () => json({ error: 'not_allowed' }, { status });
      expect((await admin.load()).state, String(status)).toBe('signin');
    }
    // A redirect that fetch was told not to follow: an opaque response of type opaqueredirect.
    answer = () => Object.defineProperty(new Response(null, { status: 200 }), 'type', { value: 'opaqueredirect' });
    expect((await admin.load()).state).toBe('signin');
  });
  it('reads no connection as offline', async () => {
    answer = () => new TypeError('Failed to fetch');
    expect((await admin.load()).state).toBe('offline');
  });
  it('reads any other answer as a failure: a 500, a page that is not JSON, JSON with no numbers', async () => {
    for (const a of [() => json({}, { status: 500 }), () => new Response('<!doctype html>', { status: 200 }), () => json({ hello: 'x' }), () => json({ totals: {}, prior: {}, locations: 'x' }), () => new Response('Not found', { status: 404 }), () => json(null)]) {
      answer = a;
      expect((await admin.load()).state).toBe('failed');
    }
  });
});

describe('placeRows', () => {
  const names = new Map(INDEX.locations.map(l => [l.slug, l.name]));
  it('names a place by the list, the picker and the missing page by a name of their own, and sorts by opens', () => {
    const rows = admin.placeRows(DATA.locations.slice(0, 3), names);
    expect(rows.map(r => [r.name, r.opens])).toEqual([['Putney Landing', 300], ['Lake Natoma', 70], [T.none, 30]]);
  });
  it('adds the names the list does not have into one row, which sorts among the rest', () => {
    const locs = [{ slug: 'putney-landing', opens: 9, series: [1, 1, 1, 1, 1, 2, 2] }, { slug: 'zzz-one', opens: 4, series: [1, 1, 1, 1, 0, 0, 0] }, { slug: 'zzz-two', opens: 3, series: [0, 0, 0, 0, 0, 1, 2] }];
    const rows = admin.placeRows(locs, names);
    expect(rows).toEqual([{ name: 'Putney Landing', opens: 9, series: [1, 1, 1, 1, 1, 2, 2] }, { name: T.other, opens: 7, series: [1, 1, 1, 1, 0, 1, 2] }]);
    const big = admin.placeRows([{ slug: 'zzz-one', opens: 50, series: [50] }, { slug: 'putney-landing', opens: 5, series: [5] }], names);
    expect(big.map(r => r.name)).toEqual([T.other, 'Putney Landing']);
  });
  it('keeps every address as it is when there is no list to name them by', () => {
    const rows = admin.placeRows(DATA.locations, null);
    expect(rows.map(r => r.name)).toEqual(['putney-landing', 'lake-natoma', 'none', 'made-up-name'].map(n => (n === 'none' ? T.none : n)));
    expect(rows.some(r => r.name === T.other)).toBe(false);
  });
  it('has no row for a place and no other row when there is nothing', () => {
    expect(admin.placeRows([], names)).toEqual([]);
  });
});

describe('metricsHtml', () => {
  const html = (d = DATA, names = new Map(INDEX.locations.map(l => [l.slug, l.name]))) => admin.metricsHtml(d, names, kit);
  const flat = h => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  it('says the window, the instance and the day rule, with the three numbers each beside the week before', () => {
    const t = flat(html());
    expect(t).toContain('Last 7 days, Oct 20 to Oct 26. Days are UTC. Counted by the production instance.');
    expect(t).toMatch(/Opens 412 Week before: 1,380/);
    expect(t).toMatch(/New devices 38 Week before: 29/);
    expect(t).toMatch(/From the home screen 31% Week before: 22%/);
  });
  it('rounds the share, and says 0% for no opens', () => {
    const d = { ...DATA, totals: { opens: 3, firsts: 0, standalone: 1 }, prior: { opens: 0, firsts: 0, standalone: 0 } };
    expect(flat(html(d))).toMatch(/From the home screen 33% Week before: 0%/);
  });
  it('words a window that is not a week by its days', () => {
    expect(flat(html({ ...DATA, days: 14 }))).toContain('Last 14 days');
    expect(flat(html({ ...DATA, days: 14 }))).toContain('14 days before: 1,380');
    expect(flat(html({ ...DATA, days: 1, from: '2026-10-26' }))).toContain('Last 1 days, Oct 26 to Oct 26');
  });
  it('lists the places in a table inside a scrolling wrapper, with a sparkline each', () => {
    const h = html();
    expect(h).toContain('<div class="hours-wrap"><table class="hours">');
    expect(h.match(/<tr><td>/g)).toHaveLength(4);
    expect(h.match(/<svg class="spark"/g)).toHaveLength(4);
    expect(h).toContain('aria-label="Putney Landing: opens each day"');
    expect(h).not.toContain('River flow');
    const t = flat(h);
    expect(t).toMatch(/Putney Landing 300 Lake Natoma 70 No location \(picker or missing page\) 30 Names the app does not list 12/);
    expect(t).not.toContain('made-up-name');
  });
  it('draws each sparkline from the days of its row, oldest first', () => {
    const h = html({ ...DATA, locations: [{ slug: 'putney-landing', opens: 6, series: [0, 0, 0, 0, 0, 0, 6] }] });
    expect(h).toMatch(/<polyline points="0\.0,25\.0 18\.7,25\.0 37\.3,25\.0 56\.0,25\.0 74\.7,25\.0 93\.3,25\.0 112\.0,3\.0"\/>/);
  });
  it('escapes a name from the list, the instance and a name given a row', () => {
    const names = new Map([['putney-landing', '<img src=x onerror=alert(1)>']]);
    const h = html({ ...DATA, env: '<b>x</b>', locations: [{ slug: 'putney-landing', opens: 1, series: [0, 0, 0, 0, 0, 0, 1] }] }, names);
    expect(h).not.toContain('<img');
    expect(h).not.toContain('<b>x</b>');
    expect(h).toContain('&lt;img src=x onerror=alert(1)&gt;');
    const h2 = admin.metricsHtml({ ...DATA, locations: [{ slug: 'a-b', opens: 1, series: [0, 0, 0, 0, 0, 0, 1] }] }, null, kit);
    expect(h2).toContain('<td>a-b</td>');
  });
  it('says there are no opens, with no table, for an empty window', () => {
    const h = html({ ...DATA, locations: [], totals: { opens: 0, firsts: 0, standalone: 0 } });
    expect(h).not.toContain('<table');
    expect(h).toContain(T.empty);
  });
  it('says so when the numbers may be low, and only then', () => {
    expect(html({ ...DATA, truncated: true })).toContain(T.truncated);
    expect(html()).not.toContain(T.truncated);
  });
  it('explains new devices and the row of names the app does not list, and the second only when it is there', () => {
    expect(html()).toContain(T.firstsNote);
    expect(html()).toContain(T.otherNote);
    expect(html({ ...DATA, locations: DATA.locations.slice(0, 3) })).not.toContain(T.otherNote);
  });
  it('is the same for a viewer in any language and zone: English month names, no local day', () => {
    const t = flat(html({ ...DATA, from: '2026-01-01', to: '2026-01-07' }));
    expect(t).toContain('Jan 1 to Jan 7');
  });
});

describe('showAdmin', () => {
  it('writes the header and the one tab, then the numbers, and draws nothing of a location', async () => {
    await admin.showAdmin(kit);
    expect(dom.el('locName').textContent).toBe('Admin');
    expect(document.title).toBe('Admin');
    expect(dom.el('sub').innerHTML).toBe('Owner tools. <a href="/" data-nav>Back to the forecast</a>');
    expect(dom.el('tabs').innerHTML).toBe('<a href="#metrics" data-tab="metrics" aria-current="page">Metrics</a>');
    expect(dom.el('tabs').hidden).toBe(false);
    expect(dom.el('notFound').hidden).toBe(false);
    for (const id of ['home', 'detail', 'actions']) expect(dom.el(id).hidden, id).toBe(true);
    expect(text()).toContain('Opens');
    expect(text()).toContain('Putney Landing');
    expect(text()).not.toContain('made-up-name');
  });
  it('asks for the metrics and for the list of locations, and nothing else', async () => {
    await admin.showAdmin(kit);
    expect(asked.map(a => a[0]).sort()).toEqual(['/api/admin/metrics?days=7', '/locations/index.json']);
  });
  it('shows the numbers with the places as they are when the list cannot be read', async () => {
    indexAnswer = () => new Response('<!doctype html>', { status: 200 });
    await admin.showAdmin(kit);
    expect(body()).toContain('<td>made-up-name</td>');
    expect(body()).toContain('<td>putney-landing</td>');
  });
  it('says the page is not set up, and offers nothing to try', async () => {
    answer = () => json({ error: 'not_configured', message: T.setup }, { status: 503 });
    await admin.showAdmin(kit);
    expect(text()).toContain('The metrics page is not set up here.');
    expect(body()).not.toContain('retryBtn');
    expect(dom.el('tabs').hidden).toBe(false);
  });
  it('says to sign in through Access, with a link that loads the page again from the host', async () => {
    answer = () => json({ error: 'not_allowed' }, { status: 403 });
    await admin.showAdmin(kit);
    expect(text()).toContain('Sign in through Cloudflare Access to see this page.');
    expect(body()).toContain('<a href="/admin">Sign in</a>');
    expect(body()).not.toContain('data-nav');
  });
  it('says the page needs a connection, with Try again, for no connection', async () => {
    answer = () => new TypeError('Failed to fetch');
    await admin.showAdmin(kit);
    expect(dom.el('notFound').innerHTML).toContain('<h2>This page needs a connection</h2>');
    expect(body()).toContain('id="retryBtn"');
  });
  it('says the numbers could not be read, with Try again, for any other failure', async () => {
    answer = () => json({}, { status: 500 });
    await admin.showAdmin(kit);
    expect(text()).toContain('The numbers could not be read. Try again later.');
    expect(body()).toContain('id="retryBtn"');
  });
  it('shows Loading while it waits', async () => {
    let release;
    answer = () => new Promise(r => { release = r; });
    const done = admin.showAdmin(kit);
    await Promise.resolve();
    expect(text()).toContain('Loading.');
    release(json(DATA));
    await vi.waitFor(() => expect(release).toBeDefined());
    answer = () => json(DATA);
    await done.catch(() => {});
  });
  it('draws nothing when the viewer has moved to another address while the numbers came', async () => {
    const done = admin.showAdmin(kit);
    path = '/putney-landing';
    dom.el('notFound').innerHTML = '<p>another page</p>';
    await done;
    expect(dom.el('notFound').innerHTML).toBe('<p>another page</p>');
  });
  it('draws only the newest of two draws, whatever order their answers come in', async () => {
    const waiting = [];
    answer = () => new Promise(r => waiting.push(r));
    const first = admin.showAdmin(kit), second = admin.showAdmin(kit);
    await vi.waitFor(() => expect(waiting).toHaveLength(2));
    waiting[1](json({ ...DATA, totals: { opens: 222, firsts: 1, standalone: 0 } }));
    await second;
    waiting[0](json({ ...DATA, totals: { opens: 111, firsts: 1, standalone: 0 } }));
    await first;
    expect(text()).toContain('222');
    expect(text()).not.toContain('111');
  });
});

describe('the page and the Worker say the same', () => {
  it('has the setup and sign in sentences the plan words', () => {
    expect(T.setup).toBe('The metrics page is not set up here.');
    expect(T.signIn).toBe('Sign in through Cloudflare Access to see this page.');
  });
});

// The app never holds the Worker's modules or its key library, and the page keeps to the rules of its words.
describe('the page in the build', () => {
  const read = f => readFileSync(join(ROOT, f), 'utf8');
  it('imports neither jose nor anything of the Worker', () => {
    for (const f of ['src/main.js', 'src/route.js', 'src/admin/admin.js', 'src/copy/admin.js']) {
      expect(read(f), f).not.toMatch(/from ['"]jose['"]|from ['"][./]*worker\//);
    }
  });
  it('is read by import() from route.js only, never as a static import', () => {
    expect(read('src/route.js')).toMatch(/import\('\.\/admin\/admin\.js'\)/);
    for (const f of ['src/main.js', 'src/route.js', 'src/state.js', 'src/render/index.js', 'src/render/now.js', 'src/render/detail/index.js', 'src/picker.js', 'src/suggest.js']) {
      expect(read(f), f).not.toMatch(/^import .* from '\.\.?\/(admin\/)?admin\.js'/m);
    }
  });
  // A lazy chunk that imports a module the main script also holds makes the bundler cut that module out of the main
  // script into a second file that the page loads at start (found building P1.18). So the page takes the app's parts as an argument.
  it('imports nothing of the app but its own words and styles', () => {
    const imports = [...read('src/admin/admin.js').matchAll(/^import (?:.* from )?'([^']+)'/gm)].map(m => m[1]);
    expect(imports).toEqual(['../styles/admin.css', '../copy/admin.js']);
    expect(read('src/copy/admin.js')).not.toMatch(/^import /m);
  });
  it('has no em or en dash and never calls the verdict a call', () => {
    for (const f of ['src/admin/admin.js', 'src/copy/admin.js']) {
      expect(read(f), f).not.toMatch(/[\u2013\u2014]/);
    }
    for (const v of Object.values(T)) expect(typeof v === 'function' ? v(7) : v).not.toMatch(/[\u2013\u2014]|\bcall\b/i);
  });
});
