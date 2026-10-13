// "On the water now": compass and current facts.
import { HOUR, WATER } from '../config.js';
import { app, $ } from '../state.js';
import { r0, card, fmtInt, ago, visText, hm, dayKey, dayWord } from '../format.js';
import { precipSummary, precipKind, rateWord, fogRisk, nextMorning, fogLift, waterWhy, debrisLikely, flowNow, flowTrend, waterTemp, waterOverridden, windVsCourse, sunFor } from '../logic.js';
import { fact, compassSVG, sparkline } from './parts.js';

// Fog now if there is any, otherwise the outlook for the next morning.
function visibilityNote(m) {
  const fr = fogRisk(m, m.cur);
  const nm = nextMorning(m);
  if (fr.risk) {
    const today = nm && nm.key === dayKey(m.now) && nm.fog ? `, ${fogLift(nm.fog)}` : '';
    return `${fr.text} now${today}. ${fr.why}`;
  }
  if (!nm) return 'Fog risk low.';
  const when = nm.key === dayKey(m.now) ? 'this morning' : `${dayWord(nm.t, true)} morning`;
  if (!nm.fog) return `Fog risk low now and ${when}.`;
  return `Fog risk low now. ${when[0].toUpperCase() + when.slice(1)}: ${nm.fog.text.toLowerCase()}, ${fogLift(nm.fog)}. ${nm.fog.why}`;
}

// What is falling now, and the highest chance over the next 3 hours.
function precipFact(m, lvl) {
  const cur = m.cur;
  const next = m.h72.filter(h => h.t + HOUR > m.now && h.t < m.now + 3 * HOUR);
  const sum = precipSummary(next);
  const kind = precipKind(cur.code);
  const nowText = !kind ? 'Dry now.'
    : kind === 'thunderstorms' || kind === 'freezing rain' ? `${kind[0].toUpperCase() + kind.slice(1)} now.`
    : `${rateWord(cur.precip || 0)[0].toUpperCase() + rateWord(cur.precip || 0).slice(1)} ${kind} now.`;
  if (!sum) return fact('Precipitation', '--', nowText);
  const outlook = sum.peak < 20 ? 'Under 20% chance for the next 3 hours.'
    : `Highest chance in the next 3 hours around ${sum.peakT <= m.now ? 'now' : hm(sum.peakT)}.`;
  return fact('Precipitation', `${sum.peak}% chance`, `${nowText} ${outlook}`, lvl);
}

export function renderNow() {
  const m = app.model, S = m.S, cur = m.cur, a = cur.a;
  // Current conditions are only shown in daylight.
  $('nowSection').hidden = !m.daytime;
  if (!m.daytime) return;
  const lvlOf = key => { const x = a.reasons.find(r => r.key === key); return x ? x.lvl : 0; };

  $('compass').innerHTML = compassSVG(S.heading, cur.dir, cur.wind);
  $('compassCap').textContent = cur.wind != null
    ? `Wind from ${card(cur.dir)}. River runs ${card(S.heading + 180)}, upstream heading ${S.heading}°.`
    : '';

  const f = [];
  const windLvl = Math.max(lvlOf('wind'), lvlOf('gust'));
  f.push(fact('Wind', `${r0(cur.wind)} mph, gusts ${r0(cur.gust)}`, `From ${card(cur.dir)}. ${windVsCourse(m, cur.dir, cur.wind)}`, windLvl));

  if (cur.water) {
    const debris = debrisLikely(m) ? ' River rising fast. Watch for floating debris.' : '';
    f.push(fact('Water state', WATER.names[cur.water.lvl], waterWhy(cur.water) + debris));
  }

  f.push(fact('Air', `${r0(cur.temp)}°F`, `Feels like ${r0(cur.feels)}°F. Dew point ${r0(cur.dew)}°F.`, lvlOf('freeze')));

  f.push(precipFact(m, Math.max(lvlOf('pop'), lvlOf('rain'))));

  const wt = waterTemp(m);
  if (wt != null) {
    const src = waterOverridden(S) ? 'Your reading, set in Settings.' :
      `Nearest main-stem gauge, near Northfield, MA, about 19 mi downstream. ${ago(m.data.river.waterC.t)}.`;
    f.push(fact('Water', `${r0(wt)}°F`, src));
    const sum = Math.round(cur.temp + wt);
    f.push(fact('Air plus water', `${sum}°F`,
      sum < S.coldCombined ? `Under ${S.coldCombined}. Dress for immersion and row with a launch.` : `Above the ${S.coldCombined} cold-water line.`,
      lvlOf('cold')));
  } else {
    f.push(fact('Water', '--', 'Gauge unavailable. Add a dock reading in Settings.'));
  }

  f.push(fact('Visibility', visText(cur.vis), visibilityNote(m), lvlOf('fog')));

  const fl = flowNow(m);
  if (fl != null) {
    const tr = flowTrend(m.data.flow);
    f.push(fact('River flow', `${fmtInt(fl)} cfs ${sparkline(m.data.flow)}`,
      `${tr ? tr + '. ' : ''}North Walpole gauge below Bellows Falls dam, about 16 river miles upstream. ${ago(m.data.river.flow.t)}.`,
      lvlOf('flow')));
  } else {
    f.push(fact('River flow', '--', 'USGS gauge unavailable.'));
  }

  let s = sunFor(m, dayKey(Date.now())), dayLabel = 'Daylight';
  if (s && Date.now() > s.dusk) { s = sunFor(m, dayKey(Date.now() + 24 * HOUR)); dayLabel = 'Daylight tomorrow'; }
  if (s) {
    f.push(fact(dayLabel, `${hm(s.sunrise)} to ${hm(s.sunset)}`,
      `First light ${hm(s.dawn)}, dark by ${hm(s.dusk)}. Lights required outside sunrise to sunset.`,
      lvlOf('twilight')));
  }

  const o = m.data.obs;
  if (o && o.t) {
    const parts = [];
    if (o.wind != null) parts.push(`${r0(o.wind)} mph${o.dir != null && o.wind >= 1 ? ' ' + card(o.dir) : ''}`);
    if (o.tempF != null) parts.push(`${r0(o.tempF)}°F`);
    f.push(fact('Measured at Keene', parts.join(', ') || '--',
      `${o.text ? o.text + '. ' : ''}${o.gust != null ? `Gusts ${r0(o.gust)} mph. ` : ''}Keene airport, 14 mi east. A check on the model. ${ago(o.t)}.`));
  }
  $('facts').innerHTML = f.join('');
}
