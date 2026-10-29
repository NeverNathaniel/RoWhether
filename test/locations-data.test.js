// The location files in the build (phase 1 plan P1.2): the checks over data/,
// the files and shells the plugin writes, and the revision rule. The pure parts
// are called directly. The plugin's hooks run on stand-ins for Vite's context,
// and revisions.mjs runs for real on a scratch git repository.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectLocations, summaries, recordFile, locationFiles, shellHtml, shellNames, locationsPlugin } from '../scripts/locations/plugin.mjs';
import { revisionProblems } from '../scripts/locations/revisions.mjs';
import { resolveLocation, effectiveSettings } from '../src/location.js';
import { GLOBAL_DEFAULTS } from '../src/config.js';
import { bindingsFor } from '../src/sources/index.js';
import { still } from '../src/logic.js';
import { viewsFor } from '../src/render/detail/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = path => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const clone = o => JSON.parse(JSON.stringify(o));
const PUTNEY = readJson('data/locations/putney-landing.json');
const WATERWAY = readJson('data/waterways/connecticut-river-vernon-pool.json');
const INDEX_HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

// A copy of Putney's record with changes made by `edit`.
const rec = edit => { const r = clone(PUTNEY); edit(r); return r; };
// A lake on a waterway with no flow binding, so it needs no flow words.
const LAKE_WATERWAY = { v: 1, id: 'test-lake', name: 'Test Lake', kind: 'lake', country: 'US', regions: ['US-VT'], sources: [] };
const BOTH = { [WATERWAY.id]: WATERWAY, [LAKE_WATERWAY.id]: LAKE_WATERWAY };
const lake = (slug, extra = () => {}) => rec(r => {
  r.slug = slug; r.id = '00000000-0000-4000-8000-000000000001'; r.name = 'Lake Test'; r.waterType = 'lake';
  r.waterway = LAKE_WATERWAY.id; r.flow = null; r.water = null; r.waterTemp = null;
  r.thresholds = { ...r.thresholds }; delete r.thresholds.flowCaution; delete r.thresholds.flowOff; delete r.thresholds.basis;
  r.sources = r.sources.filter(b => b.role === 'alerts'); delete r.copy.flowStats; delete r.copy.flowHow;
  extra(r);
});

let dirs = [];
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = []; });

// A scratch folder with data/locations, data/waterways and public. `locations`
// and `waterways` map a file name (without .json) to a record, or to raw text.
function scratch({ locations = { 'putney-landing': PUTNEY }, waterways = { [WATERWAY.id]: WATERWAY }, pub = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'locations-data-'));
  dirs.push(dir);
  const put = (sub, files) => {
    mkdirSync(join(dir, sub), { recursive: true });
    for (const [name, value] of Object.entries(files)) writeFileSync(join(dir, sub, `${name}.json`), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  };
  put('data/locations', locations);
  put('data/waterways', waterways);
  mkdirSync(join(dir, 'public'));
  for (const f of pub) writeFileSync(join(dir, 'public', f), '');
  return dir;
}
const failure = fn => { try { fn(); } catch (e) { return e.message; } return null; };

describe('collectLocations', () => {
  it('passes every file under data/', () => {
    const list = collectLocations(ROOT);
    const files = readdirSync(join(ROOT, 'data/locations')).filter(f => f.endsWith('.json'));
    expect(list.map(x => x.rec.slug)).toEqual(files.map(f => f.slice(0, -5)).sort());
    expect(list.find(x => x.rec.slug === 'putney-landing').waterway.id).toBe(WATERWAY.id);
  });

  it('names the file and the field of a bad value', () => {
    const msg = failure(() => collectLocations(scratch({ locations: { 'putney-landing': rec(r => { r.lat = 200; }) } })));
    expect(msg).toMatch(/^data\/locations\/putney-landing\.json: lat range /m);
  });

  it('names the file and the field of a bad value in a waterway file', () => {
    const msg = failure(() => collectLocations(scratch({ waterways: { [WATERWAY.id]: { ...clone(WATERWAY), kind: 'pond' } } })));
    expect(msg).toMatch(/^data\/waterways\/connecticut-river-vernon-pool\.json: kind value /m);
    expect(msg.match(/^data\/waterways\//gm).length).toBe(1);
  });

  it('fails a file whose name is not the slug, and a waterway file whose name is not its id', () => {
    const msg = failure(() => collectLocations(scratch({ locations: { putney: PUTNEY }, waterways: { 'a-river': WATERWAY } })));
    expect(msg).toMatch(/^data\/locations\/putney\.json: slug file_name /m);
    expect(msg).toMatch(/^data\/waterways\/a-river\.json: id file_name /m);
  });

  it('fails a record whose waterway has no file', () => {
    const msg = failure(() => collectLocations(scratch({ waterways: {} })));
    expect(msg).toMatch(/^data\/locations\/putney-landing\.json: waterway not_found /m);
  });

  it('fails the slugs of app routes and of files the build writes', () => {
    for (const slug of ['assets', 'locations', 'manifest', 'privacy', 'icon-192', 'workbox-abc', 'apple-touch-icon', 'favicon']) {
      const msg = failure(() => collectLocations(scratch({ locations: { [slug]: rec(r => { r.slug = slug; }) } })));
      expect(msg, slug).toMatch(new RegExp(`^data/locations/${slug}\\.json: slug (reserved|build_name) `, 'm'));
    }
    // The names a slug may not have by validateSlug are RESERVED_SLUGS; the build adds the ones below.
    for (const slug of ['icon-192', 'workbox-abc', 'apple-touch-icon', 'favicon']) {
      const msg = failure(() => collectLocations(scratch({ locations: { [slug]: rec(r => { r.slug = slug; }) } })));
      expect(msg, slug).toMatch(new RegExp(`^data/locations/${slug}\\.json: slug build_name `, 'm'));
    }
  });

  it('fails a slug equal to a file in public/', () => {
    const msg = failure(() => collectLocations(scratch({ locations: { lakeview: rec(r => { r.slug = 'lakeview'; }) }, pub: ['lakeview.png'] })));
    expect(msg).toMatch(/^data\/locations\/lakeview\.json: slug build_name /m);
    expect(failure(() => collectLocations(scratch({ locations: { lakeview: rec(r => { r.slug = 'lakeview'; }) } })))).toBeNull();
  });

  it('fails two records with one slug', () => {
    const msg = failure(() => collectLocations(scratch({ locations: { 'putney-landing': PUTNEY, 'putney-landing-2': rec(r => { r.slug = 'putney-landing'; }) } })));
    // The files are read in name order, and the second one to use a slug is the one named.
    expect(msg).toMatch(/^data\/locations\/putney-landing\.json: slug duplicate Also the slug of data\/locations\/putney-landing-2\.json/m);
    expect(msg.match(/slug duplicate/g).length).toBe(1);
  });

  it('fails a record with no credits or no description', () => {
    for (const k of ['credits', 'description']) {
      const msg = failure(() => collectLocations(scratch({ locations: { 'putney-landing': rec(r => { delete r.copy[k]; }) } })));
      expect(msg, k).toMatch(new RegExp(`^data/locations/putney-landing\\.json: copy\\.${k} required `, 'm'));
    }
    expect(failure(() => collectLocations(scratch({ locations: { 'putney-landing': rec(r => { r.copy = null; }) } })))).toMatch(/copy\.credits required[\s\S]*copy\.description required/);
  });

  it('wants the flow words only for a record with a flow binding, its own or its waterway', () => {
    const inherited = failure(() => collectLocations(scratch({ locations: { 'putney-landing': rec(r => { delete r.copy.flowStats; }) } })));
    expect(inherited).toMatch(/^data\/locations\/putney-landing\.json: copy\.flowStats required /m);
    // No flow binding anywhere: not needed.
    expect(failure(() => collectLocations(scratch({ locations: { 'lake-test': lake('lake-test') }, waterways: BOTH })))).toBeNull();
    // The same lake on the river's waterway inherits its flow binding, so it needs the words.
    const onRiver = scratch({ locations: { 'lake-test': lake('lake-test', r => { r.waterway = WATERWAY.id; }) }, waterways: BOTH });
    expect(failure(() => collectLocations(onRiver))).toMatch(/lake-test\.json: copy\.flowStats required/);
  });

  it('wants version 1', () => {
    const msg = failure(() => collectLocations(scratch({ locations: { 'putney-landing': rec(r => { delete r.v; }) } })));
    expect(msg).toMatch(/^data\/locations\/putney-landing\.json: v required /m);
  });

  it('names a file that is not JSON', () => {
    const msg = failure(() => collectLocations(scratch({ locations: { 'putney-landing': '{ not json' } })));
    expect(msg).toMatch(/^data\/locations\/putney-landing\.json: \(file\) json /m);
  });

  it('puts every problem of every file in one error', () => {
    const dir = scratch({ locations: { 'putney-landing': rec(r => { r.lat = 200; r.lon = 200; }), 'lake-test': lake('lake-test', r => { r.tz = 'Mars/Olympus'; }) }, waterways: BOTH });
    const msg = failure(() => collectLocations(dir));
    expect(msg).toMatch(/^The data files have 3 problems:/);
    expect(msg).toMatch(/putney-landing\.json: lat range/);
    expect(msg).toMatch(/putney-landing\.json: lon range/);
    expect(msg).toMatch(/lake-test\.json: tz zone/);
  });

  it('sorts by slug, and gives each record its own waterway', () => {
    const list = collectLocations(scratch({ locations: { 'putney-landing': PUTNEY, 'lake-test': lake('lake-test') }, waterways: BOTH }));
    expect(list.map(x => x.rec.slug)).toEqual(['lake-test', 'putney-landing']);
    expect(list.map(x => x.waterway.id)).toEqual(['test-lake', WATERWAY.id]);
    // File names sort 'abc-lake.json' before 'abc.json', and slugs the other way.
    const close = collectLocations(scratch({ locations: { 'abc-lake': lake('abc-lake'), abc: lake('abc') }, waterways: BOTH }));
    expect(close.map(x => x.rec.slug)).toEqual(['abc', 'abc-lake']);
  });

  it('accepts a draft with no waterway', () => {
    const draft = rec(r => { r.status = 'draft'; r.waterway = null; r.sources = []; r.thresholds = { ...r.thresholds }; delete r.thresholds.flowCaution; delete r.thresholds.flowOff; delete r.thresholds.basis; });
    expect(failure(() => collectLocations(scratch({ locations: { 'putney-landing': draft } })))).toBeNull();
  });
});

describe('summaries', () => {
  const entry = (rec, waterway = WATERWAY) => ({ rec, waterway });
  const list = [
    entry(lake('b-lake')),
    entry(rec(r => { r.slug = 'a-river'; r.revision = 5; })),
    entry(lake('c-draft', r => { r.status = 'draft'; })),
    entry(lake('d-archived', r => { r.status = 'archived'; })),
    entry(lake('e-published', r => { r.status = 'published'; delete r.revision; }))
  ];

  it('lists published and verified records, and leaves out a draft and an archived one', () => {
    expect(summaries(list).map(s => s.slug)).toEqual(['a-river', 'b-lake', 'e-published']);
  });

  it('is sorted by slug whatever the order it is given', () => {
    expect(summaries([...list].reverse()).map(s => s.slug)).toEqual(['a-river', 'b-lake', 'e-published']);
  });

  it("holds 01 7.2's fields, the waterway's name, and a revision that defaults to 1", () => {
    const [a, , e] = summaries(list);
    expect(a).toEqual({
      slug: 'a-river', name: 'Putney Landing', shortName: 'Putney', locality: 'Putney, VT', waterway: 'Connecticut River',
      lat: 42.9607, lon: -72.5219, tz: 'America/New_York', country: 'US', region: 'US-VT', waterType: 'river', status: 'verified', revision: 5
    });
    expect(e.revision).toBe(1);
  });

  it('has no time in it, so the build repeats', () => {
    expect(JSON.stringify(summaries(list))).not.toMatch(/generated/);
    expect(JSON.stringify(summaries(list))).toBe(JSON.stringify(summaries(list)));
  });
});

describe('recordFile and locationFiles', () => {
  it('recordFile is the record with its whole waterway record, and changes neither', () => {
    const before = [clone(PUTNEY), clone(WATERWAY)];
    const out = recordFile(PUTNEY, WATERWAY);
    expect(out).toEqual({ ...PUTNEY, waterwayRecord: WATERWAY });
    expect(out.waterwayRecord.sources.map(b => b.role)).toEqual(['flow', 'flow_forecast']);
    expect([PUTNEY, WATERWAY]).toEqual(before);
  });

  it('writes the index and one file for each record that is not a draft', () => {
    const list = [{ rec: PUTNEY, waterway: WATERWAY }, { rec: lake('d-archived', r => { r.status = 'archived'; }), waterway: WATERWAY }, { rec: lake('c-draft', r => { r.status = 'draft'; }), waterway: WATERWAY }];
    const files = locationFiles(list);
    expect(Object.keys(files).sort()).toEqual(['locations/d-archived.json', 'locations/index.json', 'locations/putney-landing.json']);
    expect(JSON.parse(files['locations/index.json'])).toEqual({ v: 1, locations: summaries(list) });
    expect(JSON.parse(files['locations/putney-landing.json'])).toEqual(recordFile(PUTNEY, WATERWAY));
  });
});

describe('shellHtml', () => {
  const changed = (a, b) => a.split('\n').map((line, i) => [line, b.split('\n')[i]]).filter(([x, y]) => x !== y);

  it("changes only the canonical and og:url of today's page for Putney, with the title and texts as they were", () => {
    const out = shellHtml(INDEX_HTML, PUTNEY, WATERWAY);
    expect(out.split('\n').length).toBe(INDEX_HTML.split('\n').length);
    expect(changed(INDEX_HTML, out)).toEqual([
      ['<link rel="canonical" href="https://rowhether.com/">', '<link rel="canonical" href="https://rowhether.com/putney-landing">'],
      ['<meta property="og:url" content="https://rowhether.com/">', '<meta property="og:url" content="https://rowhether.com/putney-landing">']
    ]);
    expect(out).toContain('<title>Putney Landing rowing conditions</title>');
    expect(out).toContain('<meta name="description" content="Go, caution or stay off: rowing conditions on the Connecticut River at Putney Landing, VT.">');
  });

  it("takes another record's name, description and address in six places, and nothing else", () => {
    const l = lake('lake-test', r => { r.copy.description = 'Rowing conditions on Lake Test.'; });
    const out = shellHtml(INDEX_HTML, l, WATERWAY);
    expect(changed(INDEX_HTML, out).length).toBe(6);
    expect(out).toContain('<title>Lake Test rowing conditions</title>');
    expect(out).toContain('<meta name="description" content="Rowing conditions on Lake Test.">');
    expect(out).toContain('<link rel="canonical" href="https://rowhether.com/lake-test">');
    expect(out).toContain('<meta property="og:url" content="https://rowhether.com/lake-test">');
    expect(out).toContain('<meta property="og:title" content="Lake Test rowing conditions">');
    expect(out).toContain('<meta property="og:description" content="Rowing conditions on Lake Test.">');
    expect(out).toContain('<meta property="og:image" content="https://rowhether.com/icon-512.png">');
  });

  it('escapes the name and the description, and treats a dollar sign as text', () => {
    const l = lake('lake-test', r => { r.name = 'Tom & "Jerry" <Lake>'; r.copy.description = 'Costs $& $1 a day.'; });
    const out = shellHtml(INDEX_HTML, l, WATERWAY);
    expect(out).toContain('<title>Tom &amp; &quot;Jerry&quot; &lt;Lake&gt; rowing conditions</title>');
    expect(out).toContain('<meta name="description" content="Costs $&amp; $1 a day.">');
  });

  it('fails when a tag is missing or there are two, so a later edit of index.html cannot go unseen', () => {
    expect(() => shellHtml(INDEX_HTML.replace(/<link rel="canonical"[^>]*>\n/, ''), PUTNEY, WATERWAY)).toThrow(/exactly one .*canonical.*found 0/);
    expect(() => shellHtml(INDEX_HTML.replace('<title>', '<title>x</title><title>'), PUTNEY, WATERWAY)).toThrow(/found 2/);
  });
});

describe('shellNames', () => {
  it('lists <slug>.html for each file under data/locations, reading none of them', () => {
    const dir = scratch({ locations: { 'putney-landing': PUTNEY, 'broken-one': '{ not json' } });
    expect(shellNames(dir)).toEqual(['broken-one.html', 'putney-landing.html']);
    expect(shellNames(join(dir, 'nowhere'))).toEqual([]);
    expect(shellNames(ROOT)).toContain('putney-landing.html');
  });
});

describe('the plugin', () => {
  const start = dir => { const p = locationsPlugin(); p.configResolved({ root: dir }); p.buildStart(); return p; };
  const context = () => ({ emitFile: vi.fn(), error: msg => { throw new Error(msg); } });

  it('runs after the other plugins, so the bundle holds the final index.html', () => {
    expect(locationsPlugin().enforce).toBe('post');
  });

  it('fails the build at its start for a bad file', () => {
    expect(() => start(scratch({ locations: { 'putney-landing': rec(r => { r.lat = 200; }) } }))).toThrow(/putney-landing\.json: lat range/);
  });

  it('emits the index, a file and a shell for each record that is not a draft', () => {
    const dir = scratch({ locations: { 'putney-landing': PUTNEY, 'c-draft': lake('c-draft', r => { r.status = 'draft'; }) }, waterways: BOTH });
    const plugin = start(dir);
    const ctx = context();
    plugin.generateBundle.call(ctx, {}, { 'index.html': { source: INDEX_HTML } });
    const emitted = Object.fromEntries(ctx.emitFile.mock.calls.map(([f]) => [f.fileName, f]));
    expect(Object.keys(emitted).sort()).toEqual(['locations/index.json', 'locations/putney-landing.json', 'putney-landing.html']);
    expect(Object.values(emitted).every(f => f.type === 'asset')).toBe(true);
    expect(emitted['putney-landing.html'].source).toBe(shellHtml(INDEX_HTML, PUTNEY, WATERWAY));
    expect(JSON.parse(emitted['locations/index.json'].source).locations.map(l => l.slug)).toEqual(['putney-landing']);
  });

  it("builds each shell from the page in the bundle, with its hashed script, not from index.html on disk", () => {
    const built = INDEX_HTML.replace('/src/main.js', '/assets/index-abc123.js');
    expect(built).not.toBe(INDEX_HTML);
    const plugin = start(scratch());
    const ctx = context();
    plugin.generateBundle.call(ctx, {}, { 'index.html': { source: built } });
    const shell = ctx.emitFile.mock.calls.find(([f]) => f.fileName === 'putney-landing.html')[0].source;
    expect(shell).toContain('<script type="module" src="/assets/index-abc123.js"></script>');
    expect(shell).not.toContain('/src/main.js');
  });

  it("reads the page from bytes as well as text, and fails with no index.html in the bundle", () => {
    const plugin = start(scratch());
    const ctx = context();
    plugin.generateBundle.call(ctx, {}, { 'index.html': { source: new TextEncoder().encode(INDEX_HTML) } });
    expect(ctx.emitFile.mock.calls.find(([f]) => f.fileName === 'putney-landing.html')[0].source).toBe(shellHtml(INDEX_HTML, PUTNEY, WATERWAY));
    expect(() => plugin.generateBundle.call(context(), {}, {})).toThrow(/no index\.html/);
  });

  it('serves the two JSON paths from memory under vite dev, and passes everything else on', () => {
    const plugin = start(scratch());
    let handler;
    plugin.configureServer({ watcher: { add: vi.fn(), on: vi.fn() }, middlewares: { use: fn => { handler = fn; } }, config: { logger: { error: vi.fn() } } });
    const get = url => {
      const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } };
      const next = vi.fn();
      handler({ url }, res, next);
      return { res, next };
    };
    const index = get('/locations/index.json?x=1');
    expect(index.next).not.toHaveBeenCalled();
    expect(index.res.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(index.res.body).locations[0].slug).toBe('putney-landing');
    expect(JSON.parse(get('/locations/putney-landing.json').res.body).waterwayRecord.id).toBe(WATERWAY.id);
    // A name every object has is not a file.
    for (const url of ['/locations/nope.json', '/index.html', '/', '/putney-landing', '/constructor', '/toString', '/__proto__']) expect(get(url).next, url).toHaveBeenCalled();
  });
});

describe('the dev server', () => {
  // The hook with the watcher's callback and the middleware both captured.
  const serve = dir => {
    const plugin = locationsPlugin();
    plugin.configResolved({ root: dir });
    plugin.buildStart();
    const seen = { on: null, added: null, errors: [] };
    let handler;
    plugin.configureServer({
      watcher: { add: p => { seen.added = p; }, on: (_event, fn) => { seen.on = fn; } },
      middlewares: { use: fn => { handler = fn; } },
      config: { logger: { error: m => seen.errors.push(m) } }
    });
    const names = () => {
      const res = { setHeader() {}, end(body) { this.body = body; } };
      handler({ url: '/locations/index.json' }, res, () => {});
      return JSON.parse(res.body).locations.map(l => l.name);
    };
    return { seen, names };
  };

  it('watches data/, and reads the files again when one under it changes', () => {
    const dir = scratch();
    const { seen, names } = serve(dir);
    expect(seen.added).toBe(join(dir, 'data'));
    expect(names()).toEqual(['Putney Landing']);
    writeFileSync(join(dir, 'data/locations/putney-landing.json'), JSON.stringify({ ...PUTNEY, name: 'Putney Docks' }));
    seen.on('change', join(dir, 'data/locations/putney-landing.json'));
    expect(names()).toEqual(['Putney Docks']);
  });

  it('ignores a change outside data/, and keeps serving the last good list when a file breaks', () => {
    const dir = scratch();
    const { seen, names } = serve(dir);
    writeFileSync(join(dir, 'data/locations/putney-landing.json'), JSON.stringify({ ...PUTNEY, name: 'Putney Docks' }));
    seen.on('change', join(dir, 'public/icon.svg'));
    expect(names()).toEqual(['Putney Landing']);
    writeFileSync(join(dir, 'data/locations/putney-landing.json'), '{ not json');
    seen.on('change', join(dir, 'data/locations/putney-landing.json'));
    expect(seen.errors.join('\n')).toMatch(/putney-landing\.json: \(file\) json /);
    expect(names()).toEqual(['Putney Landing']);
  });
});

// Settings of the host that nothing else checks: the build and the budget never
// see wrangler.jsonc or _headers, and a deploy that lost either would still pass.
describe('the host settings for the location files', () => {
  const wrangler = JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  const headers = readFileSync(join(ROOT, 'public/_headers'), 'utf8');

  it('answers a path with no file with index.html, and still sends /api/* to the Worker first', () => {
    expect(wrangler.assets.not_found_handling).toBe('single-page-application');
    expect(wrangler.assets.run_worker_first).toEqual(['/api/*']);
    expect(wrangler.assets.directory).toBe('./dist');
  });

  it('runs the revisions check in CI from the base commit, on the whole history', () => {
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toMatch(/^\s+- run: node scripts\/locations\/revisions\.mjs check c7967a64f1a9bd80ed2f0e14ee6c7ceb69d5d3ab$/m);
    expect(ci).toMatch(/^\s+fetch-depth: 0$/m);
  });

  it('lets a browser keep a location file for an hour, and keeps the other rules', () => {
    expect(headers).toMatch(/^\/locations\/\*\n {2}Cache-Control: public, max-age=3600$/m);
    expect(headers).toMatch(/^\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable$/m);
    expect(headers).toMatch(/^\/sw\.js\n {2}Cache-Control: no-cache$/m);
  });
});

describe('revisionProblems', () => {
  const rev = (waterway, revision) => ({ waterway, ...(revision === undefined ? {} : { revision }) });
  const A = 'data/locations/a-river.json', B = 'data/locations/b-river.json', C = 'data/locations/c-lake.json';
  const commit = (files, before, after) => ({ id: 'abcdef123456', subject: 'Edit', files: files.map(([status, path]) => ({ status, path })), before, after });

  it('fails a commit that edits a record and leaves its revision as it was, one without a revision included', () => {
    const p = revisionProblems([commit([['M', A]], { [A]: rev('w1', 3) }, { [A]: rev('w1', 3) })]);
    expect(p).toEqual([{ commit: 'abcdef1 Edit', file: A, message: `${A} is edited, and its revision stays 3. Raise it.` }]);
    expect(revisionProblems([commit([['M', A]], { [A]: rev('w1') }, { [A]: rev('w1') })]).length).toBe(1);
    expect(revisionProblems([commit([['M', A]], { [A]: rev('w1') }, { [A]: rev('w1', 1) })]).length).toBe(1);
  });

  it('fails a revision that goes down', () => {
    expect(revisionProblems([commit([['M', A]], { [A]: rev('w1', 4) }, { [A]: rev('w1', 3) })]).length).toBe(1);
  });

  it('passes an edit that raises the revision, from a record with none too', () => {
    expect(revisionProblems([commit([['M', A]], { [A]: rev('w1', 3) }, { [A]: rev('w1', 4) })])).toEqual([]);
    expect(revisionProblems([commit([['M', A]], { [A]: rev('w1') }, { [A]: rev('w1', 2) })])).toEqual([]);
  });

  it('fails a commit that edits a waterway without raising each record that uses it, and no other', () => {
    const before = { [A]: rev('w1', 1), [B]: rev('w1', 1), [C]: rev('w2', 1) };
    const after = { [A]: rev('w1', 2), [B]: rev('w1', 1), [C]: rev('w2', 1) };
    const p = revisionProblems([commit([['M', 'data/waterways/w1.json'], ['M', A]], before, after)]);
    expect(p).toEqual([{ commit: 'abcdef1 Edit', file: B, message: `its waterway, data/waterways/w1.json, is edited, and its revision stays 1. Raise it.` }]);
    // Raising both passes.
    expect(revisionProblems([commit([['M', 'data/waterways/w1.json']], before, { ...after, [B]: rev('w1', 2) })])).toEqual([]);
  });

  it('passes an added record, an added waterway, a deleted record and a commit with no data files', () => {
    expect(revisionProblems([commit([['A', C]], { [A]: rev('w1', 1) }, { [A]: rev('w1', 1), [C]: rev('w2') })])).toEqual([]);
    expect(revisionProblems([commit([['A', 'data/waterways/w1.json']], { [A]: rev('w1', 1) }, { [A]: rev('w1', 1) })])).toEqual([]);
    expect(revisionProblems([commit([['D', C]], { [A]: rev('w1', 1), [C]: rev('w2', 1) }, { [A]: rev('w1', 1) })])).toEqual([]);
    expect(revisionProblems([commit([], {}, {})])).toEqual([]);
    expect(revisionProblems([])).toEqual([]);
  });

  it('reports each commit on its own', () => {
    const p = revisionProblems([
      commit([['M', A]], { [A]: rev('w1', 1) }, { [A]: rev('w1', 1) }),
      { ...commit([['M', A]], { [A]: rev('w1', 1) }, { [A]: rev('w1', 2) }), id: '1111111222' },
      { ...commit([['M', B]], { [B]: rev('w1', 1) }, { [B]: rev('w1', 1) }), id: '2222222333', subject: 'Third' }
    ]);
    expect(p.map(x => x.commit)).toEqual(['abcdef1 Edit', '2222222 Third']);
  });
});

// revisions.mjs on a scratch repository: the part that reads commits, merges and
// files with git. The script finds the repository from its own place, so a copy
// of it is put in the scratch one.
describe('node scripts/locations/revisions.mjs check, on a scratch repository', () => {
  const env = {
    ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'scratch', GIT_AUTHOR_EMAIL: 'scratch@example.invalid', GIT_COMMITTER_NAME: 'scratch', GIT_COMMITTER_EMAIL: 'scratch@example.invalid'
  };
  const setup = () => {
    const dir = mkdtempSync(join(tmpdir(), 'revisions-cli-'));
    dirs.push(dir);
    const git = (...args) => {
      const r = spawnSync('git', args, { cwd: dir, env, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')}\n${r.stderr}`);
      return r.stdout.trim();
    };
    const write = (path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
    const record = (name, revision, extra = {}) => write(`data/locations/${name}.json`, `${JSON.stringify({ v: 1, slug: name, waterway: 'w1', ...(revision ? { revision } : {}), ...extra }, null, 2)}\n`);
    const waterway = (note) => write('data/waterways/w1.json', `${JSON.stringify({ v: 1, id: 'w1', note }, null, 2)}\n`);
    const commit = subject => { git('add', '-A'); git('commit', '-q', '-m', subject); return git('rev-parse', 'HEAD'); };
    const check = (...args) => spawnSync('node', ['scripts/locations/revisions.mjs', ...args], { cwd: dir, env, encoding: 'utf8' });
    mkdirSync(join(dir, 'scripts/locations'), { recursive: true });
    copyFileSync(join(ROOT, 'scripts/locations/revisions.mjs'), join(dir, 'scripts/locations/revisions.mjs'));
    git('init', '-q', '-b', 'main');
    record('a-river'); record('b-river'); waterway('one');
    const base = commit('Start');
    return { dir, git, write, record, waterway, commit, check, base };
  };

  it('passes when no commit touched data/, and for an added record', () => {
    const s = setup();
    s.write('notes.txt', 'x');
    s.commit('Not data');
    s.record('c-lake', 1);
    s.commit('Added');
    const r = s.check('check', s.base);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/1 commit touched data\/ since/);
  });

  it('fails an edited record with no new revision, and passes one that raises it', () => {
    const s = setup();
    s.record('a-river', undefined, { name: 'Edited' });
    s.commit('Edit, no raise');
    const r = s.check('check', s.base);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Edit, no raise: data\/locations\/a-river\.json: data\/locations\/a-river\.json is edited, and its revision stays 1\. Raise it\./);
    expect(r.stderr).not.toMatch(/b-river/);
    s.record('a-river', 2, { name: 'Edited' });
    const raised = s.commit('Raise');
    expect(s.check('check', raised + '^').status).toBe(0);
    // The earlier commit is still in the range from the base.
    expect(s.check('check', s.base).status).toBe(1);
  });

  it('fails an edited waterway until every record that uses it is raised', () => {
    const s = setup();
    s.waterway('two');
    s.record('a-river', 2);
    s.commit('Waterway edit, one record raised');
    const r = s.check('check', s.base);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/data\/locations\/b-river\.json: its waterway, data\/waterways\/w1\.json, is edited, and its revision stays 1/);
    expect(r.stderr).not.toMatch(/a-river\.json: its waterway/);
  });

  it('sees a commit on a side branch that a merge to the same result hides', () => {
    const s = setup();
    s.git('checkout', '-q', '-b', 'side');
    s.record('a-river', undefined, { name: 'Same' });
    s.commit('Side edit, no raise');
    s.git('checkout', '-q', 'main');
    s.record('a-river', 2, { name: 'Same' });
    s.commit('Main edit, raised');
    s.git('merge', '-q', '--no-edit', '-X', 'ours', 'side');
    const r = s.check('check', s.base);
    expect(r.status, r.stdout).toBe(1);
    expect(r.stderr).toMatch(/Side edit, no raise/);
    expect(r.stderr).not.toMatch(/Main edit/);
  });

  it('stops with a usage line, or a message for a base that is missing or unknown', () => {
    const s = setup();
    expect(s.check('check').status).toBe(2);
    expect(s.check().status).toBe(2);
    const unknown = s.check('check', '0'.repeat(40));
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toMatch(/No commit/);
  });
});

// The river locations of P1.12 (plan 4.4 and 4.5), read from data/ as the build reads them.
describe('the river test locations', () => {
  const REAL = collectLocations(ROOT);
  const RIVERS = ['boathouse-row', 'hanover-boathouse', 'putney-landing'];
  const entry = slug => REAL.find(x => x.rec.slug === slug);
  const loc = slug => resolveLocation(entry(slug).rec, { waterway: entry(slug).waterway });
  const bindings = slug => Object.fromEntries(bindingsFor(loc(slug), Date.UTC(2026, 5, 15, 16)).map(b => [b.slot, b]));
  // What the real services answered on 2026-10-24 (test/fixtures/sources/<slug>/). The parsers
  // do not read the clock, so these stay readable whatever day the test runs.
  const recorded = (slug, name) => readJson(`test/fixtures/sources/${slug}/${name}.json`);
  const USGS = 'https://api.waterdata.usgs.gov/ogcapi/v1/collections';
  const at = iso => Date.parse(iso);

  it('are listed with their place, water and region, Putney among them', () => {
    const got = Object.fromEntries(summaries(REAL).filter(s => RIVERS.includes(s.slug)).map(s => [s.slug, s]));
    expect(Object.keys(got).sort()).toEqual(RIVERS);
    expect(got['hanover-boathouse']).toEqual({
      slug: 'hanover-boathouse', name: 'Hanover boathouse', shortName: 'Hanover', locality: 'Hanover, NH', waterway: 'Connecticut River',
      lat: 43.70552, lon: -72.29763, tz: 'America/New_York', country: 'US', region: 'US-NH', waterType: 'river', status: 'published', revision: 1
    });
    expect(got['boathouse-row']).toEqual({
      slug: 'boathouse-row', name: 'Boathouse Row', shortName: 'Boathouse Row', locality: 'Philadelphia, PA', waterway: 'Schuylkill River',
      lat: 39.96941, lon: -75.18711, tz: 'America/New_York', country: 'US', region: 'US-PA', waterType: 'river', status: 'published', revision: 1
    });
    expect(got['putney-landing'].region).toBe('US-VT');
    expect(entry('hanover-boathouse').waterway.regions).toEqual(['US-NH', 'US-VT']);
    expect(entry('boathouse-row').waterway.regions).toEqual(['US-PA']);
  });

  it('say "Not confirmed on site": every record but Putney is published, with a course nobody has checked', () => {
    // A record with no course (Lake Carnegie's) has nothing to confirm, and reads as unconfirmed.
    for (const { rec } of REAL.filter(x => x.rec.slug !== 'putney-landing')) {
      expect([rec.slug, rec.status, rec.course.confirmed === true]).toEqual([rec.slug, 'published', false]);
    }
  });

  it('read their flow and the river forecast from the waterway, and their observation from the record', () => {
    for (const [slug, gauge, lid, station] of [['hanover-boathouse', 'USGS-01144500', 'WLBN3', 'KLEB'], ['boathouse-row', 'USGS-01474500', 'PADP1', 'KPHL']]) {
      const s = loc(slug).sources;
      for (const slot of ['flow', 'flowDays']) expect(s[slot].map(r => [r.adapter, r.ref, r.inherited]), `${slug} ${slot}`).toEqual([['usgs-ogc', gauge, true]]);
      expect(s.flowFcst.map(r => [r.adapter, r.ref, r.inherited]), `${slug} flowFcst`).toEqual([['nwps', lid, true]]);
      expect(s.obs.map(r => [r.adapter, r.ref, r.inherited]), `${slug} obs`).toEqual([['nws-obs', station, false]]);
      expect(s.alerts.every(r => r.inherited === false), `${slug} alerts`).toBe(true);
    }
  });

  it("take Boathouse Row's flow and water temperature from one gauge, and ask for it once", () => {
    const rows = loc('boathouse-row').sources.river;
    expect(rows.map(r => [r.role, r.ref, r.params.parameterCode])).toEqual([['flow', 'USGS-01474500', '00060'], ['water_temp', 'USGS-01474500', '00010']]);
    const { url } = bindings('boathouse-row').river;
    expect(url).toBe(`${USGS}/latest-continuous/items?monitoring_location_id=USGS-01474500&parameter_code=00060,00010&f=json&limit=50`);
    expect(url.match(/USGS-01474500/g)).toHaveLength(1);
  });

  it('give Hanover a flow gauge and no water temperature gauge', () => {
    expect(loc('hanover-boathouse').sources.river.map(r => r.role)).toEqual(['flow']);
    expect(bindings('hanover-boathouse').river.url).toBe(`${USGS}/latest-continuous/items?monitoring_location_id=USGS-01144500&parameter_code=00060&f=json&limit=50`);
  });

  it('ask each service for the place, the gauge and the station named in the record', () => {
    const h = bindings('hanover-boathouse'), r = bindings('boathouse-row');
    expect(Object.keys(h)).toEqual(['wx', 'alerts', 'obs', 'river', 'flow', 'flowDays', 'flowFcst', 'aq', 'models']);
    expect(Object.keys(r)).toEqual(Object.keys(h));
    expect(h.alerts.url).toBe('https://api.weather.gov/alerts/active?zone=VTZ021,VTC027,NHZ005,NHC009');
    expect(h.obs.url).toBe('https://api.weather.gov/stations/KLEB/observations/latest');
    expect(h.flow.url).toBe(`${USGS}/continuous/items?monitoring_location_id=USGS-01144500&parameter_code=00060&time=P2D&limit=1000&properties=time,value&f=json`);
    expect(h.flowDays.url).toBe(`${USGS}/daily/items?monitoring_location_id=USGS-01144500&parameter_code=00060&statistic_id=00003&time=P30D&limit=100&properties=time,value&f=json`);
    expect(h.flowFcst.url).toBe('https://api.water.noaa.gov/nwps/v1/gauges/WLBN3/stageflow/forecast');
    expect(r.alerts.url).toBe('https://api.weather.gov/alerts/active?zone=PAZ071,PAC101');
    expect(r.obs.url).toBe('https://api.weather.gov/stations/KPHL/observations/latest');
    expect(r.flow.url).toBe(`${USGS}/continuous/items?monitoring_location_id=USGS-01474500&parameter_code=00060&time=P2D&limit=1000&properties=time,value&f=json`);
    expect(r.flowDays.url).toContain('monitoring_location_id=USGS-01474500&parameter_code=00060&statistic_id=00003');
    expect(r.flowFcst.url).toBe('https://api.water.noaa.gov/nwps/v1/gauges/PADP1/stageflow/forecast');
    // The forecast, air quality and model comparison are asked at the dock point, in the zone.
    for (const [b, lat, lon] of [[h, 43.70552, -72.29763], [r, 39.96941, -75.18711]]) {
      for (const slot of ['wx', 'aq', 'models']) {
        const u = new URL(b[slot].url);
        expect([slot, u.searchParams.get('latitude'), u.searchParams.get('longitude'), u.searchParams.get('timezone')]).toEqual([slot, String(lat), String(lon), 'America/New_York']);
      }
    }
  });

  // Recorded 2026-10-24 between 18:48 and 18:55 UTC with the requests above.
  it("read Hanover's recorded answers as data: the flow, the series, the daily means, the forecast and the airport", () => {
    const b = bindings('hanover-boathouse');
    expect(b.river.parse(recorded('hanover-boathouse', 'latest'))).toEqual({ flow: { v: 1070, t: at('2026-10-24T18:30:00Z') } });
    const flow = b.flow.parse(recorded('hanover-boathouse', 'continuous'));
    expect([flow.length, flow[0].t, flow.at(-1)]).toEqual([191, at('2026-10-22T19:00:00Z'), { t: at('2026-10-24T18:30:00Z'), v: 1070 }]);
    const days = b.flowDays.parse(recorded('hanover-boathouse', 'daily'));
    // Each day sits at noon Eastern, which is 16:00 UTC while daylight saving time lasts.
    expect([days.length, new Date(days[0].t).toISOString(), new Date(days.at(-1).t).toISOString(), days.at(-1).v]).toEqual([30, '2026-09-24T16:00:00.000Z', '2026-10-23T16:00:00.000Z', 2090]);
    const fc = b.flowFcst.parse(recorded('hanover-boathouse', 'nwps'));
    expect(recorded('hanover-boathouse', 'nwps').secondaryUnits).toBe('kcfs');
    expect([fc.pts.length, fc.issued, fc.pts[0].v, fc.pts.at(-1).v]).toEqual([12, at('2026-10-24T15:18:00Z'), 1070, 982]);
    expect(b.obs.parse(recorded('hanover-boathouse', 'obs'))).toMatchObject({ t: at('2026-10-24T18:30:00Z'), wind: 0, dir: 0, text: 'Clear' });
    expect(b.alerts.parse(recorded('hanover-boathouse', 'alerts'))).toEqual([]);
  });

  it("read Boathouse Row's recorded answers as data, the water temperature from the flow gauge's own answer", () => {
    const b = bindings('boathouse-row');
    expect(b.river.parse(recorded('boathouse-row', 'latest'))).toEqual({ flow: { v: 1040, t: at('2026-10-24T18:00:00Z') }, waterC: { v: 14.5, t: at('2026-10-24T18:00:00Z') } });
    const flow = b.flow.parse(recorded('boathouse-row', 'continuous'));
    expect([flow.length, flow.at(-1)]).toEqual([95, { t: at('2026-10-24T18:00:00Z'), v: 1040 }]);
    expect(b.flowDays.parse(recorded('boathouse-row', 'daily')).length).toBe(30);
    const fc = b.flowFcst.parse(recorded('boathouse-row', 'nwps'));
    expect([fc.pts.length, fc.pts[0].v]).toEqual([12, 886]);
    expect(b.obs.parse(recorded('boathouse-row', 'obs'))).toMatchObject({ t: at('2026-10-24T18:30:00Z'), dir: 180, text: 'Mostly Clear' });
    // A frost advisory for the two zones: a product with no polygon applies to the dock.
    expect(b.alerts.parse(recorded('boathouse-row', 'alerts')).map(a => [a.event, a.lvl])).toEqual([['Frost Advisory', 1]]);
  });

  // 01 11.3: Caution at the 88th percentile of the daily mean flow, Stay off at the 95th, each
  // rounded down to two figures, and the against-the-current steps at that Caution and at
  // the 65th percentile. The numbers are the stats the waterway file records.
  it("hold limits that follow the rule from each waterway's recorded flow statistics", () => {
    const two = v => { const e = 10 ** (Math.floor(Math.log10(v)) - 1); return Math.floor(v / e) * e; };
    for (const slug of RIVERS) {
      const { rec, waterway } = entry(slug);
      const { stats } = waterway.sources.find(r => r.role === 'flow');
      expect([slug, rec.thresholds.flowCaution, rec.thresholds.flowOff], slug).toEqual([slug, two(stats.p88), two(stats.p95)]);
      expect([slug, rec.flow.against], slug).toEqual([slug, [[two(stats.p88), 1.4], [two(stats.p65), 1.25]]]);
    }
  });

  // 4.4 and 4.5: the wind, gust, rain, cold and air limits are the ones every location starts
  // from, so only the flow limits are the river's own. They read the water as Putney's is read.
  it('start from the global limits with only their own flow limits, and read the water and the reach as a river', () => {
    for (const slug of RIVERS) {
      const l = loc(slug), { flowCaution, flowOff } = entry(slug).rec.thresholds;
      expect(effectiveSettings(l), slug).toEqual({ ...GLOBAL_DEFAULTS, flowCaution, flowOff });
      expect([slug, l.water.mode, l.water.cross, l.course.reachWord], slug).toEqual([slug, 'river', 0.4, 'straight']);
    }
  });

  // The sentence under the flow limits in Settings says what the record holds: the median day
  // from its stats, its two limits, and the share of days over each (plan 4.4 and 4.5).
  it("state the median and the limits it holds in the flow note of Settings, with the plan's shares of days", () => {
    const num = v => v.toLocaleString('en-US');
    for (const [slug, median, over] of [['hanover-boathouse', 5400, [13, 5]], ['boathouse-row', 2000, [12, 5]]]) {
      const { rec, waterway } = entry(slug), { thresholds: t } = rec, { stats } = waterway.sources.find(r => r.role === 'flow');
      expect(stats.p50, `${slug} median to two figures`).toBeGreaterThanOrEqual(median);
      expect(stats.p50).toBeLessThan(median + 100);
      expect(rec.copy.flowStats, slug).toBe(`Since 2016 the median day is about ${num(median)} cfs. ${num(t.flowCaution)} is the top ${over[0]}% of days, ${num(t.flowOff)} the top ${over[1]}%.`);
    }
  });

  // 01 6.3, 15.7: Phase 1 gives every location the windows Putney has. A flow reading counts for
  // 24 hours (a second gauge is tried after 6) and a gauge's water temperature for 72.
  it('count a flow reading for 24 hours and a water temperature for 72, as Putney does', () => {
    for (const slug of RIVERS) {
      expect([slug, loc(slug).flow.maxAgeH, loc(slug).flow.staleSwitchH, loc(slug).waterTemp.maxAgeH]).toEqual([slug, 24, 6, 72]);
    }
  });
});

// P1.13: the lake and reservoir records (plan 4.6, 4.7, 4.9), with what the services answered on 2026-10-24.
describe('the lake and reservoir test locations', () => {
  const REAL = collectLocations(ROOT);
  const LAKES = ['lake-carnegie', 'lake-natoma', 'lake-quinsigamond'];
  const entry = slug => REAL.find(x => x.rec.slug === slug);
  const loc = slug => resolveLocation(entry(slug).rec, { waterway: entry(slug).waterway });
  const bindings = slug => Object.fromEntries(bindingsFor(loc(slug), Date.UTC(2026, 5, 15, 16)).map(b => [b.slot, b]));
  const recorded = (slug, name) => readJson(`test/fixtures/sources/${slug}/${name}.json`);
  const at = iso => Date.parse(iso);
  const metres = (a, b, c, d) => {
    const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  };

  it('are listed with their place, water and region', () => {
    const got = Object.fromEntries(summaries(REAL).filter(s => LAKES.includes(s.slug)).map(s => [s.slug, s]));
    expect(Object.keys(got).sort()).toEqual(LAKES);
    expect(got['lake-quinsigamond']).toEqual({
      slug: 'lake-quinsigamond', name: 'Lake Quinsigamond', shortName: 'Quinsigamond', locality: 'Shrewsbury, MA', waterway: 'Lake Quinsigamond',
      lat: 42.29043, lon: -71.75505, tz: 'America/New_York', country: 'US', region: 'US-MA', waterType: 'lake', status: 'published', revision: 1
    });
    expect(got['lake-natoma']).toEqual({
      slug: 'lake-natoma', name: 'Lake Natoma', shortName: 'Natoma', locality: 'Gold River, CA', waterway: 'Lake Natoma',
      lat: 38.63453, lon: -121.21918, tz: 'America/Los_Angeles', country: 'US', region: 'US-CA', waterType: 'reservoir', status: 'published', revision: 1
    });
    expect(got['lake-carnegie']).toEqual({
      slug: 'lake-carnegie', name: 'Lake Carnegie', shortName: 'Carnegie', locality: 'Princeton, NJ', waterway: 'Lake Carnegie',
      lat: 40.33932, lon: -74.65048, tz: 'America/New_York', country: 'US', region: 'US-NJ', waterType: 'lake', status: 'published', revision: 1
    });
    expect(Object.fromEntries(LAKES.map(s => [s, entry(s).waterway.regions]))).toEqual({ 'lake-carnegie': ['US-NJ'], 'lake-natoma': ['US-CA'], 'lake-quinsigamond': ['US-MA'] });
    expect(entry('lake-natoma').waterway.reach).toBe('Folsom Dam to Nimbus Dam');
  });

  it('are still water: the fetch mode, the shape of the lake from its outline, and the reference fetch of 2 km', () => {
    const shape = Object.fromEntries(LAKES.map(s => [s, loc(s).water]));
    expect(shape['lake-quinsigamond']).toMatchObject({ mode: 'fetch', refFetchM: 2000, fetchM: null, lake: { axis: 166, lengthM: 6600, widthM: 370 } });
    expect(shape['lake-natoma']).toMatchObject({ mode: 'fetch', refFetchM: 2000, fetchM: null, lake: { axis: 31, lengthM: 9700, widthM: 230 } });
    expect(shape['lake-carnegie']).toMatchObject({ mode: 'fetch', refFetchM: 2000, fetchM: null, lake: { axis: 35, lengthM: 4800, widthM: 200 } });
  });

  it("give Quinsigamond and Natoma a heading along the lake with shores made from it, and Carnegie no course", () => {
    const q = loc('lake-quinsigamond'), n = loc('lake-natoma'), c = loc('lake-carnegie');
    expect([q.course.kind, q.course.heading, q.course.confirmed]).toEqual(['heading', 166, false]);
    expect([n.course.kind, n.course.heading, n.course.confirmed]).toEqual(['heading', 31, false]);
    // The right side faces heading + 90: 256 is west and 121 is south-east.
    expect([q.banks.word, q.banks.left.name, q.banks.right.name]).toEqual(['shore', 'east', 'west']);
    expect([n.banks.word, n.banks.left.name, n.banks.right.name, n.banks.right.short]).toEqual(['shore', 'northwest', 'southeast', 'SE']);
    expect([c.course.kind, c.course.heading, c.banks]).toEqual(['none', undefined, null]);
  });

  it('have no flow binding, no flow limit and no flow words, and Natoma a water temperature row only', () => {
    for (const slug of LAKES) {
      const l = loc(slug), t = entry(slug).rec.thresholds;
      expect([slug, l.flow, l.sources.flow, l.sources.flowDays, l.sources.flowFcst, 'flowCaution' in t, 'basis' in t, 'flowStats' in l.copy, 'flowHow' in l.copy]).toEqual([slug, null, undefined, undefined, undefined, false, false, false, false]);
      expect(effectiveSettings(l), slug).toEqual({ ...GLOBAL_DEFAULTS, flowCaution: '', flowOff: '' });
    }
    expect(loc('lake-natoma').sources.river.map(r => [r.role, r.adapter, r.ref, r.params.parameterCode, r.tz, r.relation])).toEqual([['water_temp', 'usgs-ogc', 'USGS-11446500', '00010', 'America/Los_Angeles', 'downstream']]);
    expect(loc('lake-quinsigamond').sources.river).toBeUndefined();
    expect(loc('lake-carnegie').sources.river).toBeUndefined();
  });

  it('count a water temperature for 72 hours, and have none to fall back on', () => {
    for (const slug of LAKES) expect([slug, loc(slug).waterTemp.maxAgeH, loc(slug).waterTemp.fallback, loc(slug).waterTemp.monthly]).toEqual([slug, 72, 'none', null]);
  });

  it('ask each service for the place, the zones, the station and the gauge named in the record', () => {
    const q = bindings('lake-quinsigamond'), n = bindings('lake-natoma'), c = bindings('lake-carnegie');
    expect(Object.keys(q)).toEqual(['wx', 'alerts', 'obs', 'aq', 'models']);
    expect(Object.keys(c)).toEqual(['wx', 'alerts', 'obs', 'aq', 'models']);
    expect(Object.keys(n)).toEqual(['wx', 'alerts', 'obs', 'river', 'aq', 'models']);
    expect(q.alerts.url).toBe('https://api.weather.gov/alerts/active?zone=MAZ012,MAC027');
    expect(q.obs.url).toBe('https://api.weather.gov/stations/KORH/observations/latest');
    expect(n.alerts.url).toBe('https://api.weather.gov/alerts/active?zone=CAZ154,CAC067');
    expect(n.obs.url).toBe('https://api.weather.gov/stations/KMHR/observations/latest');
    expect(n.river.url).toBe('https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous/items?monitoring_location_id=USGS-11446500&parameter_code=00010&f=json&limit=50');
    expect(c.alerts.url).toBe('https://api.weather.gov/alerts/active?zone=NJZ015,NJC021,NJZ012,NJC023');
    expect(c.obs.url).toBe('https://api.weather.gov/stations/KTTN/observations/latest');
    for (const [b, lat, lon, tz] of [[q, 42.29043, -71.75505, 'America/New_York'], [n, 38.63453, -121.21918, 'America/Los_Angeles'], [c, 40.33932, -74.65048, 'America/New_York']]) {
      for (const slot of ['wx', 'aq', 'models']) {
        const u = new URL(b[slot].url);
        expect([slot, u.searchParams.get('latitude'), u.searchParams.get('longitude'), u.searchParams.get('timezone')]).toEqual([slot, String(lat), String(lon), tz]);
      }
    }
  });

  // Natoma's station is the nearest the NWS lists that has reported with a wind in the last 3 hours (02, step 5).
  // KMHR had been quiet for 8 hours when the plan was written, so it named KSAC. It reported again on 2026-10-24.
  it("name the nearest station that reported with a wind, as Natoma's is KMHR and not KSAC", () => {
    const o = entry('lake-natoma').rec.sources.find(r => r.role === 'obs');
    expect([o.ref, o.label, o.distanceM, o.siteLat, o.siteLon, o.relation]).toEqual(['KMHR', 'Mather', 10023, 38.55996, -121.28397, 'nearby']);
    expect(o.note).toBe('Mather airport, 6 mi southwest. A check on the model.');
    expect(entry('lake-natoma').rec.copy.credits).toContain('Alerts and Mather airport observations from the [National Weather Service, Sacramento](https://www.weather.gov/sto/).');
    expect(entry('lake-natoma').rec.copy.credits).not.toMatch(/KSAC|Executive/);
  });

  it("put each station's distance where the record says it is, from the dock to the station", () => {
    for (const slug of [...LAKES, 'hanover-boathouse', 'boathouse-row']) {
      const { rec } = entry(slug);
      for (const r of rec.sources.filter(x => x.siteLat != null)) {
        expect(Math.abs(metres(rec.lat, rec.lon, r.siteLat, r.siteLon) - r.distanceM), `${slug} ${r.ref}`).toBeLessThan(25);
      }
    }
  });

  // Recorded 2026-10-24 between 19:53 and 20:02 UTC with the requests above.
  it('read the recorded answers as data: the stations, the water temperature below the dam and the alerts', () => {
    expect(bindings('lake-quinsigamond').obs.parse(recorded('lake-quinsigamond', 'obs'))).toMatchObject({ t: at('2026-10-24T19:35:00Z'), dir: 290, text: 'Clear' });
    expect(bindings('lake-quinsigamond').obs.parse(recorded('lake-quinsigamond', 'obs')).wind).toBeCloseTo(5.544 * 0.621371, 6);
    // KMHR gave a wind speed and no direction (variable): the reading is kept, with no direction.
    const mather = bindings('lake-natoma').obs.parse(recorded('lake-natoma', 'obs'));
    expect(mather).toMatchObject({ t: at('2026-10-24T18:55:00Z'), dir: null, text: 'Clear' });
    expect(mather.wind).toBeCloseTo(7.56 * 0.621371, 6);
    expect(bindings('lake-carnegie').obs.parse(recorded('lake-carnegie', 'obs'))).toMatchObject({ t: at('2026-10-24T19:35:00Z'), wind: 0, dir: 0, text: 'Clear' });
    // Fair Oaks answers 00010 alone: a temperature and no flow.
    expect(bindings('lake-natoma').river.parse(recorded('lake-natoma', 'latest'))).toEqual({ waterC: { v: 15.7, t: at('2026-10-24T19:45:00Z') } });
    expect(bindings('lake-quinsigamond').alerts.parse(recorded('lake-quinsigamond', 'alerts'))).toEqual([]);
    expect(bindings('lake-natoma').alerts.parse(recorded('lake-natoma', 'alerts'))).toEqual([]);
    // A frost advisory for Mercer and Middlesex among others, with no polygon: it applies to the dock.
    expect(bindings('lake-carnegie').alerts.parse(recorded('lake-carnegie', 'alerts')).map(a => [a.event, a.lvl])).toEqual([['Frost Advisory', 1]]);
  });

  it("credit the office, the station and the gauge each lake reads, with a link, and name nothing of another place", () => {
    const links = slug => [...entry(slug).rec.copy.credits.matchAll(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g)].map(m => [m[1], m[2]]);
    expect(links('lake-quinsigamond')).toEqual([['Open-Meteo', 'https://open-meteo.com/'], ['National Weather Service, Boston', 'https://www.weather.gov/box/']]);
    expect(links('lake-natoma')).toEqual([
      ['Open-Meteo', 'https://open-meteo.com/'], ['National Weather Service, Sacramento', 'https://www.weather.gov/sto/'],
      ['11446500 at Fair Oaks', 'https://waterdata.usgs.gov/monitoring-location/USGS-11446500/']
    ]);
    expect(links('lake-carnegie')).toEqual([['Open-Meteo', 'https://open-meteo.com/'], ['National Weather Service, Mount Holly', 'https://www.weather.gov/phi/']]);
    for (const slug of LAKES) {
      const { rec } = entry(slug);
      expect(JSON.stringify([rec.copy, rec.subtitle]), slug).not.toMatch(/Putney|Connecticut|Albany|Gray|Vermont|New Hampshire|North Walpole|Northfield|Keene|river forecast/i);
    }
  });

  it('say what a Natoma rower needs to know in the line under the name: releases can change the current', () => {
    expect(entry('lake-natoma').rec.subtitle).toBe('Lake Natoma above Nimbus Dam. Releases from Folsom Dam can change the current.');
    expect(entry('lake-natoma').rec.tzLabel).toBeNull();
    expect(loc('lake-natoma').tz).toBe('America/Los_Angeles');
  });
});

// P1.14: Thompson Boat Center (plan 4.8), tidal water on the Potomac at Georgetown, with what the services answered on 2026-10-25.
describe('the tidal test location', () => {
  const REAL = collectLocations(ROOT);
  const entry = REAL.find(x => x.rec.slug === 'thompson-boat-center');
  const loc = resolveLocation(entry.rec, { waterway: entry.waterway });
  const bindings = Object.fromEntries(bindingsFor(loc, Date.UTC(2026, 5, 15, 16)).map(b => [b.slot, b]));
  const recorded = name => readJson(`test/fixtures/sources/thompson-boat-center/${name}.json`);
  const at = iso => Date.parse(iso);
  const USGS = 'https://api.waterdata.usgs.gov/ogcapi/v1/collections';

  it('is listed with its place, water and region, on a waterway in three regions', () => {
    expect(summaries(REAL).find(s => s.slug === 'thompson-boat-center')).toEqual({
      slug: 'thompson-boat-center', name: 'Thompson Boat Center', shortName: 'Thompson', locality: 'Washington, DC', waterway: 'Potomac River',
      lat: 38.90053, lon: -77.05834, tz: 'America/New_York', country: 'US', region: 'US-DC', waterType: 'tidal', status: 'published', revision: 1
    });
    expect(entry.waterway.regions).toEqual(['US-DC', 'US-VA', 'US-MD']);
    expect(entry.waterway.kind).toBe('tidal');
    expect(entry.rec.status).toBe('published');
    expect(entry.rec.course.confirmed).toBe(false);
  });

  it('is tidal water, read as a river reach with no current: the crosswind weight, no steps, and the course 285', () => {
    expect(loc.water).toMatchObject({ mode: 'tidal', cross: 0.4 });
    expect(still(loc)).toBe(false);
    expect(loc.flow.against).toBeNull();
    expect([loc.course.kind, loc.course.heading, loc.course.reachWord, loc.course.confirmed]).toEqual(['heading', 285, 'straight', false]);
    // Facing upstream at 285 the left bank is Virginia and the right is Georgetown, on the DC side.
    expect([loc.banks.word, loc.banks.left.short, loc.banks.left.name, loc.banks.right.short, loc.banks.right.name]).toEqual(['bank', 'VA', 'Virginia', 'DC', 'Georgetown']);
    expect(loc.tide).toEqual({ floodHeading: 285, unit: 'ft', streamCaution: null, streamOff: null, minLaunch: null, slackMin: 30, against: null });
  });

  it('has a tide row of its own and takes its flow, daily means and river forecast from the waterway', () => {
    const s = loc.sources;
    expect(s.tide.map(r => [r.adapter, r.ref, r.unit, r.label, r.inherited, r.relation, r.distanceM])).toEqual([['nwps', 'GTND2', 'ft', 'Georgetown', false, 'upstream', 866]]);
    for (const slot of ['flow', 'flowDays']) expect(s[slot].map(r => [r.adapter, r.ref, r.inherited]), slot).toEqual([['usgs-ogc', 'USGS-01646500', true]]);
    expect(s.flowFcst.map(r => [r.adapter, r.ref, r.inherited])).toEqual([['nwps', 'BRKM2', true]]);
    expect(s.obs.map(r => [r.adapter, r.ref, r.label, r.inherited])).toEqual([['nws-obs', 'KDCA', 'Reagan National', false]]);
    expect(viewsFor(loc).map(v => v.key)).toEqual(['week', 'wind', 'tide', 'river', 'storms', 'fog', 'temperature', 'rain', 'light', 'air']);
  });

  it('takes the flow and the water temperature from one gauge, Little Falls, and asks for it once', () => {
    expect(loc.sources.river.map(r => [r.role, r.ref, r.params.parameterCode])).toEqual([['flow', 'USGS-01646500', '00060'], ['water_temp', 'USGS-01646500', '00010']]);
    expect(bindings.river.url).toBe(`${USGS}/latest-continuous/items?monitoring_location_id=USGS-01646500&parameter_code=00060,00010&f=json&limit=50`);
    expect(bindings.river.url.match(/USGS-01646500/g)).toHaveLength(1);
  });

  it('asks each service for the tide point, the gauge, the zones and the station named in the records', () => {
    expect(Object.keys(bindings)).toEqual(['wx', 'alerts', 'obs', 'river', 'flow', 'flowDays', 'flowFcst', 'tide', 'aq', 'models']);
    // The five zones, the marine one among them: the dock point alone would miss a Small Craft Advisory (plan 4.8).
    expect(bindings.alerts.url).toBe('https://api.weather.gov/alerts/active?zone=DCZ001,DCC001,VAZ054,VAC013,ANZ535');
    expect(bindings.obs.url).toBe('https://api.weather.gov/stations/KDCA/observations/latest');
    expect(bindings.flow.url).toBe(`${USGS}/continuous/items?monitoring_location_id=USGS-01646500&parameter_code=00060&time=P2D&limit=1000&properties=time,value&f=json`);
    expect(bindings.flowDays.url).toBe(`${USGS}/daily/items?monitoring_location_id=USGS-01646500&parameter_code=00060&statistic_id=00003&time=P30D&limit=100&properties=time,value&f=json`);
    // The river forecast and the tide forecast are two points of one service, and each reads its own.
    expect(bindings.flowFcst.url).toBe('https://api.water.noaa.gov/nwps/v1/gauges/BRKM2/stageflow/forecast');
    expect(bindings.tide.url).toBe('https://api.water.noaa.gov/nwps/v1/gauges/GTND2/stageflow/forecast');
    for (const slot of ['wx', 'aq', 'models']) {
      const u = new URL(bindings[slot].url);
      expect([slot, u.searchParams.get('latitude'), u.searchParams.get('longitude'), u.searchParams.get('timezone')]).toEqual([slot, '38.90053', '-77.05834', 'America/New_York']);
    }
  });

  it("holds limits that follow the rule from the waterway's recorded flow statistics, and the gauge they are for", () => {
    const two = v => { const e = 10 ** (Math.floor(Math.log10(v)) - 1); return Math.floor(v / e) * e; };
    const { stats } = entry.waterway.sources.find(r => r.role === 'flow');
    expect([entry.rec.thresholds.flowCaution, entry.rec.thresholds.flowOff]).toEqual([two(stats.p88), two(stats.p95)]);
    expect(entry.rec.thresholds.basis).toEqual({ flow: 'usgs-ogc:USGS-01646500:cfs' });
    expect(effectiveSettings(loc)).toEqual({ ...GLOBAL_DEFAULTS, flowCaution: 22000, flowOff: 35000 });
    expect(loc.ignoredFlow).toBeUndefined();
    expect([loc.flow.maxAgeH, loc.flow.staleSwitchH, loc.waterTemp.maxAgeH, loc.waterTemp.fallback]).toEqual([24, 6, 72, 'none']);
  });

  it('states the median day and the two limits in the flow note of Settings, and what the flow does at the dock', () => {
    const { stats } = entry.waterway.sources.find(r => r.role === 'flow');
    expect(Math.abs(stats.p50 - 6500)).toBeLessThan(50);
    expect(entry.rec.copy.flowStats).toBe('Since 2016 the median day at Little Falls is about 6,500 cfs. 22,000 is the top 12% of days, 35,000 the top 5%.');
    expect(entry.rec.copy.flowHow).toContain('At the dock the tide also moves the water.');
  });

  it("puts each source's distance where the record says it is, from the dock", () => {
    const metres = (a, b, c, d) => {
      const r = x => x * Math.PI / 180, h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
      return 2 * 6371000 * Math.asin(Math.sqrt(h));
    };
    for (const r of [...entry.rec.sources, ...entry.waterway.sources].filter(x => x.siteLat != null)) {
      expect(Math.abs(metres(entry.rec.lat, entry.rec.lon, r.siteLat, r.siteLon) - r.distanceM), r.ref).toBeLessThan(25);
    }
  });

  // Recorded 2026-10-25 between 02:05 and 02:12 UTC with the requests above (the tide forecast was issued at 00:38 UTC).
  it('reads the recorded answers as data: the gauge, the daily means, the river forecast, the tide and the airport', () => {
    expect(bindings.river.parse(recorded('latest'))).toEqual({ flow: { v: 3400, t: at('2026-10-25T01:50:00Z') }, waterC: { v: 15.8, t: at('2026-10-25T01:50:00Z') } });
    const days = bindings.flowDays.parse(recorded('daily'));
    expect([days.length, new Date(days[0].t).toISOString(), new Date(days.at(-1).t).toISOString(), days.at(-1).v]).toEqual([29, '2026-09-25T16:00:00.000Z', '2026-10-23T16:00:00.000Z', 3790]);
    const fc = bindings.flowFcst.parse(recorded('nwps'));
    expect(recorded('nwps').primaryName).toBe('Stage');
    expect([fc.pts.length, fc.issued, fc.pts[0].v, fc.pts.at(-1).v]).toEqual([12, at('2026-10-24T13:59:00Z'), 3400, 2350]);
    const tide = bindings.tide.parse(recorded('tide'));
    expect([tide.station, tide.unit, tide.series.length, tide.events.length, tide.issued]).toEqual(['Georgetown', 'ft', 72, 11, at('2026-10-25T00:38:00Z')]);
    expect(bindings.obs.parse(recorded('obs'))).toMatchObject({ t: at('2026-10-25T01:55:00Z'), wind: 0, dir: 0, text: 'Clear' });
    expect(bindings.alerts.parse(recorded('alerts'))).toEqual([]);
    // Each answer read by the other's binding is refused or empty, so a swapped row cannot pass for a tide.
    expect(() => bindings.tide.parse(recorded('nwps'))).toThrow('Not a tide forecast');
    expect(bindings.flowFcst.parse(recorded('tide')).pts).toEqual([]);
  });

  it('credits the office, the gauge, the station and the two forecasts it reads, with a link, and names nothing of another place', () => {
    const links = [...entry.rec.copy.credits.matchAll(/\[([^\]]+)\]\((https:\/\/[^)]+)\)/g)].map(m => [m[1], m[2]]);
    expect(links).toEqual([
      ['Open-Meteo', 'https://open-meteo.com/'], ['National Weather Service, Baltimore/Washington', 'https://www.weather.gov/lwx/'],
      ['01646500 at Little Falls', 'https://waterdata.usgs.gov/monitoring-location/USGS-01646500/'],
      ['NWS Middle Atlantic River Forecast Center', 'https://water.noaa.gov/gauges/gtnd2']
    ]);
    expect(JSON.stringify([entry.rec.copy, entry.rec.subtitle])).not.toMatch(/Putney|Connecticut|Albany|Gray|Vermont|New Hampshire|North Walpole|Northfield|Keene/i);
    expect(entry.rec.subtitle).toBe('Tidal Potomac River at Georgetown.');
  });
});
