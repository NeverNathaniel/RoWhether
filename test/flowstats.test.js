// scripts/locations/flowstats.mjs (phase 1 plan P1.19, 02 "Default flow thresholds
// from history"): the window, the daily means read out of a USGS answer, the
// percentiles, and what they lead to. The fixture is Putney's gauge, the answer of
// the request in its `request` field, kept as one value for each day from `from`
// (null for a day with no value) so it stays small.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PUTNEY_WATERWAY } from '../src/putney.js';
import { flowWindow, dailyUrl, dailyValues, percentile, flowStats, shareAtOrAbove, flowSentence, flowReport, fetchDaily, siteId } from '../scripts/locations/flowstats.mjs';

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/usgs-01154500-daily.json', import.meta.url), 'utf8'));
const dayAt = i => new Date(Date.parse(`${FIXTURE.from}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10);
// The answer the API gave: a feature for each day with a value, with the value as text,
// in the order of the features' ids, not of the dates (reversed here).
const answerOf = (values = FIXTURE.values) => ({
  type: 'FeatureCollection',
  features: values.map((v, i) => v === null ? null : { type: 'Feature', properties: { time: dayAt(i), value: String(v) }, id: `id-${i}`, geometry: null }).filter(Boolean).reverse(),
  numberReturned: values.filter(v => v !== null).length,
  links: [{ rel: 'self', href: FIXTURE.request }]
});
const ROWS = dailyValues(answerOf());

describe('the Putney fixture', () => {
  it('holds every day from 2016-01-01 to 2026-10-15, two with no value', () => {
    expect(FIXTURE.id).toBe('USGS-01154500');
    expect(FIXTURE.from).toBe('2016-01-01');
    expect(FIXTURE.values.length).toBe(3941);
    expect(FIXTURE.values.filter(v => v === null).length).toBe(2);
    expect(dayAt(FIXTURE.values.length - 1)).toBe('2026-10-15');
  });
});

describe('flowStats', () => {
  it('gives the figures 01 6.1 prints for Putney, to the nearest cfs', () => {
    expect(flowStats(ROWS)).toEqual({ from: '2016-01-01', to: '2026-10-15', days: 3939, p50: 6910, p65: 10100, p88: 20300, p90: 21820, p95: 28010 });
  });

  it("is the stats row Putney's waterway file holds", () => {
    expect(flowStats(ROWS)).toEqual(PUTNEY_WATERWAY.sources.find(r => r.role === 'flow').stats);
  });

  it('keeps the order of the keys the data files use', () => {
    expect(Object.keys(flowStats(ROWS))).toEqual(['from', 'to', 'days', 'p50', 'p65', 'p88', 'p90', 'p95']);
  });

  it('does not depend on the order the rows come in', () => {
    expect(flowStats([...ROWS].reverse())).toEqual(flowStats(ROWS));
    expect(flowStats([...ROWS].sort((a, b) => a.v - b.v))).toEqual(flowStats(ROWS));
  });

  it('takes the first and last day from the dates, not from the order of the answer', () => {
    const s = flowStats(dailyValues(answerOf([null, 5, 6, 7, null])));
    expect(s).toMatchObject({ from: '2016-01-02', to: '2016-01-04', days: 3 });
  });
});

describe('percentile', () => {
  it('interpolates linearly between the closest ranks, which is the method behind 6,910, 21,820 and 28,010', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 0.9)).toBeCloseTo(46, 9);
    expect(percentile([10, 20, 30, 40, 50], 0.25)).toBe(20);
    expect(percentile([10, 20, 30, 40, 50], 0.1)).toBeCloseTo(14, 9);
  });

  it('takes the ends at 0 and 1, and the one value of a list of one', () => {
    expect(percentile([3, 9, 20], 0)).toBe(3);
    expect(percentile([3, 9, 20], 1)).toBe(20);
    expect(percentile([7], 0.88)).toBe(7);
  });

  it('is not a number for no values', () => {
    expect(percentile([], 0.5)).toBeNaN();
  });
});

describe('dailyValues', () => {
  const feature = (time, value) => ({ type: 'Feature', properties: { time, value } });

  it('reads the day and the value, which the API sends as text, oldest day first', () => {
    expect(dailyValues({ features: [feature('2020-03-02', '120'), feature('2020-03-01', '95.5')] })).toEqual([{ day: '2020-03-01', v: 95.5 }, { day: '2020-03-02', v: 120 }]);
  });

  it('leaves out a day with no value, one that is not a number and a negative one, and keeps a zero', () => {
    const rows = dailyValues({ features: [feature('2020-03-01', null), feature('2020-03-02', ''), feature('2020-03-03', 'Ice'), feature('2020-03-04', '-999999'), feature('2020-03-05', '0'), feature('2020-03-06', '12')] });
    expect(rows).toEqual([{ day: '2020-03-05', v: 0 }, { day: '2020-03-06', v: 12 }]);
  });

  it('counts a day once, however many series answer for it', () => {
    expect(dailyValues({ features: [feature('2020-03-01', '10'), feature('2020-03-01', '11'), feature('2020-03-02', '12')] })).toHaveLength(2);
  });

  it('reads an answer with no features as no days', () => {
    expect(dailyValues({})).toEqual([]);
    expect(dailyValues(null)).toEqual([]);
  });
});

describe('flowWindow', () => {
  it('runs from January 1 ten years back to yesterday', () => {
    expect(flowWindow(Date.UTC(2026, 9, 26, 12))).toEqual({ from: '2016-01-01', to: '2026-10-25' });
    expect(flowWindow(Date.UTC(2026, 9, 16, 12))).toEqual({ from: '2016-01-01', to: '2026-10-15' });
  });

  it('moves its start on January 1', () => {
    expect(flowWindow(Date.UTC(2027, 0, 1, 0, 30))).toEqual({ from: '2017-01-01', to: '2026-12-31' });
  });

  it("reads the day in UTC, whatever the machine's zone (the tests run in Auckland)", () => {
    // 11:30 on 31 December in UTC is already 1 January in Auckland.
    expect(flowWindow(Date.UTC(2026, 11, 31, 11, 30))).toEqual({ from: '2016-01-01', to: '2026-12-30' });
  });
});

describe('dailyUrl', () => {
  it("is the request the fixture was recorded with, one request for the whole window", () => {
    expect(dailyUrl('USGS-01154500', { from: '2016-01-01', to: '2026-10-15' })).toBe(FIXTURE.request);
  });
});

describe('fetchDaily', () => {
  const window = { from: '2016-01-01', to: '2026-10-15' };
  const now = Date.UTC(2026, 9, 16, 12);

  it('asks once for the window and reads the answer', async () => {
    const getJSON = vi.fn(async () => answerOf());
    const rows = await fetchDaily('USGS-01154500', { now, getJSON });
    expect(getJSON).toHaveBeenCalledTimes(1);
    expect(getJSON).toHaveBeenCalledWith(dailyUrl('USGS-01154500', window));
    expect(flowStats(rows)).toMatchObject({ days: 3939, p95: 28010 });
  });

  it('follows the next link, at most 5 pages', async () => {
    const getJSON = vi.fn(async url => {
      const n = Number(new URL(url).searchParams.get('page') ?? 1);
      return { features: [{ properties: { time: `2020-01-0${n}`, value: String(n * 100) } }], links: [{ rel: 'next', href: `https://api.example/daily?page=${n + 1}` }] };
    });
    const rows = await fetchDaily('USGS-01154500', { now, getJSON });
    expect(getJSON).toHaveBeenCalledTimes(5);
    expect(getJSON.mock.calls[1][0]).toBe('https://api.example/daily?page=2');
    expect(rows.map(r => r.v)).toEqual([100, 200, 300, 400, 500]);
  });

  it('stops at the last page, the one with no next link', async () => {
    const pages = [
      { features: [{ properties: { time: '2020-01-01', value: '1' } }], links: [{ rel: 'self', href: 'a' }, { rel: 'next', href: 'https://api.example/p2' }] },
      { features: [{ properties: { time: '2020-01-02', value: '2' } }], links: [{ rel: 'self', href: 'b' }] }
    ];
    const getJSON = vi.fn(async () => pages.shift());
    expect((await fetchDaily('USGS-01154500', { now, getJSON })).map(r => r.v)).toEqual([1, 2]);
    expect(getJSON).toHaveBeenCalledTimes(2);
  });

  it('lets a failed request through, so the script says what failed', async () => {
    await expect(fetchDaily('USGS-01154500', { now, getJSON: async () => { throw new Error('HTTP 503'); } })).rejects.toThrow('HTTP 503');
  });
});

describe('siteId', () => {
  it('names a gauge by its number or by its USGS id', () => {
    expect(siteId('01154500')).toBe('USGS-01154500');
    expect(siteId('USGS-01154500')).toBe('USGS-01154500');
    expect(siteId('usgs-01154500')).toBe('USGS-01154500');
  });

  it('refuses anything else', () => {
    for (const bad of [undefined, '', 'putney', 'USGS-', '1154', 'USGS-0115450x']) expect(() => siteId(bad)).toThrow(/USGS/);
  });
});

describe('shareAtOrAbove', () => {
  it('counts the days at or above the limit, as the call does (flow >= limit)', () => {
    expect(shareAtOrAbove([{ v: 10 }, { v: 20 }, { v: 30 }, { v: 5 }], 20)).toBe(0.5);
  });

  it("gives Putney's limits their shares of days", () => {
    expect(shareAtOrAbove(ROWS, 20000)).toBeCloseTo(0.1239, 4);
    expect(shareAtOrAbove(ROWS, 28000)).toBeCloseTo(0.0503, 4);
  });
});

describe('flowSentence', () => {
  it("reads 01 11.3's sentence for Putney word for word", () => {
    const stats = flowStats(ROWS);
    expect(flowSentence(ROWS, stats, { flowCaution: 20000, flowOff: 28000 })).toBe('Since 2016 the median day is about 6,900 cfs. 20,000 is the top 12% of days, 28,000 the top 5%.');
  });

  it('rounds the median to two figures and takes the year from the first day', () => {
    const rows = [{ day: '2018-05-01', v: 2020 }, { day: '2018-05-02', v: 2020 }, { day: '2018-05-03', v: 2020 }];
    expect(flowSentence(rows, flowStats(rows), { flowCaution: 2020, flowOff: 2020 })).toMatch(/^Since 2018 the median day is about 2,000 cfs\./);
  });
});

describe('flowReport', () => {
  it('prints the stats, the limits and the sentence, ready to paste', () => {
    const text = flowReport('USGS-01154500', ROWS);
    expect(text).toContain('USGS-01154500');
    expect(text).toContain('{ "from": "2016-01-01", "to": "2026-10-15", "days": 3939, "p50": 6910, "p65": 10100, "p88": 20300, "p90": 21820, "p95": 28010 }');
    expect(text).toMatch(/flowCaution\s+20000\n/);
    expect(text).toMatch(/flowOff\s+28000\n/);
    expect(text).toContain('[[20000, 1.4], [10000, 1.25]]');
    expect(text).toContain('Since 2016 the median day is about 6,900 cfs. 20,000 is the top 12% of days, 28,000 the top 5%.');
  });

  it('says there is not enough history under 1,095 days, and suggests nothing', () => {
    const text = flowReport('USGS-01154500', ROWS.slice(0, 1094));
    expect(text).toContain('Not enough history to suggest flow limits');
    expect(text).toContain('"days": 1094');
    expect(text).not.toMatch(/flowCaution/);
    expect(text).not.toMatch(/Since 20/);
  });

  it('says so when the gauge has no daily means', () => {
    expect(flowReport('USGS-01154500', [])).toMatch(/No daily means/);
  });
});
