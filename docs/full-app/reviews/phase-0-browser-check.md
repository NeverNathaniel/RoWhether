# Phase 0 browser check

A read-only browser check of RoWhether against the `CLAUDE.md` Testing checklist, run on `dev-full-app` at commit `276969d` in Chromium 141 (build 1194, Playwright 1.56.1). The checks ran on Sun 2026-10-18 and this file was written at 23:13 UTC (`date -u`). It is step 10 of `HANDOFF.md` and P0.14 item 6, run by session 01PLGfvc in the container that made the P0.2 screenshot baseline. It is input for session 015Sq3rx's fix pass.

Three checkers each took part of the checklist: the home screen and its actions, the tabs, and the install bar with the upgrade from the production build. Each served the prebuilt `dist` of `276969d` with `vite preview`, drove it with Playwright scripts, and used the golden fixtures from `test/browser/fixtures.js` unless the check needed the live APIs. Nothing in the repo was edited, built or written by the checks. The scripts live in the session scratchpad, outside the repo, and are not committed.

WebKit is not installed in this container. The WebKit half of the checklist is for the owner's Mac with `WEBKIT=1`.

Status: first run on 276969d (68 pass, 2 fail, 4 not run). Rerun on `581f637`, the head of `dev-full-app` after the fixes, on 2026-10-19 at 14:46 UTC (P0.14 item 6 and 7, session 015Sq3rx): B1 and B2 pass, and every area that passed on `276969d` passes again. 50 of 51 entries pass, none fail, and 1 is not run (a live load, below). See "Rerun on 581f637".

## Rerun on 581f637

The same checklist, on a build of `581f637` served with `vite preview` (the source is the same as `ec7141e`; only `CLAUDE.md`, `budget.json` and the docs changed since). Chromium 141 (build 1194, Playwright 1.56.1), the golden fixtures from `test/browser/fixtures.js`, the page clock pinned with `page.clock.install`, the machine zone UTC. New Playwright scripts outside the repo, in the session scratchpad, not committed, as for the first run. Nothing in the repo was edited by the checks.

| Area | Entries | Pass | Fail | Not run |
| --- | --- | --- | --- | --- |
| Home screen, actions, settings | 17 | 17 | 0 | 0 |
| Tabs and flows | 7 | 6 | 0 | 1 |
| Install bar, install prompt and B2 | 15 | 15 | 0 | 0 |
| Upgrade from `2b7ef06` (B1) | 12 | 12 | 0 | 0 |
| Total | 51 | 50 | 0 | 1 |

The entries are grouped more coarsely than on `276969d`, so the counts do not line up one for one. Each area keeps every check of the first run.

- B1, a new version takes over without closing the browser: passes. One origin and port, a persistent Chromium profile, iPhone user agent and touch at 390 by 664, the clock fixed at 12:00 on june-calm. The old build `2b7ef06` loads, its worker takes control and caches the shell, and it saves `windCaution` 8, a forecast (34,531 characters) and 2 install dismissals. The same address then serves `581f637`. With every upstream blocked, a reload brings in the new build by itself (two page loads: the reload and the one the register code makes), no worker is left waiting, the old build's files are gone from the cache and the new main script is the one running. Without a reload, coming back to the tab 5 minutes later does the same with one reload. No browser restart in either.
- What survives the upgrade, all passing: `rowhether-settings-v2` holds `{windCaution:8}` for `putney-landing`, the dialog shows 8 with `windOff` at 15, the reminder stays hidden and the three old `putney-rowing-*` keys are untouched. The saved forecast is copied byte for byte and shows at once ("Saved data from 12 PM", Go). With upstream requests held open the hero is drawn 37 ms after the reload begins and the status reads Refreshing. Offline, the new build opens from its worker in 47 ms with the saved forecast, loads the web font, names all nine sources as unreachable and opens `#week`. Back online its home screen text equals the old build's, 3,747 characters each. The install count of 2 is in `rowhether-install-v1`, three more Not now reach 5 and the next visit offers Don't show again. No page errors.
- B2, the footer clears the install bar: passes. iPhone user agent, scrolled to the bottom, 5 dismissals stored so Don't show again shows. At 360 px the last footer line ends 30.8 px above the bar (the bar is 172 px tall, the room under the page 208 px). At 390 px 30.9 px, at 320 px 30.6 px (bar 191 px), and at 600 px 30.6 px with 5 dismissals and 82.6 px on a first visit (room 160 px). The first visit at 360 px reads as on `276969d`: bar top 604, last line 574, footer button 317.
- Home screen: midday and 9 PM at 390 light and 1280 dark read as on `276969d` (the hero text, 20 and 18 period rows, the two backgrounds, no overflow, a clean console). The 16 pixel comparisons of the first run are the 48 screenshots of `npx playwright test --grep @visual`, which pass at `maxDiffPixelRatio` 0 on this commit (the progress file's P0.14 entry). Six opened rows show their facts, compass, Precipitation block and hour table. Blocked data, the Dev label, dock reports, Share this forecast, Plan a row, Settings and Reset defaults pass.
- Tabs: the 54 combinations (9 tabs, 3 widths, 2 days) pass 390 checks (no horizontal scroll, strip labels in their buttons, header on one row, tab bar pinned after scrolling to 700 px and at the bottom, a tap on the middle column of every chart gives the readout that column's text and marks one column, no NaN or undefined in the text), and so do the 18 at 390 px in Pacific/Auckland with de-DE. The Fog view opens on 2026-10-15 at 9 PM and at noon and on 2026-10-14 at 6 AM, at 360, 390 and 1280 px. The home scroll is kept, opened Week days and `details[data-keep]` sections stay open through Refresh and the 10 minute timer (18 tab runs).
- Install bar and prompt: all passing, as on `276969d` (first visit, Show me how, visits 2 to 5, Don't show again and `never`, the return after 31 minutes but not 10, the footer button, and the Chromium `beforeinstallprompt` flow with Install, a declined and an accepted choice, `appinstalled`, the Settings button and Don't show again).
- Live loads: the home screen at 390 px loaded all nine sources with 200 and read Caution. The nine tabs at 360 px are not run: Open-Meteo answered one request with 429 (its CORS-less reply also shows as a failed fetch), so that load is not valid. Open-Meteo rate-limits this host, as in the first run.
- Not run again: WebKit (the owner's Mac, `WEBKIT=1`), and the live cells above.
- The Observations of the first run are untouched.

## Summary

The checkers reported 74 entries. 68 pass, 2 fail, 4 are not run. The WebKit half of the checklist is also not run (see Not run).

| Area | Entries | Pass | Fail | Not run |
| --- | --- | --- | --- | --- |
| Home screen, actions, settings | 17 | 16 | 0 | 1 |
| Tabs and flows | 16 | 15 | 0 | 1 |
| Install bar, install prompt, upgrade | 41 | 37 | 2 | 2 |
| Total | 74 | 68 | 2 | 4 |

The tab entry "Tab matrix count" summarizes 54 combinations (9 tabs, 3 widths, 2 days) and 306 checks, all passing. It is counted once.

Nothing visible changed on the home screen. All 16 full-page and opened-row screenshots match the committed pre-refactor baselines pixel for pixel on this machine.

Both failures also reproduce on the production build `2b7ef06`, so neither is a phase 0 regression.

| Id | Severity | Check | Where | Evidence |
| --- | --- | --- | --- | --- |
| B1 | major | Reloading brings in the new service worker and the new build | Persistent Chromium profile, iPhone 13 emulation, 390 px, old build then new build | The new worker installs but stays waiting for 8 and 6 reloads; the old build keeps running until the browser is closed and reopened |
| B2 | minor | At 360 px the footer is reachable above the install bar with Don't show again showing | iPhone 13 emulation, 360 by 740, light, scrolled to the bottom, 5 dismissals stored | Bar top 556, last footer line ends at 574, so 18 px of it is covered |

## Failures

#### B1. A new version does not take over until the browser is fully closed

- Severity: major (the checker's rating; the owner may reclassify, see below).
- Where: persistent Chromium profile with the service worker allowed, iPhone 13 emulation at 390 by 664, light, clock fixed at 12:00 on june-calm. The old build `2b7ef06` was served first, then the `276969d` build on the same origin, with every upstream blocked so the only forecast the page could show was the saved copy. Code: `vite.config.js` (`injectRegister: false`) and `src/main.js` (`registerSW`).
- What happened: the new worker downloads and precaches the new files, then stays in the waiting state. The old worker keeps controlling the page, so the old build keeps running. It was reproduced twice: 8 reloads over 66 s, then 6 reloads over 22 s after 6 s idle. `/sw.js` was fetched 8 times from the new build. Every time the page script stayed `index-CzAEQ9xt.js` (old), not `index-7_2MJhzW.js` (new), and the cache held both old and new files. After the browser was closed and reopened on the same profile, the first load was already the new build and the old cache entries were gone. So an update lands only once every client of the old worker is gone.
- Why it matters: an installed phone app often resumes without a full close, so it can stay on the old build for a long time. The comment in `src/main.js` ("autoUpdate installs it and reloads the page") does not hold in this build.
- Not a phase 0 regression: the `2b7ef06` `sw.js` has the same shape (`skipWaiting()` only inside the message handler, no clients claim), and the PWA part of `vite.config.js` is unchanged since then. The fix pass or the owner can decide whether it belongs in phase 0.
- Cause found by the checker: with `injectRegister: false`, vite-plugin-pwa adds no `skipWaiting` or `clientsClaim` to the generated worker (it does so only for `'auto'` or null, around line 873 of `node_modules/vite-plugin-pwa/dist/index.js`), and `src/main.js` never asks a waiting worker to skip. I read `vite.config.js` and `src/main.js` and they match; I did not re-read the plugin.
- Suggested fix (a guess, not tested): add `skipWaiting: true` and `clientsClaim: true` to the `workbox` block in `vite.config.js`, or keep the update function `registerSW` returns and call it with `true` when a worker is waiting, which also reloads the page. Either way, correct the comment in `src/main.js`. Retest with the same two-build setup.

Applied: `skipWaiting: true` and `clientsClaim: true` in the `workbox` block of `vite.config.js`, and the comment in `src/main.js` corrected, in 70e6f90, outside phase 0 by the owner's choice. The second suggestion (calling the function `registerSW` returns) was not used: in auto mode it sends no skip message. Proven with the checker's setup on one origin and port in a persistent profile: without the fix the new worker waits and the page stays on the old build; with it one reload (or one update check) brings in the new build, which reloads once, with the setting and the saved forecast intact. `test/browser/update.spec.js` serves two builds and fails when either line is removed. The entry is in `phase-0-progress.md`.

Applied, the close-out gate: the third check of `update.spec.js` called `registration.update()` itself, and Chromium checks the worker again about a second after a page load, so it passed with the page's own update check in `src/main.js` removed. It now waits for that browser check to be answered by the older build, then brings the page back to the foreground 5 minutes later, so only the page's check can find the newer build. It fails with that check removed, with it waiting 10 minutes and with `skipWaiting` removed. 0b45498.

#### B2. The last footer line is under the install bar at 360 px when Don't show again shows

- Severity: minor. The bar can be dismissed, and only the last line is hidden.
- Where: iPhone 13 emulation at 360 by 740, light, scrolled to the very bottom, with `rowhether-install-v1` at 5 dismissals so the bar offers Don't show again. Code: `src/styles/app.css` line 206.
- What happened: the bar is 172 px tall with a 12 px gap below it, but `body.install-open .wrap{padding-bottom:10rem}` leaves 160 px. The bar top is at 556 and the last footer line ("after the last. Look at the water before you launch.") ends at 574, so 18 px of it is covered. There is no horizontal overflow. The first-visit bar (124 px tall, no Don't show again) passes: bar top 604, last line bottom 574, footer Install button bottom 317.
- Not a phase 0 regression: measured identically on `2b7ef06` (last line bottom 574, bar top 556). The styles, `src/install.js` and `index.html` are unchanged.
- Suggested fix (a guess): raise the padding to about 12rem, or set it from the bar's measured height. 172 px plus the 12 px gap is 11.5rem, and the line is 18 px under the bar, so 12rem clears it. Recheck at 360 px with Don't show again showing.

Applied: the room under the page is now `max(10rem, the bar's measured height + 2.25rem + the safe area inset)`, with a `ResizeObserver` in `src/install.js` writing the height to `--install-h` and `src/styles/app.css` reading it, in 3c972cf, outside phase 0 by the owner's choice. A fixed 12rem was not used: the bar is 172 px tall at 360 and 390 px but 191 px at 320 px, and at 320 px 12rem leaves the last line 4.2 px under it. The first visit is unchanged (room 160 px, last line at 573.6, bar top 604.4, before and after). At 360 px with 5 dismissals the last line now ends 30.8 px above the bar (it was 17.2 px under it). `test/browser/smoke.spec.js` has seven checks that fail without the fix. `budget.json` `js` goes from 43,300 to 43,400 B for the 59 B the fix adds. The entry is in `phase-0-progress.md`.

## Passed

Widths are 360, 390 (light) and 1280 (dark). Clocks are pinned Eastern. Scenarios are the golden fixtures. Console and page errors were collected on every page. Only the 404s for `/api/info` and `/api/suggest` on the static preview and Playwright's service worker note were allowed, as in `smoke.spec.js`.

#### Home screen and Day by day

- Midday, 390 light and 1280 dark, 12:00, june-calm: hero reads Go with "Wind 7 mph from SSW, gusts 13. Light chop. 76°F air, 68°F water." and "Holds until sunset at 8:31 PM." On the water now is visible, 20 period rows, no horizontal overflow, console clean. Backgrounds are the light base (238, 243, 242) and the dark base (15, 35, 41).
- 9 PM, 390 light and 1280 dark, 21:00, june-calm: On the water now is hidden. The hero shows "Tomorrow morning, 4:36 AM to 10 AM", Flat water, no holds line. 18 period rows. Times read in Eastern with the machine in UTC. Console clean.
- Pixel baselines: 16 comparisons (june-calm and october-fog, 12:00 and 21:00, 390 light and 1280 dark, home and opened row) are identical to `test/browser/__screenshots__` at `maxDiffPixelRatio` 0.
- Day by day: opening the first row shows `.forecast` after the async toggle. Six combinations (june-calm at both clocks and both viewports, october-fog at both clocks at 390 light). Nine facts, compass, Precipitation block and an hour table with Hour, Wind, Gust, From, Water, Air and Rain. No NaN, undefined or null in the text.
- Blocked data: with open-meteo, weather.gov, usgs.gov and water.noaa.gov aborted (390 light and 1280 dark at 12:00, and 390 light with the real clock and no fixtures), the hero reads "No data." and "Every data source was blocked. In-app file previews block outside connections. Open this page in Safari or Chrome, or from a hosted URL." Updated reads "Not loaded", Share is hidden and Refresh is enabled again.
- Live data, 390 light, real clock (6:48 PM Eastern, after sunset): all nine upstream requests returned 200, the hero read Caution with tomorrow morning, steam fog possible and Next go tomorrow midday, and all nine tabs drew with no NaN or overflow. Console clean.

#### Dev label, dock reports, share

- Dev label: with `/api/info` stubbed as `{ env: 'dev', reports: true }`, an amber "Dev" pill sits next to the title on the same line, at 390 light and 1280 dark, 12:00, june-calm.
- Dock reports: Report conditions opens the dialog (water, fog, debris, nothing preselected). Send with nothing picked says "Pick at least one thing you saw." and posts nothing. Chop, Patchy and Floating debris posts `{water:'chop',fog:'patchy',debris:true}`, closes the dialog, and the summary becomes "At the dock: Chop, patchy fog, floating debris, 1 min ago (11:59 AM). The forecast said light chop." Cancel closes without posting. Same at both viewports.
- Share this forecast: with `navigator.share` undefined the button copies the hero text and reads Copied for 2 s. The text names Putney Landing, the time (12 PM), the verdict, the reason and the holds line, and ends with `https://rowhether.com/` on production or the page's own address on dev. Same at both viewports.

#### Plan a row and Settings

- Plan a row (Week tab, 390 light and 1280 dark, 12:00, june-calm and october-fog): picking 1, 1.5 or 2 hours or a time of day changes the list, and `aria-pressed` follows. In october-fog Morning cuts the list from 5 to 4. The choice (`rowhether-plan-v1`) survives a reload and a trip home and back, in all four runs.
- Settings: wind caution set to 8 and saved is stored as `{windCaution:8}` only, and the field shows 8 after a reload, with every other field still at its default (390 light and 1280 dark, october-fog at 21:00, plus fall-back and june-calm at 12:00 at 390 light).
- The hero reflects it: october-fog at 21:00 moves Next go from tomorrow midday to tomorrow afternoon, and fall-back at 12:00 loses its go period. In june-calm only the Day by day rows change (see Observations). The Settings reminder hides after the first save.
- Reset defaults restores all 13 fields at once, stores `{}` after Save, brings the hero and rows back, and holds after a reload.

#### Tabs

Week, Wind, River, Storms, Fog, Temperature, Rain, Light and Air, at 360 and 390 light and 1280 dark, june-calm and october-fog, 12:00 (54 combinations, 306 checks, repeated in Pacific/Auckland with the de-DE locale and also passing):

- No horizontal page scroll (scroll width equals inner width).
- Week strip labels fit in their buttons (37 px at 360, 41.3 px at 390, 120.5 px at 1280) with no overflow. Week and River have no strip.
- Header buttons stay on one row (Refresh and Settings at the same offset, 108 and 108 at 360 and 390, 33 and 33 at 1280).
- The tab bar is pinned: top 0 after scrolling to 700 px and at the page bottom.
- Tapping a chart column fills the readout and marks one column. River has two charts, both tested. Light has two, both tested. Week has no chart.
- Console clean.

Flows:

- At 21:00 on october-fog the Fog view opens on tomorrow morning (2026-10-15) at 360, 390 and 1280: "Tomorrow morning: valley fog likely, lifting about 9 AM." Heading "Tomorrow, midnight to 11 AM". At 06:00 it opens on today, and at 12:00 on tomorrow.
- Home scroll is kept: scroll to 600, open Wind, tap Now, and scrollY is 600 again. After Wind, Week and River from 1000, Now returns to 1000. Six combinations.
- Week: a day opened (6 of 7 in the run, and all 7 in another) stays open through Refresh and through the 10-minute timer, with the closed day still closed. Eight runs.
- `details[data-keep]` sections stay open or closed through a redraw in the eight tabs that have them, by Refresh and by the timer. 64 runs, plus every section open in all nine tabs on both days (18 of 18).
- Live data, 360 light, real clock (about 7:01 PM Eastern): every upstream returned 200 and all nine tabs drew with live data. Overflow 0, header on one row, tab bar pinned, chart taps filled the readout on the eight tabs with a chart.

#### Install bar (iPhone user agent on Chromium, 390 light unless noted)

- First visit: the bar shows Show me how and Not now, with no Don't show again. The footer Install this app button shows.
- Show me how opens the three iOS steps (Share, Add to Home Screen, Add), the bar steps aside, and the dismissal count goes to 1.
- Not now hides the bar until the next visit on visits 2 to 5, with the count at 2, 3, 4 and 5. It stays hidden after a data refresh in the same visit.
- From the fifth dismissal the next visit offers Don't show again. It hides the bar and stores `never`. The bar then stays away after a reload and the footer button remains.
- Returning after 31 minutes away is a new visit and the bar returns. 10 minutes is not.
- The footer Install this app button opens the steps and counts no dismissal while the bar is hidden.
- 360 by 740, first visit: the last footer line (bottom 574) and the footer Install button (bottom 317) are above the bar (top 604). No horizontal overflow.
- No console or page errors across all of it.

#### Install prompt (Chromium desktop, 1280 dark, 12:00, june-calm)

- Before `beforeinstallprompt` there is no bar and no footer or Settings Install button.
- A fake cancelable event shows the bar with Install, `preventDefault` is called, and the footer button shows.
- Install calls `prompt()` once with no steps dialog. A declined choice hides the bar and counts a dismissal. A used prompt is not reused, so the footer button hides until the browser fires another event.
- On the next visit the bar returns when the event fires again. An accepted choice counts no dismissal, and `appinstalled` hides the bar and buttons.
- The Settings Install button calls `prompt()`.
- With five dismissals stored the bar offers Don't show again. After it, a new event shows only the footer button.
- Console clean.

#### Upgrade from production `2b7ef06` to `276969d` (persistent profile, iPhone 13 emulation, 390 light, clock fixed at 12:00 june-calm)

- The old build loads, its service worker takes control, and its cache holds the shell. It saves `windCaution` 8, caches a forecast (34,531 characters, nine sources) and records 2 install dismissals.
- The first load after the deploy is still the old build (see B1).
- After the browser is closed and reopened, the new build runs with the new worker active and the old cache entries removed.
- The install count (2) is kept in `rowhether-install-v1`. The setting is kept: wind caution 8, windOff at its default 15, `rowhether-settings-v2` holds `{windCaution:8}` for `putney-landing`, and the Settings reminder stays hidden. The old `putney-rowing-*` keys are untouched.
- The old forecast copy is carried across byte for byte (`rowhether-cache-v2:putney-landing` equals `putney-rowing-cache-v1`). With every upstream blocked the hero reads Go and "Saved data from 12 PM".
- With upstream requests held open, the saved forecast draws 66 ms after the reload begins and the status reads Refreshing.
- Offline (`setOffline(true)`) reload: the new build opens from its worker, shows the saved forecast 94 ms after the reload begins, loads the web font, names all nine sources as unreachable, and `#week` still opens.
- Back online the new build refreshes, and its home screen text equals the old build's with the same data, setting and clock (3,747 characters).
- The dismissal count carries on from 2: three more Not now reach 5, and the next visit offers Don't show again.
- No page errors in any phase. The console was clean online. The blocked, hanging and offline phases show the app's own "Failed to fetch" warnings and `net::ERR_INTERNET_DISCONNECTED`, which are expected there.

## Not run

- The WebKit half of the whole checklist (390 px light and 1280 px dark in WebKit, and real iOS Safari behavior of the install bar and steps). WebKit is not installed in this container and `playwright install` is not allowed here. The iPhone user agent, touch and viewport were emulated on Chromium, so the install logic is covered but not Safari's rendering. For the owner's Mac with `WEBKIT=1`. Counted once in the install area (1 of the 4).
- Live load at 1280 dark with the real clock. Four attempts all failed on the Open-Meteo forecast with HTTP 429 ("Daily API request limit exceeded"), also seen with curl from this shell on about half of calls. The app showed "No data. The forecast did not load. Check the connection, then tap Refresh." as designed. The shared egress address is rate limited, not the app. The other seven sources returned 200.
- Live load with the tab checks at 390 light and 1280 dark. Open-Meteo answered 429 or 503, or failed with a CORS error from the same failure, on most tries. In 6 attempts per width the forecast loaded in 3 at 390 and 1 at 1280, and the final attempt failed. Tab checks on a failed load are not valid, so none are counted. The 360 px live pass and the 390 px home live pass above did load fully.
- Live load at 390 light (install checker). Same Open-Meteo 429. Covered by the home checker's passing 390 load.
- Every refresh failing with no saved copy, and `localStorage` that throws, as separate checks. They are not items in the `CLAUDE.md` Testing list, so nothing on the list was skipped. The upgrade checks did show the saved copy drawn with every upstream blocked and offline.

Retry the live cells from a normal network. They need one clean load at 1280 dark and one at 390 with all nine tabs.

## Observations

Not failures. Noted for the fix pass or the owner.

- River chart touch targets (tabs checker). At 360 and 390 px the 30-day chart in the River tab has 67 hit columns, each 1 px wide and about 0.65 px apart in the recent stretch. In the 2-day chart 25 of 37 columns are under 8 px. A tap fills the readout but can land on a neighbor: aiming at 7:30 PM returned 9:45 PM. At 1280 px the exact column is returned. The Light tab's six-month chart has a 4.7 px column at 360. This is a design question, and it was not compared with the pre-refactor commit. `Chart.svg()` in `src/render/chart.js` draws each hit at least 1 px wide.
- No data screen draws empty panels (home checker). With every source failing, the home screen still draws an empty On the water now panel (about 233 px tall, heading only) and an empty Day by day heading under the No data message, because `renderNoData()` does not hide `#nowSection` or the days section. It exists on `2152dbf`, before the refactor. No checklist item covers it.
- Settings save runs on the dialog's `close` event, after the dialog is hidden. A script that reads storage or the hero straight after closing can see the old state. Poll for the stored value, as `smoke.spec.js` does. The app was right on every re-run.
- June-calm at 12:00 does not change its hero when wind caution is 8, because the wind is 7 mph and stays under 8 for the rest of today. Only its Day by day rows change. A reader who expects the hero to move should use october-fog at 21:00 or fall-back at 12:00. In june-calm, Morning with 2 hours gives the same Plan a row list as Any time.
- One unexplained, unreproduced 30 s timeout: in the first run of the baseline comparison, a click on the first Day by day row summary did not find `#days details.period`. The same 16 combinations then ran clean, and 24 more home loads all had 18 to 20 rows. Most likely CPU contention from other agents on the machine. A rare slow first render is not ruled out.
- In the 390 px element screenshot of an opened row, the sticky tab bar overlays the top and the hour table's Rain column looks cut at the right. Page scroll width minus client width was 0 everywhere. The scroll width of `.hours-wrap` itself was not measured separately.

## Method

- Setup: `npx vite preview --outDir <copy of dist>` run from the repo on ports 4311 (home), 4312 (tabs), 4313 (install) and 4314 (upgrade static server that follows `public/_headers`). `dist` was built from `276969d` and its `COMMIT` file confirmed. All servers were stopped at the end.
- Scripts: plain Node ESM Playwright scripts with Chromium from `/opt/pw-browsers`, using `routeAll`, `ready` and `SCENARIOS` from `test/browser/fixtures.js`. A fresh context per check, service workers blocked as in `playwright.config.js`, machine time zone UTC. The tabs run was repeated in Pacific/Auckland with de-DE.
- Clocks: `page.clock.install` pinned to `scenario.clock(12)` and `scenario.clock(21)` on june-calm (2026-06-15) and october-fog (2026-10-14), plus 06:00 for Fog. The tab matrix and the upgrade used a fixed time. The 10-minute timer was fired with `page.clock.fastForward(602000)`, not `runFor`, which also fires the 15 s fetch timeouts and logs false AbortError warnings.
- Home and actions: viewport 390 by 844 light and 1280 by 800 dark. `/api/info` and `/api/reports` were routed after `routeAll` so they answer first (reports as a stateful list). Share used `navigator.share` set to undefined with clipboard permissions. Pixel check used Playwright's own `getComparator('image/png')` at `maxDiffPixelRatio` 0 against the committed baselines, writing nothing to the repo.
- Tabs: 360 by 800 and 390 by 844 light with touch, 1280 by 800 dark. Each combination checked page overflow, strip labels inside their buttons, header on one row, `#tabs` top within 1 px of 0 after scrolling to 700 px and at the bottom, a tap on the middle hit column of every chart, and console errors. Redraws were proven by marking `details[data-keep]` nodes and finding them replaced.
- Install: iPhone 13 device emulation on Chromium for the iOS paths, with a faked `visibilitychange` and `clock.fastForward` for the 30-minute return. A cancelable `beforeinstallprompt` with a counted `prompt()` and a resolved `userChoice` for the prompt paths.
- Upgrade: the production build `2b7ef06` was extracted with `git archive` outside the repo and built there with a separate `node_modules` of symlinks. A static server on one port switched between the old and new `dist`. Phase A on the old build used a persistent Chromium profile with service workers allowed. Phase B reopened that profile on the new build with every upstream host blocked.
- Live runs: Chromium through the session egress proxy with `PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK=1` (without it Playwright sends loopback through the proxy and gets 405), the real clock, no routing, up to 6 attempts per width.
- Read-only: no file in the repo was edited, created or deleted, and no build, `playwright install` or git write was run by the checks. The preview and `git status` touched `.git` and the existing empty `node_modules/.vite-temp` only.
