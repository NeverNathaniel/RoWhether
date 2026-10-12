// The call logic. Pure functions over a model built from fetched data and settings.
// Nothing here touches the DOM or storage, so it can be unit tested.
import SunCalc from 'suncalc';
import { LOC, HOUR, MIN, LIGHT_KEYS, FOG, PERIODS } from './config.js';
import { dayKey, localHour, hm, r0, fmtInt, cToF } from './format.js';

// ---------- Sun ----------
export function sunFor(m, key) {
  if (m.sunCache[key]) return m.sunCache[key];
  const d = m.days.find(x => x.key === key);
  if (!d) return null;
  const st = SunCalc.getTimes(new Date(d.t + 12 * HOUR), LOC.lat, LOC.lon);
  const s = { dawn: +st.dawn, sunrise: +st.sunrise, sunset: +st.sunset, dusk: +st.dusk };
  m.sunCache[key] = s;
  return s;
}
export function lightAt(m, t) {
  const s = sunFor(m, dayKey(t));
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
export function flowTrend(ser) {
  if (!ser || ser.length < 4) return null;
  const last = ser[ser.length - 1];
  const target = last.t - 6 * HOUR;
  let prev = ser[0];
  for (const p of ser) { if (Math.abs(p.t - target) < Math.abs(prev.t - target)) prev = p; }
  if (!prev.v) return null;
  const pct = (last.v - prev.v) / prev.v * 100;
  if (pct > 10) return `Rising, up ${Math.round(pct)}% in 6 hours`;
  if (pct < -10) return `Falling, down ${Math.round(-pct)}% in 6 hours`;
  return 'Steady over 6 hours';
}

// ---------- Wind vs. course ----------
export function relWind(dir, heading) { return ((dir - heading + 540) % 360) - 180; } // 0 = wind from upstream
export function windVsCourse(m, dir, speed) {
  if (speed == null || dir == null) return '';
  if (Math.round(speed) < 3) return 'Near calm on the course.';
  const rel = relWind(dir, m.S.heading);
  const c = Math.cos(rel * Math.PI / 180);
  const along = Math.abs(speed * c);
  let s;
  if (c >= 0.5) s = 'Headwind rowing upstream, tailwind coming back.';
  else if (c <= -0.5) s = 'Tailwind rowing upstream, headwind coming back.';
  else s = rel > 0 ? 'Crosswind off the New Hampshire bank.' : 'Crosswind off the Vermont bank.';
  if (Math.abs(c) >= 0.5 && along >= 8) s += ' Chop builds along the straight.';
  const f = flowNow(m);
  if (c <= -0.5 && along >= 8 && f != null && f >= 10000) s += ' Wind against current steepens it.';
  return s;
}
export function meanDir(hs) {
  let sx = 0, sy = 0;
  for (const h of hs) { const w = Math.max(h.wind || 0, 0.5), a = h.dir * Math.PI / 180; sx += w * Math.sin(a); sy += w * Math.cos(a); }
  return (Math.atan2(sx, sy) * 180 / Math.PI + 360) % 360;
}
export function angDev(a, b) { return Math.abs(((a - b + 540) % 360) - 180); }

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
  const early = localHour(h.t) <= FOG.lastHour;
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
      const why = `Water ${r0(wt)}°F under ${r0(h.temp)}°F air.`;
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
  const hs = m.hours.filter(h => dayKey(h.t) === key && h.t + HOUR > s.dawn - HOUR && localHour(h.t) <= FOG.lastHour);
  const foggy = hs.map(h => ({ h, f: fogRisk(m, h) })).filter(x => x.f.risk > 0);
  if (!foggy.length) return null;
  const top = foggy.reduce((a, b) => (b.f.risk > a.f.risk ? b : a)).f;
  const last = foggy[foggy.length - 1].h;
  return { ...top, until: last.t + HOUR, lingers: localHour(last.t) === FOG.lastHour };
}

// "lifting about 9 AM" or "lingering into late morning"
export function fogLift(mf) {
  return mf.lingers ? 'lingering into late morning' : `lifting about ${hm(mf.until)}`;
}

// The next morning that has not finished yet, with its fog (or null fog).
export function nextMorning(m) {
  for (const d of m.days) {
    const end = m.hours.find(h => dayKey(h.t) === d.key && localHour(h.t) === FOG.lastHour + 1);
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

  const w = r0(h.wind), g = r0(h.gust);
  if (w != null) {
    if (w >= S.windOff) add(2, 'wind', `Wind ${w} mph`);
    else if (w >= S.windCaution) add(1, 'wind', `Wind ${w} mph`);
  }
  if (g != null) {
    if (g >= S.gustOff) add(2, 'gust', `Gusts to ${g} mph`);
    else if (g >= S.gustCaution) add(1, 'gust', `Gusts to ${g} mph`);
  }

  const vm = h.vis != null ? h.vis / 1609.34 : null;
  if (vm != null && vm < 0.25) add(2, 'fog', 'Fog, visibility under a quarter mile');
  else if (vm != null && vm < 1) add(1, 'fog', `Visibility ${vm.toFixed(1)} mi`);
  else {
    const fr = fogRisk(m, h);
    if (fr.risk === 2) add(1, 'fog', fr.text);
  }

  if (h.temp != null && h.temp < 32) add(2, 'freeze', `Below freezing at ${r0(h.temp)}°F, ice on docks and oarlocks`);
  const wt = waterTemp(m);
  if (wt != null && h.temp != null) {
    const sum = Math.round(h.temp + wt);
    if (sum < S.coldCombined) add(1, 'cold', `Cold water, air plus water ${sum}°F`);
  }
  const f = flowNow(m);
  if (f != null) {
    if (f >= S.flowOff) add(2, 'flow', `High water at ${fmtInt(f)} cfs`);
    else if (f >= S.flowCaution) add(1, 'flow', `Elevated flow at ${fmtInt(f)} cfs`);
  }
  for (const a of m.alerts) {
    if (h.t >= a.start && h.t < a.end) add(a.lvl, 'alert', a.event);
  }
  r.sort((a, b) => b.lvl - a.lvl);
  return { lvl: r.reduce((mx, x) => Math.max(mx, x.lvl), 0), reasons: r };
}
export const lvlExcept = (a, keys) => a.reasons.filter(x => !keys.includes(x.key)).reduce((m, x) => Math.max(m, x.lvl), 0);

// ---------- Model ----------
// Build everything the UI needs from raw data and settings. Returns null if
// there is no usable forecast.
export function buildModel(data, S, now = Date.now()) {
  const d = data.wx;
  if (!d || !d.hourly || !d.daily) return null;
  const m = {
    S, data, now, sunCache: {},
    alerts: (data.alerts || []).filter(a => a.end > now),
    hours: [], days: [], h72: [], cur: null
  };
  const H = d.hourly;
  m.hours = H.time.map((s, i) => ({
    t: s * 1000, temp: H.temperature_2m[i], feels: H.apparent_temperature[i], dew: H.dew_point_2m[i],
    pop: H.precipitation_probability[i], precip: H.precipitation[i], code: H.weather_code[i],
    wind: H.wind_speed_10m[i], gust: H.wind_gusts_10m[i], dir: H.wind_direction_10m[i],
    vis: H.visibility[i], cape: H.cape[i], cloud: H.cloud_cover ? H.cloud_cover[i] : null
  }));
  // Mean cloud cover over the last 6 hours, for valley fog. Null if not available.
  m.hours.forEach((h, i) => {
    const cs = m.hours.slice(Math.max(0, i - 5), i + 1).map(x => x.cloud).filter(v => v != null);
    h.nightCloud = cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : null;
  });
  const D = d.daily;
  m.days = D.time.map((s, i) => ({
    t: s * 1000, key: dayKey(s * 1000 + 12 * HOUR), sunrise: D.sunrise[i] * 1000, sunset: D.sunset[i] * 1000,
    hi: D.temperature_2m_max[i], lo: D.temperature_2m_min[i], pop: D.precipitation_probability_max[i]
  }));
  for (const h of m.hours) h.a = assess(m, h);

  const h0 = Math.floor(now / HOUR) * HOUR;
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

  for (const day of m.days) day.periods = periodsFor(m, day);
  const s = sunFor(m, dayKey(now));
  m.daytime = !!s && now >= s.dawn && now < s.sunset;
  m.next = m.days.flatMap(d => d.periods).find(p => !p.past) || null;
  return m;
}

// Morning, midday and afternoon for one day. Each period's call is the worst
// hour still ahead in it, ignoring light: first light to sunrise always needs
// lights, so that is a note (lightsUntil) rather than a caution.
// Periods that are over come back as { past: true }.
export function periodsFor(m, day) {
  const s = sunFor(m, day.key);
  if (!s) return [];
  const dayHours = m.hours.filter(h => dayKey(h.t) === day.key);
  const clock = hr => { const h = dayHours.find(x => localHour(x.t) === hr); return h ? h.t : null; };
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
      fog, lightsUntil: from < s.sunrise ? s.sunrise : null
    };
  }).filter(Boolean);
}
