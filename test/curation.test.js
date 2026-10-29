// The curation scripts a person runs by hand (phase 1 plan P1.19): the request they all
// make (agent.mjs), the bearing between two points (bearing.mjs) and the live source
// check (check-sources.mjs). No test here reaches the network.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { USER_AGENT, TIMEOUT_MS, get, getJSON } from '../scripts/locations/agent.mjs';
import { bearing, distanceM, bearingReport, pointsFrom } from '../scripts/locations/bearing.mjs';
import { ORIGIN, corsOk, shape, holdsNothing, checkBinding, checkLocation, resultLines, summary, pick, run } from '../scripts/check-sources.mjs';
import { collectLocations } from '../scripts/locations/plugin.mjs';
import { resolveLocation } from '../src/location.js';
import { bindingsFor, SLOT_ORDER } from '../src/sources/index.js';

afterEach(() => { vi.useRealTimers(); });

// A fetch that answers with a status, headers and a body.
const reply = (status, body, headers = {}) => vi.fn(async () => ({ status, headers: new Headers(headers), text: async () => typeof body === 'string' ? body : JSON.stringify(body) }));

describe('agent.mjs', () => {
  it('names the app and leaves the owner the contact address to fill in (README row 14)', () => {
    expect(USER_AGENT).toBe('RoWhether/1.0 (+https://rowhether.com; OWNER-SETS-contact)');
  });

  it('sends the User-Agent, with the headers it is given beside it', async () => {
    const f = reply(200, '{}');
    await get('https://example.test/a', { headers: { Origin: 'https://rowhether.com' }, fetch: f });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://example.test/a');
    expect(init.headers).toEqual({ 'User-Agent': USER_AGENT, Origin: 'https://rowhether.com' });
  });

  it('returns the status, the headers and the body text, whatever the status', async () => {
    const r = await get('https://example.test/a', { fetch: reply(503, 'down', { 'access-control-allow-origin': '*' }) });
    expect(r.status).toBe(503);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(r.text).toBe('down');
  });

  it('gives up after 20 seconds with no answer, and says so', async () => {
    vi.useFakeTimers();
    expect(TIMEOUT_MS).toBe(20000);
    const hang = vi.fn((url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
    const p = get('https://example.test/slow', { fetch: hang });
    const settled = p.then(() => 'answered', e => e.message);
    await vi.advanceTimersByTimeAsync(19999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await settled).toBe('no answer in 20 seconds');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the timer running while the body arrives', async () => {
    vi.useFakeTimers();
    const slowBody = vi.fn(async (url, { signal }) => ({ status: 200, headers: new Headers(), text: () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) }));
    const settled = get('https://example.test/slow-body', { fetch: slowBody }).then(() => 'answered', e => e.message);
    await vi.advanceTimersByTimeAsync(20000);
    expect(await settled).toBe('no answer in 20 seconds');
  });

  it('clears its timer when the answer comes, and passes another error on as it is', async () => {
    vi.useFakeTimers();
    await get('https://example.test/a', { fetch: reply(200, '{}') });
    expect(vi.getTimerCount()).toBe(0);
    await expect(get('https://example.test/a', { fetch: vi.fn(async () => { throw new TypeError('fetch failed'); }) })).rejects.toThrow('fetch failed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reads JSON, and refuses a status that is not 200 with the status', async () => {
    expect(await getJSON('https://example.test/a', { fetch: reply(200, { a: 1 }) })).toEqual({ a: 1 });
    await expect(getJSON('https://example.test/a', { fetch: reply(404, 'nope') })).rejects.toThrow('HTTP 404');
  });
});

describe('bearing.mjs', () => {
  // 01 6.1, verified live 2026-10-17: the Putney dock to three places.
  const DOCK = [42.9607, -72.5219];
  const cases = [
    ['the North Walpole gauge', [43.126189, -72.436755], 20.6, 19659],
    ['Keene airport', [42.9, -72.26667], 107.9, 21848],
    ['the Northfield gauge', [42.683333, -72.471944], 172.5, 31110]
  ];

  it.each(cases)('gives the bearing and the distance from the dock to %s', (name, to, deg, m) => {
    expect(bearing(...DOCK, ...to)).toBeCloseTo(deg, 1);
    expect(Math.abs(distanceM(...DOCK, ...to) - m)).toBeLessThan(1);
  });

  it('measures from the first point to the second: back is the other way, a little off 180 because meridians meet', () => {
    const to = cases[0][1];
    expect(bearing(...to, ...DOCK)).toBeCloseTo(200.6, 1);
    expect(bearing(10, 10, 11, 10)).toBeCloseTo(0, 6);
    expect(bearing(11, 10, 10, 10)).toBeCloseTo(180, 6);
    expect(distanceM(...DOCK, ...to)).toBeCloseTo(distanceM(...to, ...DOCK), 6);
  });

  it('is 0 to the north, 90 to the east, 180 to the south and 270 to the west, and always below 360', () => {
    expect(bearing(10, 10, 11, 10)).toBeCloseTo(0, 6);
    expect(bearing(0, 10, 0, 11)).toBeCloseTo(90, 6);
    expect(bearing(10, 10, 9, 10)).toBeCloseTo(180, 6);
    expect(bearing(0, 10, 0, 9)).toBeCloseTo(270, 6);
    expect(bearing(10, 10, 11, 9.999)).toBeLessThan(360);
    expect(bearing(10, 10, 11, 9.999)).toBeGreaterThan(359);
  });

  it('measures a degree of latitude as 111.2 km, and a point from itself as nothing', () => {
    expect(distanceM(0, 0, 1, 0)).toBeCloseTo(111194.9, 0);
    expect(distanceM(42.9607, -72.5219, 42.9607, -72.5219)).toBe(0);
  });

  it('crosses the antimeridian the short way', () => {
    expect(bearing(0, 179.5, 0, -179.5)).toBeCloseTo(90, 6);
    expect(distanceM(0, 179.5, 0, -179.5)).toBeCloseTo(111194.9, 0);
  });

  it('reports the bearing, the distance in metres and miles, and the reverse bearing', () => {
    expect(bearingReport(...DOCK, ...cases[0][1])).toBe('Bearing 20.6 degrees (NNE). Distance 19,659 m (12.2 mi).\nBack from the second point: 200.6 degrees.');
  });

  it('reads four numbers, and refuses anything else with the usage', () => {
    expect(pointsFrom(['42.9607', '-72.5219', '43.126189', '-72.436755'])).toEqual([42.9607, -72.5219, 43.126189, -72.436755]);
    for (const bad of [[], ['1', '2', '3'], ['1', '2', '3', '4', '5'], ['a', '2', '3', '4'], ['91', '0', '0', '0'], ['0', '181', '0', '0'], ['0', '0', '-90.5', '0'], ['', '0', '0', '0']]) {
      expect(() => pointsFrom(bad)).toThrow(/Usage: node scripts\/locations\/bearing.mjs/);
    }
  });
});

describe('check-sources.mjs', () => {
  const binding = (parse, url = 'https://example.test/x') => ({ slot: 'obs', adapter: 'test', url, parse });
  const ok = { 'access-control-allow-origin': '*' };

  it('asks as the app does, from https://rowhether.com', () => {
    expect(ORIGIN).toBe('https://rowhether.com');
  });

  it('accepts a CORS header of * or of our own origin, and nothing else', () => {
    expect(corsOk(new Headers({ 'access-control-allow-origin': '*' }))).toBe(true);
    expect(corsOk(new Headers({ 'access-control-allow-origin': 'https://rowhether.com' }))).toBe(true);
    expect(corsOk(new Headers({ 'access-control-allow-origin': 'https://other.example' }))).toBe(false);
    expect(corsOk(new Headers())).toBe(false);
  });

  it('describes what a parser gave', () => {
    expect(shape([1, 2, 3])).toBe('3 items');
    expect(shape([1])).toBe('1 item');
    expect(shape([])).toBe('0 items');
    expect(shape({ flow: { v: 1 }, waterC: null, pts: [1, 2] })).toBe('flow, waterC none, pts 2');
    expect(shape({})).toBe('nothing');
  });

  it('passes an answer that is 200, allowed and parsed, and sends the Origin and the User-Agent', async () => {
    const f = reply(200, { features: [1, 2] }, ok);
    const r = await checkBinding(binding(d => d.features), { fetch: f });
    expect(r).toMatchObject({ slot: 'obs', ok: true, status: 200, cors: '*', note: '2 items' });
    expect(f.mock.calls[0][1].headers).toEqual({ 'User-Agent': USER_AGENT, Origin: 'https://rowhether.com' });
  });

  it('fails a status that is not 200, and still says what the CORS header was', async () => {
    const r = await checkBinding(binding(d => d), { fetch: reply(503, 'busy', ok) });
    expect(r).toMatchObject({ ok: false, status: 503, cors: '*', note: 'HTTP 503' });
  });

  it('fails any status but 200, an empty 204 included', async () => {
    for (const status of [204, 301, 404, 429]) {
      expect(await checkBinding(binding(d => d), { fetch: reply(status, '', ok) })).toMatchObject({ ok: false, status, note: `HTTP ${status}` });
    }
  });

  it('tells an answer that holds nothing from one that holds something', () => {
    // The parsers answer an empty list, `{}`, or an object of empty lists and nulls.
    for (const v of [[], {}, { flow: null, waterC: null }, { issued: 1, pts: [] }, { ids: [], hours: [] }, { series: [], events: [] }, null, undefined]) expect(holdsNothing(v)).toBe(true);
    for (const v of [[0], [{}], { flow: { v: 1, t: 2 } }, { waterC: { v: 3, t: 4 } }, { issued: 1, pts: [{}] }, { series: [{}], events: [] }, { t: 1, gust: null }, { hourly: { time: [] } }, 0, '']) expect(holdsNothing(v)).toBe(false);
  });

  it('fails a 200 that holds nothing, which a wrong gauge gets, and says so', async () => {
    const shapes = { river: () => ({}), flowFcst: () => ({ issued: 1, pts: [] }), tide: () => ({ series: [], events: [] }), models: () => ({ ids: [], hours: [] }) };
    // Every slot but alerts, each with the shape its own parser gives, else an empty list.
    for (const slot of SLOT_ORDER.filter(s => s !== 'alerts')) {
      const r = await checkBinding({ ...binding(shapes[slot] || (() => [])), slot }, { fetch: reply(200, { features: [] }, ok) });
      expect(r).toMatchObject({ slot, ok: false, status: 200, cors: '*', note: 'the answer holds nothing' });
    }
  });

  it('passes no alerts, the usual day, and says there are none', async () => {
    const r = await checkBinding({ ...binding(d => d.features), slot: 'alerts' }, { fetch: reply(200, { features: [] }, ok) });
    expect(r).toMatchObject({ slot: 'alerts', ok: true, note: '0 items' });
  });

  it('names every problem of an answer, the CORS header and the emptiness together', async () => {
    const r = await checkBinding(binding(() => []), { fetch: reply(200, {}) });
    expect(r.ok).toBe(false);
    expect(r.note).toMatch(/access-control-allow-origin.*; the answer holds nothing$/);
  });

  it('fails an answer with no CORS header, because the browser would refuse it', async () => {
    const r = await checkBinding(binding(d => [d]), { fetch: reply(200, {}) });
    expect(r).toMatchObject({ ok: false, status: 200, cors: null });
    expect(r.note).toMatch(/access-control-allow-origin/);
  });

  it('fails an answer the parser does not accept, with its message', async () => {
    const r = await checkBinding(binding(() => { throw new Error('Not a tide forecast'); }), { fetch: reply(200, {}, ok) });
    expect(r).toMatchObject({ ok: false, status: 200, note: 'parser: Not a tide forecast' });
  });

  it('fails an answer that is not JSON', async () => {
    const r = await checkBinding(binding(d => d), { fetch: reply(200, '<html>', ok) });
    expect(r).toMatchObject({ ok: false, status: 200 });
    expect(r.note).toMatch(/^not JSON/);
  });

  it('reports a request that got no answer as a failure and carries on', async () => {
    const r = await checkBinding(binding(d => d), { fetch: vi.fn(async () => { throw new TypeError('fetch failed'); }) });
    expect(r).toMatchObject({ slot: 'obs', ok: false, status: null, note: 'fetch failed' });
  });

  it('checks every binding of a location, in its order, each on its own', async () => {
    const loc = { slug: 'x' };
    const bs = [binding(d => d, 'https://example.test/1'), binding(() => { throw new Error('bad'); }, 'https://example.test/2'), binding(d => d, 'https://example.test/3')];
    bs[0].slot = 'wx'; bs[1].slot = 'alerts'; bs[2].slot = 'obs';
    const f = vi.fn(async url => url.endsWith('/3') ? { status: 500, headers: new Headers(), text: async () => '' } : { status: 200, headers: new Headers(ok), text: async () => '[1]' });
    const rs = await checkLocation(loc, { fetch: f, bindings: () => bs });
    expect(rs.map(r => [r.slot, r.ok])).toEqual([['wx', true], ['alerts', false], ['obs', false]]);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('prints a line for each binding, and the URL under one that failed', () => {
    const lines = resultLines('putney-landing', [
      { slot: 'wx', url: 'https://example.test/wx', ok: true, status: 200, cors: '*', note: 'current, hourly' },
      { slot: 'obs', url: 'https://example.test/obs', ok: false, status: null, cors: null, note: 'no answer in 20 seconds' }
    ]);
    expect(lines[0]).toBe('putney-landing');
    expect(lines[1]).toMatch(/^ {2}wx +200 +cors \* +ok +current, hourly$/);
    expect(lines[2]).toMatch(/^ {2}obs +none +cors none +FAIL +no answer in 20 seconds$/);
    expect(lines[3]).toBe('    https://example.test/obs');
    expect(lines).toHaveLength(4);
  });

  it('sums up, and says how many failed', () => {
    expect(summary([{ ok: true }, { ok: true }, { ok: false }])).toBe('3 requests: 2 ok, 1 failed.');
    expect(summary([{ ok: true }])).toBe('1 request: 1 ok, 0 failed.');
  });

  it('picks the records named on the command line, or all of them, and refuses a name that is not one', () => {
    const list = [{ rec: { slug: 'a' } }, { rec: { slug: 'b' } }, { rec: { slug: 'c' } }];
    expect(pick(list, []).map(x => x.rec.slug)).toEqual(['a', 'b', 'c']);
    expect(pick(list, ['c', 'a']).map(x => x.rec.slug)).toEqual(['a', 'c']);
    expect(() => pick(list, ['a', 'zzz'])).toThrow(/zzz/);
  });

  it('has a binding for each source of every record in data/, with the URL built', () => {
    const list = collectLocations();
    expect(list.length).toBeGreaterThanOrEqual(7);
    for (const { rec, waterway } of list) {
      const bs = bindingsFor(resolveLocation(rec, { waterway }));
      expect(bs.length).toBeGreaterThanOrEqual(3);
      for (const b of bs) expect(b.url).toMatch(/^https:\/\//);
    }
  });
});

describe('check-sources.mjs, run', () => {
  const good = { slot: 'wx', url: 'https://example.test/wx', ok: true, status: 200, cors: '*', note: 'x' };
  const bad = { slot: 'obs', url: 'https://example.test/obs', ok: false, status: 503, cors: '*', note: 'HTTP 503' };

  it('prints each record and a summary, and gives 0 when every binding passed', async () => {
    const log = vi.fn(), check = vi.fn(async () => [good, good]);
    expect(await run(['putney-landing'], { check, log })).toBe(0);
    expect(check).toHaveBeenCalledTimes(1);
    expect(check.mock.calls[0][0]).toMatchObject({ slug: 'putney-landing' });
    expect(log.mock.calls[0][0].split('\n')[0]).toBe('putney-landing');
    expect(log.mock.calls.at(-1)[0]).toBe('\n2 requests: 2 ok, 0 failed.');
  });

  it('gives 1 when any binding of any record failed, and still checks every record', async () => {
    const log = vi.fn(), check = vi.fn(async loc => (loc.slug === 'putney-landing' ? [bad] : [good]));
    expect(await run(['hanover-boathouse', 'putney-landing', 'lake-natoma'], { check, log })).toBe(1);
    expect(check).toHaveBeenCalledTimes(3);
    expect(log.mock.calls.at(-1)[0]).toBe('\n3 requests: 2 ok, 1 failed.');
  });

  it('checks every record in data/ when none is named', async () => {
    const check = vi.fn(async () => [good]);
    await run([], { check, log: () => {} });
    expect(check).toHaveBeenCalledTimes(collectLocations().length);
  });

  it('throws for a name that is no record, before it asks anything', async () => {
    const check = vi.fn();
    await expect(run(['nowhere'], { check, log: () => {} })).rejects.toThrow(/nowhere/);
    expect(check).not.toHaveBeenCalled();
  });
});

// The scripts as a person runs them. These reach no network: each refuses its arguments, or
// needs none, before it asks anything. A script that does nothing when run would pass every
// test above.
describe('the scripts run from the command line', () => {
  const node = (script, ...args) => spawnSync(process.execPath, [fileURLToPath(new URL(`../scripts/${script}`, import.meta.url)), ...args], { encoding: 'utf8' });

  it('bearing.mjs prints the report', () => {
    const r = node('locations/bearing.mjs', '42.9607', '-72.5219', '43.126189', '-72.436755');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('Bearing 20.6 degrees (NNE). Distance 19,659 m (12.2 mi).\nBack from the second point: 200.6 degrees.\n');
  });

  it('bearing.mjs gives its usage and exit status 2 for bad arguments', () => {
    const r = node('locations/bearing.mjs', '1', '2', '3');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/^Usage: node scripts\/locations\/bearing.mjs/);
    expect(r.stdout).toBe('');
  });

  it('flowstats.mjs gives its usage and exit status 2 for a bad id, before any request', () => {
    const r = node('locations/flowstats.mjs', 'putney');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/^Usage: node scripts\/locations\/flowstats.mjs/);
  });

  it('check-sources.mjs says which name is no record, with exit status 2, before any request', () => {
    const r = node('check-sources.mjs', 'nowhere');
    expect(r.status).toBe(2);
    expect(r.stderr).toBe('No location named nowhere in data/locations.\n');
    expect(r.stdout).toBe('');
  });
});
