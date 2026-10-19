import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PUTNEY, PUTNEY_RECORD, PUTNEY_WATERWAY } from '../src/putney.js';
import { validateLocation, validateWaterway, validateSlug, RESERVED_SLUGS, resolveSources, resolveLocation, effectiveSettings, overridesOf } from '../src/location.js';
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

describe("Putney's files", () => {
  it('validate', () => {
    expect(validateLocation(PUTNEY_RECORD)).toEqual([]);
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
    expect(PUTNEY_RECORD.thresholds).toEqual(limits);
  });

  it('carry three location bindings and two waterway bindings', () => {
    expect(PUTNEY_RECORD.sources.map(b => [b.role, b.adapter, b.ref])).toEqual([
      ['alerts', 'nws-alerts', 'point:42.9607,-72.5219'],
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
      ['a none course, until phase 1', r => { r.course = { kind: 'none' }; }, 'course.kind', 'unsupported'],
      ['a polyline, until phase 1', r => { r.course = { kind: 'polyline', points: [[42.96, -72.52], [42.97, -72.51]] }; }, 'course.kind', 'unsupported'],
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
      ['copy over 600', r => { r.copy.credits = 'x'.repeat(601); }, 'copy.credits', 'length'],
      ['launch notes over 1000', r => { r.launchNotes = 'x'.repeat(1001); }, 'launchNotes', 'length'],
      ['status', r => { r.status = 'public'; }, 'status', 'value'],
      ['revision 0', r => { r.revision = 0; }, 'revision', 'range'],
      ['unknown role', r => { r.sources[0].role = 'weather'; }, 'sources[0].role', 'value'],
      ['adapter missing', r => { delete r.sources[1].adapter; }, 'sources[1].adapter', 'required'],
      ['ref over 120', r => { r.sources[1].ref = 'x'.repeat(121); }, 'sources[1].ref', 'length'],
      ['priority 10', r => { r.sources[0].priority = 10; }, 'sources[0].priority', 'range'],
      ['binding zone', r => { r.sources[2].tz = 'Mars/Olympus'; }, 'sources[2].tz', 'zone'],
      ['two primaries for one role', r => { r.sources.push(row('obs', { mode: 'primary' })); }, 'sources[3].role', 'two_primaries'],
      ['two primaries, the mode left to default', r => { r.sources.push(row('obs')); }, 'sources[3].role', 'two_primaries']
    ];
    for (const [name, edit, field, code] of cases) {
      const problems = validateLocation(edit === null ? null : rec(edit));
      expect(has(problems, field, code), `${name}: ${JSON.stringify(problems)}`).toBe(true);
    }
  });

  it('accepts what the rules allow', () => {
    const ok = [
      ['lon -180', r => { r.lon = -180; }],
      ['heading 0 and 359', r => { r.course.heading = 359; }],
      ['a draft with no waterway', r => { r.status = 'draft'; r.waterway = null; }],
      ['blank rain and aqi levels, null or empty', r => { r.thresholds.rainCaution = null; r.thresholds.aqiOff = ''; }],
      ['no flow limits', r => { delete r.thresholds.flowCaution; delete r.thresholds.flowOff; r.flow = null; }],
      ['no banks', r => { r.banks = null; }],
      ['a discharge in cubic metres a second', r => { r.flow.unit = 'm3s'; }],
      ['a second obs row as a fallback', r => { r.sources.push(row('obs', { mode: 'fallback', priority: 1 })); }],
      ['a retired row beside a primary', r => { r.sources.push(row('obs', { status: 'retired' })); }],
      ['a day window', r => { r.daylight = { dayWindow: [6, 21] }; }]
    ];
    for (const [name, edit] of ok) expect(validateLocation(rec(edit)), name).toEqual([]);
  });

  it('does not change the record it checks', () => {
    const before = clone(PUTNEY_RECORD);
    validateLocation(PUTNEY_RECORD);
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
    expect(s.alerts[0]).toMatchObject({ adapter: 'nws-alerts', ref: 'point:42.9607,-72.5219', inherited: false });
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

  it('reads the course, banks and water from the record', () => {
    expect(PUTNEY.course).toEqual({ kind: 'heading', heading: 15, points: null, reachWord: 'straight', confirmed: false, segments: [{ heading: 15, lengthM: null, fromM: 0, toM: null, name: null }] });
    expect(PUTNEY.banks.left.short).toBe('VT');
    expect(PUTNEY.banks.right.short).toBe('NH');
    expect(PUTNEY.water).toEqual({ mode: 'river', cross: 0.4, levels: WATER.levels, blend: WATER.blend });
  });

  it('takes the flow gauge label and stats from the waterway binding', () => {
    expect(PUTNEY.flow).toMatchObject({ measure: 'discharge', unit: 'cfs', against: [[20000, 1.4], [10000, 1.25]], maxAgeH: null, staleSwitchH: 6, label: 'North Walpole' });
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
    expect(PUTNEY.waterTemp).toEqual({ fallback: 'none', monthly: null, maxAgeH: null });
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

  it('gives the same from the record as from the resolved location', () => {
    expect(effectiveSettings(PUTNEY_RECORD)).toEqual(effectiveSettings(PUTNEY));
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
    delete r.thresholds.flowCaution; delete r.thresholds.flowOff; r.flow = null;
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
