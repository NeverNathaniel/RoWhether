import { describe, it, expect, vi } from 'vitest';
import { cleanReport, listReports, addReport, REPORT_HOURS } from '../worker/reports.js';
import worker, { info } from '../worker/index.js';

// A tiny stand-in for the D1 binding: records SQL and bound values.
function fakeDB(rows = []) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return {
            all: async () => ({ results: rows }),
            run: async () => ({ meta: { last_row_id: 7 } })
          };
        }
      };
    }
  };
}
const post = (body, headers = {}) => new Request('https://row.example/api/reports', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body)
});
const NOW = Date.UTC(2026, 9, 14, 12);

describe('cleanReport', () => {
  it('keeps known choices and debris', () => {
    expect(cleanReport({ water: 'flat', fog: 'patchy', debris: true })).toEqual({ water: 'flat', fog: 'patchy', debris: true });
    expect(cleanReport({ water: 'chop' })).toEqual({ water: 'chop', fog: null, debris: false });
    expect(cleanReport({ debris: true })).toEqual({ water: null, fog: null, debris: true });
  });
  it('rejects unknown values, free text and empty reports', () => {
    expect(cleanReport({ water: 'tsunami' })).toBeNull();
    expect(cleanReport({ fog: '<script>' })).toBeNull();
    expect(cleanReport({})).toBeNull();
    expect(cleanReport({ debris: 'yes' })).toBeNull();
    expect(cleanReport(null)).toBeNull();
  });
});

describe('dock reports', () => {
  it('is off without a database', async () => {
    expect(await (await listReports({})).json()).toEqual({ enabled: false });
    expect((await addReport(post({ water: 'flat' }), {})).status).toBe(503);
  });
  it('lists the last few hours, newest first', async () => {
    const DB = fakeDB([{ id: 2, created_at: NOW - 600e3, water: 'flat', fog: 'clear', debris: 0 }]);
    const body = await (await listReports({ DB }, NOW)).json();
    expect(body).toEqual({ enabled: true, hours: REPORT_HOURS, reports: [{ id: 2, t: NOW - 600e3, water: 'flat', fog: 'clear', debris: false }] });
    expect(DB.calls[0].sql).toMatch(/ORDER BY created_at DESC/);
    expect(DB.calls[0].args[0]).toBe(NOW - REPORT_HOURS * 3600e3);
  });
  it('adds a report with the server time', async () => {
    const DB = fakeDB();
    const r = await addReport(post({ water: 'rough', debris: true, t: 0 }), { DB }, NOW);
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true, report: { id: 7, t: NOW, water: 'rough', fog: null, debris: true } });
    expect(DB.calls[0].args).toEqual([NOW, 'rough', null, 1]);
  });
  it('refuses bad input and rate limits', async () => {
    const DB = fakeDB();
    expect((await addReport(post('not json'), { DB })).status).toBe(400);
    expect((await addReport(post({ water: 'huge' }), { DB })).status).toBe(400);
    const REPORT_LIMIT = { limit: vi.fn(async () => ({ success: false })) };
    expect((await addReport(post({ water: 'flat' }), { DB, REPORT_LIMIT })).status).toBe(429);
    expect(REPORT_LIMIT.limit).toHaveBeenCalledWith({ key: '1.2.3.4' });
    expect(DB.calls).toHaveLength(0);
  });
});

describe('worker routes', () => {
  it('reports the instance and its features', async () => {
    expect(await info({}).json()).toEqual({ env: 'production', reports: false });
    expect(await info({ APP_ENV: 'dev', DB: fakeDB() }).json()).toEqual({ env: 'dev', reports: true });
  });
  it('routes /api/info and /api/reports', async () => {
    const env = { APP_ENV: 'dev', DB: fakeDB(), ASSETS: { fetch: vi.fn() } };
    expect((await worker.fetch(new Request('https://row.example/api/info'), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://row.example/api/reports'), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://row.example/api/reports', { method: 'PUT' }), env)).status).toBe(405);
    expect((await worker.fetch(new Request('https://row.example/api/nope'), env)).status).toBe(404);
  });
});
