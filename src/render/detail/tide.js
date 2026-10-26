// Tide: the NWS tide forecast of a tidal place, for information only (01 9.4, 9.7). A week
// strip of the days, one day's heights over its rowing window with each high and low
// labeled, and the hours. The strip has no status colors: tide does not change the verdict.
// A chunk of its own, loaded the first time the tab opens (P1.14).
import { hm, dayKey } from '../../format.js';
import { tideAt, tideEvents, tideLine } from '../../logic.js';
import { sourceRow } from '../../location.js';
import { HOUR } from '../../config.js';
import { dayLabel } from '../days.js';
import { Chart, niceTicks, chartWidth, weekDays, pickDay, weekStrip, chartBox, hourTicks, tickEvery, hourTable, head } from './views.js';

export const key = 'tide';
export const name = 'Tide';

export function summary(m) {
  return { text: tideLine(m) || 'No tide forecast right now.', lvl: null };
}

export function render(m, want) {
  const tide = m.data.tide, series = tide?.series || [], unit = tide?.unit;
  const lede = summary(m).text;
  if (!series.length) return { day: null, html: `${head(name, lede)}<div class="panel"><p>The tide forecast is not available right now. Try Refresh.</p></div>` };
  const days = weekDays(m), day = pickDay(m, want, days);
  if (!day) return { day, html: head(name, 'No forecast yet.') };
  const ht = h => m.u.stage(h, unit), word = e => (e.type === 'H' ? 'High' : 'Low');
  const around = (t0, t1) => series.filter(p => p.t >= t0 && p.t <= t1);
  const windowOf = d => [d.hs[0].t, d.hs[d.hs.length - 1].t + HOUR];

  // One scale for every day, so the days compare: from just under the lowest to just over the
  // highest height, with room for the labels.
  const all = series.map(p => p.h), lo = Math.floor(Math.min(...all) - 0.7), hi = Math.ceil(Math.max(...all) + 0.8);
  const strip = weekStrip(days.map(d => {
    const hs = around(...windowOf(d)).map(p => p.h);
    if (!hs.length) return { key: d.key, t: d.t, value: 'No tide forecast', frac: 0, lvl: null, cls: 'wrap', aria: `${dayLabel(d.t)}: no tide forecast.` };
    const top = Math.max(...hs), low = Math.min(...hs);
    return { key: d.key, t: d.t, value: `High ${ht(top).replace(' ', '\u00a0')}`, lo: (low - lo) / (hi - lo), frac: (top - lo) / (hi - lo), lvl: null, cls: 'wrap', aria: `${dayLabel(d.t)}: high ${ht(top)}, low ${ht(low)}.` };
  }), day);

  const d = days.find(x => x.key === day), [t0, t1] = windowOf(d), pts = around(t0, t1), evs = tideEvents(m, t0, t1);
  const when = dayLabel(d.t);
  let chart = '', table = '', note = `No tide forecast for ${when}. The forecast covers about 3 days.`;
  if (pts.length) {
    const W = chartWidth(), c = new Chart({ t0, t1, W });
    const L = c.lane(150, lo, hi, `Tide height, ${unit}`);
    c.grid(L, niceTicks(lo, hi));
    c.band(L, pts.map(p => ({ t: p.t, lo, hi: p.h })), 'carea');
    c.line(L, pts.map(p => ({ t: p.t, v: p.h })), 'cline');
    for (const e of evs) c.note(L, e.t, e.h, `about ${hm(e.t)}, ${ht(e.h)}`, e.type === 'L');
    if (day === dayKey(m.now)) { c.past(m.now); c.vline(m.now, 'cnow', 'Now'); }
    c.axis(hourTicks(d.hs, tickEvery(W, d.hs.length)));
    const rise = t => (tideAt(m, t).rising ? 'rising' : 'falling');
    c.hitsAt(pts.map(p => ({ t: p.t, text: `${hm(p.t)}: ${ht(p.h)}, ${rise(p.t)}.` })));
    chart = chartBox(c.svg(`Tide height by hour for ${when}`), { hint: 'Tap the chart for an hour.' });
    table = hourTable('Hour by hour', ['Time', 'Height', 'Tide'], pts.map(p => [hm(p.t), ht(p.h), rise(p.t) === 'rising' ? 'Rising' : 'Falling']));
    note = evs.length ? evs.map(e => `${word(e)} about ${hm(e.t)}, ${ht(e.h)}.`).join(' ') : `The water ${rise(pts[0].t) === 'rising' ? 'rises' : 'falls'} through the day.`;
  }

  // "the Potomac at Georgetown": the waterway's name without its "River", and the tide row's label.
  const place = sourceRow(m.loc, 'tide')?.label, river = m.loc.waterwayName?.replace(/ River$/, ''), where = place && river ? `the ${river} at ${place}` : place || '';
  const html = `${head(name, lede)}
    <div class="panel">
      ${strip}
      <h3 class="dhead">${when}, first light to sunset</h3>
      <p class="dnote">${note}</p>
      ${chart}
      ${table}
    </div>
    <div class="panel how">
      <h3>How this works</h3>
      <p>Tide heights are the National Weather Service forecast${where ? ` for ${where}` : ''}, in ${unit === 'm' ? 'metres' : 'feet'}, hourly for 3 days. Highs and lows are the highest and lowest hourly values, so their times are right to about half an hour.</p>
      <p>Tide is shown for information. It does not change Go, Caution or Stay off.</p>
    </div>`;
  return { day, html };
}
