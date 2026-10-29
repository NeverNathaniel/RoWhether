// Shared pieces of the detail views: the week strip that picks a day, chart
// boxes with a legend and readout, the hour table under each chart, and the
// chart width.
import { HOUR, WORD_PLAIN } from '../../config.js';
import { $ } from '../../state.js';
import { esc, hShort, localHour, dayKey, weekday } from '../../format.js';
import { rowingHours } from '../../logic.js';

export const mid = h => h.t + HOUR / 2;

// Chart width in px, measured so SVG text draws at its real size.
// Panel padding is 1rem a side on phones, 1.5rem from 46rem up.
export function chartWidth() {
  const w = $('detail').clientWidth;
  const pad = matchMedia('(min-width:46rem)').matches ? 48 : 32;
  return Math.max(280, Math.min(720, w - pad));
}

// Each forecast day that has a rowing window, with its hours.
export function weekDays(m) {
  return m.days.map(d => ({ key: d.key, t: d.t + 12 * HOUR, hs: rowingHours(m, d.key) })).filter(d => d.hs.length);
}

// The day a view opens on: the one asked for if there is data for it, else
// the day of the next period (today until sunset, then tomorrow).
export function pickDay(m, want, days) {
  if (want && days.some(d => d.key === want)) return want;
  const k = m.next ? m.next.dayKey : null;
  return days.some(d => d.key === k) ? k : (days[0] ? days[0].key : null);
}

const stripName = t => (dayKey(t) === dayKey(Date.now()) ? 'Today' : weekday(t));
const pct = v => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

// One button per day: name, a small bar for the day's value, and the value.
// items: [{ key, t, value, frac, lo?, lvl, aria, cls? }]. With lo the bar spans lo
// to frac (a range); without it the bar grows from the bottom. lvl is 0, 1
// or 2 for the status colors, 'p' for possible fog, or null for neutral. cls is
// an extra class for the value, such as `wrap` for one that breaks over two lines.
export function weekStrip(items, sel) {
  return `<div class="strip" role="group" aria-label="Choose a day">${items.map(it => {
    const f = it.frac > 0 ? Math.max(it.frac, 0.06) : 0;
    const bar = it.lo != null ? `bottom:${pct(it.lo)};height:${pct(Math.max(0.06, it.frac - it.lo))}` : `height:${pct(f)}`;
    return `<button type="button" class="sday" data-day="${it.key}" aria-pressed="${it.key === sel}" aria-label="${esc(it.aria)}">
      <span class="sname">${esc(stripName(it.t))}</span>
      <span class="strack" aria-hidden="true"><i data-lvl="${it.lvl ?? ''}" style="${bar}"></i></span>
      <span class="sval${it.value.length > 6 ? ' long' : ''}${it.cls ? ` ${it.cls}` : ''}">${esc(it.value)}</span>
    </button>`;
  }).join('')}</div>`;
}

// Legend keys. kind: line, line2 (secondary), band, fcst (forecast), dash1
// and dash2 (settings lines), zone1 and zone2 (fog zones), or a cell class.
export function legend(items) {
  return `<ul class="legend">${items.map(it => `<li><i class="lk lk-${it.kind}" aria-hidden="true"></i>${esc(it.text)}</li>`).join('')}</ul>`;
}

export function chartBox(svg, { keys = '', hint = 'Tap the chart for an hour.' } = {}) {
  return `<div class="chart-box">${keys}${svg}<p class="readout" aria-live="polite">${esc(hint)}</p></div>`;
}

// Hour ticks on clock hours that divide by `every`.
export function hourTicks(hs, every = 3) {
  return hs.filter(h => localHour(h.t) % every === 0).map(h => ({ t: h.t, text: hShort(h.t) }));
}
// Thin out hour ticks when slots are narrow.
export const tickEvery = (W, n) => ((W - 46) / n < 22 ? 3 : (W - 46) / n < 40 ? 2 : 1);

export const lvlDot = l => `<i class="b${l}" aria-label="${WORD_PLAIN[l]}"></i>`;

// The table version of a chart, closed by default. Cells are HTML.
export function hourTable(caption, heads, rows) {
  return `<details class="twin" data-keep="${esc(caption)}"><summary>${esc(caption)}</summary><div class="hours-wrap"><table class="hours">
    <thead><tr>${heads.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div></details>`;
}

// head() is in parts.js, in the main script, so that renderDetail() can draw
// "Loading." without this module (P1.2a). The views import it from here.
export { head } from '../parts.js';
