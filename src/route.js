// Tabs and hash routes. Now is the home screen (no hash, or #now). The other
// tabs are the detail views: #wind, or #wind/2026-10-14 for one day.
import { app, $ } from './state.js';
import { VIEWS, VIEW_KEYS, renderDetail } from './render/detail/index.js';

export function parseRoute(hash) {
  const [name, day] = (hash || '').replace(/^#\/?/, '').split('/');
  if (!VIEW_KEYS.includes(name)) return null;
  return { name, day: /^\d{4}-\d{2}-\d{2}$/.test(day || '') ? day : null };
}

// Mark the current tab, and scroll the bar sideways if it is out of view.
function markTab() {
  const nav = $('tabs'), cur = app.view ? app.view.name : 'now';
  let on = null;
  for (const a of nav.querySelectorAll('a')) {
    if (a.dataset.tab === cur) { a.setAttribute('aria-current', 'page'); on = a; } else a.removeAttribute('aria-current');
  }
  if (on && (on.offsetLeft < nav.scrollLeft || on.offsetLeft + on.offsetWidth > nav.scrollLeft + nav.clientWidth)) {
    nav.scrollLeft = on.offsetLeft - 16;
  }
}

function show() {
  const route = parseRoute(location.hash);
  const wasHome = !app.view;
  if (wasHome && route) app.homeScroll = window.scrollY;
  app.view = route;
  $('home').hidden = !!route;
  $('detail').hidden = !route;
  markTab();
  if (route) {
    renderDetail();
    window.scrollTo(0, 0);
  } else if (!wasHome) {
    requestAnimationFrame(() => window.scrollTo(0, app.homeScroll || 0));
  }
}

// Show a different day in the open view without a new history entry.
export function setDay(day) {
  if (!app.view) return;
  app.view.day = day;
  app.detailDay = day;
  history.replaceState(history.state, '', `#${app.view.name}/${day}`);
  renderDetail();
}

export function initRoutes() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  $('tabs').innerHTML = [{ key: 'now', name: 'Now' }, ...VIEWS]
    .map(v => `<a href="#${v.key}" data-tab="${v.key}">${v.name}</a>`).join('');
  window.addEventListener('hashchange', show);
  show();
}
