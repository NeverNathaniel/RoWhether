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
export const CHANGES = {};
