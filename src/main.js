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
import { fillPeriod } from './render/days.js';
import { initSettings } from './settings.js';
import { initSuggest } from './suggest.js';

// The service worker caches the app shell so it opens offline. Data still
// comes from the network, with the last good copy kept in localStorage.
// An app installed to the home screen often resumes without reloading, so
// it would only find a new version after a full restart. Check again each
// time it comes back to the foreground (at most every 5 minutes). When a new
// version is found, autoUpdate installs it and reloads the page.
const UPDATE_CHECK_MS = 5 * 60 * 1000;
registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (!registration) return;
    let lastCheck = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastCheck < UPDATE_CHECK_MS) return;
      lastCheck = Date.now();
      registration.update().catch(() => { /* offline; try next time */ });
    });
  }
});

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

// Precipitation chart: tapping, hovering or focusing a column shows that hour.
function showPrecipHour(e) {
  const hit = e.target.closest && e.target.closest('.phit');
  if (!hit) return;
  const box = hit.closest('.precip');
  box.querySelectorAll('.phit.on').forEach(x => x.classList.remove('on'));
  hit.classList.add('on');
  box.querySelector('.precip-hover').textContent = hit.dataset.ptext;
}
for (const ev of ['click', 'pointerover', 'focusin']) {
  $('days').addEventListener(ev, showPrecipHour);
  $('nowPrecip').addEventListener(ev, showPrecipHour);
}

// Remember which day-by-day rows are open across refreshes.
// The toggle event does not bubble, so listen in the capture phase.
$('days').addEventListener('toggle', e => {
  const d = e.target.closest('details.period');
  if (!d) return;
  if (d.open) { app.openPeriods.add(d.dataset.id); fillPeriod(d); }
  else app.openPeriods.delete(d.dataset.id);
}, true);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (!app.updated || Date.now() - app.updated > 5 * MIN)) refresh();
});
setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, REFRESH_MS);

initSettings(render);
initSuggest();

// ---------- Start ----------
const cached = loadCache();
if (cached) {
  app.data = cached.data;
  app.updated = cached.updated;
  app.fromCache = true;
  render();
}
refresh();
