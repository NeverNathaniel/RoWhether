// Mutable app state shared by the render and event code.
import { loadSettings } from './storage.js';

export const app = {
  settings: loadSettings(),
  data: {},        // last good response per source
  errors: {},      // sources that failed on the latest refresh
  updated: null,   // time of the last good forecast
  fromCache: false,
  model: null,     // output of buildModel()
  sel: 0,          // selected hour in the strip
  winSel: null,    // key of the open best window
  colW: 0, padX: 0 // strip geometry, for scrolling the selection into view
};

export const $ = id => document.getElementById(id);
