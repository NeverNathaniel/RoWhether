// Location, endpoints, defaults and copy shared across the app.

// The production address, for shared links and link previews.
export const SITE_URL = 'https://rowhether.com/';

// What every location starts from, before its own thresholds and the viewer's
// changes (01 11.5). No heading (it lives in the course) and no flow limits
// (those come from the location's gauge history, or stay blank).
export const GLOBAL_DEFAULTS = {
  windCaution: 10, windOff: 15, gustCaution: 18, gustOff: 25,
  rainCaution: 60, rainOff: 90, // percent chance; blank turns a level off
  coldCombined: 100, waterOverride: '',
  aqiCaution: 151, aqiOff: 201 // US AQI: Unhealthy and Very unhealthy; blank turns a level off
};

// localStorage keys (08 8.2): rowhether-<name>-v<n>, with :<slug> on entries
// that belong to one location.
export const KEYS = {
  settings: 'rowhether-settings-v2',
  cache: slug => 'rowhether-cache-v2:' + slug,
  plan: 'rowhether-plan-v1',
  install: 'rowhether-install-v1',
  nudge: 'rowhether-nudge-v1',
  migrated: 'rowhether-migrated-v1',
  last: 'rowhether-last-v1'
};
// The keys the app used before locations (08 8.3). migrateStorage() copies them
// to KEYS and leaves them in place. The install key was v2 then: it counts
// dismissals, and the v1 key held a 30-day snooze that is ignored.
export const OLD_KEYS = {
  settings: 'putney-rowing-settings-v1',
  cache: 'putney-rowing-cache-v1',
  plan: 'putney-rowing-plan-v1',
  install: 'putney-rowing-install-v2',
  nudge: 'putney-rowing-nudge-v1'
};
// Install bar: Not now hides it until the next visit. After this many
// dismissals it also offers Don't show again. Coming back to the tab after
// INSTALL_VISIT_GAP_MS away counts as a new visit.
export const INSTALL_ASKS = 5;
export const INSTALL_VISIT_GAP_MS = 30 * 60e3;
// Longest suggestion the form accepts. worker/suggest.js has the same limit.
export const MAX_TEXT = 2000;
export const REFRESH_MS = 10 * 60 * 1000;
export const HOUR = 3600e3, MIN = 60e3;
export const LIGHT_KEYS = ['dark', 'twilight'];

// Parts of the day. Edges are first light, sunset, or a local clock hour.
// Night is not shown.
export const PERIODS = [
  { key: 'morning', name: 'Morning', from: 'dawn', to: 10 },
  { key: 'midday', name: 'Midday', from: 10, to: 15 },
  { key: 'afternoon', name: 'Afternoon', from: 15, to: 'sunset' }
];

// Fog thresholds. Valley (radiation) fog needs air near the dew point, light
// wind and a clear night. Steam fog needs cold air over much warmer water.
// Both are only checked from midnight through the 10 AM hour.
export const FOG = {
  lastHour: 10,
  valley: { likely: { spread: 2, wind: 4, cloud: 50 }, possible: { spread: 4, wind: 6, cloud: 80 } },
  steam: { likely: { diff: 18, wind: 6, rh: 75 }, possible: { diff: 10, wind: 8, rh: 60 } },
  codes: [45, 48] // Open-Meteo fog and rime fog
};

// Water state: chop from wind. Wind along the straight has a long fetch and
// counts fully; crosswind only crosses the river and counts for less. Chop
// builds and settles over a couple of hours, so recent hours are blended in.
// Wind blowing upstream against a strong current steepens it. The weight of
// crosswind and the flow steps are the location's (water.cross, flow.against).
export const WATER = {
  levels: [5, 9, 13],          // chop wind, mph: light chop, chop, rough
  blend: [0.5, 0.3, 0.2],      // this hour, 1 hour ago, 2 hours ago
  debrisRise: 20,              // % flow rise in 6 hours that suggests debris
  names: ['Flat water', 'Light chop', 'Chop', 'Rough water'],
  short: ['Flat', 'Light', 'Chop', 'Rough']
};

// Forecast models compared for confidence. The main forecast is Open-Meteo's
// best match, mostly HRRR and GFS here.
export const MODELS = [
  { id: 'gfs_seamless', name: 'GFS (US)' },
  { id: 'ecmwf_ifs025', name: 'ECMWF (Europe)' },
  { id: 'gem_seamless', name: 'GEM (Canada)' },
  { id: 'icon_seamless', name: 'ICON (Germany)' }
];
// How far apart the models can be before confidence drops. wind: mean spread
// of sustained wind in mph. rain: share of hours where some models show rain
// and others do not.
export const CONFIDENCE = { medium: { wind: 4, rain: 0.25 }, low: { wind: 8, rain: 0.5 } };

// US AQI categories, for words only. The call uses the settings.
export const AQI = [[50, 'Good'], [100, 'Moderate'], [150, 'Unhealthy for sensitive groups'], [200, 'Unhealthy'], [300, 'Very unhealthy'], [Infinity, 'Hazardous']];

// Groups of assess() reasons, one row each in the Overview detail view.
export const FACTORS = [
  { key: 'wind', name: 'Wind', keys: ['wind', 'gust'] },
  { key: 'rain', name: 'Rain', keys: ['pop', 'rain', 'snow', 'ice'] },
  { key: 'storm', name: 'Thunder', keys: ['storm', 'stormrisk'] },
  { key: 'air', name: 'Air quality', keys: ['aqi'] },
  { key: 'fog', name: 'Fog', keys: ['fog'] },
  { key: 'cold', name: 'Cold', keys: ['freeze', 'cold'] },
  { key: 'flow', name: 'River', keys: ['flow'] },
  { key: 'alert', name: 'Alerts', keys: ['alert'] }
];

// Short phrases for "then ..." in the hero
export const THEN = { dark: 'dark', twilight: 'lights needed', storm: 'thunderstorms', stormrisk: 'a storm risk', ice: 'freezing rain', snow: 'snow', rain: 'heavy rain', wind: 'the wind builds', pop: 'rain likely', gust: 'gusts build', fog: 'fog', freeze: 'freezing temps', cold: 'cold-water caution', flow: 'high water', alert: 'an NWS alert', aqi: 'smoky air' };
export const WORD = ['Go.', 'Caution.', 'Stay off.'];
export const WORD_PLAIN = ['Go', 'Caution', 'Stay off'];
