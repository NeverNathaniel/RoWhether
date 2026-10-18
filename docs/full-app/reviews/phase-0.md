# Phase 0 safety net review

Reviewed the Phase 0 checks (P0.1 golden outputs, P0.2 screenshots and the smoke and timing specs, P0.3 budget and CI) against what the refactor steps P0.4 to P0.14 in 08 section 14 could break, on `dev-full-app` at commit `93adcdb`, with every check run again at `21c835f` after P0.4 landed during the review. Started Sun Oct 18 15:41:59 UTC 2026 (`date -u`).

Status: in progress

Count so far: 3 blockers, 7 major, 6 minor.

Severity: blocker means a likely regression in P0.4 to P0.14 would pass every check; major means a real gap or a weakness in the net; minor means small.

How the evidence was made: a git worktree at the commit, `npm ci` in it, one change of the kind a step might make, then `npx vitest run` (248 tests at `93adcdb`, 262 at `21c835f`), the CI browser command `npx playwright test --grep-invert @visual` (10 tests) and, where it matters, `npx playwright test --grep @visual` (the 48 screenshots), then `git checkout` to put the code back. Prototype specs written for this review were not committed; the parts that matter are quoted in the fixes. This container is not the one that made the screenshots (Chromium 1194, Node 22.22.0, 4 cores, Linux x86_64 here too).

## Blockers

#### Z1. The real page is never compared with the golden outputs

- Severity: blocker.
- Where: P0.6 to P0.10. `test/golden/capture.js` (it builds `app` itself and calls the render functions), `test/browser/smoke.spec.js`, `test/browser/timing.spec.js`; in the app, `src/state.js`, `src/data.js` `fetchAll`, `src/main.js` `refresh()`, `src/render/index.js` `render()`, `src/render/days.js` `fillPeriod()`, `src/route.js`.
- Problem: The golden capture builds its own state. It parses with `dataFrom()`, passes a settings object it made, sets `app.model`, `app.data` and `app.settings`, and calls `renderHero()` and the rest directly. The page gets there another way: storage and `src/state.js`, `fetchAll()`, the parsers, `render()`, `fillPeriod()` and the tab router. P0.6 to P0.10 rewrite exactly that path (bindings, `fetchAll(loc)`, `app.loc`, `app.settings` without `heading`, `buildModel(app.loc, ...)`). The browser specs that run in CI read no text: the smoke spec checks the console, the width, the tab bar and the blocked message, and the timing spec checks a mark and the header. The screenshots see the page, but only at P0.14, by hand, on one kind of machine, and not inside a closed `<details>`: the Hour by hour table (`src/render/detail/common.js` line 72) is closed in every shot.
- Evidence: Three changes to the page's own path, each run at `93adcdb` with `npx vitest run` (248 tests) and the CI browser command (10 tests). (B) `fetchAll` sorts each URL's parameters and drops `models` from the model comparison request: all tests pass. (C) `parseRiver(d, b)` reads the gauge ids from the binding, as P0.6 plans, with Putney's ids as the default argument, and `fetchAll` passes a binding that names them `sites`, not `gauges`: all tests pass, and the page has no flow and no water temperature. (D2) A simulated end of P0.10 (logic and render read `m.loc.course.heading`, `app.settings` has no `heading`, the capture still passes `heading` in its settings) with one reader left behind, `courseWord(h, S.heading)` at `src/render/detail/wind.js` line 106: the 248 tests, the 10 CI browser tests and all 48 `@visual` screenshots pass, while the Wind view's hour table says "Cross, VT" for every hour with wind. A prototype parity spec (below) passed at `93adcdb` and at `21c835f` in both projects, and also with `timezoneId: 'Pacific/Auckland'` and `locale: 'de-DE'`. It failed on C (`#days`) and on D2 (the Wind view text). B is caught by Z4's check.
- Fix: Now, before P0.6 (P0.5 landed during this review), add `test/browser/parity.spec.js` to the CI browser run (no `@visual` tag). For the nine default cases in the 390 project, and `june-calm-1200-wide` in the 1280 project: pin the clock, route the fixtures, load `/`, then (1) for every id in the file's `home` except `updated` (the page fetches at the clock, the capture three minutes before), compare `hidden`, and where `innerHTML` is not empty, `textContent`, hashed where the file holds a hash; (2) open every Day by day row and compare its `.forecast` text with the capture's HTML for that period, parsed by the page; (3) open every tab and compare `#detailBody` text with the capture's view HTML, parsed the same way. The capture at HEAD equals the files (`npm test`), so a page that equals the capture equals the files. Pin `timezoneId` and `locale` (Z11). The custom cases join after P0.7, with their settings saved through the dialog (Z6). The prototype's core:

```js
// (1) the golden file against the page
const want = JSON.parse(readFileSync(new URL(`../golden/${name}-${hr}00-default.json`, import.meta.url), 'utf8')).home;
for (const id of Object.keys(want)) {
  if (id === 'updated') continue;
  const { have, hidden } = await page.evaluate(i => { const e = document.getElementById(i); return { have: e.textContent, hidden: !!e.hidden }; }, id);
  expect(hidden, `#${id} hidden`).toBe(want[id].hidden);
  if (want[id].innerHTML === '') continue; // a container the render code only flagged
  const w = want[id].textContent;
  expect(typeof w === 'string' ? have : { length: have.length, sha256: sha256(have) }, `#${id}`).toEqual(w);
}
// (2) and (3): run capture(c.scenario, c.clock, c.settings, { width, sink }) with Date.now pinned to
// c.clock, keep html[name] from the sink, and compare page text with the same HTML parsed by the page.
const norm = s => page.evaluate(h => { const t = document.createElement('template'); t.innerHTML = h; return t.content.textContent.replace(/\s+/g, ' ').trim(); }, s);
expect(await page.locator(`details[data-id="${id}"] .forecast`).evaluate(e => e.textContent.replace(/\s+/g, ' ').trim()))
  .toBe(await norm(html[`forecasts/${id}.html`]));
```

#### Z2. The capture's settings carry the heading, so a missed heading reader passes

- Severity: blocker.
- Where: P0.9 and P0.10. `test/golden/capture.js` lines 29 (`CUSTOM`), 67 (`buildModel`), 97 (`S: { ...m.S }`), 159 (`const S = { ...settings }`) and 182 (`L.relWind(dir, S.heading)`); `test/golden/probes.js` lines 47 and 123; the readers in `src/logic.js` 65 and 89, `src/render/now.js` 49 and 51, `forecast.js` 85 and 86, `detail/wind.js` 73, 106 and 120.
- Problem: Every golden case passes a settings object that holds `heading`, and the files record `model.S` with it (`june-calm-1200-custom.json` has `"heading": 20`). From P0.9 the location carries the heading, and from the end of P0.10 `app.settings` does not. 14.2 P0.9 says the capture "takes its settings from `effectiveSettings(PUTNEY)`", which has no `heading`, so `model.S` stops matching, and the quickest way back to equal files is to put `heading` back into the capture's settings. Then a line that still reads `S.heading` or `m.S.heading` reads the same number as `m.loc.course.heading` in every case, and the golden files cannot tell which one the code reads. In the app that line reads `undefined`. 08 already missed one of these lines once (consistency finding C1, `wind.js` line 120).
- Evidence: P0.9 and P0.10 simulated in the worktree (`buildModel` takes a location, logic and render read `m.loc.course.heading`, `src/state.js` drops `heading` from `app.settings`, `render()` passes `app.loc`), with `forecast.js` line 86 left on `S.heading`. With the capture keeping `heading` in its settings (at `93adcdb`): the 139 golden tests pass, 248 in all, and the 10 CI browser tests pass, while every full forecast in the page says "River runs --, upstream heading undefined°." The `@visual` row screenshots catch that line at P0.14; with `wind.js` line 106 left instead (D2 in Z1), they pass too. With the capture changed as in the fix: 94 golden tests fail, on `forecasts`. With line 86 then fixed, they pass, except the two water probes, which build models from `{ ...DEFAULTS, heading }` and need the same change.
- Fix: Write it into 14.2 P0.9. The capture removes `heading` from every settings object it passes (`const { heading, ...S } = settings`), gives the heading to the model only through the location (`PUTNEY` resolved with that heading), records `S: { heading: m.loc.course.heading, ...m.S }` so the files stay equal, and takes `rel` from `m.loc.course.heading`. `probes.js` does the same in `modelWith` and the heading loop. A test asserts that no settings object the capture passes has a `heading` key. Land the capture edit first, as its own commit, with a wrapper that adds the heading back for today's `buildModel(data, S, now)`, so the edit is proven against unchanged `src/`; then P0.9 points the wrapper at the new signature. Z1's parity check covers the page.

#### Z3. A failed refresh can overwrite the last good data, and nothing notices

- Severity: blocker.
- Where: P0.8. `src/data.js` `fetchAll` (lines 108 to 118), `src/main.js` lines 51 to 53, `test/browser/timing.spec.js` line 74, `test/browser/smoke.spec.js` lines 76 to 84.
- Problem: The page keeps the last good value of a source that fails because `fetchAll` leaves failed slots out of `data`, and `refresh()` merges with `Object.assign(app.data, data)` before it saves the copy. P0.8 rewrites `fetchAll` to loop over bindings keyed by slot. A version that writes every slot, such as `data[b.slot] = r.value` for each settled result, puts `undefined` over the good copy: the page goes to No data on the first failed refresh, and `saveCache` then stores the emptied copy, so the next offline start has nothing either. No unit or golden test calls `fetchAll` or `refresh()`. The smoke spec fails sources only on a page with nothing saved. The timing spec draws the hero from the cache before the refresh fails, then checks only the header, which says "Saved data from" whether the hero survived or not.
- Evidence: Mutation A at `93adcdb`: `fetchAll` sets `data[k] = r.status === 'fulfilled' ? r.value : undefined`. The 248 tests and the 10 CI browser tests pass, the timing spec included. No screenshot fails a source. Two prototype checks passed on base and failed on A: load with the fixtures, then reload with every upstream aborted, and `#verdict` must not be "No data." and `#facts` must read as before; and reload with only `latest-continuous` aborted, and `#statusNote` must read "Could not reach USGS river gauges. Showing the last data received where available." with `#facts` unchanged. Playwright runs routes in reverse order of registration, so the abort route goes after `routeAll`.
- Fix: Add both checks to `smoke.spec.js` now, before P0.8, so they are proven on today's `fetchAll`. In `timing.spec.js`, after the failed refresh settles, also check that `#verdict` is not "No data.".

## Major

#### Z4. The browser matches each request on its path, not its URL

- Severity: major.
- Where: P0.6 and P0.8. `test/browser/fixtures.js` lines 16 and 57; `test/browser/smoke.spec.js` line 47.
- Problem: The golden `sources` key holds the nine URLs exactly, but it records what `SRC` (later `bindingsFor(PUTNEY)`) builds, not what the page requests. If `fetchAll` builds a URL another way (the adapter's `url(b, loc, now)` called again, `app.loc` with overrides, a `URL` object that reorders parameters), the page asks for something else. The fixtures answer any query on the right path, and a forecast request without `models=` gets the forecast instead of the comparison, so the page still draws. The smoke check only counts at least nine served requests.
- Evidence: Mutation B (Z1): 248 and 10 pass. The prototype check `expect([...seen.served].sort()).toEqual(GOLDEN.sources.map(s => s[1]).sort())`, with `GOLDEN` read from `test/golden/june-calm-1200-default.json`, passed on base in both projects and failed on B.
- Fix: Replace the `>= 9` in the first smoke check with that equality: exactly nine requests, exactly the golden URLs, in any order. Add it before P0.6.

#### Z5. The capture parses with the old parsers and no binding

- Severity: major.
- Where: P0.6 and P0.8. `test/golden/capture.js` lines 69 to 72 (`dataFrom`); 14.2 P0.6 (`parseRiver(d, b)` with Putney's ids as the default argument, and the parity test) and P0.8 (the capture moves only `sources` to the bindings).
- Problem: `dataFrom()` calls `parseAlerts(raw.alerts)` and the rest by their `src/data.js` names with one argument, and passes `raw.wx` through untouched. After P0.6 those names re-export the adapters' bodies, and `parseRiver` falls back to Putney's ids when no binding is given. The page calls `b.parse(json, b)` with a binding from `bindingsFor(app.loc)`. So the golden files never run the binding path the page runs, and never run the `wx` adapter's `parse` at all. If P0.6's parity test calls each `parse(json)` without its binding, the default argument hides the same bug there.
- Evidence: Mutation C (Z1): 248 and 10 pass; the page has no flow and no water temperature.
- Fix: At P0.8, `dataFrom` takes the parsers from `bindingsFor(PUTNEY)` and calls `b.parse(raw[b.slot], b)` for all nine slots, `wx` included. In P0.6's `test/sources.test.js`, call each `parse` with its own binding, and add one case where the binding is the only source of the ids: a river binding with gauge ids that are not Putney's, on a response holding both sets, must pick the binding's. Z1's parity check covers the page.

#### Z6. The settings dialog round trip has no check before P0.7, and P0.7 plans one field

- Severity: major.
- Where: P0.7. `src/settings.js` lines 12 to 44, `src/storage.js` `saveSettings` and `loadSettings`, Plan a row in `src/main.js` lines 78 to 85 and `src/render/detail/week.js` line 73; `test/golden/capture.js` line 115; 14.2 P0.7 "Done when".
- Problem: P0.7 rewrites the save path. It stores only the keys that differ from Putney's defaults, keeps `''` as a real override, saves `waterOverride` as a number, moves the heading to `app.loc`, and rebuilds `app.loc` and `app.settings`. The golden capture builds settings directly, and no test opens the dialog. The planned browser check changes wind caution to 8 and reloads. It does not try a blank level, the heading, the water override, Reset, the reminder, or whether a change applies before the reload. The capture's Plan a row stub answers any key that contains "plan", so a plan key that `main.js` writes and `week.js` does not read is invisible too.
- Evidence (at `21c835f`): (E1) `saveSettings` drops values equal to `''`, which is what a "store only what differs" rule does if it treats blank as the default: 262 and 10 pass, and after a reload a blanked rain caution is back at 60%. (E2) The save keeps the old heading in `app.settings`, which is what P0.7 does if it stores the override but does not rebuild `app.loc`: 262 and 10 pass, and the new heading shows only after a reload, which is all the planned check does. A prototype spec passed on HEAD in both projects and failed on each: open Settings, set heading 20, wind caution 8, rain caution blank, water 55, Save; the reminder hides, `#compassCap` says "upstream heading 20°" and `#why` says "55°F water" at once; reload; the reminder stays hidden, the caption still says 20°, and the 13 fields read back 20, 8, 15, 18, 25, blank, 90, 100, 55, 20000, 28000, 151 and 201; Reset shows 15, 60 and a blank water field. A second check picks 120 minutes and afternoon in Plan a row, reloads, and finds both buttons with `aria-pressed="true"`. Playwright cannot type text into a number field, so "not a number" is only reachable as a blank field.
- Fix: Add `test/browser/settings.spec.js` with both checks to CI now, so they are proven on today's code before P0.7 changes it, and keep them unchanged through P0.14.

#### Z7. The planned migration tests do not prove the real upgrade

- Severity: major.
- Where: P0.7. 14.2 P0.7 (`test/storage.test.js` and the two smoke checks), 08 8.3; `src/install.js` (the bar reads `loadInstall()`), `src/settings.js` (`hasSavedSettings()`, `nudgeDismissed()`), `src/render/detail/week.js` (`loadPlan()`), `test/browser/timing.spec.js` line 70.
- Problem: Reasoning only for (1) to (3); no migration code exists yet. (1) A `Map`-backed stub is not `Storage`. `map.get(missing)` is `undefined`, not `null`, so `getItem(k) !== null`, the test `hasSavedSettings()` and `nudgeDismissed()` use today, is true for every missing key. `setItem` keeps numbers and objects where `Storage` keeps strings. And `Object.keys(map)` is `[]`, while step 5 ("any `putney-rowing-*` key present") has to enumerate the real thing. A stub that differs can pass a migration that fails in a browser, or fail one that works. (2) If the test reads and writes through `KEYS` and `OLD_KEYS` from `src/config.js`, a typo in a key name sits in both the code and the test, and they agree. (3) The planned browser check seeds the five old keys but asserts only the hero from the cache. Nothing checks that an installed user who chose Don't show again still has no install bar, that the reminder stays hidden, that the plan and the heading survive, or that `rowhether-last-v1` and the marker are set. (4) The timing spec does catch a cache saved and read under different keys: with `saveCache` writing `CACHE_KEY + ':putney-landing'` and `loadCache` reading `CACHE_KEY`, it failed at `21c835f`. But it fails only when its 180 second test timeout runs out, which reads like a hang.
- Fix: (1) In `test/storage.test.js`, a stub that behaves like `Storage`: `getItem` returns `null` when absent, `setItem` stores `String(value)`, with `length`, `key(i)` and `removeItem`, and keys that `Object.keys` lists. (2) The test names every key as a string literal (`'putney-rowing-settings-v1'`, `'rowhether-settings-v2'`, `'rowhether-cache-v2:putney-landing'` and the rest), never through `KEYS`. Add one case: old settings equal to today's defaults migrate to `{ saved, values: {} }`, and the reminder stays hidden. (3) Make the P0.7 browser check an upgrade test with what an old build writes: settings `{ ...DEFAULTS, heading: 20, rainCaution: '', waterOverride: '55' }`, a cache from a fixture load, plan `{ minutes: 120, when: 'afternoon' }`, install `{ dismissed: 5, never: true }`, nudge `'1'`. Load with every upstream aborted, then check the hero from the cache, "upstream heading 20°", the fields (rain caution blank, water 55), no reminder, Plan a row on 120 and afternoon, no install bar under an iPhone user agent, and in storage the new keys, `rowhether-last-v1` and the marker. (4) In `timing.spec.js`, give the `waitForFunction` for the mark a 15 second timeout, so a missing cache fails fast and says so.

#### Z8. Storage that throws on access is never tried in a browser

- Severity: major.
- Where: P0.7. `src/storage.js`; 14.2 P0.7 ("with a throwing stub every loader returns its default"); CLAUDE.md ("Every access is wrapped in try/catch").
- Problem: Some browsers throw on the `localStorage` property itself, not on `getItem`: Chromium with site data blocked throws a `SecurityError` from the getter. P0.7 adds `migrateStorage()`, called from every loader, and a marker. A guard written as `typeof localStorage !== 'undefined'`, or any read at module load, passes in Node (there is no `localStorage` there, so the guard skips) and in every normal browser, and throws at import where the getter throws: a blank page. The planned "throwing stub" will most likely be an object whose methods throw, which guarded code handles anyway.
- Evidence (at `21c835f`): a prototype check adds an init script, `Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } })`, then expects the verdict "Go.", Plan a row in `#week`, and no page error. HEAD passes it in both projects, so today's page works with storage that throws. Mutation G adds `export const migrated = typeof localStorage !== 'undefined' && localStorage.getItem('rowhether-migrated-v1') === '1';` to `src/storage.js`: 262 and 10 pass, and the prototype finds a blank page.
- Fix: Add that check to `smoke.spec.js` now. In `test/storage.test.js`, also install a `globalThis.localStorage` getter that throws, import `src/storage.js` fresh under it (`vi.resetModules()` and a dynamic `import()`), and call every loader and `migrateStorage()`.

#### Z9. Nothing enforces that the golden files and screenshots stay as they were

- Severity: major.
- Where: every step. `scripts/golden.mjs` lines 3, 11 and 35 (`--force`), `test/golden/harness.js` lines 24 and 61 (`GOLDEN_FORCE`), `.github/workflows/ci.yml` line 15 (`actions/checkout@v4`, one commit deep, no diff step), `playwright.config.js` (no `updateSnapshots`), 08 14.1 ("checked in P0.14, and in each step's review").
- Problem: The rule is named: 08 14.1 says the golden JSON and the screenshots are never written after P0.1 and P0.2, and the progress file names the golden base `c7967a6`. It is enforced only by hand. `node scripts/golden.mjs write --force` and `GOLDEN_FORCE=1` still work, though they were for P0.1 only. CI checks out one commit, so it cannot diff against the base. The screenshots have no base commit in 14.1 and no check at all: `npx playwright test --update-snapshots` rewrites them, and Playwright's default, `updateSnapshots: 'missing'`, writes a new baseline for any shot whose name changed. A step that fails one of the 338 digested keys, which cannot be read without dumping two commits, has an easy way out.
- Evidence (at `21c835f`): "Holds until sunset at" changed to "Holds until sunset," in `src/render/hero.js`, then `node scripts/golden.mjs write --force`. It rewrote 46 files, and `npx vitest run` passed 262 of 262. Only `git diff c7967a6 -- 'test/golden/*.json'` showed the change (46 files, 237 lines). `ci.yml` has no step that would run it.
- Fix: Before P0.6: (1) remove `--force` and `GOLDEN_FORCE`; `write` still creates files that do not exist. (2) In CI, `fetch-depth: 0` on the checkout and a step `git diff --exit-code --diff-filter=MD c7967a64f1a9bd80ed2f0e14ee6c7ceb69d5d3ab HEAD -- 'test/golden/*.json' && git diff --exit-code --diff-filter=MD 743e8cd HEAD -- test/browser/__screenshots__`, so a modified or deleted file fails the run and an added one does not. (3) `updateSnapshots: 'none'` in `playwright.config.js`, so a missing baseline fails instead of being written. (4) Write the rule for additions into 14.1: a new golden case or screenshot (several fixes here add some) is written from code whose `src/` equals the base, in a worktree, and committed with the test change that defines it; a capture edit that a step needs lands in its own commit and passes against the unchanged `src/` first, as Z2 describes.

#### Z10. Nothing will show that the logic uses the location's zone, not the screen's

- Severity: major.
- Where: P0.9. `src/logic.js` line 5 (imports `dayKey`, `localHour` and `hm` from `src/format.js`) and its uses at lines 27, 186, 215, 220, 231, 338, 364, 385, 386, 428 and 567; 14.2 P0.9 (`m.fmt`).
- Problem: Reasoning only. P0.4 made the module formatters live bindings, and P0.9 makes the logic use `m.fmt = zoneFormat(loc.tz)` and calls `setZone(app.loc.tz)`. At Putney all of these are New York, so a logic line that keeps the module's `dayKey` or `localHour` gives the same output in every golden case. The bug would show in phase 1, for the first location in another zone, as day keys, periods or fog hours that are off. P0.9's planned Kolkata test covers `h0` and the plan steps, not the other eleven uses. P0.4 itself is well covered: `test/format.test.js` proves that the swap reaches an importer, and no module copies a formatter at load (a search for a formatter name used as a value outside `src/format.js` finds none at `21c835f`).
- Fix: At P0.9, add a test that calls `setZone('Pacific/Auckland')`, captures `june-calm-1200-default` and one fog variant, and requires `model`, `plans` and `runs` to equal their files (only render code and `fogLift`, which has no model, may follow the module zone), with `setZone('America/New_York')` in a `finally`. Add the reverse to the planned Kolkata test: with the module zone left on New York, a Kolkata location's day keys, period starts and fog hours follow Kolkata.

## Minor

#### Z11. The tests follow the machine's time zone

- Severity: minor.
- Where: P0.9 (`setZone(app.loc.tz)` in `src/state.js`), and every step run on a laptop. `package.json` (`"test": "vitest run"`), `vite.config.js` `test`, `playwright.config.js` `use`.
- Problem: An unknown or missing zone falls back to the machine's: `new Intl.DateTimeFormat('en-US', { timeZone: undefined })` uses the host zone. Nothing pins the zone the tests run in. CI runs on UTC and catches such a fallback. A laptop in Vermont, where the owner runs the WebKit projects, does not. The browser takes the machine's zone too.
- Evidence (at `21c835f`): `setZone(undefined)` at the bottom of `src/format.js`, which is what a misspelled `setZone(app.loc.timezone)` does. `TZ=America/New_York npx vitest run` passes 262 of 262; `TZ=UTC` fails 108 of the 139 golden tests. The Z1 parity prototype without a pinned zone passed on a New York host and failed on a UTC host. With `test.use({ timezoneId: 'Pacific/Auckland', locale: 'de-DE' })` it failed on both, and HEAD without the change passed with that pin, so the pin costs correct code nothing.
- Fix: Run the unit and golden tests in a fixed zone that is neither New York nor UTC (`"test": "TZ=Pacific/Auckland vitest run"`), with a test that asserts `Intl.DateTimeFormat().resolvedOptions().timeZone` is that zone, so the pin cannot drop silently. In the parity, smoke and settings specs, `test.use({ timezoneId: 'Pacific/Auckland', locale: 'de-DE' })`. Leave the `@visual` spec as it is, so the baseline keeps the environment it was made in. At P0.9, `zoneFormat` can throw when `tz` is missing, which makes the mistake loud on every machine.

#### Z12. Dock reports and the Dev label never run in a browser test

- Severity: minor.
- Where: P0.9 (`render()` and the model's inputs). `src/reports.js` `renderReports`, `src/render/index.js` line 20, `test/browser/fixtures.js` (every `/api/*` path answers 404).
- Problem: `render()` calls `renderReports()`, which reads `app.model.hours` and an hour's water state to write "The forecast said ...". The capture does not call it, and every browser spec answers `/api/info` with 404, so this code never runs in a test. P0.9 changes `render()` and the model. CLAUDE.md's browser checklist asks for it by hand.
- Evidence (at `21c835f`): a prototype with `/api/info` stubbed as `{ env: 'dev', reports: true }` and `/api/reports` as one report 20 minutes old (`water: 'chop', fog: 'patchy'`) passed: `#envBadge` reads "Dev" and the summary reads "At the dock: Chop, patchy fog, 20 min ago (11:40 AM). The forecast said light chop." No mutation was run.
- Fix: Add that check to `smoke.spec.js` before P0.9, with the sentence as a literal.

#### Z13. The share sheet and the suggestion context are not tested

- Severity: minor.
- Where: P0.7, P0.9 and P0.10. `src/share.js` `initShare` (the `navigator.share` title "Putney Landing rowing forecast" and the URL), `src/suggest.js` line 36 (`settings: app.settings`).
- Problem: The golden `share` key covers `shareText()`, not the click handler, whose title P0.10 builds from `loc.name` and whose URL depends on `app.info`. The suggestion form sends `app.settings` as context: P0.7 changes its keys and makes `waterOverride` a number, and P0.10 removes `heading`, which P0.9 must add back (`worker/suggest.js` lists `heading` among the setting keys). No test imports `src/suggest.js`, and the browser specs hide the form.
- Evidence: reasoning only; a search of `test/` finds no import of `src/suggest.js` or `initShare`.
- Fix: A smoke check that stubs `navigator.share` in an init script, clicks `#shareBtn`, and requires `{ title: 'Putney Landing rowing forecast', text: <the share text in june-calm-1200-default.json>, url: 'https://rowhether.com/' }`. At P0.9, move the context into an exported `suggestContext()` and unit test that its `settings` has `heading` 15 and every threshold key.

#### Z14. Sections kept open through a refresh are not checked

- Severity: minor.
- Where: P0.9 (`render()`). `src/render/detail/index.js` lines 24 to 35, `src/main.js` (the `toggle` handler and `fillPeriod`), `test/helpers/fakedom.js` (`querySelectorAll` returns `[]`).
- Problem: A section the viewer opened (`details[data-keep]`) and an open Day by day row stay open through the 10 minute refresh. The fake page returns nothing from `querySelectorAll`, so the capture cannot see this, and no browser spec presses Refresh.
- Evidence (at `21c835f`): mutation K removes `body.dataset.view = r.name;` from `renderDetail()`: 262 and 10 pass. A prototype that opens the first Hour by hour section in `#wind`, clicks `#refreshBtn`, waits, and then does the same with the first Day by day row passed on HEAD and failed on K.
- Fix: Add it to `smoke.spec.js` before P0.9.

#### Z15. The screenshots are portable today, but the fallback is not written down

- Severity: minor.
- Where: P0.14. `test/browser/__screenshots__/`, `test/browser/screens.spec.js`, 08 14.2 P0.14 item 3.
- Problem: 14.2 compares the `@visual` set "on the machine that made the screenshots". Sessions on this branch move between containers. If P0.14 runs on an image whose pixels differ, nothing says what to do, and `--update-snapshots` at HEAD would destroy the before set. The set is also narrower than the golden files: home, one opened row and four tabs. Storms, Temperature, Rain, Light and Air have no shot (Light changed in P0.4, Temperature changes in P0.10), and the Hour by hour sections are closed in every shot.
- Evidence: this container did not make them. `npx playwright test --grep @visual` at `93adcdb` passed 48 of 48 here, in 45.7 s (Chromium 1194, Playwright 1.56.1, Node 22.22.0). The same image gives the same pixels, so the screenshots are good evidence today.
- Fix: Write into 14.2 P0.14: first run the `@visual` spec at the P0.2 commit on the machine at hand; if it fails there, make a fresh before set on that machine from `93adcdb`, the last commit before P0.4, in a worktree, compare HEAD with it, and record both runs. Never update snapshots at HEAD. Z1's parity check covers the text of the five tabs without a shot and of the closed sections, in CI, so no more screenshots are needed.

#### Z16. The parsers see only synthetic responses

- Severity: minor.
- Where: P0.6. `test/fixtures/golden.js`; `test/fixtures/sources/`, which 14.2 P0.6 names ("if present") and which does not exist.
- Problem: Every parser test and golden case reads responses the fixtures build. They follow the real shapes closely, and the parser probes cover odd input, so this is insurance. P0.6 moves every parser body, and real responses are free to record now.
- Evidence (at `21c835f`): every upstream host answered from this container (HTTP 200), and today's parsers read the six non-Open-Meteo responses: flow 4,490 cfs and water 13.3°C from `latest-continuous`, 187 points in 48 hours, 30 daily means, 12 forecast points in kcfs (the first 4,180 cfs), and a Keene report with wind 3.4 mph and no gust; no alert was active. The probes catch the fallbacks a move could drop: `ends` without `expires` (2 tests fail), `onset` without `effective` (2), no m/s branch in `speedToMph` (13), kcfs always (2), `headline` left null (2). The one survivor, `p.secondary >= 0` changed to `p.secondary > -999`, behaves the same on real data, which marks a missing value as -999.
- Fix: Before P0.6, record the nine responses for Putney from the exact `SRC` URLs into `test/fixtures/sources/`, plus one NWS alert from any zone that has an active one, and run the P0.6 parity test on them.

## Checked and well covered

Not findings. The builder does not need to redo these.

- Golden determinism across machines: `npx vitest run` passed 248 of 248 at `93adcdb` and 262 of 262 at `21c835f` in this container, which did not write the files.
- Golden sensitivity in the logic and render code: the progress file's 12 named mutations and 1,134 of 1,364 literal mutants killed. Added here: five parser fallback mutations, each caught by the probes (Z16).
- The request URLs as `SRC` builds them, their parameter order, and the source labels: the `sources` key of the 19 main files and `status.partialAll` hold them as literals, so P0.6 and P0.8 can move them freely as long as the page requests the same thing (Z4).
- Digests: canonical JSON with sorted keys, as strict as `toEqual`; any change in a digested key fails, and `node scripts/golden.mjs dump` shows it in full.
- The no data screen and "Every data source was blocked": `status.noDataAll` in the golden files and the last smoke check.
- The offline first render from the service worker and the saved copy: `timing.spec.js` in CI. A cache saved and read under different keys fails it (slowly, Z7).
- The screenshots on another container: 48 of 48 (Z15).
- P0.4: `test/format.test.js` checks every formatter against copies of the old ones, the swap reaching an importer, the cache, and the import line of `src/format.js`; no module copies a formatter at load; the probes read formatters through `import * as F`. The golden files, the 48 screenshots and the CI browser checks all pass at `21c835f`.
- Chart readouts: each one is a `data-text` attribute in the view HTML, which the golden files hash; the handler in `src/main.js` only copies it.
- The width at 360 px and the project width on every tab, the pinned tab bar and a clean console: the smoke spec, each shown to fail in the progress file.
- The bundle budget: fails when over, and treats a missing file as an error.
- P0.9's smaller changes: `h0` (variants `june-before-forecast`, `june-hour-edges` and `june-current-90min`), plan steps with seconds (the `plans` key), the River chart ticks (`views`) and `nowPrecip` (`home`).
- P0.13: `test/suggest.test.js` stubs Turnstile, Claude and GitHub.
- P0.5: `test/location.test.js` compares the Putney thresholds with a copied `DEFAULTS` literal.
