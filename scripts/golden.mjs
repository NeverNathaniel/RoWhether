// Helper for the golden outputs (test/golden.test.js and test/golden-variants.test.js).
//
//   node scripts/golden.mjs write [--force]    writes the test/golden/*.json files that do not exist yet
//                                              (the 19 cases, the v-* variants and the p-* probes)
//   node scripts/golden.mjs dump <case> [dir]  writes every string one case or variant captured, in full
//   node scripts/golden.mjs dump               lists the cases
//
// write runs the test with GOLDEN_WRITE=1, which fails the run on purpose so a
// write never passes unnoticed; this script treats that one failure as success.
// --force rewrites files that exist. Only P0.1 may do that.
//
// dump goes to test/golden/out/<case>/ (git ignored): one file per HTML string,
// and capture.json. To see what a failing step changed, dump the case on the
// P0.1 commit (a git worktree of it) and on your branch, then `diff -r` the
// two folders.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ALL_CASES } from '../test/golden/capture.js';
import { PROBES } from '../test/golden/probes.js';

const CASES = [...ALL_CASES, ...PROBES];

const [cmd, ...args] = process.argv.slice(2);
const vitest = env => spawnSync('npx', ['vitest', 'run', 'test/golden', ...env.extra], {
  env: { ...process.env, ...env.vars }, encoding: 'utf8', stdio: env.inherit ? 'inherit' : 'pipe'
});

if (cmd === 'write') {
  const out = join(mkdtempSync(join(tmpdir(), 'golden-')), 'result.json');
  const vars = { GOLDEN_WRITE: '1', ...(args.includes('--force') ? { GOLDEN_FORCE: '1' } : {}) };
  const r = vitest({ vars, extra: ['--reporter=json', '--outputFile', out] });
  let failed;
  try {
    failed = JSON.parse(readFileSync(out, 'utf8')).testResults.flatMap(f => f.assertionResults).filter(t => t.status === 'failed');
  } catch (e) {
    process.stderr.write(`${r.stdout || ''}${r.stderr || ''}\nCould not read the test result.\n`);
    process.exit(1);
  }
  // The guard test fails by design. Anything else failing is a real error.
  const real = failed.filter(t => t.title !== 'is not in write mode');
  if (real.length) {
    for (const t of real) console.error(`FAILED ${t.fullName}\n${(t.failureMessages || []).join('\n')}`);
    process.exit(1);
  }
  console.log(`Wrote ${CASES.length} files to test/golden/. The run failed on purpose; now run npm test to compare.`);
} else if (cmd === 'dump') {
  const [name, dir] = args;
  if (!CASES.some(c => c.name === name)) {
    console.log(`${name ? `No case ${name}. ` : ''}Cases:\n${CASES.map(c => `  ${c.name}`).join('\n')}`);
    process.exit(name ? 1 : 0);
  }
  const out = resolve(dir || 'test/golden/out');
  const r = vitest({ vars: { GOLDEN_DUMP: name, GOLDEN_OUT: out }, extra: [], inherit: true });
  if (r.status === 0) console.log(`Dumped ${name} to ${join(out, name)}`);
  process.exit(r.status ?? 1);
} else {
  console.error('Usage: node scripts/golden.mjs write [--force] | dump [<case> [dir]]');
  process.exit(2);
}
