// The golden tools end to end. The pure rules are in golden-check.test.js. This
// runs the real scripts/golden.mjs `check` on a scratch git repository (the part
// that reads commits, trailers and merges), and checks that the harness and
// `update` refuse to rewrite a file when CI is set. No vitest runs inside vitest.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('the golden harness under GOLDEN_UPDATE and CI', () => {
  afterEach(() => vi.unstubAllEnvs());
  const modeWith = async env => {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const { UPDATE, REFUSED } = await import('./golden/harness.js');
    return { UPDATE, REFUSED };
  };

  it('compares only, by default', async () => {
    expect(await modeWith({ GOLDEN_UPDATE: '', CI: '' })).toEqual({ UPDATE: false, REFUSED: false });
    expect(await modeWith({ GOLDEN_UPDATE: '0', CI: '1' })).toEqual({ UPDATE: false, REFUSED: false });
  });

  it('rewrites files when GOLDEN_UPDATE is 1 and CI is not set', async () => {
    expect(await modeWith({ GOLDEN_UPDATE: '1', CI: '' })).toEqual({ UPDATE: true, REFUSED: false });
  });

  it('refuses to rewrite a file when CI is set', async () => {
    expect(await modeWith({ GOLDEN_UPDATE: '1', CI: '1' })).toEqual({ UPDATE: false, REFUSED: true });
    expect(await modeWith({ GOLDEN_UPDATE: '1', CI: 'true' })).toEqual({ UPDATE: false, REFUSED: true });
  });
});

describe('node scripts/golden.mjs update', () => {
  it('is refused when CI is set, with or without a case name, before it runs anything', () => {
    for (const args of [['update'], ['update', 'june-calm-1200-default']]) {
      const r = spawnSync('node', ['scripts/golden.mjs', ...args], { cwd: ROOT, env: { ...process.env, CI: '1' }, encoding: 'utf8' });
      expect(r.status, args.join(' ')).toBe(2);
      expect(r.stderr).toMatch(/Refused: CI is set/);
    }
  });
});

// A scratch repository with a copy of the script and the files it imports, and
// its own changes.js, so the real one can change without touching these tests.
describe('node scripts/golden.mjs check, on a scratch repository', () => {
  let dir;
  const env = {
    ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'scratch', GIT_AUTHOR_EMAIL: 'scratch@example.invalid', GIT_COMMITTER_NAME: 'scratch', GIT_COMMITTER_EMAIL: 'scratch@example.invalid'
  };
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: dir, env, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}\n${r.stderr}`);
    return r.stdout.trim();
  };
  const write = (path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
  const golden = (name, cached, keep = 1) => write(`test/golden/${name}.json`, `${JSON.stringify({ status: { header: { cached, failed: 'x' } }, keep }, null, 2)}\n`);
  // The attribution lines are the last block, so a Golden line next to them is a trailer.
  const commit = (subject, ids) => {
    git('add', '-A');
    git('commit', '-q', '-m', `${subject}\n\n${ids ? `Golden: ${ids}\n` : ''}Co-Authored-By: scratch <scratch@example.invalid>`);
    return git('rev-parse', 'HEAD');
  };
  const check = base => spawnSync('node', ['scripts/golden.mjs', 'check', base], { cwd: dir, env, encoding: 'utf8' });

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'golden-cli-'));
    for (const f of ['scripts/golden.mjs', 'test/golden/paths.js', 'test/golden/digest.js']) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      copyFileSync(join(ROOT, f), join(dir, f));
    }
    write('test/golden/changes.js', "export const CHANGES = { saved: { why: 'w', step: 'P1.5', files: ['*'], paths: ['status.header.*'] } };\n");
    git('init', '-q', '-b', 'main');
    golden('case-a', 'a');
    golden('case-b', 'a');
    commit('Start');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  // Each test checks from the commit it starts at, so the ones before it do not count.
  const from = () => git('rev-parse', 'HEAD');

  it('passes a commit that touches no golden file', () => {
    const base = from();
    write('notes.txt', 'x');
    commit('Not golden');
    const r = check(base);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/0 commits touched golden files/);
  });

  it('passes a change the trailer names, and an added file', () => {
    const base = from();
    golden('case-a', 'b');
    commit('Covered', 'saved');
    golden('case-c', 'a');
    commit('Added');
    const r = check(base);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/2 commits touched golden files/);
  });

  it('fails a modified file with no trailer', () => {
    const base = from();
    golden('case-a', 'c');
    commit('No trailer');
    const r = check(base);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/No trailer: modifies 1 golden file and has no Golden trailer/);
  });

  it('fails an id that changes.js does not have', () => {
    const base = from();
    golden('case-a', 'd');
    commit('Unknown id', 'nosuch');
    const r = check(base);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/names nosuch, which test\/golden\/changes\.js does not have/);
  });

  it('fails a changed path outside the paths of the id', () => {
    const base = from();
    golden('case-a', 'd', 2);
    commit('Outside', 'saved');
    const r = check(base);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/1 changed path outside saved: keep/);
  });

  it('fails a deleted file, even with a trailer', () => {
    const base = from();
    git('rm', '-q', 'test/golden/case-b.json');
    commit('Deleted', 'saved');
    const r = check(base);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/case-b: deleted/);
  });

  it('reads the trailer only from the last block of the message', () => {
    const base = from();
    golden('case-a', 'e');
    git('add', '-A');
    git('commit', '-q', '-m', 'Blank line\n\nGolden: saved\n\nCo-Authored-By: scratch <scratch@example.invalid>');
    const r = check(base);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/has no Golden trailer/);
  });

  it('sees a commit on a side branch that a merge to the same result hides', () => {
    const start = from();
    git('checkout', '-q', '-b', 'side');
    golden('case-a', 'same');
    commit('Side commit, no trailer');
    git('checkout', '-q', 'main');
    golden('case-a', 'same');
    commit('Main commit, same change', 'saved');
    git('merge', '-q', '--no-edit', 'side');
    const r = check(start);
    expect(r.status, r.stdout).toBe(1);
    expect(r.stderr).toMatch(/Side commit, no trailer: modifies 1 golden file and has no Golden trailer/);
    expect(r.stderr).not.toMatch(/Main commit/);
  });

  it('stops with a usage line or a message when the base is missing or unknown', () => {
    const none = spawnSync('node', ['scripts/golden.mjs', 'check'], { cwd: dir, env, encoding: 'utf8' });
    expect(none.status).toBe(2);
    const unknown = check('0'.repeat(40));
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toMatch(/No commit/);
  });
});
