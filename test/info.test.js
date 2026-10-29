import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import worker, { info } from '../worker/index.js';
import { installFakeDom, uninstallFakeDom } from './helpers/fakedom.js';

// The open counter (P1.16, 07 14.3): GET /api/info?loc=&k=&m= answers as it always has and
// writes one Analytics Engine point for the start. These run the Worker's own fetch().
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BODY = { env: 'production', reports: false };
const ASSETS = { fetch: vi.fn() };
const ask = (qs, env = {}, init) => worker.fetch(new Request(`https://row.example/api/info${qs}`, init), { ASSETS, ...env });
const opens = () => { const writeDataPoint = vi.fn(); return { OPENS: { writeDataPoint }, writeDataPoint }; };
const GOOD = '?loc=putney-landing&k=first&m=standalone';

describe('the open counter point', () => {
  it('is one point with the slug, the instance, first or return, and home screen or browser', async () => {
    const { OPENS, writeDataPoint } = opens();
    const r = await ask(GOOD, { OPENS });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(BODY);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(writeDataPoint).toHaveBeenCalledWith({ indexes: ['putney-landing'], blobs: ['production', 'first', 'standalone'], doubles: [1] });
  });

  it('takes every slug the app can show, and none for the picker and the not found page', async () => {
    for (const loc of ['none', 'lake-quinsigamond', 'abc', 'a'.repeat(48)]) {
      const { OPENS, writeDataPoint } = opens();
      await ask(`?loc=${loc}&k=return&m=browser`, { OPENS });
      expect(writeDataPoint, loc).toHaveBeenCalledWith({ indexes: [loc], blobs: ['production', 'return', 'browser'], doubles: [1] });
    }
  });

  it('takes both words of k and of m', async () => {
    for (const k of ['first', 'return']) for (const m of ['standalone', 'browser']) {
      const { OPENS, writeDataPoint } = opens();
      await ask(`?loc=putney-landing&k=${k}&m=${m}`, { OPENS });
      expect(writeDataPoint.mock.calls[0][0].blobs).toEqual(['production', k, m]);
    }
  });

  it('names the instance: production when APP_ENV is unset or says so, dev on a Preview', async () => {
    for (const [env, blob] of [[{}, 'production'], [{ APP_ENV: 'production' }, 'production'], [{ APP_ENV: 'dev' }, 'dev']]) {
      const { OPENS, writeDataPoint } = opens();
      const r = await ask(GOOD, { ...env, OPENS });
      expect((await r.json()).env).toBe(blob);
      expect(writeDataPoint.mock.calls[0][0].blobs[0]).toBe(blob);
    }
  });

  // A missing or bad parameter writes nothing, and the answer is the same as for a good one.
  describe('is not written', () => {
    const cases = {
      'with no parameters': '',
      'with no loc': '?k=first&m=browser',
      'with no k': '?loc=putney-landing&m=browser',
      'with no m': '?loc=putney-landing&k=first',
      'for an empty loc': '?loc=&k=first&m=browser',
      'for a slug in capitals (Putney)': '?loc=Putney&k=first&m=browser',
      'for a slug with a space or a slash': '?loc=put%20ney&k=first&m=browser',
      'for a path': '?loc=putney-landing/wind&k=first&m=browser',
      'for a slug that is too short': '?loc=ab&k=first&m=browser',
      'for a slug that is too long': `?loc=${'a'.repeat(49)}&k=first&m=browser`,
      'for a reserved word (privacy)': '?loc=privacy&k=first&m=browser',
      'for a third value of k': '?loc=putney-landing&k=new&m=browser',
      'for a k in capitals': '?loc=putney-landing&k=First&m=browser',
      'for a third value of m': '?loc=putney-landing&k=first&m=app',
      'for an m in capitals': '?loc=putney-landing&k=first&m=Browser'
    };
    for (const [what, qs] of Object.entries(cases)) {
      it(what, async () => {
        const { OPENS, writeDataPoint } = opens();
        const r = await ask(qs, { OPENS });
        expect(r.status).toBe(200);
        expect(await r.json()).toEqual(BODY);
        expect(writeDataPoint).not.toHaveBeenCalled();
      });
    }
    it('with no OPENS binding', async () => {
      const r = await ask(GOOD, {});
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual(BODY);
    });
    it('for a POST, which is refused', async () => {
      const { OPENS, writeDataPoint } = opens();
      const r = await ask(GOOD, { OPENS }, { method: 'POST' });
      expect(r.status).toBe(405);
      expect(r.headers.get('Allow')).toBe('GET');
      expect(writeDataPoint).not.toHaveBeenCalled();
    });
  });

  it('is skipped quietly when writing it throws: the answer is the same', async () => {
    const OPENS = { writeDataPoint: vi.fn(() => { throw new Error('over the limit'); }) };
    const r = await ask(GOOD, { OPENS });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(BODY);
    expect(OPENS.writeDataPoint).toHaveBeenCalledTimes(1);
  });

  // 07 14.3: no IP address, user agent, country, account or session. The point is made from
  // the three parameters and the instance name, whatever else the request carries.
  it('holds nothing of the request but the three parameters and the instance', async () => {
    const { OPENS, writeDataPoint } = opens();
    const headers = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6) Safari/604.1', 'CF-Connecting-IP': '203.0.113.9',
      'X-Forwarded-For': '198.51.100.7', 'CF-IPCountry': 'NZ', Referer: 'https://rowhether.com/putney-landing#wind',
      Cookie: 'sid=abc123', Authorization: 'Bearer secret-token', 'Accept-Language': 'de-DE'
    };
    await ask(`${GOOD}&ip=203.0.113.9&user=ann&utm_source=mail`, { OPENS, APP_ENV: 'dev' }, { headers });
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    const point = writeDataPoint.mock.calls[0][0];
    expect(point).toEqual({ indexes: ['putney-landing'], blobs: ['dev', 'first', 'standalone'], doubles: [1] });
    expect(Object.keys(point).sort()).toEqual(['blobs', 'doubles', 'indexes']);
    const text = JSON.stringify(point);
    for (const secret of ['Mozilla', 'iPhone', '203.0.113.9', '198.51.100.7', 'NZ', 'sid=abc123', 'secret-token', 'de-DE', 'ann', 'mail', 'utm']) {
      expect(text, secret).not.toContain(secret);
    }
  });

  it('counts the first value of a repeated parameter, once', async () => {
    const { OPENS, writeDataPoint } = opens();
    await ask('?loc=putney-landing&loc=Bad&k=first&k=return&m=browser&m=standalone', { OPENS });
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(writeDataPoint.mock.calls[0][0]).toEqual({ indexes: ['putney-landing'], blobs: ['production', 'first', 'browser'], doubles: [1] });
  });

  it('is written by info() too, and info() with no address still answers as before', async () => {
    const { OPENS, writeDataPoint } = opens();
    expect(await info({ OPENS }, new URL(`https://row.example/api/info${GOOD}`)).json()).toEqual(BODY);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(await info({ OPENS }).json()).toEqual(BODY);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
  });
});

// Settings of the host that nothing else checks: a deploy that lost a binding would still build.
describe('the counter in wrangler.jsonc', () => {
  const wrangler = JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));

  it('binds OPENS to rowhether_opens, and to rowhether_opens_dev on Previews', () => {
    expect(wrangler.analytics_engine_datasets).toEqual([{ binding: 'OPENS', dataset: 'rowhether_opens' }]);
    expect(wrangler.previews.analytics_engine_datasets).toEqual([{ binding: 'OPENS', dataset: 'rowhether_opens_dev' }]);
  });

  it('keeps the dev dataset apart from the production one', () => {
    expect(wrangler.previews.analytics_engine_datasets[0].dataset).not.toBe(wrangler.analytics_engine_datasets[0].dataset);
  });

  it('binds ANALYTICS_SQL in both, for the Metrics tab', () => {
    expect(wrangler.analytics).toEqual({ binding: 'ANALYTICS_SQL' });
    expect(wrangler.previews.analytics).toEqual({ binding: 'ANALYTICS_SQL' });
  });
});

// The page's side (src/info.js): the one request that carries the counter's three words.
describe('loadInfo', () => {
  let state, load, dom, asked;
  // What the host answers: a Response, or an error for a request that never arrives.
  let answer;
  beforeEach(async () => {
    dom = installFakeDom();
    asked = [];
    answer = () => new Response(JSON.stringify({ env: 'production', reports: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    vi.stubGlobal('fetch', async (url, init) => { asked.push([url, init]); const a = answer(); if (a instanceof Error) throw a; return a; });
    state = await import('../src/state.js');
    ({ loadInfo: load } = await import('../src/info.js'));
    state.app.info = null;
  });
  afterEach(() => { uninstallFakeDom(); vi.unstubAllGlobals(); });
  const query = () => new URL(asked[0][0], 'https://row.example').searchParams;

  it('asks /api/info once, with the location, first or return, and browser', async () => {
    await load('putney-landing', true);
    expect(asked).toHaveLength(1);
    expect(asked[0][0]).toBe('/api/info?loc=putney-landing&k=first&m=browser');
    asked.length = 0;
    await load('lake-natoma', false);
    expect(asked[0][0]).toBe('/api/info?loc=lake-natoma&k=return&m=browser');
  });

  it('says none for the picker page and the not found page', async () => {
    await load('none', true);
    expect(asked[0][0]).toBe('/api/info?loc=none&k=first&m=browser');
  });

  it('says standalone when the app runs from the home screen, by the display mode or by iOS', async () => {
    vi.stubGlobal('window', { matchMedia: q => ({ matches: /display-mode:\s*standalone/.test(q) }) });
    await load('putney-landing', false);
    expect(asked[0][0]).toBe('/api/info?loc=putney-landing&k=return&m=standalone');
    asked.length = 0;
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal('navigator', { standalone: true });
    await load('putney-landing', false);
    expect(query().get('m')).toBe('standalone');
    asked.length = 0;
    vi.stubGlobal('navigator', { standalone: false });
    await load('putney-landing', false);
    expect(query().get('m')).toBe('browser');
  });

  it('sends nothing else: three words in the address, no body, no headers, no cookies', async () => {
    await load('putney-landing', true);
    expect([...query().keys()]).toEqual(['loc', 'k', 'm']);
    expect(asked[0][1]).toEqual({ cache: 'no-store' });
  });

  it('writes a slug into the address as one word, whatever it holds', async () => {
    await load('a&k=return#x y', true);
    expect(query().getAll('k')).toEqual(['first']);
    expect(query().get('loc')).toBe('a&k=return#x y');
    expect(asked[0][0]).not.toMatch(/[ #]/);
  });

  it('keeps what the Worker says, and shows the instance label only when it is not production', async () => {
    answer = () => new Response(JSON.stringify({ env: 'dev', reports: true }), { status: 200 });
    await load('putney-landing', true);
    expect(state.app.info).toEqual({ env: 'dev', reports: true });
    expect(dom.el('envBadge').hidden).toBe(false);
    expect(dom.el('envBadge').textContent).toBe('Dev');
    answer = () => new Response(JSON.stringify({ env: 'production', reports: false }), { status: 200 });
    await load('putney-landing', false);
    expect(state.app.info).toEqual({ env: 'production', reports: false });
    expect(dom.el('envBadge').hidden).toBe(true);
    expect(dom.el('envBadge').textContent).toBe('Production');
  });

  it('leaves no information and no label when there is no /api: a 404, a page that is not JSON, or no connection', async () => {
    for (const a of [() => new Response('Not found', { status: 404 }), () => new Response('<!doctype html>', { status: 200 }), () => new TypeError('Failed to fetch')]) {
      answer = a;
      state.app.info = { env: 'dev' };
      await load('putney-landing', true);
      expect(state.app.info).toBeNull();
      expect(dom.el('envBadge').hidden).toBe(true);
      expect(dom.el('envBadge').textContent).toBe('');
    }
  });
});
