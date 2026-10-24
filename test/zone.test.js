import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The unit and golden tests run in a zone that is neither New York, where the
// app is used, nor UTC, where CI and the Worker run (review Z11). An unknown
// zone falls back to the machine's, which is invisible when the machine is in
// New York or on UTC and wrong anywhere else. These two tests keep the pin
// from dropping silently.
describe('the zone the tests run in', () => {
  it('is Pacific/Auckland', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone, 'Run the tests with npm test, which sets TZ=Pacific/Auckland.').toBe('Pacific/Auckland');
  });

  it('is set by the test script in package.json', () => {
    const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts;
    expect(scripts.test).toMatch(/^TZ=Pacific\/Auckland /);
  });
});
