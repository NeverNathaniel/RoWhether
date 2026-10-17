# Clubs

Most rowers row with a club. This document plans what clubs get in RoWhether: a club page, members and roles, the club's own safety rules applied to each member's Go, Caution or Stay off, a water status set by the person in charge, a board of boats on the water with overdue escalation to safety officers, emergency information for each launch site, and an incident log. Phase 6 adds boats, damage reports, booking, practices, attendance, lineups, calendar feeds and announcements.

Scope: phase 5 (clubs and safety), phase 6 (club operations), and a Later list.

Out of scope here: accounts, sign-in, site roles, guardian links, email sending and legal text (03-accounts-and-privacy.md); outings, float plans, personal escalation, reports and hazards (04-reports-and-check-ins.md); push and email delivery, the engine, quiet hours and caps (05-notifications.md); navigation, units and screen layout (07-product-and-ux.md); the canonical schema and migration numbering (08-architecture.md); phase exit criteria (09-roadmap.md).

How the shared principles apply here:

- Nothing changes for people who are not in a club. Putney Landing looks exactly as it does now until a club there turns something on, and even then the public sees one quiet line.
- Club rules change what a member sees only at the club's own locations, and only while "Use club rules here" is on.
- Safety features warn and record. They never block someone from logging a row, because a logbook that says no is a logbook people stop using.
- Broadcast only. There are no private messages, comments or replies anywhere in club features, so US youth sport rules on adult and minor communication are met by design (5.2).
- The Now screen stays fast. Club data is one small cached request that never delays the first paint, and club screens load only when opened.

## Contents

1. Terms
2. What clubs need
3. Clubs
4. Memberships
5. Roles, safeguarding and permissions
6. Club rules
7. Water status
8. The board, overdue escalation and emergency info
9. Incidents and near misses
10. Boats, damage reports and safety checks (phase 6)
11. Booking (phase 6)
12. Practices, RSVP and attendance (phase 6)
13. Lineups (phase 6)
14. Calendar feeds (phase 6)
15. Announcements (phase 6)
16. Club settings, export and retention
17. Limits
18. Schema
19. API
20. Screens and routes
21. Notifications (for 05)
22. Code map
23. Phase plan
24. Tests
25. Open questions and decisions

## 1. Terms

| Term | Meaning |
| --- | --- |
| club | An organization that rows from one or more locations: a club, school team, college crew, masters program, adaptive program, or an association of clubs. Has a slug and a page at `/club/<slug>`. |
| membership | One person in one club, with a kind, club roles, groups and clearances. A row in `memberships`. |
| roster-only member | A membership with no account behind it: a name the club added, usually a junior. Lineups, attendance and the board can name them. |
| kind | `adult`, `junior` (a minor, under 18) or `guardian` (a parent or carer who does not row with the club). |
| club role | A staff role on an adult membership: admin, coach, safety officer, equipment manager. A membership can hold several. "Staff" means any of them. |
| guardian | An adult linked to a junior membership in `club_guardians`. A guardian may also row (kind `adult`) or not (kind `guardian`). |
| group | A club-defined set of members: Juniors, Novices, Masters, Adaptive, Learn to row. Rules, practices and announcements target groups. |
| club rule | One row of the club's safety policy: who it covers (group, boat classes, with or without a launch, location, months), limits and requirements. A row in `club_rules`. |
| crew type | The context a rule result is computed for: the member's groups, a boat class, and whether a launch goes with them. |
| club result | Go, Caution or Stay off for one crew type under the club's rules, from the same `assess()` as the general level. |
| water status | A club's manual open, restricted or closed status with a reason and an end time. A row in `water_status`. |
| board | The club's view of outings (04) at its locations: who is on the water, due back, overdue. The UI calls it "Board". |
| kiosk | A shared screen at the boathouse, paired to the club, that shows the board and lets adults start and finish their own rows. |
| clearance | A dated check a coach records for a member: swim test, flip test, cleared to row alone, cox trained, launch driver. |
| practice | One scheduled club session. A series is a weekly recurrence that creates practices. |
| lineup | Who sits where in one boat for one practice. |
| booking | A member's reservation of a club boat for a time. |
| incident | A record of an injury, damage or near miss, kept by the club's safety officers. |

In code and these docs "call" is fine. In UI copy the verdict is Go, Caution or Stay off, never "call".

## 2. What clubs need

### 2.1 Facts this plan leans on

USRowing Safety Guidelines, December 2022 edition (verified live 2026-10-17 by downloading and reading `https://usrowing-craft-storage-production.nyc3.digitaloceanspaces.com/staging/USRowing_SafetyGuidelines_20221201-1.pdf`, linked from https://usrowing.org/about-safety/safety-resources):

- Logbook: "Each organization should have a logbook (digital or paper) for keeping tracks of what boats are on the water, where and when. It should be kept in a prominent location." Entries "should minimally specify the date, time launching, boat size (e.g., 4+, 2-) boat name, coach/coxswain/sculler name(s), anticipated return time, and, upon return, actual time. Have a plan to address a boat not logged back in. Everyone should sign out and then back in, every row."
- "The logbook should have a separate area of reporting boat damage incurred. Designate who is responsible for repair, as well as what is damaged, and be clear if boat is not row-able."
- Incident reports: file at the earliest opportunity on the USRowing incident form, and keep a copy in the organization's files.
- The waterway: post a traffic pattern map; list hazards, safe havens, boat ramps and land locations for rescuers. "Emergency landing sites, contacts and phone numbers should be with any coach or safety launch operator at all times, including street addresses for potential landing locations if you need to call for help. Rescuers need land-based locations."
- Swim test: float or tread water for ten minutes and put on a life jacket while floating. "If an athlete cannot swim, they must wear a PFD in the shell at all times."
- Flip test: all 1x scullers should be able to flip the boat and re-enter it.
- Fog: "Do not launch in fog with less than 100 yards visibility."
- Cold: "When air is below 40 degrees and/or water is below 50 degrees, keep a launch within 100 yards of all shells." Some organizations "stop all on-the-water activity, some enforce the four-oar-rule."
- "Under no circumstances should athletes who are minors be unsupervised on the water, without a safety launch."
- "All single scullers without supervision should carry a PFD in the boat." Scullers without a coach should use the buddy system.
- Coaches and launch drivers should hold a current boater safety certificate.
- Launch equipment: PFDs for every rower and coxswain in the coach's care, everyone in the launch wearing a PFD, a paddle, a waterproof first aid kit, emergency blankets, a throwable PFD, a horn or whistle, the kill switch cord worn, and a marine VHF radio on coastal water.
- Before launching: rigging nuts tight, foot stretchers and slide checked, heel ties about 3 inches and in good condition, lights, a PFD if unaccompanied, a phone in a watertight container, water, a white bow ball securely fastened.

USRowing "Report an Incident" (verified live 2026-10-17, https://usrowing.org/report-an-incident) offers three routes: "Report a Rowing Safety Incident" (capsizing, injury, collision; https://form.jotform.com/223243735466054), "Report to The U.S. Center for SafeSport" (https://uscenterforsafesport.org/report-a-concern/), and "Report a Safeguarding Incident" (physical or emotional misconduct, MAAPP violations; https://form.jotform.com/230033648350145). The safety form (verified by reading it 2026-10-17) has incident types Injury, Property and Near Miss, allows anonymous reports, and asks for date, time, location, organizations, injuries, property issues, boat type, rowing category, weather (air and water temperature, wind band, precipitation, current, lightning), a narrative and witnesses. Section 9 mirrors these fields.

US Center for SafeSport, Minor Athlete Abuse Prevention Policies (MAAPP), Electronic Communications Policy, 2022 (verified live 2026-10-17 by reading https://maapp.uscenterforsafesport.org/wp-content/uploads/2023/11/MAAPP_OnePagers_Communications_102623-A_v1.pdf):

- Communication between an adult participant and a minor athlete "Must be Open and Transparent": "A parent/guardian, another adult family member of the Minor Athlete, or another Adult Participant must be copied or included on the communication." "This includes all communication initiated by a Minor Athlete."
- "Only electronic platforms that allow Open and Transparent communication can be used."
- "All team communication or communications from an Adult Participant to more than one Minor Athlete must copy or include another Adult Participant, or all the Minor Athletes' parents/guardians."
- "Organizations and Adult Participants must honor a parent/guardian's request to discontinue communication with their Minor Athlete, unless there is an emergency."
- Exceptions: emergency, dual relationship, close in age (no authority and not more than 4 years older), personal care assistant.

Other facts:

- British Rowing runs a confidential online incident reporting system open to members and non-members, asks for near misses too, and asks for reports within 24 hours, at incidentreporting.britishrowing.org (from search results summarizing British Rowing's page; the page returned 403 to this sandbox, unverified directly).
- No national incident form was found for Rowing Canada Aviron or Rowing Australia; state bodies such as Rowing ACT and Rowing SA publish their own (from search results, unverified).
- Club cold weather policies vary: one limits boats to "4 or more oars" below 40°F water with a launch within 100 meters; one Utah plan uses an air plus water line of 90°F; a New York State Parks guide suggests 2 shells per launch for novices and at most 3 for experienced rowers (all from search results, https://www.rowpnra.org/wp-content/uploads/2019/05/Cold-Weather-Policy-FInal.pdf and others, unverified).

### 2.2 Feature catalog

Value and effort are judgments. Effort is for one developer who knows the codebase: S under a week, M one to three weeks, L more than three (estimates).

| # | Feature | Who it helps | Value | Effort | Phase | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Clubs, memberships, invites, roles | Everyone in a club | High | M | 5 | Everything else needs them. |
| 2 | Safeguarding rules for juniors | Juniors, guardians, clubs | High | S | 5 | Required of US clubs under MAAPP; designed in, not bolted on. |
| 3 | Club water status (open, restricted, closed, with reason and end time) | Members, guardians, visitors | High | S | 5 | The answer from the person in charge, in place of a whiteboard photo in a group chat. |
| 4 | Club rules by group, boat class and launch | Members, coaches, safety officers | High | M | 5 | Turns the club's written policy into the verdict each member sees. |
| 5 | Which crews can go (club matrix) | Coaches, safety officers | High | S | 5 | One look before practice: Juniors 8+ with a launch Go, Novice 1x Stay off. Falls out of 4. |
| 6 | Board of boats on the water, built on 04's outings | Safety officers, coaches | High | M | 5 | USRowing asks every club for a logbook; most are paper. |
| 7 | Overdue escalation to safety officers and guardians | Rowers, safety officers | High | M | 5 | A paper logbook cannot tell anyone a boat is late. |
| 8 | Kiosk board for the boathouse | Everyone at the boathouse | High | M | 5 | The logbook belongs "in a prominent location"; a shared tablet replaces the clipboard. |
| 9 | Emergency info per location | Everyone, rescuers | High | S | 5 | Street addresses for landing sites, hospital, AED: what a 911 caller needs. |
| 10 | Clearances (swim test, flip test, cleared to row alone, cox, launch driver) | Coaches, safety officers | Medium | S | 5 | Named in the USRowing guidelines; lets rules and the board warn. |
| 11 | Started against club rules: warn and record | Safety officers | High | S | 5 | Visibility without blocking. |
| 12 | Incident and near-miss log, export, link to the national form | Safety officers | High | M | 5 | USRowing asks clubs to report and keep copies; near misses are where lessons are. |
| 13 | Club verification | Public, clubs | High | M | 5 | Stops impersonation before a club can post publicly. |
| 14 | Public club page | Visitors, new rowers | Medium | S | 5 | Where visitors find rules, traffic pattern and how to join. |
| 15 | Club deletion and full export | Admins | Medium | S | 5 | Clubs must be able to leave with their data. |
| 16 | Boats and equipment registry | Equipment managers, members | High | M | 6 | Base for damage, booking and lineups. |
| 17 | Damage reports and out of service | Everyone | High | S | 6 | The logbook's damage area, with "not rowable" taking the boat off the board and booking. |
| 18 | Practice schedule, weekly recurrence | Coaches, athletes, guardians | High | M | 6 | Base for RSVP, attendance, lineups and calendars. |
| 19 | Practice outlook and the evening decision | Coaches | High | S | 6 | The app's strength: each practice's forecast under the club's rules, and a prompt to decide the night before. |
| 20 | Land session switch on Stay off days | Coaches, athletes | Medium | S | 6 | One tap moves practice to the erg room and tells everyone. |
| 21 | RSVP | Coaches, athletes, guardians | High | S | 6 | Lineups are built from who is coming. |
| 22 | Lineups, published to athletes | Coaches, athletes, guardians | High | M | 6 | The most checked thing before a junior practice. |
| 23 | Attendance | Coaches | Medium | S | 6 | Records schools and programs need. |
| 24 | Calendar feeds (iCal, tokenized) | Athletes, guardians | Medium | S | 6 | Practices in the calendar people already use. |
| 25 | Boat booking | Masters and adult members | High | M | 6 | Fair use of shared singles and doubles. |
| 26 | Book from Plan a row | Members | Medium | S | 6 | The calmest Go slot, booked in two taps. |
| 27 | Announcements, broadcast only | Staff, members, guardians | Medium | S | 6 | A channel that meets MAAPP: broadcast, staff and guardians included. |
| 28 | Launch and shell safety checks at Start a row | Coaches, launch drivers | Medium | S | 6 | The USRowing equipment and pre-launch lists as a quick tick list. |
| 29 | Visitor info and learn-to-row listings | Visitors, the public | Medium | S | 6 | Brings new rowers in. Public practices of kind `learn_to_row`. |
| 30 | Club data export, CSV per table | Admins | Medium | S | 6 | Clubs keep their own records. |
| 31 | Attendance and boat use reports | Admins, coaches | Low | S | 6 | Counts for grants and planning. |
| 32 | Traffic pattern diagrams on a map | Visitors | Medium | L | Later | Needs map drawing (07); the text pattern exists from phase 3 (01). |
| 33 | One status for a whole shared waterway (an association's status that member clubs inherit) | Boathouse Row, the Charles | Medium | M | Later | Needs agreement among clubs; the `association` kind leaves room for it. |
| 34 | Regatta calendar | Competitive programs | Low | M | Later | Link out to the national body and regatta entry sites instead. |
| 35 | Damage report photos | Equipment managers | Medium | M | Later | Needs R2 and screening; 04 made the same choice for hazards. |
| 36 | SMS escalation | Safety officers | Medium | M | Later | Per-message cost and US registration; 05 decided no SMS at launch. |
| 37 | Launch-to-shell ratio check | Safety officers | Medium | S | Later | Policies vary; needs shells linked to their launch on the board. |
| 38 | Guest rows for visiting rowers at a host club | Host clubs, visitors | Medium | M | Later | Needs rules for guest identity and liability. |
| 39 | Erg workouts on Stay off days | Athletes | Low | S | Later | Link to Concept2 instead of building a library. |
| 40 | Equipment maintenance schedules | Equipment managers | Low | M | Later | Damage reports cover most clubs. |

### 2.3 What not to build, and what to link to

| Not built | Why | Instead |
| --- | --- | --- |
| Dues, payments, fees, invoices | Money handling, refunds, tax and PCI scope; clubs already have a system | `links.dues`: a button "Pay dues" to the club's own page |
| Chat, direct messages, comments, replies | MAAPP requires adult and minor communication to be open and transparent; moderation load | Announcements (15), broadcast only. Clubs keep their own adult group tools. |
| Membership CRM: registration forms, waivers, medical forms, background checks, document storage | Sensitive data, legal duties, and national bodies and club software already do it | `links.registration`, `links.waiver`. Clearances store only "swim test on Sep 3, 2026", never the document. |
| Athlete performance data: erg scores, weights, coach notes on athletes | Sensitive, especially for minors; not about conditions | `links.erg` to the Concept2 Logbook (https://log.concept2.com/, verified live 2026-10-17) |
| Regatta entries and results | National systems exist | `links.regattas` to the club's chosen entry site (RegattaCentral is commonly used in the US; unverified, its site returned 403 to this sandbox) |
| Coach payroll, staff scheduling, video analysis | Not about rowing conditions | Nothing |

## 3. Clubs

### 3.1 The club record

JSON names are what the API uses; D1 columns are snake_case, converted in `worker/clubs/shape.js` the same way `shape()` works in `worker/reports.js`.

| Field (JSON) | Column | Rules | Example |
| --- | --- | --- | --- |
| `id` | `id` | `crypto.randomUUID()` | |
| `slug` | `slug` | Slug rules (lowercase a to z, 0 to 9, hyphens, 3 to 48). Own namespace under `/club/`, so a club and a location may share a slug. Reserved: the shared list plus `new` and `join`. | `putney-rowing-club` |
| `name` | `name` | 3 to 80 chars | `Putney Rowing Club` |
| `shortName` | `short_name` | 2 to 24 chars. Notification titles, chips, the hero line. | `Putney RC` |
| `kind` | `kind` | `club`, `school`, `college`, `masters`, `junior`, `adaptive`, `community`, `association`, `other` | `club` |
| `status` | `status` | `unverified`, `pending_review`, `verified`, `suspended`, `deleting`, `deleted` (3.3, 3.6) | `verified` |
| `tz` | `tz` | Copied from the primary home location. Club pages print times in it. | `America/New_York` |
| `country` | `country` | From the primary home location | `US` |
| `locality` | `locality` | Up to 60 chars, from the primary location, editable | `Putney, VT` |
| `description` | `description` | Up to 500 chars, public, screened (3.2) | |
| `visitorInfo` | `visitor_info` | Up to 1,000 chars, public, screened | |
| `safetyInfo` | `safety_info` | Up to 1,000 chars, members only, not screened | "Safety officers on duty are listed on the boathouse door." |
| `website` | `website` | `https://` only, up to 200 chars | `https://putneyrowing.example` (placeholder) |
| `contactEmail` | `contact_email` | Public. Shown as a mailto link. | |
| `links` | `links` | `{ registration, dues, waiver, regattas, erg }`, each an `https://` URL up to 200 chars | |
| `statusPublic` | `status_public` | Water status visible to the public. Default on. Forced off while unverified. | `true` |
| `rulesPublic` | `rules_public` | Rules summary on the public page. Default off. | `false` |
| `settings` | `settings` | Section 16 | |
| `rulesRevision` | `rules_revision` | Plus 1 on any change to rules, groups or club settings that affect results. Lets clients skip refetching. | `12` |
| `verify` | `verify_*` | Section 3.3. Never returned to non-admins. | |
| `deleteAfter` | `delete_after` | Section 3.6 | |
| `locations` | rows in `club_locations` | 3.5 | Putney Landing, home, primary |

### 3.2 Creating a club

Who: a signed-in user whose account is at least 7 days old, with a confirmed email, not suspended (the same bar 01 uses for location edits, from 03's `users`). At most 3 clubs created per user (not counting deleted ones) and 1 per day.

Where: `/club/new`, and a quiet link "Start a club page for this location" under Clubs here on a location page.

The form, in order:

| Field | Control | Rules |
| --- | --- | --- |
| Home launch site | Location search (01's `GET /api/locations?q=`) | Required. `published` or `verified` only. Link under it: "Not listed? Add your launch site first" to `/add`. |
| Club name | Text | 3 to 80 |
| Short name | Text, prefilled from the name | 2 to 24 |
| Web address | `rowhether.com/club/` plus slug, generated from the name with 01's slug rules, editable | Checked as you type: "Taken. Try putney-rowing-club-vt." |
| Type | Chips: Club, School, College, Masters, Junior, Adaptive, Community, Association, Other | Required |
| Club website | URL | Optional, `https://` only. Needed for the quickest verification. |
| Public contact email | Email | Optional |
| Short description | Text area, 500 | Optional |
| Your roles | You are an admin. Ticks: Coach, Safety officer | |

Intro copy: "Start a club page. Your club gets its own rules and water status, and a board of boats on the water. New clubs are private until verified: members can use everything, but the club does not show in search or on location pages yet."

Button: "Create club".

Server checks in `worker/clubs/clubs.js createClub()`, in order:

1. Signed in, standing as above: 403 `not_allowed` "Clubs can be created by accounts at least 7 days old with a confirmed email."
2. Limits: 429 `too_many_clubs` "You have created 3 clubs. Delete one before starting another."
3. Fields valid: 400 `invalid` with `field`.
4. Slug free in `clubs.slug` (deleted clubs hold their slug for 90 days): 409 `slug_taken`.
5. Duplicate check. `name_key` is the name folded (NFKD, accents stripped, lowercase, punctuation removed) with these words dropped: the, rowing, row, rowers, club, crew, boat, boathouse, association, rc, bc. "Putney Rowing Club" becomes `putney`. If a verified club has the same `name_key` and shares a location or has a location within 50 km, return 409 `similar_club`: "A verified club called Putney Rowing Club already rows from Putney Landing. If you help run it, ask one of its admins for an invite." with `{ club: { slug, name } }`. The client offers "This is a different club" which resends with `confirmDifferent: true`; that is recorded in `verify_evidence` for the reviewer.
6. Public text (description) is screened with 04's `worker/screen.js` before it shows publicly. Until the screen passes, `public_text_status = 'pending'` and the public page leaves it out. A rejected screen sets `hidden` and tells the admins "Your club description was not published. Edit it and try again."

One `env.DB.batch()` writes the `clubs` row, the primary `club_locations` row, the creator's `memberships` row (adult, admin plus chosen roles, active), the creator's `notify_prefs` row for `water_status` (05), and an `audit_log` row `club.create`.

After creating, admins see a setup checklist at the top of the club page until every item is done or dismissed:

> Set up Putney Rowing Club
> 1. Verify the club
> 2. Add groups, such as Juniors, Novices and Masters
> 3. Set club rules
> 4. Invite members
> 5. Pair a boathouse screen

### 3.3 Verification

Statuses: `unverified` (new), `pending_review` (proof passed or evidence sent, waiting for a moderator), `verified`.

What an unverified club cannot do: appear in `GET /api/clubs` or on location pages; show a public page (non-members get 404); post a public water status (`status_public` forced to 0); claim a location as steward (01 section 13.4); post official hazards (04 section 4); have more than 100 active members. Everything else works, so a real club can start before review finishes.

Proof methods. The token is `rw-` plus 22 base64url characters from 16 random bytes, stored in `verify_token`, and the domain checked is the registrable domain of `website`:

| Method | What the admin does | What the Worker checks |
| --- | --- | --- |
| Website tag | Adds `<meta name="rowhether-club-verify" content="rw-Qm3kZ8pL0aT4vX9yB2nR7w">` to the home page | `GET` the website's home page with a 10 s timeout, at most 3 redirects and only within the same registrable domain, reads at most 256 KB, finds the exact tag. |
| DNS record | Adds a TXT record `rowhether-club-verify=rw-...` at the domain or at `_rowhether.` plus the domain | DNS over HTTPS: `https://cloudflare-dns.com/dns-query?name=<host>&type=TXT` with `accept: application/dns-json` (returned TXT answers for usrowing.org, verified live 2026-10-17). |
| Email at the domain | Enters an address at the domain, such as `info@putneyrowing.example`, then the 6-digit code sent to it | Free mail domains are refused (a fixed list in `worker/clubs/verify.js`: gmail.com, googlemail.com, yahoo.com, outlook.com, hotmail.com, live.com, icloud.com, me.com, aol.com, proton.me, protonmail.com, gmx.com, mail.com, zoho.com). Code valid 30 minutes, 5 tries, 3 sends a day. Sent with 03's `sendEmail()`. |
| No website | Writes up to 500 characters on how to check: "Listed on our national body's club finder", "Our coach is reachable at the boathouse phone." | Nothing automatic. Goes straight to review. |

When a method passes, `verify_passed_at` is set and the status moves to `pending_review`. The admin sees: "Check passed. A moderator will review Putney Rowing Club. We will email you when it is verified."

Moderator review (03's site roles `moderator` and `admin`) in the owner tools at `/admin`. Every box is required:

- The website or evidence names this club and where it rows.
- The home location is where the club launches.
- No verified club is the same organization (the duplicate check result is shown).
- The name is not misleading (not a national body, not a well-known club from elsewhere).

Approve: `status = 'verified'`, `verified_at`, `verified_by`, audit `club.verify`, email to the admins: "Putney Rowing Club is verified. It now shows on Putney Landing's page and in club search." Reject: back to `unverified` with a reason (up to 300 chars) emailed to the admins. A moderator can revoke verification later with a reason; the club goes back to `unverified` and its public status disappears.

Two clubs may verify the same domain (a university hosting men's and women's crews); the reviewer sees "Another club verified this domain: Dartmouth Women's Rowing" and decides.

Decision: Verified status needs a domain proof (website tag, DNS record or email at the domain) or written evidence, then a moderator's approval. Unverified clubs work fully for their members but stay private.
- Alternative: owner approval only, with no automatic proof (more manual work, same protection).
- Alternative: automatic verification by domain proof alone (fast, but a lookalike domain passes).
- Alternative: no verification, only an "Unverified" label (impersonation risk on public pages and location claims).

### 3.4 Public club page

`/club/<slug>` for a verified club. Members see the members' page at the same address (section 20); everyone else sees this:

1. Name, locality and "Verified club".
2. Water status, when `statusPublic` and a status is live: "Closed to club rowing until 6 PM. High water."
3. Home locations, each linking to `/<location-slug>`: "Rows from Putney Landing."
4. About: the description.
5. Visiting rowers: `visitorInfo`, then the waterway's traffic pattern (01 section 3.3).
6. Learn to row and open sessions (phase 6): public practices in the next 60 days with their sign-up link.
7. Rules for visitors, when `rulesPublic`: plain sentences generated from `club_rules` by `rulesText()` in `src/clubrules.js`: "Singles without a launch: wind under 10 mph, gusts under 15 mph, and only when the water is 50°F or warmer."
8. Contact: website and email. "Ask to join" (signed in) or "Sign in to ask to join".
9. "Public calendar" (an `.ics` link) when public practices exist.
10. "Report this club page" (a flag, target `club`, 04 section 8.5).

A suspended club's page says "This club page is not available." A club in `deleting` shows normally to the public until it is deleted.

### 3.5 Club locations and shared waterways

- `club_locations` links a club to up to 10 locations, each `home` or `regular` (a venue the club uses sometimes). Exactly one is primary; its time zone is the club's.
- Location pages list "Clubs here": verified clubs linked to that location, home clubs first, at most 5, then "and 2 more clubs". Each line shows the club's public status when there is one: "Putney Rowing Club. Closed to club rowing until 6 PM." 07 places the list.
- 01's `GET /api/locations/:slug` adds `clubs: [{ slug, name, shortName, role, hasRules, status }]` (01 section 11.7 already names this field). `status` is the public status or null.
- Shared waterways (the Charles, the Schuylkill): hazards are per waterway (04), and the traffic pattern is per waterway (01). Steward clubs of member locations edit the traffic pattern through 01's revisions; disagreements are visible in the history and moderators settle them. Each club keeps its own rules, groups and water status. One club closing its water does not change another club's members' results.
- A user in two clubs at the same location chooses one in the hero sheet ("Rowing with"). The choice is saved per location.

### 3.6 Suspension and deletion

Suspension (site moderators only, with a reason up to 300 chars): the public page and location listings hide the club; members see a banner "This club is suspended by RoWhether moderators: <reason>. Contact us at the address in Help." Members keep read access to export their own data. Board, rules and status stop applying to member results until restored.

Deletion:

1. Any admin taps "Delete this club" in Settings and types the club's short name.
2. `status = 'deleting'`, `delete_after = now + 14 days`. Every admin gets an email and push: "Alex R. asked to delete Putney Rowing Club on Oct 31, 2026. Any admin can cancel before then." A banner shows to all members.
3. During the 14 days: everything works, and the full export (16.2) is offered to admins.
4. Any admin can cancel: back to the previous status, audit `club.delete.cancel`.
5. After 14 days, the daily cron (05's `17 9 * * *` run) deletes, in one batch per club: rules, statuses, groups, invites, devices, practices and series, attendance, lineups, bookings, boats, damage reports, announcements, calendar tokens for this club, and incidents. Memberships are deleted. Outings keep their row for the rower's own log with `club_id` set to NULL and `rule_lvl`, `rule_text`, `club_stage`, `ack_by` cleared. `locations.steward_club_id` is set NULL. `notify_prefs` rows for the club are deleted (05 notes it has no foreign key here).
6. The `clubs` row becomes a tombstone: `status = 'deleted'`, every optional field NULL, `name` set to "Deleted club", slug kept, `delete_after = now + 90 days`. After 90 days the row is removed and the slug is free. Holding the slug stops someone re-registering it to impersonate the old club.
7. `audit_log` keeps `club.delete.done` with the slug and who asked.

If the last admin's account is deleted (03), the earliest-joined active member with the safety role becomes admin, else the earliest coach, and they are told. If there is none, the club is flagged for moderators, who can appoint an admin on request.

## 4. Memberships

### 4.1 Kinds and statuses

| Kind | Who | Can hold staff roles |
| --- | --- | --- |
| `adult` | An adult who rows, coaches or helps | Yes |
| `junior` | A minor athlete (under 18). For linked accounts, from 03's age data; for roster-only members, set by staff. | No |
| `guardian` | A parent or carer who does not row with the club | No |

| Status | Meaning |
| --- | --- |
| `requested` | Asked to join from the public page; waiting for an admin |
| `pending_guardian` | A junior account that joined; waiting for a linked guardian to approve |
| `active` | A member |
| `left` | Left on their own |
| `removed` | Removed by an admin |
| `blocked` | Removed and may not ask again |
| `declined` | A request that was declined |

Transitions: `requested` to `active` or `declined` (admin); `pending_guardian` to `active` (guardian) or `declined` (guardian or admin); `active` to `left` (member), `removed` or `blocked` (admin). Ended rows stay for history. A person may rejoin after `left` or `removed` with a new row; `blocked` stops new requests from that account to that club. One live row (`requested`, `pending_guardian`, `active`, `blocked`) per account per club, enforced by a partial unique index.

### 4.2 Roster-only members

Staff can add a member with no account: a name (1 to 60 chars), a kind (`adult` or `junior`), groups, and clearances. Typical use: a junior team where most athletes have no account, or a learn-to-row class.

- Roster-only members appear in lineups, attendance, crew pickers and the board.
- They cannot receive notifications or see anything.
- To link an account later, staff send a personal invite "for" that roster entry (4.3). Accepting attaches the account to the same membership, keeping attendance and lineup history.
- Roster-only juniors can have guardians (4.5), who then see their schedule and lineups.

Decision: Allow roster-only members, so a junior program can use lineups, attendance and the board without every athlete having an account.
- Alternative: require an account for every member (simpler data, but excludes most under-13 athletes and many juniors).

### 4.3 Invites

| Kind | How it is shared | Default uses | Default expiry | Max expiry | Who can make it |
| --- | --- | --- | --- | --- | --- |
| `link` | `https://rowhether.com/club/join/<token>`, token 22 chars base64url from 16 random bytes | 50 | 14 days | 90 days | Admins; coaches for member, junior and guardian presets |
| `code` | 8 characters shown as `K7QF-M2XR`, from the 31-letter alphabet without 0, O, 1, I and L; case and hyphens ignored on entry | 30 | 14 days | 90 days | Same |
| `personal` | Emailed to one address with 03's `sendEmail()`, or shown as a one-time link | 1 | 7 days | 14 days | Same; the only kind that can grant a staff role, and then only admins |

Each invite has a preset: kind (`adult`, `junior`, `guardian`), roles (personal staff invites only), groups, `forMembership` (link an account to a roster-only entry), `guardianOf` (a junior membership id), and `approve` (joining creates a `requested` membership instead of `active`).

Tokens and codes are stored as they are (not hashed) so admins can share them again; they only admit someone to one club, they expire, and they can be revoked. Staff-role invites are single use and expire within 7 days.

Accepting, signed in, at `/club/join/<token>` or by entering a code in Account:

> Join Putney Rowing Club
>
> Alex R. invited you as a member, in Masters.
>
> You will see the club's water status and its rules for Masters at Putney Landing. Club staff will see your name and the rows you start with the club.
>
> [Join] [Not now]

Signed out: "Sign in or create an account to join Putney Rowing Club." 03's sign-in returns to the invite page.

`POST /api/invites/:token/accept` checks in order: invite exists and is not revoked (404 `invite_not_found` "This invite link is not valid."), not expired (410 `invite_expired` "This invite has expired. Ask the club for a new one."), uses left (410 `invite_used_up`), the account is not blocked by this club (403 `not_allowed`), no live membership already (409 `already_member` "You are already a member of Putney Rowing Club."), minors per 4.5. Then one batch: membership (or link to the roster entry), groups, guardian link, `uses + 1` guarded by `WHERE uses < max_uses`, default `notify_prefs` rows, audit. A code entry is rate limited per IP (`CODE_LIMIT`, 5 a minute) and per account (20 a day).

### 4.4 Join requests

From the public page, a signed-in adult can ask to join: a reason (chips: I row here, I am a parent of a junior, I want to learn to row, I coach here, Other) and an optional note up to 200 characters. A user may have 5 pending requests across clubs and 1 per club; after a decline they may ask that club again after 30 days. Requests older than 30 days are declined automatically. Minors cannot ask to join; they join by invite (4.5).

Admins see a count on the club page and a list:

> Sam Lee asked to join. I row here. "Masters sculler, moved from Hanover." Asked Oct 15.
> [Approve] [Decline]

Approve opens kind and groups. Decline is silent: the requester sees "Not approved" next to the club in Account, with no reason.

### 4.5 Juniors and guardians

These rules assume 03's safeguarding outline: an account for a minor needs a linked guardian account (03's guardian link), and children under 13 do not hold accounts. If 03 decides differently, 08 reconciles.

- A junior with an account joins only by an invite with the `junior` preset. Their membership is `pending_guardian` until one linked guardian (03) approves in their own account: "Sam wants to join Putney Rowing Club as a junior. Approve?" Approval also makes the guardian a club guardian of Sam (kind `guardian` unless they already have a membership). If the guardian declines, the membership is `declined`.
- A guardian joins by a guardian invite made for a specific junior (`guardianOf`), or automatically when their linked junior joins. A junior has at most 4 guardians in a club.
- Junior memberships always have club rules on (`rules_on = 1`, enforced by a CHECK).
- At 18 (from 03's birth date, checked by the daily run; for roster-only juniors, staff change the kind), the kind becomes `adult`, `club_guardians` rows for them are removed, and both sides are told: "Sam is now an adult member of Putney Rowing Club. Guardians no longer see Sam's club schedule."
- Each September 1, staff get a reminder to check roster-only junior kinds.

### 4.6 Leaving, removal and blocking

- Leave: "Leave Putney Rowing Club" in the club's Settings for members. Future bookings are cancelled (`left_club`), RSVPs for future practices are removed, the member's lineup seats in future lineups are emptied and the coach is told "Sam left the club. Seat 6 in Bellows Falls is empty." Club `notify_prefs` rows are deleted. An active outing with the club continues to its end.
- Remove: admins only, with an optional private reason. Same effects, and the person sees "You are no longer a member of Putney Rowing Club." Block is remove plus no new requests.
- The last admin cannot leave or drop the admin role until another active adult holds it: "Make someone else an admin first."
- Names stay on past attendance, lineups and the board history. When an account is deleted (03), the membership's `display_name` becomes "Former member" and `user_id` becomes NULL.

### 4.7 Groups

- Up to 30 per club, names 2 to 40 chars, unique in the club. Kind helps templates and defaults: `juniors`, `novices`, `masters`, `adaptive`, `learn_to_row`, `competitive`, `collegiate`, `custom`.
- A member can be in up to 10 groups. Coaches and admins set them.
- Deleting a group used by rules asks first: "2 rules and 14 future practices use Novices. Delete the group and those rules, and remove it from the practices?" Rules for a deleted group are deleted with it (ON DELETE CASCADE), and `rules_revision` goes up.

### 4.8 Clearances

| Key | Name | Typical expiry | Source |
| --- | --- | --- | --- |
| `swim_test` | Swim test | 1 year | USRowing swim test |
| `flip_test` | Flip test (1x) | none | USRowing flip test |
| `solo` | Cleared to row without a launch | none | Club practice |
| `cox` | Cox trained | none | Club practice |
| `launch_driver` | Launch driver (boater safety certificate) | per certificate | USRowing guidance for launch drivers |

Stored in `memberships.clearances` as `{ "flip_test": { "at": 1788998400000, "by": "<membership id>", "expires": null } }`. Set by coaches, safety officers and admins. Seen by the member, their guardians and staff. Never a document or a certificate number. Rules can require clearances (6.3), and Start a row warns when a crew member lacks one (8.3).

## 5. Roles, safeguarding and permissions

### 5.1 Roles

| Role | Holder | What it is for |
| --- | --- | --- |
| Admin | Adult member | Runs the club page: profile, members, staff roles, settings, verification, deletion. |
| Coach | Adult member | Runs practices: groups, clearances, crews, water status, lineups, attendance, announcements. |
| Safety officer | Adult member | Owns safety: rules, water status, overdue alerts, incidents, emergency info. |
| Equipment manager | Adult member | Boats, damage reports, out of service, booking approvals. |
| Member | Active adult | Rows. Sees the club's rules, status, board and schedule. |
| Junior athlete | Active junior | Rows under supervision. Sees what is about them and their crews. |
| Guardian | Adult linked to a junior | Sees and answers for their junior. |
| Visitor | Signed in, not a member | Public page, ask to join. |
| Public | Not signed in | Public page. |

Roles add up: a coach who is also a safety officer has both sets of rights. A rowing parent is an adult member with guardian links.

### 5.2 Safeguarding rules

These apply to every club feature. They implement the MAAPP electronic communications policy quoted in 2.1, and 03's safeguarding rules (assumed: no private messages between adults and minors, broadcast only, guardians can see).

1. No private messages, comments or replies anywhere. Announcements (15) are the only staff-to-member channel and are broadcast to groups.
2. Anything staff send that reaches a junior (announcements, practice notes, lineup notes, water status notes) is visible to all of the club's staff and to that junior's guardians. This meets "copy or include another Adult Participant, or all the Minor Athletes' parents/guardians."
3. Juniors send no free text to adults: RSVPs are choices only (no note), damage reports are choices only (no description), juniors do not file incidents, and juniors join only by invite (no request note). This covers "all communication initiated by a Minor Athlete."
4. Guardians see their junior's club life: memberships, groups, clearances, practices, RSVPs (and can answer them), attendance, published lineups, the junior's rows on the board, announcements that reached the junior, and that an incident involving the junior was recorded (type and date).
5. A guardian can turn off club notifications to their junior's devices, except overdue messages and a closed water status ("unless there is an emergency"). Staff are not told who turned them off.
6. Junior names never appear on public pages. The kiosk shows first name and last initial. Non-staff adults see a junior crew as "Junior crew of 9" with the coach's name.
7. Staff never see a junior's personal data outside the club: the personal row log, float plan contacts, other clubs, or location history (04 keeps these per user).
8. No contact details of juniors are shown to anyone in club features. A guardian chooses at join whether safety officers and coaches see their phone number ("Share my phone with Putney Rowing Club staff for emergencies", on by default, changeable in Account).
9. The MAAPP exceptions (close in age and others) are not modeled. The app has no one-to-one channel, so none is needed.

### 5.3 Permissions matrix

"own" means the person's own record. "junior" in the Guardian column means records of their linked junior. Phase 6 rows are marked (6).

| Action | Public | Visitor | Junior | Member | Guardian | Coach | Safety | Equipment | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| View the public page (verified clubs) | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| View the members' page | no | no | yes | yes | yes | yes | yes | yes | yes |
| Ask to join | no | adults | no | no | no | no | no | no | no |
| Edit profile, links, settings | no | no | no | no | no | no | no | no | yes |
| Verify, claim a location, delete the club | no | no | no | no | no | no | no | no | yes |
| See the member list | no | no | staff names | adults; juniors as a count | staff names | all | all | all | all |
| See clearances | no | no | own | own | junior | all | all | `launch_driver` only | all |
| Set clearances | no | no | no | no | no | yes | yes | no | yes |
| Add roster-only members, set groups | no | no | no | no | no | yes | no | no | yes |
| Approve requests, remove, block, change kind | no | no | no | no | no | no | no | no | yes |
| Assign staff roles | no | no | no | no | no | no | no | no | yes |
| Create invites | no | no | no | no | no | member, junior, guardian | no | no | all |
| See the audit log | no | no | no | no | no | no | no | no | yes |
| See club rules | if public | if public | yes | yes | yes | yes | yes | yes | yes |
| Edit groups | no | no | no | no | no | yes | no | no | yes |
| Edit club rules | no | no | no | no | no | no | yes | no | yes |
| See water status | if public | if public | yes | yes | yes | yes | yes | yes | yes |
| Set restricted or closed | no | no | no | no | no | yes | yes | no | yes |
| Lift a status | no | no | no | no | no | ones set by coaches | yes | no | yes |
| Post the dock water reading | no | no | no | no | no | yes | yes | no | yes |
| See which crews can go | no | no | yes | yes | yes | yes | yes | yes | yes |
| See the board | count only (04) | count only | own rows and crews | adults named, junior crews unnamed | junior's rows | full | full | as member | full |
| Start own row with the club | no | no | if the club allows | yes | no | yes | yes | yes | yes |
| Start a row for a crew | no | no | no | no | no | yes | yes | no | yes |
| Mark another boat back | no | no | boats they are in | boats they are in | no | yes | yes | no | yes |
| Acknowledge or resolve an overdue boat | no | no | no | no | no | yes | yes | no | yes |
| Get overdue alerts | no | no | no | if the rower | stage 2, junior | if starter or practice coach | stage 1 | no | stage 2 |
| Pair or revoke a kiosk | no | no | no | no | no | no | no | no | yes |
| Edit emergency info, traffic pattern (steward club) | no | no | no | no | no | no | yes | no | yes |
| Post an official hazard (04) | no | no | no | no | no | no | yes | no | yes |
| File an incident | no | no | no | yes | yes | yes | yes | yes | yes |
| Read incidents | no | no | no | own | own; type and date for junior | own | all | own | all |
| Review, edit, mark filed, share summary, export incidents | no | no | no | no | no | no | yes | no | yes |
| Read shared incident summaries | no | no | yes | yes | yes | yes | yes | yes | yes |
| See boats (6) | no | no | yes | yes | no | yes | yes | yes | yes |
| Add, edit, retire boats (6) | no | no | no | no | no | no | no | yes | yes |
| Set out of service (6) | no | no | no | no | no | yes | yes | yes | yes |
| File a damage report (6) | no | no | choices only | yes | no | yes | yes | yes | yes |
| Manage damage reports (6) | no | no | no | no | no | no | no | yes | yes |
| Book a boat (6) | no | no | if the club allows | yes | no | yes | yes | yes | yes |
| Approve or decline bookings (6) | no | no | no | no | no | no | no | yes | yes |
| Reserve boats for a practice, bump bookings (6) | no | no | no | no | no | yes | no | yes | yes |
| See the schedule (6) | public practices | public practices | their groups | all | junior's | all | all | all | all |
| Create, edit, cancel, move to land (6) | no | no | no | no | no | yes | no | no | yes |
| RSVP (6) | no | no | own, choices only | own | junior | own | own | own | own |
| See others' RSVPs and attendance (6) | no | no | no | no | no | yes | yes | no | yes |
| Mark attendance (6) | no | no | no | no | no | yes | no | no | yes |
| See published lineups (6) | no | no | practices they are in | practices they are in | junior's | all | all | all | all |
| Draft, edit, publish lineups (6) | no | no | no | no | no | yes | no | no | yes |
| Calendar feed (6) | public feed | public feed | own | own | junior's | own | own | own | own |
| Read announcements (6) | no | no | addressed to them | addressed to them | reaching their junior | all | all | all | all |
| Send announcements (6) | no | no | no | no | no | yes | yes | no | yes |
| Download the club export | no | no | no | no | no | no | no | no | yes |

### 5.4 Enforcement in code

- `worker/clubs/perm.js` holds `PERMS`, one entry per action: `{ 'status.set': ['coach', 'safety', 'admin'], ... }`, with names matching the matrix rows. `clubCtx(env, req, slug)` loads the club, the viewer's live membership and guardian links in one batch, and returns `{ club, member, roles, juniorIds }`. `can(ctx, action, target)` answers, including "own" and "junior" cases.
- Every club handler starts with `const ctx = await clubCtx(...)` then `requireCan(ctx, 'action')`. Errors: 401 `sign_in` "Sign in to see this.", 403 `not_allowed` "Only club safety officers can change the rules.", and 404 `not_found` for an unverified or suspended club the viewer is not a member of (no hint that it exists).
- `GET /api/clubs/:slug` returns `can: ['status.set', 'board.full', ...]` for the viewer, and the client shows only those controls. The server still checks every request.
- Response shaping is per role in one place, `worker/clubs/shape.js` (`boardRow(row, ctx)`, `memberRow(row, ctx)`), so junior names and contact fields are dropped before JSON is built.
- Tests are driven by a separate expectations table written by hand from 5.3, not by `PERMS`, so a mistake in `PERMS` fails a test (24).

## 6. Club rules

### 6.1 What a rule is

One row in `club_rules`:

| Field | Meaning | Default |
| --- | --- | --- |
| `name` | Shown in the editor, the hero and reasons: "Novice scullers", "Cold water" | required |
| `group` | A club group, or everyone | everyone |
| `boatClasses` | Any of 1x, 2x, 2-, 2+, 4x, 4-, 4+, 4x+, 8+, 8x+, or all | all |
| `escort` | `any`, `with_launch`, `no_launch` | `any` |
| `location` | One of the club's locations, or all | all |
| `months` | Months it applies, 1 to 12, or all year | all year |
| `limits` | Thresholds (6.2) | `{}` |
| `requires` | Requirements (6.3) | `{}` |
| `enabled` | On or off | on |

A club has at most 40 rules. The rule set has one revision number (`clubs.rules_revision`); saves send the revision they started from and get 409 `conflict` if someone saved in between.

### 6.2 Limit keys

The keys and units are 01's threshold contract (01 section 11.1), plus five club-only keys. Weather values stay in mph and °F internally (01's decision); 07 converts for display. "Upper" means a value at or above the line triggers the level, so lower is stricter. "Lower" means a value below the line triggers it, so higher is stricter.

| Key | Unit | Direction | Valid range | Reason key in `assess()` |
| --- | --- | --- | --- | --- |
| `windCaution`, `windOff` | mph | upper | 0 to 60 | `wind` |
| `gustCaution`, `gustOff` | mph | upper | 0 to 80 | `gust` |
| `rainCaution`, `rainOff` | % | upper | 0 to 100 | `pop` |
| `coldCombined` | °F, air plus water | lower | 40 to 140 | `cold` |
| `flowCaution`, `flowOff` | the flow binding's unit | upper | 0 to 10,000,000 | `flow` |
| `aqiCaution`, `aqiOff` | the location's AQI scale | upper | 0 to 500 | `aqi` |
| `streamCaution`, `streamOff` | kn | upper | 0 to 10 | (01, tidal) |
| `minLaunch` | the tide binding's unit | lower | per binding | (01, tidal) |
| `levelLow` / `levelHigh` | the level binding's unit | lower / upper | per binding | (01, level) |
| `waterCaution`, `waterOff` (club only) | °F water | lower | 32 to 90 | `club_water` |
| `airCaution`, `airOff` (club only) | °F air | lower | -20 to 80 | `club_air` |
| `heatOff` (club only) | °F apparent temperature | upper | 70 to 120 | `club_heat` |
| `visOff` (club only) | miles | lower | 0 to 2 | `club_vis` |

Rules:

- A key the location does not support is refused (01 section 11.7): no `flowOff` at a location without a flow binding.
- Caution must not be stricter than stay off within one rule (as the Settings dialog checks today).
- Empty means "this rule does not set it". A club rule cannot turn a level off. A club that does not want a rain level can set `rainOff` to 100.
- The fixed rules in `assess()` stay for everyone and cannot be loosened by a club: dark, thunderstorm codes, freezing rain, air below 32°F, visibility under a quarter mile, NWS alerts. `visOff` therefore matters only above 0.25 mi; the USRowing 100 yard fog line (0.06 mi) is already covered.

### 6.3 Requirement keys

| Key | Type | Applies to | Effect when not met | Reason key | Sample reason or note |
| --- | --- | --- | --- | --- | --- |
| `launchAlways` | bool | crews without a launch | Stay off | `club_launch` | "Club rule: a launch must go with this crew." |
| `launchBelowWater` | °F | crews without a launch | Stay off when water is below it | `club_launch` | "Water 47°F. Club rule: launch required below 50°F." |
| `launchBelowAir` | °F | crews without a launch | Stay off when air is below it | `club_launch` | "Air 38°F. Club rule: launch required below 40°F." |
| `launchBelowCombined` | °F | crews without a launch | Stay off when air plus water is below it | `club_launch` | "Air plus water 92°F. Club rule: launch required below 100°F." |
| `fourOarBelowWater` | °F | boats with fewer than 4 oars (1x, 2-, 2+) | Stay off when water is below it | `club_four` | "Water 38°F. Club rule: boats with 4 or more oars only below 40°F." |
| `daylight` | `twilight_ok` or `sunrise_to_sunset` | everyone matched | Twilight hours become Stay off and the rowing day starts at sunrise (6.9) | `club_daylight` | "Club rule: row between sunrise and sunset." |
| `clearances` | list of clearance keys | the viewer, or each crew member at Start a row | Stay off when one is missing or expired | `club_clearance` | "Club rule: a flip test is needed for a 1x. None on file for you." |
| `pfd` | `none`, `carry`, `wear` | everyone matched | Note only | | "Carry a PFD in the boat." |
| `pfdWearBelowWater` | °F | everyone matched | Note when water is below it | | "Wear a PFD: water under 55°F." |
| `pfdWithoutSwimTest` | bool | members without a current swim test | Note | | "Wear a PFD: no swim test on file." |
| `buddy` | bool | crews without a launch | Note | | "Row with a buddy boat." |

Oars per class, for `fourOarBelowWater`: 1x 2, 2x 4, 2- 2, 2+ 2, 4x 8, 4- 4, 4+ 4, 4x+ 8, 8+ 8, 8x+ 16.

Water temperature comes from `waterTemp(m)` as today (gauge or the Settings dock reading), with the club's dock reading (7.5) first when it is under 24 hours old. When a rule needs water temperature and none is known, the hour gets Caution `club_water`: "No water temperature, and a club rule needs one. Check at the dock." It is Caution, not Stay off, because the rule might be met.

### 6.4 Matching and merging

```js
// src/clubrules.js (pure, no DOM; imported by the app and the Worker)
export function ruleMatches(rule, ctx, month) {
  if (!rule.enabled) return false;
  if (rule.groupId && !ctx.groups.includes(rule.groupId)) return false;
  if (rule.boatClasses && !rule.boatClasses.includes(ctx.boatClass)) return false;
  if (rule.escort === 'with_launch' && !ctx.escort) return false;
  if (rule.escort === 'no_launch' && ctx.escort) return false;
  if (rule.locationId && rule.locationId !== ctx.locationId) return false;
  if (rule.months && !rule.months.includes(month)) return false;
  return true;
}

// Strictest value per key across every matching rule.
export function mergeRules(rules, ctx, month) {
  const out = { limits: {}, requires: {}, names: [] };
  for (const r of rules.filter(r => ruleMatches(r, ctx, month))) {
    out.names.push(r.name);
    for (const [k, v] of Object.entries(r.limits)) out.limits[k] = stricter(k, out.limits[k], v);
    for (const [k, v] of Object.entries(r.requires)) out.requires[k] = stricterReq(k, out.requires[k], v);
  }
  return out;
}
```

`stricter(k, a, b)`: if either is empty, the other; for upper keys the smaller; for lower keys the larger. `stricterReq`: booleans OR together; temperatures take the larger; `pfd` takes the stronger of none, carry, wear; `daylight` takes `sunrise_to_sunset` over `twilight_ok`; `clearances` is the union.

Month is the location's local month of the hour being assessed, so a winter rule from November starts at local midnight on November 1. Results are cached per month in `m.club`.

Crew type for the viewer comes from their membership: `groups` (their group ids), `boatClass` and `escort` from `row_as` (set in the hero sheet, defaults: juniors `8+` with a launch, adults `1x` without a launch), and `locationId` from the page.

### 6.5 How club rules combine with location defaults and personal settings

For a member at one of their club's locations with "Use club rules here" on, `clubSettings()` in `src/clubrules.js` builds the `S` that `buildModel()` reads, extending 01's `effectiveSettings()` (01 section 11.5):

1. Base: 01's global defaults overlaid with the location's thresholds.
2. Club: `mergeRules(...).limits` for the viewer's crew type.
3. `S = { ...Base, ...Club }`. A club value replaces the location default, whether stricter or looser: the club knows its crews.
4. Personal: the viewer's overrides for this location (01's `rowhether-settings-v2`, synced through 03). For each key, `S[k] = stricter(k, S[k], personal[k])`. A personal value looser than `S` is ignored, and a blank personal value (level off) is ignored.
5. `S._from[k]` is `club`, `you` or `location`, for the Settings dialog and How this works panels.
6. `assess()` runs its fixed rules as always, then the threshold rules with this `S`, then club reasons from `clubReasons()` (requirements, club-only limits, water status).

The Settings dialog (01 section 11.6) labels each field: "Club rule: 15 mph." A looser personal value shows "Your 18 is looser than the club rule, so 15 is used." Stricter values show "Your setting. Club rule 15."

Decision: With club rules on, a member's own values can be stricter than the club's but never looser (the same decision as 01 section 11.7).
- Alternative: the member's values always win, with a warning "Looser than your club's rule".
- Alternative: club rules replace personal values entirely while on.

Decision: A club rule replaces the location default even when it is looser.
- Alternative: club rules can only tighten location defaults (safer for new clubs, but stops an experienced club from matching its own policy).

Decision: Club rules are on by default for members at club locations. Adults can turn them off per location ("Use club rules here"); juniors cannot.
- Alternative: on for everyone with no switch (simplest, but an adult who also rows privately from the same dock cannot see their own view).
- Alternative: off by default, opt in.

When an adult turns club rules off, the hero shows their own view. The club result is still computed for the board record when they start a row with the club (8.3).

### 6.6 What the member sees

New elements on the Now screen, all inside `#home` and hidden when there is no club context:

- `#clubStatus` above the hero: the water status banner (7.4).
- `#clubLine` inside the hero above the verdict, small: whose rules and which crew type, with "Change".
- `#clubNotes` under `holds`: notes from requirements.
- `#clubAlt` under the notes: the general result, only when it differs.

Masters sculler, Go under the general settings, Stay off under club rules (Putney, 3 PM):

> Putney RC rules: Masters, 1x without a launch. Change
>
> **Stay off.**
>
> Gusts to 17 mph, club limit 15.
> Wind 9 mph from S, gusts 17. Light chop. 52°F air, 55°F water.
>
> Next go: tomorrow morning, 6:58 to 10 AM.
>
> Without club rules: Caution.

Junior eight with a launch on a cold morning, Go with requirements:

> Putney RC rules: Juniors, 8+ with a launch.
>
> **Go.**
>
> Wind 4 mph from NW, gusts 8. Flat water. 46°F air, 49°F water.
>
> Holds until about 10 AM, then the wind builds.
>
> Club requires: a launch (water under 50°F). Wear a PFD: no swim test on file.

Club water closed:

> Club water closed until 6 PM. High water. Set by Alex R., safety officer, 5:52 AM.
>
> **Stay off.**
>
> Club water closed: high water.
> Wind 6 mph from S, gusts 11. Light chop. 48°F air, 51°F water.
>
> Next go: tomorrow morning, 6:59 to 10 AM.

Daylight rule at 6:30 AM, before sunrise:

> Putney RC rules: Novices, 4x with a launch.
>
> **Go.**
>
> Today morning, 7:08 to 10 AM.
>
> Club rule: row between sunrise and sunset.

Missing clearance:

> **Stay off.**
>
> Club rule: a flip test is needed for a 1x. None on file for you. Ask a coach.

No water temperature with a water rule:

> **Caution.**
>
> No water temperature, and a club rule needs one. Check at the dock.

The "Change" sheet ("Rowing as"):

> Rowing with: Putney Rowing Club (only when the viewer has two clubs here)
> Boat: 1x 2x 2- 2+ 4x 4- 4+ 4x+ 8+ 8x+
> A launch is with us: switch
> Use club rules here: switch (juniors see "Club rules always apply for juniors.")
> [Done]

The choice saves to `memberships.row_as` (`PATCH /api/clubs/:slug/me`) and to the local cache, so the next open uses it offline.

The public at a location with a club status sees one quiet line under the hero, linked to the club page: "Putney Rowing Club: closed to club rowing until 6 PM. High water." The public verdict does not change.

### 6.7 Which crews can go

On the club page Today tab, for staff and members: one row per crew type the rules describe, plus "Everyone else". Columns: Now (in daylight), each of today's remaining periods, and tomorrow morning. Each cell is the club result, with the main reason on tap.

| Crew | Now | Midday | Afternoon | Tomorrow morning |
| --- | --- | --- | --- | --- |
| Juniors, with a launch | Go | Go | Caution: gusts to 19 mph | Go |
| Novices, 1x without a launch | Stay off: launch required below 50°F | Stay off | Stay off | Stay off |
| Masters, 1x without a launch | Caution: gusts to 14 mph | Go | Stay off: gusts to 19 mph, club limit 15 | Go |
| Everyone else | Go | Go | Caution | Go |

Crew types come from `crewTypes(rules, groups)`: each enabled rule with a group, class or escort scope gives one row labeled by its scope, deduplicated; classes in a list use the first class as the example ("1x" for `["1x", "2x"]`, labeled "1x, 2x"). At most 12 rows. The table is computed client-side with `levelsFor(m, ctx)`, which reruns `assess()` on the existing hours with each crew type's settings. No extra fetch. At 168 hours and 12 crew types this is about 2,000 `assess()` calls (estimate; measure in the benchmark 05 plans).

### 6.8 Templates from USRowing guidance

"Start from USRowing guidance" in the empty rules editor creates these rules, disabled, for the club to review and turn on. Each shows its source line in the editor.

| Rule | Scope | Setting | Source (USRowing Safety Guidelines, Dec 2022) |
| --- | --- | --- | --- |
| Cold water: launch required | Everyone, without a launch | `launchBelowAir: 40`, `launchBelowWater: 50` | "When air is below 40 degrees and/or water is below 50 degrees, keep a launch within 100 yards of all shells." |
| Juniors: launch always | Group of kind `juniors` | `launchAlways: true` | "Under no circumstances should athletes who are minors be unsupervised on the water, without a safety launch." |
| Singles without a launch | 1x, without a launch | `pfd: "carry"`, `buddy: true` | "All single scullers without supervision should carry a PFD in the boat." and the buddy system |
| Singles: flip test | 1x | `clearances: ["flip_test"]` | The flip test for 1x scullers |
| Non-swimmers | Everyone | `pfdWithoutSwimTest: true` | "If an athlete cannot swim, they must wear a PFD in the shell at all times." |

The four-oar rule is offered as an example in the editor's help text, not as a template, because the water temperature varies by club (40°F in one policy found, from search results).

### 6.9 Code changes

- `src/clubrules.js` (new, pure): `BOAT_CLASSES`, `OARS`, `SEATS`, `LIMIT_KEYS` (key, unit, direction, range), `REQ_KEYS`, `ruleMatches`, `mergeRules`, `stricter`, `stricterReq`, `clubSettings`, `clubReasons(m, h, light)`, `clubNotes(m, ctx)`, `statusFor(statuses, ctx, t)`, `crewTypes`, `levelsFor`, `rulesText` (sentences for the public page and How this works).
- `src/logic.js`:
  - `buildModel(data, S, now, club = null)`. With `club`, sets `m.club = { ctx, rules, statuses, clearances, dockWater, settingsAt, mergedAt }`. Without it, nothing changes (a snapshot test proves Putney output is identical).
  - `assess()`: `const S = m.club ? m.club.settingsAt(h.t) : m.S;` then, after the alert loop, `if (m.club) r.push(...clubReasons(m, h, light))`. Threshold texts gain ", club limit 15" when `S._from[key] === 'club'`.
  - `waterTemp(m)`: when `m.club` has a dock reading under 24 hours old, use it first, labeled "dock reading by Alex R. at 6:05 AM".
  - `LIGHT_KEYS` in `src/config.js` becomes `['dark', 'twilight', 'club_daylight']`, so periods, holds and `callRuns()` ignore the daylight reason the same way they ignore twilight.
  - `periodsFor()` and `m.daytime` use `s.sunrise` instead of `s.dawn` as the start of the rowing day when the merged `daylight` is `sunrise_to_sunset`. `lightsUntil` is then null.
- `src/config.js`: `THEN` gains `club_status: 'club water closes'`, `club_launch: 'a launch is required'`, `club_four: 'the four-oar rule applies'`, `club_water: 'the water is too cold for club rules'`, `club_air: 'too cold for club rules'`, `club_heat: 'too hot for club rules'`, `club_vis: 'visibility drops'`, `club_clearance: 'a clearance is needed'`. `FACTORS` gains `{ key: 'club', name: 'Club rules', keys: ['club_status', 'club_launch', 'club_four', 'club_daylight', 'club_clearance', 'club_water', 'club_air', 'club_heat', 'club_vis'] }`, shown only when `m.club` is set.
- `src/render/hero.js`: `renderClubStatus(m)`, `renderClubLine(m)`, `renderClubNotes(m)`, `renderClubAlt(m)`; the alt line compares `m.cur.a.lvl` with `assess({ ...m, S: m.Sgen, club: null }, m.cur, m.now).lvl`.
- `src/club-context.js` (new): `loadClubContext(slug)`, cached in `localStorage` key `rowhether-club-v1` (`{ [locationSlug]: { fetchedAt, rev, clubs: [...] } }`), every access in try/catch. Fetched with the 10-minute refresh, in parallel with the data sources, never awaited before the first render. A cached context older than 7 days still applies, with a note under the hero: "Club rules from Oct 10. Connect to update."
- `src/settings.js`: labels per 6.5, and the "Use club rules here" switch.
- The Worker imports `src/clubrules.js` and `src/logic.js` for server-side results (8.3 records, 12.2 evening decision), as 05 does for its digests.

### 6.10 Edge cases

- Member of two clubs at one location: the hero sheet picks one; the choice is saved per location. Rules never mix across clubs.
- Rules change while a member has the app open: the next refresh sends `rev`; the server answers `{ "unchanged": true }` or the new rules.
- A location the rule names is removed from the club: the rule stays but never matches; the editor shows "This rule's location is no longer one of the club's."
- A member in no group: only rules for everyone match.
- Months: a rule for November to March evaluated for an hour on March 31 at 11 PM local applies; at April 1 0:00 local it does not.
- A club rule with a flow key at a location whose gauge is offline: `assess()` skips the flow rule as today (no value), and nothing is added.
- The viewer is a guardian (not rowing): no club result in the hero; the club page shows their junior's crew type in the matrix.
- Rowing away at a regatta location that is not a club location: no club rules apply. The hero line reads nothing. Coaches can add the venue as a `regular` location to bring rules along.

## 7. Water status

### 7.1 Data

| Field | Meaning |
| --- | --- |
| `state` | `open`, `restricted`, `closed` |
| `reason` | Required unless open: `high_water`, `wind`, `lightning`, `fog`, `ice`, `cold`, `debris`, `event`, `maintenance`, `dark`, `other` |
| `note` | Up to 200 chars, shown with the status |
| `allowed` | Restricted only: `{ groups: [...], boatClasses: [...], escort: "with_launch" or "any" }`. Who may still row. |
| `location` | One club location, or all of them |
| `waterF` | Optional dock water temperature reading, 28 to 100 °F |
| `startsAt`, `expiresAt` | Required. At most 30 days apart. |
| `setBy`, `setByName`, `setByRole` | Who and in what role |
| `clearedAt`, `clearedBy` | Lifted early |

The live status for a location is the newest row with `starts_at <= now < expires_at`, not cleared, for that location or for all locations. Posting a new status ends the previous live one (`replaced_by`). History is kept (16.3).

What it does to member results (`statusFor()`), for hours inside its window:

| State | Members in the allowed scope | Everyone else in the club |
| --- | --- | --- |
| `closed` | n/a | Stay off, reason `club_status` "Club water closed: high water." |
| `restricted` | No change; the banner explains | Stay off, "Club water restricted: eights and fours with a launch only." |
| `open` | No change | No change |

Decision: When no status is set, show nothing. "Open" is something a coach says on purpose, and it expires.
- Alternative: show "Open" whenever nothing else is set (implies someone checked when nobody did).

### 7.2 Who can set and lift it

- Coaches, safety officers and admins can post any state.
- A status set by a safety officer or admin can be lifted or replaced with a less strict state only by a safety officer or admin. A coach's status can be lifted by any of the three. Making it stricter is always allowed.
- At most 30 posts per club per day.
- Unverified clubs can post statuses for members; only verified clubs with `status_public` show them to the public.

### 7.3 Expiry

The sheet offers, computed in the location's time zone from `sunOn()` and `PERIODS`:

- "End of this session" (the end of the current or next period: 10 AM, 3 PM or sunset).
- "Sunset" (today's sunset).
- "Tomorrow at first light".
- "Pick a time", up to 30 days ahead.

Default: closed and restricted until sunset; open until sunset. A status running more than 24 hours shows its end date: "Closed until Sat, Oct 24, 6 PM. Ice."

### 7.4 How it shows

- Members (`#clubStatus` banner above the hero, on the club page Today tab and on the board): "Club water closed until 6 PM. High water. Set by Alex R., safety officer, 5:52 AM." Restricted: "Club water restricted until 10 AM: eights and fours with a launch only. Fog on the reach. Set by Sam, coach, 5:40 AM." Open: "Club water open. Watch for debris near the bridge. Sam, coach, 6:02 AM." The banner uses the status colors with the hatch for stay off, and says the word, so color is never the only signal.
- Public, verified clubs with `status_public`: one line under the hero and on the public club page, "Putney Rowing Club: closed to club rowing until 6 PM. High water." Notes are shown to the public only after the screen in 04 section 8.6 passes; until then the public line leaves the note out.
- Detail views: `club_status` appears as a reason in the Club rules factor for hours it covers, and the Week view lists it: "Until 6 PM: club water closed".

The sheet:

> Set club water status
>
> State: Open, Restricted, Closed
> Reason: High water, Wind, Lightning, Fog, Ice, Cold, Debris, Event, Maintenance, Dark, Other
> Who may still row (restricted): groups; boat classes; With a launch only
> Note: "Eights and fours with a launch only until the fog lifts."
> Water temperature at the dock (optional): 49 °F
> Until: End of this session (10 AM), Sunset (6:09 PM), Tomorrow at first light (6:57 AM), Pick a time
> Which location: All club locations, Putney Landing
> Tell members: switch, on
>
> [Post status]

### 7.5 Dock water temperature reading

The gauge water temperature is a downstream proxy at Putney (CLAUDE.md open items). A coach can post a reading with or without a state change (an `open` row with `waterF` and a short note). For members with club rules on, `waterTemp(m)` uses the newest club reading under 24 hours old before the gauge, and the Water fact says "49°F, dock reading by Alex R. at 6:05 AM". The public view is unchanged (04's decision that reported water temperature is information only).

Decision: Use a club dock reading under 24 hours old in place of the gauge, for that club's members only.
- Alternative: show it as information only, as 04 does for public reports.

### 7.6 Notifications

05 owns sending (05 section 3.9, kind `water_status`). From this side:

- On join, each member and guardian gets a `notify_prefs` row `kind = 'water_status'`, `club_id` set, enabled.
- `enqueueWaterStatus()` (05) runs after a post with "Tell members" on, for a new closed or restricted status, an earlier lift of one ("Water open again"), or a change of end time by more than 30 minutes. An `open` post that does not lift anything sends nothing.
- Recipients: members and guardians with the pref on, scoped by location when the status names one (members whose home locations include it).
- Copy follows 05's table, with the end time instead of "Until further notice", since every status has one: title "Putney RC: water closed", body "High water. Until 6 PM. Set by Alex R., safety officer, 5:52 AM."

## 8. The board, overdue escalation and emergency info

### 8.1 Outings for clubs (changes requested to 04)

The board is a view of 04's `outings`. 04's table needs these changes for clubs (full statement in 18.3):

- `user_id` nullable, with `CHECK (user_id IS NOT NULL OR club_id IS NOT NULL)`. A coach starting a junior eight is not one of the rowers, and most of the crew may be roster-only. `outings_one_active` stays as it is: SQLite treats NULLs as distinct in a unique index, so any number of crew outings with no `user_id` can be out at once while each account still has at most one (checked locally in SQLite 3.45.1, 2026-10-17).
- `CHECK (user_id IS NOT NULL OR float_plan = 0)`: a float plan belongs to an account.
- `boat_type` adds `2+`, `4x+`, `8x+` (classes on USRowing's own incident form) and `launch`.
- New columns: `club_id`, `created_by`, `created_via` (`self`, `staff`, `kiosk`), `device_id`, `boat_id` (phase 6), `practice_id` (phase 6), `rule_lvl`, `rule_text`, `against`, `club_stage`, `club_next_at`, `ack_by`, `ack_name`, `ack_at`, `resolved`, `checks` (phase 6).
- `outing_crew.membership_id`, with the CHECK widened to "a name, an account or a membership".
- Indexes `outings_club (club_id, status, due_at)` and `outings_club_next (club_next_at)`.

SQLite cannot make a NOT NULL column nullable with `ALTER TABLE`, so these columns belong in 04's phase 3 `CREATE TABLE`, unused until phase 5, without foreign keys to tables that do not exist yet. This is the approach 05 took for `notify_prefs.club_id`.

Decision: Create `outings` in phase 3 with the club columns already present (nullable `user_id`, no foreign keys to club tables), so phase 5 needs no table rebuild.
- Alternative: rebuild `outings` in phase 5's migration (copy, drop, rename), which risks the live table that holds active float plans.

### 8.2 Starting rows

Three ways a club outing starts:

1. A member's own Start a row (04 section 5.2). When the member belongs to a club at this location, the sheet adds "Rowing with Putney Rowing Club" (on). In phase 6 the Boat field becomes a picker of the club's available boats. The rest is 04's sheet.
2. Staff start a row for a crew, from the board ("Start a row for a crew"):

| Field | Control | Default | Rules |
| --- | --- | --- | --- |
| Boat type | Chips: 1x, 2x, 2-, 2+, 4x, 4-, 4+, 4x+, 8+, 8x+, Launch | The last used | Required |
| Boat | Text, 60 chars; in phase 6 a picker of available club boats | The last used | Out of service boats are not offered |
| Crew | One row per seat (stroke first, bow last, then cox). Each seat: pick a member (roster search, the practice's groups first) or type a name | Empty | Seats may stay empty. A member cannot be on two boats that are out. |
| With a launch | Switch, and the launch: a launch already on the board, or a driver's name | On when any crew member is a junior | |
| Practice (phase 6) | Today's practices at this location | The one running now | |
| Back by | Time, 5-minute steps, location time zone | Practice end, else now plus 90 minutes | 10 minutes to 12 hours |
| Direction, route note | As 04 | | |

Buttons: "Start", then "Start another", which keeps the launch, practice and back-by time. Crew members with accounts get 04's "add it to your log" prompt (04 section 5.5). In phase 6, "Start these boats" on a practice starts every published lineup at once.

3. The kiosk (8.5): an adult picks their own name.

Juniors starting their own rows is off by default (`settings.juniors.selfStart`). When a club turns it on, the junior's own rules still apply, so with "Juniors: launch always" a junior can only start a row with "A launch is with us" on without a warning.

### 8.3 Started against club rules

Before Start, the client evaluates the club result for the crew over the planned window, from `outAt` to `dueAt`, with `levelsFor()`:

- The crew type is the union of every crew member's groups, the boat class, and the launch switch. For a member's own row it is the member's groups.
- Clearances are checked for each crew member against the merged `requires.clearances`.
- The live water status is applied.

If any hour is Stay off, or a clearance is missing, a sheet shows before the row starts:

> Club rules say Stay off
>
> Novices, 1x without a launch, 3 to 4:30 PM: gusts to 18 mph, club limit 15.
> Sam L. has no flip test on file.
>
> You can still start this row. Putney RC safety officers will see that it started against club rules.
>
> [Go back] [Start anyway]

"Go back" has the default focus. Caution does not show a sheet; the board shows the word.

The request carries `ruleLvl` and `ruleText` ("Stay off: gusts to 18 mph, club limit 15"); the server sets `against = 1` when `ruleLvl` is 2 or the status excludes this crew. The Worker cannot recompute the forecast for each request, so it trusts the client's evaluation as a record, not as enforcement.

Safety officers get one notification per such outing (05 kind `club`, subkind `against_rule`, normal urgency, held by quiet hours): "Putney RC: row started against club rules. Sam L., 1x, 3:02 PM: gusts to 18 mph, club limit 15." After 20 in a day for one club, the rest go into one evening line: "4 more rows started against club rules today."

Decision: Warn and record when a row starts against club rules or a closed water status. Never block.
- Alternative: block the start unless a coach or safety officer approves it (stronger, but rowers who are refused simply stop logging, which is worse for safety).

### 8.4 Board views

`/club/<slug>#board`. The client polls `GET /api/clubs/:slug/board` every 30 seconds while the page is visible, and on return to the tab.

Order on the screen:

1. The water status banner (7.4) and "As of 6:41 AM".
2. On the water, sorted: escalated, overdue, due within 15 minutes, then by back-by time.
3. Back today: the last 20 finished today.
4. Needs review (staff): closed by 04's 24-hour rule without being marked back, last 7 days.
5. Emergency strip (8.7).

A row, staff view:

> Bellows Falls (8+). Junior crew of 9 with Lee M.'s launch. Out 5:52 AM. Back by 7:30 AM. **On the water**
>
> Sam L. (1x). No launch. Out 6:10 AM. Back by 7:30 AM. Started in Stay off: gusts to 18 mph, club limit 15. **Overdue 12 min** [On it] [Back] [More]

State words, always text with the color: "On the water", "Due in 10 min", "Due now", "Overdue 12 min", "Alex R. is on it", "Back 7:24 AM". Overdue rows use the stay off color with the fine hatch, as the Week bars do, so they do not rely on red and green.

What each role sees is shaped on the server (`boardRow(row, ctx)`):

| Viewer | Names | Actions |
| --- | --- | --- |
| Admin, coach, safety officer | Everyone | Back, Add time, On it, Resolve, Edit, Cancel; Start a row for a crew |
| Adult member, equipment manager | Adults by name; junior crews as "Junior crew of 9 with Lee M." | Back and Add time on boats they are in; Start a row |
| Junior | Their own rows and their crewmates | Back on their own boat if self start is on |
| Guardian | Their junior's rows, with the coach's name, no crewmates | None |
| Kiosk | Adults as first name and last initial; junior crews unnamed | Start a row (self), Back for rows started at the kiosk or by the picked member |

Empty: "No boats on the water. Start a row to put one here."

Offline: the last board is kept in `localStorage` (`rowhether-board-v1`, the last club viewed), shown with "Not updated since 6:41 AM. No connection." Actions go through 04's outbox (`src/outbox.js`).

### 8.5 Kiosk mode

A tablet or old phone at the boathouse, paired to the club, showing the board full time.

Pairing:

1. An admin opens Settings, Boathouse screens, "Add a screen": a name ("Boathouse tablet") and a location. The server creates a `club_devices` row with a 6-digit code valid 10 minutes.
2. On the device, open `/club/<slug>#kiosk` and tap "Use this device as the boathouse screen", then enter the code.
3. `POST /api/kiosk/pair` checks the code (rate limited by `CODE_LIMIT`, 5 tries a minute per IP), clears it, and sets cookie `rw_kiosk`: a 32-byte random token, `HttpOnly; Secure; SameSite=Strict; Path=/api/; Max-Age=15552000` (180 days, renewed on use). Only its SHA-256 is stored.
4. Admins see each screen with its last activity and a "Remove" button.

What a kiosk can do: read the board (kiosk view), read adult member names (first name, last initial) for the picker, start a row for a picked adult, mark back rows it started or the picked member's. What it cannot do: see staff tools, incidents, clearances (other than "missing" warnings for the picked person), contacts, settings, junior names.

Kiosk Start a row: "Who is rowing?" name picker (search, then most recent at this kiosk), then boat type, boat, crew (more names), launch switch, back by, then the against-rules sheet if needed. If the picked member has an account, `user_id` is that account: their phone gets 04's reminders, and their float plan default applies, with the line "Sam's contacts will be emailed if Sam is late." Otherwise `user_id` is NULL. Anyone at the boathouse can pick any adult name, as with a paper logbook; a member who finds a row they did not start can delete it from their log, and the board keeps an audit row with the device.

Screen: large type (body at least 20 px), the location's Now hero at the top with the club status, the board below, refreshed every 30 seconds. It asks for a screen wake lock (`navigator.wakeLock.request('screen')`) where the browser supports it (support across browsers unverified) and shows "Keep this screen plugged in" otherwise.

Limits: 5 screens per club; `KIOSK_LIMIT` 30 writes a minute per device.

Decision: Ship the kiosk in phase 5 with the board.
- Alternative: phase 6 (smaller phase 5, but the board then depends on everyone having the app on their phone at the dock).
- Alternative: no kiosk.

### 8.6 Overdue escalation for club outings

The club chain runs on `club_stage` and `club_next_at`, beside 04's personal chain (`stage`, `next_check_at`). When `user_id` is set, 04's stages 1 to 4 still go to the rower and their contacts. 04's stage 5 ("the club's safety contacts at stage 3") is replaced by this chain, which starts earlier.

| Club stage | When | Who | Channels | Message |
| --- | --- | --- | --- | --- |
| 0 | Start | Nobody | | `club_next_at = due_at + graceMin` |
| (board) | `due_at` | | Board only | "Due now" |
| 1 | `due_at + graceMin` (default 15, 5 to 60) | Safety officers (all, or those who did not mute stage 1), the staff member who started it, the practice's coaches (6) | Push; email to anyone without a working push subscription | "Overdue" |
| 2 | Stage 1 plus `escalateMin` (default 15, 5 to 60), if nobody tapped "On it" | All safety officers, all admins, the starter, guardians of junior crew members | Push and email | "Still overdue, nobody is on it", with emergency info |
| 3 | Stage 2 plus 30 minutes, if not resolved | All safety officers and admins | Push and email | "Not resolved" |
| end | `due_at + 24 h` | | | 04 closes it (`closed`); it moves to Needs review |

If the club has no active safety officer, stage 1 goes to admins and the board shows admins "Nobody has the safety officer role. Overdue alerts go to admins."

The engine: 05's every-minute tick also selects `outings WHERE club_next_at <= ?` (index `outings_club_next`) and calls `clubOverdueStep(env, outing, now)` in `worker/clubs/overdue.js`. Each step writes `notify_log` with dedupe key `overdue-club:<outing id>:<club_stage>` (kind `overdue`), advances `club_stage` and `club_next_at` in the same `env.DB.batch()`, and never sends a step twice. Quiet hours never hold these (05).

"On it" (staff): sets `ack_by`, `ack_name`, `ack_at`; stops stage 2; tells the stage 1 recipients "Alex R. is on it: Sam L., 1x, overdue since 7:45 AM."; stage 3 still fires 30 minutes after stage 2 would have, if the outing is still open.

Resolve, from More on the board (staff):

- "Back safe" (now or a time): `status = 'in'`, `in_at`, `safe_by = 'club'`, `resolved = 'back'`.
- "Safe, landed elsewhere" with a note: same, `resolved = 'safe_elsewhere'`.
- "Did not go out": `status = 'cancelled'`.
- "Record an incident": opens the incident form (9) prefilled from the outing, and resolves as `incident` with the given time when the form is saved.

Each resolve sends an all clear to everyone who got stage 1 or 2: "Sam L. is back. Marked by Alex R. at 8:02 AM." Float plan contacts get 04's all clear.

Copy (push title, then body; emails add the board link, the emergency block and the disclaimer):

| Stage | Title | Body |
| --- | --- | --- |
| 1 | "Putney RC: boat overdue" | "Sam L., 1x, was due back at Putney Landing at 7:30 AM. 15 min late. Open the board." |
| 2 | "Putney RC: boat still overdue" | "Sam L., 1x, due 7:30 AM, now 30 min late. Nobody has said they are on it. Emergency: 911. Launch address on the board." |
| 2, guardian | "Putney RC: Sam's boat is overdue" | "Bellows Falls (8+) with Lee M.'s launch was due back at 7:30 AM. The club's safety officers have been told." |
| 3 | "Putney RC: overdue boat not resolved" | "Sam L., 1x, due 7:30 AM. Alex R. has been on it since 8:01 AM. Mark it on the board when it is settled." |

Every email ends: "RoWhether is not an emergency service. It does not watch the water or call anyone."

Club settings: `overdue.graceMin` (15), `overdue.escalateMin` (15), `overdue.stage1` (`safety` or `safety_and_coaches`, default `safety`).

### 8.7 Emergency info per location

Emergency info belongs to the location, shared by every club and visitor there, as a JSON column `emergency` on 01's `locations` (change requested to 01).

```json
{
  "v": 1,
  "number": "911",
  "launchAddress": "Street address an ambulance can drive to",
  "launchNote": "Gravel ramp beside the docks. An ambulance can reach the top of the ramp.",
  "hospital": { "name": "Nearest emergency department", "address": "Its street address", "phone": "+1..." },
  "aed": "Inside the boathouse, left of the main door.",
  "signal": "Phone signal is weak on the dock. Best at the top of the ramp.",
  "vhf": null,
  "landings": [
    { "name": "Railroad bridge, VT bank", "lat": 42.98, "lon": -72.51, "address": "Road access address", "note": "Gravel bar below the bridge." }
  ],
  "checkedAt": 1792224000000,
  "checkedBy": "<user id>"
}
```

Lengths: `launchAddress` 200, `launchNote` 300, hospital fields 120 each, `aed` 200, `signal` 200, `vhf` 60, up to 10 landings with name 60, address 200, note 200. Putney's real values are to be collected on site; none are in this plan (the nearest hospital is probably in Brattleboro, unverified).

Default `number` by country: US and CA 911, GB 999, IE and EU countries 112, AU 000, NZ 111 (unverified; check before phase 7).

Who edits: steward club safety officers and admins (01 section 13.4), and site moderators. Other signed-in users suggest changes through 01's suggestions (01 section 13.2). Each change is a location revision with a required summary.

Where it shows:

- The location page "Safety" section (07 places it), for everyone.
- The board's emergency strip, the kiosk, and stage 2 overdue emails.
- The Start a row sheet, as a link "Emergency info".
- 04's status link page: request to 04 to show the launch address next to the coordinates.
- The incident form, to prefill the location.

Offline: it is part of the location record, so it is cached with the location (01's static files in phase 1 and the app's location cache after).

01's verification checklist (01 section 13.5) gains: "Emergency info checked on site: the launch address is reachable by road, and the hospital and AED details are current." When `checkedAt` is more than a year old, staff see "Emergency info last checked Oct 2025. Check it."

Location Safety section copy:

> In an emergency call 911.
> Launch address for emergency services: (address)
> Nearest hospital: (name, address, phone)
> AED: Inside the boathouse, left of the main door.
> Phone signal: weak on the dock, best at the top of the ramp.
> Landing spots with road access: Railroad bridge, VT bank: (address)
> Last checked Oct 17, 2026 by Putney Rowing Club.

Decision: Emergency info lives on the location, public, edited by steward clubs and moderators.
- Alternative: per club (every club at a shared dock keeps its own copy; copies drift apart).
- Alternative: free text in the location's launch notes (no structure for messages and the board).

## 9. Incidents and near misses

### 9.1 What is recorded

The fields follow USRowing's safety incident form (2.1) so a record can be copied across, item by item.

| Field | Control | Required | USRowing form item |
| --- | --- | --- | --- |
| When | Date and time, location time zone | Yes | Date, time |
| Where | One of the club's locations, plus "Where on the water" (200 chars) | Yes | Location |
| What kind | Injury, Damage to property, Near miss (any) | At least one | Incident type |
| Injuries | None, Medical event, Hypothermia, Heat illness, Rowing injury, First aid, Drowning, Other | With Injury | Injuries |
| Injury details | Text, 2,000 | | Injury details |
| Property | Capsize, Collision with a boat, Hit a fixed object, Swamping, Hit a submerged object, Grounding, Equipment failure, Trailer, Vehicle, Other | With Damage | Property issues |
| Boats | 1x, 2x, 2-, 2+, 4x, 4-, 4+, 4x+, 8+, 8x+, Launch, Another vessel, Other; in phase 6 also a club boat | | Boat type |
| Program | Middle school, High school, College or under 23, Adult or masters, Adaptive, Learn to row, Novice, Other | | Rowing category |
| Was weather a factor | Yes, No | Yes | Weather a factor |
| Conditions | Air °F, water °F, wind (Light or variable, 5 to 10 mph, 11 to 15 mph, 16 to 20 mph, 21 mph or more, Strong sudden gust), rain (None, Light rain, Steady rain, Hard rain, Hail, Sleet, Snow), current (None, Slow, Medium, Fast), lightning (None, 11 miles or more, 6 to 10 miles, 2 to 5 miles, Nearby) | | Weather conditions |
| What happened | Text, 20 to 4,000 | Yes | Narrative |
| People involved | Up to 20: a member or a name, role (rower, cox, coach, other), minor, injured | | |
| Witnesses | Up to 4: name, phone or email | | Witnesses |
| What was done | Text, 2,000 | | |
| How to stop it happening again | Text, 2,000 | | |
| Linked row | The outing, when started from the board | | |
| Severity (staff) | Near miss, Minor, Moderate, Serious | | |

Conditions are prefilled from the app, labeled "From the RoWhether forecast for 7:40 AM. Change anything that was different.": for an incident linked to an outing, from the outing's `snap` (04 section 5.4); otherwise from the model hour nearest the incident time when it is inside the loaded hours. Wind band from `h.wind`, "Strong sudden gust" when gusts exceed wind by 10 mph or more, rain from the weather code, air from `h.temp`, water from `waterTemp(m)`. The raw values are kept in `conditions.fromApp` (`{ mt, w, g, d, T, wt, q, lvl }`) so the record shows what the forecast said and what the person said.

At the top of the form:

> This log is for on-water safety: injuries, damage and near misses. For abuse, harassment or misconduct, do not use this form. In the US, report sexual misconduct to the U.S. Center for SafeSport and other misconduct on USRowing's safeguarding form.

Both links as in 2.1.

### 9.2 Flow

1. "Record an incident" on the club Safety tab, in the board's More menu, or from Resolve (8.6). Members, guardians and staff can file; juniors cannot (5.2).
2. The form saves a draft in `localStorage` (`rowhether-incident-draft-v1`) as it is typed, because docks have poor signal; Send goes through 04's outbox.
3. On save: `status = 'submitted'`. Safety officers and admins get a notification with no details (05 kind `club`, subkind `incident`): "Putney RC: incident recorded. Capsize, Oct 17, 7:40 AM. Open the safety log."
4. Guardians of minors named in People get: "Putney RC recorded an incident involving Sam on Oct 17 (capsize). The club's safety officers have the details." They can see the type and date, not the record.
5. A safety officer reviews: sets severity, edits, adds what was done and how to prevent it, sets `reviewed`, then `closed` when follow-up is done.
6. National reporting (US clubs):

> Report it to USRowing
>
> USRowing asks clubs to report rowing safety incidents, including near misses, on its form. The summary below follows the form's order so you can copy it across.
>
> [Open the USRowing form] [Copy summary] [Mark as filed]

"Mark as filed" asks for the date and an optional reference, setting `national = 'filed'`. "Not needed" is also offered. For GB clubs (phase 7) the panel points to British Rowing's incident reporting system and its 24-hour guidance. Elsewhere: "Report it to your national or state rowing body if it asks for reports."

7. Lessons: a safety officer can write a summary without names (1,000 chars) and share it with all members and guardians on the Safety tab: "Near miss, Oct 17: a single hit the old piling below the railroad bridge at low water. Keep to the channel shown in the traffic pattern." When the cause is a fixed object, a button "Post it as a hazard" opens 04's hazard sheet prefilled.

### 9.3 Privacy, export and retention

- Who sees records: safety officers and admins (all), the person who filed (their own). Every view by staff writes `audit_log` `incident.view`.
- Push and email never contain the narrative, injuries or names.
- Export (safety officers and admins): CSV of all incidents in a date range in the USRowing form's order, using the form's own labels for choices; "Include names" is off by default, which replaces names with roles ("Rower 1, Cox"). A printable page per incident for the club's files (USRowing asks clubs to keep a copy).
- Account deletion (03): `reported_by` becomes NULL; the names written in the record stay as part of the club's safety records.

Decision: Keep incident records, names included, until the club deletes them or the club is deleted; 03 states the legal basis in the privacy policy.
- Alternative: replace names with "Former member" when a person deletes their account (better for privacy, worse for insurance claims and follow-up).
- Alternative: delete incidents after a fixed period such as 7 years (unverified whether that meets liability periods for minors; 03 decides).
