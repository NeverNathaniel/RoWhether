// The picker's pure parts (P1.6, P1.7; 07 5.2): folding, ranking, the search, the grouped
// list, region names, the words of an address, distances, Near me's position, the town search
// and its throttle. The page around them is the browser specs' (test/browser/picker.spec.js).
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fold, matchRank, search, groupList, regionName, pathWords, km, nearest, miles, whereAmI, throttle, placesUrl, placeName, placeShort, fetchPlaces, NEAR_KM, PLACE_KM } from '../src/picker.js';

// An entry as the build writes it into locations/index.json.
const e = (slug, name, locality, waterway, region, over = {}) => ({
  slug, name, shortName: name.split(' ')[0], locality, waterway, lat: 40, lon: -75, tz: 'America/New_York',
  country: 'US', region, waterType: 'lake', status: 'published', revision: 1, ...over
});
const PUTNEY = e('putney-landing', 'Putney Landing', 'Putney, VT', 'Connecticut River', 'US-VT');
const HANOVER = e('hanover-boathouse', 'Hanover boathouse', 'Hanover, NH', 'Connecticut River', 'US-NH');
const ROW = e('boathouse-row', 'Boathouse Row', 'Philadelphia, PA', 'Schuylkill River', 'US-PA');
const QUIN = e('lake-quinsigamond', 'Lake Quinsigamond', 'Worcester, MA', 'Lake Quinsigamond', 'US-MA');
const NATOMA = e('lake-natoma', 'Lake Natoma', 'Folsom, CA', 'Lake Natoma', 'US-CA');
const THOMPSON = e('thompson-boat-center', 'Thompson Boat Center', 'Washington, DC', 'Potomac River', 'US-DC');
const CARNEGIE = e('lake-carnegie', 'Lake Carnegie', 'Princeton, NJ', 'Lake Carnegie', 'US-NJ');
const LIST = [PUTNEY, HANOVER, ROW, QUIN, NATOMA, THOMPSON, CARNEGIE];
const slugs = list => list.map(x => x.slug);

describe('fold', () => {
  it('takes the accents off and lower-cases', () => {
    expect(fold('Montréal')).toBe('montreal');
    expect(fold('ÅNGSTRÖM Çedille')).toBe('angstrom cedille');
    expect(fold('Putney Landing')).toBe('putney landing');
  });
});

describe('matchRank', () => {
  it('is 0 when the name starts with the query, in any case and with the accents off', () => {
    expect(matchRank(PUTNEY, 'putney')).toBe(0);
    expect(matchRank(PUTNEY, 'PUT')).toBe(0);
    expect(matchRank(NATOMA, 'lake nat')).toBe(0);
    expect(matchRank(e('x', 'Montréal Rowing', null, null, null), 'montre')).toBe(0);
  });

  it('is 1 when a later word of the name starts with it', () => {
    expect(matchRank(PUTNEY, 'landing')).toBe(1);
    expect(matchRank(HANOVER, 'boat')).toBe(1);
    expect(matchRank(THOMPSON, 'cent')).toBe(1);
  });

  it('is 2 when a word of the short name, the locality or the waterway starts with it', () => {
    expect(matchRank(PUTNEY, 'connecticut')).toBe(2);
    expect(matchRank(QUIN, 'worcester')).toBe(2);
    expect(matchRank(ROW, 'schuylkill')).toBe(2);
    expect(matchRank(HANOVER, 'hanover nh')).toBe(2);
    expect(matchRank(e('x', 'Dock', null, null, null, { shortName: 'Pier' }), 'pier')).toBe(2);
  });

  it('matches the start of a word and not the middle of one', () => {
    expect(matchRank(PUTNEY, 'ney')).toBe(-1);
    expect(matchRank(PUTNEY, 'ticut')).toBe(-1);
    expect(matchRank(QUIN, 'gamond')).toBe(-1);
  });

  it('is -1 for no match, and for a query under 2 characters or with none', () => {
    expect(matchRank(PUTNEY, 'zzz')).toBe(-1);
    for (const q of ['', ' ', 'p', ' p ', '--', '.']) expect(matchRank(PUTNEY, q), JSON.stringify(q)).toBe(-1);
    expect(matchRank(PUTNEY, 'pu')).toBe(0);
  });

  it('does not stop at a comma or a hyphen in the typed words', () => {
    expect(matchRank(PUTNEY, 'putney, vt')).toBe(2);
    expect(matchRank(PUTNEY, 'putney-landing')).toBe(0);
  });

  it('does not fail on an entry with no locality, waterway or short name', () => {
    expect(matchRank({ name: 'Somewhere' }, 'rowing')).toBe(-1);
    expect(matchRank({ name: 'Somewhere' }, 'some')).toBe(0);
  });
});

describe('search', () => {
  it('lists "lak" as the lakes, alphabetically', () => {
    expect(slugs(search(LIST, 'lak'))).toEqual(['lake-carnegie', 'lake-natoma', 'lake-quinsigamond']);
  });

  it('lists "putney" as Putney Landing alone, and "connecticut" as the two on that river', () => {
    expect(slugs(search(LIST, 'putney'))).toEqual(['putney-landing']);
    expect(slugs(search(LIST, 'connecticut'))).toEqual(['hanover-boathouse', 'putney-landing']);
  });

  it('puts a name that starts with the query before a word in a name, then a locality or waterway', () => {
    // "boat": Boathouse Row starts with it, Hanover boathouse and Thompson Boat Center have it as a word.
    expect(slugs(search(LIST, 'boat'))).toEqual(['boathouse-row', 'hanover-boathouse', 'thompson-boat-center']);
    // "river": the waterways of four entries, and no name.
    expect(slugs(search(LIST, 'river'))).toEqual(['boathouse-row', 'hanover-boathouse', 'putney-landing', 'thompson-boat-center']);
  });

  it('puts the ones opened lately first among equals, newest first, and never above a better match', () => {
    expect(slugs(search(LIST, 'lak', ['lake-quinsigamond']))).toEqual(['lake-quinsigamond', 'lake-carnegie', 'lake-natoma']);
    expect(slugs(search(LIST, 'lak', ['lake-natoma', 'lake-quinsigamond']))).toEqual(['lake-natoma', 'lake-quinsigamond', 'lake-carnegie']);
    expect(slugs(search(LIST, 'boat', ['thompson-boat-center']))).toEqual(['boathouse-row', 'thompson-boat-center', 'hanover-boathouse']);
    expect(slugs(search(LIST, 'connecticut', ['putney-landing']))).toEqual(['putney-landing', 'hanover-boathouse']);
  });

  it('lists at most 8, and nothing for a query under 2 characters or one that matches nothing', () => {
    const many = Array.from({ length: 12 }, (_, i) => e(`lake-${String.fromCharCode(97 + i)}`, `Lake ${String.fromCharCode(65 + i)}`, null, null, 'US-VT'));
    expect(search(many, 'lake')).toHaveLength(8);
    expect(slugs(search(many, 'lake'))).toEqual(many.slice(0, 8).map(x => x.slug));
    expect(search(LIST, 'l')).toEqual([]);
    expect(search(LIST, '')).toEqual([]);
    expect(search(LIST, 'qqq')).toEqual([]);
    expect(search([], 'lake')).toEqual([]);
  });

  it('does not change the list it is given', () => {
    const before = slugs(LIST);
    search(LIST, 'lak');
    expect(slugs(LIST)).toEqual(before);
  });
});

describe('groupList', () => {
  it('with one country has no country heading, and lists the regions by name and the entries by name in each', () => {
    const second = e('lake-bomoseen', 'Lake Bomoseen', 'Castleton, VT', 'Lake Bomoseen', 'US-VT');
    const g = groupList([...LIST, second]);
    expect(g).toHaveLength(1);
    expect(g[0].heading).toBeNull();
    expect(g[0].regions.map(r => r.name)).toEqual(['California', 'District of Columbia', 'Massachusetts', 'New Hampshire', 'New Jersey', 'Pennsylvania', 'Vermont']);
    expect(slugs(g[0].regions.at(-1).entries)).toEqual(['lake-bomoseen', 'putney-landing']);
  });

  it('with two countries names each, in order of the country names', () => {
    const thames = e('thames-tideway', 'Thames Tideway', 'London', 'River Thames', 'GB-ENG', { country: 'GB' });
    const wales = e('llandaff', 'Llandaff Weir', 'Cardiff', 'River Taff', 'GB-WLS', { country: 'GB' });
    const g = groupList([PUTNEY, thames, HANOVER, wales]);
    expect(g.map(x => x.heading)).toEqual(['United Kingdom', 'United States']);
    expect(g[0].regions.map(r => r.name)).toEqual(['England', 'Wales']);
    expect(g[1].regions.map(r => r.name)).toEqual(['New Hampshire', 'Vermont']);
  });

  it('puts an entry with no region last, with no region name', () => {
    const loose = e('somewhere', 'Somewhere', null, null, null);
    const g = groupList([loose, PUTNEY]);
    expect(g[0].regions.map(r => r.name)).toEqual(['Vermont', '']);
    expect(slugs(g[0].regions[1].entries)).toEqual(['somewhere']);
  });

  it('gives nothing for no entries, and keeps every entry once', () => {
    expect(groupList([])).toEqual([]);
    const all = groupList(LIST).flatMap(x => x.regions.flatMap(r => r.entries));
    expect(slugs(all).sort()).toEqual(slugs(LIST).sort());
  });

  it('does not fail on a country code it cannot name', () => {
    const odd = e('x', 'Odd', null, null, null, { country: 'ZZ9' });
    expect(groupList([odd, PUTNEY]).map(x => x.heading)).toEqual(['United States', 'ZZ9'].sort());
  });
});

describe('regionName', () => {
  it('names the ISO 3166-2 codes of the states and the nations', () => {
    expect(regionName('US-NH')).toBe('New Hampshire');
    expect(regionName('US-VT')).toBe('Vermont');
    expect(regionName('US-DC')).toBe('District of Columbia');
    expect(regionName('GB-ENG')).toBe('England');
  });

  it('gives the last part of a code its list does not have', () => {
    expect(regionName('CA-ON')).toBe('ON');
    expect(regionName('XX')).toBe('XX');
  });
});

describe('pathWords', () => {
  it('turns an address into the words of a search', () => {
    expect(pathWords('lake-quinsigamund')).toBe('lake quinsigamund');
    expect(pathWords('Putney-Landing/extra')).toBe('putney landing extra');
    expect(pathWords('café_au-lait')).toBe('cafe au lait');
    expect(pathWords('')).toBe('');
    expect(pathWords('---')).toBe('');
  });
});

// ---------- Near me and towns (P1.7; 07 5.2.1, 5.2.2) ----------
// The seven curated places where they are (plan section 4), as the index will give them.
const at = (slug, name, lat, lon) => e(slug, name, null, null, 'US-VT', { lat, lon });
const SPOTS = [
  at('putney-landing', 'Putney Landing', 42.9607, -72.5219),
  at('hanover-boathouse', 'Hanover boathouse', 43.70552, -72.29763),
  at('boathouse-row', 'Boathouse Row', 39.96941, -75.18711),
  at('lake-quinsigamond', 'Lake Quinsigamond', 42.29043, -71.75505),
  at('lake-natoma', 'Lake Natoma', 38.63453, -121.21918),
  at('thompson-boat-center', 'Thompson Boat Center', 38.90053, -77.05834),
  at('lake-carnegie', 'Lake Carnegie', 40.33932, -74.65048)
];
const WORCESTER = JSON.parse(readFileSync(new URL('./fixtures/sources/geocode-worcester.json', import.meta.url), 'utf8'));

describe('km', () => {
  it('is the great-circle distance: a degree of longitude on the equator, Boston to New York, and nothing', () => {
    expect(km({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.19, 1);
    expect(km({ lat: 42.3601, lon: -71.0589 }, { lat: 40.7128, lon: -74.006 })).toBeCloseTo(306.1, 0);
    expect(km({ lat: 42.96, lon: -72.52 }, { lat: 42.96, lon: -72.52 })).toBe(0);
  });

  it('is the same both ways, and shorter across a degree of longitude at 43 degrees north', () => {
    const a = { lat: 42.96, lon: -72.52 }, b = { lat: 43.7, lon: -72.3 };
    expect(km(a, b)).toBeCloseTo(km(b, a), 9);
    expect(km({ lat: 43, lon: 0 }, { lat: 43, lon: 1 })).toBeCloseTo(111.19 * Math.cos((43 * Math.PI) / 180), 0);
  });
});

describe('nearest', () => {
  const dock = { lat: 42.96, lon: -72.52 };

  it('lists the places within 100 km nearest first, each with its distance in km', () => {
    const near = nearest(SPOTS, dock, NEAR_KM);
    expect(slugs(near)).toEqual(['putney-landing', 'hanover-boathouse', 'lake-quinsigamond']);
    expect(near[0].d).toBeLessThan(0.5);
    expect(near[1].d).toBeCloseTo(km(dock, SPOTS[1]), 9);
    expect(near[1].d).toBeGreaterThan(80);
    expect(near[2].d).toBeLessThan(NEAR_KM);
    expect(near[0]).toMatchObject({ slug: 'putney-landing', name: 'Putney Landing', lat: 42.9607 });
  });

  it('sorts the whole list by distance when the range is wide enough, and does not change the list', () => {
    const before = slugs(SPOTS);
    expect(slugs(nearest(SPOTS, dock, 1e5))).toEqual(['putney-landing', 'hanover-boathouse', 'lake-quinsigamond', 'lake-carnegie', 'boathouse-row', 'thompson-boat-center', 'lake-natoma']);
    expect(slugs(SPOTS)).toEqual(before);
    expect(SPOTS[0].d).toBeUndefined();
  });

  it('gives an empty list when nothing is in range, and when there is nothing to look in', () => {
    expect(nearest(SPOTS, { lat: 0, lon: 0 }, NEAR_KM)).toEqual([]);
    expect(nearest([], dock, NEAR_KM)).toEqual([]);
  });

  it('keeps a place exactly at the range and drops one just past it', () => {
    const far = at('x', 'X', 43.7, -72.3), d = km(dock, far);
    expect(slugs(nearest([far], dock, d))).toEqual(['x']);
    expect(nearest([far], dock, d - 0.001)).toEqual([]);
  });

  it('puts equal distances in order of name, accents folded', () => {
    const two = [at('b', 'Zeta', 42, -72), at('a', 'Ångström', 42, -72), at('c', 'Beta', 42, -72)];
    expect(slugs(nearest(two, { lat: 42.1, lon: -72 }, 50))).toEqual(['a', 'c', 'b']);
  });

  it('is what lists the places within 50 km of a town', () => {
    const worcester = { lat: 42.26259, lon: -71.80229 };
    expect(slugs(nearest(SPOTS, worcester, PLACE_KM))).toEqual(['lake-quinsigamond']);
    expect(nearest(SPOTS, { lat: -33.64651, lon: 19.44852 }, PLACE_KM)).toEqual([]);
  });
});

describe('miles', () => {
  it('says miles with one decimal under 10 and none from there on', () => {
    expect(miles(0.17)).toBe('0.1 mi');
    expect(miles(0)).toBe('0.0 mi');
    expect(miles(12.4)).toBe('7.7 mi');
    expect(miles(16)).toBe('9.9 mi');
    expect(miles(16.1)).toBe('10 mi');
    expect(miles(84.9)).toBe('53 mi');
    expect(miles(100)).toBe('62 mi');
  });
});

describe('whereAmI', () => {
  // A navigator whose position is known: `reads` records each call's options.
  const nav = (over = {}, fix = { latitude: 42.96074, longitude: -72.52191 }) => {
    const reads = [];
    return { reads, permissions: { query: async () => ({ state: 'prompt' }) }, geolocation: { getCurrentPosition: (ok, no, opts) => { reads.push(opts); ok({ coords: fix }); } }, ...over };
  };

  it('rounds the position to 2 decimals before anything gets it, and gives nothing else', async () => {
    const p = await whereAmI(nav());
    expect(p).toEqual({ lat: 42.96, lon: -72.52 });
    expect(Object.keys(p)).toEqual(['lat', 'lon']);
    expect(await whereAmI(nav({}, { latitude: -33.86882, longitude: 151.20929, accuracy: 12, altitude: 40 }))).toEqual({ lat: -33.87, lon: 151.21 });
  });

  it('asks for a low accuracy fix that may be 10 minutes old, and waits 10 seconds', async () => {
    const n = nav();
    await whereAmI(n);
    expect(n.reads).toEqual([{ enableHighAccuracy: false, maximumAge: 600000, timeout: 10000 }]);
  });

  it('asks nothing until it is called', () => {
    const n = nav();
    n.permissions.query = vi.fn(n.permissions.query);
    expect(n.reads).toEqual([]);
    expect(n.permissions.query).not.toHaveBeenCalled();
  });

  it('does not ask when the permission is already denied', async () => {
    const n = nav({ permissions: { query: async () => ({ state: 'denied' }) } });
    await expect(whereAmI(n)).rejects.toBe('denied');
    expect(n.reads).toEqual([]);
  });

  it('asks when the permission is granted or still to be asked, and when there is no way to look', async () => {
    for (const permissions of [{ query: async () => ({ state: 'granted' }) }, undefined, { query: async () => { throw new TypeError('not supported'); } }]) {
      expect(await whereAmI(nav({ permissions })), String(permissions)).toEqual({ lat: 42.96, lon: -72.52 });
    }
  });

  it('says denied for a refusal at the prompt, and lost for a timeout or no fix', async () => {
    const fail = code => nav({ geolocation: { getCurrentPosition: (ok, no) => no({ code }) } });
    await expect(whereAmI(fail(1))).rejects.toBe('denied');
    await expect(whereAmI(fail(2))).rejects.toBe('lost');
    await expect(whereAmI(fail(3))).rejects.toBe('lost');
    await expect(whereAmI(nav({ geolocation: { getCurrentPosition: (ok, no) => no() } }))).rejects.toBe('lost');
  });

  it('says lost when there is no geolocation at all', async () => {
    await expect(whereAmI({ permissions: undefined })).rejects.toBeInstanceOf(Error);
  });
});

describe('the town search', () => {
  it('asks Open-Meteo for 5 places in English, with the text encoded and no country filter', () => {
    expect(placesUrl('Worcester')).toBe('https://geocoding-api.open-meteo.com/v1/search?name=Worcester&count=5&language=en&format=json');
    expect(placesUrl('Lake Natoma, CA')).toBe('https://geocoding-api.open-meteo.com/v1/search?name=Lake%20Natoma%2C%20CA&count=5&language=en&format=json');
    expect(placesUrl('a&b=c#d')).toContain('name=a%26b%3Dc%23d&count=5');
    expect(placesUrl('Worcester')).not.toContain('countryCode');
  });

  const answer = body => async () => ({ ok: true, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

  it('reads the recorded answer for Worcester as five places, as the host gave them', async () => {
    const asked = [];
    const got = await fetchPlaces('Worcester', { get: async (url, opts) => { asked.push([url, !!opts.signal]); return answer(WORCESTER)(); } });
    expect(asked).toEqual([[placesUrl('Worcester'), true]]);
    expect(got.places).toHaveLength(5);
    expect(got.places[0]).toEqual({ name: 'Worcester', admin1: 'Massachusetts', country: 'United States', lat: 42.26259, lon: -71.80229 });
    expect(got.places.map(placeName)).toEqual([
      'Worcester, Massachusetts, United States', 'Worcester, Western Cape, South Africa', 'Worcester, England, United Kingdom',
      'Barry, Illinois, United States', 'Worcester, New York, United States'
    ]);
  });

  it('writes a place as "<name>, <admin1>, <country>" and shortens it to "<name>, <admin1>", with what is missing left out', () => {
    expect(placeName({ name: 'Putney', admin1: 'Vermont', country: 'United States' })).toBe('Putney, Vermont, United States');
    expect(placeShort({ name: 'Putney', admin1: 'Vermont', country: 'United States' })).toBe('Putney, Vermont');
    expect(placeName({ name: 'Monaco', country: 'Monaco' })).toBe('Monaco, Monaco');
    expect(placeShort({ name: 'Monaco', country: 'Monaco' })).toBe('Monaco, Monaco');
    expect(placeName({ name: 'Somewhere' })).toBe('Somewhere');
    expect(placeShort({ name: 'Somewhere' })).toBe('Somewhere');
  });

  it('gives no places for an answer with no results, and keeps at most 5 with a position', async () => {
    expect(await fetchPlaces('zzqxj', { get: answer({ generationtime_ms: 0.05 }) })).toEqual({ places: [] });
    const row = i => ({ name: `Town ${i}`, latitude: 40 + i, longitude: -70, country: 'United States' });
    const got = await fetchPlaces('town', { get: answer({ results: [...Array.from({ length: 8 }, (_, i) => row(i)), { name: 'No position' }] }) });
    expect(got.places.map(p => p.name)).toEqual(['Town 0', 'Town 1', 'Town 2', 'Town 3', 'Town 4']);
    const bad = await fetchPlaces('town', { get: answer({ results: [{ name: 'No position' }, { latitude: 1, longitude: 2 }, null, row(1)] }) });
    expect(bad.places.map(p => p.name)).toEqual(['Town 1']);
    expect(await fetchPlaces('town', { get: answer({ results: 'nope' }) })).toEqual({ places: [] });
  });

  it('fails for a network error, an answer that is not ok, and a body that is not JSON', async () => {
    expect(await fetchPlaces('x', { get: async () => { throw new TypeError('Failed to fetch'); } })).toEqual({ failed: true });
    expect(await fetchPlaces('x', { get: async () => ({ ok: false, status: 429, text: async () => '{}' }) })).toEqual({ failed: true });
    expect(await fetchPlaces('x', { get: answer('<html>busy</html>') })).toEqual({ failed: true });
    expect(await fetchPlaces('x', { get: answer('') })).toEqual({ failed: true });
  });

  describe('with no answer', () => {
    afterEach(() => vi.useRealTimers());

    it('fails after 8 seconds, and cancels the request', async () => {
      vi.useFakeTimers();
      let signal;
      const get = (url, opts) => new Promise((_, no) => { signal = opts.signal; signal.addEventListener('abort', () => no(new DOMException('aborted', 'AbortError'))); });
      const pending = fetchPlaces('x', { get });
      await vi.advanceTimersByTimeAsync(7999);
      expect(signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual({ failed: true });
      expect(signal.aborted).toBe(true);
    });

    it('does not wait for the timer once it has an answer', async () => {
      vi.useFakeTimers();
      expect(await fetchPlaces('x', { get: async () => ({ ok: true, text: async () => '{"results":[]}' }) })).toEqual({ places: [] });
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

describe('throttle', () => {
  afterEach(() => vi.useRealTimers());

  it('runs the first call at once and holds the rest to the end of the wait, where only the last runs', () => {
    vi.useFakeTimers();
    const fn = vi.fn(), t = throttle(fn, 300);
    t('a'); t('b'); t('c');
    expect(fn.mock.calls).toEqual([['a']]);
    vi.advanceTimersByTime(299);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(fn.mock.calls).toEqual([['a'], ['c']]);
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('runs a call made after the wait has ended at once', () => {
    vi.useFakeTimers();
    const fn = vi.fn(), t = throttle(fn, 300);
    t('a');
    vi.advanceTimersByTime(300);
    t('b');
    expect(fn.mock.calls).toEqual([['a'], ['b']]);
  });

  it('runs at most once in any 300 ms, for a call every 50 ms over a second', () => {
    vi.useFakeTimers();
    const times = [], t = throttle(() => times.push(Date.now()), 300), start = Date.now();
    for (let i = 0; i < 21; i++) { t(i); vi.advanceTimersByTime(50); }
    vi.advanceTimersByTime(300);
    expect(times.length).toBeGreaterThan(2);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1], `run ${i}`).toBeGreaterThanOrEqual(300);
    expect(times[0]).toBe(start);
  });
});
