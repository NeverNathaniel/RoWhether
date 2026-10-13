// Precipitation block shared by On the water now and the full forecast: a
// headline chance, when and what, and the hourly chart. Tapping a column
// shows that hour under the chart (handler in src/main.js).
import { HOUR } from '../config.js';
import { esc, hm, r0 } from '../format.js';
import { precipSummary, precipKind } from '../logic.js';
import { precipChart } from './parts.js';

// hs: the hours to cover. from: when the first hour effectively starts (now,
// or the start of a period). label: the heading. lead: optional sentence
// before the summary.
export function precipBlock(m, hs, from, lvl, { label = 'Precipitation', lead = '' } = {}) {
  const sum = precipSummary(hs);
  if (!sum) return '';
  let note;
  if (sum.peak < 20) note = 'Little chance of rain or snow. Under 20% throughout.';
  else {
    const when = sum.toT - sum.fromT <= HOUR ? `around ${hm(Math.max(sum.fromT, from))}` : `${hm(Math.max(sum.fromT, from))} to ${hm(sum.toT)}`;
    const kind = sum.kind ? sum.kind[0].toUpperCase() + sum.kind.slice(1) : 'Precipitation';
    const amt = sum.total >= 0.01 ? `, about ${sum.total.toFixed(2)} in` : ', light amounts at most';
    note = `Most likely ${when}. ${kind}${amt}.`;
  }
  const describe = h => {
    const k = precipKind(h.code);
    return `${hm(Math.max(h.t, from))}: ${r0(h.pop) ?? 0}% chance${k ? `, ${k}` : ''}${h.precip >= 0.01 ? `, about ${h.precip.toFixed(2)} in` : ''}.`;
  };
  return `<div class="fact precip"${lvl ? ` data-lvl="${lvl}"` : ''}>
    <div class="precip-label">${esc(label)}</div>
    <div class="val">${sum.peak}% chance</div>
    <div class="note">${esc((lead ? lead + ' ' : '') + note)}</div>
    ${precipChart(hs, m.S, from, describe)}
    <p class="precip-hover" aria-live="polite">Tap a column for that hour.</p>
  </div>`;
}
