// Best windows list and the expandable forecast panel for one window.
import { HOUR, WORD_PLAIN } from '../config.js';
import { app, $ } from '../state.js';
import { esc, hm, r0, card, rng, dayWord, dayKey, fmtInt, visText, lowerFirst } from '../format.js';
import { fogRisk, morningFog, fogLift, flowNow, flowTrend, waterTemp, waterOverridden, windVsCourse, sunFor, meanDir, angDev } from '../logic.js';
import { fact, compassSVG, sparkline } from './parts.js';

export function renderWindows() {
  const m = app.model, el = $('windows');
  if (!m.windows.length) {
    app.winSel = null;
    el.innerHTML = '<li class="empty">No rowable stretch in the next 72 hours. Check back after the next update.</li>';
    return;
  }
  const selIdx = m.windows.findIndex(w => w.key === app.winSel);
  if (selIdx < 0) app.winSel = null;
  const items = m.windows.map((w, k) => {
    const hrs = (w.end - w.start) / HOUR;
    const len = hrs >= 1 ? `${Math.round(hrs * 2) / 2} hr` : `${Math.round(hrs * 60)} min`;
    const lead = w.lvl === 1 && w.why ? `Caution: ${lowerFirst(w.why.text)}. ` : '';
    const open = k === selIdx;
    return `<li><button type="button" class="win" data-k="${k}" data-lvl="${w.lvl}" aria-expanded="${open}" aria-controls="winPanel">
      <span class="when">${esc(dayWord(w.start))}, ${esc(hm(w.start))} to ${esc(hm(w.end))} <span class="len">${len}</span></span>
      <span class="note" style="display:block">${esc(lead)}Wind ${rng(w.wmin, w.wmax, ' mph')} from ${card(w.dir)}, gusts to ${r0(w.gmax)}. ${rng(w.tmin, w.tmax, '°F')}.</span>
      <span class="more">${open ? 'Hide forecast' : 'Show forecast'}</span>
    </button></li>`;
  });
  if (selIdx >= 0) {
    // Two-column layout: drop the panel after the end of the clicked item's row.
    const cols = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
    const at = Math.min(items.length - 1, Math.floor(selIdx / cols) * cols + cols - 1);
    items.splice(at + 1, 0, windowPanel(m, m.windows[selIdx]));
  }
  el.innerHTML = items.join('');
}

function windowFogNote(m, hs) {
  const foggy = hs.map(h => ({ h, f: fogRisk(m, h) })).filter(x => x.f.risk > 0);
  if (!foggy.length) return 'Fog risk low.';
  const first = foggy.reduce((a, b) => (b.f.risk > a.f.risk ? b : a));
  const mf = morningFog(m, dayKey(first.h.t));
  const lift = mf && first.f.type !== 'model' ? `, ${fogLift(mf)}` : '';
  return `${first.f.text} around ${hm(foggy[0].h.t)}${lift}. ${first.f.why}`;
}

function windowPanel(m, w) {
  const S = m.S, hs = w.hs;
  const maxLvl = keys => Math.max(0, ...hs.flatMap(h => h.a.reasons.filter(x => keys.includes(x.key)).map(x => x.lvl)));
  const nums = k => hs.map(h => h[k]).filter(v => v != null && !isNaN(v));
  const md = meanDir(hs);
  const avgWind = nums('wind').reduce((a, b) => a + b, 0) / Math.max(1, hs.length);
  const shifting = hs.length > 1 && Math.max(...hs.map(h => angDev(h.dir, md))) > 60;

  const f = [];
  const dirNote = shifting
    ? `Shifting from ${card(hs[0].dir)} to ${card(hs[hs.length - 1].dir)}.`
    : `Mostly from ${card(md)}. ${windVsCourse(m, md, avgWind)}`;
  f.push(fact('Wind', `${rng(w.wmin, w.wmax, ' mph')}, gusts to ${r0(w.gmax)}`, dirNote, maxLvl(['wind', 'gust'])));

  f.push(fact('Air', rng(w.tmin, w.tmax, '°F'),
    `Feels like ${rng(Math.min(...nums('feels')), Math.max(...nums('feels')), '°F')}. Dew point ${rng(Math.min(...nums('dew')), Math.max(...nums('dew')), '°F')}.`,
    maxLvl(['freeze'])));

  const wt = waterTemp(m);
  if (wt != null) {
    f.push(fact('Water', `${r0(wt)}°F`, waterOverridden(S) ? 'Your reading, set in Settings.' : 'Latest gauge reading. River temperature moves slowly, so it should hold.'));
    const minSum = Math.round(w.tmin + wt);
    f.push(fact('Air plus water', `${minSum}°F`,
      minSum < S.coldCombined ? `Under ${S.coldCombined} at the coldest point. Dress for immersion and row with a launch.` : `Above the ${S.coldCombined} cold-water line throughout.`,
      maxLvl(['cold'])));
  } else {
    f.push(fact('Water', '--', 'Gauge unavailable. Add a dock reading in Settings.'));
  }

  const vis = nums('vis');
  f.push(fact('Visibility', visText(vis.length ? Math.min(...vis) : null), windowFogNote(m, hs), maxLvl(['fog'])));

  const pop = Math.max(0, ...nums('pop'));
  const total = nums('precip').reduce((a, b) => a + b, 0);
  f.push(fact('Rain', `${r0(pop)}% chance`,
    total >= 0.01 ? `About ${total.toFixed(2)} in expected.` : (pop >= 30 ? 'Light amounts at most.' : 'None expected.'), maxLvl(['rain', 'storm', 'stormrisk', 'snow', 'ice'])));

  const fl = flowNow(m);
  if (fl != null) {
    const tr = flowTrend(m.data.flow);
    f.push(fact('River flow', `${fmtInt(fl)} cfs ${sparkline(m.data.flow)}`,
      `Latest reading${tr ? ', ' + tr.toLowerCase() : ''}. The app does not forecast flow, so check again closer to the time.`, maxLvl(['flow'])));
  }

  const s = sunFor(m, dayKey(hs[0].t));
  if (s) {
    f.push(fact('Daylight', `${hm(s.sunrise)} to ${hm(s.sunset)}`, `First light ${hm(s.dawn)}, dark by ${hm(s.dusk)}.`));
  }

  const rows = hs.map(h => {
    const lv = h.a.lvl;
    return `<tr><td><i class="b${lv}" aria-label="${WORD_PLAIN[lv]}"></i>${esc(hm(h.t))}</td><td>${r0(h.wind)} mph</td><td>${r0(h.gust)}</td><td>${card(h.dir)}</td><td>${r0(h.temp)}°</td><td>${r0(h.pop) ?? 0}%</td></tr>`;
  }).join('');

  const title = `${dayWord(w.start)}, ${hm(w.start)} to ${hm(w.end)}`;
  return `<li class="win-panel" id="winPanel" role="region" aria-label="Forecast for ${esc(title)}">
    <div class="panel-head">
      <div>
        <h3>${esc(title)}</h3>
        <span class="chip" data-lvl="${w.lvl}"><i aria-hidden="true"></i>${WORD_PLAIN[w.lvl]}${w.lvl && w.why ? ': ' + esc(lowerFirst(w.why.text)) : ''}</span>
      </div>
      <button type="button" data-close="1">Close</button>
    </div>
    <div class="now-grid">
      <figure class="compass">
        <svg viewBox="-70 -70 140 140" role="img" aria-label="Forecast wind direction relative to the river">${compassSVG(S.heading, md, avgWind)}</svg>
        <figcaption>${shifting ? 'Wind shifting during this window.' : `Wind mostly from ${card(md)}.`} River runs ${card(S.heading + 180)}, upstream heading ${S.heading}°.</figcaption>
      </figure>
      <div>
        <dl class="facts">${f.join('')}</dl>
        <div class="hours-wrap">
          <table class="hours">
            <caption>Hour by hour</caption>
            <thead><tr><th scope="col">Hour</th><th scope="col">Wind</th><th scope="col">Gust</th><th scope="col">From</th><th scope="col">Air</th><th scope="col">Rain</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>
  </li>`;
}
