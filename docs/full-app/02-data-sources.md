# Data sources

Goal: every number the app shows, for any launch site in the world, comes from a named source that is chosen once per location, fetched the same way the Putney sources are fetched today, and fails on its own without taking the rest of the screen down.

Scope of this file:

- Every data need, by region (global, US, Canada, UK, rest of Europe, Australia and NZ), with endpoints, keys, CORS, terms, units, update rates and the fields we read.
- What real rowing locations get from those sources today, from live requests.
- The source adapter interface that replaces `SRC` in `src/config.js` and `PARSE` in `src/data.js`.
- Discovery: how a new location finds its alerts, stations, gauges, forecast point and tide stations, and what the person adding it sees.
- Default flow thresholds from history.
- Open-Meteo's free tier, and what changes if RoWhether becomes commercial.
- Attribution, and what the app does when a region has no source for something.

Out of scope here: the `locations` and `waterways` tables, water types and the course heading model (01-locations.md), the add-a-location screens (07-product-and-ux.md), the server engine that uses these sources for alerts (05-notifications.md), and the canonical D1 schema (08-architecture.md, which takes the tables below from this file).

## How facts are marked

- **verified live 2026-10-17**: I sent the request from the planning sandbox with `Origin: https://rowhether.com` and read the status, the `Access-Control-Allow-Origin` header and the body.
- **from docs (URL)**: read from the provider's own documentation today.
- **unverified**: not checked. Treat as a lead, not a fact.

Some hosts could not be reached from the sandbox. `api.open-meteo.com` timed out on every attempt (5 tries, 15 to 40 s each). The app already calls it from browsers in production every 10 minutes, so its CORS behavior is known from production, but I could not re-check it today. Other Open-Meteo hosts (air quality, geocoding, flood, marine, ensemble) answered normally. `overpass-api.de` reset the connection and two public Overpass mirrors returned 500. The Australian Bureau of Meteorology and WaterNSW returned 403 pages that block automated access.

## Summary of findings

1. **A global baseline works with no regional source at all.** Open-Meteo forecast, air quality (US AQI is computed worldwide: verified live 2026-10-17 for Henley, Toronto, Vancouver, Sydney, Auckland and Ghent), the four-model comparison, `timezone=auto`, and SunCalc give every location the forecast, the verdict, wind against the course, fog, precipitation, light and air quality.
2. **US regional sources are all keyless with `Access-Control-Allow-Origin: *`** (verified live 2026-10-17): NWS points, alerts, stations and observations; USGS Water Data OGC API; USGS NLDI; NWPS; NOAA CO-OPS data and metadata APIs. The browser can keep calling them directly, as today.
3. **Canada and much of Europe are also keyless with CORS:** ECCC GeoMet OGC API (hydrometric, alerts, SWOB observations), CHS tides (IWLS), UK Environment Agency flood monitoring and hydrology, France Hub'Eau, Germany PEGELONLINE (verified live 2026-10-17).
4. **Some warning feeds have no CORS and need the Worker:** Met Office warnings RSS, MeteoAlarm, MetService CAP (CORS only for `about.metservice.com`), and aviationweather.gov METAR (verified live 2026-10-17). Australia's BoM blocks automated access entirely.
5. **Gauge discovery by river network works.** NLDI mainstem navigation from the Putney dock finds exactly the two gauges the app uses today: North Walpole 25.1 km upstream for flow, Northfield 39.9 km downstream for water temperature (verified live 2026-10-17).
6. **Nearest-station logic is wrong for tides.** At the Charles (Weld), Boathouse Row and Montlake Cut, the nearest NOAA tide station is 1.7 to 6.1 km away, but all three launches sit above a dam or lock where the tide does not reach. Tidal water must be a question the person answers, never an automatic binding.
7. **Alerts by point can miss the water crews row on.** At Thompson Boat Center the point is outside marine zone ANZ535, which starts at Key Bridge a few hundred meters downstream. On 2026-10-17 a Small Craft Advisory was active for ANZ535 and the point query returned nothing (verified live 2026-10-17). Discovery must offer nearby marine zones.
8. **The percentile method reproduces Putney's flow defaults.** Daily mean flow at North Walpole since 2016-01-01: median 6,910, 90th percentile 21,820, 95th percentile 28,010 cfs (3,939 days, verified live 2026-10-17). The README defaults are 20,000 and 28,000, with a median of about 6,900.
9. **NWS resolves the Putney dock to GYX, not ALY.** `/points/42.9607,-72.5219` returns office GYX, grid 3,13, forecast zone NHZ011 and county NHC005 (verified live 2026-10-17). CLAUDE.md says ALY 111,85 and VTZ015. The app only uses alerts by point, so nothing breaks, but discovery will store GYX values and the docs need a correction.
10. **USGS has moved its OGC landing page to `/ogcapi/v1`.** `/ogcapi/v0` still answers identically (same `api-version: 1.10.3`) (verified live 2026-10-17). Plan a switch.
11. **Server-side Open-Meteo calls are fragile on the free tier.** Limits are per IP. From the sandbox's shared egress IP the historical forecast API answered `429 Daily API request limit exceeded` (verified live 2026-10-17). Worker calls share Cloudflare egress IPs in the same way.

## Principles for data sources

- **Browser first for keyless CORS sources.** This is the current hard constraint and it stays: the browser fetches Open-Meteo, NWS, USGS, NWPS and NOAA directly. It keeps Worker cost and load at zero, and free-tier limits apply per viewer, not to the site.
- **The Worker handles four kinds of work only:** anything that needs a key; sources without CORS; discovery and history jobs (many dependent calls whose result is stored and shared); and server-side engines (notifications in 05-notifications.md, health checks below).
- **Each source fails on its own.** `fetchAll()` keeps `Promise.allSettled`. The last good value stays and the failure is named under the hero, as now.
- **Absent is not the same as failed.** A source that does not exist for a region is never reported as a failure, and never reads as "no concern". It is stated where that factor is explained (see Graceful degradation), and in one quiet line under the hero when the factor could change the level (07 6.7).
- **Internal units stay as they are:** mph, °F, inches, cfs, and °C for water temperature from gauges (converted by `cToF` in `src/format.js`). Parsers convert foreign units on the way in (m³/s, L/s, km/h, knots, meters). Display units are a separate layer (07-product-and-ux.md). This keeps every threshold, test and rule in `src/logic.js` unchanged.

Decision: keep US units as the internal canonical units and convert in parsers and formatters. Recommended, because `src/logic.js`, `DEFAULTS`, `WATER`, `FOG` and every test use them. Alternative: move to SI internally, which touches every threshold and test for no user-visible gain.

## Needs by region

One row per need. Cells name the recommended source; the source cards below give details. "Worker" means the browser cannot call it directly. "None" means no source was found.

| Need | Global | US | Canada | UK | Rest of Europe | Australia and NZ |
| --- | --- | --- | --- | --- | --- | --- |
| Forecast and current | Open-Meteo forecast | same (best match uses HRRR) | same | same (best match uses UKMO 2 km) | same (ICON D2, AROME, KNMI by country) | same (global models only) |
| Alerts and warnings | None | NWS alerts by point plus marine zones | ECCC weather-alerts | EA flood warnings; Met Office warnings (Worker) | MeteoAlarm (Worker) | NZ: MetService CAP (Worker). AU: none |
| Measured observations | METAR via aviationweather.gov (Worker) | NWS station latest | ECCC SWOB | METAR (Worker) | METAR (Worker) | METAR (Worker) |
| River flow and stage | GloFAS via Open-Meteo flood (modeled, large rivers only) | USGS OGC latest-continuous, continuous | ECCC hydrometric-realtime | EA flood-monitoring readings | France Hub'Eau, Germany PEGELONLINE, others GloFAS | GloFAS; AU state agencies unverified |
| Water temperature | Open-Meteo marine SST (coastal only); Settings reading | USGS 00010; CO-OPS water_temperature | None (Settings) | None (Settings) | None (Settings) | marine SST if coastal |
| River forecast | GloFAS daily (modeled) | NWPS stageflow | None | None | None | None |
| Tides and tidal currents | Open-Meteo marine sea level (not for navigation) | CO-OPS predictions, water level, currents; NWPS tide forecast | CHS IWLS | None (UKHO needs a key, unverified) | None | None |
| Air quality | Open-Meteo air quality (CAMS), US AQI | same | same; AQHI later | same; DAQI later | same; EAQI later | same |
| Model comparison | Open-Meteo, 4 global models | same | same | same | same | same |
| Sun times | SunCalc (bundled) | same | same | same | same | same |
| Place search | own locations list, then Open-Meteo geocoding | same | same | same | same | same |
| Reverse geocoding | Nominatim (Worker, at add time) | same | same | same | same | same |
| Time zone | NWS points (US) or Open-Meteo `timezone=auto` | NWS points | Open-Meteo | Open-Meteo | Open-Meteo | Open-Meteo |
| Waterway geometry | OSM via Overpass (Worker, add time) | NHDPlus flowlines via NLDI | OSM | OSM | OSM | OSM |
| Gauges on the same river | None | NLDI mainstem navigation | bbox plus name match | EA stations by `riverName` | Hub'Eau `libelle_cours_eau`, PEGELONLINE `water` | None |
| Historical flow | GloFAS reanalysis since 1984 | USGS daily collection | ECCC hydrometric-daily-mean | EA hydrology daily mean | Hub'Eau (unverified) | None |
| Map tiles | OpenFreeMap vector tiles | same | same | same | same | same |

## Source cards

Each card lists: adapter key (used in code; stored rows hold the provider key, such as `usgs-ogc`, and `bindingsFor(loc)` derives these fetchers from it, 08 K3), endpoint template, key, CORS, limits and terms, units, update frequency, the fields we read, and status.

### Open-Meteo forecast (`om-forecast`, `om-models`)

- Endpoint: `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=...&hourly=...&daily=...&wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch&timezone={tz}&timeformat=unixtime&forecast_days=7`. The variable lists stay exactly as in `SRC.wx` and `SRC.models` today.
- Key: none on the free tier. CORS: `*` (production behavior; the host timed out from the sandbox, so not re-checked today). The commercial host `customer-api.open-meteo.com` answered `401 {"error":true,"reason":"API key required. Please add &apikey= to the URL."}` with `Access-Control-Allow-Origin: *` (verified live 2026-10-17).
- Limits and terms: non-commercial only; "Less than 10'000 API calls per day, 5'000 per hour and 600 per minute"; 300,000 a month; data CC BY 4.0; "You must include a link next to any location Open-Meteo data are displayed" (from docs, https://open-meteo.com/en/terms and https://open-meteo.com/en/licence). A request with more than 10 variables, or more than 2 weeks, counts as more than one call: "2 weeks of data with 15 weather variables will be calculated as 1.5 API calls" (from docs, https://open-meteo.com/en/pricing). No uptime guarantee (same page).
- Model selection: `best_match` adds regional models: HRRR in North America, UKMO 2 km in the UK and Ireland, ICON D2 in central Europe, AROME in France, KNMI HARMONIE in the Netherlands and Belgium, MET Nordic in Scandinavia; elsewhere global models only (from docs, https://open-meteo.com/en/docs). The docs do not list BOM ACCESS as a best-match component.
- Units: as requested (mph, °F, inch); `kn` and `ms` also exist for wind (from docs).
- Update: hourly for GFS and HRRR, 3-hourly ICON, 6-hourly ECMWF and GEM (from docs).
- Fields read: unchanged from `buildModel()` in `src/logic.js`.
- `timezone=auto` resolves the zone from the coordinates (from docs). Verified live 2026-10-17 on the air quality host: Henley `Europe/London`, Toronto `America/Toronto`, Vancouver `America/Vancouver`, Sydney `Australia/Sydney`, Auckland `Pacific/Auckland`, Ghent `Europe/Brussels`.

### Open-Meteo air quality (`om-aq`)

- Endpoint: `https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}&hourly=us_aqi,pm2_5&timezone={tz}&timeformat=unixtime&forecast_days=5` (as `SRC.aq`).
- Key: none. CORS: `*` (verified live 2026-10-17). Terms as above. Source is Copernicus CAMS.
- Fields: `hourly.us_aqi`, `hourly.pm2_5`. `european_aqi` is also available everywhere (verified live 2026-10-17).

### Open-Meteo flood, GloFAS (`om-flood`)

- Endpoint: `https://flood-api.open-meteo.com/v1/flood?latitude={lat}&longitude={lon}&daily=river_discharge,river_discharge_median,river_discharge_max&past_days=3&forecast_days=7`.
- Key: none. CORS: `*` (verified live 2026-10-17).
- Resolution 0.05° (about 5 km); it "returns river discharge data from the largest river in a 5 km area", which "might not be selected correctly"; daily m³/s; forecast up to 210 days; reanalysis from 1984; forecast updated daily (from docs, https://open-meteo.com/en/docs/flood-api).
- Quality check against a gauge: at the Putney cell on 2026-10-17 GloFAS gave 290 m³/s (about 10,240 cfs) while the North Walpole gauge read 4,300 cfs (verified live 2026-10-17). Day to day it is far off. Its own climatology is close, though: 10-year median 214 m³/s (7,550 cfs), 90th percentile 559 (19,755 cfs), 95th 732 (25,844 cfs), against the gauge's 6,910, 21,820 and 28,010 (verified live 2026-10-17). Use it only against its own percentiles, only on large rivers, and label it as modeled.
- Small rivers and estuaries return meaningless values: Sydney's Parramatta River 0.41 m³/s, Henley 2.56 m³/s (verified live 2026-10-17).

### Open-Meteo marine (`om-marine`)

- Endpoint: `https://marine-api.open-meteo.com/v1/marine?latitude={lat}&longitude={lon}&hourly=sea_surface_temperature,sea_level_height_msl&timezone={tz}&timeformat=unixtime&forecast_days=3&cell_selection=sea`.
- Key: none. CORS: `*` (verified live 2026-10-17).
- `sea_level_height_msl` "accounts for ocean tides", datum is mean sea level, "may be completely unreliable further inland", "not suitable for coastal navigation". SST 0.08° (about 8 km), 6-hourly (from docs, https://open-meteo.com/en/docs/marine-weather-api).
- Inland points return nulls (Potomac at Georgetown, Henley). With `cell_selection=sea` the cell snaps away from shore: Coal Harbour moved about 6 km west, Parramatta about 16 km to the ocean (verified live 2026-10-17). Accept only when the snapped cell is within 10 km and the water type is coastal or harbor.

### Open-Meteo geocoding (`om-geocode`)

- Endpoint: `https://geocoding-api.open-meteo.com/v1/search?name={q}&count=5&language=en&format=json` plus optional `countryCode=US`.
- Key: none. CORS: `*` (verified live 2026-10-17).
- Returns towns from GeoNames with `latitude`, `longitude`, `timezone`, `admin1`, `country_code`, `population`. It does not find boathouses: "Weld Boathouse" returned no results; "Putney" with `countryCode=US` returned Georgia, Vermont, Kentucky, West Virginia and Connecticut (verified live 2026-10-17).

### NWS (`nws-alerts`, `nws-obs`; `nws-points` for discovery)

- Points: `https://api.weather.gov/points/{lat},{lon}`. Fields: `cwa`, `gridId`, `gridX`, `gridY`, `forecastZone`, `county`, `fireWeatherZone`, `timeZone`, `observationStations`, `relativeLocation`, `astronomicalData` (verified live 2026-10-17).
- Stations: `https://api.weather.gov/gridpoints/{wfo}/{x},{y}/stations?limit=10`, each with `stationIdentifier`, `name` and `distance.value` in meters (verified live 2026-10-17).
- Observation: `https://api.weather.gov/stations/{id}/observations/latest`, units `wmoUnit:degC`, `wmoUnit:km_h-1`, `wmoUnit:m`. `Cache-Control: public, max-age=19, s-maxage=300` (verified live 2026-10-17). Non-airport stations can lack fields: SEAW1 in Seattle had no `textDescription` and no visibility.
- Alerts: `https://api.weather.gov/alerts/active?point={lat},{lon}` (as today) and `https://api.weather.gov/alerts/active?zone={id},{id}` (comma list works; verified live 2026-10-17). Zones for a point: `https://api.weather.gov/zones?point={lat},{lon}` returns public, county, fire and, over marine water, `coastal` zones (verified live 2026-10-17).
- Key: none. CORS: `*` on all of the above (verified live 2026-10-17).
- Terms: "A User Agent is required to identify your application"; "The rate limit is not public information, but allows a generous amount for typical use", retry "typically within 5 seconds"; "intended to be open data, free to use for any purpose" (from docs, https://www.weather.gov/documentation/services-web-api). Browsers send their own User-Agent; the Worker sends `RoWhether/1.0 (+https://rowhether.com; <owner contact>)`.

### USGS Water Data OGC API (`usgs-latest`, `usgs-recent`, `usgs-daily`, `usgs-history`)

- Base: `https://api.waterdata.usgs.gov/ogcapi/v0/collections/{collection}/items`. The root now links to `/ogcapi/v1`, and v1 returns the same bodies (verified live 2026-10-17).
- Collections used: `latest-continuous`, `continuous`, `daily`, `time-series-metadata`, `monitoring-locations` (all present, verified live 2026-10-17).
- Latest: `latest-continuous/items?monitoring_location_id={ids}&parameter_code=00060,00065,00010&f=json`. Fields: `monitoring_location_id`, `parameter_code`, `time`, `value` (a string), `unit_of_measure` (`ft^3/s`), `approval_status`.
- Parameter codes: 00060 discharge (cfs), 00065 gage height (ft), 00010 water temperature (°C). Later: 00062 reservoir elevation (unverified for our use), 72255 mean water velocity (unverified).
- Discovery: `time-series-metadata/items?monitoring_location_id={ids}&parameter_code=00060,00065,00010&computation_period_identifier=Points&f=json&limit=500&properties=monitoring_location_id,parameter_code,begin,end`. `end` tells whether a series is still active. `bbox=` also works (48 series near the Charles, verified live 2026-10-17).
- Location details: `monitoring-locations/items?id={ids}&f=json` gives `monitoring_location_name`, `drainage_area`, `site_type_code`, `time_zone_abbreviation` (verified live 2026-10-17).
- History: `daily/items?monitoring_location_id={id}&parameter_code=00060&statistic_id=00003&time={from}/{to}&limit=10000&properties=time,value&skipGeometry=true&f=json`. 3,939 rows in one page, 783 KB, 1.3 s. Rows are **not** in date order (first row 2017-02-16, last 2020-07-19), so parsers must sort (verified live 2026-10-17). The existing `parseFlowDays` already sorts.
- Statistics API (beta): `https://api.waterdata.usgs.gov/statistics/v0/observationNormals?monitoring_location_id={id}&parameter_code=00060&normal_type=MOY&computation_type=percentile&country_code=US` returns month-of-year percentiles 5, 10, 25, 50, 75, 90, 95 from approved data. It needs `country_code=US` (without it: `400 Bad request`). CORS echoes the origin with credentials (verified live 2026-10-17). "Under active beta development and subject to change" (from docs, the OpenAPI at `/statistics/v0/openapi.json`).
- Key: optional. "Providing your own key means you can make more requests per hour"; pass `api_key` or `X-Api-Key`; numbers appear in `X-RateLimit-Limit` (from docs, https://api.waterdata.usgs.gov/docs/ogcapi/keys/). Keyless responses carried no rate limit headers (verified live 2026-10-17). The anonymous hourly limit is unpublished.
- CORS: `*` on the OGC API (verified live 2026-10-17). Data is public domain US Government work (unverified wording).

### USGS NLDI (`nldi`, discovery only)

- Snap: `https://api.water.usgs.gov/nldi/linked-data/hydrolocation?coords=POINT({lon}%20{lat})&f=json` returns the NHDPlus `comid`, `measure` (percent from the downstream end of the flowline) and the snapped point. It took 3 to 7 s and returned 502 on 2 of 5 calls. Fallback: `.../comid/position?coords=POINT({lon}%20{lat})&f=json`, fast (about 0.5 s) but without a measure (verified live 2026-10-17).
- Navigate: `.../comid/{comid}/navigation/{UM|DM}/flowlines?distance={km}&f=json` returns flowlines in path order with geometry. `.../navigation/{UM|DM}/nwissite?distance={km}&f=json` returns sites with `identifier`, `name`, `comid`, `measure` and `mainstem` (a geoconnex URI) but no distance (verified live 2026-10-17).
- Lessons from the samples:
  - Sites on the start flowline appear in both UM and DM results. Compare the site's `measure` with the start measure to place it.
  - DM navigation leaves the river at a confluence: from Boathouse Row it reaches the Delaware at Wilmington. The `mainstem` URI separates them (Schuylkill `.../mainstems/2122873`, Delaware `.../mainstems/2122629`).
  - UM through a lake follows the largest inflow: from Montlake Cut it reaches Issaquah Creek 54.7 km away.
  - Many NLDI sites are inactive (seeps, old water quality sites): 17 upstream of Putney, 2 with active series.
- Key: none. CORS: `*` (verified live 2026-10-17). Rate limits: none published (unverified).

### NOAA NWPS (`nwps-forecast`, `nwps-tide`)

- Gauges by bbox: `https://api.water.noaa.gov/nwps/v1/gauges?bbox.xmin={w}&bbox.ymin={s}&bbox.xmax={e}&bbox.ymax={n}&srid=EPSG_4326`. Fields: `lid`, `name`, `latitude`, `longitude`, `rfc`, `wfo`, `pedts.forecast`, `status`. No USGS id in the list (verified live 2026-10-17).
- Gauge: `https://api.water.noaa.gov/nwps/v1/gauges/{lid}` adds `usgsId`, `timeZone`, `flood.categories` (stage and flow for action, minor, moderate, major), `upstreamLid`, `downstreamLid`, `inService` (verified live 2026-10-17). WLPN3 has `usgsId` 01154500 and action flow 75,661 cfs.
- Forecast: `https://api.water.noaa.gov/nwps/v1/gauges/{lid}/stageflow/forecast` with `issuedTime`, `primaryName`, `primaryUnits`, `secondaryName`, `secondaryUnits`, `data[]` of `{validTime, primary, secondary}`. Missing values are -999. A gauge with no forecast returns `issuedTime: "0001-01-01T00:00:00Z"` and no data (WLTM3, Charles at Waltham). GTND2, Potomac at Georgetown, is a tidal point: `primaryName` "Tide Height", 72 hourly points, flow -999 (verified live 2026-10-17).
- Key: none. CORS: `*` (verified live 2026-10-17).

### NOAA CO-OPS (`coops-tide`, `coops-level`, `coops-temp`, `coops-currents`)

- Station lists: `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type={waterlevels|tidepredictions|currentpredictions}`. Sizes: 302 water level stations (777 KB), 3,502 tide prediction stations, 4,499 current prediction stations (verified live 2026-10-17). No proximity filter, so the Worker caches the lists for 7 days.
- Tide prediction station fields: `id`, `name`, `lat`, `lng`, `type` (`R` reference or `S` subordinate), `reference_id`. Current station fields: `id`, `name`, `type` (`H`, `S`, `W`), `currbin`, `depth`.
- Data: `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station={id}&product={predictions|water_level|water_temperature|currents_predictions}&datum=MLLW&units=english&time_zone=gmt&format=json&application=RoWhether&...`.
  - `predictions` with `interval=hilo&date=today&range=48` gives `{t, v, type: H|L}`; times are `YYYY-MM-DD HH:mm` in GMT.
  - `water_level` with `date=latest` gives `{t, v, s, f, q}`.
  - `water_temperature` with `date=latest` gives `{t, v}` in °F. Washington 8594900 read 68.0 °F.
  - `currents_predictions` with `interval=MAX_SLACK` gives `{Type: flood|ebb|slack, Time, Velocity_Major (knots), meanFloodDir, meanEbbDir}`. A subordinate station returned the same max and slack events when asked for `interval=60`.
  - A missing product returns **HTTP 200** with `{"error":{"message":"No data was found..."}}` (Boston water temperature). Parsers must check for `error` (all verified live 2026-10-17).
- Key: none. CORS: `*` (verified live 2026-10-17). Range limits per request (for example 31 days of 6-minute data) are unverified.

### aviationweather.gov METAR (`metar-obs`, Worker)

- Endpoint: `https://aviationweather.gov/api/data/metar?ids={ICAO}&format=json`. Fields: `icaoId`, `obsTime` (unix seconds), `temp` (°C), `wspd` and `wgst` (knots), `wdir` (degrees or `VRB`), `visib` (statute miles, `10+` or `6+`), `rawOb`. Station search: `.../stationinfo?bbox={s},{w},{n},{e}&format=json` (verified live 2026-10-17 for EGLL, CYTZ, YSSY, KEEN).
- Key: none. **No CORS** (verified live 2026-10-17); the docs say "Cross-origin resource sharing is not permitted", "All requests are rate limited to 100 requests per minute", and to set a custom user agent (from docs, https://aviationweather.gov/data/api/).
- Use: the measured comparison outside the US, through the Worker with a 5-minute edge cache per station.

### Environment and Climate Change Canada (`eccc-alerts`, `eccc-hydro`, `eccc-hydro-daily`, `eccc-obs`)

- Base: `https://api.weather.gc.ca/collections/{id}/items?f=json`. 104 collections, including `hydrometric-stations`, `hydrometric-realtime`, `hydrometric-daily-mean`, `weather-alerts`, `swob-realtime`, `aqhi-forecasts-realtime`, `marineweather-realtime` (verified live 2026-10-17).
- Stations: `hydrometric-stations/items?bbox={w},{s},{e},{n}` gives `STATION_NUMBER`, `STATION_NAME`, `STATUS_EN` (Active or Discontinued), `REAL_TIME` (1 or 0), `DRAINAGE_AREA_GROSS`.
- Realtime: `hydrometric-realtime/items?STATION_NUMBER={n}&sortby=-DATETIME&limit=600` gives `DATETIME`, `LEVEL` (m), `DISCHARGE` (m³/s) every 5 minutes. Humber River at Weston: 2.66 m³/s.
- Daily: `hydrometric-daily-mean/items?STATION_NUMBER={n}&datetime=2016-01-01/2025-12-31&limit=10000&properties=DATE,DISCHARGE,LEVEL&skipGeometry=true` returned 3,288 rows in 0.7 s.
- Alerts: `weather-alerts/items?bbox={lon-0.01},{lat-0.01},{lon+0.01},{lat+0.01}` gives `alert_type` (warning, watch, advisory, statement), `alert_name_en`, `alert_text_en`, `risk_colour_en`, `validity_datetime`, `event_end_datetime`, `expiration_datetime`, `feature_name_en`. A frost advisory for the City of Toronto came back.
- Observations: `swob-realtime/items?bbox=...&sortby=-date_tm-value&limit=20` gives `stn_nam-value`, `air_temp` (°C), wind fields in km/h (verified live 2026-10-17 for TORONTO CITY).
- Key: none. CORS: `*` (all verified live 2026-10-17).
- Licence: "Environment and Climate Change Canada Data Services End-use Licence"; attribution "Contains information licenced under the Data Server End-use Licence of Environment and Climate Change Canada"; alerts must be reproduced "without altering its content or intent" (from docs, https://eccc-msc.github.io/open-data/licence/readme_en/). Rate limits not stated.

### Canadian Hydrographic Service IWLS (`chs-tide`)

- Stations: `https://api-iwls.dfo-mpo.gc.ca/api/v1/stations` (1,576 stations, 852 KB) or `?code={code}`. Each has `id`, `code`, `officialName`, `latitude`, `longitude`, `operating`, `timeSeries[].code` (`wlo` observed, `wlp` predictions, `wlp-hilo`).
- Data: `https://api-iwls.dfo-mpo.gc.ca/api/v1/stations/{id}/data?time-series-code=wlp-hilo&from={iso}&to={iso}` gives `{eventDate, value}` in meters. Vancouver 07735 returned four events for 2026-10-17.
- Key: none. CORS: `*` (verified live 2026-10-17). Terms unverified.

### UK Environment Agency (`ea-level`, `ea-floods`, `ea-hydrology`)

- Stations: `https://environment.data.gov.uk/flood-monitoring/id/stations?lat={lat}&long={lon}&dist={km}&parameter={level|flow}&riverName={exact}`. Fields: `stationReference`, `label`, `riverName`, `lat`, `long`, `status`, `measures[]` with `parameter` and `qualifier` (Stage, Downstream Stage).
- Readings: `https://environment.data.gov.uk/flood-monitoring/id/stations/{ref}/readings?latest` and `?since={iso}` give `{dateTime, measure, value}` (m for level, m³/s for flow).
- Flood warnings: `https://environment.data.gov.uk/flood-monitoring/id/floods?lat={lat}&long={lon}&dist=5`. `severityLevel` 1 Severe Flood Warning, 2 Flood Warning, 3 Flood Alert, 4 no longer in force (from docs, https://environment.data.gov.uk/flood-monitoring/doc/reference).
- Hydrology (history): `https://environment.data.gov.uk/hydrology/id/stations?lat=&long=&dist=&observedProperty=waterFlow`, then `https://environment.data.gov.uk/hydrology/id/measures/{guid}-flow-m-86400-m3s-qualified/readings?mineq-date={from}&_limit=4000` gives daily means `{date, value, quality, completeness}`. Reading 2200TH has data from 1992-08-19 (verified live 2026-10-17).
- Key: none. CORS: `*` (verified live 2026-10-17).
- Terms: Open Government Licence v3.0; attribution "this uses Environment Agency flood and river level data from the real-time data API (Beta)"; readings "updated every 15 minutes"; "issue a single call every 15 mins" for bulk use (from docs, URL above).

### Met Office warnings (`metoffice-warnings`, Worker)

- Endpoint: `https://www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/{region}` (for example `se`). Atom XML. **No CORS** (verified live 2026-10-17).
- The site-specific DataHub forecast API needs a key (unverified). We do not need it: Open-Meteo's best match already includes UKMO 2 km.
- Terms for the RSS feed: unverified. Region codes and boundaries: unverified.

### MeteoAlarm (`meteoalarm`, Worker)

- Endpoint: `https://feeds.meteoalarm.org/api/v1/warnings/feeds-{country}` (for example `united-kingdom`, `belgium`). JSON of CAP alerts with `info[].area[].areaDesc`, `polygon` or `geocode` (NUTS or EMMA_ID), `event`, `severity`, `effective`, `expires`, `awareness_level` in parameters (verified live 2026-10-17: 5 KB for the UK, 36 KB for Belgium).
- **No CORS** (verified live 2026-10-17). Terms of reuse: unverified (the terms page did not render).

### France Hub'Eau and Germany PEGELONLINE (`hubeau-hydro`, `pegel-hydro`)

- Hub'Eau stations: `https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations?latitude={lat}&longitude={lon}&distance={km}&en_service=true&format=json`. Realtime: `.../hydrometrie/observations_tr?code_entite={station}&grandeur_hydro=Q&size=200`. `resultat_obs` for Q is in L/s (the Seine at Paris read 114,000, which is 114 m³/s, consistent with docs, unverified unit statement). HTTP 206 with cursor paging. CORS `*` (verified live 2026-10-17).
- PEGELONLINE: `https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations.json?latitude={lat}&longitude={lon}&radius={km}&includeTimeseries=true&includeCurrentMeasurement=true` and `.../stations/{shortname}/{W|Q}/measurements.json?start=P1D`. W in cm, Q in m³/s. Köln Rhein: W 55 cm, Q 593 m³/s. CORS `*` (verified live 2026-10-17). History depth: unverified.

### MetService New Zealand (`metservice-warnings`, Worker)

- Endpoint: `https://alerts.metservice.com/cap/rss` (RSS of CAP alerts). Licensed "Creative Commons BY 4.0". CORS is `http://about.metservice.com` only, so the Worker must fetch it (verified live 2026-10-17).

### Australian Bureau of Meteorology (not used)

- `www.bom.gov.au` warnings XML and the Water Data Online KiWIS service returned 403 with "The Bureau of Meteorology website does not support web scraping", pointing to an anonymous FTP channel under the default copyright terms and a paid Registered User service (verified live 2026-10-17).
- The anonymous FTP channel would need TCP sockets from the Worker, and its terms are unverified. WaterNSW realtime data also returned 403 from the sandbox (verified live 2026-10-17). Victorian and Queensland services: unverified.

### Place search, reverse geocoding and map tiles

- **Nominatim** `https://nominatim.openstreetmap.org/search?q=...&format=jsonv2` and `/reverse?lat=&lon=&format=jsonv2&zoom=14`. CORS `*`. With a plain library User-Agent it returned 403 "Access denied"; with a browser User-Agent and Referer it returned 200 and found "Weld Boathouse" as `leisure=boathouse` (verified live 2026-10-17). Policy: "an absolute maximum of 1 request per second", the limit is "per website/application" so "the sum of traffic by all your users should not exceed the limits", results "must be cached", and no client-side autocomplete (from docs, https://operations.osmfoundation.org/policies/nominatim/).
- **Photon** `https://photon.komoot.io/api/?q=...&limit=5` and `/reverse?lat=&lon=`. CORS `*`. Found Weld Boathouse; reverse gave "Memorial Drive, Cambridge" (verified live 2026-10-17). Policy: "please be fair, extensive usage will be throttled", no availability guarantee (from docs, https://photon.komoot.io/).
- **Overpass** `https://overpass-api.de/api/interpreter`: unreachable from the sandbox. Query shape (unverified): `[out:json][timeout:25];way(around:300,{lat},{lon})["waterway"~"river|canal"];out geom tags;`.
- **OSM standard tiles** `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. CORS `*`, `Cache-Control: max-age=92850` (verified live 2026-10-17). Policy: attribution "© OpenStreetMap contributors" on the map, a valid Referer, no prefetch or offline use, "no SLA", "We may block access, without notice" (from docs, https://operations.osmfoundation.org/policies/tiles/).
- **OpenFreeMap** style `https://tiles.openfreemap.org/styles/liberty`, TileJSON `https://tiles.openfreemap.org/planet`, glyphs and sprites on the same host. CORS `*` (verified live 2026-10-17). Free, no key, commercial use allowed, attribution "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" (from docs, https://openfreemap.org/).
- Libraries: `maplibre-gl` 6.14.0 (28 MB unpacked on npm, published 2026-10-11) and `leaflet` 1.9.4 (verified live 2026-10-17 with `npm view`). Bundle sizes after build: unverified.

## Sample locations: what each gets

Live requests on 2026-10-17. Distances along the river come from summing NLDI flowline lengths; "straight" is great-circle distance. Coordinates for Toronto, Vancouver and Sydney are approximate club positions, not checked on a map.

| Location | Forecast, AQ, models | Alerts | Measured obs | Flow | Water temp | River forecast | Tide | Missing or wrong |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Putney Landing, VT (42.9607, -72.5219), control | Yes | NWS by point (GYX, NHZ011) | KEEN, 21.5 km | USGS 01154500 North Walpole, 25.1 km up by river (19.7 km straight) | USGS 01161280 near Northfield, 39.9 km down by river (31.1 km straight) | NWPS WLPN3 | Not tidal | Nothing. Matches today's bindings. |
| Weld Boathouse, Charles River, Cambridge (42.3698, -71.1217) | Yes | NWS (BOX 69,101, MAZ014) | KBOS 9.7 km, KBED 17.5 km | USGS 01104500 Waltham, 11.7 km up | None on the mainstem | WLTM3 exists but has no forecast | Not tidal (above the Charles River Dam). Nearest CO-OPS, Boston, 6.1 km: must not bind | Basin level is dam-controlled; stage gauges at First St (11.2 km down) and the dam. Flow matters less than wind here. |
| Boathouse Row, Schuylkill, Philadelphia (39.9695, -75.1871) | Yes | NWS (PHI 49,79, PAZ071) | KPHL 10.3 km | USGS 01474500 at Philadelphia (Fairmount Dam), just downstream on the same flowline | USGS 01474500 has 00010 | NWPS PADP1 (Schuylkill at Philadelphia), match by `usgsId` unverified | Not tidal (above Fairmount Dam). Nearest tide prediction station, Market Street Bridge, 1.7 km: must not bind | DM navigation reaches the Delaware at 52.3 km; the mainstem filter drops it. |
| Thompson Boat Center, Potomac, Washington DC (38.9007, -77.0590), tidal | Yes | NWS by point (LWX 96,71, DCZ001) **misses marine zone ANZ535** | KDCA 5.0 km | USGS 01646500 Little Falls, 8.6 km up | USGS 01646500 has 00010; CO-OPS 8594900 Washington 4.4 km, 68.0 °F | NWPS BRKM2 (`usgsId` 01646500, verified) | CO-OPS 8594900 predictions; NWPS GTND2 hourly tide forecast; currents ACT5906 Hains Point 6.4 km (subordinate) | Stage at Wisconsin Ave (01647600) is tidal. Small Craft Advisory active on ANZ535 was not returned by point. |
| Montlake Cut and Lake Union, Seattle (47.6475, -122.3051) | Yes | NWS (SEW 126,70, WAZ315) | SEAW1 5.2 km lacks fields; KBFI 12.0 km complete | None. Lake level controlled at the Ballard Locks. UM navigation runs to Issaquah Creek, 54.7 km: reject | None | None | Not tidal (above the Ballard Locks). CO-OPS Seattle 5.6 km is Puget Sound: must not bind | Water type lake: flow factor off; water temperature needs a dock reading. |
| Henley-on-Thames, UK (51.5375, -0.9025) | Yes (UKMO in best match, from docs) | EA flood warnings within 5 km; Met Office warnings via Worker | METAR: EGUB Benson, 16.4 km | EA flow 2200TH Reading (upstream, 9.6 km straight), 2604TH Maidenhead (downstream, 13.9 km); lock stages Marsh Lock 2495TH (1.5 km), Hambleden 2496TH | None | None | Not tidal (tidal limit is Teddington, unverified) | The Thames "stream warning" boards that clubs use are not in any API found (unverified). |
| Argonaut RC, Lake Ontario, Toronto (43.6365, -79.4632) | Yes | ECCC weather-alerts by bbox | SWOB TORONTO CITY, METAR CYTZ | Lake: none. Humber River 02HC003 nearby is a different water body | None | None | Not tidal | Lake water type. Flow off. Lake level 02HC048 exists but is not realtime. |
| Vancouver Rowing Club, Coal Harbour (49.2905, -123.1250) | Yes | ECCC weather-alerts | METAR CYVR (unverified distance) | Salt water: none | Open-Meteo marine SST 13.6 °C from a cell about 6 km west | None | CHS IWLS 07735 Vancouver | Tidal currents in Coal Harbour: no source found. |
| Parramatta River, Sydney (-33.8410, 151.1200), no regional sources | Yes, `Australia/Sydney` | None (BoM blocked) | METAR YSSY via Worker | GloFAS 0.41 m³/s, meaningless: reject | Marine SST cell 16 km offshore: reject | None | Tidal estuary, no keyless tide source found | What a location with no regional sources gets, see below. |

**A location with no regional sources** (Sydney, Auckland, most of the world) gets:

- The forecast, the verdict, the hero, On the water now, Day by day, Week, Wind, Rain, Fog, Temperature, Light and Air: everything that comes from Open-Meteo, the model comparison and SunCalc.
- No official alerts. The Storms tab and the Alerts factor say so (copy below).
- No measured comparison, unless a METAR station is within 30 km (via the Worker, Phase 7).
- No flow, unless the river is large enough for GloFAS and the person confirms it.
- No water temperature, unless the Settings dock reading is set or the location is coastal with a sea cell within 10 km.
- No tides.

## The source adapter interface

### Files

- `src/sources/index.js`: the registry `ADAPTERS` (key to adapter), `SLOTS`, `bindingsFor(loc)`, `labelFor(slot, binding)`, `attributionFor(loc)`.
- One module per provider, each exporting its adapters: `src/sources/openmeteo.js`, `nws.js`, `usgs.js`, `nwps.js`, `coops.js`, `eccc.js`, `chs.js`, `ea.js`, `hubeau.js`, `pegel.js`, `worker-proxied.js` (adapters whose `url()` points at our own `/api/...`).
- The parsers that live in `src/data.js` today (`parseAlerts`, `parseObs`, `parseRiver`, `parseFlow`, `parseFlowDays`, `parseFlowForecast`, `parseAQ`, `parseModels`, `alertLevel`, `speedToMph`) move into these modules unchanged in behavior. `src/data.js` keeps `fetchJSON` and a new `fetchAll(loc)`.
- These modules are pure: no DOM, no storage. The Worker imports the same files for discovery, health checks and the notification engine (05-notifications.md), so a parser is written once.
- Worker-only code: `worker/discover.js`, `worker/flowstats.js`, `worker/sourceproxy.js`, `worker/sourcehealth.js`.

### Slots

A slot is what the rest of the app reads from `app.data`. The nine current keys stay, with the same shapes, so `src/logic.js` and the renderers keep working.

| Slot | Normalized shape | Units | Today's parser |
| --- | --- | --- | --- |
| `wx` | Open-Meteo forecast JSON as returned | mph, °F, inch, unix s | `d => d` |
| `alerts` | `[{event, headline, desc, instr, start, end, lvl}]` | ms; `lvl` 1 or 2 | `parseAlerts` |
| `obs` | `{t, tempF, wind, gust, dir, text}` | ms, °F, mph, degrees | `parseObs` |
| `river` | `{flow: {v, t}, waterC: {v, t}, stage: {v, t}}`, each optional | cfs, °C, ft | `parseRiver` |
| `flow` | `[{t, v}]` sorted, last 48 h | ms, cfs | `parseFlow` |
| `flowDays` | `[{t, v}]` sorted, 30 days, `t` at local noon | ms, cfs | `parseFlowDays` |
| `flowFcst` | `{issued, pts: [{t, v}]}` | ms, cfs | `parseFlowForecast` |
| `aq` | `[{t, aqi, pm25}]` | ms, US AQI, µg/m³ | `parseAQ` |
| `models` | `{ids, hours: [{t, wind: [], precip: []}]}` | ms, mph, inch | `parseModels` |
| `waterTemp` (new) | `{v, t, dist}` | °C, ms, km | new |
| `tide` (new) | `{station, datum, events: [{t, h, type}], series: [{t, h}]}` | ms, ft; `type` `H` or `L` | new |
| `tideStream` (new) | `{station, events: [{t, type, kn, dir}]}` | ms, knots, degrees; `type` flood, ebb or slack | new |
| `level` (new) | `[{t, v}]` sorted, lake or reservoir surface level | ms, ft or m | new |

`waterTemp()` in `src/logic.js` reads, in order: the Settings dock reading (`S.waterOverride`), then `river.waterC`, then the `waterTemp` slot. Slot names follow 01 (`tideStream`, `level`; 08 K4). `tide` and `tideStream` are information only in this plan (see the decision at the end).

### Adapter

```js
/**
 * @typedef {Object} Binding          // one row of location_sources, as the client sees it
 * @property {string} slot            // 'wx', 'alerts', ...
 * @property {string} adapter         // adapter key, e.g. 'usgs-latest'
 * @property {Object} params          // adapter-specific, e.g. { flow: 'USGS-01154500', temp: 'USGS-01161280' }
 * @property {string} label           // for "Could not reach ..." (today's SOURCE_NAMES value)
 * @property {string} [note]          // curated sentence for the fact detail, e.g. gauge position
 *
 * @typedef {Object} Adapter
 * @property {string} key             // stable fetcher key; stored rows hold the provider key (08 K3)
 * @property {string} slot            // the slot it fills
 * @property {string[]} regions       // ISO 3166-1 alpha-2 codes, or ['*'] for global
 * @property {'browser'|'worker'} via // 'worker' means url() points at our own /api/...
 * @property {number} refreshMs       // how often the browser refetches while visible
 * @property {number} staleMs         // after this, the last good value is dropped and the slot reads as missing (flow and water temperature: the location's maxAgeH decides use, and staleMs only names the source as stale)
 * @property {(ctx: DiscoverCtx) => Promise<Candidate[]|null>} discover
 *                                    // Worker only; null when the adapter does not apply here
 * @property {(b: Binding, loc: Location, now: number) => string} url
 * @property {(json: any, b: Binding, loc: Location) => any} parse
 *                                    // returns the slot's normalized shape; throws on unusable data
 * @property {(b: Binding) => {text: string, href: string}} attribution
 * @property {(b: Binding) => string} label
 *
 * @typedef {Object} DiscoverCtx
 * @property {number} lat, lon
 * @property {string} country         // from reverse geocoding
 * @property {string} tz
 * @property {string} waterType       // from 01-locations.md
 * @property {Object} nldi            // snap and navigation results, US only (shared across adapters)
 * @property {(url: string, opts?: Object) => Promise<any>} get   // counted, with a timeout and the app User-Agent
 */
```

`Location` here is the object `GET /api/locations/:slug` returns (owned by 01-locations.md). The fields used by adapters are `slug`, `lat`, `lon`, `tz`, `country`, `waterType` and `sources` (the array of bindings).

### fetchAll

```js
// src/data.js
export async function fetchAll(loc, now = Date.now(), due = () => true) {
  const bs = loc.sources.filter(b => ADAPTERS[b.adapter] && due(b));
  const res = await Promise.allSettled(bs.map(b => {
    const a = ADAPTERS[b.adapter];
    return fetchJSON(a.url(b, loc, now)).then(j => a.parse(j, b, loc));
  }));
  // Same { data, errors } shape as today, keyed by slot.
}
```

- `due(b)` lets slots refresh at their own pace: `flowDays` every 6 hours, `models` and `aq` every hour, the rest every 10 minutes. Today all nine refetch every 10 minutes; moving `aq` and `models` to hourly cuts Open-Meteo calls per open phone by about 30 percent (estimate from the weights below).
- Two bindings may share a slot only with `rank` 0 and 1 (primary and fallback). The fallback is fetched only when the primary fails.
- `src/render/hero.js` changes `Object.keys(SRC).every(...)` to every active slot of the location, and builds the "Could not reach" note from `labelFor(slot, binding)` instead of `SOURCE_NAMES`.

### Today's SRC keys mapped to adapters

The Putney bindings below must produce byte-identical URLs and identical labels (a Phase 0 test).

| `SRC` key | Adapter | Putney params | Label (from `SOURCE_NAMES`) | Note text stays in the binding |
| --- | --- | --- | --- | --- |
| `wx` | `om-forecast` | `{}` | the forecast | |
| `alerts` | `nws-alerts` | `{ point: '42.9607,-72.5219' }` | NWS alerts | |
| `obs` | `nws-obs` | `{ station: 'KEEN' }` | Keene observations | |
| `river` | `usgs-latest` | `{ flow: 'USGS-01154500', temp: 'USGS-01161280' }` | USGS river gauges | "North Walpole gauge below Bellows Falls dam, about 16 river miles upstream." and "Nearest main-stem gauge, near Northfield, MA, about 19 mi downstream." (from `src/render/now.js` and `src/render/detail/temperature.js`) |
| `flow` | `usgs-recent` | `{ id: 'USGS-01154500' }` | USGS flow history | |
| `flowDays` | `usgs-daily` | `{ id: 'USGS-01154500' }` | USGS daily flow | |
| `flowFcst` | `nwps-forecast` | `{ lid: 'WLPN3' }` | the NWS river forecast | |
| `aq` | `om-aq` | `{}` | the air quality forecast | |
| `models` | `om-models` | `{ models: ['gfs_seamless', 'ecmwf_ifs025', 'gem_seamless', 'icon_seamless'] }` | the model comparison | |

Code changes that come with this:

- `src/config.js`: remove `GAUGE_FLOW`, `GAUGE_TEMP`, `NWS_GAUGE`, `SRC` and `SOURCE_NAMES`. `LOC` goes to the location record (01-locations.md). `MODELS` stays as the default list.
- `parseRiver(d, b)` reads gauge ids from `b.params` instead of `GAUGE_FLOW` and `GAUGE_TEMP`, and also accepts `00065` into `stage`.
- `parseFlowDays(d, b, loc)` puts each daily point at local noon in `loc.tz` instead of the fixed `T16:00:00Z`. Compute the offset with `Intl.DateTimeFormat(..., { timeZone: loc.tz, timeZoneName: 'longOffset' })` for that date.
- `parseFlowForecast` treats `issuedTime` starting with `0001-` as no forecast and returns `{ issued: null, pts: [] }`.
- The distance sentences in `src/render/now.js` and `src/render/detail/temperature.js` come from `binding.note`. For discovered gauges the note is generated: "Connecticut River at North Walpole, NH, 16 river miles upstream." The Putney Northfield note says "19 mi" (straight line) while the river distance is 24.8 mi; see open questions.
- `USGS_OGC = 'https://api.waterdata.usgs.gov/ogcapi/v0'` becomes one constant in `src/sources/usgs.js`.

### Adapter catalog

| Key | Slot | Regions | Via | refreshMs | staleMs | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| `om-forecast` | wx | * | browser | 10 min | 24 h | 0 |
| `om-aq` | aq | * | browser | 60 min | 24 h | 0 |
| `om-models` | models | * | browser | 60 min | 24 h | 0 |
| `nws-alerts` | alerts | US | browser | 10 min | 1 h | 0 |
| `nws-obs` | obs | US | browser | 10 min | 3 h | 0 |
| `usgs-latest` | river | US | browser | 10 min | 24 h | 0 |
| `usgs-recent` | flow | US | browser | 10 min | 24 h | 0 |
| `usgs-daily` | flowDays | US | browser | 6 h | 7 days | 0 |
| `nwps-forecast` | flowFcst | US | browser | 60 min | 24 h | 0 |
| `nwps-tide` | tide | US | browser | 60 min | 24 h | 1 |
| `coops-tide` | tide | US | browser | 6 h | 7 days | 1 |
| `coops-temp` | waterTemp | US | browser | 10 min | 72 h | 1 |
| `coops-currents` | current | US | browser | 6 h | 7 days | 1 |
| `om-flood` | flow, flowDays, flowFcst | * | browser | 6 h | 3 days | 1 |
| `om-marine` | waterTemp | * | browser | 6 h | 3 days | 1 |
| `eccc-alerts` | alerts | CA | browser | 10 min | 1 h | 7 |
| `eccc-hydro` | river, flow | CA | browser | 10 min | 24 h | 7 |
| `eccc-hydro-daily` | flowDays | CA | browser | 6 h | 7 days | 7 |
| `eccc-obs` | obs | CA | browser | 10 min | 3 h | 7 |
| `chs-tide` | tide | CA | browser | 6 h | 7 days | 7 |
| `ea-level` | river, flow | GB | browser | 15 min | 24 h | 7 |
| `ea-floods` | alerts | GB | browser | 15 min | 1 h | 7 |
| `hubeau-hydro` | river, flow | FR | browser | 10 min | 24 h | 7 |
| `pegel-hydro` | river, flow | DE | browser | 15 min | 24 h | 7 |
| `metar-obs` | obs | * | worker | 10 min | 3 h | 7 |
| `metoffice-warnings` | alerts | GB | worker | 10 min | 1 h | 7 |
| `meteoalarm` | alerts | EU members of MeteoAlarm | worker | 10 min | 1 h | 7 |
| `metservice-warnings` | alerts | NZ | worker | 10 min | 1 h | 7 |

`staleMs` closes a gap in today's cache: the last good value is kept forever. A flow reading from four days ago should not drive the verdict. One rule with 01's `maxAgeH` (01 15.7, 08 K9): for flow and water temperature, `maxAgeH` decides whether a value is used for the verdict (24 h and 72 h from phase 1), and `staleMs` only decides when the hero names the source as stale, so it is never shorter than `maxAgeH`. The copy is 07 6.7's: "River flow not checked: the gauge has not reported for 2 days." For every other slot, past `staleMs` the slot reads as missing.

### Alert levels by source

Today `alertLevel()` maps NWS event names to 1 or 2. Each alerts adapter sets `lvl` itself:

| Source | Level 2 (stay off) | Level 1 (caution) | Ignored |
| --- | --- | --- | --- |
| NWS | Current regex in `alertLevel()` plus `Small Craft Advisory`, `Gale Warning`, `Storm Warning`, `Special Marine Warning` (see decision) | Everything else | none |
| ECCC | `alert_type` warning for thunderstorm, wind, fog, winter storm, rainfall, or `risk_colour_en` red | warning of other kinds, watch, advisory | statement |
| EA floods | `severityLevel` 1 or 2 | 3 | 4 |
| Met Office | amber, red | yellow | none |
| MeteoAlarm | awareness level 3 (orange) or 4 (red) | 2 (yellow) | 1 (green) |
| MetService CAP | `severity` Severe or Extreme | Moderate | Minor |

Decision: treat NWS `Small Craft Advisory`, `Gale Warning`, `Storm Warning` and `Special Marine Warning` as stay off. Recommended, because they mean sustained wind of 18 knots (about 21 mph) or more on open water (threshold unverified), above every default wind line. Alternative: caution, leaving wind settings to decide.

## location_sources table

New table. Belongs in the canonical schema in 08-architecture.md. Holds every binding for every location, curated or discovered.

08 4.3 merges this proposal with 01's table (K2): 01's `location_id` or `waterway_id`, `role`, `mode`, `priority` and `ref`, plus this table's `origin`, `fail_count`, `confirmed_by`, `confirmed_at` and statuses (`active`, `suggested`, `offline`, `retired`, `rejected`). The canonical statement is in 08 4.4.

| Column | Type | Constraint | Meaning |
| --- | --- | --- | --- |
| `id` | TEXT | PRIMARY KEY | `crypto.randomUUID()` |
| `location_slug` | TEXT | NOT NULL, REFERENCES locations(slug) ON DELETE CASCADE | |
| `slot` | TEXT | NOT NULL, CHECK in ('wx','alerts','obs','river','flow','flowDays','flowFcst','aq','models','waterTemp','tide','current') | |
| `adapter` | TEXT | NOT NULL | adapter key |
| `params` | TEXT | NOT NULL, CHECK (json_valid(params)) | JSON object |
| `label` | TEXT | NOT NULL, length 1 to 80 | for the failure note |
| `note` | TEXT | NULL, length up to 200 | position sentence for the fact detail |
| `rank` | INTEGER | NOT NULL DEFAULT 0, CHECK (rank IN (0, 1)) | 0 primary, 1 fallback |
| `status` | TEXT | NOT NULL DEFAULT 'active', CHECK in ('active','suggested','rejected','stale') | |
| `origin` | TEXT | NOT NULL, CHECK in ('curated','discovered','edited') | |
| `river_km` | REAL | NULL | along the river, positive |
| `direction` | TEXT | NULL, CHECK in ('up','down','at') | relative to the launch |
| `straight_km` | REAL | NULL | great-circle distance |
| `confirmed_by` | TEXT | NULL, REFERENCES users(id) | who confirmed it in /add or /mod |
| `confirmed_at` | INTEGER | NULL | ms |
| `last_ok_at` | INTEGER | NULL | ms, from the health check |
| `fail_count` | INTEGER | NOT NULL DEFAULT 0 | consecutive failed health checks |
| `created_at` | INTEGER | NOT NULL | ms |
| `updated_at` | INTEGER | NOT NULL | ms |

Indexes: `UNIQUE (location_slug, slot, rank) WHERE status = 'active'` (a partial unique index); `INDEX (location_slug, status)`.

Two more new tables:

`flow_stats` (not created: 08 K6 keeps statistics in the flow binding's `stats`, 01 4.4, and caches computed results in `source_cache` for 30 days): one row per location and gauge, the history behind the default flow lines.

| Column | Type | Constraint |
| --- | --- | --- |
| `id` | TEXT | PRIMARY KEY |
| `location_slug` | TEXT | NOT NULL, REFERENCES locations(slug) ON DELETE CASCADE |
| `adapter` | TEXT | NOT NULL (`usgs-history`, `eccc-hydro-daily`, `ea-hydrology`, `om-flood`) |
| `gauge` | TEXT | NOT NULL (for example `USGS-01154500`, or `glofas:42.975,-72.525`) |
| `date_from` | TEXT | NOT NULL, `YYYY-MM-DD` |
| `date_to` | TEXT | NOT NULL |
| `days` | INTEGER | NOT NULL, CHECK (days > 0) |
| `p50` | REAL | NOT NULL, cfs |
| `p90` | REAL | NOT NULL, cfs |
| `p95` | REAL | NOT NULL, cfs |
| `p99` | REAL | NOT NULL, cfs |
| `max` | REAL | NOT NULL, cfs |
| `flood_action` | REAL | NULL, cfs, from NWPS `flood.categories.action.flow` when above 0 |
| `modeled` | INTEGER | NOT NULL DEFAULT 0, CHECK (modeled IN (0, 1)) |
| `computed_at` | INTEGER | NOT NULL, ms |

Index: `UNIQUE (location_slug, gauge)`.

`source_cache`: Worker-side cache for large reference lists (CO-OPS and IWLS station lists) and for discovery results.

| Column | Type | Constraint |
| --- | --- | --- |
| `key` | TEXT | PRIMARY KEY (for example `coops:tidepredictions`, `discover:42.96070,-72.52190:river`) |
| `body` | TEXT | NOT NULL, JSON |
| `fetched_at` | INTEGER | NOT NULL, ms |
| `expires_at` | INTEGER | NOT NULL, ms |

Decision: keep large station lists in D1 `source_cache`. Recommended, because the Worker already has D1 and nothing else is needed. Alternative: Workers KV, which is built for this but adds a binding. Alternative: the Cache API, which is per data center and empties without notice.

## Discovery

### Where it runs

Discovery runs in the Worker, behind `GET /api/discover`.

- It makes 15 to 25 dependent requests (snap, then navigate, then filter, then look up forecast points). On a phone on cellular at the dock that is slow and fails halfway. In the Worker the round trips are short.
- Results are stored once in D1 (`location_sources`) and shared by every viewer of the location.
- Some steps need the Worker anyway: METAR and MeteoAlarm have no CORS; Nominatim's policy counts all users together, which is easiest to respect from one place with a cache.
- A key can be added later (USGS `X-Api-Key`, an Open-Meteo key) without touching the browser.
- Runtime fetching stays in the browser for every keyless CORS source. Discovery decides the bindings; it does not proxy the data.

Budget: Workers Free allows 50 external subrequests per invocation; Workers Paid allows 10,000 (from docs, https://developers.cloudflare.com/workers/platform/limits/). Discovery is capped at 45 counted requests through `ctx.get`, so it runs on either plan. The current plan of the `rowhether` account is unverified.

### Endpoint

`GET /api/discover?lat=42.9607&lon=-72.5219&water=river`

- Auth: phase 3, any signed-in user (03-accounts-and-privacy.md for sessions). In phase 1 the owner runs the same steps as a local script, `scripts/locations/discover.mjs`, over `worker/discover.js` (08 5.6, K5).
- Rate limit: new binding `DISCOVER_LIMIT`, 5 a minute per user (`simple: { limit: 5, period: 60 }`).
- `lat` and `lon` rounded to 5 decimals (about 1 m). `water` is one of the water types in 01-locations.md; default `river`.
- Cached in `source_cache` under `discover:{lat},{lon}:{water}` for 24 hours, and returned with `Cache-Control: private, max-age=300`.
- Timeout: each upstream call 12 s (NLDI hydrolocation 15 s); the whole request 40 s. Partial results are returned with `warnings`.

Response for the Putney dock, as discovery would return it today (values from the live requests):

```json
{
  "point": { "lat": 42.9607, "lon": -72.5219 },
  "place": { "name": "Putney", "region": "VT", "country": "US" },
  "tz": "America/New_York",
  "nws": { "office": "GYX", "grid": [3, 13], "zone": "NHZ011", "county": "NHC005", "marineZones": [] },
  "waterway": {
    "source": "nhdplus", "comid": 9332506, "measure": 75.7, "snapM": 63,
    "mainstem": "https://geoconnex.us/ref/mainstems/2277751",
    "heading": { "suggest": 55, "spanM": 500, "range": [52, 63] }
  },
  "slots": {
    "river": {
      "flow": [
        { "adapter": "usgs-latest", "id": "USGS-01154500", "name": "Connecticut River at North Walpole, NH",
          "direction": "up", "riverKm": 25.1, "straightKm": 19.7, "params": ["00060", "00065"],
          "last": { "v": 4300, "unit": "cfs", "t": 1792215000000 }, "recordFrom": "1942-10-01", "pick": true }
      ],
      "temp": [
        { "adapter": "usgs-latest", "id": "USGS-01161280", "name": "Connecticut River near Northfield, MA",
          "direction": "down", "riverKm": 39.9, "straightKm": 31.1, "params": ["00010", "00060", "00065"], "pick": true }
      ],
      "stage": []
    },
    "flowFcst": [ { "adapter": "nwps-forecast", "lid": "WLPN3", "usgsId": "01154500", "pick": true } ],
    "obs": [
      { "adapter": "nws-obs", "station": "KEEN", "name": "Keene, Dillant-Hopkins Airport", "straightKm": 21.5, "pick": true }
    ],
    "alerts": [ { "adapter": "nws-alerts", "point": "42.9607,-72.5219", "zones": ["NHZ011", "NHC005"], "pick": true } ],
    "tide": { "ask": true, "hint": null, "candidates": [] }
  },
  "flowStats": {
    "gauge": "USGS-01154500", "from": "2016-01-01", "to": "2026-10-16", "days": 3939,
    "p50": 6910, "p90": 21820, "p95": 28010, "floodAction": 75661,
    "suggest": { "flowCaution": 20000, "flowOff": 28000, "against": [[20000, 1.4], [10000, 1.25]] }
  },
  "warnings": [],
  "requests": 21,
  "tookMs": 7400
}
```

`recordFrom`, `requests` and `tookMs` are illustrative (unverified). `suggest` follows 01 11.3's rule from p65, p88 and p95 (08 K7), whose Putney values 01 14.9 lists. The other values come from the live requests. The next station, KVSF Springfield at 42.1 km, falls outside the 40 km limit in step 5.

Errors: `400 { "error": "bad_point", "message": "That point is not a valid latitude and longitude." }`, `401 sign_in` (08 7.2), `429 rate_limited`, `503 { "error": "upstream", "message": "The river data services did not answer. Try again in a few minutes." }` (only when the place and time zone steps fail; all other failures become `warnings`).

### Steps

All requests go through `ctx.get`, which counts them, applies the timeout and sends `User-Agent: RoWhether/1.0 (+https://rowhether.com; <owner contact>)`.

1. **Validate.** Latitude -90 to 90, longitude -180 to 180. Round to 5 decimals.
2. **Place.** Nominatim reverse, `zoom=14`, `addressdetails=1`. Read `address.country_code`, `address.state` or ISO 3166-2 code, the nearest named place, and `name` when the point is on a named feature (a boathouse). If Nominatim fails, Photon reverse. Cache forever on the location row. The Worker never sends more than 1 Nominatim request per second (a D1 timestamp row `source_cache` key `nominatim:last`, checked before each call).
3. **Time zone.** US: `timeZone` from NWS points (step 4). Elsewhere: Open-Meteo air quality with `hourly=us_aqi&forecast_days=1&timezone=auto` (one light call), read `timezone`. Check it with `new Intl.DateTimeFormat('en-US', { timeZone: tz })`, which throws on an unknown zone.
4. **NWS (US only).** `/points/{lat},{lon}`: store `cwa`, `gridX`, `gridY`, `forecastZone`, `county`, `timeZone`. Then `/zones?point=` for the launch and for 8 points on a 2 km ring around it (N, NE, E and so on). The forecast zone and county from `/points`, and every zone the point and ring find, become the alerts binding's `ref`, `zones:<code>,<code>`, which the app and 05's `runAlerts()` both read (01 4.4); the `zones` list in the discovery response carries them. Any `coastal` zone found becomes a suggested marine zone: "Alerts for the Tidal Potomac from Key Bridge to Indian Head also apply to water you may row on." 9 requests; skip the ring when the water type is not tidal, coastal, harbor or lake.
5. **Observation station (US).** `/gridpoints/{wfo}/{x},{y}/stations?limit=10`. Keep stations within 40 km. Prefer ICAO airport ids (`^K[A-Z0-9]{3}$`, `^P[A-Z]{3}$` for Alaska and Hawaii). For the top two, fetch `/observations/latest` and require a timestamp under 3 hours old and a non-null `windSpeed`. Seattle picks KBFI over SEAW1 by this rule. Label: "{City} observations" from the station name, for example "Keene observations".
6. **Snap to the river network (US rivers).** NLDI `hydrolocation` (15 s); on failure `comid/position` with measure assumed 50. Snap distance over 300 m adds the warning "This spot is {n} m from the nearest mapped river line. If you launch on a lake or a side channel, pick that water type." Skip steps 6 to 9 for lake, reservoir and harbor water types.
7. **Navigate.** UM and DM `flowlines?distance=60` and `nwissite?distance=60` (4 requests). Build cumulative length from the start flowline. River distance of a site on flowline `c` at measure `m`:
   - Upstream: `cum(c) + len(c) * m / 100 - len(start) * m0 / 100`, with `cum` measured from the start flowline's downstream end.
   - Downstream: `cum(c) + len(c) * (1 - m / 100) - len(start) * (1 - m0 / 100)`, with `cum` from the start flowline's upstream end.
   - Sites on the start flowline: upstream when `m > m0`, downstream otherwise; report once.
   - Start mainstem: the `mainstem` of the nearest upstream site. Drop downstream sites with a different mainstem. With no upstream sites, keep downstream sites within 30 km and add "Check that these gauges are on your river."
8. **Active series.** `time-series-metadata` for all candidate ids in one or two requests (40 ids each), `parameter_code=00060,00065,00010`, `computation_period_identifier=Points`. Active means `end` within the last 7 days. Then `monitoring-locations?id=...` for names and `drainage_area` (1 request).
9. **Score and pick (US).**
   - Flow: active 00060 within 60 km by river. Score is `riverKm`, plus 15 when the record is under 5 years, plus 25 when its drainage area differs from the nearest candidate's by more than 50 percent. Lowest score wins. Up to 3 candidates are shown.
   - Water temperature: nearest active 00010 within 60 km by river.
   - Stage: nearest active 00065 within 15 km by river, shown for information.
   - Putney check: flow North Walpole (25.1 km) beats Northfield (39.9 km); water temperature goes to Northfield, the only active 00010. This matches today.
10. **River forecast (US).** NWPS `gauges` by a bbox of 0.5° around the launch. For each `lid` whose `pedts.forecast` is not empty (at most 5), fetch `/gauges/{lid}` and match `usgsId` to the chosen flow gauge (stored without the `USGS-` prefix). Confirm with `/stageflow/forecast` that `issuedTime` is not `0001-01-01`. For tidal water also offer a point whose `primaryName` is "Tide Height" within 5 km (GTND2 for Thompson Boat Center).
11. **Tides (asked, never automatic).** The response always carries `tide.ask: true` when the water type is river, tidal river, harbor or coastal. If a CO-OPS (US) or IWLS (Canada) station is within 15 km, `tide.hint` names it. Only when the person answers yes does the Worker fill candidates: the nearest tide prediction station within 10 km preferring type R, else the nearest S; the nearest water level station within 15 km; the nearest current prediction station within 10 km; and CO-OPS `water_temperature` if `date=latest` returns data. Station lists come from `source_cache` (refreshed weekly).
12. **Global fallbacks.**
    - Flow with no gauge, river water type: `om-flood` for the past 10 years (1 request). Offer it only when its 10-year median is at least 50 m³/s (about 1,800 cfs; a first guess), labeled "Modeled river flow (GloFAS), not a gauge."
    - Water temperature with no gauge, coastal or harbor: `om-marine` with `cell_selection=sea`; offer it when the returned cell is within 10 km.
13. **Course heading suggestion.** US: from the NHDPlus flowline geometry already fetched, the bearing from a point 500 m downstream to a point 500 m upstream of the snap. Elsewhere: an Overpass query for `waterway=river|canal` ways within 300 m (OSM rivers are drawn in the direction of flow, by convention, unverified). Return `suggest` rounded to 5°, the span used, and the range over 250 to 1,000 m. 01-locations.md owns how the person confirms it on the map. At Putney the flowline gives 52° (250 m each side), 56° (500 m) and 63° (1 km), while the reach from Putney to Bellows Falls runs about 20° and the current setting is 15° (verified live 2026-10-17 for the flowline; reach bearing computed from coordinates). Local bends make this a suggestion only.
14. **Flow statistics.** For the picked flow gauge, see the next section (1 request).
15. **Other countries** (Phase 7), the same response shape:
    - Canada: `hydrometric-stations` in a bbox of 0.3° with `STATUS_EN` Active and `REAL_TIME` 1. No river network service was found, so candidates are ranked by straight distance, and a candidate whose `STATION_NAME` contains the river name from step 2 (or from OSM) ranks first. Alerts: `weather-alerts` bbox of 0.01°. Observations: `swob-realtime` nearest within 30 km. Tides: IWLS nearest within 15 km, asked as in step 11.
    - UK: EA `stations?lat=&long=&dist=20&parameter=flow` and `dist=5&parameter=level`; same-river check with `riverName`. Flood warnings by point. Met Office region for warnings (mapping unverified). METAR within 30 km.
    - France, Germany: Hub'Eau stations within 15 km, same river by `libelle_cours_eau`; PEGELONLINE within 15 km, same river by `water.longname`.
    - Elsewhere in Europe: MeteoAlarm country feed (area match by polygon, or by NUTS code from Nominatim, unverified) and GloFAS.
    - Australia and NZ: GloFAS, METAR; NZ MetService warnings, area match by CAP polygon.

Request count at Putney: points 1, zones 1 (no ring for this water type), stations 1, observations 2, hydrolocation 1, navigation 4, metadata 1, locations 1, NWPS 1 plus 3, flow history 1, reverse geocode 1, NLDI retry allowance 2: about 21.

### What the person adding the location sees

07-product-and-ux.md owns the screens. This is the content of the "Data for this spot" step, one row per slot, each with the pick, its distance, and the latest reading so the person can sanity-check it.

- **River flow:** "Connecticut River at North Walpole, NH. 16 river miles upstream. Now 4,300 cfs, 40 min ago." Buttons: Use this, Choose another (lists up to 3), None.
- **Water temperature:** "Connecticut River near Northfield, MA. 25 river miles downstream. Water this far away can differ from the water at your dock by several degrees. You can also enter a dock reading in Settings."
- **River forecast:** "NWS forecast for the North Walpole gauge, 3 days ahead."
- **Measured weather:** "Keene airport, 13 mi away. Shown next to the forecast for comparison."
- **Official alerts:** "NWS alerts for this point." With a marine zone: "Also include alerts for the Tidal Potomac from Key Bridge to Indian Head? Small craft advisories are issued there." Default yes.
- **Tide question:** "Does the water at this launch rise and fall with the tide?" Choices: No, Yes, Not sure. Default No. With a hint: "The nearest tide station is Market Street Bridge, 1 mi away. Many rowing basins sit above a dam or lock, where the tide does not reach." Not sure is stored as No and the location is flagged for a curator.
- **Flow limits:** "Suggested flow limits from 10 years of daily flow at this gauge: Caution at 20,000 cfs (higher than 88 days in 100), Stay off at 28,000 cfs (higher than 19 days in 20). Most days run near 6,900 cfs."
- **Nothing found:** "No river gauge found within 37 river miles. Flow will not be checked here." and "No official warnings feed for this country yet. Check your national weather service before you row."

Every row has a small "Why this one?" disclosure stating the rule: "The nearest gauge on the same river that reports flow now."

### Health checks

`worker/sourcehealth.js`, run in phase 3 by the daily cron at 09:17 UTC (`17 9 * * *`, 08 6.4). For each active binding it requests `adapter.url()` once, parses it, and updates `last_ok_at`, `last_checked_at` or `fail_count`. With no data for 3 days the binding becomes `offline`, and after 30 days `retired` (01 15.7; 08 K8); both are listed in `/admin` with the error. An offline binding stays in use (the browser may still succeed) until a curator replaces it; a retired one is skipped. Cost: one request per binding per day. Bindings to Open-Meteo are skipped (see the Open-Meteo section).

## Default flow thresholds from history

Putney's defaults (20,000 and 28,000 cfs) were "about the top 10% and top 5% of days since 2016". The same method, written down, for every location with a gauge:

1. **Window.** From January 1 ten years before the current year to yesterday. In 2026 that is 2016-01-01 to 2026-10-16, which matches Putney. Require at least 1,095 days (3 years) with values; otherwise no suggestion and the flow lines start blank (which turns the flow rule off, as blank rain lines do).
2. **Fetch.**
   - US: `usgs-history`, the `daily` collection with `statistic_id=00003`, `limit=10000`, `properties=time,value`, `skipGeometry=true`. One page covered 3,939 days. Follow a `rel: next` link if present, at most 5 pages.
   - Canada: `hydrometric-daily-mean` with `datetime={from}/{to}`, `limit=10000`. Multiply m³/s by 35.3147.
   - UK: EA hydrology daily mean measure readings with `mineq-date={from}`, `_limit=4000`, ×35.3147.
   - France: Hub'Eau daily means (`obs_elab`, unverified). Germany: history depth unverified; use GloFAS.
   - No gauge: `om-flood` with `start_date={from}&end_date={to}` (3,936 days in 1.0 s, verified live 2026-10-17). Store with `modeled = 1`. The browser then compares GloFAS forecasts only with these GloFAS percentiles.
3. **Compute.** Sort values; drop null and negative. Percentiles by linear interpolation between closest ranks (the method that gave 6,910, 21,820 and 28,010 at Putney). All seasons count, as at Putney.
4. **Round** down to two significant figures and suggest 01 11.3's lines (08 K7): `flowCaution` = p88, `flowOff` = p95, `against` = `[[p88, 1.4], [p65, 1.25]]`. At Putney that gives 10,000, 20,000 and 28,000, today's values (01 11.3).
5. **Cap** with NWPS when known: `flowOff` never above the NWPS action flow (`flood.categories.action.flow`, when above 0). At Putney the action flow is 75,661 cfs, so no change.
6. **Store** in the flow binding's `stats` (01 4.4; 08 K6), and copy the suggestion into the location's default settings (01-locations.md) when the person confirms.
7. **Refresh** yearly: the daily run (`17 9 * * *`, 08 6.4) recomputes `stats` on January 15. It changes the location's default lines only when nobody has edited them since they were computed.
8. **Putney** keeps 20,000 and 28,000 exactly. Its `stats` are kept for reference only.

Later: "High for October" context from the USGS statistics API month-of-year percentiles (verified live 2026-10-17). Not needed for the verdict.

Decision: compute percentiles over all days of the year, as Putney's were. Recommended, because it is the method behind the current defaults and needs no season definition. Alternative: rowing season only (for example April to November in the north), which would lower the lines, since spring melt drives the top days.

## Place search, reverse geocoding and time zones

- **Place search** (the location picker, 07-product-and-ux.md): first our own list, `GET /api/locations?q=` (01-locations.md), which is what most people want. Then Open-Meteo geocoding for towns, called from the browser on submit or after 300 ms of no typing, at most 1 request per 300 ms. Never Nominatim for typing (its policy forbids client-side autocomplete).
- **Reverse geocoding** only inside discovery, in the Worker, once per new location, cached on the row.
- **Boathouse names:** Photon finds OSM boathouses by name, which Open-Meteo cannot.

Decision: in the add flow's search box, use Photon for boathouse names. Recommended, because it found "Weld Boathouse" and supports type-ahead. Alternative: Open-Meteo geocoding only, then drop a pin on the map (towns only, but documented terms). Alternative: Nominatim on submit only, never while typing.

- **Time zone:** stored on the location at creation (step 3 of discovery) and never looked up at runtime. All formatters in `src/format.js` are built per location from `loc.tz`, the generalization of `LOC.tz`.

Decision: take the time zone from NWS points in the US and Open-Meteo `timezone=auto` elsewhere. Recommended (no new dependency). Alternative: bundle `@photostructure/tz-lookup` 11.7.0 (88 KB unpacked, verified live 2026-10-17 with `npm view`) in the Worker for an offline lookup.

## Map tiles

Only the picker map and the add flow use a map. The Now screen never loads one.

Decision: MapLibre GL JS from npm, lazy-loaded only on `/add` and the picker map, with OpenFreeMap tiles. Recommended: free, no key, commercial use allowed, CORS `*`. Measured by 07 10.4: about 430 KB gzip over the network when opened, with the worker file set through `setWorkerUrl()`. Alternative: Leaflet 1.9.4 with OSM standard tiles (a smaller library, but the OSM tile policy offers "no SLA" and may block). Alternative: no map; search and "Use my location" only.

Decision: whether tile, style, glyph and sprite requests to `tiles.openfreemap.org` fit the "no runtime loads from third-party CDNs" rule. Recommended: yes, as data, like the API calls. The rule protects the app shell from failing offline, and the map is not part of it. The map library itself is bundled. Alternative: self-host tiles (PMTiles in R2), which costs storage and a build pipeline.

## Open-Meteo: free tier, weights, and a commercial future

### Today

- All Open-Meteo calls go from each viewer's browser. Limits are per IP, so each phone has its own 10,000 a day.
- Estimated weight per refresh, by the "more than 10 variables" rule: `wx` asks for 13 hourly, 8 current and 6 daily variables, about 2.7 calls; `aq` about 1; `models` 2 variables for 4 models, about 1 (how models are counted is not documented). About 4.7 calls per refresh, 28 an hour for a phone that stays open (estimate).
- A club wifi with 40 phones behind one IP, all open for an hour: about 1,130 calls, under the 5,000 an hour limit (estimate).
- With per-slot refresh (`aq` and `models` hourly) a refresh weighs about 2.7, plus 2 once an hour (estimate).

### Server-side calls

Discovery (time zone, GloFAS history, marine check), the health check and the night-before alert (05-notifications.md) call Open-Meteo from the Worker. Those calls leave from Cloudflare egress addresses shared with other Workers. The sandbox, also behind shared egress, got `429 Daily API request limit exceeded` from the historical forecast API (verified live 2026-10-17).

- Discovery and history jobs are rare (one per new location) and can retry later. They stay on the free API.
- The health check skips Open-Meteo.
- The night-before alert needs the forecast for every subscribed location every evening.

Decision: buy Open-Meteo API Standard for server-side use when Phase 4 starts. Recommended: $29 a month for 1 million calls (from the Open-Meteo blog via search, https://openmeteo.substack.com/p/api-subscriptions-for-commercial; the pricing page shows no prices, so unverified), host `customer-api.open-meteo.com` with `&apikey=`, key stored as the Worker secret `OPEN_METEO_KEY`. Browsers stay on the free API while RoWhether is non-commercial. Alternative: call the free API from the Worker and accept 429s on busy evenings. Alternative: send the alert from data the browser cached (stale by hours).

### If RoWhether becomes commercial

The terms define commercial as "Operating websites or apps that have subscriptions or display advertisements" and integration into commercial products (from docs, https://open-meteo.com/en/terms). A paid club tier would count. Then:

1. The free API is not allowed from browsers either.
2. A key cannot sit in the browser (hard constraint), so every Open-Meteo call moves behind the Worker: `GET /api/wx/:slug`, `/api/aq/:slug`, `/api/models/:slug`.
3. The Worker caches each response per location with `Cache-Control: public, s-maxage=600` (Workers Caching, from docs, https://developers.cloudflare.com/workers/cache/), so cost follows the number of active locations, not viewers.
4. Estimate: 200 active locations, 144 refreshes a day, 4.7 calls each, is about 135,000 calls a day, 4.1 million a month: API Professional, $99 a month (price unverified, same source). With hourly `aq` and `models`, about 2.6 million: still above Standard's 1 million.
5. The hard constraint "weather data is fetched client-side" changes for Open-Meteo only.

Decision: if a paid tier is ever added, proxy Open-Meteo through the Worker with a key and per-location edge caching. Recommended, as above. Alternative: self-host the open-source Open-Meteo server (AGPLv3, from docs, https://open-meteo.com/en/pricing), which means running and feeding servers. Alternative: keep RoWhether free with no ads, and keep the free API.

## Attribution

The footer gets a "Data" line built by `attributionFor(loc)` from the location's active bindings. It shows only sources the location uses. The full list lives on `/about`. Open-Meteo also asks for a link "next to any location Open-Meteo data are displayed", so its line also appears in each tab's "How this works" panel.

| Source | Text | Link | Licence | Status |
| --- | --- | --- | --- | --- |
| Open-Meteo | Weather data by Open-Meteo.com | https://open-meteo.com/ | CC BY 4.0 | from docs |
| Open-Meteo air quality | Air quality: CAMS via Open-Meteo.com | https://open-meteo.com/ | CC BY 4.0; Copernicus licence | from docs |
| GloFAS | Modeled river flow: GloFAS (Copernicus) via Open-Meteo.com | https://open-meteo.com/en/docs/flood-api | Copernicus licence | from docs |
| NWS | Alerts and observations: National Weather Service | https://www.weather.gov/ | US Government open data | from docs |
| USGS | River data: U.S. Geological Survey | https://waterdata.usgs.gov/ | public domain (unverified wording) | unverified |
| NWPS | River forecast: NOAA National Water Prediction Service | https://water.noaa.gov/ | US Government | unverified |
| CO-OPS | Tides: NOAA Tides and Currents | https://tidesandcurrents.noaa.gov/ | US Government | unverified |
| ECCC | Contains information licenced under the Data Server End-use Licence of Environment and Climate Change Canada | https://eccc-msc.github.io/open-data/licence/readme_en/ | ECCC end-use licence | from docs |
| CHS | Tides: Canadian Hydrographic Service | https://www.tides.gc.ca/ | unverified | unverified |
| EA | This uses Environment Agency flood and river level data from the real-time data API (Beta) | https://environment.data.gov.uk/flood-monitoring/doc/reference | OGL v3.0 | from docs |
| Met Office | Warnings: Met Office | https://www.metoffice.gov.uk/ | unverified | unverified |
| MeteoAlarm | Warnings: MeteoAlarm and national weather services | https://www.meteoalarm.org/ | unverified | unverified |
| MetService | Warnings: MetService, CC BY 4.0 | https://www.metservice.com/ | CC BY 4.0 | verified live (feed copyright line) |
| Hub'Eau | River data: Hub'Eau, Eaufrance | https://hubeau.eaufrance.fr/ | Licence Ouverte (unverified) | unverified |
| PEGELONLINE | River data: WSV, PEGELONLINE | https://www.pegelonline.wsv.de/ | DL-DE (unverified) | unverified |
| aviationweather.gov | Airport observations: NOAA Aviation Weather Center | https://aviationweather.gov/ | US Government | unverified |
| OpenStreetMap, Nominatim, Photon | Place names © OpenStreetMap contributors | https://www.openstreetmap.org/copyright | ODbL | from docs |
| OpenFreeMap | OpenFreeMap © OpenMapTiles Data from OpenStreetMap (on the map) | https://openfreemap.org/ | | from docs |
| SunCalc | Sun times: SunCalc | https://github.com/mourner/suncalc | BSD 2-Clause (unverified) | unverified |

ECCC and MeteoAlarm alert text must be shown without changes to content or intent (ECCC from docs; MeteoAlarm unverified). The Storms tab already shows full alert text.

## Graceful degradation

Two states per slot, kept apart in code and copy:

- **Not available here:** no binding for this slot at this location. For a factor that could change the level (river flow on a river, official alerts), one quiet line under the hero says so: "Not checked here: river flow, official alerts." (07 6.7). The relevant tab says what is missing and what to do. Putney has every source, so its hero shows no line.
- **Failed:** a binding exists but the fetch or parse failed. The hero note names it, as today: "Could not reach USGS river gauges. Showing the last data received where available."

| Slot missing | What still works | What changes | Copy where it shows |
| --- | --- | --- | --- |
| `alerts` | Thunderstorm risk from weather codes and CAPE | No `alert` reasons. In Week, the Alerts factor reads "Not available here" instead of no concern | Storms: "No official warnings feed for this country yet. Check your national weather service before you row." |
| `obs` | Everything | The measured comparison fact is hidden | none |
| `river`, `flow` | Everything else | No `flow` reasons, no debris warning, River tab hidden (01 9.7; 08 K29) | River: "No river gauge for this spot. Flow is not checked." For lakes: "This is a lake. Flow is not checked." |
| `flowFcst` | Flow now | No forecast line on River | River: "No river forecast for this gauge." |
| water temperature (no `river.waterC`, no `waterTemp`, no dock reading) | Air below 32 °F rule | The air plus water cold check cannot run, unless the location has curated monthly typical values (01 11.4; 08 K1). Steam fog cannot be judged | Temperature: "No water temperature here. Add a dock reading in Settings to turn on the cold-water check." Fog, How this works: "Steam fog needs a water temperature. Add a dock reading in Settings." |
| `aq` | Everything else | No `aqi` reasons; Air tab shows a message | Air: "No air quality forecast for this spot right now." |
| `models` | Everything else | No confidence lines | none (as today) |
| `tide`, `tideStream` | Everything | Not shown | none |
| `wx` | Nothing | As today: "No data." | unchanged |

Decision: for a location with no water temperature source and no curated monthly typical values (01 11.4, which feed the cold check labeled as typical; 08 K1), leave the cold check off until the person enters a dock reading. Recommended, because a guessed water temperature presented as a measurement could make a cold morning look safe. Alternative: estimate water temperature from the mean air temperature over the past 14 to 30 days (first guess, unverified accuracy), labeled "Estimate".

Decision: tides and tidal currents stay information only (charts and text, no verdict change). Recommended until reports show what levels matter, like water state today. Alternative: add caution for a strong ebb against the wind, which needs tuning data.

## Worker endpoints added by this plan

| Method and path | Phase | Auth | Purpose |
| --- | --- | --- | --- |
| `GET /api/discover?lat=&lon=&water=` | 3; a local script in phase 1 (08 5.6) | signed in | Discovery, as above |
| `PUT /api/locations/:slug/sources` | 3; phase 1 curates by pull request (08 K5) | location curator or moderator | Confirm bindings. Body `{ "sources": [ { "role": "flow", "mode": "primary", "adapter": "usgs-ogc", "ref": "USGS-01154500", "params": { "parameterCode": "00060" }, "label": "USGS river gauges", "note": "..." } ] }`, in 01 4.4's binding fields. Response `{ "ok": true, "sources": [...] }`. Writes `location_revisions` (01-locations.md) |
| `POST /api/locations/:slug/flow-stats` | not built (08 K6: `GET /api/sources/stats` with `&fresh=1`) | | Recompute flow statistics. Response `{ "ok": true, "stats": { "p50": 6910, "p90": 21820, "p95": 28010, "days": 3939 } }` |
| `GET /api/locations/:slug/alerts` | 7 | none | Normalized alerts for sources without CORS (Met Office, MeteoAlarm, MetService). Response `{ "alerts": [ { "event", "headline", "desc", "instr", "start", "end", "lvl" } ], "source": "meteoalarm", "fetchedAt": 0 }`. `Cache-Control: public, s-maxage=300` |
| `GET /api/locations/:slug/obs` | 7 | none | METAR through the Worker. Response is the `obs` shape plus `station`. `s-maxage=300` |

`GET /api/locations/:slug` (01-locations.md) includes `sources` (the active bindings, without `confirmed_by`), each flow binding with its `stats` (08 K6).

The two proxy endpoints never take a URL from the client. The upstream host and path come from the location's stored binding, so they cannot be used as an open proxy. Rate limit: a new binding `SOURCE_LIMIT`, 30 a minute per connection.

## Phases

- **Phase 0 (foundations):** `src/sources/` with the nine current adapters; `fetchAll(loc)`; Putney bindings as data with identical URLs and labels; formatters use `loc.tz`; `refreshMs` and `staleMs` fields, unused until phase 1; parser fixtures and tests. No visible change. `parseFlowDays` at local noon moves to phase 1 (08 K9, K11).
- **Phase 1 (many locations):** discovery as a local script for the owner (08 5.6); bindings in the curated `data/` files, no tables; US adapters for tides, currents and the NWPS tide forecast; marine zones; GloFAS and marine fallbacks; place search; attribution line; staleness per slot. The tables, `PUT /api/locations/:slug/sources`, the picker map and the health check cron are phase 3 (08 K5, K8, K57).
- **Phase 3 (community):** discovery opens to signed-in users in `/add`; curators review `suggested` and `offline` bindings (08 K8).
- **Phase 4 (notifications):** server-side forecast with an Open-Meteo key (decision above).
- **Phase 7 (beyond the US):** Canada, UK, France, Germany and the Worker-proxied warnings and METAR; regional AQ indexes and models.

## Tests

Fixtures recorded from the live responses of 2026-10-17 go in `test/fixtures/sources/`. Nothing in CI calls a live API.

- `test/sources.test.js`
  - Putney parity: for the Putney location record, each adapter's `url()` equals today's `SRC[k]()` string, and `label()` equals `SOURCE_NAMES[k]`, for all nine keys.
  - `parseAlerts` on an NWS fixture; the new marine level mapping (`Small Craft Advisory` gets the decided level).
  - `parseObs` on SEAW1 (null gust, null visibility, empty text) and KBFI.
  - `parseRiver` with flow, temperature and stage from two gauges, ids taken from the binding.
  - `parseFlowDays` with an unsorted fixture: output sorted; points at local noon for `America/New_York` (16:00 UTC in summer, 17:00 UTC in winter) and `Europe/London` (11:00 UTC in summer).
  - `parseFlowForecast`: kcfs scaling, -999 dropped, `issuedTime` `0001-01-01T00:00:00Z` returns no points (WLTM3).
  - CO-OPS: hilo predictions to `tide.events` in ms; the HTTP 200 `error` body throws so the slot counts as failed; `currents_predictions` to `current.events`.
  - ECCC realtime m³/s to cfs; ECCC alert levels; EA readings; EA flood severity mapping; Hub'Eau L/s to cfs; PEGELONLINE cm and m³/s.
  - `om-flood` and `om-marine` with null arrays: an empty result, not a crash.
  - METAR knots to mph, `VRB` direction to null, `10+` visibility.
- `test/discover.test.js` (Worker, `ctx.get` stubbed with fixtures)
  - Putney: flow `USGS-01154500` up 25.1 km, temperature `USGS-01161280` down 39.9 km, NWPS `WLPN3`, station KEEN, request count at most 45.
  - Schuylkill: `USGS-01482100` (Delaware) is dropped by the mainstem filter; `USGS-01474500` appears once despite being on the start flowline.
  - Seattle: lake water type skips navigation; tides are not bound; KBFI is picked over SEAW1.
  - Potomac: flow `USGS-01646500`, NWPS `BRKM2`, tide point `GTND2` offered only after the tide answer is yes; marine zone ANZ535 suggested from the ring.
  - Charles: Boston tide station appears only as a hint.
  - Hydrolocation 502 falls back to position with measure 50 and adds no warning.
  - Budget: a stub that returns 60 candidate sites keeps total requests at or under 45.
- `test/flowstats.test.js`
  - The 3,939-day Putney fixture gives p50 6,910, p90 21,820, p95 28,010 (to the nearest cfs).
  - Rounded down to two significant figures (01 11.3; 08 K7): 21,820 to 21,000; 28,010 to 28,000; 950 to 950; 1,049 to 1,000. The suggestion from p88 and p95 is 20,000 and 28,000.
  - Fewer than 1,095 days gives no suggestion.
  - The NWPS action flow caps `flowOff`.
- `test/logic.test.js` additions
  - `buildModel` with no `river` slot: no `flow` reasons, no debris warning, no throw.
  - `waterTemp()` precedence: Settings reading, then `river.waterC`, then `waterTemp`.
  - A slot older than `staleMs` is treated as missing, except flow and water temperature, where the location's `maxAgeH` decides use.
- `test/sourceproxy.test.js`: the proxy refuses a location whose binding is not a Worker adapter; responses carry `s-maxage=300`.
- A manual script, `scripts/check-sources.mjs` (not run in CI): requests each adapter's URL for a few fixed locations with `Origin: https://rowhether.com` and prints status, CORS header and a parse result. Run before each phase ships, and when a provider announces changes.

## Open questions and decisions

Decision: keep US units (mph, °F, inches, cfs) as the internal canonical units; convert in parsers and formatters. Alternative: SI internally.

Decision: treat NWS `Small Craft Advisory`, `Gale Warning`, `Storm Warning` and `Special Marine Warning` as stay off. Alternative: caution.

Decision: keep large station lists in D1 `source_cache`. Alternative: Workers KV. Alternative: the Cache API.

Decision: compute default flow percentiles over all days of the year. Alternative: rowing season only.

Decision: use Photon for boathouse names in the add flow's search. Alternative: Open-Meteo geocoding plus a map pin. Alternative: Nominatim on submit only.

Decision: time zone from NWS points in the US and Open-Meteo `timezone=auto` elsewhere. Alternative: bundle `@photostructure/tz-lookup` in the Worker.

Decision: MapLibre GL JS with OpenFreeMap tiles, lazy-loaded on the map screens only. Alternative: Leaflet with OSM tiles. Alternative: no map.

Decision: map tile, style, sprite and glyph requests count as data, not as a third-party CDN load, and CLAUDE.md gains the sentence "Map tiles, styles, sprites and label glyphs load from OpenFreeMap only when a map is opened. They are data, never part of the app shell." Needs the owner's approval, because it reads a hard constraint in a new way (08 17.2). Alternative: self-hosted PMTiles in R2, and the style, sprites and glyphs in `public/`.

Decision: buy Open-Meteo API Standard for server-side calls when Phase 4 starts. Alternative: free API from the Worker with retries. Alternative: alerts from browser-cached data.

Decision: if a paid tier is ever added, proxy Open-Meteo through the Worker with a key and per-location edge caching. Alternative: self-host Open-Meteo. Alternative: stay free with no ads.

Decision: leave the cold check off where there is no water temperature source and no curated monthly value (08 K1) until a dock reading is entered. Alternative: a labeled estimate from past air temperature.

Decision: tides and tidal currents are information only for now. Alternative: a caution rule for strong ebb against the wind.

Decision: switch `src/sources/usgs.js` from `/ogcapi/v0` to `/ogcapi/v1` in phase 1 (08 K10: phase 0's parity test requires today's URLs). Recommended, because the service root now links to v1 and both return the same data today. Alternative: stay on v0 until USGS announces a retirement date (none found).

Decision: the contact string in the Worker's User-Agent for NWS, Nominatim and aviationweather.gov. Recommended: a dedicated address the owner chooses (for example a data@ address on rowhether.com). Alternative: the GitHub repository URL only, which NWS and Nominatim may treat as insufficient.

Decision: Australia. Recommended: ship Australian locations with the global baseline only, and ask BoM (webreg@bom.gov.au) about terms for warnings before building anything. Alternative: the anonymous FTP channel through Worker TCP sockets, after the terms are confirmed.

Open questions:

- CLAUDE.md says the dock is in NWS office ALY, grid 111,85, zone VTZ015. `/points` returns GYX, 3,13, NHZ011 and county NHC005 today. Was the ALY grid taken from a different point, or did NWS change it? Discovery will store the GYX values; CLAUDE.md should be corrected when Phase 0 lands.
- The Putney water temperature note says the Northfield gauge is "about 19 mi downstream". That is the straight-line distance (19.3 mi). Along the river it is 24.8 mi. The flow note uses river miles (16, measured 15.6). Should both say river miles?
- The 15° course heading at Putney: the NHDPlus flowline suggests 52° to 63° near the dock, while the reach to Bellows Falls runs about 20°. Which stretch do crews row? (CLAUDE.md already lists the heading as an estimate to confirm on site.)
- The Cloudflare account's Workers plan for the `rowhether` Worker (Free or Paid) decides how much headroom discovery has. The design fits Free.
- The GloFAS minimum of 50 m³/s, the 60 km gauge radius, the 15 km stage radius, the 10 km tide station radius and the scoring penalties are first guesses. Check them against the first 20 curated locations.
- Thames stream warnings (the red and yellow boards Thames clubs row by) and similar local systems were not found in any API. They may be a club-entered water status (06-clubs.md) rather than a data source.
- MeteoAlarm reuse terms, the Met Office warnings feed terms and region boundaries, UKHO tide access, and the Hub'Eau and PEGELONLINE licences need reading before Phase 7.
