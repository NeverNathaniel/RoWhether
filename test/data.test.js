import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { PUTNEY, PUTNEY_RECORD, PUTNEY_WATERWAY } from '../src/putney.js';
import { resolveLocation } from '../src/location.js';
import { fetchAll } from '../src/data.js';
import { app } from '../src/state.js';
import { renderNoData } from '../src/render/hero.js';
import { SCENARIOS } from './fixtures/golden.js';
import { installFakeDom, uninstallFakeDom } from './helpers/fakedom.js';

// fetchAll(loc) asks for what the location's bindings say and keys the answers
// by slot (08 P0.8). fetch is a stub, so nothing here reaches a network.

// What the page asked for and called its sources in P0.1, and what the parsers
// made of the june-calm responses: slot, URL and name, and the parsed data.
const GOLDEN = JSON.parse(readFileSync(new URL('./golden/june-calm-1200-default.json', import.meta.url), 'utf8'));
const SLOTS = GOLDEN.sources.map(s => s[0]);
const URLS = Object.fromEntries(GOLDEN.sources.map(s => [s[0], s[1]]));
const scenario = SCENARIOS['june-calm'];
const raw = scenario.raw(scenario.clock(12));
const slotOf = url => SLOTS.find(s => URLS[s] === url);

// A fetch that answers `by(url)`: an object is the JSON body, a number is an
// HTTP status that is not ok, an Error is a request that never connected. It
// returns the URLs that were asked for.
function stubFetch(by) {
  const asked = [];
  vi.stubGlobal('fetch', vi.fn(async url => {
    asked.push(url);
    const v = by(url);
    if (v instanceof Error) throw v;
    if (typeof v === 'number') return { ok: false, status: v, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => v };
  }));
  return asked;
}
const putney = url => raw[slotOf(url)];
const warn = () => vi.spyOn(console, 'warn').mockImplementation(() => {});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchAll(PUTNEY)', () => {
  it('asks for the nine URLs of P0.1, once each', async () => {
    const asked = stubFetch(putney);
    await fetchAll(PUTNEY);
    expect(asked.slice().sort()).toEqual(Object.values(URLS).sort());
  });

  it('keys what the parsers made by slot, in slot order', async () => {
    stubFetch(putney);
    const { data, errors } = await fetchAll(PUTNEY);
    expect(errors).toEqual({});
    expect(Object.keys(data)).toEqual(SLOTS);
    // The forecast as it came, the rest as the golden files recorded them.
    expect(data.wx).toEqual(raw.wx);
    for (const [slot, want] of Object.entries(GOLDEN.parsers)) expect(JSON.parse(JSON.stringify(data[slot])), slot).toEqual(want);
    // Not empty by accident: the river reading has the gauge's flow and water temperature.
    expect(data.river.flow.v).toBeGreaterThan(0);
    expect(data.river.waterC).toBeTruthy();
    expect(data.models.ids).toHaveLength(4);
  });

  it.each(SLOTS)('leaves %s out of data and names it in errors when it fails, and nothing else', async slot => {
    warn();
    stubFetch(url => (slotOf(url) === slot ? 500 : putney(url)));
    const { data, errors } = await fetchAll(PUTNEY);
    expect(errors).toEqual({ [slot]: true });
    // Absent, not undefined: Object.assign(app.data, data) would write an undefined over the last good copy.
    expect(Object.keys(data)).toEqual(SLOTS.filter(s => s !== slot));
    expect(slot in data).toBe(false);
  });

  it('counts a request that never connected, and a response that cannot be parsed, as that source failing', async () => {
    const log = warn();
    // The alerts answer is a JSON null.
    const answers = { river: new TypeError('Failed to fetch'), alerts: null };
    stubFetch(url => (slotOf(url) in answers ? answers[slotOf(url)] : putney(url)));
    const { data, errors } = await fetchAll(PUTNEY);
    expect(errors).toEqual({ alerts: true, river: true });
    expect(Object.keys(data)).toEqual(SLOTS.filter(s => s !== 'alerts' && s !== 'river'));
    expect(log.mock.calls.map(c => c[0])).toEqual(['alerts', 'river']);
  });

  it('names every slot, in order, when every request fails', async () => {
    warn();
    stubFetch(() => new TypeError('Failed to fetch'));
    const { data, errors } = await fetchAll(PUTNEY);
    expect(data).toEqual({});
    expect(Object.keys(errors)).toEqual(SLOTS);
    expect(Object.values(errors).every(v => v === true)).toBe(true);
  });
});

describe('fetchAll for another location', () => {
  const clone = o => JSON.parse(JSON.stringify(o));
  const at = (id, code, value) => ({ properties: { monitoring_location_id: id, parameter_code: code, value, time: '2026-06-15T12:00:00Z' } });

  it('asks for its own requests and hands each parser its own binding', async () => {
    const waterway = clone(PUTNEY_WATERWAY);
    waterway.sources[0].ref = 'USGS-1';
    const loc = resolveLocation(clone(PUTNEY_RECORD), { waterway });
    // Its flow and daily requests are not Putney's URLs, so answer by endpoint.
    // The river answer holds both gauges' readings. The location's own are the ones to read.
    const asked = stubFetch(url => {
      if (/latest-continuous/.test(url)) return { features: [at('USGS-1', '00060', '5'), at('USGS-01154500', '00060', '9'), at('USGS-01161280', '00010', '8')] };
      if (/collections\/continuous\//.test(url)) return raw.flow;
      if (/collections\/daily\//.test(url)) return raw.flowDays;
      return putney(url);
    });
    const { data, errors } = await fetchAll(loc);
    expect(errors).toEqual({});
    expect(asked.find(u => /latest-continuous/.test(u))).toContain('monitoring_location_id=USGS-1,USGS-01161280');
    expect(asked.filter(u => /collections\/(continuous|daily)\//.test(u)).every(u => u.includes('monitoring_location_id=USGS-1&'))).toBe(true);
    expect(data.river.flow.v).toBe(5);
    expect(data.river.waterC.v).toBe(8);
  });

  it('does not ask for a source it has no row for, and does not report it', async () => {
    const loc = resolveLocation({ ...clone(PUTNEY_RECORD), sources: clone(PUTNEY_RECORD.sources).filter(s => s.role !== 'obs') }, { waterway: PUTNEY_WATERWAY });
    const asked = stubFetch(putney);
    const { data, errors } = await fetchAll(loc);
    expect(asked).not.toContain(URLS.obs);
    expect(asked).toHaveLength(8);
    expect(errors).toEqual({});
    expect(Object.keys(data)).toEqual(SLOTS.filter(s => s !== 'obs'));
  });
});

// The No data screen says every source was blocked only when every source the
// location has failed (08 P0.8), and not for one fewer.
describe('the No data message', () => {
  const BLOCKED = 'Every data source was blocked';
  const failing = slots => Object.fromEntries(slots.map(k => [k, true]));
  // What renderNoData writes for a location whose sources `slots` all failed.
  function whyFor(loc, slots) {
    const was = { loc: app.loc, errors: app.errors };
    const dom = installFakeDom();
    try {
      Object.assign(app, { loc, errors: failing(slots) });
      renderNoData();
      return dom.el('why').textContent;
    } finally {
      Object.assign(app, was);
      uninstallFakeDom();
    }
  }
  const noObs = () => resolveLocation({ ...JSON.parse(JSON.stringify(PUTNEY_RECORD)), sources: PUTNEY_RECORD.sources.filter(s => s.role !== 'obs') }, { waterway: PUTNEY_WATERWAY });

  it('says so when all nine sources failed', () => {
    expect(whyFor(PUTNEY, SLOTS)).toContain(BLOCKED);
  });

  it.each(SLOTS)('does not say so when %s alone did not fail', slot => {
    const why = whyFor(PUTNEY, SLOTS.filter(s => s !== slot));
    expect(why).not.toContain(BLOCKED);
    expect(why).toBe('The forecast did not load. Check the connection, then tap Refresh.');
  });

  it('follows the location: eight sources are all of them when there is no station', () => {
    const loc = noObs();
    expect(whyFor(loc, SLOTS.filter(s => s !== 'obs'))).toContain(BLOCKED);
    expect(whyFor(loc, SLOTS.filter(s => s !== 'obs' && s !== 'flow'))).not.toContain(BLOCKED);
  });
});
