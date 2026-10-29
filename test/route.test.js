// What an address asks for (P1.4, 07 4.2): the page, the location, the tab and
// the day. These are pure, so the tests pass addresses and read what comes back.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseRoute, parseHash, homeTarget } from '../src/route.js';
import { installFakeDom, uninstallFakeDom } from './helpers/fakedom.js';
import { PUTNEY_FILE } from './helpers/putney-file.js';
import { FIRST_VISIT_PUTNEY_UNTIL as UNTIL } from '../src/config.js';

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

  // The owner's page (P1.18). The word is reserved, so it is never a location, and it is one address only.
  it('reads /admin as the owner\'s page, with its tab in the hash, and no address that only starts with it', () => {
    expect(at('/admin')).toEqual({ page: 'admin', slug: null, view: null, day: null, open: null });
    expect(at('/admin#metrics')).toMatchObject({ page: 'admin', slug: null, view: 'metrics' });
    expect(at('/admin?x=1')).toMatchObject({ page: 'admin' });
    for (const href of ['/admin/', '/admin/metrics', '/Admin', '/ADMIN', '/admin.html', '/api/admin/metrics', '/mod']) {
      expect(at(href).page, href).toBe('notfound');
    }
    // A word that only starts with it is a location's address like any other.
    expect(at('/administrator')).toMatchObject({ page: 'location', slug: 'administrator' });
  });

  it('does not take a reserved name, a short or a long segment, or a slash at the end for a location', () => {
    for (const href of ['/api', '/assets', '/privacy', '/locations', '/index', '/ab', '/-ab', '/ab-', '/a--b', '/putney-landing/', `/${'a'.repeat(49)}`]) {
      expect(at(href).page, href).toBe('notfound');
      expect(at(href).slug, href).toBeNull();
    }
  });

  // The host answers these with their own files (P1.16, 07 4.2, 5.15): the app never opens one as a location.
  it('does not take the address of a static page for a location', () => {
    for (const href of ['/privacy', '/terms', '/about', '/privacy#wind', '/privacy?open=picker']) {
      expect(at(href), href).toMatchObject({ page: 'notfound', slug: null, path: href.split(/[#?]/)[0].slice(1) });
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

// The last moment inside the first-visit window (07 5.1), and the first one after it.
const INSIDE = UNTIL - 1;

describe('homeTarget', () => {
  it('opens the location stored as the last one, and replaces the address with it, inside the window and after it', () => {
    for (const now of [0, INSIDE, UNTIL, UNTIL + 400 * 864e5]) {
      expect(homeTarget({ last: 'hanover-boathouse', now }), String(now)).toEqual({ slug: 'hanover-boathouse', replace: true });
      expect(homeTarget({ last: 'putney-landing', now }), String(now)).toEqual({ slug: 'putney-landing', replace: true });
    }
  });

  it('shows Putney Landing with the note, and keeps the address, when nothing is stored inside the window', () => {
    for (const last of [null, undefined, '']) {
      for (const now of [0, Date.UTC(2026, 9, 24), INSIDE]) {
        expect(homeTarget({ last, now }), `${last} ${now}`).toEqual({ slug: 'putney-landing', keepAddress: true, note: true });
      }
    }
  });

  it('is the picker page when nothing is stored and the window has ended, from the first moment after it', () => {
    for (const now of [UNTIL, UNTIL + 1, UNTIL + 400 * 864e5]) {
      expect(homeTarget({ last: null, now }), String(now)).toEqual({ page: 'picker' });
    }
  });

  it('opens Putney Landing at its address after Dismiss, which stores it as the last location, inside the window and after it', () => {
    for (const now of [INSIDE, UNTIL]) expect(homeTarget({ last: 'putney-landing', now }), String(now)).toEqual({ slug: 'putney-landing', replace: true });
  });

  it('does not take what is stored on trust: something that is not a slug is as good as nothing', () => {
    for (const last of ['Putney-Landing', 'api', 'a', '../x', 'x/y', 'lake lake', `${'a'.repeat(60)}`, '<script>', '-ab', 42, {}]) {
      expect(homeTarget({ last, now: INSIDE }), String(last)).toEqual({ slug: 'putney-landing', keepAddress: true, note: true });
      expect(homeTarget({ last, now: UNTIL }), String(last)).toEqual({ page: 'picker' });
    }
  });
});

// The router in the page: what it does with an address, a click and the history
// buttons. The page, the history and the location are stand-ins, and each test
// has its own copy of the module, since it holds the opener and the path it last showed.
describe('the router in the page', () => {
  const ORIGIN = 'https://rowhether.com';
  let r, state, detail, dom, loc, hist, opened, notes, picked, winOn, docOn, store, gate;
  // Inside the first-visit window (07 5.1), unless a case says another: "/" reads the time.
  const NOW = Date.UTC(2026, 5, 15, 16);

  // The location moves as the browser's does: an address resolves against the current one.
  const goTo = href => { const u = new URL(href, ORIGIN + loc.pathname + loc.search); Object.assign(loc, { pathname: u.pathname, search: u.search, hash: u.hash }); };

  // A page at `href`, with the router started and an opener that notes what it is asked for,
  // and a picker that notes what it is asked to show. `entry` is what the history entry holds.
  async function start(href, stored = {}, now = NOW, entry = null) {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    store = new Map(Object.entries(stored));
    vi.stubGlobal('localStorage', { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); }, key: i => [...store.keys()][i] ?? null, get length() { return store.size; } });
    loc = { origin: ORIGIN, pathname: '/', search: '', hash: '' };
    goTo(href);
    hist = { state: entry, calls: [], states: [], pushState(s, t, h) { this.calls.push(['push', h]); this.state = s; goTo(h); }, replaceState(s, t, h) { this.calls.push(['replace', h]); this.states.push(s); this.state = s; goTo(h); } };
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
    opened = []; notes = []; picked = [];
    r.initRoutes((slug, keep, note) => { opened.push([slug, !!keep]); notes.push(!!note); return gate; }, o => { picked.push(o); });
  }
  afterEach(() => { uninstallFakeDom(); vi.unstubAllGlobals(); vi.useRealTimers(); gate = undefined; });

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
      expect(loc.pathname + loc.search + loc.hash).toBe('/');
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
      expect(loc.pathname).toBe('/');
    });

    it('does not open /privacy as a location: the app has no page there, and asks for none', async () => {
      await start('/privacy');
      expect(opened).toEqual([[null, false]]);
      expect(dom.el('notFound').textContent).toBe('No location hereNo location at rowhether.com/privacy.');
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

  describe('the first visit and the picker (07 5.1)', () => {
    const tick = () => new Promise(done => setTimeout(done, 0));
    const hiddenPage = () => [dom.el('notFound').hidden, dom.el('tabs').hidden, dom.el('actions').hidden, dom.el('home').hidden, dom.el('detail').hidden];

    it('shows Putney Landing with the note at "/" inside the window, and stores no location', async () => {
      await start('/');
      expect(opened).toEqual([['putney-landing', true]]);
      expect(notes).toEqual([true]);
      expect(picked).toEqual([]);
      expect(store.has('rowhether-last-v1')).toBe(false);
      expect(loc.pathname).toBe('/');
      expect(hist.calls, 'arriving writes nothing to the history').toEqual([]);
    });

    it('shows the picker page at "/" when nothing is stored and the window has ended', async () => {
      await start('/', {}, UNTIL);
      expect(opened).toEqual([[null, false]]);
      expect(picked).toEqual([{ mode: 'page' }]);
      expect(hiddenPage()).toEqual([false, true, true, true, true]);
      expect(loc.pathname).toBe('/');
      expect(store.has('rowhether-last-v1')).toBe(false);
      expect(hist.calls).toEqual([]);
    });

    it('opens the last location at its address, with no note, whatever the time', async () => {
      for (const now of [NOW, UNTIL, UNTIL + 400 * 864e5]) {
        await start('/', { 'rowhether-last-v1': 'putney-landing' }, now);
        expect(opened, String(now)).toEqual([['putney-landing', false]]);
        expect(notes).toEqual([false]);
        expect(loc.pathname).toBe('/putney-landing');
        expect(picked).toEqual([]);
      }
    });

    it('keeps a tab hash on the way, so "/#wind" with nothing stored shows Putney with the note on that tab', async () => {
      await start('/#wind');
      expect(opened).toEqual([['putney-landing', true]]);
      expect(notes).toEqual([true]);
      expect(loc.hash).toBe('#wind');
    });

    it('leaves a location address alone: no note, no picker', async () => {
      await start('/hanover-boathouse', {}, UNTIL);
      expect(opened).toEqual([['hanover-boathouse', false]]);
      expect(notes).toEqual([false]);
      expect(picked).toEqual([]);
      expect(hist.calls).toEqual([]);
    });

    it('?open=picker opens the picker over the last location, and takes the query out of the address', async () => {
      await start('/?open=picker', { 'rowhether-last-v1': 'hanover-boathouse' });
      expect(opened).toEqual([['hanover-boathouse', false]]);
      expect(loc.pathname + loc.search).toBe('/hanover-boathouse');
      await tick();
      expect(picked).toEqual([{ mode: 'sheet' }]);
    });

    it('?open=picker over a location address opens the sheet after the location, and is taken out of the address with the hash kept', async () => {
      let opens;
      gate = new Promise(done => { opens = done; }); // the opener's answer: the location has opened when it settles
      await start('/putney-landing?open=picker#wind');
      expect(opened).toEqual([['putney-landing', false]]);
      expect(hist.calls).toEqual([['replace', '/putney-landing#wind']]);
      expect(loc.search).toBe('');
      await tick();
      expect(picked).toEqual([]); // not before the location has opened
      opens();
      await tick();
      expect(picked).toEqual([{ mode: 'sheet' }]);
      // A popstate at the address the router wrote is not a new address.
      winOn.popstate();
      expect(opened).toHaveLength(1);
    });

    it('?open=picker with nothing stored is the picker page, not Putney with its note', async () => {
      await start('/?open=picker');
      expect(opened).toEqual([[null, false]]);
      expect(picked).toEqual([{ mode: 'page' }]);
      expect(loc.pathname + loc.search).toBe('/');
      expect(hiddenPage()).toEqual([false, true, true, true, true]);
    });

    it('does not read a query that is not open=picker', async () => {
      await start('/?open=other&x=1');
      expect(opened).toEqual([['putney-landing', true]]);
      expect(loc.search).toBe('?open=other&x=1');
    });

    it('asks the picker for the search under an address with no location, with the address, and under a location that did not load, with none', async () => {
      await start('/Putney-Landing/extra');
      expect(picked).toEqual([{ mode: 'notfound', query: 'Putney-Landing/extra' }]);
      r.showMissing('lake-quinsigamond');
      expect(picked.at(-1)).toEqual({ mode: 'notfound', query: 'lake-quinsigamond' });
      r.showFailed();
      expect(picked.at(-1)).toEqual({ mode: 'notfound' });
    });

    it('the picker page is drawn in the page for no location, with nothing of the last one left in it', async () => {
      await start('/Putney-Landing/extra');
      expect(dom.el('notFound').textContent).toContain('No location here');
      await start('/', {}, UNTIL);
      expect(dom.el('notFound').textContent).toBe('');
      expect(dom.el('notFound').hidden).toBe(false);
    });

    // "/" would open the last location now, so an entry for "/" that is left by a link in the app
    // remembers what it showed.
    it('Back to the picker page returns to it, and not to the location chosen from it', async () => {
      await start('/', {}, UNTIL);
      expect(hist.calls).toEqual([]);
      click(inside('a[data-nav]', link('/hanover-boathouse')));
      expect(hist.calls).toEqual([['replace', '/'], ['push', '/hanover-boathouse']]);
      const entry = hist.states[0];
      expect(entry).toEqual({ home: 'picker' });
      expect(opened.at(-1)).toEqual(['hanover-boathouse', false]);
      store.set('rowhether-last-v1', 'hanover-boathouse'); // opening it stores it
      goTo('/'); hist.state = entry; // Back
      winOn.popstate();
      expect(opened.at(-1)).toEqual([null, false]);
      expect(picked.at(-1)).toEqual({ mode: 'page' });
      expect(loc.pathname).toBe('/');
    });

    it('Back to Putney with its note returns to it at "/" with no note, once another location has been chosen', async () => {
      await start('/');
      r.navigate('/hanover-boathouse');
      const entry = hist.states[0];
      expect(entry).toEqual({ home: 'putney-landing' });
      store.set('rowhether-last-v1', 'hanover-boathouse');
      goTo('/'); hist.state = entry;
      winOn.popstate();
      expect(opened.at(-1)).toEqual(['putney-landing', true]);
      expect(notes.at(-1)).toBe(false);
      expect(loc.pathname).toBe('/');
      expect(store.get('rowhether-last-v1')).toBe('hanover-boathouse'); // showing it did not choose it
    });

    it('notes the tab it was left from, for a "/" with a tab hash', async () => {
      await start('/#wind');
      r.navigate('/hanover-boathouse');
      expect(hist.calls[0]).toEqual(['replace', '/#wind']);
      expect(hist.states[0]).toEqual({ home: 'putney-landing' });
    });

    it('leaves the entry alone when a location is left for another: only "/" is not its own address', async () => {
      await start('/putney-landing#wind');
      r.navigate('/hanover-boathouse');
      expect(hist.calls).toEqual([['push', '/hanover-boathouse']]);
    });

    it('writes nothing for a "/" that the last location replaced: that is a location address now', async () => {
      await start('/', { 'rowhether-last-v1': 'hanover-boathouse' });
      r.navigate('/putney-landing');
      expect(hist.calls).toEqual([['replace', '/hanover-boathouse'], ['push', '/putney-landing']]);
    });

    it('an entry that remembers Putney, once Putney is the last location, goes to its address', async () => {
      await start('/', { 'rowhether-last-v1': 'putney-landing' }, NOW, { home: 'putney-landing' });
      expect(opened).toEqual([['putney-landing', false]]);
      expect(loc.pathname).toBe('/putney-landing');
    });

    it('an entry that remembers Putney, with no location chosen, shows it with the note again', async () => {
      await start('/', {}, NOW, { home: 'putney-landing' });
      expect(opened).toEqual([['putney-landing', true]]);
      expect(notes).toEqual([true]);
    });

    it('does not take what the entry remembers on trust', async () => {
      await start('/', {}, UNTIL, { home: '../etc' });
      expect(picked).toEqual([{ mode: 'page' }]);
      await start('/', {}, NOW, { home: { x: 1 } });
      expect(opened).toEqual([['putney-landing', true]]);
    });

    it('keeps what a history entry holds when it adds the tab or the day', async () => {
      await start('/putney-landing#wind', {}, NOW, { keep: 1 });
      state.openLocation(PUTNEY_FILE, {});
      r.showTab();
      r.setDay('2026-10-14');
      expect(hist.state).toEqual({ keep: 1 });
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

    // The privacy page is a file the host serves, linked from the install and Settings notes with no
    // data-nav: the browser loads it, and the router keeps out of it.
    it('leaves a link to a static page, which has no data-nav, to the browser', async () => {
      await start('/putney-landing');
      const e = click({ closest: () => null, getAttribute: () => '/privacy' });
      expect(e.defaultPrevented).toBe(false);
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
