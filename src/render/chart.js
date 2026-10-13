// A small SVG chart kit for the detail views. A chart has one time axis and
// stacks lanes on it, each with its own y scale, so related measures line up
// hour by hour without sharing an axis. Hit columns span every lane; tapping,
// hovering or focusing one shows its text in the readout under the chart
// (handler in src/main.js).
import { esc } from '../format.js';

const f1 = v => Math.round(v * 10) / 10;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ok = v => v != null && !isNaN(v);

// A column with a rounded data end, square at the baseline.
export function colPath(x, w, yt, base) {
  const r = Math.min(4, w / 2, base - yt);
  return `M${f1(x)} ${base}V${f1(yt + r)}Q${f1(x)} ${f1(yt)} ${f1(x + r)} ${f1(yt)}H${f1(x + w - r)}Q${f1(x + w)} ${f1(yt)} ${f1(x + w)} ${f1(yt + r)}V${base}Z`;
}

// Round tick values from 0 (or lo) to at least hi, about n of them.
export function niceTicks(lo, hi, n = 4) {
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= raw) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}
export const niceMax = (hi, n = 4) => { const t = niceTicks(0, hi, n); return t[t.length - 1] < hi ? t[t.length - 1] + (t[1] - t[0]) : t[t.length - 1]; };

export class Chart {
  constructor({ t0, t1, W, left = 2, right = 44 }) {
    Object.assign(this, { t0, t1, W, l: left, r: W - right, h: 0, bg: '', fg: '', top: '', marks: [], hitList: [], firstTop: null });
  }
  x(t) { return f1(this.l + (t - this.t0) / ((this.t1 - this.t0) || 1) * (this.r - this.l)); }

  // A lane `height` tall for values lo to hi, under an optional title.
  lane(height, lo, hi, title) {
    let top = this.h + 4;
    if (title) { this.top += `<text class="ctitle" x="${this.l}" y="${this.h + 12}">${esc(title)}</text>`; top = this.h + 20; }
    if (this.firstTop == null) this.firstTop = top;
    const base = top + height;
    this.h = base + 10;
    this.lastBase = base;
    const L = { top, base, lo, hi, labels: [] };
    L.y = v => f1(base - (clamp(v, lo, hi) - lo) / ((hi - lo) || 1) * height);
    return L;
  }

  // A value at the right edge, skipped if it would overlap one already there.
  // Settings lines are drawn before the grid so their labels win.
  label(L, v, text) {
    const y = L.y(v);
    if (L.labels.some(u => Math.abs(u - y) < 11)) return;
    L.labels.push(y);
    this.top += `<text class="caxis" x="${this.r + 5}" y="${f1(y + 4)}">${esc(text)}</text>`;
  }
  grid(L, ticks, fmt = String) {
    for (const v of ticks) {
      if (v < L.lo || v > L.hi) continue;
      this.bg += `<line class="cgrid" x1="${this.l}" x2="${this.r}" y1="${L.y(v)}" y2="${L.y(v)}"/>`;
      this.label(L, v, fmt(v));
    }
  }
  // A settings line, dashed, with its value at the right.
  hline(L, v, cls, text) {
    if (!ok(v) || v < L.lo || v > L.hi) return;
    this.top += `<line class="${cls}" x1="${this.l}" x2="${this.r}" y1="${L.y(v)}" y2="${L.y(v)}"/>`;
    this.label(L, v, text ?? String(v));
  }
  // A shaded band between two values across the lane.
  zone(L, a, b, cls) {
    const y1 = L.y(Math.max(a, b)), y2 = L.y(Math.min(a, b));
    if (y2 - y1 <= 0) return;
    this.bg += `<rect class="${cls}" x="${this.l}" y="${y1}" width="${f1(this.r - this.l)}" height="${f1(y2 - y1)}"/>`;
  }
  // A shaded time span across every lane, such as the hours that need lights.
  span(ta, tb, cls) {
    if (tb <= ta) return;
    this.marks.push({ kind: 'span', ta: Math.max(ta, this.t0), tb: Math.min(tb, this.t1), cls });
  }
  // pts: [{ t, v }]. Missing values break the line.
  line(L, pts, cls) {
    let d = '', pen = false;
    for (const p of pts) {
      if (!ok(p.v)) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${this.x(p.t)} ${L.y(p.v)}`;
      pen = true;
    }
    if (d) this.fg += `<path class="${cls}" d="${d}"/>`;
  }
  // A filled band between lo and hi. pts: [{ t, lo, hi }].
  band(L, pts, cls) {
    const ps = pts.filter(p => ok(p.lo) && ok(p.hi));
    if (ps.length < 2) return;
    const up = ps.map(p => `${this.x(p.t)} ${L.y(p.hi)}`), down = ps.slice().reverse().map(p => `${this.x(p.t)} ${L.y(p.lo)}`);
    this.fg += `<path class="${cls}" d="M${up.join('L')}L${down.join('L')}Z"/>`;
  }
  // Columns. items: [{ t0, t1, v, cls }]. Capped at 24 px wide.
  cols(L, items) {
    for (const it of items) {
      if (!ok(it.v) || it.v <= L.lo) continue;
      const xa = this.x(it.t0), xb = this.x(it.t1), w = Math.min(24, Math.max(2, xb - xa - 4));
      const yt = Math.min(L.y(it.v), L.base - 2);
      this.fg += `<path class="${it.cls}" d="${colPath(xa + (xb - xa - w) / 2, w, yt, L.base)}"/>`;
    }
  }
  // Cells filling the lane height, with a 2 px gap between them.
  cells(L, items) {
    for (const it of items) {
      if (!it.cls) continue;
      const xa = this.x(it.t0) + 1, xb = this.x(it.t1) - 1;
      this.fg += `<rect class="${it.cls}" x="${f1(xa)}" y="${L.top}" width="${f1(Math.max(1, xb - xa))}" height="${L.base - L.top}" rx="2"/>`;
    }
  }
  dot(L, t, v, cls) {
    if (!ok(v)) return;
    this.top += `<circle class="${cls}" cx="${this.x(t)}" cy="${L.y(v)}" r="4"/>`;
  }
  // A short value label above (or below) a point, for the few values worth
  // calling out, such as a peak.
  note(L, t, v, text, below = false) {
    if (!ok(v)) return;
    const x = clamp(this.x(t), this.l + 14, this.r - 14);
    this.top += `<text class="cval" x="${x}" y="${f1(below ? L.y(v) + 17 : L.y(v) - 8)}" text-anchor="middle">${esc(text)}</text>`;
  }
  // Raw SVG centered in the lane at time t, such as a direction arrow.
  glyph(L, t, inner) {
    this.fg += `<g transform="translate(${this.x(t)} ${f1((L.top + L.base) / 2)})">${inner}</g>`;
  }
  // A vertical marker across every lane, labeled at the top.
  vline(t, cls, text) {
    if (t < this.t0 || t > this.t1) return;
    this.marks.push({ kind: 'line', t, cls, text });
  }
  // Fade everything before t, for hours already past.
  past(t) {
    if (t > this.t0) this.marks.push({ kind: 'past', t: Math.min(t, this.t1) });
  }
  // Time labels under the last lane. ticks: [{ t, text }].
  axis(ticks) {
    const y = this.h + 4;
    for (const k of ticks) {
      if (k.t < this.t0 || k.t > this.t1) continue;
      const x = clamp(this.x(k.t), this.l + 10, this.r - 10);
      this.top += `<text class="caxis" x="${x}" y="${y}" text-anchor="middle">${esc(k.text)}</text>`;
    }
    this.h = y + 6;
  }
  hit(t0, t1, text) { this.hitList.push({ t0, t1, text }); }
  // Hits for points at uneven times, each reaching halfway to its neighbors.
  // pts: [{ t, text }] in time order.
  hitsAt(pts) {
    pts.forEach((p, i) => {
      const a = i ? (pts[i - 1].t + p.t) / 2 : this.t0, b = i < pts.length - 1 ? (p.t + pts[i + 1].t) / 2 : this.t1;
      this.hit(Math.max(a, this.t0), Math.min(b, this.t1), p.text);
    });
  }

  svg(label) {
    // Marker labels get their own row above the lanes, so they never sit on data.
    const off = this.marks.some(m => m.kind === 'line' && m.text) ? 14 : 0;
    const H = this.h, top = this.firstTop ?? 0, bottom = (this.lastBase ?? H) + 2;
    let back = '', front = '', labels = '';
    for (const m of this.marks) {
      if (m.kind === 'span') back += `<rect class="${m.cls}" x="${this.x(m.ta)}" y="${top}" width="${f1(this.x(m.tb) - this.x(m.ta))}" height="${f1(bottom - top)}"/>`;
      if (m.kind === 'past') front += `<rect class="cpast" x="${this.l}" y="${top}" width="${f1(this.x(m.t) - this.l)}" height="${f1(bottom - top)}"/>`;
      if (m.kind === 'line') {
        const x = this.x(m.t), right = x < this.r - 60;
        front += `<line class="${m.cls}" x1="${x}" x2="${x}" y1="${m.text ? -off + 2 : top - 6}" y2="${f1(bottom)}"/>`;
        if (m.text) labels += `<text class="cmark" x="${f1(right ? x + 4 : x - 4)}" y="10" text-anchor="${right ? 'start' : 'end'}">${esc(m.text)}</text>`;
      }
    }
    const hits = this.hitList.map(h => {
      const xa = this.x(h.t0), xb = this.x(h.t1);
      return `<rect class="hit" data-text="${esc(h.text)}" tabindex="0" x="${xa}" y="0" width="${f1(Math.max(1, xb - xa))}" height="${f1(H + off)}"><title>${esc(h.text)}</title></rect>`;
    }).join('');
    return `<svg class="cchart" viewBox="0 0 ${this.W} ${f1(H + off)}" role="img" aria-label="${esc(label)}">${labels}<g transform="translate(0 ${off})">${back}${this.bg}${this.fg}${front}${this.top}</g>${hits}</svg>`;
  }
}
