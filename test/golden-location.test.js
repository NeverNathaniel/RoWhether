// The golden cases and the location: where the course heading comes from (review
// Z2) and which zone the logic reads the clock in (review Z10). Both are the same
// at Putney in every case, so only a case built to tell them apart can show a line
// that reads the wrong one.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { setZone } from '../src/format.js';
import { PUTNEY } from '../src/putney.js';
import { ALL_CASES, CASES, BASE, CUSTOM, BLANK, TIGHT, EDGE, COLD144, RAIN1, RAIN2, buildModel, capture } from './golden/capture.js';
import { digestOf, isDigest } from './golden/digest.js';

describe('the course heading reaches the model through the location', () => {
  it('is in no settings object the cases pass', () => {
    for (const c of ALL_CASES) expect(c.settings, c.name).not.toHaveProperty('heading');
    for (const S of [BASE, CUSTOM, BLANK, TIGHT, EDGE, COLD144, RAIN1, RAIN2]) expect(S).not.toHaveProperty('heading');
  });

  it('is refused if a case puts one there', () => {
    expect(() => buildModel(PUTNEY, {}, { ...BASE, heading: 15 }, 0)).toThrow(/heading/);
  });

  it('is turned round only by the cases that say so, with a location', () => {
    const heading = name => ALL_CASES.find(c => c.name === name).loc.course.heading;
    expect(heading('june-calm-1200-default')).toBe(15);
    expect(heading('june-calm-1200-custom')).toBe(20);
    expect(heading('v-october-tight')).toBe(200);
    expect(heading('v-june-heading-11')).toBe(11);
    // And the files still record it, as the model's settings.
    expect(JSON.parse(readFileSync(new URL('./golden/june-calm-1200-custom.json', import.meta.url), 'utf8')).model.S.heading).toBe(20);
  });
});

// What the logic captured, without the strings that have no model to take a zone
// from: fogLift() and the rain note are written with the screen's formatters.
const omit = (o, k) => { const { [k]: _, ...rest } = o; return rest; };
const logicText = t => ({
  ...omit(omit(omit(t, 'precip'), 'morning'), 'next'),
  precip: { next12: t.precip.next12 },
  morning: Object.fromEntries(Object.entries(t.morning).map(([d, f]) => [d, f && omit(f, 'lift')])),
  next: t.next && { ...t.next, fog: t.next.fog && omit(t.next.fog, 'lift') }
});

describe('the logic follows the location zone, not the zone the screen shows', () => {
  const file = name => JSON.parse(readFileSync(new URL(`./golden/${name}.json`, import.meta.url), 'utf8'));
  // The case captured with the screen's zone set to Auckland. Putney is on New York time.
  function inAuckland(name) {
    const c = ALL_CASES.find(x => x.name === name);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(c.clock);
    setZone('Pacific/Auckland');
    try {
      return capture(c.scenario, c.clock, c.settings, { ...c.options, loc: c.loc, width: c.width, logicOnly: true });
    } finally {
      setZone('America/New_York');
      vi.useRealTimers();
    }
  }
  // A main case is stored in full; a variant keeps a long key as a digest.
  const same = (name, key, have, want) => {
    if (!CASES.some(c => c.name === name) && isDigest(want)) expect(digestOf(have), `${name}: ${key}`).toEqual(want);
    else expect(have, `${name}: ${key}`).toEqual(want);
  };

  for (const name of ['june-calm-1200-default', 'october-fog-0600-default', 'october-fog-1200-custom', 'v-october-fog-0900', 'v-fall-back-d1-1000']) {
    it(`gives ${name} the same model, plans, runs and words`, () => {
      const have = inAuckland(name), want = file(name);
      for (const key of ['model', 'plans', 'runs']) same(name, key, have[key], want[key]);
      // The variants keep their words as a digest, which cannot be cut down to the logic's.
      if (CASES.some(c => c.name === name)) same(name, 'text', logicText(have.text), logicText(want.text));
    });
  }
});
