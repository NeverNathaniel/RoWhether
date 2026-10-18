import { describe, it, expect } from 'vitest';
import { installKind, barState } from '../src/install.js';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  macSafari16: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  androidChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0'
};

describe('installKind', () => {
  it('gives iOS steps in Safari and other iOS browsers', () => {
    expect(installKind(UA.iphoneSafari, 'iPhone', 5)).toBe('ios');
    expect(installKind(UA.iphoneChrome, 'iPhone', 5)).toBe('ios');
  });
  it('asks in-app browsers on iOS to open Safari first', () => {
    expect(installKind(UA.iphoneInstagram, 'iPhone', 5)).toBe('ios-app');
  });
  it('tells an iPad from a Mac by touch', () => {
    expect(installKind(UA.ipadDesktop, 'MacIntel', 5)).toBe('ios');
    expect(installKind(UA.ipadDesktop, 'MacIntel', 0)).toBe('mac');
  });
  it('gives Mac steps only from Safari 17', () => {
    expect(installKind(UA.macSafari16, 'MacIntel', 0)).toBe(null);
    expect(installKind(UA.macChrome, 'MacIntel', 0)).toBe(null);
  });
  it('leaves Chrome on Android to its own prompt and gives Firefox steps', () => {
    expect(installKind(UA.androidChrome, 'Linux armv8l', 5)).toBe(null);
    expect(installKind(UA.androidFirefox, 'Linux armv8l', 5)).toBe('android');
  });
});

describe('barState', () => {
  const on = { canBar: true, standalone: false, hiddenThisVisit: false };
  it('shows on every visit until dismissed this visit', () => {
    expect(barState({ dismissed: 0, never: false }, on)).toEqual({ show: true, offerNever: false });
    expect(barState({ dismissed: 2, never: false }, { ...on, hiddenThisVisit: true }).show).toBe(false);
  });
  it("offers Don't show again from the fifth dismissal on", () => {
    expect(barState({ dismissed: 4, never: false }, on).offerNever).toBe(false);
    expect(barState({ dismissed: 5, never: false }, on)).toEqual({ show: true, offerNever: true });
  });
  it("stays hidden after Don't show again, when installed, or where it cannot install", () => {
    expect(barState({ dismissed: 6, never: true }, on).show).toBe(false);
    expect(barState({ dismissed: 0, never: false }, { ...on, standalone: true }).show).toBe(false);
    expect(barState({ dismissed: 0, never: false }, { ...on, canBar: false }).show).toBe(false);
  });
});
