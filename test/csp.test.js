// The security headers in public/_headers (phase 1 plan P1.17, 08 10.11). The policy is written
// by hand, so these tests tie it to what the app does: every host a source adapter asks, the
// town search and Turnstile are allowed, the page has no inline script, and the loose settings
// (inline script, eval, wildcards) are not there. The browser spec test/browser/csp.spec.js
// enforces the same file on the built pages.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { parseHeadersFile, parseCsp } from './helpers/headers.js';
import { collectLocations } from '../scripts/locations/plugin.mjs';
import { ADAPTERS, bindingsFor } from '../src/sources/index.js';
import { resolveLocation } from '../src/location.js';
import { placesUrl } from '../src/picker.js';
import { SITE_URL } from '../src/config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(join(ROOT, path), 'utf8');
const RULES = parseHeadersFile(read('public/_headers'));
const rule = path => RULES.find(r => r.path === path);
const POLICY = rule('/*')?.headers['content-security-policy'];
const csp = parseCsp(POLICY || '');
const origin = url => new URL(url).origin;
const TURNSTILE = 'https://challenges.cloudflare.com';
const GEOCODING = 'https://geocoding-api.open-meteo.com';

describe('the _headers reader', () => {
  const TEXT = '# a comment\n/a/*\n  Cache-Control: no-cache\n\n/*\n  X-One: 1\n  Content-Security-Policy: default-src \'self\'; frame-ancestors \'none\'\n';

  it('reads a path, then the indented headers under it, by lowercased name', () => {
    expect(parseHeadersFile(TEXT)).toEqual([
      { path: '/a/*', headers: { 'cache-control': 'no-cache' } },
      { path: '/*', headers: { 'x-one': '1', 'content-security-policy': "default-src 'self'; frame-ancestors 'none'" } }
    ]);
  });

  it('refuses a header with no path above it', () => {
    expect(() => parseHeadersFile('  X-One: 1\n')).toThrow(/Cannot read/);
  });

  it('reads a policy as its directives and their sources', () => {
    expect(parseCsp("default-src 'self'; img-src 'self' data:; upgrade-insecure-requests")).toEqual({
      'default-src': ["'self'"], 'img-src': ["'self'", 'data:'], 'upgrade-insecure-requests': []
    });
  });
});

describe('public/_headers', () => {
  it('has one rule for every path with the four security headers', () => {
    expect(rule('/*'), 'a /* rule').toBeTruthy();
    expect(POLICY, 'a Content-Security-Policy').toBeTruthy();
    const h = rule('/*').headers;
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(h['x-content-type-options']).toBe('nosniff');
    // Near me asks for the position, so geolocation stays on for this origin and nothing else.
    expect(h['permissions-policy']).toContain('geolocation=(self)');
    expect(h['permissions-policy']).toContain('camera=()');
    expect(h['permissions-policy']).toContain('microphone=()');
  });

  it('keeps the caching rules', () => {
    expect(rule('/assets/*').headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(rule('/sw.js').headers['cache-control']).toBe('no-cache');
    expect(rule('/manifest.webmanifest').headers['cache-control']).toBe('no-cache');
    // The curated location files are not hashed (P1.2, 01 7.2).
    expect(rule('/locations/*').headers['cache-control']).toBe('public, max-age=3600');
  });

  it("stays inside Cloudflare's limits: 100 rules, 2,000 characters a line", () => {
    expect(RULES.length).toBeLessThanOrEqual(100);
    for (const line of read('public/_headers').split('\n')) expect(line.length, line.slice(0, 60)).toBeLessThanOrEqual(2000);
  });
});

describe('the Content-Security-Policy', () => {
  it('denies by default and closes what the app does not use', () => {
    expect(csp['default-src']).toEqual(["'self'"]);
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['base-uri']).toEqual(["'none'"]);
    expect(csp['form-action']).toEqual(["'self'"]);
    expect(csp['manifest-src']).toEqual(["'self'"]);
    expect(csp['worker-src']).toEqual(["'self'"]);
    expect(csp['font-src']).toEqual(["'self'"]);
    expect(csp['img-src']).toEqual(["'self'", 'data:']);
  });

  it('runs no inline script and no eval, and loads a script only from the app and Turnstile', () => {
    expect(csp['script-src']).toEqual(["'self'", TURNSTILE]);
    expect(csp['script-src']).not.toContain("'unsafe-inline'");
    expect(csp['script-src']).not.toContain("'unsafe-eval'");
    expect(csp['script-src-elem'], 'no second script directive that could loosen the first').toBeUndefined();
    expect(csp['script-src-attr']).toBeUndefined();
  });

  it('frames only Turnstile', () => {
    expect(csp['frame-src']).toEqual([TURNSTILE]);
  });

  it('allows an inline style attribute, which the charts and the week bars write', () => {
    expect(csp['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it('names every source: a keyword, data: for images, or an https origin with no path or wildcard', () => {
    for (const [directive, sources] of Object.entries(csp)) {
      for (const s of sources) {
        const ok = /^'(self|none|unsafe-inline)'$/.test(s) || s === 'data:' || /^https:\/\/[a-z0-9.-]+$/.test(s);
        expect(ok, `${directive}: ${s}`).toBe(true);
      }
    }
    expect(Object.values(csp).flat().filter(s => s === 'data:'), 'data: only where images need it').toHaveLength(1);
  });

  describe('connect-src', () => {
    const connect = csp['connect-src'] || [];

    it('is the app and https origins', () => {
      expect(connect[0]).toBe("'self'");
      expect(connect.slice(1).every(s => /^https:\/\/[a-z0-9.-]+$/.test(s))).toBe(true);
    });

    it('holds every host of every browser adapter', () => {
      const browser = Object.values(ADAPTERS).filter(a => a.via === 'browser');
      expect(browser.length, 'the adapters are read').toBeGreaterThan(5);
      for (const a of browser) {
        expect(a.hosts?.length, `${a.key} lists its hosts`).toBeGreaterThan(0);
        for (const host of a.hosts) expect(connect, `${a.key}: ${host}`).toContain(host);
      }
    });

    it('holds the town search and, for the sources of later phases, the flood, marine and tides hosts', () => {
      expect(connect).toContain(GEOCODING);
      expect(connect).toContain(origin(placesUrl('Worcester')));
      for (const host of ['https://flood-api.open-meteo.com', 'https://marine-api.open-meteo.com', 'https://api.tidesandcurrents.noaa.gov']) expect(connect).toContain(host);
    });

    it('holds the origin of every URL a curated location asks for, which the adapter also lists', () => {
      const list = collectLocations(ROOT);
      expect(list.length, 'every record under data/').toBeGreaterThanOrEqual(7);
      let urls = 0;
      for (const { rec, waterway } of list) {
        for (const b of bindingsFor(resolveLocation(rec, { waterway }), Date.UTC(2026, 5, 15, 16))) {
          urls++;
          expect(ADAPTERS[b.adapter].hosts, `${rec.slug} ${b.adapter} says where it asks`).toContain(origin(b.url));
          expect(connect, `${rec.slug} ${b.adapter}: ${b.url}`).toContain(origin(b.url));
        }
      }
      expect(urls, 'the sources of every record are read').toBeGreaterThan(40);
    });
  });

  it('allows the Turnstile script the suggestion form adds, and its frame', () => {
    const src = /TURNSTILE_SRC = '([^']+)'/.exec(read('src/suggest-form.js'))?.[1];
    expect(src, 'the form names its script').toBeTruthy();
    expect(csp['script-src']).toContain(origin(src));
    expect(csp['frame-src']).toContain(origin(src));
  });

  it('allows every https host the app code names, so a new one is added here when it is written', () => {
    const files = readdirSync(join(ROOT, 'src'), { recursive: true }).filter(f => f.endsWith('.js') && !f.startsWith('copy'));
    const named = new Set();
    for (const f of files) for (const m of read(join('src', f)).matchAll(/https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) named.add(`https://${m[1]}`);
    // The page's own address is the shared link and the canonical, never asked for.
    named.delete(origin(SITE_URL));
    expect([...named], 'the sweep finds the hosts').toEqual(expect.arrayContaining([TURNSTILE, GEOCODING, 'https://api.open-meteo.com']));
    const allowed = new Set([...csp['connect-src'], ...csp['script-src'], ...csp['frame-src']]);
    for (const host of named) expect(allowed.has(host), `${host} is in src/ and not in the policy`).toBe(true);
  });
});

describe('the pages', () => {
  // A script with no src is inline, and the policy has no 'unsafe-inline' for scripts. Neither is
  // an on... attribute, a javascript: address, a frame, or a base element.
  for (const page of ['index.html', 'privacy.html']) {
    it(`${page} has no inline script, event attribute, frame or base`, () => {
      const html = read(page);
      for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) expect(tag, 'a script with a src').toMatch(/\ssrc="/);
      for (const [, body] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) expect(body.trim(), 'no script text').toBe('');
      expect(html).not.toMatch(/\son[a-z]+\s*=/i);
      expect(html).not.toMatch(/javascript:/i);
      expect(html).not.toMatch(/<(iframe|base|object|embed)\b/i);
    });
  }
});
