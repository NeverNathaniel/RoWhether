import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { suggestContext } from '../src/suggest.js';
import { app, openLocation } from '../src/state.js';
import { effectiveSettings } from '../src/location.js';
import { cleanContext } from '../worker/suggest.js';
import { PUTNEY_FILE } from './helpers/putney-file.js';

// What a bug report says about the app (review Z13). The Worker keeps these
// setting keys and no others (worker/suggest.js, SETTING_KEYS), written out here.
const KEYS = ['heading', 'windCaution', 'windOff', 'gustCaution', 'gustOff', 'rainCaution', 'rainOff', 'coldCombined', 'flowCaution', 'flowOff', 'waterOverride', 'aqiCaution', 'aqiOff'];

describe('the context the suggestion form sends', () => {
  beforeEach(() => openLocation(PUTNEY_FILE, {}));
  afterEach(() => {
    vi.unstubAllGlobals();
    openLocation(null);
  });
  // The page the form is on, and the settings the app holds.
  function context(settings) {
    vi.stubGlobal('window', { innerWidth: 390, innerHeight: 844 });
    vi.stubGlobal('navigator', { userAgent: 'a test browser' });
    app.settings = settings;
    return suggestContext();
  }

  it('says what the page is', () => {
    const c = context(effectiveSettings(app.loc));
    expect(c).toMatchObject({ screen: '390x844', browser: 'a test browser', installed: false });
    expect(typeof c.version).toBe('string');
  });

  it('carries the course heading and every limit, whether or not the settings hold the heading', () => {
    const limits = effectiveSettings(app.loc);
    for (const settings of [limits, { ...limits, heading: 15 }]) {
      const c = context(settings);
      expect(c.settings).toEqual({ ...limits, heading: 15 });
      expect(Object.keys(c.settings).sort()).toEqual([...KEYS].sort());
    }
  });

  it("takes the viewer's own heading from the location, with the settings the app builds", () => {
    openLocation(PUTNEY_FILE, { heading: 20, windCaution: 8 });
    // From P0.10 the settings the app builds have no heading, so it can only come from the location.
    expect(app.settings).not.toHaveProperty('heading');
    const c = context(app.settings);
    expect(c.settings).toMatchObject({ heading: 20, windCaution: 8 });
    expect(Object.keys(c.settings).sort()).toEqual([...KEYS].sort());
  });

  it('is kept whole by the Worker', () => {
    const c = context(effectiveSettings(app.loc));
    expect(cleanContext(c).settings).toEqual(c.settings);
  });

  it('names the location the viewer is on', () => {
    expect(context(effectiveSettings(app.loc)).location).toBe('putney-landing');
  });

  // The form is offered on the not found page and the picker, where no location is open.
  it('gives no location and no settings, and does not throw, when none is open', () => {
    openLocation(null);
    const c = context(null);
    expect(c).toMatchObject({ screen: '390x844', browser: 'a test browser', location: null, settings: null });
    expect(() => JSON.stringify(c)).not.toThrow();
    // The Worker takes a context with no settings: it keeps an empty set of them.
    expect(cleanContext(c).settings).toEqual({});
  });
});
