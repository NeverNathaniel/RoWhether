// Share this forecast: the hero in a sentence or two, through the phone's share
// sheet, or copied to the clipboard where there is none.
import { app, $ } from './state.js';
import { hm } from './format.js';
import { SITE_URL } from './config.js';

const LABEL = 'Share this forecast';

export function shareText(now = Date.now()) {
  const why = $('why').innerText.replace(/\s*\n\s*/g, ' ').trim();
  const parts = [$('verdict').textContent.trim(), why, $('holds').textContent.trim()].filter(Boolean);
  return `${app.loc.name} rowing, ${hm(now)}: ${parts.join(' ')}`;
}

export function initShare() {
  const btn = $('shareBtn');
  const flash = t => { btn.textContent = t; setTimeout(() => { btn.textContent = LABEL; }, 2000); };
  btn.addEventListener('click', async () => {
    // Production shares rowhether.com, whatever address it was opened on.
    // Dev shares its own address, so testers stay on dev.
    const env = app.info && app.info.env;
    const url = env && env !== 'production' ? location.origin + location.pathname : SITE_URL;
    const text = shareText();
    try {
      if (navigator.share) { await navigator.share({ title: `${app.loc.name} rowing forecast`, text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      flash('Copied');
    } catch (e) {
      if (e && e.name === 'AbortError') return; // the share sheet was closed
      flash('Could not share');
    }
  });
}
