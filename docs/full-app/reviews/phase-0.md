# Phase 0 safety net review

Reviewed the Phase 0 checks (P0.1 golden outputs, P0.2 screenshots and the smoke and timing specs, P0.3 budget and CI) against what the refactor steps P0.4 to P0.14 in 08 section 14 could break, on `dev-full-app` at commit `93adcdb`, with every check run again at `21c835f` after P0.4 landed during the review. Started Sun Oct 18 15:41:59 UTC 2026 (`date -u`).

Status: in progress

Count so far: 3 blockers, 2 major, 0 minor.

Severity: blocker means a likely regression in P0.4 to P0.14 would pass every check; major means a real gap or a weakness in the net; minor means small.

How the evidence was made: a git worktree at the commit, `npm ci` in it, one change of the kind a step might make, then `npx vitest run` (248 tests at `93adcdb`, 262 at `21c835f`), the CI browser command `npx playwright test --grep-invert @visual` (10 tests) and, where it matters, `npx playwright test --grep @visual` (the 48 screenshots), then `git checkout` to put the code back. Prototype specs written for this review were not committed; the parts that matter are quoted in the fixes. This container is not the one that made the screenshots (Chromium 1194, Node 22.22.0, 4 cores, Linux x86_64 here too).

## Blockers

#### Z1. The real page is never compared with the golden outputs

- Severity: blocker.
- Where: P0.6 to P0.10. `test/golden/capture.js` (it builds `app` itself and calls the render functions), `test/browser/smoke.spec.js`, `test/browser/timing.spec.js`; in the app, `src/state.js`, `src/data.js` `fetchAll`, `src/main.js` `refresh()`, `src/render/index.js` `render()`, `src/render/days.js` `fillPeriod()`, `src/route.js`.
- Problem: The golden capture builds its own state. It parses with `dataFrom()`, passes a settings object it made, sets `app.model`, `app.data` and `app.settings`, and calls `renderHero()` and the rest directly. The page gets there another way: storage and `src/state.js`, `fetchAll()`, the parsers, `render()`, `fillPeriod()` and the tab router. P0.6 to P0.10 rewrite exactly that path (bindings, `fetchAll(loc)`, `app.loc`, `app.settings` without `heading`, `buildModel(app.loc, ...)`). The browser specs that run in CI read no text: the smoke spec checks the console, the width, the tab bar and the blocked message, and the timing spec checks a mark and the header. The screenshots see the page, but only at P0.14, by hand, on one kind of machine, and not inside a closed `<details>`: the Hour by hour table (`src/render/detail/common.js` line 72) is closed in every shot.
- Evidence: Three changes to the page's own path, each run at `93adcdb` with `npx vitest run` (248 tests) and the CI browser command (10 tests). (B) `fetchAll` sorts each URL's parameters and drops `models` from the model comparison request: all tests pass. (C) `parseRiver(d, b)` reads the gauge ids from the binding, as P0.6 plans, with Putney's ids as the default argument, and `fetchAll` passes a binding that names them `sites`, not `gauges`: all tests pass, and the page has no flow and no water temperature. (D2) A simulated end of P0.10 (logic and render read `m.loc.course.heading`, `app.settings` has no `heading`, the capture still passes `heading` in its settings) with one reader left behind, `courseWord(h, S.heading)` at `src/render/detail/wind.js` line 106: the 248 tests, the 10 CI browser tests and all 48 `@visual` screenshots pass, while the Wind view's hour table says "Cross, VT" for every hour with wind. A prototype parity spec (below) passed at `93adcdb` and at `21c835f` in both projects, and also with `timezoneId: 'Pacific/Auckland'` and `locale: 'de-DE'`. It failed on C (`#days`) and on D2 (the Wind view text). B is caught by Z4's check.
- Fix: Before P0.5, add `test/browser/parity.spec.js` to the CI browser run (no `@visual` tag). For the nine default cases in the 390 project, and `june-calm-1200-wide` in the 1280 project: pin the clock, route the fixtures, load `/`, then (1) for every id in the file's `home` except `updated` (the page fetches at the clock, the capture three minutes before), compare `hidden`, and where `innerHTML` is not empty, `textContent`, hashed where the file holds a hash; (2) open every Day by day row and compare its `.forecast` text with the capture's HTML for that period, parsed by the page; (3) open every tab and compare `#detailBody` text with the capture's view HTML, parsed the same way. The capture at HEAD equals the files (`npm test`), so a page that equals the capture equals the files. Pin `timezoneId` and `locale` (Z11). The custom cases join after P0.7, with their settings saved through the dialog (Z6). The prototype's core:

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
