// Rebuild the model from the latest data and settings, then draw every
// section, and the open detail view if there is one.
import { app } from '../state.js';
import { buildModel } from '../logic.js';
import { renderHeader, renderNoData, renderHero, renderAlerts } from './hero.js';
import { renderNow } from './now.js';
import { renderDays } from './days.js';
import { renderDetail } from './detail/index.js';

export function render() {
  app.model = buildModel(app.data, app.settings);
  renderHeader();
  renderDetail();
  if (!app.model) { renderNoData(); return; }
  renderHero();
  renderAlerts();
  renderNow();
  renderDays();
}
