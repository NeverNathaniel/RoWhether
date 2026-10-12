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
- Open-Meteo forecast: `current`, `hourly` (temperature, apparent temp, dew point, precip probability, precip, weather code, wind speed, gusts, direction, visibility, CAPE) and `daily` (sunrise, sunset, max/min temp, max precip probability). Units mph, °F, inches. 7 days.
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
- Wind and gusts against the settings thresholds.
- Visibility < 0.25 mi is 2, < 1 mi is 1. Otherwise a fog heuristic (air within 2°F of dew point, wind <= 4 mph, before 11 AM) is 1.
- Air below 32°F is 2. Air plus water below the cold line is 1.
- Flow against the settings thresholds.
- Active NWS alerts apply to hours they cover. Thunderstorm, flood, wind, dense fog and winter storm types are 2, others 1.

Best windows are runs of go hours in the next 72 h, at least 45 minutes, with edges snapped to sunrise or sunset. If there are none, caution runs are shown instead. Hourly level is evaluated at mid-hour for daylight.

Wind vs course uses `relWind()`: the angle between where the wind comes from and the upstream heading. Within 60° either way is head or tail; otherwise crosswind, with the side named as the NH (east) or VT (west) bank.

## Code map

- `index.html`: page markup and the settings `<dialog>`. Loads `src/main.js`.
- `src/config.js`: location, endpoints (`SRC`), `DEFAULTS`, storage keys, copy tables (`CHIP`, `THEN`, `WORD`).
- `src/format.js`: Eastern-time formatters and text helpers (`dayKey`, `hm`, `whenText`, `card`, `rng`, `esc`).
- `src/storage.js`: `loadSettings`, `saveSettings`, `loadCache`, `saveCache`. All guarded with try/catch.
- `src/data.js`: `fetchJSON`, the parsers (`parseAlerts`, `parseObs`, `parseRiver`, `parseFlow`) and `fetchAll`.
- `src/logic.js`: the call logic, pure and DOM free. `buildModel(data, settings, now)` returns the model every render reads: hours, days, `h72`, `cur`, `windows`, `alerts`. Also `assess`, `lvlExcept`, `sunFor`, `lightAt`, `fogLikely`, `windVsCourse`, `flowTrend`, `computeWindows`, `session`.
- `src/state.js`: the mutable `app` object (settings, data, errors, model, UI selection) and `$`.
- `src/render/`: one file per section. `index.js` has `render()`, which rebuilds the model and draws everything. `hero.js`, `now.js`, `windows.js` (with the window panel), `strip.js` (with `select`), `week.js`, and shared builders in `parts.js`.
- `src/settings.js`: settings dialog wiring.
- `src/main.js`: styles, service worker registration, `refresh`, event listeners, startup.
- `src/styles/tokens.css` (colors) and `src/styles/app.css` (everything else).
- `public/`: icons and Cloudflare `_headers`, copied to `dist/` as is.
- `vite.config.js`: PWA manifest and Workbox settings. `wrangler.jsonc`: the Worker.

## Design system

- Colors are CSS custom properties on `:root`, redefined for `prefers-color-scheme: dark` and `[data-theme]`. Light base is a cool fog white (#EEF3F2) with deep river teal (#1E4A52). Dark base is deep river (#0F2329), not near-black. Status: go spruce green, caution maple amber, stay off signal red, each with a soft tint.
- Type is Archivo variable (CSS family name `"Archivo Variable"`), one family. Width does the work: the verdict word is width 125%, weight 850. Numbers are width ~78% with tabular figures.
- The hero verdict is the one loud element. Everything else stays quiet.
- Avoid: all-caps labels, eyebrow labels, middle-dot separators, monospace data labels, identical rounded card grids, decorative gradients.
- Responsive to 360 px. Visible keyboard focus. The strip supports arrow keys. Respect reduced motion.

## Testing

- `npm test` runs Vitest unit tests in `test/` for the call logic and parsers. Add a test when changing `src/logic.js` or `src/data.js`.
- `npm run build` must pass. CI runs both on every push and pull request.

For UI changes, also check in a browser with `npm run dev` or `npm run build && npm run preview`, or with Playwright:

- Load at 390 px wide (light) and 1280 px (dark) in Chromium and WebKit. Wait for data, screenshot, confirm the console is clean.
- Click a best window and confirm the panel opens after the clicked row and closes with Close.
- Abort requests to open-meteo, weather.gov and usgs.gov and confirm the "every data source was blocked" message.

## Open items

- Keene line: keep as a labeled comparison or remove. Undecided.
- Course heading of 15° is an estimate. Confirm on site.
- Water temperature is a downstream proxy. A dock reading can be set in Settings.
- Hours are judged at mid-hour, and window edges are only ever extended to sunrise or sunset, never trimmed. So an evening go window can end up to about 30 minutes after sunset. Decide whether to trim it to sunset.
