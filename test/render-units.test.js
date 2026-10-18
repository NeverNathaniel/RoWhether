// The render code writes its units through m.u (08 14.2 P0.12). The golden files
// cannot tell a string written through m.u from one that still has its unit typed
// in, since both are US text. Here every formatter of the model marks what it is
// given, the whole app is drawn from the golden scenarios, and any US unit still
// typed in the output is a line that did not go through m.u.
//
// Numbers with no unit word are not in this net: a gust after a wind, the degree
// sign of a table cell or an axis, the scale of a chart and the limit drawn on
// it. They are values, not unit text, and their conversion is phase 2's (07 7.3).
import { describe, it, expect, vi } from 'vitest';
import { CASES, capture } from './golden/capture.js';
import { resolveLocation } from '../src/location.js';
import { PUTNEY_RECORD, PUTNEY_WATERWAY } from '../src/putney.js';

// Every formatter and word of unitFormat, with a mark in place of the US text.
vi.mock('../src/units.js', async importOriginal => {
  const real = await importOriginal();
  const MARK = {
    speed: v => `S(${v})`, speedRange: (a, b) => `SR(${a},${b})`, temp: v => `T(${v})`, tempRange: (a, b) => `TR(${a},${b})`,
    tempSum: v => `TS(${v})`, tempDiff: v => `TD(${v})`, precip: v => `P(${v})`, rate: v => `R(${v})`,
    vis: v => `V(${v})`, dist: v => `D(${v})`, flow: (v, unit) => `F(${v} ${String(unit).toUpperCase()})`, stage: v => `G(${v})`, aqi: v => `Q(${v})`,
    flowUnit: unit => `FU(${String(unit).toUpperCase()})`,
    speedUnit: 'SU', tempUnit: 'TU', rateUnit: 'RU', visUnit: 'VU', visOff: 'VO', visCaution: 'VC'
  };
  return { ...real, unitFormat: (...a) => ({ ...real.unitFormat(...a), ...MARK }) };
});

// What the views wrote before this step, as text a place's data can not make:
// a unit after a number, or a unit word of a title.
const US_UNIT = /\d\s?mph|\bmph\b|°F|\d\s?cfs|\bcfs\b|\d(\.\d+)? in\b|\binches\b|\bmiles?\b|\d\s?mi\b|\bmi\b/;
// Putney's own text has units in it that belong to the place, not to the render code:
// the notes of its gauges and station, and its words for the river. And the NWS writes
// alerts and station readings with its own units. A place with none of that makes the rest show.
const noNote = ({ note, ...row }) => row;
const PLAIN = resolveLocation({
  ...PUTNEY_RECORD, slug: 'plain-pool', copy: {}, sources: PUTNEY_RECORD.sources.map(noNote)
}, { waterway: { ...PUTNEY_WATERWAY, sources: PUTNEY_WATERWAY.sources.map(noNote) } });

// One string per piece of output the capture draws: the home screen, every view, every full forecast, the share text.
function drawn(c, over = {}) {
  const strings = new Map();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(c.clock);
  try {
    const out = capture(c.scenario, c.clock, c.settings, {
      loc: PLAIN, width: c.width, lean: true, sink: (name, text) => strings.set(name, text),
      raw: raw => {
        for (const f of raw.alerts.features) for (const k of ['headline', 'description', 'instruction']) f.properties[k] = f.properties[k]?.replace(/ ?mph/g, '');
      },
      ...over
    });
    return { out, strings };
  } finally { vi.useRealTimers(); }
}

// The nine scenario clocks at the default settings, and the wide layout.
const CASE_NAMES = CASES.filter(c => /-default$|-wide$/.test(c.name));

describe('the render code writes its units through m.u', () => {
  const all = new Map();
  const seen = new Set();

  for (const c of CASE_NAMES) {
    it(`${c.name}: no US unit is typed into what is drawn`, () => {
      const { out, strings } = drawn(c);
      const text = [...strings.values(), JSON.stringify(out.home), JSON.stringify(out.model.hours.map(h => h.a.reasons)), JSON.stringify(out.share)];
      for (const s of text) {
        const hit = US_UNIT.exec(s);
        expect(hit && s.slice(Math.max(0, hit.index - 60), hit.index + 40), `${c.name}: a unit typed in`).toBeNull();
        for (const k of s.matchAll(/\b(SR|TR|TS|TD|FU|S|T|P|R|V|D|F|G|Q)\(|\b(SU|TU|RU|VU|VO|VC)\b/g)) seen.add(k[1] ?? k[2]);
      }
      all.set(c.name, strings);
    });
  }

  it('uses every formatter and word the views have', () => {
    // A name that is no longer used anywhere on the page has no use in unitFormat either; a name
    // that is used must reach the page marked. G (a stage) has no view yet.
    for (const mark of ['S', 'SR', 'T', 'TR', 'TS', 'TD', 'P', 'R', 'V', 'D', 'F', 'Q', 'FU', 'SU', 'TU', 'RU', 'VU', 'VO', 'VC']) {
      expect(seen.has(mark), `${mark} reached no view`).toBe(true);
    }
  });
});
