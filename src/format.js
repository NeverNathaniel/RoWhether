// Time, number and text formatting. All times display in America/New_York.
import { LOC, HOUR, MIN } from './config.js';

const fTime = new Intl.DateTimeFormat('en-US', { timeZone: LOC.tz, hour: 'numeric', minute: '2-digit' });
const fWeekday = new Intl.DateTimeFormat('en-US', { timeZone: LOC.tz, weekday: 'short' });
export const fDayLong = new Intl.DateTimeFormat('en-US', { timeZone: LOC.tz, weekday: 'short', month: 'short', day: 'numeric' });
const fKey = new Intl.DateTimeFormat('en-CA', { timeZone: LOC.tz, year: 'numeric', month: '2-digit', day: '2-digit' });
const fH24 = new Intl.DateTimeFormat('en-US', { timeZone: LOC.tz, hour: 'numeric', hourCycle: 'h23' });

export const dayKey = t => fKey.format(new Date(t));
export const localHour = t => parseInt(fH24.format(new Date(t)), 10) % 24;
export const hm = t => fTime.format(new Date(t)).replace(':00', '').replace(/\s(AM|PM)$/, ' $1');
export const r0 = v => (v == null || isNaN(v)) ? null : Math.round(v);
export const fmtInt = v => Math.round(v).toLocaleString('en-US');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CARD = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const card = d => (d == null || isNaN(d)) ? '--' : CARD[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
export const cToF = c => c * 9 / 5 + 32;

export function dayWord(t, lower) {
  const k = dayKey(t);
  if (k === dayKey(Date.now())) return lower ? 'today' : 'Today';
  if (k === dayKey(Date.now() + 24 * HOUR)) return lower ? 'tomorrow' : 'Tomorrow';
  return fWeekday.format(new Date(t));
}
export function whenText(t, lower) {
  const w = dayWord(t, lower);
  return (w === 'today' || w === 'Today') ? hm(t) : `${w} ${hm(t)}`;
}
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
