// The instance label and dock reports. GET /api/info says whether this is
// production or a Preview such as dev, and whether dock reports are on. Dock
// reports are what someone saw at the dock, shown to everyone for 3 hours.
// On a static host there is no /api, so both quietly stay off.
import { WATER, REPORTS_SLUG } from './config.js';
import { app, $ } from './state.js';
import { esc, ago, hm } from './format.js';

const WATER_NAME = { flat: WATER.names[0], light: WATER.names[1], chop: WATER.names[2], rough: WATER.names[3] };
const WATER_LVL = { flat: 0, light: 1, chop: 2, rough: 3 };
const FOG_NAME = { clear: 'no fog', patchy: 'patchy fog', thick: 'thick fog' };

async function getJSON(url, opts) {
  const r = await fetch(url, { cache: 'no-store', ...opts });
  if (!r.ok && r.status !== 400 && r.status !== 429) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function loadInfo() {
  try { app.info = await getJSON('/api/info'); } catch (e) { app.info = null; }
  const badge = $('envBadge');
  const env = app.info && app.info.env;
  badge.hidden = !env || env === 'production';
  badge.textContent = env ? env[0].toUpperCase() + env.slice(1) : '';
}

// Reports belong to Putney until the table has a location (08, phase 3).
const reportsHere = () => app.info?.reports && app.loc?.slug === REPORTS_SLUG;

export async function loadReports() {
  if (!reportsHere()) return;
  try {
    const d = await getJSON('/api/reports');
    app.reports = d.enabled ? d : null;
  } catch (e) { /* keep the last list */ }
  renderReports();
}

// "Flat water, patchy fog, debris in the water"
export function reportText(r) {
  const parts = [];
  if (r.water) parts.push(WATER_NAME[r.water]);
  if (r.fog) parts.push(FOG_NAME[r.fog]);
  if (r.debris) parts.push('floating debris');
  const s = parts.join(', ');
  return s ? s[0].toUpperCase() + s.slice(1) : 'Report';
}

export function renderReports() {
  const box = $('dockReports');
  const on = reportsHere();
  box.hidden = !on;
  if (!on) return;
  const list = (app.reports && app.reports.reports) || [];
  let sum;
  if (!list.length) sum = `<p class="dock-sum">No reports from the dock in the last ${app.reports ? app.reports.hours : 3} hours.</p>`;
  else {
    const r = list[0];
    // Compare a water report with the forecast for that hour, to help tune
    // the water state thresholds.
    const h = app.model && app.model.hours.filter(x => x.t <= r.t).pop();
    const fc = r.water && h && h.water && h.water.lvl !== WATER_LVL[r.water] ? ` The forecast said ${WATER.names[h.water.lvl].toLowerCase()}.` : '';
    const more = list.length > 1 ? ` ${list.length} reports in the last ${app.reports.hours} hours.` : '';
    sum = `<p class="dock-sum">At the dock: <strong>${esc(reportText(r))}</strong>, ${esc(ago(r.t).toLowerCase())} (${esc(hm(r.t))}).${esc(fc + more)}</p>`;
  }
  box.innerHTML = `<div class="dock">${sum}<button type="button" id="reportBtn">Report conditions</button></div>`;
}

export function initReports() {
  const dlg = $('report'), form = $('repForm');
  const status = t => { $('repStatus').textContent = t; };
  $('dockReports').addEventListener('click', e => {
    if (!e.target.closest('#reportBtn')) return;
    form.reset();
    status('');
    dlg.showModal();
  });
  $('repCancel').addEventListener('click', () => dlg.close());
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = form.elements;
    const body = { water: f.water.value || null, fog: f.fog.value || null, debris: f.debris.checked };
    if (!body.water && !body.fog && !body.debris) { status('Pick at least one thing you saw.'); return; }
    $('repSend').disabled = true;
    status('Sending.');
    try {
      const d = await getJSON('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!d.ok) { status(d.message || 'That did not send. Try again.'); return; }
      dlg.close();
      await loadReports();
    } catch (err) {
      status('That did not send. Check the connection and try again.');
    } finally {
      $('repSend').disabled = false;
    }
  });
}
