// Storage keys and the one-time move from putney-rowing-* (08 8.3, P0.7).
//
// Two rules from the phase 0 review (Z7, Z8). The stub behaves like Storage
// (a missing key is null, values are strings, length and key(i), keys that
// Object.keys lists), so a migration that passes here does not fail in a
// browser on a difference between the stub and the real thing. And every key is
// written out as a string literal, never read from KEYS or OLD_KEYS, so a typo
// in src/config.js disagrees with this file and fails. One test compares the
// two tables to the same literals.
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { KEYS, OLD_KEYS, OLD_PUTNEY_DEFAULTS, CACHE_MAX, RECENT_MAX } from '../src/config.js';
import {
  migrateStorage, loadOverrides, saveOverrides, hasSavedSettings, nudgeDismissed, dismissNudge,
  loadCache, saveCache, loadPlan, savePlan, loadInstall, saveInstall,
  loadRecord, saveRecord, loadLast, saveLast, touchCache, trimCaches, loadRecent, pushRecent,
  pickHintDismissed, dismissPickHint
} from '../src/storage.js';
import { overridesOf } from '../src/location.js';
import { PUTNEY_DEFAULTS } from '../src/putney.js';
import { PUTNEY_FILE } from './helpers/putney-file.js';

const NOW = 1760700000000;

// A Storage that works like the browser's. `fail(op, key)` makes an operation
// throw (op is 'get', 'set', 'key'): a set throws QuotaExceededError, or the
// Error that `fail` returns; `log` lists every get and set as [op, key].
function makeStorage(seed = {}, fail = () => false) {
  const map = new Map(Object.entries(seed).map(([k, v]) => [k, String(v)]));
  const log = [];
  const api = {
    getItem(k) { log.push(['get', String(k)]); if (fail('get', String(k))) throw new Error('read failed'); return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) {
      log.push(['set', String(k)]);
      const f = fail('set', String(k));
      if (f) throw f instanceof Error ? f : new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      map.set(String(k), String(v));
    },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
    key(i) { if (fail('key', String(i))) throw new Error('key failed'); return [...map.keys()][i] ?? null; }
  };
  const store = new Proxy(api, {
    get: (t, p) => (p === 'length' ? map.size : p in t ? t[p] : map.get(p)),
    ownKeys: () => [...map.keys()],
    getOwnPropertyDescriptor: (t, p) => (map.has(p) ? { value: map.get(p), enumerable: true, configurable: true, writable: true } : undefined)
  });
  return { store, map, log, dump: () => Object.fromEntries(map) };
}

// A Storage whose every call throws, as when site data is blocked.
function brokenStorage() {
  const boom = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
  return { getItem: boom, setItem: boom, removeItem: boom, key: boom, clear: boom, get length() { return boom(); } };
}

// A failure for the first matching call only.
const once = match => { let spent = false; return (op, key) => { if (spent || !match(op, key)) return false; return (spent = true); }; };
// A failure for the first n matching calls, with the error to throw (a set throws QuotaExceededError when none).
const times = (n, match, err = true) => { let left = n; return (op, key) => { if (left <= 0 || !match(op, key)) return false; left--; return err; }; };

let ls;
const use = (seed, fail) => { ls = makeStorage(seed, fail); vi.stubGlobal('localStorage', ls.store); return ls; };

beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(NOW); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// What an old build wrote: settings typed in the dialog (the dock reading as
// text), a cache from a load, Plan a row, the install bar and the reminder.
const OLD_SETTINGS = { heading: 20, windCaution: 8, windOff: 15, gustCaution: 18, gustOff: 25, rainCaution: '', rainOff: 90, coldCombined: 100, flowCaution: 20000, flowOff: 28000, waterOverride: '55', aqiCaution: 151, aqiOff: 201 };
const OLD_CACHE = JSON.stringify({ data: { wx: { hourly: { time: [1, 2, 3] } }, river: { flow: { v: 9000, t: 1 } } }, updated: 1760690000000 });
const OLD_PLAN = JSON.stringify({ minutes: 120, when: 'afternoon' });
const OLD_INSTALL = JSON.stringify({ dismissed: 5, never: true });
const oldKeys = () => ({
  'putney-rowing-settings-v1': JSON.stringify(OLD_SETTINGS),
  'putney-rowing-cache-v1': OLD_CACHE,
  'putney-rowing-plan-v1': OLD_PLAN,
  'putney-rowing-install-v2': OLD_INSTALL,
  'putney-rowing-nudge-v1': '1'
});
// Putney's settings as an old build stored them when nothing was changed.
const OLD_DEFAULTS = { heading: 15, windCaution: 10, windOff: 15, gustCaution: 18, gustOff: 25, rainCaution: 60, rainOff: 90, coldCombined: 100, flowCaution: 20000, flowOff: 28000, waterOverride: '', aqiCaution: 151, aqiOff: 201 };
const putneySettings = values => JSON.stringify({ 'putney-landing': { saved: NOW, values } });

describe('the key tables', () => {
  it('name the keys 08 8.2 and 8.3 list', () => {
    expect({ ...KEYS, cache: KEYS.cache('putney-landing'), loc: KEYS.loc('putney-landing') }).toEqual({
      settings: 'rowhether-settings-v2',
      cache: 'rowhether-cache-v2:putney-landing',
      plan: 'rowhether-plan-v1',
      install: 'rowhether-install-v1',
      nudge: 'rowhether-nudge-v1',
      migrated: 'rowhether-migrated-v1',
      last: 'rowhether-last-v1',
      loc: 'rowhether-loc-v1:putney-landing',
      cacheIndex: 'rowhether-cache-index-v1',
      recent: 'rowhether-recent-v1',
      pickhint: 'rowhether-pickhint-v1'
    });
    expect(KEYS.cache('at:42.961,-72.522')).toBe('rowhether-cache-v2:at:42.961,-72.522');
    expect(KEYS.loc('lake-natoma')).toBe('rowhether-loc-v1:lake-natoma');
    // 07 9.2 keeps 10 locations and 01 8.6 keeps 8 recent ones. The tests below write the numbers out.
    expect(CACHE_MAX).toBe(10);
    expect(RECENT_MAX).toBe(8);
    expect(OLD_KEYS).toEqual({
      settings: 'putney-rowing-settings-v1',
      cache: 'putney-rowing-cache-v1',
      plan: 'putney-rowing-plan-v1',
      install: 'putney-rowing-install-v2',
      nudge: 'putney-rowing-nudge-v1'
    });
  });
});

describe('the test stub', () => {
  it('works like Storage', () => {
    const { store } = makeStorage({ a: 1 });
    expect(store.getItem('missing')).toBeNull();
    expect(store.getItem('a')).toBe('1');
    store.setItem('b', 2);
    store.setItem('c', { x: 1 });
    expect(store.getItem('b')).toBe('2');
    expect(store.getItem('c')).toBe('[object Object]');
    expect(store.length).toBe(3);
    expect(store.key(0)).toBe('a');
    expect(store.key(9)).toBeNull();
    expect(Object.keys(store)).toEqual(['a', 'b', 'c']);
    store.removeItem('a');
    expect(Object.keys(store)).toEqual(['b', 'c']);
  });
});

describe('migrateStorage', () => {
  it('moves a full set of old keys', () => {
    use(oldKeys());
    migrateStorage();
    const s = ls.dump();
    // Settings: what differs from Putney's defaults, the dock reading as a number.
    expect(JSON.parse(s['rowhether-settings-v2'])).toEqual({
      'putney-landing': { saved: NOW, values: { heading: 20, windCaution: 8, rainCaution: '', waterOverride: 55 } }
    });
    // Cache, plan, install and the reminder: the same text.
    expect(s['rowhether-cache-v2:putney-landing']).toBe(OLD_CACHE);
    expect(s['rowhether-plan-v1']).toBe(OLD_PLAN);
    expect(s['rowhether-install-v1']).toBe(OLD_INSTALL);
    expect(JSON.parse(s['rowhether-install-v1'])).toEqual({ dismissed: 5, never: true });
    expect(s['rowhether-nudge-v1']).toBe('1');
    expect(s['rowhether-last-v1']).toBe('putney-landing');
    expect(s['rowhether-migrated-v1']).toBe('1');
    expect(Object.keys(s).sort()).toEqual([
      'putney-rowing-cache-v1', 'putney-rowing-install-v2', 'putney-rowing-nudge-v1', 'putney-rowing-plan-v1', 'putney-rowing-settings-v1',
      'rowhether-cache-v2:putney-landing', 'rowhether-install-v1', 'rowhether-last-v1', 'rowhether-migrated-v1', 'rowhether-nudge-v1', 'rowhether-plan-v1', 'rowhether-settings-v2'
    ]);
  });

  it('leaves the old keys where they are', () => {
    const before = oldKeys();
    use(before);
    migrateStorage();
    const s = ls.dump();
    for (const [k, v] of Object.entries(before)) expect(s[k]).toBe(v);
  });

  it('changes nothing the second time', () => {
    use(oldKeys());
    migrateStorage();
    const after = ls.dump();
    ls.log.length = 0;
    migrateStorage();
    migrateStorage();
    expect(ls.dump()).toEqual(after);
    // Only the marker is read, and nothing is written.
    expect(ls.log).toEqual([['get', 'rowhether-migrated-v1'], ['get', 'rowhether-migrated-v1']]);
  });

  it('does not look at old keys again once the marker is set', () => {
    use({ ...oldKeys(), 'rowhether-migrated-v1': '1' });
    migrateStorage();
    const s = ls.dump();
    expect(s['rowhether-settings-v2']).toBeUndefined();
    expect(s['rowhether-cache-v2:putney-landing']).toBeUndefined();
    expect(s['rowhether-last-v1']).toBeUndefined();
  });

  it('keeps a setting saved after a failed step, and finishes on the next run', () => {
    // The copy of the cache (the third step) throws once.
    use(oldKeys(), once((op, key) => op === 'set' && key === 'rowhether-cache-v2:putney-landing'));
    migrateStorage();
    expect(ls.map.has('rowhether-migrated-v1')).toBe(false);
    expect(ls.map.has('rowhether-cache-v2:putney-landing')).toBe(false);
    // The other steps did not wait for it.
    expect(ls.map.has('rowhether-settings-v2')).toBe(true);
    expect(ls.map.has('rowhether-plan-v1')).toBe(true);

    // Between the two runs the viewer saves a setting and a plan.
    saveOverrides('putney-landing', { windCaution: 12 });
    savePlan({ minutes: 60, when: 'morning' });

    migrateStorage();
    const s = ls.dump();
    expect(JSON.parse(s['rowhether-settings-v2'])['putney-landing'].values).toEqual({ windCaution: 12 });
    expect(JSON.parse(s['rowhether-plan-v1'])).toEqual({ minutes: 60, when: 'morning' });
    expect(s['rowhether-cache-v2:putney-landing']).toBe(OLD_CACHE);
    expect(s['rowhether-install-v1']).toBe(OLD_INSTALL);
    expect(s['rowhether-nudge-v1']).toBe('1');
    expect(s['rowhether-last-v1']).toBe('putney-landing');
    expect(s['rowhether-migrated-v1']).toBe('1');
  });

  it('keeps going when the settings step fails, and does not set the marker', () => {
    use(oldKeys(), once((op, key) => op === 'set' && key === 'rowhether-settings-v2'));
    migrateStorage();
    expect(ls.map.has('rowhether-settings-v2')).toBe(false);
    expect(ls.map.has('rowhether-cache-v2:putney-landing')).toBe(true);
    expect(ls.map.has('rowhether-migrated-v1')).toBe(false);
    migrateStorage();
    expect(JSON.parse(ls.map.get('rowhether-settings-v2'))['putney-landing'].values).toEqual({ heading: 20, windCaution: 8, rainCaution: '', waterOverride: 55 });
    expect(ls.map.get('rowhether-migrated-v1')).toBe('1');
  });

  it('keeps retrying while a step keeps failing, and loses nothing', () => {
    use(oldKeys(), (op, key) => op === 'set' && key === 'rowhether-cache-v2:putney-landing');
    for (let i = 0; i < 3; i++) migrateStorage();
    expect(ls.map.has('rowhether-migrated-v1')).toBe(false);
    expect(ls.map.get('putney-rowing-cache-v1')).toBe(OLD_CACHE);
  });

  it('turns a typed dock reading into a number and drops text that is not one', () => {
    const run = waterOverride => {
      use({ 'putney-rowing-settings-v1': JSON.stringify({ ...OLD_DEFAULTS, waterOverride }) });
      migrateStorage();
      return JSON.parse(ls.map.get('rowhether-settings-v2'))['putney-landing'].values;
    };
    expect(run('55')).toEqual({ waterOverride: 55 });
    expect(run('55.5')).toEqual({ waterOverride: 55.5 });
    expect(run(' 48 ')).toEqual({ waterOverride: 48 });
    expect(run(60)).toEqual({ waterOverride: 60 });
    expect(run('abc')).toEqual({});
    expect(run('')).toEqual({});
    expect(run(null)).toEqual({});
    expect(run('Infinity')).toEqual({});
  });

  it('does not read putney-rowing-install-v1', () => {
    use({ 'putney-rowing-install-v1': JSON.stringify({ dismissedAt: NOW }), 'putney-rowing-install-v2': OLD_INSTALL });
    migrateStorage();
    expect(ls.log.map(([, k]) => k)).not.toContain('putney-rowing-install-v1');
    expect(ls.map.get('rowhether-install-v1')).toBe(OLD_INSTALL);
    // And with only the v1 key, there is nothing to copy.
    use({ 'putney-rowing-install-v1': JSON.stringify({ dismissedAt: NOW }) });
    migrateStorage();
    expect(ls.log.map(([, k]) => k)).not.toContain('putney-rowing-install-v1');
    expect(ls.map.has('rowhether-install-v1')).toBe(false);
    expect(loadInstall()).toEqual({ dismissed: 0, never: false });
  });

  it('keeps the reminder hidden for settings that equal the defaults', () => {
    use({ 'putney-rowing-settings-v1': JSON.stringify(OLD_DEFAULTS) });
    migrateStorage();
    expect(JSON.parse(ls.map.get('rowhether-settings-v2'))).toEqual({ 'putney-landing': { saved: NOW, values: {} } });
    expect(hasSavedSettings('putney-landing')).toBe(true);
    expect(loadOverrides('putney-landing')).toEqual({});
  });

  it('keeps a blank level as a real override and compares numbers as numbers', () => {
    use({ 'putney-rowing-settings-v1': JSON.stringify({ ...OLD_DEFAULTS, rainCaution: '', rainOff: '', aqiCaution: '', aqiOff: '', windCaution: 10, gustOff: 25.5, heading: 15 }) });
    migrateStorage();
    expect(JSON.parse(ls.map.get('rowhether-settings-v2'))['putney-landing'].values).toEqual({ rainCaution: '', rainOff: '', aqiCaution: '', aqiOff: '', gustOff: 25.5 });
  });

  it('takes an old file with keys missing, extra or of the wrong type', () => {
    use({ 'putney-rowing-settings-v1': JSON.stringify({ windCaution: 12, windOff: '20', gustCaution: null, rainCaution: NaN, streamCaution: 4, flowOff: 30000, junk: true }) });
    migrateStorage();
    // Missing keys are the defaults. A string, null and an unknown key are dropped.
    expect(JSON.parse(ls.map.get('rowhether-settings-v2'))['putney-landing'].values).toEqual({ windCaution: 12, flowOff: 30000 });
  });

  it('treats unreadable old settings as no changes, and still finishes', () => {
    for (const bad of ['{not json', 'null', '"text"', '[1,2]']) {
      use({ 'putney-rowing-settings-v1': bad });
      migrateStorage();
      expect(JSON.parse(ls.map.get('rowhether-settings-v2'))).toEqual({ 'putney-landing': { saved: NOW, values: {} } });
      expect(ls.map.get('rowhether-migrated-v1')).toBe('1');
    }
  });

  it('sets only the marker for someone with no old keys', () => {
    use({});
    migrateStorage();
    expect(ls.dump()).toEqual({ 'rowhether-migrated-v1': '1' });
    expect(loadCache('putney-landing')).toBeNull();
    expect(hasSavedSettings('putney-landing')).toBe(false);
  });

  it('opens on Putney for anyone with any old key', () => {
    for (const k of Object.keys(oldKeys())) {
      use({ [k]: k === 'putney-rowing-settings-v1' ? '{}' : '1' });
      migrateStorage();
      expect(ls.map.get('rowhether-last-v1'), k).toBe('putney-landing');
    }
    use({ 'other-app-key': '1' });
    migrateStorage();
    expect(ls.map.has('rowhether-last-v1')).toBe(false);
  });

  it('never overwrites a target that is already there', () => {
    use({
      ...oldKeys(),
      'rowhether-settings-v2': putneySettings({ windOff: 14 }),
      'rowhether-cache-v2:putney-landing': '{"data":{"x":1},"updated":5}',
      'rowhether-plan-v1': '{"minutes":60,"when":"any"}',
      'rowhether-install-v1': '{"dismissed":1,"never":false}',
      'rowhether-nudge-v1': '1',
      'rowhether-last-v1': 'lake-natoma'
    });
    migrateStorage();
    const s = ls.dump();
    expect(s['rowhether-settings-v2']).toBe(putneySettings({ windOff: 14 }));
    expect(s['rowhether-cache-v2:putney-landing']).toBe('{"data":{"x":1},"updated":5}');
    expect(s['rowhether-plan-v1']).toBe('{"minutes":60,"when":"any"}');
    expect(s['rowhether-install-v1']).toBe('{"dismissed":1,"never":false}');
    expect(s['rowhether-last-v1']).toBe('lake-natoma');
    expect(s['rowhether-migrated-v1']).toBe('1');
  });

  it('moves what exists and skips what does not', () => {
    use({ 'putney-rowing-plan-v1': OLD_PLAN });
    migrateStorage();
    expect(ls.dump()).toEqual({
      'putney-rowing-plan-v1': OLD_PLAN,
      'rowhether-plan-v1': OLD_PLAN,
      'rowhether-last-v1': 'putney-landing',
      'rowhether-migrated-v1': '1'
    });
  });

  it('does not touch other storage', () => {
    use({ ...oldKeys(), theme: 'dark', 'rowhether-units-v1': '{}' });
    migrateStorage();
    expect(ls.map.get('theme')).toBe('dark');
    expect(ls.map.get('rowhether-units-v1')).toBe('{}');
  });

  it('is run by every loader', () => {
    const loaders = {
      loadOverrides: () => loadOverrides('putney-landing'),
      hasSavedSettings: () => hasSavedSettings('putney-landing'),
      nudgeDismissed: () => nudgeDismissed(),
      loadCache: () => loadCache('putney-landing'),
      loadPlan: () => loadPlan(),
      loadInstall: () => loadInstall(),
      loadRecord: () => loadRecord('putney-landing'),
      loadLast: () => loadLast(),
      loadRecent: () => loadRecent(),
      pickHintDismissed: () => pickHintDismissed()
    };
    for (const [name, load] of Object.entries(loaders)) {
      use(oldKeys());
      load();
      expect(ls.map.get('rowhether-migrated-v1'), name).toBe('1');
    }
  });
});

describe('after the move, the loaders read the old values', () => {
  it('gives the viewer back what they saved', () => {
    use(oldKeys());
    expect(loadOverrides('putney-landing')).toEqual({ heading: 20, windCaution: 8, rainCaution: '', waterOverride: 55 });
    expect(hasSavedSettings('putney-landing')).toBe(true);
    expect(nudgeDismissed()).toBe(true);
    expect(loadCache('putney-landing')).toEqual(JSON.parse(OLD_CACHE));
    expect(loadPlan()).toEqual({ minutes: 120, when: 'afternoon' });
    expect(loadInstall()).toEqual({ dismissed: 5, never: true });
  });
});

describe('settings overrides', () => {
  it('overridesOf keeps what differs from Putney, blanks included, numbers as numbers', () => {
    const defaults = { heading: 15, windCaution: 10, windOff: 15, gustCaution: 18, gustOff: 25, rainCaution: 60, rainOff: 90, coldCombined: 100, waterOverride: '', flowCaution: 20000, flowOff: 28000, aqiCaution: 151, aqiOff: 201 };
    expect(overridesOf(defaults, defaults)).toEqual({});
    expect(overridesOf({ ...defaults, heading: 20, windCaution: 8, rainCaution: '', waterOverride: 55, flowCaution: 20000.5 }, defaults)).toEqual({ heading: 20, windCaution: 8, rainCaution: '', waterOverride: 55, flowCaution: 20000.5 });
    // A blank where the default is blank is not an override; a blank where it is a number is.
    expect(overridesOf({ ...defaults, waterOverride: '' }, defaults)).toEqual({});
    expect(overridesOf({ ...defaults, aqiOff: '' }, defaults)).toEqual({ aqiOff: '' });
    // Keys the settings do not know, and missing keys, are ignored.
    expect(overridesOf({ windCaution: 11, streamCaution: 3 }, defaults)).toEqual({ windCaution: 11 });
  });

  it('saveOverrides writes saved and values for that location and keeps the others', () => {
    use({ 'rowhether-settings-v2': JSON.stringify({ 'lake-natoma': { saved: 5, values: { windOff: 20 } } }) });
    saveOverrides('putney-landing', { windCaution: 8 });
    expect(JSON.parse(ls.map.get('rowhether-settings-v2'))).toEqual({
      'lake-natoma': { saved: 5, values: { windOff: 20 } },
      'putney-landing': { saved: NOW, values: { windCaution: 8 } }
    });
    saveOverrides('putney-landing', { windCaution: 9 });
    expect(JSON.parse(ls.map.get('rowhether-settings-v2'))['putney-landing']).toEqual({ saved: NOW, values: { windCaution: 9 } });
    expect(loadOverrides('putney-landing')).toEqual({ windCaution: 9 });
    expect(loadOverrides('lake-natoma')).toEqual({ windOff: 20 });
    expect(loadOverrides('nowhere')).toEqual({});
  });

  it('saving unchanged settings stores no values and still hides the reminder', () => {
    use({});
    expect(hasSavedSettings('putney-landing')).toBe(false);
    const defaults = { heading: 15, windCaution: 10, windOff: 15, gustCaution: 18, gustOff: 25, rainCaution: 60, rainOff: 90, coldCombined: 100, waterOverride: '', flowCaution: 20000, flowOff: 28000, aqiCaution: 151, aqiOff: 201 };
    saveOverrides('putney-landing', overridesOf(defaults, defaults));
    expect(JSON.parse(ls.map.get('rowhether-settings-v2'))).toEqual({ 'putney-landing': { saved: NOW, values: {} } });
    expect(hasSavedSettings('putney-landing')).toBe(true);
    expect(hasSavedSettings('lake-natoma')).toBe(false);
  });

  it('reads a damaged settings key as no changes', () => {
    for (const bad of ['{not json', 'null', '7', '"x"', '{"putney-landing":null}', '{"putney-landing":{"saved":1,"values":5}}']) {
      use({ 'rowhether-migrated-v1': '1', 'rowhether-settings-v2': bad });
      expect(loadOverrides('putney-landing'), bad).toEqual({});
    }
    // And saving over it works.
    use({ 'rowhether-migrated-v1': '1', 'rowhether-settings-v2': '{not json' });
    saveOverrides('putney-landing', { windCaution: 8 });
    expect(loadOverrides('putney-landing')).toEqual({ windCaution: 8 });
  });

  it('gives a copy, so a caller cannot change what is stored', () => {
    use({ 'rowhether-migrated-v1': '1', 'rowhether-settings-v2': putneySettings({ windCaution: 8 }) });
    loadOverrides('putney-landing').windCaution = 99;
    expect(loadOverrides('putney-landing')).toEqual({ windCaution: 8 });
  });

  it('keeps the gauge a flow limit was set for with the limit (01 11.1)', () => {
    use({});
    const values = { windCaution: 8, flowCaution: 15000, flowOff: 30000, limitBasis: { flow: 'usgs-ogc:USGS-01154500:cfs' } };
    saveOverrides('putney-landing', values);
    expect(JSON.parse(ls.map.get('rowhether-settings-v2'))['putney-landing'].values).toEqual(values);
    expect(loadOverrides('putney-landing')).toEqual(values);
    // Saving again with no flow limit leaves no basis behind, and the other location keeps its own.
    saveOverrides('lake-natoma', { limitBasis: { flow: 'x:y:cfs' }, flowOff: 1 });
    saveOverrides('putney-landing', { windCaution: 8 });
    expect(loadOverrides('putney-landing')).toEqual({ windCaution: 8 });
    expect(loadOverrides('lake-natoma')).toEqual({ limitBasis: { flow: 'x:y:cfs' }, flowOff: 1 });
  });
});

describe('cache, plan, install and the reminder', () => {
  it('keeps the cache per location under the new key', () => {
    use({ 'rowhether-migrated-v1': '1' });
    saveCache('putney-landing', { wx: { a: 1 } }, 123);
    saveCache('lake-natoma', { wx: { a: 2 } }, 456);
    expect(JSON.parse(ls.map.get('rowhether-cache-v2:putney-landing'))).toEqual({ data: { wx: { a: 1 } }, updated: 123 });
    expect(loadCache('putney-landing')).toEqual({ data: { wx: { a: 1 } }, updated: 123 });
    expect(loadCache('lake-natoma')).toEqual({ data: { wx: { a: 2 } }, updated: 456 });
    expect(loadCache('nowhere')).toBeNull();
    // An entry with no data, and a damaged one, are not a cache.
    ls.map.set('rowhether-cache-v2:empty', '{"updated":1}');
    ls.map.set('rowhether-cache-v2:bad', '{not json');
    expect(loadCache('empty')).toBeNull();
    expect(loadCache('bad')).toBeNull();
  });

  // P1.9: the time each source was last fetched is kept with the forecast. An entry from before
  // has none, and loads as it did (the page counts each source as fetched when the forecast was).
  it('keeps when each source was fetched with the saved forecast, and loads an entry that has none', () => {
    use({ 'rowhether-migrated-v1': '1' });
    saveCache('putney-landing', { wx: { a: 1 }, alerts: [] }, 123, [], { wx: 120, alerts: 100 });
    expect(JSON.parse(ls.map.get('rowhether-cache-v2:putney-landing'))).toEqual({ data: { wx: { a: 1 }, alerts: [] }, updated: 123, fetched: { wx: 120, alerts: 100 } });
    expect(loadCache('putney-landing')).toEqual({ data: { wx: { a: 1 }, alerts: [] }, updated: 123, fetched: { wx: 120, alerts: 100 } });
    ls.map.set('rowhether-cache-v2:old', '{"data":{"wx":{"a":1}},"updated":5}');
    expect(loadCache('old')).toEqual({ data: { wx: { a: 1 } }, updated: 5 });
  });

  it('writes the times and keeps a location protected when both are given', () => {
    use({ 'rowhether-migrated-v1': '1' });
    saveCache('lake-z', {}, 9, ['lake-a'], { wx: 8 });
    expect(JSON.parse(ls.map.get('rowhether-cache-v2:lake-z')).fetched).toEqual({ wx: 8 });
  });

  it('keeps Plan a row, as before, under the new key', () => {
    use({ 'rowhether-migrated-v1': '1' });
    expect(loadPlan()).toEqual({ minutes: 90, when: 'any' });
    savePlan({ minutes: 120, when: 'afternoon' });
    expect(ls.map.get('rowhether-plan-v1')).toBe('{"minutes":120,"when":"afternoon"}');
    expect(loadPlan()).toEqual({ minutes: 120, when: 'afternoon' });
    ls.map.set('rowhether-plan-v1', '{"when":"morning"}');
    expect(loadPlan()).toEqual({ minutes: 90, when: 'morning' });
    ls.map.set('rowhether-plan-v1', 'not json');
    expect(loadPlan()).toEqual({ minutes: 90, when: 'any' });
  });

  it('keeps the install bar state, as before, under the new key', () => {
    use({ 'rowhether-migrated-v1': '1' });
    expect(loadInstall()).toEqual({ dismissed: 0, never: false });
    saveInstall({ dismissed: 3, never: false });
    expect(ls.map.get('rowhether-install-v1')).toBe('{"dismissed":3,"never":false}');
    expect(loadInstall()).toEqual({ dismissed: 3, never: false });
    ls.map.set('rowhether-install-v1', '{"dismissed":"4","never":"true"}');
    expect(loadInstall()).toEqual({ dismissed: 4, never: false });
    ls.map.set('rowhether-install-v1', '{"dismissed":9,"never":true}');
    expect(loadInstall()).toEqual({ dismissed: 9, never: true });
  });

  it('keeps the reminder dismissal under the new key', () => {
    use({ 'rowhether-migrated-v1': '1' });
    expect(nudgeDismissed()).toBe(false);
    dismissNudge();
    expect(ls.map.get('rowhether-nudge-v1')).toBe('1');
    expect(nudgeDismissed()).toBe(true);
  });
});

// Many locations (P1.3, 07 9.2, 01 8.6). Keys are written out, as above.
const cacheKey = s => 'rowhether-cache-v2:' + s;
const recordKey = s => 'rowhether-loc-v1:' + s;
const INDEX = 'rowhether-cache-index-v1';
const recordOf = slug => ({ v: 1, slug, name: slug.toUpperCase(), revision: 2 });
const index = () => JSON.parse(ls.map.get(INDEX));
const slugs = n => Array.from({ length: n }, (_, i) => 'lake-' + String.fromCharCode(97 + i)); // lake-a, lake-b, ...
// Opens one location as the app will: its data, its record, its place in the index, then the cap.
const visit = (s, t) => { saveCache(s, { n: s }, t); saveRecord(s, recordOf(s)); touchCache(s, t); return trimCaches(s); };
// Opens each in turn, the first at 1000 and the rest 10 later each. Returns what each opening dropped.
const visitAll = list => list.map((s, i) => visit(s, 1000 + i * 10));
// Every slug in the index with a cache or a record still stored.
const held = () => Object.keys(index()).filter(s => ls.map.has(cacheKey(s)) || ls.map.has(recordKey(s))).sort();
const gone = s => !ls.map.has(cacheKey(s)) && !ls.map.has(recordKey(s));

describe('location records', () => {
  const REC = { v: 1, slug: 'lake-natoma', name: 'Lake Natoma', revision: 3 };
  beforeEach(() => use({ 'rowhether-migrated-v1': '1' }));

  it('keeps each record under its own key, with the time it was saved', () => {
    saveRecord('lake-natoma', REC);
    expect(JSON.parse(ls.map.get('rowhether-loc-v1:lake-natoma'))).toEqual({ record: REC, fetchedAt: NOW });
    expect(loadRecord('lake-natoma')).toEqual({ record: REC, fetchedAt: NOW });
    expect(loadRecord('putney-landing')).toBeNull();
    saveRecord('putney-landing', { ...REC, slug: 'putney-landing' });
    expect(loadRecord('lake-natoma').record.slug).toBe('lake-natoma');
    expect(loadRecord('putney-landing').record.slug).toBe('putney-landing');
  });

  it('writes only its own key', () => {
    saveRecord('lake-natoma', REC);
    expect(Object.keys(ls.dump()).sort()).toEqual(['rowhether-loc-v1:lake-natoma', 'rowhether-migrated-v1']);
  });

  it('gives null for anything that is not a saved record', () => {
    for (const raw of ['not json', '', 'null', '[]', '"x"', '{}', '{"fetchedAt":1}', '{"record":null,"fetchedAt":1}', '{"record":"x","fetchedAt":1}']) {
      ls.map.set('rowhether-loc-v1:bad', raw);
      expect(loadRecord('bad'), raw).toBeNull();
    }
  });

  it('reads a record with no usable time as saved at 0, so it counts as old', () => {
    for (const raw of ['{"record":{"v":1}}', '{"record":{"v":1},"fetchedAt":"soon"}', '{"record":{"v":1},"fetchedAt":null}']) {
      ls.map.set('rowhether-loc-v1:odd', raw);
      expect(loadRecord('odd'), raw).toEqual({ record: { v: 1 }, fetchedAt: 0 });
    }
  });
});

describe('the last location', () => {
  it('is none until one is saved, then the slug as written', () => {
    use({ 'rowhether-migrated-v1': '1' });
    expect(loadLast()).toBeNull();
    saveLast('lake-natoma');
    expect(ls.map.get('rowhether-last-v1')).toBe('lake-natoma');
    expect(loadLast()).toBe('lake-natoma');
    saveLast('putney-landing');
    expect(loadLast()).toBe('putney-landing');
    ls.map.set('rowhether-last-v1', '');
    expect(loadLast()).toBeNull();
  });

  it('is Putney for an old install, which the move wrote', () => {
    use(oldKeys());
    expect(loadLast()).toBe('putney-landing');
  });

  it('is none for a browser with no old keys', () => {
    use({ 'other-app-key': '1' });
    expect(loadLast()).toBeNull();
  });
});

describe('the index of cached locations', () => {
  beforeEach(() => use({ 'rowhether-migrated-v1': '1' }));

  it('records when each location was opened, and keeps the others', () => {
    touchCache('lake-a', 1000);
    touchCache('lake-b', 2000);
    expect(index()).toEqual({ 'lake-a': 1000, 'lake-b': 2000 });
    touchCache('lake-a', 3000);
    expect(index()).toEqual({ 'lake-a': 3000, 'lake-b': 2000 });
  });

  it('uses the time now when none is given', () => {
    touchCache('lake-a');
    expect(index()).toEqual({ 'lake-a': NOW });
  });

  it('reads a damaged index as empty, and drops entries with no time', () => {
    for (const [raw, kept] of [['not json', {}], ['[1,2]', {}], ['"x"', {}], ['null', {}], ['{"x":"soon","y":null,"z":5}', { z: 5 }]]) {
      ls.map.set(INDEX, raw);
      touchCache('lake-a', 1000);
      expect(index(), raw).toEqual({ ...kept, 'lake-a': 1000 });
    }
  });
});

describe('the cap on cached locations', () => {
  beforeEach(() => use({ 'rowhether-migrated-v1': '1' }));

  it('keeps 10, and an 11th drops the least recently opened with its data, record and index entry', () => {
    const all = slugs(11);
    const dropped = visitAll(all);
    expect(dropped.slice(0, 10)).toEqual(Array(10).fill([]));
    expect(dropped[10]).toEqual(['lake-a']);
    expect(gone('lake-a')).toBe(true);
    expect(Object.keys(index()).sort()).toEqual(all.slice(1));
    expect(held()).toEqual(all.slice(1));
    for (const s of all.slice(1)) expect([ls.map.has(cacheKey(s)), ls.map.has(recordKey(s))], s).toEqual([true, true]);
  });

  it('drops one more for each one opened after that', () => {
    expect(visitAll(slugs(12)).slice(10)).toEqual([['lake-a'], ['lake-b']]);
    expect(Object.keys(index()).sort()).toEqual(slugs(12).slice(2));
  });

  it('drops as many as it takes to get back to 10, oldest first', () => {
    slugs(13).forEach((s, i) => { saveCache(s, {}, i); touchCache(s, 1000 + i * 10); });
    expect(trimCaches('lake-m')).toEqual(['lake-a', 'lake-b', 'lake-c']);
    expect(Object.keys(index())).toHaveLength(10);
  });

  it('counts a location opened again as recent', () => {
    visitAll(slugs(10));
    touchCache('lake-a', 5000);
    expect(visit('lake-k', 6000)).toEqual(['lake-b']);
    expect(held()).toContain('lake-a');
  });

  it('never drops the current location, even when it is the oldest', () => {
    slugs(11).forEach((s, i) => touchCache(s, 1000 + i * 10));
    expect(trimCaches('lake-a')).toEqual(['lake-b']);
    expect(Object.keys(index())).toContain('lake-a');
  });

  it('never drops a protected location', () => {
    slugs(11).forEach((s, i) => touchCache(s, 1000 + i * 10));
    expect(trimCaches('lake-k', ['lake-a', 'lake-b'])).toEqual(['lake-c']);
    expect(Object.keys(index())).toEqual(expect.arrayContaining(['lake-a', 'lake-b', 'lake-k']));
  });

  it('stops when everything over 10 is current or protected', () => {
    const all = slugs(11);
    all.forEach((s, i) => touchCache(s, 1000 + i * 10));
    expect(trimCaches('lake-a', all.slice(1))).toEqual([]);
    expect(Object.keys(index())).toHaveLength(11);
  });

  it('drops what it can before it stops', () => {
    const all = slugs(12);
    all.forEach((s, i) => touchCache(s, 1000 + i * 10));
    expect(trimCaches('lake-a', all.slice(1, 11))).toEqual(['lake-l']);
    expect(Object.keys(index())).toHaveLength(11);
  });

  it('takes the first by name when two were opened at the same time', () => {
    slugs(11).reverse().forEach(s => touchCache(s, 1000));
    expect(trimCaches('lake-z')).toEqual(['lake-a']);
  });

  it('leaves settings, the last location, the recent list and everything else alone', () => {
    use({ 'rowhether-migrated-v1': '1', 'other-app-key': 'x' });
    saveOverrides('lake-a', { windCaution: 8 });
    savePlan({ minutes: 120, when: 'any' });
    saveInstall({ dismissed: 2, never: false });
    dismissNudge();
    dismissPickHint();
    pushRecent('lake-a');
    saveLast('lake-a');
    visitAll(slugs(11));
    expect(gone('lake-a')).toBe(true);
    expect(loadOverrides('lake-a')).toEqual({ windCaution: 8 });
    expect(loadPlan()).toEqual({ minutes: 120, when: 'any' });
    expect(loadInstall()).toEqual({ dismissed: 2, never: false });
    expect(nudgeDismissed()).toBe(true);
    expect(pickHintDismissed()).toBe(true);
    expect(loadRecent()).toEqual(['lake-a']);
    expect(loadLast()).toBe('lake-a');
    expect(ls.map.get('other-app-key')).toBe('x');
  });

  it('counts only the index: a cache with no entry there is kept', () => {
    saveCache('putney-landing', { n: 'old' }, 1);
    visitAll(slugs(11));
    expect(loadCache('putney-landing')).toEqual({ data: { n: 'old' }, updated: 1 });
    expect(gone('lake-a')).toBe(true);
  });

  it('does nothing, without an error, when the index cannot be read', () => {
    slugs(11).forEach((s, i) => { saveCache(s, {}, i); touchCache(s, 1000 + i * 10); });
    use(ls.dump(), (op, key) => key === INDEX);
    expect(trimCaches('lake-k')).toEqual([]);
    expect([...ls.map.keys()].filter(k => k.startsWith('rowhether-cache-v2:'))).toHaveLength(11);
  });

  it('stops, without an error, when the index cannot be written', () => {
    slugs(11).forEach((s, i) => { saveCache(s, {}, i); touchCache(s, 1000 + i * 10); });
    use(ls.dump(), (op, key) => op === 'set' && key === INDEX);
    expect(() => trimCaches('lake-k')).not.toThrow();
  });

  it('ends after dropping what is over, even when the store ignores a write of the index', () => {
    slugs(12).forEach((s, i) => { saveCache(s, {}, i); touchCache(s, 1000 + i * 10); });
    // The index never shrinks, so the same location is the oldest every time. A loop that waits for the index
    // to shrink would not end. The removals are counted and cut off, so that it fails here and does not hang.
    const set = ls.store.setItem.bind(ls.store);
    const remove = ls.store.removeItem.bind(ls.store);
    let removals = 0;
    ls.store.setItem = (k, v) => { if (k !== INDEX) set(k, v); };
    ls.store.removeItem = k => { if (++removals > 100) throw new Error('too many removals'); remove(k); };
    expect(trimCaches('lake-z')).toHaveLength(2);
    expect(removals).toBe(4);
  });
});

describe('saveCache with a full store', () => {
  const onTarget = (op, key) => op === 'set' && key === 'rowhether-cache-v2:lake-z';
  const cacheSets = s => ls.log.filter(([op, k]) => op === 'set' && k === cacheKey(s)).length;
  const error = name => (name === 'Error' ? new Error('boom') : new DOMException('The store refused it.', name));

  it('drops the two oldest locations when the store is full twice, then saves', () => {
    use({ 'rowhether-migrated-v1': '1' }, times(2, onTarget));
    visitAll(slugs(6));
    touchCache('lake-z', 9000);
    saveCache('lake-z', { n: 'z' }, 9);
    expect(JSON.parse(ls.map.get('rowhether-cache-v2:lake-z'))).toEqual({ data: { n: 'z' }, updated: 9 });
    expect(cacheSets('lake-z')).toBe(3);
    expect(gone('lake-a') && gone('lake-b')).toBe(true);
    expect(Object.keys(index()).sort()).toEqual(['lake-c', 'lake-d', 'lake-e', 'lake-f', 'lake-z']);
    expect(held()).toEqual(['lake-c', 'lake-d', 'lake-e', 'lake-f', 'lake-z']);
  });

  it('gives up after three drops, without an error', () => {
    use({ 'rowhether-migrated-v1': '1' }, times(99, onTarget));
    visitAll(slugs(6));
    touchCache('lake-z', 9000);
    expect(() => saveCache('lake-z', {}, 9)).not.toThrow();
    expect(cacheSets('lake-z')).toBe(4);
    expect(Object.keys(index()).sort()).toEqual(['lake-d', 'lake-e', 'lake-f', 'lake-z']);
    expect(ls.map.has('rowhether-cache-v2:lake-z')).toBe(false);
  });

  it('drops others, not the location being saved, even when it is the oldest', () => {
    use({ 'rowhether-migrated-v1': '1' }, times(1, onTarget));
    touchCache('lake-z', 1);
    visitAll(slugs(3));
    saveCache('lake-z', { n: 'z' }, 9);
    expect(Object.keys(index()).sort()).toEqual(['lake-b', 'lake-c', 'lake-z']);
    expect(loadCache('lake-z')).toEqual({ data: { n: 'z' }, updated: 9 });
  });

  it('stops at once when there is nothing else to drop', () => {
    use({ 'rowhether-migrated-v1': '1' }, times(99, onTarget));
    touchCache('lake-z', 1);
    expect(() => saveCache('lake-z', {}, 9)).not.toThrow();
    expect(cacheSets('lake-z')).toBe(1);
    expect(index()).toEqual({ 'lake-z': 1 });
  });

  it('leaves protected locations alone', () => {
    use({ 'rowhether-migrated-v1': '1' }, times(1, onTarget));
    visitAll(slugs(3));
    touchCache('lake-z', 9000);
    saveCache('lake-z', {}, 9, ['lake-a']);
    expect(Object.keys(index()).sort()).toEqual(['lake-a', 'lake-c', 'lake-z']);
  });

  it.each([
    ['QuotaExceededError', true],
    ['NS_ERROR_DOM_QUOTA_REACHED', true],
    ['SecurityError', false],
    ['Error', false]
  ])('%s: drops a location is %s', (name, drops) => {
    use({ 'rowhether-migrated-v1': '1' }, times(1, onTarget, error(name)));
    visitAll(slugs(3));
    touchCache('lake-z', 9000);
    saveCache('lake-z', {}, 9);
    expect(Object.keys(index())).toHaveLength(drops ? 3 : 4);
    expect(ls.map.has('rowhether-cache-v2:lake-z')).toBe(drops);
  });

  it('gives up quietly when it cannot make room, because the index cannot be written', () => {
    let armed = false;
    use({ 'rowhether-migrated-v1': '1' }, (op, key) => armed && op === 'set' && (key === INDEX || onTarget(op, key)));
    visitAll(slugs(3));
    touchCache('lake-z', 9000);
    armed = true;
    expect(() => saveCache('lake-z', {}, 9)).not.toThrow();
    expect(cacheSets('lake-z')).toBe(1);
    expect(ls.map.has('rowhether-cache-v2:lake-z')).toBe(false);
  });

  it('gives up quietly on data that cannot be written as text', () => {
    use({ 'rowhether-migrated-v1': '1' });
    const loop = {};
    loop.self = loop;
    expect(() => saveCache('lake-z', loop, 9)).not.toThrow();
    expect(ls.map.has('rowhether-cache-v2:lake-z')).toBe(false);
  });

  it('drops nothing when the save works, even with more than 10 in the index', () => {
    use({ 'rowhether-migrated-v1': '1' });
    slugs(11).forEach((s, i) => touchCache(s, 1000 + i * 10));
    saveCache('lake-k', { n: 'k' }, 1);
    expect(Object.keys(index())).toHaveLength(11);
    expect(loadCache('lake-k')).toEqual({ data: { n: 'k' }, updated: 1 });
  });
});

describe('recent locations', () => {
  beforeEach(() => use({ 'rowhether-migrated-v1': '1' }));

  it('lists the newest first, with no repeats', () => {
    expect(loadRecent()).toEqual([]);
    pushRecent('lake-a');
    pushRecent('lake-b');
    pushRecent('lake-c');
    expect(ls.map.get('rowhether-recent-v1')).toBe('["lake-c","lake-b","lake-a"]');
    pushRecent('lake-a');
    expect(loadRecent()).toEqual(['lake-a', 'lake-c', 'lake-b']);
    pushRecent('lake-a');
    expect(loadRecent()).toEqual(['lake-a', 'lake-c', 'lake-b']);
  });

  it('keeps 8', () => {
    for (const s of slugs(10)) pushRecent(s);
    expect(loadRecent()).toEqual(['lake-j', 'lake-i', 'lake-h', 'lake-g', 'lake-f', 'lake-e', 'lake-d', 'lake-c']);
    ls.map.set('rowhether-recent-v1', JSON.stringify(slugs(12)));
    pushRecent('lake-z');
    expect(loadRecent()).toEqual(['lake-z', 'lake-a', 'lake-b', 'lake-c', 'lake-d', 'lake-e', 'lake-f', 'lake-g']);
  });

  it('reads what is not a list as no list, and drops entries that are not text', () => {
    for (const [raw, want] of [['not json', []], ['{"a":1}', []], ['"x"', []], ['[1,"lake-a",null,"lake-b"]', ['lake-a', 'lake-b']]]) {
      ls.map.set('rowhether-recent-v1', raw);
      expect(loadRecent(), raw).toEqual(want);
    }
  });

  it('writes a clean list over a damaged one', () => {
    ls.map.set('rowhether-recent-v1', '[1,2,null]');
    pushRecent('lake-a');
    expect(ls.map.get('rowhether-recent-v1')).toBe('["lake-a"]');
  });
});

describe('the pick hint', () => {
  beforeEach(() => use({ 'rowhether-migrated-v1': '1' }));

  it('is dismissed once, in this browser', () => {
    expect(pickHintDismissed()).toBe(false);
    dismissPickHint();
    expect(ls.map.get('rowhether-pickhint-v1')).toBe('1');
    expect(pickHintDismissed()).toBe(true);
  });

  it('is separate from the Settings reminder', () => {
    dismissPickHint();
    expect(nudgeDismissed()).toBe(false);
    use({ 'rowhether-migrated-v1': '1' });
    dismissNudge();
    expect(pickHintDismissed()).toBe(false);
  });
});

describe('an old install and the new loaders', () => {
  it('opens on Putney with its cache, and has no record, recent list or hint yet', () => {
    use(oldKeys());
    expect(loadLast()).toBe('putney-landing');
    expect(loadCache('putney-landing')).toEqual({ data: JSON.parse(OLD_CACHE).data, updated: 1760690000000 });
    expect(loadRecord('putney-landing')).toBeNull();
    expect(loadRecent()).toEqual([]);
    expect(pickHintDismissed()).toBe(false);
  });
});

describe('the old settings, read against the values Putney had before phase 1', () => {
  it('OLD_PUTNEY_DEFAULTS is those 13 values, frozen', () => {
    expect(OLD_PUTNEY_DEFAULTS).toEqual(OLD_DEFAULTS);
    expect(Object.isFrozen(OLD_PUTNEY_DEFAULTS)).toBe(true);
  });

  // The guard that the freeze was copied right. If Putney's record changes on
  // purpose, this fails: keep OLD_PUTNEY_DEFAULTS as it is, since the old
  // settings were made against it, and change this comparison to say so.
  it("equals Putney's defaults today", () => {
    expect(OLD_PUTNEY_DEFAULTS).toEqual(PUTNEY_DEFAULTS);
  });

  it('does not depend on src/putney.js: not imported, and not read when its values differ', async () => {
    const source = readFileSync(new URL('../src/storage.js', import.meta.url), 'utf8');
    const imports = source.split('\n').filter(l => /^\s*import\b/.test(l));
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter(l => /putney/.test(l))).toEqual([]);
    // Old settings that equal the old defaults must store no values, even if Putney's record gave other defaults.
    vi.doMock('../src/putney.js', () => ({ PUTNEY_DEFAULTS: { ...OLD_DEFAULTS, windCaution: 99, heading: 99 } }));
    try {
      vi.resetModules();
      const fresh = await import('../src/storage.js');
      use({ 'putney-rowing-settings-v1': JSON.stringify(OLD_DEFAULTS) });
      fresh.migrateStorage();
      expect(JSON.parse(ls.map.get('rowhether-settings-v2'))['putney-landing'].values).toEqual({});
    } finally {
      vi.doUnmock('../src/putney.js');
      vi.resetModules();
    }
  });
});

describe('storage that throws', () => {
  const everyLoader = () => ({
    overrides: loadOverrides('putney-landing'),
    saved: hasSavedSettings('putney-landing'),
    nudge: nudgeDismissed(),
    cache: loadCache('putney-landing'),
    plan: loadPlan(),
    install: loadInstall(),
    record: loadRecord('putney-landing'),
    last: loadLast(),
    recent: loadRecent(),
    pickHint: pickHintDismissed()
  });
  const defaults = {
    overrides: {}, saved: false, nudge: false, cache: null, plan: { minutes: 90, when: 'any' }, install: { dismissed: 0, never: false },
    record: null, last: null, recent: [], pickHint: false
  };

  it('gives every loader its default, and no saver throws', () => {
    vi.stubGlobal('localStorage', brokenStorage());
    expect(() => migrateStorage()).not.toThrow();
    expect(everyLoader()).toEqual(defaults);
    expect(() => {
      saveOverrides('putney-landing', { windCaution: 8 });
      saveCache('putney-landing', {}, 1);
      savePlan({ minutes: 60, when: 'any' });
      saveInstall({ dismissed: 1, never: false });
      dismissNudge();
      saveRecord('putney-landing', { v: 1 });
      saveLast('putney-landing');
      touchCache('putney-landing', 1);
      pushRecent('putney-landing');
      dismissPickHint();
    }).not.toThrow();
    expect(trimCaches('putney-landing')).toEqual([]);
  });

  it('gives defaults when only some calls throw', () => {
    use(oldKeys(), () => true);
    expect(() => migrateStorage()).not.toThrow();
    expect(everyLoader()).toEqual(defaults);
    use(oldKeys(), op => op === 'set');
    expect(() => migrateStorage()).not.toThrow();
    expect(ls.map.has('rowhether-migrated-v1')).toBe(false);
    expect(loadCache('putney-landing')).toBeNull();
    expect(loadPlan()).toEqual({ minutes: 90, when: 'any' });
  });

  it('imports and runs when the localStorage property itself throws', async () => {
    const was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('The operation is insecure.', 'SecurityError'); }
    });
    try {
      vi.resetModules();
      const fresh = await import('../src/storage.js');
      expect(() => fresh.migrateStorage()).not.toThrow();
      expect(fresh.loadOverrides('putney-landing')).toEqual({});
      expect(fresh.hasSavedSettings('putney-landing')).toBe(false);
      expect(fresh.nudgeDismissed()).toBe(false);
      expect(fresh.loadCache('putney-landing')).toBeNull();
      expect(fresh.loadPlan()).toEqual({ minutes: 90, when: 'any' });
      expect(fresh.loadInstall()).toEqual({ dismissed: 0, never: false });
      expect(fresh.loadRecord('putney-landing')).toBeNull();
      expect(fresh.loadLast()).toBeNull();
      expect(fresh.loadRecent()).toEqual([]);
      expect(fresh.pickHintDismissed()).toBe(false);
      expect(() => { fresh.saveOverrides('putney-landing', {}); fresh.saveCache('putney-landing', {}, 1); fresh.savePlan({}); fresh.saveInstall({}); fresh.dismissNudge(); }).not.toThrow();
      expect(() => { fresh.saveRecord('putney-landing', {}); fresh.saveLast('putney-landing'); fresh.touchCache('putney-landing', 1); fresh.pushRecent('putney-landing'); fresh.dismissPickHint(); }).not.toThrow();
      expect(fresh.trimCaches('putney-landing')).toEqual([]);
      // The state module reads no storage while it loads. Putney opened from it, with the
      // overrides that blocked storage gives (none), has its own limits.
      const { app, openLocation } = await import('../src/state.js');
      expect(app.loc).toBeNull();
      openLocation(PUTNEY_FILE, fresh.loadOverrides('putney-landing'));
      expect(app.loc.slug).toBe('putney-landing');
      expect(app.loc.course.heading).toBe(15);
      expect(app.settings.windCaution).toBe(10);
    } finally {
      if (was) Object.defineProperty(globalThis, 'localStorage', was); else delete globalThis.localStorage;
      vi.resetModules();
    }
  });
});

describe('the state a location opens with', () => {
  // The state module, with Putney opened from this browser's stored settings, as main.js opens it.
  const fresh = async () => {
    vi.resetModules();
    const state = await import('../src/state.js');
    const { loadOverrides } = await import('../src/storage.js');
    state.openLocation(PUTNEY_FILE, loadOverrides('putney-landing'));
    return state;
  };
  // The limits: the 13 keys of a saved settings object, less the heading, which is in app.loc.course.
  const KEYS12 = ['aqiCaution', 'aqiOff', 'coldCombined', 'flowCaution', 'flowOff', 'gustCaution', 'gustOff', 'rainCaution', 'rainOff', 'waterOverride', 'windCaution', 'windOff'];
  const { heading: _h, ...LIMITS } = OLD_DEFAULTS;

  it('is no location until one is opened, and reads no storage while the module loads', async () => {
    use({});
    vi.resetModules();
    const { app } = await import('../src/state.js');
    expect(app.loc).toBeNull();
    expect(app.record).toBeNull();
    expect(ls.log).toEqual([]);
  });

  it('is Putney with its own limits when nothing is stored', async () => {
    use({});
    const { app } = await fresh();
    expect(app.loc.slug).toBe('putney-landing');
    expect(app.loc.course.heading).toBe(15);
    expect(app.settings).toEqual(LIMITS);
    expect(Object.keys(app.settings).sort()).toEqual(KEYS12);
    expect(app.settings).not.toHaveProperty('heading');
  });

  it('applies what was saved: the heading to the course, the rest to the limits', async () => {
    use({ 'rowhether-migrated-v1': '1', 'rowhether-settings-v2': putneySettings({ heading: 20, windCaution: 8, rainCaution: '', waterOverride: 55 }) });
    const { app } = await fresh();
    expect(app.loc.course.heading).toBe(20);
    expect(app.loc.course.segments[0].heading).toBe(20);
    expect(app.settings).toEqual({ ...LIMITS, windCaution: 8, rainCaution: '', waterOverride: 55 });
    expect(Object.keys(app.settings).sort()).toEqual(KEYS12);
    expect(app.settings).not.toHaveProperty('heading');
  });

  it('is the same for someone upgrading from the old keys', async () => {
    use(oldKeys());
    const { app } = await fresh();
    const { heading, ...limits } = OLD_SETTINGS;
    expect(app.settings).toEqual({ ...limits, waterOverride: 55 });
    expect(app.loc.course.heading).toBe(heading);
  });

  it('holds what the viewer saved, as stored, and a location with none open holds nothing', async () => {
    use({ 'rowhether-migrated-v1': '1', 'rowhether-settings-v2': putneySettings({ windCaution: 8 }) });
    const { app, applyOverrides, openLocation } = await fresh();
    expect(app.overrides).toEqual({ windCaution: 8 });
    applyOverrides({ windOff: 14 });
    expect(app.overrides).toEqual({ windOff: 14 });
    openLocation(null);
    expect(app.overrides).toEqual({});
  });

  it("uses a saved flow limit made for Putney's gauge, or made before gauges were named, and ignores one for another gauge", async () => {
    const GAUGE = 'usgs-ogc:USGS-01154500:cfs';
    const flow = { flowCaution: 15000, flowOff: 30000 };
    use({ 'rowhether-migrated-v1': '1', 'rowhether-settings-v2': putneySettings({ ...flow, limitBasis: { flow: GAUGE } }) });
    let { app } = await fresh();
    expect(app.settings).toMatchObject(flow);
    expect(app.loc).not.toHaveProperty('ignoredFlow');
    // Saved before this step: no basis, read as made for this gauge.
    use({ 'rowhether-migrated-v1': '1', 'rowhether-settings-v2': putneySettings(flow) });
    ({ app } = await fresh());
    expect(app.settings).toMatchObject(flow);
    expect(app.loc).not.toHaveProperty('ignoredFlow');
    // Another gauge: the location's own limits stand, the note names no gauge a row still has, and the stored limits are kept.
    use({ 'rowhether-migrated-v1': '1', 'rowhether-settings-v2': putneySettings({ ...flow, windCaution: 8, limitBasis: { flow: 'usgs-ogc:USGS-01154501:cfs' } }) });
    ({ app } = await fresh());
    expect(app.settings).toMatchObject({ windCaution: 8, flowCaution: 20000, flowOff: 28000 });
    expect(app.loc.ignoredFlow).toEqual({ label: null });
    expect(app.overrides).toMatchObject({ ...flow, limitBasis: { flow: 'usgs-ogc:USGS-01154501:cfs' } });
    expect(JSON.parse(ls.map.get('rowhether-settings-v2'))['putney-landing'].values).toMatchObject(flow);
  });

  it('applyOverrides rebuilds both, and an empty set goes back to the defaults', async () => {
    use({});
    const { app, applyOverrides } = await fresh();
    applyOverrides({ heading: 120, windOff: 14 });
    expect(app.loc.course.heading).toBe(120);
    expect(app.settings).toEqual({ ...LIMITS, windOff: 14 });
    expect(app.settings).not.toHaveProperty('heading');
    applyOverrides({});
    expect(app.loc.course.heading).toBe(15);
    expect(app.settings).toEqual(LIMITS);
  });
});

// Every saved key reaches the page (FC9). A key that holds its default reads
// back the same whether or not its own value got through, so the tests above,
// which change a few keys, cannot see one that is dropped. Each row changes one
// key to a value that is not Putney's and passes the dialog's rules, written as
// a literal, and follows it through the three steps that are each a loop over
// the keys: the move from the old file, the comparison with Putney's defaults,
// and the limits in force. A last test changes all 13 together.
describe('every saved key reaches the page', () => {
  // The key, the value on the page, and what an old file held when that was typed text.
  const CHANGED = [
    ['heading', 40], ['windCaution', 8], ['windOff', 20], ['gustCaution', 15], ['gustOff', 30],
    ['rainCaution', 50], ['rainOff', 85], ['coldCombined', 120], ['waterOverride', 55, '55'],
    ['flowCaution', 15000], ['flowOff', 35000], ['aqiCaution', 101], ['aqiOff', 180]
  ];
  const rows = CHANGED.map(([key, value, old = value]) => ({ key, value, old }));
  const oldFile = rows => ({ 'putney-rowing-settings-v1': JSON.stringify({ ...OLD_DEFAULTS, ...Object.fromEntries(rows.map(r => [r.key, r.old])) }) });
  const storedValues = () => JSON.parse(ls.map.get('rowhether-settings-v2'))['putney-landing'].values;
  // What the page reads: the limits in force, and the heading from the course.
  const onPage = app => ({ ...app.settings, heading: app.loc.course.heading });
  const fresh = async () => {
    vi.resetModules();
    const next = await import('../src/state.js');
    const { loadOverrides } = await import('../src/storage.js');
    next.openLocation(PUTNEY_FILE, loadOverrides('putney-landing'));
    return next;
  };
  let state;
  beforeAll(async () => { state = await import('../src/state.js'); state.openLocation(PUTNEY_FILE, {}); });

  it('has a row for each of the 13 keys, none at its default', () => {
    expect(rows).toHaveLength(13);
    expect(rows.map(r => r.key).sort()).toEqual(Object.keys(OLD_DEFAULTS).sort());
    expect(Object.keys(PUTNEY_DEFAULTS).sort()).toEqual(Object.keys(OLD_DEFAULTS).sort());
    for (const { key, value } of rows) {
      expect(PUTNEY_DEFAULTS[key], key).toBe(OLD_DEFAULTS[key]);
      expect(value, key).not.toBe(OLD_DEFAULTS[key]);
    }
  });

  it.each(rows)('$key: the move from the old file keeps it', row => {
    use(oldFile([row]));
    migrateStorage();
    expect(storedValues()).toEqual({ [row.key]: row.value });
  });

  it.each(rows)('$key: overridesOf keeps it against Putney, and nothing else', ({ key, value }) => {
    expect(overridesOf({ ...PUTNEY_DEFAULTS, [key]: value }, PUTNEY_DEFAULTS)).toEqual({ [key]: value });
  });

  it.each(rows)('$key: the limits in force carry it, and the others stay at the defaults', ({ key, value }) => {
    state.applyOverrides({ [key]: value });
    expect(onPage(state.app)).toEqual({ ...OLD_DEFAULTS, [key]: value });
    state.applyOverrides({});
  });

  it.each(rows)('$key: someone upgrading from the old file has it on the page', async row => {
    use(oldFile([row]));
    const { app } = await fresh();
    expect(onPage(app)).toEqual({ ...OLD_DEFAULTS, [row.key]: row.value });
  });

  it('carries all 13 changed together, from the old file and from a saved copy', async () => {
    const all = Object.fromEntries(rows.map(r => [r.key, r.value]));
    use(oldFile(rows));
    const { app } = await fresh();
    expect(storedValues()).toEqual(all);
    expect(onPage(app)).toEqual(all);
    use({ 'rowhether-migrated-v1': '1', 'rowhether-settings-v2': putneySettings(all) });
    expect(onPage((await fresh()).app)).toEqual(all);
  });
});
