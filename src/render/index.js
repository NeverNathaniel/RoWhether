// Rebuild the model from the latest data and settings, then draw every section.
import { app } from '../state.js';
import { buildModel } from '../logic.js';
import { renderHeader, renderNoData, renderHero, renderAlerts } from './hero.js';
import { renderNow } from './now.js';
import { renderWindows } from './windows.js';
import { renderStrip, renderHourDetail } from './strip.js';
import { renderWeek } from './week.js';

export function render() {
  app.model = buildModel(app.data, app.settings);
  renderHeader();
  if (!app.model) { renderNoData(); return; }
  if (app.sel >= app.model.h72.length) app.sel = 0;
  renderHero();
  renderAlerts();
  renderNow();
  renderWindows();
  renderStrip();
  renderHourDetail();
  renderWeek();
}
