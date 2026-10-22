# Phase 1 plan review

Reviewed `docs/full-app/phase-1-plan.md` (the 20 steps in 5 batches) on `dev-full-app` at `d625fa9`, the plan's last commit. The code has not changed since `30fef7a`, the commit the plan was written against (`git diff --stat 30fef7a d625fa9` lists only `README.md` and the plan). Started Tue Oct 20 03:27 UTC 2026 (`date -u`).

The question for each step: would it fail as written, break an existing install, change Putney in a way 07 3.2 does not list, or miss an exit criterion of 09 phase 1. Severity: blocker means the plan must change before the step it names, because as written the step fails its own net, stops under rule 13, or ships a Putney regression that no check sees; major means a real gap that a builder or a later phase will hit, or a check that goes blind; minor means small.

How the evidence was made: a git worktree of `d625fa9` in the scratchpad with `node_modules` linked, the code changed there as a step would change it, then `npm test` (700 tests at `d625fa9`), `npm run build` and `node scripts/budget.mjs`. Live requests from this container on 2026-10-20 between 03:15 and 03:45 UTC, with the User-Agent `RoWhether-plan-review/1.0 (+https://rowhether.com)` and no personal data.

Status: complete (finished Tue Oct 20 03:47 UTC 2026)

Count: 7 blockers, 8 major, 6 minor.

When to apply, by the batch each one guards: before batch 1, R2, R3, R4, R6, R9, R14, R19, R20 and R21; before batch 2, R1, R5, R8, R10, R15, R17 and R18; before batch 3, R11, R13 and R16; before batch 4, R12; before P1.20, R7. The plan's code claims are accurate, and its six records hold up live (see the last section), so most fixes are a sentence or a test added to a step.

## Blockers

#### R1. A saved forecast over 24 hours old opens as "No data." for a Putney regular

- Severity: blocker.
- Where: P1.9 items 2 and 3; `src/main.js` lines 132 to 139 (the saved copy is drawn before `refresh()`); 07 3.2 step 4; 09 phase 1 exit criteria 2 and 3.
- Problem: P1.9 makes every slot past its `staleMs` read as missing, with `wx` at 24 hours, and counts an old cache entry as fetched at its `updated`. At start the app draws the saved copy first, then refreshes. A rower who opens the app every other morning has a copy about 48 hours old, so from P1.9 the first hero is "No data." with "The forecast did not load. Check the connection, then tap Refresh." until the refresh lands, and it stays that way offline. The alerts slot (1 hour) is stale too, so P1.9's line "Official alerts not checked: no answer from NWS for 2 days." goes with it. Today the same start draws Go, Caution or Stay off from the saved forecast, which still holds the current hour. The plan says the effect comes "only after a day without a connection"; it comes at every start after a day away. 07 3.2 step 4 promises "The cached Putney forecast renders at once, then refreshes, exactly as today", and exit criterion 3 asks for the cached hero before any request completes. Neither 3.4 nor 07 3.2 lists the change.
- Evidence: `src/main.js` lines 132 to 139 call `render()` on the saved copy, then `refresh()`. P1.9 item 2: "An entry without `fetched` ... counts each slot as fetched at `updated`"; item 3: "a stale slot reads as missing"; 02's catalog: `om-forecast` `staleMs` 24 h. With `wx` missing, `buildModel()` returns null and `render()` calls `renderNoData()` (`src/render/index.js` line 15). Every check that reads a saved copy saves it at the same pinned clock it reads it at (`timing.spec.js`, the upgrade test in `smoke.spec.js`, `update.spec.js`, P1.4's upgrade check), so none of them can see it.
- Fix: Keep the saved forecast on screen at start. Apply fetch-time staleness to `wx` only after a refresh in this start has failed, or show the old forecast with its age ("Saved Mon 6:41 AM") rather than No data. Add a smoke check that seeds a saved copy 48 hours older than the clock, holds every upstream request, and expects the saved verdict. If the owner wants No data after 24 hours offline, that is a Putney change to add to 07 3.2 and to the proof, with the owner's approval.

Applied (owner decision, 2026-10-21): P1.4 item 5.5 draws the saved copy at start whatever its age, and its browser checks gain the smoke check (a saved copy 48 hours older than the clock, every upstream held, the saved verdict expected); P1.5 item 2 labels it with its day ("Saved Mon 6:41 AM"); P1.9 item 3 makes a slot stale only when a refresh in this visit failed for it and its last good fetch is past `staleMs` (`staleSlots(..., app.errors, now)`), with a unit test, a mutation, and the held requests then aborted to show "No data."; the "No data." after a failed refresh of a forecast over 24 hours old is listed in the new 3.7 and in section 8, row 3.

#### R2. Several planned golden paths cannot match what the files hold

- Severity: blocker.
- Where: 3.2 (`check` matches each changed path against the id's patterns), 3.4 (`flowdays-noon`, `banks`, `not-checked`), P1.8 commit 4, P1.9, P1.11; `test/golden/digest.js` (`trimmed()`), `test/golden/capture.js` (`big()` and `keep()`).
- Problem: `diff` prints leaf paths ("the path diff finds a changed leaf"), and a pattern's `*` is one segment. Three planned ids name paths the files do not have at that depth. (1) `flowdays-noon` plans `parsers.flowDays.**`, but in every file it moves the whole `parsers` key is stored as a digest, `{ sha256, bytes }`, so the changed leaves are `parsers.sha256` and `parsers.bytes`. (2) `banks` plans `forecasts.*`, but each forecast is stored as `{ length, sha256 }`, so the leaves are `forecasts.<id>.length` and `forecasts.<id>.sha256`, one segment deeper. (3) `not-checked` plans `home.notChecked`, an added object whose leaves are `home.notChecked.innerHTML` and the rest; whether an added key is printed as its root or its leaves is not said. In each case `check` fails on the planned change, and rule 13 stops the step.
- Evidence: `parseFlowDays` changed in the worktree to place each day at noon New York time, then `npx vitest run test/golden.test.js test/golden-variants.test.js`: exactly the four files 3.4 predicts fail (`v-fall-back-d3-0700`, `v-spring-d1-1200`, `v-spring-d1-1200-tight`, `v-spring-d2-0900`), each on "parsers (stored as a digest; dump the case to see it in full)". In those four files `parsers` is `{"sha256":"1d77...","bytes":23430}` and the like; 75 of the 77 variant files store `parsers` as a digest. In `june-calm-1200-default.json`, `forecasts["2026-06-15-midday"]` is `{"length":8648,"sha256":"a91f8e5e..."}`.
- Fix: Define in 3.2 that `diff` prints leaves, also for added and removed keys, and write the patterns that way: `forecasts.*.*`, `home.notChecked.**`, `later.home.notChecked.**`, `status.partial.notChecked.**`, `status.partialAll.notChecked.**`. For a digested key, make `diff` expand it: capture the case at both revisions (as `dump` does) and diff the full values, so `flowdays-noon` can keep `parsers.flowDays.**`. Add a hashed leaf, a digest and an added object to `test/golden-check.test.js`.

Applied: 3.2 now says `diff` and `check` work on leaves, added and removed objects included; a `{ length, sha256 }` hash is two leaves one segment down; a `{ sha256, bytes }` digest's two leaves are covered by a pattern under its key in `check`, and `diff` expands it by dumping both revisions in a scratch worktree (CI runs `check` only). 3.4's patterns are now `forecasts.*.*` and `<path>.notChecked.**`, and P1.1's tests gain the added object, the hash and the digest.

#### R3. The config probe moves in P1.4 and P1.14, two steps that plan no golden change

- Severity: blocker.
- Where: P1.4 items 1, 2 and 6 ("Golden: none"), P1.14 item 3 ("Golden: none"), 3.4's last paragraph; `test/golden/probes.js` lines 21, 22 and 382 to 384; `test/golden/p-config.json`.
- Problem: The probe behind `p-config` records `routes` and `noRoute` by calling `parseRoute(h)` with hash strings, and `views` as `VIEWS.map(v => [v.key, v.name])`, unfiltered. P1.4 turns `parseRoute` into `parseRoute({ pathname, hash, search })` with a new return shape (today's function becomes `parseHash(hash, keys)`), so `routes` and `noRoute` change or throw. P1.14 adds `{ key: 'tide', ... }` to `VIEWS` after Wind, so every `views` entry from index 2 on moves. Neither step lists `test/golden/probes.js`, P1.4's commit (a) edits only the capture, and 3.4 says a golden move in either step is a finding, so both steps stop under rule 13. P1.8 has a smaller trap of the same kind: the probe records `GAUGE_FLOW` and `GAUGE_TEMP` from `slot('river').params.flow` and `.temp`, so a latest binding that lists each gauge once must keep those two fields.
- Evidence: `probes.js` line 383 `routes: Object.fromEntries([...].map(h => [h, parseRoute(h)]))`, line 384 `noRoute: [parseRoute(undefined), parseRoute(null)]`, line 382 `views: VIEWS.map(v => [v.key, v.name])`, line 374 `GAUGE_FLOW: slot('river').params.flow, GAUGE_TEMP: slot('river').params.temp`. `p-config.json` holds `views` with nine entries and the routes as `{ name, day }`.
- Fix: Put `test/golden/probes.js` in P1.4's commit (a): `routes` and `noRoute` call `parseHash(h, keys)` with Putney's tab keys, keeping the `{ name, day }` shape and today's answers for `undefined` and `null`, and `views` lists `VIEWS.filter(v => !v.when || v.when(PUTNEY))`, so Tide never reaches it. Say in P1.8 that `latest.bind` keeps `flow` and `temp` and only the URL lists each gauge once.

Applied: P1.4 lists `test/golden/probes.js`. Its commit (a) filters the probe's `views` by `when(PUTNEY)` (which passes against the unchanged `src/`), and commit (b), where `parseHash` first exists, moves `routes` and `noRoute` to `parseHash(h, keys)` with the same shape and answers. P1.8 commit 3 says `latest.bind` keeps `flow` and `temp`. P1.14 notes `p-config` does not move.

#### R4. `update.spec.js` serves JSON as `application/octet-stream`, so P1.4's content-type rule fails it

- Severity: blocker.
- Where: P1.4 item 3 (`fetchRecord`: "A 200 with a JSON content type is `{ record }`. Anything else ... checks the index"), P1.4's browser checks ("`update.spec.js` passes"); `test/browser/update.spec.js` (its own server and `TYPES`); CLAUDE.md hard constraints.
- Problem: `update.spec.js` serves `dist/` from its own Node server, whose type table has no `.json`, so `locations/putney-landing.json` and `locations/index.json` come back as `application/octet-stream`. The service worker stores and replays that header. `fetchRecord()` then reads the record as not JSON, the index as unreadable, and returns `failed`: the page shows "Could not load this location", `ready()` times out, and the spec fails. P1.4 does not list the file. The same rule makes every location fail on any static host that serves `.json` as `text/plain` or `application/octet-stream`, against CLAUDE.md's "plain static files in `dist/` that any static host can serve".
- Evidence: `update.spec.js`: `const TYPES = { '.html': ..., '.js': ..., '.css': ..., '.svg': ..., '.png': ..., '.woff2': ..., '.webmanifest': ... }` and `'content-type': TYPES[extname(file)] || 'application/octet-stream'`. Both builds it serves are built from the working tree, so from P1.4 both need the record file.
- Fix: Decide by the body, not the header: parse it, and accept it as a record when `v` is 1 and `slug` is the slug asked for; an HTML fallback fails to parse and goes to the index check. Unit test a JSON body with `application/json`, `text/plain` and `application/octet-stream`, and an HTML body with 200. Add `'.json': 'application/json'` to the spec's table too, and list `update.spec.js` in P1.4's files.

Applied: P1.4 item 3 judges a record by its body (`v` 1 and the slug asked for), never the content type; its tests cover `application/json`, `text/plain`, `application/octet-stream`, another slug's record and an HTML 200; a mutation accepts only a JSON content type; `update.spec.js` is in P1.4's files with `'.json'` in `TYPES`. P1.2 item 3 and section 10 item 9 now say the body is checked.

#### R5. P1.10's flow-limit check cannot see the waterway, where all four flow bindings live

- Severity: blocker.
- Where: P1.10 item 4 ("`validateLocation` allows it and refuses a flow limit with no flow binding, or a `basis.flow` naming another binding"); `src/location.js` `validateLocation(rec)` and `resolveSources()`; P1.2's `collectLocations`.
- Problem: `validateLocation` takes the record alone. Putney, Hanover, Boathouse Row and Thompson Boat Center all inherit their flow row from the waterway file, so their own `sources` have no flow binding while their `thresholds` carry flow limits. Written as P1.10 says, the check refuses Putney's record, `collectLocations` throws, and the build fails; the `basis.flow` check has no binding to compare with either.
- Evidence: the roles in `data/locations/putney-landing.json` `sources` are `alerts`, `obs` and `water_temp`; `flow` and `flow_forecast` are in `data/waterways/connecticut-river-vernon-pool.json`. 4.4, 4.5 and 4.8 put the three new flow rows in their waterway files the same way.
- Fix: Give the check the waterway: `validateLocation(rec, { waterway })` runs these two rules on `resolveSources(rec, waterway)`, and `collectLocations` passes it. Test both rules with a flow row in the record and with one inherited from the waterway.

Applied: P1.2's `collectLocations` calls `validateLocation(rec, { waterway })`; P1.10 item 4 runs the two basis rules on `resolveSources(rec, waterway)`, with tests for a row in the record and one inherited, and a mutation that checks the record's own sources.

#### R6. The screenshot proof cannot hold: every shot gains the note or the Privacy link

- Severity: blocker.
- Where: 3.6, P1.20 item 3, P1.6 items 2 and 4, P1.16 item 6; `test/browser/screens.spec.js`; 07 6.6.
- Problem: 3.6 expects each `@visual` difference to be the chevron, the bank labels or the footer credits. (1) `screens.spec.js` loads `/` and `/#<tab>` with empty storage. From P1.6, `/` with nothing stored inside the window shows "Not your water? Pick a location." above the hero, which moves everything under it in the 16 home and row shots. P1.6 moves the smoke specs to `/putney-landing` but leaves this spec. (2) P1.16 adds a "Privacy" link to the footer, and every shot is `fullPage: true`, so all 48 differ there. 07 6.6 puts the footer links line in phase 2 and says "Putney's footer does not change" beyond the credits; 07 3.2 does not list the link.
- Evidence: `screens.spec.js` `page.goto('/')` and `` page.goto(`/#${tab}`) ``, `shot = { fullPage: true, ... }`; the window ends 2027-03-01 (section 2, row 4) and the shots are pinned to 2026-06-15 and 2026-10-14.
- Fix: In P1.4 or P1.6, `screens.spec.js` loads `/putney-landing`, as 01 16.5 asks ("`/putney-landing` ... identical to the pre-phase-0 screenshots"); the `30fef7a` baseline at `/` draws the same page. Either list the Privacy link as an expected difference in 3.6, P1.20 and 07 3.2 with the owner's approval, or wait for phase 2 as 07 6.6 says and link `/privacy` from the install and Settings text in the meantime.

Applied (owner decision, 2026-10-21, following 07 6.6): P1.4 item 12 makes `screens.spec.js` load `/putney-landing` and `/putney-landing#<tab>`; P1.16 item 6 adds no footer link and ends the `#install` note and the Settings intro note with "How RoWhether counts app opens." linked to `/privacy`, with a smoke check; 3.6 says no shot gains the note or a link.

#### R7. The upgrade proof starts from a build no Putney phone runs

- Severity: blocker.
- Where: P1.20 item 7 ("An installed copy of `30fef7a`, updated to HEAD"); exit criterion 3; 3.6.
- Problem: Phase 0 is not in production. Every installed Putney app runs the production build, `2b7ef06` (the tree `origin/master` serves), with only `putney-rowing-*` keys and a service worker without `skipWaiting`. `30fef7a` already has the phase 0 keys and the takeover fix, so an upgrade from it skips the migration and the old worker that real phones go through. Worse, a copy of `30fef7a` installed fresh never writes `rowhether-last-v1` (its `migrateStorage()` sets it only when a `putney-rowing-*` key exists), so after the update `/` opens Putney with "Not your water? Pick a location." and stays at `/`, and the proof fails on a state no real phone is in. The smoke upgrade check seeds the old keys but blocks service workers, so the first start's record file never comes from a precache there.
- Evidence: `git log --oneline -1 origin/master` is `8c9c36a Merge pull request #7 from NeverNathaniel/dev`, and `2b7ef06` is the tip of what it merged; P0.14 item 7 upgraded from `2b7ef06` (`phase-0-progress.md`, "Proof 7, the upgrade: a build of `2b7ef06`").
- Fix: P1.20 item 7 upgrades from `2b7ef06` to HEAD, as P0.14 did, and also from `30fef7a`. It checks that the first start after the takeover reads `locations/putney-landing.json` from the new worker's precache with the network off.

Applied: P1.20 item 7 upgrades from `2b7ef06` first, checks the record file comes from the new worker's precache with the network off, then upgrades from `30fef7a`, where `/` showing Putney with the pick note is the expected result. Section 8, row 3 names both.

## Major

#### R8. The observation's own reading age hides Keene during ordinary feed delays

- Severity: major.
- Where: P1.9 item 3 ("an `obs.t` over 3 hours old hides the "Measured at" fact"), 3.4 `stale-sources`; `src/render/now.js` lines 105 to 111.
- Problem: 02 and 08 K9 define `staleMs` as the age of the last good fetch ("after this, the last good value is dropped and the slot reads as missing", 02 line 307). The plan adds a second rule on the reading's own time and cites the same sections. The NWS observation feed often runs hours behind, so Putney's "Measured at Keene" fact would disappear on ordinary days, a change 07 3.2 does not list. Today the fact stays, with its age in the note.
- Evidence: at 03:27 UTC on 2026-10-20, `https://api.weather.gov/stations/KEEN/observations/latest` returned `2026-10-20T00:10:00+00:00`, 3 hours 17 minutes old, and `/stations/KEEN/observations?limit=12` had nothing newer. KPHL, KORH, KSAC, KDCA and KTTN also stopped at 00:10 and KLEB at 00:00. Under the plan's rule every one of the seven locations would have lost its observation fact at that moment.
- Fix: Drop the reading-age rule and keep 02's fetch-time staleness. If the owner wants a reading age, set it well past the feed's usual lag (24 hours, say), keep the fact with its age, and list the change for Putney in 07 3.2 and 3.4.

#### R9. Code that assumes a location is not made safe for a switch, or for pages with none

- Severity: major.
- Where: P1.4 items 4 and 5, P1.6 item 8; `src/main.js` lines 45 to 60 (`busy`) and 118 to 121 (the return to the tab and the 10 minute timer).
- Problem: (1) `refresh()` returns at once while another refresh runs. P1.4 adds a token so a slow answer for one place is dropped, but not the `busy` flag. Pick a second location while the first one's refresh is in flight and the second one's refresh returns at once; the first one's answer lands, is dropped, and nothing fetches the second until the 10 minute timer or a return to the tab. (2) On the not-found view, the "Could not load" state (P1.4) and the picker page (P1.6), `app.loc` is null. The return-to-tab handler calls `refresh()` whenever `app.updated` is null, and `fetchAll(null)` throws inside `bindingsFor`, after `busy` was set and before it is cleared, so every later refresh returns at once. A mistyped shared link, a switch to another app and back, then a pick from the prefilled search leaves the new location loading for good. (3) `suggestContext()` (`src/suggest.js` line 38) reads `app.loc.course.heading`, so the suggestion form throws on the picker page and the not-found view, which are where P1.6 and P1.7 offer "Suggest a location". P1.4 item 10 adds `location: app.loc?.slug ?? null` and leaves that line.
- Evidence: `src/main.js` line 47 `if (busy) return;`, line 52 `const { data, errors } = await fetchAll(app.loc);`, `busy = false` only at line 60. `bindingsFor(null)` throws "Cannot read properties of null (reading 'sources')" (run in Node at `d625fa9`). P1.6's browser checks pick locations with fixtures that answer at once, so they cannot see (1); no check returns to the tab on a page with no location.
- Fix: P1.4: `refresh()` does nothing without `app.loc`; the in-flight flag belongs to a token, so a switch starts its own refresh (or one queued to run when the old one ends); `busy` is cleared in a `finally`. `suggestContext()` sends `settings: null` and `location: null` with no location. Checks: hold the first location's upstream answers, switch, and expect the second location's requests; on `/no-such-place` dispatch `visibilitychange`, then pick a location from the search and expect its requests and a clean console; a unit test of `suggestContext()` with `app.loc` null.

#### R10. The main JS row is very likely missed; the planned growth is about half of what a prototype measures

- Severity: major.
- Where: 7.1, 7.3, P1.9 (+450 B); 08 11.2 (46,700 B).
- Problem: 7.1 ends at 46,695 of 46,700 B, 5 B of room at the end of a phase built on estimates. One estimate checked by prototype comes out near double. 7.3's levers are small next to that (the Settings field builder, the copy of three screens, and three copies of the one-line `isSet`). The plan's first saving holds: the records leave the main script.
- Evidence: `npm run build && node scripts/budget.mjs` at `d625fa9`: main JS 43,505 B. With `src/putney.js` importing nothing (the records out): 42,325 B, 1,180 B less (the plan says 1,191). A terse prototype of part of P1.9 (`staleSlots` with the nine limits, `flowForCall`, `waterSource` with the typical value, `notChecked`, `notCheckedText` with its ages, and item 8's nine sentences, wired from `render()`): 44,360 B, 855 B more, against 450 planned, and without the `fetched` cache, the `stale` model input, the alerts still in force, the hero, overnight hero and share wiring, or the view branches that use the sentences. A structural lever the plan does not list: with the nine detail views out of the main script, it is 26,617 B, 16,888 B less.
- Fix: Before batch 2, prototype P1.9, P1.13 and P1.14 and replace their estimates. Add to 7.3, as the lever before a stop: load the detail views with `import()` and precache them, as P1.14 already does for Tide (`load`, "Loading." in `renderDetail()`), starting with the views least used at first paint. If the owner prefers a raise, set it now in 08 11.2 rather than at a stop.

#### R11. A `none` course and a lake with a heading still draw river words, `undefined°` and `NaN`

- Severity: major.
- Where: P1.13 items 4 to 6; `src/render/forecast.js` lines 21, 85 and 86, `src/render/detail/wind.js` lines 27 to 37, 74, 107 and 121, `src/render/now.js` lines 48 to 53.
- Problem: P1.13 plans the Now compass and its caption for a `none` course, the Wind fact note and one sentence of the Wind tab's How this works. Every other reader of `m.loc.course.heading` is left. At Lake Carnegie the full forecast for every period says "River runs --, upstream heading undefined°.", the Wind tab draws its arrows with `rotate(NaN)`, its Course column says "Cross" for every hour with 3 mph or more (`courseWord()` compares `NaN`), and How this works says "The course heading is undefined°, set in Settings." At Lake Quinsigamond and Lake Natoma, where the lake has a heading course, the Now caption and every full forecast say "River runs NNW, upstream heading 166°." The planned browser checks look at the compass and the Wind fact only, so none of the text would fail them; the `NaN` would show only if Chromium logs the SVG attribute error the console check sees.
- Evidence: in the worktree, the golden capture run on Putney's record with `waterType: 'lake'` and `course: { kind: 'none' }` (and once with `{ kind: 'heading', heading: 166 }`), and its output searched: `views/wind/*.html` hold "heading is undefined°" and `NaN`; `home/compassCap` and `forecasts/2026-06-15-midday.html` hold "River runs --, upstream heading undefined°"; with the heading course they hold "River runs NNW, upstream heading 166°".
- Fix: Add to P1.13: the full forecast caption and compass follow the Now compass's rules (ellipse and "Wind from SW across about 1.5 mi of open water." for a `none` course; "Lake runs ..." or no run sentence for a heading course on still water, with "relative to the lake" in the `aria-label`); the Wind tab draws no arrows and no Course column without a heading, and its How this works names no heading. Add a unit test that renders every view and forecast for the three lake records and finds no `undefined`, `NaN` or "River runs".

#### R12. `privacy.html` splits the main stylesheet, and the CSS budget then measures the small half

- Severity: major.
- Where: P1.16 items 4 and 5 (`privacy.html` "with the app's styles and fonts", a second Vite input); `scripts/budget.mjs` `mainFiles()`; 7.1's CSS column; exit criterion 5.
- Problem: With a second HTML input that links the app's stylesheet, Vite moves the shared CSS into its own file, and `index.html` links two stylesheets. `scripts/budget.mjs` takes the first `<link rel="stylesheet">` only, so from P1.16 the CSS line measures a few hundred bytes and can never fail. The page also gains a second stylesheet request on the path to the first hero.
- Evidence: in the worktree, a `privacy.html` linking `/src/styles/tokens.css` and `/src/styles/app.css`, added as `build.rolldownOptions.input: { index: 'index.html', privacy: 'privacy.html' }`: `dist/index.html` links `assets/index-Yu488gou.css` (1.08 kB) and `assets/app-BJbU2q1q.css` (24.54 kB), and `node scripts/budget.mjs` prints "ok CSS 437 B of 6,100 B".
- Fix: `scripts/budget.mjs` sums every stylesheet `index.html` links and every script it loads at start, and fails when there is more than one of either unless `budget.json` names it. Build `privacy.html` so the app's CSS stays one file: its own small stylesheet, or one `<link>` to the same built file the app uses. P1.16 lists `scripts/budget.mjs` and checks `dist/index.html` still links one stylesheet.

#### R13. Section 9 cuts phase 1 scope that 09 lists, with no owner decision on record

- Severity: major.
- Where: section 9; 09 phase 1 "What ships" and owner tasks; HANDOFF "Phase 1 decisions" and "Waiting on the owner"; README's Phase 1 rows.
- Problem: 09 phase 1 ships "A local discovery script (08 5.6), US tides, currents and the NWPS tide forecast, marine zones, GloFAS and marine fallbacks, place search, the attribution line, staleness per source, and USGS v1", and 01 section 15 "including polar days". Section 9 moves the discovery script, every CO-OPS adapter, tidal streams, fallback bindings, GloFAS and marine water temperature, the level role, polylines, the high-latitude rules, `attributionFor` and per-slot refresh pacing to phase 3, 4 or 7. The reasons are sound, but the owner accepted README's Phase 1 rows, and none of these is a row. 09 also gives the owner a task tied to the discovery script (the User-Agent contact). Phase 2 and 3 plans read 09 for what exists.
- Evidence: 09 lines 68 and 69; HANDOFF "Phase 1 decisions (owner, 2026-10-20): build with the recommendation of every Phase 1 row in `README.md`"; README lines 87 to 104, the Phase 1 rows, list none of the deferred items.
- Fix: Before batch 3, put the deferral list to the owner as one decision (a README row or a HANDOFF line), and on acceptance move each item into 09's later phase sections so the phase 2 and 3 plans pick them up.

#### R14. A record saved in the browser is never replaced unless its `revision` changes, and the plan never changes one

- Severity: major.
- Where: P1.4 items 3 and 5 (`cachedRecord(slug)` first; "A record fetched more than 24 hours ago is fetched again in the background. A changed `revision` saves it"); P1.2 (`summaries`, "`revision` default 1"); P1.5, P1.8, P1.9 and P1.10, which edit Putney's record.
- Problem: From P1.4 the app reads a location from `rowhether-loc-v1:<slug>` before the precached file, and replaces it only when a background fetch finds a different `revision`. No record has a `revision` (it defaults to 1), and no step or rule bumps it when a record or its waterway changes. A browser that saved Putney's record at P1.4 keeps the old credits after P1.5, the point alerts after P1.8, `maxAgeH` null after P1.9 and no flow basis after P1.10, for good. After phase 1 ships, an owner's fix to a curated record (a gauge id, an alert zone, a limit) never reaches an installed phone, although the new file is in its precache.
- Evidence: `data/locations/putney-landing.json` has no `revision` key; P1.2 item 1 gives `revision` default 1; P1.4 item 3 accepts a stored record whenever its `v` is 1; P1.4 item 5.6 saves a refetched record only on a changed `revision`. 01 2.1 says `revision` "Starts at 1, plus 1 on every applied change", and 01 7.4 step 3 refetches "at most once a day" and stores the record only "If `revision` changed", so the plan follows the app side of the rule and drops the data side.
- Fix: Every step that edits a record or its waterway bumps the record's `revision` (Putney to 2 in P1.2, and on through P1.10), and a check like `golden.mjs check` fails a commit that changes a file under `data/` without raising the revision of each record it affects. After the first render the app compares the stored record's `revision` with the precached `locations/index.json` and reopens the location when they differ, so a deploy reaches an installed phone on its next start, not a day later. Add a unit test for a stored record with an older revision, and a browser check that a rebuilt record with new credits shows them after one reload.

#### R15. Binding county codes applies a storm-based warning to the whole county

- Severity: major.
- Where: P1.8 commit 1 (`zones:` refs to `alerts/active?zone=`), the alert zones in 4.1 and 4.3 to 4.9, README row 6; `src/sources/nws.js` `alerts`.
- Problem: Severe thunderstorm, tornado, flash flood and special marine warnings are drawn as polygons, but their `affectedZones` are the whole county or marine zone. `?point=` returns such a warning only when its polygon covers the point; `?zone=` returns it for every spot in the county. From P1.8, a severe thunderstorm warning for a storm 30 miles away in northern Windham County or eastern Cheshire County makes Putney Stay off, which is a change to Putney's verdict that 07 3.2 does not list. 01 6.1, 02 and README row 6 chose the zones to cover both banks and never weigh this. The same holds for the six test locations and ANZ535.
- Evidence: `https://api.weather.gov/alerts?event=Severe%20Thunderstorm%20Warning&limit=3`, read 2026-10-20: the warning sent 2026-10-19 20:11 UTC for Doña Ana County, NM has `affectedZones` `["NMC013"]`, the whole county, and a polygon spanning about 0.24° of longitude by 0.14° of latitude.
- Fix: Keep the zone list, and for an alert that has a geometry, apply it to the location only when the polygon contains the dock point (or comes within a set distance of it); zone-only products apply as listed. Put the rule in P1.8 with a test on a recorded polygon alert, and tell the owner, since row 6 was accepted without it.

## Minor

#### R16. P1.11's share check expects the wrong time

- Severity: minor.
- Where: P1.11 browser checks ("with `America/Chicago` the text reads "Putney Landing rowing, 11:57 AM Eastern: ...""); `src/share.js` `shareText(now = Date.now())`.
- Problem: The smoke clock is 12:00 Eastern and the click handler calls `shareText()` with `Date.now()`, so the text starts "Putney Landing rowing, 12 PM Eastern:". 11:57 AM is the fixtures' fetch time, shown in "Updated 11:57 AM". A builder who writes the literal gets a failing check, and the quick way to make it pass is to share the fetch time, which is wrong.
- Evidence: `test/golden/june-calm-1200-default.json` `share`: "Putney Landing rowing, 12 PM: Go. Wind 7 mph from SSW, gusts 13. ..."; `status.header.fresh`: "Updated 11:57 AM".
- Fix: Expect "Putney Landing rowing, 12 PM Eastern: " followed by the rest of the golden `share` text.

#### R17. Two small claims about the golden files are wrong

- Severity: minor.
- Where: 3.4 `alerts-zones` and `usgs-v1` ("the 19 main cases and the non-lean variants"); 3.4 `not-checked`.
- Problem: (1) Every variant is lean, and only the 19 main cases record `sources` (`if (!lean) out.sources = ...` in `capture.js`), so the files list is the 19 main cases. (2) `not-checked` writes `#notChecked` from `renderHero()` and the overnight hero only. `renderNoData()` must hide it too, or a line from the last model stays on screen when the forecast goes missing; then `status.noDataAll`, `status.noDataForecast`, `status.noDataQuiet` and the no-model files' `home` move as well, outside the planned paths.
- Evidence: `VARIANT_CASES` in `test/golden/capture.js` builds every variant with `lean: true`; no `v-*` file has a `sources` key. `renderNoData()` (`src/render/hero.js`) writes `#verdict`, `#why` and `#holds` and leaves the other hero lines.
- Fix: Name the 19 main cases for both ids. Add to P1.9 that `renderNoData()` hides `#notChecked`, and add those paths to `not-checked`.

#### R18. P1.8's marine level rule misstates today's levels and leaves stronger warnings below a Small Craft Advisory

- Severity: minor.
- Where: P1.8 commit 2 ("'Winter Storm Warning', 'Ice Storm Warning' and 'Tropical Storm Warning' are level 2 either way"); `src/sources/nws.js` `alertLevel`.
- Problem: Today "Tropical Storm Warning" is level 1, so a match on "Storm Warning" moves it to 2, a Putney change the plan says does not happen. With exactly the four names of README row 11, "Hurricane Force Wind Warning" (a marine warning above Storm Warning), "Hurricane Warning" and "Storm Surge Warning" stay at 1, below a Small Craft Advisory at 2, at the one tidal location.
- Evidence: `alertLevel()` at `d625fa9`: Tropical Storm Warning 1, Winter Storm Warning 2, Ice Storm Warning 2, Storm Warning 1, Gale Warning 1, Small Craft Advisory 1, Special Marine Warning 1, Hurricane Warning 1, Storm Surge Warning 1, Hurricane Force Wind Warning 1.
- Fix: Match whole event names from a list in `nws.js`. Ask the owner whether the hurricane and storm surge warnings join the list; if "Tropical Storm Warning" moves to 2, name it in `marine-alerts` and in the probe.

#### R19. One P1.5 mutation cannot fail any check

- Severity: minor.
- Where: P1.5 mutations ("`renderPlace()` called from `render()` (the capture would see it ...)").
- Problem: The capture never calls `render()`. It imports `renderHeader`, `renderHero`, `renderAlerts`, `renderNow`, `renderDays` and the views and calls them itself, and the parity spec compares only the elements the golden files list, which do not include `#locName` or `#sub`. The mutation survives, and rule 12 then asks the builder for a new check that the plan does not describe.
- Evidence: the imports at the top of `test/golden/capture.js` (no import from `src/render/index.js`).
- Fix: Mutate `renderHeader()` to call `renderPlace()` instead (the capture does call it, so `status.header` and `home` move outside `saved`), or count `renderPlace()` calls in a browser check across a refresh.

#### R20. CLAUDE.md stays at phase 0 until P1.20, but every builder reads it first

- Severity: minor.
- Where: rule 1 ("read `CLAUDE.md`"), P1.20 item 1; CLAUDE.md "Hard constraints" and "Location and endpoints".
- Problem: The owner approved the phase 1 edits to CLAUDE.md (README row 16), but the plan applies them all in P1.20. Until then a builder reads "The service worker precaches the app shell only" while P1.2 precaches the location files, the point alerts URL and the v0 USGS URLs while P1.8 changes them, and "Putney" as the app's subject. A builder that treats CLAUDE.md as overriding may stop on the conflict, as rule 13 tells it to.
- Evidence: CLAUDE.md: "The service worker precaches the app shell only. It does not cache API responses."; "NWS alerts: `https://api.weather.gov/alerts/active?point=42.9607,-72.5219`".
- Fix: Apply each approved CLAUDE.md sentence in the step that makes it true (the service worker sentence in P1.2, the app name and "Saved" in P1.5, the endpoints in P1.8), and keep P1.20 for the code map and the test list.

#### R21. Putney changes outside 07 3.2's list are not collected anywhere

- Severity: minor.
- Where: exit criterion 2 ("Putney looks as before except for the changes 07 3.2 lists"); P1.5 items 1 and 6 (install bar, dialog and `#setInstall` copy from 07 6.4), P1.10 items 1 to 3 (placeholders, "Your setting" lines, the intro note and "Use location defaults" from 01 11.6), P1.16 item 6 (the Privacy link); R1, R8 and R15.
- Problem: Each of these follows a spec section, but 07 3.2's phase 1 row lists five changes, and 07 3.2 even puts "Saved in this browser for Putney Landing" in phase 2 while 01 11.6 puts it in phase 1. The plan never lists the extra changes in one place, so the owner cannot see what a Putney regular will notice, and the final proof checks only the five.
- Evidence: 07 3.2's phase 1 row; 01 11.6 ("The intro note: ... Saved in this browser for Putney Landing."; "Reset defaults becomes "Use location defaults""); 07 6.4's install copy table.
- Fix: Add a table to section 3 of every Putney-visible change by step, including those with no golden file, and update 07 3.2's phase 1 row from it with the owner's approval, so exit criterion 2 names the real list.

## Checked and well covered

Not findings. The builders do not need to redo these.

- The plan's code references, at `d625fa9`: `.github/workflows/ci.yml` line 22; `test/golden/harness.js` line 60 and the "is not in write mode" test; `test/sources.test.js` lines 16, 316 and the point check near 503; `test/format.test.js` line 5; `parity.spec.js` lines 25 and 94; `fixtures.js` line 76; `smoke.spec.js` lines 262 and 312; `timing.spec.js` line 82; `src/share.js` line 22; `src/render/hero.js` line 12; `src/route.js` line 6; `src/state.js` line 32; `src/settings.js` lines 8 and 10; `src/sources/nws.js` line 37; `src/sources/usgs.js` lines 3 and 31; `src/render/parts.js` lines 27 to 30; `src/format.js` line 60; `index.html` line 13; `test/golden/probes.js` line 242 (the `parseFlowDays` calls are on 311, not 310); `test/fixtures/golden.js` line 453; `test/fixtures/variants.js` lines 107 and 127. Vite 8.3.1's `htmlFallbackMiddleware` serves `<path>.html` at line 16940; Workbox's `cleanURLs` defaults to true; wrangler 4.149.0's schema allows `analytics_engine_datasets` and `analytics` at the top level and in `previews`; `jose` 6.2.12 is the latest release. Every importer of `src/data.js` that 3.1 names is the full list (`test/data.test.js` imports only `fetchAll`).
- The starting numbers: 700 unit tests; main JS 43,505 B, CSS 6,001 B, HTML 3,613 B, precache 275.59 KiB in 17 entries, 12 distinct.
- 3.1's reason to keep the per-key comparison: a write run against a fresh capture finds exactly 20 files that differ as text (the 19 main cases and `p-config`) and none by value.
- `check` starts green: no non-merge commit since `c7967a6` touches a golden JSON file.
- `flowdays-noon` moves exactly the four variants 3.4 names, and `p-parsers` does not move (R2 is about how the paths are written, not which files move).
- The records leave the main script: 1,180 B measured against 08 11.2's 1,191 B.
- Existing installs: production phones hold only `putney-rowing-*` keys, and `migrateStorage()` sets `rowhether-last-v1` whenever one of them exists, so from P1.4 on `/` opens Putney with no pick note and the saved settings, plan and install choice (R7 is about the proof, not this path).
- Live checks of section 4 on 2026-10-20: the six dock points resolve to the offices, grids, zones and time zones given (BTV 125,26; PHI 49,79; BOX 49,94; STO 51,69; LWX 96,71; PHI 65,99), and Putney's to GYX 3,13, NHZ011, NHC005. All 22 land and county zones exist with the names and offices given, and ANZ535 is "Tidal Potomac from Key Bridge to Indian Head MD" (LWX). Putney's four-zone and Thompson's five-zone alerts requests answer 200 with `access-control-allow-origin: *`; the second returned the Small Craft Advisory for ANZ535 and ANZ536. Gauges: USGS-01144500 has 00060 and 00065 and no 00010; USGS-01474500 has 00060 and 00010; USGS-11446500 has 00010; USGS-01646500 has five 00010 series, four last reported in 2019. NWPS: WLBN3, PADP1 and BRKM2 name usgsIds 01144500, 01474500 and 01646500; GTND2 forecasts "Tide Height" in ft, 72 points, highs to 5.9 and lows to 2.4. Stations KLEB, KPHL, KORH, KSAC, KDCA and KTTN report wind; KMHR's latest was 18:35 UTC on 2026-10-19. The flow statistics of USGS-01474500 and USGS-01144500, recomputed from 2016-01-01 to 2026-10-18 with linear interpolation, equal section 4's p50, p65, p88, p90 and p95, and give the same limits and steps. The geocoding host answers with `access-control-allow-origin: *`.
- Water types and banks: the Potomac at Georgetown is tidal and bound to the gauge above the head of tide; Lake Natoma is a reservoir between Folsom and Nimbus dams; Quinsigamond and Carnegie are lakes; the two river pools are rivers like Putney's. Hanover's and Thompson's written banks follow Putney's rule (left and right facing upstream), and the generated ones in 4.5 to 4.7 are the heading plus 90°.
- Hard constraints: nothing loads from a CDN at run time; every new browser host is keyless with `access-control-allow-origin: *`; section 1, P1.2 (citing 08 8.4) and P1.20's CLAUDE.md sentence all say the service worker precaches the location files; rule 8 keeps every storage access in try/catch; `dist/` stays static (R4 is about one host's content type).
- README's 18 Phase 1 rows each appear in section 2 with the accepted answer, and placeholders are used only for owner facts.
- Batches hold 5, 5, 5, 4 and 1 steps, and each ends at a state its "Proves at its end" line can check.
