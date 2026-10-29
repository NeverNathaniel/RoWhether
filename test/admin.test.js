import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import worker from '../worker/index.js';
import { accessConfigured, verifyAccess } from '../worker/auth/access.js';
import { handleAdmin } from '../worker/admin.js';
import { clampDays, datasetFor, metricsQuery, summarize, readMetrics } from '../worker/metrics.js';
import { T } from '../src/copy/admin.js';

// The Metrics tab's Worker side (P1.18; 03 3.7, 07 14.5, 08 6.3 and 7.3): the Access check on
// everything under /api/admin/, and GET /api/admin/metrics, read from the open counter's dataset
// through the ANALYTICS_SQL binding. Access and the binding are injected; the one real verifier
// check signs tokens with a key made here and serves its public half as the team's key set.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ASSETS = { fetch: vi.fn() };
const NOW = Date.UTC(2026, 9, 26, 15, 30); // Monday 2026-10-26, 11:30 AM at Putney
const TEAM = 'rowhether-test.cloudflareaccess.com', AUD = 'aud-0123456789abcdef';
const CONFIGURED = { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
const ask = (path = '/api/admin/metrics?days=7', init) => new Request(`https://row.example${path}`, { headers: { 'Cf-Access-Jwt-Assertion': 'a.token.here' }, ...init });
const allow = () => ({ verify: vi.fn(async () => ({ email: 'owner@example.com' })), now: NOW });
const sql = rows => ({ query: vi.fn(async () => ({ data: rows, rows: rows.length, statistics: {} })) });

describe('accessConfigured', () => {
  it('is true for a team domain and an AUD that the owner set', () => {
    expect(accessConfigured(CONFIGURED)).toBe(true);
    expect(accessConfigured({ ACCESS_TEAM_DOMAIN: 'https://x.cloudflareaccess.com/', ACCESS_AUD: 'abc' })).toBe(true);
  });
  it('is false while either value is missing, empty, blank or a placeholder', () => {
    expect(accessConfigured({})).toBe(false);
    for (const v of [undefined, null, '', '   ', 'OWNER-SETS-team.cloudflareaccess.com', 'OWNER-SETS-aud', 'OWNER-SETS-preview-aud', ' OWNER-SETS-aud', 7]) {
      expect(accessConfigured({ ACCESS_TEAM_DOMAIN: v, ACCESS_AUD: AUD }), `team ${v}`).toBe(false);
      expect(accessConfigured({ ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: v }), `aud ${v}`).toBe(false);
    }
  });
});

describe('verifyAccess, with real tokens', () => {
  let pair, other, jwk, asked;
  beforeAll(async () => {
    pair = await generateKeyPair('RS256');
    other = await generateKeyPair('RS256');
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  });
  // The team's key set, answered by a stand-in for fetch. A request for any other address is a fault.
  const stubKeys = (team = TEAM) => {
    asked = [];
    vi.stubGlobal('fetch', async url => {
      asked.push(String(url));
      if (String(url) !== `https://${team}/cdn-cgi/access/certs`) return new Response('no', { status: 404 });
      return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  };
  afterEach(() => vi.unstubAllGlobals());
  const sign = ({ key = pair.privateKey, iss = `https://${TEAM}`, aud = AUD, exp = '10m', kid = 'k1', alg = 'RS256' } = {}) =>
    new SignJWT({ email: 'owner@example.com' }).setProtectedHeader({ alg, kid }).setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(key);
  const req = token => new Request('https://row.example/api/admin/metrics', { headers: token ? { 'Cf-Access-Jwt-Assertion': token } : {} });

  it('accepts a token Access signed for this team and application, and reads the team\'s key set at its certs address', async () => {
    const team = 'certs-address.cloudflareaccess.com'; // a team of its own: a key set is kept once read
    stubKeys(team);
    const p = await verifyAccess(req(await sign({ iss: `https://${team}` })), { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: AUD });
    expect(p.email).toBe('owner@example.com');
    expect(asked).toEqual([`https://${team}/cdn-cgi/access/certs`]);
  });
  it('takes the team domain with its https:// and a trailing slash', async () => {
    stubKeys();
    const p = await verifyAccess(req(await sign()), { ACCESS_TEAM_DOMAIN: `https://${TEAM}/`, ACCESS_AUD: AUD });
    expect(p?.email).toBe('owner@example.com');
  });
  it('takes a token whose audience list holds this application among others', async () => {
    stubKeys();
    expect(await verifyAccess(req(await sign({ aud: ['other-app', AUD] })), CONFIGURED)).not.toBeNull();
  });
  it('refuses no header, an empty one and text that is no token', async () => {
    stubKeys();
    expect(await verifyAccess(req(null), CONFIGURED)).toBeNull();
    expect(await verifyAccess(req(''), CONFIGURED)).toBeNull();
    expect(await verifyAccess(req('not-a-token'), CONFIGURED)).toBeNull();
    expect(await verifyAccess(req('a.b.c'), CONFIGURED)).toBeNull();
  });
  it('refuses a token for another application, another team, or one that has expired', async () => {
    stubKeys();
    expect(await verifyAccess(req(await sign({ aud: 'someone-elses-app' })), CONFIGURED)).toBeNull();
    expect(await verifyAccess(req(await sign({ iss: 'https://another-team.cloudflareaccess.com' })), CONFIGURED)).toBeNull();
    expect(await verifyAccess(req(await sign({ exp: Math.floor(NOW / 1000) - 3600 })), CONFIGURED)).toBeNull();
  });
  it('refuses a token signed with a key that is not the team\'s, also under the team\'s key id', async () => {
    stubKeys();
    expect(await verifyAccess(req(await sign({ key: other.privateKey })), CONFIGURED)).toBeNull();
    expect(await verifyAccess(req(await sign({ key: other.privateKey, kid: 'unknown' })), CONFIGURED)).toBeNull();
  });
  it('refuses an unsigned token', async () => {
    stubKeys();
    const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss: `https://${TEAM}`, aud: AUD, exp: Math.floor(NOW / 1000) + 600 })}.`;
    expect(await verifyAccess(req(none), CONFIGURED)).toBeNull();
  });
  it('makes no request, and refuses, while the values are placeholders', async () => {
    stubKeys();
    const token = await sign();
    expect(await verifyAccess(req(token), { ACCESS_TEAM_DOMAIN: 'OWNER-SETS-team.cloudflareaccess.com', ACCESS_AUD: 'OWNER-SETS-aud' })).toBeNull();
    expect(await verifyAccess(req(token), {})).toBeNull();
    expect(asked).toEqual([]);
  });
  it('refuses, and does not throw, when the key set cannot be read', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    expect(await verifyAccess(req(await sign()), { ACCESS_TEAM_DOMAIN: 'unreachable.cloudflareaccess.com', ACCESS_AUD: AUD })).toBeNull();
  });
  it('takes an injected key resolver, which is how a test can stand in for the team', async () => {
    const { createLocalJWKSet } = await import('jose');
    const p = await verifyAccess(req(await sign()), CONFIGURED, { jwks: createLocalJWKSet({ keys: [jwk] }) });
    expect(p?.email).toBe('owner@example.com');
  });

  // The Worker's own fetch(), with the verifier not injected: a signed token reaches the metrics.
  it('lets a signed token through the Worker to the metrics, and refuses the same token for another application', async () => {
    stubKeys();
    const env = { ...CONFIGURED, APP_ENV: 'production', ASSETS, ANALYTICS_SQL: sql([]) };
    const good = await worker.fetch(ask('/api/admin/metrics?days=7', { headers: { 'Cf-Access-Jwt-Assertion': await sign() } }), env);
    expect(good.status).toBe(200);
    const bad = await worker.fetch(ask('/api/admin/metrics?days=7', { headers: { 'Cf-Access-Jwt-Assertion': await sign({ aud: 'someone-elses-app' }) } }), env);
    expect(bad.status).toBe(403);
    expect(env.ANALYTICS_SQL.query).toHaveBeenCalledTimes(1);
  });
});

describe('/api/admin/', () => {
  const body = async r => r.json();

  it('answers 503 not_configured while the Access values are placeholders, and checks nothing else', async () => {
    const deps = allow(), ANALYTICS_SQL = sql([]);
    for (const env of [{}, { ACCESS_TEAM_DOMAIN: 'OWNER-SETS-team.cloudflareaccess.com', ACCESS_AUD: 'OWNER-SETS-aud' }, { ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: 'OWNER-SETS-aud' }, { ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: AUD }]) {
      const r = await handleAdmin(ask(), { ...env, ANALYTICS_SQL }, deps);
      expect(r.status).toBe(503);
      expect(await body(r)).toEqual({ error: 'not_configured', message: 'The metrics page is not set up here.' });
      expect(r.headers.get('Cache-Control')).toBe('no-store');
      expect(r.headers.get('Content-Type')).toBe('application/json');
    }
    expect(deps.verify).not.toHaveBeenCalled();
    expect(ANALYTICS_SQL.query).not.toHaveBeenCalled();
  });

  it('answers 503 for every method and path under it while it is not set up', async () => {
    for (const [path, method] of [['/api/admin/metrics', 'POST'], ['/api/admin/users', 'GET'], ['/api/admin/', 'GET']]) {
      expect((await handleAdmin(ask(path, { method }), {}, allow())).status, `${method} ${path}`).toBe(503);
    }
  });

  it('answers 403 not_allowed with no token, and never reads the counter', async () => {
    const ANALYTICS_SQL = sql([]);
    const none = new Request('https://row.example/api/admin/metrics');
    const r = await handleAdmin(none, { ...CONFIGURED, ANALYTICS_SQL }, { verify: async () => null, now: NOW });
    expect(r.status).toBe(403);
    expect(await body(r)).toEqual({ error: 'not_allowed', message: T.signIn });
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(ANALYTICS_SQL.query).not.toHaveBeenCalled();
  });

  it('answers 403 when the verifier refuses the token, and gives it the request and the environment', async () => {
    const ANALYTICS_SQL = sql([]), env = { ...CONFIGURED, ANALYTICS_SQL }, request = ask();
    const verify = vi.fn(async () => null);
    const r = await handleAdmin(request, env, { verify, now: NOW });
    expect(r.status).toBe(403);
    expect(verify).toHaveBeenCalledWith(request, env);
    expect(ANALYTICS_SQL.query).not.toHaveBeenCalled();
  });

  it('refuses before it routes: no token gets 403 for a wrong method and for a path it does not have', async () => {
    for (const [path, method] of [['/api/admin/metrics', 'POST'], ['/api/admin/metrics', 'OPTIONS'], ['/api/admin/users', 'GET']]) {
      const r = await handleAdmin(ask(path, { method }), { ...CONFIGURED, ANALYTICS_SQL: sql([]) }, { verify: async () => null, now: NOW });
      expect(r.status, `${method} ${path}`).toBe(403);
    }
  });

  it('answers 200 with the shaped body when the verifier passes', async () => {
    const rows = [
      { day: '2026-10-26', slug: 'putney-landing', k: 'first', m: 'standalone', opens: 3 },
      { day: '2026-10-26', slug: 'putney-landing', k: 'return', m: 'browser', opens: 5 },
      { day: '2026-10-20', slug: 'putney-landing', k: 'return', m: 'browser', opens: 4 }
    ];
    const ANALYTICS_SQL = sql(rows);
    const r = await handleAdmin(ask('/api/admin/metrics?days=7'), { ...CONFIGURED, APP_ENV: 'production', ANALYTICS_SQL }, allow());
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(r.headers.get('Content-Type')).toBe('application/json');
    expect(await body(r)).toEqual({
      env: 'production', days: 7, from: '2026-10-20', to: '2026-10-26', truncated: false,
      totals: { opens: 12, firsts: 3, standalone: 3 }, prior: { opens: 0, firsts: 0, standalone: 0 },
      locations: [{ slug: 'putney-landing', opens: 12, series: [4, 0, 0, 0, 0, 0, 8] }]
    });
  });

  it('clamps days to 1 to 30, and reads a missing or odd value as 7', async () => {
    const cases = [['days=0', 1], ['days=99', 30], ['days=-5', 1], ['days=30', 30], ['days=1', 1], ['days=14', 14], ['days=3.9', 3], ['days=abc', 7], ['days=', 7], ['', 7]];
    for (const [qs, days] of cases) {
      const r = await handleAdmin(ask(`/api/admin/metrics?${qs}`), { ...CONFIGURED, ANALYTICS_SQL: sql([]) }, allow());
      expect((await body(r)).days, qs).toBe(days);
      expect(clampDays(new URLSearchParams(qs).get('days')), qs).toBe(days);
    }
  });

  it('reads the window and the one before it, from the first day of the earlier one', async () => {
    for (const [days, start] of [[7, '2026-10-13'], [1, '2026-10-25'], [30, '2026-08-28']]) {
      const ANALYTICS_SQL = sql([]);
      await handleAdmin(ask(`/api/admin/metrics?days=${days}`), { ...CONFIGURED, ANALYTICS_SQL }, allow());
      expect(ANALYTICS_SQL.query).toHaveBeenCalledTimes(1);
      expect(ANALYTICS_SQL.query.mock.calls[0][0].params, `days ${days}`).toEqual({ start: `${start}T00:00:00.000Z` });
    }
  });

  it('names the dataset of the instance: production unless this is a Preview', async () => {
    for (const [env, dataset] of [[{ APP_ENV: 'production' }, 'rowhether_opens'], [{}, 'rowhether_opens'], [{ APP_ENV: 'dev' }, 'rowhether_opens_dev']]) {
      const ANALYTICS_SQL = sql([]);
      await handleAdmin(ask(), { ...CONFIGURED, ...env, ANALYTICS_SQL }, allow());
      const { query } = ANALYTICS_SQL.query.mock.calls[0][0];
      expect(query, JSON.stringify(env)).toContain(`events.analyticsEngine."${dataset}"`);
      expect(query).not.toContain(dataset === 'rowhether_opens' ? 'rowhether_opens_dev' : 'analyticsEngine."rowhether_opens"');
      expect(datasetFor(env)).toBe(dataset);
    }
  });

  it('answers 502 unavailable, with no detail, when the query throws', async () => {
    const ANALYTICS_SQL = { query: vi.fn(async () => { throw Object.assign(new Error('dataset rowhether_opens secret detail'), { retryable: true }); }) };
    const r = await handleAdmin(ask(), { ...CONFIGURED, ANALYTICS_SQL }, allow());
    expect(r.status).toBe(502);
    const said = await body(r);
    expect(said).toEqual({ error: 'unavailable', message: 'Could not do that right now. Try again later.' });
    expect(JSON.stringify(said)).not.toMatch(/secret|rowhether_opens/);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });

  it('answers 502 when the binding gives back something that is not rows', async () => {
    for (const result of [null, {}, { data: 'x' }, { data: null }]) {
      const ANALYTICS_SQL = { query: async () => result };
      expect((await handleAdmin(ask(), { ...CONFIGURED, ANALYTICS_SQL }, allow())).status, JSON.stringify(result)).toBe(502);
    }
  });

  it('answers 503 not_configured when Access is set up and the binding is not', async () => {
    const r = await handleAdmin(ask(), { ...CONFIGURED }, allow());
    expect(r.status).toBe(503);
    expect((await body(r)).error).toBe('not_configured');
  });

  it('answers 405 with Allow: GET for any other method, once Access has passed', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const ANALYTICS_SQL = sql([]);
      const r = await handleAdmin(ask('/api/admin/metrics', { method }), { ...CONFIGURED, ANALYTICS_SQL }, allow());
      expect(r.status, method).toBe(405);
      expect(r.headers.get('Allow'), method).toBe('GET');
      expect(await body(r)).toEqual({ error: 'method_not_allowed', message: 'That method is not allowed here.' });
      expect(ANALYTICS_SQL.query).not.toHaveBeenCalled();
    }
  });

  it('answers 404 not_found for a path it does not have, once Access has passed', async () => {
    for (const path of ['/api/admin/users', '/api/admin/metrics/', '/api/admin/', '/api/admin/metrics/x']) {
      const r = await handleAdmin(ask(path), { ...CONFIGURED, ANALYTICS_SQL: sql([]) }, allow());
      expect(r.status, path).toBe(404);
      expect(await body(r)).toEqual({ error: 'not_found', message: 'Not found.' });
    }
  });

  it('says the same words as the page does for a missing sign-in and for a page not set up', async () => {
    expect((await body(await handleAdmin(ask(), {}, allow()))).message).toBe(T.setup);
    expect((await body(await handleAdmin(ask(), { ...CONFIGURED }, { verify: async () => null, now: NOW }))).message).toBe(T.signIn);
  });
});

describe('the Worker routes /api/admin/', () => {
  const env = extra => ({ ASSETS, ...extra });
  it('hands every path under it to the admin routes, and never to the static assets', async () => {
    ASSETS.fetch.mockClear();
    for (const path of ['/api/admin/metrics', '/api/admin/users', '/api/admin/']) {
      const r = await worker.fetch(ask(path), env({}));
      expect(r.status, path).toBe(503);
      expect((await r.json()).error).toBe('not_configured');
    }
    expect(ASSETS.fetch).not.toHaveBeenCalled();
  });
  it('answers 403 for a request with no token once Access is set up', async () => {
    const r = await worker.fetch(new Request('https://row.example/api/admin/metrics'), env(CONFIGURED));
    expect(r.status).toBe(403);
    expect((await r.json()).error).toBe('not_allowed');
  });
  it('leaves /api/admin and the other /api/ paths as they were: a 404', async () => {
    expect((await worker.fetch(ask('/api/admin'), env(CONFIGURED))).status).toBe(404);
    expect((await worker.fetch(ask('/api/administrator/metrics'), env(CONFIGURED))).status).toBe(404);
    expect((await worker.fetch(ask('/api/nothing'), env(CONFIGURED))).status).toBe(404);
  });
  it('does not touch /api/info, which anyone may ask', async () => {
    expect((await worker.fetch(ask('/api/info'), env({}))).status).toBe(200);
  });
});

describe('the metrics, from the counter\'s rows', () => {
  const row = (day, slug, k, m, opens) => ({ day, slug, k, m, opens });
  const win = (rows, days = 7) => summarize(rows, { days, now: NOW });

  it('counts a window of days ending today (UTC) and the same number of days before it', () => {
    const s = win([
      row('2026-10-26', 'a-lake', 'first', 'browser', 2), row('2026-10-20', 'a-lake', 'return', 'standalone', 3),
      row('2026-10-19', 'a-lake', 'first', 'browser', 40), row('2026-10-13', 'a-lake', 'return', 'standalone', 7),
      row('2026-10-12', 'a-lake', 'return', 'browser', 100), row('2026-10-27', 'a-lake', 'return', 'browser', 100)
    ]);
    expect(s).toMatchObject({ days: 7, from: '2026-10-20', to: '2026-10-26' });
    expect(s.totals).toEqual({ opens: 5, firsts: 2, standalone: 3 });
    expect(s.prior).toEqual({ opens: 47, firsts: 40, standalone: 7 });
  });

  it('gives each location its opens and a count for every day of the window, oldest first', () => {
    const s = win([row('2026-10-20', 'a-lake', 'return', 'browser', 1), row('2026-10-22', 'a-lake', 'return', 'browser', 2), row('2026-10-26', 'a-lake', 'first', 'browser', 4), row('2026-10-22', 'a-lake', 'first', 'standalone', 1)]);
    expect(s.locations).toEqual([{ slug: 'a-lake', opens: 8, series: [1, 0, 3, 0, 0, 0, 4] }]);
  });

  it('adds the rows of one day and location that differ in first or return and in home screen or browser', () => {
    const s = win([row('2026-10-26', 'a-lake', 'first', 'standalone', 1), row('2026-10-26', 'a-lake', 'first', 'browser', 2), row('2026-10-26', 'a-lake', 'return', 'standalone', 4), row('2026-10-26', 'a-lake', 'return', 'browser', 8)], 1);
    expect(s.totals).toEqual({ opens: 15, firsts: 3, standalone: 5 });
    expect(s.locations).toEqual([{ slug: 'a-lake', opens: 15, series: [15] }]);
  });

  it('lists the top 20 by opens, ties by name, and counts the rest in the totals', () => {
    const rows = Array.from({ length: 25 }, (_, i) => row('2026-10-26', `place-${String(i).padStart(2, '0')}`, 'return', 'browser', 100 - i));
    rows.push(row('2026-10-26', 'aaa-tie', 'return', 'browser', 100 - 24), row('2026-10-26', 'none', 'return', 'browser', 1000));
    const s = win(rows, 7);
    expect(s.locations).toHaveLength(20);
    expect(s.locations[0].slug).toBe('none');
    expect(s.locations.map(l => l.opens)).toEqual([...s.locations.map(l => l.opens)].sort((a, b) => b - a));
    expect(s.locations.at(-1)).toMatchObject({ slug: 'place-18', opens: 82 });
    expect(s.totals.opens).toBe(rows.reduce((n, r) => n + r.opens, 0));
    const tie = win([row('2026-10-26', 'zed', 'return', 'browser', 5), row('2026-10-26', 'abc', 'return', 'browser', 5)]);
    expect(tie.locations.map(l => l.slug)).toEqual(['abc', 'zed']);
  });

  it('counts a location that has opens only in the week before, in the prior totals and not in the list', () => {
    const s = win([row('2026-10-15', 'old-place', 'return', 'browser', 9)]);
    expect(s.prior.opens).toBe(9);
    expect(s.totals.opens).toBe(0);
    expect(s.locations).toEqual([]);
  });

  it('reads counts that come as text, as a database does for a 64 bit integer', () => {
    const s = win([row('2026-10-26', 'a-lake', 'first', 'browser', '12'), row('2026-10-26', 'a-lake', 'return', 'browser', '8')]);
    expect(s.totals).toEqual({ opens: 20, firsts: 12, standalone: 0 });
    expect(s.locations[0].opens).toBe(20);
  });

  it('ignores a row it cannot read: no day in the window, a bad count, no name', () => {
    const s = win([
      row('2026-10-26', 'a-lake', 'return', 'browser', 'many'), row('2026-10-26', 'a-lake', 'return', 'browser', -3), row('2026-10-26', 'a-lake', 'return', 'browser', 0),
      row('2026-10-26', undefined, 'return', 'browser', 5), row('2026-10-26', 7, 'return', 'browser', 5), row('yesterday', 'a-lake', 'return', 'browser', 5),
      row(undefined, 'a-lake', 'return', 'browser', 5), null, row('2026-10-26', 'a-lake', 'return', 'browser', 1)
    ]);
    expect(s.totals).toEqual({ opens: 1, firsts: 0, standalone: 0 });
  });

  it('takes the day as the UTC day, so a clock near midnight UTC puts today where the data is', () => {
    const late = Date.UTC(2026, 9, 26, 23, 59), early = Date.UTC(2026, 9, 27, 0, 1);
    expect(summarize([], { days: 7, now: late }).to).toBe('2026-10-26');
    expect(summarize([], { days: 7, now: early }).to).toBe('2026-10-27');
    expect(summarize([], { days: 7, now: early }).from).toBe('2026-10-21');
  });

  it('crosses a month, a year and a leap day', () => {
    expect(summarize([], { days: 7, now: Date.UTC(2026, 0, 3, 12) }).from).toBe('2025-12-28');
    expect(summarize([row('2025-12-26', 'a-lake', 'first', 'browser', 1)], { days: 7, now: Date.UTC(2026, 0, 3, 12) }).prior.opens).toBe(1);
    expect(summarize([], { days: 3, now: Date.UTC(2028, 2, 2, 12) }).from).toBe('2028-02-29');
  });

  it('says so when the query came back full, so the numbers may be low', async () => {
    const full = Array.from({ length: 10000 }, (_, i) => row('2026-10-26', `p${i}`, 'return', 'browser', 1));
    expect((await readMetrics({ ANALYTICS_SQL: sql(full) }, { days: 7, now: NOW })).truncated).toBe(true);
    expect((await readMetrics({ ANALYTICS_SQL: sql(full.slice(1)) }, { days: 7, now: NOW })).truncated).toBe(false);
  });
});

describe('the metrics query', () => {
  const q = (env = {}, days = 7) => metricsQuery(env, { days, now: NOW });

  it('reads the instance\'s dataset by the name the Analytics SQL binding takes', () => {
    expect(q().query).toContain('FROM events.analyticsEngine."rowhether_opens"');
    expect(q({ APP_ENV: 'dev' }).query).toContain('FROM events.analyticsEngine."rowhether_opens_dev"');
  });
  it('counts with the sample interval, by UTC day, location, first or return, and home screen or browser', () => {
    const { query } = q();
    expect(query).toContain('SUM(_sample_interval)');
    expect(query).toContain("formatDateTime(timestamp, '%Y-%m-%d', 'Etc/UTC')");
    expect(query).toContain('index1 AS slug');
    expect(query).toContain('blob2 AS k');
    expect(query).toContain('blob3 AS m');
    expect(query).toMatch(/GROUP BY day, slug, k, m/);
    expect(query).not.toMatch(/COUNT\(/i);
  });
  it('holds the start as a parameter, and no tenancy and no FORMAT, which the binding refuses', () => {
    const { query, params } = q();
    expect(query).toContain('timestamp >= $start');
    expect(params).toEqual({ start: '2026-10-13T00:00:00.000Z' });
    expect(query).not.toMatch(/accountTag|zoneTag|\bFORMAT\b/);
    expect(query).not.toContain('2026-10');
  });
  it('is one SELECT, bounded', () => {
    const { query } = q();
    expect(query.match(/\bSELECT\b/g)).toHaveLength(1);
    expect(query).not.toContain(';');
    expect(query).toMatch(/LIMIT 10000$/);
  });
});

describe('the counter in wrangler.jsonc, for the Metrics tab', () => {
  const wrangler = JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  it('reads the dataset each instance writes', () => {
    expect(datasetFor({ APP_ENV: 'production' })).toBe(wrangler.analytics_engine_datasets[0].dataset);
    expect(datasetFor({ APP_ENV: 'dev' })).toBe(wrangler.previews.analytics_engine_datasets[0].dataset);
    expect(wrangler.vars.APP_ENV).toBe('production');
    expect(wrangler.previews.vars.APP_ENV).toBe('dev');
  });
  it('has the Access values in both blocks, as placeholders the owner replaces', () => {
    for (const vars of [wrangler.vars, wrangler.previews.vars]) {
      expect(vars.ACCESS_TEAM_DOMAIN).toMatch(/^OWNER-SETS-/);
      expect(vars.ACCESS_AUD).toMatch(/^OWNER-SETS-/);
      expect(accessConfigured(vars)).toBe(false);
    }
    expect(wrangler.vars.ACCESS_AUD).toBe('OWNER-SETS-aud');
    expect(wrangler.previews.vars.ACCESS_AUD).toBe('OWNER-SETS-preview-aud');
    expect(wrangler.vars.ACCESS_AUD).not.toBe(wrangler.previews.vars.ACCESS_AUD);
  });
  it('pins jose exactly, as a dependency of the Worker', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.dependencies.jose).toBe('6.2.12');
  });
});
