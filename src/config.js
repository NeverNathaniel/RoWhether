// Location, endpoints, defaults and copy shared across the app.

// The production address, for shared links and link previews.
export const SITE_URL = 'https://rowhether.com/';

export const LOC = { lat: 42.9607, lon: -72.5219, tz: 'America/New_York' };

export const DEFAULTS = {
  heading: 15, windCaution: 10, windOff: 15, gustCaution: 18, gustOff: 25,
  rainCaution: 60, rainOff: 90, // percent chance; blank turns a level off
  coldCombined: 100, flowCaution: 20000, flowOff: 28000, waterOverride: '',
  aqiCaution: 151, aqiOff: 201 // US AQI: Unhealthy and Very unhealthy; blank turns a level off
};

export const SET_KEY = 'putney-rowing-settings-v1';
export const PLAN_KEY = 'putney-rowing-plan-v1';
export const CACHE_KEY = 'putney-rowing-cache-v1';
export const INSTALL_KEY = 'putney-rowing-install-v1';
export const NUDGE_KEY = 'putney-rowing-nudge-v1';
// How long Not now hides the install bar.
export const INSTALL_SNOOZE_MS = 30 * 24 * 3600e3;
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
// Wind blowing upstream against a strong current steepens it.
export const WATER = {
  levels: [5, 9, 13],          // chop wind, mph: light chop, chop, rough
  cross: 0.4,                  // weight of crosswind
  blend: [0.5, 0.3, 0.2],      // this hour, 1 hour ago, 2 hours ago
  against: [[20000, 1.4], [10000, 1.25]], // flow cfs and multiplier
  debrisRise: 20,              // % flow rise in 6 hours that suggests debris
  names: ['Flat water', 'Light chop', 'Chop', 'Rough water'],
  short: ['Flat', 'Light', 'Chop', 'Rough']
};

export const GAUGE_FLOW = 'USGS-01154500';
export const GAUGE_TEMP = 'USGS-01161280';
// NWS river forecast point at the same North Walpole gauge (NERFC).
export const NWS_GAUGE = 'WLPN3';

export const SRC = {
  wx: () => 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: LOC.lat, longitude: LOC.lon,
    current: 'temperature_2m,apparent_temperature,dew_point_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code,visibility',
    hourly: 'temperature_2m,apparent_temperature,dew_point_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,cape,cloud_cover,uv_index',
    daily: 'sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max',
    wind_speed_unit: 'mph', temperature_unit: 'fahrenheit', precipitation_unit: 'inch',
    timezone: LOC.tz, timeformat: 'unixtime', forecast_days: '7'
  }).toString(),
  alerts: () => `https://api.weather.gov/alerts/active?point=${LOC.lat},${LOC.lon}`,
  obs: () => 'https://api.weather.gov/stations/KEEN/observations/latest',
  river: () => `https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items?monitoring_location_id=${GAUGE_FLOW},${GAUGE_TEMP}&parameter_code=00060,00010&f=json`,
  flow: () => `https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous/items?monitoring_location_id=${GAUGE_FLOW}&parameter_code=00060&time=P2D&limit=1000&properties=time,value&f=json`,
  flowDays: () => `https://api.waterdata.usgs.gov/ogcapi/v0/collections/daily/items?monitoring_location_id=${GAUGE_FLOW}&parameter_code=00060&statistic_id=00003&time=P30D&limit=100&properties=time,value&f=json`,
  flowFcst: () => `https://api.water.noaa.gov/nwps/v1/gauges/${NWS_GAUGE}/stageflow/forecast`,
  aq: () => 'https://air-quality-api.open-meteo.com/v1/air-quality?' + new URLSearchParams({
    latitude: LOC.lat, longitude: LOC.lon, hourly: 'us_aqi,pm2_5',
    timezone: LOC.tz, timeformat: 'unixtime', forecast_days: '5'
  }).toString(),
  models: () => 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: LOC.lat, longitude: LOC.lon, hourly: 'wind_speed_10m,precipitation',
    models: MODELS.map(x => x.id).join(','),
    wind_speed_unit: 'mph', precipitation_unit: 'inch',
    timezone: LOC.tz, timeformat: 'unixtime', forecast_days: '7'
  }).toString()
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

export const SOURCE_NAMES = { wx: 'the forecast', alerts: 'NWS alerts', obs: 'Keene observations', river: 'USGS river gauges', flow: 'USGS flow history', flowDays: 'USGS daily flow', flowFcst: 'the NWS river forecast', aq: 'the air quality forecast', models: 'the model comparison' };

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
