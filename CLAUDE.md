# CLAUDE.md

Context for working on this repo. Read before making changes.

## Working style

- Plan first, get agreement, then build. Never run destructive or broad operations (force push, history rewrite, deleting branches, changing repo visibility) without an explicit go-ahead.
- Prefer vetted, community-standard solutions over new tooling. Keep it simple.
- Before revising code, critique it against specific criteria and write the findings down, then change it.
- Writing in UI and docs: direct, calm, short sentences. No em dashes. No emojis. Sentence case.

## What this is

A single-page rowing conditions app for the Connecticut River at the Putney Rowing Club docks, Putney Landing, VT. Used mostly on phones, installed to the home screen as a PWA. Vanilla JS ES modules bundled with Vite. No framework, no backend. Deployed as a Cloudflare Worker that serves the built static files.

## Hard constraints

- No runtime loads from third-party CDNs. SunCalc 1.9.0 and the Archivo variable font (`@fontsource-variable/archivo`) are npm dependencies bundled into the build, so the app shell works offline. Pin exact versions in `package.json` for anything added.
- All data is fetched client-side from keyless APIs that send `Access-Control-Allow-Origin: *`. Do not add anything that needs an API key. If a proxy is ever needed, it goes in a Worker script (`main` in `wrangler.jsonc`), not a third-party service.
- The service worker precaches the app shell only. It does not cache API responses. Freshness of data is handled by the app's own localStorage cache.
- Must build to plain static files in `dist/` that any static host can serve. Cloudflare Workers static assets is the target.
- `localStorage` holds settings and a cache of the last good data. Every access is wrapped in try/catch.
- All times display in `America/New_York` regardless of the viewer's time zone. Open-Meteo is requested with `timeformat=unixtime` to avoid parsing local strings.

## Location and endpoints

- Dock: 42.9607, -72.5219. NWS office ALY, grid 111,85, forecast zone VTZ015 (Windham County).
- Open-Meteo forecast: `current`, `hourly` (temperature, apparent temp, dew point, precip probability, precip, weather code, wind speed, gusts, direction, visibility, CAPE, cloud cover) and `daily` (sunrise, sunset, max/min temp, max precip probability). Units mph, °F, inches. 7 days.
- NWS alerts: `https://api.weather.gov/alerts/active?point=42.9607,-72.5219`
- NWS observation: `https://api.weather.gov/stations/KEEN/observations/latest` (km/h and °C, converted)
- USGS latest values (newer OGC API, not legacy waterservices): `https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items?monitoring_location_id=USGS-01154500,USGS-01161280&parameter_code=00060,00010&f=json`
- USGS 48 h flow series: `https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous/items?monitoring_location_id=USGS-01154500&parameter_code=00060&time=P2D&limit=1000&properties=time,value&f=json`
- Refresh every 10 minutes while visible, and on return to the tab if data is over 5 minutes old. Each source fails independently; the last good value is kept and the failure is named under the hero.

## Call logic

Levels: 0 go, 1 caution, 2 stay off. An hour's level is the worst of its reasons (`assess()`):

- Dark (sun below civil twilight) is 2. Twilight before sunrise or after sunset is 1 (lights required).
- Thunderstorm codes 95/96/99 are 2. CAPE >= 1000 with rain chance >= 30% is 1.
- Freezing rain is 2. Snow is 1. Precip >= 0.15 in/hr is 1.
- Rain chance against the settings thresholds (`rainCaution`, `rainOff`, defaults 60% and 90%). Either can be blank, which turns that level off.
- Wind and gusts against the settings thresholds.
- Visibility < 0.25 mi is 2, < 1 mi is 1. Otherwise likely fog from `fogRisk()` is 1. Possible fog is shown but does not change the call.
- Air below 32°F is 2. Air plus water below the cold line is 1.
- Flow against the settings thresholds.
- Active NWS alerts apply to hours they cover. Thunderstorm, flood, wind, dense fog and winter storm types are 2, others 1.

Fog (`fogRisk()`, thresholds in `FOG` in `src/config.js`) is none, possible or likely, with a type:

- Valley fog, midnight through the 10 AM hour. Likely: air within 2°F of the dew point, wind <= 4 mph, mean cloud cover over the last 6 hours <= 50%. Possible: within 4°F, wind <= 6, cloud <= 80%. Missing cloud cover counts as clear.
- Steam fog, same hours. Likely: water at least 18°F warmer than the air, wind <= 6, humidity >= 75%. Possible: 10°F, wind <= 8, humidity >= 60%. Uses the gauge or the Settings water reading.
- Model fog at any hour: weather code 45 or 48, or visibility under 1 mi.

`morningFog()` takes the strongest risk from an hour before first light through the 10 AM hour, and says fog lifts at the end of the last foggy hour. If that is the 10 AM hour it says the fog lingers into late morning. Fog appears in the Visibility fact (now, or the next morning), and each Day by day row and its full forecast.

Hourly level is evaluated at mid-hour for daylight.

Night is not shown. The rowing day is first light to sunset, split into periods (`PERIODS` in `src/config.js`, built by `periodsFor()`): morning from first light to 10 AM, midday 10 AM to 3 PM, afternoon 3 PM to sunset. A period's call is its worst remaining hour, ignoring light (`lvlExcept(a, LIGHT_KEYS)`); the need for lights before sunrise is a note (`lightsUntil`). Finished periods are hidden. `m.daytime` is true from first light to sunset. Outside it, the hero shows `m.next`, the next period, and On the water now is hidden. In daytime, "holds" looks only as far as sunset. When the call is not go, the hero names the next go period.

Water state (`waterState()`, thresholds in `WATER` in `src/config.js`) is information only and does not change the call:

- Chop wind for an hour (`chopWind()`) is the along-course wind component plus 0.4 times the crosswind component. Wind blowing upstream (from downstream) against the current is multiplied by 1.25 over 10,000 cfs and 1.4 over 20,000 cfs.
- The hour's value blends this hour and the two before it (0.5, 0.3, 0.2), since chop builds and settles.
- Under 5 mph is flat, 5 to 9 light chop, 9 to 13 chop, 13 and up rough.
- `waterWhy()` names the wind as along the straight or crosswind using the same 60° split as `windVsCourse()`, so the two notes never disagree.
- A flow rise of 20% or more in 6 hours adds a floating debris warning (`debrisLikely()`), shown now and for today's periods.
- Shown in the hero, On the water now, a second chip on each Day by day row (worst hour), the full forecast (range and peak time), and a Water column in the hour table.

Wind vs course uses `relWind()`: the angle between where the wind comes from and the upstream heading. Within 60° either way is head or tail; otherwise crosswind, with the side named as the NH (east) or VT (west) bank.

## Code map

- `index.html`: page markup and the settings `<dialog>`. Loads `src/main.js`.
- `src/config.js`: location, endpoints (`SRC`), `DEFAULTS`, storage keys, copy tables (`CHIP`, `THEN`, `WORD`).
- `src/format.js`: Eastern-time formatters and text helpers (`dayKey`, `hm`, `whenText`, `card`, `rng`, `esc`).
- `src/storage.js`: `loadSettings`, `saveSettings`, `loadCache`, `saveCache`. All guarded with try/catch.
- `src/data.js`: `fetchJSON`, the parsers (`parseAlerts`, `parseObs`, `parseRiver`, `parseFlow`) and `fetchAll`.
- `src/logic.js`: the call logic, pure and DOM free. `buildModel(data, settings, now)` returns the model every render reads: hours, days, `h72`, `cur`, `alerts`. Also `assess`, `lvlExcept`, `sunFor`, `lightAt`, `fogRisk`, `morningFog`, `nextMorning`, `windVsCourse`, `flowTrend`, `flowChange`, `chopWind`, `waterState`, `waterWhy`, `debrisLikely`, `periodsFor`. The model also has `daytime`, `next`, and `periods` on each day.
- `src/state.js`: the mutable `app` object (settings, data, errors, model, UI selection) and `$`.
- `src/render/`: one file per section. `index.js` has `render()`, which rebuilds the model and draws everything. `hero.js`, `now.js`, `days.js` (Day by day rows, plus period text helpers the hero reuses), `forecast.js` (the full forecast a row opens to, built when opened), and shared builders in `parts.js`.
- `src/settings.js`: settings dialog wiring.
- `src/main.js`: styles, service worker registration, `refresh`, event listeners, startup.
- `src/styles/tokens.css` (colors) and `src/styles/app.css` (everything else).
- `public/`: icons and Cloudflare `_headers`, copied to `dist/` as is.
- `vite.config.js`: PWA manifest and Workbox settings. `wrangler.jsonc`: the Worker.

## Design system

- Colors are CSS custom properties on `:root`, redefined for `prefers-color-scheme: dark` and `[data-theme]`. Light base is a cool fog white (#EEF3F2) with deep river teal (#1E4A52). Dark base is deep river (#0F2329), not near-black. Status: go spruce green, caution maple amber, stay off signal red, each with a soft tint.
- Type is Archivo variable (CSS family name `"Archivo Variable"`), one family. Width does the work: the verdict word is width 125%, weight 850. Numbers are width ~78% with tabular figures.
- The hero verdict is the one loud element. Everything else stays quiet.
- Sections are separated by surface panels on the page background: On the water now is one panel, each day in Day by day is its own panel, and period rows inside sit on the page background with a status-colored left bar.
- Avoid: all-caps labels, eyebrow labels, middle-dot separators, monospace data labels, identical rounded card grids, decorative gradients.
- Responsive to 360 px. Visible keyboard focus. Day by day rows are native `<details>`, so they work with the keyboard. Respect reduced motion.

## Testing

- `npm test` runs Vitest unit tests in `test/` for the call logic and parsers. Add a test when changing `src/logic.js` or `src/data.js`.
- `npm run build` must pass. CI runs both on every push and pull request.

For UI changes, also check in a browser with `npm run dev` or `npm run build && npm run preview`, or with Playwright:

- Load at 390 px wide (light) and 1280 px (dark) in Chromium and WebKit. Wait for data, screenshot, confirm the console is clean.
- Pin the page clock (`page.clock.install`) to midday and to 9 PM. Midday shows the live call and On the water now. 9 PM hides On the water now and the hero shows tomorrow morning.
- Open a Day by day row and confirm the full forecast (facts and hour table) shows. The `toggle` event is async, so wait for `.forecast` before checking.
- Abort requests to open-meteo, weather.gov and usgs.gov and confirm the "every data source was blocked" message.

## Open items

- Keene line: keep as a labeled comparison or remove. Undecided.
- Course heading of 15° is an estimate. Confirm on site.
- Water state thresholds and the crosswind weight are first guesses. Check them against what the dock sees.
- Fog thresholds are first guesses. Steam fog will mark many calm October mornings as caution. Tune `FOG` against what the dock actually sees.
- Water temperature is a downstream proxy. A dock reading can be set in Settings.

## Later

Ideas the owner wants to keep for later. Not started.

- Night-before alert. Around 8 PM, a push notification with tomorrow morning's call, wind and fog, and a second one if the call changes overnight. Needs a Worker script, Web Push, a cron trigger, and KV or D1 for subscriptions.
- Dock reports. One tap at the dock to log real conditions (flat, foggy until a time, debris), shown to everyone for a few hours. Also a way to tune the fog and water state thresholds. Needs a Worker script and D1.
