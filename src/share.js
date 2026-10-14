// Share this call: the hero in a sentence or two, through the phone's share
// sheet, or copied to the clipboard where there is none.
import { $ } from './state.js';
import { hm } from './format.js';

const LABEL = 'Share this call';

export function shareText(now = Date.now()) {
  const why = $('why').innerText.replace(/\s*\n\s*/g, ' ').trim();
  const parts = [$('verdict').textContent.trim(), why, $('holds').textContent.trim()].filter(Boolean);
  return `Putney Landing rowing, ${hm(now)}: ${parts.join(' ')}`;
}

export function initShare() {
  const btn = $('shareBtn');
  const flash = t => { btn.textContent = t; setTimeout(() => { btn.textContent = LABEL; }, 2000); };
  btn.addEventListener('click', async () => {
    const text = shareText(), url = location.origin + location.pathname;
    try {
      if (navigator.share) { await navigator.share({ title: 'Putney Landing rowing call', text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      flash('Copied');
    } catch (e) {
      if (e && e.name === 'AbortError') return; // the share sheet was closed
      flash('Could not share');
    }
  });
}
