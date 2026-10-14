// Dock reports: one tap at the dock to say what the water is really doing,
// shown to everyone for a few hours. Choices only, no free text, so there is
// nothing to moderate. Needs the DB binding (D1, see migrations/). Without it
// the feature is off and the app hides it.
//
// GET  /api/reports  the last REPORT_HOURS of reports, newest first
// POST /api/reports  { water, fog, debris } adds one

export const REPORT_HOURS = 3;
export const CHOICES = { water: ['flat', 'light', 'chop', 'rough'], fog: ['clear', 'patchy', 'thick'] };
const MAX_LIST = 20;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

// A report with only known choices, or null if it is invalid or empty.
export function cleanReport(body) {
  if (!body || typeof body !== 'object') return null;
  const out = {};
  for (const k of Object.keys(CHOICES)) {
    const v = body[k];
    if (v == null || v === '') out[k] = null;
    else if (CHOICES[k].includes(v)) out[k] = v;
    else return null;
  }
  out.debris = body.debris === true;
  if (!out.water && !out.fog && !out.debris) return null;
  return out;
}

const shape = r => ({ id: r.id, t: r.created_at, water: r.water, fog: r.fog, debris: !!r.debris });

export async function listReports(env, now = Date.now()) {
  if (!env.DB) return json({ enabled: false });
  const since = now - REPORT_HOURS * 3600e3;
  const { results } = await env.DB
    .prepare('SELECT id, created_at, water, fog, debris FROM reports WHERE created_at >= ? ORDER BY created_at DESC LIMIT ?')
    .bind(since, MAX_LIST).all();
  return json({ enabled: true, hours: REPORT_HOURS, reports: (results || []).map(shape) });
}

export async function addReport(request, env, now = Date.now()) {
  if (!env.DB) return json({ error: 'not_configured', message: 'Dock reports are not set up here.' }, 503);
  if (env.REPORT_LIMIT) {
    const ip = request.headers.get('CF-Connecting-IP');
    const { success } = await env.REPORT_LIMIT.limit({ key: ip || 'unknown' });
    if (!success) return json({ error: 'rate_limited', message: 'Too many reports at once. Wait a minute and try again.' }, 429);
  }
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad_request', message: 'That did not send. Try again.' }, 400); }
  const r = cleanReport(body);
  if (!r) return json({ error: 'empty', message: 'Pick at least one thing you saw.' }, 400);
  const res = await env.DB
    .prepare('INSERT INTO reports (created_at, water, fog, debris) VALUES (?, ?, ?, ?)')
    .bind(now, r.water, r.fog, r.debris ? 1 : 0).run();
  return json({ ok: true, report: { id: (res.meta && res.meta.last_row_id) || null, t: now, ...r } }, 201);
}
