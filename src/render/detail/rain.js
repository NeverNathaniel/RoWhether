// Rain: the highest chance each day, then one day hour by hour: chance
// against the settings, amount, and any thunderstorm risk.
import { HOUR, WORD_PLAIN } from '../../config.js';
import { hm, r0, dayKey } from '../../format.js';
import { worstOf, factorLevel, precipSummary, precipKind, sunFor, confidence, confidenceText } from '../../logic.js';
import { Chart, niceTicks, niceMax } from '../chart.js';
import { dayLabel } from '../days.js';
import { precipNote } from '../precip.js';
import { mid, chartWidth, weekDays, pickDay, weekStrip, legend, chartBox, hourTicks, tickEvery, lvlDot, hourTable, head } from './common.js';

const KEYS = ['pop', 'rain', 'storm', 'stormrisk', 'snow', 'ice'];
const STORM = ['storm', 'stormrisk'];
const isSet = v => v !== '' && v != null && !isNaN(v);

export const key = 'rain';
export const name = 'Rain';

// The next 12 hours.
export function summary(m) {
  const hs = m.h72.slice(0, 12), sum = precipSummary(hs);
  if (!sum) return { text: '', lvl: null };
  const lvl = worstOf(hs, KEYS);
  if (sum.peak < 20) return { text: 'Under 20% for the next 12 hours.', lvl };
  return { text: `${sum.peak}% chance around ${hm(Math.max(sum.peakT, m.now))}${sum.kind ? `, ${sum.kind}` : ''}.`, lvl };
}

const popLvl = (S, v) => (isSet(S.rainOff) && v >= S.rainOff ? 2 : isSet(S.rainCaution) && v >= S.rainCaution ? 1 : 0);

function hourText(h) {
  const k = precipKind(h.code), st = factorLevel(h.a, STORM).why;
  const models = h.ens && h.ens.precip.length >= 2 ? ` ${h.ens.precip.filter(p => p >= 0.01).length} of ${h.ens.precip.length} models show rain.` : '';
  return `${hm(h.t)}: ${r0(h.pop) ?? 0}% chance${k ? `, ${k}` : ''}${h.precip >= 0.01 ? `, about ${h.precip.toFixed(2)} in` : ''}.${st ? ` ${st.text}.` : ''}${models}`;
}

export function render(m, want) {
  const S = m.S, W = chartWidth(), days = weekDays(m), day = pickDay(m, want, days);
  const lede = summary(m).text;
  if (!day) return { day, html: head(name, 'No forecast yet.') };

  const strip = weekStrip(days.map(d => {
    const p = Math.max(0, ...d.hs.map(h => r0(h.pop) || 0)), tot = d.hs.reduce((a, h) => a + (h.precip || 0), 0), l = worstOf(d.hs, KEYS);
    return { key: d.key, t: d.t, value: `${p}%`, frac: p / 100, lvl: l, aria: `${dayLabel(d.t)}: up to ${p}% chance, about ${tot.toFixed(2)} in. ${WORD_PLAIN[l]}.` };
  }), day);

  const hs = days.find(d => d.key === day).hs, s = sunFor(m, day);
  const label = dayLabel(hs[0].t + 12 * HOUR);
  const today = day === dayKey(m.now);
  // Today, the note covers the hours still ahead.
  const ahead = today ? hs.filter(h => h.t + HOUR > m.now) : hs;
  const sum = precipSummary(ahead.length ? ahead : hs);
  const c = new Chart({ t0: hs[0].t, t1: hs[hs.length - 1].t + HOUR, W });

  const P = c.lane(110, 0, 100, 'Chance of rain or snow, %');
  if (isSet(S.rainCaution) && S.rainCaution > 0) c.hline(P, +S.rainCaution, 'cthr1', `${S.rainCaution}%`);
  if (isSet(S.rainOff) && S.rainOff > 0) c.hline(P, +S.rainOff, 'cthr2', `${S.rainOff}%`);
  c.grid(P, [0, 50, 100], v => `${v}%`);
  c.cols(P, hs.map(h => ({ t0: h.t, t1: h.t + HOUR, v: h.pop, cls: `ccol b${popLvl(S, r0(h.pop) || 0)}` })));
  const pk = hs.reduce((a, b) => ((b.pop || 0) > (a.pop || 0) ? b : a));
  if ((pk.pop || 0) >= 20) c.note(P, mid(pk), pk.pop, `${r0(pk.pop)}%`);

  const total = hs.reduce((a, h) => a + (h.precip || 0), 0);
  const hiAmt = niceMax(Math.max(0.1, ...hs.map(h => h.precip || 0)), 2);
  const A = c.lane(56, 0, hiAmt, `Amount, inches per hour. ${total >= 0.01 ? `About ${total.toFixed(2)} in` : 'None expected'} by sunset.`);
  c.grid(A, niceTicks(0, hiAmt, 2));
  c.cols(A, hs.map(h => ({ t0: h.t, t1: h.t + HOUR, v: h.precip, cls: 'ccol' })));

  // Forecast confidence: how many of the compared models show rain each hour.
  const conf = confidence(hs);
  const counted = hs.some(h => h.ens && h.ens.precip.length >= 2);
  if (counted) {
    const M = c.lane(14, 0, 1, `Forecast models showing rain, of ${conf.n}`);
    c.cells(M, hs.map(h => {
      if (!h.ens || h.ens.precip.length < 2) return { t0: h.t, t1: h.t + HOUR, cls: '' };
      const k = h.ens.precip.filter(p => p >= 0.01).length;
      return { t0: h.t, t1: h.t + HOUR, cls: `cmr cmr${Math.round(k / h.ens.precip.length * 4)}` };
    }));
  }

  const stormy = hs.some(h => factorLevel(h.a, STORM).lvl);
  if (stormy) {
    const T = c.lane(12, 0, 1, 'Thunderstorm risk');
    c.cells(T, hs.map(h => { const l = factorLevel(h.a, STORM).lvl; return { t0: h.t, t1: h.t + HOUR, cls: l ? `cs b${l}` : '' }; }));
  }

  c.span(hs[0].t, s.sunrise, 'clight');
  if (today) { c.past(m.now); c.vline(m.now, 'cnow', 'Now'); }
  c.axis(hourTicks(hs, tickEvery(W, hs.length)));
  for (const h of hs) c.hit(h.t, h.t + HOUR, hourText(h));

  const keys = legend([
    ...(isSet(S.rainCaution) ? [{ kind: 'dash1', text: `Caution ${S.rainCaution}%` }] : []),
    ...(isSet(S.rainOff) ? [{ kind: 'dash2', text: `Stay off ${S.rainOff}%` }] : []),
    ...(stormy ? [{ kind: 'cs1', text: 'Thunderstorms possible' }, { kind: 'cs2', text: 'Thunderstorms' }] : []),
    ...(counted ? [{ kind: 'cmr4', text: 'All models show rain' }, { kind: 'cmr2', text: 'Half' }] : [])
  ]);

  const table = hourTable('Hour by hour', ['Hour', 'Chance', 'Amount', 'Type'], hs.map(h => [
    `${lvlDot(factorLevel(h.a, KEYS).lvl)}${hm(h.t)}`, `${r0(h.pop) ?? 0}%`, h.precip >= 0.01 ? `${h.precip.toFixed(2)} in` : '0', precipKind(h.code) || '--'
  ]));

  const rc = isSet(S.rainCaution) ? `caution at ${S.rainCaution}%` : 'no caution level';
  const ro = isSet(S.rainOff) ? `stay off at ${S.rainOff}%` : 'no stay-off level';
  const html = `${head(name, lede)}
    <div class="panel">
      ${strip}
      <h3 class="dhead">${label}, first light to sunset</h3>
      <p class="dnote">${sum ? precipNote(sum, today ? m.now : hs[0].t) : ''}${conf ? ` ${confidenceText(conf, 'rain')}` : ''}</p>
      ${chartBox(c.svg(`Chance and amount of precipitation by hour for ${label}`), { keys })}
      ${table}
    </div>
    <div class="panel how">
      <h3>How this works</h3>
      <p>The call compares the chance of rain in each hour with your settings: ${rc}, ${ro}. Either can be left empty in Settings to turn it off.</p>
      <p>Heavy rain, 0.15 in an hour or more, is a caution. So is snow. Freezing rain and thunderstorms are stay off. Thunderstorms are possible, a caution, when the air is unstable (CAPE of 1,000 or more) and the chance of rain is at least 30%.</p>
      <p>Lightning: off the water at the first thunder, back on 30 minutes after the last.</p>
    </div>`;
  return { day, html };
}
