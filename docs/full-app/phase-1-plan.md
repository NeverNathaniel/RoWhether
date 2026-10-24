# Phase 1 build plan: many locations

The commit by commit build sequence for phase 1, on `dev-full-app`. Sonnet builders follow it one step at a time, each step with an independent gate, then an Opus review closes the phase (HANDOFF step 12). A builder should not need to reread 01 to 08 to build a step: each step names its files, what changes, its tests, its browser checks and when it is done. Where a step cites a section of 01 to 08, the section holds the full copy or rule, and the step says which part applies.

Written 2026-10-20 by session 015Sq3rx (Opus) against `dev-full-app` at `30fef7a`. The review in `reviews/phase-1-plan.md` (R1 to R21) was applied on 2026-10-22 with the owner's decisions of 2026-10-21; where a step carries a finding's id, the finding says why. Facts are marked:

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

What a Putney regular sees change is mostly the short list in 07 3.2: a chevron after "Putney Landing", compass bank labels that turn with the river, share links to `rowhether.com/putney-landing`, "Saved 6:41 AM" in place of "Saved data from 6:41 AM", and a footer that credits the right NWS offices. An existing install opens at `/putney-landing` with its settings and saved forecast. Section 3.7 lists every smaller change too, step by step.

The prototype list is Putney Landing plus six test locations chosen by the owner on 2026-10-20, one or two per water type: Hanover boathouse and Boathouse Row (river), Lake Quinsigamond (lake), Lake Natoma (reservoir below a dam), Thompson Boat Center (tidal) and Lake Carnegie (lake with no gauge). None has a dock point confirmed by a club, so each shows "Not confirmed on site". Their records are written out in full in section 4, with every gauge, station, forecast point and alert zone checked live on 2026-10-20.

The build is 21 steps in 5 batches (20 numbered steps and P1.2a, added by the review, R10). The riskiest structural work comes first: the golden tools that let Putney's output change on purpose (P1.1), location files in the build (P1.2), the detail views as a lazy chunk (P1.2a), storage per location (P1.3), path routes and loading a location by its address (P1.4). Batch 2 is the header, the picker and Putney's sources. Putney's own phase 1 changes are done by P1.11, the second step of batch 3, before any other location exists. The rest of batch 3 adds the six test locations by water type. Batch 4 is day words, the Worker and the owner's tools. Batch 5 is the docs and the proof.

Main JS stays well within 08 11.2's phase 1 row of 46,700 B. P1.2a moves the nine detail views into one lazy chunk first, which takes about 15 KB off the main script (measured, R10). Putney's records also leave the main script (they come from `data/` like every other location), the picker, the Tide view and the Metrics page are lazy chunks, and some 01 items are deferred (section 9).

## 2. The owner's phase 1 decisions and how the build applies them

The owner accepted the recommendation of every Phase 1 row in `README.md`'s decisions table on 2026-10-20 (HANDOFF, "Phase 1 decisions"). Facts only the owner can supply get a placeholder that says so in the code and an entry in section 11. The table follows README's row order.

| # | Question (README) | Accepted | How the build applies it | Step | Placeholder |
| --- | --- | --- | --- | --- | --- |
| 1 | Confirm the aggregate open counter and its privacy sentence | One count per app start with the location, first visit or return, and home screen or browser. No address, device or account. Kept three months | `GET /api/info?loc=&k=&m=` writes one Analytics Engine point (`OPENS`). `/privacy` carries 07 14.3's sentence word for word | P1.16 | none |
| 2 | Set up the Cloudflare Access application and give the `ACCESS_AUD` values | Needed for the Metrics tab; Access stays in front of the owner tools after phase 2 | `worker/auth/access.js` verifies `Cf-Access-Jwt-Assertion` with `jose`. Until the owner sets the values, `/api/admin/*` answers 503 `not_configured` | P1.18 | `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` start with `OWNER-SETS-` in both `wrangler.jsonc` blocks |
| 3 | Name the app RoWhether from phase 1, with manifest id `/` | Yes | Manifest `name` and `short_name` "RoWhether", `id: '/'`, `start_url` and `scope` stay `./`. Apple title, install bar and dialog say RoWhether | P1.5 | none |
| 4 | What `/` shows on a first visit | For 90 days after phase 1, Putney Landing with "Not your water? Pick a location." | `homeTarget()` in `src/route.js`, with the window end in `FIRST_VISIT_PUTNEY_UNTIL` in `src/config.js` | P1.6 | The window end date. Set to `Date.UTC(2027, 2, 1)` and marked "PLACEHOLDER: 90 days after phase 1 reaches production. The owner sets it with the merge to master" |
| 5 | What `/` shows after the 90 days for someone who never picked | The picker | The picker page at `/` when nothing is stored and the window has ended | P1.6 | as row 4 |
| 6 | Putney alerts by NWS zones, and correct the footer and `CLAUDE.md` | Yes | Putney's alerts row becomes `zones:VTZ015,VTC025,NHZ011,NHC005`. An alert drawn as a polygon applies only when the polygon contains the dock point; a zone-only product applies to every location in its zones (owner, 2026-10-21, R15). Footer credits Albany and Gray. CLAUDE.md corrected | P1.8, P1.5 | none |
| 7 | Compass bank labels turn with the river | Yes | `compassSVG()` places the labels at the rotated offsets, text upright | P1.11 | none |
| 8 | Water state at every water type | Information only | No reason from water state, on any water type. Fetch, tidal and canal modes only change the water state text and level | P1.13 to P1.15 | none |
| 9 | Cold check with no live water temperature | Monthly typical value, labeled typical, never for steam fog. None: the check stays off | `waterTemp(m, { forCold: true })` returns a curated monthly value flagged `typical`. No test location has monthly values, so the check stays off for them until a dock reading is set | P1.9 | none (monthly values are curated data, none supplied) |
| 10 | Tides and tidal currents | Information only, no change to the verdict | No `tide` reason in `assess()`. The Tide tab and the water state text show it | P1.14 | none |
| 11 | NWS marine warnings | Stay off | `alertLevel()` gives level 2 to eight whole event names: Small Craft Advisory, Gale Warning, Storm Warning, Special Marine Warning, Hurricane Force Wind Warning, Hurricane Warning, Storm Surge Warning and Tropical Storm Warning (the last four added by the owner on 2026-10-21, R18) | P1.8 | none |
| 12 | Default limits from flow history | 88th percentile for Caution, 95th for Stay off, rounded down to two figures | The four new gauges' limits in section 4 come from this rule over 2016-01-01 to 2026-10-18. `flowDefaults()` and `scripts/locations/flowstats.mjs` reproduce it. Putney keeps 20,000 and 28,000 (02, step 8) | P1.12 to P1.14, P1.19 | none |
| 13 | Which candidate locations ship first, which clubs confirm dock points, Hartford river or tidal | None given | The owner's test set of 2026-10-20 (section 4). Every record except Putney is `status: "published"` with the badge "Not confirmed on site" and `course.confirmed: false`. Hartford is not in the set | P1.12 to P1.14 | Club confirmation of each dock point and course |
| 14 | Contact string in the Worker's User-Agent | A dedicated address the owner chooses | Phase 1 has no Worker request to NWS, Nominatim or aviationweather.gov. The curation scripts send `RoWhether/1.0 (+https://rowhether.com; OWNER-SETS-contact)` from one constant | P1.19 | `USER_AGENT` in `scripts/locations/agent.mjs` |
| 15 | Tab bar and navigation | The tab bar holds one location's parts. The name opens the switcher; the account button opens Account | The location name is a button that opens the picker sheet. No account button until phase 2. `/admin` and `/privacy` are reached by address and the footer link | P1.5, P1.6 | none |
| 16 | Approve the `CLAUDE.md` changes for phase 1 | Approve | Each approved sentence lands in the step that makes it true (R20): the golden rules in P1.1, the service worker sentence in P1.2, the routes and `src/putney.js` in P1.4, the app name and the "Saved" label in P1.5, the navigation sentence in P1.6, the NWS offices, zones, alert levels and endpoints in P1.8, staleness in P1.9. P1.20 writes the code map, the test list, the storage keys and the test locations | P1.1 to P1.9, P1.20 | none |
| 17 | Putney facts to confirm on site | Confirm the heading on site; none given for the others | The heading stays 15 with `confirmed: false` ("an estimate" in How this works). The waterway reach stays "Bellows Falls dam to Vernon dam". The water temperature note keeps "about 19 mi downstream" (straight line) | none | All three stay as today, each listed in section 11 |
| 18 | Tidal stream limits (2.0 and 3.0 kn, multipliers at 1.0 and 2.0 kn) | None given | No phase 1 location has tidal current data (section 4.8), so no stream limit or multiplier is used. The values stay in 01 9.4 for the first location with a current station | none | listed in section 11 |

## 3. The end of the phase 0 rules: golden outputs that change on purpose

Phase 0 proved "no visible change" with golden files that could not be written after P0.1 and a CI step that failed on any modified golden file (`.github/workflows/ci.yml` line 22, code at 30fef7a). 08 14.1 says those rules end at phase 1's first commit, and the owner moved that point from the PR #6 merge to phase 1's first commit on 2026-10-20 (HANDOFF log). From P1.1 the golden files are snapshots of Putney. A commit that changes Putney's output on purpose rewrites the cases it changes, and only those, and names the change. A commit that changes no behavior changes no golden file.

### 3.1 What P1.1 changes

- The comparison stays as it is: per key, with `toEqual`, and by digest for the large keys of the variants and probes. 08 14.1 preferred Vitest's `toMatchFileSnapshot`, which compares the file's text. That does not work on these files: in the 19 main cases and `p-config` the key order of the settings, the course and the water objects differs from what the capture produces today (phase 0 moved the flow keys after the AQI keys; `toEqual` ignores order), so a text comparison fails all 20 with no value changed (checked 2026-10-20 in a worktree of `622c2ef`: 20 of 107 files differ as text, 0 by value).
- The write mode becomes an update mode. `GOLDEN_UPDATE=1` rewrites the file of a case whose comparison fails, or writes a missing one, for the cases that run (so `-t` limits it to named cases), and the run then fails on purpose so an update never passes unnoticed, as the write mode did. The rewrite keeps the old file's key order and appends new keys, so `git diff` shows only the values that changed. The harness refuses to update when `CI` is set. The refusal "exists and differs. Not rewritten." (`harness.js` line 60) and the "is not in write mode" guard become the update mode's checks. P1.1 proves the change is neutral: all 107 golden files (19 main cases, 77 variants and 11 probes) pass unchanged, and an update run with nothing failing rewrites nothing.
- The CI step. `git diff --exit-code --diff-filter=MD c7967a6... HEAD -- 'test/golden/*.json'` is replaced by `node scripts/golden.mjs check c7967a64f1a9bd80ed2f0e14ee6c7ceb69d5d3ab`, described in 3.2.
- The phase 0 scaffolding goes, as 08 14.1 says: the copied old parsers and the "equal the old ones" tests in `test/sources.test.js` (the copy starts at line 16; the re-export test is at line 316), the pasted reference formatters and their two tests in `test/format.test.js` (line 5 onward), and the re-exports in `src/data.js`. Importers move to `src/sources/*.js`: `test/golden/capture.js` (`alertLevel`), `test/golden/probes.js`, `test/logic.test.js` and `test/sources.test.js`.

### 3.2 The tools

`scripts/golden.mjs` gets three commands in place of `write`, and keeps `dump`:

| Command | What it does |
| --- | --- |
| `node scripts/golden.mjs update [<case> ...]` | Runs `npx vitest run test/golden.test.js test/golden-variants.test.js -t '<pattern>'` with `GOLDEN_UPDATE=1`, where the pattern is `^golden outputs (<case>|<case>)$` built from the names, escaped. With no names it updates every case that fails. Treats the run's planned failure as success, as `write` does today. Refuses to run when `CI` is set |
| `node scripts/golden.mjs diff [<rev>]` | For each `test/golden/*.json` that differs between `<rev>` (default `HEAD`) and the working tree, prints the case name and every key path whose value changed, added or removed, one per line |
| `node scripts/golden.mjs check <base>` | For each commit in `git rev-list --reverse --no-merges <base>..HEAD -- 'test/golden/*.json'`: a deleted golden file fails. A modified file needs the commit's `Golden:` trailer (`git log -1 --format='%(trailers:key=Golden,valueonly)'`) to name change ids from `test/golden/changes.js`, and every changed path in it must match a path pattern of one of those ids, within that id's files. A new file passes (14.1's rule for additions still holds) |
| `node scripts/golden.mjs dump <case> [dir]` | As today: every captured value in full, for `diff -r` against a dump made in a worktree of the parent commit |

Key paths are dot-joined: object keys as they are, array items by index (`sources.1.1` is the alerts URL, `status.header.cached` the saved label). Patterns use `*` for one segment and `**` for any number. The pure path diff and the matcher live in `test/golden/paths.js`, imported by `scripts/golden.mjs` and tested by `test/golden-check.test.js`.

`diff` and `check` work on leaves (R2). A changed value prints its leaf path; an added or removed object or array prints every leaf under it (`home.notChecked.innerHTML`, `home.notChecked.hidden`, and so on), never only its root. Two stored shapes need care:

- The capture's own hashes, `{ length, sha256 }` for a long HTML string (`big()` and `keep()` in `test/golden/capture.js`), are ordinary leaves one segment below the value: a forecast panel that changes prints `forecasts.<id>.length` and `forecasts.<id>.sha256`, so its pattern is `forecasts.*.*`.
- A top-level key of a `v-*` or `p-*` file stored as a digest, `{ sha256, bytes }` (`trimmed()` in `test/golden/digest.js`), changes as its two leaves, `<key>.sha256` and `<key>.bytes`. `check` counts those two leaves as covered by any pattern of the id that starts with that key (`parsers.flowDays.**` covers `parsers.sha256` and `parsers.bytes`). `diff` expands the digest: it dumps the case at `<rev>`, in a temporary worktree under the scratchpad with `node_modules` linked, and in the working tree, and prints the full leaf paths that changed under the key, so the builder and the gate see which part moved and can hold it to the pattern. CI runs `check` only, so it never builds a worktree.

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
| `alerts-zones` | P1.8 | Putney's alerts by zone list (01 6.1, README row 6) | every case that records `sources`: the 19 main cases (every variant is lean and records none, R17) | `sources.1.1` |
| `usgs-v1` | P1.8 | USGS `/ogcapi/v1`, one id per gauge and `limit=50` on the latest request (02 Decision, 08 K10, section 10 here) | as `alerts-zones` | `sources.3.1`, `sources.4.1`, `sources.5.1` |
| `marine-alerts` | P1.8 | Eight whole NWS event names are Stay off: Small Craft Advisory, Gale Warning, Storm Warning, Special Marine Warning, Hurricane Force Wind Warning, Hurricane Warning, Storm Surge Warning and Tropical Storm Warning (README row 11; owner, 2026-10-21, R18). Tropical Storm Warning moves from 1 to 2 and can reach Putney (3.7) | `p-pure` (its `alertLevels`, `test/golden/probes.js` line 242, whose list gains the seven names it lacks in the same commit), and `v-june-alerts`, whose fixture has a Small Craft Advisory (`test/fixtures/variants.js` line 107) | `alertLevels.Small Craft Advisory` and the seven added names (`alertLevels.Gale Warning` and so on) in the probe; `**` in `v-june-alerts` |
| `flowdays-noon` | P1.8 | Daily means at local noon in the gauge's zone (01 15.2, 08 K11): dates in Eastern Standard Time move from 16:00 to 17:00 UTC | cases whose 30 daily means include a date outside daylight saving time. The fixtures give the 30 days before yesterday (`test/fixtures/golden.js` line 453), so the 19 main cases (May to mid October dates) do not move; the `v-spring-*` variants (February and early March dates) do, and so does a `v-fall-back-*` variant whose days reach 2026-11-01. `p-parsers` does not move: its dates are in April and P1.8 makes it pass the New York zone | `parsers.flowDays.**`, `views.river.**` |
| `not-checked` | P1.9 | The hero's `#notChecked` line (07 6.7, 01 8.4). It is hidden and empty at Putney, but the render code now writes it, and `renderNoData()` hides it too (R17) | every case: those with a model, and those without one, whose `home` and `status.noData*` record it | `home.notChecked.**`, `later.home.notChecked.**`, `status.partial.notChecked.**`, `status.partialAll.notChecked.**`, `status.noDataAll.notChecked.**`, `status.noDataForecast.notChecked.**`, `status.noDataQuiet.notChecked.**` |
| `banks` | P1.11 | Bank labels turn with the river (01 10.5, 07 3.2) | every case that draws the compass | `home.compass.innerHTML`, `later.home.compass.innerHTML`, `forecasts.*.*` |

Three of 07 3.2's five visible changes move no golden file, because the capture does not draw them: the chevron (static markup in `index.html`, and `renderPlace()` is not called by the capture), the footer credits (also `renderPlace()`), and the share link (`shareText()` returns the text only; the URL is added in `initShare()`, `src/share.js` line 22, code at 30fef7a). The browser checks in P1.5 and P1.11 prove those three. No golden file should move in P1.2, P1.2a, P1.3, P1.4, P1.6, P1.7, P1.10 or P1.12 onward. If one does, it is a finding.

### 3.5 How the parity spec follows

`test/browser/parity.spec.js` compares the real page with the golden files. It reads the files at run time, so a rewritten case is compared as rewritten. Four changes keep it honest:

- P1.2a: a tab is compared once its view has drawn, waiting for `#detailBody[data-view="<key>"]`, since the views load as a lazy chunk.
- P1.4: it loads `/putney-landing`, Putney's own address, not `/` (line 94, code at 30fef7a). `/` is covered by `picker.spec.js` and the smoke spec, because from P1.6 an empty browser at `/` shows the "Not your water?" note.
- P1.5: `ready()` in `test/browser/fixtures.js` (line 76) accepts "Saved" in place of "Saved data from", and so do the three smoke and timing checks that wait for that label (`smoke.spec.js` lines 262 and 312, `timing.spec.js` line 82).
- P1.9: it skips nothing new. `#notChecked` is in the golden files from P1.9 and hidden on both sides.

It keeps `timezoneId: 'Pacific/Auckland'` and `locale: 'de-DE'` (line 25), so a line that reads the viewer's zone still fails. The subtitle's "hours behind you" phrase is not compared by parity, because `renderPlace()` is not captured; `test/header.test.js` and the Chicago check in P1.5 cover it.

### 3.6 Screenshots as a before and after tool

The `@visual` screenshots are local and git-ignored (FD3). Before P1.1, on the machine that runs the final proof, make a baseline from `30fef7a` in a worktree as `test/browser/screens.spec.js`'s header says, and keep it with `VISUAL_BASELINE` pointing at it. In P1.20 run `npx playwright test --grep @visual` against it. Every failing image must differ only where 07 3.2 says: the chevron after the title, the compass bank labels, the footer credits, and the "Saved" label (no screenshot shows the offline label, so expect three). Playwright writes the diff images next to the results; the proof records which screenshots differ and that each difference is one of the three. The spec stays at `maxDiffPixelRatio: 0` as the before and after tool. From P1.4 it loads `/putney-landing` (R6), and phase 1 adds no footer link (P1.16), so no shot gains the pick note or a Privacy link. It sets no `timezoneId` today (`screens.spec.js`, code at 30fef7a), so it runs in the machine's zone; from P1.5 the subtitle names the difference between the viewer's zone and the location's, so P1.5 sets `timezoneId: 'America/New_York'` in that spec, a Putney regular's zone. Before P1.5 the zone changed nothing on screen, so the `30fef7a` baseline made in any zone still compares.

### 3.7 Every change a Putney regular can see

07 3.2's phase 1 row names five changes. Phase 1 makes more that a Putney regular can meet, each from a decision the owner accepted (README's Phase 1 rows on 2026-10-20, the review decisions on 2026-10-21) or a spec section the plan cites. This is the full list, by step (R21). Exit criterion 2 is read against it, and 07 3.2's phase 1 row points here.

| Step | What a Putney regular can see | Source | Golden id | Proven by |
| --- | --- | --- | --- | --- |
| P1.2a | The first tab opened in a visit shows "Loading." until the views chunk is read from the precache | R10 | none | P1.2a's unit test and browser checks |
| P1.4 | In a browser, an old link `rowhether.com/#wind`, or `/` with a stored location, becomes `/putney-landing#wind` in the address bar, with no reload. The installed app shows no address | 07 3.2 step 3 | none | P1.4's smoke checks |
| P1.5 | A chevron after "Putney Landing" in the title (07 3.2) | README row 15 | none | P1.5's browser checks, `@visual` |
| P1.5 | "Saved 6:41 AM" in place of "Saved data from 6:41 AM" (07 3.2), and "Saved Mon 6:41 AM" when the saved copy is from an earlier day. A label with a day or minutes can put Settings on a second row at 360 px (owner, 2026-10-24) | 07 6.7; owner, 2026-10-21, R1 and 2026-10-24 | `saved` | the golden files, P1.5's header tests, `picker.spec.js` |
| P1.5 | The footer credits name the NWS offices in Albany and Gray, with links (07 3.2) | README row 6 | none | P1.5's browser checks, `@visual` |
| P1.5 | The subtitle adds ", 1 hour ahead of you" and the like on a device set to another zone. A device on Eastern time sees today's subtitle | 07 6.1, 7.9 | none | `test/header.test.js`, the Chicago check |
| P1.5 | The app is named RoWhether in the manifest and for new installs. The install bar says "Add RoWhether to your home screen. It opens on Putney Landing in one tap.", and the install dialog and Settings notes take 07 6.4's text. An existing home screen icon keeps its label | README row 3; 07 6.3, 6.4 | none | P1.5's browser checks |
| P1.5 | In a browser 576 to 703 px wide, the install bar puts its buttons under its sentence. It had them beside it from 576 px, which left the sentence 96 px with Don't show again. Below 576 px and from 704 px (44 rem) it is as before | owner, 2026-10-24 | none | P1.5's smoke check "the sentence keeps room beside the actions" |
| P1.6 | Tapping the location name opens the picker, a sheet with the list of locations, a search box, Recent and Close (the chevron of P1.5 is its handle). An existing install, or any browser with a location stored, opens `/` as before: no note, no picker page. A first visit to `/` with nothing stored sees Putney Landing with the note "Not your water? Pick a location." until 1 March 2027 (a placeholder the owner sets), and the picker page after it | 07 3.2, 5.1, 5.2; README rows 4, 5 and 15 | none | `picker.spec.js`, `route.test.js` |
| P1.8 | Alerts for the Vermont bank's zones, VTZ015 and VTC025, apply as well as New Hampshire's. A warning drawn as a polygon applies only when the polygon contains the dock, as today's point query gives | README row 6; owner, 2026-10-21, R15 | `alerts-zones` | P1.8's source tests |
| P1.8 | A Tropical Storm Warning gives Stay off, not Caution | owner, 2026-10-21, R18 | `marine-alerts` | `p-pure`, P1.8's source tests |
| P1.8 | On the River tab, a winter day's 30-day mean sits at local noon, an hour later than today | 01 15.2, 08 K11 | `flowdays-noon` | the golden variants |
| P1.9 | Flow over 24 hours old no longer counts toward Go, Caution or Stay off, and the hero says "River flow not checked: the gauge has not reported for 2 days." A water temperature over 72 hours old is not used for the cold check | 01 6.3, 15.7, 8.4; 09 phase 1 safety items | none (the capture's readings are fresh) | P1.9's unit tests and smoke check |
| P1.9 | When a refresh fails: "No data." in place of a forecast over 24 hours old, and "Official alerts not checked: no answer from NWS for 2 hours." once the alerts are over an hour old. At start and while a refresh is in flight, the saved copy shows as today | 02, 08 K9; owner, 2026-10-21, R1 | `not-checked` (the hidden, empty line only) | P1.9's smoke checks |
| P1.10 | Settings: placeholders "Location default 10", a "Your setting. Location default 10." line under a changed field, the intro note "Match these to your program, boat class and coach coverage. Saved in this browser for Putney Landing.", Reset named "Use location defaults", and the flow limits may be left blank | 01 11.6; 07 5.13 | none | `test/settings.test.js`, `settings.spec.js` |
| P1.11 | Share links point to `rowhether.com/putney-landing` (07 3.2). The text adds " Eastern" after the time only on a device in another zone | 07 6.2 | none | P1.11's browser checks |
| P1.11 | The compass bank labels turn with the river (07 3.2) | README row 7 | `banks` | the golden files, `@visual` |
| P1.15 | On the two nights a year the clocks change, late evening day words name the right day | 08 9.3 | none | P1.15's format tests |
| P1.16 | The install dialog's note and the Settings intro note end with "How RoWhether counts app opens.", linked to the new `/privacy` page. The footer does not change | 07 6.6, 14.3; owner, 2026-10-21, R6 | none | P1.16's smoke checks |

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
- Thompson Boat Center, tidal: a Tide tab after Wind with the NWS tide height forecast for Georgetown, three days hourly, highs and lows marked "about", and flood or ebb from rising or falling water. Tide is information only and never changes Go, Caution or Stay off. The River tab and the flow limits come from Little Falls, above the tide. Alerts include marine zone ANZ535, so a Small Craft Advisory there gives Stay off (it was active during the check, section 10). There is no tidal current station on this reach (4.8), so no stream speed, no stream lines and no wind against tide multiplier.

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

Putney's location file changes in five steps, and nothing else in it changes. Each of the five also raises its `revision` by 1, from 2 at P1.2 to 6 at P1.10 (R14). Its waterway file does not change.

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

## 5. Rules for every step

These hold for every builder and every gate, on top of `CLAUDE.md` and HANDOFF's standing instructions.

1. Before a step: `git pull --no-rebase origin dev-full-app`, read `CLAUDE.md`, this step, sections 3 and 5, and every file the step names. Read the 01 to 08 sections a step cites only for the copy or rule it points at.
2. Work on `dev-full-app` only. Never touch `master` or `dev`. Never force push, rebase or amend. Never `git add -A`: commit by path (`git add <paths> && git commit -m "..." -- <paths>`). Never `git stash`, `git reset`, `git clean` or `git checkout` on a directory. Experiments go in a worktree under the scratchpad, with `node_modules` linked, removed at the end.
3. The net, at the end of every step and before every push: `npm test`, `npm run build`, `node scripts/budget.mjs`, `npx playwright test --grep-invert @visual`, `npx wrangler deploy --dry-run --outdir <scratchpad>/worker`, from P1.1 on `node scripts/golden.mjs check c7967a64f1a9bd80ed2f0e14ee6c7ceb69d5d3ab`, and from P1.2 on `node scripts/locations/revisions.mjs check c7967a64f1a9bd80ed2f0e14ee6c7ceb69d5d3ab`. All pass. A step of several commits keeps `npm test` and `npm run build` passing at each commit.
4. Golden files change only by section 3.3, with a planned id from 3.4. Anything else that moves a golden file stops the step (rule 13).
5. Budgets: section 7. A step sets `budget.json` to its row in the commit that adds the code, and the message says why. A step whose measured size is over its row first finds the saving in its own code, then uses the levers in 7.3. It never raises above its row. An overrun it cannot remove is a finding (rule 13).
6. Tests: every new rule in `src/logic.js`, parser in `src/sources/`, function in `src/location.js`, `src/storage.js`, `src/route.js` or `src/units.js` gets a unit test (CLAUDE.md). A test that depends on time pins the clock (`vi.setSystemTime`, `page.clock`) and passes the zone; none reads the machine's zone. `npm test` runs with `TZ=Pacific/Auckland`.
7. No test calls a live API. Fixtures are recorded with the requests in 4.2 and committed under `test/fixtures/sources/` (4.10). Recording sends no personal data.
8. Storage: every `localStorage` access in try/catch, through `src/storage.js` or the lazy module that owns the key. A step that adds a key adds a "storage blocked" case to its unit tests, and the smoke test "storage that throws on access" keeps passing.
9. Copy: direct, calm, short sentences, sentence case, no em or en dashes, no emojis, never "call" for the verdict in the UI. Run `grep -n -e $'\xe2\x80\x94' -e $'\xe2\x80\x93'` on each changed file. New screens keep their words in `src/copy/<screen>.js` (07 7.8).
10. Commit messages: subject `Phase 1 P1.<n>: <what changed>`, a blank line, then the trailer block: `Golden: <id>[, <id>]` when golden files changed, then the session attribution lines the builder's own system reminder gives. Pull, then push after each commit or small group; retry a failed push up to 4 times after 2, 4, 8 and 16 seconds.
11. Progress: one entry per step in `docs/full-app/phase-1-progress.md` (P1.1 creates it), newest first: date and time UTC, step, commits, test count, the budget line (main JS, CSS, HTML, precache, and each lazy chunk), golden ids moved, what was proven and by which mutations, and any deviation from this plan with its reason.
12. The gate: an independent agent, after the builder pushes. It reruns the net on a clean checkout, reads the diff against the step text, checks the budget row and every golden id (`node scripts/golden.mjs diff <first commit>^`, one dump diff), runs the step's listed mutations in a worktree (each must make a check fail), runs the step's browser checks, and writes its verdict in the progress entry. A mutation that passes is a finding the builder closes with a new check before the step counts as done.
13. Stop and report, with the finding in the progress file, pushed: a golden path outside the planned ids; a budget overrun with no saving in the step; a contradiction between this plan, 01 to 08 and the code; a live fact that disagrees with section 4; anything that would change what a Putney regular sees beyond 3.7's list.
14. HANDOFF: one log line per batch (newest first: date and time UTC, batch, session, steps and the head commit), and the first unchecked item of its plan list stays accurate.

## 6. The steps, in batches

Five batches, at most five steps each, run as one build workflow per batch. Every step lists its files, what changes, its tests, its browser checks, the golden ids it moves, the mutations its gate runs, and when it is done. File paths are repository paths. Line numbers are at `30fef7a` and move as steps land; the function names are the anchor.

### Batch 1: structure (P1.1 to P1.4, with P1.2a)

Proves at its end: the golden tools let Putney's output change on purpose and nothing else; location records come from files built into `dist/` and precached; the detail views load as one lazy chunk, the main script is about 15 KB smaller, and every view draws as before; storage is per location; the app opens a location by its address and keeps an existing install's settings and saved forecast, whatever the saved copy's age. Putney is the only location. Putney's visible changes so far: none in a golden file or a screenshot; the first tab opened in a visit shows "Loading." until the views chunk is read (3.7).

#### P1.1 The golden tools for phase 1, and the end of the phase 0 scaffolding

Files: `test/golden/harness.js`, `test/golden.test.js`, `test/golden-variants.test.js`, `scripts/golden.mjs`, new `test/golden/changes.js`, new `test/golden/paths.js`, new `test/golden-check.test.js`, `.github/workflows/ci.yml`, `src/data.js`, `test/golden/capture.js`, `test/golden/probes.js`, `test/logic.test.js`, `test/sources.test.js`, `test/format.test.js`, `budget.json`, new `docs/full-app/phase-1-progress.md`, `CLAUDE.md`.

Changes:

1. The harness keeps its per-key comparison and trades its write mode for the update mode of 3.1 (`GOLDEN_UPDATE=1`, refused under `CI`, keeping each file's key order). The FC5 checks in `test/golden.test.js` (case names equal file names, both ways) and the scenario claims stay.
2. `scripts/golden.mjs` gets `update`, `diff` and `check` (3.2) and loses `write`. The pure parts (the path diff between two parsed JSON values, the glob matcher over dot paths, reading a `Golden:` trailer) go in `test/golden/paths.js`.
3. `test/golden/changes.js` starts as `export const CHANGES = {}` with the comment block of 3.2.
4. CI: line 22 of `.github/workflows/ci.yml` becomes `- run: node scripts/golden.mjs check c7967a64f1a9bd80ed2f0e14ee6c7ceb69d5d3ab`, with a comment that the phase 0 rule ended here (08 14.1).
5. The phase 0 scaffolding goes (3.1): the parser copies and the "equal the old ones" and "are re-exported by src/data.js" tests in `test/sources.test.js`, the reference formatters and their two tests in `test/format.test.js`, the re-exports in `src/data.js`. Importers move to `src/sources/nws.js`, `usgs.js`, `nwps.js` and `openmeteo.js`.
6. `budget.json` gets `"phase": 1`, numbers unchanged.
7. `docs/full-app/phase-1-progress.md`: the header of `phase-0-progress.md`, adapted, and the first entry.
8. `CLAUDE.md` (approved in README row 16; R20): Testing's golden paragraph takes section 3's rules in place of the phase 0 ones (the files are snapshots of Putney; a commit that changes Putney's output on purpose rewrites only the cases it changes with `node scripts/golden.mjs update`, names its change ids from `test/golden/changes.js` in a `Golden:` trailer, and `node scripts/golden.mjs check c7967a6...` in CI fails anything else), and the code map's `scripts/golden.mjs` line lists `update`, `diff`, `check` and `dump`.

Tests: `test/golden-check.test.js`: the path diff finds a changed leaf, an added and a removed key, and an array item by index; an added object prints all its leaves, not its root; a changed `{ length, sha256 }` hash prints its two leaves; a changed `{ sha256, bytes }` digest is covered by a pattern under its key (`parsers.flowDays.**`) and by no pattern under another key; `*` matches one segment and `**` many; a trailer `Golden: saved, banks` reads as two ids; `check` logic on a list of fake commits (pure function over `{ files, changed paths, trailer }`): fails with no trailer, fails with an unknown id, fails when a path is outside the id's patterns or files, fails on a deleted file, passes a covered change and an added file.

Browser checks: none new. The parity spec passes unchanged.

Golden: none. `git diff c7967a6 HEAD -- 'test/golden/*.json'` is still empty.

Mutations for the gate: change one character of `test/golden/june-calm-1200-default.json` (its case fails); edit a sentence in `src/logic.js` and run `node scripts/golden.mjs update june-calm-1200-default` (only that file is rewritten, `git status` shows one golden file); the same update keeps the file's key order (`git diff` shows only the changed values, not moved keys); `CI=1 node scripts/golden.mjs update` and `CI=1 GOLDEN_UPDATE=1 npx vitest run test/golden.test.js` (both refused); delete a golden file and run `npm test` (fails, writes nothing); in a scratch worktree, commit a golden change with no trailer, then with a wrong id, then with the right id (`check` fails, fails, passes).

Done when: the net passes with no golden file changed, `check` passes on HEAD, CI is green, and the progress entry records the test count (lower than 700 by the scaffolding tests removed, each named).

#### P1.2 Location files in the build

Files: new `scripts/locations/plugin.mjs`, new `scripts/locations/revisions.mjs`, `.github/workflows/ci.yml`, `vite.config.js`, `wrangler.jsonc`, `public/_headers`, `src/location.js`, `data/locations/putney-landing.json`, `scripts/budget.mjs`, new `test/locations-data.test.js`, `CLAUDE.md` (the service worker sentence, R20).

Changes:

1. `scripts/locations/plugin.mjs` exports `collectLocations(root)`, `summaries(list)`, `recordFile(rec, waterway)`, `shellHtml(indexHtml, rec, waterway)` and `locationsPlugin()`.
   - `collectLocations` reads every `data/locations/*.json` and `data/waterways/*.json`, validates each waterway with `validateWaterway` and each location with `validateLocation(rec, { waterway })`, passing the location's own waterway record (R5; P1.10 adds the rules that need it), and also checks: the file name is the slug (or the waterway id); the waterway exists; no two records share a slug; the slug is not a name the build writes at the top of `dist/` or a file in `public/` (`assets`, `locations`, `sw`, `workbox-*`, `registerSW`, `manifest`, `privacy`, `index`, `favicon`, `icon-*`, `apple-touch-icon`); every record has `copy.credits` and `copy.description`, and a record with a flow binding has `copy.flowStats`. It throws one error whose message lists `<file>: <field> <code> <message>` per problem.
   - `summaries` returns 01 7.2's index entries (`slug`, `name`, `shortName`, `locality`, `waterway` name, `lat`, `lon`, `tz`, `country`, `region`, `waterType`, `status`, `revision` default 1) for `published` and `verified` records, sorted by slug. No `generated` field, so the build is repeatable.
   - `recordFile` is the record plus `waterwayRecord`, the whole waterway record. The app resolves sources itself with `resolveLocation(record, { waterway: record.waterwayRecord })`, one code path.
   - `shellHtml` replaces, in the built `index.html`, the `<title>`, `meta[name=description]`, `link[rel=canonical]`, `og:url`, `og:title` and `og:description`: title `${name} rowing conditions`, description `copy.description`, URL `https://rowhether.com/<slug>` (from `SITE_URL`). Nothing else in the file changes.
   - `locationsPlugin()`: `buildStart` runs `collectLocations` (an error fails the build); `generateBundle`, with `enforce: 'post'`, emits `locations/index.json`, `locations/<slug>.json` and `<slug>.html` from the bundle's `index.html` asset; `configureServer` serves the two JSON paths from memory under `vite dev`.
2. `vite.config.js`: the plugin; Workbox `globPatterns` gains `'locations/*.json'`; `globIgnores` gains `<slug>.html` for each record, computed from `data/` when the config loads (01 7.3, 08 8.4).
3. `wrangler.jsonc`: `"not_found_handling": "single-page-application"` in `assets` (08 6.7). A missing path is answered with `index.html`, also for a `fetch()` of a missing JSON file (from docs, https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/, read 2026-10-20), so the app never trusts a 200 for a location file until its body parses as that slug's record (P1.4, R4).
4. `public/_headers`: `/locations/*` with `Cache-Control: public, max-age=3600` (01 7.2).
5. `src/location.js`: `COPY_KEYS` gains `description` (up to 160 characters).
6. Putney's record gains `copy.description` (4.3).
7. `scripts/budget.mjs` also fails when a `<slug>.html` shell is in the precache list, or a record in `dist/locations/index.json` has no `locations/<slug>.json` in it.
8. Revisions (R14; 01 2.1: "Starts at 1, plus 1 on every applied change"). Putney's record gains `"revision": 2` with this step's `copy.description`; a record with no `revision` is 1. From here, every commit that edits a record, or the waterway file a record uses, raises that record's `revision` by 1 (Putney: 3 in P1.5, 4 in P1.8, 5 in P1.9, 6 in P1.10). New `scripts/locations/revisions.mjs check <base>`, run in CI after the golden check and in rule 3's net: for each commit in `git rev-list --reverse --no-merges <base>..HEAD -- data/`, each record whose file it modifies, or whose waterway file it modifies, must have a higher `revision` than in the commit's parent; an added file passes. The base is `c7967a64f1a9bd80ed2f0e14ee6c7ceb69d5d3ab`, as for the golden check: the only `data/` commit since, `d2b517b`, added the files. The pure part, `revisionProblems(commits)`, is in the same file.
9. `CLAUDE.md` (approved in README row 16; R20): the hard constraint becomes "The service worker precaches the app shell and the curated location files; it never caches API responses.", and Testing says a commit that edits a record or its waterway raises the record's `revision` (`scripts/locations/revisions.mjs check`).

Tests (`test/locations-data.test.js`): every file under `data/` passes `collectLocations`; `collectLocations` on a temporary folder fails, naming the file and field, for: a bad field, a file name that is not the slug, a missing waterway, the slugs `assets` and `icon-192`, two records with one slug, a record with no `copy.credits`; `summaries` leaves out a draft and an archived record; `recordFile` carries the waterway; `shellHtml` for Putney equals today's `dist/index.html` except canonical and `og:url` (`https://rowhether.com/putney-landing`), with title, description and Open Graph texts unchanged (01 16.4); `revisionProblems` fails a commit that edits a record without raising its `revision`, and one that edits a waterway without raising each record that uses it, and passes a raise and an added file.

Browser checks: after `npm run build && npx vite preview`, `curl -sI http://localhost:4173/putney-landing` is 200 with no redirect and serves the shell (title "Putney Landing rowing conditions", canonical `/putney-landing`); Vite preview serves `<path>.html` for `<path>` (`htmlFallbackMiddleware` in `node_modules/vite/dist/node/chunks/node.js` line 16940, read 2026-10-20), as Workers assets do. The app at `/putney-landing` draws Putney exactly as at `/` (it still ignores the path). `dist/sw.js` lists `locations/index.json` and `locations/putney-landing.json` and not `putney-landing.html`.

Golden: none.

Mutations: a record with `slug` different from its file name (the build fails); the plugin emitting the shell into the precache (budget fails); `shellHtml` leaving the canonical at `/` (test fails); `revisionProblems` ignoring waterway files (its waterway case fails); in a scratch worktree, a commit that edits Putney's record without raising `revision` (`revisions.mjs check` fails).

Done when: the net and `npx wrangler deploy --dry-run` pass, and the three files are in `dist/`.

#### P1.2a The detail views as one lazy chunk

Why (R10): the first draft of 7.1 ended 5 B under the phase row, on estimates that a prototype of P1.9 found to be about half of the real growth. The nine detail views are not needed for the first hero: every start draws Now first unless its address carries a tab hash. Measured on 2026-10-22 in a worktree of `a5386c8`, with the nine views behind one `import()`: main JS 28,368 B in place of 43,505 B (15,137 B less), the views chunk 17,198 B gzip, the precache 276.84 KiB in 18 entries, 13 distinct, and `dist/index.html` 3,616 B with no preload of the chunk. This step comes before any step adds code, so every later row has room, and it changes nothing a Putney regular sees except a moment of "Loading." on the first tab opened in a visit (3.7).

Files: new `src/render/detail/views.js`, `src/render/detail/index.js`, `test/golden/capture.js`, `scripts/budget.mjs`, `budget.json`, new `test/detail-load.test.js`, `test/browser/parity.spec.js`, `test/browser/smoke.spec.js`, `test/browser/screens.spec.js`, `docs/full-app/07-product-and-ux.md` (10.3 only).

Changes:

1. `src/render/detail/views.js` imports the nine view modules and exports `MODULES`, keyed by view key. Nothing in `src/` imports a view module except this file.
2. `src/render/detail/index.js`: `VIEWS` becomes a registry, `[{ key, name, load }]` in today's order, where each `load` is `() => import('./views.js').then(x => x.MODULES[key])`. P1.4 adds `when`; P1.14 gives Tide a `load` of its own. `VIEW_KEYS` stays until P1.4. `renderDetail()`: when the open view's module is not loaded, it writes `head(name, 'Loading.')` (today's words for a view with no data yet), starts the import once, and draws when the module arrives, if a view is still open (the one open then, not the one that asked). `#detailBody`'s `data-view` is set only when a module has drawn, so a spec waits for `#detailBody[data-view="<key>"]`. A failed import leaves "Loading." and is tried again on the next `renderDetail()`, such as the 10-minute refresh.
3. Vite names the chunk `views-<hash>.js` after the file. Workbox's `globPatterns` already precache `assets/*.js`, so it works offline from the first visit. `dist/index.html` does not preload it.
4. `test/golden/capture.js`, test code only: each view is drawn from `MODULES[v.key]`, in `VIEWS` order. The config probe reads only `key` and `name`, which the registry keeps. No golden file moves.
5. `scripts/budget.mjs` gains the lazy chunk list of 08 17.3 and exit criterion 6, starting with `[{ name: 'views', precache: true }]`: each chunk must exist in `dist/assets/` as `<name>-*.js`; `dist/index.html` must not reference it as a script or `modulepreload` (07 10.6 item 3); a chunk marked `precache: true` must be in `dist/sw.js` and one marked `precache: false` must not. It prints each chunk's gzip size. P1.6, P1.14 and P1.18 add `picker`, `tide` and `admin`.
6. `budget.json` `js` becomes 29,000 (section 7), with the measured sizes in the commit message.
7. 07 10.3 gains a row: `src/render/detail/views.js` (the nine detail views), loaded on the first tab opened or at a start whose address has a tab hash, precached, 17 KB gzip measured.

Tests (`test/detail-load.test.js`, fake page): a view whose module is not loaded shows "Loading." and no `data-view`; when the load resolves, that view's HTML is drawn and `data-view` is set; a switch to another view before the load resolves draws the other view, not the first; two `renderDetail()` calls before it resolves start one import; a rejected import keeps "Loading." and the next call tries again.

Browser checks: parity passes for every case, every opened row and every tab on every day, with its waits on `data-view`; the smoke checks that open tabs pass; a start at `/#wind` draws the Wind tab; offline after one online visit, in a context with service workers allowed, a tab opens from the precache; no request for a `views-*` chunk before the first tab opens on a page loaded without a hash; `timing.spec.js` passes (the first hero needs no view). The gate also runs `npx playwright test --grep @visual` against the local baseline (3.6): no image differs.

Golden: none.

Mutations: import one view module from `index.js` directly (main JS goes over its row of 29,000); `index.html` preloading the chunk (the lazy chunk check fails); drawing the view that asked after a switch (the unit test fails); setting `data-view` on the "Loading." state (the unit test fails).

Done when: the net passes, main JS is at or under 29,000 B, the budget report lists `views` with its size, and the gate's `@visual` run shows no difference.

#### P1.3 Storage for many locations

Files: `src/config.js`, `src/storage.js`, `test/storage.test.js`.

Changes:

1. `KEYS` gains `loc: slug => 'rowhether-loc-v1:' + slug`, `cacheIndex: 'rowhether-cache-index-v1'`, `recent: 'rowhether-recent-v1'`, `pickhint: 'rowhether-pickhint-v1'` (08 8.2). `CACHE_MAX = 10`, `RECENT_MAX = 8`.
2. `src/storage.js` gains, all guarded: `loadRecord(slug)` and `saveRecord(slug, record)` (`{ record, fetchedAt }`); `loadLast()` and `saveLast(slug)`; `touchCache(slug, now)` (the index of last opened times); `trimCaches(current, protect = [])`: while more than 10 slugs are in the index, delete the cache and record of the least recently opened slug that is neither current nor protected (favorites are phase 2), then its index entry (07 9.2); `saveCache` retries after a `QuotaExceededError` by trimming one more entry by the same rule, at most 3 times, then gives up silently; `loadRecent()`, `pushRecent(slug)` (newest first, no repeats, at most 8); `pickHintDismissed()`, `dismissPickHint()`.
3. `migrateStorage()` stops importing `src/putney.js`. It compares old settings with a frozen constant `OLD_PUTNEY_DEFAULTS`, the 13 values Putney had before phase 1 (wind 10 and 15, gusts 18 and 25, rain 60 and 90, cold line 100, water reading `''`, flow 20,000 and 28,000, AQI 151 and 201, heading 15). The old settings were made against those values, which is why they are frozen, not read from the record.

Tests (added to `test/storage.test.js`): record round trip, unreadable JSON gives null, blocked storage gives null and throws nothing; the cap: 11 slugs opened one after another evicts the oldest with its record and index entry, never the current slug or a protected one; the quota path with a stub that throws `QuotaExceededError` twice evicts two and then saves; recent order, no repeats, at most 8, blocked storage; the pick hint; `OLD_PUTNEY_DEFAULTS` equals `PUTNEY_DEFAULTS` from `src/putney.js` today (a guard that the freeze matches, so the existing migration tests keep their meaning). The existing migration tests pass unchanged.

Browser checks: none new; the smoke suite passes.

Golden: none.

Mutations: `trimCaches` evicting the current slug (a test fails); `pushRecent` keeping a repeat (fails); `OLD_PUTNEY_DEFAULTS` with heading 20 (the guard and a migration test fail).

Done when: the net passes; nothing calls the new functions yet except their tests.

#### P1.4 Path routes and opening a location by its address

The riskiest step. It changes how every page load starts. It may be built as several commits, each keeping the net green: (a) the capture and probe edits that pass against the unchanged `src/`, (b) `src/route.js` with its tests and the probe's route calls, (c) the loading and state changes, (d) the browser spec changes.

Files: `src/route.js`, `src/state.js`, new `src/locations.js`, `src/main.js`, `src/render/detail/index.js`, `src/settings.js`, `src/reports.js`, `src/suggest.js`, `src/config.js`, `index.html`, `src/styles/app.css`, `test/golden/capture.js`, `test/golden/probes.js`, new `test/route.test.js`, new `test/locations-load.test.js`, `test/settings.test.js`, `test/suggest-context.test.js`, `test/browser/parity.spec.js`, `test/browser/smoke.spec.js`, `test/browser/settings.spec.js`, `test/browser/update.spec.js` (its `TYPES` gains `'.json': 'application/json'`, R4), `test/browser/screens.spec.js` (R6), `CLAUDE.md` (item 13).

Changes:

1. Commit (a), test code only: `capture.js` draws the views in `VIEWS.filter(v => !v.when || v.when(loc))`, and the config probe (`test/golden/probes.js` line 382) lists `VIEWS.filter(v => !v.when || v.when(PUTNEY)).map(v => [v.key, v.name])`, so a view Putney does not have (Tide, P1.14) never reaches `p-config`. Both pass against the unchanged `src/`, since no view has `when` yet (R3).
   Commit (b) also moves the probe's `routes` and `noRoute` (lines 383 and 384) to `parseHash(h, keys)` with Putney's tab keys, keeping the `{ name, day }` shape and today's answers for `undefined` and `null`, so `p-config` does not move (R3).
2. `src/route.js` (07 4.2):
   - `parseRoute({ pathname, hash, search })` returns `{ page, slug, view, day, open }`. `/` (and `/index.html`) is `home`. `/<segment>`, where the segment passes `validateSlug`, is `location`. `/admin` is `admin` from P1.18 (`notfound` until then). Anything else, including a slug with capitals or a second path segment, is `notfound` with the path's words kept for the search. `open` is `picker` for `?open=picker`.
   - `parseHash(hash, keys)` is today's `parseRoute(hash)` (line 6) with the tab keys passed in, so a hash for a tab the location does not have returns null.
   - `homeTarget({ last, now })`: a stored last slug gives `{ slug: last, replace: true }`; otherwise `{ slug: 'putney-landing', keepAddress: true }`. P1.6 adds the window and the picker.
   - `navigate(href)`: `history.pushState`, then `show()`. One click handler on `document` for same-origin `a[data-nav]`, letting modifier and middle clicks through. `popstate` and `hashchange` both call `show()`.
   - `show()`: when the route's slug differs from `app.loc?.slug`, it opens that location (items 4 and 5); then it shows the tab from the hash as today. A hash for a hidden tab is replaced with no hash (`history.replaceState`), showing Now. Picking a day stays `history.replaceState` (`setDay()`).
   - `initRoutes()` builds the tab bar from `viewsFor(app.loc)`, and rebuilds it when the location changes.
3. `src/locations.js` (new):
   - `cachedRecord(slug)`: from `loadRecord()`, the record if its `v` is 1, else null.
   - `fetchRecord(slug)`: `fetch('/locations/<slug>.json')`. The answer is judged by its body, not its content type (R4): a 200 whose body parses as JSON with `v` 1 and `slug` equal to the slug asked for is `{ record }`, whatever the `Content-Type` (a static host may send `text/plain` or `application/octet-stream`, and `update.spec.js`'s server does). Anything else (404, a 200 with HTML from the single-page fallback, which fails to parse, a record for another slug) checks the index: a slug not in `locations/index.json` is `{ missing: true }`; otherwise, or on a network error, `{ failed: true }`.
   - `fetchIndex()`: `/locations/index.json`, judged by its body the same way, kept in memory once loaded.
4. `src/state.js`: nothing is resolved at import time (line 32 goes). `openLocation(record, overrides)` sets `app.record`, `app.loc` (`resolveLocation(record, { waterway: record.waterwayRecord, overrides })`), `app.defaults` (`{ ...effectiveSettings(loc), heading }`, with `heading` only for a heading course), `app.settings`, and `setZone(loc.tz)`; resets `app.data`, `app.errors`, `app.updated`, `app.fromCache`, `app.model`, `app.openPeriods`, `app.detailDay`, `app.homeScroll`; and increments `app.token`. `applyOverrides(values)` resolves again from `app.record`.
5. `src/main.js`, the start sequence:
   1. `migrateStorage()`.
   2. `parseRoute(location)`. For `home`: `homeTarget({ last: loadLast(), now })`. With `replace`, `history.replaceState` to `/<slug>` plus the hash (an old link `rowhether.com/#wind` becomes `/putney-landing#wind` with no reload).
   3. The record: `cachedRecord(slug)`, else `await fetchRecord(slug)`. The service worker answers that file from its precache, so an installed copy that has just updated reads it without the network. `missing` shows the not-found view (item 9) and makes no upstream request. `failed` with nothing cached shows "Could not load this location" with "Try again".
   4. `openLocation()`, `saveRecord()` when fetched, `touchCache()`, `saveLast(slug)` unless `keepAddress` (07 5.1 step 3: Putney shown at `/` to a first visitor does not become their location), `pushRecent(slug)`.
   5. The saved forecast (`loadCache(slug)`) renders at once, whatever its age, as today (owner, 2026-10-21, R1). Then `refresh()`.
   6. After the first render, `fetchIndex()` (answered from the precache once a new build has taken over) gives the record's `revision`. When it differs from the stored record's, the record is fetched again, saved, and the location reopened with the same overrides and drawn again, so a deploy that changes a record reaches an installed phone on its next start (R14). A record fetched more than 24 hours ago is also fetched again in the background, and saved when its `revision` changed (01 7.4 step 3).
   - `refresh()` keeps `app.token` from its start and drops its result if the location changed meanwhile, so a slow answer for one place never lands in another. The check is a pure helper in `src/state.js`, `takeRefresh(token, result)`, which returns false and changes nothing when `token !== app.token`. After `saveCache()` it calls `trimCaches(app.loc.slug)`.
   - The in-flight guard belongs to the token (R9). `refresh()` does nothing without `app.loc` (the not-found view, "Could not load this location", and from P1.6 the picker page), so the return-to-tab handler and the 10-minute timer never call `fetchAll(null)`. Today's `busy` flag becomes `app.refreshing`, the token of the refresh in flight: a refresh for the same token returns at once, as today, and a location opened meanwhile starts its own at once while the old one's answer is dropped by `takeRefresh()`. `app.refreshing` is cleared in a `finally`, so a throw never leaves it set. The pure part is `canRefresh()` in `src/state.js`.
6. `src/render/detail/index.js`: a registry entry may have `when(loc)`. It sits in the registry, not in the view module, so the tab bar can filter before any view has loaded (P1.2a). River's entry gets `when: loc => !!loc.sources.flow`. `viewsFor(loc)` filters `VIEWS`; `VIEW_KEYS` goes, and `parseHash` gets the keys from `viewsFor(app.loc)`.
7. `src/settings.js`: `FIELDS` (line 10) becomes the fixed list of the 13 fields, not `Object.keys(app.defaults)` at import time. `fill`, Reset and Save read `app.defaults` when the dialog opens. The Settings reminder's visibility is set by `refreshNudge()`, called after each `openLocation()`.
8. `src/reports.js`: dock reports show only where `app.loc.slug === REPORTS_SLUG` (`'putney-landing'`, in `src/config.js`). The `reports` table has no location until phase 3 (08 `0005`), so a report belongs to Putney.
9. `index.html` gains `<section id="notFound" class="panel" hidden>`. Not found: the tab bar, `#home` and the Refresh and Settings buttons are hidden, and the section shows "No location here" and "No location at rowhether.com/<words>." P1.6 adds the picker search under it.
10. `src/suggest.js`: the bug report context gains `location: app.loc?.slug ?? null`, and sends `settings: null` when there is no location. Today's line 38 reads `app.loc.course.heading`, which would throw on the not-found view and the picker page, where P1.6 and P1.7 offer "Suggest a location" (R9).
11. `src/putney.js` stays, for the tests and scripts. The app no longer imports it (nor does `src/storage.js` since P1.3), so Putney's two records leave the main script (08 11.2 counts 1,191 B).
12. `test/browser/parity.spec.js` loads `/putney-landing` (3.5). Its custom cases keep their saved settings; they set no last slug, which `/putney-landing` does not need. `test/browser/screens.spec.js` loads `/putney-landing` and `/putney-landing#<tab>` in place of `/` and `/#<tab>` (R6; 01 16.5 asks for `/putney-landing` to match the pre-phase-0 screenshots), so the pick note P1.6 shows at `/` never reaches a screenshot. The `30fef7a` baseline, made at `/`, draws the same page.
13. `CLAUDE.md` (approved in README row 16; R20): the hash routes line describes path routes (a location at `/<slug>`, the tab in the hash, `/` opening the last location), and the `src/putney.js` line says only the tests and scripts import it; the app reads every location from `locations/<slug>.json`.

Tests: `test/route.test.js`: `parseRoute` for `/`, `/index.html`, `/putney-landing`, `/putney-landing#wind/2026-10-14`, `/Putney-Landing`, `/api`, `/assets`, `/ab`, `/putney-landing/extra`, `?open=picker`; `parseHash` with Putney's keys and with a location without flow (`#river` is null); `homeTarget` with and without a last slug. `test/locations-load.test.js` (fetch stubbed): `fetchRecord` for a JSON body served as `application/json`, `text/plain` and `application/octet-stream` (all `{ record }`), a JSON body for another slug, an HTML 200 for a slug in the index (`failed`) and not in it (`missing`), a 404, a network error; `cachedRecord` with `v: 2` gives null; `takeRefresh` with an old token leaves `app.data` as it was; `canRefresh()` is false with no location and while the same token is in flight, and true for a new token while an old one is in flight; a stored record with a lower `revision` than the index is fetched again and replaced, and one with the same `revision` is kept (R14); `renderReports()` (fake page) hides `#dockReports` when the location is not Putney. `test/settings.test.js`: the 13 fields fill from `app.defaults` after `openLocation()`. `test/suggest-context.test.js`: the context names the location, and with `app.loc` null it gives `location: null` and `settings: null` without throwing.

Browser checks (smoke and parity specs): parity passes for every case at `/putney-landing`. `/` with empty storage draws Putney and the address stays `/`; no `rowhether-last-v1` is written. With `rowhether-last-v1` set, `/#wind` becomes `/putney-landing#wind` without a reload (`history.length` stays 1). The upgrade check (old `putney-rowing-*` keys seeded, load `/`) draws the saved hero while every upstream host is held unanswered (a route that never fulfils until the hero is checked), the address becomes `/putney-landing`, Settings shows the seeded values, and no note shows above the hero (07 13, 01 16.5). A saved copy 48 hours older than the page clock, with every upstream request held unanswered: the hero shows the verdict `buildModel()` gives for that copy at the clock, not "No data." (R1; P1.9 must keep this passing). `/no-such-place` shows the not-found section and makes no upstream request; then `visibilitychange` is dispatched and the clock run past 10 minutes: still no upstream request and a clean console; then `history.pushState` to `/putney-landing` and a `popstate`: Putney's requests go out and its hero draws (R9). `update.spec.js` passes. `timing.spec.js` passes in CI mode, and once by hand with `TIMING_BASELINE_MS=99` for `chromium-390-light` (within 20%).

Golden: none. The capture edit is commit (a).

Mutations: `saveLast` at `/` with nothing stored (the smoke check that no `rowhether-last-v1` is written fails); drop the token check in `takeRefresh()` (its test fails); keep a single `busy` flag for every token (the `canRefresh()` test fails); let `refresh()` run with no location (the not-found check logs an error and fails); trust a 200 HTML answer as a record (the HTML case fails); accept a record only with a JSON content type (the `text/plain` case and `update.spec.js` fail); keep `state.js` importing `src/putney.js` (the budget row fails); show dock reports at every location (the `renderReports()` test fails).

Done when: the net passes, parity passes at `/putney-landing`, the upgrade check passes with upstream held, and main JS is at or under its row.

### Batch 2: the header, choosing a location, and Putney's sources (P1.5 to P1.9)

Proves at its end: the header, footer and app name come from the location; a visitor can pick, search and switch locations; a first visit at `/` behaves as the owner decided; every source request is the phase 1 one; stale and missing sources are said plainly. Putney's output has moved only by the ids `saved`, `alerts-zones`, `usgs-v1`, `marine-alerts`, `flowdays-noon` and `not-checked`. Still one location; the picker lists Putney alone. Putney's visible changes so far: the chevron, the "Saved" label with its day, the footer credits, the app name in the manifest, the install copy, and the rest of 3.7's rows up to P1.9.

#### P1.5 The header, the footer and the app name

Files: `index.html`, new `src/render/header.js`, `src/render/hero.js`, `src/render/index.js`, `src/main.js`, `src/state.js`, `src/install.js`, `src/format.js`, `src/location.js`, `vite.config.js`, `src/styles/app.css`, `data/locations/putney-landing.json`, `test/golden/changes.js`, the golden files `saved` moves, new `test/header.test.js`, `test/browser/fixtures.js`, `test/browser/smoke.spec.js`, `test/browser/timing.spec.js`, `test/browser/screens.spec.js` (`timezoneId: 'America/New_York'`, 3.6), new `test/browser/picker.spec.js` (the header and manifest checks; P1.6 grows it), `CLAUDE.md` (item 9).

Changes:

1. `index.html` header as 07 4.3, without the account button (phase 2): `div.title-row` holding `h1#title` with `button#locBtn.loc-btn` (`aria-haspopup="dialog"`, `aria-controls="picker"`, `aria-describedby="locHint"`) around `span#locName` and an `svg.loc-chev` (`aria-hidden="true"`), then `span#envBadge` as today, and `span.vh#locHint` "Change location"; `p.sub#sub`; `p.badges#locBadges` hidden. The static text stays Putney's, so the first paint before the script matches today. The footer's credit paragraph becomes an empty `p#credits`; the second paragraph stays. The install bar's `p` gets `id="installText"`. Icon links become absolute (`/apple-touch-icon.png`, `/icon-192.png`; 01 7.3). `apple-mobile-web-app-title` becomes "RoWhether". The `#setInstall` note and the `#install` dialog note take 07 6.4's text. The `<title>`, description and Open Graph tags of `index.html` stay Putney's during the 90-day window (07 6.5).
2. `src/render/header.js`:
   - `renderHeader()` moves here from `hero.js` (`hero.js` re-exports it, so the capture's import still works). Its label is "Saved" in place of "Saved data from" (`hero.js` line 12; 07 6.7), with the day when the saved time is not today in the location's zone: "Saved 6:41 AM" today, "Saved Mon 6:41 AM" on one of the six days before, "Saved Oct 14, 6:41 AM" before that (owner, 2026-10-21, R1). The golden cases save and read on one day, so only `saved`'s two paths move.
   - `renderPlace(loc)`, called after each `openLocation()` and not by `render()`: `#locName` text; the class `long` on `#title` for a name over 18 characters; `#sub` from `subtitleText(loc, Date.now(), app.deviceTz)`; `#credits` from `linkText(loc.copy.credits)`; `#installText` "Add RoWhether to your home screen. It opens on <name> in one tap."; `document.title` "<name> rowing conditions"; `#locBadges` "Not confirmed on site" for a `published` record, hidden for `verified`. `renderPlace(null)` for the not-found view: "RoWhether", no subtitle, no badges.
   - `subtitleText(loc, now, deviceTz)` (07 6.1): `${loc.subtitle || generated} All times ${zoneName}${zoneDiff}.` `zoneName` is `tzLabel`, else the `longGeneric` zone name without " Time" ("Eastern", "Pacific"; Node 22 gives "Eastern Time" and "Pacific Time", verified live 2026-10-20). `zoneDiff` compares the two zones' offsets at `now` (`longOffset`, for example "GMT-04:00") and adds ", 1 hour ahead of you", ", 3 hours behind you", ", 30 minutes ahead of you" or ", 9 hours 30 minutes ahead of you" only when they differ. `generated` is "<waterway name> at <locality>." for a record with no subtitle.
3. `app.deviceTz` is set once at start from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
4. `linkText(s)` in `src/format.js`: escapes the text and turns `[text](https://...)` into `<a href="..." target="_blank" rel="noopener">text</a>`; only `https://` links, anything else stays text. `src/location.js` lets `copy.credits` be up to 1,200 characters (Putney's new text is 721).
5. Putney's `copy.credits` takes 4.3's text: Albany and Gray, with links.
6. `src/install.js`: the bar text comes from `renderPlace()`; the dialog note is static (item 1).
7. `vite.config.js` manifest (07 6.3): `name: 'RoWhether'`, `short_name: 'RoWhether'`, `description: 'Go, caution or stay off: rowing conditions for your launch site, hour by hour.'`, `id: '/'`, with `start_url` and `scope` `'./'` as today.
8. `src/styles/app.css`: `.title-row`, `.loc-btn` (the title's size, weight and width, `--ink`, no pill border, underline on hover, visible focus), `.loc-chev` (0.6 rem, `--muted`), `#title.long` below 30 rem (1.25 rem), `.badges` and `.badge` (07 11.1). The button does nothing until P1.6 wires it.
9. `CLAUDE.md` (approved in README row 16; R20): "What this is" names the app RoWhether, rowing conditions for a curated list of locations with Putney Landing first, and the Now screen notes say the header reads "Updated 6:41 AM", or "Saved 6:41 AM" (with the day when older) for a saved copy.

Tests: `test/header.test.js`: the "Saved" label today, yesterday, six days back and seven days back, at a pinned clock in New York with `TZ=Pacific/Auckland`; `subtitleText` for Putney with the device in New York (today's text exactly), Chicago (", 1 hour ahead of you."), Kolkata and Auckland at a pinned date, and Los Angeles with no `tzLabel` ("All times Pacific."); a record with no subtitle; `linkText` escapes `<`, makes https links, leaves `javascript:` and `http:` as text; the install sentence; the `long` threshold at 18 and 19 characters; the badge for `published` and `verified`.

Browser checks (`picker.spec.js`, smoke): at 360 px the title row and the actions row each stay one row with "Updated" and with "Saved" (07 4.3 measured "Saved data from" wrapping); the chevron shows after the name, light and dark; `timezoneId: 'America/Chicago'` on Putney: the subtitle ends "All times Eastern, 1 hour ahead of you." and the hero, facts and a tab's times are still Eastern (07 13); the built `dist/manifest.webmanifest` has `name` and `short_name` "RoWhether" and `id` "/", `start_url` and `scope` "./"; the install bar (iPhone user agent) says "It opens on Putney Landing"; the footer shows the credits with the Albany and Gray links; with `rowhether-loc-v1:putney-landing` seeded with the P1.4 record (revision 2, the old credits), one load shows the new credits once the index has been read (R14); `document.title` is "Putney Landing rowing conditions". `ready()` and the three "Saved data from" waits read "Saved" (3.5).

Golden: `saved`.

Mutations: `zoneDiff` using the machine's zone in place of `deviceTz` (a header test fails under `TZ=Pacific/Auckland`); `linkText` passing a `javascript:` link (fails); the manifest without `id` (the browser check fails); `renderHeader()` calling `renderPlace()` (the capture calls `renderHeader()` and records every element written, so `home` gains `locName`, `sub` and `credits` outside `saved`, and `check` fails; the capture never calls `render()`, so a call from there would pass every check, R19).

Done when: the net passes, `check` shows only `saved` moved, and the browser checks pass at 360, 390 and 1280 px.

#### P1.6 Picking a location

Files: new `src/picker.js`, new `src/copy/picker.js`, new `src/styles/picker.css`, `index.html`, `src/route.js`, `src/config.js`, `src/main.js`, `src/settings.js`, `src/render/header.js`, `src/styles/app.css`, `scripts/budget.mjs`, new `test/picker.test.js`, `test/route.test.js`, `test/browser/picker.spec.js`, `test/browser/smoke.spec.js`, `CLAUDE.md` (item 12).

Changes:

1. `src/config.js`: `FIRST_VISIT_PUTNEY_UNTIL = Date.UTC(2027, 2, 1)` with the placeholder comment of section 2, row 4.
2. `homeTarget({ last, now })` (07 5.1): a last slug opens it; nothing stored and `now` before `FIRST_VISIT_PUTNEY_UNTIL` gives `{ slug: 'putney-landing', keepAddress: true, note: true }`; otherwise `{ page: 'picker' }`. `?open=picker` opens the sheet over the last location, or the picker page when there is none, and is removed with `history.replaceState`.
3. `index.html`: `<dialog id="picker" class="sheet" aria-labelledby="pickTitle"></dialog>`, a note `div.set-nudge#pickNote` (hidden) with "Not your water? Pick a location." and the buttons "Pick a location" and "Dismiss", and `div.vh#pageAnnounce` with `aria-live="polite"`.
4. Notes above the hero (07 4.6): one at a time, `#pickNote` before `#setNudge`. Dismiss calls `dismissPickHint()` and `saveLast('putney-landing')`: the viewer has accepted Putney, so `/` opens it from then on, also after the window. Showing Putney under the window writes nothing, so the note returns on each visit to `/` until it is answered.
5. `src/picker.js`, loaded with `import()` on the first tap of `#locBtn`, for `?open=picker`, on the picker page and on the not-found view. Vite names the chunk `picker-<hash>.js` after the file (08 8.4); it stays in the precache. It imports `src/styles/picker.css`, so its styles load with it and stay out of the main CSS. Exports:
   - pure: `fold(s)` (NFKD, accents stripped, lower case), `matchRank(entry, q)` (07 5.2.1: the name starts with the query, then a word in the name starts with it, then the locality or waterway matches; ties by recent, then alphabetical), `groupList(entries)` (by country, then region name; a country heading only when there is more than one country), `regionName(code)`.
   - `openPicker({ mode: 'sheet' | 'page' | 'notfound', query })`.
6. The sheet (07 5.2, 11.6, 11.7, 12.1, 12.2): heading "Change location" (`tabindex="-1"`, focused on open); the current location first with the badge "Showing now"; the search box (label "Find a location", placeholder "Boathouse, lake, river or town", `type="search"`, `autocomplete="off"`, `enterkeyhint="search"`); Recent (up to 8, without the current one); All locations, grouped; "Suggest a location" when the suggestion form is configured (it closes the sheet and opens `#suggest`); Close in the top corner and at the bottom. Rows are `<a href="/<slug>" data-nav>` with the name and a second line "<locality>. <waterway>." (each left out when it repeats the name). Escape closes and returns focus to `#locBtn`.
7. Search, phase 1: the precached `locations/index.json`, filtered on each keystroke from 2 characters, at most 8 rows. No network request while typing. With no match: "Nothing matches "<query>". Check the spelling, or search for a town." P1.7 adds towns.
8. Choosing a row: `navigate()` to `/<slug>`, `saveLast`, `pushRecent`; focus moves to `#title` and `#pageAnnounce` says "Showing <name>." (07 12.2); the page scrolls to the top.
9. The picker page at `/` (07 5.1): `#home` shows "Where do you row?", 5.1's lead sentence, the search, and the grouped list; no tab bar, no Refresh or Settings, the footer without credits, `document.title` "RoWhether: pick a location", `#locName` "RoWhether".
10. The not-found view (07 4.7): under P1.4's text, the picker search prefilled with the path's words ("lake quinsigamund" for `/lake-quinsigamund`).
11. `scripts/budget.mjs` adds `{ name: 'picker', precache: true }` to the lazy chunk list P1.2a started, with its checks: the chunk exists as `picker-*.js`, `dist/index.html` does not load or preload it, and it is in `dist/sw.js`.
12. `CLAUDE.md` (approved in README row 16; R20): the navigation sentence becomes "Within a location, the tab bar under the header is the only navigation. The location name in the header opens the switcher; the account button opens Account. Pages outside a location use the same text tabs." (the account button arrives in phase 2).

Tests: `test/picker.test.js`: `fold("Montréal")`; the rank order for "lak", "putney", "connecticut"; `groupList` with one country (no country heading) and with two; `regionName('US-NH')` "New Hampshire", `'US-DC'` "District of Columbia". `test/route.test.js`: `homeTarget` for a last slug, inside the window, after it, and after Dismiss (last written).

Browser checks (`picker.spec.js`): inside the window (the `june-calm` noon clock, 2026-06-15): `/` shows Putney with the note; "Pick a location" opens the sheet; a reload without answering shows the note again; Dismiss, then a reload: no note, and the address becomes `/putney-landing`. After the window (clock pinned to 2027-04-01) with nothing stored: the picker page. The picker page at 360 px: no horizontal scroll; typing "put" lists Putney with no network request (`page.on('request')` sees none from the first key to the last); Enter on the result opens it; the address and `document.title` change; Back returns to the picker. The switcher: Enter on the location name opens the sheet with focus on "Change location"; Escape closes it with focus back on the name. `/lake-quinsigamund` shows the not-found view with the search prefilled; there, `visibilitychange` is dispatched, then Putney is picked from the search: its requests go out, its hero draws and the console is clean (R9). No request for a `picker-*` chunk before the first tap on a location page. Smoke: the specs that load `/` with empty storage and expect the Settings reminder load `/putney-landing` instead.

Golden: none.

Mutations: `homeTarget` ignoring the window end (the after-window check fails); the note and the reminder both showing (fails); the picker chunk imported statically from `main.js` (the budget's lazy chunk check fails); a search that fetches per keystroke (the no-request check fails).

Done when: the net passes, with the picker chunk named in the budget report.

#### P1.7 Near me, town search, and the picker offline

Files: `src/picker.js`, `src/copy/picker.js`, `src/render/hero.js`, `src/main.js`, `test/picker.test.js`, `test/browser/picker.spec.js`, `test/browser/fixtures.js`, new `test/fixtures/sources/geocode-worcester.json`.

Changes:

1. Near me (07 5.2.2): a button under the search. On tap only: `navigator.permissions.query({ name: 'geolocation' })` where it exists (`denied` shows the help line at once and asks nothing); then `getCurrentPosition` with `{ enableHighAccuracy: false, maximumAge: 600000, timeout: 10000 }`; the position is rounded to 2 decimals before use and never stored; the index sorted by distance under "Near you" with each row's distance in miles (US units, one decimal under 10); the polite announcement "<n> locations near you." Copy for waiting ("Finding you", the button disabled), none within 100 km, denied and timeout: 07 5.2.2's table.
2. Town search (07 5.2.1, 02): after 300 ms with no typing, or on Enter, at most once per 300 ms, `https://geocoding-api.open-meteo.com/v1/search?name=<q>&count=5&language=en&format=json` (no country filter). Up to 5 places under "Places", as "<name>, <admin1>, <country>". Choosing one lists our locations within 50 km of it under "Near <name>, <admin1>", nearest first, or "No locations within 50 km of <name>, <admin1>." with "Suggest a location". A failed request: "Town search is not available right now. Location names still work." The host answers with `access-control-allow-origin: *` (verified live 2026-10-20; it timed out on two of four tries from this container, so the failure path is real).
3. Offline (07 9.4): with no connection the picker searches the precached index ("Offline. Search covers places saved on this phone." is phase 3's copy and is not used here). Opening a location whose forecast was never saved, offline, shows its header and tabs from the precached record, and the hero says "No forecast saved for this location on this phone yet. Connect to load it." (`renderNoData()` gains that case, chosen when `navigator.onLine` is false and nothing is cached).
4. `test/browser/fixtures.js` answers `geocoding-api.open-meteo.com/v1/search` from the recorded fixture.

Tests: `test/picker.test.js`: distance sort and rounding (a position is rounded to 2 decimals before any use); the 50 km filter; the Places line format; the throttle allows one request per 300 ms (fake timers).

Browser checks (`picker.spec.js`): Near me granted at 42.96, -72.52 (`context.grantPermissions`, `setGeolocation`): "Near you" lists Putney first with its distance. Denied (`addInitScript` replacing `navigator.permissions.query` to answer `denied`): the help line shows and `getCurrentPosition` is never called. Timeout (a stubbed `getCurrentPosition` that calls its error callback with `TIMEOUT`): the timeout line. A town ("Worcester") from the fixture lists places; picking it shows "No locations within 50 km" until P1.13 adds Lake Quinsigamond. Offline, in a context with service workers allowed (as `timing.spec.js` does): after one online visit, `context.setOffline(true)`, the picker still finds Putney and its chunk loads from the precache; with Putney's saved forecast removed from storage and the page reloaded offline, the header and tabs show from the record and the hero says "No forecast saved for this location on this phone yet. Connect to load it."

Golden: none.

Mutations: no rounding of the position (the unit test fails); calling geolocation on open of the sheet (the denied check, which counts calls, fails); no throttle (fails).

Done when: the net passes.

#### P1.8 Source requests for every location

Files: `src/sources/nws.js`, `src/sources/usgs.js`, `src/sources/index.js`, `src/location.js`, `data/locations/putney-landing.json`, `test/sources.test.js`, `test/logic.test.js`, `test/location.test.js`, `test/browser/fixtures.js`, `test/golden/changes.js`, the golden files the four ids move, new fixtures (4.10), `CLAUDE.md`.

Four commits, one per golden id, in this order:

1. `alerts-zones`. `alerts.bind` (`nws.js` line 37) reads a `zones:` ref into `{ zones }` and a `point:` ref into `{ point }`; the URL is `https://api.weather.gov/alerts/active?zone=<list>` or `?point=<lat>,<lon>`. `validateLocation` refuses an alerts ref in any other form (`format`). The "a `point:` alerts ref until phase 1" check in `test/sources.test.js` (line 503) becomes "a `point:` or `zones:` ref". Putney's alerts row becomes `zones:VTZ015,VTC025,NHZ011,NHC005`. The browser fixtures answer `/alerts/active` for any query.
   The polygon rule (owner, 2026-10-21, R15): a storm-based warning (severe thunderstorm, tornado, flash flood, special marine) lists the whole county or marine zone in `affectedZones` but is drawn as a polygon, so `?zone=` returns it for every spot in the county while `?point=` returns it only when the polygon covers the point. `alerts.bind` also carries the dock point (`lat`, `lon` from the location), and `parseAlerts(d, b)` keeps an alert whose `geometry` is a `Polygon` or `MultiPolygon` only when that polygon contains the dock point (ray casting over each ring, holes excluded, in `src/sources/nws.js`); an alert with no geometry, a zone-only product, applies to every location in its zones, as listed. With no binding (the parser probes), nothing is filtered, so `p-parsers` does not move. Putney's golden fixtures have no geometry, so no golden file moves for this rule.
2. `marine-alerts`. `alertLevel()` (`nws.js`) also gives level 2 to the whole event names in a list, `STAY_OFF_EVENTS`, matched ignoring case (README row 11; owner, 2026-10-21, R18): Small Craft Advisory, Gale Warning, Storm Warning, Special Marine Warning, Hurricane Force Wind Warning, Hurricane Warning, Storm Surge Warning and Tropical Storm Warning. All eight are in NWS's list of 111 event types (`https://api.weather.gov/alerts/types`, verified live 2026-10-22), which has no other Small Craft name. Today's pattern stays for the names it matches now, so no other level changes. All eight are 1 today (`alertLevel()` at `a5386c8`). Tropical Storm Warning can reach Putney's land zones, so its move from 1 to 2 is a Putney change, named in 3.7; the marine names need a marine zone, which Putney's list does not have. "Winter Storm Warning" and "Ice Storm Warning" were 2 already. In the same commit the probe's event list (`probes.js` line 242) gains the seven names it lacks, so `p-pure` records each one's new level.
3. `usgs-v1`. `USGS_OGC` (`usgs.js` line 3) becomes `/ogcapi/v1` (v0 and v1 gave the same answer for Putney's request, verified live 2026-10-20). The latest request lists each gauge once (the same gauge for flow and water temperature, as at Boathouse Row and Thompson Boat Center, would repeat its id) and adds `&limit=50`. `latest.bind` keeps its `flow` and `temp` params as they are, since the config probe records them as `GAUGE_FLOW` and `GAUGE_TEMP` (`probes.js` line 374); only the URL changes (R3). Without `limit` the service returns at most 10 items (verified live 2026-10-20: 10 without, 16 with). `parseRiver` keeps the newest reading per gauge and parameter: USGS-01646500 lists five 00010 series, four of them ended in 2019, and today's loop keeps whichever comes last. The browser fixtures map `/ogcapi/v1/...`.
4. `flowdays-noon`. First, in its own commit, `test/golden/probes.js` passes a binding `{ params: { tz: 'America/New_York' } }` to its `parseFlowDays` calls (line 310); it passes against the unchanged `src/`, which ignores the argument. Then `daily.bind` returns `{ id, tz }` (the flow row's `tz`, else the location's), and `parseFlowDays(d, b)` places each day at local noon in `b.params.tz`, in place of `T16:00:00Z` (line 31). There is no default zone in `src/`. Noon is found in two passes: the zone's offset at 12:00 UTC that day, then the offset at the first result, so a zone east of UTC is right on its change days.

`CLAUDE.md` (approved in README row 16; R20), each line in the commit that makes it true: commit 1 corrects the NWS facts (the dock point resolves to GYX, grid 3,13, zone NHZ011, county NHC005; alerts use VTZ015 and VTC025 from Albany and NHZ011 and NHC005 from Gray), the alerts URL by zone, and the polygon rule under Call logic; commit 2 the alert levels under Call logic (the eight Stay off names); commit 3 the three USGS URLs on `/ogcapi/v1`, the latest one with `&limit=50`.

Tests (`test/sources.test.js`): Putney's alerts URL exactly `https://api.weather.gov/alerts/active?zone=VTZ015,VTC025,NHZ011,NHC005`; a `point:` row still builds the point URL; a ref `station:KEEN` is refused; the polygon rule on the recorded `alerts-elsewhere.json` (a Flood Warning drawn as a polygon in Florida, and two products with no geometry): Putney's binding keeps the two without geometry and drops the Flood Warning, a binding whose point is inside that polygon keeps all three, and a `MultiPolygon` and a ring with a hole are handled; the eight names of commit 2 give 2 matched as whole names in any case ("small craft advisory" too), "Marine Weather Statement", "Storm Watch" and "Dust Storm Warning" give 1, and the existing level names keep theirs; Putney's three USGS URLs on v1, the latest one with `&limit=50`; a binding whose flow and temperature rows name one gauge lists it once; `parseRiver` on the recorded USGS-01646500 answer keeps the 2026 temperature, not a 2019 one; `parseFlowDays` puts `2026-07-01` at 16:00 UTC and `2026-12-01` at 17:00 UTC for `America/New_York`, `2026-07-01` at 19:00 UTC for `America/Los_Angeles`, 11:00 UTC for `Europe/London` in summer, and the day of a change right in `Pacific/Auckland` (2026-09-27).

Browser checks: the smoke check "every source is read from the fixtures" passes with the v1 paths and the zone query; parity passes against the rewritten files.

Golden: `alerts-zones`, `marine-alerts`, `usgs-v1`, `flowdays-noon`, one commit each.

Mutations: the alerts URL keeping `point` for a zones ref (a test fails); `parseAlerts` keeping every polygon alert (the Florida Flood Warning test fails); the list matched by substring (a real event, "Dust Storm Warning", becomes 2 and its test fails); `parseRiver` keeping the last series (fails); `flowDays` at 16:00 UTC for a December date (fails); `limit=50` dropped (fails).

Done when: the net passes and `check` passes with the four ids.

#### P1.9 Stale sources, and what is not checked

Files: `src/sources/*.js`, `src/sources/index.js`, `src/logic.js`, `src/render/index.js`, `src/render/hero.js`, `src/render/now.js`, `src/render/detail/temperature.js`, `src/render/detail/fog.js`, `src/render/detail/week.js`, `src/share.js`, `src/main.js`, `src/storage.js`, `index.html`, `data/locations/putney-landing.json`, `test/logic.test.js`, `test/storage.test.js`, `test/render-location.test.js`, `test/golden/changes.js`, the golden files `not-checked` moves, `test/browser/smoke.spec.js`, `CLAUDE.md` (item 10).

Changes:

1. Each adapter's `staleMs` from 02's catalog: obs 3 hours, alerts 1 hour, forecast, air quality, models, the latest gauge reading, the 48-hour series and the river forecast 24 hours, the daily means 7 days. `refreshMs` stays null: every slot still refreshes every 10 minutes (pacing is deferred, section 9).
2. The time of each slot's last good fetch, `app.fetched[slot]`, is kept with the saved forecast: `rowhether-cache-v2:<slug>` holds `{ data, updated, fetched }`. An entry without `fetched` (every saved forecast from before this step) counts each slot as fetched at `updated`.
3. `render()` passes `stale: staleSlots(bindingsFor(loc), app.fetched, app.errors, now)` to `buildModel(..., { units, stale })`. A slot is stale only when a refresh in this visit has failed for it (`app.errors[slot]`, which only `refresh()` sets and `openLocation()` clears) and its last good fetch is older than its `staleMs` (owner, 2026-10-21, R1). So at start, and while the first refresh is in flight, the saved forecast is drawn whole whatever its age, labeled with its day and time (P1.5), as today. In the model, a stale slot reads as missing, except: `alerts` keeps every entry still in force by its own end time and is named in the not-checked line; `river` and `flow` follow the rules in item 4. Staleness is by fetch time only, as 02 and 08 K9 define it: the observation's own reading time hides nothing, and the "Measured at" fact keeps its age in the note as today (R8). The capture passes no `stale`, so the golden cases see no staleness. One effect reaches Putney (R1, listed in 3.7): when a refresh fails and the last good forecast is over 24 hours old, the hero says "No data." with today's "The forecast did not load" line in place of the old forecast (02's catalog, 08 K9).
4. Flow (01 15.7): `flowForCall(m)` is the latest reading when its time is within `loc.flow.maxAgeH`, else null. `assess()`, `windVsCourse()`, `chopWind()` and `debrisLikely()` read `flowForCall()`. `flowNow()` stays the shown value, so the fact keeps the number with the note "Last reading 2 days ago, not used for Go, Caution or Stay off."
5. Water temperature (01 11.4, 08 K1): `waterTemp(m)` is the Settings reading, else a gauge reading within `loc.waterTemp.maxAgeH`, else null. `waterTemp(m, { forCold: true })` also returns the location's monthly typical value when it has one, flagged `typical`; steam fog never uses it. `waterSource(m)` says which (`you`, `gauge`, `typical` or none).
6. `notChecked(m)` (01 8.4) lists `{ key, why, since }`: `flow`/`none` at a river, tidal or canal location with no flow binding; `flow`/`old` when the latest reading is past `maxAgeH`; `alerts`/`none` with no alerts binding; `alerts`/`old` when the alerts slot is stale. `notCheckedText(items, now)`: the `none` items as one sentence, "Not checked here: river flow, official alerts."; each `old` item as its own, "River flow not checked: the gauge has not reported for 2 days." and "Official alerts not checked: no answer from NWS for 2 hours." Ages under 48 hours are in hours, then in days.
7. `index.html`: `<p class="status-note" id="notChecked" hidden></p>` after `#holds` (07 11.2). `renderHero()` and the overnight hero fill or hide it, and `renderNoData()` hides it, so a line from the last model never stays up when the forecast goes missing (R17). Share includes it when shown (07 6.2).
8. Facts and views when a source is absent, never shown at Putney while its sources answer (07 6.7): no River flow fact without a flow binding (a bound gauge that fails keeps "--" and "USGS gauge unavailable."); the Water fact "No water temperature here. Add a dock reading in Settings." without a water temperature binding (a bound gauge that fails keeps "Gauge unavailable. Add a dock reading in Settings."), or "Typical for October, about 52°F. No live reading." with a typical value; Temperature tab "No water temperature here. Add a dock reading in Settings to turn on the cold-water check."; Fog, How this works "Steam fog needs a water temperature. Add a dock reading in Settings."; Week, an opened day: the River row says "No river gauge here, so flow is not checked." at a river and "This is a lake. Flow is not checked." (or "This is a reservoir.") on still water, and the Alerts row says "Not available here" with no alerts binding.
9. Putney's record: `flow.maxAgeH` 24, `waterTemp.maxAgeH` 72 (01 6.3).
10. `CLAUDE.md` (approved in README row 16; R20): the refresh line adds that a source whose last good fetch is past its limit reads as missing once a refresh in this visit has failed for it, and is named in the hero; and Call logic's flow line says flow counts only while the latest reading is within `maxAgeH`.

Tests (`test/logic.test.js`, with Putney and with records edited in the test): a flow reading 23 hours old is used and 25 hours old is not (no flow reason, no debris, no wind against current text or multiplier); water 71 and 73 hours old; a monthly typical value used for the cold reason and never for fog; `notChecked` empty for Putney with fresh sources, `flow`/`none` for a river record with no flow row, empty for a lake, `alerts`/`none` with no alerts row, `alerts`/`old` with a stale slot; the text for each; `staleSlots` at each `staleMs` edge, and a slot past its `staleMs` with no failed refresh in this visit is not stale. `test/storage.test.js`: the cache keeps `fetched`, and an old entry without it loads. `test/render-location.test.js`: a record with no water temperature draws the new Water fact; Putney's facts are unchanged.

Browser checks (smoke): a gauge that has not reported for 2 days (the fixture's reading time moved back 48 hours): the hero shows "River flow not checked: the gauge has not reported for 2 days.", the flow fact keeps the number with the note, and the verdict ignores flow. With fresh fixtures Putney shows no line (parity). P1.4's check of a saved copy 48 hours old with every upstream held still shows the saved verdict; when the held requests are then aborted, the hero says "No data." and "The forecast did not load. Check the connection, then tap Refresh." (R1).

Golden: `not-checked`. Staleness is by fetch time and the capture passes no `stale` (item 3), so no other id moves; the `stale-sources` id of the first draft went with the reading-age rule (R8).

Mutations: `assess()` reading `flowNow()` in place of `flowForCall()` (the 25-hour test fails); `staleSlots` ignoring `app.errors` (the 48-hour smoke check of P1.4 fails); the typical value reaching steam fog (fails); `notChecked` listing flow at a lake (fails); dropping alerts that are still in force when the slot is stale (fails).

Done when: the net passes and `check` passes with `not-checked`.

### Batch 3: Settings from the location, and the test locations by water type (P1.10 to P1.14)

Proves at its end: Settings is built from the location; all seven locations work end to end from their own addresses and the picker, each with the tabs 01 9.7 gives its water type; a source that fails at one place is named and isolated; lakes, a reservoir and tidal water get their own water state and compass; Putney's last two listed changes (the share link and the bank labels) are in. Putney's output moves only by `banks`.

#### P1.10 Settings for the location shown

Files: `index.html`, `src/settings.js`, `src/location.js`, `src/state.js`, `src/storage.js`, `src/render/detail/river.js`, `data/locations/putney-landing.json`, `test/settings.test.js`, `test/location.test.js`, `test/storage.test.js`, `test/browser/settings.spec.js`.

Changes (01 11.1, 11.5, 11.6; 07 5.13 phase 1 part, 6.7):

1. The Course fieldset gets `id="setCourse"` and shows only for a heading course. The River flow fieldset becomes `fieldset#setFlow`, filled when the dialog opens and shown only with a flow binding: legend "River flow at <flow label>, <unit>" ("River flow at North Walpole, cfs" for Putney, as today); the two inputs are no longer `required` (blank turns a level off, as rain and air quality do, and `OPTIONAL` in `settings.js` line 8 gains them); the note is `copy.flowStats`.
2. Each input's placeholder is "Location default <value>". Under a changed field, a small line: "Your setting. Location default <value>." The intro note: "Match these to your program, boat class and coach coverage. Saved in this browser for <name>." Reset becomes "Use location defaults".
3. The Settings reminder's sentence is built from the location's limit keys (07 6.7): without flow, "... starting values for wind, gusts, rain and cold water." With flow it stays today's sentence.
4. Limit basis (01 11.1, review P7): `thresholds.basis` is a map of `adapter:ref:unit` strings. `validateLocation(rec, { waterway })` allows it and, on the resolved sources (`resolveSources(rec, waterway)`), refuses a flow limit with no flow binding, or a `basis.flow` naming another binding (R5: Putney and the three river records inherit their flow row from the waterway, so a check on the record alone would refuse them and fail the build). `effectiveSettings(loc, { overrides })` applies a flow limit only while its basis equals the location's primary flow binding: the location's own limits by `thresholds.basis`, the viewer's by `overrides.limitBasis`. A viewer's flow limit saved before this step has no `limitBasis`; it is read as made for the current binding and saved with it on the next Save. An ignored personal limit is kept, and Settings and the River view's How this works say "Your flow limits were for the <old label> gauge. Set them again for this gauge." `basis` is read, never copied: the settings object `effectiveSettings()` returns has no `basis` key, so `app.settings`, the model and the suggestion context are unchanged.
5. Putney's record gets `thresholds.basis: { "flow": "usgs-ogc:USGS-01154500:cfs" }`.

Tests: `test/location.test.js`: basis match, mismatch (location and personal limits ignored, the personal one kept), a flow limit with no flow binding refused, a basis naming another gauge refused, each with the flow row in the record and again with it inherited from the waterway (Putney's own files pass); `effectiveSettings` for Putney unchanged, with no `basis` key. `test/settings.test.js`: Putney's dialog has the 13 fields as today; a record without flow has no flow fields and Saves; a record with a `none` course has no Course field; placeholders and the "Your setting" line; Reset to the location's defaults. `test/storage.test.js`: `limitBasis` saved with a flow override.

Browser checks: `settings.spec.js` passes unchanged for Putney (all 13 fields, the reload, Reset, the order rule on Save), with "Use location defaults" as the Reset label. The dialog at 360 px fits with the new lines.

Golden: none. If the reminder's text is written by a captured render function, stop (rule 13): it should be set by `src/settings.js`, which the capture does not run.

Mutations: `effectiveSettings` ignoring the basis (a test fails); the two basis rules run on the record's own `sources` (the inherited cases fail, and so does `npm run build`); the flow inputs still `required` (the no-flow Save test fails); the Course field shown for a `none` course (fails).

Done when: the net passes; the lake records of P1.13 will open this dialog with no flow fields.

#### P1.11 The share link, bank labels that turn, and generated banks

Files: `src/share.js`, `src/render/parts.js`, `src/location.js`, `test/golden/capture.js`, `test/golden/changes.js`, the golden files `banks` moves, `test/location.test.js`, `test/render-location.test.js`, `test/browser/smoke.spec.js`.

Changes:

1. Commit (a), test code only: the capture sets `app.deviceTz = loc.tz` before it draws, so a device in another zone never reaches the golden share text. It passes against the unchanged `src/`.
2. `src/share.js` (07 6.2): the link is `SITE_URL + loc.slug` on production (`https://rowhether.com/putney-landing`) and `location.origin + location.pathname` on dev, as today's rule (line 22). The text is `${loc.name} rowing, ${hm(now)}${zoneSuffix}: ...`, where `zoneSuffix` is " Eastern" (the zone name of P1.5) only when `app.deviceTz`'s offset differs from the location's at `now`. It still carries `#notChecked` when that shows (P1.9). The title is "<name> rowing forecast" as today.
3. `compassSVG()` (`src/render/parts.js` lines 27 to 30): each bank label is placed at its offset, (-30, -24) and (30, -24), rotated by the heading (`x' = x cos h - y sin h`, `y' = x sin h + y cos h`), rounded to one decimal, with the text upright (01 10.5). At Putney's 15°: VT at (-22.8, -30.9), NH at (35.2, -15.4).
4. `autoBanks(heading, word)` in `src/location.js` (01 10.4): the right side faces `heading + 90`, named by its 8-point compass name (`north` ... `northwest`, short `N` ... `NW`), the left side the opposite. `resolveLocation()` uses it when the record's `banks` is null and the course is a heading, after the viewer's heading override, with the word `bank` for river, tidal and canal water and `shore` for lake, reservoir and harbor.

Tests: `test/location.test.js`: `autoBanks(15)` gives left west and right east, `autoBanks(270)` left south and right north (01 16.1), `autoBanks(330)` right northeast, `autoBanks(166, 'shore')` right west shore; a record with banks keeps them. `test/render-location.test.js`: Putney's label positions at 15° and at a 200° override; the labels' text is never rotated.

Browser checks (smoke, with `timezoneId: 'America/New_York'`): Share gives the share sheet "Putney Landing rowing forecast", the text without a zone suffix, and `https://rowhether.com/putney-landing`; with `America/Chicago` the text reads "Putney Landing rowing, 12 PM Eastern: " followed by the rest of the golden `share` text (the clock is 12:00 Eastern and the text is built at `Date.now()`; 11:57 AM is the fetch time in "Updated 11:57 AM", R16); on a dev host (`/api/info` stubbed as `{ env: 'dev' }`) the link is the page's address. The compass at 390 and 1280 px shows VT and NH beside the turned river, not over it.

Golden: `banks`.

Mutations: labels at the fixed offsets (the `banks` files fail to match); `zoneSuffix` from the machine's zone (the capture would see it under `TZ=Pacific/Auckland`, and a `share` path outside `banks` moves, so `check` fails); `autoBanks` with left and right swapped (fails).

Done when: the net passes and `check` passes with `banks`. With this step, Putney's phase 1 changes are complete.

#### P1.12 River test locations: Hanover boathouse and Boathouse Row

Files: `data/locations/hanover-boathouse.json`, `data/waterways/connecticut-river-wilder-pool.json`, `data/locations/boathouse-row.json`, `data/waterways/schuylkill-river-fairmount-pool.json` (all four exactly as 4.4 and 4.5), `test/browser/fixtures.js`, new `test/browser/locations.spec.js`, `test/browser/picker.spec.js`, `test/locations-data.test.js`, `test/fixtures/sources/hanover-boathouse/`, `test/fixtures/sources/boathouse-row/`.

Changes:

1. The four files. Before writing them, the builder rechecks each gauge's latest reading and each station's latest observation with 4.2's requests, and records any change in the progress entry (a station gone quiet, as KMHR was, is switched by 02's step 5 rule).
2. `test/browser/fixtures.js` answers every location from the golden scenarios with the ids the request asks for: `/alerts/active` for any query; `/stations/<any>/observations/latest`; the USGS latest request builds one item per requested gauge and parameter from the scenario's flow and temperature items, with the requested `monitoring_location_id`; the continuous and daily requests return the scenario's series for any gauge; `/nwps/v1/gauges/<any flow lid>/stageflow/forecast` returns the scenario's forecast. Unknown paths still land in `seen.missing`.
3. `test/browser/locations.spec.js`: for each slug in the built `dist/locations/index.json`, at 390 px with the `june-calm` scenario at noon: the console is clean; the tab bar holds the tabs 4.1 lists for it; the header shows its name and subtitle; every tab fits the width; the hero shows a verdict; the River flow fact shows only where there is a flow binding; aborting one source names only that source under the hero.

Tests: `test/locations-data.test.js`: the summaries list the three river locations, by slug, with their regions; each record resolves its flow from its waterway (`inherited: true`) and its own observation; Boathouse Row's flow and water temperature come from one gauge, USGS-01474500, and its latest request names it once.

Browser checks: `locations.spec.js` for Putney, Hanover and Boathouse Row. Hanover: the River tab is present, the flow fact names West Lebanon, the Water fact reads "No water temperature here. Add a dock reading in Settings.", the compass shows VT and NH. Boathouse Row: the compass shows NE and SW, and wind across the course reads "Crosswind off the northeast bank." or "... southwest bank." The picker lists Vermont, New Hampshire and Pennsylvania groups, and every curated name takes at most two lines in the header at 360 px (07 13). A switch during a refresh (R9): with Putney's upstream answers held, pick Hanover; Hanover's requests (KLEB, USGS-01144500, WLBN3) go out at once and its hero draws; then Putney's held answers are released, and Hanover's page and its saved copy are unchanged.

Golden: none.

Mutations: Boathouse Row's water temperature row pointing at a gauge other than USGS-01474500 (the record test that its flow and temperature come from one gauge fails); the fixtures answering only `/stations/KEEN/...` (the Hanover check fails with a missing request).

Done when: the net passes, and the main JS and precache budget lines are unchanged except the two records in the precache.

#### P1.13 Lakes and reservoirs: Lake Quinsigamond, Lake Natoma and Lake Carnegie

Files: `src/location.js`, `src/logic.js`, `src/units.js`, `src/render/parts.js`, `src/render/now.js`, `src/render/forecast.js`, `src/render/header.js`, `src/render/detail/wind.js`, `src/styles/app.css`, `data/locations/lake-quinsigamond.json`, `data/waterways/lake-quinsigamond.json`, `data/locations/lake-natoma.json`, `data/waterways/lake-natoma.json`, `data/locations/lake-carnegie.json`, `data/waterways/lake-carnegie.json` (exactly as 4.6, 4.7 and 4.9), `test/location.test.js`, `test/logic.test.js`, `test/units.test.js`, `test/render-location.test.js`, `test/browser/locations.spec.js`, `test/browser/settings.spec.js`, fixtures (4.10).

Changes:

1. Validation: a `none` course is allowed for lake, reservoir and harbor water and still refused (`unsupported`) for river, tidal and canal water; a `polyline` course stays refused, with the message saying phase 3 (section 9). `water.lake` is `{ axis: 0 to 179, lengthM: 50 to 50,000, widthM: 10 to lengthM }`; `water.fetchM` is one number (the same in every direction) or 16 numbers (N, NNE, ... NNW); `water.refFetchM` defaults to 2,000.
2. `fetchAt(water, dirFrom)` (01 9.3): the ellipse chord `F = 1 / sqrt((cos φ / L)² + (sin φ / W)²)`, with φ the angle between the wind and the axis; one number, or the nearest of the 16; with neither, the reference fetch.
3. `chopWind()` in `fetch` mode: `e = U × clamp(sqrt(F / refFetchM), 0.25, 2.0)`, no current, no multiplier; the water state keeps `fetchM` and the wind direction. `waterWhy(ws, loc)` in `fetch` mode: "Wind from the SW has about 1.5 mi of open water to build waves." when F is 1,000 m or more, otherwise "Wind from the NW crosses only about 0.4 mi of water, so chop stays small." Distances go through a new `m.u.waterDist(metres)` in `src/units.js` (miles, one decimal; 01 9.3's copy is metric, and US units are the only system until phase 2). The levels stay 5, 9 and 13 mph of chop wind, information only (README row 8).
4. `windVsCourse()`: a `none` course gives no sentence, so the Wind fact note is "From SW."; on a fetch-mode water with a heading course it gives the head or crosswind sentence without "Chop builds along the ...", which the water state covers.
5. The compass (01 10.5): a `none` course with `water.lake` draws the lake as an ellipse, `rx` 50 and `ry` 50 × W / L (at least 6), rotated to the axis, with no bank labels; with a single `fetchM`, a circle of radius 50; the wind arrow as today. The caption: "Wind from SW across about 1.5 mi of open water.", or "Wind from SW." with only a size. The compass `aria-label` comes from the location: "Wind direction relative to the river" at Putney as today, "... relative to the lake" on still water.
6. The Wind tab, How this works, with a `none` course: "Head and crosswind are not shown because no course is set here."
7. Every other reader of `m.loc.course.heading` follows items 4 to 6 (R11): the full forecast's compass and caption (`src/render/forecast.js` lines 21, 85 and 86) use the Now compass's rules, so a `none` course draws the lake and says "Wind mostly from SW across about 1.5 mi of open water."; on still water with a heading course the caption has no "River runs" sentence and the `aria-label` says "relative to the lake". The Wind tab without a heading draws no wind arrows and no Course column (`arrow()` and `courseWord()`, `src/render/detail/wind.js` lines 27 to 37 and 74), and its How this works names no heading (line 121). The Now caption (`src/render/now.js` lines 48 to 53) drops "River runs ..." on still water. Putney's text is unchanged.

Tests: `test/location.test.js`: the ellipse chords for 3,000 by 600 m are 3,000, 1,412, 832, 647 and 600 m at 0, 22.5, 45, 67.5 and 90°; a single `fetchM`; the nearest of 16; the validation cases of item 1. `test/logic.test.js`: the factors 0.27, 1.0 and 2.0 at 150 m, 2 km and 10 km (01 16.1); fetch-mode chop along and across Lake Quinsigamond's axis; "open water" in the text (01 16.2); no flow reason, no debris, no River tab (`viewsFor`) for the three lakes; Putney's chop numbers unchanged. `test/units.test.js`: `waterDist` rounding. `test/render-location.test.js`: the ellipse at Carnegie's axis; no labels; for each of the three lake records, every view, the Now section and every full forecast rendered from a fixture model contain no `undefined`, no `NaN` and no "River runs" (R11), and Putney's still say "River runs".

Browser checks (`locations.spec.js`): the three lakes have no River tab; `/lake-carnegie#river` falls back to Now with the address's hash removed (01 16.5); Carnegie's compass draws the lake, in Now and in an opened Day by day row, and its Wind fact says only the direction; Carnegie's Wind tab has no arrows and no Course column; the Week view's opened day says "This is a lake. Flow is not checked." (and "This is a reservoir." at Natoma); Settings at a lake has no flow fields and no Course field at Carnegie, and Save works; Natoma, from a `timezoneId: 'America/New_York'` context, reads "All times Pacific, 3 hours behind you." with every time in Pacific; the town search for "Worcester" now lists Lake Quinsigamond within 50 km.

Golden: none.

Mutations: the fetch factor without the 0.25 floor (a test fails); a `none` course on a river accepted (fails); the compass drawing bank labels on a `none` course (fails); the full forecast caption left as today (the no "River runs" test fails at Quinsigamond and Carnegie); the Wind tab drawing arrows with no heading (the `NaN` test fails).

Done when: the net passes with six locations listed.

#### P1.14 Tidal water: Thompson Boat Center

Files: `src/sources/nwps.js`, `src/sources/index.js`, `src/logic.js`, new `src/render/detail/tide.js`, `src/render/detail/index.js`, `src/render/now.js`, `src/route.js`, `src/styles/app.css`, `scripts/budget.mjs`, `data/locations/thompson-boat-center.json`, `data/waterways/potomac-river-tidal.json` (exactly as 4.8), `test/sources.test.js`, `test/logic.test.js`, `test/browser/fixtures.js`, new `test/fixtures/tide.js`, `test/browser/locations.spec.js`, fixtures (4.10).

Changes:

1. The tide fetcher on the `nwps` provider: key `nwps-tide`, slot `tide`, URL `https://api.water.noaa.gov/nwps/v1/gauges/<lid>/stageflow/forecast`, label "the NWS tide forecast", `staleMs` 24 hours. `parseTide(d, b)` refuses an answer whose `primaryName` is not a tide height, drops -999 and null values, and returns `{ station, unit, issued, series: [{ t, h }], events: [{ t, h, type }] }`, with the highs and lows taken as the local maxima and minima of the hourly series. `SLOT_ORDER` gains `tide` after `flowFcst`; the `tide` role already fills the `tide` slot (`ROLE_SLOTS` in `src/location.js`).
2. `src/logic.js`: `tideAt(m, t)` (the height between hourly points, and whether it is rising); `tideEvents(m, from, to)`. In `tidal` mode, `chopWind()` uses the river formula with the crosswind weight and no multiplier: the location has no current data (4.8), and a river multiplier would point the wrong way on a flood. `waterWhy(ws, loc)` adds "Flood tide, rising until about 7 AM." or "Ebb tide, falling until about 1 PM." No `tide` reason in `assess()` (README row 10).
3. The Tide view, `src/render/detail/tide.js`, loaded with `import()` the first time the tab opens: `VIEWS` gains `{ key: 'tide', name: 'Tide', when: loc => !!loc.sources.tide, load: () => import('./tide.js') }` after Wind (01 9.7). `renderDetail()` already shows "Loading." until a view's module is in, then draws (P1.2a). Vite names the chunk `tide-<hash>.js`; `scripts/budget.mjs` adds `{ name: 'tide', precache: true }`. The view (01 9.4, without the stream parts): its opening line names the next high and low; a week strip of the days with tide data, each with "High 5.9 ft" and no status color, and "No tide forecast" for the rest; a chart of the rowing window with the height lane and the highs and lows labeled "about 7 AM, 5.2 ft"; the readout; an "Hour by hour" table (Time, Height, Tide: Rising or Falling); How this works: "Tide heights are the National Weather Service forecast for the Potomac at Georgetown, in feet, hourly for 3 days. Highs and lows are the highest and lowest hourly values, so their times are right to about half an hour. Tide is shown for information. It does not change Go, Caution or Stay off." The station's name in that text comes from the binding's `label` and `note`.
4. A Tide fact on Now, linking to `#tide`: "High about 7 AM, 5.2 ft. Low about 1 PM, 2.4 ft."
5. `test/fixtures/tide.js`: a repeatable tide answer for the browser fixtures, 72 hourly heights from the scenario's clock, `h = 4.0 + 1.6 sin(2π t / 12.42 h)` in feet, `primaryName` "Tide Height"; `test/browser/fixtures.js` answers `GTND2` with it.

Tests: `test/sources.test.js`: `parseTide` on the recorded GTND2 answer (72 points, the first high and low at the hours section 4.8 found), on a flow gauge's answer (refused), and with -999 values; Thompson's bindings: the tide, the flow from the waterway, the river forecast BRKM2, and one latest request for USGS-01646500 with 00060 and 00010. `test/logic.test.js`: tidal chop with no multiplier at any flow; rising and falling text; no `tide` reason; Small Craft Advisory in force at Thompson gives Stay off.

Browser checks (`locations.spec.js`): Thompson's tabs are Now, Week, Wind, Tide, River, Storms, Fog, Temperature, Rain, Light, Air; tapping the Tide chart fills the readout; no request for a `tide-*` chunk at Putney; with an alerts fixture holding a Small Craft Advisory for ANZ535, the hero says Stay off and names it; the compass shows VA and DC.

Golden: none.

The config probe lists only the views Putney has (P1.4 commit (a)), so adding Tide to `VIEWS` leaves `p-config` as it is (R3).

Mutations: a `tide` reason added to `assess()` (a test fails); the Tide view imported statically (the budget's lazy chunk check fails); `parseTide` accepting a flow gauge (fails).

Done when: the net passes with all seven locations listed.

### Batch 4: day words, the Worker, privacy and the owner's tools (P1.15 to P1.19)

Proves at its end: day words hold across a clock change, and the canal and harbor modes are tested; the open counter writes one point per start with no identifiers, and `/privacy` says so, online and offline; the static headers carry a content security policy that every source fits; the owner's Metrics tab is behind Cloudflare Access and refuses everyone until the owner sets it up; the owner has scripts to compute flow limits, bearings and to check every source live. No golden file moves in this batch.

#### P1.15 Day words across a clock change, and the other water modes

Files: `src/format.js`, `src/render/now.js`, `src/logic.js`, `test/format.test.js`, `test/logic.test.js`.

Changes:

1. `addDays(dayKey, n)`, a date string step in `src/format.js`. `dayWord()` finds "Tomorrow" as `addDays(dayKey(now), 1)`, not `dayKey(Date.now() + 24 * HOUR)` (`format.js` line 60; 08 9.3). The "Daylight tomorrow" fact (`now.js`) does the same.
2. `canal` mode (01 9.5): the river formula with the crosswind weight and no wind against current multiplier, even with a flow binding; the water state text says "the canal". `harbor` mode (01 9.6): fetch mode, with the tide text when a tide binding exists. No curated location uses either yet.

Tests: `test/format.test.js`: `dayWord` at 23:30 local on 2026-10-31 and 2026-11-01 (the 25-hour day) and on 2026-03-08 (the 23-hour day), in New York, against the next local date; `addDays` across a month and a year. `test/logic.test.js`: canal chop with no multiplier at 30,000 cfs; harbor chop from fetch.

Browser checks: none new.

Golden: none. 08 9.3 says the change is invisible at the golden times; if a case moves, stop (rule 13).

Mutations: `addDays` by adding 24 hours to a time (the 25-hour day test fails); a canal multiplier (fails).

Done when: the net passes.

#### P1.16 The open counter and the privacy page

Files: new `src/info.js`, `src/reports.js`, `src/main.js`, `src/route.js`, `worker/index.js`, `wrangler.jsonc`, new `privacy.html`, new `src/styles/privacy.css`, `vite.config.js`, `index.html`, `scripts/budget.mjs`, `budget.json`, new `test/info.test.js`, `test/reports.test.js`, `test/browser/smoke.spec.js`.

Changes:

1. `src/info.js` takes `loadInfo()` from `src/reports.js` (08 3.2) and sends `GET /api/info?loc=<slug>&k=<first|return>&m=<standalone|browser>` (07 14.3). `loc` is the slug shown, or `none` on the picker page and the not-found view. `k` is `first` when no `rowhether-last-v1` existed when this start began (`main.js` reads `loadLast()` before anything writes it), else `return`. `m` is `standalone` when `isStandalone()` (`src/install.js`) is true. Nothing else is sent.
2. `worker/index.js`: `info(env, url)` answers as today (`{ env, reports }`, `Cache-Control: no-store`) and, when `env.OPENS` exists and all three parameters are valid (`loc` a slug by `validateSlug` or `none`; `k` and `m` from their two words), writes one Analytics Engine point: `{ indexes: [loc], blobs: [env.APP_ENV || 'production', k, m], doubles: [1] }`. No IP address, user agent, country or account. A missing or bad parameter writes nothing. A throw from `writeDataPoint` is caught; the answer is the same.
3. `wrangler.jsonc` (08 6.7): `analytics_engine_datasets` with `OPENS` on `rowhether_opens` at the top level and `rowhether_opens_dev` in `previews`, and `"analytics": { "binding": "ANALYTICS_SQL" }` in both (wrangler 4.149.0's schema has both keys, read in `node_modules/wrangler/config-schema.json` on 2026-10-20).
4. `privacy.html`, a second Vite input (`build.rolldownOptions.input`, 07 5.15), with no script needed to read it. It links its own small stylesheet, `src/styles/privacy.css`, which imports `tokens.css` and the font and sets a few text rules, and never `app.css`: with two inputs that share `app.css`, Vite splits the shared CSS into its own file and `index.html` links two stylesheets (R12, measured in the review's worktree). Header "RoWhether" with a link "Back to the forecast" (`/`). Text: "RoWhether works without an account." Then 07 14.3's sentence, word for word: "We count how many times the app is opened at each location each day, and whether it was opened from the home screen. The count has no address, device or account attached, and it is deleted after three months." Then what the app keeps in this browser (each location's settings, the last forecast for up to 10 locations, the locations opened recently, the Plan a row and install bar choices), kept on this device and never sent to RoWhether. Then one paragraph on requests the browser makes to other services: forecasts and air quality from Open-Meteo, alerts and observations from the National Weather Service, river and tide data from USGS and NOAA, town search text to Open-Meteo's place search, and Near me's position used once in the browser and not stored or sent. "Last changed <the commit's date>." Phase 2 completes the notice (03 13.3).
5. `scripts/budget.mjs` (R12): the CSS line sums every stylesheet `dist/index.html` links, and the JS line every script it loads at start, and each fails when there is more than one file unless `budget.json` names the extra one (`extraCss`, `extraJs`, both empty). Today `mainFiles()` takes the first `<link rel="stylesheet">` only, so a split would leave the CSS line measuring a few hundred bytes. `budget.json` gains the two empty lists.
6. `vite.config.js`: the input, and `navigateFallbackDenylist` gains `/^\/(privacy|terms|about)$/` (07 9.6). The page is precached with the shell. Workbox's precache route tries `<url>.html` by default (`cleanURLs`, true in `node_modules/workbox-precaching/PrecacheRoute.js` line 33, read 2026-10-20), so `/privacy` is served offline from the precache.
7. No footer link in phase 1: 07 6.6 puts the footer's links line ("Privacy", "Terms", "About") in phase 2 and keeps Putney's footer as it is (owner, 2026-10-21, R6). The page is linked from two places a reader meets the open counter: the `#install` dialog's note and the Settings dialog's intro note each end with "How RoWhether counts app opens." as a link to `/privacy`. Neither is in a screenshot or a golden file. `src/route.js` treats `/privacy` as a server page: the app never routes it.

Tests (`test/info.test.js`): one point with the exact shape for valid parameters; production and dev `env` values in the blob; no point for a missing parameter, a bad slug (`Putney`), a third `k` value, or no `OPENS` binding; a throwing `writeDataPoint` still answers 200 with the same body; POST is 405 with `Allow: GET`. `test/reports.test.js` keeps its `/api/info` checks.

Browser checks: smoke: the footer has no Privacy link, and the install dialog and Settings each have the `/privacy` link; the page requests `/api/info` once per start with the three parameters (a route records the URL): `loc=putney-landing&k=first&m=browser` on a first visit to `/putney-landing`, `k=return` on the reload; `loc=none` on the picker page. `/privacy` at 360 px shows the privacy page with no horizontal scroll; offline in a context with service workers allowed, after one online visit, `/privacy` still shows the privacy page, not the app (07 4.2).

Golden: none.

Mutations: the Worker writing the raw `User-Agent` into a blob (a test that pins the blobs fails); `privacy.html` linking `app.css` (the budget fails on a second stylesheet); `k` computed after `saveLast()` (the first-visit check reads `return` and fails); `/privacy` missing from the denylist with the precache off (the offline check fails).

Done when: the net passes, `dist/index.html` links exactly one stylesheet and one script at start, and `npx wrangler deploy --dry-run` lists `OPENS` and `ANALYTICS_SQL`.

#### P1.17 Security headers

Files: `public/_headers`, `src/sources/*.js`, new `test/csp.test.js`.

Changes:

1. `public/_headers` gains 08 10.11's block, as written:

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://api.open-meteo.com https://air-quality-api.open-meteo.com https://flood-api.open-meteo.com https://marine-api.open-meteo.com https://api.weather.gov https://api.waterdata.usgs.gov https://api.water.noaa.gov https://api.tidesandcurrents.noaa.gov https://geocoding-api.open-meteo.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  Permissions-Policy: geolocation=(self), camera=(), microphone=()
```

   The flood, marine and tides hosts serve adapters deferred to later phases (section 9). They stay, as 08 decided the list, so the header does not change again when those adapters arrive.
2. Every browser adapter exports `hosts` (all do at 30fef7a; the tide fetcher of P1.14 uses the NWPS host).

Tests (`test/csp.test.js`, 08 10.11): every host of every browser adapter in `ADAPTERS` is in `connect-src`; so is `https://geocoding-api.open-meteo.com`; `script-src` has no `'unsafe-inline'`; `frame-ancestors 'none'`; the Turnstile host is in `script-src` and `frame-src`; the `/locations/*` cache rule of P1.2 is still there.

Browser checks, by hand (`vite preview` does not apply `_headers`): `npm run build`, then `npx wrangler dev` (with the app built), `curl -sI http://localhost:8787/putney-landing` shows the policy, and the console shows no CSP violation on Now, every tab, the picker with a town search, Near me, and `/lake-natoma` and `/thompson-boat-center`. After the phase 1 merge to production, open the suggestion form and confirm no violation (08 10.11; Turnstile's entries are from Cloudflare's docs, unverified here).

Golden: none.

Mutations: remove `https://api.water.noaa.gov` from `connect-src` (the test fails); add `'unsafe-inline'` to `script-src` (fails).

Done when: the net passes and the hand check finds no violation.

#### P1.18 The Metrics tab behind Cloudflare Access

Files: `package.json`, `package-lock.json`, new `worker/auth/access.js`, new `worker/admin.js`, new `worker/metrics.js`, `worker/index.js`, `wrangler.jsonc`, `src/route.js`, `src/main.js`, new `src/admin/admin.js`, new `src/copy/admin.js`, `vite.config.js`, `scripts/budget.mjs`, new `test/admin.test.js`, `test/browser/smoke.spec.js`.

Changes (03 3.7, 07 14.5, 08 6.3 and 7.3):

1. `jose` pinned at `6.2.12` in `dependencies` (published 2026-09-05, the latest; verified live 2026-10-20 with `npm view jose time`). Worker only; the app never imports it.
2. `wrangler.jsonc`: `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `vars` and in `previews.vars`, with the values `OWNER-SETS-team.cloudflareaccess.com` and `OWNER-SETS-aud` (production) and `OWNER-SETS-preview-aud` (Previews), and a comment that the owner replaces them after creating the Access application for `/admin*` and `/api/admin/*`.
3. `worker/auth/access.js`: `accessConfigured(env)` is false when either value is empty or starts with `OWNER-SETS`. `verifyAccess(request, env)` reads `Cf-Access-Jwt-Assertion` and checks it with `jwtVerify` against `createRemoteJWKSet(new URL('https://<team>/cdn-cgi/access/certs'))`, issuer `https://<team>`, audience `ACCESS_AUD` (03 3.7).
4. `worker/admin.js`, dispatched from `worker/index.js` for paths under `/api/admin/` before the 404: 503 `{ "error": "not_configured", "message": "The metrics page is not set up here." }` when Access is not configured; 403 `not_allowed` with no token or a token that fails; then `GET /api/admin/metrics?days=7` (days clamped to 1 to 30). JSON errors follow 08 7.2. `Cache-Control: no-store`.
5. `worker/metrics.js`: the queries through `env.ANALYTICS_SQL.query({ query, params })` (from docs, https://developers.cloudflare.com/analytics/sql-api/workers-binding/, read 2026-10-20: the binding queries Analytics Engine datasets as `events.analyticsEngine."<dataset>"`, counts use `SUM(_sample_interval)`). Opens per day and per location for the window and the window before it, first visits, and the share from the installed app; the dataset name follows `APP_ENV` (`rowhether_opens` or `rowhether_opens_dev`). The answer: `{ days, totals: { opens, firsts, standalone }, prior: { ... }, locations: [{ slug, opens, series }] }`, top 20. Whether the account's Analytics Engine entitlement lets the binding read the dataset is unverified until the owner runs it.
6. `src/route.js`: `/admin` is the `admin` page; `src/main.js` loads `src/admin/admin.js` with `import()` for it. The page: header "Admin", one text tab "Metrics", "Last 7 days" with opens, new devices and the share from the installed app, each beside the week before, and the top 20 locations with a sparkline each (`sparkline()` from `src/render/parts.js`). A 503 answer shows "The metrics page is not set up here."; 403 shows "Sign in through Cloudflare Access to see this page."; offline, "This page needs a connection." (07 9.5).
7. `vite.config.js` `globIgnores` gains `**/assets/admin-*`; `scripts/budget.mjs` adds `{ name: 'admin', precache: false }` (07 10.5).

Tests (`test/admin.test.js`, with the verifier and the SQL binding injected): placeholders give 503; no header gives 403; a failing verifier gives 403; a passing one gives 200 with the shaped body; `days=0` and `days=99` clamp; the SQL text names the dataset for `production` and for `dev`; a thrown query gives 502 `unavailable`; POST is 405.

Browser checks (smoke): `/admin` with `/api/admin/metrics` stubbed draws the numbers at 360 px with no horizontal scroll; with a 503 stub it says the page is not set up; no `admin-*` request on `/putney-landing`; the admin chunk is not in `dist/sw.js`.

Golden: none.

Mutations: `accessConfigured` true for a placeholder (a test fails); the route answering before the Access check (fails); `admin` imported statically (the budget's lazy chunk check fails).

Done when: the net and `npx wrangler deploy --dry-run` pass.

#### P1.19 Curation scripts

Files: new `scripts/locations/agent.mjs`, new `scripts/locations/flowstats.mjs`, new `scripts/locations/bearing.mjs`, new `scripts/check-sources.mjs`, `src/location.js`, new `test/flowstats.test.js`, `test/location.test.js`, new `test/fixtures/usgs-01154500-daily.json`.

Changes:

1. `scripts/locations/agent.mjs`: `USER_AGENT = 'RoWhether/1.0 (+https://rowhether.com; OWNER-SETS-contact)'`, the placeholder of section 2, row 14, and a `get(url)` with a 20-second timeout that sends it.
2. `flowDefaults(stats)` in `src/location.js` (01 11.3, 08 K7): with at least 1,095 days, `{ flowCaution: p88, flowOff: p95, against: [[p88, 1.4], [p65, 1.25]] }`, each rounded down to two significant figures; otherwise null. Not used by the app, so not in the bundle.
3. `scripts/locations/flowstats.mjs <USGS id>`: the daily means from January 1 ten years back to yesterday (02, step 1), one request with `limit=10000`, following a `next` link up to 5 pages; percentiles by linear interpolation; prints `stats` for the binding, `flowDefaults(stats)`, and the share of days above each suggested limit for the `copy.flowStats` sentence.
4. `scripts/locations/bearing.mjs <lat1> <lon1> <lat2> <lon2>`: initial bearing and distance, for headings and `distanceM`.
5. `scripts/check-sources.mjs` (02 Tests): for every record in `data/`, every binding's URL from `bindingsFor()`, requested with `Origin: https://rowhether.com` and the User-Agent: prints the status, the `access-control-allow-origin` header and whether the parser accepts the answer. By hand, never in CI. The owner runs it before shipping (09 phase 1 owner tasks).

Tests: `test/flowstats.test.js`: on a committed fixture of daily means for USGS-01154500 (2016-01-01 to 2026-10-15, recorded with step 3's request), p50, p90 and p95 equal 6,910, 21,820 and 28,010 to the nearest cfs (02 Tests; the builder confirms the fixture reproduces 01 6.1's figures, and if it does not, records the fixture's own figures and why); `flowDefaults` gives 20,000, 28,000 and the steps `[[20000, 1.4], [10000, 1.25]]` on it; fewer than 1,095 days gives null; rounding down: 21,820 to 21,000, 28,010 to 28,000, 950 to 950, 1,049 to 1,000. `test/location.test.js`: `flowDefaults` on stats objects directly.

Browser checks: none.

Golden: none.

Mutations: percentiles by nearest rank (the fixture test fails); rounding to nearest (fails).

Done when: the net passes and `node scripts/check-sources.mjs` runs from this container, listing every binding of the seven locations (Open-Meteo's forecast host may time out here; the script reports it as a failure and carries on).

### Batch 5: docs and the proof (P1.20)

Proves at its end: everything in section 8.

#### P1.20 CLAUDE.md, the docs, and the phase 1 proof

Files: `CLAUDE.md`, `README.md` (the repository's), `package.json` (`description`), `budget.json`, `docs/full-app/phase-1-progress.md`, `docs/full-app/HANDOFF.md`, and `docs/full-app/08-architecture.md` 11.2 (one line, item 3).

Changes:

1. `CLAUDE.md`, the rest of the phase 1 edits the owner approved (README row 16; 08 17.2). The rules themselves landed in the steps that made them true (R20: P1.1 the golden rules, P1.2 the service worker sentence and revisions, P1.4 routes and `src/putney.js`, P1.5 the app name and the "Saved" label, P1.6 the navigation sentence, P1.8 the NWS facts, alert levels and endpoints, P1.9 staleness); this step checks each is there and writes the code map for every new file (`scripts/locations/plugin.mjs`, `scripts/locations/revisions.mjs`, `src/render/detail/views.js`, `src/locations.js`, `src/render/header.js`, `src/picker.js`, `src/copy/`, `src/info.js`, `src/render/detail/tide.js`, `src/admin/admin.js`, `worker/admin.js`, `worker/metrics.js`, `worker/auth/access.js`, the curation scripts); the six test locations and their files; the new storage keys; and the test list (route, picker, csp, info, locations-data, locations-load, detail-load, header, admin, golden-check, flowstats, and the browser specs `picker.spec.js` and `locations.spec.js`).
2. `README.md` and `package.json` describe RoWhether for many locations, Putney first.
3. `budget.json`: `css` 7,100, `html` 3,700 and `precacheKiB` 400, the phase 1 row (08 11.2); `js` stays at P1.19's row (34,200 planned), under the row's 46,700 (section 7.1). 08 11.2 gains one line: the detail views became a lazy chunk in P1.2a, so phase 1's main script ends about 12 KB under its ceiling and later phases keep the room. The measured numbers go in the commit message.
4. The final proof, recorded in `phase-1-progress.md`:
   1. The net passes; the test count.
   2. `node scripts/golden.mjs check c7967a64f1a9bd80ed2f0e14ee6c7ceb69d5d3ab` passes, and `git log --format='%h %s %(trailers:key=Golden,valueonly)' c7967a6..HEAD -- 'test/golden/*.json'` lists exactly the ids of 3.4.
   3. The `@visual` screenshots against the `30fef7a` baseline of 3.6: each difference is the chevron, the bank labels or the footer credits.
   4. `timing.spec.js` by hand on a quiet machine, `TIMING_BASELINE_MS=99` for `chromium-390-light` and `104` for `chromium-1280-dark`: the median of 5 within 20%. A miss is rerun as the middle of three (phase 0's rule).
   5. The budget passes; each lazy chunk's size is listed.
   6. `CLAUDE.md`'s browser checklist by hand, and 07 13's phase 1 list (section 8, criterion 4), at 360, 390 and 1280 px, light and dark, midday and 9 PM.
   7. The upgrade, at one address in a persistent profile, from the production build `2b7ef06` (what every installed Putney phone runs: only `putney-rowing-*` keys and a service worker without `skipWaiting`), as P0.14 did (R7): after the takeover the copy keeps its settings, its saved forecast (shown offline at once) and its install bar choice, opens at `/putney-landing` with no note, and reads "Saved" offline; its first start after the takeover reads `locations/putney-landing.json` from the new worker's precache with the network off. Then the same from `30fef7a`, the phase 0 build on this branch: settings, saved forecast and install choice kept, and, since a fresh `30fef7a` copy never wrote `rowhether-last-v1`, `/` opens Putney with the pick note inside the window, as for a first visitor.
   8. The Workers Free limit of 100,000 requests a day, checked against the pricing page (08 17.3), with the date.
5. `HANDOFF.md`: step 12's build part ticked when the proof holds, a log line, and "Waiting on the owner" updated from section 11. The Opus review of phase 1 follows as its own step.

Golden: none.

Done when: every item of the proof is recorded and pushed.

## 7. Budgets per step

### 7.1 The numbers

Gzip bytes at level 9, as `scripts/budget.mjs` measures them. The start is `30fef7a`, measured in this session and again on 2026-10-22 at `a5386c8` (no code changed between them): main JS 43,505 B, CSS 6,001 B, HTML 3,613 B, precache 275.59 KiB (17 entries, 12 distinct). 08 11.2's phase 1 row is main JS 46,700, CSS 7,100, HTML 3,700, precache 400 KiB.

The table gives each step's planned growth and the size expected after it. The first draft ended at 46,695 B, 5 B under the row, and a prototype of part of P1.9 measured 855 B against the 450 planned (R10). So P1.2a moves the detail views into a lazy chunk before any step adds code (measured: main JS 28,368 B), and the estimates of P1.9, P1.13 and P1.14 are raised to about twice the first draft's. Each builder records the measured size in the progress entry, and the next step's row is not changed by it.

`budget.json` `js` after a step is the expected size plus 500 B for the error in the estimate, rounded up to the next 100 B. A row can go down, as at P1.4. `css` is the expected size rounded up to the next 100 B, never below phase 0's 6,100. 08 11.2's 46,700 B stays the ceiling. P1.20 sets `css`, `html` and `precacheKiB` to the phase row and keeps `js` at P1.19's row, about 12 KB under the ceiling, so that phase 2 starts with a budget that still sees growth; 08 11.2 gains one line saying why.

| Step | Main JS growth | Main JS expected | `js` after | CSS expected | `css` after | HTML expected | Precache expected |
| --- | --- | --- | --- | --- | --- | --- | --- |
| start | | 43,505 | 44,000 | 6,001 | 6,100 | 3,613 | 275.6 KiB |
| P1.1 | 0 | 43,505 | 44,000 | 6,001 | 6,100 | 3,613 | 275.6 |
| P1.2 | 0 (build plugin only) | 43,505 | 44,000 | 6,001 | 6,100 | 3,613 | 281 |
| P1.2a | -15,055: the nine views move to the `views` chunk (-15,137 measured), plus about 80 for the switch and retry handling | 28,450 | 29,000 | 6,001 | 6,100 | 3,616 | 282.3 (the chunk is split from the main script, 1.25 KiB of overhead measured) |
| P1.3 | +300 storage functions | 28,750 | 29,300 | 6,001 | 6,100 | 3,616 | 282.3 |
| P1.4 | -90: Putney's records leave (-1,180 measured in the review), routes, loading and the not-found view (+890), the refresh guard (+50, R9), the revision check (+150, R14) | 28,660 | 29,200 | 6,030 | 6,100 | 3,646 | 282.3 |
| P1.5 | +480 header, subtitle, credits, the dated "Saved" label | 29,140 | 29,700 | 6,230 | 6,300 | 3,496 (header +159, credits paragraph -311, measured on a copy of today's `dist/index.html`) | 282.3 |
| P1.6 | +250 home decisions, the note, the picker loader | 29,390 | 29,900 | 6,350 | 6,400 | 3,596 | 301 (picker chunk and its CSS) |
| P1.7 | +50 the offline hero line | 29,440 | 30,000 | 6,350 | 6,400 | 3,596 | 303 |
| P1.8 | +500 zones, the polygon rule (R15), the event list (R18), newest series, local noon | 29,940 | 30,500 | 6,350 | 6,400 | 3,596 | 303 |
| P1.9 | +1,300 staleness, not checked, absent-source copy (a partial prototype measured 855 B, R10; the view sentences land in the `views` chunk) | 31,240 | 31,800 | 6,390 | 6,400 | 3,616 | 304 |
| P1.10 | +450 Settings from the location, limit basis | 31,690 | 32,200 | 6,440 | 6,500 | 3,506 (the flow fieldset built in script, -110 measured) | 304 |
| P1.11 | +200 share, label rotation, generated banks | 31,890 | 32,400 | 6,440 | 6,500 | 3,506 | 304 |
| P1.12 | 0 (data and tests) | 31,890 | 32,400 | 6,440 | 6,500 | 3,506 | 313 |
| P1.13 | +1,000 fetch mode, `none` course, the lake compass and the forecast caption (R11); the Wind tab's part lands in the `views` chunk | 32,890 | 33,400 | 6,500 | 6,500 | 3,506 | 325 |
| P1.14 | +600 the tide fetcher, tidal mode, the Tide fact and its loader | 33,490 | 34,000 | 6,550 | 6,600 | 3,506 | 343 (record and the tide chunk) |
| P1.15 | +60 day words, canal and harbor modes | 33,550 | 34,100 | 6,550 | 6,600 | 3,506 | 343 |
| P1.16 | +80 the counter parameters | 33,630 | 34,200 | 6,580 | 6,600 | 3,566 (two privacy links, R6) | 349 (privacy page and its stylesheet) |
| P1.17 | 0 | 33,630 | 34,200 | 6,580 | 6,600 | 3,566 | 349 |
| P1.18 | +50 the admin route | 33,680 | 34,200 | 6,580 | 6,600 | 3,566 | 349 (the admin chunk is not precached) |
| P1.19 | 0 | 33,680 | 34,200 | 6,580 | 6,600 | 3,566 | 349 |
| P1.20 | 0 | 33,680 | 34,200 (P1.19's row; 46,700 stays the ceiling) | 6,580 | 7,100 (phase row) | 3,566 | 349 |

`html` stays 3,700 throughout; `precacheKiB` stays 400.

### 7.2 Lazy chunks

| Chunk | Step | Loaded when | Precached | Expected size |
| --- | --- | --- | --- | --- |
| `views` | P1.2a | the first tab opened in a visit, or a start at an address with a tab hash | yes (every tab offline) | 17,198 B gzip measured at P1.2a; about 18 KB after P1.9 and P1.13 add view copy |
| `picker` | P1.6 | first tap on the location name, `?open=picker`, the picker page, the not-found view | yes (the offline picker) | 6 to 10 KB gzip (07 10.3, estimate) |
| `tide` | P1.14 | the Tide tab | yes | about 2.5 KB gzip (estimate) |
| `admin` | P1.18 | `/admin` | no (07 10.5) | about 2 KB gzip (estimate) |

They have no size budget in CI (08 11.2: only the phase 3 map chunk does). `scripts/budget.mjs` prints each, checks each exists under its name, checks `index.html` does not load it, and checks the precache rule.

### 7.3 When a step is over its row

In this order: find the saving in the step's own code; move code the first hero does not need into a lazy module (P1.2a did this for the views; the next candidate is the full forecast panel, `src/render/forecast.js`, loaded when a Day by day row first opens, precached); move words the Now screen does not need at once into the lazy module that uses them (the picker page, the not-found view and the pick note's copy into `src/copy/picker.js`, loaded with the picker); load the Settings field builder of P1.10 with `import()` the first time the dialog opens, precached; drop the duplicate `isSet` copies in `rain.js`, `air.js` and `parts.js` (noted in phase 0) for the one in `src/logic.js`. If none of these is enough, stop (rule 13). A raise of a step's row is the batch review's call, in a commit that says why; a raise above 46,700 also updates 08 11.2.

The first hero from the saved copy stays within 20% of the phase 0 baseline (08 11.3): checked by hand after P1.4 and in P1.20.

## 8. Exit criteria and what proves each

09's phase 1 exit criteria, in order.

| # | Criterion (09) | Proven by |
| --- | --- | --- |
| 1 | `npm test`, `npm run build` and `npx wrangler deploy --dry-run` pass. New test files `route.test.js`, `picker.test.js`, `csp.test.js`, `info.test.js`, `locations-data.test.js`, and `test/browser/picker.spec.js` (08 13.7). 01 16.1 to 16.4 and 02's source and discovery tests apply to what this phase builds | The net at every step (rule 3). `route.test.js` P1.4 and P1.6; `picker.test.js` P1.6 and P1.7; `csp.test.js` P1.17; `info.test.js` P1.16; `locations-data.test.js` P1.2 and P1.12 to P1.14; `picker.spec.js` P1.5 to P1.7, P1.12. Also `locations-load.test.js`, `header.test.js`, `golden-check.test.js`, `admin.test.js`, `flowstats.test.js` and `locations.spec.js`. 01 16.1: `validateLocation` cases (P1.2, P1.10, P1.13), `autoBanks` (P1.11), fetch (P1.13), `resolveSources` (unchanged), `effectiveSettings` (P1.10), `flowDefaults` (P1.19), `zoneFormat` (phase 0), storage (P1.3); `slugify` and `courseSegments` are deferred with polylines and the add flow (section 9). 01 16.2: lake (P1.13), canal (P1.15), tidal heights (P1.14), no gauge and stale flow (P1.9); high latitude is deferred (section 9); DST and half-hour zones were proven in phase 0 and P1.15. 01 16.3 is phase 3's (the Worker location API). 01 16.4: P1.2. 02 Tests: the sources tests (P1.8, P1.14) and `flowstats` (P1.19); discovery tests are deferred with discovery |
| 2 | Putney looks as before except 07 3.2's phase 1 list. The golden tests pass with only those differences (08 14.1) | The list is 3.7, which holds 07 3.2's five and the smaller changes each accepted decision brings (R21). `node scripts/golden.mjs check` over the phase, with exactly the ids of 3.4 (P1.20 item 2); the dump diffs recorded per id; the `@visual` before and after (3.6, P1.20 item 3) for the chevron, bank labels and footer; the browser checks for the share link (P1.11) and "Saved" (P1.5) |
| 3 | An existing install keeps its settings and cache, opens at `/putney-landing` with no note above the hero, and renders the cached hero before any request completes (07 13, 01 16.5) | The smoke upgrade check of P1.4, with every upstream host held, and its check of a saved copy 48 hours old (R1); P1.20 item 7, the update from the production build `2b7ef06` in a persistent profile, then from `30fef7a` (R7). The record file comes from the new worker's precache on that first start, checked with the network off (P1.4, item 5); after it, from `rowhether-loc-v1` |
| 4 | 07 13's phase 1 checks | First visit inside and after the window: P1.6. The picker at 360 px with no request while typing: P1.6. The switcher's focus: P1.6. Near me granted, denied, timed out: P1.7. The header at 360 px for every curated name: P1.6 and P1.12 (the loop over `index.json` covers each later record). A lake with no River tab and `#river` back to Now: P1.13. A tidal location with Tide after Wind: P1.14. Chicago on Putney: P1.5. An unknown slug: P1.6. `/putney-landing` from its shell with the old title and no redirect: P1.2 and P1.4. The offline picker and "No forecast saved": P1.7. The share link: P1.11. The manifest named RoWhether with id `/`, and the install bar naming the location: P1.5. All again by hand in P1.20 item 6 |
| 5 | Budget row: 46,700, 7,100, 3,700, 400 KiB; the first hero from cache within 20%; a clean console everywhere | Section 7 at every step; `timing.spec.js` by hand after P1.4 and in P1.20; console checks in `smoke.spec.js`, `picker.spec.js` and `locations.spec.js` |
| 6 | A lazy chunk's name checked by `scripts/budget.mjs` on the first build that adds one; the Workers Free limit checked against the pricing page (08 17.3) | P1.2a adds the check with `views`; P1.6, P1.14 and P1.18 add `picker`, `tide` and `admin`. The pricing page in P1.20 item 8 |
| 7 | The owner has confirmed the open counter, created the Access application, and approved the `CLAUDE.md` changes | The counter and the `CLAUDE.md` changes: accepted 2026-10-20 (section 2, rows 1 and 16). The Access application: still the owner's (section 11). The Metrics tab refuses everyone until then, so phase 1 can merge to `dev` without it; production needs it before the tab is useful, not before the merge |

## 9. Left out of phase 1, or deferred

The owner accepted these deferrals on 2026-10-21 (R13). Each one is now in the section of `09-roadmap.md` for the phase it is deferred to, marked "Moved from phase 1 on 2026-10-21", so the phase 2, 3, 4 and 7 plans pick it up; items 09 already placed in a later phase are left there.

| Item | Where 01 to 08 put it | Deferred to | Why |
| --- | --- | --- | --- |
| The discovery script, `scripts/locations/discover.mjs` over `worker/discover.js` | 08 5.6, 02 Discovery | Phase 3, built with `GET /api/discover`, which uses the same module | The seven phase 1 records are curated by hand with the live checks of section 4. Discovery is the largest piece of phase 1 tooling (about 21 requests per run at Putney, NLDI, NWPS and scoring) and its first real user is phase 3's add flow. 08 5.6 lists "no discovery tool in phase 1" as the alternative; the owner finds gauges with `scripts/check-sources.mjs` and `flowstats.mjs` until then |
| CO-OPS adapters (tide predictions, water level, currents, water temperature) | 02 phase 1 | The first tidal location with no NWPS tide point, phase 3 at the latest | The one tidal test location has an NWPS tide forecast 866 m away; the nearest CO-OPS stations are on other water (4.8). A second tide source would also need fallback switching (below) |
| Tidal streams: the stream lane, `streamCaution`, `streamOff`, the against multipliers, slack, `minLaunch` | 01 9.4 | With the CO-OPS currents adapter | No current data at Thompson Boat Center; tide is information only (README row 10), so the limits would draw lines with nothing behind them |
| The NWPS tide forecast as a fallback to CO-OPS, and fallback bindings in general (`mode: 'fallback'`, `staleSwitchH`) | 01 4.2, 15.7 | Phase 3, or the first curated location with a spare gauge | No phase 1 location has a second gauge for a role |
| GloFAS (`om-flood`) and Open-Meteo marine water temperature (`om-marine`) | 02 phase 1 | Phase 7, or the first location on a large river with no gauge | Every phase 1 river has a gauge; no phase 1 location is coastal |
| The `level` role and the Level tab | 01 9.3, 9.7 | The first reservoir with a level gauge | Lake Natoma has none bound; none of the six needs it |
| Polyline courses and `courseSegments()` | 01 10.1 to 10.3 | Phase 3, with the map that draws them | No test location needs one, and phase 1 has no map to draw or check one. The validator keeps refusing it, now naming phase 3 |
| High-latitude rules: polar days, white nights, sunset after midnight (01 15.4) and their copy (07 6.7) | 09 phase 1 (01 section 15) | The first curated location above 55° N, or phase 7 | The northernmost phase 1 location is 43.7° N. The rules cost main script bytes the phase 1 row does not have (7.1) |
| `attributionFor(loc)`, credits generated from the bindings | 02 Attribution, 07 6.6 | Phase 3, with community locations | Every curated record carries `copy.credits` (checked by P1.2) |
| The generated flow note (01 11.3) | 01 11.3, 11.6 | Phase 3 | Every curated record with flow carries `copy.flowStats` (checked by P1.2) |
| The Info tab, launch notes, traffic pattern, emergency information | 07 4.4, 5.5 | Phase 3 | No test record has launch notes or a traffic pattern; Lake Natoma's release warning is in its subtitle |
| `slugify()` and slug aliases | 01 2.2, 15.10 | Phase 3 | Curated slugs are written by hand and never renamed in phase 1 |
| Recomputing a waterway binding's distance for each member location | 01 6.2 | Phase 3 | Each phase 1 waterway has one location |
| Per-slot refresh pacing (`refreshMs`, `due()`: air quality and models hourly) | 02 fetchAll | Phase 4, with server-side forecasts | It changes CLAUDE.md's "Refresh every 10 minutes" rule and is an optimization, not something the prototype needs. Staleness ships in P1.9 |
| Favorites, compare, the account button, units and clock | 07 5.2.3, 5.3, 7 | Phase 2 | As planned in 09 |
| The picker map, the add flow, quick look `/at/` | 07 5.2.5, 5.4, 5.6 | Phase 3 | As planned in 09 |
| Removing the old `putney-rowing-*` keys | 01 8.6 step 7 | Phase 2 | As planned |
| What `/` shows after the window, in `index.html`'s title and Open Graph tags (07 6.5, "RoWhether rowing conditions") | 07 6.5 | The commit that sets the window end, when phase 1 reaches production | During the window `/` must keep previewing as Putney |

## 10. Findings from the live checks

Things the checks of 2026-10-20 found that change or sharpen 01 to 08. Each is applied in the step named.

1. USGS `latest-continuous` returns at most 10 items without `limit`, and a gauge can list several series for one parameter: USGS-01646500 lists five 00010 series, four ended in 2019. Today's request has no `limit` and today's parser keeps the last match. P1.8 adds `limit=50`, lists each gauge once, and keeps the newest reading.
2. Putney's flow statistics move with the window. With data to 2026-10-18 (3,942 days) p95 is 27,995 cfs, which 01 11.3's rule rounds down to 27,000, not 28,000; with data to 2026-10-15 (3,939 days, 01 6.1) it was 28,010. Putney keeps 20,000 and 28,000 as curated values (02, step 8), and `flowstats.test.js` uses a fixed fixture. The rule sits on a rounding edge at Putney; that is worth knowing before phase 3 recomputes defaults yearly (02, step 7).
3. The NWS `/points` endpoint answers 301 for a point with more than 4 decimals. Records store 5 decimals (01 2.1), and no phase 1 code requests `/points` at run time (alerts use zone lists), so nothing breaks; discovery (phase 3) and the scripts round to 4.
4. The Hanover boathouse resolves to Vermont zones (VTZ021, VTC027) although Nominatim puts the building in New Hampshire, as Putney's point resolves to New Hampshire. Binding both banks' zones, as P1.8 does for Putney, covers it.
5. At Thompson Boat Center the dock point misses marine zone ANZ535, and a Small Craft Advisory was active there during the check. 02's finding 7 holds; the record binds ANZ535, and README row 11 makes it Stay off.
6. KMHR (Mather, 10 km from Lake Natoma) had not reported for over 8 hours; KSAC is bound by 02's step 5 rule. P1.12's recheck rule covers stations that go quiet.
7. CO-OPS's nearest stations to Georgetown are in the Washington Channel, 4.4 km away on other water, while NWPS has a tide forecast point 866 m upstream. 02's step 10 already offers an NWPS "Tide Height" point within 5 km for tidal water; the check confirms it is the better source here.
8. The NHDPlus snap at the Thompson Boat Center dock point lands on Rock Creek, which runs north, and gives an upstream bearing of 3 to 34°, not the Potomac's 285°. Discovery's heading suggestion (02, step 13; phase 3) should check that the snapped line's name or mainstem matches the waterway.
9. With `not_found_handling: "single-page-application"`, a `fetch()` of a missing file is answered with `index.html` and 200, not 404 (Cloudflare's routing diagram, from docs). `fetchRecord()` parses the body and checks its slug, then the index, and never reads the content type, which other static hosts set differently (P1.4, R4).
10. GTND2's forecast highs (5.2 to 5.9 ft) come close to its flood action stage (5.5 ft) and minor flood stage (6 ft). Tide stays information only, but the Tide view's high labels show the number, which is what a rower at Thompson would want.
11. Open-Meteo's geocoding host timed out on two of four tries from this container; the picker's failure line (P1.7) is a real path.
12. The Analytics SQL binding (`analytics`) is in wrangler 4.149.0's schema; its `query()` API is from Cloudflare's docs. Whether the account can read the dataset through it is checked when the owner opens the Metrics tab.
13. The golden files cannot be compared as text. In the 19 main cases and `p-config` the key order no longer matches what the capture produces (phase 0 moved keys; the per-key `toEqual` never noticed, correctly, since no value changed). A text snapshot, 08 14.1's preferred tool, would fail 20 files with no value changed. P1.1 keeps the per-key comparison and adds an update mode that keeps each file's key order (3.1).

## 11. Placeholders and what waits on the owner

Each placeholder is marked in the code with the word `OWNER-SETS` or a `PLACEHOLDER:` comment, so `grep -rn "OWNER-SETS\|PLACEHOLDER:" src worker scripts wrangler.jsonc` lists them all.

| Placeholder | Where | Step | What the owner supplies |
| --- | --- | --- | --- |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | `wrangler.jsonc`, both blocks | P1.18 | The Zero Trust Access application for `/admin*` and `/api/admin/*`, production and Previews, and its team domain and AUD values (03 3.7). Also whether the free Zero Trust plan's seat count fits (unverified) |
| `USER_AGENT` contact | `scripts/locations/agent.mjs` | P1.19 | The contact address for NWS, Nominatim and aviationweather.gov requests (02) |
| `FIRST_VISIT_PUTNEY_UNTIL` | `src/config.js` | P1.6 | The date 90 days after phase 1 reaches production, set with that merge |
| "Not confirmed on site" on six records, `course.confirmed: false` | `data/locations/*.json` | P1.12 to P1.14 | Which clubs confirm each dock point and course (README row 13). A confirmed record becomes `verified`, with `verifiedVia`, and loses the badge |
| Putney's heading of 15, the "Bellows Falls dam to Vernon dam" reach, and "about 19 mi downstream" for Northfield (straight line; 24.8 river miles) | Putney's two files | none | The on-site checks (README row 17) |
| Tidal stream limits and multipliers | 01 9.4 only | none | Local knowledge, when a location with current data is added (README row 18) |
| The Wilder Dam pool's upstream end, and whether Little Falls is the head of tide | the Hanover waterway's `reach`; Thompson's copy avoids the claim | P1.12, P1.14 | A check, if the owner wants the text to say more |
| The Analytics Engine read through the `analytics` binding | `worker/metrics.js` | P1.18 | Opening the Metrics tab once Access is set up |
| Running `node scripts/check-sources.mjs` before phase 1 ships (09 phase 1 owner tasks) | | P1.19 | A run from the owner's machine |
