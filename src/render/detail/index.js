// The detail views behind the tabs: the registry and the view renderer.
// The views are one lazy chunk (views.js, P1.2a), so the registry holds what the
// tab bar needs and a load for each. An entry may have when(loc), which says
// whether a location has the tab; it is here, not in the view module, so the tab
// bar can filter before any view has loaded. A view module exports key, name,
// summary(m) (its opening line), and render(m, day) returning { day, html } for
// the day it chose.
import { app, $ } from '../../state.js';
import { head } from '../parts.js';

const lazy = key => () => import('./views.js').then(x => x.MODULES[key]);

// Tab order, most to least important for deciding whether to row.
// Tide is a chunk of its own (P1.14): only a tidal location opens it.
export const VIEWS = [
  ['week', 'Week'], ['wind', 'Wind'], ['tide', 'Tide', loc => !!loc.sources.tide, () => import('./tide.js')],
  ['river', 'River', loc => loc.sources.flow], ['storms', 'Storms'], ['fog', 'Fog'],
  ['temperature', 'Temperature'], ['rain', 'Rain'], ['light', 'Light'], ['air', 'Air']
].map(([key, name, when, load]) => ({ key, name, when, load: load || lazy(key) }));
// The tabs a location has.
export const viewsFor = loc => VIEWS.filter(v => !v.when || v.when(loc));

const mods = {};    // view key to its module, once loaded
const loading = {}; // view keys with an import in flight

// Starts the import once. When it lands, draws the view that is open then, which
// may not be the one that asked. A failed import is dropped: the view stays on
// "Loading." and the next renderDetail() tries again.
function load(v) {
  if (loading[v.key]) return;
  loading[v.key] = true;
  v.load().then(m => { mods[v.key] = m; }, () => {}).then(() => {
    loading[v.key] = false;
    if (mods[v.key]) renderDetail();
  });
}

export function renderDetail() {
  const r = app.view;
  if (!r) return;
  const v = VIEWS.find(x => x.key === r.name);
  const mod = mods[v.key];
  if (!mod) load(v);
  const body = $('detailBody');
  if (app.model && mod) {
    // Sections the viewer opened (marked data-keep) stay open when the same
    // view is redrawn, such as on the 10-minute refresh.
    const open = body.dataset.view === r.name
      ? new Set([...body.querySelectorAll('details[data-keep]')].filter(d => d.open).map(d => d.dataset.keep))
      : new Set();
    body.innerHTML = mod.render(app.model, r.day || app.detailDay).html;
    body.querySelectorAll('details[data-keep]').forEach(d => { if (open.has(d.dataset.keep)) d.open = true; });
    body.dataset.view = r.name;
  } else {
    // data-view marks what a module drew, so a wait for it never meets this.
    body.innerHTML = head(v.name, !app.model && app.errors.wx ? 'No data yet. Check the connection, then tap Refresh.' : 'Loading.');
    delete body.dataset.view;
  }
  app.detailWidth = $('detail').clientWidth;
}
