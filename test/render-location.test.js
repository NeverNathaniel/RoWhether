// What the render code takes from the location (08 14.2 P0.10): the course
// heading, the bank names, and the notes and names of the gauges, station and
// place. Putney's own banks, heading and gauges are the ones the old code wrote
// as literals, so the golden files cannot tell a line that still has them from
// one that reads the location. A place with other values can.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { HOUR, MIN } from '../src/config.js';
import { setZone } from '../src/format.js';
import { effectiveSettings, resolveLocation, sourceRow } from '../src/location.js';
import { PUTNEY, PUTNEY_RECORD, PUTNEY_WATERWAY } from '../src/putney.js';
import { app } from '../src/state.js';
import { buildModel } from '../src/logic.js';
import { renderNow } from '../src/render/now.js';
import { forecastPanel } from '../src/render/forecast.js';
import { compassSVG } from '../src/render/parts.js';
import * as wind from '../src/render/detail/wind.js';
import * as river from '../src/render/detail/river.js';
import * as temperature from '../src/render/detail/temperature.js';
import { shareText, initShare } from '../src/share.js';
import { installFakeDom, uninstallFakeDom } from './helpers/fakedom.js';
import { wx, T0 } from './helpers/forecast.js';

// A place on a lake: a course of 100 degrees, banks that are the north shore (NS)
// and the south shore (SS), and nothing that says Vermont, New Hampshire or the Connecticut.
const LAKE = resolveLocation({
  ...PUTNEY_RECORD, slug: 'lake-x', name: 'Lake X',
  course: { ...PUTNEY_RECORD.course, heading: 100, reachWord: 'lake' },
  banks: { word: 'shore', left: { short: 'NS', name: 'North' }, right: { short: 'SS', name: 'South' } }
}, { waterway: PUTNEY_WATERWAY });
const NO_BANKS = resolveLocation({ ...PUTNEY_RECORD, slug: 'lake-y', course: { ...PUTNEY_RECORD.course, heading: 100 }, banks: null }, { waterway: PUTNEY_WATERWAY });

// A place with its own gauges and station, its own words for the river, a flow
// in cubic metres a second, and a name. Putney's notes name Northfield, North
// Walpole and Keene, and its copy names the Bellows Falls dam.
const WEIR = resolveLocation({
  ...PUTNEY_RECORD, slug: 'weir-pool', name: 'Weir Pool',
  flow: { ...PUTNEY_RECORD.flow, unit: 'm3s' },
  copy: { ...PUTNEY_RECORD.copy, flowHow: 'The weir gauge sets the flow, <b>2 mi</b> up.', flowStats: 'Flow here is usually 40 m³/s.' },
  sources: [
    { role: 'alerts', adapter: 'nws-alerts', ref: 'point:42,-72', label: 'NWS' },
    { role: 'obs', adapter: 'nws-obs', ref: 'KABC', label: 'Airfield', note: 'The airfield, 3 mi north.' },
    { role: 'water_temp', mode: 'primary', adapter: 'usgs-ogc', ref: 'USGS-1', params: { parameterCode: '00010' }, unit: 'degC', label: 'Buoy', note: 'The buoy off the dock.' },
    { role: 'flow', mode: 'primary', priority: 0, adapter: 'usgs-ogc', ref: 'USGS-2', params: { parameterCode: '00060' }, unit: 'm3s', label: 'Weir', note: 'The weir gauge, 2 mi up.' },
    { role: 'flow_forecast', mode: 'primary', priority: 0, adapter: 'nwps', ref: 'XYZ', unit: 'm3s', label: 'Forecast' }
  ]
}, { waterway: PUTNEY_WATERWAY });
// The same place with rows that have no label and no note, and no copy.
const BARE = resolveLocation({
  ...WEIR, slug: 'bare-pool', copy: {},
  sources: WEIR.sources.obs.concat(WEIR.sources.river).concat(WEIR.sources.alerts).map(({ note, label, ...row }) => row)
}, { waterway: PUTNEY_WATERWAY });

// Noon Eastern on 15 June. The wind is across the course: from 190 degrees is 90
// to the right of 100 (the right bank), from 10 degrees is 90 to the left.
const NOW = T0 + 12 * HOUR;
const across = (i, t) => ({ wind: 8, gust: 10, dir: i % 2 ? 10 : 190 });

afterEach(() => {
  uninstallFakeDom();
  setZone('America/New_York');
  vi.useRealTimers();
});

// The screen as the app has it: a fake page, and the model of one place.
function screen(loc, now = NOW) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  const dom = installFakeDom({ width: 390 });
  const flow = Array.from({ length: 193 }, (_, i) => ({ t: now - 48 * HOUR + 7 * MIN + i * 15 * MIN, v: 5000 + i }));
  const river = { flow: { v: 6000, t: now }, waterC: { v: 20, t: now } };
  // The settings carry no heading, as app.settings does not: a reader of S.heading gets undefined.
  const S = effectiveSettings(loc);
  const obs = { t: now, tempF: 70, wind: 5, gust: 9, dir: 200, text: 'Clear' };
  const m = buildModel(loc, { wx: wx(across, 3, T0), river, flow, flowFcst: { issued: now, pts: Array.from({ length: 13 }, (_, i) => ({ t: now + i * 6 * HOUR, v: 7000 + i * 600 })) }, obs }, S, now);
  Object.assign(app, { loc, model: m, settings: S, data: m.data, errors: {} });
  return { dom, m };
}

const PUTNEY_TEXT = /Vermont|New Hampshire|\bVT\b|\bNH\b|Northfield|Walpole|Keene/;
const BROKEN = /undefined|NaN|\[object/;

describe('the compass takes the heading and the bank names', () => {
  it('writes the short names of the left and right banks and turns the river to the heading', () => {
    const svg = compassSVG(100, LAKE.banks, 190, 8);
    expect(svg).toContain('<text class="c-bank" x="-30" y="-24" text-anchor="middle">NS</text>');
    expect(svg).toContain('<text class="c-bank" x="30" y="-24" text-anchor="middle">SS</text>');
    expect(svg).toContain('<g transform="rotate(100)">');
    expect(svg).not.toMatch(/VT|NH/);
  });

  it("writes Putney's own VT and NH when given Putney's banks", () => {
    const svg = compassSVG(15, PUTNEY.banks, null, null);
    expect(svg).toContain('x="-30" y="-24" text-anchor="middle">VT</text>');
    expect(svg).toContain('x="30" y="-24" text-anchor="middle">NH</text>');
  });

  it('escapes a bank name and leaves the labels out of a place with no banks', () => {
    expect(compassSVG(0, { word: 'bank', left: { short: '<L>', name: 'Left' }, right: { short: '&R', name: 'Right' } }, null, null)).toContain('>&lt;L&gt;</text>');
    const svg = compassSVG(0, null, 90, 5);
    expect(svg).not.toContain('c-bank');
    expect(svg).toContain('c-wind');
  });
});

describe('On the water now takes the course from the location', () => {
  it('draws the compass and says the upstream heading of the place', () => {
    const { dom, m } = screen(LAKE);
    expect(m.daytime).toBe(true);
    renderNow();
    const compass = dom.el('compass').innerHTML;
    expect(compass).toContain('<g transform="rotate(100)">');
    expect(compass).toMatch(/x="-30" y="-24" text-anchor="middle">NS<\/text>/);
    expect(compass).toMatch(/x="30" y="-24" text-anchor="middle">SS<\/text>/);
    // Upstream heading 100, so the river runs 280 degrees, which is W.
    expect(dom.el('compassCap').textContent).toMatch(/^Wind from \w+\. River runs W, upstream heading 100°\.$/);
    expect(dom.el('compassCap').textContent).toContain('River runs W, upstream heading 100°.');
    expect(dom.el('compass').innerHTML + dom.el('compassCap').textContent).not.toMatch(BROKEN);
  });

  it("keeps Putney's heading of 15 and its banks", () => {
    const { dom } = screen(PUTNEY);
    renderNow();
    expect(dom.el('compassCap').textContent).toContain('River runs SSW, upstream heading 15°.');
    expect(dom.el('compass').innerHTML).toContain('>VT</text>');
  });

  it('names the bank the crosswind comes off, by the place', () => {
    const { dom } = screen(LAKE);
    renderNow();
    expect(dom.el('facts').textContent).toMatch(/Crosswind off the (North|South) shore\./);
  });
});

describe('a full forecast takes the course from the location', () => {
  it('draws the compass and the river line of the place', () => {
    const { m } = screen(LAKE);
    const p = m.days.flatMap(d => d.periods).find(x => !x.past);
    const html = forecastPanel(m, p);
    expect(html).toContain('<g transform="rotate(100)">');
    expect(html).toContain('x="-30" y="-24" text-anchor="middle">NS</text>');
    expect(html).toContain('x="30" y="-24" text-anchor="middle">SS</text>');
    expect(html).toContain('River runs W, upstream heading 100°.');
    expect(html).not.toMatch(BROKEN);
    expect(html).not.toMatch(/VT|NH/);
  });
});

describe('the Wind view takes the course from the location', () => {
  it('says "Cross" with the short name of the bank the wind comes off, in the hour table', () => {
    const { m } = screen(LAKE);
    const html = wind.render(m).html;
    // From 190 (S) is 90 degrees to the right of 100, the right bank. From 10 (N) is the left bank.
    expect(html).toContain('<td>S</td><td>Cross, SS</td>');
    expect(html).toContain('<td>N</td><td>Cross, NS</td>');
    expect(html).not.toContain('<td>S</td><td>Cross, NS</td>');
    expect(html).not.toContain('<td>N</td><td>Cross, SS</td>');
    expect(html).not.toMatch(/Cross, (VT|NH)/);
  });

  it('escapes the short name of a bank in the table', () => {
    const { m } = screen(resolveLocation({ ...PUTNEY_RECORD, course: { ...PUTNEY_RECORD.course, heading: 100 },
      banks: { word: 'bank', left: { short: '<N>', name: 'North' }, right: { short: '&S', name: 'South' } } }, { waterway: PUTNEY_WATERWAY }));
    const html = wind.render(m).html;
    expect(html).toContain('<td>Cross, &amp;S</td>');
    expect(html).toContain('<td>Cross, &lt;N&gt;</td>');
  });

  it('says only "Cross" where the place has no banks', () => {
    const { m } = screen(NO_BANKS);
    const html = wind.render(m).html;
    expect(html).toContain('<td>Cross</td>');
    expect(html).not.toMatch(/Cross, /);
  });

  it('states the heading of the place in How this works and turns the arrows by it', () => {
    const { m } = screen(LAKE);
    const html = wind.render(m).html;
    expect(html).toContain('The course heading is 100°, set in Settings.');
    // Wind from 190 against a course of 100 is 90 degrees to the right on the page.
    expect(html).toContain('<g transform="rotate(90)"><line class="carrow"');
    expect(html).toContain('<g transform="rotate(-90)"><line class="carrow"');
    expect(html).not.toMatch(BROKEN);
  });

  it('draws nothing of Putney for a place that is not Putney', () => {
    const { m } = screen(LAKE);
    expect(wind.render(m).html).not.toMatch(PUTNEY_TEXT);
  });
});

describe('the notes name the gauges and the station of the place', () => {
  it('finds the stored row of a role, whichever slot it fills', () => {
    expect(sourceRow(WEIR, 'obs')).toMatchObject({ ref: 'KABC', label: 'Airfield' });
    expect(sourceRow(WEIR, 'water_temp')).toMatchObject({ ref: 'USGS-1', label: 'Buoy' });
    expect(sourceRow(WEIR, 'flow')).toMatchObject({ ref: 'USGS-2', note: 'The weir gauge, 2 mi up.' });
    expect(sourceRow(WEIR, 'tide')).toBeNull();
    // Putney's flow row comes from the waterway, and its temperature row from the location.
    expect(sourceRow(PUTNEY, 'flow').label).toBe('North Walpole');
    expect(sourceRow(PUTNEY, 'water_temp').label).toBe('Northfield');
  });

  it("On the water now says what the place's rows say, and the age", () => {
    const { dom } = screen(WEIR);
    renderNow();
    const facts = dom.el('facts').textContent;
    expect(facts).toContain('Measured at Airfield');
    expect(facts).toMatch(/The airfield, 3 mi north\. Just now\./);
    expect(facts).toMatch(/The buoy off the dock\. Just now\./);
    expect(facts).toMatch(/The weir gauge, 2 mi up\. Just now\./);
    expect(facts).toContain('6,000 m³/s');
    expect(facts).not.toMatch(/\d cfs/);
    expect(facts).not.toMatch(PUTNEY_TEXT);
    expect(facts).not.toMatch(BROKEN);
  });

  it("still says Putney's own words at Putney", () => {
    const { dom } = screen(PUTNEY);
    renderNow();
    const facts = dom.el('facts').textContent;
    expect(facts).toContain('6,000 cfs');
    expect(facts).toContain('Measured at Keene');
    expect(facts).toContain('Keene airport, 14 mi east. A check on the model. Just now.');
    expect(facts).toContain('Nearest main-stem gauge, near Northfield, MA, about 19 mi downstream. Just now.');
    expect(facts).toContain('North Walpole gauge below Bellows Falls dam, about 16 river miles upstream. Just now.');
  });

  it('gives only the age where a row has no note, and a plain name where it has no label', () => {
    const { dom } = screen(BARE);
    renderNow();
    const facts = dom.el('facts').textContent;
    expect(facts).toContain('Measured at the station');
    expect(facts).not.toMatch(BROKEN);
    expect(facts).not.toMatch(PUTNEY_TEXT);
  });

  it('puts the water gauge note in the Temperature view', () => {
    const { m } = screen(WEIR);
    const html = temperature.render(m).html;
    expect(html).toContain('The buoy off the dock. Just now.');
    expect(html).not.toMatch(PUTNEY_TEXT);
    expect(temperature.render(screen(PUTNEY).m).html).toContain('Nearest main-stem gauge, near Northfield, MA, about 19 mi downstream. Just now.');
  });
});

describe('the River view and the forecasts take flow and words from the place', () => {
  it('writes the flow, the forecast and the tables in the unit of the gauge', () => {
    const { m } = screen(WEIR);
    const html = river.render(m).html;
    // The forecast starts at 7,000 and climbs 600 every 6 hours, so it is rounded to the hundred and rises.
    expect(river.summary(m).text).toMatch(/^6,000 m³\/s now\. Forecast to rise to about 14,200 m³\/s by /);
    expect(html).toContain('6,000 m³/s');
    expect(html).toMatch(/NWS forecast peak<\/dt><dd><div class="val">14,200 m³\/s</);
    expect(html).toMatch(/<td>7,000 m³\/s<\/td>/);
    expect(html).toMatch(/Your settings<\/dt><dd><div class="val">20,000 m³\/s</);
    expect(html).toMatch(/about 7,600 m³\/s, NWS forecast\./);
    expect(html).toMatch(/: 5,\d{3} m³\/s, measured\./);
    // No number is left with cfs after it. The axis titles are P0.12's.
    expect(html).not.toMatch(/\d cfs/);
    expect(river.summary(m).text).not.toMatch(/cfs/);
    expect(html).not.toMatch(BROKEN);
  });

  it("writes Putney's flow in cfs", () => {
    const { m } = screen(PUTNEY);
    expect(river.summary(m).text).toMatch(/^6,000 cfs now\. Forecast to rise to about 14,200 cfs by /);
    expect(river.render(m).html).toContain('6,000 cfs');
    expect(river.render(m).html).toMatch(/<td>7,000 cfs<\/td>/);
  });

  it('puts the place\'s own paragraphs in How this works, escaped, and none of Putney\'s', () => {
    const { m } = screen(WEIR);
    const html = river.render(m).html;
    expect(html).toContain('<p>The weir gauge sets the flow, &lt;b&gt;2 mi&lt;/b&gt; up.</p>');
    expect(html).toContain('<p>Flow here is usually 40 m³/s.</p>');
    expect(html).not.toMatch(/Walpole|Bellows|6,900/);
  });

  it("keeps Putney's paragraphs at Putney", () => {
    const html = river.render(screen(PUTNEY).m).html;
    expect(html).toContain('<p>Flow is measured at the USGS gauge at North Walpole, below the Bellows Falls dam, about 16 river miles upstream of the dock. The forecast is from the NWS Northeast River Forecast Center for the same gauge, in 6-hour steps.</p>');
    expect(html).toContain('<p>Since 2016 the median day is about 6,900 cfs. 20,000 is roughly the top 10% of days, 28,000 the top 5%.</p>');
  });

  it('leaves out a paragraph the place has no words for', () => {
    const html = river.render(screen(BARE).m).html;
    const how = html.slice(html.indexOf('<div class="panel how">'));
    expect(how.match(/<p>/g)).toHaveLength(1);
    expect(how).toContain('<p>The latest measured flow');
    expect(html).not.toMatch(BROKEN);
  });

  it('writes the flow in a full forecast in the unit of the gauge', () => {
    const { m } = screen(WEIR);
    const p = m.days.flatMap(d => d.periods).find(x => !x.past);
    const html = forecastPanel(m, p);
    expect(html).toMatch(/6,000 m³\/s <svg class="spark"/);
    expect(html).toMatch(/NWS forecast for this period: about [\d,]+00 m³\/s\./);
    expect(html).not.toMatch(/\d cfs/);
  });
});

describe('Share this forecast names the place', () => {
  it('starts the text with the name and time of the place', () => {
    screen(WEIR);
    expect(shareText(NOW)).toMatch(/^Weir Pool rowing, 12\u00a0PM: /);
    screen(PUTNEY);
    expect(shareText(NOW)).toMatch(/^Putney Landing rowing, 12\u00a0PM: /);
  });

  it('titles the share sheet with the name of the place', async () => {
    const { dom } = screen(WEIR);
    let click;
    dom.el('shareBtn').addEventListener = (type, fn) => { click = fn; };
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { share });
    app.info = null;
    try {
      initShare();
      await click();
    } finally { vi.unstubAllGlobals(); }
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0]).toMatchObject({ title: 'Weir Pool rowing forecast', url: 'https://rowhether.com/' });
    expect(share.mock.calls[0][0].text).toMatch(/^Weir Pool rowing, /);
  });
});
