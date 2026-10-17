// Suggestion form. Sends text to /api/suggest, where the Worker checks
// Turnstile, has Claude rewrite it, and files a GitHub issue for review.
// The button only appears when the Worker says the feature is configured.
import { app, $ } from './state.js';
import { MAX_TEXT } from './config.js';
import { isStandalone } from './install.js';

// Cloudflare Turnstile must load from Cloudflare. It loads only when the form
// is first opened, so the rest of the app still works offline.
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let siteKey = null, widgetId = null, scriptLoad = null, sending = false;

function loadTurnstile() {
  if (!scriptLoad) {
    scriptLoad = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TURNSTILE_SRC;
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')));
      s.onerror = () => { scriptLoad = null; reject(new Error('turnstile failed to load')); };
      document.head.appendChild(s);
    });
  }
  return scriptLoad;
}

function status(text) { $('sugStatus').textContent = text; }

function context() {
  return {
    version: __APP_VERSION__,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    browser: navigator.userAgent,
    installed: isStandalone(),
    settings: app.settings
  };
}

function resetForm() {
  $('sugBody').hidden = false;
  $('sugDone')?.remove();
  $('sugSend').hidden = false;
  $('sugCancel').textContent = 'Cancel';
  $('sugText').value = '';
  updateCount();
  status('');
}

function updateCount() {
  const n = $('sugText').value.length;
  $('sugCount').textContent = n > MAX_TEXT - 200 ? `${MAX_TEXT - n} characters left` : '';
}

async function open() {
  const dlg = $('suggest');
  if ($('sugDone')) resetForm();
  dlg.showModal();
  $('sugText').focus();
  if (widgetId !== null) return;
  try {
    const ts = await loadTurnstile();
    widgetId = ts.render('#sugCheck', { sitekey: siteKey, action: 'suggest', appearance: 'interaction-only', theme: 'auto', size: 'flexible' });
  } catch (e) {
    status('The spam check could not load. Check your connection, then close and reopen this form.');
  }
}

async function send(e) {
  e.preventDefault();
  if (sending) return;
  const text = $('sugText').value.trim();
  if (text.length < 10) { status('Add a little more detail, at least a sentence.'); $('sugText').focus(); return; }
  const token = widgetId !== null && window.turnstile ? window.turnstile.getResponse(widgetId) : '';
  if (!token) { status('Still checking that you are not a bot. Try again in a moment.'); return; }

  sending = true;
  $('sugSend').disabled = true;
  status('Sending.');
  try {
    const r = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, token, context: context() })
    });
    let data = {};
    try { data = await r.json(); } catch (err) { /* not JSON */ }
    if (r.ok && data.ok) {
      $('sugBody').hidden = true;
      $('sugBody').insertAdjacentHTML('afterend', '<p class="sug-done" id="sugDone" role="status">Thanks. Your suggestion was sent to the maintainer for review.</p>');
      $('sugSend').hidden = true;
      $('sugCancel').textContent = 'Close';
      $('sugText').value = '';
    } else {
      status(data.message || 'Could not send it right now. Try again later.');
    }
  } catch (err) {
    status(navigator.onLine === false ? 'You are offline. Try again when you have a connection.' : 'Could not send it right now. Try again later.');
  } finally {
    sending = false;
    $('sugSend').disabled = false;
    // Tokens are single use. Get a fresh one for any retry.
    if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
  }
}

export async function initSuggest() {
  try {
    const r = await fetch('/api/suggest', { headers: { Accept: 'application/json' } });
    if (!r.ok) return;
    const c = await r.json();
    if (!c.enabled || !c.siteKey) return;
    siteKey = c.siteKey;
  } catch (e) {
    return; // offline, local dev, or not deployed with the Worker
  }
  $('suggestRow').hidden = false;
  $('suggestBtn').addEventListener('click', open);
  $('sugForm').addEventListener('submit', send);
  $('sugText').addEventListener('input', () => { updateCount(); if (!sending) status(''); });
  $('sugCancel').addEventListener('click', () => $('suggest').close());
}
