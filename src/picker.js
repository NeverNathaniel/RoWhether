// The picker (07 5.1, 5.2): a sheet over the open location, the page at "/" when no
// location is chosen, and the search under an address with no location. Near me and the
// town search are here too. A lazy chunk, read on the first tap of the location name
// (src/main.js), with its own styles.
import './styles/picker.css';
import { app, $ } from './state.js';
import { fetchIndex } from './locations.js';
import { loadRecent } from './storage.js';
import { esc } from './format.js';
import { T } from './copy/picker.js';

// ---------- Search and grouping ----------
// Lower case with the accents taken off.
export const fold = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
// The words of a text, each led by a space: a space and a prefix find the start of a word.
const key = s => ` ${fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`;
// The words of an address, for the search box under a page with no location.
export const pathWords = path => key(path).trim();

// How well an index entry matches a query, best first: 0 the name starts with it, 1 a word
// in the name does, 2 a word in the short name, locality or waterway does, -1 no match.
// A query under 2 characters matches nothing.
export function matchRank(e, q) {
  const k = key(q), name = key(e.name);
  if (k.length < 3) return -1;
  if (name.startsWith(k)) return 0;
  if (name.includes(k)) return 1;
  return [e.shortName, e.locality, e.waterway].some(s => s && key(s).includes(k)) ? 2 : -1;
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// The entries that match, at most 8: by rank, then the ones opened lately (`recent`,
// newest first), then by name.
export function search(list, q, recent = []) {
  const lately = e => { const i = recent.indexOf(e.slug); return i < 0 ? recent.length : i; };
  return list.map(e => ({ e, r: matchRank(e, q) })).filter(x => x.r >= 0)
    .sort((a, b) => a.r - b.r || lately(a.e) - lately(b.e) || cmp(fold(a.e.name), fold(b.e.name)))
    .slice(0, 8).map(x => x.e);
}

const STATES = 'AL:Alabama,AK:Alaska,AZ:Arizona,AR:Arkansas,CA:California,CO:Colorado,CT:Connecticut,DE:Delaware,DC:District of Columbia,FL:Florida,GA:Georgia,HI:Hawaii,ID:Idaho,IL:Illinois,IN:Indiana,IA:Iowa,KS:Kansas,KY:Kentucky,LA:Louisiana,ME:Maine,MD:Maryland,MA:Massachusetts,MI:Michigan,MN:Minnesota,MS:Mississippi,MO:Missouri,MT:Montana,NE:Nebraska,NV:Nevada,NH:New Hampshire,NJ:New Jersey,NM:New Mexico,NY:New York,NC:North Carolina,ND:North Dakota,OH:Ohio,OK:Oklahoma,OR:Oregon,PA:Pennsylvania,RI:Rhode Island,SC:South Carolina,SD:South Dakota,TN:Tennessee,TX:Texas,UT:Utah,VT:Vermont,VA:Virginia,WA:Washington,WV:West Virginia,WI:Wisconsin,WY:Wyoming';
const REGIONS = Object.fromEntries([
  ...STATES.split(',').map(s => [`US-${s.slice(0, 2)}`, s.slice(3)]),
  ['GB-ENG', 'England'], ['GB-SCT', 'Scotland'], ['GB-WLS', 'Wales'], ['GB-NIR', 'Northern Ireland']
]);
// The name of an ISO 3166-2 code ("US-NH"), or its last part when this list lacks it.
export const regionName = code => REGIONS[code] || code.split('-').pop();

const countryName = c => { try { return new Intl.DisplayNames('en', { type: 'region' }).of(c) || c; } catch (e) { return c; } };
// The entries by country, then region, then name, for the list of all of them. A country
// has a heading only when there is more than one. An entry with no region comes last.
export function groupList(entries) {
  const by = {};
  for (const e of entries) ((by[e.country] ??= {})[e.region || ''] ??= []).push(e);
  const codes = Object.keys(by).sort((a, b) => cmp(countryName(a), countryName(b)));
  return codes.map(c => ({
    heading: codes.length > 1 ? countryName(c) : null,
    regions: Object.entries(by[c])
      .map(([code, list]) => ({ name: code && regionName(code), entries: list.sort((a, b) => cmp(fold(a.name), fold(b.name))) }))
      .sort((a, b) => cmp(a.name || '￿', b.name || '￿'))
  }));
}

// ---------- Near me and towns (07 5.2.1, 5.2.2) ----------
export const NEAR_KM = 100;      // Near me looks this far
export const PLACE_KM = 50;      // a town's neighbours are this near
export const TOWN_GAP_MS = 300;  // the pause in typing before a town search, and the least time between two
const TOWN_WAIT_MS = 8000;       // a town search with no answer by then has failed

const round2 = x => Math.round(x * 100) / 100;

// The great-circle distance in km between two { lat, lon } points.
export function km(a, b) {
  const r = x => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// The entries within `within` km of `at`, nearest first, each with its distance as `d`.
export const nearest = (list, at, within) => list.map(e => ({ ...e, d: km(at, e) })).filter(e => e.d <= within)
  .sort((a, b) => a.d - b.d || cmp(fold(a.name), fold(b.name)));

// "0.6 mi", "7.7 mi", "62 mi": US units, one decimal under 10.
export const miles = d => { const m = d / 1.609344; return `${m < 9.95 ? m.toFixed(1) : Math.round(m)} mi`; };

// The viewer's position as { lat, lon }, rounded to 2 decimals (about 1 km) before anything
// else sees it, and kept nowhere. Asked only when this is called, which is on a tap. Rejects
// with 'denied' (without asking at all when the permission is already denied) or 'lost'.
export async function whereAmI(nav = navigator) {
  try {
    if ((await nav.permissions?.query({ name: 'geolocation' }))?.state === 'denied') return Promise.reject('denied');
  } catch (e) { /* no permissions API, or not for this name: ask */ }
  return new Promise((ok, no) => nav.geolocation.getCurrentPosition(
    p => ok({ lat: round2(p.coords.latitude), lon: round2(p.coords.longitude) }),
    e => no(e?.code === 1 ? 'denied' : 'lost'),
    { enableHighAccuracy: false, maximumAge: 600000, timeout: 10000 }
  ));
}

// Runs `fn` at most once per `ms`. A call inside the wait runs when it ends, and of several
// only the last one does.
export function throttle(fn, ms) {
  let waiting = false, pending = null;
  const run = args => {
    waiting = true;
    setTimeout(() => { waiting = false; if (pending) { const a = pending; pending = null; run(a); } }, ms);
    fn(...args);
  };
  return (...args) => { if (waiting) pending = args; else run(args); };
}

// Open-Meteo's town search: keyless, and it answers with `access-control-allow-origin: *`.
export const placesUrl = text => `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(text)}&count=5&language=en&format=json`;
// "Worcester, Massachusetts, United States", and the shorter "Worcester, Massachusetts".
export const placeName = p => [p.name, p.admin1, p.country].filter(Boolean).join(', ');
export const placeShort = p => [p.name, p.admin1 || p.country].filter(Boolean).join(', ');

// { places } (up to 5, as { name, admin1, country, lat, lon }), or { failed: true } for a
// network error, an answer that is not ok or not JSON, or no answer in `ms`.
export async function fetchPlaces(text, { get = fetch, ms = TOWN_WAIT_MS } = {}) {
  const stop = new AbortController(), timer = setTimeout(() => stop.abort(), ms);
  try {
    const r = await get(placesUrl(text), { signal: stop.signal });
    if (!r.ok) return { failed: true };
    const found = JSON.parse(await r.text()).results;
    return { places: (Array.isArray(found) ? found : []).filter(p => p && p.name && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).slice(0, 5)
      .map(p => ({ name: p.name, admin1: p.admin1, country: p.country, lat: p.latitude, lon: p.longitude })) };
  } catch (e) { return { failed: true }; } finally { clearTimeout(timer); }
}

// One town search at a time per `TOWN_GAP_MS`, across every picker the page opens.
const askTowns = throttle((text, ok, done) => { if (ok()) fetchPlaces(text).then(done); }, TOWN_GAP_MS);

// ---------- Drawing ----------
// The second line of a row: the locality, then the waterway, each left out when it is the name.
const sub = e => [e.locality, e.waterway].filter(s => s && s !== e.name).map(s => `${s}.`).join(' ');
const row = (e, here) => `<li><a class="pk-row" href="/${esc(e.slug)}" data-nav data-name="${esc(e.name)}"><span class="pk-name">${esc(e.name)}</span>${here ? `<span class="badge pk-here">${T.here}</span>` : ''}${e.d != null ? `<span class="pk-dist">${miles(e.d)}</span>` : ''}${sub(e) ? `<span class="pk-sub">${esc(sub(e))}</span>` : ''}</a></li>`;
const rows = (list, here) => `<ul class="plist">${list.map(e => row(e, e.slug === here)).join('')}</ul>`;
const heading = s => `<h4 class="pk-group">${esc(s)}</h4>`;
const everything = list => groupList(list).map(g => `${g.heading ? heading(g.heading) : ''}${g.regions.map(r => `${r.name ? heading(r.name) : ''}${rows(r.entries)}`).join('')}`).join('');

// What a sheet, the page or the search under a missing address holds.
let hosts = 0; // a number for each picker drawn, so its hint has an id of its own
function markup(mode, list, here, recent) {
  const hint = `pkHint${++hosts}`;
  const sheet = mode === 'sheet', now = sheet && list.find(e => e.slug === here);
  const lately = sheet ? recent.map(s => list.find(e => e.slug === s)).filter(e => e && e.slug !== here).slice(0, 8) : [];
  const top = sheet ? `<div class="pk-top"><h2 id="pickTitle" tabindex="-1">${T.title}</h2><button type="button" class="pk-x" data-close aria-label="${T.close}">&times;</button></div>`
    : mode === 'page' ? `<h2>${T.pageTitle}</h2><p class="lede">${T.pageLead}</p>` : '';
  return `${top}${now ? rows([now], here) : ''}
<label class="pk-label"><span>${T.find}</span><input class="pk-q" type="search" autocomplete="off" enterkeyhint="search" placeholder="${T.hint}"></label>
<div class="pk-near"><button type="button" data-near aria-describedby="${hint}">${T.near}</button><span class="pk-hint" id="${hint}">${T.nearHint}</span></div>
<p class="pk-note" role="status"></p>
<div class="pk-found"></div>
<div class="pk-places"></div>
<div class="pk-rest">${lately.length ? `<h3>${T.recent}</h3>${rows(lately)}` : ''}${mode === 'notfound' ? '' : `<h3>${T.all}</h3>${list.length ? everything(list) : `<p class="pk-none">${T.noList}</p>`}`}</div>
<p class="pk-sug">${sheet ? '' : `${T.notHere} `}<button type="button" data-suggest>${T.suggest}</button></p>${sheet ? `<div class="dlg-actions"><button type="button" data-close>${T.close}</button></div>` : ''}<div class="vh pk-say" role="status"></div>`;
}

// ---------- The picker ----------
let opener = null; // what had focus when the sheet opened
let chose = false; // a row or the suggestion button was used: the sheet does not return focus
let drawn = 0;     // counts the draws of the page: one that answers late, after a newer, is dropped

// mode: 'sheet' over the open location; 'page' for "/" with no location chosen; 'notfound'
// for the search under an address with no location (`query` is that address).
export async function openPicker({ mode, query = '' }) {
  const dlg = $('picker'), mine = mode === 'sheet' ? 0 : ++drawn, index = await fetchIndex(), list = index ? index.locations : [];
  if (mode === 'sheet' ? dlg.open : app.loc || $('notFound').hidden || mine !== drawn) return; // opened already, or the page moved on
  const host = document.createElement('div'), here = app.loc?.slug, recent = loadRecent();
  host.className = 'pk';
  if (mode === 'sheet') dlg.replaceChildren(host);
  else {
    host.setAttribute('aria-live', 'off'); // the page holds a long list: it is not read out when it arrives
    $('notFound').append(host);
    if (mode === 'page') document.title = T.docTitle;
  }
  host.innerHTML = markup(mode, list, here, recent);
  const sel = x => host.querySelector(x);
  const q = sel('.pk-q'), found = sel('.pk-found'), rest = sel('.pk-rest'), spots = sel('.pk-places'), note = sel('.pk-note'), say = sel('.pk-say'), nearBtn = sel('[data-near]');
  // Still on the screen: a town search that answers after the sheet closed or the page moved on is dropped.
  const live = () => (mode === 'sheet' ? dlg.open : !$('notFound').hidden && host.isConnected);
  let towns = null, typing = 0, seq = 0; // the town search for the text in the box (null: none asked), the pause timer, the newest question
  const cancel = () => { clearTimeout(typing); seq++; };

  // From 2 characters the matches replace the lists, and the towns come under them. The list
  // is in the page already, so typing asks for no list. The towns are asked for after a pause.
  const refine = () => {
    const text = q.value.trim(), on = key(text).length > 2, hits = on ? search(list, text, recent) : [];
    const t = on && towns, got = t?.state === 'done' && t.places;
    rest.hidden = on;
    found.innerHTML = !on ? '' : hits.length ? rows(hits, here)
      : `<p class="pk-none">${t?.state === 'wait' ? T.waiting(esc(text)) : got?.length ? T.pickTown(esc(text)) : T.none(esc(text))}</p>`;
    spots.innerHTML = got?.length ? `<h3>${T.places}</h3><ul class="plist">${got.map((p, i) => `<li><button type="button" class="pk-place" data-place="${i}">${esc(placeName(p))}</button></li>`).join('')}</ul>`
      : t?.state === 'failed' ? `<p class="pk-none">${T.townFail}</p>` : '';
  };
  const ask = text => {
    if (!live() || key(text).length < 3 || (towns?.q === text && towns.state !== 'failed')) return;
    const id = ++seq;
    towns = { q: text, state: 'wait' };
    askTowns(text, () => id === seq && live(), got => {
      if (id !== seq) return;
      towns = { q: text, state: got.places ? 'done' : 'failed', places: got.places };
      refine();
    });
  };
  q.addEventListener('input', () => {
    cancel();
    note.textContent = '';
    const text = q.value.trim();
    towns = key(text).length > 2 ? { q: null, state: 'wait' } : null;
    refine();
    if (towns) typing = setTimeout(() => ask(text), TOWN_GAP_MS);
  });
  // Enter asks at once. The address under a missing page is only a guess at words, so it is not
  // sent anywhere until the viewer types or presses Enter.
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(typing); ask(q.value.trim()); } });
  if (query) { q.value = pathWords(query); refine(); }

  // Near me, on a tap only. The answer replaces the box and the lists, as a search does, unless the
  // viewer has typed or closed the picker while the position was on its way (that changes `seq`).
  nearBtn.addEventListener('click', async () => {
    const id = ++seq, had = document.activeElement === nearBtn;
    nearBtn.disabled = true;
    nearBtn.textContent = T.finding;
    note.textContent = '';
    try {
      const hits = nearest(list, await whereAmI(), NEAR_KM).slice(0, 8);
      if (id === seq && live()) {
        cancel();
        towns = null;
        q.value = '';
        refine();
        if (hits.length) {
          rest.hidden = true;
          found.innerHTML = `<h3>${T.nearHead}</h3>${rows(hits, here)}`;
          say.textContent = T.nearCount(hits.length);
        } else note.textContent = T.nearNone;
      }
    } catch (why) {
      if (id === seq) note.textContent = why === 'denied' ? T.denied : T.lost;
    }
    nearBtn.disabled = false;
    nearBtn.textContent = T.near;
    // A disabled button gives up focus: a keyboard viewer gets it back, unless they have gone elsewhere.
    if (had && live() && (!document.activeElement || document.activeElement === document.body)) nearBtn.focus();
  });

  host.addEventListener('click', e => {
    const a = e.target.closest('a[data-nav]'), b = e.target.closest('button'), place = b?.dataset.place;
    if (b?.hasAttribute('data-close')) dlg.close();
    else if (place != null && towns?.places) {
      // A town: our locations within 50 km of it, nearest first.
      const p = towns.places[+place], name = placeShort(p), hits = nearest(list, p, PLACE_KM).slice(0, 8).map(({ d, ...x }) => x);
      found.innerHTML = hits.length ? `<h3>${esc(T.nearPlace(name))}</h3>${rows(hits, here)}` : `<p class="pk-none">${esc(T.noneNear(name))}</p>`;
      say.textContent = hits.length ? T.nearPlaceCount(hits.length, name) : T.noneNear(name);
    } else if (b?.hasAttribute('data-suggest')) {
      chose = true;
      cancel();
      dlg.close(); // does nothing when the sheet is not open
      $('suggestBtn').click();
    } else if (a && !(e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
      // The click goes on to the router, which opens the location. Focus then goes to
      // the title, and a screen reader hears where it is (07 12.2).
      chose = true;
      cancel();
      dlg.close();
      setTimeout(() => {
        $('pageAnnounce').textContent = T.shown(a.dataset.name);
        $('title').focus();
        window.scrollTo(0, 0);
      });
    }
  });

  if (mode !== 'sheet') return;
  chose = false;
  opener = document.activeElement;
  dlg.addEventListener('close', () => {
    cancel();
    if (!chose) (opener?.isConnected && opener !== document.body ? opener : $('locBtn')).focus();
    chose = false;
  }, { once: true });
  dlg.showModal();
  $('pickTitle').focus();
}
