# Phase 0 final review: design, simplicity and cost

Reviewed the whole phase 0 diff (`git diff 2b7ef06 HEAD` over `src/`, `worker/`, `data/`, `index.html`, `vite.config.js`, `package.json`, `wrangler.jsonc`, `public/`, `scripts/`, `test/`, `.github/`, `budget.json` and `playwright.config.js`) on `dev-full-app` at commit `c83a96b`, started Sun Oct 18 22:09:22 UTC 2026 (`date -u`). Lens: design, simplicity and cost, against CLAUDE.md ("Prefer vetted, community-standard solutions over new tooling. Keep it simple.") and 08 sections 3 and 11. This is step 9 of HANDOFF.md, findings only. A separate review covers correctness (`phase-0-final-correctness.md`).

Status: in progress

Count so far: 1 blocker, 3 major, 1 minor.

Severity: blocker must be fixed before phase 0 is called done; major is a real defect, gap or cost worth fixing now; minor is small.

How the evidence was made: git worktrees at `c83a96b` and at the last commit of each step (`git archive`, `node_modules` linked), built with `npx vite build`, the main script gzipped at level 9 with Node's `zlib` as `scripts/budget.mjs` does. A second build with `--sourcemap` was split by source file to see which module grew. Size experiments edit one fresh copy of `c83a96b` each and build it; "size probe" marks a copy that only prices something and would not run. Test times are wall clock on this container (4 cores, Node 22.22.0). Nothing was written to `test/golden/` or `test/browser/__screenshots__/`, and nothing was committed but this file.

## Blockers

#### FD1. The JS budget was raised to the measured size at every step, and 08 11.2 no longer matches it

- Severity: blocker.
- Where: `budget.json` (`"js": 43300`); 08 11.2 (the table and its rule) and 14.2 P0.3; `phase-0-progress.md`, the "Deviation, `budget.json`" lines of P0.7 to P0.12; HANDOFF log, 22:20 UTC.
- Problem: A budget exists to fail when the script grows by surprise. In phase 0 it never could. Six steps each raised `budget.json` to the new size plus 8 to 99 B, so the check passed at every commit and now has 13 B to spare. 11.2 still prints 40,500 B for phase 0 and says `budget.json` holds the current phase's row, which is no longer true. Its phase 1 row, 43,200 B, is below where phase 0 already ends, so phase 1 would start over budget. Any fix this review or the correctness review asks for that adds a few bytes fails CI. HANDOFF asks step 9 and P0.14 to settle a budget with real headroom and to say in 11.2 why phase 0 grew.
- Evidence: each step's last commit built and gzipped (main JS, gzip level 9):

| Step | Commit | Main JS | Change | `budget.json` after |
| --- | --- | --- | --- | --- |
| dev | `2b7ef06` | 38,988 | | none |
| P0.3 | `5bbb6e8` | 39,004 | +16 (the hero mark) | 40,500 |
| P0.4 | `21c835f` | 39,216 | +212 | 40,500 |
| P0.5 | `d2b517b` | 39,216 | 0 | 40,500 |
| P0.6 | `dd0cdda` | 39,289 | +73 | 40,500 |
| P0.7 | `7198875` | 41,949 | +2,660 | 42,000 |
| P0.8 | `ec9f146` | 42,587 | +638 | 42,600 |
| P0.9 | `78466ba` | 42,792 | +205 | 42,800 |
| P0.10 | `7e154ac` | 42,801 | +9 | 42,900 |
| P0.11 | `d8d7819` | 43,088 | +287 | 43,100 |
| P0.12 | `a51f0fa` | 43,287 | +199 | 43,300 |
| P0.13 | `c83a96b` | 43,287 | 0 | 43,300 |

  Every number matches `phase-0-progress.md`. Raw minified size went from 109,839 to 121,726 B. By source file (source map, raw minified bytes, dev to `c83a96b`): the four adapter files and `src/sources/index.js` are new (6,999 B), `src/data.js` fell from 2,884 to 481, `src/location.js` is new (2,151), `src/storage.js` rose from 1,185 to 2,390, `src/format.js` from 1,818 to 2,651, `src/units.js` is new (748), `src/logic.js` rose from 14,417 to 14,955, and `src/config.js` shows 4,304 to 5,295 because the map gives it the two inlined JSON records (3,115 B) that follow it. The render files moved by under 200 B each. What the main parts cost in gzip, each priced on a copy of `c83a96b`: the two records 1,191 B (size probe: both files emptied, 42,096 B), of which 621 B is fields phase 0 never reads (records cut to what the code reads, 42,666 B); the storage migration 377 B (size probe: `migrateStorage` emptied, 42,910 B). P0.7 is the step that first imported `src/putney.js`, which is why it grew most. A realistic mistake for comparison: shipped code that calls `validateLocation` and `validateWaterway`, which only tests use today, adds 2,993 B (46,280 B).
- Fix: Set `budget.json` `"js"` to 44,000. That is 713 B over today, enough for this review's fixes, and the validator mistake above still fails it by 2,280 B. In 08 11.2 set the phase 0 row to 44,000 and add under the table: "Phase 0 ended at 43,287 B, 4,283 B (11%) above P0.3's 39,004 and 2,787 B over the 40,500 planned. Putney's two records ship inside the main script until phase 1 loads them from `data/` (1,191 B, 621 B of it fields only later phases read). The one-time storage migration adds 377 B. The rest is the location resolver, the nine adapters in place of `SRC`, zone-aware formatters and units." Move rows 1 to 7 up by the same 3,500 B, keeping 07's steps: 46,700, 48,700, 51,700, 52,700, 56,700 and 57,700. Phase 1 takes the records out of the main script (01 7.4), so it may come in under its row. Add one rule to 11.2: a step raises the budget only by what it planned to add, in the commit that adds it, and never to the measured size plus a few bytes. Make the change in one commit that says why, as 11.2 asks.

## Major

#### FD2. Most of the test time, and most of the drawing time, is the same instants formatted again and again

- Severity: major.
- Where: `src/format.js` lines 21 and 24 (`dayKey`, `localHour` in `zoneFormat`); their callers in `src/logic.js` (`rowingHours`, `periodsFor`, `morningFog`, `nextMorning`, `planSessions` and the runs, each filtering every hour with `m.fmt.dayKey(h.t)`); `test/golden.test.js`, `test/golden-variants.test.js`, `test/browser/parity.spec.js`.
- Problem: `npm test` went from about 1 s to about 21 s. The progress file's P0.1 entry already names the cause: "Most of it is `dayKey`, an `Intl` call". Every model, period, run and view asks for the day key and local hour of the same few hundred hourly instants, thousands of times, and each answer is a fresh `Intl.DateTimeFormat` call. The app pays the same cost on every draw, which matters on a phone and inside the 20% first-hero budget (11.3). Phase 0 did not cause it (the pattern is older), but phase 0 made it the main cost of every test run, every parity run in CI, and every local check a builder makes. Remembering each instant's answer inside `zoneFormat`, which is already cached per zone, removes it without touching a caller.
- Evidence: a copy of `c83a96b` with only this change to `src/format.js`:

```js
const keys = new Map(), hours = new Map();
const dayKey = t => { let k = keys.get(t); if (k === undefined) { k = fKey.format(new Date(t)); if (keys.size > 5000) keys.clear(); keys.set(t, k); } return k; };
const localHour = t => { let h = hours.get(t); if (h === undefined) { h = parseInt(fH24.format(new Date(t)), 10) % 24; if (hours.size > 5000) hours.clear(); hours.set(t, h); } return h; };
```

  `TZ=Pacific/Auckland npx vitest run`, two runs each: unchanged copy 22.0 s and 20.5 s, changed copy 8.4 s and 7.9 s, 595 of 595 passing in both, the 107 golden files included. The two golden files take 18.3 s and 16.8 s of the 41.2 s that all files take together today. One `capture()` of `june-calm-1200-default` (what each parity case also runs): 1,035 ms and 833 ms before, 221 ms and 170 ms after. What `render()` does, timed in Node over 20 runs on that case: `buildModel` 11.3 and 12.0 ms before, 2.7 and 4.7 ms after; the home screen sections 2.8 and 2.6 ms before, 1.7 and 2.4 after; the Week view 39.4 and 44.6 ms before, 4.4 and 6.9 after. The browser first-hero time was not measured with the change.
- Fix: Add the memo to `zoneFormat` in its own commit (a small helper such as `remember(fn)` reads better than the two inline lines above), with a comment saying why. The golden files, the parity spec and the 48 screenshots prove the output is the same. Run `timing.spec.js` before and after and record both in the progress file; P0.14's timing check only asks for "within 20%", so a faster first hero passes. If the owner prefers phase 0 to change no app code beyond the plan, make it the first commit of phase 1 instead, before the golden suite grows further.

#### FD3. The 48 screenshots are 86% of a fresh clone and have no use after P0.14

- Severity: major.
- Where: `test/browser/__screenshots__/` (48 PNGs from `743e8cd`), `test/golden/*.json` (107 files), `test/browser/screens.spec.js`, `.github/workflows/ci.yml` line 20; PR #6 (`dev-full-app` into `dev`).
- Problem: The app's whole history before phase 0 packs to 0.3 MB. The branch now packs to 17.6 MB, and 15.1 MB of that is the screenshots. Once PR #6 merges with a merge commit, every clone of `dev` and `master` carries them for good, since history is never rewritten here. Their job ends at P0.14 item 3. They compare at 0 pixel difference only on the container that made them, CI never runs them, and phase 1 changes every one of them on purpose: 07 3.2 puts a chevron after "Putney Landing" in the title, which is in every shot, and rotates the compass bank labels. Phase 0 changed no CSS, no `index.html` and nothing in `public/` (`git diff --stat 2b7ef06 HEAD -- src/styles index.html public` is empty), so after P0.14 the parity spec, which checks the page's text in CI on every push, covers what phase 0 could still break. The golden JSON is a different case: 5.2 MB on disk but 0.47 MB packed, and 09 keeps it as Putney's net through phase 5.
- Evidence: `git rev-list --objects <rev> | git pack-objects --stdout | wc -c`: `2b7ef06` 335,486 B; `HEAD` 17,550,200 B. The same for the commits since `2b7ef06` limited to the screenshots: 15,106,607 B; to `test/golden`: 1,239,293 B (the 17 MB version that `c7967a6` trimmed is in history); the golden files at HEAD alone: 470,206 B. On disk: 107 golden files, 5,249,679 B; 48 screenshots, 15,828,036 B.
- Fix: The owner's choice, to make before PR #6 merges:
  - A. Merge as is. Every clone of `dev` and `master` carries about 16 MB of images forever. Nothing else to do.
  - B. Recommended. Once P0.14 has recorded item 3 in the progress file, delete `test/browser/__screenshots__/` and drop the screenshot half of the CI diff step (a deletion fails `--diff-filter=MD` today, FD4). Keep `screens.spec.js` as the before and after tool for a later phase, writing its baseline to a git-ignored folder on the machine that compares. Then the owner squash-merges PR #6, so `dev` and `master` never hold the images. `dev-full-app` keeps the step commits and the images at `743e8cd`, so it must not be deleted: the progress file cites its commits.
  - C. Git LFS. Not recommended: it cannot take files out of history that is already pushed without a rewrite, which the owner does not allow; it adds a tool; and GitHub's free LFS quota is small.
  Keep the golden JSON either way. If its size on disk matters later, the variant files (`v-*`, 88 of the 107) can be pruned to the ones that still guard a rule once phase 1 has its own tests.

#### FD4. The phase 0 rules have no end, so the first intended change in phase 1 fails CI

- Severity: major.
- Where: `.github/workflows/ci.yml` line 20 (`git diff --exit-code --diff-filter=MD c7967a6... HEAD -- 'test/golden/*.json' && git diff ... 743e8cd... HEAD -- test/browser/__screenshots__`); `test/golden/harness.js` line 60 (a file that exists is never rewritten) and `scripts/golden.mjs` (no update mode); `test/browser/parity.spec.js` (the page against the golden files); `playwright.config.js` (`updateSnapshots: 'none'`); 08 14.1 ("never written after P0.1 and P0.2"); 09 phase 1 exit criterion 2.
- Problem: Every guard against editing the expected outputs is written for phase 0 alone, and nothing says when it stops. 09's phase 1 exit criterion 2 says "The Putney golden tests pass with only those differences", the changes 07 3.2 lists. No tool in the repo can make that true: the harness refuses to rewrite a file, `--force` was removed on purpose (review Z9), CI fails on any modified golden file or screenshot whatever the commit says, and the parity spec fails as soon as the page differs from the files. A phase 1 builder has to remove guards to make progress, with no rule for which and how, which is the situation Z9 was written to prevent.
- Evidence: reasoning only, from the files above and 07 3.2 (the title chevron and the rotated bank labels change `home`, the full forecasts and the Wind view in the golden files).
- Fix: Write the end into 08 14.1 and 13.6 now, so it is decided before it is needed: "The phase 0 rules (no golden write, the CI diff step, no screenshot update) hold until PR #6 merges into `dev`. From phase 1 the golden files are snapshots of Putney: a commit that changes Putney's output on purpose rewrites the cases it changes with `node scripts/golden.mjs update <case>` and says in its message which listed change moved them; the diff of the JSON is the review. A commit that changes no behavior changes no golden file." Then, in phase 1's first commit: add the `update` mode (rewrite the named cases only, never all), and replace the CI diff step with one that fails only when a golden file and a file under `src/` change in a commit whose message does not name a listed change, or drop the step and rely on review. Delete the screenshot half of the step with the screenshots (FD3).

#### FD5. What can be trimmed from the script with no visible change: about 140 B

- Severity: minor.
- Where: the four adapter files in `src/sources/` (`regions`, `via`, `hosts`, `refreshMs`, `staleMs` on nine adapters); `src/units.js` lines 14, 34 and 40 (`system`, `windUnit`, `stage`, `toMph`, `toF`, `toFDiff`, `toFSum`, `toIn`); `src/location.js` line 39 (`ROLES`); `src/putney.js` and the two records.
- Problem: The script carries a few things nothing in `src/` reads. Nine adapters each ship five fields that only `test/sources.test.js` reads: `regions` is for discovery (phase 1, in the Worker and scripts), `hosts` for the CSP test (10.11), `via` is `'browser'` on all nine, and `refreshMs` and `staleMs` are `null` everywhere (conflict K9). `unitFormat` returns eight members no caller uses yet; 07 7.7 names them for phase 2. `const ROLES = ROLE_SLOTS.map(...)` stays in the bundle (`Oe.map(e=>e[0]);` in the output) because Rolldown cannot drop a call, though only the validator, which is not bundled, uses it. The records hold 621 B of gzip that phase 0 never reads (ids, status, site coordinates, gauge statistics, `copy.credits`, which `index.html` also prints, 157 B alone), but they are the phase 1 source of truth and leave the main script in phase 1 (01 7.4). Trimming them now would need a second, smaller copy of Putney or a build step, both worse than 621 B for one phase. The validators are already tree-shaken, and the `src/data.js` re-exports cost nothing.
- Evidence: size experiments on copies of `c83a96b` (43,287 B): adapter fields removed 43,189 (98 B less); only `via`, `refreshMs` and `staleMs` removed 43,256 (31 B); unit members removed 43,234 (53 B); adapter fields, unit members and `ROLES` together 43,144 (143 B); records cut to what the code reads 42,666 (621 B); `copy.credits` removed 43,130 (157 B).
- Fix: Optional. Remove `ROLES` from module scope (compute it inside `checkSources`). Leave the adapter fields and unit members: 151 B is not worth splitting 02's typedef across two files or re-adding 07's names in phase 2. Do not trim the records. FD1's budget already has room for all of this.
