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

- 2026-10-18 06:35 UTC, session 01PLGfvc: picked up at step 3. Writing the two reviews in `docs/full-app/reviews/` now, then the fix pass, README and roadmap, then phase 0.
- 2026-10-18 06:19 UTC, architecture agent: `08-architecture.md` landed: system overview, layout by phase, canonical schema as 12 migration files (checked in `node:sqlite` and a local D1), migration plan, bindings and rate limiter ids 1005 to 1030, every API route, storage keys, time zones, security and audit log, budgets rebased on today's build, costs, tests, the phase 0 build sequence (P0.1 to P0.14), and 65 cross-doc conflicts decided with small edits to 01 to 07. Next: step 3, the reviews.
- 2026-10-18 05:15 UTC, session 015Sq3rx: took over from the earlier session (stopped by the owner). Merged `dev` (PR #7) into `dev-full-app`; 109 tests and the build pass. Next: steps 2 to 5 as one workflow (architecture on Opus, two Opus reviews, fix and overview on Sonnet), then Phase 0.

## Prompt to start the next agent

Paste this into a new Claude Code session on `NeverNathaniel/RoWhether`:

> Continue the RoWhether all-rowers work on branch `dev-full-app`. Read `docs/full-app/HANDOFF.md` and `CLAUDE.md` first and follow them. Work out where things stand from the branch, as HANDOFF.md describes, and carry on from the first unfinished step. Work only on `dev-full-app`; never push to `master` or `dev`. Use Sonnet agents for building and an occasional Opus agent for review, no more than 10 agents at a time. Keep HANDOFF.md's log current and push it before you run out of usage, and give me an updated prompt for the next agent when you stop.
