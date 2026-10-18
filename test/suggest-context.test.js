import { describe, it, expect, afterEach, vi } from 'vitest';
import { suggestContext } from '../src/suggest.js';
import { app, applyOverrides } from '../src/state.js';
import { effectiveSettings } from '../src/location.js';
import { cleanContext } from '../worker/suggest.js';

// What a bug report says about the app (review Z13). The Worker keeps these
// setting keys and no others (worker/suggest.js, SETTING_KEYS), written out here.
const KEYS = ['heading', 'windCaution', 'windOff', 'gustCaution', 'gustOff', 'rainCaution', 'rainOff', 'coldCombined', 'flowCaution', 'flowOff', 'waterOverride', 'aqiCaution', 'aqiOff'];

describe('the context the suggestion form sends', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    applyOverrides({});
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

  it("takes the viewer's own heading from the location", () => {
    applyOverrides({ heading: 20 });
    const { heading, ...limits } = app.settings;
    expect(context(limits).settings.heading).toBe(20);
  });

  it('is kept whole by the Worker', () => {
    const c = context(effectiveSettings(app.loc));
    expect(cleanContext(c).settings).toEqual(c.settings);
  });
});
