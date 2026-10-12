// Header timestamp, the hero verdict, and NWS alerts.
import { SRC, SOURCE_NAMES, THEN, WORD } from '../config.js';
import { app, $ } from '../state.js';
import { esc, hm, r0, card, whenText } from '../format.js';
import { nextDawn, waterTemp } from '../logic.js';

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

export function renderHero() {
  const m = app.model, cur = m.cur, a = cur.a;
  $('hero').dataset.lvl = a.lvl;
  $('verdict').textContent = WORD[a.lvl];

  let lead = '';
  if (a.lvl > 0) {
    const top = a.reasons.filter(x => x.lvl === a.lvl).map(x => {
      if (x.key === 'dark') { const nd = nextDawn(m); return nd ? `Dark until first light, ${whenText(nd, true)}` : 'Dark'; }
      return x.text;
    });
    lead = top.join('. ') + '.';
  }
  $('why').innerHTML = lead
    ? `${esc(lead)}<span class="cond">${esc(condSentence(m, cur))}</span>`
    : esc(condSentence(m, cur));

  let holds = '';
  const up = m.h72.filter(h => h.t > cur.t);
  if (a.lvl === 0) {
    const nx = up.find(h => h.a.lvl !== 0);
    if (!nx) holds = 'Holds for the next 3 days.';
    else {
      const why = nx.a.reasons.find(x => x.lvl === nx.a.lvl);
      holds = `Holds until about ${whenText(nx.t, true)}, then ${THEN[why.key] || why.text.toLowerCase()}.`;
    }
  } else {
    const w = m.windows.find(x => x.lvl === 0 && x.start > Date.now());
    holds = w ? `Next go window: ${whenText(w.start, true)} to ${hm(w.end)}.` : 'No go window in the next 3 days.';
  }
  $('holds').textContent = holds;

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
