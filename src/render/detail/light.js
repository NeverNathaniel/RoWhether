// Light: when it gets light and dark, how the days are changing through the
// season, and the UV index. Times come from SunCalc; UV from the forecast.
import { HOUR } from '../../config.js';
import { esc, hm, r0, dayKey, localHour, monthDay } from '../../format.js';
import { sunFor, sunOn, uvWord } from '../../logic.js';
import { Chart } from '../chart.js';
import { fact } from '../parts.js';
import { dayLabel } from '../days.js';
import { mid, chartWidth, weekDays, pickDay, weekStrip, legend, chartBox, hourTicks, tickEvery, hourTable, head } from './common.js';

export const key = 'light';
export const name = 'Light';

const DAY = 24 * HOUR;
// Minutes after local midnight. Eastern time is a whole number of hours from
// UTC, so the minutes match.
const clockMin = t => localHour(t) * 60 + new Date(t).getUTCMinutes();
const span = ms => { const mm = Math.round(ms / 60e3); return `${Math.floor(mm / 60)} h ${mm % 60} min`; };
const change = ms => {
  const sec = Math.round(Math.abs(ms) / 1000), word = ms < 0 ? 'less' : 'more';
  return sec < 60 ? `${sec} s ${word}` : `${Math.floor(sec / 60)} min ${sec % 60} s ${word}`;
};
const clockLabel = mm => { const h = Math.floor(mm / 60); return h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`; };

export function summary(m) {
  let s = sunFor(m, dayKey(m.now)), when = 'Today';
  if (!s || m.now > s.dusk) { s = sunOn(m.now + DAY); when = 'Tomorrow'; }
  return { text: `${when}: first light ${hm(s.dawn)}, sunset ${hm(s.sunset)}. ${span(s.sunset - s.sunrise)} of daylight.`, lvl: null };
}

// Dawn, sunrise, sunset and dusk for each day from 90 days back to 90 ahead,
// as a time-of-day chart. Twilight is the band that needs lights.
function seasonChart(m, W) {
  const today = sunOn(m.now).noon, pts = [];
  for (let i = -90; i <= 90; i++) {
    const t = today + i * DAY, s = sunOn(t);
    pts.push({ t, s, dawn: clockMin(s.dawn), rise: clockMin(s.sunrise), set: clockMin(s.sunset), dusk: clockMin(s.dusk) });
  }
  const c = new Chart({ t0: pts[0].t, t1: pts[pts.length - 1].t, W });
  const lo = 4 * 60, hi = 22 * 60;
  const L = c.lane(200, lo, hi, 'Time of day');
  c.zone(L, lo, hi, 'cnight');
  c.grid(L, [6, 9, 12, 15, 18, 21].map(h => h * 60), clockLabel);
  c.band(L, pts.map(p => ({ t: p.t, lo: p.dawn, hi: p.rise })), 'ctwi');
  c.band(L, pts.map(p => ({ t: p.t, lo: p.set, hi: p.dusk })), 'ctwi');
  c.band(L, pts.map(p => ({ t: p.t, lo: p.rise, hi: p.set })), 'cdaylight');
  c.vline(m.now, 'cnow', 'Today');
  // Month labels at the first of each month.
  const ticks = pts.filter(p => monthDay(p.t).endsWith(' 1')).map(p => ({ t: p.t, text: monthDay(p.t).split(' ')[0] }));
  c.axis(ticks);
  // One hit a week keeps the chart quick to tab through.
  c.hitsAt(pts.filter((_, i) => i % 7 === 0).map(p => ({
    t: p.t, text: `${monthDay(p.t)}: first light ${hm(p.s.dawn)}, sunrise ${hm(p.s.sunrise)}, sunset ${hm(p.s.sunset)}, dark ${hm(p.s.dusk)}. ${span(p.s.sunset - p.s.sunrise)} of daylight.`
  })));
  const short = pts.reduce((a, b) => (b.s.sunset - b.s.sunrise < a.s.sunset - a.s.sunrise ? b : a));
  return { svg: c.svg('First light, sunrise, sunset and dark over 6 months'), short };
}

export function render(m, want) {
  const W = chartWidth(), days = weekDays(m), day = pickDay(m, want, days);
  if (!day) return { day, html: head(name, 'No forecast yet.') };

  const strip = weekStrip(days.map(d => {
    const s = sunFor(m, d.key), len = s.sunset - s.sunrise;
    return { key: d.key, t: d.t, value: span(len).replace(' min', 'm').replace(' h ', 'h '), frac: (len / HOUR - 8.5) / 7, lvl: null,
      aria: `${dayLabel(d.t)}: sunrise ${hm(s.sunrise)}, sunset ${hm(s.sunset)}, ${span(len)} of daylight.` };
  }), day);

  const d = m.days.find(x => x.key === day), s = { ...sunFor(m, day), noon: sunOn(d.t + 12 * HOUR).noon }, prev = sunOn(s.noon - DAY);
  const len = s.sunset - s.sunrise, delta = len - (prev.sunset - prev.sunrise);
  const label = dayLabel(d.t + 12 * HOUR);

  const f = [
    fact('First light', hm(s.dawn), `Civil twilight begins. Lights needed until sunrise at ${hm(s.sunrise)}.`),
    fact('Sunrise', hm(s.sunrise), `Sun highest at ${hm(s.noon)}.`),
    fact('Sunset', hm(s.sunset), `Lights needed after sunset until dark at ${hm(s.dusk)}.`),
    fact('Daylight', span(len), `${change(delta)} than the day before.`)
  ];
  if (d.uvMax != null) f.push(fact('UV index', `${r0(d.uvMax)}`, `${uvWord(d.uvMax)} at its peak.${d.uvMax >= 3 ? ' Sunscreen for long sessions, and the water reflects it.' : ''}`));

  // The day hour by hour: light state and UV.
  const hs = m.hours.filter(h => dayKey(h.t) === day && h.t + HOUR > s.dawn - HOUR && h.t < s.dusk + HOUR);
  const c = new Chart({ t0: hs[0].t, t1: hs[hs.length - 1].t + HOUR, W });
  const Lt = c.lane(14, 0, 1, 'Light');
  c.cells(Lt, hs.map(h => {
    const t = h.t + HOUR / 2;
    return { t0: h.t, t1: h.t + HOUR, cls: t < s.dawn || t > s.dusk ? 'clt0' : t < s.sunrise || t > s.sunset ? 'clt1' : 'clt2' };
  }));
  const hasUV = hs.some(h => h.uv != null);
  if (hasUV) {
    const U = c.lane(70, 0, Math.max(6, Math.ceil(Math.max(...hs.map(h => h.uv || 0)) + 1)), 'UV index');
    c.grid(U, [0, 3, 6, 8, 11].filter(v => v <= U.hi));
    c.cols(U, hs.map(h => ({ t0: h.t, t1: h.t + HOUR, v: h.uv, cls: 'ccol' })));
  }
  c.vline(s.sunrise, 'cmarkline', 'Sunrise');
  c.vline(s.sunset, 'cmarkline', 'Sunset');
  if (day === dayKey(m.now)) c.past(m.now);
  c.axis(hourTicks(hs, tickEvery(W, hs.length)));
  for (const h of hs) {
    const t = h.t + HOUR / 2, state = t < s.dawn || t > s.dusk ? 'Dark' : t < s.sunrise || t > s.sunset ? 'Twilight, lights needed' : 'Daylight';
    c.hit(h.t, h.t + HOUR, `${hm(h.t)}: ${state}.${h.uv != null ? ` UV ${r0(h.uv)}.` : ''}`);
  }
  const keys = legend([{ kind: 'clt2', text: 'Daylight' }, { kind: 'clt1', text: 'Twilight, lights needed' }, { kind: 'clt0', text: 'Dark' }]);

  const season = seasonChart(m, W);
  const table = hourTable('Each day this week', ['Day', 'First light', 'Sunrise', 'Sunset', 'Dark', 'Daylight'], days.map(x => {
    const t = sunFor(m, x.key);
    return [esc(dayLabel(x.t)), hm(t.dawn), hm(t.sunrise), hm(t.sunset), hm(t.dusk), span(t.sunset - t.sunrise)];
  }));

  const html = `${head(name, summary(m).text)}
    <div class="panel">
      ${strip}
      <h3 class="dhead">${esc(label)}</h3>
      <dl class="facts">${f.join('')}</dl>
      ${chartBox(c.svg(`Light and UV index by hour for ${label}`), { keys })}
      ${table}
    </div>
    <div class="panel">
      <h3>The season</h3>
      <p class="dnote">Three months back and three ahead. The light band is daylight; the narrow bands either side are twilight. The shortest day in view is ${esc(monthDay(season.short.t))}, ${span(season.short.s.sunset - season.short.s.sunrise)}. Steps are the switches to and from daylight saving time.</p>
      ${chartBox(season.svg, { keys: legend([{ kind: 'cdaylight', text: 'Daylight' }, { kind: 'ctwi', text: 'Twilight' }, { kind: 'cnight', text: 'Night' }]), hint: 'Tap the chart for a week.' })}
    </div>
    <div class="panel how">
      <h3>How this works</h3>
      <p>First light is the start of civil twilight, when the sun is 6° below the horizon. Dark is the end of it in the evening. Between first light and sunrise, and between sunset and dark, boats need lights. Before first light and after dark is too dark to row.</p>
      <p>Times are worked out for the dock from the sun's position, so they are exact to the minute. The UV index comes from the forecast and is highest around midday.</p>
    </div>`;
  return { day, html };
}
