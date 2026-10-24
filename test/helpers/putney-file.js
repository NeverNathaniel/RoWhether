// Putney Landing as the build writes it to locations/putney-landing.json: the
// record, with its waterway inlined, which is what openLocation() takes.
import { PUTNEY_RECORD, PUTNEY_WATERWAY } from '../../src/putney.js';
import { recordFile } from '../../scripts/locations/plugin.mjs';

export const PUTNEY_FILE = recordFile(PUTNEY_RECORD, PUTNEY_WATERWAY);
