# RoWhether

Rowing conditions for a list of locations, with Putney Landing, Vermont first: the Connecticut River at the Putney Rowing Club docks. Six more are a test set by water type: two rivers, two lakes, a reservoir below a dam and a tidal river. A small installable web app, built with Vite and served from a Cloudflare Worker. The browser fetches the conditions itself. The Worker serves the files and answers a few small routes: the suggestion form, dock reports, the open counter and the owner's Metrics tab.

## What it shows

Night is not shown. The rowing day runs from first light to sunset.

- Locations: the name in the header opens a picker with a search, Near me and a town search, and each location has its own address, such as `/putney-landing`. A first visit to `/` shows Putney Landing with a note that offers the picker. The six test locations show "Not confirmed on site", since no club has confirmed their dock points yet.

- A go, caution or stay-off call for right now, how long it holds until sunset, and the next go period. Overnight it shows the call for the next morning instead.
- On the water now (daytime only): wind against the course (headwind upstream, crosswind off the VT or NH bank, chop on the straight), air and water temperature, the air plus water cold check, visibility, river flow with a 48 hour trend, daylight, and a measured reading from the nearest airport station for comparison (Keene at Putney).
- A fog forecast: valley fog after clear, calm nights and steam fog when cold air sits over warmer water, with an estimate of when it lifts. Shown for now, the next morning, and each morning in Day by day.
- Precipitation: an hour by hour chart of the chance, with when it is most likely, what kind, and how much. Shown in On the water now for the next 6 hours (or until sunset), and in each full forecast for its period.
- Water state: flat, light chop, chop or rough, from wind along the straight, how long it has blown, and wind against the current. Warns about floating debris when the river is rising fast.
- Day by day for 7 days: morning (first light to 10 AM), midday (10 AM to 3 PM) and afternoon (3 PM to sunset), each with its call, wind against the course, temperature, rain and fog. Tap a row for the full forecast: compass, wind against the course, air, water, the cold check, visibility and fog, rain, flow, daylight, and an hour by hour table.
- Tabs under the header: Now (everything above), then views with charts and the reasoning behind each part of the call. Tapping a fact opens its tab.
  - Week: Plan a row (pick a session length and time of day, get the calmest go session each day), then each day as one bar from first light to sunset, with what stands in the way in words.
  - Wind: wind and gusts against your settings, direction relative to the course, water state, and the range across forecast models.
  - Rain: chance against your settings, amount, thunderstorm risk, and how many forecast models show rain.
  - Storms: NWS alerts on a timeline, and thunderstorm risk with what it is built from.
  - Temperature: air and feels like against the freezing and cold-water lines, with water temperature.
  - Air: air quality (US AQI and PM2.5), mostly wildfire smoke, against your settings.
  - Fog: each morning's risk, and the ingredients the fog rules use, each drawn with its zone.
  - Light: first light, sunrise, sunset and dark, the UV index, and six months of daylight on one chart.
  - River: the last 2 days with the NWS forecast for the next 3, and the last 30 days of daily flow. Only for a location with a gauge.
  - Tide: for a tidal location, the NWS tide height forecast for 3 days, with each high and low. Information only.
- Forecast confidence: four forecast models compared on wind and rain, shown in Wind, Rain and Week.
- Share this forecast, under the verdict: sends it with the location's page to a team chat or copies it.
- Dock reports (dev only for now): one tap at the dock to say what the water is doing, shown to everyone for 3 hours.
- A suggestion form at the bottom. Claude rewrites each suggestion as a GitHub issue, labeled for the maintainer to review. Hidden until it is set up (see below).
- Settings for course heading, wind and gust limits, rain chance limits, the cold-water line, flow limits, and a water temperature override. Saved in the browser, for each location.

## Data sources

All fetched in the browser from free, keyless APIs that allow cross-origin requests. This table is Putney Landing's. Each location's own sources are the rows of its record in `data/`.

| Data | Source |
| --- | --- |
| Forecast and current model values | [Open-Meteo](https://open-meteo.com/) (NOAA HRRR and GFS). Weather data by Open-Meteo.com, CC BY 4.0 |
| Alerts | [NWS API](https://www.weather.gov/documentation/services-web-api), alerts for the forecast zones and counties on both banks (VTZ015, VTC025, NHZ011, NHC005) |
| Measured comparison | NWS station KEEN, Keene NH, about 14 mi east |
| River flow | USGS 01154500, Connecticut River at North Walpole NH, just below Bellows Falls dam. Latest, 48 hours, and 30 days of daily means |
| Air quality | [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) (Copernicus CAMS), US AQI and PM2.5 |
| Model comparison | Open-Meteo, GFS, ECMWF, GEM and ICON side by side |
| River forecast | [NWS National Water Prediction Service](https://water.noaa.gov/gauges/wlpn3), gauge WLPN3 (same site), from the Northeast River Forecast Center |
| Water temperature | USGS 01161280, Connecticut River near Northfield MA, about 19 mi downstream (nearest main-stem gauge) |

Sunrise, sunset and twilight come from [SunCalc](https://github.com/mourner/suncalc) 1.9.0. Font is [Archivo](https://github.com/Omnibus-Type/Archivo) via Fontsource. Both are bundled, so nothing loads from a CDN.

## Production and dev

Production is [rowhether.com](https://rowhether.com/), a custom domain on the `rowhether` Worker. Cloudflare Workers Builds deploys it on every push to the default branch, `master`. The `dev` branch is a separate dev instance: with Preview builds on, Cloudflare builds it at `dev-rowhether.<your-subdomain>.workers.dev` with its own settings and its own D1 database (`rowhether-dev`), and the app shows a Dev label. See the `previews` block in `wrangler.jsonc`.

To turn on Preview builds: Cloudflare dashboard, Workers & Pages, rowhether, Settings, Build. If a "Set up Worker Previews" banner shows, select Set up and switch. Then under Branch control check Enable Preview Builds. The Preview command should be `npx wrangler preview`.

## Develop

Needs Node 20.19 or newer.

```sh
npm install
npm run dev       # local server with hot reload
npm test          # unit tests for the call logic, parsers, locations and Worker
npm run test:browser  # builds, then Playwright in Chromium (see CLAUDE.md, Testing)
npm run build     # production build into dist/
npm run preview   # serve dist/ locally, with the service worker
```

The code is split into small ES modules under `src/`. The call logic lives in `src/logic.js` and has no DOM access, so it is covered by unit tests. See `CLAUDE.md` for a full map.

## Locations

A curated location is a record in `data/locations/<slug>.json` and a waterway in `data/waterways/`. The build checks every file, fails with the file and field of each problem, and writes `locations/index.json`, one `locations/<slug>.json` per record and a `<slug>.html` page for first visits and link previews. A commit that edits a record raises its `revision` by 1, so an installed copy reads the change; CI checks it. `node scripts/check-sources.mjs` asks every source of every record live, and `node scripts/locations/flowstats.mjs USGS-<id>` suggests flow limits from a gauge's history. CLAUDE.md has the code map and the rules.

## Deploy to Cloudflare

The app deploys as a Cloudflare Worker with static assets. `wrangler.jsonc` points the Worker at `dist/`, and `worker/index.js` serves it and answers `/api/*`.

From your machine:

```sh
npx wrangler login
npm run deploy    # builds, then wrangler deploy
```

Or connect the repo in the Cloudflare dashboard under Workers and Pages, Create, Import a repository. Use build command `npm run build` and deploy command `npx wrangler deploy`. Each push to `master` then deploys.

`npm run cf:dev` runs the built site in Wrangler's local Workers runtime.

`public/_headers` sets long cache lifetimes on hashed build files and keeps the service worker uncached.

## Set up the suggestion form

The form at the bottom of the page sends text to `/api/suggest` on the Worker (`worker/`). The Worker checks Cloudflare Turnstile, asks Claude (Claude Haiku 5.5) to classify the text as a feature, a bug or spam and rewrite it, then opens a GitHub issue labeled `from app` and `needs review`. The person sees a thank-you, not a link. The button stays hidden until all four secrets below are set.

1. **Anthropic API key.** At [console.anthropic.com](https://console.anthropic.com), create an API key. Under limits, set a monthly spend limit, for example $10. Each suggestion costs well under a cent.
2. **GitHub token.** At GitHub, Settings, Developer settings, Personal access tokens, Fine-grained tokens, generate a token. Repository access: only `NeverNathaniel/RoWhether`. Permissions: Issues, read and write. Nothing else. Note the expiry date and renew it before then.
3. **Labels.** In the repository, under Issues, Labels, create `from app` and `needs review`. `bug` and `enhancement` exist by default.
4. **Turnstile.** In the Cloudflare dashboard, open Turnstile and add a widget. Hostnames: `rowhether.com` and the `workers.dev` address. Mode: Managed. Copy the site key and the secret key.
5. **Add the secrets to the Worker.** In Workers and Pages, open `rowhether`, then Settings, Variables and Secrets. Add each of these with type **Secret** (secrets survive deploys; plain text variables added in the dashboard do not):
   - `ANTHROPIC_API_KEY`
   - `GITHUB_TOKEN`
   - `TURNSTILE_SITE_KEY`
   - `TURNSTILE_SECRET_KEY`
6. Reload the app. The "Suggest a change or report a bug" button appears above the footer.

Protection against abuse: Turnstile on every send, a limit of 3 sends a minute per connection, a 2,000 character cap, and Claude rejecting spam. Claude only fills in the title, summary and details; the original text is always quoted in the issue, and `@mentions` are neutralized so nobody gets pinged.

For local testing with `npm run cf:dev`, put the four values in a `.dev.vars` file (it is git ignored). Cloudflare's Turnstile test keys load the widget, but the form is refused with them: the Worker checks the token's action, and the testing secret's answer carries none (`docs/full-app/08-architecture.md` 10.8).

## Install on a phone

The app is a PWA. It opens full screen with its own icon, and the app shell loads offline. Data needs a connection; without one, the last data received is shown and labeled as saved.

- iPhone: open the deployed URL in Safari, tap Share, then Add to Home Screen. The app opens on the last location you viewed.
- Android: open it in Chrome and tap Install app, or use the menu, Add to Home screen.

A new version installs in the background, takes over the open page and reloads it once. Settings and the last forecast are kept.

## Defaults

Every location starts from these. A record may set its own, and Settings shows the location's value as the default. The heading and flow rows are Putney's: every other record sets its own course and, when it has a gauge, its own flow limits.

| Setting | Default | Why |
| --- | --- | --- |
| Upstream heading | 15° | Estimate of the reach at Putney Landing |
| Sustained wind | caution 10, stay off 15 mph | Common sculling limits |
| Gusts | caution 18, stay off 25 mph | Model gusts run high for a sheltered river |
| Rain chance | caution 60%, stay off 90% | Starting points. Leave either blank to turn it off |
| Cold water | caution when air + water < 100°F | Common rowing guideline |
| Flow (North Walpole) | caution 20,000, stay off 28,000 cfs | About the top 10% and top 5% of days since 2016. Median is about 6,900 |

Darkness is stay off. Between first light and sunrise, or sunset and dark, is caution because lights are required. In Day by day, morning calls ignore the need for lights and show a note instead, since every morning starts before sunrise.

These are starting points, not club rules. There is no free lightning feed. Thunderstorms come from model weather codes and NWS warnings, so the 30/30 rule still applies. Look at the water before you launch.
