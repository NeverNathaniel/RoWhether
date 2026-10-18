// River: flow at North Walpole over the last 2 days and the NWS forecast for
// the next 3, then the last 30 days for context.
import { HOUR, MIN, WATER } from '../../config.js';
import { fmtInt, esc, ago, whenText, monthDay, localHour, localMinutes, weekday, dayKey } from '../../format.js';
import { flowNow, flowTrend, flowChange, flowForecastPeak, factorLevel } from '../../logic.js';
import { Chart, niceTicks, niceMax } from '../chart.js';
import { fact } from '../parts.js';
import { chartWidth, legend, chartBox, hourTable, head } from './common.js';

export const key = 'river';
export const name = 'River';

const r100 = v => fmtInt(Math.round(v / 100) * 100);
// A flow in the gauge's unit, and rounded to the hundred.
const flowText = (m, v) => m.u.flow(v, m.loc.flow?.unit);
const flow100 = (m, v) => flowText(m, Math.round(v / 100) * 100);
const fcPts = m => (m.data.flowFcst && m.data.flowFcst.pts) || [];
// The first start of a local hour at or after t. A zone such as India is not on
// UTC whole hours, so the hour starts are found from the local clock.
const hourCeil = t => {
  const start = t - (t % MIN) - (localMinutes(t) % 60) * MIN;
  return start === t ? t : start + HOUR;
};

// "Forecast to rise to about 10,300 cfs by Wed 8 PM."
function outlook(m, fl) {
  const pts = fcPts(m).filter(p => p.t >= m.now);
  if (!pts.length || fl == null) return '';
  const pk = flowForecastPeak(m.data.flowFcst, m.now), last = pts[pts.length - 1];
  if (pk.v > fl * 1.1) return `Forecast to rise to about ${flow100(m, pk.v)} by ${whenText(pk.t, true)}.`;
  if (last.v < fl * 0.9) return `Forecast to ease to about ${flow100(m, last.v)} by ${whenText(last.t, true)}.`;
  return `Forecast to hold near ${flow100(m, fl)} through ${whenText(last.t, true)}.`;
}

export function summary(m) {
  const fl = flowNow(m);
  if (fl == null) return { text: 'Gauge unavailable.', lvl: null };
  return { text: `${flowText(m, fl)} now. ${outlook(m, fl)}`.trim(), lvl: factorLevel(m.cur.a, ['flow']).lvl };
}

// Keep the settings lines in view when the flow is anywhere near them.
function topFor(S, max) {
  let hi = niceMax(max * 1.15);
  if (S.flowCaution <= hi * 1.5) hi = niceMax(Math.max(hi, S.flowCaution * 1.05));
  if (S.flowOff <= hi * 1.3) hi = niceMax(Math.max(hi, S.flowOff * 1.05));
  return hi;
}
const kfmt = v => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(v));

function settingLines(c, L, S) {
  c.hline(L, S.flowCaution, 'cthr1', kfmt(S.flowCaution));
  c.hline(L, S.flowOff, 'cthr2', kfmt(S.flowOff));
}
// Every nth point, counting back from the latest so it is always included.
const every = (pts, n) => pts.filter((_, i) => (pts.length - 1 - i) % n === 0);

export function render(m) {
  const S = m.S, W = chartWidth(), fl = flowNow(m);
  const obs = m.data.flow || [], days = m.data.flowDays || [], fc = fcPts(m);
  const lede = summary(m).text;
  if (!obs.length && !days.length && !fc.length) {
    return { day: null, html: `${head(name, lede)}<div class="panel"><p>River data is not available right now. Try Refresh.</p></div>` };
  }
  const tNow = obs.length ? obs[obs.length - 1] : (fl != null ? { t: m.now, v: fl } : null);
  const far = fl != null && S.flowCaution > Math.max(fl, ...fc.map(p => p.v)) * 1.5;

  // Near term: last 2 days measured, next 3 forecast.
  let near = '';
  if (obs.length || fc.length) {
    const t0 = obs.length ? obs[0].t : m.now - 48 * HOUR, t1 = Math.max(fc.length ? fc[fc.length - 1].t : 0, m.now + 6 * HOUR);
    const c = new Chart({ t0, t1, W });
    const hi = topFor(S, Math.max(1000, ...obs.map(p => p.v), ...fc.map(p => p.v)));
    const L = c.lane(150, 0, hi, `Flow, ${m.u.flowUnit(m.loc.flow?.unit)}`);
    settingLines(c, L, S);
    c.grid(L, niceTicks(0, hi), kfmt);
    c.band(L, obs.map(p => ({ t: p.t, lo: 0, hi: p.v })), 'carea');
    c.line(L, obs, 'cline');
    if (fc.length) c.line(L, (tNow ? [tNow] : []).concat(fc.filter(p => !tNow || p.t > tNow.t)), 'cfcst');
    const pk = flowForecastPeak(m.data.flowFcst, m.now);
    if (pk && fl != null && pk.v > fl * 1.1) c.note(L, pk.t, pk.v, r100(pk.v));
    for (let t = hourCeil(t0); t <= t1; t += HOUR) {
      if (localHour(t) === 0) c.vline(t, 'cday');
    }
    c.vline(m.now, 'cnow', 'Now');
    const ticks = [];
    for (let t = hourCeil(t0); t <= t1; t += HOUR) {
      if (localHour(t) === 12) ticks.push({ t, text: dayKey(t) === dayKey(m.now) ? 'Today' : weekday(t) });
    }
    c.axis(ticks);
    c.hitsAt([
      ...every(obs, 8).map(p => ({ t: p.t, text: `${whenText(p.t)}: ${flowText(m, p.v)}, measured.` })),
      ...fc.filter(p => !tNow || p.t > tNow.t).map(p => ({ t: p.t, text: `${whenText(p.t)}: about ${flow100(m, p.v)}, NWS forecast.` }))
    ]);
    const keys = legend([
      { kind: 'line', text: 'Measured' },
      ...(fc.length ? [{ kind: 'fcst', text: 'NWS forecast' }] : []),
      ...(S.flowCaution <= hi ? [{ kind: 'dash1', text: `Caution ${fmtInt(S.flowCaution)}` }] : []),
      ...(S.flowOff <= hi ? [{ kind: 'dash2', text: `Stay off ${fmtInt(S.flowOff)}` }] : [])
    ]);
    near = `<h3 class="dhead">Last 2 days and next 3</h3>
      ${chartBox(c.svg('River flow over the last 2 days and the NWS forecast for the next 3'), { keys, hint: 'Tap the chart for a reading.' })}`;
  }

  // Context: the last 30 days of daily means, then the forecast.
  let month = '';
  if (days.length) {
    const tail = obs.filter(p => p.t > days[days.length - 1].t);
    const t0 = days[0].t - 12 * HOUR, t1 = Math.max(fc.length ? fc[fc.length - 1].t : 0, tNow ? tNow.t : 0, days[days.length - 1].t + 12 * HOUR);
    const c = new Chart({ t0, t1, W });
    const hi = topFor(S, Math.max(1000, ...days.map(p => p.v), ...fc.map(p => p.v), ...tail.map(p => p.v)));
    const L = c.lane(120, 0, hi, `Flow, ${m.u.flowUnit(m.loc.flow?.unit)}. Daily mean, then the latest readings`);
    settingLines(c, L, S);
    c.grid(L, niceTicks(0, hi), kfmt);
    const meas = days.concat(every(tail, 4));
    c.band(L, meas.map(p => ({ t: p.t, lo: 0, hi: p.v })), 'carea');
    c.line(L, meas, 'cline');
    if (fc.length && tNow) c.line(L, [tNow].concat(fc.filter(p => p.t > tNow.t)), 'cfcst');
    const lo = days.reduce((a, b) => (b.v < a.v ? b : a)), top = days.reduce((a, b) => (b.v > a.v ? b : a));
    c.note(L, top.t, top.v, kfmt(Math.round(top.v)));
    c.vline(m.now, 'cnow', 'Now');
    const ticks = days.filter((_, i) => (days.length - 1 - i) % 7 === 0).map(p => ({ t: p.t, text: monthDay(p.t) }));
    c.axis(ticks);
    c.hitsAt([
      ...days.map(p => ({ t: p.t, text: `${monthDay(p.t)}: ${flowText(m, Math.round(p.v))}, daily mean.` })),
      ...every(tail, 8).map(p => ({ t: p.t, text: `${whenText(p.t)}: ${flowText(m, p.v)}, measured.` })),
      ...fc.filter(p => !tNow || p.t > tNow.t).map(p => ({ t: p.t, text: `${whenText(p.t)}: about ${flow100(m, p.v)}, NWS forecast.` }))
    ]);
    month = `<h3 class="dhead">Last 30 days</h3>
      <p class="dnote">Daily mean from ${flowText(m, lo.v)} on ${monthDay(lo.t)} to ${fmtInt(top.v)} on ${monthDay(top.t)}.</p>
      ${chartBox(c.svg('Daily mean river flow over the last 30 days'), { hint: 'Tap the chart for a day.' })}`;
  }

  const f = [];
  if (fl != null) {
    const tr = flowTrend(obs), pct = flowChange(obs);
    const debris = pct != null && pct >= WATER.debrisRise ? ' Rising fast. Watch for floating debris.' : '';
    f.push(fact('Flow now', flowText(m, fl), `${tr ? tr + '. ' : ''}${ago(m.data.river.flow.t)}.${debris}`, factorLevel(m.cur.a, ['flow']).lvl));
  }
  const pk = flowForecastPeak(m.data.flowFcst, m.now);
  if (pk) {
    const iss = m.data.flowFcst.issued;
    f.push(fact('NWS forecast peak', flow100(m, pk.v), `Around ${whenText(pk.t, true)}.${iss ? ` Issued ${whenText(iss, true)}.` : ''}`));
  } else {
    f.push(fact('NWS forecast', '--', 'Not available right now.'));
  }
  f.push(fact('Your settings', flowText(m, S.flowCaution), `Caution at ${fmtInt(S.flowCaution)}, stay off at ${fmtInt(S.flowOff)}.${far ? ' Well above the current flow.' : ''}`));

  const fcTable = fc.length ? hourTable('NWS forecast', ['Time', 'Flow'], fc.map(p => [whenText(p.t), flow100(m, p.v)])) : '';
  const dayTable = days.length ? hourTable('Daily means', ['Day', 'Flow'], days.slice().reverse().map(p => [monthDay(p.t), flowText(m, p.v)])) : '';

  // The place's own words for how the flow is measured and what its numbers mean.
  const { flowHow, flowStats } = m.loc.copy, para = t => (t ? `<p>${esc(t)}</p>` : '');
  const html = `${head(name, lede)}
    <div class="panel">
      <dl class="facts">${f.join('')}</dl>
      ${near}
      ${fcTable}
    </div>
    <div class="panel">
      ${month}
      ${dayTable}
    </div>
    <div class="panel how">
      <h3>How this works</h3>
      ${para(flowHow)}
      <p>The latest measured flow is checked against your settings. The forecast is for planning and does not change Go, Caution or Stay off. A rise of ${WATER.debrisRise}% or more in 6 hours adds a floating debris warning.</p>
      ${para(flowStats)}
    </div>`;
  return { day: null, html };
}
