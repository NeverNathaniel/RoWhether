// What an address asks for (P1.4, 07 4.2): the page, the location, the tab and
// the day. These are pure, so the tests pass addresses and read what comes back.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseRoute, parseHash, homeTarget } from '../src/route.js';
import { installFakeDom, uninstallFakeDom } from './helpers/fakedom.js';
import { PUTNEY_FILE } from './helpers/putney-file.js';

// parseRoute takes anything with the parts of a location, and a URL has them.
const at = href => parseRoute(new URL(href, 'https://rowhether.com'));
const TABS = ['week', 'wind', 'river', 'storms', 'fog', 'temperature', 'rain', 'light', 'air'];
const NO_FLOW = TABS.filter(k => k !== 'river');

describe('parseRoute', () => {
  it('reads / and /index.html as home', () => {
    for (const href of ['/', '/index.html']) {
      expect(at(href), href).toEqual({ page: 'home', slug: null, view: null, day: null, open: null });
    }
  });

  it('reads one segment that is a slug as a location', () => {
    expect(at('/putney-landing')).toEqual({ page: 'location', slug: 'putney-landing', view: null, day: null, open: null });
    expect(at('/lake-quinsigamond').slug).toBe('lake-quinsigamond');
    expect(at('/abc').page).toBe('location');
    expect(at(`/${'a'.repeat(48)}`).page).toBe('location');
  });

  it('keeps the tab and the day from the hash, for a location and for home', () => {
    expect(at('/putney-landing#wind/2026-10-14')).toMatchObject({ page: 'location', slug: 'putney-landing', view: 'wind', day: '2026-10-14' });
    expect(at('/putney-landing#wind')).toMatchObject({ view: 'wind', day: null });
    expect(at('/putney-landing#/wind/2026-10-14')).toMatchObject({ view: 'wind', day: '2026-10-14' });
    expect(at('/#river')).toMatchObject({ page: 'home', view: 'river' });
  });

  it('reads no hash, #, and #now as the home screen of the location', () => {
    for (const href of ['/putney-landing', '/putney-landing#', '/putney-landing#now', '/putney-landing#now/2026-10-14']) {
      expect(at(href).view, href).toBeNull();
    }
  });

  it('drops a day that is not written as a date, and leaves a tab it does not know to the caller', () => {
    expect(at('/putney-landing#wind/bad').day).toBeNull();
    expect(at('/putney-landing#wind/2026-1-1').day).toBeNull();
    expect(at('/putney-landing#wind/2026-10-14/extra')).toMatchObject({ view: 'wind', day: '2026-10-14' });
    // Whether the location has the tab is for show() to say, once it has the location.
    expect(at('/putney-landing#nope').view).toBe('nope');
  });

  it('reads anything else as not found, and keeps its path', () => {
    expect(at('/Putney-Landing')).toMatchObject({ page: 'notfound', slug: null, path: 'Putney-Landing' });
    expect(at('/putney-landing/extra')).toMatchObject({ page: 'notfound', slug: null, path: 'putney-landing/extra' });
    expect(at('/some/where/else.html')).toMatchObject({ page: 'notfound', path: 'some/where/else.html' });
  });

  it('does not take a reserved name, a short or a long segment, or a slash at the end for a location', () => {
    for (const href of ['/api', '/assets', '/admin', '/privacy', '/locations', '/index', '/ab', '/-ab', '/ab-', '/a--b', '/putney-landing/', `/${'a'.repeat(49)}`]) {
      expect(at(href).page, href).toBe('notfound');
      expect(at(href).slug, href).toBeNull();
    }
  });

  it('reads an encoded path, and a broken one as typed', () => {
    expect(at('/caf%C3%A9')).toMatchObject({ page: 'notfound', path: 'café' });
    expect(parseRoute({ pathname: '/%E0%A4%A', hash: '', search: '' })).toMatchObject({ page: 'notfound', path: '%E0%A4%A' });
  });

  it('reads ?open=picker, and no other value', () => {
    expect(at('/?open=picker').open).toBe('picker');
    expect(at('/putney-landing?open=picker#wind')).toMatchObject({ page: 'location', open: 'picker', view: 'wind' });
    expect(at('/?open=other').open).toBeNull();
    expect(at('/?picker').open).toBeNull();
  });
});

describe('parseHash', () => {
  it('reads a tab the location has, with its day', () => {
    expect(parseHash('#wind', TABS)).toEqual({ name: 'wind', day: null });
    expect(parseHash('#wind/2026-10-14', TABS)).toEqual({ name: 'wind', day: '2026-10-14' });
    expect(parseHash('#/wind/2026-10-14', TABS)).toEqual({ name: 'wind', day: '2026-10-14' });
    expect(parseHash('wind', TABS)).toEqual({ name: 'wind', day: null });
    expect(parseHash('#fog/', TABS)).toEqual({ name: 'fog', day: null });
  });

  it('gives null for Now, for no hash, and for a name that is not a tab', () => {
    for (const h of ['', '#', '#now', '#nope', '#WIND', undefined, null]) expect(parseHash(h, TABS), String(h)).toBeNull();
  });

  it('gives null for a tab the location does not have, so #river falls back to Now where there is no flow', () => {
    expect(parseHash('#river', TABS)).toEqual({ name: 'river', day: null });
    expect(parseHash('#river', NO_FLOW)).toBeNull();
    expect(parseHash('#river/2026-10-14', NO_FLOW)).toBeNull();
    expect(parseHash('#wind', NO_FLOW)).toEqual({ name: 'wind', day: null });
    expect(parseHash('#wind', [])).toBeNull();
  });

  it('keeps a day only when it is written as a date', () => {
    expect(parseHash('#wind/bad', TABS).day).toBeNull();
    expect(parseHash('#week/2026-1-1', TABS).day).toBeNull();
    expect(parseHash('#air/2026-12-31', TABS).day).toBe('2026-12-31');
    expect(parseHash('#wind/2026-10-14/extra', TABS).day).toBe('2026-10-14');
  });
});

describe('homeTarget', () => {
  it('opens the location stored as the last one, and replaces the address with it', () => {
    expect(homeTarget({ last: 'hanover-boathouse' })).toEqual({ slug: 'hanover-boathouse', replace: true });
    expect(homeTarget({ last: 'putney-landing' })).toEqual({ slug: 'putney-landing', replace: true });
  });

  it('opens Putney Landing, and keeps the address, when nothing is stored', () => {
    for (const last of [null, undefined, '']) expect(homeTarget({ last }), String(last)).toEqual({ slug: 'putney-landing', keepAddress: true });
    expect(homeTarget({})).toEqual({ slug: 'putney-landing', keepAddress: true });
  });

  it('does not take what is stored on trust: something that is not a slug is as good as nothing', () => {
    for (const last of ['Putney-Landing', 'api', 'a', '../x', 'x/y', 'lake lake', `${'a'.repeat(60)}`, '<script>', '-ab', 42, {}]) {
      expect(homeTarget({ last }), String(last)).toEqual({ slug: 'putney-landing', keepAddress: true });
    }
  });
});

// The router in the page: what it does with an address, a click and the history
// buttons. The page, the history and the location are stand-ins, and each test
// has its own copy of the module, since it holds the opener and the path it last showed.
describe('the router in the page', () => {
  const ORIGIN = 'https://rowhether.com';
  let r, state, detail, dom, loc, hist, opened, winOn, docOn, store;

  // The location moves as the browser's does: an address resolves against the current one.
  const goTo = href => { const u = new URL(href, ORIGIN + loc.pathname + loc.search); Object.assign(loc, { pathname: u.pathname, search: u.search, hash: u.hash }); };

  // A page at `href`, with the router started and an opener that notes what it is asked for.
  async function start(href, stored = {}) {
    vi.resetModules();
    store = new Map(Object.entries(stored));
    vi.stubGlobal('localStorage', { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); }, key: i => [...store.keys()][i] ?? null, get length() { return store.size; } });
    loc = { origin: ORIGIN, pathname: '/', search: '', hash: '' };
    goTo(href);
    hist = { state: null, calls: [], pushState(s, t, h) { this.calls.push(['push', h]); goTo(h); }, replaceState(s, t, h) { this.calls.push(['replace', h]); goTo(h); } };
    winOn = {}; docOn = {};
    dom = installFakeDom();
    document.addEventListener = (type, fn) => { docOn[type] = fn; };
    vi.stubGlobal('window', { addEventListener: (type, fn) => { winOn[type] = fn; }, scrollY: 0, scrollTo: vi.fn() });
    vi.stubGlobal('location', loc);
    vi.stubGlobal('history', hist);
    vi.stubGlobal('requestAnimationFrame', fn => fn());
    state = await import('../src/state.js');
    detail = await import('../src/render/detail/index.js');
    for (const v of detail.VIEWS) v.load = () => new Promise(() => {}); // the views chunk is the browser checks'
    r = await import('../src/route.js');
    opened = [];
    r.initRoutes((slug, keep) => { opened.push([slug, !!keep]); });
  }
  afterEach(() => { uninstallFakeDom(); vi.unstubAllGlobals(); });

  // A click on `target`, as the browser's event gives it.
  const click = (target, extra = {}) => {
    const e = { target, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    docOn.click(e);
    return e;
  };
  const link = (href, origin = ORIGIN) => ({ origin, getAttribute: () => href });
  const inside = (selector, node) => ({ closest: s => (s === selector ? node : null) });

  describe('on start', () => {
    it('opens the location the address names', async () => {
      await start('/hanover-boathouse#wind');
      expect(opened).toEqual([['hanover-boathouse', false]]);
      expect(hist.calls).toEqual([]);
    });

    it('opens Putney Landing at "/" when nothing is stored, and leaves the address alone', async () => {
      await start('/');
      expect(opened).toEqual([['putney-landing', true]]);
      expect(hist.calls).toEqual([]);
      expect(loc.pathname).toBe('/');
    });

    it('opens the last location at "/", and puts it in the address with the hash, with no new history entry', async () => {
      await start('/#wind/2026-10-14', { 'rowhether-last-v1': 'hanover-boathouse' });
      expect(opened).toEqual([['hanover-boathouse', false]]);
      expect(hist.calls).toEqual([['replace', '/hanover-boathouse#wind/2026-10-14']]);
      expect(loc.pathname + loc.hash).toBe('/hanover-boathouse#wind/2026-10-14');
    });

    it('does not take a stored location that is not a slug', async () => {
      await start('/', { 'rowhether-last-v1': '../etc/passwd' });
      expect(opened).toEqual([['putney-landing', true]]);
      expect(hist.calls).toEqual([]);
    });

    it('opens none and shows the not found page for an address that is not a location', async () => {
      await start('/Putney-Landing/extra');
      expect(opened).toEqual([[null, false]]);
      expect(dom.el('notFound').hidden).toBe(false);
      expect(dom.el('notFound').textContent).toBe('No location hereNo location at rowhether.com/Putney-Landing/extra.');
      expect([dom.el('tabs').hidden, dom.el('actions').hidden, dom.el('home').hidden, dom.el('detail').hidden]).toEqual([true, true, true, true]);
    });
  });

  describe('the page for no location', () => {
    it('writes the address as text, so it cannot add markup', async () => {
      await start('/%3Cb%3Ex%3C%2Fb%3E');
      expect(dom.el('notFound').innerHTML).toContain('rowhether.com/&lt;b&gt;x&lt;/b&gt;.');
      expect(dom.el('notFound').innerHTML).not.toContain('<b>');
    });

    it('says the location did not load, with a button to try again, which asks for the same address again', async () => {
      await start('/lake-natoma');
      r.showFailed();
      expect(dom.el('notFound').hidden).toBe(false);
      expect(dom.el('notFound').textContent).toContain('Could not load this location');
      expect(dom.el('notFound').innerHTML).toContain('<button id="retryBtn">Try again</button>');
      expect(opened).toEqual([['lake-natoma', false]]);
      const again = click(inside('#retryBtn', {}));
      expect(opened).toEqual([['lake-natoma', false], ['lake-natoma', false]]);
      expect(again.defaultPrevented).toBe(false);
    });

    it('is left for the tabs and the home screen when a location opens', async () => {
      await start('/hanover-boathouse');
      r.showMissing('hanover-boathouse');
      expect(dom.el('notFound').hidden).toBe(false);
      state.openLocation(PUTNEY_FILE, {});
      r.showTab();
      expect([dom.el('notFound').hidden, dom.el('tabs').hidden, dom.el('actions').hidden, dom.el('home').hidden, dom.el('detail').hidden]).toEqual([true, false, false, false, true]);
    });

    it('leaves no tab open', async () => {
      await start('/putney-landing#wind');
      state.openLocation(PUTNEY_FILE, {});
      r.showTab();
      expect(state.app.view).toEqual({ name: 'wind', day: null });
      r.showMissing('x');
      expect(state.app.view).toBeNull();
    });
  });

  describe('a click on a link with data-nav', () => {
    it('goes to the address with no page load: pushes it and opens its location', async () => {
      await start('/putney-landing');
      const e = click(inside('a[data-nav]', link('/hanover-boathouse')));
      expect(e.defaultPrevented).toBe(true);
      expect(hist.calls).toEqual([['push', '/hanover-boathouse']]);
      expect(opened).toEqual([['putney-landing', false], ['hanover-boathouse', false]]);
    });

    it.each([
      ['a modified click', { ctrlKey: true }], ['a command click', { metaKey: true }], ['a shift click', { shiftKey: true }],
      ['an alt click', { altKey: true }], ['a middle click', { button: 1 }], ['a click another handler took', { defaultPrevented: true }]
    ])('leaves %s to the browser', async (_, extra) => {
      await start('/putney-landing');
      const e = click(inside('a[data-nav]', link('/hanover-boathouse')), extra);
      expect(e.defaultPrevented).toBe(!!extra.defaultPrevented);
      expect(hist.calls).toEqual([]);
      expect(opened).toHaveLength(1);
    });

    it('leaves a link to another site, and a click on something else, alone', async () => {
      await start('/putney-landing');
      click(inside('a[data-nav]', link('https://example.com/x', 'https://example.com')));
      click(inside('nothing', {}));
      click({}); // a target with no closest(), such as the document
      expect(hist.calls).toEqual([]);
      expect(opened).toHaveLength(1);
    });
  });

  describe('the back and forward buttons, and the tab links', () => {
    it('open the location when the path changed', async () => {
      await start('/putney-landing');
      goTo('/hanover-boathouse');
      winOn.popstate();
      expect(opened).toEqual([['putney-landing', false], ['hanover-boathouse', false]]);
    });

    it('do nothing on a popstate that only moved the hash, since hashchange follows it', async () => {
      await start('/putney-landing');
      goTo('#wind');
      winOn.popstate();
      expect(opened).toHaveLength(1);
      winOn.hashchange();
      expect(opened).toEqual([['putney-landing', false], ['putney-landing', false]]);
    });

    it('ask for the same location again when the hash changed too, and leave the opener to show its tab once', async () => {
      await start('/putney-landing#wind');
      goTo('/hanover-boathouse#fog');
      winOn.popstate();
      expect(opened.at(-1)).toEqual(['hanover-boathouse', false]);
      winOn.hashchange();
      expect(opened.slice(1)).toEqual([['hanover-boathouse', false], ['hanover-boathouse', false]]);
    });

    it('do not show again for a popstate at the address the router replaced "/" with', async () => {
      await start('/', { 'rowhether-last-v1': 'hanover-boathouse' });
      winOn.popstate();
      expect(opened).toEqual([['hanover-boathouse', false]]);
    });
  });

  describe('the tab bar and the tab', () => {
    const ids = html => [...html.matchAll(/data-tab="([a-z]+)"/g)].map(m => m[1]);

    it('lists Now and every tab the open location has', async () => {
      await start('/putney-landing');
      state.openLocation(PUTNEY_FILE, {});
      r.renderTabs();
      expect(ids(dom.el('tabs').innerHTML)).toEqual(['now', 'week', 'wind', 'river', 'storms', 'fog', 'temperature', 'rain', 'light', 'air']);
      expect(dom.el('tabs').innerHTML).toContain('<a href="#river" data-tab="river">River</a>');
    });

    it('leaves out River where the location has no flow, and is drawn again for the next location', async () => {
      await start('/putney-landing');
      const lake = { ...PUTNEY_FILE, slug: 'some-lake', sources: PUTNEY_FILE.sources.filter(s => s.role !== 'flow'), waterwayRecord: { ...PUTNEY_FILE.waterwayRecord, sources: [] } };
      state.openLocation(lake, {});
      r.renderTabs();
      expect(ids(dom.el('tabs').innerHTML)).not.toContain('river');
      expect(ids(dom.el('tabs').innerHTML)).toHaveLength(9);
      state.openLocation(PUTNEY_FILE, {});
      r.renderTabs();
      expect(ids(dom.el('tabs').innerHTML)).toContain('river');
    });

    it('shows the tab the hash names, and the day', async () => {
      await start('/putney-landing#wind/2026-10-14');
      state.openLocation(PUTNEY_FILE, {});
      r.showTab();
      expect(state.app.view).toEqual({ name: 'wind', day: '2026-10-14' });
      expect([dom.el('home').hidden, dom.el('detail').hidden]).toEqual([true, false]);
      expect(hist.calls).toEqual([]);
    });

    it('shows Now for no hash, #now, and a hash that is not a tab, and leaves the address as it is', async () => {
      for (const hash of ['', '#now', '#nope']) {
        await start(`/putney-landing${hash}`);
        state.openLocation(PUTNEY_FILE, {});
        r.showTab();
        expect(state.app.view, hash).toBeNull();
        expect([dom.el('home').hidden, dom.el('detail').hidden], hash).toEqual([false, true]);
        expect(hist.calls, hash).toEqual([]);
      }
    });

    it('shows Now for a tab the location does not have, and takes the hash out of the address', async () => {
      await start('/some-lake?x=1#river/2026-10-14');
      const lake = { ...PUTNEY_FILE, slug: 'some-lake', sources: PUTNEY_FILE.sources.filter(s => s.role !== 'flow'), waterwayRecord: { ...PUTNEY_FILE.waterwayRecord, sources: [] } };
      state.openLocation(lake, {});
      r.showTab();
      expect(state.app.view).toBeNull();
      expect([dom.el('home').hidden, dom.el('detail').hidden]).toEqual([false, true]);
      expect(hist.calls).toEqual([['replace', '/some-lake?x=1']]);
      expect(loc.hash).toBe('');
    });

    it('moves to another day with no new history entry', async () => {
      await start('/putney-landing#wind');
      state.openLocation(PUTNEY_FILE, {});
      r.showTab();
      r.setDay('2026-10-15');
      expect(hist.calls).toEqual([['replace', '#wind/2026-10-15']]);
      expect(state.app).toMatchObject({ view: { name: 'wind', day: '2026-10-15' }, detailDay: '2026-10-15' });
      expect(loc.pathname + loc.hash).toBe('/putney-landing#wind/2026-10-15');
    });
  });
});
