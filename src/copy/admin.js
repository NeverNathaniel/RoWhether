// The words of the owner's pages (07 7.8, 5.14). The Worker answers with the setup and sign in
// sentences too (worker/admin.js), so a page that reads an error and one that sees none say the same.
// "This page needs a connection." is in src/route.js, which the main script holds: the page's own
// chunk is the thing that cannot be loaded then.
export const T = {
  title: 'Admin',
  purpose: 'Owner tools.',
  back: 'Back to the forecast',
  tab: 'Metrics',
  setup: 'The metrics page is not set up here.',
  signIn: 'Sign in through Cloudflare Access to see this page.',
  signInLink: 'Sign in',
  failed: 'The numbers could not be read. Try again later.',
  loading: 'Loading.',
  last: n => `Last ${n} days`,
  before: n => (n === 7 ? 'Week before' : `${n} days before`),
  utc: 'Days are UTC.',
  counted: env => `Counted by the ${env} instance.`,
  opens: 'Opens',
  firsts: 'New devices',
  standalone: 'From the home screen',
  firstsNote: 'A new device is a start where the browser had opened no location before. A browser that clears its storage counts again.',
  places: 'Locations',
  place: 'Location',
  eachDay: 'Each day',
  none: 'No location (picker or missing page)',
  other: 'Names the app does not list',
  otherNote: 'Anyone can send a name, so names the app does not list are added together.',
  empty: 'No opens in this window.',
  truncated: 'Not every row was read, so these numbers are low.',
  spark: name => `${name}: opens each day`,
  try: 'Try again'
};
