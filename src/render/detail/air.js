// Air: air quality, mostly wildfire smoke. US AQI each day, then one day
// hour by hour against the settings, with PM2.5.
import { HOUR, WORD_PLAIN } from '../../config.js';
import { esc, hm, r0, dayKey, whenText } from '../../format.js';
import { worstOf, factorLevel, aqiWord, sunFor } from '../../logic.js';
import { Chart, niceTicks, niceMax } from '../chart.js';
import { dayLabel } from '../days.js';
import { mid, chartWidth, weekDays, pickDay, weekStrip, legend, chartBox, hourTicks, tickEvery, lvlDot, hourTable, head } from './common.js';

const KEYS = ['aqi'];
const isSet = v => v !== '' && v != null && !isNaN(v);

export const key = 'air';
export const name = 'Air';

export function summary(m) {
  const c = m.cur;
  if (c.aqi != null) return { text: `AQI ${r0(c.aqi)} now, ${aqiWord(c.aqi).toLowerCase()}.`, lvl: factorLevel(c.a, KEYS).lvl };
  const next = m.h72.find(h => h.aqi != null);
  if (!next) return { text: 'No air quality forecast right now.', lvl: null };
  return { text: `AQI ${r0(next.aqi)} at ${whenText(next.t, true)}, ${aqiWord(next.aqi).toLowerCase()}.`, lvl: factorLevel(next.a, KEYS).lvl };
}

export function render(m, want) {
  const S = m.S, W = chartWidth(), days = weekDays(m), day = pickDay(m, want, days);
  if (!day) return { day, html: head(name, 'No forecast yet.') };
  const lede = summary(m).text;
  if (!m.hours.some(h => h.aqi != null)) {
    return { day, html: `${head(name, lede)}<div class="panel"><p>The air quality forecast did not load. It comes from a separate source; try Refresh.</p></div>` };
  }

  const strip = weekStrip(days.map(d => {
    const q = d.hs.map(h => h.aqi).filter(v => v != null);
    if (!q.length) return { key: d.key, t: d.t, value: '--', frac: 0, lvl: null, aria: `${dayLabel(d.t)}: no air quality forecast yet.` };
    const mx = Math.max(...q), l = worstOf(d.hs, KEYS);
    return { key: d.key, t: d.t, value: `${r0(mx)}`, frac: Math.min(1, mx / 200), lvl: l, aria: `${dayLabel(d.t)}: AQI up to ${r0(mx)}, ${aqiWord(mx).toLowerCase()}. ${WORD_PLAIN[l]}.` };
  }), day);

  const hs = days.find(d => d.key === day).hs, s = sunFor(m, day);
  const label = dayLabel(hs[0].t + 12 * HOUR);
  const q = hs.filter(h => h.aqi != null);
  let note;
  if (!q.length) note = 'The air quality forecast covers the next 5 days. This day is past it.';
  else {
    const top = q.reduce((a, b) => (b.aqi > a.aqi ? b : a));
    note = `${aqiWord(top.aqi)} at worst: AQI ${r0(top.aqi)} around ${hm(top.t)}.`;
  }

  const c = new Chart({ t0: hs[0].t, t1: hs[hs.length - 1].t + HOUR, W });
  let hi = niceMax(Math.max(60, ...q.map(h => h.aqi * 1.2)));
  for (const v of [S.aqiCaution, S.aqiOff]) if (isSet(v) && v <= hi * 1.5) hi = niceMax(Math.max(hi, v * 1.05));
  const A = c.lane(120, 0, hi, 'US AQI');
  if (isSet(S.aqiCaution)) c.hline(A, +S.aqiCaution, 'cthr1');
  if (isSet(S.aqiOff)) c.hline(A, +S.aqiOff, 'cthr2');
  c.grid(A, niceTicks(0, hi));
  c.band(A, hs.map(h => ({ t: mid(h), lo: 0, hi: h.aqi })), 'carea');
  c.line(A, hs.map(h => ({ t: mid(h), v: h.aqi })), 'cline');
  const pmHi = niceMax(Math.max(15, ...q.map(h => h.pm25 || 0)), 2);
  const P = c.lane(60, 0, pmHi, 'PM2.5, fine particles, µg/m³');
  c.grid(P, niceTicks(0, pmHi, 2));
  c.line(P, hs.map(h => ({ t: mid(h), v: h.pm25 })), 'cline2');

  c.span(hs[0].t, s.sunrise, 'clight');
  if (day === dayKey(m.now)) { c.past(m.now); c.vline(m.now, 'cnow', 'Now'); }
  c.axis(hourTicks(hs, tickEvery(W, hs.length)));
  for (const h of hs) {
    c.hit(h.t, h.t + HOUR, h.aqi == null ? `${hm(h.t)}: no forecast.` : `${hm(h.t)}: AQI ${r0(h.aqi)}, ${aqiWord(h.aqi).toLowerCase()}. PM2.5 ${r0(h.pm25)} µg/m³.`);
  }
  const keys = legend([
    { kind: 'line', text: 'AQI' }, { kind: 'line2', text: 'PM2.5' },
    ...(isSet(S.aqiCaution) ? [{ kind: 'dash1', text: `Caution ${S.aqiCaution}` }] : []),
    ...(isSet(S.aqiOff) ? [{ kind: 'dash2', text: `Stay off ${S.aqiOff}` }] : [])
  ]);
  const table = hourTable('Hour by hour', ['Hour', 'AQI', 'Category', 'PM2.5'], hs.map(h => [
    `${lvlDot(factorLevel(h.a, KEYS).lvl)}${hm(h.t)}`, h.aqi == null ? '--' : `${r0(h.aqi)}`, h.aqi == null ? '--' : esc(aqiWord(h.aqi)), h.pm25 == null ? '--' : `${r0(h.pm25)}`
  ]));
  const rc = isSet(S.aqiCaution) ? `caution at ${S.aqiCaution}` : 'no caution level';
  const ro = isSet(S.aqiOff) ? `stay off at ${S.aqiOff}` : 'no stay-off level';

  const html = `${head(name, lede)}
    <div class="panel">
      ${strip}
      <h3 class="dhead">${esc(label)}, first light to sunset</h3>
      <p class="dnote">${esc(note)}</p>
      ${chartBox(c.svg(`Air quality by hour for ${label}`), { keys })}
      ${table}
    </div>
    <div class="panel how">
      <h3>How this works</h3>
      <p>The US Air Quality Index runs from 0 to 500. Up to 50 is good, 51 to 100 moderate, 101 to 150 unhealthy for sensitive groups, 151 to 200 unhealthy, 201 to 300 very unhealthy. Here it is driven mostly by fine particles, PM2.5, which wildfire smoke carries a long way.</p>
      <p>Rowing hard means breathing deep, so smoke matters more on the water than on a walk. The call uses your settings: ${esc(rc)}, ${esc(ro)}. Either can be left empty in Settings.</p>
      <p>This is a forecast from the Copernicus atmosphere model through Open-Meteo, not a measurement. For readings, check AirNow.</p>
    </div>`;
  return { day, html };
}
