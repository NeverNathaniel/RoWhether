# RoWhether for all rowers: the plan

Start here. This page says what the plan is, what people get, which file covers what, and what the owner has to decide or do. The rest of the folder is detail.

## What the plan is

RoWhether today is an app for the Putney Rowing Club docks at Putney Landing, VT. The plan turns it into an app for all rowers. It adds locations anywhere, check-ins and reports from the water, accounts, and clubs. It is built in phases, 0 to 7, so each step ships on its own and Putney keeps working the same way throughout. The phase list is in `09-roadmap.md`.

Three rules hold in every phase:

- The forecast and the verdict (Go, Caution or Stay off) never need an account, for any location.
- Putney Landing looks and behaves as it does now until a later phase says otherwise. Phase 0 proves this with golden outputs, screenshots and a timing baseline.
- Weather and river data stays in the browser, fetched from keyless sources. The Worker holds keys, shared state and anything that must run with the app closed.

## What people get

Individual rowers:

- Any location, found by search, Near me, a list or a map. Locations start as a reviewed list and grow when signed-in rowers add them.
- The same verdict, wind against the course, fog, water state and plans at every location, in the viewer's units and clock.
- Favorites, a compare view of their places, and limit sets for each kind of boat.
- A night-before outlook and an update before first light, by push or email.
- A row log, and a quick look at the forecast for any point, not only saved locations.

People reporting conditions:

- One-tap reports of the water at any location, with choices that fit the water type. Signed out is allowed.
- Hazards pinned to the water, such as a snag or a closed dock, with confirm and clear votes. Posting needs an account.
- Start a row and I'm back, which feed a count of boats on the water.
- Float plans: emergency contacts are emailed if the rower is overdue, and each contact has a status page.

Clubs and coaches:

- A club page, members, roles, groups and clearances.
- The club's own safety rules applied to each member's verdict, and a table of which crews can go.
- A water status (open, restricted, closed) set by the person in charge, with a reason and an end time.
- In phase 6: boats and damage reports, practices with RSVP and attendance, lineups, boat booking, calendar feeds and announcements. Announcements are broadcast only, with no private messages.
- Guardians of juniors see club outings through the club.

Safety officers:

- A board of boats on the water, a kiosk for the boathouse, and overdue escalation to safety officers and guardians.
- A warning, recorded but never blocking, when a row starts against club rules or a closed water status.
- Emergency information for each launch site, an incident and near-miss log with export, and a link to the national form.

## How to read the plan

| File | What it covers |
| --- | --- |
| `01-locations.md` | The location and waterway record, source bindings, Putney as the first record, the curated list, generalizing the logic (phase 0), water types, course geometry, per-location limits, adding and editing locations. |
| `02-data-sources.md` | Every data need by region, the source adapters, discovery of gauges and stations, default flow limits, Open-Meteo limits and cost, attribution, and what the app does when a source is missing. |
| `03-accounts-and-privacy.md` | Sign-in with passkeys and emailed codes, sessions, settings sync, roles, minors and safeguarding, privacy, terms and the legal review list, security, account deletion. |
| `04-reports-and-check-ins.md` | Conditions reports, hazards, outings, float plans and overdue escalation, the row log, trust and moderation. |
| `05-notifications.md` | Push, email and in-app alerts, alert rules and quiet hours, the cron and queue engine, Web Push on Workers, costs. |
| `06-clubs.md` | Clubs, memberships and roles, club rules, water status, the board, kiosk and incident log (phase 5), then boats, booking, practices, lineups, calendars and announcements (phase 6). |
| `07-product-and-ux.md` | Who uses the app and their journeys, routes, the header and tabs, every new screen, copy, units and time, offline use, performance budgets, accessibility, browser tests, privacy-friendly metrics. |
| `08-architecture.md` | How the parts fit, the repository layout, the canonical D1 schema and migration order, bindings, every API route, storage keys, security, budgets, costs, tests, the Phase 0 build sequence, and the conflicts it settled. Where it disagrees with 01 to 07, it wins. |
| `09-roadmap.md` | The phase list: goal, what ships, dependencies, migrations, owner tasks, exit criteria and risks for each phase. |
| `HANDOFF.md` | The state of the work and a log, for whoever picks it up next. |
| `phase-0-progress.md` | The step log of the Phase 0 build. |
| `reviews/` | The two reviews of the plan: `consistency.md` and `people-safety.md`. Every finding is marked Applied, Skipped or Owner. |

## The architecture in brief

The app stays a static shell that builds the verdict in the browser and fetches forecasts, gauges and alerts straight from keyless sources, so it still works offline from the last good data. One Cloudflare Worker, `rowhether`, serves the static files and answers only `/api/*`. From phase 2 it uses a D1 database for accounts, and from phase 3 for locations, reports, outings and notifications. A cron tick runs every minute and a queue delivers email and push. Details are in `08-architecture.md` sections 2 and 3.

| Part | Where it runs | From | What it does |
| --- | --- | --- | --- |
| App shell and verdict | Browser | today | Draws every screen, builds the model, keeps settings and the last good data in `localStorage` |
| Forecast, gauges, alerts | Browser, keyless sources | today, more sources in phases 1 and 7 | Open-Meteo, NWS, USGS, NWPS, and later tides and other countries |
| Worker routes | Worker | today | `/api/info`, `/api/suggest`, dock reports; accounts in phase 2, community features in phase 3, clubs in phase 5 |
| D1 database | Cloudflare | phase 2 on production, now on dev | Accounts, locations, reports, hazards, outings, notifications, clubs |
| Tick and daily run | Worker cron | phase 3 | Overdue steps, due alerts, cleanup, retention, source health checks |
| Delivery queue | Cloudflare Queues | phase 3 for email, phase 4 for push | Sends push and email with retries |
| Open counter | Analytics Engine | phase 1 | Counts app opens per location, with no identifiers |
| Server-side forecasts | Worker with an Open-Meteo key | phase 4 | Lets alerts be built with the app closed |
| Warning feeds without CORS | Worker proxy routes | phase 7 | Met Office, MeteoAlarm, MetService, METAR |

## Decisions waiting on the owner

This table lists every open decision in `01` to `08` that needs the owner. That means a choice about what people see, money or vendors, law and privacy, a hard constraint in `CLAUDE.md`, or a fact only the owner can supply. It also holds `08` section 17.2 and the two Owner lines in the reviews (the map tiles and the parent's permission). Purely internal choices are not listed: the router, the cache store, column names and similar. Each of those has a recommendation in its document, and the build follows it unless the owner objects.

Rows run by the phase that needs the answer first. Phase 0 needs no answer: the owner has approved the `CLAUDE.md` edits for it. Each recommendation is what the document recommends. "None given" means the document asks the question without recommending.

| Needed by | Question | Recommendation | Where |
| --- | --- | --- | --- |
| Phase 1 | Confirm the aggregate open counter and its privacy sentence | Yes. One count per app start with the location, first visit or return, and home screen or browser. No address, device or account. Kept three months | 08 10.9 and 17.2; 07 14.3; 03 12.3 |
| Phase 1 | Set up the Cloudflare Access application and give the `ACCESS_AUD` values for production and Previews | Needed for the Metrics tab. Access also stays in front of the owner tools after phase 2 | 08 6.3 and 17.2; 03 3.7 |
| Phase 1 | Name the app RoWhether from phase 1, with manifest id `/` | Yes. Home screen names set at install cannot change later | 07 6.3 and 17; 01 17 |
| Phase 1 | What `/` shows on a first visit | For 90 days after phase 1, open Putney Landing with "Not your water? Pick a location." | 01 7.4 and 17; 07 3.1 |
| Phase 1 | What `/` shows after the 90 days for someone who never picked a location | Show the picker. The other option is to store Putney as their location on the first visit | 07 17 |
| Phase 1 | Putney alerts: use the NWS zones instead of the dock point, and correct the footer and `CLAUDE.md` | Yes. Bind VTZ015, VTC025, NHZ011 and NHC005 in phase 1. The point resolves to GYX and NHZ011, not ALY and VTZ015 | 01 6.1 and 17; 02 Summary of findings 9 |
| Phase 1 | Compass bank labels turn with the river, a small visible change for Putney | Yes | 01 10.5 and 17 |
| Phase 1 | Water state at every water type | Information only, until dock reports can tune it | 01 11.2 and 17 |
| Phase 1 | Cold check when there is no live water temperature | Use the monthly typical value, labeled typical, never for steam fog. With none, the check stays off | 01 11.4 and 17; 02 Graceful degradation; 08 K1 |
| Phase 1 | Tides and tidal currents | Information only, no change to the verdict | 02 Graceful degradation |
| Phase 1 | NWS marine warnings (Small Craft Advisory, Gale Warning, Storm Warning, Special Marine Warning) | Treat as Stay off. The other option is Caution | 02 Open questions and decisions |
| Phase 1 | Default limits for a new location from its flow history | 88th percentile for Caution, 95th for Stay off, rounded down to two figures. Reproduces Putney's 10,000, 20,000 and 28,000 | 01 11.3 and 17; 08 K7 |
| Phase 1 | Which candidate locations ship first, which clubs confirm their dock points, and whether Hartford is river or tidal | None given. Every row except Putney in 01 7.5 needs the owner's confirmation and a dock point set on a map | 01 7.5 and 17 |
| Phase 1 | The contact string in the Worker's User-Agent for NWS, Nominatim and aviationweather.gov | A dedicated address the owner chooses, for example a data@ address on rowhether.com | 02 Open questions and decisions |
| Phase 1 | Tab bar and navigation | Keep the tab bar for one location's parts. The location name opens the switcher and the account button opens Account | 07 4.5 and 17 |
| Phase 1 | Approve the `CLAUDE.md` changes for phase 1: the app name, the navigation sentence, the "Saved" label, the test list, the NWS office, and a service worker sentence that includes the curated location files | Approve | 08 17.2 and 8.4; 07 4.5, 6.7, 13 and 16; 01 6.1 |
| Phase 1 | Putney facts to confirm on site: the 15 degree course heading, the Vernon pool limits, and whether the temperature note gives river miles (24.8) or straight-line miles (19.3) | Confirm the heading on site, with a polyline if the reach bends. None given for the others | 01 17; 02 Open questions and decisions; CLAUDE.md Open items |
| Phase 1 | Tidal stream limits (2.0 and 3.0 knots, multipliers at 1.0 and 2.0) | None given. They are first guesses and need local knowledge, for example from the Thames, the Potomac or Oakland | 01 17 |
| Phase 2 | Move the Cloudflare account to Workers Paid | Yes, at the start of phase 2. $5 a month minimum. The other option is to stay on Free and drop server-side forecasts and email to contacts | 08 12 and 17.2; 03 14.5 and 19; 05 5.1 |
| Phase 2 | Create the production D1 database `rowhether` and record a Time Travel bookmark before each production migration | Do it before the phase 2 merge to `master` | 08 5.4 and 17.2 |
| Phase 2 | Lawyer review of the terms, the privacy notice and the minors approach | Yes, before phase 2, again before phase 5 and phase 7. The other option is a template for phase 2 | 03 13.5 and 21 |
| Phase 2 | Must the terms require a parent's permission for 13 to 17 year olds, and how is it collected? (Owner line, review P32) | Say what sign-up does: 13 or older, junior protections, club joins need a guardian's approval. The lawyer answers item A | 03 13.1, 13.5 and 21; people-safety P32 |
| Phase 2 | Sign-in methods | Passkeys plus emailed 6-digit codes, no magic links, no Sign in with Google or Apple at launch | 03 3.1, 3.2 and 21 |
| Phase 2 | Email provider for sign-in codes | Cloudflare Email Service on Workers Paid. The others are Resend Free and Postmark | 03 3.5 and 21 |
| Phase 2 | Account recovery and deletion | No recovery without the email or a passkey. Delete accounts at once, with no grace period | 03 4.6, 4.10 and 21 |
| Phase 2 | Session lifetime | 180 days idle, 400 days absolute | 03 5.3 and 21 |
| Phase 2 | Widen the Turnstile exception in `CLAUDE.md` to every form that needs it | Yes, with the sentence in 08 10.8 | 03 6.3; 04 8.3; 08 10.8 |
| Phase 2 | Favorites without an account | They work signed out. An account only syncs them | 03 8 and 21 |
| Phase 2 | Age at sign-up | Ask month and year of birth from everyone and store only the date they stop being a junior. No accounts under 13 and no parental consent process | 03 11.2 and 21 |
| Phase 2 | Units and clock | Auto follows the viewer's locale. Browsers that used the app before phase 2 are pinned to US units and the 12-hour clock. The choice ships in phase 2 | 07 7.2, 7.9 and 17 |
| Phase 2 | What a limit set holds | Boat limits only. They apply at every location, and the set in use is chosen per location | 07 8.4 and 17 |
| Phase 2 | Retention of admin and moderation audit rows | 3 years. The other option is 1 year | 03 14.2 and 21; 08 10.7 |
| Phase 2 | Which law governs the terms | Vermont law. The other option is no clause until a lawyer advises | 03 13.1 and 21 |
| Phase 2 | Approve the `CLAUDE.md` changes for phase 2: Preview secrets, the Turnstile sentence, the Worker routes list, the new secrets, the no private messages rule and the storage keys | Approve | 08 17.2, 6.5 and 10.8; 03 18 |
| Phase 3 | Lawyer questions before phase 3: whether float plans and overdue alerts create a duty if they fail, and user-entered limits and emergency details shown as the basis of a verdict | Take items 1 and 2 of the 03 13.5 list to the lawyer. Ask the email-law question (item 6) early, as contacts can be anywhere | 03 13.5 |
| Phase 3 | Open licence for community location data | License it openly (ODbL or CC BY-SA). The other option is a non-exclusive license for RoWhether only | 03 13.1 and 21 |
| Phase 3 | May map tiles, style, sprites and glyphs load from `tiles.openfreemap.org` at runtime as data? (Owner line, review C41) | Yes, with this `CLAUDE.md` sentence: "Map tiles, styles, sprites and label glyphs load from OpenFreeMap only when a map is opened. They are data, never part of the app shell." The other option is to self-host the style, sprites and glyphs | 08 17.2 and 10.11; 02 Map tiles and Open questions; people-safety C41 |
| Phase 3 | Map library | MapLibre GL JS from npm, loaded only when a map opens, never precached, with OpenFreeMap tiles. No map in phases 1 and 2 | 07 10.4 and 17; 02 Map tiles |
| Phase 3 | Search box in the add flow | Photon for boathouse names, Open-Meteo geocoding for towns. Declining drops the box and the Photon host | 02 Place search and Open questions; 08 10.11 |
| Phase 3 | Do community locations wait for approval? | No. They go live as published with a "Community added" note and moderators review afterward | 01 12 and 17 |
| Phase 3 | Limits at a location that is not verified (review P2) | No limit looser than the global defaults, and the creator changes limits, sources or course only by suggestion. The hero says when limits differ | 01 11.1, 13.1 and 17; 07 6.7 |
| Phase 3 | A second route for overdue emails and an alert to the owner that does not depend on email (review P1) | Resend on its free tier for overdue email only, and an outside uptime monitor that polls `GET /api/health` and pushes to the owner's phone. The others are Twilio SMS for overdue only, or neither | 05 5.2, 5.7 and 13; people-safety P1 and P3 |
| Phase 3 | SMS | None at launch | 05 2.3 and 13 |
| Phase 3 | Reports at every location | Keep one-tap reports anonymous, with Turnstile for signed-out reporters and rate limits for everyone | 04 3.3 and 13 |
| Phase 3 | The "at the dock" check | Opt-in. The browser computes near, far or unknown and sends only that word | 04 3.4 and 13; people-safety P24 |
| Phase 3 | What reported water temperature and hazards do | Information only. They never change Go, Caution or Stay off | 04 3.6, 4.1 and 13 |
| Phase 3 | Who can post a hazard | Signed-in accounts, with notes screened before they show | 04 4.2 and 13 |
| Phase 3 | Wording for outings | "Start a row" and "I'm back", not "Sign out" and "Sign in" | 04 5.2 and 13 |
| Phase 3 | Public count of boats on the water | Show it only at 2 or more | 04 5.5 and 13 |
| Phase 3 | Can an emergency contact end the escalation? | Yes, from their own status link. A safe mark asks one confirmation and tells the rower and the other contacts | 04 6.3 and 13; people-safety P9 |
| Phase 3 | Float plans | Ship in phase 3 with email reminders, and add push in phase 4 | 04 6.6 and 13 |
| Phase 3 | Crew on an outing | Names only until phase 5, then club members can be linked with their consent | 04 13 |
| Phase 3 | Photos | None in phase 3 | 04 8.8 and 13 |
| Phase 3 | Keeping report content | Keep it indefinitely for tuning, with identity stripped on schedule | 04 8.9 and 13 |
| Phase 3 | Dev reports when production gets a database | Do not copy them. Export them for tuning | 04 13; 08 5.4 |
| Phase 3 | What account deletion does to reports | Delete report text and photos, keep the choices without a name | 03 12.9 and 21 |
| Phase 3 | Live boat tracking | None in any phase | 03 12.2 and 21 |
| Phase 3 | Juniors' posts and quiet hours | Hold juniors' public free text for moderator review. Junior quiet hours 10 PM to 6 AM | 03 11.3 and 21 |
| Phase 3 | Quick look at any point | Offer it from phase 3 as `/at/<lat>,<lon>`, labeled as not a saved location | 07 5.4 and 17 |
| Phase 4 | Open-Meteo plan for server-side forecasts | Buy API Standard when phase 4 starts, about $29 a month for 1 million calls. The price is unverified. Without it, evening outlooks risk 429 errors | 02 Open-Meteo and Open questions; 05 10; 08 12 and 17.2 |
| Phase 4 | Who can have push and alert rules | Signed-in accounts only | 05 13 |
| Phase 4 | Which NWS alerts notify, and when | Stay off level by default, with "All NWS alerts" as an option. Timed alerts ignore quiet hours. Unscheduled ones are held, except overdue, water closed and Stay off level alerts | 05 3.1, 4.4 and 13; people-safety P6 |
| Phase 4 | Timing defaults and the open record | Night-before at 8 PM. Overnight check 75 minutes before first light, not before 4 AM. Record when a notification is tapped, for the owner's stats only | 05 13 |
| Phase 5 | Lawyer questions before phase 5, and the incident retention period | Take items 3 to 8 of the 03 13.5 list to the lawyer. Keep incident records 7 years, names included, and keep safeguarding audit rows 7 years. The lawyer sets the period | 03 13.5 and 21; 06 9.3 and 25.1; 08 10.7 and 17.2; people-safety P26 |
| Phase 5 | Guardian links | Phase 5. A junior can end a link and give a reason. Guardians see club outings through the club, and personal rows only when the junior shares one | 03 11.5 and 21; people-safety P17 |
| Phase 5 | Which clubs can enrol juniors | Verified clubs only. Verification needs a domain proof or written evidence, then a moderator's approval | 06 3.3 and 25.1; people-safety P19 |
| Phase 5 | Roster-only members, for junior programs without an account for every athlete | Allow them | 06 4.2 and 25.1 |
| Phase 5 | How club rules apply | A member can be stricter than the club, never looser. A club rule replaces the location default even when looser. Rules are on by default at club locations. Adults can turn them off, juniors cannot | 06 6.5 and 25.1; 01 11.7 and 17 |
| Phase 5 | Water status | Show nothing when none is set. A club dock reading under 24 hours old replaces the gauge for that club's members only | 06 7.1, 7.5 and 25.1 |
| Phase 5 | Rows against club rules or a closed status | Warn and record. Never block | 06 8.3 and 25.1 |
| Phase 5 | The kiosk | Ship it in phase 5. Anyone at the boathouse may pick any adult's name, as with a paper logbook. A kiosk row never arms that member's float plan. Confirm with the pilot club and the lawyer | 06 8.5, 25.1 and 25.2; people-safety P10 |
| Phase 5 | Emergency information | It lives on the location, public, edited by steward clubs and moderators. Numbers come from a checked country table | 06 8.7 and 25.1; people-safety P13 |
| Phase 5 | Club notification rules | Staff duty notices capped at 20 a day per person per club. Practice, lineup, booking and restricted status notices are not held by quiet hours when the session begins before quiet hours end. Rule changes push to safety officers and admins, and members get an in-app notice. Water status notices default to every change | 06 21.3, 21.4, 21.8 and 25.1 |
| Phase 5 | Which club pilots phase 5, and whether the Putney club wants to | None given. The plan needs a safety officer who runs three overdue drills and keeps a paper logbook for 4 weeks | 06 23.2 and 25.2 |
| Phase 5 | Escalation timing, for example shorter for junior programs | Ask the pilot club. The steps are first guesses | 06 25.2; 04 13 |
| Phase 5 | A safety officer with no working device | None given. 06 asks whether to email a weekly reminder until a device is added | 06 25.2 |
| Phase 5 | Which national reporting lines the "Get help" page lists for juniors | None given. The owner confirms the lines and their URLs | 03 11.5 and 21 |
| Phase 5 | Approve the `CLAUDE.md` changes for phases 5 and 6: the club files, the bindings and the broadcast-only rule | Approve | 08 17.2; 06 22.6 |
| After phase 5 | Turn `CLUBS_ENABLED` on in production | When the exit criteria in 09 are met and the owner gives the go-ahead | 08 6.3 and 17.2; 06 23.2 |
| Phase 6 | May coaches take a member's booking for a practice? | Yes, with notice to the member. Only equipment managers or admins can within 12 hours of the start | 06 11.4 and 25.1 |
| Phase 6 | Midday check for afternoon practices | None given. Ask the pilot coaches | 06 12.2 and 25.2 |
| Phase 7 | Lawyer review for the EU, the UK and Canada | Yes, before phase 7 | 03 13.5 and 21 |
| Phase 7 | Unit defaults for the UK and the Nordic countries | None given. Confirm with British and Nordic clubs | 07 7.2 and 17 |
| Phase 7 | Australia | Ship locations with the global baseline only, and write to BoM about terms for warnings before building anything | 02 Open questions and decisions |
| Phase 7 | Feed terms and licences for MeteoAlarm, the Met Office, UKHO tide access, Hub'Eau and PEGELONLINE | None given. They need reading before phase 7 | 02 Open questions |
| Phase 7 | European AQI thresholds and the cold line outside the US | None given | 01 17 |
| Phase 7 | Open-Meteo plan for many locations | None given. 02 estimates, as quoted in 08, that a higher tier may be needed at about 200 active locations. The price is unverified | 08 12.2; 02 Open-Meteo |
| Later | If a paid tier is ever added: Open-Meteo, Vermont's Act 63 | Move Open-Meteo behind the Worker with a key and per-location caching. Ask the lawyer whether Act 63 applies | 02 Open-Meteo and Open questions; 03 13.5 item 9 |

## Costs in brief

From `08-architecture.md` section 12. Nothing charges per viewer, because each browser fetches forecasts and gauges itself.

| Phase | New cost drivers | Expected monthly cost |
| --- | --- | --- |
| 0 | None | $0, as today |
| 1 | One open counter point per app start | $0. Workers Free allows 100,000 requests a day, about 50,000 starts a day |
| 2 | Workers Paid, the production database, sign-in email | $5. Email Service includes 3,000 a month, about 1,000 accounts at three code emails each |
| 3 | Reports, hazards, outings, the every-minute tick, the queue, overdue email, Claude screening | About $5 to $6 |
| 4 | Push, alert rules, server-side forecasts | About $34 to $41 with the Open-Meteo key, $5 to $12 without |
| 5 and 6 | Club notices and email | Add $0 to $8 for email at 100 clubs. Queue operations approach 1 million a month at 100 active clubs |
| 7 | Worker-proxied warnings, more locations on server-side forecasts | Open-Meteo may need a higher tier. Estimate only, price unverified |

## What has to happen outside the code

The code cannot do these. Phase numbers say when each is needed. Most are named in `08` sections 5, 6 and 17, and in the owning document.

Cloudflare setup:

- Phase 1: the Zero Trust Access application for `/admin*` and `/api/admin/*`, for production and for Previews (08 6.3). The free seat count is unverified (03).
- Phase 2: Workers Paid. Email Service sending from `signin@rowhether.com`, with SPF, DKIM and DMARC passing (08 6.3; 03 20.4). Check how Preview-only secrets are set, and find the `dev` Preview host name (08 17.3).
- Phase 3: the sender `alerts@rowhether.com`, the notify queue and its dead letter queue, and the dev pair (08 6.3 and 6.4). Test on a Preview whether cron triggers and queue consumers run (08 17.3). Set `EMAIL_DAILY_LIMIT` once Cloudflare shows the quota. Set `REPORTS_ENABLED` to `"1"` when phase 3 ships. Add the outside uptime monitor on `GET /api/health`, and a Resend free account if the second route is accepted (05 13).
- Phase 4: the Open-Meteo key, and a VAPID key pair for production and one for Previews.
- After phase 5: `CLUBS_ENABLED` to `"1"` in production.

Databases:

- Phase 2: create `rowhether`, record a Time Travel bookmark, then apply `0001` and `0002` before merging phase 2 into `master` (08 5.4).
- Phases 3, 5 and 6: the same bookmark, then that phase's migrations on production before its merge into `master` (08 5.4).
- Phase 3: export the dev `reports` table before applying `0003`, because a full export stops working once the FTS table exists. Apply `0003` to `0008` to `rowhether-dev` only with the merge into `dev` of the code that needs them (08 5.4 and 5.5).

Secrets, set in the Cloudflare dashboard and never in the repo (08 6.5):

- `AUTH_PEPPER` in phase 2. `IP_HASH_KEY` and `NOTIFY_LINK_KEY` in phase 3. The VAPID pair and `OPEN_METEO_KEY` in phase 4. `RESEND_API_KEY` only if Resend is chosen.
- Previews get their own dev-only values, never the production ones.

Legal review (03 13.5, which is not legal advice). Answers go in `docs/full-app/legal-answers.md`:

- Item A before phase 2: the parent's permission sentence in the terms. Also the terms, privacy notice and minors approach.
- Items 1 and 2 before phase 3: float plans and overdue alerts, and user-entered limits and emergency details.
- Items 3 to 8 before phase 5: clubs and member records, people who never signed up, health details and retention, email to non-users, MAAPP claims, and what to do on learning of possible abuse of a minor.
- Phase 7: the EU, UK and Canada.
- Item 9 before any paid feature: Vermont's Act 63.

Pilots and moderation:

- Phase 5: one verified club uses water status and the board on dev for 4 weeks covering at least 20 practices, with its paper logbook kept. Three overdue drills with its safety officers. The owner and the club's safe sport or welfare contact walk through the junior rules. The first 10 verification requests are each reviewed within 3 days (06 23.2).
- Phase 6: a junior program runs 4 weeks of practices, and a masters group books boats for 4 weeks (06 23.3).

Checks on site and by hand:

- Putney's course heading, the Vernon pool limits, the dock point of each curated location, Putney's emergency information, and the water state and fog thresholds against what the dock sees (01 17; 06 25.2; CLAUDE.md Open items).
- Before phase 3: a person checks each row of the emergency number table against an official source (06 8.7).
- Device checks: passkeys on iPhone, Android and desktop before phase 2 (03 20.4). Push on iPhone, iPad, Android and desktop before phase 4 (05 12). Overdue alerts and a week of the kiosk on a boathouse tablet before phase 5, and calendar feeds before phase 6 (06 24.7). Rendering of the map in Safari and Chrome (07 17). A WebKit run of the browser tests on the owner's Mac with `WEBKIT=1` (08 13.5).

## Where Phase 0 stands

Another session is building Phase 0 and keeps `phase-0-progress.md` current. P0.1 (golden outputs) and P0.2 (before screenshots and the timing baseline) are done at the time of writing, and the later steps are under way.
