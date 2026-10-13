// Week: the best go windows ahead, then each day as one bar from first light
// to sunset with what stands in the way in words. A day opens to a bar for
// each factor that matters that day.
import { HOUR, FACTORS, LIGHT_KEYS, WORD_PLAIN } from '../../config.js';
import { esc, hm, localHour, dayKey, weekday, lowerFirst } from '../../format.js';
import { lvlExcept, sunFor, callRuns, factorRuns } from '../../logic.js';
import { dayLabel, periodTime } from '../days.js';
import { CHEV } from '../parts.js';
import { weekDays, legend, head } from './common.js';

export const key = 'week';
export const name = 'Week';

// The tab that explains each factor.
const TAB = { wind: 'wind', rain: 'rain', storm: 'rain', fog: 'fog', cold: 'temperature', flow: 'river' };

const lowerDay = t => dayLabel(t).replace(/^(Today|Tomorrow)$/, s => s.toLowerCase());
const shortDay = t => (dayKey(t) === dayKey(Date.now()) ? 'Today' : weekday(t));
// Minutes after local midnight, to line the days up on one clock. Eastern
// time is a whole number of hours from UTC, so the minutes match.
const clockMin = t => localHour(t) * 60 + new Date(t).getUTCMinutes();
const cap = s => s[0].toUpperCase() + s.slice(1);

export function summary(m) {
  if (m.daytime && lvlExcept(m.cur.a, LIGHT_KEYS) === 0) return { text: 'Go now.', lvl: 0 };
  const g = m.days.flatMap(d => d.periods).find(p => !p.past && p.lvl === 0);
  if (!g) return { text: 'No go period in the next 7 days.', lvl: 2 };
  return { text: `Next go: ${lowerDay(g.start)} ${g.name.toLowerCase()}, ${periodTime(g)}.`, lvl: null };
}

// "Until 10 AM", "1 to 5 PM", "From 3 PM", "All day"
// started: the day is under way, so its window begins now.
function when(r, w0, w1, started) {
  const a = r.start <= w0, b = r.end >= w1;
  if (a && b) return started ? 'Until sunset' : 'All day';
  if (a) return `Until ${hm(r.end)}`;
  if (b) return `From ${hm(r.start)}`;
  return `${hm(r.start)} to ${hm(r.end)}`;
}

const hoursText = ms => { const n = Math.max(1, Math.round(ms / HOUR)); return `about ${n} hour${n === 1 ? '' : 's'}`; };

function names(list) {
  const ns = list.map(f => f.name.toLowerCase());
  return ns.length > 1 ? `${ns.slice(0, -1).join(', ')} or ${ns[ns.length - 1]}` : ns[0];
}

export function render(m, want) {
  const days = weekDays(m).map(d => ({ ...d, s: sunFor(m, d.key), runs: callRuns(m, d.key) })).filter(d => d.runs.length);
  if (!days.length) return { day: null, html: head(name, 'No forecast yet.') };

  // One clock axis for every day, on whole hours.
  const a0 = Math.floor(Math.min(...days.map(d => clockMin(d.s.dawn))) / 60) * 60;
  const a1 = Math.ceil(Math.max(...days.map(d => clockMin(d.s.sunset))) / 60) * 60;
  const pos = t => Math.max(0, Math.min(100, (clockMin(t) - a0) / (a1 - a0) * 100));
  const seg = (t0, t1, cls) => `<i class="${cls}" style="left:${pos(t0).toFixed(2)}%;width:${(pos(t1) - pos(t0)).toFixed(2)}%"></i>`;
  const ticks = [];
  for (let mm = Math.ceil(a0 / 180) * 180; mm <= a1; mm += 180) {
    const hr = mm / 60;
    ticks.push(`<span style="left:${((mm - a0) / (a1 - a0) * 100).toFixed(2)}%">${hr === 12 ? '12p' : hr < 12 ? `${hr}a` : `${hr - 12}p`}</span>`);
  }

  // Best windows: the three longest go stretches of an hour or more, in time order.
  const wins = days.flatMap(d => d.runs.filter(r => r.lvl === 0 && r.end - r.start >= HOUR).map(r => ({ ...r, s: d.s })));
  const best = wins.slice().sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, 3).sort((a, b) => a.start - b.start);
  const bestHtml = best.length
    ? `<ul class="windows">${best.map(r => {
      const lights = r.start < r.s.sunrise ? ` Lights until ${hm(r.s.sunrise)}.` : '';
      return `<li><i aria-hidden="true"></i><span><strong>${esc(dayLabel(r.start))}</strong> ${r.start <= m.now ? 'now' : hm(r.start)} to ${hm(r.end)}<span class="wdur">, ${hoursText(r.end - r.start)}.${lights}</span></span></li>`;
    }).join('')}</ul>`
    : '<p class="dnote">No go stretch of an hour or more in the next 7 days.</p>';

  const rows = days.map(d => {
    const s = d.s, w0 = Math.max(s.dawn, m.now), w1 = s.sunset, started = m.now > s.dawn;
    // The bar shows the whole day, with the part already over faded.
    const all = callRuns(m, d.key, { past: true });
    const bar = all.map(r => seg(r.start, r.end, `seg b${r.lvl}`)).join('') + (started ? seg(s.dawn, Math.min(m.now, w1), 'veil') : '');

    const fr = FACTORS.map(f => ({ f, runs: factorRuns(m, d.key, f.keys) }));
    const items = fr.flatMap(({ f, runs }) => runs.map(r => ({ f, r }))).sort((x, y) => x.r.start - y.r.start);
    const line = items.length
      ? items.map(({ r }) => `<span class="wi"><i data-lvl="${r.lvl}" aria-hidden="true"></i><span class="vh">${WORD_PLAIN[r.lvl]}.</span>${esc(`${when(r, w0, w1, started)}: ${r.why.map(x => lowerFirst(x.text)).join(', ')}.`)}</span>`).join('')
      : `<span class="wi"><i data-lvl="0" aria-hidden="true"></i>${started ? 'Go until sunset.' : 'Go all day.'}</span>`;

    const hit = fr.filter(x => x.runs.length), clear = fr.filter(x => !x.runs.length).map(x => x.f);
    const frows = hit.map(({ f, runs }) => {
      const label = TAB[f.key] ? `<a class="flink" href="#${TAB[f.key]}/${d.key}">${f.name}${CHEV}</a>` : esc(f.name);
      return `<div class="frow"><span class="fname">${label}</span><span class="wbar" aria-hidden="true">${seg(w0, w1, 'track')}${runs.map(r => seg(r.start, r.end, `seg b${r.lvl}`)).join('')}</span></div>`;
    }).join('');
    const notes = [
      clear.length ? `No concerns from ${names(clear)}.` : '',
      w0 < s.sunrise ? `Lights needed until sunrise at ${hm(s.sunrise)}.` : ''
    ].filter(Boolean).map(t => `<p class="wnote">${esc(t)}</p>`).join('');

    return `<li><details class="wday" data-keep="day-${d.key}"${d.key === want ? ' open' : ''}>
      <summary>
        <span class="wname">${esc(shortDay(d.t))}<svg class="chev wchev" viewBox="0 0 8 12" aria-hidden="true"><path d="M2 2l4 4-4 4"/></svg></span>
        <span class="wbar" aria-hidden="true">${bar}</span>
        <span class="wline">${line}</span>
      </summary>
      <div class="wmore">${frows}${notes}</div>
    </details></li>`;
  }).join('');

  const keys = legend([{ kind: 'b0', text: 'Go' }, { kind: 'b1', text: 'Caution' }, { kind: 'b2', text: 'Stay off' }]);
  const html = `${head(name, summary(m).text)}
    <div class="panel">
      <h3>Best windows</h3>
      ${bestHtml}
    </div>
    <div class="panel">
      <h3>Each day, first light to sunset</h3>
      <p class="dnote">What stands in the way, and when. Tap a day for each factor.</p>
      ${keys}
      <div class="wticks" aria-hidden="true"><span></span><span class="wbar">${ticks.join('')}</span></div>
      <ol class="weeklist">${rows}</ol>
    </div>`;
  return { day: null, html };
}
