// Settings dialog: fill from current settings, validate and save on close.
// Until Settings has been saved once, or the note dismissed, a note above
// the hero points to it.
import { app, $, applyOverrides } from './state.js';
import { overridesOf } from './location.js';
import { saveOverrides, hasSavedSettings, nudgeDismissed, dismissNudge } from './storage.js';

const OPTIONAL = ['rainCaution', 'rainOff', 'aqiCaution', 'aqiOff'];
// The dialog's fields: the limits, and the course heading.
const FIELDS = Object.keys(app.defaults);

export function initSettings(onSave) {
  const dlg = $('settings'), form = $('setForm');
  // The heading lives in the location's course, not in the limits.
  const current = () => ({ ...app.settings, heading: app.loc.course.heading });
  const fill = src => {
    for (const k of FIELDS) { if (form.elements[k]) form.elements[k].value = src[k] ?? ''; }
  };
  const open = () => { fill(current()); dlg.showModal(); };
  $('settingsBtn').addEventListener('click', open);
  $('setNudgeBtn').addEventListener('click', open);
  $('setNudge').hidden = hasSavedSettings(app.loc.slug) || nudgeDismissed();
  $('setNudgeLater').addEventListener('click', () => { dismissNudge(); $('setNudge').hidden = true; });
  $('resetSet').addEventListener('click', () => fill(app.defaults));
  dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'save') return;
    const next = current();
    for (const k of FIELDS) {
      const raw = form.elements[k].value.trim();
      // The dock reading is a number, or blank to use the gauge.
      if (k === 'waterOverride') { const v = parseFloat(raw); next[k] = Number.isFinite(v) ? v : ''; continue; }
      // Rain chance and air quality levels can be left blank to turn them off.
      if (OPTIONAL.includes(k) && raw === '') { next[k] = ''; continue; }
      const v = parseFloat(raw);
      if (!isNaN(v)) next[k] = v;
    }
    next.heading = ((Math.round(next.heading) % 360) + 360) % 360;
    if (next.windOff < next.windCaution) next.windOff = next.windCaution;
    if (next.gustOff < next.gustCaution) next.gustOff = next.gustCaution;
    if (next.flowOff < next.flowCaution) next.flowOff = next.flowCaution;
    const top = { rainCaution: 100, rainOff: 100, aqiCaution: 500, aqiOff: 500 };
    for (const k of OPTIONAL) if (next[k] !== '') next[k] = Math.min(top[k], Math.max(0, Math.round(next[k])));
    if (next.rainOff !== '' && next.rainCaution !== '' && next.rainOff < next.rainCaution) next.rainOff = next.rainCaution;
    if (next.aqiOff !== '' && next.aqiCaution !== '' && next.aqiOff < next.aqiCaution) next.aqiOff = next.aqiCaution;
    // Only what differs from the location's defaults is kept.
    const values = overridesOf(next, app.defaults);
    saveOverrides(app.loc.slug, values);
    applyOverrides(values);
    $('setNudge').hidden = true;
    onSave();
  });
}
