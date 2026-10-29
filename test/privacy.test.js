import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { cleanContext } from '../worker/suggest.js';
import { SITE_URL } from '../src/config.js';

// The privacy page (P1.16, 07 5.15) as a source file. The browser checks read the built page; these
// read what the build is given, for the rules a build cannot show: with two pages that share a
// stylesheet module, Vite splits it and index.html links two (R12).
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(join(ROOT, 'privacy.html'), 'utf8');
const index = readFileSync(join(ROOT, 'index.html'), 'utf8');
const css = readFileSync(join(ROOT, 'src/styles/privacy.css'), 'utf8');
// An en dash, an em dash and a middle dot, by code, so this file holds none of them.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014, 0xb7)}]`);

describe('privacy.css', () => {
  it('imports the colors and the font, and nothing else, so it shares no module with the app', () => {
    const imports = [...css.matchAll(/@import\s+(?:url\()?['"]([^'"]+)['"]/g)].map(m => m[1]);
    expect(imports).toEqual(['./tokens.css', '@fontsource-variable/archivo/wdth.css']);
  });
});

describe('privacy.html', () => {
  it('is plain HTML: no script, and one stylesheet, its own', () => {
    expect(html).not.toMatch(/<script/i);
    expect([...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(m => m[0].match(/href="([^"]+)"/)[1])).toEqual(['/src/styles/privacy.css']);
    expect(html).not.toMatch(/\.js\b|\bon[a-z]+=/);
  });

  it('says the sentence of 07 14.3 word for word, and that there is no account', () => {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('RoWhether works without an account.');
    expect(text).toContain('We count how many times the app is opened at each location each day, and whether it was opened from the home screen. The count has no address, device or account attached, and it is deleted after three months.');
  });

  // A bug report puts these in a public issue (worker/suggest.js, cleanContext). The page names each one, so a
  // field added to the report without a word here fails.
  it('names everything a bug report puts in the public issue, and says that settings leave the device only then', () => {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const kept = Object.keys(cleanContext({ version: 'v', screen: 's', browser: 'b', installed: true, settings: {}, location: 'putney-landing' })).sort();
    expect(kept).toEqual(['browser', 'installed', 'screen', 'settings', 'version']);
    const named = { version: 'the app version', screen: 'your screen size', browser: 'your browser', installed: 'whether it runs from the home screen', settings: 'your settings' };
    for (const k of kept) expect(text, k).toContain(named[k]);
    expect(text).toContain('never sent to RoWhether, apart from the settings in a bug report that you choose to send');
    expect(text).toContain('This is the one case where settings leave your device, and only when you send it.');
  });

  // A phone draws the page at the device's width only with the viewport tag, and at 980 px shrunk without it. A
  // desktop browser set to 360 px ignores the tag, so no browser check here can see it go.
  it('is laid out at the device width, in English, in the app\'s theme colors, with its canonical address under the site', () => {
    expect(html).toMatch(/^<!doctype html>\s*<html lang="en">/i);
    for (const re of [/<meta name="viewport"[^>]*>/g, /<meta name="theme-color"[^>]*>/g]) {
      expect(html.match(re) || [], String(re)).not.toEqual([]);
      expect(html.match(re), String(re)).toEqual(index.match(re));
    }
    expect(html.match(/<link rel="canonical" href="([^"]+)"/)[1]).toBe(`${SITE_URL}privacy`);
  });

  it('has a header with a way back, and a date for its last change', () => {
    expect(html).toMatch(/<p class="name">RoWhether<\/p>\s*<a href="\/">Back to the forecast<\/a>/);
    expect(html).toMatch(/<p class="changed">Last changed (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}\.<\/p>/);
  });

  it('follows the writing rules: no em or en dash, no emoji, no middle dot, and no "call" for the verdict', () => {
    for (const [name, text] of [['privacy.html', html], ['privacy.css', css]]) {
      expect(text, name).not.toMatch(DASHES);
      expect(text, name).not.toMatch(/\p{Extended_Pictographic}/u);
    }
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(/\bcall(s|ed)?\b/i);
  });
});
