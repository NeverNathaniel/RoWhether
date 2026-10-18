// Time, number and text formatting. Times display in America/New_York until
// setZone() picks another zone.
import { HOUR, MIN } from './config.js';

// Formatters for one IANA zone, cached per zone. Only the 12 hour clock exists
// in phase 0.
const zones = new Map();
export function zoneFormat(tz, { clock = '12' } = {}) {
  const id = `${tz} ${clock}`;
  if (zones.has(id)) return zones.get(id);
  const fTime = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  const fWeekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
  const fDayLong = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
  const fMonthDay = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' });
  const fKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fH24 = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' });
  const fClock = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });

  const dayKey = t => fKey.format(new Date(t));
  const weekday = t => fWeekday.format(new Date(t));
  const monthDay = t => fMonthDay.format(new Date(t));
  const localHour = t => parseInt(fH24.format(new Date(t)), 10) % 24;
  // Minutes after local midnight, read from the zone's own clock: some zones
  // (India, Nepal) are not a whole hour from UTC, so UTC minutes would be wrong.
  const localMinutes = t => {
    let h = 0, m = 0;
    for (const p of fClock.formatToParts(new Date(t))) {
      if (p.type === 'hour') h = parseInt(p.value, 10) % 24;
      else if (p.type === 'minute') m = parseInt(p.value, 10);
    }
    return h * 60 + m;
  };
  // The space before AM or PM is a no-break space (U+00A0).
  const hm = t => fTime.format(new Date(t)).replace(':00', '').replace(/\s(AM|PM)$/, '\u00a0$1');
  // "6a", "12p": compact hour labels for chart axes
  const hShort = t => hm(t).replace(/:\d\d/, '').replace(' AM', 'a').replace(' PM', 'p');
  const dayWord = (t, lower) => {
    const k = dayKey(t);
    if (k === dayKey(Date.now())) return lower ? 'today' : 'Today';
    if (k === dayKey(Date.now() + 24 * HOUR)) return lower ? 'tomorrow' : 'Tomorrow';
    return weekday(t);
  };
  const whenText = (t, lower) => {
    const w = dayWord(t, lower);
    return (w === 'today' || w === 'Today') ? hm(t) : `${w} ${hm(t)}`;
  };

  const f = { tz, dayKey, weekday, monthDay, localHour, localMinutes, hm, hShort, fDayLong, dayWord, whenText };
  zones.set(id, f);
  return f;
}

// The zone the screens show. These are live bindings: setZone() swaps them and
// every importer sees the new zone.
export let dayKey, weekday, monthDay, localHour, localMinutes, hm, hShort, fDayLong, dayWord, whenText;
export function setZone(tz) {
  ({ dayKey, weekday, monthDay, localHour, localMinutes, hm, hShort, fDayLong, dayWord, whenText } = zoneFormat(tz));
}

export const r0 = v => (v == null || isNaN(v)) ? null : Math.round(v);
export const fmtInt = v => Math.round(v).toLocaleString('en-US');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CARD = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const card = d => (d == null || isNaN(d)) ? '--' : CARD[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
export const cToF = c => c * 9 / 5 + 32;

export function ago(t) {
  if (!t) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / MIN));
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`;
}
export function visText(m) {
  if (m == null) return '--';
  const mi = m / 1609.34;
  return mi >= 10 ? '10+ mi' : `${mi < 1 ? mi.toFixed(2) : mi.toFixed(1)} mi`;
}
export function rng(a, b, unit) {
  const x = r0(a), y = r0(b);
  return x === y ? `${y}${unit}` : `${x} to ${y}${unit}`;
}
// Lowercase the first letter only, so units like °F survive.
export const lowerFirst = s => (s ? s[0].toLowerCase() + s.slice(1) : s);

setZone('America/New_York');
