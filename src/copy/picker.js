// The words of the picker, the page at "/" and the search under an address with
// no location (07 5.1, 5.2, 4.7). Kept apart from the code, as 07 7.8 asks.
import { SITE_URL } from '../config.js';

const site = SITE_URL.slice(8, -1); // rowhether.com

export const T = {
  title: 'Change location',
  here: 'Showing now',
  find: 'Find a location',
  hint: 'Boathouse, lake, river or town',
  recent: 'Recent',
  all: 'All locations',
  close: 'Close',
  suggest: 'Suggest a location',
  notHere: 'Not here?',
  pageTitle: 'Where do you row?',
  pageLead: 'Pick your launch site. RoWhether checks wind, fog, storms, river flow and daylight there, hour by hour, and says Go, Caution or Stay off.',
  docTitle: 'RoWhether: pick a location',
  noList: 'The list of locations could not be loaded. Check the connection, then try again.',
  none: q => `Nothing matches "${q}". Check the spelling, or search for a town.`,
  shown: name => `Showing ${name}.`,
  // Near me (07 5.2.2)
  near: 'Near me',
  nearHint: 'Uses your position once to sort the list. It is not stored.',
  finding: 'Finding you',
  nearHead: 'Near you',
  nearNone: 'No locations within 100 km of you. Search by name.',
  denied: `Location is off for this site. Search by name, or allow location for ${site} in your browser settings.`,
  lost: 'Could not find your position. Try again, or search by name.',
  nearCount: n => `${n} ${n === 1 ? 'location' : 'locations'} near you.`,
  // Town search (07 5.2.1)
  places: 'Places',
  waiting: q => `No locations match "${q}". Looking for towns.`,
  pickTown: q => `No locations match "${q}". Pick a town to see locations near it.`,
  townFail: 'Town search is not available right now. Location names still work.',
  nearPlace: place => `Near ${place}`,
  noneNear: place => `No locations within 50 km of ${place}.`,
  nearPlaceCount: (n, place) => `${n} ${n === 1 ? 'location' : 'locations'} near ${place}.`
};
