// Variant cases for the golden outputs: the four scenarios at other clocks,
// and with their upstream data cut, emptied or pushed to extremes.
//
// The 19 cases of 08 section 14.2 reach the usual branches. These reach the
// ones a refactor is most likely to break without anyone noticing: a source
// that failed and left nothing, a forecast with gaps, a river above the stay
// off line, smoke above 200, an alert with no end, a clock at the last hour of
// the forecast, and the clocks changing in spring.
//
// Nothing here imports from src/. An edit takes the raw responses the
// scenario would send (the shapes the parsers read) or, for a source that
// failed on the first load and left nothing, the parsed data.
//
//   name       the golden file is test/golden/<name>.json
//   scenario   a key of SCENARIOS or EXTRA_SCENARIOS
//   hr or at   the clock, in hours after the scenario's first midnight, or a UTC ms
//   settings   'default', 'custom' (the cases' own), or 'blank', 'tight', 'edge', 'cold144', 'rain1', 'rain2' (capture.js)
//   width      the page width in px (390 when left out)
//   extraDays  day keys each view is also drawn for
//   raw, data  the edits; open is how many Day by day rows are open
//   claim      what the case is for; test/golden.test.js checks the capture shows it
const HOUR = 3600e3, MIN = 60e3;
const iso = t => new Date(t).toISOString();
const empty = () => ({ type: 'FeatureCollection', features: [] });

// Set an hourly column (or the current conditions) of the forecast. v is a
// value or (old, index) => value; from and to are hour indexes in the forecast.
function patch(raw, key, from, to, v) {
  const col = raw.wx.hourly[key];
  for (let i = from; i < to; i++) col[i] = typeof v === 'function' ? v(col[i], i - from) : v;
}
const current = (raw, o) => Object.assign(raw.wx.current, o);

const E = {
  lostRiver: raw => { raw.river = empty(); },
  lostFlowSeries: raw => { raw.flow = empty(); raw.flowDays = empty(); raw.flowFcst = { id: 'WLPN3', data: [] }; },
  // Every optional source failed on the first load, so nothing is held for it.
  lostOptional: data => { for (const k of ['alerts', 'obs', 'river', 'flow', 'flowDays', 'flowFcst', 'aq', 'models']) delete data[k]; },
  // Every optional source answered with nothing in it.
  emptyOptional: raw => {
    raw.alerts = empty(); raw.obs = {}; raw.river = empty(); raw.flow = empty(); raw.flowDays = empty();
    raw.flowFcst = { id: 'WLPN3', data: [] }; raw.aq = { hourly: { time: [] } }; raw.models = { hourly: { time: [] } };
  },
  // An older or thinner forecast: no cloud cover, UV or current conditions, and holes.
  // The holes sit in the first day (the fog hours and the afternoon), the day a view opens on.
  thin: raw => {
    delete raw.wx.hourly.cloud_cover; delete raw.wx.hourly.uv_index; delete raw.wx.daily.uv_index_max; delete raw.wx.current;
    patch(raw, 'temperature_2m', 6, 7, null); patch(raw, 'dew_point_2m', 7, 8, null);
    // Wind with no speed (hour 8), no direction (hour 14), and neither (hours 13 and 15).
    patch(raw, 'wind_speed_10m', 8, 9, null); patch(raw, 'visibility', 9, 11, null);
    patch(raw, 'precipitation_probability', 11, 17, null); patch(raw, 'precipitation', 12, 15, null); patch(raw, 'cape', 12, 15, null);
    for (const i of [13, 15]) { patch(raw, 'wind_speed_10m', i, i + 1, null); patch(raw, 'wind_direction_10m', i, i + 1, null); }
    patch(raw, 'wind_direction_10m', 14, 15, null); patch(raw, 'wind_gusts_10m', 14, 15, null);
    patch(raw, 'weather_code', 14, 15, null); patch(raw, 'visibility', 15, 18, null);
  },
  // The river above the stay off line and smoke above 200 for the first day and a half.
  severe: raw => {
    raw.river.features[0].properties.value = '30500';
    patch({ wx: { hourly: raw.aq.hourly } }, 'us_aqi', 0, 36, (v, i) => 205 + i * 2);
  },
  // Only two of the four models answered, or only one.
  twoModels: raw => { for (const k of Object.keys(raw.models.hourly)) if (/gem_seamless|icon_seamless/.test(k)) delete raw.models.hourly[k]; },
  oneModel: raw => { for (const k of Object.keys(raw.models.hourly)) if (/_(gem_seamless|icon_seamless|ecmwf_ifs025)$/.test(k)) delete raw.models.hourly[k]; },
  // A 20% chance of rain every hour, the line under which the page says little chance, or 30%, the line for a note in a plan.
  popTwenty: raw => { patch(raw, 'precipitation_probability', 0, 168, 20); },
  popThirty: raw => { patch(raw, 'precipitation_probability', 0, 168, 30); },
  // Caution all week from the wind, with one calm hour: the longest go stretch is exactly an hour.
  oneGoHour: raw => {
    patch(raw, 'wind_speed_10m', 0, 168, 12); patch(raw, 'wind_gusts_10m', 0, 168, 14);
    patch(raw, 'wind_speed_10m', 15, 16, 3); patch(raw, 'wind_gusts_10m', 15, 16, 5);
  },
  // The river up exactly 20% in six hours, the line for a debris warning.
  riseTwenty: raw => {
    const fs = raw.flow.features;
    fs.forEach((f, i) => { f.properties.value = i === fs.length - 1 ? '6000' : '5000'; });
  },
  lostFlowFcst: raw => { raw.flowFcst = { id: 'WLPN3', data: [] }; },
  lostFlowDays: raw => { raw.flowDays = empty(); },
  lostRiverAndFlow: raw => { raw.river = empty(); raw.flow = empty(); },
  // Air quality with holes: no reading for the hours around the clock, and no fine particles.
  aqHole: (raw, clock) => {
    const H = raw.aq.hourly, i = Math.floor((clock - H.time[0] * 1000) / HOUR);
    patch({ wx: { hourly: H } }, 'us_aqi', i, i + 3, null); patch({ wx: { hourly: H } }, 'pm2_5', i, i + 3, null);
  },
  aqiNoPm: raw => { raw.aq.hourly.pm2_5 = raw.aq.hourly.pm2_5.map(() => null); },
  // The six hour mark in the flow series lands on a zero, and a river that never moved.
  zeroFlow: raw => { const fs = raw.flow.features; fs[fs.length - 25].properties.value = '0'; },
  flatFlow: raw => { raw.flow.features.forEach(f => { f.properties.value = '5000'; }); },
  // The daily table is a day short, or missing: no sun times for those days.
  shortDaily: raw => { for (const k of Object.keys(raw.wx.daily)) raw.wx.daily[k] = raw.wx.daily[k].slice(0, -1); },
  noDaily: raw => { for (const k of Object.keys(raw.wx.daily)) raw.wx.daily[k] = []; },
  calmNow: raw => current(raw, { wind_speed_10m: 0.4, wind_gusts_10m: 1.1 }),
  noWindNow: raw => current(raw, { wind_speed_10m: null, wind_gusts_10m: null, wind_direction_10m: null }),
  // The wind swings through the afternoon of the first day.
  windShift: raw => patch(raw, 'wind_direction_10m', 15, 20, (v, k) => [200, 230, 270, 310, 340][k]),
  // The river fell by more than a third in the last six hours.
  fallingRiver: raw => {
    const fs = raw.flow.features, n = fs.length;
    fs.forEach((f, i) => { if (i <= n - 25 && f.properties.value != null) f.properties.value = String(Math.round(f.properties.value * 1.6)); });
  },
  // Alerts with little in them: no end, no text, one already over, one yet to start.
  alerts: (raw, clock) => {
    const mk = (id, p) => ({ type: 'Feature', id, geometry: null, properties: { id, status: 'Actual', ...p } });
    raw.alerts.features = [
      mk('a1', { event: 'Special Weather Statement', onset: iso(clock - HOUR) }),
      mk('a2', { event: 'Tornado Warning', headline: 'Tornado Warning until 3 PM', description: 'A tornado is possible.', instruction: '', onset: iso(clock - HOUR), ends: iso(clock + 2 * HOUR) }),
      mk('a3', { event: 'Small Craft Advisory', effective: iso(clock - 2 * HOUR), expires: iso(clock + 30 * HOUR), headline: 'Small Craft Advisory', description: 'Winds to 25 knots.', instruction: 'Inexperienced mariners should stay in port.' }),
      mk('a4', { event: 'Flood Warning', onset: iso(clock - 9 * HOUR), ends: iso(clock - HOUR), headline: 'Over', description: 'Over.' }),
      mk('a5', { event: 'Dense Fog Advisory', onset: iso(clock + 5 * HOUR), ends: iso(clock + 9 * HOUR), headline: 'Dense Fog Advisory', description: 'Visibility under a quarter mile.' }),
      mk('a6', { event: undefined, headline: undefined }),
      mk('a7', { event: 'Wind Advisory', onset: iso(clock - 3 * HOUR), ends: iso(clock), headline: 'Ends this minute', description: 'Over.' }),
      mk('a8', { event: 'Frost Advisory', onset: iso(clock), ends: iso(clock + 4 * HOUR), headline: 'Starts this minute', description: 'Frost.' })
    ];
  },
  // The Keene station sent little: no wind, no temperature, no description, one gust.
  obsGaps: raw => {
    const p = raw.obs.properties;
    p.windSpeed.value = null; p.temperature.value = null; p.windDirection.value = null; p.textDescription = '';
    p.windGust = { unitCode: 'wmoUnit:km_h-1', value: 19.3, qualityControl: 'C' };
  },
  // Light wind at Keene, below 1 mph, so no direction is given.
  obsLight: raw => {
    const p = raw.obs.properties;
    p.windSpeed.value = 1; p.windGust.value = null; p.textDescription = 'Fog/Mist';
  },
  // Readings of different ages: the flow now, the water temperature hours old, Keene days old.
  staleReadings: (raw, clock) => {
    const [flow, , water] = raw.river.features;
    flow.properties.time = iso(clock - 10e3);
    water.properties.time = iso(clock - 5 * HOUR);
    raw.obs.properties.timestamp = iso(clock - 60 * HOUR);
  },
  // The current conditions are exactly 90 minutes old, so the hour's own values are used.
  current90: (raw, clock) => { raw.wx.current.time = (clock - 90 * MIN) / 1000; raw.wx.current.temperature_2m = 99.9; },
  // The same wind for every hour, so hours tie for the roughest water and for the calmest session.
  steadyWind: raw => { patch(raw, 'wind_speed_10m', 0, 168, 6); patch(raw, 'wind_gusts_10m', 0, 168, 10); patch(raw, 'wind_direction_10m', 0, 168, 200); },
  // On the hour: the hour before had the rain, and this hour's forecast is rougher than the reading now.
  hourEdges: (raw, clock) => {
    const i = raw.wx.hourly.time.findIndex(t => t * 1000 > clock) - 1;
    patch(raw, 'precipitation_probability', i - 1, i, 85); patch(raw, 'weather_code', i - 1, i, 61); patch(raw, 'precipitation', i - 1, i, 0.05);
    patch(raw, 'wind_speed_10m', i, i + 1, 12); patch(raw, 'wind_gusts_10m', i, i + 1, 14);
    current(raw, { wind_speed_10m: 4, wind_gusts_10m: 5 });
  },
  // Two hours left in the afternoon, and the wind turning through just over 120 degrees across them.
  windShiftLate: raw => { patch(raw, 'wind_speed_10m', 19, 21, 6); patch(raw, 'wind_direction_10m', 19, 20, 200); patch(raw, 'wind_direction_10m', 20, 21, 321); },
  // Fog on the river in the afternoon.
  fogNow: (raw, clock) => {
    const i = raw.wx.hourly.time.findIndex(t => t * 1000 > clock) - 1;
    patch(raw, 'weather_code', i, i + 1, 45); patch(raw, 'visibility', i, i + 1, 800);
    current(raw, { weather_code: 45, visibility: 800 });
  },
  // Rain now with no amount given.
  rainNoAmount: (raw, clock) => {
    const i = raw.wx.hourly.time.findIndex(t => t * 1000 > clock) - 1;
    patch(raw, 'weather_code', i, i + 1, 63); patch(raw, 'precipitation', i, i + 1, null); patch(raw, 'precipitation_probability', i, i + 1, 90);
    current(raw, { weather_code: 63 });
  },
  // Keene wind of exactly 1 mph: the direction is shown from 1 mph up (1.6093445 km/h is 1 mph to the last bit).
  obsOne: raw => { const p = raw.obs.properties; p.windSpeed.value = 1.6093444978925633; p.windSpeed.unitCode = 'wmoUnit:km_h-1'; p.windGust.value = null; },
  // Something falling now, at the clock hour: code, and amount in inches an hour.
  fallingNow: (code, amount) => (raw, clock) => {
    const i = raw.wx.hourly.time.findIndex(t => t * 1000 > clock) - 1;
    patch(raw, 'weather_code', i, i + 1, code); patch(raw, 'precipitation', i, i + 1, amount); patch(raw, 'precipitation_probability', i, i + 1, 90);
    current(raw, { weather_code: code });
  }
};

// One variant after another. The hr is hours after the scenario's first midnight.
const V = (name, scenario, when, settings, claim, o = {}) => ({ name: `v-${name}`, scenario, ...when, settings, claim, ...o });
// width is the page width in px; the cases use 390, and 1280 for the wide one.
const W = (n, width, claim) => V(`june-width-${n}`, 'june-calm', hr(12), 'default', claim, { width });
const hr = h => ({ hr: h }), at = ms => ({ at: ms });

export const VARIANTS = [
  // ----- other clocks -----
  V('june-calm-0800', 'june-calm', hr(8), 'default', 'morning, first light long past, nothing foggy'),
  V('june-calm-0030', 'june-calm', hr(0.5), 'default', 'the first half hour of the forecast, in the dark'),
  V('june-before-forecast', 'june-calm', hr(-1), 'default', 'a clock an hour before the first forecast hour'),
  V('june-calm-d3-0900', 'june-calm', hr(3 * 24 + 9), 'default', 'a go now that holds until the wind builds later this morning'),
  V('fall-back-d0-1000', 'fall-back', hr(10), 'default', 'a go now that holds until gusts build'),
  V('june-calm-d6-1200', 'june-calm', hr(6 * 24 + 12), 'default', 'noon on the last forecast day: no morning left to look ahead to'),
  V('june-calm-d6-2200', 'june-calm', hr(6 * 24 + 22), 'default', 'the last hours of the forecast: nothing next'),
  V('october-fog-0800', 'october-fog', hr(8), 'default', 'daylight with valley fog on the river that lifts later this morning'),
  V('october-fog-0930', 'october-fog', hr(9.5), 'default', 'the morning fog lifted half an hour ago'),
  V('october-fog-0900', 'october-fog', hr(9), 'default', 'the morning fog lifts at exactly this hour'),
  V('october-fog-1100', 'october-fog', hr(11), 'default', 'on the hour the morning ends: the next morning is tomorrow'),
  V('october-fog-afternoon', 'october-fog', hr(15), 'default', 'model fog on the river in the afternoon, with fog likely tomorrow morning', { raw: E.fogNow }),
  V('october-fog-d2-1030', 'october-fog', hr(2 * 24 + 10.5), 'default', 'model fog lingering into the 10 AM hour'),
  V('october-fog-d2-1300', 'october-fog', hr(2 * 24 + 13), 'default', 'drizzle now'),
  V('october-fog-d3-1300', 'october-fog', hr(3 * 24 + 13), 'default', 'moderate rain now in a wet day'),
  V('april-d0-1400', 'april-high-water', hr(14), 'default', 'gusts over the stay off line now'),
  V('april-d1-1600', 'april-high-water', hr(24 + 16), 'default', 'thunderstorms now'),
  V('fall-back-d1-1000', 'fall-back', at(Date.UTC(2026, 10, 1, 15)), 'default', 'showers on the 25 hour day, after the clocks went back'),
  V('fall-back-d3-0700', 'fall-back', at(Date.UTC(2026, 10, 3, 12)), 'default', 'snow at dawn'),
  V('spring-d1-1200', 'spring-forward', hr(35), 'default', 'noon on the 23 hour day, river between 10,000 and 20,000 cfs, wind from downstream'),
  V('spring-d1-1200-tight', 'spring-forward', hr(35), 'tight', 'the same with tight settings and a course heading turned round'),
  V('spring-d2-0900', 'spring-forward', hr(56), 'default', 'snow now, a winter advisory and cold water'),
  // ----- the data cut, emptied, thin or extreme -----
  V('april-lost-river', 'april-high-water', hr(12), 'default', 'no river reading: no water temperature and no flow', { raw: E.lostRiver }),
  V('april-lost-river-override', 'april-high-water', hr(12), 'custom', 'no river reading, a water temperature set by hand', { raw: E.lostRiver }),
  V('april-lost-flow-series', 'april-high-water', hr(12), 'default', 'the reading but no flow history or river forecast', { raw: E.lostFlowSeries }),
  V('april-lost-flow-fcst', 'april-high-water', hr(12), 'default', 'no NWS river forecast', { raw: E.lostFlowFcst }),
  V('april-lost-flow-days', 'april-high-water', hr(12), 'default', 'no daily flow history', { raw: E.lostFlowDays }),
  V('april-lost-river-and-flow', 'april-high-water', hr(12), 'default', 'no reading and no 48 hour series, the rest present', { raw: E.lostRiverAndFlow }),
  V('june-aq-gaps', 'june-calm', hr(12), 'default', 'no air quality reading for the hours around the clock', { raw: E.aqHole }),
  V('june-aqi-no-pm', 'june-calm', hr(12), 'default', 'air quality with no fine particle reading', { raw: E.aqiNoPm }),
  V('june-zero-flow', 'june-calm', hr(12), 'default', 'a zero in the flow series six hours back', { raw: E.zeroFlow }),
  V('june-flat-flow', 'june-calm', hr(12), 'default', 'a river that has not moved in 48 hours', { raw: E.flatFlow }),
  V('june-short-daily-d6', 'june-calm', hr(6 * 24 + 12), 'default', 'the last day has hours but no sun times', { raw: E.shortDaily }),
  V('june-no-daily', 'june-calm', hr(12), 'default', 'hours but no daily table at all', { raw: E.noDaily }),
  V('october-lost-optional', 'october-fog', hr(12), 'default', 'only the forecast was ever loaded', { data: E.lostOptional }),
  V('october-empty-optional', 'october-fog', hr(12), 'default', 'every other source answered with nothing', { raw: E.emptyOptional }),
  V('fall-back-thin', 'fall-back', hr(12), 'default', 'a forecast with no cloud cover, UV or current conditions, and holes', { raw: E.thin }),
  V('april-severe', 'april-high-water', hr(12), 'default', 'river over 28,000 cfs and smoke over 200', { raw: E.severe }),
  V('april-severe-blank', 'april-high-water', hr(12), 'blank', 'the same with the rain, smoke and cold lines left blank', { raw: E.severe }),
  V('june-calm-now', 'june-calm', hr(12), 'default', 'wind under 1 mph now: a calm compass', { raw: E.calmNow }),
  V('june-no-wind-now', 'june-calm', hr(12), 'default', 'no wind reading now', { raw: E.noWindNow }),
  V('june-wind-shift', 'june-calm', hr(12), 'default', 'a wind that swings through the afternoon', { raw: E.windShift }),
  V('june-falling-river', 'june-calm', hr(12), 'default', 'a river falling by more than a third in 6 hours', { raw: E.fallingRiver }),
  V('june-alerts', 'june-calm', hr(12), 'default', 'alerts with no end or no text, one over, one to come', { raw: E.alerts }),
  V('june-obs-gaps', 'june-calm', hr(12), 'default', 'a Keene report with no wind, temperature or description', { raw: E.obsGaps }),
  V('june-obs-light', 'june-calm', hr(12), 'default', 'a Keene report with wind under 1 mph', { raw: E.obsLight }),
  V('june-stale-readings', 'june-calm', hr(12), 'default', 'readings seconds, hours and days old', { raw: E.staleReadings }),
  V('june-current-90min', 'june-calm', hr(12), 'default', 'current conditions exactly 90 minutes old', { raw: E.current90 }),
  V('june-steady-wind', 'june-calm', hr(12), 'default', 'the same wind every hour: ties for the roughest hour and the calmest session', { raw: E.steadyWind }),
  V('june-hour-edges', 'june-calm', hr(12), 'default', 'on the hour, with rain in the hour before and a rougher hour forecast than the reading', { raw: E.hourEdges }),
  V('june-wind-shift-late', 'june-calm', hr(19.5), 'default', 'two hours left, the wind turning through 121 degrees', { raw: E.windShiftLate }),
  V('june-heading-11', 'june-calm', hr(12), 'edge', 'a course heading whose reverse sits on a compass point edge'),
  V('june-cold-line', 'june-calm', hr(12), 'cold144', 'air plus water exactly on the cold line'),
  V('june-obs-one', 'june-calm', hr(12), 'default', 'a Keene report with wind of exactly 1 mph', { raw: E.obsOne }),
  V('fall-back-rain-no-amount', 'fall-back', hr(12), 'default', 'rain now with no amount in the forecast', { raw: E.rainNoAmount }),
  V('june-two-models', 'june-calm', hr(12), 'default', 'two forecast models instead of four', { raw: E.twoModels }),
  V('june-one-model', 'june-calm', hr(12), 'default', 'one forecast model', { raw: E.oneModel }),
  V('june-pop-twenty', 'june-calm', hr(12), 'default', 'a 20% chance of rain every hour, exactly the line for little chance', { raw: E.popTwenty }),
  V('june-pop-thirty', 'june-calm', hr(12), 'default', 'a 30% chance of rain every hour, exactly the line for a note in a plan', { raw: E.popThirty }),
  V('june-one-go-hour', 'june-calm', hr(12), 'default', 'caution all week but one calm hour: the longest go stretch is one hour', { raw: E.oneGoHour }),
  V('june-rise-twenty', 'june-calm', hr(12), 'default', 'the river up exactly 20% in 6 hours', { raw: E.riseTwenty }),
  V('june-rain-lines-low', 'june-calm', hr(12), 'rain1', 'rain lines at 1% and 100%'),
  V('june-rain-lines-high', 'june-calm', hr(12), 'rain2', 'rain lines at 0% and 101%'),
  W(300, 300, 'a narrow page: charts at their smallest width, ticks every third hour'),
  W(500, 500, 'a tablet in portrait: ticks every other hour'),
  W(333, 333, 'the width where the wind chart thins its hour columns, to the pixel'),
  W(452, 452, 'the width where the charts go from every third to every second hour, to the pixel'),
  W(518, 518, 'the width where the fog chart goes from every second to every hour, to the pixel'),
  V('june-unknown-day', 'june-calm', hr(12), 'default', 'each view asked for a day that has no forecast, as a bad link would', { extraDays: ['2020-01-01'] }),
  W(735, 735, 'one pixel under the wide layout'),
  W(736, 736, 'the first width of the wide layout (46rem)'),
  V('june-open-rows', 'june-calm', hr(12), 'default', 'three Day by day rows open, as a viewer left them', { open: 3 }),
  V('june-blank', 'june-calm', hr(12), 'blank', 'lines left blank in settings', {}),
  V('october-tight', 'october-fog', hr(12), 'tight', 'tight settings on a foggy week', {}),
  V('fall-back-freezing-now', 'fall-back', hr(12), 'default', 'freezing rain now', { raw: E.fallingNow(66, 0.04) }),
  V('fall-back-heavy-now', 'fall-back', hr(12), 'default', 'heavy rain now', { raw: E.fallingNow(65, 0.35) }),
  // A clock past the forecast: there is no model.
  V('june-stale-forecast', 'june-calm', hr(8 * 24 + 6), 'default', 'a clock after the last forecast hour: no usable forecast', {})
];
