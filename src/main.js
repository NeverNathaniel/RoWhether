// Entry point: styles, service worker, refresh loop and event wiring.
import '@fontsource-variable/archivo/wdth.css';
import './styles/tokens.css';
import './styles/app.css';
import { registerSW } from 'virtual:pwa-register';

import { REFRESH_MS, MIN, DEFAULT_SLUG } from './config.js';
import { app, $, openLocation, takeRefresh, canRefresh, fetchedOf } from './state.js';
import { fetchAll } from './data.js';
import { loadCache, saveCache, loadPlan, savePlan, loadOverrides, saveRecord, touchCache, trimCaches, loadLast, saveLast, pushRecent, dismissPickHint } from './storage.js';
import { cachedRecord, fetchRecord, newerRecord } from './locations.js';
import { render } from './render/index.js';
import { renderPlace } from './render/header.js';
import { fillPeriod } from './render/days.js';
import { renderDetail } from './render/detail/index.js';
import { initRoutes, renderTabs, showTab, showMissing, showFailed, setDay } from './route.js';
import { initSettings, refreshNudge } from './settings.js';
import { initSuggest } from './suggest.js';
import { initShare } from './share.js';
import { initReports, loadReports } from './reports.js';
import { loadInfo } from './info.js';
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
// A refresh is for the location open when it began. One for a location opened
// since is dropped, and the new one starts its own (takeRefresh, canRefresh).
async function refresh() {
  if (!canRefresh()) return;
  const token = app.refreshing = app.token, btn = $('refreshBtn');
  btn.disabled = true;
  $('updated').textContent = 'Refreshing';
  try {
    if (takeRefresh(token, await fetchAll(app.loc))) {
      saveCache(app.loc.slug, app.data, app.updated, [], app.fetched);
      trimCaches(app.loc.slug);
      render();
      loadReports();
    }
  } finally {
    if (app.refreshing === token) app.refreshing = null;
    btn.disabled = app.refreshing !== null;
  }
}

// ---------- Open a location ----------
// The picker is a lazy chunk, read on the first call (07 10.3).
const picker = opts => import('./picker.js').then(p => p.openPicker(opts));

// Answering the note that offers the picker, with Dismiss or by picking Putney, means
// Putney is the answer: "/" opens it from now on, also after the first-visit window.
function answerNote() {
  dismissPickHint();
  saveLast(DEFAULT_SLUG);
  $('pickNote').hidden = true;
  refreshNudge();
}

// Draws a location from its record: its saved forecast at once, whatever its
// age, then a refresh. `note` shows the note that offers the picker, which hides
// the Settings reminder: one note at a time (07 4.6).
function enter(record, keepAddress, note) {
  const slug = record.slug;
  openLocation(record, loadOverrides(slug));
  renderPlace(app.loc);
  touchCache(slug);
  // "/" shown to a first visit is Putney, but not the visitor's choice yet.
  if (!keepAddress) saveLast(slug);
  pushRecent(slug);
  renderTabs();
  refreshNudge();
  $('pickNote').hidden = !note;
  if (note) $('setNudge').hidden = true;
  showTab();
  const cached = loadCache(slug);
  if (cached) {
    Object.assign(app, { data: cached.data, updated: cached.updated, fetched: fetchedOf(cached), fromCache: true });
    render();
  }
  refresh();
}

// No location open, for a page that has none: the header says only RoWhether.
const none = () => { openLocation(null); renderPlace(null); };

// The open counter (07 14.3) counts the start once its address is answered, so it can name the
// location shown. `first` is read now, before anything writes the last location: no location
// saved here, and no old install to move across, is a first start.
const first = !loadLast();
let counted = false;
const count = () => {
  if (counted) return;
  counted = true;
  loadInfo(app.loc?.slug ?? 'none', first).then(loadReports);
};

let asked = 0; // counts the addresses asked for: an answer for an older one is dropped
// Opens the location at `slug`, or none when it is null, and counts the start when the
// newest address is answered. The record comes from this browser, else from the file the
// build wrote.
async function open(slug, keepAddress, note) {
  const mine = asked + 1;
  try { await openAt(slug, keepAddress, note); } finally { if (mine === asked) count(); }
}
async function openAt(slug, keepAddress, note) {
  const mine = ++asked;
  if (!slug) { none(); return; }
  if (app.loc?.slug === slug) {
    if (!keepAddress && !$('pickNote').hidden) answerNote(); // picked Putney by its own address
    showTab();
    return;
  }
  const stored = cachedRecord(slug);
  let record = stored?.record;
  if (!record) {
    const got = await fetchRecord(slug);
    if (mine !== asked) return;
    if (!got.record) {
      none();
      if (got.missing) showMissing(slug); else showFailed();
      return;
    }
    record = got.record;
    saveRecord(slug, record);
  }
  enter(record, keepAddress, note);
  // After the first draw: a record that changed since it was saved replaces it.
  if (stored) newerRecord(stored).then(next => { if (next && app.loc?.slug === slug) enter(next, true, !$('pickNote').hidden); });
}

// ---------- Events ----------
$('refreshBtn').addEventListener('click', refresh);
for (const id of ['locBtn', 'pickNoteBtn']) $(id).addEventListener('click', () => picker({ mode: 'sheet' }));
$('pickNoteLater').addEventListener('click', answerNote);

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
initRoutes(open, picker);
