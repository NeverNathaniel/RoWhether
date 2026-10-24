// Loading a location (P1.4): the record from this browser or from the file the
// build wrote, judged by its body (R4); the revision check that replaces a saved
// record (R14); the guard that keeps a slow answer for one place out of another
// (R9); and what hangs on the open location (the tabs, dock reports).
// fetch and localStorage are stubs, and each test has its own copy of the modules,
// since the index is kept in memory once it is read.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installFakeDom, uninstallFakeDom } from './helpers/fakedom.js';
import { PUTNEY_FILE } from './helpers/putney-file.js';

const NOW = 1760700000000;
const DAY = 24 * 3600e3;
const putney = (extra = {}) => ({ ...PUTNEY_FILE, ...extra });
const listed = (slug, revision) => ({ slug, name: slug, revision });
const index = (...rows) => ({ v: 1, locations: rows });

// A Storage with a Map behind it.
let map;
const store = () => {
  map = new Map();
  vi.stubGlobal('localStorage', {
    getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: k => { map.delete(k); },
    key: i => [...map.keys()][i] ?? null, get length() { return map.size; }
  });
};

// fetch, answering by path. A reply is [status, body, content type], a thrown error is a
// network error, and a path with no reply is a 404 with a plain text body, as a static host gives.
let replies, asked;
const answer = path => {
  const r = replies[path];
  if (r instanceof Error) throw r;
  const [status, body, type] = r || [404, 'Not found', 'text/plain'];
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status < 400, status, headers: { get: () => type }, text: async () => text, json: async () => JSON.parse(text) };
};
const setFetch = () => vi.stubGlobal('fetch', async url => { asked.push(url); return answer(url); });

let mod;
beforeEach(async () => {
  replies = {}; asked = [];
  store(); setFetch();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.resetModules();
  mod = await import('../src/locations.js');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('fetchRecord', () => {
  it.each([['application/json'], ['text/plain'], ['application/octet-stream'], [undefined]])('takes a record with a JSON body served as %s', async type => {
    replies['/locations/putney-landing.json'] = [200, putney(), type];
    expect(await mod.fetchRecord('putney-landing')).toEqual({ record: putney() });
    expect(asked).toEqual(['/locations/putney-landing.json']);
  });

  // Only the body is read: an error status cannot carry a record that names this slug, so it is not looked at.
  it('takes a record by its body, whatever the status line says', async () => {
    for (const status of [200, 203, 404]) {
      replies['/locations/putney-landing.json'] = [status, putney(), 'text/plain'];
      expect((await mod.fetchRecord('putney-landing')).record.slug, String(status)).toBe('putney-landing');
    }
  });

  it('does not take the single-page fallback: an HTML 200 for a slug in the index is failed', async () => {
    replies['/locations/putney-landing.json'] = [200, '<!doctype html><title>RoWhether</title>', 'text/html'];
    replies['/locations/index.json'] = [200, index(listed('putney-landing', 2)), 'application/json'];
    expect(await mod.fetchRecord('putney-landing')).toEqual({ failed: true });
  });

  it('says missing for an HTML 200 for a slug that is not in the index', async () => {
    replies['/locations/nope.json'] = [200, '<!doctype html>', 'text/html'];
    replies['/locations/index.json'] = [200, index(listed('putney-landing', 2)), 'application/json'];
    expect(await mod.fetchRecord('nope')).toEqual({ missing: true });
  });

  it('says missing for a 404, and failed for a 404 when the index lists the slug', async () => {
    replies['/locations/index.json'] = [200, index(listed('putney-landing', 2)), 'text/plain'];
    expect(await mod.fetchRecord('nope')).toEqual({ missing: true });
    expect(await mod.fetchRecord('putney-landing')).toEqual({ failed: true });
  });

  it('does not take a record for another slug, nor a version it does not know', async () => {
    replies['/locations/hanover-boathouse.json'] = [200, putney(), 'application/json'];
    replies['/locations/putney-landing.json'] = [200, putney({ v: 2 }), 'application/json'];
    replies['/locations/index.json'] = [200, index(listed('putney-landing', 2)), 'application/json'];
    expect(await mod.fetchRecord('hanover-boathouse')).toEqual({ missing: true });
    expect(await mod.fetchRecord('putney-landing')).toEqual({ failed: true });
  });

  it('says failed on a network error, and when the index cannot be read either', async () => {
    replies['/locations/putney-landing.json'] = new TypeError('Failed to fetch');
    expect(await mod.fetchRecord('putney-landing')).toEqual({ failed: true });
    replies['/locations/putney-landing.json'] = [404, 'Not found', 'text/plain'];
    replies['/locations/index.json'] = new TypeError('Failed to fetch');
    expect(await mod.fetchRecord('putney-landing')).toEqual({ failed: true });
    replies['/locations/index.json'] = [200, '<!doctype html>', 'text/html'];
    expect(await mod.fetchRecord('putney-landing')).toEqual({ failed: true });
  });
});

describe('fetchIndex', () => {
  it('reads the index by its body, whatever it is served as, and keeps it in memory once it is read', async () => {
    replies['/locations/index.json'] = [200, index(listed('putney-landing', 2)), 'application/octet-stream'];
    const first = await mod.fetchIndex();
    expect(first.locations).toEqual([listed('putney-landing', 2)]);
    expect(await mod.fetchIndex()).toBe(first);
    expect(asked).toEqual(['/locations/index.json']);
  });

  it('does not take an HTML answer or another version, and tries again after a failure', async () => {
    replies['/locations/index.json'] = [200, '<!doctype html>', 'text/html'];
    expect(await mod.fetchIndex()).toBeNull();
    replies['/locations/index.json'] = [200, { v: 2, locations: [] }, 'application/json'];
    expect(await mod.fetchIndex()).toBeNull();
    replies['/locations/index.json'] = [200, { v: 1 }, 'application/json'];
    expect(await mod.fetchIndex()).toBeNull();
    replies['/locations/index.json'] = new TypeError('Failed to fetch');
    expect(await mod.fetchIndex()).toBeNull();
    replies['/locations/index.json'] = [200, index(), 'application/json'];
    expect(await mod.fetchIndex()).toEqual(index());
    expect(asked).toHaveLength(5);
  });
});

describe('cachedRecord', () => {
  const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  it('gives the record saved in this browser, with the time it was fetched', () => {
    save('rowhether-loc-v1:putney-landing', { record: putney(), fetchedAt: 123 });
    expect(mod.cachedRecord('putney-landing')).toEqual({ record: putney(), fetchedAt: 123 });
  });

  it('gives null for a version it does not know, a record for another slug, or nothing saved', () => {
    save('rowhether-loc-v1:putney-landing', { record: putney({ v: 2 }), fetchedAt: 1 });
    expect(mod.cachedRecord('putney-landing')).toBeNull();
    save('rowhether-loc-v1:putney-landing', { record: putney({ slug: 'hanover-boathouse' }), fetchedAt: 1 });
    expect(mod.cachedRecord('putney-landing')).toBeNull();
    expect(mod.cachedRecord('lake-natoma')).toBeNull();
  });

  it('gives null when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new DOMException('insecure', 'SecurityError'); }, setItem() { throw new DOMException('insecure', 'SecurityError'); } });
    expect(mod.cachedRecord('putney-landing')).toBeNull();
  });
});

// A saved record is replaced when the index lists another revision, and fetched
// again after a day (R14, 01 7.4).
describe('newerRecord', () => {
  const stored = (revision, age = 1000) => ({ record: putney({ revision }), fetchedAt: NOW - age });
  const file = revision => [200, putney({ revision }), 'application/json'];
  const savedAt = () => JSON.parse(map.get('rowhether-loc-v1:putney-landing') ?? 'null');

  it('keeps a record whose revision is the index revision, and asks for nothing more', async () => {
    replies['/locations/index.json'] = [200, index(listed('putney-landing', 2)), 'application/json'];
    expect(await mod.newerRecord(stored(2))).toBeNull();
    expect(asked).toEqual(['/locations/index.json']);
    expect(savedAt()).toBeNull();
  });

  it('counts a record with no revision as 1, in the index and in the record', async () => {
    const bare = { record: putney({ revision: undefined }), fetchedAt: NOW - 1000 };
    replies['/locations/index.json'] = [200, index({ slug: 'putney-landing' }), 'application/json'];
    expect(await mod.newerRecord(bare)).toBeNull();
    expect(await mod.newerRecord(stored(1))).toBeNull();
    replies['/locations/index.json'] = [200, index(listed('putney-landing', 1)), 'application/json'];
    vi.resetModules();
    mod = await import('../src/locations.js');
    expect(await mod.newerRecord(bare)).toBeNull();
    expect(asked.filter(u => u !== '/locations/index.json')).toEqual([]);
  });

  it('fetches the file when the index lists another revision, saves it and gives it back', async () => {
    replies['/locations/index.json'] = [200, index(listed('putney-landing', 3)), 'application/json'];
    replies['/locations/putney-landing.json'] = file(3);
    const next = await mod.newerRecord(stored(2));
    expect(next.revision).toBe(3);
    expect(asked).toEqual(['/locations/index.json', '/locations/putney-landing.json']);
    expect(savedAt()).toEqual({ record: putney({ revision: 3 }), fetchedAt: NOW });
  });

  it('treats a lower index revision as a change as well', async () => {
    replies['/locations/index.json'] = [200, index(listed('putney-landing', 1)), 'application/json'];
    replies['/locations/putney-landing.json'] = file(1);
    expect((await mod.newerRecord(stored(2))).revision).toBe(1);
  });

  it('leaves a record that is not in the index alone while it is fresh', async () => {
    replies['/locations/index.json'] = [200, index(listed('hanover-boathouse', 1)), 'application/json'];
    expect(await mod.newerRecord(stored(5))).toBeNull();
    expect(asked).toEqual(['/locations/index.json']);
  });

  it('fetches a record over a day old again, saves it with the new time, and gives it back only if its revision changed', async () => {
    replies['/locations/index.json'] = [200, index(listed('putney-landing', 2)), 'application/json'];
    replies['/locations/putney-landing.json'] = file(2);
    expect(await mod.newerRecord(stored(2, DAY + 1))).toBeNull();
    expect(asked).toEqual(['/locations/index.json', '/locations/putney-landing.json']);
    expect(savedAt()).toEqual({ record: putney({ revision: 2 }), fetchedAt: NOW });
    // The index and the file disagree on the revision, so a changed record is given back.
    replies['/locations/putney-landing.json'] = file(4);
    expect((await mod.newerRecord(stored(2, 5 * DAY))).revision).toBe(4);
  });

  it('is a day exactly when the record is fetched again from one millisecond past it', async () => {
    replies['/locations/index.json'] = [200, index(listed('putney-landing', 2)), 'application/json'];
    replies['/locations/putney-landing.json'] = file(2);
    await mod.newerRecord(stored(2, DAY));
    expect(asked).toEqual(['/locations/index.json']);
    await mod.newerRecord(stored(2, DAY + 1));
    expect(asked).toEqual(['/locations/index.json', '/locations/putney-landing.json']);
  });

  it('goes by age alone when the index cannot be read', async () => {
    replies['/locations/index.json'] = new TypeError('Failed to fetch');
    replies['/locations/putney-landing.json'] = file(2);
    expect(await mod.newerRecord(stored(2))).toBeNull();
    expect(asked).toEqual(['/locations/index.json']);
    expect(await mod.newerRecord(stored(2, 2 * DAY))).toBeNull();
    expect(asked).toEqual(['/locations/index.json', '/locations/index.json', '/locations/putney-landing.json']);
  });

  it('gives null and saves nothing when the file does not come, or is not this location', async () => {
    replies['/locations/index.json'] = [200, index(listed('putney-landing', 3)), 'application/json'];
    replies['/locations/putney-landing.json'] = new TypeError('Failed to fetch');
    expect(await mod.newerRecord(stored(2))).toBeNull();
    replies['/locations/putney-landing.json'] = [200, putney({ slug: 'hanover-boathouse', revision: 3 }), 'application/json'];
    expect(await mod.newerRecord(stored(2))).toBeNull();
    replies['/locations/putney-landing.json'] = [200, '<!doctype html>', 'text/html'];
    expect(await mod.newerRecord(stored(2))).toBeNull();
    expect(savedAt()).toBeNull();
  });
});

describe('the state of the open location', () => {
  let state;
  const lake = () => ({ ...PUTNEY_FILE, slug: 'some-lake', tz: 'America/Chicago' });
  beforeEach(async () => { state = await import('../src/state.js'); });

  it('is no location until one is opened', () => {
    expect(state.app).toMatchObject({ loc: null, record: null, settings: null, defaults: null, token: 0, refreshing: null });
  });

  it('opens a location: the record, its resolved form, its settings and defaults, with the viewer\'s changes in force', () => {
    state.openLocation(PUTNEY_FILE, { windCaution: 8, heading: 20 });
    const { app } = state;
    expect(app.record).toBe(PUTNEY_FILE);
    expect(app.loc.slug).toBe('putney-landing');
    expect(app.loc.course.heading).toBe(20);
    expect(app.settings.windCaution).toBe(8);
    expect(app.defaults.windCaution).toBe(10);
    expect(app.defaults.heading).toBe(15);
  });

  it('forgets what the one before held, and counts the opening', () => {
    const { app } = state;
    state.openLocation(PUTNEY_FILE, {});
    Object.assign(app, { data: { wx: 1 }, errors: { alerts: true }, updated: 5, fromCache: true, model: {}, openPeriods: new Set(['a']), detailDay: '2026-10-14', homeScroll: 300 });
    state.openLocation(lake(), {});
    expect(app).toMatchObject({ updated: null, fromCache: false, model: null, detailDay: null, homeScroll: 0, token: 2 });
    // toMatchObject would take any object for {}.
    expect(app.data).toEqual({});
    expect(app.errors).toEqual({});
    expect(app.openPeriods.size).toBe(0);
    expect(app.loc.slug).toBe('some-lake');
  });

  it('opens none, which counts as an opening as well, so an answer in flight is dropped', () => {
    const { app } = state;
    state.openLocation(PUTNEY_FILE, {});
    state.openLocation(null);
    expect(app).toMatchObject({ loc: null, record: null, settings: null, defaults: null, token: 2 });
  });

  it('applyOverrides resolves the open record again', () => {
    const { app } = state;
    state.openLocation(PUTNEY_FILE, {});
    state.applyOverrides({ heading: 120, windOff: 14 });
    expect(app.loc.course.heading).toBe(120);
    expect(app.settings.windOff).toBe(14);
    expect(app.defaults.heading).toBe(15);
  });

  it("sets the zone the screens show from the location's", async () => {
    const fmt = await import('../src/format.js');
    state.openLocation(lake(), {});
    expect(fmt.hm(Date.UTC(2026, 5, 15, 12))).toBe('7 AM');
  });

  describe('takeRefresh', () => {
    const answer = (data, errors = {}) => ({ data, errors });

    it('leaves the data as it was, and says no, for a location that is no longer open', () => {
      const { app } = state;
      state.openLocation(PUTNEY_FILE, {});
      const token = app.token;
      app.data = { wx: 'kept' };
      app.updated = 7;
      state.openLocation(lake(), {});
      app.data = { wx: 'other place' };
      app.updated = 9;
      app.errors = { river: true };
      expect(state.takeRefresh(token, answer({ wx: 'late', alerts: 'late' }, { obs: true }))).toBe(false);
      expect(app).toMatchObject({ data: { wx: 'other place' }, updated: 9, errors: { river: true } });
    });

    it('keeps the last good copy of a source that failed, names the failure, and dates a good forecast', () => {
      const { app } = state;
      state.openLocation(PUTNEY_FILE, {});
      app.data = { wx: 'old', alerts: 'old alerts' };
      app.fromCache = true;
      expect(state.takeRefresh(app.token, answer({ wx: 'new' }, { alerts: true }))).toBe(true);
      expect(app.data).toEqual({ wx: 'new', alerts: 'old alerts' });
      expect(app.errors).toEqual({ alerts: true });
      expect(app.updated).toBe(NOW);
      expect(app.fromCache).toBe(false);
    });

    // P1.9: the time of each source's last good fetch, for the staleness rule.
    it('dates each source that answered, and keeps the time of one that failed', () => {
      const { app } = state;
      state.openLocation(PUTNEY_FILE, {});
      app.data = { wx: 'old', alerts: 'old alerts' };
      app.fetched = { wx: 100, alerts: 100 };
      expect(state.takeRefresh(app.token, answer({ wx: 'new', obs: 'o' }, { alerts: true }))).toBe(true);
      expect(app.fetched).toEqual({ wx: NOW, alerts: 100, obs: NOW });
    });

    it('dates the sources even when the forecast itself failed', () => {
      const { app } = state;
      state.openLocation(PUTNEY_FILE, {});
      app.fetched = { wx: 100 };
      expect(state.takeRefresh(app.token, answer({ alerts: 'a' }, { wx: true }))).toBe(true);
      expect(app.fetched).toEqual({ wx: 100, alerts: NOW });
    });

    it('does not date a source for a location that is no longer open', () => {
      const { app } = state;
      state.openLocation(PUTNEY_FILE, {});
      const token = app.token;
      state.openLocation(lake(), {});
      expect(state.takeRefresh(token, answer({ wx: 'late' }))).toBe(false);
      expect(app.fetched).toEqual({});
    });

    it('does not date or unmark a copy when the forecast itself failed', () => {
      const { app } = state;
      state.openLocation(PUTNEY_FILE, {});
      Object.assign(app, { data: { wx: 'old' }, updated: 5, fromCache: true });
      expect(state.takeRefresh(app.token, answer({ alerts: 'a' }, { wx: true }))).toBe(true);
      expect(app).toMatchObject({ data: { wx: 'old', alerts: 'a' }, updated: 5, fromCache: true, errors: { wx: true } });
    });
  });

  describe('fetchedOf', () => {
    it('takes the times a saved copy kept, and gives a source with none the time of the forecast', () => {
      expect(state.fetchedOf({ data: { wx: 1, alerts: 2, obs: 3 }, updated: 50, fetched: { wx: 40, alerts: 30 } })).toEqual({ wx: 40, alerts: 30, obs: 50 });
    });

    it('counts every source as fetched when the forecast was, for a copy from before the times were kept', () => {
      expect(state.fetchedOf({ data: { wx: 1, river: 2 }, updated: 50 })).toEqual({ wx: 50, river: 50 });
    });

    it('does not take a time that is not a number', () => {
      expect(state.fetchedOf({ data: { wx: 1, river: 2, obs: 3 }, updated: 50, fetched: { wx: 'x', river: null, obs: Infinity } })).toEqual({ wx: 50, river: 50, obs: 50 });
    });

    it('is empty for a copy with no data', () => {
      expect(state.fetchedOf({ data: {}, updated: 50 })).toEqual({});
    });
  });

  describe('openLocation and the fetch times', () => {
    it('clears the times of the place that was open', () => {
      const { app } = state;
      state.openLocation(PUTNEY_FILE, {});
      app.fetched = { wx: 5 };
      state.openLocation(lake(), {});
      expect(app.fetched).toEqual({});
      state.openLocation(null);
      expect(app.fetched).toEqual({});
    });
  });

  describe('canRefresh', () => {
    it('is false with no location open', () => {
      expect(state.canRefresh()).toBe(false);
    });

    it('is true for an open location, and false while its own refresh is in flight', () => {
      const { app } = state;
      state.openLocation(PUTNEY_FILE, {});
      expect(state.canRefresh()).toBe(true);
      app.refreshing = app.token;
      expect(state.canRefresh()).toBe(false);
      app.refreshing = null;
      expect(state.canRefresh()).toBe(true);
    });

    it('is true for a location opened while another one\'s refresh is in flight', () => {
      const { app } = state;
      state.openLocation(PUTNEY_FILE, {});
      app.refreshing = app.token;
      state.openLocation(lake(), {});
      expect(app.refreshing).not.toBe(app.token);
      expect(state.canRefresh()).toBe(true);
    });

    it('is false again once no location is open, whatever was in flight', () => {
      const { app } = state;
      state.openLocation(PUTNEY_FILE, {});
      app.refreshing = app.token;
      state.openLocation(null);
      expect(state.canRefresh()).toBe(false);
    });
  });
});

describe('the tabs a location has', () => {
  const ORDER = ['week', 'wind', 'river', 'storms', 'fog', 'temperature', 'rain', 'light', 'air'];
  let detail, state;
  beforeEach(async () => { detail = await import('../src/render/detail/index.js'); state = await import('../src/state.js'); });

  it('are all nine at Putney, which has a flow gauge, in tab order', () => {
    state.openLocation(PUTNEY_FILE, {});
    expect(detail.viewsFor(state.app.loc).map(v => v.key)).toEqual(ORDER);
  });

  it('are eight, with no River, where the location has no flow row of its own or from its waterway', () => {
    const lake = { ...PUTNEY_FILE, slug: 'some-lake', sources: PUTNEY_FILE.sources.filter(s => s.role !== 'flow'), waterwayRecord: { ...PUTNEY_FILE.waterwayRecord, sources: PUTNEY_FILE.waterwayRecord.sources.filter(s => s.role !== 'flow' && s.role !== 'flow_forecast') } };
    state.openLocation(lake, {});
    expect(detail.viewsFor(state.app.loc).map(v => v.key)).toEqual(ORDER.filter(k => k !== 'river'));
  });

  it('keep every entry in the registry, so a hidden tab is still a name the router knows', () => {
    expect(detail.VIEWS.map(v => v.key)).toEqual(ORDER);
    expect(detail.VIEWS.filter(v => v.when).map(v => v.key)).toEqual(['river']);
  });
});

// Dock reports belong to Putney: the reports table has no location until phase 3.
describe('dock reports', () => {
  let reports, state, dom;
  beforeEach(async () => {
    dom = installFakeDom();
    state = await import('../src/state.js');
    reports = await import('../src/reports.js');
    Object.assign(state.app, { info: { env: 'production', reports: true }, reports: { hours: 3, reports: [{ t: NOW - 600e3, water: 'flat', fog: 'clear', debris: false }] }, model: null });
  });
  afterEach(() => uninstallFakeDom());

  it('are drawn at Putney, when /api/info says they are on', () => {
    state.openLocation(PUTNEY_FILE, {});
    reports.renderReports();
    expect(dom.el('dockReports').hidden).toBe(false);
    expect(dom.el('dockReports').textContent).toContain('At the dock: Flat water, no fog');
  });

  it('are hidden at another location, though /api/info says they are on', () => {
    state.openLocation({ ...PUTNEY_FILE, slug: 'some-lake' }, {});
    reports.renderReports();
    expect(dom.el('dockReports').hidden).toBe(true);
    expect(dom.el('dockReports').innerHTML).toBe('');
  });

  it('are hidden at Putney when /api/info says they are off', () => {
    state.openLocation(PUTNEY_FILE, {});
    state.app.info = { env: 'production', reports: false };
    reports.renderReports();
    expect(dom.el('dockReports').hidden).toBe(true);
  });

  it('are not asked for at another location, nor with no location open', async () => {
    state.openLocation({ ...PUTNEY_FILE, slug: 'some-lake' }, {});
    await reports.loadReports();
    state.openLocation(null);
    await reports.loadReports();
    expect(asked).toEqual([]);
  });

  it('are asked for at Putney', async () => {
    replies['/api/reports'] = [200, { enabled: true, hours: 3, reports: [] }, 'application/json'];
    state.openLocation(PUTNEY_FILE, {});
    await reports.loadReports();
    expect(asked).toEqual(['/api/reports']);
  });
});
