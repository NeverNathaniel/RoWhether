// Settings dialog: fill from current settings, validate and save on close.
import { DEFAULTS } from './config.js';
import { app, $ } from './state.js';
import { saveSettings } from './storage.js';

const OPTIONAL = ['rainCaution', 'rainOff'];

export function initSettings(onSave) {
  const dlg = $('settings'), form = $('setForm');
  const fill = src => {
    for (const k of Object.keys(DEFAULTS)) { if (form.elements[k]) form.elements[k].value = src[k] ?? ''; }
  };
  $('settingsBtn').addEventListener('click', () => { fill(app.settings); dlg.showModal(); });
  $('resetSet').addEventListener('click', () => fill(DEFAULTS));
  dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'save') return;
    const next = { ...app.settings };
    for (const k of Object.keys(DEFAULTS)) {
      const raw = form.elements[k].value.trim();
      if (k === 'waterOverride') { next[k] = raw; continue; }
      // Rain chance levels can be left blank to turn them off.
      if (OPTIONAL.includes(k) && raw === '') { next[k] = ''; continue; }
      const v = parseFloat(raw);
      if (!isNaN(v)) next[k] = v;
    }
    next.heading = ((Math.round(next.heading) % 360) + 360) % 360;
    if (next.windOff < next.windCaution) next.windOff = next.windCaution;
    if (next.gustOff < next.gustCaution) next.gustOff = next.gustCaution;
    if (next.flowOff < next.flowCaution) next.flowOff = next.flowCaution;
    for (const k of OPTIONAL) if (next[k] !== '') next[k] = Math.min(100, Math.max(0, Math.round(next[k])));
    if (next.rainOff !== '' && next.rainCaution !== '' && next.rainOff < next.rainCaution) next.rainOff = next.rainCaution;
    app.settings = next;
    saveSettings(next);
    onSave();
  });
}
