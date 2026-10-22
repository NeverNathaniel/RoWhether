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

// A place that is not Putney: heading 90, wind caution 12 and no flow limits, as the build writes it.
const clone = o => JSON.parse(JSON.stringify(o));
const rec = clone(PUTNEY_RECORD);
rec.slug = 'some-lake'; rec.course.heading = 90; rec.thresholds.windCaution = 12;
delete rec.thresholds.flowCaution; delete rec.thresholds.flowOff; rec.flow = null;
const LAKE_FILE = recordFile(rec, PUTNEY_WATERWAY);
const LAKE = resolveLocation(rec, { waterway: PUTNEY_WATERWAY });
const LAKE_DEFAULTS = { ...effectiveSettings(LAKE), heading: LAKE.course.heading };
const PUTNEY_VALUES = { heading: '15', windCaution: '10', windOff: '15', gustCaution: '18', gustOff: '25', rainCaution: '60', rainOff: '90', coldCombined: '100', waterOverride: '', flowCaution: '20000', flowOff: '28000', aqiCaution: '151', aqiOff: '201' };

// A page with the dialog's elements. Each element keeps the listeners it was given.
function page() {
  const els = {};
  const el = id => (els[id] ??= { id, hidden: false, on: {}, addEventListener(type, fn) { this.on[type] = fn; } });
  // An input's value is always a string, as in the browser.
  const input = () => { let v = ''; return { get value() { return v; }, set value(x) { v = String(x ?? ''); } }; };
  el('setForm').elements = Object.fromEntries(FIELDS.map(k => [k, input()]));
  el('settings').showModal = () => {};
  vi.stubGlobal('document', { getElementById: el });
  const form = els.setForm.elements;
  return {
    el, form,
    shown: () => Object.fromEntries(FIELDS.map(k => [k, form[k].value])),
    open: () => els.settingsBtn.on.click(),
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
    ['flow: stay off under caution is raised to it', { flowCaution: '30000', flowOff: '25000' }, { flowCaution: 30000, flowOff: 30000 }],
    ['rain chance: stay off under caution is raised to it', { rainCaution: '80', rainOff: '70' }, { rainCaution: 80, rainOff: 80 }],
    ['air quality: stay off under caution is raised to it', { aqiCaution: '200', aqiOff: '120' }, { aqiCaution: 200, aqiOff: 200 }],
    ['wind: stay off at its caution is kept', { windCaution: '12', windOff: '12' }, { windCaution: 12, windOff: 12 }],
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
