# Notifications

Today the app only speaks when it is open. This document plans how it reaches rowers when it is closed: the night-before alert from the CLAUDE.md Later list, an update before first light when the outlook changes overnight, NWS alerts, hazards, club water status and practice changes, and the overdue messages of a float plan (04-reports-and-check-ins.md).

It covers:

- The channels: Web Push, email, SMS (a decision) and an in-app list.
- Every notification type, its trigger, defaults and sample copy.
- Alert rules and preferences, quiet hours and caps.
- The server-side engine: Worker cron triggers, `src/logic.js` running in the Worker, data fetching and caching, deciding who gets what, dedupe, batching through Cloudflare Queues, retries, dead subscriptions, and politeness to upstream APIs.
- Web Push on Workers: the library, VAPID keys, payload format.
- The browser side: asking for permission, iOS install-first guidance, the service worker handlers, deep links, unsubscribing.
- Tables (`push_subscriptions`, `notify_prefs`, `notify_log`), endpoints, tests and costs.

Out of scope here: accounts, sessions and the email provider choice (03-accounts-and-privacy.md); what outings and contacts are (04); club water status and practices themselves (06-clubs.md); screen layout (07-product-and-ux.md); the canonical schema and bindings list (08-architecture.md). Data sources and the server-side Open-Meteo key decision are 02-data-sources.md's.

Facts are marked "verified live 2026-10-17", "from docs (URL)" or "unverified".

## Contents

1. Terms
2. Channels
3. Notification types and copy
4. Alert rules and preferences
5. The engine
6. Web Push on Workers
7. The browser side
8. Tables
9. API
10. Costs
11. Phases
12. Tests
13. Open questions and decisions

## 1. Terms

| Term | Meaning |
| --- | --- |
| push subscription | What `PushManager.subscribe()` returns for one browser on one device: an endpoint URL at the browser's push service and two keys. One row in `push_subscriptions`. |
| push service | The browser vendor's relay: Apple (`*.push.apple.com`), Google FCM, Mozilla, Microsoft. The Worker sends to it; it delivers to the device. |
| VAPID | RFC 8292: the server signs a short JWT so push services know who is sending. One key pair for the site. |
| pref | One alert rule a user turned on: "Night-before outlook for Putney Landing at 8 PM". One row in `notify_prefs`. |
| tick | One run of the every-minute cron (5.2). |
| job | One notification for one recipient, carried by one queue message (5.6). |
| held | A notification waiting for quiet hours to end. |
| target day | The day an outlook is about: tomorrow for the night-before alert. |

## 2. Channels

### 2.1 Web Push

The main channel. Free to send, arrives on the lock screen, and works with the app closed.

| Platform | Works | Conditions | Push service |
| --- | --- | --- | --- |
| iPhone and iPad | iOS and iPadOS 16.4 or later | Only for a web app added to the Home Screen with a manifest `display` of `standalone` or `fullscreen` (`vite.config.js` sets `standalone`). Permission must be asked in response to a tap. Not in Safari tabs, not in in-app browsers. (From docs, https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) | Apple, `*.push.apple.com` (from docs, Apple, "Sending web push notifications in web apps and browsers") |
| Mac Safari | Safari 16 on macOS 13 or later (from docs, same Apple page) | Permission from a gesture | Apple |
| Android: Chrome, Edge, Samsung Internet | Yes, in the browser tab or installed (unverified for Samsung Internet) | Permission | Google FCM (unverified for Samsung Internet) |
| Firefox, desktop and Android | Yes (unverified on Android) | Permission | Mozilla (unverified host name) |
| Desktop Chrome and Edge | Yes | Permission | FCM for Chrome; Microsoft for Edge (unverified) |

Apple's rules that shape this plan (from docs, Apple, "Sending web push notifications in web apps and browsers", verified by reading the page 2026-10-17):

- "Safari doesn't support invisible push notifications." A push that does not show a notification promptly makes Safari revoke the permission. Every push this app sends shows one.
- "Don't refresh your JWT more frequently than once per hour." The VAPID header is cached per push service (6.1).
- `Topic`: at most 32 characters from the URL and filename safe Base64 alphabet. `Urgency`: `very-low`, `low`, `normal` or `high`.
- Undelivered messages are stored for up to 30 days, or less depending on `TTL`.
- Status codes: 201 success, 403 authentication error (reasons such as `BadJwtToken`, `VapidPkHashMismatch`), 410 expired token, 413 payload over 4 KB, 429 too many requests to the same device.
- The JWT `sub` must be a URL or `mailto:`, and `exp` no more than a day ahead.

Declarative Web Push: iOS and iPadOS 18.4 can show a notification from a JSON payload without running service worker code, and still give a service worker the `push` event with the proposed notification (from docs, https://webkit.org/blog/16535/meet-declarative-web-push/). The payload starts with `"web_push": 8030`. No evidence was found of support in Chrome or Firefox (unverified). This plan sends payloads in that format so iPhones show them even if the service worker fails, and every other browser reads the same JSON in the service worker (6.3).

### 2.2 Email

For what must arrive even without push: overdue messages to emergency contacts (who may not use the app), overdue reminders to the rower, a fallback when a user has no working push subscription, digests for people who prefer email, the owner's moderation digest, and account mail (03).

The provider is 03's decision. This document calls one function, `sendEmail(env, { to, subject, text, html, headers, replyTo })` in `worker/email.js`, which 03 defines. If 03 picks Cloudflare Email Service, the facts that matter here are:

- Email Sending entered public beta on 2026-04-16 (from docs, https://developers.cloudflare.com/changelog/product/email-service/).
- Sending to arbitrary recipients requires the Workers Paid plan. 3,000 emails a month are included, then $0.35 per 1,000 (from docs, https://developers.cloudflare.com/email-service/platform/pricing/).
- A `send_email` binding with `env.EMAIL.send({ from, to, subject, text, html, headers })`; at most 50 addresses across to, cc and bcc (from docs, https://developers.cloudflare.com/email-service/api/send-emails/workers-api/ and https://developers.cloudflare.com/email-service/examples/email-sending/recipients/).

Rules for this document's emails:

- From `RoWhether <alerts@rowhether.com>` (the address is 03's). Plain text first, a simple HTML part with the same words.
- Non-safety emails carry `List-Unsubscribe: <https://rowhether.com/api/notify/unsubscribe?t=...>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058).
- Safety emails (overdue) carry a stop link for contacts (04 section 6.1) instead.
- One email per recipient; never a shared To line.

### 2.3 SMS

Decision: no SMS at launch. Recommended: push plus email covers the rower and contacts, and SMS in the US needs A2P 10DLC brand and campaign registration and per-message fees. Alternative: SMS through Twilio for overdue messages to emergency contacts only, if contacts miss emails in practice.

If SMS is added later, the numbers to plan with: Twilio lists outbound US SMS at $0.0083 per segment, with carrier fees on top for A2P 10DLC traffic; A2P brand registration is a $4.50 one-time fee; campaign and phone number fees are monthly (from Twilio's pricing and support pages via search, https://www.twilio.com/en-us/sms/pricing and https://support.twilio.com/hc/en-us/articles/1260803965530; all unverified live; carrier fee amounts unknown). The `emergency_contacts.phone` column (04) is already E.164 so nothing in the schema changes.

### 2.4 In-app

Every notification sent to a user is a row in `notify_log`. Account, "Notifications" lists the last 30 days, newest first, each linking to where the notification pointed. An unread count shows as a dot on the account button (07 places it). Opening the app from a notification marks that row read. This is also where a user sees what they missed during quiet hours or on a device without push.

## 3. Notification types and copy

### 3.1 Summary

| `kind` | Trigger | Default | Channels | Urgency | TTL | Topic | Quiet hours | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `night_before` | A pref's local time, default 8 PM at the location | Off until asked | push; email if chosen | normal | Until first light of the target day, at most 24 h | `nb-` plus 12 characters of the pref id | Ignored: the user chose the time | 4 |
| `morning_change` | 75 minutes before first light, not before 4 AM local, when the outlook changed since the night-before | On with `night_before` | push | high | Until the end of the morning period | Same as `night_before`, so it replaces one that was never delivered | Ignored | 4 |
| `morning_of` | A pref's local time, default 5 AM | Off | push | high | 3 h | `mo-` plus 12 | Ignored | 4 |
| `nws_alert` | A new or upgraded NWS alert overlapping a rowing window in the next 36 hours | Stay off level only | push | high for Stay off, normal for Caution | Until the alert ends, at most 24 h | `al-` plus 12 characters of a hash of the alert id | Never held at the Stay off level; held at the Caution level | 4 |
| `hazard` | A hazard posted within 10 km on the location's waterway, once its note is cleared or it has none | Off | push | low | 12 h | none | Held | 4 |
| `go_window` | Evaluated at 7 AM and 5 PM location time | Off | push | normal | 12 h | `gw-` plus 12 | Held | 4 |
| `water_status` | A club changes its water status (06) | On for members | push; also email when closed | high when closed, else normal | 6 h | `ws-` plus 12 of the club id | Held, except closed, and except a restriction that begins before the person's quiet hours end (06 21.3; 08 K21) | 5 |
| `practice` | A practice the user is in is cancelled, moved or changed (06) | On for invited members | push and email | high within 12 h of the start, else normal | Until the practice start | `pr-` plus 12 of the practice id | Held, except when the practice starts before the person's quiet hours end (06 21.3; 08 K21) | 6 |
| `overdue` | An outing escalation stage (04 section 6.2) | Always, for every outing | push and email to the rower; email to contacts | high | 15 min for push | `od-` plus 12 of the outing id | Never held | 3 email, 4 push |
| `system` | Account mail (03; in phase 2 it goes out through `worker/email.js` with no `notify_log` row, and 03 14.2's audit rows cover it), moderation digest (04), engine problems (to the owner) | Always | email | | | | | 3 |

### 3.2 Copy rules

- Title: at most 50 characters. Starts with the location's `shortName` (01) so a list of notifications reads by place. Dev adds " (dev)" after the short name.
- Body: aim for 160 characters, at most 240. How much a lock screen shows is unverified; the first sentence must stand alone.
- Never call the verdict a "call". Use Go, Caution or Stay off.
- Sentence case, no em dashes, no emojis, no all caps. Times in the location's time zone (`m.fmt`, 01) as the app prints them ("6:41 AM", "10 AM").
- Built with the same text helpers the app uses, so a notification and the screen never disagree. `periodCall(p)`, `periodSummary(p)`, `periodTime(p)` and `dayLabel(t)` move from `src/render/days.js` to a new pure module `src/text.js` (no DOM, no `app` state), which `src/render/days.js`, `src/render/hero.js` and the Worker import. `src/render/days.js` re-exports them so nothing else changes.
- Copy builders live in `worker/notify/copy.js`, pure and tested, one function per kind returning `{ title, body, url, tag }`.

### 3.3 Night-before outlook

Built from `periodsFor()` (via `buildModel(loc, data, S, now)`) for the target day's periods. The pref chooses which periods (default morning only).

| Situation | Title | Body |
| --- | --- | --- |
| Go | "Putney: Go tomorrow morning" | "6:41 to 10 AM. Wind 3 to 6 mph N, gusts 9. 41 to 52°F. Valley fog possible, lifting about 8 AM. Flat water." |
| Caution, fog | "Putney: Caution tomorrow morning" | "Steam fog likely, lifting about 8:30 AM. Wind 2 to 4 mph. 38 to 50°F. Lights needed until 7:09 AM." |
| Stay off | "Putney: Stay off tomorrow morning" | "Thunderstorms. Next Go: Saturday afternoon." |
| All three periods | "Putney tomorrow" | "Morning Go. Midday Caution: gusts to 22 mph. Afternoon Stay off: thunderstorms." |
| With a practice (06, phase 6) | "Putney: Caution for your 5:30 AM practice" | "Gusts to 19 mph by 6 AM. Fog unlikely. Practice is still on." |
| Forecast not available | "Putney: tomorrow's forecast is not available" | "We could not reach the forecast this evening. Open the app before you row." |
| NWS alerts, river flow or air quality could not be checked, and the checked factors give Caution or Stay off (5.3) | (normal title) | Normal body plus " NWS alerts could not be checked.", " River flow could not be checked." or " Air quality could not be checked." |
| The same, and the checked factors give Go | "Putney: tomorrow morning, flow not checked" (or "alerts not checked", "air quality not checked", "some checks missing" for two or more) | "Everything else looks like Go. River flow could not be checked. Check again before you launch." |
| A factor is not checked at this location (07 6.7) | (normal title) | Normal body plus " Not checked here: river flow, official alerts." |
| No rowing window (polar night, 01 section 15.4) | "Putney: no daylight to row tomorrow" | "The sun does not rise above civil twilight tomorrow." |

The "Next Go" phrase reuses what the hero says when the level is not Go (the next go period, CLAUDE.md).

`onlyIf` (4.2) can skip the message: "only when it's a Go" or "only when it's not a Go". A skipped message still writes `notify_log` with `skip_reason = 'not_wanted'` so the overnight check has a baseline.

Snapshot stored with the sent row (`notify_log.snap`):

```json
{ "day": "2026-10-18", "period": "morning", "lvl": 1, "why": "fog", "fog": 2, "fogType": "steam", "wmax": 4, "gmax": 9, "water": 0 }
```

### 3.4 The overnight change

From the CLAUDE.md Later list: "a second one if the call changes overnight." When a `night_before` pref has `change: true` (default), sending it sets `notify_prefs.next_check_at` to 75 minutes before first light of the target day (`sunOn(loc, t).dawn`), clamped to no earlier than 4:00 AM local and no later than the morning period start. At that time the engine rebuilds the model and compares with the snapshot.

Send when any of:

- the period level differs;
- fog went from none or possible to likely, or from likely to none;
- the top reason changed at the same non-zero level and the new one is `storm`, `alert`, `ice` or `freeze`.

Otherwise nothing is sent and `notify_log` gets `skip_reason = 'unchanged'`.

| Situation | Title | Body |
| --- | --- | --- |
| Worse | "Putney update: now Caution this morning" | "Steam fog likely until about 8 AM. Last night it was Go." |
| Better | "Putney update: now Go this morning" | "The rain moved through overnight. Wind 4 to 7 mph. Last night it was Caution." |
| Stay off | "Putney update: now Stay off this morning" | "Thunderstorms possible from 7 AM. Last night it was Go." |
| Fog appeared at the same level | "Putney update: fog this morning" | "Valley fog likely, lifting about 9 AM. Still Caution." |

### 3.5 Morning-of

For people who want one message before they leave the house. A pref with a local time (default 5:00 AM, 3:30 to 9:00 AM allowed) sends the morning period as in 3.3, with "this morning" in place of "tomorrow morning". Title example "Putney: Caution this morning".

### 3.6 NWS alert

| Situation | Title | Body |
| --- | --- | --- |
| Stay off level | "Putney: Severe Thunderstorm Warning" | "Until 3:45 PM. Stay off the water. From the National Weather Service." |
| Caution level | "Putney: Wind Advisory" | "Tomorrow 10 AM to 6 PM. Caution. Gusts to 45 mph. From the National Weather Service." |
| Upgraded | "Putney: now a Flood Warning" | "Until Thursday 8 PM. Stay off the water. From the National Weather Service." |

The event name is NWS's `event` text unchanged (NWS asks for alerts to keep their wording; 02 notes the same for ECCC). The body adds the time range and the level from `alertLevel()` (02's `src/sources/nws.js`). The NWS headline is not quoted because it is long; the link opens the Storms tab with the full text.

### 3.7 Hazard posted

| Title | Body |
| --- | --- |
| "New hazard near Putney Landing" | "Submerged tree or snag, 1.2 km upstream. Posted 6:12 AM." |
| "New hazard at Putney Landing" | "Dock or launch closed. Posted by Putney Rowing Club at 6:05 AM." |

The note itself is not in the notification; it is one tap away.

### 3.8 Go window (alert rule)

A rule: "Tell me when there is a Go window of 90 minutes in the next 2 days, mornings." At 7 AM and 5 PM location time the engine runs `planSessions(m, minutes, when)` (`src/logic.js`) for the next `daysAhead` days and notifies only for days that newly have a Go session since the last evaluation (`notify_prefs.last_snap` holds the set of day keys). At most one a day.

| Title | Body |
| --- | --- |
| "Putney: Go window Saturday morning" | "Calmest 90 minutes: 7:15 to 8:45 AM. Wind 2 to 5 mph, flat water." |

### 3.9 Club water status (06)

Early samples. 06 21.5 holds the copy that ships (08 K22).

| Title | Body |
| --- | --- |
| "Putney Rowing Club: water closed" | "High water. Until further notice. Posted by Sam, coach, at 6:05 AM." |
| "Putney Rowing Club: restricted" | "Singles need a launch until the fog lifts. Posted 5:50 AM." |
| "Putney Rowing Club: water open" | "Back to normal rules. Posted 9:40 AM." |

### 3.10 Practice changes (06)

Early samples. 06 21.5 holds the copy that ships (08 K22).

| Title | Body |
| --- | --- |
| "Practice cancelled: Tuesday 5:30 AM" | "Putney Rowing Club. Thunderstorms forecast. Next practice Wednesday 5:30 AM." |
| "Practice moved: Tuesday 6 AM" | "Was 5:30 AM. Putney Landing." |
| "Practice changed: Tuesday 5:30 AM" | "Now at Brattleboro. Meet at the boathouse 5:15 AM." |

### 3.11 Overdue

The copy is 04 section 6.5. Push titles and bodies for the rower are the first two lines of each message there.

### 3.12 Test notification

"Test from RoWhether" / "Notifications work on this device." Sent from Account and from the confirmation sheet (7.1).

## 4. Alert rules and preferences

### 4.1 What a user can set

Account, "Notifications":

- Per location the user follows (favorites, 03): Night-before outlook (time, periods, only when), Update if it changes overnight, Morning-of, NWS alerts (Stay off only or all), New hazards, Go windows.
- Per club (phase 5): Water status (closed only or every change), Practice changes (phase 6).
- Quiet hours: from and to, default 10 PM to 6 AM in the user's time zone.
- Email: "Email me when notifications cannot reach this device" (default on for overdue reminders, off for everything else).
- Devices: each push subscription with its label ("iPhone, Home Screen app", "Chrome on Windows"), last used, "Send a test", "Remove".

### 4.2 Params by kind

| `kind` | Scope | `local_time` | `days` | `params` |
| --- | --- | --- | --- | --- |
| `night_before` | location | 18:00 to 22:00, 15-minute steps, default 20:00 | The target days, default every day | `{ "periods": ["morning"], "onlyIf": "always", "change": true }`; `periods` any of morning, midday, afternoon; `onlyIf` `always`, `go` or `not_go` |
| `morning_of` | location | 03:30 to 09:00, default 05:00 | Days, default every day | `{ "period": "morning" }` |
| `nws_alert` | location | none | none | `{ "minLevel": 2 }` (1 means all alerts) |
| `hazard` | location | none | none | `{ "radiusKm": 10 }`, 1 to 10 |
| `go_window` | location | none (7 AM and 5 PM) | Target days | `{ "minutes": 90, "when": "morning", "daysAhead": 2 }`; minutes 60, 90 or 120 (the Plan a row lengths); when `any`, `morning`, `afternoon` |
| `water_status` | club | none | none | `{ "only": "closed" }` or `"any"` |
| `practice` | club | none | none | `{}` |

`days` is a bitmask of the target day's weekday in the location's zone: Sunday 1, Monday 2, ... Saturday 64; every day is 127. "Weekday mornings" (62) means the night-before fires Sunday to Thursday evenings.

Limits: at most 10 locations with prefs per user, at most 30 prefs per user. A location the user unfollows keeps its prefs until they are turned off; the account page lists them.

### 4.3 When a timed pref is due

`nextAt(pref, loc, now)` in `worker/notify/schedule.js` (pure, tested) returns the next send time in ms:

1. Walk local dates from today in the location's time zone. For `night_before` the target day is the next date; for `morning_of` it is the same date.
2. Skip dates whose target day is not in `days`.
3. Convert the local wall time `local_time` on that date to UTC with the location's zone. In the spring-forward gap (for example 2:30 AM on 2026-03-08 in New York) use the same wall time one hour later; in the fall-back overlap use the first occurrence.
4. The first result later than `now` is `next_at`.

It runs when a pref is created or edited and after each send. `go_window` uses 07:00 and 17:00 in the same way. The tick selects `WHERE next_at <= now OR next_check_at <= now` through partial indexes, so a minute with nothing due reads no rows.

### 4.4 Quiet hours

- Stored in 03's `user_settings` under the key `notify`: `{ "quietFrom": "22:00", "quietTo": "06:00", "tz": "America/New_York", "emailFallback": "safety" }`. `tz` comes from the device (`Intl.DateTimeFormat().resolvedOptions().timeZone`) when the user saves, because quiet hours follow the person, not the location.
- Kinds marked "Held" in 3.1 that fall inside quiet hours are sent at the end of quiet hours: the job is enqueued with `delaySeconds` up to the end (Queues allow up to 86,400 seconds, from docs, https://developers.cloudflare.com/queues/configuration/javascript-apis/). On delivery the job is re-checked: an NWS alert that has ended, a hazard that was cleared, or a water status that changed again is dropped (`skip_reason = 'stale'`).
- Timed kinds the user scheduled (`night_before`, `morning_change`, `morning_of`) ignore quiet hours: the user picked the time.
- `overdue`, `water_status` closed and `nws_alert` at the Stay off level ignore quiet hours. They are safety notices, and civil dawn comes before 5 AM in the summer, so a warning issued at 5:10 AM must reach a rower who launches at 6. Only Caution level alerts are held.

### 4.5 Caps

| Cap | Limit |
| --- | --- |
| Non-safety pushes per user per rolling 24 hours | 8. Above that, jobs go to the in-app list only (`skip_reason = 'cap'`). |
| NWS alerts per user per location per day | 3 |
| Hazard notifications per user per day | 3 |
| Go windows per pref per day | 1 |
| Test notifications per device | 5 an hour |

## 5. The engine

### 5.1 Where it runs

The same `rowhether` Worker, with two new handlers in `worker/index.js`: `scheduled(controller, env, ctx)` and `queue(batch, env, ctx)`. The code lives in `worker/notify/`:

| File | Job |
| --- | --- |
| `worker/notify/tick.js` | `tick(env, now)`: the every-minute run (5.2). |
| `worker/notify/overdue.js` | Outing escalation steps (04 section 6.2). |
| `worker/notify/digest.js` | `night_before`, `morning_change`, `morning_of`, `go_window`. |
| `worker/notify/alerts.js` | NWS alert scan and matching. |
| `worker/notify/events.js` | `enqueueHazard()`, `enqueueWaterStatus()`, `enqueuePractice()`, called by the API handlers after their D1 write. |
| `worker/notify/data.js` | `loadLocationData(env, loc, slots, now, cache)`: server-side fetching (5.3). |
| `worker/notify/schedule.js` | `nextAt()`, quiet hours, caps. Pure. |
| `worker/notify/copy.js` | Titles and bodies. Pure. |
| `worker/notify/deliver.js` | The queue consumer: push and email per job. |
| `worker/push.js` | Web Push send (6.1). |
| `worker/email.js` | 03's `sendEmail()`. |

Cron triggers in `wrangler.jsonc`:

```jsonc
"triggers": { "crons": ["* * * * *", "17 9 * * *"] }
```

- `* * * * *`: the tick.
- `17 9 * * *`: the daily run at 09:17 UTC: retention cleanup (04 section 8.9), dead subscription cleanup (5.7), the moderation digest (04 section 8.7), and 02's source health check, which already plans this time. One cron, three jobs, dispatched on `controller.cron`.

Platform facts this depends on (from docs, https://developers.cloudflare.com/workers/platform/limits/ and https://developers.cloudflare.com/workers/configuration/cron-triggers/):

| | Workers Free | Workers Paid |
| --- | --- | --- |
| Cron triggers per account | 5 | 250 |
| CPU time per cron invocation | 10 ms | 30 s for intervals under 1 hour; 15 min for 1 hour or longer |
| Wall time | the scheduled handler is awaited up to 15 minutes | same |
| Subrequests per invocation | 50 | 10,000 |
| Simultaneous outgoing connections per invocation | 6 | 6 |
| Requests per day | 100,000 | no limit (10 million a month included) |

Cron triggers run on UTC, and changes take up to 15 minutes to propagate (from docs, same page).

Building one model takes more than 10 ms of CPU for 168 hours of forecast (estimate; measure with the benchmark in 12), and email to arbitrary recipients needs Paid (2.2). So:

Decision: move the account to Workers Paid ($5 a month, from docs, https://developers.cloudflare.com/workers/platform/pricing/) before phase 3, when overdue emails start. Recommended. Alternative: stay on Free and send only push from browser-cached data (no server-side forecast, no email to contacts), which drops the float plan.

Whether Worker Previews run cron triggers is unverified. For dev, `POST /api/admin/tick` (owner only, only when `APP_ENV` is `dev`) runs one tick on demand, and `npx wrangler dev --test-scheduled` with `curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=*+*+*+*+*"` runs it locally (from docs, https://developers.cloudflare.com/workers/examples/cron-trigger/).

### 5.2 One tick

```js
// worker/notify/tick.js
export async function tick(env, now = Date.now()) {
  const runs = [runOverdue(env, now)];                       // 04 section 6.2, at most 200 outings
  runs.push(runDue(env, now));                                // prefs with next_at or next_check_at due, at most 500
  if (new Date(now).getUTCMinutes() % 5 === 2) runs.push(runAlerts(env, now)); // NWS, every 5 minutes
  const results = await Promise.allSettled(runs);
  // Failures are logged with the step name; one step failing never stops the others.
  // Then the heartbeat (below), written even when a step failed.
}
```

Heartbeat. When a tick ends it writes one row to `source_cache`, key `tick:heartbeat`, expiring in 7 days: `{ "at": 1792230000000, "overdue": "ok", "due": "ok", "alerts": "skipped", "overdueFailures": 0, "emailsStuck": 0 }`. `overdueFailures` counts the runs in a row where `runOverdue` threw and returns to 0 on a success. `emailsStuck` counts overdue emails that have failed twice and are still not accepted (5.7). The tick is unhealthy when the heartbeat is more than 5 minutes old (the cron stopped, or the Worker cannot reach D1), `overdueFailures` has reached 3 (a bad deploy, a renamed column, a bug), or `emailsStuck` is above 0. `GET /api/health` reads the row and answers 200 `{ "ok": true }` or 503 `{ "ok": false }`, with no detail and `Cache-Control: public, max-age=30`. The outside uptime monitor in the Decision in 13 polls it every minute and pushes to the owner's phone, so a stopped tick is noticed in minutes, not in the next day's digest. The app asks the same route when the Start a row sheet opens, and every 5 minutes while the outing banner is on screen. A 503 shows "Late alerts are delayed right now. Tell someone your plan." on the sheet and the banner (04 5.2, 5.6). A failed request (no signal) shows nothing extra, because the offline line already covers it.

`runDue()`:

1. Select due prefs: `SELECT ... FROM notify_prefs WHERE enabled = 1 AND (next_at <= ?1 OR next_check_at <= ?1) ORDER BY COALESCE(next_at, next_check_at) LIMIT 500`. More than 500 due in one minute simply carries over to the next tick, because their times are not advanced until they are handled.
2. Group by `location_id`. Load each location record (01) once.
3. For each location, `loadLocationData()` once (5.3), at most 6 locations at a time.
4. For each user, the effective settings `S` for that location: 06's `clubSettings()` when the user rows under a club rule set here (club values replace location defaults, then a stricter personal value wins, 06 6.5), else 01's `effectiveSettings()` with the user's synced overrides for that location (03's `user_settings`). The Worker and the app call the same two functions, so a message and the screen agree (3.2). Group users by `settingsHash(S)` (SHA-1 of the sorted JSON) and build one model per group: `buildModel(loc, data, S, now)`. Most users keep the defaults, so most locations need one or two models.
5. For each pref, compose the message (3.3 to 3.8), decide skip or send, apply caps.
6. Write all `notify_log` rows for the batch with `INSERT ... ON CONFLICT(dedupe_key) DO NOTHING RETURNING id` and enqueue a job only for rows actually inserted (5.5).
7. Advance `next_at`, `next_check_at` and `last_snap` for each handled pref in the same `env.DB.batch()` as step 6, so a crash between them cannot send twice or skip.

### 5.3 Data per location, server-side

`src/logic.js` is DOM free and SunCalc is an npm dependency bundled into the build, so the Worker imports `buildModel` and the text helpers directly; Wrangler bundles them. After 01's phase 0 refactor `buildModel(loc, data, S, now)` takes the location first and formats times through `m.fmt` (01 section 8.3), which is what lets one Worker run build models for many zones. That `Intl.DateTimeFormat` with any IANA `timeZone` works in workerd as in Node is unverified; a test builds a model inside the Workers runtime (12).

Slots needed per kind (02's slot names):

| Kind | Slots |
| --- | --- |
| `night_before`, `morning_change`, `morning_of`, `go_window` | `wx`, `alerts`, `river`, `flow`, `aq` |
| `nws_alert` | `alerts` only, by state (below) |
| `overdue` | none (the outing has its own snapshot) |

`models`, `obs`, `flowDays` and `flowFcst` are not fetched: they do not change the level. A model built without them is the same model the app builds, minus confidence text.

Fetching uses 02's adapters (`src/sources/*`, pure modules the Worker imports) through `loadLocationData()`:

- Open-Meteo forecast and air quality through 02's server-side key decision (`OPEN_METEO_KEY` on `customer-api.open-meteo.com`), because Worker calls share Cloudflare egress addresses and the free API answered `429 Daily API request limit exceeded` from shared egress in 02's test (verified live 2026-10-17, per 02).
- USGS latest values: one request per tick for every gauge the due locations need, comma-separated in `monitoring_location_id` as `SRC.river` already does for two sites, in chunks of 20 ids (the API's maximum list length is unverified).
- NWS alerts for digests: from the same per-state results `runAlerts()` keeps (below), so a digest never makes its own alerts request.

Caching:

- Within a tick: a `Map` from request URL to parsed result, so two locations sharing a gauge fetch it once.
- Across ticks: the Cache API (`caches.default`) keyed by the upstream URL without the API key, stored with `Cache-Control: max-age=600`. Ten minutes matches the app's refresh. The Cache API is per data center, so a miss just means one more fetch.
- Each upstream call has a 10-second timeout (`AbortSignal.timeout`), as `worker/turnstile.js` does.

When data fails:

| Missing | What happens |
| --- | --- |
| `wx` | The pref is retried 5 minutes later (`next_at += 5 min`), up to 6 times. After 30 minutes the "forecast not available" message (3.3) is sent. |
| `alerts` | Built without alerts; the body adds "NWS alerts could not be checked." |
| `river`, `flow` | The last good reading is used while it is within the binding's `maxAgeH` (24 h from phase 1), as the app does. Each good fetch writes it to `source_cache` with its time (key `lastgood:flow:<binding id>`, expires after 48 h), because the server has no browser cache to fall back on. With no usable reading, the model is built without flow rules and the body adds "River flow could not be checked." |
| `aq` | Built without AQI rules; the body adds "Air quality could not be checked." |
| A factor with no binding here (07 6.7) | The body adds the hero's line, "Not checked here: river flow, official alerts." Nothing else changes. |

A failed slot can only hide a reason that would raise the level. So Caution and Stay off keep their titles and gain the sentence. A Go does not keep its title: it becomes "Putney: tomorrow morning, flow not checked" with "Everything else looks like Go. River flow could not be checked. Check again before you launch." (3.3). The same holds for the overnight update, the morning message and the Go window alert.

NWS alerts, `runAlerts()`:

1. Distinct US states of locations that have an enabled `nws_alert` pref or a due digest, from the first two letters of every code in the location's alerts binding `ref` (`zones:VTZ015,VTC025,NHZ011,NHC005` names `VT` and `NH`, 01 4.4), so a location on a state line gets both states, as the app does. A binding still on `point:` has no list: that location gets one `?point=` request of its own.
2. One request per state: `https://api.weather.gov/alerts/active?area=VT`, with `If-None-Match` set to the last ETag (kept in 02's `source_cache` under `nws-etag:VT`). A 304 means nothing changed and nothing is parsed.
3. A location matches an alert when the alert's `geocode.UGC` list contains one of the codes in the same `ref` list (forecast zone and county, filled by 02's discovery, for example `VTZ015`, `VTC025`, `NHZ011`, `NHC005`), or when the alert has a `geometry` polygon that contains the dock point.
4. Level from `alertLevel()`; new alerts and upgrades go to users with matching prefs (3.6). An `Update` message is the same alert as the one it references unless the level went up.

Measured: at 07:00 UTC on 2026-10-17 the nationwide feed had 553 active alerts, 2,636,027 bytes uncompressed (192,185 gzipped), 15 with a polygon; `?area=VT` was 220 bytes, `?area=CA` 100,744 bytes, `?point=42.9607,-72.5219` 233 bytes. Responses carry an ETag and `Cache-Control: public, max-age=2, s-maxage=5` (verified live 2026-10-17). Per-state requests keep parsing small and the request count independent of the number of locations: about 10 states every 5 minutes is 2,880 requests a day.

Politeness to upstream APIs:

| Upstream | Rule |
| --- | --- |
| All | 02's `User-Agent: RoWhether/1.0 (+https://rowhether.com; <owner contact>)`. At most one request per URL per tick. 10-second timeout. |
| NWS | Per state, every 5 minutes, ETag. On 429 or 503, skip NWS for 10 minutes (`source_cache` key `backoff:api.weather.gov`). NWS says its rate limit "is not public information" and retries "typically within 5 seconds" succeed (from docs, quoted in 02). |
| Open-Meteo | Through the paid key; one forecast and one air quality request per due location per tick, cached 10 minutes. |
| USGS | Batched site ids, cached 10 minutes. |
| Push services | At most 6 connections at a time per invocation (the platform limit); Apple asks for no more than 100 unacknowledged requests on one connection (from docs, Apple page). On 429, honor `Retry-After`. |

### 5.4 Deciding who gets what

| Kind | Recipients query (indexed) |
| --- | --- |
| Timed kinds | `notify_prefs` due rows (5.2) |
| `nws_alert` | `notify_prefs WHERE kind = 'nws_alert' AND enabled = 1 AND location_id IN (matched locations)` |
| `hazard` | Locations on the hazard's waterway within 10 km of the pin (01's waterway API logic), then `notify_prefs WHERE kind = 'hazard' AND location_id IN (...)`, keeping rows whose `params.radiusKm` covers the distance; the poster is excluded |
| `water_status` | `notify_prefs WHERE kind = 'water_status' AND club_id = ?` (06 creates these for members on join) |
| `practice` | 06's attendance and invite rows for the practice, joined with `notify_prefs` for `kind = 'practice'` |
| `overdue` | The outing's user, and its user's emergency contacts not opted out (04) |

Then for each recipient: channel choice (4.1 and 5.6), quiet hours (4.4), caps (4.5).

### 5.5 Dedupe

Every notification has one `dedupe_key`, unique in `notify_log`. The row is inserted before anything is sent, with `ON CONFLICT DO NOTHING`; only a new row produces a job. Overlapping ticks, retried ticks and a crash after insert never double-send. Formats:

| Kind | `dedupe_key` |
| --- | --- |
| `night_before` | `nb:<pref id>:<target day key>` |
| `morning_change` | `mc:<pref id>:<target day key>` |
| `morning_of` | `mo:<pref id>:<day key>` |
| `nws_alert` | `al:<user id>:<root alert id>:<level>` |
| `hazard` | `hz:<user id>:<hazard id>` |
| `go_window` | `gw:<pref id>:<day key>` |
| `water_status` | `ws:<user id>:<water_status id>` |
| `practice` | `pr:<user id>:<practice id>:<change number>` |
| `overdue` | `od:<outing id>:<stage>:<user id or contact id>` |
| test | `test:<subscription id>:<minute>` |

The `<root alert id>` is the first id in an alert's `references` chain, so an NWS update does not notify again unless `<level>` rose.

### 5.6 Sending in batches

Decision: deliver through a Cloudflare Queue. Recommended: the tick stays short, each job retries on its own with a delay, failures land in a dead letter queue, and consumers scale out when 8 PM Eastern makes hundreds of jobs due at once. Alternative: send inside the tick with 6 connections at a time; simpler, and fine below a few hundred jobs a minute, but one slow push service holds up the run and retries need their own bookkeeping.

Facts (from docs, https://developers.cloudflare.com/workers/platform/pricing/ and https://developers.cloudflare.com/changelog/post/2026-02-04-queues-free-plan/): Queues are on Workers Free (10,000 operations a day, 24-hour retention) and Paid (1 million operations a month included, then $0.40 per million; retention 4 days default, up to 14). An operation is one write, read or delete per 64 KB; most messages take 3. `sendBatch()` takes up to 100 messages, 128 KB each, 256 KB total (from docs, https://developers.cloudflare.com/queues/configuration/javascript-apis/). A consumer invocation can run 15 minutes wall time (from docs, limits page).

Configuration (`wrangler.jsonc`):

```jsonc
"queues": {
  "producers": [{ "binding": "NOTIFY_QUEUE", "queue": "rowhether-notify" }],
  "consumers": [{
    "queue": "rowhether-notify", "max_batch_size": 25, "max_batch_timeout": 5,
    "max_retries": 4, "retry_delay": 60, "dead_letter_queue": "rowhether-notify-dlq"
  }]
}
```

Previews need their own queue (`rowhether-notify-dev`) so dev jobs never reach production consumers. The `previews` block accepts `queues` (08 6.1); whether Preview deployments run consumers is unverified, and if they do not, the Preview build skips enqueueing and `/api/admin/tick` delivers inline.

Job message (at most 4 KB):

```json
{
  "v": 1, "log": "7d1c2e3f-0a9b-4c8d-8e7f-6a5b4c3d2e1f", "kind": "night_before",
  "user": "c0ffee00-1111-4222-8333-444455556666", "contact": null,
  "channels": ["push"], "emailIfNoPush": false,
  "push": { "ttl": 36000, "urgency": "normal", "topic": "nb-3f9a1c2b7d4e",
            "payload": { "web_push": 8030, "notification": { "title": "Putney: Go tomorrow morning", "body": "6:41 to 10 AM. Wind 3 to 6 mph N, gusts 9.", "navigate": "https://rowhether.com/putney-landing", "tag": "nb-putney-landing", "lang": "en-US", "dir": "ltr" }, "rw": { "v": 1, "log": "7d1c2e3f-0a9b-4c8d-8e7f-6a5b4c3d2e1f", "kind": "night_before" } } },
  "email": null,
  "notBefore": null
}
```

The consumer, `deliver(batch, env)`:

1. Load push subscriptions for all users in the batch in one query (`WHERE user_id IN (...) AND disabled_at IS NULL`).
2. For each job, send to each subscription (6 at a time across the batch), then email if the channel says so, or if `emailIfNoPush` is true and no push succeeded.
3. Update `notify_log` (`status`, `push_ok`, `push_fail`, `email_status`, `sent_at`) and the subscriptions (`last_ok_at`, `fail_count`, deletions) in one batch.
4. `msg.ack()` on success or a permanent failure; `msg.retry({ delaySeconds })` on a temporary one (5.7).

Event kinds enqueue from the API request that caused them, after the D1 write, inside `ctx.waitUntil()`.

### 5.7 Retries and dead subscriptions

Push responses (RFC 8030, from docs, https://www.rfc-editor.org/rfc/rfc8030; Apple codes from Apple's page):

| Response | Meaning | Action |
| --- | --- | --- |
| 201 (or 200, 202) | Accepted | `last_ok_at = now`, `fail_count = 0` |
| 400 | Malformed (for example `BadWebPushTopic`) | Log the reason. No retry. A bug if it repeats. |
| 403 `VapidPkHashMismatch` | The subscription was made with another key | Delete the subscription |
| 403 other | VAPID or JWT problem (`BadJwtToken`) | Stop sending to that push service for 10 minutes, email the owner once an hour. A configuration bug. |
| 404, 410 | The subscription is gone (RFC 8030 uses 404; Apple uses 410 for an expired token) | Delete the subscription |
| 413 | Payload too large | Log. No retry. A bug: payloads are kept under 1 KB. |
| 429 | Too many requests | Retry after `Retry-After`, or 60 s |
| 500, 502, 503, timeout, network | Temporary | Retry at 60 s, 5 min, 15 min, 30 min (`max_retries: 4`) |

A job retries as a whole only when every channel failed temporarily; when one subscription succeeded and another failed temporarily, the failed one is retried in a new single-subscription job so the device that worked does not get a duplicate.

Dead subscriptions, in the daily run:

- `fail_count >= 10` and the first of those failures more than 3 days ago: `disabled_at = now`. The app re-registers on the next open (7.3).
- `last_ok_at` and `last_seen_at` both older than 60 days: deleted.
- Rows for users who deleted their account are already gone (`ON DELETE CASCADE`).

Email failures: a hard bounce marks the address in `notify_log.email_status = 'bounced'`; for emergency contacts it also sets `emergency_contacts.bounced_at` and the rower is told at once, as when a contact opts out (04 sections 6.1 and 6.4). A message counts as sent only when the provider accepted it (`email_status = 'sent'`); a refusal or a throttle sets `'failed'` with the provider's error.

Overdue email is a lane of its own. `runOverdue` sends stage 3 and 4 emails itself, awaiting `sendEmail()` for each contact (6 at a time) before the tick enqueues anything else, so they never wait behind alerts, digests or sign-in codes. A `failed` overdue row is retried by the next ticks, up to 5 times a minute apart, and the rower is told after the first failure ("We could not email Jordan. Call someone now.", 04 section 6.5). To keep room for overdue mail, alert, digest and `system` email stops for the rest of the UTC day once the day's accepted sends reach 70% of `EMAIL_DAILY_LIMIT` (08 6.3); overdue mail and sign-in codes ignore the cap. If one overdue email has failed twice, the owner is alerted at once (5.8), not only in the daily digest.

The dead letter queue is checked by the daily run; any message there is logged and counted in the owner's digest.

### 5.8 Failure modes

| Failure | Effect | Mitigation |
| --- | --- | --- |
| A tick takes over a minute | The next tick overlaps | Dedupe keys make overlap safe; due rows are claimed by advancing `next_at` in the same batch as the log insert. |
| D1 unavailable | Nothing is sent that minute | The next tick picks the rows up; overdue messages are at most a minute or two late. |
| Queue unavailable | `send` throws | The log row is set `status = 'queued'` and the daily run plus every tick re-enqueue `queued` rows older than 2 minutes, up to 30 minutes old. |
| Push service outage | Retries | As 5.7; email fallback for overdue. |
| VAPID secret lost | Every send 403 | Owner alert. Recovery: new keys; every device must re-subscribe (7.3), which needs a tap on Safari. |
| Open-Meteo key quota reached | `wx` fails | The "forecast not available" message after 30 minutes; owner alert. |
| The tick throws on every run, or the cron stops firing | Float plans do nothing and nobody knows | The heartbeat (5.2): `GET /api/health` answers 503 when it is over 5 minutes old or `runOverdue` has failed 3 times in a row. The outside monitor alerts the owner within minutes, and the Start a row sheet and the outing banner say "Late alerts are delayed right now. Tell someone your plan." Test: a tick whose `runOverdue` throws three times flips `/api/health` to 503. |
| The email provider refuses, throttles or is down | Contacts are not told, or told late | Overdue mail is sent from the tick ahead of the queue, with a share of the day's quota kept for it, and the rower hears "We could not email Jordan. Call someone now." (5.7). Two failures for one email alert the owner at once, on a channel other than email (Decision in 13). Test: a stub provider that throws gives the rower the failure line and the owner an alert. |

## 6. Web Push on Workers

### 6.1 The library

Web Push needs ECDH and HKDF for RFC 8291 message encryption (`aes128gcm`) and an ES256 JWT for RFC 8292. Workers have WebCrypto but not Node's `crypto.createECDH`, so the Node `web-push` library is out.

Candidates, checked by downloading and reading each package (verified live 2026-10-17):

| Package | Version and date | Encoding and auth | Notes |
| --- | --- | --- | --- |
| `@block65/webcrypto-web-push` | 2.0.0, 2026-09-03; MIT; one dependency (`uint8array-extras`); 17 KB unpacked; 136,527 downloads in the week of 2026-10-06 | `aes128gcm` (RFC 8291) and the `vapid` scheme (RFC 8292). Pads every message to 4,096 octets, so the largest payload is 3,993 bytes. JWT `exp` 12 hours. | Its README says 1.x sent the older `aesgcm` encoding and the draft `WebPush` scheme, "neither of which Apple accepts". Exports `encryptNotification`, `vapidHeaders` and `buildPushPayload`. |
| `@pushforge/builder` | 2.0.5, 2026-04-23; MIT; no dependencies; 62 KB; 78,597 weekly downloads | `Content-Encoding: aesgcm` with `Encryption` and `Crypto-Key` headers, and the `vapid` scheme | The older draft encoding, not RFC 8291. Signs a new JWT on every send. |
| `web-push` | 3.6.7, 2024-01-16; MPL-2.0 | `aes128gcm` | Uses Node `crypto` and `https`. Not built for Workers. |

Decision: use `@block65/webcrypto-web-push` 2.0.0, pinned exactly in `package.json`, behind a thin wrapper in `worker/push.js`. Recommended: it implements the encoding every push service accepts, including Apple, with one small dependency. Alternative: write the roughly 150 lines of RFC 8291 and 8292 on WebCrypto ourselves, tested against a decryption in the test suite. Alternative: `@pushforge/builder`, which uses the older `aesgcm` encoding.

Version 2.0.0 is six weeks old on 2026-10-17 and a major version; the tests in 12 decrypt its output with the subscriber's keys, so a regression shows up in CI.

The wrapper:

```js
// worker/push.js
import { encryptNotification, vapidHeaders } from '@block65/webcrypto-web-push';

const MAX_PAYLOAD = 3993;
const authCache = new Map(); // push service origin -> { value, until }

// Apple asks for the JWT to change no more than once an hour. vapidHeaders()
// signs a 12-hour JWT, so one header per push service is reused for 11 hours,
// in memory and in source_cache (02) so other isolates reuse it too.
export async function authFor(env, origin, now = Date.now()) { /* memory, then source_cache 'vapid:<origin>', else vapidHeaders() and store */ }

export async function sendPush(env, sub, { payload, ttl, urgency, topic }, now = Date.now()) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (bytes.length > MAX_PAYLOAD) throw new Error('payload too large');
  const body = await encryptNotification(
    { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } }, bytes);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: await authFor(env, new URL(sub.endpoint).origin, now),
      ttl: String(ttl), urgency, ...(topic ? { topic } : {}),
      'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream'
    },
    body, signal: AbortSignal.timeout(10_000)
  });
  return classify(res); // { ok, gone, retryAfter, reason } per 5.7
}
```

`sendPush` and `deliver` take dependencies as parameters (a `fetch` stub in tests), the same pattern as `handleSuggest(request, env, deps)` in `worker/suggest.js`.

### 6.2 VAPID keys

- Generated once by `scripts/vapid-keys.mjs` (new): WebCrypto `generateKey({ name: 'ECDSA', namedCurve: 'P-256' })`, the raw public key (65 bytes, 87 base64url characters) and the private JWK `d` (32 bytes, 43 characters). Printed once, never written to disk.
- Stored as Worker secrets in the Cloudflare dashboard: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. Never in the repo or `wrangler.jsonc`, per CLAUDE.md.
- `VAPID_SUBJECT` is a plain var: `mailto:` plus the owner's chosen address, or `https://rowhether.com/` (Apple rejects anything else with `BadJwtToken`).
- The public key is public by design. `GET /api/info` adds `"push": { "key": "<VAPID_PUBLIC_KEY>" }` when both secrets are set, else `"push": null`, and the app hides every notification control.
- Previews get their own key pair (a subscription is bound to the key it was made with, so dev subscriptions can never be sent to by production and the other way round).
- Rotation only on compromise. After a rotation, the app sees that `/api/info` has a new key, unsubscribes the old subscription and asks for a tap to subscribe again (7.3).

Decision: set a VAPID key pair as Preview secrets so push can be tested on dev. Recommended. This changes the CLAUDE.md note "No secrets are set for Previews" for these two secrets only; they cannot file issues or spend money. Alternative: no push on dev; test locally with `wrangler dev` and `.dev.vars` only.

### 6.3 Payload format

Decision: send payloads in the Declarative Web Push format and handle the same JSON in the service worker. Recommended: on iOS 18.4 and later the notification shows even if the service worker throws, which protects the permission Apple would otherwise revoke; other browsers ignore the format and run the service worker as usual. Alternative: plain JSON read only by the service worker.

```json
{
  "web_push": 8030,
  "notification": {
    "title": "Putney: Caution tomorrow morning",
    "body": "Steam fog likely, lifting about 8:30 AM. Wind 2 to 4 mph. 38 to 50°F.",
    "navigate": "https://rowhether.com/putney-landing#fog/2026-10-18",
    "tag": "nb-putney-landing",
    "lang": "en-US",
    "dir": "ltr",
    "silent": false
  },
  "rw": { "v": 1, "log": "7d1c2e3f-0a9b-4c8d-8e7f-6a5b4c3d2e1f", "kind": "night_before", "loc": "putney-landing" }
}
```

- `title` and `navigate` are required by the declarative format (from docs, https://webkit.org/blog/16535/meet-declarative-web-push/). `navigate` is an absolute URL on the app's own origin: `PUBLIC_ORIGIN` (a new var: `https://rowhether.com` on production, the dev Preview URL in `previews`).
- `rw` is ours; whether WebKit tolerates an extra top-level member in a declarative payload is unverified and is the first thing to test on a device. If it does not, `rw` moves into `notification.data`, which is a NotificationOptions member.
- Typical size 400 to 700 bytes, far under 3,993.

### 6.4 TTL, urgency, topic and tag

As in 3.1. The `tag` (device side) replaces an earlier notification with the same tag still on the lock screen: the morning update replaces last night's outlook. `Topic` (push service side) replaces an earlier message that has not been delivered yet. Both are `nb-` style ids of at most 32 URL-safe characters.

## 7. The browser side

### 7.1 Asking for permission

Never on page load. Only after a tap on an action that names what will happen.

Entry points:

| Where | Button or link | Shown when |
| --- | --- | --- |
| Now screen outside daylight, under the "At the dock" panel, or under the hero when there is none (07 5.12; 08 K45), when the hero shows the next morning (`m.daytime` is false) | "Get this every evening at 8 PM" | `/api/info` has a push key, the viewer has no `night_before` pref for this location, and the line was not dismissed in the last 90 days (`rowhether-notify-nudge-v1`, a per-viewer convenience in `localStorage`) |
| Week tab, under Plan a row | "Tell me tomorrow's conditions at 8 PM" | Same, without the dismiss |
| Account, Notifications | Every setting | Always for signed-in users |
| After I'm back, for float plan users with no push subscription (04) | "Get reminders as notifications, not only email" | Once per device |

The flow, `startNotify(kind, loc)` in a new `src/notify.js`:

1. Signed out: the sign-in sheet (03) with "Sign in to get tomorrow's conditions as a notification." After sign-in, a sheet "Almost done" with one button "Turn on notifications", because the tap that started the flow is used up and Apple needs the permission request inside a tap.
2. No support (`!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)`):
   - `installKind()` from `src/install.js` returns `ios` or `ios-app` and `isStandalone()` is false: the install steps sheet (7.2).
   - Otherwise: "This browser cannot show notifications. We can email you instead." with "Email me at 8 PM" and "Not now".
3. `Notification.permission === 'denied'`: a help sheet for the platform, with the email option:
   - iPhone: "Open Settings, then Notifications, then RoWhether, and turn on Allow Notifications."
   - Chrome on Android: "Tap the icon left of the address, then Permissions, then Notifications, and choose Allow."
   - Desktop: "Click the icon left of the address and allow notifications for this site."
4. Otherwise, in the same click handler and before any `await` on the network: `Notification.requestPermission()`, then `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })` with the key already loaded by `loadInfo()` at startup. Apple: "When the user completes the gesture, call the push subscription method immediately from the gesture's event handler code" (from docs, Apple page).
5. `granted`: `POST /api/push/subscriptions`, then `POST /api/me/notify/prefs` for the pref, then the confirmation sheet. `default` (closed the prompt): "No problem. You can turn this on later in Account." `denied`: step 3's sheet.

Confirmation sheet:

> **Done**
>
> You will get Putney Landing's outlook for tomorrow morning at 8 PM. If it changes overnight, we tell you before first light.
>
> [Send a test] [Change time]

### 7.2 iOS: install first

On iPhone and iPad, notifications only work from the Home Screen app (2.1). `src/install.js` already knows the platform (`installKind()`), whether the app runs installed (`isStandalone()`), and has written steps (`STEPS`, `showSteps()`). The notify flow reuses them with a different title and a lead line:

> **Add RoWhether to your Home Screen first**
>
> On iPhone, notifications only work from the Home Screen app. After you add it, open RoWhether from your Home Screen and tap "Tell me tomorrow's conditions" again.
>
> 1. Tap the Share button. In Safari it is in the toolbar, or in the menu under the More button (three dots).
> 2. Scroll down the list and tap Add to Home Screen.
> 3. Tap Add. If you see Open as Web App, leave it on.

For `ios-app` (an in-app browser), the existing first step "Open this page in Safari" comes first, as in `STEPS['ios-app']`.

`src/install.js` gains `showInstallSteps({ title, lead })` so both callers share the dialog (`#install`). Sign-in state carries over: the Home Screen app is a separate storage context on iOS (unverified), so the user may need to sign in again there; the lead line says nothing about it, and the sign-in step of 7.1 handles it.

### 7.3 Keeping the subscription fresh

On every start, after `loadInfo()`, when signed in and `Notification.permission === 'granted'`, `syncPush()` in `src/notify.js`:

1. `const sub = await registration.pushManager.getSubscription()`.
2. No subscription but the server has prefs for this device's last known endpoint (`rowhether-push-endpoint-v1` in `localStorage`): show a quiet banner "Notifications are off on this device. Turn on", which runs step 4 of 7.1 on tap. (Subscribing without a tap is allowed by Chromium but not reliably by Safari, unverified, so the tap is always asked for.)
3. A subscription whose `options.applicationServerKey` differs from `/api/info`'s key: unsubscribe it and show the same banner.
4. A subscription whose endpoint the server has not seen, or last synced more than 7 days ago: `POST /api/push/subscriptions` (an upsert by endpoint hash that updates `last_seen_at`).

The service worker also handles `pushsubscriptionchange` (7.4) for browsers that fire it.

### 7.4 Service worker handlers

Today `vite-plugin-pwa` generates the service worker (`registerType: 'autoUpdate'`, Workbox `generateSW`) and `src/main.js` registers it. Push needs `push`, `notificationclick` and `pushsubscriptionchange` handlers.

Decision: keep `generateSW` and add a small hand-written `public/push-sw.js` through Workbox's `importScripts` option. Recommended: the smallest change to a working setup; `generateSW` accepts "A list of JavaScript files that should be passed to importScripts() inside the generated service worker file" (from docs, https://developer.chrome.com/docs/workbox/modules/workbox-build). Alternative: switch to `strategies: 'injectManifest'` with a bundled `src/sw.js` (from docs, https://vite-pwa-org.netlify.app/guide/inject-manifest.html), which needs `precacheAndRoute(self.__WB_MANIFEST)`, `cleanupOutdatedCaches()`, `skipWaiting()` and `clientsClaim()` written by hand to keep today's behavior; worth it only if the service worker grows beyond these handlers.

`vite.config.js` changes:

```js
workbox: {
  // ...existing options unchanged...
  globIgnores: ['**/*vietnamese*', '**/*latin-ext*', 'push-sw.js'],
  importScripts: [`push-sw.js?v=${pushSwHash}`] // hash of public/push-sw.js computed at build time, so a change updates the service worker
}
```

`public/_headers` adds `/push-sw.js` with `Cache-Control: no-cache`, like `/sw.js`.

`public/push-sw.js`:

```js
// Push notifications. Imported by the generated service worker. Every push
// shows a notification: Safari revokes permission for pushes that show none.
const FALLBACK = { title: 'RoWhether', body: 'Open the app for the latest conditions.', navigate: '/' };

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { /* show the fallback */ }
  const n = (d && d.notification && d.notification.title) ? d.notification : FALLBACK;
  event.waitUntil(self.registration.showNotification(n.title, {
    body: n.body || '', tag: n.tag, lang: n.lang || 'en-US', dir: n.dir || 'ltr',
    icon: '/icon-192.png', badge: '/badge-96.png',
    data: { url: n.navigate || '/', log: d.rw && d.rw.log }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = new URL(data.url || '/', self.location.origin);
  if (url.origin !== self.location.origin) return; // never open another site
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find(c => new URL(c.url).origin === url.origin);
    if (win) { await win.focus(); win.postMessage({ type: 'open', url: url.href }); }
    else await self.clients.openWindow(url.href);
    if (data.log) fetch('/api/notify/opened', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log: data.log }), keepalive: true }).catch(() => {});
  })());
});

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    const old = event.oldSubscription;
    const key = old && old.options && old.options.applicationServerKey;
    if (!key) return;
    const sub = event.newSubscription || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await fetch('/api/push/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), oldEndpoint: old.endpoint }) });
  })());
});
```

`src/notify.js` listens for the `open` message (`navigator.serviceWorker.addEventListener('message', ...)`) and routes: same path, set the hash (the existing `src/route.js` takes over); different path, `location.assign(url)`.

Service worker fetches to the same origin send cookies by default (`credentials: 'same-origin'`), so `/api/notify/opened` and the resubscribe know the user.

The badge icon `public/badge-96.png` (new) is a one-color sculler silhouette from `public/icon.svg`, rendered by `npm run icons`. Notification `actions` buttons are not used: support on iOS is unverified, and every notification works by tapping it.

The service worker still precaches the app shell only and caches no API responses, as CLAUDE.md requires.

### 7.5 Deep links

The notification opens the place that answers it. Each is a URL on the app's origin under 01's path routes and the existing hash routes.

| Kind | URL |
| --- | --- |
| `night_before`, `morning_change`, `morning_of` | `/<slug>#<tab>/<target day>` where `<tab>` is the tab of the top reason (the `TAB` map in `src/render/detail/week.js`: `fog`, `wind`, `rain`, `storms`, `river`, `air`, `temperature`), or `/<slug>` for Go |
| `nws_alert` | `/<slug>#storms` |
| `hazard` | `/<slug>?open=hazard:<id>` |
| `go_window` | `/<slug>#week` |
| `water_status` | `/club/<club-slug>#today` (06 20; 08 K23) |
| `practice` | `/club/<club-slug>#practice/<id>` (06 20; 08 K23) |
| `overdue` (rower) | `/<slug>?open=outing:<id>` |
| test | `/account#notifications` |

`?open=` is read once at startup by `handleOpenParam()` in `src/notify.js`, which opens the sheet named and removes the parameter with `history.replaceState`. Unknown values are ignored.

### 7.6 Unsubscribing

- Each pref has its own switch in Account. Turning one off sets `enabled = 0`; deleting removes it.
- "Turn off all notifications on this device": `sub.unsubscribe()` and `POST /api/push/unsubscribe` with the endpoint. The endpoint is a capability URL, so knowing it is enough to delete its row, with or without a session.
- Signing out (03) on a device runs the same unsubscribe first, so a shared phone stops getting the previous user's alerts.
- Deleting the account removes subscriptions, prefs and log rows (`ON DELETE CASCADE`), after 04's outing cleanup.
- Email: the `List-Unsubscribe` link turns off the pref that sent it, by an HMAC token: `t = base64url(prefId + "." + HMAC-SHA256(NOTIFY_LINK_KEY, prefId))` (new secret `NOTIFY_LINK_KEY`). The one-click POST acts. The GET page only asks, with one button that posts, because mail scanners open links (08 7.4, K36); after the post it says "You will not get Putney Landing's night-before outlook by email any more. [Turn it back on]".

## 8. Tables

Proposals for 08-architecture.md. `users` is 03's, `locations` 01's, `clubs` 06's, `emergency_contacts` 04's.

08 4.4 holds the canonical statements (`0008_notify.sql`): all three tables ship in phase 3, because the overdue steps write `notify_log` and it references `notify_prefs`; both kind lists include 06's `club`, with `notify_log.subkind` (K19); and `notify_log`'s CHECK is `user_id IS NOT NULL OR kind = 'system'`, with rows for emergency contacts carrying the rower's `user_id`, so deleting a contact cannot fail the CHECK (K20).

```sql
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL CHECK (length(endpoint) <= 1024 AND endpoint GLOB 'https://*'),
  endpoint_hash TEXT NOT NULL UNIQUE CHECK (length(endpoint_hash) = 43),  -- SHA-256, base64url
  p256dh TEXT NOT NULL CHECK (length(p256dh) = 87),                       -- 65 bytes, base64url
  auth TEXT NOT NULL CHECK (length(auth) = 22),                           -- 16 bytes, base64url
  service TEXT NOT NULL CHECK (service IN ('apple', 'fcm', 'mozilla', 'microsoft', 'other')),
  platform TEXT CHECK (platform IN ('ios', 'ipados', 'android', 'mac', 'windows', 'linux', 'other')),
  standalone INTEGER NOT NULL DEFAULT 0 CHECK (standalone IN (0, 1)),
  label TEXT CHECK (label IS NULL OR length(label) <= 40),
  vapid_key TEXT NOT NULL CHECK (length(vapid_key) = 87),                 -- the public key it was made with
  expiration_time INTEGER,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  last_ok_at INTEGER,
  last_status INTEGER,
  fail_count INTEGER NOT NULL DEFAULT 0,
  first_fail_at INTEGER,
  disabled_at INTEGER
);
CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id) WHERE disabled_at IS NULL;
CREATE INDEX push_subscriptions_stale ON push_subscriptions (last_ok_at, last_seen_at);

CREATE TABLE notify_prefs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('night_before', 'morning_of', 'nws_alert', 'hazard', 'go_window', 'water_status', 'practice')),
  location_id TEXT REFERENCES locations(id) ON DELETE CASCADE,
  club_id TEXT,                                  -- REFERENCES clubs(id), added with 06 in phase 5
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  local_time TEXT CHECK (local_time IS NULL OR (local_time GLOB '[0-2][0-9]:[0-5][0-9]' AND local_time < '24:00')),
  days INTEGER NOT NULL DEFAULT 127 CHECK (days BETWEEN 1 AND 127),
  params TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(params) AND length(params) <= 512),
  channels TEXT NOT NULL DEFAULT 'push' CHECK (channels IN ('push', 'email', 'push,email')),
  next_at INTEGER,                               -- next timed send, ms; NULL for event kinds
  next_check_at INTEGER,                         -- pending overnight check, ms
  last_snap TEXT CHECK (last_snap IS NULL OR (json_valid(last_snap) AND length(last_snap) <= 1024)),
  last_sent_at INTEGER,
  retries INTEGER NOT NULL DEFAULT 0 CHECK (retries BETWEEN 0 AND 6),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((kind IN ('water_status', 'practice')) = (club_id IS NOT NULL)),
  CHECK ((kind IN ('water_status', 'practice')) OR location_id IS NOT NULL)
);
CREATE UNIQUE INDEX notify_prefs_one ON notify_prefs (user_id, kind, COALESCE(location_id, club_id));
CREATE INDEX notify_prefs_due ON notify_prefs (next_at) WHERE enabled = 1 AND next_at IS NOT NULL;
CREATE INDEX notify_prefs_check ON notify_prefs (next_check_at) WHERE enabled = 1 AND next_check_at IS NOT NULL;
CREATE INDEX notify_prefs_loc ON notify_prefs (location_id, kind) WHERE enabled = 1;
CREATE INDEX notify_prefs_club ON notify_prefs (club_id, kind) WHERE enabled = 1 AND club_id IS NOT NULL;

CREATE TABLE notify_log (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE CHECK (length(dedupe_key) <= 160),
  kind TEXT NOT NULL CHECK (kind IN ('night_before', 'morning_change', 'morning_of', 'nws_alert', 'hazard', 'go_window',
                                     'water_status', 'practice', 'overdue', 'test', 'system')),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES emergency_contacts(id) ON DELETE SET NULL,
  pref_id TEXT REFERENCES notify_prefs(id) ON DELETE SET NULL,
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  ref_id TEXT,                                   -- outing, hazard, alert, practice or water_status id
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
  send_after INTEGER,                            -- end of quiet hours for held jobs
  sent_at INTEGER,
  opened_at INTEGER,
  read_at INTEGER,
  CHECK (user_id IS NOT NULL OR contact_id IS NOT NULL OR kind = 'system')
);
CREATE INDEX notify_log_user ON notify_log (user_id, created_at) WHERE user_id IS NOT NULL;
CREATE INDEX notify_log_queued ON notify_log (status, created_at) WHERE status = 'queued';
CREATE INDEX notify_log_ref ON notify_log (ref_id) WHERE ref_id IS NOT NULL;
```

These statements ran cleanly in SQLite 3.45.1 with foreign keys on, after 04's tables, and the checks behaved as intended: a second `night_before` pref for the same location, a `water_status` pref without a club and a `local_time` of 25:00 were refused (verified live 2026-10-17, local SQLite, not D1).

`notify_prefs.club_id` has no foreign key: `notify_prefs` arrives in phase 3 (08 K19) and `clubs` in phase 5, and SQLite cannot add a constraint to an existing column later. 06's membership code is its only writer and deletes a member's club prefs when they leave. (Alternative for 08: rebuild `notify_prefs` in phase 5's migration with the foreign key.)

Keys from browsers are normalized before storing: `+` and `/` become `-` and `_`, and `=` padding is removed (some browsers return padded base64, unverified which), so the length checks above hold.

Retention: `notify_log` rows 90 days, except `overdue` rows 1 year (04 section 8.9). Run by the daily cron.

Row costs: one `notify_log` insert and one update per notification; the unique index on `dedupe_key` adds a written row per insert (D1 counts index writes, from docs, https://developers.cloudflare.com/workers/platform/pricing/). 10,000 users at two notifications a day is about 1.8 million rows written a month, inside Paid's 50 million included.

## 9. API

Same origin, JSON, errors `{ "error": "code", "message": "Human sentence." }`. Session is 03's `__Host-rw_session` cookie (08 K56).

`GET /api/info` gains:

```json
{ "env": "production", "reports": true, "push": { "key": "BPcU9...87 characters" } }
```

`GET /api/health` (no session, phase 3): 200 `{ "ok": true }` or 503 `{ "ok": false }` from the tick heartbeat (5.2). It is cached 30 seconds and carries no detail, so it is safe to poll from an outside monitor and from the app.

`POST /api/push/subscriptions` (session)

```json
{
  "subscription": { "endpoint": "https://web.push.apple.com/QGx...", "expirationTime": null,
                    "keys": { "p256dh": "BNcRd...", "auth": "tBHItJI5svbpez7KI4CCXg" } },
  "standalone": true, "platform": "ios", "label": "iPhone, Home Screen app",
  "oldEndpoint": null
}
```

201 `{ "id": "9b7e...", "created": true }` or 200 `{ "id": "9b7e...", "created": false }` for a known endpoint. The endpoint host decides `service`; hosts other than Apple, FCM, Mozilla and Microsoft are stored as `other` and accepted only over `https`. `oldEndpoint` deletes that row if it belongs to the same user. Errors: 401 `sign_in`, 400 `invalid` "That subscription is not valid.", 409 `wrong_key` "This device subscribed with an old key. Turn notifications on again." (when `subscription.options` reports another key; the client sends `vapidKey` in that case), 429 `rate_limited`.

`POST /api/push/unsubscribe` (no session needed) `{ "endpoint": "https://..." }` returns 204.

`DELETE /api/push/subscriptions/:id` (session, owner) returns 204.

`POST /api/push/test` (session) `{ "subscriptionId": "9b7e..." }` returns 202 `{ "queued": 1 }`. 429 after 5 an hour.

`GET /api/me/notify` (session)

```json
{
  "settings": { "quietFrom": "22:00", "quietTo": "06:00", "tz": "America/New_York", "emailFallback": "safety" },
  "prefs": [
    { "id": "4c2a...", "kind": "night_before", "location": { "slug": "putney-landing", "name": "Putney Landing" },
      "enabled": true, "localTime": "20:00", "days": 127,
      "params": { "periods": ["morning"], "onlyIf": "always", "change": true },
      "channels": "push", "nextAt": 1792281600000 }
  ],
  "devices": [
    { "id": "9b7e...", "label": "iPhone, Home Screen app", "service": "apple", "lastOkAt": 1792195200000, "thisDevice": true }
  ]
}
```

`thisDevice` is true when the request carries `X-Push-Endpoint-Hash` matching the row (the client sends the SHA-256 of its own endpoint).

| Endpoint | Body | Returns |
| --- | --- | --- |
| `POST /api/me/notify/prefs` | `{ "kind", "location" or "club", "localTime", "days", "params", "channels" }` | 201 `{ "pref" }`; 409 `exists` with the existing pref; 400 `invalid` with `"field"`; 400 `too_many` "Up to 30 alerts." |
| `PATCH /api/me/notify/prefs/:id` | any of `enabled`, `localTime`, `days`, `params`, `channels` | 200 `{ "pref" }` with the new `nextAt` |
| `DELETE /api/me/notify/prefs/:id` | | 204 |
| `PUT /api/me/notify/settings` | `{ "quietFrom", "quietTo", "tz", "emailFallback" }` | 200 `{ "settings" }` |
| `GET /api/me/notifications?before=<ms>&limit=30` | | `{ "items": [{ "id", "kind", "title", "body", "url", "createdAt", "readAt" }], "unread": 2, "next" }` (last 30 days) |
| `POST /api/me/notifications/read` | `{ "upTo": <ms> }` or `{ "ids": [...] }` | 204 |
| `POST /api/notify/opened` | `{ "log": "<id>" }` | 204; sets `opened_at` and `read_at` if the session's user owns the row, else does nothing |
| `GET /api/notify/unsubscribe?t=` | | A small HTML page (7.6) |
| `POST /api/notify/unsubscribe?t=` | `List-Unsubscribe=One-Click` | 200 |
| `POST /api/admin/tick` | | Dev only, owner: runs one tick, returns counts |
| `GET /api/admin/notify/stats?days=7` | | Owner: sent, skipped by reason, push failures by status, queue backlog, DLQ count |

`localTime` validation: `night_before` 18:00 to 22:00 and `morning_of` 03:30 to 09:00, both in 15-minute steps; 400 `invalid` "Pick a time between 6 and 10 PM." otherwise.

## 10. Costs

Monthly, on Workers Paid. Push services charge nothing. Prices from docs as cited above; usage is estimated.

| Item | 500 users with alerts | 10,000 users with alerts |
| --- | --- | --- |
| Workers Paid subscription | $5.00 | $5.00 |
| Notifications sent (night-before, 20% overnight updates, NWS, hazards) | about 22,000 | about 440,000 |
| Queue operations (3 per message) | 66,000, included | 1.32 million: about $0.13 over the included million |
| Cron invocations (1,440 a day plus 1) | 43,000, included in 10 million requests | same |
| CPU (models: about 50 to 500 location groups a night at an estimated 20 ms each, plus sends) | far under the 30 million included CPU ms | under the included amount (estimate) |
| D1 rows written (log insert, index, update) | about 90,000, included | about 1.8 million, included in 50 million |
| Email (5% of notifications by email, plus overdue) with Cloudflare Email Service | about 1,200, inside 3,000 included | about 22,000: about $6.65 |
| Server-side Open-Meteo (02's decision, API Standard) | $29 (price unverified, per 02) | $29, or a higher tier if calls exceed 1 million (unverified) |
| SMS | none (decision 2.3) | none |
| Total | about $34 | about $41 |

If the owner declines the Open-Meteo key, the total drops by $29 and evening outlooks risk `429` errors from shared egress (02).

## 11. Phases

| Phase | What ships |
| --- | --- |
| 3 | The engine skeleton: `scheduled()` with the every-minute tick and the daily run, `notify_log`, the queue and consumer, `sendEmail()` delivery, and the overdue steps of 04 by email. Workers Paid. |
| 4 | Web Push: VAPID keys, `push_subscriptions`, `public/push-sw.js`, the permission flow and iOS install guidance, `notify_prefs`, night-before, overnight change, morning-of, NWS alerts, hazard alerts, Go windows, the in-app list, overdue by push. |
| 5 | Club water status alerts and the club safety step of overdue (06). |
| 6 | Practice change alerts and practices folded into the night-before (06). |
| 7 | Alerts outside the US from 02's Worker adapters (ECCC, Met Office, MeteoAlarm, MetService), matched by polygon or region; metric copy by the location's units (07). Translated copy later. |

The CLAUDE.md Later item "Night-before alert ... Needs a Worker script, Web Push, a cron trigger, and KV or D1 for subscriptions" is phase 4 here, on D1.

## 12. Tests

Unit tests (Vitest, `test/`), with `fetch`, the queue and D1 stubbed in the style of `test/reports.test.js` and `test/suggest.test.js`. Nothing calls a real push service or email provider.

`test/push.test.js`:

- Round trip: generate a subscriber key pair with WebCrypto, encrypt with `sendPush()`'s path, then decrypt in the test per RFC 8291 section 3.4 (ECDH with the subscriber private key, HKDF with the auth secret, AES-128-GCM) and compare the plaintext. Guards the pinned library.
- Headers: `content-encoding: aes128gcm`, `ttl`, `urgency`, `topic` only when set, `authorization` starts with `vapid t=` and its JWT has `aud` equal to the endpoint origin, `exp` at most 24 hours ahead, `sub` from `VAPID_SUBJECT`.
- The VAPID header is reused for the same origin within 11 hours and re-signed after (fake clock); `source_cache` is read before signing.
- Payload over 3,993 bytes throws.
- `classify()`: 201 ok; 404 and 410 gone; 403 with `{"reason":"VapidPkHashMismatch"}` gone; 403 `BadJwtToken` config error; 413 bug; 429 with `Retry-After: 120` retries at 120 s; 503 retries.

`test/notify-schedule.test.js`:

- `nextAt()` for `night_before` at 20:00 in America/New_York before and after 8 PM, across 2026-11-01 (fall back) and 2026-03-08 (spring forward, including 02:30 which does not exist); in Australia/Sydney across 2026-04-05; in Asia/Kolkata (+5:30); `days` masks (weekday mornings fire Sunday to Thursday evenings).
- Overnight check time: 75 minutes before first light, clamped to 4:00 AM and to the morning period start; a polar-day location (01 section 15.4).
- Quiet hours: held kinds wait until 06:00 in the user's zone; timed kinds and overdue are not held; a Stay off level NWS alert issued at 5:10 AM is sent at once and a Caution level one waits until 6:00; a quiet span across midnight; `tz` different from the location's.
- Caps: the 9th non-safety push in 24 hours becomes in-app only.

`test/notify-copy.test.js`:

- Every builder with fixture periods: Go, Caution with fog and lights, Stay off with the next Go, all three periods, forecast not available, alerts not checked, no daylight.
- Each failed slot (`alerts`, `river`, `flow`, `aq`) adds its sentence; a Go with a failed flow slot is not titled Go; a location with no flow binding or no alerts feed adds "Not checked here: ..."; Putney with every source adds nothing.
- Rules on every output: title at most 50 characters, body at most 240, no em dash or en dash characters, no word "call" (except "call 911" in 04's contact emails), starts with the location's short name, times formatted in the location's zone.
- Change detection: level up, level down, fog appears, fog clears, same level with a storm reason, unchanged (skip).

`test/notify-engine.test.js`:

- Overdue email: a provider stub that throws for one contact marks that row `failed`, the next tick retries it, the rower gets the failure line, and a second failure alerts the owner; overdue sends run ahead of queued alerts; alert email stops at 70% of `EMAIL_DAILY_LIMIT` and overdue email does not.
- Last good flow: after a failed gauge fetch the previous reading is used while it is within `maxAgeH`, and not when it is older.
- A tick with three due prefs at two locations fetches each location's data once and builds one model per settings group (spy on `buildModel`).
- Dedupe: the same tick run twice inserts and enqueues once; an overlapping tick sees `ON CONFLICT` and enqueues nothing.
- `next_at` advances in the same batch as the log insert.
- `wx` failure retries 6 times at 5-minute steps, then sends the "not available" message.
- NWS: a state response with an alert whose UGC includes the location's zone matches; a polygon alert containing the dock matches; one outside does not; an `Update` with the same level does not notify again; an upgrade does; an alert overlapping no rowing window in 36 hours is skipped; a 304 with the stored ETag parses nothing.
- Hazard fan-out respects `radiusKm` and excludes the poster.
- Overdue steps from 04 run through the same tick with a fake clock (shared fixtures with `test/outings.test.js`).
- Heartbeat: a tick writes `tick:heartbeat` with the step results even when one step threw; `GET /api/health` answers 200 after a good tick, 503 when the clock is 6 minutes past the last heartbeat, and 503 after `runOverdue` throws on 3 ticks in a row; one good run clears it.

`test/notify-deliver.test.js`:

- A batch loads subscriptions once; each subscription sent; `notify_log` counts updated; a gone subscription deleted; temporary failure on one of two subscriptions creates a single-subscription retry job and acks the original.
- `emailIfNoPush` sends email only when no push succeeded.
- Held jobs whose subject ended (alert expired, hazard cleared) are dropped as `stale`.

`test/push-sw.test.js`: load `public/push-sw.js` with a fake `self` (`registration.showNotification`, `clients.matchAll`, `clients.openWindow`, `addEventListener`) and check: a declarative payload shows its title and body; an unreadable payload shows the fallback; a click focuses an open window and posts `open`; with no window it opens the URL; a URL on another origin opens nothing.

Workers runtime check: a test run with `@cloudflare/vitest-pool-workers` (version to pin when added; unverified) or `wrangler dev` that builds a Putney model inside workerd from recorded fixtures and compares with the Node result, to prove `Intl` time zones and SunCalc behave the same. `npx wrangler deploy --dry-run` must bundle with the `scheduled` and `queue` handlers.

Benchmark: `scripts/bench-model.mjs` builds 100 models from fixtures and prints ms per model. The design assumes under 20 ms; above 50 ms, the tick handles fewer prefs per run (the `LIMIT 500` drops) and the queue takes model building too.

Browser checks (Playwright, as in CLAUDE.md):

- Chromium with `context.grantPermissions(['notifications'])` and a stubbed `/api/info` push key: the Week tab button subscribes (stub `pushManager.subscribe` if the headless browser has no push service), posts the subscription and the pref, and shows the confirmation sheet.
- iPhone user agent, not standalone: the button opens the install steps with the notifications lead line.
- Permission `denied` (`context.grantPermissions([])` with a stubbed `Notification.permission`): the help sheet shows with the email option.
- Opening `/putney-landing?open=hazard:abc` opens the hazard sheet and removes the parameter.
- The 9 PM pinned clock shows "Get this every evening at 8 PM" under Share this forecast; dismissing it keeps it hidden after a reload.

Manual device checklist before phase 4 ships: iPhone on iOS 16.4 or later from the Home Screen (plus iOS 18.4 or later for the declarative path, with the service worker made to throw), iPad, Android Chrome, desktop Chrome, desktop Firefox, Safari on macOS. For each: subscribe, test notification, tap opens the right view, the overnight update replaces the night-before on the lock screen (tag), unsubscribe.

## 13. Open questions and decisions

Decision: move to Workers Paid before phase 3. Alternative: stay on Free and drop server-side forecasts and email to contacts.

Decision: use `@block65/webcrypto-web-push` 2.0.0, pinned, behind `worker/push.js`. Alternative: our own RFC 8291 and 8292 code on WebCrypto. Alternative: `@pushforge/builder` (older `aesgcm` encoding).

Decision: keep `generateSW` and add `public/push-sw.js` through `importScripts`. Alternative: switch to `injectManifest` with a bundled `src/sw.js`.

Decision: send Declarative Web Push payloads and read the same JSON in the service worker. Alternative: plain JSON for the service worker only.

Decision: deliver through a Cloudflare Queue with a dead letter queue. Alternative: send inside the tick, 6 at a time.

Decision: push and alert rules need a signed-in account. Recommended: settings, several devices, email fallback and unsubscribe all hang off the account, and accounts arrive in phase 2. Alternative: device-only subscriptions without an account, with prefs stored on the subscription row (`push_subscriptions.user_id` nullable).

Decision: no SMS at launch. Alternative: Twilio SMS to emergency contacts for overdue messages only.

Decision: give overdue mail a second route, and give the owner an alert that does not depend on email. Recommended: Resend on its free tier, used only for overdue email when Cloudflare Email Service refuses it, and an outside uptime monitor that polls `GET /api/health` every minute (5.2) and pushes to the owner's phone when the tick stops or an overdue send fails twice. Alternative: Twilio SMS for overdue only, which needs US registration and per-message fees. Alternative: neither, relying on the rower's failure line and the owner's daily digest.

Decision: set a separate VAPID key pair as Preview secrets so push works on dev. Alternative: no push on dev.

Decision: NWS alerts notify at the Stay off level by default, with "All NWS alerts" as an option. Alternative: every alert by default.

Decision: timed alerts the user scheduled ignore quiet hours; unscheduled ones are held, except overdue, water closed and Stay off level NWS alerts. Alternative: quiet hours hold everything except overdue.

Decision: record `opened_at` when a notification is tapped, for the owner's stats only. Alternative: record nothing beyond sent.

Decision: the night-before default is 8 PM and the overnight check is 75 minutes before first light, not before 4 AM. Alternative: let each user set the check time.

Open questions:

- Whether WebKit accepts the extra `rw` member in a declarative payload, and whether the push event in the service worker on iOS 18.4 gets the full JSON. Test on a device before relying on `rw`.
- Whether Worker Previews run cron triggers and accept `queues` in the `previews` block.
- Whether `Intl.DateTimeFormat` with any IANA zone and SunCalc give identical results in workerd and Node (the runtime test answers it).
- The USGS OGC API's limit on comma-separated `monitoring_location_id` values.
- How many lines of a notification body iOS and Android show on the lock screen; the 160-character target is a guess.
- Server-side Open-Meteo pricing (02's decision) is the largest cost and its price is unverified.
- The change rules in 3.4 and the caps in 4.5 are first guesses. Check `notify_log` skip reasons and opens after a month.
