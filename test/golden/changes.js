// The changes to Putney's golden output that phase 1 makes on purpose, one
// entry each (phase 1 plan 3.2 and 3.4). A commit that rewrites a golden file
// names the ids it applies in a `Golden:` trailer, and
// `node scripts/golden.mjs check <base>` fails a change outside them.
//
//   export const CHANGES = {
//     saved: {
//       why: '07 3.2 and 6.7: the header says "Saved 6:41 AM" in place of "Saved data from 6:41 AM".',
//       step: 'P1.5',
//       files: ['*'],                 // case names; * and ** match any run of characters
//       paths: ['status.header.cached', 'status.header.failed']
//     }
//   };
//
// Paths are keys joined with dots, and an array item is its index. `*` is one
// segment and `**` is any number. A key a v-* or p-* file stores as a digest
// ({ sha256, bytes }) is covered by any pattern that starts with that key.
// An id is never widened after its commit. A step that finds a golden path moving
// outside its planned ids adds a new id, with its source section, in the same
// commit, and says so in its progress entry.
export const CHANGES = {
  saved: {
    why: '07 3.2 and 6.7: the header says "Saved 6:41 AM" in place of "Saved data from 6:41 AM" (with the day when the copy is older; owner, 2026-10-21, R1).',
    step: 'P1.5',
    // What moved: the 19 main cases and the variants with a model. The probes and v-june-stale-forecast, which has none, do not.
    files: ['april-*', 'fall-back-*', 'june-calm-*', 'october-fog-*', 'v-*'],
    paths: ['status.header.cached', 'status.header.failed']
  },
  'alerts-zones': {
    why: "01 6.1 and README row 6: Putney's alerts are asked for by the four NWS zones of both banks (VTZ015, VTC025, NHZ011, NHC005), in place of the point.",
    step: 'P1.8',
    // Only the 19 main cases record the requests; every variant is lean.
    files: ['april-*', 'fall-back-*', 'june-calm-*', 'october-fog-*'],
    paths: ['sources.1.1']
  },
  'marine-alerts': {
    why: 'README row 11 and R18 (owner, 2026-10-21): eight whole NWS event names are Stay off, Small Craft Advisory, Gale, Storm, Special Marine, Hurricane Force Wind, Hurricane, Storm Surge and Tropical Storm Warning. Tropical Storm Warning moves from 1 to 2 and can reach Putney.',
    step: 'P1.8',
    // p-pure records each name's level, and the probe's list gains the seven it lacked. v-june-alerts has a Small Craft Advisory.
    files: ['p-pure', 'v-june-alerts'],
    paths: [
      'alertLevels.Small Craft Advisory', 'alertLevels.Gale Warning', 'alertLevels.Storm Warning', 'alertLevels.Special Marine Warning',
      'alertLevels.Hurricane Force Wind Warning', 'alertLevels.Hurricane Warning', 'alertLevels.Storm Surge Warning', 'alertLevels.Tropical Storm Warning',
      // Everything the variant draws from that one advisory's level.
      'forecasts.**', 'home.**', 'model.**', 'parsers.**', 'runs.**', 'share', 'status.**', 'views.**'
    ]
  },
  'usgs-v1': {
    why: 'USGS /ogcapi/v1 (02 Decision, 08 K10, plan section 10): the three USGS requests move from v0 to v1, and the latest one lists each gauge once and asks for up to 50 readings.',
    step: 'P1.8',
    files: ['april-*', 'fall-back-*', 'june-calm-*', 'october-fog-*'],
    // river (latest), flow (48 hours) and flowDays (daily means).
    paths: ['sources.3.1', 'sources.4.1', 'sources.5.1']
  }
};
