// Storms: thunderstorm risk each day, then one day hour by hour with what
// the risk is built from (instability, rain chance, gusts), and the NWS
// alerts that cover the dock.
import { HOUR } from '../../config.js';
import { esc, hm, r0, dayKey, whenText } from '../../format.js';
import { factorLevel, worstOf, sunFor } from '../../logic.js';
import { Chart, niceTicks, niceMax } from '../chart.js';
import { dayLabel } from '../days.js';
import { mid, chartWidth, weekDays, pickDay, weekStrip, legend, chartBox, hourTicks, tickEvery, lvlDot, hourTable, head } from './common.js';

const KEYS = ['storm', 'stormrisk'];
const RISK = ['Low', 'Possible', 'Storms'];

export const key = 'storms';
export const name = 'Storms';

export function summary(m) {
  const alerts = m.alerts.length ? ` ${m.alerts.length} NWS alert${m.alerts.length > 1 ? 's' : ''} active.` : '';
  const next = m.h72.find(h => factorLevel(h.a, KEYS).lvl);
  if (!next) return { text: `No thunderstorm risk in the next 3 days.${alerts}`, lvl: m.alerts.length ? Math.max(...m.alerts.map(a => a.lvl)) : 0 };
  const why = factorLevel(next.a, KEYS);
  return { text: `${why.why.text} ${next.t <= m.now ? 'now' : `from ${whenText(next.t, true)}`}.${alerts}`, lvl: why.lvl };
}

function hourText(m, h) {
  const st = factorLevel(h.a, KEYS).why;
  return `${hm(h.t)}: ${st ? st.text : 'No thunderstorm risk'}. Instability ${r0(h.cape) ?? 0} J/kg, rain chance ${r0(h.pop) ?? 0}%, gusts ${m.u.speed(h.gust)}.`;
}

// NWS alerts as bars over the next 3 days, with their full text.
function alertsPanel(m) {
  if (!m.alerts.length) return '<p class="dnote">No active NWS alerts for the dock.</p>';
  const t0 = m.now, t1 = m.now + 72 * HOUR;
  const pos = t => Math.max(0, Math.min(100, (t - t0) / (t1 - t0) * 100)).toFixed(2);
  return `<ul class="alertlist">${m.alerts.map(a => {
    const until = a.end >= 8e15 ? 'until further notice' : `until ${whenText(a.end, true)}`;
    const from = a.start > m.now ? `From ${whenText(a.start, true)} ${until}` : `Now ${until}`;
    return `<li>
      <div class="arow"><i data-lvl="${a.lvl}" aria-hidden="true"></i><strong>${esc(a.event)}</strong></div>
      <span class="wbar" aria-hidden="true"><i class="track" style="left:0;width:100%"></i><i class="seg b${a.lvl}" style="left:${pos(a.start)}%;width:${(pos(a.end) - pos(a.start)).toFixed(2)}%"></i></span>
      <p class="wnote">${esc(from)}.${a.headline ? ` ${esc(a.headline)}` : ''}</p>
      ${a.desc ? `<details class="twin" data-keep="alert-${esc(a.event)}"><summary>Full alert</summary><pre class="alerttext">${esc(a.desc)}${a.instr ? '\n\n' + esc(a.instr) : ''}</pre></details>` : ''}
    </li>`;
  }).join('')}</ul>`;
}

export function render(m, want) {
  const S = m.S, W = chartWidth(), days = weekDays(m), day = pickDay(m, want, days);
  if (!day) return { day, html: head(name, 'No forecast yet.') };

  const strip = weekStrip(days.map(d => {
    const l = worstOf(d.hs, KEYS), cape = Math.max(0, ...d.hs.map(h => h.cape || 0));
    return { key: d.key, t: d.t, value: RISK[l], frac: l ? Math.min(1, 0.45 + cape / 3000) : Math.min(0.3, cape / 3000), lvl: l,
      aria: `${dayLabel(d.t)}: thunderstorm risk ${RISK[l].toLowerCase()}, instability up to ${r0(cape)} J/kg.` };
  }), day);

  const hs = days.find(d => d.key === day).hs, s = sunFor(m, day);
  const label = dayLabel(hs[0].t + 12 * HOUR);
  const c = new Chart({ t0: hs[0].t, t1: hs[hs.length - 1].t + HOUR, W });

  const R = c.lane(14, 0, 1, 'Thunderstorm risk');
  c.cells(R, hs.map(h => { const l = factorLevel(h.a, KEYS).lvl; return { t0: h.t, t1: h.t + HOUR, cls: l ? `cs b${l}` : '' }; }));

  const capeHi = niceMax(Math.max(1500, ...hs.map(h => h.cape || 0)), 3);
  const C = c.lane(80, 0, capeHi, 'Instability (CAPE), J/kg');
  c.zone(C, 1000, capeHi, 'cz1');
  c.hline(C, 1000, 'cthr1', '1000');
  c.grid(C, niceTicks(0, capeHi, 3));
  c.band(C, hs.map(h => ({ t: mid(h), lo: 0, hi: h.cape || 0 })), 'carea');
  c.line(C, hs.map(h => ({ t: mid(h), v: h.cape })), 'cline');

  const P = c.lane(60, 0, 100, 'Chance of rain, %');
  c.hline(P, 30, 'cthr1', '30%');
  c.grid(P, [0, 50, 100], v => `${v}%`);
  c.cols(P, hs.map(h => ({ t0: h.t, t1: h.t + HOUR, v: h.pop, cls: 'ccol' })));

  const gHi = niceMax(Math.max(S.gustOff + 2, ...hs.map(h => h.gust || 0)), 3);
  const G = c.lane(60, 0, gHi, `Gusts, ${m.u.speedUnit}`);
  c.hline(G, S.gustCaution, 'cthr1');
  c.hline(G, S.gustOff, 'cthr2');
  c.grid(G, niceTicks(0, gHi, 2));
  c.line(G, hs.map(h => ({ t: mid(h), v: h.gust })), 'cline');

  c.span(hs[0].t, s.sunrise, 'clight');
  if (day === dayKey(m.now)) { c.past(m.now); c.vline(m.now, 'cnow', 'Now'); }
  c.axis(hourTicks(hs, tickEvery(W, hs.length)));
  for (const h of hs) c.hit(h.t, h.t + HOUR, hourText(m, h));

  const keys = legend([
    { kind: 'cs1', text: 'Thunderstorms possible' }, { kind: 'cs2', text: 'Thunderstorms' },
    { kind: 'zone1', text: 'Unstable air, 1000 J/kg and up' }
  ]);
  const worst = worstOf(hs, KEYS);
  const note = worst
    ? `${RISK[worst] === 'Storms' ? 'Thunderstorms in the forecast' : 'Thunderstorms possible'}. Peak instability ${r0(Math.max(...hs.map(h => h.cape || 0)))} J/kg.`
    : 'No thunderstorm risk from first light to sunset.';
  const table = hourTable('Hour by hour', ['Hour', 'Risk', 'CAPE', 'Rain', 'Gusts'], hs.map(h => {
    const l = factorLevel(h.a, KEYS).lvl;
    return [`${lvlDot(l)}${hm(h.t)}`, RISK[l], `${r0(h.cape) ?? 0}`, `${r0(h.pop) ?? 0}%`, `${r0(h.gust)}`];
  }));

  const html = `${head(name, summary(m).text)}
    <div class="panel">
      <h3>NWS alerts</h3>
      ${alertsPanel(m)}
    </div>
    <div class="panel">
      ${strip}
      <h3 class="dhead">${label}, first light to sunset</h3>
      <p class="dnote">${esc(note)}</p>
      ${chartBox(c.svg(`Thunderstorm risk and its ingredients by hour for ${label}`), { keys })}
      ${table}
    </div>
    <div class="panel how">
      <h3>How this works</h3>
      <p>A thunderstorm in the forecast (weather codes 95 to 99) is stay off. Thunderstorms are possible, a caution, when the air is unstable, CAPE of 1,000 J/kg or more, and the chance of rain is at least 30%. CAPE measures how much energy a rising pocket of air has: the fuel for storm clouds.</p>
      <p>NWS alerts apply to the hours they cover. Thunderstorm, flood, wind, dense fog and winter storm alerts are stay off. Others are a caution.</p>
      <p>Lightning: off the water at the first thunder, back on 30 minutes after the last. Storms can form faster than the forecast shows. Watch the sky to the west.</p>
    </div>`;
  return { day, html };
}
