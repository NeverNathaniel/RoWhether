// The pure parts of the golden tools: test/golden/paths.js. The git and
// vitest glue is in scripts/golden.mjs and is proven by hand in the progress file.
import { describe, it, expect } from 'vitest';
import { diffPaths, sameOrder, matchPath, matchName, parseTrailer, checkProblems } from './golden/paths.js';
import { digestOf, trimmed } from './golden/digest.js';

const paths = (a, b) => diffPaths(a, b).map(d => `${d.path} ${d.kind}`);

describe('diffPaths', () => {
  it('finds nothing when the values are equal, whatever the key order', () => {
    expect(diffPaths({ a: 1, b: { c: [1, 2], d: null } }, { b: { d: null, c: [1, 2] }, a: 1 })).toEqual([]);
  });

  it('finds a changed leaf by its dotted path', () => {
    expect(paths({ status: { header: { cached: 'Saved data from 6:41 AM', other: 1 } } }, { status: { header: { cached: 'Saved 6:41 AM', other: 1 } } }))
      .toEqual(['status.header.cached changed']);
  });

  it('finds a changed number, null and boolean, and a value of another type', () => {
    expect(paths({ a: 1, b: null, c: true, d: '1' }, { a: 2, b: 0, c: false, d: 1 })).toEqual(['a changed', 'b changed', 'c changed', 'd changed']);
  });

  it('finds an added key and a removed key', () => {
    expect(paths({ a: 1, gone: 2 }, { a: 1, fresh: 3 })).toEqual(['gone removed', 'fresh added']);
  });

  it('finds an array item by its index, and an item added or removed at the end', () => {
    expect(paths({ sources: [['wx', 'u0'], ['alerts', 'u1']] }, { sources: [['wx', 'u0'], ['alerts', 'u1b']] })).toEqual(['sources.1.1 changed']);
    expect(paths({ a: [1, 2] }, { a: [1, 2, 3] })).toEqual(['a.2 added']);
    expect(paths({ a: [1, 2, 3] }, { a: [1, 2] })).toEqual(['a.2 removed']);
  });

  it('lists every leaf of an added or removed object, never only its root', () => {
    const notChecked = { innerHTML: '', hidden: true, nested: { list: [1, 2] } };
    expect(paths({ home: {} }, { home: { notChecked } })).toEqual(['home.notChecked.innerHTML added', 'home.notChecked.hidden added', 'home.notChecked.nested.list.0 added', 'home.notChecked.nested.list.1 added']);
    expect(paths({ home: { notChecked } }, { home: {} })).toEqual(['home.notChecked.innerHTML removed', 'home.notChecked.hidden removed', 'home.notChecked.nested.list.0 removed', 'home.notChecked.nested.list.1 removed']);
  });

  it('treats an empty object or array as a leaf', () => {
    expect(paths({ a: 1 }, { a: 1, e: {}, f: [] })).toEqual(['e added', 'f added']);
    expect(paths({ e: {} }, { e: { x: 1 } })).toEqual(['e.x added']);
    expect(paths({ e: { x: 1 } }, { e: {} })).toEqual(['e.x removed']);
  });

  it('lists the leaves on both sides when a value changes kind', () => {
    expect(paths({ a: { x: 1, y: 2 } }, { a: 'text' })).toEqual(['a.x removed', 'a.y removed', 'a added']);
    expect(paths({ a: [1] }, { a: { x: 1 } })).toEqual(['a.0 removed', 'a.x added']);
    expect(paths({ a: {} }, { a: [] })).toEqual(['a removed', 'a added']);
  });

  it("reads the capture's own { length, sha256 } hash as an object of two ordinary leaves", () => {
    const d = diffPaths({ forecasts: { '2026-10-14': { length: 100, sha256: 'a'.repeat(64) } } }, { forecasts: { '2026-10-14': { length: 120, sha256: 'b'.repeat(64) } } });
    expect(d.map(x => x.path)).toEqual(['forecasts.2026-10-14.length', 'forecasts.2026-10-14.sha256']);
    expect(d.every(x => x.digest === false)).toBe(true);
  });

  it('reads a key stored as a digest as its two leaves, marked as digest leaves', () => {
    const was = { parsers: digestOf({ flowDays: [1] }), keep: 1 };
    expect(diffPaths(was, { parsers: digestOf({ flowDays: [22] }), keep: 1 })).toEqual([
      { path: 'parsers.sha256', kind: 'changed', digest: true },
      { path: 'parsers.bytes', kind: 'changed', digest: true }
    ]);
    // The same size and other content: the hash alone moves.
    expect(diffPaths(was, { parsers: digestOf({ flowDays: [2] }), keep: 1 })).toEqual([{ path: 'parsers.sha256', kind: 'changed', digest: true }]);
  });

  it('marks the digest side when a key grows past the digest size or shrinks under it', () => {
    const small = { a: 1 }, big = digestOf({ a: 1 });
    expect(diffPaths({ k: small }, { k: big })).toEqual([
      { path: 'k.a', kind: 'removed', digest: false },
      { path: 'k.sha256', kind: 'added', digest: true },
      { path: 'k.bytes', kind: 'added', digest: true }
    ]);
    expect(diffPaths({ k: big }, { k: small }).map(x => [x.path, x.kind, x.digest])).toEqual([
      ['k.sha256', 'removed', true], ['k.bytes', 'removed', true], ['k.a', 'added', false]
    ]);
  });

  it('agrees with the way a case file stores a large key', () => {
    const have = { small: { v: 1 }, large: { rows: Array.from({ length: 2000 }, (_, i) => ({ i, text: `row ${i}` })) } };
    const stored = trimmed(have);
    expect(Object.keys(stored.large)).toEqual(['sha256', 'bytes']);
    expect(diffPaths(stored, trimmed({ ...have, large: { rows: have.large.rows.slice(1) } })).every(x => x.digest)).toBe(true);
    expect(diffPaths(stored, trimmed(have))).toEqual([]);
  });
});

describe('sameOrder', () => {
  it('keeps the old key order and appends new keys', () => {
    const out = sameOrder({ b: 1, a: { y: 1, x: 2 }, c: 3 }, { a: { x: 20, y: 1, z: 4 }, c: 3, b: 10, d: 5 });
    expect(JSON.stringify(out)).toBe('{"b":10,"a":{"y":1,"x":20,"z":4},"c":3,"d":5}');
  });

  it('follows arrays by index, and takes the new value where the kind changed', () => {
    expect(JSON.stringify(sameOrder({ r: [{ b: 1, a: 2 }, 7] }, { r: [{ a: 2, b: 3 }, { n: 1 }, { k: 1, j: 2 }] }))).toBe('{"r":[{"b":3,"a":2},{"n":1},{"k":1,"j":2}]}');
    expect(sameOrder({ a: [1] }, { a: { x: 1 } })).toEqual({ a: { x: 1 } });
    expect(sameOrder('text', { a: 1 })).toEqual({ a: 1 });
  });

  it('drops a key the new value no longer has, and ignores inherited names', () => {
    expect(Object.keys(sameOrder({ a: 1, gone: 2, b: 3 }, { b: 3, a: 1 }))).toEqual(['a', 'b']);
    expect(Object.keys(sameOrder({ toString: 1 }, {}))).toEqual([]);
  });

  it('leaves nothing for a diff to show when the values are equal', () => {
    const prev = { z: 1, a: [{ q: 1, p: 2 }] }, next = { a: [{ p: 2, q: 1 }], z: 1 };
    expect(JSON.stringify(sameOrder(prev, next))).toBe(JSON.stringify(prev));
  });
});

describe('matchPath and matchName', () => {
  it('matches a path exactly', () => {
    expect(matchPath('status.header.cached', 'status.header.cached')).toBe(true);
    expect(matchPath('status.header.cached', 'status.header.failed')).toBe(false);
    expect(matchPath('status.header', 'status.header.cached')).toBe(false);
  });

  it('matches one segment with *', () => {
    expect(matchPath('forecasts.*.*', 'forecasts.2026-10-14.length')).toBe(true);
    expect(matchPath('forecasts.*.*', 'forecasts.2026-10-14')).toBe(false);
    expect(matchPath('forecasts.*.*', 'forecasts.2026-10-14.a.b')).toBe(false);
    expect(matchPath('sources.*', 'sources.1.1')).toBe(false);
  });

  it('matches any number of segments with **, none included', () => {
    expect(matchPath('views.river.**', 'views.river.days.2026-10-14.html')).toBe(true);
    expect(matchPath('views.river.**', 'views.river')).toBe(true);
    expect(matchPath('views.river.**', 'views.wind.days')).toBe(false);
    expect(matchPath('**', 'a.b.c')).toBe(true);
    expect(matchPath('a.**.z', 'a.z')).toBe(true);
    expect(matchPath('a.**.z', 'a.b.c.z')).toBe(true);
    expect(matchPath('a.**.z', 'a.b.c')).toBe(false);
  });

  it('reads a key with a space as one segment', () => {
    expect(matchPath('alertLevels.Small Craft Advisory', 'alertLevels.Small Craft Advisory')).toBe(true);
    expect(matchPath('alertLevels.*', 'alertLevels.Gale Warning')).toBe(true);
  });

  it('matches a case name with * as any run of characters', () => {
    expect(matchName('*', 'june-calm-1200-default')).toBe(true);
    expect(matchName('v-spring-*', 'v-spring-0900')).toBe(true);
    expect(matchName('v-spring-*', 'v-fall-back-0900')).toBe(false);
    expect(matchName('p-pure', 'p-pure')).toBe(true);
    expect(matchName('p-pure', 'p-pure-2')).toBe(false);
    expect(matchName('v-june.*', 'v-juneX')).toBe(false);
  });
});

describe('parseTrailer', () => {
  it('reads two ids from one line, and from separate lines', () => {
    expect(parseTrailer('saved, banks')).toEqual(['saved', 'banks']);
    expect(parseTrailer('saved\nbanks\n\n')).toEqual(['saved', 'banks']);
    expect(parseTrailer('saved,banks, saved')).toEqual(['saved', 'banks']);
  });

  it('reads nothing from an empty or missing trailer', () => {
    expect(parseTrailer('')).toEqual([]);
    expect(parseTrailer('\n')).toEqual([]);
    expect(parseTrailer(undefined)).toEqual([]);
  });
});

describe('checkProblems', () => {
  const CHANGES = {
    saved: { why: 'w', step: 'P1.5', files: ['*'], paths: ['status.header.cached', 'status.header.failed'] },
    banks: { why: 'w', step: 'P1.11', files: ['june-calm-*', 'v-*'], paths: ['home.compass.innerHTML', 'forecasts.*.*'] },
    marine: { why: 'w', step: 'P1.8', files: ['p-pure'], paths: ['alertLevels.Small Craft Advisory'] },
    flow: { why: 'w', step: 'P1.8', files: ['v-spring-*'], paths: ['parsers.flowDays.**', 'views.river.**'] }
  };
  const ch = (path, digest = false) => ({ path, kind: 'changed', digest });
  const file = (name, changes, status = 'M') => ({ name, status, changes });
  const commit = (trailer, files) => ({ id: 'a'.repeat(40), subject: 'A change', trailer, files });
  const problems = (...commits) => checkProblems(commits, CHANGES);

  it('passes a change an id covers, in a file the id names', () => {
    expect(problems(commit('saved', [file('june-calm-1200-default', [ch('status.header.cached')])]))).toEqual([]);
  });

  it('passes a commit with two ids, each covering its own paths', () => {
    const files = [file('june-calm-1200-default', [ch('status.header.cached'), ch('home.compass.innerHTML'), ch('forecasts.2026-10-14.length'), ch('forecasts.2026-10-14.sha256')])];
    expect(problems(commit('saved, banks', files))).toEqual([]);
  });

  it('passes an added file and a commit that touches no golden file', () => {
    expect(problems(commit('', [file('v-new', [], 'A')]))).toEqual([]);
    expect(problems(commit('', []))).toEqual([]);
  });

  it('fails a modified file with no trailer', () => {
    const p = problems(commit('', [file('june-calm-1200-default', [ch('status.header.cached')])]));
    expect(p).toHaveLength(1);
    expect(p[0].message).toMatch(/no Golden trailer/);
    expect(p[0].commit).toBe('aaaaaaa A change');
  });

  it('fails an id the changes file does not have', () => {
    const p = problems(commit('nosuch', [file('june-calm-1200-default', [ch('status.header.cached')])]));
    expect(p.map(x => x.message)).toEqual([expect.stringMatching(/names nosuch, which test\/golden\/changes\.js does not have/), expect.stringMatching(/no id in the Golden trailer \(nosuch\) names this file/)]);
  });

  it('fails an unknown id beside a known one, and still checks the known one', () => {
    const p = problems(commit('saved, nosuch', [file('june-calm-1200-default', [ch('status.header.cached'), ch('home.compass.innerHTML')])]));
    expect(p).toHaveLength(2);
    expect(p[0].message).toMatch(/nosuch/);
    expect(p[1].message).toMatch(/1 changed path outside saved: home\.compass\.innerHTML/);
  });

  it('fails a path outside the paths of the ids named', () => {
    const p = problems(commit('saved', [file('june-calm-1200-default', [ch('status.header.cached'), ch('model.hours.0.t')])]));
    expect(p).toHaveLength(1);
    expect(p[0].file).toBe('june-calm-1200-default');
    expect(p[0].message).toMatch(/outside saved: model\.hours\.0\.t/);
  });

  it('fails a path an id covers in a file the id does not name', () => {
    const p = problems(commit('banks', [file('october-fog-0600-default', [ch('home.compass.innerHTML')])]));
    expect(p).toHaveLength(1);
    expect(p[0].message).toMatch(/names this file/);
  });

  it('fails a deleted file, whatever the trailer says', () => {
    const p = problems(commit('saved', [file('june-calm-1200-default', [], 'D')]));
    expect(p).toHaveLength(1);
    expect(p[0].message).toMatch(/deleted/);
    expect(problems(commit('', [file('june-calm-1200-default', [], 'D')]))).toHaveLength(1);
  });

  it('names five paths at most and counts the rest', () => {
    const many = Array.from({ length: 8 }, (_, i) => ch(`model.hours.${i}.t`));
    const p = problems(commit('saved', [file('june-calm-1200-default', many)]));
    expect(p[0].message).toMatch(/8 changed paths outside saved: .*model\.hours\.4\.t, and 3 more/);
    expect(p[0].message).not.toMatch(/model\.hours\.5\.t/);
  });

  it('covers a changed digest by a pattern under its key, and by no pattern under another key', () => {
    const digest = [ch('parsers.sha256', true), ch('parsers.bytes', true)];
    expect(problems(commit('flow', [file('v-spring-0900', digest)]))).toEqual([]);
    const other = [ch('model.sha256', true), ch('model.bytes', true)];
    const p = problems(commit('flow', [file('v-spring-0900', other)]));
    expect(p).toHaveLength(1);
    expect(p[0].message).toMatch(/2 changed paths outside flow/);
  });

  it('does not cover a plain leaf named sha256 by the key rule', () => {
    const p = problems(commit('flow', [file('v-spring-0900', [ch('parsers.sha256', false)])]));
    expect(p).toHaveLength(1);
  });

  it('covers a digest by a pattern that starts with * or **', () => {
    const wide = { wide: { why: 'w', step: 'P1.8', files: ['v-june-alerts'], paths: ['**'] }, one: { why: 'w', step: 'P1.8', files: ['v-june-alerts'], paths: ['*.x'] } };
    const digest = [ch('model.sha256', true), ch('model.bytes', true)];
    expect(checkProblems([commit('wide', [file('v-june-alerts', digest)])], wide)).toEqual([]);
    expect(checkProblems([commit('one', [file('v-june-alerts', digest)])], wide)).toEqual([]);
  });

  it('checks every commit and every file, and keeps the commit in each problem', () => {
    const bad = { id: 'b'.repeat(40), subject: 'Second', trailer: '', files: [file('v-x', [ch('a')])] };
    const p = problems(commit('saved', [file('june-calm-1200-default', [ch('status.header.cached')])]), bad);
    expect(p).toHaveLength(1);
    expect(p[0].commit).toBe('bbbbbbb Second');
  });
});
