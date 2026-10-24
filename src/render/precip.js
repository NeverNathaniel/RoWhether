// Precipitation block shared by On the water now and the full forecast: a
// headline chance, when and what, and the hourly chart. Tapping a column
// shows that hour under the chart (handler in src/main.js).
import { HOUR } from '../config.js';
import { esc, hm, r0 } from '../format.js';
import { precipSummary, precipKind } from '../logic.js';
import { precipChart, CHEV } from './parts.js';

// hs: the hours to cover. from: when the first hour effectively starts (now,
// or the start of a period). label: the heading. lead: optional sentence
// before the summary.
// "Most likely 1 to 3 PM. Showers, about 0.20 in." from precipSummary().
export function precipNote(sum, from, u) {
  if (sum.peak < 20) return 'Little chance of rain or snow. Under 20% throughout.';
  const when = sum.toT - sum.fromT <= HOUR ? `around ${hm(Math.max(sum.fromT, from))}` : `${hm(Math.max(sum.fromT, from))} to ${hm(sum.toT)}`;
  const kind = sum.kind ? sum.kind[0].toUpperCase() + sum.kind.slice(1) : 'Precipitation';
  const amt = sum.total >= 0.01 ? `, about ${u.precip(sum.total)}` : ', light amounts at most';
  return `Most likely ${when}. ${kind}${amt}.`;
}

export function precipBlock(m, hs, from, lvl, { label = 'Precipitation', lead = '', href = '' } = {}) {
  const sum = precipSummary(hs);
  if (!sum) return '';
  const note = precipNote(sum, from, m.u);
  const describe = h => {
    const k = precipKind(h.code);
    return `${hm(Math.max(h.t, from))}: ${r0(h.pop) ?? 0}% chance${k ? `, ${k}` : ''}${h.precip >= 0.01 ? `, about ${m.u.precip(h.precip)}` : ''}.`;
  };
  return `<div class="fact precip chart-box"${lvl ? ` data-lvl="${lvl}"` : ''}>
    <div class="precip-label">${href ? `<a class="flink" href="${href}">${esc(label)}${CHEV}</a>` : esc(label)}</div>
    <div class="val">${sum.peak}% chance</div>
    <div class="note">${esc((lead ? lead + ' ' : '') + note)}</div>
    ${precipChart(hs, m.S, from, describe)}
    <p class="readout" aria-live="polite">Tap a column for that hour.</p>
  </div>`;
}
