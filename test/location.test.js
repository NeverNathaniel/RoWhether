import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PUTNEY, PUTNEY_RECORD, PUTNEY_WATERWAY } from '../src/putney.js';
import { validateLocation, validateWaterway, validateSlug, isSlug, RESERVED_SLUGS, resolveSources, resolveLocation, autoBanks, effectiveSettings, overridesOf, flowBasis, ignoredFlowNote } from '../src/location.js';
import { GLOBAL_DEFAULTS, PERIODS, WATER, FOG } from '../src/config.js';
import { zoneFormat } from '../src/format.js';

// The DEFAULTS literal src/config.js held until P0.9 removed it, copied. It
// keeps the check that Putney's data gives the same limits.
const DEFAULTS = {
  heading: 15, windCaution: 10, windOff: 15, gustCaution: 18, gustOff: 25,
  rainCaution: 60, rainOff: 90,
  coldCombined: 100, flowCaution: 20000, flowOff: 28000, waterOverride: '',
  aqiCaution: 151, aqiOff: 201
};

const clone = o => JSON.parse(JSON.stringify(o));
// A copy of Putney's record with one change made by `edit`.
const rec = edit => { const r = clone(PUTNEY_RECORD); edit(r); return r; };
const has = (problems, field, code) => problems.some(x => x.field === field && (!code || x.code === code));
const row = (role, extra = {}) => ({ role, adapter: 'test', ref: role, ...extra });
// Putney takes its flow row from its waterway, so a check of its record gets the waterway too.
const W = { waterway: PUTNEY_WATERWAY };

describe("Putney's files", () => {
  it('validate', () => {
    expect(validateLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY })).toEqual([]);
    expect(validateWaterway(PUTNEY_WATERWAY)).toEqual([]);
  });

  it('hold the values 01 prints', () => {
    expect(PUTNEY_RECORD.id).toBe('19fe7acb-de20-48c9-b25d-20d5e99d113a');
    expect(PUTNEY_RECORD.slug).toBe('putney-landing');
    expect(PUTNEY_RECORD.waterway).toBe(PUTNEY_WATERWAY.id);
    expect(PUTNEY_RECORD.course).toMatchObject({ kind: 'heading', heading: 15, reachWord: 'straight', confirmed: false });
    expect(PUTNEY_RECORD.banks).toEqual({ word: 'bank', left: { short: 'VT', name: 'Vermont' }, right: { short: 'NH', name: 'New Hampshire' } });
    expect(PUTNEY_RECORD.water).toEqual({ mode: 'river', cross: 0.4 });
    expect(PUTNEY_RECORD.flow.against).toEqual([[20000, 1.4], [10000, 1.25]]);
    expect(PUTNEY_RECORD.status).toBe('verified');
  });

  it('carry thresholds equal to the DEFAULTS without heading and waterOverride', () => {
    const { heading, waterOverride, ...limits } = DEFAULTS;
    // The basis of the flow limits (P1.10) is not a limit.
    const { basis, ...own } = PUTNEY_RECORD.thresholds;
    expect(own).toEqual(limits);
  });

  it('carry three location bindings and two waterway bindings', () => {
    expect(PUTNEY_RECORD.sources.map(b => [b.role, b.adapter, b.ref])).toEqual([
      ['alerts', 'nws-alerts', 'zones:VTZ015,VTC025,NHZ011,NHC005'],
      ['obs', 'nws-obs', 'KEEN'],
      ['water_temp', 'usgs-ogc', 'USGS-01161280']
    ]);
    expect(PUTNEY_WATERWAY.sources.map(b => [b.role, b.adapter, b.ref])).toEqual([
      ['flow', 'usgs-ogc', 'USGS-01154500'],
      ['flow_forecast', 'nwps', 'WLPN3']
    ]);
  });
});

describe('validateSlug', () => {
  it('accepts a slug of 3 to 48 characters', () => {
    for (const s of ['putney-landing', 'abc', 'a1b2', 'x'.repeat(48), 'a-b-c']) expect(validateSlug(s)).toEqual([]);
  });

  it('refuses two-letter slugs and slugs over 48 characters, naming the field', () => {
    for (const s of ['at', 'ab', 'a', '', 'x'.repeat(49)]) expect(validateSlug(s)).toEqual([{ field: 'slug', code: 'length', message: expect.any(String) }]);
    expect(validateSlug(null)[0].code).toBe('length');
  });

  it('refuses every reserved word, index and mod among them', () => {
    expect(RESERVED_SLUGS).toContain('index');
    expect(RESERVED_SLUGS).toContain('mod');
    expect(RESERVED_SLUGS).toContain('locations');
    expect(RESERVED_SLUGS).toHaveLength(19);
    // A word under 3 letters (sw) is refused on length first.
    for (const s of RESERVED_SLUGS) expect(validateSlug(s)[0]).toMatchObject({ field: 'slug', code: s.length < 3 ? 'length' : 'reserved' });
    expect(validateSlug('index-2')).toEqual([]);
  });

  it('refuses a bad pattern', () => {
    for (const s of ['-abc', 'abc-', 'a--b', 'Abc', 'a_b', 'a b', 'ab.c', 'café']) expect(validateSlug(s)[0]).toMatchObject({ code: 'format' });
  });

  it('takes the field name and limits for a waterway id, with no reserved words', () => {
    expect(validateSlug('x'.repeat(64), { field: 'id', max: 64, reserved: false })).toEqual([]);
    expect(validateSlug('x'.repeat(65), { field: 'id', max: 64, reserved: false })[0]).toMatchObject({ field: 'id', code: 'length' });
    expect(validateSlug('api', { field: 'id', reserved: false })).toEqual([]);
  });
});

// The page asks isSlug() of an address and of a stored slug, and does not carry
// validateSlug's words. The two give the same answer.
describe('isSlug', () => {
  const CASES = ['putney-landing', 'abc', 'a1b2', 'x'.repeat(48), 'x'.repeat(49), 'at', '', 'api', 'index', 'index-2', 'sw', '-abc', 'abc-', 'a--b', 'Abc', 'a_b', 'ab.c', 'café', 'a/b', '../x', null, undefined, 42, {}, ['abc']];

  it('says yes for a slug and no for everything validateSlug refuses, with the default limits', () => {
    for (const s of CASES) expect(isSlug(s), String(s)).toBe(validateSlug(s).length === 0);
    expect(['putney-landing', 'abc', 'a1b2'].every(s => isSlug(s))).toBe(true);
    expect(['api', 'at', 'Abc', 'a--b', null, 42].some(s => isSlug(s))).toBe(false);
  });

  it('takes the limits and the reserved words the way validateSlug does', () => {
    expect(isSlug('x'.repeat(64), 3, 64, false)).toBe(true);
    expect(isSlug('x'.repeat(65), 3, 64, false)).toBe(false);
    expect(isSlug('api', 3, 48, false)).toBe(true);
    expect(isSlug('api')).toBe(false);
    expect(isSlug('ab', 2)).toBe(true);
    for (const s of CASES) {
      expect(isSlug(s, 2, 10, false), String(s)).toBe(validateSlug(s, { min: 2, max: 10, reserved: false }).length === 0);
    }
  });
});

describe('validateLocation', () => {
  it('names the field of each rule that fails', () => {
    const cases = [
      ['not an object', null, '', 'value'],
      ['file version', r => { r.v = 2; }, 'v', 'value'],
      ['bad id', r => { r.id = 'putney'; }, 'id', 'format'],
      ['slug of 2', r => { r.slug = 'pl'; }, 'slug', 'length'],
      ['reserved slug', r => { r.slug = 'index'; }, 'slug', 'reserved'],
      ['short name of 1', r => { r.shortName = 'P'; }, 'shortName', 'length'],
      ['subtitle over 120', r => { r.subtitle = 'x'.repeat(121); }, 'subtitle', 'length'],
      ['no waterway', r => { r.waterway = null; }, 'waterway', 'required'],
      ['bad zone', r => { r.tz = 'Mars/Olympus'; }, 'tz', 'zone'],
      ['lat 91', r => { r.lat = 91; }, 'lat', 'range'],
      ['lon 180', r => { r.lon = 180; }, 'lon', 'range'],
      ['country in lower case', r => { r.country = 'us'; }, 'country', 'format'],
      ['region without a dash', r => { r.region = 'USVT'; }, 'region', 'format'],
      ['unknown water type', r => { r.waterType = 'ocean'; }, 'waterType', 'value'],
      ['heading 360', r => { r.course.heading = 360; }, 'course.heading', 'range'],
      ['unknown course kind', r => { r.course.kind = 'loop'; }, 'course.kind', 'value'],
      ['a none course on a river', r => { r.course = { kind: 'none' }; }, 'course.kind', 'unsupported'],
      ['a polyline, drawn from phase 3', r => { r.course = { kind: 'polyline', points: [[42.96, -72.52], [42.97, -72.51]] }; }, 'course.kind', 'unsupported'],
      ['polyline of 1 point', r => { r.course = { kind: 'polyline', points: [[42.96, -72.52]] }; }, 'course.points', 'length'],
      ['polyline of 51 points', r => { r.course = { kind: 'polyline', points: Array.from({ length: 51 }, (_, i) => [42.96 + i / 1000, -72.52]) }; }, 'course.points', 'length'],
      ['polyline point off the globe', r => { r.course = { kind: 'polyline', points: [[42.96, -72.52], [95, -72.5]] }; }, 'course.points[1]', 'range'],
      ['bank word', r => { r.banks.word = 'beach'; }, 'banks.word', 'value'],
      ['bank short over 4', r => { r.banks.left.short = 'VERMONT'; }, 'banks.left.short', 'length'],
      ['unknown threshold', r => { r.thresholds.windCuation = 9; }, 'thresholds.windCuation', 'unknown'],
      ['blank wind level', r => { r.thresholds.windCaution = null; }, 'thresholds.windCaution', 'required'],
      ['rain over 100', r => { r.thresholds.rainOff = 101; }, 'thresholds.rainOff', 'range'],
      ['caution above stay off', r => { r.thresholds.gustCaution = 30; }, 'thresholds.gustOff', 'order'],
      ['aqi scale', r => { r.aqiScale = 'cn'; }, 'aqiScale', 'value'],
      ['flow unit', r => { r.flow.unit = 'gal'; }, 'flow.unit', 'value'],
      ['a stage gauge, until phase 1', r => { r.flow = { measure: 'stage', unit: 'ft' }; }, 'flow.measure', 'unsupported'],
      ['a stage gauge in metres, until phase 1', r => { r.flow = { measure: 'stage', unit: 'm' }; }, 'flow.measure', 'unsupported'],
      ['against steps in the wrong order', r => { r.flow.against = [[10000, 1.25], [20000, 1.4]]; }, 'flow.against', 'value'],
      ['against multiplier under 1', r => { r.flow.against = [[20000, 0.5]]; }, 'flow.against', 'value'],
      ['flow age of 0', r => { r.flow.maxAgeH = 0; }, 'flow.maxAgeH', 'range'],
      ['water mode', r => { r.water.mode = 'swell'; }, 'water.mode', 'value'],
      ['monthly water temperature with 3 values', r => { r.waterTemp = { fallback: 'monthly', monthly: [40, 41, 42] }; }, 'waterTemp.monthly', 'length'],
      ['day window backwards', r => { r.daylight = { dayWindow: [22, 5] }; }, 'daylight.dayWindow', 'value'],
      ['copy key not allowed', r => { r.copy.title = 'Hello'; }, 'copy.title', 'copy_key'],
      ['copy over 600', r => { r.copy.flowHow = 'x'.repeat(601); }, 'copy.flowHow', 'length'],
      ['credits over 1200', r => { r.copy.credits = 'x'.repeat(1201); }, 'copy.credits', 'length'],
      ['description over 160', r => { r.copy.description = 'x'.repeat(161); }, 'copy.description', 'length'],
      ['description empty', r => { r.copy.description = ''; }, 'copy.description', 'length'],
      ['launch notes over 1000', r => { r.launchNotes = 'x'.repeat(1001); }, 'launchNotes', 'length'],
      ['status', r => { r.status = 'public'; }, 'status', 'value'],
      ['revision 0', r => { r.revision = 0; }, 'revision', 'range'],
      ['unknown role', r => { r.sources[0].role = 'weather'; }, 'sources[0].role', 'value'],
      ['adapter missing', r => { delete r.sources[1].adapter; }, 'sources[1].adapter', 'required'],
      ['ref over 120', r => { r.sources[1].ref = 'x'.repeat(121); }, 'sources[1].ref', 'length'],
      ['priority 10', r => { r.sources[0].priority = 10; }, 'sources[0].priority', 'range'],
      ['binding zone', r => { r.sources[2].tz = 'Mars/Olympus'; }, 'sources[2].tz', 'zone'],
      ['two primaries for one role', r => { r.sources.push(row('obs', { mode: 'primary' })); }, 'sources[3].role', 'two_primaries'],
      ['two primaries, the mode left to default', r => { r.sources.push(row('obs')); }, 'sources[3].role', 'two_primaries'],
      ['an alerts ref that is a station', r => { r.sources[0].ref = 'station:KEEN'; }, 'sources[0].ref', 'format'],
      ['an alerts ref with no prefix', r => { r.sources[0].ref = 'VTZ015'; }, 'sources[0].ref', 'format'],
      ['an alerts zone in lower case', r => { r.sources[0].ref = 'zones:vtz015'; }, 'sources[0].ref', 'format'],
      ['an alerts zone with a lower case state', r => { r.sources[0].ref = 'zones:vtZ015'; }, 'sources[0].ref', 'format'],
      ['a later alerts zone with a lower case state', r => { r.sources[0].ref = 'zones:VTZ015,nhZ011'; }, 'sources[0].ref', 'format'],
      ['an alerts zone list that ends in a comma', r => { r.sources[0].ref = 'zones:VTZ015,'; }, 'sources[0].ref', 'format'],
      ['an alerts zone that is not a code', r => { r.sources[0].ref = 'zones:VTZ015,Windham'; }, 'sources[0].ref', 'format'],
      ['an alerts zones ref with no zones', r => { r.sources[0].ref = 'zones:'; }, 'sources[0].ref', 'format'],
      ['an alerts zone with four digits', r => { r.sources[0].ref = 'zones:VTZ0155'; }, 'sources[0].ref', 'format'],
      ['an alerts zone with two digits', r => { r.sources[0].ref = 'zones:VTZ15'; }, 'sources[0].ref', 'format'],
      ['an alerts zone that is neither a zone nor a county', r => { r.sources[0].ref = 'zones:VTX015'; }, 'sources[0].ref', 'format'],
      ['an alerts zone list with a space', r => { r.sources[0].ref = 'zones:VTZ015, NHZ011'; }, 'sources[0].ref', 'format'],
      ['an alerts zone with text after the list', r => { r.sources[0].ref = 'zones:VTZ015 and more'; }, 'sources[0].ref', 'format'],
      ['an alerts point with text after it', r => { r.sources[0].ref = 'point:42.9,-72.5 and more'; }, 'sources[0].ref', 'format'],
      ['an alerts point with text before it', r => { r.sources[0].ref = 'a point:42.9,-72.5'; }, 'sources[0].ref', 'format'],
      ['an alerts point with one number', r => { r.sources[0].ref = 'point:42.9607'; }, 'sources[0].ref', 'format']
    ];
    for (const [name, edit, field, code] of cases) {
      const problems = validateLocation(edit === null ? null : rec(edit), W);
      expect(has(problems, field, code), `${name}: ${JSON.stringify(problems)}`).toBe(true);
    }
  });

  it('accepts what the rules allow', () => {
    const ok = [
      ['lon -180', r => { r.lon = -180; }],
      ['heading 0 and 359', r => { r.course.heading = 359; }],
      ['a draft with no waterway', r => { r.status = 'draft'; r.waterway = null; }],
      ['blank rain and aqi levels, null or empty', r => { r.thresholds.rainCaution = null; r.thresholds.aqiOff = ''; }],
      ['no flow limits', r => { delete r.thresholds.flowCaution; delete r.thresholds.flowOff; delete r.thresholds.basis; r.flow = null; }],
      ['no banks', r => { r.banks = null; }],
      ['a discharge in cubic metres a second', r => { r.flow.unit = 'm3s'; }],
      ['a second obs row as a fallback', r => { r.sources.push(row('obs', { mode: 'fallback', priority: 1 })); }],
      ['a retired row beside a primary', r => { r.sources.push(row('obs', { status: 'retired' })); }],
      ['a day window', r => { r.daylight = { dayWindow: [6, 21] }; }],
      ['a description of 160', r => { r.copy.description = 'x'.repeat(160); }],
      ['a text of 600, the limit of every text but two', r => { r.copy.flowHow = 'x'.repeat(600); }],
      ['credits of 1200, which name every source and link to each', r => { r.copy.credits = 'x'.repeat(1200); }],
      ['an alerts zone list with a county and a marine zone', r => { r.sources[0].ref = 'zones:VTZ015,NHC005,ANZ535'; }],
      ['an alerts point of whole degrees', r => { r.sources[0].ref = 'point:42,-72'; }],
      ['an alerts point with 5 decimals', r => { r.sources[0].ref = 'point:42.96070,-72.52190'; }]
    ];
    for (const [name, edit] of ok) expect(validateLocation(rec(edit), W), name).toEqual([]);
  });

  it('does not change the record it checks', () => {
    const before = clone(PUTNEY_RECORD);
    validateLocation(PUTNEY_RECORD, W);
    expect(PUTNEY_RECORD).toEqual(before);
  });
});

describe('validateWaterway', () => {
  const way = edit => { const w = clone(PUTNEY_WATERWAY); edit(w); return w; };

  it('names the field of each rule that fails', () => {
    const cases = [
      ['not an object', null, '', 'value'],
      ['file version', w => { w.v = 2; }, 'v', 'value'],
      ['id of 2', w => { w.id = 'ct'; }, 'id', 'length'],
      ['id over 64', w => { w.id = 'x'.repeat(65); }, 'id', 'length'],
      ['name of 1', w => { w.name = 'C'; }, 'name', 'length'],
      ['reach over 120', w => { w.reach = 'x'.repeat(121); }, 'reach', 'length'],
      ['kind', w => { w.kind = 'sea'; }, 'kind', 'value'],
      ['country', w => { w.country = 'USA'; }, 'country', 'format'],
      ['regions', w => { w.regions = ['VT']; }, 'regions', 'value'],
      ['geometry over 500 points', w => { w.geometry = Array.from({ length: 501 }, () => [42.9, -72.5]); }, 'geometry', 'length'],
      ['traffic rule', w => { w.traffic = { rule: 'zigzag', text: 'x', source: 'club' }; }, 'traffic.rule', 'value'],
      ['notes over 1000', w => { w.notes = 'x'.repeat(1001); }, 'notes', 'length'],
      ['two primaries for one role', w => { w.sources.push(row('flow')); }, 'sources[2].role', 'two_primaries']
    ];
    for (const [name, edit, field, code] of cases) {
      const problems = validateWaterway(edit === null ? null : way(edit));
      expect(has(problems, field, code), `${name}: ${JSON.stringify(problems)}`).toBe(true);
    }
  });

  it('accepts a reserved word as an id and a traffic pattern', () => {
    expect(validateWaterway(way(w => { w.id = 'index'; }))).toEqual([]);
    expect(validateWaterway(way(w => { w.traffic = { rule: 'keep_right', text: 'Keep to the right bank.', source: 'club', updatedAt: 1792224000000 }; }))).toEqual([]);
  });
});

describe('resolveSources', () => {
  it("gives Putney's slots, with the flow row shared by three", () => {
    const s = resolveSources(PUTNEY_RECORD, PUTNEY_WATERWAY);
    expect(Object.keys(s).sort()).toEqual(['alerts', 'flow', 'flowDays', 'flowFcst', 'obs', 'river']);
    expect(s.river.map(b => [b.role, b.ref, b.inherited])).toEqual([['flow', 'USGS-01154500', true], ['water_temp', 'USGS-01161280', false]]);
    expect(s.flow.map(b => b.ref)).toEqual(['USGS-01154500']);
    expect(s.flowDays.map(b => b.ref)).toEqual(['USGS-01154500']);
    expect(s.flowFcst.map(b => [b.adapter, b.ref, b.inherited])).toEqual([['nwps', 'WLPN3', true]]);
    expect(s.alerts[0]).toMatchObject({ adapter: 'nws-alerts', ref: 'zones:VTZ015,VTC025,NHZ011,NHC005', inherited: false });
    expect(s.obs[0]).toMatchObject({ ref: 'KEEN', label: 'Keene', inherited: false });
  });

  it('leaves out forecast, air quality and models, which bindingsFor adds as defaults', () => {
    const s = resolveSources(PUTNEY_RECORD, PUTNEY_WATERWAY);
    for (const k of ['wx', 'aq', 'models', 'tide', 'tideStream', 'level']) expect(s[k]).toBeUndefined();
  });

  it('uses a location row over the waterway row for the same role', () => {
    const own = { sources: [row('flow', { ref: 'own' })] };
    const way = { sources: [row('flow', { ref: 'shared' }), row('flow_forecast', { ref: 'fc' })] };
    const s = resolveSources(own, way);
    expect(s.flow.map(b => [b.ref, b.inherited])).toEqual([['own', false]]);
    expect(s.flowFcst.map(b => [b.ref, b.inherited])).toEqual([['fc', true]]);
  });

  it('drops the waterway binding for a role the location turns off', () => {
    const own = { sources: [row('flow', { mode: 'off' }), row('water_temp', { ref: 't' })] };
    const way = { sources: [row('flow', { ref: 'shared' })] };
    const s = resolveSources(own, way);
    expect(s.flow).toBeUndefined();
    expect(s.flowDays).toBeUndefined();
    expect(s.river.map(b => b.ref)).toEqual(['t']);
  });

  it('runs primary, then fallbacks by priority, then info', () => {
    const own = { sources: [
      row('obs', { ref: 'info', mode: 'info' }),
      row('obs', { ref: 'fb2', mode: 'fallback', priority: 2 }),
      row('obs', { ref: 'main' }),
      row('obs', { ref: 'fb1', mode: 'fallback', priority: 1 })
    ] };
    expect(resolveSources(own, null).obs.map(b => b.ref)).toEqual(['main', 'fb1', 'fb2', 'info']);
  });

  it('skips retired rows', () => {
    const own = { sources: [row('obs', { ref: 'old', status: 'retired' }), row('obs', { ref: 'new', mode: 'fallback', priority: 1 })] };
    expect(resolveSources(own, null).obs.map(b => b.ref)).toEqual(['new']);
    expect(resolveSources({ sources: [row('obs', { status: 'retired' })] }, null)).toEqual({});
  });

  it('fills the defaults on a copy and leaves the record alone', () => {
    const before = clone(PUTNEY_RECORD);
    const s = resolveSources(PUTNEY_RECORD, PUTNEY_WATERWAY);
    expect(s.alerts[0]).toMatchObject({ mode: 'primary', priority: 0 });
    expect(PUTNEY_RECORD).toEqual(before);
    expect(PUTNEY_RECORD.sources[0].mode).toBeUndefined();
  });

  it('gives nothing for no sources', () => {
    expect(resolveSources({}, {})).toEqual({});
    expect(resolveSources(null, undefined)).toEqual({});
  });
});

describe('resolveLocation', () => {
  it("gives Putney's dock, zone and heading", () => {
    expect(PUTNEY.lat).toBe(42.9607);
    expect(PUTNEY.lon).toBe(-72.5219);
    expect(PUTNEY.tz).toBe('America/New_York');
    expect(PUTNEY.course.heading).toBe(15);
    expect(PUTNEY).toMatchObject({ id: PUTNEY_RECORD.id, slug: 'putney-landing', name: 'Putney Landing', shortName: 'Putney', tzLabel: 'Eastern', country: 'US', region: 'US-VT', waterType: 'river', status: 'verified', aqiScale: 'us' });
  });

  it("names the waterway, for the header's line when a record has no subtitle", () => {
    expect(PUTNEY.waterwayName).toBe('Connecticut River');
    expect(resolveLocation(PUTNEY_RECORD).waterwayName).toBeNull();
  });

  it('reads the course, banks and water from the record', () => {
    expect(PUTNEY.course).toEqual({ kind: 'heading', heading: 15, points: null, reachWord: 'straight', confirmed: false, segments: [{ heading: 15, lengthM: null, fromM: 0, toM: null, name: null }] });
    expect(PUTNEY.banks.left.short).toBe('VT');
    expect(PUTNEY.banks.right.short).toBe('NH');
    expect(PUTNEY.water).toEqual({ mode: 'river', cross: 0.4, levels: WATER.levels, blend: WATER.blend });
  });

  it('takes the flow gauge label and stats from the waterway binding', () => {
    expect(PUTNEY.flow).toMatchObject({ measure: 'discharge', unit: 'cfs', against: [[20000, 1.4], [10000, 1.25]], maxAgeH: 24, staleSwitchH: 6, label: 'North Walpole' });
    expect(PUTNEY.flow.stats).toMatchObject({ days: 3939, p50: 6910, p88: 20300, p90: 21820, p95: 28010 });
  });

  it('needs the waterway for the flow and flow forecast bindings', () => {
    expect(PUTNEY.sources.flow).toBeDefined();
    expect(PUTNEY.sources.flowFcst).toBeDefined();
    const alone = resolveLocation(PUTNEY_RECORD);
    expect(alone.sources.flow).toBeUndefined();
    expect(alone.sources.flowFcst).toBeUndefined();
    expect(alone.flow.label).toBeNull();
    expect(alone.flow.stats).toBeNull();
  });

  it('fills the defaults a record leaves out', () => {
    expect(PUTNEY.fog).toEqual(FOG);
    expect(PUTNEY.waterTemp).toEqual({ fallback: 'none', monthly: null, maxAgeH: 72 });
    expect(PUTNEY.daylight).toEqual({ dayWindow: [5, 22] });
    expect(PUTNEY.tide).toBeNull();
    expect(PUTNEY.periods).toBe(PERIODS);
    expect(PUTNEY.thresholds).toEqual(PUTNEY_RECORD.thresholds);
    expect(PUTNEY.copy.flowStats).toBe(PUTNEY_RECORD.copy.flowStats);
    expect(PUTNEY.fmt).toBe(zoneFormat('America/New_York'));
  });

  it('gives a record with its options null the defaults of its water type', () => {
    const lake = resolveLocation(rec(r => { r.waterType = 'lake'; r.water = null; r.flow = null; r.fog = null; r.waterTemp = null; r.daylight = null; r.copy = null; r.subtitle = undefined; }));
    expect(lake.water.mode).toBe('fetch');
    expect(lake.water.cross).toBe(0.4);
    expect(lake.flow).toBeNull();
    expect(lake.fog).toEqual(FOG);
    expect(lake.copy).toEqual({});
    expect(lake.subtitle).toBeNull();
  });

  it('applies a heading override to the course and changes nothing else', () => {
    const mine = resolveLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY, overrides: { heading: 20 } });
    expect(mine.course.heading).toBe(20);
    expect(mine.course.segments).toEqual([{ heading: 20, lengthM: null, fromM: 0, toM: null, name: null }]);
    expect(mine.course.kind).toBe('heading');
    expect(mine.course.reachWord).toBe('straight');
    expect({ ...mine, course: PUTNEY.course }).toEqual(PUTNEY);
    expect(PUTNEY.course.heading).toBe(15);
  });

  it('ignores other overrides, an override that is not a number, and one on a course with no heading', () => {
    const w = { waterway: PUTNEY_WATERWAY };
    expect(resolveLocation(PUTNEY_RECORD, { ...w, overrides: { windCaution: 5, waterOverride: 50 } })).toEqual(PUTNEY);
    expect(resolveLocation(PUTNEY_RECORD, { ...w, overrides: { heading: '20' } }).course.heading).toBe(15);
    expect(resolveLocation(PUTNEY_RECORD, { ...w, overrides: { heading: NaN } }).course.heading).toBe(15);
    const bend = rec(r => { r.course = { kind: 'polyline', points: [[42.96, -72.52], [42.97, -72.51]], reachWord: 'straight', confirmed: true }; });
    const c = resolveLocation(bend, { overrides: { heading: 20 } }).course;
    expect(c.kind).toBe('polyline');
    expect(c.heading).toBeUndefined();
    expect(c.points).toEqual([[42.96, -72.52], [42.97, -72.51]]);
    expect(c.confirmed).toBe(true);
  });

  it('does not change the record or the waterway', () => {
    const r = clone(PUTNEY_RECORD), w = clone(PUTNEY_WATERWAY);
    const loc = resolveLocation(r, { waterway: w, overrides: { heading: 20 } });
    loc.thresholds.windCaution = 1;
    loc.copy.flowHow = 'changed';
    expect(r).toEqual(PUTNEY_RECORD);
    expect(w).toEqual(PUTNEY_WATERWAY);
  });
});

// P1.11 (01 10.4): the banks of a course whose record has none.
describe('autoBanks', () => {
  const sides = b => [b.left.name, b.left.short, b.right.name, b.right.short];

  it('faces the right side 90 degrees from the upstream heading and names the sides by the 8 points', () => {
    expect(sides(autoBanks(15))).toEqual(['west', 'W', 'east', 'E']);
    expect(sides(autoBanks(270))).toEqual(['south', 'S', 'north', 'N']);
    expect(sides(autoBanks(330))).toEqual(['southwest', 'SW', 'northeast', 'NE']);
    expect(sides(autoBanks(0))).toEqual(['west', 'W', 'east', 'E']);
    expect(autoBanks(166, 'shore')).toEqual({ word: 'shore', left: { short: 'E', name: 'east' }, right: { short: 'W', name: 'west' } });
  });

  it('turns through all eight points, the left always opposite the right', () => {
    const names = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
    for (let k = 0; k < 8; k++) {
      const b = autoBanks(k * 45);
      expect(b.right.name).toBe(names[(k + 2) % 8]);
      expect(b.left.name).toBe(names[(k + 6) % 8]);
    }
  });

  it('takes the nearest point, a tie going clockwise, and any bearing', () => {
    // 100 + 90 = 190 is nearer south (180) than southwest (225). 22.5 + 90 = 112.5 is a tie between east and southeast.
    expect(autoBanks(100).right.name).toBe('south');
    expect(autoBanks(22.4).right.name).toBe('east');
    expect(autoBanks(22.5).right.name).toBe('southeast');
    expect(autoBanks(22.5).left.name).toBe('northwest');
    expect(autoBanks(359).right.name).toBe('east');
    expect(autoBanks(-30).right.name).toBe('northeast');
  });

  it('calls the sides banks unless told otherwise, and keeps names the record can hold', () => {
    expect(autoBanks(15).word).toBe('bank');
    const r = rec(x => { x.banks = autoBanks(15); });
    expect(validateLocation(r, W)).toEqual([]);
  });
});

describe('a location with no banks stored', () => {
  const generated = (edit, o = {}) => resolveLocation(rec(r => { r.banks = null; edit(r); }), { waterway: PUTNEY_WATERWAY, ...o });

  it('gets them from its heading, with the viewer\'s heading applied', () => {
    expect(generated(() => {}).banks).toEqual(autoBanks(15));
    expect(generated(() => {}, { overrides: { heading: 330 } }).banks).toEqual(autoBanks(330));
    expect(generated(() => {}, { overrides: { heading: '330' } }).banks).toEqual(autoBanks(15));
  });

  it('calls them banks on a river, a tidal reach and a canal, and shores on a lake, a reservoir and a harbor', () => {
    for (const t of ['river', 'tidal', 'canal']) expect(generated(r => { r.waterType = t; }).banks.word).toBe('bank');
    for (const t of ['lake', 'reservoir', 'harbor']) expect(generated(r => { r.waterType = t; }).banks.word).toBe('shore');
  });

  it('gets them from a record that leaves the field out, as it may (01 table: not required)', () => {
    const r = rec(x => { delete x.banks; });
    expect('banks' in r).toBe(false);
    expect(validateLocation(r, W)).toEqual([]);
    expect(resolveLocation(r, { waterway: PUTNEY_WATERWAY }).banks).toEqual(autoBanks(15));
    expect(resolveLocation(r, { waterway: PUTNEY_WATERWAY, overrides: { heading: 330 } }).banks).toEqual(autoBanks(330));
  });

  it('gets none from a course with no heading', () => {
    expect(generated(r => { r.course = { kind: 'polyline', points: [[42.96, -72.52], [42.97, -72.51]], reachWord: null, confirmed: false }; }).banks).toBeNull();
    expect(generated(r => { r.course = { kind: 'none', reachWord: null, confirmed: false }; }).banks).toBeNull();
  });

  it('is not given them where the record has its own, whatever the viewer\'s heading', () => {
    const own = resolveLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY, overrides: { heading: 330 } });
    expect(own.banks).toEqual(PUTNEY_RECORD.banks);
    expect(own.banks.left.short).toBe('VT');
  });
});

describe('effectiveSettings', () => {
  it("gives today's DEFAULTS for Putney, with the heading from the course", () => {
    expect({ ...effectiveSettings(PUTNEY), heading: PUTNEY.course.heading }).toEqual(DEFAULTS);
  });

  it('returns plain values only, with no heading and no map of where each came from', () => {
    const S = effectiveSettings(PUTNEY, { overrides: { heading: 20 } });
    expect(Object.keys(S).sort()).toEqual(Object.keys(DEFAULTS).filter(k => k !== 'heading').sort());
    expect(S.heading).toBeUndefined();
    expect(S._from).toBeUndefined();
    for (const v of Object.values(S)) expect(typeof v === 'number' || v === '').toBe(true);
    expect(S.waterOverride).toBe('');
  });

  it('reads the limits from the thresholds alone: a record with no basis gives the same as the resolved location', () => {
    const { basis, ...own } = PUTNEY_RECORD.thresholds;
    expect(effectiveSettings({ ...PUTNEY_RECORD, thresholds: own })).toEqual(effectiveSettings(PUTNEY));
  });

  it('gives a location with no thresholds the global defaults and blank flow limits', () => {
    expect(effectiveSettings({ thresholds: {} })).toEqual({
      windCaution: 10, windOff: 15, gustCaution: 18, gustOff: 25, rainCaution: 60, rainOff: 90,
      coldCombined: 100, waterOverride: '', aqiCaution: 151, aqiOff: 201, flowCaution: '', flowOff: ''
    });
  });

  it('puts the location over the global defaults and the viewer over both', () => {
    const loc = { thresholds: { windCaution: 8, flowCaution: 5000, flowOff: 9000 } };
    expect(effectiveSettings(loc)).toMatchObject({ windCaution: 8, windOff: 15, flowCaution: 5000, flowOff: 9000 });
    expect(effectiveSettings(loc, { overrides: { windCaution: 6, flowOff: 12000 } })).toMatchObject({ windCaution: 6, windOff: 15, flowCaution: 5000, flowOff: 12000 });
    expect(effectiveSettings(PUTNEY, { overrides: { windCaution: 8, gustOff: 22, waterOverride: 55 } })).toEqual({ ...effectiveSettings(PUTNEY), windCaution: 8, gustOff: 22, waterOverride: 55 });
  });

  it('keeps a blank from the viewer as a real override, and a blank in the record', () => {
    expect(effectiveSettings(PUTNEY, { overrides: { rainCaution: '', aqiOff: '' } })).toMatchObject({ rainCaution: '', aqiOff: '', rainOff: 90, aqiCaution: 151 });
    expect(effectiveSettings({ thresholds: { rainCaution: null, rainOff: '' } })).toMatchObject({ rainCaution: '', rainOff: '' });
  });

  it('leaves flow blank for a location that sets none, until the viewer sets one', () => {
    expect(effectiveSettings({ thresholds: {} })).toMatchObject({ flowCaution: '', flowOff: '' });
    expect(effectiveSettings({ thresholds: {} }, { overrides: { flowCaution: 7000 } })).toMatchObject({ flowCaution: 7000, flowOff: '' });
  });

  it('ignores an override for a key the settings do not have', () => {
    const S = effectiveSettings(PUTNEY, { overrides: { colour: 'red', streamCaution: 2 } });
    expect(S.colour).toBeUndefined();
    expect(S.streamCaution).toBeUndefined();
  });

  it('returns a new object and does not change its inputs', () => {
    const o = { windCaution: 8 }, before = clone(PUTNEY.thresholds);
    const a = effectiveSettings(PUTNEY, { overrides: o }), b = effectiveSettings(PUTNEY);
    a.windCaution = 1;
    expect(b.windCaution).toBe(10);
    expect(o).toEqual({ windCaution: 8 });
    expect(PUTNEY.thresholds).toEqual(before);
  });

  it('starts from GLOBAL_DEFAULTS, which has no heading and no flow keys', () => {
    expect(Object.keys(GLOBAL_DEFAULTS).sort()).toEqual(['aqiCaution', 'aqiOff', 'coldCombined', 'gustCaution', 'gustOff', 'rainCaution', 'rainOff', 'waterOverride', 'windCaution', 'windOff']);
    expect(GLOBAL_DEFAULTS.waterOverride).toBe('');
  });
});

// The gauge a flow limit is for (01 11.1, P1.10): adapter:ref:unit of the location's flow binding.
const GAUGE = 'usgs-ogc:USGS-01154500:cfs';
const OTHER = 'usgs-ogc:USGS-01154501:cfs';
// Putney's flow row, as the waterway file holds it.
const FLOW_ROW = PUTNEY_WATERWAY.sources.find(b => b.role === 'flow');

// The same place in the two ways a record has its flow row: from its waterway, as Putney's files
// do, and in its own sources with a waterway that has none (R5). `edit` changes the record.
const FORMS = {
  inherited: edit => [rec(edit), PUTNEY_WATERWAY],
  own: edit => [rec(r => { r.sources.push({ ...FLOW_ROW, label: 'Own gauge' }); edit(r); }), { ...PUTNEY_WATERWAY, sources: PUTNEY_WATERWAY.sources.filter(b => b.role !== 'flow') }]
};

describe('validateLocation and the limit basis', () => {
  it("passes Putney's own files, which carry the gauge their flow limits are for", () => {
    expect(PUTNEY_RECORD.thresholds.basis).toEqual({ flow: GAUGE });
    expect(validateLocation(PUTNEY_RECORD, W)).toEqual([]);
  });

  it.each(Object.keys(FORMS))('checks a basis against the flow row when the record has it %s', form => {
    const check = edit => validateLocation(...FORMS[form](edit).map((x, i) => (i ? { waterway: x } : x)));
    expect(check(() => {})).toEqual([]);
    // The gauge the limits were set for is not the one the location reads.
    expect(has(check(r => { r.thresholds.basis = { flow: OTHER }; }), 'thresholds.basis.flow', 'basis')).toBe(true);
    expect(has(check(r => { r.thresholds.basis = { flow: 'usgs-ogc:USGS-01154500:m3s' }; }), 'thresholds.basis.flow', 'basis')).toBe(true);
    // No basis at all is a limit made for the gauge the location reads.
    expect(check(r => { delete r.thresholds.basis; })).toEqual([]);
    // Blank limits need no basis, and a basis is not a limit.
    expect(check(r => { r.thresholds.flowCaution = null; r.thresholds.flowOff = ''; })).toEqual([]);
  });

  it('refuses a flow limit when the location has no flow binding at all', () => {
    const lake = edit => rec(r => { r.waterway = null; r.status = 'draft'; r.sources = r.sources.filter(b => b.role !== 'flow'); edit(r); });
    const problems = validateLocation(lake(r => { delete r.thresholds.basis; }));
    expect(has(problems, 'thresholds.flowCaution', 'no_binding')).toBe(true);
    // Either level alone is a limit.
    expect(has(validateLocation(lake(r => { delete r.thresholds.basis; delete r.thresholds.flowCaution; })), 'thresholds.flowOff', 'no_binding')).toBe(true);
    expect(has(validateLocation(lake(r => { delete r.thresholds.basis; delete r.thresholds.flowOff; })), 'thresholds.flowCaution', 'no_binding')).toBe(true);
    // A basis names a gauge the location does not have.
    expect(has(validateLocation(lake(r => { delete r.thresholds.flowCaution; delete r.thresholds.flowOff; })), 'thresholds.basis.flow', 'basis')).toBe(true);
    // Blank limits, and no basis, are fine.
    expect(validateLocation(lake(r => { delete r.thresholds.basis; delete r.thresholds.flowCaution; delete r.thresholds.flowOff; r.flow = null; }))).toEqual([]);
    expect(validateLocation(lake(r => { delete r.thresholds.basis; r.thresholds.flowCaution = null; r.thresholds.flowOff = ''; r.flow = null; }))).toEqual([]);
  });

  it('does not count an info row, a retired row or an off row as the binding', () => {
    for (const extra of [{ mode: 'info' }, { status: 'retired' }, { mode: 'off' }]) {
      const r = rec(x => { x.sources.push({ ...FLOW_ROW, ...extra }); });
      const way = { ...PUTNEY_WATERWAY, sources: PUTNEY_WATERWAY.sources.filter(b => b.role !== 'flow') };
      expect(has(validateLocation(r, { waterway: way }), 'thresholds.flowCaution', 'no_binding'), JSON.stringify(extra)).toBe(true);
    }
  });

  it('takes the unit from the flow block when the row has none', () => {
    const noUnit = { ...PUTNEY_WATERWAY, sources: PUTNEY_WATERWAY.sources.map(b => (b.role === 'flow' ? { ...b, unit: undefined } : b)) };
    expect(validateLocation(PUTNEY_RECORD, { waterway: noUnit })).toEqual([]);
    expect(has(validateLocation(rec(r => { r.flow.unit = 'm3s'; }), { waterway: noUnit }), 'thresholds.basis.flow', 'basis')).toBe(true);
  });

  it("checks the basis map's shape", () => {
    const check = basis => validateLocation(rec(r => { r.thresholds.basis = basis; }), W);
    expect(has(check('usgs-ogc:USGS-01154500:cfs'), 'thresholds.basis', 'value')).toBe(true);
    expect(has(check([GAUGE]), 'thresholds.basis', 'value')).toBe(true);
    expect(has(check({ flow: GAUGE, wind: 'x:y:z' }), 'thresholds.basis.wind', 'unknown')).toBe(true);
    expect(has(check({ flow: '' }), 'thresholds.basis.flow', 'length')).toBe(true);
    expect(has(check({ flow: 5 }), 'thresholds.basis.flow', 'length')).toBe(true);
    // The tide and level keys are allowed (01 11.1), and no phase 1 location reads their limits.
    expect(has(check({ flow: GAUGE, tide: 'noaa-tides:8447930:ft' }), 'thresholds.basis.tide')).toBe(false);
    expect(has(check({ flow: GAUGE, level: null }), 'thresholds.basis.level')).toBe(false);
    expect(has(check({ flow: GAUGE }), 'thresholds.basis')).toBe(false);
  });

  it('does not throw on sources it cannot read, which the sources rules already name', () => {
    for (const sources of ['x', { role: 'flow' }, [null], [1, 'a']]) {
      const problems = validateLocation(rec(r => { r.sources = sources; }), W);
      expect(problems.some(x => x.field.startsWith('sources')), JSON.stringify(sources)).toBe(true);
    }
    const bad = validateLocation(PUTNEY_RECORD, { waterway: { ...PUTNEY_WATERWAY, sources: [null] } });
    expect(Array.isArray(bad)).toBe(true);
  });
});

describe('effectiveSettings and the limit basis', () => {
  // A location whose limits are for GAUGE, with its flow binding, built by hand.
  const withBasis = (basis, gauge = GAUGE) => {
    const [adapter, ref, unit] = gauge.split(':');
    return { thresholds: { windCaution: 8, flowCaution: 5000, flowOff: 9000, ...(basis && { basis }) }, flow: { unit: 'cfs' }, sources: { flow: [{ role: 'flow', mode: 'primary', adapter, ref, unit }] } };
  };

  it("leaves Putney's limits as they were, and never copies the basis into the settings", () => {
    expect({ ...effectiveSettings(PUTNEY), heading: PUTNEY.course.heading }).toEqual(DEFAULTS);
    expect(PUTNEY.thresholds.basis).toEqual({ flow: GAUGE });
    for (const S of [effectiveSettings(PUTNEY), effectiveSettings(PUTNEY, { overrides: { flowCaution: 15000, limitBasis: { flow: GAUGE } } }), effectiveSettings(withBasis({ flow: GAUGE }))]) {
      expect(S).not.toHaveProperty('basis');
      expect(S).not.toHaveProperty('limitBasis');
    }
  });

  it("finds the location's gauge from its resolved flow row", () => {
    expect(flowBasis(PUTNEY)).toBe(GAUGE);
    expect(flowBasis(withBasis(null, OTHER))).toBe(OTHER);
    expect(flowBasis({ thresholds: {}, flow: null, sources: {} })).toBeNull();
    expect(flowBasis({ thresholds: {} })).toBeNull();
    // The unit comes from the flow block when the row has none, and an info row is not the gauge.
    expect(flowBasis({ flow: { unit: 'm3s' }, sources: { flow: [{ adapter: 'a', ref: 'b' }] } })).toBe('a:b:m3s');
    expect(flowBasis({ sources: { flow: [{ adapter: 'a', ref: 'b', unit: 'cfs', mode: 'info' }, { adapter: 'c', ref: 'd', unit: 'ft', mode: 'fallback' }] } })).toBe('c:d:ft');
  });

  it("applies the location's flow limits while their basis is the location's gauge", () => {
    expect(effectiveSettings(withBasis({ flow: GAUGE }))).toMatchObject({ windCaution: 8, flowCaution: 5000, flowOff: 9000 });
  });

  it("drops the location's flow limits when their basis is another gauge, and keeps the others", () => {
    const S = effectiveSettings(withBasis({ flow: OTHER }));
    expect(S).toMatchObject({ windCaution: 8, flowCaution: '', flowOff: '' });
    // Also with no flow binding left at all: the gauge they were for is gone.
    expect(effectiveSettings({ thresholds: { flowCaution: 5000, flowOff: 9000, basis: { flow: GAUGE } } })).toMatchObject({ flowCaution: '', flowOff: '' });
  });

  it('reads a limit with no basis as made for the gauge the location has', () => {
    expect(effectiveSettings(withBasis(null))).toMatchObject({ flowCaution: 5000, flowOff: 9000 });
    expect(effectiveSettings(withBasis({}))).toMatchObject({ flowCaution: 5000, flowOff: 9000 });
  });

  it("applies the viewer's flow limits while their basis is the location's gauge", () => {
    const o = { flowCaution: 4000, flowOff: 7000, limitBasis: { flow: GAUGE } };
    expect(effectiveSettings(withBasis({ flow: GAUGE }), { overrides: o })).toMatchObject({ flowCaution: 4000, flowOff: 7000 });
  });

  it("ignores the viewer's flow limits made for another gauge, and keeps them in what it was given", () => {
    const o = { windCaution: 6, flowCaution: 4000, flowOff: 7000, limitBasis: { flow: OTHER } };
    const before = clone(o);
    // The location's own limits apply instead, and the viewer's other limits still do.
    expect(effectiveSettings(withBasis({ flow: GAUGE }), { overrides: o })).toMatchObject({ windCaution: 6, flowCaution: 5000, flowOff: 9000 });
    expect(effectiveSettings(PUTNEY, { overrides: o })).toMatchObject({ windCaution: 6, flowCaution: 20000, flowOff: 28000 });
    expect(o).toEqual(before);
    // A location with no flow limits of its own is left blank.
    expect(effectiveSettings({ ...withBasis(null), thresholds: {} }, { overrides: o })).toMatchObject({ flowCaution: '', flowOff: '' });
  });

  it("reads a viewer's flow limit saved with no basis, before P1.10, as made for the current gauge", () => {
    expect(effectiveSettings(PUTNEY, { overrides: { flowCaution: 15000 } })).toMatchObject({ flowCaution: 15000, flowOff: 28000 });
    expect(effectiveSettings(PUTNEY, { overrides: { flowCaution: 15000, limitBasis: {} } })).toMatchObject({ flowCaution: 15000 });
    expect(effectiveSettings(PUTNEY, { overrides: { flowCaution: 15000, limitBasis: { flow: null } } })).toMatchObject({ flowCaution: 15000 });
  });

  it("applies the viewer's flow limits at a location with no flow binding, which has none to disagree with, only when they carry no basis", () => {
    expect(effectiveSettings({ thresholds: {} }, { overrides: { flowCaution: 7000 } })).toMatchObject({ flowCaution: 7000 });
    expect(effectiveSettings({ thresholds: {} }, { overrides: { flowCaution: 7000, limitBasis: { flow: GAUGE } } })).toMatchObject({ flowCaution: '' });
  });

  it("holds the basis of each side to its own: a basis on the viewer's limits never moves the location's", () => {
    const S = effectiveSettings(withBasis({ flow: GAUGE }), { overrides: { windCaution: 6, limitBasis: { flow: OTHER } } });
    expect(S).toMatchObject({ windCaution: 6, flowCaution: 5000, flowOff: 9000 });
  });

  it('does not change what it is given', () => {
    const loc = withBasis({ flow: OTHER }), before = clone(loc), o = { flowCaution: 1, limitBasis: { flow: OTHER } }, ob = clone(o);
    effectiveSettings(loc, { overrides: o });
    expect(loc).toEqual(before);
    expect(o).toEqual(ob);
  });
});

describe('resolveLocation and flow limits set for another gauge', () => {
  const way = (...extra) => ({ ...PUTNEY_WATERWAY, sources: [...PUTNEY_WATERWAY.sources, ...extra] });
  const OLD_ROW = { ...FLOW_ROW, ref: 'USGS-01154501', label: 'Bellows Falls', status: 'retired' };
  const stored = (limitBasis, extra = { flowCaution: 4000 }) => ({ ...extra, ...(limitBasis && { limitBasis }) });

  it('says nothing while the limits apply, so the location has no such key', () => {
    for (const o of [{}, stored(null), stored({ flow: GAUGE }), stored({}), { windCaution: 7 }, stored({ flow: OTHER }, { windCaution: 7 })]) {
      const loc = resolveLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY, overrides: o });
      expect(loc, JSON.stringify(o)).not.toHaveProperty('ignoredFlow');
    }
    expect(PUTNEY).not.toHaveProperty('ignoredFlow');
  });

  it('names the gauge they were for when a row of the record or the waterway still has it', () => {
    const o = stored({ flow: 'usgs-ogc:USGS-01154501:cfs' });
    expect(resolveLocation(PUTNEY_RECORD, { waterway: way(OLD_ROW), overrides: o }).ignoredFlow).toEqual({ label: 'Bellows Falls' });
    // In the record's own sources, beside the row it reads now (a role with own rows uses only those).
    const own = rec(r => { r.sources.push(FLOW_ROW, OLD_ROW); });
    expect(resolveLocation(own, { waterway: PUTNEY_WATERWAY, overrides: o }).ignoredFlow).toEqual({ label: 'Bellows Falls' });
    // Either level counts, and a blank level the viewer set is a limit too.
    expect(resolveLocation(own, { waterway: PUTNEY_WATERWAY, overrides: stored({ flow: 'usgs-ogc:USGS-01154501:cfs' }, { flowOff: '' }) }).ignoredFlow).toEqual({ label: 'Bellows Falls' });
  });

  it('has no label when no row names the gauge, and the words still read', () => {
    const loc = resolveLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY, overrides: stored({ flow: OTHER }) });
    expect(loc.ignoredFlow).toEqual({ label: null });
    // A row with no label is no name either.
    expect(resolveLocation(PUTNEY_RECORD, { waterway: way({ ...OLD_ROW, label: undefined }), overrides: stored({ flow: 'usgs-ogc:USGS-01154501:cfs' }) }).ignoredFlow).toEqual({ label: null });
  });

  it('says nothing at a location with no flow binding, which shows no flow limits', () => {
    const lake = rec(r => { r.sources = r.sources.filter(b => b.role !== 'flow'); r.flow = null; });
    expect(resolveLocation(lake, { waterway: { ...PUTNEY_WATERWAY, sources: [] }, overrides: stored({ flow: OTHER }) })).not.toHaveProperty('ignoredFlow');
  });

  it('words the notice for Settings and the River view', () => {
    expect(ignoredFlowNote({ label: 'North Walpole' })).toBe('Your flow limits were for the North Walpole gauge. Set them again for this gauge.');
    expect(ignoredFlowNote({ label: null })).toBe('Your flow limits were for a different gauge. Set them again for this gauge.');
  });
});

describe('imports', () => {
  // Files the module imports, read from its import lines.
  const imports = file => [...readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8').matchAll(/^import .* from '(.+)';$/gm)].map(m => m[1]);

  it('keep config.js and format.js free of the location modules, so there is no cycle', () => {
    expect(imports('config.js')).toEqual([]);
    expect(imports('format.js')).toEqual(['./config.js']);
    expect(imports('location.js').sort()).toEqual(['./config.js', './format.js']);
    expect(imports('putney.js').sort()).toEqual(['../data/locations/putney-landing.json', '../data/waterways/connecticut-river-vernon-pool.json', './location.js']);
  });
});

describe('overridesOf', () => {
  // A place that is not Putney: heading 90, wind caution 12 and no flow limits.
  const lake = resolveLocation(rec(r => {
    r.slug = 'some-lake'; r.course.heading = 90; r.thresholds.windCaution = 12;
    delete r.thresholds.flowCaution; delete r.thresholds.flowOff; delete r.thresholds.basis; r.flow = null;
  }), { waterway: PUTNEY_WATERWAY });
  const defaultsOf = loc => ({ ...effectiveSettings(loc), heading: loc.course.heading });

  it('keeps what differs from the defaults it is given, so settings saved unchanged store nothing at any place', () => {
    expect(overridesOf(defaultsOf(PUTNEY), defaultsOf(PUTNEY))).toEqual({});
    expect(overridesOf(defaultsOf(lake), defaultsOf(lake))).toEqual({});
    // The same settings against Putney's defaults would all be "changes": the old behavior.
    expect(overridesOf(defaultsOf(lake), defaultsOf(PUTNEY))).toEqual({ heading: 90, windCaution: 12, flowCaution: '', flowOff: '' });
  });

  it("keeps a viewer's own change against the place's defaults, blanks included", () => {
    const S = { ...defaultsOf(lake), windCaution: 9, flowOff: 5000, rainCaution: '' };
    expect(overridesOf(S, defaultsOf(lake))).toEqual({ windCaution: 9, flowOff: 5000, rainCaution: '' });
    // A value equal to the place's default is not a change, even when it differs from Putney's.
    expect(overridesOf({ ...defaultsOf(lake), windCaution: 12 }, defaultsOf(lake))).toEqual({});
  });

  it('compares strictly: a blank is a change from a default of 0, and a missing key is no change', () => {
    const d = { windCaution: 10, rainCaution: 0 };
    expect(overridesOf({ windCaution: 10, rainCaution: '' }, d)).toEqual({ rainCaution: '' });
    expect(overridesOf({ windCaution: 10, rainCaution: 0 }, d)).toEqual({});
    // Not a key with the value undefined, which toEqual would not tell from a missing one.
    expect(Object.keys(overridesOf({ rainCaution: 5 }, d))).toEqual(['rainCaution']);
  });
});
