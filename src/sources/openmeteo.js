// Open-Meteo adapters: the forecast, air quality and the model comparison. Like
// every module in src/sources/, pure: no DOM, no storage.
import { MODELS, HOUR } from '../config.js';

const num = v => (v == null || v === '' || isNaN(v) ? null : +v);

// Hourly US AQI and PM2.5 (µg/m³), with times in ms.
export function parseAQ(d) {
  const H = d.hourly || {};
  return (H.time || [])
    .map((t, i) => ({ t: t * 1000, aqi: num(H.us_aqi && H.us_aqi[i]), pm25: num(H.pm2_5 && H.pm2_5[i]) }))
    .filter(x => x.aqi != null || x.pm25 != null);
}

// Hourly sustained wind and precipitation from each compared model, in the
// order of MODELS. A model missing from the response is left out.
export function parseModels(d, b) {
  const H = d.hourly || {};
  const ids = (b?.params?.models || MODELS.map(x => x.id)).filter(id => H[`wind_speed_10m_${id}`] || H[`precipitation_${id}`]);
  const col = (k, id, i) => num(H[`${k}_${id}`] && H[`${k}_${id}`][i]);
  return {
    ids,
    hours: (H.time || []).map((t, i) => ({
      t: t * 1000,
      wind: ids.map(id => col('wind_speed_10m', id, i)),
      precip: ids.map(id => col('precipitation', id, i))
    }))
  };
}

// The three have no stored row: Open-Meteo at the location's point (01 4.1).
export const forecast = {
  key: 'om-forecast', slot: 'wx', regions: ['*'], via: 'browser', hosts: ['https://api.open-meteo.com'],
  refreshMs: null, staleMs: 24 * HOUR,
  bind: () => ({}),
  url: (b, loc) => 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: loc.lat, longitude: loc.lon,
    current: 'temperature_2m,apparent_temperature,dew_point_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code,visibility',
    hourly: 'temperature_2m,apparent_temperature,dew_point_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,cape,cloud_cover,uv_index',
    daily: 'sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max',
    wind_speed_unit: 'mph', temperature_unit: 'fahrenheit', precipitation_unit: 'inch',
    timezone: loc.tz, timeformat: 'unixtime', forecast_days: '7'
  }).toString(),
  parse: d => d,
  label: () => 'the forecast'
};

export const airQuality = {
  key: 'om-aq', slot: 'aq', regions: ['*'], via: 'browser', hosts: ['https://air-quality-api.open-meteo.com'],
  refreshMs: null, staleMs: 24 * HOUR,
  bind: () => ({}),
  url: (b, loc) => 'https://air-quality-api.open-meteo.com/v1/air-quality?' + new URLSearchParams({
    latitude: loc.lat, longitude: loc.lon, hourly: 'us_aqi,pm2_5',
    timezone: loc.tz, timeformat: 'unixtime', forecast_days: '5'
  }).toString(),
  parse: parseAQ,
  label: () => 'the air quality forecast'
};

export const models = {
  key: 'om-models', slot: 'models', regions: ['*'], via: 'browser', hosts: ['https://api.open-meteo.com'],
  refreshMs: null, staleMs: 24 * HOUR,
  bind: () => ({ models: MODELS.map(x => x.id) }),
  url: (b, loc) => 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
    latitude: loc.lat, longitude: loc.lon, hourly: 'wind_speed_10m,precipitation',
    models: b.params.models.join(','),
    wind_speed_unit: 'mph', precipitation_unit: 'inch',
    timezone: loc.tz, timeformat: 'unixtime', forecast_days: '7'
  }).toString(),
  parse: parseModels,
  label: () => 'the model comparison'
};
