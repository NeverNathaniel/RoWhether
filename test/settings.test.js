// The Settings dialog (src/settings.js) against a fake page. What it fills,
// what Reset restores and what Save keeps are the defaults of the location
// shown (FD8), not Putney's. Only what differs from them is stored.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app, openLocation } from '../src/state.js';
import { initSettings, refreshNudge } from '../src/settings.js';
import { PUTNEY_RECORD, PUTNEY_WATERWAY } from '../src/putney.js';
import { resolveLocation, effectiveSettings } from '../src/location.js';
import { recordFile } from '../scripts/locations/plugin.mjs';
import { PUTNEY_FILE } from './helpers/putney-file.js';

const NOW = 1760700000000;
// The 13 fields of the form, written out.
const FIELDS = ['heading', 'windCaution', 'windOff', 'gustCaution', 'gustOff', 'rainCaution', 'rainOff', 'coldCombined', 'waterOverride', 'flowCaution', 'flowOff', 'aqiCaution', 'aqiOff'];
const FLOW = ['flowCaution', 'flowOff'];
// The gauge Putney's flow limits are for, and another one.
const GAUGE = 'usgs-ogc:USGS-01154500:cfs';
const OTHER = 'usgs-ogc:USGS-09999999:cfs';

// A place that is not Putney: heading 90, wind caution 12 and no flow limits, as the build writes it.
const clone = o => JSON.parse(JSON.stringify(o));
const rec = clone(PUTNEY_RECORD);
rec.slug = 'some-lake'; rec.course.heading = 90; rec.thresholds.windCaution = 12;
delete rec.thresholds.flowCaution; delete rec.thresholds.flowOff; delete rec.thresholds.basis; rec.flow = null;
const LAKE_FILE = recordFile(rec, PUTNEY_WATERWAY);
const LAKE = resolveLocation(rec, { waterway: PUTNEY_WATERWAY });
const LAKE_DEFAULTS = { ...effectiveSettings(LAKE), heading: LAKE.course.heading };
const PUTNEY_VALUES = { heading: '15', windCaution: '10', windOff: '15', gustCaution: '18', gustOff: '25', rainCaution: '60', rainOff: '90', coldCombined: '100', waterOverride: '', flowCaution: '20000', flowOff: '28000', aqiCaution: '151', aqiOff: '201' };

// A page with the dialog's elements. Each element keeps the listeners it was given. The form's
// fields are the ones index.html has, and the two flow fields, which the script writes into
// #setFlow when the dialog opens (P1.10): they are in the form from the start and replaced by
// whatever the script writes, or removed when it writes none.
function page() {
  const els = {};
  const el = id => (els[id] ??= { id, hidden: false, textContent: '', on: {}, addEventListener(type, fn) { this.on[type] = fn; } });
  // An input's value is always a string, as in the browser. `line` is what was put after its label.
  const input = name => {
    let v = '';
    const o = {
      name, placeholder: '', disabled: false, attrs: {}, line: null,
      get value() { return v; }, set value(x) { v = String(x ?? ''); },
      closest: () => ({ after: n => { o.line = n; } }),
      setAttribute: (k, x) => { o.attrs[k] = x; }
    };
    return o;
  };
  const form = Object.fromEntries(FIELDS.map(k => [k, input(k)]));
  el('setForm').elements = form;
  let flowHtml = '';
  Object.defineProperty(el('setFlow'), 'innerHTML', {
    get: () => flowHtml,
    set: x => { flowHtml = x; for (const k of FLOW) delete form[k]; for (const k of FLOW) if (x.includes(`name="${k}"`)) form[k] = input(k); }
  });
  el('settings').showModal = () => {};
  vi.stubGlobal('document', { getElementById: el, createElement: tag => ({ tag, hidden: false, className: '', id: '', textContent: '' }) });
  return {
    el, form, els,
    shown: () => Object.fromEntries(FIELDS.filter(k => form[k]).map(k => [k, form[k].value])),
    open: () => els.settingsBtn.on.click(),
    // Types into a field, as a person does: the value changes and the form hears an input event.
    type: (name, value) => { form[name].value = value; els.setForm.on.input({ target: form[name] }); },
    reset: () => els.resetSet.on.click(),
    save: () => { els.settings.returnValue = 'save'; els.settings.on.close(); }
  };
}

let map;
// The location the page shows, opened the way main.js opens one, with nothing overridden.
const open = file => openLocation(file, {});

beforeEach(() => {
  map = new Map();
  vi.stubGlobal('localStorage', {
    getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: k => { map.delete(k); },
    key: i => [...map.keys()][i] ?? null, get length() { return map.size; }
  });
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  open(PUTNEY_FILE);
});

const saved = () => JSON.parse(map.get('rowhether-settings-v2'));

describe('Settings at Putney', () => {
  it('opens on its limits and keeps nothing when saved unchanged', () => {
    open(PUTNEY_FILE);
    const p = page(), onSave = vi.fn();
    initSettings(onSave);
    p.open();
    expect(p.shown()).toEqual(PUTNEY_VALUES);
    p.save();
    expect(saved()).toEqual({ 'putney-landing': { saved: NOW, values: {} } });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('keeps only the field that was changed', () => {
    open(PUTNEY_FILE);
    const p = page();
    initSettings(() => {});
    p.open();
    p.form.windCaution.value = '8';
    p.save();
    expect(saved()['putney-landing'].values).toEqual({ windCaution: 8 });
  });
});

describe('Settings at another place', () => {
  it("opens on the place's limits, with its heading and its blank flow limits", () => {
    open(LAKE_FILE);
    const p = page();
    initSettings(() => {});
    p.open();
    expect(p.shown()).toMatchObject({ heading: '90', windCaution: '12', windOff: '15', flowCaution: '', flowOff: '' });
  });

  it("stores nothing when saved unchanged, so a later fix to the place's limits still reaches the viewer", () => {
    open(LAKE_FILE);
    const p = page();
    initSettings(() => {});
    p.open();
    p.save();
    // Against Putney's defaults this saved heading 90, wind caution 12 and both flow limits as the viewer's own.
    expect(saved()).toEqual({ 'some-lake': { saved: NOW, values: {} } });
  });

  it("keeps a change against the place's defaults, and drops a value that is back at them", () => {
    const p = page();
    initSettings(() => {});
    // Each save starts from the place again.
    const saveWith = changes => {
      open(LAKE_FILE);
      p.open();
      for (const [k, v] of Object.entries(changes)) p.form[k].value = v;
      p.save();
      return saved()['some-lake'].values;
    };
    // Gust caution 18 is the place's default and no change. Wind caution 10 is Putney's default and a change here.
    expect(saveWith({ windCaution: '9', gustCaution: '18' })).toEqual({ windCaution: 9 });
    expect(saveWith({ windCaution: '10' })).toEqual({ windCaution: 10 });
    expect(saveWith({ windCaution: '12' })).toEqual({});
  });

  it("Reset puts back the place's numbers, not Putney's", () => {
    open(LAKE_FILE);
    const p = page();
    initSettings(() => {});
    p.open();
    for (const k of FIELDS) p.form[k].value = '33';
    p.reset();
    expect(p.shown()).toEqual(Object.fromEntries(FIELDS.map(k => [k, String(LAKE_DEFAULTS[k])])));
    expect(p.shown()).toMatchObject({ heading: '90', windCaution: '12', flowCaution: '', flowOff: '' });
  });

  it("Reset at Putney puts back Putney's numbers", () => {
    open(PUTNEY_FILE);
    const p = page();
    initSettings(() => {});
    p.open();
    for (const k of FIELDS) p.form[k].value = '33';
    p.reset();
    expect(p.shown()).toMatchObject({ heading: '15', windCaution: '10', flowCaution: '20000', flowOff: '28000' });
  });
});

// What Save does to what was typed (FC9): a stay off level under its caution is
// raised to it, rain chance and air quality levels are whole numbers inside
// their range and can be blank, the heading wraps, and a field with no number
// keeps what it had. Each row types into the fields at Putney, saves, and gives
// the values kept, which are the ones that differ from Putney's defaults.
describe("Settings' rules on Save", () => {
  const saveWith = typed => {
    open(PUTNEY_FILE);
    const p = page();
    initSettings(() => {});
    p.open();
    for (const [k, v] of Object.entries(typed)) p.form[k].value = v;
    p.save();
    return saved()['putney-landing'].values;
  };

  it.each([
    ['wind: stay off under caution is raised to it', { windCaution: '30', windOff: '20' }, { windCaution: 30, windOff: 30 }],
    ['gusts: stay off under caution is raised to it', { gustCaution: '30', gustOff: '20' }, { gustCaution: 30, gustOff: 30 }],
    ['flow: stay off under caution is raised to it', { flowCaution: '30000', flowOff: '25000' }, { flowCaution: 30000, flowOff: 30000, limitBasis: { flow: GAUGE } }],
    ['rain chance: stay off under caution is raised to it', { rainCaution: '80', rainOff: '70' }, { rainCaution: 80, rainOff: 80 }],
    ['air quality: stay off under caution is raised to it', { aqiCaution: '200', aqiOff: '120' }, { aqiCaution: 200, aqiOff: 200 }],
    ['wind: stay off at its caution is kept', { windCaution: '12', windOff: '12' }, { windCaution: 12, windOff: 12 }],
    ['flow: no order to keep when caution is blank', { flowCaution: '', flowOff: '25000' }, { flowCaution: '', flowOff: 25000, limitBasis: { flow: GAUGE } }],
    ['flow: no order to keep when stay off is blank', { flowCaution: '30000', flowOff: '' }, { flowCaution: 30000, flowOff: '', limitBasis: { flow: GAUGE } }],
    ['flow: both blank turns both levels off', { flowCaution: '', flowOff: '' }, { flowCaution: '', flowOff: '', limitBasis: { flow: GAUGE } }],
    ['flow: not rounded', { flowCaution: '20000.5' }, { flowCaution: 20000.5, limitBasis: { flow: GAUGE } }],
    ['rain chance: no order to keep when caution is blank', { rainCaution: '', rainOff: '70' }, { rainCaution: '', rainOff: 70 }],
    ['rain chance: no order to keep when stay off is blank', { rainCaution: '80', rainOff: '' }, { rainCaution: 80, rainOff: '' }],
    ['air quality: no order to keep when caution is blank', { aqiCaution: '', aqiOff: '120' }, { aqiCaution: '', aqiOff: 120 }],
    ['air quality: no order to keep when stay off is blank', { aqiCaution: '200', aqiOff: '' }, { aqiCaution: 200, aqiOff: '' }],
    ['rain chance: over 100 is 100', { rainOff: '150' }, { rainOff: 100 }],
    ['rain chance: under 0 is 0', { rainCaution: '-5' }, { rainCaution: 0 }],
    ['rain chance: rounded to a whole number', { rainCaution: '62.4' }, { rainCaution: 62 }],
    ['air quality: over 500 is 500', { aqiOff: '900' }, { aqiOff: 500 }],
    ['air quality: under 0 is 0', { aqiCaution: '-1' }, { aqiCaution: 0 }],
    ['heading: wraps past 359', { heading: '400' }, { heading: 40 }],
    ['heading: wraps under 0', { heading: '-20' }, { heading: 340 }],
    ['heading: rounds, and 359.6 is 0', { heading: '359.6' }, { heading: 0 }],
    ['a required field with no number keeps its value', { windCaution: '', gustOff: 'abc' }, {}],
    ['the dock reading is a number', { waterOverride: '55.5' }, { waterOverride: 55.5 }],
    ['the dock reading left blank uses the gauge', { waterOverride: '' }, {}],
    ['the dock reading that is not a number uses the gauge', { waterOverride: 'cold' }, {}]
  ])('%s', (_, typed, kept) => {
    expect(saveWith(typed)).toEqual(kept);
  });
});

// initSettings() runs once, when the page starts and no location is open. What the
// dialog shows and keeps is the defaults of the location that is open when it opens.
describe('Settings follow the location that is open', () => {
  it('fills the 13 fields from app.defaults, whichever location was opened since initSettings ran', () => {
    const p = page();
    openLocation(null);
    initSettings(() => {});
    open(PUTNEY_FILE);
    p.open();
    expect(p.shown()).toEqual(PUTNEY_VALUES);
    open(LAKE_FILE);
    p.open();
    expect(p.shown()).toEqual(Object.fromEntries(FIELDS.map(k => [k, String(LAKE_DEFAULTS[k])])));
    expect(Object.keys(p.shown())).toHaveLength(13);
  });

  it("opens with the location's limits and heading as its defaults, and no heading when the course has none", () => {
    open(PUTNEY_FILE);
    expect(app.defaults).toEqual({ ...effectiveSettings(resolveLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY })), heading: 15 });
    open(LAKE_FILE);
    expect(app.defaults).toEqual(LAKE_DEFAULTS);
    const none = clone(rec);
    none.course = { kind: 'none', confirmed: false };
    open(recordFile(none, PUTNEY_WATERWAY));
    expect(app.defaults).not.toHaveProperty('heading');
    const p = page();
    initSettings(() => {});
    p.open();
    expect(p.shown().heading).toBe('');
  });

  it("defaults are the location's whatever the viewer changed, and settings are what is in force", () => {
    openLocation(LAKE_FILE, { windCaution: 7, heading: 120 });
    expect(app.defaults).toEqual(LAKE_DEFAULTS);
    expect(app.settings.windCaution).toBe(7);
    expect(app.loc.course.heading).toBe(120);
    expect(app.defaults.heading).toBe(90);
  });

  it("keeps what was saved under the open location's slug and not another's", () => {
    const p = page();
    initSettings(() => {});
    open(LAKE_FILE);
    p.open();
    p.form.windOff.value = '20';
    p.save();
    open(PUTNEY_FILE);
    p.open();
    p.form.gustOff.value = '30';
    p.save();
    expect(saved()).toEqual({ 'some-lake': { saved: NOW, values: { windOff: 20 } }, 'putney-landing': { saved: NOW, values: { gustOff: 30 } } });
  });
});

describe('the reminder to set limits', () => {
  const hidden = p => p.el('setNudge').hidden;

  it("shows until the open location's Settings were saved in this browser, then hides", () => {
    const p = page();
    initSettings(() => {});
    open(PUTNEY_FILE);
    refreshNudge();
    expect(hidden(p)).toBe(false);
    p.open();
    p.save();
    expect(hidden(p)).toBe(true);
    refreshNudge();
    expect(hidden(p)).toBe(true);
  });

  it('is asked again for each location: Settings saved for Putney leave another location with the reminder', () => {
    const p = page();
    initSettings(() => {});
    open(PUTNEY_FILE);
    p.open();
    p.save();
    open(LAKE_FILE);
    refreshNudge();
    expect(hidden(p)).toBe(false);
    open(PUTNEY_FILE);
    refreshNudge();
    expect(hidden(p)).toBe(true);
  });

  it('stays away for every location once dismissed', () => {
    const p = page();
    initSettings(() => {});
    open(PUTNEY_FILE);
    refreshNudge();
    p.el('setNudgeLater').on.click();
    expect(hidden(p)).toBe(true);
    expect(map.get('rowhether-nudge-v1')).toBe('1');
    open(LAKE_FILE);
    refreshNudge();
    expect(hidden(p)).toBe(true);
  });
});

// The dialog is built from the location (P1.10, 01 11.6): the flow fieldset only with a flow
// binding, the course only for a heading, the limits' defaults in placeholders and a line under
// a field that is not at its default, and the name of the place in the intro.
// A waterway with no flow row: a record on it has no flow binding.
const DRY = { ...PUTNEY_WATERWAY, id: 'dry-lake', sources: PUTNEY_WATERWAY.sources.filter(b => b.role !== 'flow' && b.role !== 'flow_forecast') };
const NO_FLOW_FILE = recordFile({ ...rec, waterway: DRY.id, name: 'Dry Lake' }, DRY);
// The same place with a course that is not one heading.
const course = (kind, over = {}) => recordFile({ ...rec, waterway: DRY.id, course: { kind, confirmed: false, ...over } }, DRY);

describe('the flow fieldset', () => {
  it("is written for Putney with its gauge's name, unit and words, and no field is required", () => {
    open(PUTNEY_FILE);
    const p = page();
    initSettings(() => {});
    p.open();
    const fs = p.els.setFlow;
    expect(fs.hidden).toBe(false);
    expect(fs.innerHTML).toContain('<legend>River flow at North Walpole, cfs</legend>');
    expect(fs.innerHTML).toContain(`<p class="note" style="margin:.4rem 0 0">${PUTNEY_RECORD.copy.flowStats}</p>`);
    expect(fs.innerHTML.match(/<input /g)).toHaveLength(2);
    for (const k of FLOW) expect(fs.innerHTML).toMatch(new RegExp(`<input name="${k}" type="number" min="0" max="10000000" step="100" inputmode="numeric">`));
    expect(fs.innerHTML).not.toContain('required');
    expect(fs.innerHTML).toContain('Caution at <input');
    expect(fs.innerHTML).toContain('Stay off at <input');
    expect(fs.innerHTML).not.toContain('Your flow limits were for');
  });

  it("names the gauge from the record's own row, in the unit of the row", () => {
    const own = clone(rec);
    own.waterway = DRY.id; own.flow = { ...PUTNEY_RECORD.flow, unit: 'm3s' };
    own.sources = [...own.sources, { role: 'flow', mode: 'primary', adapter: 'usgs-ogc', ref: 'USGS-2', params: { parameterCode: '00060' }, unit: 'm3s', label: 'Weir & Pool' }];
    own.copy = { ...own.copy, flowStats: 'Flow here is usually 40 m³/s.' };
    own.thresholds = { ...own.thresholds, flowCaution: 60, flowOff: 90, basis: { flow: 'usgs-ogc:USGS-2:m3s' } };
    open(recordFile(own, DRY));
    const p = page();
    initSettings(() => {});
    p.open();
    expect(p.els.setFlow.innerHTML).toContain('<legend>River flow at Weir &amp; Pool, m³/s</legend>');
    // Not cfs: any number, and the decimal keyboard.
    expect(p.els.setFlow.innerHTML).toContain('step="any" inputmode="decimal"');
    expect(p.els.setFlow.innerHTML).not.toContain('step="100"');
    expect(p.els.setFlow.innerHTML).toContain('Flow here is usually 40 m³/s.');
    expect(p.shown()).toMatchObject({ flowCaution: '60', flowOff: '90' });
  });

  it('has no words that are not there: no label, no stats', () => {
    const bare = clone(rec);
    bare.copy = { ...bare.copy }; delete bare.copy.flowStats;
    open(recordFile(bare, { ...PUTNEY_WATERWAY, sources: PUTNEY_WATERWAY.sources.map(b => (b.role === 'flow' ? { ...b, label: undefined } : b)) }));
    const p = page();
    initSettings(() => {});
    p.open();
    expect(p.els.setFlow.innerHTML).toContain('<legend>River flow, cfs</legend>');
    expect(p.els.setFlow.innerHTML).not.toContain('class="note"');
  });

  it('is left out, with its fields, at a location with no flow binding, which Saves', () => {
    open(NO_FLOW_FILE);
    const p = page();
    const onSave = vi.fn();
    initSettings(onSave);
    p.open();
    expect(p.els.setFlow.hidden).toBe(true);
    expect(p.els.setFlow.innerHTML).toBe('');
    expect(p.form.flowCaution).toBeUndefined();
    expect(p.form.flowOff).toBeUndefined();
    expect(Object.keys(p.shown())).toHaveLength(11);
    p.save();
    expect(saved()).toEqual({ 'some-lake': { saved: NOW, values: {} } });
    expect(onSave).toHaveBeenCalledTimes(1);
    // A change to another field is kept, with no flow limit and no gauge.
    p.open();
    p.form.windCaution.value = '9';
    p.save();
    expect(saved()['some-lake'].values).toEqual({ windCaution: 9 });
  });

  it('comes back when the next location has a binding, and goes when it has none', () => {
    const p = page();
    initSettings(() => {});
    open(PUTNEY_FILE);
    p.open();
    expect(p.els.setFlow.hidden).toBe(false);
    open(NO_FLOW_FILE);
    p.open();
    expect(p.els.setFlow.hidden).toBe(true);
    expect(p.form.flowCaution).toBeUndefined();
    open(PUTNEY_FILE);
    p.open();
    expect(p.els.setFlow.hidden).toBe(false);
    expect(p.shown()).toEqual(PUTNEY_VALUES);
  });
});

describe('the course field', () => {
  it('is there for a heading course and not for another kind, which Saves', () => {
    const p = page();
    initSettings(() => {});
    open(PUTNEY_FILE);
    p.open();
    expect(p.els.setCourse.hidden).toBe(false);
    expect(p.form.heading.disabled).toBe(false);
    for (const [kind, over] of [['none', {}], ['polyline', { points: [[42.96, -72.52], [42.97, -72.51]] }]]) {
      open(course(kind, over));
      p.open();
      expect(p.els.setCourse.hidden, kind).toBe(true);
      expect(p.form.heading.disabled, kind).toBe(true);
      p.form.windCaution.value = '9';
      p.save();
      // No heading is read or kept, though the field holds nothing.
      expect(saved()['some-lake'].values, kind).toEqual({ windCaution: 9 });
    }
    open(PUTNEY_FILE);
    p.open();
    expect(p.els.setCourse.hidden).toBe(false);
    expect(p.form.heading.disabled).toBe(false);
  });
});

describe('what the dialog says about the location and the limits', () => {
  it('names the location in the intro', () => {
    const p = page();
    initSettings(() => {});
    open(PUTNEY_FILE);
    p.open();
    expect(p.els.setIntro.textContent).toBe('Match these to your program, boat class and coach coverage. Saved in this browser for Putney Landing.');
    open(NO_FLOW_FILE);
    p.open();
    expect(p.els.setIntro.textContent).toBe('Match these to your program, boat class and coach coverage. Saved in this browser for Dry Lake.');
  });

  it("puts the location's default in each placeholder, and off where a level has none", () => {
    open(PUTNEY_FILE);
    const p = page();
    initSettings(() => {});
    p.open();
    for (const k of FIELDS.filter(k => k !== 'waterOverride')) expect(p.form[k].placeholder, k).toBe(`Location default ${PUTNEY_VALUES[k]}`);
    // The dock reading has no location default: its own words stay.
    expect(p.form.waterOverride.placeholder).toBe('');
    const blank = clone(rec);
    blank.thresholds.rainCaution = null; blank.thresholds.aqiOff = '';
    open(recordFile(blank, DRY));
    p.open();
    expect(p.form.rainCaution.placeholder).toBe('Location default off');
    expect(p.form.aqiOff.placeholder).toBe('Location default off');
    expect(p.form.rainOff.placeholder).toBe('Location default 90');
  });

  it('shows the placeholders of the location that is open, not the one before', () => {
    const p = page();
    initSettings(() => {});
    open(PUTNEY_FILE);
    p.open();
    expect(p.form.windCaution.placeholder).toBe('Location default 10');
    open(LAKE_FILE);
    p.open();
    expect(p.form.windCaution.placeholder).toBe('Location default 12');
    expect(p.form.heading.placeholder).toBe('Location default 90');
    expect(p.form.flowCaution.placeholder).toBe('Location default off');
  });

  it('says "Your setting" under a field that is not at the default, and only then', () => {
    open(PUTNEY_FILE);
    const p = page();
    initSettings(() => {});
    p.open();
    for (const k of FIELDS.filter(k => k !== 'waterOverride')) expect(p.form[k].line.textContent, k).toBe('');
    p.type('windCaution', '8');
    expect(p.form.windCaution.line.textContent).toBe('Your setting. Location default 10.');
    expect(p.form.windOff.line.textContent).toBe('');
    p.type('windCaution', '10');
    expect(p.form.windCaution.line.textContent).toBe('');
    // A level turned off is a setting, and a blank where the default is blank is not.
    p.type('rainCaution', '');
    expect(p.form.rainCaution.line.textContent).toBe('Your setting. Location default 60.');
    p.type('flowOff', '30000');
    expect(p.form.flowOff.line.textContent).toBe('Your setting. Location default 28000.');
    p.type('heading', '20');
    expect(p.form.heading.line.textContent).toBe('Your setting. Location default 15.');
    // Text that is not a number says nothing.
    p.type('gustOff', 'abc');
    expect(p.form.gustOff.line.textContent).toBe('');
    // The dock reading has none.
    p.type('waterOverride', '55');
    expect(p.form.waterOverride.line).toBeNull();
  });

  it('says nothing for a blank level at a location whose default is blank, and something once it has a number', () => {
    const blank = clone(rec);
    blank.thresholds.rainCaution = null;
    open(recordFile(blank, DRY));
    const p = page();
    initSettings(() => {});
    p.open();
    expect(p.form.rainCaution.line.textContent).toBe('');
    p.type('rainCaution', '70');
    expect(p.form.rainCaution.line.textContent).toBe('Your setting. Location default off.');
  });

  it('describes each field by its line, and keeps one line for a field across openings', () => {
    open(PUTNEY_FILE);
    const p = page();
    initSettings(() => {});
    p.open();
    const line = p.form.windCaution.line;
    expect(line.id).toBe('own-windCaution');
    expect(line.className).toBe('own');
    expect(line.tag).toBe('small');
    expect(p.form.windCaution.attrs['aria-describedby']).toBe('own-windCaution');
    p.type('windCaution', '8');
    p.save();
    p.open();
    expect(p.form.windCaution.line).toBe(line);
    // Saved, 8 is now the viewer's, and the line still says so against the location's default.
    expect(p.form.windCaution.value).toBe('8');
    expect(line.textContent).toBe('Your setting. Location default 10.');
    expect(p.form.waterOverride.attrs['aria-describedby']).toBeUndefined();
  });

  it('draws the lines again when Use location defaults is chosen', () => {
    open(PUTNEY_FILE);
    const p = page();
    initSettings(() => {});
    p.open();
    p.type('windCaution', '8');
    p.type('flowCaution', '15000');
    p.reset();
    expect(p.shown()).toEqual(PUTNEY_VALUES);
    expect(p.form.windCaution.line.textContent).toBe('');
    expect(p.form.flowCaution.line.textContent).toBe('');
  });
});

describe('the reminder, worded for the limits the location has', () => {
  const words = p => p.els.setNudgeText.textContent;

  it("is today's sentence at Putney and leaves out river flow where there is no flow binding", () => {
    const p = page();
    initSettings(() => {});
    open(PUTNEY_FILE);
    refreshNudge();
    expect(words(p)).toBe('Set your own limits in Settings. Until you do, Go, Caution and Stay off use starting values for wind, gusts, rain, cold water and river flow.');
    open(NO_FLOW_FILE);
    refreshNudge();
    expect(words(p)).toBe('Set your own limits in Settings. Until you do, Go, Caution and Stay off use starting values for wind, gusts, rain and cold water.');
    // A location with its own flow row, on a waterway with none, has the word too.
    const own = clone(rec);
    own.waterway = DRY.id;
    own.sources = [...own.sources, { role: 'flow', mode: 'primary', adapter: 'usgs-ogc', ref: 'USGS-2', unit: 'cfs' }];
    open(recordFile(own, DRY));
    refreshNudge();
    expect(words(p)).toMatch(/cold water and river flow\.$/);
  });

  it('still shows and hides as before', () => {
    const p = page();
    open(NO_FLOW_FILE);
    refreshNudge();
    expect(p.el('setNudge').hidden).toBe(false);
  });
});

// A flow limit is saved with the gauge it was set for, and a limit for another gauge is not used and
// not lost (01 11.1).
describe('flow limits and their gauge', () => {
  const FLOW_SAVED = { flowCaution: 15000, flowOff: 30000 };
  const dialog = overrides => {
    openLocation(PUTNEY_FILE, overrides);
    const p = page();
    initSettings(() => {});
    p.open();
    return p;
  };

  it('saves the gauge with a flow limit, and no gauge without one', () => {
    let p = dialog({});
    p.type('flowCaution', '15000');
    p.save();
    expect(saved()['putney-landing'].values).toEqual({ flowCaution: 15000, limitBasis: { flow: GAUGE } });
    expect(app.overrides).toEqual({ flowCaution: 15000, limitBasis: { flow: GAUGE } });
    // A change elsewhere keeps the limit and its gauge.
    p = dialog(saved()['putney-landing'].values);
    p.type('windCaution', '8');
    p.save();
    expect(saved()['putney-landing'].values).toEqual({ windCaution: 8, flowCaution: 15000, limitBasis: { flow: GAUGE } });
    // Back at the location's limits, nothing is kept: no limit, and no gauge.
    p = dialog(saved()['putney-landing'].values);
    p.type('flowCaution', '20000');
    p.save();
    expect(saved()['putney-landing'].values).toEqual({ windCaution: 8 });
  });

  it('puts the gauge on a limit saved before gauges were named, the next time anything is saved', () => {
    const p = dialog(FLOW_SAVED);
    expect(p.shown()).toMatchObject({ flowCaution: '15000', flowOff: '30000' });
    p.type('windOff', '14');
    p.save();
    expect(saved()['putney-landing'].values).toEqual({ ...FLOW_SAVED, windOff: 14, limitBasis: { flow: GAUGE } });
  });

  it('a limit for the gauge the location has is shown and kept', () => {
    const p = dialog({ ...FLOW_SAVED, limitBasis: { flow: GAUGE } });
    expect(p.shown()).toMatchObject({ flowCaution: '15000', flowOff: '30000' });
    expect(p.els.setFlow.innerHTML).not.toContain('Your flow limits were for');
    p.save();
    expect(saved()['putney-landing'].values).toEqual({ ...FLOW_SAVED, limitBasis: { flow: GAUGE } });
  });

  describe('set for another gauge', () => {
    const OLD = { ...FLOW_SAVED, windCaution: 8, limitBasis: { flow: OTHER } };

    it('shows the location\'s limits and the note, and not the viewer\'s', () => {
      const p = dialog(OLD);
      expect(p.shown()).toMatchObject({ windCaution: '8', flowCaution: '20000', flowOff: '28000' });
      expect(p.els.setFlow.innerHTML).toContain('<p class="note" style="margin:.4rem 0 0">Your flow limits were for a different gauge. Set them again for this gauge.</p>');
      // The note comes before the words about the gauge's history.
      expect(p.els.setFlow.innerHTML.indexOf('Your flow limits were')).toBeLessThan(p.els.setFlow.innerHTML.indexOf('Since 2016'));
      expect(p.form.flowCaution.line.textContent).toBe('');
    });

    it("names the gauge when a row still has it", () => {
      // The location's gauge is now another one, and the old one is a retired row with its name.
      const way = { ...PUTNEY_WATERWAY, sources: PUTNEY_WATERWAY.sources.map(b => (b.role === 'flow' ? { ...b, ref: 'USGS-01154501', label: 'Bellows Falls' } : b)) };
      const file = recordFile({ ...clone(PUTNEY_RECORD), thresholds: { ...PUTNEY_RECORD.thresholds, basis: { flow: 'usgs-ogc:USGS-01154501:cfs' } }, sources: [...PUTNEY_RECORD.sources, { role: 'flow', mode: 'primary', adapter: 'usgs-ogc', ref: 'USGS-01154501', unit: 'cfs', label: 'Bellows Falls' }, { role: 'flow', mode: 'fallback', status: 'retired', adapter: 'usgs-ogc', ref: 'USGS-01154500', unit: 'cfs', label: 'North Walpole' }] }, way);
      openLocation(file, { flowCaution: 4000, limitBasis: { flow: GAUGE } });
      const p = page();
      initSettings(() => {});
      p.open();
      expect(p.els.setFlow.innerHTML).toContain('<legend>River flow at Bellows Falls, cfs</legend>');
      expect(p.els.setFlow.innerHTML).toContain('Your flow limits were for the North Walpole gauge. Set them again for this gauge.');
    });

    it('keeps them when something else is saved', () => {
      const p = dialog(OLD);
      p.type('windOff', '14');
      p.save();
      expect(saved()['putney-landing'].values).toEqual({ ...OLD, windOff: 14 });
      // And again, from what was saved.
      const q = dialog(saved()['putney-landing'].values);
      q.save();
      expect(saved()['putney-landing'].values).toEqual({ ...OLD, windOff: 14 });
    });

    it('keeps them when saved unchanged', () => {
      dialog(OLD).save();
      expect(saved()['putney-landing'].values).toEqual(OLD);
    });

    it('drops them for new limits at this gauge, with this gauge', () => {
      const p = dialog(OLD);
      p.type('flowOff', '30000');
      p.save();
      expect(saved()['putney-landing'].values).toEqual({ windCaution: 8, flowOff: 30000, limitBasis: { flow: GAUGE } });
    });

    it('drops them when the viewer sets the location\'s own values in the flow fields', () => {
      const p = dialog(OLD);
      p.type('flowCaution', '20000');
      p.save();
      expect(saved()['putney-landing'].values).toEqual({ windCaution: 8 });
    });

    it('drops them for Use location defaults', () => {
      const p = dialog(OLD);
      p.reset();
      expect(p.shown()).toEqual(PUTNEY_VALUES);
      p.save();
      expect(saved()['putney-landing'].values).toEqual({});
    });

    it('keeps them where the location has no flow binding at all, and the dialog has no flow fields to change', () => {
      openLocation(NO_FLOW_FILE, OLD);
      const p = page();
      initSettings(() => {});
      p.open();
      expect(p.form.flowCaution).toBeUndefined();
      p.type('windOff', '14');
      p.save();
      expect(saved()['some-lake'].values).toEqual({ ...OLD, windOff: 14 });
    });

    it('is no longer kept once the dialog has been opened on another location', () => {
      // The flag is read on each opening: Putney's, then a place with no stored limits.
      let p = dialog(OLD);
      openLocation(LAKE_FILE, {});
      p.open();
      p.type('windOff', '14');
      p.save();
      expect(saved()['some-lake'].values).toEqual({ windOff: 14 });
    });
  });

  it('keeps a limit saved at a location with no flow binding, which has no basis to name', () => {
    openLocation(NO_FLOW_FILE, FLOW_SAVED);
    const p = page();
    initSettings(() => {});
    p.open();
    p.save();
    expect(saved()['some-lake'].values).toEqual(FLOW_SAVED);
  });
});
