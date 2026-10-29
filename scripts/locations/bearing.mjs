// The bearing and distance between two points, for a course heading and for a
// source's `distanceM` (phase 1 plan P1.19; 01 7.2).
//
//   node scripts/locations/bearing.mjs <lat1> <lon1> <lat2> <lon2>
//
// Along a river, give a point downstream first and a point upstream second: the
// bearing is the upstream heading, `course.heading`. Degrees are clockwise from north.
// Distances are great-circle metres on a sphere of radius 6,371,000 m, which reproduces
// the `distanceM` of 01 6.1 (19,659 m from the Putney dock to the North Walpole gauge).
// Pure functions are exported for the tests.
import { pathToFileURL } from 'node:url';
import { card } from '../../src/format.js';

const R = 6371000;
const rad = d => d * Math.PI / 180;

// The initial bearing from the first point to the second, in degrees from 0 up to 360.
export function bearing(lat1, lon1, lat2, lon2) {
  const p1 = rad(lat1), p2 = rad(lat2), dl = rad(lon2 - lon1);
  const deg = Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) * 180 / Math.PI;
  return (deg + 360) % 360;
}

// The great-circle distance in metres (haversine).
export function distanceM(lat1, lon1, lat2, lon2) {
  const p1 = rad(lat1), p2 = rad(lat2);
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const USAGE = 'Usage: node scripts/locations/bearing.mjs <lat1> <lon1> <lat2> <lon2>, in decimal degrees.';
// Four numbers from the command line: latitudes within 90 and longitudes within 180.
export function pointsFrom(args) {
  const n = args.length === 4 ? args.map(a => (a.trim() === '' ? NaN : Number(a))) : [];
  if (n.length !== 4 || !n.every(Number.isFinite) || Math.abs(n[0]) > 90 || Math.abs(n[2]) > 90 || Math.abs(n[1]) > 180 || Math.abs(n[3]) > 180) throw new Error(USAGE);
  return n;
}

// What the script prints.
export function bearingReport(lat1, lon1, lat2, lon2) {
  const b = bearing(lat1, lon1, lat2, lon2), m = distanceM(lat1, lon1, lat2, lon2);
  return `Bearing ${b.toFixed(1)} degrees (${card(b)}). Distance ${Math.round(m).toLocaleString('en-US')} m (${(m / 1609.344).toFixed(1)} mi).\nBack from the second point: ${bearing(lat2, lon2, lat1, lon1).toFixed(1)} degrees.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(bearingReport(...pointsFrom(process.argv.slice(2)))); } catch (e) { console.error(e.message); process.exit(2); }
}
