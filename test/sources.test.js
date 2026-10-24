import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PUTNEY, PUTNEY_RECORD, PUTNEY_WATERWAY } from '../src/putney.js';
import { resolveLocation } from '../src/location.js';
import { MODELS } from '../src/config.js';
import { cToF } from '../src/format.js';
import { SLOT_ORDER, ADAPTERS, PROVIDERS, bindingsFor, labelFor } from '../src/sources/index.js';
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
    expect(by(bs, 'river').url).toBe('https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items?monitoring_location_id=USGS-01154500,USGS-01161280&parameter_code=00060,00010&f=json');
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
      { id: 'USGS-01154500' }, { id: 'USGS-01154500' }, { lid: 'WLPN3' }, {}, { models: MODELS.map(x => x.id) }
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
    expect(by(bs, 'flowDays').params).toEqual({ id: 'USGS-01154500' });
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

  it('follow the Adapter typedef, with phase 0 timing left empty', () => {
    for (const a of all) {
      expect(a.via).toBe('browser');
      expect(a.refreshMs).toBeNull();
      expect(a.staleMs).toBeNull();
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
    const levels = [['Tornado Warning', 2], ['Severe Thunderstorm Watch', 2], ['Flash Flood Watch', 2], ['Flood Warning', 2], ['Flood Advisory', 1], ['High Wind Warning', 2], ['Wind Advisory', 2], ['Extreme Wind Warning', 2], ['Dense Fog Advisory', 2], ['Dense Smoke Advisory', 1], ['Winter Storm Warning', 2], ['Winter Weather Advisory', 1], ['Ice Storm Warning', 2], ['Blizzard Warning', 2], ['Frost Advisory', 1], ['Heat Advisory', 1], ['Small Craft Advisory', 1], ['Lake Wind Advisory', 2], ['tornado warning', 2], ['DENSE FOG ADVISORY', 2], ['', 1]];
    for (const [event, lvl] of levels) expect(nws.alertLevel(event), event).toBe(lvl);
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
