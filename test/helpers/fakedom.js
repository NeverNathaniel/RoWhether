// A stand-in for the page, just enough for the render code to run in Node.
// installFakeDom() puts a `document` with getElementById on globalThis, and a
// matchMedia. Each id gets one persistent fake element, so what a render
// function wrote can be read back.
//
// innerHTML and textContent are two views of one value, as in a browser:
// writing either updates the other (textContent escapes, innerHTML strips tags
// and decodes entities). innerText is the text with a line break at block
// boundaries, which is what shareText() reads from the hero. The hero's
// span.cond is a block in src/styles/app.css (.why .cond), so it counts as one.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0' };
const decode = s => s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (all, d, x, n) =>
  d ? String.fromCodePoint(+d) : x ? String.fromCodePoint(parseInt(x, 16)) : (n.toLowerCase() in ENTITIES ? ENTITIES[n.toLowerCase()] : all));
const strip = html => decode(html.replace(/<[^>]*>/g, ''));
const BLOCK = /<\/?(?:div|p|ul|ol|li|dl|dt|dd|h[1-6]|table|tr|figure|figcaption|details|summary|pre|section|br)\b[^>]*>|<span class="cond">/gi;
const escape = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// An object that notes when it is written to.
const watched = el => new Proxy({}, { set(o, k, v) { el.written = true; o[k] = v; return true; } });

export class FakeElement {
  constructor(id, width) {
    this.id = id;
    this.clientWidth = width;
    this.written = false; // true once anything was assigned to it
    this._html = '';
    this._text = '';
    this._hidden = false;
    this._disabled = false;
    this.dataset = watched(this);
    this.style = watched(this);
    this.extra = {}; // any other property the page code set, such as title or className
    this.attrs = {}; // what setAttribute() wrote, which the golden capture does not record
    // A property the stand-in does not model is kept, not lost, so a change that
    // starts setting an attribute shows up in the captured output.
    return new Proxy(this, {
      set(o, k, v, recv) {
        if (typeof k === 'string' && !(k in o)) { o.extra[k] = typeof v === 'object' && v !== null ? String(v) : v; o.written = true; return true; }
        return Reflect.set(o, k, v, recv);
      }
    });
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this.written = true; this._html = String(v ?? ''); this._text = strip(this._html); }
  get textContent() { return this._text; }
  set textContent(v) { this.written = true; this._text = String(v ?? ''); this._html = escape(this._text); }
  get innerText() { return strip(this._html.replace(BLOCK, '\n')); }
  get hidden() { return this._hidden; }
  set hidden(v) { this.written = true; this._hidden = !!v; }
  get disabled() { return this._disabled; }
  set disabled(v) { this.written = true; this._disabled = !!v; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

export function installFakeDom({ width = 390 } = {}) {
  const els = new Map();
  const el = id => { if (!els.has(id)) els.set(id, new FakeElement(id, width)); return els.get(id); };
  globalThis.document = { getElementById: el };
  // Only min-width queries are answered. 1rem is 16px.
  globalThis.matchMedia = q => {
    const m = /min-width:\s*([\d.]+)(rem|px)/.exec(q);
    return { media: q, matches: !!m && width >= parseFloat(m[1]) * (m[2] === 'rem' ? 16 : 1) };
  };
  return { el, elements: () => [...els.values()] };
}

export function uninstallFakeDom() {
  delete globalThis.document;
  delete globalThis.matchMedia;
}
