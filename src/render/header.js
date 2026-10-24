// The header and the footer. renderHeader() draws the time of the data on every
// render. renderPlace() draws the place once, each time a location opens (or
// none is open): its name, subtitle, badge, credits and the install sentence.
import { app, $ } from '../state.js';
import { hm, dayKey, weekday, monthDay, linkText } from '../format.js';

// "Saved 6:41 AM", with the day when the copy is from an earlier one in the
// location's zone: "Saved Mon 6:41 AM" for the six days before, then "Saved Oct 14, 6:41 AM".
export function savedLabel(t, now) {
  const ago = (Date.parse(dayKey(now)) - Date.parse(dayKey(t))) / 864e5;
  return `Saved ${ago < 1 ? '' : ago < 7 ? `${weekday(t)} ` : `${monthDay(t)}, `}${hm(t)}`;
}

export function renderHeader() {
  const u = $('updated');
  if (!app.updated) { u.textContent = app.errors.wx ? 'Not loaded' : 'Loading'; return; }
  u.textContent = app.errors.wx || app.fromCache ? savedLabel(app.updated, Date.now()) : `Updated ${hm(app.updated)}`;
}

// The zone's own word for itself, or the offset from UTC in minutes.
const zonePart = (tz, now, style) => new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: style }).formatToParts(now).find(p => p.type === 'timeZoneName').value;
const offset = (tz, now) => {
  const m = /([+\-\u2212])(\d\d):(\d\d)/.exec(zonePart(tz, now, 'longOffset')); // "GMT-04:00", or "GMT"
  return m ? (m[1] === '+' ? 1 : -1) * (m[2] * 60 + +m[3]) : 0;
};

// ", 1 hour ahead of you", ", 9 hours 30 minutes behind you", or nothing when the
// device's zone is the location's at `now`.
function zoneDiff(tz, deviceTz, now) {
  const d = deviceTz ? offset(tz, now) - offset(deviceTz, now) : 0, a = Math.abs(d), h = Math.floor(a / 60), m = a % 60;
  return d ? `, ${[h && `${h} hour${h > 1 ? 's' : ''}`, m && `${m} minutes`].filter(Boolean).join(' ')} ${d > 0 ? 'ahead of' : 'behind'} you` : '';
}

// The line under the title (07 6.1): the record's subtitle, or "<waterway> at
// <locality>.", then the zone and how far it is from the device's.
export function subtitleText(loc, now, deviceTz) {
  const line = loc.subtitle || `${[loc.waterwayName !== loc.name && loc.waterwayName, loc.locality].filter(Boolean).join(' at ') || loc.name}.`;
  const zone = loc.tzLabel || zonePart(loc.tz, now, 'longGeneric').replace(/ Time$/, '');
  return `${line} All times ${zone}${zoneDiff(loc.tz, deviceTz, now)}.`;
}

// The place under the title and in the footer. `null` is a page with no location.
export function renderPlace(loc) {
  const name = loc ? loc.name : 'RoWhether', credits = loc?.copy.credits;
  $('locName').textContent = name;
  $('title').className = name.length > 18 ? 'long' : '';
  $('sub').textContent = loc ? subtitleText(loc, Date.now(), app.deviceTz) : '';
  $('locBadges').hidden = loc?.status !== 'published';
  $('credits').hidden = !credits;
  $('credits').innerHTML = linkText(credits);
  // The install bar says where the app opens (07 6.4).
  $('installText').textContent = `Add RoWhether to your home screen. ${loc ? `It opens on ${name} in one tap.` : 'It opens full screen in one tap.'}`;
  document.title = loc ? `${name} rowing conditions` : name;
}
