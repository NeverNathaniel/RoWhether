# Phase 1 plan review

Reviewed `docs/full-app/phase-1-plan.md` (the 20 steps in 5 batches) on `dev-full-app` at `d625fa9`, the plan's last commit. The code has not changed since `30fef7a`, the commit the plan was written against (`git diff --stat 30fef7a d625fa9` lists only `README.md` and the plan). Started Tue Oct 20 03:27 UTC 2026 (`date -u`).

The question for each step: would it fail as written, break an existing install, change Putney in a way 07 3.2 does not list, or miss an exit criterion of 09 phase 1. Severity: blocker means a step cannot finish as written, or Putney regulars lose something 07 3.2 and the exit criteria promise; major means a real gap a builder will hit or a check that cannot hold; minor means small.

How the evidence was made: a git worktree of `d625fa9` in the scratchpad with `node_modules` linked, the code changed there as a step would change it, then `npm test` (700 tests at `d625fa9`), `npm run build` and `node scripts/budget.mjs`. Live requests from this container on 2026-10-20 between 03:15 and 03:40 UTC, with the User-Agent `RoWhether-plan-review/1.0 (+https://rowhether.com)` and no personal data.

Status: in progress

Count so far: 1 blocker, 6 major, 2 minor.

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
- Fix: In P1.4 or P1.6, `screens.spec.js` loads `/putney-landing` (the `30fef7a` baseline at `/` draws the same page). Either list the Privacy link as an expected difference in 3.6, P1.20 and 07 3.2 with the owner's approval, or wait for phase 2 as 07 6.6 says and link `/privacy` from the install and Settings text in the meantime.

#### R5. `refresh()` is not made safe for location changes

- Severity: major.
- Where: P1.4 items 4 and 5, P1.6 item 8; `src/main.js` lines 45 to 60 (`busy`) and 118 to 121 (the return to the tab and the 10 minute timer).
- Problem: (1) `refresh()` returns at once while another refresh runs. P1.4 adds a token so a slow answer for one place is dropped, but not the `busy` flag. Pick a second location while the first one's refresh is in flight and the second one's refresh returns at once; the first one's answer lands, is dropped, and nothing fetches the second until the 10 minute timer or a return to the tab. (2) On the not-found view, the "Could not load" state (P1.4) and the picker page (P1.6), `app.loc` is null. The return-to-tab handler calls `refresh()` whenever `app.updated` is null, and `fetchAll(null)` throws inside `bindingsFor`, after `busy` was set and before it is cleared, so every later refresh returns at once. A mistyped shared link, a switch to another app and back, then a pick from the prefilled search leaves the new location loading for good.
- Evidence: `src/main.js` line 47 `if (busy) return;`, line 52 `const { data, errors } = await fetchAll(app.loc);`, `busy = false` only at line 60. `bindingsFor(null)` throws "Cannot read properties of null (reading 'sources')" (run in Node at `d625fa9`). P1.6's browser checks pick locations with fixtures that answer at once, so they cannot see (1); no check returns to the tab on a page with no location.
- Fix: P1.4: `refresh()` does nothing without `app.loc`; the in-flight flag belongs to a token, so a switch starts its own refresh (or one queued to run when the old one ends); `busy` is cleared in a `finally`. Checks: hold the first location's upstream answers, switch, and expect the second location's requests; on `/no-such-place` dispatch `visibilitychange`, then pick a location from the search and expect its requests and a clean console.

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
