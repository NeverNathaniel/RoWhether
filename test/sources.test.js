import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PUTNEY, PUTNEY_RECORD, PUTNEY_WATERWAY } from '../src/putney.js';
import { resolveLocation } from '../src/location.js';
import { MODELS } from '../src/config.js';
import { cToF } from '../src/format.js';
import { SLOT_ORDER, ADAPTERS, bindingsFor, labelFor } from '../src/sources/index.js';
import * as nws from '../src/sources/nws.js';
import * as usgs from '../src/sources/usgs.js';
import * as nwps from '../src/sources/nwps.js';
import * as om from '../src/sources/openmeteo.js';
import * as data from '../src/data.js';
import { SCENARIOS, EXTRA_SCENARIOS } from './fixtures/golden.js';
import { VARIANTS } from './fixtures/variants.js';

// The parsers as src/data.js had them before P0.6, copied. They are the
// reference the adapters' parsers must equal. The gauge ids are written out
// where the old code read GAUGE_FLOW and GAUGE_TEMP, which P0.8 removed.
function alertLevel(ev) {
  return /Tornado|Thunderstorm|Flash Flood|Flood Warning|High Wind|Wind Advisory|Extreme Wind|Dense Fog|Winter Storm Warning|Ice Storm|Blizzard/i.test(ev) ? 2 : 1;
}
function parseAlerts(d) {
  return (d.features || []).map(f => {
    const p = f.properties || {};
    const start = Date.parse(p.onset || p.effective) || 0;
    const end = Date.parse(p.ends || p.expires) || 8.64e15;
    return { event: p.event || 'Alert', headline: p.headline || '', desc: p.description || '', instr: p.instruction || '', start, end, lvl: alertLevel(p.event || '') };
  });
}
function speedToMph(q) {
  if (!q || q.value == null) return null;
  if (/m_s-1/.test(q.unitCode || '')) return q.value * 2.23694;
  return q.value * 0.621371; // km/h
}
function parseObs(d) {
  const p = d.properties || {};
  return {
    t: Date.parse(p.timestamp) || null,
    tempF: p.temperature && p.temperature.value != null ? cToF(p.temperature.value) : null,
    wind: speedToMph(p.windSpeed), gust: speedToMph(p.windGust),
    dir: p.windDirection ? p.windDirection.value : null,
    text: p.textDescription || ''
  };
}
function parseRiver(d) {
  const out = {};
  for (const f of d.features || []) {
    const p = f.properties || {};
    const v = parseFloat(p.value), t = Date.parse(p.time);
    if (isNaN(v)) continue;
    if (p.monitoring_location_id === 'USGS-01154500' && p.parameter_code === '00060') out.flow = { v, t };
    if (p.monitoring_location_id === 'USGS-01161280' && p.parameter_code === '00010') out.waterC = { v, t };
  }
  return out;
}
function parseFlow(d) {
  return (d.features || [])
    .map(f => ({ t: Date.parse(f.properties.time), v: parseFloat(f.properties.value) }))
    .filter(x => !isNaN(x.t) && !isNaN(x.v))
    .sort((a, b) => a.t - b.t);
}

// Daily mean flow. Dates are local days; each point sits at noon Eastern
// (16:00 UTC is noon EDT, 11 AM EST, close enough for a daily point).
function parseFlowDays(d) {
  return (d.features || [])
    .map(f => ({ t: Date.parse(`${f.properties.time}T16:00:00Z`), v: parseFloat(f.properties.value) }))
    .filter(x => !isNaN(x.t) && !isNaN(x.v))
    .sort((a, b) => a.t - b.t);
}
// NWS stage and flow forecast. Flow is the secondary series, usually in kcfs.
// Missing values come as -999.
function parseFlowForecast(d) {
  const k = /kcfs/i.test(d.secondaryUnits || '') ? 1000 : 1;
  const pts = (d.data || [])
    .map(p => ({ t: Date.parse(p.validTime), v: typeof p.secondary === 'number' && p.secondary >= 0 ? p.secondary * k : NaN }))
    .filter(x => !isNaN(x.t) && !isNaN(x.v))
    .sort((a, b) => a.t - b.t);
  return { issued: Date.parse(d.issuedTime) || null, pts };
}

const num = v => (v == null || v === '' || isNaN(v) ? null : +v);

// Hourly US AQI and PM2.5 (µg/m³), with times in ms.
function parseAQ(d) {
  const H = d.hourly || {};
  return (H.time || [])
    .map((t, i) => ({ t: t * 1000, aqi: num(H.us_aqi && H.us_aqi[i]), pm25: num(H.pm2_5 && H.pm2_5[i]) }))
    .filter(x => x.aqi != null || x.pm25 != null);
}

// Hourly sustained wind and precipitation from each compared model, in the
// order of MODELS. A model missing from the response is left out.
function parseModels(d) {
  const H = d.hourly || {};
  const ids = MODELS.map(x => x.id).filter(id => H[`wind_speed_10m_${id}`] || H[`precipitation_${id}`]);
  const col = (k, id, i) => num(H[`${k}_${id}`] && H[`${k}_${id}`][i]);
  return {
    ids,
    hours: (H.time || []).map((t, i) => ({
      t: t * 1000,
      wind: ids.map(id => col('wind_speed_10m', id, i)),
      precip: ids.map(id => col('precipitation', id, i))
    }))
  };
}
const OLD = {
  wx: d => d, alerts: parseAlerts, obs: parseObs, river: parseRiver, flow: parseFlow,
  flowDays: parseFlowDays, flowFcst: parseFlowForecast, aq: parseAQ, models: parseModels
};

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

  it('derives the fetcher of each slot from the stored provider', () => {
    expect(bs.map(b => [b.slot, b.adapter])).toEqual([
      ['wx', 'om-forecast'], ['alerts', 'nws-alerts'], ['obs', 'nws-obs'], ['river', 'usgs-latest'], ['flow', 'usgs-recent'],
      ['flowDays', 'usgs-daily'], ['flowFcst', 'nwps-forecast'], ['aq', 'om-aq'], ['models', 'om-models']
    ]);
  });

  it("reads each slot's options from the stored rows", () => {
    expect(bs.map(b => b.params)).toEqual([
      {}, { point: '42.9607,-72.5219' }, { station: 'KEEN' }, { flow: 'USGS-01154500', temp: 'USGS-01161280' },
      { id: 'USGS-01154500' }, { id: 'USGS-01154500' }, { lid: 'WLPN3' }, {}, { models: MODELS.map(x => x.id) }
    ]);
    expect(by(bs, 'obs')).toMatchObject({ label: 'Keene', note: 'Keene airport, 14 mi east. A check on the model.' });
    expect(by(bs, 'wx')).toMatchObject({ label: null, note: null });
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

  it('takes the alerts point from the location when the ref is not a point', () => {
    const loc = locOf(r => { r.sources[0].ref = 'zones:VTZ015'; });
    expect(by(bindingsFor(loc), 'alerts').url).toBe('https://api.weather.gov/alerts/active?point=42.9607,-72.5219');
  });

  it('names a station by its id when the row has no label', () => {
    const loc = locOf(r => { delete r.sources[1].label; });
    expect(labelFor('obs', by(bindingsFor(loc), 'obs'))).toBe('KEEN observations');
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
  it('are re-exported by src/data.js under their old names', () => {
    const adapters = { ...nws, ...usgs, ...nwps, ...om };
    for (const name of ['alertLevel', 'speedToMph', 'parseAlerts', 'parseObs', 'parseRiver', 'parseFlow', 'parseFlowDays', 'parseFlowForecast', 'parseAQ', 'parseModels']) {
      expect(data[name], name).toBe(adapters[name]);
    }
  });

  // Every response the golden tests send: the scenarios at their clocks, and
  // the variants' cut, emptied and extreme data.
  const scenarios = { ...SCENARIOS, ...EXTRA_SCENARIOS };
  const sends = [];
  for (const sc of Object.values(scenarios)) {
    for (const hr of sc.clocks.length ? sc.clocks : [12]) sends.push([`${sc.name} at ${hr}`, () => sc.raw(sc.clock(hr))]);
  }
  for (const v of VARIANTS) {
    const sc = scenarios[v.scenario], clock = v.at ?? sc.clock(v.hr);
    if (v.raw) sends.push([v.name, () => { const raw = sc.raw(clock); v.raw(raw, clock); return raw; }]);
  }

  it.each(sends)('equal the old ones on the golden responses: %s', (name, make) => {
    const raw = make();
    for (const b of bindingsFor(PUTNEY)) {
      const want = OLD[b.slot](raw[b.slot]);
      expect(b.parse(raw[b.slot], b), b.slot).toEqual(want);
      expect(ADAPTERS[b.adapter].parse(raw[b.slot], b, PUTNEY), b.slot).toEqual(want);
    }
  });

  it('are not compared on empty results alone', () => {
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

  it.each(SLOT_ORDER)('equal the old ones on the recorded response: %s', slot => {
    const b = by(bindingsFor(PUTNEY), slot), raw = recorded(slot);
    expect(b.parse(raw, b)).toEqual(OLD[slot](raw));
  });

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

  it('equal the old ones on alerts recorded in another zone', () => {
    const b = by(bindingsFor(PUTNEY), 'alerts'), raw = recorded('alerts-elsewhere');
    const got = b.parse(raw, b);
    expect(got).toEqual(OLD.alerts(raw));
    expect(got.map(a => [a.event, a.lvl])).toEqual([['Rip Current Statement', 1], ['Flood Warning', 2], ['High Surf Advisory', 1]]);
    // The Flood Warning has no end time and ends when it expires.
    expect(got[1].end).toBe(Date.parse('2026-10-18T23:00:00-04:00'));
  });

  // Input the real APIs rarely send, in the shapes the golden probes use.
  const f = p => ({ properties: p });
  const odd = {
    alerts: [{}, { features: [] }, { features: [{}] }, { features: [f({ event: 'Flood Watch', effective: '2026-04-14T10:00:00-04:00', expires: '2026-04-15T10:00:00-04:00' })] }, { features: [f({ event: 'High Wind Warning', onset: 'not a date', ends: 'x' })] }],
    obs: [{}, { properties: {} }, { properties: { timestamp: '2026-04-14T15:53:00+00:00', temperature: { value: 10 }, windSpeed: { value: 18, unitCode: 'wmoUnit:km_h-1' }, windGust: { value: null }, windDirection: { value: 250 }, textDescription: 'Cloudy' } }, { properties: { timestamp: 'nope', temperature: { value: 0 }, windSpeed: { value: 5, unitCode: 'wmoUnit:m_s-1' }, windDirection: null } }],
    river: [{}, { features: [] }, { features: [
      f({ monitoring_location_id: 'USGS-01154500', parameter_code: '00060', value: '12000', time: '2026-04-14T15:00:00+00:00' }),
      f({ monitoring_location_id: 'USGS-01161280', parameter_code: '00010', value: '8.5', time: '2026-04-14T15:00:00+00:00' }),
      f({ monitoring_location_id: 'USGS-01154500', parameter_code: '00010', value: '9' }),
      f({ monitoring_location_id: 'USGS-01161280', parameter_code: '00060', value: '999' }),
      f({ parameter_code: '00060', value: '7' }), f({ monitoring_location_id: 'USGS-01154500', parameter_code: '00060', value: 'Ice' }), {}
    ] }],
    flow: [{}, { features: [] }, { features: [f({ time: '2026-04-14T15:00:00+00:00', value: '100' }), f({ time: '2026-04-14T14:00:00+00:00', value: '90' }), f({ time: 'bad', value: '5' }), f({ time: '2026-04-14T14:45:00+00:00', value: 'x' })] }],
    flowDays: [{}, { features: [f({ time: '2026-04-12', value: '9000' }), f({ time: '2026-04-10', value: '8000' }), f({ time: 'nope', value: '1' })] }],
    flowFcst: [{}, { data: [] }, { issuedTime: '2026-04-14T12:00:00Z', secondaryUnits: 'kcfs', data: [{ validTime: '2026-04-14T18:00:00Z', secondary: 12.4 }, { validTime: '2026-04-14T12:00:00Z', secondary: 11.1 }, { validTime: '2026-04-15T00:00:00Z', secondary: -999 }, { validTime: '2026-04-15T06:00:00Z', secondary: '4' }] }],
    aq: [{}, { hourly: {} }, { hourly: { time: [1, 2, 3, 4], us_aqi: [10, null, '', 'x'], pm2_5: [1.5, 2, null, null] } }, { hourly: { time: [1, 2], pm2_5: [3, 4] } }],
    models: [{}, { hourly: {} }, { hourly: { time: [1, 2], wind_speed_10m_gfs_seamless: [5, null], precipitation_gfs_seamless: [0.1, 0], wind_speed_10m_icon_seamless: [7, 8] } }, { hourly: { time: [1, 2, 3], wind_speed_10m_gem_seamless: [1, '', 'x'], precipitation_gem_seamless: [null, 0, '0.3'] } }, { hourly: { time: [1], precipitation_ecmwf_ifs025: [0.2] } }]
  };

  it.each(Object.keys(odd))('equal the old ones on odd input: %s', slot => {
    const b = by(bindingsFor(PUTNEY), slot);
    for (const input of odd[slot]) expect(b.parse(input, b)).toEqual(OLD[slot](input));
  });

  it('equal the old ones on alert names and wind units', () => {
    const events = ['Tornado Warning', 'Severe Thunderstorm Watch', 'Flash Flood Watch', 'Flood Warning', 'Flood Advisory', 'High Wind Warning', 'Wind Advisory', 'Extreme Wind Warning', 'Dense Fog Advisory', 'Dense Smoke Advisory', 'Winter Storm Warning', 'Winter Weather Advisory', 'Ice Storm Warning', 'Blizzard Warning', 'Frost Advisory', 'Heat Advisory', 'Small Craft Advisory', 'Lake Wind Advisory', 'tornado warning', 'DENSE FOG ADVISORY', ''];
    for (const e of events) expect(nws.alertLevel(e), e).toBe(alertLevel(e));
    expect(events.map(e => nws.alertLevel(e))).toContain(2);
    expect(events.map(e => nws.alertLevel(e))).toContain(1);
    const q = (value, unitCode) => ({ value, unitCode });
    for (const v of [null, undefined, {}, q(null, 'wmoUnit:km_h-1'), q(10, 'wmoUnit:km_h-1'), q(10, 'wmoUnit:m_s-1'), q(10), q(0, 'wmoUnit:km_h-1'), q('10', 'wmoUnit:km_h-1')]) expect(nws.speedToMph(v)).toEqual(speedToMph(v));
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
