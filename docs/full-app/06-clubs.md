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

03 settled the safeguarding outline (08 K48): rowers aged 13 to 17 may hold accounts without a guardian, with 03 11.3's junior defaults; children under 13 do not hold accounts; and joining a club as a junior needs a linked guardian (03 11.5) to approve, as below.

- A junior with an account joins only by an invite with the `junior` preset. Their membership is `pending_guardian` until one linked guardian (03) approves in their own account: "Sam wants to join Putney Rowing Club as a junior. Approve?" Approval also makes the guardian a club guardian of Sam (kind `guardian` unless they already have a membership). If the guardian declines, the membership is `declined`.
- A guardian joins by a guardian invite made for a specific junior (`guardianOf`), or automatically when their linked junior joins. A junior has at most 4 guardians in a club.
- Junior memberships always have club rules on (`rules_on = 1`, enforced by a CHECK).
- At 18 (from 03's `junior_until`, checked by the daily run; for roster-only juniors, staff change the kind), the kind becomes `adult`, `club_guardians` rows for them are removed, and both sides are told: "Sam is now an adult member of Putney Rowing Club. Guardians no longer see Sam's club schedule."
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
- `#rowAs` (07 8.4 shares this line with personal limit sets; 08 K44) inside the hero above the verdict, small: whose rules and which crew type, with "Change".
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

Crew types come from `crewTypes(rules, groups)`: each enabled rule with a group, class or escort scope gives one row labeled by its scope, deduplicated; classes in a list use the first class as the example ("1x" for `["1x", "2x"]`, labeled "1x, 2x"). At most 12 rows. Below 46 rem each crew type is its own panel instead of a table row, so nothing scrolls sideways at 360 px (07 5.8; 08 K63). The table is computed client-side with `levelsFor(m, ctx)`, which reruns `assess()` on the existing hours with each crew type's settings. No extra fetch. At 168 hours and 12 crew types this is about 2,000 `assess()` calls (estimate; measure in the benchmark 05 plans).

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
  - `buildModel(loc, data, S, now, { club })` (08 K14). With `club`, sets `m.club = { ctx, rules, statuses, clearances, dockWater, settingsAt, mergedAt }`. Without it, nothing changes (a snapshot test proves Putney output is identical).
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
3. `POST /api/kiosk/pair` checks the code (rate limited by `JOIN_CODE_LIMIT`, 5 tries a minute per IP; 22.6), clears it, and sets cookie `rw_kiosk`: a 32-byte random token, `HttpOnly; Secure; SameSite=Strict; Path=/api/; Max-Age=15552000` (180 days, renewed on use). Only its SHA-256 is stored.
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

The engine: 05's every-minute tick also selects `outings WHERE club_next_at <= ?` (index `outings_club_next`) and calls `clubOverdueStep(env, outing, now)` in `worker/clubs/overdue.js`. Each step writes one `notify_log` row per recipient with dedupe key `odc:<outing id>:<stage>:<user id>` (kind `overdue`; 21.4, 08 K16), advances `club_stage` and `club_next_at` in the same `env.DB.batch()`, and never sends a step twice. Quiet hours never hold these (05).

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

## 10. Boats, damage reports and safety checks (phase 6)

### 10.1 Registry

| Field | Rules | Example |
| --- | --- | --- |
| Kind | `shell`, `launch`, `oars`, `other` | `shell` |
| Name | 1 to 40, unique in the club among boats that are not retired | Bellows Falls |
| Class | Shells: 1x, 2x, 2-, 2+, 4x, 4-, 4+, 4x+, 8+, 8x+ | 8+ |
| Rig | `scull`, `sweep`, `convertible` | `sweep` |
| Rigging | `{ stroke: "port" or "starboard", sides: ["p", "s", ...] per seat from bow for bucket rigs, cox: "stern" or "bow" }` | `{ "stroke": "port", "cox": "stern" }` |
| Crew weight range | kg, 20 to 150, min not above max; shown in the viewer's units (07) | 75 to 90 kg |
| Maker, model, year, hull id, color | Up to 40, 40, 1950 to 2100, 40, 30 | |
| Specs | Launches: `{ capacity, engineHp, registration, killCord }`. Oars: `{ blade, lengthCm, pairs }`. | `{ "capacity": 6, "killCord": true }` |
| Where | A club location and a rack label (20 chars) | Putney Landing, rack B3 |
| Status | `available`, `restricted`, `out_of_service`, `retired` | `available` |
| Status note | 200 | "Out of service: cracked rigger on 3 seat. Back about Oct 24." |
| Restricted to | `{ groups: [...], clearances: [...] }`, for `restricted` | Masters with `solo` |
| Bookable, needs approval | Switches | on, off |
| Private owner | A membership, for a private boat racked at the club. Not bookable by others; shows on the board by name. | |
| Notes | 500 | |

The Boats tab lists boats by class, with status words ("Out of service", "Restricted: Masters cleared to row alone") and open damage counts. A boat page shows its details, open and past damage reports, the next 7 days of bookings and practice reservations, and its last 20 outings (date, crew type, time out).

### 10.2 Damage reports and out of service

The sheet, from a boat page, the board ("Report damage" in More) or after I'm back:

> Report damage to Bellows Falls
>
> How bad: Cosmetic, Rowable but needs fixing, Not safe to row
> Where: Hull, Rigger, Oarlock or gate, Seat, Slide, Foot stretcher, Heel ties, Fin, Rudder or steering, Bow ball, Oar, Other
> What happened (adults only, 1,000 characters): "Rigger on 3 seat cracked at the backstay after hitting the dock."
>
> [Send]

Effects:

- `unsafe` sets the boat `out_of_service` at once with the note "Reported not safe to row by Sam L., Oct 17." Future bookings of the boat are cancelled (`out_of_service`) and the members told: "Bellows Falls is out of service. Your booking for Sat 7 AM was cancelled. 2 other 8+ boats are free then." Practices with the boat reserved and lineups using it show a warning to their coaches.
- `rowable` keeps the status and shows the report on the boat page and in pickers: "Rowable damage: rigger nut loose on 3 seat."
- Equipment managers (or admins when there are none) get a notification (05 kind `club`, subkind `damage`): "Putney RC: Bellows Falls reported not safe to row. Rigger, Oct 17."
- Equipment managers move reports through `open`, `in_repair`, `fixed`, `wont_fix`, `duplicate`, with a resolution note. "Mark the boat back in service" sets `available` and closes linked open reports as `fixed`.
- Coaches, safety officers and equipment managers can set a boat out of service by hand, with a note and an optional "Back about" date.

### 10.3 Launch and shell checks

Club setting `checks`: `off`, `show` (default) or `ask`.

- `show`: Start a row shows the relevant list as a reminder card.
- `ask`: each item is a tick; the result is stored in `outings.checks` as `{ "done": [...], "skipped": [...] }`, and staff see "Checks: 8 of 9 (no VHF radio)" on the board. Never blocking.

Launch list (USRowing, 2.1): PFDs for every rower and cox in your care; everyone in the launch wearing a PFD; paddle; waterproof first aid kit; emergency blankets; throwable PFD; horn or whistle; kill cord worn; VHF radio (coastal water only, shown when the location's water type is `tidal` or `harbor`).

Shell list (USRowing, 2.1): rigging nuts tight; foot stretchers and slide checked; heel ties in good condition; bow ball on; lights (shown only when the row starts or ends outside sunrise to sunset); PFD in the boat if no launch; phone in a waterproof case; water.

## 11. Booking (phase 6)

### 11.1 Settings

`settings.booking` (16.1): `enabled` (off), `slotMin` (30; 15 or 30), `minMin` (30), `maxMin` (180; up to 720), `advanceDays` (7; 1 to 30), `maxActive` (3; 1 to 10 future bookings per member), `approval` (`none`, `flagged` for boats with "needs approval", or `all`; default `flagged`), `noShowMin` (20; 10 to 60), `juniorsCanBook` (off).

### 11.2 Rules

- Start and end on `slotMin` boundaries in the location's time zone; length from `minMin` to `maxMin`; start within `advanceDays`.
- The boat must be bookable and `available` or `restricted`; for `restricted`, the member must be in one of its groups and hold its clearances.
- Pending bookings hold the slot, so two people cannot request the same time.
- Conflicts are checked in the insert itself, one statement, so two phones cannot double-book:

```sql
INSERT INTO bookings (id, club_id, boat_id, membership_id, starts_at, ends_at, status, note, created_at, updated_at)
SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9
WHERE NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE boat_id = ?3 AND status IN ('pending', 'confirmed') AND starts_at < ?6 AND ends_at > ?5)
  AND EXISTS (
    SELECT 1 FROM boats
    WHERE id = ?3 AND bookable = 1 AND status IN ('available', 'restricted'));
```

`meta.changes = 0` returns 409 `slot_taken` "Bellows was just booked for part of that time. Pick another time or boat." Back-to-back bookings (one ends at 8:00, the next starts at 8:00) are allowed. Checked locally in SQLite 3.45.1: overlap refused, back-to-back accepted, and the query plan uses `bookings_boat` (2026-10-17, not on D1).

- The member's limit (`maxActive`) is counted in the same batch before the insert.
- When the slot is Stay off by the member's club rules, the sheet warns but allows it: "Club rules say Stay off then: gusts to 19 mph. The forecast may change. Book anyway?"

### 11.3 Approval, cancellation and no-shows

- `pending` bookings go to equipment managers and admins (05 kind `club`, subkind `booking`). Approve or decline with an optional note. A pending booking still undecided at its start time is declined automatically.
- Members cancel any time before the start. Staff cancel with a reason, and the member is told.
- A booking is `used` when the member starts a row with that boat from 30 minutes before the start to the end; `bookings.outing_id` links them.
- A booking not used by `start + noShowMin` becomes `no_show` and frees the boat (the every-minute tick, using index `bookings_boat`). Equipment managers see no-show counts per member for the last 90 days. No automatic penalty.

### 11.4 Practices and bumping

A practice can reserve boats: the coach picks them in the practice sheet, which creates `bookings` rows with `practice_id` and status `confirmed`. When a boat is already booked by a member, the coach sees "Bellows is booked by Sam L., 7 to 8 AM." and chooses another boat or "Take it for practice". Taking it cancels the member's booking (`practice`) and tells them: "Your booking of Bellows on Sat 7 AM was cancelled for Junior practice. 2 other singles are free then. [Book another]" Taking a booking that starts within 12 hours needs the equipment manager or admin role.

Decision: Coaches can take a member's booking for a practice, with notice to the member, and only equipment managers or admins can do so within 12 hours of the start.
- Alternative: member bookings always win; practices pick other boats.
- Alternative: practices always win with no time limit.

### 11.5 Booking from Plan a row

The Week view's Plan a row (`planSessions(m, minutes, when)` in `src/logic.js`) already ranks the calmest Go sessions. For a member with club rules on, `m` carries the club rules, so the sessions are Go by the club's rules. When booking is enabled for a club at this location, each session gets "Book a boat":

> Book a boat
>
> Saturday, Oct 24, 7:00 to 8:30 AM
> Forecast for you: Go. Wind 2 to 5 mph, flat water.
>
> Boats free then (1x): Bellows, Hudson single, Vespoli 2018
> Show other classes
>
> Note (optional, 120 characters)
>
> [Book]

The list comes from `GET /api/clubs/:slug/availability?start=&end=&class=`, filtered to boats the member may use, with the member's `row_as` class first. Session times from `planSessions()` are on half hours, so they fit a 30-minute slot grid; with a 15-minute grid they fit too. After booking: "Booked Bellows for Saturday 7:00 to 8:30 AM." and the session row shows "Booked: Bellows". The booking appears in the member's calendar feed (14).

## 12. Practices, RSVP and attendance (phase 6)

### 12.1 Schedule and recurrence

The practice sheet:

| Field | Control | Rules |
| --- | --- | --- |
| Title | Text | 2 to 60. "Junior practice" |
| Kind | On the water, Land or erg, Race, Learn to row, Other | |
| Groups | Multi-select | At least one, or "Everyone" |
| Coaches | Staff picker | Up to 10 |
| Location | The club's locations | |
| Date, start time, length | Pickers in the location's time zone | 15 minutes to 8 hours |
| Meet | 0 to 120 minutes before the start | "Meet 5:30 AM" |
| With a launch | Switch | On for water practices |
| Repeat | Does not repeat; Weekly on (day chips); Every 2 weeks on (day chips) | |
| Until | Date | Required when repeating; at most 366 days and 400 practices |
| Boats to reserve | Club boats | 11.4 |
| RSVP by | Evening before at 8 PM; 3 hours before; No deadline | |
| Notes | Text, 500 | Visible to everyone in the practice and their guardians |
| Public | Switch, Learn to row and Other only | Shown on the public page and public calendar, with a sign-up link |

Recurrence is a strict subset of RFC 5545 RRULE: `FREQ=WEEKLY;INTERVAL=1` or `2`, `BYDAY` with 1 to 7 days, and an end date kept in `until_date`. `expandSeries(series, tz)` in a new pure module `src/schedule.js` (shared with the Worker) creates every occurrence at the local start time on each matching date, so a 5:45 AM practice stays at 5:45 AM across the daylight saving change: Tuesday Oct 20, 2026 is 09:45 UTC and Monday Nov 2, 2026 is 10:45 UTC (computed with the IANA zone, 2026-10-17). Occurrences are written as `practices` rows when the series is saved; dates already past are skipped.

Edits ask "This practice" or "This and following":

- This practice: changes the row and sets `detached = 1`, so later series edits leave it alone.
- This and following: changes in time, title, groups, coaches, notes or launch update the non-detached future rows in place, keeping their ids, RSVPs and lineups. A change of weekdays or interval ends the old series the day before and creates a new one: future rows with no RSVPs or lineups are deleted, the rest are cancelled with "Moved to the new schedule" and their people told.
- Delete a series: the same rule for future rows.

Every change that shows in a calendar adds 1 to `sequence`.

Cancel: `status = 'cancelled'` with a reason (200 chars). Move to land: `status = 'land'` with what to do instead: "Erg in the boathouse: 3 x 15 min at 20 spm." Both notify members, guardians and coaches through 05's `practice` kind (05 section 3.10).

### 12.2 Practice outlook and the evening decision

Each practice in the forecast window (7 days) shows the club result for its crew type (the practice's groups, its boats' classes or the most common class among them, and its launch switch), with the worst stretch:

> Junior practice, Tue 5:45 to 7:30 AM. Juniors, 8+ with a launch: Go until 6:30 AM, then Caution: gusts to 19 mph.

Evening decision: at `settings.practice.decideAt` (default 19:45 local), for each practice starting in the next 18 hours, the Worker builds the location's model with 05's server-side data (`loadLocationData()`, 05 section 5.3), applies the club rules for the practice's crew type with `levelsFor()`, and takes the worst level in the practice window.

- Stay off: push to the practice's coaches (all coaches if none listed), 05 kind `club`, subkind `practice_check`, normal urgency, not held (the coach chose this time): "Putney RC: tomorrow's 5:45 AM practice looks like Stay off. Juniors 8+ with a launch: gusts to 24 mph. Keep it, move it to land, or cancel?"
- Caution: "Putney RC: tomorrow's 5:45 AM practice looks like Caution: gusts to 19 mph after 6:30 AM."
- Go: nothing, unless the club turns on "Tell coaches when it looks like Go too".

The notification opens the practice with three buttons: "Keep on the water", "Move to land", "Cancel practice". The choice sets `decided_at` and, for land or cancel, notifies members. The app never cancels a practice by itself.

### 12.3 RSVP

- Yes, No, Maybe. No asks a reason: School, Work, Sick, Injured, Travel, Other.
- Adults and guardians may add a note up to 100 characters ("Back from travel Wednesday"). Juniors cannot (5.2).
- Guardians answer for their junior; the record keeps who answered.
- After the RSVP deadline, changes are allowed and marked late: coaches see "Changed to No at 9:40 PM, after the deadline."
- Coaches see counts by group ("Yes 14, Maybe 2, No 3, No answer 5") and the list. Members see their own answer and the count.
- Optional reminder 2 hours before the deadline to people who have not answered (setting, off by default).

### 12.4 Attendance

- After the start, coaches mark each expected person (members of the practice's groups, plus anyone who answered): Present, Late, Absent, Excused.
- "Fill from RSVPs" sets yes to present and no to excused. "Fill from the board" marks crew of outings linked to the practice as present.
- Marks lock 14 days after the practice; admins can still edit.
- Reports: per member over a date range, attended (present or late) out of practices marked, excused not counted. CSV export.

## 13. Lineups (phase 6)

The editor, from a practice ("Lineups", "Add a boat"):

- Name (defaults to the boat name), boat (available club boats), class (from the boat).
- Seats from the class, listed in boat order: Cox (coxed classes), 8 (stroke), 7, down to 1 (bow). Seat 0 is the cox in `lineup_seats`. Sides show when the boat's rigging is known: "8 (stroke), port".
- The picker lists people who answered Yes first, then Maybe, then no answer; No answers are grey with "Said no". Tap a person, then a seat. Guests by name (40 chars).

Checks:

| Check | Level |
| --- | --- |
| Seats do not match the class | Error, cannot publish |
| One person in two seats of one lineup | Error |
| One person in two lineups at the same practice | Warning |
| Person answered No | Warning |
| Boat out of service, or not reserved and booked by someone else | Warning |
| Club rules need a clearance someone lacks (`flip_test` in a 1x, `cox` in the cox seat) | Warning |

"Publish lineups" publishes every draft at the practice. Notifications (05 kind `club`, subkind `lineup`) go to each seated person with an account and to guardians of seated juniors: "Putney RC: lineups for Tue 5:45 AM. You are 6 seat in Bellows Falls (8+)." Editing a published lineup and publishing again notifies only people whose seat changed ("Your seat changed: now 5 seat in Bellows Falls (8+).") or who were removed ("You are no longer in a lineup for Tue 5:45 AM.").

Visible to: staff; everyone in the practice's groups; guardians of juniors in those groups. Drafts are staff only.

"Start these boats" on the board (8.2) starts every published lineup at the practice as outings with crew from the seats, the practice's launch switch and back-by at the practice end.

## 14. Calendar feeds (phase 6)

### 14.1 Personal feed

Account, Calendar, "Add practices to your calendar":

> Add practices to your calendar
>
> Subscribe once and your club practices, seats and boat bookings appear in your calendar app. Calendar apps check for changes on their own schedule, from minutes to about a day, so notifications are still the fastest way to hear about a cancellation.
>
> [Copy link] [Open in Apple Calendar]
>
> Anyone with this link can see your practice times and seats. If you share it by mistake, stop it and make a new one.

- Token: 32 random bytes in base64url (43 characters). Only its SHA-256 is stored. Up to 5 per user, each for all clubs or one club, with a label. "Stop this link" revokes it.
- Links: `https://rowhether.com/api/cal/<token>.ics` and the same with `webcal://` for "Open in Apple Calendar". Under `/api/`, so `run_worker_first` already routes it and the service worker never handles it (CLAUDE.md).
- Content, from 14 days ago to 120 days ahead, at most 500 events: practices for the user's groups (guardians get their junior's, titled "Sam: Junior practice"), with "Cancelled" (`STATUS:CANCELLED`) or "Land: " prefixes; the user's own published seat in the description; their bookings. No other person's name ever appears.

### 14.2 Format

RFC 5545 with UTC times (form 2 of DATE-TIME), so no VTIMEZONE block is needed; CRLF line ends; lines folded at 75 octets (RFC 5545 section 3.1: "Lines of text SHOULD NOT be longer than 75 octets", verified by reading the RFC 2026-10-17); commas, semicolons, backslashes and newlines escaped in text values. `REFRESH-INTERVAL;VALUE=DURATION:PT1H` is RFC 7986's "suggested minimum interval for polling" (verified by reading RFC 7986 section 5.7, 2026-10-17); `X-PUBLISHED-TTL:PT1H` is a non-standard hint some clients read (unverified which). Google Calendar refreshes subscribed URLs on its own schedule, reported as up to 12 to 24 hours, with no manual refresh (from search results, unverified).

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//RoWhether//Club calendar//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Putney Rowing Club
REFRESH-INTERVAL;VALUE=DURATION:PT1H
X-PUBLISHED-TTL:PT1H
BEGIN:VEVENT
UID:practice-5b1c2e3f-0a9b-4c8d-8e7f-6a5b4c3d2e1f@rowhether.com
DTSTAMP:20261017T120000Z
DTSTART:20261020T094500Z
DTEND:20261020T113000Z
SEQUENCE:0
SUMMARY:Junior practice
LOCATION:Putney Landing\, Putney\, VT
DESCRIPTION:Meet 5:30 AM. You are 6 seat in Bellows Falls (8+).\nhttps://ro
 whether.com/club/putney-rowing-club#schedule/2026-10-20
STATUS:CONFIRMED
URL:https://rowhether.com/club/putney-rowing-club#schedule/2026-10-20
END:VEVENT
END:VCALENDAR
```

5:45 to 7:30 AM Eastern on Oct 20, 2026 is 09:45 to 11:30 UTC.

`worker/clubs/calendar.js`: `icsEscape()`, `icsFold()`, `icsEvent()`, `buildFeed()`, all pure and tested. Headers: `Content-Type: text/calendar; charset=utf-8`, `Cache-Control: private, max-age=900`, an `ETag` from a hash of the body, and 304 on `If-None-Match`. Rate limit `CAL_LIMIT`, 10 a minute per token. An unknown or revoked token returns 404 with no hint. `last_used_at` is updated at most once an hour.

### 14.3 Public club calendar

`GET /api/clubs/:slug/public.ics`: public practices of verified clubs only, no token, `Cache-Control: public, max-age=900`. Linked from the public club page.

## 15. Announcements (phase 6)

- Written by coaches, safety officers and admins. Title 2 to 80 characters, body 1 to 1,000 characters of plain text (https links become links), audience (groups or everyone), "Pin until" (up to 30 days), "Send a notification" (on).
- Shown on the club Today tab, pinned first, then the last 30 days, to the audience, guardians of juniors in the audience, and all staff (5.2).
- No replies, no reactions, no per-person read receipts.
- Notification: 05 kind `club`, subkind `announcement`, normal urgency, held by quiet hours: title "Putney RC: Regatta van Saturday", body the first 160 characters.
- At most 10 a day per club. The author or an admin can delete one.
- Not screened, since only members see it. Members can report a club to site moderators with a flag (target `club`, 04 section 8.5).

Example: "Regatta van leaves at 6 AM Saturday. Juniors: bring your uniform and a warm layer. Parents: pickup at 4 PM at the boathouse."

## 16. Club settings, export and retention

### 16.1 Settings

`clubs.settings`, JSON, validated by `cleanSettings()` in `worker/clubs/clubs.js`:

```json
{
  "overdue": { "graceMin": 15, "escalateMin": 15, "stage1": "safety" },
  "juniors": { "selfStart": false, "canBook": false },
  "board": { "pollSec": 30 },
  "checks": "show",
  "booking": { "enabled": false, "slotMin": 30, "minMin": 30, "maxMin": 180, "advanceDays": 7,
               "maxActive": 3, "approval": "flagged", "noShowMin": 20 },
  "practice": { "decideAt": "19:45", "decideGo": false, "rsvpReminder": false }
}
```

| Key | Range |
| --- | --- |
| `overdue.graceMin`, `overdue.escalateMin` | 5 to 60 |
| `overdue.stage1` | `safety`, `safety_and_coaches` |
| `board.pollSec` | 15 to 120 |
| `checks` | `off`, `show`, `ask` |
| `booking.*` | 11.1 |
| `practice.decideAt` | `HH:MM`, 17:00 to 22:00 local |

### 16.2 Export

- `GET /api/clubs/:slug/export` (admins): one JSON file, `putney-rowing-club-2026-10-17.json`, with the club, locations, groups, members (names, kinds, roles, groups, clearances, join and end dates), rules, water status history, boats, damage reports, bookings, practices, attendance, lineups and announcements. Incidents only with `?incidents=1` (admins who are also safety officers, or safety officers). No contact details, no account emails.
- `GET /api/clubs/:slug/export.csv?table=members` for one table at a time: `members`, `rules`, `status`, `boats`, `damage`, `bookings`, `practices`, `attendance`, `lineups`, `incidents`, `outings`.
- At most 5 exports a day per club; each writes `audit_log` `export.download`.
- Every member can export their own data through 03's account export, which includes their memberships, RSVPs, attendance and seats.

### 16.3 Retention

The daily run (05's `17 9 * * *` cron) applies these. 03 owns the privacy policy text that states them.

| Data | Kept | Then |
| --- | --- | --- |
| Water status history | 3 years | Deleted |
| Club entries in `audit_log` | 2 years | Deleted |
| Invites, expired or revoked | 30 days | Deleted |
| Declined join requests | 90 days | Deleted |
| Ended memberships | While the club exists | Name becomes "Former member" when the account is deleted |
| Practices, attendance, lineups | While the club exists | |
| Bookings | 2 years after they end | Deleted |
| Damage reports, fixed or closed | 3 years | Deleted |
| Incidents | Until the club deletes them (9.3) | |
| Kiosk devices and calendar tokens, revoked | 30 days | Deleted |
| Announcements, not pinned | 1 year | Deleted |
| Club columns on outings | With the outing (04) | Cleared when the club is deleted |

## 17. Limits

| Item | Limit |
| --- | --- |
| Clubs created per user | 3 not deleted; 1 a day |
| Live memberships per user | 10 |
| Active members per club | 100 while unverified; 2,000 verified (above that, ask the owner) |
| Locations per club | 10 |
| Groups per club, groups per member | 30, 10 |
| Rules per club | 40 |
| Active invites per club | 50 |
| Invite uses | 1 to 500 |
| Invite expiry | Links and codes up to 90 days; personal up to 14; staff roles 7 |
| Code tries | 5 a minute per IP (`JOIN_CODE_LIMIT`), 20 a day per account |
| Join requests | 5 pending per user, 1 per club, 30 days after a decline |
| Guardians per junior | 4 |
| Water status posts | 30 a day per club; at most 30 days long |
| Kiosk screens | 5 per club |
| Boats | 500 per club |
| Bookings | `maxActive` (3; up to 10) future per member |
| Practice series | 400 practices each, until at most 366 days ahead |
| Lineups per practice | 30 |
| Announcements | 10 a day per club |
| Calendar links | 5 per user |
| Incidents, damage reports | 20 a day per user each |
| Exports | 5 a day per club |
| Text | As in each section; the schema CHECKs repeat them |

New rate limit bindings, with separate namespace ids for production and Previews as `wrangler.jsonc` does today (08 assigns ids; periods can only be 10 or 60 seconds, from docs, https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/):

| Binding | Limit per 60 s | Key |
| --- | --- | --- |
| `CLUB_LIMIT` | 30 | user id, for club writes |
| `JOIN_CODE_LIMIT` (22.6) | 5 | IP, for invite codes and kiosk pairing |
| `KIOSK_LIMIT` | 30 | device id |
| `CAL_LIMIT` | 10 | token hash |

## 18. Schema

Proposals for 08-architecture.md, which owns migration numbering and the canonical schema. They follow `migrations/0001_reports.sql` and the shared conventions: TEXT ids from `crypto.randomUUID()`, slugs for clubs, INTEGER ms times. `users` is 03's, `locations` 01's, `outings` and `outing_crew` 04's. D1 enforces foreign keys by default (from docs, https://developers.cloudflare.com/d1/sql-api/foreign-keys/: "By default, D1 enforces that foreign key constraints are valid within all queries and migrations"), so the ON DELETE actions below do the cleanup the text describes.

These statements ran cleanly in SQLite 3.45.1 with `PRAGMA foreign_keys = ON` after stand-ins for `users`, `locations` and the changed `outings` (18.3), and the CHECKs refused what they should: a reserved club slug, a staff role on a junior, club rules off for a junior, a second live membership for one account, a closed status with no reason, a status over 30 days, a published lineup with no time, and an overlapping booking (verified live 2026-10-17, local SQLite, not D1).

Column notes:

- `memberships.row_as`: `{ "boatClass": "1x", "escort": false }`.
- `memberships.clearances`: 4.8.
- `club_rules.boat_classes` and `months`: JSON arrays; NULL means all. `limits` and `requires`: 6.2 and 6.3.
- `water_status.allowed`: `{ "groups": [ids], "boatClasses": [...], "escort": "with_launch" | "any" }`.
- `invites.preset`: `{ "kind": "adult", "roles": ["coach"], "groups": [ids], "forMembership": id, "guardianOf": id }`.
- `incidents.conditions`: `{ "airF", "waterF", "wind", "rain", "current", "lightning", "fromApp": { ... } }`. `people`: `[{ "membershipId", "name", "role", "minor", "injured" }]`. `witnesses`: `[{ "name", "contact" }]`.
- `lineup_seats.seat`: 0 is the cox, 1 bow, up to 8.
- `practices.group_ids`, `coach_ids`, `announcements.group_ids`: JSON arrays of ids. Practices are fetched by `(club_id, starts_at)` and filtered in the Worker; a club has a few hundred practices in any 4-month window, so no join table is needed.

### 18.1 Phase 5

```sql
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
  location_id TEXT REFERENCES locations(id),
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

`incidents.outing_id` and `boat_id` have no foreign keys: `boats` arrives in phase 6, and an incident must outlive a deleted outing. `worker/clubs/incidents.js` checks they belong to the club.

### 18.2 Phase 6

```sql
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
```

### 18.3 Changes to other documents' tables

04's `outings` and `outing_crew` as they should be created in phase 3 (8.1), with the club columns present and unused until phase 5:

```sql
CREATE TABLE outings (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,          -- 06: NULL for a club crew with no account holder
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
  -- 06 columns, created in phase 3 and unused until phase 5 (no foreign keys to tables that do not exist yet)
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
CREATE UNIQUE INDEX outings_client ON outings (user_id, client_id) WHERE client_id IS NOT NULL;
CREATE UNIQUE INDEX outings_one_active ON outings (user_id) WHERE status = 'out';
CREATE INDEX outings_next_check ON outings (next_check_at) WHERE next_check_at IS NOT NULL;
CREATE INDEX outings_loc_out ON outings (location_id, out_at) WHERE status = 'out';
CREATE INDEX outings_user_log ON outings (user_id, out_at);
CREATE INDEX outings_club ON outings (club_id, status, due_at) WHERE club_id IS NOT NULL;
CREATE INDEX outings_club_next ON outings (club_next_at) WHERE club_next_at IS NOT NULL;

CREATE TABLE outing_crew (
  outing_id TEXT NOT NULL REFERENCES outings(id) ON DELETE CASCADE,
  seat INTEGER NOT NULL CHECK (seat BETWEEN 1 AND 9),
  role TEXT NOT NULL DEFAULT 'rower' CHECK (role IN ('rower', 'cox')),
  name TEXT CHECK (name IS NULL OR length(name) BETWEEN 1 AND 60),
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  membership_id TEXT,                                            -- 06, phase 5
  accepted INTEGER CHECK (accepted IS NULL OR accepted IN (0, 1)),
  PRIMARY KEY (outing_id, seat),
  CHECK (name IS NOT NULL OR user_id IS NOT NULL OR membership_id IS NOT NULL)
);
CREATE INDEX outing_crew_user ON outing_crew (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX outing_crew_member ON outing_crew (membership_id) WHERE membership_id IS NOT NULL;
```

01's `locations` holds the emergency info (8.7) in an `emergency` column, `TEXT CHECK (emergency IS NULL OR (json_valid(emergency) AND length(emergency) <= 6000))`, which 08's `0003` creates in phase 3, because 07 shows the Safety section from phase 3 (08 K13). No `ALTER` is needed.

04 adds `reports.club_id` and `hazards.club_id` in phase 5 (04 section 9); nothing more is needed here.

05's `notify_prefs.kind` and `notify_log.kind` gain `club` (section 21). Because SQLite cannot change a CHECK in place, 08's `0008` creates these tables in phase 3 with `club` already in the lists, unused until phase 5, the same approach as 8.1 (08 K19).

`audit_log` is 08's table. Club actions written to it: `club.create`, `club.update`, `club.verify`, `club.verify.reject`, `club.suspend`, `club.delete.request`, `club.delete.cancel`, `club.delete.done`, `member.approve`, `member.decline`, `member.remove`, `member.block`, `member.roles`, `member.groups`, `member.kind`, `member.clearance`, `member.roster.add`, `invite.create`, `invite.revoke`, `group.update`, `rules.update`, `status.set`, `status.clear`, `board.start_for`, `board.ack`, `board.resolve`, `device.pair`, `device.revoke`, `incident.create`, `incident.view`, `incident.update`, `incident.export`, `boat.update`, `boat.status`, `damage.update`, `booking.decide`, `booking.bump`, `practice.cancel`, `practice.land`, `lineup.publish`, `announcement.send`, `announcement.delete`, `export.download`. Each row: actor user id, club id, action, target type and id, a small JSON detail (for example `{ "state": ["open", "closed"] }`), time.

## 19. API

JSON under `/api/`, same origin only, signed in through 03's `__Host-rw_session` cookie unless marked otherwise (08 K56). Errors are `{ "error": "code", "message": "Human sentence." }` as in `worker/reports.js`. Writes are rate limited by `CLUB_LIMIT` per user. `worker/index.js` hands every path starting with `/api/clubs/`, `/api/invites/`, `/api/kiosk/`, `/api/cal/`, `/api/me/clubs`, the exact pattern `/api/me/juniors/:membershipId/approve` (03 owns the other `/api/me/juniors/` routes; 08 3.5, K50), `/api/me/calendar-links` and `/api/locations/:slug/club-context` to `routeClubs()` in `worker/clubs/index.js`, a small table of regular expressions and handlers (no router dependency).

### 19.1 Phase 5

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET /api/clubs?near=lat,lon&radius_km=50` or `?q=` or `?location=<slug>` | Anyone | Verified clubs, nearest first, at most 20 |
| `POST /api/clubs` | Signed in, standing (3.2) | Create a club |
| `GET /api/clubs/:slug` | Anyone (shaped by role) | Public or members' view, with `can` and `me` |
| `PATCH /api/clubs/:slug` | Admin | Profile, links, settings, `statusPublic`, `rulesPublic` |
| `POST /api/clubs/:slug/locations`, `DELETE /api/clubs/:slug/locations/:location` | Admin | Link or unlink a location; one primary |
| `POST /api/clubs/:slug/verify` | Admin | Start a method: `{ "method": "meta" | "dns" | "email" | "manual", "email", "evidence" }` |
| `POST /api/clubs/:slug/verify/check` | Admin | Run the check; `{ "code" }` for email |
| `POST /api/admin/clubs/:slug/review` | Site moderator | `{ "decision": "approve" | "reject", "reason" }` |
| `POST /api/admin/clubs/:slug/suspend`, `.../restore` | Site moderator | With a reason |
| `POST /api/clubs/:slug/delete`, `POST /api/clubs/:slug/delete/cancel` | Admin | `{ "confirm": "Putney RC" }` |
| `GET /api/clubs/:slug/export`, `GET /api/clubs/:slug/export.csv?table=` | Admin (incidents: 16.2) | Export |
| `GET /api/me/clubs` | Signed in | The viewer's memberships, pending approvals and invites |
| `GET /api/clubs/:slug/members?status=active` | Members (shaped by role) | Member list |
| `POST /api/clubs/:slug/members` | Coach, admin | Add a roster-only member |
| `PATCH /api/clubs/:slug/members/:id` | Per field: kind and roles admin; groups coach; clearances coach, safety | Change a member |
| `DELETE /api/clubs/:slug/members/:id?block=1` | Admin | Remove or block |
| `PATCH /api/clubs/:slug/me` | Member | `rowAs`, `rulesOn` (adults), `sharePhone` (guardians), `displayName` |
| `POST /api/clubs/:slug/leave` | Member | Leave |
| `POST /api/clubs/:slug/requests` | Signed-in adult | Ask to join: `{ "reason", "note" }` |
| `GET /api/clubs/:slug/requests`, `POST /api/clubs/:slug/requests/:id` | Admin | List; `{ "decision": "approve" | "decline", "kind", "groups" }` |
| `GET /api/clubs/:slug/invites`, `POST /api/clubs/:slug/invites`, `DELETE /api/clubs/:slug/invites/:id` | Coach (limited), admin | Invites |
| `GET /api/invites/:token` | Anyone | Preview: club name, inviter's first name, preset in words |
| `POST /api/invites/:token/accept`, `POST /api/invites/code` | Signed in | Accept a link; accept a code `{ "code": "K7QF-M2XR" }` |
| `POST /api/me/juniors/:membershipId/approve` | Linked guardian | `{ "decision": "approve" | "decline" }` |
| `GET`, `POST /api/clubs/:slug/groups`; `PATCH`, `DELETE /api/clubs/:slug/groups/:id` | Coach, admin | Groups |
| `GET /api/clubs/:slug/rules` | Members; public summary when `rulesPublic` | Rules and revision |
| `PUT /api/clubs/:slug/rules` | Safety, admin | Replace the rule set: `{ "baseRevision", "rules": [...] }` |
| `GET /api/locations/:slug/club-context?rev=` | Signed in | The viewer's clubs at this location: rules, statuses, membership, clearances |
| `GET /api/clubs/:slug/status` | Members; public line when `statusPublic` | Live status and the last 20 |
| `POST /api/clubs/:slug/status`, `POST /api/clubs/:slug/status/:id/clear` | Coach, safety, admin (7.2) | Post or lift |
| `GET /api/clubs/:slug/board` | Members, kiosk (shaped) | Board |
| `POST /api/outings` | 04, plus club fields (8.2) | Start a row, own or for a crew |
| `POST /api/clubs/:slug/board/:outingId/ack` | Coach, safety, admin | "On it" |
| `POST /api/clubs/:slug/board/:outingId/resolve` | Coach, safety, admin | `{ "outcome": "back" | "safe_elsewhere" | "cancelled" | "incident", "inAt", "note" }` |
| `POST /api/clubs/:slug/devices`, `DELETE /api/clubs/:slug/devices/:id` | Admin | Add a screen (returns the pair code); remove |
| `POST /api/kiosk/pair` | Anyone with a code | `{ "code": "482913" }`, sets the kiosk cookie |
| `GET /api/kiosk/roster` | Kiosk | Adult first names and initials, with membership ids |
| `PATCH /api/locations/:slug` | 01; steward safety officers and admins may send `emergency` | Emergency info as a location revision |
| `GET`, `POST /api/clubs/:slug/incidents` | Filing: members, guardians, staff; listing: safety, admin, own | Incidents |
| `GET`, `PATCH`, `DELETE /api/clubs/:slug/incidents/:id` | Safety, admin; own for reading | One incident |
| `POST /api/clubs/:slug/incidents/:id/share` | Safety, admin | `{ "summary" }` to members |
| `GET /api/clubs/:slug/incidents.csv?from=&to=&names=0` | Safety, admin | Export |

04's `POST /api/outings/:id/in`, `/cancel` and `PATCH /api/outings/:id` accept staff of the outing's club as well as the rower, so "Back" and "Add time" on the board use them.

### 19.2 Phase 6

| Method and path | Who | Purpose |
| --- | --- | --- |
| `GET`, `POST /api/clubs/:slug/boats`; `GET`, `PATCH /api/clubs/:slug/boats/:id` | See 5.3 | Boats |
| `GET`, `POST /api/clubs/:slug/damage`; `PATCH /api/clubs/:slug/damage/:id` | See 5.3 | Damage reports |
| `GET /api/clubs/:slug/bookings?from=&to=&boat=&mine=1` | Members | Bookings |
| `POST /api/clubs/:slug/bookings` | Members (juniors if allowed) | Book |
| `PATCH /api/clubs/:slug/bookings/:id` | Member (cancel own); equipment, admin | `{ "action": "approve" | "decline" | "cancel", "note" }` |
| `GET /api/clubs/:slug/availability?start=&end=&class=` | Members | Boats free in a window |
| `GET /api/clubs/:slug/practices?from=&to=` | Members (filtered), public practices for everyone | Schedule |
| `POST /api/clubs/:slug/practices` | Coach, admin | One practice, or a series with `repeat` |
| `PATCH`, `DELETE /api/clubs/:slug/practices/:id?scope=one|following` | Coach, admin | Edit or delete |
| `POST /api/clubs/:slug/practices/:id/cancel`, `/land`, `/decide` | Coach, admin | `{ "reason" }`, `{ "note" }`, `{ "choice": "water" | "land" | "cancel" }` |
| `PUT /api/clubs/:slug/practices/:id/rsvp` | Member, junior, guardian | `{ "rsvp", "reason", "note", "for": "<junior membership id>" }` |
| `GET`, `PUT /api/clubs/:slug/practices/:id/attendance` | Coach, safety (read), admin | `{ "marks": [{ "membershipId", "attended" }] }` |
| `GET`, `POST /api/clubs/:slug/practices/:id/lineups`; `PATCH`, `DELETE /api/clubs/:slug/lineups/:id` | Coach, admin (drafts); members see published | Lineups |
| `POST /api/clubs/:slug/practices/:id/lineups/publish` | Coach, admin | Publish all drafts |
| `GET`, `POST /api/me/calendar-links`; `DELETE /api/me/calendar-links/:id` | Signed in | Calendar links (returns the URL once) |
| `GET /api/cal/:token.ics` | Holder of the token | Personal feed |
| `GET /api/clubs/:slug/public.ics` | Anyone | Public practices |
| `GET`, `POST /api/clubs/:slug/announcements`; `DELETE /api/clubs/:slug/announcements/:id` | 5.3 | Announcements |
| `GET /api/clubs/:slug/attendance.csv?from=&to=` | Coach, admin | Attendance report |

### 19.3 Examples

`POST /api/clubs`

```json
{
  "location": "putney-landing",
  "name": "Putney Rowing Club", "shortName": "Putney RC", "slug": "putney-rowing-club",
  "kind": "club", "website": "https://putneyrowing.example", "contactEmail": "info@putneyrowing.example",
  "description": "Community rowing on the Connecticut River since 1997.",
  "roles": ["safety"]
}
```

201

```json
{
  "club": {
    "id": "a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d", "slug": "putney-rowing-club", "name": "Putney Rowing Club",
    "shortName": "Putney RC", "kind": "club", "status": "unverified", "tz": "America/New_York",
    "locations": [{ "slug": "putney-landing", "name": "Putney Landing", "role": "home", "primary": true }]
  },
  "me": { "membershipId": "7c1d...", "kind": "adult", "roles": ["admin", "safety"] }
}
```

(The founding year in the example description is illustrative.)

Errors: 403 `not_allowed`, 429 `too_many_clubs`, 400 `invalid` with `field`, 409 `slug_taken`, 409 `similar_club` with `club`.

`GET /api/locations/putney-landing/club-context?rev=11`

```json
{
  "clubs": [{
    "slug": "putney-rowing-club", "name": "Putney Rowing Club", "shortName": "Putney RC", "rev": 12,
    "me": {
      "membershipId": "7c1d...", "kind": "adult", "roles": ["safety"], "groups": ["g-masters"],
      "rowAs": { "boatClass": "1x", "escort": false }, "rulesOn": true,
      "clearances": { "swim_test": { "at": 1788998400000, "expires": 1820534400000 } }
    },
    "groups": [{ "id": "g-masters", "name": "Masters", "kind": "masters" }],
    "rules": [{
      "id": "r1", "name": "Masters scullers", "groupId": "g-masters", "boatClasses": ["1x", "2x"],
      "escort": "no_launch", "locationId": null, "months": null,
      "limits": { "windOff": 12, "gustOff": 15 }, "requires": { "pfd": "carry", "buddy": true }
    }],
    "statuses": [{
      "id": "w9", "state": "closed", "reason": "high_water", "note": null, "allowed": null, "location": null,
      "waterF": null, "startsAt": 1792230720000, "expiresAt": 1792274400000,
      "setByName": "Alex R.", "setByRole": "safety"
    }],
    "dockWater": { "f": 49, "at": 1792231500000, "by": "Alex R." }
  }],
  "fetchedAt": 1792232000000
}
```

With `rev` equal to every club's current revision and no status change since the last fetch, the answer is `{ "unchanged": true, "fetchedAt": ... }`, which costs a few row reads: the membership rows by `memberships_user`, the clubs by primary key, and live statuses by `water_status_live`.

`PUT /api/clubs/putney-rowing-club/rules`: `{ "baseRevision": 12, "rules": [ ...every rule... ] }`. 200 `{ "rev": 13 }`. 409 `conflict` "Someone changed the rules since you opened them. Review their change, then try again." with the current rules. 400 `invalid` with `rule` (index) and `field`: "Gust stay off must be above gust caution." or "Putney Landing has no flow gauge, so flow limits do not apply there."

`POST /api/clubs/putney-rowing-club/status`

```json
{ "state": "restricted", "reason": "fog", "note": "Eights and fours with a launch only until the fog lifts.",
  "allowed": { "groups": [], "boatClasses": ["4x", "4+", "4-", "8+"], "escort": "with_launch" },
  "location": null, "waterF": 49, "expiresAt": 1792245600000, "notify": true }
```

201 `{ "status": { ... }, "replaced": "w8" }`. 403 `not_allowed` "A safety officer set this status, so only a safety officer or admin can lift it."

`POST /api/outings` for a crew (04's body plus):

```json
{
  "club": "putney-rowing-club", "forCrew": true,
  "boatType": "8+", "boatName": "Bellows Falls", "seats": 9,
  "crew": [{ "seat": 1, "membershipId": "m-..." }, { "seat": 9, "role": "cox", "name": "Visiting cox" }],
  "escort": true, "practiceId": null,
  "ruleLvl": 0, "ruleText": null,
  "outAt": 1792230720000, "dueAt": 1792237800000, "floatPlan": false
}
```

`GET /api/clubs/putney-rowing-club/board` (staff)

```json
{
  "asOf": 1792232460000,
  "status": { "state": "restricted", "reason": "fog", "note": "Eights and fours with a launch only until the fog lifts.", "until": 1792245600000, "setByName": "Sam", "setByRole": "coach" },
  "out": [{
    "id": "5e2d...", "location": "putney-landing", "boatType": "1x", "boatName": "Hudson single",
    "crew": { "label": "Sam L.", "count": 1, "junior": false }, "escort": false,
    "outAt": 1792231800000, "dueAt": 1792236600000, "state": "overdue", "overdueMin": 12,
    "against": true, "ruleText": "Stay off: gusts to 18 mph, club limit 15",
    "ack": null, "startedBy": "self"
  }],
  "back": [], "review": [],
  "emergency": { "number": "911", "launchAddress": "...", "hospital": { "name": "...", "phone": "..." }, "aed": "..." }
}
```

`POST /api/clubs/putney-rowing-club/bookings`: `{ "boatId": "b-...", "startsAt": 1793098800000, "endsAt": 1793104200000, "note": null }`. 201 `{ "booking": { "id", "status": "confirmed" } }` or `"pending"`. 409 `slot_taken`, 409 `boat_unavailable` "Bellows is out of service.", 400 `too_long` "Bookings can be up to 3 hours.", 400 `too_far` "You can book up to 7 days ahead.", 429 `too_many_bookings` "You have 3 bookings coming up. Cancel one to book another.", 403 `not_allowed` "Bellows is for Masters cleared to row alone."

`POST /api/clubs/putney-rowing-club/practices` (a series)

```json
{
  "title": "Junior practice", "kind": "water", "groups": ["g-juniors"], "coaches": ["m-lee"],
  "location": "putney-landing", "date": "2026-10-20", "start": "05:45", "durationMin": 105,
  "meetMin": 15, "escort": true,
  "repeat": { "interval": 1, "days": ["TU", "TH"], "until": "2026-11-19" },
  "boats": ["b-bellows"], "rsvpBy": "evening_before", "notes": "Bring a warm layer.", "public": false
}
```

201 `{ "series": { "id", "rrule": "FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,TH" }, "created": 10, "conflicts": [] }`. `conflicts` lists boat bookings the coach must resolve (11.4).

`PUT /api/clubs/putney-rowing-club/practices/:id/rsvp`: `{ "rsvp": "no", "reason": "school" }`. A junior sending `note` gets 400 `invalid` with `field: "note"`.

## 20. Screens and routes

07 owns navigation and layout; this is the content. Club pages use the same text tab style as the location tabs, with hash routes under the club path.

| Route | Who | Content |
| --- | --- | --- |
| `/club/new` | Signed in | Create a club (3.2) |
| `/club/join/<token>` | Anyone | Invite preview and Join (4.3) |
| `/club/<slug>` | Everyone | Public page (3.4) or, for members, the Today tab |
| `#today` | Members | Status banner, setup checklist (admins), Which crews can go (6.7), today's practices (6), pinned announcements (6) |
| `#board` | Members | Board (8.4) |
| `#kiosk` | Paired screen | Kiosk board (8.5) |
| `#schedule` and `#schedule/2026-10-20` (6) | Members | Week of practices with outlook lines |
| `#practice/<id>` (6) | Members | Outlook, RSVP, lineups, attendance (staff) |
| `#boats`, `#boats/<id>` (6) | Members | Registry, damage, bookings |
| `#rules` | Members | Rules in sentences; editor for safety officers and admins |
| `#members` | Members (shaped) | Members, groups, clearances, invites, requests |
| `#safety` | Members | Emergency info, lessons, Record an incident; the incident log for safety officers and admins |
| `#settings` | Members | Notifications (21.8) and Leave; for admins, everything in 16.1, screens, verification and deletion |

Elsewhere:

- Location page: the club status line, Clubs here, the hero's club line, notes and alt line (6.6), "Rowing with Putney Rowing Club" in Start a row, the Safety section (8.7), and "Book a boat" in Plan a row (11.5).
- Account: "Your clubs" (each with role words: "Putney Rowing Club. Member, safety officer."), pending approvals for guardians ("Sam wants to join Putney Rowing Club as a junior. Approve?"), invite code entry, calendar links (14).

Empty states:

- Members: "Only you so far. Invite members to get started."
- Rules: "No club rules yet, so members see the location's limits. Start from USRowing guidance, or add a rule."
- Board: "No boats on the water. Start a row to put one here."
- Schedule: "No practices scheduled. Add one, or set up a weekly schedule."
- Boats: "No boats yet. Add the club's boats to use damage reports, booking and lineups."
- Incidents: "No incidents recorded. Near misses are worth recording too."

Performance: everything under `src/club/` is loaded with dynamic `import()` only on `/club/` routes or when a club sheet opens, so the Now screen bundle grows only by `src/clubrules.js`, `src/club-context.js` and the hero lines. Target: under 4 KB gzipped added to the Now screen (estimate; 08 sets the budget). The club context request runs beside the data sources and is never awaited before the first render.

Accessibility: status words always accompany status colors; the board's state words are in the row text, not only in a colored chip; the rules editor is a plain form with labeled inputs and fieldsets per rule; the kiosk respects reduced motion and has 44 px targets.

## 21. Notifications (for 05)

05 owns delivery: the engine, Web Push, email, quiet hours, caps, dedupe and the in-app list. This section is the club side. It lists every notification club features send, who gets each one, how each maps onto 05's kinds and tables, and what 05's engine needs to run them. Sections 7.6, 8.3, 8.6, 9.2, 10.2, 11.3, 11.4, 12.1 to 12.3, 13 and 15 name these notifications where they arise; this is the full list in one place.

### 21.1 Kinds, tables and payload

Club notifications use three kinds 05 already has, and one new kind:

| 05 kind | Used for | 05 section |
| --- | --- | --- |
| `water_status` | A club water status: closed, restricted, lifted early, end time moved | 3.9 |
| `practice` | A practice added, cancelled, moved to land, or changed in time or place | 3.10 |
| `overdue` | The club chain of an outing (8.6): stages 1 to 3, On it, all clear | 3.11 |
| `club` (new) | Everything else, told apart by `subkind` | new |

Changes to 05's tables, for 05 and 08:

- `notify_prefs.kind` and `notify_log.kind` gain `club` in their CHECK lists. SQLite cannot change a CHECK in place, so 08's `0008` creates both tables in phase 3 with `club` already listed (08 K19).
- In `notify_prefs`, the two club CHECKs widen to `kind IN ('water_status', 'practice', 'club')`. 05's unique index `notify_prefs_one` then allows one `club` pref per person per club, which is what 21.8 needs.
- `notify_log` gains `subkind TEXT CHECK (subkind IS NULL OR (kind = 'club' AND length(subkind) BETWEEN 3 AND 24))`. 08's `0008` creates it with the table in phase 3 (08 K19).
- Checked locally (SQLite 3.50.4 through `node:sqlite` in Node 22.22.0, 2026-10-17, not D1): the added column's CHECK refused a subkind on a `night_before` row and a one-letter subkind; the widened `notify_prefs` CHECKs refused a `club` pref with no club, and the unique index refused a second `club` pref for the same club.
- `notify_log.ref_id` holds what the notification is about: the water status, practice, outing, booking, damage report, boat, announcement or incident id, or the club id for rules and membership notices.
- 05's owner stats (`GET /api/admin/notify/stats`) group `club` rows by `subkind`.

Decision: Club notifications use one new 05 kind, `club`, with a `subkind` column, beside 05's `water_status`, `practice` and `overdue`.
- Alternative: one 05 kind per notification (27 club names added to 05's 11 in the CHECK lists, and a pref row per kind).
- Alternative: the subkind only in the dedupe key prefix (no column; stats and stale checks parse the key).

Payload: 05's job message and push payload (05 sections 5.6 and 6.3) stay as they are, and `rw` gains `club` (the slug) and `sub` (the subkind): `"rw": { "v": 1, "log": "...", "kind": "club", "sub": "lineup", "club": "putney-rowing-club" }`. The service worker uses `club` to refresh an open app (21.6).

Copy rules: 05 section 3.2, with two changes. Titles start with the club's `shortName` ("Putney RC: water closed"), not the location's, because the club is who the notice is from. Times print in `clubs.tz`. Dev adds " (dev)" after the short name, as 05 does. Builders live in `worker/notify/copy-club.js`, pure, one function per row of 21.5. They build sentences with `src/clubtext.js`, so the board, the banner and the notification say the same thing.

Requests to 05 that follow from this:

- 3.9's samples become 21.5's: the short name first, and an end time in place of "Until further notice", since every status has one (7.3).
- 3.10's samples put the club short name first in the title, not in the body.
- 7.5's deep links for `water_status` and `practice` use the club hash routes in 21.4.
- 3.1's quiet hours rule for `practice` and for restricted `water_status` changes as 21.3 says.

### 21.2 Recipients and safeguarding

`audience(env, club, spec)` in `worker/clubs/audience.js` turns a spec (`{ roles, groups, memberships, practiceId, guardians, safety }`) into recipient rows `{ userId, membershipId, junior, forJunior, channels }`. Every club notification goes through it, so the rules in 5.2 and in 03 section 11.4 hold in one place. In order:

1. Only active memberships with an account (`status = 'active'`, `user_id` not NULL). Roster-only members receive nothing (4.2).
2. Guardians. For each junior in the audience, the guardians in `club_guardians` are added with `forJunior` set, so their copy names the junior ("Sam's seat for Tue 5:45 AM"). This is how 5.2 rule 2 reaches notifications: whatever reaches a junior also reaches that junior's guardians.
3. `audienceGuard()` (03 section 11.4 rule 4) runs for every subkind that carries staff-written text: announcements, practice cancel reasons and land notes, booking decline notes and shared safety notes. A refusal stops the send before anything is written and returns 409 `needs_adult` to the sender. Notices built only from choices (reason words, seat numbers, times) skip the guard.
4. Guardian controls (03 section 11.5). `guardian_links.discontinue` on any active link of a junior: the junior gets no row, and the guardians' copies stand. `guardian_links.mute_nonsafety`: the junior's row is written with `channels = 'inapp'`, `status = 'skipped'` and `skip_reason = 'disabled'`, so it shows in the app's list but reaches no device, as 05 does for capped rows. The most protective setting across a junior's guardians wins. Neither control touches safety rows: a closed water status and overdue messages.
5. Quiet hours. Adults keep their own (05 section 4.4), with the exceptions in 21.3. Juniors get 03's fixed 10 PM to 6 AM in the club's time zone (03 section 11.3) for every non-safety notice, with no exceptions. Their guardians get the same notice under their own quiet hours, so a family still hears about a 5:45 AM cancellation posted at 10:30 PM.
6. The person whose action caused the notice is left out: the coach who posted the status, the member who booked. Overdue stages are the exception; they go to everyone the stage names.
7. One notice per person per event. Dedupe keys end with the user id. A guardian with two juniors in one lineup gets one notice naming both ("Sam is 6 seat in Bellows Falls. Alex is cox in Hudson (4+)."). A person who is both a member and a guardian gets one notice per event.
8. Preferences come last: the subkind's switch (21.8) and, for water status, `only`.

Recipients are worked out when each notice is sent, not when the event began. A safety officer appointed while a boat is out gets that boat's later stages.

### 21.3 Delivery by kind and subkind

| Kind, subkind | Channels | Urgency | TTL | Topic and tag | Quiet hours | Turn off | Cap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `overdue`, club stages 1 to 3 | Stage 1: push, and email when the person has no working push subscription. Stages 2 and 3: push and email. | high | 15 min | `oc-` plus 12 characters of the outing id | Never held | Stage 1 only, by safety officers (`overdue_stage1`) | None |
| `overdue`, On it and all clear | Push; email to whoever was emailed | high | 15 min | The stages' topic, so it replaces them on the lock screen | Never held | No | None |
| `water_status`, closed | Push and email | high | Until the status ends, at most 6 h | `ws-` plus 12 of the club id | Never held | No ("Closed only" keeps it) | None |
| `water_status`, restricted, lifted, end moved | Push | normal | Until the status ends, at most 6 h | Same | Held, except when the status begins before the person's quiet hours end | `only: closed` | 05's 8 a day |
| `practice` | Push; also email for cancelled and moved to land, and when the person has no working push | high within 12 h of the start, else normal | Until the start | `pr-` plus 12 of the practice id | Held, except when the practice starts before the person's quiet hours end | The `practice` pref | 05's 8 a day |
| `club`, `practice_check` | Push | normal | Until the start | `pc-` plus 12 of the practice id | Ignored: the coach chose the time (05's rule for timed kinds) | Yes | Staff |
| `club`, `lineup`, `rsvp`, `booking`, `booking_request`, `boat_out`, `lineup_gap` | Push | high within 12 h of the session, else normal | Until the session (`rsvp`: until `rsvp_by`) | `ln-`, `rv-`, `bk-` plus 12 of the practice or booking id; none for the others | Held, except when the session starts before the person's quiet hours end | Yes | 05's 8 a day; Staff for `booking_request`, `boat_out` and `lineup_gap` |
| `club`, `incident` | Push | high when the types include an injury, else normal | 24 h | none | Held, except with an injury | Yes | Staff |
| `club`, `incident_guardian` | Push and email | normal | 24 h | none | Held, except with an injury | No | None |
| `club`, `against_rule`, `against_daily`, `damage`, `join_request`, `rules` (staff), `emergency_check` | Push | normal (`emergency_check` low) | 24 h | none | Held | Yes | Staff |
| `club`, `guardian_approve`, `role`, `verify`, `deleting` | Push and email | normal | 24 h | none | Held | No | None |
| `club`, `announcement`, `lesson`, `rules` (members), `clearance`, `joined`, `reminder` | Push; `rules` for members is in-app unless the editor chose "Tell members" | normal (`clearance`, `reminder` low) | 24 h, or until the pin ends for an announcement | none | Held | Yes | 05's 8 a day |
| `club`, `removed`, `adult`, `fixed` | In-app only | | | | | No | None |

Caps. "05's 8 a day" is 05 section 4.5's cap on non-safety pushes per person. "Staff" is a separate cap of 20 duty notices a day per person per club, so a busy morning of bookings and damage reports cannot use up a coach's 8 and silence a lineup. Above either cap the row is in-app only (`skip_reason = 'cap'`). Safety rows have no cap.

Decision: Staff duty notices have their own cap of 20 a day per person per club, apart from 05's 8.
- Alternative: count everything that is not safety against 05's 8.

The quiet hours exception ("held, except when the session starts before the person's quiet hours end") is there because a 5:45 AM practice cancelled at 10:30 PM and held until 6 AM is worse than no notice: people drive to the dock. The same holds for a restricted status a coach posts at 5:40 AM for the dawn fog. It changes 05 section 3.1, which holds every `practice` and every non-closed `water_status` notice. Juniors' fixed quiet hours still hold it for the junior (21.2 rule 5); the guardian gets it at once.

Decision: Practice, lineup, booking and restricted water status notices are not held by quiet hours when the session or status begins before the person's quiet hours end.
- Alternative: hold them, as 05 section 3.1 says for `practice`.
- Alternative: never hold practice notices at all.

### 21.4 Every club notification

Times and names are Putney samples. "Staff" means coaches, safety officers, equipment managers and admins (section 1). Dedupe keys follow 05 section 5.5: unique in `notify_log.dedupe_key`, at most 160 characters, with the user id last. The longest here, `cl:boat_out:<boat id>:<practice id>:<user id>`, is 122 characters with 36-character ids.

Safety (phase 5):

| # | Notification | Trigger | Recipients | Kind (subkind) | Dedupe key |
| --- | --- | --- | --- | --- | --- |
| S1 | Boat overdue, stage 1 | Tick: `club_next_at <= now` at `club_stage` 0, which is `due_at + graceMin` (8.6) | Safety officers who have not turned off stage 1; the staff member who started the row; the practice's coaches (phase 6); every coach when `overdue.stage1` is `safety_and_coaches`. Admins too when the club has no active safety officer, or when every recipient above is aboard the overdue boat. | `overdue` | `odc:<outing id>:1:<user id>` |
| S2 | Still overdue, stage 2 | Stage 1 time plus `escalateMin`, when nobody tapped On it | All safety officers, all admins, the starter, guardians of junior crew members | `overdue` | `odc:<outing id>:2:<user id>` |
| S3 | Not resolved, stage 3 | Stage 2 time plus 30 minutes, when the outing is still open, with or without On it | All safety officers and admins | `overdue` | `odc:<outing id>:3:<user id>` |
| S4 | On it | `POST /api/clubs/:slug/board/:outingId/ack` | Everyone who got stage 1, except the person who tapped | `overdue` | `odc:<outing id>:ack:<user id>` |
| S5 | All clear | Resolve on the board, the rower's I'm back, or a contact's "safe" on 04's status link, after stage 1 | Everyone who got stage 1, 2 or 3 (their `notify_log` rows for the outing) | `overdue` | `odc:<outing id>:clear:<user id>` |
| S6 | Row started against club rules | `POST /api/outings` that sets `against = 1` (8.3) | Safety officers, except the starter | `club` (`against_rule`) | `cl:against_rule:<outing id>:<user id>` |
| S7 | More rows against club rules today | The 21st such row in a club's local day schedules one delayed job for 7 PM club time | Safety officers | `club` (`against_daily`) | `cl:against_daily:<club id>:<day key>:<user id>` |
| S8 | Incident recorded | An incident saved as `submitted` (9.2) | Safety officers and admins, except the filer | `club` (`incident`) | `cl:incident:<incident id>:<user id>` |
| S9 | Incident involving your junior | The same save, for each minor named in `people` | That junior's guardians | `club` (`incident_guardian`) | `cl:incident_guardian:<incident id>:<user id>` |
| S10 | Safety note shared | `POST /api/clubs/:slug/incidents/:id/share` (9.2 step 7) | All members and guardians | `club` (`lesson`) | `cl:lesson:<incident id>:<user id>` |
| S11 | Emergency info due for a check | Daily run: the day the location's `emergency.checkedAt` turns a year old, then every 30 days until someone checks it (8.7) | Safety officers and admins of the steward club | `club` (`emergency_check`) | `cl:emergency_check:<location id>:<month key>:<user id>` |
| S12 | Clearance about to expire | Daily run: 30 days before, and on the day, a clearance expires that an enabled rule requires (6.3) | The member; a junior's guardians | `club` (`clearance`) | `cl:clearance:<membership id>:<key>:<expiry day key>:<user id>` |

These are the club overdue keys, in 05's short style: `notify_log` holds one row per recipient, so the user id must be in the key. 08 K16 keeps this spelling, and 8.6 uses it.

Decision: When every stage 1 recipient is aboard the overdue boat, stage 1 also goes to the club's admins.
- Alternative: stage 1 as 8.6 says, so a lone safety officer who is the overdue sculler hears about their own boat and nobody else hears until stage 2.

Decision: The club chain keeps running for outings already on the water when the club is suspended or set to delete. A suspension stops rules and status from applying (3.6); it never stops an alert for a boat that is out.
- Alternative: stop the club chain with the club, leaving 04's personal chain.

Decision: Remind members 30 days before a clearance that a club rule needs runs out, and on the day (S12), because the rule turns their result to Stay off when it lapses.
- Alternative: show the expiry only on the club page.

Water status and rules (phase 5):

| # | Notification | Trigger | Recipients | Kind (subkind) | Dedupe key |
| --- | --- | --- | --- | --- | --- |
| W1 | Water closed | A closed status posted with Tell members on (7.6) | Members and guardians with the `water_status` pref on, scoped by location as below | `water_status` | `ws:<user id>:<water_status id>` |
| W2 | Water restricted | A restricted status posted with Tell members on | The same, when their pref's `only` is `any` | `water_status` | `ws:<user id>:<water_status id>` |
| W3 | Water open again | A closed or restricted status cleared before it ends, or replaced by a less strict one | Everyone who got the status that ended | `water_status` | `ws:<user id>:<ended status id>:lifted` |
| W4 | End time moved | A new post of the same state whose end differs from the live one by more than 30 minutes | As W1 or W2 | `water_status` | `ws:<user id>:<new status id>` |
| W5 | Club rules changed, for staff | `PUT /api/clubs/:slug/rules` succeeds | Safety officers and admins, except the editor | `club` (`rules`) | `cl:rules:<club id>:<rules revision>:<user id>` |
| W6 | Club rules changed, for members | The same save, for members whose merged rules for their crew type changed (`rulesDiff()` in `src/clubrules.js`), and their guardians | Those members and guardians | `club` (`rules`) | `cl:rules:<club id>:<rules revision>:<user id>` |

Nothing is sent when a status ends at its own time, for an `open` post that lifts nothing, or for a dock water reading on its own (7.6).

Location scope, refining 7.6: when the club has one location, or the status names all of them, every member gets it. When it names one of several locations, it goes to members who follow that location (03's favorites or home location) or started a row there in the last 60 days, and to all staff.

W6 is in-app only unless the editor ticks "Tell members" when saving, a new switch in the rules editor, off by default. With it, members get a push, at most one per member per club in 6 hours; later ones stay in-app (`skip_reason = 'cap'`). Members see the new result in the hero on their next refresh anyway; the notice says what changed and why.

Decision: Club rule changes push to safety officers and admins. Members get an in-app notice, and a push only when the editor ticks "Tell members".
- Alternative: push every affected member on every save.
- Alternative: no notice; the hero shows the new result.

Membership and club admin (phase 5):

| # | Notification | Trigger | Recipients | Kind (subkind) | Dedupe key |
| --- | --- | --- | --- | --- | --- |
| M1 | Join request | `POST /api/clubs/:slug/requests` (4.4) | Admins; at most 5 a day each, the rest in-app | `club` (`join_request`) | `cl:join_request:<membership id>:<user id>` |
| M2 | Request approved | An admin approves | The requester. A decline sends nothing (4.4). | `club` (`joined`) | `cl:joined:<membership id>:<user id>` |
| M3 | Junior wants to join | A junior accepts an invite and the membership is `pending_guardian` (4.5) | The junior's linked guardians (03's `guardian_links`) | `club` (`guardian_approve`) | `cl:guardian_approve:<membership id>:<user id>` |
| M4 | Staff role given | An admin adds a role, or succession makes someone admin (3.6) | The member | `club` (`role`) | `cl:role:<audit_log id>:<user id>` |
| M5 | Membership ended | Removed or blocked by an admin (4.6) | The person, in-app only | `club` (`removed`) | `cl:removed:<membership id>:<user id>` |
| M6 | Now an adult member | Daily run at `junior_until`, or staff change a roster kind (4.5) | The member and their former guardians, in-app only | `club` (`adult`) | `cl:adult:<membership id>:<user id>` |
| M7 | Deletion requested or cancelled | 3.6 steps 2 and 4 | All admins | `club` (`deleting`) | `cl:deleting:<club id>:<delete_after, or cancel>:<user id>` |
| M8 | Verified, not verified, suspended | Moderator decisions (3.3, 3.6) | All admins | `club` (`verify`) | `cl:verify:<audit_log id>:<user id>` |
| M9 | Check junior kinds | Daily run on September 1 in the club's time zone (4.5) | Admins and coaches | `club` (`reminder`) | `cl:reminder:<club id>:<year>:<user id>` |

M4 matters most for the safety officer role, because overdue alerts start going to that person. When they have no working push subscription, M4 goes by email and says how to turn notifications on (21.5), and the Members tab shows admins "Robin S. has no device for overdue alerts" until one is added.

Practices and lineups (phase 6):

| # | Notification | Trigger | Recipients | Kind (subkind) | Dedupe key |
| --- | --- | --- | --- | --- | --- |
| P1 | Practices added | `POST /api/clubs/:slug/practices`: one practice, or a whole series as one notice | Members of the practice's groups, guardians of the juniors among them, and the listed coaches, except the creator | `practice` | `pr:<user id>:<first practice id>:0` |
| P2 | Practice cancelled | `POST /api/clubs/:slug/practices/:id/cancel` | The practice's people (below). Those who answered No get it in-app only. | `practice` | `pr:<user id>:<practice id>:<sequence>` |
| P3 | Moved to land | `POST /api/clubs/:slug/practices/:id/land` | As P2 | `practice` | `pr:<user id>:<practice id>:<sequence>` |
| P4 | Time or place changed | Start or end moved, location changed, or meet time moved by 10 minutes or more, for a practice in the next 7 days. A series edit sends one notice per person. | As P2 | `practice` | `pr:<user id>:<practice id>:<sequence>` |
| P5 | Evening check | Tick: `practices.check_at <= now` (21.7) | The practice's coaches, or every coach when none are listed (12.2) | `club` (`practice_check`) | `cl:practice_check:<practice id>:<user id>` |
| P6 | RSVP reminder | `rsvp_by` minus 2 hours, when `practice.rsvpReminder` is on (12.3) | People expected at the practice who have not answered, and their guardians | `club` (`rsvp`) | `cl:rsvp:<practice id>:<user id>` |
| P7 | Lineups published | "Publish lineups" (13) | Seated people with accounts; guardians of seated juniors | `club` (`lineup`) | `cl:lineup:<practice id>:<publish time ms>:<user id>` |
| P8 | Seat changed or removed | Publishing again | Only people whose seat changed or who were removed, and their guardians | `club` (`lineup`) | `cl:lineup:<practice id>:<publish time ms>:<user id>` |
| P9 | Seat left empty | A member leaves with seats in future lineups (4.6) | The practice's coaches | `club` (`lineup_gap`) | `cl:lineup_gap:<lineup id>:<seat>:<user id>` |

"The practice's people": members of its groups, anyone who answered, guardians of the juniors among them, and its coaches, except whoever made the change. P1 to P4 are 05's `practice` kind, so the person's `practice` pref turns all four off. `practices.sequence` (12.1) moves with every change that shows in a calendar, so each change has its own key. Changes to notes, coaches, title or groups move `sequence` for the calendar but send nothing.

Decision: Changes to practices more than 7 days ahead are not pushed; the schedule and the calendar feed show them.
- Alternative: push every change, however far ahead.
- Alternative: a 14-day window.

The night-before outlook with a practice (05 section 3.3) is 05's notice, not one of these. 05 asks `practicesFor(env, userId, dayKey)` in `worker/clubs/practices.js` for the person's practices on the target day and folds the first into the title.

Boats, booking and announcements (phase 6):

| # | Notification | Trigger | Recipients | Kind (subkind) | Dedupe key |
| --- | --- | --- | --- | --- | --- |
| B1 | Booking to approve | A booking created as `pending` (11.3) | Equipment managers and admins, except the booker | `club` (`booking_request`) | `cl:booking_request:<booking id>:<user id>` |
| B2 | Booking confirmed or not approved | Approve, decline, or the automatic decline at the start time | The member | `club` (`booking`) | `cl:booking:<booking id>:<status>:<user id>` |
| B3 | Booking cancelled | Staff cancel with a reason, the boat goes out of service (10.2), or a practice takes it (11.4) | The member | `club` (`booking`) | `cl:booking:<booking id>:cancelled:<user id>` |
| B4 | Damage reported | A damage report marked `unsafe` or `rowable` (10.2); `cosmetic` is in-app only | Equipment managers, or admins when there are none, except the reporter | `club` (`damage`) | `cl:damage:<report id>:<user id>` |
| B5 | Boat out of service for a practice | A boat set out of service, by a report or by hand, that a practice in the next 7 days reserves or seats a lineup in | That practice's coaches | `club` (`boat_out`) | `cl:boat_out:<boat id>:<practice id>:<user id>` |
| B6 | Damage fixed | A report moves to `fixed` | The reporter, in-app only | `club` (`fixed`) | `cl:fixed:<report id>:<user id>` |
| A1 | Announcement | An announcement posted with "Send a notification" on (15) | The audience, and guardians of the juniors in it. Staff outside the audience see it on the Today tab with no push. | `club` (`announcement`) | `cl:announcement:<announcement id>:<user id>` |

A booking no-show sends nothing (11.3: no automatic penalty).

### 21.5 Copy

Titles are at most 50 characters and bodies at most 240 (05 section 3.2). `test/club-copy.test.js` checks every row (24.2). Email subjects are the titles. Email bodies add the link and, for safety notices, the emergency block and 8.6's footer: "RoWhether is not an emergency service. It does not watch the water or call anyone."

| # | Title | Body |
| --- | --- | --- |
| S1 | "Putney RC: boat overdue" | "Sam L., 1x, was due back at Putney Landing at 7:30 AM. 15 min late. Open the board." |
| S2 | "Putney RC: boat still overdue" | "Sam L., 1x, due 7:30 AM, now 30 min late. Nobody has said they are on it. Emergency: 911. Launch address on the board." |
| S2, guardian | "Putney RC: Sam's boat is overdue" | "Bellows Falls (8+) with Lee M.'s launch was due back at 7:30 AM. The club's safety officers have been told." |
| S3 | "Putney RC: overdue boat not resolved" | "Sam L., 1x, due 7:30 AM. Alex R. has been on it since 8:01 AM. Mark it on the board when it is settled." |
| S3, nobody on it | "Putney RC: overdue boat not resolved" | "Sam L., 1x, due 7:30 AM, now 60 min late. Nobody has marked it on the board." |
| S4 | "Putney RC: Alex R. is on it" | "Sam L., 1x, overdue since 7:45 AM." |
| S5 | "Putney RC: Sam L. is back" | "Marked by Alex R. at 8:02 AM." |
| S5, other outcomes | "Putney RC: Sam L. is safe" | "Landed at Railroad bridge, VT bank. Marked by Alex R. at 8:02 AM." Or: "Did not go out. Marked by Alex R. at 8:02 AM." Or: "Sam L. tapped I'm back at 7:52 AM." |
| S5, guardian | "Putney RC: Sam's boat is back" | "Bellows Falls (8+) is back. Marked by Lee M. at 7:58 AM." |
| S6 | "Putney RC: row started against club rules" | "Sam L., 1x, 3:02 PM: gusts to 18 mph, club limit 15." |
| S7 | "Putney RC: rows against club rules today" | "4 more rows started against club rules today. They are marked on the board." |
| S8 | "Putney RC: incident recorded" | "Capsize, Oct 17, 7:40 AM. Open the safety log." |
| S8, injury | "Putney RC: incident recorded" | "Incident with an injury, Oct 17, 7:40 AM. Open the safety log." |
| S9 | "Putney RC: incident involving Sam" | "Putney RC recorded an incident involving Sam on Oct 17 (capsize). The club's safety officers have the details." |
| S10 | "Putney RC: safety note" | The summary's first 160 characters, cut at a word: "Near miss, Oct 17: a single hit the old piling below the railroad bridge at low water. Keep to the channel shown in the traffic pattern." |
| S11 | "Putney RC: check Putney Landing's emergency info" | "Last checked Oct 2025. Confirm the launch address, hospital and AED details on site." |
| S12 | "Putney RC: swim test expires Nov 16" | "A club rule needs a current swim test for Masters 1x without a launch. After Nov 16 you will see Stay off there. Ask a coach to record a new one." |
| W1 | "Putney RC: water closed" | "High water. Until 6 PM. Set by Alex R., safety officer, 5:52 AM." |
| W2 | "Putney RC: water restricted" | "Eights and fours with a launch only. Fog. Until 10 AM. Set by Sam, coach, 5:40 AM." |
| W3 | "Putney RC: water open again" | "The high water closure was lifted at 1:15 PM by Alex R., safety officer." |
| W4 | "Putney RC: water closed until Sat, Oct 24" | "High water. Now until Sat, Oct 24, 6 PM. Set by Alex R., safety officer, 4:10 PM." |
| W5 | "Putney RC: club rules changed" | "Alex R. changed 2 rules: Masters scullers, Cold water. Open the rules to review." |
| W6 | "Putney RC: club rules changed for you" | "Masters, 1x without a launch: gust stay off now 15 mph, was 18." |
| M1 | "Putney RC: Sam Lee asked to join" | "I row here. Open Members to approve or decline." |
| M2 | "Putney RC: request approved" | "You are a member of Putney Rowing Club, in Masters. Club rules for Masters now apply at Putney Landing." |
| M3 | "Putney RC: Sam wants to join as a junior" | "Approve in Account, Juniors. Club staff will see Sam's name, groups and club rows." |
| M4, safety officer | "Putney RC: you are now a safety officer" | "Overdue boat alerts come to you from now on. Turn on notifications on this phone so they reach you." |
| M4, coach | "Putney RC: you are now a coach" | "You can set water status, groups, clearances and crews. Added by Alex R." |
| M4, succession | "Putney RC: you are now an admin" | "The last admin's account was deleted, so the role passed to you. Add a second admin in Members." |
| M5 | "Putney RC: membership ended" | "You are no longer a member of Putney Rowing Club." |
| M6 | "Putney RC: Sam is now an adult member" | "Guardians no longer see Sam's club schedule." |
| M7 | "Putney RC: deletion requested" | "Alex R. asked to delete Putney Rowing Club on Oct 31, 2026. Any admin can cancel before then." |
| M7, cancelled | "Putney RC: deletion cancelled" | "Sam L. cancelled the deletion. Nothing was removed." |
| M8 | "Putney RC: club verified" | "Putney Rowing Club now shows on Putney Landing's page and in club search." |
| M8, not verified | "Putney RC: not verified yet" | "A moderator could not verify the club: (the moderator's reason). Update the evidence and try again." |
| M9 | "Putney RC: check junior ages" | "Mark roster-only juniors who turned 18 as adults. 23 roster-only juniors are listed in Members." |
| P1 | "Putney RC: new practices" | "Junior practice, Tue and Thu 5:45 AM, Oct 20 to Nov 19, at Putney Landing." |
| P2 | "Putney RC: Tue 5:45 AM practice cancelled" | "Junior practice. Thunderstorms forecast. Next practice Thu 5:45 AM." |
| P3 | "Putney RC: Tue 5:45 AM practice on land" | "Junior practice moves to the boathouse, same time. Erg: 3 x 15 min at 20 spm." |
| P4 | "Putney RC: Tue practice now 6 AM" | "Junior practice, was 5:45 AM. Meet 5:45 AM at Putney Landing." |
| P5 | "Putney RC: tomorrow's 5:45 AM practice" | "Looks like Stay off. Juniors 8+ with a launch: gusts to 24 mph. Keep it, move it to land, or cancel?" |
| P5, caution | "Putney RC: tomorrow's 5:45 AM practice" | "Looks like Caution: gusts to 19 mph after 6:30 AM. Juniors 8+ with a launch." |
| P6 | "Putney RC: are you coming Tue 5:45 AM?" | "Junior practice. Answer by 8 PM so the coaches can set lineups." |
| P6, guardian | "Putney RC: is Sam coming Tue 5:45 AM?" | "Junior practice. Answer for Sam by 8 PM so the coaches can set lineups." |
| P7 | "Putney RC: lineups for Tue 5:45 AM" | "You are 6 seat in Bellows Falls (8+)." |
| P7, guardian | "Putney RC: Sam's seat for Tue 5:45 AM" | "Sam is 6 seat in Bellows Falls (8+)." |
| P8 | "Putney RC: your seat changed for Tue 5:45 AM" | "Now 5 seat in Bellows Falls (8+)." |
| P8, removed | "Putney RC: lineup change for Tue 5:45 AM" | "You are no longer in a lineup for Tue 5:45 AM." |
| P9 | "Putney RC: seat empty for Tue 5:45 AM" | "Sam left the club. Seat 6 in Bellows Falls is empty." |
| B1 | "Putney RC: booking to approve" | "Sam L., Bellows (1x), Sat, Oct 24, 7 to 8:30 AM." |
| B2 | "Putney RC: booking confirmed" | "Bellows, Sat, Oct 24, 7 to 8:30 AM." |
| B2, declined | "Putney RC: booking not approved" | "Bellows, Sat 7 AM. Boat at a regatta that day. 2 other singles are free then." |
| B2, at the start | "Putney RC: booking not approved in time" | "Nobody approved Bellows for Sat 7 AM before it started." |
| B3 | "Putney RC: booking cancelled" | "Bellows Falls is out of service. Your booking for Sat 7 AM was cancelled. 2 other 8+ boats are free then." |
| B3, practice | "Putney RC: booking cancelled" | "Your booking of Bellows on Sat 7 AM was cancelled for Junior practice. 2 other singles are free then." |
| B4 | "Putney RC: Bellows Falls not safe to row" | "Rigger, reported by Sam L., Oct 17. The boat is out of service." |
| B4, rowable | "Putney RC: damage on Bellows Falls" | "Rowable but needs fixing. Rigger, reported by Sam L., Oct 17." |
| B5 | "Putney RC: Bellows Falls out of service" | "It is reserved for Junior practice, Tue 5:45 AM. Pick another boat or change the lineup." |
| B6 | "Putney RC: Bellows Falls back in service" | "Your damage report from Oct 17 is marked fixed." |
| A1 | "Putney RC: Regatta van Saturday" | The body's first 160 characters, cut at a word: "Regatta van leaves at 6 AM Saturday. Juniors: bring your uniform and a warm layer. Parents: pickup at 4 PM at the boathouse." |

Rules for club text:

- Push and email never carry an incident's narrative, injury details or names (9.3), a junior's name to anyone but their guardians and staff (5.2 rule 6), or a member's request note.
- Staff-written text (a cancel reason, a decline note, an announcement) appears as written, cut at a word to fit, and only in subkinds that ran `audienceGuard()` (21.2).
- A title over 50 characters drops the time first ("Putney RC: practice cancelled"), then shortens a boat or location name.

### 21.6 Making sure members see a closed status

A closed status is the one club notice that changes what a member should do in the next hour. These seven rules make sure it lands, and that nothing on a member's screen shows Go while it lasts:

1. It is sent at once: never held, no cap, high urgency, push and email (21.3). `mute_nonsafety` and `discontinue` do not apply.
2. An open app refreshes. `public/push-sw.js` (05) posts `{ type: 'refresh', what: 'club', club }` to every open window after it shows a `water_status` notification. `src/notify.js` passes it to `loadClubContext(slug, { force: true })` in `src/club-context.js`, which redraws the hero. A tap on any club notice does the same before the view opens. Request to 05: add the post to the `push` handler.
3. The club context never says "unchanged" about statuses. `GET /api/locations/:slug/club-context?rev=` may answer `"unchanged": true` for rules, groups and the membership, but always returns live statuses and the dock reading, a few rows read through `water_status_live`. This refines 19.3, where an unchanged rule revision could hide a new status until the next rule change.
4. The board and the kiosk poll every 30 seconds and carry the status (8.4, 8.5).
5. Offline, a cached status keeps applying until its own `expiresAt`. `statusFor()` checks each hour against `startsAt` and `expiresAt`, so an expired status stops applying with no fetch. An hour counts as covered when any part of it is inside the window, which refines 7.1's "hours inside its window": a status from 6:20 AM makes the whole 6 AM hour Stay off.
6. The status applies to members who turned club rules off. The switch covers rules, not the water status.
7. The kiosk hero uses the club's rules for everyone (the "Everyone else" row of 6.7) and the live status, so a closed status reads Stay off on the boathouse screen, not only in the banner above it.

What lag remains: a member whose app is closed sees the status on the next open, first from the cache and then from the refresh; a phone with no signal at the dock sees it when it reconnects. When the cached context is more than 30 minutes old, the hero's club line ends "Club status as of 5:40 AM." so a member knows how fresh it is.

Decision: A closed or restricted club water status applies to every member at that location, including adults who turned club rules off.
- Alternative: rules off also drops the status from the verdict, leaving only the banner.

Decision: The kiosk hero applies the club's rules for everyone and the live status.
- Alternative: the public hero, with the status banner above it.

Decision: The club context always returns live statuses, even when the rules are unchanged.
- Alternative: a `clubs.status_rev` counter, bumped on every post and clear, compared like `rev`.

Decision: Show "Club status as of 5:40 AM." on the club line when the cached context is more than 30 minutes old.
- Alternative: only 6.9's note after 7 days.

Decision: In a viewer's two clubs at one location (3.5), the verdict applies the status of the club chosen in Rowing as; the other club's status shows as its own banner.
- Alternative: any closed status from either club applies to the verdict.

### 21.7 Engine additions (for 05)

05's tick and daily run gain club steps. They live in `worker/clubs/cron.js` and are called from 05's `worker/notify/tick.js`. Each step writes its `notify_log` rows and advances its own due column in one `env.DB.batch()`, as 05 section 5.2 does, so an overlapping tick never sends twice.

Every minute, `runClub(env, now)` runs beside 05's `runOverdue()` and `runDue()`:

| Step | Selects | Index | Then |
| --- | --- | --- | --- |
| Club overdue | `outings WHERE club_next_at <= ?`, at most 200 | `outings_club_next` (18.3) | `clubOverdueStep()` in `worker/clubs/overdue.js`. One stage per outing per tick, so after an outage the stages go out a minute apart, oldest first. |
| Evening check (phase 6) | `practices WHERE check_at <= ? AND decided_at IS NULL AND status = 'scheduled'`, at most 100 | `practices_check` (new) | Groups by location, builds each model once with 05's `loadLocationData()` and `buildModel()`, applies club rules and live statuses with `levelsFor()` per crew type, sends P5, sets `check_at = NULL`. |
| RSVP reminders (phase 6), every 5 minutes | `practices WHERE rsvp_by > ? AND rsvp_by <= ? AND status = 'scheduled'`, the 5 minutes ending 2 hours from now | `practices_rsvp` (new) | P6, for clubs with `practice.rsvpReminder` on |
| Bookings (phase 6) | `bookings WHERE status IN ('pending', 'confirmed') AND starts_at <= ?` | `bookings_due` (new) | Pending at its start: `declined`, and B2. Confirmed and unused at `start + noShowMin` (per club, read from settings): `no_show`, and nothing sent. |

Server-side models for members. When 05 builds a member's model (05 section 5.2 step 4) for the night-before, morning, Go window and practice check notices, the club part comes from `clubContextFor(env, userId, locationId)` in `worker/clubs/context.js`: the rules, the membership's crew type and the live statuses, the same data the app gets (21.6). 05's `settingsHash()` covers the status ids as well as `S`, so members under a closed status never share a model with members outside it.

The daily run (05's `17 9 * * *`) calls `dailyClub(env, now)`:

- Club deletions due, and tombstones past 90 days (3.6).
- Retention (16.3).
- Age-up at `junior_until` (4.5), with M6.
- Join requests older than 30 days declined (4.4), with no notice.
- Clearance reminders (S12) and emergency info checks (S11).
- The September 1 reminder (M9), for clubs where it is September 1 in the club's time zone.

Event notices (everything not above) are enqueued by the API handler after its D1 write, inside `ctx.waitUntil()`, through 05's `worker/notify/events.js`: `enqueueWaterStatus(env, status, prev)`, `enqueuePractice(env, practice, change)` and a new `enqueueClub(env, { sub, club, refId, spec, copy })`. Delayed jobs (S7 at 7 PM, and held notices) use the queue's `delaySeconds`, at most 86,400 (05 section 4.4).

Stale checks on delivery, for held or delayed jobs (05 section 4.4 drops these with `skip_reason = 'stale'`):

| Subkind | Dropped when |
| --- | --- |
| `water_status` | The status was replaced or cleared since (05 already does this) |
| `practice` | `sequence` moved on (the newer notice carries the change), or the practice has started |
| `lineup` | A newer publish of the same practice exists |
| `booking_request` | The booking is no longer `pending` |
| `booking` | The booking changed status again |
| `announcement` | The announcement was deleted |
| `rsvp` | The person answered |
| `against_rule`, `incident` | Never. They are records. |

`check_at` is a new column for phase 6. `checkAt(practice, decideAt, tz)` in `src/schedule.js` returns the local `decideAt` on the evening before the practice's local date, or null when the practice starts more than 18 hours after that (12.2's window). With the default 19:45, a Tue Oct 20, 2026 practice at 5:45 AM gets Mon Oct 19 at 7:45 PM EDT (23:45 UTC), 10 hours ahead. A 1:30 PM practice is 17 hours 45 minutes ahead and gets a check; a 3 PM practice is 19 hours 15 minutes ahead and gets none. `check_at` is set when a practice is saved, recomputed for a club's future practices when `practice.decideAt` changes, and cleared when the check runs or a coach decides.

New schema for 08 to fold into 18.2, and one column for 05's table:

```sql
-- 06, phase 6: a column in 18.2's CREATE TABLE practices
  check_at INTEGER,                         -- evening check time, ms (21.7)

CREATE INDEX IF NOT EXISTS practices_check ON practices (check_at)
  WHERE check_at IS NOT NULL AND decided_at IS NULL AND status = 'scheduled';
CREATE INDEX IF NOT EXISTS practices_rsvp ON practices (rsvp_by)
  WHERE rsvp_by IS NOT NULL AND status = 'scheduled';
CREATE INDEX IF NOT EXISTS bookings_due ON bookings (starts_at)
  WHERE status IN ('pending', 'confirmed');

-- notify_log.subkind needs no ALTER: 08's 0008 creates it in phase 3 (08 K19).
```

Checked with `EXPLAIN QUERY PLAN` in local SQLite 3.50.4 (2026-10-17, not D1): the evening check and RSVP queries search their new indexes. `bookings_due` fixes 11.3's no-show step: with only `bookings_boat`, the plan was `SCAN bookings USING INDEX bookings_boat`, every pending and confirmed booking every minute; with `bookings_due` it is `SEARCH bookings USING INDEX bookings_due (starts_at<?)`.

Load (estimate): a 100-member club with 4 practices a week sends about 2,500 notices a month (water status 800, announcements 800, lineups 500, practice changes 250, staff duty 150). A hundred such clubs send 250,000 a month: about 750,000 queue operations at 05's 3 per message, inside the 1 million Workers Paid includes. If 10% go by email, that is 25,000 emails, about $7.70 a month past the 3,000 included (prices from 05 section 10).

### 21.8 Preferences

The club page's `#settings` tab for members, and Account, Notifications, per club (05 section 4.1), show the switches for the person's roles:

> Notifications from Putney Rowing Club
>
> Water status: Every change, or Closed only
> Practice changes (phase 6)
> Lineups and RSVP reminders (phase 6)
> Bookings (phase 6)
> Announcements and safety notes
> Club rule changes
>
> Safety officers: Overdue boats, first alert. Rows started against club rules. Incidents.
> Coaches: Evening practice check. Boats out of service for a practice. (phase 6)
> Equipment managers: Damage reports. Bookings to approve. (phase 6)
> Admins: Join requests.
>
> Overdue boats after the first alert, and closed water, always come through.

Storage:

- `water_status`: 05's row, created on join (7.6), `{ "only": "any" }` or `{ "only": "closed" }`, default `any`.
- `practice`: 05's row; the switch is its `enabled`.
- Everything else: one `club` row per person per club, `{ "off": ["announcement", "join_request"] }`, listing the subkinds turned off (`overdue_stage1` for the first overdue alert). Anything not listed is on.
- A missing `club` or `practice` row means every switch is on, so phase 6 needs no backfill for existing members. A row is written the first time someone changes a switch.
- Leaving or removal deletes the person's rows for the club, since `notify_prefs.club_id` has no foreign key (05 section 8).

Guardians see 03's two controls for each junior (03 section 11.5), worded for clubs: "Club notifications to Sam's devices: All, or Safety only" (`mute_nonsafety`) and "Send club messages for Sam to me instead" (`discontinue`).

Decision: Water status notices default to every change.
- Alternative: closed only by default, with every change as the option.

Decision: A missing `club` or `practice` pref means the defaults; rows are written on the first change.
- Alternative: create the rows on join, and backfill existing members in phase 6's migration.

## 22. Code map

Every new and changed file. "Phase" is when the file first appears or changes. Names in other documents' files are those documents' plans (01, 03, 04, 05); 06 adds to them as stated.

### 22.1 Worker, new (`worker/clubs/`)

| File | Phase | Holds |
| --- | --- | --- |
| `index.js` | 5 | `routeClubs(request, env, ctx, session)`: 19's routes as a table of regular expressions and handlers (no router dependency); `json()` and `fail(status, code, message, extra)` for 19's error shape; `CLUB_LIMIT` on writes. |
| `perm.js` | 5 | `PERMS` (one entry per row of 5.3), `clubCtx(env, req, slug)`, `can(ctx, action, target)`, `requireCan(ctx, action, target)`, `kioskCtx(env, req)` from the `rw_kiosk` cookie. |
| `shape.js` | 5 | snake_case to JSON and back (`toApi`, `fromApi`, as `shape()` in `worker/reports.js`), and the role-aware shapers `clubRow`, `memberRow`, `boardRow`, `statusRow`, `ruleRow`, `incidentRow` (5.4). |
| `clubs.js` | 5 | `createClub()` with 3.2's checks in order, `nameKey()`, `getClub`, `updateClub`, `cleanSettings()` (16.1), `listClubs` (near, `q`, location), `linkLocation`, `unlinkLocation`, `requestDelete`, `cancelDelete`, `deleteDueClubs` (daily), `succession()` (3.6). |
| `verify.js` | 5 | `startVerify`, `checkVerify`, `checkMetaTag()` (10 s, 3 redirects within the registrable domain, 256 KB), `checkDnsTxt()` (DNS over HTTPS), `FREE_MAIL`, `sendVerifyCode()`, `reviewClub`, `suspendClub`, `restoreClub` (3.3, 3.6). |
| `members.js` | 5 | Member list, roster-only add, `patchMember()` with per-field rights, remove and block, `patchMe()` (`rowAs`, `rulesOn`, `sharePhone`, `displayName`), `leaveClub()` with 4.6's effects, `ageUp()` (daily). |
| `invites.js` | 5 | `makeToken()`, `makeCode()` (the 31-letter alphabet), `normalizeCode()`, create, list, revoke, `previewInvite()`, `acceptInvite()` and `acceptCode()` with 4.3's checks in order. |
| `requests.js` | 5 | Join requests, decisions, the 30-day automatic decline (4.4). |
| `juniors.js` | 5 | `approveJunior()` (`POST /api/me/juniors/:membershipId/approve`), `guardiansFromLinks()` (`club_guardians` from 03's active `guardian_links`), `juniorsOf(env, userId)` for 03's activity view. |
| `groups.js` | 5 | Groups, the delete check (4.7), the `rules_revision` bump. |
| `rules.js` | 5 | `getRules()`, `putRules()` (the `baseRevision` conflict; validation with `LIMIT_KEYS` and the location's bindings), the public summary, W5 and W6 through `rulesDiff()`. |
| `context.js` | 5 | `GET /api/locations/:slug/club-context`: memberships, rules (or `unchanged`), live statuses and the dock reading, always (21.6); `clubContextFor(env, userId, locationId)`, the same data for 05's server-side models (21.7). |
| `status.js` | 5 | `postStatus()` (7.2's rights, 30 a day, ends the live one), `clearStatus()`, `listStatus()`, `expiryChoices()` (7.3). |
| `board.js` | 5 | `getBoard()` (8.4's sections, shaped per role), `ack()`, `resolve()`, and `clubOutingFields()`, which 04's `worker/outings.js` calls for `club`, `forCrew`, crew memberships, `ruleLvl`, `against` and `club_next_at`. |
| `overdue.js` | 5 | `clubOverdueStep(env, outing, now)`, `stageRecipients(env, outing, stage)`, the On it and all clear fan-out (8.6, 21.4). |
| `kiosk.js` | 5 | `addDevice`, `removeDevice`, `pairKiosk()` (the cookie in 8.5; only the SHA-256 stored), `kioskRoster()`, `KIOSK_LIMIT`. |
| `emergency.js` | 5 | `cleanEmergency()` (8.7's fields and lengths), called by 01's `worker/locations.js` for a `PATCH` with `emergency`. |
| `incidents.js` | 5 | File, list, read (writes `incident.view`), update, share, `incidentsCsv()` in USRowing's order with names off by default, `usrowingSummary()` for "Copy summary" (9). |
| `audience.js` | 5 | `audience(env, club, spec)` (21.2), using 03's `audienceGuard()` and `guardian_links`. |
| `notify.js` | 5 | `CLUB_SUBKINDS`, 21.3 as data (channels, urgency, TTL, topic, quiet hours rule, cap class, can turn off); `enqueueClub()`; `staleFor()` (21.7). |
| `cron.js` | 5, 6 | `runClub(env, now)` and `dailyClub(env, now)` (21.7). |
| `export.js` | 5 | The JSON export and `exportCsv(table)` (16.2), with 04's formula prefix guard for CSV cells. |
| `retention.js` | 5 | 16.3's rules, run by `dailyClub()`. |
| `boats.js` | 6 | Boats, status changes, `restricted_to` checks (10.1). |
| `damage.js` | 6 | Damage reports and the out of service effects (10.2), B4 to B6. |
| `bookings.js` | 6 | `insertBooking()` (11.2's one-statement insert), the `maxActive` count in the same batch, decide, cancel, `bumpForPractice()`, `availability()` (11). |
| `practices.js` | 6 | One practice or a series, `scope=one` and `following` edits, cancel, land, decide, `check_at` upkeep, `practicesFor()` for 05's night-before (12). |
| `attendance.js` | 6 | RSVP (choices only for juniors), attendance marks, the 14-day lock, `attendanceCsv()` (12.3, 12.4). |
| `lineups.js` | 6 | Drafts, `lineupChecks()` (13's table), `publishLineups()` with the seat diff for P7 and P8, `startLineups()` for "Start these boats". |
| `calendar.js` | 6 | `icsEscape`, `icsFold`, `icsEvent`, `buildFeed`, the token routes and the public feed (14). |
| `announcements.js` | 6 | Post (10 a day, `audienceGuard()`), list, delete (15). |

### 22.2 Shared pure modules, new (no DOM; imported by the app and the Worker)

| File | Phase | Holds |
| --- | --- | --- |
| `src/clubrules.js` | 5 | 6.9's list, plus `rulesDiff(before, after, ctx)` for W6. |
| `src/clubtext.js` | 5 | Sentences shared by screens and notices: `statusLine()`, `allowedText()` ("eights and fours with a launch only"), `boardState()`, `crewLabel()` (junior crews unnamed by role), `roleWords()`, `clearanceText()`. |
| `src/club-context.js` | 5 | `loadClubContext(slug, { force })`, the `rowhether-club-v1` cache (6.9), `clubFor(locationSlug)`, the "as of" age (21.6). In the main bundle. |
| `src/schedule.js` | 6 | `expandSeries()` (12.1), `zonedTime(dateKey, hhmm, tz)` (a wall time to ms with 05's gap and overlap rules), `checkAt()`, `rruleFor()`, `slotOk()` (11.2's grid). 05's `nextAt()` can call `zonedTime()` so both agree. |

### 22.3 App, new and lazy (`src/club/`)

Loaded with dynamic `import()` on `/club/` routes or when a club sheet opens (20). Vite puts the CSS these modules import in its own file and loads it with the chunk (from docs, https://github.com/vitejs/vite/blob/main/docs/guide/features.md, "CSS Code Splitting", read 2026-10-17).

| File | Phase | Holds |
| --- | --- | --- |
| `src/club/club.js` (not `index.js`, so the lazy chunk is named `club`; 08 8.4, K55) | 5 | `initClubPage(slug, hash)`: the club tab bar, 20's hash routes, the public or the members' view. |
| `src/club/api.js` | 5 | `clubApi(method, path, body)`: same-origin fetch, 19's error shape, and 04's `src/outbox.js` for writes that must survive no signal (board actions, incidents). |
| `src/club/create.js` | 5 | `/club/new` (3.2). |
| `src/club/join.js` | 5 | `/club/join/<token>` and code entry (4.3). |
| `src/club/public.js` | 5 | The public page (3.4). |
| `src/club/today.js` | 5 | The Today tab: banner, setup checklist, Which crews can go (6.7), and in phase 6 today's practices and pinned announcements. |
| `src/club/status-sheet.js` | 5 | "Set club water status" (7.4). |
| `src/club/rowing-as.js` | 5 | The "Rowing as" sheet (6.6). |
| `src/club/board.js` | 5 | The board (8.4): polling, sections, actions, "Start a row for a crew" (8.2), the against-rules sheet (8.3). |
| `src/club/kiosk.js` | 5 | Kiosk mode (8.5): pairing, large type, the wake lock, the name picker. |
| `src/club/rules.js` | 5 | Rules in sentences, the editor (6.1 to 6.3), the USRowing templates (6.8), the "Tell members" switch (21.4). |
| `src/club/members.js` | 5 | Members, groups, clearances, invites, requests. |
| `src/club/safety.js` | 5 | Emergency info, lessons, the incident form with its draft (`rowhether-incident-draft-v1`), the log and the USRowing panel (9). |
| `src/club/settings.js` | 5 | Club settings (16.1), screens, verification, deletion, the notification switches (21.8). |
| `src/club/club.css` | 5 | Club screen styles, from `src/styles/tokens.css`'s colors; no new colors. |
| `src/club/practices.js` | 6 | The week of practices with outlook lines, the practice sheet, series edits (12.1, 12.2). |
| `src/club/practice.js` | 6 | One practice: outlook, RSVP, attendance, the evening choice. |
| `src/club/lineups.js` | 6 | The lineup editor and its checks (13). |
| `src/club/boats.js` | 6 | Registry, boat page, damage sheet, the check lists (10.3). |
| `src/club/booking.js` | 6 | The booking sheet, also opened from Plan a row (11.5). |
| `src/club/announcements.js` | 6 | The composer, with "Juniors' guardians and the club's staff see this message." (03 section 11.4 rule 5). |
| `src/club/calendar-links.js` | 6 | Account, Calendar (14.1). |

### 22.4 App, changed

| File | Phase | Change |
| --- | --- | --- |
| `index.html` | 5 | `#clubStatus` above `#hero`; `#rowAs` above `#verdict` (from phase 2, 07; 08 K44); `#clubNotes` and `#clubAlt` under `#holds` (6.6); the public club line and "Clubs here" in `#home`; a `#club` container beside `#home` and `#detail`; one `<dialog id="clubSheet">` for club sheets. |
| `src/main.js` | 5 | Starts `loadClubContext()` beside `refresh()`'s data fetch and on the 10-minute timer, never awaited before the first `render()`; sends `/club/` paths to `initClubPage()`; starts kiosk mode on `#kiosk`. |
| `src/state.js` | 5 | `app.club` (the context for the active location) and `app.clubPick` (the club chosen per location). |
| `src/config.js` | 5 | 6.9's `LIGHT_KEYS`, `THEN` and `FACTORS`; storage keys `CLUB_KEY` (`rowhether-club-v1`), `BOARD_KEY` (`rowhether-board-v1`), `INCIDENT_DRAFT_KEY` (`rowhether-incident-draft-v1`). |
| `src/storage.js` | 5 | `loadClubCache`, `saveClubCache`, `loadBoard`, `saveBoard`, `loadIncidentDraft`, `saveIncidentDraft`, each wrapped in try/catch. |
| `src/logic.js` | 5 | 6.9: `buildModel(loc, data, S, now, { club })`, club reasons in `assess()`, the dock reading in `waterTemp()`, the daylight rule in `periodsFor()` and `m.daytime`. |
| `src/render/hero.js` | 5 | `renderClubStatus`, `renderClubLine`, `renderClubNotes`, `renderClubAlt` (6.6) and the "as of" line (21.6). |
| `src/render/now.js` | 5 | The public club status line and "Clubs here" (3.5), placed by 07. |
| `src/render/safety.js` (new) | 3 (07 4.4 shows the Safety section from phase 3; 08 K54) | The location Safety section from `loc.emergency` (8.7). Small and in the main bundle, so it works offline with the location cache. |
| `src/render/detail/week.js` | 5, 6 | Club rules factor lines (6.9); "Book a boat" on Plan a row sessions when booking is on (11.5). |
| `src/render/detail/common.js` | 5 | `limitText(S, key)`: "Club rule: 15 mph." for the How this works panels (6.5). |
| `src/settings.js` | 5 | Club labels per field and the "Use club rules here" switch (6.5). |
| `src/route.js` | 5 | `/club/new`, `/club/join/<token>` and `/club/<slug>` with its hash tabs (20), beside 01's location paths. |
| `src/reports.js` | 5 | `loadInfo()` reads `clubs` from `/api/info` and hides every club entry point when it is false. |
| `src/notify.js` (05) | 5 | The `refresh` message and club deep links (21.6). |
| `src/account.js` (03) | 5, 6 | Your clubs, guardian approvals (M3), invite code entry; calendar links in phase 6. |
| `src/styles/app.css` | 5 | The hero club lines and the status banner, with the status colors and the stay off hatch already there (`app.css` line 378). |
| `public/push-sw.js` (05) | 5 | The `refresh` post for `water_status` pushes (21.6). |

### 22.5 Worker, changed

| File | Phase | Change |
| --- | --- | --- |
| `worker/index.js` | 5 | Hands 19's prefixes to `routeClubs()`; `info()` adds `clubs: !!env.DB && env.CLUBS_ENABLED === '1'`, beside today's `reports: !!env.DB`; 05's `scheduled()` calls `runClub()` and `dailyClub()`. |
| `worker/outings.js` (04) | 5 | Calls `clubOutingFields()`; lets the club's staff use `in`, `cancel` and `PATCH` on the club's outings (19.1); sets `club_next_at` at the start. |
| `worker/locations.js` (01) | 5 | `clubs` in `GET /api/locations/:slug` (3.5); `emergency` in `PATCH` through `cleanEmergency()`. |
| `worker/notify/tick.js` (05) | 5 | Adds `runClub()` to the tick's runs. |
| `worker/notify/events.js` (05) | 5, 6 | `enqueueWaterStatus()` and `enqueuePractice()` use `audience()`; adds `enqueueClub()`. |
| `worker/notify/copy-club.js` (new) | 5 | One builder per row of 21.5, using `src/clubtext.js` and 05's `src/text.js`. |
| `worker/notify/deliver.js` (05) | 5 | `staleFor()` for club subkinds before sending a held job. |
| `worker/auth/guard.js` (03) | 5 | `requireClubRole(session, clubId, roles)`, which 03 section 10 names, as a thin wrapper over `clubCtx()` and `requireCan()`, so 03's guard and 5.3's matrix are one code path. |
| `worker/auth/delete.js`, `worker/auth/export.js` (03) | 5, 6 | 06's tables in 03 section 12.9's cascade and the account export; succession (3.6) in the same batch as the deletion. |
| `worker/auth/minors.js` (03) | 5 | Used, not changed: `audienceGuard()`, `isJunior()`, `inQuietHours()`. |
| `worker/moderation.js` (04) | 5 | Flags with target `club`; club verification reviews join the queue. |
| `worker/admin.js` (03) | 5 | Routes `/api/admin/clubs/*` to `worker/clubs/verify.js`. |
| `worker/screen.js` (04) | 5 | Screens the club description, visitor info and public status notes (3.2, 7.4). |

### 22.6 Migrations and config

| File | Phase | Holds |
| --- | --- | --- |
| `migrations/00NN_clubs.sql` | 5 | 18.1's tables and indexes. |
| `migrations/00NN_locations_club.sql` | 5 | `ALTER TABLE locations ADD COLUMN steward_club_id TEXT REFERENCES clubs(id) ON DELETE SET NULL;` and its index `locations_steward`, after `clubs` (23.1). 08 numbers it `0010_club_links.sql` with `reports.club_id` and `hazards.club_id`; `emergency` is created in phase 3 (08 K13). |
| `migrations/00NN_notify_subkind.sql` | not needed | `notify_log.subkind` is in 08's `0008` (08 K19). |
| `migrations/00NN_club_ops.sql` | 6 | 18.2's tables, with `practices.check_at` and the three indexes in 21.7. |
| `wrangler.jsonc` | 5, 6 | Rate limits `CLUB_LIMIT`, `JOIN_CODE_LIMIT` and `KIOSK_LIMIT` (phase 5) and `CAL_LIMIT` (phase 6), at the top level and in `previews`, with separate namespace ids (08 assigns them); a var `CLUBS_ENABLED`, `"1"` in `previews` and `"0"` at the top level until the owner turns clubs on. |
| `CLAUDE.md` | 5, 6 | With the owner's approval, as for every CLAUDE.md edit: the Worker routes list, the club files in the code map, the bindings, and the rule that club features are broadcast only. |

`JOIN_CODE_LIMIT` is 17's `CODE_LIMIT` renamed: 03 section 6.2 already names a `CODE_LIMIT` binding for sign-in codes, at 3 a minute.

Decision: Rename 06's code binding to `JOIN_CODE_LIMIT` (5 a minute per IP, for invite codes and kiosk pairing).
- Alternative: share 03's `CODE_LIMIT` and its limit of 3 a minute.

Decision: Ship club features behind `CLUBS_ENABLED`, on in Previews and off in production until the owner turns it on, as `reports` follows the `DB` binding today.
- Alternative: no flag; clubs go live with the merge to `master`.

Migration order inside phase 5: `00NN_clubs.sql`, then `00NN_locations_club.sql`, then 03's `00NN_guardians.sql`, because `guardian_links.club_id` references `clubs(id)`. Checked locally (SQLite 3.50.4 with `PRAGMA foreign_keys = ON`, 2026-10-17, not D1): a table may be created with a reference to a table that does not exist yet, but every insert into it then fails with "no such table: main.clubs", even when the column is NULL. 08 numbers the files in this order.

Tests are listed in 24.

## 23. Phase plan

09-roadmap.md owns the phase list and the exit criteria. This is 06's proposal for both.

### 23.1 What earlier phases must leave in place

| From | Phase | What | Why |
| --- | --- | --- | --- |
| 03 | 2 | Accounts, sessions, `audit_log` with `kind = 'club'`, `sendEmail()`, `worker/auth/minors.js` | Memberships, the audit trail and safeguarding checks |
| 04 | 3 | `outings` and `outing_crew` created with 06's columns, unused (8.1, 18.3) | No rebuild of a live table in phase 5 |
| 01 | 3 | `locations` created without `steward_club_id`; phase 5 adds it (22.6) | As 01 writes it today, phase 3's `locations` references `clubs(id)`, which arrives in phase 5. With foreign keys on, that table refuses every insert until `clubs` exists ("no such table: main.clubs"), so the Putney seed would fail. Adding the column in phase 5 works because its default is NULL (checked locally, SQLite 3.50.4, 2026-10-17, not D1). 01's field table already marks `stewardClub` as phase 5. |
| 05 | 3, 4 | The tick, the queue, Web Push, `src/notify.js`, `public/push-sw.js`; `notify_prefs` and `notify_log` with `club` in their kind lists (21.1) | Every club alert rides on them; SQLite cannot widen a CHECK later |
| 03 | 5 | Guardian links, migrated after 06's `clubs` (22.6) | `guardian_links.club_id` references `clubs(id)` |

Decision: 01 creates `locations` in phase 3 without `steward_club_id`, and phase 5 adds it with `ALTER TABLE ... REFERENCES clubs(id) ON DELETE SET NULL`.
- Alternative: create the empty `clubs` table (18.1's statement) in phase 3, before `locations`.
- Alternative: drop the foreign key and check the club in `worker/locations.js`, as 05 does for `notify_prefs.club_id`.

### 23.2 Phase 5: clubs and safety

Built in this order on dev, behind `CLUBS_ENABLED`. Each step is usable on its own.

| Step | Ships | Sections |
| --- | --- | --- |
| 5a | Clubs, verification and the moderator review, the public page, club locations, memberships, invites, join requests, juniors and guardians, groups, roles, clearances, deletion, the full export | 3, 4, 5, 16 |
| 5b | Club rules, the hero lines, Rowing as, Which crews can go, the USRowing templates | 6 |
| 5c | Water status, the dock reading, the public line, W1 to W4, the refresh path | 7, 21.6 |
| 5d | The board, crew starts, the against-rules warning, the kiosk, the club overdue chain, emergency info | 8 |
| 5e | Incidents, the USRowing panel, shared safety notes | 9 |
| 5f | The other phase 5 notices (S6 to S12, W5, W6, M1 to M9), the notification switches, retention | 16.3, 21 |

Not in phase 5: boats, damage reports, booking, practices, RSVP, attendance, lineups, calendar feeds and announcements.

Exit criteria:

1. Tests. `npm test`, `npm run build` and `npx wrangler deploy --dry-run` pass. The permission matrix test covers every phase 5 row of 5.3. Every safety case in 24.5 passes. 01's golden Putney test passes unchanged.
2. The Now screen. The entry chunk grows by at most 4 KB gzipped (20; 08 confirms the budget), and the first render never waits for club data (24.6).
3. Putney without a club. With no club context, Putney Landing looks and behaves exactly as before: the golden test, plus screenshots at 390 and 1280 px that match the phase 4 build.
4. Pilot. One verified club uses water status and the board on dev for 4 weeks covering at least 20 practices, with its paper logbook kept in use. Board and logbook agree on every boat out, or each difference has a written cause.
5. Drills. The three overdue drills in 24.7 reach every safety officer within 2 minutes of each stage's planned time, on at least one iPhone Home Screen app and one Android phone.
6. Safeguarding. The owner and the pilot club's safe sport or welfare contact walk through 5.2 and 03 section 11.4 on dev (a junior joining with guardian approval, guardian copies, mute and discontinue, the kiosk and public views with a junior crew out) and sign off. 03's legal review (03 section 13.5) covers junior accounts, guardian links and incident retention.
7. Moderation. The first 10 verification requests are each reviewed within 3 days, with 3.3's checklist.
8. Production. A production D1 database exists (CLAUDE.md: production has none yet) with the phase 5 migrations applied; CLAUDE.md is updated with the owner's approval; the owner gives the go-ahead to merge `dev` into `master` and to set `CLUBS_ENABLED` to `"1"`.

### 23.3 Phase 6: club operations

| Step | Ships | Sections |
| --- | --- | --- |
| 6a | Boats, damage reports, out of service, launch and shell checks | 10 |
| 6b | Practices and series, outlook lines, the evening check, cancel and land, RSVP, attendance and its report, P1 to P6 | 12, 21.7 |
| 6c | Lineups, P7 to P9, Start these boats | 13 |
| 6d | Booking, availability, bumping, Book a boat from Plan a row, B1 to B3 | 11 |
| 6e | Calendar feeds, announcements, the CSV exports and use reports, learn-to-row listings on the public page | 14, 15, 16.2 |

Exit criteria:

1. Tests. The phase 6 rows of the permission matrix; booking concurrency; practice series across 2026-11-01 and 2027-03-14; the iCal golden file; the evening check sent once per practice under overlapping ticks.
2. Practices pilot. A junior program runs 4 weeks of practices with the evening check, RSVPs and published lineups. Coaches get the check within 2 minutes of `decideAt` on every evening before a morning practice, and guardians get lineup and cancellation notices.
3. Booking pilot. A masters group books for 4 weeks with no double booking and no boat shown as free that was not.
4. Calendars. The device checks in 24.7 pass.
5. The Now screen is unchanged by phase 6 apart from the Plan a row button; every phase 6 screen loads lazily.
6. Retention and export cover the phase 6 tables (16.2, 16.3), and 03's account export and deletion include RSVPs, attendance and seats.

### 23.4 Later

The Later rows of 2.2 (32 to 40). Each needs its own plan before work starts. A suggested order: SMS escalation (row 36, when 05 revisits SMS), one status for a shared waterway (33), damage report photos (35, with 04's photo decision), the launch-to-shell ratio check (37), guest rows (38), traffic pattern diagrams (32), maintenance schedules (40), erg links (39), a regatta calendar (34).

## 24. Tests

`npm test`, `npm run build` and `npx wrangler deploy --dry-run` keep passing on every push (CLAUDE.md). Nothing calls a real push service, email provider, DNS resolver or club website: `fetch`, the queue, push and email are stubbed, as `test/suggest.test.js` stubs Turnstile, Claude and GitHub.

### 24.1 Setup

- Database: 03's `test/helpers/d1.js`, a D1-shaped wrapper over `node:sqlite` with `PRAGMA foreign_keys = ON` that loads every file in `migrations/`. Club tests need real CHECKs, partial unique indexes and cascades: 11.2's booking insert, `memberships_one`, the junior `rules_on` CHECK. The `fakeDB()` in `test/reports.test.js` stays for tests that only check SQL text.
- Fixture club, `test/fixtures/club.js`: `seedClub(db, { now })` creates Putney Rowing Club at Putney Landing with one person per role. Alex R. (admin and safety officer), Robin S. (safety officer), Lee M. (coach), Pat K. (equipment manager), Sam L. (adult member, Masters), Jamie P. (junior with an account, Juniors), Canary Junior (roster-only junior), Morgan P. (guardian of both juniors, kind `guardian`), Val V. (signed in, not a member), a paired kiosk, and the groups Juniors, Novices and Masters. It returns the ids and `as(role)`, which builds a request with that person's session cookie.
- Canary strings: the roster-only junior is named "Canary Junior", Morgan's shared phone is "+18025550199", and a seeded incident's narrative contains "CANARY-NARRATIVE". Shaping tests search whole JSON responses, `notify_log` rows and queued payloads for them.
- Clock: every handler takes `now`, as `addReport(request, env, now)` does today. Overdue and practice tests use a fake clock and call `tick(env, now)` minute by minute.
- Stubs: `NOTIFY_QUEUE` records `send` and `sendBatch`; `sendPush` and `sendEmail` record calls and can answer per endpoint (201, 410, 503); `fetch` serves fixture pages for verification and recorded Putney responses for server-side models (05's `loadLocationData()`, 01's golden fixtures).

### 24.2 Pure unit tests

`test/clubrules.test.js` (`src/clubrules.js`):

- `ruleMatches`: each scope field alone and combined; disabled rules; months at 11 PM on Oct 31 and at 0:00 on Nov 1 in the location's zone, not UTC.
- `stricter`: upper keys take the smaller value, lower keys the larger, empty takes the other. `stricterReq`: booleans OR, temperatures the larger, `pfd` none then carry then wear, `daylight`, the clearance union.
- `mergeRules` with 6.8's templates turned on, for Juniors 8+ with a launch, Novices 1x without one, and Masters 1x without one.
- `clubSettings`: the base; a club value replaces a location default whether stricter or looser; a stricter personal value is kept; a looser or blank one is ignored; `_from` per key; a junior membership ignores `rulesOn = false`.
- `clubReasons` for every requirement key in 6.3 at a fixture hour: the launch rules with and without a launch; the four-oar rule by class through `OARS`; `daylight` turns twilight hours to Stay off and `periodsFor()` starts at sunrise; a missing and an expired clearance; no water temperature with a water rule gives Caution `club_water`; PFD notes add no level.
- Fixed rules cannot be loosened: a club with `windOff: 60` still gets Stay off for a thunderstorm code, dark, freezing rain, air under 32°F and visibility under a quarter mile.
- `crewTypes`: deduplication, the "1x, 2x" label, the 12-row cap. `levelsFor` matches `assess()` run by hand for each crew type.
- `rulesText` gives a sentence for every key. `rulesDiff` is empty for a member whose crew type no changed rule matches.
- No club: `buildModel()` without `club` matches 01's golden files (`test/golden.test.js` runs unchanged).

`test/clubtext.test.js`: `statusLine` for closed, restricted ("eights and fours with a launch only"), open with a note, and a status over 24 hours with its date; `boardState` for on the water, due in 10 min, due now, overdue 12 min, on it and back; `crewLabel` gives "Junior crew of 9 with Lee M." to an adult member and the names to staff.

`test/schedule.test.js` (`src/schedule.js`, phase 6):

- `expandSeries`: Tue and Thu at 5:45 AM from Oct 20 to Nov 19, 2026 gives 10 practices; Oct 20 is 09:45 UTC and Nov 3 is 10:45 UTC, after the Nov 1 change; `INTERVAL=2`; past dates skipped; the 400-practice and 366-day caps.
- `zonedTime`: 2:30 AM on 2027-03-14 in New York, which does not exist, becomes 3:30 AM; 1:30 AM on 2026-11-01 takes the first one; the same results as 05's `nextAt()`.
- `checkAt`: a 5:45 AM practice gets 7:45 PM the evening before; a 1:30 PM practice gets one; a 3 PM practice gets none; a change of `decideAt` moves it.

`test/club-calendar.test.js` (`worker/clubs/calendar.js`):

- `icsEscape` for commas, semicolons, backslashes and newlines. `icsFold` at 75 octets counted in UTF-8 bytes, so "°F" and accented names never split inside a character, with each continuation line starting with one space. CRLF line ends. 14.2's sample feed byte for byte.
- UTC times; `STATUS:CANCELLED` and the "Land: " prefix; `SEQUENCE` from `practices.sequence`; at most 500 events; no other person's name in a feed (the canary).
- The `ETag` is stable for the same body; `If-None-Match` gets 304; unknown and revoked tokens get the same 404; `last_used_at` is written at most once an hour.

`test/club-copy.test.js` (`worker/notify/copy-club.js`):

- Every row of 21.5 built from fixture data: the title at most 50 characters and the body at most 240; the title starts with the short name; no em dash or en dash characters; times in the club's zone; " (dev)" after the short name on dev.
- No word "call" in any title or push body. Email footers are checked on their own, against 8.6's exact sentence, which uses "call" as a verb.
- Push bodies never contain the canary narrative, an injury detail, a request note, or a junior's name for anyone but that junior's guardians and staff.

### 24.3 Permission matrix

The matrix in 5.3 is the specification, so the test reads a hand-written copy of it, not `PERMS` (5.4).

- `test/fixtures/club-perms.js`: one entry per row of 5.3, for example `{ action: 'status.set', public: false, visitor: false, junior: false, member: false, guardian: false, coach: true, safety: true, equipment: false, admin: true }`, with `'own'`, `'junior'`, `'if_public'` and `'if_allowed'` where 5.3 says so. Phase 6 rows carry `phase: 6`.

`test/club-perms.test.js`:

1. Every action in `PERMS` has a row in the fixture, and every fixture row names an action in `PERMS`, so a new action cannot ship without a matrix row.
2. `can(ctx, action, target)` for every cell, with targets for "own" (Sam's record, then Jamie's) and "junior" (Morgan with Jamie's record, then with another junior's).
3. Combined roles: Alex (admin and safety officer) has the union. A coach cannot lift a status a safety officer set, and can make it stricter (7.2).
4. HTTP: for every route in 19.1 and 19.2, one refused role gets 401, 403 or 404 in 19's error shape with no D1 write (row counts before and after), and one allowed role gets 2xx. An unverified club answers 404 to Val and 200 to its members.
5. Kiosk: the kiosk cookie reaches only the board, the roster, start and back; every other route answers 403.
6. Shaping: for each role, the members list, board, club page, status, rules, incidents, export and kiosk roster, checked against the visibility the fixture records from 5.3 and 8.4's board table. "Canary Junior" never appears in public, visitor, kiosk or adult member responses; it appears in an equipment manager's member list but not on their board; and Jamie sees it only on a boat they share.
7. Morgan's phone appears only to safety officers and coaches, and only while `sharePhone` is on (5.2 rule 8).
8. Never in any response: account emails, token hashes, `verify_token` for anyone but admins.

### 24.4 Worker tests

Phase 5:

- `test/clubs.test.js`: creation checks in 3.2's order (standing, limits, fields, slug, a similar club and `confirmDifferent`, the screen pending); `nameKey()` folds "Putney Rowing Club" and "Putney R.C." to `putney`; reserved slugs refused by the CHECK and in code. Verification: the meta tag must match exactly, a redirect to another registrable domain is refused, a 300 KB page is read only to 256 KB; DNS TXT at the domain and at `_rowhether.`; email at the domain with free mail refused, 5 tries and 30 minutes; moderator approve and reject. Deletion: 14 days, cancel, the daily batch, the tombstone holding the slug for 90 days, outings kept with club fields cleared, `locations.steward_club_id` set NULL.
- `test/club-members.test.js`: invite tokens of 22 characters; codes of 8 from the 31-letter alphabet, with case and hyphens ignored; expiry and uses, with `WHERE uses < max_uses` holding under two accepts in parallel batches; staff-role invites single use within 7 days; 4.3's accept errors in order. Join requests: 5 pending, 1 per club, 30 days after a decline, minors refused. Juniors stay `pending_guardian` until a guardian approves; at most 4 guardians; the `rules_on` CHECK. Age-up at `junior_until`; 4.6's leave effects; the last admin cannot leave; succession on account deletion; linking an account to a roster entry keeps its history.
- `test/club-rules.test.js`: `PUT` with a stale `baseRevision` gets 409 with the current rules; 19.3's validation messages; a flow key at a location with no flow binding refused; the 40-rule limit; deleting a group cascades its rules and bumps the revision.
- `test/club-status.test.js`: 7.2's rights; 30 posts a day; the 30-day limit; a new post ends the live one (`replaced_by`); expiry choices from `sunOn()` in the club's zone; the public line only for verified clubs with `status_public`, its note left out until screened.
- `test/club-context.test.js`: 19.3's response; `unchanged` for rules with statuses still present (21.6); a guardian who does not row gets no hero context; a member of two clubs gets both.
- `test/club-board.test.js`: 8.4's sections and order; shaping per role; a staff start for a crew of roster-only members with no `user_id`; any number of crew outings with no `user_id` out at once while each account has at most one; a member on two boats that are out refused; `against` set from `ruleLvl` 2 or an excluded status; Back, Add time, On it and each Resolve outcome; 04's routes accept the club's staff.
- `test/club-overdue.test.js`: 24.5 B.
- `test/kiosk.test.js`: a 6-digit pairing code valid 10 minutes; `JOIN_CODE_LIMIT`; cookie attributes exactly as 8.5; only the SHA-256 stored; 5 screens; `KIOSK_LIMIT`; a revoked device refused; the roster as first name and last initial with no juniors.
- `test/incidents.test.js`: a junior cannot file (403); conditions prefilled from the outing's `snap`; each staff read writes `incident.view`; the CSV in USRowing's order with names replaced by roles unless `names=1`; share publishes the summary and sends S10; S8 and S9 rows carry no narrative (the canary).
- `test/club-notify.test.js`: 21.2's rules in order. Roster-only skipped; guardians added with `forJunior`; an `audienceGuard()` refusal returns 409 `needs_adult` and writes nothing; `discontinue` drops Jamie's row and keeps Morgan's; `mute_nonsafety` writes Jamie's row as `inapp`; the most protective guardian setting wins; junior quiet hours hold a 10:30 PM cancellation for Jamie until 6 AM while Morgan gets it at once; the actor left out; one row per person per event (Morgan with two juniors in one lineup). Caps: the ninth member push and the 21st staff duty push become in-app. The `off` list respected; a missing pref means on; 21.7's stale drops; 21.4's dedupe keys, with a repeated handler call inserting nothing new.
- `test/club-export.test.js` and `test/club-retention.test.js`: 16.2 (no emails, incidents only for safety officers, 5 a day, the audit row) and 16.3 row by row with a fake clock.
- `test/migrations.test.js` (04's, extended): the phase 3 Putney seed into `locations` succeeds before `clubs` exists; after phase 5, `steward_club_id` refuses an unknown club and becomes NULL when the club row is deleted; 03's `guardian_links` accepts rows after 06's migration.

Phase 6:

- `test/boats.test.js`: names unique among boats not retired; `restricted_to`; out of service cancels future bookings with B3 and tells coaches with B5.
- `test/bookings.test.js`: overlap refused, back-to-back allowed; two inserts for one slot in parallel batches give one booking; `maxActive`; `advanceDays`; slot boundaries in the club's zone across Nov 1; restricted boats; juniors only with `juniorsCanBook`; approval and the automatic decline at the start; no-show at `start + noShowMin`; bumping by a coach more than 12 hours ahead and only by equipment managers or admins within 12 hours.
- `test/practices.test.js`: a series save creates its rows; "this" and "following" edits; a weekday change ends the old series and keeps rows with RSVPs; `sequence` moves for calendar changes; P2 and P3 sent; P4 only within 7 days. The evening check with fixture forecasts: Stay off and Caution reach the coaches at `check_at`, Go sends nothing unless `decideGo`; the choice sets `decided_at`; one check per practice under overlapping ticks.
- `test/club-rsvp.test.js`: choices only for juniors (a junior's `note` gets 400 with `field: "note"`); guardians answer for juniors and the record keeps who answered; late changes marked; counts by group.
- `test/lineups.test.js`: 13's checks (errors block publishing, warnings do not); publishing notifies seated people and guardians; publishing again notifies only changes; "Start these boats" creates outings with crew from the seats.
- `test/announcements.test.js`: 10 a day; the audience includes guardians and staff; `audienceGuard()`; deleting before delivery drops the held job.

### 24.5 Safety cases

These must pass before any phase 5 build reaches production. Each is a named `describe` block, so a failure reads as the rule it broke.

A. Closed water never shows Go to members (`test/club-safety.test.js`).

Setup: 01's golden "calm June day" forecast for Putney (Go all day), the fixture club, and a closed status from 6 AM to 6 PM. For every member kind (adult, junior), with club rules on and off, and for every crew type from `crewTypes()` plus "Everyone else":

1. Every hour from 6 AM through the 5 PM hour is level 2 with reason `club_status`; the 6 PM hour is not (the start counts, the end does not). A status from 6:20 AM to 6:09 PM also makes the 6 AM and 6 PM hours Stay off, because any overlap covers the hour (21.6 rule 5).
2. `m.cur` inside the window is Stay off; `holds` and "Next go" never name a time inside the window.
3. Every period that overlaps the window is Stay off.
4. `callRuns()` for today has no Go run inside the window, and the Week view line reads "6 AM to 6 PM: club water closed".
5. `planSessions()` returns no session inside the window.
6. `levelsFor()` (Which crews can go) shows Stay off in every cell inside the window.
7. Server side, built as 05 builds it for this member: a `night_before` outlook for a morning inside a three-day closure says Stay off with the club reason; a `go_window` alert skips the closed days; the evening practice check reads Stay off.
8. The kiosk hero is Stay off (21.6 rule 7).
9. Restricted: crews outside `allowed` get Stay off; crews inside keep their own result.
10. A status for one location applies only there; a status for all locations applies at each.
11. Morgan, a guardian who does not row, gets no result (6.10) and does see the banner.

Delivery of the status itself:

12. The club context returns a new status when `rev` is current (21.6 rule 3).
13. A cached context with a closed status applies offline (with `fetch` throwing) until `expiresAt`, and stops after it with no fetch.
14. A cleared status stops applying after the next fetch.
15. W1 posted at 11 PM is sent at once: to Jamie despite `mute_nonsafety` and `discontinue`, by push and email, with no cap.

B. Overdue escalation reaches the safety officer (`test/club-overdue.test.js`).

Setup: Sam L. starts a 1x at 6:10 AM, back by 7:30 AM, with a grace of 15 minutes and escalation after 15 more; Robin and Alex are the safety officers; a fake clock with `tick()` each minute.

1. Stage 1 at 7:45 AM reaches Robin and Alex by push within one tick, and not before 7:45.
2. Robin has no working push subscription: Robin gets an email in the same job.
3. Alex's only subscription answers 410 during delivery: it is removed, and Alex gets this stage by email (`emailIfNoPush`).
4. With no active safety officer, stage 1 goes to admins, and the board shows "Nobody has the safety officer role."
5. When every stage 1 recipient is aboard (Robin is the sculler and the only safety officer), admins get stage 1 too.
6. Robin turned stage 1 off: Robin gets no stage 1 and does get stage 2.
7. Nobody taps On it: stage 2 at 8:00 AM reaches all safety officers and admins. For a junior eight that Lee started with Jamie and Canary Junior aboard, it also reaches Lee and Morgan, the guardian of both, including through the roster-only junior.
8. On it at 7:50 AM: no stage 2; stage 3 still at 8:30 AM; S4 reaches the stage 1 recipients except the person who tapped.
9. "Back safe" at 8:02 AM: no later stage; S5 reaches every stage 1 and 2 recipient, by email too for those emailed.
10. A safety officer appointed at 7:55 AM gets stage 2.
11. Quiet hours (a row due at 3 AM), caps (a recipient already at 8 and at 20), `mute_nonsafety`, `discontinue` and the `off` list never stop stages 2 and 3.
12. The club suspended at 7:40 AM, or set to delete, still escalates this outing (21.4).
13. Two ticks in the same minute send each stage once. After a 40-minute outage, stage 1 goes out, then stage 2 one tick later, and neither twice.
14. A kiosk row with no account (`user_id` NULL) escalates the same way.
15. A member's own row runs 04's personal chain and the club chain: the rower gets 04's messages, the safety officers get the club's, and neither repeats the other.
16. The night of 2026-11-01: a row due at 1:40 AM EDT (05:40 UTC) reaches stage 1 at 1:55 AM EDT and stage 2 at 1:10 AM EST (06:10 UTC), at the right instants, with those local times printed.

C. A row against club rules is recorded, never blocked (8.3): the start succeeds with `against = 1` and S6 goes out; after 20 in a day, one S7 at 7 PM.

D. Juniors send no free text to adults (5.2 rule 3): every write route a junior can reach refuses free text (the RSVP note, the damage description, a join note, an incident) with 400 or 403, and `audienceGuard()` blocks a lone coach writing to a junior with no guardian.

### 24.6 Browser checks (Playwright, as in CLAUDE.md)

In Chromium and WebKit, at 390 px light and 1280 px dark unless stated, with `/api/info` stubbed as `{ env: 'dev', clubs: true }` and the club endpoints stubbed from the fixture club:

- Now screen, as Sam at a pinned midday: the club line; Stay off under club rules with "Without club rules: Caution." (6.6); the Rowing as sheet changes the result, and the choice survives a reload with the network off.
- A closed status: the banner says "closed" in words and carries the hatch; the hero says Stay off; the Week view shows the line. Pin the clock past `expiresAt` and the hero returns to its own result with no request.
- A `refresh` message posted to the page, as `public/push-sw.js` would post it, redraws the hero with the new status as soon as the stubbed response arrives.
- The first render does not wait for the club context: with that response delayed 5 seconds, the hero is in the DOM before it arrives (as 03 section 20.3 checks for `/api/me`).
- Signed out at Putney Landing with a public status: one line under the hero; the verdict unchanged.
- At a pinned 9 PM, the hero shows tomorrow morning under club rules, and with the daylight rule the morning starts at sunrise.
- The club tabs `#today`, `#board`, `#rules`, `#members`, `#safety` and `#settings`, and in phase 6 `#schedule`, `#practice/<id>` and `#boats`, at 360, 390 and 1280 px: no horizontal page scroll, the tab bar stays pinned, the header buttons stay on one row.
- Board: rows in 8.4's order; the state words in the row text; overdue rows carry the hatch; On it and Back show after the next poll; offline it shows "Not updated since 6:41 AM. No connection." and queues actions in the outbox.
- Start a row against club rules: the sheet opens with "Go back" focused; Escape leaves the row unstarted; "Start anyway" starts it.
- Kiosk at 1280 px and with an iPad user agent: body text at least 20 px, 44 px targets, the name picker, a wake lock request (with `navigator.wakeLock` stubbed), and no animation with reduced motion.
- Rules editor: usable by keyboard alone, every input labeled, the conflict message on a stubbed 409.
- Incident form: typing saves a draft; a reload restores it; Send while offline queues it.
- Account: Your clubs, a guardian approval, and invite code entry typed in lowercase with no hyphen.
- Plan a row (phase 6): "Book a boat" shows only when booking is on; the sheet lists the free boats; after booking, the session shows "Booked: Bellows".
- Bundle: `scripts/budget.mjs` (07 10.6; 08 K39) compares the gzipped entry chunk with `budget.json`, whose phase 5 step is 4,000 B (20; 08 11.2). CI runs it after `npm run build`.

### 24.7 Device and pilot checks

Before phase 5 reaches production:

- Overdue alerts on an iPhone Home Screen app, an Android phone in Chrome, and desktop Chrome: stage 1, stage 2 replacing it on the lock screen (the shared tag), On it, the all clear, and the email for a person with notifications off.
- Three staged overdue drills with the pilot club's safety officers on dev: no On it; On it and then resolve; resolve before stage 2. The paper logbook stays in use. Each stage reaches every safety officer within 2 minutes of its planned time.
- A week of the kiosk on a boathouse tablet: pairing survives restarts, the screen stays on or says to keep it plugged in, and the board stays current.

Before phase 6 reaches production:

- Subscribe the calendar feed in Apple Calendar (iOS and macOS), Google Calendar and Outlook. A cancelled practice shows as cancelled after the app refreshes, and times are right across Nov 1.

## 25. Open questions and decisions

### 25.1 Decisions

Every "Decision:" line in this document, recommendation first, then the alternatives, with the section that explains it.

From sections 3 to 11:

Decision: Verified status needs a domain proof (website tag, DNS record or email at the domain) or written evidence, then a moderator's approval. Unverified clubs work fully for their members but stay private. (3.3)
- Alternative: owner approval only, with no automatic proof.
- Alternative: automatic verification by domain proof alone.
- Alternative: no verification, only an "Unverified" label.

Decision: Allow roster-only members, so a junior program can use lineups, attendance and the board without every athlete having an account. (4.2)
- Alternative: require an account for every member.

Decision: With club rules on, a member's own values can be stricter than the club's but never looser. (6.5)
- Alternative: the member's values always win, with a warning.
- Alternative: club rules replace personal values entirely while on.

Decision: A club rule replaces the location default even when it is looser. (6.5)
- Alternative: club rules can only tighten location defaults.

Decision: Club rules are on by default for members at club locations. Adults can turn them off per location; juniors cannot. (6.5)
- Alternative: on for everyone, with no switch.
- Alternative: off by default, opt in.

Decision: When no status is set, show nothing. "Open" is something a coach says on purpose, and it expires. (7.1)
- Alternative: show "Open" whenever nothing else is set.

Decision: Use a club dock reading under 24 hours old in place of the gauge, for that club's members only. (7.5)
- Alternative: information only, as 04 does for public reports.

Decision: Create `outings` in phase 3 with the club columns already present, so phase 5 needs no table rebuild. (8.1)
- Alternative: rebuild `outings` in phase 5's migration.

Decision: Warn and record when a row starts against club rules or a closed water status. Never block. (8.3)
- Alternative: block the start unless a coach or safety officer approves it.

Decision: Ship the kiosk in phase 5 with the board. (8.5)
- Alternative: phase 6.
- Alternative: no kiosk.

Decision: Emergency info lives on the location, public, edited by steward clubs and moderators. (8.7)
- Alternative: per club.
- Alternative: free text in the location's launch notes.

Decision: Keep incident records, names included, until the club deletes them or the club is deleted; 03 states the legal basis. (9.3)
- Alternative: replace names with "Former member" when a person deletes their account.
- Alternative: delete incidents after a fixed period such as 7 years.

Decision: Coaches can take a member's booking for a practice, with notice to the member; only equipment managers or admins can within 12 hours of the start. (11.4)
- Alternative: member bookings always win.
- Alternative: practices always win, with no time limit.

From sections 21 to 23:

Decision: Club notifications use one new 05 kind, `club`, with a `subkind` column. (21.1)
- Alternative: one 05 kind per notification.
- Alternative: the subkind only in the dedupe key prefix.

Decision: Staff duty notices have their own cap of 20 a day per person per club. (21.3)
- Alternative: count them against 05's 8.

Decision: Practice, lineup, booking and restricted water status notices are not held by quiet hours when the session or status begins before the person's quiet hours end. (21.3)
- Alternative: hold them, as 05 section 3.1 says.
- Alternative: never hold practice notices.

Decision: When every stage 1 recipient is aboard the overdue boat, stage 1 also goes to admins. (21.4)
- Alternative: stage 1 as 8.6 says.

Decision: The club chain keeps running for outings already on the water when a club is suspended or set to delete. (21.4)
- Alternative: stop it with the club, leaving 04's personal chain.

Decision: Remind members 30 days before, and on the day, a clearance that a club rule needs runs out. (21.4)
- Alternative: show the expiry only on the club page.

Decision: Club rule changes push to safety officers and admins; members get an in-app notice, and a push only when the editor ticks "Tell members". (21.4)
- Alternative: push every affected member on every save.
- Alternative: no notice; the hero shows the new result.

Decision: Changes to practices more than 7 days ahead are not pushed. (21.4)
- Alternative: push every change.
- Alternative: a 14-day window.

Decision: A closed or restricted status applies to every member at that location, including adults who turned club rules off. (21.6)
- Alternative: rules off also drops the status from the verdict, leaving only the banner.

Decision: The kiosk hero applies the club's rules for everyone and the live status. (21.6)
- Alternative: the public hero with the banner above it.

Decision: The club context always returns live statuses, even when the rules are unchanged. (21.6)
- Alternative: a `clubs.status_rev` counter compared like `rev`.

Decision: Show "Club status as of 5:40 AM." on the club line when the cached context is more than 30 minutes old. (21.6)
- Alternative: only 6.9's note after 7 days.

Decision: For a viewer in two clubs at one location, the verdict applies the status of the club chosen in Rowing as; the other club's status shows as its own banner. (21.6)
- Alternative: any closed status from either club applies.

Decision: Water status notices default to every change. (21.8)
- Alternative: closed only by default.

Decision: A missing `club` or `practice` pref means the defaults; rows are written on the first change. (21.8)
- Alternative: rows on join, and a backfill in phase 6's migration.

Decision: Rename 06's code binding to `JOIN_CODE_LIMIT` (5 a minute per IP, for invite codes and kiosk pairing). (22.6)
- Alternative: share 03's `CODE_LIMIT` at 3 a minute.

Decision: Ship club features behind `CLUBS_ENABLED`, on in Previews and off in production until the owner turns it on. (22.6)
- Alternative: no flag; clubs go live with the merge to `master`.

Decision: 01 creates `locations` in phase 3 without `steward_club_id`, and phase 5 adds it with `ALTER TABLE ... REFERENCES clubs(id) ON DELETE SET NULL`. (23.1)
- Alternative: create the empty `clubs` table in phase 3, before `locations`.
- Alternative: drop the foreign key and check the club in `worker/locations.js`.

### 25.2 Open questions

- Pilot. Which club pilots phase 5, and whether the club at Putney Landing wants to. The plan assumes a club with a safety officer willing to run three overdue drills and keep a paper logbook alongside for 4 weeks.
- Escalation timing. The 15, 15 and 30 minute steps (8.6) and the 2-minute delivery target are first guesses. Junior programs may want shorter (04's open question). Ask the pilot club.
- Afternoon practices. 12.2's 18-hour window gives a 3 PM practice no evening check. Ask pilot coaches whether a midday check for afternoon practices is wanted.
- Warn, not block. Whether clubs accept it (8.3). Watch the `against` rate and S6 volume in the pilot.
- The kiosk lets anyone at the boathouse pick any adult's name (8.5), as a paper logbook does. Confirm with the pilot club and 03's legal review.
- Legal review (03 section 13.5): roster-only athletes under 13 (03 section 11.7), incident retention when minors are named (9.3), the guardian phone sharing default (5.2 rule 8).
- A safety officer with no working device. M4 tells them and shows admins (21.4). Whether to also email a weekly reminder until a device is added is open.
- Facts still unverified: British Rowing's incident reporting page (it returned 403 to this sandbox), national incident forms for Canada and Australia, default emergency numbers outside the US (8.7), RegattaCentral's role (2.3), Google Calendar's refresh interval and which clients read `X-PUBLISHED-TTL` (14.2), and all of Putney Landing's emergency info, to collect on site.
- Screen Wake Lock for the kiosk (8.5). MDN's browser compatibility data lists `WakeLock.request()` in Chrome 84, Firefox 126, Safari 16.4 and Safari on iOS 18.4 (from MDN browser-compat-data, `api/WakeLock.json`, fetched 2026-10-17). Whether it holds in an iOS Home Screen app, and on the older tablets clubs reuse as kiosks, is unverified. Test it on the pilot tablet.
- Estimates to measure: about 2,000 `assess()` calls for Which crews can go (6.7), the 4 KB Now budget (20), and 21.7's notification volume.
- D1. The one-statement booking insert, the partial indexes and the foreign key behavior in 22.6 were checked in local SQLite, not D1. Confirm on the dev database before each phase ships.
- USRowing reporting. Nothing found suggests USRowing takes reports other than through its form (unverified). "Copy summary" (9.2) assumes copying by hand.
- Moderation load. How many clubs ask for verification, and whether 3 days is a fair target (23.2).
- Cross-document items for 08 to settle:
  - One spelling of the club overdue dedupe key: 8.6's `overdue-club:<outing id>:<club_stage>` or 21.4's `odc:<outing id>:<stage>:<user id>`.
  - 04 section 6.2's stage 5 ("at stage 3, for club outings") is now 06's club chain, which starts at `due_at + graceMin`.
  - 05: the `club` kind and `subkind` (21.1); section 3.9 and 3.10 samples and 7.5's deep links (21.1); the quiet hours rule for `practice` and restricted `water_status` (21.3); the `refresh` post in `public/push-sw.js` (21.6); `clubContextFor()` in member models and status ids in `settingsHash()` (21.7).
  - 18.2: `practices.check_at`, `practices_check`, `practices_rsvp` and `bookings_due` (21.7).
  - 19.3: the club context always returns statuses (21.6).
  - 01: `steward_club_id` moves to phase 5 (23.1).
  - 03 and 06 both name a `CODE_LIMIT` binding (22.6).
