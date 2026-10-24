// The words of the picker, the page at "/" and the search under an address with
// no location (07 5.1, 5.2, 4.7). Kept apart from the code, as 07 7.8 asks.
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
  shown: name => `Showing ${name}.`
};
