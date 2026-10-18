// Mutable app state shared by the render and event code.
import { loadOverrides } from './storage.js';
import { setZone } from './format.js';
import { PUTNEY_RECORD, PUTNEY_WATERWAY } from './putney.js';
import { resolveLocation, effectiveSettings } from './location.js';

export const app = {
  loc: null,       // the resolved location, with the viewer's heading
  settings: null,  // the limits in force: the location's, then the viewer's
  data: {},        // last good response per source
  errors: {},      // sources that failed on the latest refresh
  updated: null,   // time of the last good forecast
  fromCache: false,
  model: null,     // output of buildModel()
  openPeriods: new Set(), // day-by-day rows the viewer has expanded
  view: null,      // open detail view, { name, day }, or null on the home screen
  detailDay: null, // the day last picked in a detail view, kept across views
  homeScroll: 0,   // home screen scroll position, restored on the way back
  detailWidth: 0,  // width the detail view was drawn at
  info: null,      // GET /api/info: { env, reports }, or null on a static host
  reports: null    // GET /api/reports: { hours, reports }
};

// Builds app.loc and app.settings from the viewer's overrides, and sets the zone
// the screens show. The render code still reads S.heading until P0.10, so the
// settings carry it too.
export function applyOverrides(o) {
  app.loc = resolveLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY, overrides: o });
  setZone(app.loc.tz);
  app.settings = { ...effectiveSettings(app.loc, { overrides: o }), heading: app.loc.course.heading };
}
applyOverrides(loadOverrides(PUTNEY_RECORD.slug));

export const $ = id => document.getElementById(id);
