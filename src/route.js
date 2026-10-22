// Addresses, tabs and the day. A location is at /<slug>; Now is its home screen
// (no hash, or #now) and the other tabs are the detail views: #wind, or
// #wind/2026-10-14 for one day. The pure parts come first.
import { app, $ } from './state.js';
import { validateSlug } from './location.js';
import { DEFAULT_SLUG } from './config.js';
import { VIEWS, VIEW_KEYS, renderDetail } from './render/detail/index.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const split = hash => {
  const [name, day] = (hash || '').replace(/^#\/?/, '').split('/');
  return { name, day: DAY.test(day || '') ? day : null };
};

// The tab and day a hash names, when the tab is one of `keys` (the location's).
export function parseHash(hash, keys) {
  const r = split(hash);
  return keys.includes(r.name) ? r : null;
}

// What an address asks for: { page, slug, view, day, open, path, words }. `page` is
// home (/), location (/<slug>) or notfound (anything else, with the path and its
// words kept for the search). `view` is the hash's tab, not yet checked against
// the location's tabs.
export function parseRoute({ pathname = '/', hash = '', search = '' } = {}) {
  const { name, day } = split(hash);
  const r = { page: 'home', slug: null, view: name && name !== 'now' ? name : null, day, open: new URLSearchParams(search).get('open') === 'picker' ? 'picker' : null, path: '', words: '' };
  if (pathname === '/' || pathname === '/index.html') return r;
  const seg = pathname.slice(1);
  if (!seg.includes('/') && !validateSlug(seg).length) return { ...r, page: 'location', slug: seg, path: seg, words: seg.replace(/-/g, ' ') };
  let path = pathname.slice(1);
  try { path = decodeURIComponent(path); } catch (e) { /* keep it as typed */ }
  return { ...r, page: 'notfound', path, words: path.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ') };
}

// Where "/" goes: the location opened last, or Putney Landing, whose address
// stays "/" so a link shared as rowhether.com keeps meaning Putney. What is
// stored is checked before it becomes an address or a request. P1.6 adds the
// window of a first visit, which reads the time.
export function homeTarget({ last }) {
  if (last && !validateSlug(last).length) return { slug: last, replace: true };
  return { slug: DEFAULT_SLUG, keepAddress: true };
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
  const route = parseHash(location.hash, VIEW_KEYS);
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
