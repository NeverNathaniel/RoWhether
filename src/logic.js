// The call logic. Pure functions over a model built from fetched data and settings.
// Nothing here touches the DOM or storage, so it can be unit tested.
import SunCalc from 'suncalc';
import { HOUR, MIN, LIGHT_KEYS, FOG, PERIODS, WATER, AQI, CONFIDENCE } from './config.js';
import { zoneFormat, hm, r0, cToF } from './format.js';
import { unitFormat } from './units.js';

// ---------- Sun ----------
export function sunFor(m, key) {
  if (m.sunCache[key]) return m.sunCache[key];
  const d = m.days.find(x => x.key === key);
  if (!d) return null;
  const st = SunCalc.getTimes(new Date(d.t + 12 * HOUR), m.loc.lat, m.loc.lon);
  const s = { dawn: +st.dawn, sunrise: +st.sunrise, sunset: +st.sunset, dusk: +st.dusk };
  m.sunCache[key] = s;
  return s;
}
// Sun times for any date, not just forecast days. t is any time that day.
export function sunOn(loc, t) {
  const st = SunCalc.getTimes(new Date(t), loc.lat, loc.lon);
  return { dawn: +st.dawn, sunrise: +st.sunrise, noon: +st.solarNoon, sunset: +st.sunset, dusk: +st.dusk };
}
// The UV index in words (WHO categories).
export function uvWord(v) {
  return v < 3 ? 'Low' : v < 6 ? 'Moderate' : v < 8 ? 'High' : v < 11 ? 'Very high' : 'Extreme';
}
export function lightAt(m, t) {
  const s = sunFor(m, m.fmt.dayKey(t));
  if (!s) return 'day';
  if (t < s.dawn || t > s.dusk) return 'dark';
  if (t < s.sunrise || t > s.sunset) return 'twilight';
  return 'day';
}

// ---------- River and water ----------
export function flowNow(m) { return m.data.river && m.data.river.flow ? m.data.river.flow.v : null; }
export function waterOverridden(S) { return !isNaN(parseFloat(S.waterOverride)); }
export function waterTemp(m) {
  const o = parseFloat(m.S.waterOverride);
  if (!isNaN(o)) return o;
  return m.data.river && m.data.river.waterC ? cToF(m.data.river.waterC.v) : null;
}
// Percent change in flow over the last 6 hours of the series, or null.
export function flowChange(ser) {
  if (!ser || ser.length < 4) return null;
  const last = ser[ser.length - 1];
  const target = last.t - 6 * HOUR;
  let prev = ser[0];
  for (const p of ser) { if (Math.abs(p.t - target) < Math.abs(prev.t - target)) prev = p; }
  if (!prev.v) return null;
  return (last.v - prev.v) / prev.v * 100;
}
export function flowTrend(ser) {
  const pct = flowChange(ser);
  if (pct == null) return null;
  if (pct > 10) return `Rising, up ${Math.round(pct)}% in 6 hours`;
  if (pct < -10) return `Falling, down ${Math.round(-pct)}% in 6 hours`;
  return 'Steady over 6 hours';
}

// ---------- Wind vs. course ----------
export function relWind(dir, heading) { return ((dir - heading + 540) % 360) - 180; } // 0 = wind from upstream
// The flow steps where wind against the current steepens chop, highest first.
const againstSteps = m => (m.loc.flow && m.loc.flow.against) || [];
// Wind from the right of the upstream heading (rel > 0) comes off the right bank.
function crosswind(banks, rel) {
  if (!banks) return 'Crosswind.';
  return `Crosswind off the ${(rel > 0 ? banks.right : banks.left).name} ${banks.word}.`;
}
export function windVsCourse(m, dir, speed) {
  if (speed == null || dir == null) return '';
  if (Math.round(speed) < 3) return 'Near calm on the course.';
  const course = m.loc.course;
  const rel = relWind(dir, course.heading);
  const c = Math.cos(rel * Math.PI / 180);
  const along = Math.abs(speed * c);
  let s;
  if (c >= 0.5) s = 'Headwind rowing upstream, tailwind coming back.';
  else if (c <= -0.5) s = 'Tailwind rowing upstream, headwind coming back.';
  else s = crosswind(m.loc.banks, rel);
  if (Math.abs(c) >= 0.5 && along >= 8) s += ` Chop builds along the ${course.reachWord || 'course'}.`;
  const f = flowNow(m);
  if (c <= -0.5 && along >= 8 && f != null && f >= Math.min(...againstSteps(m).map(([cfs]) => cfs))) s += ' Wind against current steepens it.';
  return s;
}
export function meanDir(hs) {
  let sx = 0, sy = 0;
  for (const h of hs) { const w = Math.max(h.wind || 0, 0.5), a = h.dir * Math.PI / 180; sx += w * Math.sin(a); sy += w * Math.cos(a); }
  return (Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360;
}
export function angDev(a, b) { return Math.abs(((a - b + 540) % 360) - 180); }

// ---------- Water state ----------
// Chop wind for one hour: along-course wind plus a share of crosswind,
// raised when the wind blows upstream against a strong current.
export function chopWind(m, h) {
  if (h.wind == null || h.dir == null) return null;
  const rel = relWind(h.dir, m.loc.course.heading) * Math.PI / 180;
  const along = Math.abs(h.wind * Math.cos(rel)), cross = Math.abs(h.wind * Math.sin(rel));
  let e = along + m.loc.water.cross * cross;
  const against = Math.cos(rel) <= -0.5;
  const f = flowNow(m), steps = againstSteps(m);
  if (against && f != null) {
    const k = steps.find(([cfs]) => f >= cfs);
    if (k) e *= k[1];
  }
  // Same split as windVsCourse(): within 60° of the course is along it.
  const axis = Math.abs(Math.cos(rel)) >= 0.5 ? 'along' : 'cross';
  return { e, along, cross, axis, against: against && f != null && steps.some(([cfs]) => f >= cfs) };
}

// Water state for an hour, given the chop wind of this and the two prior hours.
export function waterState(m, h, prev) {
  const now = chopWind(m, h);
  if (!now) return null;
  const es = [now.e, ...prev.map(p => (p ? p.e : now.e))];
  const eff = es.reduce((a, e, i) => a + e * WATER.blend[i], 0);
  const lvl = WATER.levels.filter(x => eff >= x).length;
  return { lvl, eff, now: now.e, axis: now.axis, against: now.against };
}

// True when the river rose fast enough recently to bring down debris.
export function debrisLikely(m) {
  const pct = flowChange(m.data.flow);
  return pct != null && pct >= WATER.debrisRise;
}

// One sentence on why the water is the way it is.
export function waterWhy(ws) {
  if (!ws) return '';
  const parts = [];
  if (ws.lvl === 0) parts.push(ws.now < 3 ? 'Little wind on the water.' : 'Not enough wind along the straight to build chop.');
  else if (ws.axis === 'along') parts.push('Wind runs along the straight, with a long reach to build waves.');
  else parts.push('Mostly crosswind. It only crosses the width of the river, so chop stays smaller.');
  if (ws.eff < ws.now * 0.8) parts.push('Building.');
  else if (ws.eff > ws.now * 1.25 && ws.lvl > 0) parts.push('Settling after earlier wind.');
  if (ws.against && ws.lvl > 0) parts.push('Wind against the current steepens it.');
  return parts.join(' ');
}

// ---------- Precipitation ----------
// Open-Meteo weather codes that mean something is falling, and their name.
export function precipKind(code) {
  if ([95, 96, 99].includes(code)) return 'thunderstorms';
  if ([56, 57, 66, 67].includes(code)) return 'freezing rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([80, 81, 82].includes(code)) return 'showers';
  if ([61, 63, 65].includes(code)) return 'rain';
  if ([51, 53, 55].includes(code)) return 'drizzle';
  return null;
}
export function rateWord(inPerHr) {
  return inPerHr >= 0.3 ? 'heavy' : inPerHr >= 0.1 ? 'moderate' : 'light';
}

// Summary of precipitation over a run of hours: the peak chance and when,
// the hours near the peak (within 10 points of it), total amount, and the
// most common kind among the hours with a real chance.
export function precipSummary(hs) {
  if (!hs.length) return null;
  const pops = hs.map(h => (h.pop == null ? 0 : h.pop));
  const peak = Math.max(...pops);
  const pi = pops.indexOf(peak);
  let a = pi, b = pi;
  while (a > 0 && pops[a - 1] >= peak - 10) a--;
  while (b < hs.length - 1 && pops[b + 1] >= peak - 10) b++;
  const total = hs.reduce((t, h) => t + (h.precip || 0), 0);
  const count = {};
  for (const h of hs) {
    const k = precipKind(h.code);
    if (k && ((h.pop || 0) >= 30 || (h.precip || 0) > 0)) count[k] = (count[k] || 0) + 1;
  }
  const kind = Object.keys(count).sort((x, y) => count[y] - count[x])[0] || null;
  return { peak: Math.round(peak), peakT: hs[pi].t, fromT: hs[a].t, toT: hs[b].t + HOUR, total, kind };
}

// ---------- Assessment ----------
// ---------- Fog ----------
const FOG_NAME = { valley: 'Valley fog', steam: 'Steam fog', model: 'Fog' };

// Relative humidity from air and dew point in °F (Magnus formula).
export function relHumidity(tF, dF) {
  const t = (tF - 32) * 5 / 9, d = (dF - 32) * 5 / 9;
  return 100 * Math.exp(17.625 * d / (243.04 + d)) / Math.exp(17.625 * t / (243.04 + t));
}

// Fog risk for one hour: risk 0 none, 1 possible, 2 likely, with the fog type
// and a short reason. Only a likely risk feeds into the call (as caution).
export function fogRisk(m, h) {
  const none = { risk: 0 };
  const hits = [];
  if (FOG.codes.includes(h.code) || (h.vis != null && h.vis < 1609.34)) {
    hits.push({ risk: 2, type: 'model', why: 'The forecast model shows fog.' });
  }
  const early = m.fmt.localHour(h.t) <= FOG.lastHour;
  if (early && h.temp != null && h.dew != null && h.wind != null) {
    const spread = h.temp - h.dew;
    const v = FOG.valley;
    const clear = lim => h.nightCloud == null || h.nightCloud <= lim;
    if (spread <= v.likely.spread && h.wind <= v.likely.wind && clear(v.likely.cloud)) {
      hits.push({ risk: 2, type: 'valley', why: 'Air at the dew point, light wind and a clear night.' });
    } else if (spread <= v.possible.spread && h.wind <= v.possible.wind && clear(v.possible.cloud)) {
      hits.push({ risk: 1, type: 'valley', why: 'Air near the dew point and light wind.' });
    }
    const wt = waterTemp(m);
    if (wt != null) {
      const diff = wt - h.temp, rh = relHumidity(h.temp, h.dew);
      const st = FOG.steam;
      const why = `Water ${m.u.temp(wt)} under ${m.u.temp(h.temp)} air.`;
      if (diff >= st.likely.diff && h.wind <= st.likely.wind && rh >= st.likely.rh) hits.push({ risk: 2, type: 'steam', why });
      else if (diff >= st.possible.diff && h.wind <= st.possible.wind && rh >= st.possible.rh) hits.push({ risk: 1, type: 'steam', why });
    }
  }
  if (!hits.length) return none;
  const top = hits.reduce((a, b) => (b.risk > a.risk ? b : a));
  return { ...top, text: `${FOG_NAME[top.type]} ${top.risk === 2 ? 'likely' : 'possible'}` };
}

// Fog for one morning (from an hour before first light through the 10 AM
// hour): the strongest risk and when it should lift. Null if none.
export function morningFog(m, key) {
  const s = sunFor(m, key);
  if (!s) return null;
  const hs = m.hours.filter(h => m.fmt.dayKey(h.t) === key && h.t + HOUR > s.dawn - HOUR && m.fmt.localHour(h.t) <= FOG.lastHour);
  const foggy = hs.map(h => ({ h, f: fogRisk(m, h) })).filter(x => x.f.risk > 0);
  if (!foggy.length) return null;
  const top = foggy.reduce((a, b) => (b.f.risk > a.f.risk ? b : a)).f;
  const last = foggy[foggy.length - 1].h;
  return { ...top, until: last.t + HOUR, lingers: m.fmt.localHour(last.t) === FOG.lastHour };
}

// "lifting about 9 AM" or "lingering into late morning"
export function fogLift(mf) {
  return mf.lingers ? 'lingering into late morning' : `lifting about ${hm(mf.until)}`;
}

// The next morning that has not finished yet, with its fog (or null fog).
export function nextMorning(m) {
  for (const d of m.days) {
    const end = m.hours.find(h => m.fmt.dayKey(h.t) === d.key && m.fmt.localHour(h.t) === FOG.lastHour + 1);
    if (end && end.t > m.now) return { key: d.key, t: end.t, fog: morningFog(m, d.key) };
  }
  return null;
}

// Level for one hour (or the current moment): 0 go, 1 caution, 2 stay off.
// The level is the worst of its reasons.
export function assess(m, h, lightT) {
  const S = m.S;
  const r = [];
  const add = (lvl, key, text) => r.push({ lvl, key, text });
  const light = lightAt(m, lightT != null ? lightT : h.t + 30 * MIN);
  if (light === 'dark') add(2, 'dark', 'Dark');
  else if (light === 'twilight') add(1, 'twilight', 'Outside sunrise to sunset, lights required');

  const c = h.code;
  if ([95, 96, 99].includes(c)) add(2, 'storm', 'Thunderstorms');
  else if (h.cape != null && h.cape >= 1000 && (h.pop || 0) >= 30) add(1, 'stormrisk', 'Thunderstorms possible');
  if ([56, 57, 66, 67].includes(c)) add(2, 'ice', 'Freezing rain');
  else if ([71, 73, 75, 77, 85, 86].includes(c)) add(1, 'snow', 'Snow');
  if (h.precip != null && h.precip >= 0.15) add(1, 'rain', 'Heavy rain');
  if (h.pop != null) {
    const pop = Math.round(h.pop), on = v => v !== '' && v != null && !isNaN(v);
    if (on(S.rainOff) && pop >= S.rainOff) add(2, 'pop', `Rain chance ${pop}%`);
    else if (on(S.rainCaution) && pop >= S.rainCaution) add(1, 'pop', `Rain chance ${pop}%`);
  }

  const w = r0(h.wind), g = r0(h.gust);
  if (w != null) {
    if (w >= S.windOff) add(2, 'wind', `Wind ${m.u.speed(h.wind)}`);
    else if (w >= S.windCaution) add(1, 'wind', `Wind ${m.u.speed(h.wind)}`);
  }
  if (g != null) {
    if (g >= S.gustOff) add(2, 'gust', `Gusts to ${m.u.speed(h.gust)}`);
    else if (g >= S.gustCaution) add(1, 'gust', `Gusts to ${m.u.speed(h.gust)}`);
  }

  const vm = h.vis != null ? h.vis / 1609.34 : null;
  if (vm != null && vm < 0.25) add(2, 'fog', `Fog, visibility under ${m.u.visOff}`);
  else if (vm != null && vm < 1) add(1, 'fog', `Visibility ${m.u.vis(h.vis)}`);
  else {
    const fr = fogRisk(m, h);
    if (fr.risk === 2) add(1, 'fog', fr.text);
  }

  if (h.temp != null && h.temp < 32) add(2, 'freeze', `Below freezing at ${m.u.temp(h.temp)}, ice on docks and oarlocks`);
  const wt = waterTemp(m);
  if (wt != null && h.temp != null) {
    const sum = Math.round(h.temp + wt);
    if (sum < S.coldCombined) add(1, 'cold', `Cold water, air plus water ${m.u.tempSum(h.temp + wt)}`);
  }
  const f = flowNow(m);
  if (f != null) {
    if (f >= S.flowOff) add(2, 'flow', `High water at ${m.u.flow(f, m.loc.flow?.unit)}`);
    else if (f >= S.flowCaution) add(1, 'flow', `Elevated flow at ${m.u.flow(f, m.loc.flow?.unit)}`);
  }
  if (h.aqi != null) {
    const q = Math.round(h.aqi), on = v => v !== '' && v != null && !isNaN(v);
    const text = `Air quality ${m.u.aqi(h.aqi)}, ${aqiWord(q).toLowerCase()}`;
    if (on(S.aqiOff) && q >= S.aqiOff) add(2, 'aqi', text);
    else if (on(S.aqiCaution) && q >= S.aqiCaution) add(1, 'aqi', text);
  }
  for (const a of m.alerts) {
    if (h.t >= a.start && h.t < a.end) add(a.lvl, 'alert', a.event);
  }
  r.sort((a, b) => b.lvl - a.lvl);
  return { lvl: r.reduce((mx, x) => Math.max(mx, x.lvl), 0), reasons: r };
}
export const lvlExcept = (a, keys) => a.reasons.filter(x => !keys.includes(x.key)).reduce((m, x) => Math.max(m, x.lvl), 0);

// ---------- Model ----------
// Build everything the UI needs from a location, raw data and settings.
// Returns null if there is no usable forecast. units is { system, wind }; club
// is read by a later step.
export function buildModel(loc, data, S, now = Date.now(), { units, club } = {}) {
  const d = data.wx;
  if (!d || !d.hourly || !d.daily) return null;
  const m = {
    loc, fmt: zoneFormat(loc.tz), u: unitFormat(units), S, data, now, sunCache: {},
    alerts: (data.alerts || []).filter(a => a.end > now),
    hours: [], days: [], h72: [], cur: null
  };
  const H = d.hourly;
  m.hours = H.time.map((s, i) => ({
    t: s * 1000, temp: H.temperature_2m[i], feels: H.apparent_temperature[i], dew: H.dew_point_2m[i],
    pop: H.precipitation_probability[i], precip: H.precipitation[i], code: H.weather_code[i],
    wind: H.wind_speed_10m[i], gust: H.wind_gusts_10m[i], dir: H.wind_direction_10m[i],
    vis: H.visibility[i], cape: H.cape[i], cloud: H.cloud_cover ? H.cloud_cover[i] : null,
    uv: H.uv_index ? H.uv_index[i] : null
  }));
  // Air quality and the model comparison, matched to forecast hours by time.
  const byT = list => new Map((list || []).map(x => [x.t, x]));
  const aq = byT(data.aq), mm = byT(data.models && data.models.hours);
  const ok = v => v != null && !isNaN(v);
  for (const h of m.hours) {
    const a = aq.get(h.t), e = mm.get(h.t);
    h.aqi = a ? a.aqi : null;
    h.pm25 = a ? a.pm25 : null;
    h.ens = e ? { wind: e.wind.filter(ok), precip: e.precip.filter(ok) } : null;
  }
  // Mean cloud cover over the last 6 hours, for valley fog. Null if not available.
  m.hours.forEach((h, i) => {
    const cs = m.hours.slice(Math.max(0, i - 5), i + 1).map(x => x.cloud).filter(v => v != null);
    h.nightCloud = cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : null;
  });
  const D = d.daily;
  m.days = D.time.map((s, i) => ({
    t: s * 1000, key: m.fmt.dayKey(s * 1000 + 12 * HOUR), sunrise: D.sunrise[i] * 1000, sunset: D.sunset[i] * 1000,
    hi: D.temperature_2m_max[i], lo: D.temperature_2m_min[i], pop: D.precipitation_probability_max[i],
    uvMax: D.uv_index_max ? D.uv_index_max[i] : null
  }));
  for (const h of m.hours) h.a = assess(m, h);
  const chops = m.hours.map(h => chopWind(m, h));
  m.hours.forEach((h, i) => { h.water = waterState(m, h, [chops[i - 1], chops[i - 2]]); });

  // The hour that contains now comes first. Forecast hours start on the zone's
  // own hours, which are not always UTC whole hours (08 9.2).
  const h0 = (m.hours.find(h => now < h.t + HOUR) || { t: Infinity }).t;
  m.h72 = m.hours.filter(h => h.t >= h0).slice(0, 72);
  if (!m.h72.length) return null;

  // Current conditions: 15-minute model values if fresh, otherwise the current hour
  const base = m.hours.filter(h => h.t <= now).pop() || m.h72[0];
  const c = d.current;
  if (c && now - c.time * 1000 < 90 * MIN) {
    m.cur = { ...base, t: now, temp: c.temperature_2m, feels: c.apparent_temperature, dew: c.dew_point_2m,
      wind: c.wind_speed_10m, gust: c.wind_gusts_10m, dir: c.wind_direction_10m, code: c.weather_code, vis: c.visibility };
  } else {
    m.cur = { ...base, t: now };
  }
  m.cur.a = assess(m, m.cur, now);
  const bi = m.hours.indexOf(base);
  m.cur.water = waterState(m, m.cur, [chopWind(m, m.hours[bi - 1] || base), chopWind(m, m.hours[bi - 2] || base)]);

  for (const day of m.days) day.periods = periodsFor(m, day);
  const s = sunFor(m, m.fmt.dayKey(now));
  m.daytime = !!s && now >= s.dawn && now < s.sunset;
  m.next = m.days.flatMap(d => d.periods).find(p => !p.past) || null;
  return m;
}

// Calmest and roughest water in a period, and when it is roughest.
function periodWater(hs) {
  const ws = hs.filter(h => h.water);
  if (!ws.length) return null;
  const peak = ws.reduce((a, b) => (b.water.eff > a.water.eff ? b : a));
  return { min: Math.min(...ws.map(h => h.water.lvl)), max: peak.water.lvl, peakT: peak.t, peak: peak.water };
}

// Morning, midday and afternoon for one day. Each period's call is the worst
// hour still ahead in it, ignoring light: first light to sunrise always needs
// lights, so that is a note (lightsUntil) rather than a caution.
// Periods that are over come back as { past: true }.
export function periodsFor(m, day) {
  const s = sunFor(m, day.key);
  if (!s) return [];
  const dayHours = m.hours.filter(h => m.fmt.dayKey(h.t) === day.key);
  const clock = hr => { const h = dayHours.find(x => m.fmt.localHour(x.t) === hr); return h ? h.t : null; };
  const edge = v => (v === 'dawn' ? s.dawn : v === 'sunset' ? s.sunset : clock(v));

  return PERIODS.map(p => {
    const start = edge(p.from), end = edge(p.to);
    if (start == null || end == null || end <= start) return null;
    const base = { key: p.key, name: p.name, dayKey: day.key, start, end };
    if (end <= m.now) return { ...base, past: true };
    const from = Math.max(start, m.now);
    const hs = dayHours.filter(h => h.t < end && h.t + HOUR > from);
    if (!hs.length) return null;

    const lvl = Math.max(...hs.map(h => lvlExcept(h.a, LIGHT_KEYS)));
    const why = lvl ? hs.flatMap(h => h.a.reasons).find(x => x.lvl === lvl && !LIGHT_KEYS.includes(x.key)) : null;
    const nums = k => hs.map(h => h[k]).filter(v => v != null && !isNaN(v));
    const ws = nums('wind'), ts = nums('temp');
    let fog = null;
    if (p.key === 'morning') {
      fog = morningFog(m, day.key);
      if (fog && fog.until <= m.now) fog = null;
    }
    else {
      const fr = hs.map(h => fogRisk(m, h)).reduce((a, b) => (b.risk > a.risk ? b : a), { risk: 0 });
      if (fr.risk) fog = fr;
    }
    return {
      ...base, past: false, from, hs, lvl, why,
      wmin: Math.min(...ws), wmax: Math.max(...ws), gmax: Math.max(...nums('gust')),
      avgWind: ws.reduce((a, b) => a + b, 0) / Math.max(1, ws.length), dir: meanDir(hs),
      tmin: Math.min(...ts), tmax: Math.max(...ts),
      pop: Math.max(0, ...nums('pop')), precip: nums('precip').reduce((a, b) => a + b, 0),
      fog, lightsUntil: from < s.sunrise ? s.sunrise : null,
      water: periodWater(hs)
    };
  }).filter(Boolean);
}

// ---------- Detail views ----------
// One day's rowing window, first light to sunset, past hours included.
export function rowingHours(m, key) {
  const s = sunFor(m, key);
  if (!s) return [];
  return m.hours.filter(h => m.fmt.dayKey(h.t) === key && h.t + HOUR > s.dawn && h.t < s.sunset);
}

// The worst level among an hour's reasons with these keys, and that reason.
// assess() sorts reasons worst first, so the first match is the worst.
export function factorLevel(a, keys) {
  const why = a.reasons.find(x => keys.includes(x.key)) || null;
  return { lvl: why ? why.lvl : 0, why };
}
export const worstOf = (hs, keys) => Math.max(0, ...hs.map(h => factorLevel(h.a, keys).lvl));

// NWS forecast flow at time t, interpolated between forecast points.
// Null before the first point or after the last.
export function flowForecastAt(fc, t) {
  const p = fc && fc.pts;
  if (!p || !p.length || t < p[0].t || t > p[p.length - 1].t) return null;
  const i = p.findIndex(x => x.t >= t);
  if (i === 0 || p[i].t === t) return p[i].v;
  const a = p[i - 1], b = p[i];
  return a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t);
}

// The highest forecast flow at or after a time, or null.
export function flowForecastPeak(fc, after) {
  const p = ((fc && fc.pts) || []).filter(x => x.t >= after);
  return p.length ? p.reduce((a, b) => (b.v > a.v ? b : a)) : null;
}

// How bad an hour is for one reason, used to quote the worst hour of a run.
const WORSE = {
  wind: h => h.wind, gust: h => h.gust, pop: h => h.pop, rain: h => h.precip,
  fog: h => -(h.vis ?? Infinity), freeze: h => -h.temp, cold: h => -h.temp
};

// The worst reason for each reason key among hours at a level, leaving out
// light. keys limits it to some reasons.
export function worstReasons(hs, lvl, keys = null) {
  if (!lvl) return [];
  const byKey = new Map();
  for (const h of hs) {
    for (const x of h.a.reasons) {
      if (x.lvl !== lvl || LIGHT_KEYS.includes(x.key) || (keys && !keys.includes(x.key))) continue;
      const f = WORSE[x.key], prev = byKey.get(x.key);
      if (!prev || (f && f(h) > f(prev.h))) byKey.set(x.key, { h, x });
    }
  }
  return [...byKey.values()].map(v => v.x);
}

// Stretches of one day's rowing window where level(h) stays the same. Each run
// has its level, its hours, a start and end clipped to first light and
// sunset, and the worst reasons at its level. Hours already over are left out
// and the first run starts now, unless past is set.
export function runsBy(m, key, level, { past = false, keys = null } = {}) {
  const s = sunFor(m, key);
  if (!s) return [];
  const runs = [];
  for (const h of rowingHours(m, key)) {
    if (!past && h.t + HOUR <= m.now) continue;
    const lvl = level(h), last = runs[runs.length - 1];
    if (last && last.lvl === lvl) last.hs.push(h);
    else runs.push({ lvl, hs: [h] });
  }
  for (const r of runs) {
    r.start = Math.max(r.hs[0].t, s.dawn, past ? -Infinity : m.now);
    r.end = Math.min(r.hs[r.hs.length - 1].t + HOUR, s.sunset);
    r.why = worstReasons(r.hs, r.lvl, keys);
  }
  return runs.filter(r => r.end > r.start);
}

// The call through one day, ignoring light, as runs.
export const callRuns = (m, key, opts) => runsBy(m, key, h => lvlExcept(h.a, LIGHT_KEYS), opts);

// Stretches where one group of reasons (a FACTORS entry) is a concern. A
// caution that turns into a stay off is one run at the worse level.
export function factorRuns(m, key, keys) {
  return runsBy(m, key, h => (factorLevel(h.a, keys).lvl ? 1 : 0), { keys })
    .filter(r => r.lvl)
    .map(r => {
      const lvl = Math.max(...r.hs.map(h => factorLevel(h.a, keys).lvl));
      return { ...r, lvl, why: worstReasons(r.hs, lvl, keys) };
    });
}

// ---------- Air quality ----------
// The EPA category for a US AQI value.
export function aqiWord(q) {
  return AQI.find(([max]) => q <= max)[1];
}

// ---------- Forecast confidence ----------
// How well the compared models agree over some hours: the mean spread of
// sustained wind (mph), the share of hours where some models show rain
// (0.01 in or more) and others do not, the number of models, and a level.
// Null without model data.
export function confidence(hs) {
  const w = [], r = [];
  let n = 0;
  for (const h of hs) {
    if (!h.ens) continue;
    n = Math.max(n, h.ens.wind.length, h.ens.precip.length);
    if (h.ens.wind.length >= 2) w.push(Math.max(...h.ens.wind) - Math.min(...h.ens.wind));
    if (h.ens.precip.length >= 2) {
      const k = h.ens.precip.filter(p => p >= 0.01).length;
      r.push(k > 0 && k < h.ens.precip.length ? 1 : 0);
    }
  }
  if (!w.length && !r.length) return null;
  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const wind = mean(w), rain = mean(r), C = CONFIDENCE;
  const level = wind > C.low.wind || rain > C.low.rain ? 'low' : wind > C.medium.wind || rain > C.medium.rain ? 'medium' : 'high';
  return { level, wind, rain, n };
}

// "Low confidence: models differ by about 9 mph on wind." only limits it to
// 'wind' or 'rain', and the level then follows that one alone. It has no model,
// so the units come as an argument.
export function confidenceText(c, only = null, u = unitFormat()) {
  if (!c) return '';
  const C = CONFIDENCE, wind = only === 'rain' ? 0 : c.wind, rain = only === 'wind' ? 0 : c.rain;
  const level = wind > C.low.wind || rain > C.low.rain ? 'low' : wind > C.medium.wind || rain > C.medium.rain ? 'medium' : 'high';
  const lead = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }[level];
  const parts = [];
  if (wind > C.medium.wind) parts.push(`models differ by about ${u.speed(wind)} on wind`);
  if (rain > C.medium.rain) parts.push('models split on rain');
  return parts.length ? `${lead}: ${parts.join(', and ')}.` : `${lead}: the ${c.n} models agree.`;
}

// ---------- Plan a row ----------
const PLAN_STEP = 30 * MIN;

// The calmest go session of `minutes` on each day ahead, best first. Starts
// are the start of a go stretch and every half hour after it. when is 'any',
// 'morning' (done by noon) or 'afternoon' (starting at noon or later). Score
// is mean chop wind plus a share of the strongest gust and rain chance, so
// lower is calmer.
export function planSessions(m, minutes, when = 'any') {
  const L = minutes * MIN, out = [];
  // The next half hour on the local clock. A dawn and the live clock carry
  // seconds and milliseconds, which the step drops (08 9.2).
  const step = t => t - (m.fmt.localMinutes(t) % 30) * MIN - (t % MIN) + PLAN_STEP;
  for (const d of m.days) {
    const noon = m.hours.find(h => m.fmt.dayKey(h.t) === d.key && m.fmt.localHour(h.t) === 12);
    if (!noon) continue;
    let best = null;
    for (const r of callRuns(m, d.key)) {
      if (r.lvl !== 0) continue;
      for (let t0 = r.start; t0 + L <= r.end; t0 = step(t0)) {
        if (when === 'morning' && t0 + L > noon.t) break;
        if (when === 'afternoon' && t0 < noon.t) continue;
        const hs = r.hs.filter(h => h.t < t0 + L && h.t + HOUR > t0);
        const chop = hs.map(h => (h.water ? h.water.eff : h.wind || 0));
        const gust = Math.max(...hs.map(h => h.gust || 0)), pop = Math.max(...hs.map(h => h.pop || 0));
        const score = chop.reduce((a, b) => a + b, 0) / chop.length + 0.15 * gust + 0.03 * pop;
        if (!best || score < best.score - 1e-9) {
          best = { key: d.key, start: t0, end: t0 + L, score, hs,
            water: Math.max(...hs.map(h => (h.water ? h.water.lvl : 0))),
            wmin: Math.min(...hs.map(h => h.wind)), wmax: Math.max(...hs.map(h => h.wind)), gmax: gust, pop };
        }
      }
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => a.score - b.score);
}
