// A record's revision rises with every change to it (01 2.1: "Starts at 1, plus
// 1 on every applied change"; phase 1 plan P1.2 item 8, review finding R14).
// The app keeps a copy of each record it opens and compares its revision with
// locations/index.json on every start, so a record that changed without a new
// revision would never reach an installed phone.
//
//   node scripts/locations/revisions.mjs check <base>
//
// For each commit from <base> to HEAD that touched data/ (merges skipped, as in
// golden.mjs check), every record it modifies, and every record whose waterway
// file it modifies, must have a higher revision than in the commit's parent. A
// record with no `revision` is 1. A record the commit adds passes. It reads
// commits with git and imports nothing, so CI runs it before npm ci.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const LOCATIONS = /^data\/locations\/[^/]+\.json$/;
const revisionOf = rec => rec?.revision ?? 1;

// The problems in a list of commits, each
//   { id, subject, files: [{ path, status }], before: { path: record }, after: { path: record } }
// where `files` are the data/ files the commit changed (status A, M or D),
// and `before` and `after` hold every location record at the parent and at the
// commit, by path (data/locations/<slug>.json). Returns [{ commit, file, message }].
export function revisionProblems(commits) {
  const problems = [];
  for (const { id, subject, files, before = {}, after = {} } of commits) {
    const edited = new Set(files.filter(f => f.status === 'M').map(f => f.path));
    for (const [path, now] of Object.entries(after)) {
      const was = before[path];
      if (!was || !now) continue; // added here, or unreadable: the build checks the file
      const because = edited.has(path) ? `${path} is edited`
        : edited.has(`data/waterways/${now.waterway}.json`) ? `its waterway, data/waterways/${now.waterway}.json, is edited` : null;
      if (because && !(revisionOf(now) > revisionOf(was))) {
        problems.push({ commit: `${String(id).slice(0, 7)}${subject ? ` ${subject}` : ''}`, file: path, message: `${because}, and its revision stays ${revisionOf(was)}. Raise it.` });
      }
    }
  }
  return problems;
}

function git(argv, { soft = false } = {}) {
  const r = spawnSync('git', argv, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status === 0) return r.stdout;
  if (soft) return null;
  console.error(`git ${argv.join(' ')} failed:\n${r.stderr}`);
  process.exit(1);
}

// Every location record at a revision of the repository, by path. A file that
// is not JSON is left out.
function recordsAt(rev) {
  const out = {};
  const names = git(['ls-tree', '-r', '--name-only', rev, '--', 'data/locations/'], { soft: true });
  for (const path of (names || '').split('\n').filter(p => LOCATIONS.test(p))) {
    try { out[path] = JSON.parse(git(['show', `${rev}:${path}`])); } catch { /* the build reports it */ }
  }
  return out;
}

function check(base) {
  if (git(['rev-parse', '--verify', `${base}^{commit}`], { soft: true }) === null) {
    console.error(`No commit ${base}. CI needs the whole history (fetch-depth: 0).`);
    process.exit(2);
  }
  const ids = git(['rev-list', '--reverse', '--no-merges', '--full-history', `${base}..HEAD`, '--', 'data/']).split('\n').filter(Boolean);
  const commits = ids.map(id => ({
    id,
    subject: git(['log', '-1', '--format=%s', id]).trim(),
    files: git(['diff-tree', '--no-commit-id', '--name-status', '-r', '--no-renames', id, '--', 'data/']).split('\n').filter(Boolean)
      .map(line => line.split('\t')).map(([status, path]) => ({ status, path })),
    before: recordsAt(`${id}^`),
    after: recordsAt(id)
  }));
  const problems = revisionProblems(commits);
  for (const p of problems) console.error(`${p.commit}: ${p.file}: ${p.message}`);
  const n = commits.length;
  if (problems.length) {
    console.error(`revisions check failed: ${problems.length} problem${problems.length === 1 ? '' : 's'} since ${base.slice(0, 7)}. A commit that edits a record, or its waterway file, raises that record's revision (01 2.1).`);
    process.exit(1);
  }
  console.log(`revisions check passed: ${n} commit${n === 1 ? '' : 's'} touched data/ since ${base.slice(0, 7)}, each edited record raised.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, base] = process.argv.slice(2);
  if (cmd !== 'check' || !base) {
    console.error('Usage: node scripts/locations/revisions.mjs check <base>');
    process.exit(2);
  }
  check(base);
}
