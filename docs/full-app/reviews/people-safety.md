# People and safety review

Reviewed `docs/full-app/01` to `08` (branch `dev-full-app` at 59bed34) from the side of the people who use the app: rowers on the water, juniors and their guardians, coaches and club safety officers, and people affected by what others post. Started 2026-10-18 10:05 UTC (`date -u`).

Status: in progress

Count so far: 6 blocker, 17 major, 6 minor (29 findings).

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

#### P2. Whoever adds a location sets the limits every visitor's verdict uses, with nothing to stop very loose ones

- Severity: blocker (phase 3).
- Where: `01-locations.md` 11.1 lines 1054 to 1058, 11.5 line 1111, 11.6 line 1125, 12.7 line 1215, 13.1 line 1246, 13.5 line 1291, 17 line 1638; `index.html` lines 118, 123 and 133 (today's input ranges); `07-product-and-ux.md` 4.3 line 282.
- Problem: Step 5 of the add flow says "These are the starting limits for everyone at this location" (01 line 1215), and they become the location's `thresholds`, applied to every viewer without personal values (01 line 1111). The creator can keep changing them: "Edit a `published` location directly | yes" for the creator (01 line 1246). The only bounds are "Validation as today" (01 line 1125), and today's fields accept a wind stay off line up to 60 mph, gusts up to 80 mph and a cold line as low as 0°F (`index.html` lines 118, 123, 133). Rain, flow and AQI may be left blank, which "turns the level off" (01 lines 1056 to 1058). A careless or malicious creator can publish a location that shows Go in a 40 mph wind over near-freezing water to every visitor who has not set their own limits. Community locations "go live as `published` ... with moderator review after the fact" (01 line 1638), and the only sign on the page is the "Community added" badge under the subtitle (07 line 282). "Limits reviewed" (01 line 1291) happens only when someone verifies the location.
- Fix: For locations that are not verified, refuse limits looser than the global defaults (wind 10 and 15 mph, gusts 18 and 25, cold line 100°F, rain 60 and 90%, AQI 151 and 201), and refuse blank levels except flow without history. Only a moderator or steward club can loosen them, through a reviewed revision. After publishing, edits to limits, bindings or the course on a published location go through suggestions, not direct edits by the creator. When a location's limits differ from the global defaults, the hero says so in its quiet line ("Limits here were set by the person who added this location.").

#### P10. The boathouse kiosk can set off another member's float plan, and mark another member's boat back

- Severity: blocker (phase 5).
- Where: `06-clubs.md` 8.2 line 898, 8.5 lines 975 and 977; `04-reports-and-check-ins.md` 5.1 line 692, 5.7 line 819, 5.8 line 859.
- Problem: At the kiosk, "Anyone at the boathouse can pick any adult name, as with a paper logbook" (06 line 977). For a picked member with an account, "their float plan default applies, with the line \"Sam's contacts will be emailed if Sam is late.\"" (line 977). A prank, or a tap on the wrong "Sam", sends overdue emails to Sam's family while Sam is at home, and Sam's own Start a row is then refused, because an account may have one active outing (04 lines 692 and 819; 409 `already_out`, line 859). Worse, the kiosk can "mark back rows it started or the picked member's" (06 line 975). Picking the wrong name and tapping Back ends a real outing, stops its escalation and sends the rower's contacts an all clear while the rower is still on the water. The plan answers misuse only after the fact ("a member who finds a row they did not start can delete it from their log", line 977). A paper logbook emails nobody, so the comparison stops holding once an entry drives alerts.
- Fix: A kiosk row started for someone else never arms that person's float plan; their contacts are emailed only after the member confirms the row on their own device. Every kiosk action on a member's row, start or back, sends that member a push at once with "Not you? Undo". The kiosk can mark back only rows started at that kiosk; a row started on a phone is marked back from that phone or by staff. The confirm step shows boat, start time and back-by time, so a wrong name is caught before it counts.

### Majors

#### P3. Nothing notices when the every-minute tick stops

- Severity: major (phase 3).
- Where: `05-notifications.md` 5.2 line 342, 5.8 lines 512 to 520; `04-reports-and-check-ins.md` 6.2 line 937.
- Problem: 04 promises "Worst-case lateness: one minute (cron period) plus delivery" (line 937). In the tick, "Failures are logged with the step name; one step failing never stops the others" (05 line 342). 5.8 has no row for a tick that throws on every run (a bad deploy, a migration that renames a column, a bug in `runOverdue`) or for cron triggers that stop firing. Logs are only seen when the owner reads them, and Workers Logs keep 3 to 7 days (03 12.1). Float plans would then do nothing, with no alert to the owner and no sign in the app.
- Fix: Add a heartbeat. Each tick writes its time and per-step result to one row. A separate check (a second Worker on its own cron, or an outside uptime monitor) alerts the owner when the heartbeat is more than 5 minutes old or `runOverdue` has failed 3 times in a row. While the heartbeat is stale, the Start a row sheet and the outing banner say "Late alerts are delayed right now. Tell someone your plan." Add the case to 5.8 and a test.

#### P4. Evening and morning messages built without river flow say nothing about it

- Severity: major (phase 4).
- Where: `05-notifications.md` 3.3 line 132, 5.3 lines 387 to 389; `01-locations.md` 15.7 line 1500.
- Problem: When the gauge fetch fails, the server model is "Built without flow rules, as the app does when the gauge fails. Nothing added to the copy." (05 line 388). The app does not do that: it keeps the last good value and names the failure under the hero (01 line 1500). The server has no last good value beyond its 10-minute cache, so flow simply drops out. On a river, high flow is a main Stay off reason, and gauges often fail during floods. The result can be "Putney: Go tomorrow morning" on the lock screen (05 line 132) with no hint that flow was not checked. Alerts get a sentence ("NWS alerts could not be checked.", line 387); flow and air quality get none (lines 388 and 389).
- Fix: Keep the last good flow reading server-side (in `source_cache`, with its time) and use it under the same `maxAgeH` rule as the app. When a bound slot that can raise the level is missing or too old, add a sentence ("River flow could not be checked.") and do not title the message Go; say which level the checked factors give and that flow was not checked. Test each failed slot.

#### P5. The hero shows the same Go when a key factor is not checked at all

- Severity: major (phase 1 for stale gauges, phase 3 for community locations).
- Where: `02-data-sources.md` Principles line 44, Graceful degradation lines 719, 724 and 726; `01-locations.md` 15.7 lines 1500 and 1501; `07-product-and-ux.md` 6.7 lines 788 and 790.
- Problem: For a slot with no binding, 02 says "Nothing in the hero. The relevant tab says what is missing and what to do." (line 719). A river location with no gauge, or a location with no official alerts feed, shows Go in the hero exactly as Putney does. The gap appears only in the Storms tab and in the Week view's River or Alerts row (02 lines 724 and 726; 07 line 790). A bound gauge whose last reading is over 24 hours old is "not used for Go, Caution or Stay off", with only a fact note (01 line 1501; 07 line 788), while a failed fetch is named under the hero (01 line 1500). 02's own principle is that a missing source "never reads as \"no concern\"" (line 44). A plain Go in the hero reads exactly that way to someone who never opens the tabs.
- Fix: Add one quiet line under the hero whenever a factor that could change the level is not checked here or for this hour: "Not checked here: river flow, official alerts." Use the same line for a stale bound gauge: "River flow not checked: the gauge has not reported for 2 days." Share text and the night-before message carry it too. Nothing changes for Putney while all its sources answer, so phase 0 stays identical.

#### P6. Stay off weather warnings wait out quiet hours, which overlap dawn rowing

- Severity: major (phase 4).
- Where: `05-notifications.md` 3.1 line 109, 4.1 line 237, 4.4 line 273, 13 line 1045; `03-accounts-and-privacy.md` 11.3 line 750.
- Problem: `nws_alert` is "Held" during quiet hours (05 line 109), and only "`overdue` and `water_status` closed ignore quiet hours" (05 line 273). Default quiet hours are "10 PM to 6 AM" (05 line 237). At Putney, civil dawn is 4:37 AM on June 21 and 4:55 AM on May 15 (computed with SunCalc 1.9.0 from the repo's `node_modules`, 2026-10-18), so the first rowing hour of the summer falls inside default quiet hours. A Severe Thunderstorm Warning issued at 5:10 AM would reach a rower on the water at 6 AM. 03 says the opposite: "Safety notifications (water closed, overdue boat, severe alert) | Always | Always" (03 line 750).
- Fix: Treat Stay off level NWS alerts as safety: never held, like `overdue` and water closed. Hold only Caution level alerts. Change 05 3.1, 4.4 and the Decision at line 1045 to match 03, and add a test with a warning issued at 5:10 AM.

#### P7. Flow limits are bare numbers that silently stop working when the gauge or its unit changes

- Severity: major (phase 3).
- Where: `01-locations.md` 11.1 line 1058, 11.5 line 1117, 12.5 line 1192, 13.2 line 1266, 15.6 line 1493, 15.7 line 1502; `03-accounts-and-privacy.md` 9.1 line 594; `06-clubs.md` 6.2 line 549.
- Problem: Flow limits are in "the flow binding's unit (cfs, m³/s, ft, m)" and are "compared without conversion" (01 lines 1058 and 1493). A stage gauge means "Limits will be in feet" (01 line 1192). The gauge can change: a retired gauge prompts "Pick a new one for Putney Landing" (01 line 1502), and edits replace sources "as a whole list" (01 line 1266). Location defaults, club rules (06 line 549) and each person's synced `flowCaution` and `flowOff` (03 line 594) are stored as numbers with no unit or gauge. After a switch from a cfs gauge to a stage gauge, a personal limit of 20,000 is compared with readings near 8 ft and never triggers. After a switch to another cfs gauge on a bigger or smaller reach, the old numbers mean something else. Nothing in 01, 03 or 06 clears or re-checks these values.
- Fix: Store the binding id (or the gauge id and unit) with every flow, stage and tide limit: location thresholds, club rules and `user_settings`. When the primary binding changes, stop applying limits set for the old one, recompute location defaults from the new gauge's history, and say so in Settings and How this works ("Your flow limits were for the North Walpole gauge. Set them again for this gauge."). Tell club safety officers when a club rule is affected.

#### P8. A contact who opts out, or whose address bounces, leaves the rower thinking the float plan is set

- Severity: major (phase 3).
- Where: `04-reports-and-check-ins.md` 5.2 lines 711 and 714, 6.1 line 891, 6.2 line 926, 6.4 line 990.
- Problem: A contact can opt out from the stop link in the notice email or in any overdue email (04 line 891), and stage 3 then goes only to "Contacts not opted out" (line 926). Nothing tells the rower when a contact opts out. The Start a row switch is "On when contacts exist" (line 711), and the footer says "At 8:30 AM we email Jordan and Casey." (line 714) whether or not Jordan has opted out. A bounce is shown "in the banner and in Account" (line 990), but the banner exists only during an outing, when the rower may be the one in trouble. A rower whose only contact opted out has no float plan and is told they have one.
- Fix: Tell the rower at once, in the app and by email, when a contact opts out or an address bounces. The Start a row sheet names only contacts who can be reached, says plainly when none can ("Jordan asked not to get these emails. Nobody will be told if you are late."), and turns the switch off in that case. A contact counts as reachable only after the notice email was accepted.

#### P9. Anyone holding the status link can stop the escalation with a typed name

- Severity: major (phase 3).
- Where: `04-reports-and-check-ins.md` 5.8 line 854, 6.3 lines 942, 975, 977 and 979, 6.5 line 1022, 8.1 line 1074.
- Problem: One token per outing is shared by every contact and also returned to the rower at the start (`statusUrl`, line 854; token rules line 942). "I reached Alex, they are safe" asks only for "the contact's name and an optional note (120 chars), runs Turnstile, sets `safe_by = 'contact'`, stops the escalation and tells the other contacts and the rower" (line 977). The name is typed, not known. Anyone with the link (a forwarded email, a shared family inbox, someone the rower showed it to) can end the escalation, and the other contacts then read "Jordan reached Alex at 8:44 AM. No more emails will be sent." (line 975). The overdue email names the other contacts ("Also told: Casey.", line 1022), so one mistaken or false mark stops the people who would otherwise act.
- Fix: Give each contact their own token for the same status data, and record the safe mark against that contact's stored name, not a typed one. Ask for one confirmation ("You have spoken to Alex or seen Alex since 8:00 AM?"). Tell the other contacts who marked it and when, and let them restart the escalation ("I am still worried"). Keep the rower's token separate from the contacts'.

#### P11. A row started or finished without signal is sent only while the app is open, and the copy does not say so

- Severity: major (phase 3).
- Where: `04-reports-and-check-ins.md` 3.10 line 469, 5.6 lines 754, 757 and 759; `07-product-and-ux.md` 3.4 line 143.
- Problem: The outbox is "Flushed in order on `online`, on `visibilitychange` to visible, on startup, and every 30 s while visible and non-empty" (04 line 469). Every trigger needs the page to be open; the plan names no way to send while the app is closed or the phone is locked. The offline banner says "Not sent yet. No signal. Your contacts will not be told if you are late until this sends." (line 754; 07 line 143), which reads as if it will send by itself once there is signal. A sculler who starts offline, locks the phone and rows into signal is still not covered, and does not know it. The reverse case is not covered at all: an "I'm back" queued on a dock with no signal (line 757) leaves the outing open, so contacts are emailed at T + 30 while the rower drives home; the plan handles only the late arrival of that message (line 759) and shows the rower no warning.
- Fix: Change the copy to what is true: "Not sent yet. It sends when RoWhether is open and has signal. Until then, nobody will be told if you are late." Add the same line after a queued "I'm back": "Not sent yet. Open RoWhether when you have signal, or Jordan will be emailed at 8:30 AM." Let a rower set the float plan before leaving home (a planned start time, armed then unless cancelled), so the dock's signal does not decide whether anyone is told. Cover both cases in the Playwright offline check.

#### P12. The overdue email leaves out what a caller needs, and the status page needs the whole app to load

- Severity: major (phase 3).
- Where: `04-reports-and-check-ins.md` 6.3 lines 942, 967 and 969, 6.5 lines 1014 to 1022; `06-clubs.md` 8.7 line 1061.
- Problem: The stage 3 email gives the location name, the times and a link: "See where and when Alex launched: https://rowhether.com/o/..." (04 line 1018). The details a caller needs (boat, crew, direction, route note, the rower's phone, where they launched) are only on the status page, and that page "is the SPA (01's `not_found_handling` serves `index.html`), which calls `GET /api/outings/status/:token`" (line 942): the whole app shell and an API call, on whatever phone and connection the contact has. The page shows only coordinates, "Launch point: 42.9607, -72.5219." (line 967), although 06 asked 04 "to show the launch address next to the coordinates" (06 line 1061) and 04 was not changed. The page and the email both say "call 911 or the local emergency number" (lines 969 and 1020). A contact in another country or state cannot reach the launch's emergency service by dialing their own, and nothing says which number serves the launch.
- Fix: Put the facts in the email itself, as plain text: launch name and street address, boat and crew, direction and route note, back-by time with its zone, the rower's phone when shared, and the emergency number for the launch's country with the location's emergency info (06 8.7). Serve `/o/<token>` as a small Worker-rendered HTML page with no app shell, readable with JavaScript off. Word the call to action for the launch, not the reader: "Emergency services at Putney Landing: 911 (United States)." Add an optional "number for callers outside the area" (the local dispatch line) to 06's emergency info and show it here.

#### P13. Emergency numbers can be typed in by whoever added the location, and the country table is unchecked

- Severity: major (phase 3).
- Where: `06-clubs.md` 8.7 lines 1035, 1050, 1052 and 1054; `01-locations.md` 2.1 line 85, 13.1 line 1246; `07-product-and-ux.md` 5.5 line 539; `08-architecture.md` 4.3 line 329.
- Problem: The emergency number is a stored, editable field, `"number": "911"` (06 line 1035), and the hospital and other phones are free text of up to 120 characters with no format check (line 1050). 06 says only steward clubs and moderators edit emergency info and others suggest (line 1054). In 01, though, `emergency` is just a field of the location record (01 line 85), and the creator may "Edit a `published` location directly" (01 line 1246). Steward clubs arrive in phase 5, while the column and the Safety section ship in phase 3, and curated records may carry it from phase 1 (08 line 329). In phases 3 and 4 the person who added a community location can therefore type any number as the emergency number or the hospital phone, and the page offers it as a `tel:` link (07 line 539). The country table behind the default number is "unverified; check before phase 7" (06 line 1052), but 07 uses it from phase 3: "The country's number comes from 06's default table." (07 line 539).
- Fix: Do not store `number`. Derive it from the location's country through a checked table, cite the source for each country, check it before phase 3, and refuse to publish a location in a country the table does not cover. Validate phone fields as E.164 before they become `tel:` links. Until a steward club exists, every change to emergency info is a suggestion a moderator approves, never a direct edit by the creator. Every emergency block shows "Last checked" or "Not checked yet".

### Minors

#### P14. Deleting an account while out on the water is blocked in 03 and allowed in 04

- Severity: minor.
- Where: `03-accounts-and-privacy.md` 4.10 line 369, 16.6 line 1524; `04-reports-and-check-ins.md` 5.2 line 696, 6.4 line 989.
- Problem: 03 blocks the deletion: "A boat signed out and not back (phase 3) | \"You have a boat signed out. Sign it in first, so no one is alerted by mistake.\"" (03 line 369; 409 `open_outing`, line 1524). 04 lets it through: "The rower deletes their account while out: the outing is cancelled and contacts get the all clear first (03's deletion runs this before deleting)." (04 line 989). Following 04, someone who has taken over an account could send the contacts an all clear while the rower is still out. 03's copy also says "signed out" and "Sign it in" for a boat, words 04's Decision keeps for the account (line 696).
- Fix: Keep 03's blocker and change 04 6.4 to match. Reword 03's message in 04's words: "You are on the water since 6:42 AM. Tap I'm back first, so no one is alerted by mistake."

#### P15. Evening messages state Go as fact, while practice checks say "looks like"

- Severity: minor (phase 4).
- Where: `05-notifications.md` 3.3 lines 132 to 134, 3.4 line 166; `06-clubs.md` 12.2 lines 1306 and 1307; `03-accounts-and-privacy.md` 13.2 line 1044.
- Problem: The night-before message titles a forecast 10 or more hours ahead as a plain verdict: "Putney: Go tomorrow morning" (05 line 132), and the overnight update says "Putney update: now Go this morning" (line 166). The same kind of evening forecast for coaches is worded as a forecast: "tomorrow's 5:45 AM practice looks like Stay off" (06 line 1306). On a lock screen, without the app's facts or the footer, a bare "Go" reads as the permission the disclaimer says it is not ("They are information, not permission.", 03 13.2).
- Fix: Word every forecast notification as a forecast and end with a check: "Putney tomorrow morning looks like Go. ... Check again before you launch." Apply the same to the overnight update ("now looks like Go") and the Go window alert.

#### P16. The float plan notice leaves out the limits that matter most

- Severity: minor (phase 3).
- Where: `04-reports-and-check-ins.md` 6.6 lines 1038 and 1044; `05-notifications.md` 2.3 line 92.
- Problem: The one-time sheet says "We email your contacts if you are late. We do not watch the water, call anyone, or know where you are. Your phone needs signal for us to know you started. Tell someone your plan as well." (04 line 1038). It does not say that finishing also needs signal (P11), that contacts get email only, with no text message or call (05 2.3), so they may not see it for hours or may find it in spam, or that in phase 3 the rower's own reminders are email only ("ship float plans in phase 3 with email reminders to the rower", line 1044), which a rower on the water will not see.
- Fix: Add two sentences: "Tapping I'm back needs signal too. Your contacts get an email, not a call or a text, so make sure they know to look for it." In phase 3, add: "Reminders to you come by email until notifications arrive."

## 2. Safeguarding of minors

### Blockers

#### P17. Any adult a junior can be talked into linking gets lasting sight of where the junior rows, and the junior cannot end it

- Severity: blocker (phase 5).
- Where: `03-accounts-and-privacy.md` 11.5 lines 784, 789, 795, 796, 803 to 807, 820 and 824, 16.7 lines 1532 and 1536; `07-product-and-ux.md` 3.7 line 172, 3.8 line 184.
- Problem: A guardian link shows the adult the junior's "Outings and float plans (04), attendance and lineups (06)" (03 line 807), served by `GET /api/me/juniors/:userId/activity` with "Messages, outings, attendance, reports" (line 1536). Outings carry where and when the junior launches, the back-by time and the route note: a running picture of where a minor is. Anyone can become the guardian. The junior types any address (line 795), or any adult account shows a code and "The junior enters it" (line 796). The only check is "Guardians must be 18 or older." (line 1532), which rests on the birth year that adult typed. Once linked, "The junior cannot [end it], because MAAPP expects parents to be able to see." (line 820). Club joins also wait on this link's approval (line 789; 07 line 172). An adult who persuades a 15-year-old to enter a code gets lasting sight of where and when the junior rows and a say over their club memberships, and the junior's only way out is the "Get help" page of national reporting lines (line 824). MAAPP, as 03 quotes it, is about open communication between adults and minors; it does not ask that an unconfirmed adult be able to follow a minor's location.
- Fix: Let the junior end a link, with a reason that goes to site admins and, when the junior is in a club, to its safety officer; the other side is told only that the link ended. Keep MAAPP's parent visibility for club communication through the club's own guardian record (06 `club_guardians`), which an admin confirms (P18). Do not show personal outings to account-level guardians by default; the junior shares a row on purpose ("Share this row with Pat"), and club outings stay visible through the club. Do not let an account under 7 days old become a guardian, and flag to admins an adult linked to juniors in several unrelated clubs.

#### P18. A club guardian invite can be a reusable link, so anyone it reaches becomes a guardian of a named child

- Severity: blocker (phase 5).
- Where: `06-clubs.md` 4.2 line 342, 4.3 lines 351, 355 and 357, 4.5 line 389, 5.2 line 444, 5.3 line 468; `08-architecture.md` 4.4 `0009_clubs.sql`, `invites` lines 1100, 1103 and 1111.
- Problem: Coaches can make link and code invites "for member, junior and guardian presets" (06 line 351; matrix line 468), and an invite's preset can carry "`guardianOf` (a junior membership id)" (line 355). A link admits 50 people by default and up to 500 (line 351; 08 `max_uses BETWEEN 1 AND 500`), and tokens are "stored as they are (not hashed) so admins can share them again" (line 357). "A guardian joins by a guardian invite made for a specific junior (`guardianOf`)" (line 389), which is also how roster-only juniors, including under-13 learn-to-row athletes, get guardians (line 342). A guardian sees the junior's "practices, RSVPs (and can answer them), attendance, published lineups, the junior's rows on the board" (line 444) and gets the stage 2 overdue message. One forward of the link, or a post in a parents' group chat, lets any signed-in adult become a guardian of that child. 08 ties an email address only to personal invites (`CHECK (kind = 'personal' OR email IS NULL)`) and puts no limit on `guardianOf`.
- Fix: Allow `guardianOf` only on personal invites: single use, sent to one email address, valid 7 days, made by an admin or safety officer. Enforce it in the Worker and with a CHECK on `invites` (`kind = 'personal' OR json_extract(preset, '$.guardianOf') IS NULL`). A new guardian shows to staff as "waiting for an admin to confirm" until an admin confirms them, and the club's admins and the junior's other guardians are told when a guardian is added.

#### P19. An unverified club can enrol juniors, and one person with two accounts meets the "another adult" rule

- Severity: blocker (phase 5).
- Where: `06-clubs.md` 2.2 line 124, 3.2 line 197, 3.3 lines 243 and 267, 4.3 line 353, 4.5 line 388, 8.4 line 954; `03-accounts-and-privacy.md` 11.4 line 770.
- Problem: Any account at least 7 days old can create a club (06 line 197). Verification is meant to stop impersonation (line 124), but an unverified club is barred only from search, location pages, a public page and status, location claims, official hazards and more than 100 members: "Everything else works" (line 243; Decision line 267). So an unverified club can invite juniors and have a guardian approve them from a screen that reads "Sam wants to join Putney Rowing Club as a junior. Approve?" (line 388), with nothing saying the club is unverified. Its staff then see the juniors' rows on the board ("Admin, coach, safety officer | Everyone", line 954) and can broadcast to them. The message safeguard is `audienceGuard()`: "Add a second coach or a safety officer to the club before messaging juniors. Messages to juniors must reach another adult." (03 line 770). An admin can give a staff role to any account by a personal invite (06 line 353), including a second account the same person made, so one person can meet the "another adult" rule alone. A lookalike junior program, or one adult posing as a coach, can then reach juniors through the channel clubs are told meets MAAPP.
- Fix: Juniors can join only verified clubs; until then, junior invites are refused with "This club must be verified before juniors can join." The guardian approval screen shows "Verified club" or "Not verified yet" and the club's website. `audienceGuard()` counts as another adult only a confirmed guardian (P18) or a staff member of a verified club who is not the sender, has held the role for at least 7 days, and whose account is at least 30 days old.

### Majors

#### P20. The plan gives two answers to who can see a junior's outings and emergency contacts

- Severity: major (phase 5).
- Where: `03-accounts-and-privacy.md` 11.4 lines 776 and 778, 11.5 line 807, 16.7 line 1536; `06-clubs.md` 5.2 lines 444 and 447, 8.4 line 957; `04-reports-and-check-ins.md` 5.5 line 747.
- Problem: 03 says "A junior's outings and float plans are visible to their guardians and to their club's safety officers (04, 06)." (line 778) and that emergency contacts are "visible only to the club's safety officers during an overdue escalation" (line 776). 06 says the opposite for staff: "Staff never see a junior's personal data outside the club: the personal row log, float plan contacts, other clubs, or location history" (06 line 447). For guardians, 06 shows "Their junior's rows, with the coach's name, no crewmates" on the board (line 957) and the junior's club life (line 444), while 03's activity route returns all of the junior's "outings" (line 1536) and 03 11.5 lists "Outings and float plans (04)" (line 807). 04 gives club roles "that club's outings at its locations" only (04 line 747). A build that follows 03 shows safety officers a junior's personal float plans and contacts; one that follows 06 does not.
- Fix: One rule, written in 03 and copied into 04, 06 and the 08 routes. Suggested: staff see a junior's club outings only, never personal outings or contacts; guardians see club outings through the club and personal outings only when the junior shares them (P17); during a club overdue escalation, safety officers see the rower's emergency contacts only if the rower chose to share them with that club. Test that the guardian activity route and the board return the same set.

#### P21. The junior rules in 03 are missing where they act, in 01 and 04

- Severity: major (phase 3).
- Where: `03-accounts-and-privacy.md` 11.3 lines 743, 745 and 747; `04-reports-and-check-ins.md` 4.5 line 573; `01-locations.md` 12.1 line 1143, 13.3 line 1272; `07-product-and-ux.md` 5.5 line 535; `06-clubs.md` 5.2 line 446.
- Problem: 03 sets three junior rules for other docs to apply: no name shown publicly with "reports, hazards, location edits" (line 743); public free text "Held for review by a moderator before it shows" (line 745); and "Add a location | No; suggestions are held for review" (line 747). 04 makes a hazard note public on the screen's verdict alone: "The note is public only after a screen verdict of `ok`" (04 line 573). 01 lets any account 24 hours old add a location (01 line 1143), and names the author publicly in History, "By Sam R." (line 1272), and on the location, "Community added by Sam R." (07 line 535). 04 mentions juniors once (escalation defaults); 01, 02 and 05 never do. A junior's free text goes public on a model's judgement, and a junior's name can appear on public pages, which 03 and 06 ("Junior names never appear on public pages", 06 line 446) forbid.
- Fix: Write the junior rules into 01 and 04 where they act. Hazard notes and launch notes from juniors go to the moderation queue whatever the screen says. Juniors cannot create locations and see "Suggest a location" instead. History and the creator line show "A rower" for juniors. Add a test on each path that calls `isJunior()`.

### Minors

#### P22. Guardian phone sharing is on by default in 06 and off by default in 08

- Severity: minor (phase 5).
- Where: `06-clubs.md` 5.2 line 448; `08-architecture.md` 4.4 `0009_clubs.sql` line 1133; `03-accounts-and-privacy.md` 11.1 line 711.
- Problem: 06 says the guardian's "Share my phone with Putney Rowing Club staff for emergencies" is "on by default" (06 line 448). 08 creates `share_phone INTEGER NOT NULL DEFAULT 0` (line 1133). 03 adopts the ICO code's "high privacy by default" (line 711). Either answer is defensible, since staff may need a parent's number in an emergency, but the two docs disagree on a contact-data default.
- Fix: Pick one and write it in both. If it stays on by default, the join screen shows the box ticked with its reason, the privacy notice names it, and the column default is not relied on.

#### P23. 06 can be read as letting the kiosk show juniors' names

- Severity: minor (phase 5).
- Where: `06-clubs.md` 5.2 line 446, 8.4 line 958, 8.5 line 975.
- Problem: Rule 6 reads "Junior names never appear on public pages. The kiosk shows first name and last initial." (line 446), which in a rule about junior names says the kiosk shows juniors as first name and last initial. 8.4 says the kiosk shows "Adults as first name and last initial; junior crews unnamed" (line 958), and 8.5 lists "junior names" among what a kiosk cannot see (line 975). A boathouse screen is seen by anyone who walks in.
- Fix: Reword rule 6: "Junior names never appear on public pages or on the kiosk, which shows adults as first name and last initial and junior crews unnamed."

## 3. Privacy

### Majors

#### P24. Precise coordinates go to the server for the "at the dock" check, against 03's rule

- Severity: major (phase 3).
- Where: `03-accounts-and-privacy.md` 12.1 line 871, 12.2 lines 875 and 876; `04-reports-and-check-ins.md` 3.4 lines 184 and 195, 3.9 line 447, 4.8 line 663, 3.10 line 469; `08-architecture.md` 4.4 `0005` line 728.
- Problem: 03 says: "If 04 wants proof someone is at the dock, the browser computes it and sends only a flag (`\"atDock\": true` when within 500 m of the location's dock point), not coordinates." (line 876), and rounds Near me before sending because "Rounding before the request keeps precise coordinates out of request logs" (line 875). 04 sends them: the dialog "sends `geo: { lat, lon, acc }`" (line 184), with a sample `"geo": { "lat": 42.96071, "lon": -72.52188, "acc": 18 }` (line 447), and hazard votes do the same (line 663). 04 keeps them out of D1 and logs (line 195), and 08 stores only the word (line 728), but the precise position of a person at a dock still leaves the phone on every report and vote, and sits in the offline outbox in `localStorage` until it sends (line 469). The browser already has the dock point from the location record, so the server gains nothing it could not get from a flag, which a client can fake just as easily as coordinates.
- Fix: Follow 03: compute `near`, `far` or `unknown` in the browser from the location record and send only that word, for reports and hazard votes. Change 04 3.4, 3.9 and 4.8 and the tests to match, and keep the "no coordinates in the body" test as a check that none are sent.

#### P25. The list of third parties that receive data is incomplete

- Severity: major (phase 2 for the notice, phases 3 to 6 as each arrives).
- Where: `03-accounts-and-privacy.md` 12.5 lines 911 to 917, 13.3; `05-notifications.md` 2.1; `02-data-sources.md` Place search lines 638 to 642, Map tiles lines 648 to 654, Photon line 227; `01-locations.md` 12.3 line 1151; `04-reports-and-check-ins.md` 8.6; `06-clubs.md` 3.2, 7.4, 14.1.
- Problem: 03's table, which becomes the privacy notice's processor list, names Cloudflare, Resend, Anthropic (for suggestions, and "04 may use it to triage free-text reports"), GitHub and the data agencies (lines 911 to 917). The other docs send personal data to parties it does not list: Apple, Google, Mozilla and Microsoft push services receive each device's endpoint and the timing of every alert (05 2.1); OpenFreeMap receives map tile requests, and the add flow's map is "centered on the device position if permitted" (01 line 1151), so tile requests reveal where the person is; Photon (komoot) and Open-Meteo geocoding receive what people type into search (02 lines 227 and 638 to 642); Anthropic also screens hazard notes, launch notes, club descriptions and public water status notes (04 8.6, 06 3.2, 06 7.4), not only suggestions; and calendar services such as Google fetch the private calendar feed, which holds a junior's practice times, place and seat for a guardian (06 14.1).
- Fix: Add each party to 12.5 with what it receives and why, and to the privacy notice. Start the add flow's map from a search or a rounded position rather than the device's exact position, or say plainly that the tile service sees the area shown. Note in 06 14.1 that a calendar link is read by the calendar service the person subscribes with.

#### P26. Incident records holding health details of minors have three different retention answers

- Severity: major (phase 5).
- Where: `03-accounts-and-privacy.md` 12.9 lines 987 and 1009; `06-clubs.md` 3.6 line 307, 9.1 lines 1093, 1101 and 1102, 9.3 lines 1140 and 1142, 16.3 line 1467.
- Problem: Incidents hold injuries ("Medical event, Hypothermia, Heat illness, Rowing injury, First aid, Drowning", line 1093), people involved with a "minor" flag (line 1101), and witnesses' phone or email (line 1102). 03 says deletion clears the user columns and the record is kept for a set period: "Keep `incidents` with names removed, for a retention period 06 sets with legal advice (suggest 7 years for incidents involving minors)." (03 line 1009). 06 says "Keep incident records, names included, until the club deletes them or the club is deleted" (06 line 1142), with "the names written in the record stay" after an account is deleted (line 1140), and keeps them "Until the club deletes them" (line 1467). And a club deletion deletes every incident with the club 14 days after any one admin asks (line 307), which can destroy a record about a minor that the club may need to keep. So health data about minors can be kept forever with names, or destroyed early, depending on which doc is built.
- Fix: One rule in 03 and 06, set with legal advice: a fixed retention period (03 suggests 7 years for incidents involving minors), names and health details kept only for that period, and incidents not deleted with the club before the period ends (hand the export to the club and keep the records sealed until then, readable only by site admins on a legal request). Name the incident log as health data in the privacy notice. Treat witness contact details as third-party data with the same period.

### Minors

#### P27. 03 tells people their name shows with their reports; 04 never shows it

- Severity: minor (phase 2).
- Where: `03-accounts-and-privacy.md` 4.1 line 244, 11.3 lines 743 and 754, 12.1 line 859; `04-reports-and-check-ins.md` 3.6 line 274; `07-product-and-ux.md` 3.7 line 175.
- Problem: The sign-up name hint says "Shown with your reports and in your clubs." (03 line 244); 03 11.3 has adults' names "shown to the public with reports, hazards, location edits" (line 743), and a junior turning 18 is told "Your name now shows with your reports." (line 754). 03's own inventory says "reporter names are never shown, 04" (line 859), and 04 says "Reporter names are never shown. A signed-in reporter is not identified, only badged." (04 line 274). Names do show with location creation and edits (P21). People are told the wrong thing about where their name appears, and the doc a builder reads first (03) points the wrong way.
- Fix: State one rule in 03 11.3 and the sign-up hint: names show with locations you add or edit and in your clubs, never with reports or hazards. Change the age-up message to match ("Your name now shows with location edits.").

## 4. Abuse and moderation

### Majors

#### P28. Two brand-new accounts can clear a real hazard, and three flags can take it down

- Severity: major (phase 3).
- Where: `04-reports-and-check-ins.md` 4.2 line 521, 4.4 lines 547 to 554 and 566, 8.2 line 1086, 8.5 line 1113; `08-architecture.md` 4.4 `0006` line 773.
- Problem: "Clear (\"Gone\"): any signed-in user." A hazard becomes `cleared` when "two different users vote clear after the latest confirm" (lines 547 and 550). Account age limits only posting ("Accounts under 24 hours old: at most 2 hazards a day", line 521); votes are allowed to any account, 50 a day (line 1086). On clearing, the "Card disappears" (line 566), and the record is "visible only to moderators" (line 554). One person with two email addresses can make a submerged tree warning vanish for everyone, and a mistaken "Gone" from two passers-by does the same. Flags add a second path: "an item with flags from 3 different users whose accounts are at least 7 days old is hidden at once (`status = 'hidden'` ...)" (line 1113), but `hazards.status` has no `hidden` value in 08 (`'active', 'cleared', 'expired', 'removed'`, line 773), so a build must either fail the update or map it to `removed`, taking a live warning down on three flags.
- Fix: Count clear votes only from accounts at least 7 days old, and require either the poster, a moderator, a club safety role, or two clear votes with a `near` geolocation result. Keep a cleared hazard visible for 24 hours as "Reported gone by 2 people at 7:10 AM" before it drops off the list. Flags on a hazard hide only its note, never the pin, and send the pin to the queue. Say in 04 8.5 which column auto-hide sets for each target type.

#### P29. One anonymous tap can undo a "launch closed" report, and a shared network can overwrite other people's reports

- Severity: major (phase 3).
- Where: `04-reports-and-check-ins.md` 3.3 lines 152, 154 and 158, 3.5 line 212, 3.6 lines 235 and 268.
- Problem: "`launch`: the newest report wins regardless of weight, because a closure is a fact someone just checked. A `closed` report shows in caution color until a newer `open` report or 12 hours." (line 235). A single signed-out "Open" tap, from anyone anywhere, removes "Launch reported closed or blocked at 6:10 AM." (line 268) from the screen. Separately, replacement is keyed on the reporter: "the newest row from the same `user_id` or `ip_hash` at this location with `created_at` in the last 10 minutes is updated instead of inserting" (line 212). `ip_hash` is a daily hash of the IP address (line 158), and a boathouse wifi or a mobile carrier's shared address puts different people behind one IP. A second person's "Flat water" then overwrites the first person's "launch closed" or "thick fog" row instead of adding one, and the daily cap of 20 a day per `ip_hash` (line 152) can lock a whole boathouse out.
- Fix: An `open` report clears a `closed` one only when it comes from a weight of 1.5 or more, or from two independent reporters; until then show both ("Reported closed at 6:10 AM, open at 6:20 AM."). Replace a signed-out report only when the same browser sent it (a random id kept in `localStorage`), not on `ip_hash` alone, and merge fields rather than overwrite them. Raise the daily cap for an `ip_hash` that many signed-in members also report from, or apply it to signed-out reports only.
