import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PUTNEY, PUTNEY_RECORD, PUTNEY_WATERWAY } from '../src/putney.js';
import { resolveLocation } from '../src/location.js';
import { MODELS, HOUR } from '../src/config.js';
import { cToF } from '../src/format.js';
import { SLOT_ORDER, ADAPTERS, PROVIDERS, bindingsFor, labelFor, staleSlots } from '../src/sources/index.js';
import * as nws from '../src/sources/nws.js';
import * as usgs from '../src/sources/usgs.js';
import * as nwps from '../src/sources/nwps.js';
import * as om from '../src/sources/openmeteo.js';
import { SCENARIOS } from './fixtures/golden.js';

const clone = o => JSON.parse(JSON.stringify(o));
// A location made from Putney's record with one change made by `edit`, and no
// waterway unless one is given.
const rec = edit => { const r = clone(PUTNEY_RECORD); edit(r); return r; };
const locOf = (edit, waterway = null) => resolveLocation(rec(edit), { waterway });
const by = (bs, slot) => bs.find(b => b.slot === slot);
// The nine slots, URLs and failure names that P0.1 recorded from SRC and
// SOURCE_NAMES, which P0.8 removed. The golden files keep them.
const GOLDEN_SOURCES = JSON.parse(readFileSync(new URL('./golden/june-calm-1200-default.json', import.meta.url), 'utf8')).sources;

describe('bindingsFor(PUTNEY)', () => {
  const bs = bindingsFor(PUTNEY);

  it('lists the nine slots in the order requests are made', () => {
    expect(SLOT_ORDER).toEqual(['wx', 'alerts', 'obs', 'river', 'flow', 'flowDays', 'flowFcst', 'aq', 'models']);
    expect(bs.map(b => b.slot)).toEqual(SLOT_ORDER);
  });

  it('builds what the golden files recorded in P0.1', () => {
    expect(GOLDEN_SOURCES).toHaveLength(9);
    expect(bs.map(b => [b.slot, b.url, labelFor(b.slot, b)])).toEqual(GOLDEN_SOURCES);
  });

  it('writes the river request with the flow gauge, then the temperature gauge', () => {
    expect(by(bs, 'river').url).toBe('https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items?monitoring_location_id=USGS-01154500,USGS-01161280&parameter_code=00060,00010&f=json&limit=50');
  });

  it('asks the USGS OGC API for version 1, and the latest request for up to 50 readings', () => {
    expect(by(bs, 'flow').url).toBe('https://api.waterdata.usgs.gov/ogcapi/v1/collections/continuous/items?monitoring_location_id=USGS-01154500&parameter_code=00060&time=P2D&limit=1000&properties=time,value&f=json');
    expect(by(bs, 'flowDays').url).toBe('https://api.waterdata.usgs.gov/ogcapi/v1/collections/daily/items?monitoring_location_id=USGS-01154500&parameter_code=00060&statistic_id=00003&time=P30D&limit=100&properties=time,value&f=json');
    for (const slot of ['river', 'flow', 'flowDays']) expect(by(bs, slot).url, slot).not.toContain('/ogcapi/v0/');
    expect(by(bs, 'river').url).toMatch(/&limit=50$/);
    // The two ids stay in params as they were: the config probe records them.
    expect(by(bs, 'river').params).toEqual({ flow: 'USGS-01154500', temp: 'USGS-01161280' });
  });

  it('names the Keene station and the river forecast gauge', () => {
    expect(by(bs, 'obs').url).toBe('https://api.weather.gov/stations/KEEN/observations/latest');
    expect(labelFor('obs', by(bs, 'obs'))).toBe('Keene observations');
    expect(by(bs, 'flowFcst').url).toBe('https://api.water.noaa.gov/nwps/v1/gauges/WLPN3/stageflow/forecast');
  });

  it('asks for the alerts of the four zones, on both banks, in one request', () => {
    expect(by(bs, 'alerts').url).toBe('https://api.weather.gov/alerts/active?zone=VTZ015,VTC025,NHZ011,NHC005');
    expect(by(bs, 'alerts').url).not.toContain('point=');
  });

  it('derives the fetcher of each slot from the stored provider', () => {
    expect(bs.map(b => [b.slot, b.adapter])).toEqual([
      ['wx', 'om-forecast'], ['alerts', 'nws-alerts'], ['obs', 'nws-obs'], ['river', 'usgs-latest'], ['flow', 'usgs-recent'],
      ['flowDays', 'usgs-daily'], ['flowFcst', 'nwps-forecast'], ['aq', 'om-aq'], ['models', 'om-models']
    ]);
  });

  it("reads each slot's options from the stored rows", () => {
    expect(bs.map(b => b.params)).toEqual([
      {}, { zones: 'VTZ015,VTC025,NHZ011,NHC005', lat: 42.9607, lon: -72.5219 }, { station: 'KEEN' }, { flow: 'USGS-01154500', temp: 'USGS-01161280' },
      { id: 'USGS-01154500' }, { id: 'USGS-01154500', tz: 'America/New_York' }, { lid: 'WLPN3' }, {}, { models: MODELS.map(x => x.id) }
    ]);
    expect(by(bs, 'obs')).toMatchObject({ label: 'Keene' });
    expect(by(bs, 'wx')).toMatchObject({ label: null });
  });

  it('carries no note: the texts read it from the stored row', () => {
    for (const b of bs) expect(Object.keys(b).sort(), b.slot).toEqual(['adapter', 'label', 'params', 'parse', 'slot', 'url']);
  });

  it('does not change with the clock', () => {
    expect(bindingsFor(PUTNEY, 0).map(b => b.url)).toEqual(bs.map(b => b.url));
  });
});

describe('a location with other sources', () => {
  it('has only the three implicit slots when it has no rows', () => {
    const bs = bindingsFor(locOf(r => { r.sources = []; }));
    expect(bs.map(b => b.slot)).toEqual(['wx', 'aq', 'models']);
  });

  it('leaves a slot out when it has no row, and when its provider is not known', () => {
    const noObs = locOf(r => { r.sources = r.sources.filter(s => s.role !== 'obs'); }, PUTNEY_WATERWAY);
    expect(bindingsFor(noObs).map(b => b.slot)).toEqual(['wx', 'alerts', 'river', 'flow', 'flowDays', 'flowFcst', 'aq', 'models']);
    const odd = locOf(r => { r.sources.find(s => s.role === 'obs').adapter = 'nope'; }, PUTNEY_WATERWAY);
    expect(bindingsFor(odd).map(b => b.slot)).toEqual(['wx', 'alerts', 'river', 'flow', 'flowDays', 'flowFcst', 'aq', 'models']);
    const noFlow = locOf(() => {}, { ...PUTNEY_WATERWAY, sources: [] });
    expect(bindingsFor(noFlow).map(b => b.slot)).toEqual(['wx', 'alerts', 'obs', 'river', 'aq', 'models']);
  });

  it('lists only the gauge it has in the river request', () => {
    const flowOnly = locOf(r => { r.sources = r.sources.filter(s => s.role !== 'water_temp'); }, PUTNEY_WATERWAY);
    expect(by(bindingsFor(flowOnly), 'river').url).toContain('monitoring_location_id=USGS-01154500&parameter_code=00060&f=json');
    const tempOnly = locOf(() => {}, { ...PUTNEY_WATERWAY, sources: [] });
    expect(by(bindingsFor(tempOnly), 'river').url).toContain('monitoring_location_id=USGS-01161280&parameter_code=00010&f=json');
  });

  it('lists a gauge once when its flow and its water temperature both come from it', () => {
    const waterway = clone(PUTNEY_WATERWAY);
    waterway.sources[0].ref = 'USGS-01646500';
    const b = by(bindingsFor(locOf(r => { r.sources[2].ref = 'USGS-01646500'; }, waterway)), 'river');
    expect(b.url).toBe('https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items?monitoring_location_id=USGS-01646500&parameter_code=00060,00010&f=json&limit=50');
    expect(b.params).toEqual({ flow: 'USGS-01646500', temp: 'USGS-01646500' });
  });

  it('builds every request from its own point, zone, stations and gauges', () => {
    const waterway = clone(PUTNEY_WATERWAY);
    waterway.sources[0].ref = 'USGS-01100000';
    waterway.sources[1].ref = 'ABCN3';
    const loc = locOf(r => {
      r.lat = 42.36; r.lon = -71.06; r.tz = 'America/Chicago';
      r.sources[0].ref = 'point:42.4,-71.1';
      r.sources[1].ref = 'KBOS'; r.sources[1].label = 'Boston';
      r.sources[2].ref = 'USGS-01100999';
    }, waterway);
    const bs = bindingsFor(loc);
    const urls = Object.fromEntries(bs.map(b => [b.slot, b.url]));
    expect(urls.wx).toContain('latitude=42.36&longitude=-71.06');
    expect(urls.wx).toContain('timezone=America%2FChicago');
    expect(urls.aq).toContain('latitude=42.36&longitude=-71.06');
    expect(urls.aq).toContain('timezone=America%2FChicago');
    expect(urls.models).toContain('timezone=America%2FChicago');
    expect(urls.alerts).toBe('https://api.weather.gov/alerts/active?point=42.4,-71.1');
    expect(urls.obs).toBe('https://api.weather.gov/stations/KBOS/observations/latest');
    expect(urls.river).toContain('monitoring_location_id=USGS-01100000,USGS-01100999&parameter_code=00060,00010');
    expect(urls.flow).toContain('monitoring_location_id=USGS-01100000&');
    expect(urls.flowDays).toContain('monitoring_location_id=USGS-01100000&');
    expect(urls.flowFcst).toBe('https://api.water.noaa.gov/nwps/v1/gauges/ABCN3/stageflow/forecast');
    expect(labelFor('obs', by(bs, 'obs'))).toBe('Boston observations');
    expect(bs.map(b => b.url).join('\n')).not.toMatch(/KEEN|WLPN3|01154500|01161280|42\.9607|New_York/);
  });

  it('reads a zones ref into a zone request and a point ref into a point request, and carries the dock point in both', () => {
    const zones = by(bindingsFor(locOf(r => { r.lat = 38.9; r.lon = -77.06; r.sources[0].ref = 'zones:DCZ001,DCC001,ANZ535'; })), 'alerts');
    expect(zones.url).toBe('https://api.weather.gov/alerts/active?zone=DCZ001,DCC001,ANZ535');
    expect(zones.params).toEqual({ zones: 'DCZ001,DCC001,ANZ535', lat: 38.9, lon: -77.06 });
    const point = by(bindingsFor(locOf(r => { r.sources[0].ref = 'point:42.4,-71.1'; })), 'alerts');
    expect(point.url).toBe('https://api.weather.gov/alerts/active?point=42.4,-71.1');
    expect(point.params).toEqual({ point: '42.4,-71.1', lat: 42.9607, lon: -72.5219 });
  });

  it('takes the alerts point from the location when the ref is in no form the validator allows', () => {
    for (const ref of ['station:KEEN', 'VTZ015', 'zones']) {
      const loc = locOf(r => { r.sources[0].ref = ref; });
      expect(by(bindingsFor(loc), 'alerts').url, ref).toBe('https://api.weather.gov/alerts/active?point=42.9607,-72.5219');
    }
  });

  it('names a station by its id when the row has no label', () => {
    const loc = locOf(r => { delete r.sources[1].label; });
    expect(labelFor('obs', by(bindingsFor(loc), 'obs'))).toBe('KEEN observations');
  });

  // FC2: a slot takes the first row a fetcher can read, so its ids must come from
  // that row too, not from a row before it that no fetcher reads.
  it('takes the ids and the name from the row it can fetch, past one it cannot', () => {
    const waterway = clone(PUTNEY_WATERWAY);
    waterway.sources[0].mode = 'fallback';
    waterway.sources[1].mode = 'fallback';
    waterway.sources.unshift(
      { role: 'flow', adapter: 'ec-hydro', ref: '02KF005', label: 'Ottawa' },
      { role: 'flow_forecast', adapter: 'other', ref: 'ZZZ1', label: 'Elsewhere' }
    );
    const loc = locOf(r => {
      r.sources.find(s => s.role === 'obs').mode = 'fallback';
      r.sources.push({ role: 'obs', adapter: 'metar', ref: 'EGLL', label: 'Heathrow' });
    }, waterway);
    const bs = bindingsFor(loc);
    expect(by(bs, 'obs')).toMatchObject({ params: { station: 'KEEN' }, label: 'Keene', url: 'https://api.weather.gov/stations/KEEN/observations/latest' });
    expect(by(bs, 'river').params).toEqual({ flow: 'USGS-01154500', temp: 'USGS-01161280' });
    expect(by(bs, 'flow')).toMatchObject({ params: { id: 'USGS-01154500' }, label: 'North Walpole' });
    expect(by(bs, 'flowDays').params).toEqual({ id: 'USGS-01154500', tz: 'America/New_York' });
    expect(by(bs, 'flowFcst')).toMatchObject({ params: { lid: 'WLPN3' }, url: 'https://api.water.noaa.gov/nwps/v1/gauges/WLPN3/stageflow/forecast' });
    expect(bs.map(b => b.url).join('\n')).not.toMatch(/EGLL|02KF005|ZZZ1/);
  });

  // FC2: an info row is never read for the call (01 4.2), so a gauge kept for
  // information does not bind, and its reading cannot drive Go or Stay off.
  it('reads no info row', () => {
    const waterway = clone(PUTNEY_WATERWAY);
    waterway.sources[0].mode = 'info';
    const bs = bindingsFor(locOf(() => {}, waterway));
    expect(bs.map(b => b.slot)).toEqual(['wx', 'alerts', 'obs', 'river', 'flowFcst', 'aq', 'models']);
    expect(by(bs, 'river').params).toEqual({ flow: undefined, temp: 'USGS-01161280' });
    expect(by(bs, 'river').url).toContain('monitoring_location_id=USGS-01161280&parameter_code=00010&f=json');
    // Beside a primary row, the info row is left out and the primary one is read.
    const both = clone(PUTNEY_WATERWAY);
    both.sources.unshift({ ...both.sources[0], ref: 'USGS-01100000', label: 'Info gauge', mode: 'info' });
    const bs2 = bindingsFor(locOf(() => {}, both));
    expect(by(bs2, 'flow')).toMatchObject({ params: { id: 'USGS-01154500' }, label: 'North Walpole' });
    expect(bs2.map(b => b.url).join('\n')).not.toContain('USGS-01100000');
  });
});

describe('labelFor', () => {
  it("names a slot's own source without a binding", () => {
    const others = GOLDEN_SOURCES.filter(s => s[0] !== 'obs');
    expect(others.map(s => labelFor(s[0]))).toEqual(others.map(s => s[2]));
    expect(labelFor('obs')).toBe('Weather station observations');
  });

  it('falls back to the slot name for a slot with no adapter', () => {
    expect(labelFor('tide')).toBe('tide');
  });
});

describe('the adapters', () => {
  const all = Object.values(ADAPTERS);

  it('are the nine of 02, with their slots and regions', () => {
    expect(all.map(a => [a.key, a.slot, a.regions.join()])).toEqual([
      ['om-forecast', 'wx', '*'], ['om-aq', 'aq', '*'], ['om-models', 'models', '*'], ['nws-alerts', 'alerts', 'US'],
      ['nws-obs', 'obs', 'US'], ['usgs-latest', 'river', 'US'], ['usgs-recent', 'flow', 'US'], ['usgs-daily', 'flowDays', 'US'],
      ['nwps-forecast', 'flowFcst', 'US']
    ]);
  });

  // 02's catalog: how long a source's last good fetch stands before the hero names it.
  const STALE_H = { 'om-forecast': 24, 'om-aq': 24, 'om-models': 24, 'nws-alerts': 1, 'nws-obs': 3, 'usgs-latest': 24, 'usgs-recent': 24, 'usgs-daily': 7 * 24, 'nwps-forecast': 24 };

  it('follow the Adapter typedef, with a staleMs each and refresh pacing left empty', () => {
    for (const a of all) {
      expect(a.via).toBe('browser');
      expect(a.refreshMs).toBeNull();
      expect(a.staleMs, a.key).toBe(STALE_H[a.key] * HOUR);
      expect(a.hosts.length).toBeGreaterThan(0);
      for (const f of ['bind', 'url', 'parse', 'label']) expect(typeof a[f]).toBe('function');
      // discover and attribution are phase 1.
      expect(a).not.toHaveProperty('discover');
      expect(a).not.toHaveProperty('attribution');
    }
  });

  it('list the origin of every URL they build, for the CSP test', () => {
    for (const b of bindingsFor(PUTNEY)) expect(ADAPTERS[b.adapter].hosts).toContain(new URL(b.url).origin);
    expect([...new Set(all.flatMap(a => a.hosts))].sort()).toEqual([
      'https://air-quality-api.open-meteo.com', 'https://api.open-meteo.com', 'https://api.water.noaa.gov',
      'https://api.waterdata.usgs.gov', 'https://api.weather.gov'
    ]);
  });
});

describe('staleSlots', () => {
  const bs = bindingsFor(PUTNEY), NOW = Date.UTC(2026, 5, 15, 16);
  const all = (t, miss = {}) => Object.fromEntries(bs.map(b => [b.slot, t]).filter(([k]) => !(k in miss)));
  const failed = (...slots) => Object.fromEntries(slots.map(k => [k, true]));
  const stale = (fetched, errors, now = NOW) => [...staleSlots(bs, fetched, errors, now).keys()];

  it('is empty when no refresh in this visit has failed, however old the saved copy is', () => {
    expect(stale(all(NOW - 400 * 24 * HOUR), {})).toEqual([]);
    expect(stale(all(NOW - 400 * 24 * HOUR), undefined)).toEqual([]);
  });

  it('names a failed slot only once its last good fetch is past its staleMs, at each slot\'s edge', () => {
    for (const [slot, h] of [['alerts', 1], ['obs', 3], ['wx', 24], ['aq', 24], ['models', 24], ['river', 24], ['flow', 24], ['flowFcst', 24], ['flowDays', 7 * 24]]) {
      expect(stale(all(NOW - h * HOUR), failed(slot)), `${slot} at its limit`).toEqual([]);
      expect(stale(all(NOW - h * HOUR - 1), failed(slot)), `${slot} 1 ms past it`).toEqual([slot]);
    }
  });

  it('names only the slots that failed', () => {
    const t = NOW - 30 * HOUR;
    expect(stale(all(t), failed('wx', 'river'))).toEqual(['wx', 'river']);
    expect(stale(all(t), failed('alerts'))).toEqual(['alerts']);
  });

  it('gives each slot its fetch time, and null for one never held', () => {
    const t = NOW - 5 * HOUR;
    expect(staleSlots(bs, all(t), failed('alerts'), NOW).get('alerts')).toBe(t);
    expect(staleSlots(bs, all(t, { alerts: 1 }), failed('alerts'), NOW).get('alerts')).toBeNull();
  });

  it('reads a time that cannot be read as not fresh', () => {
    expect(stale({ ...all(NOW), obs: NaN }, failed('obs'))).toEqual(['obs']);
    expect(stale({ ...all(NOW), obs: 'x' }, failed('obs'))).toEqual(['obs']);
    expect(stale(undefined, failed('obs'))).toEqual(['obs']);
  });

  it('leaves out a failure for a slot the location has no source for', () => {
    expect(stale(all(0), failed('tide'))).toEqual([]);
  });
});

describe('the parsers', () => {
  it('return data on a golden response, not empty results', () => {
    const sc = SCENARIOS['october-fog'], raw = sc.raw(sc.clock(12));
    const got = Object.fromEntries(bindingsFor(PUTNEY).map(b => [b.slot, b.parse(raw[b.slot], b)]));
    expect(got.alerts.length).toBeGreaterThan(0);
    expect(got.obs.tempF).not.toBeNull();
    expect(got.river.flow.v).toBeGreaterThan(0);
    expect(got.river.waterC.v).toBeGreaterThan(0);
    expect(got.flow.length).toBeGreaterThan(10);
    expect(got.flowDays.length).toBeGreaterThan(10);
    expect(got.flowFcst.pts.length).toBeGreaterThan(0);
    expect(got.aq.length).toBeGreaterThan(10);
    expect(got.models.ids).toEqual(MODELS.map(x => x.id));
  });

  // Responses recorded from the real APIs on 2026-10-18, 16:25 to 16:30 UTC,
  // with curl from the nine URLs bindingsFor(PUTNEY) builds (test/fixtures/sources/).
  // No alert was active at Putney, so alerts-elsewhere holds the first three
  // of fifteen active in Florida (alerts/active?area=FL). Their dates are
  // past; the parsers do not read the clock.
  const recorded = name => JSON.parse(readFileSync(new URL(`./fixtures/sources/${name}.json`, import.meta.url), 'utf8'));

  it('read the recorded responses as data, not as empty results', () => {
    const bs = bindingsFor(PUTNEY), got = Object.fromEntries(bs.map(b => [b.slot, b.parse(recorded(b.slot), b)]));
    expect(got.wx.hourly.time.length).toBeGreaterThan(100);
    expect(got.obs.tempF).toEqual(expect.any(Number));
    expect(got.river.flow.v).toBeGreaterThan(0);
    expect(got.river.waterC.v).toBeGreaterThan(0);
    // The latest-continuous response also holds the flow at the temperature gauge, which is not read.
    expect(recorded('river').features.some(f => f.properties.monitoring_location_id === 'USGS-01161280' && f.properties.parameter_code === '00060')).toBe(true);
    expect(got.flow.length).toBeGreaterThan(100);
    expect(got.flowDays.length).toBeGreaterThan(20);
    // Forecast flow comes in kcfs and is read in cfs.
    expect(recorded('flowFcst').secondaryUnits).toBe('kcfs');
    expect(got.flowFcst.pts.length).toBeGreaterThan(5);
    expect(got.flowFcst.pts[0].v).toBe(recorded('flowFcst').data[0].secondary * 1000);
    expect(got.aq.length).toBeGreaterThan(50);
    expect(got.models.ids).toEqual(MODELS.map(x => x.id));
    expect(got.alerts).toEqual([]);
  });

  it('read alerts recorded in another zone', () => {
    const raw = recorded('alerts-elsewhere');
    // With no binding nothing is dropped, as the probes call it.
    const got = nws.parseAlerts(raw);
    expect(got.map(a => [a.event, a.lvl])).toEqual([['Rip Current Statement', 1], ['Flood Warning', 2], ['High Surf Advisory', 1]]);
    // The Flood Warning has no end time and ends when it expires.
    expect(got[1].end).toBe(Date.parse('2026-10-18T23:00:00-04:00'));
  });

  // A storm-based warning lists its whole county in affectedZones, so ?zone= returns it
  // for every spot in the county, and only the polygon says where it applies (R15).
  describe('an alert drawn as a polygon', () => {
    const raw = recorded('alerts-elsewhere');
    // The recorded Flood Warning is a polygon in Lake and Volusia counties, Florida. The two
    // other products have no geometry, so they apply to every location in their zones.
    const keeps = (lat, lon) => by(bindingsFor(locOf(r => { r.lat = lat; r.lon = lon; })), 'alerts').parse(raw).map(a => a.event);

    it('is dropped for a dock outside its polygon, and the products with no geometry are kept', () => {
      expect(keeps(42.9607, -72.5219)).toEqual(['Rip Current Statement', 'High Surf Advisory']);
      expect(keeps(29.2, -81.7)).toEqual(['Rip Current Statement', 'High Surf Advisory']);
      expect(keeps(29.4, -81.55)).toEqual(['Rip Current Statement', 'High Surf Advisory']);
    });

    it('is kept for a dock inside its polygon, with the others', () => {
      expect(keeps(29.2, -81.55)).toEqual(['Rip Current Statement', 'Flood Warning', 'High Surf Advisory']);
    });

    it('is judged by the dock point of the location, for a point ref too', () => {
      const bind = (lat, lon) => by(bindingsFor(locOf(r => { r.lat = lat; r.lon = lon; r.sources[0].ref = 'point:29.2,-81.55'; })), 'alerts');
      expect(bind(42.9607, -72.5219).parse(raw).map(a => a.event)).not.toContain('Flood Warning');
      expect(bind(29.2, -81.55).parse(raw).map(a => a.event)).toContain('Flood Warning');
    });

    it('is not dropped when the binding has no dock point', () => {
      for (const b of [undefined, {}, { params: {} }, { params: { zones: 'X' } }, { params: { lat: 29.2 } }, { params: { lat: 'x', lon: 'y' } }]) {
        expect(nws.parseAlerts(raw, b).map(a => a.event), JSON.stringify(b)).toContain('Flood Warning');
      }
    });

    const poly = (type, coordinates) => ({ features: [{ properties: { event: 'Severe Thunderstorm Warning' }, geometry: { type, coordinates } }] });
    const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    const kept = (d, lat, lon) => nws.parseAlerts(d, { params: { lat, lon } }).length;

    it('holds for a ring drawn either way round, and the edges of the shape are not special', () => {
      const cw = square(0, 0, 10, 10), ccw = [...cw].reverse();
      for (const ring of [cw, ccw]) {
        expect(kept(poly('Polygon', [ring]), 5, 5)).toBe(1);
        expect(kept(poly('Polygon', [ring]), 11, 5)).toBe(0);
        expect(kept(poly('Polygon', [ring]), 5, 11)).toBe(0);
        expect(kept(poly('Polygon', [ring]), -1, 5)).toBe(0);
        expect(kept(poly('Polygon', [ring]), 5, -1)).toBe(0);
      }
      // An L shape: the notch is outside.
      const L = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10], [0, 0]];
      expect(kept(poly('Polygon', [L]), 2, 8)).toBe(1);
      expect(kept(poly('Polygon', [L]), 8, 8)).toBe(0);
      expect(kept(poly('Polygon', [L]), 8, 2)).toBe(1);
    });

    it('treats the inner rings of a polygon as holes', () => {
      const withHole = poly('Polygon', [square(0, 0, 10, 10), square(4, 4, 6, 6)]);
      expect(kept(withHole, 2, 2)).toBe(1);
      expect(kept(withHole, 5, 5)).toBe(0);
      expect(kept(withHole, 5, 8)).toBe(1);
      expect(kept(withHole, 20, 20)).toBe(0);
    });

    it('is kept when any polygon of a MultiPolygon holds the dock, and holes belong to their own polygon', () => {
      const multi = poly('MultiPolygon', [[square(0, 0, 4, 4)], [square(10, 10, 20, 20), square(14, 14, 16, 16)]]);
      expect(kept(multi, 2, 2)).toBe(1);
      expect(kept(multi, 12, 12)).toBe(1);
      expect(kept(multi, 15, 15)).toBe(0);
      expect(kept(multi, 7, 7)).toBe(0);
      // The hole of the second polygon does not take the point out of the first.
      const nested = poly('MultiPolygon', [[square(0, 0, 20, 20)], [square(0, 0, 20, 20), square(8, 8, 12, 12)]]);
      expect(kept(nested, 10, 10)).toBe(1);
    });

    it('applies as listed when its shape is not a polygon or cannot be read', () => {
      for (const g of [{ type: 'Point', coordinates: [1, 2] }, { type: 'GeometryCollection', geometries: [] }, { type: 'Polygon', coordinates: 'x' }, { type: 'Polygon', coordinates: [] }, { type: 'MultiPolygon', coordinates: [[[1, 2]]] }, { type: 'Polygon', coordinates: [[1, 2, 3]] }, { type: 'Polygon' }, null]) {
        expect(kept({ features: [{ properties: { event: 'Flood Warning' }, geometry: g }] }, 5, 5), JSON.stringify(g)).toBe(1);
      }
      expect(nws.covers(undefined, 5, 5)).toBe(true);
    });

    it('keeps the order of the alerts it keeps, and what it reads of each', () => {
      const d = { features: [
        { properties: { event: 'Flood Warning', headline: 'h1' }, geometry: { type: 'Polygon', coordinates: [square(0, 0, 10, 10)] } },
        { properties: { event: 'Wind Advisory', headline: 'h2' }, geometry: null },
        { properties: { event: 'Tornado Warning', headline: 'h3' }, geometry: { type: 'Polygon', coordinates: [square(50, 50, 60, 60)] } },
        { properties: { event: 'Frost Advisory', headline: 'h4' } }
      ] };
      expect(nws.parseAlerts(d, { params: { lat: 5, lon: 5 } }).map(a => [a.event, a.headline, a.lvl])).toEqual([['Flood Warning', 'h1', 2], ['Wind Advisory', 'h2', 2], ['Frost Advisory', 'h4', 1]]);
    });
  });

  const f = p => ({ properties: p });

  it('give each alert name its level', () => {
    const levels = [['Tornado Warning', 2], ['Severe Thunderstorm Watch', 2], ['Flash Flood Watch', 2], ['Flood Warning', 2], ['Flood Advisory', 1], ['High Wind Warning', 2], ['Wind Advisory', 2], ['Extreme Wind Warning', 2], ['Dense Fog Advisory', 2], ['Dense Smoke Advisory', 1], ['Winter Storm Warning', 2], ['Winter Weather Advisory', 1], ['Ice Storm Warning', 2], ['Blizzard Warning', 2], ['Frost Advisory', 1], ['Heat Advisory', 1], ['Small Craft Advisory', 2], ['Lake Wind Advisory', 2], ['tornado warning', 2], ['DENSE FOG ADVISORY', 2], ['', 1]];
    for (const [event, lvl] of levels) expect(nws.alertLevel(event), event).toBe(lvl);
  });

  // README row 11, with the four names the owner added on 2026-10-21 (R18). Each is a whole name.
  const MARINE = ['Small Craft Advisory', 'Gale Warning', 'Storm Warning', 'Special Marine Warning', 'Hurricane Force Wind Warning', 'Hurricane Warning', 'Storm Surge Warning', 'Tropical Storm Warning'];

  it('give the eight marine warnings Stay off, matched as whole names in any case', () => {
    expect(nws.STAY_OFF_EVENTS).toEqual(MARINE);
    for (const e of MARINE) {
      expect(nws.alertLevel(e), e).toBe(2);
      expect(nws.alertLevel(e.toLowerCase()), e.toLowerCase()).toBe(2);
      expect(nws.alertLevel(e.toUpperCase()), e.toUpperCase()).toBe(2);
    }
  });

  it('give a name that only contains one of them its own level, not Stay off', () => {
    // "Dust Storm Warning" is a real event whose name ends in "Storm Warning".
    for (const e of ['Dust Storm Warning', 'Storm Watch', 'Marine Weather Statement', 'Gale Watch', 'Hurricane Watch', 'Tropical Storm Watch', 'Hurricane Local Statement', 'Storm Surge Watch', 'Special Marine Warning Update', 'Small Craft Advisory for Winds', 'Gale', 'Craft Advisory']) {
      expect(nws.alertLevel(e), e).toBe(1);
    }
    // The patterns already in force are untouched by the list.
    for (const e of ['Winter Storm Warning', 'Ice Storm Warning', 'Severe Thunderstorm Warning', 'Flood Warning', 'Dense Fog Advisory', 'Extreme Wind Warning']) expect(nws.alertLevel(e), e).toBe(2);
  });

  it('read a recorded Small Craft Advisory as Stay off, kept for a location whose zones it names', () => {
    // None was active in ANZ535 on 2026-10-24, so this is three advisories from the national
    // query (alerts/active?event=Small Craft Advisory). They are zone products: geometry null.
    const raw = recorded('alerts-anz535');
    expect(raw.features.map(f => [f.properties.event, f.geometry])).toEqual(Array(3).fill(['Small Craft Advisory', null]));
    const b = by(bindingsFor(locOf(r => { r.lat = 38.9; r.lon = -77.06; r.sources[0].ref = 'zones:DCZ001,DCC001,VAZ054,VAC013,ANZ535'; })), 'alerts');
    const got = b.parse(raw);
    expect(got.map(a => [a.event, a.lvl])).toEqual(Array(3).fill(['Small Craft Advisory', 2]));
    expect(got[0].end).toBe(Date.parse('2026-10-24T09:00:00-07:00'));
  });

  it('convert wind to mph from km/h, and from m/s when the unit says so', () => {
    const q = (value, unitCode) => ({ value, unitCode });
    for (const v of [null, undefined, {}, q(null, 'wmoUnit:km_h-1')]) expect(nws.speedToMph(v)).toBeNull();
    expect(nws.speedToMph(q(10, 'wmoUnit:km_h-1'))).toBeCloseTo(6.21371, 5);
    expect(nws.speedToMph(q(10, 'wmoUnit:m_s-1'))).toBeCloseTo(22.3694, 4);
    expect(nws.speedToMph(q(10))).toBeCloseTo(6.21371, 5);
    expect(nws.speedToMph(q('10', 'wmoUnit:km_h-1'))).toBeCloseTo(6.21371, 5);
    expect(nws.speedToMph(q(0, 'wmoUnit:km_h-1'))).toBe(0);
  });

  it('read the gauges from the binding', () => {
    const at = (id, code, value) => f({ monitoring_location_id: id, parameter_code: code, value, time: '2026-04-14T15:00:00+00:00' });
    const d = { features: [at('USGS-1', '00060', '5'), at('USGS-2', '00010', '4'), at('USGS-01154500', '00060', '9'), at('USGS-01161280', '00010', '8')] };
    const t = Date.parse('2026-04-14T15:00:00+00:00');
    expect(usgs.parseRiver(d, { params: { flow: 'USGS-1', temp: 'USGS-2' } })).toEqual({ flow: { v: 5, t }, waterC: { v: 4, t } });
    // Through a binding made from a location's rows, on a response that holds both sets of ids.
    const waterway = clone(PUTNEY_WATERWAY);
    waterway.sources[0].ref = 'USGS-1';
    const other = by(bindingsFor(locOf(r => { r.sources[2].ref = 'USGS-2'; }, waterway)), 'river');
    expect(other.parse(d, other)).toEqual({ flow: { v: 5, t }, waterC: { v: 4, t } });
    const putney = by(bindingsFor(PUTNEY), 'river');
    expect(putney.parse(d, putney)).toEqual({ flow: { v: 9, t }, waterC: { v: 8, t } });
    // A location with no temperature gauge takes no temperature, even from a reading with no gauge id.
    const noTemp = { features: [at('USGS-1', '00060', '5'), f({ parameter_code: '00010', value: '4' })] };
    expect(usgs.parseRiver(noTemp, { params: { flow: 'USGS-1' } })).toEqual({ flow: { v: 5, t } });
  });

  // Daily means sit at noon of the day in the gauge's zone, which the binding names (P1.8).
  describe('the daily means', () => {
    const day = (time, value = '100') => ({ properties: { time, value } });
    const noon = (date, tz) => new Date(usgs.parseFlowDays({ features: [day(date)] }, { params: { tz } })[0].t).toISOString();

    it('place a day at noon in the zone, with the clocks as they are on that day', () => {
      expect(noon('2026-07-01', 'America/New_York')).toBe('2026-07-01T16:00:00.000Z');
      expect(noon('2026-12-01', 'America/New_York')).toBe('2026-12-01T17:00:00.000Z');
      expect(noon('2026-07-01', 'America/Los_Angeles')).toBe('2026-07-01T19:00:00.000Z');
      expect(noon('2026-12-01', 'America/Los_Angeles')).toBe('2026-12-01T20:00:00.000Z');
      expect(noon('2026-07-01', 'Europe/London')).toBe('2026-07-01T11:00:00.000Z');
      expect(noon('2026-12-01', 'Europe/London')).toBe('2026-12-01T12:00:00.000Z');
      // A zone off the hour, and one with no change of clocks.
      expect(noon('2026-07-01', 'Asia/Kolkata')).toBe('2026-07-01T06:30:00.000Z');
      expect(noon('2026-07-01', 'UTC')).toBe('2026-07-01T12:00:00.000Z');
    });

    it('read an offset written with the Unicode minus sign, as some versions of ICU write it', () => {
      const Real = Intl.DateTimeFormat, minus = String.fromCharCode(0x2212);
      Intl.DateTimeFormat = function (...args) {
        const f = new Real(...args), parts = f.formatToParts.bind(f);
        f.formatToParts = t => parts(t).map(p => (p.type === 'timeZoneName' ? { ...p, value: p.value.replace('-', minus) } : p));
        return f;
      };
      try {
        expect(Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' }).formatToParts(0).find(p => p.type === 'timeZoneName').value).toContain(minus);
        expect(noon('2026-12-01', 'America/New_York')).toBe('2026-12-01T17:00:00.000Z');
        expect(noon('2026-07-01', 'America/New_York')).toBe('2026-07-01T16:00:00.000Z');
      } finally { Intl.DateTimeFormat = Real; }
    });

    it('are right on the days the clocks change, west and east of UTC', () => {
      // New York: forward on 2026-03-08 and back on 2026-11-01, both at 2 AM, so noon is already on the new clock.
      expect(noon('2026-03-07', 'America/New_York')).toBe('2026-03-07T17:00:00.000Z');
      expect(noon('2026-03-08', 'America/New_York')).toBe('2026-03-08T16:00:00.000Z');
      expect(noon('2026-10-31', 'America/New_York')).toBe('2026-10-31T16:00:00.000Z');
      expect(noon('2026-11-01', 'America/New_York')).toBe('2026-11-01T17:00:00.000Z');
      // Auckland is 13 hours ahead in summer, so noon of 2026-09-27 (the clocks go forward at 2 AM that day) is the evening before in UTC.
      expect(noon('2026-09-26', 'Pacific/Auckland')).toBe('2026-09-26T00:00:00.000Z');
      expect(noon('2026-09-27', 'Pacific/Auckland')).toBe('2026-09-26T23:00:00.000Z');
      expect(noon('2026-04-04', 'Pacific/Auckland')).toBe('2026-04-03T23:00:00.000Z');
      expect(noon('2026-04-05', 'Pacific/Auckland')).toBe('2026-04-05T00:00:00.000Z');
    });

    it('read 12:00 on the clock of every zone Intl knows, on every day of 2026', () => {
      // The check reads the zone's own clock with a second formatter, not the offset the parser reads.
      const days = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
      const zones = Intl.supportedValuesOf('timeZone');
      expect(zones.length).toBeGreaterThan(300);
      for (const tz of zones) {
        const clock = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
        const got = usgs.parseFlowDays({ features: days.map(time => day(time)) }, { params: { tz } });
        const bad = got.map(p => clock.format(p.t).replace(',', '')).filter((text, i) => text !== `${days[i]} 12:00`);
        expect(got, tz).toHaveLength(365);
        expect(bad.slice(0, 3), tz).toEqual([]);
      }
    });

    it('read the recorded answer across the fall back of 2025, in Eastern time', () => {
      // USGS-01154500, 2025-10-25 to 2025-11-08, as the daily request of the binding gets it, recorded
      // 2026-10-24: the fall back before the recording, since this year's was still ahead.
      const got = by(bindingsFor(PUTNEY), 'flowDays').parse(recorded('flowdays-est'));
      const days = Array.from({ length: 15 }, (_, i) => new Date(Date.UTC(2025, 9, 25 + i)).toISOString().slice(0, 10));
      expect(days[0]).toBe('2025-10-25');
      expect(days.at(-1)).toBe('2025-11-08');
      // Eastern daylight time to 2 AM on 2025-11-02, Eastern standard after it: noon is 16:00 UTC, then 17:00 UTC.
      expect(got.map(p => new Date(p.t).toISOString())).toEqual(days.map(date => `${date}T${date < '2025-11-02' ? 16 : 17}:00:00.000Z`));
      expect(got.every(p => Number.isFinite(p.v))).toBe(true);
    });

    it('drop a day that is not a date or has no value, and sort the rest', () => {
      const got = usgs.parseFlowDays({ features: [day('2026-04-12', '9000'), day('2026-04-10', '8000'), day('2026-04-11', null), day('nope', '1'), day('2026-04-13', 'Eqp'), { properties: {} }] }, { params: { tz: 'America/New_York' } });
      expect(got.map(p => p.v)).toEqual([8000, 9000]);
      expect(got.map(p => new Date(p.t).toISOString())).toEqual(['2026-04-10T16:00:00.000Z', '2026-04-12T16:00:00.000Z']);
    });

    it('need a zone to place a day, and have none of their own', () => {
      for (const b of [undefined, {}, { params: {} }, { params: { tz: '' } }]) {
        expect(() => usgs.parseFlowDays({ features: [day('2026-04-12')] }, b), JSON.stringify(b)).toThrow('needs a time zone');
        // With nothing to place there is nothing to say.
        expect(usgs.parseFlowDays({}, b)).toEqual([]);
        expect(usgs.parseFlowDays({ features: [] }, b)).toEqual([]);
      }
    });

    it('take the zone of the flow row, and the location\'s when the row has none', () => {
      expect(by(bindingsFor(PUTNEY), 'flowDays').params.tz).toBe('America/New_York');
      const waterway = clone(PUTNEY_WATERWAY);
      waterway.sources[0].tz = 'America/Chicago';
      expect(by(bindingsFor(locOf(() => {}, waterway)), 'flowDays').params.tz).toBe('America/Chicago');
      delete waterway.sources[0].tz;
      expect(by(bindingsFor(locOf(r => { r.tz = 'America/Los_Angeles'; }, waterway)), 'flowDays').params.tz).toBe('America/Los_Angeles');
      // The 48 hour series has no day to place, so its binding has no zone.
      expect(by(bindingsFor(PUTNEY), 'flow').params).toEqual({ id: 'USGS-01154500' });
    });

    it('place the days of a location by its binding, whatever zone the machine is in', () => {
      const waterway = clone(PUTNEY_WATERWAY);
      waterway.sources[0].tz = 'America/Los_Angeles';
      const b = by(bindingsFor(locOf(() => {}, waterway)), 'flowDays');
      expect(new Date(b.parse({ features: [day('2026-07-01')] })[0].t).toISOString()).toBe('2026-07-01T19:00:00.000Z');
    });
  });

  // USGS-01646500 lists five series of water temperature, and four of them ended in 2019.
  // The response is as the latest-continuous request of the binding gets it, recorded 2026-10-24.
  describe('a gauge that lists several series for one parameter', () => {
    const raw = recorded('usgs-latest-01646500');
    const both = () => {
      const waterway = clone(PUTNEY_WATERWAY);
      waterway.sources[0].ref = 'USGS-01646500';
      return by(bindingsFor(locOf(r => { r.sources[2].ref = 'USGS-01646500'; }, waterway)), 'river');
    };

    it('keeps the 2026 temperature of the recorded answer, not a series from 2019', () => {
      const temps = raw.features.filter(f => f.properties.parameter_code === '00010');
      expect(temps.map(f => f.properties.time.slice(0, 4)).sort()).toEqual(['2019', '2019', '2019', '2019', '2026']);
      // Today's last-match loop would take the last of them, a 2019 reading, because they are not in time order.
      expect(temps.at(-1).properties.time.slice(0, 4)).toBe('2019');
      const b = both(), t = Date.parse('2026-10-24T08:50:00+00:00');
      expect(b.parse(raw)).toEqual({ flow: { v: 3690, t }, waterC: { v: 14.6, t } });
    });

    const at = (code, value, time) => ({ properties: { monitoring_location_id: 'USGS-1', parameter_code: code, value, time } });
    const parse = features => usgs.parseRiver({ features }, { params: { flow: 'USGS-1', temp: 'USGS-1' } });

    it('keeps the newest reading whatever the order, per parameter', () => {
      const old = at('00010', '24', '2019-10-01T16:15:00+00:00'), cur = at('00010', '14.6', '2026-10-24T08:50:00+00:00');
      const f1 = at('00060', '3000', '2026-10-24T08:00:00+00:00'), f2 = at('00060', '3100', '2026-10-24T08:45:00+00:00');
      for (const order of [[old, cur, f1, f2], [cur, old, f2, f1], [f2, old, f1, cur]]) {
        const got = parse(order);
        expect(got.waterC.v).toBe(14.6);
        expect(got.flow.v).toBe(3100);
      }
    });

    it('keeps the later of two readings that share a time, as before, and one with a time that cannot be read', () => {
      const t = '2026-10-24T08:50:00+00:00';
      expect(parse([at('00060', '1', t), at('00060', '2', t)]).flow.v).toBe(2);
      expect(parse([at('00060', '1', 'nope'), at('00060', '2', t)]).flow.v).toBe(2);
      expect(parse([at('00060', '1', t), at('00060', '2', 'nope')]).flow.v).toBe(2);
    });
  });

  it('read the compared models from the binding, with MODELS as the default', () => {
    const d = { hourly: { time: [1], wind_speed_10m_gfs_seamless: [5], wind_speed_10m_icon_seamless: [7] } };
    expect(om.parseModels(d).ids).toEqual(['gfs_seamless', 'icon_seamless']);
    expect(om.parseModels(d, { params: { models: ['icon_seamless', 'gfs_seamless'] } })).toEqual({ ids: ['icon_seamless', 'gfs_seamless'], hours: [{ t: 1000, wind: [7, 5], precip: [null, null] }] });
    expect(om.parseModels(d, { params: { models: ['ecmwf_ifs025'] } }).ids).toEqual([]);
  });

  it("convert the station's units as before", () => {
    expect(nws.parseObs({ properties: { temperature: { value: 10 } } }).tempF).toBe(cToF(10));
  });
});

describe('src/sources', () => {
  const dir = new URL('../src/sources/', import.meta.url);
  const files = readdirSync(dir).filter(n => n.endsWith('.js'));
  // Files a module imports, read from its import lines.
  const imports = text => [...text.matchAll(/^import .* from '(.+)';$/gm)].map(m => m[1]);

  it('holds the four adapters and the index', () => {
    expect(files.sort()).toEqual(['index.js', 'nwps.js', 'nws.js', 'openmeteo.js', 'usgs.js']);
  });

  it('import only config.js, format.js and each other, and touch no DOM or storage', () => {
    for (const n of files) {
      const text = readFileSync(new URL(n, dir), 'utf8');
      for (const i of imports(text)) expect(['../config.js', '../format.js'].includes(i) || /^\.\/\w+\.js$/.test(i), `${n} imports ${i}`).toBe(true);
      expect(text, n).not.toMatch(/\b(document|window|localStorage|sessionStorage|navigator)\b/);
    }
  });

  it('are not imported by config.js or format.js, so there is no cycle', () => {
    for (const n of ['config.js', 'format.js']) {
      const text = readFileSync(new URL(`../src/${n}`, import.meta.url), 'utf8');
      expect(imports(text).filter(i => i.includes('sources')), n).toEqual([]);
    }
  });
});

// Records in data/ are written by hand from phase 1 (FD9). The validators cannot
// check an adapter against the fetchers, since location.js does not import them,
// and bindingsFor() skips a row it cannot fetch so that a page still draws. A
// misspelled adapter would then drop its slots with no error, and a zones ref
// would ask for alerts at the point. Both are caught here, where the files are.
describe('the stored records', () => {
  const read = dir => readdirSync(new URL(`../data/${dir}/`, import.meta.url)).filter(n => n.endsWith('.json'))
    .map(n => JSON.parse(readFileSync(new URL(`../data/${dir}/${n}`, import.meta.url), 'utf8')));
  const waterways = Object.fromEntries(read('waterways').map(w => [w.id, w]));
  // What the adapters cannot do with the rows a resolved location has.
  const problems = loc => {
    const out = [], bound = bindingsFor(loc).map(b => b.slot);
    for (const [slot, rows] of Object.entries(loc.sources)) {
      if (!bound.includes(slot)) out.push(`${slot}: no binding`);
      for (const r of rows) {
        if (!(PROVIDERS[r.adapter] || []).some(a => a.slot === slot)) out.push(`${slot}: no fetcher for ${r.adapter}`);
        // A zone list or a point; any other form would ask for the alerts at the point.
        if (r.adapter === 'nws-alerts' && !/^(point|zones):/.test(r.ref)) out.push(`${slot}: ${r.ref} is not a zone list or a point`);
      }
    }
    return out;
  };

  it('have a fetcher for every row, a binding for every slot and a zone list or a point for the alerts, in every file under data/', () => {
    const files = read('locations');
    expect(files.map(r => r.slug)).toContain('putney-landing');
    for (const r of files) expect(problems(resolveLocation(r, { waterway: waterways[r.waterway] ?? null })), r.slug).toEqual([]);
  });

  it('finds a misspelled adapter, a provider that lacks the slot, and an alerts ref in no form it reads', () => {
    const way = clone(PUTNEY_WATERWAY);
    expect(problems(locOf(() => {}, way))).toEqual([]);
    // The flow row fills river, flow and flowDays. river is still bound through the temperature row.
    way.sources[0].adapter = 'usgs-ogcc';
    expect(problems(locOf(() => {}, way))).toEqual([
      'river: no fetcher for usgs-ogcc', 'flow: no binding', 'flow: no fetcher for usgs-ogcc', 'flowDays: no binding', 'flowDays: no fetcher for usgs-ogcc'
    ]);
    // A provider that has no fetcher for this slot.
    expect(problems(locOf(r => { r.sources.find(s => s.role === 'obs').adapter = 'usgs-ogc'; }, PUTNEY_WATERWAY))).toEqual(['obs: no binding', 'obs: no fetcher for usgs-ogc']);
    expect(problems(locOf(r => { r.sources[0].ref = 'zones:VTZ015,VTC025'; }, PUTNEY_WATERWAY))).toEqual([]);
    expect(problems(locOf(r => { r.sources[0].ref = 'point:42.9607,-72.5219'; }, PUTNEY_WATERWAY))).toEqual([]);
    expect(problems(locOf(r => { r.sources[0].ref = 'station:KEEN'; }, PUTNEY_WATERWAY))).toEqual(['alerts: station:KEEN is not a zone list or a point']);
  });
});
