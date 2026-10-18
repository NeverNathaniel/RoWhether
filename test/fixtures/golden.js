// Synthetic upstream responses for the golden tests (and, later, the browser
// tests). Four scenarios, each a 7 day forecast at the dock with every source
// in the shape its API sends, so the app's own parsers run on them.
//
// Nothing here imports from src/, so a refactor cannot change what the tests
// are fed. Randomness comes from a seeded generator made of integer math, so
// the data is the same on every machine and in every time zone.
//
//   raw(clock) returns { wx, alerts, obs, river, flow, flowDays, flowFcst, aq,
//   models }: what the nine requests would return at that moment. The forecast
//   is fixed per scenario; the current conditions, the gauge readings, the
//   48 hour flow series and the river forecast are cut at the clock.
import SunCalc from 'suncalc';

const HOUR = 3600e3, MIN = 60e3;
const TZ = 'America/New_York';
const DOCK = { lat: 42.9607, lon: -72.5219 };

// ---------- small helpers ----------
const fHour = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' });
const fKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourOf = t => parseInt(fHour.format(new Date(t)), 10) % 24;
const keyOf = t => fKey.format(new Date(t));
const iso = t => new Date(t).toISOString().replace('.000Z', '+00:00');
const isoZ = t => new Date(t).toISOString().replace('.000Z', 'Z');
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mod360 = v => ((Math.round(v) % 360) + 360) % 360;

// mulberry32: integer math only, so it is exact everywhere.
function seeded(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Linear interpolation through [x, y] points, held flat past the ends.
function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
  }
  return pts[pts.length - 1][1];
}

// Local midnight at or before t.
function dayStart(t) {
  let m = Math.floor(t / HOUR) * HOUR;
  while (hourOf(m) !== 0) m -= HOUR;
  return m;
}

// Local midnights of `days` days from the first one, and every UTC hour in
// between. A day is 23, 24 or 25 hours, so the next midnight is found, not added.
function timeline(t0, days) {
  const mids = [t0];
  while (mids.length <= days) {
    const t = mids[mids.length - 1];
    mids.push([23, 24, 25].map(h => t + h * HOUR).find(x => hourOf(x) === 0));
  }
  const times = [];
  for (let t = t0; t < mids[days]; t += HOUR) times.push(t);
  return { mids, times };
}

// 0 at 6 AM, 1 at 3:30 PM, then an evening cool down that is quick at first.
function diurnal(hr) {
  const x = (hr - 6 + 24) % 24;
  if (x <= 9.5) return Math.sin(Math.PI / 2 * x / 9.5);
  const e = v => Math.exp(-(v - 9.5) / 4), floor = e(24);
  return (e(x) - floor) / (1 - floor);
}
// Wind builds from 8 AM to a peak near 2 PM and eases by 8 PM.
const breeze = hr => Math.max(0, Math.sin(Math.PI * (hr - 8) / 12));

// ---------- scenario tables ----------
// One day: air lo and hi in °F; sn and sd, air minus dew point at night and
// by day; wind [night, afternoon] mph; gr, the gust ratio; dir [morning,
// evening] in degrees; cloud [dawn, afternoon] percent; pop percent; cape J/kg.
const day = (lo, hi, o = {}) => ({ lo, hi, sn: 5, sd: 16, wind: [3, 8], gr: 1.8, dir: [200, 200], cloud: [20, 40], pop: 4, cape: 0, ...o });
// An event patches the hours of local day d from hour `from` up to `to`. A
// value can be a number, null, or (base, k) => value with k counting hours in.
const ev = (d, from, to, set) => ({ d, from, to, set });
const seq = list => (b, k) => list[k];

const ALERT = {
  flood: {
    event: 'Flood Watch', sev: 'Moderate', urgency: 'Future', certainty: 'Possible',
    headline: 'Flood Watch issued April 14 at 5:12AM EDT until April 16 at 8:00AM EDT by NWS Albany NY',
    description: '* WHAT...Flooding caused by excessive rainfall and snowmelt is possible.\n\n* WHERE...Portions of southern Vermont, including Windham County.\n\n* IMPACTS...Excessive runoff may result in flooding of rivers, creeks and other low-lying and flood-prone locations.',
    instruction: 'You should monitor later forecasts and be alert for possible Flood Warnings. Those living in areas prone to flooding should be prepared to take action should flooding develop.'
  },
  wind: {
    event: 'Wind Advisory', sev: 'Moderate', urgency: 'Expected', certainty: 'Likely',
    headline: 'Wind Advisory issued April 14 at 5:12AM EDT until April 16 at 6:00PM EDT by NWS Albany NY',
    description: '* WHAT...West winds 15 to 25 mph with gusts up to 40 mph expected.\n\n* WHERE...Windham County.',
    instruction: 'Winds this strong can blow around unsecured objects. Boats on open water should secure moorings.'
  },
  frost: {
    event: 'Frost Advisory', sev: 'Minor', urgency: 'Expected', certainty: 'Likely',
    headline: 'Frost Advisory issued October 14 at 3:47AM EDT until October 15 at 9:00AM EDT by NWS Albany NY',
    description: '* WHAT...Temperatures as low as 34 will result in frost formation.\n\n* WHERE...Windham County.',
    instruction: 'Take steps now to protect tender plants from the cold.'
  }
};

const SCN = {
  'june-calm': {
    t0: Date.UTC(2026, 5, 15, 4), seed: 6150, clocks: [12, 21],
    days: [
      day(61, 79, { sn: 5, sd: 22, wind: [2, 7], dir: [215, 195], cloud: [10, 30], pop: 3 }),
      day(60, 82, { sn: 5, sd: 22, wind: [2, 8], dir: [200, 220], cloud: [15, 35], pop: 5 }),
      day(62, 84, { sn: 6, sd: 20, wind: [3, 9], dir: [220, 230], cloud: [20, 45], pop: 8, cape: 600 }),
      day(63, 85, { sn: 6, sd: 18, wind: [3, 10], dir: [230, 240], cloud: [25, 60], pop: 15, cape: 1100 }),
      day(64, 79, { sn: 4, sd: 14, wind: [5, 13], dir: [250, 290], cloud: [60, 40], pop: 25, gr: 1.9 }),
      day(55, 72, { sn: 8, sd: 24, wind: [4, 11], dir: [300, 320], cloud: [20, 40], pop: 5 }),
      day(52, 74, { sn: 9, sd: 24, wind: [2, 6], dir: [320, 270], cloud: [10, 25], pop: 2 })
    ],
    events: [
      ev(3, 15, 19, { pop: 40, cape: 1400 }),
      ev(4, 6, 11, { pop: seq([55, 70, 70, 60, 45]), precip: seq([0.02, 0.05, 0.06, 0.03, 0.01]), code: 80, cloud: 90 })
    ],
    water: 20.0, flow: [[-768, 7800], [-480, 9200], [-240, 7000], [-96, 6400], [0, 6050], [12, 5950], [100, 5700], [200, 5200]],
    aq: { base: 28, events: [] }, spread: [2, 2, 3, 3, 5, 3, 2], split: [0, 0, 0, 0, 1, 0, 0],
    alerts: [], obsUnit: 'km_h-1', fcBias: 1
  },

  'october-fog': {
    t0: Date.UTC(2026, 9, 14, 4), seed: 10140, clocks: [6, 12, 21],
    days: [
      day(37, 63, { sn: 1.5, sd: 14, wind: [1.5, 6], dir: [330, 190], cloud: [5, 15], pop: 2 }),
      day(35, 60, { sn: 1.5, sd: 12, wind: [1.5, 8], dir: [10, 200], cloud: [5, 30], pop: 4 }),
      day(47, 58, { sn: 2, sd: 6, wind: [3, 6], dir: [180, 170], cloud: [85, 90], pop: 35 }),
      day(45, 54, { sn: 4, sd: 4, wind: [5, 12], dir: [150, 190], cloud: [95, 95], pop: 80 }),
      day(30, 52, { sn: 1.5, sd: 14, wind: [1, 5], dir: [320, 250], cloud: [3, 10], pop: 1 }),
      day(41, 60, { sn: 3.5, sd: 18, wind: [2, 7], dir: [300, 240], cloud: [40, 30], pop: 2 }),
      day(44, 55, { sn: 12, sd: 18, wind: [8, 17], dir: [20, 30], cloud: [60, 50], pop: 10, gr: 1.65 })
    ],
    events: [
      // Day 0: steam fog before dawn, then valley fog until about 9 AM.
      ev(0, 0, 4, { wind: 5, spread: 3 }),
      ev(0, 4, 9, { wind: 1.5, spread: 1.4 }),
      // Day 1: the same again, so the next morning at night is a likely one.
      ev(1, 0, 4, { wind: 5, spread: 3 }),
      ev(1, 4, 9, { wind: 1.5, spread: 1.4 }),
      // Day 2: the model shows fog and it lingers into the 10 AM hour.
      ev(2, 4, 11, { code: 45, vis: seq([1500, 900, 450, 250, 300, 600, 1400]) }),
      ev(2, 11, 17, { code: 51, pop: 45, precip: 0.01 }),
      // Day 3: a wet day with a heavy burst.
      ev(3, 8, 20, {
        code: 63, pop: seq([60, 70, 80, 85, 92, 94, 90, 85, 70, 60, 45, 30]),
        precip: seq([0.03, 0.05, 0.09, 0.12, 0.16, 0.18, 0.12, 0.08, 0.05, 0.04, 0.02, 0.01])
      }),
      // Day 4: a hard frost, and calm valley fog until 9 AM.
      ev(4, 0, 9, { wind: 1, spread: 1.2 }),
      // Day 5: fog possible, not likely.
      ev(5, 0, 9, { wind: 4.5, spread: 3.5 })
    ],
    water: 14.4, flow: [[-768, 3900], [-500, 5200], [-300, 4300], [-100, 3500], [0, 3300], [200, 3100]],
    aq: { base: 22, events: [] }, spread: [4, 5, 5, 6, 3, 4, 7], split: [0, 0, 0, 1, 0, 0, 0], iconDays: 5,
    alerts: [{ ...ALERT.frost, from: 22, to: 33 }], obsUnit: 'km_h-1', fcBias: 1
  },

  'april-high-water': {
    t0: Date.UTC(2026, 3, 14, 4), seed: 4140, clocks: [12, 21],
    days: [
      day(44, 60, { sn: 8, sd: 12, wind: [8, 15], dir: [200, 205], cloud: [75, 85], pop: 25, gr: 1.65 }),
      day(52, 71, { sn: 8, sd: 14, wind: [6, 12], dir: [190, 230], cloud: [60, 75], pop: 30, cape: 1300 }),
      day(40, 55, { sn: 7, sd: 12, wind: [10, 18], dir: [280, 295], cloud: [70, 45], pop: 30, gr: 1.6 }),
      day(35, 52, { sn: 8, sd: 18, wind: [5, 11], dir: [320, 330], cloud: [10, 20], pop: 3 }),
      day(33, 58, { sn: 9, sd: 20, wind: [3, 8], dir: [330, 200], cloud: [10, 25], pop: 8 }),
      day(40, 62, { sn: 7, sd: 12, wind: [5, 10], dir: [190, 200], cloud: [70, 85], pop: 60 }),
      day(42, 58, { sn: 5, sd: 10, wind: [6, 12], dir: [210, 250], cloud: [80, 70], pop: 40 })
    ],
    events: [
      // Day 0: gusts to 26 in the afternoon, then rain.
      ev(0, 13, 17, { wind: seq([14, 15.5, 15, 14]), gust: seq([22, 26, 25, 23]) }),
      ev(0, 15, 21, { code: 61, pop: seq([50, 60, 65, 60, 50, 40]), precip: seq([0.02, 0.04, 0.06, 0.04, 0.02, 0.01]) }),
      // Day 1: storm risk building, a thunderstorm code, then showers.
      ev(1, 12, 15, { pop: seq([35, 50, 55]), cape: seq([1200, 1500, 1700]) }),
      ev(1, 15, 18, { code: seq([95, 95, 80]), pop: seq([80, 85, 70]), precip: seq([0.22, 0.30, 0.10]), cape: seq([2100, 1900, 1100]), gust: seq([31, 29, 22]) }),
      ev(1, 18, 23, { code: 80, pop: 50, precip: 0.03 }),
      // Days 2, 5 and 6: rain and showers.
      ev(2, 0, 6, { code: 61, pop: 60, precip: 0.04 }),
      ev(5, 9, 21, { code: 80, pop: seq([55, 60, 65, 70, 70, 65, 60, 60, 55, 50, 45, 40]), precip: 0.02 }),
      ev(6, 12, 18, { code: 80, pop: 50, precip: 0.02 })
    ],
    water: 5.2,
    // The river rises 25% in the six hours before noon, crests the next day.
    flow: [[-768, 8200], [-600, 14000], [-420, 11000], [-300, 15500], [-150, 10500], [-48, 9500], [-24, 11200], [0, 12800], [6, 17700], [12, 22250],
      [18, 24200], [24, 25000], [36, 25400], [48, 24000], [72, 20500], [96, 15500], [200, 9000]],
    aq: {
      base: 35,
      // Smoke on the Wednesday afternoon: the index passes 151 for five hours.
      events: [
        { d: 0, from: 18, to: 24, aqi: seq([62, 70, 78, 84, 90, 96]) },
        { d: 1, from: 0, to: 10, aqi: seq([100, 104, 108, 110, 112, 114, 114, 116, 117, 118]) },
        { d: 1, from: 10, to: 18, aqi: seq([128, 142, 152, 158, 160, 156, 149, 138]) },
        { d: 1, from: 18, to: 24, aqi: seq([128, 118, 110, 104, 100, 96]) },
        { d: 2, from: 0, to: 12, aqi: seq([90, 84, 78, 74, 70, 66, 62, 60, 58, 56, 54, 52]) }
      ]
    },
    spread: [12, 11, 9, 4, 3, 5, 6], split: [1, 1, 1, 0, 0, 1, 1],
    alerts: [{ ...ALERT.flood, from: 5, to: 56 }, { ...ALERT.wind, from: 54, to: 66 }], obsUnit: 'km_h-1', fcBias: 1.04, fcMissing: [12]
  },

  'fall-back': {
    t0: Date.UTC(2026, 9, 31, 4), seed: 11010, clocks: [12, 21],
    days: [
      day(41, 58, { sn: 6, sd: 18, wind: [3, 9], dir: [210, 230], cloud: [40, 70], pop: 12 }),
      day(40, 54, { sn: 4, sd: 8, wind: [6, 13], dir: [190, 215], cloud: [85, 90], pop: 55, gr: 1.75 }),
      day(33, 48, { sn: 6, sd: 14, wind: [7, 15], dir: [290, 310], cloud: [70, 40], pop: 20, gr: 1.7 }),
      day(29, 46, { sn: 3, sd: 14, wind: [1.5, 5], dir: [330, 260], cloud: [30, 15], pop: 5 }),
      day(31, 52, { sn: 5, sd: 18, wind: [2, 6], dir: [260, 230], cloud: [10, 20], pop: 2 }),
      day(38, 57, { sn: 7, sd: 16, wind: [4, 10], dir: [220, 200], cloud: [40, 70], pop: 10 }),
      day(42, 60, { sn: 6, sd: 12, wind: [5, 11], dir: [200, 215], cloud: [70, 85], pop: 25 })
    ],
    events: [
      // Day 1 is 25 hours long. Rain from the morning to the afternoon.
      ev(1, 6, 18, {
        code: seq([61, 61, 63, 63, 80, 80, 81, 63, 61, 61, 51, 51]),
        pop: seq([60, 70, 75, 80, 85, 85, 80, 75, 70, 60, 50, 45]),
        precip: seq([0.02, 0.04, 0.06, 0.09, 0.12, 0.11, 0.1, 0.07, 0.04, 0.03, 0.01, 0.01]), cloud: 95
      }),
      // Day 3: freezing drizzle, then flurries, at dawn.
      ev(3, 3, 5, { code: 56, pop: 45, precip: 0.01, cloud: 85 }),
      ev(3, 5, 8, { code: 71, pop: 55, precip: 0.02, cloud: 90 }),
      // The far end of the forecast has gaps, as the real one sometimes does.
      ev(6, 15, 24, { vis: null, pop: null, cloud: null })
    ],
    water: 11.0, flow: [[-768, 4600], [-400, 6900], [-200, 5200], [0, 4400], [24, 4300], [30, 5200], [48, 6100], [72, 5400], [144, 4300]],
    aq: { base: 30, events: [] }, spread: [4, 6, 8, 3, 3, 4, 5], split: [0, 1, 1, 0, 0, 0, 0], noGem: true,
    alerts: [], obsUnit: 'm_s-1', fcBias: 1, fcMissing: [5]
  }
};

// ---------- the forecast ----------
const WORDS = { 0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Mostly Cloudy', 45: 'Fog/Mist', 51: 'Light Drizzle', 56: 'Freezing Drizzle', 61: 'Light Rain', 63: 'Rain', 71: 'Light Snow', 80: 'Rain Showers', 81: 'Rain Showers', 95: 'Thunderstorm' };
const MODELS = ['gfs_seamless', 'ecmwf_ifs025', 'gem_seamless', 'icon_seamless'];
// Where each model sits in the day's wind spread: ECMWF lowest, ICON highest.
const SPREAD_AT = [0.3, 0, 0.6, 1];

const built = new Map();

function forecast(sc) {
  if (built.has(sc)) return built.get(sc);
  const { mids, times } = timeline(sc.t0, 7);
  const rnd = seeded(sc.seed), n = () => rnd() * 2 - 1;
  const hours = times.map(t => {
    const d = mids.filter(x => x <= t).length - 1, p = sc.days[d], lh = hourOf(t), hr = lh + 0.5;
    const f = diurnal(hr), b = breeze(hr);
    const h = {
      temp: p.lo + (p.hi - p.lo) * f + n() * 0.5,
      spread: p.sn + (p.sd - p.sn) * f + n() * 0.4,
      wind: p.wind[0] + (p.wind[1] - p.wind[0]) * b + n() * 0.8,
      gn: Math.abs(n()) * 2,
      dir: p.dir[0] + (p.dir[1] - p.dir[0]) * hr / 24 + n() * 10,
      cloud: p.cloud[0] + (p.cloud[1] - p.cloud[0]) * f + n() * 6,
      pop: p.pop + n() * 3, precip: 0, code: undefined, vis: 24140, cape: p.cape * f * f
    };
    for (const e of sc.events) {
      if (e.d !== d || lh < e.from || lh >= e.to) continue;
      for (const [k, v] of Object.entries(e.set)) h[k] = typeof v === 'function' ? v(h, lh - e.from) : v;
    }
    const wind = clamp(h.wind, 0, 60);
    const cloud = h.cloud == null ? null : Math.round(clamp(h.cloud, 0, 100));
    const gust = h.gust ?? Math.max(wind + 1, wind * p.gr + h.gn);
    const alt = SunCalc.getPosition(new Date(t + 30 * MIN), DOCK.lat, DOCK.lon).altitude;
    const uv = alt > 0 ? 9.2 * Math.sin(alt) ** 2 * (1 - 0.5 * (cloud ?? 50) / 100) : 0;
    const code = h.code ?? (cloud == null ? 0 : cloud < 15 ? 0 : cloud < 40 ? 1 : cloud < 75 ? 2 : 3);
    return {
      t, temp: r1(h.temp), feels: r1(h.temp - 0.3 * wind + (h.temp > 70 ? 0.1 * (h.temp - 70) : 0)),
      dew: r1(h.dew ?? h.temp - Math.max(0.4, h.spread)),
      pop: h.pop == null ? null : Math.round(clamp(h.pop, 0, 100)), precip: r2(h.precip), code,
      wind: r1(wind), gust: r1(Math.max(gust, wind)), dir: mod360(h.dir),
      vis: h.vis, cape: Math.round(h.cape), cloud, uv: r2(uv)
    };
  });

  // Models: the day's wind spread around the forecast's own wind. Where the
  // day is marked split, some models show rain on the wet-ish hours and
  // others stay dry.
  const mdl = hours.map(h => {
    const d = mids.filter(x => x <= h.t).length - 1, S = sc.spread[d], wet = (h.pop ?? 0) >= 20;
    const rain = sc.split[d]
      ? (wet ? [Math.max(h.precip, 0.03), 0, h.precip / 2 + 0.015, 0] : [0, 0, 0, 0])
      : [h.precip, h.precip * 0.9, h.precip * 1.1, h.precip];
    return {
      t: h.t,
      wind: SPREAD_AT.map(a => r1(Math.max(0, h.wind + (a - 0.3) * S))),
      precip: rain.map(r2),
      noIcon: sc.iconDays != null && h.t >= mids[sc.iconDays]
    };
  });

  const daily = mids.slice(0, 7).map((m, d) => {
    const hs = hours.filter(h => h.t >= m && h.t < mids[d + 1]);
    const st = SunCalc.getTimes(new Date(m + 12 * HOUR), DOCK.lat, DOCK.lon);
    const pops = hs.map(h => h.pop).filter(v => v != null);
    return {
      t: m, sunrise: Math.round(+st.sunrise / 60000) * 60, sunset: Math.round(+st.sunset / 60000) * 60,
      hi: Math.max(...hs.map(h => h.temp)), lo: Math.min(...hs.map(h => h.temp)),
      pop: pops.length ? Math.max(...pops) : null, uv: Math.max(...hs.map(h => h.uv))
    };
  });

  // Air quality: five days, a gentle afternoon rise, patched by the scenario.
  const arnd = seeded(sc.seed + 1), nrm = () => arnd() * 2 - 1;
  const aqHours = hours.filter(h => h.t < mids[5]).map(h => {
    const d = mids.filter(x => x <= h.t).length - 1, lh = hourOf(h.t);
    let aqi = sc.aq.base + 8 * diurnal(lh + 0.5) + nrm() * 2;
    for (const e of sc.aq.events) if (e.d === d && lh >= e.from && lh < e.to) aqi = e.aqi(null, lh - e.from);
    aqi = Math.round(aqi);
    const pm = aqi <= 50 ? aqi / 50 * 9 : aqi <= 100 ? 9.1 + (aqi - 51) / 49 * 26 : aqi <= 150 ? 35.5 + (aqi - 101) / 49 * 20 : 55.5 + (aqi - 151) / 49 * 70;
    return { t: h.t, aqi, pm: r1(pm) };
  });

  const out = { mids, hours, mdl, daily, aqHours };
  built.set(sc, out);
  return out;
}

// ---------- the rest, cut at a clock ----------
const lerp = (a, b, k) => a + (b - a) * k;

// Hour values at time t, blended between the hour and the next.
function at(F, t) {
  const i = clamp(Math.floor((t - F.hours[0].t) / HOUR), 0, F.hours.length - 2), a = F.hours[i], b = F.hours[i + 1];
  const k = clamp((t - a.t) / HOUR, 0, 1);
  return { temp: lerp(a.temp, b.temp, k), feels: lerp(a.feels, b.feels, k), dew: lerp(a.dew, b.dew, k), wind: lerp(a.wind, b.wind, k), gust: lerp(a.gust, b.gust, k), dir: a.dir, code: a.code, vis: a.vis };
}

function rawFor(sc, clock) {
  const F = forecast(sc), at0 = sc.t0, fetched = clock - 3 * MIN;
  const flowAt = t => {
    const base = interp(sc.flow, (t - at0) / HOUR);
    return base * (1 + 0.004 * Math.sin(t / 3.1e6));
  };
  const feat = (p, extra = {}) => ({ type: 'Feature', id: p.id, geometry: null, properties: p, ...extra });

  // Open-Meteo forecast, in the shape of the real response.
  const cur = Math.floor(fetched / (15 * MIN)) * 15 * MIN, c = at(F, cur);
  const col = k => F.hours.map(h => h[k]);
  const wx = {
    latitude: 42.95, longitude: -72.5, generationtime_ms: 0.4, utc_offset_seconds: -new Date(at0).getUTCHours() * 3600,
    timezone: TZ, timezone_abbreviation: 'GMT-4', elevation: 74,
    current_units: { time: 'unixtime', interval: 'seconds', temperature_2m: '°F', apparent_temperature: '°F', dew_point_2m: '°F', wind_speed_10m: 'mp/h', wind_gusts_10m: 'mp/h', wind_direction_10m: '°', weather_code: 'wmo code', visibility: 'm' },
    current: {
      time: cur / 1000, interval: 900, temperature_2m: r1(c.temp), apparent_temperature: r1(c.feels), dew_point_2m: r1(c.dew),
      wind_speed_10m: r1(c.wind), wind_gusts_10m: r1(c.gust), wind_direction_10m: c.dir, weather_code: c.code, visibility: c.vis
    },
    hourly_units: { time: 'unixtime', temperature_2m: '°F', precipitation_probability: '%', precipitation: 'inch', wind_speed_10m: 'mp/h', visibility: 'm', cape: 'J/kg', cloud_cover: '%', uv_index: '' },
    hourly: {
      time: F.hours.map(h => h.t / 1000), temperature_2m: col('temp'), apparent_temperature: col('feels'), dew_point_2m: col('dew'),
      precipitation_probability: col('pop'), precipitation: col('precip'), weather_code: col('code'),
      wind_speed_10m: col('wind'), wind_gusts_10m: col('gust'), wind_direction_10m: col('dir'),
      visibility: col('vis'), cape: col('cape'), cloud_cover: col('cloud'), uv_index: col('uv')
    },
    daily_units: { time: 'unixtime', sunrise: 'unixtime', sunset: 'unixtime', temperature_2m_max: '°F', temperature_2m_min: '°F', precipitation_probability_max: '%', uv_index_max: '' },
    daily: {
      time: F.daily.map(d => d.t / 1000), sunrise: F.daily.map(d => d.sunrise), sunset: F.daily.map(d => d.sunset),
      temperature_2m_max: F.daily.map(d => d.hi), temperature_2m_min: F.daily.map(d => d.lo),
      precipitation_probability_max: F.daily.map(d => d.pop), uv_index_max: F.daily.map(d => d.uv)
    }
  };

  // NWS alerts: active ones at the clock, with the times the scenario gave.
  const alerts = {
    type: 'FeatureCollection', title: 'current watches, warnings, and advisories for 42.9607 N, 72.5219 W', updated: isoZ(fetched),
    features: sc.alerts.filter(a => sc.t0 + a.to * HOUR > clock).map((a, i) => feat({
      id: `urn:oid:2.49.0.1.840.0.${sc.seed}${i}`, areaDesc: 'Windham, VT', sent: iso(sc.t0 + Math.min(a.from, 4) * HOUR), effective: iso(sc.t0 + a.from * HOUR),
      onset: iso(sc.t0 + a.from * HOUR), expires: iso(sc.t0 + a.to * HOUR), ends: iso(sc.t0 + a.to * HOUR),
      status: 'Actual', messageType: 'Alert', category: 'Met', severity: a.sev, certainty: a.certainty, urgency: a.urgency,
      event: a.event, sender: 'w-nws.webmaster@noaa.gov', senderName: 'NWS Albany NY', headline: a.headline,
      description: a.description, instruction: a.instruction, response: 'Prepare'
    }))
  };

  // KEEN observation: the hourly report at 53 minutes past.
  const ot = Math.floor((clock - 53 * MIN) / HOUR) * HOUR + 53 * MIN, o = at(F, ot);
  const speed = v => (sc.obsUnit === 'm_s-1' ? r1(v / 2.23694) : r1(v * 1.609344));
  const gusty = o.gust >= o.wind * 1.5 + 4;
  const obs = {
    id: `https://api.weather.gov/stations/KEEN/observations/${iso(ot)}`, type: 'Feature', geometry: null,
    properties: {
      '@type': 'wx:ObservationStation', station: 'https://api.weather.gov/stations/KEEN', timestamp: iso(ot),
      textDescription: WORDS[o.code] || 'Cloudy',
      temperature: { unitCode: 'wmoUnit:degC', value: r1((o.temp - 1 - 32) / 1.8), qualityControl: 'V' },
      windDirection: { unitCode: 'wmoUnit:degree_(angle)', value: mod360(o.dir + 10), qualityControl: 'C' },
      windSpeed: { unitCode: `wmoUnit:${sc.obsUnit}`, value: speed(o.wind * 0.9), qualityControl: 'C' },
      windGust: { unitCode: `wmoUnit:${sc.obsUnit}`, value: gusty ? speed(o.gust * 0.9) : null, qualityControl: 'Z' }
    }
  };

  // USGS latest values: flow at North Walpole and water temperature at the
  // downstream gauge. Two other readings are in the response and ignored.
  const rt = Math.floor((fetched - 5 * MIN) / (15 * MIN)) * 15 * MIN;
  const reading = (loc, code, value, t, n) => feat({
    id: `${loc}-${code}-${n}`, time_series_id: `${loc}-${code}`, monitoring_location_id: loc, parameter_code: code, statistic_id: '00011',
    time: iso(t), value: String(value), unit_of_measure: code === '00060' ? 'ft^3/s' : 'degC', approval_status: 'Provisional', qualifier: null, last_modified: iso(t + 2 * MIN)
  });
  const river = {
    type: 'FeatureCollection', numberReturned: 4,
    features: [
      reading('USGS-01154500', '00060', Math.round(flowAt(rt)), rt, 1),
      reading('USGS-01154500', '00010', r1(sc.water - 0.4), rt, 2),
      reading('USGS-01161280', '00010', sc.water, rt - 15 * MIN, 3),
      reading('USGS-01161280', '00060', Math.round(flowAt(rt) * 1.12), rt - 15 * MIN, 4)
    ]
  };

  // USGS flow, 15 minute values for the last 48 hours, with one gap.
  const flow = { type: 'FeatureCollection', features: [] };
  for (let t = rt - 48 * HOUR, k = 0; t <= rt; t += 15 * MIN, k++) {
    flow.features.push(feat({ id: `flow-${k}`, time: iso(t), value: k === 37 ? null : String(Math.round(flowAt(t))) }));
  }

  // USGS daily means for the 30 days before yesterday, newest first.
  const today = dayStart(clock);
  const flowDays = { type: 'FeatureCollection', features: [] };
  for (let j = 2; j <= 31; j++) {
    const m = dayStart(today - j * 24 * HOUR + 12 * HOUR);
    let sum = 0;
    for (let k = 0; k < 24; k++) sum += flowAt(m + k * HOUR + 30 * MIN);
    flowDays.features.push(feat({ id: `day-${j}`, time: keyOf(m + 12 * HOUR), value: String(Math.round(sum / 24)) }));
  }

  // NWS river forecast: 3 days in 6 hour steps, flow in kcfs. -999 is missing.
  const first = Math.ceil(fetched / (6 * HOUR)) * 6 * HOUR;
  const flowFcst = {
    id: 'WLPN3', issuedTime: isoZ(Math.floor(fetched / HOUR) * HOUR), primaryName: 'Stage', primaryUnits: 'ft', secondaryName: 'Flow', secondaryUnits: 'kcfs',
    data: Array.from({ length: 13 }, (_, k) => {
      const t = first + k * 6 * HOUR, f = flowAt(t) * sc.fcBias;
      return { validTime: isoZ(t), generatedTime: isoZ(fetched), primary: r2(2 + f / 4500), secondary: (sc.fcMissing || []).includes(k) ? -999 : r1(f / 1000) };
    })
  };

  // Open-Meteo air quality: five days from local midnight.
  const aq = {
    latitude: 42.95, longitude: -72.5, timezone: TZ,
    hourly_units: { time: 'unixtime', us_aqi: 'USAQI', pm2_5: 'μg/m³' },
    hourly: { time: F.aqHours.map(h => h.t / 1000), us_aqi: F.aqHours.map(h => h.aqi), pm2_5: F.aqHours.map(h => h.pm) }
  };

  // Open-Meteo model comparison. A model missing from the response is left
  // out, and one that stops early has nulls after.
  const hourly = { time: F.mdl.map(h => h.t / 1000) };
  MODELS.forEach((id, i) => {
    if (sc.noGem && id === 'gem_seamless') return;
    const off = id === 'icon_seamless' && sc.iconDays != null;
    hourly[`wind_speed_10m_${id}`] = F.mdl.map(h => (off && h.noIcon ? null : h.wind[i]));
    hourly[`precipitation_${id}`] = F.mdl.map(h => (off && h.noIcon ? null : h.precip[i]));
  });
  const models = { latitude: 42.95, longitude: -72.5, timezone: TZ, hourly_units: { time: 'unixtime' }, hourly };

  return { wx, alerts, obs, river, flow, flowDays, flowFcst, aq, models, fetched };
}

// ---------- public ----------
export const SCENARIOS = {};
for (const [name, sc] of Object.entries(SCN)) {
  SCENARIOS[name] = {
    name, t0: sc.t0, clocks: sc.clocks, water: sc.water,
    clock: hour => sc.t0 + hour * HOUR,
    raw: clock => structuredClone(rawFor(sc, clock))
  };
}
export const SCENARIO_NAMES = Object.keys(SCENARIOS);
