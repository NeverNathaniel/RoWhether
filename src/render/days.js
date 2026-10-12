// Day by day: morning, midday and afternoon for each day. Night is not shown.
import { WORD_PLAIN, LIGHT_KEYS } from '../config.js';
import { app, $ } from '../state.js';
import { esc, hm, r0, card, rng, dayWord, fDayLong, lowerFirst } from '../format.js';
import { fogLift, lvlExcept, windVsCourse } from '../logic.js';

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

// Wind, temperature and rain, plus fog and lights notes.
export function periodNote(m, p) {
  const parts = [`Wind ${rng(p.wmin, p.wmax, ' mph')} from ${card(p.dir)}, gusts to ${r0(p.gmax)}.`];
  const course = windVsCourse(m, p.dir, p.avgWind);
  if (course) parts.push(course);
  parts.push(`${rng(p.tmin, p.tmax, '°F')}.`);
  parts.push(p.precip >= 0.01 ? `Rain ${r0(p.pop)}%, about ${p.precip.toFixed(2)} in.` : `Rain ${r0(p.pop)}%.`);
  // When fog is the reason for the call, the chip already names it.
  if (p.fog && p.why && p.why.key === 'fog') { if (p.fog.until) parts.push(`Fog ${fogLift(p.fog)}.`); }
  else if (p.fog) parts.push(p.fog.until ? `${p.fog.text}, ${fogLift(p.fog)}.` : `${p.fog.text}.`);
  if (p.lightsUntil) parts.push(`Lights needed until sunrise at ${hm(p.lightsUntil)}.`);
  return parts.join(' ');
}

function hoursTable(p) {
  const rows = p.hs.map(h => {
    const lv = lvlExcept(h.a, LIGHT_KEYS);
    return `<tr><td><i class="b${lv}" aria-label="${WORD_PLAIN[lv]}"></i>${esc(hm(Math.max(h.t, p.from)))}</td><td>${r0(h.wind)} mph</td><td>${r0(h.gust)}</td><td>${card(h.dir)}</td><td>${r0(h.temp)}°</td><td>${r0(h.pop) ?? 0}%</td></tr>`;
  }).join('');
  return `<div class="hours-wrap"><table class="hours">
    <thead><tr><th scope="col">Hour</th><th scope="col">Wind</th><th scope="col">Gust</th><th scope="col">From</th><th scope="col">Air</th><th scope="col">Rain</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

export function renderDays() {
  const m = app.model;
  $('days').innerHTML = m.days.map(d => {
    const ps = d.periods.filter(p => !p.past);
    if (!ps.length) return '';
    const items = ps.map(p => {
      const id = `${p.dayKey}-${p.key}`;
      return `<li><details class="period" data-id="${id}"${app.openPeriods.has(id) ? ' open' : ''}>
        <summary>
          <span class="pname">${p.name} <span class="ptime">${esc(periodTime(p))}</span></span>
          <span class="chip" data-lvl="${p.lvl}"><i aria-hidden="true"></i>${esc(periodCall(p))}</span>
          <span class="pnote">${esc(periodNote(m, p))} <span class="more">Hour by hour</span></span>
        </summary>
        ${hoursTable(p)}
      </details></li>`;
    }).join('');
    return `<section class="day-block" aria-label="${esc(dayLabel(ps[0].start))}">
      <h3>${esc(dayLabel(ps[0].start))}</h3>
      <ol class="periods">${items}</ol>
    </section>`;
  }).join('');
}
