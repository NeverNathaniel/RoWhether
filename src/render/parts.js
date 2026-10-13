// Small HTML and SVG builders shared by the sections.
import { esc, hm, hShort } from '../format.js';

// A small chevron after a label that opens a detail view.
export const CHEV = '<svg class="chev" viewBox="0 0 8 12" aria-hidden="true"><path d="M2 2l4 4-4 4"/></svg>';

// href: optional detail view link. The link covers the whole fact.
export function fact(label, val, note, lvl, href) {
  const dt = href ? `<a class="flink stretch" href="${href}">${esc(label)}${CHEV}</a>` : esc(label);
  return `<div class="fact"${lvl ? ` data-lvl="${lvl}"` : ''}><dt>${dt}</dt><dd><div class="val">${val}</div>${note ? `<div class="note">${esc(note)}</div>` : ''}</dd></div>`;
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

// Hourly chance of precipitation as columns, one per hour. Columns over the
// rain caution or stay-off setting take that status color, and the settings
// are drawn as labeled dashed lines. Only the peak is labeled; each column has
// a hit area carrying its hour's text for the tap readout (data-text), and the
// hour table below holds every value.
const isSet = v => v !== '' && v != null && !isNaN(v);

export function precipChart(hs, S, from, describe) {
  const n = hs.length, W = 320, H = 140, top = 22, bottom = 24, left = 2, right = 38;
  const plotW = W - left - right, plotH = H - top - bottom, base = top + plotH;
  const slot = plotW / n, bw = Math.min(24, slot - 6);
  const y = v => base - Math.min(100, Math.max(0, v)) / 100 * plotH;
  const pops = hs.map(h => Math.round(h.pop || 0));
  const peak = Math.max(...pops), pi = pops.indexOf(peak);
  let s = `<line class="pbase" x1="${left}" x2="${W - right}" y1="${base}" y2="${base}"/>`;

  const lines = [[S.rainCaution, 'pthr1'], [S.rainOff, 'pthr2']].filter(([v]) => isSet(v) && v > 0 && v <= 100);
  if (!lines.length) lines.push([50, 'pgrid']);
  for (const [v, c] of lines) {
    s += `<line class="${c}" x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}"/>`;
    s += `<text class="paxis" x="${W - right + 5}" y="${y(v) + 4}">${v}%</text>`;
  }
  hs.forEach((h, i) => {
    const v = pops[i];
    const lvl = isSet(S.rainOff) && v >= S.rainOff ? 2 : isSet(S.rainCaution) && v >= S.rainCaution ? 1 : 0;
    const x = left + i * slot + (slot - bw) / 2, yt = Math.min(y(v), base - 2), r = Math.min(4, bw / 2, base - yt);
    s += `<path class="pbar b${lvl}" data-pi="${i}" d="M${x} ${base}V${yt + r}Q${x} ${yt} ${x + r} ${yt}H${x + bw - r}Q${x + bw} ${yt} ${x + bw} ${yt + r}V${base}Z"/>`;
    if (i === pi && peak > 0) s += `<text class="plabel" x="${x + bw / 2}" y="${yt - 6}" text-anchor="middle">${v}%</text>`;
    if (n <= 6 || i % 2 === 0) s += `<text class="paxis" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(hShort(Math.max(h.t, from)))}</text>`;
  });
  hs.forEach((h, i) => {
    const text = describe(h, i);
    s += `<rect class="hit" data-pi="${i}" data-text="${esc(text)}" tabindex="0" x="${left + i * slot}" y="0" width="${slot}" height="${H}"><title>${esc(text)}</title></rect>`;
  });
  return `<svg class="pchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chance of precipitation by hour, highest ${peak}% at ${esc(hm(hs[pi].t))}">${s}</svg>`;
}
