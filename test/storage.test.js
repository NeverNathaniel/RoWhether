// Storage keys and the one-time move from putney-rowing-* (08 8.3, P0.7).
//
// Two rules from the phase 0 review (Z7, Z8). The stub behaves like Storage
// (a missing key is null, values are strings, length and key(i), keys that
// Object.keys lists), so a migration that passes here does not fail in a
// browser on a difference between the stub and the real thing. And every key is
// written out as a string literal, never read from KEYS or OLD_KEYS, so a typo
// in src/config.js disagrees with this file and fails. One test compares the
// two tables to the same literals.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KEYS, OLD_KEYS } from '../src/config.js';
import {
  migrateStorage, loadOverrides, saveOverrides, overridesOf, hasSavedSettings, nudgeDismissed, dismissNudge,
  loadCache, saveCache, loadPlan, savePlan, loadInstall, saveInstall
} from '../src/storage.js';

const NOW = 1760700000000;

// A Storage that works like the browser's. `fail(op, key)` makes an operation
// throw (op is 'get', 'set', 'key'); `log` lists every get and set as [op, key].
function makeStorage(seed = {}, fail = () => false) {
  const map = new Map(Object.entries(seed).map(([k, v]) => [k, String(v)]));
  const log = [];
  const api = {
    getItem(k) { log.push(['get', String(k)]); if (fail('get', String(k))) throw new Error('read failed'); return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) { log.push(['set', String(k)]); if (fail('set', String(k))) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); map.set(String(k), String(v)); },
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
    expect({ ...KEYS, cache: KEYS.cache('putney-landing') }).toEqual({
      settings: 'rowhether-settings-v2',
      cache: 'rowhether-cache-v2:putney-landing',
      plan: 'rowhether-plan-v1',
      install: 'rowhether-install-v1',
      nudge: 'rowhether-nudge-v1',
      migrated: 'rowhether-migrated-v1',
      last: 'rowhether-last-v1'
    });
    expect(KEYS.cache('at:42.961,-72.522')).toBe('rowhether-cache-v2:at:42.961,-72.522');
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
      loadInstall: () => loadInstall()
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
    expect(overridesOf(defaults)).toEqual({});
    expect(overridesOf({ ...defaults, heading: 20, windCaution: 8, rainCaution: '', waterOverride: 55, flowCaution: 20000.5 })).toEqual({ heading: 20, windCaution: 8, rainCaution: '', waterOverride: 55, flowCaution: 20000.5 });
    // A blank where the default is blank is not an override; a blank where it is a number is.
    expect(overridesOf({ ...defaults, waterOverride: '' })).toEqual({});
    expect(overridesOf({ ...defaults, aqiOff: '' })).toEqual({ aqiOff: '' });
    // Keys the settings do not know, and missing keys, are ignored.
    expect(overridesOf({ windCaution: 11, streamCaution: 3 })).toEqual({ windCaution: 11 });
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
    saveOverrides('putney-landing', overridesOf(defaults));
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

describe('storage that throws', () => {
  const everyLoader = () => ({
    overrides: loadOverrides('putney-landing'),
    saved: hasSavedSettings('putney-landing'),
    nudge: nudgeDismissed(),
    cache: loadCache('putney-landing'),
    plan: loadPlan(),
    install: loadInstall()
  });
  const defaults = {
    overrides: {}, saved: false, nudge: false, cache: null, plan: { minutes: 90, when: 'any' }, install: { dismissed: 0, never: false }
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
    }).not.toThrow();
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
      expect(() => { fresh.saveOverrides('putney-landing', {}); fresh.saveCache('putney-landing', {}, 1); fresh.savePlan({}); fresh.saveInstall({}); fresh.dismissNudge(); }).not.toThrow();
      // The state module reads storage while it loads, and still builds Putney.
      const { app } = await import('../src/state.js');
      expect(app.loc.slug).toBe('putney-landing');
      expect(app.loc.course.heading).toBe(15);
      expect(app.settings.windCaution).toBe(10);
    } finally {
      if (was) Object.defineProperty(globalThis, 'localStorage', was); else delete globalThis.localStorage;
      vi.resetModules();
    }
  });
});

describe('the state the app starts from', () => {
  const fresh = async () => { vi.resetModules(); return import('../src/state.js'); };
  const KEYS13 = ['aqiCaution', 'aqiOff', 'coldCombined', 'flowCaution', 'flowOff', 'gustCaution', 'gustOff', 'heading', 'rainCaution', 'rainOff', 'waterOverride', 'windCaution', 'windOff'];

  it('is Putney with its own limits when nothing is stored', async () => {
    use({});
    const { app } = await fresh();
    expect(app.loc.slug).toBe('putney-landing');
    expect(app.loc.course.heading).toBe(15);
    expect(app.settings).toEqual(OLD_DEFAULTS);
    expect(Object.keys(app.settings).sort()).toEqual(KEYS13);
  });

  it('applies what was saved: the heading to the course, the rest to the limits', async () => {
    use({ 'rowhether-migrated-v1': '1', 'rowhether-settings-v2': putneySettings({ heading: 20, windCaution: 8, rainCaution: '', waterOverride: 55 }) });
    const { app } = await fresh();
    expect(app.loc.course.heading).toBe(20);
    expect(app.loc.course.segments[0].heading).toBe(20);
    expect(app.settings).toEqual({ ...OLD_DEFAULTS, heading: 20, windCaution: 8, rainCaution: '', waterOverride: 55 });
    expect(Object.keys(app.settings).sort()).toEqual(KEYS13);
  });

  it('is the same for someone upgrading from the old keys', async () => {
    use(oldKeys());
    const { app } = await fresh();
    expect(app.settings).toEqual({ ...OLD_SETTINGS, waterOverride: 55 });
    expect(app.loc.course.heading).toBe(20);
  });

  it('applyOverrides rebuilds both, and an empty set goes back to the defaults', async () => {
    use({});
    const { app, applyOverrides } = await fresh();
    applyOverrides({ heading: 120, windOff: 14 });
    expect(app.loc.course.heading).toBe(120);
    expect(app.settings).toEqual({ ...OLD_DEFAULTS, heading: 120, windOff: 14 });
    applyOverrides({});
    expect(app.loc.course.heading).toBe(15);
    expect(app.settings).toEqual(OLD_DEFAULTS);
  });
});
