// Wind: the strongest wind each day, then one day hour by hour: wind and
// gusts against the settings, direction relative to the course, and water state.
import { HOUR, WATER, WORD_PLAIN } from '../../config.js';
import { hm, r0, card, dayKey, esc } from '../../format.js';
import { factorLevel, worstOf, relWind, windVsCourse, sunFor, confidence, confidenceText, still, bound } from '../../logic.js';
import { Chart, niceTicks, niceMax } from '../chart.js';
import { dayLabel } from '../days.js';
import { mid, chartWidth, weekDays, pickDay, weekStrip, legend, chartBox, hourTicks, tickEvery, lvlDot, hourTable, head } from './common.js';

const KEYS = ['wind', 'gust'];
const gustLvl = (S, g) => (r0(g) >= S.gustOff ? 2 : r0(g) >= S.gustCaution ? 1 : 0);

export const key = 'wind';
export const name = 'Wind';

export function summary(m) {
  if (m.daytime) {
    const c = m.cur;
    return { text: `${m.u.speed(c.wind)} from ${card(c.dir)} now, gusts ${r0(c.gust)}.`, lvl: factorLevel(c.a, KEYS).lvl };
  }
  const p = m.next;
  if (!p) return { text: '', lvl: null };
  return { text: `${dayLabel(p.start)} ${p.name.toLowerCase()}: ${m.u.speedRange(p.wmin, p.wmax)}, gusts ${r0(p.gmax)}.`, lvl: worstOf(p.hs, KEYS) };
}

// Where the wind blows, turned so upstream is up the page.
function arrow(h, heading) {
  if (h.wind == null || h.dir == null) return '';
  if (h.wind < 3) return '<circle class="carrow-calm" r="2.5"/>';
  return `<g transform="rotate(${Math.round(relWind(h.dir, heading))})"><line class="carrow" x1="0" y1="-8" x2="0" y2="3"/><path class="carrow-head" d="M-4 1L4 1L0 8Z"/></g>`;
}

// "Headwind up", "Cross, NH": the course note in a table cell, with the short name of the bank.
function courseWord(h, loc) {
  if (h.wind == null || h.dir == null) return '--';
  if (h.wind < 3) return 'Calm';
  const rel = relWind(h.dir, loc.course.heading), c = Math.cos(rel * Math.PI / 180);
  if (c >= 0.5) return 'Headwind up';
  if (c <= -0.5) return 'Tailwind up';
  const b = loc.banks;
  return b ? `Cross, ${esc((rel > 0 ? b.right : b.left).short)}` : 'Cross';
}

const modelRange = (h, u) => (h.ens && h.ens.wind.length >= 2 ? ` Models ${r0(Math.min(...h.ens.wind))} to ${u.speed(Math.max(...h.ens.wind))}.` : '');
const hourText = (m, h) =>
  `${hm(h.t)}: ${m.u.speed(h.wind)} from ${card(h.dir)}, gusts ${r0(h.gust)}. ${windVsCourse(m, h.dir, h.wind)}${h.water ? ` ${WATER.names[h.water.lvl]}.` : ''}${modelRange(h, m.u)}`;

export function render(m, want) {
  const S = m.S, W = chartWidth(), days = weekDays(m), day = pickDay(m, want, days), course = m.loc.course.kind === 'heading', tidal = m.loc.water.mode === 'tidal', harbor = m.loc.waterType === 'harbor', canal = m.loc.water.mode === 'canal';
  const lede = summary(m).text;
  if (!day) return { day, html: head(name, 'No forecast yet.') };

  const top = Math.max(20, ...days.flatMap(d => d.hs.map(h => h.wind || 0)));
  const strip = weekStrip(days.map(d => {
    const w = Math.max(...d.hs.map(h => h.wind || 0)), g = Math.max(...d.hs.map(h => h.gust || 0)), l = worstOf(d.hs, KEYS);
    return { key: d.key, t: d.t, value: m.u.speed(w), frac: w / top, lvl: l, aria: `${dayLabel(d.t)}: wind up to ${m.u.speed(w)}, gusts ${r0(g)}. ${WORD_PLAIN[l]}.` };
  }), day);

  const hs = days.find(d => d.key === day).hs, s = sunFor(m, day);
  const c = new Chart({ t0: hs[0].t, t1: hs[hs.length - 1].t + HOUR, W });
  const hi = niceMax(Math.max(S.windOff + 2, ...hs.map(h => h.gust || 0)));
  const L = c.lane(130, 0, hi, `Wind and gusts, ${m.u.speedUnit}`);
  c.hline(L, S.windCaution, 'cthr1');
  c.hline(L, S.windOff, 'cthr2');
  c.grid(L, niceTicks(0, hi));
  c.band(L, hs.map(h => ({ t: mid(h), lo: h.wind, hi: h.gust })), 'cband');
  c.line(L, hs.map(h => ({ t: mid(h), v: h.gust })), 'cedge');
  c.line(L, hs.map(h => ({ t: mid(h), v: h.wind })), 'cline');
  const gusty = hs.filter(h => gustLvl(S, h.gust));
  for (const h of gusty) c.dot(L, mid(h), h.gust, `cdot b${gustLvl(S, h.gust)}`);

  // With no course set there is no up the page to turn the arrows to (01 10.1).
  if (course) {
    const D = c.lane(22, 0, 1, 'Direction on the course, upstream is up');
    const thin = (W - 46) / hs.length < 15 ? 2 : 1;
    hs.forEach((h, i) => { if (i % thin === 0) c.glyph(D, mid(h), arrow(h, m.loc.course.heading)); });
  }
  const WS = c.lane(14, 0, 1, 'Water state');
  c.cells(WS, hs.map(h => ({ t0: h.t, t1: h.t + HOUR, cls: h.water ? `cw cw${h.water.lvl}` : '' })));

  // Forecast confidence: the range of sustained wind across the compared
  // models, with the forecast's own wind line over it.
  const conf = confidence(hs);
  const ranged = hs.filter(h => h.ens && h.ens.wind.length >= 2);
  if (ranged.length) {
    const mHi = niceMax(Math.max(10, ...ranged.map(h => Math.max(...h.ens.wind)), ...hs.map(h => h.wind || 0)), 2);
    const M = c.lane(60, 0, mHi, `Wind across ${conf.n} forecast models, ${m.u.speedUnit}`);
    c.grid(M, niceTicks(0, mHi, 2));
    c.band(M, ranged.map(h => ({ t: mid(h), lo: Math.min(...h.ens.wind), hi: Math.max(...h.ens.wind) })), 'cmodel');
    c.line(M, hs.map(h => ({ t: mid(h), v: h.wind })), 'cline');
  }

  c.span(hs[0].t, s.sunrise, 'clight');
  if (day === dayKey(m.now)) { c.past(m.now); c.vline(m.now, 'cnow', 'Now'); }
  c.axis(hourTicks(hs, tickEvery(W, hs.length)));
  for (const h of hs) c.hit(h.t, h.t + HOUR, hourText(m, h));

  const keys = legend([
    { kind: 'line', text: 'Wind' },
    { kind: 'band', text: 'Gusts' },
    { kind: 'dash1', text: `Caution ${m.u.speed(S.windCaution)}` },
    { kind: 'dash2', text: `Stay off ${m.u.speed(S.windOff)}` },
    ...(gusty.length ? [{ kind: 'dot', text: `Gusts over ${m.u.speed(S.gustCaution)}` }] : [])
  ]);
  const waterKeys = legend(WATER.names.map((n, i) => ({ kind: `cw${i}`, text: n })))
    + (ranged.length ? legend([{ kind: 'model', text: 'Range across models' }]) : '');
  const peak = hs.reduce((a, b) => ((b.wind || 0) > (a.wind || 0) ? b : a));

  const table = hourTable('Hour by hour', ['Hour', 'Wind', 'Gust', 'From', ...(course ? ['Course'] : []), 'Water'], hs.map(h => [
    `${lvlDot(factorLevel(h.a, KEYS).lvl)}${hm(h.t)}`, m.u.speed(h.wind), `${r0(h.gust)}`, card(h.dir), ...(course ? [courseWord(h, m.loc)] : []), h.water ? WATER.short[h.water.lvl] : '--'
  ]));

  const html = `${head(name, lede)}
    <div class="panel">
      ${strip}
      <h3 class="dhead">${dayLabel(hs[0].t + 12 * HOUR)}, first light to sunset</h3>
      <p class="dnote">Strongest ${m.u.speed(peak.wind)} around ${hm(peak.t)}, gusts to ${r0(Math.max(...hs.map(h => h.gust || 0)))}.${conf ? ` ${confidenceText(conf, 'wind', m.u)}` : ''}</p>
      ${chartBox(c.svg(`Wind and gusts by hour for ${dayLabel(hs[0].t + 12 * HOUR)}`), { keys: keys + waterKeys })}
      ${table}
    </div>
    <div class="panel how">
      <h3>How this works</h3>
      <p>Sustained wind and gusts are checked against your settings. Caution at ${m.u.speed(S.windCaution)} wind or ${m.u.speed(S.gustCaution)} gusts, stay off at ${S.windOff} or ${S.gustOff}.</p>
      <p>${course ? `Arrows show where the wind is blowing, with the river running up the page. An arrow pointing down is a headwind rowing upstream. The course heading is ${m.loc.course.heading}°, set in Settings.` : 'Head and crosswind are not shown because no course is set here.'}</p>
      <p>Water state is information only and does not change Go, Caution or Stay off. ${still(m.loc) ? 'It follows the wind and how far the wind has blown over open water, which is called fetch: a longer reach builds bigger waves.' : 'Wind along the straight counts fully and crosswind counts for less.'} It blends the last three hours, since chop takes time to build and settle${still(m.loc) || tidal || canal ? '' : ', and goes up when wind blows against a strong current'}.${tidal || harbor && bound(m, 'tide') ? ' The tide forecast has heights only, so the tide\'s current is not counted.' : ''}${harbor ? ' Swell from open water is not included.' : ''}</p>
      <p>Shaded hours before sunrise need lights.</p>
    </div>`;
  return { day, html };
}
