import { describe, it, expect } from 'vitest';
import { DEFAULTS, HOUR, MIN } from '../src/config.js';
import { dayKey, localHour, lowerFirst } from '../src/format.js';
import { precipKind, rateWord, precipSummary, buildModel, chopWind, waterState, debrisLikely, waterWhy, relWind, windVsCourse, flowTrend, sunFor, lightAt, lvlExcept, fogRisk, morningFog, nextMorning, fogLift, relHumidity } from '../src/logic.js';
import { parseAlerts, parseObs, parseRiver, parseFlow, alertLevel } from '../src/data.js';

// Midnight Eastern (EDT, UTC-4) on Mon 15 June 2026.
const T0 = Date.UTC(2026, 5, 15, 4);
const NOON = T0 + 12 * HOUR;

// A calm, warm Open-Meteo response. `over(i, t)` patches individual hours.
function wx(over = () => ({}), days = 3) {
  const n = days * 24, H = {
    time: [], temperature_2m: [], apparent_temperature: [], dew_point_2m: [], precipitation_probability: [],
    precipitation: [], weather_code: [], wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [], visibility: [], cape: [], cloud_cover: []
  };
  for (let i = 0; i < n; i++) {
    const t = T0 + i * HOUR;
    const h = { temp: 72, feels: 72, dew: 55, pop: 0, precip: 0, code: 0, wind: 4, gust: 8, dir: 200, vis: 24000, cape: 0, cloud: 10, ...over(i, t) };
    H.time.push(t / 1000);
    H.temperature_2m.push(h.temp); H.apparent_temperature.push(h.feels); H.dew_point_2m.push(h.dew);
    H.precipitation_probability.push(h.pop); H.precipitation.push(h.precip); H.weather_code.push(h.code);
    H.wind_speed_10m.push(h.wind); H.wind_gusts_10m.push(h.gust); H.wind_direction_10m.push(h.dir);
    H.visibility.push(h.vis); H.cape.push(h.cape); H.cloud_cover.push(h.cloud);
  }
  const D = { time: [], sunrise: [], sunset: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [] };
  for (let d = 0; d < days; d++) {
    const t = T0 + d * 24 * HOUR;
    D.time.push(t / 1000); D.sunrise.push((t + 5.2 * HOUR) / 1000); D.sunset.push((t + 20.5 * HOUR) / 1000);
    D.temperature_2m_max.push(80); D.temperature_2m_min.push(60); D.precipitation_probability_max.push(0);
  }
  return { hourly: H, daily: D };
}

const RIVER = { flow: { v: 6000, t: NOON }, waterC: { v: 20, t: NOON } }; // 68°F water
const model = (over, S = DEFAULTS, extra = {}) => buildModel({ wx: wx(over), river: RIVER, ...extra }, { ...S }, NOON);
const hourAt = (m, localHr) => m.hours.find(h => dayKey(h.t) === dayKey(NOON) && localHour(h.t) === localHr);

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
    const at = (pop, S = DEFAULTS) => hourAt(model((i, t) => (t === NOON ? { pop } : {}), S), 12).a;
    expect(at(55).lvl).toBe(0);
    expect(at(60).lvl).toBe(1);
    expect(at(60).reasons[0]).toMatchObject({ key: 'pop', text: 'Rain chance 60%' });
    expect(at(90).lvl).toBe(2);
    // A blank level is off.
    expect(at(95, { ...DEFAULTS, rainOff: '' }).lvl).toBe(1);
    expect(at(95, { ...DEFAULTS, rainCaution: '', rainOff: '' }).lvl).toBe(0);
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
    const m = model((i, t) => (t === NOON ? { temp: 50 } : {}), { ...DEFAULTS, waterOverride: '40' });
    expect(hourAt(m, 12).a.reasons.map(r => r.key)).toContain('cold');
  });
  it('applies flow thresholds', () => {
    const at = v => hourAt(buildModel({ wx: wx(), river: { ...RIVER, flow: { v, t: NOON } } }, { ...DEFAULTS }, NOON), 12).a.lvl;
    expect(at(19999)).toBe(0);
    expect(at(20000)).toBe(1);
    expect(at(28000)).toBe(2);
  });
  it('applies NWS alerts only to the hours they cover', () => {
    const alerts = [{ event: 'Wind Advisory', start: NOON, end: NOON + 2 * HOUR, lvl: 2 }];
    const m = model(undefined, DEFAULTS, { alerts });
    expect(hourAt(m, 12).a.lvl).toBe(2);
    expect(hourAt(m, 15).a.lvl).toBe(0);
  });
  it('drops expired alerts', () => {
    const alerts = [{ event: 'Dense Fog Advisory', start: T0, end: T0 + HOUR, lvl: 2 }];
    expect(model(undefined, DEFAULTS, { alerts }).alerts).toHaveLength(0);
  });
});

describe('buildModel', () => {
  it('returns null without a forecast', () => {
    expect(buildModel({}, { ...DEFAULTS }, NOON)).toBeNull();
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
    const r = parseRiver({ features: [
      { properties: { monitoring_location_id: 'USGS-01154500', parameter_code: '00060', value: '7000', time: '2026-06-15T12:00:00Z' } },
      { properties: { monitoring_location_id: 'USGS-01161280', parameter_code: '00010', value: '18.5', time: '2026-06-15T12:00:00Z' } },
      { properties: { monitoring_location_id: 'USGS-01161280', parameter_code: '00060', value: 'x', time: '2026-06-15T12:00:00Z' } }
    ] });
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
    const m = buildModel({ wx: (() => { const d = wx((i, t) => (localHour(t) <= 10 ? { temp: 55, dew: 54, wind: 2 } : {})); delete d.hourly.cloud_cover; return d; })(), river: RIVER }, { ...DEFAULTS }, NOON);
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
    const m = model((i, t) => (localHour(t) <= 10 ? air : {}), { ...DEFAULTS, waterOverride: '80' });
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
    const late = buildModel({ wx: wx(), river: RIVER }, { ...DEFAULTS }, T0 + 22 * HOUR); // 10 PM
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
    const high = at(buildModel({ wx: wx(() => wx8), river: { ...RIVER, flow: { v: 22000, t: NOON } } }, { ...DEFAULTS }, NOON), 12);
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
    const withFlow = f => buildModel({ wx: wx(), river: RIVER, flow: f }, { ...DEFAULTS }, NOON);
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
