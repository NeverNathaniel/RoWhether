import { describe, it, expect, vi } from 'vitest';
import { handleSuggest, suggestConfig, buildIssue, cleanContext, noMentions } from '../worker/suggest.js';
import { parseRewrite } from '../worker/claude.js';
import worker from '../worker/index.js';

const ENV = {
  ANTHROPIC_API_KEY: 'k', GITHUB_TOKEN: 't', GITHUB_REPO: 'owner/repo',
  TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret'
};
const FEATURE = { kind: 'feature', title: 'Add a tide chart', summary: 'They want a tide chart.', details: ['Show it under the forecast'], reject_reason: '' };
const BUG = { kind: 'bug', title: 'Fog time wrong', summary: 'Fog said 9 AM but cleared at 7.', details: [], reject_reason: '' };

const post = (body, headers = {}) => new Request('https://row.example/api/suggest', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body)
});
const deps = (over = {}) => ({
  verifyTurnstile: vi.fn(async () => true),
  rewriteSuggestion: vi.fn(async () => FEATURE),
  createIssue: vi.fn(async () => ({ number: 1, url: 'u' })),
  ...over
});
const good = { text: 'Please add a tide chart to the forecast.', token: 'tok', context: {} };

describe('suggest config', () => {
  it('is off until every secret is set', async () => {
    expect(await suggestConfig({}).json()).toEqual({ enabled: false });
    expect(await suggestConfig(ENV).json()).toEqual({ enabled: true, siteKey: 'site' });
  });
  it('refuses posts when not configured', async () => {
    const r = await handleSuggest(post(good), {}, deps());
    expect(r.status).toBe(503);
  });
});

describe('handleSuggest', () => {
  it('files a feature for review and returns no link', async () => {
    const d = deps();
    const r = await handleSuggest(post(good), ENV, d);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, kind: 'feature' });
    const issue = d.createIssue.mock.calls[0][1];
    expect(issue.labels).toEqual(['enhancement', 'from app', 'needs review']);
    expect(issue.title).toBe('Add a tide chart');
    expect(issue.body).toContain('> Please add a tide chart to the forecast.');
    expect(d.verifyTurnstile).toHaveBeenCalledWith(ENV, 'tok', '1.2.3.4');
  });
  it('rate limits before doing anything else', async () => {
    const d = deps();
    const env = { ...ENV, SUGGEST_LIMIT: { limit: vi.fn(async () => ({ success: false })) } };
    const r = await handleSuggest(post(good), env, d);
    expect(r.status).toBe(429);
    expect(env.SUGGEST_LIMIT.limit).toHaveBeenCalledWith({ key: '1.2.3.4' });
    expect(d.verifyTurnstile).not.toHaveBeenCalled();
  });
  it('rejects bad input without calling Turnstile or Claude', async () => {
    const d = deps();
    expect((await handleSuggest(post('not json'), ENV, d)).status).toBe(400);
    expect((await handleSuggest(post({ ...good, text: 'short' }), ENV, d)).status).toBe(400);
    expect((await handleSuggest(post({ ...good, text: 'x'.repeat(2001) }), ENV, d)).status).toBe(400);
    expect(d.verifyTurnstile).not.toHaveBeenCalled();
    expect(d.rewriteSuggestion).not.toHaveBeenCalled();
  });
  it('stops at a failed or missing Turnstile check, before Claude', async () => {
    const d = deps({ verifyTurnstile: vi.fn(async () => false) });
    expect((await handleSuggest(post(good), ENV, d)).status).toBe(403);
    expect((await handleSuggest(post({ ...good, token: '' }), ENV, deps())).status).toBe(403);
    expect(d.rewriteSuggestion).not.toHaveBeenCalled();
  });
  it('passes on Claude rejecting spam, without filing', async () => {
    const d = deps({ rewriteSuggestion: vi.fn(async () => ({ kind: 'reject', title: '', summary: '', details: [], reject_reason: 'Not about the app.' })) });
    const r = await handleSuggest(post(good), ENV, d);
    expect(r.status).toBe(422);
    expect((await r.json()).message).toBe('Not about the app.');
    expect(d.createIssue).not.toHaveBeenCalled();
  });
  it('reports Claude and GitHub failures as unavailable', async () => {
    const boom = vi.fn(async () => { throw new Error('x'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await handleSuggest(post(good), ENV, deps({ rewriteSuggestion: boom }))).status).toBe(502);
    expect((await handleSuggest(post(good), ENV, deps({ createIssue: boom }))).status).toBe(502);
    spy.mockRestore();
  });
  it('attaches app context to bugs only', async () => {
    const ctx = { version: '0.1.0', screen: '390x844', browser: 'Safari', installed: true, settings: { windCaution: 10, rainOff: '', evil: 'x' } };
    const d = deps({ rewriteSuggestion: vi.fn(async () => BUG) });
    await handleSuggest(post({ ...good, context: ctx }), ENV, d);
    const bug = d.createIssue.mock.calls[0][1];
    expect(bug.labels[0]).toBe('bug');
    expect(bug.body).toContain('## App context');
    expect(bug.body).toContain('windCaution: 10, rainOff: blank');
    expect(bug.body).not.toContain('evil');
    const f = deps();
    await handleSuggest(post({ ...good, context: ctx }), ENV, f);
    expect(f.createIssue.mock.calls[0][1].body).not.toContain('App context');
  });
});

describe('issue building', () => {
  it('stops @mentions from pinging people', () => {
    expect(noMentions('cc @octocat and me@x.com')).toBe('cc @​octocat and me@​x.com');
    const issue = buildIssue({ ...FEATURE, title: 'Ask @octocat' }, 'hey @someone', null);
    expect(issue.title).not.toMatch(/@o/);
    expect(issue.body).not.toMatch(/@s/);
  });
  it('quotes every line of the original', () => {
    const issue = buildIssue(FEATURE, 'line one\nline two', null);
    expect(issue.body).toContain('> line one\n> line two');
  });
  it('drops unknown or oversized context fields', () => {
    expect(cleanContext('nope')).toBeNull();
    const c = cleanContext({ version: 'v'.repeat(100), settings: { heading: 15, waterOverride: 'x'.repeat(50), x: 1 } });
    expect(c.version.length).toBe(40);
    expect(c.settings).toEqual({ heading: 15 });
  });
});

describe('parseRewrite', () => {
  const msg = (obj, stop = 'end_turn') => ({ stop_reason: stop, content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(obj) }] });
  it('reads the structured output', () => {
    expect(parseRewrite(msg(FEATURE))).toEqual(FEATURE);
  });
  it('treats a refusal as a rejection', () => {
    expect(parseRewrite({ stop_reason: 'refusal', content: [] }).kind).toBe('reject');
  });
  it('throws on truncated or malformed output', () => {
    expect(() => parseRewrite(msg(FEATURE, 'max_tokens'))).toThrow();
    expect(() => parseRewrite(msg({ ...FEATURE, kind: 'other' }))).toThrow();
  });
});

describe('worker routing', () => {
  const env = { ...ENV, ASSETS: { fetch: vi.fn(async () => new Response('asset')) } };
  it('serves assets for everything outside /api', async () => {
    const r = await worker.fetch(new Request('https://row.example/'), env);
    expect(await r.text()).toBe('asset');
  });
  it('answers the config call and 404s other API paths', async () => {
    expect((await (await worker.fetch(new Request('https://row.example/api/suggest'), env)).json()).enabled).toBe(true);
    expect((await worker.fetch(new Request('https://row.example/api/nope'), env)).status).toBe(404);
    expect((await worker.fetch(new Request('https://row.example/api/suggest', { method: 'PUT' }), env)).status).toBe(405);
  });
});
