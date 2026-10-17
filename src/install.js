// Install prompt. A bar at the bottom of the screen offers to add the app to
// the home screen. Where the browser can install it directly (Chrome, Edge,
// Samsung Internet), the button does it. Elsewhere it opens short steps for
// that browser. A quieter button in the footer stays for later. Nothing shows
// once the app runs installed, and Not now hides the bar for 30 days.
import { $ } from './state.js';
import { INSTALL_SNOOZE_MS } from './config.js';
import { loadInstallSnooze, saveInstallSnooze } from './storage.js';

export function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  } catch (e) { return false; }
}

// Which manual steps fit this browser, or null when there are none.
// iPadOS reports itself as a Mac, so touch points tell them apart.
export function installKind(ua, platform = '', touchPoints = 0) {
  if (/iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1)) {
    // In-app browsers (Instagram, Facebook, Gmail) leave Safari out of the
    // user agent and cannot add to the home screen.
    return /Safari\//.test(ua) ? 'ios' : 'ios-app';
  }
  if (/Android/.test(ua) && /Firefox\//.test(ua)) return 'android';
  // Safari 17 and later on a Mac can add a web app to the Dock.
  const mac = /Macintosh/.test(ua) && ua.match(/Version\/(\d+)[.\d]* Safari\//);
  if (mac && Number(mac[1]) >= 17) return 'mac';
  return null;
}

const SHARE_ICON = '<svg class="share-icon" viewBox="0 0 20 24" aria-hidden="true"><path d="M10 2v13M5.5 6.5 10 2l4.5 4.5M6.5 10H3v12h14V10h-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const IOS_STEPS = [
  `Tap the Share button ${SHARE_ICON}. In Safari it is in the toolbar, or in the menu under the More button (three dots).`,
  'Scroll down the list and tap Add to Home Screen.',
  'Tap Add. If you see Open as Web App, leave it on.'
];

const STEPS = {
  ios: { title: 'Add to your home screen', steps: IOS_STEPS },
  'ios-app': {
    title: 'Add to your home screen',
    steps: ['Open this page in Safari. In this app, look for Open in Safari or Open in browser, often under a menu or share button.', ...IOS_STEPS]
  },
  android: {
    title: 'Add to your home screen',
    steps: ['Tap the menu button (three dots).', 'Tap Add app to Home screen, or Install.', 'Tap Add.']
  },
  mac: {
    title: 'Add to your Dock',
    steps: ['In the menu bar, choose File, then Add to Dock.', 'Click Add.']
  }
};

let deferred = null; // the browser's install prompt, where it offers one
let kind = null;     // manual steps for this browser

function canInstall() { return !!deferred || !!kind; }

function showBar(on) {
  $('installBar').hidden = !on;
  document.body.classList.toggle('install-open', on);
}

function update() {
  if (isStandalone()) { showBar(false); $('installRow').hidden = true; return; }
  $('installRow').hidden = !canInstall();
  // The bar is for phones and tablets, or wherever one tap installs.
  const barKind = deferred || (kind && kind !== 'mac');
  showBar(!!barKind && Date.now() > loadInstallSnooze());
  $('installGo').textContent = deferred ? 'Install' : 'Show me how';
}

function snooze() {
  saveInstallSnooze(Date.now() + INSTALL_SNOOZE_MS);
  update();
}

function showSteps() {
  const s = STEPS[kind];
  $('insTitle').textContent = s.title;
  $('insSteps').innerHTML = s.steps.map(t => `<li>${t}</li>`).join('');
  $('install').showModal();
}

async function install() {
  if (deferred) {
    const prompt = deferred;
    deferred = null; // each prompt can be used once
    prompt.prompt();
    let outcome = 'dismissed';
    try { ({ outcome } = await prompt.userChoice); } catch (e) { /* ignore */ }
    if (outcome !== 'accepted') snooze();
    else update();
  } else if (kind) {
    showSteps();
    // The browser cannot tell when it has been added, so the bar steps
    // aside once the steps have been seen. The footer button stays.
    snooze();
  }
}

export function initInstall() {
  kind = installKind(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); // shown from the bar instead
    deferred = e;
    update();
  });
  window.addEventListener('appinstalled', () => { deferred = null; kind = null; update(); });
  try { window.matchMedia('(display-mode: standalone)').addEventListener('change', update); } catch (e) { /* old browser */ }
  $('installGo').addEventListener('click', install);
  $('installBtn').addEventListener('click', install);
  $('installLater').addEventListener('click', snooze);
  update();
}
