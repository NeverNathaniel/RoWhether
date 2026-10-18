# People and safety review

Reviewed `docs/full-app/01` to `08` (branch `dev-full-app` at 59bed34) from the side of the people who use the app: rowers on the water, juniors and their guardians, coaches and club safety officers, and people affected by what others post. Started 2026-10-18 10:05 UTC and finished 2026-10-18 10:24 UTC (`date -u`).

Status: complete

Count: 6 blocker, 19 major, 9 minor (34 findings).

Blockers by the phase they block: phase 3, P1 (overdue email failures) and P2 (limits on community locations); phase 5, P10 (kiosk rows), P17 (guardian links), P18 (guardian invite links) and P19 (unverified clubs with juniors).

How to read this:

- Severity. Blocker: people could be put at risk, or the law broken, if built as written; fix before the phase it affects is built. Major: wrong, contradictory or unsafe. Minor: wording or a small gap.
- Where gives the file, section and line numbers on this branch at the time of review. Quotes are copied from the docs.
- Each finding was checked against the text before it was written down. Findings are grouped by area, then by severity.
- This review does not edit the plan docs. The fix pass (HANDOFF step 4) applies or skips each finding and records which.

## 1. On-water safety

### Blockers

#### P1. Overdue emails to contacts can fail without anyone knowing, and the rower is told they were sent

- Severity: blocker (phase 3).
- Where: `04-reports-and-check-ins.md` 6.2, line 926; `05-notifications.md` 5.6 line 481, 5.7 lines 498, 508 and 510, 5.8 lines 512 to 520; `03-accounts-and-privacy.md` 3.5 lines 156 and 167.
- Problem: Stage 3 says "The rower is told: \"We emailed Jordan and Casey.\"" (04 line 926). Nothing ties that message to the contact email being accepted. A temporary email failure retries "at 60 s, 5 min, 15 min, 30 min (`max_retries: 4`)" (05 line 498), then the job goes to the dead letter queue, which "is checked by the daily run; any message there is logged and counted in the owner's digest" (05 line 510). The 5.8 failure table has rows for D1, the queue, push, VAPID and Open-Meteo, and none for the email provider refusing or throttling sends. 03 picks Cloudflare Email Service, where "New accounts start with a conservative daily quota that grows with reputation (number not published)" (03 line 156) and "05's email alerts count against the same quota" (03 line 167). A busy alert evening or a burst of sign-in codes can use up the quota that overdue mail needs. Email is the only channel to contacts (05 2.3, no SMS). Result: a rower is overdue, the contacts are never told, the rower's phone says they were, and the owner hears the next day.
- Fix: Send the rower's "We emailed" line only after the provider has accepted each contact's email, and name failures ("We could not email Jordan. Call someone now."). Give overdue mail its own lane: never queued behind alerts, a reserved share of the daily quota, and a second provider (or SMS) used for overdue only when the first fails. An overdue job that fails twice alerts the owner at once through a channel other than the failing one, not only in the daily digest. Add an email row to 5.8. Test with a stubbed provider that throws: the rower gets the failure line and the owner gets an alert.

Applied: 04 6.2 (accepted-only wording and the failure line "We could not email Jordan. Call someone now.", a rule for the overdue lane), 6.5 (stage 3 copy), 12 (new `test/overdue-delivery.test.js`); 05 5.7 (overdue mail sent from the tick ahead of the queue, retried, a 70% cap on other email via `EMAIL_DAILY_LIMIT`), 5.8 (new email row), 12 (a test); 08 6.3 (`EMAIL_DAILY_LIMIT`); 03 3.5. The second provider and an out-of-band owner alert are a cost and vendor choice: recorded as a Decision in 05 section 13 with Resend and an outside monitor recommended. Until the owner decides, the rower's failure line and the owner's digest are the safety net.

#### P2. Whoever adds a location sets the limits every visitor's verdict uses, with nothing to stop very loose ones

- Severity: blocker (phase 3).
- Where: `01-locations.md` 11.1 lines 1054 to 1058, 11.5 line 1111, 11.6 line 1125, 12.7 line 1215, 13.1 line 1246, 13.5 line 1291, 17 line 1638; `index.html` lines 118, 123 and 133 (today's input ranges); `07-product-and-ux.md` 4.3 line 282.
- Problem: Step 5 of the add flow says "These are the starting limits for everyone at this location" (01 line 1215), and they become the location's `thresholds`, applied to every viewer without personal values (01 line 1111). The creator can keep changing them: "Edit a `published` location directly | yes" for the creator (01 line 1246). The only bounds are "Validation as today" (01 line 1125), and today's fields accept a wind stay off line up to 60 mph, gusts up to 80 mph and a cold line as low as 0°F (`index.html` lines 118, 123, 133). Rain, flow and AQI may be left blank, which "turns the level off" (01 lines 1056 to 1058). A careless or malicious creator can publish a location that shows Go in a 40 mph wind over near-freezing water to every visitor who has not set their own limits. Community locations "go live as `published` ... with moderator review after the fact" (01 line 1638), and the only sign on the page is the "Community added" badge under the subtitle (07 line 282). "Limits reviewed" (01 line 1291) happens only when someone verifies the location.
- Fix: For locations that are not verified, refuse limits looser than the global defaults (wind 10 and 15 mph, gusts 18 and 25, cold line 100°F, rain 60 and 90%, AQI 151 and 201), and refuse blank levels except flow without history. Only a moderator or steward club can loosen them, through a reviewed revision. After publishing, edits to limits, bindings or the course on a published location go through suggestions, not direct edits by the creator. When a location's limits differ from the global defaults, the hero says so in its quiet line ("Limits here were set by the person who added this location.").

Applied: 01 11.1 (bounds for a location that is not verified: no limit looser than the global defaults, no blank level except flow without history), 11.6, 12.7, 12.10 (the create check), 13.1 (after publishing the creator edits text only; limits, sources and course are suggestions a steward club or moderator approves), 17 (a Decision); 07 6.7 (the hero line "Limits here were set by the person who added this location.").

#### P10. The boathouse kiosk can set off another member's float plan, and mark another member's boat back

- Severity: blocker (phase 5).
- Where: `06-clubs.md` 8.2 line 898, 8.5 lines 975 and 977; `04-reports-and-check-ins.md` 5.1 line 692, 5.7 line 819, 5.8 line 859.
- Problem: At the kiosk, "Anyone at the boathouse can pick any adult name, as with a paper logbook" (06 line 977). For a picked member with an account, "their float plan default applies, with the line \"Sam's contacts will be emailed if Sam is late.\"" (line 977). A prank, or a tap on the wrong "Sam", sends overdue emails to Sam's family while Sam is at home, and Sam's own Start a row is then refused, because an account may have one active outing (04 lines 692 and 819; 409 `already_out`, line 859). Worse, the kiosk can "mark back rows it started or the picked member's" (06 line 975). Picking the wrong name and tapping Back ends a real outing, stops its escalation and sends the rower's contacts an all clear while the rower is still on the water. The plan answers misuse only after the fact ("a member who finds a row they did not start can delete it from their log", line 977). A paper logbook emails nobody, so the comparison stops holding once an entry drives alerts.
- Fix: A kiosk row started for someone else never arms that person's float plan; their contacts are emailed only after the member confirms the row on their own device. Every kiosk action on a member's row, start or back, sends that member a push at once with "Not you? Undo". The kiosk can mark back only rows started at that kiosk; a row started on a phone is marked back from that phone or by staff. The confirm step shows boat, start time and back-by time, so a wrong name is caught before it counts.

Applied: 06 8.5 and 8.2 table (a kiosk row always has `user_id` NULL and `float_plan` 0, so it never arms a float plan or uses a member's one active outing; a confirm step shows name, boat, start and back-by; the picked member gets a push or email with "Not you? Undo"; the kiosk marks back only rows started at that kiosk), 8.4 table, tests and the open question; 04 5.1 and 5.5. The member's contacts are told only through the member's own Start a row on their phone, so no claim route was added.

### Majors

#### P3. Nothing notices when the every-minute tick stops

- Severity: major (phase 3).
- Where: `05-notifications.md` 5.2 line 342, 5.8 lines 512 to 520; `04-reports-and-check-ins.md` 6.2 line 937.
- Problem: 04 promises "Worst-case lateness: one minute (cron period) plus delivery" (line 937). In the tick, "Failures are logged with the step name; one step failing never stops the others" (05 line 342). 5.8 has no row for a tick that throws on every run (a bad deploy, a migration that renames a column, a bug in `runOverdue`) or for cron triggers that stop firing. Logs are only seen when the owner reads them, and Workers Logs keep 3 to 7 days (03 12.1). Float plans would then do nothing, with no alert to the owner and no sign in the app.
- Fix: Add a heartbeat. Each tick writes its time and per-step result to one row. A separate check (a second Worker on its own cron, or an outside uptime monitor) alerts the owner when the heartbeat is more than 5 minutes old or `runOverdue` has failed 3 times in a row. While the heartbeat is stale, the Start a row sheet and the outing banner say "Late alerts are delayed right now. Tell someone your plan." Add the case to 5.8 and a test.

Applied: 05 5.2 (a heartbeat row `tick:heartbeat` in `source_cache`, written by every tick; `GET /api/health` answers 503 when it is over 5 minutes old, `runOverdue` has failed 3 times in a row, or an overdue email is stuck), 5.8 (new row), 9 (the route), 12 (a test) and 13 (the outside monitor polls `/api/health`); 04 5.2, 6.2 and 12 (the sheet and the banner say "Late alerts are delayed right now. Tell someone your plan."); 08 3 (router prefixes) and 7 (the route). No new table or migration.

#### P4. Evening and morning messages built without river flow say nothing about it

- Severity: major (phase 4).
- Where: `05-notifications.md` 3.3 line 132, 5.3 lines 387 to 389; `01-locations.md` 15.7 line 1500.
- Problem: When the gauge fetch fails, the server model is "Built without flow rules, as the app does when the gauge fails. Nothing added to the copy." (05 line 388). The app does not do that: it keeps the last good value and names the failure under the hero (01 line 1500). The server has no last good value beyond its 10-minute cache, so flow simply drops out. On a river, high flow is a main Stay off reason, and a gauge can stop reporting at any time, high water included. The result can be "Putney: Go tomorrow morning" on the lock screen (05 line 132) with no hint that flow was not checked. Alerts get a sentence ("NWS alerts could not be checked.", line 387); flow and air quality get none (lines 388 and 389).
- Fix: Keep the last good flow reading server-side (in `source_cache`, with its time) and use it under the same `maxAgeH` rule as the app. When a bound slot that can raise the level is missing or too old, add a sentence ("River flow could not be checked.") and do not title the message Go; say which level the checked factors give and that flow was not checked. Test each failed slot.

Applied: 05 5.3 (the last good flow reading is kept in `source_cache` with its time and used under `maxAgeH`; a failed flow or air quality slot adds "River flow could not be checked." or "Air quality could not be checked."; a Go built with a failed slot is retitled, for example "Putney: tomorrow morning, flow not checked", and says what the checked factors give), 3.3 (two new rows) and 12 (tests for each failed slot and for the last good reading). Alerts follow the same rule.

#### P5. The hero shows the same Go when a key factor is not checked at all

- Severity: major (phase 1 for stale gauges, phase 3 for community locations).
- Where: `02-data-sources.md` Principles line 44, Graceful degradation lines 719, 724 and 726; `01-locations.md` 15.7 lines 1500 and 1501; `07-product-and-ux.md` 6.7 lines 788 and 790.
- Problem: For a slot with no binding, 02 says "Nothing in the hero. The relevant tab says what is missing and what to do." (line 719). A river location with no gauge, or a location with no official alerts feed, shows Go in the hero exactly as Putney does. The gap appears only in the Storms tab and in the Week view's River or Alerts row (02 lines 724 and 726; 07 line 790). A bound gauge whose last reading is over 24 hours old is "not used for Go, Caution or Stay off", with only a fact note (01 line 1501; 07 line 788), while a failed fetch is named under the hero (01 line 1500). 02's own principle is that a missing source "never reads as \"no concern\"" (line 44). A plain Go in the hero reads exactly that way to someone who never opens the tabs.
- Fix: Add one quiet line under the hero whenever a factor that could change the level is not checked here or for this hour: "Not checked here: river flow, official alerts." Use the same line for a stale bound gauge: "River flow not checked: the gauge has not reported for 2 days." Share text and the night-before message carry it too. Nothing changes for Putney while all its sources answer, so phase 0 stays identical.

Applied: 07 6.7 (a quiet hero line `#notChecked`: "Not checked here: river flow, official alerts." and, for a stale gauge, "River flow not checked: the gauge has not reported for 2 days."), 6.2 (Share carries it) and 11.2 (placement); 01 8.4 (new `notChecked(m)`, phase 1, empty for Putney) and 15.7; 02 Principles and Graceful degradation (the hero line for a missing factor that could change the level); 05 3.3 and 5.3 (the night-before message carries it).

#### P6. Stay off weather warnings wait out quiet hours, which overlap dawn rowing

- Severity: major (phase 4).
- Where: `05-notifications.md` 3.1 line 109, 4.1 line 237, 4.4 line 273, 13 line 1045; `03-accounts-and-privacy.md` 11.3 line 750.
- Problem: `nws_alert` is "Held" during quiet hours (05 line 109). Apart from the times a person schedules, only "`overdue` and `water_status` closed ignore quiet hours" (05 line 273). Default quiet hours are "10 PM to 6 AM" (05 line 237). At Putney, civil dawn is 4:37 AM on June 21 and 4:55 AM on May 15 (computed with SunCalc 1.9.0 from the repo's `node_modules`, 2026-10-18), so the first rowing hour of the summer falls inside default quiet hours. A Severe Thunderstorm Warning issued at 5:10 AM would reach a rower on the water at 6 AM. 03 says the opposite: "Safety notifications (water closed, overdue boat, severe alert) | Always | Always" (03 line 750).
- Fix: Treat Stay off level NWS alerts as safety: never held, like `overdue` and water closed. Hold only Caution level alerts. Change 05 3.1, 4.4 and the Decision at line 1045 to match 03, and add a test with a warning issued at 5:10 AM.

Applied: 05 3.1 (`nws_alert` is never held at the Stay off level, held at the Caution level), 4.4, 12 (a test with a warning issued at 5:10 AM) and the quiet hours Decision in 13; 03 11.3 table row now says "Stay off level weather alert", which matches.

#### P7. Flow limits are bare numbers that silently stop working when the gauge or its unit changes

- Severity: major (phase 3).
- Where: `01-locations.md` 11.1 line 1058, 11.5 line 1117, 12.5 line 1192, 13.2 line 1266, 15.6 line 1493, 15.7 line 1502; `03-accounts-and-privacy.md` 9.1 line 594; `06-clubs.md` 6.2 line 549.
- Problem: Flow limits are in "the flow binding's unit (cfs, m³/s, ft, m)" and are "compared without conversion" (01 lines 1058 and 1493). A stage gauge means "Limits will be in feet" (01 line 1192). The gauge can change: a retired gauge prompts "Pick a new one for Putney Landing" (01 line 1502), and edits replace sources "as a whole list" (01 line 1266). Location defaults, club rules (06 line 549) and each person's synced `flowCaution` and `flowOff` (03 line 594) are stored as numbers with no unit or gauge. After a switch from a cfs gauge to a stage gauge, a personal limit of 20,000 is compared with readings near 8 ft and never triggers. After a switch to another cfs gauge on a bigger or smaller reach, the old numbers mean something else. Nothing in 01, 03 or 06 clears or re-checks these values.
- Fix: Store the binding id (or the gauge id and unit) with every flow, stage and tide limit: location thresholds, club rules and `user_settings`. When the primary binding changes, stop applying limits set for the old one, recompute location defaults from the new gauge's history, and say so in Settings and How this works ("Your flow limits were for the North Walpole gauge. Set them again for this gauge."). Tell club safety officers when a club rule is affected.

Applied: 01 11.1 (a limit basis: flow, tide and level limits are stored with the `adapter:ref:unit` of the binding they were set for and apply only while it is the primary binding; a changed binding recomputes location defaults, ignores personal and club limits and says so), 13.2 (a binding swap carries new thresholds and the approver sees the effect) and 15.7; 03 9.1 and 08 7.5 (`limitBasis` synced beside the numbers); 06 6.2 (`limits.basis`, club admins and safety officers told). Phase 1 and later; Putney keeps its values.

#### P8. A contact who opts out, or whose address bounces, leaves the rower thinking the float plan is set

- Severity: major (phase 3).
- Where: `04-reports-and-check-ins.md` 5.2 lines 711 and 714, 6.1 line 891, 6.2 line 926, 6.4 line 990.
- Problem: A contact can opt out from the stop link in the notice email or in any overdue email (04 line 891), and stage 3 then goes only to "Contacts not opted out" (line 926). Nothing tells the rower when a contact opts out. The Start a row switch is "On when contacts exist" (line 711), and the footer says "At 8:30 AM we email Jordan and Casey." (line 714) whether or not Jordan has opted out. A bounce is shown "in the banner and in Account" (line 990), but the banner exists only during an outing, when the rower may be the one in trouble. A rower whose only contact opted out has no float plan and is told they have one.
- Fix: Tell the rower at once, in the app and by email, when a contact opts out or an address bounces. The Start a row sheet names only contacts who can be reached, says plainly when none can ("Jordan asked not to get these emails. Nobody will be told if you are late."), and turns the switch off in that case. A contact counts as reachable only after the notice email was accepted.

Applied: 04 6.1 (one test for a reachable contact: email, notice accepted, not opted out, no bounce; the rower is told at once by push or email and in Account when a contact opts out, bounces or is refused; new column `bounced_at`), 5.2 (the switch and the footer name only reachable contacts and say plainly when none can be reached), 6.2, 6.4 and 12; 08 4, `0007_outings.sql` (`emergency_contacts.bounced_at`); 05 5.7.

#### P9. Anyone holding the status link can stop the escalation with a typed name

- Severity: major (phase 3).
- Where: `04-reports-and-check-ins.md` 5.8 line 854, 6.3 lines 942, 975, 977 and 979, 6.5 line 1022, 8.1 line 1074.
- Problem: One token per outing is shared by every contact and also returned to the rower at the start (`statusUrl`, line 854; token rules line 942). "I reached Alex, they are safe" asks only for "the contact's name and an optional note (120 chars), runs Turnstile, sets `safe_by = 'contact'`, stops the escalation and tells the other contacts and the rower" (line 977). The name is typed, not known. Anyone with the link (a forwarded email, a shared family inbox, someone the rower showed it to) can end the escalation, and the other contacts then read "Jordan reached Alex at 8:44 AM. No more emails will be sent." (line 975). The overdue email names the other contacts ("Also told: Casey.", line 1022), so one mistaken or false mark stops the people who would otherwise act.
- Fix: Give each contact their own token for the same status data, and record the safe mark against that contact's stored name, not a typed one. Ask for one confirmation ("You have spoken to Alex or seen Alex since 8:00 AM?"). Tell the other contacts who marked it and when, and let them restart the escalation ("I am still worried"). Keep the rower's token separate from the contacts'.

Applied: 04 6.3 (each contact has their own status token, derived with `NOTIFY_LINK_KEY` so a retry sends the same link; the rower's token only views; a safe mark asks one confirmation, records the stored name, and tells the rower and the other contacts who and when; "I am still worried" reopens at stage 4 and then needs the rower, a club safety role or two contacts to end it), 5.7 (new table `outing_contacts`), 5.8, 6.5 (safe mark email), 8.1, 8.2, 8.9 and 12; 08 4 (`0007_outings.sql`), 6.3 (`NOTIFY_LINK_KEY` moves to phase 3), 7.

#### P11. A row started or finished without signal is sent only while the app is open, and the copy does not say so

- Severity: major (phase 3).
- Where: `04-reports-and-check-ins.md` 3.10 line 469, 5.6 lines 754, 757 and 759; `07-product-and-ux.md` 3.4 line 143.
- Problem: The outbox is "Flushed in order on `online`, on `visibilitychange` to visible, on startup, and every 30 s while visible and non-empty" (04 line 469). Every trigger needs the page to be open; the plan names no way to send while the app is closed or the phone is locked. The offline banner says "Not sent yet. No signal. Your contacts will not be told if you are late until this sends." (line 754; 07 line 143), which reads as if it will send by itself once there is signal. A sculler who starts offline, locks the phone and rows into signal is still not covered, and does not know it. The reverse case is not covered at all: an "I'm back" queued on a dock with no signal (line 757) leaves the outing open, so contacts are emailed at T + 30 while the rower drives home; the plan handles only the late arrival of that message (line 759) and shows the rower no warning.
- Fix: Change the copy to what is true: "Not sent yet. It sends when RoWhether is open and has signal. Until then, nobody will be told if you are late." Add the same line after a queued "I'm back": "Not sent yet. Open RoWhether when you have signal, or Jordan will be emailed at 8:30 AM." Let a rower set the float plan before leaving home (a planned start time, armed then unless cancelled), so the dock's signal does not decide whether anyone is told. Cover both cases in the Playwright offline check.

Applied: 04 5.6 (the offline line now says it sends only when the app is open; a queued "I'm back" has its own warning; a planned start sets the float plan from home with `planned: true` and `outAt` up to 12 hours ahead), 3.10, 5.1, 5.2 (a Start time field), 5.3, 5.5, 5.8, 6.4 and 12 (both offline cases in the Playwright check); 07 3.4 and 11.4 (the copy); 06 8.4 (the board counts a planned row from its start). No schema change: a planned row is `status = 'out'` with a future `out_at`.

#### P12. The overdue email leaves out what a caller needs, and the status page needs the whole app to load

- Severity: major (phase 3).
- Where: `04-reports-and-check-ins.md` 6.3 lines 942, 967 and 969, 6.5 lines 1014 to 1022; `06-clubs.md` 8.7 line 1061.
- Problem: The stage 3 email gives the location name, the times and a link: "See where and when Alex launched: https://rowhether.com/o/..." (04 line 1018). The details a caller needs (boat, crew, direction, route note, the rower's phone, where they launched) are only on the status page, and that page "is the SPA (01's `not_found_handling` serves `index.html`), which calls `GET /api/outings/status/:token`" (line 942): the whole app shell and an API call, on whatever phone and connection the contact has. The page shows only coordinates, "Launch point: 42.9607, -72.5219." (line 967), although 06 asked 04 "to show the launch address next to the coordinates" (06 line 1061) and 04 was not changed. The page and the email both say "call 911 or the local emergency number" (lines 969 and 1020). A contact in another country or state cannot reach the launch's emergency service by dialing their own, and nothing says which number serves the launch.
- Fix: Put the facts in the email itself, as plain text: launch name and street address, boat and crew, direction and route note, back-by time with its zone, the rower's phone when shared, and the emergency number for the launch's country with the location's emergency info (06 8.7). Serve `/o/<token>` as a small Worker-rendered HTML page with no app shell, readable with JavaScript off. Word the call to action for the launch, not the reader: "Emergency services at Putney Landing: 911 (United States)." Add an optional "number for callers outside the area" (the local dispatch line) to 06's emergency info and show it here.

Applied: 04 6.5 (the stage 3 and 4 emails carry the facts as plain text: launch address, boat and crew, direction and route note, back-by time with its zone, the rower's phone when shared, and the emergency services for the launch with its country, for example "Emergency services at Putney Landing: 911 (United States)", plus a dispatch line for callers outside the area) and 6.3 (the status page is a small Worker-rendered page with plain form posts, readable with JavaScript off; the copy no longer says "the local emergency number"); 06 8.7 (an optional `dispatch` number and the status page and emails as places the block shows); 07 4.1 (`/o/*` is served by the Worker); 08 6 and 7.4 (`/o/*` in `run_worker_first`, the CSP).

#### P13. Emergency numbers can be typed in by whoever added the location, and the country table is unchecked

- Severity: major (phase 3).
- Where: `06-clubs.md` 8.7 lines 1035, 1050, 1052 and 1054; `01-locations.md` 2.1 line 85, 13.1 line 1246; `07-product-and-ux.md` 5.5 line 539; `08-architecture.md` 4.3 line 329.
- Problem: The emergency number is a stored, editable field, `"number": "911"` (06 line 1035), and the hospital and other phones are free text of up to 120 characters with no format check (line 1050). 06 says only steward clubs and moderators edit emergency info and others suggest (line 1054). In 01, though, `emergency` is just a field of the location record (01 line 85), and the creator may "Edit a `published` location directly" (01 line 1246). Steward clubs arrive in phase 5, while the column and the Safety section ship in phase 3, and curated records may carry it from phase 1 (08 line 329). In phases 3 and 4 the person who added a community location can therefore type any number as the emergency number or the hospital phone, and the page offers it as a `tel:` link (07 line 539). The country table behind the default number is "unverified; check before phase 7" (06 line 1052), but 07 uses it from phase 3: "The country's number comes from 06's default table." (07 line 539).
- Fix: Do not store `number`. Derive it from the location's country through a checked table, cite the source for each country, check it before phase 3, and refuse to publish a location in a country the table does not cover. Validate phone fields as E.164 before they become `tel:` links. Until a steward club exists, every change to emergency info is a suggestion a moderator approves, never a direct edit by the creator. Every emergency block shows "Last checked" or "Not checked yet".

Applied: 06 8.7 (no stored `number`: it comes from a checked country table in `src/emergency.js`, each row citing an official source and checked by a person before phase 3 ships; E.164 check on every phone field before it becomes a `tel:` link; until a steward club exists every change to emergency info is a suggestion a moderator approves; every block shows "Last checked ..." or "Not checked yet."), 01 2.1, 12.10 (refuse a location in a country the table does not cover) and 13.1; 07 5.5. The source check itself is a task before phase 3.

### Minors

#### P14. Deleting an account while out on the water is blocked in 03 and allowed in 04

- Severity: minor.
- Where: `03-accounts-and-privacy.md` 4.10 line 369, 16.6 line 1524; `04-reports-and-check-ins.md` 5.2 line 696, 6.4 line 989.
- Problem: 03 blocks the deletion: "A boat signed out and not back (phase 3) | \"You have a boat signed out. Sign it in first, so no one is alerted by mistake.\"" (03 line 369; 409 `open_outing`, line 1524). 04 lets it through: "The rower deletes their account while out: the outing is cancelled and contacts get the all clear first (03's deletion runs this before deleting)." (04 line 989). Following 04, someone who has taken over an account could send the contacts an all clear while the rower is still out. 03's copy also says "signed out" and "Sign it in" for a boat, words 04's Decision keeps for the account (line 696).
- Fix: Keep 03's blocker and change 04 6.4 to match. Reword 03's message in 04's words: "You are on the water since 6:42 AM. Tap I'm back first, so no one is alerted by mistake."

Applied: 04 6.4 (deleting an account while out is refused until the rower taps I'm back; deletion never sends an all clear), matching 03; 03 4.10 and 16.6 (the message now reads "You are on the water since 6:42 AM. Tap I'm back first, so no one is alerted by mistake.", in 04's words).

#### P15. Evening messages state Go as fact, while practice checks say "looks like"

- Severity: minor (phase 4).
- Where: `05-notifications.md` 3.3 lines 132 to 134, 3.4 line 166; `06-clubs.md` 12.2 lines 1306 and 1307; `03-accounts-and-privacy.md` 13.2 line 1044.
- Problem: The night-before message titles a forecast 10 or more hours ahead as a plain verdict: "Putney: Go tomorrow morning" (05 line 132), and the overnight update says "Putney update: now Go this morning" (line 166). The same kind of evening forecast for coaches is worded as a forecast: "tomorrow's 5:45 AM practice looks like Stay off" (06 line 1306). On a lock screen, without the app's facts or the footer, a bare "Go" reads as the permission the disclaimer says it is not ("They are information, not permission.", 03 13.2).
- Fix: Word every forecast notification as a forecast and end with a check: "Putney tomorrow morning looks like Go. ... Check again before you launch." Apply the same to the overnight update ("now looks like Go") and the Go window alert.

Applied: 05 3.2 (a copy rule: every forecast notification says "looks like", "likely" or "possible" and ends with "Check again before you launch."), 3.3, 3.4, 3.5, 3.8, the payload samples in 5.6 and 6.3, and 12 (a test); 07 3.4. 06 12.2 already words coach forecasts this way.

#### P16. The float plan notice leaves out the limits that matter most

- Severity: minor (phase 3).
- Where: `04-reports-and-check-ins.md` 6.6 lines 1038 and 1044; `05-notifications.md` 2.3 line 92.
- Problem: The one-time sheet says "We email your contacts if you are late. We do not watch the water, call anyone, or know where you are. Your phone needs signal for us to know you started. Tell someone your plan as well." (04 line 1038). It does not say that finishing also needs signal (P11), that contacts get email only, with no text message or call (05 2.3), so they may not see it for hours or may find it in spam, or that in phase 3 the rower's own reminders are email only ("ship float plans in phase 3 with email reminders to the rower", line 1044), which a rower on the water will not see.
- Fix: Add two sentences: "Tapping I'm back needs signal too. Your contacts get an email, not a call or a text, so make sure they know to look for it." In phase 3, add: "Reminders to you come by email until notifications arrive."

Applied: 04 6.6 (the one-time float plan sheet now says that tapping I'm back needs signal, that contacts get an email and not a call or a text, and, in phase 3 only, that reminders to the rower come by email until notifications arrive).

## 2. Safeguarding of minors

### Blockers

#### P17. Any adult a junior can be talked into linking gets lasting sight of where the junior rows, and the junior cannot end it

- Severity: blocker (phase 5).
- Where: `03-accounts-and-privacy.md` 11.5 lines 784, 789, 795, 796, 803 to 807, 820 and 824, 16.7 lines 1532 and 1536; `07-product-and-ux.md` 3.7 line 172, 3.8 line 184.
- Problem: A guardian link shows the adult the junior's "Outings and float plans (04), attendance and lineups (06)" (03 line 807), served by `GET /api/me/juniors/:userId/activity` with "Messages, outings, attendance, reports" (line 1536). Outings carry where and when the junior launches, the back-by time and the route note: a running picture of where a minor is. Anyone can become the guardian. The junior types any address (line 795), or any adult account shows a code and "The junior enters it" (line 796). The only check is "Guardians must be 18 or older." (line 1532), which rests on the birth year that adult typed. Once linked, "The junior cannot [end it], because MAAPP expects parents to be able to see." (line 820). Club joins also wait on this link's approval (line 789; 07 line 172). An adult who persuades a 15-year-old to enter a code gets lasting sight of where and when the junior rows and a say over their club memberships. The junior has no way to end it in the app: only a site admin can, if someone writes in (line 820), and the junior's "Get help" link lists national reporting lines (line 824). MAAPP, as 03 quotes it, is about open communication between adults and minors; it does not ask that an unconfirmed adult be able to follow a minor's location.
- Fix: Let the junior end a link, with a reason that goes to site admins and, when the junior is in a club, to its safety officer; the other side is told only that the link ended. Keep MAAPP's parent visibility for club communication through the club's own guardian record (06 `club_guardians`), which an admin confirms (P18). Do not show personal outings to account-level guardians by default; the junior shares a row on purpose ("Share this row with Pat"), and club outings stay visible through the club. Do not let an account under 7 days old become a guardian, and flag to admins an adult linked to juniors in several unrelated clubs.

Applied: 03 11.4 rule 12, 11.5 (a junior can end a link and give a reason that goes to site admins and the club's safety officer; guardians see club outings through the club and personal rows only when the junior shares one; guardian accounts must be 7 days old; admins are flagged when one adult links juniors in 3 or more clubs), 16.7 (new junior end route, activity route), the `guardian_links` SQL, tests and a Decision in 21; 04 5.2 (a "Show this row to my guardians" switch) and 5.7; 06 18.3 and 08 4.3, 4.4 (`end_reason`, `end_note`, `outings.share_guardians`, route `DELETE /api/me/guardians/:linkId`); 07 copy for the junior's signal line.

#### P18. A club guardian invite can be a reusable link, so anyone it reaches becomes a guardian of a named child

- Severity: blocker (phase 5).
- Where: `06-clubs.md` 4.2 line 342, 4.3 lines 351, 355 and 357, 4.5 line 389, 5.2 line 444, 5.3 line 468; `08-architecture.md` 4.4 `0009_clubs.sql`, `invites` lines 1100, 1103 and 1111.
- Problem: Coaches can make link and code invites "for member, junior and guardian presets" (06 line 351; matrix line 468), and an invite's preset can carry "`guardianOf` (a junior membership id)" (line 355). A link admits 50 people by default and up to 500 (line 351; 08 `max_uses BETWEEN 1 AND 500`), and tokens are "stored as they are (not hashed) so admins can share them again" (line 357). "A guardian joins by a guardian invite made for a specific junior (`guardianOf`)" (line 389), which is also how roster-only juniors, including under-13 learn-to-row athletes, get guardians (line 342). A guardian sees the junior's "practices, RSVPs (and can answer them), attendance, published lineups, the junior's rows on the board" (line 444) and gets the stage 2 overdue message. One forward of the link, or a post in a parents' group chat, lets any signed-in adult become a guardian of that child. 08 ties an email address only to personal invites (`CHECK (kind = 'personal' OR email IS NULL)`) and puts no limit on `guardianOf`.
- Fix: Allow `guardianOf` only on personal invites: single use, sent to one email address, valid 7 days, made by an admin or safety officer. Enforce it in the Worker and with a CHECK on `invites` (`kind = 'personal' OR json_extract(preset, '$.guardianOf') IS NULL`). A new guardian shows to staff as "waiting for an admin to confirm" until an admin confirms them, and the club's admins and the junior's other guardians are told when a guardian is added.

Applied: 06 4.3 and 4.5 (a guardian preset and `guardianOf` only on personal invites, single use, one email, 7 days, made by an admin or safety officer; new guardians wait for an admin to confirm), 06 18.1 SQL; 08 4.3 and 4.4 (the `invites` CHECK, `club_guardians.confirmed_by` and `confirmed_at`).

#### P19. An unverified club can enrol juniors, and one person with two accounts meets the "another adult" rule

- Severity: blocker (phase 5).
- Where: `06-clubs.md` 2.2 line 124, 3.2 line 197, 3.3 lines 243 and 267, 4.3 line 353, 4.5 line 388, 8.4 line 954; `03-accounts-and-privacy.md` 11.4 line 770.
- Problem: Any account at least 7 days old can create a club (06 line 197). Verification is meant to stop impersonation (line 124), but an unverified club is barred only from search, location pages, a public page and status, location claims, official hazards and more than 100 members: "Everything else works" (line 243; Decision line 267). So an unverified club can invite juniors and have a guardian approve them from a screen that reads "Sam wants to join Putney Rowing Club as a junior. Approve?" (line 388), with nothing saying the club is unverified. Its staff then see the juniors' rows on the board ("Admin, coach, safety officer | Everyone", line 954) and can send them club messages (water status notes from phase 5, announcements and practice notes from phase 6). The message safeguard is `audienceGuard()`: "Add a second coach or a safety officer to the club before messaging juniors. Messages to juniors must reach another adult." (03 line 770). An admin can give a staff role to any account by a personal invite (06 line 353), including a second account the same person made, so one person can meet the "another adult" rule alone. A lookalike junior program, or one adult posing as a coach, can then reach juniors through the channel clubs are told meets MAAPP.
- Fix: Juniors can join only verified clubs; until then, junior invites are refused with "This club must be verified before juniors can join." The guardian approval screen shows "Verified club" or "Not verified yet" and the club's website. `audienceGuard()` counts as another adult only a confirmed guardian (P18) or a staff member of a verified club who is not the sender, has held the role for at least 7 days, and whose account is at least 30 days old.

Applied: 06 3.3 and its Decisions (an unverified club cannot enrol juniors, by invite or roster; revoking verification pauses junior invites and messages), 4.5 (the guardian approval screen shows "Verified club" and the website); 03 11.4 rule 4 (`audienceGuard()` counts only a confirmed guardian, or staff of a verified club who are not the sender, held the role 7 days and have a 30 day old account).

### Majors

#### P20. The plan gives two answers to who can see a junior's outings and emergency contacts

- Severity: major (phase 5).
- Where: `03-accounts-and-privacy.md` 11.4 lines 776 and 778, 11.5 line 807, 16.7 line 1536; `06-clubs.md` 5.2 lines 444 and 447, 8.4 line 957; `04-reports-and-check-ins.md` 5.5 line 747.
- Problem: 03 says "A junior's outings and float plans are visible to their guardians and to their club's safety officers (04, 06)." (line 778) and that emergency contacts are "visible only to the club's safety officers during an overdue escalation" (line 776). 06 says the opposite for staff: "Staff never see a junior's personal data outside the club: the personal row log, float plan contacts, other clubs, or location history" (06 line 447). For guardians, 06 shows "Their junior's rows, with the coach's name, no crewmates" on the board (line 957) and the junior's club life (line 444), while 03's activity route returns all of the junior's "outings" (line 1536) and 03 11.5 lists "Outings and float plans (04)" (line 807). 04 gives club roles "that club's outings at its locations" only (04 line 747). A build that follows 03 shows safety officers a junior's personal float plans and contacts; one that follows 06 does not.
- Fix: One rule, written in 03 and copied into 04, 06 and the 08 routes. Suggested: staff see a junior's club outings only, never personal outings or contacts; guardians see club outings through the club and personal outings only when the junior shares them (P17); during a club overdue escalation, safety officers see the rower's emergency contacts only if the rower chose to share them with that club. Test that the guardian activity route and the board return the same set.

Applied: 03 11.4 (rule 12 states the one rule: staff see club outings only, guardians see club outings and rows the junior shares, both read `boardRow()` so the activity route and the board return the same set; rule 10: no club staff member sees emergency contacts, and staff reach a junior's family through the club's guardian record) and 20 (the test); 06 5.2 rules 4 and 7 and 8.4 (guardian row); 04 5.5. No "share contacts with the club" switch was added: 06's stricter reading holds and the guardian record covers juniors.

#### P21. The junior rules in 03 are missing where they act, in 01 and 04

- Severity: major (phase 3).
- Where: `03-accounts-and-privacy.md` 11.3 lines 743, 745 and 747; `04-reports-and-check-ins.md` 4.5 line 573; `01-locations.md` 12.1 line 1143, 13.3 line 1272; `07-product-and-ux.md` 5.5 line 535; `06-clubs.md` 5.2 line 446.
- Problem: 03 sets three junior rules for other docs to apply: no name shown publicly with "reports, hazards, location edits" (line 743); public free text "Held for review by a moderator before it shows" (line 745); and "Add a location | No; suggestions are held for review" (line 747). 04 makes a hazard note public on the screen's verdict alone: "The note is public only after a screen verdict of `ok`" (04 line 573). 01 lets any account 24 hours old add a location (01 line 1143), and names the author publicly in History, "By Sam R." (line 1272), and on the location, "Community added by Sam R." (07 line 535). 04 mentions juniors once (escalation defaults); 01, 02 and 05 never do. A junior's free text goes public on a model's judgement, and a junior's name can appear on public pages, which 03 and 06 ("Junior names never appear on public pages", 06 line 446) forbid.
- Fix: Write the junior rules into 01 and 04 where they act. Hazard notes and launch notes from juniors go to the moderation queue whatever the screen says. Juniors cannot create locations and see "Suggest a location" instead. History and the creator line show "A rower" for juniors. Add a test on each path that calls `isJunior()`.

Applied: 04 4.5 (a junior's hazard and launch notes always go to the moderation queue, whatever the screen says), 8.4 and 12; 01 12.1 (juniors cannot add a location: "Suggest a location" saves a draft for a moderator, 403 `junior`), 13.3 (History and the creator line say "a rower" for a junior) and 16.3 (a test on each `isJunior()` path); 07 5.5 (the creator line); 03 11.3 (table row).

### Minors

#### P22. Guardian phone sharing is on by default in 06 and off by default in 08

- Severity: minor (phase 5).
- Where: `06-clubs.md` 5.2 line 448; `08-architecture.md` 4.4 `0009_clubs.sql` line 1133; `03-accounts-and-privacy.md` 11.1 line 711.
- Problem: 06 says the guardian's "Share my phone with Putney Rowing Club staff for emergencies" is "on by default" (06 line 448). 08 creates `share_phone INTEGER NOT NULL DEFAULT 0` (line 1133). 03 adopts the ICO code's "high privacy by default" (line 711). Either answer is defensible, since staff may need a parent's number in an emergency, but the two docs disagree on a contact-data default.
- Fix: Pick one and write it in both. If it stays on by default, the join screen shows the box ticked with its reason, the privacy notice names it, and the column default is not relied on.

Applied: 06 5.2 rule 8 now says the guardian's phone sharing is off until ticked, with the box shown unticked and its reason on the join screen, and the legal review line in 06 follows. This matches 08 (`memberships.share_phone DEFAULT 0`) and 03 11.1 (high privacy by default), so no 08 change was needed.

#### P23. 06 can be read as letting the kiosk show juniors' names

- Severity: minor (phase 5).
- Where: `06-clubs.md` 5.2 line 446, 8.4 line 958, 8.5 line 975.
- Problem: Rule 6 reads "Junior names never appear on public pages. The kiosk shows first name and last initial." (line 446), which in a rule about junior names says the kiosk shows juniors as first name and last initial. 8.4 says the kiosk shows "Adults as first name and last initial; junior crews unnamed" (line 958), and 8.5 lists "junior names" among what a kiosk cannot see (line 975). A boathouse screen is seen by anyone who walks in.
- Fix: Reword rule 6: "Junior names never appear on public pages or on the kiosk, which shows adults as first name and last initial and junior crews unnamed."

Applied: 06 5.2 rule 6 reworded to the finding's text, so it agrees with 8.4 and 8.5.

## 3. Privacy

### Majors

#### P24. Precise coordinates go to the server for the "at the dock" check, against 03's rule

- Severity: major (phase 3).
- Where: `03-accounts-and-privacy.md` 12.1 line 871, 12.2 lines 875 and 876; `04-reports-and-check-ins.md` 3.4 lines 184 and 195, 3.9 line 447, 4.8 line 663, 3.10 line 469; `08-architecture.md` 4.4 `0005` line 728.
- Problem: 03 says: "If 04 wants proof someone is at the dock, the browser computes it and sends only a flag (`\"atDock\": true` when within 500 m of the location's dock point), not coordinates." (line 876), and rounds Near me before sending because "Rounding before the request keeps precise coordinates out of request logs" (line 875). 04 sends them: the dialog "sends `geo: { lat, lon, acc }`" (line 184), with a sample `"geo": { "lat": 42.96071, "lon": -72.52188, "acc": 18 }` (line 447), and hazard votes do the same (line 663). 04 keeps them out of D1 and logs (line 195), and 08 stores only the word (line 728), but the precise position of a person at a dock still leaves the phone on every report and vote, and sits in the offline outbox in `localStorage` until it sends (line 469). The browser already has the dock point from the location record, so the server gains nothing it could not get from a flag, which a client can fake just as easily as coordinates.
- Fix: Follow 03: compute `near`, `far` or `unknown` in the browser from the location record and send only that word, for reports and hazard votes. Change 04 3.4, 3.9 and 4.8 and the tests to match, and keep the "no coordinates in the body" test as a check that none are sent.

Applied: already handled by consistency finding C35 (04 3.4, 3.5, 3.9, 4.8 and the code map: the browser computes `near`, `far` or `unknown` with `geoWord(pos, loc)` and sends only the word, for reports and hazard votes; 03 12.2 points at it). What was left: 04 12 now checks that no request body or outbox entry carries `lat`, `lon` or `acc`. A hazard pin's own position is the hazard's location and stays, as the post sheet says.

#### P25. The list of third parties that receive data is incomplete

- Severity: major (phase 2 for the notice, phases 3 to 6 as each arrives).
- Where: `03-accounts-and-privacy.md` 12.5 lines 911 to 917, 13.3; `05-notifications.md` 2.1; `02-data-sources.md` Place search lines 638 to 642, Map tiles lines 648 to 654, Photon line 227; `01-locations.md` 12.3 line 1151; `04-reports-and-check-ins.md` 8.6; `06-clubs.md` 3.2, 7.4, 14.1.
- Problem: 03's table, which becomes the privacy notice's processor list, names Cloudflare, Resend, Anthropic (for suggestions, and "04 may use it to triage free-text reports"), GitHub and the data agencies (lines 911 to 917). The other docs send personal data to parties it does not list: Apple, Google, Mozilla and Microsoft push services receive each device's endpoint and the timing of every alert (05 2.1); OpenFreeMap receives map tile requests, and the add flow's map is "centered on the device position if permitted" (01 line 1151), so tile requests reveal where the person is; Photon (komoot) and Open-Meteo geocoding receive what people type into search (02 lines 227 and 638 to 642); Anthropic also screens hazard notes, launch notes, club descriptions and public water status notes (04 8.6, 06 3.2, 06 7.4), not only suggestions; and calendar services such as Google fetch the private calendar feed, which holds a junior's practice times, place and seat for a guardian (06 14.1).
- Fix: Add each party to 12.5 with what it receives and why, and to the privacy notice. Start the add flow's map from a search or a rounded position rather than the device's exact position, or say plainly that the tile service sees the area shown. Note in 06 14.1 that a calendar link is read by the calendar service the person subscribes with.

Applied: 03 12.5 (new rows: place search by Open-Meteo geocoding and Photon, OpenFreeMap tiles, the push services, calendar services; the Anthropic row now lists hazard and launch notes, club descriptions and public water status notes) and 13.3 (the notice lists every row); 01 12.3 (the add flow's map starts from a search or the last region, never the device's exact position, with the line "The map service sees the area you look at."); 06 14.1 (the calendar link says the calendar service sees the times).

#### P26. Incident records holding health details of minors have three different retention answers

- Severity: major (phase 5).
- Where: `03-accounts-and-privacy.md` 12.9 lines 987 and 1009; `06-clubs.md` 3.6 line 307, 9.1 lines 1093, 1101 and 1102, 9.3 lines 1140 and 1142, 16.3 line 1467.
- Problem: Incidents hold injuries ("Medical event, Hypothermia, Heat illness, Rowing injury, First aid, Drowning", line 1093), people involved with a "minor" flag (line 1101), and witnesses' phone or email (line 1102). 03 says deletion clears the user columns and the record is kept for a set period: "Keep `incidents` with names removed, for a retention period 06 sets with legal advice (suggest 7 years for incidents involving minors)." (03 line 1009). 06 says "Keep incident records, names included, until the club deletes them or the club is deleted" (06 line 1142), with "the names written in the record stay" after an account is deleted (line 1140), and keeps them "Until the club deletes them" (line 1467). And a club deletion deletes every incident with the club 14 days after any one admin asks (line 307), which can destroy a record about a minor that the club may need to keep. So health data about minors can be kept forever with names, or destroyed early, depending on which doc is built.
- Fix: One rule in 03 and 06, set with legal advice: a fixed retention period (03 suggests 7 years for incidents involving minors), names and health details kept only for that period, and incidents not deleted with the club before the period ends (hand the export to the club and keep the records sealed until then, readable only by site admins on a legal request). Name the incident log as health data in the privacy notice. Treat witness contact details as third-party data with the same period.

Applied: 06 9.3 (one retention rule: 7 years from the incident, then the whole record is deleted; names stay inside the period; witness contacts follow the same period; incidents are sealed, not deleted, when a club is deleted, and a site admin reads them only on a legal request with an audit row; the privacy notice names the incident log as health data), 3.6 (club deletion keeps incidents and the club tombstone while any remain), 16.3 and the open Decision; 03 12.1, 12.9, 13.3 and the Decision list. The period itself is for the lawyer: recorded as the Decision (recommendation first) and as a 13.5 review item.

### Minors

#### P27. 03 tells people their name shows with their reports; 04 never shows it

- Severity: minor (phase 2).
- Where: `03-accounts-and-privacy.md` 4.1 line 244, 11.3 lines 743 and 754, 12.1 line 859; `04-reports-and-check-ins.md` 3.6 line 274; `07-product-and-ux.md` 3.7 line 175.
- Problem: The sign-up name hint says "Shown with your reports and in your clubs." (03 line 244); 03 11.3 has adults' names "shown to the public with reports, hazards, location edits" (line 743), and a junior turning 18 is told "Your name now shows with your reports." (line 754). 03's own inventory says "reporter names are never shown, 04" (line 859), and 04 says "Reporter names are never shown. A signed-in reporter is not identified, only badged." (04 line 274). Names do show with location creation and edits (P21). People are told the wrong thing about where their name appears, and the doc a builder reads first (03) points the wrong way.
- Fix: State one rule in 03 11.3 and the sign-up hint: names show with locations you add or edit and in your clubs, never with reports or hazards. Change the age-up message to match ("Your name now shows with location edits.").

Applied: 03 4.1 (the name hint reads "Shown with locations you add or edit, and in your clubs."), 11.3 (the table row and the age-up message: names show with location edits and in clubs, never with reports or hazards); 07 3.7 step 5.

## 4. Abuse and moderation

### Majors

#### P28. Two brand-new accounts can clear a real hazard, and three flags can take it down

- Severity: major (phase 3).
- Where: `04-reports-and-check-ins.md` 4.2 line 521, 4.4 lines 547 to 554 and 566, 8.2 line 1086, 8.5 line 1113; `08-architecture.md` 4.4 `0006` line 773.
- Problem: "Clear (\"Gone\"): any signed-in user." A hazard becomes `cleared` when "two different users vote clear after the latest confirm" (lines 547 and 550). Account age limits only posting ("Accounts under 24 hours old: at most 2 hazards a day", line 521); votes are allowed to any account, 50 a day (line 1086). On clearing, the "Card disappears" (line 566), and the record is "visible only to moderators" (line 554). One person with two email addresses can make a submerged tree warning vanish for everyone, and a mistaken "Gone" from two passers-by does the same. Flags add a second path: "an item with flags from 3 different users whose accounts are at least 7 days old is hidden at once (`status = 'hidden'` ...)" (line 1113), but `hazards.status` has no `hidden` value in 08 (`'active', 'cleared', 'expired', 'removed'`, line 773), so a build must either fail the update or map it to `removed`, taking a live warning down on three flags.
- Fix: Count clear votes only from accounts at least 7 days old, and require either the poster, a moderator, a club safety role, or two clear votes with a `near` geolocation result. Keep a cleared hazard visible for 24 hours as "Reported gone by 2 people at 7:10 AM" before it drops off the list. Flags on a hazard hide only its note, never the pin, and send the pin to the queue. Say in 04 8.5 which column auto-hide sets for each target type.

Applied: 04 4.4 (a clear vote counts only from an account at least 7 days old with `geo` near the pin, unless it comes from the poster, a moderator or a club safety role; a cleared hazard stays listed for 24 hours as "Reported gone by 2 people at 7:10 AM" and a confirm reopens it), 8.5 (a table of what auto-hide sets per target type: a hazard pin is never hidden by flags, only its note, and the pin goes to the queue; `hazards.status` has no `hidden`), 4.8 and 12; 08 4 (a comment on `clears_since_confirm`). No schema change.

#### P29. One anonymous tap can undo a "launch closed" report, and a shared network can overwrite other people's reports

- Severity: major (phase 3).
- Where: `04-reports-and-check-ins.md` 3.3 lines 152, 154 and 158, 3.5 line 212, 3.6 lines 235 and 268.
- Problem: "`launch`: the newest report wins regardless of weight, because a closure is a fact someone just checked. A `closed` report shows in caution color until a newer `open` report or 12 hours." (line 235). A single signed-out "Open" tap, from anyone anywhere, removes "Launch reported closed or blocked at 6:10 AM." (line 268) from the screen. Separately, replacement is keyed on the reporter: "the newest row from the same `user_id` or `ip_hash` at this location with `created_at` in the last 10 minutes is updated instead of inserting" (line 212). `ip_hash` is a daily hash of the IP address (line 158), and a boathouse wifi or a mobile carrier's shared address puts different people behind one IP. A second person's "Flat water" then overwrites the first person's "launch closed" or "thick fog" row instead of adding one, and the daily cap of 20 a day per `ip_hash` (line 152) can lock a whole boathouse out.
- Fix: An `open` report clears a `closed` one only when it comes from a weight of 1.5 or more, or from two independent reporters; until then show both ("Reported closed at 6:10 AM, open at 6:20 AM."). Replace a signed-out report only when the same browser sent it (a random id kept in `localStorage`), not on `ip_hash` alone, and merge fields rather than overwrite them. Raise the daily cap for an `ip_hash` that many signed-in members also report from, or apply it to signed-out reports only.

Applied: 04 3.6 (a closed launch report stays until an open report from a reporter with weight 1.5 or more, or from two different reporters; until then the line shows both), 3.3 and 3.5 (a signed-out report is replaced only by the same browser, through `browser_hash`, a daily HMAC of a random id the browser keeps in `localStorage`; the update merges fields; the daily cap is per user or per `browser_hash`, with a backstop of 100 an `ip_hash` for signed-out reports only), 3.8, 3.9 (`browserId`; `mine` only for the signed-in author), 8.2, 8.9 and 12; 08 4 (`0005_reports_locations.sql`: `reports.browser_hash` and its index), 8 (the storage key) and 10 (the hash table); 03 12.1.

## 5. Accessibility where safety depends on it

### Minors

#### P30. Changes to the outing banner are not announced to screen readers

- Severity: minor (phase 3).
- Where: `07-product-and-ux.md` 11.3 line 1242, 11.4 lines 1249 and 1250, 12.3 lines 1326 and 1328.
- Problem: The banner changes from "On the water" to "You are 12 min past it. We email Jordan at 8:30 AM." and then to "Jordan was emailed at 8:30 AM. Tap I'm back to send the all clear." (07 lines 1249 and 1250). It is kept out of the hero's live region ("do not put the outing banner or notes inside it", line 1326) and given no role of its own, while the club water status banner has "`role=\"status\"` so a change during a visit is announced once" (line 1242) and the board announces overdue changes (line 1328). A screen reader user who has the app open hears nothing when their contacts are about to be emailed, or have been.
- Fix: Give the banner's state line `role="status"` and announce each stage change once, with the same words as the screen. Add it to the 07 13 browser checks.

Applied: 07 11.4 (the outing banner's state line has `role="status"` and each stage change is announced once, in the screen's words), 12.3 (the banner stays outside the hero live region) and 13 (a phase 3 browser check).

#### P31. The contacts' status page has no accessibility plan, and its one action depends on Turnstile loading

- Severity: minor (phase 3).
- Where: `04-reports-and-check-ins.md` 3.11 line 493, 6.3 line 977, 8.3 line 1096, 12 line 1333; `07-product-and-ux.md` 12.1.
- Problem: `/o/<token>` is read by people who are not users, often worried and on whatever phone they have. It is missing from 07's keyboard paths (12.1) and its only test is functional (04 line 1333). Its one action, "I reached Alex, they are safe", runs Turnstile (line 977; line 1096). When Turnstile cannot load, the report dialog has a fallback ("The spam check could not load. Sign in to send reports without it.", line 493), but a contact has no account to sign in with, and the plan gives no fallback for this page.
- Fix: Add the status page to 07 12 (heading order, the phone number as a real `tel:` link, large targets, no reliance on color for "overdue") and to the browser checks with a screen reader pass. When Turnstile fails, accept the safe mark with the contact's own token alone (P9) and rate limit it, rather than refusing it.

Applied: 07 12.1 (a keyboard and screen reader row for the status page: heading order, `tel:` link, targets at least 3rem, no color-only "overdue", `lang`, zoom, JavaScript off) and 13 (browser checks); 04 8.3 (when Turnstile cannot load, the safe mark is accepted on the contact's own token alone, rate limited), 12; 08 10.8.

## 6. Legal and liability

These are points for the owner to take to a lawyer. This review does not give legal advice.

### Majors

#### P32. The terms require a parent's permission for under-18s, but sign-up never asks for it

- Severity: major (phase 2).
- Where: `03-accounts-and-privacy.md` 4.1 line 251, 11.5 line 788, 13.1 line 1020.
- Problem: The terms outline says "Who can have an account: 13 or older. Under 18 with a parent's or guardian's permission." (03 line 1020). The product never collects that permission: a 13 to 17 year old gets "201, a junior account" straight away (line 251), and "A junior account does not need a guardian link to exist" (line 788). The terms would then state a condition the service knows it does not check, for exactly the users the plan treats most carefully.
- Fix: Ask the lawyer which is right for a free, general audience service with junior accounts: drop the permission sentence, or collect permission (for example through the guardian link) before some features. Make the terms and the sign-up flow say the same thing.

Owner: Should the terms require a parent's permission for 13 to 17 year olds, and if so how is it collected? Until the lawyer answers, 03 13.1 item 2 now says only what sign-up does (13 or older, junior protections, club joins need a guardian's approval). Decision added to 03 section 21 with that wording first, and item A added to the 13.5 review list before phase 2.

#### P33. The legal review in 03 13.5 leaves out the riskiest features

- Severity: major (phases 3 to 5).
- Where: `03-accounts-and-privacy.md` 11.1 line 713, 11.2 line 728, 11.5 line 824, 11.7 line 837, 13.1 lines 1025 and 1037, 13.5 line 1083; `04-reports-and-check-ins.md` 6.6 line 1042; `06-clubs.md` intro line 14, 9.3 line 1142.
- Problem: 13.5 plans review of "the terms, the privacy notice and the minors approach (11.2, 11.3, 11.5, 11.7)" (03 line 1083). Other docs depend on legal answers that this list does not cover, and some make claims a lawyer should see first:
  1. Float plans and overdue alerts: whether offering them creates a duty or reliance if they fail (P1, P3, P11). 04 says "03 owns the terms text this depends on" (04 line 1042).
  2. Limits, sources and emergency details entered by users and shown to others as the basis of Go, Caution or Stay off (P2, P13), and the open licence chosen for community location data (03 line 1037).
  3. Clubs: whether RoWhether acts for the club (processor) or on its own account for member records, roster-only juniors and incidents, and whether clubs need their own terms or a data processing agreement. 03 13.1 says only that "club admins are responsible for their club's rules, members and the information they enter about members" (line 1025).
  4. Data about people who never signed up: emergency contacts, crew names, incident witnesses and roster-only juniors, including under-13s (03 line 837 already asks for review of the last before phase 6).
  5. Health details in incident records, retention for records about minors, and keeping records when a club is deleted (P26).
  6. Email to people who are not users: emergency contact notices, guardian invites and club invites, under US commercial email law and Canada's anti-spam law, as contacts and guardians can be anywhere from phase 3.
  7. Statements that the app meets MAAPP: "Clubs using RoWhether must be able to say the app is such a platform" (03 line 713) and "US youth sport rules on adult and minor communication are met by design" (06 line 14), which clubs may rely on (see P17 to P19).
  8. What the owner must do on learning of possible abuse of a minor through a flag, a club, a guardian or help@ mail: 03 says "RoWhether does not judge safeguarding cases" (line 824), and the under-13 rule promises deletion "within 7 days" (line 728).
  9. Whether Vermont's Act 63 applies, and what changes if a paid tier is ever added (02's commercial section), since 03 rests "probably not a covered business" on having no revenue.
- Fix: Add these items to the 13.5 review list, with the phase each blocks: 1 and 2 before phase 3; 3 to 8 before phase 5; 9 before any paid feature. Keep the lawyer's answers in a short file next to the plan so the fix pass can point to them.

Applied: 03 13.5 (the review list now has every item: A for the parent permission sentence before phase 2; 1 and 2 before phase 3; 3 to 8 before phase 5; 9 before any paid feature; the lawyer's answers go in `docs/full-app/legal-answers.md`, a file to create when answers arrive).

### Minors

#### P34. The safety disclaimer does not say that checks can be missing or set by other users

- Severity: minor (phase 2).
- Where: `03-accounts-and-privacy.md` 13.2 lines 1044 to 1052.
- Problem: The draft says Go, Caution and Stay off "are what that data says against those limits" and that "Forecasts and gauges can be wrong or late" (line 1044 onward), and the footer short form is "Information only. You, your coach and your club decide. Look at the water before you launch." (line 1052). It does not say that some locations have no gauge or no official alerts, so those factors are not checked there (P5), or that at community-added locations the limits, course and emergency details come from other users and may not have been checked (P2, P13). Those are the two cases where the verdict carries the least behind it.
- Fix: Add to the disclaimer: "Not every location has every source. Where a factor is not checked, the page says so. At community-added locations, limits and details come from other rowers and may not have been checked." Add "Some locations have fewer checks." to the footer's short form where it applies.

Applied: 03 13.2 (the disclaimer says that not every location has every source, that unchecked factors are named on the page, and that limits and details at community-added locations come from other rowers and may not have been checked; the footer short form adds "Some locations have fewer checks." where it applies); 07 6.6 (the footer, unchanged for Putney).
