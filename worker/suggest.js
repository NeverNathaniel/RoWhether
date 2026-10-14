// POST /api/suggest: turn a suggestion from the app into a GitHub issue for
// the maintainer to review.
//
// Order of checks: configured, rate limit, input, Turnstile, Claude, GitHub.
// Cheap checks come first so spam never reaches the paid API.
import { rewriteSuggestion } from './claude.js';
import { createIssue } from './github.js';
import { verifyTurnstile } from './turnstile.js';

export const MAX_TEXT = 2000;
const MIN_TEXT = 10;
const LABELS = { feature: 'enhancement', bug: 'bug' };
const REVIEW_LABELS = ['from app', 'needs review'];
// Settings keys the app may send with a bug report.
const SETTING_KEYS = ['heading', 'windCaution', 'windOff', 'gustCaution', 'gustOff', 'rainCaution', 'rainOff',
  'coldCombined', 'flowCaution', 'flowOff', 'waterOverride', 'aqiCaution', 'aqiOff'];

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

const configured = env => !!(env.ANTHROPIC_API_KEY && env.GITHUB_TOKEN && env.GITHUB_REPO &&
  env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);

// GET /api/suggest: tells the app whether to show the button, and the public
// Turnstile site key it needs to render the check.
export function suggestConfig(env) {
  return configured(env) ? json({ enabled: true, siteKey: env.TURNSTILE_SITE_KEY }) : json({ enabled: false });
}

// Stop @mentions in public text from notifying GitHub users.
export function noMentions(s) {
  return String(s).replace(/@(?=[A-Za-z0-9_-])/g, '@​');
}

// Keep only short, known fields from the app's context.
export function cleanContext(ctx) {
  if (!ctx || typeof ctx !== 'object') return null;
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const out = { version: str(ctx.version, 40), screen: str(ctx.screen, 20), browser: str(ctx.browser, 200),
    installed: ctx.installed === true, settings: {} };
  const s = ctx.settings && typeof ctx.settings === 'object' ? ctx.settings : {};
  for (const k of SETTING_KEYS) {
    const v = s[k];
    if (typeof v === 'number' && isFinite(v)) out.settings[k] = v;
    else if (typeof v === 'string' && v.length <= 10) out.settings[k] = v;
  }
  return out;
}

// Build the GitHub issue from Claude's rewrite, the original text and context.
export function buildIssue(rw, text, ctx) {
  const quote = text.trim().split('\n').map(l => `> ${l}`).join('\n');
  const parts = [`## Summary\n\n${rw.summary}`];
  if (rw.details.length) parts.push(`## Details\n\n${rw.details.map(d => `- ${d}`).join('\n')}`);
  parts.push(`## Original suggestion\n\n${quote}`);
  if (rw.kind === 'bug' && ctx) {
    const settings = Object.entries(ctx.settings).map(([k, v]) => `${k}: ${v === '' ? 'blank' : v}`).join(', ');
    parts.push(['## App context', '',
      `- Version: ${ctx.version || 'unknown'}`,
      `- Screen: ${ctx.screen || 'unknown'}${ctx.installed ? ', installed to home screen' : ''}`,
      `- Browser: ${ctx.browser || 'unknown'}`,
      `- Settings: ${settings || 'unknown'}`].join('\n'));
  }
  parts.push('---\nSent from the in-app suggestion form and rewritten by Claude. Check it against the original before acting on it.');
  return {
    title: noMentions(rw.title).slice(0, 120),
    body: noMentions(parts.join('\n\n')).slice(0, 60000),
    labels: [LABELS[rw.kind], ...REVIEW_LABELS]
  };
}

const DEFAULT_DEPS = { verifyTurnstile, rewriteSuggestion, createIssue };

export async function handleSuggest(request, env, deps = DEFAULT_DEPS) {
  if (!configured(env)) return json({ error: 'not_configured', message: 'Suggestions are not set up yet.' }, 503);

  const ip = request.headers.get('CF-Connecting-IP') || '';
  if (env.SUGGEST_LIMIT) {
    const { success } = await env.SUGGEST_LIMIT.limit({ key: ip || 'unknown' });
    if (!success) return json({ error: 'rate_limited', message: 'Too many suggestions at once. Wait a minute and try again.' }, 429);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request', message: 'That request was not readable.' }, 400); }
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (text.length < MIN_TEXT) return json({ error: 'too_short', message: 'Add a little more detail, at least a sentence.' }, 400);
  if (text.length > MAX_TEXT) return json({ error: 'too_long', message: `Keep it under ${MAX_TEXT} characters.` }, 400);
  const token = typeof body?.token === 'string' ? body.token.slice(0, 2048) : '';
  if (!token || !(await deps.verifyTurnstile(env, token, ip))) {
    return json({ error: 'verification_failed', message: 'The spam check did not pass. Try again.' }, 403);
  }

  let rw;
  try { rw = await deps.rewriteSuggestion(env, text); } catch (e) {
    console.error('rewrite failed', e);
    return json({ error: 'unavailable', message: 'Could not process suggestions right now. Try again later.' }, 502);
  }
  if (rw.kind === 'reject') return json({ error: 'rejected', message: rw.reject_reason || 'That did not read as a feature request or bug report.' }, 422);
  if (!rw.title || !rw.summary) {
    return json({ error: 'unavailable', message: 'Could not process suggestions right now. Try again later.' }, 502);
  }

  try {
    await deps.createIssue(env, buildIssue(rw, text, cleanContext(body.context)));
  } catch (e) {
    console.error('issue failed', e);
    return json({ error: 'unavailable', message: 'Could not file the suggestion right now. Try again later.' }, 502);
  }
  // Filed for review, so the person gets a thank-you rather than a link.
  return json({ ok: true, kind: rw.kind });
}
