// What the golden test files share: running a case or a probe with the clock
// pinned, comparing it with its file, and updating or dumping it.
//
//   npm test                                  compares
//   node scripts/golden.mjs update [<case>]   rewrites the file of a case that fails
//   node scripts/golden.mjs dump <case>       writes every captured value and string in full
//
// The files are snapshots of Putney's output. A change that alters it on purpose
// rewrites the cases it changes (phase 1 plan section 3), with GOLDEN_UPDATE=1:
// a case whose comparison fails, or that has no file yet, is written, for the
// cases that run, and the run then fails on purpose so an update never passes
// unnoticed. The rewrite keeps the old file's key order, so a diff shows only the
// values that changed. It is refused when CI is set. GOLDEN_UPDATE_LOG names a
// file that gets the name of each case written.
//
// The 19 main case files hold everything in full. The v-* and p-* files keep a
// key over 8 KB as a digest (test/golden/digest.js), compared by digest. A dump
// is always in full, so a digest that fails is diagnosed by dumping the case on
// the base commit and on HEAD and diffing (`node scripts/golden.mjs diff`).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, ALL_CASES, capture, format } from './capture.js';
import { PROBES } from './probes.js';
import { digestOf, isDigest, trimmed } from './digest.js';
import { sameOrder } from './paths.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const ASKED = process.env.GOLDEN_UPDATE === '1';
export const REFUSED = ASKED && Boolean(process.env.CI);
export const UPDATE = ASKED && !REFUSED;
// GOLDEN_DUMP is one case name, or several joined by commas.
export const DUMP = process.env.GOLDEN_DUMP, OUT = process.env.GOLDEN_OUT || join(DIR, 'out');
const DUMPED = new Set((DUMP || '').split(','));
const fileOf = c => join(DIR, `${c.name}.json`);
// The main cases are stored in full; the variants and probes store large keys as digests.
const MAIN = new Set(CASES);

const done = new Map();
export function run(c, sink = null) {
  if (!sink && done.has(c.name)) return done.get(c.name);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(c.clock);
  try {
    // A probe computes its own output; a case is captured from a scenario.
    const got = c.run ? JSON.parse(JSON.stringify(c.run())) : capture(c.scenario, c.clock, c.settings, { ...c.options, loc: c.loc, width: c.width, sink });
    if (!sink) done.set(c.name, got);
    return got;
  } finally { vi.useRealTimers(); }
}
export const ALL = [...ALL_CASES, ...PROBES];
// A case or probe by name, captured on first use.
export const got = name => run(ALL.find(c => c.name === name));

// The per-key comparison: the same keys, then each value with toEqual (which
// ignores key order), a digested key by its digest.
function compare(c, have, want) {
  expect(Object.keys(have).sort()).toEqual(Object.keys(want).sort());
  for (const k of Object.keys(want)) {
    if (!MAIN.has(c) && isDigest(want[k])) expect(digestOf(have[k]), `${c.name}: ${k} (stored as a digest; dump the case to see it in full)`).toEqual(want[k]);
    else expect(have[k], `${c.name}: ${k}`).toEqual(want[k]);
  }
}

// One test for each case or probe in items, and the guard against update mode.
export function defineGolden(items) {
  describe('golden outputs', () => {
    for (const c of items) {
      (DUMP && !DUMPED.has(c.name) ? it.skip : it)(c.name, () => {
        if (DUMP) {
          const sink = (name, text) => { const f = join(OUT, c.name, name); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); };
          const g = run(c, sink);
          mkdirSync(join(OUT, c.name), { recursive: true });
          writeFileSync(join(OUT, c.name, 'capture.json'), format(g, c.run ? 4 : 3));
          return;
        }
        const have = run(c), f = fileOf(c);
        const want = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
        if (UPDATE) {
          try {
            if (!want) throw new Error('no file');
            compare(c, have, want);
            return;
          } catch {
            const stored = MAIN.has(c) ? have : trimmed(have);
            writeFileSync(f, format(want ? sameOrder(want, stored) : stored, c.run ? 4 : 3));
            if (process.env.GOLDEN_UPDATE_LOG) appendFileSync(process.env.GOLDEN_UPDATE_LOG, `${c.name}\n`);
            return;
          }
        }
        compare(c, have, JSON.parse(readFileSync(f, 'utf8')));
      });
    }

    it('is not in update mode', () => {
      expect(REFUSED, 'GOLDEN_UPDATE=1 is refused when CI is set. Golden files are updated by hand, with node scripts/golden.mjs update.').toBe(false);
      expect(UPDATE, 'GOLDEN_UPDATE=1 rewrites the files of the cases that fail, and fails this test on purpose. Run npm test without it to compare.').toBe(false);
    });
  });
}
