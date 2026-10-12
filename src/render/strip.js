// 72 hour strip chart and the selected-hour detail line.
import { MIN, LIGHT_KEYS, WORD_PLAIN } from '../config.js';
import { app, $ } from '../state.js';
import { esc, hm, r0, card, dayWord, localHour, visText } from '../format.js';
import { lightAt, lvlExcept, windVsCourse, fogRisk } from '../logic.js';

export function renderStrip() {
  const m = app.model, S = m.S;
  const hs = m.h72, n = hs.length, svg = $('strip'), wrap = $('stripWrap');
  if (!n) { svg.innerHTML = ''; return; }
  const padX = 6, top = 26, chartH = 112, bottom = 24;
  const colW = Math.max(12, Math.floor((wrap.clientWidth - padX * 2) / n));
  const W = padX * 2 + n * colW, H = top + chartH + bottom;
  const maxG = Math.max(...hs.map(h => h.gust || 0), S.gustOff);
  const maxV = Math.max(25, Math.ceil((maxG + 2) / 5) * 5);
  const y = v => top + chartH - Math.min(Math.max(v || 0, 0), maxV) / maxV * chartH;
  let s = '';

  hs.forEach((h, i) => {
    const L = lightAt(m, h.t + 30 * MIN);
    if (L !== 'day') s += `<rect class="${L === 'dark' ? 'nightband' : 'twiband'}" x="${padX + i * colW}" y="${top}" width="${colW}" height="${chartH}"/>`;
  });
  [[S.windCaution, 'thr1'], [S.windOff, 'thr2']].forEach(([v, c]) => {
    if (v < maxV) {
      s += `<line class="${c}" x1="${padX}" x2="${W - padX}" y1="${y(v)}" y2="${y(v)}"/>`;
    }
  });
  hs.forEach((h, i) => {
    const lv = lvlExcept(h.a, LIGHT_KEYS);
    const x = padX + i * colW + 2, bw = colW - 4, yt = y(h.wind);
    const dim = lightAt(m, h.t + 30 * MIN) === 'dark' ? ' dim' : '';
    s += `<rect class="bar b${lv}${dim}" x="${x}" y="${yt.toFixed(1)}" width="${bw}" height="${Math.max(1.5, top + chartH - yt).toFixed(1)}" rx="2"/>`;
    s += `<line class="gust" x1="${x}" x2="${x + bw}" y1="${y(h.gust).toFixed(1)}" y2="${y(h.gust).toFixed(1)}"/>`;
  });
  hs.forEach((h, i) => {
    const hr = localHour(h.t), x = padX + i * colW;
    if (hr === 0) {
      s += `<line class="daysep" x1="${x}" x2="${x}" y1="4" y2="${top + chartH}"/>`;
      s += `<text class="daylbl" x="${x + 4}" y="16">${esc(dayWord(h.t))}</text>`;
    } else if (i === 0 && hr < 20) {
      s += `<text class="daylbl" x="${x + 2}" y="16">${esc(dayWord(h.t))}</text>`;
    }
    if (hr % 6 === 0 && hr !== 0) {
      const lab = hr === 12 ? 'noon' : hr < 12 ? `${hr}a` : `${hr - 12}p`;
      s += `<text class="hrlbl" x="${x}" y="${top + chartH + 16}" text-anchor="middle">${lab}</text>`;
    }
  });
  const si = app.sel;
  s += `<rect class="sel" x="${padX + si * colW + 0.75}" y="${top - 3}" width="${colW - 1.5}" height="${chartH + 6}" rx="3"/>`;
  hs.forEach((h, i) => { s += `<rect class="hit" data-i="${i}" x="${padX + i * colW}" y="0" width="${colW}" height="${H}"/>`; });

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.innerHTML = s;
  app.colW = colW; app.padX = padX;
}

// Possible fog is not part of the call, so name it here. Likely fog is
// already in the reasons above.
function fogNote(m, h) {
  const fr = fogRisk(m, h);
  return fr.risk === 1 ? `, ${fr.text.toLowerCase()}` : '';
}

export function renderHourDetail() {
  const m = app.model, h = m.h72[app.sel];
  if (!h) return;
  const a = h.a;
  const reasons = a.lvl > 0 ? a.reasons.filter(x => x.lvl === a.lvl).map(x => x.text) : [];
  const head = `${dayWord(h.t)} ${hm(h.t)}: ${WORD_PLAIN[a.lvl]}${reasons.length ? '. ' + reasons.join('. ') : ''}.`;
  const l2 = `Wind ${r0(h.wind)} mph from ${card(h.dir)}, gusts ${r0(h.gust)}. ${windVsCourse(m, h.dir, h.wind)} ${r0(h.temp)}°F, ${r0(h.pop) ?? 0}% chance of rain. Visibility ${visText(h.vis)}${fogNote(m, h)}.`;
  $('hourDetail').innerHTML = `<strong>${esc(head)}</strong><span class="l2">${esc(l2.replace(/\s+/g, ' '))}</span>`;
}

// Select an hour in the strip and keep it scrolled into view.
export function select(i) {
  const n = app.model.h72.length;
  app.sel = Math.min(Math.max(0, i), n - 1);
  renderStrip();
  renderHourDetail();
  const wrap = $('stripWrap');
  const x = app.padX + app.sel * app.colW;
  if (x < wrap.scrollLeft + 20) wrap.scrollLeft = Math.max(0, x - 40);
  else if (x > wrap.scrollLeft + wrap.clientWidth - 40) wrap.scrollLeft = x - wrap.clientWidth + 60;
}
