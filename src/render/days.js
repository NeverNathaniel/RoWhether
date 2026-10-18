// Day by day: morning, midday and afternoon for each day. Night is not shown.
// Each row opens to the full forecast for that period.
import { WORD_PLAIN, WATER } from '../config.js';
import { app, $ } from '../state.js';
import { esc, hm, r0, card, dayWord, fDayLong, lowerFirst } from '../format.js';
import { fogLift } from '../logic.js';
import { forecastPanel } from './forecast.js';

// "Today", "Tomorrow", or "Wed Oct 14"
export function dayLabel(t) {
  const w = dayWord(t);
  return (w === 'Today' || w === 'Tomorrow') ? w : fDayLong.format(new Date(t)).replace(',', '');
}

// "6:32 to 10 AM", or "now to 3 PM" for the period in progress
export function periodTime(p) {
  return `${p.from > p.start ? 'now' : hm(p.start)} to ${hm(p.end)}`;
}

// Chip text: "Go", or "Caution: steam fog likely"
export function periodCall(p) {
  return `${WORD_PLAIN[p.lvl]}${p.lvl && p.why ? ': ' + lowerFirst(p.why.text) : ''}`;
}

// The key numbers on one line: wind, temperature, rain, and when fog lifts.
export function periodSummary(p, u) {
  const parts = [
    `Wind ${u.speedRange(p.wmin, p.wmax)} ${card(p.dir)}, gusts ${r0(p.gmax)}.`,
    `${u.tempRange(p.tmin, p.tmax)}.`,
    `Rain ${r0(p.pop)}%.`
  ];
  if (p.fog && p.fog.until) parts.push(p.why && p.why.key === 'fog' ? `Fog ${fogLift(p.fog)}.` : `${p.fog.text}, ${fogLift(p.fog)}.`);
  else if (p.fog) parts.push(`${p.fog.text}.`);
  return parts.join(' ');
}

export function renderDays() {
  const m = app.model;
  $('days').innerHTML = m.days.map(d => {
    const ps = d.periods.filter(p => !p.past);
    if (!ps.length) return '';
    const label = dayLabel(ps[0].start);
    const items = ps.map(p => {
      const id = `${p.dayKey}-${p.key}`;
      const open = app.openPeriods.has(id);
      return `<li><details class="period" data-id="${id}" data-lvl="${p.lvl}"${open ? ' open' : ''}>
        <summary>
          <span class="phead">
            <span class="pname">${p.name}</span>
            <span class="ptime">${esc(periodTime(p))}</span>
          </span>
          <span class="chips">
            <span class="chip" data-lvl="${p.lvl}"><i aria-hidden="true"></i>${esc(periodCall(p))}</span>
            ${p.water ? `<span class="chip water" data-w="${p.water.max}">${WATER.names[p.water.max]}</span>` : ''}
          </span>
          <span class="psum">${esc(periodSummary(p, m.u))}</span>
          <span class="more" aria-hidden="true"><span class="show">Full forecast</span><span class="hide">Hide forecast</span></span>
        </summary>
        ${open ? forecastPanel(m, p) : ''}
      </details></li>`;
    }).join('');
    return `<section class="day-block" aria-label="${esc(label)}">
      <h3>${esc(label)}</h3>
      <ol class="periods">${items}</ol>
    </section>`;
  }).join('');
}

// Fill a row's forecast when it is opened. Panels are built on demand.
export function fillPeriod(details) {
  if (details.querySelector('.forecast')) return;
  const p = app.model.days.flatMap(d => d.periods).find(x => `${x.dayKey}-${x.key}` === details.dataset.id);
  if (p && !p.past) details.insertAdjacentHTML('beforeend', forecastPanel(app.model, p));
}
