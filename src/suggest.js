// Suggestion form. The button only appears when the Worker says the feature is
// configured. The form itself is a lazy chunk (suggest-form.js), read on the first
// tap, so the first screen does not carry it. Sends text to /api/suggest, where the
// Worker checks Turnstile, has Claude rewrite it, and files a GitHub issue for review.
import { app, $ } from './state.js';
import { isStandalone } from './install.js';

// What the bug reports carry about the app. The Worker lists the course heading
// among the setting keys, and it lives in the location. A page with no location
// (not found, or one that did not load) has neither settings nor a place to name.
export function suggestContext() {
  return {
    version: __APP_VERSION__,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    browser: navigator.userAgent,
    installed: isStandalone(),
    location: app.loc?.slug ?? null,
    settings: app.loc ? { ...app.settings, heading: app.loc.course.heading } : null
  };
}

export async function initSuggest() {
  let siteKey;
  try {
    const r = await fetch('/api/suggest', { headers: { Accept: 'application/json' } });
    if (!r.ok) return;
    const c = await r.json();
    if (!c.enabled || !c.siteKey) return;
    siteKey = c.siteKey;
  } catch (e) {
    return; // offline, local dev, or not deployed with the Worker
  }
  $('suggestRow').hidden = false;
  document.body.classList.add('can-suggest'); // the picker offers it too
  $('suggestBtn').addEventListener('click', () => import('./suggest-form.js').then(f => f.openForm(siteKey)));
}
