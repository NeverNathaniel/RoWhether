// Locations and waterways as data (01 sections 2 to 11): validation, slugs,
// source resolution, the resolved location the app reads, and the effective
// settings. Pure and DOM free, so the app, the build and later the Worker
// share it. It imports only config.js and format.js.
import { GLOBAL_DEFAULTS, PERIODS, WATER, FOG } from './config.js';
import { zoneFormat } from './format.js';

// Words a slug may not be: app routes, and files the build writes at the top of
// dist/. The same list is the CHECK in 08 4.4.
export const RESERVED_SLUGS = ['api', 'add', 'admin', 'mod', 'account', 'club', 'assets', 'about', 'privacy', 'terms', 'help', 'settings', 'login', 'logout', 'static', 'sw', 'manifest', 'locations', 'index'];

const WATER_TYPES = ['river', 'lake', 'reservoir', 'tidal', 'canal', 'harbor'];
// The water state mode of each water type (01 9.1).
const WATER_MODES = { river: 'river', lake: 'fetch', reservoir: 'fetch', tidal: 'tidal', canal: 'canal', harbor: 'fetch' };
const MODE_NAMES = ['river', 'fetch', 'tidal', 'canal'];
const STATUSES = ['draft', 'published', 'verified', 'archived'];
const VERIFIED_VIA = ['owner', 'moderator', 'club'];
const MODES = ['primary', 'fallback', 'info', 'off'];
const UNITS = ['cfs', 'm3s', 'ft', 'm', 'degC', 'degF', 'kn', 'ms'];
const FLOW_UNITS = ['cfs', 'm3s', 'ft', 'm'];
const RELATIONS = ['at', 'upstream', 'downstream', 'nearby', 'other_water'];
const SOURCE_STATUSES = ['active', 'suggested', 'offline', 'retired', 'rejected'];
const COPY_KEYS = ['flowFact', 'flowStats', 'flowHow', 'waterTempFact', 'obsFact', 'credits', 'description'];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REGION = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;
// The ref of an alerts row: NWS forecast zone, county and marine zone codes, or a point (01 4.4).
const ALERTS_REF = /^(zones:[A-Z]{2}[ZC]\d{3}(,[A-Z]{2}[ZC]\d{3})*|point:-?\d+(\.\d+)?,-?\d+(\.\d+)?)$/;

// Roles and the slots they fill, in the order the roles are walked. One flow
// row fills three slots, and `river` reads the flow row, then the water
// temperature row. Forecast, air quality and models have a row only to
// override the default, so bindingsFor() adds the implicit ones (01 4.1).
const ROLE_SLOTS = [
  ['forecast', ['wx']], ['air_quality', ['aq']], ['models', ['models']],
  ['alerts', ['alerts']], ['obs', ['obs']],
  ['flow', ['river', 'flow', 'flowDays']], ['flow_forecast', ['flowFcst']],
  ['water_temp', ['river']],
  ['tide', ['tide']], ['tide_stream', ['tideStream']], ['level', ['level']]
];
const ROLES = ROLE_SLOTS.map(r => r[0]);
const MODE_ORDER = { primary: 0, fallback: 1, info: 2 };

// Threshold keys (01 11.1): whether a level can be blank, and the range.
const T = (blank, min, max) => ({ blank, min, max });
const THRESHOLDS = {
  windCaution: T(false, 0), windOff: T(false, 0), gustCaution: T(false, 0), gustOff: T(false, 0),
  rainCaution: T(true, 0, 100), rainOff: T(true, 0, 100), coldCombined: T(false),
  flowCaution: T(true, 0, 1e7), flowOff: T(true, 0, 1e7), aqiCaution: T(true, 0, 500), aqiOff: T(true, 0, 500),
  streamCaution: T(true, 0, 10), streamOff: T(true, 0, 10), minLaunch: T(true), levelLow: T(true), levelHigh: T(true)
};
const BASIS_KEYS = ['flow', 'tide', 'level'];
const PAIRS = [['windCaution', 'windOff'], ['gustCaution', 'gustOff'], ['rainCaution', 'rainOff'], ['flowCaution', 'flowOff'], ['aqiCaution', 'aqiOff'], ['streamCaution', 'streamOff']];

// Validators return a list of problems, empty when the record is valid. A
// problem is { field, code, message }, and field is a path such as
// 'course.heading' or 'sources[1].ref'.
const bad = (field, code, message) => ({ field, code, message });
const fail = (p, ...problem) => { p.push(bad(...problem)); };
const missing = (p, field) => fail(p, field, 'required', 'Required.');
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);

function text(p, field, v, min, max, req) {
  if (v == null) return req && missing(p, field);
  if (typeof v !== 'string' || v.length < min || v.length > max) fail(p, field, 'length', `Use ${min} to ${max} characters.`);
}
function pick(p, field, v, list, req) {
  if (v == null) return req && missing(p, field);
  if (!list.includes(v)) fail(p, field, 'value', `Use one of ${list.join(', ')}.`);
}
function num(p, field, v, min = -Infinity, max = Infinity, req) {
  if (v == null) return req && missing(p, field);
  if (!isNum(v) || v < min || v > max) fail(p, field, 'range', 'Not a number in range.');
}
// Longitude runs from -180 up to but not including 180.
function lon(p, field, v, req) {
  if (v == null) return req && missing(p, field);
  if (!isNum(v) || v < -180 || v >= 180) fail(p, field, 'range', 'Use -180 up to, not including, 180.');
}
// Hours a reading may be used for: null, or above zero.
function hours(p, field, v) {
  if (v != null && (!isNum(v) || v <= 0)) fail(p, field, 'range', 'Use hours above 0, or null.');
}
// A zone is valid when Intl accepts it, which throws RangeError otherwise.
function zone(p, field, v, req) {
  if (v == null) return req && missing(p, field);
  try { new Intl.DateTimeFormat('en-US', { timeZone: v }); } catch (e) { fail(p, field, 'zone', 'Not a time zone.'); }
}
function country(p, field, v) {
  if (v == null) return missing(p, field);
  if (typeof v !== 'string' || !/^[A-Z]{2}$/.test(v)) fail(p, field, 'format', 'Use two capital letters.');
}
function point(p, field, v) {
  if (!Array.isArray(v) || v.length !== 2 || !isNum(v[0]) || Math.abs(v[0]) > 90 || !isNum(v[1]) || v[1] < -180 || v[1] >= 180) fail(p, field, 'range', 'Use [lat, lon].');
}

// Whether a string can be a slug. The page asks this of an address and of a stored
// slug, and carries none of validateSlug's words, which are for the build and a form.
export function isSlug(slug, min = 3, max = 48, reserved = true) {
  return typeof slug === 'string' && slug.length >= min && slug.length <= max && SLUG.test(slug) && !(reserved && RESERVED_SLUGS.includes(slug));
}
export function validateSlug(slug, { field = 'slug', min = 3, max = 48, reserved = true } = {}) {
  if (isSlug(slug, min, max, reserved)) return [];
  if (typeof slug !== 'string' || slug.length < min || slug.length > max) return [bad(field, 'length', `Use ${min} to ${max} characters.`)];
  if (!SLUG.test(slug)) return [bad(field, 'format', 'Use lowercase letters, numbers and hyphens, with none at the start or end and none doubled.')];
  return [bad(field, 'reserved', 'That address is reserved.')];
}

function checkCourse(p, c) {
  if (!isObj(c)) return missing(p, 'course');
  pick(p, 'course.kind', c.kind, ['heading', 'polyline', 'none'], true);
  // The wind code reads course.heading, which only a heading course has. Phase 1
  // lifts this when courseSegments() draws the other kinds.
  if (c.kind === 'polyline' || c.kind === 'none') fail(p, 'course.kind', 'unsupported', 'Only a course with one heading can be drawn until phase 1.');
  if (c.kind === 'heading' && (!isNum(c.heading) || c.heading < 0 || c.heading >= 360)) fail(p, 'course.heading', 'range', 'Use degrees from 0 to 359.');
  if (c.kind === 'polyline') {
    if (!Array.isArray(c.points) || c.points.length < 2 || c.points.length > 50) fail(p, 'course.points', 'length', 'Use 2 to 50 points.');
    else c.points.forEach((pt, i) => point(p, `course.points[${i}]`, pt));
  }
  if (c.reachWord != null && typeof c.reachWord !== 'string') fail(p, 'course.reachWord', 'value', 'Use text.');
  if (c.confirmed != null && typeof c.confirmed !== 'boolean') fail(p, 'course.confirmed', 'value', 'Use true or false.');
}

function checkBanks(p, b) {
  if (b == null) return;
  if (!isObj(b)) return fail(p, 'banks', 'value', 'Use an object.');
  pick(p, 'banks.word', b.word, ['bank', 'shore'], true);
  for (const side of ['left', 'right']) {
    if (!isObj(b[side])) { missing(p, `banks.${side}`); continue; }
    text(p, `banks.${side}.short`, b[side].short, 1, 4, true);
    text(p, `banks.${side}.name`, b[side].name, 1, 60, true);
  }
}

function checkThresholds(p, t) {
  if (!isObj(t)) return missing(p, 'thresholds');
  for (const [k, v] of Object.entries(t)) {
    const rule = THRESHOLDS[k], field = `thresholds.${k}`;
    if (k === 'basis') checkBasis(p, v);
    else if (!rule) fail(p, field, 'unknown', 'Not a threshold.');
    else if (!(rule.blank && (v === null || v === ''))) num(p, field, v, rule.min, rule.max, true);
  }
  for (const [lo, hi] of PAIRS) {
    if (isNum(t[lo]) && isNum(t[hi]) && t[lo] > t[hi]) fail(p, `thresholds.${hi}`, 'order', 'Stay off cannot be lower than caution.');
  }
}

// The gauge the limits in a binding's unit were set for, as adapter:ref:unit (01 11.1).
function checkBasis(p, b) {
  if (!isObj(b)) return fail(p, 'thresholds.basis', 'value', 'Use an object.');
  for (const [k, v] of Object.entries(b)) {
    if (BASIS_KEYS.includes(k)) text(p, `thresholds.basis.${k}`, v, 1, 200);
    else fail(p, `thresholds.basis.${k}`, 'unknown', 'Use flow, tide or level.');
  }
}

// A flow limit needs the flow binding it was set for. The rows are the resolved ones, so a
// flow row the record takes from its waterway counts. Tide and level limits are read from
// the step that adds them.
function checkFlowLimits(p, rec, waterway) {
  const t = rec.thresholds, own = rec.sources, shared = waterway?.sources;
  const rows = l => l == null || (Array.isArray(l) && l.every(isObj));
  if (!isObj(t) || !rows(own) || !rows(shared)) return; // named by their own rules
  const row = flowRow(resolveSources(rec, waterway));
  if ((isNum(t.flowCaution) || isNum(t.flowOff)) && !row) fail(p, isNum(t.flowCaution) ? 'thresholds.flowCaution' : 'thresholds.flowOff', 'no_binding', 'A flow limit needs a flow source.');
  const basis = t.basis?.flow;
  if (typeof basis === 'string' && basis !== (row && basisOf(row, rec.flow?.unit))) fail(p, 'thresholds.basis.flow', 'basis', 'The limits were set for a different gauge than the one this location reads.');
}

function checkFlow(p, f) {
  if (f == null) return;
  if (!isObj(f)) return fail(p, 'flow', 'value', 'Use an object.');
  pick(p, 'flow.measure', f.measure, ['discharge', 'stage'], true);
  // The USGS adapter reads discharge only. Phase 1 lifts this when it reads stage.
  if (f.measure === 'stage') fail(p, 'flow.measure', 'unsupported', 'A stage gauge cannot be read until phase 1.');
  pick(p, 'flow.unit', f.unit, FLOW_UNITS, true);
  // Steps run from the highest flow down, each a flow and a multiplier.
  const step = (s, i, all) => Array.isArray(s) && s.length === 2 && isNum(s[0]) && s[0] > 0 && isNum(s[1]) && s[1] >= 1 && (i === 0 || s[0] < all[i - 1][0]);
  if (f.against != null && !(Array.isArray(f.against) && f.against.every(step))) fail(p, 'flow.against', 'value', 'Use [flow, multiplier] steps, highest flow first.');
  hours(p, 'flow.maxAgeH', f.maxAgeH);
  hours(p, 'flow.staleSwitchH', f.staleSwitchH);
}

function checkWater(p, w) {
  if (w == null) return;
  if (!isObj(w)) return fail(p, 'water', 'value', 'Use an object.');
  pick(p, 'water.mode', w.mode, MODE_NAMES, true);
  num(p, 'water.cross', w.cross, 0, 1);
}

function checkWaterTemp(p, w) {
  if (w == null) return;
  if (!isObj(w)) return fail(p, 'waterTemp', 'value', 'Use an object.');
  pick(p, 'waterTemp.fallback', w.fallback, ['none', 'monthly'], true);
  if (w.fallback === 'monthly' && !(Array.isArray(w.monthly) && w.monthly.length === 12 && w.monthly.every(isNum))) fail(p, 'waterTemp.monthly', 'length', 'Use 12 values.');
  hours(p, 'waterTemp.maxAgeH', w.maxAgeH);
}

function checkCopy(p, c) {
  if (c == null) return;
  if (!isObj(c)) return fail(p, 'copy', 'value', 'Use an object.');
  for (const [k, v] of Object.entries(c)) {
    // The description is the meta description of the location's page. The credits
    // name every source and link to each.
    if (COPY_KEYS.includes(k)) text(p, `copy.${k}`, v, 1, k === 'description' ? 160 : k === 'credits' ? 1200 : 600);
    else fail(p, `copy.${k}`, 'copy_key', 'Not a text that can be set.');
  }
}

// Bindings of one record (01 4.4). The adapter and ref are not checked against
// a registry here; the adapters are not loaded by this module.
function checkSources(p, list) {
  if (list == null) return;
  if (!Array.isArray(list)) return fail(p, 'sources', 'value', 'Use a list.');
  const primary = {};
  list.forEach((b, i) => {
    const f = k => `sources[${i}].${k}`;
    if (!isObj(b)) return fail(p, `sources[${i}]`, 'value', 'Use an object.');
    pick(p, f('role'), b.role, ROLES, true);
    pick(p, f('mode'), b.mode, MODES);
    if (b.priority != null && !(Number.isInteger(b.priority) && b.priority >= 0 && b.priority <= 9)) fail(p, f('priority'), 'range', 'Use 0 to 9.');
    text(p, f('adapter'), b.adapter, 2, 32, true);
    text(p, f('ref'), b.ref, 1, 120, true);
    if (b.role === 'alerts' && typeof b.ref === 'string' && !ALERTS_REF.test(b.ref)) fail(p, f('ref'), 'format', 'Use zones:<code>,<code> or point:<lat>,<lon>.');
    if (b.params != null && !isObj(b.params)) fail(p, f('params'), 'value', 'Use an object.');
    pick(p, f('unit'), b.unit, UNITS);
    zone(p, f('tz'), b.tz);
    text(p, f('label'), b.label, 1, 60);
    text(p, f('note'), b.note, 1, 200);
    num(p, f('siteLat'), b.siteLat, -90, 90);
    lon(p, f('siteLon'), b.siteLon);
    pick(p, f('relation'), b.relation, RELATIONS);
    pick(p, f('status'), b.status, SOURCE_STATUSES);
    // A role has one primary. A retired row does not count.
    if (b.role && (b.mode || 'primary') === 'primary' && b.status !== 'retired') {
      if (primary[b.role]) fail(p, f('role'), 'two_primaries', 'A role has one primary source.');
      primary[b.role] = true;
    }
  });
}

export function validateLocation(rec, { waterway = null } = {}) {
  const p = [];
  if (!isObj(rec)) return [bad('', 'value', 'A location is an object.')];
  if (rec.v != null && rec.v !== 1) fail(p, 'v', 'value', 'Use version 1.');
  if (typeof rec.id !== 'string' || !UUID.test(rec.id)) fail(p, 'id', 'format', 'Use a UUID.');
  p.push(...validateSlug(rec.slug));
  text(p, 'name', rec.name, 3, 60, true);
  text(p, 'shortName', rec.shortName, 2, 16, true);
  text(p, 'subtitle', rec.subtitle, 0, 120);
  text(p, 'locality', rec.locality, 0, 60);
  // A waterway is empty only on a draft.
  if (rec.waterway != null) p.push(...validateSlug(rec.waterway, { field: 'waterway', max: 64, reserved: false }));
  else if (rec.status !== 'draft') missing(p, 'waterway');
  num(p, 'lat', rec.lat, -90, 90, true);
  lon(p, 'lon', rec.lon, true);
  zone(p, 'tz', rec.tz, true);
  text(p, 'tzLabel', rec.tzLabel, 1, 24);
  country(p, 'country', rec.country);
  if (rec.region != null && !(typeof rec.region === 'string' && REGION.test(rec.region))) fail(p, 'region', 'format', 'Use an ISO 3166-2 code such as US-VT.');
  pick(p, 'waterType', rec.waterType, WATER_TYPES, true);
  checkCourse(p, rec.course);
  checkBanks(p, rec.banks);
  checkThresholds(p, rec.thresholds);
  pick(p, 'aqiScale', rec.aqiScale, ['us', 'eu'], true);
  checkFlow(p, rec.flow);
  checkWater(p, rec.water);
  for (const k of ['fog', 'tide']) if (rec[k] != null && !isObj(rec[k])) fail(p, k, 'value', 'Use an object.');
  checkWaterTemp(p, rec.waterTemp);
  if (rec.daylight != null) {
    const w = isObj(rec.daylight) ? rec.daylight.dayWindow : null;
    if (!(Array.isArray(w) && w.length === 2 && isNum(w[0]) && isNum(w[1]) && w[0] >= 0 && w[1] <= 24 && w[0] < w[1])) fail(p, 'daylight.dayWindow', 'value', 'Use [from, to] hours, from 0 to 24.');
  }
  checkCopy(p, rec.copy);
  text(p, 'launchNotes', rec.launchNotes, 0, 1000);
  pick(p, 'status', rec.status, STATUSES, true);
  pick(p, 'verifiedVia', rec.verifiedVia, VERIFIED_VIA);
  if (rec.revision != null && !(Number.isInteger(rec.revision) && rec.revision >= 1)) fail(p, 'revision', 'range', 'Use 1 or more.');
  checkSources(p, rec.sources);
  checkFlowLimits(p, rec, waterway);
  return p;
}

export function validateWaterway(w) {
  const p = [];
  if (!isObj(w)) return [bad('', 'value', 'A waterway is an object.')];
  if (w.v != null && w.v !== 1) fail(p, 'v', 'value', 'Use version 1.');
  // Waterway ids are slugs in their own namespace, so no reserved words.
  p.push(...validateSlug(w.id, { field: 'id', max: 64, reserved: false }));
  text(p, 'name', w.name, 2, 80, true);
  text(p, 'reach', w.reach, 0, 120);
  pick(p, 'kind', w.kind, WATER_TYPES, true);
  country(p, 'country', w.country);
  if (!Array.isArray(w.regions) || !w.regions.every(r => typeof r === 'string' && REGION.test(r))) fail(p, 'regions', 'value', 'Use a list of ISO 3166-2 codes.');
  if (w.geometry != null) {
    if (!Array.isArray(w.geometry) || w.geometry.length > 500) fail(p, 'geometry', 'length', 'Use up to 500 points.');
    else w.geometry.forEach((pt, i) => point(p, `geometry[${i}]`, pt));
  }
  if (w.traffic != null) {
    if (!isObj(w.traffic)) fail(p, 'traffic', 'value', 'Use an object.');
    else {
      pick(p, 'traffic.rule', w.traffic.rule, ['keep_right', 'keep_left', 'custom'], true);
      text(p, 'traffic.text', w.traffic.text, 1, 400, true);
      pick(p, 'traffic.source', w.traffic.source, ['club', 'authority', 'community'], true);
    }
  }
  text(p, 'notes', w.notes, 0, 1000);
  checkSources(p, w.sources);
  return p;
}

// The bindings a location uses, keyed by slot (01 4.3). A role the location has
// rows for (even `off`) uses only its own rows, otherwise the waterway's. `off`
// and retired rows are dropped, and the rest run primary, then fallback by
// priority, then info. A slot with no binding is absent. Each row is copied
// with its defaults filled and `inherited` set.
export function resolveSources(loc, waterway) {
  const own = loc?.sources || [], shared = waterway?.sources || [];
  const out = {};
  for (const [role, slots] of ROLE_SLOTS) {
    const mine = own.filter(b => b.role === role), inherited = mine.length === 0;
    const rows = (inherited ? shared.filter(b => b.role === role) : mine)
      .filter(b => b.mode !== 'off' && b.status !== 'retired')
      .map(b => ({ ...b, mode: b.mode || 'primary', priority: b.priority ?? 0, inherited }))
      .sort((a, b) => MODE_ORDER[a.mode] - MODE_ORDER[b.mode] || a.priority - b.priority);
    if (!rows.length) continue;
    for (const slot of slots) out[slot] = (out[slot] || []).concat(rows);
  }
  return out;
}

// The stored row for a role, whichever slot it fills. Its label and note name
// the gauge or station in the texts. Null when the location has no such row.
export const sourceRow = (loc, role) => Object.values(loc.sources || {}).flat().find(r => r.role === role) ?? null;

// The gauge a limit in the flow binding's unit was set for: adapter:ref:unit (01 11.1).
const basisOf = (row, unit) => `${row.adapter}:${row.ref}:${row.unit ?? unit}`;
// The flow binding the limits are for: the first flow row that is not for information only.
export const flowRow = sources => sources?.flow?.find(r => r.mode !== 'info') ?? null;
export const flowBasis = loc => { const r = flowRow(loc.sources); return r ? basisOf(r, loc.flow?.unit) : null; };
// What Settings and the River view say when the viewer's flow limits were set for another gauge.
export const ignoredFlowNote = ({ label }) => `Your flow limits were for ${label ? `the ${label} gauge` : 'a different gauge'}. Set them again for this gauge.`;

// The location the app reads: the record, its waterway's sources, and the
// viewer's course heading. A personal heading applies only to a course that is
// one heading (01 8.6). The record is not changed.
export function resolveLocation(rec, { waterway = null, overrides = {} } = {}) {
  const sources = resolveSources(rec, waterway);
  const labelRow = sources.flow?.[0];
  const c = rec.course;
  const heading = c.kind === 'heading' && isNum(overrides.heading) ? overrides.heading : c.heading;
  // A heading course is one segment of unknown length. Polylines get theirs
  // from courseSegments() in phase 1.
  const segments = c.kind === 'heading' ? [{ heading, lengthM: null, fromM: 0, toM: null, name: null }] : [];
  return {
    id: rec.id, slug: rec.slug, name: rec.name, shortName: rec.shortName,
    subtitle: rec.subtitle ?? null, locality: rec.locality ?? null, waterwayName: waterway?.name ?? null,
    tz: rec.tz, tzLabel: rec.tzLabel ?? null, lat: rec.lat, lon: rec.lon,
    country: rec.country, region: rec.region ?? null,
    waterType: rec.waterType, status: rec.status, aqiScale: rec.aqiScale,
    course: { kind: c.kind, heading, points: c.points ?? null, reachWord: c.reachWord ?? null, confirmed: c.confirmed === true, segments },
    // Banks the record leaves null are generated from the heading in phase 1.
    banks: rec.banks ?? null,
    thresholds: { ...rec.thresholds },
    flow: rec.flow ? { ...rec.flow, label: labelRow?.label ?? null, stats: labelRow?.stats ?? null } : null,
    // Crosswind counts 0.4 unless the record says otherwise (01 9.5).
    water: { mode: WATER_MODES[rec.waterType], cross: 0.4, levels: WATER.levels, blend: WATER.blend, ...rec.water },
    fog: { ...FOG, ...rec.fog },
    waterTemp: { fallback: 'none', monthly: null, maxAgeH: null, ...rec.waterTemp },
    tide: rec.tide ?? null,
    daylight: { dayWindow: [5, 22], ...rec.daylight },
    periods: PERIODS,
    sources,
    copy: { ...rec.copy },
    fmt: zoneFormat(rec.tz),
    ...ignoredFlow(rec, waterway, sources, overrides)
  };
}

// The viewer's flow limits that were set for another gauge are ignored and kept (01 11.1). Where
// there is such a limit, { ignoredFlow: { label } } names that gauge from a row that still has it,
// even a retired one, or null. Otherwise nothing, so the location has no such key.
function ignoredFlow(rec, waterway, sources, overrides) {
  const old = overrides.limitBasis?.flow, row = flowRow(sources);
  if (typeof old !== 'string' || !row || old === basisOf(row, rec.flow?.unit) || (overrides.flowCaution === undefined && overrides.flowOff === undefined)) return null;
  const named = [...(rec.sources || []), ...(waterway?.sources || [])].find(r => r.role === 'flow' && basisOf(r, rec.flow?.unit) === old);
  return { ignoredFlow: { label: named?.label ?? null } };
}

// The limits for one location, as plain values: the global defaults, then the
// location's thresholds, then the viewer's overrides (01 11.5). Flow has no
// global default, so it is blank unless the location sets it. Only keys the
// settings know are taken from the overrides, so `heading` stays out: it lives
// in loc.course. A blank (null in a record) is '' and turns that level off.
// A flow limit is for one gauge (01 11.1): the location's by thresholds.basis, the
// viewer's by overrides.limitBasis. One with no basis was made for the gauge the
// location has now. One for another gauge is not used, and the basis never leaves here.
const FLOW_LIMITS = ['flowCaution', 'flowOff'];
export function effectiveSettings(loc, { overrides = {} } = {}) {
  const { basis, ...own } = loc.thresholds;
  const S = { ...GLOBAL_DEFAULTS, flowCaution: '', flowOff: '', ...own };
  const gauge = flowBasis(loc), mine = overrides.limitBasis?.flow;
  if (basis?.flow != null && basis.flow !== gauge) for (const k of FLOW_LIMITS) S[k] = '';
  for (const k of Object.keys(S)) {
    if (overrides[k] !== undefined && !(FLOW_LIMITS.includes(k) && mine != null && mine !== gauge)) S[k] = overrides[k];
  }
  for (const k of Object.keys(S)) if (S[k] === null) S[k] = '';
  return S;
}

// The values in S that differ from `defaults`: the settings of the location
// shown with nothing overridden, plus its course heading. Numbers compare as
// numbers, and '' (a level turned off) is a real override.
export function overridesOf(S, defaults) {
  const values = {};
  for (const k of Object.keys(defaults)) if (S[k] !== undefined && S[k] !== defaults[k]) values[k] = S[k];
  return values;
}
