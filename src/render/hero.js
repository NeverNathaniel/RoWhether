// Header timestamp, the hero verdict, and NWS alerts.
import { SRC, SOURCE_NAMES, THEN, WORD, LIGHT_KEYS } from '../config.js';
import { app, $ } from '../state.js';
import { esc, hm, r0, card, whenText, dayKey, lowerFirst } from '../format.js';
import { waterTemp, sunFor, lvlExcept } from '../logic.js';
import { dayLabel, periodTime, periodNote } from './days.js';

export function renderHeader() {
  const u = $('updated');
  if (!app.updated) { u.textContent = app.errors.wx ? 'Not loaded' : 'Loading'; return; }
  const label = app.errors.wx || app.fromCache ? 'Saved data from' : 'Updated';
  u.textContent = `${label} ${hm(app.updated)}`;
}

export function renderNoData() {
  $('hero').dataset.lvl = '';
  $('verdict').textContent = 'No data.';
  const allBlocked = Object.keys(SRC).every(k => app.errors[k]);
  $('why').textContent = allBlocked
    ? 'Every data source was blocked. In-app file previews block outside connections. Open this page in Safari or Chrome, or from a hosted URL.'
    : 'The forecast did not load. Check the connection, then tap Refresh.';
  $('holds').textContent = '';
}

function condSentence(m, h) {
  const parts = [];
  if (h.wind != null) parts.push(`Wind ${r0(h.wind)} mph from ${card(h.dir)}, gusts ${r0(h.gust)}.`);
  const wt = waterTemp(m);
  if (h.temp != null) parts.push(`${r0(h.temp)}°F air${wt != null ? `, ${r0(wt)}°F water` : ''}.`);
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
  $('why').innerHTML = `${esc(when + lead)}<span class="cond">${esc(periodNote(m, p))}</span>`;
  const w = m.windows.find(x => x.lvl === 0 && x.start >= p.start);
  $('holds').textContent = p.lvl && w ? `Next go window: ${whenText(w.start, true)} to ${hm(w.end)}.` : '';
}

export function renderHero() {
  const m = app.model, cur = m.cur, a = cur.a;
  renderStatus();
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
    const w = m.windows.find(x => x.lvl === 0 && x.start > Date.now());
    holds = w ? `Next go window: ${whenText(w.start, true)} to ${hm(w.end)}.` : 'No go window in the next 3 days.';
  }
  $('holds').textContent = holds;
}

function renderStatus() {
  const failed = Object.keys(app.errors).filter(k => app.errors[k]);
  const note = $('statusNote');
  if (failed.length) {
    note.hidden = false;
    note.textContent = `Could not reach ${failed.map(k => SOURCE_NAMES[k]).join(', ')}. Showing the last data received where available.`;
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
