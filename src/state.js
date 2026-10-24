// Mutable app state shared by the render and event code.
import { setZone } from './format.js';
import { resolveLocation, effectiveSettings } from './location.js';

export const app = {
  record: null,    // the open location's record, as the build wrote it
  loc: null,       // the resolved location, with the viewer's heading; null until one is open
  defaults: null,  // the location's settings and heading with nothing overridden
  settings: null,  // the limits in force: the location's, then the viewer's
  data: {},        // last good response per source
  errors: {},      // sources that failed on the latest refresh
  fetched: {},     // time of each source's last good fetch, by slot
  updated: null,   // time of the last good forecast
  fromCache: false,
  model: null,     // output of buildModel()
  openPeriods: new Set(), // day-by-day rows the viewer has expanded
  view: null,      // open detail view, { name, day }, or null on the home screen
  detailDay: null, // the day last picked in a detail view, kept across views
  homeScroll: 0,   // home screen scroll position, restored on the way back
  detailWidth: 0,  // width the detail view was drawn at
  token: 0,        // counts the locations opened: an answer for an older one is dropped
  refreshing: null, // the token of the refresh in flight, or null
  deviceTz: Intl.DateTimeFormat().resolvedOptions().timeZone, // the viewer's own zone, for the subtitle
  info: null,      // GET /api/info: { env, reports }, or null on a static host
  reports: null    // GET /api/reports: { hours, reports }
};

// Builds app.loc and app.settings from the open record and the viewer's overrides,
// and sets the zone the screens show. The course heading is in app.loc.course,
// not in the settings.
export function applyOverrides(o) {
  const rec = app.record;
  app.loc = resolveLocation(rec, { waterway: rec.waterwayRecord, overrides: o });
  setZone(app.loc.tz);
  app.settings = effectiveSettings(app.loc, { overrides: o });
}

// Opens a location: everything held for the one before goes. A record of null
// leaves no location open, for a page that has none.
export function openLocation(record, overrides) {
  Object.assign(app, { record, data: {}, errors: {}, fetched: {}, updated: null, fromCache: false, model: null, openPeriods: new Set(), detailDay: null, homeScroll: 0, token: app.token + 1 });
  if (!record) { Object.assign(app, { loc: null, defaults: null, settings: null }); return; }
  applyOverrides(overrides);
  // Nothing overridden: the limits, and the course heading when the course has one.
  app.defaults = { ...effectiveSettings(app.loc), ...(record.course.kind === 'heading' && { heading: record.course.heading }) };
}

// A refresh is for the location that was open when it began. Its answer lands
// only if that is still the one open, so a slow answer never reaches another place.
export function takeRefresh(token, { data, errors }) {
  if (token !== app.token) return false;
  const now = Date.now();
  app.errors = errors;
  Object.assign(app.data, data);
  for (const k of Object.keys(data)) app.fetched[k] = now;
  if (!errors.wx) { app.updated = now; app.fromCache = false; }
  return true;
}
// When each source of a saved copy was fetched. A copy from before the times were kept
// has none: each source counts as fetched when the forecast was (P1.9).
export const fetchedOf = c => Object.fromEntries(Object.keys(c.data).map(k => [k, Number.isFinite(c.fetched?.[k]) ? c.fetched[k] : c.updated]));
// Whether a refresh may start: a location is open and none is running for it.
// A location opened while another's refresh runs gets its own at once.
export const canRefresh = () => !!app.loc && app.refreshing !== app.token;

export const $ = id => document.getElementById(id);
