// Mutable app state shared by the render and event code.
import { loadSettings } from './storage.js';

export const app = {
  settings: loadSettings(),
  data: {},        // last good response per source
  errors: {},      // sources that failed on the latest refresh
  updated: null,   // time of the last good forecast
  fromCache: false,
  model: null,     // output of buildModel()
  openPeriods: new Set() // day-by-day rows the viewer has expanded
};

export const $ = id => document.getElementById(id);
