// What an address asks for (P1.4, 07 4.2): the page, the location, the tab and
// the day. These are pure, so the tests pass addresses and read what comes back.
import { describe, it, expect } from 'vitest';
import { parseRoute, parseHash, homeTarget } from '../src/route.js';

// parseRoute takes anything with the parts of a location, and a URL has them.
const at = href => parseRoute(new URL(href, 'https://rowhether.com'));
const TABS = ['week', 'wind', 'river', 'storms', 'fog', 'temperature', 'rain', 'light', 'air'];
const NO_FLOW = TABS.filter(k => k !== 'river');

describe('parseRoute', () => {
  it('reads / and /index.html as home', () => {
    for (const href of ['/', '/index.html']) {
      expect(at(href), href).toEqual({ page: 'home', slug: null, view: null, day: null, open: null, path: '', words: '' });
    }
  });

  it('reads one segment that is a slug as a location', () => {
    expect(at('/putney-landing')).toEqual({ page: 'location', slug: 'putney-landing', view: null, day: null, open: null, path: 'putney-landing', words: 'putney landing' });
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

  it('reads anything else as not found, and keeps the path and its words', () => {
    expect(at('/Putney-Landing')).toMatchObject({ page: 'notfound', slug: null, path: 'Putney-Landing', words: 'putney landing' });
    expect(at('/putney-landing/extra')).toMatchObject({ page: 'notfound', slug: null, path: 'putney-landing/extra', words: 'putney landing extra' });
    expect(at('/some/where/else.html')).toMatchObject({ page: 'notfound', words: 'some where else html' });
  });

  it('does not take a reserved name, a short or a long segment, or a slash at the end for a location', () => {
    for (const href of ['/api', '/assets', '/admin', '/privacy', '/locations', '/index', '/ab', '/-ab', '/ab-', '/a--b', '/putney-landing/', `/${'a'.repeat(49)}`]) {
      expect(at(href).page, href).toBe('notfound');
      expect(at(href).slug, href).toBeNull();
    }
  });

  it('reads an encoded path, and a broken one as typed', () => {
    expect(at('/caf%C3%A9')).toMatchObject({ page: 'notfound', path: 'café', words: 'café' });
    expect(parseRoute({ pathname: '/%E0%A4%A', hash: '', search: '' })).toMatchObject({ page: 'notfound', path: '%E0%A4%A' });
  });

  it('reads ?open=picker, and no other value', () => {
    expect(at('/?open=picker').open).toBe('picker');
    expect(at('/putney-landing?open=picker#wind')).toMatchObject({ page: 'location', open: 'picker', view: 'wind' });
    expect(at('/?open=other').open).toBeNull();
    expect(at('/?picker').open).toBeNull();
  });

  it('answers a call with nothing, and with the parts missing, as home', () => {
    expect(parseRoute()).toMatchObject({ page: 'home', view: null, day: null, open: null });
    expect(parseRoute({ pathname: '/putney-landing' })).toMatchObject({ page: 'location', view: null, open: null });
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
