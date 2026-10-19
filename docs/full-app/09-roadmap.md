# Roadmap

This file owns the phase list and the exit criteria. `01` to `07` each proposed pieces of it, and `08` settled the order, the migrations and the budgets. Where a topic document and `08` disagree, this file follows `08` and the two reviews in `reviews/`. The owner's decisions, in the order each phase needs them, are in `README.md`.

How a phase ships, for every phase:

- It is built on `dev-full-app` and merged into `dev`. A migration is applied to the dev database only with the merge into `dev` of the code that needs it (08 5.4).
- A phase that has migrations records a Time Travel bookmark for the production database, then applies them to production before its merge into `master` (08 5.4).
- Merging into `master` changes the live app, so it needs the owner's go-ahead (`CLAUDE.md`).
- Each phase's exit criteria below must hold first. They also include the checks `CLAUDE.md` Testing lists for any UI change.
- The Now screen's budget in `08` 11.2 is checked by `scripts/budget.mjs` in CI from phase 0, and the first hero from cache stays within 20% of the Phase 0 baseline (08 11.3).

## The phases

| Phase | Name | Goal | Migrations | Monthly cost | Owner gate before it ships |
| --- | --- | --- | --- | --- | --- |
| 0 | Foundations | Putney as data, with no visible change | None | $0 | None open. `CLAUDE.md` edits already approved on this branch |
| 1 | Many locations | A curated list of locations at their own addresses, a picker, the app renamed RoWhether, an open counter | None | $0 | Open counter, Access application, app name, candidate list, `CLAUDE.md` phase 1 edits |
| 2 | Accounts | Optional accounts with passkeys and emailed codes, synced settings, favorites, units, and the production database | `0001` on production, `0002` | $5 | Workers Paid, production database, lawyer review (item A), `CLAUDE.md` phase 2 edits |
| 3 | Community | Locations in the database, reports and hazards everywhere, outings and float plans, moderation, and the engine that emails contacts when a rower is overdue | `0003` to `0008` | About $5 to $6 | Lawyer items 1 and 2, map tiles sentence, emergency number table checked. The second route for overdue email is recommended |
| 4 | Notifications | Push and alert rules: the night-before outlook, the overnight change, NWS alerts, hazard alerts and Go windows | None | About $34 to $41 with the Open-Meteo key, $5 to $12 without | Open-Meteo plan, VAPID keys, device checks |
| 5 | Clubs and safety | Clubs, roles, club rules, water status, the board, the kiosk, club overdue escalation, incidents and guardian links | `0009` to `0011` | Add $0 to $8 for email at 100 clubs, with phase 6 | Lawyer items 3 to 8, a pilot club, `CLAUDE.md` phase 5 and 6 edits, then `CLUBS_ENABLED` |
| 6 | Club operations | Boats, damage reports, booking, practices, RSVP, attendance, lineups, calendar feeds and announcements | `0012` | Included above | Two pilots, calendar device checks |
| 7 | Beyond the US | Sources, warnings, air quality scales and units for Canada, the UK and Europe | None | Open-Meteo may need a higher tier, price unverified | Lawyer review for the EU, UK and Canada, feed terms |
| Later | Not planned in detail | Ideas the docs keep for later | None planned | None stated | Each needs its own plan first |

## Phase 0: Foundations

Goal: turn Putney from code into data with no visible change. The app gets zone-aware formatting, source adapters, units plumbing, per-location storage keys and golden tests, so that later phases add locations without touching the call logic again.

Where it is specified: `08-architecture.md` section 14 has the steps P0.1 to P0.14 and how "no visible change" is proven (14.1). Progress is in `phase-0-progress.md`. Both are the source. This section does not repeat them.

What ships, by document: 01 section 8; 02 Phases (phase 0); 07 sections 7.9 and 15 (phase 0 rows); 03 section 18 (the Turnstile action parameter); 04 section 11 (`src/reportlogic.js` may be extracted early).

Depends on: nothing. The golden outputs are captured before any refactor.

Migrations: none.

Owner tasks: none open. The owner approved editing `CLAUDE.md` on this branch so it matches Phase 0 (08 17.2). P0.14 writes those edits.

Ship notes, for the PR #6 description and the merge:

- A rollback of production past phase 0 loses the settings a rower changed since the upgrade, and a roll forward loses the settings changed during the rollback. The move from `putney-rowing-*` runs once and the new build never writes the old keys. A page still on the old build beside one on the new build does the same until it reloads. The cost is entering a limit again. This is accepted (08 8.3 and 17.1, final correctness review FC4).
- Owner decision of 2026-10-19 (final design review FD3): the 48 screenshots are deleted after P0.14 item 3 confirms them, `screens.spec.js` stays with a git-ignored local baseline, the golden JSON stays, and the owner squash-merges PR #6, so `dev` and `master` never hold the images. `dev-full-app` is not deleted (08 17.1 and 14.2 P0.14).

Exit criteria:

1. The final proof in 08 14.2 under P0.14 holds: tests and build pass, the golden JSON diff against the golden base `c7967a6` is empty (08 14.1), the pixel screenshots match (and are then deleted, see the ship notes), the timing is within 20% of the baseline, the budget passes, the `CLAUDE.md` browser checklist passes by hand, and an old installed copy keeps its settings, cache and install choice.
2. The budget row for phase 0 in 08 11.2 holds: main JS 40,500 B, CSS 6,100 B, HTML 3,700 B, precache under 400 KiB.
3. 07 section 13 (phase 0): screenshots match before and after, and the manifest still has `start_url` and `scope` of `./`.
4. Nothing in 08 14.3 has changed: the app name, `index.html`, the manifest, the settings fields, routes, storage behavior beyond key names, the Worker routes, `wrangler.jsonc`, refresh timing and source staleness.

Main risks:

- Eight blockers in the consistency review (C1 to C8) would have broken the build order or the proof. All are fixed in 08 14.2: the heading drop moved to the last change of P0.10, the other callers of `DEFAULTS` and the cache functions are named, `resolveLocation` has one signature, the plan step formula drops seconds, the import cycle in `src/format.js` is removed, CI no longer runs WebKit projects, and the timing baseline has a pinned clock and a mark that every path reaches.
- The golden files cannot see event handlers, the install bar, the suggestion form or dock reports. Browser checks cover those (`phase-0-progress.md`, open item).
- The golden files hold exact `Intl` and V8 output. A Node upgrade that changes either fails every case and should be investigated, not regenerated (`phase-0-progress.md`).
- Pixel comparisons run on the machine that made the baseline until a CI run shows they match there (08 13.5 and 17.3).

## Phase 1: Many locations

Goal: Putney becomes one of a curated list of locations, each at its own address such as `/putney-landing`, with a picker and a switcher in the header, the app renamed RoWhether, and an aggregate open counter. Everything is static files. There is no database.

What ships, by document and section:

- Curated locations: 01 7.1 to 7.4 (JSON files in `data/`, validated by the build, emitted to `dist/`, precached, one shell per location); 08 3.4 and K24.
- The candidate list: 01 7.5.
- Water types and course: 01 section 9 (lakes, reservoirs, tidal rivers, canals, harbors, and which tabs show), section 10 (course geometry and the compass, with bank labels that turn), section 11 (per-location limits and the Settings dialog), section 15 (edge cases, including polar days and half-hour zones).
- Data sources: 02 Phases (phase 1). A local discovery script (08 5.6), US tides, currents and the NWPS tide forecast, marine zones, GloFAS and marine fallbacks, place search, the attribution line, staleness per source, and USGS v1.
- Putney's alerts move to the NWS zones and the footer is corrected: 01 6.1 and 17.
- Product: 07 section 4 (routes, header, tab bar, notes and banners, not found), 5.1 and 5.2 (home, picker, switcher), section 6 (copy), section 9 (offline and caching, ten cached locations), 7.9 (the subtitle's zone name).
- Open counter, short `/privacy` page, and the Metrics tab behind Cloudflare Access: 07 14.3, 14.5 and 5.15; 08 10.9; 03 3.7.
- Safety items from the people and safety review that start here: the hero line "Not checked here: river flow, official alerts." and its stale gauge version (07 6.7; 01 8.4; review P5), and flow limits stored with the binding they were set for (01 11.1; review P7).
- Config and files: 08 6.7 (phase 1) and 3.4.

Depends on: phase 0 complete (the location as data, the adapters, zone formatters, units plumbing, the storage keys and their migration).

Migrations: none (08 5.1 and 5.6). `wrangler.jsonc` gains the single-page-app fallback, the Analytics Engine bindings and the Access variables.

Owner tasks:

- Answer the phase 1 rows in `README.md`.
- Create the Access application and give the `ACCESS_AUD` values for production and Previews.
- Choose the candidate locations and the clubs that confirm dock points (01 7.5).
- Confirm on site Putney's course heading, the Vernon pool limits and the temperature note.
- Choose the contact address for the User-Agent that the discovery script uses.
- Run `scripts/check-sources.mjs` for the curated locations before shipping (02 Tests).
- Approve the `CLAUDE.md` changes for phase 1 (08 17.2).

Exit criteria:

1. Tests: `npm test`, `npm run build` and `npx wrangler deploy --dry-run` pass. The new test files are `route.test.js`, `picker.test.js`, `csp.test.js`, `info.test.js` and `locations-data.test.js`, plus `test/browser/picker.spec.js` (08 13.7). 01 16.1 to 16.4 and the source and discovery tests in 02 Tests apply to what this phase builds.
2. Putney looks as before except for the changes 07 3.2 lists for phase 1: the chevron after the title, the bank labels, the share link, the "Saved" label and the footer credit. The Putney golden tests pass with only those differences (01 16.2). 08 14.1 says how the cases that change are rewritten.
3. An existing install keeps its settings and cache, opens at `/putney-landing` with no note above the hero, and renders the cached hero before any request completes (07 13 phase 1; 01 16.5).
4. The browser checks in 07 13 (phase 1) pass: the first-visit note inside and after the 90-day window; the picker at 360 px with no network request while typing; the switcher's focus; Near me granted, denied and timed out; the header at 360 px for every curated name; a lake with no River tab; a tidal location with a Tide tab after Wind; a Chicago time zone on Putney with every time still Eastern; an unknown slug; `/putney-landing` served from its shell with the old title and no redirect; the offline picker; the share link; the built manifest named RoWhether with id `/`.
5. Budget row for phase 1: main JS 43,200 B, CSS 7,100 B, HTML 3,700 B, precache under 400 KiB (08 11.2). The first hero from cache is within 20% of the baseline. The console is clean on every screen.
6. A lazy chunk's name is checked by `scripts/budget.mjs` on the first build that adds one, and the Workers Free request limit of 100,000 a day is checked against the pricing page (08 17.3).
7. The owner has confirmed the open counter, created the Access application, and approved the `CLAUDE.md` changes.

Main risks:

- Workers Free allows 100,000 requests a day, and each app start makes two Worker requests, so about 50,000 starts a day (08 12.2).
- Links shared today point at `rowhether.com/` and mean Putney. For 90 days `/` still opens Putney with a note (01 7.4).
- Home screen names set at install cannot change, so the rename affects existing installs (01 17).
- A missing or stale source could leave a Go that hides it. Review P5 (major, phase 1): resolved by the hero line above.
- Flow limits are bare numbers that stop meaning anything when a gauge or unit changes. Review P7 (the review tied it to phase 3, and 01 11.1 puts the fix in force from phase 1): resolved by storing each limit with the binding it was set for.
- Two staleness rules for one flow reading (review C26): resolved by `maxAgeH` deciding use and `staleMs` deciding when the hero names the source (08 K9).
- The open counter would have shipped a phase before the privacy page that discloses it (review C43): resolved by a short `/privacy` page in this phase.
- Tidal water cannot be bound by the nearest station, because three test launches sit above a dam or lock. A person answers the tidal question (02 Summary of findings 6).
- Putney's alerts by point resolve to GYX and NHZ011, not ALY and VTZ015 (02). Resolved by binding zones and correcting the footer and `CLAUDE.md`.

## Phase 2: Accounts

Goal: optional accounts with passkeys and emailed codes, settings sync, favorites, limit sets, a units and clock choice, and the production database. The forecast and the verdict still never need an account.

What ships, by document and section:

- 03 sections 3 to 17 and the phase 2 rows of section 18: sign-in, every flow, sessions, codes and rate limits, profile, favorites, settings sync, site roles, the age screen and junior accounts (11.2, 11.3), privacy, the terms and the disclaimer, security, the schema, the API and the account screens.
- 07 5.3 (compare), 5.7 (the account page), 5.13 (the settings dialog), 5.15 (the full `/privacy`, `/terms` and `/about`), section 7 (units, clock and locale), 8.1 and 8.4 (your places, limit sets).
- 08 3.4 (phase 2 files), 3.5 (route tables), 4 (`0002_accounts.sql`), 6.7 (phase 2 config) and 10 (security model).
- The old `putney-rowing-*` keys are deleted (01 8.6 step 7).
- The Turnstile loader widens to every form that needs it (03 6.3; 08 10.8).

Depends on: phase 1 (routes, `/api/info`, the header, Access and the Metrics tab); Workers Paid; the production database; Node 22.13 or later in `package.json` (08 13.4); the legal review for the terms, privacy notice and minors approach.

Migrations: `0001_reports.sql` is applied to production and `0002_accounts.sql` is new. Dock reports stay off on production because `REPORTS_ENABLED` is `"0"` (08 5.1 and 5.4).

Owner tasks:

- Answer the phase 2 rows in `README.md`.
- Move to Workers Paid, create `rowhether`, record the bookmark and apply `0001` and `0002` before the merge.
- Set `AUTH_PEPPER`. Set up Email Service sending from `signin@rowhether.com` with SPF, DKIM and DMARC passing.
- Take item A of the 03 13.5 list to the lawyer.
- Run the device checks in 03 20.4. Check how Preview-only secrets are set and find the dev Preview host name (08 17.3).
- Approve the `CLAUDE.md` changes for phase 2 (08 17.2).

Exit criteria:

1. Tests: `npm test`, `npm run build` and the dry run pass. The new tests are `auth-*.test.js`, `settings-sync.test.js`, `delete.test.js`, `migrations.test.js` and the UK and metric cases in `units.test.js` (08 13.7). CI also runs migrations on Miniflare's D1 and `npm run test:workerd` (08 13.6).
2. 03 section 20 holds: the unit and Worker tests (20.2), including the deletion test that fails when a table references `users` without an `ON DELETE` action; the browser checks (20.3), including that the first hero render does not wait for `/api/me`; and the manual device checks (20.4) on iPhone in Safari and installed, Android Chrome, macOS Safari, Windows Chrome and real code emails in Gmail, iCloud and Outlook.
3. The browser checks in 07 13 (phase 2) pass: the header at 360 px with Sign in and with a name; favorites signed out; compare; limit sets; units for `en-GB` and for an existing install pinned to US; `/privacy` online and offline.
4. Budget row for phase 2: main JS 45,200 B, CSS 7,600 B, HTML 3,900 B, precache under 400 KiB (08 11.2). The first hero stays within 20% of the baseline.
5. The checks in 08 17.3 marked "before phase 2" are done: Preview secrets, the dev host name, `crypto.subtle.timingSafeEqual` in workerd, `node:sqlite` from Node 22.13, and D1's foreign keys and `RETURNING`. The Turnstile action check skips a testing key's answer as 08 10.8 says, with a test on the recorded answer (the testing secret's answer carries no `action`, settled 2026-10-19).
6. The lawyer has answered item A, a Time Travel bookmark is recorded, the migrations are on production, and production has `REPORTS_ENABLED` of `"0"`.

Main risks:

- WebAuthn inside an iOS home screen app is unverified. It is a device test before this phase ships (03 20.4).
- Email deliverability, and the sending quota of a new Email Service account, are unknown. At three code emails each, about 1,000 accounts use the included 3,000 a month (08 12.2).
- Junior accounts (13 to 17) exist from this phase. Review P32 (major): the terms asked for a parent's permission that sign-up never collects. Applied: the terms now say what sign-up does, and the Owner question is with the lawyer (item A).
- Review P25 (major): the list of third parties was incomplete. Review P27 and P34 (minor): the notice and the safety disclaimer needed corrections. All applied.
- Synced `waterOverride` values are strings today and would be refused (review C34). Applied: they become numbers in the phase 0 migration.
- Report checks ignored `REPORTS_ENABLED` once production had a database (review C23). Applied.
- Preview secrets, `AUTH_PEPPER` and the VAPID pair conflict with the `CLAUDE.md` sentence "No secrets are set for Previews". The owner approves a new sentence (08 6.5).

## Phase 3: Community

Goal: locations move into the database and people can add them. Reports work at every location, with hazards, outings and float plans. Moderation exists. The cron tick, the queue and email delivery run, so that emergency contacts are emailed when a rower is overdue even with the app closed.

What ships, by document and section:

- Locations in the database: 01 section 5 (schema), 12 (adding a location), 13 (edits, revisions, verification, archiving, merging; claims are phase 5) and 14 (API); 02 Discovery, Health checks and Worker endpoints; 08 3.4.
- Reports at every location, hazards, outings, float plans with email, the row log and CSV, flags, the text screen, the moderation queue and the tuning export: 04 sections 3 to 8 and 11.
- The engine skeleton: the tick, the daily run, `notify_log`, the queue, email delivery and the overdue steps by email (05 5.1 to 5.8 and 11; 04 6). The health route and heartbeat (05 5.2).
- Junior rules for content and the moderator role: 03 10, 11.3 and 18 (phase 3).
- Product: 07 5.4 (quick look), 5.5 (Info tab, with the Safety section and emergency information from 06 8.7), 5.6 (add a location), 5.10 and 5.11 (report dialog, Start a row, the outing banner), 5.14 (moderation page), 10.4 (the map); 04 6.3 (the status page for contacts at `/o/<token>`).
- Production turns reports on: `REPORTS_ENABLED` becomes `"1"` (08 6.3).
- Config and files: 08 6.7 (phase 3) and 3.4.

Depends on: phase 2 (users, sessions, email, the minors module, the production database, Workers Paid); phase 1's curated files as the seed; the widened Turnstile exception; the lawyer's answers to items 1 and 2.

Migrations (08 5.1): `0003_locations.sql`, `0004_seed_locations.sql`, `0005_reports_locations.sql` (the risky one, 08 5.5), `0006_hazards_flags.sql`, `0007_outings.sql` and `0008_notify.sql`.

Owner tasks:

- Answer the phase 3 rows in `README.md`.
- Take items 1 and 2 of the 03 13.5 list to the lawyer, and ask the email-law question (item 6) early.
- Export the dev `reports` table before applying `0003`. Follow the procedure in 08 5.5 for `0005`.
- Create the queues, set `ALERTS_FROM`, `IP_HASH_KEY` and `NOTIFY_LINK_KEY`, and set `EMAIL_DAILY_LIMIT` when Cloudflare shows the quota.
- Add an outside uptime monitor on `GET /api/health`, and a Resend free account if the second route is accepted (05 13).
- Have a person check each row of the emergency number table against an official source before this phase ships (06 8.7).
- Test on a Preview whether cron triggers and queue consumers run (08 17.3).

Exit criteria:

1. Tests: `npm test`, `npm run build` and the dry run pass. The new files are `reports.test.js` (extended), `hazards.test.js`, `outings.test.js`, `overdue.test.js`, `flags.test.js`, `locations-api.test.js` and `notify-tick.test.js` (08 13.7). 04 section 12 adds `overdue-delivery.test.js`, `contacts.test.js`, `screen.test.js` and `reportlogic.test.js`. 01 16.3 and the engine tests in 05 12 apply, including the heartbeat test.
2. The browser checks pass: 04 section 12 (report dialog by water type, offline queueing, Start a row and I'm back, `/o/<token>` with and without JavaScript and Turnstile) and 07 13 (phase 3: Info tab, map load only on tap, add flow, quick look, outing banner announcements).
3. The `0005` procedure ran: backup, Time Travel bookmark, a count before and after, and every old row present as `legacy-<n>` at Putney (08 5.5). The existing report tests keep passing through the legacy `/api/reports` alias (04 section 12).
4. With `/api/health` at 503, the Start a row sheet and the banner show "Late alerts are delayed right now. Tell someone your plan." (04 section 12).
5. Budget row for phase 3: main JS 48,200 B, CSS 8,100 B, HTML 3,900 B, precache under 400 KiB (08 11.2).
6. The checks in 08 17.3 for this phase are done: Preview cron and queue behavior, MapLibre's need for `blob:`, a render of the map in a real browser, and whether `migrations apply` wraps a file in one transaction (before `0005` on dev).
7. The lawyer has answered items 1 and 2. The emergency number table is checked and a location in an uncovered country is refused (review P13).
8. The owner has approved the map tiles sentence for `CLAUDE.md`, or chosen self-hosting.

Main risks, with the blockers the people and safety review tied to this phase:

- Blocker P1: an overdue email can fail with nobody told, and the rower is told it was sent. Resolved: the "We emailed" line is sent only after the provider accepts each contact's email, a failure names the contact ("We could not email Jordan. Call someone now."), overdue mail goes ahead of the queue with a reserved share of the quota (`EMAIL_DAILY_LIMIT` at 70% for other mail), and a test covers a throwing provider. The second provider and the outside owner alert are a cost choice left to the owner (05 13).
- Blocker P2: whoever adds a location sets the limits every visitor's verdict uses. Resolved: for a location that is not verified, no limit can be looser than the global defaults. After publishing, the creator edits text only, and limits, sources and the course go through suggestions. The hero says when limits differ.
- Review P3: nothing noticed when the every-minute tick stops. Resolved: a heartbeat, `GET /api/health` and an outside monitor.
- Review P8, P9, P11, P12, P16: contacts who opt out or bounce, status links that anyone could use, rows started without signal, an overdue email missing what a caller needs, and a notice missing the limits that matter. All applied (04 sections 5 and 6; new table `outing_contacts`).
- Review P13: emergency numbers typed in by whoever added the location. Resolved: numbers come from a checked country table.
- Review P21, P24, P28, P29: junior rules missing where they act, precise coordinates sent for the "at the dock" check, hazards cleared or hidden by new accounts, and one anonymous tap undoing a closed launch. All applied (the browser sends one word, `near`, `far` or `unknown`).
- `0005` rebuilds a live table. If it fails, restore with Time Travel or re-import the backup (08 5.5).
- Preview cron and queue behavior is unverified, so dev uses `POST /api/admin/tick` (08 6.1).
- A full D1 export stops working once the FTS table exists, so backups rely on Time Travel (08 4.5).
- Whether float plans and overdue alerts create a duty if they fail is a legal question (03 13.5 item 1).
- Moderation load grows with community locations, hazards and reports (04 8).

## Phase 4: Notifications

Goal: Web Push and alert rules, so people hear about the verdict with the app closed: the night-before outlook, an update before first light when it changed, NWS alerts, hazard alerts and Go windows. Server-side forecasts make this possible.

What ships, by document and section:

- 05 sections 2 to 9 and 11: channels, the notification kinds in 3.1 (`night_before`, `morning_change`, `morning_of`, `nws_alert`, `hazard`, `go_window`, and overdue by push), alert rules, quiet hours and caps, Web Push on Workers, the browser side with iOS install guidance, the in-app list, the tables and the API.
- Server-side forecasts with an Open-Meteo key: 02 Open-Meteo, server-side calls.
- 04 section 11 (phase 4): push reminders for outings and hazard notifications. The legacy `/api/reports` alias is removed.
- 07 5.12 (notification settings) and 8.3 (alerts).
- Server-side alert matching by NWS zone, from the `zones:` binding (01 4.4; review C40).
- Config and files: 08 6.2 (`NOTIFY_LIMIT`), 6.7 and 3.4. `src/text.js` moves the period sentences to a pure module.

Depends on: phase 3 (the tick, the queue, `notify_log`, email delivery) and phase 2 (alerts need an account); the Open-Meteo key; the VAPID keys.

Migrations: none. The tables `push_subscriptions`, `notify_prefs` and `notify_log` come from `0008` (08 5.1).

Owner tasks:

- Answer the phase 4 rows in `README.md`, including the Open-Meteo plan.
- Create the VAPID key pairs for production and Previews (`scripts/vapid-keys.mjs`) and set `VAPID_SUBJECT` and `OPEN_METEO_KEY` (08 6.5).
- Run the manual device checklist in 05 section 12.

Exit criteria:

1. Tests: `npm test`, `npm run build` and the dry run pass. The new files are `push.test.js`, `notify-schedule.test.js`, `notify-alerts.test.js` and `test/browser/push.spec.js` (08 13.7), with the copy, engine, delivery and service worker tests in 05 section 12.
2. The Workers runtime check in 05 section 12 passes: a Putney model built in workerd from fixtures equals the Node result. `scripts/bench-model.mjs` stays under the design's 20 ms per model. Above 50 ms, the tick handles fewer preferences per run.
3. The manual device checklist in 05 section 12 passes: iPhone from the Home Screen (iOS 16.4 or later, and 18.4 or later for the declarative path), iPad, Android Chrome, desktop Chrome and Firefox, and Safari on macOS. For each: subscribe, test notification, tap opens the right view, the overnight update replaces the night-before, unsubscribe.
4. The browser checks in 05 section 12 and 07 13 (phase 4) pass.
5. Budget row for phase 4: main JS 49,200 B, CSS 8,100 B, HTML 3,900 B, precache under 400 KiB (08 11.2).
6. After a month in use, `notify_log` skip reasons and opens are read to check the change rules and caps, which are first guesses (05 13).

Main risks:

- Server-side calls to the free Open-Meteo API from Worker addresses got `429` in testing, because the egress addresses are shared (02). The recommendation is to buy the key. Without it, evening outlooks risk errors.
- Review P4 (major): evening and morning messages built without river flow said nothing about it. Review P6 (major): Stay off warnings waited out quiet hours that overlap dawn. Review P15 (minor): evening messages stated Go as fact. All applied: a failed source adds a sentence and a Go built without it is retitled, a Stay off level alert is never held, and every forecast message says "looks like" and ends "Check again before you launch."
- Review C40: server-side alert matching needed zone codes that no binding carried. Applied.
- On iPhone, push works only from the installed app. Whether WebKit accepts the extra member in a declarative payload is unverified (05 13).
- Cost is the largest in this phase, about $34 to $41 a month, and email passes the included 3,000 a month at about 10,000 users with alerts (08 12.2).

## Phase 5: Clubs and safety

Goal: clubs get their own safety rules applied to each member's verdict, a water status, a board of boats on the water with overdue escalation to safety officers, a boathouse kiosk, emergency information, incidents, and safeguarding for juniors. Nothing changes for people who are not in a club.

What ships, by document and section (06 23.2 steps 5a to 5f):

- 5a: clubs, verification and moderator review, the public page, club locations, memberships, invites, join requests, juniors and guardians, groups, roles, clearances, deletion and the full export (06 sections 3, 4, 5, 16).
- 5b: club rules, the hero lines, Rowing as, Which crews can go and the USRowing templates (06 section 6).
- 5c: water status, the dock reading, the public line and the refresh path (06 section 7 and 21.6).
- 5d: the board, crew starts, the against-rules warning, the kiosk, the club overdue chain and emergency info (06 section 8).
- 5e: incidents, the USRowing panel and shared safety notes (06 section 9).
- 5f: the other phase 5 notices, the notification switches and retention (06 16.3 and 21).
- Guardian links: 03 11.5 and 16.7. Club claims and the club rule overlay: 01 13.4 and 11.7.
- The phase 5 rows of 04 section 11 (club badge and weight on reports, club outings, crew links to members, escalation to club safety contacts, official hazards) and 05 section 11 (club water status alerts and the club safety step of overdue).
- Screens: 07 5.8, 5.9 and 11.1 to 11.3. Config and files: 08 6.7, 3.4 and 5.1.

Depends on (06 23.1): accounts, sessions, `audit_log`, `sendEmail()` and the minors module from phase 2; outings created with the club columns, and `locations` without `steward_club_id`, from phase 3; the tick, the queue, Web Push and the notification tables with the `club` kinds from phases 3 and 4. Guardian links migrate after `clubs`. A verified pilot club with a safety officer.

Migrations (08 5.1): `0009_clubs.sql`, `0010_club_links.sql` (`locations.steward_club_id`, `reports.club_id`, `hazards.club_id`) and `0011_guardians.sql`.

Owner tasks:

- Answer the phase 5 rows in `README.md`.
- Take items 3 to 8 of the 03 13.5 list to the lawyer, including the incident retention period.
- Find the pilot club and its safety officer. Review the first 10 verification requests, each within 3 days.
- Confirm the national reporting lines for the "Get help" page, and collect Putney's emergency information on site.
- Run the device and pilot checks in 06 24.7. Approve the `CLAUDE.md` changes for phases 5 and 6.
- After the exit criteria hold, give the go-ahead to merge into `master` and set `CLUBS_ENABLED` to `"1"`.

Exit criteria (06 23.2, merged with 08 and 03):

1. Tests. `npm test`, `npm run build` and `npx wrangler deploy --dry-run` pass. The permission matrix test covers every phase 5 row of 06 5.3. Every safety case in 06 24.5 passes: closed water never shows Go to members, overdue escalation reaches the safety officer, a row against club rules is recorded and never blocked, and juniors send no free text to adults. The minors tests in 03 20.2 pass. The Putney golden test passes unchanged.
2. The Now screen. The entry chunk grows by at most 4 KB gzipped, which is the phase 5 budget row: main JS 53,200 B, CSS 8,600 B, HTML 3,900 B (08 11.2). The first render never waits for club data.
3. Putney without a club looks and behaves as before: the golden test, and screenshots at 390 and 1280 px that match the phase 4 build.
4. Pilot. One verified club uses water status and the board on dev for 4 weeks covering at least 20 practices, with its paper logbook kept. The board and the logbook agree on every boat out, or each difference has a written cause.
5. Drills. The three overdue drills in 06 24.7 reach every safety officer within 2 minutes of each stage's planned time, on at least one iPhone Home Screen app and one Android phone.
6. Safeguarding. The owner and the pilot club's safe sport or welfare contact walk through 06 5.2 and 03 11.4 on dev and sign off. The legal review (03 13.5) covers junior accounts, guardian links and incident retention.
7. Moderation. The first 10 verification requests are each reviewed within 3 days, with the checklist in 06 3.3.
8. Production. The production database has the phase 5 migrations applied, `CLAUDE.md` is updated with the owner's approval, and the owner gives the go-ahead to merge `dev` into `master` and to set `CLUBS_ENABLED` to `"1"`.
9. The browser checks in 06 24.6 and 07 13 (phase 5) pass, and a week of the kiosk on a boathouse tablet shows pairing surviving restarts and a current board (06 24.7).

Main risks, with the blockers the people and safety review tied to this phase:

- Blocker P10: the kiosk could set off another member's float plan and mark their boat back. Resolved: a kiosk row never arms a float plan and has no member behind it, a confirm step shows name, boat, start and back-by, the picked member is told at once with "Not you? Undo", and the kiosk marks back only rows started there.
- Blocker P17: any adult a junior is talked into linking got lasting sight of where the junior rows, and the junior could not end it. Resolved: a junior can end a link and give a reason that reaches site admins and the club's safety officer. Guardians see club outings through the club, and personal rows only when the junior shares one. A guardian's account must be 7 days old.
- Blocker P18: a club guardian invite could be a reusable link. Resolved: a guardian preset exists only on personal invites, single use, to one email, valid 7 days, made by an admin or safety officer, enforced in the Worker and by a `CHECK`. A new guardian waits for an admin to confirm.
- Blocker P19: an unverified club could enrol juniors, and one person with two accounts could count as "another adult". Resolved: juniors join only verified clubs. Only a confirmed guardian, or staff of a verified club who are not the sender, have held the role 7 days and have a 30 day old account, count as another adult.
- Review P20, P22, P23 (who sees a junior's outings and emergency contacts, the guardian phone sharing default, the kiosk showing juniors' names) and P26 (three retention answers for incidents with health details of minors): applied. The retention period of 7 years is the lawyer's to set.
- Review C49: club rules and personal limits were merged in opposite orders in 05 and 06. Applied: 05's engine now uses 06's `clubSettings()`, where a stricter personal value wins over the club value.
- Pilot adoption and timing are unknown. The 2 minute delivery target, the escalation steps and the 3 day review target are first guesses (06 25.2).
- Screen Wake Lock on the kiosk is unverified for an iOS Home Screen app and for older tablets (06 25.2).
- D1 behavior of the booking insert and the partial indexes was checked only in local SQLite (06 25.2).

## Phase 6: Club operations

Goal: clubs run their operations in the app: boats and damage reports, booking, practices with RSVP and attendance, lineups, calendar feeds and announcements. Announcements are broadcast only.

What ships, by document and section (06 23.3):

- 6a: boats, damage reports, out of service, launch and shell checks (06 section 10).
- 6b: practices and series, outlook lines, the evening check, cancel and land, RSVP, attendance and its report (06 section 12 and 21.7).
- 6c: lineups and Start these boats (06 section 13).
- 6d: booking, availability, bumping and Book a boat from Plan a row (06 section 11).
- 6e: calendar feeds, announcements, CSV exports and use reports, learn-to-row listings (06 sections 14, 15 and 16.2).
- 05 section 11 (phase 6: practice change alerts, practices in the night-before). `outings.boat_id` is used from this phase (04 section 11). Config and files: 08 6.7, 3.4 and 5.1.

Depends on: phase 5 (clubs, memberships, outings, the board) and the notification engine from phases 3 and 4.

Migrations (08 5.1): `0012_club_ops.sql`.

Owner tasks:

- Answer the phase 6 rows in `README.md`.
- Run a practices pilot with a junior program for 4 weeks and a booking pilot with a masters group for 4 weeks.
- Subscribe the calendar feed in Apple Calendar, Google Calendar and Outlook (06 24.7).

Exit criteria (06 23.3):

1. Tests. The phase 6 rows of the permission matrix; booking concurrency; practice series across 2026-11-01 and 2027-03-14; the iCal golden file; the evening check sent once per practice under overlapping ticks.
2. Practices pilot. A junior program runs 4 weeks of practices with the evening check, RSVPs and published lineups. Coaches get the check within 2 minutes of `decideAt` on every evening before a morning practice, and guardians get lineup and cancellation notices.
3. Booking pilot. A masters group books for 4 weeks with no double booking and no boat shown as free that was not.
4. Calendars. The device checks in 06 24.7 pass: a cancelled practice shows as cancelled after the app refreshes, and times are right across November 1.
5. The Now screen is unchanged apart from the Plan a row button, and every phase 6 screen loads lazily. Budget row for phases 6 and 7: main JS 54,200 B, CSS 9,100 B, HTML 3,900 B (08 11.2).
6. Retention and export cover the phase 6 tables (06 16.2 and 16.3), and 03's account export and deletion include RSVPs, attendance and seats.

Main risks:

- Booking depends on one-statement inserts and partial indexes checked only in local SQLite. Confirm them on the dev database before shipping (06 25.2).
- Calendar clients refresh at intervals the docs have not verified (06 25.2).
- Practice series cross two daylight saving changes, 2026-11-01 and 2027-03-14 (06 23.3).
- Queue operations approach 1 million a month at 100 active clubs, and email adds $0 to $8 at that size (08 12.2).
- Whether afternoon practices need a midday check is open (06 25.2).

## Phase 7: Beyond the US

Goal: locations in Canada, the UK and Europe get local sources, warnings, air quality scales, units and metric defaults. The Worker proxies the warning feeds that have no CORS.

What ships, by document and section:

- Sources: 02 Phases (phase 7) and the cards for ECCC, CHS, the UK Environment Agency, Met Office, MeteoAlarm, Hub'Eau and PEGELONLINE; `src/sources/eccc.js`, `chs.js`, `ea.js`, `hubeau.js`, `pegel.js`, `worker-proxied.js` and `worker/sourceproxy.js` (08 3.4); `SOURCE_LIMIT` (08 6.2).
- Alerts outside the US from the Worker adapters, matched by polygon or region, with copy in the location's units (05 section 11).
- Air quality scale by location and non-US locations (07 7.9; 01 8.1 rows 9 and 19).
- Privacy and terms for GDPR, UK GDPR and PIPEDA, and the UK "Club Welfare Officer" label (03 section 18, phase 7).

Depends on: the adapter pattern from phase 0 and 1; the units and clock choice from phase 2; server-side alerts from phase 4; the legal review.

Migrations: none (08 5.1).

Owner tasks:

- Answer the phase 7 rows in `README.md`.
- Take the review for the EU, UK and Canada to the lawyer (03 13.5).
- Read the terms and licences for MeteoAlarm, the Met Office feed, UKHO tide access, Hub'Eau and PEGELONLINE (02).
- Confirm UK and Nordic unit defaults with clubs (07 17). Write to BoM about terms before building anything for Australia (02).
- Choose an Open-Meteo plan for the number of locations.

Exit criteria: `01` to `08` do not write phase 7 exit criteria. What they require before it ships:

1. Tests. Adapter fixture tests per country (08 13.7). The same rules as every phase: `npm test`, `npm run build` and the dry run pass.
2. Budget row for phases 6 and 7: main JS 54,200 B, CSS 9,100 B, HTML 3,900 B (08 11.2).
3. The lawyer review for the EU, UK and Canada is done (03 13.5).
4. The feed terms and licences for the new sources are read and recorded (02 Open questions).
5. UK and Nordic unit conventions are confirmed with clubs (07 17).
6. The source check, `scripts/check-sources.mjs`, is run for the new adapters (02 Tests).

Main risks:

- Open-Meteo may need a higher tier at about 200 active locations. The estimate is in 02 and the price is unverified (08 12.2).
- The Australian Bureau of Meteorology blocks automated access, so Australian locations get the global baseline only (02).
- MeteoAlarm and Met Office terms, UKHO tide access and the Hub'Eau and PEGELONLINE licences are unread (02).
- Whether an EU or UK representative is needed is a legal question (03 21).
- Alert text from ECCC and MeteoAlarm must be shown without changes to content or intent (02 Attribution).

## Later

Ideas the docs keep for later. Each needs its own plan before work starts.

- Reports: hazard photos, import and export with Concept2 Logbook, Strava and Garmin Connect, reporter reputation and a heat map of reports (04 section 11 and 7).
- Clubs: traffic pattern diagrams on a map, one status for a whole shared waterway, a regatta calendar, damage report photos, SMS escalation, a launch-to-shell ratio check, guest rows for visiting rowers, erg workouts on Stay off days and equipment maintenance schedules (06 23.4).
- Translations, with plain JavaScript message modules (07 7.8), and translated notification copy (05 section 11).
- If RoWhether ever charges money: Open-Meteo moves behind the Worker with a key and per-location caching, which changes the `CLAUDE.md` hard constraint for Open-Meteo only (02), and the lawyer checks whether Vermont's Act 63 applies (03 13.5 item 9).
- "High for October" context from the USGS statistics API (02 Default flow thresholds).
- SMS to emergency contacts, if 05 revisits the no-SMS decision (05 2.3).
- The `CLAUDE.md` Later list: the night-before alert is phase 4 here, and the dock reports' production database is phase 2, with reports on production from phase 3. Using reports to tune the fog and water state thresholds starts in phase 3 with the tuning export (04 3.7).

## Where the topic documents and `08` disagree

None of the disagreements found while writing this file is still open. They were resolved on 2026-10-18:

- `engines.node`: `03` section 18 now says `>=22.13`, as `08` 13.4 does.
- The second route for overdue email: `08` 6.5 now lists `RESEND_API_KEY` for `05` section 13's second route in phase 3, or for Resend replacing Email Service in phase 2.
- `08` 17.2 now lists the lawyer items of `03` 13.5 by phase, the second email route with the outside uptime monitor, and the Photon search box, and points to `README.md` for the full list.
- `06` 23.2 item 8 now says the production database, created in phase 2 (`08` 5.4), has the phase 5 migrations applied.

Still open: `01` to `07` do not write exit criteria for phase 7. The phase 7 section above lists only the prerequisites the documents name.
