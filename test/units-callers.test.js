// The three views that call confidenceText() hand it the model's units (08 14.2
// P0.11). Two of them show it in their text, and test/units.test.js reads that.
// The Rain view cannot: with `only` set to 'rain' the wind sentence is never
// written, so the units are never read and no output differs. The call itself
// is what this file reads, on all three.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { HOUR } from '../src/config.js';
import { setZone } from '../src/format.js';
import { effectiveSettings } from '../src/location.js';
import { PUTNEY } from '../src/putney.js';
import { app } from '../src/state.js';
import { buildModel, confidenceText } from '../src/logic.js';
import * as rainView from '../src/render/detail/rain.js';
import * as windView from '../src/render/detail/wind.js';
import * as weekView from '../src/render/detail/week.js';
import { installFakeDom, uninstallFakeDom } from './helpers/fakedom.js';
import { T0, wx } from './helpers/forecast.js';

// The real confidenceText, recorded.
vi.mock('../src/logic.js', async importOriginal => {
  const real = await importOriginal();
  return { ...real, confidenceText: vi.fn(real.confidenceText) };
});

const SETTINGS = effectiveSettings(PUTNEY);
const NOON = T0 + 12 * HOUR;
const RIVER = { flow: { v: 6000, t: NOON }, waterC: { v: 20, t: NOON } };
const build = extra => buildModel(PUTNEY, { wx: wx(), river: RIVER, ...extra }, { ...SETTINGS }, NOON);

afterEach(() => { uninstallFakeDom(); setZone('America/New_York'); vi.useRealTimers(); confidenceText.mockClear(); });

describe('the views pass m.u to confidenceText', () => {
  // Two models 12 mph apart every hour, and one of them rainy: every view has a confidence to write.
  const model = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOON);
    installFakeDom({ width: 390 });
    const probe = build();
    const models = { ids: ['a', 'b'], hours: probe.hours.map(h => ({ t: h.t, wind: [2, 14], precip: [0, 0.05] })) };
    const m = build({ models });
    Object.assign(app, { loc: PUTNEY, model: m, settings: SETTINGS, data: m.data, errors: {} });
    return m;
  };

  for (const [name, view, only] of [['Rain', rainView, 'rain'], ['Wind', windView, 'wind'], ['Week', weekView, null]]) {
    it(`${name}: the third argument is the model's units`, () => {
      const m = model();
      view.render(m);
      const calls = confidenceText.mock.calls.filter(c => c[1] === only);
      expect(calls.length, 'the view wrote a confidence').toBeGreaterThan(0);
      for (const c of calls) expect(c[2]).toBe(m.u);
    });
  }
});
