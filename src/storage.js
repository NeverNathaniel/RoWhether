// Settings overrides, last-good-data cache, location records, the last and
// recent locations, Plan a row choices, install bar state and the Settings
// reminder in localStorage (08 section 8). Every access is guarded. Every
// loader first calls migrateStorage(), which moves the old putney-rowing-* keys
// to the new ones once.
import { KEYS, OLD_KEYS, OLD_PUTNEY_DEFAULTS, CACHE_MAX, RECENT_MAX } from './config.js';
import { overridesOf } from './location.js';

// The one location the old keys held.
const OLD_SLUG = 'putney-landing';
const OLD_PREFIX = 'putney-rowing-';

// One value from the old settings, as it is stored now: a number, or '' for a
// level turned off. The dock reading was typed text ("55"); it becomes a number
// as waterOverridden() reads it, and text that is not a number is dropped.
function oldValue(key, v) {
  if (key === 'waterOverride') { const n = parseFloat(v); return Number.isFinite(n) ? n : undefined; }
  if (v === '' || Number.isFinite(v)) return v;
}

// Copies the old keys to the new ones (08 8.3). Each step has its own try/catch
// and writes its target only when that key is absent, so a rerun after a failed
// step never overwrites something saved since. The marker waits for every step.
// Safe to call from every loader. The old keys stay until phase 2.
export function migrateStorage() {
  try { if (localStorage.getItem(KEYS.migrated) !== null) return; } catch (e) { return; } // done, or storage blocked
  let failed = false;
  const step = fn => { try { fn(); } catch (e) { failed = true; /* the next start tries again */ } };
  const absent = key => localStorage.getItem(key) === null;
  // The old value, unchanged, when there is one and the new key has none.
  const copy = (from, to) => step(() => {
    const v = localStorage.getItem(from);
    if (v !== null && absent(to)) localStorage.setItem(to, v);
  });

  // Settings: only what differs from Putney's defaults before phase 1. `saved`
  // keeps the reminder hidden for people who saved before.
  step(() => {
    const raw = localStorage.getItem(OLD_KEYS.settings);
    if (raw === null || !absent(KEYS.settings)) return;
    let old = {};
    try { const s = JSON.parse(raw); if (s && typeof s === 'object') old = s; } catch (e) { /* unreadable, as it was before */ }
    const S = { ...OLD_PUTNEY_DEFAULTS };
    for (const k of Object.keys(S)) { const v = oldValue(k, old[k]); if (v !== undefined) S[k] = v; }
    localStorage.setItem(KEYS.settings, JSON.stringify({ [OLD_SLUG]: { saved: Date.now(), values: overridesOf(S, OLD_PUTNEY_DEFAULTS) } }));
  });
  copy(OLD_KEYS.cache, KEYS.cache(OLD_SLUG));
  copy(OLD_KEYS.plan, KEYS.plan);
  copy(OLD_KEYS.install, KEYS.install);
  copy(OLD_KEYS.nudge, KEYS.nudge);
  // Anyone who used the old app opens on Putney.
  step(() => {
    if (!absent(KEYS.last)) return;
    for (let i = 0; i < localStorage.length; i++) {
      if (String(localStorage.key(i)).startsWith(OLD_PREFIX)) { localStorage.setItem(KEYS.last, OLD_SLUG); return; }
    }
  });
  if (!failed) step(() => localStorage.setItem(KEYS.migrated, '1'));
}

// { "<slug>": { saved, values } }, or {} when there is none or storage is blocked.
function settingsMap() {
  try {
    const s = JSON.parse(localStorage.getItem(KEYS.settings) || 'null');
    if (s && typeof s === 'object') return s;
  } catch (e) { /* storage blocked */ }
  return {};
}
// What the viewer changed from one location's defaults, as { key: value }.
export function loadOverrides(slug) {
  migrateStorage();
  const v = settingsMap()[slug]?.values;
  return v && typeof v === 'object' ? { ...v } : {};
}
export function saveOverrides(slug, values) {
  try {
    const all = settingsMap();
    all[slug] = { saved: Date.now(), values };
    localStorage.setItem(KEYS.settings, JSON.stringify(all));
  } catch (e) { /* storage blocked */ }
}
// True once the viewer has saved Settings for this location in this browser,
// even unchanged.
export function hasSavedSettings(slug) {
  migrateStorage();
  return Boolean(settingsMap()[slug]?.saved);
}
// True once the Settings reminder has been dismissed in this browser.
export function nudgeDismissed() {
  migrateStorage();
  try { return localStorage.getItem(KEYS.nudge) !== null; } catch (e) { return false; }
}
export function dismissNudge() {
  try { localStorage.setItem(KEYS.nudge, '1'); } catch (e) { /* storage blocked */ }
}

// The slugs with a cache and a record, as { slug: last opened ms } (07 9.2).
// Entries with no time are dropped.
function cacheIndex() {
  try {
    const x = JSON.parse(localStorage.getItem(KEYS.cacheIndex) || 'null');
    if (x && typeof x === 'object' && !Array.isArray(x)) return Object.fromEntries(Object.entries(x).filter(([, t]) => Number.isFinite(t)));
  } catch (e) { /* storage blocked */ }
  return {};
}
export function touchCache(slug, now = Date.now()) {
  try { localStorage.setItem(KEYS.cacheIndex, JSON.stringify({ ...cacheIndex(), [slug]: now })); } catch (e) { /* storage blocked */ }
}
// Drops the cache and the record of the least recently opened location that is
// not `current` or in `protect`, then its index entry. Returns its slug, or null
// when there is none to drop. Throws when storage does.
function dropOldest(current, protect) {
  const index = cacheIndex();
  const [slug] = Object.keys(index)
    .filter(s => s !== current && !protect.includes(s))
    .sort((a, b) => index[a] - index[b] || (a < b ? -1 : 1));
  if (slug === undefined) return null;
  localStorage.removeItem(KEYS.cache(slug));
  localStorage.removeItem(KEYS.loc(slug));
  delete index[slug];
  localStorage.setItem(KEYS.cacheIndex, JSON.stringify(index));
  return slug;
}
// While more than CACHE_MAX locations are in the index, drops the least recently
// opened one that is neither `current` nor protected (favorites, from phase 2).
// Returns the slugs dropped, oldest first. It runs at most as many times as the
// index is over, so a store that ignores a write cannot make it loop.
export function trimCaches(current, protect = []) {
  const dropped = [];
  try {
    for (let over = Object.keys(cacheIndex()).length - CACHE_MAX; over > 0; over--) {
      const slug = dropOldest(current, protect);
      if (slug === null) break;
      dropped.push(slug);
    }
  } catch (e) { /* storage blocked */ }
  return dropped;
}

export function loadCache(slug) {
  migrateStorage();
  try {
    const c = JSON.parse(localStorage.getItem(KEYS.cache(slug)) || 'null');
    if (c && c.data) return c;
  } catch (e) { /* ignore */ }
  return null;
}
// When the store is full, drops the least recently opened location and tries
// again, up to 3 times, then gives up quietly. `slug` itself is never dropped.
const QUOTA_RETRIES = 3;
const isQuota = e => e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED';
export function saveCache(slug, data, updated, protect = []) {
  try {
    const json = JSON.stringify({ data, updated });
    for (let tries = 0; tries <= QUOTA_RETRIES; tries++) {
      try { localStorage.setItem(KEYS.cache(slug), json); return; } catch (e) {
        if (!isQuota(e) || tries === QUOTA_RETRIES || dropOldest(slug, protect) === null) return;
      }
    }
  } catch (e) { /* storage blocked */ }
}

// A location's record, as { record, fetchedAt }. The reader of the record checks
// its version and slug.
export function loadRecord(slug) {
  migrateStorage();
  try {
    const c = JSON.parse(localStorage.getItem(KEYS.loc(slug)) || 'null');
    if (c && c.record && typeof c.record === 'object') return { record: c.record, fetchedAt: Number.isFinite(c.fetchedAt) ? c.fetchedAt : 0 };
  } catch (e) { /* ignore */ }
  return null;
}
export function saveRecord(slug, record) {
  try { localStorage.setItem(KEYS.loc(slug), JSON.stringify({ record, fetchedAt: Date.now() })); } catch (e) { /* quota or blocked */ }
}

// The slug of the location opened last, or null.
export function loadLast() {
  migrateStorage();
  try { return localStorage.getItem(KEYS.last) || null; } catch (e) { return null; }
}
export function saveLast(slug) {
  try { localStorage.setItem(KEYS.last, slug); } catch (e) { /* storage blocked */ }
}

// The last RECENT_MAX locations opened, newest first.
export function loadRecent() {
  migrateStorage();
  try {
    const r = JSON.parse(localStorage.getItem(KEYS.recent) || 'null');
    if (Array.isArray(r)) return r.filter(s => typeof s === 'string');
  } catch (e) { /* storage blocked */ }
  return [];
}
export function pushRecent(slug) {
  try { localStorage.setItem(KEYS.recent, JSON.stringify([slug, ...loadRecent().filter(s => s !== slug)].slice(0, RECENT_MAX))); } catch (e) { /* storage blocked */ }
}

// True once "Not your water?" has been dismissed in this browser.
export function pickHintDismissed() {
  migrateStorage();
  try { return localStorage.getItem(KEYS.pickhint) !== null; } catch (e) { return false; }
}
export function dismissPickHint() {
  try { localStorage.setItem(KEYS.pickhint, '1'); } catch (e) { /* storage blocked */ }
}

// Plan a row choices: session length in minutes and time of day.
export function loadPlan() {
  migrateStorage();
  try {
    const p = JSON.parse(localStorage.getItem(KEYS.plan) || 'null');
    if (p && typeof p === 'object') return { minutes: 90, when: 'any', ...p };
  } catch (e) { /* storage blocked */ }
  return { minutes: 90, when: 'any' };
}
export function savePlan(p) {
  try { localStorage.setItem(KEYS.plan, JSON.stringify(p)); } catch (e) { /* storage blocked */ }
}

// Install bar: how many times it was dismissed, and whether to never show it.
export function loadInstall() {
  migrateStorage();
  try {
    const s = JSON.parse(localStorage.getItem(KEYS.install) || 'null');
    if (s && typeof s === 'object') return { dismissed: Number(s.dismissed) || 0, never: s.never === true };
  } catch (e) { /* storage blocked */ }
  return { dismissed: 0, never: false };
}
export function saveInstall(s) {
  try { localStorage.setItem(KEYS.install, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
}
