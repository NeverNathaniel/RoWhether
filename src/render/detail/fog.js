// Fog: each morning's risk, then one morning hour by hour with the
// ingredients the fog rules look at, each drawn with its fog zone.
import { HOUR, FOG } from '../../config.js';
import { hm, r0, visText, dayKey, localHour, dayWord } from '../../format.js';
import { fogRisk, morningFog, fogLift, nextMorning, relHumidity, waterTemp, sunFor } from '../../logic.js';
import { Chart, niceTicks, niceMax } from '../chart.js';
import { dayLabel } from '../days.js';
import { mid, chartWidth, weekDays, pickDay, weekStrip, legend, chartBox, hourTicks, tickEvery, hourTable, head } from './common.js';

export const key = 'fog';
export const name = 'Fog';

const RISK = ['Low', 'Possible', 'Likely'];
// Likely fog is a caution. Possible fog is shown but does not change Go, Caution or Stay off.
const riskLvl = r => (r === 2 ? 1 : r === 1 ? 'p' : 0);

export function summary(m) {
  const nm = nextMorning(m);
  if (!nm) return { text: '', lvl: null };
  const when = nm.key === dayKey(m.now) ? 'This morning' : `${dayWord(nm.t)} morning`;
  if (!nm.fog) return { text: `${when}: fog risk low.`, lvl: 0 };
  return { text: `${when}: ${nm.fog.text.toLowerCase()}, ${fogLift(nm.fog)}.`, lvl: riskLvl(nm.fog.risk) };
}

const mi = h => (h.vis != null ? Math.min(10, h.vis / 1609.34) : null);

export function render(m, want) {
  const W = chartWidth(), days = weekDays(m), wt = waterTemp(m);
  const nm = nextMorning(m);
  const day = pickDay(m, want || (nm && nm.key), days);
  if (!day) return { day, html: head(name, 'No forecast yet.') };

  const strip = weekStrip(days.map(d => {
    const f = morningFog(m, d.key), r = f ? f.risk : 0;
    return { key: d.key, t: d.t, value: RISK[r], frac: [0.2, 0.6, 1][r], lvl: riskLvl(r),
      aria: `${dayLabel(d.t)} morning: ${f ? `${f.text.toLowerCase()}, ${fogLift(f)}` : 'fog risk low'}.` };
  }), day);

  // Midnight through the last fog hour.
  const hs = m.hours.filter(h => dayKey(h.t) === day && localHour(h.t) <= FOG.lastHour);
  const s = sunFor(m, day), label = dayLabel(hs[0].t + 12 * HOUR);
  const mf = morningFog(m, day);
  const risks = hs.map(h => fogRisk(m, h));
  const c = new Chart({ t0: hs[0].t, t1: hs[hs.length - 1].t + HOUR, W });
  const V = FOG.valley, ST = FOG.steam;

  const R = c.lane(14, 0, 1, 'Fog risk');
  c.cells(R, hs.map((h, i) => ({ t0: h.t, t1: h.t + HOUR, cls: risks[i].risk ? `cf cf${risks[i].risk}` : '' })));

  const spreads = hs.map(h => (h.temp != null && h.dew != null ? h.temp - h.dew : null));
  const sHi = niceMax(Math.min(20, Math.max(8, ...spreads.filter(v => v != null))), 2);
  const A = c.lane(52, 0, sHi, 'Air minus dew point, °F');
  c.zone(A, 0, V.likely.spread, 'cz2'); c.zone(A, V.likely.spread, V.possible.spread, 'cz1');
  c.grid(A, niceTicks(0, sHi, 2), v => `${v}°`);
  c.line(A, hs.map((h, i) => ({ t: mid(h), v: spreads[i] })), 'cline');

  const wHi = niceMax(Math.max(10, ...hs.map(h => h.wind || 0)), 2);
  const B = c.lane(52, 0, wHi, 'Wind, mph');
  c.zone(B, 0, V.likely.wind, 'cz2'); c.zone(B, V.likely.wind, V.possible.wind, 'cz1');
  c.grid(B, niceTicks(0, wHi, 2));
  c.line(B, hs.map(h => ({ t: mid(h), v: h.wind })), 'cline');

  const C = c.lane(52, 0, 100, 'Cloud cover, mean of the last 6 hours, %');
  c.zone(C, 0, V.likely.cloud, 'cz2'); c.zone(C, V.likely.cloud, V.possible.cloud, 'cz1');
  c.grid(C, [0, 50, 100], v => `${v}%`);
  c.line(C, hs.map(h => ({ t: mid(h), v: h.nightCloud })), 'cline');

  if (wt != null) {
    const diffs = hs.map(h => (h.temp != null ? wt - h.temp : null)).filter(v => v != null);
    const dLo = Math.min(0, Math.floor(Math.min(...diffs) / 5) * 5), dHi = niceMax(Math.max(24, ...diffs), 2);
    const D = c.lane(52, dLo, dHi, 'Water minus air, °F');
    c.zone(D, ST.likely.diff, dHi, 'cz2'); c.zone(D, ST.possible.diff, ST.likely.diff, 'cz1');
    c.grid(D, niceTicks(dLo, dHi, 2), v => `${v}°`);
    c.line(D, hs.map(h => ({ t: mid(h), v: h.temp != null ? wt - h.temp : null })), 'cline');
  }

  const E = c.lane(40, 0, 10, 'Visibility in the model, miles');
  c.zone(E, 0, 1, 'cz2');
  c.grid(E, [0, 5, 10], v => (v === 10 ? '10+' : String(v)));
  c.line(E, hs.map(h => ({ t: mid(h), v: mi(h) })), 'cline');

  c.vline(s.dawn, 'cmarkline', 'First light');
  if (day === dayKey(m.now)) { c.past(m.now); c.vline(m.now, 'cnow', 'Now'); }
  c.axis(hourTicks(hs, tickEvery(W, hs.length) === 1 ? 1 : 2));
  hs.forEach((h, i) => {
    const f = risks[i], rh = h.temp != null && h.dew != null ? Math.round(relHumidity(h.temp, h.dew)) : null;
    c.hit(h.t, h.t + HOUR, `${hm(h.t)}: ${f.risk ? f.text : 'Fog risk low'}. Air ${r0(h.temp)}°F, dew point ${r0(h.dew)}°F, humidity ${rh}%. Wind ${r0(h.wind)} mph. Cloud ${r0(h.nightCloud)}%. Visibility ${visText(h.vis)}.${f.risk ? ` ${f.why}` : ''}`);
  });

  const keys = legend([
    { kind: 'cf2', text: 'Fog likely' }, { kind: 'cf1', text: 'Fog possible' },
    { kind: 'zone2', text: 'Zone for likely' }, { kind: 'zone1', text: 'Zone for possible' }
  ]);

  const table = hourTable('Hour by hour', ['Hour', 'Risk', 'Air', 'Dew pt', 'Wind', 'Cloud', 'Vis'], hs.map((h, i) => [
    hm(h.t), RISK[risks[i].risk], `${r0(h.temp)}°`, `${r0(h.dew)}°`, `${r0(h.wind)}`, `${r0(h.nightCloud)}%`, visText(h.vis)
  ]));

  const morning = mf ? `${mf.text}, ${fogLift(mf)}. ${mf.why}` : 'Fog risk low from first light through the 10 AM hour.';
  const html = `${head(name, summary(m).text)}
    <div class="panel">
      ${strip}
      <h3 class="dhead">${label}, midnight to 11 AM</h3>
      <p class="dnote">${morning} First light ${hm(s.dawn)}.</p>
      ${chartBox(c.svg(`Fog risk and its ingredients by hour for ${label} morning`), { keys })}
      ${table}
    </div>
    <div class="panel how">
      <h3>How this works</h3>
      <p>Each line is one thing the fog rules look at. When a line runs through its shaded zone, that part of the rule is met. Fog is likely only when every part is met at once.</p>
      <p>Valley fog forms on clear, calm nights when the air cools to its dew point. Likely: air within ${V.likely.spread}°F of the dew point, wind ${V.likely.wind} mph or less, and cloud cover ${V.likely.cloud}% or less. Possible: within ${V.possible.spread}°F, ${V.possible.wind} mph, ${V.possible.cloud}%.</p>
      <p>Steam fog rises off water much warmer than the air. Likely: water at least ${ST.likely.diff}°F warmer, wind ${ST.likely.wind} mph or less, humidity ${ST.likely.rh}% or more. Possible: ${ST.possible.diff}°F, ${ST.possible.wind} mph, ${ST.possible.rh}%. ${wt != null ? `Water is ${r0(wt)}°F.` : 'No water temperature is available, so steam fog is not checked.'}</p>
      <p>The model can also show fog itself, as a fog weather code or visibility under 1 mile, at any hour.</p>
      <p>Likely fog is a caution. Possible fog is shown but does not change Go, Caution or Stay off. These thresholds are first guesses, to be tuned against what the dock sees.</p>
    </div>`;
  return { day, html };
}
