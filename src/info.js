// The instance label and the open counter. GET /api/info says whether this is production or
// a Preview such as dev, and whether dock reports are on. It also counts the start (07 14.3):
// the location shown ('none' on the picker page and the not found page), 'first' when this
// browser had opened no location before and 'return' when it had, and whether the app runs
// from the home screen. The Worker writes one point from those three words and nothing else.
// On a static host there is no /api, so both stay off.
import { app, $ } from './state.js';
import { isStandalone } from './install.js';
import { getJSON } from './reports.js';

export async function loadInfo(loc, first) {
  const q = new URLSearchParams({ loc, k: first ? 'first' : 'return', m: isStandalone() ? 'standalone' : 'browser' });
  try { app.info = await getJSON(`/api/info?${q}`); } catch (e) { app.info = null; }
  const badge = $('envBadge');
  const env = app.info && app.info.env;
  badge.hidden = !env || env === 'production';
  badge.textContent = env ? env[0].toUpperCase() + env.slice(1) : '';
}
