// The detail views behind the tabs: the registry and the view renderer.
// Each view module exports key, name, summary(m) (its opening line), and
// render(m, day) returning { day, html } for the day it chose.
import { app, $ } from '../../state.js';
import { head } from './common.js';
import * as week from './week.js';
import * as wind from './wind.js';
import * as rain from './rain.js';
import * as temperature from './temperature.js';
import * as fog from './fog.js';
import * as river from './river.js';

export const VIEWS = [week, wind, rain, temperature, fog, river];
export const VIEW_KEYS = VIEWS.map(v => v.key);

export function renderDetail() {
  const r = app.view;
  if (!r) return;
  const v = VIEWS.find(x => x.key === r.name);
  // Sections the viewer opened (marked data-keep) stay open when the same
  // view is redrawn, such as on the 10-minute refresh.
  const body = $('detailBody');
  const open = body.dataset.view === r.name
    ? new Set([...body.querySelectorAll('details[data-keep]')].filter(d => d.open).map(d => d.dataset.keep))
    : new Set();
  body.innerHTML = app.model
    ? v.render(app.model, r.day || app.detailDay).html
    : head(v.name, app.errors.wx ? 'No data yet. Check the connection, then tap Refresh.' : 'Loading.');
  body.querySelectorAll('details[data-keep]').forEach(d => { if (open.has(d.dataset.keep)) d.open = true; });
  body.dataset.view = r.name;
  app.detailWidth = $('detail').clientWidth;
}
