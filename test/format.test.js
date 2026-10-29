import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { zoneFormat, setZone, hm, dayKey, localMinutes, fmtFlow, fmtInt, addDays } from '../src/format.js';
import { PUTNEY_FILE } from './helpers/putney-file.js';

const NY = 'America/New_York';
const HOUR = 3600e3;
const MIN = 60e3;

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

  // Written out, not computed: both clock changes in New York (2026-03-08 07:00 UTC
  // and 2026-11-01 06:00 UTC), on each side, the last second of local days, and
  // an ordinary day. The no-break space before AM and PM is written as an escape.
  const AT = [
    ['2026-03-08T04:59:59Z', '2026-03-07', 'Sat', 'Mar 7', 23, '11:59\u00a0PM', '11\u00a0PM'],
    ['2026-03-08T06:59:59Z', '2026-03-08', 'Sun', 'Mar 8', 1, '1:59\u00a0AM', '1\u00a0AM'],
    ['2026-03-08T07:00:00Z', '2026-03-08', 'Sun', 'Mar 8', 3, '3\u00a0AM', '3\u00a0AM'],
    ['2026-06-15T16:00:00Z', '2026-06-15', 'Mon', 'Jun 15', 12, '12\u00a0PM', '12\u00a0PM'],
    ['2026-08-20T09:45:30.500Z', '2026-08-20', 'Thu', 'Aug 20', 5, '5:45\u00a0AM', '5\u00a0AM'],
    ['2026-11-01T04:00:00Z', '2026-11-01', 'Sun', 'Nov 1', 0, '12\u00a0AM', '12\u00a0AM'],
    ['2026-11-01T05:30:00Z', '2026-11-01', 'Sun', 'Nov 1', 1, '1:30\u00a0AM', '1\u00a0AM'],
    ['2026-11-01T06:30:00Z', '2026-11-01', 'Sun', 'Nov 1', 1, '1:30\u00a0AM', '1\u00a0AM'],
    ['2026-12-31T04:59:59Z', '2026-12-30', 'Wed', 'Dec 30', 23, '11:59\u00a0PM', '11\u00a0PM'],
    ['2026-12-31T05:00:00Z', '2026-12-31', 'Thu', 'Dec 31', 0, '12\u00a0AM', '12\u00a0AM']
  ];

  it.each(AT)('writes the day, hour and times at %s, around both clock changes', (iso, key, weekday, monthDay, hour, time, short) => {
    const t = Date.parse(iso);
    expect([z.dayKey(t), z.weekday(t), z.monthDay(t), z.localHour(t), z.hm(t), z.hShort(t)]).toEqual([key, weekday, monthDay, hour, time, short]);
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

// A date key stepped by the calendar. A local day can be 23 or 25 hours long, so a day is never 24 hours (08 9.3).
describe('addDays', () => {
  it('steps a date key across a month, a year and a leap day', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDays('2026-01-31', 30)).toBe('2026-03-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-06-15', 0)).toBe('2026-06-15');
    expect(addDays('2026-06-15', 365)).toBe('2027-06-15');
  });

  // Written out on the dates the clocks change in four zones. npm test runs in Pacific/Auckland, where the clocks
  // went back on 2026-04-05: a step that adds 24 hours to local midnight lands on the 23:00 of the same date.
  it.each(['2026-03-07', '2026-03-08', '2026-04-04', '2026-04-05', '2026-09-26', '2026-09-27', '2026-10-03', '2026-10-04', '2026-10-31', '2026-11-01'])(
    'gives the next date after %s, whatever the length of the day', key => {
      const next = { '2026-03-07': '2026-03-08', '2026-03-08': '2026-03-09', '2026-04-04': '2026-04-05', '2026-04-05': '2026-04-06', '2026-09-26': '2026-09-27', '2026-09-27': '2026-09-28', '2026-10-03': '2026-10-04', '2026-10-04': '2026-10-05', '2026-10-31': '2026-11-01', '2026-11-01': '2026-11-02' };
      expect(addDays(key, 1)).toBe(next[key]);
      expect(addDays(next[key], -1)).toBe(key);
    });
});

// "Today" and "Tomorrow" count local dates. Adding 24 hours to now names the wrong day in the hour before the
// clocks go forward (it skips a day) and the first hour of the day they go back (it stays on the day): the
// 23 and 25 hour days of 08 9.4.
describe('the day words across a clock change', () => {
  afterEach(() => vi.useRealTimers());
  // Tomorrow found by walking the clock to the first instant on another date and going six hours into that day,
  // so it uses no date arithmetic and no length of a day.
  const into = (f, t) => { let u = t; while (f.dayKey(u) === f.dayKey(t)) u += 15 * MIN; return u + 6 * HOUR; };
  const words = (tz, now) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    const f = zoneFormat(tz), tomorrow = into(f, now), after = into(f, tomorrow);
    return [f.dayWord(now), f.dayWord(tomorrow), f.dayWord(after) === f.weekday(after), f.dayWord(tomorrow, true)];
  };

  // The plan's three instants, 23:30 local, and the two hours the old line named the wrong day. Written out.
  it.each([
    ['23:30 on 2026-10-31', '2026-11-01T03:30:00Z', 'Mon'],
    ['23:30 on 2026-11-01, the 25 hour day', '2026-11-02T04:30:00Z', 'Tue'],
    ['23:30 on 2026-03-08, the 23 hour day', '2026-03-09T03:30:00Z', 'Tue'],
    ['23:30 on 2026-03-07, the night the clocks go forward', '2026-03-08T04:30:00Z', 'Mon'],
    ['00:30 on 2026-11-01, the night they go back', '2026-11-01T04:30:00Z', 'Tue']
  ])('says Tomorrow for the next local date at %s', (_, iso, dayAfter) => {
    const now = Date.parse(iso);
    expect(words(NY, now)).toEqual(['Today', 'Tomorrow', true, 'tomorrow']);
    vi.setSystemTime(now);
    // The date after tomorrow is a weekday, and tomorrow's own time carries the word.
    const f = zoneFormat(NY), after = into(f, into(f, now));
    expect(f.dayWord(after)).toBe(dayAfter);
    expect(f.whenText(into(f, now), true)).toMatch(/^tomorrow \d/);
    expect(f.whenText(now)).not.toMatch(/Today|tomorrow/i);
  });

  it('names the two nights by their dates, not by hours', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const f = zoneFormat(NY);
    // 11:30 PM on Sat 7 March. Sun 8 March is tomorrow (a 23 hour day) and Mon 9 March is not.
    vi.setSystemTime(Date.parse('2026-03-08T04:30:00Z'));
    expect([f.dayWord(Date.parse('2026-03-08T16:00:00Z')), f.dayWord(Date.parse('2026-03-09T16:00:00Z'))]).toEqual(['Tomorrow', 'Mon']);
    // 12:30 AM on Sun 1 November, the first hour of a 25 hour day. Mon 2 November is tomorrow, and Sun is today.
    vi.setSystemTime(Date.parse('2026-11-01T04:30:00Z'));
    expect([f.dayWord(Date.parse('2026-11-01T17:00:00Z')), f.dayWord(Date.parse('2026-11-02T17:00:00Z')), f.dayWord(Date.parse('2026-11-03T17:00:00Z'))]).toEqual(['Today', 'Tomorrow', 'Tue']);
  });

  // Every quarter hour for three days either side of each change in the zones of 08 9.4, whole and half hour.
  it.each([
    [NY, '2026-03-08T07:00:00Z'], [NY, '2026-11-01T06:00:00Z'],
    ['Australia/Sydney', '2026-04-04T16:00:00Z'], ['Australia/Sydney', '2026-10-03T16:00:00Z'],
    ['Australia/Adelaide', '2026-04-04T16:30:00Z'], ['Australia/Adelaide', '2026-10-03T16:30:00Z'],
    ['America/St_Johns', '2026-03-08T05:30:00Z'], ['America/St_Johns', '2026-11-01T04:30:00Z'],
    ['Pacific/Auckland', '2026-04-04T14:00:00Z'], ['Pacific/Auckland', '2026-09-26T14:00:00Z'],
    ['Asia/Kolkata', '2026-06-15T00:00:00Z']
  ])('reads Today and Tomorrow right at every quarter hour around the change in %s at %s', (tz, iso) => {
    const centre = Date.parse(iso);
    for (let t = centre - 3 * 24 * HOUR; t <= centre + 3 * 24 * HOUR; t += 15 * MIN) {
      expect(words(tz, t), `${tz} at ${new Date(t).toISOString()}`).toEqual(['Today', 'Tomorrow', true, 'tomorrow']);
    }
  });
});

// dayKey and localHour remember their answers by instant (FD2). Intl is asked
// once for an instant, the answer is right for every instant (a zone that is
// not a whole hour from UTC makes the hour a poor key), each zone keeps its own,
// and the memory stays bounded.
describe('the memory of dayKey and localHour', () => {
  // Kathmandu is 5:45 ahead of UTC. A zone no other test uses, so nothing in it
  // is remembered yet.
  const KTM = 'Asia/Kathmandu';
  const fKtmKey = new Intl.DateTimeFormat('en-CA', { timeZone: KTM, year: 'numeric', month: '2-digit', day: '2-digit' });
  const fKtmHour = new Intl.DateTimeFormat('en-US', { timeZone: KTM, hour: 'numeric', hourCycle: 'h23' });
  const keyAt = t => fKtmKey.format(new Date(t));
  const hourAt = t => parseInt(fKtmHour.format(new Date(t)), 10) % 24;
  // Counts the reads of Intl's `format`, one for each formatted instant.
  const asks = () => vi.spyOn(Intl.DateTimeFormat.prototype, 'format', 'get');

  it('asks Intl once for an instant and gives the same answer after', () => {
    const z = zoneFormat(KTM);
    const spy = asks();
    const t = Date.UTC(2026, 5, 15, 18, 20); // 12:05 AM on the 16th in Kathmandu: the hour is 0
    expect([z.dayKey(t), z.localHour(t)]).toEqual(['2026-06-16', 0]);
    expect(spy).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 20; i++) expect([z.dayKey(t), z.localHour(t)]).toEqual(['2026-06-16', 0]);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('is right at every quarter hour across three days, the first time and the second', () => {
    const z = zoneFormat(KTM);
    const start = Date.UTC(2026, 5, 14, 12);
    const ts = Array.from({ length: 3 * 96 }, (_, i) => start + i * 15 * MIN);
    for (let pass = 0; pass < 2; pass++) {
      for (const t of ts) {
        expect(z.dayKey(t), `dayKey at ${new Date(t).toISOString()}`).toBe(keyAt(t));
        expect(z.localHour(t), `localHour at ${new Date(t).toISOString()}`).toBe(hourAt(t));
      }
    }
    // The last second of the 15th and the first of the 16th share a UTC hour.
    const last = Date.UTC(2026, 5, 15, 18, 14, 59), first = Date.UTC(2026, 5, 15, 18, 15, 0);
    expect([z.dayKey(last), z.localHour(last), z.dayKey(first), z.localHour(first)]).toEqual(['2026-06-15', 23, '2026-06-16', 0]);
  });

  it('keeps one memory for each zone', () => {
    const t = Date.UTC(2026, 5, 15, 12, 30);
    const [k, a, n] = [zoneFormat(KTM), zoneFormat('Pacific/Auckland'), zoneFormat(NY)];
    for (let pass = 0; pass < 2; pass++) {
      expect([k.dayKey(t), a.dayKey(t), n.dayKey(t)]).toEqual(['2026-06-15', '2026-06-16', '2026-06-15']);
      expect([k.localHour(t), a.localHour(t), n.localHour(t)]).toEqual([18, 0, 8]);
    }
  });

  it('stays bounded: an instant asked 12,000 instants ago is asked of Intl again', () => {
    const z = zoneFormat('Asia/Kolkata');
    const first = Date.UTC(2026, 0, 1);
    const at = i => first + i * 15 * MIN;
    for (let i = 0; i < 12000; i++) z.dayKey(at(i));
    const spy = asks();
    for (let i = 11900; i < 12000; i++) z.dayKey(at(i)); // the latest are still remembered
    expect(spy).toHaveBeenCalledTimes(0);
    for (let i = 0; i < 100; i++) expect(z.dayKey(at(i))).toBe(new Date(at(i) + 5.5 * HOUR).toISOString().slice(0, 10));
    expect(spy).toHaveBeenCalledTimes(100);
    spy.mockRestore();
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
});

describe('a zone that is missing', () => {
  // Intl takes no zone as the device's own, so a misspelled name would work
  // wherever the device is in New York and nowhere else (review Z11).
  it('throws, for zoneFormat and for setZone', () => {
    for (const tz of [undefined, null, '']) {
      expect(() => zoneFormat(tz), String(tz)).toThrow(/time zone/);
      expect(() => setZone(tz), String(tz)).toThrow(/time zone/);
    }
    expect(hm(Date.UTC(2026, 5, 15, 12))).toBe('8\u00a0AM');
  });
  it('throws for a name Intl does not know', () => {
    expect(() => zoneFormat('America/Putney')).toThrow(RangeError);
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

describe('the zone of the app', () => {
  // src/state.js sets it from the location it opens, so the screens and the
  // location agree. Putney is on New York time, so a record in another zone shows it.
  it('follows the location that is opened, and changes with the next one', async () => {
    vi.resetModules();
    const { app, openLocation } = await import('../src/state.js');
    const fresh = await import('../src/format.js');
    openLocation({ ...PUTNEY_FILE, tz: 'Asia/Kolkata' }, {});
    expect(app.loc.tz).toBe('Asia/Kolkata');
    expect(fresh.hm(Date.UTC(2026, 5, 15, 12, 0))).toBe('5:30\u00a0PM');
    openLocation(PUTNEY_FILE, {});
    expect(fresh.hm(Date.UTC(2026, 5, 15, 12, 0))).toBe('8\u00a0AM');
  });
});

describe('fmtFlow', () => {
  it('writes cubic feet a second as a whole number with a thousands separator', () => {
    expect(fmtFlow(20000, 'cfs')).toBe('20,000 cfs');
    expect(fmtFlow(6910.4, 'cfs')).toBe('6,910 cfs');
    expect(fmtFlow(0, 'cfs')).toBe('0 cfs');
  });

  it('is cfs when no unit is given, and for the number of every flow that fmtInt wrote before', () => {
    expect(fmtFlow(28000)).toBe('28,000 cfs');
    for (const v of [0, 1, 999.5, 5000, 20300, 123456.7]) expect(fmtFlow(v, 'cfs')).toBe(`${fmtInt(v)} cfs`);
  });

  it('writes a blank setting as zero, as fmtInt did', () => {
    expect(fmtFlow('', 'cfs')).toBe('0 cfs');
    expect(fmtFlow('', 'm3s')).toBe('0.00 m³/s');
  });

  it('writes cubic metres a second to the decimals of 01 15.6: none from 100, one from 10, two below', () => {
    expect(fmtFlow(120.4, 'm3s')).toBe('120 m³/s');
    expect(fmtFlow(100, 'm3s')).toBe('100 m³/s');
    expect(fmtFlow(1234.5, 'm3s')).toBe('1,235 m³/s');
    expect(fmtFlow(45.23, 'm3s')).toBe('45.2 m³/s');
    expect(fmtFlow(10, 'm3s')).toBe('10.0 m³/s');
    expect(fmtFlow(8.246, 'm3s')).toBe('8.25 m³/s');
    expect(fmtFlow(0, 'm3s')).toBe('0.00 m³/s');
  });

  it('writes a level in feet to one decimal and in metres to two', () => {
    expect(fmtFlow(8.24, 'ft')).toBe('8.2 ft');
    expect(fmtFlow(2.454, 'm')).toBe('2.45 m');
    expect(fmtFlow(12, 'm')).toBe('12.00 m');
  });
});

describe('the module', () => {
  it('imports only MIN from config, so src/location.js can import it without a cycle', () => {
    const src = readFileSync(new URL('../src/format.js', import.meta.url), 'utf8');
    expect(src.match(/^import .*$/gm)).toEqual(["import { MIN } from './config.js';"]);
  });
});
