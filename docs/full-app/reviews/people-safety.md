# People and safety review

Reviewed `docs/full-app/01` to `08` (branch `dev-full-app` at 59bed34) from the side of the people who use the app: rowers on the water, juniors and their guardians, coaches and club safety officers, and people affected by what others post. Started 2026-10-18 10:05 UTC (`date -u`).

Status: in progress

Count so far: 2 blocker, 7 major, 0 minor (9 findings).

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
