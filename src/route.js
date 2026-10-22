// Addresses, tabs and the day. A location is at /<slug>; Now is its home screen
// (no hash, or #now) and the other tabs are the detail views: #wind, or
// #wind/2026-10-14 for one day. The pure parts come first.
import { app, $ } from './state.js';
import { isSlug } from './location.js';
import { DEFAULT_SLUG, SITE_URL } from './config.js';
import { loadLast } from './storage.js';
import { esc } from './format.js';
import { VIEWS, viewsFor, renderDetail } from './render/detail/index.js';

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

// What an address asks for: { page, slug, view, day, open }. `page` is home (/),
// location (/<slug>) or notfound (anything else, with its `path` kept, for the
// words of a search). `view` is the hash's tab, not yet checked against the
// location's tabs.
export function parseRoute({ pathname, hash, search }) {
  const { name, day } = split(hash);
  const r = { page: 'home', slug: null, view: name && name !== 'now' ? name : null, day, open: /[?&]open=picker(&|$)/.test(search) ? 'picker' : null };
  if (pathname === '/' || pathname === '/index.html') return r;
  const seg = pathname.slice(1);
  if (!seg.includes('/') && isSlug(seg)) return { ...r, page: 'location', slug: seg };
  let path = seg;
  try { path = decodeURIComponent(seg); } catch (e) { /* keep it as typed */ }
  return { ...r, page: 'notfound', path };
}

// Where "/" goes: the location opened last, or Putney Landing, whose address
// stays "/" so a link shared as rowhether.com keeps meaning Putney. What is
// stored is checked before it becomes an address or a request. P1.6 adds the
// window of a first visit, which reads the time.
export function homeTarget({ last }) {
  if (isSlug(last)) return { slug: last, replace: true };
  return { slug: DEFAULT_SLUG, keepAddress: true };
}

// The tab bar of the open location. Drawn again when the location changes.
export function renderTabs() {
  $('tabs').innerHTML = [{ key: 'now', name: 'Now' }, ...viewsFor(app.loc)]
    .map(v => `<a href="#${v.key}" data-tab="${v.key}">${v.name}</a>`).join('');
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

// What the page shows: a location, or a notice that there is none.
function setPage(on) {
  $('tabs').hidden = $('actions').hidden = !on;
  $('notFound').hidden = on;
  if (!on) { app.view = null; $('home').hidden = $('detail').hidden = true; }
}

// The page for an address with no location, or one that did not load. Tabs, the
// home screen, Refresh and Settings are hidden. P1.6 adds the picker search.
function notice(title, text) {
  $('notFound').innerHTML = `<h2>${title}</h2><p>${text}</p>`;
  setPage(false);
}
export const showMissing = path => notice('No location here', `No location at ${SITE_URL.slice(8)}${esc(path)}.`);
export const showFailed = () => notice('Could not load this location', 'Check the connection, then try again.</p><p><button id="retryBtn">Try again</button>');

// Shows Now, or the tab the hash names when the open location has it. A hash for
// a tab it does not have is dropped from the address.
export function showTab() {
  setPage(true);
  const route = parseHash(location.hash, viewsFor(app.loc).map(v => v.key));
  if (!route && VIEWS.some(v => v.key === split(location.hash).name)) history.replaceState(history.state, '', location.pathname + location.search);
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

let open = () => {}; // (slug or null, keepAddress): opens a location, from src/main.js
let at = '';         // the path and query the page last showed

// Shows what the address asks for: opens the location it names when that is not
// the one open, then the tab.
function show() {
  const r = parseRoute(location);
  let slug = r.slug, keepAddress = false;
  if (r.page === 'home') {
    const t = homeTarget({ last: loadLast() });
    slug = t.slug;
    keepAddress = !!t.keepAddress;
    if (t.replace) history.replaceState(history.state, '', `/${slug}${location.hash}`);
  }
  at = location.pathname + location.search;
  if (r.page === 'notfound') { open(null); showMissing(r.path); } else open(slug, keepAddress);
}

// Moves to another address inside the app, with no page load.
export function navigate(href) {
  history.pushState(null, '', href);
  show();
}
// A click on a same-origin a[data-nav] navigates in the page. A modified or
// middle click goes to the browser, to open in a new tab.
export function navClick(e) {
  if (e.target.closest?.('#retryBtn')) { show(); return; }
  const a = e.target.closest?.('a[data-nav]');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.origin !== location.origin) return;
  e.preventDefault();
  navigate(a.getAttribute('href'));
}

// Show a different day in the open view without a new history entry.
export function setDay(day) {
  if (!app.view) return;
  app.view.day = day;
  app.detailDay = day;
  history.replaceState(history.state, '', `#${app.view.name}/${day}`);
  renderDetail();
}

// Reads the address and opens its location. `openSlug` is main.js's.
export function initRoutes(openSlug) {
  open = openSlug;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  // A move to another tab fires popstate and then hashchange: the second one shows it.
  window.addEventListener('popstate', () => { if (location.pathname + location.search !== at) show(); });
  window.addEventListener('hashchange', show);
  document.addEventListener('click', navClick);
  show();
}
