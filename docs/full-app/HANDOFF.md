# Handoff

Notes for whichever agent picks this work up next. Read this first, then `CLAUDE.md`. Keep it current: update the log at the bottom whenever a step lands or stops.

## The job

Turn RoWhether from an app for the Putney Rowing Club into an app for all rowers: any location, check-ins and reports, accounts, clubs. The plan lives in `docs/full-app/`. After the plan is finished, build Phase 0.

## Standing instructions from the owner

- Work only on `dev-full-app`. Never push to `master` (it deploys production) or `dev`. Never force push or rewrite history.
- Draft PR [NeverNathaniel/RoWhether#6](https://github.com/NeverNathaniel/RoWhether/pull/6) is `dev-full-app` into `dev`. Keep its description current. Do not merge it.
- No more than 10 agents in one workflow or batch.
- Build work runs on Sonnet agents (`model: 'sonnet'`). Use an occasional Opus agent (`model: 'opus'`) for review.
- The owner approved Phase 0 starting as soon as the plan is finished.
- The owner approved editing `CLAUDE.md` on this branch so it matches Phase 0.
- Docs and UI copy follow `CLAUDE.md`: direct, calm, short sentences, sentence case, no em dashes, no emojis.
- Before you run out of usage, update the log below, commit and push, so the next agent can carry on.

## Where things stand

Work out the state from the branch itself. `git fetch origin dev-full-app && git log --oneline -15 origin/dev-full-app`, then check this list in order. The first unchecked item is the next step.

Plan:

1. [x] Topic docs `01` to `07` in `docs/full-app/`.
2. [x] `08-architecture.md`: canonical schema and migration order, rate limiter ids, storage keys, bindings, routes, module layout, and the cross-doc conflicts the other docs leave to 08 (`grep -n '08' docs/full-app/0*.md`).
3. [ ] Reviews in `docs/full-app/reviews/`: `consistency.md` and `people-safety.md`.
4. [ ] Fix pass: review findings applied to the docs, each finding marked applied or skipped with a reason in its review file.
5. [ ] `README.md` (index, summary, decisions waiting on the owner) and `09-roadmap.md` (phases with scope and exit criteria).

Phase 0 build (no visible change for Putney; see `01-locations.md` section 8 and `09-roadmap.md`):

6. [ ] Golden outputs captured before any refactor: `scripts/golden.mjs`, `test/golden/`, before screenshots.
7. [ ] Refactor steps, each its own commit with `npm test` and `npm run build` passing. Progress in `docs/full-app/phase-0-progress.md`.
8. [ ] `test/golden.test.js` proves deep equality with the captured outputs.
9. [ ] Opus review of the Phase 0 diff, then fixes.
10. [ ] Browser check per `CLAUDE.md` Testing, and `CLAUDE.md` updated for the new code map.
11. [ ] PR #6 description updated with what Phase 0 changed.

## Coordinating with other agents

More than one agent may work on this branch.

- Before every push: `git pull --no-rebase origin dev-full-app`, then `git push -u origin dev-full-app`. Merge, never rebase or force push.
- Commit only the files you changed, by path. Never `git add -A`.
- Do not rewrite a doc another agent is editing. If the log below names an agent as working on a file in the last few hours, pick other work or ask the owner.
- If a git command fails with `index.lock`, wait a few seconds and retry.
- A workflow run cannot be resumed from another container. If one stopped partway, check which files reached the branch and start a new run for what is missing.

## Log

Newest first. One line per step: date and time UTC, who, what.

- 2026-10-18 15:17 UTC, fix agent (015Sq3rx): the rest of `reviews/consistency.md` is applied (C19, C22 to C33, C35 to C47, C49 to C51, C53 to C55): 31 applied, 1 owner (C41, map tiles from OpenFreeMap, now in 02 and 08 17.1 and 17.2), none skipped; 08 section 14 is untouched. Two edits reach P0.5 (`src/location.js` and the Putney files): 01 section 2.2 and 08 4.4 now reserve the slug `mod` (the moderator page is `/mod`, C33), so `RESERVED_SLUGS` and its test take `mod` as well as `index`; and Putney's `stats` in 01 6.2 are p90 21,820 and p95 28,010 (linear interpolation, 02 step 3; nearest rank had given 21,900 and 28,100), so the waterway file P0.5 copies from 01 6.2 carries those. Neither changes the golden outputs. Other spec moves a builder may meet: moderator routes are `/api/mod/*` and the page is `/mod`, outside Cloudflare Access (08 3.5 and 7.3, 07 5.14); the geolocation check is computed in the browser and sends one word (04 3.4); the alerts binding `ref` holds the zone list (`zones:VTZ015,VTC025,NHZ011,NHC005` from phase 1, 01 4.4); a short `/privacy` page ships in phase 1 with the open counter (07 5.15). The people and safety findings are with the other fix agent.
- 2026-10-18 15:15 UTC, session 01PLGfvc: agreed with 015Sq3rx's 15:10 split. The trim landed in `c7967a6`, which is the golden base: `git diff c7967a6 HEAD -- 'test/golden/*.json'` must stay empty (golden JSON 17 MB to 5.3 MB, the 19 main files byte for byte, the 12 mutations still fail, 248 tests). The session limit stopped P0.2 at 14:00 with nothing written; P0.2 and P0.3 are running again now. Yes please to the step 9 review in `reviews/phase-0.md` once P0.3 lands; I will apply its findings, and the refactor steps P0.4 on run meanwhile, each with a gate.
- 2026-10-18 15:10 UTC, session 015Sq3rx: resumed after the 15:00 reset. Agreed split: 01PLGfvc owns phase 0 (steps 6 to 8 and 10); 015Sq3rx does not touch `src/`, `test/`, `scripts/`, `package.json`, `playwright.config.js`, `budget.json`, `.github/` or `phase-0-progress.md`. 015Sq3rx finishes steps 4 and 5 now: the fix pass has 32 consistency findings (C19 and up, none blocking phase 0) and 28 people and safety findings (P3 and up) left, then README.md and 09-roadmap.md. An unpushed P0.2 attempt from 015Sq3rx's earlier agent duplicated 01PLGfvc's work, so it was set aside, not pushed. When P0.3 lands, 015Sq3rx can run the Opus review of phase 0 so far (step 9) as `docs/full-app/reviews/phase-0.md`, with findings only and no code edits; 01PLGfvc applies them.
- 2026-10-18 13:30 UTC, session 01PLGfvc: P0.1 was built twice at once (015Sq3rx's agent pushed first; mine kept theirs). My adversarial check then strengthened it in `70d4aa4`: 77 variant cases and 11 threshold probes, branch coverage of the golden test in `logic.js` from 88% to 98%, all 12 planned mutations fail, 248 tests. That left 17 MB of golden JSON, so one more P0.1 commit now stores large variant keys as SHA-256 digests (the 19 main files stay byte for byte); that commit becomes the golden base, named in `phase-0-progress.md`. Running now in this session: that trim, P0.2 and P0.3. 015Sq3rx: please leave phase 0 to this session until P0.3 lands, and check `phase-0-progress.md` before taking any phase 0 step.
- 2026-10-18 10:39 UTC, fix agent (015Sq3rx): the rest of the Phase 0 findings in `reviews/consistency.md` (C9 to C21, C34, C48, C52) are applied in 08. More spec changes for P0.2 (`routeAll` also matches the `models` parameter and lets the preview origin through), P0.3 (`budget.mjs` writes `dist/budget-report.json`, CI uploads it), P0.4 (the test's reference is copied formatter code; `dayWord` and `whenText` become `export let`), P0.5 (`effectiveSettings` returns plain values, no `_from`; `GLOBAL_DEFAULTS` has no flow keys), P0.7 (`migrateStorage()` writes a target only when it is absent; `waterOverride` is stored as a number), P0.9 (`nowPrecip` and the River chart ticks follow 9.2), P0.10 (the grep excludes comments), P0.11 (`unitFormat({ system, wind })` with 07 7.7's names; `confidenceText` takes the units) and P0.12 (`dist` calls `visText`). P0.1 text now matches what was built.
- 2026-10-18 10:36 UTC, fix agent (015Sq3rx): the Phase 0 blockers C1 to C8 from `reviews/consistency.md` are applied in 08 section 14.2. Spec changed for P0.2 (WebKit projects only with `WEBKIT=1`; `timing.spec.js` and `smoke.spec.js` pin `Date` with `page.clock.setFixedTime`; the hero mark moves to `render()` in `src/render/index.js`), P0.4 (`setZone('America/New_York')`, no `LOC` import in `src/format.js`), P0.5 (`resolveLocation(PUTNEY_RECORD, { waterway })`), P0.7 (`src/settings.js` own field list, `src/main.js` cache calls, a cache smoke check), P0.9 (`src/state.js` calls `setZone`, `src/render/index.js` passes `app.loc`, plan step drops seconds, `capture.js` takes `effectiveSettings(PUTNEY)`) and P0.10 (the `heading` drop from `app.settings` moves here, `wind.js` line 120). P0.1 is unchanged. 01PLGfvc: pull before P0.2. The fix pass continues with the rest of the findings.
- 2026-10-18 10:36 UTC, P0.1 agent: P0.1 landed and is pushed. Golden outputs for 19 cases: capture code in `7cb6473` and `823758e`, the 19 JSON files and `docs/full-app/phase-0-progress.md` in `29613d4`, which is the P0.1 commit for `git diff 29613d4 HEAD -- test/golden/`. 136 tests and the build pass; nothing under `src/` changed; results identical across three runs and under `TZ=UTC` and `TZ=Asia/Kolkata`; a one character change in a view and a threshold change in `src/logic.js` both fail the golden test. `npm test` now takes about 17 seconds. Deviations from 08 section 14.2 and open items are in the progress file. 01PLGfvc: P0.1 is done, so start at P0.2 and do not redo the capture. Next: P0.2 before screenshots and the timing baseline.
- 2026-10-18 10:25 UTC, session 015Sq3rx: `reviews/people-safety.md` complete: 34 findings (6 blocker, 19 major, 9 minor). Blockers: P1 and P2 block phase 3 (overdue email failures, limits on community locations); P10, P17, P18 and P19 block phase 5 (kiosk rows, guardian links, guardian invite links, unverified clubs with juniors). The fix pass (step 4) records each as applied or skipped in that file.
- 2026-10-18 10:20 UTC, session 01PLGfvc: saw 015Sq3rx's 10:05 line. My review workflows were stopped by the session limit at 06:50 with nothing pushed; I stopped them for good, so 015Sq3rx owns steps 3 to 5 and I will not touch `docs/full-app/0*.md`, `reviews/`, `README.md` or `09-roadmap.md`. I take phase 0 from P0.1 (step 6): golden capture, screenshots, budget and CI, in `test/`, `scripts/`, `playwright.config.js`, `budget.json`, `.github/workflows/ci.yml` and `docs/full-app/phase-0-progress.md`. P0.1 to P0.3 change no app behavior. Before P0.4 I pull and follow whatever the fix pass changed in 08 section 14. 015Sq3rx: when step 5 lands, check `phase-0-progress.md` before starting phase 0 work.
- 2026-10-18 10:05 UTC, session 015Sq3rx: resumed after the usage limit reset. Session 01PLGfvc claimed step 3 at 06:35 but pushed nothing by 10:05, so 015Sq3rx runs steps 3 to 5 now. Each step first checks the branch and keeps any review or doc another session already pushed. 01PLGfvc: if you wake up, pull first and check this log before writing anything.
- 2026-10-18 06:35 UTC, session 01PLGfvc: picked up at step 3. Writing the two reviews in `docs/full-app/reviews/` now, then the fix pass, README and roadmap, then phase 0.
- 2026-10-18 06:19 UTC, architecture agent: `08-architecture.md` landed: system overview, layout by phase, canonical schema as 12 migration files (checked in `node:sqlite` and a local D1), migration plan, bindings and rate limiter ids 1005 to 1030, every API route, storage keys, time zones, security and audit log, budgets rebased on today's build, costs, tests, the phase 0 build sequence (P0.1 to P0.14), and 65 cross-doc conflicts decided with small edits to 01 to 07. Next: step 3, the reviews.
- 2026-10-18 05:15 UTC, session 015Sq3rx: took over from the earlier session (stopped by the owner). Merged `dev` (PR #7) into `dev-full-app`; 109 tests and the build pass. Next: steps 2 to 5 as one workflow (architecture on Opus, two Opus reviews, fix and overview on Sonnet), then Phase 0.

## Prompt to start the next agent

Paste this into a new Claude Code session on `NeverNathaniel/RoWhether`:

> Continue the RoWhether all-rowers work on branch `dev-full-app`. Read `docs/full-app/HANDOFF.md` and `CLAUDE.md` first and follow them. Work out where things stand from the branch, as HANDOFF.md describes, and carry on from the first unfinished step. Work only on `dev-full-app`; never push to `master` or `dev`. Use Sonnet agents for building and an occasional Opus agent for review, no more than 10 agents at a time. Keep HANDOFF.md's log current and push it before you run out of usage, and give me an updated prompt for the next agent when you stop.
