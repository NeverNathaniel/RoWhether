import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { zoneFormat, setZone, hm, dayKey, localMinutes } from '../src/format.js';

// The reference is today's formatters, pasted from src/format.js as it was
// before P0.4 (LOC.tz written out as the zone). After P0.4 the module's own
// exports come from zoneFormat, so they cannot be the reference.
const NY = 'America/New_York';
const HOUR = 3600e3;
const MIN = 60e3;
const fTime = new Intl.DateTimeFormat('en-US', { timeZone: NY, hour: 'numeric', minute: '2-digit' });
const fWeekday = new Intl.DateTimeFormat('en-US', { timeZone: NY, weekday: 'short' });
const fDayLong = new Intl.DateTimeFormat('en-US', { timeZone: NY, weekday: 'short', month: 'short', day: 'numeric' });
const fMonthDay = new Intl.DateTimeFormat('en-US', { timeZone: NY, month: 'short', day: 'numeric' });
const fKey = new Intl.DateTimeFormat('en-CA', { timeZone: NY, year: 'numeric', month: '2-digit', day: '2-digit' });
const fH24 = new Intl.DateTimeFormat('en-US', { timeZone: NY, hour: 'numeric', hourCycle: 'h23' });

const ref = {
  dayKey: t => fKey.format(new Date(t)),
  weekday: t => fWeekday.format(new Date(t)),
  monthDay: t => fMonthDay.format(new Date(t)),
  localHour: t => parseInt(fH24.format(new Date(t)), 10) % 24,
  // The replacement is a no-break space (U+00A0), written as an escape here.
  hm: t => fTime.format(new Date(t)).replace(':00', '').replace(/\s(AM|PM)$/, '\u00a0$1'),
  // Its patterns have a plain space, so with hm's no-break space it changes nothing but the minutes.
  hShort: t => ref.hm(t).replace(/:\d\d/, '').replace(' AM', 'a').replace(' PM', 'p'),
  dayWord(t, lower) {
    const k = ref.dayKey(t);
    if (k === ref.dayKey(Date.now())) return lower ? 'today' : 'Today';
    if (k === ref.dayKey(Date.now() + 24 * HOUR)) return lower ? 'tomorrow' : 'Tomorrow';
    return fWeekday.format(new Date(t));
  },
  whenText(t, lower) {
    const w = ref.dayWord(t, lower);
    return (w === 'today' || w === 'Today') ? ref.hm(t) : `${w} ${ref.hm(t)}`;
  },
  // The minutes helper in week.js and light.js before P0.4.
  clockMin: t => ref.localHour(t) * 60 + new Date(t).getUTCMinutes()
};

// 24 instants across 2026: both clock changes (2026-03-08 07:00 UTC, 2026-11-01
// 06:00 UTC) on each side, the last second of local days, and ordinary days.
const INSTANTS = [
  '2026-01-01T00:00:00Z', '2026-01-15T17:00:00Z', '2026-02-28T04:59:59Z',
  '2026-03-08T04:59:59Z', '2026-03-08T05:00:00Z', '2026-03-08T06:59:59Z', '2026-03-08T07:00:00Z', '2026-03-08T16:30:00Z', '2026-03-09T03:59:59Z',
  '2026-04-14T04:00:00Z', '2026-05-31T12:05:00Z', '2026-06-15T04:00:00Z', '2026-06-15T16:00:00Z', '2026-08-20T09:45:30.500Z', '2026-10-18T09:05:00Z',
  '2026-11-01T03:59:59Z', '2026-11-01T04:00:00Z', '2026-11-01T05:30:00Z', '2026-11-01T06:00:00Z', '2026-11-01T06:30:00Z', '2026-11-01T16:00:00Z', '2026-11-02T04:59:59Z',
  '2026-12-31T04:59:59Z', '2026-12-31T05:00:00Z'
].map(s => Date.parse(s));

afterEach(() => {
  vi.useRealTimers();
  setZone(NY);
});

describe('zoneFormat', () => {
  const z = zoneFormat(NY);

  it('returns the zone and every formatter the app uses', () => {
    expect(Object.keys(z).sort()).toEqual(['dayKey', 'dayWord', 'fDayLong', 'hShort', 'hm', 'localHour', 'localMinutes', 'monthDay', 'tz', 'weekday', 'whenText'].sort());
    expect(z.tz).toBe(NY);
  });

  it('has 24 instants, so the comparison below covers what 08 asks', () => {
    expect(INSTANTS).toHaveLength(24);
    expect(INSTANTS.every(Number.isFinite)).toBe(true);
  });

  it('equals the reference formatters at 24 instants, including both clock changes', () => {
    for (const t of INSTANTS) {
      for (const k of ['dayKey', 'weekday', 'monthDay', 'localHour', 'hm', 'hShort']) {
        expect(z[k](t), `${k} at ${new Date(t).toISOString()}`).toBe(ref[k](t));
      }
      expect(z.fDayLong.format(new Date(t))).toBe(fDayLong.format(new Date(t)));
      expect(z.localMinutes(t), `localMinutes at ${new Date(t).toISOString()}`).toBe(ref.clockMin(t));
    }
    expect(z.fDayLong.resolvedOptions().timeZone).toBe(NY);
  });

  it('gives the same day words and times as the reference for any day around "now"', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    for (const now of INSTANTS) {
      vi.setSystemTime(now);
      // Two days back to three ahead, so today, tomorrow and other days all occur.
      for (let d = -2; d <= 3; d++) {
        const t = now + d * 24 * HOUR;
        for (const lower of [undefined, false, true]) {
          const at = `${new Date(t).toISOString()} with now ${new Date(now).toISOString()}`;
          expect(z.dayWord(t, lower), `dayWord ${lower} at ${at}`).toBe(ref.dayWord(t, lower));
          expect(z.whenText(t, lower), `whenText ${lower} at ${at}`).toBe(ref.whenText(t, lower));
        }
      }
    }
  });

  it('is the same object for the same zone and a different one for another zone', () => {
    expect(zoneFormat(NY)).toBe(z);
    expect(zoneFormat('Asia/Kolkata')).not.toBe(z);
  });

  it('formats the day, hour and weekday in the zone it was made for', () => {
    const t = Date.UTC(2026, 5, 15, 12, 30); // 8:30 AM in New York, 6:00 PM in Kolkata
    const k = zoneFormat('Asia/Kolkata');
    expect([k.hm(t), k.hShort(t), k.localHour(t), k.dayKey(t), k.weekday(t), k.monthDay(t)]).toEqual(['6\u00a0PM', '6\u00a0PM', 18, '2026-06-15', 'Mon', 'Jun 15']);
    expect(z.hm(t)).toBe('8:30\u00a0AM');
    // Auckland is on the next date when New York is still on the 15th.
    const a = zoneFormat('Pacific/Auckland');
    expect([a.dayKey(t), z.dayKey(t)]).toEqual(['2026-06-16', '2026-06-15']);
  });

  it('decides today and tomorrow in the zone it was made for', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // Mon 12:00 in New York, Mon 9:30 PM in Kolkata, Tue 4:00 AM in Auckland.
    vi.setSystemTime(Date.UTC(2026, 5, 15, 16));
    const ny = z, kol = zoneFormat('Asia/Kolkata'), auk = zoneFormat('Pacific/Auckland');
    const t = Date.UTC(2026, 5, 15, 20); // Mon 4 PM, Tue 1:30 AM, Tue 8 AM
    expect([ny.dayWord(t), kol.dayWord(t), auk.dayWord(t)]).toEqual(['Today', 'Tomorrow', 'Today']);
    expect([ny.whenText(t, true), kol.whenText(t, true)]).toEqual(['4\u00a0PM', 'tomorrow 1:30\u00a0AM']);
    const u = Date.UTC(2026, 5, 15, 8); // Mon 4 AM, Mon 1:30 PM, Mon 8 PM
    expect([ny.dayWord(u), kol.dayWord(u), auk.dayWord(u)]).toEqual(['Today', 'Today', 'Mon']);
    expect(ny.whenText(t + 2 * 24 * HOUR)).toBe('Wed 4\u00a0PM');
  });
});

describe('localMinutes', () => {
  it('is the minutes after local midnight in a zone that is not a whole hour from UTC', () => {
    expect(zoneFormat('Asia/Kolkata').localMinutes(Date.UTC(2026, 5, 14, 19, 0))).toBe(30); // 00:30 on 15 June
    expect(zoneFormat('Asia/Kathmandu').localMinutes(Date.UTC(2026, 5, 14, 19, 0))).toBe(45); // 00:45 on 15 June
    expect(zoneFormat('Asia/Kathmandu').localMinutes(Date.UTC(2026, 5, 15, 0, 0))).toBe(345);
    expect(zoneFormat('America/St_Johns').localMinutes(Date.UTC(2026, 0, 15, 12, 0))).toBe(510); // -3:30
    // Adelaide is +10:30 in January and +9:30 in June.
    expect(zoneFormat('Australia/Adelaide').localMinutes(Date.UTC(2026, 0, 15, 0, 0))).toBe(630);
    expect(zoneFormat('Australia/Adelaide').localMinutes(Date.UTC(2026, 5, 15, 0, 0))).toBe(570);
  });

  it('is 0 at local midnight and 1439 a minute before it', () => {
    const z = zoneFormat(NY);
    expect(z.localMinutes(Date.UTC(2026, 5, 15, 4))).toBe(0);
    expect(z.localMinutes(Date.UTC(2026, 5, 15, 4) - MIN)).toBe(1439);
    expect(z.localMinutes(Date.UTC(2026, 5, 15, 16, 15))).toBe(12 * 60 + 15);
  });

  it('follows the clock across both changes in New York', () => {
    const z = zoneFormat(NY);
    expect(z.localMinutes(Date.UTC(2026, 2, 8, 6, 59))).toBe(119); // 1:59 EST
    expect(z.localMinutes(Date.UTC(2026, 2, 8, 7, 0))).toBe(180); // 3:00 EDT
    expect(z.localMinutes(Date.UTC(2026, 10, 1, 5, 30))).toBe(90); // 1:30 EDT
    expect(z.localMinutes(Date.UTC(2026, 10, 1, 6, 0))).toBe(60); // 1:00 EST, the second time
  });

  it('matches the minutes helper it replaces, every 15 minutes across both changes', () => {
    const z = zoneFormat(NY);
    for (const start of [Date.UTC(2026, 2, 7, 5), Date.UTC(2026, 9, 31, 4)]) {
      for (let t = start; t < start + 4 * 24 * HOUR; t += 15 * MIN) {
        expect(z.localMinutes(t), new Date(t).toISOString()).toBe(ref.clockMin(t));
      }
    }
  });
});

describe('setZone', () => {
  it('starts on America/New_York', () => {
    expect(hm(Date.UTC(2026, 5, 15, 12))).toBe('8\u00a0AM');
  });

  it('swaps what an importer of hm sees, and America/New_York restores it', () => {
    const t = Date.UTC(2026, 5, 15, 12, 0);
    setZone('Asia/Kolkata');
    expect(hm(t)).toBe('5:30\u00a0PM');
    expect(dayKey(Date.UTC(2026, 5, 15, 20))).toBe('2026-06-16');
    expect(localMinutes(t)).toBe(17 * 60 + 30);
    setZone('America/New_York');
    expect(hm(t)).toBe('8\u00a0AM');
    expect(dayKey(Date.UTC(2026, 5, 15, 20))).toBe('2026-06-15');
    expect(localMinutes(t)).toBe(8 * 60);
  });
});

describe('the module', () => {
  it('imports only HOUR and MIN from config, so src/location.js can import it without a cycle', () => {
    const src = readFileSync(new URL('../src/format.js', import.meta.url), 'utf8');
    expect(src.match(/^import .*$/gm)).toEqual(["import { HOUR, MIN } from './config.js';"]);
  });
});
