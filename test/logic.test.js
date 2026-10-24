import { describe, it, expect } from 'vitest';
import { HOUR, MIN } from '../src/config.js';
import { dayKey, localHour, lowerFirst } from '../src/format.js';
import { precipKind, rateWord, precipSummary, buildModel, sunOn, uvWord, rowingHours, callRuns, factorRuns, worstReasons, aqiWord, confidence, confidenceText, planSessions, factorLevel, worstOf, flowForecastAt, flowForecastPeak, chopWind, waterState, debrisLikely, waterWhy, relWind, windVsCourse, flowTrend, sunFor, lightAt, lvlExcept, fogRisk, morningFog, nextMorning, fogLift, relHumidity, flowNow, flowForCall, waterTemp, waterSource, waterOverridden, bound, notChecked, notCheckedText } from '../src/logic.js';
import { parseAlerts, parseObs, alertLevel } from '../src/sources/nws.js';
import { parseRiver, parseFlow, parseFlowDays } from '../src/sources/usgs.js';
import { parseFlowForecast } from '../src/sources/nwps.js';
import { parseAQ, parseModels } from '../src/sources/openmeteo.js';
import { PUTNEY, PUTNEY_RECORD, PUTNEY_WATERWAY } from '../src/putney.js';
import { resolveLocation, effectiveSettings } from '../src/location.js';
import { bindingsFor } from '../src/sources/index.js';
import { T0, wx } from './helpers/forecast.js';

// Putney's limits as the app holds them, without the heading (it lives in the course).
const SETTINGS = effectiveSettings(PUTNEY);

const NOON = T0 + 12 * HOUR;

const RIVER = { flow: { v: 6000, t: NOON }, waterC: { v: 20, t: NOON } }; // 68°F water
const model = (over, S = SETTINGS, extra = {}) => buildModel(PUTNEY, { wx: wx(over), river: RIVER, ...extra }, { ...S }, NOON);
const hourAt = (m, localHr) => m.hours.find(h => dayKey(h.t) === dayKey(NOON) && localHour(h.t) === localHr);
const hourAt2 = (m, t) => m.hours.find(h => h.t === t);

describe('format helpers', () => {
  it('keys days and hours in Eastern time', () => {
    expect(dayKey(T0)).toBe('2026-06-15');
    expect(localHour(T0)).toBe(0);
    expect(localHour(NOON)).toBe(12);
  });
  it('lowercases only the first letter, keeping units', () => {
    expect(lowerFirst('Cold water, air plus water 97°F')).toBe('cold water, air plus water 97°F');
  });
});

describe('sun and light', () => {
  const m = model();
  it('puts June sunrise and sunset at Putney in the expected range', () => {
    const s = sunFor(m, '2026-06-15');
    expect(localHour(s.sunrise)).toBe(5);
    expect(localHour(s.sunset)).toBe(20);
    expect(s.dawn).toBeLessThan(s.sunrise);
    expect(s.dusk).toBeGreaterThan(s.sunset);
  });
  it('classifies dark, twilight and day', () => {
    const s = sunFor(m, '2026-06-15');
    expect(lightAt(m, T0 + 2 * HOUR)).toBe('dark');
    expect(lightAt(m, s.sunrise - MIN)).toBe('twilight');
    expect(lightAt(m, NOON)).toBe('day');
  });
});

describe('wind vs course', () => {
  it('measures wind relative to the upstream heading', () => {
    expect(relWind(15, 15)).toBe(0);
    expect(Math.abs(relWind(195, 15))).toBe(180);
    expect(relWind(105, 15)).toBe(90);
    expect(relWind(285, 15)).toBe(-90);
  });
  it('describes head, tail and crosswinds', () => {
    const m = model();
    expect(windVsCourse(m, 15, 6)).toMatch(/^Headwind rowing upstream/);
    expect(windVsCourse(m, 195, 6)).toMatch(/^Tailwind rowing upstream/);
    expect(windVsCourse(m, 105, 6)).toBe('Crosswind off the New Hampshire bank.');
    expect(windVsCourse(m, 285, 6)).toBe('Crosswind off the Vermont bank.');
    expect(windVsCourse(m, 15, 2)).toBe('Near calm on the course.');
    expect(windVsCourse(m, 15, 10)).toMatch(/Chop builds/);
  });
});

describe('assess', () => {
  it('calls a calm warm midday go', () => {
    const m = model();
    expect(hourAt(m, 12).a.lvl).toBe(0);
  });
  it('calls dark hours stay off', () => {
    const a = hourAt(model(), 2).a;
    expect(a.lvl).toBe(2);
    expect(a.reasons[0].key).toBe('dark');
  });
  it('applies wind and gust thresholds', () => {
    const lvl = (w, g) => hourAt(model((i, t) => (t === NOON ? { wind: w, gust: g } : {})), 12).a.lvl;
    expect(lvl(9, 12)).toBe(0);
    expect(lvl(10, 12)).toBe(1);
    expect(lvl(15, 20)).toBe(2);
    expect(lvl(5, 18)).toBe(1);
    expect(lvl(5, 25)).toBe(2);
  });
  it('applies rain chance thresholds from settings', () => {
    const at = (pop, S = SETTINGS) => hourAt(model((i, t) => (t === NOON ? { pop } : {}), S), 12).a;
    expect(at(55).lvl).toBe(0);
    expect(at(60).lvl).toBe(1);
    expect(at(60).reasons[0]).toMatchObject({ key: 'pop', text: 'Rain chance 60%' });
    expect(at(90).lvl).toBe(2);
    // A blank level is off.
    expect(at(95, { ...SETTINGS, rainOff: '' }).lvl).toBe(1);
    expect(at(95, { ...SETTINGS, rainCaution: '', rainOff: '' }).lvl).toBe(0);
  });
  it('applies flow limits from settings, and a blank limit is off', () => {
    const at = (v, S = SETTINGS) => hourAt(buildModel(PUTNEY, { wx: wx(), river: { ...RIVER, flow: { v, t: NOON } } }, { ...S }, NOON), 12).a;
    expect(at(19999).lvl).toBe(0);
    expect(at(20000).reasons[0]).toMatchObject({ lvl: 1, key: 'flow', text: 'Elevated flow at 20,000 cfs' });
    expect(at(28000).reasons[0]).toMatchObject({ lvl: 2, key: 'flow', text: 'High water at 28,000 cfs' });
    // A blank stay off level leaves caution; a blank caution level leaves stay off.
    expect(at(30000, { ...SETTINGS, flowOff: '' }).lvl).toBe(1);
    expect(at(25000, { ...SETTINGS, flowCaution: '' }).lvl).toBe(0);
    expect(at(28000, { ...SETTINGS, flowCaution: '' }).lvl).toBe(2);
    // Both blank is no flow reason at any flow. A '' compares as 0, so without the test every reading was stay off.
    const none = { ...SETTINGS, flowCaution: '', flowOff: '' };
    for (const v of [0, 3000, 30000, 500000]) expect(at(v, none), `${v} cfs`).toMatchObject({ lvl: 0, reasons: [] });
  });
  it('has no flow reason at a place whose record sets no flow limits', () => {
    const { flowCaution, flowOff, ...rest } = PUTNEY_RECORD.thresholds;
    const loc = resolveLocation({ ...PUTNEY_RECORD, slug: 'bay-w', thresholds: rest }, { waterway: PUTNEY_WATERWAY });
    const S = effectiveSettings(loc);
    expect(S).toMatchObject({ flowCaution: '', flowOff: '' });
    const m = buildModel(loc, { wx: wx(), river: { ...RIVER, flow: { v: 30000, t: NOON } } }, S, NOON);
    expect(hourAt(m, 12).a).toMatchObject({ lvl: 0, reasons: [] });
    expect(m.cur.a.reasons.map(r => r.key)).not.toContain('flow');
    // The reading applies to every hour, so every period that is left is Go too.
    const left = m.days.flatMap(d => d.periods).filter(p => !p.past);
    expect(left.length).toBeGreaterThan(0);
    for (const p of left) expect(p.lvl, p.name).toBe(0);
  });
  it('flags thunderstorms, storm risk, freezing rain and snow', () => {
    const at = o => hourAt(model((i, t) => (t === NOON ? o : {})), 12).a;
    expect(at({ code: 95 }).lvl).toBe(2);
    expect(at({ cape: 1500, pop: 40 }).reasons.map(r => r.key)).toContain('stormrisk');
    expect(at({ code: 66 }).lvl).toBe(2);
    expect(at({ code: 73 }).reasons.map(r => r.key)).toContain('snow');
    expect(at({ precip: 0.2 }).reasons.map(r => r.key)).toContain('rain');
  });
  it('flags low visibility and likely valley fog', () => {
    const at = (hr, o) => hourAt(model((i, t) => (localHour(t) === hr ? o : {})), hr).a;
    expect(at(12, { vis: 300 }).lvl).toBe(2);
    expect(at(12, { vis: 1000 }).lvl).toBe(1);
    expect(at(8, { temp: 60, dew: 59, wind: 2 }).reasons.map(r => r.key)).toContain('fog');
  });
  it('applies the air plus water cold line and freezing air', () => {
    const at = o => hourAt(model((i, t) => (t === NOON ? o : {})), 12).a;
    expect(at({ temp: 31 }).lvl).toBe(2);
    expect(at({ temp: 31 }).reasons.map(r => r.key)).toContain('freeze');
    // Gauge water is 68°F. 31 + 68 = 99 is under the 100 line, 33 + 68 = 101 is not.
    expect(at({ temp: 31 }).reasons.map(r => r.key)).toContain('cold');
    expect(at({ temp: 33 }).reasons.map(r => r.key)).not.toContain('cold');
  });
  it('uses the water override from settings', () => {
    const m = model((i, t) => (t === NOON ? { temp: 50 } : {}), { ...SETTINGS, waterOverride: '40' });
    expect(hourAt(m, 12).a.reasons.map(r => r.key)).toContain('cold');
  });
  it('applies flow thresholds', () => {
    const at = v => hourAt(buildModel(PUTNEY, { wx: wx(), river: { ...RIVER, flow: { v, t: NOON } } }, { ...SETTINGS }, NOON), 12).a.lvl;
    expect(at(19999)).toBe(0);
    expect(at(20000)).toBe(1);
    expect(at(28000)).toBe(2);
  });
  it('applies NWS alerts only to the hours they cover', () => {
    const alerts = [{ event: 'Wind Advisory', start: NOON, end: NOON + 2 * HOUR, lvl: 2 }];
    const m = model(undefined, SETTINGS, { alerts });
    expect(hourAt(m, 12).a.lvl).toBe(2);
    expect(hourAt(m, 15).a.lvl).toBe(0);
  });
  it('drops expired alerts', () => {
    const alerts = [{ event: 'Dense Fog Advisory', start: T0, end: T0 + HOUR, lvl: 2 }];
    expect(model(undefined, SETTINGS, { alerts }).alerts).toHaveLength(0);
  });
});

describe('buildModel', () => {
  it('returns null without a forecast', () => {
    expect(buildModel(PUTNEY, {}, { ...SETTINGS }, NOON)).toBeNull();
  });
  it('builds 72 hours from the current hour and assesses now', () => {
    const m = model();
    expect(m.h72[0].t).toBe(NOON);
    expect(m.h72.length).toBe(60); // fixture ends 60 hours after noon on day one
    expect(m.cur.a.lvl).toBe(0);
  });
  it('ignores light when asked', () => {
    expect(lvlExcept(hourAt(model(), 2).a, ['dark', 'twilight'])).toBe(0);
  });
});

describe('flowTrend', () => {
  const ser = (a, b) => Array.from({ length: 25 }, (_, i) => ({ t: T0 + i * 15 * MIN * 2, v: a + (b - a) * i / 24 }));
  it('reports rising, falling and steady over 6 hours', () => {
    expect(flowTrend(ser(5000, 8000))).toMatch(/^Rising/);
    expect(flowTrend(ser(8000, 5000))).toMatch(/^Falling/);
    expect(flowTrend(ser(6000, 6100))).toBe('Steady over 6 hours');
    expect(flowTrend([])).toBeNull();
  });
});

describe('parsers', () => {
  it('parses NWS alerts and levels them', () => {
    const a = parseAlerts({ features: [{ properties: { event: 'Wind Advisory', onset: '2026-06-15T12:00:00-04:00', ends: '2026-06-15T18:00:00-04:00' } }] });
    expect(a[0]).toMatchObject({ event: 'Wind Advisory', lvl: 2, start: NOON, end: NOON + 6 * HOUR });
    expect(alertLevel('Special Weather Statement')).toBe(1);
  });
  it('converts NWS observation units', () => {
    const o = parseObs({ properties: { timestamp: '2026-06-15T12:00:00-04:00', temperature: { value: 20 }, windSpeed: { value: 10, unitCode: 'wmoUnit:km_h-1' }, windGust: { value: 5, unitCode: 'wmoUnit:m_s-1' }, windDirection: { value: 180 } } });
    expect(o.tempF).toBe(68);
    expect(o.wind).toBeCloseTo(6.21, 2);
    expect(o.gust).toBeCloseTo(11.18, 2);
  });
  it('picks flow and water temperature from the USGS latest values', () => {
    const river = bindingsFor(PUTNEY).find(b => b.slot === 'river');
    const r = parseRiver({ features: [
      { properties: { monitoring_location_id: 'USGS-01154500', parameter_code: '00060', value: '7000', time: '2026-06-15T12:00:00Z' } },
      { properties: { monitoring_location_id: 'USGS-01161280', parameter_code: '00010', value: '18.5', time: '2026-06-15T12:00:00Z' } },
      { properties: { monitoring_location_id: 'USGS-01161280', parameter_code: '00060', value: 'x', time: '2026-06-15T12:00:00Z' } }
    ] }, river);
    expect(r.flow.v).toBe(7000);
    expect(r.waterC.v).toBe(18.5);
  });
  it('sorts the flow series and drops bad points', () => {
    const s = parseFlow({ features: [
      { properties: { time: '2026-06-15T13:00:00Z', value: '2' } },
      { properties: { time: '2026-06-15T12:00:00Z', value: '1' } },
      { properties: { time: 'bad', value: '3' } }
    ] });
    expect(s.map(p => p.v)).toEqual([1, 2]);
  });
});

describe('fog', () => {
  // Morning hours (0 to 10 local) on day one get `o`. Water is 68°F from RIVER.
  const morning = (o, extra) => model((i, t) => (dayKey(t) === '2026-06-15' && localHour(t) <= 10 ? o : {}), extra);
  const fogAt = (m, hr) => fogRisk(m, hourAt(m, hr));

  it('computes relative humidity from air and dew point', () => {
    expect(relHumidity(60, 60)).toBeCloseTo(100, 5);
    expect(relHumidity(70, 50)).toBeGreaterThan(45);
    expect(relHumidity(70, 50)).toBeLessThan(55);
  });
  it('calls valley fog likely on a clear, calm, saturated morning', () => {
    const f = fogAt(morning({ temp: 55, dew: 54, wind: 2, cloud: 10 }), 6);
    expect(f).toMatchObject({ risk: 2, type: 'valley', text: 'Valley fog likely' });
  });
  it('downgrades valley fog to possible after a cloudy night', () => {
    const f = fogAt(morning({ temp: 55, dew: 54, wind: 2, cloud: 70 }), 6);
    expect(f).toMatchObject({ risk: 1, type: 'valley' });
  });
  it('treats missing cloud cover as clear, matching the old rule', () => {
    const m = buildModel(PUTNEY, { wx: (() => { const d = wx((i, t) => (localHour(t) <= 10 ? { temp: 55, dew: 54, wind: 2 } : {})); delete d.hourly.cloud_cover; return d; })(), river: RIVER }, { ...SETTINGS }, NOON);
    expect(fogAt(m, 6).risk).toBe(2);
  });
  it('calls steam fog when cold, moist air sits over warmer water', () => {
    // Water 68°F. Air 45°F is 23°F colder.
    expect(fogAt(morning({ temp: 45, dew: 42, wind: 3 }), 6)).toMatchObject({ risk: 2, type: 'steam' });
    // Air 56°F is 12°F colder: possible.
    expect(fogAt(morning({ temp: 56, dew: 50, wind: 5 }), 6)).toMatchObject({ risk: 1, type: 'steam' });
    // Windy mixes it out.
    expect(fogAt(morning({ temp: 45, dew: 42, wind: 12 }), 6).risk).toBe(0);
  });
  it('uses the water override for steam fog', () => {
    const air = { temp: 60, dew: 57, wind: 3 };
    // Gauge water 68°F is only 8°F warmer than the air: no steam fog.
    expect(fogAt(morning(air), 6).type).not.toBe('steam');
    // A dock reading of 80°F is 20°F warmer: steam fog likely.
    const m = model((i, t) => (localHour(t) <= 10 ? air : {}), { ...SETTINGS, waterOverride: '80' });
    expect(fogAt(m, 6)).toMatchObject({ risk: 2, type: 'steam' });
  });
  it('does not flag valley or steam fog after the 10 AM hour', () => {
    const m = model(() => ({ temp: 45, dew: 44, wind: 2 }));
    expect(fogAt(m, 10).risk).toBe(2);
    expect(fogAt(m, 11).risk).toBe(0);
  });
  it('takes fog from the model weather code at any hour', () => {
    const m = model((i, t) => (t === NOON ? { code: 45 } : {}));
    expect(fogAt(m, 12)).toMatchObject({ risk: 2, type: 'model' });
  });
  it('makes likely fog a caution and leaves possible fog out of the call', () => {
    expect(hourAt(morning({ temp: 55, dew: 54, wind: 2 }), 8).a.reasons.map(r => r.text)).toContain('Valley fog likely');
    const possible = hourAt(morning({ temp: 55, dew: 54, wind: 2, cloud: 70 }), 8).a;
    expect(possible.reasons.map(r => r.key)).not.toContain('fog');
  });
  it('estimates when morning fog lifts', () => {
    // Saturated through the 8 AM hour, dry after.
    const m = model((i, t) => (dayKey(t) === '2026-06-16' && localHour(t) <= 8 ? { temp: 55, dew: 54, wind: 2 } : {}));
    const mf = morningFog(m, '2026-06-16');
    expect(mf).toMatchObject({ risk: 2, type: 'valley', lingers: false });
    expect(localHour(mf.until)).toBe(9);
    expect(fogLift(mf)).toBe('lifting about 9 AM');
    expect(morningFog(m, '2026-06-17')).toBeNull();
  });
  it('says fog lingers when it lasts through the 10 AM hour', () => {
    const m = model((i, t) => (dayKey(t) === '2026-06-16' && localHour(t) <= 11 ? { temp: 55, dew: 54, wind: 2 } : {}));
    expect(fogLift(morningFog(m, '2026-06-16'))).toBe('lingering into late morning');
  });
  it('finds the next morning that is still ahead', () => {
    const m = model((i, t) => (dayKey(t) === '2026-06-16' && localHour(t) <= 8 ? { temp: 55, dew: 54, wind: 2 } : {}));
    const nm = nextMorning(m); // it is noon on the 15th, so the 16th is next
    expect(nm.key).toBe('2026-06-16');
    expect(nm.fog.type).toBe('valley');
  });
});

describe('periods', () => {
  const day = (m, key) => m.days.find(d => d.key === key);
  const byKey = (m, key) => Object.fromEntries(day(m, key).periods.map(p => [p.key, p]));

  it('splits a day into morning, midday and afternoon', () => {
    const m = model();
    const s = sunFor(m, '2026-06-16');
    const p = byKey(m, '2026-06-16');
    expect(Object.keys(p)).toEqual(['morning', 'midday', 'afternoon']);
    expect(p.morning.start).toBe(s.dawn);
    expect(localHour(p.morning.end)).toBe(10);
    expect(localHour(p.midday.start)).toBe(10);
    expect(localHour(p.midday.end)).toBe(15);
    expect(localHour(p.afternoon.start)).toBe(15);
    expect(p.afternoon.end).toBe(s.sunset);
  });
  it('marks finished periods past and starts the current one now', () => {
    const p = byKey(model(), '2026-06-15'); // it is noon
    expect(p.morning.past).toBe(true);
    expect(p.midday.past).toBe(false);
    expect(p.midday.from).toBe(NOON);
    expect(p.midday.hs[0].t).toBe(NOON);
  });
  it('does not count lights against the morning, but notes them', () => {
    const p = byKey(model(), '2026-06-16').morning;
    expect(p.lvl).toBe(0);
    expect(p.lightsUntil).toBe(sunFor(model(), '2026-06-16').sunrise);
  });
  it('takes the worst hour and its reason', () => {
    const m = model((i, t) => (dayKey(t) === '2026-06-16' && localHour(t) === 16 ? { wind: 18, gust: 26 } : {}));
    const p = byKey(m, '2026-06-16');
    expect(p.afternoon.lvl).toBe(2);
    expect(p.afternoon.why.key).toBe('wind');
    expect(p.afternoon.wmax).toBe(18);
    expect(p.midday.lvl).toBe(0);
  });
  it('carries morning fog with its lift time', () => {
    const m = model((i, t) => (dayKey(t) === '2026-06-16' && localHour(t) <= 8 ? { temp: 55, dew: 54, wind: 2 } : {}));
    const p = byKey(m, '2026-06-16').morning;
    expect(p.lvl).toBe(1);
    expect(p.why.key).toBe('fog');
    expect(localHour(p.fog.until)).toBe(9);
  });
  it('knows day from night and finds the next period', () => {
    const noon = model();
    expect(noon.daytime).toBe(true);
    expect(noon.next.key).toBe('midday');
    const late = buildModel(PUTNEY, { wx: wx(), river: RIVER }, { ...SETTINGS }, T0 + 22 * HOUR); // 10 PM
    expect(late.daytime).toBe(false);
    expect(late.next).toMatchObject({ key: 'morning', dayKey: '2026-06-16' });
  });
});

describe('water state', () => {
  // Heading is 15°, so wind from 15° or 195° runs along the course and 105° crosses it.
  const steady = o => model(() => o);
  const at = (m, hr) => hourAt(m, hr).water;

  it('calls calm water flat', () => {
    expect(at(steady({ wind: 2, dir: 15 }), 12).lvl).toBe(0);
  });
  it('builds chop from sustained wind along the straight', () => {
    expect(at(steady({ wind: 7, dir: 15 }), 12).lvl).toBe(1);   // light chop
    expect(at(steady({ wind: 10, dir: 15 }), 12).lvl).toBe(2);  // chop
    expect(at(steady({ wind: 14, dir: 15 }), 12).lvl).toBe(3);  // rough
  });
  it('counts crosswind for less', () => {
    const cross = at(steady({ wind: 14, dir: 105 }), 12);
    expect(cross.lvl).toBe(1);
    expect(waterWhy(cross)).toMatch(/^Mostly crosswind/);
  });
  it('describes the wind the same way as the wind fact', () => {
    // NW wind is 60° off the 15° course: windVsCourse calls it a headwind.
    const m = steady({ wind: 7, dir: 315 });
    expect(windVsCourse(m, 315, 7)).toMatch(/^Headwind/);
    expect(waterWhy(at(m, 12))).toMatch(/along the straight/);
  });
  it('takes a couple of hours to build', () => {
    // Calm until noon, then 12 mph along the course.
    const m = model((i, t) => (t >= NOON ? { wind: 12, dir: 15 } : { wind: 1, dir: 15 }));
    expect(at(m, 12).lvl).toBe(1);
    expect(waterWhy(at(m, 12))).toMatch(/Building/);
    expect(at(m, 14).lvl).toBe(2);
  });
  it('steepens when wind blows upstream against a strong current', () => {
    const wx8 = { wind: 8, dir: 195 }; // from downstream
    const low = at(steady(wx8), 12);
    const high = at(buildModel(PUTNEY, { wx: wx(() => wx8), river: { ...RIVER, flow: { v: 22000, t: NOON } } }, { ...SETTINGS }, NOON), 12);
    expect(low.lvl).toBe(1);
    expect(high.lvl).toBe(2);
    expect(high.against).toBe(true);
    expect(waterWhy(high)).toMatch(/against the current/);
  });
  it('rates the current moment and each period', () => {
    const m = model((i, t) => (dayKey(t) === '2026-06-16' && localHour(t) >= 13 ? { wind: 14, dir: 15 } : {}));
    expect(m.cur.water.lvl).toBe(0);
    const mid = m.days.find(d => d.key === '2026-06-16').periods.find(p => p.key === 'midday');
    expect(mid.water.min).toBe(0);
    expect(mid.water.max).toBeGreaterThanOrEqual(2);
    expect(localHour(mid.water.peakT)).toBe(14);
  });
  it('flags debris when the river rises fast', () => {
    const ser = (a, b) => Array.from({ length: 25 }, (_, i) => ({ t: T0 + i * 30 * MIN, v: a + (b - a) * i / 24 }));
    const withFlow = f => buildModel(PUTNEY, { wx: wx(), river: RIVER, flow: f }, { ...SETTINGS }, NOON);
    expect(debrisLikely(withFlow(ser(5000, 8000)))).toBe(true);
    expect(debrisLikely(withFlow(ser(5000, 5300)))).toBe(false);
  });
});

describe('precipitation', () => {
  const hrs = rows => rows.map(([pop, precip = 0, code = 0], i) => ({ t: NOON + i * HOUR, pop, precip, code }));
  it('names what is falling from the weather code', () => {
    expect(precipKind(0)).toBeNull();
    expect(precipKind(61)).toBe('rain');
    expect(precipKind(81)).toBe('showers');
    expect(precipKind(73)).toBe('snow');
    expect(precipKind(95)).toBe('thunderstorms');
    expect(precipKind(66)).toBe('freezing rain');
    expect(rateWord(0.02)).toBe('light');
    expect(rateWord(0.15)).toBe('moderate');
    expect(rateWord(0.4)).toBe('heavy');
  });
  it('finds the peak and the hours close to it', () => {
    const s = precipSummary(hrs([[10], [30], [65, 0.05, 81], [70, 0.08, 81], [62, 0.02, 61], [20]]));
    expect(s.peak).toBe(70);
    expect(s.peakT).toBe(NOON + 3 * HOUR);
    expect(s.fromT).toBe(NOON + 2 * HOUR);
    expect(s.toT).toBe(NOON + 5 * HOUR);
    expect(s.total).toBeCloseTo(0.15);
    expect(s.kind).toBe('showers');
  });
  it('ignores the kind of hours with little chance', () => {
    expect(precipSummary(hrs([[5, 0, 61], [10, 0, 61]])).kind).toBeNull();
  });
  it('shows in the current conditions and in each period', () => {
    const m = model((i, t) => (t >= NOON + HOUR && t < NOON + 3 * HOUR ? { pop: 70, precip: 0.1, code: 61 } : {}));
    const mid = m.days.find(d => d.key === '2026-06-15').periods.find(p => p.key === 'midday');
    const s = precipSummary(mid.hs);
    expect(s.peak).toBe(70);
    expect(s.kind).toBe('rain');
  });
});

describe('detail views', () => {
  it('covers first light to sunset for a day, past hours included', () => {
    const m = model();
    const hs = rowingHours(m, '2026-06-15');
    const s = sunFor(m, '2026-06-15');
    expect(hs[0].t + HOUR).toBeGreaterThan(s.dawn);
    expect(hs[0].t).toBeLessThanOrEqual(s.dawn);
    expect(hs[hs.length - 1].t).toBeLessThan(s.sunset);
    expect(hs.some(h => h.t < NOON)).toBe(true);
    expect(rowingHours(m, '2030-01-01')).toEqual([]);
  });
  it('finds the worst level for a group of reasons', () => {
    const m = model((i, t) => (t === NOON ? { wind: 12, gust: 26, pop: 65 } : {}));
    const a = hourAt(m, 12).a;
    expect(factorLevel(a, ['wind', 'gust'])).toMatchObject({ lvl: 2, why: { key: 'gust' } });
    expect(factorLevel(a, ['pop']).lvl).toBe(1);
    expect(factorLevel(a, ['fog'])).toEqual({ lvl: 0, why: null });
    expect(worstOf(rowingHours(m, '2026-06-15'), ['pop'])).toBe(1);
    expect(worstOf([], ['pop'])).toBe(0);
  });
  it('interpolates the NWS flow forecast and finds its peak', () => {
    const fc = { pts: [{ t: NOON, v: 2000 }, { t: NOON + 6 * HOUR, v: 5000 }, { t: NOON + 12 * HOUR, v: 4000 }] };
    expect(flowForecastAt(fc, NOON)).toBe(2000);
    expect(flowForecastAt(fc, NOON + 3 * HOUR)).toBe(3500);
    expect(flowForecastAt(fc, NOON + 12 * HOUR)).toBe(4000);
    expect(flowForecastAt(fc, NOON - HOUR)).toBeNull();
    expect(flowForecastAt(fc, NOON + 13 * HOUR)).toBeNull();
    expect(flowForecastAt(null, NOON)).toBeNull();
    expect(flowForecastPeak(fc, NOON)).toEqual({ t: NOON + 6 * HOUR, v: 5000 });
    expect(flowForecastPeak(fc, NOON + 7 * HOUR)).toEqual({ t: NOON + 12 * HOUR, v: 4000 });
    expect(flowForecastPeak(fc, NOON + 13 * HOUR)).toBeNull();
  });
});

describe('river history and forecast parsers', () => {
  it('parses USGS daily means in date order at noon Eastern', () => {
    const s = parseFlowDays({ features: [
      { properties: { time: '2026-10-03', value: '2360' } },
      { properties: { time: '2026-09-13', value: '2820' } },
      { properties: { time: '2026-09-14', value: 'bad' } }
    ] }, { params: { tz: 'America/New_York' } });
    expect(s.map(p => p.v)).toEqual([2820, 2360]);
    expect(dayKey(s[0].t)).toBe('2026-09-13');
    expect(localHour(s[0].t)).toBe(12);
  });
  it('parses the NWS flow forecast in cfs and drops missing values', () => {
    const f = parseFlowForecast({
      issuedTime: '2026-10-13T15:23:00Z', secondaryUnits: 'kcfs',
      data: [
        { validTime: '2026-10-14T00:00:00Z', primary: 7, secondary: 3.11 },
        { validTime: '2026-10-13T18:00:00Z', primary: 6.3, secondary: 2.01 },
        { validTime: '2026-10-14T06:00:00Z', primary: -999, secondary: -999 }
      ]
    });
    expect(f.issued).toBe(Date.parse('2026-10-13T15:23:00Z'));
    expect(f.pts.map(p => Math.round(p.v))).toEqual([2010, 3110]);
    expect(parseFlowForecast({ secondaryUnits: 'cfs', data: [{ validTime: '2026-10-14T00:00:00Z', secondary: 900 }] }).pts[0].v).toBe(900);
    expect(parseFlowForecast({}).pts).toEqual([]);
  });
});

describe('runs', () => {
  // Gusts build to caution at 1 PM and stay off at 3 PM, then ease at 5 PM.
  const gusty = (i, t) => {
    const hr = localHour(t);
    if (dayKey(t) !== '2026-06-15') return {};
    return hr >= 15 && hr < 17 ? { gust: 26 + (hr - 15) } : hr >= 13 && hr < 15 ? { gust: 20 } : {};
  };
  it('splits the day into stretches of the same call, starting now', () => {
    const m = model(gusty);
    const runs = callRuns(m, '2026-06-15');
    expect(runs.map(r => r.lvl)).toEqual([0, 1, 2, 0]);
    expect(runs[0].start).toBe(NOON);
    expect(localHour(runs[1].start)).toBe(13);
    expect(localHour(runs[2].start)).toBe(15);
    expect(runs[2].end).toBe(runs[3].start);
    expect(runs[3].end).toBe(sunFor(m, '2026-06-15').sunset);
    // The worst hour is quoted.
    expect(runs[2].why.map(x => x.text)).toEqual(['Gusts to 27 mph']);
  });
  it('can include hours already over, from first light', () => {
    const m = model(gusty);
    const runs = callRuns(m, '2026-06-15', { past: true });
    expect(runs[0].start).toBe(sunFor(m, '2026-06-15').dawn);
  });
  it('joins a caution and a stay off for one factor into one run', () => {
    const m = model(gusty);
    const fr = factorRuns(m, '2026-06-15', ['wind', 'gust']);
    expect(fr).toHaveLength(1);
    expect(fr[0]).toMatchObject({ lvl: 2 });
    expect(localHour(fr[0].start)).toBe(13);
    expect(localHour(fr[0].end)).toBe(17);
    expect(fr[0].why.map(x => x.text)).toEqual(['Gusts to 27 mph']);
    expect(factorRuns(m, '2026-06-15', ['pop'])).toEqual([]);
  });
  it('quotes the lowest visibility and the coldest air', () => {
    const hs = [
      { vis: 1200, temp: 40, a: { reasons: [{ lvl: 1, key: 'fog', text: 'Visibility 0.7 mi' }, { lvl: 1, key: 'cold', text: 'Cold water, air plus water 95°F' }] } },
      { vis: 900, temp: 36, a: { reasons: [{ lvl: 1, key: 'fog', text: 'Visibility 0.6 mi' }, { lvl: 1, key: 'cold', text: 'Cold water, air plus water 91°F' }] } }
    ];
    expect(worstReasons(hs, 1).map(x => x.text)).toEqual(['Visibility 0.6 mi', 'Cold water, air plus water 91°F']);
    expect(worstReasons(hs, 1, ['cold']).map(x => x.text)).toEqual(['Cold water, air plus water 91°F']);
    expect(worstReasons(hs, 0)).toEqual([]);
  });
});

describe('air quality', () => {
  const aqAt = (q, from = 0, to = 72) => Array.from({ length: 72 }, (_, i) => ({ t: T0 + i * HOUR, aqi: i >= from && i < to ? q : 20, pm25: 5 }));
  it('names the EPA category', () => {
    expect(aqiWord(20)).toBe('Good');
    expect(aqiWord(120)).toBe('Unhealthy for sensitive groups');
    expect(aqiWord(175)).toBe('Unhealthy');
    expect(aqiWord(450)).toBe('Hazardous');
  });
  it('parses the hourly forecast', () => {
    const a = parseAQ({ hourly: { time: [T0 / 1000, T0 / 1000 + 3600], us_aqi: [40, null], pm2_5: [8.5, null] } });
    expect(a).toEqual([{ t: T0, aqi: 40, pm25: 8.5 }]);
    expect(parseAQ({})).toEqual([]);
  });
  it('applies the AQI settings to the hours it covers', () => {
    const m = buildModel(PUTNEY, { wx: wx(), river: RIVER, aq: aqAt(160, 12, 14) }, { ...SETTINGS }, NOON);
    expect(hourAt(m, 12).aqi).toBe(160);
    expect(hourAt(m, 12).a.reasons[0]).toMatchObject({ lvl: 1, key: 'aqi', text: 'Air quality AQI 160, unhealthy' });
    expect(hourAt(m, 15).a.lvl).toBe(0);
    const off = buildModel(PUTNEY, { wx: wx(), river: RIVER, aq: aqAt(220, 12, 14) }, { ...SETTINGS }, NOON);
    expect(hourAt(off, 12).a.lvl).toBe(2);
    const blank = buildModel(PUTNEY, { wx: wx(), river: RIVER, aq: aqAt(220, 12, 14) }, { ...SETTINGS, aqiCaution: '', aqiOff: '' }, NOON);
    expect(hourAt(blank, 12).a.lvl).toBe(0);
  });
});

describe('forecast confidence', () => {
  const ens = (wind, precip) => ({ ens: { wind, precip } });
  it('parses each model and leaves out missing ones', () => {
    const d = parseModels({ hourly: { time: [T0 / 1000], wind_speed_10m_gfs_seamless: [5], precipitation_gfs_seamless: [0], wind_speed_10m_ecmwf_ifs025: [7], precipitation_ecmwf_ifs025: [0.02] } });
    expect(d.ids).toEqual(['gfs_seamless', 'ecmwf_ifs025']);
    expect(d.hours).toEqual([{ t: T0, wind: [5, 7], precip: [0, 0.02] }]);
  });
  it('matches models to forecast hours', () => {
    const models = { ids: ['a', 'b'], hours: [{ t: NOON, wind: [4, 6], precip: [0, null] }] };
    const m = buildModel(PUTNEY, { wx: wx(), river: RIVER, models }, { ...SETTINGS }, NOON);
    expect(hourAt(m, 12).ens).toEqual({ wind: [4, 6], precip: [0] });
    expect(hourAt(m, 13).ens).toBeNull();
  });
  it('rates agreement on wind and rain', () => {
    expect(confidence([ens([4, 5, 6], [0, 0, 0]), ens([5, 6, 7], [0, 0, 0])])).toMatchObject({ level: 'high', wind: 2, rain: 0, n: 3 });
    expect(confidence([ens([4, 10], [0, 0])]).level).toBe('medium');
    expect(confidence([ens([2, 14], [0, 0])]).level).toBe('low');
    expect(confidence([ens([5, 5], [0, 0.1])]).level).toBe('low');
    expect(confidence([{ ens: null }])).toBeNull();
  });
  it('says what the models disagree on', () => {
    expect(confidenceText({ level: 'high', wind: 2, rain: 0, n: 4 })).toBe('High confidence: the 4 models agree.');
    expect(confidenceText({ level: 'low', wind: 9.4, rain: 0.6, n: 4 })).toBe('Low confidence: models differ by about 9 mph on wind, and models split on rain.');
    expect(confidenceText(null)).toBe('');
    // Limited to one dimension, the level follows it alone.
    expect(confidenceText({ level: 'low', wind: 2, rain: 0.6, n: 4 }, 'wind')).toBe('High confidence: the 4 models agree.');
    expect(confidenceText({ level: 'low', wind: 2, rain: 0.6, n: 4 }, 'rain')).toBe('Low confidence: models split on rain.');
  });
});

describe('plan a row', () => {
  // Calm at 7 AM, wind building after 9 AM on the 16th; noon is now on the 15th.
  const windy = (i, t) => (dayKey(t) === '2026-06-16' && localHour(t) >= 9 ? { wind: 9, gust: 14 } : {});
  it('finds the calmest session of the length asked, one per day', () => {
    const m = model(windy);
    const plan = planSessions(m, 90);
    expect(new Set(plan.map(p => p.key)).size).toBe(plan.length);
    const tue = plan.find(p => p.key === '2026-06-16');
    expect(tue.end - tue.start).toBe(90 * MIN);
    expect(localHour(tue.end - 1)).toBeLessThan(9);
    // Best first.
    for (let i = 1; i < plan.length; i++) expect(plan[i].score).toBeGreaterThanOrEqual(plan[i - 1].score);
  });
  it('keeps to the morning or the afternoon', () => {
    const m = model();
    for (const p of planSessions(m, 60, 'morning')) expect(localHour(p.end - 1)).toBeLessThan(12);
    for (const p of planSessions(m, 60, 'afternoon')) expect(localHour(p.start)).toBeGreaterThanOrEqual(12);
  });
  it('starts no earlier than now and only in go hours', () => {
    const m = model((i, t) => (dayKey(t) === '2026-06-15' && localHour(t) >= 12 ? { wind: 20 } : {}));
    expect(planSessions(m, 60).some(p => p.key === '2026-06-15')).toBe(false);
  });
});

describe('light', () => {
  it('gives sun times for any date', () => {
    const jun = sunOn(PUTNEY, NOON), dec = sunOn(PUTNEY, Date.UTC(2026, 11, 21, 17));
    expect(jun.dawn).toBeLessThan(jun.sunrise);
    expect(jun.sunset - jun.sunrise).toBeGreaterThan(15 * HOUR);
    expect(dec.sunset - dec.sunrise).toBeLessThan(9.5 * HOUR);
    expect(localHour(jun.noon)).toBe(12);
  });
  it('names the UV index', () => {
    expect([1, 4, 7, 9, 12].map(uvWord)).toEqual(['Low', 'Moderate', 'High', 'Very high', 'Extreme']);
  });
});

// The location is an input, so the same logic works for a place that is not
// Putney: another zone, other bank names, another current.
const place = (extra = {}) => resolveLocation({ ...PUTNEY_RECORD, ...extra }, { waterway: PUTNEY_WATERWAY });

describe('the location sets the heading', () => {
  it('reads the course from the location and not from the settings', () => {
    // A heading in the settings is ignored; the location's 105° makes a wind from 105° a headwind.
    const m = buildModel(place({ course: { ...PUTNEY_RECORD.course, heading: 105 } }), { wx: wx(), river: RIVER }, { ...SETTINGS, heading: 200 }, NOON);
    expect(windVsCourse(m, 105, 6)).toMatch(/^Headwind/);
    expect(windVsCourse(model(), 105, 6)).toBe('Crosswind off the New Hampshire bank.');
    const along = chopWind(m, { wind: 10, dir: 105 }), across = chopWind(model(), { wind: 10, dir: 105 });
    expect(along).toMatchObject({ axis: 'along', e: 10 });
    expect(across.axis).toBe('cross');
  });
  it('takes a personal heading through a location resolved with it', () => {
    const m = buildModel(resolveLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY, overrides: { heading: 20 } }), { wx: wx(), river: RIVER }, { ...SETTINGS }, NOON);
    expect(m.loc.course.heading).toBe(20);
    expect(windVsCourse(m, 20, 6)).toMatch(/^Headwind/);
  });
});

describe('a location with other banks, reach and current', () => {
  const loc = place({
    banks: { word: 'shore', left: { short: 'N', name: 'North' }, right: { short: 'S', name: 'South' } },
    course: { ...PUTNEY_RECORD.course, heading: 90, reachWord: 'reach' },
    water: { mode: 'river', cross: 0.2 },
    flow: { ...PUTNEY_RECORD.flow, against: [[5000, 2], [3000, 1.5]] }
  });
  const at = (flow, l = loc) => buildModel(l, { wx: wx(), river: { ...RIVER, flow: { v: flow, t: NOON } } }, { ...SETTINGS }, NOON);

  it('names the banks, and the reach, from the record', () => {
    const m = at(6000);
    // The right bank is on the right facing upstream, so wind from 180° off a 90° course is off the south shore.
    expect(windVsCourse(m, 180, 6)).toBe('Crosswind off the South shore.');
    expect(windVsCourse(m, 0, 6)).toBe('Crosswind off the North shore.');
    expect(windVsCourse(m, 90, 10)).toMatch(/ Chop builds along the reach\.$/);
  });
  it('says nothing the record cannot back', () => {
    // A place with no banks at all: a record's null is generated from its heading, so this one is taken off after.
    const bare = { ...place({ banks: null, course: { ...PUTNEY_RECORD.course, reachWord: null } }), banks: null };
    const m = at(6000, bare);
    expect(windVsCourse(m, 105, 6)).toBe('Crosswind.');
    expect(windVsCourse(m, 15, 10)).toMatch(/ Chop builds along the course\.$/);
  });
  it('names generated banks from the heading when the record has none (01 10.4)', () => {
    const none = place({ banks: null, course: { ...PUTNEY_RECORD.course, heading: 330, reachWord: null } });
    const m = at(6000, none);
    // Facing upstream at 330, the right side faces 60 (northeast) and the left 240 (southwest).
    expect(windVsCourse(m, 60, 6)).toBe('Crosswind off the northeast bank.');
    expect(windVsCourse(m, 240, 6)).toBe('Crosswind off the southwest bank.');
    // On still water the same sides are shores.
    const lake = at(6000, place({ banks: null, waterType: 'lake', course: { ...PUTNEY_RECORD.course, heading: 166, reachWord: null } }));
    expect(windVsCourse(lake, 256, 6)).toMatch(/^Crosswind off the west shore\./);
  });
  it('steepens chop from the lowest step of its own current, not at 10,000 cfs', () => {
    // 6,000 cfs is under Putney's 10,000 and over this river's 3,000.
    expect(windVsCourse(at(6000), 270, 10)).toMatch(/Wind against current steepens it\.$/);
    expect(windVsCourse(at(2500), 270, 10)).not.toMatch(/steepens/);
    expect(windVsCourse(at(6000, PUTNEY), 195, 10)).not.toMatch(/steepens/);
    expect(windVsCourse(at(10000, PUTNEY), 195, 10)).toMatch(/steepens/);
  });
  it('uses its own steps and crosswind weight for chop', () => {
    const h = (dir, wind) => ({ wind, dir });
    // Crosswind counts 0.2 here, where Putney's 0.4 gives 4.
    expect(chopWind(at(6000), h(180, 10)).e).toBeCloseTo(2, 9);
    expect(chopWind(at(6000), h(180, 10))).toMatchObject({ axis: 'cross', against: false });
    expect(chopWind(at(6000, PUTNEY), h(105, 10)).e).toBeCloseTo(4, 9);
    // From downstream against 6,000 cfs: the 5,000 step doubles it. 2,500 is under every step.
    expect(chopWind(at(6000), h(270, 8))).toMatchObject({ e: 16, axis: 'along', against: true });
    expect(chopWind(at(4000), h(270, 8))).toMatchObject({ e: 12, against: true });
    expect(chopWind(at(2500), h(270, 8))).toMatchObject({ e: 8, against: false });
  });
  it('has no current to speak of without a flow record', () => {
    const dry = place({ flow: null });
    expect(chopWind(at(30000, dry), { wind: 8, dir: 195 })).toMatchObject({ e: 8, against: false });
    expect(windVsCourse(at(30000, dry), 195, 10)).not.toMatch(/steepens/);
  });
});

// Zones that are not a whole number of hours from UTC (08 9.2), and one that is
// far from New York. The module's zone stays on New York throughout: the model
// follows the location's own.
describe('a location in another zone', () => {
  const KOLKATA = 330 * MIN, KATHMANDU = 345 * MIN, AUCKLAND = 12 * HOUR;
  const ZONES = {
    'Asia/Kolkata': { offset: KOLKATA, loc: place({ slug: 'kolkata-ghat', name: 'Kolkata ghat', tz: 'Asia/Kolkata', lat: 22.585, lon: 88.343, country: 'IN', region: 'IN-WB' }) },
    'Asia/Kathmandu': { offset: KATHMANDU, loc: place({ slug: 'kathmandu-ghat', name: 'Kathmandu ghat', tz: 'Asia/Kathmandu', lat: 27.717, lon: 85.324, country: 'NP', region: null }) },
    'Pacific/Auckland': { offset: AUCKLAND, loc: place({ slug: 'auckland-harbour', name: 'Auckland harbour', tz: 'Pacific/Auckland', lat: -36.84, lon: 174.76, country: 'NZ', region: null }) }
  };
  // Midnight on 15 June in that zone, and a forecast that starts then, as
  // Open-Meteo gives it for a zone: the hours start on the zone's own hours.
  const start = z => Date.UTC(2026, 5, 15) - ZONES[z].offset;
  const build = (z, now, over) => buildModel(ZONES[z].loc, { wx: wx(over, 3, start(z)), river: RIVER }, { ...SETTINGS }, now);

  it('starts the first 72 hours at the hour that contains now', () => {
    const i0 = start('Asia/Kolkata');
    // 11:40 in Kolkata is 06:10 UTC. The hour that contains it starts at 05:30 UTC.
    const m = build('Asia/Kolkata', i0 + 11 * HOUR + 40 * MIN);
    expect(m.h72[0].t).toBe(i0 + 11 * HOUR);
    expect(m.fmt.hm(m.h72[0].t)).toBe('11\u00a0AM');
    expect(m.h72[0].t % HOUR).toBe(30 * MIN);
    // On an hour start, that hour.
    expect(build('Asia/Kolkata', i0 + 12 * HOUR).h72[0].t).toBe(i0 + 12 * HOUR);
    // A minute before the next one, still the same hour.
    expect(build('Asia/Kolkata', i0 + 12 * HOUR - MIN).h72[0].t).toBe(i0 + 11 * HOUR);
  });
  it('keys each day by the date there, which is not the date in New York at its noon', () => {
    for (const z of Object.keys(ZONES)) {
      expect(build(z, start(z) + HOUR).days.map(d => d.key), z).toEqual(['2026-06-15', '2026-06-16', '2026-06-17']);
    }
  });
  it('keeps the days, the periods and the fog to the location clock', () => {
    const i0 = start('Asia/Kolkata');
    // Saturated, calm air from midnight through the 8 AM hour on the 16th, local.
    const m = build('Asia/Kolkata', i0 + 13 * HOUR, i => (Math.floor(i / 24) === 1 && i % 24 <= 8 ? { temp: 55, dew: 54, wind: 2 } : {}));
    expect(m.days.map(d => d.key)).toEqual(['2026-06-15', '2026-06-16', '2026-06-17']);
    const p = Object.fromEntries(m.days[1].periods.map(x => [x.key, x]));
    expect(p.morning.end).toBe(i0 + 34 * HOUR);   // 10:00 local on the 16th
    expect(p.midday.end).toBe(i0 + 39 * HOUR);    // 15:00
    expect(p.afternoon.start).toBe(i0 + 39 * HOUR);
    // First light and sunset are Kolkata's, in Kolkata's hours: Putney's would be ten hours off.
    const s = sunFor(m, '2026-06-16');
    expect(m.fmt.localMinutes(s.sunrise)).toBeGreaterThan(4 * 60 + 40);
    expect(m.fmt.localMinutes(s.sunrise)).toBeLessThan(5 * 60 + 20);
    expect(m.fmt.localMinutes(s.sunset)).toBeGreaterThan(18 * 60);
    expect(m.fmt.localMinutes(s.sunset)).toBeLessThan(19 * 60);
    expect(lightAt(m, i0 + 27 * HOUR)).toBe('dark');
    expect(lightAt(m, i0 + 36 * HOUR)).toBe('day');
    // The rowing day has only that day's local hours.
    expect(rowingHours(m, '2026-06-16').every(h => m.fmt.dayKey(h.t) === '2026-06-16')).toBe(true);
    // The fog is the morning's, lifting at 9:00 local.
    const fog = morningFog(m, '2026-06-16');
    expect(fog).toMatchObject({ risk: 2, type: 'valley', lingers: false, until: i0 + 33 * HOUR });
    expect(fogRisk(m, hourAt2(m, i0 + 30 * HOUR))).toMatchObject({ risk: 2, type: 'valley' });
    expect(fogRisk(m, hourAt2(m, i0 + 37 * HOUR)).risk).toBe(0);
    expect(nextMorning(m)).toMatchObject({ key: '2026-06-16', t: i0 + 35 * HOUR });
  });

  it('gives the sun times of that place on any date', () => {
    // Solar noon at 88.3°E is about 11:37 in India's zone. Putney's would be near 22:00 there.
    const sun = sunOn(ZONES['Asia/Kolkata'].loc, start('Asia/Kolkata') + 12 * HOUR), { fmt } = ZONES['Asia/Kolkata'].loc;
    expect(fmt.localHour(sun.noon)).toBe(11);
    expect(fmt.localMinutes(sun.sunset) - fmt.localMinutes(sun.sunrise)).toBeGreaterThan(13 * 60);
    expect(fmt.localMinutes(sun.dawn)).toBeLessThan(fmt.localMinutes(sun.sunrise));
  });

  // The go stretch is the hour that holds first light and the one after it, with
  // the first rougher. The calmest session of an hour starts on the local hour
  // that follows, so it is only found if the steps land on local half hours and
  // drop the seconds and milliseconds a first light carries (08 9.2).
  function stepFrom(loc, first, now) {
    const quiet = () => ({ wind: 1 });
    const probe = buildModel(loc, { wx: wx(quiet, 3, first), river: RIVER }, { ...SETTINGS }, now);
    const key = probe.days[0].key, dawn = sunFor(probe, key).dawn;
    const hd = probe.hours.find(h => h.t <= dawn && dawn < h.t + HOUR).t;
    const over = (i, t) => (t === hd ? { wind: 9 } : t < hd + 2 * HOUR ? { wind: 1 } : { wind: 20 });
    const m = buildModel(loc, { wx: wx(over, 3, first), river: RIVER }, { ...SETTINGS }, now);
    return { m, dawn, hd, plan: planSessions(m, 60).find(p => p.key === key) };
  }

  for (const z of Object.keys(ZONES)) {
    it(`starts a session on a local hour in ${z}`, () => {
      const { m, hd, plan } = stepFrom(ZONES[z].loc, start(z), start(z) + HOUR);
      expect(plan.start).toBe(hd + HOUR);
      expect(m.fmt.localMinutes(plan.start) % 60).toBe(0);
      expect(plan.start % MIN).toBe(0);
      expect(plan.end - plan.start).toBe(HOUR);
    });
  }

  it('steps from a first light with seconds to the next half hour at the dock, as before', () => {
    // First light at Putney on 15 June is 08:36:34.252 UTC, 4:36 in the morning.
    const { dawn, plan } = stepFrom(PUTNEY, T0, T0 + HOUR);
    expect(dawn).toBe(Date.UTC(2026, 5, 15, 8, 36, 34, 252));
    expect(plan.start).toBe(Date.UTC(2026, 5, 15, 9, 0, 0, 0));
  });
});

// P1.9: a reading past its limit is not used, a source past its limit after a failed
// refresh reads as missing, and what is not checked is said (01 8.4, 15.7; 02; 08 K9).
describe('flow and water readings past their limits', () => {
  const H = HOUR;
  // The river rose 60% in the last six hours, so a debris warning is due.
  const RISING = { flow: Array.from({ length: 13 }, (_, i) => ({ t: NOON - (12 - i) * H, v: i < 7 ? 5000 : 5000 + (i - 6) * 500 })) };
  const river = (flowAge, waterAge = 0, v = 12000) => ({ river: { flow: { v, t: NOON - flowAge * H }, waterC: { v: 20, t: NOON - waterAge * H } } });
  const mk = (extra = {}, S = SETTINGS, loc = PUTNEY, over) => buildModel(loc, { wx: wx(over), ...RISING, ...extra }, { ...S }, NOON);
  const withFlow = (maxAgeH, extra = {}) => resolveLocation({ ...PUTNEY_RECORD, flow: { ...PUTNEY_RECORD.flow, maxAgeH }, ...extra }, { waterway: PUTNEY_WATERWAY });
  const reasons = m => hourAt(m, 12).a.reasons.map(r => r.key);

  it('uses a flow reading 23 hours old and not one 25 hours old', () => {
    const S = { ...SETTINGS, flowCaution: 10000 };
    const fresh = mk(river(23), S), old = mk(river(25), S);
    expect(PUTNEY.flow.maxAgeH).toBe(24);
    expect(flowForCall(fresh)).toBe(12000);
    expect(flowForCall(old)).toBeNull();
    // The fact still shows the number.
    expect(flowNow(old)).toBe(12000);
    expect(reasons(fresh)).toContain('flow');
    expect(reasons(old)).not.toContain('flow');
    expect(old.cur.a.reasons.map(r => r.key)).not.toContain('flow');
  });

  it('takes the limit as inclusive, to the millisecond', () => {
    const at = ms => mk({ river: { flow: { v: 12000, t: NOON - 24 * H - ms }, waterC: { v: 20, t: NOON } } });
    expect(flowForCall(at(0))).toBe(12000);
    expect(flowForCall(at(1))).toBeNull();
  });

  it('gives no debris warning from a reading past its limit', () => {
    expect(debrisLikely(mk(river(23)))).toBe(true);
    expect(debrisLikely(mk(river(25)))).toBe(false);
    // With no reading at all the series speaks, as it did before the limit existed.
    expect(debrisLikely(mk({ river: {} }))).toBe(true);
    expect(debrisLikely(mk({ river: undefined }))).toBe(true);
  });

  it('gives no wind against the current text or multiplier from a reading past its limit', () => {
    const wind = { wind: 10, dir: 195 };
    const fresh = mk(river(23)), old = mk(river(25));
    expect(windVsCourse(fresh, 195, 10)).toContain('Wind against current steepens it.');
    expect(windVsCourse(old, 195, 10)).not.toContain('against current');
    expect(chopWind(fresh, wind)).toMatchObject({ e: 12.5, against: true });
    expect(chopWind(old, wind)).toMatchObject({ e: 10, against: false });
  });

  it('uses any age when the location sets no limit, and a time that cannot be read only then', () => {
    const none = withFlow(null);
    expect(flowForCall(mk(river(400), SETTINGS, none))).toBe(12000);
    expect(flowForCall(mk({ river: { flow: { v: 12000 }, waterC: { v: 20, t: NOON } } }, SETTINGS, none))).toBe(12000);
    expect(flowForCall(mk({ river: { flow: { v: 12000, t: NaN }, waterC: { v: 20, t: NOON } } }))).toBeNull();
    expect(flowForCall(mk({ river: { flow: { v: 12000 }, waterC: { v: 20, t: NOON } } }))).toBeNull();
  });

  it('has no flow for a location with no flow record, and no reading means none', () => {
    const bay = resolveLocation({ ...PUTNEY_RECORD, slug: 'bay-q', flow: null }, { waterway: PUTNEY_WATERWAY });
    expect(flowForCall(mk(river(0), SETTINGS, bay))).toBe(12000);
    expect(flowForCall(mk({ river: {} }))).toBeNull();
  });

  it('uses a gauge water temperature 71 hours old and not one 73 hours old', () => {
    expect(PUTNEY.waterTemp.maxAgeH).toBe(72);
    const fresh = mk(river(0, 71)), old = mk(river(0, 73));
    expect(waterTemp(fresh)).toBe(68);
    expect(waterSource(fresh)).toBe('gauge');
    expect(waterTemp(old)).toBeNull();
    expect(waterTemp(old, { forCold: true })).toBeNull();
    expect(waterSource(old)).toBeNull();
    // The cold check follows: 31 + 68 is under the 100 line, and with no water there is no check.
    const air = { temp: 31 };
    expect(hourAt(mk(river(0, 71), SETTINGS, PUTNEY, () => air), 12).a.reasons.map(r => r.key)).toContain('cold');
    expect(hourAt(mk(river(0, 73), SETTINGS, PUTNEY, () => air), 12).a.reasons.map(r => r.key)).not.toContain('cold');
  });

  it("puts the dock reading ahead of a gauge, old or not", () => {
    const m = mk(river(0, 200), { ...SETTINGS, waterOverride: '55' });
    expect(waterOverridden(m.S)).toBe(true);
    expect(waterTemp(m)).toBe(55);
    expect(waterSource(m)).toBe('you');
    expect(waterTemp(mk(river(0, 0), { ...SETTINGS, waterOverride: '55' }))).toBe(55);
  });

  describe('the monthly typical value', () => {
    // 12 values, January to December. June is the sixth, 61°F.
    const monthly = [34, 34, 38, 45, 54, 61, 68, 70, 65, 55, 45, 37];
    const typical = resolveLocation({ ...PUTNEY_RECORD, slug: 'bay-t', waterTemp: { fallback: 'monthly', monthly, maxAgeH: 72 } }, { waterway: PUTNEY_WATERWAY });
    const none = { river: { flow: { v: 6000, t: NOON } } };

    it('is used for the cold check only, and named', () => {
      const m = mk(none, SETTINGS, typical);
      expect(waterSource(m)).toBe('typical');
      expect(waterTemp(m)).toBeNull();
      expect(waterTemp(m, { forCold: true })).toBe(61);
    });

    it('reads the month in the location zone, not the viewer', () => {
      // Midnight Eastern on 1 July is 04:00 UTC, still 30 June in UTC-4 hours before: 2026-07-01 00:30 EDT.
      const july = buildModel(typical, { wx: wx(() => ({}), 3, Date.UTC(2026, 6, 1, 4)), ...none }, { ...SETTINGS }, Date.UTC(2026, 6, 1, 4, 30));
      expect(waterTemp(july, { forCold: true })).toBe(68);
      const june = buildModel(typical, { wx: wx(() => ({}), 3, Date.UTC(2026, 5, 30, 4)), ...none }, { ...SETTINGS }, Date.UTC(2026, 6, 1, 3, 30));
      expect(waterTemp(june, { forCold: true })).toBe(61);
    });

    it('feeds the cold reason', () => {
      // 40°F air and 61°F water is 101 on a 105 line.
      const m = mk(none, { ...SETTINGS, coldCombined: 105 }, typical, () => ({ temp: 40 }));
      expect(hourAt(m, 12).a.reasons.find(r => r.key === 'cold')).toMatchObject({ lvl: 1 });
      const off = mk(none, { ...SETTINGS, coldCombined: 100 }, typical, () => ({ temp: 40 }));
      expect(hourAt(off, 12).a.reasons.map(r => r.key)).not.toContain('cold');
    });

    it('never feeds steam fog', () => {
      // 40°F air over a typical 61°F is 21° colder, which would be likely steam fog with a live reading.
      const air = (i, t) => (localHour(t) <= 10 ? { temp: 40, dew: 38, wind: 3, cloud: 100 } : {});
      const m = mk(none, SETTINGS, typical, air);
      expect(fogRisk(m, hourAt(m, 6)).type).not.toBe('steam');
      const live = mk({ river: { flow: { v: 6000, t: NOON }, waterC: { v: 16, t: NOON } } }, SETTINGS, typical, air);
      expect(fogRisk(live, hourAt(live, 6))).toMatchObject({ risk: 2, type: 'steam' });
    });

    it('gives way to a gauge reading, and to the dock reading', () => {
      expect(waterSource(mk(river(0, 1), SETTINGS, typical))).toBe('gauge');
      expect(waterTemp(mk(river(0, 1), SETTINGS, typical), { forCold: true })).toBe(68);
      expect(waterSource(mk(none, { ...SETTINGS, waterOverride: '50' }, typical))).toBe('you');
    });

    it('is not used when the record says there is none', () => {
      const m = mk(none, SETTINGS, resolveLocation({ ...PUTNEY_RECORD, slug: 'bay-u', waterTemp: { fallback: 'none', maxAgeH: 72 } }, { waterway: PUTNEY_WATERWAY }));
      expect(waterSource(m)).toBeNull();
      expect(waterTemp(m, { forCold: true })).toBeNull();
    });
  });
});

describe('a source past its limit after a failed refresh', () => {
  const alert = { event: 'Wind Advisory', headline: '', desc: '', instr: '', start: NOON - HOUR, end: NOON + 6 * HOUR, lvl: 2 };
  const all = { alerts: [alert], obs: { t: NOON - HOUR, tempF: 70, wind: 3, gust: 5, dir: 200, text: 'Clear' }, aq: [{ t: NOON, aqi: 80, pm25: 10 }],
    models: { ids: ['a'], hours: [{ t: NOON, wind: [4], precip: [0] }] }, flowDays: [{ t: NOON - 24 * HOUR, v: 5000 }], flowFcst: { issued: NOON, pts: [{ t: NOON, v: 6000 }] },
    flow: [{ t: NOON, v: 6000 }], river: RIVER };
  const mk = stale => buildModel(PUTNEY, { wx: wx(), ...all }, { ...SETTINGS }, NOON, { stale: new Map(stale) });

  it('is no model when the forecast is past its limit', () => {
    expect(mk([['wx', NOON - 30 * HOUR]])).toBeNull();
  });

  it('drops observations, air quality, models, the daily means and the river forecast', () => {
    const m = mk([['obs', 1], ['aq', 1], ['models', 1], ['flowDays', 1], ['flowFcst', 1]]);
    for (const k of ['obs', 'aq', 'models', 'flowDays', 'flowFcst']) expect(m.data[k], k).toBeUndefined();
    expect(m.hours.every(h => h.aqi === null && h.ens === null)).toBe(true);
    // What was not named stays.
    expect(m.data.alerts).toBe(all.alerts);
    expect(m.data.river).toBe(all.river);
  });

  it('keeps alerts that are still in force by their own end time, and the gauge', () => {
    const m = mk([['alerts', NOON - 2 * HOUR], ['river', NOON - 30 * HOUR], ['flow', NOON - 30 * HOUR]]);
    expect(m.alerts).toEqual([alert]);
    expect(hourAt(m, 12).a.reasons.map(r => r.key)).toContain('alert');
    expect(m.data.river).toBe(all.river);
    expect(m.data.flow).toBe(all.flow);
    // An alert past its own end time is not in force, stale or not.
    const over = buildModel(PUTNEY, { wx: wx(), alerts: [{ ...alert, end: NOON - 1 }] }, { ...SETTINGS }, NOON, { stale: new Map([['alerts', 0]]) });
    expect(over.alerts).toEqual([]);
  });

  it('draws the whole saved copy when nothing is named, with no staleness argument at all', () => {
    const none = buildModel(PUTNEY, { wx: wx(), ...all }, { ...SETTINGS }, NOON);
    expect(none.data.obs).toBe(all.obs);
    expect(none.stale.size).toBe(0);
    expect(buildModel(PUTNEY, { wx: wx(), ...all }, { ...SETTINGS }, NOON, { stale: new Map() }).data.obs).toBe(all.obs);
  });

  it('does not change the data it was given', () => {
    const data = { wx: wx(), ...all }, keys = Object.keys(data);
    buildModel(PUTNEY, data, { ...SETTINGS }, NOON, { stale: new Map([['obs', 1], ['aq', 1]]) });
    expect(Object.keys(data)).toEqual(keys);
  });
});

describe('what is not checked', () => {
  const H = HOUR;
  const mk = (loc, extra = {}, stale) => buildModel(loc, { wx: wx(), river: RIVER, alerts: [], ...extra }, effectiveSettings(loc), NOON, { stale: new Map(stale) });
  const make = (slug, record, waterway = PUTNEY_WATERWAY) => resolveLocation({ ...PUTNEY_RECORD, slug, ...record }, { waterway });
  const noAlerts = PUTNEY_RECORD.sources.filter(s => s.role !== 'alerts');

  it('is empty for Putney while its sources answer', () => {
    expect(notChecked(mk(PUTNEY))).toEqual([]);
    expect(notCheckedText([], NOON)).toBe('');
  });

  it('says the flow is not checked at a river, a tidal river or a canal with no gauge', () => {
    for (const waterType of ['river', 'tidal', 'canal']) {
      const loc = make(`w-${waterType}`, { waterType, flow: null }, null);
      expect(notChecked(mk(loc)), waterType).toEqual([{ key: 'flow', why: 'none' }]);
    }
  });

  it('says nothing about flow on a lake, a reservoir or a harbor', () => {
    for (const waterType of ['lake', 'reservoir', 'harbor']) {
      const loc = make(`w-${waterType}`, { waterType, flow: null, water: undefined }, null);
      expect(notChecked(mk(loc)).filter(x => x.key === 'flow'), waterType).toEqual([]);
    }
  });

  it('reads a flow row that is only information as no gauge', () => {
    const info = { ...PUTNEY_WATERWAY, sources: PUTNEY_WATERWAY.sources.map(s => (s.role === 'flow' ? { ...s, mode: 'info' } : s)) };
    expect(bound(mk(make('w-info', {}, info)), 'flow')).toBe(false);
    expect(notChecked(mk(make('w-info', {}, info)))).toEqual([{ key: 'flow', why: 'none' }]);
    expect(bound(mk(PUTNEY), 'flow')).toBe(true);
    expect(bound(mk(PUTNEY), 'water_temp')).toBe(true);
    expect(bound(mk(PUTNEY), 'tide')).toBe(false);
  });

  it('says the alerts are not checked where there is no feed', () => {
    const loc = make('w-noalerts', { sources: noAlerts });
    expect(notChecked(mk(loc))).toEqual([{ key: 'alerts', why: 'none' }]);
  });

  it('lists the flow, then the alerts, when neither has a source', () => {
    const loc = make('w-nothing', { flow: null, sources: noAlerts }, null);
    expect(notChecked(mk(loc)).map(x => `${x.key}/${x.why}`)).toEqual(['flow/none', 'alerts/none']);
  });

  it('says the flow is not checked once the latest reading is past its limit, and when it was taken', () => {
    const m = mk(PUTNEY, { river: { flow: { v: 6000, t: NOON - 25 * H }, waterC: { v: 20, t: NOON } } });
    expect(notChecked(m)).toEqual([{ key: 'flow', why: 'old', since: NOON - 25 * H }]);
    expect(notChecked(mk(PUTNEY, { river: { flow: { v: 6000, t: NOON - 24 * H }, waterC: { v: 20, t: NOON } } }))).toEqual([]);
  });

  it('says nothing about a gauge that gave no reading: that is a failure, named elsewhere', () => {
    expect(notChecked(mk(PUTNEY, { river: {} }))).toEqual([]);
    expect(notChecked(mk(PUTNEY, { river: undefined }))).toEqual([]);
  });

  it('says the alerts are not checked when that slot is past its limit, and when they last answered', () => {
    expect(notChecked(mk(PUTNEY, {}, [['alerts', NOON - 2 * H]]))).toEqual([{ key: 'alerts', why: 'old', since: NOON - 2 * H }]);
    expect(notChecked(mk(PUTNEY, {}, [['alerts', null]]))).toEqual([{ key: 'alerts', why: 'old', since: null }]);
    // A source that is not alerts does not count.
    expect(notChecked(mk(PUTNEY, {}, [['obs', NOON - 5 * H]]))).toEqual([]);
  });

  it('says the alerts are not checked here, not old, when the location has no feed and the slot is named', () => {
    const loc = make('w-noalerts2', { sources: noAlerts });
    expect(notChecked(mk(loc, {}, [['alerts', 1]])).map(x => x.why)).toEqual(['none']);
  });

  describe('as words', () => {
    const t = (...items) => notCheckedText(items, NOON);
    it('puts the sources that are not here in one sentence', () => {
      expect(t({ key: 'flow', why: 'none' }, { key: 'alerts', why: 'none' })).toBe('Not checked here: river flow, official alerts.');
      expect(t({ key: 'flow', why: 'none' })).toBe('Not checked here: river flow.');
      expect(t({ key: 'alerts', why: 'none' })).toBe('Not checked here: official alerts.');
    });

    it('says how long the gauge has not reported, in hours under 48 and then in days', () => {
      const flow = h => t({ key: 'flow', why: 'old', since: NOON - h * H });
      expect(flow(25)).toBe('River flow not checked: the gauge has not reported for 25 hours.');
      expect(flow(47.9)).toBe('River flow not checked: the gauge has not reported for 47 hours.');
      expect(flow(48)).toBe('River flow not checked: the gauge has not reported for 2 days.');
      expect(flow(60)).toBe('River flow not checked: the gauge has not reported for 2 days.');
      expect(flow(72)).toBe('River flow not checked: the gauge has not reported for 3 days.');
      expect(flow(1)).toBe('River flow not checked: the gauge has not reported for 1 hour.');
    });

    it('says how long NWS has not answered', () => {
      expect(t({ key: 'alerts', why: 'old', since: NOON - 2 * H })).toBe('Official alerts not checked: no answer from NWS for 2 hours.');
      expect(t({ key: 'alerts', why: 'old', since: NOON - 1.5 * H })).toBe('Official alerts not checked: no answer from NWS for 1 hour.');
    });

    it('leaves out the age when it is not known', () => {
      expect(t({ key: 'alerts', why: 'old', since: null })).toBe('Official alerts not checked: no answer from NWS.');
      expect(t({ key: 'flow', why: 'old', since: NaN })).toBe('River flow not checked: the gauge has not reported.');
      expect(t({ key: 'flow', why: 'old' })).toBe('River flow not checked: the gauge has not reported.');
    });

    it('gives each old source its own sentence, after the ones that are not here', () => {
      expect(t({ key: 'flow', why: 'old', since: NOON - 50 * H }, { key: 'alerts', why: 'none' }, { key: 'alerts', why: 'old', since: NOON - 3 * H }))
        .toBe('Not checked here: official alerts. River flow not checked: the gauge has not reported for 2 days. Official alerts not checked: no answer from NWS for 3 hours.');
    });
  });
});
