# Architecture

Documents 01 to 07 plan the parts of RoWhether for all rowers: locations, data sources, accounts and privacy, reports and check-ins, notifications, clubs, and product and UX. Each of them proposed tables, routes, bindings and storage keys, and left the cross-cutting choices to this document. This document makes those choices in one place:

- How the system fits together: the browser app, the Worker, D1, the cron tick and the queue, Web Push and the outside data sources.
- The repository layout at the end of each phase.
- The canonical D1 schema, as migration files ready to copy, and the order they ship in.
- Bindings, variables, secrets and feature flags per environment, with the target `wrangler.jsonc` for each phase.
- Every API route in one table, and the conventions they share.
- The canonical browser storage keys and the migration from `putney-rowing-*`.
- Time zone and daylight saving rules, the security model, performance budgets, costs and the test plan.
- Every contradiction found between 01 to 07, the decision on each, and the edit made to the other document so they agree.
- The commit by commit build sequence for phase 0.

Where this document and 01 to 07 disagree, this document wins, and section 15 lists the edit that brought the other document in line. Proposals in 01 to 07 that this document does not change stand as written.

Facts are marked "verified live 2026-10-18" (checked in this session by running a command, a build, a test or a local database, and the check is named), "verified live 2026-10-17" (carried from 01 to 07, which name the check), "from docs (URL)", or "unverified". Code facts name the file they were read from on 2026-10-18, at commit `20e4255` of `dev-full-app`.

## Contents

1. Terms, phases and conventions
2. System overview
3. Repository and module layout
4. Canonical D1 schema
5. Migration plan
6. Bindings, config and environments
7. API
8. Client storage and the service worker
9. Time zones and daylight saving
10. Security model
11. Performance and offline
12. Costs
13. Testing strategy
14. Phase 0 build sequence
15. Conflicts between the documents, and the edits made
16. What 08 settles
17. Open questions and decisions

## 1. Terms, phases and conventions

### 1.1 Phases

09-roadmap.md will own the phase list and exit criteria. This document uses the phases 01 to 07 already share:

| Phase | Name | What it adds, in one line |
| --- | --- | --- |
| 0 | Foundations | Putney as data, zone-aware formatting, source adapters, units plumbing, golden tests. No visible change. |
| 1 | Many locations | Curated locations as static files, path routes, the picker, the header switcher, the app renamed RoWhether, the open counter. |
| 2 | Accounts | Passkeys and email codes, sessions, settings sync, favorites, limit sets, units choice, a production D1 database. |
| 3 | Community | Locations in D1, the add flow, reports at every location, hazards, outings and float plans, moderation, the notification engine skeleton (email). |
| 4 | Notifications | Web Push, alert rules, the night-before outlook and the overnight change, NWS alerts, hazard alerts, Go windows. |
| 5 | Clubs and safety | Clubs, memberships, roles, club rules, water status, the board, the kiosk, club overdue escalation, incidents, guardian links. |
| 6 | Club operations | Boats, damage, booking, practices, RSVP, attendance, lineups, calendar feeds, announcements. |
| 7 | Beyond the US | Canadian, UK and European sources, Worker-proxied warnings, regional air quality scales, metric defaults. |

### 1.2 Conventions every part follows

| Topic | Rule | From |
| --- | --- | --- |
| Ids | `crypto.randomUUID()` as TEXT for rows people make; slugs for locations, clubs and waterways in URLs | 01, 03, 04, 06 |
| Times | INTEGER milliseconds since the epoch in D1 and JSON. Local dates as `YYYY-MM-DD` strings in the place's zone | `migrations/0001_reports.sql`, all docs |
| JSON names | camelCase in JSON, snake_case in D1, converted in one `shape` or `toApi` function per area | `worker/reports.js` `shape()` |
| Units | Internal weather units stay mph, °F and inches. Flow, stage and tide stay in the source's unit. Display converts | 01 11.1, 02, 07 7.3 |
| Errors | `{ "error": "code", "message": "Human sentence." }` plus fields such as `field` | `worker/reports.js` |
| Copy | Sentence case, short sentences, no em or en dashes, no emojis, the verdict is Go, Caution or Stay off | CLAUDE.md |
| Storage | Every `localStorage` access in try/catch, and every screen works when storage is blocked | CLAUDE.md |
| Dependencies | Exact versions in `package.json`, no runtime loads from third-party CDNs except the Turnstile script | CLAUDE.md |
| Shared code | Modules imported by both the app and the Worker are pure: no DOM, no `app` state, no storage | 01, 02, 05, 06 |

## 2. System overview

### 2.1 The parts

```
 Phone or desktop browser                         Cloudflare
 +-----------------------------+                  +-------------------------------------------+
 | Static app shell (dist/)    |  GET /*          | Worker "rowhether"                        |
 |  index.html, JS, CSS, font  | <--------------- |  static assets (no Worker run)            |
 |  service worker: precache   |                  |  run_worker_first: /api/*                 |
 |  shell only, never /api     |  /api/* JSON     |  fetch(): routes, sessions, rate limits   |
 | buildModel() in the browser | <--------------> |  scheduled(): tick each minute, daily run |
 | localStorage: settings,     |                  |  queue(): deliver push and email          |
 |  last good data, outbox     |                  |      |            |            |           |
 +-----------------------------+                  |      v            v            v           |
        |  keyless CORS fetches                   |  D1 "DB"     Queue          Analytics      |
        v  (forecast, gauges, alerts)             |  (one per    "rowhether-    Engine         |
 Open-Meteo, NWS, USGS, NWPS, CO-OPS,             |   env)        notify"       (open counts)  |
 ECCC, EA, Hub'Eau, PEGELONLINE                   +-------------------------------------------+
                                                      |  keyed or no-CORS calls from the Worker
                                                      v
                       Turnstile, Claude, GitHub, Email Service, push services (Apple, FCM,
                       Mozilla), Open-Meteo with a key (phase 4), METAR and warning feeds (phase 7)
```

### 2.2 What runs where

| Work | Where | Phase | Why |
| --- | --- | --- | --- |
| Drawing every screen, building the model (`src/logic.js`), the verdict | Browser | today | The app must work offline from the last good data, and build to static files any host can serve (CLAUDE.md hard constraints). |
| Fetching forecast, alerts, gauges, tides, air quality from keyless sources with `Access-Control-Allow-Origin: *` | Browser | today, more sources in 1 and 7 | Hard constraint. Free-tier limits apply per viewer, not to the site. No Worker cost or load (02 principles). |
| Settings, cache of the last good data, Plan a row, install state, the outbox | Browser `localStorage` | today | Works signed out and offline. Synced only for signed-in users from phase 2. |
| Map tiles from OpenFreeMap | Browser, lazy | 3 | Data, not the app shell. The library is bundled; tiles are fetched like forecasts (02 and 07 Decisions). |
| Turnstile widget script | Browser, lazy | today | The one CDN exception in CLAUDE.md, widened to the sign-in and report forms (section 10.8). |
| Turnstile verification, Claude rewrites and screens, GitHub issues | Worker | today, 3 | Secrets. |
| Accounts, sessions, settings sync, favorites | Worker and D1 | 2 | Shared state behind a session. |
| Locations, waterways, bindings, revisions | Static files in phases 1 and 2, then Worker and D1 | 1, 3 | Curated by pull request first, community edits from phase 3 (01 7.1). |
| Discovery of gauges, stations and zones for a new location | A local script in phase 1, then the Worker | 1, 3 | 15 to 25 dependent calls; the result is stored and shared. Nominatim and NWS ask for one well-behaved client (02 Discovery). |
| Reports, hazards, outings, float plans, moderation | Worker and D1 | 3 | Shared state, abuse controls, server time. |
| The every-minute tick (overdue steps, due alerts), the daily run (cleanup, retention, health checks) | Worker `scheduled()` | 3 | Must run with the app closed. |
| Sending push and email | Worker `queue()` consumer | 3 (email), 4 (push) | Retries, dead letters and fan-out without holding the tick (05 5.6). |
| Server-side forecasts for notifications | Worker, Open-Meteo with a key | 4 | Worker egress shares addresses, so the free API answers 429 from there (02, verified live 2026-10-17). |
| Warning feeds and METAR without CORS | Worker proxy routes with edge caching | 7 | No CORS, so the browser cannot call them (02). |
| Counting app opens per location | Worker, Analytics Engine | 1 | Aggregate only, no identifiers (07 14.3, Decision in 10.9). |

The Worker never proxies a keyless CORS source that the browser can call, and never holds forecast data for the app. The one planned exception is 02's commercial case: if RoWhether ever charges money, Open-Meteo moves behind the Worker with a key (02 Decision), and CLAUDE.md's hard constraint changes for Open-Meteo only.

### 2.3 One request, one tick, one job

- A page load: Workers static assets answer every path except `/api/*` without running the Worker (`run_worker_first` in `wrangler.jsonc`; "Requests to static assets are free and unlimited", from docs, https://developers.cloudflare.com/workers/platform/pricing/). From phase 1, `assets.not_found_handling: "single-page-application"` serves `index.html` for unknown paths such as `/lake-quinsigamond` (01 7.3).
- An API request: `worker/index.js` checks the method and, for writes, the `Origin` and content type (10.2), finds the area router by path prefix, loads the session only if the route needs one, applies the route's rate limit binding, then runs the handler with `{ session, now }`. Errors become JSON. Nothing personal is logged.
- A tick: the `* * * * *` cron calls `tick(env, now)` (05 5.2): overdue steps (04, 06), due alert rules (05), the club chain (06), and NWS alerts every 5 minutes. Each step writes its `notify_log` rows and advances its due column in one `env.DB.batch()`, then enqueues jobs only for rows it actually inserted.
- A job: the queue consumer sends push to each subscription, then email when the job says so, updates `notify_log`, and acks or retries (05 5.6, 5.7).
- The daily run: the `17 9 * * *` cron does retention and cleanup for every area (03 5.8, 04 8.9, 05, 06 16.3), source health checks (02, 01 15.7), club deletions and age-ups (06 21.7), and the owner's moderation digest (04 8.7).

## 3. Repository and module layout

### 3.1 Rules

- `src/` is the browser app. Files that the Worker also imports are pure and listed in 3.3. `src/location.js` may import `src/format.js`; `src/format.js` imports only `src/config.js`, never the reverse.
- `worker/` is Worker code only. It may import pure `src/` modules; the app never imports `worker/`.
- `data/` holds curated location and waterway records (JSON). The build validates them (phase 1); a script turns them into a seed migration (phase 3).
- `migrations/` holds D1 schema files, numbered and never edited after they reach any database (5.4).
- `scripts/` holds Node scripts run by hand or by CI. None is imported by the app.
- `test/` holds Vitest tests. `test/browser/` holds Playwright specs, which Vitest must not collect (13.3).
- Lazy screens live in their own folders (`src/add/`, `src/club/`, `src/admin/`) or files (`src/picker.js`, `src/map.js`, `src/auth.js`, `src/account.js`) and are loaded with `import()` only.

### 3.2 Responsibilities that move

| Responsibility | Today (file, read 2026-10-18) | Moves to | Phase |
| --- | --- | --- | --- |
| Dock point, zone, gauges (`LOC`, `GAUGE_FLOW`, `GAUGE_TEMP`, `NWS_GAUGE`) | `src/config.js` | `data/locations/putney-landing.json`, `data/waterways/connecticut-river-vernon-pool.json` | 0 |
| URL builders (`SRC`) and failure names (`SOURCE_NAMES`) | `src/config.js` | `src/sources/*.js` adapters and labels | 0 |
| Parsers (`parseAlerts` and the rest) | `src/data.js` | `src/sources/*.js`; `src/data.js` re-exports them until phase 1 | 0 |
| Default limits (`DEFAULTS`) | `src/config.js` | `GLOBAL_DEFAULTS` in `src/config.js` plus each location's `thresholds`; heading into `course` | 0 |
| Crosswind weight and wind-against-current steps (`WATER.cross`, `WATER.against`) | `src/config.js` | The location's `water` and `flow` | 0 |
| Formatters fixed to `America/New_York` | `src/format.js` | `zoneFormat(tz)` and `setZone(tz)` in `src/format.js` | 0 |
| `clockMin` (UTC minutes) | `src/render/detail/week.js`, `light.js` | `localMinutes` in `src/format.js` | 0 |
| Storage keys `putney-rowing-*` | `src/config.js`, `src/storage.js` | `KEYS` in `src/config.js` (`rowhether-*`), `migrateStorage()` | 0 |
| Settings merge (`{ ...DEFAULTS, ...saved }`) | `src/storage.js` `loadSettings` | `effectiveSettings()` in `src/location.js`; storage keeps overrides only | 0 |
| Unit words in reasons and facts ("mph", "°F", "mi", "cfs") | `src/logic.js`, `src/format.js` `visText`, `src/render/` | `src/units.js`, reached as `m.u` | 0 |
| Header and subtitle | static in `index.html`; `renderHeader()` in `src/render/hero.js` | `src/render/header.js` | 1 |
| Hash routes | `src/route.js` | path plus hash routes in `src/route.js` | 1 |
| `/api/info` and the Dev label | `src/reports.js` `loadInfo` | `src/info.js` | 1 |
| Turnstile loader | `src/suggest.js` | `src/turnstile.js` | 2 |
| `json()` response helpers, copied twice | `worker/reports.js`, `worker/suggest.js` | `worker/http.js` | 2 |
| Route if-chain | `worker/index.js` | prefix dispatch in `worker/index.js`, tables in `worker/router.js` | 2 |
| Report choices (`CHOICES`, `WATER_NAME`, `FOG_NAME`) | `worker/reports.js`, `src/reports.js` | `src/reportlogic.js` (`REPORT_FIELDS`) | 3 |
| Period text helpers (`periodCall`, `periodSummary`, `periodTime`, `dayLabel`) | `src/render/days.js` | `src/text.js`, re-exported by `days.js` | 4 |

### 3.3 Shared pure modules

| Module | Phase | Imported by | Holds |
| --- | --- | --- | --- |
| `src/logic.js` | today | app, Worker (4) | The model and every rule |
| `src/format.js` | today | app, Worker (3) | Zone formatters, text helpers |
| `src/location.js` | 0 | app, build (1), Worker (3), scripts | Validation, slugs, `resolveSources`, `resolveLocation`, `courseSegments`, `effectiveSettings`, `flowDefaults` |
| `src/sources/*.js` | 0 | app, Worker (3), scripts | Adapters: URLs, parsers, labels, discovery hooks |
| `src/units.js` | 0 | app, Worker (4) | Display units (US only until phase 2) |
| `src/settings-keys.js` | 2 | app, Worker | The allowed synced settings keys (03 9.2, 7.3 here) |
| `src/reportlogic.js` | 3 | app, Worker | `REPORT_FIELDS`, `cleanReport`, `summarize` |
| `src/text.js` | 4 | app, Worker | Period and day sentences for screens and notifications |
| `src/clubrules.js`, `src/clubtext.js` | 5 | app, Worker | Club rule merging and club sentences |
| `src/schedule.js` | 4 (`zonedTime`), 6 (the rest) | app, Worker | Wall-time conversion (9.3) and recurrence |

### 3.4 Layout by phase

New files and folders, by the phase in which they first appear. Owners are the documents that specify their content.

| Path | Phase | Owner | Holds |
| --- | --- | --- | --- |
| `data/locations/putney-landing.json`, `data/waterways/connecticut-river-vernon-pool.json` | 0 | 01 6.2, 6.3 | Putney as data |
| `src/location.js`, `src/putney.js` | 0 | 01 7.2, 14 here | Location logic (3.3); Putney's resolved record for phase 0, replaced by loading from `data/` in phase 1 |
| `src/sources/index.js`, `openmeteo.js`, `nws.js`, `usgs.js`, `nwps.js` | 0 | 02 | The nine current adapters, `bindingsFor(loc)`, `labelFor()`, `SLOT_ORDER` |
| `src/units.js` | 0 | 07 7.7 | `unitFormat()`, US only |
| `scripts/golden.mjs`, `test/golden.test.js`, `test/golden/*.json`, `test/fixtures/golden.js`, `test/helpers/fakedom.js` | 0 | 01 8.7, 14 here | Golden outputs and their check |
| `scripts/budget.mjs`, `budget.json` | 0 | 07 10.6, 11 here | Bundle and precache budget check |
| `playwright.config.js`, `test/browser/fixtures.js`, `test/browser/screens.spec.js`, `test/browser/smoke.spec.js`, `test/browser/timing.spec.js` | 0 | 14 here | Before and after screenshots, browser smoke checks, the first-render timing |
| `test/location.test.js`, `test/format.test.js`, `test/storage.test.js`, `test/sources.test.js`, `test/units.test.js` | 0 | 01 16, 02 Tests, 07 7.7 | Unit tests |
| `docs/full-app/phase-0-progress.md` | 0 | HANDOFF | Step log for phase 0 |
| `scripts/locations/flowstats.mjs`, `bearing.mjs`, `discover.mjs` | 1 | 01 7.2, 02, 5.6 here | Curation tools; `discover.mjs` runs `worker/discover.js` from Node |
| `worker/discover.js` | 1 | 02 Discovery | Pure discovery steps with an injected `get` (used by the script in 1, the route in 3) |
| `src/sources/coops.js`; flood and marine adapters in `openmeteo.js` | 1 | 02 catalog | US tides, currents, GloFAS, marine |
| `src/render/header.js`, `src/picker.js` (lazy), `src/copy/picker.js`, `src/info.js` | 1 | 07 15 | Header, picker, `/api/info` |
| `src/render/detail/tide.js` | 1 | 01 9.4 | Tide view |
| `src/admin/` (lazy), `worker/admin.js`, `worker/metrics.js`, `worker/auth/access.js` | 1 | 07 14.5, 03 3.7 | Metrics tab behind Cloudflare Access |
| `scripts/check-sources.mjs` | 1 | 02 Tests | Manual live check of every adapter |
| `worker/http.js`, `worker/router.js`, `worker/crypto.js`, `worker/email.js` | 2 | 6, 7, 10 here | Shared Worker helpers; `sendEmail()` |
| `worker/auth/session.js`, `guard.js`, `codes.js`, `passkeys.js`, `signup.js`, `settings.js`, `export.js`, `delete.js`, `audit.js` | 2 | 03 18 | Accounts |
| `src/auth.js`, `src/account.js` (lazy), `src/sync.js`, `src/settings-keys.js`, `src/turnstile.js`, `src/compare.js` (picker chunk), `src/sets.js` | 2 | 03 18, 07 15 | Accounts in the app, compare, limit sets |
| `privacy.html`, `terms.html`, `about.html` (Vite inputs) | 2 | 07 5.15 | Static pages |
| `migrations/0002_accounts.sql`, `test/helpers/d1.js`, `test/helpers/authenticator.js`, `test/migrations.test.js` | 2 | 4, 5, 13 here | Schema and its tests |
| `migrations/0003` to `0008`, `scripts/locations/seed.mjs` | 3 | 5 here | Phase 3 schema and the seed |
| `worker/locations.js`, `worker/flowstats.js`, `worker/sourcehealth.js` | 3 | 01 14, 02 | Location API, stats, health |
| `worker/reports.js` (extended), `worker/hazards.js`, `worker/outings.js`, `worker/moderation.js`, `worker/screen.js`, `worker/auth/minors.js` | 3 | 04 3.10, 03 18 | Community features |
| `worker/notify/tick.js`, `overdue.js`, `schedule.js`, `copy.js`, `deliver.js` | 3 | 05 5.1, 11 | Engine skeleton, email only |
| `src/reportlogic.js`, `src/outbox.js`, `src/hazards.js`, `src/outings.js`, `src/render/detail/info.js`, `src/render/safety.js`, `src/map.js` (lazy), `src/add/` (lazy) | 3 | 04, 07, 06 22.4 | Community screens; the Info tab's Safety section ships here |
| `scripts/tune-reports.mjs` | 3 | 04 3.7 | Threshold tuning |
| `worker/push.js`, `worker/notify/digest.js`, `alerts.js`, `events.js`, `data.js` | 4 | 05 | Push and alert rules |
| `src/notify.js`, `src/text.js`, `public/push-sw.js`, `public/badge-96.png`, `scripts/vapid-keys.mjs`, `scripts/bench-model.mjs` | 4 | 05 | Push in the app |
| `migrations/0009` to `0011`, `worker/clubs/*` (phase 5 files), `worker/auth/guardians.js` | 5 | 06 22, 03 18 | Clubs and guardians |
| `src/clubrules.js`, `src/clubtext.js`, `src/club-context.js`, `src/club/` (lazy) | 5 | 06 22 | Clubs in the app |
| `migrations/0012_club_ops.sql`, `src/schedule.js`, `worker/clubs/*` (phase 6 files) | 6 | 06 22 | Club operations |
| `src/sources/eccc.js`, `chs.js`, `ea.js`, `hubeau.js`, `pegel.js`, `worker-proxied.js`, `worker/sourceproxy.js` | 7 | 02 | Sources beyond the US |

### 3.5 Worker structure

`worker/index.js` exports three handlers.

```js
export default {
  async fetch(request, env, ctx) { /* 2.3: method and origin checks, prefix dispatch, JSON errors */ },
  async scheduled(controller, env, ctx) { /* '* * * * *' -> tick(env, now); '17 9 * * *' -> daily(env, now) */ },
  async queue(batch, env, ctx) { /* deliver(batch, env) from worker/notify/deliver.js */ }
};
```

Prefix dispatch, in this order (first match wins):

| Prefix | Router | Phase |
| --- | --- | --- |
| `/api/info`, `/api/suggest` | inline in `worker/index.js` | today |
| `/api/auth/`, `/api/me` (except the club, notify, outings and contacts paths below), `/api/admin/users`, `/api/admin/audit`, `/api/mod/users` | `worker/auth/index.js` | 2 |
| `/api/admin/metrics` | `worker/admin.js` | 1 |
| `/api/locations`, `/api/waterways`, `/api/discover`, `/api/sources` | `worker/locations.js` (club context, proxies and the `/reports` and `/hazards` suffixes delegate onward) | 3 |
| `/api/reports`, `/api/locations/:slug/reports`, `/api/admin/reports` | `worker/reports.js` | today, 3 |
| `/api/hazards`, `/api/flags`, `/api/admin/queue` | `worker/hazards.js`, `worker/moderation.js` | 3 |
| `/api/outings`, `/api/contacts`, `/api/me/outings`, `/api/me/contacts` | `worker/outings.js` | 3 |
| `/api/push/`, `/api/notify/`, `/api/me/notify`, `/api/me/notifications`, `/api/admin/tick`, `/api/admin/notify` | `worker/notify/routes.js` | 3, 4 |
| `/api/clubs/`, `/api/invites/`, `/api/kiosk/`, `/api/cal/`, `/api/me/clubs`, `/api/me/calendar-links`, `/api/me/juniors/:membershipId/approve`, `/api/locations/:slug/club-context`, `/api/admin/clubs/` | `worker/clubs/index.js` `routeClubs()` | 5 |
| any other `/api/` path | 404 JSON | today |

Each router is a table of `[method, pattern, handler, options]` read by `worker/router.js`, where `options` names the auth guard and the rate limit binding. No router dependency (06 19 does the same for clubs).

Decision: A small route table per area, dispatched by prefix in `worker/index.js`, with no router library.
- Alternative: Hono or itty-router (one dependency, familiar API, more than the app needs).
- Alternative: keep growing the if-chain in `worker/index.js` (unreadable past a dozen routes).


## 4. Canonical D1 schema

### 4.1 Rules for every table

| Rule | Detail |
| --- | --- |
| Primary keys | TEXT UUIDs, except slugs for `waterways`, the composite keys of join tables, and the credential id of `passkeys`. `reports` keeps `legacy-<n>` ids for rows from `0001`. |
| Times | INTEGER ms. Local dates (`first_date`, `until_date`) as `YYYY-MM-DD` TEXT. |
| JSON columns | TEXT with `CHECK (json_valid(...))` and a length cap. D1 supports the JSON extension (from docs, https://developers.cloudflare.com/d1/sql-api/sql-statements/; verified live 2026-10-18 in SQLite 3.50.4). |
| Choice columns | A `CHECK (... IN (...))` list. SQLite cannot change a CHECK in place, so every list below already holds the values later phases need (05 `club` kind, 06 boat classes, 04 flag reasons). |
| References to `users(id)` | Shared records: `ON DELETE SET NULL`. Personal records: `ON DELETE CASCADE`. One exception: `hazards.created_by` is NOT NULL with no action, and account deletion reassigns it to the former member row first (03 12.9). A deletion that misses a table then fails instead of leaving data, which the deletion test relies on (03 20.2). |
| References to `locations(id)` | No action on history (`reports`, `outings`, `hazards`, `club_locations`, `practices`), because locations are archived, never deleted, and only drafts with nothing pointing at them can be hard deleted (01 2.3). `CASCADE` on location-owned rows (`location_aliases`, `location_sources`, `location_revisions`, `notify_prefs`, `club_rules`, `water_status`). `SET NULL` where the row outlives the place (`notify_log`, `incidents`, `boats`, `club_devices`). |
| References to tables that arrive later | Never declared. SQLite refuses every insert into a table whose foreign key names a table that does not exist yet, even when the column is NULL ("no such table: main.nosuch", verified live 2026-10-18 in SQLite 3.50.4 through `node:sqlite`; 06 23.1 found the same). Such columns are created plain and checked in code (`notify_prefs.club_id`, `outings.club_id`, `outings.boat_id`, `outings.practice_id`, `outings.device_id`, `outing_crew.membership_id`, `audit_log.club_id`, `incidents.outing_id`, `incidents.boat_id`), or added later with `ALTER TABLE ... ADD COLUMN ... REFERENCES` once the parent exists (`locations.steward_club_id`, `reports.club_id`, `hazards.club_id`). |
| Users and locations across phase 2 and 3 | `users.home_location_id` and `favorites.location_id` have no foreign key: accounts arrive in phase 2, while locations live in static files until phase 3 (03 8, 15). The Worker checks ids against the static index in phase 2 and D1 from phase 3; merges move favorites (01 13.7); draft deletion deletes favorites pointing at the draft in the same batch. |
| Placeholder user | `00000000-0000-4000-8000-000000000000`, "Former member", inserted by `0002`. Lists, exports and counts skip it (03 12.9). |
| Naming | Tables plural snake_case; indexes `<table>_<purpose>`. Where 01 to 07 spelled a name differently, 4.3 says which spelling won. |

### 4.2 Every table

| Table | Migration | Phase | Owner | Key | Foreign keys and ON DELETE |
| --- | --- | --- | --- | --- | --- |
| `reports` (0001 form) | `0001_reports.sql` | today (dev), 2 (production) | 04 2 | INTEGER autoincrement | none |
| `users` | `0002_accounts.sql` | 2 | 03 15 | `id` | none |
| `passkeys` | `0002` | 2 | 03 15 | credential `id` | `user_id` CASCADE |
| `auth_challenges` | `0002` | 2 | 03 15 | `id` | `user_id` CASCADE |
| `login_codes` | `0002` | 2 | 03 15 | `id` | `user_id` CASCADE |
| `auth_sessions` | `0002` | 2 | 03 15 | `id`; `token_hash` unique | `user_id` CASCADE |
| `user_settings` | `0002` | 2 | 03 15 | `(user_id, scope, key)` | `user_id` CASCADE |
| `favorites` | `0002` | 2 | 03 15 | `(user_id, location_id)` | `user_id` CASCADE; `location_id` none (4.1) |
| `email_blocks` | `0002` | 2 | 03 15 | `email_hmac` | `created_by` SET NULL |
| `audit_log` | `0002` | 2 | 03 15, 10.7 here | `id` | `actor_user_id`, `subject_user_id` SET NULL; `club_id` none |
| `waterways` | `0003_locations.sql` | 3 | 01 5 | slug `id` | `merged_into` self, no action; `created_by` SET NULL |
| `locations` | `0003` | 3 | 01 5, 06 8.7 | `id`; `slug` unique | `waterway_id`, `merged_into` no action; `created_by`, `verified_by` SET NULL; `steward_club_id` SET NULL (added in `0010`) |
| `location_aliases` | `0003` | 3 | 01 5 | `slug` | `location_id` CASCADE |
| `location_sources` | `0003` | 3 | 01 4.4 and 5, 02 | `id` | `location_id`, `waterway_id` CASCADE; `confirmed_by`, `created_by` SET NULL |
| `location_revisions` | `0003` | 3 | 01 5 | `id`; `(location_id, revision)` unique | `location_id` CASCADE; `user_id`, `decided_by` SET NULL |
| `locations_fts` (FTS5) | `0003` | 3 | 01 5 | rowid of `locations` | kept in step by triggers |
| `source_cache` | `0003` | 3 | 02 | `key` | none |
| `reports` (rebuilt) | `0005_reports_locations.sql` | 3 | 04 3.8 | `id` TEXT | `location_id` no action; `user_id` SET NULL; `club_id` SET NULL (added in `0010`) |
| `hazards` | `0006_hazards_flags.sql` | 3 | 04 4.7 | `id` | `waterway_id`, `location_id` no action; `created_by` no action (reassigned); `ended_by` SET NULL; `club_id` SET NULL (`0010`) |
| `hazard_votes` | `0006` | 3 | 04 4.7 | `(hazard_id, user_id)` | both CASCADE |
| `flags` | `0006` | 3 | 04 8.5 | `id` | `user_id`, `resolved_by` SET NULL |
| `outings` | `0007_outings.sql` | 3 | 04 5.7 as changed by 06 18.3 | `id` | `user_id` CASCADE; `location_id` no action; `created_by`, `ack_by` SET NULL; club columns plain |
| `outing_crew` | `0007` | 3 | 06 18.3 | `(outing_id, seat)` | `outing_id` CASCADE; `user_id` SET NULL |
| `emergency_contacts` | `0007` | 3 | 04 6.1 | `id` | `user_id` CASCADE |
| `push_subscriptions` | `0008_notify.sql` | 3 (used from 4) | 05 8 | `id`; `endpoint_hash` unique | `user_id` CASCADE |
| `notify_prefs` | `0008` | 3 (used from 4) | 05 8, 06 21.1 | `id` | `user_id` CASCADE; `location_id` CASCADE; `club_id` none |
| `notify_log` | `0008` | 3 | 05 8, 06 21.1 | `id`; `dedupe_key` unique | `user_id` CASCADE; `contact_id`, `pref_id`, `location_id` SET NULL |
| `clubs` | `0009_clubs.sql` | 5 | 06 18.1 | `id`; `slug` unique | `verified_by`, `created_by` SET NULL |
| `club_locations` | `0009` | 5 | 06 18.1 | `(club_id, location_id)` | `club_id` CASCADE; `location_id` no action |
| `club_groups` | `0009` | 5 | 06 18.1 | `id` | `club_id` CASCADE |
| `invites` | `0009` | 5 | 06 18.1 | `id` | `club_id` CASCADE; `created_by` SET NULL |
| `memberships` | `0009` | 5 | 06 18.1 | `id` | `club_id` CASCADE; `user_id`, `ended_by` SET NULL; `invite_id` SET NULL |
| `membership_groups` | `0009` | 5 | 06 18.1 | `(membership_id, group_id)` | both CASCADE |
| `club_guardians` | `0009` | 5 | 06 18.1 | `(junior_id, guardian_id)` | both CASCADE; `created_by` SET NULL |
| `club_rules` | `0009` | 5 | 06 18.1 | `id` | `club_id`, `group_id`, `location_id` CASCADE; authors SET NULL |
| `water_status` | `0009` | 5 | 06 18.1 | `id` | `club_id`, `location_id` CASCADE; people SET NULL; `replaced_by` SET NULL |
| `club_devices` | `0009` | 5 | 06 18.1 | `id`; `token_hash` unique | `club_id` CASCADE; `location_id` SET NULL; `created_by` SET NULL |
| `incidents` | `0009` | 5 | 06 18.1 | `id` | `club_id` CASCADE; `location_id`, `reported_by`, `reviewed_by` SET NULL; `outing_id`, `boat_id` none |
| `guardian_links` | `0011_guardians.sql` | 5 | 03 15 | `id` | users SET NULL; `club_id` SET NULL |
| `boats` | `0012_club_ops.sql` | 6 | 06 18.2 | `id` | `club_id` CASCADE; `location_id`, `owner_membership_id` SET NULL |
| `damage_reports` | `0012` | 6 | 06 18.2 | `id` | `club_id`, `boat_id` CASCADE; people and `outing_id` SET NULL |
| `practice_series` | `0012` | 6 | 06 18.2 | `id` | `club_id` CASCADE; `created_by` SET NULL |
| `practices` | `0012` | 6 | 06 18.2, 21.7 | `id` | `club_id` CASCADE; `series_id` SET NULL; `location_id` no action |
| `attendance` | `0012` | 6 | 06 18.2 | `(practice_id, membership_id)` | both CASCADE; people SET NULL |
| `lineups` | `0012` | 6 | 06 18.2 | `id` | `club_id`, `practice_id` CASCADE; `boat_id` SET NULL |
| `lineup_seats` | `0012` | 6 | 06 18.2 | `(lineup_id, seat)` | `lineup_id` CASCADE; `membership_id` SET NULL |
| `bookings` | `0012` | 6 | 06 18.2 | `id` | `club_id`, `boat_id`, `practice_id` CASCADE; `membership_id`, `decided_by`, `outing_id` SET NULL |
| `announcements` | `0012` | 6 | 06 18.2 | `id` | `club_id` CASCADE; `author_id` SET NULL |
| `calendar_tokens` | `0012` | 6 | 06 18.2 | `id`; `token_hash` unique | `user_id`, `club_id` CASCADE |

That is 47 tables after phase 6, plus `locations_fts` (verified live 2026-10-18: the files in 4.4 create exactly these in a fresh SQLite database).

### 4.3 What this document changed in the proposals

| Table | Change | Why |
| --- | --- | --- |
| `users` | `units` CHECK gains `'uk'` | 07 7.1 ships a UK system in phase 2, the same phase as the table. |
| `users` | New `phone` (E.164) and `phone_for_contacts` (0 or 1) | 04 6.1 shows the rower's phone on the status link "as a profile field (03)", and 06 5.2 rule 8 shares a guardian's phone with staff. 03 had no column. |
| `locations` | No `steward_club_id` in `0003`; added by `0010` | 06 23.1: a reference to `clubs` before phase 5 makes every insert fail. |
| `locations` | `emergency` JSON column created in `0003`, not added in phase 5 | 07 4.4 shows the Safety section in the Info tab from phase 3, and curated records may carry emergency info from phase 1 (06 8.7: "part of the location record"). The column costs nothing while empty. |
| `locations` | Reserved slugs gain `index`; `at` needs no entry | Per-location shells are `dist/<slug>.html` (07 4.2), so a slug `index` would overwrite the app shell. `at` (07 16) is two letters and already refused by the 3 to 48 rule. |
| `location_sources` | 01's role columns, plus 02's `origin`, `fail_count`, `confirmed_by`, `confirmed_at`; status list `active`, `suggested`, `offline`, `retired`, `rejected`; a partial unique index for one active primary per owner and role | 01 and 02 proposed different tables (15, conflict K2). 02's `location_slug`, `slot`, `rank`, `river_km`, `direction`, `straight_km` and `stale` are not used. |
| `flow_stats` (02) | Not created | Statistics live on the flow binding's `stats` JSON (01 4.4), and computed results are cached in `source_cache` for 30 days (conflict K6). |
| `source_cache` | Kept from 02, with an expiry index | The one Worker-side cache that must survive across data centers (6.6). |
| `reports` | New `client_id` and index `reports_client` | 04 3.9 returns the existing report for a repeated `clientId`, which needs the value stored. |
| `flags` | `reason` gains `under_13`; `status` gains `content_deleted` | 03 11.2 relies on an under-13 flag reason, and 03 12.9 closes flags as `content_deleted`. Neither was in 04's lists. |
| `hazards` | `created_by` documented as reassigned, `ended_by` SET NULL | 03 12.9's rule for NOT NULL author columns. |
| `outings`, `outing_crew` | 06 18.3's statements, which 04's phase 3 table becomes | 06 8.1 Decision. |
| `notify_prefs`, `notify_log`, `push_subscriptions` | All three in phase 3; `club` in both kind lists; `notify_log.subkind`; club CHECKs widened | `notify_log.pref_id` references `notify_prefs`, so the parent must exist before the first overdue row in phase 3 (4.1). 06 21.1 asked for the club kind. |
| `notify_log` | CHECK becomes `user_id IS NOT NULL OR kind = 'system'`; rows for emergency contacts carry the rower's `user_id` and the `contact_id` | With 05's CHECK, deleting an emergency contact set `contact_id` to NULL on a row whose `user_id` was NULL, which fails the CHECK and blocks the delete. Rows for contacts belong to the rower's history and go with the rower's account (03 12.9). The in-app list filters `contact_id IS NULL`. |
| `clubs` | New `verify_email`, `verify_code_hash`, `verify_code_expires_at`, `verify_attempts` | 06 3.3's email-at-the-domain method needs a 6-digit code stored as an HMAC, 5 tries and 30 minutes; 06 named no columns. |
| `memberships` | New `share_phone` | 06 5.2 rule 8 and `PATCH /api/clubs/:slug/me` `sharePhone`. |
| `club_guardians` | New `confirmed_by`, `confirmed_at` | A guardian added by an invite or a link is confirmed by a club admin before they see a junior's club life or count as another adult (06 4.5; people and safety review P18). |
| `invites` | CHECK that a guardian preset or `guardianOf` is only on a `personal` invite | A reusable link or code could otherwise make anyone a guardian of a named child (06 4.3, P18). |
| `guardian_links` | `ended_reason` gains `junior`; new `end_reason`, `end_note` | A junior can end a link and say why (03 11.5, P17). |
| `outings` | New `share_guardians` | A junior shows one row to guardians on purpose (03 11.5, 04 5.2, P17). |
| `club_devices` | `location_id` SET NULL | A paired screen outlives a removed location link. |
| `practices` | `check_at` and the indexes from 06 21.7 | 06 asked 08 to fold them into 18.2. |

### 4.4 The statements

These are the migration files, ready to copy into `migrations/` in their phase. All of them ran in order on 2026-10-18, verified live in two ways: through `node:sqlite` (SQLite 3.50.4, Node 22.22.0) with `PRAGMA foreign_keys = ON`, and with `npx wrangler d1 migrations apply DB --local` (wrangler 4.149.0, Miniflare's local D1). The same run checked: five `0001` rows survive `0005` as `legacy-1` to `legacy-5` at Putney; a report for an unknown location is refused; every reference to `users(id)` has an ON DELETE action except `hazards.created_by`; deleting a user with an unreassigned hazard fails and succeeds after reassignment; deleting an emergency contact with a log row succeeds; a `club` pref needs a club id; a subkind on a non-club row is refused; a second active primary flow binding is refused; the slug `index` is refused; an FTS5 prefix search for `putn*` finds Putney Landing; `steward_club_id` refuses an unknown club and becomes NULL when the club is deleted; the one-statement booking insert refuses an overlap and accepts back to back. Not checked on remote D1.

`0001_reports.sql` exists in the repo and is unchanged.

#### 0002_accounts.sql (phase 2)

```sql
-- Accounts (03). Phase 2. locations are static files until phase 3, so
-- users.home_location_id and favorites.location_id have no foreign key.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE
    CHECK (length(email) BETWEEN 6 AND 254 AND email = lower(email) AND email = trim(email)
           AND email GLOB '?*@?*.?*' AND email NOT GLOB '*[ ]*'),
  email_verified_at INTEGER NOT NULL,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 40),
  junior_until INTEGER,
  site_role TEXT NOT NULL DEFAULT 'user' CHECK (site_role IN ('user', 'moderator', 'admin')),
  webauthn_handle TEXT NOT NULL UNIQUE CHECK (length(webauthn_handle) = 22),
  home_location_id TEXT,
  units TEXT NOT NULL DEFAULT 'auto' CHECK (units IN ('auto', 'us', 'uk', 'metric')),
  phone TEXT CHECK (phone IS NULL OR (phone GLOB '+[1-9]*' AND length(phone) BETWEEN 8 AND 16)),
  phone_for_contacts INTEGER NOT NULL DEFAULT 0 CHECK (phone_for_contacts IN (0, 1)),
  favorites_at INTEGER NOT NULL DEFAULT 0,
  terms_version TEXT NOT NULL CHECK (length(terms_version) = 10),
  terms_at INTEGER NOT NULL,
  suspended_until INTEGER,
  suspended_reason TEXT CHECK (suspended_reason IS NULL OR length(suspended_reason) <= 300),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS users_role ON users (site_role) WHERE site_role <> 'user';
CREATE INDEX IF NOT EXISTS users_junior ON users (junior_until) WHERE junior_until IS NOT NULL;

-- The former member placeholder for NOT NULL author columns (03 12.9).
INSERT OR IGNORE INTO users (id, email, email_verified_at, display_name, junior_until, site_role,
  webauthn_handle, home_location_id, units, favorites_at, terms_version, terms_at,
  suspended_until, suspended_reason, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000000', 'former-member@rowhether.invalid', 0, 'Former member', NULL, 'user',
  'AAAAAAAAAAAAAAAAAAAAAA', NULL, 'auto', 0, '0000-00-00', 0,
  253402300799000, 'placeholder', 0, 0);

CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 1400),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports TEXT CHECK (transports IS NULL OR json_valid(transports)),
  device_type TEXT NOT NULL CHECK (device_type IN ('singleDevice', 'multiDevice')),
  backed_up INTEGER NOT NULL CHECK (backed_up IN (0, 1)),
  aaguid TEXT CHECK (aaguid IS NULL OR length(aaguid) = 36),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS passkeys_user ON passkeys (user_id);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'authenticate', 'reauth')),
  challenge TEXT NOT NULL CHECK (length(challenge) BETWEEN 32 AND 128),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  CHECK (purpose = 'authenticate' OR user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS auth_challenges_expiry ON auth_challenges (expires_at);

CREATE TABLE IF NOT EXISTS login_codes (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('signin', 'reauth', 'change_email', 'revert_email')),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 6 AND 254),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL CHECK (length(code_hash) = 64),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'verified', 'used', 'dead', 'replaced')),
  ticket_hash TEXT CHECK (ticket_hash IS NULL OR length(ticket_hash) = 64),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  verified_at INTEGER,
  CHECK (purpose = 'signin' OR user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS login_codes_email ON login_codes (email, created_at);
CREATE INDEX IF NOT EXISTS login_codes_created ON login_codes (created_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_method TEXT NOT NULL CHECK (auth_method IN ('passkey', 'code')),
  auth_at INTEGER NOT NULL,
  device TEXT CHECK (device IS NULL OR length(device) <= 60),
  country TEXT CHECK (country IS NULL OR length(country) = 2),
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions (user_id, last_seen_at);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions (expires_at);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope = 'global' OR (scope GLOB 'loc:?*' AND length(scope) <= 68)),
  key TEXT NOT NULL CHECK (length(key) BETWEEN 1 AND 32 AND key NOT GLOB '*[^A-Za-z0-9]*'),
  value TEXT CHECK (value IS NULL OR (json_valid(value) AND length(value) <= 500)),
  updated_at INTEGER NOT NULL,
  server_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, scope, key)
);
CREATE INDEX IF NOT EXISTS user_settings_pull ON user_settings (user_id, server_at);

CREATE TABLE IF NOT EXISTS favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 49),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, location_id)
);
CREATE INDEX IF NOT EXISTS favorites_location ON favorites (location_id);

CREATE TABLE IF NOT EXISTS email_blocks (
  email_hmac TEXT PRIMARY KEY CHECK (length(email_hmac) = 64),
  reason TEXT NOT NULL CHECK (reason IN ('banned')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('security', 'admin', 'moderation', 'club', 'safeguarding')),
  action TEXT NOT NULL CHECK (length(action) BETWEEN 3 AND 48 AND action GLOB '?*.?*'),
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('user', 'moderator', 'admin', 'club', 'system')),
  actor_label TEXT CHECK (actor_label IS NULL OR length(actor_label) <= 60),
  subject_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT CHECK (target_type IS NULL OR length(target_type) <= 32),
  target_id TEXT CHECK (target_id IS NULL OR length(target_id) <= 64),
  club_id TEXT,
  detail TEXT CHECK (detail IS NULL OR (json_valid(detail) AND length(detail) <= 4000)),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_subject ON audit_log (subject_user_id, kind, at);
CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log (kind, at);
CREATE INDEX IF NOT EXISTS audit_log_club ON audit_log (club_id, at) WHERE club_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_log_expiry ON audit_log (expires_at);
```

#### 0003_locations.sql (phase 3)

```sql
-- Locations, waterways, source bindings and their history (01, 02). Phase 3.
-- steward_club_id arrives in 0010 with clubs (06 23.1).
CREATE TABLE IF NOT EXISTS waterways (
  id TEXT PRIMARY KEY
    CHECK (length(id) BETWEEN 3 AND 64 AND id NOT GLOB '*[^a-z0-9-]*'
           AND id NOT GLOB '-*' AND id NOT GLOB '*-'),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 80),
  reach TEXT CHECK (reach IS NULL OR length(reach) <= 120),
  kind TEXT NOT NULL CHECK (kind IN ('river', 'lake', 'reservoir', 'tidal', 'canal', 'harbor')),
  country TEXT NOT NULL CHECK (length(country) = 2 AND country NOT GLOB '*[^A-Z]*'),
  regions TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(regions)),
  geometry TEXT CHECK (geometry IS NULL OR json_valid(geometry)),
  min_lat REAL, min_lon REAL, max_lat REAL, max_lon REAL,
  traffic TEXT CHECK (traffic IS NULL OR json_valid(traffic)),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  merged_into TEXT REFERENCES waterways(id),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS waterways_bbox ON waterways (min_lat, max_lat);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE
    CHECK (length(slug) BETWEEN 3 AND 48 AND slug NOT GLOB '*[^a-z0-9-]*'
           AND slug NOT GLOB '-*' AND slug NOT GLOB '*-' AND slug NOT GLOB '*--*'
           AND slug NOT IN ('api', 'add', 'admin', 'account', 'club', 'assets', 'about', 'privacy',
                            'terms', 'help', 'settings', 'login', 'logout', 'static', 'sw', 'manifest',
                            'locations', 'index')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 3 AND 60),
  short_name TEXT NOT NULL CHECK (length(short_name) BETWEEN 2 AND 16),
  subtitle TEXT CHECK (subtitle IS NULL OR length(subtitle) <= 120),
  locality TEXT CHECK (locality IS NULL OR length(locality) <= 60),
  waterway_id TEXT REFERENCES waterways(id),
  lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon REAL NOT NULL CHECK (lon >= -180 AND lon < 180),
  tz TEXT NOT NULL CHECK (length(tz) BETWEEN 3 AND 64),
  tz_label TEXT CHECK (tz_label IS NULL OR length(tz_label) <= 24),
  country TEXT NOT NULL CHECK (length(country) = 2 AND country NOT GLOB '*[^A-Z]*'),
  region TEXT CHECK (region IS NULL OR length(region) BETWEEN 4 AND 6),
  water_type TEXT NOT NULL CHECK (water_type IN ('river', 'lake', 'reservoir', 'tidal', 'canal', 'harbor')),
  course TEXT NOT NULL CHECK (json_valid(course)),
  banks TEXT CHECK (banks IS NULL OR json_valid(banks)),
  thresholds TEXT NOT NULL CHECK (json_valid(thresholds)),
  aqi_scale TEXT NOT NULL DEFAULT 'us' CHECK (aqi_scale IN ('us', 'eu')),
  flow TEXT CHECK (flow IS NULL OR json_valid(flow)),
  water TEXT CHECK (water IS NULL OR json_valid(water)),
  fog TEXT CHECK (fog IS NULL OR json_valid(fog)),
  water_temp TEXT CHECK (water_temp IS NULL OR json_valid(water_temp)),
  tide TEXT CHECK (tide IS NULL OR json_valid(tide)),
  daylight TEXT CHECK (daylight IS NULL OR json_valid(daylight)),
  copy TEXT CHECK (copy IS NULL OR json_valid(copy)),
  emergency TEXT CHECK (emergency IS NULL OR (json_valid(emergency) AND length(emergency) <= 6000)),
  launch_notes TEXT CHECK (launch_notes IS NULL OR length(launch_notes) <= 1000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'verified', 'archived')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  verified_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  verified_via TEXT CHECK (verified_via IS NULL OR verified_via IN ('owner', 'moderator', 'club')),
  verified_at INTEGER,
  merged_into TEXT REFERENCES locations(id),
  archived_reason TEXT CHECK (archived_reason IS NULL OR length(archived_reason) <= 300),
  search TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER
);
CREATE INDEX IF NOT EXISTS locations_lat ON locations (lat);
CREATE INDEX IF NOT EXISTS locations_waterway ON locations (waterway_id);
CREATE INDEX IF NOT EXISTS locations_creator ON locations (created_by, created_at);

CREATE TABLE IF NOT EXISTS location_aliases (
  slug TEXT PRIMARY KEY CHECK (length(slug) BETWEEN 3 AND 48 AND slug NOT GLOB '*[^a-z0-9-]*'),
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('renamed', 'merged')),
  created_at INTEGER NOT NULL
);

-- One row per role binding (01 section 4), owned by a location or a waterway.
-- origin, fail_count and confirmed_* come from 02.
CREATE TABLE IF NOT EXISTS location_sources (
  id TEXT PRIMARY KEY,
  location_id TEXT REFERENCES locations(id) ON DELETE CASCADE,
  waterway_id TEXT REFERENCES waterways(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('forecast', 'air_quality', 'models', 'alerts', 'obs', 'flow',
                                     'flow_forecast', 'water_temp', 'tide', 'tide_stream', 'level')),
  mode TEXT NOT NULL DEFAULT 'primary' CHECK (mode IN ('primary', 'fallback', 'info', 'off')),
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 9),
  adapter TEXT NOT NULL CHECK (length(adapter) BETWEEN 2 AND 32),
  ref TEXT NOT NULL CHECK (length(ref) BETWEEN 1 AND 120),
  params TEXT CHECK (params IS NULL OR json_valid(params)),
  unit TEXT CHECK (unit IS NULL OR unit IN ('cfs', 'm3s', 'ft', 'm', 'degC', 'degF', 'kn', 'ms')),
  tz TEXT CHECK (tz IS NULL OR length(tz) BETWEEN 3 AND 64),
  label TEXT CHECK (label IS NULL OR length(label) <= 60),
  note TEXT CHECK (note IS NULL OR length(note) <= 200),
  site_lat REAL, site_lon REAL,
  distance_m INTEGER,
  river_m INTEGER,
  relation TEXT CHECK (relation IS NULL OR relation IN ('at', 'upstream', 'downstream', 'nearby', 'other_water')),
  stats TEXT CHECK (stats IS NULL OR json_valid(stats)),
  origin TEXT NOT NULL DEFAULT 'curated' CHECK (origin IN ('curated', 'discovered', 'edited')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suggested', 'offline', 'retired', 'rejected')),
  fail_count INTEGER NOT NULL DEFAULT 0 CHECK (fail_count >= 0),
  last_ok_at INTEGER,
  last_checked_at INTEGER,
  confirmed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at INTEGER,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((location_id IS NULL) <> (waterway_id IS NULL))
);
CREATE INDEX IF NOT EXISTS location_sources_loc ON location_sources (location_id, role, priority);
CREATE INDEX IF NOT EXISTS location_sources_ww ON location_sources (waterway_id, role, priority);
CREATE INDEX IF NOT EXISTS location_sources_ref ON location_sources (adapter, ref);
CREATE INDEX IF NOT EXISTS location_sources_health ON location_sources (status, last_checked_at);
CREATE UNIQUE INDEX IF NOT EXISTS location_sources_primary
  ON location_sources (COALESCE(location_id, waterway_id), role) WHERE mode = 'primary' AND status = 'active';

CREATE TABLE IF NOT EXISTS location_revisions (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  revision INTEGER,
  base_revision INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('applied', 'pending', 'rejected', 'withdrawn')),
  kind TEXT NOT NULL CHECK (kind IN ('create', 'edit', 'sources', 'status', 'claim', 'verify',
                                     'merge', 'archive', 'restore', 'import')),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 200),
  changes TEXT NOT NULL CHECK (json_valid(changes)),
  snapshot TEXT CHECK (snapshot IS NULL OR json_valid(snapshot)),
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at INTEGER,
  decision_note TEXT CHECK (decision_note IS NULL OR length(decision_note) <= 300),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS location_revisions_rev ON location_revisions (location_id, revision)
  WHERE revision IS NOT NULL;
CREATE INDEX IF NOT EXISTS location_revisions_queue ON location_revisions (status, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS location_revisions_user ON location_revisions (user_id, created_at);

-- Search (01 5). External content table kept in sync by triggers.
CREATE VIRTUAL TABLE IF NOT EXISTS locations_fts USING fts5(
  search, content='locations', content_rowid='rowid', prefix='2 3'
);
CREATE TRIGGER IF NOT EXISTS locations_fts_ai AFTER INSERT ON locations BEGIN
  INSERT INTO locations_fts(rowid, search) VALUES (new.rowid, new.search);
END;
CREATE TRIGGER IF NOT EXISTS locations_fts_ad AFTER DELETE ON locations BEGIN
  INSERT INTO locations_fts(locations_fts, rowid, search) VALUES ('delete', old.rowid, old.search);
END;
CREATE TRIGGER IF NOT EXISTS locations_fts_au AFTER UPDATE OF search ON locations BEGIN
  INSERT INTO locations_fts(locations_fts, rowid, search) VALUES ('delete', old.rowid, old.search);
  INSERT INTO locations_fts(rowid, search) VALUES (new.rowid, new.search);
END;

-- Worker-side cache for station lists, discovery results, flow statistics,
-- NWS ETags, backoffs and VAPID headers (02, 05).
CREATE TABLE IF NOT EXISTS source_cache (
  key TEXT PRIMARY KEY CHECK (length(key) BETWEEN 3 AND 200),
  body TEXT NOT NULL CHECK (json_valid(body)),
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS source_cache_expiry ON source_cache (expires_at);
```

#### 0004_seed_locations.sql (phase 3, generated)

`scripts/locations/seed.mjs` (01 7.2) writes this file from `data/` when phase 3 is built, and it is committed like any migration. Rules: `INSERT OR IGNORE` for every row, so it never overwrites a row edited in D1; Putney keeps the id `19fe7acb-de20-48c9-b25d-20d5e99d113a` (01 6.3), which `0005` relies on; `search` is the folded text 01 2.1 describes; waterway bindings carry `waterway_id`, location bindings `location_id`; `origin` is `curated`; one `location_revisions` row of kind `import` per location. After phase 3, D1 is the source of truth for locations on rowhether.com, and `data/` keeps the curated set the build emits for static hosts and first installs. The excerpt below is what the generator produces for Putney's waterway, location and flow binding, trimmed (the real `copy` holds 01 6.3's text):

```sql
-- Generated by scripts/locations/seed.mjs from data/. Do not edit by hand.
-- INSERT OR IGNORE, so a later run never overwrites rows edited in D1.
INSERT OR IGNORE INTO waterways (id, name, reach, kind, country, regions, geometry, min_lat, min_lon, max_lat, max_lon,
  traffic, notes, merged_into, created_by, created_at, updated_at)
VALUES ('connecticut-river-vernon-pool', 'Connecticut River', 'Bellows Falls dam to Vernon dam', 'river', 'US',
  '["US-VT","US-NH"]', NULL, 42.9607, -72.5219, 42.9607, -72.5219, NULL, NULL, NULL, NULL, 1792224000000, 1792224000000);
INSERT OR IGNORE INTO locations (id, slug, name, short_name, subtitle, locality, waterway_id, lat, lon, tz, tz_label,
  country, region, water_type, course, banks, thresholds, aqi_scale, flow, water, fog, water_temp, tide, daylight,
  copy, emergency, launch_notes, status, revision, created_by, verified_by, verified_via, verified_at, merged_into,
  archived_reason, search, created_at, updated_at, archived_at)
VALUES ('19fe7acb-de20-48c9-b25d-20d5e99d113a', 'putney-landing', 'Putney Landing', 'Putney',
  'Connecticut River at the Putney Rowing Club docks.', 'Putney, VT', 'connecticut-river-vernon-pool',
  42.9607, -72.5219, 'America/New_York', 'Eastern', 'US', 'US-VT', 'river',
  '{"kind":"heading","heading":15,"reachWord":"straight","confirmed":false,"note":"Estimate of the reach at Putney Landing."}',
  '{"word":"bank","left":{"short":"VT","name":"Vermont"},"right":{"short":"NH","name":"New Hampshire"}}',
  '{"windCaution":10,"windOff":15,"gustCaution":18,"gustOff":25,"rainCaution":60,"rainOff":90,"coldCombined":100,"flowCaution":20000,"flowOff":28000,"aqiCaution":151,"aqiOff":201}',
  'us', '{"measure":"discharge","unit":"cfs","against":[[20000,1.4],[10000,1.25]],"maxAgeH":24,"staleSwitchH":6}',
  '{"mode":"river","cross":0.4}', NULL, '{"fallback":"none","maxAgeH":72}', NULL, NULL, '{}', NULL, NULL,
  'verified', 1, NULL, NULL, 'owner', 1792224000000, NULL, NULL,
  'putney landing putney putney vt connecticut river', 1792224000000, 1792224000000, NULL);
INSERT OR IGNORE INTO location_sources (id, location_id, waterway_id, role, mode, priority, adapter, ref, params, unit, tz,
  label, note, site_lat, site_lon, distance_m, river_m, relation, stats, origin, status, created_at, updated_at)
VALUES ('6d0b0c5e-0000-4000-8000-000000000001', NULL, 'connecticut-river-vernon-pool', 'flow', 'primary', 0, 'usgs-ogc',
  'USGS-01154500', '{"parameterCode":"00060"}', 'cfs', 'America/New_York', 'North Walpole',
  'North Walpole gauge below Bellows Falls dam, about 16 river miles upstream.', 43.126189, -72.436755, 19659, 25750,
  'upstream', '{"from":"2016-01-01","to":"2026-10-15","days":3939,"p50":6910,"p65":10100,"p88":20300,"p90":21900,"p95":28100}',
  'curated', 'active', 1792224000000, 1792224000000);
```

#### 0005_reports_locations.sql (phase 3)

04 3.8's rebuild, with `client_id` added. It needs `0003` and the seed. On the dev database, export the `reports` table before applying `0003` (5.5).

```sql
-- Reports at every location (04 3.8). Rebuilds the 0001 table and keeps its
-- rows as 'legacy-<n>' at Putney Landing. Needs 0003 and the 0004 seed.
PRAGMA defer_foreign_keys = true;

CREATE TABLE reports_v2 (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  water TEXT CHECK (water IN ('flat', 'light', 'chop', 'rough')),
  fog TEXT CHECK (fog IN ('clear', 'patchy', 'thick')),
  wind TEXT CHECK (wind IN ('calm', 'light', 'strong', 'gusty')),
  current TEXT CHECK (current IN ('slack', 'normal', 'strong', 'very_strong')),
  tide TEXT CHECK (tide IN ('flood', 'ebb', 'slack')),
  low_water INTEGER NOT NULL DEFAULT 0 CHECK (low_water IN (0, 1)),
  debris INTEGER NOT NULL DEFAULT 0 CHECK (debris IN (0, 1)),
  ice TEXT CHECK (ice IN ('none', 'shore', 'floating', 'covered')),
  smoke INTEGER NOT NULL DEFAULT 0 CHECK (smoke IN (0, 1)),
  water_c REAL CHECK (water_c IS NULL OR water_c BETWEEN -2 AND 40),
  launch TEXT CHECK (launch IN ('open', 'closed')),
  geo TEXT CHECK (geo IN ('near', 'far', 'unknown')),
  via TEXT NOT NULL DEFAULT 'web' CHECK (via IN ('web', 'outbox', 'legacy')),
  turnstile INTEGER NOT NULL DEFAULT 0 CHECK (turnstile IN (0, 1)),
  weight REAL NOT NULL DEFAULT 1 CHECK (weight BETWEEN 0.5 AND 3),
  fc TEXT CHECK (fc IS NULL OR (json_valid(fc) AND length(fc) <= 1024)),
  ip_hash TEXT CHECK (ip_hash IS NULL OR length(ip_hash) = 22),
  client_id TEXT CHECK (client_id IS NULL OR length(client_id) = 36),
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'removed')),
  CHECK (water IS NOT NULL OR fog IS NOT NULL OR wind IS NOT NULL OR current IS NOT NULL
         OR tide IS NOT NULL OR low_water = 1 OR debris = 1 OR ice IS NOT NULL OR smoke = 1
         OR water_c IS NOT NULL OR launch IS NOT NULL)
);

INSERT INTO reports_v2 (id, location_id, user_id, created_at, seen_at, water, fog, debris, via, weight)
  SELECT 'legacy-' || id, '19fe7acb-de20-48c9-b25d-20d5e99d113a', NULL, created_at, created_at,
         water, fog, debris, 'legacy', 1
  FROM reports;

DROP TABLE reports;
ALTER TABLE reports_v2 RENAME TO reports;

CREATE INDEX reports_loc_seen ON reports (location_id, seen_at);
CREATE INDEX reports_user ON reports (user_id, created_at) WHERE user_id IS NOT NULL;
CREATE INDEX reports_ip ON reports (ip_hash, created_at) WHERE ip_hash IS NOT NULL;
CREATE INDEX reports_status ON reports (status, created_at) WHERE status <> 'visible';
CREATE INDEX reports_client ON reports (client_id) WHERE client_id IS NOT NULL;
```

#### 0006_hazards_flags.sql (phase 3)

```sql
-- Hazards, votes and flags (04 4.7, 8.5). Phase 3.
CREATE TABLE IF NOT EXISTS hazards (
  id TEXT PRIMARY KEY,
  waterway_id TEXT REFERENCES waterways(id),
  location_id TEXT REFERENCES locations(id),
  lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon REAL NOT NULL CHECK (lon >= -180 AND lon < 180),
  place TEXT NOT NULL CHECK (place IN ('dock', 'me', 'pin')),
  kind TEXT NOT NULL CHECK (kind IN ('debris', 'snag', 'low_bridge', 'construction', 'dredging', 'dock_closed',
                                     'ice', 'buoy_missing', 'wildlife', 'shallows', 'current', 'other')),
  note TEXT CHECK (note IS NULL OR length(note) BETWEEN 1 AND 280),
  note_status TEXT NOT NULL DEFAULT 'none' CHECK (note_status IN ('none', 'ok', 'held', 'hidden')),
  screen TEXT CHECK (screen IS NULL OR json_valid(screen)),
  official INTEGER NOT NULL DEFAULT 0 CHECK (official IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cleared', 'expired', 'removed')),
  created_by TEXT NOT NULL REFERENCES users(id),           -- reassigned to the former member row, never null (03 12.9)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_confirmed_at INTEGER,
  confirms INTEGER NOT NULL DEFAULT 0,
  clears_since_confirm INTEGER NOT NULL DEFAULT 0,
  ended_at INTEGER,
  ended_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ended_reason TEXT CHECK (ended_reason IS NULL OR length(ended_reason) <= 200),
  CHECK (waterway_id IS NOT NULL OR location_id IS NOT NULL),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS hazards_ww_active ON hazards (waterway_id, expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS hazards_loc_active ON hazards (location_id, expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS hazards_author ON hazards (created_by, created_at);
CREATE INDEX IF NOT EXISTS hazards_review ON hazards (note_status, created_at) WHERE note_status = 'held';

CREATE TABLE IF NOT EXISTS hazard_votes (
  hazard_id TEXT NOT NULL REFERENCES hazards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('confirm', 'clear')),
  geo TEXT CHECK (geo IN ('near', 'far', 'unknown')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (hazard_id, user_id)
);
CREATE INDEX IF NOT EXISTS hazard_votes_user ON hazard_votes (user_id, created_at);

CREATE TABLE IF NOT EXISTS flags (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('report', 'hazard', 'hazard_note', 'location', 'location_revision', 'club', 'user')),
  target_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('wrong', 'spam', 'abuse', 'personal', 'danger', 'under_13', 'other')),
  note TEXT CHECK (note IS NULL OR length(note) <= 280),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'upheld', 'dismissed', 'content_deleted')),
  created_at INTEGER NOT NULL,
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at INTEGER,
  UNIQUE (target_type, target_id, user_id)
);
CREATE INDEX IF NOT EXISTS flags_open ON flags (status, created_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS flags_target ON flags (target_type, target_id);
```

#### 0007_outings.sql (phase 3)

```sql
-- Outings, crew and emergency contacts (04 5.7, 6.1), created with 06's club
-- columns (06 18.3), unused until phase 5. Phase 3.
CREATE TABLE IF NOT EXISTS outings (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations(id),
  client_id TEXT CHECK (client_id IS NULL OR length(client_id) = 36),
  boat_type TEXT NOT NULL CHECK (boat_type IN ('1x', '2x', '2-', '2+', '4x', '4-', '4+', '4x+', '8+', '8x+', 'launch', 'other')),
  boat_name TEXT CHECK (boat_name IS NULL OR length(boat_name) BETWEEN 1 AND 60),
  seats INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 9),
  direction TEXT CHECK (direction IN ('upstream', 'downstream', 'both', 'course', 'open')),
  route_note TEXT CHECK (route_note IS NULL OR length(route_note) <= 120),
  escort INTEGER NOT NULL DEFAULT 0 CHECK (escort IN (0, 1)),
  out_at INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  in_at INTEGER,
  status TEXT NOT NULL DEFAULT 'out' CHECK (status IN ('out', 'in', 'cancelled', 'closed')),
  float_plan INTEGER NOT NULL DEFAULT 0 CHECK (float_plan IN (0, 1)),
  grace_min INTEGER NOT NULL DEFAULT 15 CHECK (grace_min BETWEEN 5 AND 60),
  contact_after_min INTEGER NOT NULL DEFAULT 30 CHECK (contact_after_min BETWEEN 15 AND 120),
  stage INTEGER NOT NULL DEFAULT 0 CHECK (stage BETWEEN 0 AND 6),
  next_check_at INTEGER,
  contacts_alerted_at INTEGER,
  safe_by TEXT CHECK (safe_by IS NULL OR safe_by IN ('self', 'contact', 'club', 'moderator')),
  safe_note TEXT CHECK (safe_note IS NULL OR length(safe_note) <= 120),
  public_count INTEGER NOT NULL DEFAULT 1 CHECK (public_count IN (0, 1)),
  share_hash TEXT UNIQUE CHECK (share_hash IS NULL OR length(share_hash) = 43),
  share_expires_at INTEGER,
  snap TEXT CHECK (snap IS NULL OR (json_valid(snap) AND length(snap) <= 2048)),
  distance_m INTEGER CHECK (distance_m IS NULL OR distance_m BETWEEN 0 AND 200000),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 500),
  clock_skew INTEGER NOT NULL DEFAULT 0 CHECK (clock_skew IN (0, 1)),
  share_guardians INTEGER NOT NULL DEFAULT 0 CHECK (share_guardians IN (0, 1)), -- a junior shows this row to guardians (03 11.5)
  -- 06 columns: no foreign keys to club tables, which arrive in phase 5 and 6
  club_id TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_via TEXT NOT NULL DEFAULT 'self' CHECK (created_via IN ('self', 'staff', 'kiosk')),
  device_id TEXT,
  boat_id TEXT,
  practice_id TEXT,
  rule_lvl INTEGER CHECK (rule_lvl IS NULL OR rule_lvl BETWEEN 0 AND 2),
  rule_text TEXT CHECK (rule_text IS NULL OR length(rule_text) <= 160),
  against INTEGER NOT NULL DEFAULT 0 CHECK (against IN (0, 1)),
  club_stage INTEGER NOT NULL DEFAULT 0 CHECK (club_stage BETWEEN 0 AND 3),
  club_next_at INTEGER,
  ack_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  ack_name TEXT CHECK (ack_name IS NULL OR length(ack_name) <= 60),
  ack_at INTEGER,
  resolved TEXT CHECK (resolved IS NULL OR resolved IN ('back', 'safe_elsewhere', 'cancelled', 'incident')),
  checks TEXT CHECK (checks IS NULL OR (json_valid(checks) AND length(checks) <= 500)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (due_at >= out_at + 600000 AND due_at <= out_at + 43200000),
  CHECK (in_at IS NULL OR in_at >= out_at),
  CHECK (user_id IS NOT NULL OR club_id IS NOT NULL),
  CHECK (user_id IS NOT NULL OR float_plan = 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS outings_client ON outings (user_id, client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS outings_one_active ON outings (user_id) WHERE status = 'out';
CREATE INDEX IF NOT EXISTS outings_next_check ON outings (next_check_at) WHERE next_check_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS outings_loc_out ON outings (location_id, out_at) WHERE status = 'out';
CREATE INDEX IF NOT EXISTS outings_user_log ON outings (user_id, out_at);
CREATE INDEX IF NOT EXISTS outings_club ON outings (club_id, status, due_at) WHERE club_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS outings_club_next ON outings (club_next_at) WHERE club_next_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS outing_crew (
  outing_id TEXT NOT NULL REFERENCES outings(id) ON DELETE CASCADE,
  seat INTEGER NOT NULL CHECK (seat BETWEEN 1 AND 9),
  role TEXT NOT NULL DEFAULT 'rower' CHECK (role IN ('rower', 'cox')),
  name TEXT CHECK (name IS NULL OR length(name) BETWEEN 1 AND 60),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  membership_id TEXT,
  accepted INTEGER CHECK (accepted IS NULL OR accepted IN (0, 1)),
  PRIMARY KEY (outing_id, seat),
  CHECK (name IS NOT NULL OR user_id IS NOT NULL OR membership_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS outing_crew_user ON outing_crew (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS outing_crew_member ON outing_crew (membership_id) WHERE membership_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 3),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  relation TEXT CHECK (relation IS NULL OR length(relation) <= 40),
  email TEXT CHECK (email IS NULL OR (length(email) <= 254 AND email LIKE '%_@_%._%')),
  phone TEXT CHECK (phone IS NULL OR (phone GLOB '+[1-9]*' AND length(phone) BETWEEN 8 AND 16)),
  notice_sent_at INTEGER,
  opted_out_at INTEGER,
  stop_hash TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, position),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS emergency_contacts_email ON emergency_contacts (email);
```

#### 0008_notify.sql (phase 3)

```sql
-- Notifications (05 8), with 06's club kind and subkind (06 21.1). All three
-- tables arrive together in phase 3: notify_log references notify_prefs, and
-- an insert into a table whose parent table does not exist fails.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL CHECK (length(endpoint) <= 1024 AND endpoint GLOB 'https://*'),
  endpoint_hash TEXT NOT NULL UNIQUE CHECK (length(endpoint_hash) = 43),
  p256dh TEXT NOT NULL CHECK (length(p256dh) = 87),
  auth TEXT NOT NULL CHECK (length(auth) = 22),
  service TEXT NOT NULL CHECK (service IN ('apple', 'fcm', 'mozilla', 'microsoft', 'other')),
  platform TEXT CHECK (platform IN ('ios', 'ipados', 'android', 'mac', 'windows', 'linux', 'other')),
  standalone INTEGER NOT NULL DEFAULT 0 CHECK (standalone IN (0, 1)),
  label TEXT CHECK (label IS NULL OR length(label) <= 40),
  vapid_key TEXT NOT NULL CHECK (length(vapid_key) = 87),
  expiration_time INTEGER,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  last_ok_at INTEGER,
  last_status INTEGER,
  fail_count INTEGER NOT NULL DEFAULT 0,
  first_fail_at INTEGER,
  disabled_at INTEGER
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions (user_id) WHERE disabled_at IS NULL;
CREATE INDEX IF NOT EXISTS push_subscriptions_stale ON push_subscriptions (last_ok_at, last_seen_at);

CREATE TABLE IF NOT EXISTS notify_prefs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('night_before', 'morning_of', 'nws_alert', 'hazard', 'go_window',
                                     'water_status', 'practice', 'club')),
  location_id TEXT REFERENCES locations(id) ON DELETE CASCADE,
  club_id TEXT,                                  -- no foreign key: clubs arrive in phase 5 (05 8)
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  local_time TEXT CHECK (local_time IS NULL OR (local_time GLOB '[0-2][0-9]:[0-5][0-9]' AND local_time < '24:00')),
  days INTEGER NOT NULL DEFAULT 127 CHECK (days BETWEEN 1 AND 127),
  params TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(params) AND length(params) <= 512),
  channels TEXT NOT NULL DEFAULT 'push' CHECK (channels IN ('push', 'email', 'push,email')),
  next_at INTEGER,
  next_check_at INTEGER,
  last_snap TEXT CHECK (last_snap IS NULL OR (json_valid(last_snap) AND length(last_snap) <= 1024)),
  last_sent_at INTEGER,
  retries INTEGER NOT NULL DEFAULT 0 CHECK (retries BETWEEN 0 AND 6),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((kind IN ('water_status', 'practice', 'club')) = (club_id IS NOT NULL)),
  CHECK ((kind IN ('water_status', 'practice', 'club')) OR location_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS notify_prefs_one ON notify_prefs (user_id, kind, COALESCE(location_id, club_id));
CREATE INDEX IF NOT EXISTS notify_prefs_due ON notify_prefs (next_at) WHERE enabled = 1 AND next_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS notify_prefs_check ON notify_prefs (next_check_at) WHERE enabled = 1 AND next_check_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS notify_prefs_loc ON notify_prefs (location_id, kind) WHERE enabled = 1;
CREATE INDEX IF NOT EXISTS notify_prefs_club ON notify_prefs (club_id, kind) WHERE enabled = 1 AND club_id IS NOT NULL;

-- Rows for emergency contacts also carry the rower's user_id, so deleting a
-- contact (contact_id SET NULL) never breaks the CHECK, and deleting the
-- rower removes the history (03 12.9).
CREATE TABLE IF NOT EXISTS notify_log (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE CHECK (length(dedupe_key) <= 160),
  kind TEXT NOT NULL CHECK (kind IN ('night_before', 'morning_change', 'morning_of', 'nws_alert', 'hazard', 'go_window',
                                     'water_status', 'practice', 'overdue', 'club', 'test', 'system')),
  subkind TEXT CHECK (subkind IS NULL OR (kind = 'club' AND length(subkind) BETWEEN 3 AND 24)),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES emergency_contacts(id) ON DELETE SET NULL,
  pref_id TEXT REFERENCES notify_prefs(id) ON DELETE SET NULL,
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  ref_id TEXT,
  title TEXT NOT NULL CHECK (length(title) <= 80),
  body TEXT NOT NULL CHECK (length(body) <= 300),
  url TEXT NOT NULL CHECK (length(url) <= 300),
  snap TEXT CHECK (snap IS NULL OR (json_valid(snap) AND length(snap) <= 1024)),
  channels TEXT NOT NULL CHECK (channels IN ('push', 'email', 'push,email', 'inapp')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'partial', 'failed', 'skipped')),
  skip_reason TEXT CHECK (skip_reason IS NULL OR skip_reason IN ('unchanged', 'not_wanted', 'cap', 'stale', 'no_channel', 'disabled')),
  push_ok INTEGER NOT NULL DEFAULT 0,
  push_fail INTEGER NOT NULL DEFAULT 0,
  email_status TEXT CHECK (email_status IS NULL OR email_status IN ('sent', 'failed', 'bounced')),
  created_at INTEGER NOT NULL,
  send_after INTEGER,
  sent_at INTEGER,
  opened_at INTEGER,
  read_at INTEGER,
  CHECK (user_id IS NOT NULL OR kind = 'system')
);
CREATE INDEX IF NOT EXISTS notify_log_user ON notify_log (user_id, created_at) WHERE user_id IS NOT NULL AND contact_id IS NULL;
CREATE INDEX IF NOT EXISTS notify_log_queued ON notify_log (status, created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS notify_log_ref ON notify_log (ref_id) WHERE ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notify_log_contact ON notify_log (contact_id) WHERE contact_id IS NOT NULL;
```

#### 0009_clubs.sql (phase 5)

06 18.1 with the four `verify_*` columns, `memberships.share_phone` and `club_devices.location_id ON DELETE SET NULL` added.

```sql
-- Clubs and safety (06 18.1). Phase 5. Adds verify_email, verify_code_*,
-- verify_attempts and memberships.share_phone, which 06 describes but did not store.
CREATE TABLE IF NOT EXISTS clubs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE
    CHECK (length(slug) BETWEEN 3 AND 48 AND slug NOT GLOB '*[^a-z0-9-]*'
           AND slug NOT GLOB '-*' AND slug NOT GLOB '*-' AND slug NOT GLOB '*--*'
           AND slug NOT IN ('new', 'join', 'api', 'add', 'admin', 'account', 'club', 'assets', 'about',
                            'privacy', 'terms', 'help', 'settings', 'login', 'logout', 'static', 'sw', 'manifest')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 3 AND 80),
  short_name TEXT NOT NULL CHECK (length(short_name) BETWEEN 2 AND 24),
  name_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('club', 'school', 'college', 'masters', 'junior', 'adaptive',
                                     'community', 'association', 'other')),
  status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (status IN ('unverified', 'pending_review', 'verified', 'suspended', 'deleting', 'deleted')),
  tz TEXT NOT NULL CHECK (length(tz) BETWEEN 3 AND 64),
  country TEXT NOT NULL CHECK (length(country) = 2 AND country NOT GLOB '*[^A-Z]*'),
  locality TEXT CHECK (locality IS NULL OR length(locality) <= 60),
  description TEXT CHECK (description IS NULL OR length(description) <= 500),
  visitor_info TEXT CHECK (visitor_info IS NULL OR length(visitor_info) <= 1000),
  public_text_status TEXT NOT NULL DEFAULT 'ok' CHECK (public_text_status IN ('pending', 'ok', 'hidden')),
  safety_info TEXT CHECK (safety_info IS NULL OR length(safety_info) <= 1000),
  website TEXT CHECK (website IS NULL OR (length(website) <= 200 AND website GLOB 'https://*')),
  contact_email TEXT CHECK (contact_email IS NULL OR (length(contact_email) <= 254 AND contact_email LIKE '%_@_%._%')),
  links TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(links) AND length(links) <= 2000),
  status_public INTEGER NOT NULL DEFAULT 1 CHECK (status_public IN (0, 1)),
  rules_public INTEGER NOT NULL DEFAULT 0 CHECK (rules_public IN (0, 1)),
  settings TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(settings) AND length(settings) <= 4000),
  rules_revision INTEGER NOT NULL DEFAULT 0 CHECK (rules_revision >= 0),
  verify_method TEXT CHECK (verify_method IS NULL OR verify_method IN ('meta', 'dns', 'email', 'manual')),
  verify_token TEXT CHECK (verify_token IS NULL OR length(verify_token) = 25),
  verify_domain TEXT CHECK (verify_domain IS NULL OR length(verify_domain) <= 253),
  verify_passed_at INTEGER,
  verify_evidence TEXT CHECK (verify_evidence IS NULL OR length(verify_evidence) <= 500),
  verify_email TEXT CHECK (verify_email IS NULL OR length(verify_email) <= 254),
  verify_code_hash TEXT CHECK (verify_code_hash IS NULL OR length(verify_code_hash) = 64),
  verify_code_expires_at INTEGER,
  verify_attempts INTEGER NOT NULL DEFAULT 0 CHECK (verify_attempts BETWEEN 0 AND 5),
  verified_at INTEGER,
  verified_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  suspended_reason TEXT CHECK (suspended_reason IS NULL OR length(suspended_reason) <= 300),
  delete_after INTEGER,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((status IN ('deleting', 'deleted')) = (delete_after IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS clubs_status ON clubs (status);
CREATE INDEX IF NOT EXISTS clubs_name_key ON clubs (name_key);
CREATE INDEX IF NOT EXISTS clubs_creator ON clubs (created_by, created_at);
CREATE INDEX IF NOT EXISTS clubs_delete ON clubs (delete_after) WHERE delete_after IS NOT NULL;

CREATE TABLE IF NOT EXISTS club_locations (
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations(id),
  role TEXT NOT NULL DEFAULT 'home' CHECK (role IN ('home', 'regular')),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (club_id, location_id)
);
CREATE INDEX IF NOT EXISTS club_locations_loc ON club_locations (location_id);
CREATE UNIQUE INDEX IF NOT EXISTS club_locations_primary ON club_locations (club_id) WHERE is_primary = 1;

CREATE TABLE IF NOT EXISTS club_groups (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 40),
  kind TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('juniors', 'novices', 'masters', 'adaptive',
                                                      'learn_to_row', 'competitive', 'collegiate', 'custom')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (club_id, name)
);

CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('link', 'code', 'personal')),
  token TEXT UNIQUE CHECK (token IS NULL OR length(token) = 22),
  code TEXT UNIQUE CHECK (code IS NULL OR (length(code) = 8 AND code NOT GLOB '*[^ABCDEFGHJKMNPQRSTUVWXYZ23456789]*')),
  preset TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(preset) AND length(preset) <= 1000),
  approve INTEGER NOT NULL DEFAULT 0 CHECK (approve IN (0, 1)),
  email TEXT CHECK (email IS NULL OR length(email) <= 254),
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses BETWEEN 1 AND 500),
  uses INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  CHECK ((kind = 'code') = (code IS NOT NULL)),
  CHECK ((kind = 'code') = (token IS NULL)),
  CHECK (kind = 'personal' OR email IS NULL),
  CHECK (kind = 'personal' OR (json_extract(preset, '$.guardianOf') IS NULL AND json_extract(preset, '$.kind') IS NOT 'guardian')),
  CHECK (uses <= max_uses),
  CHECK (expires_at > created_at AND expires_at <= created_at + 7776000000)
);
CREATE INDEX IF NOT EXISTS invites_club ON invites (club_id, created_at);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 60),
  kind TEXT NOT NULL DEFAULT 'adult' CHECK (kind IN ('adult', 'junior', 'guardian')),
  role_admin INTEGER NOT NULL DEFAULT 0 CHECK (role_admin IN (0, 1)),
  role_coach INTEGER NOT NULL DEFAULT 0 CHECK (role_coach IN (0, 1)),
  role_safety INTEGER NOT NULL DEFAULT 0 CHECK (role_safety IN (0, 1)),
  role_equipment INTEGER NOT NULL DEFAULT 0 CHECK (role_equipment IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('requested', 'pending_guardian', 'active', 'left', 'removed',
                                         'blocked', 'declined')),
  roster_only INTEGER NOT NULL DEFAULT 0 CHECK (roster_only IN (0, 1)),
  row_as TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(row_as) AND length(row_as) <= 200),
  clearances TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(clearances) AND length(clearances) <= 2000),
  rules_on INTEGER NOT NULL DEFAULT 1 CHECK (rules_on IN (0, 1)),
  share_phone INTEGER NOT NULL DEFAULT 0 CHECK (share_phone IN (0, 1)),
  request_reason TEXT CHECK (request_reason IS NULL OR request_reason IN ('rower', 'parent', 'learn', 'coach', 'other')),
  request_note TEXT CHECK (request_note IS NULL OR length(request_note) <= 200),
  invite_id TEXT REFERENCES invites(id) ON DELETE SET NULL,
  joined_at INTEGER,
  ended_at INTEGER,
  ended_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (kind = 'adult' OR (role_admin + role_coach + role_safety + role_equipment) = 0),
  CHECK (roster_only = 0 OR (user_id IS NULL AND kind <> 'guardian')),
  CHECK (kind <> 'junior' OR rules_on = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS memberships_one ON memberships (club_id, user_id)
  WHERE user_id IS NOT NULL AND status IN ('requested', 'pending_guardian', 'active', 'blocked');
CREATE INDEX IF NOT EXISTS memberships_user ON memberships (user_id, status) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS memberships_club ON memberships (club_id, status, display_name);
CREATE INDEX IF NOT EXISTS memberships_staff ON memberships (club_id)
  WHERE status = 'active' AND (role_admin + role_coach + role_safety + role_equipment) > 0;

CREATE TABLE IF NOT EXISTS membership_groups (
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES club_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (membership_id, group_id)
);
CREATE INDEX IF NOT EXISTS membership_groups_group ON membership_groups (group_id);

CREATE TABLE IF NOT EXISTS club_guardians (
  junior_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  guardian_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  confirmed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at INTEGER,
  PRIMARY KEY (junior_id, guardian_id),
  CHECK (junior_id <> guardian_id)
);
CREATE INDEX IF NOT EXISTS club_guardians_guardian ON club_guardians (guardian_id);

CREATE TABLE IF NOT EXISTS club_rules (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
  position INTEGER NOT NULL DEFAULT 0,
  group_id TEXT REFERENCES club_groups(id) ON DELETE CASCADE,
  boat_classes TEXT CHECK (boat_classes IS NULL OR (json_valid(boat_classes) AND json_type(boat_classes) = 'array')),
  escort TEXT NOT NULL DEFAULT 'any' CHECK (escort IN ('any', 'with_launch', 'no_launch')),
  location_id TEXT REFERENCES locations(id) ON DELETE CASCADE,
  months TEXT CHECK (months IS NULL OR (json_valid(months) AND json_type(months) = 'array')),
  limits TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(limits) AND length(limits) <= 1000),
  requires TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(requires) AND length(requires) <= 1000),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS club_rules_club ON club_rules (club_id, position);

CREATE TABLE IF NOT EXISTS water_status (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES locations(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('open', 'restricted', 'closed')),
  reason TEXT CHECK (reason IS NULL OR reason IN ('high_water', 'wind', 'lightning', 'fog', 'ice', 'cold',
                                                  'debris', 'event', 'maintenance', 'dark', 'other')),
  note TEXT CHECK (note IS NULL OR length(note) <= 200),
  allowed TEXT CHECK (allowed IS NULL OR (json_valid(allowed) AND length(allowed) <= 500)),
  water_f REAL CHECK (water_f IS NULL OR water_f BETWEEN 28 AND 100),
  starts_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  set_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  set_by_name TEXT NOT NULL CHECK (length(set_by_name) BETWEEN 1 AND 60),
  set_by_role TEXT NOT NULL CHECK (set_by_role IN ('admin', 'safety', 'coach')),
  cleared_at INTEGER,
  cleared_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  replaced_by TEXT REFERENCES water_status(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  CHECK (expires_at > starts_at AND expires_at <= starts_at + 2592000000),
  CHECK (state = 'restricted' OR allowed IS NULL),
  CHECK (state = 'open' OR reason IS NOT NULL),
  CHECK (state <> 'restricted' OR allowed IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS water_status_live ON water_status (club_id, expires_at) WHERE cleared_at IS NULL;
CREATE INDEX IF NOT EXISTS water_status_history ON water_status (club_id, created_at);

CREATE TABLE IF NOT EXISTS club_devices (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 40),
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  pair_code TEXT CHECK (pair_code IS NULL OR (length(pair_code) = 6 AND pair_code NOT GLOB '*[^0-9]*')),
  pair_expires_at INTEGER,
  token_hash TEXT UNIQUE CHECK (token_hash IS NULL OR length(token_hash) = 43),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  paired_at INTEGER,
  last_seen_at INTEGER,
  revoked_at INTEGER,
  CHECK (pair_code IS NULL OR pair_expires_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS club_devices_club ON club_devices (club_id);
CREATE UNIQUE INDEX IF NOT EXISTS club_devices_pair ON club_devices (pair_code) WHERE pair_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  place_note TEXT CHECK (place_note IS NULL OR length(place_note) <= 200),
  occurred_at INTEGER NOT NULL,
  reported_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reporter_name TEXT NOT NULL CHECK (length(reporter_name) BETWEEN 1 AND 60),
  types TEXT NOT NULL CHECK (json_valid(types) AND json_array_length(types) BETWEEN 1 AND 3),
  injuries TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(injuries)),
  injury_details TEXT CHECK (injury_details IS NULL OR length(injury_details) <= 2000),
  property TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(property)),
  boat_classes TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(boat_classes)),
  categories TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(categories)),
  outing_id TEXT,
  boat_id TEXT,
  weather_factor INTEGER CHECK (weather_factor IS NULL OR weather_factor IN (0, 1)),
  conditions TEXT CHECK (conditions IS NULL OR (json_valid(conditions) AND length(conditions) <= 2048)),
  narrative TEXT NOT NULL CHECK (length(narrative) BETWEEN 20 AND 4000),
  actions TEXT CHECK (actions IS NULL OR length(actions) <= 2000),
  prevention TEXT CHECK (prevention IS NULL OR length(prevention) <= 2000),
  people TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(people) AND json_array_length(people) <= 20),
  witnesses TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(witnesses) AND json_array_length(witnesses) <= 4),
  severity TEXT CHECK (severity IS NULL OR severity IN ('near_miss', 'minor', 'moderate', 'serious')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'reviewed', 'closed')),
  national TEXT NOT NULL DEFAULT 'to_do' CHECK (national IN ('not_needed', 'to_do', 'filed')),
  national_body TEXT CHECK (national_body IS NULL OR national_body IN ('usrowing', 'british_rowing', 'other')),
  national_filed_at INTEGER,
  national_ref TEXT CHECK (national_ref IS NULL OR length(national_ref) <= 60),
  summary TEXT CHECK (summary IS NULL OR length(summary) <= 1000),
  summary_shared_at INTEGER,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (national <> 'filed' OR national_filed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS incidents_club ON incidents (club_id, occurred_at);
CREATE INDEX IF NOT EXISTS incidents_open ON incidents (club_id, status) WHERE status IN ('draft', 'submitted');
```

#### 0010_club_links.sql (phase 5)

```sql
-- Club columns on earlier tables (06 22.6, 04 9). Phase 5, after 0009.
-- ADD COLUMN with REFERENCES is allowed because each default is NULL.
ALTER TABLE locations ADD COLUMN steward_club_id TEXT REFERENCES clubs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS locations_steward ON locations (steward_club_id);
ALTER TABLE reports ADD COLUMN club_id TEXT REFERENCES clubs(id) ON DELETE SET NULL;
ALTER TABLE hazards ADD COLUMN club_id TEXT REFERENCES clubs(id) ON DELETE SET NULL;
```

#### 0011_guardians.sql (phase 5)

```sql
-- Guardian links (03 15). Phase 5, after 0009 (guardian_links.club_id references clubs).
CREATE TABLE IF NOT EXISTS guardian_links (
  id TEXT PRIMARY KEY,
  junior_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  guardian_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  invite_email TEXT CHECK (invite_email IS NULL OR length(invite_email) BETWEEN 6 AND 254), -- pending email invites only
  code_hash TEXT CHECK (code_hash IS NULL OR length(code_hash) = 64), -- pending link code, HMAC
  code_expires_at INTEGER,
  initiated_by TEXT NOT NULL CHECK (initiated_by IN ('junior', 'guardian', 'club')),
  club_id TEXT REFERENCES clubs(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'ended')),
  ended_reason TEXT CHECK (ended_reason IS NULL OR ended_reason IN ('guardian', 'junior', 'admin', 'adult', 'deleted', 'expired')),
  end_reason TEXT CHECK (end_reason IS NULL OR end_reason IN ('not_my_guardian', 'not_comfortable', 'other')), -- given by a junior who ends the link
  end_note TEXT CHECK (end_note IS NULL OR length(end_note) <= 300),
  mute_nonsafety INTEGER NOT NULL DEFAULT 0 CHECK (mute_nonsafety IN (0, 1)),
  discontinue INTEGER NOT NULL DEFAULT 0 CHECK (discontinue IN (0, 1)), -- 11.4 rule 9
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  ended_at INTEGER,
  CHECK (status <> 'active' OR (junior_user_id IS NOT NULL AND guardian_user_id IS NOT NULL)),
  CHECK (status <> 'ended' OR ended_reason IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS guardian_links_pair ON guardian_links (junior_user_id, guardian_user_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS guardian_links_junior ON guardian_links (junior_user_id, status);
CREATE INDEX IF NOT EXISTS guardian_links_guardian ON guardian_links (guardian_user_id, status);
```

#### 0012_club_ops.sql (phase 6)

```sql
-- Club operations (06 18.2, with 21.7's check_at and indexes). Phase 6.
CREATE TABLE IF NOT EXISTS boats (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'shell' CHECK (kind IN ('shell', 'launch', 'oars', 'other')),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  boat_class TEXT CHECK (boat_class IS NULL OR boat_class IN ('1x', '2x', '2-', '2+', '4x', '4-', '4+', '4x+', '8+', '8x+')),
  rig TEXT CHECK (rig IS NULL OR rig IN ('scull', 'sweep', 'convertible')),
  rigging TEXT CHECK (rigging IS NULL OR (json_valid(rigging) AND length(rigging) <= 300)),
  weight_min_kg INTEGER CHECK (weight_min_kg IS NULL OR weight_min_kg BETWEEN 20 AND 150),
  weight_max_kg INTEGER CHECK (weight_max_kg IS NULL OR weight_max_kg BETWEEN 20 AND 150),
  maker TEXT CHECK (maker IS NULL OR length(maker) <= 40),
  model TEXT CHECK (model IS NULL OR length(model) <= 40),
  year INTEGER CHECK (year IS NULL OR year BETWEEN 1950 AND 2100),
  hull_id TEXT CHECK (hull_id IS NULL OR length(hull_id) <= 40),
  color TEXT CHECK (color IS NULL OR length(color) <= 30),
  specs TEXT CHECK (specs IS NULL OR (json_valid(specs) AND length(specs) <= 500)),
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  rack TEXT CHECK (rack IS NULL OR length(rack) <= 20),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'restricted', 'out_of_service', 'retired')),
  status_note TEXT CHECK (status_note IS NULL OR length(status_note) <= 200),
  restricted_to TEXT CHECK (restricted_to IS NULL OR (json_valid(restricted_to) AND length(restricted_to) <= 500)),
  bookable INTEGER NOT NULL DEFAULT 1 CHECK (bookable IN (0, 1)),
  approval INTEGER NOT NULL DEFAULT 0 CHECK (approval IN (0, 1)),
  owner_membership_id TEXT REFERENCES memberships(id) ON DELETE SET NULL,
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 500),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  retired_at INTEGER,
  CHECK (kind <> 'shell' OR boat_class IS NOT NULL),
  CHECK (weight_min_kg IS NULL OR weight_max_kg IS NULL OR weight_min_kg <= weight_max_kg),
  CHECK ((status = 'retired') = (retired_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS boats_name ON boats (club_id, name) WHERE status <> 'retired';
CREATE INDEX IF NOT EXISTS boats_club ON boats (club_id, kind, status);

CREATE TABLE IF NOT EXISTS damage_reports (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  boat_id TEXT NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  reported_by TEXT REFERENCES memberships(id) ON DELETE SET NULL,
  outing_id TEXT REFERENCES outings(id) ON DELETE SET NULL,
  severity TEXT NOT NULL CHECK (severity IN ('cosmetic', 'rowable', 'unsafe')),
  parts TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(parts) AND json_array_length(parts) <= 12),
  description TEXT CHECK (description IS NULL OR length(description) <= 1000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_repair', 'fixed', 'wont_fix', 'duplicate')),
  assigned_to TEXT REFERENCES memberships(id) ON DELETE SET NULL,
  resolution TEXT CHECK (resolution IS NULL OR length(resolution) <= 500),
  resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS damage_boat ON damage_reports (boat_id, created_at);
CREATE INDEX IF NOT EXISTS damage_open ON damage_reports (club_id, status) WHERE status IN ('open', 'in_repair');

CREATE TABLE IF NOT EXISTS practice_series (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  rrule TEXT NOT NULL CHECK (length(rrule) BETWEEN 10 AND 200 AND rrule GLOB 'FREQ=WEEKLY;*'),
  local_start TEXT NOT NULL CHECK (local_start GLOB '[0-2][0-9]:[0-5][0-9]' AND local_start < '24:00'),
  duration_min INTEGER NOT NULL CHECK (duration_min BETWEEN 15 AND 480),
  first_date TEXT NOT NULL CHECK (first_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  until_date TEXT NOT NULL CHECK (until_date GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]' AND until_date >= first_date),
  template TEXT NOT NULL CHECK (json_valid(template) AND length(template) <= 2000),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS practice_series_club ON practice_series (club_id);

CREATE TABLE IF NOT EXISTS practices (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  series_id TEXT REFERENCES practice_series(id) ON DELETE SET NULL,
  detached INTEGER NOT NULL DEFAULT 0 CHECK (detached IN (0, 1)),
  location_id TEXT NOT NULL REFERENCES locations(id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 60),
  kind TEXT NOT NULL DEFAULT 'water' CHECK (kind IN ('water', 'land', 'race', 'learn_to_row', 'other')),
  group_ids TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(group_ids) AND json_array_length(group_ids) <= 30),
  coach_ids TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(coach_ids) AND json_array_length(coach_ids) <= 10),
  escort INTEGER NOT NULL DEFAULT 1 CHECK (escort IN (0, 1)),
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  meet_at INTEGER,
  rsvp_by INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'land', 'cancelled')),
  status_note TEXT CHECK (status_note IS NULL OR length(status_note) <= 200),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 500),
  public INTEGER NOT NULL DEFAULT 0 CHECK (public IN (0, 1)),
  signup_url TEXT CHECK (signup_url IS NULL OR (length(signup_url) <= 200 AND signup_url GLOB 'https://*')),
  sequence INTEGER NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  decided_at INTEGER,
  check_at INTEGER,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (ends_at > starts_at AND ends_at - starts_at <= 28800000),
  CHECK (meet_at IS NULL OR (meet_at <= starts_at AND meet_at >= starts_at - 7200000)),
  CHECK (rsvp_by IS NULL OR rsvp_by <= starts_at)
);
CREATE INDEX IF NOT EXISTS practices_club_time ON practices (club_id, starts_at);
CREATE INDEX IF NOT EXISTS practices_series ON practices (series_id, starts_at) WHERE series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS practices_public ON practices (club_id, starts_at) WHERE public = 1;

CREATE TABLE IF NOT EXISTS attendance (
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  rsvp TEXT CHECK (rsvp IS NULL OR rsvp IN ('yes', 'no', 'maybe')),
  rsvp_reason TEXT CHECK (rsvp_reason IS NULL OR rsvp_reason IN ('school', 'work', 'sick', 'injured', 'travel', 'other')),
  rsvp_note TEXT CHECK (rsvp_note IS NULL OR length(rsvp_note) <= 100),
  rsvp_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  rsvp_at INTEGER,
  rsvp_late INTEGER NOT NULL DEFAULT 0 CHECK (rsvp_late IN (0, 1)),
  attended TEXT CHECK (attended IS NULL OR attended IN ('present', 'late', 'absent', 'excused')),
  marked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  marked_at INTEGER,
  PRIMARY KEY (practice_id, membership_id),
  CHECK (rsvp = 'no' OR rsvp_reason IS NULL)
);
CREATE INDEX IF NOT EXISTS attendance_member ON attendance (membership_id);

CREATE TABLE IF NOT EXISTS lineups (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  boat_id TEXT REFERENCES boats(id) ON DELETE SET NULL,
  boat_class TEXT NOT NULL CHECK (boat_class IN ('1x', '2x', '2-', '2+', '4x', '4-', '4+', '4x+', '8+', '8x+')),
  position INTEGER NOT NULL DEFAULT 0,
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 300),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  published_at INTEGER,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((status = 'published') = (published_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS lineups_practice ON lineups (practice_id, position);

CREATE TABLE IF NOT EXISTS lineup_seats (
  lineup_id TEXT NOT NULL REFERENCES lineups(id) ON DELETE CASCADE,
  seat INTEGER NOT NULL CHECK (seat BETWEEN 0 AND 8),
  membership_id TEXT REFERENCES memberships(id) ON DELETE SET NULL,
  guest_name TEXT CHECK (guest_name IS NULL OR length(guest_name) BETWEEN 1 AND 40),
  PRIMARY KEY (lineup_id, seat),
  CHECK (membership_id IS NULL OR guest_name IS NULL)
);
CREATE INDEX IF NOT EXISTS lineup_seats_member ON lineup_seats (membership_id) WHERE membership_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  boat_id TEXT NOT NULL REFERENCES boats(id) ON DELETE CASCADE,
  membership_id TEXT REFERENCES memberships(id) ON DELETE SET NULL,
  practice_id TEXT REFERENCES practices(id) ON DELETE CASCADE,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled', 'used', 'no_show')),
  note TEXT CHECK (note IS NULL OR length(note) <= 120),
  decided_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  decided_at INTEGER,
  cancel_reason TEXT CHECK (cancel_reason IS NULL OR cancel_reason IN ('member', 'staff', 'out_of_service', 'practice', 'left_club')),
  outing_id TEXT REFERENCES outings(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (ends_at > starts_at AND ends_at - starts_at <= 43200000),
  CHECK (membership_id IS NOT NULL OR practice_id IS NOT NULL),
  CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS bookings_boat ON bookings (boat_id, starts_at) WHERE status IN ('pending', 'confirmed');
CREATE INDEX IF NOT EXISTS bookings_member ON bookings (membership_id, starts_at) WHERE membership_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bookings_club ON bookings (club_id, starts_at);
CREATE INDEX IF NOT EXISTS bookings_practice ON bookings (practice_id) WHERE practice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES memberships(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL CHECK (length(author_name) BETWEEN 1 AND 60),
  group_ids TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(group_ids) AND json_array_length(group_ids) <= 30),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 80),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  pinned_until INTEGER,
  push INTEGER NOT NULL DEFAULT 1 CHECK (push IN (0, 1)),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS announcements_club ON announcements (club_id, created_at);

CREATE TABLE IF NOT EXISTS calendar_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id TEXT REFERENCES clubs(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 43),
  label TEXT CHECK (label IS NULL OR length(label) <= 40),
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS calendar_tokens_user ON calendar_tokens (user_id);

CREATE INDEX IF NOT EXISTS practices_check ON practices (check_at)
  WHERE check_at IS NOT NULL AND decided_at IS NULL AND status = 'scheduled';
CREATE INDEX IF NOT EXISTS practices_rsvp ON practices (rsvp_by)
  WHERE rsvp_by IS NOT NULL AND status = 'scheduled';
CREATE INDEX IF NOT EXISTS bookings_due ON bookings (starts_at)
  WHERE status IN ('pending', 'confirmed');
```

### 4.5 Notes on the schema

- `locations_fts` uses `content_rowid='rowid'`. `locations` has a TEXT primary key, so its rowid is implicit and can change if the table is ever rebuilt or vacuumed. Never rebuild `locations` without running `INSERT INTO locations_fts(locations_fts) VALUES ('rebuild')` in the same migration (from docs, https://www.sqlite.org/fts5.html, external content tables; unverified on D1).
- A full `wrangler d1 export` refuses a database with an FTS5 table: "cannot export databases with Virtual Tables (fts5)". A single table still exports with `--table` (both verified live 2026-10-18 on a local D1 with wrangler 4.149.0). Backups therefore rely on D1 Time Travel (03 14.5), and the one planned export (the dev `reports` table before `0005`) runs before `0003` creates the FTS table. This answers 01 5's open question.
- `0005` uses `PRAGMA defer_foreign_keys = true`, D1's documented way to change tables under foreign keys in a migration (from docs, https://developers.cloudflare.com/d1/reference/migrations/). Whether `wrangler d1 migrations apply` wraps a file in one transaction on remote D1 is unverified (04 3.8), so 5.5's backup step stays.
- Cross-table rules SQLite cannot express stay in code, each with a test: slugs unique across `locations.slug` and `location_aliases.slug` (01); one live membership per account per club (06, partial index plus code); `notify_prefs.club_id` and `outings.club_id` pointing at a real club, and club prefs deleted when a member leaves or a club is deleted (06 4.6, 3.6); `incidents.outing_id` and `boat_id` belonging to the club (06 18.1).


## 5. Migration plan

### 5.1 Files in order

| # | File | Phase | Holds | Must come after | Why the order |
| --- | --- | --- | --- | --- | --- |
| 0001 | `0001_reports.sql` | exists; production in 2 | Dock reports, Putney only | | |
| 0002 | `0002_accounts.sql` | 2 | 03's phase 2 tables, the former member row | 0001 | Every later table references `users`. |
| 0003 | `0003_locations.sql` | 3 | Waterways, locations, aliases, bindings, revisions, FTS, `source_cache` | 0002 | `created_by` and friends reference `users`. |
| 0004 | `0004_seed_locations.sql` | 3 | Curated records from `data/` | 0003 | `0005` needs Putney's row. |
| 0005 | `0005_reports_locations.sql` | 3 | Reports rebuilt with `location_id` | 0004 | Foreign key to Putney (04 9 order 1). |
| 0006 | `0006_hazards_flags.sql` | 3 | Hazards, votes, flags | 0003 | References `waterways`, `locations`, `users`. |
| 0007 | `0007_outings.sql` | 3 | Outings with 06's columns, crew, emergency contacts | 0003 | References `locations`. |
| 0008 | `0008_notify.sql` | 3 | Push subscriptions, alert rules, notification log | 0007 | `notify_log.contact_id` references `emergency_contacts`; `notify_log.pref_id` references `notify_prefs` in the same file. |
| 0009 | `0009_clubs.sql` | 5 | Clubs and the phase 5 club tables | 0003 | References `locations`. |
| 0010 | `0010_club_links.sql` | 5 | `locations.steward_club_id`, `reports.club_id`, `hazards.club_id` | 0009 | 06 23.1: the club columns after `clubs`. |
| 0011 | `0011_guardians.sql` | 5 | `guardian_links` | 0009 | `guardian_links.club_id` references `clubs` (06 22.6). |
| 0012 | `0012_club_ops.sql` | 6 | Boats, practices, bookings and the rest | 0009 | References `clubs`, `memberships`, `outings`. |

Phases 0, 1, 4 and 7 add no migration. Phase 4 uses the tables `0008` created.

### 5.2 Ordering constraints already found

1. `users` before anything that references it; `locations` before anything that references it (01 5, 04 9).
2. Clubs before every declared reference to `clubs`: `0010` and `0011` after `0009` (06 23.1, 22.6). A table that names a missing parent refuses every insert (4.1).
3. CHECK lists cannot widen later, so every list is complete when its table is first created: `notify_prefs.kind` and `notify_log.kind` include `club` (06 21.1), `outings.boat_type` includes `2+`, `4x+`, `8x+` and `launch` (06 8.1), `users.units` includes `uk` (07 7.1), `flags.reason` includes `under_13` and `flags.status` includes `content_deleted` (03).
4. NOT NULL columns cannot become nullable with `ALTER TABLE`, so `outings.user_id` is nullable from phase 3 (06 8.1).
5. `ALTER TABLE ... ADD COLUMN ... REFERENCES` works only when the new column defaults to NULL (from docs, https://www.sqlite.org/lang_altertable.html; verified live 2026-10-18 by `0010`).
6. The seed (`0004`) runs before the reports rebuild (`0005`).

### 5.3 Rules for migration files

- One file per change, numbered `NNNN_name.sql`, never edited after it has been applied to any shared database (dev or production). A mistake is fixed by a new file.
- Every statement uses `IF NOT EXISTS` where SQLite allows it, except inside the `0005` rebuild, which must fail loudly if run twice.
- Seeds are migrations only for data later migrations depend on (the former member row, the curated locations). Test fixtures never go in `migrations/`.
- Every file is applied by the test helper (13.4) in CI, so a file that does not parse fails `npm test`.

### 5.4 How each database gets them

| Database | Binding | Created | How migrations are applied | When |
| --- | --- | --- | --- | --- |
| `rowhether-dev` | `DB` in `previews`; `PREVIEW_DB` in `wrangler.preview-migrations.jsonc` | exists | `npx wrangler d1 migrations apply PREVIEW_DB --remote -c wrangler.preview-migrations.jsonc` (CLAUDE.md) | When the code that needs them merges into `dev`, never before (Decision below) |
| `rowhether` (production) | `DB` at the top level | phase 2, by the owner | `npx wrangler d1 time-travel info DB` (record the bookmark in the pull request, 03 14.5), then `npx wrangler d1 migrations apply DB --remote` | Before the merge of that phase into `master`. Every migration is additive for the code already on `master`, so applying first is safe |
| Local | `DB` in a temporary config | per developer | `npx wrangler d1 migrations apply DB --local -c <config>` (CLAUDE.md, dock reports against a real database) | Any time |
| Tests | `test/helpers/d1.js` over `node:sqlite` | per test | Loads every file in `migrations/` in order | Every `npm test` |

Every Preview of every branch shares `rowhether-dev` (`wrangler.jsonc` comment, read 2026-10-18). Applying a phase 3 migration while `dev` still runs phase 2 code would break dev: `0005` changes `reports` so the old insert fails.

Decision: Apply a migration to `rowhether-dev` only in the same step as the merge into `dev` of the code that needs it. While a phase is built on `dev-full-app`, Worker work is checked with the test helper and a local D1, not a Preview.
- Alternative: give `dev-full-app` its own Preview database (`rowhether-full-app`) in that branch's `previews` block, and switch the binding back when merging (a config change that must not merge by accident).
- Alternative: write only additive migrations and make `0005` keep the old insert working (defaults for `location_id` and `seen_at`, which hide mistakes).

Production timing: phase 2 creates the production database and applies `0001` and `0002`. Dock reports stay off on production through phase 2 with `REPORTS_ENABLED = "0"` (6.3), even though the `reports` table exists, so the phase 3 rebuild meets an empty table. 04 asked whether production gets the dev reports: no, they stay on dev and are exported for tuning (04 13 open question, recommendation kept).

### 5.5 The one risky migration: `0005`

1. Before applying `0003` to `rowhether-dev`: `npx wrangler d1 export rowhether-dev --remote --table reports --output reports-0001-backup.sql` (single-table export works; a full export stops working once `0003` adds FTS5, 4.5).
2. `npx wrangler d1 time-travel info rowhether-dev` and note the bookmark.
3. Count: `SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM reports`.
4. Apply `0003` to `0008` together with the merge of phase 3 into `dev`.
5. Count again; every old row must be present as `legacy-<n>` at Putney.
6. On failure: restore with Time Travel to the bookmark, or re-import the backup.

### 5.6 Phase 1 needs no database

Phase 1 keeps locations in `data/` as reviewed JSON (01 7.1). The owner's discovery tool is a script, `node scripts/locations/discover.mjs <lat> <lon> <water>`, which runs the pure steps in `worker/discover.js` with a Node `fetch` (02's User-Agent, its 45-request budget and timeouts) and prints draft bindings and flow statistics as JSON to paste into a `data/` file. No D1, no Cloudflare Access route and no rate limiter is needed for it. From phase 3 the same module serves `GET /api/discover` for signed-in users, with `source_cache` for its 24-hour cache.

Decision: Phase 1 discovery is a local script over the same module the phase 3 route uses.
- Alternative: `GET /api/discover` in phase 1 behind Cloudflare Access on the dev Preview, which has D1 (02's plan; it puts bindings in D1 two phases before locations).
- Alternative: no discovery tool in phase 1; the owner finds gauges by hand with `scripts/check-sources.mjs`.

## 6. Bindings, config and environments

### 6.1 Environments

| Environment | Where | `wrangler.jsonc` block | D1 | Secrets | Purpose |
| --- | --- | --- | --- | --- | --- |
| Production | `rowhether.com`, from `master` | top level | `rowhether` from phase 2 | Cloudflare dashboard | Live app |
| Previews | `<branch>-rowhether.<subdomain>.workers.dev`; `dev` is the shared dev instance | `previews` | `rowhether-dev` | Preview secrets where the platform allows (6.5) | Dev and branch testing |
| Local | `wrangler dev`, `vite`, `vite preview` | a temporary config for a local D1 | local | `.dev.vars` (git ignored) | Building and tests |
| Static host | any host serving `dist/` | none | none | none | The app with no `/api`: every server feature hides itself |

The `previews` block accepts `vars`, `secrets` (a list of required names), `d1_databases`, `ratelimits`, `queues`, `send_email`, `analytics_engine_datasets` and `analytics`, and has no `triggers` (verified live 2026-10-18 by reading wrangler 4.149.0's `config-schema.json`). Cron triggers are therefore top-level only; whether Preview deployments run them is unverified (05 5.1), and dev uses `POST /api/admin/tick` instead.

### 6.2 Rate limit bindings

Periods can only be 10 or 60 seconds, and counts are per Cloudflare location (from docs, https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/). All use 60 seconds. Longer windows are D1 counts in the owning document. Namespace ids: odd for production, the next even number for Previews, never reused. 1001 to 1004 are taken; 03's proposed 1011 to 1014 are kept.

| Binding | Limit per 60 s | Key | Used by | Phase | Production id | Previews id | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUGGEST_LIMIT` | 3 | IP | `POST /api/suggest` | today | 1001 | 1002 | existing |
| `REPORT_LIMIT` | 3 | IP | report posts | today | 1003 | 1004 | existing, 04 8.2 |
| `LOCATION_LIMIT` | 5 | user id | location and waterway writes | 3 | 1005 | 1006 | 01 12.1 |
| `DISCOVER_LIMIT` | 5 | user id | `GET /api/discover`, `GET /api/sources/stats` | 3 | 1007 | 1008 | 02 |
| `HAZARD_LIMIT` | 3 | user id | hazard posts, edits, votes | 3 | 1009 | 1010 | 04 8.2 |
| `AUTH_LIMIT` | 10 | IP | every `POST /api/auth/*` | 2 | 1011 | 1012 | 03 6.2 |
| `CODE_LIMIT` | 3 | IP | sign-in code requests | 2 | 1013 | 1014 | 03 6.2 |
| `FLAG_LIMIT` | 5 | user id; IP for the status link and contact stop pages | flags, `safe`, contact stop | 3 | 1015 | 1016 | 04 8.2 |
| `OUTING_LIMIT` | 10 | user id | outings, contacts, contact tests | 3 | 1017 | 1018 | 04 8.2 |
| `NOTIFY_LIMIT` | 20 | user id; IP for `POST /api/push/unsubscribe` | push and alert rule writes | 4 | 1019 | 1020 | 08 (05 named the 429 but no binding) |
| `CLUB_LIMIT` | 30 | user id | club writes | 5 | 1021 | 1022 | 06 17 |
| `JOIN_CODE_LIMIT` | 5 | IP | invite codes, kiosk pairing | 5 | 1023 | 1024 | 06 22.6 |
| `KIOSK_LIMIT` | 30 | device id | kiosk writes | 5 | 1025 | 1026 | 06 17 |
| `CAL_LIMIT` | 10 | token hash | `.ics` feeds | 6 | 1027 | 1028 | 06 17 |
| `SOURCE_LIMIT` | 30 | IP | Worker-proxied alerts and observations | 7 | 1029 | 1030 | 02 |

### 6.3 Variables and feature flags

Flags are strings `"1"` (on) and `"0"` (off), compared with `=== '1'`, so an unset flag is off.

| Var | Production | Previews | Phase | Read by | Owner |
| --- | --- | --- | --- | --- | --- |
| `APP_ENV` | `production` | `dev` | today | `/api/info`, email console fallback (`local`), dev-only routes | existing |
| `GITHUB_REPO` | `NeverNathaniel/RoWhether` | same | today | suggestions | existing |
| `REPORTS_ENABLED` | `"0"` until phase 3 ships, then `"1"` | `"1"` | 2 | `/api/info` `reports`, report routes | 08 |
| `AUTH_ENABLED` | `"1"` from phase 2; `"0"` to contain a breach (03 12.8) | `"1"` | 2 | `/api/auth/*`, `/api/info` `accounts` | 03 |
| `AUTH_HOSTS` | `rowhether.com` | the `dev` Preview host (to fill in; the subdomain is unverified) | 2 | passkey RP ID, cookie host | 03 5.7 |
| `EMAIL_FROM` | `RoWhether <signin@rowhether.com>` | same | 2 | account mail | 03 14.3 |
| `ALERTS_FROM` | `RoWhether <alerts@rowhether.com>` | same | 3 | notification mail | 05 2.2 |
| `EMAIL_DAILY_LIMIT` | the account's daily email quota once Cloudflare shows it; `"0"` means unknown and sets no cap | `"0"` | 3 | alert, digest and `system` email stop at 70% of it, keeping the rest for overdue mail and codes | 05 5.7 |
| `TERMS_VERSION` | `2026-11-01` (date of the published terms) | same | 2 | sign-up, the terms banner | 03 |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | the owner's Zero Trust values | the Preview application's values | 1 | `worker/auth/access.js` | 03 3.7 |
| `LOCATIONS_DB` | `"1"` from phase 3 | `"1"` from phase 3 | 3 | `/api/info` `locations` (01 14.10) | 08 |
| `PUBLIC_ORIGIN` | `https://rowhether.com` | the `dev` Preview URL | 3 | absolute links in mail and push (`navigate`) | 05 6.3 |
| `VAPID_SUBJECT` | `mailto:` plus the owner's address, or `https://rowhether.com/` | same | 4 | push JWT | 05 6.2 |
| `CLUBS_ENABLED` | `"0"` until the owner turns clubs on | `"1"` | 5 | `/api/info` `clubs`, club routes | 06 22.6 |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | secrets (6.5) | Turnstile's published testing keys as plain vars | 2 on Previews | sign-in, report and status link checks on dev. The suggestion form stays off on Previews, because it also needs `ANTHROPIC_API_KEY` and `GITHUB_TOKEN` (`configured()` in `worker/suggest.js`) | 03 6.3, 04 8.3 |

`/api/info` grows field by field, and every field is false or null on a host without the feature:

```json
{ "env": "production", "reports": true, "accounts": true, "locations": true,
  "clubs": false, "push": { "key": "<VAPID public key>" }, "turnstileKey": "<site key>" }
```

| Field | Rule | Phase |
| --- | --- | --- |
| `env` | `APP_ENV` | today |
| `reports` | `!!env.DB && env.REPORTS_ENABLED === '1'` (today `!!env.DB`) | today, flag from 2 |
| `accounts` | `!!env.DB && env.AUTH_ENABLED === '1'` and the host is in `AUTH_HOSTS` | 2 |
| `locations` | `!!env.DB && env.LOCATIONS_DB === '1'` | 3 |
| `turnstileKey` | `env.TURNSTILE_SITE_KEY` or null (the sign-in form needs it, 03 6.3) | 2 |
| `push` | `{ key }` when both VAPID secrets are set, else null | 4 |
| `clubs` | `!!env.DB && env.CLUBS_ENABLED === '1'` | 5 |

From phase 1, the app sends `?loc=<slug>&k=first|return&m=standalone|browser` with this request and the Worker writes one Analytics Engine data point (07 14.3; Decision in 10.9).

### 6.4 Other bindings

| Binding | Kind | Production | Previews | Phase | Owner |
| --- | --- | --- | --- | --- | --- |
| `ASSETS` | static assets, `run_worker_first: ["/api/*"]`; `not_found_handling: "single-page-application"` from phase 1 | yes | yes | today, 1 | existing, 01 7.3 |
| `DB` | D1 | `rowhether` | `rowhether-dev` | 2 (production) | 03, 04 |
| `OPENS` | Analytics Engine dataset `rowhether_opens` (`rowhether_opens_dev` on Previews) | yes | yes | 1 | 07 14.3 |
| `ANALYTICS_SQL` | Analytics SQL binding (`analytics`), needs wrangler 4.145.0 or later | yes | yes | 1 | 07 14.3 |
| `EMAIL` | `send_email` | yes | yes (to verified addresses only, 03 5.7) | 2 | 03 3.5 |
| `NOTIFY_QUEUE` | queue producer `rowhether-notify` (`rowhether-notify-dev` on Previews) | yes | yes (consumer behavior on Previews unverified) | 3 | 05 5.6 |
| Queue consumer | `rowhether-notify`, batch 25, timeout 5 s, 4 retries at 60 s, dead letters to `rowhether-notify-dlq` | yes | `rowhether-notify-dev` with `rowhether-notify-dev-dlq` | 3 | 05 5.6 |
| Cron triggers | `["* * * * *", "17 9 * * *"]` | yes | top level only (6.1) | 3 | 05 5.1 |
| `observability` | Workers Logs | on | on | today | existing |

### 6.5 Secrets

| Secret | Production | Previews | Phase | Owner |
| --- | --- | --- | --- | --- |
| `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` | yes | never | today | existing |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | yes | testing keys as vars (6.3) | today | existing |
| `AUTH_PEPPER` | yes | its own dev value | 2 | 03 14.3 |
| `IP_HASH_KEY` | yes | its own dev value | 3 | 04 3.3 |
| `NOTIFY_LINK_KEY` | yes | its own dev value | 4 | 05 7.6 |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | yes | their own pair | 4 | 05 6.2 |
| `OPEN_METEO_KEY` | yes (if the owner buys the plan) | never | 4 | 02 |
| `RESEND_API_KEY` | only if Resend is chosen over Email Service | never | 2 | 03 3.5 |

CLAUDE.md says "No secrets are set for Previews". 03 planned `AUTH_PEPPER` as a plain Preview var for that reason, while 05 planned Preview secrets for VAPID.

Decision: Previews get their own values for the four private keys that only protect dev data (`AUTH_PEPPER`, `IP_HASH_KEY`, `NOTIFY_LINK_KEY`, the VAPID pair), set as Preview secrets, never the production values, and never the keys that spend money or file issues. If Preview-only secrets cannot be set (how they are set is unverified; check the dashboard before phase 2), they fall back to plain vars in the `previews` block, which is acceptable because the dev database holds only test data, and push is then tested locally. The CLAUDE.md sentence changes with the owner's approval.
- Alternative: no secrets on Previews; accounts and push are tested only with `wrangler dev` (no testing on a phone over HTTPS before production).

Every secret is listed in `secrets.required` at the top level so `wrangler dev` warns when one is missing (the key exists in wrangler 4.149.0's schema, verified live 2026-10-18).

### 6.6 KV, the Cache API and D1 for caching

01 14.9 asked whether flow statistics are cached in the Cache API or KV.

Decision: No KV namespace. Worker-side data that must be the same everywhere and last for hours or days goes in D1 `source_cache` with an `expires_at`: CO-OPS and IWLS station lists (7 days), discovery results (24 hours), flow statistics per gauge (30 days, key `stats:<adapter>:<ref>:<measure>`), NWS ETags and backoffs, the cached VAPID header per push service (05 6.1). Short-lived copies of upstream responses for the notification engine use the Cache API (`caches.default`, 10 minutes, 05 5.3), where a miss in another data center costs one more fetch and nothing else.
- Alternative: Workers KV for the long-lived entries (built for this, but a second store, eventual consistency, and another binding per environment).
- Alternative: the Cache API for everything (per data center and emptied without notice, which makes 30-day statistics and rate-sensitive timestamps unreliable).

### 6.7 Target `wrangler.jsonc` by phase

Only what changes is shown. Ids written as `<...>` are created by the owner.

Phase 0: unchanged.

Phase 1:

```jsonc
"assets": { "directory": "./dist", "binding": "ASSETS", "run_worker_first": ["/api/*"],
            "not_found_handling": "single-page-application" },
"vars": { "GITHUB_REPO": "NeverNathaniel/RoWhether", "APP_ENV": "production",
          "ACCESS_TEAM_DOMAIN": "<team>.cloudflareaccess.com", "ACCESS_AUD": "<aud>" },
"analytics_engine_datasets": [{ "binding": "OPENS", "dataset": "rowhether_opens" }],
"analytics": { "binding": "ANALYTICS_SQL" },
"previews": {
  "vars": { "GITHUB_REPO": "NeverNathaniel/RoWhether", "APP_ENV": "dev",
            "ACCESS_TEAM_DOMAIN": "<team>.cloudflareaccess.com", "ACCESS_AUD": "<preview aud>" },
  "analytics_engine_datasets": [{ "binding": "OPENS", "dataset": "rowhether_opens_dev" }],
  "analytics": { "binding": "ANALYTICS_SQL" }
  // ratelimits and d1_databases as today
}
```

Phase 2 adds:

```jsonc
"d1_databases": [{ "binding": "DB", "database_name": "rowhether", "database_id": "<prod id>", "migrations_dir": "migrations" }],
"send_email": [{ "name": "EMAIL" }],
"secrets": { "required": ["ANTHROPIC_API_KEY", "GITHUB_TOKEN", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "AUTH_PEPPER"] },
// vars gain: "REPORTS_ENABLED": "0", "AUTH_ENABLED": "1", "AUTH_HOSTS": "rowhether.com",
//            "EMAIL_FROM": "RoWhether <signin@rowhether.com>", "TERMS_VERSION": "2026-11-01"
"ratelimits": [
  { "name": "SUGGEST_LIMIT", "namespace_id": "1001", "simple": { "limit": 3, "period": 60 } },
  { "name": "REPORT_LIMIT", "namespace_id": "1003", "simple": { "limit": 3, "period": 60 } },
  { "name": "AUTH_LIMIT", "namespace_id": "1011", "simple": { "limit": 10, "period": 60 } },
  { "name": "CODE_LIMIT", "namespace_id": "1013", "simple": { "limit": 3, "period": 60 } }
],
"previews": {
  // vars gain "REPORTS_ENABLED": "1", "AUTH_ENABLED": "1", "AUTH_HOSTS": "<dev preview host>", the same EMAIL_FROM and TERMS_VERSION,
  // and Turnstile's testing keys as TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY
  "send_email": [{ "name": "EMAIL" }],
  "ratelimits": [ /* 1002, 1004, then AUTH_LIMIT 1012, CODE_LIMIT 1014 */ ]
}
```

Phase 3 adds:

```jsonc
// vars gain "LOCATIONS_DB": "1", "ALERTS_FROM": "RoWhether <alerts@rowhether.com>", "PUBLIC_ORIGIN": "https://rowhether.com";
// REPORTS_ENABLED becomes "1" when phase 3 ships
"triggers": { "crons": ["* * * * *", "17 9 * * *"] },
"queues": {
  "producers": [{ "binding": "NOTIFY_QUEUE", "queue": "rowhether-notify" }],
  "consumers": [{ "queue": "rowhether-notify", "max_batch_size": 25, "max_batch_timeout": 5,
                  "max_retries": 4, "retry_delay": 60, "dead_letter_queue": "rowhether-notify-dlq" }]
},
// ratelimits gain LOCATION_LIMIT 1005, DISCOVER_LIMIT 1007, HAZARD_LIMIT 1009, FLAG_LIMIT 1015, OUTING_LIMIT 1017
"previews": {
  // vars gain "LOCATIONS_DB": "1", "ALERTS_FROM", "PUBLIC_ORIGIN": "<dev preview URL>"
  "queues": { "producers": [{ "binding": "NOTIFY_QUEUE", "queue": "rowhether-notify-dev" }],
              "consumers": [{ "queue": "rowhether-notify-dev", "max_batch_size": 25, "max_batch_timeout": 5,
                              "max_retries": 4, "retry_delay": 60, "dead_letter_queue": "rowhether-notify-dev-dlq" }] }
  // ratelimits gain 1006, 1008, 1010, 1016, 1018
}
```

Phase 4 adds `NOTIFY_LIMIT` (1019, 1020) and `VAPID_SUBJECT` in both blocks. Phase 5 adds `CLUBS_ENABLED` (`"0"` at the top, `"1"` in Previews), `CLUB_LIMIT` (1021, 1022), `JOIN_CODE_LIMIT` (1023, 1024) and `KIOSK_LIMIT` (1025, 1026). Phase 6 adds `CAL_LIMIT` (1027, 1028). Phase 7 adds `SOURCE_LIMIT` (1029, 1030). `npx wrangler deploy --dry-run` lists every binding without a login (verified live 2026-10-18 with today's file), so CI checks each phase's file (13.6).

## 7. API

### 7.1 Conventions

| Topic | Rule | Phase |
| --- | --- | --- |
| Origin | Same origin only. No route sends CORS headers, and the Worker answers a cross-origin preflight (`OPTIONS`) with 405. A static host has no `/api`, and every feature that needs it hides itself. | today |
| Methods | `GET` never changes state; the token links in 7.4 open a page with a button that posts. Writes are `POST`, `PUT` (replace), `PATCH` (change some fields) or `DELETE`. Wrong method: 405 with `Allow`. | today |
| Request bodies | `Content-Type: application/json`, else 415 `bad_type`. The two exceptions take the form posts their own pages send: `POST /api/notify/unsubscribe` (RFC 8058 one-click, `List-Unsubscribe=One-Click`) and `POST /api/contacts/stop`. Body cap 64 KB for every route, checked from `Content-Length` and while reading, else 413 `too_large`. Field limits are in the owning document. | 2 |
| Response bodies | JSON objects with a named top-level key (`{ "location": ... }`, `{ "reports": [...] }`), never a bare array. Create: 201 with the new object. Delete and fire-and-forget writes: 204 or 200 `{ "ok": true }`, as the owning document says. Calendar feeds, CSV exports and the token pages are the only non-JSON answers. | today |
| Names and values | camelCase keys, times in ms, ids as strings, local dates as `YYYY-MM-DD`, booleans as `true`/`false` (D1's 0 and 1 are converted in each area's `toApi`). | today |
| Errors | `{ "error": "code", "message": "Human sentence.", ...fields }` with the shared codes in 7.2. The message is shown to the person as is, so it follows the copy rules. | today |
| Pagination | Cursor, never offset: `?before=<cursor>&limit=<n>`, answer `{ "<items>": [...], "next": <cursor or null> }`. The cursor is the sort key of the last item (`created_at` ms, or a revision number). Default and max limit are per route (20 to 100). | 2 |
| Caching | `Cache-Control: no-store` by default. Public reads that are the same for everyone say so: location list and search `public, max-age=300`, one location `public, max-age=60`, Worker-proxied alerts and observations `public, s-maxage=300`, the public club calendar `public, max-age=900`, personal calendar feeds `private, max-age=900` with an `ETag`. Anything that varies by session is `no-store`, including club and location reads when a session is present. | today |
| Session | Cookie `__Host-rw_session` (03 5.1): `Path=/; Max-Age=15552000; HttpOnly; Secure; SameSite=Lax`. Loaded only by routes that need it. `GET /api/me` answers `{ "user": null }` when signed out, never 401 (03 5.3). | 2 |
| Kiosk | Cookie `rw_kiosk` (06 8.5): `HttpOnly; Secure; SameSite=Strict; Path=/api/; Max-Age=15552000`. No `__Host-` prefix, because that prefix requires `Path=/`. Read only by kiosk routes. | 5 |
| CSRF | Every `POST`, `PUT`, `PATCH` and `DELETE` must carry an `Origin` header equal to the request's own origin, else 403 `bad_origin`, plus the JSON content type (a cross-site form cannot send it without a preflight). `SameSite=Lax` on the session cookie is the second lock. The two form posts in the body rule are exempt from the JSON rule, and `POST /api/notify/unsubscribe` is also exempt from the `Origin` rule, because mail clients send the one-click post from their own servers (RFC 8058). Both act only on the token they carry, never on a session (10.2). | 2 |
| Rate limits | Each write names its binding in 7.3. Over the limit: 429 `rate_limited` with `Retry-After: 60`. Daily caps are D1 counts in the owning document, answered 429 `daily_limit`. | today |
| Feature off | A route whose feature is off on this host answers 404 with `accounts_off`, `reports_off` or `clubs_off`, and the app has already hidden its entry points from `/api/info`. `AUTH_ENABLED = "0"` on a host that has accounts answers 503 `accounts_off` (03 16.1). | 2 |
| Not found | Any other `/api/` path: 404 `{ "error": "not_found", "message": "Not found." }`. Today it is the text "Not found"; it becomes JSON with `worker/http.js` in phase 2. | today, 2 |
| Versioning | None. The app and the Worker deploy together from one commit. An installed app with an older shell keeps working because new fields are additive and removed routes return 404 JSON, which every caller handles as "not available". | today |
| Logging | Route, status, time taken and the error code. Never bodies, emails, tokens, IPs or user ids (10.10). | today |

### 7.2 Shared errors

| Status | `error` | Message (default) | Owner |
| --- | --- | --- | --- |
| 400 | `bad_request` | "That did not send. Try again." (body not JSON) | `worker/reports.js` |
| 400 | `invalid` with `field` | Per field, for example "Use 2 to 40 characters for your name." | 03 16.1 |
| 401 | `sign_in` | Per action, for example "Sign in to start a row." | 04, 06 (conflict K46) |
| 403 | `bad_origin` | "That request came from another site." | 03 16.1 |
| 403 | `recent_auth` | "Confirm it's you first." | 03 16.1 |
| 403 | `passkey_session` | "Moderator tools need a passkey sign-in." | 03 16.1 |
| 403 | `suspended` | "Your account is paused until November 1, so you cannot post." | 03 16.1 |
| 403 | `not_allowed` | "You cannot do that." | 03, 04, 06 |
| 403 | `verification_failed` | "The spam check did not pass. Try again." | `worker/suggest.js` |
| 404 | `not_found` | "Not found." or the area's sentence ("No location at that address.") | 01, 08 |
| 404 | `accounts_off`, `reports_off`, `clubs_off` | "Accounts are not available here." and the same for each feature | 03, 08 |
| 405 | `method_not_allowed` | "That method is not allowed here." with `Allow` | 08 |
| 409 | `conflict` | Per area, with the current revision | 01, 06 |
| 413 | `too_large` | "That is too large to send." | 08 |
| 415 | `bad_type` | "Send JSON." | 03 16.1 |
| 429 | `rate_limited` | "Too many tries. Wait a minute and try again." | 03, 04 |
| 429 | `daily_limit` | Per area | 04 |
| 502 | `unavailable` | "Could not do that right now. Try again later." (an upstream such as Claude, GitHub or a data source failed) | `worker/suggest.js` |
| 503 | `not_configured` | "Dock reports are not set up here." (a binding or secret is missing) | `worker/reports.js` |

### 7.3 Every route

Auth words: **none** (anyone); **session** (signed in); **recent** (session with a sign-in in the last 10 minutes, 03 5.4); **mod** (site role moderator or admin in a passkey session, 03 10); **admin** (site role admin, passkey session and Cloudflare Access); **owner** (Cloudflare Access only, phase 1, then admin); **token** (a capability token in the path or query); **Turnstile** (a Turnstile token in the body); **club roles** (06 5.3 through `requireCan`); **kiosk** (the `rw_kiosk` cookie). Rate limit names are the bindings in 6.2; "D1" means a count in D1 only.

Today and phase 1:

| Method | Path | Auth | Rate limit | Phase | Owner |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/info` (`?loc=&k=&m=` from phase 1) | none | none | today, 1 | existing, 07 14.3 |
| GET | `/api/suggest` | none | none | today | existing |
| POST | `/api/suggest` | Turnstile | `SUGGEST_LIMIT` | today | existing |
| GET | `/api/reports` | none | none | today; alias until 4 | existing, 04 3.9 |
| POST | `/api/reports` | none (Turnstile from 3) | `REPORT_LIMIT` | today; alias until 4 | existing, 04 3.9 |
| GET | `/api/admin/metrics?days=7` | owner | none | 1 | 07 14.5, 08 |

Phase 1 adds no other route. Locations are static files: `/locations/index.json` and `/locations/<slug>.json` (01 14.10). Discovery and flow statistics are scripts (5.6).

Accounts (phase 2, owner 03 16 unless noted):

| Method | Path | Auth | Rate limit | Phase |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/code` | Turnstile (sign in); session (reauth) | `AUTH_LIMIT`, `CODE_LIMIT`, D1 per address | 2 |
| POST | `/api/auth/code/verify` | code id | `AUTH_LIMIT`, D1 attempts | 2 |
| POST | `/api/auth/signup` | ticket | `AUTH_LIMIT` | 2 |
| POST | `/api/auth/passkey/options` | none; session for reauth | `AUTH_LIMIT` | 2 |
| POST | `/api/auth/passkey/verify` | challenge id | `AUTH_LIMIT` | 2 |
| POST | `/api/auth/signout` | none | `AUTH_LIMIT` | 2 |
| POST | `/api/auth/signout-all` | session | `AUTH_LIMIT` | 2 |
| POST | `/api/auth/revert` | token | `AUTH_LIMIT` | 2 |
| GET | `/api/me` | none (`{ "user": null }` signed out) | none | 2 |
| PATCH | `/api/me` | session | `AUTH_LIMIT` | 2 |
| POST | `/api/me/terms` | session | `AUTH_LIMIT` | 2 |
| GET | `/api/me/passkeys` | session | none | 2 |
| POST | `/api/me/passkeys/options` | recent (or within 10 minutes of sign-up) | `AUTH_LIMIT` | 2 |
| POST | `/api/me/passkeys` | recent | `AUTH_LIMIT` | 2 |
| PATCH, DELETE | `/api/me/passkeys/:id` | session; recent for DELETE | `AUTH_LIMIT` | 2 |
| GET | `/api/me/sessions` | session | none | 2 |
| DELETE | `/api/me/sessions/:id` | session | `AUTH_LIMIT` | 2 |
| POST | `/api/me/email` | recent, Turnstile | `CODE_LIMIT`, D1 3 a day | 2 |
| POST | `/api/me/email/verify` | session | `AUTH_LIMIT` | 2 |
| GET | `/api/me/activity` | session | none | 2 |
| GET, PUT | `/api/me/settings` | session | `AUTH_LIMIT` on PUT | 2 |
| GET, PUT | `/api/me/favorites` | session | `AUTH_LIMIT` on PUT | 2 |
| GET | `/api/me/export` | recent | D1 once per 10 minutes | 2 |
| GET | `/api/me/delete` | session | none | 2 |
| POST | `/api/me/delete` | recent | `AUTH_LIMIT` | 2 |
| GET | `/api/admin/users?q=`, `/api/admin/users/:id` | admin | none | 2 |
| POST | `/api/admin/users/:id/role`, `/delete`, `/age` | admin, recent | none | 2 |
| POST | `/api/admin/users/:id/suspend`, `/unsuspend` | admin (recent over 30 days) | none | 2 |
| GET | `/api/admin/audit?kind=&before=&limit=` | admin | none | 2 |
| POST | `/api/mod/users/:id/name-reset`, `/api/mod/users/:id/suspend` | mod | none | 2 |

Locations and sources (phase 3, owner 01 14 and 02):

| Method | Path | Auth | Rate limit | Phase |
| --- | --- | --- | --- | --- |
| GET | `/api/locations?near=` or `?q=` | none | none (cached) | 3 |
| GET | `/api/locations/:slug` | none (drafts: creator and mods) | none (cached) | 3 |
| POST | `/api/locations` | session, standing (01 12.1) | `LOCATION_LIMIT`, D1 3 a day | 3 |
| PATCH | `/api/locations/:slug` | session (suggest), curator or mod (apply); steward club safety for `emergency` from 5 | `LOCATION_LIMIT` | 3 |
| PUT | `/api/locations/:slug/sources` | curator or mod | `LOCATION_LIMIT` | 3 (02 planned 1) |
| GET | `/api/locations/:slug/revisions` | none (pending: curators and mods) | none | 3 |
| POST | `/api/locations/:slug/revisions/:id/decision` | curator or mod | `LOCATION_LIMIT` | 3 |
| POST | `/api/locations/:slug/restore`, `/verify`, `/archive`, `/merge` | mod (verify: mod or steward from 5) | `LOCATION_LIMIT` | 3 |
| POST | `/api/locations/:slug/claim` | session, club admin | `CLUB_LIMIT` | 5 |
| GET | `/api/waterways?near=`, `/api/waterways/:id` | none | none (cached) | 3 |
| POST | `/api/waterways` | session | `LOCATION_LIMIT` | 3 |
| PATCH | `/api/waterways/:id` | mod; steward club for `traffic` and `notes` | `LOCATION_LIMIT` | 3 |
| GET | `/api/discover?lat=&lon=&water=` | session | `DISCOVER_LIMIT` | 3 (02 planned 1) |
| GET | `/api/sources/stats?adapter=&ref=&measure=` | session | `DISCOVER_LIMIT` | 3 |
| GET | `/api/locations/:slug/alerts`, `/api/locations/:slug/obs` | none | `SOURCE_LIMIT` | 7 |

02's `POST /api/locations/:slug/flow-stats` is not built: statistics come from `GET /api/sources/stats`, cached 30 days in `source_cache`, and a curator who wants fresh numbers passes `&fresh=1` (conflict K6). 02's `/api/wx`, `/api/aq` and `/api/models` exist only if the commercial case in 02 ever applies.

Reports, hazards, outings, moderation (phase 3, owner 04 10):

| Method | Path | Auth | Rate limit | Phase |
| --- | --- | --- | --- | --- |
| GET | `/api/locations/:slug/reports` | none | none | 3 |
| POST | `/api/locations/:slug/reports` | Turnstile, or session | `REPORT_LIMIT`, D1 20 a day | 3 |
| DELETE | `/api/reports/:id` | author or mod | `FLAG_LIMIT` | 3 |
| GET | `/api/admin/reports.csv`, `/api/admin/reports/agreement` | owner or mod | none | 3 |
| GET | `/api/locations/:slug/hazards`, `/api/waterways/:id/hazards` | none | none | 3 |
| POST | `/api/hazards` | session | `HAZARD_LIMIT`, D1 10 a day | 3 |
| PATCH | `/api/hazards/:id` | author or mod | `HAZARD_LIMIT` | 3 |
| POST | `/api/hazards/:id/votes` | session | `HAZARD_LIMIT`, D1 50 a day | 3 |
| POST | `/api/hazards/:id/end` | author, club safety (5), mod | `HAZARD_LIMIT` | 3 |
| POST | `/api/outings` | session (06 adds crew and club fields) | `OUTING_LIMIT`, D1 20 a day | 3 |
| PATCH | `/api/outings/:id` | rower; club staff from 5 | `OUTING_LIMIT` | 3 |
| POST | `/api/outings/:id/in`, `/api/outings/:id/cancel` | rower; club staff from 5 | `OUTING_LIMIT` | 3 |
| DELETE | `/api/outings/:id` | rower | `OUTING_LIMIT` | 3 |
| GET | `/api/me/outings`, `/api/me/outings.csv` | session | none | 3 |
| GET, PUT | `/api/me/contacts` | session | `OUTING_LIMIT` on PUT | 3 |
| POST | `/api/me/contacts/:id/test` | session | `OUTING_LIMIT`, D1 3 a day | 3 |
| GET | `/api/contacts/stop?t=` | token | `FLAG_LIMIT` (IP) | 3 |
| POST | `/api/contacts/stop?t=` | token (form post) | `FLAG_LIMIT` (IP) | 3 |
| GET | `/api/outings/status/:token` | token | `FLAG_LIMIT` (IP) | 3 |
| POST | `/api/outings/status/:token/safe` | token, Turnstile | `FLAG_LIMIT` (IP) | 3 |
| POST | `/api/flags` | session | `FLAG_LIMIT`, D1 30 a day | 3 |
| GET | `/api/admin/queue` | mod | none | 3 |
| POST | `/api/admin/queue/:type/:id/decision` | mod | none | 3 |

Notifications (owner 05 9):

| Method | Path | Auth | Rate limit | Phase |
| --- | --- | --- | --- | --- |
| POST | `/api/push/subscriptions` | session | `NOTIFY_LIMIT` | 4 |
| DELETE | `/api/push/subscriptions/:id` | session, owner of the row | `NOTIFY_LIMIT` | 4 |
| POST | `/api/push/unsubscribe` | none (the endpoint is the proof) | `NOTIFY_LIMIT` (IP) | 4 |
| POST | `/api/push/test` | session | `NOTIFY_LIMIT`, D1 5 an hour | 4 |
| GET | `/api/me/notify` | session | none | 4 |
| POST | `/api/me/notify/prefs` | session | `NOTIFY_LIMIT` | 4 |
| PATCH, DELETE | `/api/me/notify/prefs/:id` | session | `NOTIFY_LIMIT` | 4 |
| PUT | `/api/me/notify/settings` | session | `NOTIFY_LIMIT` | 4 |
| GET | `/api/me/notifications?before=&limit=` | session | none | 4 |
| POST | `/api/me/notifications/read` | session | `NOTIFY_LIMIT` | 4 |
| POST | `/api/notify/opened` | session | `NOTIFY_LIMIT` | 4 |
| GET | `/api/notify/unsubscribe?t=` | token (HTML page) | `FLAG_LIMIT` (IP) | 4 |
| POST | `/api/notify/unsubscribe?t=` | token (one-click) | `FLAG_LIMIT` (IP) | 4 |
| POST | `/api/admin/tick` | owner; Previews and local only (`APP_ENV` not `production`) | none | 3 |
| GET | `/api/admin/notify/stats?days=7` | owner | none | 3 |

Clubs (phase 5, owner 06 19.1). Every write here uses `CLUB_LIMIT` unless the row says otherwise.

| Method | Path | Auth | Rate limit | Phase |
| --- | --- | --- | --- | --- |
| GET | `/api/clubs?near=` or `?q=` or `?location=` | none | none | 5 |
| POST | `/api/clubs` | session, standing (06 3.2) | `CLUB_LIMIT` | 5 |
| GET, PATCH | `/api/clubs/:slug` | none (shaped by role); PATCH admin | `CLUB_LIMIT` | 5 |
| POST, DELETE | `/api/clubs/:slug/locations`, `/api/clubs/:slug/locations/:location` | club admin | `CLUB_LIMIT` | 5 |
| POST | `/api/clubs/:slug/verify`, `/api/clubs/:slug/verify/check` | club admin | `CLUB_LIMIT`, D1 5 code tries | 5 |
| POST | `/api/admin/clubs/:slug/review`, `/suspend`, `/restore` | mod | none | 5 |
| POST | `/api/clubs/:slug/delete`, `/api/clubs/:slug/delete/cancel` | club admin, recent | `CLUB_LIMIT` | 5 |
| GET | `/api/clubs/:slug/export`, `/api/clubs/:slug/export.csv?table=` | club admin (incidents: 06 16.2) | none | 5 |
| GET | `/api/me/clubs` | session | none | 5 |
| GET, POST | `/api/clubs/:slug/members` | members (shaped); POST coach, admin | `CLUB_LIMIT` | 5 |
| PATCH, DELETE | `/api/clubs/:slug/members/:id` | per field (06 19.1); DELETE admin | `CLUB_LIMIT` | 5 |
| PATCH | `/api/clubs/:slug/me` | member | `CLUB_LIMIT` | 5 |
| POST | `/api/clubs/:slug/leave` | member | `CLUB_LIMIT` | 5 |
| POST | `/api/clubs/:slug/requests` | session, adult | `CLUB_LIMIT` | 5 |
| GET | `/api/clubs/:slug/requests` | club admin | none | 5 |
| POST | `/api/clubs/:slug/requests/:id` | club admin | `CLUB_LIMIT` | 5 |
| GET, POST | `/api/clubs/:slug/invites` | coach (limited), admin | `CLUB_LIMIT` | 5 |
| DELETE | `/api/clubs/:slug/invites/:id` | coach, admin | `CLUB_LIMIT` | 5 |
| GET | `/api/invites/:token` | token | `JOIN_CODE_LIMIT` (IP) | 5 |
| POST | `/api/invites/:token/accept` | session, token | `CLUB_LIMIT` | 5 |
| POST | `/api/invites/code` | session | `JOIN_CODE_LIMIT` (IP), D1 20 a day | 5 |
| POST | `/api/me/juniors/:membershipId/approve` | linked guardian, recent | `CLUB_LIMIT` | 5 |
| GET, POST | `/api/clubs/:slug/groups` | coach, admin | `CLUB_LIMIT` | 5 |
| PATCH, DELETE | `/api/clubs/:slug/groups/:id` | coach, admin | `CLUB_LIMIT` | 5 |
| GET | `/api/clubs/:slug/rules` | members; public summary when `rulesPublic` | none | 5 |
| PUT | `/api/clubs/:slug/rules` | safety, admin | `CLUB_LIMIT` | 5 |
| GET | `/api/locations/:slug/club-context?rev=` | session | none | 5 |
| GET | `/api/clubs/:slug/status` | members; public line when `statusPublic` | none | 5 |
| POST | `/api/clubs/:slug/status`, `/api/clubs/:slug/status/:id/clear` | coach, safety, admin | `CLUB_LIMIT` | 5 |
| GET | `/api/clubs/:slug/board` | members, kiosk | none | 5 |
| POST | `/api/clubs/:slug/board/:outingId/ack`, `/resolve` | coach, safety, admin; kiosk for staff actions 06 allows | `CLUB_LIMIT`; `KIOSK_LIMIT` from a kiosk | 5 |
| POST, DELETE | `/api/clubs/:slug/devices`, `/api/clubs/:slug/devices/:id` | club admin | `CLUB_LIMIT` | 5 |
| POST | `/api/kiosk/pair` | pairing code | `JOIN_CODE_LIMIT` (IP) | 5 |
| GET | `/api/kiosk/roster` | kiosk | `KIOSK_LIMIT` | 5 |
| GET, POST | `/api/clubs/:slug/incidents` | filing: members, guardians, staff; listing: safety, admin, own | `CLUB_LIMIT` | 5 |
| GET, PATCH, DELETE | `/api/clubs/:slug/incidents/:id` | safety, admin; own for reading | `CLUB_LIMIT` | 5 |
| POST | `/api/clubs/:slug/incidents/:id/share` | safety, admin | `CLUB_LIMIT` | 5 |
| GET | `/api/clubs/:slug/incidents.csv?from=&to=&names=0` | safety, admin | none | 5 |
| POST | `/api/me/guardians/invite` | session (junior), Turnstile | `CODE_LIMIT` | 5 (03 16.7) |
| POST | `/api/me/guardian-code` | session (adult) | `AUTH_LIMIT` | 5 (03 16.7) |
| POST | `/api/me/guardians/accept` | recent | `AUTH_LIMIT`, D1 5 an hour | 5 (03 16.7) |
| GET | `/api/me/guardians` | session | none | 5 (03 16.7) |
| PATCH, DELETE | `/api/me/juniors/:linkId` | guardian, recent | `AUTH_LIMIT` | 5 (03 16.7) |
| DELETE | `/api/me/guardians/:linkId` | session (junior), recent | `AUTH_LIMIT` | 5 (03 16.7) |
| GET | `/api/me/juniors/:userId/activity?before=` | guardian | none | 5 (03 16.7) |

Club operations (phase 6, owner 06 19.2):

| Method | Path | Auth | Rate limit | Phase |
| --- | --- | --- | --- | --- |
| GET, POST | `/api/clubs/:slug/boats` | 06 5.3 | `CLUB_LIMIT` | 6 |
| GET, PATCH | `/api/clubs/:slug/boats/:id` | 06 5.3 | `CLUB_LIMIT` | 6 |
| GET, POST | `/api/clubs/:slug/damage` | 06 5.3 | `CLUB_LIMIT` | 6 |
| PATCH | `/api/clubs/:slug/damage/:id` | 06 5.3 | `CLUB_LIMIT` | 6 |
| GET, POST | `/api/clubs/:slug/bookings` | members | `CLUB_LIMIT` | 6 |
| PATCH | `/api/clubs/:slug/bookings/:id` | member (own), equipment, admin | `CLUB_LIMIT` | 6 |
| GET | `/api/clubs/:slug/availability?start=&end=&class=` | members | none | 6 |
| GET, POST | `/api/clubs/:slug/practices` | members (filtered), public practices for anyone; POST coach, admin | `CLUB_LIMIT` | 6 |
| PATCH, DELETE | `/api/clubs/:slug/practices/:id?scope=one` or `?scope=following` | coach, admin | `CLUB_LIMIT` | 6 |
| POST | `/api/clubs/:slug/practices/:id/cancel`, `/land`, `/decide` | coach, admin | `CLUB_LIMIT` | 6 |
| PUT | `/api/clubs/:slug/practices/:id/rsvp` | member, junior, guardian | `CLUB_LIMIT` | 6 |
| GET, PUT | `/api/clubs/:slug/practices/:id/attendance` | coach, safety (read), admin | `CLUB_LIMIT` | 6 |
| GET, POST | `/api/clubs/:slug/practices/:id/lineups` | coach, admin; members see published | `CLUB_LIMIT` | 6 |
| PATCH, DELETE | `/api/clubs/:slug/lineups/:id` | coach, admin | `CLUB_LIMIT` | 6 |
| POST | `/api/clubs/:slug/practices/:id/lineups/publish` | coach, admin | `CLUB_LIMIT` | 6 |
| GET, POST | `/api/me/calendar-links` | session | `CLUB_LIMIT` | 6 |
| DELETE | `/api/me/calendar-links/:id` | session | `CLUB_LIMIT` | 6 |
| GET | `/api/cal/:token.ics` | token | `CAL_LIMIT` | 6 |
| GET | `/api/clubs/:slug/public.ics` | none | `CAL_LIMIT` (IP) | 6 |
| GET, POST | `/api/clubs/:slug/announcements` | 06 5.3 | `CLUB_LIMIT` | 6 |
| DELETE | `/api/clubs/:slug/announcements/:id` | 06 5.3 | `CLUB_LIMIT` | 6 |
| GET | `/api/clubs/:slug/attendance.csv?from=&to=` | coach, admin | none | 6 |

### 7.4 Pages the Worker serves

Two links in email open a page from the Worker, not the app, and must work in any mail client's browser without JavaScript. The third is an app page:

| Path | Shows | The button posts to | Owner |
| --- | --- | --- | --- |
| `GET /api/notify/unsubscribe?t=` | "Stop these emails?" with one button | `POST /api/notify/unsubscribe?t=` | 05 7.6 |
| `GET /api/contacts/stop?t=` | "Stop emails about Alex's rows?" with one button | `POST /api/contacts/stop?t=` | 04 6.1 |
| `/o/<token>` (an app route that reads `GET /api/outings/status/:token`) | The status link page | `POST /api/outings/status/:token/safe` | 04 6.3 |

A `GET` never acts, because mail scanners follow links (conflict K36). The two Worker pages are small HTML strings in the Worker with `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and a CSP of `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'`.

### 7.5 Synced settings keys

`src/settings-keys.js` (phase 2, 03 9.2) is the one list of keys the Worker accepts in `PUT /api/me/settings`. It is the union of 03 9.1 and 07 8:

| Scope | Keys | Value | Phase used | Owner |
| --- | --- | --- | --- | --- |
| `loc:<location id>` | `windCaution`, `windOff`, `gustCaution`, `gustOff`, `rainCaution`, `rainOff`, `coldCombined`, `flowCaution`, `flowOff`, `aqiCaution`, `aqiOff` | number, `""` (level off) or null (back to the location default) | 2 | 01 11.1, 03 9.1 |
| `loc:<location id>` | `streamCaution`, `streamOff`, `minLaunch`, `levelLow`, `levelHigh` | same | 2 (shown only where the location has the source) | 01 11.1 |
| `loc:<location id>` | `heading`, `waterOverride`, `saved` | number or `""` | 2 | 01 8.6, 03 9.1 |
| `loc:<location id>` | `useClubRules` | boolean | 5 | 01 11.7 |
| `loc:<location id>` | `activeSet` | `1` to `6` or null | 2 | 07 8.4 |
| `global` | `plan` | `{ minutes, when }` | 2 | 03 9.1 |
| `global` | `notify` | `{ quietFrom, quietTo, tz, emailFallback }` | 4 | 05 4.4 |
| `global` | `windUnit`, `clock` | `"mph"`, `"kmh"`, `"kn"`, `"ms"`; `"12"`, `"24"` | 2 | 07 7.1 |
| `global` | `set1` to `set6` | `{ name, values }`, at most 500 characters each | 2 | 07 8.4 |

Units (`system`) is a profile column, `users.units` (03 7), not a settings key.

## 8. Client storage and the service worker

### 8.1 Rules

- `localStorage` only. No IndexedDB, no `sessionStorage`, no cookies written by script. Every access is in try/catch and every screen renders when storage is empty or throws (CLAUDE.md).
- Keys live in one object, `KEYS` in `src/config.js`, from phase 0. Only `src/storage.js` and the lazy modules that own a key touch `localStorage`, each through a small guarded `read(key, fallback)` and `write(key, value)` pair.
- Names: `rowhether-<name>-v<n>`, with `:<slug>` for per-location entries. A breaking change to a value's shape bumps `v<n>` and migrates once.
- Nothing personal beyond what the person typed or chose on this device. No email, no tokens (the session cookie is `HttpOnly`), no other people's data except a club board's first names (06 8.4).
- Budget: under 1 MB in all, against a 5 MiB browser limit (07 9.3).

### 8.2 Canonical keys

| Key | Phase | Content | Replaces | Owner |
| --- | --- | --- | --- | --- |
| `rowhether-settings-v2` | 0 | `{ "<slug>": { "saved", "values" } }`; phase 2 adds `id` and the `t` map of edit times | `putney-rowing-settings-v1` | 01 8.6, 03 9.2 |
| `rowhether-cache-v2:<slug>` | 0 | `{ data, updated }`, the last good data per location; quick looks use `at:<lat>,<lon>` as the slug | `putney-rowing-cache-v1` | 01 8.6, 07 9.2 |
| `rowhether-plan-v1` | 0 | `{ minutes, when }` | `putney-rowing-plan-v1` | 01 8.6 |
| `rowhether-install-v1` | 0 | `{ dismissed, never }`, as the install bar uses today | `putney-rowing-install-v2` (the v1 snooze is ignored, as today) | 01 8.6, `src/install.js` |
| `rowhether-nudge-v1` | 0 | `"1"` when the Settings reminder was dismissed | `putney-rowing-nudge-v1` | 01 8.6 |
| `rowhether-migrated-v1` | 0 | `"1"` once `migrateStorage()` has run | | 01 8.6 |
| `rowhether-last-v1` | 0 (written), 1 (read) | Last location slug | | 01 8.6 |
| `rowhether-loc-v1:<slug>` | 1 | `{ record, fetchedAt }` | | 01 8.6 |
| `rowhether-cache-index-v1` | 1 | `{ "<slug>": <last opened ms> }`, for the 10-location cap | | 07 9.2 |
| `rowhether-recent-v1` | 1 | Up to 8 slugs, newest first | | 01 8.6 |
| `rowhether-pickhint-v1` | 1 | Set when "Not your water?" was dismissed | | 07 5.1 |
| `rowhether-units-v1` | 2 | `{ system, wind, clock }` | | 07 7.1 |
| `rowhether-sets-v1` | 2 | The viewer's limit sets | | 07 8.4 |
| `rowhether-me-v1` | 2 | `{ id, displayName, siteRole, junior, fetchedAt }` | | 03 |
| `rowhether-sync-v1` | 2 | `{ userId, since, outbox }` | | 03 9 |
| `rowhether-favorites-v1` | 2 | `{ ids, t }` | | 03 8 |
| `rowhether-passkey-offer-v1` | 2 | ms of the last passkey offer | | 03 4.3 |
| `rowhether-agegate-v1` | 2 | ms of an under-13 refusal | | 03 11.2 |
| `rowhether-add-draft-v1` | 3 | The add flow's draft | | 01 12.2 |
| `rowhether-report-more-v1` | 3 | Report dialog "More" open or closed | | 04 3.2 |
| `rowhether-report-geo-v1` | 3 | "Check that I am at the dock" on or off | | 04 3.2 |
| `rowhether-outbox-v1` | 3 | Up to 20 queued writes, 24 hours each | | 04 3.10 (`src/outbox.js`) |
| `rowhether-outing-last-v1` | 3 | Last boat, seats and direction per location | | 04 5.2 |
| `rowhether-info-seen-v1` | 3 | Up to 50 slugs whose Info tab was opened | | 07 4.6 |
| `rowhether-notify-nudge-v1` | 4 | ms of the "Get this every evening" dismissal | | 05 7.1, 07 |
| `rowhether-push-endpoint-v1` | 4 | SHA-256 of this device's last push endpoint | | 05 7.3 |
| `rowhether-club-v1` | 5 | `{ [locationSlug]: { fetchedAt, rev, clubs } }` | | 06 6.9 (`src/club-context.js`) |
| `rowhether-board-v1` | 5 | The last board viewed | | 06 8.4 |
| `rowhether-incident-draft-v1` | 5 | The incident form's draft | | 06 9.2 |

### 8.3 Migration from `putney-rowing-*`

`migrateStorage()` in `src/storage.js`, phase 0, follows 01 8.6 with two changes: the install key, and the write rule below.

| Step | Read | Write |
| --- | --- | --- |
| 1 | `rowhether-migrated-v1` | Stop if present |
| 2 | `putney-rowing-settings-v1` | `rowhether-settings-v2` with Putney's overrides only (01 8.6 step 2) and `saved: Date.now()`. `waterOverride`, typed text today (`"55"`), becomes a number (`parseFloat`, as `waterOverridden()` reads it), and text that is not a number is dropped |
| 3 | `putney-rowing-cache-v1` | `rowhether-cache-v2:putney-landing`, unchanged |
| 4 | `putney-rowing-plan-v1`, `putney-rowing-install-v2`, `putney-rowing-nudge-v1` | `rowhether-plan-v1`, `rowhether-install-v1`, `rowhether-nudge-v1`, values unchanged. `putney-rowing-install-v1` is not read |
| 5 | any `putney-rowing-*` key present | `rowhether-last-v1 = "putney-landing"` |
| 6 | | `rowhether-migrated-v1 = "1"` |

Rules: each step in its own try/catch; a failed step leaves the old key for the next start and does not set the marker; each step writes its target only when the target key is absent, so a rerun after a failed step never overwrites a value saved since; the function is idempotent and safe to call from every loader. The old keys stay until phase 2, which deletes them (01 8.6 step 7). The install key has changed once already on `dev` (`putney-rowing-install-v2`, read 2026-10-18 in `src/config.js`), which is why 01's table, written before that change, named `-v1` (conflict K35).

### 8.4 Service worker

| Rule | Detail | Phase |
| --- | --- | --- |
| Precache the shell only | `globPatterns: ['**/*.{js,css,html,png,svg,woff2}']`, with `latin-ext` and `vietnamese` font files ignored (today, `vite.config.js`) | today |
| Never handle `/api/*` | `navigateFallbackDenylist: [/^\/api\//]` today; the Workbox runtime has no `runtimeCaching` entries, so API calls go to the network untouched | today |
| No runtime caching of data | Forecast, gauges, alerts, tiles and API answers are never cached by the service worker. The app's own `localStorage` copy is the offline data (CLAUDE.md) | today |
| Static pages are real pages | `navigateFallbackDenylist` gains a pattern for `/privacy`, `/terms` and `/about` (07 9.6) | 2 |
| Lazy chunks not in the shell | `globIgnores` gains `**/assets/map-*`, `**/assets/maplibre-gl-worker-*`, `**/assets/add-*`, `**/assets/admin-*`. The `picker`, `auth`, `account` and `club` chunks stay precached (07 10.3) | 1 to 5 |
| Curated location files | `locations/index.json` and every `locations/<slug>.json` precached while the list has 50 or fewer; above that, only the index (07 9.6) | 1 |
| Per-location shells not precached | `dist/<slug>.html` (07 4.2, conflict K24) are for first visits and link previews only; `globIgnores` lists each `<slug>.html`, built from `data/` by the locations plugin, because a pattern cannot tell them from `index.html` and the static pages | 1 |
| Push | `importScripts: ['push-sw.js']`, where `public/push-sw.js` holds the `push`, `notificationclick` and `pushsubscriptionchange` handlers (05 7.4) | 4 |
| Updates | `registerType: 'autoUpdate'` as today; a new version activates on the next load | today |

Chunk names: `picker`, `map`, `maplibre-gl-worker`, `add`, `auth`, `account`, `club`, `admin` (07 16). Vite names a lazy chunk after the file it imports, so each lazy folder's entry file carries the folder's name (`src/add/add.js`, `src/club/club.js`, `src/admin/admin.js`), never `index.js`, which would produce a second `index-*.js` next to the main bundle (naming rule from Vite's defaults, unverified on 8.3.1; `scripts/budget.mjs` fails when an expected chunk name is missing, so the first build that adds one checks it).

### 8.5 What the app reads before the first frame

Only `localStorage`: settings, the cached data for the location, the cached record, `rowhether-me-v1` and `rowhether-club-v1`. No network request is awaited before the first render (07 10.2). `/api/info`, `GET /api/me`, club context and push sync run after it.

## 9. Time zones and daylight saving

### 9.1 Rules

| Quantity | Stored as | Shown in | Owner |
| --- | --- | --- | --- |
| Every instant (forecast hours, reports, outings, sessions) | ms since the epoch, UTC | the zone in the rows below | all |
| Location screens: hours, periods, first light, sunset, day keys, charts, the status link | | the location's `tz` (`m.fmt`, from `zoneFormat(loc.tz)`), named once in the subtitle | 01 8.2, 07 7.5 |
| Lists of items tied to a place (row log, notification list, the account page's reports) | | each item's location zone, named when it differs from the home location's | 07 7.5 |
| Items tied to no place (sessions, security activity, the export file name) | | the home location's zone, else the device's | 08 |
| Quiet hours | `HH:MM` plus `tz` in `user_settings.notify` | the stored `tz` (the device's when set), named on screen | 05 4.4, 07 7.5 |
| Alert rule times (`night_before` 20:00) | `HH:MM` local to the pref's location | the location's zone | 05 4.3 |
| Club pages, practices, bookings, the board | ms; series as `HH:MM` plus the club's zone | the club's zone (its primary location's `tz`) | 06 12 |
| Calendar feeds | `DTSTART:...Z` | UTC in the file; the calendar app converts | 06 14.2 |
| Email and push text | | the zone of the place the message is about | 05 3.2 |
| CSV exports | | local time of the place (04 12 tests "local times") | 04 7, 06 16 |
| Cron schedules | `* * * * *`, `17 9 * * *` | UTC | 05 5.1 |
| Data requests | `timeformat=unixtime`, `timezone=<loc.tz>` on Open-Meteo, so daily rows start at local midnight | | CLAUDE.md, 02 |

`zoneFormat(tz, { clock })` (phase 0, `src/format.js`) returns every formatter the app uses today (`hm`, `dayKey`, `weekday`, `monthDay`, `localHour`, `fDayLong`, `hShort`, `dayWord`, `whenText`) plus `localMinutes`, for one zone. `setZone(tz)` swaps the module-level formatters that render code imports (ES module live bindings), so the many call sites need no change in phase 0; logic code uses `m.fmt` (01 8.2, 8.3).

### 9.2 Code that assumes whole-hour offsets today

Read 2026-10-18 from the files named. Each is fixed in phase 0 (14) with no change at Putney.

| Code | Assumption | Fix |
| --- | --- | --- |
| `clockMin` in `src/render/detail/week.js` and `light.js` | `localHour(t) * 60 + new Date(t).getUTCMinutes()` | `localMinutes(t)` from the zone formatter |
| `h0 = Math.floor(now / HOUR) * HOUR` in `buildModel` | Forecast hours start on UTC whole hours | `h0` = the `t` of the hour that contains `now` (`t <= now < t + HOUR`) |
| `PLAN_STEP` in `planSessions` | `Math.floor(t0 / PLAN_STEP) * PLAN_STEP` steps on UTC half hours | Step on local half hours, `t0 - (localMinutes(t0) % 30) * MIN - (t0 % MIN) + 30 * MIN` (the last term drops seconds and milliseconds, which a SunCalc dawn and the live clock carry; every zone offset in use is a whole number of minutes) |
| `parseFlowDays` | `T16:00:00Z` is noon Eastern | Local noon in the gauge location's zone, phase 1 (conflict K11); phase 0 keeps `T16:00:00Z` for Putney |
| `nowPrecip` in `src/render/now.js` line 29 | `Math.floor(m.now / HOUR) * HOUR` starts the precipitation window on a UTC whole hour | The `t` of the hour that contains `m.now` (`m.h72[0].t`) |
| The River chart's hour ticks, `src/render/detail/river.js` lines 73 and 78 | `Math.ceil(t0 / HOUR) * HOUR` steps on UTC whole hours | Step on local hour starts: the first tick is the next local hour start after `t0`, found with `localMinutes` |
| `sunFor`, `sunOn` | `LOC.lat`, `LOC.lon` | The location's point |

### 9.3 Wall times across a change

One function, `zonedTime(dateKey, 'HH:MM', tz)` in `src/schedule.js` (06 22). It ships in phase 4, because 05's `nextAt()` is its first user; phase 6 adds `expandSeries()` and the rest of the module. The rules are 05 4.3's:

- A wall time that does not exist (spring forward gap): the same wall time one hour later, which is the instant the clock reads after the jump (02:30 on 2026-03-08 in New York becomes 03:30 EDT).
- A wall time that happens twice (fall back): the first occurrence (01:30 on 2026-11-01 in New York is 01:30 EDT, 05:30 UTC).
- Recurring items (alert rules, practice series) keep their wall time across a change, so an 8 PM outlook is at 8 PM local before and after.
- A day is a local date. A local day can be 23 or 25 hours long, so code never adds `24 * HOUR` to find the next day's start; it asks the formatter for the next `dayKey`. Today `dayWord()` adds `24 * HOUR` to `Date.now()` to find "Tomorrow", which is right at every hour except within an hour of a change; phase 0 leaves it (no visible change at the golden times) and phase 1 replaces it with the next `dayKey`.

### 9.4 Test dates

Transitions verified live 2026-10-18 with Node 22.22.0's `Intl.DateTimeFormat` (`timeZoneName: 'longOffset'`, scanning 2026-01-01 to 2027-04-01 in 15-minute steps):

| Zone | Change (UTC) | Local | Used to test |
| --- | --- | --- | --- |
| `America/New_York` | 2026-03-08 07:00 | 02:00 EST becomes 03:00 EDT (23-hour day) | Gap rule, day keys, periods, night-before |
| `America/New_York` | 2026-11-01 06:00 | 02:00 EDT becomes 01:00 EST (25-hour day) | Overlap rule, the golden `fall-back` scenario (14), overdue steps across the change (06 24.5 B16) |
| `America/New_York` | 2027-03-14 07:00 | next spring forward | Series that span a year |
| `Australia/Sydney` | 2026-04-04 16:00 | 03:00 AEDT becomes 02:00 AEST on 2026-04-05 | Southern fall back |
| `Australia/Sydney` | 2026-10-03 16:00 | 02:00 AEST becomes 03:00 AEDT on 2026-10-04 | Southern spring forward |
| `Australia/Adelaide` | 2026-04-04 16:30, 2026-10-03 16:30 | +10:30 and +9:30 | Half-hour offset with daylight saving |
| `America/St_Johns` | 2026-03-08 05:30, 2026-11-01 04:30 | -3:30 and -2:30 | Half-hour offset in North America |
| `Asia/Kolkata` | none | +5:30 all year | Half-hour hours, `h0`, `clockMin`, plan steps |
| `Asia/Kathmandu` | none | +5:45 all year | Quarter-hour offset |
| `Pacific/Auckland` | 2026-04-04 14:00, 2026-09-26 14:00 | +13 and +12 | Date line side, earliest new day |
| `Europe/London` | 2026-03-29 01:00, 2026-10-25 01:00 | GMT and BST | UK phase 7 |

Every test that depends on a zone pins both the clock (`vi.setSystemTime`) and the zone of the formatter, never the machine's `TZ`, so CI on UTC and a laptop in Vermont give the same result.

## 10. Security model

### 10.1 What is protected

| Asset | Main risk | Main control | Owner |
| --- | --- | --- | --- |
| Accounts and sessions | Stolen cookie, phished code, takeover by email change | Passkeys first, `__Host-` cookie, hashed tokens, recent sign-in for risky changes, revert link to the old address | 03 4 to 6 |
| Where and when a person rows (outings, float plans, status links) | Stalking, a public "out on the water alone" signal | Status links only to named contacts, unguessable tokens, ended 24 hours after the row, nothing public but a count | 04 5, 6 |
| Minors' data | Contact by adults, exposure | Age gate at 13, junior defaults, guardian links, no private messages, safeguarding audit | 03 11, 06 5 |
| Shared records (locations, reports, hazards) | Spam, vandalism, false "all clear" | Account age, rate limits, Turnstile, Claude screening of free text, flags, revisions, moderators | 01 12, 04 8 |
| Club records (incidents, rosters, phones) | Wrong role sees them | One permission matrix (`requireCan`, 06 5.3) with a refused-role test per route | 06 5 |
| Money and keys | A leaked key spends or files issues | Secrets only in the Worker, never on Previews for paid keys, per-route rate limits, Workers Paid budget alerts | 6.5, 12 |
| Availability of the forecast | Server outage | The app works with no Worker at all: static files, browser fetches, local cache | 2.2 |

### 10.2 Request checks

`worker/index.js` and `worker/http.js` (phase 2) run the checks in this order, cheapest first, so a refused request costs no D1 read where possible:

| Step | Check | Failure |
| --- | --- | --- |
| 1 | Method allowed for the path | 405 `method_not_allowed` |
| 2 | Writes: `Origin` equals the request's origin (exempt: `POST /api/notify/unsubscribe`) | 403 `bad_origin` |
| 3 | Writes with a body: `Content-Type: application/json` (exempt: the two token form posts, 7.1) | 415 `bad_type` |
| 4 | Body under 64 KB | 413 `too_large` |
| 5 | Feature flag for the area | 404 `*_off` |
| 6 | Rate limit binding for the route | 429 `rate_limited` |
| 7 | Session or token, if the route needs one | 401 `sign_in`, 404 for a token that does not match |
| 8 | Guard: site role, passkey session, recent sign-in, club permission | 403 with the guard's code |
| 9 | Input validation | 400 `invalid` with `field` |
| 10 | Turnstile, if the route needs it | 403 `verification_failed` |
| 11 | Daily caps (D1 counts) | 429 `daily_limit` |
| 12 | The handler; any paid call (Claude) comes last | 502 `unavailable` |

Today's suggestion route already follows this shape: configured, rate limit, input, Turnstile, Claude, GitHub (comment at the top of `worker/suggest.js`, read 2026-10-18).

CSRF in one sentence: a write needs a same-origin `Origin` header and a JSON body, which a cross-site page cannot send without a CORS preflight the Worker never answers, and the session cookie is `SameSite=Lax` as a second lock (03 5.6). Token links act only through their own token, so they need neither.

### 10.3 Tokens, codes and hashes

| Item | Made of | Stored as | Lifetime | Owner |
| --- | --- | --- | --- | --- |
| Session cookie | 32 random bytes, base64url (43 chars) | SHA-256, hex (64) | 180 days idle | 03 5.2, 5.3 |
| Login code | 6 digits | HMAC-SHA256 with `AUTH_PEPPER` over `<codeId>:<code>`, hex | 10 minutes, 5 tries | 03 6.1 |
| Sign-up ticket | 32 random bytes, base64url | SHA-256, hex | 30 minutes | 03 6.1 |
| Email revert token | 32 random bytes, base64url, in the link's fragment | HMAC with `AUTH_PEPPER`, hex, in `login_codes` | 7 days, single use | 03 4.7 |
| Guardian link code | 8 Crockford base32 characters | HMAC with `AUTH_PEPPER`, hex | single use | 03 11.5 |
| Blocked email | the address | HMAC with `AUTH_PEPPER`, hex | 1 year | 03 6.5 |
| WebAuthn user handle | 16 random bytes, base64url (22) | plain (it identifies nothing) | account | 03 3.4 |
| Status link token | 16 random bytes, base64url | SHA-256, base64url (43) | 24 hours after the row ends | 04 6.3 |
| Contact stop token | random, base64url | SHA-256, base64url | until used | 04 6.1 |
| Report `ip_hash` | the IP and the UTC date | HMAC with `IP_HASH_KEY`, first 16 bytes, base64url (22) | 30 days, then NULL (04 8.9) | 04 3.3 |
| Push endpoint | the endpoint URL | SHA-256, base64url, for lookups; the URL itself is stored to send | until gone | 05 8 |
| Unsubscribe link | `prefId` | not stored: `prefId.HMAC(NOTIFY_LINK_KEY, prefId)` checked on use | while the pref exists | 05 7.6 |
| Club verify code | 6 digits | HMAC with `AUTH_PEPPER`, hex | 30 minutes, 5 tries | 06 3.3, 4.3 here |
| Club invite link and code | 16 random bytes (22 chars); 8 base32 characters | plain, so admins can show them again | 14 days, 90 at most | 06 4.3 |
| Kiosk cookie | 32 random bytes, base64url | SHA-256, base64url | 180 days | 06 8.5 |
| Kiosk pairing code | 6 digits | plain | 10 minutes | 06 8.5 |
| Calendar feed token | 32 random bytes, base64url | SHA-256, base64url | until revoked | 06 14.1 |

Rules:

- Random values come from `crypto.getRandomValues`. Comparisons of secrets use a constant-time compare (`crypto.subtle.timingSafeEqual` in Workers, from docs, unverified here, with a byte loop as fallback in tests).
- Encoding: 03's tables use hex (64 characters), the later tables base64url (43). Both are already in the schema (4.4), so `worker/crypto.js` (phase 2) exports both by name, `sha256Hex`, `sha256B64`, `hmacHex`, `hmacB64`, and every column's CHECK states its length so a mix-up fails on insert.
- Plain-text tokens exist only where a person must see them again (club invites, a pairing code for 10 minutes), and each of those grants only a request that an admin or a code still has to approve or that expires within minutes.
- Tokens in links go in the path or query only when the page must work in mail clients without JavaScript (unsubscribe, stop) or is shared with people who have no account (status). The email revert token goes in the fragment (03 4.7), so it never reaches logs.

### 10.4 Roles and guards

| Role | Held in | Granted by | Guard | Owner |
| --- | --- | --- | --- | --- |
| Anyone | | | none | |
| Signed in | `auth_sessions` | sign in | `requireSession` | 03 |
| Recent sign-in | `auth_sessions.auth_at` within 10 minutes | passkey or code reauth | `requireRecent` | 03 5.4, 4.12 |
| Moderator, admin (site) | `users.site_role` | an admin; the first admin by the owner's command | `requireSiteRole(role)` plus `requirePasskey` | 03 10 |
| Owner tools | Cloudflare Access | the owner's Zero Trust policy | Access JWT check in `worker/auth/access.js` (phase 1), then also `requireSiteRole('admin')` from phase 2 | 03 3.7 |
| Location curator | `location_revisions` history and 01's rules | 01 12 | in `worker/locations.js` | 01 12 |
| Club roles | `memberships.roles` | club admins | `requireCan(ctx, action, target)` | 06 5.3 |
| Guardian | `guardian_links`, `club_guardians` | both people | in `worker/auth/guardians.js` and `requireCan` | 03 11.5, 06 5.2 |
| Kiosk | `club_devices` | a club admin's pairing code | `kioskCtx` | 06 8.5 |
| Token holder | the token tables in 10.3 | a link | per route | 04, 05, 06 |

A suspended account can sign in and read, and cannot write shared content (03 6.5). Every guard fails closed: an unknown role, a missing membership or a club in the wrong status is a refusal.

### 10.5 Input and output

- Each area validates its own bodies with plain functions (`clean*` as `worker/reports.js` does today). No schema library: one more dependency for a few dozen checks.
- Strings: trimmed, normalized to NFC, control characters removed, length capped per field. Free text never holds HTML; the app escapes every value it writes into markup with `esc()` (`src/format.js`), as today.
- Numbers must be finite and inside the field's range. Ids must match their format (UUID, slug, base64url length) before any query. Every query uses bound parameters.
- URLs are accepted only in named fields (a club's website, 06 3), only `https:`, and are shown as text links with `rel="noopener noreferrer"`.
- Free text that other people will read (hazard notes, location notes, club announcements to the public) goes through `screenText()` with Claude Haiku before it shows (04 8.6); private text (row log notes, incidents) does not.

### 10.6 Secrets

Listed in 6.5. Rules: set in the Cloudflare dashboard or with `wrangler secret put`; never in the repo, `wrangler.jsonc` or a log; `.dev.vars` for local work stays git ignored (`.gitignore`, read 2026-10-18); Previews never get a key that spends money or acts in the world (Anthropic, GitHub, Open-Meteo, Resend); rotation steps live with each secret's owner (03 14.3, 05 6.2).

### 10.7 The audit log

One table, `audit_log`, created by `0002` (4.4). Every document that writes to it uses this definition.

Writing: `audit(env, { kind, action, actorUserId, actorRole, actorLabel, subjectUserId, targetType, targetId, clubId, detail })` in `worker/auth/audit.js` returns a prepared statement, which the caller puts in the same `env.DB.batch()` as the change it records, so a change and its record succeed or fail together. `expires_at = at + retention(kind)`. The daily run deletes rows past `expires_at`.

| Kind | Actions | Retention | Who reads | Owner |
| --- | --- | --- | --- | --- |
| `security` | `auth.signin`, `auth.passkey_added`, `auth.passkey_removed`, `auth.email_changed`, `auth.email_reverted`, `auth.signout_all`, `data.export` | 1 year; deleted with the account | the person (last 20), admins | 03 14.2 |
| `admin` | `user.role_changed`, `user.suspended`, `user.unsuspended`, `user.banned`, `user.deleted`, `user.age_corrected`, `user.email_viewed`, `guardian.ended_by_admin`, `club.verify`, `club.verify.reject`, `club.suspend` (site moderators acting on clubs) | 3 years | admins | 03 14.2, 06 3.3 |
| `moderation` | `user.name_reset`, `user.suspended` (by a moderator), `location.verify`, `location.archive`, `location.merge`, `location.restore`, `revision.approve`, `revision.reject`, `report.hide`, `report.remove`, `hazard.hide`, `hazard.remove`, `flag.dismiss` | 3 years | admins | 01 14, 04 8.7 |
| `club` | 06 18.3's list (`club.create` to `export.download`), less the three site moderator actions above | 2 years | admins; club admins for their own club (06 5.3) | 06 16.3 |
| `safeguarding` | `guardian.linked`, `guardian.ended`, message removals involving a junior (03 14.2); `junior.approved` and `junior.declined` for a guardian's club approval (06 4.5, named here); `incident.view` of an incident naming a junior, written here instead of under `club` | 7 years (legal review to confirm) | admins | 03 14.2, 06 5 |

Rules for the content:

- `action` is `area.verb`, 3 to 48 characters, checked by the table.
- `detail` is a small JSON object of before and after values and a note, at most 4,000 characters. Never an email address, a token, a code, a phone number or free text someone else wrote.
- `actor_role` is `user`, `moderator`, `admin`, `club` or `system` (the daily run, the tick).
- On account deletion (03 12.9): `security` rows about the person are deleted; other rows keep their place with `actor_user_id` and `subject_user_id` set to null (the foreign keys do this) and `actor_label` kept ("Former moderator").
- Club deletion: `club` rows stay until their own expiry, with `club_id` kept as text, so a deleted club's history can still answer a complaint for 2 years.

### 10.8 Turnstile

| Action | Where | Phase | Owner |
| --- | --- | --- | --- |
| `suggest` | The suggestion form | today | existing |
| `auth` | `POST /api/auth/code` (sign in), `POST /api/me/email`, `POST /api/me/guardians/invite` | 2, 5 | 03 6.3 |
| `report` | `POST /api/locations/:slug/reports` when signed out | 3 | 04 8.3 |
| `safe` | `POST /api/outings/status/:token/safe` | 3 | 04 8.3 |

- `verifyTurnstile(env, token, ip, action = 'suggest')` checks `success` and that `action` matches (phase 0 adds the parameter with today's value as the default, so no caller changes; 14 step P0.13).
- The browser loader moves from `src/suggest.js` to `src/turnstile.js` in phase 2. The script loads only when a form that needs it is first opened, never on page load. The site key comes from `/api/info` `turnstileKey` from phase 2; `GET /api/suggest` keeps returning it for the suggestion form.
- CLAUDE.md's exception sentence ("It loads only when the suggestion form is first opened") becomes, with the phase 2 merge and the owner's approval: "It loads only when a form that needs it is first opened: suggestions, sign in, a report sent while signed out, and the status link's safe button."
- Previews use Turnstile's published testing keys (6.3). Whether the testing secret's answer carries the `action` is unverified; if it does not, the phase 2 test on dev will show it, and the action check is then skipped only when `APP_ENV` is not `production`.

### 10.9 Analytics

07 14.3 proposed an aggregate open counter in Analytics Engine; 03 12.3 said no analytics.

Decision: Adopt 07's Tier 1 counter in phase 1. One data point per app start with the location slug, first or return, and standalone or browser, written by `GET /api/info`. No cookie, no identifier, no IP, no user agent, nothing that links two opens. The privacy page says so in one sentence. The owner confirms before phase 1 ships.
- Alternative: Tier 0 only, counts from data that already exists (reports, accounts, notification logs), and no new collection (07 14.2).
- Alternative: Cloudflare Web Analytics (a beacon script from Cloudflare's CDN, which the no-CDN constraint rules out).

### 10.10 Logging

- Worker logs (Workers Logs, `observability` on, read 2026-10-18 in `wrangler.jsonc`) record route, status, duration and error code. Never request bodies, emails, names, phone numbers, tokens, codes, IP addresses, user ids or push endpoints.
- Upstream failures log the upstream host and status only.
- The browser logs a failed source with `console.warn(key, reason)` as today (`fetchAll` in `src/data.js`); nothing is sent anywhere.

### 10.11 Headers

`public/_headers` (static assets) in phase 1, replacing 03 14.4's draft:

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://api.open-meteo.com https://air-quality-api.open-meteo.com https://flood-api.open-meteo.com https://marine-api.open-meteo.com https://api.weather.gov https://api.waterdata.usgs.gov https://api.water.noaa.gov https://api.tidesandcurrents.noaa.gov https://geocoding-api.open-meteo.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  Permissions-Policy: geolocation=(self), camera=(), microphone=()
```

- `style-src 'unsafe-inline'` is needed: the app writes `style` attributes (`src/render/detail/common.js` week strip, `week.js` bars and ticks, `storms.js`, and `index.html`, read 2026-10-18). The built `index.html` has no inline script (one module script tag, read 2026-10-18), so `script-src` needs no `'unsafe-inline'`.
- The picker's town search uses Open-Meteo geocoding from phase 1 (07 5.2.1), so its host is in the phase 1 list. Phase 3 adds `https://tiles.openfreemap.org` to `connect-src` for the map, and `blob:` to `img-src` and `worker-src` if MapLibre needs them (unverified; the phase 3 browser test with the map open shows any violation in the console). Phase 7 adds each new adapter's hosts.
- `test/csp.test.js` (phase 1) reads `public/_headers` and fails when a host listed by any browser adapter in `src/sources/` (each adapter exports `hosts`) is missing from `connect-src`. 03 14.4 asked for the header to be generated from the catalog; a hand-written header with this test is simpler and shows the policy in one place.
- The Turnstile `script-src` and `frame-src` entries follow Cloudflare's CSP guidance (from docs, unverified here). After the phase 1 merge, open the suggestion form on production and confirm the console shows no CSP violation; the phase 2 browser test does the same for the sign-in form.
- Worker responses set their own headers: JSON routes `Cache-Control` as 7.1 and `X-Content-Type-Options: nosniff`; the two HTML pages the CSP in 7.4.

## 11. Performance and offline

### 11.1 Today's build

Verified live 2026-10-18 with `npm run build` at commit `20e4255` (Vite 8.3.1, vite-plugin-pwa 1.3.0), gzip at level 9 with Node's `zlib`:

| File | Raw | Gzip |
| --- | --- | --- |
| `index.html` | 12,225 B | 3,618 B |
| `assets/index-*.js` (main bundle) | 109,839 B | 38,988 B |
| `assets/index-*.css` | 25,548 B | 5,976 B |
| Precache | 17 entries, 262.89 KiB | |

07 10.1 measured 38,790 B, 5,918 B and 3,560 B on 2026-10-17. The difference is the install bar change merged from `dev` since (commit `2b7ef06`). 07's phase 0 HTML budget of 3.6 KB is already below today's 3,618 B, so the budgets are rebased.

### 11.2 Budgets

Gzip bytes for the Now screen's critical path, checked by `scripts/budget.mjs` against `budget.json` in CI from phase 0. Rule: 07 10.2's number for the phase plus the growth since 07 measured, rounded up to 100 B (JS +200, CSS +100, HTML +100), with phase 0's JS raised 300 B more because 02's source adapters were not in 07's phase 0 estimate.

| After phase | Main JS | CSS | HTML | Precache |
| --- | --- | --- | --- | --- |
| today (measured) | 38,988 | 5,976 | 3,618 | 262.89 KiB |
| 0 | 40,500 | 6,100 | 3,700 | 400 KiB |
| 1 | 43,200 | 7,100 | 3,700 | 400 KiB |
| 2 | 45,200 | 7,600 | 3,900 | 400 KiB |
| 3 | 48,200 | 8,100 | 3,900 | 400 KiB |
| 4 | 49,200 | 8,100 | 3,900 | 400 KiB |
| 5 | 53,200 | 8,600 | 3,900 | 400 KiB |
| 6 and 7 | 54,200 | 9,100 | 3,900 | 400 KiB |

- 06 20 asked for club code in the main bundle to stay under 4 KB gzip; phase 5's step of 4,000 B is that budget.
- Lazy chunks have no CI budget except `map` (MapLibre, about 430 KB gzip measured by 07 10.4), which must not grow by more than 10% without a note in the pull request. `scripts/budget.mjs` prints every chunk's size so changes are visible.
- A budget changes only in a commit that says why. `budget.json` holds the current phase's row.
- `scripts/budget.mjs` is the name (07 10.6); 06 24.6 called it `bundle-budget.mjs` (conflict K39).

### 11.3 Time to first render

- Measured in Playwright with Chromium, CPU throttled 4 times (`Emulation.setCPUThrottlingRate` over CDP), the network offline after a first load, from navigation start to `performance.mark('hero')` set in `render()` after `renderHero()` (P0.2; 07 10.2), with `Date` pinned by `page.clock.setFixedTime` to a scenario's midday so the model has hours. The median of 5 runs is the number.
- Phase 0 step P0.2 records the baseline in `docs/full-app/phase-0-progress.md`. Every later phase stays within 20% of it.
- Nothing is fetched before the first render (8.5).

### 11.4 Offline model

| Layer | Offline source | Freshness shown |
| --- | --- | --- |
| App shell, fonts, icons | Service worker precache | New version on next load |
| Forecast and gauges | `rowhether-cache-v2:<slug>` | "Saved 6:41 AM" in the header; failures named under the hero, as today |
| Location record | Phase 1 and 2: precached `locations/<slug>.json`; then `rowhether-loc-v1:<slug>` | |
| Account name, club context, the board | `rowhether-me-v1`, `rowhether-club-v1`, `rowhether-board-v1` | "As of" times (06 21.6) |
| Writes (reports, start a row, I'm back, incidents) | `rowhether-outbox-v1`, flushed on `online` and on return to the tab | The outbox's own copy (04 3.10) |
| Account, Add, Admin pages | none | "This page needs a connection." (07 9.5) |

The safety rule from 04 and 06: the app never shows a stale water status or overdue state as current. Club context older than its limit shows "as of", and the board shows "Not updated since".

## 12. Costs

### 12.1 Platform prices and free limits

| Item | Free | Paid | Status |
| --- | --- | --- | --- |
| Workers | 100,000 requests a day (from docs, not re-read 2026-10-18) | $5 a month minimum, 10 million requests and 30 million CPU ms included | from docs, as cited in 03 19 and 05 10 |
| Static asset requests | free and unlimited | same | from docs, https://developers.cloudflare.com/workers/platform/pricing/ |
| D1 | 5 million rows read and 100,000 written a day, 5 GB | 25 billion rows read and 50 million written a month, 5 GB included | from docs, as cited in 03 19 |
| Queues | 10,000 operations a day, 24-hour retention | 1 million operations a month, then $0.40 per million | from docs, as cited in 05 5.6 |
| Analytics Engine | 100,000 data points written a day | 10 million a month; billing "not active yet" | from docs, as cited in 07 14.3 |
| Email Service | not available for arbitrary recipients | 3,000 a month included, then $0.35 per 1,000 | from docs, as cited in 03 3.5 and 05 2.2 |
| Cron triggers, rate limit bindings, Turnstile, Cloudflare Access (free seats) | included | included | 03, 05; Access seat limit unverified |
| Claude Haiku 5.5 (suggestions, screening) | | $0.10 per million input tokens, $0.50 per million output; about $0.0003 per screen | from docs, as cited in 04 8.6 |
| Open-Meteo API Standard (server-side forecasts) | | $29 a month for 1 million calls | unverified, from 02 |

### 12.2 By phase

Monthly, for the loads the owning documents estimate.

| Phase | New cost drivers | Expected monthly cost | Free tier limit that matters first |
| --- | --- | --- | --- |
| 0 | none | $0 (as today) | none |
| 1 | One Analytics Engine point per app start; `/api/info` is already called at every start | $0 | Workers Free 100,000 requests a day: today each start makes two Worker requests (`/api/info`, `GET /api/suggest`), so about 50,000 starts a day. Analytics Engine 100,000 points a day |
| 2 | Workers Paid (03 decision); D1 production; sign-in email | $5 | Email Service 3,000 a month: about 1,000 accounts at three code emails each |
| 3 | Reports, hazards, outings, tick every minute, queue, overdue email, Claude screening | about $5 to $6 | none at the loads in 04 and 05 (43,000 cron runs a month inside 10 million requests) |
| 4 | Push, alert rules, server-side forecasts | about $34 to $41 with the Open-Meteo key (05 10); $5 to $12 without | Email over 3,000 a month at about 10,000 users with alerts (05 10) |
| 5 and 6 | Club notices and email | add $0 to $8 for email at 100 clubs: 06 21.7 estimates 250,000 notices a month, and if 1% to 10% go by email that is 2,500 to 25,000, against 3,000 included and $0.35 per 1,000 after (estimate) | Queue operations near 1 million a month at 100 active clubs (06 21.7) |
| 7 | Worker-proxied warnings and METAR, more locations on the server-side forecast | Open-Meteo may need a higher tier (02: about 4.1 million calls a month at 200 active locations, $99, unverified) | Open-Meteo plan |

Nothing here charges per viewer: forecasts and gauges are fetched by each browser from keyless APIs (2.2).

## 13. Testing strategy

### 13.1 Layers

| Layer | Tool | Runs in | Starts |
| --- | --- | --- | --- |
| Pure logic, parsers, formatters | Vitest 5.0.2, Node environment | `npm test`, CI | today |
| Golden outputs (phase 0 proof) | Vitest with a fake DOM (`test/helpers/fakedom.js`) | `npm test`, CI | 0 |
| Worker routes | Vitest, handlers called with a stub `env` (`DB`, rate limiters, `fetch`), as `test/reports.test.js` and `test/suggest.test.js` do today | `npm test`, CI | today |
| Schema and queries | Vitest with `test/helpers/d1.js` over `node:sqlite` | `npm test`, CI | 2 |
| Code that must run in workerd (WebCrypto push encryption, passkey verification) | `@cloudflare/vitest-pool-workers` in a separate config, `npm run test:workerd` | CI | 2 (03 3.3), 4 (05 12) |
| Browser: screens, flows, timing | Playwright 1.56.1 (`@playwright/test`), Chromium in CI; WebKit on the owner's machine (`WEBKIT=1`, 13.5) | `npm run test:browser`, CI for Chromium | 0 |
| Migrations against Miniflare's D1 | `npx wrangler d1 migrations apply DB --local -c test/wrangler.test.jsonc` | CI | 2 |
| Bindings per phase | `npx wrangler deploy --dry-run --outdir $RUNNER_TEMP/worker` | CI | 0 |
| Live sources | `node scripts/check-sources.mjs`, by hand, never in CI | owner | 1 |

### 13.2 Rules

- Nothing in CI calls a live API, a paid API, a push service or an email provider. Upstream responses are recorded fixtures in `test/fixtures/` (02 Tests).
- Every test that depends on time pins the clock (`vi.setSystemTime`, `page.clock.install`) and passes the zone explicitly (9.4).
- Every new rule in `src/logic.js` or parser in `src/sources/` gets a unit test (CLAUDE.md).
- Every route gets: one allowed call, one refused call per guard (06 24 does this for every club route), and a check that a refused call writes nothing.
- Every migration file is applied by the D1 helper on every `npm test`, so a file that does not parse fails CI.
- The deletion test (03 20.2) creates a user with a row in every table that references `users`, deletes the account, and checks each table. It fails when a new table references `users` without being added, because the reference without an ON DELETE action (only `hazards.created_by`) blocks the delete.

### 13.3 Vitest configuration

Vitest's default `include` is `**/*.{test,spec}.?(c|m)[jt]s?(x)` (verified live 2026-10-18 by reading Vitest 5.0.2's defaults in `node_modules/vitest`), which would collect Playwright's `*.spec.js` files. Phase 0 adds to `vite.config.js`:

```js
test: { environment: 'node', exclude: ['**/node_modules/**', 'test/browser/**'] }
```

### 13.4 The D1 helper

`test/helpers/d1.js` (phase 2, 03 20.1) wraps `node:sqlite`'s `DatabaseSync` in D1's API: `prepare(sql).bind(...args)` with `first()`, `all()` (returning `{ results }`), `run()` (returning `{ meta: { changes, last_row_id } }`), `env.DB.batch([...])` inside `BEGIN` and `COMMIT` with `ROLLBACK` on error, and `exec()`. It runs `PRAGMA foreign_keys = ON` and applies every file in `migrations/` in order.

- Verified live 2026-10-18: Node 22.22.0's `node:sqlite` (SQLite 3.50.4) runs every migration in 4.4 with foreign keys on, FTS5 and `json_valid` included, without a flag.
- `node:sqlite` needs Node 22.5 or later; it runs without a flag from 22.13 (from Node's changelog, from memory, unverified). `package.json` `engines.node` changes from `>=20.19` to `>=22.13` in phase 2. CI already uses Node 22 (`.github/workflows/ci.yml`, read 2026-10-18).
- Known differences from D1: D1 enforces foreign keys by default (from docs, unverified here); `RETURNING` support on D1 is unverified, so code does not rely on it (03 15); D1's `batch()` is a transaction (from docs). The migrations job (13.1) runs the same files through Miniflare's D1 as a second check.

### 13.5 Browser tests

- `playwright.config.js` (phase 0) starts `npm run build && npx vite preview --port 4173`, blocks service workers (`serviceWorkers: 'block'`) except in the offline test, and routes every upstream host to fixtures in `test/browser/fixtures.js`, so runs are repeatable.
- Projects: `chromium-390-light`, `chromium-1280-dark`. The `webkit-390-light` and `webkit-1280-dark` projects are added only when `WEBKIT=1` is set, for a manual run on the owner's Mac; CI does not set it, and `timing.spec.js` skips itself outside Chromium because CDP CPU throttling is Chromium only. The container has no WebKit (verified live 2026-10-18: only Chromium 1194 is installed under `/opt/pw-browsers`).
- Screenshots are compared with `toHaveScreenshot` against committed images in `test/browser/__screenshots__/`, with `maxDiffPixelRatio: 0` for phase 0 (no visible change) and a small ratio after. Pixels differ between machines, so the `@visual` specs run where the baseline was made until a CI run shows they match there too (17.3).
- Each phase adds its checklist from CLAUDE.md Testing and the owning document as specs.

### 13.6 CI

`.github/workflows/ci.yml` today runs `npm ci`, `npm test`, `npm run build` on Node 22 for pushes to `master` and `dev` and for every pull request (read 2026-10-18). Pushes to `dev-full-app` run through its pull request.

| Step | Command | Phase |
| --- | --- | --- |
| Install | `npm ci` | today |
| Unit, golden, Worker, D1 | `npm test` | today |
| Build | `npm run build` | today |
| Budget | `node scripts/budget.mjs` | 0 |
| Worker bundles and bindings | `npx wrangler deploy --dry-run --outdir $RUNNER_TEMP/worker` | 0 |
| Browser | `npx playwright install --with-deps chromium`, then `npx playwright test --grep-invert @visual` (pixel comparisons run on the machine that made the baseline, 13.5) | 0 |
| Migrations on Miniflare | `npx wrangler d1 migrations apply DB --local -c test/wrangler.test.jsonc` | 2 |
| workerd tests | `npm run test:workerd` | 2 |

A failed step fails the run. The budget report is uploaded as an artifact (P0.3), which the Metrics tab's budget history reads (07 14.5). Screenshots are not made in CI (13.5).

### 13.7 Tests by phase

| Phase | New test files | Owner |
| --- | --- | --- |
| 0 | `golden.test.js`, `location.test.js`, `format.test.js`, `storage.test.js`, `sources.test.js`, `units.test.js`, `test/browser/screens.spec.js`, `smoke.spec.js`, `timing.spec.js` | 01 16, 02, 07, 14 here |
| 1 | `route.test.js`, `picker.test.js`, `csp.test.js`, `info.test.js`, `locations-data.test.js` (every `data/` record validates), `test/browser/picker.spec.js` | 01, 07 |
| 2 | `auth-*.test.js`, `settings-sync.test.js`, `delete.test.js`, `migrations.test.js`, `units.test.js` (UK, metric) | 03 20 |
| 3 | `reports.test.js` (extended), `hazards.test.js`, `outings.test.js`, `overdue.test.js`, `flags.test.js`, `locations-api.test.js`, `notify-tick.test.js` | 01, 04 12, 05 12 |
| 4 | `push.test.js`, `notify-schedule.test.js`, `notify-alerts.test.js`, `test/browser/push.spec.js` | 05 12 |
| 5 and 6 | 06 24's list | 06 24 |
| 7 | adapter fixture tests per country | 02 |

## 14. Phase 0 build sequence

Phase 0 turns Putney from code into data with no visible change (01 8, 02 Phases, 07 15). This section is the commit list. Each step is one commit (or a few, if a step is large) on `dev-full-app`, leaves `npm test` and `npm run build` passing, and adds a line to `docs/full-app/phase-0-progress.md` (date and time UTC, step, commit, test count, what was proven).

Every code fact below was read on 2026-10-18 at commit `20e4255`.

### 14.1 How "no visible change" is proven

| Proof | What it covers | Made in | Checked in |
| --- | --- | --- | --- |
| Golden outputs: JSON files of the model, every sentence the logic writes, every detail view's HTML, the home screen's elements and each full forecast, for fixed inputs and clocks | Logic and rendering, exactly | P0.1 | every step, by `npm test` |
| `git diff <P0.1 commit> HEAD -- test/golden/` is empty | Nobody edited the expected outputs to make a step pass | P0.1 | P0.14, and in each step's review |
| Before screenshots, Chromium, 390 px light and 1280 px dark, midday and 9 PM, home and four tabs | Layout, CSS, the parts the golden files cannot see | P0.2 | P0.14 on the same machine |
| Timing baseline, first hero from cache, CPU 4 times slower, offline | Speed | P0.2 | P0.14: within 20% |
| URL and label parity test | The requests the app makes and the failure names are identical | P0.6 | every step after |
| Storage migration tests | Existing users keep their settings, cache and install choices | P0.7 | every step after |
| Bundle budget | Size | P0.3 | every CI run |

Rule for every step: the golden JSON files and the screenshot images are never written after P0.1 and P0.2. The capture code in `test/golden/capture.js` may change how it reaches a value (for example `bindingsFor(PUTNEY)` instead of `SRC`), and that change is reviewed as test code; what it produces must stay equal.

### 14.2 The steps

#### P0.1 Capture golden outputs

Before any refactor. No change under `src/`.

| File | Content |
| --- | --- |
| `test/fixtures/golden.js` | Four synthetic scenarios built like `wx()` in `test/logic.test.js` but for 7 days, with every source: `wx` (hourly, daily with sunrise and sunset from SunCalc at the dock, `current`), `alerts`, `obs`, `river`, `flow` (48 hours), `flowDays` (30 days), `flowFcst`, `aq` (5 days), `models` (4 models). Raw upstream shapes, so the parsers run on them too. |
| `test/helpers/fakedom.js` | `installFakeDom({ width })`: `globalThis.document = { getElementById }` returning one persistent fake element per id with `innerHTML` and `textContent` as two views of one value (setting either sets the other, as in a browser), an `innerText` getter (the text with a line break at each block boundary, including the end of the hero's `span.cond`, which `src/styles/app.css` makes a block; `shareText()` turns it into a space), `hidden`, `disabled`, `dataset`, `style`, `clientWidth: width`, no-op `addEventListener`, `querySelector` returning null and `querySelectorAll` returning `[]`; `globalThis.matchMedia = q => ({ matches: width >= 736 })` (46rem). `elements()` returns every element touched. |
| `test/golden/capture.js` | `capture(scenario, clock, settings)` returns one JSON object (below). Imports from `src/` only what exists today. |
| `test/golden.test.js` | For each case: pin the clock with `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime(clock)`, run `capture`, compare with `test/golden/<case>.json` using `toEqual`. With `GOLDEN_WRITE=1` it writes the files instead and fails the run, so a write can never pass silently. |
| `scripts/golden.mjs` | `node scripts/golden.mjs write` runs `GOLDEN_WRITE=1 npx vitest run test/golden.test.js`; `node scripts/golden.mjs dump <case>` writes every captured HTML string in full to `test/golden/out/` (git ignored) for diffing a failure. |
| `test/golden/*.json` | Written once by this step and committed. |
| `.gitignore` | Add `test/golden/out/`. |

Scenarios (times in `America/New_York`, which the formatters use today):

| Case | Start of data | Clocks | What it exercises |
| --- | --- | --- | --- |
| `june-calm` | `Date.UTC(2026, 5, 15, 4)` (midnight EDT, as `T0` in `test/logic.test.js`) | 12:00, 21:00 | Go most of the day, light wind, twilight, Plan a row, model agreement |
| `october-fog` | `Date.UTC(2026, 9, 14, 4)` | 06:00, 12:00, 21:00 | Valley and steam fog likely (air 38°F near the dew point, calm, clear night, water 58°F), cold caution, fog lifting times, the Fog view next morning at 9 PM |
| `april-high-water` | `Date.UTC(2026, 3, 14, 4)` | 12:00, 21:00 | Flow 22,000 cfs rising 25% in 6 hours (debris, wind against current), a flood watch alert, AQI 160, gusts to 26, a thunderstorm code one afternoon, models split (low confidence), the river forecast peak |
| `fall-back` | `Date.UTC(2026, 9, 31, 4)` | 12:00, 21:00 | Seven days across 2026-11-01 (a 25-hour day). Daily `time` values at each local midnight (Nov 1 at 04:00 UTC, Nov 2 at 05:00 UTC), hourly values every UTC hour |

Settings: each case runs with `DEFAULTS` and with `custom = { ...DEFAULTS, heading: 20, windCaution: 8, rainCaution: '', waterOverride: 55 }`. One more case, `june-calm` at 12:00 at width 1280, covers the wide chart layout. That is 19 cases (9 scenario clocks times 2 settings, plus 1); the rest run at width 390.

What `capture` records:

| Key | Content |
| --- | --- |
| `model` | `buildModel(data, S, clock)` projected through allowlists written out in `capture.js` (today's hour, day, period and model fields), so fields added later do not break the comparison |
| `text` | `windVsCourse(m, dir, speed)` for every 15° and speeds 2, 6 and 12 mph; `waterWhy(h.water)` for each hour in `m.h72`, and `debrisLikely(m)` once; `morningFog` and `nextMorning` |
| `plans` | `planSessions(m, minutes, when)` for 60, 90 and 120 minutes and `any`, `morning`, `afternoon` |
| `runs` | `callRuns(m, key)`, `callRuns(m, key, { past: true })` and `factorRuns(m, key, f.keys)` for every day and every `FACTORS` entry |
| `sun` | `sunOn(t)` for the 1st and 15th of every month of 2026 |
| `sources` | `[key, SRC[key](), SOURCE_NAMES[key]]` for every key of `SRC` |
| `parsers` | Each parser's output on the scenario's raw data |
| `views` | For each view in `VIEWS` and each day key from `weekDays(m)` plus `null`: the returned `day`, the HTML's length and SHA-256 |
| `home` | After setting `app.model`, `app.data`, `app.errors = {}` and `app.settings`: `renderHeader()`, `renderHero()`, `renderAlerts()`, `renderNow()`, `renderDays()`; then each touched element's `innerHTML` and `textContent` (full when under 2,000 characters, else length and SHA-256), `hidden` and `dataset` |
| `forecasts` | `forecastPanel(m, p)` length and SHA-256 for every period not past |
| `status` | `renderNoData()` with every source failed, and `renderHero()` with `app.errors = { alerts: true, river: true }` (the failure note written by `renderStatus()`) |
| `share` | `shareText(clock)` after `renderHero()` (it reads `#verdict`, `#why` and `#holds` from the page) |

Done when: 19 JSON files are committed; `npm test` passes with them; deleting one character from any view's output makes the test fail (checked once by hand and noted in the progress file).

#### P0.2 Before screenshots and the timing baseline

| File | Content |
| --- | --- |
| `package.json` | devDependency `@playwright/test` `1.56.1` (exact; it matches the Chromium build in the container, verified live 2026-10-18); scripts `"test:browser": "playwright test"` |
| `playwright.config.js` | `webServer`: `npm run build && npx vite preview --port 4173 --strictPort`; `use.baseURL`; projects `chromium-390-light` (viewport 390 by 844, `colorScheme: 'light'`) and `chromium-1280-dark` (1280 by 800, `'dark'`), plus `webkit-390-light` and `webkit-1280-dark`, added only when `WEBKIT=1` is set, for a manual run on the owner's Mac (CI and P0.14 never set it, so `npx playwright test` runs the two Chromium projects; the container has no WebKit); `snapshotPathTemplate: 'test/browser/__screenshots__/{arg}-{projectName}{ext}'` |
| `test/browser/fixtures.js` | `routeAll(page, scenario)`: answers every request to `api.open-meteo.com`, `air-quality-api.open-meteo.com`, `api.weather.gov`, `api.waterdata.usgs.gov` and `api.water.noaa.gov` from `test/fixtures/golden.js`, matching on the path, and for `api.open-meteo.com/v1/forecast` also on the `models` query parameter, since `SRC.wx` and `SRC.models` share that path (a request with `models=` gets the model comparison, the other the forecast); `/api/info` and `/api/suggest` answer 404 (a static host); every other external host aborts, and the preview server's own origin passes through |
| `test/browser/screens.spec.js` (tag `@visual`) | `page.clock.install({ time })` at 12:00 and 21:00 Eastern on the `june-calm` and `october-fog` days; for each: home after `#hero` has text, a Day by day row opened (wait for `.forecast`), and `#week`, `#wind`, `#river`, `#fog`; `toHaveScreenshot` with `fullPage: true`, `animations: 'disabled'`, `maxDiffPixelRatio: 0` |
| `test/browser/smoke.spec.js` | The functional checks that do not compare pixels, with `Date` pinned by `page.clock.setFixedTime` to 12:00 Eastern on the `june-calm` day (without a fixed time every fixture hour is in the past and the page shows the No data screen, too short to test the tab bar): the console is clean, no horizontal scroll at 390, the tab bar stays pinned when scrolled, the blocked-sources message when every upstream aborts |
| `test/browser/timing.spec.js` | Chromium only. `Date` pinned by `page.clock.setFixedTime` to 12:00 Eastern on the `june-calm` day (timers and `performance.now()` stay real; with the real clock every fixture hour is past, `buildModel` returns null and no hero is drawn); service workers allowed; first load online with fixtures; wait for `navigator.serviceWorker.ready`; then CDP `Emulation.setCPUThrottlingRate` `{ rate: 4 }`, `context.setOffline(true)`, reload, read `performance.getEntriesByName('hero')[0].startTime`; 5 runs; print the median |
| `src/render/index.js` | `performance.mark('hero')` on the line after `renderHero()` in `render()`, so both paths reach it: outside daylight `renderHero()` returns early to `renderNextPeriod()` (`src/render/hero.js` line 65), and a mark inside it would be skipped (07 10.2). Not visible; the golden test still passes because Node has `performance` |
| `vite.config.js` | `test.exclude: ['**/node_modules/**', 'test/browser/**']` (13.3) |
| `test/browser/__screenshots__/*.png` | Committed |
| `docs/full-app/phase-0-progress.md` | Created: the timing median, the machine and browser build, and the first log lines |

Done when: the screenshots and the baseline are committed. Pixel output differs between machines, so the `@visual` spec is compared on the machine that made the baseline (P0.14), not in CI.

#### P0.3 Budget check and CI

| File | Content |
| --- | --- |
| `scripts/budget.mjs` | Reads `dist/index.html`, finds the main script and stylesheet it links, gzips each at level 9 with `zlib`, and adds up the precache from the entries listed in `dist/sw.js`. Compares with `budget.json`; prints every file in `dist/assets/` with raw and gzip size; exits 1 when over; also writes `dist/budget-report.json` with the sizes it printed |
| `budget.json` | `{ "phase": 0, "js": 40500, "css": 6100, "html": 3700, "precacheKiB": 400 }` (11.2) |
| `.github/workflows/ci.yml` | After `npm run build`: `node scripts/budget.mjs`; `npx wrangler deploy --dry-run --outdir "$RUNNER_TEMP/worker"` (verified live 2026-10-18: runs without a login and lists the bindings); `npx playwright install --with-deps chromium`; `npx playwright test --grep-invert @visual`; `actions/upload-artifact@v4` with `name: budget`, `path: dist/budget-report.json` and `if: always()` |

Done when: CI passes on the pull request with the new steps.

#### P0.4 Zone-aware formatters

`src/format.js` today builds six `Intl.DateTimeFormat` objects with `timeZone: LOC.tz` at module load.

- Add `zoneFormat(tz, { clock = '12' } = {})` returning `{ tz, dayKey, weekday, monthDay, localHour, localMinutes, hm, hShort, fDayLong, dayWord, whenText }` for that zone. `localMinutes(t)` is minutes after local midnight, from `formatToParts` with `hourCycle: 'h23'`. Only `'12'` is implemented in phase 0 (07 7.6).
- Turn the module's exports of those names (the `const` formatters, and `dayWord` and `whenText`, which are `export function` today) into `export let` bindings, and add `setZone(tz)`, which assigns them from `zoneFormat(tz)`. Call `setZone('America/New_York')` at the bottom of the module, the default 01 8.2 shows, and drop the module's `LOC` import: `src/format.js` imports only `HOUR` and `MIN` from `src/config.js`, so `src/location.js` can import it without a cycle (`putney.js` calls `zoneFormat` while it resolves Putney). ES module live bindings mean every importer sees the swap; no call site changes.
- Replace both `clockMin` functions (`src/render/detail/week.js` line 22 and `light.js`) with `localMinutes` from `src/format.js`.
- `test/format.test.js`: for 24 instants across 2026 (including 2026-03-08 and 2026-11-01), every function of `zoneFormat('America/New_York')` equals the reference, today's six formatter definitions and the wrappers over them copied from `src/format.js` into the test (after this step the module's own exports are `zoneFormat`'s, so they cannot be the reference); `localMinutes` is 30 at 00:30 in `Asia/Kolkata` and 45 at 00:45 in `Asia/Kathmandu`; after `setZone('Asia/Kolkata')` an imported `hm` formats in Kolkata, and `setZone('America/New_York')` restores it.

Done when: golden passes unchanged.

#### P0.5 Putney as data

- Add `data/waterways/connecticut-river-vernon-pool.json` and `data/locations/putney-landing.json` exactly as 01 6.2 and 6.3 print them (Putney's id `19fe7acb-de20-48c9-b25d-20d5e99d113a`, heading 15, banks VT left and NH right, `water.cross` 0.4, `flow.against` `[[20000, 1.4], [10000, 1.25]]`, thresholds equal to today's `DEFAULTS` without `heading` and `waterOverride`, and the three location bindings and two waterway bindings).
- Add `src/location.js` with `validateLocation`, `validateWaterway`, `validateSlug`, `RESERVED_SLUGS`, `resolveSources(loc, waterway)`, `resolveLocation(record, { waterway, overrides })` (01 8.3; applies a personal `heading` override to a `kind: "heading"` course, 01 8.6) and `effectiveSettings(loc, { overrides })` (01 11.5), which returns plain values only, the threshold keys and `waterOverride`: `GLOBAL_DEFAULTS`, then the location's thresholds, then the overrides (no `_from` map in phase 0; 01 11.5 adds it with the phase 1 Settings dialog, and it must never reach `app.settings` or the suggestion context). `heading` is not in it; it lives in `loc.course` (01 8.3).
- In `src/config.js` add `GLOBAL_DEFAULTS` (today's `DEFAULTS` values for wind, gusts, rain, cold and AQI, and `waterOverride: ''`; the flow keys are not in it, because flow defaults are percentiles or blank, 01 11.2, so Putney's `thresholds` carry 20000 and 28000 and a location without them gets `''`). Add `src/putney.js`, which imports the two JSON files (Vite and Vitest import JSON natively) and exports `PUTNEY_RECORD`, `PUTNEY_WATERWAY` and `PUTNEY = resolveLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY })`. `src/config.js` never imports `src/putney.js` or `src/location.js`, so there is no import cycle. `DEFAULTS` stays as it is until P0.9.
- `test/location.test.js`: both files validate; `resolveLocation` gives lat 42.9607, lon -72.5219, zone `America/New_York`, heading 15; `{ ...effectiveSettings(PUTNEY), heading: PUTNEY.course.heading }` deep-equals today's `DEFAULTS` literal (copied into the test); a heading override of 20 changes the course and nothing else; `index` and two-letter slugs are refused.

Done when: golden passes unchanged (nothing reads `PUTNEY` yet).

#### P0.6 Source adapters next to `SRC`

- Add `src/sources/openmeteo.js` (`wx`, `aq`, `models`), `nws.js` (`alerts`, `obs`), `usgs.js` (`river`, `flow`, `flowDays`), `nwps.js` (`flowFcst`) and `src/sources/index.js` with `SLOT_ORDER = ['wx', 'alerts', 'obs', 'river', 'flow', 'flowDays', 'flowFcst', 'aq', 'models']` (the key order of `SRC` today), `bindingsFor(loc)` and `labelFor(slot, binding)`.
- Each adapter follows 02's `Adapter` typedef (`key`, `slot`, `regions`, `via`, `refreshMs`, `staleMs`, `url(b, loc, now)`, `parse(json, b, loc)`, `label(b)`), plus `hosts` for the CSP test (10.11). `discover` and `attribution` are phase 1. Stored adapter keys stay the provider keys of 01 (`usgs-ogc`, `nwps`, `nws-alerts`, `nws-obs`); the fetchers are 02's catalog entries, derived by `bindingsFor(loc)` (conflict K3). `bindingsFor` returns objects with `slot`, `url` (already built) and `parse`, which is all `fetchAll` needs.
- `bindingsFor(PUTNEY)` must produce exactly today's nine URLs: `river` lists the flow gauge then the temperature gauge (`USGS-01154500,USGS-01161280`) and `parameter_code=00060,00010`; `obs` is `KEEN`; `flowFcst` is `WLPN3`; Open-Meteo parameters in today's order, through `URLSearchParams` as today.
- Labels: `labelFor(slot, binding)` (02's signature) returns today's `SOURCE_NAMES` text, `obs` as `${binding.label} observations` ("Keene observations").
- Move the parser bodies from `src/data.js` into the adapters; `src/data.js` re-exports them under today's names, so `test/logic.test.js` imports keep working. `parseRiver(d, b)` reads the two gauge ids from the binding, with Putney's ids as the default argument until P0.8.
- `staleMs` and `refreshMs` are `null` on every adapter in phase 0 and nothing reads them (conflict K9).
- `test/sources.test.js` (parity): `bindingsFor(PUTNEY).map(b => [b.slot, b.url, labelFor(b.slot, b)])` equals `Object.keys(SRC).map(k => [k, SRC[k](), SOURCE_NAMES[k]])`; each adapter's `parse` deep-equals the old parser on the golden fixtures and on `test/fixtures/sources/` responses if present.

Done when: parity and golden pass.

#### P0.7 Storage keys and migration

- `src/config.js`: `KEYS = { settings: 'rowhether-settings-v2', cache: slug => 'rowhether-cache-v2:' + slug, plan: 'rowhether-plan-v1', install: 'rowhether-install-v1', nudge: 'rowhether-nudge-v1', migrated: 'rowhether-migrated-v1', last: 'rowhether-last-v1' }` and `OLD_KEYS` with today's five names. Remove `SET_KEY`, `PLAN_KEY`, `CACHE_KEY`, `INSTALL_KEY`, `NUDGE_KEY`.
- `src/storage.js`: `migrateStorage()` as 8.3, called at the top of every loader (idempotent); `loadOverrides(slug)`, `saveOverrides(slug, values)` (writes `{ saved: Date.now(), values }` for that slug); `hasSavedSettings(slug)` reads `saved`; `loadCache(slug)`, `saveCache(slug, data, updated)`; plan, install and nudge on the new keys with unchanged shapes. `loadSettings` and `saveSettings` go, and with the `src/settings.js` change below nothing under `src/` but `src/config.js` itself mentions `DEFAULTS` after this step. Every access stays in try/catch.
- `src/state.js`: `const o = loadOverrides('putney-landing')`, `app.loc = resolveLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY, overrides: o })`, `app.settings = effectiveSettings(app.loc, { overrides: o })`. Until P0.9 the code still reads `S.heading`, so in this step `app.settings` also carries `heading: app.loc.course.heading`; P0.10 removes it, after the render code has moved off it.
- `src/main.js`: `loadCache(app.loc.slug)` (line 129) and `saveCache(app.loc.slug, app.data, app.updated)` (line 53). No golden or unit test reaches `main.js`, so the smoke spec below checks it.
- `src/settings.js`: stops importing `DEFAULTS` (P0.9 removes it) and walks its own field list, the keys of `effectiveSettings(PUTNEY)` plus `heading`. `fill()` from `app.settings`, with the heading field from `app.loc.course.heading`; on save, compute the values as today (same rounding and clamping, except that `waterOverride` is saved as a number, or `''` when empty or not a number, since 03 9.2 and 7.5 here take only those), then store only the keys whose value differs from Putney's defaults (`effectiveSettings(PUTNEY)` and heading 15; numbers compared as numbers, `''` kept as a real override), and rebuild `app.loc` and `app.settings`. Reset fills from Putney's defaults.
- `test/storage.test.js` with a `Map`-backed `localStorage` stub and a throwing stub: a full set of old keys migrates (settings to overrides only, cache unchanged, plan, install `{ dismissed, never }` and nudge unchanged, `rowhether-last-v1` set, marker set); a second run changes nothing; step 3 throws once, a setting is saved, and the next run keeps it and finishes steps 3 to 6; a stored `waterOverride` of `"55"` becomes `55` and `"abc"` is dropped; `putney-rowing-install-v1` is not read; old keys remain; with a throwing stub every loader returns its default; saving unchanged settings stores `{ saved, values: {} }` and still hides the reminder.

Done when: golden passes (the golden cases build settings directly), storage tests pass, and the settings dialog round trip is checked in the browser (`smoke.spec.js` gains two checks: change wind caution to 8, reload, the field shows 8; and seed the five old keys, load with every upstream request aborted, the hero shows the cached forecast).

#### P0.8 Data layer from bindings

- `fetchAll(loc)` in `src/data.js` iterates `bindingsFor(loc)`: `fetchJSON(b.url).then(json => b.parse(json, b))`, keyed by `b.slot`, each failing on its own as today.
- `src/main.js` calls `fetchAll(app.loc)`.
- `src/render/hero.js`: "every source blocked" is `bindingsFor(app.loc).every(b => app.errors[b.slot])`; the failure note uses `labelFor`.
- Remove `SRC`, `SOURCE_NAMES`, `GAUGE_FLOW`, `GAUGE_TEMP` and `NWS_GAUGE` from `src/config.js`. `LOC` stays until P0.9.
- `parseFlowDays` keeps `T16:00:00Z` (local noon is phase 1, conflict K11).
- `test/golden/capture.js` now reads `sources` from `bindingsFor(PUTNEY)` and `labelFor`.

Done when: golden and parity pass.

#### P0.9 The model takes the location

- `buildModel(loc, data, S, now = Date.now(), { units, club } = {})` (conflict K14). The model gains `m.loc` and `m.fmt = zoneFormat(loc.tz)`; logic uses `m.fmt` for `dayKey` and `localHour`.
- `sunFor(m, key)` uses `m.loc.lat` and `m.loc.lon`; `sunOn(loc, t)` replaces `sunOn(t)` (callers: five calls on four lines of `src/render/detail/light.js`, lines 27, 34, 36 and 69, and `test/logic.test.js`).
- `windVsCourse` and `chopWind` use `m.loc.course.heading` (today `m.S.heading`, `src/logic.js` lines 65 and 89); the crosswind sentence uses `m.loc.banks` ("Crosswind off the New Hampshire bank." from `right.name` and `word`); "along the straight" uses `course.reachWord`; the literal `10000` becomes the lowest step of `m.loc.flow.against`.
- `chopWind` uses `m.loc.water.cross` and `m.loc.flow.against` instead of `WATER.cross` and `WATER.against`; remove those two fields from `WATER`.
- `src/render/now.js` line 29 (`nowPrecip`) and the River chart's hour ticks (`src/render/detail/river.js` lines 73 and 78) follow 9.2 too. No change at Putney.
- `h0` becomes the start of the forecast hour that contains `now` (9.2). `planSessions` steps on local half hours with `m.fmt.localMinutes`, dropping seconds and milliseconds (9.2).
- Remove `LOC` and `DEFAULTS` from `src/config.js`. `src/state.js` calls `setZone(app.loc.tz)` right after it resolves the location; `src/format.js` keeps its default and never imports `src/putney.js`.
- `test/logic.test.js`: every `buildModel(data, S, NOON)` becomes `buildModel(PUTNEY, data, S, NOON)` and `DEFAULTS` becomes `effectiveSettings(PUTNEY)`; tests that set `heading` pass a location resolved with that override instead. New tests: a synthetic `Asia/Kolkata` location (half-hour `h0`, plan steps at :00 and :30 local), a location with other bank names, and a step test with seconds: from a dawn of 08:36:34.252Z at the dock the next step is 09:00:00.000Z, as today. `test/golden/capture.js`, the other importer of `DEFAULTS`, takes its settings from `effectiveSettings(PUTNEY)` and builds the model with `PUTNEY` resolved with the custom case's heading of 20 (reviewed as test code, 14.1).
- `src/render/index.js` calls `buildModel(app.loc, app.data, app.settings)` (today `buildModel(app.data, app.settings)`, line 12). `src/suggest.js` sends `settings: { ...app.settings, heading: app.loc.course.heading }` as its context, so the issues it files keep the heading line (`worker/suggest.js` lists `heading` among its setting keys).
- Scope: this step changes inputs and signatures only. The new behavior in 01 8.4 (polar fallbacks, `maxAgeH`, tide and level reasons, water modes, the monthly water temperature, per-segment courses) is phase 1.

Done when: golden and every existing test pass.

#### P0.10 Rendering from the location

- `compassSVG(heading, banks, ...)` in `src/render/parts.js` writes `banks.left.short` and `banks.right.short` (today the literals `VT` and `NH`, lines 23 and 24); callers pass `m.loc.course.heading` and `m.loc.banks`. Every render use of `S.heading` (`now.js` lines 49 and 51, `forecast.js` lines 85 and 86, `wind.js` lines 73, 106 and 120) becomes `m.loc.course.heading`. Then, as the last change in this step, `src/state.js` drops the temporary `heading` from `app.settings`; before this step the render code reads it there.
- `src/render/detail/wind.js` table cell "Cross, NH" and "Cross, VT" from `banks.*.short`.
- `src/render/now.js` and `temperature.js`: the gauge and station notes from the bindings' `note` ("Nearest main-stem gauge, near Northfield, MA, about 19 mi downstream.", "North Walpole gauge below Bellows Falls dam, about 16 river miles upstream.", "Keene airport, 14 mi east. A check on the model."), "Measured at Keene" from the obs binding's `label`.
- `src/render/detail/river.js`: the How this works paragraphs from `loc.copy.flowHow` and `loc.copy.flowStats` (today literals at lines 155 and 157).
- `src/share.js`: `${loc.name} rowing, ...` and the title `${loc.name} rowing forecast`.
- Add `fmtFlow(v, unit)` to `src/format.js` for the flow numbers the render code writes today with `fmtInt` and "cfs" (for example `const cfs` in `river.js` line 14).
- Leave `index.html` alone: its title, manifest name, settings notes and credits change in phase 1 (07 15).

Done when: golden passes; `grep -rn "Northfield\|Walpole\|Keene\|New Hampshire\|Vermont\|'VT'\|'NH'" src/` finds nothing outside comment lines (the file comment at `river.js` line 1 names the gauge and stays).

#### P0.11 Units in the logic

- Add `src/units.js` with `unitFormat({ system = 'us', wind = 'auto' } = {})`, the signature and names 07 7.7 prints: `speed(v)` ("12 mph"), `temp(v)` ("38°F"), `dist(m)` (calls today's `visText`), `precip`, `rate`, `vis`, `flow(v, unit)`, `stage`, `speedUnit`, `tempDiff`, `tempSum` and the `to*` converters, plus `aqi(v)`, and the unit words the reasons use (07 7.3, 7.7). Only the US branch is implemented, so phase 2 adds the others without changing a call.
- `buildModel` sets `m.u = unitFormat(units)`, where `units` is the optional `{ system, wind }` in its last argument. Every reason and sentence in `src/logic.js` that writes a unit uses `m.u`, except `confidenceText(c, only, u = unitFormat())`, which has no model: it takes the units as a third argument, and its three callers (`rain.js`, `week.js` and `wind.js` in `src/render/detail/`) pass `m.u`.
- `test/units.test.js`: each function on sample values matches today's strings.

Done when: golden passes.

#### P0.12 Units in the render code

- `src/render/*.js` and `src/render/detail/*.js` write every unit through `m.u` (wind and gust facts, temperatures, rain amounts, visibility, flow, chart axis labels and the hour tables).
- `visText` in `src/format.js` stays as it is, and `src/units.js` `dist` calls it (the format module has no model, so it cannot re-export `m.u.dist`).

Done when: golden passes, and `grep -rnE "mph|°F|cfs| mi\b" src/render` lists only lines that build text through `m.u` or quote a setting's name, checked by hand and noted in the progress file.

#### P0.13 Turnstile action parameter

- `worker/turnstile.js`: `verifyTurnstile(env, token, ip, action = 'suggest')` and `result.action === action` (today the literal `'suggest'`). `worker/suggest.js` unchanged.
- `test/suggest.test.js`: a token for another action is refused.

Done when: all tests pass; the Worker is the same for every current caller.

#### P0.14 Docs and the final proof

- `CLAUDE.md` code map: `src/location.js`, `src/putney.js`, `src/sources/`, `src/units.js`, `data/`, the golden and browser tests, `scripts/budget.mjs`; the storage keys sentence (`rowhether-*`); `buildModel(loc, data, S, now)`. The owner approved CLAUDE.md edits on this branch for phase 0 (HANDOFF).
- Final proof, recorded in `docs/full-app/phase-0-progress.md`:
  1. `npm test` and `npm run build` pass; the test count is today's 109 plus the new tests.
  2. `git diff <P0.1 commit> HEAD -- test/golden/` prints nothing.
  3. `npx playwright test --grep @visual` passes on the machine that made the screenshots, with `maxDiffPixelRatio: 0`.
  4. `timing.spec.js` median within 20% of the P0.2 baseline.
  5. `node scripts/budget.mjs` passes.
  6. The CLAUDE.md browser checklist (Testing) by hand: 390 and 1280 px, light and dark, midday and 9 PM, every tab at 360, 390 and 1280, the install bar, blocked sources, the Dev label with `/api/info` stubbed, Share this forecast copying the same text as before.
  7. An installed copy of the old build updated to the new one keeps its settings, its cached forecast (shown offline at once) and its install bar choice.

### 14.3 What phase 0 does not change

The app name, `index.html`, the manifest, the settings dialog's fields and notes, routes, storage behavior beyond the key names, the Worker routes, `wrangler.jsonc`, the refresh timing, source staleness, `parseFlowDays`, and the USGS API version. Each of these moves in phase 1 or later (conflicts K9 to K11).

## 15. Conflicts between the documents, and the edits made

Each row is a place where two documents disagreed, or where one document's plan could not work with another's. The decision says which side wins and why; the last column names the smallest edit made to the other document in the same commit as this file. "None" means the documents already agree once 08's answer is known.

| Id | Between | Conflict | Decision and why | Edit made |
| --- | --- | --- | --- | --- |
| K1 | 01 11.4, 02, 07 6.7 | 01 feeds a monthly typical water temperature into the cold check; 02 leaves the check off without a reading | Both, read together: a curated monthly value (01 11.4) feeds the cold check, labeled "Typical for October", never steam fog; with no reading and no curated value the check is off (02). Without a reading there is no check at all, so a typical value can only add a caution, and the label says it is not a measurement | 02: graceful degradation row and both cold check Decisions; 07: 6.7 row and the 17 open question |
| K2 | 01 4.4 and 5, 02 | Two different `location_sources` tables | One table: 01's role, mode, priority and ref columns (they serve curated waterway and location bindings) plus 02's `origin`, `fail_count`, `confirmed_by`, `confirmed_at` and statuses (4.3) | 02: a note under "location_sources table" |
| K3 | 01, 02 | Stored adapter keys (`usgs-ogc`, `nwps`) against 02's catalog keys (`usgs-latest`, `usgs-recent`, `usgs-daily`, `nwps-forecast`); `sourcesFor` against `bindingsFor` | Rows store 01's provider keys, one row per gauge; 02's catalog keys name the fetchers `bindingsFor(loc)` derives from that row, so one flow gauge is one row, not three that must agree. The function is 02's `bindingsFor` | 01: 4.3 step 5, 8.1 row 4, 8.5 (`bindingsFor`); 02: a sentence in the catalog intro and the `Binding` typedef |
| K4 | 01, 02 | Slot names `tideStream` and `level` (01) against `current` and no level (02) | 01's names, which match the stored roles `tide_stream` and `level` | 02: slots table, the `waterTemp()` note and the degradation row |
| K5 | 01 7.1, 02, 03 3.7 | 02 puts D1 binding tables, `/api/discover` and `PUT /api/locations/:slug/sources` in phase 1; 01 keeps phase 1 static | 01: phase 1 has no location tables; discovery is a local script over the same module (5.6). D1 tables two phases before locations would need a second source of truth | 02: endpoint auth line, Worker endpoints table, Phases; 03: 3.7, the section 2 table row and the 18 phase 1 row lose `/api/discover` |
| K6 | 01 4.4 and 14.9, 02 | `flow_stats` table (02) against `stats` JSON on the flow binding (01) | 01's: statistics belong to the gauge binding; computed results are cached in `source_cache` for 30 days (6.6) | 02: the `flow_stats` paragraph, steps 6 to 8, the `GET /api/locations/:slug` line, the flow-stats endpoint row |
| K7 | 01 11.3, 02 | Flow defaults p90 and p95 rounded to nearest (02) against p88 and p95 rounded down, with `against` from p65 and p88 (01) | 01's: it reproduces Putney's 10,000, 20,000 and 28,000 exactly from the same data, which 02's rule does not (22,000) | 02: step 4, the discovery sample, the suggestion copy, the flowstats test bullets |
| K8 | 01 15.7, 02 | Health check: stale after 3 failed checks, phase 1 (02) against offline after 3 days and retired after 30, phase 3 (01) | 01's states and phase 3, run by the daily cron at 09:17 UTC (02's minute) | 02: Health checks paragraph and the phase 3 bullet |
| K9 | 02 Phases, 01 8 | 02's phase 0 adds per-slot refresh and staleness, a visible change | The fields exist in phase 0 and are unused; behavior ships in phase 1 with 01's `maxAgeH` | 02: phase 0 bullet |
| K10 | 02 Decision | Switch USGS v0 to v1 in phase 0 "behind the parity test", which requires identical URLs | Phase 1 | 02: the Decision |
| K11 | 01 8.1 row 18, 02 | `parseFlowDays` at local noon in phase 0 | Phase 1; phase 0 keeps `T16:00:00Z`, so the golden files stay equal | 01: row 18; 02: phase 0 bullet |
| K12 | 01 5, 06 23.1 | `locations.steward_club_id REFERENCES clubs` in phase 3, before `clubs` exists | Added by `0010` in phase 5 (verified: a reference to a missing table refuses every insert) | 01: field row and a note at the top of section 5 |
| K13 | 06 18.3 and 22.6, 07 4.4 | `emergency` added by `ALTER` in phase 5, but 07 shows the Safety section from phase 3 | Created in `0003` (phase 3); curated records may carry it from phase 1 | 06: 18.3 block and the 22.6 migration row; 01: field row |
| K14 | 01 8.3, 06 6.9, 07 7.7 | `buildModel(data, S, now, club)` against `buildModel(loc, data, S, now)` and `{ units }` | `buildModel(loc, data, S, now = Date.now(), { units, club } = {})` | 06: 6.9 and 22.4 rows |
| K15 | 03 6.2, 06 | Both name a `CODE_LIMIT` (3 against 5 a minute) | 06's own Decision: its binding is `JOIN_CODE_LIMIT` | 06: 8.5 and 17 (the Decision in 22.6 already says so) |
| K16 | 04 6.2, 05 5.5, 06 8.6 and 21.4 | Three spellings of overdue dedupe keys | 05's `od:<outing>:<stage>:<recipient>` for personal steps; 06 21.4's `odc:<outing>:<stage>:<user>` for club steps. `notify_log` holds one row per recipient, so the recipient must be in the key | 04: 6.2 rule; 06: 8.6 engine line and the 21.4 note |
| K17 | 04 6.2, 06 8.6 | 04's stage 5 "club alert at stage 3" against 06's club chain from `due_at + graceMin` | 06's chain | 04: row 5 |
| K18 | 03 18, 05 | `sendEmail()` in `worker/auth/email.js` against `worker/email.js` | `worker/email.js`: 05 and 06 call it, not only accounts | 03: 18 row |
| K19 | 05 8, 06 21.1 | Notification tables in phase 4, but `notify_log` is needed for overdue in phase 3 and references `notify_prefs` | All three tables in phase 3 (`0008`), with `club` kinds and `subkind` from the start (4.3) | 05: note under section 8 and the `club_id` note; 06: 18.3 and 21.1 lines, the 21.7 SQL comment and the 22.6 row |
| K20 | 05 8 | `notify_log` CHECK blocks deleting an emergency contact | Contact rows carry the rower's `user_id`; CHECK `user_id IS NOT NULL OR kind = 'system'` (verified) | 05: same note as K19 |
| K21 | 05 3.1, 06 21.3 | Quiet hours hold `practice` and restricted `water_status`; 06 releases them when the session starts before quiet hours end | 06's rule: a held 10:30 PM cancellation of a 5:45 AM practice sends people to the dock | 05: two cells in 3.1 |
| K22 | 05 3.9 and 3.10, 06 21.5 | Two sets of club message copy | 06 21.5 | 05: one line under each heading |
| K23 | 05 7.5, 06 20 | Deep links `/club/<slug>` and `?open=practice:<id>` against 06's hash routes | `/club/<slug>#today` and `/club/<slug>#practice/<id>` | 05: two rows |
| K24 | 01 7.2, 7.3, 16.4, 07 4.2 | Shells at `dist/<slug>/index.html`, which `auto-trailing-slash` redirects to `/<slug>/` | `dist/<slug>.html`, excluded from the precache by name (8.4) | 01: 7.2 row, 7.3 bullet, 16.4 bullets |
| K25 | 01 2.2, 07 16 | Reserved slugs: 07 asks for `at`; `index` is missing | Add `index` (a slug `index` would write `dist/index.html`); `at` needs nothing, as slugs are 3 to 48 characters | 01: 2.2 list (the CHECK is in 08 4.4) |
| K26 | 01 11.2, 07 7.4 | Cold line in Celsius "38°C" | 20°C: a sum of two temperatures converts with the offset counted twice | 01: 11.2 row |
| K27 | 01 8.6, 07 9.2 | Cache 5 locations against 10 with an index | 07's 10 with `rowhether-cache-index-v1`: Compare must work offline for favorites | 01: two rows of 8.6 |
| K28 | 01 8.1 row 27, 07 7.9 | Fog "miles" units in phase 7 | Phase 2, when the units choice ships | 01: row 27 |
| K29 | 02, 07 6.7, 01 9.7 | River tab with a message against hidden | Hidden; the sentence lives in Week's River row | 02: degradation row |
| K30 | 03 7 and 15, 07 7.1 | `users.units` lacks `uk` | Add `uk` before the table exists (CHECK lists cannot change) | 03: 7 row and the 15 statement |
| K31 | 03 9.1, 07 8.4 | Synced keys lack `windUnit`, `clock`, `set1` to `set6`, `activeSet` | Add them (7.5) | 03: one row in 9.1 |
| K32 | 03 12.3, 07 14.3 | No analytics against an aggregate open counter | The counter, which is 03's own second alternative, with no identifiers (10.9); the owner confirms | 03: 12.3 Decision, the principle line, the privacy summary line, the 21 Decision |
| K33 | 03 14.3 and 12.8, 06 22.6 | Flag values `true`/`false` against `"1"`/`"0"` | `"1"` and `"0"` for every flag, compared with `=== '1'`, so an unset flag is off | 03: three lines |
| K34 | 03 5.1 and 12.4, 06 8.5 | "The only cookie" against the kiosk cookie | Both cookies exist; `rw_kiosk` only on a paired club screen | 03: two lines |
| K35 | 01 8.6, `src/config.js` | 01 migrates `putney-rowing-install-v1`, but the code moved to `putney-rowing-install-v2` with a new shape | Migrate `-v2` unchanged; ignore `-v1`, as the code does (8.3) | 01: 8.6 row and step 4 |
| K36 | 04 6.1, 05 7.6 | Stop and unsubscribe links act on `GET` | `GET` shows a page with one button; `POST` acts, because mail scanners open links | 04: the stop link line; 05: the email bullet |
| K37 | 03 5.6, 05 2.2 | The `Origin` check refuses RFC 8058 one-click unsubscribe posts, which mail servers send | Exempt `POST /api/notify/unsubscribe`; it acts only on its own HMAC token | 03: one item in 5.6 |
| K38 | 04 11 | Phase 2 row gives signed-in reports weight before the table has the column | Weight and badge come with phase 3 | 04: phase 2 row |
| K39 | 06 24.6, 07 10.6 | `scripts/bundle-budget.mjs` against `scripts/budget.mjs` | `scripts/budget.mjs` with `budget.json` (11.2) | 06: 24.6 bullet |
| K40 | 07 10.2, today's build | 07's phase 0 HTML budget (3.6 KB) is below today's 3,618 B | Rebased budgets in 11.2 | 07: a line under the 10.2 table intro |
| K41 | 01 12.2, 02 | `GET /api/discover?...&type=` against `&water=` | `water` (02 owns the endpoint) | 01: 12.5 line |
| K42 | 03 7, 04 6.1, 06 5.2 | A rower's phone and a guardian's shared phone have no column | `users.phone`, `users.phone_for_contacts`, `memberships.share_phone` (4.3) | 03: one row in 7 |
| K43 | 01 8.7, 14 here | Golden files from "recorded real responses" for chosen conditions, which cannot be recorded on demand | Synthetic scenarios with every source (14 P0.1) | 01: 8.7 first bullet |
| K44 | 06 6.6, 07 11.2 | `#clubLine` against `#rowAs` | `#rowAs`, one line for club rules and limit sets | 06: 6.6 bullet and the 22.4 `index.html` row |
| K45 | 05 7.1, 07 5.12 | Where the after-sunset entry line sits | 07's placement under the "At the dock" panel | 05: the first entry row |
| K46 | 02, 03 16.1, 04, 06 | 401 code `not_signed_in`, `signed_out`, `sign_in` | `sign_in` (two documents use it; 7.2) | 03: 16.1 row; 02: discovery errors line |
| K47 | 03 11.2 and 12.9, 04 8.5 | Flag reason `under_13` and status `content_deleted` missing | Added to the CHECK lists (4.3) | 04: 8.5 reasons and statement |
| K48 | 03 11, 06 4.5 | 06 assumed every minor's account needs a guardian | 03's rules: 13 to 17 may hold accounts with junior defaults; joining a club as a junior needs a linked guardian's approval | 06: 4.5 opening and the age-up line |
| K49 | 03 5.7, 05 6.2, CLAUDE.md | `AUTH_PEPPER` as a plain Preview var; VAPID as Preview secrets; "No secrets are set for Previews" | Dev-only values as Preview secrets, plain vars as fallback, never production values (6.5); CLAUDE.md changes with the owner's approval | 03: 5.7 cell and the 18 phase 2 row |
| K50 | 03 16.7, 06 19 | 06 routes every `/api/me/juniors/` path to clubs, but 03 owns `/api/me/juniors/:linkId` | 06 takes only the exact `.../:membershipId/approve` pattern (3.5) | 06: 19 intro |
| K51 | 04 3.8 and 3.9 | Idempotent `clientId` with no column to store it | `reports.client_id` and `reports_client` (4.3) | 04: 3.8 opening line |
| K52 | CLAUDE.md, 04, 07 | A production database in phase 2 would turn reports on (`reports: !!env.DB`) before phase 3 | `REPORTS_ENABLED` flag (6.3) | None |
| K53 | 03 19, 05 5.1 | Workers Paid "at phase 2" against "before phase 3" | Phase 2; both hold | None |
| K54 | 06 22.4, 07 4.4 | `src/render/safety.js` in phase 5 against the Safety section in phase 3 | Phase 3 | 06: 22.4 row |
| K55 | 06 22.3, 8.4 here | `src/club/index.js` would build a second `index-*.js` chunk | `src/club/club.js` | 06: 22.3 row |
| K56 | 01, 04, 05, 06 | "03's `auth_session` cookie" | The cookie is `__Host-rw_session`; `auth_sessions` is its table | 01: 14 intro; 04: 3.5 step 7; 05: 9 intro; 06: 19 intro |
| K57 | 02 Phases, 07 15 | The picker map in phase 1 against phase 3 | Phase 3 (07 owns screens) | 02: phase 1 bullet |
| K58 | 04 5.7 and 9, 06 8.1 | 04 adds `outings.club_id` in phase 5 and `boat_id` in phase 6 by `ALTER`; 06 creates them in phase 3 | 06's (outings must allow a null `user_id` from the start, 5.2 rule 4) | 04: 5.7 line and the 9 note |
| K59 | 03 20.1, 04 12 | Migration tests on `node:sqlite` against Miniflare | Both: the helper in `npm test`, the wrangler local apply in CI (13.1) | None |
| K60 | 02 Decision, 07 10.4 | Map sizes "unverified" in 02 | 07 measured them | 02: the map Decision |
| K61 | 03 17.1, 07 4.3 | Account button placement and whether Refresh becomes an icon | 07's measured layout: right of the title row, Refresh stays text | 03: 17.1 line |
| K62 | 04 3.2, 07 5.10 | Report button "next to Share" outside daylight | 07's "At the dock" panel under the hero | 04: 3.2 line |
| K63 | 06 6.7, 07 5.8 | "Which crews can go" table scrolls sideways at 360 px | One panel per crew type below 46 rem | 06: one sentence in 6.7 |
| K64 | 03 14.4 | CSP `connect-src` generated from the adapter catalog | Hand-written header with a test against the catalog (10.11) | 03: 14.4 line |
| K65 | 03 12.9 and 20.2, 04 4.7 and 8.5 | `hazards.ended_by` and `flags.resolved_by` reference `users` with no ON DELETE action, which blocks account deletion and fails 03's test; `hazards.created_by` needs the reassignment 03 12.9 describes | SET NULL for both; `created_by` stays NOT NULL with no action and is reassigned first (4.1) | 04: the three columns in 4.7 and 8.5 |

## 16. What 08 settles

Every place 01 to 07 deferred to this document (`grep -n '08' docs/full-app/0*.md`, 2026-10-18, plus the deferrals worded without the number).

| Asking doc and section | Question | Answer | 08 section |
| --- | --- | --- | --- |
| 01 scope, 02 scope, 03 scope, 04 scope, 05 scope, 06 scope, 07 scope | Canonical schema, migration numbering, bindings list, Worker structure, storage key list, API index | This document | 3 to 8 |
| 01 5 | Number and order of the locations migration; users and clubs "must exist first" | `0003` and the seed `0004` in phase 3 after `0002`; clubs come later, so `steward_club_id` is added by `0010` | 4.4, 5.1, K12 |
| 01 5 notes | Does `wrangler d1 export` handle FTS5? | No: a full export refuses virtual tables; `--table` works. Backups use Time Travel | 4.5 |
| 01 8.6 | The canonical storage keys | 29 keys by phase, and the migration | 8.2, 8.3 |
| 01 14 | Auth and API conventions | `__Host-rw_session`, JSON errors, cursors, caching | 7.1, 7.2 |
| 01 14.9 | Flow statistics cache: Cache API or KV | D1 `source_cache`, 30 days; no KV | 6.6 |
| 01 15.7 | Health check scheduling | Daily `17 9 * * *` in phase 3; offline at 3 days, retired at 30 | 6.4, K8 |
| 02 location_sources | Canonical binding tables | Merged `location_sources`; no `flow_stats`; `source_cache` kept | 4.3, K2, K6 |
| 02 Endpoint, Worker endpoints | `DISCOVER_LIMIT` and `SOURCE_LIMIT` ids; discovery in phase 1 | 1007/1008 and 1029/1030; phase 1 discovery is a local script | 6.2, 5.6 |
| 02 source_cache Decision | D1, KV or Cache API for station lists | D1, agreed | 6.6 |
| 03 6.2 | Rate limit ids 1011 to 1014 | Kept | 6.2 |
| 03 14.4 | Final headers and a CSP generated from the catalog | Final header for phase 1, hand-written, with a test | 10.11, K64 |
| 03 15 | File names `00NN_accounts.sql`, `00NN_guardians.sql` | `0002_accounts.sql` (phase 2), `0011_guardians.sql` (phase 5) | 5.1 |
| 03 15 notes | Add foreign keys if locations reach D1 before phase 2 | They do not; `home_location_id` and `favorites.location_id` stay plain, checked in code | 4.1 |
| 03 20.2 | A test that no reference to `users` lacks an ON DELETE action | Kept, with `hazards.created_by` as the one reassigned exception | 4.1, 13.2 |
| 03 5.8, 04 8.9, 05 | Who runs cleanup | The daily cron in `worker/index.js` `scheduled()`, phase 3 | 2.3, 6.4 |
| 03 16, 04 3.3, 05 9, 06 19 | The cookie that carries the session | `__Host-rw_session` | 7.1, K56 |
| 04 3.8 | File number for the reports rebuild | `0005_reports_locations.sql`, with `client_id` | 4.4, K51 |
| 04 3.10 | Production D1 in phase 2 or 3 | Phase 2, with reports held off by `REPORTS_ENABLED` until phase 3 | 5.4, 6.3 |
| 04 8.2 | Ids for `HAZARD_LIMIT`, `FLAG_LIMIT`, `OUTING_LIMIT` | 1009/1010, 1015/1016, 1017/1018 | 6.2 |
| 04 8.7 | The audit log, "08 and 03 define it" | One definition with kinds, actions and retention | 10.7 |
| 04 9 | Schema order | `0005` to `0007`; club columns as K58 | 5.1 |
| 04 13 | Do production reports start with dev's rows? | No; dev rows stay on dev for tuning | 5.4 |
| 05 8 | The notification tables | `0008` in phase 3, with 06's changes and a corrected CHECK | 4.3, K19, K20 |
| 05 8 | `notify_prefs.club_id`: no FK or a phase 5 rebuild | No FK, checked in code | 4.1 |
| 05 5.1, 5.6 | Crons and queues on Previews | Crons are top level only; dev uses `POST /api/admin/tick`; Preview queue names given, consumer behavior unverified | 6.1, 6.4 |
| 05 6.2 | VAPID keys on Previews | Their own pair as Preview secrets | 6.5, K49 |
| 05 9 | A rate limit for push and alert writes | `NOTIFY_LIMIT` 1019/1020 | 6.2 |
| 06 4.5 | Minors, if 03 decides differently | Reconciled to 03's rules | K48 |
| 06 17, 22.6 | Ids for `CLUB_LIMIT`, `JOIN_CODE_LIMIT`, `KIOSK_LIMIT`, `CAL_LIMIT`; `CLUBS_ENABLED` | 1021 to 1028; `"0"` in production until the owner turns it on | 6.2, 6.3 |
| 06 18, 18.3, 21.7 | Club schema and the additions to fold into 18.2 | `0009` to `0012`, with `verify_*`, `share_phone` and `practices.check_at` | 4.4 |
| 06 18.3 | `audit_log` is 08's table | 10.7 | 10.7 |
| 06 20, 23.2 | The Now bundle budget for clubs | 4,000 B gzip in phase 5's step | 11.2 |
| 06 21.1 | Changes to 05's tables | In `0008` from the start | K19 |
| 06 21.4 | One spelling of the club overdue key | `odc:<outing>:<stage>:<user>` | K16 |
| 06 23.1 | Migration order for clubs | `0009`, then `0010` and `0011`; `0012` in phase 6 | 5.1, 5.2 |
| 06 24.6 | The bundle budget script | `scripts/budget.mjs` | 11.2, K39 |
| 06 25 | Cross-document items | Settled as K12, K15, K16, K17, K19, K21, K22, K23; the 21.6 and 21.7 engine additions stand as 06 wrote them | 15 |
| 07 10.2 | The budget table | Rebased | 11.2, K40 |
| 07 14.3 | Analytics Engine bindings, if the counter is accepted | `OPENS` and `ANALYTICS_SQL` in phase 1; the counter is adopted, owner to confirm | 6.4, 10.9 |
| 07 16 | Canonical keys, chunk names, budget, analytics bindings; requests to 01 to 06 | 8.2, 8.4, 11.2, 6.4; the requests are K24 to K31, K44, K45, K60 to K63 | 8, 15 |
| 07 17 | The cold check conflict | K1 | K1 |
| HANDOFF steps 6 to 8 | The phase 0 build | Commit by commit | 14 |

## 17. Open questions and decisions

### 17.1 Decisions in this document

Decision: A small route table per area, dispatched by prefix, with no router library. (3.5)
- Alternative: Hono or itty-router.
- Alternative: keep the if-chain in `worker/index.js`.

Decision: Apply a migration to `rowhether-dev` only with the merge into `dev` of the code that needs it. (5.4)
- Alternative: a separate Preview database for `dev-full-app`.
- Alternative: only additive migrations, with `0005` keeping the old insert working.

Decision: Phase 1 discovery is a local script over the module the phase 3 route uses. (5.6)
- Alternative: `GET /api/discover` behind Cloudflare Access in phase 1.
- Alternative: no discovery tool in phase 1.

Decision: Previews get their own values for the four dev-only private keys, as Preview secrets, or plain vars if Preview secrets cannot be set. (6.5)
- Alternative: no secrets on Previews; accounts and push tested only locally.

Decision: No KV. D1 `source_cache` for long-lived Worker data, the Cache API for short-lived upstream copies. (6.6)
- Alternative: Workers KV for the long-lived entries.
- Alternative: the Cache API for everything.

Decision: Adopt the aggregate open counter in phase 1, with no identifiers, once the owner confirms. (10.9)
- Alternative: Tier 0 counts only.
- Alternative: Cloudflare Web Analytics.

Decision: A curated monthly typical water temperature feeds the cold check, labeled, never steam fog; with none, the check stays off. (K1)
- Alternative: 02's rule only: no cold check without a reading.
- Alternative: an estimate from recent air temperature (02's alternative).

Decision: Flags are the strings `"1"` and `"0"`, and `REPORTS_ENABLED` keeps reports off on production until phase 3. (6.3, K33, K52)
- Alternative: booleans in `wrangler.jsonc` `vars` (JSON types), compared loosely.

Decision: Keep `safeguarding` audit rows 7 years, subject to legal review. (10.7)
- Alternative: 3 years, as admin and moderation rows.

### 17.2 Waiting on the owner

| Item | Needed by | Section |
| --- | --- | --- |
| Confirm the aggregate open counter and its privacy sentence | phase 1 | 10.9 |
| Cloudflare Access application and its `ACCESS_AUD` values for production and Previews | phase 1 | 6.3 |
| Workers Paid plan | phase 2 | 12 |
| Create the production D1 database `rowhether`; record the Time Travel bookmark before each production migration | phase 2 | 5.4 |
| Approve the CLAUDE.md changes: Preview secrets, the Turnstile sentence, the storage keys, the code map | phase 0 (code map), phase 2 (the rest) | 6.5, 10.8, 14 |
| Open-Meteo API plan for server-side forecasts | phase 4 | 12 |
| Turn `CLUBS_ENABLED` on in production | after phase 5 | 6.3 |
| Legal review of retention, including 7 years for safeguarding rows | phase 5 | 10.7 |

### 17.3 Unverified, with when to check

| Item | Check | When |
| --- | --- | --- |
| How Preview-only secrets are set, and whether the dashboard allows them | Workers dashboard, Settings, for the `rowhether` Worker | before phase 2 |
| Whether Preview deployments run cron triggers or queue consumers | Deploy a test branch with both and watch the logs | phase 3 |
| Whether `wrangler d1 migrations apply --remote` runs each file in one transaction | Read the wrangler source or test on a scratch database | before `0005` on dev |
| The `dev` Preview host name (`AUTH_HOSTS`, `PUBLIC_ORIGIN`) | The Preview URL in the Cloudflare dashboard | phase 2 |
| Whether Turnstile's testing secret returns an `action` | One siteverify call with the testing keys | phase 2 |
| Vite 8.3.1's lazy chunk names | `scripts/budget.mjs` reports missing names on the first build that adds a chunk | phase 1 |
| MapLibre's need for `blob:` in `img-src` and `worker-src` | The phase 3 browser test with the map open | phase 3 |
| `crypto.subtle.timingSafeEqual` in Workers | The workerd test run | phase 2 |
| `node:sqlite` unflagged from Node 22.13 | Node's changelog | phase 2 |
| D1 enforcing foreign keys by default; `RETURNING` support | A scratch database | phase 2 |
| Workers Free 100,000 requests a day | The pricing page | phase 1 |
| Rendering differences between the container's Chromium and CI's | Run the `@visual` spec in CI once; if it passes, keep it in CI | phase 0, P0.3 |
