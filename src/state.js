// Mutable app state shared by the render and event code.
import { loadSettings } from './storage.js';

export const app = {
  settings: loadSettings(),
  data: {},        // last good response per source
  errors: {},      // sources that failed on the latest refresh
  updated: null,   // time of the last good forecast
  fromCache: false,
  model: null,     // output of buildModel()
  openPeriods: new Set(), // day-by-day rows the viewer has expanded
  view: null,      // open detail view, { name, day }, or null on the home screen
  detailDay: null, // the day last picked in a detail view, kept across views
  homeScroll: 0,   // home screen scroll position, restored on the way back
  detailWidth: 0   // width the detail view was drawn at
};

export const $ = id => document.getElementById(id);
