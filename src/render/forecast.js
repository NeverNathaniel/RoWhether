// The full forecast for one period: compass, facts and an hour by hour table.
// Shown when a Day by day row is opened.
import { WORD_PLAIN, LIGHT_KEYS, WATER } from '../config.js';
import { esc, hm, r0, card, dayKey } from '../format.js';
import { fogLift, waterWhy, debrisLikely, flowNow, flowTrend, flowForecastAt, waterTemp, waterOverridden, windVsCourse, sunFor, angDev, lvlExcept, aqiWord } from '../logic.js';
import { fact, compassSVG, sparkline } from './parts.js';
import { precipBlock } from './precip.js';

function hoursTable(p, u) {
  const rows = p.hs.map(h => {
    const lv = lvlExcept(h.a, LIGHT_KEYS);
    return `<tr><td><i class="b${lv}" aria-label="${WORD_PLAIN[lv]}"></i>${esc(hm(Math.max(h.t, p.from)))}</td><td>${u.speed(h.wind)}</td><td>${r0(h.gust)}</td><td>${card(h.dir)}</td><td>${h.water ? WATER.short[h.water.lvl] : '--'}</td><td>${r0(h.temp)}°</td><td>${r0(h.pop) ?? 0}%</td></tr>`;
  }).join('');
  return `<div class="hours-wrap"><table class="hours">
    <caption>Hour by hour</caption>
    <thead><tr><th scope="col">Hour</th><th scope="col">Wind</th><th scope="col">Gust</th><th scope="col">From</th><th scope="col">Water</th><th scope="col">Air</th><th scope="col">Rain</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

export function forecastPanel(m, p) {
  const S = m.S, hs = p.hs, { heading } = m.loc.course;
  const maxLvl = keys => Math.max(0, ...hs.flatMap(h => h.a.reasons.filter(x => keys.includes(x.key)).map(x => x.lvl)));
  const nums = k => hs.map(h => h[k]).filter(v => v != null && !isNaN(v));
  const shifting = hs.length > 1 && Math.max(...hs.map(h => angDev(h.dir, p.dir))) > 60;

  const f = [];
  const dirNote = shifting
    ? `Shifting from ${card(hs[0].dir)} to ${card(hs[hs.length - 1].dir)}.`
    : `Mostly from ${card(p.dir)}. ${windVsCourse(m, p.dir, p.avgWind)}`;
  f.push(fact('Wind', `${m.u.speedRange(p.wmin, p.wmax)}, gusts to ${r0(p.gmax)}`, dirNote, maxLvl(['wind', 'gust']), `#wind/${p.dayKey}`));

  if (p.water) {
    const w = p.water;
    const range = w.min < w.max ? `${WATER.names[w.min]} at times, ${WATER.names[w.max].toLowerCase()} around ${hm(w.peakT)}. ` : '';
    const debris = p.dayKey === dayKey(m.now) && debrisLikely(m) ? ' River rising fast. Watch for floating debris.' : '';
    f.push(fact('Water state', WATER.names[w.max], range + waterWhy(w.peak) + debris, 0, `#wind/${p.dayKey}`));
  }

  f.push(fact('Air', m.u.tempRange(p.tmin, p.tmax),
    `Feels like ${m.u.tempRange(Math.min(...nums('feels')), Math.max(...nums('feels')))}. Dew point ${m.u.tempRange(Math.min(...nums('dew')), Math.max(...nums('dew')))}.`,
    maxLvl(['freeze']), `#temperature/${p.dayKey}`));

  const wt = waterTemp(m);
  if (wt != null) {
    f.push(fact('Water', m.u.temp(wt), waterOverridden(S) ? 'Your reading, set in Settings.' : 'Latest gauge reading. River temperature moves slowly, so it should hold.', 0, `#temperature/${p.dayKey}`));
    const minSum = Math.round(p.tmin + wt);
    f.push(fact('Air plus water', m.u.tempSum(p.tmin + wt),
      minSum < S.coldCombined ? `Under ${S.coldCombined} at the coldest point. Dress for immersion and row with a launch.` : `Above the ${S.coldCombined} cold-water line throughout.`,
      maxLvl(['cold']), `#temperature/${p.dayKey}`));
  } else {
    f.push(fact('Water', '--', 'Gauge unavailable. Add a dock reading in Settings.'));
  }

  const vis = nums('vis');
  const fogNote = p.fog ? `${p.fog.text}${p.fog.until ? ', ' + fogLift(p.fog) : ''}. ${p.fog.why}` : 'Fog risk low.';
  f.push(fact('Visibility', m.u.dist(vis.length ? Math.min(...vis) : null), fogNote, maxLvl(['fog']), `#fog/${p.dayKey}`));


  const aq = nums('aqi');
  if (aq.length) {
    const hi = Math.max(...aq), lo = r0(Math.min(...aq)), top = r0(hi);
    f.push(fact('Air quality', lo === top ? m.u.aqi(hi) : `${m.u.aqi(lo)} to ${top}`, `${aqiWord(hi)} at worst.`, maxLvl(['aqi']), `#air/${p.dayKey}`));
  }

  const fl = flowNow(m);
  if (fl != null) {
    const tr = flowTrend(m.data.flow);
    const fc = flowForecastAt(m.data.flowFcst, p.from + (p.end - p.from) / 2);
    const ahead = fc != null
      ? `NWS forecast for this period: about ${m.u.flow(Math.round(fc / 100) * 100, m.loc.flow?.unit)}. Go, Caution and Stay off use the latest reading.`
      : 'The NWS forecast does not reach this far, so check again closer to the time.';
    f.push(fact('River flow', `${m.u.flow(fl, m.loc.flow?.unit)} ${sparkline(m.data.flow)}`,
      `Latest reading${tr ? ', ' + tr.charAt(0).toLowerCase() + tr.slice(1) : ''}. ${ahead}`, maxLvl(['flow']), '#river'));
  }

  const s = sunFor(m, p.dayKey);
  if (s) {
    f.push(fact('Daylight', `${hm(s.sunrise)} to ${hm(s.sunset)}`,
      `First light ${hm(s.dawn)}.${p.lightsUntil ? ` Lights needed until sunrise at ${hm(p.lightsUntil)}.` : ''}`, 0, `#light/${p.dayKey}`));
  }

  return `<div class="forecast">
    <div class="now-grid">
      <figure class="compass">
        <svg viewBox="-70 -70 140 140" role="img" aria-label="Forecast wind direction relative to the river">${compassSVG(heading, m.loc.banks, p.dir, p.avgWind)}</svg>
        <figcaption>${shifting ? 'Wind shifting during this period.' : `Wind mostly from ${card(p.dir)}.`} River runs ${card(heading + 180)}, upstream heading ${heading}°.</figcaption>
      </figure>
      <div>
        <dl class="facts">${f.join('')}</dl>
        ${precipBlock(m, p.hs, p.from, maxLvl(['rain', 'pop', 'storm', 'stormrisk', 'snow', 'ice']), { href: `#rain/${p.dayKey}` })}
        ${hoursTable(p, m.u)}
      </div>
    </div>
  </div>`;
}
