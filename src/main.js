// Entry point: styles, service worker, refresh loop and event wiring.
import '@fontsource-variable/archivo/wdth.css';
import './styles/tokens.css';
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';

import { REFRESH_MS, MIN } from './config.js';
import { app, $ } from './state.js';
import { fetchAll } from './data.js';
import { loadCache, saveCache, loadPlan, savePlan } from './storage.js';
import { render } from './render/index.js';
import { fillPeriod } from './render/days.js';
import { renderDetail } from './render/detail/index.js';
import { initRoutes, setDay } from './route.js';
import { initSettings } from './settings.js';
import { initSuggest } from './suggest.js';
import { initShare } from './share.js';
import { initReports, loadInfo, loadReports } from './reports.js';
import { initInstall } from './install.js';

// The service worker caches the app shell so it opens offline. Data still
// comes from the network, with the last good copy kept in localStorage.
// An app installed to the home screen often resumes without reloading, so
// it would only find a new version after a full restart. Check again each
// time it comes back to the foreground (at most every 5 minutes). When a new
// version is found, its worker installs, skips waiting and takes over the open
// page (skipWaiting and clientsClaim in vite.config.js). The register code then
// reloads the page once, onto the new build. Settings and the saved forecast
// are in localStorage, so the reload loses nothing.
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
  const { data, errors } = await fetchAll(app.loc);
  app.errors = errors;
  Object.assign(app.data, data);
  if (!errors.wx) { app.updated = Date.now(); app.fromCache = false; }
  saveCache(app.loc.slug, app.data, app.updated);
  render();
  loadReports();
  btn.disabled = false;
  busy = false;
}

// ---------- Events ----------
$('refreshBtn').addEventListener('click', refresh);

// Charts: tapping, hovering or focusing a column or cell shows its text in
// the readout under the chart.
function showReading(e) {
  const hit = e.target.closest && e.target.closest('[data-text]');
  const box = hit && hit.closest('.chart-box');
  if (!box) return;
  box.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
  hit.classList.add('on');
  box.querySelector('.readout').textContent = hit.dataset.text;
}
for (const ev of ['click', 'pointerover', 'focusin']) document.addEventListener(ev, showReading);

// ---------- Detail views ----------
$('detail').addEventListener('click', e => {
  // Plan a row choices.
  const pick = e.target.closest('button[data-plan-min], button[data-plan-when]');
  if (pick) {
    const plan = loadPlan();
    if (pick.dataset.planMin) plan.minutes = +pick.dataset.planMin;
    if (pick.dataset.planWhen) plan.when = pick.dataset.planWhen;
    savePlan(plan);
    renderDetail();
    const sel = pick.dataset.planMin ? `[data-plan-min="${plan.minutes}"]` : `[data-plan-when="${plan.when}"]`;
    const again = $('detail').querySelector(`button${sel}`);
    if (again) again.focus({ preventScroll: true });
    return;
  }
  const b = e.target.closest('button[data-day]');
  if (!b) return;
  setDay(b.dataset.day);
  const again = $('detail').querySelector(`button[data-day="${b.dataset.day}"]`);
  if (again) again.focus({ preventScroll: true });
});

// Charts are drawn to the width of the page, so redraw when it changes.
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (app.view && Math.abs($('detail').clientWidth - app.detailWidth) > 24) renderDetail();
  }, 150);
});

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
initShare();
initReports();
initInstall();
initRoutes();
loadInfo().then(loadReports);

// ---------- Start ----------
const cached = loadCache(app.loc.slug);
if (cached) {
  app.data = cached.data;
  app.updated = cached.updated;
  app.fromCache = true;
  render();
}
refresh();
