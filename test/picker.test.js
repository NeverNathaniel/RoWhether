// The picker's pure parts (P1.6; 07 5.2): folding, ranking, the search, the grouped
// list, region names and the words of an address. The page around them is the browser
// specs' (test/browser/picker.spec.js).
import { describe, it, expect } from 'vitest';
import { fold, matchRank, search, groupList, regionName, pathWords } from '../src/picker.js';

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
