// The header and the footer (phase 1 plan P1.5, 07 4.3, 6.1, 6.4, 6.7): the saved
// label with its day, the subtitle and the zone it names, the credits as links, the
// install sentence, the title's size class and the badge. Run in Pacific/Auckland,
// which is neither the dock's zone nor the viewer's in these cases, so a line that
// reads the machine's zone fails.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { linkText, setZone } from '../src/format.js';
import { app } from '../src/state.js';
import { PUTNEY, PUTNEY_RECORD } from '../src/putney.js';
import { resolveLocation } from '../src/location.js';
import { subtitleText, renderPlace, renderHeader, savedLabel } from '../src/render/header.js';
import { installFakeDom, uninstallFakeDom } from './helpers/fakedom.js';

const NY = 'America/New_York';
// Oct 22 2026 noon in New York (EDT, UTC-4), which is the week after New Zealand
// went to NZDT (UTC+13) and India is UTC+5:30 all year.
const OCT = Date.UTC(2026, 9, 22, 16);
// Mar 2 2026: New York on EST (UTC-5), and the two clock changes of March still ahead.
const MAR2 = Date.UTC(2026, 2, 2, 17);
// Mar 15 2026: New York on EDT again, New Zealand still on NZDT until Apr 5.
const MAR15 = Date.UTC(2026, 2, 15, 16);
// The plan's place, with a record's own words. Not a record the build reads.
const place = (over = {}) => resolveLocation({ ...PUTNEY_RECORD, ...over }, { waterway: { id: 'w', name: 'Charles River' } });

afterEach(() => {
  uninstallFakeDom();
  vi.useRealTimers();
  setZone(NY);
  Object.assign(app, { loc: null, updated: null, errors: {}, fromCache: false });
});

describe('linkText', () => {
  it('turns [text](https://...) into a link that opens in a new tab', () => {
    expect(linkText('From [Open-Meteo](https://open-meteo.com/) and [USGS](https://waterdata.usgs.gov/monitoring-location/USGS-01154500/).'))
      .toBe('From <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> and <a href="https://waterdata.usgs.gov/monitoring-location/USGS-01154500/" target="_blank" rel="noopener">USGS</a>.');
  });

  it('leaves every other kind of link as text', () => {
    expect(linkText('[a](javascript:alert(1))')).toBe('[a](javascript:alert(1))');
    expect(linkText('[a](http://example.com/)')).toBe('[a](http://example.com/)');
    expect(linkText('[a](//example.com/)')).toBe('[a](//example.com/)');
    expect(linkText('[a](data:text/html,x)')).toBe('[a](data:text/html,x)');
    expect(linkText('[a](HTTPS://example.com/)')).toBe('[a](HTTPS://example.com/)');
  });

  it('escapes the text, and the link text with it', () => {
    expect(linkText('<b>x</b> & "y"')).toBe('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;');
    expect(linkText('[<i>a</i>](https://example.com/)')).toBe('<a href="https://example.com/" target="_blank" rel="noopener">&lt;i&gt;a&lt;/i&gt;</a>');
  });

  it('cannot leave the href: a quote or a tag in the address is escaped or ends it', () => {
    const out = linkText('[a](https://x.com/"onmouseover="alert(1))');
    expect(out).not.toMatch(/ onmouseover=/);
    expect(out).toContain('href="https://x.com/&quot;onmouseover=&quot;alert(1"');
    expect(linkText('[a](https://x.com/<script>)')).toBe('<a href="https://x.com/&lt;script&gt;" target="_blank" rel="noopener">a</a>');
  });

  it('leaves text with no link as it is, and a missing text as nothing', () => {
    expect(linkText('Plain text, no links.')).toBe('Plain text, no links.');
    expect(linkText('[brackets] and (parentheses)')).toBe('[brackets] and (parentheses)');
    expect(linkText(null)).toBe('');
    expect(linkText(undefined)).toBe('');
  });
});

describe('subtitleText', () => {
  const sub = (loc, now, device) => subtitleText(loc, now, device);

  it("is today's line, exactly, for Putney on a device in New York", () => {
    expect(sub(PUTNEY, OCT, NY)).toBe('Connecticut River at the Putney Rowing Club docks. All times Eastern.');
    expect(sub(PUTNEY, MAR2, NY)).toBe('Connecticut River at the Putney Rowing Club docks. All times Eastern.');
  });

  it('adds how far ahead or behind the dock is, from the offsets at that time', () => {
    const end = 'Connecticut River at the Putney Rowing Club docks. All times Eastern';
    expect(sub(PUTNEY, OCT, 'America/Chicago')).toBe(`${end}, 1 hour ahead of you.`);
    expect(sub(PUTNEY, OCT, 'America/Los_Angeles')).toBe(`${end}, 3 hours ahead of you.`);
    expect(sub(PUTNEY, OCT, 'Asia/Kolkata')).toBe(`${end}, 9 hours 30 minutes behind you.`);
    expect(sub(PUTNEY, OCT, 'Pacific/Auckland')).toBe(`${end}, 17 hours behind you.`);
    expect(sub(PUTNEY, OCT, 'UTC')).toBe(`${end}, 4 hours behind you.`);
    // The offsets are read at `now`: New York is on EST here and on EDT in the next case.
    expect(sub(PUTNEY, MAR2, 'Pacific/Auckland')).toBe(`${end}, 18 hours behind you.`);
    expect(sub(PUTNEY, MAR15, 'Pacific/Auckland')).toBe(`${end}, 17 hours behind you.`);
  });

  it('says nothing for a device on another zone name with the same offset', () => {
    expect(sub(PUTNEY, OCT, 'America/Toronto')).toBe('Connecticut River at the Putney Rowing Club docks. All times Eastern.');
    expect(sub(PUTNEY, OCT, '')).toBe('Connecticut River at the Putney Rowing Club docks. All times Eastern.');
  });

  it('never reads the machine zone, which these tests run in Pacific/Auckland', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Pacific/Auckland');
    expect(sub(PUTNEY, OCT, NY)).not.toContain('ahead');
    expect(sub(PUTNEY, OCT, NY)).not.toContain('behind');
  });

  it('counts a quarter hour and a half hour in minutes', () => {
    const kolkata = place({ subtitle: 'The ghat.', tz: 'Asia/Kolkata', tzLabel: 'India' });
    expect(sub(kolkata, OCT, 'Asia/Kathmandu')).toBe('The ghat. All times India, 15 minutes behind you.');
    expect(sub(kolkata, OCT, NY)).toBe('The ghat. All times India, 9 hours 30 minutes ahead of you.');
    const adelaide = place({ subtitle: 'The river.', tz: 'Australia/Adelaide', tzLabel: 'Adelaide' });
    expect(sub(adelaide, OCT, 'Australia/Brisbane')).toBe('The river. All times Adelaide, 30 minutes ahead of you.');
  });

  it("names a zone with no label by the zone's own word, without Time", () => {
    const la = place({ tz: 'America/Los_Angeles', tzLabel: null });
    expect(sub(la, OCT, 'America/Los_Angeles')).toBe('Connecticut River at the Putney Rowing Club docks. All times Pacific.');
    expect(sub(place({ tz: 'America/Chicago', tzLabel: null }), OCT, NY)).toBe('Connecticut River at the Putney Rowing Club docks. All times Central, 1 hour behind you.');
  });

  it("builds the line from the waterway and the locality when a record has no subtitle", () => {
    const rec = { subtitle: null, name: 'Magazine Beach', locality: 'Cambridge, MA' };
    expect(sub(place(rec), OCT, NY)).toBe('Charles River at Cambridge, MA. All times Eastern.');
    // The waterway is the location's own name: the locality alone.
    expect(sub(place({ ...rec, name: 'Charles River' }), OCT, NY)).toBe('Cambridge, MA. All times Eastern.');
    expect(sub(place({ ...rec, locality: null }), OCT, NY)).toBe('Charles River. All times Eastern.');
    expect(sub(place({ ...rec, locality: null, name: 'Charles River' }), OCT, NY)).toBe('Charles River. All times Eastern.');
    expect(sub(resolveLocation({ ...PUTNEY_RECORD, ...rec }), OCT, NY)).toBe('Cambridge, MA. All times Eastern.');
  });
});

describe('renderPlace', () => {
  function draw(loc, { tz = NY, now = OCT } = {}) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    app.deviceTz = tz;
    const dom = installFakeDom({ width: 390 });
    renderPlace(loc);
    return dom;
  }

  it('draws Putney: the name, the line, the credits with links, the install sentence and the page title', () => {
    const dom = draw(PUTNEY);
    expect(dom.el('locName').textContent).toBe('Putney Landing');
    expect(dom.el('sub').textContent).toBe('Connecticut River at the Putney Rowing Club docks. All times Eastern.');
    expect(dom.el('locBadges').hidden).toBe(true);
    expect(dom.el('installText').textContent).toBe('Add RoWhether to your home screen. It opens on Putney Landing in one tap.');
    expect(document.title).toBe('Putney Landing rowing conditions');
    const credits = dom.el('credits');
    expect(credits.hidden).toBe(false);
    expect(credits.innerHTML).toContain('<a href="https://www.weather.gov/aly/" target="_blank" rel="noopener">Albany</a> and <a href="https://www.weather.gov/gyx/" target="_blank" rel="noopener">Gray</a>');
    expect(credits.textContent).toContain('Alerts from the National Weather Service offices in Albany and Gray, and Keene observations from the National Weather Service.');
    expect(credits.innerHTML).not.toContain('[');
  });

  it("names the difference from the viewer's zone", () => {
    expect(draw(PUTNEY, { tz: 'America/Chicago' }).el('sub').textContent).toBe('Connecticut River at the Putney Rowing Club docks. All times Eastern, 1 hour ahead of you.');
  });

  it('steps the title down for a name over 18 characters', () => {
    const named = n => draw(place({ name: n })).el('title').extra.className;
    expect(named('A'.repeat(18))).toBe('');
    expect(named('A'.repeat(19))).toBe('long');
    expect(named('Putney Landing')).toBe('');
    expect(named('Thompson Boat Center')).toBe('long');
  });

  it('shows the badge for a published location and for no other', () => {
    expect(draw(place({ status: 'published' })).el('locBadges').hidden).toBe(false);
    expect(draw(place({ status: 'verified' })).el('locBadges').hidden).toBe(true);
    expect(draw(place({ status: 'draft' })).el('locBadges').hidden).toBe(true);
    expect(draw(place({ status: 'archived' })).el('locBadges').hidden).toBe(true);
  });

  it('draws the page of no location as RoWhether, with no line, badge or credits', () => {
    const dom = draw(null);
    expect(dom.el('locName').textContent).toBe('RoWhether');
    expect(dom.el('title').extra.className).toBe('');
    expect(dom.el('sub').textContent).toBe('');
    expect(dom.el('locBadges').hidden).toBe(true);
    expect(dom.el('credits').hidden).toBe(true);
    expect(dom.el('credits').innerHTML).toBe('');
    expect(dom.el('installText').textContent).toBe('Add RoWhether to your home screen. It opens full screen in one tap.');
    expect(document.title).toBe('RoWhether');
  });

  it('draws a location after one with a badge and a long name with neither left over', () => {
    const dom = draw(place({ status: 'published', name: 'Thompson Boat Center' }));
    expect(dom.el('locBadges').hidden).toBe(false);
    renderPlace(PUTNEY);
    expect(dom.el('locBadges').hidden).toBe(true);
    expect(dom.el('title').extra.className).toBe('');
    expect(dom.el('locName').textContent).toBe('Putney Landing');
  });

  it('leaves the credits hidden for a record with none, and escapes what they say', () => {
    expect(draw(place({ copy: { description: 'Rowing.' } })).el('credits').hidden).toBe(true);
    const dom = draw(place({ copy: { credits: 'From <b>NWS</b> [Open-Meteo](https://open-meteo.com/) [x](javascript:alert(1)).' } }));
    expect(dom.el('credits').innerHTML).toBe('From &lt;b&gt;NWS&lt;/b&gt; <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> [x](javascript:alert(1)).');
  });
});

// 6:41 AM in New York (EDT) on October `day` 2026, and `now` at noon on the 22nd.
const AM = day => Date.UTC(2026, 9, day, 10, 41);
const NBSP = '\u00a0';

describe('savedLabel', () => {
  it('says only the time for a copy from today, and the day for an earlier one', () => {
    expect(savedLabel(AM(22), OCT)).toBe(`Saved 6:41${NBSP}AM`);
    // Yesterday (a Wednesday) and the sixth day before (a Friday): the weekday.
    expect(savedLabel(AM(21), OCT)).toBe(`Saved Wed 6:41${NBSP}AM`);
    expect(savedLabel(AM(16), OCT)).toBe(`Saved Fri 6:41${NBSP}AM`);
    // The seventh day before would read as the same weekday as today: the date.
    expect(savedLabel(AM(15), OCT)).toBe(`Saved Oct 15, 6:41${NBSP}AM`);
    expect(savedLabel(AM(1), OCT)).toBe(`Saved Oct 1, 6:41${NBSP}AM`);
  });

  it('counts days in the location zone, not the machine zone or UTC', () => {
    // 11:30 PM on the 21st in New York is the 22nd in UTC and the 22nd in Auckland.
    const lateYesterday = Date.UTC(2026, 9, 22, 3, 30);
    const justAfterMidnight = Date.UTC(2026, 9, 22, 4, 15);
    expect(savedLabel(lateYesterday, justAfterMidnight)).toBe(`Saved Wed 11:30${NBSP}PM`);
    // The same two instants a quarter hour apart on one New York day.
    expect(savedLabel(Date.UTC(2026, 9, 22, 4, 5), justAfterMidnight)).toBe(`Saved 12:05${NBSP}AM`);
    // Seen from a location in Auckland the same two instants are on one day.
    setZone('Pacific/Auckland');
    expect(savedLabel(lateYesterday, justAfterMidnight)).toBe(`Saved 4:30${NBSP}PM`);
  });

  it('counts whole days across the clock change on Nov 1, 2026', () => {
    const now = Date.UTC(2026, 10, 2, 17); // Mon Nov 2, noon EST
    expect(savedLabel(Date.UTC(2026, 10, 1, 17), now)).toBe(`Saved Sun 12${NBSP}PM`);
    expect(savedLabel(Date.UTC(2026, 9, 31, 3, 30), now)).toBe(`Saved Fri 11:30${NBSP}PM`);
    expect(savedLabel(Date.UTC(2026, 9, 27, 16), now)).toBe(`Saved Tue 12${NBSP}PM`);
    expect(savedLabel(Date.UTC(2026, 9, 26, 16), now)).toBe(`Saved Oct 26, 12${NBSP}PM`);
  });

  it('takes a copy from a few minutes ahead of the clock as today', () => {
    expect(savedLabel(OCT + 5 * 60e3, OCT)).toBe(`Saved 12:05${NBSP}PM`);
  });
});

describe('renderHeader', () => {
  function draw(state, now = OCT) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    Object.assign(app, { updated: null, errors: {}, fromCache: false }, state);
    const dom = installFakeDom({ width: 390 });
    renderHeader();
    return dom.el('updated').textContent;
  }

  it('says Loading, Not loaded, Updated and Saved', () => {
    expect(draw({})).toBe('Loading');
    expect(draw({ errors: { wx: true } })).toBe('Not loaded');
    expect(draw({ updated: AM(22) })).toBe(`Updated 6:41${NBSP}AM`);
    expect(draw({ updated: AM(22), fromCache: true })).toBe(`Saved 6:41${NBSP}AM`);
    expect(draw({ updated: AM(22), errors: { wx: true } })).toBe(`Saved 6:41${NBSP}AM`);
    expect(draw({ updated: AM(20), fromCache: true })).toBe(`Saved Tue 6:41${NBSP}AM`);
    expect(draw({ updated: AM(10), errors: { wx: true } })).toBe(`Saved Oct 10, 6:41${NBSP}AM`);
  });

  it('says only Saved for another source failing, and keeps Updated without a day', () => {
    expect(draw({ updated: AM(22), errors: { river: true } })).toBe(`Updated 6:41${NBSP}AM`);
    // A fresh forecast is from today, but the label never carries a day.
    expect(draw({ updated: AM(21) })).toBe(`Updated 6:41${NBSP}AM`);
  });

  it('is the one the page draws: no other label says Saved data from', () => {
    for (const state of [{ updated: AM(22), fromCache: true }, { updated: AM(1), errors: { wx: true } }]) expect(draw(state)).not.toMatch(/data from/);
  });
});
