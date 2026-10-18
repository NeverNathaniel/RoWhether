// Golden outputs: for fixed inputs and clocks, everything the app computes and
// draws must equal the files in test/golden/. See test/golden/capture.js.
//
//   npm test                          compares
//   node scripts/golden.mjs write     writes the files that do not exist yet
//   node scripts/golden.mjs dump <c>  writes every captured string in full
//
// Writing fails the run on purpose, so it can never pass unnoticed. Files that
// exist are never rewritten unless GOLDEN_FORCE=1, which is for P0.1 only.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, capture, format } from './golden/capture.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden');
const WRITE = process.env.GOLDEN_WRITE === '1', FORCE = process.env.GOLDEN_FORCE === '1';
const DUMP = process.env.GOLDEN_DUMP, OUT = process.env.GOLDEN_OUT || join(DIR, 'out');
const fileOf = c => join(DIR, `${c.name}.json`);

const done = new Map();
function run(c, sink = null) {
  if (!sink && done.has(c.name)) return done.get(c.name);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(c.clock);
  try {
    const got = capture(c.scenario, c.clock, c.settings, { width: c.width, sink });
    if (!sink) done.set(c.name, got);
    return got;
  } finally { vi.useRealTimers(); }
}
const got = name => run(CASES.find(c => c.name === name));

describe('golden outputs', () => {
  for (const c of CASES) {
    (DUMP && DUMP !== c.name ? it.skip : it)(c.name, () => {
      if (DUMP) {
        const sink = (name, text) => { const f = join(OUT, c.name, name); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); };
        const g = run(c, sink);
        mkdirSync(join(OUT, c.name), { recursive: true });
        writeFileSync(join(OUT, c.name, 'capture.json'), format(g));
        return;
      }
      const have = run(c);
      if (WRITE) {
        const text = format(have), f = fileOf(c);
        if (existsSync(f) && readFileSync(f, 'utf8') !== text && !FORCE) throw new Error(`${c.name}.json exists and differs. Not rewritten. GOLDEN_FORCE=1 rewrites it.`);
        writeFileSync(f, text);
        return;
      }
      const want = JSON.parse(readFileSync(fileOf(c), 'utf8'));
      expect(Object.keys(have).sort()).toEqual(Object.keys(want).sort());
      for (const k of Object.keys(want)) expect(have[k], `${c.name}: ${k}`).toEqual(want[k]);
    });
  }

  it('is not in write mode', () => {
    expect(WRITE, 'GOLDEN_WRITE=1 writes the files and fails on purpose. Run npm test without it to check them.').toBe(false);
  });
});

// A scenario that never triggers its condition protects nothing, so each
// claim in 08 section 14.2 is checked against what was captured.
describe.skipIf(DUMP)('the scenarios exercise what they claim', () => {
  const keys = g => new Set(g.model.hours.flatMap(h => h.a.reasons.map(r => `${r.key}${r.lvl}`)));
  const HOUR = 3600e3;

  it('june-calm is a go most of the day, with light wind and models that agree', () => {
    const g = got('june-calm-1200-default');
    // The first four days, first light to sunset, ignoring light.
    const runs = Object.values(g.runs).slice(1, 4).flatMap(d => d.call);
    const span = rs => rs.reduce((t, r) => t + r.end - r.start, 0);
    expect(span(runs.filter(r => r.lvl === 0)) / span(runs)).toBeGreaterThan(0.7);
    expect(Math.max(...g.model.hours.slice(0, 96).map(h => h.wind))).toBeLessThan(11);
    expect(g.text.confidence['2026-06-15'].level).toBe('high');
    expect(g.plans['90-any'].length).toBeGreaterThanOrEqual(5);
    expect(g.plans['120-morning'].length).toBeGreaterThan(0);
    expect(g.plans['60-afternoon'].length).toBeGreaterThan(0);
    // At 9 PM the next morning needs lights until sunrise.
    expect(got('june-calm-2100-default').model.next.lightsUntil).not.toBeNull();
    expect(g.text.light).toMatch(/n/);
  });

  it('october-fog has valley, steam and model fog, a cold caution, and fog that lifts or lingers', () => {
    const g = got('october-fog-1200-default'), k = keys(g);
    expect(k.has('fog1')).toBe(true);
    expect(k.has('fog2')).toBe(true);
    expect(k.has('cold1')).toBe(true);
    expect(k.has('freeze2')).toBe(true);
    expect(k.has('twilight1')).toBe(true);
    const types = new Set(g.text.fog.map(f => `${f.type}${f.risk}`));
    for (const t of ['valley2', 'steam2', 'model2', 'valley1', 'steam1']) expect(types.has(t), t).toBe(true);
    const mornings = Object.values(g.text.morning).filter(Boolean);
    expect(mornings.some(f => f.lingers && f.lift === 'lingering into late morning')).toBe(true);
    expect(mornings.some(f => !f.lingers && /^lifting about \d/.test(f.lift))).toBe(true);
    // Calm, clear and cold: air near the dew point, water 58°F.
    const night = g.model.hours.find(h => h.a.reasons.some(r => r.text === 'Valley fog likely'));
    expect(night.temp - night.dew).toBeLessThanOrEqual(2);
    expect(night.temp).toBeLessThan(40);
    expect(g.text.flow.waterTemp).toBeCloseTo(58, 0);
  });

  it('october-fog at 9 PM opens the Fog view on a likely fog tomorrow morning', () => {
    const g = got('october-fog-2100-default');
    expect(g.model.daytime).toBe(false);
    expect(g.home.nowSection.hidden).toBe(true);
    expect(g.text.next.fog.risk).toBe(2);
    expect(g.views.fog.days.null.day).toBe(g.text.next.key);
    expect(g.views.fog.summary.text).toMatch(/Tomorrow morning: .*fog likely/i);
    expect(got('october-fog-0600-default').model.cur.a.reasons.map(r => r.key)).toContain('fog');
  });

  it('april-high-water has high rising flow, debris, an alert, smoke, gusts, a storm and split models', () => {
    const g = got('april-high-water-1200-default'), k = keys(g);
    expect(g.text.flow.now).toBeGreaterThan(21500);
    expect(g.text.flow.now).toBeLessThan(22500);
    expect(g.text.flow.change).toBeGreaterThanOrEqual(25);
    expect(g.text.debris).toBe(true);
    expect(g.text.course['195/12'].text).toMatch(/Wind against current steepens it/);
    expect(g.model.hours.some(h => h.water && h.water.against)).toBe(true);
    expect(g.model.alerts.map(a => a.event)).toContain('Flood Watch');
    expect(k.has('alert1')).toBe(true);
    expect(k.has('alert2')).toBe(true);
    expect(Math.max(...g.model.hours.map(h => h.aqi ?? 0))).toBeGreaterThanOrEqual(160);
    expect(k.has('aqi1')).toBe(true);
    expect(Math.max(...g.model.hours.map(h => h.gust))).toBeGreaterThanOrEqual(26);
    expect(k.has('gust2')).toBe(true);
    expect(g.model.hours.some(h => h.code === 95)).toBe(true);
    expect(k.has('storm2')).toBe(true);
    expect(k.has('stormrisk1')).toBe(true);
    expect(k.has('flow1')).toBe(true);
    expect(Object.values(g.text.confidence).some(c => c.level === 'low')).toBe(true);
    // The river forecast peaks above the reading.
    const peak = Math.max(...g.parsers.flowFcst.pts.map(p => p.v));
    expect(peak).toBeGreaterThan(g.text.flow.now * 1.1);
    expect(g.views.river.days.null.length).toBeGreaterThan(1000);
    // Nine hours later the river has crested: steady, no debris warning.
    const night = got('april-high-water-2100-default');
    expect(night.text.debris).toBe(false);
    expect(night.text.flow.trend).toBe('Steady over 6 hours');
  });

  it('fall-back runs seven days across a 25 hour day', () => {
    const g = got('fall-back-1200-default'), k = keys(g);
    expect(g.model.days).toHaveLength(7);
    expect(g.model.hours).toHaveLength(6 * 24 + 25);
    expect((g.model.days[2].t - g.model.days[1].t) / HOUR).toBe(25);
    expect(g.model.days[1].t).toBe(Date.UTC(2026, 10, 1, 4));
    expect(g.model.days[2].t).toBe(Date.UTC(2026, 10, 2, 5));
    expect(g.model.hours.filter(h => h.t >= g.model.days[1].t && h.t < g.model.days[2].t)).toHaveLength(25);
    for (const c of ['freeze2', 'snow1', 'ice2', 'cold1']) expect(k.has(c), c).toBe(true);
    // The gaps at the far end of the forecast were kept.
    expect(g.model.hours.some(h => h.vis === null && h.pop === null)).toBe(true);
  });

  it('every scenario feeds every parser', () => {
    for (const n of ['june-calm', 'october-fog', 'april-high-water', 'fall-back']) {
      const p = got(`${n}-1200-default`).parsers;
      expect(p.flow.length, n).toBeGreaterThan(180);
      expect(p.flowDays, n).toHaveLength(30);
      expect(p.flowFcst.pts.length, n).toBeGreaterThanOrEqual(12);
      expect(p.aq.length, n).toBeGreaterThanOrEqual(120);
      expect(p.models.hours.length, n).toBeGreaterThanOrEqual(168);
      expect(p.river.flow.v, n).toBeGreaterThan(0);
      expect(p.river.waterC.v, n).toBeGreaterThan(0);
      expect(p.obs.t, n).toBeGreaterThan(0);
    }
    expect(got('fall-back-1200-default').parsers.models.ids).toHaveLength(3);
    expect(got('october-fog-1200-default').parsers.models.ids).toHaveLength(4);
  });

  it('custom settings change the call, and the wide layout changes the charts', () => {
    const a = got('april-high-water-1200-default'), b = got('april-high-water-1200-custom');
    expect(b.model.S).toMatchObject({ heading: 20, windCaution: 8, rainCaution: '', waterOverride: 55 });
    expect(keys(a).has('pop1')).toBe(true);
    expect(keys(b).has('pop1')).toBe(false);
    expect(b.text.flow.waterTemp).toBe(55);
    expect(b.text.flow.overridden).toBe(true);
    expect(a.text.flow.overridden).toBe(false);
    expect(a.text.course['0/6'].rel).not.toBe(b.text.course['0/6'].rel);
    const narrow = got('june-calm-1200-default'), wide = got('june-calm-1200-wide');
    expect(wide.views.wind.days.null.sha256).not.toBe(narrow.views.wind.days.null.sha256);
    expect(wide.model).toEqual(narrow.model);
  });
});
