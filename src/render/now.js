// "On the water now": compass and current facts.
import { HOUR, WATER } from '../config.js';
import { app, $ } from '../state.js';
import { r0, card, fmtFlow, visText, hm, dayKey, dayWord } from '../format.js';
import { precipKind, rateWord, fogRisk, nextMorning, fogLift, waterWhy, debrisLikely, flowNow, flowTrend, waterTemp, waterOverridden, windVsCourse, sunFor, aqiWord } from '../logic.js';
import { sourceRow } from '../location.js';
import { fact, compassSVG, sparkline, readNote } from './parts.js';
import { precipBlock } from './precip.js';

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

// Precipitation from now until 6 hours ahead or sunset, whichever is first,
// led by what is falling now.
const PRECIP_KEYS = ['rain', 'pop', 'storm', 'stormrisk', 'snow', 'ice'];
function nowPrecip(m) {
  const cur = m.cur;
  const s = sunFor(m, dayKey(m.now));
  const h0 = m.h72[0].t; // the hour that contains now
  const end = Math.min(h0 + 6 * HOUR, s ? s.sunset : Infinity);
  const hs = m.h72.filter(h => h.t + HOUR > m.now && h.t < end);
  // Color the headline by the worst precipitation reason in the window.
  const lvl = Math.max(0, ...hs.flatMap(h => h.a.reasons.filter(x => PRECIP_KEYS.includes(x.key)).map(x => x.lvl)));
  const kind = precipKind(cur.code);
  const cap = w => w[0].toUpperCase() + w.slice(1);
  const nowText = !kind ? 'Dry now.'
    : kind === 'thunderstorms' || kind === 'freezing rain' ? `${cap(kind)} now.`
    : `${cap(rateWord(cur.precip || 0))} ${kind} now.`;
  return precipBlock(m, hs, m.now, lvl, { label: `Precipitation, now to ${hm(end)}`, lead: nowText, href: '#rain' });
}

export function renderNow() {
  const m = app.model, S = m.S, cur = m.cur, a = cur.a;
  // Current conditions are only shown in daylight.
  $('nowSection').hidden = !m.daytime;
  if (!m.daytime) return;
  const heading = m.loc.course.heading;
  const lvlOf = key => { const x = a.reasons.find(r => r.key === key); return x ? x.lvl : 0; };

  $('compass').innerHTML = compassSVG(heading, m.loc.banks, cur.dir, cur.wind);
  $('compassCap').textContent = cur.wind != null
    ? `Wind from ${card(cur.dir)}. River runs ${card(heading + 180)}, upstream heading ${heading}°.`
    : '';

  const f = [];
  const windLvl = Math.max(lvlOf('wind'), lvlOf('gust'));
  f.push(fact('Wind', `${r0(cur.wind)} mph, gusts ${r0(cur.gust)}`, `From ${card(cur.dir)}. ${windVsCourse(m, cur.dir, cur.wind)}`, windLvl, '#wind'));

  if (cur.water) {
    const debris = debrisLikely(m) ? ' River rising fast. Watch for floating debris.' : '';
    f.push(fact('Water state', WATER.names[cur.water.lvl], waterWhy(cur.water) + debris, 0, '#wind'));
  }

  f.push(fact('Air', `${r0(cur.temp)}°F`, `Feels like ${r0(cur.feels)}°F. Dew point ${r0(cur.dew)}°F.`, lvlOf('freeze'), '#temperature'));

  const wt = waterTemp(m);
  if (wt != null) {
    const src = waterOverridden(S) ? 'Your reading, set in Settings.' :
      readNote(sourceRow(m.loc, 'water_temp'), m.data.river.waterC.t);
    f.push(fact('Water', `${r0(wt)}°F`, src, 0, '#temperature'));
    const sum = Math.round(cur.temp + wt);
    f.push(fact('Air plus water', `${sum}°F`,
      sum < S.coldCombined ? `Under ${S.coldCombined}. Dress for immersion and row with a launch.` : `Above the ${S.coldCombined} cold-water line.`,
      lvlOf('cold'), '#temperature'));
  } else {
    f.push(fact('Water', '--', 'Gauge unavailable. Add a dock reading in Settings.'));
  }

  f.push(fact('Visibility', visText(cur.vis), visibilityNote(m), lvlOf('fog'), '#fog'));

  if (cur.aqi != null) {
    f.push(fact('Air quality', `AQI ${r0(cur.aqi)}`,
      `${aqiWord(cur.aqi)}.${cur.pm25 != null ? ` Fine particles ${r0(cur.pm25)} µg/m³.` : ''} A forecast, not a measurement.`, lvlOf('aqi'), '#air'));
  }

  const fl = flowNow(m);
  if (fl != null) {
    const tr = flowTrend(m.data.flow);
    f.push(fact('River flow', `${fmtFlow(fl, m.loc.flow?.unit)} ${sparkline(m.data.flow)}`,
      `${tr ? tr + '. ' : ''}${readNote(sourceRow(m.loc, 'flow'), m.data.river.flow.t)}`,
      lvlOf('flow'), '#river'));
  } else {
    f.push(fact('River flow', '--', 'USGS gauge unavailable.', 0, '#river'));
  }

  let s = sunFor(m, dayKey(Date.now())), dayLabel = 'Daylight';
  if (s && Date.now() > s.dusk) { s = sunFor(m, dayKey(Date.now() + 24 * HOUR)); dayLabel = 'Daylight tomorrow'; }
  if (s) {
    f.push(fact(dayLabel, `${hm(s.sunrise)} to ${hm(s.sunset)}`,
      `First light ${hm(s.dawn)}, dark by ${hm(s.dusk)}. Lights required outside sunrise to sunset.`,
      lvlOf('twilight'), '#light'));
  }

  const o = m.data.obs, obsRow = sourceRow(m.loc, 'obs');
  if (o && o.t) {
    const parts = [];
    if (o.wind != null) parts.push(`${r0(o.wind)} mph${o.dir != null && o.wind >= 1 ? ' ' + card(o.dir) : ''}`);
    if (o.tempF != null) parts.push(`${r0(o.tempF)}°F`);
    f.push(fact(`Measured at ${obsRow?.label || 'the station'}`, parts.join(', ') || '--',
      `${o.text ? o.text + '. ' : ''}${o.gust != null ? `Gusts ${r0(o.gust)} mph. ` : ''}${readNote(obsRow, o.t)}`));
  }
  $('facts').innerHTML = f.join('');
  $('nowPrecip').innerHTML = nowPrecip(m);
}
