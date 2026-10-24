// Rebuild the model from the latest data and settings, then draw every
// section, and the open detail view if there is one.
import { app } from '../state.js';
import { buildModel } from '../logic.js';
import { renderHeader } from './header.js';
import { renderNoData, renderHero, renderAlerts } from './hero.js';
import { renderNow } from './now.js';
import { renderDays } from './days.js';
import { renderDetail } from './detail/index.js';
import { renderReports } from '../reports.js';
import { bindingsFor, staleSlots } from '../sources/index.js';

export function render() {
  // A source a refresh in this visit failed for, with a last good fetch past its limit, reads as missing (P1.9).
  const now = Date.now(), failed = Object.values(app.errors).some(Boolean);
  const stale = failed ? staleSlots(bindingsFor(app.loc), app.fetched, app.errors, now) : undefined;
  app.model = buildModel(app.loc, app.data, app.settings, now, { stale });
  renderHeader();
  renderDetail();
  if (!app.model) { renderNoData(stale?.get('wx') != null); return; }
  renderHero();
  performance.mark('hero');
  renderAlerts();
  renderNow();
  renderReports();
  renderDays();
}
