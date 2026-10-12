// Week ahead: dawn and evening calls for each day.
import { HOUR, MIN } from '../config.js';
import { app, $ } from '../state.js';
import { esc, hm, r0, dayKey, dayWord, fDayLong } from '../format.js';
import { lightAt, session, sunFor, morningFog, fogLift } from '../logic.js';

function chip(name, s) {
  if (!s) return '';
  if (s.past) return `<span class="chip past">${name}: done</span>`;
  return `<span class="chip" data-lvl="${s.lvl}"><i aria-hidden="true"></i>${name}: ${esc(s.label)}</span>`;
}

export function renderWeek() {
  const m = app.model;
  $('week').innerHTML = m.days.map(d => {
    const s = sunFor(m, d.key);
    const dh = m.hours.filter(h => dayKey(h.t) === d.key);
    if (!s || !dh.length) return '';
    const dawn = session(m, dh.filter(h => h.t >= s.sunrise - 30 * MIN && h.t < s.sunrise + 150 * MIN));
    const mf = morningFog(m, d.key);
    if (dawn && mf && dawn.key === 'fog') dawn.label = mf.lingers ? 'fog all morning' : `fog until ${hm(mf.until)}`;
    const fog = mf && !(dawn && dawn.past) ? ` ${mf.text}, ${fogLift(mf)}.` : '';
    const eve = session(m, dh.filter(h => h.t >= s.sunset - 200 * MIN && h.t < s.sunset - 20 * MIN));
    const lit = dh.filter(h => lightAt(m, h.t + 30 * MIN) === 'day');
    const ws = lit.map(h => h.wind), gs = lit.map(h => h.gust);
    const wind = ws.length ? `Wind ${r0(Math.min(...ws))} to ${r0(Math.max(...ws))} mph, gusts ${r0(Math.max(...gs))}.` : '';
    const name = dayWord(d.t + 12 * HOUR);
    const label = (name === 'Today' || name === 'Tomorrow') ? name : fDayLong.format(new Date(d.t + 12 * HOUR)).replace(',', '');
    return `<li class="day">
      <span class="dname">${esc(label)}</span>
      <span class="sessions">${chip('Dawn', dawn)}${chip('Evening', eve)}</span>
      <span class="dstats">${r0(d.hi)}° / ${r0(d.lo)}°. ${wind} Rain ${r0(d.pop) ?? 0}%.${esc(fog)}</span>
    </li>`;
  }).join('');
}
