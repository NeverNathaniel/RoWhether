// The nine detail views as one module. index.js loads it with import() the
// first time a tab opens, so the first screen does not carry them (P1.2a).
// Nothing else in src/ imports a view module.
import * as week from './week.js';
import * as wind from './wind.js';
import * as rain from './rain.js';
import * as temperature from './temperature.js';
import * as fog from './fog.js';
import * as river from './river.js';
import * as storms from './storms.js';
import * as air from './air.js';
import * as light from './light.js';

export const MODULES = { week, wind, river, storms, fog, temperature, rain, light, air };
