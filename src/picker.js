// The picker (07 5.1, 5.2): a sheet over the open location, the page at "/" when no
// location is chosen, and the search under an address with no location. A lazy chunk,
// read on the first tap of the location name (src/main.js), with its own styles.
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

// ---------- Drawing ----------
// The second line of a row: the locality, then the waterway, each left out when it is the name.
const sub = e => [e.locality, e.waterway].filter(s => s && s !== e.name).map(s => `${s}.`).join(' ');
const row = (e, here) => `<li><a class="pk-row" href="/${esc(e.slug)}" data-nav data-name="${esc(e.name)}"><span class="pk-name">${esc(e.name)}</span>${here ? `<span class="badge pk-here">${T.here}</span>` : ''}${sub(e) ? `<span class="pk-sub">${esc(sub(e))}</span>` : ''}</a></li>`;
const rows = (list, here) => `<ul class="plist">${list.map(e => row(e, e.slug === here)).join('')}</ul>`;
const heading = s => `<h4 class="pk-group">${esc(s)}</h4>`;
const everything = list => groupList(list).map(g => `${g.heading ? heading(g.heading) : ''}${g.regions.map(r => `${r.name ? heading(r.name) : ''}${rows(r.entries)}`).join('')}`).join('');

// What a sheet, the page or the search under a missing address holds.
function markup(mode, list, here, recent) {
  const sheet = mode === 'sheet', now = sheet && list.find(e => e.slug === here);
  const lately = sheet ? recent.map(s => list.find(e => e.slug === s)).filter(e => e && e.slug !== here).slice(0, 8) : [];
  const top = sheet ? `<div class="pk-top"><h2 id="pickTitle" tabindex="-1">${T.title}</h2><button type="button" class="pk-x" data-close aria-label="${T.close}">&times;</button></div>`
    : mode === 'page' ? `<h2>${T.pageTitle}</h2><p class="lede">${T.pageLead}</p>` : '';
  return `${top}${now ? rows([now], here) : ''}
<label class="pk-label"><span>${T.find}</span><input class="pk-q" type="search" autocomplete="off" enterkeyhint="search" placeholder="${T.hint}"></label>
<div class="pk-found"></div>
<div class="pk-rest">${lately.length ? `<h3>${T.recent}</h3>${rows(lately)}` : ''}${mode === 'notfound' ? '' : `<h3>${T.all}</h3>${list.length ? everything(list) : `<p class="pk-none">${T.noList}</p>`}`}</div>
<p class="pk-sug">${sheet ? '' : `${T.notHere} `}<button type="button" data-suggest>${T.suggest}</button></p>${sheet ? `<div class="dlg-actions"><button type="button" data-close>${T.close}</button></div>` : ''}`;
}

// ---------- The picker ----------
let opener = null; // what had focus when the sheet opened
let chose = false; // a row or the suggestion button was used: the sheet does not return focus

// mode: 'sheet' over the open location; 'page' for "/" with no location chosen; 'notfound'
// for the search under an address with no location (`query` is that address).
export async function openPicker({ mode, query = '' }) {
  const dlg = $('picker'), index = await fetchIndex(), list = index ? index.locations : [];
  if (mode === 'sheet' ? dlg.open : app.loc || $('notFound').hidden) return; // opened already, or the page moved on
  const host = document.createElement('div'), here = app.loc?.slug, recent = loadRecent();
  host.className = 'pk';
  if (mode === 'sheet') dlg.replaceChildren(host);
  else {
    host.setAttribute('aria-live', 'off'); // the page holds a long list: it is not read out when it arrives
    $('notFound').append(host);
    if (mode === 'page') document.title = T.docTitle;
  }
  host.innerHTML = markup(mode, list, here, recent);
  const q = host.querySelector('.pk-q'), found = host.querySelector('.pk-found'), rest = host.querySelector('.pk-rest');

  // From 2 characters the matches replace the lists. The list is in the page already, so
  // typing asks for nothing.
  const refine = () => {
    const text = q.value.trim(), on = key(text).length > 2, hits = on ? search(list, text, recent) : [];
    rest.hidden = on;
    found.innerHTML = !on ? '' : hits.length ? rows(hits, here) : `<p class="pk-none">${T.none(esc(text))}</p>`;
  };
  q.addEventListener('input', refine);
  if (query) { q.value = pathWords(query); refine(); }

  host.addEventListener('click', e => {
    const a = e.target.closest('a[data-nav]'), b = e.target.closest('button');
    if (b?.hasAttribute('data-close')) dlg.close();
    else if (b?.hasAttribute('data-suggest')) {
      chose = true;
      dlg.close(); // does nothing when the sheet is not open
      $('suggestBtn').click();
    } else if (a && !(e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
      // The click goes on to the router, which opens the location. Focus then goes to
      // the title, and a screen reader hears where it is (07 12.2).
      chose = true;
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
    if (!chose) (opener?.isConnected && opener !== document.body ? opener : $('locBtn')).focus();
    chose = false;
  }, { once: true });
  dlg.showModal();
  $('pickTitle').focus();
}
