// Tools for the golden outputs (test/golden.test.js and test/golden-variants.test.js).
// The files in test/golden/ are snapshots of Putney. A commit that changes
// Putney's output on purpose rewrites the cases it changes, with these tools, and
// names the change ids it applies in a `Golden:` trailer (phase 1 plan section 3).
//
//   node scripts/golden.mjs update [<case> ...]   rewrites the files of the cases whose comparison fails
//                                                 (or only the named ones), and writes a missing file.
//                                                 Refused when CI is set. It keeps each file's key order.
//   node scripts/golden.mjs diff [<rev>]          for each file that differs between <rev> (default HEAD)
//                                                 and the working tree, the case name and every key path
//                                                 that changed, was added or was removed
//   node scripts/golden.mjs check <base>          the rule CI applies to each commit from <base> to HEAD
//                                                 that touched a golden file: a deleted file fails, and a
//                                                 modified one needs a Golden trailer whose ids, from
//                                                 test/golden/changes.js, cover every changed path
//   node scripts/golden.mjs dump [<case> [dir]]   writes every value and string one case, variant or probe
//                                                 captured, in full. With no case, lists them
//
// update runs the two golden test files with GOLDEN_UPDATE=1, which fails the run
// on purpose so an update never passes unnoticed; this script treats that one
// failure as success. The case names are the names of the files in test/golden/
// (a test checks that both ways), so no module of the capture is loaded here: it
// reads JSON that plain Node cannot import.
//
// diff reads leaves. A key a v-* or p-* file stores as a digest ({ sha256, bytes })
// hides what moved, so for each case with such a key diff dumps the case in a
// temporary worktree of <rev> and in the working tree (to the system temp folder;
// set TMPDIR to choose) and prints the full paths under that key. check never
// builds a worktree, so it can run in CI.
//
// dump goes to test/golden/out/<case>/ (git ignored): one file per HTML string,
// and capture.json. A dump holds the full values, so a failing digest is diagnosed
// by dumping the case here and in a worktree of the parent commit, then `diff -r`.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANGES } from '../test/golden/changes.js';
import { checkProblems, diffPaths } from '../test/golden/paths.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const GLOB = 'test/golden/*.json';
const TESTS = ['test/golden.test.js', 'test/golden-variants.test.js'];
const [cmd, ...args] = process.argv.slice(2);

const fail = (message, code = 1) => { console.error(message); process.exit(code); };
const names = () => readdirSync(join(ROOT, 'test/golden')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -'.json'.length)).sort();
const tempDir = () => mkdtempSync(join(tmpdir(), 'golden-'));

// git, in the repository, with its output as text. null when it fails and `soft` is set.
function git(argv, { soft = false, cwd = ROOT } = {}) {
  const r = spawnSync('git', argv, { cwd, encoding: 'utf8', maxBuffer: 1 << 29 });
  if (r.status === 0) return r.stdout;
  if (soft) return null;
  return fail(`git ${argv.join(' ')} failed:\n${r.stderr}`);
}

// vitest on the two golden test files, in `cwd`, under the zone `npm test` uses.
const vitest = (extra, vars, { cwd = ROOT, inherit = false } = {}) => spawnSync('npx', ['vitest', 'run', ...TESTS, ...extra], {
  cwd, env: { ...process.env, TZ: 'Pacific/Auckland', ...vars }, encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe', maxBuffer: 1 << 29
});

if (cmd === 'update') {
  if (process.env.CI) fail('Refused: CI is set. Golden files are updated by hand, never in CI.', 2);
  const dir = tempDir(), result = join(dir, 'result.json'), log = join(dir, 'written.txt');
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Vitest matches the pattern against the suite and test names joined with " > ". The guard
  // test is in it, so the run fails on purpose when cases are named too.
  const only = args.length ? ['-t', `^golden outputs > (${[...args, 'is not in update mode'].map(escape).join('|')})$`] : [];
  const r = vitest(['--reporter=json', '--outputFile', result, ...only], { GOLDEN_UPDATE: '1', GOLDEN_UPDATE_LOG: log });
  let tests;
  try {
    tests = JSON.parse(readFileSync(result, 'utf8')).testResults.flatMap(f => f.assertionResults);
  } catch {
    fail(`${r.stdout || ''}${r.stderr || ''}\nCould not read the test result.`);
  }
  // The guard test fails by design. Anything else failing is a real error.
  const real = tests.filter(t => t.status === 'failed' && t.title !== 'is not in update mode');
  const ran = new Set(tests.filter(t => t.status === 'passed' || t.status === 'failed').map(t => t.title));
  const missing = args.filter(n => !ran.has(n));
  const written = existsSync(log) ? [...new Set(readFileSync(log, 'utf8').split('\n').filter(Boolean))].sort() : [];
  rmSync(dir, { recursive: true, force: true });
  for (const t of real) console.error(`FAILED ${t.fullName}\n${(t.failureMessages || []).join('\n')}`);
  if (missing.length) console.error(`No case or probe named ${missing.join(', ')} ran. The names are the files in test/golden/.`);
  console.log(written.length ? `Rewrote ${written.length} file${written.length === 1 ? '' : 's'} in test/golden/:\n${written.map(n => `  ${n}`).join('\n')}` : 'Nothing needed rewriting.');
  console.log('The run failed on purpose. Now run node scripts/golden.mjs diff to read what moved, then npm test.');
  process.exit(real.length || missing.length ? 1 : 0);
} else if (cmd === 'diff') {
  const rev = args[0] || 'HEAD';
  if (git(['rev-parse', '--verify', `${rev}^{commit}`], { soft: true }) === null) fail(`No commit ${rev}.`, 2);
  // Files that differ from rev, and files not tracked yet.
  const listed = [...git(['diff', '--name-only', rev, '--', GLOB]).split('\n'), ...git(['ls-files', '--others', '--exclude-standard', '--', GLOB]).split('\n')];
  const files = [...new Set(listed.filter(f => /^test\/golden\/[^/]+\.json$/.test(f)))].sort();
  const read = path => (existsSync(join(ROOT, path)) ? JSON.parse(readFileSync(join(ROOT, path), 'utf8')) : null);
  const lines = [], expand = [];
  for (const path of files) {
    const name = path.slice('test/golden/'.length, -'.json'.length);
    const was = git(['show', `${rev}:${path}`], { soft: true }), now = read(path);
    if (was === null) { lines.push([name, '(new file)']); continue; }
    if (now === null) { lines.push([name, '(deleted)']); continue; }
    const changes = diffPaths(JSON.parse(was), now);
    // A digest leaf says only that its key moved, so the key is dumped to read the paths under it.
    const keys = [...new Set(changes.filter(c => c.digest).map(c => c.path.split('.')[0]))];
    if (keys.length) expand.push({ name, keys });
    for (const c of changes) if (!c.digest) lines.push([name, `${c.path} (${c.kind})`]);
    for (const k of keys) lines.push([name, null, k]);
  }
  // Dump the cases with a digest key at rev and here, and diff what they captured in full.
  const full = new Map();
  if (expand.length) {
    const work = tempDir(), tree = join(work, 'rev'), list = expand.map(e => e.name);
    try {
      const out = { rev: join(work, 'out-rev'), now: join(work, 'out-now') };
      if (git(['worktree', 'add', '--detach', tree, rev], { soft: true }) === null) fail(`Could not make a worktree of ${rev}.`);
      symlinkSync(join(ROOT, 'node_modules'), join(tree, 'node_modules'));
      const dump = (cwd, dir) => {
        mkdirSync(dir, { recursive: true });
        // A harness that takes a list of names is run once. An older one, once for each case.
        const many = readFileSync(join(cwd, 'test/golden/harness.js'), 'utf8').includes("split(',')");
        for (const group of many ? [list] : list.map(n => [n])) vitest([], { GOLDEN_DUMP: group.join(','), GOLDEN_OUT: dir }, { cwd });
      };
      dump(tree, out.rev);
      dump(ROOT, out.now);
      const capture = (dir, name) => { const f = join(dir, name, 'capture.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
      for (const { name } of expand) {
        const a = capture(out.rev, name), b = capture(out.now, name);
        if (a && b) full.set(name, diffPaths(a, b));
      }
    } finally {
      git(['worktree', 'remove', '--force', tree], { soft: true });
      rmSync(work, { recursive: true, force: true });
    }
  }
  for (const [name, text, key] of lines) {
    if (text) { console.log(`${name}: ${text}`); continue; }
    const under = full.get(name)?.filter(c => c.path.split('.')[0] === key);
    if (!under) console.log(`${name}: ${key} (changed, stored as a digest; the dump of one side failed)`);
    else for (const c of under) console.log(`${name}: ${c.path} (${c.kind})`);
  }
  if (!lines.length) console.log(`No golden value differs from ${rev}.`);
} else if (cmd === 'check') {
  const base = args[0];
  if (!base) fail('Usage: node scripts/golden.mjs check <base>', 2);
  if (git(['rev-parse', '--verify', `${base}^{commit}`], { soft: true }) === null) fail(`No commit ${base}. CI needs the whole history (fetch-depth: 0).`, 2);
  const ids = git(['rev-list', '--reverse', '--no-merges', '--full-history', `${base}..HEAD`, '--', GLOB]).split('\n').filter(Boolean);
  const commits = ids.map(id => {
    const files = git(['diff-tree', '--no-commit-id', '--name-status', '-r', '--no-renames', id, '--', GLOB]).split('\n').filter(Boolean)
      .map(line => line.split('\t')).filter(([, path]) => /^test\/golden\/[^/]+\.json$/.test(path))
      .map(([status, path]) => {
        const name = path.slice('test/golden/'.length, -'.json'.length);
        if (status !== 'M') return { name, status, changes: [] };
        const was = JSON.parse(git(['show', `${id}^:${path}`])), now = JSON.parse(git(['show', `${id}:${path}`]));
        return { name, status, changes: diffPaths(was, now) };
      });
    return {
      id, files,
      subject: git(['log', '-1', '--format=%s', id]).trim(),
      trailer: git(['log', '-1', '--format=%(trailers:key=Golden,valueonly,unfold)', id])
    };
  });
  const problems = checkProblems(commits, CHANGES);
  for (const p of problems) console.error(`${p.commit}: ${p.file ? `${p.file}: ` : ''}${p.message}`);
  const commitsWith = new Set(problems.map(p => p.commit)).size;
  if (problems.length) fail(`golden check failed: ${problems.length} problem${problems.length === 1 ? '' : 's'} in ${commitsWith} commit${commitsWith === 1 ? '' : 's'} since ${base.slice(0, 7)}. A golden file is never deleted. A change to one needs ids from test/golden/changes.js in a Golden trailer, and every changed path inside them.`);
  console.log(`golden check passed: ${commits.length} commit${commits.length === 1 ? '' : 's'} touched golden files since ${base.slice(0, 7)}, each covered.`);
} else if (cmd === 'dump') {
  const [name, dir] = args;
  const all = names(), wanted = (name || '').split(',').filter(Boolean);
  if (!wanted.length || wanted.some(n => !all.includes(n))) {
    console.log(`${name ? `No case ${wanted.filter(n => !all.includes(n)).join(', ')}. ` : ''}Cases:\n${all.map(c => `  ${c}`).join('\n')}`);
    process.exit(name ? 1 : 0);
  }
  const out = resolve(dir || 'test/golden/out');
  const r = vitest([], { GOLDEN_DUMP: name, GOLDEN_OUT: out }, { inherit: true });
  if (r.status === 0) console.log(`Dumped ${wanted.join(', ')} to ${out}`);
  process.exit(r.status ?? 1);
} else {
  fail('Usage: node scripts/golden.mjs update [<case> ...] | diff [<rev>] | check <base> | dump [<case> [dir]]', 2);
}
