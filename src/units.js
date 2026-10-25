// Display units. Internals stay mph, °F, inches and metres (07 7.3), and a
// number turns into text here and nowhere else. Only the US system exists in
// phase 0; the others come in phase 2 behind the same names (07 7.7).
import { r0, rng, fmtFlow, visText } from './format.js';

const same = v => v;
const deg = v => `${r0(v)}°F`;
const miles = m => `${(m / 1609.34).toFixed(1)} mi`;

export function unitFormat({ system = 'us', wind = 'auto' } = {}) {
  // Nothing picks another system yet. Refuse one rather than put US numbers
  // under another name.
  if (system !== 'us' || (wind !== 'auto' && wind !== 'mph')) throw new RangeError(`unitFormat: ${system} units with ${wind} wind are not built yet.`);
  return {
    system: 'us', windUnit: 'mph', speedUnit: 'mph', tempUnit: '°F',
    speed: v => `${r0(v)} mph`,
    // "9 to 14 mph", "38 to 52°F": the unit once, and one number when both ends round alike.
    speedRange: (a, b) => rng(a, b, ' mph'),
    tempRange: (a, b) => rng(a, b, '°F'),
    temp: deg,
    tempSum: deg,
    tempDiff: v => `${+v.toFixed(1)}°F`,
    precip: v => `${v.toFixed(2)} in`,
    rate: v => `${v.toFixed(2)} in an hour`,
    // The unit of a chart's title: "Amount, inches per hour", "Visibility in the model, miles".
    rateUnit: 'inches per hour',
    visUnit: 'miles',
    // vis is the visibility a reason names; dist is the visibility in a fact or
    // a table (08 14.2 P0.12 keeps visText for it).
    vis: miles,
    // How far the wind blows over still water (01 9.3).
    waterDist: miles,
    dist: visText,
    flow: fmtFlow,
    // The unit word of a gauge's title ("Flow, cfs"), for the units fmtFlow knows.
    flowUnit: unit => (unit === 'm3s' ? 'm³/s' : unit === 'ft' || unit === 'm' ? unit : 'cfs'),
    stage: (v, unit = 'ft') => fmtFlow(v, unit),
    aqi: v => `AQI ${r0(v)}`,
    // The visibilities that are stay off and caution for fog, in words.
    visOff: 'a quarter mile',
    visCaution: '1 mile',
    // A limit or a reading typed in these units, as the internal unit.
    toMph: same, toF: same, toFDiff: same, toFSum: same, toIn: same
  };
}
