import { HOUR } from '../../src/config.js';

// A forecast to build a model from in the unit tests, in the shape Open-Meteo
// answers.

// Midnight Eastern (EDT, UTC-4) on Mon 15 June 2026.
export const T0 = Date.UTC(2026, 5, 15, 4);

// A calm, warm response. `over(i, t)` patches individual hours. The hours start
// at `start`, midnight in the zone of the place.
export function wx(over = () => ({}), days = 3, start = T0) {
  const n = days * 24, H = {
    time: [], temperature_2m: [], apparent_temperature: [], dew_point_2m: [], precipitation_probability: [],
    precipitation: [], weather_code: [], wind_speed_10m: [], wind_gusts_10m: [], wind_direction_10m: [], visibility: [], cape: [], cloud_cover: []
  };
  for (let i = 0; i < n; i++) {
    const t = start + i * HOUR;
    const h = { temp: 72, feels: 72, dew: 55, pop: 0, precip: 0, code: 0, wind: 4, gust: 8, dir: 200, vis: 24000, cape: 0, cloud: 10, ...over(i, t) };
    H.time.push(t / 1000);
    H.temperature_2m.push(h.temp); H.apparent_temperature.push(h.feels); H.dew_point_2m.push(h.dew);
    H.precipitation_probability.push(h.pop); H.precipitation.push(h.precip); H.weather_code.push(h.code);
    H.wind_speed_10m.push(h.wind); H.wind_gusts_10m.push(h.gust); H.wind_direction_10m.push(h.dir);
    H.visibility.push(h.vis); H.cape.push(h.cape); H.cloud_cover.push(h.cloud);
  }
  const D = { time: [], sunrise: [], sunset: [], temperature_2m_max: [], temperature_2m_min: [], precipitation_probability_max: [] };
  for (let d = 0; d < days; d++) {
    const t = start + d * 24 * HOUR;
    D.time.push(t / 1000); D.sunrise.push((t + 5.2 * HOUR) / 1000); D.sunset.push((t + 20.5 * HOUR) / 1000);
    D.temperature_2m_max.push(80); D.temperature_2m_min.push(60); D.precipitation_probability_max.push(0);
  }
  return { hourly: H, daily: D };
}
