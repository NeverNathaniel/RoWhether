# Consistency review of the plan

Reviewed `docs/full-app/01` to `08` and the code they describe, on `dev-full-app` at commit `59bed34` (no file under `src/`, `worker/`, `test/` or the build config has changed since `20e4255`, where 08 read the code). Started Sun Oct 18 10:12:10 UTC 2026 (`date -u`).

Status: in progress

Count: 8 blockers, 3 major, 10 minor.

Severity: blocker means it must be fixed before the phase it affects is built; major means wrong, contradictory or unsafe; minor means wording or a small gap. Every finding was checked against the files named. Quotes are exact. Line numbers are for the commit above.

## Phase 0 (08 section 14)

The Phase 0 build follows 08 14.2 and runs in parallel with this review, so this section comes first. Each step was checked against `src/`, `worker/`, `test/`, `index.html`, `vite.config.js`, `package.json` and `.github/workflows/ci.yml`. What holds: the golden scenarios and clocks (19 cases), `T0` and `wx()` in `test/logic.test.js`, every function `capture` calls exists with the signature given (except C15), the views return `{ day, html }` with the lede inside, `matchMedia('(min-width:46rem)')` in `chartWidth()`, the today build sizes in 11.1 (rebuilt here: 38,988, 5,976 and 3,618 B gzip, 17 precache entries, 262.89 KiB), Playwright 1.56.1 with `chromium-1194` in the container, the 109 tests, the `relWind` lines 65 and 89, the compass literals at `parts.js` 23 and 24, the river literals at `river.js` 155, 157 and 14, Putney's JSON thresholds and copy against `DEFAULTS` and the render text, the Turnstile literal, and the storage migration against `src/storage.js`, `src/config.js` and `src/install.js` after the install bar change (`putney-rowing-install-v2`, `{ dismissed, never }`, the `-v1` snooze not read). The findings below are what does not hold.

### Blockers

#### C1. P0.9 removes the heading from settings before P0.10 moves the render code off it

- Severity: blocker.
- Where: 08 14.2 P0.9 (line 2692) and P0.10 (line 2699); `src/render/now.js` 43, 49, 51; `src/render/forecast.js` 21, 85, 86; `src/render/detail/wind.js` 48, 73, 106, 120.
- Problem: P0.9 says "`src/state.js` drops the temporary `heading` from `app.settings`", and its tests switch to "`DEFAULTS` becomes `effectiveSettings(PUTNEY)`", which has no `heading`. The render code reads the heading from the settings until P0.10: `now.js` 43 `const m = app.model, S = m.S`, then 49 `compassSVG(S.heading, cur.dir, cur.wind)` and 51 "`upstream heading ${S.heading}°`". After P0.9 the compass gets `rotate(undefined)` and the caption reads "upstream heading undefined°", so the golden files fail at P0.9 and the app shows the change until P0.10 lands. P0.10's list is also short: "Every render use of `S.heading` (`now.js` lines 49 and 51, `forecast.js` lines 85 and 86, `wind.js` lines 73 and 106)". `wind.js` 120 is missing: "The course heading is ${S.heading}°, set in Settings." After P0.10 the Wind view's How this works panel would still read "undefined°".
- Fix: Move "drops the temporary `heading`" from P0.9 to the end of P0.10, or move the render heading changes into P0.9. Add `wind.js` line 120 to the P0.10 list.

#### C2. P0.9 removes `DEFAULTS` and changes `buildModel` without updating two callers

- Severity: blocker.
- Where: 08 14.2 P0.7 (line 2667) and P0.9 (lines 2685, 2690); `src/settings.js` 4, 13, 20, 24; `src/render/index.js` 12.
- Problem: P0.9: "Remove `LOC` and `DEFAULTS` from `src/config.js`". `src/settings.js` imports `DEFAULTS` (line 4) and walks `Object.keys(DEFAULTS)` to fill and read the form (13, 24). P0.7 rewrites `fill()` and Reset but keeps the save path "compute the values as today", which is the `Object.keys(DEFAULTS)` loop. Vite 8.3.1 refuses to build when a named import is missing (checked with a two-file scratch build: "Missing export"), so `npm run build` fails at P0.9. P0.9 also changes the signature to `buildModel(loc, data, S, now = Date.now(), { units, club } = {})` but names no app caller; `src/render/index.js` 12 is `app.model = buildModel(app.data, app.settings);`. 01 8.3 names it ("`render()` calls `buildModel(app.loc, app.data, app.settings)`"), 08 does not. The golden and unit tests call `buildModel` directly, so they pass while the app breaks.
- Fix: In P0.7, make `src/settings.js` walk its own field list (the keys of `effectiveSettings(PUTNEY)` plus `heading`) and stop importing `DEFAULTS`. In P0.9, list `src/render/index.js`: `buildModel(app.loc, app.data, app.settings)`.

#### C3. P0.7 changes the cache functions but not their caller in `src/main.js`

- Severity: blocker.
- Where: 08 14.2 P0.7 (line 2665); `src/main.js` 53 and 129.
- Problem: P0.7 gives `loadCache(slug)` and `saveCache(slug, data, updated)`, and names `src/config.js`, `src/storage.js`, `src/state.js` and `src/settings.js`, not `src/main.js`. `main.js` 53 is `saveCache(app.data, app.updated);` and 129 is `const cached = loadCache();`. Left as they are, the app reads `rowhether-cache-v2:undefined` and writes under a key built from the data object. The migrated cache is never read, so an installed app opened offline shows no forecast: a visible change. No golden or unit test covers `main.js`; only P0.14 item 7 would notice, at the end.
- Fix: Add `src/main.js` to P0.7: `loadCache(app.loc.slug)` and `saveCache(app.loc.slug, app.data, app.updated)`. Add a smoke spec check in P0.7: seed the five old keys, load offline, the hero shows the cached forecast.

#### C4. P0.5 calls `resolveLocation` with a different second argument than its own signature

- Severity: blocker.
- Where: 08 14.2 P0.5 (lines 2644, 2645) and P0.7 (line 2666).
- Problem: P0.5 defines "`resolveLocation(record, { waterway, overrides })`", then "`PUTNEY = resolveLocation(PUTNEY_RECORD, PUTNEY_WATERWAY)`". P0.7 uses the object form: "`resolveLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY, overrides: o })`". Built to the signature, P0.5's `PUTNEY` has no waterway, so its flow and flow forecast bindings are missing, and P0.6's parity test ("`bindingsFor(PUTNEY)` must produce exactly today's nine URLs") fails.
- Fix: `PUTNEY = resolveLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY })`.

#### C5. The plan step formula in 9.2 keeps seconds, so P0.9 changes Plan a row

- Severity: blocker.
- Where: 08 9.2 (line 2178), cited by P0.9 (line 2689); `src/logic.js` 492 and 572.
- Problem: 9.2 replaces today's `Math.floor(t0 / PLAN_STEP) * PLAN_STEP + PLAN_STEP` with "`t0 - (localMinutes(t0) % 30) * MIN + 30 * MIN`". A run's start is `Math.max(r.hs[0].t, s.dawn, past ? -Infinity : m.now)` (logic.js 492): SunCalc's dawn and the live clock carry seconds and milliseconds, and the formula only removes whole minutes. Checked at the dock for 2026-06-15: dawn is 08:36:34.252Z; today's next step is 09:00:00.000Z, the formula gives 09:00:34.252Z. Every later step is 34 seconds late, a session that ends at sunset today can fail `t0 + L <= r.end`, and the golden `plans` differ.
- Fix: `t0 - (localMinutes(t0) % 30) * MIN - (t0 % MIN) + 30 * MIN` (every zone offset in use is a whole number of minutes). Add a test that Putney's steps equal today's for a dawn start.

#### C6. `setZone(PUTNEY.tz)` in `src/format.js` makes an import cycle that fails at load

- Severity: blocker.
- Where: 08 14.2 P0.9 (line 2690); 01 8.2 (lines 757 and 763) and 8.3 (line 804).
- Problem: P0.9: "`src/format.js` calls `setZone(PUTNEY.tz)`". That makes `format.js` import `putney.js`, which imports `location.js`. 01 8.3 puts `fmt // zoneFormat(tz)` on the resolved location, so `location.js` imports `format.js`, and 01 8.2 caches formatters ("Formatters for one IANA zone, cached per zone"). In that cycle `putney.js` runs before `format.js`'s body, and `resolveLocation` calls `zoneFormat` while the cache is uninitialized. Reproduced with three small modules in Node 22.22.0: "ReferenceError: Cannot access 'cache' before initialization". 01 8.2 also plans it differently: "`setZone('America/New_York'); // phase 0 default, replaced by the location before the first render`".
- Fix: Keep `src/format.js` free of imports other than `src/config.js`, with `setZone('America/New_York')` as its default. `src/state.js` calls `setZone(app.loc.tz)` after resolving the location. Say in 3.3 that `location.js` may import `format.js`, never the reverse.

#### C7. CI runs the WebKit projects, which CI does not install

- Severity: blocker.
- Where: 08 14.2 P0.2 (line 2608), P0.3 (line 2626), P0.14 (line 2737); 13.5 (line 2504) and 13.6 (line 2519).
- Problem: P0.2's config has "projects `chromium-390-light` ... and `chromium-1280-dark` ..., plus `webkit-*` twins for the owner's Mac". P0.3 and 13.6 run "`npx playwright install --with-deps chromium`; `npx playwright test --grep-invert @visual`". `playwright test` runs every project in the config, so the WebKit projects fail on a missing browser and P0.3's "Done when: CI passes on the pull request" cannot hold. 13.5 says the WebKit projects "run on the owner's Mac", but no command limits them. `timing.spec.js` uses CDP `Emulation.setCPUThrottlingRate`, which only Chromium has. P0.14 item 3, "`npx playwright test --grep @visual` passes on the machine that made the screenshots", runs the WebKit projects in the container too, which has only `chromium-1194` and `chromium_headless_shell-1194` under `/opt/pw-browsers` (checked).
- Fix: Name the projects in every command (`--project=chromium-390-light --project=chromium-1280-dark`), or add the WebKit projects only when an environment variable is set. Skip `timing.spec.js` when `browserName !== 'chromium'`.

#### C8. The timing baseline cannot be taken: no pinned clock, and the mark sits after an early return

- Severity: blocker.
- Where: 08 14.2 P0.2 (lines 2611 to 2613); 11.3 (line 2411); `src/render/hero.js` 65; `src/logic.js` 346 to 348; `src/render/index.js` 15.
- Problem: `timing.spec.js` is "first load online with fixtures; ... reload, read `performance.getEntriesByName('hero')[0].startTime`", with no clock. The fixtures are fixed days in 2026 (`june-calm` starts 2026-06-15). With the real clock every fixture hour is in the past, `m.h72` is empty, `buildModel` returns null, and `render()` calls `renderNoData()`, never `renderHero()`. Even with a pinned clock, "`performance.mark('hero')` as the last line of `renderHero()`" is skipped outside daylight by `if (!m.daytime) { renderNextPeriod(m); return; }` (hero.js 65). Either way the entry list is empty and the spec throws. `smoke.spec.js` has the same gap: without a clock its checks run against the No data screen, which is too short to test the pinned tab bar.
- Fix: Pin `Date` in `timing.spec.js` and `smoke.spec.js` to a scenario's midday with `page.clock.setFixedTime`, which leaves timers and `performance.now()` real, so the measurement is not distorted. Put the mark where both paths of `renderHero()` reach it.

### Major

#### C9. The browser fixtures cannot tell the forecast from the model comparison

- Severity: major.
- Where: 08 14.2 P0.2 (line 2609); 13.5 (line 2503); `src/config.js` `SRC.wx` and `SRC.models`.
- Problem: `routeAll` "answers every request to `api.open-meteo.com`, ... from `test/fixtures/golden.js`, matching on the path". `SRC.wx` and `SRC.models` both request `https://api.open-meteo.com/v1/forecast?...`; only the query differs (`models=gfs_seamless,...`). Matching on the path serves one file for both, so the before screenshots lose the model comparison (the Wind view's model range lane, the Week view's low confidence line) and the baseline hides it. The same row says "everything else aborts", which as written includes the preview server's own origin (`localhost:4173`); 13.5 says it "routes every upstream host to fixtures".
- Fix: Match on path plus the `models` parameter. Write "every other external host aborts".

#### C10. `migrateStorage()` is not idempotent after a failed step

- Severity: major.
- Where: 08 8.3 (line 2127); 14.2 P0.7 (line 2665); 01 8.6 steps 1 to 6.
- Problem: 8.3: "a failed step leaves the old key for the next start and does not set the marker; the function is idempotent and safe to call from every loader". If step 3 or 4 fails (a quota error on the cache copy, for example), the marker stays unset and every loader call reruns step 2, which writes `rowhether-settings-v2` again from the old key. A setting saved after the first run is overwritten on the next loader call, and `src/install.js` calls `loadInstall()` on every `update()`.
- Fix: Each step writes its target only when the target key is absent. Add to `test/storage.test.js`: step 3 throws once, a setting is saved, the next run keeps it.

#### C11. `effectiveSettings` returns different things in 01 and P0.5, and `waterOverride` has no default

- Severity: major.
- Where: 08 14.2 P0.5 (lines 2644 to 2646); 01 11.5 (line 1115) and 8.1 row 2 (line 712).
- Problem: 01 11.5: "Output: `S` for `buildModel`, plus `S._from = { windCaution: 'location' ... }` for the Settings dialog." P0.5: it "returns the threshold keys and `waterOverride`", and its test needs `{ ...effectiveSettings(PUTNEY), heading: PUTNEY.course.heading }` to deep-equal today's `DEFAULTS`. `_from` breaks that equality, and would travel in `app.settings` to `src/suggest.js` (line 36). Neither `GLOBAL_DEFAULTS` ("today's `DEFAULTS` values for the threshold keys") nor the record's `thresholds` holds `waterOverride`, so it comes out `undefined`, not today's `''`. 01 8.1 row 2 also limits `GLOBAL_DEFAULTS` to "(wind, gust, rain, cold, AQI)", while P0.5 includes flow.
- Fix: In phase 0, `effectiveSettings` returns plain values with `waterOverride: ''` as its default; `_from` arrives with the phase 1 dialog. Say once whether `GLOBAL_DEFAULTS` holds the flow keys (01 11.2 says flow defaults are percentiles or blank, so it should not).

### Minor

#### C12. The fake DOM's `innerText` does not match the browser's

- Severity: minor.
- Where: 08 14.2 P0.1 (line 2566); `src/render/hero.js` 50, 71 to 73; `src/styles/app.css` 44; `src/share.js` 10.
- Problem: "an `innerText` getter (the `innerHTML` with tags stripped and entities decoded, enough for `shareText()`)". `#why` holds `lead<span class="cond">...</span>` and `.why .cond{display:block}`, so a browser's `innerText` has a line break there, which `shareText()` turns into a space. The fake gives "...mph.Wind 12 mph...", so the golden `share` records text the app never produces. If the fake keeps `textContent` and `innerHTML` as separate fields, the `textContent` paths (hero.js 41, `renderNoData()`) leave a stale `innerHTML`.
- Fix: The fake turns a closing tag of a `.cond` span into a newline, and setting `textContent` sets `innerHTML` to the escaped text.

#### C13. P0.4 miscounts the formatters and calls two function exports `const`

- Severity: minor.
- Where: 08 14.2 P0.4 (lines 2632 and 2635); `src/format.js` 4 to 9, 25, 31.
- Problem: "`src/format.js` today builds seven `Intl.DateTimeFormat` objects". There are six (lines 4 to 9). "Change the module's exports of those names from `const` to `let`": `dayWord` and `whenText` are `export function` declarations (lines 25 and 31).
- Fix: "six"; "turn those exports into `export let` bindings".

#### C14. P0.9 undercounts the `sunOn` calls in `light.js`

- Severity: minor.
- Where: 08 14.2 P0.9 (line 2686); `src/render/detail/light.js` 27, 34, 36, 69.
- Problem: "callers: four in `src/render/detail/light.js`". There are five calls: one each on lines 27, 34 and 36, and two on line 69.
- Fix: "five calls on four lines".

#### C15. P0.1 calls `debrisLikely` per hour

- Severity: minor.
- Where: 08 14.2 P0.1 (line 2589); `src/logic.js` 114.
- Problem: "`waterWhy` and `debrisLikely` for each hour in `m.h72`". `debrisLikely(m)` takes only the model and returns one value.
- Fix: "`waterWhy(h.water)` for each hour in `m.h72`, and `debrisLikely(m)` once".

#### C16. P0.10's done-when grep matches a comment the step does not change

- Severity: minor.
- Where: 08 14.2 P0.10 (line 2707); `src/render/detail/river.js` 1.
- Problem: "`grep -rn "Northfield\|Walpole\|..." src/` finds nothing outside `data/`-derived values". `river.js` line 1 is the comment "River: flow at North Walpole over the last 2 days and the NWS forecast for", which no step edits.
- Fix: Reword the comment in P0.10, or say comments are excluded.

#### C17. P0.12 makes `visText` a re-export of a per-model function

- Severity: minor.
- Where: 08 14.2 P0.12 (line 2720).
- Problem: "`visText` in `src/format.js` stays as a re-export of `m.u.dist` for any caller left". `src/format.js` has no model, and `m.u` exists only inside a model.
- Fix: `src/units.js` `dist` calls `visText` from `src/format.js`, which stays as it is.

#### C18. P0.11 asks for units through `m.u` in a function with no model

- Severity: minor.
- Where: 08 14.2 P0.11 (line 2712); `src/logic.js` 545 and 551.
- Problem: "Every reason and sentence in `src/logic.js` that writes a unit uses `m.u`". `confidenceText(c, only)` writes "models differ by about ${Math.round(wind)} mph on wind" and has no `m`.
- Fix: Give `confidenceText` a `u` argument (default `unitFormat('us')`), and say which callers pass it.

#### C19. 01 and 03 still describe the old install key

- Severity: minor.
- Where: 01 8.1 row 6 (line 716); 03 9.1 table (line 605).
- Problem: 01: "`src/config.js` `SET_KEY`, `PLAN_KEY`, `CACHE_KEY`, `INSTALL_KEY`, `NUDGE_KEY` (`putney-rowing-*-v1`)". `INSTALL_KEY` is `'putney-rowing-install-v2'` (`src/config.js` 19). 03: "Install snooze, nudge dismissal, passkey offer, age gate". Since `2b7ef06` the install key holds a dismissal count and Don't show again, not a snooze.
- Fix: 01: "(`putney-rowing-*`, install at `-v2`)". 03: "Install bar choice".

#### C20. Phase 0 test and CI lists disagree inside 08

- Severity: minor.
- Where: 08 3.4 (line 187), 13.1 (line 2471), 13.6 (line 2523), 14.2 P0.2 and P0.3.
- Problem: 3.4 lists `playwright.config.js`, `test/browser/fixtures.js`, `screens.spec.js` and `timing.spec.js` for phase 0, but not `smoke.spec.js`, which P0.2 creates and 13.7 lists. 13.1 says "WebKit and Firefox on the owner's machine"; P0.2 configures WebKit twins only. 13.6: "Screenshots and the budget report are uploaded as artifacts"; P0.3's CI change has no upload step.
- Fix: Add `smoke.spec.js` to 3.4, drop Firefox from 13.1 or add its projects, and add an `actions/upload-artifact` step to P0.3 or drop the sentence.

#### C21. P0.4's comparison test has nothing to compare against after the change

- Severity: minor.
- Where: 08 14.2 P0.4 (line 2637).
- Problem: "every function of `zoneFormat('America/New_York')` equals today's module output". Once P0.4 lands, the module's exports are `zoneFormat`'s own functions, so the test compares a function with itself.
- Fix: Copy today's six formatter definitions into `test/format.test.js` as the reference.
