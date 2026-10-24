// How the variant and probe files stay small. A key of a v-* or p-* file whose
// JSON is over DIGEST_OVER bytes is stored as { sha256, bytes } of its canonical
// JSON, not in full. Smaller keys stay in full, so a failure there reads as a
// diff. The 19 main case files are never trimmed.
//
// The check loses nothing: two values have the same digest exactly when they
// have the same canonical JSON, and the canonical JSON is the whole value with
// its keys in sorted order, which is what toEqual compares (it ignores the
// order of keys). To see what changed in a digested key, dump the case at the
// base commit and at HEAD and diff (node scripts/golden.mjs dump <case>, which
// always writes full values).
//
// Used by test/golden/harness.js for both writing and comparing.
import { createHash } from 'node:crypto';

export const DIGEST_OVER = 8 * 1024;

// JSON text of a value with every object's keys sorted, so the same value
// always gives the same text whatever order its code built it in. Captured
// values have been through JSON.parse, so they hold only what JSON holds.
export function canonical(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(x => (x === undefined ? 'null' : canonical(x))).join(',')}]`;
  const parts = Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical(v[k])}`);
  return `{${parts.join(',')}}`;
}

const digestOfText = s => ({ sha256: createHash('sha256').update(s).digest('hex'), bytes: Buffer.byteLength(s) });

// { sha256, bytes } of a value's canonical JSON.
export const digestOf = v => digestOfText(canonical(v));

// Whether a value read from a golden file is a stored digest.
export const isDigest = v => v !== null && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join() === 'bytes,sha256' && typeof v.sha256 === 'string' && /^[0-9a-f]{64}$/.test(v.sha256) && Number.isInteger(v.bytes);

// A captured object as its golden file stores it: each large top-level key as a digest.
export function trimmed(have) {
  return Object.fromEntries(Object.entries(have).map(([k, v]) => {
    const s = canonical(v);
    return [k, Buffer.byteLength(s) > DIGEST_OVER ? digestOfText(s) : v];
  }));
}
