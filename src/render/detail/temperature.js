// Temperature: each day's range, then one day hour by hour: air and feels
// like against the freezing and cold-water lines, plus water temperature.
import { HOUR, WORD_PLAIN } from '../../config.js';
import { hm, r0, rng, ago, dayKey } from '../../format.js';
import { worstOf, factorLevel, waterTemp, waterOverridden, sunFor } from '../../logic.js';
import { Chart, niceTicks } from '../chart.js';
import { fact } from '../parts.js';
import { dayLabel } from '../days.js';
import { mid, chartWidth, weekDays, pickDay, weekStrip, legend, chartBox, hourTicks, tickEvery, lvlDot, hourTable, head } from './common.js';

const KEYS = ['freeze', 'cold'];

export const key = 'temperature';
export const name = 'Temperature';

export function summary(m) {
  const wt = waterTemp(m), water = wt != null ? `, ${r0(wt)}°F water` : '';
  if (m.daytime) return { text: `${r0(m.cur.temp)}°F air now${water}.`, lvl: factorLevel(m.cur.a, KEYS).lvl };
  const p = m.next;
  if (!p) return { text: '', lvl: null };
  return { text: `${dayLabel(p.start)} ${p.name.toLowerCase()}: ${rng(p.tmin, p.tmax, '°F')} air${water}.`, lvl: worstOf(p.hs, KEYS) };
}

export function render(m, want) {
  const S = m.S, W = chartWidth(), days = weekDays(m), day = pickDay(m, want, days);
  if (!day) return { day, html: head(name, 'No forecast yet.') };
  const wt = waterTemp(m);
  // Air plus water under the setting is a caution, so with today's water
  // temperature the cold line is an air temperature.
  const coldAir = wt != null ? S.coldCombined - wt : null;

  const temps = d => d.hs.map(h => h.temp).filter(v => v != null);
  const wLo = Math.min(...days.flatMap(temps)), wHi = Math.max(...days.flatMap(temps));
  const strip = weekStrip(days.map(d => {
    const lo = Math.min(...temps(d)), hi = Math.max(...temps(d)), l = worstOf(d.hs, KEYS);
    return { key: d.key, t: d.t, value: `${r0(hi)}° ${r0(lo)}°`, lo: (lo - wLo) / ((wHi - wLo) || 1), frac: (hi - wLo) / ((wHi - wLo) || 1), lvl: l,
      aria: `${dayLabel(d.t)}: ${r0(lo)} to ${r0(hi)}°F from first light to sunset. ${WORD_PLAIN[l]}.` };
  }), day);

  const hs = days.find(d => d.key === day).hs, s = sunFor(m, day);
  const label = dayLabel(hs[0].t + 12 * HOUR);
  const vals = hs.flatMap(h => [h.temp, h.feels]).filter(v => v != null);
  let lo = Math.min(...vals) - 3, hi = Math.max(...vals) + 3;
  // Bring the freezing and cold-water lines into view when they are close.
  if (lo < 42) lo = Math.min(lo, 29);
  if (coldAir != null && coldAir > lo - 10 && coldAir < hi + 10) { lo = Math.min(lo, coldAir - 3); hi = Math.max(hi, coldAir + 3); }
  const ticks = niceTicks(lo, hi, 4);
  lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);

  const c = new Chart({ t0: hs[0].t, t1: hs[hs.length - 1].t + HOUR, W });
  const L = c.lane(140, lo, hi, 'Air and feels like, °F');
  c.hline(L, 32, 'cthr2', '32°');
  if (coldAir != null) c.hline(L, coldAir, 'cthr1', `${r0(coldAir)}°`);
  c.grid(L, ticks, v => `${v}°`);
  c.line(L, hs.map(h => ({ t: mid(h), v: h.feels })), 'cline2');
  c.line(L, hs.map(h => ({ t: mid(h), v: h.temp })), 'cline');
  const top = hs.reduce((a, b) => (b.temp > a.temp ? b : a)), bot = hs.reduce((a, b) => (b.temp < a.temp ? b : a));
  c.note(L, mid(top), top.temp, `${r0(top.temp)}°`);
  if (bot !== top) c.note(L, mid(bot), bot.temp, `${r0(bot.temp)}°`, true);

  c.span(hs[0].t, s.sunrise, 'clight');
  if (day === dayKey(m.now)) { c.past(m.now); c.vline(m.now, 'cnow', 'Now'); }
  c.axis(hourTicks(hs, tickEvery(W, hs.length)));
  for (const h of hs) {
    const sum = wt != null && h.temp != null ? ` Air plus water ${Math.round(h.temp + wt)}°F.` : '';
    c.hit(h.t, h.t + HOUR, `${hm(h.t)}: ${r0(h.temp)}°F, feels like ${r0(h.feels)}°F. Dew point ${r0(h.dew)}°F.${sum}`);
  }

  const keys = legend([
    { kind: 'line', text: 'Air' },
    { kind: 'line2', text: 'Feels like' },
    ...(coldAir != null && coldAir >= lo && coldAir <= hi ? [{ kind: 'dash1', text: `Cold-water line, ${r0(coldAir)}°F` }] : []),
    ...(lo <= 32 ? [{ kind: 'dash2', text: 'Freezing' }] : [])
  ]);

  const f = [];
  if (wt != null) {
    f.push(fact('Water', `${r0(wt)}°F`, waterOverridden(S) ? 'Your reading, set in Settings.' :
      `Nearest main-stem gauge, near Northfield, MA, about 19 mi downstream. ${ago(m.data.river.waterC.t)}.`));
    const coldest = Math.round(bot.temp + wt);
    f.push(fact('Air plus water', `${coldest}°F`,
      coldest < S.coldCombined ? `At the coldest hour, under your ${S.coldCombined} line. Dress for immersion and row with a launch.` : `At the coldest hour, above your ${S.coldCombined} line.`,
      worstOf(hs, ['cold'])));
  } else {
    f.push(fact('Water', '--', 'Gauge unavailable. Add a dock reading in Settings.'));
  }

  const table = hourTable('Hour by hour', ['Hour', 'Air', 'Feels like', 'Dew point', 'Air plus water'], hs.map(h => [
    `${lvlDot(factorLevel(h.a, KEYS).lvl)}${hm(h.t)}`, `${r0(h.temp)}°`, `${r0(h.feels)}°`, `${r0(h.dew)}°`, wt != null ? `${Math.round(h.temp + wt)}°` : '--'
  ]));

  const lede = summary(m).text;
  const html = `${head(name, lede)}
    <div class="panel">
      ${strip}
      <h3 class="dhead">${label}, first light to sunset</h3>
      <p class="dnote">${rng(bot.temp, top.temp, '°F')}, warmest around ${hm(top.t)}.</p>
      ${chartBox(c.svg(`Air temperature and feels like by hour for ${label}`), { keys })}
      <dl class="facts">${f.join('')}</dl>
      ${table}
    </div>
    <div class="panel how">
      <h3>How this works</h3>
      <p>Air below 32°F is stay off, for ice on docks and oarlocks. Air plus water under ${S.coldCombined}°F is a caution: a capsize in cold water is the risk.${coldAir != null ? ` With the water at ${r0(wt)}°F, that is air under ${r0(coldAir)}°F, the cold-water line on the chart.` : ''}</p>
      <p>River temperature changes slowly, so the latest reading is used for every hour. A dock reading can be set in Settings.</p>
    </div>`;
  return { day, html };
}
