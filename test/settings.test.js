// The Settings dialog (src/settings.js) against a fake page. What it fills,
// what Reset restores and what Save keeps are the defaults of the location
// shown (FD8), not Putney's. Only what differs from them is stored.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { app } from '../src/state.js';
import { initSettings } from '../src/settings.js';
import { PUTNEY, PUTNEY_DEFAULTS, PUTNEY_RECORD, PUTNEY_WATERWAY } from '../src/putney.js';
import { resolveLocation, effectiveSettings } from '../src/location.js';

const NOW = 1760700000000;
// The 13 fields of the form, written out.
const FIELDS = ['heading', 'windCaution', 'windOff', 'gustCaution', 'gustOff', 'rainCaution', 'rainOff', 'coldCombined', 'waterOverride', 'flowCaution', 'flowOff', 'aqiCaution', 'aqiOff'];

// A place that is not Putney: heading 90, wind caution 12 and no flow limits.
const clone = o => JSON.parse(JSON.stringify(o));
const rec = clone(PUTNEY_RECORD);
rec.slug = 'some-lake'; rec.course.heading = 90; rec.thresholds.windCaution = 12;
delete rec.thresholds.flowCaution; delete rec.thresholds.flowOff; rec.flow = null;
const LAKE = resolveLocation(rec, { waterway: PUTNEY_WATERWAY });
const LAKE_DEFAULTS = { ...effectiveSettings(LAKE), heading: LAKE.course.heading };

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
// The location the page shows: its resolved record, the limits in force and its defaults.
function show(loc, settings, defaults) {
  Object.assign(app, { loc, settings, defaults });
}

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
  show(PUTNEY, effectiveSettings(PUTNEY), PUTNEY_DEFAULTS);
});

const saved = () => JSON.parse(map.get('rowhether-settings-v2'));

describe('Settings at Putney', () => {
  it('opens on its limits and keeps nothing when saved unchanged', () => {
    show(PUTNEY, effectiveSettings(PUTNEY), PUTNEY_DEFAULTS);
    const p = page(), onSave = vi.fn();
    initSettings(onSave);
    p.open();
    expect(p.shown()).toEqual({ heading: '15', windCaution: '10', windOff: '15', gustCaution: '18', gustOff: '25', rainCaution: '60', rainOff: '90', coldCombined: '100', waterOverride: '', flowCaution: '20000', flowOff: '28000', aqiCaution: '151', aqiOff: '201' });
    p.save();
    expect(saved()).toEqual({ 'putney-landing': { saved: NOW, values: {} } });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('keeps only the field that was changed', () => {
    show(PUTNEY, effectiveSettings(PUTNEY), PUTNEY_DEFAULTS);
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
    show(LAKE, effectiveSettings(LAKE), LAKE_DEFAULTS);
    const p = page();
    initSettings(() => {});
    p.open();
    expect(p.shown()).toMatchObject({ heading: '90', windCaution: '12', windOff: '15', flowCaution: '', flowOff: '' });
  });

  it("stores nothing when saved unchanged, so a later fix to the place's limits still reaches the viewer", () => {
    show(LAKE, effectiveSettings(LAKE), LAKE_DEFAULTS);
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
    // Saving puts Putney back in app (state.js has no other place yet), so each save starts from the place again.
    const saveWith = changes => {
      show(LAKE, effectiveSettings(LAKE), LAKE_DEFAULTS);
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
    show(LAKE, effectiveSettings(LAKE), LAKE_DEFAULTS);
    const p = page();
    initSettings(() => {});
    p.open();
    for (const k of FIELDS) p.form[k].value = '33';
    p.reset();
    expect(p.shown()).toEqual(Object.fromEntries(FIELDS.map(k => [k, String(LAKE_DEFAULTS[k])])));
    expect(p.shown()).toMatchObject({ heading: '90', windCaution: '12', flowCaution: '', flowOff: '' });
  });

  it("Reset at Putney puts back Putney's numbers", () => {
    show(PUTNEY, effectiveSettings(PUTNEY), PUTNEY_DEFAULTS);
    const p = page();
    initSettings(() => {});
    p.open();
    for (const k of FIELDS) p.form[k].value = '33';
    p.reset();
    expect(p.shown()).toMatchObject({ heading: '15', windCaution: '10', flowCaution: '20000', flowOff: '28000' });
  });
});
