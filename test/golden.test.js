// Golden outputs for the 19 cases of 08 section 14.2 and for the probes: for
// fixed inputs and clocks, everything the app computes and draws must equal the
// files in test/golden/. See test/golden/capture.js, probes.js and harness.js.
//
// The golden tests are in two files so they run side by side: this one (the 19
// cases and the probes) and golden-variants.test.js (the variant cases).
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { CASES } from './golden/capture.js';
import { PROBES } from './golden/probes.js';
import { DUMP, ALL, defineGolden, got } from './golden/harness.js';

defineGolden([...CASES, ...PROBES]);

// The files are guarded against edits and deletion, and nothing else checks
// that each one is still compared (FC5). A case that left the lists in one line
// of test code would pass every check, so the names of the cases and probes are
// the names of the files, both ways.
describe.skipIf(DUMP)('the golden files and the cases', () => {
  const names = ALL.map(c => c.name);
  const files = readdirSync(new URL('./golden/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -'.json'.length));

  it('give each case and probe its own name, so no two share a file', () => {
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });
  it('have a file for every case and probe', () => {
    expect(names.filter(n => !files.includes(n)), 'cases or probes with no file in test/golden/').toEqual([]);
  });
  it('have a case or probe for every file', () => {
    expect(files.filter(f => !names.includes(f)), 'files in test/golden/ that no case or probe compares').toEqual([]);
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
    // At 6 AM it is still dark. Ninety minutes later it is daylight with fog on the river.
    const dawn = got('october-fog-0600-default');
    expect(dawn.model.daytime).toBe(false);
    expect(dawn.model.cur.a.reasons.map(r => r.key)).toContain('fog');
    expect(dawn.later.daytime).toBe(true);
    expect(dawn.later.home.nowSection.hidden).toBe(false);
    expect(dawn.later.cur.a.reasons.some(r => r.key === 'fog' && /fog likely$/.test(r.text))).toBe(true);
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

describe.skipIf(DUMP)('the probes cross the lines they exist for', () => {
  const first = (rows, i = 0) => rows[i][0];
  it('assess finds the lines of the default settings and of the rules', () => {
    const p = got('p-assess-default');
    expect(p.wind.map(r => r[0])).toEqual([0, 9.5, 14.5]);
    expect(p.gust.map(r => r[0])).toEqual([0, 17.5, 24.5]);
    expect(p.pop.map(r => r[0])).toEqual([0, 59.5, 89.5]);
    expect(p.flow.map(r => r[0])).toEqual([0, 20000, 28000]);
    expect(p.aqi.map(r => r[0])).toEqual([0, 150.5, 200.5, 300.5]);
    expect(p.capeWithRain.map(r => r[0])).toEqual([0, 1000]);
    expect(p.capeAt29).toHaveLength(1);
    expect(p.precip.map(r => r[0])).toEqual([0, 0.15]);
    expect(p.vis.map(r => r[0])).toEqual([0, 402.5, 1609.5]);
    expect(first(p.temp, 2)).toBe(31.5);
    expect(p.temp.map(r => r[0])).toContain(32);
    expect(p.valleySpread.map(r => r[0])).toEqual([0, 2.01, 4.01]);
    expect(p.valleyWind.map(r => r[0])).toEqual([0, 4.05, 6.05, 9.5]);
    expect(p.valleyCloud.map(r => r[0])).toEqual([0, 50.1, 80.1]);
    expect(p.valleyHours.filter(([, s]) => /valley/.test(s)).map(r => r[0])).toEqual(range(0, 10));
    expect(p.steamDiff.map(r => r[0])).toEqual([40, 50, 58, 59.5]);
    expect(p.waterTemp.map(r => r[0])).toEqual([32, 59.5]);
  });

  it('the settings move the lines', () => {
    expect(got('p-assess-custom').wind.map(r => r[0])).toEqual([0, 7.5, 14.5]);
    expect(got('p-assess-custom').pop.map(r => r[0])).toEqual([0, 89.5]);
    expect(got('p-assess-blank').pop).toHaveLength(1);
    expect(got('p-assess-blank').aqi).toHaveLength(1);
    expect(got('p-assess-tight').flow.map(r => r[0])).toEqual([0, 8000, 12000]);
    expect(got('p-assess-tight').waterTemp.map(r => r[0])).toEqual([32, 79.5]);
  });

  it('the water probe separates 9,999 from 10,000 cfs and 19,999 from 20,000 for a wind from downstream', () => {
    const l = got('p-water').levels, at = (f, d = 195) => JSON.stringify(l[`heading15/flow${f}/dir${d}`]);
    expect(at(9999)).not.toBe(at(10000));
    expect(at(10000)).toBe(at(15000));
    expect(at(19999)).not.toBe(at(20000));
    expect(at(0)).toBe(at(9999));
    expect(at(20000)).toBe(at(25000));
    expect(at(9999, 15)).toBe(at(25000, 15));
    expect(at(9999, 105)).toBe(at(25000, 105));
    expect(l['heading15/flow15000/dir195'].flat().join()).toMatch(/S/);
    expect(l['heading15/flow5000/dir195'].flat().join()).not.toMatch(/S/);
    expect(got('p-water').debris.map(r => r[0])).toEqual([-30, 20]);
  });

  it('the pure helpers cross their lines', () => {
    const p = got('p-pure');
    expect(p.confidenceWind.map(r => r[0])).toEqual([0, 4.01, 8.01]);
    expect(p.trend.map(r => r[0])).toEqual([-60, -10, 10]);
    expect(p.rates.map(r => r[0])).toEqual([0, 0.1, 0.3]);
    expect(p.precipSummary.empty).toBeNull();
    expect(p.alertLevels['Tornado Warning']).toBe(2);
    expect(p.alertLevels['Frost Advisory']).toBe(1);
  });

  it('daylight turns over at first light, sunrise and sunset to the millisecond', () => {
    const p = got('p-sun-edges');
    for (const day of ['june', 'october']) {
      expect(p[`${day}/dawn-1`][0], day).toBe(false);
      expect(p[`${day}/dawn`][0], day).toBe(true);
      expect(p[`${day}/sunset-1`][0], day).toBe(true);
      expect(p[`${day}/sunset`][0], day).toBe(false);
      expect(p[`${day}/dawn-1`][1]).toBe('dark');
      expect(p[`${day}/dawn`][1]).toBe('twilight');
      expect(p[`${day}/sunrise`][1]).toBe('day');
      expect(p[`${day}/sunset+1`][1]).toBe('twilight');
      expect(p[`${day}/dusk+1`][1]).toBe('dark');
    }
  });

  it('the water sentence changes at 0.8 and 1.25 of the hour\'s chop wind, and the vis lines are found to the millimeter', () => {
    const w = got('p-water').why.map(r => r[5]).join(' ');
    expect(w).toMatch(/Building\./);
    expect(w).toMatch(/Settling after earlier wind\./);
    expect(got('p-assess-default').visEdges.map(r => r[0])).toEqual([402.33, 402.335, 1609.34]);
  });

  it('the tables and routes are recorded whole', () => {
    const p = got('p-config');
    expect(p.config.THEN.stormrisk).toBe('a storm risk');
    expect(p.config.PERIODS).toHaveLength(3);
    expect(p.config.WATER.names).toHaveLength(4);
    expect(Object.values(p.config).includes('(missing)')).toBe(false);
    expect(p.views.map(v => v[0])).toEqual(['week', 'wind', 'river', 'storms', 'fog', 'temperature', 'rain', 'light', 'air']);
    expect(p.routes['#wind/2026-10-14']).toEqual({ name: 'wind', day: '2026-10-14' });
    expect(p.routes['#nope']).toBeNull();
    expect(p.routes['#wind/bad']).toEqual({ name: 'wind', day: null });
  });

  it('there is no model for a forecast that cannot be used', () => {
    const p = got('p-null-model');
    for (const k of ['noData', 'noWx', 'noHourly', 'noDaily', 'emptyHours', 'afterTheEnd']) expect(p[k], k).toBeNull();
    expect(p.usable.h72).toBe(72);
  });
});
function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }
