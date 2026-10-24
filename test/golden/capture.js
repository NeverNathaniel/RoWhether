// Records what the app computes and draws for a fixed set of inputs, as one
// JSON object. test/golden.test.js compares it with the files in this folder,
// so a refactor that changes any sentence, number or piece of HTML fails.
//
// The projections below are allowlists. A field added to the model later does
// not change what is recorded; a field recorded here must keep its value.
//
// Written against the code as it stood in P0.1. Later steps may change how
// this file reaches a value (a new import path, bindingsFor(PUTNEY) for SRC).
// What it produces changes only with a planned golden id (test/golden/changes.js).
import { createHash } from 'node:crypto';
import { FACTORS, MIN } from '../../src/config.js';
import { alertLevel } from '../../src/sources/nws.js';
import { resolveLocation, effectiveSettings } from '../../src/location.js';
import { PUTNEY, PUTNEY_RECORD, PUTNEY_WATERWAY } from '../../src/putney.js';
import { bindingsFor, labelFor } from '../../src/sources/index.js';
import * as L from '../../src/logic.js';
import { renderHeader, renderNoData, renderHero, renderAlerts } from '../../src/render/hero.js';
import { renderNow } from '../../src/render/now.js';
import { renderDays } from '../../src/render/days.js';
import { forecastPanel } from '../../src/render/forecast.js';
import { precipNote } from '../../src/render/precip.js';
import { VIEWS } from '../../src/render/detail/index.js';
import { MODULES } from '../../src/render/detail/views.js';
import { weekDays } from '../../src/render/detail/common.js';
import { shareText } from '../../src/share.js';
import { app } from '../../src/state.js';
import { SCENARIOS, EXTRA_SCENARIOS } from '../fixtures/golden.js';
import { VARIANTS } from '../fixtures/variants.js';
import { installFakeDom, uninstallFakeDom } from '../helpers/fakedom.js';

// ---------- the cases ----------
// Putney's limits with nothing changed. The course heading is not one of them: it
// lives in the location, and the model gets it from there alone (review Z2). A
// case that turns the course round says so with a location resolved with that
// heading, in LOCS, under the same name as its settings.
export const BASE = effectiveSettings(PUTNEY);
export const locWith = heading => resolveLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY, overrides: { heading } });

export const CUSTOM = { ...BASE, windCaution: 8, rainCaution: '', waterOverride: 55 };

// Settings the variants use besides BASE and CUSTOM: every line the rain,
// smoke and cold settings can leave blank, and a tight set with the course
// turned round.
export const BLANK = { ...BASE, rainCaution: '', rainOff: '', aqiCaution: '', aqiOff: '' };
export const TIGHT = { ...BASE, windCaution: 6, windOff: 9, gustCaution: 10, gustOff: 14, rainCaution: 30, rainOff: 60, coldCombined: 120, flowCaution: 8000, flowOff: 12000, aqiCaution: 51, aqiOff: 101 };
// A heading whose reverse, 191°, is one degree short of a compass point edge, and a
// cold line that air plus water meets exactly in june-calm at noon (76 and 68).
export const EDGE = { ...BASE };
export const COLD144 = { ...BASE, coldCombined: 144 };
// Rain lines at the ends of what the charts can draw: 1% and 100%, then 0% and 101%.
export const RAIN1 = { ...BASE, rainCaution: 1, rainOff: 100 };
export const RAIN2 = { ...BASE, rainCaution: 0, rainOff: 101 };
const SETTINGS = { default: BASE, custom: CUSTOM, blank: BLANK, tight: TIGHT, edge: EDGE, cold144: COLD144, rain1: RAIN1, rain2: RAIN2 };
// The location each settings name is used with: Putney, or Putney with the course turned round.
export const LOCS = { custom: locWith(20), tight: locWith(200), edge: locWith(11) };
const locOf = label => LOCS[label] || PUTNEY;

// 9 scenario clocks times 2 settings, and one wide layout.
export const CASES = [];
for (const scenario of Object.values(SCENARIOS)) {
  for (const hr of scenario.clocks) {
    for (const [label, settings] of [['default', BASE], ['custom', CUSTOM]]) {
      CASES.push({ name: `${scenario.name}-${String(hr).padStart(2, '0')}00-${label}`, scenario, clock: scenario.clock(hr), settings, loc: locOf(label), width: 390 });
    }
  }
}
CASES.push({ name: 'june-calm-1200-wide', scenario: SCENARIOS['june-calm'], clock: SCENARIOS['june-calm'].clock(12), settings: BASE, loc: PUTNEY, width: 1280 });

// The variants (test/fixtures/variants.js): the same capture, leaner, on other
// clocks and on data that was cut, emptied or pushed to extremes.
export const VARIANT_CASES = VARIANTS.map(v => {
  const scenario = SCENARIOS[v.scenario] || EXTRA_SCENARIOS[v.scenario];
  return { name: v.name, scenario, clock: v.at ?? scenario.clock(v.hr), settings: SETTINGS[v.settings], loc: locOf(v.settings), width: v.width || 390, options: { raw: v.raw, data: v.data, open: v.open || 0, lean: true, extraDays: v.extraDays || [] }, claim: v.claim };
});
export const ALL_CASES = [...CASES, ...VARIANT_CASES];

// ---------- helpers ----------
// The one place the capture builds a model, so a change to buildModel's
// arguments is made here and nowhere else. The settings never carry a heading:
// the model gets the course from the location, so a line of logic that still reads
// the heading from the settings reads undefined and fails (review Z2).
export const buildModel = (loc, data, S, now) => {
  if ('heading' in S) throw new Error('The settings must not carry a heading. Give the case a location resolved with it.');
  return L.buildModel(loc, data, S, now);
};
// Putney's sources, as the page gets them (08 P0.8). The parsers run the way
// fetchAll runs them, each through its own binding (review Z5).
const BINDINGS = bindingsFor(PUTNEY);
// What fetchAll would hold: every slot's response through its binding's parse.
export const dataFrom = raw => Object.fromEntries(BINDINGS.map(b => [b.slot, b.parse(raw[b.slot], b)]));

const sha = s => createHash('sha256').update(s).digest('hex');
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k] ?? null]));
const T = hs => hs.map(h => h.t);

const HOUR_KEYS = ['t', 'temp', 'feels', 'dew', 'pop', 'precip', 'code', 'wind', 'gust', 'dir', 'vis', 'cape', 'cloud', 'uv', 'aqi', 'pm25', 'ens', 'nightCloud'];
const DAY_KEYS = ['t', 'key', 'sunrise', 'sunset', 'hi', 'lo', 'pop', 'uvMax'];
const PERIOD_KEYS = ['key', 'name', 'dayKey', 'start', 'end', 'past', 'from', 'lvl', 'wmin', 'wmax', 'gmax', 'avgWind', 'dir', 'tmin', 'tmax', 'pop', 'precip', 'lightsUntil'];
const WATER_KEYS = ['lvl', 'eff', 'now', 'axis', 'against'];
const FOG_KEYS = ['risk', 'type', 'why', 'text', 'until', 'lingers'];
const ALERT_KEYS = ['event', 'headline', 'desc', 'instr', 'start', 'end', 'lvl'];

const reason = r => (r ? pick(r, ['lvl', 'key', 'text']) : null);
const water = w => (w ? pick(w, WATER_KEYS) : null);
const fog = f => (f ? pick(f, FOG_KEYS) : null);
const hour = h => ({ ...pick(h, HOUR_KEYS), a: { lvl: h.a.lvl, reasons: h.a.reasons.map(reason) }, water: water(h.water) });
const period = p => ({
  ...pick(p, PERIOD_KEYS), why: reason(p.why), fog: fog(p.fog), hs: p.hs ? T(p.hs) : null,
  water: p.water ? { min: p.water.min, max: p.water.max, peakT: p.water.peakT, peak: water(p.water.peak) } : null
});
const run = r => ({ lvl: r.lvl, start: r.start, end: r.end, hs: T(r.hs), why: r.why.map(reason) });

function projectModel(m) {
  return {
    now: m.now, daytime: m.daytime, S: { heading: m.loc.course.heading, ...m.S },
    alerts: m.alerts.map(a => pick(a, ALERT_KEYS)),
    hours: m.hours.map(hour), h72: T(m.h72), cur: hour(m.cur),
    days: m.days.map(d => ({ ...pick(d, DAY_KEYS), periods: d.periods.map(period) })),
    next: m.next ? period(m.next) : null
  };
}

// Run fn with the clock at t. The render code reads Date.now() directly.
function at(t, fn) {
  const real = Date.now;
  Date.now = () => t;
  try { return fn(); } finally { Date.now = real; }
}

// Run fn with a stand-in localStorage that holds Plan a row choices.
function withPlan(plan, fn) {
  const was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = { getItem: k => (/plan/.test(k) ? JSON.stringify(plan) : null), setItem() {} };
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
  try { return fn(); } finally { if (was) Object.defineProperty(globalThis, 'localStorage', was); else delete globalThis.localStorage; }
}

// Words the logic gives for fixed values. They do not depend on the data, so the
// variant cases leave them out.
const words = () => ({
  kinds: Object.fromEntries([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99].map(c => [c, L.precipKind(c)])),
  rates: Object.fromEntries([0, 0.05, 0.1, 0.2, 0.3, 0.5].map(v => [v, L.rateWord(v)])),
  aqi: Object.fromEntries([0, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301, 500].map(v => [v, L.aqiWord(v)])),
  uv: Object.fromEntries([0, 2.9, 3, 5.9, 6, 7.9, 8, 10.9, 11, 13].map(v => [v, L.uvWord(v)])),
  alertLevels: Object.fromEntries(['Flood Watch', 'Flood Warning', 'Flash Flood Warning', 'Severe Thunderstorm Warning', 'Wind Advisory', 'High Wind Warning', 'Dense Fog Advisory', 'Winter Storm Warning', 'Frost Advisory', 'Special Weather Statement'].map(e => [e, alertLevel(e)]))
});

// ---------- the capture ----------
// scenario: an entry of SCENARIOS. clock: the pinned time (ms). settings: the
// settings object. sink(name, text) receives every string in full, for dumping.
//
// Options for the variant cases (see VARIANTS):
//   raw(raw, clock)  edits the upstream-shaped responses before they are parsed
//   data(data)       edits the parsed data, for a source that failed and left nothing
//   open             how many Day by day rows are open (the rows a viewer expanded)
//   extraDays        day keys to draw each view for as well, such as one with no forecast
//   lean             leaves out what an edit cannot change (the sun table, the
//                    source list, fixed word tables), the 90 minute re-render, the
//                    Plan a row choices, and every day of each detail view but the one it opens on
//   logicOnly        stops after the model, the words, the plans and the runs, which
//                    come from the logic alone (test/golden-location.test.js sets the
//                    screen's zone to another before it asks, and the render code
//                    would draw the wrong hours)
export function capture(scenario, clock, settings, { loc = PUTNEY, width = 390, sink = null, raw: editRaw = null, data: editData = null, open = 0, lean = false, logicOnly = false, extraDays = [] } = {}) {
  if (Date.now() !== clock) throw new Error('Pin the clock to the case before capturing.');
  const kept = ['loc', 'settings', 'data', 'errors', 'updated', 'fromCache', 'model', 'openPeriods', 'deviceTz'].map(k => [k, app[k]]);

  const hashed = s => ({ length: s.length, sha256: sha(s) });
  const big = (name, s) => { if (sink) sink(name, s); return hashed(s); };
  const keep = (name, s) => { if (sink) sink(name, s); return s.length < 2000 ? s : hashed(s); };
  // Every element a render function wrote to, by id.
  const elements = (dom, tag) => Object.fromEntries(dom.elements().filter(e => e.written).sort((a, b) => (a.id < b.id ? -1 : 1)).map(e => [e.id, {
    innerHTML: keep(`${tag}/${e.id}.innerHTML.html`, e.innerHTML),
    textContent: keep(`${tag}/${e.id}.textContent.txt`, e.textContent),
    hidden: e.hidden, disabled: e.disabled, dataset: { ...e.dataset }, style: { ...e.style }, extra: { ...e.extra }
  }]));

  try {
    const raw = scenario.raw(clock);
    if (editRaw) editRaw(raw, clock);
    const S = { ...settings };
    const data = dataFrom(raw);
    if (editData) editData(data);
    const m = buildModel(loc, data, S, clock);
    const out = {};

    // No usable forecast: the model is null and the page shows the no data note.
    if (!m) {
      Object.assign(app, { loc, model: null, data, errors: {}, settings: S, updated: raw.fetched, fromCache: false, openPeriods: new Set() });
      const dom = installFakeDom({ width });
      renderHeader(); renderNoData();
      out.model = null;
      out.parsers = { alerts: data.alerts, obs: data.obs, river: data.river, flow: data.flow, flowDays: data.flowDays, flowFcst: data.flowFcst, aq: data.aq, models: data.models };
      out.home = elements(dom, 'noModel');
      return JSON.parse(JSON.stringify(out));
    }

    // ----- model -----
    out.model = projectModel(m);

    // ----- text -----
    const course = {};
    for (let dir = 0; dir < 360; dir += 15) {
      for (const speed of [2, 6, 12]) course[`${dir}/${speed}`] = { text: L.windVsCourse(m, dir, speed), rel: L.relWind(dir, m.loc.course.heading) };
    }
    const morning = {};
    for (const d of m.days) { const f = L.morningFog(m, d.key); morning[d.key] = f ? { ...fog(f), lift: L.fogLift(f) } : null; }
    const nm = L.nextMorning(m);
    const conf = {};
    for (const d of m.days) {
      const hs = L.rowingHours(m, d.key), c = L.confidence(hs);
      conf[d.key] = c && { ...c, text: L.confidenceText(c), wind: L.confidenceText(c, 'wind'), rain: L.confidenceText(c, 'rain') };
    }
    const sunFor = {};
    for (const d of m.days) sunFor[d.key] = L.sunFor(m, d.key);
    out.text = {
      course,
      water: m.h72.map(h => [h.t, L.waterWhy(h.water)]),
      waterNow: L.waterWhy(m.cur.water),
      debris: L.debrisLikely(m),
      fog: m.hours.map(h => ({ t: h.t, ...fog(L.fogRisk(m, h)) })).filter(x => x.risk),
      morning,
      next: nm && { key: nm.key, t: nm.t, fog: nm.fog && { ...fog(nm.fog), lift: L.fogLift(nm.fog) } },
      confidence: conf,
      precip: {
        next12: L.precipSummary(m.h72.slice(0, 12)),
        notes: Object.fromEntries(m.days.map(d => { const s = L.precipSummary(L.rowingHours(m, d.key)); return [d.key, s && precipNote(s, m.now, m.u)]; }))
      },
      flow: { now: L.flowNow(m), trend: L.flowTrend(data.flow), change: L.flowChange(data.flow), waterTemp: L.waterTemp(m), overridden: L.waterOverridden(S) },
      light: m.hours.map(h => ({ day: 'd', twilight: 't', dark: 'n' }[L.lightAt(m, h.t + 30 * MIN)])).join(''),
      sunFor,
      ...(lean ? {} : words())
    };

    // ----- plans, runs, sun -----
    out.plans = {};
    for (const minutes of [60, 90, 120]) {
      for (const when of ['any', 'morning', 'afternoon']) {
        out.plans[`${minutes}-${when}`] = L.planSessions(m, minutes, when).map(p => ({ ...pick(p, ['key', 'start', 'end', 'score', 'water', 'wmin', 'wmax', 'gmax', 'pop']), hs: T(p.hs) }));
      }
    }
    out.runs = {};
    for (const d of m.days) {
      out.runs[d.key] = {
        call: L.callRuns(m, d.key).map(run),
        callPast: L.callRuns(m, d.key, { past: true }).map(run),
        factors: Object.fromEntries(FACTORS.map(f => [f.key, L.factorRuns(m, d.key, f.keys).map(run)]))
      };
    }
    if (logicOnly) return JSON.parse(JSON.stringify(out));
    if (!lean) {
      out.sun = {};
      for (let mo = 0; mo < 12; mo++) {
        for (const day of [1, 15]) out.sun[`2026-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`] = L.sunOn(m.loc, Date.UTC(2026, mo, day, 16));
      }
    }

    // ----- sources and parsers -----
    if (!lean) out.sources = BINDINGS.map(b => [b.slot, b.url, labelFor(b.slot, b)]);
    out.parsers = { alerts: data.alerts, obs: data.obs, river: data.river, flow: data.flow, flowDays: data.flowDays, flowFcst: data.flowFcst, aq: data.aq, models: data.models };

    // ----- detail views -----
    // From here on the render code draws, from the same model: the settings carry no
    // heading, so a line that reads one draws "undefined" and the golden text fails.
    // chartWidth() reads #detail and matchMedia, so the views need the stand-in page.
    let dom = installFakeDom({ width });
    const week = weekDays(m).map(d => d.key);
    // A lean case draws each view once, for the day it opens on.
    const days = lean ? [] : week;
    out.views = {};
    // The tabs this location has: a view with a `when` that says no is not drawn (P1.4).
    for (const { key } of VIEWS.filter(v => !v.when || v.when(loc))) {
      const v = MODULES[key];
      const entry = { summary: v.summary(m), days: {} };
      for (const k of [null, ...extraDays, ...days]) {
        const r = v.render(m, k);
        entry.days[String(k)] = { day: r.day, ...big(`views/${v.key}/${k}.html`, r.html) };
      }
      if (v.key === 'week' && !lean) {
        // Plan a row remembers its choices; the other combinations draw differently.
        entry.plans = {};
        for (const plan of [{ minutes: 60, when: 'morning' }, { minutes: 120, when: 'afternoon' }]) {
          const r = withPlan(plan, () => v.render(m, null));
          entry.plans[`${plan.minutes}-${plan.when}`] = big(`views/week/plan-${plan.minutes}-${plan.when}.html`, r.html);
        }
      }
      out.views[v.key] = entry;
    }

    // ----- the home screen -----
    // Rows a viewer opened stay open through a refresh: the first few that are not over.
    const opened = new Set(m.days.flatMap(d => d.periods).filter(x => !x.past).slice(0, open).map(x => `${x.dayKey}-${x.key}`));
    // The viewer's device is in the location's zone, so a share text never carries a zone suffix (07 6.2).
    Object.assign(app, { loc, model: m, data, errors: {}, settings: S, updated: raw.fetched, fromCache: false, openPeriods: opened, deviceTz: loc.tz });
    dom = installFakeDom({ width });
    renderHeader(); renderHero(); renderAlerts(); renderNow(); renderDays();
    out.home = elements(dom, 'home');

    // ----- full forecasts -----
    out.forecasts = {};
    for (const p of m.days.flatMap(d => d.periods).filter(x => !x.past)) {
      out.forecasts[`${p.dayKey}-${p.key}`] = big(`forecasts/${p.dayKey}-${p.key}.html`, forecastPanel(m, p));
    }

    // ----- failures -----
    const snap = (tag, errors, fn) => { const d = installFakeDom({ width }); app.errors = errors; fn(); return elements(d, `status/${tag}`); };
    const all = Object.fromEntries(BINDINGS.map(b => [b.slot, true]));
    out.status = {
      noDataAll: snap('noDataAll', all, renderNoData),
      noDataForecast: snap('noDataForecast', { wx: true }, renderNoData),
      noDataQuiet: snap('noDataQuiet', {}, renderNoData),
      partial: snap('partial', { alerts: true, river: true }, renderHero),
      // Every source named in the note, in slot order.
      partialAll: snap('partialAll', all, renderHero),
      header: {}
    };
    for (const [tag, updated, errors, fromCache] of [
      ['loading', null, {}, false], ['notLoaded', null, { wx: true }, false], ['fresh', raw.fetched, {}, false],
      ['cached', raw.fetched, {}, true], ['failed', raw.fetched, { wx: true }, false]
    ]) {
      const d = installFakeDom({ width });
      Object.assign(app, { updated, errors, fromCache });
      renderHeader();
      out.status.header[tag] = d.el('updated').textContent;
    }

    // ----- share -----
    Object.assign(app, { updated: raw.fetched, errors: {}, fromCache: false });
    installFakeDom({ width });
    renderHero();
    out.share = shareText(clock);

    // ----- ninety minutes later, on the same data -----
    // The forecast's current conditions are over 90 minutes old by now, so the
    // model falls back to the hour's values. At 6 AM in October this lands in
    // daylight with fog still on the river, which no case clock does.
    const t1 = clock + 90 * MIN;
    if (!lean) out.later = at(t1, () => {
      const m1 = buildModel(loc, data, S, t1);
      Object.assign(app, { model: m1, openPeriods: new Set() });
      const dom1 = installFakeDom({ width });
      renderHeader(); renderHero(); renderAlerts(); renderNow(); renderDays();
      return {
        now: m1.now, daytime: m1.daytime, cur: hour(m1.cur), next: m1.next ? period(m1.next) : null, h72: T(m1.h72).slice(0, 3),
        home: elements(dom1, 'later'), share: shareText(t1)
      };
    });

    return JSON.parse(JSON.stringify(out));
  } finally {
    uninstallFakeDom();
    Object.assign(app, Object.fromEntries(kept));
  }
}

// ---------- files ----------
// Pretty printed three levels deep, so one hour or one day is one line and a
// diff of two captures reads line by line.
function fmt(v, depth, pad) {
  if (v === null || typeof v !== 'object' || depth === 0) return JSON.stringify(v);
  const inner = `${pad}  `;
  if (Array.isArray(v)) return v.length ? `[\n${v.map(x => inner + fmt(x, depth - 1, inner)).join(',\n')}\n${pad}]` : '[]';
  const ks = Object.keys(v);
  return ks.length ? `{\n${ks.map(k => `${inner}${JSON.stringify(k)}: ${fmt(v[k], depth - 1, inner)}`).join(',\n')}\n${pad}}` : '{}';
}
// A probe's rows are pairs of a value and an answer, one more level down.
export const format = (v, depth = 3) => `${fmt(v, depth, '')}\n`;
