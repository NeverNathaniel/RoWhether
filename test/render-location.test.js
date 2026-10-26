// What the render code takes from the location (08 14.2 P0.10): the course
// heading, the bank names, and the notes and names of the gauges, station and
// place. Putney's own banks, heading and gauges are the ones the old code wrote
// as literals, so the golden files cannot tell a line that still has them from
// one that reads the location. A place with other values can.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { HOUR, MIN } from '../src/config.js';
import { setZone } from '../src/format.js';
import { effectiveSettings, resolveLocation, sourceRow } from '../src/location.js';
import { PUTNEY, PUTNEY_RECORD, PUTNEY_WATERWAY } from '../src/putney.js';
import { app } from '../src/state.js';
import { buildModel, still } from '../src/logic.js';
import { renderHero, renderNoData } from '../src/render/hero.js';
import * as fog from '../src/render/detail/fog.js';
import * as week from '../src/render/detail/week.js';
import { bindingsFor, staleSlots } from '../src/sources/index.js';
import { renderNow } from '../src/render/now.js';
import { forecastPanel } from '../src/render/forecast.js';
import { compassSVG, noWater } from '../src/render/parts.js';
import * as wind from '../src/render/detail/wind.js';
import * as tideView from '../src/render/detail/tide.js';
import { MODULES } from '../src/render/detail/views.js';
import { viewsFor } from '../src/render/detail/index.js';
import * as river from '../src/render/detail/river.js';
import * as temperature from '../src/render/detail/temperature.js';
import { shareText, initShare } from '../src/share.js';
import { renderPlace } from '../src/render/header.js';
import { installFakeDom, uninstallFakeDom } from './helpers/fakedom.js';
import { wx, T0, tide } from './helpers/forecast.js';

// A place on a lake: a course of 100 degrees, banks that are the north shore (NS)
// and the south shore (SS), and nothing that says Vermont, New Hampshire or the Connecticut.
const LAKE = resolveLocation({
  ...PUTNEY_RECORD, slug: 'lake-x', name: 'Lake X',
  course: { ...PUTNEY_RECORD.course, heading: 100, reachWord: 'lake' },
  banks: { word: 'shore', left: { short: 'NS', name: 'North' }, right: { short: 'SS', name: 'South' } }
}, { waterway: PUTNEY_WATERWAY });
// A record with no banks has them generated from its heading (P1.11), so a place with none is one taken off after.
const NO_BANKS = { ...resolveLocation({ ...PUTNEY_RECORD, slug: 'lake-y', course: { ...PUTNEY_RECORD.course, heading: 100 }, banks: null }, { waterway: PUTNEY_WATERWAY }), banks: null };

// A place on still water with the water it is given, a course of 166 degrees and banks made from it.
const still1 = water => resolveLocation({
  ...PUTNEY_RECORD, slug: 'still-x', waterType: 'lake', flow: null, sources: PUTNEY_RECORD.sources.filter(x => x.role === 'alerts'),
  course: { kind: 'heading', heading: 166, reachWord: null, confirmed: false }, banks: null, water: { mode: 'fetch', ...water }
});

// A place with its own gauges and station, its own words for the river, a flow
// in cubic metres a second, and a name. Putney's notes name Northfield, North
// Walpole and Keene, and its copy names the Bellows Falls dam.
const WEIR = resolveLocation({
  ...PUTNEY_RECORD, slug: 'weir-pool', name: 'Weir Pool',
  flow: { ...PUTNEY_RECORD.flow, unit: 'm3s' },
  // Putney's limits, set for this place's gauge (P1.10): a basis for another gauge would drop them.
  thresholds: { ...PUTNEY_RECORD.thresholds, basis: { flow: 'usgs-ogc:USGS-2:m3s' } },
  copy: { ...PUTNEY_RECORD.copy, flowHow: 'The weir gauge sets the flow, <b>2 mi</b> up.', flowStats: 'Flow here is usually 40 m³/s.' },
  sources: [
    { role: 'alerts', adapter: 'nws-alerts', ref: 'point:42,-72', label: 'NWS' },
    { role: 'obs', adapter: 'nws-obs', ref: 'KABC', label: 'Airfield', note: 'The airfield, 3 mi north.' },
    { role: 'water_temp', mode: 'primary', adapter: 'usgs-ogc', ref: 'USGS-1', params: { parameterCode: '00010' }, unit: 'degC', label: 'Buoy', note: 'The buoy off the dock.' },
    { role: 'flow', mode: 'primary', priority: 0, adapter: 'usgs-ogc', ref: 'USGS-2', params: { parameterCode: '00060' }, unit: 'm3s', label: 'Weir', note: 'The weir gauge, 2 mi up.' },
    { role: 'flow_forecast', mode: 'primary', priority: 0, adapter: 'nwps', ref: 'XYZ', unit: 'm3s', label: 'Forecast' }
  ]
}, { waterway: PUTNEY_WATERWAY });
// A place with no flow record at all (a tidal bay, say): the flow numbers fall back to cfs.
const NO_FLOW = resolveLocation({ ...PUTNEY_RECORD, slug: 'bay-z', flow: null }, { waterway: PUTNEY_WATERWAY });
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
// `data` is added to the answers and `stale` is the map of sources past their limit (P1.9).
function screen(loc, now = NOW, { data = {}, stale } = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  const dom = installFakeDom({ width: 390 });
  const flow = Array.from({ length: 193 }, (_, i) => ({ t: now - 48 * HOUR + 7 * MIN + i * 15 * MIN, v: 5000 + i }));
  const river = { flow: { v: 6000, t: now }, waterC: { v: 20, t: now } };
  // The settings carry no heading, as app.settings does not: a reader of S.heading gets undefined.
  const S = effectiveSettings(loc);
  const obs = { t: now, tempF: 70, wind: 5, gust: 9, dir: 200, text: 'Clear' };
  // 30 daily means, 3,950 rising by 100 a day to 6,850, the last one the day before.
  const flowDays = Array.from({ length: 30 }, (_, i) => ({ t: now - (30 - i) * 24 * HOUR, v: 3950 + i * 100 }));
  const m = buildModel(loc, { wx: wx(across, 3, T0), river, flow, flowDays, flowFcst: { issued: now, pts: Array.from({ length: 13 }, (_, i) => ({ t: now + i * 6 * HOUR, v: 7000 + i * 600 })) }, obs, ...data }, S, now, { stale });
  // The viewer's device is in the place's zone, as the golden cases have it.
  Object.assign(app, { loc, model: m, settings: S, data: m.data, errors: {}, deviceTz: loc.tz });
  return { dom, m };
}

const PUTNEY_TEXT = /Vermont|New Hampshire|\bVT\b|\bNH\b|Northfield|Walpole|Keene/;
const BROKEN = /undefined|NaN|\[object/;

describe('the compass takes the heading and the bank names', () => {
  it('writes the short names of the left and right banks and turns the river to the heading', () => {
    const svg = compassSVG(100, LAKE.banks, 190, 8);
    expect(svg).toContain('<text class="c-bank" x="28.8" y="-25.4" text-anchor="middle">NS</text>');
    expect(svg).toContain('<text class="c-bank" x="18.4" y="33.7" text-anchor="middle">SS</text>');
    expect(svg).toContain('<g transform="rotate(100)">');
    expect(svg).not.toMatch(/VT|NH/);
  });

  it("writes Putney's own VT and NH when given Putney's banks, turned with the river", () => {
    const svg = compassSVG(15, PUTNEY.banks, null, null);
    expect(svg).toContain('x="-22.8" y="-30.9" text-anchor="middle">VT</text>');
    expect(svg).toContain('x="35.2" y="-15.4" text-anchor="middle">NH</text>');
  });

  // The labels sit 24 up and 30 out from the river bar, and the bar is turned by the heading, so each
  // label is that offset turned the same way (01 10.5). The text is never turned: it has no transform.
  const labels = svg => [...svg.matchAll(/<text class="c-bank" x="([^"]+)" y="([^"]+)"[^>]*>([^<]+)<\/text>/g)].map(m => [+m[1], +m[2], m[3]]);
  const pair = { word: 'bank', left: { short: 'L', name: 'Left' }, right: { short: 'R', name: 'Right' } };

  it('places each label at its offset turned by the heading, to one decimal', () => {
    // Worked out by hand: x' = x cos h - y sin h, y' = x sin h + y cos h, for (-30, -24) and (30, -24).
    expect(labels(compassSVG(0, pair))).toEqual([[-30, -24, 'L'], [30, -24, 'R']]);
    expect(labels(compassSVG(15, pair))).toEqual([[-22.8, -30.9, 'L'], [35.2, -15.4, 'R']]);
    expect(labels(compassSVG(90, pair))).toEqual([[24, -30, 'L'], [24, 30, 'R']]);
    expect(labels(compassSVG(200, pair))).toEqual([[20, 32.8, 'L'], [-36.4, 12.3, 'R']]);
    expect(labels(compassSVG(330, pair))).toEqual([[-38, -5.8, 'L'], [14, -35.8, 'R']]);
  });

  it('writes a whole number without a decimal point', () => {
    expect(compassSVG(90, pair)).toContain('x="24" y="-30"');
    expect(compassSVG(180, pair)).toContain('x="30" y="24"');
  });

  it('never turns the text of a label, which is the river bar and its flow arrow only', () => {
    const svg = compassSVG(200, pair, 90, 5);
    expect(svg.match(/<text class="c-bank"[^>]*>/g).every(t => !t.includes('transform') && t.includes('text-anchor="middle"'))).toBe(true);
    // The only group turned by the heading holds the river, and it closes before the labels.
    expect(svg.indexOf('</g>')).toBeLessThan(svg.indexOf('c-bank'));
    expect(svg).toContain('<g transform="rotate(200)"><rect class="c-river"');
  });

  it("follows the viewer's heading for Putney's labels", () => {
    const mine = resolveLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY, overrides: { heading: 200 } });
    expect(labels(compassSVG(mine.course.heading, mine.banks, null, null))).toEqual([[20, 32.8, 'VT'], [-36.4, 12.3, 'NH']]);
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
    expect(compass).toMatch(/x="28\.8" y="-25\.4" text-anchor="middle">NS<\/text>/);
    expect(compass).toMatch(/x="18\.4" y="33\.7" text-anchor="middle">SS<\/text>/);
    // Upstream heading 100, so the river runs 280 degrees, which is W.
    expect(dom.el('compassCap').textContent).toMatch(/^Wind from \w+\. River runs W, upstream heading 100°\.$/);
    expect(dom.el('compassCap').textContent).toContain('River runs W, upstream heading 100°.');
    expect(dom.el('compass').innerHTML + dom.el('compassCap').textContent).not.toMatch(BROKEN);
  });

  it("keeps Putney's heading of 15 and its banks", () => {
    const { dom } = screen(PUTNEY);
    renderNow();
    expect(dom.el('compassCap').textContent).toContain('River runs SSW, upstream heading 15°.');
    expect(dom.el('compass').innerHTML).toContain('x="-22.8" y="-30.9" text-anchor="middle">VT</text>');
    expect(dom.el('compass').innerHTML).toContain('x="35.2" y="-15.4" text-anchor="middle">NH</text>');
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
    expect(html).toContain('x="28.8" y="-25.4" text-anchor="middle">NS</text>');
    expect(html).toContain('x="18.4" y="33.7" text-anchor="middle">SS</text>');
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
    // The last 30 days: the range note, the daily means table and the chart's readings.
    expect(html).toContain('Daily mean from 3,950 m³/s on ');
    expect(html).toMatch(/<td>6,850 m³\/s<\/td>/);
    expect(html).toMatch(/: 3,950 m³\/s, daily mean\./);
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
    expect(river.render(m).html).toContain('Daily mean from 3,950 cfs on ');
    expect(river.render(m).html).toMatch(/<td>6,850 cfs<\/td>/);
  });

  it("says in How this works that the viewer's flow limits were for another gauge, and only then (P1.10)", () => {
    const note = 'Your flow limits were for a different gauge. Set them again for this gauge.';
    const stored = limitBasis => resolveLocation(PUTNEY_RECORD, { waterway: PUTNEY_WATERWAY, overrides: { flowCaution: 4000, limitBasis } });
    const html = river.render(screen(stored({ flow: 'usgs-ogc:USGS-01154501:cfs' })).m).html;
    expect(html).toContain(`<p>${note}</p>`);
    // After the line on what the limits check, before the words on the gauge's history.
    expect(html.indexOf('The latest measured flow is checked')).toBeLessThan(html.indexOf(note));
    expect(html.indexOf(note)).toBeLessThan(html.indexOf('Since 2016'));
    expect(html).not.toMatch(BROKEN);
    // Limits for this gauge, none saved, and none with no gauge named say nothing.
    for (const loc of [stored({ flow: 'usgs-ogc:USGS-01154500:cfs' }), stored(undefined), PUTNEY]) {
      expect(river.render(screen(loc).m).html, JSON.stringify(loc.ignoredFlow)).not.toContain('Your flow limits were');
    }
  });

  it('falls back to cfs where the place has no flow record, and still draws', () => {
    const { dom, m } = screen(NO_FLOW);
    expect(m.loc.flow).toBeNull();
    expect(river.summary(m).text).toMatch(/^6,000 cfs now\./);
    const html = river.render(m).html;
    expect(html).toContain('6,000 cfs');
    expect(html).toContain('Daily mean from 3,950 cfs on ');
    expect(html).not.toMatch(/m³/);
    expect(html).not.toMatch(BROKEN);
    renderNow();
    expect(dom.el('facts').textContent).toContain('6,000 cfs');
    const p = m.days.flatMap(d => d.periods).find(x => !x.past);
    expect(forecastPanel(m, p)).toContain('6,000 cfs');
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

// The same place with no flow limits, and with a stay off level only. A blank limit
// turns that level off, so it has no line, no legend entry and no words in the
// Your settings fact (01 11.1).
const limits = (drop, set = {}) => resolveLocation({
  ...PUTNEY_RECORD, slug: 'bay-w',
  thresholds: { ...Object.fromEntries(Object.entries(PUTNEY_RECORD.thresholds).filter(([k]) => !drop.includes(k))), ...set }
}, { waterway: PUTNEY_WATERWAY });
const NO_LIMITS = limits(['flowCaution', 'flowOff']);
// 22,000 is within reach of the flow on the screen, so its line is in view.
const OFF_ONLY = limits(['flowCaution'], { flowOff: 22000 });

describe('the River view draws only the flow limits that are set', () => {
  it("draws both lines and both legend entries at Putney, and says both levels", () => {
    const html = river.render(screen(PUTNEY).m).html;
    expect(html).toMatch(/Your settings<\/dt><dd><div class="val">20,000 cfs<\/div><div class="note">Caution at 20,000, stay off at 28,000\.</);
    expect(html).toContain('class="cthr1"');
    expect(html).toContain('class="cthr2"');
    expect(html).toContain('Caution 20,000</li>');
    expect(html).toContain('Stay off 28,000</li>');
  });

  it('says so and draws no line at a place with no flow limits', () => {
    const { m } = screen(NO_LIMITS);
    expect(m.S).toMatchObject({ flowCaution: '', flowOff: '' });
    const html = river.render(m).html;
    expect(html).toMatch(/Your settings<\/dt><dd><div class="val">--<\/div><div class="note">No flow limits set\.</);
    expect(html).not.toMatch(/cthr[12]/);
    expect(html).not.toMatch(/Caution \d|Stay off \d/);
    expect(html).not.toMatch(/Caution at|stay off at/);
    expect(html).not.toMatch(BROKEN);
    // The level never comes from a limit that is not there.
    expect(m.cur.a.reasons.map(r => r.key)).not.toContain('flow');
  });

  it('writes and draws the one level a place has', () => {
    const { m } = screen(OFF_ONLY);
    const html = river.render(m).html;
    expect(html).toMatch(/Your settings<\/dt><dd><div class="val">22,000 cfs<\/div><div class="note">Stay off at 22,000\.</);
    expect(html).toContain('class="cthr2"');
    expect(html).not.toContain('class="cthr1"');
    expect(html).toContain('Stay off 22,000</li>');
    expect(html).not.toMatch(/Caution \d/);
    expect(html).not.toMatch(BROKEN);
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
    expect(share.mock.calls[0][0]).toMatchObject({ title: 'Weir Pool rowing forecast', url: 'https://rowhether.com/weir-pool' });
    expect(share.mock.calls[0][0].text).toMatch(/^Weir Pool rowing, /);
  });

  // What the share sheet is given for a place, on production and on a dev address (07 6.2).
  async function shared(loc, info, address) {
    const { dom } = screen(loc);
    let click;
    dom.el('shareBtn').addEventListener = (type, fn) => { click = fn; };
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { share });
    if (address) vi.stubGlobal('location', address);
    app.info = info;
    try {
      initShare();
      await click();
    } finally { vi.unstubAllGlobals(); app.info = null; }
    return share.mock.calls[0][0];
  }

  it("links to the place's page on rowhether.com on production, whatever address it was opened on", async () => {
    const at = { origin: 'https://other.example', pathname: '/somewhere' };
    expect((await shared(PUTNEY, null, at)).url).toBe('https://rowhether.com/putney-landing');
    expect((await shared(PUTNEY, { env: 'production' }, at)).url).toBe('https://rowhether.com/putney-landing');
    expect((await shared(WEIR, { env: 'production', reports: true }, at)).url).toBe('https://rowhether.com/weir-pool');
  });

  it('links to its own address on a dev instance', async () => {
    const at = { origin: 'https://dev-rowhether.example.workers.dev', pathname: '/weir-pool' };
    expect((await shared(WEIR, { env: 'dev' }, at)).url).toBe('https://dev-rowhether.example.workers.dev/weir-pool');
  });

  describe('the zone suffix', () => {
    const at = (loc, deviceTz, now = NOW) => { screen(loc, now); renderHero(); app.deviceTz = deviceTz; return shareText(now); };
    const head = text => text.slice(0, text.indexOf(':'));

    it('is absent for a sharer in the place\'s own zone, whatever the machine\'s', () => {
      expect(at(PUTNEY, 'America/New_York')).toMatch(/^Putney Landing rowing, 12\u00a0PM: /);
      // The same offset under another name (Toronto keeps New York's clock).
      expect(at(PUTNEY, 'America/Toronto')).toMatch(/^Putney Landing rowing, 12\u00a0PM: /);
    });

    it('names the place\'s zone for a sharer in another, after the time', () => {
      expect(head(at(PUTNEY, 'America/Chicago'))).toBe('Putney Landing rowing, 12\u00a0PM Eastern');
      expect(head(at(PUTNEY, 'Pacific/Auckland'))).toBe('Putney Landing rowing, 12\u00a0PM Eastern');
      expect(at(PUTNEY, 'America/Chicago')).toMatch(/^Putney Landing rowing, 12\u00a0PM Eastern: \S/);
    });

    it('takes the name from the record, else the zone\'s own word', () => {
      const london = resolveLocation({ ...PUTNEY_RECORD, slug: 'thames', name: 'Thames', tz: 'Europe/London', tzLabel: 'London' }, { waterway: PUTNEY_WATERWAY });
      expect(head(at(london, 'America/New_York'))).toMatch(/ London$/);
      const la = resolveLocation({ ...PUTNEY_RECORD, slug: 'la', name: 'Marina', tz: 'America/Los_Angeles', tzLabel: null }, { waterway: PUTNEY_WATERWAY });
      expect(head(at(la, 'America/New_York'))).toMatch(/ Pacific$/);
    });

    it('goes by the offsets at the time of the share, not the names of the zones', () => {
      const london = resolveLocation({ ...PUTNEY_RECORD, slug: 'thames', name: 'Thames', tz: 'Europe/London', tzLabel: 'London' }, { waterway: PUTNEY_WATERWAY });
      // Lisbon and London keep one clock all year. Abidjan is on UTC: an hour behind London in June, level in January.
      expect(head(at(london, 'Europe/Lisbon'))).not.toMatch(/London/);
      expect(head(at(london, 'Africa/Abidjan'))).toMatch(/ London$/);
      const winter = Date.UTC(2026, 0, 15, 12);
      expect(head(at(london, 'Africa/Abidjan', winter))).not.toMatch(/London/);
    });

    it('is absent when the device has no zone', () => {
      expect(at(PUTNEY, '')).toMatch(/^Putney Landing rowing, 12\u00a0PM: /);
      expect(at(PUTNEY, undefined)).toMatch(/^Putney Landing rowing, 12\u00a0PM: /);
    });
  });
});

// P1.9: what the screens say when a source is absent here, or past its limit (07 6.7).
describe('a source that is absent here or past its limit', () => {
  const make = (slug, record = {}, waterway = PUTNEY_WATERWAY) => resolveLocation({ ...PUTNEY_RECORD, slug, ...record }, { waterway });
  const noAlerts = PUTNEY_RECORD.sources.filter(s => s.role !== 'alerts');
  const noWaterTemp = PUTNEY_RECORD.sources.filter(s => s.role !== 'water_temp');
  // A river with no gauge row: the record's own waterway is left off, so there is no flow row.
  const NO_GAUGE = make('no-gauge', { flow: null }, null);
  const LAKE_NO_GAUGE = make('still-lake', { waterType: 'lake', flow: null }, null);
  const RESERVOIR = make('still-reservoir', { waterType: 'reservoir', flow: null }, null);
  const NO_TEMP = make('no-temp', { sources: noWaterTemp });
  const TYPICAL = make('typical-june', { waterTemp: { fallback: 'monthly', monthly: [34, 34, 38, 45, 54, 61, 68, 70, 65, 55, 45, 37], maxAgeH: 72 }, sources: noWaterTemp });
  const NO_ALERTS = make('no-alerts', { sources: noAlerts });
  // The gauge's flow reading 2 days old, and its water temperature `waterAge` hours old.
  const gone = (waterAge = 0) => ({ river: { flow: { v: 6000, t: NOW - 48 * HOUR }, waterC: { v: 20, t: NOW - waterAge * HOUR } } });
  const line = dom => (dom.el('notChecked').hidden ? null : dom.el('notChecked').textContent);
  // What a location with no gauge is never given, and a river answer with the flow and no water temperature.
  const NOFLOW = { river: undefined, flow: undefined, flowDays: undefined, flowFcst: undefined };
  const FLOWONLY = { river: { flow: { v: 6000, t: NOW } } };
  const facts = (loc, data) => { const { dom } = screen(loc, NOW, { data }); renderNow(); return dom.el('facts').textContent; };
  const day = m => m.days[0].key;

  describe('the hero line', () => {
    it('is hidden and empty at Putney, with its sources answering', () => {
      const { dom } = screen(PUTNEY);
      renderHero();
      expect(line(dom)).toBeNull();
      expect(dom.el('notChecked').textContent).toBe('');
    });

    it('says what a river with no gauge and a location with no alerts feed do not check', () => {
      let { dom } = screen(NO_GAUGE); renderHero();
      expect(line(dom)).toBe('Not checked here: river flow.');
      ({ dom } = screen(NO_ALERTS)); renderHero();
      expect(line(dom)).toBe('Not checked here: official alerts.');
      ({ dom } = screen(make('neither', { flow: null, sources: noAlerts }, null))); renderHero();
      expect(line(dom)).toBe('Not checked here: river flow, official alerts.');
    });

    it('says nothing about flow on a lake or a reservoir', () => {
      for (const loc of [LAKE_NO_GAUGE, RESERVOIR]) { const { dom } = screen(loc); renderHero(); expect(line(dom), loc.slug).toBeNull(); }
    });

    it('says how long the gauge has not reported, and the verdict goes without it', () => {
      const { dom, m } = screen(PUTNEY, NOW, { data: gone() });
      renderHero();
      expect(line(dom)).toBe('River flow not checked: the gauge has not reported for 2 days.');
      expect(m.cur.a.reasons.map(r => r.key)).not.toContain('flow');
    });

    it('says how long NWS has not answered once the alerts are past their limit after a failed refresh', () => {
      const stale = staleSlots(bindingsFor(PUTNEY), { alerts: NOW - 2 * HOUR, wx: NOW }, { alerts: true }, NOW);
      const { dom } = screen(PUTNEY, NOW, { stale });
      renderHero();
      expect(line(dom)).toBe('Official alerts not checked: no answer from NWS for 2 hours.');
    });

    it('is not named for alerts that answered an hour ago, or for a failed refresh that was not past the limit', () => {
      const ok = staleSlots(bindingsFor(PUTNEY), { alerts: NOW - HOUR }, { alerts: true }, NOW);
      const { dom } = screen(PUTNEY, NOW, { stale: ok });
      renderHero();
      expect(line(dom)).toBeNull();
    });

    it('goes when the forecast goes, and a line from the last model never stays up', () => {
      const { dom } = screen(NO_GAUGE);
      renderHero();
      expect(line(dom)).not.toBeNull();
      renderNoData();
      expect(dom.el('notChecked').hidden).toBe(true);
      expect(dom.el('notChecked').textContent).toBe('');
    });

    it('is in Share this forecast when it shows, after the rest', () => {
      const { dom } = screen(NO_GAUGE);
      renderHero();
      const text = shareText(NOW);
      expect(text.endsWith(' Not checked here: river flow.')).toBe(true);
      screen(PUTNEY);
      renderHero();
      expect(shareText(NOW)).not.toMatch(/not checked|Not checked/i);
      expect(dom.el('shareBtn').hidden).toBe(false);
    });
  });

  describe('No data after a forecast that is past its limit', () => {
    const allFailed = () => Object.fromEntries(bindingsFor(app.loc).map(b => [b.slot, true]));

    it('says the forecast did not load, though every source failed, since the page has loaded one before', () => {
      const { dom } = screen(PUTNEY);
      app.errors = allFailed(); app.updated = NOW - 30 * HOUR;
      renderNoData(true);
      expect(dom.el('verdict').textContent).toBe('No data.');
      expect(dom.el('why').textContent).toBe('The forecast did not load. Check the connection, then tap Refresh.');
    });

    it('still says every source was blocked when none ever answered', () => {
      const { dom } = screen(PUTNEY);
      app.errors = allFailed(); app.updated = null;
      renderNoData();
      expect(dom.el('why').textContent).toMatch(/^Every data source was blocked\./);
      renderNoData(false);
      expect(dom.el('why').textContent).toMatch(/^Every data source was blocked\./);
    });
  });

  describe('On the water now', () => {
    it('has no River flow fact where the location has no gauge, and keeps "--" where the gauge did not answer', () => {
      expect(facts(NO_GAUGE, NOFLOW)).not.toContain('River flow');
      expect(facts(LAKE_NO_GAUGE, NOFLOW)).not.toContain('River flow');
      const { dom } = screen(PUTNEY, NOW, { data: { river: {} } });
      renderNow();
      expect(dom.el('facts').textContent).toContain('River flow--USGS gauge unavailable.');
    });

    it('keeps the number of a reading past its limit, with its age, and says it is not used', () => {
      const { dom } = screen(PUTNEY, NOW, { data: gone() });
      renderNow();
      const t = dom.el('facts').textContent;
      expect(t).toContain('River flow6,000 cfs');
      expect(t).toContain('Last reading 2 days ago, not used for Go, Caution or Stay off.');
      expect(t).not.toContain('North Walpole gauge');
    });

    it('says the age in hours under 48', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const { dom } = screen(PUTNEY, NOW, { data: { river: { flow: { v: 6000, t: NOW - 30 * HOUR }, waterC: { v: 20, t: NOW } } } });
      renderNow();
      expect(dom.el('facts').textContent).toContain('Last reading 30 hr ago, not used for Go, Caution or Stay off.');
    });

    it('draws a reading within its limit as it did', () => {
      const t = facts(PUTNEY);
      expect(t).toContain('North Walpole gauge below Bellows Falls dam, about 16 river miles upstream. Just now.');
      expect(t).not.toContain('not used for Go');
    });

    it('says there is no water temperature where there is no gauge for it', () => {
      expect(facts(NO_TEMP, FLOWONLY)).toContain('Water--No water temperature here. Add a dock reading in Settings.');
    });

    it('keeps "Gauge unavailable" where the gauge is there and did not answer, or answered too long ago', () => {
      let { dom } = screen(PUTNEY, NOW, { data: { river: { flow: { v: 6000, t: NOW } } } }); renderNow();
      expect(dom.el('facts').textContent).toContain('Water--Gauge unavailable. Add a dock reading in Settings.');
      ({ dom } = screen(PUTNEY, NOW, { data: gone(73) })); renderNow();
      expect(dom.el('facts').textContent).toContain('Water--Gauge unavailable. Add a dock reading in Settings.');
      ({ dom } = screen(PUTNEY, NOW, { data: gone(71) })); renderNow();
      expect(dom.el('facts').textContent).toMatch(/Water68°F/);
    });

    it("says the month's typical value, and that it is not a reading", () => {
      const { dom } = screen(TYPICAL, NOW, { data: { river: { flow: { v: 6000, t: NOW } } } });
      renderNow();
      expect(dom.el('facts').textContent).toContain('Water--Typical for June, about 61°F. No live reading.');
    });

    it("names the month in the location's zone, as it reads the value", () => {
      // 2 PM on 30 June at Putney is 6 AM on 1 July in Auckland, the zone these tests run in.
      const now = Date.UTC(2026, 5, 30, 18), river = { flow: { v: 6000, t: now } };
      const m = buildModel(TYPICAL, { wx: wx(across, 3, Date.UTC(2026, 5, 30, 4)), river }, effectiveSettings(TYPICAL), now);
      expect(noWater(m)).toBe('Typical for June, about 61°F. No live reading.');
    });

    it('puts the dock reading ahead of all of it', () => {
      const { dom } = screen(NO_TEMP);
      app.settings = { ...app.settings, waterOverride: 55 };
      app.model = buildModel(NO_TEMP, app.data, app.settings, NOW);
      renderNow();
      expect(dom.el('facts').textContent).toContain('Water55°F');
    });
  });

  describe('a full forecast', () => {
    const panel = (loc, opts) => { const { m } = screen(loc, NOW, opts); return forecastPanel(m, m.days.flatMap(d => d.periods).find(x => !x.past)); };

    it('says the water temperature is not here, or unavailable, or typical', () => {
      expect(panel(NO_TEMP, { data: FLOWONLY })).toContain('No water temperature here. Add a dock reading in Settings.');
      expect(panel(PUTNEY, { data: FLOWONLY })).toContain('Gauge unavailable. Add a dock reading in Settings.');
      expect(panel(TYPICAL, { data: FLOWONLY })).toContain('Typical for June, about 61°F. No live reading.');
    });

    it('has no River flow fact without a gauge, and says a reading past its limit is not used', () => {
      expect(panel(NO_GAUGE, { data: NOFLOW })).not.toContain('River flow');
      const html = panel(PUTNEY, { data: gone() });
      expect(html).toContain('River flow');
      expect(html).toContain('Last reading 2 days ago, not used for Go, Caution or Stay off.');
      expect(html).not.toContain('Go, Caution and Stay off use the latest reading.');
      expect(panel(PUTNEY)).toContain('Go, Caution and Stay off use the latest reading.');
    });
  });

  describe('the Temperature, Fog and Week views', () => {
    it('Temperature says there is no water temperature, and what to do to turn the cold-water check on', () => {
      expect(temperature.render(screen(NO_TEMP, NOW, { data: FLOWONLY }).m).html).toContain('No water temperature here. Add a dock reading in Settings to turn on the cold-water check.');
      expect(temperature.render(screen(PUTNEY, NOW, { data: FLOWONLY }).m).html).toContain('Gauge unavailable. Add a dock reading in Settings.');
      expect(temperature.render(screen(TYPICAL, NOW, { data: FLOWONLY }).m).html).toContain('Typical for June, about 61°F. No live reading.');
    });

    it('Fog says steam fog needs a water temperature where there is no gauge, and keeps its words where the gauge failed', () => {
      expect(fog.render(screen(NO_TEMP, NOW, { data: FLOWONLY }).m).html).toContain('Steam fog needs a water temperature. Add a dock reading in Settings.');
      expect(fog.render(screen(PUTNEY, NOW, { data: FLOWONLY }).m).html).toContain('No water temperature is available, so steam fog is not checked.');
      expect(fog.render(screen(PUTNEY).m).html).toContain('Water is 68°F.');
    });

    it('Week says the river is not checked, in words that fit the water, and that alerts are not available', () => {
      const open = (loc, data) => { const { m } = screen(loc, NOW, { data }); return week.render(m, day(m)).html; };
      expect(open(NO_GAUGE, NOFLOW)).toContain('<span class="fname">River</span><span class="wnote">No river gauge here, so flow is not checked.</span>');
      expect(open(LAKE_NO_GAUGE, NOFLOW)).toContain('<span class="wnote">This is a lake. Flow is not checked.</span>');
      expect(open(RESERVOIR, NOFLOW)).toContain('<span class="wnote">This is a reservoir. Flow is not checked.</span>');
      expect(open(NO_ALERTS)).toContain('<span class="fname">Alerts</span><span class="wnote">Not available here</span>');
    });

    it('Week does not call a factor with no source "no concern"', () => {
      const { m } = screen(make('neither', { flow: null, sources: noAlerts }, null), NOW, { data: NOFLOW });
      const html = week.render(m, day(m)).html;
      const concerns = /No concerns from ([^.]*)\./.exec(html)[1];
      expect(concerns).not.toMatch(/river|alerts/);
      expect(concerns).toMatch(/wind/);
    });

    it("Week says nothing of the kind at Putney, where every source is", () => {
      const { m } = screen(PUTNEY);
      const html = week.render(m, day(m)).html;
      expect(html).not.toMatch(/Not available here|flow is not checked|Flow is not checked/);
      expect(/No concerns from ([^.]*)\./.exec(html)[1]).toMatch(/river/);
    });
  });
});

// ---------- Still water on screen (P1.13; 01 9.3, 10.5) ----------
describe('still water', () => {
  const readJson = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
  const place = slug => resolveLocation(readJson(`data/locations/${slug}.json`), { waterway: readJson(`data/waterways/${slug}.json`) });
  const SLUGS = ['lake-quinsigamond', 'lake-natoma', 'lake-carnegie'];
  const LAKES = Object.fromEntries(SLUGS.map(s => [s, place(s)]));
  // What a lake is given: no flow of any kind, and at Natoma a water temperature from its river gauge row.
  const NOFLOW = { river: undefined, flow: undefined, flowDays: undefined, flowFcst: undefined };
  const dataFor = slug => (slug === 'lake-natoma' ? { ...NOFLOW, river: { waterC: { v: 20, t: NOW } } } : NOFLOW);
  const lakeScreen = slug => screen(LAKES[slug], NOW, { data: dataFor(slug) });
  const carnegie = LAKES['lake-carnegie'];
  const ellipse = svg => { const m = /<ellipse class="c-river" rx="([^"]+)" ry="([^"]+)" transform="rotate\(([^)]+)\)"\/>/.exec(svg); return m && { rx: +m[1], ry: +m[2], turn: +m[3] }; };

  describe('the compass with no course', () => {
    it("draws the lake as an ellipse along its axis, with rx 50 and ry 6 for Carnegie's 200 by 4,800 m", () => {
      const svg = compassSVG(undefined, null, 200, 8, carnegie.water);
      expect(svg).toContain('<ellipse class="c-river" rx="50" ry="6" transform="rotate(-55)"/>');
      // The wind arrow is drawn as for a river.
      expect(svg).toContain('<g transform="rotate(200)"><line class="c-wind"');
    });

    it('lies along the axis: its long side, laid east and turned, points at the bearing of the axis', () => {
      for (const axis of [0, 31, 35, 90, 166, 179]) {
        const e = ellipse(compassSVG(null, null, null, null, { lake: { axis, lengthM: 6000, widthM: 600 } }));
        expect((90 + e.turn + 720) % 360, `axis ${axis}`).toBe(axis);
        expect(e.rx).toBeGreaterThan(e.ry);
      }
    });

    it('draws ry as 50 times the width over the length, to one decimal, and at least 6', () => {
      const ry = (lengthM, widthM) => ellipse(compassSVG(null, null, null, null, { lake: { axis: 0, lengthM, widthM } })).ry;
      expect([ry(1000, 500), ry(1000, 300), ry(6600, 1000), ry(1000, 100), ry(6600, 370), ry(4800, 200)]).toEqual([25, 15, 7.6, 6, 6, 6]);
    });

    it('draws no river bar, no flow arrow and no bank labels, whatever banks it is given', () => {
      const svg = compassSVG(undefined, { word: 'shore', left: { short: 'W', name: 'west' }, right: { short: 'E', name: 'east' } }, 200, 8, carnegie.water);
      expect(svg).not.toMatch(/c-bank|c-flow|<rect class="c-river"|<g transform="rotate\(-?[\d.]+\)"><rect/);
    });

    it('draws a circle of radius 50 when only a size is known, and no shape at all when there is neither', () => {
      expect(compassSVG(undefined, null, null, null, { fetchM: 2000 })).toContain('<circle class="c-river" r="50"/>');
      expect(compassSVG(undefined, null, null, null, { fetchM: 2000, lake: null })).not.toContain('<ellipse');
      for (const water of [{ fetchM: null }, { fetchM: Array(16).fill(500) }, {}, undefined]) {
        expect(compassSVG(undefined, null, null, null, water), JSON.stringify(water)).not.toMatch(/<ellipse|<circle class="c-river"|<rect/);
      }
    });

    it('still draws the course bar and the shore labels for a heading course on still water, without the flow arrow of a river', () => {
      const q = LAKES['lake-quinsigamond'];
      const svg = compassSVG(q.course.heading, q.banks, null, null, q.water);
      expect(svg).toContain('<g transform="rotate(166)"><rect class="c-river"');
      expect(svg).toContain('c-bank');
      expect(svg).not.toMatch(/<ellipse|c-flow/);
      // A river keeps its arrow, with or without the water it is given.
      expect(compassSVG(15, PUTNEY.banks, null, null, PUTNEY.water)).toContain('c-flow');
      expect(compassSVG(15, PUTNEY.banks, null, null)).toContain('c-flow');
    });

    it("leaves a river's compass as it was, with or without a water argument", () => {
      expect(compassSVG(15, PUTNEY.banks, 200, 8, PUTNEY.water)).toBe(compassSVG(15, PUTNEY.banks, 200, 8));
    });
  });

  describe('On the water now', () => {
    it("at Carnegie draws the lake and says only the direction and the fetch across it, with no river words", () => {
      const { dom } = lakeScreen('lake-carnegie');
      renderNow();
      expect(ellipse(dom.el('compass').innerHTML)).toEqual({ rx: 50, ry: 6, turn: -55 });
      expect(dom.el('compass').innerHTML).not.toMatch(/c-bank|c-flow/);
      // The wind of the fixture at noon is from 190 degrees, 155 off the axis: a short reach.
      expect(dom.el('compassCap').textContent).toBe('Wind from S across about 0.3 mi of open water.');
      const wind = dom.el('facts').textContent;
      expect(wind).toMatch(/Wind\d+ mph, gusts \d+From S\.(?!\s*(Headwind|Tailwind|Crosswind|Near calm))/);
      expect(wind).not.toMatch(/Headwind|Tailwind|Crosswind|upstream|River runs/);
      expect(dom.el('facts').textContent).toContain('Wind from the S crosses only about 0.3 mi of water, so chop stays small.');
    });

    it('says the length of the reach from the lake for each lake, along the wind of the day', () => {
      const caps = SLUGS.map(slug => { const { dom } = lakeScreen(slug); renderNow(); return dom.el('compassCap').textContent; });
      expect(caps[0]).toBe('Wind from S across about 0.6 mi of open water.');
      expect(caps[1]).toBe('Wind from S across about 0.4 mi of open water.');
      expect(caps[2]).toBe('Wind from S across about 0.3 mi of open water.');
    });

    it('says only the direction when the fetch is one size for every direction, and when it is the reference', () => {
      for (const water of [{ fetchM: 2000 }, {}]) {
        const { dom } = screen(still1(water), NOW, { data: NOFLOW });
        renderNow();
        expect(dom.el('compassCap').textContent, JSON.stringify(water)).toBe('Wind from S.');
      }
    });

    it('says the open water for 16 measured distances, from the nearest', () => {
      const water = { fetchM: Array.from({ length: 16 }, (_, i) => 800 + i * 400) };
      const { dom } = screen(still1(water), NOW, { data: NOFLOW });
      renderNow();
      // 190 degrees rounds to the 8th bin (180), 800 + 8 * 400 = 4,000 m.
      expect(dom.el('compassCap').textContent).toBe('Wind from S across about 2.5 mi of open water.');
    });

    it('keeps the river line on a river and on a river with banks, where the heading is named', () => {
      const { dom } = screen(PUTNEY);
      renderNow();
      expect(dom.el('compassCap').textContent).toBe('Wind from S. River runs SSW, upstream heading 15°.');
    });

    it('has no river words and no broken value for any of the three lakes', () => {
      for (const slug of SLUGS) {
        const { dom } = lakeScreen(slug);
        renderNow();
        const text = [dom.el('compass').innerHTML, dom.el('compassCap').textContent, dom.el('facts').textContent, dom.el('nowPrecip').textContent].join('\n');
        expect(text, slug).not.toMatch(BROKEN);
        expect(text, slug).not.toMatch(/River runs|River rising|upstream heading/);
        expect(dom.el('facts').textContent, slug).not.toContain('River flow');
      }
    });

    it('labels the compass for the lake, once the place is drawn, and for the river again after a lake', () => {
      const dom = installFakeDom({ width: 390 });
      app.deviceTz = 'America/New_York';
      renderPlace(carnegie);
      expect(dom.el('compass').getAttribute('aria-label')).toBe('Wind direction relative to the lake');
      renderPlace(PUTNEY);
      expect(dom.el('compass').getAttribute('aria-label')).toBe('Wind direction relative to the river');
      renderPlace(LAKES['lake-natoma']);
      expect(dom.el('compass').getAttribute('aria-label')).toBe('Wind direction relative to the lake');
      renderPlace(null);
      expect(dom.el('compass').getAttribute('aria-label')).toBe('Wind direction relative to the lake');
    });
  });

  describe('a full forecast', () => {
    // A wind from 190 degrees all day, so a period has one direction and says "mostly".
    const steady = { wx: wx(() => ({ wind: 8, gust: 10, dir: 190 }), 3, T0) };
    const panels = (slug, data = steady) => { const { m } = screen(LAKES[slug], NOW, { data: { ...dataFor(slug), ...data } }); return m.days.flatMap(d => d.periods).filter(p => !p.past).map(p => forecastPanel(m, p)); };

    it('at Carnegie draws the lake and says how far the wind reaches, with no river words', () => {
      const [html] = panels('lake-carnegie');
      expect(html).toContain('<ellipse class="c-river" rx="50" ry="6" transform="rotate(-55)"/>');
      expect(html).toContain('aria-label="Forecast wind direction relative to the lake"');
      expect(html).toMatch(/<figcaption>Wind mostly from S across about 0\.3 mi of open water\.<\/figcaption>/);
      expect(html).not.toMatch(/River runs|upstream heading|Headwind|Tailwind|Crosswind/);
    });

    it('says the wind is shifting without a distance, since it has no one direction', () => {
      const { m } = screen(LAKES['lake-carnegie'], NOW, { data: NOFLOW });
      const p = m.days.flatMap(d => d.periods).find(x => !x.past);
      const html = forecastPanel(m, { ...p, hs: p.hs.map((h, i) => ({ ...h, dir: i % 2 ? 10 : 190 })), dir: 190 });
      expect(html).toContain('<figcaption>Wind shifting during this period.</figcaption>');
    });

    it("keeps Putney's river caption and label", () => {
      const { m } = screen(PUTNEY);
      const html = forecastPanel(m, m.days.flatMap(d => d.periods).find(x => !x.past));
      expect(html).toContain('aria-label="Forecast wind direction relative to the river"');
      expect(html).toMatch(/<figcaption>Wind (mostly from \w+|shifting during this period)\. River runs SSW, upstream heading 15°\.<\/figcaption>/);
    });

    it('has no river words and no broken value, in any period of any day, for any of the three lakes, steady wind or shifting', () => {
      for (const slug of SLUGS) {
        const list = [...panels(slug), ...panels(slug, {})];
        expect(list.length, slug).toBeGreaterThanOrEqual(6);
        for (const html of list) {
          expect(html, slug).not.toMatch(BROKEN);
          expect(html, slug).not.toMatch(/River runs|River rising|upstream heading/);
        }
      }
    });
  });

  describe('every view', () => {
    it('draws for each lake with no undefined, no NaN and no "River runs"', () => {
      for (const slug of SLUGS) {
        const { m } = lakeScreen(slug);
        const keys = viewsFor(LAKES[slug]).map(v => v.key);
        expect(keys, slug).toHaveLength(8);
        for (const key of keys) {
          for (const day of [null, m.days[1].key]) {
            const html = MODULES[key].render(m, day).html;
            expect(html, `${slug} ${key}`).not.toMatch(BROKEN);
            expect(html, `${slug} ${key}`).not.toMatch(/River runs|upstream heading/);
          }
        }
      }
    });

    it("keeps Putney's river words in the views and the full forecast", () => {
      const { m } = screen(PUTNEY);
      expect(wind.render(m).html).toContain('with the river running up the page');
      expect(forecastPanel(m, m.days.flatMap(d => d.periods).find(x => !x.past))).toContain('River runs SSW');
    });
  });

  describe('the Wind view', () => {
    it('at Carnegie draws no wind arrows and no Course column, and says why in How this works', () => {
      const html = wind.render(lakeScreen('lake-carnegie').m).html;
      expect(html).not.toMatch(/carrow|Direction on the course/);
      expect(html).not.toContain('<th scope="col">Course</th>');
      expect(html).not.toMatch(/Headwind|Tailwind|Cross\b/);
      expect(html).toContain('Head and crosswind are not shown because no course is set here.');
      expect(html).not.toMatch(/course heading is|upstream|river running/);
      expect(html).not.toMatch(BROKEN);
      // The table still has its other columns, and its water column.
      expect(html).toContain('<th scope="col">From</th><th scope="col">Water</th>');
    });

    it('at Quinsigamond, which has a heading, draws the arrows and the Course column', () => {
      const html = wind.render(lakeScreen('lake-quinsigamond').m).html;
      expect(html).toContain('class="carrow"');
      expect(html).toContain('<th scope="col">From</th><th scope="col">Course</th><th scope="col">Water</th>');
      expect(html).toContain('The course heading is 166°, set in Settings.');
      expect(html).not.toMatch(BROKEN);
    });

    it('explains the chop of still water by the fetch, and the river\'s chop by the straight', () => {
      expect(wind.render(lakeScreen('lake-carnegie').m).html).toMatch(/It follows the wind and how far the wind has blown over open water, which is called fetch: a longer reach builds bigger waves\. It blends the last three hours, since chop takes time to build and settle\./);
      const river = wind.render(screen(PUTNEY).m).html;
      expect(river).toContain('Wind along the straight counts fully and crosswind counts for less. It blends the last three hours, since chop takes time to build and settle, and goes up when wind blows against a strong current.');
      expect(river).not.toContain('fetch');
    });
  });

  it('reads the lakes as still water and Putney as not', () => {
    expect(SLUGS.map(s => still(LAKES[s]))).toEqual([true, true, true]);
    expect(still(PUTNEY)).toBe(false);
  });
});

// ---------- Tidal water (P1.14; 01 9.4) ----------
describe('tidal water', () => {
  // The Potomac's name, and a tide row labeled Georgetown. The tide is the forecast of helpers/forecast.js:
  // highs of 5.6 ft at 3 AM and 3 PM, lows of 2.4 ft at 9 AM and 9 PM, from the clock's midnight.
  const POTOMAC = { ...PUTNEY_WATERWAY, name: 'Potomac River' };
  const loc = resolveLocation({
    ...PUTNEY_RECORD, slug: 'tidal-x', name: 'Tidal X', waterType: 'tidal', water: { mode: 'tidal', cross: 0.4 },
    sources: [...PUTNEY_RECORD.sources, { role: 'tide', mode: 'primary', adapter: 'nwps', ref: 'GTND2', unit: 'ft', label: 'Georgetown' }]
  }, { waterway: POTOMAC });
  const tideScreen = (data = {}) => screen(loc, NOW, { data: { tide: tide(), ...data } });
  const PM3 = '3\u00a0PM', PM9 = '9\u00a0PM';

  describe('the Tide fact on Now', () => {
    it('gives the height now and which way it runs, the next high and low, and links to the tab', () => {
      const { dom } = tideScreen();
      renderNow();
      const facts = dom.el('facts').innerHTML;
      expect(facts).toMatch(/<a class="flink stretch" href="#tide">Tide/);
      expect(dom.el('facts').textContent).toContain(`Tide4.0 ft risingHigh about ${PM3}, 5.6 ft. Low about ${PM9}, 2.4 ft.`);
    });

    it('sits after the water state and before the air', () => {
      const { dom } = tideScreen();
      renderNow();
      const text = dom.el('facts').textContent;
      expect(text.indexOf('Water state')).toBeLessThan(text.indexOf('Tide'));
      expect(text.indexOf('Tide')).toBeLessThan(text.indexOf('Air'));
    });

    it('says the water is falling after a high', () => {
      const { dom } = screen(loc, T0 + 16 * HOUR, { data: { tide: tide() } });
      renderNow();
      expect(dom.el('facts').textContent).toContain(`Tide5.4 ft fallingLow about ${PM9}, 2.4 ft. High about tomorrow 3\u00a0AM, 5.6 ft.`);
    });

    it('says so when there is no tide forecast, or the hour is past it', () => {
      for (const data of [{ tide: undefined }, { tide: tide(undefined, T0 - 72 * HOUR) }]) {
        const { dom } = screen(loc, NOW, { data });
        renderNow();
        expect(dom.el('facts').textContent, JSON.stringify(Object.keys(data))).toContain('Tide--NWS tide forecast unavailable.');
        expect(dom.el('facts').textContent).not.toMatch(BROKEN);
      }
    });

    it("is not at Putney, and the water state there has no tide in it", () => {
      const { dom } = screen(PUTNEY, NOW, { data: { tide: tide() } });
      renderNow();
      expect(dom.el('facts').textContent).not.toMatch(/Tide|tide/);
      expect(dom.el('facts').innerHTML).not.toContain('#tide');
    });

    it('puts the way the water runs in the water state, with the chop', () => {
      const { dom } = tideScreen();
      renderNow();
      expect(dom.el('facts').textContent).toContain(`Flood tide, rising until about ${PM3}.`);
    });
  });

  describe('the Tide view', () => {
    const render = (m, day = null) => tideView.render(m, day).html;

    it('opens with the next high and low, and has no status', () => {
      const { m } = tideScreen();
      expect(tideView.summary(m)).toEqual({ text: `High about ${PM3}, 5.6 ft. Low about ${PM9}, 2.4 ft.`, lvl: null });
      expect(render(m)).toContain(`High about ${PM3}, 5.6 ft. Low about ${PM9}, 2.4 ft.`);
      expect([tideView.key, tideView.name]).toEqual(['tide', 'Tide']);
      // No status color anywhere: the strip, the table and the chart carry no level, not even the go color of 0.
      expect(render(m)).not.toMatch(/data-lvl="[^"]|class="b[012]"/);
      expect(render(m)).toContain('data-lvl=""');
    });

    it('has a week strip with the high of each day that has a forecast and "No tide forecast" for the rest', () => {
      const { m } = screen(loc, NOW, { data: { wx: wx(across, 5, T0), tide: tide() } });
      const html = render(m);
      const vals = [...html.matchAll(/<span class="sval[^"]*">([^<]*)<\/span>/g)].map(x => x[1]);
      expect(vals).toEqual(['High 5.6\u00a0ft', 'High 5.6\u00a0ft', 'High 5.6\u00a0ft', 'No tide forecast', 'No tide forecast', ...vals.slice(5)]);
      expect(html).toContain('class="sval long wrap"');
      // The forecast covers about 3 days and the picked day is today.
      expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="[^"]*: high 5\.6 ft, low 2\.4 ft\./);
    });

    it('draws the height, labels each high and low, and has an hour table with the way the water runs', () => {
      const { m } = tideScreen();
      const html = render(m);
      expect(html).toContain('Tide height, ft');
      // The window is first light to sunset, so the high at 3 AM is not in it.
      expect(html).toContain('about 9\u00a0AM, 2.4 ft</text>');
      expect(html).toContain('about 3\u00a0PM, 5.6 ft</text>');
      expect(html).not.toContain('about 3\u00a0AM');
      expect(html).toContain('<th scope="col">Time</th><th scope="col">Height</th><th scope="col">Tide</th>');
      expect(html).toContain('<td>5\u00a0AM</td><td>4.8 ft</td><td>Falling</td>');
      expect(html).toContain('<td>10\u00a0AM</td><td>2.6 ft</td><td>Rising</td>');
      expect(html).toContain('Rising');
      expect(html).toContain('Falling');
      expect(html).not.toMatch(BROKEN);
    });

    it('says where the heights come from and that the tide does not change the verdict', () => {
      const { m } = tideScreen();
      expect(render(m)).toContain('Tide heights are the National Weather Service forecast for the Potomac at Georgetown, in feet, hourly for 3 days. Highs and lows are the highest and lowest hourly values, so their times are right to about half an hour.');
      expect(render(m)).toContain('Tide is shown for information. It does not change Go, Caution or Stay off.');
    });

    it('says no forecast for a day it does not cover, and has no chart for it', () => {
      const { m } = screen(loc, NOW, { data: { wx: wx(across, 5, T0), tide: tide() } });
      const html = render(m, m.days[4].key);
      expect(html).toContain('The forecast covers about 3 days.');
      expect(html).not.toMatch(/<svg|<table/);
      expect(html).not.toMatch(BROKEN);
    });

    it('says the tide forecast is not available when it did not load', () => {
      const { m } = tideScreen({ tide: undefined });
      const r = tideView.render(m, null);
      expect(r.html).toContain('The tide forecast is not available right now. Try Refresh.');
      expect(tideView.summary(m).text).toBe('No tide forecast right now.');
      expect(r.html).not.toMatch(BROKEN);
    });

    it('says metres for a forecast in metres', () => {
      const { m } = tideScreen({ tide: tide(undefined, T0, 'm') });
      expect(render(m)).toContain('in metres, hourly for 3 days');
      expect(render(m)).toContain('Tide height, m');
      expect(render(m)).not.toMatch(BROKEN);
    });

    it('draws with no undefined and no NaN for the days and the other views of a tidal place', () => {
      const { m } = tideScreen();
      for (const day of [null, ...m.days.map(d => d.key)]) expect(render(m, day), String(day)).not.toMatch(BROKEN);
      for (const key of viewsFor(loc).map(v => v.key).filter(k => k !== 'tide')) expect(MODULES[key].render(m, null).html, key).not.toMatch(BROKEN);
    });
  });

  describe('the Wind view', () => {
    it('does not say the wind steepens against a current, and says the tide current is not counted', () => {
      const html = wind.render(tideScreen().m).html;
      expect(html).toContain('It blends the last three hours, since chop takes time to build and settle. The tide forecast has heights only, so the tide\'s current is not counted.');
      expect(html).not.toContain('against a strong current');
      expect(html).toContain('Wind along the straight counts fully and crosswind counts for less.');
      expect(html).not.toContain('fetch');
    });
  });

  describe('a full forecast', () => {
    it('carries the tide sentence of its worst hour in the water state', () => {
      const { m } = tideScreen();
      const html = forecastPanel(m, m.days.flatMap(d => d.periods).find(x => !x.past));
      expect(html).toMatch(/(Flood|Ebb) tide, (rising|falling) until about/);
      expect(html).not.toMatch(BROKEN);
    });
  });
});
