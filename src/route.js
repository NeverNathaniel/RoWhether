// Hash routes for the detail views: #wind, or #wind/2026-10-14 for one day.
// The home screen is no hash. Each history entry records how many steps it
// is from home, so the back link returns to the home entry instead of piling
// up entries, and a view opened from a bookmark still has a way home.
import { app, $ } from './state.js';
import { VIEW_KEYS, renderDetail } from './render/detail/index.js';

export function parseRoute(hash) {
  const [name, day] = (hash || '').replace(/^#\/?/, '').split('/');
  if (!VIEW_KEYS.includes(name)) return null;
  return { name, day: /^\d{4}-\d{2}-\d{2}$/.test(day || '') ? day : null };
}

let depth = 0;

function show() {
  const route = parseRoute(location.hash);
  const wasHome = !app.view;
  if (wasHome && route) app.homeScroll = window.scrollY;
  app.view = route;
  $('home').hidden = !!route;
  $('detail').hidden = !route;
  if (route) {
    renderDetail();
    window.scrollTo(0, 0);
    const t = $('detailTitle');
    if (t) t.focus({ preventScroll: true });
  } else if (!wasHome) {
    requestAnimationFrame(() => window.scrollTo(0, app.homeScroll || 0));
  }
}

function onHashChange() {
  const st = history.state;
  if (st && typeof st.depth === 'number') depth = st.depth;
  else {
    depth = parseRoute(location.hash) ? depth + 1 : 0;
    history.replaceState({ depth }, '');
  }
  show();
}

export function goHome() {
  if (depth > 0) { history.go(-depth); return; }
  history.pushState({ depth: 0 }, '', location.pathname + location.search);
  show();
}

// Show a different day in the open view without a new history entry.
export function setDay(day) {
  if (!app.view) return;
  app.view.day = day;
  app.detailDay = day;
  history.replaceState({ depth }, '', `#${app.view.name}/${day}`);
  renderDetail();
}

export function initRoutes() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  // Home is always 0 steps from home. A reloaded view keeps its count.
  const st = history.state;
  depth = parseRoute(location.hash) && st && typeof st.depth === 'number' ? st.depth : 0;
  history.replaceState({ depth }, '');
  window.addEventListener('hashchange', onHashChange);
  show();
}
