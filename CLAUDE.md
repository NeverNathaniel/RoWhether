# CLAUDE.md

Context for working on this repo. Read before making changes.

## Working style

- Plan first, get agreement, then build. Never run destructive or broad operations (force push, history rewrite, deleting branches, changing repo visibility) without an explicit go-ahead.
- Prefer vetted, community-standard solutions over new tooling. Keep it simple.
- Before revising code, critique it against specific criteria and write the findings down, then change it.
- Writing in UI and docs: direct, calm, short sentences. No em dashes. No emojis. Sentence case.

## What this is

A single-page rowing conditions app for the Connecticut River at the Putney Rowing Club docks, Putney Landing, VT. Used mostly on phones, installed to the home screen as a PWA. Vanilla JS ES modules bundled with Vite. No framework. Deployed as a Cloudflare Worker that serves the built static files. The Worker has one API route, `/api/suggest`, for the suggestion form; everything else is static.

## Hard constraints

- No runtime loads from third-party CDNs. SunCalc 1.9.0 and the Archivo variable font (`@fontsource-variable/archivo`) are npm dependencies bundled into the build, so the app shell works offline. Pin exact versions in `package.json` for anything added. One exception: the Cloudflare Turnstile script, which cannot be bundled. It loads only when the suggestion form is first opened.
- Weather and river data is fetched client-side from keyless APIs that send `Access-Control-Allow-Origin: *`. The browser never holds an API key. Anything that needs a key goes in the Worker (`worker/`), with the key stored as a Worker secret, never in the repo or `wrangler.jsonc`.
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
- USGS 30 day daily mean flow: `https://api.waterdata.usgs.gov/ogcapi/v0/collections/daily/items?monitoring_location_id=USGS-01154500&parameter_code=00060&statistic_id=00003&time=P30D&limit=100&properties=time,value&f=json`. The latest day lags by a day or two.
- NWS river forecast for the same gauge (NWPS id WLPN3, NERFC), 3 days in 6-hour steps, flow in kcfs: `https://api.water.noaa.gov/nwps/v1/gauges/WLPN3/stageflow/forecast`. Information only; the call uses the latest measured flow.
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

Precipitation is information on top of the rain chance rules above:

- `precipKind()` names what is falling from the weather code (drizzle, rain, showers, snow, freezing rain, thunderstorms). `rateWord()` calls an hourly amount light, moderate or heavy (0.1 and 0.3 in/hr).
- `precipSummary(hours)` gives the peak chance and its hour, the run of hours within 10 points of the peak ("most likely 1 to 3 PM"), the total amount, and the most common kind among hours with at least 30% or a measurable amount.
- The Precipitation section (`precipBlock()` in `src/render/precip.js`) appears in two places. On the water now covers from the current hour to 6 hours ahead or sunset, whichever is first, led by what is falling now. Each full forecast covers its period. The section has a headline chance (colored by the worst precipitation reason in the window), timing, kind and amount, and an hourly column chart (`precipChart()` in `src/render/parts.js`). Columns over the rain caution or stay-off setting take that status color, and the settings are drawn as labeled dashed lines. Only the peak is labeled. Tapping, hovering or focusing a column shows that hour under the chart. The hour table keeps the Rain column as the full set of values.

Wind vs course uses `relWind()`: the angle between where the wind comes from and the upstream heading. Within 60° either way is head or tail; otherwise crosswind, with the side named as the NH (east) or VT (west) bank.

## Detail views

The home screen is the quick answer. The Details button in the header opens a menu of six views, each with a one-line live summary; tapping a fact in On the water now or in a full forecast opens the matching view (for that day, from a forecast). Views: Overview, Wind, Rain, Temperature, Fog, River (`src/render/detail/`).

- Hash routes: `#wind`, or `#wind/2026-10-14` for one day (`src/route.js`). The home screen is no hash. Each history entry stores its depth from home, so the back link returns to the home entry, and a view opened from a bookmark still has a way home. Home scroll position is restored.
- Each day-based view has a week strip (one button per day, a small bar and value, colored by that factor's worst level) that picks the day, then a chart of that day's rowing window (fog: midnight to 11 AM), a legend, a readout for the tapped hour, an "Hour by hour" table twin, and a "How this works" panel that states the rules with the current settings. A picked day carries across views.
- Charts use `Chart` in `src/render/chart.js`: one time axis, stacked lanes each with their own y scale (no dual axes), settings as dashed status lines, hit columns spanning all lanes. Charts are drawn at the measured page width so SVG text is real size, and redrawn on resize.
- Color: river teal for the main series, muted gray for a secondary one, status colors only where they mean go, caution or stay off. Go and stay off are close for red-green color blindness, so stay-off squares in the Overview grid carry a diagonal stroke.

## Code map

- `index.html`: page markup, the settings `<dialog>`, the Details menu `<dialog>`, and the detail view container (`#detail`, next to `#home`). Loads `src/main.js`.
- `src/config.js`: location, endpoints (`SRC`), `DEFAULTS`, storage keys, copy tables (`CHIP`, `THEN`, `WORD`), and `FACTORS` (groups of reasons for the Overview grid).
- `src/format.js`: Eastern-time formatters and text helpers (`dayKey`, `hm`, `whenText`, `card`, `rng`, `esc`).
- `src/storage.js`: `loadSettings`, `saveSettings`, `loadCache`, `saveCache`. All guarded with try/catch.
- `src/data.js`: `fetchJSON`, the parsers (`parseAlerts`, `parseObs`, `parseRiver`, `parseFlow`, `parseFlowDays`, `parseFlowForecast`) and `fetchAll`.
- `src/logic.js`: the call logic, pure and DOM free. `buildModel(data, settings, now)` returns the model every render reads: hours, days, `h72`, `cur`, `alerts`. Also `assess`, `lvlExcept`, `sunFor`, `lightAt`, `fogRisk`, `morningFog`, `nextMorning`, `windVsCourse`, `precipKind`, `rateWord`, `precipSummary`, `flowTrend`, `flowChange`, `chopWind`, `waterState`, `waterWhy`, `debrisLikely`, `periodsFor`, and for the detail views `rowingHours`, `factorLevel`, `worstOf`, `flowForecastAt`, `flowForecastPeak`. The model also has `daytime`, `next`, and `periods` on each day.
- `src/state.js`: the mutable `app` object (settings, data, errors, model, UI selection) and `$`.
- `src/render/`: one file per section. `index.js` has `render()`, which rebuilds the model and draws everything, including the open detail view. `hero.js`, `now.js`, `days.js` (Day by day rows, plus period text helpers the hero reuses), `forecast.js` (the full forecast a row opens to, built when opened), `precip.js` (the precipitation section both use, and `precipNote()`), and shared builders in `parts.js` (`fact()` takes an optional detail view link).
- `src/render/chart.js`: the SVG chart kit for the detail views (`Chart`, `niceTicks`, `niceMax`).
- `src/render/detail/`: `index.js` (the `VIEWS` registry, `renderDetail()`, `renderMenu()`), `common.js` (week strip, legend, chart box, hour table, chart width), and one file per view. Each view exports `key`, `name`, `summary(m)` and `render(m, day)`.
- `src/route.js`: `parseRoute`, `initRoutes`, `goHome`, `setDay`.
- `src/settings.js`: settings dialog wiring.
- `src/main.js`: styles, service worker registration, `refresh`, event listeners, startup.
- `src/styles/tokens.css` (colors) and `src/styles/app.css` (everything else).
- `public/`: icons and Cloudflare `_headers`, copied to `dist/` as is. `icon.svg` is the app icon source (a sculler crossing a low sun at dawn); `npm run icons` renders the PNGs from it. `favicon.svg` is a simplified version for browser tabs. Keep icon artwork inside the maskable safe zone, a circle of radius 205 around the center of the 512 canvas.
- `src/suggest.js`: the suggestion dialog. Asks `GET /api/suggest` whether the feature is configured, shows the button if so, lazy-loads Turnstile, posts the text plus app context (version, screen, browser, settings).
- `vite.config.js`: PWA manifest and Workbox settings (the service worker never handles `/api/*`), and `__APP_VERSION__` (package version plus commit when built on Cloudflare). `wrangler.jsonc`: the Worker, its asset binding, `run_worker_first: ["/api/*"]`, the `GITHUB_REPO` var and the `SUGGEST_LIMIT` rate limiter (3 a minute per connection).
- `worker/index.js`: routes `/api/suggest`, 404s other `/api/*`, serves everything else from `env.ASSETS`.
- `worker/suggest.js`: `handleSuggest()`. Checks in order: secrets configured, rate limit, text length (10 to 2,000), Turnstile, Claude, then files the issue. Dependencies are injectable for tests. `buildIssue()` quotes the original, neutralizes `@mentions`, adds app context to bugs only, labels `bug` or `enhancement` plus `from app` and `needs review`.
- `worker/claude.js`: one `client.beta.messages.create` call to `claude-opus-5-5` at `effort: "low"`, with a JSON schema in `output_config.format` and `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) so a safety decline retries on Anthropic's recommended fallback. `parseRewrite()` treats a refusal as a rejection.
- `worker/github.js`, `worker/turnstile.js`: the issue create call and siteverify (action must be `suggest`).
- Worker secrets, set in the Cloudflare dashboard: `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` (fine-grained, Issues write on this repo only), `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`. Local dev reads `.dev.vars` (git ignored).

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
- `test/suggest.test.js` covers the Worker with Turnstile, Claude and GitHub stubbed. Nothing in the tests calls a paid API. `npx wrangler deploy --dry-run` checks the Worker bundles.

For UI changes, also check in a browser with `npm run dev` or `npm run build && npm run preview`, or with Playwright:

- Load at 390 px wide (light) and 1280 px (dark) in Chromium and WebKit. Wait for data, screenshot, confirm the console is clean.
- Pin the page clock (`page.clock.install`) to midday and to 9 PM. Midday shows the live call and On the water now. 9 PM hides On the water now and the hero shows tomorrow morning.
- Open a Day by day row and confirm the full forecast (facts and hour table) shows. The `toggle` event is async, so wait for `.forecast` before checking.
- Abort requests to open-meteo, weather.gov, usgs.gov and water.noaa.gov and confirm the "every data source was blocked" message.
- Open each detail view (`#overview`, `#wind`, `#rain`, `#temperature`, `#fog`, `#river`) at 360, 390 and 1280 px. Confirm no horizontal page scroll, the week strip labels fit, the header buttons stay on one row, and tapping a chart fills the readout. At 9 PM the Fog view opens on tomorrow morning. The back link returns home with the scroll position kept.

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
