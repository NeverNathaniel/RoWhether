// The render lines that step on hours or ask where the sun is (08 9.2), for a
// place that is not Putney and whose hours are not on UTC whole hours: the
// precipitation window on the Now screen, the day marks on the River chart, and
// the sun times of the Light view. At Putney they are the same as before, so the
// golden files cannot tell the old line from the new. A forecast for Kolkata
// (+5:30) can.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { HOUR, MIN } from '../src/config.js';
import { setZone } from '../src/format.js';
import { effectiveSettings, resolveLocation } from '../src/location.js';
import { PUTNEY_RECORD, PUTNEY_WATERWAY } from '../src/putney.js';
import { app } from '../src/state.js';
import { renderNow } from '../src/render/now.js';
import * as river from '../src/render/detail/river.js';
import * as light from '../src/render/detail/light.js';
import { buildModel, sunOn } from '../src/logic.js';
import { chartWidth } from '../src/render/detail/common.js';
import { Chart } from '../src/render/chart.js';
import { installFakeDom, uninstallFakeDom } from './helpers/fakedom.js';
import { wx } from './helpers/forecast.js';

const KOLKATA = resolveLocation({ ...PUTNEY_RECORD, slug: 'kolkata-ghat', name: 'Kolkata ghat', tz: 'Asia/Kolkata', lat: 22.585, lon: 88.343, country: 'IN', region: 'IN-WB' }, { waterway: PUTNEY_WATERWAY });
// Midnight on 15 June in Kolkata is 18:30 UTC the day before, and the hours of its
// forecast start at :30 UTC. It is 11:40 there, which is 06:10 UTC.
const I0 = Date.UTC(2026, 5, 15) - 330 * MIN;
const NOW = I0 + 11 * HOUR + 40 * MIN;

afterEach(() => {
  uninstallFakeDom();
  setZone('America/New_York');
  vi.useRealTimers();
});

// The screen as the app sets it up for Kolkata: its zone, a fake page, and a model.
function kolkata(now = NOW) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  setZone(KOLKATA.tz);
  const dom = installFakeDom({ width: 390 });
  // A flow reading every 15 minutes for 2 days, and the NWS forecast every 6 hours for 3.
  const flow = Array.from({ length: 193 }, (_, i) => ({ t: now - 48 * HOUR + 7 * MIN + i * 15 * MIN, v: 5000 + i }));
  const fcst = { issued: now, pts: Array.from({ length: 13 }, (_, i) => ({ t: now + i * 6 * HOUR, v: 5200 })) };
  const river = { flow: { v: 6000, t: now }, waterC: { v: 20, t: now } };
  // The render code reads the heading from the settings until P0.10.
  const S = { ...effectiveSettings(KOLKATA), heading: KOLKATA.course.heading };
  const m = buildModel(KOLKATA, { wx: wx(undefined, 3, I0), river, flow, flowFcst: fcst }, S, now);
  Object.assign(app, { model: m, settings: S, data: m.data, errors: {} });
  return { dom, m, flow, fcst };
}

describe('the Now screen in a half hour zone', () => {
  it('counts the precipitation window from the hour that contains now', () => {
    const { dom, m } = kolkata();
    expect(m.daytime).toBe(true);
    renderNow();
    // The hour is 11:00 to 12:00 there. Six hours on is 5 PM, not 5:30.
    expect(dom.el('nowPrecip').textContent).toContain('Precipitation, now to 5 PM');
  });
});

describe('the River chart in a half hour zone', () => {
  it('draws its day marks and labels on local midnight and noon', () => {
    const { m, flow, fcst } = kolkata();
    const html = river.render(m).html;
    // The chart is drawn from the first reading to the last forecast point, at the page's width.
    const ref = new Chart({ t0: flow[0].t, t1: Math.max(fcst.pts[fcst.pts.length - 1].t, NOW + 6 * HOUR), W: chartWidth() });
    const inChart = ts => ts.filter(t => t >= ref.t0 && t <= ref.t1);
    const everyDay = Array.from({ length: 9 }, (_, k) => I0 + (k - 4) * 24 * HOUR);
    const midnights = inChart(everyDay), noons = inChart(everyDay.map(t => t + 12 * HOUR));
    expect(midnights).toHaveLength(5);
    const lines = [...html.matchAll(/<line class="cday" x1="([\d.]+)"/g)].map(x => +x[1]);
    expect(lines).toEqual(midnights.map(t => ref.x(t)));
    // The labels sit at local noon, from Saturday's to Wednesday's, and Monday is today.
    const labels = [...html.matchAll(/<text class="caxis" x="([\d.]+)" y="[\d.]+" text-anchor="middle">([^<]+)</g)].map(x => [+x[1], x[2]]);
    // (A label is kept 10 px inside the chart's ends, and Saturday's is 13 minutes from the start.)
    const inside = x => Math.min(ref.r - 10, Math.max(ref.l + 10, x));
    expect(labels.map(l => l[0])).toEqual(noons.map(t => inside(ref.x(t))));
    expect(labels.map(l => l[1])).toEqual(['Sat', 'Sun', 'Today', 'Tue', 'Wed']);
  });
});

describe('the Light view in a half hour zone', () => {
  it("gives tomorrow's first light there once today's dark has come", () => {
    // 22:00 in Kolkata is past dusk, so the opening line asks for tomorrow's sun.
    const { m } = kolkata(I0 + 22 * HOUR);
    expect(light.summary(m).text).toMatch(/^Tomorrow: first light 4:\d\d\u00a0AM, sunset 6:\d\d\u00a0PM\. 13 h \d+ min of daylight\.$/);
  });

  it("gives the day's noon, and the six months of first light, there", () => {
    const { m } = kolkata();
    const html = light.render(m, '2026-06-16').html;
    // Solar noon at 88.3°E is 11:3x in India's zone.
    expect(html).toMatch(/Sun highest at 11:\d\d\u00a0AM\./);
    // Every first light on the chart is before 6 in the morning, as it is there from March to September.
    const dawns = [...html.matchAll(/first light (\d+):\d\d\u00a0AM/g)].map(x => +x[1]);
    expect(dawns.length).toBeGreaterThan(20);
    expect(dawns.every(h => h === 4 || h === 5)).toBe(true);
    // The chart is centred on today's solar noon there, 90 days either way, and marks now.
    const noon = sunOn(KOLKATA, NOW).noon, DAY = 24 * HOUR;
    const ref = new Chart({ t0: noon - 90 * DAY, t1: noon + 90 * DAY, W: chartWidth() });
    expect(html).toContain(`<line class="cnow" x1="${ref.x(NOW)}"`);
    // And the day is compared with the day before at the same place: seconds apart, not hours.
    const change = html.match(/(?:(\d+) min )?(\d+) s (?:less|more) than the day before/);
    expect(change, 'a change of seconds').not.toBeNull();
    expect(+(change[1] || 0)).toBeLessThan(2);
  });
});
