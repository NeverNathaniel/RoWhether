// A repeatable NWS tide forecast for the browser fixtures (P1.14): the shape NWPS answers for
// GTND2, the Potomac at Georgetown. 72 hourly heights from the scenario's clock, in feet,
// h = 4.0 + 1.6 sin(2 pi t / 12.42 h) with t in hours from the clock, rounded to a tenth as
// NWPS rounds. From a clock on the hour the first high is 5.6 ft 3 hours on, then a low of
// 2.4 ft at 9 hours and a high of 5.6 ft at 16 hours.
import { HOUR } from '../../src/config.js';

export const TIDE_PERIOD_H = 12.42;

export function tideAnswer(clock) {
  const data = Array.from({ length: 72 }, (_, i) => ({
    validTime: new Date(clock + i * HOUR).toISOString().replace('.000Z', 'Z'),
    generatedTime: new Date(clock - 5 * 60 * 1000).toISOString().replace('.000Z', 'Z'),
    primary: Math.round((4 + 1.6 * Math.sin(2 * Math.PI * i / TIDE_PERIOD_H)) * 10) / 10,
    secondary: -999
  }));
  return {
    pedts: 'HMIFF', issuedTime: new Date(clock - 5 * 60 * 1000).toISOString().replace('.000Z', 'Z'), wfo: 'LWX', timeZone: 'EST5EDT',
    primaryName: 'Tide Height', primaryUnits: 'ft', secondaryName: 'Flow', secondaryUnits: 'kcfs', data
  };
}
