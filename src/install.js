// Install prompt. A bar at the bottom of the screen offers to add the app to
// the home screen. Where the browser can install it directly (Chrome, Edge,
// Samsung Internet), the button does it. Elsewhere it opens short steps for
// that browser. Buttons in the footer and in Settings stay for later. Nothing
// shows once the app runs installed.
//
// The bar comes back on every visit. Not now hides it until the next one.
// Once it has been dismissed INSTALL_ASKS times, it also offers Don't show
// again. A visit is a page load, or coming back after INSTALL_VISIT_GAP_MS.
import { $ } from './state.js';
import { INSTALL_ASKS, INSTALL_VISIT_GAP_MS } from './config.js';
import { loadInstall, saveInstall } from './storage.js';

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

// Whether the bar shows, and whether it offers Don't show again.
export function barState(saved, { canBar, standalone, hiddenThisVisit }) {
  const show = canBar && !standalone && !saved.never && !hiddenThisVisit;
  return { show, offerNever: show && saved.dismissed >= INSTALL_ASKS };
}

let deferred = null;         // the browser's install prompt, where it offers one
let kind = null;             // manual steps for this browser
let hiddenThisVisit = false; // Not now, or the steps were opened, this visit
let awaySince = 0;           // when the tab was last hidden

function canInstall() { return !!deferred || !!kind; }

function showBar(on) {
  $('installBar').hidden = !on;
  document.body.classList.toggle('install-open', on);
}

function update() {
  const standalone = isStandalone();
  $('installRow').hidden = $('setInstall').hidden = standalone || !canInstall();
  // The bar is for phones and tablets, or wherever one tap installs.
  const canBar = !!deferred || (!!kind && kind !== 'mac');
  const { show, offerNever } = barState(loadInstall(), { canBar, standalone, hiddenThisVisit });
  showBar(show);
  $('installNever').hidden = !offerNever;
  $('installGo').textContent = deferred ? 'Install' : 'Show me how';
}

// Hide the bar until the next visit, and count it toward Don't show again.
function dismiss() {
  if (!hiddenThisVisit && !$('installBar').hidden) {
    const s = loadInstall();
    saveInstall({ ...s, dismissed: s.dismissed + 1 });
  }
  hiddenThisVisit = true;
  update();
}

function never() {
  saveInstall({ ...loadInstall(), never: true });
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
    if (outcome !== 'accepted') dismiss();
    else update();
  } else if (kind) {
    showSteps();
    // The browser cannot tell when it has been added, so the bar steps
    // aside for this visit once the steps have been seen.
    dismiss();
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
  $('setInstallBtn').addEventListener('click', install);
  $('installLater').addEventListener('click', dismiss);
  $('installNever').addEventListener('click', never);
  // The footer has to clear the bar, and the bar's height changes with the
  // screen width and with Don't show again, so the style sheet reads it here.
  const bar = $('installBar');
  new ResizeObserver(() => document.body.style.setProperty('--install-h', `${bar.offsetHeight}px`)).observe(bar);
  // A phone often keeps the tab alive, so coming back after a while is a
  // new visit too.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { awaySince = Date.now(); return; }
    if (awaySince && Date.now() - awaySince >= INSTALL_VISIT_GAP_MS) { hiddenThisVisit = false; update(); }
  });
  update();
}
