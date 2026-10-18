# Locations

Today the app knows one place: the Putney Rowing Club docks at Putney Landing, VT. The place is spread through the code as constants (`LOC`, `GAUGE_FLOW`, `NWS_GAUGE`), copy ("North Walpole", "Keene", "VT", "NH"), formatters fixed to `America/New_York`, and storage keys named `putney-rowing-*`.

This document turns "the place" into data. It defines:

- The location record and the waterway it belongs to, with every field and the D1 tables that hold them.
- Where source bindings live (`location_sources`). The adapters themselves are in 02-data-sources.md.
- Putney Landing as the first record, with the exact values the app uses today.
- How the curated list is stored and served in phase 1, and how people add, edit, verify, archive and merge locations in phase 3.
- Every place in the code that assumes Putney, and how each changes, including the new `buildModel` signature.
- How the call logic and water state work on rivers, lakes, reservoirs, tidal water, canals and harbors.
- Course geometry, bank names, the compass, per-location thresholds, and the edge cases.

Out of scope here: accounts and roles (03-accounts-and-privacy.md), reports and hazards themselves (04-reports-and-check-ins.md), alerts (05-notifications.md), clubs and club rules (06-clubs.md), the picker, map and units UI (07-product-and-ux.md), the canonical schema and migration numbering (08-architecture.md).

Facts are marked "verified live 2026-10-17", "from docs (URL)" or "unverified". Numbers the app uses today are quoted from the repo and marked with the file.

## Contents

1. Terms
2. The location record
3. Waterways
4. Source bindings
5. D1 schema
6. Putney Landing, the first record
7. Phase 1: the curated list
8. Generalizing the logic (phase 0)
9. Water types
10. Course geometry
11. Per-location settings and thresholds
12. Adding a location (phase 3)
13. Edits, revisions, claims, verification, archiving and merging
14. API
15. Edge cases
16. Tests
17. Open questions and decisions

## 1. Terms

| Term | Meaning |
| --- | --- |
| location | A launch site: a dock, boathouse, landing or beach. The thing a forecast is for. Has one dock point, one time zone, one course. |
| waterway | A named body of water or river reach that several locations share, for example "Connecticut River, Bellows Falls dam to Vernon dam". Holds what is true for all its locations: gauges, hazards, traffic pattern. |
| binding | One row in `location_sources`: "for role X, use adapter Y with site id Z". Belongs to a location or to a waterway. |
| role | What a binding provides: alerts, observations, flow, water temperature, tide and so on. |
| adapter | Code that fetches and parses one kind of source. Defined in 02-data-sources.md (for example `usgs-ogc`, `nws-alerts`, `nwps`). |
| course | Where people row from the location: one upstream heading (as now) or a polyline of points with segments. |
| segment | A straight-enough part of a polyline course, with its own heading and length. |
| banks | The names of the two sides of the course, left and right when facing upstream (or facing out, on still water). |
| steward club | The one club allowed to edit and verify a location after a claim (phase 5). |
| resolved location | The client-side object built from a record plus its waterway and the viewer's overrides (`loc` in code). The model carries it as `m.loc`. |

## 2. The location record

### 2.1 Fields

JSON names (camelCase) are what the static files and the API use. D1 columns are snake_case. Conversion happens in one place, `worker/locations.js toApi()` and `fromApi()`, the same pattern as `shape()` in `worker/reports.js`.

| Field (JSON) | D1 column | Type | Required | Rules | Putney value |
| --- | --- | --- | --- | --- | --- |
| `id` | `id` | text | yes | `crypto.randomUUID()`. Never changes, even when the slug does. | `19fe7acb-de20-48c9-b25d-20d5e99d113a` |
| `slug` | `slug` | text | yes | Lowercase a to z, 0 to 9, hyphens. 3 to 48 chars. No leading, trailing or double hyphen. Not a reserved word. Unique across `locations.slug` and `location_aliases.slug`. | `putney-landing` |
| `name` | `name` | text | yes | 3 to 60 chars, sentence case or proper noun. | `Putney Landing` |
| `shortName` | `short_name` | text | yes | 2 to 16 chars. Used in tabs, chips, share text, notification titles. | `Putney` |
| `subtitle` | `subtitle` | text | no | Up to 120 chars. The line under the title. | `Connecticut River at the Putney Rowing Club docks.` |
| `locality` | `locality` | text | no | Up to 60 chars. Town and region for lists. | `Putney, VT` |
| `waterway` | `waterway_id` | text | no | A `waterways.id`. Null only for drafts. | `connecticut-river-vernon-pool` |
| `lat`, `lon` | `lat`, `lon` | real | yes | Dock point. Stored rounded to 5 decimals (about 1 m). Lat -90 to 90, lon -180 up to but not including 180. | `42.9607`, `-72.5219` |
| `tz` | `tz` | text | yes | IANA zone. Valid when `new Intl.DateTimeFormat('en-US', { timeZone })` does not throw (it throws `RangeError` otherwise, verified live 2026-10-17 in Node 22). | `America/New_York` |
| `tzLabel` | `tz_label` | text | no | Up to 24 chars. Overrides the generated zone name in "All times ...". | `Eastern` |
| `country` | `country` | text | yes | ISO 3166-1 alpha-2, uppercase. | `US` |
| `region` | `region` | text | no | ISO 3166-2 subdivision, 4 to 6 chars. The shore the dock is on. | `US-VT` |
| `waterType` | `water_type` | text | yes | `river`, `lake`, `reservoir`, `tidal` (tidal river or estuary), `canal`, `harbor`. | `river` |
| `course` | `course` | JSON | yes | See section 10. | `{ "kind": "heading", "heading": 15, ... }` |
| `banks` | `banks` | JSON | no | `{ word, left: { short, name }, right: { short, name } }`. Null means generated from the heading (section 10.4). | VT and NH |
| `thresholds` | `thresholds` | JSON | yes | The location's default limits (section 11). | wind 10/15, gusts 18/25 and so on |
| `aqiScale` | `aqi_scale` | text | yes | `us` (US AQI) or `eu` (European AQI). Default by country. | `us` |
| `flow` | `flow` | JSON | no | How the flow or stage reading is used: measure, unit, wind-against-current multipliers, stats, staleness. Null when there is no flow binding. | see section 6 |
| `water` | `water` | JSON | no | Water state model: mode, crosswind weight, fetch. Null means the defaults for the water type. | `{ "mode": "river", "cross": 0.4 }` |
| `fog` | `fog` | JSON | no | Overrides of `FOG` in `src/config.js`. Null means the global values. | null |
| `waterTemp` | `water_temp` | JSON | no | Fallback when no live reading: `none` or `monthly` (12 values, °F). Max reading age (null in phase 0, 72 h from phase 1). | `{ "fallback": "none", "maxAgeH": null }` |
| `tide` | `tide` | JSON | no | Tidal water only (section 9.4). | null |
| `daylight` | `daylight` | JSON | no | High-latitude rowing window `{ dayWindow: [5, 22] }` (section 15.4). Null means 5 to 22. | null |
| `emergency` | `emergency` | JSON | no | Emergency information for the Safety section (06 8.7), up to 6,000 chars. Column created in phase 3 (08 K13). | null |
| `copy` | `copy` | JSON | no | Curated text overrides for facts and the River view (section 6.3). Curated locations only. | see section 6 |
| `launchNotes` | `launch_notes` | text | no | Plain text, up to 1,000 chars, no links. Parking, dock type, shallows, local rules. | null |
| `status` | `status` | text | yes | `draft`, `published`, `verified`, `archived` (2.3). | `verified` |
| `revision` | `revision` | integer | yes | Starts at 1, plus 1 on every applied change. Used for edit conflicts. | 1 |
| `stewardClub` | `steward_club_id` | text | no | A `clubs.id` (06-clubs.md). Phase 5, added by `0010_club_links.sql` (08 K12). | null until claimed |
| `createdBy` | `created_by` | text | no | `users.id`. Null for curated and imported records. | null |
| `verifiedBy` | `verified_by` | text | no | `users.id` of whoever verified. | null until the owner has an account |
| `verifiedVia` | `verified_via` | text | no | `owner`, `moderator`, `club`. | `owner` |
| `verifiedAt` | `verified_at` | integer | no | ms since epoch. | set at seed |
| `mergedInto` | `merged_into` | text | no | `locations.id` of the survivor after a merge. | null |
| `archivedReason` | `archived_reason` | text | no | Up to 300 chars. | null |
| `createdAt`, `updatedAt`, `archivedAt` | same, snake_case | integer | created and updated yes | ms since epoch, as in `migrations/0001_reports.sql`. | seed time |
| (none) | `search` | text | yes | Folded lowercase name, short name, locality and waterway name, for search. Maintained by the Worker. | `putney landing putney putney vt connecticut river` |
| `sources` | rows in `location_sources` | array | no | Bindings (section 4). Inlined in API responses and static files. | 5 bindings |

Fields are in phase 0 as a file (no D1), phase 1 as the curated static list, phase 3 in D1. `stewardClub` arrives in phase 5. `aqiScale: "eu"`, metric display and non-US adapters arrive in phase 7.

### 2.2 Slug rules

- Pattern: `^[a-z0-9]+(-[a-z0-9]+)*$`, 3 to 48 chars.
- Reserved, refused: `api, add, admin, mod, account, club, assets, about, privacy, terms, help, settings, login, logout, static, sw, manifest, index` (`index` because shells are `dist/<slug>.html`, 08 K25). Also refused: anything that matches a built file or folder at the top of `dist/` (`locations`, `icon-192`, `favicon`, `workbox-*`, `registerSW`), checked at build time in phase 1 and in the Worker in phase 3.
- Generated from the name: NFKD, strip accents, lowercase, every run of other characters becomes one hyphen, trim hyphens, cut to 48 at a hyphen.
- On a clash: add the region suffix (`riverside-park-ct`), then `-2`, `-3`.
- Changing a slug is a moderator action. The old slug goes into `location_aliases` and keeps working forever.
- Two places with the same town name stay apart by slug: `putney-landing` (VT) and `putney-embankment` (the Thames in London). Search for "Putney" returns both with their locality.

### 2.3 Status

| Status | Who sees it | In near and search | Page note |
| --- | --- | --- | --- |
| `draft` | Creator and moderators | No | "Draft. Only you can see this." |
| `published` | Everyone | Yes | "Community added. Not yet checked by a club or moderator." |
| `verified` | Everyone | Yes | None |
| `archived` | Everyone with the link | No | "This location was archived on Oct 17, 2026." plus the reason, and a link to the survivor if merged. A "Show the forecast anyway" link renders it. |

Transitions:

| From | To | Who | When |
| --- | --- | --- | --- |
| (new) | `draft` | Signed-in user | Save in the add flow. |
| `draft` | `published` | Creator | Submit passes validation and the dedupe check. |
| `draft` | (deleted) | Creator, or a cron after 30 days untouched | Hard delete. Drafts have no history worth keeping. |
| `published` | `verified` | Moderator; steward club admin (phase 5) | After the checklist in 13.5. |
| `published`, `verified` | `archived` | Moderator; steward for its location; creator only for `published` with no other activity (no favorites by others, no reports in 30 days) | With a reason. |
| `archived` | `published` | Moderator | Restore. Returns to `published` even if it was verified, so someone checks it again. |

## 3. Waterways

### 3.1 What lives at the waterway level

A waterway holds what is the same for every launch site on it.

- Gauges. Flow, flow forecast, water temperature and level bindings can belong to the waterway. Every location on it inherits them unless it binds its own for that role (4.3). Putney's North Walpole gauge and the WLPN3 forecast are waterway bindings, so a second location on the same pool gets them with no work.
- Hazards. 04-reports-and-check-ins.md stores `hazards.waterway_id` and a point. A location shows hazards on its waterway within 10 km of its dock.
- Traffic pattern. One JSON object (3.3) shown on each location's page.
- Reports from nearby locations. 04 shows recent reports from other locations on the same waterway: fog and debris reports within 15 km, water state reports within 2 km (water state is local, fog is not). The waterway API returns member locations with distance and relation so 04 can label them "Upstream at Brattleboro".
- Name and reach for copy: "Connecticut River" in descriptions, "the river" in water state text.

Not shared: thresholds, course, banks, dock point, time zone, water temperature fallback, launch notes. Two docks on one pool can face different reaches and have different rules.

### 3.2 Waterway record

| Field (JSON) | D1 column | Type | Rules | Putney's waterway |
| --- | --- | --- | --- | --- |
| `id` | `id` | text | Slug rules, 3 to 64 chars. | `connecticut-river-vernon-pool` |
| `name` | `name` | text | 2 to 80 chars. The name people use. | `Connecticut River` |
| `reach` | `reach` | text | Up to 120 chars. Where this part starts and ends. | `Bellows Falls dam to Vernon dam` (unverified; confirm the pool limits) |
| `kind` | `kind` | text | Same values as `waterType`. | `river` |
| `country` | `country` | text | ISO alpha-2. | `US` |
| `regions` | `regions` | JSON array | ISO 3166-2 codes it touches. | `["US-VT", "US-NH"]` |
| `geometry` | `geometry` | JSON | Optional simplified centerline, points ordered downstream to upstream, at most 500 points. For lakes, an outline is not stored; see 9.3. | null in phase 1 |
| `bbox` | `min_lat`, `min_lon`, `max_lat`, `max_lon` | real | Computed from geometry and member docks, for near queries. | from member docks |
| `traffic` | `traffic` | JSON | 3.3. | null (unknown, ask the club) |
| `notes` | `notes` | text | Up to 1,000 chars. | null |
| `mergedInto` | `merged_into` | text | Survivor after a merge. | null |
| `createdBy`, `createdAt`, `updatedAt` | same | | | |

Waterway ids are slugs but live in their own namespace. They never appear in a top-level URL.

### 3.3 Traffic pattern

```json
{
  "rule": "keep_right",
  "text": "Keep to the right bank in your direction of travel. Turn at the railroad bridge.",
  "source": "club",
  "updatedAt": 1792224000000
}
```

`rule` is `keep_right`, `keep_left` or `custom`. `text` is up to 400 chars, plain text. `source` is `club`, `authority` or `community`. Shown on each member location's page as "Traffic pattern" (placement in 07-product-and-ux.md). Edited by moderators and steward clubs of member locations.

### 3.4 How a location joins a waterway

1. On pin drop in the add flow (section 12), the client calls `GET /api/waterways?near=lat,lon&radius_km=2`. The Worker returns waterways whose bbox, grown by 2 km, contains the point, sorted by distance from the point to the geometry, or to the nearest member dock when there is no geometry.
2. Discovery (02-data-sources.md) also returns a river or lake name from the nearest gauge (USGS `monitoring_location_name`, for example "CONNECTICUT RIVER AT NORTH WALPOLE, NH", verified live 2026-10-17) and from map data where 02 provides it.
3. The person picks one card: "Connecticut River, Bellows Falls dam to Vernon dam. 2 locations." or "New waterway". A new one takes a name (prefilled from discovery, title case) and an optional reach.
4. A location can change waterway later with an edit. Moderators can merge two waterways (13.7). A merge moves member locations, hazards and waterway bindings to the survivor in one D1 batch.

HUC codes are not used to decide "same river": North Walpole is in HUC 01080104 and Northfield in 010802010501, on the same main stem (verified live 2026-10-17).

## 4. Source bindings

### 4.1 Roles

| Role | What | Cardinality | Putney today (`src/config.js` key) |
| --- | --- | --- | --- |
| `forecast` | Hourly and daily forecast | Implicit: Open-Meteo at the dock point. A row only to override the model (02). | `SRC.wx` |
| `air_quality` | AQI and PM2.5 | Implicit at the dock point. | `SRC.aq` |
| `models` | Model comparison | Implicit. Model list by region (02). | `SRC.models` |
| `alerts` | Official warnings | 0 or 1 | `SRC.alerts` |
| `obs` | A measured station near the dock, a check on the model | 0 or 1 | `SRC.obs` (KEEN) |
| `flow` | Discharge or stage of the water the course is on: latest, 48 h series, 30 days of daily means | 0 to 1 primary, any fallbacks, any info | `SRC.river`, `SRC.flow`, `SRC.flowDays` (`GAUGE_FLOW`) |
| `flow_forecast` | Forecast flow or stage | 0 or 1 | `SRC.flowFcst` (`NWS_GAUGE`) |
| `water_temp` | Water temperature | 0 to 1 primary, any fallbacks | part of `SRC.river` (`GAUGE_TEMP`) |
| `tide` | Tide height predictions (and observations where offered) | 0 or 1 | none |
| `tide_stream` | Tidal current predictions | 0 or 1 | none |
| `level` | Lake or reservoir surface level | 0 or 1 primary | none |

One flow binding covers the latest value, the 48 h series and the daily means, because they come from the same gauge and parameter. The adapter (02) makes the three requests.

### 4.2 Modes

| Mode | Meaning |
| --- | --- |
| `primary` | Used for the call and the facts. |
| `fallback` | Used when the primary has no reading newer than `flow.staleSwitchH` (default 6 h) or fails. Ordered by `priority`, lowest first. |
| `info` | Shown in the River view as a second line. Never used for the call. Example: Hartford's stage-only gauge next to the upstream flow gauge. |
| `off` | On a location: "the waterway binding for this role does not apply here". Example: a side channel cut off from the main stem gauge. Adapter `none`, ref `-`. |

### 4.3 Resolution

`resolveSources(locationRows, waterwayRows)` in `src/location.js` (shared by the client build and the Worker):

1. For each role, if the location has any rows for it (including `off`), use only the location's rows. Otherwise use the waterway's rows.
2. Drop `off` rows and rows with `status = 'retired'`.
3. Order: `primary`, then `fallback` by `priority`, then `info`.
4. A role with more than one `primary` is invalid (validation error `two_primaries`).
5. The result is keyed for `bindingsFor(loc)` (02; 08 K3) with the same keys the app uses today (`wx`, `alerts`, `obs`, `river`, `flow`, `flowDays`, `flowFcst`, `aq`, `models`) plus `tide`, `tideStream`, `level`. A key with no binding is absent, which is not a failure: no "failed" note under the hero, no River tab.

### 4.4 Binding fields

| Field (JSON) | D1 column | Type | Rules |
| --- | --- | --- | --- |
| `id` | `id` | text | UUID. |
| (owner) | `location_id` or `waterway_id` | text | Exactly one is set. |
| `role` | `role` | text | 4.1. |
| `mode` | `mode` | text | 4.2. Default `primary`. |
| `priority` | `priority` | integer | 0 first. |
| `adapter` | `adapter` | text | Adapter id from 02. |
| `ref` | `ref` | text | Adapter's site id: `USGS-01154500`, `KEEN`, `WLPN3`, `point:42.9607,-72.5219`. Up to 120 chars. For `nws-alerts` it is `point:<lat>,<lon>` in phase 0 and `zones:<code>,<code>` from phase 1: every forecast zone and county code that counts for the location, for example `zones:VTZ015,VTC025,NHZ011,NHC005`. Discovery fills the list (02 step 4) and curation edits it. The app's alerts request and 05's `runAlerts()` both read this one list. |
| `params` | `params` | JSON | Adapter options, for example `{ "parameterCode": "00060" }`. |
| `unit` | `unit` | text | Native unit: `cfs`, `m3s`, `ft`, `m`, `degC`, `degF`, `kn`, `ms`. |
| `tz` | `tz` | text | The source's own zone, for daily values (15.2). |
| `label` | `label` | text | Up to 60 chars. Short name in facts: "North Walpole". |
| `note` | `note` | text | Up to 200 chars. One sentence for the fact note. |
| `siteLat`, `siteLon` | `site_lat`, `site_lon` | real | Where the gauge or station is. |
| `distanceM` | `distance_m` | integer | Straight line from the dock. |
| `riverM` | `river_m` | integer | Along the water, signed: positive upstream. Null if unknown. |
| `relation` | `relation` | text | `at` (within 1 km), `upstream`, `downstream`, `nearby` (not on the water: weather stations), `other_water` (a tributary or another lake; shown with a warning). |
| `stats` | `stats` | JSON | Percentiles for flow or level (11.3). |
| `status` | `status` | text | `active`, `offline`, `retired` (15.7). |
| `lastOkAt`, `lastCheckedAt` | `last_ok_at`, `last_checked_at` | integer | Set by the health check (15.7). |

## 5. D1 schema

08-architecture.md 4.4 holds the canonical statements (`0003_locations.sql`), which change this proposal: no `steward_club_id` until `0010` in phase 5 (K12), an `emergency` column (K13), the reserved slug `index` (K25), and one merged `location_sources` (K2). These statements are the proposal for 08-architecture.md, which owns migration numbering. They follow `migrations/0001_reports.sql`: TEXT ids from `crypto.randomUUID()` (slugs for waterway ids), INTEGER ms times. `users` (03) and `clubs` (06) must exist first. D1 supports the JSON extension (used by `json_valid`) and FTS5 (from docs, https://developers.cloudflare.com/d1/sql-api/sql-statements/). Batches run as one transaction (from docs, https://developers.cloudflare.com/d1/worker-api/d1-database/). Limits that matter here: 100 bound parameters per query, 2 MB per row, 100 columns per table (from docs, https://developers.cloudflare.com/d1/platform/limits/).

```sql
-- Locations and waterways. Phase 3. Proposed file: migrations/00NN_locations.sql

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
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS waterways_bbox ON waterways (min_lat, max_lat);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE
    CHECK (length(slug) BETWEEN 3 AND 48 AND slug NOT GLOB '*[^a-z0-9-]*'
           AND slug NOT GLOB '-*' AND slug NOT GLOB '*-' AND slug NOT GLOB '*--*'
           AND slug NOT IN ('api', 'add', 'admin', 'mod', 'account', 'club', 'assets', 'about', 'privacy',
                            'terms', 'help', 'settings', 'login', 'logout', 'static', 'sw', 'manifest',
                            'locations')),
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
  launch_notes TEXT CHECK (launch_notes IS NULL OR length(launch_notes) <= 1000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'verified', 'archived')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  steward_club_id TEXT REFERENCES clubs(id),
  created_by TEXT REFERENCES users(id),
  verified_by TEXT REFERENCES users(id),
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
CREATE INDEX IF NOT EXISTS locations_steward ON locations (steward_club_id);

-- Old slugs after a rename or merge. Looked up when a slug is not in locations.
CREATE TABLE IF NOT EXISTS location_aliases (
  slug TEXT PRIMARY KEY CHECK (length(slug) BETWEEN 3 AND 48 AND slug NOT GLOB '*[^a-z0-9-]*'),
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('renamed', 'merged')),
  created_at INTEGER NOT NULL
);

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
  tz TEXT,
  label TEXT CHECK (label IS NULL OR length(label) <= 60),
  note TEXT CHECK (note IS NULL OR length(note) <= 200),
  site_lat REAL, site_lon REAL,
  distance_m INTEGER,
  river_m INTEGER,
  relation TEXT CHECK (relation IS NULL OR relation IN ('at', 'upstream', 'downstream', 'nearby', 'other_water')),
  stats TEXT CHECK (stats IS NULL OR json_valid(stats)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'offline', 'retired')),
  last_ok_at INTEGER,
  last_checked_at INTEGER,
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((location_id IS NULL) <> (waterway_id IS NULL))
);
CREATE INDEX IF NOT EXISTS location_sources_loc ON location_sources (location_id, role, priority);
CREATE INDEX IF NOT EXISTS location_sources_ww ON location_sources (waterway_id, role, priority);
CREATE INDEX IF NOT EXISTS location_sources_ref ON location_sources (adapter, ref);
CREATE INDEX IF NOT EXISTS location_sources_health ON location_sources (status, last_checked_at);

CREATE TABLE IF NOT EXISTS location_revisions (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  revision INTEGER,               -- set when applied; null while pending
  base_revision INTEGER NOT NULL, -- the revision the change was made against
  status TEXT NOT NULL CHECK (status IN ('applied', 'pending', 'rejected', 'withdrawn')),
  kind TEXT NOT NULL CHECK (kind IN ('create', 'edit', 'sources', 'status', 'claim', 'verify',
                                     'merge', 'archive', 'restore', 'import')),
  user_id TEXT REFERENCES users(id), -- null for curated imports
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 200),
  changes TEXT NOT NULL CHECK (json_valid(changes)),  -- { "field": [before, after] }
  snapshot TEXT CHECK (snapshot IS NULL OR json_valid(snapshot)), -- full record after, applied only
  decided_by TEXT REFERENCES users(id),
  decided_at INTEGER,
  decision_note TEXT CHECK (decision_note IS NULL OR length(decision_note) <= 300),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS location_revisions_rev ON location_revisions (location_id, revision)
  WHERE revision IS NOT NULL;
CREATE INDEX IF NOT EXISTS location_revisions_queue ON location_revisions (status, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS location_revisions_user ON location_revisions (user_id, created_at);

-- Search. External content table kept in sync by triggers.
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
```

Notes:

- The reserved-word list is enforced twice: in the CHECK and in `validateSlug()` (`src/location.js`), so the client can say why before sending. The Worker also checks `location_aliases` for uniqueness, since SQLite cannot check across tables in a CHECK.
- Why FTS5 for search: rows read are billed, and capped at 5 million a day on Workers Free (from docs, https://developers.cloudflare.com/d1/platform/pricing/). A `LIKE '%x%'` scan reads every location on every keystroke. FTS5 reads only matches. Unverified: whether `wrangler d1 export` handles FTS5 virtual tables; check before relying on exports for backups (08).
- `snapshot` holds the full record with sources after each applied change, about 3 to 6 KB. A location edited 200 times stays near 1 MB, inside the 2 MB row limit per row (each snapshot is its own row).

## 6. Putney Landing, the first record

### 6.1 Current values and where they come from

| What | Value | Where it lives today |
| --- | --- | --- |
| Dock | 42.9607, -72.5219 | `src/config.js` `LOC`; CLAUDE.md |
| Time zone | America/New_York | `src/config.js` `LOC.tz`; all formatters in `src/format.js` |
| Name | Putney Landing | `index.html` `<h1>`, `<title>`, Open Graph |
| Subtitle | "Connecticut River at the Putney Rowing Club docks. All times Eastern." | `index.html` `.sub` |
| App name | Putney Row | `index.html` apple title, install bar and dialog; `vite.config.js` `short_name`; README title |
| Course heading | 15° upstream, an estimate | `DEFAULTS.heading`; README defaults table |
| Banks | VT on the left facing upstream, NH on the right | `src/render/parts.js` `compassSVG`; `src/logic.js` `windVsCourse`; `src/render/detail/wind.js` `courseWord` |
| Flow gauge | USGS-01154500, Connecticut River at North Walpole, NH | `GAUGE_FLOW` |
| Water temperature gauge | USGS-01161280, Connecticut River near Northfield, MA | `GAUGE_TEMP` |
| River forecast | NWPS WLPN3 (NERFC) | `NWS_GAUGE` |
| Observation | NWS station KEEN | `SRC.obs` |
| Alerts | `https://api.weather.gov/alerts/active?point=42.9607,-72.5219` | `SRC.alerts` |
| Thresholds | wind 10/15 mph, gusts 18/25 mph, rain 60/90 %, cold line 100°F, flow 20,000/28,000 cfs, AQI 151/201 | `DEFAULTS` |
| Wind against current | x1.25 over 10,000 cfs, x1.4 over 20,000 cfs; text note at 10,000 cfs | `WATER.against`; `windVsCourse` literal `10000` |
| Crosswind weight | 0.4 | `WATER.cross` |
| Flow stats copy | "Since 2016 the median day is about 6,900 cfs. 20,000 is roughly the top 10% of days, 28,000 the top 5%." | `index.html` Settings note; `src/render/detail/river.js` |

Live checks, 2026-10-17:

- USGS-01154500: "CONNECTICUT RIVER AT NORTH WALPOLE, NH", 43.126189, -72.436755, drainage area 5,493 sq mi, Cheshire County NH. 19,659 m straight line from the dock, bearing 20.6° (verified live 2026-10-17).
- USGS-01161280: "CONNECTICUT RIVER NEAR NORTHFIELD, MA", 42.683333, -72.471944, drainage area 6,730 sq mi. 31,110 m (19.3 mi) from the dock, bearing 172.5° (verified live 2026-10-17). The app's "about 19 mi downstream" is the straight-line distance.
- KEEN: Keene, Dillant-Hopkins Airport, 42.9, -72.26667, zone America/New_York. 21,848 m (13.6 mi) from the dock, bearing 107.9° (verified live 2026-10-17). Matches "14 mi east".
- WLPN3: "Connecticut River at North Walpole", USGS id 01154500, RFC NERFC, WFO GYX, in service. Flood categories by stage: action 26 ft, minor 28 ft, moderate 32 ft, major 35 ft (verified live 2026-10-17). These are far above rowing limits, so they are not used for thresholds.
- Daily mean flow, 2016-01-01 to 2026-10-15, 3,939 days: median 6,910 cfs, p65 10,100, p88 20,300, p90 21,900, p95 28,100. 20,000 cfs is exceeded on 12.4% of days, 28,000 on 5.0%, 10,000 on 35.3% (verified live 2026-10-17 from the USGS `daily` collection). The Settings note's "roughly the top 10%" for 20,000 is close; the measured share is 12%.
- NWS point: `https://api.weather.gov/points/42.9607,-72.5219` returns office GYX (Gray, ME), grid 3,13, forecast zone NHZ011, county NHC005, zone America/New_York (verified live 2026-10-17). The dock coordinate sits on the New Hampshire side of the state line, which follows the Vermont bank. A point 0.0006° west (42.9607, -72.5225) returns ALY grid 111,84, zone VTZ015 "Eastern Windham" (verified live 2026-10-17). CLAUDE.md says ALY, grid 111,85, zone VTZ015. The app never uses the grid; it does use the point for alerts, so today it gets Cheshire County NH alerts from Gray, not Windham County VT alerts from Albany. The footer credits "National Weather Service, Albany".

Decision: In phase 0 keep the alerts binding as `point:42.9607,-72.5219`, so nothing changes. In phase 1 switch Putney to `zones:VTZ015,VTC025,NHZ011,NHC005`, the forecast zone and county on each bank, which returns alerts for both banks (a multi-zone query with a county code returned 200, verified live 2026-10-18), and fix the footer and CLAUDE.md.
- Alternative: keep the point forever and change only the footer to credit NWS Gray.
- Alternative: move the dock point 60 m west onto the Vermont shore so the point resolves to ALY and VTZ015.

### 6.2 The waterway file

`data/waterways/connecticut-river-vernon-pool.json`:

```json
{
  "v": 1,
  "id": "connecticut-river-vernon-pool",
  "name": "Connecticut River",
  "reach": "Bellows Falls dam to Vernon dam",
  "kind": "river",
  "country": "US",
  "regions": ["US-VT", "US-NH"],
  "geometry": null,
  "traffic": null,
  "notes": null,
  "sources": [
    {
      "role": "flow", "mode": "primary", "priority": 0,
      "adapter": "usgs-ogc", "ref": "USGS-01154500", "params": { "parameterCode": "00060" },
      "unit": "cfs", "tz": "America/New_York",
      "label": "North Walpole",
      "note": "North Walpole gauge below Bellows Falls dam, about 16 river miles upstream.",
      "siteLat": 43.126189, "siteLon": -72.436755,
      "distanceM": 19659, "riverM": 25750, "relation": "upstream",
      "stats": { "from": "2016-01-01", "to": "2026-10-15", "days": 3939,
                 "p50": 6910, "p65": 10100, "p88": 20300, "p90": 21900, "p95": 28100 }
    },
    {
      "role": "flow_forecast", "mode": "primary", "priority": 0,
      "adapter": "nwps", "ref": "WLPN3", "unit": "cfs",
      "label": "NWS Northeast River Forecast Center"
    }
  ]
}
```

`distanceM`, `riverM` and `note` on a waterway binding are measured from the first verified member location. For other members the Worker (phase 3) or the build (phase 1) recomputes `distanceM` from that member's dock; `note` is replaced by a generated note unless the member's `copy` overrides it.

### 6.3 The location file

`data/locations/putney-landing.json`:

```json
{
  "v": 1,
  "id": "19fe7acb-de20-48c9-b25d-20d5e99d113a",
  "slug": "putney-landing",
  "name": "Putney Landing",
  "shortName": "Putney",
  "subtitle": "Connecticut River at the Putney Rowing Club docks.",
  "locality": "Putney, VT",
  "waterway": "connecticut-river-vernon-pool",
  "lat": 42.9607,
  "lon": -72.5219,
  "tz": "America/New_York",
  "tzLabel": "Eastern",
  "country": "US",
  "region": "US-VT",
  "waterType": "river",
  "course": {
    "kind": "heading",
    "heading": 15,
    "reachWord": "straight",
    "confirmed": false,
    "note": "Estimate of the reach at Putney Landing."
  },
  "banks": {
    "word": "bank",
    "left": { "short": "VT", "name": "Vermont" },
    "right": { "short": "NH", "name": "New Hampshire" }
  },
  "thresholds": {
    "windCaution": 10, "windOff": 15, "gustCaution": 18, "gustOff": 25,
    "rainCaution": 60, "rainOff": 90, "coldCombined": 100,
    "flowCaution": 20000, "flowOff": 28000, "aqiCaution": 151, "aqiOff": 201
  },
  "aqiScale": "us",
  "flow": {
    "measure": "discharge",
    "unit": "cfs",
    "against": [[20000, 1.4], [10000, 1.25]],
    "maxAgeH": null,
    "staleSwitchH": 6
  },
  "water": { "mode": "river", "cross": 0.4 },
  "fog": null,
  "waterTemp": { "fallback": "none", "maxAgeH": null },
  "tide": null,
  "daylight": null,
  "copy": {
    "flowStats": "Since 2016 the median day is about 6,900 cfs. 20,000 is roughly the top 10% of days, 28,000 the top 5%.",
    "flowHow": "Flow is measured at the USGS gauge at North Walpole, below the Bellows Falls dam, about 16 river miles upstream of the dock. The forecast is from the NWS Northeast River Forecast Center for the same gauge, in 6-hour steps.",
    "credits": "Forecast from Open-Meteo (NOAA HRRR and GFS models). Alerts and Keene observations from the National Weather Service, Albany. River flow from USGS gauge 01154500 at North Walpole, water temperature from 01161280 near Northfield. River forecast from the NWS Northeast River Forecast Center. Air quality from Open-Meteo (Copernicus CAMS), and the model comparison from GFS, ECMWF, GEM and ICON via Open-Meteo."
  },
  "launchNotes": null,
  "status": "verified",
  "verifiedVia": "owner",
  "sources": [
    {
      "role": "alerts", "adapter": "nws-alerts", "ref": "point:42.9607,-72.5219", "label": "NWS"
    },
    {
      "role": "obs", "adapter": "nws-obs", "ref": "KEEN", "label": "Keene",
      "note": "Keene airport, 14 mi east. A check on the model.",
      "siteLat": 42.9, "siteLon": -72.26667, "distanceM": 21848, "relation": "nearby"
    },
    {
      "role": "water_temp", "mode": "primary", "adapter": "usgs-ogc", "ref": "USGS-01161280",
      "params": { "parameterCode": "00010" }, "unit": "degC", "tz": "America/New_York",
      "label": "Northfield",
      "note": "Nearest main-stem gauge, near Northfield, MA, about 19 mi downstream.",
      "siteLat": 42.683333, "siteLon": -72.471944, "distanceM": 31110, "relation": "downstream"
    }
  ]
}
```

Why these choices:

- The water temperature gauge is a location binding, not a waterway one: Northfield is below Vernon dam, outside this pool. Another location on the pool may prefer a dock reading.
- `maxAgeH: null` on flow and water temperature keeps today's behavior (no age limit) in phase 0. Phase 1 sets 24 and 72 for every location, Putney included (15.7). That is a change only when a gauge is down for a day.
- `copy` keeps Putney's text word for word where a template would read differently. Only curated records and moderators can set `copy`. Allowed keys: `flowFact`, `flowStats`, `flowHow`, `waterTempFact`, `obsFact`, `credits`. Each up to 600 chars.
- `tzLabel: "Eastern"` makes the generated line "All times Eastern." exactly as now.
- Putney's verified heading is still open (CLAUDE.md open items). `confirmed: false` shows "Course heading 15°, an estimate." in the Wind view's How this works panel, as the README does now.

## 7. Phase 1: the curated list

### 7.1 Where the list lives

Decision: Store the curated list as JSON files in the repo, validated and built into `dist/` as static files that the service worker precaches. Seed them into D1 in phase 3.
- Alternative: bundle every record into the JavaScript. Simplest, but every new location grows the app shell for every user.
- Alternative: serve from D1 from day one. Needs the Worker, so the app no longer works on a plain static host, and the list is not available offline on first install.

Why static: the hard constraint says the app must build to plain static files any host can serve, and the app shell works offline. A static list keeps both. It also puts every curated location through a pull request, which is the review step phase 1 needs.

### 7.2 Files

| Path | What |
| --- | --- |
| `data/locations/<slug>.json` | One curated location, the format in 6.3. File name must equal `slug`. |
| `data/waterways/<id>.json` | One waterway, the format in 6.2. |
| `src/location.js` | New. `validateLocation`, `validateWaterway`, `validateSlug`, `slugify`, `RESERVED_SLUGS`, `resolveSources`, `resolveLocation`, `courseSegments`, `fetchAt`, `autoBanks`, `effectiveSettings`, `flowDefaults`. Pure, used by the build, the app and (phase 3) the Worker. |
| `vite.config.js` | New plugin `locationsPlugin()`. In `buildStart` it reads `data/`, validates every file with `src/location.js` and fails the build on any error. In `generateBundle` it emits the files below. In dev, `configureServer` serves the same paths from memory. |
| `scripts/locations/flowstats.mjs` | New. `node scripts/locations/flowstats.mjs USGS-01154500` fetches 10 years of daily means and prints `stats` and suggested thresholds (11.3). |
| `scripts/locations/bearing.mjs` | New. Bearing and distance between two points, for setting headings and `distanceM`. |
| `scripts/locations/seed.mjs` | New in phase 3. Turns `data/` into SQL inserts for D1. |
| `public/_headers` | Add `/locations/*` with `Cache-Control: public, max-age=3600`. These files are not hashed. |

Emitted into `dist/`:

| Path | Content | Size (estimate) |
| --- | --- | --- |
| `locations/index.json` | Summaries of `published` and `verified` locations, for the picker. | about 260 bytes per location; 25 locations about 6.5 KB |
| `locations/<slug>.json` | Full record with waterway and resolved sources inlined. | 3 to 5 KB each |
| `<slug>.html` (08 K24; a folder index would redirect `/putney-landing` to `/putney-landing/`) | A copy of the built `index.html` with this location's `<title>`, description, canonical and Open Graph tags. Link previews do not run JavaScript, so this is how a shared `/putney-landing` link previews correctly. | about 12 KB each |

`locations/index.json`:

```json
{
  "v": 1,
  "generated": 1792224000000,
  "locations": [
    {
      "slug": "putney-landing",
      "name": "Putney Landing",
      "shortName": "Putney",
      "locality": "Putney, VT",
      "waterway": "Connecticut River",
      "lat": 42.9607,
      "lon": -72.5219,
      "tz": "America/New_York",
      "country": "US",
      "region": "US-VT",
      "waterType": "river",
      "status": "verified",
      "revision": 1
    }
  ]
}
```

`dist/locations/<slug>.json` is the 6.3 record plus:

```json
{
  "waterwayRecord": { "id": "connecticut-river-vernon-pool", "name": "Connecticut River", "reach": "Bellows Falls dam to Vernon dam", "kind": "river", "traffic": null },
  "sources": [ { "...": "location and waterway bindings after resolveSources(), each with inherited: true or false" } ]
}
```

### 7.3 Service worker and hosting

- `vite.config.js` Workbox `globPatterns` gains `locations/*.json`. `globIgnores` gains each `<slug>.html` by name, from the list in `data/`, so the per-location shells are not precached (08 8.4, K24); navigations already fall back to the precached root `index.html` (`navigateFallback`).
- `wrangler.jsonc` `assets` gains `"not_found_handling": "single-page-application"`, so `/some-new-slug` serves `index.html` when no shell file exists (from docs, https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/). Curated slugs have real shell files, so they work on any static host without that setting.
- `index.html` uses relative asset paths (`apple-touch-icon.png`, `icon-192.png`). They resolve correctly under `/putney-landing` but not under `/club/x`. Phase 1 makes them absolute (`/icon-192.png`).

### 7.4 Loading a location (phase 1)

1. `src/route.js` reads `location.pathname`. `/` means the last location (`rowhether-last-v1`). `/<slug>` means that location. The hash keeps the tab and day, as now.
2. If `rowhether-loc-v1:<slug>` holds the record, resolve it and render the cached data (`rowhether-cache-v2:<slug>`) at once. No network wait for returning users.
3. In parallel fetch `/locations/<slug>.json` (phase 1) or `/api/locations/<slug>` (phase 3, when `/api/info` says `locations: true`). If `revision` changed, store it and render again. Refetch the record at most once a day.
4. Unknown slug: the in-app not-found view (07) with "No location at rowhether.com/<slug>." and the picker.
5. `setZone(loc.tz)` (8.2) runs before the first render.

What `/` shows for someone with no stored location is 07's picker, with one exception:

Decision: For 90 days after phase 1 ships, a first visit to `/` with no stored location opens Putney Landing with a quiet bar "Not your water? Pick a location." Links shared from the current app point at `https://rowhether.com/` and mean Putney; this keeps them working. After 90 days `/` shows the picker.
- Alternative: show the picker at once, with Putney first in the list.
- Alternative: keep `/` as Putney forever and put the picker at `/locations`.

### 7.5 Candidate locations

Every row except Putney is a candidate for the owner to confirm. Coordinates are what an OpenStreetMap Nominatim search returned on 2026-10-17 for the named feature (verified live 2026-10-17). They are the boathouse, park or lake centroid, not the dock point; the dock point must be set on a map before adding. Gauges marked "verified live" were checked in the USGS `latest-continuous` and `monitoring-locations` collections the same day.

Near Putney:

| Candidate slug | Place | Water type | Feature coordinates | Gauges and notes |
| --- | --- | --- | --- | --- |
| `putney-landing` | Putney Landing, Putney Rowing Club | river | 42.9607, -72.5219 (dock, from `src/config.js`) | 6.3. OSM also has a "Putney Landing" slipway at 42.961876, -72.520550, 171 m from the dock point (verified live 2026-10-17). |
| `hanover-boathouse` | Friends of Dartmouth Rowing boathouse, Hanover, NH | river | 43.705519, -72.297634 | Flow: USGS-01144500 Connecticut River at West Lebanon, NH, 6.7 km, drainage 4,092 sq mi, active (verified live 2026-10-17). Different pool (above Wilder dam, unverified), so a new waterway. |
| `holyoke` | Holyoke Rows, Holyoke, MA | river | not found in Nominatim; set by hand | Flow: USGS-01172010 Connecticut River at I-391 bridge at Holyoke, drainage 8,332 sq mi, flow and stage, active (verified live 2026-10-17). Whether the dock is above or below the Holyoke dam is unverified. |
| `riverside-park-hartford` | Riverside Park, Hartford, CT (Riverfront Recapture) | river, tidal influence | 41.772409, -72.667786 (park) | USGS-01190070 Connecticut River at Hartford reports stage only, no discharge (verified live 2026-10-17): bind as `flow` with `measure: "stage"`, or as `info`. Flow from USGS-01184000 at Thompsonville, drainage 9,660 sq mi, flow and water temperature, active (verified live 2026-10-17). A good test of "two gauges for one location". |
| `lake-quinsigamond` | Lake Quinsigamond, Worcester, MA | lake | 42.273421, -71.755284 (lake centroid) | No flow gauge. Fetch from the lake's long axis (9.3). |
| `saratoga-lake` | Saratoga Rowing Association, Saratoga Springs, NY | lake | 43.056823, -73.722577 (building) | No flow gauge. |
| `community-rowing-brighton` | Community Rowing boathouse, Brighton, Boston | river | 42.358717, -71.165752 | Charles River. Nearest main-stem gauge USGS-01104615 above Watertown Dam has had no reading since 2000-10-01 (verified live 2026-10-17); use USGS-01104500 at Waltham, 5.8 km, drainage 251 sq mi, active. |
| `weld-boathouse` | Weld Boathouse, Cambridge, MA | river | 42.369423, -71.122119 | Same waterway as Community Rowing (Charles River Basin), 3.7 km apart, so separate locations. |

Well-known US waters:

| Candidate slug | Place | Water type | Feature coordinates | Gauges and notes |
| --- | --- | --- | --- | --- |
| `boathouse-row` | Boathouse Row, Schuylkill River, Philadelphia | river | 39.969414, -75.187107 | USGS-01474500 Schuylkill River at Philadelphia, 0.2 km, drainage 1,893 sq mi, active (verified live 2026-10-17). One location for all the boathouses (dedupe, 12.3). |
| `thompson-boat-center` | Thompson Boat Center, Potomac, Washington, DC | tidal | 38.900527, -77.058337 | Tidal below Little Falls. Flow at USGS-01646500 near Washington, DC Little Falls, drainage 11,560 sq mi (site verified live 2026-10-17; its discharge series not confirmed). Tide station: unverified. |
| `peter-jay-sharp-boathouse` | Peter Jay Sharp Boathouse, Harlem River, New York | tidal | 40.856534, -73.921669 | Tidal strait. Needs the tide adapter (02). |
| `lake-carnegie` | Lake Carnegie, Princeton, NJ | lake | 40.352853, -74.626836 (OSM tags it a reservoir) | No flow gauge. |
| `mercer-lake` | Mercer Lake, West Windsor, NJ | reservoir | 40.266015, -74.637418 | No flow gauge. |
| `cooper-river` | Cooper River, Pennsauken and Cherry Hill, NJ | lake | 39.926855, -75.065330 (river line) | Dammed lake. Dock point unverified. |
| `conibear-shellhouse` | Conibear Shellhouse, Seattle | lake | 47.652901, -122.29981 | Lake Washington and the Montlake Cut. |
| `lake-natoma` | Sacramento State Aquatic Center, Lake Natoma, CA | reservoir | 38.634527, -121.21917 | Below Folsom Dam; releases change the current. |
| `jack-london-aquatic-center` | Jack London Aquatic Center, Oakland Estuary, CA | tidal | 37.790508, -122.26602 | Tidal estuary. |
| `lady-bird-lake` | Lady Bird Lake, Austin, TX | reservoir | 30.268810, -97.763382 (centroid) | Dock point unverified. |

Beyond the US, for phase 7 testing:

| Candidate slug | Place | Water type | Feature coordinates | Why it is a useful test |
| --- | --- | --- | --- | --- |
| `putney-embankment` | Putney Embankment, Thames, London | tidal | 51.469676, -0.2199831 (slipway) | Tidal river, UK sources, metric, and the same town name as Putney Landing. |
| `bassin-olympique` | Bassin olympique, Montreal | canal | 45.507467, -73.523482 | Still-water basin, Canadian sources, French names. |
| `lake-karapiro` | Lake Karapiro, NZ | reservoir | -37.98865, 175.658976 | Southern hemisphere, east of 175°, a UTC+12 or +13 zone. |
| `lake-burley-griffin` | Lake Burley Griffin, Canberra | lake | -35.29909, 149.079665 | Southern hemisphere, Australian sources. |

## 8. Generalizing the logic (phase 0)

Phase 0 changes no visible behavior. Putney renders the same text, numbers and charts, and existing installs keep their settings and cache. The method: capture golden outputs first (16.2), then refactor, then prove equality.

### 8.1 Every place that assumes Putney

| # | File and symbol | What it assumes | Change | Phase |
| --- | --- | --- | --- | --- |
| 1 | `src/config.js` `LOC` | One dock and zone | Removed. Read from `m.loc` (logic) or the active location (UI). | 0 |
| 2 | `src/config.js` `DEFAULTS` | `heading: 15`, flow 20,000/28,000 cfs | Split: `GLOBAL_DEFAULTS` (wind, gust, rain, cold, AQI, and `waterOverride: ''`) stays; heading moves to `course`, flow limits to the record (blank when a record has none, 11.1). | 0 |
| 3 | `src/config.js` `GAUGE_FLOW`, `GAUGE_TEMP`, `NWS_GAUGE` | Putney gauges | Bindings in the record. | 0 |
| 4 | `src/config.js` `SRC` | URL builders closed over `LOC` and the gauge constants | `bindingsFor(loc)` returns the same keys (02 owns the adapters; 08 K3). | 0 |
| 5 | `src/config.js` `SOURCE_NAMES` | "Keene observations", "USGS river gauges", "the NWS river forecast" | Built from binding labels: `${label} observations`. Same text for Putney. | 0 |
| 6 | `src/config.js` `SET_KEY`, `PLAN_KEY`, `CACHE_KEY`, `INSTALL_KEY`, `NUDGE_KEY` (`putney-rowing-*-v1`) | One location in storage | New keys and a one-time migration (8.6). | 0 |
| 7 | `src/config.js` `WATER.against` | Thresholds in cfs | `loc.flow.against`, in the flow binding's unit. | 0 |
| 8 | `src/config.js` `MODELS` comment, "mostly HRRR and GFS here" | US models | Model list by region (02). Copy from the record's `copy.credits` or generated. | 1 |
| 9 | `src/config.js` `AQI` | US AQI categories | Scale chosen by `loc.aqiScale` (02, 07). | 7 |
| 10 | `src/format.js` all formatters | Built once at module load with `LOC.tz` and `en-US` | `zoneFormat(tz)` plus `setZone(tz)` (8.2). Locale is 07's. | 0 |
| 11 | `src/logic.js` `sunFor`, `sunOn` | `LOC.lat`, `LOC.lon` | `m.loc`; `sunOn(loc, t)`. Polar handling (15.4). | 0, polar 1 |
| 12 | `src/logic.js` `windVsCourse` | "New Hampshire bank", "Vermont bank", "along the straight", literal `10000` | Bank names from `loc.banks`, reach word from `course.reachWord`, the current note at the lowest `loc.flow.against` value, segments (10.3). | 0, segments 1 |
| 13 | `src/logic.js` `chopWind`, `waterState`, `waterWhy` | Single heading `m.S.heading`; "width of the river"; cfs multipliers | Modes by water type (9), segments, `loc.water`. | 0 river, 1 others |
| 14 | `src/logic.js` `fogRisk`, `morningFog`, `nextMorning` | `FOG` global; Eastern hours | `loc.fog` merged over `FOG`; hours from `m.fmt`. | 0 |
| 15 | `src/logic.js` `periodsFor`, `rowingHours`, `runsBy`, `planSessions` | Eastern clock; dawn and sunset always exist; UTC half-hour steps line up with local half hours | `m.fmt`; polar fallbacks; local-minute plan steps (15.3). | 0, polar 1 |
| 16 | `src/logic.js` `buildModel` | `h0 = Math.floor(now / HOUR) * HOUR` assumes local hours start on UTC hours | Find the forecast hour that contains `now` in `m.hours` (15.3). | 0 |
| 17 | `src/data.js` `parseRiver` | Matches `GAUGE_FLOW`, `GAUGE_TEMP` | Takes the binding refs. | 0 |
| 18 | `src/data.js` `parseFlowDays` | `T16:00:00Z` is noon Eastern | Noon in the binding's `tz`. | 1 (08 K11) |
| 19 | `src/data.js` `alertLevel` | NWS event names | Per adapter (02). | 7 |
| 20 | `src/render/parts.js` `compassSVG` | Fixed "VT" and "NH" positions, a straight river | Labels from `loc.banks`, rotated with the river; polyline and lake drawings (10.5). | 0 labels, 1 drawing |
| 21 | `src/render/now.js` `renderNow` | "Nearest main-stem gauge, near Northfield, MA ...", "North Walpole gauge below Bellows Falls dam ...", "Measured at Keene", "Keene airport, 14 mi east ...", "USGS gauge unavailable.", "cfs" | Binding `note` and `label`, `copy` overrides, flow unit formatter. River flow fact omitted when there is no flow binding. | 0 |
| 22 | `src/render/forecast.js` | Compass, "River runs ...", "cfs", "NWS forecast for this period" | Same as 20 and 21; "NWS" from the flow forecast adapter name. | 0 |
| 23 | `src/render/detail/wind.js` `courseWord`, How this works | "Cross, NH", "Cross, VT", "river running up the page", "along the straight" | `banks.*.short`, `course.reachWord`, water word by type. | 0 |
| 24 | `src/render/detail/river.js` | North Walpole, Bellows Falls dam, 16 river miles, NERFC, median stats, "cfs" | `copy.flowHow`, `copy.flowStats`, or generated; unit formatter; view hidden without a flow or level binding. | 0 |
| 25 | `src/render/detail/temperature.js` | Northfield text | Binding note. | 0 |
| 26 | `src/render/detail/week.js`, `light.js` `clockMin` | "Eastern time is a whole number of hours from UTC" (`getUTCMinutes()`) | `fmt.localMinutes(t)`. Wrong today for +5:30, +5:45, +9:30, -3:30 zones (verified live 2026-10-17, 15.3). | 0 |
| 27 | `src/render/detail/fog.js` | "miles" | Units (07). | 2 (07 7.9; 08 K28) |
| 28 | `src/share.js` | "Putney Landing rowing, ...", title "Putney Landing rowing forecast", URL `SITE_URL` | `${loc.name} rowing, ...`, `${loc.name} rowing forecast`, URL `SITE_URL + loc.slug` on production. | 0 text, 1 URL |
| 29 | `src/settings.js` | Heading field; `DEFAULTS` for Reset; flow fieldset always shown | Fields from the location (11.6). | 0, 1 |
| 30 | `src/storage.js` | Keys; `loadSettings()` merges `DEFAULTS` | Per-location overrides (11.5). | 0 |
| 31 | `src/state.js` | `settings: loadSettings()` at import | Settings load after the location resolves. | 0 |
| 32 | `src/reports.js`, `worker/reports.js`, `migrations/0001_reports.sql` | One dock, no location id | 04 adds `location_id` and moves the route under `/api/locations/:slug/reports`. | 3 |
| 33 | `index.html` | Title, description, canonical, Open Graph, apple title "Putney Row", `<h1>`, `.sub`, footer credits, install bar and dialog "Putney Row", Settings "Upstream heading", "River flow at North Walpole, cfs" and its note, relative asset paths | Filled from the location at runtime (`renderHeader()`); per-location shells (7.2); absolute asset paths. App name is 07's decision. | 0 text, 1 shells |
| 34 | `vite.config.js` | Manifest `name`, `short_name`, `description` mention Putney | 07 decides the app name. `locationsPlugin()`; Workbox patterns. | 1 |
| 35 | `worker/claude.js` `SYSTEM` | "the Connecticut River at the Putney Rowing Club docks in Putney, Vermont" | "for the rower's chosen launch site, a dock or boathouse on a river, lake or tidal water". | 1 |
| 36 | `worker/suggest.js` `SETTING_KEYS` | Includes `heading`; no location in the issue context | Add `location` (slug) to bug context; keep `heading` only when overridden. | 1 |
| 37 | `package.json` `description` | Putney | General description. | 1 |
| 38 | `README.md`, `CLAUDE.md` | Location, endpoints, defaults tables | Point to `data/locations/putney-landing.json`; owner approves CLAUDE.md edits. | 0 |
| 39 | `test/logic.test.js` | Eastern fixture (`T0 = Date.UTC(2026, 5, 15, 4)`), "Putney" test names, `DEFAULTS` | Fixtures load the Putney record; new zone fixtures (16). | 0 |
| 40 | `wrangler.jsonc` | No SPA fallback | `not_found_handling` (7.3). | 1 |

### 8.2 Time zone aware formatting

`src/format.js` becomes:

```js
// Formatters for one IANA zone, cached per zone.
export function zoneFormat(tz) { /* returns { tz, dayKey, weekday, monthDay, localHour, localMinutes, hm, hShort, fDayLong, dayWord, whenText, zoneName } */ }

// The zone the UI shows. Exported helpers below are live bindings that follow it.
export let dayKey, weekday, monthDay, localHour, localMinutes, hm, hShort, fDayLong, dayWord, whenText;
export function setZone(tz) { const f = zoneFormat(tz); ({ dayKey, weekday, monthDay, localHour, localMinutes, hm, hShort, fDayLong, dayWord, whenText } = f); }
setZone('America/New_York'); // phase 0 default, replaced by the location before the first render
```

- ES module `let` exports are live bindings, so the render code (`now.js`, `days.js`, detail views) keeps importing `hm` and `dayKey` and needs no other change.
- `src/logic.js` stops importing the zone helpers and uses `m.fmt`, set in `buildModel` from `loc.tz`. Logic stays pure, so 05's server engine can build models for many locations in one Worker run.
- New helper `localMinutes(t)`: minutes after local midnight from `formatToParts` hour and minute. Replaces `clockMin` in `week.js` and `light.js`.
- New `zoneName(t)`: `tzLabel` if set, otherwise `Intl.DateTimeFormat` `timeZoneName: 'longGeneric'` without a trailing " Time". In Node 22 that gives "Eastern Time" for America/New_York, "United Kingdom Time" for Europe/London, "Australian Central Time" for Australia/Adelaide (verified live 2026-10-17). London reads badly, so curated non-US records set `tzLabel` ("UK time").
- `r0`, `fmtInt`, `esc`, `card`, `cToF`, `rng`, `lowerFirst`, `visText`, `ago` do not depend on the zone and stay as they are. New `fmtFlow(v, unit)`: "20,000 cfs", "120 m³/s", "8.2 ft", "2.5 m".

### 8.3 The new `buildModel`

```js
// src/logic.js
export function buildModel(loc, data, S, now = Date.now())
```

- `loc` is a resolved location from `resolveLocation(record, { waterway, overrides })` in `src/location.js`.
- `data` is unchanged: `{ wx, alerts, obs, river, flow, flowDays, flowFcst, aq, models }` plus `tide`, `tideStream`, `level` where bound.
- `S` is the effective settings for this location (11.5): the threshold keys and `waterOverride`. `heading` leaves `S`.
- The model gains `m.loc` and `m.fmt` (`= zoneFormat(loc.tz)`). Everything else keeps its shape: `hours`, `days`, `h72`, `cur`, `alerts`, `daytime`, `next`, `periods` on each day.
- Location first, because the server engine (05) and tests call it for many locations, and `data` and `S` belong to a location.
- `src/render/index.js` `render()` calls `buildModel(app.loc, app.data, app.settings)`.

The resolved location:

```js
{
  id, slug, name, shortName, subtitle, locality, tz, tzLabel, lat, lon, country, region,
  waterType, status, aqiScale,
  course: { kind, heading, points, reachWord, confirmed, segments: [{ heading, lengthM, fromM, toM, name }] },
  banks: { word, left: { short, name }, right: { short, name } },
  thresholds,                       // location defaults; S holds the merged values
  flow: { measure, unit, label, against, maxAgeH, staleSwitchH, stats } | null,
  water: { mode, cross, levels, blend, refFetchM, fetchM, lake } ,
  fog,                              // FOG merged with loc.fog
  waterTemp: { fallback, monthly, maxAgeH },
  tide: { floodHeading, streamCaution, streamOff, minLaunch, unit } | null,
  daylight: { dayWindow: [5, 22] },
  periods: PERIODS,
  sources,                          // resolveSources() output keyed as in 4.3
  copy,
  fmt                               // zoneFormat(tz)
}
```

### 8.4 What each function needs from the location

| Function | Today | Needs from `m.loc` | Behavior change |
| --- | --- | --- | --- |
| `sunFor(m, key)` | `SunCalc.getTimes(noon, LOC.lat, LOC.lon)` | `lat`, `lon`, `fmt`, `daylight.dayWindow` | Returns `{ dawn, sunrise, sunset, dusk, polar }` with fallbacks for missing times (15.4). Same numbers when all four exist. |
| `sunOn(t)` | `LOC` | becomes `sunOn(loc, t)` | Same polar fallbacks. |
| `lightAt(m, t)` | dawn and dusk compare | `polar` flag | `polar: 'day'` is always `day`; `polar: 'night'` with no twilight is always `dark`. |
| `assess(m, h, lightT)` | `m.S` thresholds; `flowNow(m)` in cfs; °F rules | `flow.unit`, `flow.maxAgeH`; `tide`; `level`; `aqiScale` | Flow text uses `fmtFlow`. Flow older than `maxAgeH` is not used. New reasons `tide` and `level` (9). Alerts as now. |
| `windVsCourse(m, dir, speed, t)` | one heading, VT and NH, `10000` | `course.segments`, `banks`, `course.reachWord`, `flow.against`, tidal stream at `t` | Same sentence for a single heading (Putney). Per-segment text otherwise (10.3). New optional `t` (default `m.now`) for tidal direction. |
| `chopWind(m, h)` | along plus 0.4 cross; cfs multipliers | `water.mode`, `water.cross`, `course.segments`, `flow.against`, fetch, tide stream at `h.t` | Mode switch (9). River with one heading is identical to today. |
| `waterState(m, h, prev)` | `WATER.levels`, `WATER.blend` | `water.levels`, `water.blend` (default `WATER`) | None for Putney. |
| `waterWhy(ws)` | river text | becomes `waterWhy(ws, loc)`; `water.mode`, `course.reachWord` | Text by mode (9). |
| `debrisLikely(m)` | flow change of the series | `flow.measure` | Only with a discharge or stage binding on river, tidal or canal water. |
| `notChecked(m)` | none | `waterType`, `flow`, `sources.alerts`, the age of the flow reading | New, phase 1. Lists the factors that could change the level and are not checked here or now: `flow` when a river, tidal river or canal location has no flow binding, or its reading is older than `flow.maxAgeH`; `alerts` when there is no alerts binding. Empty for Putney while its sources answer, so its screens do not change. The hero, Share and 05's messages print it (07 6.7). |
| `fogRisk(m, h)` | `FOG`, Eastern hours | `fog`, `fmt.localHour`, `waterTemp` | Steam fog uses only a live or dock reading, never the monthly fallback. |
| `morningFog`, `nextMorning`, `fogLift` | `FOG.lastHour`, Eastern | `fog.lastHour`, `fmt` | None for Putney. |
| `waterTemp(m)` | override or gauge, no age limit | `waterTemp.maxAgeH`, `waterTemp.fallback` | New `waterTemp(m, { forCold: true })` may return the monthly value, flagged `typical`. |
| `periodsFor(m, day)` | `PERIODS` clock edges in Eastern; dawn to sunset | `periods`, `fmt`, polar fallbacks | Sunset after local midnight is clipped to the end of the day's last hour (15.4). |
| `rowingHours`, `runsBy`, `callRuns`, `factorRuns` | `s.dawn`, `s.sunset` | polar fallbacks | Same for Putney. |
| `planSessions(m, minutes, when)` | noon by `localHour`; half-hour steps on UTC | `fmt` | Steps on local half hours (15.3). |
| `confidence`, `confidenceText` | models list | unchanged | None. |
| `flowForecastAt`, `flowForecastPeak` | cfs points | unit from the binding | None. |

### 8.5 Data layer touch points

02-data-sources.md defines the adapter interface. What this doc needs from it:

- `bindingsFor(loc)` (02; 08 K3) returns one entry per bound key with its URL and parser, so `fetchAll()` in `src/data.js` keeps its shape: one fetch per entry, each failing alone.
- An unbound key is absent, not an error. `app.errors` only lists bound sources that failed. The "every data source was blocked" message counts bound sources only.
- Flow values are returned in the binding's native unit. A fallback binding in a different unit is converted to the location's flow unit at parse time (1 m³/s = 35.3147 ft³/s, from 1 ft = 0.3048 m exactly).
- Daily values carry the binding's `tz` (15.2).

### 8.6 Storage keys and migration

New keys (08-architecture.md lists the canonical set):

| Key | Content | Replaces |
| --- | --- | --- |
| `rowhether-settings-v2` | `{ "<slug>": { "saved": <ms>, "values": { ...overrides } } }` | `putney-rowing-settings-v1` |
| `rowhether-cache-v2:<slug>` | `{ data, updated }` as today, per location. Keep up to 10 locations, favorites protected, with `rowhether-cache-index-v1` (07 9.2; 08 K27). | `putney-rowing-cache-v1` |
| `rowhether-loc-v1:<slug>` | `{ record, fetchedAt }`, the cached location record. Same 10 kept. | none |
| `rowhether-last-v1` | Last location slug. | none |
| `rowhether-recent-v1` | Up to 8 recent slugs, newest first. | none |
| `rowhether-plan-v1` | Plan a row choices (global, not per location). | `putney-rowing-plan-v1` |
| `rowhether-install-v1` | Install bar state `{ dismissed, never }`, as the code keeps it today. | `putney-rowing-install-v2` (the `-v1` snooze is ignored, as today; 08 K35) |
| `rowhether-nudge-v1` | Settings reminder dismissed. | `putney-rowing-nudge-v1` |
| `rowhether-migrated-v1` | Migration marker, `"1"`. | none |

Migration, `migrateStorage()` in `src/storage.js`, called at the top of `loadSettings()` and before anything else reads storage. Every step is in try/catch, as all storage access is today.

1. If `rowhether-migrated-v1` exists, stop.
2. Settings: read `putney-rowing-settings-v1`. If present, keep only keys whose value differs from Putney's record (`thresholds`, plus `heading` when not 15, plus `waterOverride` when not empty, stored as a number; Settings keeps the typed text today, and 03 9.2 takes only numbers, 08 8.3). Compare numbers as numbers and keep `''` (a level turned off) as a real override. Write `rowhether-settings-v2` as `{ "putney-landing": { "saved": Date.now(), "values": {...} } }`. `saved` keeps the Settings reminder hidden for people who saved before (`hasSavedSettings()` reads it).
3. Cache: copy `putney-rowing-cache-v1` to `rowhether-cache-v2:putney-landing` unchanged.
4. Copy plan, install (`putney-rowing-install-v2`) and nudge values to their new keys.
5. If any `putney-rowing-*` key existed, set `rowhether-last-v1` to `putney-landing`. This is what makes an installed app open on Putney with no picker.
6. Set `rowhether-migrated-v1`.
7. Leave the old keys in place until phase 2, so a rollback of `master` to an older build still finds them. Phase 2 deletes them.

A personal heading override (step 2, `heading` not 15) stays a per-location override, applied by `resolveLocation` only to `kind: "heading"` courses, and shown in the Wind view as "Your heading 20°. The location's course is 15°."

### 8.7 Proving no visible change

- Before the refactor, a script `scripts/golden.mjs` builds models from synthetic scenarios with every source (a calm June day, a foggy October morning, a windy high-flow April day, and the week across the November change; 08 14 P0.1, K43), since responses for chosen conditions cannot be recorded on demand, and writes `test/golden/putney-*.json`: every hour's `a`, `water`, fog risk, every period, `windVsCourse` and `waterWhy` strings, `planSessions` output.
- After the refactor, `test/golden.test.js` rebuilds them through `buildModel(PUTNEY, ...)` and requires deep equality.
- Playwright screenshots at 390 px and 1280 px with the pinned clock (midday and 9 PM), before and after, must match pixel for pixel except the compass bank labels if 10.5's rotation ships in phase 0 (it does not; it ships in phase 1).

## 9. Water types

### 9.1 Summary

| | river | lake | reservoir | tidal | canal | harbor |
| --- | --- | --- | --- | --- | --- | --- |
| Water state mode | `river` | `fetch` | `fetch` | `tidal` | `canal` | `fetch` |
| Current | One way, downstream | None | None, or release surges | Flood and ebb | None or slight | Tidal if `tide` set |
| Wind against current | By flow | No | No | By tidal stream | No | By stream if bound |
| Flow reason (`flow`) | If bound | No | No | If bound | If bound | No |
| Level reason (`level`) | No | If set | If set | No | No | No |
| Tide reason (`tide`) | No | No | No | Yes | No | If bound |
| Debris warning | Yes, with flow | No | No | Yes, with flow | Yes, with flow | No |
| Course | Heading or polyline | Optional | Optional | Heading or polyline | Heading or polyline | Optional |
| Bank word | bank | shore | shore | bank | bank | shore |
| Default reach word | straight | (fetch text) | (fetch text) | straight | canal | (fetch text) |

Everything else (light, storms, rain, wind and gust limits, fog, cold, alerts, air quality) works the same on every water type.

### 9.2 River

As today. `chopWind` per segment: `e = along + cross_w × cross`, multiplied by `k` from `flow.against` when the wind blows upstream (within 60° of the upstream heading, `cos(rel) <= -0.5`) and the flow is at or above that threshold. The hour's value blends this hour and two before (`blend` 0.5, 0.3, 0.2). Levels at 5, 9 and 13 mph chop wind. Putney: one segment, `cross` 0.4, `against` `[[20000, 1.4], [10000, 1.25]]`, identical numbers.

For new river locations, `against` defaults to the gauge's percentiles (11.3): x1.25 at p65 and x1.4 at p88. At Putney that rule gives exactly 10,000 and 20,000 cfs (p65 10,100 and p88 20,300 rounded down to two significant figures, verified live 2026-10-17). With no flow binding, there is no multiplier and no "against the current" text.

### 9.3 Lake and reservoir: fetch

Chop on open water depends on the wind and how far it has blown over water (fetch). For fetch-limited waves, significant wave height grows with wind speed times the square root of fetch. Carter (1982) gives Hs = 0.0163 × X^0.5 × U10 (X in km, U10 in m/s, Hs in m) (from docs, https://www.vos.noaa.gov/MWL/201512/waveheight.shtml); the SMB form gH/U² = 0.0016 (gF/U²)^0.5 has the same shape (from a search summary of a 2025 preprint, unverified against the Coastal Engineering Manual).

So the app converts wind on open water to an equivalent chop wind at a reference fetch, and keeps the same levels:

```
e = U × clamp( sqrt( F(θ) / refFetchM ), 0.25, 2.0 )
refFetchM = 2000
```

- `θ` is the direction the wind comes from. `F(θ)` is the upwind fetch in metres.
- At 2 km of fetch, `e = U`, so "light chop at 5 mph chop wind" means the same as along the Putney straight. The implied heights at 2 km are about 5, 9 and 13 cm for the 5, 9 and 13 mph levels (computed from Carter 1982).
- The factor at other fetches: 150 m 0.27, 300 m 0.39, 750 m 0.61, 2 km 1.0, 5 km 1.58, 8 km and over 2.0 (computed).
- The cap at 2.0 stands in for duration limits on large lakes; the 3-hour blend handles build-up.

How `F(θ)` is set, simplest first:

1. Size class (the add flow asks "How far is the longest stretch of open water from the course?"): under 500 m = 300 m, 500 m to 1 km = 750 m, 1 to 3 km = 2,000 m, 3 to 8 km = 5,000 m, over 8 km = 10,000 m. Same in every direction.
2. Ellipse: the long axis heading `axis`, `lengthM` and `widthM`. The chord through the middle in direction φ from the axis is `F = 1 / sqrt((cos φ / L)² + (sin φ / W)²)`. For L 3,000 m and W 600 m: 3,000 m along the axis, 1,412 m at 22.5°, 832 m at 45°, 647 m at 67.5°, 600 m across (computed). The full chord, not half, because rowers reach the downwind end. A course polyline on a lake suggests the axis and length.
3. Sixteen measured values `fetchM` (N, NNE, ... NNW), from map data when 02 provides a shoreline adapter, or entered by a curator. The nearest of the 16 directions is used.

```json
"water": { "mode": "fetch", "refFetchM": 2000, "lake": { "axis": 40, "lengthM": 3000, "widthM": 600 }, "fetchM": null }
```

Water state text for fetch mode: "Wind from the SW has about 2.4 km of open water to build waves." or "Wind from the NW crosses only about 600 m of water, so chop stays small." With a course: wind vs course still uses the course segments; chop uses fetch.

Reservoir extras: a `level` binding (lake or reservoir surface level, 02) and optional thresholds `levelLow` and `levelHigh` (caution, in the binding's unit) for docks that ground out or flood. Below-dam locations (Lake Natoma) note "Dam releases can change the current" as launch notes; there is no release adapter in scope.

Water state stays information only on lakes, as on rivers (decision in 11.2).

### 9.4 Tidal river or estuary

Needs a `tide` binding (heights, 02) and ideally `tide_stream` (current predictions). The location's `tide` JSON:

```json
"tide": {
  "floodHeading": 15,
  "unit": "m",
  "streamCaution": 2.0,
  "streamOff": 3.0,
  "minLaunch": null,
  "slackMin": 30,
  "against": [[2.0, 1.4], [1.0, 1.25]]
}
```

- Direction: with `tide_stream`, flood or ebb and speed per hour come from the predictions. With heights only, rising water is flood and falling is ebb, and speed is unknown (no stream reasons, no multiplier, text says "flood" or "ebb" only).
- `floodHeading`: the direction the flood runs, default the course's upstream heading.
- Chop: river formula per segment, with the "against" multiplier when the wind opposes the stream at that hour, by stream speed in knots: x1.25 at 1.0 kn, x1.4 at 2.0 kn (first guesses, unverified).
- Reasons in `assess`: stream at or over `streamCaution` is caution "Tidal stream 2.3 kn"; at or over `streamOff` is stay off. Height under `minLaunch` (when set) is caution "Low water, 0.4 m at the landing". Defaults 2.0 and 3.0 kn are first guesses (unverified); the owner and clubs tune them.
- Slack: within `slackMin` minutes of a stream reversal (or of high and low water when only heights exist). Shown as information: "Slack about 2:40 PM." In a tidal river slack lags high and low water, so the heights-only version says "about".
- A tidal river can also have a flow binding (the Thames has river flow above the tidal limit). Both apply: flow reasons as on a river, stream reasons as above.
- Water state text: "Ebb runs downstream. Wind from the S is against it after 3 PM, so chop steepens."

The Tide view (new tab, `src/render/detail/tide.js`): a week strip by the worst tide level each day; a chart of the rowing window with a height lane (curve, high and low water labeled, the `minLaunch` line dashed), a stream lane (speed with the caution and stay-off lines, flood above zero, ebb below) when stream data exists, and slack windows shaded; a readout; an hour table (Time, Height, Stream, Direction); How this works with the current settings. Facts: "High water 2:14 PM, 4.1 m. Low water 8:40 PM, 0.9 m."

### 9.5 Canal

River formula with no current: `cross` 0.4 by default, no `against` multiplier, no flow reasons unless a flow binding exists. Water word "canal": "Mostly crosswind. It only crosses the width of the canal, so chop stays smaller." Locks and traffic are launch notes. The Montreal Olympic Basin (candidate) fits here.

### 9.6 Harbor

Fetch mode for chop, shore wording, tide reasons only when a tide binding exists. Wakes and traffic are launch notes. Open-sea swell is out of scope; the How this works panel says so: "Swell from open water is not included."

### 9.7 Which tabs show

The `VIEWS` registry in `src/render/detail/index.js` gains an optional `when(loc)` per view. `initRoutes()` builds the tab bar from `VIEWS.filter(v => !v.when || v.when(loc))` and rebuilds it on location change. A hash route to a hidden tab (for example `#river` at a lake) falls back to Now.

| Tab | Shows when | Order |
| --- | --- | --- |
| Now, Week, Wind | always | 1, 2, 3 |
| Tide | `loc.sources.tide` exists | 4 (new) |
| River | a `flow` binding exists (named "River"), or a `level` binding (named "Level") | 5 |
| Storms, Fog, Temperature, Rain, Light, Air | always | 6 to 11 |

`FACTORS` in `src/config.js` gains `{ key: 'tide', name: 'Tide', keys: ['tide'] }` and `{ key: 'level', name: 'Level', keys: ['level'] }`. The `flow` factor's name follows the location ("River"). `TAB` in `src/render/detail/week.js` gains `tide: 'tide'` and `level: 'river'`.

## 10. Course geometry

### 10.1 Forms

```json
{ "kind": "heading", "heading": 15, "reachWord": "straight", "confirmed": false, "note": "Estimate of the reach at Putney Landing." }
```

```json
{
  "kind": "polyline",
  "points": [[42.9607, -72.5219], [42.9702, -72.5170], [42.9810, -72.5191]],
  "names": ["lower straight", "upper straight"],
  "reachWord": "straight",
  "confirmed": true
}
```

```json
{ "kind": "none" }
```

- `heading`: degrees true, 0 to 359, the direction of rowing upstream. On still water, the direction of rowing out from the dock.
- `points`: from the dock outward, upstream for rivers. 2 to 50 points, total length 200 m to 15 km, each point within 20 km of the dock. The first point within 300 m of the dock.
- `names`: optional, one per derived segment, up to 24 chars each, lowercase so they fit mid-sentence.
- `none`: lakes, reservoirs and harbors without a set course. Wind vs course text is replaced by the fetch text; the compass draws the lake.

### 10.2 Segments

`courseSegments(course)` in `src/location.js`:

1. For each pair of points, initial bearing and haversine length.
2. Merge consecutive pairs whose bearings are within 15° of the running segment's length-weighted mean bearing.
3. Each segment: `{ heading, lengthM, fromM, toM, name }`.
4. A `heading` course is one segment of unknown length.

### 10.3 Wind vs course per segment

- For each segment, classify as today: within 60° of the heading is headwind or tailwind; otherwise crosswind off the left or right bank (`relWind(dir, seg.heading) > 0` is the right bank, as now: at Putney, wind from the east of the 15° heading is "off the New Hampshire bank").
- If every segment of 300 m or more has the same class, use today's sentence. Putney (one segment) always does: "Headwind rowing upstream, tailwind coming back." "Crosswind off the New Hampshire bank." "Chop builds along the straight." "Wind against current steepens it."
- Otherwise name at most two phrases: the longest segment and the one with the most chop, in course order. "Headwind on the lower straight, then crosswind off the west bank on the upper straight." Unnamed segments are "from the dock" and "past the bend".
- Chop for the hour is the maximum `e` over segments of 300 m or more (all segments if none is that long). The water state's `axis` is that segment's.
- The Wind view's arrows stay relative to the first segment's heading. The hour table's course column ("Headwind up", "Cross, NH") uses the worst segment.

### 10.4 Bank names

- Stored: `banks.left` and `banks.right` are the sides on your left and right when facing the upstream heading (for still water, facing out). `short` is up to 4 chars for the compass and table cells; `name` is the word in sentences. `word` is "bank" or "shore".
- Generated when `banks` is null: the right side faces `heading + 90`. Its 8-point compass name gives `name: "east"`, `short: "E"`; the left gives the opposite. Text: "Crosswind off the east bank." For Putney's 15° heading the generated names would be west and east; the record stores VT and NH instead.
- Edited in the add flow and by stewards: "Vermont" and "New Hampshire", "Boston side" and "Cambridge side".

### 10.5 The compass graphic

`compassSVG(loc, dir, speed)` in `src/render/parts.js`:

- `heading` course: as today, river bar rotated by the heading. Bank labels come from `banks.*.short`. Today they sit at fixed points (-30, -24) and (30, -24), right for a heading near north only. From phase 1 they are placed at those offsets rotated by the heading, with the text kept upright: `x' = x cos h - y sin h`, `y' = x sin h + y cos h`. For Putney (15°) the labels move about 8 units; this is a visible change and ships in phase 1, not phase 0.
- `polyline` course of 300 m or more: a small map. Points are projected around the dock (`x = Δlon × cos(lat) × 111,320`, `y = Δlat × 110,540` metres), scaled so the farthest point sits at radius 50, drawn as a 6-unit river-colored path with round joins, a dot (r 4) at the dock, a small arrow at the upstream end, north up. Bank labels by the first segment. Wind arrow as today.
- `none` course on a lake with `lake` geometry: the ellipse, rx 50, rotated to `axis`. With only a size class: a circle, no labels.
- `aria-label`: "Wind direction relative to the course".
- Caption: "Wind from SW. River runs SSW, upstream heading 15°." stays for heading courses. Polyline: "Wind from SW. Course heads NNE from the dock, then N." Lake: "Wind from SW across about 2.4 km of open water."

### 10.6 Setting the heading

- Phase 1 curation: the owner uses `scripts/locations/bearing.mjs` between two points on the reach, or draws points for a polyline, and commits the JSON.
- Phase 1 personal override: the Settings Course field stays for `heading` courses ("Upstream heading, degrees"), stored as a per-location override. Hidden for polyline and none courses.
- Phase 3 add flow (12.6): set a direction or draw the course on the map. Suggestions, in order:
  1. The waterway's centerline near the dock (`geometry`, ordered upstream), bearing of the nearest segment.
  2. Map data from discovery (02). In OpenStreetMap, waterway lines are drawn in the direction of flow, so upstream is the reverse (unverified, OSM wiki convention).
  3. The bearing to the nearest upstream main-stem gauge on the same river. For Putney this is 20.6° against the recorded 15° (verified live 2026-10-17). Labeled "a rough hint".
  4. Nothing: the person sets it.
- Every suggestion is shown as "Suggested 21° from the upstream gauge. Check it against the water." The person must confirm or change it; `confirmed` is true only when a person drew or checked it on a map, or a steward verified it.

## 11. Per-location settings and thresholds

### 11.1 Threshold keys and units

| Key | Unit | Blank allowed (turns the level off) |
| --- | --- | --- |
| `windCaution`, `windOff` | mph | no |
| `gustCaution`, `gustOff` | mph | no |
| `rainCaution`, `rainOff` | % | yes |
| `coldCombined` | °F, air plus water | no |
| `flowCaution`, `flowOff` | the flow binding's unit (cfs, m³/s, ft, m) | yes (new: a location without stats starts blank) |
| `aqiCaution`, `aqiOff` | the location's AQI scale | yes |
| `streamCaution`, `streamOff` | knots | yes |
| `minLaunch` | the tide binding's unit | yes |
| `levelLow`, `levelHigh` | the level binding's unit | yes |

Bounds for a location that is not `verified` (phase 3): no limit may be looser than the global defaults (wind 10 and 15 mph, gusts 18 and 25 mph, cold line 100°F, rain chance 60 and 90%, AQI 151 and 201; looser means a higher wind, gust, rain or AQI number and a lower cold line), and no level may be blank, except `flowCaution` and `flowOff` at a location with no flow history (11.3). A stricter limit is fine. `validateLocation()` enforces it on create and on every edit (12.10, 13.1), so one creator cannot publish limits that show Go in 40 mph wind to every visitor. Only a moderator or a steward club admin can loosen a limit, through a reviewed revision (13.5). A verified location is not bound. Putney's record is verified.

Limit basis (phase 1). A limit in a binding's unit (`flowCaution`, `flowOff`, `minLaunch`, `levelLow`, `levelHigh`) means nothing without that binding, so it is stored with it: `basis`, a map `{ flow, tide, level }` of `adapter:ref:unit` strings, for example `usgs-ogc:USGS-01154500:cfs`. It sits beside the numbers in the location's `thresholds`, in a club rule's `limits` (06 6.2) and in a person's overrides for the location (`limitBasis`, synced in 03's `user_settings`, 08 7.5). `effectiveSettings()` applies a limit only while its basis equals the location's current primary binding for that role. Putney's record carries `usgs-ogc:USGS-01154500:cfs`, so its values do not change. `validateLocation()` refuses a flow, tide or level limit without a binding for the role, or whose `basis` names another binding.

When the primary binding for a role changes (a gauge swapped or retired, 15.7; a source edit, 13.2), limits made for the old binding stop applying:

- The location's defaults are recomputed from the new binding's history (11.3), or left blank when there is none.
- A person's limit is ignored and kept. Settings and How this works say "Your flow limits were for the North Walpole gauge. Set them again for this gauge."
- A club rule's limit for that key is ignored, and the club's admins and safety officers get an in-app notice and an email (05 kind `system`): "Your club's flow limit no longer applies at Putney Landing. The gauge changed. Set it again."

Weather values stay in US customary units internally (Open-Meteo is requested in mph, °F and inches, `SRC.wx` today). Display conversion is 07's. Flow, level and tide stay in the source's native unit so a threshold never drifts through rounding.

Decision: Keep internal weather units as mph, °F and inches everywhere and convert only for display.
- Alternative: switch internals to SI and convert Putney's thresholds (risks off-by-rounding changes to Putney).

### 11.2 Defaults by water type and region

| Key | All water types, US | Outside the US (phase 7) |
| --- | --- | --- |
| Wind | 10 / 15 mph | same, shown as 16 / 24 km/h or 4.5 / 6.7 m/s (07 picks) |
| Gusts | 18 / 25 mph | same, converted |
| Rain chance | 60 / 90 % | same |
| Cold line | air plus water under 100°F | same, shown as 20°C: a sum of two temperatures converts with the offset counted twice (07 7.4; 08 K26). Unverified against national rowing guidance; 07 and the owner decide |
| Flow | percentiles (11.3), or blank | same rule, native unit |
| AQI | US AQI 151 / 201 | European AQI: unverified, 02 and 07 decide |
| Tidal stream | 2.0 / 3.0 kn (first guesses) | same |

The same wind and gust limits on every water type, because they are about the crew and the boat. Exposure on open water shows up in the water state.

Decision: Keep water state information only on every water type, as on the river today, and revisit with dock reports (04).
- Alternative: make "Rough water" a caution on lakes, reservoirs and harbors.
- Alternative: lower lake wind defaults to 8 / 13 mph.

### 11.3 Flow defaults from history

`flowDefaults(stats)` in `src/location.js`, with stats from `scripts/locations/flowstats.mjs` (phase 1) or `GET /api/sources/stats` (phase 3):

- Data: daily means for the last 10 years (USGS `daily` collection, `statistic_id=00003`). A single request with `limit=10000` returned all 3,939 days for 01154500 (verified live 2026-10-17). Other agencies by adapter (02).
- Needs at least 1,095 days (3 years). Fewer: no default, flow limits start blank, and Settings says "Not enough history to suggest flow limits. Set your own."
- `flowCaution` = p88, `flowOff` = p95, `against` = `[[p88, 1.4], [p65, 1.25]]`, each rounded down to two significant figures.
- Putney check: p65 10,100, p88 20,300, p95 28,100 round down to 10,000, 20,000 and 28,000, exactly today's values (verified live 2026-10-17).
- Stage gauges: the same rule on daily mean stage, rounded down to 0.1 ft or 0.05 m.
- The Settings note is generated: "Since 2016 the median day is about 6,900 cfs. 20,000 is the top 12% of days, 28,000 the top 5%." Putney keeps its `copy.flowStats` text.

### 11.4 Fog and water temperature defaults

- Fog: `FOG` as now. `loc.fog` may override any number or set `steam: false` (salt water where the water temperature source is unreliable) or `valley: false`.
- Water temperature order: the person's dock reading (Settings) first, then the primary and fallback `water_temp` bindings if the reading is newer than `maxAgeH` (72 h from phase 1), then the monthly fallback for the cold check only, labeled "Typical for October, about 52°F. No live reading." Steam fog never uses the monthly value. Without any of these: the Water fact reads "No water temperature here. Add a dock reading in Settings."

Decision: Use the monthly typical water temperature for the cold check when no live reading exists, labeled as typical.
- Alternative: no cold check without a live or dock reading (today's behavior when the gauge is down).

### 11.5 Effective settings and storage

`effectiveSettings(loc, { club, overrides })` in `src/location.js` returns the merged values and where each came from:

1. `GLOBAL_DEFAULTS` from `src/config.js`.
2. The location's `thresholds`.
3. The club rule overlay, when active (11.7).
4. The viewer's overrides for this location (`rowhether-settings-v2`, synced in phase 2 through 03's `user_settings`).

Output: `S` for `buildModel`, plain values only (phase 0 returns nothing else). The phase 1 Settings dialog adds a map of where each value came from, `{ windCaution: 'location' | 'club' | 'you', ... }`, kept apart from `S` so it never reaches `app.settings` or the suggestion context (08 14.2 P0.5).

Overrides are stored as differences only. When a location's defaults improve, everyone who never changed that value gets the new one. Reset in Settings clears this location's overrides.

### 11.6 Settings dialog changes (`index.html`, `src/settings.js`)

- Built from the location: the flow fieldset only with a flow binding, legend `River flow at ${label}, ${unit}` ("River flow at North Walpole, cfs" for Putney, as today), its note from `copy.flowStats` or 11.3. Tide fieldset for tidal water. Level fieldset with a level binding. Course field for `heading` courses.
- Each input's placeholder shows the location default: "Location default 10". A small line under a changed field: "Your setting. Location default 10."
- The intro note: "Match these to your program, boat class and coach coverage. Saved in this browser for Putney Landing."
- Reset defaults becomes "Use location defaults".
- Validation as today (caution not above stay off, rain 0 to 100, AQI 0 to 500), plus the bounds in 11.1 for a location that is not verified (a field refuses a looser value with "Looser than the standard limit. A moderator can change this after checking the location."). New ranges: stream 0 to 10 kn, flow 0 to 10,000,000.

### 11.7 Club rule overlay (location side)

06-clubs.md defines `club_rules`. The location side exposes:

- `GET /api/locations/:slug` includes `clubs: [{ slug, name, hasRules }]` for public clubs that list this location (phase 5).
- The threshold keys and units in 11.1 are the contract: a club rule uses the same keys, in the location's units. The Worker rejects club rules with keys a location does not support.
- When a signed-in member opens a location where one of their clubs has rules, Settings shows "Use Putney Rowing Club rules here" (on by default for members). The hero and facts are unchanged in form; Settings and How this works panels label each value "Club rule".

Decision: With club rules on, a member's own values can be stricter than the club's but not looser.
- Alternative: the member's values always win, with a "Looser than your club's rule" warning.
- Alternative: club rules replace personal values entirely while on.

## 12. Adding a location (phase 3)

### 12.1 Who

Signed in (03) with a confirmed email and an account at least 24 hours old. Limits: 3 new locations per user per day, 10 per week, counted from `locations.created_by` and `created_at` (indexed). Plus a Workers rate limit binding `LOCATION_LIMIT`, 5 writes a minute per connection, like `REPORT_LIMIT` in `wrangler.jsonc`. Not signed in: "Sign in to add a location. It takes a minute."

### 12.2 Flow overview

`/add`, reached from the picker's "Add a location". Seven steps, one screen each, with Back and Next. The in-progress draft is kept in `localStorage` (`rowhether-add-draft-v1`) on every change, so a reload or a lost connection loses nothing. "Save for later" creates a server `draft`.

### 12.3 Step 1: where you launch

- Map (component and tiles are 07's decision) centered on the device position if permitted, otherwise a search box (geocoder in 02 and 07).
- "Put the pin on the dock or the spot you push off from."
- "Use my location" button: refused if the reported accuracy is worse than 100 m ("Your phone reports a position within 140 m. Move the pin by hand.").
- Coordinates shown to 5 decimals; editable as numbers for people who prefer typing.

Dedupe runs on every pin move (debounced 500 ms): `GET /api/locations?near=lat,lon&radius_km=1&include=draft_own`.

| Nearest existing location | Result |
| --- | --- |
| Within 100 m | Blocked. "Putney Landing is 80 m from your pin." Buttons: "Open Putney Landing", "Suggest a fix to it". |
| 100 to 300 m on the same waterway, or any waterway when the waterway is not chosen yet | Asks for a reason: "Other side of the water", "A separate launch with its own course", "The existing one is in the wrong place" (this one opens an edit suggestion instead). Submitted locations with a reason go to the moderator queue as `published` with a flag (04's `flags`). |
| 300 m to 1 km on the same waterway | Notice: "Nearby: Weld Boathouse, 650 m. Add yours only if it launches somewhere different." |
| Over 1 km | Nothing. |

Boathouse Row is the model case: one location for every boathouse on the row, with clubs attached to it (06).

### 12.4 Step 2: name and basics

- Name (3 to 60). Short name prefilled from the first words up to 16 chars.
- Address preview: "rowhether.com/putney-landing", editable. Checks as you type: format, reserved word, taken (a `GET /api/locations/:slug` 404 means free; an alias counts as taken). Messages: "Use lowercase letters, numbers and hyphens.", "That address is reserved.", "That address is taken."
- Water type, as six labeled choices with one line each: "River: water flows one way", "Lake", "Reservoir: a lake behind a dam", "Tidal river or estuary: the tide changes the water level and current", "Canal", "Harbor".
- Locality, country and region prefilled from reverse geocoding (02), editable.
- Time zone prefilled: the NWS point's `timeZone` in the US (America/New_York for Putney, verified live 2026-10-17), else Open-Meteo `timezone=auto` (unverified: blocked from this sandbox), else `@photostructure/tz-lookup` 11.7.0 in the Worker (CC0, 88 KB unpacked, verified live 2026-10-17 on npm; accuracy near borders unverified). Shown as "Time zone: Eastern Time (America/New_York). Change". Change opens a searchable list from `Intl.supportedValuesOf('timeZone')` (418 zones in Node 22, verified live 2026-10-17).

### 12.5 Step 3: water and sources

Discovery runs (02-data-sources.md, `GET /api/discover?lat=&lon=&water=` (08 K41)). This step shows:

- Waterway cards (3.4) and "New waterway".
- One card per role, with the suggested binding and up to 3 alternatives:

> River flow
> USGS 01154500, Connecticut River at North Walpole, NH.
> 19.7 km away, upstream. Drainage 5,493 sq mi. Latest 2,780 cfs, 20 min ago.
> [Use this] [Pick another] [None]

- Warnings on a card:
  - Different river name: "This gauge is on Mink Brook, not the Connecticut River." Relation `other_water`.
  - Small drainage compared with the main stem (under 25% of the largest candidate on the same river): "This is a small stream. Its flow will not match the main river."
  - No reading in 7 days: not offered. USGS `latest-continuous` returns long-dead sites (USGS-01104615 last reported 2000-10-01, verified live 2026-10-17), so discovery must filter by date.
  - Over 50 km: "Far from the dock. Flow may differ."
  - Stage only: "This gauge reports water level, not flow. Limits will be in feet."
- One question for river flow: "Is there a dam between the gauge and the dock?" Yes, No, Not sure. Stored in the binding note ("Above Vernon dam.") for the River view.
- Alerts: "Official alerts for this point" with the zones it resolves to.
- Weather station: nearest within 40 km, "A measured check on the forecast". Optional.
- Water temperature: a gauge if any within 50 km on the same water; otherwise "No gauge. People can add a dock reading."
- Tidal and harbor: tide station card (required for tidal), stream station card (optional).

When the location joins an existing waterway, its bindings are already filled and marked "Shared with 2 other locations on this water".

### 12.6 Step 4: course

- River, tidal, canal: "Which way is upstream?" (tidal: "Which way does the flood tide run?" defaults to upstream). Two options:
  - "Set the direction": an arrow on the map to rotate, or degrees to type; the suggestion from 10.6 is preselected and labeled.
  - "Draw the course": tap points from the dock along your usual route; shows length and each segment's heading; undo last point.
- Lake, reservoir, harbor: "Draw your usual course, or skip." Then "How far is the longest stretch of open water from the course?" (size class), with "Draw the long axis instead" for the ellipse.
- Banks: generated names shown ("Left facing upstream: west bank. Right: east bank.") with Rename.

### 12.7 Step 5: limits

Shows the defaults from 11.2 and 11.3 with their reasons:

> Flow: caution at 20,000 cfs (the top 12% of days since 2016), stay off at 28,000 (the top 5%).

All editable, within the bounds in 11.1 until the location is verified. Note: "These are the starting limits for everyone at this location. Each rower can still set their own."

### 12.8 Step 6: launch notes

Optional, up to 1,000 chars, plain text, no links (rejected with "Links are not allowed here."). Placeholder: "Floating dock. Park on the gravel lot. A sandbar shows on the east side at low water." Moderated as community text (04).

### 12.9 Step 7: review and publish

A summary of every field and binding, each with Edit. "Publish" calls `POST /api/locations` with `publish: true`. On success, the page goes to `/<slug>` with a note: "Published. It shows as community added until a club or moderator checks it."

### 12.10 Server-side checks on create

In order, stopping at the first failure:

1. Signed in, account age and email (403 `not_allowed`).
2. Rate limits (429 `rate_limited`).
3. JSON shape and every field rule via `validateLocation()` (400 `invalid` with `field`), including the limit bounds of 11.1 while the location is not `verified`.
4. Slug free across `locations` and `location_aliases` (409 `slug_taken`).
5. Dedupe within 100 m (409 `duplicate` with `nearby`); 100 to 300 m without a reason (409 `needs_reason`).
6. Time zone valid; dock point inside the country's bounding box from reverse geocoding when available (400 `invalid`, field `lat`).
7. Each binding's adapter known and ref well formed (400 `invalid`, field `sources[2].ref`). Bindings are not fetched at create time; discovery already checked them.
8. Insert in one D1 batch: the waterway if new, the location, its bindings, a `location_revisions` row (`kind: 'create'`, revision 1, snapshot).

## 13. Edits, revisions, claims, verification, archiving and merging

### 13.1 Who can do what

Site roles are 03's (`user`, `moderator`, `admin`). Steward club admins are 06's club role `admin` on the location's steward club (phase 5).

| Action | Creator | Signed-in user | Steward club admin (5) | Moderator | Admin |
| --- | --- | --- | --- | --- | --- |
| Edit a `published` location directly | yes, except limits, sources and course (suggest) | suggest | yes | yes | yes |
| Edit a `verified` location directly | suggest | suggest | yes | yes | yes |
| Approve or reject suggestions | `published` only | no | yes | yes | yes |
| Change slug | no | no | no | yes | yes |
| Set `copy` | no | no | no | yes | yes |
| Verify | no | no | yes | yes | yes |
| Claim for a club | via club admin | via club admin | n/a | approves | approves |
| Archive | `published`, no other activity | no | yes | yes | yes |
| Restore | no | no | no | yes | yes |
| Merge | no | no | no | yes | yes |
| Hard delete | own drafts | no | no | no | yes |

"Signed-in user" for suggestions means an account at least 7 days old with a confirmed email (03). Limits: 30 suggestions or edits per user per day.

After publishing, the creator edits name, notes and similar text directly. A change to limits, sources or the course is a suggestion that a steward club admin or a moderator approves, never the creator, so one account cannot move the verdict everyone sees.

### 13.2 Edits and suggestions

- Every edit names the revision it was made against: `PATCH /api/locations/:slug` with `baseRevision`.
- Direct edit: the Worker checks `baseRevision` equals `locations.revision`. If not, 409 `conflict` with the current record; the client shows "Someone changed this location since you opened it. Review their change, then try again." If equal, one batch: update the row with `revision + 1`, insert the revision row (`applied`, `changes`, `snapshot`).
- Suggestion: insert a `pending` revision with `base_revision`. Stewards, the creator (for `published`) and moderators see a count on the location page: "1 suggested change". Approving re-applies `changes` to the current record. If a field in `changes` has changed since `base_revision`, the approver sees both values and picks one.
- Pending suggestions older than 30 days become `withdrawn` with note "Expired".
- `changes` format: `{ "course": [{ "kind": "heading", "heading": 15 }, { "kind": "heading", "heading": 18 }], "sources": [[...], [...]] }`. Sources are compared and replaced as a whole list.
- A change that swaps the primary flow, tide or level binding must also carry the new `thresholds` for that role (recomputed by 11.3, or blank), and the approver sees "Limits for the old gauge stop applying, for everyone who set their own and for club rules." before approving (11.1).
- Summaries are required, 1 to 200 chars: "Heading checked on site with a compass: 18°."
- Notification of new suggestions to the steward and creator is 05's.

### 13.3 History

`GET /api/locations/:slug/revisions` lists applied, pending and rejected revisions, newest first. The page "History" (07) shows "Oct 17, 2026. Course heading 15° to 18°. By Sam R." with a View link to the snapshot. Moderators and stewards can restore an old snapshot; that creates a new `restore` revision, nothing is deleted.

### 13.4 Claims (phase 5)

1. A club admin (06) opens the location and taps "Claim for Putney Rowing Club".
2. Form: which club (their admin clubs), a note up to 300 chars ("Our docks. Contact the club email in our profile.").
3. Creates a `pending` revision, `kind: 'claim'`, `changes: { stewardClub: [null, "<club id>"] }`.
4. A moderator checks that the club is real and uses this location (06's club profile, website or email domain) and approves.
5. One steward club at a time. A competing claim stays pending; a moderator decides. Transfer and release are the same revision kind.

### 13.5 Verification

Moderator or steward club admin. A checklist; every box is required:

- The dock point is within 50 m of where boats launch.
- The time zone is right.
- The water type is right.
- The course heading is within 10° of the water, or the course is drawn.
- Each binding is on the right water, has reported in the last 7 days, and its unit is right.
- Limits reviewed.
- Launch notes are accurate and appropriate.

Stored as a `verify` revision with `changes: { checklist: [...], status: ["published", "verified"] }` and sets `verified_by`, `verified_via`, `verified_at`.

### 13.6 Archiving

`POST /api/locations/:slug/archive` with a reason (required, up to 300 chars): "Dock removed in 2026." Sets `status = 'archived'`, `archived_at`, `archived_reason`, revision `archive`. The location leaves near and search. Favorites (03) and alert rules (05) pointing at it show "This location was archived." with a link to nearby locations. Reports and outings stay attached for history.

### 13.7 Merging

Moderators only. `POST /api/locations/:merged/merge` with `{ into: "<survivor slug>", reason }`.

1. Preview (GET with `?preview=1`): counts of what moves: reports, outings, favorites, alert rules, club links, practices.
2. One D1 batch:
   - `UPDATE reports SET location_id = ? WHERE location_id = ?` and the same for `outings`, `practices`, `notify_prefs` (05), club location links (06).
   - Favorites: `INSERT OR IGNORE` the survivor for each user who had the merged one, then delete the merged favorites.
   - `INSERT INTO location_aliases (slug, location_id, reason, created_at)` for the merged slug and every alias it had (repoint those).
   - `UPDATE locations SET status = 'archived', merged_into = ?, archived_at = ?, archived_reason = ?` on the merged row.
   - Revisions on both: `merge`.
3. The merged slug now resolves to the survivor (14.3).

Waterway merges work the same way over `locations.waterway_id`, `hazards.waterway_id` (04) and waterway bindings.

## 14. API

Same origin, JSON, errors as `{ "error": "code", "message": "Human sentence." }`, as `worker/reports.js` does. Auth is 03's `__Host-rw_session` cookie (08 K56). Times are ms since epoch. Phase 3 unless noted.

### 14.1 List near

`GET /api/locations?near=42.96,-72.52&radius_km=50&limit=20`

- `radius_km` default 50, max 300. `limit` default 20, max 50.
- Query: bbox on `lat` (indexed) and `lon`, `status IN ('published', 'verified')`, at most 200 rows, then haversine and sort in the Worker. Across the antimeridian the lon test becomes `lon >= ? OR lon <= ?`.
- `Cache-Control: public, max-age=300`.

```json
{
  "locations": [
    {
      "slug": "putney-landing", "name": "Putney Landing", "shortName": "Putney", "locality": "Putney, VT",
      "waterway": { "id": "connecticut-river-vernon-pool", "name": "Connecticut River" },
      "lat": 42.9607, "lon": -72.5219, "tz": "America/New_York", "waterType": "river",
      "status": "verified", "distanceM": 120
    }
  ]
}
```

Errors: 400 `bad_near` "Use near=lat,lon with numbers.", 400 `bad_radius` "Radius must be 1 to 300 km."

### 14.2 Search

`GET /api/locations?q=putney&limit=20` (optionally with `near` to sort by distance). FTS5 `MATCH` on folded terms with prefix (`putn*`). Same item shape; `distanceM` only with `near`. 400 `bad_query` "Search for at least 2 letters."

### 14.3 Get one

`GET /api/locations/putney-landing`

```json
{
  "location": { "...": "the 6.3 record without sources" },
  "waterway": { "id": "connecticut-river-vernon-pool", "name": "Connecticut River", "reach": "Bellows Falls dam to Vernon dam", "kind": "river", "traffic": null },
  "sources": [ { "role": "flow", "mode": "primary", "adapter": "usgs-ogc", "ref": "USGS-01154500", "inherited": true, "status": "active", "...": "..." } ],
  "clubs": [],
  "pending": 0,
  "canonicalSlug": "putney-landing"
}
```

- An alias returns the survivor's record with `canonicalSlug` set to the survivor; the client replaces the URL with `history.replaceState`.
- `draft`: 404 for everyone but the creator and moderators.
- 404 `not_found` "No location at that address."
- `Cache-Control: public, max-age=60`; the client also keeps its own copy (7.4).

### 14.4 Create

`POST /api/locations`

```json
{
  "location": { "slug": "lake-quinsigamond", "name": "Lake Quinsigamond", "shortName": "Quinsigamond", "...": "..." },
  "waterway": { "id": "lake-quinsigamond" },
  "newWaterway": null,
  "sources": [ { "role": "alerts", "adapter": "nws-alerts", "ref": "point:42.2734,-71.7553" } ],
  "nearbyReason": null,
  "publish": true
}
```

201 `{ "location": {...}, "revision": 1 }`. Errors in order of 12.10: 403 `not_allowed`, 429 `rate_limited`, 400 `invalid` (with `"field"`), 409 `slug_taken`, 409 `duplicate` (with `"nearby": [{ "slug", "name", "distanceM" }]`, message "Putney Landing is 80 m away. Open it, or suggest a fix if it is in the wrong place."), 409 `needs_reason`.

### 14.5 Edit or suggest

`PATCH /api/locations/:slug`

```json
{ "baseRevision": 1, "summary": "Heading checked on site: 18°.", "changes": { "course": { "kind": "heading", "heading": 18, "reachWord": "straight", "confirmed": true } } }
```

- 200 `{ "applied": true, "revision": 2, "location": {...} }` for a direct edit.
- 202 `{ "applied": false, "pendingId": "<uuid>" }` for a suggestion.
- 409 `conflict` `{ "error": "conflict", "message": "Someone changed this location since you opened it.", "revision": 2 }`.
- `sources` in `changes` replaces the location's own bindings (not the waterway's).

### 14.6 History and decisions

- `GET /api/locations/:slug/revisions?before=<revision>&limit=20&status=pending` returns `{ "revisions": [{ "id", "revision", "status", "kind", "summary", "user": { "id", "name" }, "changes", "createdAt", "decidedBy", "decidedAt" }] }`. Snapshots only with `?snapshot=<id>`.
- `POST /api/locations/:slug/revisions/:id/decision` `{ "decision": "approve" | "reject", "note": "..." }` returns 200 `{ "revision": 3 }` or 409 `conflict` when a field changed (with both values).
- `POST /api/locations/:slug/restore` `{ "revision": 1, "summary": "..." }`.

### 14.7 Status changes

- `POST /api/locations/:slug/verify` `{ "checklist": ["dock", "tz", "type", "course", "sources", "limits", "notes"] }`. 400 `incomplete` if any is missing.
- `POST /api/locations/:slug/claim` `{ "club": "putney-rowing-club", "note": "..." }` returns 202 `{ "pendingId" }`. Phase 5.
- `POST /api/locations/:slug/archive` `{ "reason": "..." }`.
- `POST /api/locations/:slug/merge` `{ "into": "survivor-slug", "reason": "..." }`, `?preview=1` for counts.

### 14.8 Waterways

- `GET /api/waterways?near=lat,lon&radius_km=2` returns `{ "waterways": [{ "id", "name", "reach", "kind", "locations": 2, "distanceM": 140 }] }`.
- `GET /api/waterways/:id` returns `{ "waterway": {...}, "locations": [{ "slug", "name", "lat", "lon", "relation": "upstream", "distanceM" }], "sources": [...] }`. `relation` comes from the geometry when present, else from the sign of the displacement along the asking location's upstream heading (`?from=<slug>`).
- `POST /api/waterways` (signed in, from the add flow) `{ "name", "reach", "kind", "country", "regions" }` returns 201. Id generated from the name, deduped with a suffix.
- `PATCH /api/waterways/:id` (moderators, and steward clubs of member locations for `traffic` and `notes`).

### 14.9 Source stats

`GET /api/sources/stats?adapter=usgs-ogc&ref=USGS-01154500&measure=discharge`

```json
{
  "adapter": "usgs-ogc", "ref": "USGS-01154500", "measure": "discharge", "unit": "cfs",
  "from": "2016-01-01", "to": "2026-10-15", "days": 3939,
  "p50": 6910, "p65": 10100, "p88": 20300, "p90": 21900, "p95": 28100,
  "suggested": { "flowCaution": 20000, "flowOff": 28000, "against": [[20000, 1.4], [10000, 1.25]] }
}
```

Cached for 30 days per adapter and ref (08 picks Cache API or KV). 422 `too_short` "Not enough history to suggest flow limits." when under 1,095 days.

### 14.10 Phase 1 static equivalents

| Phase 3 API | Phase 1 static file |
| --- | --- |
| `GET /api/locations?near=` and `?q=` | `/locations/index.json`, filtered and sorted in the browser |
| `GET /api/locations/:slug` | `/locations/<slug>.json` |
| everything else | not available; curation by pull request |

`/api/info` gains `locations: true` when the D1 tables exist, so the client knows which to use.

## 15. Edge cases

### 15.1 Time zone borders

- The location's zone is the dock's zone, chosen in the add flow and editable. Communities that unofficially follow a neighbor's zone pick that zone by hand (unverified example: Phenix City, AL on the Chattahoochee is said to keep Eastern time with Columbus, GA).
- A waterway has no zone. Each location on it shows times in its own zone. Nearby reports from a location in another zone are shown in the viewing location's zone.
- Gauges in another zone: instantaneous values carry offsets and need nothing. Daily means use the binding's `tz` (15.2).
- A dock on a state line: Putney's point resolves to the NH zone and office (6.1). Alerts can bind both banks' zones.

### 15.2 Daily values and gauge zones

`parseFlowDays` places each daily mean at local noon in the binding's `tz` instead of `T16:00:00Z`. USGS monitoring locations carry `time_zone_abbreviation` and `uses_daylight_savings` (EST and Y for 01154500, verified live 2026-10-17); 02's discovery maps these to an IANA zone, defaulting to the location's zone.

### 15.3 Daylight saving time and unusual offsets

- A DST day has 23 or 25 local hours (2026-03-08 and 2026-11-01 in America/New_York, verified live 2026-10-17 with `Intl`). Hourly series are in unix time, so nothing breaks in `buildModel`; the week and light clock axes must use `localMinutes`, not fixed 24-hour arithmetic.
- `clockMin` in `week.js` and `light.js` adds `getUTCMinutes()` to the local hour. At 00:00 UTC that gives 600 instead of 630 for Adelaide, 300 instead of 330 for Kolkata, 1260 instead of 1290 for St. John's, 300 instead of 345 for Kathmandu (verified live 2026-10-17). Fixed by `fmt.localMinutes`.
- `buildModel`'s `h0 = Math.floor(now / HOUR) * HOUR` and `nowPrecip`'s same expression assume local hours start on UTC hours. In a +5:30 zone, Open-Meteo hours may start at :30 UTC (unverified; Open-Meteo is blocked from this sandbox). Fix: find the hour in `m.hours` with `h.t <= now < h.t + HOUR`.
- `planSessions` steps at `Math.floor(t0 / PLAN_STEP) * PLAN_STEP`, which is on UTC half hours. For +5:45 that starts sessions at :15 and :45. Fix: step on local half hours via `localMinutes`.
- Tests at the DST changes for New York and for Sydney (DST ends 2026-04-05).

### 15.4 High latitudes and polar days

SunCalc 1.9.0 returns Invalid Date (NaN) for times that do not happen (verified live 2026-10-17 with suncalc@1.9.0 from npm):

| Place, date | dawn | sunrise | sunset | dusk |
| --- | --- | --- | --- | --- |
| Oslo 59.91 N, Jun 21 | yes | yes | yes | yes |
| Trondheim 63.43 N, Jun 21 | NaN | yes | yes | NaN |
| Fairbanks 64.84 N, Jun 21 | NaN | yes | 00:49 AKDT the next day | NaN |
| Tromsø 69.65 N, Jun 21 | NaN | NaN | NaN | NaN (sun always up) |
| Tromsø, Dec 21 | yes | NaN | NaN | yes (twilight only) |

Today `periodsFor` takes `s.dawn` as the morning's start; with NaN, `hs` comes back empty and the morning period disappears. `rowingHours` returns nothing. `lightAt` happens to work (no dark, twilight outside sunrise to sunset). Rules in `sunFor`:

1. Civil twilight all night (dawn and dusk NaN, sunrise and sunset present): `polar: 'white'`. First light = later of sunrise minus 90 min and `dayWindow[0]` (5:00). Dark never happens. Hours outside sunrise to sunset are twilight.
2. Sun never sets (all NaN and the sun's altitude at solar noon above -0.833°, from `SunCalc.getPosition`): `polar: 'day'`. The rowing day is `dayWindow` (5:00 to 22:00 local, set per location in `daylight`). No light reasons.
3. Sun never rises but twilight happens (sunrise and sunset NaN, dawn and dusk present): `polar: 'twilight'`. Rowing day is dawn to dusk; every hour is twilight (caution, lights). Periods use dusk where they would use sunset.
4. No twilight at all: `polar: 'night'`. Every hour is dark (stay off). The hero says "No daylight today. First light returns Jan 15." found by scanning `sunOn(loc, t)` forward day by day, up to 120 days.
5. Sunset after local midnight (Fairbanks in June): the afternoon period ends at the end of the day's last hour. The minutes after midnight belong to no period.

The Light view's six-month chart draws gaps where a time does not exist, with a note "No sunset from May 20 to Jul 22." found the same way.

### 15.5 Southern hemisphere and the antimeridian

- Nothing in the logic is seasonal by month: fog, cold, light and periods all work from data. The monthly water temperature fallback is per location, so it is already in the right season.
- Negative latitudes pass every check; the compass and bank names are unaffected.
- Near queries across 180°: handled in 14.1. Longitude 180 is stored as -180.
- Lake Karapiro (175.66 E, a UTC+12 or +13 zone) and Lake Burley Griffin are the test locations.

### 15.6 Flow in other units

- Thresholds and readings in the binding's native unit (cfs, m³/s, ft, m); compared without conversion.
- `fmtFlow`: "20,000 cfs", "120 m³/s" (0 decimals at 100 and over, 1 decimal from 10 to 100, 2 under 10), "8.2 ft", "2.45 m".
- A fallback binding in another unit is converted to the primary's unit at parse (1 m³/s = 35.3147 cfs).
- A viewer who prefers the other unit sees converted values with the source unit in How this works (07).

### 15.7 Gauges offline or retired

- Request fails: as today, the last good value is kept and the failure is named under the hero.
- Reading old: the flow fact shows its age as today ("2 hr ago"). Over `staleSwitchH` (6 h) with a fresher fallback: the fallback is used and named ("Using the Wellesley gauge. Waltham has not reported since 3 AM."). Over `maxAgeH` (24 h from phase 1): not used for Go, Caution or Stay off. Fact note: "Last reading 2 days ago, not used for Go, Caution or Stay off." The hero says it too, in its not-checked line: "River flow not checked: the gauge has not reported for 2 days." (`notChecked()`, 07 6.7).
- Health check (phase 3, a daily cron in the Worker; scheduling is 08's): for each active binding, fetch the latest value; set `last_ok_at`, `last_checked_at`. No data for 3 days: `offline`. No data for 30 days: `retired`, and the steward club and moderators are notified (05) with "The North Walpole gauge stopped reporting 30 days ago. Pick a new one for Putney Landing." A retired binding is skipped by `resolveSources`; with no flow binding left, the River tab hides. Limits made for it stop applying (11.1).

### 15.8 Two gauges for one location

| Case | Binding setup | Example |
| --- | --- | --- |
| Different roles | `flow` and `water_temp` on different gauges | Putney: North Walpole and Northfield |
| Primary and spare | `flow` primary plus `flow` fallback | Charles: Waltham primary, Wellesley fallback |
| Flow elsewhere, level here | `flow` primary upstream plus `flow` `info` at the location (stage) | Hartford: Thompsonville flow, Hartford stage |
| Sum of two branches below a confluence | Not supported. Bind the larger branch and note it. | |

Decision: Do not support summing two gauges for now.
- Alternative: add `mode: 'sum'` with a per-gauge travel-time lag, later.

### 15.9 A location with no gauge

No flow reasons, no River tab, no debris warning, no wind-against-current multiplier or text. The River flow fact is left out (today it shows "--" and "USGS gauge unavailable." because Putney always has a gauge; that copy stays for a bound gauge that fails). Steam fog needs a dock reading. Settings hides the flow fieldset. The Water fact: "No water temperature here. Add a dock reading in Settings."

### 15.10 Other cases

- Dock point on land 50 m from the water: fine; the forecast grid is kilometres wide. Verification checks the dock is within 50 m of the launch.
- Two locations, same dock, different courses (a short and a long course from one boathouse): one location with a polyline; segments carry names. Not two locations.
- A location renamed after people saved it: old slug alias; cache keys move on next load (`rowhether-cache-v2:<old>` read once, written to the new slug).
- Record changes while open: the next record refresh (at most daily) re-renders; settings overrides survive because they are keyed by slug and only store differences. A slug rename moves the override entry on first load under the new slug.
- Storage blocked: everything works with location defaults, as today with `DEFAULTS`.

## 16. Tests

### 16.1 New unit tests

`test/location.test.js`:

- `validateLocation`: Putney's file passes. Each rule fails with its field: slug pattern, length 2 and 49, leading hyphen, double hyphen, every reserved word, bad zone (`Mars/Olympus` throws `RangeError`), lat 91, lon 180, unknown water type, two primaries for one role, `points` with 1 or 51 points, a course of 100 m, `copy` key not allowed.
- `slugify`: "Putney Landing" to `putney-landing`; "Bassin olympique, Montréal" to `bassin-olympique-montreal`; 60-char names cut at a hyphen.
- `courseSegments`: a heading course is one segment of 15°; a polyline with a 10° kink merges; a 40° bend splits; lengths within 1 m of haversine.
- Fetch: the ellipse gives 3,000, 1,412, 832, 647 and 600 m at 0, 22.5, 45, 67.5 and 90° for 3,000 by 600 m; factors 0.27, 1.0, 2.0 at 150 m, 2 km, 10 km.
- `autoBanks`: heading 15 gives left west, right east; heading 270 gives left south, right north.
- `resolveSources`: location rows override waterway rows by role; `off` removes the waterway binding; fallback order by priority; retired skipped.
- `effectiveSettings`: precedence and `_from`; blank values kept; club stricter-only rule.
- `flowDefaults`: a fixture of Putney's 3,939 daily values (committed as `test/fixtures/usgs-01154500-daily.json`, about 30 KB) gives 10,000, 20,000, 28,000; under 1,095 days gives null.

`test/format.test.js`:

- `zoneFormat` for New York, London, Adelaide, Kolkata, Kathmandu, Auckland: `dayKey`, `localHour`, `localMinutes` at fixed instants (Kathmandu 345 at 00:00 UTC).
- `setZone` changes what an importer of `hm` sees (live binding).
- `zoneName` with and without `tzLabel`.
- `fmtFlow` for each unit and decimal rule.

`test/storage.test.js` (with a `localStorage` stub):

- Migration from `putney-rowing-*`: overrides stripped of defaults; `''` kept; heading 20 kept, 15 dropped; `saved` set; cache, plan, install and nudge copied; last location set; old keys left; marker set; running twice changes nothing; no old keys means no last location; blocked storage throws nothing.

### 16.2 Changed and added logic tests

- `test/golden.test.js`: equality with the golden files from 8.7.
- `test/logic.test.js`: every `buildModel` call passes `PUTNEY` (loaded from `data/locations/putney-landing.json`); existing expectations unchanged.
- Lake: fetch-mode chop for wind along and across the axis; text says "open water".
- Canal: no multiplier at any flow.
- Tidal: stream against wind raises chop; stream reasons at 2.0 and 3.0 kn; heights-only gives flood and ebb text with no stream reasons; `minLaunch` caution.
- No gauge: no `flow` reasons, `debrisLikely` false, no River tab in `VIEWS.filter`.
- Stale flow: a reading 25 h old is not used; 7 h old with a fresh fallback uses the fallback.
- High latitude: Trondheim June 21 has a morning period starting at 5:00 or sunrise minus 90 min; Tromsø June 21 has periods from 5:00 to 22:00 and no light reasons; Tromsø Dec 21 is all twilight from dawn to dusk; 78 N Dec 21 is all dark with a return date; Fairbanks June 21 afternoon ends at 24:00.
- DST: periods and Week bar positions on 2026-03-08 and 2026-11-01 (New York) and 2026-04-05 (Sydney).
- Half-hour zone: Adelaide fixture, `planSessions` starts on local :00 and :30, Week bars at the right minutes.
- Southern hemisphere: a Sydney June fixture, sunrise and sunset in range.
- Segments: an S-shaped polyline gives a two-phrase `windVsCourse` and chop from the worst segment.

### 16.3 Worker tests (`test/locations.test.js`, stand-in D1 as in `test/reports.test.js`)

- Near: bbox and sort; drafts hidden; archived hidden; antimeridian query.
- Search: prefix match; 1-letter query refused.
- Get: alias returns the survivor and `canonicalSlug`; draft 404 for others.
- Create: every check in 12.10 in order, with the right status and `error` code; one batch writes location, sources and revision 1.
- Patch: direct edit increments revision; stale `baseRevision` gives 409; suggestion gives 202 and a pending row; approve applies; approve over a changed field gives 409 with both values.
- Permissions: the 13.1 matrix, one test per cell that differs from its neighbor.
- Archive and restore; merge moves rows and writes aliases in one batch (a failing statement leaves everything unchanged).
- Rate limits: the 4th create in a day gives 429.
- Stats: 3,939 days gives the suggested values; 1,000 days gives 422.

### 16.4 Build tests

- `npm run build` fails with the file name and field when any `data/` file is invalid.
- `dist/locations/index.json` lists every non-draft file; `dist/putney-landing.html` has the same title, description and Open Graph text as today's `index.html`, with canonical `https://rowhether.com/putney-landing`.
- The precache manifest contains `locations/*.json` and no `<slug>.html` shell.

### 16.5 Browser checks (Playwright, as in CLAUDE.md)

- `/putney-landing` at 390 px light and 1280 px dark, clock pinned to midday and 9 PM: identical to the pre-phase-0 screenshots (compass labels excepted after phase 1).
- An existing install: seed `putney-rowing-settings-v1` with wind caution 12, load `/`: Settings shows 12, no reminder, URL becomes `/putney-landing`.
- A lake location: no River tab; `#river` falls back to Now; compass draws the lake.
- A tidal location: Tide tab after Wind; tapping the chart fills the readout.
- Add flow with discovery stubbed: dedupe block at 80 m, reason at 200 m, publish lands on the new page with the community note.

## 17. Open questions and decisions

Decisions (recommendation first, alternatives after):

Decision: Alerts for Putney stay on the dock point in phase 0, then bind zones VTZ015, VTC025, NHZ011 and NHC005 in phase 1, and fix the footer and CLAUDE.md (the point resolves to GYX and NHZ011, not ALY and VTZ015).
- Alternative: keep the point forever and credit NWS Gray.
- Alternative: move the dock point about 60 m west onto the Vermont shore.

Decision: Curated list as JSON files in `data/`, validated and built into `dist/` and precached; seeded into D1 in phase 3.
- Alternative: bundle records into the JavaScript.
- Alternative: D1 from day one.

Decision: For 90 days after phase 1, a first visit to `/` with nothing stored opens Putney Landing with "Not your water? Pick a location."
- Alternative: the picker at once, Putney first.
- Alternative: `/` stays Putney forever; the picker lives at `/locations`.

Decision: Internal weather units stay mph, °F and inches; flow, level and tide stay in source units; conversion only for display.
- Alternative: SI internally.

Decision: Water state stays information only on every water type until dock reports can tune it.
- Alternative: "Rough water" is a caution on lakes, reservoirs and harbors.
- Alternative: lower lake wind defaults to 8 / 13 mph.

Decision: The monthly typical water temperature feeds the cold check (labeled typical) when no live reading exists, never steam fog.
- Alternative: no cold check without a live or dock reading.

Decision: With club rules on, members can be stricter than the club but not looser.
- Alternative: personal values win, with a warning.
- Alternative: club rules replace personal values entirely.

Decision: Flow defaults for new locations are p88 (caution) and p95 (stay off) of 10 years of daily means, with wind-against-current steps at p65 and p88, rounded down to two significant figures. This reproduces Putney's values exactly.
- Alternative: p90 and p95 (21,000 and 28,000 at Putney).
- Alternative: no flow defaults; every location starts blank.

Decision: Do not support summing two gauges.
- Alternative: `mode: 'sum'` with travel-time lags, later.

Decision: A heading set by a person before phase 0 stays as a personal per-location override for heading courses only.
- Alternative: drop personal headings and make the course a location fact only, changed through edits.

Decision: Bank labels on the compass rotate with the river from phase 1 (a small visible change for Putney).
- Alternative: keep fixed label positions for courses within 30° of north.

Decision: Limits at a location that is not verified cannot be looser than the global defaults, and the creator cannot change limits, sources or the course after publishing except by suggestion (11.1, 13.1). When they differ from the defaults, the hero says so (07 6.7).
- Alternative: any limits, with only the "Community added" badge as a sign.

Decision: Community locations go live as `published` with a "Community added" note, with moderator review after the fact; reasons for near-duplicates go to the queue.
- Alternative: every new location waits for moderator approval before anyone else can see it.

Open questions:

- Putney's course heading of 15° is still an estimate. Confirm on site; with a polyline if the reach bends.
- The Vernon pool limits (Bellows Falls dam to Vernon dam) for the waterway record are from general knowledge. Confirm.
- Tidal stream thresholds (2.0 and 3.0 kn) and multipliers (1.0 and 2.0 kn) are first guesses. Who has local knowledge (the Thames, the Potomac, Oakland)?
- The app name and manifest (`Putney Row` today) for a many-location app: 07's decision; affects the install bar copy and iOS home screen names that cannot change after install.
- Which candidate locations in 7.5 should ship in phase 1, and which clubs can confirm their dock points.
- Whether the lake fetch reference of 2 km and the levels should differ for lakes once reports exist.
- European AQI thresholds and the cold line outside the US (phase 7).
- Whether Hartford should be `river` or `tidal` (tidal influence at low flow).

Unverified facts used above, to check before building:

- Open-Meteo `timezone=auto` behavior and hour alignment in half-hour zones (Open-Meteo was not reachable from the planning sandbox).
- Workbox glob semantics for `*/index.html`.
- `wrangler d1 export` support for FTS5 tables.
- OSM waterway direction convention.
- Accuracy of `@photostructure/tz-lookup` near borders.
- The SMB fetch formula's exact form in the Coastal Engineering Manual (Carter 1982 is from the NOAA VOS page).
- Phenix City, AL keeping Eastern time.
- USGS-01646500's discharge series and the tide stations for the tidal candidates.
