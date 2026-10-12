// Entry point: styles, service worker, refresh loop and event wiring.
import '@fontsource-variable/archivo/wdth.css';
import './styles/tokens.css';
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';

import { REFRESH_MS, MIN } from './config.js';
import { app, $ } from './state.js';
import { fetchAll } from './data.js';
import { loadCache, saveCache } from './storage.js';
import { render } from './render/index.js';
import { renderWindows } from './render/windows.js';
import { initSettings } from './settings.js';

// The service worker caches the app shell so it opens offline. Data still
// comes from the network, with the last good copy kept in localStorage.
registerSW({ immediate: true });

// ---------- Refresh ----------
let busy = false;
async function refresh() {
  if (busy) return;
  busy = true;
  const btn = $('refreshBtn');
  btn.disabled = true;
  $('updated').textContent = 'Refreshing';
  const { data, errors } = await fetchAll();
  app.errors = errors;
  Object.assign(app.data, data);
  if (!errors.wx) { app.updated = Date.now(); app.fromCache = false; }
  saveCache(app.data, app.updated);
  render();
  btn.disabled = false;
  busy = false;
}

// ---------- Events ----------
$('refreshBtn').addEventListener('click', refresh);

$('windows').addEventListener('click', e => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wins = app.model ? app.model.windows : [];
  if (e.target.closest('[data-close]')) {
    const k = wins.findIndex(w => w.key === app.winSel);
    app.winSel = null;
    renderWindows();
    const b = document.querySelector(`button.win[data-k="${k}"]`);
    if (b) b.focus();
    return;
  }
  const btn = e.target.closest('button.win');
  if (!btn) return;
  const k = parseInt(btn.dataset.k, 10), w = wins[k];
  if (!w) return;
  app.winSel = app.winSel === w.key ? null : w.key;
  renderWindows();
  const nb = document.querySelector(`button.win[data-k="${k}"]`);
  if (nb) nb.focus();
  if (app.winSel != null) {
    const panel = $('winPanel');
    if (panel) panel.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }
});

// Remember which day-by-day rows are open across refreshes.
// The toggle event does not bubble, so listen in the capture phase.
$('days').addEventListener('toggle', e => {
  const d = e.target.closest('details.period');
  if (!d) return;
  if (d.open) app.openPeriods.add(d.dataset.id); else app.openPeriods.delete(d.dataset.id);
}, true);

let rz;
window.addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => {
    if (app.model && app.winSel != null) renderWindows();
  }, 150);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (!app.updated || Date.now() - app.updated > 5 * MIN)) refresh();
});
setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, REFRESH_MS);

initSettings(render);

// ---------- Start ----------
const cached = loadCache();
if (cached) {
  app.data = cached.data;
  app.updated = cached.updated;
  app.fromCache = true;
  render();
}
refresh();
