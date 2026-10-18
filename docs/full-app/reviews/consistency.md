# Consistency review of the plan

Reviewed `docs/full-app/01` to `08` and the code they describe, on `dev-full-app` at commit `59bed34` (no file under `src/`, `worker/`, `test/` or the build config has changed since `20e4255`, where 08 read the code). Started Sun Oct 18 10:12:10 UTC 2026 (`date -u`).

Status: in progress

Count: 8 blockers, 13 major, 18 minor.

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

## Contradictions between the documents and with 08

### Major

#### C22. 08's prefix dispatch sends report, hazard, outing and contact routes to the wrong router

- Severity: major (phase 3).
- Where: 08 3.5 (lines 227 to 237).
- Problem: "Prefix dispatch, in this order (first match wins)". Row 2 is "`/api/auth/`, `/api/me` (except the club and notify paths below), ..." to `worker/auth/index.js`; row 4 is "`/api/locations`, `/api/waterways`, `/api/discover`, `/api/sources`" to "`worker/locations.js` (club context and proxies delegate onward)". Later rows give `/api/locations/:slug/reports` to `worker/reports.js` (line 235), and `/api/me/outings` and `/api/me/contacts` to `worker/outings.js` (line 237). With first match wins, `/api/me/outings` and `/api/me/contacts` match `/api/me` first (the exception names only the club and notify paths), and `/api/locations/:slug/reports`, `/api/locations/:slug/hazards` and `/api/waterways/:id/hazards` (7.3) match the locations row first, which names only club context and proxies as delegated.
- Fix: Order the table from the most specific pattern to the broadest, or extend the two exceptions: `/api/me` except club, notify, outings and contacts paths; `worker/locations.js` delegates `/reports` and `/hazards` suffixes as it does club context.

#### C23. 04's report checks ignore `REPORTS_ENABLED`

- Severity: major (phase 2, when production gets a database).
- Where: 04 3.5 step 1 (line 203) and 3.10 (line 474); 08 6.3 (line 1652), 7.1 "Feature off" (line 1813), K52.
- Problem: 08: `REPORTS_ENABLED` is "`"0"` until phase 3 ships", read by "`/api/info` `reports`, report routes", and a route whose feature is off "answers 404 with ... `reports_off`". 04's server checks start "1. `env.DB` bound. Else 503 `not_configured` "Reports are not set up here."" and never read the flag, and 04 3.10 still says "Production D1 binding (phase 2 or 3, 08)". Built from 04, production accepts report posts from phase 2, when 03 adds the production database, while `/api/info` hides the form. K52 records "Edit made: None".
- Fix: 04 3.5 step 1 becomes "`env.DB` bound and `env.REPORTS_ENABLED === '1'`. Else 404 `reports_off`". 04 3.10: "Production D1 binding in phase 2 (08 5.4), reports held off by `REPORTS_ENABLED` until phase 3".

#### C24. 03's Turnstile sentences are narrower than the plan's use of Turnstile

- Severity: major.
- Where: 03 6.3 Decision (line 539) and 21 (line 1768); 03 12.4 (line 896); 08 10.8 (lines 2330 to 2339).
- Problem: 03 6.3: "Extend the CLAUDE.md Turnstile exception to "when the suggestion form or the sign-in email field is first used"". 03 12.4, the privacy notice's cookie list: "Turnstile: ... it runs only on the sign-in and suggestion forms." 08 10.8 lists four actions: `suggest`, `auth` (sign in, `POST /api/me/email`, `POST /api/me/guardians/invite`), `report` (signed-out reports) and `safe` (the status link). The CLAUDE.md sentence 03 proposes would still be broken by 04's report dialog and status link, and the privacy notice would misstate where the script runs. 08's own replacement sentence ("suggestions, sign in, a report sent while signed out, and the status link's safe button") leaves out the email change and guardian invite forms from its own table.
- Fix: Replace 03 6.3's Decision and 03 21's line with 08 10.8's sentence, add "changing your email and inviting a guardian" to that sentence, and make 03 12.4 say "it runs only on the forms that need it: suggestions, sign in, email change, guardian invites, signed-out reports and the status link".

#### C25. 02 chooses Photon for the add flow's search, but 08's CSP never allows it

- Severity: major (phase 3).
- Where: 02 "Place search, reverse geocoding and time zones" Decision (line 642) and the open questions (line 805); 08 10.11 (lines 2362 and 2369); 07 5.6 (line 563).
- Problem: 02: "Decision: in the add flow's search box, use Photon for boathouse names", at `https://photon.komoot.io/api/`, from the browser. 08's `connect-src` lists Open-Meteo, NWS, USGS, NOAA and the geocoding host; "Phase 3 adds `https://tiles.openfreemap.org`". Photon is not an adapter, so `test/csp.test.js` (which checks adapter `hosts`) would not catch the gap, and the request would be blocked. 07's add flow step 1 has no search box at all ("The map ... with a fixed crosshair"), so the three documents disagree on whether the search exists.
- Fix: Decide in 07 5.6 whether step 1 has a search box. If it does, add `https://photon.komoot.io` to 08 10.11's phase 3 line and to the CSP test's extra hosts; if not, drop 02's Photon decision.

#### C26. Two staleness rules for the same flow reading in phase 1

- Severity: major (phase 1).
- Where: 02 adapter catalog (lines 380, 381), the `staleMs` paragraph (line 404) and Phases (line 755); 01 15.7 (line 1501) and 6.3 notes (line 571); 07 6.7 (line 788); 08 K9.
- Problem: 02: `usgs-latest` and `usgs-recent` have `staleMs` 12 h; "Past `staleMs` the slot reads as missing and the hero names it: "River flow data is more than 12 hours old."", and phase 1 ships "staleness per slot". 01: flow `maxAgeH` is 24 h from phase 1; "Over `maxAgeH` (24 h from phase 1): not used ... Fact note: "Last reading 2 days ago, not used for Go, Caution or Stay off."" 07 6.7 repeats 01's 24 h. K9 says only "behavior ships in phase 1 with 01's `maxAgeH`", without retiring `staleMs`. A reading 13 hours old is missing under 02 and used under 01, with different copy.
- Fix: One rule. Recommended: 01's `maxAgeH` governs whether a value is used, and `staleMs` only decides when the hero names a source as stale, set no shorter than `maxAgeH` (24 h for the USGS slots), with 07 6.7's copy.

#### C27. 08 and 04 disagree on whether the legacy report route needs Turnstile

- Severity: major (phase 3).
- Where: 08 7.3 (line 1854); 04 3.9 (line 458).
- Problem: 08: "POST `/api/reports` | none (Turnstile from 3) | `REPORT_LIMIT` | today; alias until 4". 04: "old clients have no Turnstile, so the alias accepts signed-out reports without it but at weight 0.5 and under a tighter limit (10 a day per `ip_hash`)". The alias exists so that "a home screen app that has not updated yet still works"; built from 08 it refuses every such report.
- Fix: 08 7.3's auth cell for the alias becomes "none (weight 0.5, D1 10 a day, 04 3.9)".

### Minor

#### C28. `LOCATION_LIMIT` is keyed by connection in 01 and by user in 08

- Severity: minor.
- Where: 01 12.1 (line 1143); 08 6.2 (line 1630).
- Problem: 01: "a Workers rate limit binding `LOCATION_LIMIT`, 5 writes a minute per connection, like `REPORT_LIMIT`". 08: "`LOCATION_LIMIT` | 5 | user id". Every route that uses it requires a session (08 7.3).
- Fix: 01 12.1: "5 writes a minute per user (08 6.2)".

#### C29. 07 still asks for `at` to be reserved

- Severity: minor.
- Where: 07 4.1 (line 212) and 16 (line 1515); 08 K25.
- Problem: 07: "`at` must be added for quick looks (section 16)" and "| 01 | Add `at` to the reserved slugs (2.2). |". K25 decided "`at` needs nothing, as slugs are 3 to 48 characters", and 07's own next sentence says the same of `o`.
- Fix: 07 4.1: "`at` and `o` cannot collide because slugs are at least 3 characters (08 K25)"; drop the 16 row.

#### C30. 01's binding fields and schema intro predate 08's merge

- Severity: minor.
- Where: 01 4.4 (line 247) and 5 (line 252).
- Problem: 01 4.4 lists binding `status` as "`active`, `offline`, `retired` (15.7)" and has no `origin`, `fail_count`, `confirmed_by` or `confirmed_at`; 08 4.3 gives "status list `active`, `suggested`, `offline`, `retired`, `rejected`" plus those columns (K2). 01 5's intro still says "`users` (03) and `clubs` (06) must exist first", in the same paragraph that says `steward_club_id` waits for `0010` because clubs come later (K12).
- Fix: 01 4.4: add the four columns and the five statuses, with 02's meanings. 01 5: "`users` (03) must exist first; `clubs` arrive in phase 5 (08 K12)".

#### C31. 07 and 08 disagree on whether phase 0 renders the footer credits

- Severity: minor.
- Where: 07 6.6 (line 772); 08 14.2 P0.10 (line 2705) and 14.3.
- Problem: 07: "Phase 0 reproduces today's Putney text exactly, from the Putney record's `copy.credits` (01)." 08: "Leave `index.html` alone: its title, manifest name, settings notes and credits change in phase 1 (07 15)." The text is the same either way (checked: `copy.credits` equals `index.html` line 90 with tags removed), so only the phase differs.
- Fix: 07 6.6: "Phase 1 renders the credits from `copy.credits` ...; phase 0 leaves `index.html` as it is (08 14.3)."

## Markdown that changes meaning

### Major

#### C32. Unescaped pipes break eight rows of 06's API tables

- Severity: major.
- Where: 06 19.1 (lines 2089, 2091, 2103, 2107, 2117) and 19.2 (lines 2137, 2141, 2142).
- Problem: In a table row, `|` ends a cell even inside a code span. For example line 2141, "`PATCH`, `DELETE /api/clubs/:slug/practices/:id?scope=one|following` | Coach, admin | Edit or delete", renders the path as "...?scope=one", the Who column as "following`" and the Purpose column as "Coach, admin", and drops "Edit or delete". The other rows split JSON bodies such as `{ "method": "meta" | "dns" | "email" | "manual", ... }` across columns, so the Purpose text is cut. Checked with a script that counts unescaped pipes against each table's header; only 06 has such rows.
- Fix: Escape each pipe inside those code spans as `\|`, or write the alternatives in words ("`method`: `meta`, `dns`, `email` or `manual`"), as 08 7.3 does with "`?scope=one` or `?scope=following`".

## More contradictions between the documents

### Major

#### C33. Cloudflare Access lets only the owner reach routes that moderators need

- Severity: major (phase 3).
- Where: 03 3.7 (lines 213 and 217) and 12.4 (line 895); 07 5.14 (line 673); 08 7.3 (lines 1923, 1941, 1973).
- Problem: 03: "add a self-hosted Access application for `rowhether.com/admin*` and `rowhether.com/api/admin/*` ... Policy: allow the owner's email only", and "keep Cloudflare Access in front of `/admin*` and `/api/admin/*` after phase 2 as a second lock". 07: `/admin` from phase 2 "also needs site role `moderator` or `admin`". 08 puts moderator routes under that prefix: `GET /api/admin/queue` (mod), `POST /api/admin/clubs/:slug/review` (mod), `GET /api/admin/reports.csv` (owner or mod), and defines **mod** as a site role in a passkey session, without Access. Access answers before the Worker runs, so no moderator except the owner can open the queue.
- Fix: Either move the moderator routes and the moderator part of `/admin` out from under Access (for example `/api/mod/*`, which 08 already uses for user name resets and suspensions, and a `/mod` page), or make the Access policy include every moderator and say who keeps it in step with `site_role`.

#### C34. Synced `waterOverride` values are strings today, which 03 and 08 would refuse

- Severity: major (phase 2).
- Where: `src/settings.js` line 26; 03 9.2 (line 610); 08 7.5 (line 2060); 08 14.2 P0.7 (line 2667) and P0.1 (line 2582).
- Problem: Today Settings stores the dock reading as typed text: `if (k === 'waterOverride') { next[k] = raw; continue; }`, so a saved value is `"55"`. P0.7 keeps "the values as today" and migrates them "unchanged". 03 9.2: a synced value "is JSON: a finite number, `""` ..., an object for `plan`, or null", and unknown or invalid values answer 400 `invalid`; 08 7.5 lists `waterOverride` as "number or `""`". The first push from a device that has a dock reading fails, and with 200 changes per request the whole outbox can stall. The golden cases also pass `waterOverride: 55` as a number, so they do not exercise the stored shape.
- Fix: In P0.7, store `waterOverride` as a number (or `''`) on save and convert it in `migrateStorage()`, with a golden case that uses the string form today's users have; or have 03 9.2 accept a numeric string for this key and normalize it on the server.

#### C35. 03 and 04 make opposite promises about raw coordinates in reports

- Severity: major (phase 3, privacy).
- Where: 03 12.2 (lines 875 and 876); 04 3.4 (lines 184 to 194).
- Problem: 03: "If 04 wants proof someone is at the dock, the browser computes it and sends only a flag (`"atDock": true` when within 500 m of the location's dock point), not coordinates", and "Rounding before the request keeps precise coordinates out of request logs." 04: the dialog "sends `geo: { lat, lon, acc }`" with `enableHighAccuracy: true`, and "The Worker computes the distance ... and stores only one word", with a 1,500 m radius. The privacy notice (03 13.3) would promise what 04 does not do, and the two radii differ.
- Fix: Pick one. Recommended: 03's rule, since the browser has the dock point from the location record: compute `near`, `far` or `unknown` in the browser with 04's 1,500 m and accuracy rules, send only the word, and correct 03's 500 m.

### Minor

#### C36. 03 still recommends signed-out alerts, which 05 declined

- Severity: minor.
- Where: 03 2 (line 70); 05 13 (line 1037).
- Problem: 03: "Location alerts on this device | 4 | 05 decides; recommended yes, device only". 05: "Decision: push and alert rules need a signed-in account." 08 7.3 gives every push route a session.
- Fix: 03 2: "No (05 13); account needed for every alert".

#### C37. 07's route table has no `/account/revert`

- Severity: minor.
- Where: 03 4.7 (line 334) and 18 (line 1621); 07 4.1 (lines 195 to 208) and 4.2 (line 218).
- Problem: 03's email-change undo link is `https://rowhether.com/account/revert#t=<token>`, and 03 18 adds "`/account/revert` page" to `src/route.js`. 07's routes list `/account` with hashes only, and `parseRoute(loc)` returns pages `home`, `location`, `point`, `add`, `account`, `club`, `status`, `admin`, `notfound`, with nothing for the revert page.
- Fix: Add `/account/revert#t=<token>` to 07 4.1 (phase 2, no account needed, loaded with the `account` chunk) and a `revert` page to `parseRoute`.

#### C38. Two sets of percentiles for the same Putney flow history

- Severity: minor.
- Where: 01 6.1 (line 437), 6.2 (line 476) and 14.9 (line 1424); 02 Summary 8 (line 34), discovery sample (line 545) and step 3 (line 625).
- Problem: For 3,939 days of North Walpole daily means, 01 gives "p90 21,900, p95 28,100" and writes them into Putney's waterway file; 02 gives "90th percentile 21,820, 95th percentile 28,010", "by linear interpolation between closest ranks". Only one method produced each pair, and the file phase 0 commits carries 01's. The suggested lines are the same either way after rounding down.
- Fix: State the method once (02 step 3) and use its values in 01 6.1, 6.2 and 14.9, or note that 01's are nearest-rank values.

#### C39. Stale references to decisions 08 has made

- Severity: minor.
- Where: 01 14.9 (line 1429); 02 "Default flow thresholds" step 7 (line 629); 02 Worker endpoints (line 743).
- Problem: 01: "Cached for 30 days per adapter and ref (08 picks Cache API or KV)"; 08 6.6 picked D1 `source_cache`. 02: "Refresh yearly: the Cron Trigger on January 15 recomputes `stats`"; 08 6.4 has only `* * * * *` and `17 9 * * *`. 02's `PUT /api/locations/:slug/sources` body still uses the rejected binding shape (`"slot": "river"`, `"adapter": "usgs-latest"`, `"params": { "flow": ... }`), while 08 K2 and K3 store 01's `role`, provider `adapter` (`usgs-ogc`) and `ref`.
- Fix: 01: "cached in D1 `source_cache` for 30 days (08 6.6)". 02 step 7: "the daily run on January 15". 02's body example in 01's binding fields (4.4).
