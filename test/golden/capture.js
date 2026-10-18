// Records what the app computes and draws for a fixed set of inputs, as one
// JSON object. test/golden.test.js compares it with the files in this folder,
// so a refactor that changes any sentence, number or piece of HTML fails.
//
// The projections below are allowlists. A field added to the model later does
// not change what is recorded; a field recorded here must keep its value.
//
// Written against the code as it stood in P0.1. Later steps may change how
// this file reaches a value (a new import path, bindingsFor(PUTNEY) for SRC),
// never what it produces.
import { createHash } from 'node:crypto';
import { DEFAULTS, SRC, SOURCE_NAMES, FACTORS, HOUR, MIN } from '../../src/config.js';
import { parseAlerts, parseObs, parseRiver, parseFlow, parseFlowDays, parseFlowForecast, parseAQ, parseModels, alertLevel } from '../../src/data.js';
import * as L from '../../src/logic.js';
import { renderHeader, renderNoData, renderHero, renderAlerts } from '../../src/render/hero.js';
import { renderNow } from '../../src/render/now.js';
import { renderDays } from '../../src/render/days.js';
import { forecastPanel } from '../../src/render/forecast.js';
import { precipNote } from '../../src/render/precip.js';
import { VIEWS } from '../../src/render/detail/index.js';
import { weekDays } from '../../src/render/detail/common.js';
import { shareText } from '../../src/share.js';
import { app } from '../../src/state.js';
import { SCENARIOS } from '../fixtures/golden.js';
import { installFakeDom, uninstallFakeDom } from '../helpers/fakedom.js';

// ---------- the cases ----------
export const CUSTOM = { ...DEFAULTS, heading: 20, windCaution: 8, rainCaution: '', waterOverride: 55 };

// 9 scenario clocks times 2 settings, and one wide layout.
export const CASES = [];
for (const scenario of Object.values(SCENARIOS)) {
  for (const hr of scenario.clocks) {
    for (const [label, settings] of [['default', DEFAULTS], ['custom', CUSTOM]]) {
      CASES.push({ name: `${scenario.name}-${String(hr).padStart(2, '0')}00-${label}`, scenario, clock: scenario.clock(hr), settings, width: 390 });
    }
  }
}
CASES.push({ name: 'june-calm-1200-wide', scenario: SCENARIOS['june-calm'], clock: SCENARIOS['june-calm'].clock(12), settings: DEFAULTS, width: 1280 });

// ---------- helpers ----------
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
    now: m.now, daytime: m.daytime, S: { ...m.S },
    alerts: m.alerts.map(a => pick(a, ALERT_KEYS)),
    hours: m.hours.map(hour), h72: T(m.h72), cur: hour(m.cur),
    days: m.days.map(d => ({ ...pick(d, DAY_KEYS), periods: d.periods.map(period) })),
    next: m.next ? period(m.next) : null
  };
}

// Run fn with a stand-in localStorage that holds Plan a row choices.
function withPlan(plan, fn) {
  const was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = { getItem: k => (/plan/.test(k) ? JSON.stringify(plan) : null), setItem() {} };
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true, writable: true });
  try { return fn(); } finally { if (was) Object.defineProperty(globalThis, 'localStorage', was); else delete globalThis.localStorage; }
}

// ---------- the capture ----------
// scenario: an entry of SCENARIOS. clock: the pinned time (ms). settings: the
// settings object. sink(name, text) receives every string in full, for dumping.
export function capture(scenario, clock, settings, { width = 390, sink = null } = {}) {
  if (Date.now() !== clock) throw new Error('Pin the clock to the case before capturing.');
  const kept = ['settings', 'data', 'errors', 'updated', 'fromCache', 'model', 'openPeriods'].map(k => [k, app[k]]);

  const hashed = s => ({ length: s.length, sha256: sha(s) });
  const big = (name, s) => { if (sink) sink(name, s); return hashed(s); };
  const keep = (name, s) => { if (sink) sink(name, s); return s.length < 2000 ? s : hashed(s); };
  // Every element a render function wrote to, by id.
  const elements = (dom, tag) => Object.fromEntries(dom.elements().filter(e => e.written).sort((a, b) => (a.id < b.id ? -1 : 1)).map(e => [e.id, {
    innerHTML: keep(`${tag}/${e.id}.innerHTML.html`, e.innerHTML),
    textContent: keep(`${tag}/${e.id}.textContent.txt`, e.textContent),
    hidden: e.hidden, disabled: e.disabled, dataset: { ...e.dataset }
  }]));

  try {
    const raw = scenario.raw(clock);
    const S = { ...settings };
    // What fetchAll would hold: the forecast as is, the rest parsed.
    const data = {
      wx: raw.wx, alerts: parseAlerts(raw.alerts), obs: parseObs(raw.obs), river: parseRiver(raw.river), flow: parseFlow(raw.flow),
      flowDays: parseFlowDays(raw.flowDays), flowFcst: parseFlowForecast(raw.flowFcst), aq: parseAQ(raw.aq), models: parseModels(raw.models)
    };
    const m = L.buildModel(data, S, clock);
    const out = {};

    // ----- model -----
    out.model = projectModel(m);
    // The same data read two hours later: the current conditions are stale.
    const later = L.buildModel(data, S, clock + 2 * HOUR);
    out.stale = { now: later.now, daytime: later.daytime, cur: hour(later.cur), next: later.next ? period(later.next) : null, h72: T(later.h72).slice(0, 3) };

    // ----- text -----
    const course = {};
    for (let dir = 0; dir < 360; dir += 15) {
      for (const speed of [2, 6, 12]) course[`${dir}/${speed}`] = { text: L.windVsCourse(m, dir, speed), rel: L.relWind(dir, S.heading) };
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
        notes: Object.fromEntries(m.days.map(d => { const s = L.precipSummary(L.rowingHours(m, d.key)); return [d.key, s && precipNote(s, m.now)]; }))
      },
      flow: { now: L.flowNow(m), trend: L.flowTrend(data.flow), change: L.flowChange(data.flow), waterTemp: L.waterTemp(m), overridden: L.waterOverridden(S) },
      light: m.hours.map(h => ({ day: 'd', twilight: 't', dark: 'n' }[L.lightAt(m, h.t + 30 * MIN)])).join(''),
      sunFor,
      kinds: Object.fromEntries([0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99].map(c => [c, L.precipKind(c)])),
      rates: Object.fromEntries([0, 0.05, 0.1, 0.2, 0.3, 0.5].map(v => [v, L.rateWord(v)])),
      aqi: Object.fromEntries([0, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301, 500].map(v => [v, L.aqiWord(v)])),
      uv: Object.fromEntries([0, 2.9, 3, 5.9, 6, 7.9, 8, 10.9, 11, 13].map(v => [v, L.uvWord(v)])),
      alertLevels: Object.fromEntries(['Flood Watch', 'Flood Warning', 'Flash Flood Warning', 'Severe Thunderstorm Warning', 'Wind Advisory', 'High Wind Warning', 'Dense Fog Advisory', 'Winter Storm Warning', 'Frost Advisory', 'Special Weather Statement'].map(e => [e, alertLevel(e)]))
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
    out.sun = {};
    for (let mo = 0; mo < 12; mo++) {
      for (const day of [1, 15]) out.sun[`2026-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`] = L.sunOn(Date.UTC(2026, mo, day, 16));
    }

    // ----- sources and parsers -----
    out.sources = Object.keys(SRC).map(k => [k, SRC[k](), SOURCE_NAMES[k]]);
    out.parsers = { alerts: data.alerts, obs: data.obs, river: data.river, flow: data.flow, flowDays: data.flowDays, flowFcst: data.flowFcst, aq: data.aq, models: data.models };

    // ----- detail views -----
    // chartWidth() reads #detail and matchMedia, so the views need the stand-in page.
    let dom = installFakeDom({ width });
    const days = weekDays(m).map(d => d.key);
    out.views = {};
    for (const v of VIEWS) {
      const entry = { summary: v.summary(m), days: {} };
      for (const k of [null, ...days]) {
        const r = v.render(m, k);
        entry.days[String(k)] = { day: r.day, ...big(`views/${v.key}/${k}.html`, r.html) };
      }
      if (v.key === 'week') {
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
    Object.assign(app, { model: m, data, errors: {}, settings: S, updated: raw.fetched, fromCache: false, openPeriods: new Set() });
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
    const all = Object.fromEntries(Object.keys(SRC).map(k => [k, true]));
    out.status = {
      noDataAll: snap('noDataAll', all, renderNoData),
      noDataForecast: snap('noDataForecast', { wx: true }, renderNoData),
      noDataQuiet: snap('noDataQuiet', {}, renderNoData),
      partial: snap('partial', { alerts: true, river: true }, renderHero),
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
export const format = v => `${fmt(v, 3, '')}\n`;
