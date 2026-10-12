# Putney Row

Rowing conditions for the Connecticut River at the Putney Rowing Club docks, Putney Landing, Vermont. A small installable web app, built with Vite and served from a Cloudflare Worker. No backend.

## What it shows

Night is not shown. The rowing day runs from first light to sunset.

- A go, caution or stay-off call for right now, how long it holds until sunset, and the next go period. Overnight it shows the call for the next morning instead.
- On the water now (daytime only): wind against the course (headwind upstream, crosswind off the VT or NH bank, chop on the straight), air and water temperature, the air plus water cold check, visibility, river flow with a 48 hour trend, daylight, and a measured reading from Keene airport for comparison.
- A fog forecast: valley fog after clear, calm nights and steam fog when cold air sits over warmer water, with an estimate of when it lifts. Shown for now, the next morning, and each morning in Day by day.
- Water state: flat, light chop, chop or rough, from wind along the straight, how long it has blown, and wind against the current. Warns about floating debris when the river is rising fast.
- Day by day for 7 days: morning (first light to 10 AM), midday (10 AM to 3 PM) and afternoon (3 PM to sunset), each with its call, wind against the course, temperature, rain and fog. Tap a row for the full forecast: compass, wind against the course, air, water, the cold check, visibility and fog, rain, flow, daylight, and an hour by hour table.
- Settings for course heading, wind and gust limits, the cold-water line, flow limits, and a water temperature override. Saved in the browser.

## Data sources

All fetched in the browser from free, keyless APIs that allow cross-origin requests.

| Data | Source |
| --- | --- |
| Forecast and current model values | [Open-Meteo](https://open-meteo.com/) (NOAA HRRR and GFS). Weather data by Open-Meteo.com, CC BY 4.0 |
| Alerts | [NWS API](https://www.weather.gov/documentation/services-web-api), alerts for the dock's point |
| Measured comparison | NWS station KEEN, Keene NH, about 14 mi east |
| River flow | USGS 01154500, Connecticut River at North Walpole NH, just below Bellows Falls dam |
| Water temperature | USGS 01161280, Connecticut River near Northfield MA, about 19 mi downstream (nearest main-stem gauge) |

Sunrise, sunset and twilight come from [SunCalc](https://github.com/mourner/suncalc) 1.9.0. Font is [Archivo](https://github.com/Omnibus-Type/Archivo) via Fontsource. Both are bundled, so nothing loads from a CDN.

## Develop

Needs Node 20.19 or newer.

```sh
npm install
npm run dev       # local server with hot reload
npm test          # unit tests for the call logic and parsers
npm run build     # production build into dist/
npm run preview   # serve dist/ locally, with the service worker
```

The code is split into small ES modules under `src/`. The call logic lives in `src/logic.js` and has no DOM access, so it is covered by unit tests. See `CLAUDE.md` for a full map.

## Deploy to Cloudflare

The app deploys as a Cloudflare Worker with static assets. `wrangler.jsonc` points the Worker at `dist/`. There is no Worker script yet.

From your machine:

```sh
npx wrangler login
npm run deploy    # builds, then wrangler deploy
```

Or connect the repo in the Cloudflare dashboard under Workers and Pages, Create, Import a repository. Use build command `npm run build` and deploy command `npx wrangler deploy`. Each push to `main` then deploys.

`npm run cf:dev` runs the built site in Wrangler's local Workers runtime.

`public/_headers` sets long cache lifetimes on hashed build files and keeps the service worker uncached.

## Install on a phone

The app is a PWA. It opens full screen with its own icon, and the app shell loads offline. Data needs a connection; without one, the last data received is shown and labeled as saved.

- iPhone: open the deployed URL in Safari, tap Share, then Add to Home Screen.
- Android: open it in Chrome and tap Install app, or use the menu, Add to Home screen.

New versions install in the background and apply the next time the app opens.

## Defaults

| Setting | Default | Why |
| --- | --- | --- |
| Upstream heading | 15° | Estimate of the reach at Putney Landing |
| Sustained wind | caution 10, stay off 15 mph | Common sculling limits |
| Gusts | caution 18, stay off 25 mph | Model gusts run high for a sheltered river |
| Cold water | caution when air + water < 100°F | Common rowing guideline |
| Flow (North Walpole) | caution 20,000, stay off 28,000 cfs | About the top 10% and top 5% of days since 2016. Median is about 6,900 |

Darkness is stay off. Between first light and sunrise, or sunset and dark, is caution because lights are required. In Day by day, morning calls ignore the need for lights and show a note instead, since every morning starts before sunrise.

These are starting points, not club rules. There is no free lightning feed. Thunderstorms come from model weather codes and NWS warnings, so the 30/30 rule still applies. Look at the water before you launch.
