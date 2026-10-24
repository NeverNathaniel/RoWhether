// Header timestamp, the hero verdict, and NWS alerts.
import { THEN, WORD, LIGHT_KEYS, WATER } from '../config.js';
import { app, $ } from '../state.js';
import { esc, hm, r0, card, whenText, dayKey, lowerFirst } from '../format.js';
import { waterTemp, sunFor, lvlExcept, notChecked, notCheckedText } from '../logic.js';
import { bindingsFor, labelFor } from '../sources/index.js';
import { dayLabel, periodTime, periodSummary } from './days.js';

// The header's time moved to header.js; the capture still imports it from here.
export { renderHeader } from './header.js';

// The quiet line under the hero for what is not checked, hidden when it is empty.
function setNotChecked(text) {
  $('notChecked').textContent = text;
  $('notChecked').hidden = !text;
}

// `old` is a saved forecast that is past its limit after a failed refresh: the page has
// loaded one before, so it is not blocked, and the line says the forecast did not load.
export function renderNoData(old = false) {
  $('shareBtn').hidden = true;
  $('hero').dataset.lvl = '';
  $('verdict').textContent = 'No data.';
  setNotChecked('');
  const allBlocked = bindingsFor(app.loc).every(b => app.errors[b.slot]);
  // Offline with no saved forecast: say so, since the blocked-sources text would blame the page (07 9.4).
  $('why').textContent = navigator.onLine === false && !app.updated
    ? 'No forecast saved for this location on this phone yet. Connect to load it.'
    : allBlocked && !old
      ? 'Every data source was blocked. In-app file previews block outside connections. Open this page in Safari or Chrome, or from a hosted URL.'
      : 'The forecast did not load. Check the connection, then tap Refresh.';
  $('holds').textContent = '';
}

function condSentence(m, h) {
  const parts = [];
  if (h.wind != null) parts.push(`Wind ${m.u.speed(h.wind)} from ${card(h.dir)}, gusts ${r0(h.gust)}.`);
  if (h.water) parts.push(`${WATER.names[h.water.lvl]}.`);
  const wt = waterTemp(m);
  if (h.temp != null) parts.push(`${m.u.temp(h.temp)} air${wt != null ? `, ${m.u.temp(wt)} water` : ''}.`);
  return parts.join(' ');
}

// Overnight the hero shows the next part of the day instead of the dark.
function renderNextPeriod(m) {
  const p = m.next;
  if (!p) {
    $('hero').dataset.lvl = '';
    $('verdict').textContent = '\u00A0';
    $('why').textContent = 'No forecast for the next morning yet.';
    $('holds').textContent = '';
    return;
  }
  $('hero').dataset.lvl = p.lvl;
  $('verdict').textContent = WORD[p.lvl];
  const when = `${dayLabel(p.start)} ${p.name.toLowerCase()}, ${periodTime(p)}.`;
  const lead = p.lvl && p.why ? ` ${p.why.text}.` : '';
  const water = p.water ? ` ${WATER.names[p.water.max]}.` : '';
  $('why').innerHTML = `${esc(when + lead)}<span class="cond">${esc(periodSummary(p, m.u) + water)}</span>`;
  $('holds').textContent = p.lvl ? nextGoText(m, p.start) : '';
}

// "Next go: tomorrow midday, 10 AM to 3 PM."
function nextGoText(m, after) {
  const g = m.days.flatMap(d => d.periods).find(p => !p.past && p.lvl === 0 && p.start > after);
  if (!g) return 'No go period in the next 7 days.';
  return `Next go: ${dayLabel(g.start).replace(/^(Today|Tomorrow)$/, s => s.toLowerCase())} ${g.name.toLowerCase()}, ${periodTime(g)}.`;
}

export function renderHero() {
  const m = app.model, cur = m.cur, a = cur.a;
  $('shareBtn').hidden = false;
  renderStatus();
  setNotChecked(notCheckedText(notChecked(m), m.now));
  if (!m.daytime) { renderNextPeriod(m); return; }
  $('hero').dataset.lvl = a.lvl;
  $('verdict').textContent = WORD[a.lvl];

  let lead = '';
  if (a.lvl > 0) lead = a.reasons.filter(x => x.lvl === a.lvl).map(x => x.text).join('. ') + '.';
  $('why').innerHTML = lead
    ? `${esc(lead)}<span class="cond">${esc(condSentence(m, cur))}</span>`
    : esc(condSentence(m, cur));

  // The rowing day ends at sunset, so "holds" only looks that far.
  let holds = '';
  const sunset = sunFor(m, dayKey(m.now)).sunset;
  const up = m.h72.filter(h => h.t > cur.t && h.t < sunset);
  if (a.lvl === 0) {
    const nx = up.find(h => lvlExcept(h.a, LIGHT_KEYS) !== 0);
    if (!nx) holds = `Holds until sunset at ${hm(sunset)}.`;
    else {
      const why = nx.a.reasons.find(x => x.lvl === lvlExcept(nx.a, LIGHT_KEYS) && !LIGHT_KEYS.includes(x.key));
      holds = `Holds until about ${whenText(nx.t, true)}, then ${THEN[why.key] || lowerFirst(why.text)}.`;
    }
  } else {
    holds = nextGoText(m, m.now);
  }
  $('holds').textContent = holds;
}

function renderStatus() {
  const failed = Object.keys(app.errors).filter(k => app.errors[k]);
  const note = $('statusNote');
  if (failed.length) {
    const bs = bindingsFor(app.loc);
    note.hidden = false;
    note.textContent = `Could not reach ${failed.map(k => labelFor(k, bs.find(b => b.slot === k))).join(', ')}. Showing the last data received where available.`;
  } else note.hidden = true;
}

export function renderAlerts() {
  $('alerts').innerHTML = app.model.alerts.map(a => `
    <div class="alert" data-lvl="${a.lvl}" role="alert">
      <strong>${esc(a.event)}</strong>
      ${a.headline ? `<p>${esc(a.headline)}</p>` : ''}
      ${a.desc ? `<details><summary>Details</summary><pre>${esc(a.desc)}${a.instr ? '\n\n' + esc(a.instr) : ''}</pre></details>` : ''}
    </div>`).join('');
}
