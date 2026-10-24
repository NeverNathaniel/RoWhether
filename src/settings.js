// Settings dialog: built from the open location, filled on open, validated and
// saved on close. Until Settings has been saved once, or the note dismissed, a
// note above the hero points to it.
import { app, $, applyOverrides } from './state.js';
import { overridesOf, flowRow, flowBasis, ignoredFlowNote } from './location.js';
import { GLOBAL_DEFAULTS } from './config.js';
import { unitFormat } from './units.js';
import { esc } from './format.js';
import { saveOverrides, hasSavedSettings, nudgeDismissed, dismissNudge } from './storage.js';

const FLOW = ['flowCaution', 'flowOff'];
// A level left blank is off.
const OPTIONAL = ['rainCaution', 'rainOff', 'aqiCaution', 'aqiOff', ...FLOW];
// The dialog's fields: the course heading, and the 12 limits.
const FIELDS = ['heading', ...Object.keys(GLOBAL_DEFAULTS), ...FLOW];
// Limits with a caution and a stay off level. Stay off is never under caution.
const PAIRS = [['windCaution', 'windOff'], ['gustCaution', 'gustOff'], ['rainCaution', 'rainOff'], ['aqiCaution', 'aqiOff'], FLOW];
const TOP = { rainCaution: 100, rainOff: 100, aqiCaution: 500, aqiOff: 500 };

// Shows the reminder when the open location's Settings were never saved here, and
// words it for the limits this location has. Called each time a location opens.
export function refreshNudge() {
  const words = ['wind', 'gusts', 'rain', 'cold water', ...(flowRow(app.loc.sources) ? ['river flow'] : [])];
  $('setNudgeText').textContent = `Set your own limits in Settings. Until you do, Go, Caution and Stay off use starting values for ${words.slice(0, -1).join(', ')} and ${words.at(-1)}.`;
  $('setNudge').hidden = hasSavedSettings(app.loc.slug) || nudgeDismissed();
}

// The flow fieldset, written each time the dialog opens: only a location with a flow
// binding has one, and its words come from the binding and the record.
function flowFields() {
  const loc = app.loc, row = flowRow(loc.sources), fs = $('setFlow');
  fs.hidden = !row;
  if (!row) { fs.innerHTML = ''; return; }
  // cfs keeps the step of 100 it always had. Other units take any number.
  const unit = unitFormat().flowUnit(loc.flow?.unit ?? row.unit), cfs = unit === 'cfs';
  const box = (name, text) => `<label>${text} <input name="${name}" type="number" min="0" max="10000000" step="${cfs ? 100 : 'any'}" inputmode="${cfs ? 'numeric' : 'decimal'}"></label>`;
  const note = text => `<p class="note" style="margin:.4rem 0 0">${esc(text)}</p>`;
  fs.innerHTML = `<legend>River flow${row.label ? ` at ${esc(row.label)}` : ''}, ${unit}</legend>${box('flowCaution', 'Caution at')}${box('flowOff', 'Stay off at')}${loc.ignoredFlow ? note(ignoredFlowNote(loc.ignoredFlow)) : ''}${loc.copy.flowStats ? note(loc.copy.flowStats) : ''}`;
}

export function initSettings(onSave) {
  const dlg = $('settings'), form = $('setForm');
  const lines = new WeakMap(); // each limit field's line under it
  // The viewer's flow limits for another gauge are not used. They stay stored until the viewer
  // sets flow limits here or uses the location defaults.
  let keepOld = false;
  // The heading lives in the location's course, not in the limits.
  const current = () => ({ ...app.settings, heading: app.loc.course.heading });
  // The placeholder names the location's default, and a field that is not at it says so underneath.
  const mark = el => {
    const d = app.defaults[el.name] ?? '', t = el.value.trim(), v = t === '' ? '' : parseFloat(t);
    const text = `Location default ${d === '' ? 'off' : d}`;
    let line = lines.get(el);
    if (!line) {
      line = document.createElement('small');
      line.id = `own-${el.name}`; line.className = 'own';
      el.closest('label').after(line);
      el.setAttribute('aria-describedby', line.id);
      lines.set(el, line);
    }
    el.placeholder = text;
    line.textContent = v === d || Number.isNaN(v) ? '' : `Your setting. ${text}.`;
  };
  const fill = src => {
    for (const k of FIELDS) {
      const el = form.elements[k];
      if (!el) continue;
      el.value = src[k] ?? '';
      if (k !== 'waterOverride') mark(el);
    }
  };
  const open = () => {
    const heading = app.loc.course.kind === 'heading';
    $('setIntro').textContent = `Match these to your program, boat class and coach coverage. Saved in this browser for ${app.loc.name}.`;
    $('setCourse').hidden = !heading;
    form.elements.heading.disabled = !heading;
    flowFields();
    const mine = app.overrides.limitBasis?.flow;
    keepOld = FLOW.some(k => app.overrides[k] !== undefined) && mine != null && mine !== flowBasis(app.loc);
    fill(current());
    dlg.showModal();
  };
  $('settingsBtn').addEventListener('click', open);
  $('setNudgeBtn').addEventListener('click', open);
  $('setNudgeLater').addEventListener('click', () => { dismissNudge(); $('setNudge').hidden = true; });
  $('resetSet').addEventListener('click', () => { keepOld = false; fill(app.defaults); });
  form.addEventListener('input', e => {
    if (!lines.has(e.target)) return;
    mark(e.target);
    if (FLOW.includes(e.target.name)) keepOld = false;
  });
  dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'save') return;
    const next = current();
    for (const k of FIELDS) {
      const el = form.elements[k];
      if (!el) continue;
      const raw = el.value.trim();
      // The dock reading is a number, or blank to use the gauge.
      if (k === 'waterOverride') { const v = parseFloat(raw); next[k] = Number.isFinite(v) ? v : ''; continue; }
      // Rain chance, air quality and flow levels can be left blank to turn them off.
      if (OPTIONAL.includes(k) && raw === '') { next[k] = ''; continue; }
      const v = parseFloat(raw);
      if (!isNaN(v)) next[k] = v;
    }
    if (!form.elements.heading.disabled) next.heading = ((Math.round(next.heading) % 360) + 360) % 360;
    for (const k of Object.keys(TOP)) if (next[k] !== '') next[k] = Math.min(TOP[k], Math.max(0, Math.round(next[k])));
    for (const [lo, hi] of PAIRS) if (next[lo] !== '' && next[hi] !== '' && next[hi] < next[lo]) next[hi] = next[lo];
    // Only what differs from the location's defaults is kept.
    const values = overridesOf(next, app.defaults);
    // A flow limit is kept with the gauge it was set for (01 11.1). Limits for another gauge, left as they were, stay as they were.
    const gauge = flowBasis(app.loc);
    if (gauge && FLOW.some(k => values[k] !== undefined)) values.limitBasis = { flow: gauge };
    else if (keepOld) for (const k of [...FLOW, 'limitBasis']) if (app.overrides[k] !== undefined) values[k] = app.overrides[k];
    saveOverrides(app.loc.slug, values);
    applyOverrides(values);
    $('setNudge').hidden = true;
    onSave();
  });
}
