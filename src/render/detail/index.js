// The detail views: the registry, the view renderer, and the Details menu.
// Each view module exports key, name, summary(m) for the menu, and
// render(m, day) returning { day, html } for the day it chose.
import { WORD_PLAIN } from '../../config.js';
import { app, $ } from '../../state.js';
import { esc } from '../../format.js';
import { head } from './common.js';
import * as overview from './overview.js';
import * as wind from './wind.js';
import * as rain from './rain.js';
import * as temperature from './temperature.js';
import * as fog from './fog.js';
import * as river from './river.js';

export const VIEWS = [overview, wind, rain, temperature, fog, river];
export const VIEW_KEYS = VIEWS.map(v => v.key);

export function renderDetail() {
  const r = app.view;
  if (!r) return;
  const v = VIEWS.find(x => x.key === r.name);
  $('vnav').innerHTML = VIEWS.map(x => `<a href="#${x.key}"${x === v ? ' aria-current="page"' : ''}>${x.name}</a>`).join('');
  // Hour tables the viewer opened stay open when the view is redrawn.
  const body = $('detailBody');
  const open = [...body.querySelectorAll('details.twin')].map(d => d.open);
  body.innerHTML = app.model
    ? v.render(app.model, r.day || app.detailDay).html
    : head(v.name, app.errors.wx ? 'No data yet. Check the connection, then tap Refresh.' : 'Loading.');
  if (body.dataset.view === r.name) body.querySelectorAll('details.twin').forEach((d, i) => { d.open = !!open[i]; });
  body.dataset.view = r.name;
  app.detailWidth = $('detail').clientWidth;
}

export function renderMenu() {
  const m = app.model;
  $('menuList').innerHTML = VIEWS.map(v => {
    const s = m ? v.summary(m) : { text: '', lvl: null };
    const word = typeof s.lvl === 'number' ? `<span class="vh">${WORD_PLAIN[s.lvl]}.</span>` : '';
    return `<li><a href="#${v.key}"><span class="mname"><i data-lvl="${s.lvl ?? ''}" aria-hidden="true"></i>${v.name}</span><span class="msum">${word}${esc(s.text)}</span></a></li>`;
  }).join('');
}
