// What the golden test files share: running a case or a probe with the clock
// pinned, comparing it with its file, and writing or dumping it.
//
//   npm test                              compares
//   node scripts/golden.mjs write --force writes every file (P0.1 only)
//   node scripts/golden.mjs dump <case>   writes every captured value and string in full
//
// Writing fails the run on purpose, so it can never pass unnoticed. A file that
// exists is never rewritten unless GOLDEN_FORCE=1, which is for P0.1 only.
//
// The 19 main case files hold everything in full. The v-* and p-* files keep a
// key over 8 KB as a digest (test/golden/digest.js), compared by digest. A dump
// is always in full, so a digest that fails is diagnosed by dumping the case on
// the base commit and on HEAD and diffing.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, ALL_CASES, capture, format } from './capture.js';
import { PROBES } from './probes.js';
import { digestOf, isDigest, trimmed } from './digest.js';

const DIR = dirname(fileURLToPath(import.meta.url));
export const WRITE = process.env.GOLDEN_WRITE === '1', FORCE = process.env.GOLDEN_FORCE === '1';
export const DUMP = process.env.GOLDEN_DUMP, OUT = process.env.GOLDEN_OUT || join(DIR, 'out');
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
    const got = c.run ? JSON.parse(JSON.stringify(c.run())) : capture(c.scenario, c.clock, c.settings, { ...c.options, width: c.width, sink });
    if (!sink) done.set(c.name, got);
    return got;
  } finally { vi.useRealTimers(); }
}
export const ALL = [...ALL_CASES, ...PROBES];
// A case or probe by name, captured on first use.
export const got = name => run(ALL.find(c => c.name === name));

// One test for each case or probe in items, and the guard against write mode.
export function defineGolden(items) {
  describe('golden outputs', () => {
    for (const c of items) {
      (DUMP && DUMP !== c.name ? it.skip : it)(c.name, () => {
        if (DUMP) {
          const sink = (name, text) => { const f = join(OUT, c.name, name); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); };
          const g = run(c, sink);
          mkdirSync(join(OUT, c.name), { recursive: true });
          writeFileSync(join(OUT, c.name, 'capture.json'), format(g, c.run ? 4 : 3));
          return;
        }
        const have = run(c);
        if (WRITE) {
          const text = format(MAIN.has(c) ? have : trimmed(have), c.run ? 4 : 3), f = fileOf(c);
          if (existsSync(f) && readFileSync(f, 'utf8') !== text && !FORCE) throw new Error(`${c.name}.json exists and differs. Not rewritten. GOLDEN_FORCE=1 rewrites it.`);
          writeFileSync(f, text);
          return;
        }
        const want = JSON.parse(readFileSync(fileOf(c), 'utf8'));
        expect(Object.keys(have).sort()).toEqual(Object.keys(want).sort());
        for (const k of Object.keys(want)) {
          if (!MAIN.has(c) && isDigest(want[k])) expect(digestOf(have[k]), `${c.name}: ${k} (stored as a digest; dump the case to see it in full)`).toEqual(want[k]);
          else expect(have[k], `${c.name}: ${k}`).toEqual(want[k]);
        }
      });
    }

    it('is not in write mode', () => {
      expect(WRITE, 'GOLDEN_WRITE=1 writes the files and fails on purpose. Run npm test without it to check them.').toBe(false);
    });
  });
}
