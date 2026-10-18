# Product and UX

Today RoWhether is one screen for one dock. The header names Putney Landing, the tab bar holds ten views of that dock's forecast, and four dialogs (Settings, Report conditions, Suggest a change, Install) are the only other places (`index.html`, `src/route.js`). This document plans what people see and touch when the app serves every rower:

- Who uses it, and the steps each of them takes.
- The information architecture: routes, the header, the tab bar, and how the new places are reached without breaking the idea that the tab bar is the navigation.
- Every new screen, with its elements, states and sample copy.
- Copy changes, units, time zones, the clock and a plan for translations.
- Individual rower features: favorites, compare, alerts, limit sets by boat, the row log, share.
- Offline and caching, the performance budget, lazy modules and the map.
- Design system additions, accessibility, the browser test plan, and how the owner will know this is working without tracking people.

Out of scope here: the location record, course and thresholds (01-locations.md), data sources and attribution text (02-data-sources.md), sign-in flows, sessions, minors and legal text (03-accounts-and-privacy.md), the rules and content of reports, hazards and outings (04-reports-and-check-ins.md), the notification engine and its copy (05-notifications.md), club data and club rules (06-clubs.md), the canonical schema, storage key list, API index and Worker structure (08-architecture.md). Where those documents asked 07 to place or draw something, this document answers; section 16 lists what it asks of them in return.

Facts are marked "verified live 2026-10-17" (measured or requested from the planning sandbox today), "from docs (URL)", or "unverified". Sizes quoted for today's app come from a production build of the repo made in the sandbox on 2026-10-17 with `vite build` (Vite 8.3.1).

## Contents

1. Terms
2. Principles for every screen
3. People and journeys
4. Information architecture
5. Screens
6. Copy
7. Units, time and locale
8. Individual rower features
9. Offline and caching
10. Performance
11. Design system additions
12. Accessibility
13. Browser test plan
14. Privacy-friendly product metrics
15. Code changes by phase
16. Requests to other documents
17. Open questions and decisions

## 1. Terms

| Term | Meaning |
| --- | --- |
| location page | `/<slug>`: the Now screen and the tabs for one location. Today's whole app is Putney's location page. |
| home | `/`. Opens the last location. On a first visit it shows the picker. |
| picker | The list of ways to choose a location: search, Near me, your places, recent, all locations, the map. Shown as a page on a first visit and as a sheet from the header after that. |
| switcher | The header control that opens the picker as a sheet: the location name with a chevron. |
| your places | The viewer's favorite locations (03 section 8). Shown first in the picker. |
| recent | Up to 8 locations opened lately, newest first (`rowhether-recent-v1`, 01 8.6). |
| compare | The lines in Your places that show how each place looks today or tomorrow, and which looks best. |
| quick look | A forecast for a point that is not a saved location: `/at/<lat>,<lon>` (5.4, a Decision). |
| Info tab | The last tab of a location page: safety, hazards, launch notes, traffic pattern, clubs, sources, history. |
| sheet | A `<dialog>` that fills the width of a phone and sits centered on a wide screen. Same element and focus rules as the Settings dialog today. |
| note | A short line with one or two buttons above the hero, like the Settings reminder (`#setNudge`). At most one shows at a time. |
| banner | A status strip that must be seen: the outing banner (04) and the club water status (06). Not dismissable. |
| badge | A small text label in a thin outline: "Community added", "Official", "Junior". Never all caps. |
| limit set | A named group of a rower's own limits for one kind of boat, such as "Single" or "Eight" (8.4). |
| units system | How numbers are shown: US, UK or metric, plus a wind unit and a clock (7.1). Internals never change (01 11.1). |

## 2. Principles for every screen

1. The Now screen answers first. Nothing new runs before the first render of the hero. New things on the Now screen are lines, not panels, and they only appear when they apply to this viewer at this location right now.
2. Everything that works without an account today keeps working without one, in every phase (03 section 2). An account adds sync, identity and club features.
3. Putney keeps working exactly as now. Phase 0 is pixel-identical. Later phases add a short, named list of visible changes (3.2), each one quiet.
4. The tab bar keeps one meaning: parts of this location's forecast. Each new place has one way in from the header and links where they make sense (4.5).
5. Words follow CLAUDE.md: direct, calm, short sentences, sentence case, no em dashes, no emojis. The verdict is Go, Caution or Stay off, never a "call". Account actions are "Sign in" and "Sign out"; boats "Start a row" and "I'm back" (04 Decision).
6. A status color never stands alone. Every colored mark has a word next to it or in its text equivalent, and Stay off carries the fine hatch.
7. Every new screen works at 360 px with no horizontal page scroll, by keyboard, with reduced motion, and says plainly what is missing when it is offline or a source is absent.
8. Anything not on the Now screen loads only when it is opened (10.3).

## 3. People and journeys

Each journey lists the steps in order, with the phase in which each step first works. Screens named here are specified in section 5.

### 3.1 First-time visitor

Sam searched "rowing conditions" and lands on rowhether.com. Nothing is stored in this browser.

1. `/` loads. For the first 90 days after phase 1 ships, it opens Putney Landing with the note "Not your water? Pick a location." (01 7.4 Decision). After that window, `/` shows the picker page (5.1).
2. Picker page: "Where do you row?" with a search box, Near me, and every curated location grouped by state (phase 1). Sam types "char". The list narrows as Sam types, with no network request (phase 1 filters `/locations/index.json`, 01 7.2).
3. Sam taps "Weld Boathouse". The address becomes `/weld-boathouse`, the header changes to the location's name and subtitle, and the hero shows "Loading conditions." until the forecast arrives (as today).
4. The Settings reminder shows above the hero, worded for this location (6.7). The install bar appears on phones, as today.
5. Sam closes the tab. Next time, `/` opens Weld Boathouse at once from the cached record and forecast (01 7.4 steps 1 and 2). The picker never shows again unless Sam opens it from the header.

Branches:

- Arrives from a shared link `rowhether.com/putney-landing`: the location opens directly. No picker, no "Not your water?" note.
- Arrives at a slug that does not exist: the not-found view (4.7) with the picker under it.
- Taps Near me: the browser asks for location only now (5.2.2). Refused: the list stays as it was and a line explains how to search instead.
- No location near Sam's water: the search finds the town ("Lowell, Massachusetts") and shows "No locations within 50 km of Lowell, MA." with "Suggest a location" (phase 1, the suggestion form) or "Add a location" and "Look at a point near Lowell" (phase 3).

### 3.2 Putney regular with the app installed

Alex rows at Putney three mornings a week and opens the installed app from the home screen icon labeled "Putney Row". Alex must see no change.

1. The icon opens `start_url` `./`, which resolves to `/` (manifest in `vite.config.js`). The manifest `id` stays the same app (6.3).
2. `migrateStorage()` runs once before anything reads storage (01 8.6). It copies settings, cache, plan, install and nudge values to the new keys and sets `rowhether-last-v1` to `putney-landing`. Alex's saved limits stay, and the Settings reminder stays hidden because `saved` is set.
3. `/` sees a last location and replaces the address with `/putney-landing` (`history.replaceState`, no reload). In the installed app there is no address bar, so nothing visible happens.
4. The cached Putney forecast renders at once, then refreshes, exactly as today (`src/main.js` start sequence).
5. When units arrive in phase 2, browsers that used the app before then are pinned to US units and the 12-hour clock (7.2), so a phone set to a UK locale still sees mph and 6:41 AM.

What a Putney regular sees change, by phase:

| Phase | Visible change | Why |
| --- | --- | --- |
| 0 | Nothing. Screenshots at 390 px and 1280 px, midday and 9 PM, match pixel for pixel (01 8.7). | Refactor only. |
| 1 | A small chevron after "Putney Landing" in the title (the switcher). The compass bank labels rotate with the river (01 Decision). Share links point to rowhether.com/putney-landing. Offline, the header says "Saved 6:41 AM" instead of "Saved data from 6:41 AM" (4.3). The footer credits the NWS office that covers the dock (01 Decision). | 4.3, 01, 6.2 |
| 2 | A "Sign in" button at the right of the title row. The top line of Settings gains a sentence: "Saved in this browser for Putney Landing. Sign in to keep these settings on all your devices." (5.13) A star next to each location in the switcher. | 03 |
| 3 | Report conditions on production, and after sunset a small "At the dock" panel under the hero that holds it (5.10). An Info tab at the end of the tab bar. "1 hazard on this water" under the dock line when there is one. "Start a row" for signed-in rowers. | 04 |
| 4 | After sunset, one quiet line below the hero: "Get this every evening at 8 PM." It can be dismissed for 90 days (5.12). | 05 |
| 5 | Members only: a club line in the hero. Everyone: one line under the hero when the club posts a public water status. | 06 |
| 7 | Nothing, unless Alex changes units. | 7.2 |

The home screen label stays "Putney Row" on Alex's phone. iOS sets it when the app is added, and Chrome 144 and later no longer forces a name change on installed apps (6.3).

### 3.3 Traveling rower checking an unfamiliar water

Morgan rows at Putney and is racing at Lake Quinsigamond in Worcester next Saturday.

1. Morgan taps the location name in the header. The switcher opens with Putney marked "Showing now", Your places, Recent, and the search box focused only if Morgan taps it (focus goes to the sheet heading, 12.2).
2. Morgan types "quins" and taps "Lake Quinsigamond, Worcester, MA". The page changes without a reload; the address is `/lake-quinsigamond`; Back returns to Putney.
3. The subtitle names the zone: "All times Eastern." If Morgan's phone were in Chicago it would read "All times Eastern, 1 hour ahead of you." (6.1).
4. Morgan opens Week, picks Saturday, and reads Plan a row. The River tab is absent because a lake has no flow gauge (01 9.7); the Week view's River row says the flow is not checked here (6.7).
5. Morgan opens the Info tab (phase 3): launch notes, the traffic pattern, any hazards on the lake, and the Safety section with the launch address (phase 5, 06 8.7).
6. Morgan taps the star to add the lake to Your places (phase 2, works signed out). The switcher now compares Putney and the lake (5.3).
7. Friday evening, Morgan taps "Tell me tomorrow's conditions at 8 PM" in Week (phase 4, needs an account and, on iPhone, the installed app, 05 7.1).
8. Saturday after the race, Morgan taps Report conditions (phase 3). Back home, the switcher opens Putney; the lake stays in Recent and Your places.

Branches:

- No location exists at the water: the town is found in search. Phase 1: "Suggest a location" opens the suggestion form with "Please add this location:" filled in. Phase 3: "Look at a point near Worcester" opens a quick look (5.4), and "Add a location" opens the wizard (signed in, account at least 24 hours old, 01 12.1).
- Morgan is offline at the venue: the lake's last forecast shows with "Saved 6:10 AM" in the header, and the picker shows saved places only (9.4).

### 3.4 Solo sculler

Avery sculls a 1x at Putney before work, alone, three mornings a week.

1. Avery creates a limit set "Single" with stricter gusts (8.4, phase 2) and makes it the set for Putney. The hero shows one small line above the verdict: "Your Single limits. Change" (11.2).
2. At 8 PM a notification arrives: "Putney: looks like Caution tomorrow morning" (phase 4, 05 3.3). Tapping it opens `/putney-landing#fog/2026-10-18`.
3. At 5:45 AM Avery opens the app. The hero shows the morning period. The fog fact says when fog lifts.
4. At the dock Avery taps "Start a row" (phase 3, signed in): boat type 1x (remembered), back by 7:15 AM, "Tell my contacts if I am not back" on. The sheet says "If you are not back by 7:15 AM, we remind you. At 7:45 AM we email Jordan and Casey." (04 5.2).
5. The outing banner shows under the tab bar on every screen of Putney: "On the water since 6:02 AM. Back by 7:15 AM." with "I'm back" and "Add time" (11.4).
6. Back on the dock, Avery taps "I'm back", adds 12 km, and saves. The row joins the row log (Account, Row log, 8.5).
7. Avery taps Report conditions, "Light chop", Send. One tap and Send, as today.

Branch: no signal at the dock. The banner appears at once with "Not sent yet. It sends when RoWhether is open and has signal. Until then, nobody will be told if you are late." in caution color (04 5.6). Avery can also set the plan at home with a later start time, so the dock's signal does not matter.

### 3.5 Coach

Lee coaches the junior program at Putney Rowing Club (phase 5 and 6).

1. Evening: Lee taps the club line in the hero, or Account, Your clubs, and lands on `/club/putney-rowing-club#today`. "Which crews can go" shows each crew type for tomorrow morning (06 6.7). Phase 6 adds the practice outlook and RSVPs.
2. 5:40 AM: fog on the reach. Lee opens Today, taps "Set water status", picks Restricted, "Eights and fours with a launch only", until 10 AM, and posts it (06 7.4). Members' heroes change at once; a push goes to members (05 3.9).
3. At the dock: Board tab, "Start a row for a crew" for each boat, using "Start another" to keep the launch and back-by time (06 8.2).
4. On the launch, Lee keeps the Board open on a phone. It refreshes every 30 seconds while visible. An overdue boat moves to the top with "Overdue 12 min" and the hatch.
5. Crews land. Lee taps "Back" on each row. If something happened, More, "Record an incident" (06 9).

Ways in for Lee: the club line in the hero, Account, Your clubs, the Info tab's Clubs here, and the deep links in notifications (05 7.5).

### 3.6 Club admin

Robin runs Putney Rowing Club (phase 5).

1. Account, Your clubs, "Create a club" opens `/club/new` (06 3.2): name, address, home location picked with the same picker component, contact email.
2. The Today tab shows the setup checklist for admins: invite members, add safety officers, set rules from the USRowing templates (06 6.8), check the emergency info for Putney Landing (06 8.7), ask for verification.
3. Robin claims Putney Landing for the club (01 13.4) from the Info tab's status line: "Claim for Putney Rowing Club".
4. Robin pairs the boathouse tablet: Settings, Boathouse screens, "Add a screen" gives a 6-digit code; on the tablet, `/club/putney-rowing-club#kiosk` and "Use this device as the boathouse screen" (06 8.5).
5. Weekly: Members tab for join requests and guardian approvals; Rules tab for edits; Settings for retention and exports.

### 3.7 Junior athlete

Jamie is 15 and rows with the Putney juniors (phase 5).

1. Jamie can use every forecast with no account. To join the club's board, Jamie signs up: email code, then month and year of birth (03 11.2). The account is a junior account until the date 03 computes.
2. Jamie opens the club's invite link `/club/join/<token>`. The page says the join waits for a parent or guardian. Jamie invites a guardian from Account, Guardians (03 11.5).
3. Once the guardian approves, the hero at Putney shows "Putney RC rules: Juniors, 8+ with a launch." Club rules always apply for juniors (06 6.6).
4. Screens whose content a guardian can see carry the line "Your guardian can see this." (03 11.5). The Account page names the guardian at the top.
5. Jamie's reports show publicly without a name, as everyone's do (04 3.6), and club messages arrive only as group broadcasts (03 11.4). Non-safety notifications wait until 6 AM.

### 3.8 Parent or guardian

Pat is Jamie's parent (phase 5).

1. Pat gets the email "Jamie asked you to link as their guardian" with a code (03 11.5).
2. Pat opens `/account`, signs in or creates an account (the code flow, 03 4.1), and enters the code under Account, Juniors.
3. Pat sees Jamie's pending club join and taps "Approve".
4. Under Account, Juniors, Jamie: clubs and roles, copies of club messages, outings and float plans, attendance and lineups, read-only (03 11.5).
5. If Jamie's eight is overdue, Pat gets the guardian message at stage 2 (06 8.6): "Putney RC: Jamie's boat is overdue".
6. Pat can mute non-safety club notifications to Jamie's devices, ask the club not to message Jamie directly, or end the link.
7. Pat checks Putney's forecast like anyone, with no account needed.

## 4. Information architecture

### 4.1 Routes

Paths name the place. The hash names the part of that place, as it does today for the tabs (`src/route.js`). Every path is served `index.html` by the Worker's single-page fallback (01 7.3) and by the service worker's `navigateFallback` (`vite.config.js`), except `/api/*`, `/o/*` (rendered by the Worker), the static pages and, on a first visit before the service worker runs, the per-location shells.

| Path and hash | What | Phase | Account | Loaded from |
| --- | --- | --- | --- | --- |
| `/` | Home: opens the last location; with none, the picker page (5.1) | 1 | No | main bundle |
| `/<slug>` | A location's Now screen | 1 | No | main bundle |
| `/<slug>#week` ... `#air`, `#tide`, `#info` | A tab (4.4); `#wind/2026-10-14` for one day, as today | 1 (`#info` 3) | No | main bundle |
| `/<slug>#info/safety`, `#info/hazards` | The Info tab scrolled to a section | 3 | No | main bundle |
| `/at/<lat>,<lon>` | Quick look at a point (5.4, Decision) | 3 | No | main bundle |
| `/add` with `#where`, `#name`, `#water`, `#course`, `#limits`, `#notes`, `#review` | Add a location, one step per hash (5.6) | 3 | Yes | `add` chunk |
| `/account` with `#profile`, `#notifications`, `#rows`, `#contacts`, `#clubs`, `#guardians`, `#juniors` | Account (5.7) | 2 | Yes | `account` chunk |
| `/account/revert#t=<token>` | Undo an email change from the link sent to the old address (03 4.7); the token stays in the fragment | 2 | No | `account` chunk |
| `/club/new`, `/club/join/<token>` | Create a club, invite preview (06 20) | 5 | Yes, preview no | `club` chunk |
| `/club/<slug>` with 06's hashes (`#today`, `#board`, `#kiosk`, `#schedule`, `#rules`, `#members`, `#safety`, `#settings`, phase 6 `#boats`, `#practice/<id>`) | Club pages (5.8) | 5 | Public page no | `club` chunk |
| `/o/<token>` | An outing's status link for emergency contacts (04 6.3). A small page rendered by the Worker, not by the app, so it loads fast and works without JavaScript | 3 | No | Worker HTML |
| `/admin` with `#users`, `#notify`, `#metrics`, `#audit` | Owner and admin tools, behind Cloudflare Access (5.14) | 1 (metrics), 2 and later | Owner, then site role `admin` | `admin` chunk |
| `/mod` with `#queue`, `#locations` | Moderator tools, outside Access (5.14) | 3 | Site role `moderator` or `admin` | `admin` chunk |
| `/privacy` | Static page (5.15): the open counter and browser storage in phase 1, the full notice in phase 2 | 1, 2 | No | static HTML |
| `/terms`, `/about` | Static pages (5.15) | 2 | No | static HTML |

`?open=<kind>:<id>` is read once at start by 05's `handleOpenParam()` and removed with `history.replaceState`. This document adds `?open=picker` for the "Pick a location" link in emails and the 90-day note.

Reserved words: 01's list (01 2.2) already covers `add`, `admin`, `account`, `club`, `about`, `privacy` and `terms`, and gains `mod` for the moderator page. `at` and `o` cannot collide because slugs are at least 3 characters (08 K25).

### 4.2 How routing works

`src/route.js` grows from hash routes to path plus hash routes.

- `parseRoute(loc)` takes `location` and returns `{ page, slug, tab, day, section }`. `page` is one of `home`, `location`, `point`, `add`, `account`, `revert`, `club`, `status`, `admin` (for `/admin` and `/mod`), `notfound`. Today's `parseRoute(hash)` becomes the hash half and keeps its tests.
- Links between pages are ordinary `<a href>` elements with `data-nav`. A click handler on `document` calls `navigate(href)` for same-origin `data-nav` links: `history.pushState`, then `show()`. Modifier clicks and middle clicks fall through to the browser, so "open in new tab" works.
- `popstate` and `hashchange` both call `show()`. Changing tabs stays a hash change (a history entry, as now). Picking a day stays `history.replaceState` (as `setDay()` does now).
- Opening another location: `setZone(loc.tz)` (01 8.2), read `rowhether-loc-v1:<slug>` and `rowhether-cache-v2:<slug>`, render at once if both exist, then fetch the record and the data (01 7.4). The previous location's model is dropped. `app.openPeriods`, `app.detailDay` and `app.homeScroll` reset, because a picked day or open row belongs to a place.
- Focus and announcements on a page change are in 12.2.
- `document.title` follows the page (6.5).

Two hosting details that affect these URLs:

- Workers static assets serve a file `foo.html` at `/foo`, and a folder index `foo/index.html` at `/foo/`, with a trailing slash, under the default `html_handling: "auto-trailing-slash"` (from docs, https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/). Shells are `dist/<slug>.html` (01 7.2, 08 K24), because a folder index would send `/putney-landing` to `/putney-landing/`. Then `/putney-landing` is served directly, and on a plain static host the same file still works at `/putney-landing.html`.
- The service worker answers every navigation with the precached `index.html` (`navigateFallback: 'index.html'`), so the per-location shells only reach first visits, crawlers and link previews. That is what they are for. The static pages must not be swallowed the same way: add `/^\/(privacy|terms|about)$/` to `navigateFallbackDenylist` and precache their files, then check offline in Playwright (13) that `/privacy` shows the privacy page and not the app (Workbox's matching of `/privacy` to a precached `privacy.html` is unverified).

### 4.3 The header

Today (`index.html`): an `<h1>` with the name and the Dev label, the subtitle `.sub`, and the actions `.actions` (the updated time, Refresh, Settings). At 360 px the header is three rows: title, subtitle, actions.

New markup:

```html
<header class="top">
  <div class="title-row">
    <h1 id="title">
      <button type="button" id="locBtn" class="loc-btn" aria-haspopup="dialog" aria-controls="picker" aria-describedby="locHint">
        <span id="locName">Putney Landing</span><svg class="loc-chev" aria-hidden="true">...</svg>
      </button>
      <span class="env" id="envBadge" hidden></span>
    </h1>
    <span class="vh" id="locHint">Change location</span>
    <button type="button" id="acctBtn" class="acct" hidden>Sign in</button>
  </div>
  <p class="sub" id="sub">Connecticut River at the Putney Rowing Club docks. All times Eastern.</p>
  <p class="badges" id="locBadges" hidden></p>
  <div class="actions">
    <span class="updated" id="updated">Loading</span>
    <button type="button" id="refreshBtn">Refresh</button>
    <button type="button" id="settingsBtn">Settings</button>
  </div>
</header>
```

Measured on 2026-10-17 in Chromium (Playwright 1.56.1, Chromium build 1194) against today's built app, Archivo loaded, at 360 px wide (320 px of content):

| Element | Width |
| --- | --- |
| "Updated 10:41 AM" | 115 px |
| "Saved data from 10:41 AM" | 163 px |
| Refresh button | 87 px |
| Settings button | 90 px |
| Actions row in total, "Updated" label | 312 of 320 px |
| A "Sign in" button | 79 px |
| A "Sam" button | 64 px |

What follows from the measurements (verified live 2026-10-17):

- A Sign in button does not fit in the actions row. Added there it wraps to a second row, and it still wraps with Refresh shrunk to a 40 px icon button. So the account button goes at the right of the title row, where 03 17.1 left the placement to this document.
- On the title row, "Putney Landing" stays on one line beside "Sign in" (the name gets 229 px). "Lake Quinsigamond" and "Peter Jay Sharp Boathouse" wrap to two lines. "Jack London Aquatic Center" beside a 9-letter first name wraps to three.
- Today, when the header says "Saved data from 10:41 AM", Settings already wraps onto a second row at 360 px, so the CLAUDE.md check "the header buttons stay on one row" fails in the offline state. Phase 1 changes the label to "Saved 10:41 AM" (6.7).

Rules:

- The location name is a text button styled as the title: same size, weight and width as today's `h1`, `--ink` color, no pill border, a 0.6 rem chevron after the name in `--muted`. Hover underlines the name. It opens the picker sheet (5.2). Its accessible name is the location's name, and `locHint` adds "Change location".
- Below `30rem`, a name longer than 18 characters steps the title down from 1.5 rem to 1.25 rem (class `long` set by `renderHeader()`). A Playwright check asserts every curated name takes at most two lines at 360 px (13).
- The account button is hidden until `/api/info` says accounts are on (03 17.1). Signed out: "Sign in". Signed in: the first word of the display name if it is 10 characters or fewer, otherwise "Account". With unread notifications (05 2.4): a 0.5 rem dot in `--river` after the label, and the accessible name becomes "Sam, 2 unread notifications". `flex: none`, so it never wraps under the title.
- The Dev label stays inside the `h1`, after the button, as today.
- The subtitle is a template (6.1). Badges for non-default states (Community added, Draft, Archived) go on their own line under it (11.1). A verified location shows none.
- The actions row is unchanged: updated time, Refresh, Settings.

Header on pages that are not a location (account, club, add, admin, quick look):

- `h1` is the page title ("Your account", "Putney Rowing Club", "Add a location", "Admin", "Moderation"). On club pages the badge line shows "Verified club" when it is.
- The subtitle is the page's one-line purpose, and it ends with a link back to the location the viewer came from: "Back to Putney Landing". The link uses `data-nav` and keeps the tab the viewer left on.
- No Refresh or Settings buttons. The account button stays at the right.

### 4.4 The tab bar for a location

`initRoutes()` builds the tabs from `VIEWS.filter(v => !v.when || v.when(loc))` and rebuilds them when the location changes (01 9.7). The order:

| Tab | Shows when | Notes |
| --- | --- | --- |
| Now | always | The home screen of the location |
| Week | always | |
| Wind | always | |
| Tide | the location has a `tide` binding (01 9.4) | New view `src/render/detail/tide.js` (01) |
| River (or Level) | a `flow` binding (River) or a `level` binding (Level) | Hidden otherwise; a hash route to it falls back to Now (01 9.7) |
| Storms, Fog, Temperature, Rain, Light, Air | always | |
| Info | phase 3 onward, or earlier when the curated record has launch notes, a traffic pattern or emergency info | New view `src/render/detail/info.js` (5.5) |

At most 12 tabs. The bar keeps today's behavior: text with an underline, pinned to the top when scrolled, scrolling sideways with the current tab kept in view (`markTab()`).

Decision: The location's information page is a tab, `#info`, at the end of the tab bar. Recommended, because it is part of the location like the forecast views, shares the location header, caches with the location record, and needs no new kind of navigation.
- Alternative: a path route `/<slug>/info` (a separate page, but a second meaning for paths under a location).
- Alternative: a sheet opened from the subtitle (quick, but long content such as hazards and history does not belong in a dialog).

### 4.5 How the new places are reached

CLAUDE.md says the tab bar under the header is the only navigation. With many locations, accounts and clubs, there are places that are not part of one location's forecast.

Decision: Keep the tab bar for the parts of one location only. Reach everything else from the header: the location name opens the switcher, and the account button opens Account. Club pages, Add a location, Admin and Moderation are reached from those two and from links in context, and each page outside a location has its own text tabs in the same style. Recommended: the tab bar keeps one meaning, the Now screen gains no new chrome, and every new place has exactly one way in from the header.
- Alternative: add Places, Club and Account tabs to the bar. One bar, but it mixes levels, and with 12 location tabs it pushes Week and Wind off the screen on a phone.
- Alternative: a bottom navigation bar, the common app pattern. It adds permanent chrome, competes with the install bar for the bottom edge, and makes the Now screen louder.
- Alternative: a menu button that holds everything. It hides the switcher behind two taps.

The CLAUDE.md sentence would become: "Within a location, the tab bar under the header is the only navigation. The location name in the header opens the switcher; the account button opens Account. Pages outside a location use the same text tabs." That edit needs the owner's approval.

Every place and its ways in:

| Place | From the header | In context |
| --- | --- | --- |
| Another location | Location name, then the picker | Shared links; "Also on this water" in Info; nearby report lines (04 3.6); notification deep links |
| Your places and compare | Location name | The "Not your water?" note |
| Add a location | Location name, then "Add a location" | Search with no results; quick look's "Add this location" |
| Account and its tabs | Account button | "Sign in to ..." links in sheets; notification deep links (`/account#notifications`) |
| A club | Account, Your clubs | The hero club line (members), the public status line under the hero, Info's Clubs here, notification deep links |
| The sign-out board | Account, Your clubs, the club, Board | The hero club line, the outing banner's "Board" link for club rows |
| Admin, Moderation | Account, "Admin" (admins only) and "Moderation" (moderators and admins) | The owner's moderation digest email (04) |
| Privacy, terms, about | none | Footer links |

### 4.6 Banners and notes above the hero

Order at the top of a location page:

1. `#outingBanner` (04): directly under the tab bar, outside `#home`, so it shows on Now and every tab of the location where the outing is. Not sticky.
2. `#clubStatus` (06 7.4): members' water status banner, inside `#home`, above everything else there.
3. One note, the first that applies, in this priority:
   1. "Not your water? Pick a location." (01's 90-day window, on `/` until the viewer answers it, 5.1).
   2. 05's "Notifications are off on this device. Turn on" (05 7.3).
   3. "First time at Lake Quinsigamond? Read the launch notes." (phase 3, only when the location has launch notes or a traffic pattern and the viewer has never opened its Info tab; key `rowhether-info-seen-v1`, a list of up to 50 slugs).
   4. The Settings reminder `#setNudge`, as today.
4. The hero.

Each note has a dismiss button. A dismissed note stays dismissed in this browser (try/catch around storage, as today).

### 4.7 Not found, archived, draft and failed loads

All render in `#home` under the location header slot, with the picker search below them.

| Case | Title line | Text | Actions |
| --- | --- | --- | --- |
| Unknown slug | "No location here" | "No location at rowhether.com/lake-quinsigamund." | The picker search, prefilled with the slug's words ("lake quinsigamund") |
| Alias of a merged or renamed location | none | The survivor renders; the address is replaced (01 14.3) | none |
| Archived | Badge "Archived" | "This location was archived on Oct 17, 2026. Dock removed in 2026." (01 2.3) | "Show the forecast anyway", "Find a location nearby", and the survivor's link when merged |
| Draft, viewer is the creator | Badge "Draft" | "Draft. Only you can see this." | "Continue editing" (opens `/add#review`) |
| Draft, anyone else | Same as unknown slug | | |
| Record failed to load, nothing cached | "Could not load this location" | "Check the connection, then try again." | "Try again", and the picker search |
| Record failed, cached copy exists | none | The cached copy renders; nothing is said unless it is over 30 days old: "This location's details were last checked on Sep 2." in the Info tab | none |

## 5. Screens

### 5.1 Home and the first-run picker

`/` decides in this order, before the first render:

1. `?open=picker`: the last location renders with the picker sheet open, or the picker page when there is none.
2. `rowhether-last-v1` holds a slug: replace the address with `/<slug>` and render that location (01 7.4). This is what keeps installed Putney apps opening on Putney.
3. Nothing stored, and inside 01's 90-day window: render Putney Landing with the note "Not your water? Pick a location." and the buttons "Pick a location" and "Dismiss". The address stays `/` until the viewer picks a location or taps the note, so links people shared to rowhether.com keep meaning Putney. "Dismiss" writes `rowhether-pickhint-v1` and sets `rowhether-last-v1` to `putney-landing`: the viewer has accepted Putney, so `/` opens it from then on, also after the window ends. Rendering Putney under this rule does not by itself write `rowhether-last-v1`, so the note keeps showing on each visit to `/` until the viewer answers it. Opening any location by its own address (`/putney-landing`, a picked row) writes it as usual.
4. Otherwise: the picker page.

The picker page is the picker (5.2) laid out as a page instead of a sheet. It has no tab bar and no Refresh or Settings buttons.

```
Where do you row?
Pick your launch site. RoWhether checks wind, fog, storms, river flow and
daylight there, hour by hour, and says Go, Caution or Stay off.

[ Find a location: boathouse, lake, river or town      ]
(Near me)  Uses your position once to sort the list. It is not stored.

All locations
  Vermont
    Putney Landing                         Putney, VT
  New Hampshire
    Hanover boathouse                      Hanover, NH
  Massachusetts
    ...

Not here? Suggest a location.            (phase 1)
Not here? Add a location.                (phase 3)
```

Page title: "RoWhether: pick a location". Footer as on every page (6.6), without data credits, since no location is chosen.

### 5.2 The picker and the switcher

One component, `src/picker.js`, loaded with `import()` on the first tap of the location name, or at start on the picker page. It renders into `<dialog id="picker" aria-labelledby="pickTitle">` as a sheet, or into `#home` as the page.

Sheet layout, top to bottom:

1. Heading "Change location" (`pickTitle`, `tabindex="-1"`, takes focus on open as `#setTitle` does).
2. The current location as the first row, with the badge "Showing now" and its star.
3. Search box.
4. Near me.
5. Your places, with compare lines (5.3). Phase 2.
6. Recent: up to 8, newest first, without the current location or any favorite.
7. All locations, grouped (phase 1 and 2 only, while the list is curated and short).
8. "Show map" (phase 3, 5.2.5).
9. "Add a location" (phase 3) or "Suggest a location" (phase 1 and 2).
10. "Close" at the bottom and in the top right corner.

A row is one link to the location (`<a href="/lake-quinsigamond" data-nav>`) with the name on the first line and "Worcester, MA. Lake Quinsigamond." on the second (locality, then waterway, skipping either when it repeats the name), plus a star button outside the link. Tapping the row closes the sheet and opens the location. The star is `<button aria-pressed="false" aria-label="Add Lake Quinsigamond to your places">`.

#### 5.2.1 Search

- Label "Find a location", placeholder "Boathouse, lake, river or town". `type="search"`, `autocomplete="off"`, `enterkeyhint="search"`.
- Our locations first. Phase 1 and 2: `/locations/index.json` filtered in the browser on every keystroke from 2 characters, on folded text (NFKD, accents stripped, lowercase) over name, short name, locality and waterway. Phase 3: `GET /api/locations?q=` (01 14.2) after 150 ms of no typing, with the last answer kept while the next is in flight.
- Ranking: name starts with the query, then a word in the name starts with it, then locality or waterway matches. Ties: favorites, then recent, then by distance when Near me ran in this session, then alphabetical.
- Places second: towns and features from Open-Meteo geocoding, called from the browser after 300 ms of no typing or on Enter, at most once per 300 ms, never Nominatim (02, place search). Shown under "Places" with the country: "Worcester, Massachusetts, United States". Selecting a place lists our locations within 50 km of it, nearest first, under "Near Worcester, MA".
- At most 8 locations and 5 places are listed.

| State | Copy |
| --- | --- |
| Fewer than 2 letters | (nothing below the box) |
| No location matches, places still loading | "No locations match "quinsig". Looking for towns." |
| No match anywhere | "Nothing matches "quinsig". Check the spelling, or search for a town." |
| A place with no locations within 50 km | "No locations within 50 km of Lowell, MA." then "Suggest a location" (phase 1) or "Look at a point near Lowell" and "Add a location" (phase 3) |
| Town search failed | "Town search is not available right now. Location names still work." |
| Offline | "Offline. Search covers places saved on this phone." |

#### 5.2.2 Near me

The browser is asked for the position only after a tap on "Near me" (03 12.2).

1. If `navigator.permissions` exists, query `{ name: 'geolocation' }` first (Safari 16 and later, Chrome 43, Firefox 46, from @mdn/browser-compat-data 8.1.6, verified live 2026-10-17). `denied` skips the request and shows the help line at once.
2. `navigator.geolocation.getCurrentPosition` with `{ enableHighAccuracy: false, maximumAge: 600000, timeout: 10000 }`. Low accuracy is enough to sort a list and answers faster.
3. Round to 2 decimals (about 1 km) in the browser before anything else uses it (03 12.2). Nothing is stored.
4. Phase 1 and 2: sort `/locations/index.json` by distance. Phase 3: `GET /api/locations?near=42.96,-72.52&radius_km=100&limit=20`.
5. Show "Near you" with each row's distance: "12 km" or "7 mi" by units (7.3).

| State | Copy |
| --- | --- |
| Waiting for the position | Button text "Finding you", disabled |
| Results | Heading "Near you". Rows with distance |
| None within 100 km | "No locations within 100 km of you. Search by name, or add one." |
| Permission denied | "Location is off for this site. Search by name, or allow location for rowhether.com in your browser settings." |
| Timeout or unavailable | "Could not find your position. Try again, or search by name." |

#### 5.2.3 Your places and Recent

- Your places is 03's favorites list: kept in this browser signed out (`rowhether-favorites-v1`), synced signed in. Up to 50, in the viewer's order.
- "Edit" next to the heading switches each row to "Move up", "Move down" and "Remove" buttons, so reordering never needs dragging (12.1). "Done" leaves edit mode.
- Empty: "Tap the star next to a location to keep it here. Then you can see which of your places looks best today."
- An archived favorite stays, greyed, with 01's note "This location was archived." and a link to locations near it.
- Recent never shows a location twice and is device only (03 9.1).

#### 5.2.4 All locations (phase 1 and 2)

Grouped by country, then by region, using ISO 3166-2 names ("Vermont", "Massachusetts", "England"). Country headings appear only when there is more than one country. In phase 3 the list goes away (too many locations to list), and the picker relies on search, Near me, the map, your places and recent.

#### 5.2.5 The map (phase 3)

- "Show map" loads the map module (10.4) and shows a map 60% of the sheet's height above the list. The list stays below it and always shows the same locations as the map view: "12 locations in this view". The map is an addition; everything it does can be done from the list (12.4).
- The map opens on the current location at zoom 10, or on the Near me position when known.
- Markers: one circle per location in view (11.8). Tapping one shows a small card under the map, not a popup on it: name, locality, "Open", and the star.
- Moving the map refreshes the list after 300 ms of no movement: phase 3 `GET /api/locations?near=<center>&radius_km=<half the view diagonal, at most 300>`.
- "Hide map" removes it and frees its memory (`map.remove()`).
- Without WebGL2 the map cannot start. MapLibre 6.7.0 and later throw `GPUInitializationError` from the `Map` constructor (from the MapLibre changelog, verified live 2026-10-17). Catch it and show: "The map needs a newer browser or graphics setting. The list below has every location in this area."

### 5.3 Compare my places

Phase 2, with favorites. Compare lives inside Your places in the picker. It answers "which of my places looks best today, and when".

```
Your places                                       Today | Tomorrow
Best today: Lake Quinsigamond, 7 to 8:30 AM. Flat water, gusts 9 mph.

Putney Landing                              Showing now      [star]
  Caution now: gusts to 19 mph. Best 90 min: 3:30 to 5 PM.
  [ first light ======### caution ###===== sunset ]

Lake Quinsigamond                                            [star]
  Go now. Best 90 min: 7 to 8:30 AM.
  [ first light ================ go ========== sunset ]

Hanover boathouse                                            [star]
  As of 6:10 AM. Stay off until 1 PM: thunderstorms.
  [ ... ]
```

How it is computed (`src/compare.js`, in the picker chunk):

1. For each favorite, the model comes from `buildModel(loc, data, S)` over that location's cached data (`rowhether-cache-v2:<slug>`) and its effective settings (its overrides and its limit set, 8.4).
2. A favorite whose cache is older than 30 minutes, or missing, is fetched when the sheet opens: at most 3 locations at a time, and only the slots that decide Go, Caution or Stay off (`wx`, `alerts`, `river`, `aq`, plus `tide` and `level` where bound; `flowNow()` and `waterTemp()` in `src/logic.js` read `river`). Information-only slots (`flow`, which feeds the debris warning, `models`, `obs`, `flowFcst`, `flowDays`) are skipped for places that are not open. The result is saved to that place's cache, so opening it later renders at once. Opening the place itself still runs the full refresh.
3. The day: Today, or Tomorrow after sunset at that place and whenever the viewer picks Tomorrow. The `.choice` buttons are remembered for the session only.
4. "Best" is the first session `planSessions(m, minutes, when)` lists for that day, with Plan a row's saved length and time of day (`loadPlan()`), so compare and Week agree. With no Go session: the line names the worst reason and when it ends: "Stay off until 1 PM: thunderstorms."
5. "Best today" at the top names the place whose best session has the lowest Plan a row score, ties to the earlier start. With no Go session at any place: "No Go sessions at your places today." With one place only, the line is left out.
6. The bar is the Week view's day bar (`.wbar` with `.seg.b0` to `.seg.b2`, hatch on Stay off) from first light to sunset in that place's own time. Places in different zones each use their own clock; the column note says "Local time at each place".
7. "Now" words appear only for today in daylight at that place.

Cost estimate: 5 favorites refreshed is about 18 Open-Meteo calls by 02's weights (forecast about 2.7 and air quality about 1 per place), at most once per 30 minutes, well inside the free tier of 10,000 a day per device (estimate; limits from docs, https://open-meteo.com/en/pricing). Open-Meteo also accepts several comma-separated coordinates in one request, returning a list (from docs, https://open-meteo.com/en/docs), but how such a request is counted is not stated on the pricing page (unverified), so the plan keeps one request per place.

States: offline, every row shows "As of 6:10 AM" from its cache, and the top line says "Offline. Showing the last forecast saved on this phone." A place never loaded: "Forecast not loaded yet." A failed refresh keeps the cached line and adds nothing; the failure shows when the place is opened, as today.

### 5.4 Quick look at a point

The add flow needs an account at least 24 hours old (01 12.1). A rower who arrives today at water with no location still needs an answer.

Decision: Offer a quick look at any point from phase 3: `/at/42.961,-72.522`, a forecast with no course, gauge or local limits, clearly labeled. Recommended: it serves the traveling rower at once, needs no account and no database row, and leads into the add flow.
- Alternative: ship it in phase 1, before the add flow (it needs nothing from phase 3, but it is extra surface while the curated list is the focus).
- Alternative: no quick look. Every forecast belongs to a location record; people with no location suggest one.

What it is:

- Coordinates rounded to 3 decimals (about 100 m) in the URL, so the same point is one cache entry and one shareable link.
- Sources: the global baseline only (02, "A location with no regional sources"): the Open-Meteo forecast, air quality and model comparison, plus NWS alerts by point when the point is in the US. The time zone comes from the forecast response (`timezone=auto`, 02). The page shows "Loading conditions." until it arrives.
- The model: `buildModel()` with a synthetic location `{ kind: 'point', course: { kind: 'none' }, waterType: 'lake', flow: null, waterTemp: { fallback: 'none' } }` and the global defaults plus the viewer's limit set. No water state (there is no fetch or course), no flow, no tide, no cold check unless the viewer enters a water temperature in Settings.
- Tabs: Now, Week, Wind, Storms, Fog, Temperature, Rain, Light, Air.
- Header: the name of the place picked in search ("Near Worcester, MA", passed in `history.state`), or the coordinates on a direct visit ("42.961, -72.522"). Subtitle: "A point, not a saved launch site. No course, river gauge or local limits. All times Eastern."
- Under the hero: "Add this location" (signed in) or "Sign in to add this location", and "Find a location nearby".
- It goes into Recent as "Point near Worcester, MA". It cannot be a favorite, has no reports, hazards or outings, and has no Settings beyond the limit set and water temperature.

### 5.5 Location Info tab

`src/render/detail/info.js`, a view like the others (`key: 'info'`, `name: 'Info'`, `summary(m)`, `render(m, day)`), not day-based. Its visually hidden heading is "Info"; the opening line leads.

Opening line examples:

- "1 hazard on this water. Keep to the right bank in your direction of travel."
- "Launch notes, the traffic pattern and emergency details for Putney Landing."
- Community record: "Community added by Sam R. Not yet checked by a club or moderator." When a junior added it: "Community added by a rower. Not yet checked by a club or moderator." (03 11.3)

Sections, each a panel, in this order:

1. Safety (`#info/safety`). From 06 8.7 when `loc.emergency` exists: "In an emergency call 911." then launch address, nearest hospital, AED, phone signal, landing spots with road access, and "Last checked Oct 17, 2026 by Putney Rowing Club." Each phone number is a `tel:` link, made only from a number that passed the E.164 check (06 8.7). Each address has "Open in maps" (a `geo:` link on Android, an Apple Maps link on iOS, unverified which works best in the installed app). Without emergency info: "In an emergency call 911. Emergency details for this launch have not been added yet." with "Suggest emergency details" (signed in, phase 5). The country's number comes from 06's checked table (06 8.7), never from a field a person typed. Every emergency block ends with "Last checked Oct 17, 2026 by Putney Rowing Club." or, when no one has checked it, "Not checked yet."
2. Hazards (`#info/hazards`). 04 4.6: "1 hazard on this water" heading, cards nearest first, "Show on map" (loads the map module only on tap), "Report a hazard" (signed in) or "Sign in to report a hazard". Empty: "No hazards reported on this water."
3. Launch notes. 01's `launchNotes` as plain paragraphs. Empty: "No launch notes yet." with "Suggest launch notes" (signed in).
4. Traffic pattern. 01 3.3's `text`, with "From Putney Rowing Club", "From the harbor authority" or "From the community". Empty: "Traffic pattern not recorded. Ask the club or the people at the dock."
5. Clubs here. 06 3.5: up to 5 lines, "and 2 more clubs", each linking to the club page and showing its public status line.
6. Water and course. "River. Rowing upstream heads 15°, north-northeast." "Banks: Vermont on your left, New Hampshire on your right, facing upstream." "Also on this water: Brattleboro, 9 km upstream." (01 waterway API). For a community record with `confirmed: false`: "The course direction was set from a map and has not been checked on the water."
7. Data for this location. One line per active binding, from 01's `label`, `note`, `distanceM` and `relation`: "River flow: USGS 01154500, Connecticut River at North Walpole, NH. 19.7 km upstream." Then the attribution lines for this location (02, Attribution).
8. Status and history. The status sentence (verified: "Checked by Putney Rowing Club on Oct 17, 2026."), "History" (01 13.3, a sheet), "Suggest a change" (signed in, 01 13.2), "Claim for Putney Rowing Club" (club admins, phase 5, 01 13.4), and "Report this location" (a flag, 04 8.5).

Quiet buttons near the opening line: "Add to your places" (the star, phase 2) and "Share this location", which shares the link only (6.2).

### 5.6 Add a location

Phase 3. `/add`, from the picker's "Add a location", search with no results, or a quick look. 01 sections 12.3 to 12.9 define each step's content and rules, and 02's discovery defines the data step. This section is the layout.

- Signed out, or account under 24 hours old: the page says "Sign in to add a location. It takes a minute." or "New accounts can add locations after 24 hours. Until then, suggest one." with "Suggest a location".
- Header: "Add a location". The subtitle is the step: "Step 3 of 7: water and data."
- One step per screen, each with its own hash so the phone's Back button goes back a step: `#where`, `#name`, `#water`, `#course`, `#limits`, `#notes`, `#review`. Opening `#review` directly with an incomplete draft goes to the first incomplete step.
- Footer pinned to the bottom of the screen: "Back" and "Next" ("Publish" on the last step), and "Save for later" (creates a server draft, 01 12.2). The draft is also saved on every change to `rowhether-add-draft-v1` (01).
- Inline errors under the field they belong to, tied with `aria-describedby`, announced with `role="alert"`. Next is never disabled; tapping it with errors moves focus to the first error.

| Step | Screen |
| --- | --- |
| 1 `#where` | A search box above the map moves it to a boathouse or town (Photon for boathouse names, Open-Meteo geocoding for towns, after 300 ms of no typing, never Nominatim; 02, place search). The map (10.4) with a fixed crosshair at the center, not a dragged pin, so a keyboard user can pan with the arrow keys and press "Put the dock here". "Use my location" (refused over 100 m accuracy, 01 12.3). Coordinates under the map, editable as numbers. Dedupe answers from 01 12.3 appear under the map as they change: blocked, needs a reason, or a notice. |
| 2 `#name` | Name, short name, address preview "rowhether.com/lake-quinsigamond" with the checks as you type (01 12.4), water type as six radio cards with one line each, locality, country, region, time zone with "Change". |
| 3 `#water` | Waterway cards, then one card per role from discovery (02, "What the person adding the location sees"): the suggestion, its distance, its latest reading, and "Use this", "Pick another", "None". Warnings inside the card in caution color with a word, never color alone. Discovery is loading: "Looking for gauges, alerts and stations near your pin." |
| 4 `#course` | River, tidal, canal: "Which way is upstream?" with "Set the direction" (an arrow on the map rotated with a slider or typed in degrees, the suggestion preselected and labeled "Suggested 21° from the upstream gauge. Check it against the water.") or "Draw the course" (crosshair plus "Add point here", "Undo last point", the length and each segment's heading listed under the map). Lakes: "Draw your usual course, or skip", then the open water size question. Banks with "Rename". |
| 5 `#limits` | The location's starting limits with their reasons (01 12.7), in the viewer's units (7.4). |
| 6 `#notes` | Launch notes, 1,000 characters, with a live count. |
| 7 `#review` | Every field and source with "Edit" links back to its step. "Publish". |

After Publish: the new page `/<slug>` with the note "Published. It shows as community added until a club or moderator checks it." (01 12.9).

### 5.7 Account page

`/account`, loaded as the `account` chunk (03 17.5 keeps `src/auth.js`, `src/account.js` and the WebAuthn library out of the main bundle). 03 17.4 defines the profile content; this section is the shell.

- Signed out: "Sign in to see your account." and "Sign in", which opens 03's sign-in dialog. After sign-in the page renders in place.
- Header: "Your account". Subtitle: "Signed in as Sam R." and the back link. The email shows in the Profile tab, not in the header, so it is not on screen when a phone is shown to someone.
- Text tabs in the location tab style, filtered by phase and role:

| Tab | Hash | Content | Phase |
| --- | --- | --- | --- |
| Profile | `#profile` (default) | 03 17.4 sections 1, 2, 3, 5, 6, 7: profile, sign-in methods, where you're signed in, recent security activity, your data, sign out. Units and clock (7.1). "Moderation" link for moderators and admins, "Admin" link for admins. | 2 |
| Notifications | `#notifications` | Recent notifications, then the settings (5.12) | 4 |
| Row log | `#rows` | 04 section 7 (8.5) | 3 |
| Emergency contacts | `#contacts` | 04 6.1 | 3 |
| Clubs | `#clubs` | "Your clubs" with role words, invite code entry, pending guardian approvals, calendar links (06 20) | 5 |
| Guardians | `#guardians` | Junior accounts only (03 11.5) | 5 |
| Juniors | `#juniors` | Guardians only (03 11.5) | 5 |

- For a junior, the first line of every tab is 03's signal: "Alex P. (guardian) can see your club messages, club outings and attendance, and any row you share."
- Times on this page use the home location's zone, named once at the top ("Times in Eastern"), as 03 17.4 says.

### 5.8 Club pages

06 section 20 defines the routes and content. Layout:

- Header (4.3, page variant): the club name as `h1`, the badge "Verified club" (or, for members of an unverified club, "Not verified yet"), subtitle "Rows from Putney Landing. All times Eastern." and the back link.
- Public visitors see the public page (06 3.4) with no tab bar: sections as panels in 06's order.
- Members see text tabs in the location tab style: Today, Board, Schedule (6), Boats (6), Rules, Members, Safety, Settings. A tab is hidden when the viewer's role cannot use it (06 5.3). `#kiosk` hides the header and tabs entirely (06 8.5).
- The water status banner sits at the top of Today and Board (11.3).
- "Which crews can go" (06 6.7) is a table on wide screens. Below 46 rem it becomes one panel per crew type, with the periods as lines, so it never scrolls sideways: "Juniors, with a launch. Now Go. Midday Go. Afternoon Caution: gusts to 19 mph. Tomorrow morning Go."
- Empty states are 06's (06 20).

### 5.9 The sign-out board

`/club/<slug>#board` (06 8.4). Layout for phones first:

- Top: the water status banner, then "As of 6:41 AM" in `--muted`. When a poll fails: "Not updated since 6:41 AM. No connection." in caution color.
- "Start a row" (members) and "Start a row for a crew" (staff) as pill buttons in one row.
- "On the water": a list, not a table. One `<li>` per boat, a 4 px left bar in the row's state color (the same pattern as Day by day periods), the hatch on overdue rows. Line 1: boat and class in bold, "Bellows Falls (8+)". Line 2: who, "Junior crew of 9 with Lee M.'s launch." Line 3: times, "Out 5:52 AM. Back by 7:30 AM." Line 4, when there is one: the rule note, "Started in Stay off: gusts to 18 mph, club limit 15." The state words sit at the end of line 1 in bold, always as text: "On the water", "Due in 10 min", "Due now", "Overdue 12 min", "Alex R. is on it".
- Staff actions on each row: "On it" (overdue rows only), "Back", "More". "More" opens a sheet: Add time, Resolve, Edit, Cancel this row, Record an incident.
- "Back today" and "Needs review" (staff) as `<details>` sections below, closed by default, remembered open per viewer (`data-keep`, as detail views do today).
- The emergency strip at the bottom: "Emergency: 911. Launch address: ..." with "All emergency info" linking to the location's `#info/safety`.
- Announcements: a polite live region says only changes to overdue: "Sam L., 1x, is overdue." once per row and stage. Routine poll updates are not announced.
- Kiosk (06 8.5): the same rows at body 20 px or larger and 44 px targets, the location's hero at the top, no header or tabs.

### 5.10 The report dialog

04 3.1 and 3.2 define the fields, the dialog and the copy. Layout and placement here:

- Fields render as today's `fieldset.pick` chips, generated by `buildReportForm(loc)` (04). The "More" `<details>` uses the `.twin` summary style. Water temperature is a number field labeled in the viewer's unit: "Water temperature at the dock, °F" with `inputmode="decimal"`; the range message follows the unit ("Enter a water temperature between -2 and 40°C.").
- The note names the location: "What you see at Putney Landing right now. Everyone sees it for a few hours. Pick what applies."
- In daylight the dock line and Report conditions stay at the top of On the water now (`#dockReports`), as today.
- Outside daylight, On the water now is hidden (as today), and `#dockReports` moves to its own small panel directly under the hero (and under alerts), titled "At the dock". It holds the dock summary, Report conditions, and Start a row for signed-in rowers. This keeps the hero itself to the verdict and Share only. 04 3.2 left this to 07.
- Offline: after Send the dialog closes, and the dock line says "1 report waiting to send." (04).
- Fog reports on the Fog tab chart (04 3.6): a 6 px tick above the time axis at each report's `seenAt`, in `--ink`, with the report in the readout when tapped or focused ("Patchy fog reported at the dock at 6:40 AM."), and a Reports column in the hour table twin. `Chart` in `src/render/chart.js` gains `marks(lane, items)` for this.

### 5.11 Start a row and the outing banner

04 5.2 to 5.6 define the sheet, the banner copy and the offline rules.

- "Start a row" sits next to Report conditions in `#dockReports` for signed-in viewers (daylight) or in the "At the dock" panel (outside daylight). Signed out: the quiet link "Sign in to start a row".
- The sheet is `<dialog id="outing">`. Boat type chips use `fieldset.pick`. "Back by" is a native `<input type="time" step="300">` with the location's zone named in its label: "Back by (Eastern)". Its value is read and written through `m.fmt`, never the device zone.
- The footer line from 04 (who is told and when) sits directly above "Start" so it is read before the tap.
- The outing banner (11.4) replaces the button while out, on every screen of the location.
- A club row started against club rules shows 06's sheet first, with "Go back" focused (06 8.3).

### 5.12 Notification settings

Account, Notifications (`/account#notifications`), phase 4. 05 4.1 defines what can be set; this is the screen.

1. "On this device" line: "Notifications are on for this device." or "Notifications are off on this device. Turn on" (05 7.3), or on iPhone outside the installed app: "On iPhone, notifications work from the Home Screen app. Show me how" (05 7.2).
2. Recent: 05 2.4's list, newest first, each item a link to where it pointed, unread items in bold with the word "New". "Mark all as read".
3. Per location, one panel for each location with alerts or in Your places (at most 10, 05 4.2):
   - "Night-before outlook" switch. When on: time (a select from 6 to 10 PM in 15-minute steps, in the location's zone, labeled "8:00 PM Eastern"), periods (Morning, Midday, Afternoon checkboxes), "Only when it's a Go" or "Only when it's not a Go" or "Every evening", "Tell me if it changes overnight" switch.
   - "Morning of" switch and time (3:30 to 9 AM).
   - "NWS alerts": "Stay off alerts only" or "All alerts". Outside the US: "No official alerts feed here." and no control.
   - "New hazards on this water" switch.
   - "Go windows" switch with length (60, 90, 120 minutes) and time of day.
4. Per club (phase 5): "Water status: closed only" or "every change". "Practice changes" (phase 6).
5. Quiet hours: from and to, in the device's zone, named: "10 PM to 6 AM, Eastern (this phone)". Juniors see the fixed line from 03 11.3.
6. Email: "Email me when notifications cannot reach this device" with 05's defaults.
7. Devices: each subscription with its label, last used, "Send a test", "Remove". "Turn off all notifications on this device".

Entry points elsewhere (05 7.1), placed:

- Now screen outside daylight: one line under the "At the dock" panel, or under the hero when there is no such panel: "Get this every evening at 8 PM." as a text link with "Not now" next to it (dismissed for 90 days, `rowhether-notify-nudge-v1`).
- Week tab, under Plan a row: "Tell me tomorrow's conditions at 8 PM."
- After I'm back, once per device for float plan users: "Get reminders as notifications, not only email."

### 5.13 Settings dialog

01 11.6 makes the fields follow the location. This document adds three things.

1. Top line (03 17.1): signed out "Saved in this browser for Putney Landing. Sign in to keep these settings on all your devices."; signed in "Saved to your account."
2. Limit sets (8.4): a row of `.choice` buttons under the title, "Default", "Single", "Eight", "New set". The boat limits (wind, gusts, rain, cold, air quality) below it belong to the chosen set, under the legend "Limits for Single, at every location". The location limits (flow, tide, level, course heading, water temperature reading) follow under "At Putney Landing". With no sets beyond Default, the dialog looks as it does today except for a link "Add a set for another boat" under the title.
3. Units and clock (7.1): a fieldset at the end, "Units and clock, for every location", with System (Auto, US, UK, Metric), Wind (Auto, mph, km/h, m/s, knots) and Clock (Auto, 12-hour, 24-hour), as selects. Changing them redraws at once after Save.

Every number field shows its unit in the label, in the viewer's units ("Caution at, km/h"), and converts on save (7.4).

### 5.14 Admin and moderation

`/admin` and `/mod` are two pages of the `admin` chunk, never precached. `/admin` is behind Cloudflare Access in phase 1 and, as a second lock, after phase 2 (03 3.7); from phase 2 it also needs site role `admin` with a passkey session (03 10). `/mod` is outside Access, which allows only the owner, so moderators can open it; it needs site role `moderator` or `admin` with a passkey session. Its routes are `/api/mod/*` (08 7.3).

- `/admin`: header "Admin", text tabs Users (03 16.8), Notifications (05's stats, phase 4), Metrics (14.5), Audit (03 14.2).
- `/mod`: header "Moderation", text tabs Queue (04 8.7, phase 3) and Locations (01 13: verify, archive, merge, suggestions; phase 3).
- Tables are allowed here (wide data, owner use), each inside a `.hours-wrap` so they scroll inside the panel at 360 px.
- Every destructive action opens a confirm sheet naming the thing and the effect: "Merge Putney town dock into Putney Landing? 14 reports, 3 favorites and 1 alert rule move. This cannot be undone."

### 5.15 Static pages

Privacy, terms and about (03 asked 07 to decide the format).

Decision: Plain HTML pages built by Vite as extra entry points (`build.rolldownOptions.input` in Vite 8; `rollupOptions` remains as a deprecated alias, verified in the Vite 8.3.1 type definitions on 2026-10-17), sharing the app's CSS and fonts, readable with no JavaScript, served at `/privacy`, `/terms` and `/about` (Workers assets serve `privacy.html` at `/privacy`, from docs, https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/). Recommended: they print, they work in any reader mode, link previews read them, and a lawyer can review a single file.
- Alternative: routes inside the app (one more set of views in the bundle, and invisible to crawlers without JavaScript).
- Alternative: hosted elsewhere, such as a GitHub page (a second place to keep in step).

Phase 1 ships `privacy.html` alone, short: the open counter sentence (14.3) and what the app keeps in the browser. Phase 2 completes it from 03 13.3 and adds `terms.html` and `about.html`. The service worker denylist (9.6) names all three from the start.

Each page: the header with "RoWhether" and a link "Back to the forecast", the text, and "Last changed Nov 1, 2026." The about page carries 02's full attribution table and the app version.

## 6. Copy

### 6.1 Header subtitle

Today: "Connecticut River at the Putney Rowing Club docks. All times Eastern." (`index.html` `.sub`).

Template, built by `subtitleText(loc, now)` in `src/render/header.js`:

```
${loc.subtitle || generated} All times ${zoneName}${zoneDiff}.
```

- `loc.subtitle` is 01's curated line. Putney's is "Connecticut River at the Putney Rowing Club docks." so Putney's subtitle is unchanged.
- `generated` when there is no subtitle: "${waterway name} at ${locality}." ("Charles River at Cambridge, MA."), or "${locality}." when the waterway name is the location name.
- `zoneName` is 01's `zoneName(t)`: `tzLabel` when set ("Eastern", "UK time"), otherwise the generic zone name without " Time".
- `zoneDiff` is added only when the device's current UTC offset differs from the location's, read with `Intl.DateTimeFormat` `timeZoneName: 'shortOffset'` ("GMT-4", "GMT+5:30"; verified live 2026-10-17 in Node 22 with ICU 77.1; Safari 15.4 and later, Chrome 95, Firefox 91 from @mdn/browser-compat-data 8.1.6). Wording: ", 1 hour ahead of you", ", 5 hours behind you", ", 30 minutes ahead of you", ", 5 hours 30 minutes ahead of you".

Examples:

- Putney, phone in New York: "Connecticut River at the Putney Rowing Club docks. All times Eastern."
- Putney, phone in Chicago: "Connecticut River at the Putney Rowing Club docks. All times Eastern, 1 hour ahead of you."
- Putney Embankment, phone in Vermont (phase 7): "Thames at Putney Embankment, London. All times UK time, 5 hours ahead of you."

Club pages: "Rows from Putney Landing. All times Eastern." Quick look: "A point, not a saved launch site. No course, river gauge or local limits. All times Eastern."

### 6.2 Share text

`src/share.js` today: text "Putney Landing rowing, 6:41 AM: Go. ..." title "Putney Landing rowing forecast", URL `SITE_URL` on production and the page's own address on dev.

New:

| Part | Template | Putney example |
| --- | --- | --- |
| Text | `${loc.name} rowing, ${hm(now)}${zoneSuffix}: ${verdict} ${why} ${holds}` | "Putney Landing rowing, 6:41 AM: Go. Wind 4 mph from NW, gusts 8. Flat water. 46°F air, 49°F water. Holds until about 10 AM, then the wind builds." |
| `zoneSuffix` | " Eastern" only when the sharer's device zone differs from the location's | (none for a sharer in Eastern) |
| Title | `${loc.name} rowing forecast` | "Putney Landing rowing forecast" |
| URL, production | `SITE_URL + loc.slug` | `https://rowhether.com/putney-landing` |
| URL, dev | `location.origin + location.pathname` (as now) | |
| Quick look | text starts "Rowing near Worcester, MA, 6:41 AM:"; URL `SITE_URL + 'at/' + lat + ',' + lon` | |
| Share this location (Info tab) | title `${loc.name} on RoWhether`, text "Rowing conditions at Lake Quinsigamond.", URL as above | |

The text is still read from the hero (`$('verdict')`, `$('why')`, `$('holds')`, and `$('notChecked')` when it shows), so it always matches the screen, including the club line when it applies. A shared Go at a location with an unchecked factor therefore carries "Not checked here: river flow." with it. Units follow the viewer (7.3). The button keeps its label and its "Copied" and "Could not share" flashes.

### 6.3 App name and manifest

Today `vite.config.js` sets `name: 'Putney Landing rowing conditions'`, `short_name: 'Putney Row'` and a Putney description; `index.html` sets `apple-mobile-web-app-title` to "Putney Row"; the install bar and dialog say "Putney Row". There is no manifest `id`, so the app's identity is its `start_url`, `./` resolved against `/manifest.webmanifest`, that is `https://rowhether.com/` (from docs, https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id: an absent `id` falls back to `start_url`, and a changed `id` makes a separate app).

Decision: Name the app RoWhether everywhere from phase 1: `name: 'RoWhether'`, `short_name: 'RoWhether'`, `apple-mobile-web-app-title` "RoWhether", description "Go, caution or stay off: rowing conditions for your launch site, hour by hour." Add `id: '/'` and keep `start_url: './'` and `scope: './'` so existing installs stay the same app. Recommended: the name has to work for every location, and it is already the domain. Existing installs keep their "Putney Row" label: iOS sets it when the app is added, and Chrome 144 and later stores name and icon changes as an optional "Review app update" in its menu instead of forcing a dialog (from docs, https://developer.chrome.com/blog/improvements-to-web-app-updates). The icon artwork does not change, so no icon update is triggered.
- Alternative: keep "Putney Row" until phase 3, when community locations make Putney a small part of the app.
- Alternative: `short_name: 'Row'` for a shorter home screen label (generic, and less findable in an app list).
- Not recommended: a manifest per location, which would make each location a separate installed app with its own `id`.

`id: '/'` resolves to `https://rowhether.com/`, the same identity installs have today, because a relative `id` resolves against the origin of `start_url` (same MDN page). A Playwright check reads the built manifest and asserts both fields (13).

### 6.4 Install copy

| Where | Today | New |
| --- | --- | --- |
| Install bar text (`index.html` `#installBar p`) | "Add Putney Row to your home screen. It opens full screen in one tap." | "Add RoWhether to your home screen. It opens on Putney Landing in one tap." (the current location's `name`; on the picker page: "It opens full screen in one tap.") |
| Install dialog note (`index.html` `#install .note`) | "Then open Putney Row from its icon. It opens full screen and keeps the last forecast for when you are offline." | "Then open RoWhether from its icon. It opens on your last location and keeps the last forecast for when you are offline." |
| Steps (`src/install.js` `STEPS`) | no app name | unchanged |
| 05's notification lead (05 7.2) | | "Add RoWhether to your Home Screen first" (already matches) |
| Footer button | "Install this app" | unchanged |

`renderHeader()` fills the install bar text when the location changes, so the sentence always names the place it will open on.

### 6.5 Page titles and link previews

| Page | `<title>` and `og:title` | Description |
| --- | --- | --- |
| Location | "Putney Landing rowing conditions" (unchanged for Putney) | 01's per-location shell: "Go, caution or stay off: rowing conditions on the Connecticut River at Putney Landing, VT." |
| `/` during the 90-day window | unchanged from today (Putney) | unchanged, so old shared links still preview as Putney |
| `/` after it | "RoWhether rowing conditions" | "Go, caution or stay off: rowing conditions for your launch site, hour by hour." |
| Quick look | "Rowing near Worcester, MA" | (runtime only) |
| Club | "Putney Rowing Club on RoWhether" | (runtime only) |
| Account, Add, Admin, Moderation | "Your account", "Add a location", "Admin", "Moderation" | none, and `<meta name="robots" content="noindex">` set at runtime |

`document.title` is set on every page change.

### 6.6 Footer

Today: two paragraphs, the data credits for Putney and the starting points sentence, plus Install and Suggest buttons.

- Data credits come from `attributionFor(loc)` (02, Attribution), using only the location's active bindings. Phase 1 renders the credits from the Putney record's `copy.credits` (01) and corrects the NWS office (01 Decision); phase 0 leaves `index.html` as it is (08 14.3).
- A generic US river: "Forecast from Open-Meteo. Alerts and observations from the National Weather Service. River flow from USGS gauge 01104500 at Waltham. Air quality from Open-Meteo (Copernicus CAMS), and the model comparison from GFS, ECMWF, GEM and ICON via Open-Meteo."
- A lake: the river sentence is left out. A location with no official alerts: the alerts sentence is left out (the gap is explained where it matters, 6.7).
- The second paragraph stays: "Thresholds are starting points, not club rules. Lightning: off the water at the first thunder, back on 30 minutes after the last. Look at the water before you launch." At a location where a factor is not checked (6.7) or that is community-added and not verified, it ends with "Some locations have fewer checks." (03 13.2). Putney's footer does not change. For a member with club rules on, the first sentence becomes "Putney Rowing Club rules apply where marked."
- New links line (phase 2): "Privacy", "Terms", "About", as plain text links.
- The Install and Suggest buttons stay as they are.

### 6.7 Empty and degraded states

02's rule holds: "not available here" and "failed" are different states with different copy. Failures keep today's note under the hero ("Could not reach USGS river gauges. Showing the last data received where available.").

| State | Where | Copy |
| --- | --- | --- |
| Offline, showing cache | Header | "Saved 6:41 AM" (replaces "Saved data from 6:41 AM", which wraps at 360 px, 4.3) |
| No river gauge, river | River tab hidden; Week, River row | "No river gauge here, so flow is not checked." |
| No river gauge, lake | Week, River row | "This is a lake. Flow is not checked." |
| Limits differ from the global defaults at a community-added location that is not verified (01 11.1) | Hero, one quiet line under the verdict | "Limits here were set by the person who added this location." Not shown for curated or verified locations, so Putney's screens do not change. |
| A factor that could change the level is not checked: a river with no gauge, a location with no official alerts feed (`notChecked()`, 01 8.4) | Hero, one quiet line under the verdict, `#notChecked` | "Not checked here: river flow, official alerts." Names only the factors that apply. Share and 05's night-before message carry it too. Not shown at Putney while its sources answer. |
| Gauge reading too old (over 24 h, 01 15.7) | Hero, `#notChecked` | "River flow not checked: the gauge has not reported for 2 days." |
| Same | River flow fact note | "Last reading 2 days ago, not used for Go, Caution or Stay off." |
| Gauge switched to the fallback (01 15.7) | River flow fact note | "Using the Wellesley gauge. Waltham has not reported since 3 AM." |
| No official alerts feed (outside the US until phase 7) | Storms tab | "No official warnings feed for this country yet. Check your national weather service before you row." (02) |
| Same | Week, Alerts row | "Not available here" |
| Same | Notification settings | "No official alerts feed here." |
| No water temperature | Water fact | "No water temperature here. Add a dock reading in Settings." |
| Same, with curated monthly values (01 11.4; 08 K1) | Water fact | "Typical for October, about 52°F. No live reading." |
| Same | Temperature tab | "No water temperature here. Add a dock reading in Settings to turn on the cold-water check." (02) |
| Same | Fog tab, How this works | "Steam fog needs a water temperature. Add a dock reading in Settings." (02) |
| No course set (lake, `kind: 'none'`) | Compass caption | "Wind from SW across about 2.4 km of open water." (01 10.5), or with only a size class: "Wind from SW." |
| Same | Wind fact note | "From SW." with no head or crosswind sentence |
| Same | Wind tab, How this works | "Head and crosswind are not shown because no course is set here. Suggest one from the Info tab." |
| Course unconfirmed, community record | Info, Water and course | "The course direction was set from a map and has not been checked on the water." (not shown for curated records such as Putney, so Putney's screens do not change) |
| Sun does not set (01 15.4 `polar: 'day'`) | Day by day lede | "Morning is 5 to 10 AM, midday 10 AM to 3 PM, afternoon 3 to 10 PM. The sun does not set today." |
| Same | Light tab opening line | "The sun does not set today. Rowing hours here are 5 AM to 10 PM." |
| No full dark (`polar: 'white'`) | Light tab | "It does not get fully dark tonight. Lights are needed before sunrise and after sunset." |
| No daylight (`polar: 'night'`) | Hero | "Stay off." then "No daylight today. First light returns Jan 15." (01) |
| No air quality forecast | Air tab | "No air quality forecast for this spot right now." (02) |
| No model comparison | none | confidence lines are left out, as today |
| Every source blocked | Hero | today's text, unchanged |
| No reports | Dock line | "No reports from the dock in the last 3 hours." (unchanged) |
| No hazards | Info | "No hazards reported on this water." |
| No launch notes | Info | "No launch notes yet." |
| No traffic pattern | Info | "Traffic pattern not recorded. Ask the club or the people at the dock." |
| No favorites | Picker | "Tap the star next to a location to keep it here. Then you can see which of your places looks best today." |
| Settings reminder, location with no flow | `#setNudge` | "Set your own limits in Settings. Until you do, Go, Caution and Stay off use starting values for wind, gusts, rain and cold water." (today's sentence lists "river flow" too; the list is built from the location's limit keys) |

### 6.8 Words

| Use | Not | Why |
| --- | --- | --- |
| Go, Caution, Stay off | call, verdict, rating (in the UI) | CLAUDE.md |
| location, launch site | venue (except in 06's club words) | 01's term. 02's sentences that say "this spot" may stay. |
| your places | favorites (in the UI) | warmer, and it is not a ranking |
| Start a row, I'm back | sign out a boat, check out | 04 Decision |
| Sign in, Sign out | log in, log out | 03 |
| limits | thresholds (in new UI copy) | plainer; "thresholds" stays in code, and the footer's existing sentence stays for Putney |
| community added | user-generated, unverified | 01 2.3 |
| checked by | verified by (in sentences) | plainer; "Verified club" stays as 06's badge |
| hazard | alert (alerts are official, 02) | keeps the two apart |

## 7. Units, time and locale

### 7.1 What the viewer chooses

Three settings, global (every location), saved in this browser and synced when signed in:

| Setting | Values | Stored |
| --- | --- | --- |
| System | Auto, US, UK, Metric | `users.units` (03 7) for signed-in viewers; `rowhether-units-v1` `{ "system", "wind", "clock" }` in this browser |
| Wind | Auto (follow the system), mph, km/h, m/s, knots | same object; synced as `user_settings` global key `windUnit` (section 16) |
| Clock | Auto, 12-hour, 24-hour | same object; synced as global key `clock` |

What each system shows:

| Quantity | US | UK | Metric |
| --- | --- | --- | --- |
| Wind and gusts | mph | mph | km/h |
| Air and water temperature | °F | °C | °C |
| Rain amount and rate | in, in/hr | mm, mm/h | mm, mm/h |
| Visibility | mi | mi | km |
| Distances (picker, row log, hazards) | mi | mi | km |
| River flow | cfs | m³/s | m³/s |
| River stage, tide height | ft | m | m |
| Tidal stream | kn | kn | kn |
| Rain chance, air quality, UV | unchanged | unchanged | unchanged |

UK follows common British usage of mph for wind and miles for distance with Celsius (unverified as a convention; the owner or British clubs should confirm). Knots are offered for wind because sailing coaches and launch drivers often use them.

### 7.2 Defaults by country

Auto picks by the viewer's locale region, from `new Intl.Locale(navigator.languages[0]).maximize().region` ("en" maximizes to US, "en-GB" to GB, "fr-CA" to CA; checked in Node 22, verified live 2026-10-17), not by the location's country. Units belong to the person: a US crew racing in Canada still thinks in mph.

| Region | System | Wind | Clock |
| --- | --- | --- | --- |
| US, and Liberia and Myanmar | US | mph | 12-hour |
| GB | UK | mph | 24-hour |
| NO, SE, FI, DK, IS | Metric | m/s | 24-hour |
| everything else | Metric | km/h | from the locale (7.6) |

The Nordic m/s default follows national forecast practice (unverified; check before phase 7).

Existing users: when phase 2 ships, a one-time step `pinUnits()` in `src/storage.js` runs before the first render. If `rowhether-units-v1` is absent and the browser already holds `rowhether-last-v1` or `rowhether-settings-v2` (anyone who used the app before units existed, including every migrated Putney install, 01 8.6), it writes `{ "system": "us", "wind": "auto", "clock": "12" }`. Nothing changes for them whatever their phone's locale. Browsers that first open the app after phase 2 get Auto.

Decision: Auto follows the viewer's locale, and browsers that used the app before phase 2 are pinned to US units and the 12-hour clock. Recommended, because units are personal and existing users must see no change.
- Alternative: follow the location's country (a Vermont rower in Montreal would suddenly see km/h).
- Alternative: US for everyone until the viewer chooses (simplest, wrong for most of the world from phase 7).

### 7.3 Display conversions and rounding

Internals stay mph, °F, inches, metres for visibility, and each binding's native flow unit (01 11.1 and 02 Decisions). Conversion happens only in the formatters (7.7).

| Quantity | Internal | Shown as | Rounding | Putney examples |
| --- | --- | --- | --- | --- |
| Wind, gusts | mph | km/h (x 1.609344), m/s (x 0.44704), kn (x 0.868976) | km/h, kn whole; m/s one decimal | 10, 15, 18, 25 mph = 16, 24, 29, 40 km/h = 4.5, 6.7, 8.0, 11.2 m/s = 9, 13, 16, 22 kn |
| Temperature | °F | °C = (F - 32) x 5/9 | whole degrees; Settings water reading one decimal | 32°F = 0°C |
| Temperature difference (fog spread, steam fog) | °F difference | °C difference = x 5/9, no offset | one decimal | 2 and 4°F spread = 1.1 and 2.2°C; 18 and 10°F water over air = 10.0 and 5.6°C |
| Air plus water (cold line) | °F sum | °C sum = (sum - 64) x 5/9 | whole degrees | 100°F combined = 20°C combined (7.4) |
| Rain amount | in | mm (x 25.4) | one decimal under 10 mm | 0.15 in/hr = 3.8 mm/h; rate words at 0.1 and 0.3 in/hr = 2.5 and 7.6 mm/h |
| Visibility | m | mi as `visText()` today, or km | as today; km one decimal under 10, "10+ km" at 10 km | 0.25 mi = 0.4 km, 1 mi = 1.6 km |
| Distance | m | mi or km | one decimal under 10, whole above | |
| River flow | binding unit | cfs, or m³/s (1 m³/s = 35.3147 cfs, 01 8.5) | 01 15.6's `fmtFlow` rules | 20,000 cfs = 566 m³/s; 28,000 cfs = 793 m³/s |
| Stage, tide height | binding unit | ft or m (x 0.3048) | ft one decimal, m two | |

`Intl.NumberFormat` has `mile-per-hour`, `kilometer-per-hour`, `meter-per-second`, `celsius`, `fahrenheit`, `millimeter`, `inch`, `kilometer` and `mile` units, but not knots or cubic metres per second (verified live 2026-10-17 in Node 22: `knot` and `cubic-meter` throw `RangeError`). The formatters therefore write unit strings themselves ("12 mph", "12 km/h", "4.5 m/s", "9 kn", "566 m³/s") and use `Intl.NumberFormat('en-US')` only for grouping and decimals. Numbers keep en-US separators until translations (7.8).

Chart axes use `niceTicks()` on the converted values, so a km/h chart has ticks at 10, 20, 30, not 16.1 and 32.2. Settings lines on charts are drawn at the converted threshold.

### 7.4 Limits in other units

- Settings fields show and accept the viewer's unit. On save, the value converts to the internal unit as a float, without rounding, and is stored that way. It shows again exactly as typed: 20 km/h saves as 12.42742 mph and displays as 20 km/h. Validation ranges convert too ("Caution at, km/h" accepts 2 to 97 when today's mph field accepts 1 to 60).
- Flow, stage and tide limits stay in the binding's own unit in Settings, because a threshold must not drift through rounding (01 11.1). The field is labeled in that unit ("River flow at North Walpole, cfs") and shows the converted value under it for a metric viewer ("About 566 m³/s"). How this works says "Limits are set in cfs, the gauge's unit."
- The cold line is a sum of two temperatures, so it converts with the offset counted twice: air plus water under 100°F is air plus water under 20°C, not 38°C. 01 11.2 shows the cold line as 20°C (08 K26). The How this works panel in metric: "Caution when air plus water is under 20°C. With 10°C air that means water under 10°C."
- Report water temperature (04 3.1) is entered in the viewer's unit and stored in °C by 04, so it converts on the way in and out.

### 7.5 Time zones

- Every time on a location page, in its notifications (05 3.2) and on its status link (04 6.4) is in the location's zone, as today for Putney. `setZone(loc.tz)` runs before the first render (01 8.2).
- The zone is named once on screen, in the subtitle (6.1), plus wherever a time is entered: "Back by (Eastern)", "8:00 PM Eastern".
- Compare rows each use their own place's zone (5.3).
- The account page, row log list and notification list use the time of each item's location, with the zone named when it differs from the home location's: "Oct 14, 6:40 AM Central".
- Quiet hours follow the device (05 4.4) and say so: "10 PM to 6 AM, Eastern (this phone)".

### 7.6 12 or 24 hour clock

- Auto reads the viewer's locale with `new Intl.DateTimeFormat(navigator.languages[0], { hour: 'numeric' }).resolvedOptions().hourCycle`: `h11` or `h12` means 12-hour, `h23` or `h24` means 24-hour. en-US, en-CA, en-AU and en-NZ give `h12`; en-GB, en-IE, de-DE, nl-NL and fr-CA give `h23` (verified live 2026-10-17, Node 22). `Intl.Locale.prototype.getHourCycles()` is newer (Safari 17, Chrome 130 per @mdn/browser-compat-data 8.1.6) and absent in Node 22, so it is not used.
- The app formats times in its own style, not the locale's, so copy stays consistent while the text is English: 12-hour is today's style ("6:41 AM", whole hours "6 AM", chart labels "6a"). 24-hour is "06:41", whole hours "06:00", chart labels "06". Locale styles such as "6:00 a.m." (en-CA) or "06 h 00" (fr-CA) are not used.
- Ranges keep "to": "06:41 to 10:00", "1 to 5 PM" becomes "13:00 to 17:00".
- `zoneFormat(tz, { clock })` (01 8.2) takes the clock, so `hm()` and `hShort()` change in one place. The Worker's copy builders (05 3.2) take the user's clock from their settings.

### 7.7 Where the formatters live

New pure module `src/units.js`:

```js
// Display units. Internals stay mph, °F, inches and metres (01 11.1).
export function unitFormat({ system = 'us', wind = 'auto' } = {}) {
  // returns { speed(mph), speedUnit, temp(f), tempDiff(f), tempSum(f), precip(in), rate(inPerHr),
  //           vis(m), dist(m), flow(v, unit), stage(v, unit), toMph(v), toF(v), toFDiff(v), toFSum(v),
  //           toIn(v), system, windUnit }
}
export function unitsFor(prefs, locale) { /* resolves Auto from the locale (7.2) */ }
```

- `buildModel(loc, data, S, now, { units })` sets `m.u = unitFormat(units)` next to `m.fmt`. Every reason text built in `src/logic.js` ("Gusts to 19 mph", "Visibility under 1 mi") and every render string uses `m.u`. The Worker's notification copy (05) builds `m.u` from the user's units, so a notification never disagrees with the screen.
- Phase 0 moves every unit string in `src/logic.js`, `src/format.js` (`visText`), `src/render/` and the detail views onto `m.u` with US units only. The golden tests (01 8.7) prove the text is identical.

### 7.8 Translations later

Not planned for any numbered phase. What makes them cheap later:

1. From phase 1, new screens keep their words in `src/copy/<screen>.js` modules that export functions (`pickerCopy.noMatch(q)`), not strings inside render code. Existing strings move when their file is touched for other reasons.
2. `src/logic.js` reasons gain a stable key and values next to the text (`{ key: 'gust', text: 'Gusts to 19 mph', v: { gust: 19 } }`). Rendering keeps using `text` until a second language exists.
3. When a second language is added: `src/i18n.js` with `t(key, vars)`, a catalog per locale loaded with `import()`, plurals with `Intl.PluralRules`, numbers with `Intl.NumberFormat(locale)`, a `lang` setting next to units, `<html lang>` set at runtime, and `users.lang` for the Worker's copy.
4. People's text (location names, launch notes, hazard notes, club pages) is shown as written, never translated by the app.
5. First candidates, from 01's phase 7 test locations: French (Montreal).

Decision: Plain JavaScript message modules and `Intl`, no translation library. Recommended: no dependency, small, and the copy count is in the hundreds, not thousands.
- Alternative: FormatJS (ICU MessageFormat), a standard format translators know, at the cost of a runtime dependency (size unverified).
- Alternative: i18next (widely used, more than this app needs).

### 7.9 Phases

| What | Phase |
| --- | --- |
| `m.u` and `zoneFormat(tz, { clock })` plumbing, US only, identical output | 0 |
| Subtitle zone name and "ahead of you" phrase | 1 |
| Units and clock choice in Settings and Account, Auto by locale, earlier users pinned to US | 2 |
| Non-US locations, EU air quality scale (01, 02) | 7 |
| Translations | Later |

Decision: Ship the units and clock choice in phase 2, with 03's profile field. Recommended: 03 already puts Units on the Account page in phase 2, and visitors from metric countries can read US waters sooner.
- Alternative: phase 7 with the first non-US locations, as 01 row 27 assumes.

## 8. Individual rower features

### 8.1 Your places

03 section 8 owns the data (ids, sync, merge on sign-in). The UI:

- The star appears in the picker rows, on the current location row, and in the Info tab. Not on the Now screen: the Now screen stays quiet.
- Tapping the star toggles at once, writes `rowhether-favorites-v1`, and, signed in, sends `PUT /api/me/favorites` (03). The button's label changes to "Remove Lake Quinsigamond from your places", and a polite live region says "Added to your places."
- At 50 places the star is disabled with the note "Your places holds up to 50 locations."
- Your places are also the locations 05's notification settings list first (5.12).

### 8.2 Compare

5.3.

### 8.3 Alerts

05 owns them, and they need an account (05 Decision). The individual rower's entry points are placed in 5.12. One more: the Info tab of a location in Your places shows "Alerts for this location" with the current state ("Night-before outlook at 8 PM") and a link to Account, Notifications.

### 8.4 Limit sets by boat

A sculler in a 1x and the same person in an eight need different wind and gust limits. Today there is one set of limits per location (01 11.5).

A limit set is a named group of the boat limits: `windCaution`, `windOff`, `gustCaution`, `gustOff`, `rainCaution`, `rainOff`, `coldCombined`, `aqiCaution`, `aqiOff`. Location limits (`flowCaution`, `flowOff`, `streamCaution`, `streamOff`, `minLaunch`, `levelLow`, `levelHigh`, `heading`, `waterOverride`) stay per location, because they describe the water.

```json
{ "id": "k7q2m9xd", "name": "Single", "boat": "1x", "values": { "gustCaution": 14, "gustOff": 20, "windOff": 12 } }
```

- Each set is one `user_settings` global key, `set1` to `set6` (03 9.2), because 03 caps each stored value at 500 characters (`user_settings.value`, 03 section 15) and six sets in one value would not fit. A full set with all nine values is about 260 characters (estimate). Per-key last writer wins (03 9.3) then works per set. In this browser: `rowhether-sets-v1` holds the same objects keyed `set1` to `set6`, with per-key edit times like `rowhether-settings-v2` (03 9.2).
- `id` is 8 characters from `crypto.randomUUID()` (the first 8 hex digits), unique among the person's sets.
- The set in use is per location: scope `loc:<id>`, key `activeSet`, value a set id or `""` for Default. `set1` to `set6` and `activeSet` are new keys for `src/settings-keys.js` (section 16).
- Default is not stored. It is today's behavior: the location's limits plus this viewer's per-location overrides.
- `values` hold only the keys the set changes. Anything not in the set falls through, so a set can be as small as one gust limit.
- `boat` is optional, one of 06's boat classes. When the viewer is a club member, choosing a set with a boat also sets the boat in 06's "Rowing as" sheet for this location, and the other way round. One place to say what you are rowing.
- Up to 6 sets. Names 1 to 20 characters, unique, sentence case not enforced (they are the person's words).

Precedence, extending 01's `effectiveSettings(loc, { club, overrides, set })`:

1. `GLOBAL_DEFAULTS`.
2. The location's `thresholds`.
3. The viewer's per-location overrides, for location limits always, and for boat limits only while Default is in use.
4. The active set's `values`, for boat limits.
5. The club rule overlay when on, which members can tighten but not loosen (01 Decision).

`S._from` gains `set` so Settings and How this works can label a value "Your Single limit".

Where it shows:

- The hero: when a set other than Default is in use, one small line above the verdict, "Your Single limits. Change", in the same slot and style as 06's club line (11.2). With club rules on, the club line takes the slot and reads "Putney RC rules: Masters, 1x without a launch. With your Single limits. Change".
- "Change" opens the "Rowing as" sheet: Limits (Default, Single, Eight), and for members 06's boat, launch and club rules controls.
- Settings: 5.13.
- Notifications (05): the engine evaluates a location with that location's active set.
- Share text: unchanged (it reads the hero).
- Migration: none needed. Existing per-location overrides keep working under Default.

Decision: Limit sets hold only the boat limits and apply at every location, with the set in use chosen per location. Recommended: a boat's limits do not change with the river, the water's limits do, and a rower at two waters can use a different boat at each.
- Alternative: sets per location (simpler to explain, but a sculler with three waters keeps three copies of the same Single limits).
- Alternative: no sets; people change Settings before each row (today's behavior, error prone at 5 AM).

### 8.5 Row log

04 section 7 defines the content and the CSV. Account, Row log (`/account#rows`):

- Totals line first: "This year: 64 rows, 71 hours, 812 km." Distance in the viewer's unit. Hours as "71 hours" or "45 min" for small totals.
- Filters as `.choice` buttons and selects in one row that wraps: Year, Location, Boat type.
- The list: one `<li>` per row, newest first, 50 at a time with "Show more". Line 1: "Tue, Oct 14, 6:40 to 7:52 AM. Putney Landing." Line 2: "2x, Hudson double, with Sam. 12.4 km." Line 3: "Started in Caution: gusts to 19 mph." with the level's dot and word. Line 4: the note, in `--muted`. "Edit" and "Delete" as quiet buttons.
- "Download CSV" (04's export) at the bottom, with the year filter applied.
- Empty: "No rows yet. Tap Start a row at the dock, and finished rows collect here."

### 8.6 Share

6.2 for the text. Two additions:

- "Share this location" in the Info tab shares the link only.
- Plan a row (Week tab): "Share this plan" under the sessions list, text "Lake Quinsigamond, Saturday: Go 7 to 8:30 AM, flat water, gusts 9 mph." with the link `/<slug>#week/2026-10-24`. Phase 2, with the other Week changes.

## 9. Offline and caching

### 9.1 What is stored per location

01 8.6 defines the keys. Measured size of one location's cached data (`JSON.stringify({ data, updated })`, the value `saveCache()` writes), for Putney on 2026-10-17:

| Slot | Characters | Source of the measurement |
| --- | --- | --- |
| `wx` | 13,234 | synthesized with today's 13 hourly, 8 current and 6 daily variables over 168 hours, because `api.open-meteo.com` timed out from the sandbox |
| `models` | 13,615 | synthesized, 4 models, 168 hours; the live request returned 429 "Daily API request limit exceeded" from the sandbox's shared address |
| `aq` | 4,699 | live response, parsed by `parseAQ()` |
| `flow` | 5,511 | live, 190 points, `parseFlow()` |
| `flowDays` | 871 | live |
| `flowFcst` | 380 | live |
| `obs`, `river`, `alerts` | 173 | live; no alerts were active |
| Total | 38,597 | |

So about 40,000 characters per location on a quiet day (verified live 2026-10-17 for the NWS, USGS, NWPS and air quality parts). Each active NWS alert adds its full description and instructions, often 2,000 to 6,000 characters (estimate), so plan for 60,000. A location record (`rowhether-loc-v1:<slug>`) is 3 to 5 KB (01 7.2).

### 9.2 The cap and eviction

Compare needs every favorite's cache to work offline, so:

- Keep cached data and records for up to 10 locations: the current location, then favorites in their order, then the most recently opened.
- A small index `rowhether-cache-index-v1` = `{ "<slug>": <last opened ms> }` lets the app pick what to drop without parsing the large entries.
- After each `saveCache()`, if more than 10 locations are cached, delete the cache and record of the least recently opened location that is neither current nor a favorite. If only favorites remain beyond 10, drop the favorite opened least recently (it refetches when opened).
- On `QuotaExceededError` (the name browsers throw, from docs, https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), drop one entry by the same rule and retry, at most 3 times, then give up silently, as `saveCache()` does today. Every step stays in try/catch.
- Quick looks (5.4) share the cap, keyed `at:42.961,-72.522`, and are dropped first.

Ten locations at 60,000 characters is 600,000 characters, plus records, settings, the outbox (04) and the board (06): under 1 MB in all.

### 9.3 Storage limits

- MDN says "Browsers can store up to 5 MiB of local storage, and 5 MiB of session storage per origin", and elsewhere on the same page "limited to 10 MiB of data maximum on all browsers" (from docs, same MDN page; the two statements disagree). Plan for 5 MiB and stay under 1 MB.
- Safari deletes script-written storage after seven days of Safari use without interaction with the site when tracking prevention is on (same MDN page). Home Screen web apps "have their own counter of days of use", and WebKit does "not expect the first-party in such a web application to have its website data deleted" (from docs, https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/). So a Safari tab can lose its saved settings after a week away; the installed app should not. Signing in and sync (03) is the remedy, and the Settings top line says so (5.13).
- Storage can come back empty or throw. Every read and write stays wrapped, and every screen renders with location defaults when it does, as today with `DEFAULTS`.

### 9.4 What the picker shows offline

- The current location, Your places and Recent, from their cached records, each with its compare line "As of 6:10 AM".
- Phase 1 and 2: search and All locations work, from the precached `/locations/index.json` (01 7.3). Opening a location whose forecast was never saved shows its header and tabs from the precached record, and the hero says "No forecast saved for this location on this phone yet. Connect to load it."
- Phase 3: search covers saved places only ("Offline. Search covers places saved on this phone."). Near me and the map are hidden.

### 9.5 Offline elsewhere

| Screen | Offline behavior |
| --- | --- |
| Location page | As today: last good data, "Saved 6:41 AM" in the header, failures named under the hero |
| Info tab | From the cached record. Hazards from the last fetch with "As of Oct 16". Emergency info is part of the record (06 8.7), so it is there |
| Report dialog, Start a row, I'm back | Through 04's outbox, with its offline copy |
| Board | 06 8.4: the last board with "Not updated since 6:41 AM. No connection." |
| Account, Add, Admin, Moderation, Compare refresh | "This page needs a connection." with "Try again", from the main bundle when the page's chunk is not cached |
| Static pages | From the precache (4.2) |

### 9.6 Service worker

Its purpose does not change: it precaches the app shell and never handles `/api/*` or caches API responses (CLAUDE.md). Changes:

- `globPatterns` gain `locations/*.json` (01 7.3).
- `globIgnores` gain the chunks that are not part of the shell: `**/assets/map-*`, `**/assets/maplibre-gl-worker-*`, `**/assets/add-*`, `**/assets/admin-*` (10.5). They load from the network when opened.
- `navigateFallbackDenylist` gains `/^\/(privacy|terms|about)$/` (4.2).
- 05's `importScripts` for push handling.
- When the curated list passes 50 locations, precache only `locations/index.json` and fetch records on demand (each record is then cached by the app in `rowhether-loc-v1:<slug>`). This keeps the precache from growing with the list.

## 10. Performance

### 10.1 Today's bundle, measured

Production build of the repo in the sandbox, 2026-10-17 (Vite 8.3.1, vite-plugin-pwa 1.3.0). Gzip at level 9 and Brotli measured with Node's `zlib` (verified live 2026-10-17):

| File | Raw | Gzip | Brotli |
| --- | --- | --- | --- |
| `assets/index-*.js` (all app code, SunCalc) | 109,153 B | 38,790 B | 34,114 B |
| `assets/index-*.css` | 25,313 B | 5,918 B | 5,255 B |
| `index.html` | 11,874 B | 3,560 B | 2,859 B |
| `assets/workbox-window.prod.es5-*.js` | 5,653 B | 2,199 B | 1,950 B |
| `assets/archivo-latin-wdth-normal-*.woff2` | 90,104 B | already compressed | |
| `sw.js` plus `workbox-*.js` | 17,015 B | 6,143 B | 5,488 B |
| `manifest.webmanifest` | 515 B | 292 B | 244 B |

- Critical path for the Now screen (HTML, main script, CSS): 48,268 B gzip, plus the 90,104 B font.
- The precache holds 17 entries, 261.65 KiB (vite-plugin-pwa's report).
- The `latin-ext` and `vietnamese` Archivo files (86,240 B and 34,464 B) are built but not precached (`globIgnores`), and load only if a page uses those characters. Place names such as "Kraków" or "Łódź" pull in `latin-ext`; offline those characters fall back to a system font, which is acceptable.
- `@anthropic-ai/sdk` is a dependency of the Worker only and is not in the client bundle.

### 10.2 Budget

Budgets for the Now screen's critical path, gzip, checked in CI (10.6). 08 11.2 rebases them on the 2026-10-18 build, which grew after this table was measured; CI uses 08's numbers (K40):

| After phase | Main JS | CSS | HTML | Notes |
| --- | --- | --- | --- | --- |
| today | 38.8 KB | 5.9 KB | 3.6 KB | measured |
| 0 | 40 KB | 6 KB | 3.6 KB | `src/location.js`, `src/units.js`, zone formatters, the Putney record inline |
| 1 | 43 KB | 7 KB | 3.6 KB | path routes, header, subtitle, the picker stub (the picker itself is lazy) |
| 2 | 45 KB | 7.5 KB | 3.8 KB | 03's stub (account button, `rowhether-me-v1`), favorites, limit sets |
| 3 | 48 KB | 8 KB | 3.8 KB | `src/reportlogic.js`, `src/outbox.js`, outing banner, Info view |
| 4 | 49 KB | 8 KB | 3.8 KB | `src/notify.js` stub |
| 5 | 53 KB | 8.5 KB | 3.8 KB | 06's `src/clubrules.js`, `src/club-context.js`, hero lines (06 asks under 4 KB) |
| 6 and 7 | 54 KB | 9 KB | 3.8 KB | |

Other budgets:

- No new font files and no new font weights. The map's labels use the map host's glyphs (11.8).
- The precache stays under 400 KiB through phase 7 (today 261.65 KiB).
- Time to the first hero from cache: measured today in Playwright with Chromium's CPU throttled 4 times (`Emulation.setCPUThrottlingRate`) and the network offline, from navigation start to a `performance.mark('hero')` set in `render()` after `renderHero()` (08 P0.2). Today's number becomes the baseline; later phases must stay within 20% of it (not yet measured; measure in phase 0 before the refactor).
- Nothing new is fetched before the first render. 03's `GET /api/me`, 06's club context and 05's push sync run after it.

### 10.3 Lazy modules

Each is a dynamic `import()` with a stable file name, so Workbox patterns can include or exclude it.

| Module | Loaded when | Precached | Size |
| --- | --- | --- | --- |
| `src/picker.js` with `src/compare.js` | First tap on the location name; the picker page | Yes (offline places) | 6 to 10 KB gzip (estimate) |
| `src/map.js` with MapLibre | "Show map", the add flow's map steps, a hazard's "Show on map" or "Drop a pin" | No | 430 KB gzip (measured, 10.4) |
| `src/add/` | `/add` | No | 10 to 15 KB gzip (estimate), plus the map |
| `src/auth.js`, `src/account.js`, the WebAuthn browser library | The sign-in dialog, `/account` (03 17.5) | Yes, so the account page can say it is offline | 03's |
| `src/club/` | `/club/` routes, a club sheet (06 20) | Yes (06's offline board) | 06's |
| `src/admin/` | `/admin` and `/mod` | No | 10 KB gzip (estimate) |
| Turnstile | First open of a form that needs it (CLAUDE.md exception) | No | third party |

### 10.4 The map

Only the picker's "Show map", the add flow, and hazard pins use a map. The Now screen never loads one (02).

Measured on 2026-10-17 by building a small Vite 8.3.1 app that loads each library with `import()` on a click (verified live 2026-10-17):

| | MapLibre GL JS 6.14.0 | Leaflet 1.9.4 |
| --- | --- | --- |
| License | BSD-3-Clause | BSD-2-Clause |
| Lazy JS chunk | 1,027,415 B raw, 275,285 B gzip, 225,556 B Brotli | 149,340 B raw, 43,670 B gzip |
| Worker file | 508,314 B raw, 144,488 B gzip, 118,621 B Brotli | none |
| CSS | 82,935 B raw, 10,380 B gzip | 15,090 B raw, 6,360 B gzip |
| Total over the network | about 430 KB gzip | about 50 KB gzip |
| Tiles | Vector: OpenFreeMap, no key, CORS `*`, styles `positron`, `dark`, `fiord`, `liberty`, `bright` all 200 with `Access-Control-Allow-Origin: *` and a vector tile served with `max-age=315360000` (verified live 2026-10-17); terms from 02 | Raster: OSM standard tiles, "no SLA" and may block without notice (02). OpenFreeMap serves no raster tiles |
| Dark mode | A dark style, recolored from tokens | A CSS filter on raster tiles, or a second raster provider |
| Requirements | WebGL2 (WebGL1 removed in 6.0.0, from the MapLibre changelog); `GPUInitializationError` when it cannot start (6.7.0) | none special |
| Packaging | ESM only since 6.0.0, named imports (`import { Map } from 'maplibre-gl'`; the default import fails to build) | default export |

Two build facts found in the test (verified live 2026-10-17):

- MapLibre 6.14.0 finds its worker with `new URL('./' + name, import.meta.url)` built from a variable, which Vite does not follow, so the worker file is not emitted and the map cannot start. The fix that builds correctly: `import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'` and `setWorkerUrl(workerUrl)` before creating the map. Vite then emits `maplibre-gl-worker-<hash>.mjs`, byte-identical to the package file. Rendering in a browser with this fix is unverified; test it in phase 3 (13).
- In 6.14.0 the worker is self-contained (`maplibre-gl-shared.mjs` is an empty file), unlike 6.12.0, which split shared code into a separate 517 KB module. Package layout changes between minor versions, so the build test above should run again on every MapLibre upgrade.

Decision: MapLibre GL JS from npm, pinned to an exact 6.x version that is at least two weeks old when phase 3 starts, loaded only when a map is opened, never precached, with OpenFreeMap vector tiles. No map in phases 1 and 2: the curated list is short enough for search and a grouped list. Recommended: one free, keyless tile host with light and dark styles, crisp labels, and styling from the app's tokens. The 430 KB is paid only by people who open a map, usually at home in the add flow.
- Alternative: Leaflet 1.9.4 with OSM raster tiles (about 50 KB, works without WebGL2, but tile terms with no service level, no proper dark style, and a second tile provider to find if OSM blocks).
- Alternative: no map at all; the add flow uses "Use my location" and typed coordinates (smallest, but drawing a course and dropping a hazard pin become hard).

02 also asks whether tile, style, glyph and sprite requests to `tiles.openfreemap.org` fit the "no runtime loads from third-party CDNs" rule, and recommends treating them as data. This document agrees: the library is bundled, the tiles are data like the forecast, and the app shell never depends on them.

### 10.5 Precache

- In: the main bundle, CSS, `index.html`, icons, the Latin font, `locations/*.json` (phase 1 and 2), the picker chunk, the account chunk, the club chunk, the static pages.
- Out: the map chunk, its CSS and worker, the add chunk, the admin chunk, the other font subsets, per-location shells (01 7.3).
- Chunk names come from the entry file names (`src/map.js` gives `map-<hash>.js`). `build.rolldownOptions.output.chunkFileNames` stays at its default so the patterns in 9.6 keep matching. A CI check (10.6) fails if any `map-*` or `maplibre-gl-worker-*` file appears in the generated precache manifest.

### 10.6 Checks in CI

A small script `scripts/budget.mjs`, run after `npm run build` in CI, with no new dependency:

1. Read `dist/index.html`, find the entry script and stylesheet, gzip them with `zlib` at level 9, and compare with `budget.json` (the table in 10.2 for the current phase). Fail with the file, size and budget.
2. Read `dist/sw.js`, extract the precache list, and fail if it contains an excluded pattern or if the total exceeds 400 KiB.
3. Fail if `dist/index.html` references, as a script or a `modulepreload` link, any file whose name starts with a lazy chunk's name (`picker-`, `map-`, `maplibre-gl-worker-`, `add-`, `account-`, `club-`, `admin-`). Today it references only the entry script and stylesheet (checked in the 2026-10-17 build; `workbox-window` is already a dynamic import).

## 11. Design system additions

Everything here stays inside CLAUDE.md's design rules: Archivo only, width doing the work, the hero verdict the one loud element, surface panels on the page background, no all-caps labels, no eyebrow labels, no middle-dot separators, no monospace data labels, no identical rounded card grids, no decorative gradients.

### 11.1 Badges

`.badge`: inline, `font-size: .8125rem`, `font-weight: 600`, `padding: .05rem .5rem`, `border-radius: 999px`, `border: 1px solid var(--line)`, transparent background, `--ink` text. Sentence case. Used after a name or on its own line, never above a heading.

| Badge | Where | Variant |
| --- | --- | --- |
| Community added | Header badge line, picker row, Info status | plain |
| Draft | Header, picker (creator only) | plain |
| Archived | Header | plain, text `--muted` |
| Verified club | Club page header, Clubs here lines | `border-color: var(--go)` and a 0.45 rem `--go` dot before the word |
| Not verified yet | Club page header for members | plain |
| Showing now | Picker, the current location | `background: var(--river-soft)`, no border |
| Official | Hazard cards posted by a club safety role (04 4.2) | plain, with the club name after: "Official. Posted by Putney Rowing Club" |
| Junior | Club rosters and board rows (06) | plain |
| Checked at the dock, Putney Rowing Club member | Report rows (04 3.3) | plain |
| New | Unread notifications | `font-weight: 700`, no border |

A verified location carries no badge. Verified is the normal state and stays quiet.

### 11.2 The line in the hero

One line above the verdict for club rules (06 6.6 `#clubLine`) or a limit set (8.4). Renamed `#rowAs` because it serves both.

- `font-size: .9375rem`, `font-weight: 500`, `color: var(--muted)`, `margin: 0 0 .5rem`.
- "Change" is a text button, underlined, in `--river`, not a pill, so the hero still has one loud thing.
- At most two lines at 360 px. Longer club scopes shorten their scope words first ("Masters, 1x" instead of "Masters, 1x without a launch").
- Under the hero's `holds` line: `#notChecked` (6.7) and 06's `#clubNotes` and `#clubAlt` in the same muted style, and the public club status line for everyone, linked to the club page: "Putney Rowing Club: closed to club rowing until 6 PM. High water."

### 11.3 Water status banner

06 7.4's members' banner, `#clubStatus`, above the hero.

- A panel on the page background: `background: var(--st-soft)`, `border-radius: .75rem`, `padding: .75rem 1rem`, and a left band 0.6 rem wide in the state color. For Closed the band carries the Stay off hatch (11.9), so the state never depends on red alone. Restricted uses the caution color. Open uses `--river`, not green: "open" is a coach's note, not a Go.
- Line 1, bold: the state sentence, "Club water closed until 6 PM. High water."
- Line 2, `--muted`: who set it and when, "Set by Alex R., safety officer, 5:52 AM."
- `role="status"` so a change during a visit is announced once.

### 11.4 Outing banner

04's `#outingBanner`, under the tab bar on every screen of that location.

- On the water: `background: var(--surface)`, a 4 px left bar in `--river`, text "On the water since 6:42 AM. Back by 8:00 AM.", buttons "I'm back" (primary) and "Add time".
- Past the back-by time: the bar and text switch to the caution color: "Back by 8:00 AM. You are 12 min past it. We email Jordan at 8:30 AM."
- After contacts were emailed: the Stay off color and hatch on the bar: "Jordan was emailed at 8:30 AM. Tap I'm back to send the all clear."
- The state line ("On the water since ...", "... You are 12 min past it ...", "Jordan was emailed at 8:30 AM ...") has `role="status"`, so each stage change is announced once, in the same words as the screen. A screen reader user with the app open therefore hears when their contacts are about to be emailed, or have been. The banner stays outside the hero's live region (12.3).
- Not sent yet (04 5.6): an extra line in caution color, "Not sent yet. It sends when RoWhether is open and has signal. Until then, nobody will be told if you are late." After a queued "I'm back": "Not sent yet. Open RoWhether when you have signal, or Jordan will be emailed at 8:30 AM."
- Planned (04 5.6): "Planned for 6:40 AM. Back by 8:00 AM. We email Jordan at 8:30 AM if you are not back." with "Cancel" and "Edit".
- For a club row: a quiet "Board" link at the end.

### 11.5 Notes above the hero

Today's `.set-nudge` style (`--river-soft` background, rounded, text plus buttons) is reused for every note in 4.6. Same class, same layout, one at a time.

### 11.6 Lists and rows

The picker, compare, the board, the row log and notification lists are lists, not card grids:

- `<ul>` with rows separated by `border-top: 1px solid var(--line)`, the pattern of `.weeklist` and `.fact` today, inside a surface panel.
- A row that is a link puts the link on the name and stretches it over the row (`.flink.stretch`, as facts do), with separate buttons (star, actions) above it in the stacking order.
- Status rows (board, compare) use the 4 px left bar of `.period`, with the word in the text.
- Distance and times right-aligned on wide screens, on the second line below 30 rem.

### 11.7 Sheets

The picker, Start a row, Rowing as, History and confirm sheets are `<dialog>` elements styled like today's dialogs (`dialog` rules in `app.css`), plus a `.sheet` class: below 36 rem, `width: 100%`, `max-height: calc(100% - 1rem)`, `margin: auto 0 0`, rounded top corners only, safe-area padding at the bottom. Close buttons in the top right and at the bottom. No slide-in animation (reduced motion is respected anyway, 12.5).

### 11.8 Map styling

- Styles: OpenFreeMap `positron` in light mode, `dark` in dark mode (both answered with CORS `*`, verified live 2026-10-17). Positron's layers include `background` `rgb(242,243,240)`, `water` `rgb(194, 200, 202)`, `waterway` and `park`; dark's include `background` `rgb(12,12,12)` and `water` `rgb(27 ,27 ,29)` (read from the style JSON, verified live 2026-10-17).
- At `style.load`, recolor from the CSS tokens (read with `getComputedStyle(document.documentElement)`): `background` to `--bg`; `water` to `--river` mixed 18% into `--bg` in light, 30% in dark; `waterway` lines to `--river` at 60% opacity; `park` and `landcover_wood` to `--line` at low opacity; label text to `--muted` with a halo of `--bg`. Roads stay as the style draws them, muted.
- Theme changes (`prefers-color-scheme` change, or `[data-theme]`) call `map.setStyle()` with the other style and recolor again.
- Labels use the style's own Noto Sans glyphs from `tiles.openfreemap.org/fonts/` (positron uses Noto Sans Regular, Bold and Italic; dark uses Regular). Serving Archivo glyphs would need a glyph build step and is not worth it.
- Markers: a GeoJSON source and a circle layer. Radius 6 px, `--river` fill, 2 px `--surface` stroke. Your places radius 7 px. The current or selected location radius 9 px with a 3 px `--river-soft` ring. No status colors on markers: the map does not know every place's verdict.
- Labels for markers from `shortName`, shown from zoom 9.
- Attribution with MapLibre's compact attribution control, text from 02: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap".
- Reduced motion: `jumpTo()`, never `flyTo()` or `easeTo()`, and `fadeDuration: 0`.

### 11.9 Hatch for Stay off

Today the hatch is written out twice, in `.seg.b2` (6 px stripes) and `.lk-b2` (4 px). Define it once:

```css
:root{ --hatch: repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--surface) 55%, transparent) 6px 8px); }
.seg.b2{ background: var(--hatch), var(--off); }
```

Used on: Week bars and legend (as today), compare bars, board rows that are overdue, the outing banner after contacts were emailed, the water status band when closed, and any Stay off cell in "Which crews can go". `.lk-b2` keeps its finer 4 px spacing as a second token, `--hatch-fine`, because legend keys are small.

### 11.10 New tokens and classes

No new colors. New custom properties: `--hatch`, `--hatch-fine`. New classes: `.title-row`, `.loc-btn`, `.loc-chev`, `.acct`, `.acct-dot`, `.badges`, `.badge`, `.sheet`, `.rowas`, `.wstatus`, `.outing`, `.plist` (picker and compare rows), `.board`, `.at-dock`. Each lives in `src/styles/app.css` next to its relatives; colors only from `tokens.css`.

## 12. Accessibility

### 12.1 Keyboard paths

| Flow | Path |
| --- | --- |
| Change location | Tab to the location name, Enter. Focus moves to "Change location". Tab to the search box and type. Results are plain links, so Tab moves through them (no arrow-key list to learn) and Enter opens one. Escape closes the sheet and returns focus to the location name. |
| Near me | Tab to "Near me", Enter. The browser's own prompt takes focus. Results get a heading "Near you", announced by a polite live region with the count: "6 locations near you." |
| Star a place | Tab to the star after a row, Space. The live region says "Added to your places." |
| Reorder places | "Edit", then "Move up" and "Move down" buttons on each row. Focus stays on the moved row's button. |
| Compare | The Today and Tomorrow buttons are a group with `aria-pressed`. Each row is one link with a full text name (12.3). |
| Map | Optional. "Show map" becomes "Hide map" and keeps focus; the map is the next stop in the tab order. With the map focused, arrow keys pan and plus and minus zoom (MapLibre's keyboard handler, enabled with `keyboard: true`; behavior in 6.x unverified). Tab leaves the map to the list, which holds the same locations. |
| Add a location | Each step's first field takes focus on arrival. The map steps use the fixed crosshair, so placing the dock or a course point is "pan with arrows, then press Put the dock here or Add point here". Typed coordinates and typed degrees work without the map at all. |
| Report conditions | As today: radios in fieldsets, the "More" disclosure, Send. |
| Start a row, I'm back | The sheet's fields in order, "Start" last. The banner's "I'm back" is the first focusable element after the tab bar. |
| Board | Each row's actions are buttons in reading order. "More" opens a sheet whose first item takes focus. |
| Status page `/o/<token>` (04 6.3) | For a contact who is not a user, often worried and on any phone: one `h1` ("Alex is not back yet"), then the details as plain paragraphs and a list, in the order a caller needs them: where, boat, when, phone. The rower's phone is a real `tel:` link and "Open in maps" a real link. Tab order is the phone link, the map link, then "I reached Alex, they are safe", which is a button at least 3rem tall. "Overdue" is words and a hatched bar, never color alone. The page sets `lang`, works at 200% zoom, and works with JavaScript off, because it is rendered by the Worker. |
| Account and club tabs | The same tab links as the location's, with `aria-current="page"`. |
| Notification settings | Native switches (`<input type="checkbox" role="switch">`), selects for times. |

### 12.2 Focus management

- Every sheet and dialog focuses its heading on open (`tabindex="-1"`, as `#setTitle` does) and returns focus to the control that opened it on close. Native `<dialog>` restores focus in current browsers, but the app does it explicitly to be sure across Safari versions (restoring behavior in older Safari unverified).
- Changing location without a reload: focus moves to the `h1`, and a polite live region (`#pageAnnounce`, visually hidden) says "Showing Lake Quinsigamond." Scroll goes to the top.
- Changing tabs keeps today's behavior: the view's visually hidden heading leads, scroll to the top, Now restores its scroll position.
- The add flow's steps: focus to the step's heading on each hash change.
- Errors: focus to the first field in error, with `role="alert"` messages tied by `aria-describedby`.

### 12.3 Screen reader text

- The hero is `aria-live="polite"` today, so a new verdict after a refresh is read. Keep it, and do not put the outing banner or notes inside it. The outing banner's state line has its own `role="status"` (11.4), so its stage changes are read once and never twice.
- Compare rows have one accessible name each: "Lake Quinsigamond. Go now. Best 90 minutes today: 7 to 8:30 AM." The bar has `aria-hidden="true"` because the text already says it.
- The board's state words are in the row text (06 20), and overdue changes are announced once (5.9).
- The account button's name includes unread notifications (4.3).
- Badges are plain text, read as part of the name.
- Map markers are not focusable; the list is the equivalent (12.4).
- Times read naturally: "6:41 AM" is read correctly by VoiceOver and TalkBack (unverified for the 24-hour "06:41" form; check on devices).

### 12.4 Map alternative

Everything the map does has a list or form equivalent: the picker list under the map shows the same locations in view; the add flow accepts typed coordinates and degrees; hazards always list as cards with distance and relation ("1.2 km upstream"). The map region is labeled "Map of locations. The list below has the same locations." When the map cannot start (no WebGL2), the list stays and says why (5.2.5).

### 12.5 Motion

No new animation anywhere. Map movement uses `jumpTo()` under `prefers-reduced-motion: reduce` and short `easeTo()` otherwise. No auto-scrolling except to the top on a page change. The existing rule in `app.css` stays.

### 12.6 Small screens and zoom

- Every new screen at 360 px: no horizontal page scroll; wide tables scroll inside their panel (`.hours-wrap`); the header actions stay on one row (4.3).
- Text zoom to 200% keeps every control reachable: rows wrap, sheets scroll.
- Targets at least 40 px tall (today's `button` `min-height: 2.5rem`); 44 px on the kiosk (06).

### 12.7 Color

Status colors always with a word. Stay off with the hatch wherever it is a fill (11.9). Badges and links are not colored by status. In dark mode the tokens already change; map colors follow them (11.8).

## 13. Browser test plan

CLAUDE.md's list stays and runs on every location-page change: 390 px light and 1280 px dark in Chromium and WebKit, clean console, the clock pinned to midday and 9 PM, a Day by day row's full forecast, the install bar on an iPhone user agent and a faked `beforeinstallprompt`, the blocked-sources message, every tab at 360, 390 and 1280 px, the scroll kept when returning to Now, Week rows kept open after a redraw, the Dev label and dock reports with stubbed `/api/info` and `/api/reports`, Share copying the hero text, Plan a row choices kept.

Tools: Playwright contexts with `viewport`, `colorScheme`, `locale`, `timezoneId`, `geolocation` plus `permissions: ['geolocation']`, `context.setGeolocation()`, `context.grantPermissions()` and `context.clearPermissions()`, and `offline` (from docs, https://playwright.dev/docs/emulation). `page.route()` stubs `/locations/*`, `/api/*` and `tiles.openfreemap.org`; nothing calls a live API in CI. A permission state of `denied` is stubbed with `page.addInitScript()` replacing `navigator.permissions.query`.

Added checks, by phase:

Phase 0

- Golden screenshots of Putney at 390 and 1280 px, midday and 9 PM, before and after the refactor: identical (01 8.7).
- The manifest in `dist/` still has `start_url: './'` and `scope: './'`.

Phase 1

- An existing install: seed `putney-rowing-settings-v1` and `putney-rowing-cache-v1`, load `/`. The address becomes `/putney-landing`, the cached hero renders before any request completes, Settings shows the seeded values, and no note shows above the hero.
- First visit to `/` inside the 90-day window (pin the clock): Putney with "Not your water? Pick a location."; "Pick a location" opens the picker. Reload without answering: the note shows again. "Dismiss", then reload: Putney with no note. After the window, with nothing stored: the picker page.
- Picker page at 360 px: no horizontal scroll; typing "char" lists only matching locations with no network request; Enter on a result opens it; the address and `document.title` change; Back returns to the picker.
- Switcher: Enter on the location name opens the sheet with focus on "Change location"; Escape closes it and focus returns to the name.
- Near me with a granted position at Weld Boathouse: "Near you" lists Weld Boathouse first with its distance, then Community Rowing. With a stubbed `denied`: the help line shows and no geolocation call is made. With a timeout: the timeout line.
- Header at 360 px for every curated name: the title takes at most two lines; the actions row is one row with "Updated" and with "Saved" labels.
- A lake location: no River tab; `#river` falls back to Now; the Week River row says the flow is not checked here.
- A tidal location: the Tide tab after Wind (01).
- `timezoneId: 'America/Chicago'` on Putney: the subtitle ends "All times Eastern, 1 hour ahead of you."; every time on screen is still Eastern.
- Unknown slug: the not-found view with the search prefilled.
- `/putney-landing` served from the static file (`dist/putney-landing.html`) with today's title, description and canonical `https://rowhether.com/putney-landing` (01 16.4), with no redirect to a trailing slash.
- Offline (`offline: true`) after one online visit: the picker shows saved places and searches the precached list; opening a location with no saved forecast shows its header and the "No forecast saved" line.
- Share on Putney from a context in New York copies "Putney Landing rowing, ..." with `https://rowhether.com/putney-landing` on production and the dev address on dev.
- The built manifest has `name` and `short_name` "RoWhether" and `id` "/"; the install bar text names the current location.

Phase 2

- Header at 360 px with "Sign in", with "Sam" and an unread dot, and with a long name ("Account"): the account button never wraps under the title.
- Star a location signed out; reload; it is in Your places. Reorder with Move up; the order holds after a reload.
- Compare with three stubbed favorites: the "Best today" line names the right place; Tomorrow switches every row; offline shows "As of" on every row; at 360 px rows wrap without overflow.
- Limit sets: create "Single" with gusts 14, make it the set for Putney; the hero shows "Your Single limits. Change"; a gust of 15 now gives Caution; another location still uses Default.
- Units: `locale: 'en-GB'` on a fresh context shows mph, °C, mm and 24-hour times ("06:41"); a context with `en-GB` seeded with `rowhether-last-v1` and no units key gets the US pin and still shows °F and 6:41 AM. Settings in km/h: enter 20, save, reopen: 20. The cold line in metric reads 20°C.
- `/privacy` online and offline shows the privacy page, not the app.

Phase 3

- Info tab: every section renders from a stubbed record, with empty states for a record with no notes, no traffic and no hazards.
- `#info/hazards` scrolls to the hazards section.
- Report dialog at a lake: the Current row is absent (04 3.1); outside daylight the "At the dock" panel sits under the hero with Report conditions.
- Map: "Show map" loads the map chunk only on tap (assert no `map-*` request before), with `tiles.openfreemap.org` stubbed by a fixture style; the list shows "N locations in this view". With `getContext('webgl2')` stubbed to return null: the no-map message and the list. In a build, the `maplibre-gl-worker-*` file exists and the map renders a fixture tile (checks 10.4's worker fix).
- Add flow with discovery stubbed: each step has its own hash; Back goes back a step; the crosshair "Put the dock here" places the pin by keyboard; dedupe at 80 m blocks; Publish lands on the new page with the community note (01 16.5).
- Quick look `/at/42.273,-71.755`: no River, Tide or Info tab; the subtitle says it is a point; "Add this location" is present signed in.
- Start a row signed in: the banner shows on Now and on `#wind`; offline start shows the not-sent line; I'm back clears it.
- Outing banner announcements: with the clock moved past the back-by time and then past the contact time, the state line changes twice and `getByRole('status')` reads each new text once (a screen reader pass on iOS VoiceOver and Android TalkBack is on the manual list).
- `/o/<token>` with stubbed status: one `h1`, headings in order, the phone number is a `tel:` link, the safe button is at least 3rem tall, "overdue" is carried by words, with JavaScript disabled the page still reads and the safe form posts, and with Turnstile blocked the mark is still accepted (04 8.3).

Phase 4

- After sunset, the "Get this every evening at 8 PM" line is present; Not now hides it after a reload.
- Account, Notifications at 360 px: every control reachable by keyboard; on an iPhone user agent outside standalone, the Home Screen line shows.

Phase 5

- Hero club line for a stubbed member at 360 px: at most two lines; "Change" opens Rowing as with focus on its heading.
- Water status banner Closed: the band has the hatch; `role="status"` announces once.
- Board at 360 px: rows wrap with no horizontal scroll; an overdue row is announced once; "More" opens the sheet; offline shows "Not updated since".
- Junior view: "Your guardian can see this." on club messages, club outings and shared rows.

Every phase

- The budget script passes (10.6).
- Console clean on every screen above.

## 14. Privacy-friendly product metrics

03's Decision is no analytics: no script, no cookies for tracking, no IP addresses in D1. The owner still needs to know whether the app helps. This section answers from data that exists anyway, plus, as a Decision, one aggregate counter with no identifiers.

### 14.1 What the owner wants to know

1. Are people using it, and is that growing?
2. Which locations matter, and which are missing?
3. Is the forecast right at the dock?
4. Is anything broken?
5. Do notifications, reports and the board get used?
6. Is the app fast enough on a phone?

### 14.2 Tier 0: counts from data that already exists

No new collection. Read in Admin, Metrics (14.5) or with `wrangler d1 execute`.

| Question | Measure | From |
| --- | --- | --- |
| Use and growth | Accounts created per week; signed-in devices active per week (`auth_sessions.last_seen_at` counted by week) | 03's tables, counts only |
| Which locations matter | Favorites per location; alert prefs per location; reports and outings per location per week | 03, 04, 05 tables |
| Missing locations | Location suggestions filed through the suggestion form, and locations added per week (phase 3) | GitHub issues with the `from app` label; 01's `locations.created_at` |
| Forecast right at the dock | Share of water state, fog and wind reports that agree with the forecast for that hour, per location per month | 04 3.7's tuning export (`fc` on each report) |
| Broken things | Worker errors by route; binding health (offline and retired gauges) | Workers observability (03 12.1); 01 15.7's daily health check |
| Notifications | Sent, skipped by reason, opened, unsubscribed, push failures | 05's `GET /api/admin/notify/stats` |
| Board use | Club outings per club per week; overdue escalations and their stage | 06's tables |
| Speed | Lab numbers from CI (10.2, 10.6), per build | the budget script and the Playwright timing |

### 14.3 Tier 1: an aggregate open counter

The one thing Tier 0 cannot see is how many people open the app at each location without an account, because the forecast comes straight from Open-Meteo and the other sources, and static files never run Worker code ("Requests to static assets are free and unlimited", served without invoking the Worker, from docs, https://developers.cloudflare.com/workers/platform/pricing/).

The app already calls `GET /api/info` once at every start (`loadInfo()` in `src/reports.js`). The proposal adds the location to that call and counts it:

- Request: `GET /api/info?loc=putney-landing&k=return&m=standalone`. `k` is `first` when no `rowhether-last-v1` existed before this start, else `return`. It approximates new devices: a browser that clears its storage, or a visitor who has not yet answered the 90-day note (5.1), counts as first again. `m` is `standalone` or `browser` (`isStandalone()` in `src/install.js`). Nothing else.
- The Worker writes one Workers Analytics Engine data point: `index1` = the slug (or `none` for the picker), `blobs` = `[env, k, m]`, `doubles` = `[1]`. No IP, no user agent, no account id, no session, no country. Analytics Engine adds its own timestamp.
- Analytics Engine facts (from docs, https://developers.cloudflare.com/analytics/analytics-engine/pricing/ and /limits/): Workers Free includes 100,000 data points written a day; Workers Paid includes 10 million a month; billing "is not active yet"; data is kept for three months; up to 20 blobs, 20 doubles and one index per point. Sampling applies at high volume and is keyed on the index, and queries use `SUM(_sample_interval)` to count (from docs, https://developers.cloudflare.com/analytics/analytics-engine/sql-api/).
- Reading: the Admin Metrics tab queries through the Analytics SQL Workers binding (`"analytics": { "binding": "ANALYTICS_SQL" }`, which needs Wrangler 4.145.0 or later; the repo pins 4.149.0) or with the SQL API and an Account Analytics Read token from the owner's machine (from docs, https://developers.cloudflare.com/analytics/sql-api/workers-binding/).
- It gives: opens per location per day, new devices per day, the share of opens from the installed app. It cannot follow a person, a device or a session, and it cannot say who opened what.
- A static host with no `/api` sends nothing, as today.
- The privacy notice (03 13.3), and from phase 1 the short `/privacy` page (5.15), says: "We count how many times the app is opened at each location each day, and whether it was opened from the home screen. The count has no address, device or account attached, and it is deleted after three months."

Decision: Count app opens per location per day with Workers Analytics Engine, from the existing `/api/info` call, with no identifiers. Recommended: it is the only way to see whether people use locations without an account, it adds no request and no script, and it fits 03's third alternative ("aggregate counters in the Worker").
- Alternative: keep 03's Decision as written and use only Tier 0 (no view of signed-out use).
- Alternative: Cloudflare Web Analytics (cookieless, but a third-party beacon script, which the hard constraint rules out without another exception, as 03 notes).

### 14.4 What is never collected

Search text, Near me positions, which tabs people open, scroll or tap events, device fingerprints, IP addresses, referrers, and anything joined to an account for metrics. Search misses are learned from the "Suggest a location" submissions, which people send on purpose.

### 14.5 The Metrics tab

Admin, Metrics (phase 1 if the Decision is accepted, else phase 2 with Tier 0 only):

- "Last 7 days": opens, new devices, share from the installed app, as numbers with the previous week beside them.
- Opens per location, top 20, with a sparkline per row (the existing `sparkline()` in `src/render/parts.js`).
- From phase 3: forecast agreement at the dock per location ("Water state matched the forecast in 71% of 140 reports in September.").
- Notification stats from 05.
- The budget history: the main bundle gzip size of each production build, from CI artifacts.

## 15. Code changes by phase

| Phase | Files | Change |
| --- | --- | --- |
| 0 | `src/units.js` (new), `src/logic.js`, `src/format.js`, `src/render/*`, `src/render/detail/*` | Every unit string through `m.u`, US only; `zoneFormat(tz, { clock })` with 12-hour only. Golden tests prove identical text (01 8.7). |
| 0 | `src/render/index.js` | `performance.mark('hero')` after `renderHero()` in `render()` for the timing baseline (10.2, 08 P0.2). |
| 0 | `scripts/budget.mjs` (new), `budget.json` (new), CI workflow | The budget checks (10.6) with today's sizes plus 1 KB. |
| 1 | `src/route.js` | Path plus hash routes, `parseRoute(location)`, `navigate()`, `data-nav` links, location change sequence (4.2). |
| 1 | `index.html` | Header markup (4.3), `#picker` dialog shell, `#pageAnnounce`, `#outingBanner` slot under the tabs, install copy (6.4), absolute asset paths (01 7.3), app name meta. |
| 1 | `src/render/header.js` (new; `renderHeader()` moves here from `hero.js`) | Name, subtitle template (6.1), badges, "Saved" label, install bar sentence, `document.title`. |
| 1 | `src/picker.js` (new, lazy), `src/copy/picker.js` (new) | Picker page and sheet: search, Near me, recent, all locations (5.1, 5.2). |
| 1 | `src/share.js` | Text, title and URL templates (6.2). |
| 1 | `src/settings.js`, `index.html` `#settings` | Fields from the location (01 11.6); the reminder sentence built from the location's limit keys (6.7). |
| 1 | `src/storage.js` | `rowhether-cache-index-v1` and the 10-location cap (9.2). |
| 1 | `vite.config.js` | Manifest name, short name, description, `id: '/'` (6.3); Workbox `globIgnores` and `navigateFallbackDenylist` (9.6). |
| 1 | `src/styles/app.css` | `.title-row`, `.loc-btn`, `.badge`, `.sheet`, `.plist`, `--hatch` (11). |
| 1 | `src/render/detail/index.js` | `when(loc)` filtering (01 9.7); Info view registered behind its `when`. |
| 1 | `worker/index.js` | `GET /api/info` reads `loc`, `k`, `m` and writes one Analytics Engine point (14.3, if accepted); `wrangler.jsonc` gains the `analytics_engine_datasets` binding. |
| 1 | `src/admin/` (new, lazy) | Metrics tab only (14.5). |
| 2 | `src/compare.js` (new, in the picker chunk) | Compare (5.3). |
| 2 | `src/sets.js` (new) | Limit sets, the `#rowAs` line, Rowing as sheet (8.4). |
| 2 | `src/settings.js` | Sets row, units and clock fieldset, sync line (5.13). |
| 2 | `src/units.js`, `src/format.js`, `src/storage.js` | UK and metric systems, wind units, 24-hour clock (7); `pinUnits()` for existing users (7.2). |
| 1 | `public/` or Vite inputs | `privacy.html`, short (5.15, 14.3). |
| 2 | `public/` or Vite inputs | The full `privacy.html`, `terms.html`, `about.html` (5.15). |
| 3 | `src/render/detail/info.js` (new) | Info tab (5.5). |
| 3 | `src/map.js` (new, lazy), `package.json` | MapLibre pinned exactly, `setWorkerUrl()` fix, styling (10.4, 11.8). |
| 3 | `src/add/` (new, lazy) | Add a location (5.6). |
| 3 | `src/route.js`, `src/picker.js` | Quick look `/at/` (5.4); picker map; API search. |
| 3 | `src/reports.js`, `index.html` | `#dockReports` placement outside daylight ("At the dock"), Start a row button, outing banner (5.10, 5.11). |
| 3 | `src/render/chart.js` | `marks()` for report ticks (5.10). |
| 4 | `src/account.js` | Notifications tab (5.12); entry lines on Now and Week. |
| 5 | `src/club/` (06), `src/sets.js` | Club pages and board layout (5.8, 5.9); the shared `#rowAs` line with 06's club line. |

## 16. Requests to other documents

| To | Request | Why |
| --- | --- | --- |
| 01 | Emit per-location shells as `dist/<slug>.html`, not `dist/<slug>/index.html` (7.2), and drop the `*/index.html` glob note (7.3). | `auto-trailing-slash` would redirect `/putney-landing` to `/putney-landing/` (4.2). |
| 01 | Table 11.2: the cold line in Celsius is "air plus water under 20°C", not 38°C. | The sum of two temperatures converts with the offset twice (7.4). |
| 01 | 8.6: keep up to 10 cached locations with favorites protected, and add `rowhether-cache-index-v1`. | Compare offline (9.2). |
| 01 | Row 27 (fog "miles" units) moves from phase 7 to phase 2. | Units choice ships in phase 2 (7.9), if accepted. |
| 02 | River tab without a flow binding: hidden (01 9.7), with the "not checked" sentence in Week's River row, not a River tab with a message. | One place for the message (6.7). |
| 02 | Record the measured map sizes and the worker URL fix in the map Decision (10.4). | 02 lists bundle sizes as unverified. |
| 03 | `users.units` CHECK gains `'uk'`. `src/settings-keys.js` gains global keys `windUnit`, `clock`, `set1` to `set6`, and per-location `activeSet`. | 7.1, 8.4. |
| 03 | 12.3: note the Tier 1 open counter if the owner accepts it, and its sentence for the privacy notice. | 14.3. |
| 03 | 17.1: the account button sits at the right of the title row, not in the actions row; Refresh stays a text button. | Measured widths (4.3). |
| 04 | 3.2: outside daylight, `#dockReports` becomes the "At the dock" panel under the hero, not buttons inside the hero. | Keeps the hero to the verdict and Share (5.10). |
| 05 | 7.1: the after-sunset entry line sits under the "At the dock" panel, as a text link with Not now. | 5.12. |
| 06 | 6.6: `#clubLine` becomes `#rowAs`, shared with personal limit sets; the Rowing as sheet gains the Limits choice. | One line, one sheet (8.4, 11.2). |
| 06 | 6.7: "Which crews can go" becomes one panel per crew type below 46 rem. | No sideways scroll at 360 px (5.8). |
| 08 | Canonical keys: `rowhether-units-v1`, `rowhether-sets-v1`, `rowhether-cache-index-v1`, `rowhether-info-seen-v1`, `rowhether-pickhint-v1` (the "Not your water?" dismissal), `rowhether-notify-nudge-v1` (05). Chunk names `picker`, `map`, `add`, `account`, `club`, `admin`. The budget table (10.2). The `analytics_engine_datasets` and `analytics` bindings (14.3). | |
| CLAUDE.md | The navigation sentence (4.5); the test list additions (13); "Saved" header label; the app name. Owner approval needed. | |

## 17. Open questions and decisions

Decisions, recommendation first:

Decision: Keep the tab bar for the parts of one location; the location name opens the switcher and the account button opens Account; other pages have their own text tabs (4.5).
- Alternative: Places, Club and Account tabs in the bar.
- Alternative: a bottom navigation bar.
- Alternative: a menu button.

Decision: The location's information page is the last tab, `#info` (4.4).
- Alternative: a path route `/<slug>/info`.
- Alternative: a sheet opened from the subtitle.

Decision: Offer a quick look at any point from phase 3, `/at/<lat>,<lon>`, labeled as not a saved location (5.4).
- Alternative: ship it in phase 1.
- Alternative: no quick look.

Decision: Name the app RoWhether from phase 1, add manifest `id: '/'`, keep `start_url` and `scope` (6.3).
- Alternative: keep "Putney Row" until phase 3.
- Alternative: short name "Row".

Decision: Units Auto follows the viewer's locale; browsers that used the app before phase 2 are pinned to US units and the 12-hour clock (7.2).
- Alternative: follow the location's country.
- Alternative: US for everyone until changed.

Decision: Plain JavaScript message modules and `Intl` for translations later, no library (7.8).
- Alternative: FormatJS.
- Alternative: i18next.

Decision: Ship the units and clock choice in phase 2 (7.9).
- Alternative: phase 7 with non-US locations.

Decision: Limit sets hold only boat limits, apply at every location, and the set in use is chosen per location (8.4).
- Alternative: sets per location.
- Alternative: no sets.

Decision: MapLibre GL JS from npm, pinned exactly, lazy and never precached, with OpenFreeMap vector tiles; no map in phases 1 and 2 (10.4).
- Alternative: Leaflet 1.9.4 with OSM raster tiles.
- Alternative: no map at all.

Decision: Privacy, terms and about are static HTML pages built by Vite (5.15).
- Alternative: routes inside the app.
- Alternative: hosted elsewhere.

Decision: Count app opens per location per day with Workers Analytics Engine from the existing `/api/info` call, with no identifiers (14.3).
- Alternative: Tier 0 only, as 03's Decision reads.
- Alternative: Cloudflare Web Analytics.

Open questions:

- Does iOS use the manifest `start_url` or the current page when a location page such as `/putney-landing` is added to the Home Screen? Either opens the right place (the root opens the last location), but it decides which address the installed app starts on (unverified).
- Does Workbox's precache route serve a precached `privacy.html` for a `/privacy` navigation? Check in phase 2 (4.2).
- MapLibre with `setWorkerUrl()` renders in Safari and Chrome on phones? The build is verified; rendering is not (10.4).
- MapLibre 6.x keyboard handling on the map canvas (12.1).
- How VoiceOver and TalkBack read 24-hour times such as "06:41" (12.3).
- UK and Nordic unit conventions for the defaults (7.1, 7.2): confirm with British and Nordic clubs before phase 7.
- Today's time to the first hero from cache at 4 times CPU slowdown (10.2): measure in phase 0 to set the baseline.
- Settled by 08 K1: a curated monthly typical value feeds the cold check, labeled as typical; with none and no reading, the check stays off (02). 6.7's copy covers both cases.
- Should a rower who never dismisses the "Not your water?" note, and never picks a location, see the picker when the 90-day window ends, even though they have used Putney for weeks? This plan says yes, because nothing was stored to say Putney is theirs; the owner may prefer to store Putney as the last location on the first visit instead.
