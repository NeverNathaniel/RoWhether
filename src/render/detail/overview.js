// Overview: every hour of the week from first light to sunset, colored by the
// call, and for one day, which factor sets it hour by hour.
import { FACTORS, LIGHT_KEYS, WORD_PLAIN } from '../../config.js';
import { esc, hm, localHour, dayKey, weekday } from '../../format.js';
import { lvlExcept, factorLevel, sunFor } from '../../logic.js';
import { dayLabel, periodTime } from '../days.js';
import { weekDays, pickDay, legend, head } from './common.js';

export const key = 'overview';
export const name = 'Overview';

const lowerDay = t => dayLabel(t).replace(/^(Today|Tomorrow)$/, s => s.toLowerCase());
const hourName = hr => (hr === 0 ? '12a' : hr < 12 ? `${hr}a` : hr === 12 ? '12p' : `${hr - 12}p`);
const rowName = t => (dayKey(t) === dayKey(Date.now()) ? 'Today' : weekday(t));

export function summary(m) {
  if (m.daytime && lvlExcept(m.cur.a, LIGHT_KEYS) === 0) return { text: 'Go now.', lvl: 0 };
  const g = m.days.flatMap(d => d.periods).find(p => !p.past && p.lvl === 0);
  if (!g) return { text: 'No go period in the next 7 days.', lvl: 2 };
  return { text: `Next go: ${lowerDay(g.start)} ${g.name.toLowerCase()}, ${periodTime(g)}.`, lvl: null };
}

// Reasons at the hour's level, leaving out light.
function whyText(h, l) {
  if (!l) return '';
  return ' ' + h.a.reasons.filter(x => x.lvl === l && !LIGHT_KEYS.includes(x.key)).map(x => x.text).join('. ') + '.';
}

function cell(cls, text, sr) {
  return `<td class="${cls}" data-text="${esc(text)}"><span class="vh">${esc(sr)}</span></td>`;
}

export function render(m, want) {
  const days = weekDays(m), day = pickDay(m, want, days);
  if (!day) return { day, html: head(name, 'No forecast yet.') };

  // Columns are clock hours from the earliest first light to the latest sunset.
  let h0 = 23, h1 = 0;
  for (const d of days) { h0 = Math.min(h0, localHour(d.hs[0].t)); h1 = Math.max(h1, localHour(d.hs[d.hs.length - 1].t)); }
  const cols = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i);
  const headRow = hrs => `<thead><tr><td></td>${hrs.map(hr => `<th scope="col" aria-label="${hourName(hr)}">${hr % 3 === 0 ? hourName(hr) : ''}</th>`).join('')}</tr></thead>`;

  let goHours = 0;
  const rows = days.map(d => {
    const s = sunFor(m, d.key);
    const cells = cols.map(hr => {
      const h = d.hs.find(x => localHour(x.t) === hr);
      if (!h) return '<td class="wc none"></td>';
      const l = lvlExcept(h.a, LIGHT_KEYS), past = h.t + 3600e3 <= m.now;
      if (!l && !past) goHours++;
      const lights = h.t < s.sunrise ? ` Lights needed until sunrise at ${hm(s.sunrise)}.` : '';
      return cell(`wc b${l}${past ? ' past' : ''}`, `${dayLabel(d.t)} ${hm(h.t)}: ${WORD_PLAIN[l]}.${whyText(h, l)}${lights}`, WORD_PLAIN[l]);
    }).join('');
    const sel = d.key === day;
    return `<tr${sel ? ' class="sel"' : ''}><th scope="row"><button type="button" class="rowpick" data-day="${d.key}" aria-pressed="${sel}">${esc(rowName(d.t))}</button></th>${cells}</tr>`;
  }).join('');

  // One day, factor by factor.
  const d = days.find(x => x.key === day), s = sunFor(m, day);
  const hrs = d.hs.map(h => localHour(h.t));
  const callRow = d.hs.map(h => {
    const l = lvlExcept(h.a, LIGHT_KEYS);
    return cell(`wc b${l}`, `${hm(h.t)}: ${WORD_PLAIN[l]}.${whyText(h, l)}`, WORD_PLAIN[l]);
  }).join('');
  const lightRow = d.hs.map(h => {
    const need = h.t < s.sunrise;
    return cell(need ? 'wc lt' : 'wc fc0', `${hm(h.t)}: ${need ? `Lights needed until sunrise at ${hm(s.sunrise)}.` : 'Daylight.'}`, need ? 'Lights' : 'Daylight');
  }).join('');
  const factorRows = FACTORS.map(f => {
    const cells = d.hs.map(h => {
      const { lvl, why } = factorLevel(h.a, f.keys);
      return cell(`wc ${lvl ? `b${lvl}` : 'fc0'}`, `${hm(h.t)}, ${f.name.toLowerCase()}: ${why ? why.text : 'no concern'}.`, WORD_PLAIN[lvl]);
    }).join('');
    return `<tr><th scope="row">${f.name}</th>${cells}</tr>`;
  }).join('');

  const keys = legend([{ kind: 'b0', text: 'Go' }, { kind: 'b1', text: 'Caution' }, { kind: 'b2', text: 'Stay off' }]);
  const label = dayLabel(d.t);
  const html = `${head(name, `${summary(m).text} ${goHours} go hours ahead in the next 7 days.`)}
    <div class="panel">
      <h3 class="dhead">The week, first light to sunset</h3>
      <p class="dnote">Each square is one hour. Pick a day to see what drives its call.</p>
      <div class="chart-box">
        ${keys}
        <div class="grid-wrap"><table class="grid week">
          <caption class="vh">The call for each hour of the next 7 days</caption>
          ${headRow(cols)}<tbody>${rows}</tbody>
        </table></div>
        <p class="readout" aria-live="polite">Tap a square for that hour.</p>
      </div>
    </div>
    <div class="panel">
      <h3 class="dhead">${esc(label)}, factor by factor</h3>
      <p class="dnote">The call is the worst of these in each hour. Lights before sunrise are a note, not a caution.</p>
      <div class="chart-box">
        <div class="grid-wrap"><table class="grid factors">
          <caption class="vh">What sets the call each hour on ${esc(label)}</caption>
          ${headRow(hrs)}
          <tbody>
            <tr class="call"><th scope="row">Call</th>${callRow}</tr>
            ${factorRows}
            <tr><th scope="row">Light</th>${lightRow}</tr>
          </tbody>
        </table></div>
        <p class="readout" aria-live="polite">Tap a square for that hour.</p>
      </div>
    </div>`;
  return { day, html };
}
