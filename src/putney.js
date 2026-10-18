// Putney Landing as data. In phase 0 the two files are imported straight into
// the bundle; phase 1 loads records from data/ by slug instead.
import record from '../data/locations/putney-landing.json';
import waterway from '../data/waterways/connecticut-river-vernon-pool.json';
import { resolveLocation, effectiveSettings } from './location.js';

export const PUTNEY_RECORD = record;
export const PUTNEY_WATERWAY = waterway;
export const PUTNEY = resolveLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY });

// Putney's settings with nothing overridden: the limits, and the course heading,
// which lives in the course and not in effectiveSettings(). Settings and the
// storage migration keep only the values that differ from these.
export const PUTNEY_DEFAULTS = { ...effectiveSettings(PUTNEY), heading: PUTNEY.course.heading };
