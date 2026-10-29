// The pure parts of the golden tools (scripts/golden.mjs), with no git and no
// file system, so test/golden-check.test.js can run them: the difference between
// two golden files as key paths, the matchers for case names and key paths, the
// key order of a rewritten file, a `Golden:` trailer, and the rule `check`
// applies to each commit that touched a golden file (phase 1 plan 3.2).
//
// A path is its keys joined with dots, and an array item is its index:
// `sources.1.1` is the alerts URL, `status.header.cached` the saved label.
import { isDigest } from './digest.js';

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isLeaf = v => v === null || typeof v !== 'object';
const isBranch = v => (Array.isArray(v) ? v.length > 0 : isObject(v) && Object.keys(v).length > 0);
const join = (path, key) => (path === '' ? String(key) : `${path}.${key}`);

// Every leaf under a value as { path, kind }. An empty object or array is a leaf.
function leavesOf(v, path, kind, digest, out) {
  if (!isBranch(v)) out.push({ path, kind, digest });
  else for (const k of Object.keys(v)) leavesOf(v[k], join(path, k), kind, digest, out);
}

// What changed between two parsed golden files, one entry per leaf, as
// { path, kind: 'changed' | 'added' | 'removed', digest }. An added or removed
// object or array lists every leaf under it, never only its root. A key a v-* or
// p-* file stores as a digest ({ sha256, bytes }) changes as its two leaves
// `<key>.sha256` and `<key>.bytes`, and those carry digest: true, since the
// digest does not say which part moved (`diff` dumps the case to find out).
// The capture's own { length, sha256 } hashes are ordinary leaves.
export function diffPaths(a, b) {
  const out = [];
  const walk = (x, y, path, dx, dy) => {
    if (x === undefined || y === undefined) {
      if (x !== undefined) leavesOf(x, path, 'removed', dx, out);
      else if (y !== undefined) leavesOf(y, path, 'added', dy, out);
    } else if (isObject(x) && isObject(y)) {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], join(path, k), dx, dy);
    } else if (Array.isArray(x) && Array.isArray(y)) {
      for (let i = 0; i < Math.max(x.length, y.length); i++) walk(x[i], y[i], join(path, i), dx, dy);
    } else if (isLeaf(x) && isLeaf(y)) {
      if (x !== y) out.push({ path, kind: 'changed', digest: dx && dy });
    } else {
      // A different kind of value: the old leaves go and the new ones come.
      leavesOf(x, path, 'removed', dx, out);
      leavesOf(y, path, 'added', dy, out);
    }
  };
  const top = k => [isDigest(a?.[k]), isDigest(b?.[k])];
  for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    const [dx, dy] = top(k);
    walk(a?.[k], b?.[k], k, dx, dy);
  }
  return out;
}

// `next` with the key order of `prev`: the keys prev has, in its order, then the
// keys it lacks, in the order of `next`. Arrays go by index. So a rewritten file
// differs from the old one only where a value changed.
export function sameOrder(prev, next) {
  if (Array.isArray(next)) return next.map((x, i) => sameOrder(Array.isArray(prev) ? prev[i] : undefined, x));
  if (!isObject(next)) return next;
  if (!isObject(prev)) return next;
  const out = {};
  for (const k of Object.keys(prev)) if (Object.hasOwn(next, k)) out[k] = sameOrder(prev[k], next[k]);
  for (const k of Object.keys(next)) if (!Object.hasOwn(out, k)) out[k] = next[k];
  return out;
}

// `*` is one segment and `**` is any number, none included.
export function matchPath(pattern, path) {
  const p = pattern.split('.'), s = path.split('.');
  const go = (i, j) => {
    if (i === p.length) return j === s.length;
    if (p[i] === '**') return go(i + 1, j) || (j < s.length && go(i, j + 1));
    return j < s.length && (p[i] === '*' || p[i] === s[j]) && go(i + 1, j + 1);
  };
  return go(0, 0);
}

// A case name against a pattern where `*` and `**` are any run of characters.
const escaped = text => text.replace(/[.+?^$|()[\]{}\\]/g, '\\$&');
export const matchName = (pattern, name) => new RegExp(`^${pattern.split(/\*+/).map(escaped).join('.*')}$`).test(name);

// The ids in the `Golden:` trailer of a commit, as `git log --format=%(trailers:key=Golden,valueonly)`
// prints them: separated by commas, spaces or lines.
export const parseTrailer = text => [...new Set(String(text ?? '').split(/[\s,]+/).filter(Boolean))];

// Whether a pattern of a change covers a path. A digest leaf is also covered by
// any pattern that starts with its key, or with `*` or `**`, since the digest
// holds the whole key (parsers.flowDays.** covers parsers.sha256 and parsers.bytes).
const covers = (pattern, { path, digest }) => matchPath(pattern, path)
  || (digest && ['*', '**', path.split('.')[0]].includes(pattern.split('.')[0]));

// The rule `check` applies, over commits as
//   { id, subject, trailer, files: [{ name, status: 'A' | 'M' | 'D', changes: [{ path, kind, digest }] }] }
// and the CHANGES of test/golden/changes.js. Returns the problems as
// { commit, file, message }. A deleted file fails. A modified file needs the
// trailer to name ids that have the file in their `files`, and every changed path
// must match a path pattern of one of those ids. An added file passes.
export function checkProblems(commits, changes) {
  const problems = [];
  const say = (c, file, message) => problems.push({ commit: `${c.id.slice(0, 7)} ${c.subject ?? ''}`.trim(), file, message });
  for (const c of commits) {
    const ids = parseTrailer(c.trailer), modified = c.files.filter(f => f.status === 'M');
    for (const f of c.files) if (f.status === 'D') say(c, f.name, 'deleted. A golden file is never deleted.');
    if (!modified.length) continue;
    if (!ids.length) { say(c, null, `modifies ${modified.length} golden file${modified.length === 1 ? '' : 's'} and has no Golden trailer.`); continue; }
    const known = ids.filter(id => changes[id]);
    for (const id of ids.filter(id => !changes[id])) say(c, null, `the Golden trailer names ${id}, which test/golden/changes.js does not have.`);
    for (const f of modified) {
      const mine = known.filter(id => (changes[id].files || []).some(p => matchName(p, f.name)));
      if (!mine.length) { say(c, f.name, `no id in the Golden trailer (${ids.join(', ')}) names this file.`); continue; }
      const patterns = mine.flatMap(id => changes[id].paths || []);
      const outside = f.changes.filter(ch => !patterns.some(p => covers(p, ch)));
      if (outside.length) {
        const shown = outside.slice(0, 5).map(ch => ch.path).join(', ');
        say(c, f.name, `${outside.length} changed path${outside.length === 1 ? '' : 's'} outside ${mine.join(', ')}: ${shown}${outside.length > 5 ? `, and ${outside.length - 5} more` : ''}.`);
      }
    }
  }
  return problems;
}
