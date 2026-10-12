// Small HTML and SVG builders shared by the sections.
import { esc } from '../format.js';

export function fact(label, val, note, lvl) {
  return `<div class="fact"${lvl ? ` data-lvl="${lvl}"` : ''}><dt>${esc(label)}</dt><dd><div class="val">${val}</div>${note ? `<div class="note">${esc(note)}</div>` : ''}</dd></div>`;
}

export function compassSVG(heading, dir, speed) {
  let s = '<circle class="c-ring" r="62"/>';
  s += '<text class="c-card" x="0" y="-48" text-anchor="middle">N</text>';
  s += '<text class="c-card" x="52" y="4" text-anchor="middle">E</text>';
  s += '<text class="c-card" x="0" y="56" text-anchor="middle">S</text>';
  s += '<text class="c-card" x="-52" y="4" text-anchor="middle">W</text>';
  s += `<g transform="rotate(${heading})">`;
  s += '<rect class="c-river" x="-10" y="-62" width="20" height="124" rx="4"/>';
  s += '<path class="c-flow" d="M-5 40 L5 40 L0 49 Z"/>';
  s += '</g>';
  s += '<text class="c-bank" x="-30" y="-24" text-anchor="middle">VT</text>';
  s += '<text class="c-bank" x="30" y="-24" text-anchor="middle">NH</text>';
  if (speed == null || dir == null) return s;
  if (speed < 1) return s + '<text class="c-calm" x="0" y="5" text-anchor="middle">Calm</text>';
  s += `<g transform="rotate(${dir})"><line class="c-wind" x1="0" y1="-44" x2="0" y2="30"/><path class="c-head" d="M-8 26 L8 26 L0 42 Z"/></g>`;
  return s;
}

export function sparkline(ser) {
  if (!ser || ser.length < 3) return '';
  const vs = ser.map(p => p.v), min = Math.min(...vs), max = Math.max(...vs);
  const t0 = ser[0].t, t1 = ser[ser.length - 1].t, W = 112, Hh = 28;
  const span = (max - min) || 1;
  const pts = ser.map(p => `${((p.t - t0) / ((t1 - t0) || 1) * W).toFixed(1)},${(Hh - 3 - (p.v - min) / span * (Hh - 6)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="River flow over the last 48 hours"><polyline points="${pts}"/></svg>`;
}
