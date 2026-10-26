// The one request the curation scripts make (phase 1 plan P1.19, README row 14):
// a GET that names RoWhether and gives up after 20 seconds. NWS, Nominatim and
// aviationweather.gov ask every client to say who it is and how to reach the owner.
// They are scripts a person runs, never the app or CI, and send nothing personal.
//
// OWNER-SETS: the contact address, in place of "OWNER-SETS-contact".
export const USER_AGENT = 'RoWhether/1.0 (+https://rowhether.com; OWNER-SETS-contact)';
export const TIMEOUT_MS = 20000;

// The answer to a GET: { status, headers, text }, whatever the status. The 20 seconds
// cover the body as well as the first byte. A request that gets no answer throws
// "no answer in 20 seconds"; any other failure is passed on as it came.
export async function get(url, { headers = {}, fetch: send = fetch } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await send(url, { headers: { 'User-Agent': USER_AGENT, ...headers }, signal: ctl.signal });
    return { status: r.status, headers: r.headers, text: await r.text() };
  } catch (e) {
    throw ctl.signal.aborted ? new Error(`no answer in ${TIMEOUT_MS / 1000} seconds`) : e;
  } finally { clearTimeout(timer); }
}

// The answer read as JSON. Anything but a 200 throws its status.
export async function getJSON(url, opts) {
  const r = await get(url, opts);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(r.text);
}
