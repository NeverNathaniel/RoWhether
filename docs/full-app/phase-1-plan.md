# Phase 1 build plan: many locations

The commit by commit build sequence for phase 1, on `dev-full-app`. Sonnet builders follow it one step at a time, each step with an independent gate, then an Opus review closes the phase (HANDOFF step 12). A builder should not need to reread 01 to 08 to build a step: each step names its files, what changes, its tests, its browser checks and when it is done. Where a step cites a section of 01 to 08, the section holds the full copy or rule, and the step says which part applies.

Written 2026-10-20 by session 015Sq3rx (Opus) against `dev-full-app` at `30fef7a`. Facts are marked:

- "code at 30fef7a": read in the file named, at that commit.
- "verified live 2026-10-20": checked in this session with the command or request named in section 4 or 10.
- "from docs (URL)": read from the provider's documentation on 2026-10-20.
- "unverified": not checked. A lead, not a fact.

## Contents

1. Summary
2. The owner's phase 1 decisions and how the build applies them
3. The end of the phase 0 rules: golden outputs that change on purpose
4. The test locations
5. Rules for every step
6. The steps, in batches
7. Budgets per step
8. Exit criteria and what proves each
9. Left out of phase 1, or deferred
10. Findings from the live checks
11. Placeholders and what waits on the owner

## 1. Summary

Phase 1 turns the app for one dock into an app for a curated list of docks. Each location is a JSON file in `data/`, validated by the build and emitted as a static file the service worker precaches. Each has its own address (`/putney-landing`), opened from a picker behind the location name in the header. The app is renamed RoWhether. The Worker counts app opens per location with no identifiers, and a short `/privacy` page says so. There is still no database.

What a Putney regular sees change is the short list in 07 3.2: a chevron after "Putney Landing", compass bank labels that turn with the river, share links to `rowhether.com/putney-landing`, "Saved 6:41 AM" in place of "Saved data from 6:41 AM", and a footer that credits the right NWS offices. An existing install opens at `/putney-landing` with its settings and saved forecast.

The prototype list is Putney Landing plus six test locations chosen by the owner on 2026-10-20, one or two per water type: Hanover boathouse and Boathouse Row (river), Lake Quinsigamond (lake), Lake Natoma (reservoir below a dam), Thompson Boat Center (tidal) and Lake Carnegie (lake with no gauge). None has a dock point confirmed by a club, so each shows "Not confirmed on site". Their records are written out in full in section 4, with every gauge, station, forecast point and alert zone checked live on 2026-10-20.

The build is 20 steps in 5 batches. The riskiest structural work comes first: the golden tools that let Putney's output change on purpose (P1.1), location files in the build (P1.2), storage per location (P1.3), path routes and loading a location by its address (P1.4). Putney's own phase 1 changes are done by the end of batch 2, before any other location exists. Batch 3 adds the six test locations by water type. Batch 4 is the Worker and the owner's tools. Batch 5 is the docs and the proof.

Main JS stays within 08 11.2's phase 1 row of 46,700 B. That needs Putney's records to leave the main script (they come from `data/` like every other location), the picker, the Tide view and the Metrics page as lazy chunks, and some 01 items deferred (section 9).

## 2. The owner's phase 1 decisions and how the build applies them

The owner accepted the recommendation of every Phase 1 row in `README.md`'s decisions table on 2026-10-20 (HANDOFF, "Phase 1 decisions"). Facts only the owner can supply get a placeholder that says so in the code and an entry in section 11. The table follows README's row order.

| # | Question (README) | Accepted | How the build applies it | Step | Placeholder |
| --- | --- | --- | --- | --- | --- |
| 1 | Confirm the aggregate open counter and its privacy sentence | One count per app start with the location, first visit or return, and home screen or browser. No address, device or account. Kept three months | `GET /api/info?loc=&k=&m=` writes one Analytics Engine point (`OPENS`). `/privacy` carries 07 14.3's sentence word for word | P1.16 | none |
| 2 | Set up the Cloudflare Access application and give the `ACCESS_AUD` values | Needed for the Metrics tab; Access stays in front of the owner tools after phase 2 | `worker/auth/access.js` verifies `Cf-Access-Jwt-Assertion` with `jose`. Until the owner sets the values, `/api/admin/*` answers 503 `not_configured` | P1.18 | `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` start with `OWNER-SETS-` in both `wrangler.jsonc` blocks |
| 3 | Name the app RoWhether from phase 1, with manifest id `/` | Yes | Manifest `name` and `short_name` "RoWhether", `id: '/'`, `start_url` and `scope` stay `./`. Apple title, install bar and dialog say RoWhether | P1.5 | none |
| 4 | What `/` shows on a first visit | For 90 days after phase 1, Putney Landing with "Not your water? Pick a location." | `homeTarget()` in `src/route.js`, with the window end in `FIRST_VISIT_PUTNEY_UNTIL` in `src/config.js` | P1.6 | The window end date. Set to `Date.UTC(2027, 2, 1)` and marked "PLACEHOLDER: 90 days after phase 1 reaches production. The owner sets it with the merge to master" |
| 5 | What `/` shows after the 90 days for someone who never picked | The picker | The picker page at `/` when nothing is stored and the window has ended | P1.6 | as row 4 |
| 6 | Putney alerts by NWS zones, and correct the footer and `CLAUDE.md` | Yes | Putney's alerts row becomes `zones:VTZ015,VTC025,NHZ011,NHC005`. Footer credits Albany and Gray. CLAUDE.md corrected | P1.8, P1.5, P1.20 | none |
| 7 | Compass bank labels turn with the river | Yes | `compassSVG()` places the labels at the rotated offsets, text upright | P1.11 | none |
| 8 | Water state at every water type | Information only | No reason from water state, on any water type. Fetch, tidal and canal modes only change the water state text and level | P1.13 to P1.15 | none |
| 9 | Cold check with no live water temperature | Monthly typical value, labeled typical, never for steam fog. None: the check stays off | `waterTemp(m, { forCold: true })` returns a curated monthly value flagged `typical`. No test location has monthly values, so the check stays off for them until a dock reading is set | P1.9 | none (monthly values are curated data, none supplied) |
| 10 | Tides and tidal currents | Information only, no change to the verdict | No `tide` reason in `assess()`. The Tide tab and the water state text show it | P1.14 | none |
| 11 | NWS marine warnings | Stay off | `alertLevel()` gives Small Craft Advisory, Gale Warning, Storm Warning and Special Marine Warning level 2 | P1.8 | none |
| 12 | Default limits from flow history | 88th percentile for Caution, 95th for Stay off, rounded down to two figures | The four new gauges' limits in section 4 come from this rule over 2016-01-01 to 2026-10-18. `flowDefaults()` and `scripts/locations/flowstats.mjs` reproduce it. Putney keeps 20,000 and 28,000 (02, step 8) | P1.12 to P1.14, P1.19 | none |
| 13 | Which candidate locations ship first, which clubs confirm dock points, Hartford river or tidal | None given | The owner's test set of 2026-10-20 (section 4). Every record except Putney is `status: "published"` with the badge "Not confirmed on site" and `course.confirmed: false`. Hartford is not in the set | P1.12 to P1.14 | Club confirmation of each dock point and course |
| 14 | Contact string in the Worker's User-Agent | A dedicated address the owner chooses | Phase 1 has no Worker request to NWS, Nominatim or aviationweather.gov. The curation scripts send `RoWhether/1.0 (+https://rowhether.com; OWNER-SETS-contact)` from one constant | P1.19 | `USER_AGENT` in `scripts/locations/agent.mjs` |
| 15 | Tab bar and navigation | The tab bar holds one location's parts. The name opens the switcher; the account button opens Account | The location name is a button that opens the picker sheet. No account button until phase 2. `/admin` and `/privacy` are reached by address and the footer link | P1.5, P1.6 | none |
| 16 | Approve the `CLAUDE.md` changes for phase 1 | Approve | P1.20 writes the app name, the navigation sentence, the "Saved" label, the test list, the NWS offices and zones, and the service worker sentence, with the code map | P1.20 | none |
| 17 | Putney facts to confirm on site | Confirm the heading on site; none given for the others | The heading stays 15 with `confirmed: false` ("an estimate" in How this works). The waterway reach stays "Bellows Falls dam to Vernon dam". The water temperature note keeps "about 19 mi downstream" (straight line) | none | All three stay as today, each listed in section 11 |
| 18 | Tidal stream limits (2.0 and 3.0 kn, multipliers at 1.0 and 2.0 kn) | None given | No phase 1 location has tidal current data (section 4.7), so no stream limit or multiplier is used. The values stay in 01 9.4 for the first location with a current station | none | listed in section 11 |

## 3. The end of the phase 0 rules: golden outputs that change on purpose

Phase 0 proved "no visible change" with golden files that could not be written after P0.1 and a CI step that failed on any modified golden file (`.github/workflows/ci.yml` line 22, code at 30fef7a). 08 14.1 says those rules end at phase 1's first commit, and the owner moved that point from the PR #6 merge to phase 1's first commit on 2026-10-20 (HANDOFF log). From P1.1 the golden files are snapshots of Putney. A commit that changes Putney's output on purpose rewrites the cases it changes, and only those, and names the change. A commit that changes no behavior changes no golden file.

### 3.1 What P1.1 changes

- The comparison. `test/golden/harness.js` compares each case's formatted text with its file using Vitest's `expect(text).toMatchFileSnapshot(file)`, where `text` is what the harness writes today: `format(MAIN.has(c) ? have : trimmed(have), c.run ? 4 : 3)`. The digest step for variants and probes stays and runs before the comparison. The write mode (`GOLDEN_WRITE`, the "is not in write mode" guard, and the refusal "exists and differs. Not rewritten." at `harness.js` line 60) goes. P1.1 proves the swap is neutral: all 107 golden files (19 main cases, 77 variants and 11 probes) pass unchanged.
- The guard. Vitest writes no snapshot when `CI` is set: a missing or different file fails. Locally, `-u` rewrites the files of the tests that ran, so `-t` limits it to named cases.
- The CI step. `git diff --exit-code --diff-filter=MD c7967a6... HEAD -- 'test/golden/*.json'` is replaced by `node scripts/golden.mjs check c7967a64f1a9bd80ed2f0e14ee6c7ceb69d5d3ab`, described in 3.2.
- The phase 0 scaffolding goes, as 08 14.1 says: the copied old parsers and the "equal the old ones" tests in `test/sources.test.js` (the copy starts at line 16; the re-export test is at line 316), the pasted reference formatters and their two tests in `test/format.test.js` (line 5 onward), and the re-exports in `src/data.js`. Importers move to `src/sources/*.js`: `test/golden/capture.js` (`alertLevel`), `test/golden/probes.js`, `test/logic.test.js` and `test/sources.test.js`.

### 3.2 The tools

`scripts/golden.mjs` gets three commands in place of `write`, and keeps `dump`:

| Command | What it does |
| --- | --- |
| `node scripts/golden.mjs update [<case> ...]` | Runs `npx vitest run test/golden.test.js test/golden-variants.test.js -u -t '<pattern>'`, where the pattern is `^golden outputs (<case>|<case>)$` built from the names, escaped. With no names it updates every case that fails. Refuses to run when `CI` is set |
| `node scripts/golden.mjs diff [<rev>]` | For each `test/golden/*.json` that differs between `<rev>` (default `HEAD`) and the working tree, prints the case name and every key path whose value changed, added or removed, one per line |
| `node scripts/golden.mjs check <base>` | For each commit in `git rev-list --reverse --no-merges <base>..HEAD -- 'test/golden/*.json'`: a deleted golden file fails. A modified file needs the commit's `Golden:` trailer (`git log -1 --format='%(trailers:key=Golden,valueonly)'`) to name change ids from `test/golden/changes.js`, and every changed path in it must match a path pattern of one of those ids, within that id's files. A new file passes (14.1's rule for additions still holds) |
| `node scripts/golden.mjs dump <case> [dir]` | As today: every captured value in full, for `diff -r` against a dump made in a worktree of the parent commit |

Key paths are dot-joined: object keys as they are, array items by index (`sources.1.1` is the alerts URL, `status.header.cached` the saved label). Patterns use `*` for one segment and `**` for any number. The pure path diff and the matcher live in `test/golden/paths.js`, imported by `scripts/golden.mjs` and tested by `test/golden-check.test.js`.

`test/golden/changes.js` exports `CHANGES`, one entry per intended change:

```js
export const CHANGES = {
  saved: {
    why: '07 3.2 and 6.7: the header says "Saved 6:41 AM" in place of "Saved data from 6:41 AM".',
    step: 'P1.5',
    files: ['*'],                 // case names, with * and ** as above
    paths: ['status.header.cached', 'status.header.failed']
  }
};
```

An id is never widened after its commit. A step that finds a golden path moving outside its planned ids stops: either the code is wrong, or the spec intends it, in which case the step adds a new id with its source section in the same commit and says so in its progress entry. The gate and the batch review read every id added.

### 3.3 How a case is rewritten on purpose

1. Make the code change. Run `npm test` and read which cases fail.
2. Run `node scripts/golden.mjs update` with the failing case names, or with none to take every failing case.
3. Run `node scripts/golden.mjs diff`. Every path printed must belong to the planned ids of 3.4. Add the step's ids to `test/golden/changes.js` if they are not there yet.
4. Dump two or three of the changed cases here and in a worktree of the parent commit (`git worktree add <scratch>/base HEAD`, link `node_modules`, run the dump there), then `diff -r`. The only text that differs is the named change. Record the dump diff summary in the progress entry.
5. Commit the code, the rewritten files and `changes.js` together, one commit per id where a step has more than one. The message names the change in the subject and carries the trailer `Golden: <id>[, <id>]` in the trailer block, before the attribution lines.
6. `node scripts/golden.mjs check c7967a64f1a9bd80ed2f0e14ee6c7ceb69d5d3ab` passes before the push.

The reviewer of a step runs `node scripts/golden.mjs diff <commit>^` on a checkout of the commit, reads the paths against the id, and repeats one dump diff. That diff of the JSON, and of the dumps, is the review 08 14.1 asks for. 09's phase 1 exit criterion 2 ("the Putney golden tests pass with only those differences") is proven by `check` passing over the whole phase.

### 3.4 The planned golden changes

Expected ids, in step order. "Files" names which cases move; the builder confirms the list with `diff` and narrows `files` to what actually moved.

| Id | Step | Why, and the source | Files expected to move | Paths |
| --- | --- | --- | --- | --- |
| `saved` | P1.5 | "Saved 6:41 AM" (07 3.2, 6.7) | every case with a model (main and variants) | `status.header.cached`, `status.header.failed` |
| `alerts-zones` | P1.8 | Putney's alerts by zone list (01 6.1, README row 6) | every case that records `sources` (the 19 main cases and the non-lean variants) | `sources.1.1` |
| `usgs-v1` | P1.8 | USGS `/ogcapi/v1`, one id per gauge and `limit=50` on the latest request (02 Decision, 08 K10, section 10 here) | as `alerts-zones` | `sources.3.1`, `sources.4.1`, `sources.5.1` |
| `marine-alerts` | P1.8 | Small Craft Advisory and the other marine warnings are Stay off (README row 11) | the probe holding `alertLevels` (`test/golden/probes.js` line 242), and `v-june-alerts`, whose fixture has a Small Craft Advisory (`test/fixtures/variants.js` line 107) | `alertLevels.Small Craft Advisory` in the probe; `**` in `v-june-alerts` |
| `flowdays-noon` | P1.8 | Daily means at local noon in the gauge's zone (01 15.2, 08 K11): dates in Eastern Standard Time move from 16:00 to 17:00 UTC | cases whose 30 daily means include a date outside daylight saving time (the `fall-back-*` cases, and any April case reaching back before 2026-03-08), and `p-parsers` | `parsers.flowDays.**`, `views.river.**`, and the probe's `flowDays` keys |
| `not-checked` | P1.9 | The hero's `#notChecked` line (07 6.7, 01 8.4). It is hidden and empty at Putney, but the render code now writes it | every case with a model | `home.notChecked`, `later.home.notChecked`, `status.partial.notChecked`, `status.partialAll.notChecked` |
| `stale-sources` | P1.9 | A source past its limit is not used (02 K9, 08 K9): an observation over 3 hours old is not shown | `v-june-stale-readings` (observation 60 hours old, `test/fixtures/variants.js` line 127) | `home.facts.**`, `later.home.facts.**` |
| `banks` | P1.11 | Bank labels turn with the river (01 10.5, 07 3.2) | every case that draws the compass | `home.compass.innerHTML`, `later.home.compass.innerHTML`, `forecasts.*` |

Three of 07 3.2's five visible changes move no golden file, because the capture does not draw them: the chevron (static markup in `index.html`, and `renderPlace()` is not called by the capture), the footer credits (also `renderPlace()`), and the share link (`shareText()` returns the text only; the URL is added in `initShare()`, `src/share.js` line 22, code at 30fef7a). The browser checks in P1.5 and P1.11 prove those three. No golden file should move in P1.2, P1.3, P1.4, P1.6, P1.7, P1.10 or P1.12 onward. If one does, it is a finding.

### 3.5 How the parity spec follows

`test/browser/parity.spec.js` compares the real page with the golden files. It reads the files at run time, so a rewritten case is compared as rewritten. Three changes keep it honest:

- P1.4: it loads `/putney-landing`, Putney's own address, not `/` (line 94, code at 30fef7a). `/` is covered by `picker.spec.js` and the smoke spec, because from P1.6 an empty browser at `/` shows the "Not your water?" note.
- P1.5: `ready()` in `test/browser/fixtures.js` (line 76) accepts "Saved" in place of "Saved data from", and so do the three smoke and timing checks that wait for that label (`smoke.spec.js` lines 262 and 312, `timing.spec.js` line 82).
- P1.9: it skips nothing new. `#notChecked` is in the golden files from P1.9 and hidden on both sides.

It keeps `timezoneId: 'Pacific/Auckland'` and `locale: 'de-DE'` (line 25), so a line that reads the viewer's zone still fails. The subtitle's "hours behind you" phrase is not compared by parity, because `renderPlace()` is not captured; `test/header.test.js` and the Chicago check in P1.5 cover it.

### 3.6 Screenshots as a before and after tool

The `@visual` screenshots are local and git-ignored (FD3). Before P1.1, on the machine that runs the final proof, make a baseline from `30fef7a` in a worktree as `test/browser/screens.spec.js`'s header says, and keep it with `VISUAL_BASELINE` pointing at it. In P1.20 run `npx playwright test --grep @visual` against it. Every failing image must differ only where 07 3.2 says: the chevron after the title, the compass bank labels, the footer credits, and the "Saved" label (no screenshot shows the offline label, so expect three). Playwright writes the diff images next to the results; the proof records which screenshots differ and that each difference is one of the three. The spec stays at `maxDiffPixelRatio: 0` as the before and after tool.

## 4. The test locations

### 4.1 Summary

All seven locations, as the build will hold them after P1.14. Distances are straight-line from the dock point; bearings are from the dock.

| Slug | Water type | Dock point (source) | Tabs | Flow | Water temperature | Tide | Observations | Alert zones | Course |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `putney-landing` | river | 42.9607, -72.5219 (the record today) | Now, Week, Wind, River, Storms, Fog, Temperature, Rain, Light, Air | USGS-01154500 North Walpole | USGS-01161280 Northfield | none | KEEN | VTZ015, VTC025, NHZ011, NHC005 | heading 15, an estimate |
| `hanover-boathouse` | river | 43.70552, -72.29763 (OSM "Friends of Dartmouth Rowing Boathouse") | as Putney | USGS-01144500 West Lebanon, 6.7 km S, below Wilder Dam | none | none | KLEB, 8.7 km S | VTZ021, VTC027, NHZ005, NHC009 | heading 40, an estimate |
| `boathouse-row` | river | 39.96941, -75.18711 (01 7.5) | as Putney | USGS-01474500 at Philadelphia, 216 m, Fairmount Dam | USGS-01474500 | none | KPHL, 11.2 km SSW | PAZ071, PAC101 | heading 330, an estimate |
| `lake-quinsigamond` | lake | 42.29043, -71.75505 (OSM "Donahue Rowing Center") | Now, Week, Wind, Storms, Fog, Temperature, Rain, Light, Air | none | none | none | KORH, 10.0 km W | MAZ012, MAC027 | heading 166 along the lake, an estimate |
| `lake-natoma` | reservoir | 38.63453, -121.21918 (OSM "Sacramento State Aquatic Center") | as Lake Quinsigamond | none | USGS-11446500 Fair Oaks, 746 m W, below Nimbus Dam | none | KSAC, 28 km SW | CAZ154, CAC067 | heading 31 along the lake, an estimate |
| `thompson-boat-center` | tidal | 38.90053, -77.05834 (OSM "Thompson's Boat Center") | Now, Week, Wind, Tide, River, Storms, Fog, Temperature, Rain, Light, Air | USGS-01646500 Little Falls, 8.1 km NW | USGS-01646500 | NWPS GTND2 Georgetown, 866 m WNW | KDCA, 6.2 km SSE | DCZ001, DCC001, VAZ054, VAC013, ANZ535 | heading 285, an estimate |
| `lake-carnegie` | lake | 40.33932, -74.65048 (OSM "Shea Rowing Center") | as Lake Quinsigamond | none | none | none | KTTN, 15.7 km WSW | NJZ015, NJC021, NJZ012, NJC023 | none (the compass draws the lake) |

What each new water type shows, in short:

- Lake Carnegie, a lake with no gauge: no River tab and no River flow fact. The Water fact reads "No water temperature here. Add a dock reading in Settings." and the air plus water cold check is off until one is set. No "Not checked here" line, because flow is not a factor on a lake (01 8.4). Week's River row reads "This is a lake. Flow is not checked." The course is `none`: wind facts say only "From SW.", the compass draws the lake as an ellipse along its axis, and chop comes from the fetch across the lake (01 9.3). Settings has no flow or course fields.
- Thompson Boat Center, tidal: a Tide tab after Wind with the NWS tide height forecast for Georgetown, three days hourly, highs and lows marked "about", and flood or ebb from rising or falling water. Tide is information only and never changes Go, Caution or Stay off. The River tab and the flow limits come from Little Falls, above the tide. Alerts include marine zone ANZ535, so a Small Craft Advisory there gives Stay off (it was active during the check, section 10). There is no tidal current station on this reach (4.7), so no stream speed, no stream lines and no wind against tide multiplier.

### 4.2 How the checks were made

Every fact marked "verified live 2026-10-20" below came from these requests, from this container, between 02:30 and 03:30 UTC. Builders can record fixtures with the same requests. NWS asks for a User-Agent; use `RoWhether-plan-check/1.0 (+https://rowhether.com)` or the scripts' constant, never a personal address.

- NWS points: `https://api.weather.gov/points/<lat>,<lon>`, with the point rounded to 4 decimals. A point with 5 or more decimals answers 301 to the 4-decimal form (verified live 2026-10-20, `curl -I`).
- NWS zones for the dock and points on each bank or end of the water: `https://api.weather.gov/zones?point=<lat>,<lon>`. Office names: `https://api.weather.gov/offices/<id>`. Zone offices: `https://api.weather.gov/zones/forecast/<id>` and `/zones/county/<id>`, `/zones/coastal/<id>`.
- The alerts request each record makes: `https://api.weather.gov/alerts/active?zone=<list>`, 200 with `access-control-allow-origin: *` for all seven lists.
- Stations: `https://api.weather.gov/gridpoints/<wfo>/<x>,<y>/stations?limit=8`, then `https://api.weather.gov/stations/<id>/observations/latest`.
- USGS series: `https://api.waterdata.usgs.gov/ogcapi/v1/collections/time-series-metadata/items?bbox=<w>,<s>,<e>,<n>&parameter_code=00060,00065,00010&computation_period_identifier=Points&f=json&limit=300&properties=monitoring_location_id,parameter_code,begin,end&skipGeometry=true`. Sites: `.../monitoring-locations/items?id=<ids>&f=json`. Latest: `.../latest-continuous/items?monitoring_location_id=<ids>&parameter_code=00060,00010,00065&f=json&limit=50`. Series: `.../continuous/items?...&time=P2D&limit=1000` and `.../daily/items?...&statistic_id=00003&time=P30D&limit=100`, all 200 for the four flow gauges.
- Flow statistics: `.../daily/items?monitoring_location_id=<id>&parameter_code=00060&statistic_id=00003&time=2016-01-01/2026-10-19&limit=10000&properties=time,value&skipGeometry=true&f=json` (one page each, no `next` link), percentiles by linear interpolation between closest ranks (02, step 3), rounded down to two significant figures (01 11.3).
- NWPS: `https://api.water.noaa.gov/nwps/v1/gauges?bbox.xmin=...&srid=EPSG_4326`, `.../gauges/<lid>` and `.../gauges/<lid>/stageflow/forecast`, 200 with `access-control-allow-origin: *` when an `Origin` header is sent.
- CO-OPS station lists: `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions|currentpredictions|waterlevels`, sorted by distance from the dock.
- Places: Nominatim search (`https://nominatim.openstreetmap.org/search?q=<name>&format=jsonv2`, one request at a time, at least a second apart) for the boathouses, the dams and the three lake outlines (`polygon_geojson=1`). Lake axis, length and mean width were computed from the outline: principal axis of the vertices, extent along it, and area divided by length.
- Upstream heading hints: NHDPlus flowlines from USGS NLDI, `https://api.water.usgs.gov/nldi/linked-data/comid/position?coords=POINT(<lon> <lat>)` then `.../comid/<id>/navigation/UM/flowlines?distance=5`, bearing from the snapped point to the point 1 to 3 km upstream along the line. 01 10.6 calls this "a rough hint", so every new heading is `confirmed: false`.
- Footer links: every `weather.gov/<office>/`, `water.noaa.gov/gauges/<lid>` and `waterdata.usgs.gov/monitoring-location/<id>/` link in the records answered 200.

### 4.3 Putney Landing (river)

Putney's two files change in four steps. Nothing else in them changes.

| Step | Field | Today (code at 30fef7a) | Phase 1 |
| --- | --- | --- | --- |
| P1.2 | `copy.description` | absent | `"Go, caution or stay off: rowing conditions on the Connecticut River at Putney Landing, VT."` (today's meta description, `index.html` line 13) |
| P1.5 | `copy.credits` | "... Alerts and Keene observations from the National Weather Service, Albany. ..." | the text below, with links |
| P1.8 | the alerts row's `ref` | `point:42.9607,-72.5219` | `zones:VTZ015,VTC025,NHZ011,NHC005` |
| P1.9 | `flow.maxAgeH`, `waterTemp.maxAgeH` | `null`, `null` | `24`, `72` (01 6.3) |
| P1.10 | `thresholds.basis` | absent | `{ "flow": "usgs-ogc:USGS-01154500:cfs" }` |

The new `copy.credits` (links are `[text](https://...)`, rendered by `linkText()` in P1.5):

```
Forecast from [Open-Meteo](https://open-meteo.com/) (NOAA HRRR and GFS models). Alerts from the National Weather Service offices in [Albany](https://www.weather.gov/aly/) and [Gray](https://www.weather.gov/gyx/), and Keene observations from the National Weather Service. River flow from USGS gauge [01154500 at North Walpole](https://waterdata.usgs.gov/monitoring-location/USGS-01154500/), water temperature from [01161280 near Northfield](https://waterdata.usgs.gov/monitoring-location/USGS-01161280/). River forecast from the [NWS Northeast River Forecast Center](https://water.noaa.gov/gauges/wlpn3). Air quality from Open-Meteo (Copernicus CAMS), and the model comparison from GFS, ECMWF, GEM and ICON via Open-Meteo.
```

Checks, verified live 2026-10-20: the dock point still resolves to GYX, grid 3,13, zone NHZ011, county NHC005, `America/New_York` (01 6.1 found the same on 2026-10-17). VTZ015 "Eastern Windham" and VTC025 "Windham" belong to ALY (Albany, NY); NHZ011 "Cheshire" and NHC005 "Cheshire" to GYX (Gray - Portland, ME). The four-zone alerts request answered 200 with no active alert. North Walpole and Northfield answered the v1 latest request with the same values as v0. WLPN3's forecast was issued 2026-10-19 14:40 UTC, 12 points.

The waterway file is unchanged in phase 1. Its `stats` stay as recorded on 2026-10-17. Section 10 explains why the same rule run on 2026-10-20 would give 27,000, not 28,000, for Stay off, and why Putney keeps 28,000.

### 4.4 Hanover boathouse (river)

`data/locations/hanover-boathouse.json`:

```json
{
  "v": 1,
  "id": "1f8ec826-cc13-4d2b-b201-069bdd5f64a8",
  "slug": "hanover-boathouse",
  "name": "Hanover boathouse",
  "shortName": "Hanover",
  "subtitle": "Connecticut River at the Hanover boathouse, above Wilder Dam.",
  "locality": "Hanover, NH",
  "waterway": "connecticut-river-wilder-pool",
  "lat": 43.70552,
  "lon": -72.29763,
  "tz": "America/New_York",
  "tzLabel": null,
  "country": "US",
  "region": "US-NH",
  "waterType": "river",
  "course": {
    "kind": "heading",
    "heading": 40,
    "reachWord": "straight",
    "confirmed": false,
    "note": "Estimate from the mapped river line upstream of the dock. Not checked on the water."
  },
  "banks": {
    "word": "bank",
    "left": { "short": "VT", "name": "Vermont" },
    "right": { "short": "NH", "name": "New Hampshire" }
  },
  "thresholds": {
    "windCaution": 10, "windOff": 15, "gustCaution": 18, "gustOff": 25,
    "rainCaution": 60, "rainOff": 90, "coldCombined": 100,
    "flowCaution": 14000, "flowOff": 20000, "aqiCaution": 151, "aqiOff": 201,
    "basis": { "flow": "usgs-ogc:USGS-01144500:cfs" }
  },
  "aqiScale": "us",
  "flow": {
    "measure": "discharge",
    "unit": "cfs",
    "against": [[14000, 1.4], [7600, 1.25]],
    "maxAgeH": 24,
    "staleSwitchH": 6
  },
  "water": { "mode": "river", "cross": 0.4 },
  "fog": null,
  "waterTemp": { "fallback": "none", "maxAgeH": 72 },
  "tide": null,
  "daylight": null,
  "copy": {
    "description": "Go, caution or stay off: rowing conditions on the Connecticut River at the Hanover boathouse, NH.",
    "flowStats": "Since 2016 the median day is about 5,400 cfs. 14,000 is the top 13% of days, 20,000 the top 5%.",
    "flowHow": "Flow is measured at the USGS gauge at West Lebanon, below Wilder Dam, about 4 mi downstream of the dock in a straight line, so it reads what the dam releases. The forecast is from the NWS Northeast River Forecast Center for the same gauge, in 6-hour steps.",
    "credits": "Forecast from [Open-Meteo](https://open-meteo.com/). Alerts from the National Weather Service offices in [Burlington](https://www.weather.gov/btv/) and [Gray](https://www.weather.gov/gyx/), and Lebanon airport observations from the National Weather Service. River flow from USGS gauge [01144500 at West Lebanon](https://waterdata.usgs.gov/monitoring-location/USGS-01144500/). River forecast from the [NWS Northeast River Forecast Center](https://water.noaa.gov/gauges/wlbn3). Air quality from Open-Meteo (Copernicus CAMS), and the model comparison from GFS, ECMWF, GEM and ICON via Open-Meteo."
  },
  "launchNotes": null,
  "status": "published",
  "sources": [
    {
      "role": "alerts", "adapter": "nws-alerts", "ref": "zones:VTZ021,VTC027,NHZ005,NHC009", "label": "NWS"
    },
    {
      "role": "obs", "adapter": "nws-obs", "ref": "KLEB", "label": "Lebanon",
      "note": "Lebanon airport, 5 mi south. A check on the model.",
      "siteLat": 43.6271, "siteLon": -72.3054, "distanceM": 8742, "relation": "nearby"
    }
  ]
}
```

`data/waterways/connecticut-river-wilder-pool.json`:

```json
{
  "v": 1,
  "id": "connecticut-river-wilder-pool",
  "name": "Connecticut River",
  "reach": "Wilder Dam pool",
  "kind": "river",
  "country": "US",
  "regions": ["US-NH", "US-VT"],
  "geometry": null,
  "traffic": null,
  "notes": null,
  "sources": [
    {
      "role": "flow", "mode": "primary", "priority": 0,
      "adapter": "usgs-ogc", "ref": "USGS-01144500", "params": { "parameterCode": "00060" },
      "unit": "cfs", "tz": "America/New_York",
      "label": "West Lebanon",
      "note": "West Lebanon gauge below Wilder Dam, about 4 mi downstream.",
      "siteLat": 43.646182, "siteLon": -72.312313,
      "distanceM": 6703, "riverM": null, "relation": "downstream",
      "stats": { "from": "2016-01-01", "to": "2026-10-18", "days": 3944,
                 "p50": 5420, "p65": 7699, "p88": 14800, "p90": 15900, "p95": 20200 }
    },
    {
      "role": "flow_forecast", "mode": "primary", "priority": 0,
      "adapter": "nwps", "ref": "WLBN3", "unit": "cfs",
      "label": "NWS Northeast River Forecast Center"
    }
  ]
}
```

| Fact | Value | Status |
| --- | --- | --- |
| Dock point | 43.7055196, -72.2976348, `building=boathouse` "Friends of Dartmouth Rowing Boathouse, 5 Boathouse Road, Hanover, Grafton County, NH" (Nominatim) | verified live 2026-10-20. The building, not a dock: not confirmed |
| NWS point | BTV, grid 125,26, VTZ021, VTC027, `America/New_York` | verified live 2026-10-20. The point resolves to the Vermont zones although Nominatim puts the building in New Hampshire, as at Putney |
| Zones on the NH bank | NHZ005 "Southern Grafton" and NHC009 "Grafton", office GYX, at 43.7055, -72.2930 | verified live 2026-10-20 |
| Zone office | VTZ021 "Eastern Windsor", BTV (Burlington, VT) | verified live 2026-10-20 |
| Flow gauge | USGS-01144500 "CONNECTICUT RIVER AT WEST LEBANON, NH", 43.64618, -72.31231, drainage 4,092 sq mi, EST with daylight saving; 00060 and 00065 active, 2,290 cfs at 2026-10-20 01:30 UTC; no 00010 | verified live 2026-10-20 |
| Wilder Dam | 43.66743, -72.30343 (Nominatim `waterway=dam`), between the dock and the gauge | verified live 2026-10-20 |
| Other gauges within the bbox | White River at West Hartford, Ompompanoosuc at Union Village, Ottauquechee at North Hartland: tributaries, not bound | verified live 2026-10-20 |
| Flow statistics | 3,944 days, p50 5,420, p65 7,699, p88 14,800, p90 15,900, p95 20,200; 13.4% of days over 14,000, 5.1% over 20,000 | verified live 2026-10-20 |
| Limits | 14,000 and 20,000 cfs; against `[[14000, 1.4], [7600, 1.25]]` | computed by 01 11.3's rule |
| River forecast | NWPS WLBN3 "Connecticut River at West Lebanon", `usgsId` 01144500, NERFC, in service, action flow 54,673 cfs; forecast issued 2026-10-19 14:40 UTC, 12 points, flow in kcfs | verified live 2026-10-20 |
| Observations | KLEB Lebanon Municipal Airport, 43.6271, -72.30537, 8,742 m, bearing 184; latest 2026-10-20 00:00 UTC with wind | verified live 2026-10-20 |
| Water temperature | none within the bbox | verified live 2026-10-20 |
| Heading | 36 to 47 from the NHDPlus line, 1 to 3 km upstream; 40 chosen | a hint, not confirmed |
| The waterway's reach | "Wilder Dam pool". Where the pool ends upstream is not checked | unverified |

### 4.5 Boathouse Row (river)

`data/locations/boathouse-row.json`:

```json
{
  "v": 1,
  "id": "baabf164-470f-4846-a241-978df6abf72a",
  "slug": "boathouse-row",
  "name": "Boathouse Row",
  "shortName": "Boathouse Row",
  "subtitle": "Schuylkill River at Boathouse Row, above Fairmount Dam.",
  "locality": "Philadelphia, PA",
  "waterway": "schuylkill-river-fairmount-pool",
  "lat": 39.96941,
  "lon": -75.18711,
  "tz": "America/New_York",
  "tzLabel": null,
  "country": "US",
  "region": "US-PA",
  "waterType": "river",
  "course": {
    "kind": "heading",
    "heading": 330,
    "reachWord": "straight",
    "confirmed": false,
    "note": "Estimate from the mapped river line upstream of the dock. Not checked on the water."
  },
  "banks": null,
  "thresholds": {
    "windCaution": 10, "windOff": 15, "gustCaution": 18, "gustOff": 25,
    "rainCaution": 60, "rainOff": 90, "coldCombined": 100,
    "flowCaution": 5700, "flowOff": 9000, "aqiCaution": 151, "aqiOff": 201,
    "basis": { "flow": "usgs-ogc:USGS-01474500:cfs" }
  },
  "aqiScale": "us",
  "flow": {
    "measure": "discharge",
    "unit": "cfs",
    "against": [[5700, 1.4], [2800, 1.25]],
    "maxAgeH": 24,
    "staleSwitchH": 6
  },
  "water": { "mode": "river", "cross": 0.4 },
  "fog": null,
  "waterTemp": { "fallback": "none", "maxAgeH": 72 },
  "tide": null,
  "daylight": null,
  "copy": {
    "description": "Go, caution or stay off: rowing conditions on the Schuylkill River at Boathouse Row, Philadelphia, PA.",
    "flowStats": "Since 2016 the median day is about 2,000 cfs. 5,700 is the top 12% of days, 9,000 the top 5%.",
    "flowHow": "Flow is measured at the USGS gauge at Fairmount Dam, about 200 m below Boathouse Row. The forecast is from the NWS Middle Atlantic River Forecast Center for the same gauge, in 6-hour steps.",
    "credits": "Forecast from [Open-Meteo](https://open-meteo.com/). Alerts and Philadelphia airport observations from the [National Weather Service, Mount Holly](https://www.weather.gov/phi/). River flow and water temperature from USGS gauge [01474500 at Philadelphia](https://waterdata.usgs.gov/monitoring-location/USGS-01474500/). River forecast from the [NWS Middle Atlantic River Forecast Center](https://water.noaa.gov/gauges/padp1). Air quality from Open-Meteo (Copernicus CAMS), and the model comparison from GFS, ECMWF, GEM and ICON via Open-Meteo."
  },
  "launchNotes": null,
  "status": "published",
  "sources": [
    {
      "role": "alerts", "adapter": "nws-alerts", "ref": "zones:PAZ071,PAC101", "label": "NWS"
    },
    {
      "role": "obs", "adapter": "nws-obs", "ref": "KPHL", "label": "Philadelphia",
      "note": "Philadelphia airport, 7 mi south-southwest. A check on the model.",
      "siteLat": 39.8733, "siteLon": -75.2268, "distanceM": 11210, "relation": "nearby"
    },
    {
      "role": "water_temp", "mode": "primary", "adapter": "usgs-ogc", "ref": "USGS-01474500",
      "params": { "parameterCode": "00010" }, "unit": "degC", "tz": "America/New_York",
      "label": "Fairmount Dam",
      "note": "USGS gauge at Fairmount Dam, about 200 m downstream.",
      "siteLat": 39.967791, "siteLon": -75.188501, "distanceM": 216, "relation": "at"
    }
  ]
}
```

`data/waterways/schuylkill-river-fairmount-pool.json`:

```json
{
  "v": 1,
  "id": "schuylkill-river-fairmount-pool",
  "name": "Schuylkill River",
  "reach": "Fairmount Dam pool",
  "kind": "river",
  "country": "US",
  "regions": ["US-PA"],
  "geometry": null,
  "traffic": null,
  "notes": null,
  "sources": [
    {
      "role": "flow", "mode": "primary", "priority": 0,
      "adapter": "usgs-ogc", "ref": "USGS-01474500", "params": { "parameterCode": "00060" },
      "unit": "cfs", "tz": "America/New_York",
      "label": "Fairmount Dam",
      "note": "USGS gauge at Fairmount Dam, just below Boathouse Row.",
      "siteLat": 39.967791, "siteLon": -75.188501,
      "distanceM": 216, "riverM": null, "relation": "at",
      "stats": { "from": "2016-01-01", "to": "2026-10-18", "days": 3942,
                 "p50": 2020, "p65": 2860, "p88": 5750, "p90": 6380, "p95": 9070 }
    },
    {
      "role": "flow_forecast", "mode": "primary", "priority": 0,
      "adapter": "nwps", "ref": "PADP1", "unit": "cfs",
      "label": "NWS Middle Atlantic River Forecast Center"
    }
  ]
}
```

| Fact | Value | Status |
| --- | --- | --- |
| Dock point | 39.969414, -75.187107, a point on Kelly Drive for the row of boathouses (01 7.5, one location for all of them) | from 01 7.5 (verified live 2026-10-17 there); not confirmed |
| NWS point | PHI, grid 49,79, PAZ071, PAC101, `America/New_York`; the same two zones on the far bank and upstream | verified live 2026-10-20 |
| Office | PHI, "Philadelphia/Mt Holly" | verified live 2026-10-20 |
| Flow and water temperature gauge | USGS-01474500 "Schuylkill River at Philadelphia, PA", 39.96779, -75.18850, drainage 1,893 sq mi; 00060, 00065 and 00010 active: 1,560 cfs and 15.3 °C at 2026-10-20 02:00 UTC | verified live 2026-10-20 |
| Fairmount Dam | 39.96727, -75.18645 (Nominatim `waterway=weir`) | verified live 2026-10-20 |
| Flow statistics | 3,942 days, p50 2,020, p65 2,860, p88 5,750, p90 6,380, p95 9,070; 12.2% of days over 5,700, 5.0% over 9,000 | verified live 2026-10-20 |
| River forecast | NWPS PADP1, `usgsId` 01474500, MARFC, in service, action flow 30,905 cfs; forecast issued 2026-10-19 14:24 UTC, 12 points | verified live 2026-10-20 |
| Observations | KPHL, 39.8733, -75.2268, 11,210 m, bearing 198; latest 2026-10-20 00:10 UTC with wind | verified live 2026-10-20 |
| Heading | 317 to 352 from the NHDPlus line; 330 chosen | a hint, not confirmed |
| Banks | `null`, so P1.11 generates them: right faces 60°, "northeast bank"; left faces 240°, "southwest bank" | computed |

### 4.6 Lake Quinsigamond (lake)

`data/locations/lake-quinsigamond.json`:

```json
{
  "v": 1,
  "id": "716db5dc-c0f5-4f1e-905d-7725d95b78e4",
  "slug": "lake-quinsigamond",
  "name": "Lake Quinsigamond",
  "shortName": "Quinsigamond",
  "subtitle": "Lake Quinsigamond at the Donahue Rowing Center.",
  "locality": "Shrewsbury, MA",
  "waterway": "lake-quinsigamond",
  "lat": 42.29043,
  "lon": -71.75505,
  "tz": "America/New_York",
  "tzLabel": null,
  "country": "US",
  "region": "US-MA",
  "waterType": "lake",
  "course": {
    "kind": "heading",
    "heading": 166,
    "reachWord": null,
    "confirmed": false,
    "note": "Estimate along the lake's long axis, rowing south from the dock. Not checked on the water."
  },
  "banks": null,
  "thresholds": {
    "windCaution": 10, "windOff": 15, "gustCaution": 18, "gustOff": 25,
    "rainCaution": 60, "rainOff": 90, "coldCombined": 100,
    "aqiCaution": 151, "aqiOff": 201
  },
  "aqiScale": "us",
  "flow": null,
  "water": { "mode": "fetch", "refFetchM": 2000, "lake": { "axis": 166, "lengthM": 6600, "widthM": 370 }, "fetchM": null },
  "fog": null,
  "waterTemp": { "fallback": "none", "maxAgeH": 72 },
  "tide": null,
  "daylight": null,
  "copy": {
    "description": "Go, caution or stay off: rowing conditions on Lake Quinsigamond, Shrewsbury, MA.",
    "credits": "Forecast from [Open-Meteo](https://open-meteo.com/). Alerts and Worcester airport observations from the [National Weather Service, Boston](https://www.weather.gov/box/). Air quality from Open-Meteo (Copernicus CAMS), and the model comparison from GFS, ECMWF, GEM and ICON via Open-Meteo."
  },
  "launchNotes": null,
  "status": "published",
  "sources": [
    {
      "role": "alerts", "adapter": "nws-alerts", "ref": "zones:MAZ012,MAC027", "label": "NWS"
    },
    {
      "role": "obs", "adapter": "nws-obs", "ref": "KORH", "label": "Worcester",
      "note": "Worcester airport, 6 mi west. A check on the model.",
      "siteLat": 42.2706, "siteLon": -71.8731, "distanceM": 9959, "relation": "nearby"
    }
  ]
}
```

`data/waterways/lake-quinsigamond.json`:

```json
{
  "v": 1,
  "id": "lake-quinsigamond",
  "name": "Lake Quinsigamond",
  "reach": null,
  "kind": "lake",
  "country": "US",
  "regions": ["US-MA"],
  "geometry": null,
  "traffic": null,
  "notes": null,
  "sources": []
}
```

| Fact | Value | Status |
| --- | --- | --- |
| Dock point | 42.2904326, -71.7550479, `leisure=sports_centre` "Donahue Rowing Center, North Quinsigamond Avenue, Shrewsbury" (Nominatim) | verified live 2026-10-20; not confirmed |
| NWS point | BOX, grid 49,94, MAZ012 "Southern Worcester", MAC027 "Worcester", `America/New_York`; the same at 42.2904, -71.7600 across the lake | verified live 2026-10-20 |
| Office | BOX, "Boston / Norton, MA" | verified live 2026-10-20 |
| Lake | OSM relation 1272518, `water=lake`, bbox 42.2436 to 42.3032 N; computed axis 166°, length 6,609 m, mean width 367 m, area 2.43 km²; the dock is 64 m from the outline | verified live 2026-10-20; the ellipse is an estimate |
| Gauges | USGS-01110000 Quinsigamond River at North Grafton, the outlet river 7.5 km south: not the lake, not bound | verified live 2026-10-20 |
| Observations | KORH Worcester Regional Airport, 42.2706, -71.8731, 9,959 m, bearing 257; latest 2026-10-20 00:10 UTC with wind | verified live 2026-10-20 |
| Course | A heading course along the axis, so wind against the course works on a lake with a straight course (01 9.3: chop from fetch, wind vs course from the heading) | a hint, not confirmed |
| Banks | `null`, word "shore" for a lake: right faces 256°, "west shore"; left "east shore" | computed |

### 4.7 Lake Natoma (reservoir below a dam)

`data/locations/lake-natoma.json`:

```json
{
  "v": 1,
  "id": "aaa14756-a9cd-4270-8ae7-6db7d94445b8",
  "slug": "lake-natoma",
  "name": "Lake Natoma",
  "shortName": "Natoma",
  "subtitle": "Lake Natoma above Nimbus Dam. Releases from Folsom Dam can change the current.",
  "locality": "Gold River, CA",
  "waterway": "lake-natoma",
  "lat": 38.63453,
  "lon": -121.21918,
  "tz": "America/Los_Angeles",
  "tzLabel": null,
  "country": "US",
  "region": "US-CA",
  "waterType": "reservoir",
  "course": {
    "kind": "heading",
    "heading": 31,
    "reachWord": null,
    "confirmed": false,
    "note": "Estimate along the lake from the aquatic center. Not checked on the water."
  },
  "banks": null,
  "thresholds": {
    "windCaution": 10, "windOff": 15, "gustCaution": 18, "gustOff": 25,
    "rainCaution": 60, "rainOff": 90, "coldCombined": 100,
    "aqiCaution": 151, "aqiOff": 201
  },
  "aqiScale": "us",
  "flow": null,
  "water": { "mode": "fetch", "refFetchM": 2000, "lake": { "axis": 31, "lengthM": 9700, "widthM": 230 }, "fetchM": null },
  "fog": null,
  "waterTemp": { "fallback": "none", "maxAgeH": 72 },
  "tide": null,
  "daylight": null,
  "copy": {
    "description": "Go, caution or stay off: rowing conditions on Lake Natoma, Gold River, CA.",
    "credits": "Forecast from [Open-Meteo](https://open-meteo.com/). Alerts and Sacramento Executive Airport observations from the [National Weather Service, Sacramento](https://www.weather.gov/sto/). Water temperature from USGS gauge [11446500 at Fair Oaks](https://waterdata.usgs.gov/monitoring-location/USGS-11446500/). Air quality from Open-Meteo (Copernicus CAMS), and the model comparison from GFS, ECMWF, GEM and ICON via Open-Meteo."
  },
  "launchNotes": null,
  "status": "published",
  "sources": [
    {
      "role": "alerts", "adapter": "nws-alerts", "ref": "zones:CAZ154,CAC067", "label": "NWS"
    },
    {
      "role": "obs", "adapter": "nws-obs", "ref": "KSAC", "label": "Sacramento",
      "note": "Sacramento Executive Airport, 17 mi southwest. A check on the model.",
      "siteLat": 38.5067, "siteLon": -121.496, "distanceM": 27950, "relation": "nearby"
    },
    {
      "role": "water_temp", "mode": "primary", "adapter": "usgs-ogc", "ref": "USGS-11446500",
      "params": { "parameterCode": "00010" }, "unit": "degC", "tz": "America/Los_Angeles",
      "label": "Fair Oaks",
      "note": "USGS gauge on the American River just below Nimbus Dam, about 0.5 mi west. It measures water leaving the lake.",
      "siteLat": 38.63544, "siteLon": -121.22769, "distanceM": 746, "relation": "downstream"
    }
  ]
}
```

`data/waterways/lake-natoma.json`:

```json
{
  "v": 1,
  "id": "lake-natoma",
  "name": "Lake Natoma",
  "reach": "Folsom Dam to Nimbus Dam",
  "kind": "reservoir",
  "country": "US",
  "regions": ["US-CA"],
  "geometry": null,
  "traffic": null,
  "notes": null,
  "sources": []
}
```

| Fact | Value | Status |
| --- | --- | --- |
| Dock point | 38.6345271, -121.2191758, `landuse=recreation_ground` "Sacramento State Aquatic Center, Gold River" (Nominatim) | verified live 2026-10-20; not confirmed |
| Nimbus Dam | 38.63621, -121.21977 (Nominatim `waterway=dam`), 190 m north of the dock point | verified live 2026-10-20 |
| NWS point | STO, grid 51,69, CAZ154 "Sacramento Metro and Western El Dorado and Amador Counties", CAC067 "Sacramento", `America/Los_Angeles`; the same zones up the lake to 38.65, -121.19 | verified live 2026-10-20 |
| Office | STO, "Sacramento, CA" | verified live 2026-10-20 |
| Lake | OSM relation 4618002, `water=reservoir`; computed axis 31°, length 9,747 m (the lake bends, so this overstates a straight fetch; the fetch factor is capped at 8 km anyway), mean width 227 m, area 2.21 km² | verified live 2026-10-20; the ellipse is an estimate |
| Water temperature | USGS-11446500 "AMERICAN R A FAIR OAKS CA", 38.63544, -121.22769, PST with daylight saving; 00010 active, 17.2 °C at 2026-10-20 02:30 UTC; also 00060 and 00065. USGS-11446220 below Folsom Dam (9.1 km NE) read 14.5 °C | verified live 2026-10-20 |
| Flow | none bound. A reservoir has no flow reason (01 9.1). Fair Oaks flow measures Nimbus releases below the lake; 01 9.3 puts dam releases in the copy, with no release adapter. The subtitle says it | decision |
| Observations | KSAC Sacramento Executive Airport, 27,950 m, bearing 240, latest 2026-10-20 00:10 UTC with wind. KMHR Mather (10.0 km) is closer, but its latest observation was 2026-10-19 18:35 UTC, over 8 hours old during the check, so 02's step 5 rule (under 3 hours, with wind) picks KSAC | verified live 2026-10-20. The builder of P1.13 rechecks KMHR and switches to it if its feed is current, with a note in the progress entry |
| Time zone | `America/Los_Angeles`: the subtitle reads "All times Pacific" and adds "3 hours behind you" for an Eastern viewer | verified live 2026-10-20 (NWS point and Open-Meteo air quality `timezone`) |
| Banks | `null`, shore: right faces 121°, "southeast shore"; left "northwest shore" | computed |

### 4.8 Thompson Boat Center (tidal)

`data/locations/thompson-boat-center.json`:

```json
{
  "v": 1,
  "id": "7d5b2373-881c-4277-ab43-c6062864dd2f",
  "slug": "thompson-boat-center",
  "name": "Thompson Boat Center",
  "shortName": "Thompson",
  "subtitle": "Tidal Potomac River at Georgetown.",
  "locality": "Washington, DC",
  "waterway": "potomac-river-tidal",
  "lat": 38.90053,
  "lon": -77.05834,
  "tz": "America/New_York",
  "tzLabel": null,
  "country": "US",
  "region": "US-DC",
  "waterType": "tidal",
  "course": {
    "kind": "heading",
    "heading": 285,
    "reachWord": "straight",
    "confirmed": false,
    "note": "Estimate from the mapped river line upstream of the dock. Not checked on the water."
  },
  "banks": {
    "word": "bank",
    "left": { "short": "VA", "name": "Virginia" },
    "right": { "short": "DC", "name": "Georgetown" }
  },
  "thresholds": {
    "windCaution": 10, "windOff": 15, "gustCaution": 18, "gustOff": 25,
    "rainCaution": 60, "rainOff": 90, "coldCombined": 100,
    "flowCaution": 22000, "flowOff": 35000, "aqiCaution": 151, "aqiOff": 201,
    "basis": { "flow": "usgs-ogc:USGS-01646500:cfs" }
  },
  "aqiScale": "us",
  "flow": {
    "measure": "discharge",
    "unit": "cfs",
    "against": null,
    "maxAgeH": 24,
    "staleSwitchH": 6
  },
  "water": { "mode": "tidal", "cross": 0.4 },
  "fog": null,
  "waterTemp": { "fallback": "none", "maxAgeH": 72 },
  "tide": {
    "floodHeading": 285,
    "unit": "ft",
    "streamCaution": null,
    "streamOff": null,
    "minLaunch": null,
    "slackMin": 30,
    "against": null
  },
  "daylight": null,
  "copy": {
    "description": "Go, caution or stay off: rowing conditions on the tidal Potomac at Thompson Boat Center, Washington, DC.",
    "flowStats": "Since 2016 the median day at Little Falls is about 6,500 cfs. 22,000 is the top 12% of days, 35,000 the top 5%.",
    "flowHow": "Flow is measured at the USGS gauge at Little Falls, about 5 mi upstream in a straight line. The forecast is from the NWS Middle Atlantic River Forecast Center for the same gauge. At the dock the tide also moves the water.",
    "credits": "Forecast from [Open-Meteo](https://open-meteo.com/). Alerts, including the marine zone for the tidal Potomac, and Reagan National observations from the [National Weather Service, Baltimore/Washington](https://www.weather.gov/lwx/). River flow and water temperature from USGS gauge [01646500 at Little Falls](https://waterdata.usgs.gov/monitoring-location/USGS-01646500/). River and tide forecasts from the [NWS Middle Atlantic River Forecast Center](https://water.noaa.gov/gauges/gtnd2). Air quality from Open-Meteo (Copernicus CAMS), and the model comparison from GFS, ECMWF, GEM and ICON via Open-Meteo."
  },
  "launchNotes": null,
  "status": "published",
  "sources": [
    {
      "role": "alerts", "adapter": "nws-alerts", "ref": "zones:DCZ001,DCC001,VAZ054,VAC013,ANZ535", "label": "NWS"
    },
    {
      "role": "obs", "adapter": "nws-obs", "ref": "KDCA", "label": "Reagan National",
      "note": "Reagan National Airport, 4 mi south-southeast. A check on the model.",
      "siteLat": 38.8483, "siteLon": -77.0342, "distanceM": 6172, "relation": "nearby"
    },
    {
      "role": "water_temp", "mode": "primary", "adapter": "usgs-ogc", "ref": "USGS-01646500",
      "params": { "parameterCode": "00010" }, "unit": "degC", "tz": "America/New_York",
      "label": "Little Falls",
      "note": "USGS gauge at Little Falls, about 5 mi upstream.",
      "siteLat": 38.94978, "siteLon": -77.12764, "distanceM": 8120, "relation": "upstream"
    },
    {
      "role": "tide", "mode": "primary", "adapter": "nwps", "ref": "GTND2", "unit": "ft",
      "label": "Georgetown",
      "note": "NWS tide forecast for the Potomac at Wisconsin Avenue, about 0.5 mi upstream.",
      "siteLat": 38.903361, "siteLon": -77.067667, "distanceM": 866, "relation": "upstream"
    }
  ]
}
```

`data/waterways/potomac-river-tidal.json`:

```json
{
  "v": 1,
  "id": "potomac-river-tidal",
  "name": "Potomac River",
  "reach": "Tidal Potomac below Little Falls",
  "kind": "tidal",
  "country": "US",
  "regions": ["US-DC", "US-VA", "US-MD"],
  "geometry": null,
  "traffic": null,
  "notes": null,
  "sources": [
    {
      "role": "flow", "mode": "primary", "priority": 0,
      "adapter": "usgs-ogc", "ref": "USGS-01646500", "params": { "parameterCode": "00060" },
      "unit": "cfs", "tz": "America/New_York",
      "label": "Little Falls",
      "note": "USGS gauge at Little Falls, about 5 mi upstream.",
      "siteLat": 38.94978, "siteLon": -77.12764,
      "distanceM": 8120, "riverM": null, "relation": "upstream",
      "stats": { "from": "2016-01-01", "to": "2026-10-18", "days": 3942,
                 "p50": 6490, "p65": 9760, "p88": 22200, "p90": 25000, "p95": 35800 }
    },
    {
      "role": "flow_forecast", "mode": "primary", "priority": 0,
      "adapter": "nwps", "ref": "BRKM2", "unit": "cfs",
      "label": "NWS Middle Atlantic River Forecast Center"
    }
  ]
}
```

| Fact | Value | Status |
| --- | --- | --- |
| Dock point | 38.900527, -77.0583371, `leisure=park` "Thompson's Boat Center, 2900, Georgetown" (Nominatim) | verified live 2026-10-20; not confirmed |
| NWS point | LWX, grid 96,71, DCZ001, DCC001, `America/New_York` | verified live 2026-10-20 |
| Zones | Virginia bank at 38.8960, -77.0720: VAZ054 "Arlington/Falls Church/Alexandria", VAC013 "Arlington". On the river at 38.9010, -77.0650 and 38.8800, -77.0400: ANZ535 (coastal) "Tidal Potomac from Key Bridge to Indian Head MD". All LWX ("Baltimore/Washington") | verified live 2026-10-20 |
| Active alert | A Small Craft Advisory for ANZ535 and ANZ536, 2026-10-20 08:00 to 18:00 EDT, from "NWS Baltimore MD/Washington DC", came back from the five-zone request. The dock point alone returns DCZ001 and DCC001 only, so it would have missed it (02 Summary of findings 7) | verified live 2026-10-20 |
| Flow gauge | USGS-01646500 "POTOMAC RIVER NEAR WASH, DC LITTLE FALLS PUMP STA", 38.94978, -77.12764, drainage 11,560 sq mi; 5,850 cfs and 16.7 °C at 2026-10-20 01:50 UTC. It has five 00010 series in `latest-continuous`, four of them ended in 2019 (section 10) | verified live 2026-10-20 |
| Flow statistics | 3,942 days, p50 6,490, p65 9,760, p88 22,200, p90 25,000, p95 35,800; 12.1% of days over 22,000, 5.4% over 35,000 | verified live 2026-10-20 |
| River forecast | NWPS BRKM2 "Potomac River near Washington DC (Little Falls)", `usgsId` 01646500, MARFC, in service, action flow 22,000 cfs; forecast issued 2026-10-19 14:19 UTC, 12 points | verified live 2026-10-20 |
| Tide | NWPS GTND2 "Potomac River at Georgetown / Wisconsin Ave", 38.9033611, -77.0676667, `usgsId` 01647600; forecast `primaryName` "Tide Height", `primaryUnits` "ft", `secondary` -999, 72 hourly points from 2026-10-20 01:00 UTC, issued 00:55 UTC. Highs 5.2 to 5.9 ft, lows 2.4 to 3.0 ft, about 6 hours apart. Flood categories by stage: action 5.5 ft, minor 6, moderate 7, major 10. Observed series at `/stageflow/observed` (7,120 points) | verified live 2026-10-20 |
| CO-OPS | Nearest tide prediction and water level station: 8594900 Washington, Washington Channel, 4.4 km SE, a different channel. Nearest current stations: Washington Channel (ACT5921, 5.3 km), Hains Point (ACT5906, 6.3 km), all on other water. None is bound (section 9) | verified live 2026-10-20 |
| Observations | KDCA, 38.8483, -77.0342, 6,172 m, bearing 160; latest 2026-10-20 00:10 UTC with wind | verified live 2026-10-20 |
| Heading | 281 to 289 from the NHDPlus Potomac line upstream; 285 chosen. A snap at the dock point itself lands on Rock Creek, which runs north; the snap was moved into the river at 38.8990, -77.0605 | a hint, not confirmed |
| Flow against | `null`: on a tidal reach the current turns with the tide, so no river multiplier is used (P1.14) | decision |
| Little Falls as the head of tide | from general knowledge and the site name, not checked against a tidal datum | unverified |

### 4.9 Lake Carnegie (lake with no gauge)

`data/locations/lake-carnegie.json`:

```json
{
  "v": 1,
  "id": "c36d7b04-2897-4fc5-a19b-870a2998b370",
  "slug": "lake-carnegie",
  "name": "Lake Carnegie",
  "shortName": "Carnegie",
  "subtitle": "Lake Carnegie at the Shea Rowing Center.",
  "locality": "Princeton, NJ",
  "waterway": "lake-carnegie",
  "lat": 40.33932,
  "lon": -74.65048,
  "tz": "America/New_York",
  "tzLabel": null,
  "country": "US",
  "region": "US-NJ",
  "waterType": "lake",
  "course": { "kind": "none" },
  "banks": null,
  "thresholds": {
    "windCaution": 10, "windOff": 15, "gustCaution": 18, "gustOff": 25,
    "rainCaution": 60, "rainOff": 90, "coldCombined": 100,
    "aqiCaution": 151, "aqiOff": 201
  },
  "aqiScale": "us",
  "flow": null,
  "water": { "mode": "fetch", "refFetchM": 2000, "lake": { "axis": 35, "lengthM": 4800, "widthM": 200 }, "fetchM": null },
  "fog": null,
  "waterTemp": { "fallback": "none", "maxAgeH": 72 },
  "tide": null,
  "daylight": null,
  "copy": {
    "description": "Go, caution or stay off: rowing conditions on Lake Carnegie, Princeton, NJ.",
    "credits": "Forecast from [Open-Meteo](https://open-meteo.com/). Alerts and Trenton airport observations from the [National Weather Service, Mount Holly](https://www.weather.gov/phi/). Air quality from Open-Meteo (Copernicus CAMS), and the model comparison from GFS, ECMWF, GEM and ICON via Open-Meteo."
  },
  "launchNotes": null,
  "status": "published",
  "sources": [
    {
      "role": "alerts", "adapter": "nws-alerts", "ref": "zones:NJZ015,NJC021,NJZ012,NJC023", "label": "NWS"
    },
    {
      "role": "obs", "adapter": "nws-obs", "ref": "KTTN", "label": "Trenton",
      "note": "Trenton airport, 10 mi west-southwest. A check on the model.",
      "siteLat": 40.2764, "siteLon": -74.8164, "distanceM": 15713, "relation": "nearby"
    }
  ]
}
```

`data/waterways/lake-carnegie.json`:

```json
{
  "v": 1,
  "id": "lake-carnegie",
  "name": "Lake Carnegie",
  "reach": null,
  "kind": "lake",
  "country": "US",
  "regions": ["US-NJ"],
  "geometry": null,
  "traffic": null,
  "notes": null,
  "sources": []
}
```

| Fact | Value | Status |
| --- | --- | --- |
| Dock point | 40.3393171, -74.6504762, `leisure=sports_centre` "Shea Rowing Center, Faculty Road, Princeton, Mercer County" (Nominatim) | verified live 2026-10-20; not confirmed |
| NWS point | PHI, grid 65,99, NJZ015 "Mercer", NJC021 "Mercer", `America/New_York`. The east half of the lake, at 40.35, -74.62 and toward Kingston, is NJZ012 "Middlesex", NJC023 "Middlesex" | verified live 2026-10-20 |
| Lake | OSM relation 1917455, `water=reservoir` (01 7.5 counts it a lake; so does this plan), bbox 40.3345 to 40.3711 N; computed axis 35°, length 4,758 m, mean width 196 m, area 0.93 km² | verified live 2026-10-20; the ellipse is an estimate |
| Gauges | USGS-01401000 Stony Brook at Princeton and USGS-01460440 Delaware and Raritan Canal at Port Mercer: feeders and a canal, not the lake. None bound | verified live 2026-10-20 |
| Observations | KTTN, 40.2764, -74.8164, 15,713 m, bearing 244; latest 2026-10-20 00:10 UTC with wind | verified live 2026-10-20 |
| Course | `none`: the course is not set, so the compass draws the lake and the wind facts give no head or crosswind (07 6.7) | decision, to test that path |

### 4.10 Fixtures the builders record

CI never calls a live API. Each step that adds a parser or a location records what it needs into `test/fixtures/sources/`, with the requests in 4.2, and commits the files with the step:

- P1.8: `usgs-latest-01646500.json` (the five 00010 series), `alerts-anz535.json` (any Small Craft Advisory answer, or the variant's own if none is active), `flowdays-est.json` (a daily answer with dates on both sides of 2026-11-01).
- P1.12: per location, the latest, continuous, daily and NWPS forecast answers for its gauges, and its observation, under `test/fixtures/sources/<slug>/`.
- P1.13: Fair Oaks latest (`11446500`, 00010 only) and the three observations.
- P1.14: `gtnd2-forecast.json` and `brkm2-forecast.json`.

The browser fixtures do not use these files. They answer every location from the golden scenarios with the ids filled in (P1.12), so the page tests stay repeatable at any clock.
