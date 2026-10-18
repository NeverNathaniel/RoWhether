// The US units (08 14.2 P0.11). Every expected string is a literal, copied from
// what the code wrote before this step: the template literals of assess(),
// fogRisk() and confidenceText() in src/logic.js, the amounts in the rain view
// and the thresholds in the fog view's text, fmtFlow() and visText() in
// src/format.js, run on these values. None is computed by src/units.js, so a
// change to a rounding or a unit word shows here.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { HOUR } from '../src/config.js';
import { setZone, dayKey, localHour } from '../src/format.js';
import { effectiveSettings, resolveLocation } from '../src/location.js';
import { PUTNEY, PUTNEY_RECORD, PUTNEY_WATERWAY } from '../src/putney.js';
import { app } from '../src/state.js';
import { buildModel, assess, fogRisk, confidenceText } from '../src/logic.js';
import { unitFormat } from '../src/units.js';
import * as windView from '../src/render/detail/wind.js';
import * as weekView from '../src/render/detail/week.js';
import { installFakeDom, uninstallFakeDom } from './helpers/fakedom.js';
import { T0, wx } from './helpers/forecast.js';

const u = unitFormat();

describe('unitFormat, US', () => {
  it('names the system and the wind unit', () => {
    expect(u.system).toBe('us');
    expect(u.windUnit).toBe('mph');
    expect(u.speedUnit).toBe('mph');
  });

  it('writes wind speed as whole miles an hour: `Wind ${w} mph`', () => {
    expect(u.speed(12)).toBe('12 mph');
    expect(u.speed(12.4)).toBe('12 mph');
    expect(u.speed(12.5)).toBe('13 mph');
    expect(u.speed(26.49)).toBe('26 mph');
    expect(u.speed(0)).toBe('0 mph');
    expect(u.speed(9.4)).toBe('9 mph'); // "models differ by about 9 mph on wind"
  });

  it('writes air and water temperature as whole degrees Fahrenheit: `${r0(h.temp)}°F`', () => {
    expect(u.temp(38)).toBe('38°F');
    expect(u.temp(37.6)).toBe('38°F');
    expect(u.temp(72.5)).toBe('73°F');
    expect(u.temp(31.5)).toBe('32°F');
    expect(u.temp(0)).toBe('0°F');
    expect(u.temp(-3.6)).toBe('-4°F');
    expect(u.temp(-0.4)).toBe('0°F');
  });

  it('writes air plus water as whole degrees: `air plus water ${sum}°F`', () => {
    expect(u.tempSum(100)).toBe('100°F');
    expect(u.tempSum(97)).toBe('97°F');
    expect(u.tempSum(96.6)).toBe('97°F');
    expect(u.tempSum(83.2)).toBe('83°F');
  });

  it('writes a temperature difference: the fog view says "within 2°F" and "at least 18°F warmer"', () => {
    for (const v of [2, 4, 10, 18]) expect(u.tempDiff(v)).toBe(`${v}°F`);
    // No text has a fraction yet. 07 7.3 gives a difference one decimal.
    expect(u.tempDiff(1.66)).toBe('1.7°F');
    expect(u.tempDiff(1.5)).toBe('1.5°F');
  });

  it('writes rain with two decimals in inches: `${h.precip.toFixed(2)} in`', () => {
    expect(u.precip(0.2)).toBe('0.20 in');
    expect(u.precip(0.15)).toBe('0.15 in');
    expect(u.precip(0.01)).toBe('0.01 in');
    expect(u.precip(1.236)).toBe('1.24 in');
    expect(u.precip(0.004)).toBe('0.00 in');
  });

  it('writes a rate the way the rain view says it: "0.15 in an hour or more"', () => {
    expect(u.rate(0.15)).toBe('0.15 in an hour');
    expect(u.rate(0.1)).toBe('0.10 in an hour');
    expect(u.rate(0.3)).toBe('0.30 in an hour');
  });

  it('writes the visibility of a reason in miles with one decimal: `Visibility ${vm.toFixed(1)} mi`', () => {
    expect(u.vis(1000)).toBe('0.6 mi');
    expect(u.vis(804.67)).toBe('0.5 mi');
    expect(u.vis(1500)).toBe('0.9 mi');
    expect(u.vis(1200)).toBe('0.7 mi');
    expect(u.vis(402.4)).toBe('0.3 mi');
    expect(u.vis(1590)).toBe('1.0 mi'); // a reason can round up to a whole mile
    expect(u.vis(1045.9)).toBe('0.6 mi'); // 0.6499 miles: a mile taken as 1609 m rounds it up to 0.7
  });

  it('writes a distance as visText() does: two decimals under a mile, one under ten, 10+ above', () => {
    expect(u.dist(1000)).toBe('0.62 mi');
    expect(u.dist(402.3)).toBe('0.25 mi');
    expect(u.dist(0)).toBe('0.00 mi');
    expect(u.dist(1609.34)).toBe('1.0 mi');
    expect(u.dist(8000)).toBe('5.0 mi');
    expect(u.dist(16000)).toBe('9.9 mi');
    expect(u.dist(16093.4)).toBe('10+ mi');
    expect(u.dist(24000)).toBe('10+ mi');
    expect(u.dist(null)).toBe('--');
  });

  it('writes a flow in the unit of its gauge, cubic feet a second when none is named: fmtFlow()', () => {
    expect(u.flow(22000, 'cfs')).toBe('22,000 cfs');
    expect(u.flow(22000)).toBe('22,000 cfs');
    expect(u.flow(999.5)).toBe('1,000 cfs');
    expect(u.flow(120.4, 'm3s')).toBe('120 m³/s');
    expect(u.flow(12.34, 'm3s')).toBe('12.3 m³/s');
    expect(u.flow(5.678, 'm3s')).toBe('5.68 m³/s');
    expect(u.flow(8.24, 'ft')).toBe('8.2 ft');
    expect(u.flow(2.451, 'm')).toBe('2.45 m');
  });

  it('writes a stage in the unit of its gauge, feet when none is named', () => {
    expect(u.stage(8.24)).toBe('8.2 ft');
    expect(u.stage(8.24, 'ft')).toBe('8.2 ft');
    expect(u.stage(2.451, 'm')).toBe('2.45 m');
    expect(u.stage(7.96)).toBe('8.0 ft');
  });

  it('writes the air quality index: `Air quality AQI ${q}` and the fact `AQI ${r0(cur.aqi)}`', () => {
    expect(u.aqi(160)).toBe('AQI 160');
    expect(u.aqi(52.4)).toBe('AQI 52');
    expect(u.aqi(201)).toBe('AQI 201');
  });

  it('names the fog stay off line in words: "Fog, visibility under a quarter mile"', () => {
    expect(u.visOff).toBe('a quarter mile');
  });

  it('takes a typed value as it is: the internal units are the US ones', () => {
    // A float is kept whole (07 7.4), and a unit never moves it.
    for (const f of ['toMph', 'toF', 'toFDiff', 'toFSum', 'toIn']) {
      expect(u[f](12.42742), f).toBe(12.42742);
      expect(u[f](0), f).toBe(0);
      expect(u[f](-3.5), f).toBe(-3.5);
    }
  });

  it('is the same with no argument, the defaults, or a US wind unit', () => {
    const keys = o => Object.keys(o).sort();
    for (const v of [unitFormat(), unitFormat({}), unitFormat({ system: 'us', wind: 'auto' }), unitFormat({ system: 'us', wind: 'mph' })]) {
      expect(keys(v)).toEqual(keys(u));
      expect(v.system).toBe('us');
      expect(v.windUnit).toBe('mph');
      expect(v.speed(12)).toBe('12 mph');
      expect(v.temp(38)).toBe('38°F');
    }
  });

  it('has the names 07 7.7 prints, and no others but the words the reasons use', () => {
    expect(Object.keys(u).sort()).toEqual([
      'aqi', 'dist', 'flow', 'precip', 'rate', 'speed', 'speedUnit', 'stage', 'system', 'temp', 'tempDiff', 'tempSum',
      'toF', 'toFDiff', 'toFSum', 'toIn', 'toMph', 'vis', 'visOff', 'windUnit'
    ]);
  });

  it('refuses a system or a wind unit that is not built yet, so no US number is labeled as another', () => {
    for (const bad of [{ system: 'metric' }, { system: 'uk' }, { system: 'us', wind: 'kn' }, { system: 'us', wind: 'kmh' }, { system: 'us', wind: 'ms' }, { wind: 'ms' }, { system: 'US' }]) {
      expect(() => unitFormat(bad), JSON.stringify(bad)).toThrow(RangeError);
    }
  });
});

// What the logic and the views take from m.u. The golden files cannot tell a
// string written through m.u from one that still has its unit typed in, since
// both are US text. A model whose formatters mark every value can.
const SETTINGS = effectiveSettings(PUTNEY);
const NOON = T0 + 12 * HOUR;
const RIVER = { flow: { v: 6000, t: NOON }, waterC: { v: 20, t: NOON } }; // 68°F water
const build = (over, extra = {}, loc = PUTNEY, S = SETTINGS) => buildModel(loc, { wx: wx(over), river: RIVER, ...extra }, { ...S }, NOON);
const MARK = {
  speed: v => `S(${v})`, temp: v => `T(${v})`, tempSum: v => `TS(${v})`, vis: v => `V(${v})`,
  aqi: v => `Q(${v})`, flow: (v, unit) => `F(${v} ${unit})`, visOff: 'VO'
};
const marked = m => ({ ...m, u: { ...m.u, ...MARK } });
const hourAt = (m, hr) => m.hours.find(h => dayKey(h.t) === dayKey(NOON) && localHour(h.t) === hr);
// The reasons of one key for the hour at noon, as [level, text].
const why = (m, key, hr = 12) => assess(marked(m), hourAt(m, hr)).reasons.filter(r => r.key === key).map(r => [r.lvl, r.text]);

describe('buildModel takes the units', () => {
  it('gives the model the US formatters when no units are named', () => {
    const m = build();
    expect(m.u.system).toBe('us');
    expect(m.u.speed(12)).toBe('12 mph');
    expect(Object.keys(m.u).sort()).toEqual(Object.keys(unitFormat()).sort());
  });

  it('reads the units of its last argument', () => {
    const at = units => buildModel(PUTNEY, { wx: wx(), river: RIVER }, { ...SETTINGS }, NOON, { units });
    expect(at({ system: 'us', wind: 'mph' }).u.windUnit).toBe('mph');
    expect(() => at({ system: 'metric' })).toThrow(RangeError);
    expect(() => at({ system: 'us', wind: 'kn' })).toThrow(RangeError);
  });
});

// A reason hands its formatter the value as the forecast has it, with a fraction
// in these tests, because each unit rounds in its own way (07 7.3): the logic
// decides on the rounded value and writes the plain one.
describe('the reasons write their units through m.u', () => {
  it('writes a wind and a gust, at both levels', () => {
    expect(why(build(() => ({ wind: 12.4, gust: 20.6 })), 'wind')).toEqual([[1, 'Wind S(12.4)']]);
    expect(why(build(() => ({ wind: 12.4, gust: 20.6 })), 'gust')).toEqual([[1, 'Gusts to S(20.6)']]);
    expect(why(build(() => ({ wind: 16.2, gust: 26.3 })), 'wind')).toEqual([[2, 'Wind S(16.2)']]);
    expect(why(build(() => ({ wind: 16.2, gust: 26.3 })), 'gust')).toEqual([[2, 'Gusts to S(26.3)']]);
  });

  it('writes the visibility of a caution and the fog line of a stay off', () => {
    expect(why(build(() => ({ vis: 1000 })), 'fog')).toEqual([[1, 'Visibility V(1000)']]);
    expect(why(build(() => ({ vis: 300 })), 'fog')).toEqual([[2, 'Fog, visibility under VO']]);
  });

  it('writes the freezing air and the cold line', () => {
    const m = build(() => ({ temp: 30.5 }));
    expect(why(m, 'freeze')).toEqual([[2, 'Below freezing at T(30.5), ice on docks and oarlocks']]);
    // 30.5 air plus 68 water, under the 100 line.
    expect(why(m, 'cold')).toEqual([[1, 'Cold water, air plus water TS(98.5)']]);
  });

  it('writes a high and an elevated flow in the unit of the gauge', () => {
    const flow = v => ({ river: { ...RIVER, flow: { v, t: NOON } } });
    expect(why(build(undefined, flow(28500.5)), 'flow')).toEqual([[2, 'High water at F(28500.5 cfs)']]);
    expect(why(build(undefined, flow(22000.5)), 'flow')).toEqual([[1, 'Elevated flow at F(22000.5 cfs)']]);
    // A gauge in cubic metres a second says so, and a place with no flow record falls back to cfs.
    const cubic = resolveLocation({ ...PUTNEY_RECORD, flow: { ...PUTNEY_RECORD.flow, unit: 'm3s' } }, { waterway: PUTNEY_WATERWAY });
    expect(why(build(undefined, flow(28500), cubic), 'flow')).toEqual([[2, 'High water at F(28500 m3s)']]);
    expect(why(build(undefined, flow(22000), cubic), 'flow')).toEqual([[1, 'Elevated flow at F(22000 m3s)']]);
    const none = resolveLocation({ ...PUTNEY_RECORD, flow: null }, { waterway: PUTNEY_WATERWAY });
    expect(why(build(undefined, flow(28500), none), 'flow')).toEqual([[2, 'High water at F(28500 undefined)']]);
    expect(why(build(undefined, flow(22000), none), 'flow')).toEqual([[1, 'Elevated flow at F(22000 undefined)']]);
  });

  it('writes the unit of a flow as the real formatter does for a gauge in cubic metres', () => {
    const cubic = resolveLocation({ ...PUTNEY_RECORD, flow: { ...PUTNEY_RECORD.flow, unit: 'm3s' } }, { waterway: PUTNEY_WATERWAY });
    const m = build(undefined, { river: { ...RIVER, flow: { v: 28500, t: NOON } } }, cubic);
    expect(assess(m, hourAt(m, 12)).reasons.find(r => r.key === 'flow').text).toBe('High water at 28,500 m³/s');
  });

  it('writes the air quality', () => {
    const aq = q => ({ aq: [{ t: NOON, aqi: q, pm25: 5 }] });
    expect(why(build(undefined, aq(160.4)), 'aqi')).toEqual([[1, 'Air quality Q(160.4), unhealthy']]);
    expect(why(build(undefined, aq(220.4)), 'aqi')).toEqual([[2, 'Air quality Q(220.4), very unhealthy']]);
  });

  it('writes the temperatures of a steam fog', () => {
    // 5 AM, calm, air at 40.5 over water at 66.5 (a reading set in Settings), with the dew point 5 below the air so no valley fog competes.
    const m = build(() => ({ temp: 40.5, dew: 35.5, wind: 2, cloud: 90 }), {}, PUTNEY, { ...SETTINGS, waterOverride: '66.5' });
    const f = fogRisk(marked(m), hourAt(m, 5));
    expect(f).toMatchObject({ type: 'steam', risk: 2, why: 'Water T(66.5) under T(40.5) air.' });
  });
});

describe('confidenceText takes the units as its third argument', () => {
  const c = { level: 'low', wind: 9.4, rain: 0.6, n: 4 };
  it('writes the wind spread through them, and rounds it there', () => {
    expect(confidenceText(c, null, MARK)).toBe('Low confidence: models differ by about S(9.4) on wind, and models split on rain.');
    expect(confidenceText(c, 'wind', MARK)).toBe('Low confidence: models differ by about S(9.4) on wind.');
  });
  it('writes no speed where the wind is not in it', () => {
    expect(confidenceText(c, 'rain', MARK)).toBe('Low confidence: models split on rain.');
    expect(confidenceText({ level: 'high', wind: 2, rain: 0, n: 4 }, null, MARK)).toBe('High confidence: the 4 models agree.');
  });
  it('is in US units with no third argument', () => {
    expect(confidenceText(c)).toBe('Low confidence: models differ by about 9 mph on wind, and models split on rain.');
  });
});

describe('the views pass m.u to confidenceText', () => {
  afterEach(() => { uninstallFakeDom(); setZone('America/New_York'); vi.useRealTimers(); });
  // Two models 12 mph apart every hour: low confidence on wind.
  const apart = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOON);
    installFakeDom({ width: 390 });
    const probe = build();
    const models = { ids: ['a', 'b'], hours: probe.hours.map(h => ({ t: h.t, wind: [2, 14], precip: [0, 0] })) };
    const m = build(undefined, { models });
    Object.assign(app, { loc: PUTNEY, model: m, settings: SETTINGS, data: m.data, errors: {} });
    m.u = { ...m.u, ...MARK };
    return m;
  };

  it('writes the wind view note in the units of the model', () => {
    expect(windView.render(apart()).html).toContain('Low confidence: models differ by about S(12) on wind.');
  });

  it('writes the week view note in the units of the model', () => {
    expect(weekView.render(apart()).html).toContain('Low confidence: models differ by about S(12) on wind.');
  });
});
