// public/_headers as Cloudflare reads it (P1.17): a path on a line of its own, then
// the headers for it, indented. A line that starts with # is a comment. The unit test
// of the policy and the browser spec that enforces it both read the file through this.

// [{ path, headers }] in file order. `headers` is keyed by the lowercased name.
export function parseHeadersFile(text) {
  const rules = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) { rules.push({ path: raw.trim(), headers: {} }); continue; }
    const at = raw.indexOf(':');
    if (!rules.length || at < 0) throw new Error(`Cannot read this _headers line: ${raw}`);
    rules.at(-1).headers[raw.slice(0, at).trim().toLowerCase()] = raw.slice(at + 1).trim();
  }
  return rules;
}

// A policy as { directive: [source, ...] }, in the order written. A directive with no
// source lists nothing.
export function parseCsp(value) {
  const out = {};
  for (const part of value.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) out[name] = sources;
  }
  return out;
}
