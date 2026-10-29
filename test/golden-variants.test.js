// Golden outputs for the variant cases (test/fixtures/variants.js): the same
// capture, leaner, on other clocks and on data that was cut, emptied or pushed
// to extremes. See test/golden/harness.js.
import { describe, it, expect } from 'vitest';
import { VARIANT_CASES } from './golden/capture.js';
import { DUMP, defineGolden, got } from './golden/harness.js';

defineGolden(VARIANT_CASES);


// The variant cases are only worth their files if each one reaches what it is
// for, so each claim in test/fixtures/variants.js is checked against its capture.
describe.skipIf(DUMP)('the variants exercise what they claim', () => {
  const v = n => got(`v-${n}`);
  const keys = g => new Set(g.model.hours.flatMap(h => h.a.reasons.map(r => `${r.key}${r.lvl}`)));
  const curKeys = g => new Set(g.model.cur.a.reasons.map(r => `${r.key}${r.lvl}`));
  const txt = (g, id) => g.home[id].textContent;
  const HOUR = 3600e3;
  const dev = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

  it('other clocks reach the hero and Now branches', () => {
    expect(v('june-calm-0800').model.daytime).toBe(true);
    expect(txt(v('june-calm-d3-0900'), 'holds')).toMatch(/^Holds until about .*, then the wind builds\.$/);
    expect(txt(v('fall-back-d0-1000'), 'holds')).toMatch(/^Holds until about .*, then gusts build\.$/);
    expect(txt(v('june-calm-d6-1200'), 'holds')).toMatch(/^Holds until sunset/);
    expect(v('june-calm-d6-1200').text.next).toBeNull();
    expect(v('june-calm-d6-2200').model.next).toBeNull();
    expect(txt(v('june-calm-d6-2200'), 'why')).toBe('No forecast for the next morning yet.');
    expect(v('june-calm-0030').model.cur.t).toBe(v('june-calm-0030').model.now);
    expect(v('june-before-forecast').model.now).toBeLessThan(v('june-before-forecast').model.hours[0].t);
    const fog = v('october-fog-0800');
    expect(fog.model.daytime).toBe(true);
    expect(curKeys(fog).has('fog1')).toBe(true);
    expect(v('october-fog-d2-1030').text.morning['2026-10-16'].lingers).toBe(true);
    const lifted = v('october-fog-0930');
    expect(lifted.text.morning['2026-10-14'].until).toBeLessThanOrEqual(lifted.model.now);
    expect(lifted.model.days[0].periods[0].fog).toBeNull();
  });

  it('what is falling now is named by the weather code', () => {
    const code = (n, c) => expect(v(n).model.cur.code, n).toBe(c);
    code('october-fog-d2-1300', 51); code('october-fog-d3-1300', 63); code('april-d1-1600', 95); code('fall-back-d1-1000', 63);
    code('fall-back-d3-0700', 71); code('fall-back-freezing-now', 66); code('fall-back-heavy-now', 65);
    expect(v('fall-back-heavy-now').model.cur.precip).toBe(0.35);
    expect(v('fall-back-d3-0700').model.daytime).toBe(true);
    expect(curKeys(v('april-d0-1400')).has('gust2')).toBe(true);
  });

  it('the clocks changing: a 25 hour day after the change back, a 23 hour day after the change forward', () => {
    expect(v('fall-back-d1-1000').model.now).toBe(Date.UTC(2026, 10, 1, 15));
    const d = v('spring-d1-1200').model.days;
    expect((d[2].t - d[1].t) / HOUR).toBe(23);
    expect(v('spring-d1-1200').model.hours).toHaveLength(6 * 24 + 23);
    expect(v('spring-d2-0900').model.alerts.map(a => a.event)).toContain('Winter Weather Advisory');
    expect([73, 75, 71]).toContain(v('spring-d2-0900').model.cur.code);
  });

  it('a river between 10,000 and 20,000 cfs steepens the chop of a wind from downstream', () => {
    const g = v('spring-d1-1200');
    expect(g.text.flow.now).toBeGreaterThan(10000);
    expect(g.text.flow.now).toBeLessThan(20000);
    expect(g.text.course['195/12'].text).toMatch(/Wind against current steepens it/);
    expect(g.model.hours.some(h => h.water && h.water.against)).toBe(true);
    expect(keys(g).has('flow1')).toBe(false);
    expect(v('spring-d1-1200-tight').model.S.heading).toBe(200);
    expect(keys(v('spring-d1-1200-tight')).has('flow1')).toBe(true);
  });

  it('sources that are missing leave the model without them, and the page says so', () => {
    const lost = v('april-lost-river');
    expect(lost.parsers.river).toEqual({});
    expect(lost.text.flow.now).toBeNull();
    expect(lost.text.flow.waterTemp).toBeNull();
    expect(v('april-lost-river-override').text.flow.waterTemp).toBe(55);
    expect(v('april-lost-river-override').text.flow.now).toBeNull();
    expect(v('april-lost-flow-series').parsers.flow).toEqual([]);
    expect(v('april-lost-flow-series').parsers.flowFcst.pts).toEqual([]);
    expect(v('april-lost-flow-fcst').parsers.flowFcst.pts).toEqual([]);
    expect(v('april-lost-flow-fcst').parsers.flow.length).toBeGreaterThan(100);
    expect(v('april-lost-flow-days').parsers.flowDays).toEqual([]);
    expect(v('april-lost-river-and-flow').parsers.flowDays).toHaveLength(30);
    expect(v('april-lost-river-and-flow').parsers.flow).toEqual([]);
    const only = v('october-lost-optional');
    for (const k of ['alerts', 'obs', 'river', 'flow', 'flowDays', 'flowFcst', 'aq', 'models']) expect(k in only.parsers, k).toBe(false);
    expect(only.model.hours.every(h => h.aqi === null && h.ens === null)).toBe(true);
    const none = v('october-empty-optional');
    expect(none.parsers.river).toEqual({});
    expect(none.parsers.models.ids).toEqual([]);
    expect(none.parsers.obs.t).toBeNull();
    expect(none.model.alerts).toEqual([]);
  });

  it('a thin forecast has holes and no cloud cover, UV or current conditions', () => {
    const g = v('fall-back-thin');
    expect(g.model.hours.some(h => h.wind === null && h.water === null)).toBe(true);
    expect(g.model.hours.some(h => h.wind === null && h.dir !== null)).toBe(true);
    expect(g.model.hours.some(h => h.wind !== null && h.dir === null)).toBe(true);
    expect(g.model.hours.every(h => h.cloud === null && h.uv === null)).toBe(true);
    expect(g.model.hours.some(h => h.temp === null)).toBe(true);
    expect(g.model.hours.some(h => h.pop === null)).toBe(true);
    expect(g.model.hours.some(h => h.code === null)).toBe(true);
    expect(g.model.days.every(d => d.uvMax === null)).toBe(true);
  });

  it('extremes: the river over 28,000 cfs, smoke over 200, and lines left blank', () => {
    const g = v('april-severe'), k = keys(g);
    expect(g.text.flow.now).toBeGreaterThanOrEqual(28000);
    expect(k.has('flow2')).toBe(true);
    expect(k.has('aqi2')).toBe(true);
    const blank = v('april-severe-blank'), kb = keys(blank);
    expect(kb.has('flow2')).toBe(true);
    expect(kb.has('aqi2') || kb.has('aqi1')).toBe(false);
    expect(kb.has('pop1') || kb.has('pop2')).toBe(false);
    expect(v('june-blank').model.S).toMatchObject({ rainCaution: '', rainOff: '', aqiCaution: '', aqiOff: '' });
    expect(v('october-tight').model.S).toMatchObject({ heading: 200, windCaution: 6, coldCombined: 120 });
  });

  it('the wind now: calm, missing, and swinging through the afternoon', () => {
    expect(v('june-calm-now').model.cur.wind).toBeLessThan(1);
    expect(v('june-no-wind-now').model.cur.wind).toBeNull();
    const g = v('june-wind-shift'), p = g.model.days[0].periods.find(x => x.key === 'afternoon');
    expect(Math.max(...p.hs.map(t => dev(g.model.hours.find(h => h.t === t).dir, p.dir)))).toBeGreaterThan(60);
  });

  it('the river falling, a zero, and a flat line', () => {
    expect(v('june-falling-river').text.flow.trend).toMatch(/^Falling, down \d+% in 6 hours$/);
    expect(v('june-zero-flow').text.flow.change).toBeNull();
    expect(new Set(v('june-flat-flow').parsers.flow.map(p => p.v)).size).toBe(1);
  });

  it('alerts, Keene reports and reading ages of every kind', () => {
    const al = v('june-alerts').model.alerts;
    expect(al.map(a => a.event)).toEqual(['Special Weather Statement', 'Tornado Warning', 'Small Craft Advisory', 'Dense Fog Advisory', 'Alert', 'Frost Advisory']);
    // The Small Craft Advisory is Stay off from P1.8 (marine-alerts); the Special Weather Statement and the Frost Advisory stay Caution.
    expect(al.map(a => a.lvl)).toEqual([1, 2, 2, 2, 1, 1]);
    expect(al[5].start).toBe(v('june-alerts').model.now);
    expect(al[0].end).toBe(8.64e15);
    expect(al[0].desc).toBe('');
    expect(v('june-obs-gaps').parsers.obs).toMatchObject({ wind: null, tempF: null, dir: null, text: '' });
    expect(v('june-obs-gaps').parsers.obs.gust).toBeGreaterThan(11);
    expect(v('june-obs-light').parsers.obs.wind).toBeLessThan(1);
    const g = v('june-stale-readings');
    expect(g.model.now - g.parsers.river.flow.t).toBeLessThan(60e3);
    expect(g.model.now - g.parsers.river.waterC.t).toBe(5 * HOUR);
    expect(g.model.now - g.parsers.obs.t).toBe(60 * HOUR);
  });

  it('the edges: on the hour, at exactly 90 minutes, at the cold line, at 1 mph, at a compass point edge', () => {
    const g = v('june-hour-edges'), i = g.model.hours.findIndex(h => h.t <= g.model.now && g.model.now < h.t + HOUR);
    expect(g.model.hours[i].wind).toBe(12);
    expect(g.model.cur.wind).toBe(4);
    expect(g.model.hours[i - 1].pop).toBe(85);
    expect(v('june-current-90min').model.cur.temp).not.toBe(99.9);
    expect(new Set(v('june-steady-wind').model.hours.map(h => h.wind))).toEqual(new Set([6]));
    const late = v('june-wind-shift-late');
    expect(late.model.days[0].periods.find(p => p.key === 'afternoon').hs).toHaveLength(2);
    expect(v('june-obs-one').parsers.obs.wind).toBe(1);
    const cold = v('june-cold-line');
    expect(Math.round(cold.model.cur.temp + cold.text.flow.waterTemp)).toBe(cold.model.S.coldCombined);
    expect(v('june-heading-11').model.S.heading).toBe(11);
    const f = v('october-fog-afternoon');
    expect(f.model.cur.vis).toBe(800);
    expect(f.text.next.key).toBe('2026-10-15');
    expect(f.text.next.fog.risk).toBe(2);
    expect(v('october-fog-1100').text.next.key).toBe('2026-10-15');
    expect(v('october-fog-0900').model.days[0].periods[0].fog).toBeNull();
    expect(v('fall-back-rain-no-amount').model.cur.code).toBe(63);
    expect(v('fall-back-rain-no-amount').model.cur.precip).toBeNull();
  });

  it('a page width at the edges of the chart layout, and the rain lines at the ends of the scale', () => {
    const sha = n => v(n).views.wind.days.null.sha256;
    expect(new Set(['june-width-300', 'june-width-333', 'june-width-452', 'june-width-500', 'june-width-518', 'june-width-735', 'june-width-736'].map(sha)).size).toBe(7);
    const bogus = v('june-unknown-day').views;
    // Every view falls back to the day it would open on. The Fog view opens on tomorrow morning instead, so it differs.
    for (const k of Object.keys(bogus).filter(x => x !== 'fog')) expect(bogus[k].days['2020-01-01'].day, k).toBe(bogus[k].days.null.day);
    expect(bogus.fog.days['2020-01-01'].day).toBe('2026-06-15');
    expect(v('june-rain-lines-low').model.S).toMatchObject({ rainCaution: 1, rainOff: 100 });
    expect(v('june-rain-lines-high').model.S).toMatchObject({ rainCaution: 0, rainOff: 101 });
    expect(new Set(v('june-pop-thirty').model.hours.map(h => h.pop))).toEqual(new Set([30]));
    expect(v('june-rise-twenty').text.flow.change).toBe(20);
    expect(v('june-rise-twenty').text.debris).toBe(true);
    const go = Object.values(v('june-one-go-hour').runs).flatMap(d => d.call).filter(r => r.lvl === 0);
    expect(go).toHaveLength(1);
    expect(go[0].end - go[0].start).toBe(HOUR);
  });

  it('two models, one model, and a 20% chance every hour', () => {
    expect(v('june-two-models').parsers.models.ids).toHaveLength(2);
    expect(v('june-two-models').model.hours[0].ens.wind).toHaveLength(2);
    expect(v('june-one-model').parsers.models.ids).toHaveLength(1);
    expect(v('june-one-model').model.hours[0].ens.wind).toHaveLength(1);
    expect(new Set(v('june-pop-twenty').model.hours.map(h => h.pop))).toEqual(new Set([20]));
  });

  it('air quality with holes, and rows left open', () => {
    const g = v('june-aq-gaps');
    expect(g.model.cur.aqi).toBeNull();
    expect(g.model.hours.filter(h => h.t > g.model.now).some(h => h.aqi != null)).toBe(true);
    expect(v('june-aqi-no-pm').model.cur.pm25).toBeNull();
    expect(v('june-aqi-no-pm').model.cur.aqi).not.toBeNull();
    expect(v('june-open-rows').home.days.innerHTML.length).toBeGreaterThan(got('june-calm-1200-default').home.days.innerHTML.length + 8000);
  });

  it('a forecast without sun times, and without a model', () => {
    const g = v('june-short-daily-d6');
    expect(g.model.days).toHaveLength(6);
    expect(g.model.hours).toHaveLength(168);
    expect(g.model.daytime).toBe(false);
    expect(v('june-no-daily').model.days).toHaveLength(0);
    const none = v('june-stale-forecast');
    expect(none.model).toBeNull();
    expect(txt(none, 'verdict')).toBe('No data.');
  });
});
