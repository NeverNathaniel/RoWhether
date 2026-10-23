// The header and the footer (phase 1 plan P1.5, 07 4.3, 6.1, 6.4, 6.7): the saved
// label with its day, the subtitle and the zone it names, the credits as links, the
// install sentence, the title's size class and the badge. Run in Pacific/Auckland,
// which is neither the dock's zone nor the viewer's in these cases, so a line that
// reads the machine's zone fails.
import { describe, it, expect } from 'vitest';
import { linkText } from '../src/format.js';

describe('linkText', () => {
  it('turns [text](https://...) into a link that opens in a new tab', () => {
    expect(linkText('From [Open-Meteo](https://open-meteo.com/) and [USGS](https://waterdata.usgs.gov/monitoring-location/USGS-01154500/).'))
      .toBe('From <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> and <a href="https://waterdata.usgs.gov/monitoring-location/USGS-01154500/" target="_blank" rel="noopener">USGS</a>.');
  });

  it('leaves every other kind of link as text', () => {
    expect(linkText('[a](javascript:alert(1))')).toBe('[a](javascript:alert(1))');
    expect(linkText('[a](http://example.com/)')).toBe('[a](http://example.com/)');
    expect(linkText('[a](//example.com/)')).toBe('[a](//example.com/)');
    expect(linkText('[a](data:text/html,x)')).toBe('[a](data:text/html,x)');
    expect(linkText('[a](HTTPS://example.com/)')).toBe('[a](HTTPS://example.com/)');
  });

  it('escapes the text, and the link text with it', () => {
    expect(linkText('<b>x</b> & "y"')).toBe('&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;');
    expect(linkText('[<i>a</i>](https://example.com/)')).toBe('<a href="https://example.com/" target="_blank" rel="noopener">&lt;i&gt;a&lt;/i&gt;</a>');
  });

  it('cannot leave the href: a quote or a tag in the address is escaped or ends it', () => {
    const out = linkText('[a](https://x.com/"onmouseover="alert(1))');
    expect(out).not.toMatch(/ onmouseover=/);
    expect(out).toContain('href="https://x.com/&quot;onmouseover=&quot;alert(1"');
    expect(linkText('[a](https://x.com/<script>)')).toBe('<a href="https://x.com/&lt;script&gt;" target="_blank" rel="noopener">a</a>');
  });

  it('leaves text with no link as it is, and a missing text as nothing', () => {
    expect(linkText('Plain text, no links.')).toBe('Plain text, no links.');
    expect(linkText('[brackets] and (parentheses)')).toBe('[brackets] and (parentheses)');
    expect(linkText(null)).toBe('');
    expect(linkText(undefined)).toBe('');
  });
});
