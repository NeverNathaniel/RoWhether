// Probes: the same golden idea for the thresholds and the helper functions.
//
// The cases record what the app does with four weeks of invented weather. That
// only shows a threshold if some hour lands near it. A probe feeds a function
// every value across a range, in small steps, and records the values where its
// answer changes. A threshold that moves by a tenth of a mile an hour, a
// comparison turned from >= to >, or a unit conversion that rounds differently
// shows up as a changed row.
//
// Texts are masked (numbers become #), so a row changes when a line is crossed,
// not on every step. The cases already hold the exact words.
//
// Like capture.js this file may change how it reaches a function. What it
// produces changes only with a planned golden id (test/golden/changes.js). Each
// probe has a name (the file is test/golden/<name>.json) and the clock the test
// pins while it runs.
import * as C from '../../src/config.js';
import { FOG, WATER } from '../../src/config.js';
import { parseAlerts, parseObs, alertLevel, speedToMph } from '../../src/sources/nws.js';
import { parseRiver, parseFlow, parseFlowDays } from '../../src/sources/usgs.js';
import { parseFlowForecast } from '../../src/sources/nwps.js';
import { parseAQ, parseModels } from '../../src/sources/openmeteo.js';
import * as F from '../../src/format.js';
import * as L from '../../src/logic.js';
import { VIEWS } from '../../src/render/detail/index.js';
import { parseRoute } from '../../src/route.js';
import { PUTNEY, PUTNEY_DEFAULTS } from '../../src/putney.js';
import { bindingsFor, labelFor } from '../../src/sources/index.js';
import { SCENARIOS } from '../fixtures/golden.js';
import { BASE, CUSTOM, BLANK, TIGHT, LOCS, locWith, buildModel, dataFrom } from './capture.js';

const HOUR = 3600e3, MIN = 60e3;
// Putney's sources, for the parsers and the tables that moved out of config.js.
const BINDINGS = bindingsFor(PUTNEY);

// ---------- helpers ----------
const range = (a, b, step) => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => +(a + i * step).toFixed(6));
// The values at which f's answer changes, with the answer.
function sweep(values, f) {
  const out = [];
  let last;
  for (const v of values) { const s = f(v); if (s !== last) { out.push([v, s]); last = s; } }
  return out;
}
const mask = s => String(s).replace(/\d[\d,.]*/g, '#');
const reasons = a => a.reasons.map(x => `${x.lvl}:${x.key}:${mask(x.text)}`).join(';');
// Magnus formula inverted: the dew point in °F that gives this humidity at this air temperature.
function dewFor(tF, rh) {
  const t = (tF - 32) * 5 / 9, a = Math.log(rh / 100) + 17.625 * t / (243.04 + t);
  return (243.04 * a / (17.625 - a)) * 9 / 5 + 32;
}

// A model on a June day with nothing going on, and a mid-day hour to test.
const JUNE = SCENARIOS['june-calm'], NOON = JUNE.clock(12);
const modelWith = (S, loc = PUTNEY) => buildModel(loc, dataFrom(JUNE.raw(NOON)), S, NOON);
// The model with a different river reading. assess() and friends read the reading from m.data.
const river = (m, patch) => ({ ...m, data: { ...m.data, river: { ...m.data.river, ...patch } } });
const withFlow = (m, v) => river(m, { flow: { ...m.data.river.flow, v } });
const withWaterF = (m, f) => river(m, { waterC: { ...m.data.river.waterC, v: (f - 32) * 5 / 9 } });

const MIDDAY = Date.UTC(2026, 5, 16, 16); // 12:00 EDT, day 1
const MORNING = Date.UTC(2026, 5, 16, 13); // 9:00 EDT
const BASE = { temp: 65, feels: 65, dew: 40, pop: 0, precip: 0, code: 0, wind: 3, gust: 5, dir: 15, vis: 24140, cape: 0, cloud: 0, uv: 0, aqi: 20, pm25: 5, nightCloud: 0 };
const hourOf = (over, t = MIDDAY) => ({ t, ...BASE, ...over });

// ---------- assess, fogRisk ----------
const call = (m, h) => { const a = L.assess(m, h), f = L.fogRisk(m, h); return `${a.lvl}|${reasons(a)}|${f.risk}${f.type || ''}`; };

function assessProbe(S, loc) {
  const m = modelWith(S, loc), out = {};
  const sw = (name, values, make, mm = m) => { out[name] = sweep(values, v => call(mm, make(v))); };

  // Each line the settings and the rules draw, one variable at a time.
  sw('wind', range(0, 40, 0.05), v => hourOf({ wind: v }));
  sw('gust', range(0, 50, 0.05), v => hourOf({ gust: v }));
  sw('pop', range(0, 100, 0.1), v => hourOf({ pop: v }));
  sw('popWithCape', range(0, 60, 0.1), v => hourOf({ pop: v, cape: 1500 }));
  sw('capeWithRain', range(0, 3000, 1), v => hourOf({ cape: v, pop: 40 }));
  sw('capeAt29', range(0, 3000, 1), v => hourOf({ cape: v, pop: 29.9 }));
  sw('precip', range(0, 0.5, 0.001), v => hourOf({ precip: v }));
  sw('code', range(0, 99, 1), v => hourOf({ code: v }));
  sw('vis', range(0, 2500, 0.5), v => hourOf({ vis: v }));
  // Visibility at the quarter mile (402.335 m) and the mile (1609.34 m), to the millimeter.
  out.visEdges = sweep([402.33, 402.334, 402.335, 402.336, 402.34, 1609.33, 1609.339, 1609.34, 1609.341, 1609.35], v => call(m, hourOf({ vis: v })));
  sw('temp', range(-20, 110, 0.05), v => hourOf({ temp: v, feels: v, dew: v - 25 }));
  sw('aqi', range(0, 400, 0.1), v => hourOf({ aqi: v }));
  out.flow = sweep(range(0, 45000, 5), v => call(withFlow(m, v), hourOf({})));
  // Water temperature against the cold line, with the air at 40°F.
  out.waterTemp = sweep(range(32, 90, 0.05), v => call(withWaterF(m, v), hourOf({ temp: 40, dew: 15 })));
  // With no water reading at all, and with a hand set one.
  out.noWater = call(river(m, { waterC: undefined }), hourOf({ temp: 40, dew: 15 }));
  out.noFlow = call(river(m, { flow: undefined }), hourOf({}));
  out.noRiver = call({ ...m, data: { ...m.data, river: undefined } }, hourOf({}));

  // Fog: valley fog needs the air near the dew point, light wind and a clear night.
  // The water at 35°F, so steam fog stays out of the way.
  const early = { temp: 40, dew: 38.5, wind: 3, nightCloud: 0 }, chill = withWaterF(m, 35);
  sw('valleySpread', range(0, 8, 0.01), v => hourOf({ ...early, dew: 40 - v }, MORNING), chill);
  sw('valleyWind', range(0, 10, 0.05), v => hourOf({ ...early, wind: v, gust: Math.max(5, v) }, MORNING), chill);
  sw('valleyCloud', range(0, 100, 0.1), v => hourOf({ ...early, nightCloud: v }, MORNING), chill);
  sw('valleyNoCloud', [0], () => hourOf({ ...early, nightCloud: null }, MORNING), chill);
  // The hours of a day: fog is only looked for from midnight through the 10 AM hour.
  const day = Date.UTC(2026, 5, 16, 4);
  out.valleyHours = range(0, 23, 1).map(hr => [hr, call(chill, hourOf(early, day + hr * HOUR))]);
  out.steamHours = range(0, 23, 1).map(hr => [hr, call(withWaterF(m, 68), hourOf({ temp: 40, dew: dewFor(40, 85), wind: 3, nightCloud: 100 }, day + hr * HOUR))]);
  // Steam fog: water much warmer than the air, light wind, humid. A cloudy night turns valley fog off.
  const steam = { temp: 40, dew: dewFor(40, 85), wind: 3, nightCloud: 100 };
  out.steamDiff = sweep(range(40, 90, 0.05), v => call(withWaterF(m, v), hourOf(steam, MORNING)));
  out.steamWind = sweep(range(0, 12, 0.05), v => call(withWaterF(m, 68), hourOf({ ...steam, wind: v, gust: Math.max(5, v) }, MORNING)));
  out.steamHumidity = sweep(range(30, 100, 0.1), v => call(withWaterF(m, 68), hourOf({ ...steam, dew: dewFor(40, v) }, MORNING)));
  out.steamPossible = sweep(range(30, 100, 0.1), v => call(withWaterF(m, 52), hourOf({ ...steam, dew: dewFor(40, v) }, MORNING)));
  // The fog thresholds as the app holds them.
  out.fogConfig = FOG;
  // Missing values.
  out.gaps = Object.fromEntries(['temp', 'dew', 'wind', 'gust', 'dir', 'pop', 'precip', 'code', 'vis', 'cape', 'aqi', 'nightCloud'].map(k => [k, call(m, hourOf({ [k]: null }, MORNING))]));
  return out;
}

// ---------- water state and wind against the course ----------
function waterProbe() {
  const out = {}, FLOWS = [0, 5000, 9999, 10000, 10001, 15000, 19999, 20000, 20001, 25000];
  const DIRS = [0, 15, 45, 74, 75, 76, 105, 134, 135, 136, 165, 195, 254, 255, 256, 285, 345];
  const hourAt = (dir, wind) => hourOf({ dir, wind, gust: wind });
  const flag = (m, h, ws) => {
    const t = L.windVsCourse(m, h.dir, h.wind);
    return `${ws.lvl}${ws.axis[0]}${ws.against ? 'A' : ''}${t.includes('Chop builds') ? 'C' : ''}${t.includes('steepens') ? 'S' : ''}${t.startsWith('Near calm') ? 'z' : ''}`;
  };
  // The level of the water, and the sentences about the wind, as the wind picks up, in steady conditions.
  out.levels = {};
  for (const heading of [15, 200]) {
    const m0 = modelWith(BASE, locWith(heading));
    for (const f of FLOWS) {
      const m = withFlow(m0, f);
      for (const dir of DIRS) {
        out.levels[`heading${heading}/flow${f}/dir${dir}`] = sweep(range(0, 30, 0.1), w => {
          const h = hourAt(dir, w), c = L.chopWind(m, h);
          return flag(m, h, L.waterState(m, h, [c, c]));
        });
      }
    }
  }
  // The numbers: chop wind and the blend of this hour with the two before it.
  const m0 = modelWith(BASE);
  out.numbers = {};
  for (const f of [5000, 15000, 25000]) {
    const m = withFlow(m0, f);
    for (const dir of [15, 75, 105, 195]) {
      for (const w of [3, 6, 8, 12, 20]) {
        const h = hourAt(dir, w), c = L.chopWind(m, h), half = L.chopWind(m, hourAt(dir, w / 2)), calm = L.chopWind(m, hourAt(dir, 0));
        const ws = L.waterState(m, h, [c, c]), ws2 = L.waterState(m, h, [half, calm]), ws3 = L.waterState(m, h, [null, null]);
        out.numbers[`flow${f}/dir${dir}/wind${w}`] = [c.e, c.along, c.cross, c.axis, c.against, ws.eff, ws2.eff, ws3.eff, L.waterWhy(ws), L.waterWhy(ws2)];
      }
    }
  }
  out.course = [[null, 5], [90, null], [null, null], [90, 2.4], [90, 2.5], [90, 0], [15, 2.5], [195, 2.4]].map(([d, w]) => [d, w, L.windVsCourse(m0, d, w)]);
  // The sentence about the water: this hour against the chop wind of the hour, around the 0.8 and 1.25 lines.
  const why = (lvl, now, eff, axis = 'along', against = false) => ({ lvl, now, eff, axis, against });
  out.why = [];
  for (const lvl of [0, 1, 2, 3]) for (const axis of ['along', 'cross']) for (const against of [false, true]) {
    for (const [now, eff] of [[10, 7.99], [10, 8], [10, 8.01], [10, 12.49], [10, 12.5], [10, 12.51], [10, 10], [2.9, 2.9], [3, 3], [0, 0], [4.99, 5.01]]) {
      out.why.push([lvl, axis, against, now, eff, L.waterWhy(why(lvl, now, eff, axis, against))]);
    }
  }
  out.none = [L.chopWind(m0, hourOf({ wind: null })), L.chopWind(m0, hourOf({ dir: null })), L.waterState(m0, hourOf({ wind: null }), [null, null]), L.waterWhy(null)];
  // Debris: the flow series rises over six hours.
  out.debris = sweep(range(-30, 60, 0.05), pct => L.debrisLikely({ data: { flow: series(100, 100 * (1 + pct / 100)) } }));
  return out;
}

// A flow series of 15 minute points over 6 hours: the first value then the last.
function series(first, last, n = 25) {
  return Array.from({ length: n }, (_, i) => ({ t: i * 15 * MIN, v: i === n - 1 ? last : first }));
}

// ---------- everything else that is pure ----------
function pureProbe() {
  const out = {};
  // Flow trend and change over the last six hours.
  out.trend = sweep(range(-60, 80, 0.05), pct => [L.flowChange(series(100, 100 * (1 + pct / 100))) != null, L.flowTrend(series(100, 100 * (1 + pct / 100)))].join('|').replace(/\d+/g, '#'));
  out.trendExact = Object.fromEntries([-37.5, -10.1, -10, -9.9, 0, 9.9, 10, 10.1, 25].map(p => [p, [L.flowChange(series(100, 100 * (1 + p / 100))), L.flowTrend(series(100, 100 * (1 + p / 100)))]]));
  out.trendShort = [L.flowChange(null), L.flowChange([]), L.flowChange(series(100, 120, 3)), L.flowChange(series(0, 5)), L.flowTrend(series(0, 5)), L.flowTrend(null), L.flowChange(series(100, 120, 4))];
  // Whole numbers, so the lines are hit exactly: 10% and 20% are not over the line.
  const pairs = [[100, 110], [100, 90], [100, 110.5], [100, 89.5], [200, 220], [200, 180], [50, 55], [100, 120], [100, 119.5], [100, 100], [1, 2], [100, 160]];
  out.trendPairs = pairs.map(([a, b]) => [a, b, L.flowChange(series(a, b)), L.flowTrend(series(a, b)), L.debrisLikely({ data: { flow: series(a, b) } })]);
  // The six hour mark halfway between two points: the earlier one is used.
  const pts = (...ts) => ts.map(([h, v]) => ({ t: h * HOUR, v }));
  out.trendTies = [
    pts([0, 100], [2, 200], [4, 300], [7, 400]), pts([0, 100], [2, 200], [4, 300], [9, 400]), pts([0, 100], [1, 150], [2, 200], [4, 250], [6.5, 300]),
    pts([0, 100], [3, 150], [6, 200], [8, 300]), pts([1, 100], [3, 100], [5, 400], [7, 500])
  ].map(ser => [L.flowChange(ser), L.flowTrend(ser)]);
  // Where the six-hour mark falls between points.
  out.trendTimes = [4, 5, 6, 7, 9, 12].map(h => L.flowChange([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => ({ t: i * HOUR, v: 100 + i * 5 })).slice(0, h + 1)));

  // Forecast confidence: the mean spread of the models' wind, and the share of hours they split on rain.
  const hrs = (spread, split, n = 20) => Array.from({ length: n }, (_, i) => ({ ens: { wind: [10, 10 + spread, 10 + spread / 2], precip: i < split ? [0.05, 0, 0.02] : [0, 0, 0] } }));
  out.confidenceWind = sweep(range(0, 12, 0.01), s => { const c = L.confidence(hrs(s, 0)); return `${c.level}|${L.confidenceText(c).replace(/\d+/g, '#')}`; });
  out.confidenceRain = sweep(range(0, 20, 1), k => { const c = L.confidence(hrs(0, k)); return `${c.level}|${L.confidenceText(c)}`; });
  out.confidenceRainOnly = [3, 5, 6, 10, 11].map(k => { const c = L.confidence(hrs(5, k)); return [k, c, L.confidenceText(c, 'rain'), L.confidenceText(c, 'wind'), L.confidenceText(c)]; });
  out.confidenceEdges = [L.confidence([]), L.confidence([{ ens: null }]), L.confidence([{ ens: { wind: [5], precip: [0] } }]), L.confidence([{ ens: { wind: [], precip: [] } }]), L.confidenceText(null), L.confidence([{ ens: { wind: [1, 9], precip: [] } }]), L.confidence([{ ens: { wind: [], precip: [0, 0.01] } }])];

  // The chance and amount of rain over some hours.
  const ph = (pop, code, precip = 0) => ({ t: 0, pop, code, precip });
  const base = Date.UTC(2026, 5, 16, 12);
  const run = (...hs) => L.precipSummary(hs.map((h, i) => ({ ...h, t: base + i * HOUR })));
  out.precipSummary = {
    empty: L.precipSummary([]),
    single: run(ph(40, 61, 0.02)),
    nullPop: run(ph(null, 61, 0.02), ph(null, 0)),
    window: run(ph(10, 0), ph(50, 61), ph(60, 61), ph(70, 63), ph(60, 63), ph(59.9, 63), ph(20, 0)),
    windowEdge: run(ph(60, 61), ph(50, 61), ph(49.9, 61), ph(70, 63)),
    firstPeak: run(ph(70, 61), ph(40, 61), ph(70, 63)),
    kindNeeds30: run(ph(29, 61), ph(29, 61), ph(30, 80)),
    kindByAmount: run(ph(0, 61, 0.01), ph(0, 61, 0.01), ph(0, 71, 0)),
    kindTie: run(ph(50, 61), ph(50, 80)),
    none: run(ph(10, 61), ph(0, 0)),
    noAmount: run(ph(10, 61, null), ph(10, 61, undefined)),
    amountOnly: run(ph(10, 61, 0.01), ph(0, 63, 0.01), ph(10, 80, 0)),
    total: run(ph(10, 0, 0.1), ph(10, 0, 0.2), ph(10, 0, 0.0004))
  };
  out.kinds = Object.fromEntries(range(0, 99, 1).map(c => [c, L.precipKind(c)]).filter(([, k]) => k));
  out.rates = sweep(range(0, 0.5, 0.001), v => L.rateWord(v));
  out.aqiWords = sweep(range(0, 600, 1), v => L.aqiWord(v));
  out.uvWords = sweep(range(0, 16, 0.05), v => L.uvWord(v));

  // Direction.
  out.relWind = Object.fromEntries([0, 15, 195, 200, 359].map(h => [h, range(0, 360, 15).map(d => L.relWind(d, h))]));
  out.angDev = range(0, 360, 30).map(a => [a, L.angDev(a, 15), L.angDev(15, a)]);
  out.meanDir = {
    north: L.meanDir([{ wind: 5, dir: 350 }, { wind: 5, dir: 10 }]),
    weighted: L.meanDir([{ wind: 10, dir: 90 }, { wind: 2, dir: 270 }]),
    calm: L.meanDir([{ wind: 0, dir: 90 }, { wind: 0, dir: 270 }]),
    nullWind: L.meanDir([{ wind: null, dir: 45 }, { wind: 3, dir: 45 }]),
    single: L.meanDir([{ wind: 7, dir: 123 }])
  };

  // Humidity and temperature.
  out.humidity = [[32, 32], [50, 40], [70, 60], [90, 70], [40, 38.5], [40, 40], [100, 50], [20, 10]].map(([t, d]) => [t, d, L.relHumidity(t, d)]);
  out.cToF = [-40, -17.78, 0, 15, 20, 36.6, 100].map(c => [c, F.cToF(c)]);

  // The NWS river forecast between its points.
  const fc = { pts: [{ t: 1000, v: 10000 }, { t: 2000, v: 14000 }, { t: 4000, v: 12000 }] };
  out.flowForecast = [0, 999, 1000, 1500, 2000, 3000, 4000, 4001].map(t => [t, L.flowForecastAt(fc, t)]).concat([['null', L.flowForecastAt(null, 5)], ['empty', L.flowForecastAt({ pts: [] }, 5)]]);
  out.flowPeak = [0, 1000, 1500, 2000, 2001, 4000, 5000].map(t => [t, L.flowForecastPeak(fc, t)]).concat([['null', L.flowForecastPeak(null, 0)], ['empty', L.flowForecastPeak({ pts: [] }, 0)]]);

  // The event names the alert level is read from.
  out.alertLevels = Object.fromEntries(['Tornado Warning', 'Tornado Watch', 'Severe Thunderstorm Watch', 'Flash Flood Warning', 'Flash Flood Watch', 'Flood Warning', 'Flood Watch', 'Flood Advisory', 'High Wind Warning', 'High Wind Watch', 'Wind Advisory', 'Extreme Wind Warning', 'Dense Fog Advisory', 'Dense Smoke Advisory', 'Winter Storm Warning', 'Winter Storm Watch', 'Winter Weather Advisory', 'Ice Storm Warning', 'Blizzard Warning', 'Frost Advisory', 'Freeze Warning', 'Heat Advisory', 'Excessive Heat Warning', 'Air Quality Alert', 'Special Weather Statement', 'Small Craft Advisory', 'Lake Wind Advisory', 'Red Flag Warning', 'Fire Weather Watch', 'tornado warning', 'DENSE FOG ADVISORY', '', 'Hydrologic Outlook'].map(e => [e, alertLevel(e)]));
  return out;
}

// ---------- the formatters ----------
function formatProbe() {
  const out = {}, now = Date.now();
  const ts = {
    midnightEDT: Date.UTC(2026, 9, 18, 4), lastSecondBefore: Date.UTC(2026, 9, 18, 4) - 1000, noonEDT: Date.UTC(2026, 9, 18, 16),
    halfPast: Date.UTC(2026, 9, 18, 16, 30), fivePast: Date.UTC(2026, 9, 18, 9, 5), oneMinuteToNoon: Date.UTC(2026, 9, 18, 15, 59), elevenPM: Date.UTC(2026, 9, 19, 3),
    springBefore: Date.UTC(2026, 2, 8, 6, 59, 59), springAfter: Date.UTC(2026, 2, 8, 7, 0, 0), springNoon: Date.UTC(2026, 2, 8, 16), springMidnight: Date.UTC(2026, 2, 8, 5), springNextMidnight: Date.UTC(2026, 2, 9, 4),
    fallBefore: Date.UTC(2026, 10, 1, 5, 59, 59), fallRepeat: Date.UTC(2026, 10, 1, 6, 0, 0), fallLater: Date.UTC(2026, 10, 1, 7, 0, 0), fallMidnight: Date.UTC(2026, 10, 1, 4), fallNextMidnight: Date.UTC(2026, 10, 2, 5),
    newYearEve: Date.UTC(2026, 11, 31, 4, 59, 59), newYear: Date.UTC(2026, 11, 31, 5), newYearUTC: Date.UTC(2027, 0, 1, 0), leapDay: Date.UTC(2028, 1, 29, 17), epoch: 0,
    julyNoon: Date.UTC(2026, 6, 4, 16), januaryNoon: Date.UTC(2027, 0, 15, 17)
  };
  out.times = Object.fromEntries(Object.entries(ts).map(([k, t]) => [k, {
    iso: new Date(t).toISOString(), dayKey: F.dayKey(t), hm: F.hm(t), hShort: F.hShort(t), weekday: F.weekday(t), monthDay: F.monthDay(t), localHour: F.localHour(t),
    long: F.fDayLong.format(new Date(t)), dayWord: F.dayWord(t), dayWordLower: F.dayWord(t, true), whenText: F.whenText(t), whenLower: F.whenText(t, true)
  }]));
  // Every half hour across a day, and every day across the week, from the pinned now.
  out.halfHours = range(0, 47, 1).map(i => F.hm(Date.UTC(2026, 9, 18, 4) + i * 30 * MIN)).join('|');
  out.hShort = range(0, 23, 1).map(i => F.hShort(Date.UTC(2026, 9, 18, 4) + i * HOUR)).join('|');
  out.dayWords = range(-2, 8, 1).map(d => [d, F.dayWord(now + d * 24 * HOUR), F.whenText(now + d * 24 * HOUR, true)]);
  // Time since: seconds, minutes, hours, days.
  out.ago = Object.fromEntries([['none', null], ['zero', 0], ['sec29', 29e3], ['sec30', 30e3], ['sec31', 31e3], ['min59', 59 * MIN], ['min60', 60 * MIN], ['min89', 89 * MIN], ['min90', 90 * MIN], ['h47', 47 * HOUR], ['h48', 48 * HOUR], ['h60', 60 * HOUR], ['h100', 100 * HOUR], ['future', -5 * MIN]].map(([k, d]) => [k, F.ago(d == null ? null : now - d)]));
  out.visText = [null, 0, 100, 402, 1609, 1609.34, 1610, 8000, 16092, 16093.4, 16094, 24140].map(v => [v, F.visText(v)]);
  out.rng = [[3, 3, ' mph'], [3.4, 3.6, ' mph'], [2.5, 3.5, ''], [null, null, ''], [1, null, ' mph'], [-3, 4, '°F'], [10, 10.4, ' mph']].map(a => [a, F.rng(...a)]);
  out.card = [null, NaN, 0, 11.24, 11.25, 22.5, 33.75, 348.74, 348.75, 359.9, 360, 371.25, -10, -11.25, 720, '90'].map(d => [d, F.card(d)]);
  out.numbers = {
    r0: [null, undefined, NaN, '', '12.5', 0.5, 1.5, 2.5, -0.5, -1.5, 2.4999].map(v => [String(v), F.r0(v)]),
    fmtInt: [0, 999.4, 999.5, 1000, 22249.5, 1234567, -1500].map(v => [v, F.fmtInt(v)])
  };
  out.text = { esc: F.esc('<a href="x">Tom & \'Jerry\'</a>'), escNull: [F.esc(null), F.esc(undefined), F.esc(0), F.esc('')], lowerFirst: ['Wind', '°F', '', null, 'a', 'ABC'].map(s => F.lowerFirst(s)) };
  return out;
}

// ---------- the parsers on odd input ----------
function parserProbe() {
  const out = {}, f = props => ({ type: 'Feature', properties: props });
  out.alerts = [
    parseAlerts({}), parseAlerts({ features: [] }), parseAlerts({ features: [{}] }), parseAlerts({ features: [f({})] }),
    parseAlerts({ features: [f({ event: 'Flood Watch', effective: '2026-04-14T10:00:00-04:00', expires: '2026-04-15T10:00:00-04:00' })] }),
    parseAlerts({ features: [f({ event: 'Flood Watch', onset: '2026-04-14T11:00:00-04:00', effective: '2026-04-14T10:00:00-04:00', ends: '2026-04-15T09:00:00-04:00', expires: '2026-04-15T10:00:00-04:00' })] }),
    parseAlerts({ features: [f({ event: 'High Wind Warning', onset: 'not a date', ends: 'x' })] })
  ];
  const q = (value, unitCode) => ({ value, unitCode });
  out.speed = [null, undefined, {}, q(null, 'wmoUnit:km_h-1'), q(10, 'wmoUnit:km_h-1'), q(10, 'wmoUnit:m_s-1'), q(10), q(0, 'wmoUnit:km_h-1'), q('10', 'wmoUnit:km_h-1')].map(v => speedToMph(v));
  out.obs = [
    parseObs({}), parseObs({ properties: {} }),
    parseObs({ properties: { timestamp: '2026-04-14T15:53:00+00:00', temperature: { value: 10 }, windSpeed: q(18, 'wmoUnit:km_h-1'), windGust: q(null), windDirection: { value: 250 }, textDescription: 'Cloudy' } }),
    parseObs({ properties: { timestamp: '2026-04-14T15:53:00+00:00', temperature: { value: null }, windSpeed: q(5, 'wmoUnit:m_s-1'), windGust: q(8, 'wmoUnit:m_s-1'), windDirection: null } }),
    parseObs({ properties: { timestamp: 'nope', temperature: { value: 0 } } })
  ];
  const r = (id, code, value, time = '2026-04-14T15:45:00+00:00') => f({ monitoring_location_id: id, parameter_code: code, value, time });
  // The river parser reads the gauge ids from its binding.
  const rb = BINDINGS.find(b => b.slot === 'river');
  out.river = [
    parseRiver({}, rb), parseRiver({ features: [] }, rb),
    parseRiver({ features: [r('USGS-01154500', '00060', '12000'), r('USGS-01161280', '00010', '8.5')] }, rb),
    parseRiver({ features: [r('USGS-01154500', '00060', 'Ice'), r('USGS-01161280', '00010', null), r('USGS-01154500', '00010', '9'), r('USGS-01161280', '00060', '999')] }, rb),
    parseRiver({ features: [r('USGS-01154500', '00060', '1'), r('USGS-01154500', '00060', '2')] }, rb),
    parseRiver({ features: [r('USGS-01154500', '00060', '0')] }, rb)
  ];
  const pt = (time, value) => f({ time, value });
  out.flow = [
    parseFlow({}), parseFlow({ features: [] }),
    parseFlow({ features: [pt('2026-04-14T15:00:00+00:00', '100'), pt('2026-04-14T14:00:00+00:00', '90'), pt('2026-04-14T14:30:00+00:00', null), pt('bad', '5'), pt('2026-04-14T14:45:00+00:00', 'x'), pt('2026-04-14T16:00:00+00:00', '0')] })
  ];
  out.flowDays = [
    parseFlowDays({}), parseFlowDays({ features: [pt('2026-04-12', '9000'), pt('2026-04-10', '8000'), pt('2026-04-11', null), pt('nope', '1'), pt('2026-04-13', 'Eqp')] })
  ];
  out.flowFcst = [
    parseFlowForecast({}), parseFlowForecast({ data: [] }),
    parseFlowForecast({ issuedTime: '2026-04-14T12:00:00Z', secondaryUnits: 'kcfs', data: [{ validTime: '2026-04-14T18:00:00Z', secondary: 12.4 }, { validTime: '2026-04-14T12:00:00Z', secondary: 11.1 }, { validTime: '2026-04-15T00:00:00Z', secondary: -999 }, { validTime: 'bad', secondary: 5 }, { validTime: '2026-04-15T06:00:00Z', secondary: '4' }, { validTime: '2026-04-15T12:00:00Z', secondary: 0 }] }),
    parseFlowForecast({ secondaryUnits: 'cfs', data: [{ validTime: '2026-04-14T18:00:00Z', secondary: 12400 }] }),
    parseFlowForecast({ issuedTime: 'x', data: [{ validTime: '2026-04-14T18:00:00Z', secondary: 3 }] })
  ];
  out.aq = [
    parseAQ({}), parseAQ({ hourly: {} }), parseAQ({ hourly: { time: [1, 2, 3, 4], us_aqi: [10, null, '', 'x'], pm2_5: [1.5, 2, null, null] } }),
    parseAQ({ hourly: { time: [1, 2], us_aqi: [10, 20] } }), parseAQ({ hourly: { time: [1, 2], pm2_5: [3, 4] } }), parseAQ({ hourly: { time: [1], us_aqi: [0], pm2_5: [0] } })
  ];
  out.models = [
    parseModels({}), parseModels({ hourly: {} }),
    parseModels({ hourly: { time: [1, 2], wind_speed_10m_gfs_seamless: [5, null], precipitation_gfs_seamless: [0.1, 0], wind_speed_10m_icon_seamless: [7, 8] } }),
    parseModels({ hourly: { time: [1], precipitation_ecmwf_ifs025: [0.2] } }),
    parseModels({ hourly: { time: [1, 2, 3], wind_speed_10m_gem_seamless: [1, '', 'x'], precipitation_gem_seamless: [null, 0, '0.3'] } })
  ];
  return out;
}

// ---------- the edges of the day ----------
// Daylight and the periods one millisecond either side of first light, sunrise, sunset
// and the end of twilight, on a June day and an October day.
function sunEdgesProbe() {
  const out = {};
  for (const [name, sc] of [['june', JUNE], ['october', SCENARIOS['october-fog']]]) {
    const clock = sc.clock(24 + 12), data = dataFrom(sc.raw(clock));
    const m = buildModel(PUTNEY, data, BASE, clock), key = m.days[1].key, s = L.sunFor(m, key);
    out[`${name}/sun`] = s;
    for (const edge of ['dawn', 'sunrise', 'sunset', 'dusk']) {
      for (const d of [-1, 0, 1]) {
        const t = s[edge] + d, mm = buildModel(PUTNEY, data, BASE, t);
        out[`${name}/${edge}${d === 0 ? '' : d > 0 ? '+1' : '-1'}`] = [mm.daytime, L.lightAt(mm, t), mm.days[1].periods.map(p => [p.key, p.past, p.lightsUntil, p.lvl]), L.callRuns(mm, key).map(r => [r.lvl, r.start, r.end]), mm.next && mm.next.key];
      }
    }
  }
  return out;
}

// ---------- a forecast that cannot be used ----------
function nullProbe() {
  const raw = JUNE.raw(NOON), S = { ...BASE }, data = dataFrom(raw);
  const empty = { ...raw.wx, hourly: Object.fromEntries(Object.keys(raw.wx.hourly).map(k => [k, []])) };
  const kinds = {
    noData: buildModel(PUTNEY, {}, S, NOON), noWx: buildModel(PUTNEY, { wx: null }, S, NOON), noHourly: buildModel(PUTNEY, { wx: { daily: raw.wx.daily } }, S, NOON),
    noDaily: buildModel(PUTNEY, { wx: { hourly: raw.wx.hourly } }, S, NOON), emptyHours: buildModel(PUTNEY, { ...data, wx: empty }, S, NOON),
    afterTheEnd: buildModel(PUTNEY, data, S, NOON + 9 * 24 * HOUR), usable: buildModel(PUTNEY, data, S, NOON)
  };
  return Object.fromEntries(Object.entries(kinds).map(([k, m]) => [k, m === null ? null : { hours: m.hours.length, days: m.days.length, h72: m.h72.length, daytime: m.daytime }]));
}

// ---------- the tables the app is built from ----------
// Words and numbers that live in config.js. Most are only seen when some hour
// triggers them (the hero's "then a storm risk" has a phrase for each reason),
// so they are recorded whole. The tab order and the routes are here too.
// Putney's gauges and source names used to live in config.js. P0.8 moved them
// to the location's bindings, and P0.9 did the same for the dock, the settings
// and the two river terms of WATER, where they are read from now.
function configProbe() {
  const names = ['SITE_URL', 'LOC', 'DEFAULTS', 'PERIODS', 'FOG', 'WATER', 'GAUGE_FLOW', 'GAUGE_TEMP', 'NWS_GAUGE', 'MODELS', 'CONFIDENCE', 'AQI', 'SOURCE_NAMES', 'FACTORS', 'THEN', 'WORD', 'WORD_PLAIN', 'LIGHT_KEYS', 'REFRESH_MS', 'HOUR', 'MIN', 'MAX_TEXT'];
  const slot = s => BINDINGS.find(b => b.slot === s);
  const moved = {
    GAUGE_FLOW: slot('river').params.flow, GAUGE_TEMP: slot('river').params.temp, NWS_GAUGE: slot('flowFcst').params.lid,
    SOURCE_NAMES: Object.fromEntries(BINDINGS.map(b => [b.slot, labelFor(b.slot, b)])),
    LOC: { lat: PUTNEY.lat, lon: PUTNEY.lon, tz: PUTNEY.tz },
    DEFAULTS: PUTNEY_DEFAULTS,
    WATER: { ...C.WATER, cross: PUTNEY.water.cross, against: PUTNEY.flow.against }
  };
  return {
    config: Object.fromEntries(names.map(k => [k, k in moved ? moved[k] : C[k] === undefined ? '(missing)' : C[k]])),
    views: VIEWS.map(v => [v.key, v.name]),
    routes: Object.fromEntries(['', '#', '#now', '#wind', '#wind/2026-10-14', '#/wind', '#/wind/2026-10-14', '#wind/bad', '#wind/2026-10-14/extra', '#nope', '#week/2026-1-1', '#air/2026-12-31', '#WIND', 'wind', '#fog/', '#river/2026-02-30'].map(h => [h, parseRoute(h)])),
    noRoute: [parseRoute(undefined), parseRoute(null)]
  };
}

export const PROBES = [
  { name: 'p-assess-default', clock: NOON, run: () => assessProbe(BASE) },
  { name: 'p-assess-custom', clock: NOON, run: () => assessProbe(CUSTOM, LOCS.custom) },
  { name: 'p-assess-blank', clock: NOON, run: () => assessProbe(BLANK) },
  { name: 'p-assess-tight', clock: NOON, run: () => assessProbe(TIGHT, LOCS.tight) },
  { name: 'p-water', clock: NOON, run: waterProbe },
  { name: 'p-pure', clock: NOON, run: pureProbe },
  { name: 'p-format', clock: Date.UTC(2026, 9, 18, 15), run: formatProbe },
  { name: 'p-parsers', clock: NOON, run: parserProbe },
  { name: 'p-sun-edges', clock: NOON, run: sunEdgesProbe },
  { name: 'p-null-model', clock: NOON, run: nullProbe },
  { name: 'p-config', clock: NOON, run: configProbe }
];
