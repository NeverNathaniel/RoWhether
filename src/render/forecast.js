// The full forecast for one period: compass, facts and an hour by hour table.
// Shown when a Day by day row is opened.
import { WORD_PLAIN, LIGHT_KEYS, WATER, HOUR } from '../config.js';
import { esc, hm, r0, card, rng, fmtInt, visText, dayKey } from '../format.js';
import { precipSummary, precipKind, fogLift, waterWhy, debrisLikely, flowNow, flowTrend, waterTemp, waterOverridden, windVsCourse, sunFor, angDev, lvlExcept } from '../logic.js';
import { fact, compassSVG, sparkline, precipChart } from './parts.js';

function hoursTable(p) {
  const rows = p.hs.map(h => {
    const lv = lvlExcept(h.a, LIGHT_KEYS);
    return `<tr><td><i class="b${lv}" aria-label="${WORD_PLAIN[lv]}"></i>${esc(hm(Math.max(h.t, p.from)))}</td><td>${r0(h.wind)} mph</td><td>${r0(h.gust)}</td><td>${card(h.dir)}</td><td>${h.water ? WATER.short[h.water.lvl] : '--'}</td><td>${r0(h.temp)}°</td><td>${r0(h.pop) ?? 0}%</td></tr>`;
  }).join('');
  return `<div class="hours-wrap"><table class="hours">
    <caption>Hour by hour</caption>
    <thead><tr><th scope="col">Hour</th><th scope="col">Wind</th><th scope="col">Gust</th><th scope="col">From</th><th scope="col">Water</th><th scope="col">Air</th><th scope="col">Rain</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

// Precipitation for the period: a headline chance, when and what, and the
// hourly chart. Tapping a column shows that hour under the chart.
function precipBlock(m, p, lvl) {
  const sum = precipSummary(p.hs);
  let note;
  if (sum.peak < 20) note = 'Little chance of rain or snow. Under 20% throughout.';
  else {
    const when = sum.toT - sum.fromT <= HOUR ? `around ${hm(sum.fromT)}` : `${hm(Math.max(sum.fromT, p.from))} to ${hm(sum.toT)}`;
    const kind = sum.kind ? sum.kind[0].toUpperCase() + sum.kind.slice(1) : 'Precipitation';
    const amt = sum.total >= 0.01 ? `, about ${sum.total.toFixed(2)} in` : ', light amounts at most';
    note = `Most likely ${when}. ${kind}${amt}.`;
  }
  const describe = h => {
    const k = precipKind(h.code);
    return `${hm(Math.max(h.t, p.from))}: ${r0(h.pop) ?? 0}% chance${k ? `, ${k}` : ''}${h.precip >= 0.01 ? `, about ${h.precip.toFixed(2)} in` : ''}.`;
  };
  return `<div class="fact precip"${lvl ? ` data-lvl="${lvl}"` : ''}>
    <div class="precip-label">Precipitation</div>
    <div class="val">${sum.peak}% chance</div>
    <div class="note">${esc(note)}</div>
    ${precipChart(p.hs, m.S, p.from, describe)}
    <p class="precip-hover" aria-live="polite">Tap a column for that hour.</p>
  </div>`;
}

export function forecastPanel(m, p) {
  const S = m.S, hs = p.hs;
  const maxLvl = keys => Math.max(0, ...hs.flatMap(h => h.a.reasons.filter(x => keys.includes(x.key)).map(x => x.lvl)));
  const nums = k => hs.map(h => h[k]).filter(v => v != null && !isNaN(v));
  const shifting = hs.length > 1 && Math.max(...hs.map(h => angDev(h.dir, p.dir))) > 60;

  const f = [];
  const dirNote = shifting
    ? `Shifting from ${card(hs[0].dir)} to ${card(hs[hs.length - 1].dir)}.`
    : `Mostly from ${card(p.dir)}. ${windVsCourse(m, p.dir, p.avgWind)}`;
  f.push(fact('Wind', `${rng(p.wmin, p.wmax, ' mph')}, gusts to ${r0(p.gmax)}`, dirNote, maxLvl(['wind', 'gust'])));

  if (p.water) {
    const w = p.water;
    const range = w.min < w.max ? `${WATER.names[w.min]} at times, ${WATER.names[w.max].toLowerCase()} around ${hm(w.peakT)}. ` : '';
    const debris = p.dayKey === dayKey(m.now) && debrisLikely(m) ? ' River rising fast. Watch for floating debris.' : '';
    f.push(fact('Water state', WATER.names[w.max], range + waterWhy(w.peak) + debris));
  }

  f.push(fact('Air', rng(p.tmin, p.tmax, '°F'),
    `Feels like ${rng(Math.min(...nums('feels')), Math.max(...nums('feels')), '°F')}. Dew point ${rng(Math.min(...nums('dew')), Math.max(...nums('dew')), '°F')}.`,
    maxLvl(['freeze'])));

  const wt = waterTemp(m);
  if (wt != null) {
    f.push(fact('Water', `${r0(wt)}°F`, waterOverridden(S) ? 'Your reading, set in Settings.' : 'Latest gauge reading. River temperature moves slowly, so it should hold.'));
    const minSum = Math.round(p.tmin + wt);
    f.push(fact('Air plus water', `${minSum}°F`,
      minSum < S.coldCombined ? `Under ${S.coldCombined} at the coldest point. Dress for immersion and row with a launch.` : `Above the ${S.coldCombined} cold-water line throughout.`,
      maxLvl(['cold'])));
  } else {
    f.push(fact('Water', '--', 'Gauge unavailable. Add a dock reading in Settings.'));
  }

  const vis = nums('vis');
  const fogNote = p.fog ? `${p.fog.text}${p.fog.until ? ', ' + fogLift(p.fog) : ''}. ${p.fog.why}` : 'Fog risk low.';
  f.push(fact('Visibility', visText(vis.length ? Math.min(...vis) : null), fogNote, maxLvl(['fog'])));


  const fl = flowNow(m);
  if (fl != null) {
    const tr = flowTrend(m.data.flow);
    f.push(fact('River flow', `${fmtInt(fl)} cfs ${sparkline(m.data.flow)}`,
      `Latest reading${tr ? ', ' + tr.charAt(0).toLowerCase() + tr.slice(1) : ''}. The app does not forecast flow, so check again closer to the time.`, maxLvl(['flow'])));
  }

  const s = sunFor(m, p.dayKey);
  if (s) {
    f.push(fact('Daylight', `${hm(s.sunrise)} to ${hm(s.sunset)}`,
      `First light ${hm(s.dawn)}.${p.lightsUntil ? ` Lights needed until sunrise at ${hm(p.lightsUntil)}.` : ''}`));
  }

  return `<div class="forecast">
    <div class="now-grid">
      <figure class="compass">
        <svg viewBox="-70 -70 140 140" role="img" aria-label="Forecast wind direction relative to the river">${compassSVG(S.heading, p.dir, p.avgWind)}</svg>
        <figcaption>${shifting ? 'Wind shifting during this period.' : `Wind mostly from ${card(p.dir)}.`} River runs ${card(S.heading + 180)}, upstream heading ${S.heading}°.</figcaption>
      </figure>
      <div>
        <dl class="facts">${f.join('')}</dl>
        ${precipBlock(m, p, maxLvl(['rain', 'pop', 'storm', 'stormrisk', 'snow', 'ice']))}
        ${hoursTable(p)}
      </div>
    </div>
  </div>`;
}
