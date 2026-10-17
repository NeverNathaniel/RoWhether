// Settings dialog: fill from current settings, validate and save on close.
// Until Settings has been saved once, or the note dismissed, a note above
// the hero points to it.
import { DEFAULTS } from './config.js';
import { app, $ } from './state.js';
import { saveSettings, hasSavedSettings, nudgeDismissed, dismissNudge } from './storage.js';

const OPTIONAL = ['rainCaution', 'rainOff', 'aqiCaution', 'aqiOff'];

export function initSettings(onSave) {
  const dlg = $('settings'), form = $('setForm');
  const fill = src => {
    for (const k of Object.keys(DEFAULTS)) { if (form.elements[k]) form.elements[k].value = src[k] ?? ''; }
  };
  const open = () => { fill(app.settings); dlg.showModal(); };
  $('settingsBtn').addEventListener('click', open);
  $('setNudgeBtn').addEventListener('click', open);
  $('setNudge').hidden = hasSavedSettings() || nudgeDismissed();
  $('setNudgeLater').addEventListener('click', () => { dismissNudge(); $('setNudge').hidden = true; });
  $('resetSet').addEventListener('click', () => fill(DEFAULTS));
  dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'save') return;
    const next = { ...app.settings };
    for (const k of Object.keys(DEFAULTS)) {
      const raw = form.elements[k].value.trim();
      if (k === 'waterOverride') { next[k] = raw; continue; }
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
    app.settings = next;
    saveSettings(next);
    $('setNudge').hidden = true;
    onSave();
  });
}
