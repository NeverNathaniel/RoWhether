# Phase 1 plan review

Reviewed `docs/full-app/phase-1-plan.md` (the 20 steps in 5 batches) on `dev-full-app` at `d625fa9`, the plan's last commit. The code has not changed since `30fef7a`, the commit the plan was written against (`git diff --stat 30fef7a d625fa9` lists only `README.md` and the plan). Started Tue Oct 20 03:27 UTC 2026 (`date -u`).

The question for each step: would it fail as written, break an existing install, change Putney in a way 07 3.2 does not list, or miss an exit criterion of 09 phase 1. Severity: blocker means a step cannot finish as written, or Putney regulars lose something 07 3.2 and the exit criteria promise; major means a real gap a builder will hit or a check that cannot hold; minor means small.

How the evidence was made: a git worktree of `d625fa9` in the scratchpad with `node_modules` linked, the code changed there as a step would change it, then `npm test` (700 tests at `d625fa9`), `npm run build` and `node scripts/budget.mjs`. Live requests from this container on 2026-10-20 between 03:15 and 03:40 UTC, with the User-Agent `RoWhether-plan-review/1.0 (+https://rowhether.com)` and no personal data.

Status: in progress

Count so far: 1 blocker, 12 major, 2 minor.

## Blockers

#### R1. A saved forecast over 24 hours old opens as "No data." for a Putney regular

- Severity: blocker.
- Where: P1.9 items 2 and 3; `src/main.js` lines 132 to 139 (the saved copy is drawn before `refresh()`); 07 3.2 step 4; 09 phase 1 exit criteria 2 and 3.
- Problem: P1.9 makes every slot past its `staleMs` read as missing, with `wx` at 24 hours, and counts an old cache entry as fetched at its `updated`. At start the app draws the saved copy first, then refreshes. A rower who opens the app every other morning has a copy about 48 hours old, so from P1.9 the first hero is "No data." with "The forecast did not load. Check the connection, then tap Refresh." until the refresh lands, and it stays that way offline. Today the same start draws Go, Caution or Stay off from the saved forecast, which still holds the current hour. The plan says the effect comes "only after a day without a connection"; it comes at every start after a day away. 07 3.2 step 4 promises "The cached Putney forecast renders at once, then refreshes, exactly as today", and exit criterion 3 asks for the cached hero before any request completes. Neither 3.4 nor 07 3.2 lists the change.
- Evidence: `src/main.js` lines 132 to 139 call `render()` on the saved copy, then `refresh()`. P1.9 item 2: "An entry without `fetched` ... counts each slot as fetched at `updated`"; item 3: "a stale slot reads as missing"; 02's catalog: `om-forecast` `staleMs` 24 h. With `wx` missing, `buildModel()` returns null and `render()` calls `renderNoData()` (`src/render/index.js` line 15). Every check that reads a saved copy saves it at the same pinned clock it reads it at (`timing.spec.js`, the upgrade test in `smoke.spec.js`, `update.spec.js`, P1.4's upgrade check), so none of them can see it.
- Fix: Keep the saved forecast on screen at start. Apply fetch-time staleness to `wx` only after a refresh in this start has failed, or show the old forecast with its age ("Saved Mon 6:41 AM") rather than No data. Add a smoke check that seeds a saved copy 48 hours older than the clock, holds every upstream request, and expects the saved verdict. If the owner wants No data after 24 hours offline, that is a Putney change to add to 07 3.2 and to the proof, with the owner's approval.

## Major

#### R2. Several planned golden paths cannot match what the files hold

- Severity: major.
- Where: 3.2 (`check` matches each changed path against the id's patterns), 3.4 (`flowdays-noon`, `banks`, `not-checked`), P1.8 commit 4, P1.9, P1.11; `test/golden/digest.js` (`trimmed()`), `test/golden/capture.js` (`big()` and `keep()`).
- Problem: `diff` prints leaf paths ("the path diff finds a changed leaf"), and a pattern's `*` is one segment. Three planned ids name paths the files do not have at that depth. (1) `flowdays-noon` plans `parsers.flowDays.**`, but in every file it moves the whole `parsers` key is stored as a digest, `{ sha256, bytes }`, so the changed leaves are `parsers.sha256` and `parsers.bytes`. (2) `banks` plans `forecasts.*`, but each forecast is stored as `{ length, sha256 }`, so the leaves are `forecasts.<id>.length` and `forecasts.<id>.sha256`, one segment deeper. (3) `not-checked` plans `home.notChecked`, an added object whose leaves are `home.notChecked.innerHTML` and the rest; whether an added key is printed as its root or its leaves is not said. In each case `check` fails on the planned change, and rule 13 stops the step.
- Evidence: `parseFlowDays` changed in the worktree to place each day at noon New York time, then `npx vitest run test/golden.test.js test/golden-variants.test.js`: exactly the four files 3.4 predicts fail (`v-fall-back-d3-0700`, `v-spring-d1-1200`, `v-spring-d1-1200-tight`, `v-spring-d2-0900`), each on "parsers (stored as a digest; dump the case to see it in full)". In those four files `parsers` is `{"sha256":"1d77...","bytes":23430}` and the like; 75 of the 77 variant files store `parsers` as a digest. In `june-calm-1200-default.json`, `forecasts["2026-06-15-midday"]` is `{"length":8648,"sha256":"a91f8e5e..."}`.
- Fix: Define in 3.2 that `diff` prints leaves, also for added and removed keys, and write the patterns that way: `forecasts.*.*`, `home.notChecked.**`, `later.home.notChecked.**`, `status.partial.notChecked.**`, `status.partialAll.notChecked.**`. For a digested key, make `diff` expand it: capture the case at both revisions (as `dump` does) and diff the full values, so `flowdays-noon` can keep `parsers.flowDays.**`. Add a hashed leaf, a digest and an added object to `test/golden-check.test.js`.

#### R3. The observation's own reading age hides Keene during ordinary feed delays

- Severity: major.
- Where: P1.9 item 3 ("an `obs.t` over 3 hours old hides the "Measured at" fact"), 3.4 `stale-sources`; `src/render/now.js` lines 105 to 111.
- Problem: 02 and 08 K9 define `staleMs` as the age of the last good fetch ("after this, the last good value is dropped and the slot reads as missing", 02 line 307). The plan adds a second rule on the reading's own time and cites the same sections. The NWS observation feed often runs hours behind, so Putney's "Measured at Keene" fact would disappear on ordinary days, a change 07 3.2 does not list. Today the fact stays, with its age in the note.
- Evidence: at 03:27 UTC on 2026-10-20, `https://api.weather.gov/stations/KEEN/observations/latest` returned `2026-10-20T00:10:00+00:00`, 3 hours 17 minutes old, and `/stations/KEEN/observations?limit=12` had nothing newer. KPHL, KORH, KSAC, KDCA and KTTN also stopped at 00:10 and KLEB at 00:00. Under the plan's rule every one of the seven locations would have lost its observation fact at that moment.
- Fix: Drop the reading-age rule and keep 02's fetch-time staleness. If the owner wants a reading age, set it well past the feed's usual lag (24 hours, say), keep the fact with its age, and list the change for Putney in 07 3.2 and 3.4.

#### R4. The screenshot proof cannot hold: every shot gains the note or the Privacy link

- Severity: major.
- Where: 3.6, P1.20 item 3, P1.6 items 2 and 4, P1.16 item 6; `test/browser/screens.spec.js`; 07 6.6.
- Problem: 3.6 expects each `@visual` difference to be the chevron, the bank labels or the footer credits. (1) `screens.spec.js` loads `/` and `/#<tab>` with empty storage. From P1.6, `/` with nothing stored inside the window shows "Not your water? Pick a location." above the hero, which moves everything under it in the 16 home and row shots. P1.6 moves the smoke specs to `/putney-landing` but leaves this spec. (2) P1.16 adds a "Privacy" link to the footer, and every shot is `fullPage: true`, so all 48 differ there. 07 6.6 puts the footer links line in phase 2 and says "Putney's footer does not change" beyond the credits; 07 3.2 does not list the link.
- Evidence: `screens.spec.js` `page.goto('/')` and `` page.goto(`/#${tab}`) ``, `shot = { fullPage: true, ... }`; the window ends 2027-03-01 (section 2, row 4) and the shots are pinned to 2026-06-15 and 2026-10-14.
- Fix: In P1.4 or P1.6, `screens.spec.js` loads `/putney-landing`, as 01 16.5 asks ("`/putney-landing` ... identical to the pre-phase-0 screenshots"); the `30fef7a` baseline at `/` draws the same page. Either list the Privacy link as an expected difference in 3.6, P1.20 and 07 3.2 with the owner's approval, or wait for phase 2 as 07 6.6 says and link `/privacy` from the install and Settings text in the meantime.

#### R5. Code that assumes a location is not made safe for a switch, or for pages with none

- Severity: major.
- Where: P1.4 items 4 and 5, P1.6 item 8; `src/main.js` lines 45 to 60 (`busy`) and 118 to 121 (the return to the tab and the 10 minute timer).
- Problem: (1) `refresh()` returns at once while another refresh runs. P1.4 adds a token so a slow answer for one place is dropped, but not the `busy` flag. Pick a second location while the first one's refresh is in flight and the second one's refresh returns at once; the first one's answer lands, is dropped, and nothing fetches the second until the 10 minute timer or a return to the tab. (2) On the not-found view, the "Could not load" state (P1.4) and the picker page (P1.6), `app.loc` is null. The return-to-tab handler calls `refresh()` whenever `app.updated` is null, and `fetchAll(null)` throws inside `bindingsFor`, after `busy` was set and before it is cleared, so every later refresh returns at once. A mistyped shared link, a switch to another app and back, then a pick from the prefilled search leaves the new location loading for good. (3) `suggestContext()` (`src/suggest.js` line 38) reads `app.loc.course.heading`, so the suggestion form throws on the picker page and the not-found view, which are where P1.6 and P1.7 offer "Suggest a location". P1.4 item 10 adds `location: app.loc?.slug ?? null` and leaves that line.
- Evidence: `src/main.js` line 47 `if (busy) return;`, line 52 `const { data, errors } = await fetchAll(app.loc);`, `busy = false` only at line 60. `bindingsFor(null)` throws "Cannot read properties of null (reading 'sources')" (run in Node at `d625fa9`). P1.6's browser checks pick locations with fixtures that answer at once, so they cannot see (1); no check returns to the tab on a page with no location.
- Fix: P1.4: `refresh()` does nothing without `app.loc`; the in-flight flag belongs to a token, so a switch starts its own refresh (or one queued to run when the old one ends); `busy` is cleared in a `finally`. `suggestContext()` sends `settings: null` and `location: null` with no location. Checks: hold the first location's upstream answers, switch, and expect the second location's requests; on `/no-such-place` dispatch `visibilitychange`, then pick a location from the search and expect its requests and a clean console; a unit test of `suggestContext()` with `app.loc` null.

#### R6. `update.spec.js` serves JSON as `application/octet-stream`, so P1.4's content-type rule fails it

- Severity: major.
- Where: P1.4 item 3 (`fetchRecord`: "A 200 with a JSON content type is `{ record }`. Anything else ... checks the index"), P1.4's browser checks ("`update.spec.js` passes"); `test/browser/update.spec.js` (its own server and `TYPES`); CLAUDE.md hard constraints.
- Problem: `update.spec.js` serves `dist/` from its own Node server, whose type table has no `.json`, so `locations/putney-landing.json` and `locations/index.json` come back as `application/octet-stream`. The service worker stores and replays that header. `fetchRecord()` then reads the record as not JSON, the index as unreadable, and returns `failed`: the page shows "Could not load this location", `ready()` times out, and the spec fails. P1.4 does not list the file. The same rule makes every location fail on any static host that serves `.json` as `text/plain` or `application/octet-stream`, against CLAUDE.md's "plain static files in `dist/` that any static host can serve".
- Evidence: `update.spec.js`: `const TYPES = { '.html': ..., '.js': ..., '.css': ..., '.svg': ..., '.png': ..., '.woff2': ..., '.webmanifest': ... }` and `'content-type': TYPES[extname(file)] || 'application/octet-stream'`. Both builds it serves are built from the working tree, so from P1.4 both need the record file.
- Fix: Decide by the body, not the header: parse it, and accept it as a record when `v` is 1 and `slug` is the slug asked for; an HTML fallback fails to parse and goes to the index check. Unit test a JSON body with `application/json`, `text/plain` and `application/octet-stream`, and an HTML body with 200. Add `'.json': 'application/json'` to the spec's table too, and list `update.spec.js` in P1.4's files.

#### R7. The main JS row is very likely missed; the planned growth is about half of what a prototype measures

- Severity: major.
- Where: 7.1, 7.3, P1.9 (+450 B); 08 11.2 (46,700 B).
- Problem: 7.1 ends at 46,695 of 46,700 B, 5 B of room after 18 estimated steps. One estimate checked by prototype comes out near double. 7.3's levers are small next to that (the Settings field builder, the copy of three screens, about 30 B of duplicate `isSet`). The plan's first saving holds: the records leave the main script.
- Evidence: `npm run build && node scripts/budget.mjs` at `d625fa9`: main JS 43,505 B. With `src/putney.js` importing nothing (the records out): 42,325 B, 1,180 B less (the plan says 1,191). A terse prototype of part of P1.9 (`staleSlots` with the nine limits, `flowForCall`, `waterSource` with the typical value, `notChecked`, `notCheckedText` with its ages, and item 8's nine sentences, wired from `render()`): 44,360 B, 855 B more, against 450 planned, and without the `fetched` cache, the `stale` model input, the alerts still in force, the hero, overnight hero and share wiring, or the view branches that use the sentences. A structural lever the plan does not list: with the nine detail views out of the main script, it is 26,617 B, 16,888 B less.
- Fix: Before batch 2, prototype P1.9, P1.13 and P1.14 and replace their estimates. Add to 7.3, as the lever before a stop: load the detail views with `import()` and precache them, as P1.14 already does for Tide (`load`, "Loading." in `renderDetail()`), starting with the views least used at first paint. If the owner prefers a raise, set it now in 08 11.2 rather than at a stop.

#### R10. The config probe moves in P1.4 and P1.14, two steps that plan no golden change

- Severity: major.
- Where: P1.4 items 1, 2 and 6 ("Golden: none"), P1.14 item 3 ("Golden: none"), 3.4's last paragraph; `test/golden/probes.js` lines 21, 22 and 382 to 384; `test/golden/p-config.json`.
- Problem: The probe behind `p-config` records `routes` and `noRoute` by calling `parseRoute(h)` with hash strings, and `views` as `VIEWS.map(v => [v.key, v.name])`, unfiltered. P1.4 turns `parseRoute` into `parseRoute({ pathname, hash, search })` with a new return shape (today's function becomes `parseHash(hash, keys)`), so `routes` and `noRoute` change or throw. P1.14 adds `{ key: 'tide', ... }` to `VIEWS` after Wind, so every `views` entry from index 3 on moves. Neither step lists `test/golden/probes.js`, P1.4's commit (a) edits only the capture, and 3.4 says a golden move in either step is a finding, so both steps stop under rule 13. P1.8 has a smaller trap of the same kind: the probe records `GAUGE_FLOW` and `GAUGE_TEMP` from `slot('river').params.flow` and `.temp`, so a latest binding that lists each gauge once must keep those two fields.
- Evidence: `probes.js` line 383 `routes: Object.fromEntries([...].map(h => [h, parseRoute(h)]))`, line 384 `noRoute: [parseRoute(undefined), parseRoute(null)]`, line 382 `views: VIEWS.map(v => [v.key, v.name])`, line 374 `GAUGE_FLOW: slot('river').params.flow, GAUGE_TEMP: slot('river').params.temp`. `p-config.json` holds `views` with nine entries and the routes as `{ name, day }`.
- Fix: Put `test/golden/probes.js` in P1.4's commit (a): `routes` and `noRoute` call `parseHash(h, keys)` with Putney's tab keys, keeping the `{ name, day }` shape and today's answers for `undefined` and `null`, and `views` lists `VIEWS.filter(v => !v.when || v.when(PUTNEY))`, so Tide never reaches it. Say in P1.8 that `latest.bind` keeps `flow` and `temp` and only the URL lists each gauge once.

#### R11. A `none` course and a lake with a heading still draw river words, `undefined°` and `NaN`

- Severity: major.
- Where: P1.13 items 4 to 6; `src/render/forecast.js` lines 21, 85 and 86, `src/render/detail/wind.js` lines 27 to 37, 74, 107 and 121, `src/render/now.js` lines 48 to 53.
- Problem: P1.13 plans the Now compass and its caption for a `none` course, the Wind fact note and one sentence of the Wind tab's How this works. Every other reader of `m.loc.course.heading` is left. At Lake Carnegie the full forecast for every period says "River runs --, upstream heading undefined°.", the Wind tab draws its arrows with `rotate(NaN)`, its Course column says "Cross" for every hour with 3 mph or more (`courseWord()` compares `NaN`), and How this works says "The course heading is undefined°, set in Settings." At Lake Quinsigamond and Lake Natoma, where the lake has a heading course, the Now caption and every full forecast say "River runs NNW, upstream heading 166°." The planned browser checks look at the compass and the Wind fact only, so none of the text would fail them; the `NaN` would show only if Chromium logs the SVG attribute error the console check sees.
- Evidence: in the worktree, the golden capture run on Putney's record with `waterType: 'lake'` and `course: { kind: 'none' }` (and once with `{ kind: 'heading', heading: 166 }`), and its output searched: `views/wind/*.html` hold "heading is undefined°" and `NaN`; `home/compassCap` and `forecasts/2026-06-15-midday.html` hold "River runs --, upstream heading undefined°"; with the heading course they hold "River runs NNW, upstream heading 166°".
- Fix: Add to P1.13: the full forecast caption and compass follow the Now compass's rules (ellipse and "Wind from SW across about 1.5 mi of open water." for a `none` course; "Lake runs ..." or no run sentence for a heading course on still water, with "relative to the lake" in the `aria-label`); the Wind tab draws no arrows and no Course column without a heading, and its How this works names no heading. Add a unit test that renders every view and forecast for the three lake records and finds no `undefined`, `NaN` or "River runs".

#### R12. P1.10's flow-limit check cannot see the waterway, where four of the flow bindings live

- Severity: major.
- Where: P1.10 item 4 ("`validateLocation` allows it and refuses a flow limit with no flow binding, or a `basis.flow` naming another binding"); `src/location.js` `validateLocation(rec)` and `resolveSources()`; P1.2's `collectLocations`.
- Problem: `validateLocation` takes the record alone. Putney, Hanover, Boathouse Row and Thompson Boat Center all inherit their flow row from the waterway file, so their own `sources` have no flow binding while their `thresholds` carry flow limits. Written as P1.10 says, the check refuses Putney's record, `collectLocations` throws, and the build fails; the `basis.flow` check has no binding to compare with either.
- Evidence: the roles in `data/locations/putney-landing.json` `sources` are `alerts`, `obs` and `water_temp`; `flow` and `flow_forecast` are in `data/waterways/connecticut-river-vernon-pool.json`. 4.4, 4.5 and 4.8 put the three new flow rows in their waterway files the same way.
- Fix: Give the check the waterway: `validateLocation(rec, { waterway })` runs these two rules on `resolveSources(rec, waterway)`, and `collectLocations` passes it. Test both rules with a flow row in the record and with one inherited from the waterway.

#### R13. `privacy.html` splits the main stylesheet, and the CSS budget then measures the small half

- Severity: major.
- Where: P1.16 items 4 and 5 (`privacy.html` "with the app's styles and fonts", a second Vite input); `scripts/budget.mjs` `mainFiles()`; 7.1's CSS column; exit criterion 5.
- Problem: With a second HTML input that links the app's stylesheet, Vite moves the shared CSS into its own file, and `index.html` links two stylesheets. `scripts/budget.mjs` takes the first `<link rel="stylesheet">` only, so from P1.16 the CSS line measures a few hundred bytes and can never fail. The page also gains a second stylesheet request on the path to the first hero.
- Evidence: in the worktree, a `privacy.html` linking `/src/styles/tokens.css` and `/src/styles/app.css`, added as `build.rolldownOptions.input: { index: 'index.html', privacy: 'privacy.html' }`: `dist/index.html` links `assets/index-Yu488gou.css` (1.08 kB) and `assets/app-BJbU2q1q.css` (24.54 kB), and `node scripts/budget.mjs` prints "ok CSS 437 B of 6,100 B".
- Fix: `scripts/budget.mjs` sums every stylesheet `index.html` links and every script it loads at start, and fails when there is more than one of either unless `budget.json` names it. Build `privacy.html` so the app's CSS stays one file: its own small stylesheet, or one `<link>` to the same built file the app uses. P1.16 lists `scripts/budget.mjs` and checks `dist/index.html` still links one stylesheet.

#### R14. The upgrade proof starts from a build no Putney phone runs

- Severity: major.
- Where: P1.20 item 7 ("An installed copy of `30fef7a`, updated to HEAD"); exit criterion 3; 3.6.
- Problem: Phase 0 is not in production. Every installed Putney app runs the production build, `2b7ef06` (the tree `origin/master` serves), with only `putney-rowing-*` keys and a service worker without `skipWaiting`. `30fef7a` already has the phase 0 keys, `rowhether-last-v1` and the takeover fix, so an upgrade from it skips the migration and the old worker that real phones go through. The smoke upgrade check seeds the old keys but blocks service workers, so the first start's record file never comes from a precache there.
- Evidence: `git log --oneline -1 origin/master` is `8c9c36a Merge pull request #7 from NeverNathaniel/dev`, and `2b7ef06` is the tip of what it merged; P0.14 item 7 upgraded from `2b7ef06` (`phase-0-progress.md`, "Proof 7, the upgrade: a build of `2b7ef06`").
- Fix: P1.20 item 7 upgrades from `2b7ef06` to HEAD, as P0.14 did, and also from `30fef7a`. It checks that the first start after the takeover reads `locations/putney-landing.json` from the new worker's precache with the network off.

#### R15. Section 9 cuts phase 1 scope that 09 lists, with no owner decision on record

- Severity: major.
- Where: section 9; 09 phase 1 "What ships" and owner tasks; HANDOFF "Phase 1 decisions" and "Waiting on the owner"; README's Phase 1 rows.
- Problem: 09 phase 1 ships "A local discovery script (08 5.6), US tides, currents and the NWPS tide forecast, marine zones, GloFAS and marine fallbacks, place search, the attribution line, staleness per source, and USGS v1", and 01 section 15 "including polar days". Section 9 moves the discovery script, every CO-OPS adapter, tidal streams, fallback bindings, GloFAS and marine water temperature, the level role, polylines, the high-latitude rules, `attributionFor` and per-slot refresh pacing to phase 3, 4 or 7. The reasons are sound, but the owner accepted README's Phase 1 rows, and none of these is a row. 09 also gives the owner a task tied to the discovery script (the User-Agent contact). Phase 2 and 3 plans read 09 for what exists.
- Evidence: 09 lines 70 to 74; HANDOFF "Phase 1 decisions (owner, 2026-10-20): build with the recommendation of every Phase 1 row in `README.md`"; README rows 87 to 104 list none of the deferred items.
- Fix: Before batch 3, put the deferral list to the owner as one decision (a README row or a HANDOFF line), and on acceptance move each item into 09's later phase sections so the phase 2 and 3 plans pick them up.

## Minor

#### R8. P1.11's share check expects the wrong time

- Severity: minor.
- Where: P1.11 browser checks ("with `America/Chicago` the text reads "Putney Landing rowing, 11:57 AM Eastern: ...""); `src/share.js` `shareText(now = Date.now())`.
- Problem: The smoke clock is 12:00 Eastern and the click handler calls `shareText()` with `Date.now()`, so the text starts "Putney Landing rowing, 12 PM Eastern:". 11:57 AM is the fixtures' fetch time, shown in "Updated 11:57 AM". A builder who writes the literal gets a failing check, and the quick way to make it pass is to share the fetch time, which is wrong.
- Evidence: `test/golden/june-calm-1200-default.json` `share`: "Putney Landing rowing, 12 PM: Go. Wind 7 mph from SSW, gusts 13. ..."; `status.header.fresh`: "Updated 11:57 AM".
- Fix: Expect "Putney Landing rowing, 12 PM Eastern: " followed by the rest of the golden `share` text.

#### R9. Two small claims about the golden files are wrong

- Severity: minor.
- Where: 3.4 `alerts-zones` and `usgs-v1` ("the 19 main cases and the non-lean variants"); 3.4 `not-checked`.
- Problem: (1) Every variant is lean, and only the 19 main cases record `sources` (`if (!lean) out.sources = ...` in `capture.js`), so the files list is the 19 main cases. (2) `not-checked` writes `#notChecked` from `renderHero()` and the overnight hero only. `renderNoData()` must hide it too, or a line from the last model stays on screen when the forecast goes missing; then `status.noDataAll`, `status.noDataForecast`, `status.noDataQuiet` and the no-model files' `home` move as well, outside the planned paths.
- Evidence: `VARIANT_CASES` in `test/golden/capture.js` builds every variant with `lean: true`; no `v-*` file has a `sources` key. `renderNoData()` (`src/render/hero.js`) writes `#verdict`, `#why` and `#holds` and leaves the other hero lines.
- Fix: Name the 19 main cases for both ids. Add to P1.9 that `renderNoData()` hides `#notChecked`, and add those paths to `not-checked`.
