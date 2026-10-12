// The coach application's way in, end to end on the shipping code (2026-10-12):
//
//   the route (src/app/api/apply/route.ts), compiled in memory with the real Turnstile check,
//   rate limiter and provider-application helpers; only the database, the bucket, the Auth
//   lookup, the mailer and Next's after() are fakes:
//     · a second submission while an application is open answers with the open one (no row, no
//       files, no email); a retry that reaches the unique index while the first is still
//       uploading gets the same answer and its files back
//     · the credential lands under `certifications`, the key approval reads
//     · the agreements are recorded by the server, with its own timestamp
//     · a signed-out application needs a Turnstile token; a signed-in account stands in for it,
//       up to a daily cap, and a limiter fault refuses it; a refusal reads, writes and mails nothing
//     · a failed upload or a failed insert leaves no row and no files behind
//     · the two emails are handed to after(), and both are sent when it runs
//     · files over 4 MB in total are refused before anything is stored
//
//   the app's sender (submitProviderApplication in mobile-app/src/services/shapeBackend.js),
//   lifted from the shipped source and run against a recorded fetch:
//     · one multipart request to the route with the files in it, a token when signed out and
//       the Bearer token when signed in
//     · a refusal surfaces in the route's words; a failed send says so and stores nothing
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const ts = { typescript: true };
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { ...ts, registry: new Map([['next/server', nextServer]]) });
const turnstile = await loadRealModule(join(ROOT, 'src/lib/turnstile.ts'), ts);
const rateLimit = await loadRealModule(join(ROOT, 'src/lib/rate-limit.ts'), ts);
const providerApplications = await loadRealModule(join(ROOT, 'src/lib/provider-applications.ts'), ts);
const nutrition = await import(pathToFileURL(join(ROOT, 'src/lib/compliance/nutrition.mjs')).href);
const ageDerive = await import(pathToFileURL(join(ROOT, 'src/lib/age-derive.mjs')).href);
const providerExperience = await import(pathToFileURL(join(ROOT, 'src/lib/provider-experience.mjs')).href);
const applicationFiles = await import(pathToFileURL(join(ROOT, 'src/lib/application-files.mjs')).href);
const uploadTicket = await loadRealModule(join(ROOT, 'src/lib/application-upload-ticket.ts'), { typescript: true });
const config = await import(pathToFileURL(join(ROOT, 'mobile-app/src/config/providerApplications.js')).href);

const MB = 1024 * 1024;
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

/** The service-role client: PostgREST-shaped reads over `rows`, inserts recorded, a bucket that can fail its Nth upload. */
function fakeAdmin({ rows = [], insertErrors = [], failUploadAt = -1, rateAllowed = true, rateError = false, beforeInsert = null, objects = {}, afterSelect = null } = {}) {
  const calls = [];
  const uploads = [];
  const removed = [];
  let inserts = 0;
  const client = {
    from(table) {
      const st = { table, op: 'select', payload: null, filters: [], order: null, limit: null, single: false };
      const run = () => {
        calls.push({ table, op: st.op, payload: st.payload });
        if (st.op === 'insert') {
          if (beforeInsert) beforeInsert(rows);
          const err = insertErrors[inserts++];
          if (err) return { data: null, error: err };
          rows.push({ status: 'pending', created_at: new Date().toISOString(), ...st.payload });
          return { data: { id: st.payload.id }, error: null };
        }
        let hit = rows.filter((r) => st.filters.every((f) => f(r)));
        if (afterSelect) afterSelect(calls.filter((c) => c.op === 'select').length, rows);
        if (st.order) hit = [...hit].sort((a, b) => (a[st.order] < b[st.order] ? 1 : -1));
        if (st.limit != null) hit = hit.slice(0, st.limit);
        return { data: st.single ? hit[0] ?? null : hit, error: null };
      };
      const q = {
        select() { return q; },
        insert(p) { st.op = 'insert'; st.payload = p; return q; },
        eq(c, v) { st.filters.push((r) => r[c] === v); return q; },
        in(c, vs) { st.filters.push((r) => vs.includes(r[c])); return q; },
        gte(c, v) { st.filters.push((r) => String(r[c]) >= String(v)); return q; },
        order(c) { st.order = c; return q; },
        limit(n) { st.limit = n; return q; },
        maybeSingle() { st.single = true; return q; },
        single() { st.single = true; return q; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return q;
    },
    rpc: async (name, args) => {
      calls.push({ rpc: name, args });
      if (name === 'check_rate_limit' && rateError) return { data: null, error: { message: 'limiter is down' } };
      return name === 'check_rate_limit' ? { data: [{ allowed: rateAllowed, remaining: 0, reset_seconds: 60 }], error: null } : { data: null, error: null };
    },
    storage: {
      from: () => ({
        upload: async (path, bytes, opts) => {
          if (uploads.length === failUploadAt) return { error: { message: 'storage is down' } };
          uploads.push({ path, size: bytes.length, ...opts });
          return { error: null };
        },
        remove: async (paths) => { removed.push(...paths); for (const p of paths) delete objects[p]; return { error: null }; },
        // Files already in the bucket (uploaded through signed links): { path: { size, mimetype } }.
        list: async (folder) => ({
          data: Object.entries(objects)
            .filter(([p]) => p.startsWith(`${folder}/`) && !p.slice(folder.length + 1).includes('/'))
            .map(([p, m]) => ({ name: p.slice(folder.length + 1), id: `obj-${p}`, metadata: { size: m.size, mimetype: m.mimetype } })),
          error: null,
        }),
      }),
    },
  };
  return { client, calls, uploads, removed, rows };
}

async function applyRoute(admin, { user = null } = {}) {
  const sent = [];
  const scheduled = [];
  const route = await loadRealModule(join(ROOT, 'src/app/api/apply/route.ts'), {
    ...ts,
    registry: new Map([
      ['next/server', { ...nextServer, after: (fn) => { scheduled.push(fn); } }],
      ['@/lib/supabase/admin', { createAdminClient: () => admin.client }],
      ['@/lib/email', { sendEmail: async (m) => { sent.push(m); return { ok: true }; } }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/turnstile', turnstile],
      ['@/lib/request-auth', { currentUser: async () => user }],
      ['@/lib/rate-limit', rateLimit],
      ['@/lib/provider-applications', providerApplications],
      ['@/lib/provider-experience.mjs', providerExperience],
      ['@/lib/application-files.mjs', applicationFiles],
      ['@/lib/application-upload-ticket', uploadTicket],
      ['@/lib/compliance/nutrition.mjs', nutrition],
      ['@/lib/age-derive.mjs', ageDerive],
    ]),
  });
  const post = async ({ fields = {}, details = {}, files = [], token = '', bearer = '' } = {}) => {
    const form = new FormData();
    const base = { providerType: 'trainer', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.invalid', dob: '1990-04-02', yearsExperience: '7-10 years' };
    for (const [k, v] of Object.entries({ ...base, ...fields })) form.append(k, v);
    form.append('details', JSON.stringify({ background_check_consent: true, ...details }));
    for (const f of files) form.append(f.kind, f.file);
    if (token) form.append('turnstileToken', token);
    const headers = bearer ? { authorization: `Bearer ${bearer}` } : {};
    const res = await route.POST(new nextServer.NextRequest('https://shape.test/api/apply', { method: 'POST', body: form, headers }));
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { post, sent, scheduled, runAfter: async () => { for (const fn of scheduled.splice(0)) await fn(); } };
}

const inserts = (admin) => admin.calls.filter((c) => c.table === 'provider_applications' && c.op === 'insert');
const reads = (admin) => admin.calls.filter((c) => c.table === 'provider_applications' && c.op === 'select');

/** Turnstile switched on, with Cloudflare answering yes to `good-token` only. */
async function withTurnstile(fn) {
  const saved = { secret: process.env.TURNSTILE_SECRET_KEY, fetch: globalThis.fetch };
  process.env.TURNSTILE_SECRET_KEY = 'test-secret';
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
    const token = new URLSearchParams(String(init.body)).get('response');
    return new Response(JSON.stringify({ success: token === 'good-token' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try { return await fn(); } finally {
    if (saved.secret === undefined) delete process.env.TURNSTILE_SECRET_KEY; else process.env.TURNSTILE_SECRET_KEY = saved.secret;
    globalThis.fetch = saved.fetch;
  }
}

// ── The route ─────────────────────────────────────────────────────────────────────────────

test('a second submission while an application is open answers with the open one: no row, no files, no email', async () => {
  const admin = fakeAdmin({ rows: [{ id: 'app-first', email: 'ada@example.invalid', provider_type: 'trainer', status: 'pending', created_at: hoursAgo(2) }] });
  const r = await applyRoute(admin);
  const again = await r.post({ fields: { email: 'ADA@Example.invalid' }, files: [{ kind: 'resume', file: new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }) }] });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.deepEqual(again.body, { ok: true, id: 'app-first', duplicate: true });
  assert.equal(inserts(admin).length, 0, 'no second row');
  assert.equal(admin.uploads.length, 0, 'no second set of files');
  assert.equal(r.scheduled.length, 0, 'no second pair of emails');
});

test('only an OPEN application for the SAME role and address counts as the same one, however old', async () => {
  const cases = [
    { name: 'already decided', row: { status: 'rejected', provider_type: 'trainer', created_at: hoursAgo(1) } },
    { name: 'withdrawn', row: { status: 'withdrawn', provider_type: 'trainer', created_at: hoursAgo(1) } },
    { name: 'the other role', row: { status: 'pending', provider_type: 'nutritionist', created_at: hoursAgo(1) } },
    { name: 'another address', row: { status: 'in_review', provider_type: 'trainer', created_at: hoursAgo(1), email: 'grace@example.invalid' } },
  ];
  for (const c of cases) {
    const admin = fakeAdmin({ rows: [{ id: 'app-old', email: 'ada@example.invalid', ...c.row }] });
    const r = await applyRoute(admin);
    const res = await r.post();
    assert.equal(res.status, 200, `${c.name}: ${JSON.stringify(res.body)}`);
    assert.notEqual(res.body.id, 'app-old', `${c.name} is not the same application`);
    assert.equal(res.body.duplicate, undefined, c.name);
    assert.equal(inserts(admin).length, 1, `${c.name}: a new row`);
  }
  const inReview = fakeAdmin({ rows: [{ id: 'app-review', email: 'ada@example.invalid', provider_type: 'trainer', status: 'in_review', created_at: hoursAgo(23) }] });
  assert.equal((await (await applyRoute(inReview)).post()).body.id, 'app-review', 'in review counts as open');
  // The unique index (one open application per address and role) has no window, so neither does the read.
  const old = fakeAdmin({ rows: [{ id: 'app-old', email: 'ada@example.invalid', provider_type: 'trainer', status: 'pending', created_at: hoursAgo(24 * 30) }] });
  assert.equal((await (await applyRoute(old)).post()).body.id, 'app-old', 'an open application from last month is still the open one');
  assert.equal(inserts(old).length, 0);
});

test('a retry that lands while the first is still uploading hits the index: it gets the open one, and its files are taken back', async () => {
  // The first request's row lands between this request's read and its insert, as on a slow upload.
  const admin = fakeAdmin({
    insertErrors: [{ code: '23505', message: 'duplicate key value violates unique constraint "provider_applications_one_open_idx"' }],
    beforeInsert: (rows) => rows.push({ id: 'app-first', email: 'ada@example.invalid', provider_type: 'trainer', status: 'pending', created_at: new Date().toISOString() }),
  });
  const r = await applyRoute(admin);
  const res = await r.post({ files: [{ kind: 'resume', file: new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }) }] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { ok: true, id: 'app-first', duplicate: true });
  assert.equal(admin.uploads.length, 1);
  assert.deepEqual(admin.removed, [admin.uploads[0].path], 'this request\'s files are removed');
  assert.equal(r.scheduled.length, 0, 'no second pair of emails');
  const sql = readFileSync(join(ROOT, 'supabase-migrations/2026-10-12-coach-application-review.sql'), 'utf8');
  assert.match(sql, /create unique index if not exists provider_applications_one_open_idx\n\s+on public\.provider_applications \(lower\(email\), provider_type\)\n\s+where status in \('pending', 'in_review'\);/);
  assert.match(readFileSync(join(ROOT, 'src/app/api/apply/route.ts'), 'utf8'), /const OPEN_STATUSES = \['pending', 'in_review'\];/, 'the read and the index name the same statuses');
});

test('the credential is stored under `certifications`, the key approval publishes from', async () => {
  const admin = fakeAdmin();
  const r = await applyRoute(admin);
  assert.equal((await r.post({ details: { certification: '  NASM-CPT  ' } })).status, 200);
  assert.equal(inserts(admin)[0].payload.details.certifications, 'NASM-CPT');
  assert.equal(inserts(admin)[0].payload.details.certification, 'NASM-CPT', 'the original key stays');
  const legacy = fakeAdmin();
  await (await applyRoute(legacy)).post({ details: { certifications: 'ACE', certification: 'NASM' } });
  assert.equal(inserts(legacy)[0].payload.details.certifications, 'ACE', 'a sent `certifications` is not overwritten');
});

test('the agreements are recorded by the server with its own time; the legacy pages\' Yes/No boxes count', async () => {
  const before = Date.now();
  const admin = fakeAdmin();
  const r = await applyRoute(admin);
  await r.post({ details: { agreements: { terms: true, code_of_conduct: true, credential_verification: false, background_check: true, recorded_at: '1999-01-01T00:00:00.000Z' } } });
  const a = inserts(admin)[0].payload.details.agreements;
  assert.deepEqual({ ...a, recorded_at: 'x' }, { terms: true, code_of_conduct: true, credential_verification: false, background_check: true, recorded_at: 'x' });
  assert.ok(Date.parse(a.recorded_at) >= before - 1000, `recorded_at is the server's clock, not the client's (${a.recorded_at})`);

  const legacy = fakeAdmin();
  await (await applyRoute(legacy)).post({ details: { agreeTos: 'Yes', agreeCoc: 'No', agreeVerify: 'Yes' } });
  const b = inserts(legacy)[0].payload.details.agreements;
  assert.equal(b.terms, true);
  assert.equal(b.code_of_conduct, false, "an unticked legacy box is the truthy string 'No' and must not count");
  assert.equal(b.credential_verification, true);
});

test('a document path the client sends is dropped; only the files the route stored are listed', async () => {
  const admin = fakeAdmin();
  const r = await applyRoute(admin);
  await r.post({
    details: { documents: [{ kind: 'resume', path: 'website/someone-else/resume/cv.pdf' }], certProof_path: 'website/x/y.pdf', resume_document: { path: 'p' } },
    files: [{ kind: 'credential', file: new File(['%PDF'], 'cert.pdf', { type: 'application/pdf' }) }],
  });
  const d = inserts(admin)[0].payload.details;
  assert.equal(d.certProof_path, undefined);
  assert.equal(d.resume_document, undefined);
  assert.deepEqual(d.documents.map((x) => x.path), admin.uploads.map((u) => u.path));
  assert.match(d.documents[0].path, new RegExp(`^website/${inserts(admin)[0].payload.id}/credential/`), 'stored under the id the row carries');
});

test('signed out, the application needs a Turnstile token once the secret is set; a refusal reads, writes and mails nothing', async () => {
  await withTurnstile(async () => {
    for (const token of ['', 'forged-token']) {
      const admin = fakeAdmin();
      const r = await applyRoute(admin);
      const res = await r.post({ token });
      assert.equal(res.status, 400, `token "${token}"`);
      assert.equal(res.body.code, 'captcha_failed');
      assert.match(res.body.error, /Captcha check failed/);
      assert.equal(reads(admin).length + inserts(admin).length + admin.uploads.length, 0, 'nothing was read or written');
      assert.equal(r.scheduled.length, 0);
    }
    const admin = fakeAdmin();
    const ok = await (await applyRoute(admin)).post({ token: 'good-token' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(inserts(admin).length, 1);
  });
});

test('the app signed in stands in for the token: a verified account, at most five a day; a bare Bearer header is not one', async () => {
  await withTurnstile(async () => {
    const member = { id: '55555555-5555-4555-8555-555555555555', email: 'ada@example.invalid' };
    const admin = fakeAdmin();
    const ok = await (await applyRoute(admin, { user: member })).post({ bearer: 'session-token' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const capCall = admin.calls.find((c) => c.rpc === 'check_rate_limit');
    assert.ok(capCall, 'the account path is counted');
    assert.equal(capCall.args.p_max, 5);
    assert.equal(capCall.args.p_window_seconds, 86400);

    const unverified = fakeAdmin();
    assert.equal((await (await applyRoute(unverified, { user: null })).post({ bearer: 'not-a-session' })).status, 400, 'a token Auth does not vouch for');
    assert.equal(inserts(unverified).length, 0);

    const capped = fakeAdmin({ rateAllowed: false });
    const over = await (await applyRoute(capped, { user: member })).post({ bearer: 'session-token' });
    assert.equal(over.status, 400, 'past the daily cap');
    assert.equal(inserts(capped).length, 0);

    const noHeader = fakeAdmin();
    assert.equal((await (await applyRoute(noHeader, { user: member })).post()).status, 400, 'an account is only ever read off a Bearer token here');

    // The cap stands in for the bot check, so a limiter fault refuses rather than admits.
    const limiterDown = fakeAdmin({ rateError: true });
    const down = await (await applyRoute(limiterDown, { user: member })).post({ bearer: 'session-token' });
    assert.equal(down.status, 400, 'a limiter fault is not a way past the check');
    assert.equal(inserts(limiterDown).length, 0);
  });
});

test('a failed upload leaves no row and removes the files already stored, so a retry starts clean', async () => {
  const admin = fakeAdmin({ failUploadAt: 1 });
  const r = await applyRoute(admin);
  const files = [
    { kind: 'resume', file: new File(['%PDF-a'], 'cv.pdf', { type: 'application/pdf' }) },
    { kind: 'credential', file: new File(['%PDF-b'], 'cert.pdf', { type: 'application/pdf' }) },
  ];
  const res = await r.post({ files });
  assert.equal(res.status, 500);
  assert.match(res.body.error, /Nothing was saved/);
  assert.equal(inserts(admin).length, 0, 'no row for an application missing its documents');
  assert.equal(admin.uploads.length, 1);
  assert.deepEqual(admin.removed, [admin.uploads[0].path], 'the stored file is removed');
  assert.equal(r.scheduled.length, 0, 'no email for an application that was not saved');

  // The same applicant tries again: no open row stands in the way.
  const retry = fakeAdmin({ rows: admin.rows });
  const again = await (await applyRoute(retry)).post({ files });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(again.body.duplicate, undefined);
  assert.equal(retry.uploads.length, 2);
});

test('a failed insert removes the files it stored', async () => {
  const admin = fakeAdmin({ insertErrors: [{ code: '23514', message: 'check violation' }] });
  const r = await applyRoute(admin);
  const res = await r.post({ files: [{ kind: 'resume', file: new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }) }] });
  assert.equal(res.status, 500);
  assert.deepEqual(admin.removed, admin.uploads.map((u) => u.path));
  assert.equal(admin.removed.length, 1);
});

test('the missing-dob-column retry keeps the documents and the date', async () => {
  const admin = fakeAdmin({ insertErrors: [{ code: '42703', message: 'column "dob" does not exist' }] });
  const r = await applyRoute(admin);
  const res = await r.post({ files: [{ kind: 'resume', file: new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }) }] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const [first, second] = inserts(admin);
  assert.equal(first.payload.dob, '1990-04-02');
  assert.equal('dob' in second.payload, false);
  assert.equal(second.payload.details.dob, '1990-04-02');
  assert.equal(second.payload.details.documents.length, 1);
  assert.equal(second.payload.id, first.payload.id, 'the same id the files were stored under');
  assert.equal(admin.removed.length, 0);
});

test('the two emails go to after(), not fire-and-forget, and both are sent when it runs', async () => {
  const admin = fakeAdmin();
  const r = await applyRoute(admin);
  const res = await r.post();
  assert.equal(res.status, 200);
  assert.equal(r.sent.length, 0, 'nothing is sent before the response');
  assert.equal(r.scheduled.length, 1);
  await r.runAfter();
  assert.deepEqual(r.sent.map((m) => m.to).sort(), [process.env.APPLICATIONS_EMAIL ?? 'christopher.perry@theshapecommunity.com', 'ada@example.invalid'].sort());
  assert.match(r.sent.find((m) => m.to === 'ada@example.invalid').subject, /We got your application, Ada/);
  const src = readFileSync(join(ROOT, 'src/app/api/apply/route.ts'), 'utf8');
  assert.doesNotMatch(src, /void sendApplicationEmails|void sendEmail/, 'no email is left running when the function returns');
});

test('the 4 MB request cap is the old multipart path\'s alone; both forms upload through signed links under the shared limits', () => {
  // Since 2026-10-12 the website and the app send their documents straight to storage
  // (/api/apply/uploads), so the platform's 4.5 MB request cap no longer bounds them. The route
  // keeps the 4 MB line for a request that still carries files itself: an installed app from
  // before then.
  const src = (p) => readFileSync(join(ROOT, p), 'utf8');
  assert.equal(/const MAX_TOTAL_FILE_BYTES = (.+);/.exec(src('src/app/api/apply/route.ts'))[1].trim(), '4 * 1024 * 1024');
  const web = src('public/newdesign/signup.jsx');
  assert.doesNotMatch(web, /APPLY_FILES_MAX_BYTES|4 MB in total/, 'the website form no longer carries the request cap');
  assert.match(web, /window\.ShapeApplicationFiles/);
  assert.match(web, /fetch\("\/api\/apply\/uploads"/);
  assert.match(web, /uploadToSignedUrl\(link\.path, link\.token/);
  assert.equal(config.PROVIDER_APPLICATION_MAX_TOTAL_BYTES, undefined, 'the app no longer carries it either');
  assert.equal(config.APPLICATION_MAX_TOTAL_BYTES, applicationFiles.APPLICATION_MAX_TOTAL_BYTES);
  assert.equal(config.applicationFilesProblem, applicationFiles.applicationFilesProblem, 'the app reads the shared rules');
});

test('experience: no answer is asked for; under the 5-year standard needs where and what kind, and is then taken and marked, never refused', async () => {
  const unanswered = fakeAdmin();
  const none = await (await applyRoute(unanswered)).post({ fields: { yearsExperience: '' } });
  assert.equal(none.status, 400);
  assert.equal(none.body.error, 'Choose your years of professional experience.');
  assert.equal(inserts(unanswered).length, 0);

  for (const years of ['Less than 1 year', '1-2 years', '3-4 years']) {
    const bare = fakeAdmin();
    const asked = await (await applyRoute(bare)).post({ fields: { yearsExperience: years }, details: { experience_history: 'Gym A, 1 year' } });
    assert.equal(asked.status, 400, years);
    assert.match(asked.body.error, /With under 5 years, tell us where you've worked and what type of experience you have/);
    assert.doesNotMatch(asked.body.error, /requires at least/);
    assert.equal(inserts(bare).length, 0);

    const admin = fakeAdmin();
    const r = await applyRoute(admin);
    // A client cannot mark itself as meeting the standard: the server's reading wins.
    const taken = await r.post({
      fields: { yearsExperience: years },
      details: { experience_history: 'Gym A, floor coach, 1 year', experience_type: 'Gym floor', meets_experience_preference: true, experience_standard_years: 1 },
    });
    assert.equal(taken.status, 200, `${years}: ${JSON.stringify(taken.body)}`);
    const row = inserts(admin)[0].payload;
    assert.equal(row.years_experience, years);
    assert.equal(row.details.meets_experience_preference, false);
    assert.equal(row.details.experience_standard_years, 5);
    assert.equal(row.details.experience_history, 'Gym A, floor coach, 1 year');
    await r.runAfter();
    const notice = r.sent.find((m) => m.to !== 'ada@example.invalid');
    assert.match(notice.text, /Experience review: Below the 5-year standard: review individually/);
  }

  const admin = fakeAdmin();
  const r = await applyRoute(admin);
  const standard = await r.post({ fields: { yearsExperience: '5-7 years' } });
  assert.equal(standard.status, 200);
  assert.equal(inserts(admin)[0].payload.details.meets_experience_preference, true);
  await r.runAfter();
  assert.doesNotMatch(r.sent.find((m) => m.to !== 'ada@example.invalid').text, /Experience review/);
});

// ── The ticket path (2026-10-12): documents uploaded through /api/apply/uploads ──────────────

process.env.APPLICATION_UPLOAD_SECRET = process.env.APPLICATION_UPLOAD_SECRET || 'test-upload-secret';
const DRAFT = '0b7c1d4e-1111-4222-8333-444455556666';
const ticketFor = (role = 'trainer', draftId = DRAFT, now = Date.now()) => uploadTicket.issueUploadTicket(draftId, role, now).ticket;
const draftObjects = () => ({
  [`website/${DRAFT}/resume/1-cv.pdf`]: { size: 1200, mimetype: 'application/pdf' },
  [`website/${DRAFT}/credential/2-nasm.pdf`]: { size: 3 * MB, mimetype: 'application/pdf' },
  [`website/${DRAFT}/credential/3-cpr.jpg`]: { size: 9 * MB, mimetype: 'image/jpeg' },
  [`website/${DRAFT}/designation/4-degree.pdf`]: { size: 8 * MB, mimetype: 'application/pdf' },
});
const claimed = () => JSON.stringify([
  { path: `website/${DRAFT}/resume/1-cv.pdf`, name: 'CV (2026).pdf' },
  { path: `website/${DRAFT}/credential/2-nasm.pdf`, name: 'nasm.pdf' },
  { path: `website/${DRAFT}/credential/3-cpr.jpg`, name: 'cpr.jpg' },
  { path: `website/${DRAFT}/designation/4-degree.pdf`, name: 'degree.pdf' },
]);

test('ticket: the row takes the draft id, the documents are read from storage (21 MB of them, past the old 4 MB cap), and the ticket stands in for the human check', async () => {
  await withTurnstile(async () => {
    const admin = fakeAdmin({ objects: draftObjects() });
    const r = await applyRoute(admin);
    const res = await r.post({ fields: { uploadTicket: ticketFor(), uploads: claimed() } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.id, DRAFT);
    const row = inserts(admin)[0].payload;
    assert.equal(row.id, DRAFT);
    assert.deepEqual(row.details.documents.map((d) => [d.kind, d.path, d.name, d.type, d.size]), [
      ['resume', `website/${DRAFT}/resume/1-cv.pdf`, 'CV (2026).pdf', 'application/pdf', 1200],
      ['credential', `website/${DRAFT}/credential/2-nasm.pdf`, 'nasm.pdf', 'application/pdf', 3 * MB],
      ['credential', `website/${DRAFT}/credential/3-cpr.jpg`, 'cpr.jpg', 'image/jpeg', 9 * MB],
      ['designation', `website/${DRAFT}/designation/4-degree.pdf`, 'degree.pdf', 'application/pdf', 8 * MB],
    ]);
    assert.equal(admin.uploads.length, 0, 'the route stores nothing itself');
    assert.equal(admin.removed.length, 0);
  });
});

test('ticket: a forged, expired, other-role or file-carrying ticket is refused before anything is read', async () => {
  const cases = [
    ['forged', `${DRAFT}.trainer.9999999999.${'0'.repeat(64)}`, {}],
    ['expired', ticketFor('trainer', DRAFT, Date.now() - 3 * 60 * 60 * 1000), {}],
    ['another role', ticketFor('nutritionist'), {}],
    ['beside files', ticketFor(), { files: [{ kind: 'resume', file: new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }) }] }],
  ];
  for (const [name, ticket, extra] of cases) {
    const admin = fakeAdmin({ objects: draftObjects() });
    const res = await (await applyRoute(admin)).post({ fields: { uploadTicket: ticket, uploads: claimed() }, ...extra });
    assert.equal(res.status, 400, name);
    assert.equal(res.body.code, 'upload_expired', name);
    assert.equal(inserts(admin).length + admin.removed.length + admin.uploads.length, 0, name);
  }
});

test('ticket: a file that did not finish uploading, or one storage holds past the rules, is said and the draft is taken back', async () => {
  const missing = fakeAdmin({ objects: (({ [`website/${DRAFT}/designation/4-degree.pdf`]: _, ...rest }) => rest)(draftObjects()) });
  const a = await (await applyRoute(missing)).post({ fields: { uploadTicket: ticketFor(), uploads: claimed() } });
  assert.equal(a.status, 400);
  assert.equal(a.body.code, 'upload_incomplete');
  assert.match(a.body.error, /did not finish uploading/);
  assert.equal(inserts(missing).length, 0);
  assert.equal(missing.removed.length, 3, 'the files that did arrive are removed, so a retry starts clean');
  const huge = fakeAdmin({ objects: { ...draftObjects(), [`website/${DRAFT}/insurance/5-policy.pdf`]: { size: 12 * MB, mimetype: 'application/pdf' } } });
  const b = await (await applyRoute(huge)).post({ fields: { uploadTicket: ticketFor(), uploads: claimed() } });
  assert.equal(b.status, 400);
  assert.match(b.body.error, /^policy\.pdf is 12\.0 MB; each file can be up to 10 MB\./);
  assert.equal(inserts(huge).length, 0);
  const none = fakeAdmin();
  const c = await (await applyRoute(none)).post({ fields: { uploadTicket: ticketFor(), uploads: '[]' } });
  assert.equal(c.status, 400, 'a ticket with nothing under it is not an application with documents');
});

test('ticket: a resend after success gets its own application back and its files are never removed; an open application elsewhere takes the draft back', async () => {
  const admin = fakeAdmin({ objects: draftObjects() });
  const r = await applyRoute(admin);
  const first = await r.post({ fields: { uploadTicket: ticketFor(), uploads: claimed() } });
  assert.equal(first.status, 200);
  const again = await r.post({ fields: { uploadTicket: ticketFor(), uploads: claimed() } });
  assert.deepEqual(again.body, { ok: true, id: DRAFT, duplicate: true });
  assert.equal(inserts(admin).length, 1, 'no second row');
  assert.equal(admin.removed.length, 0, 'the saved application keeps every document');

  // Two sends of one ticket at once: the other saved the row first, so the index refuses this one.
  const race = fakeAdmin({ objects: draftObjects(), insertErrors: [{ code: '23505', message: 'duplicate key' }], beforeInsert: (rows) => rows.push({ id: DRAFT, email: 'ada@example.invalid', provider_type: 'trainer', status: 'pending', created_at: new Date().toISOString() }) });
  const raced = await (await applyRoute(race)).post({ fields: { uploadTicket: ticketFor(), uploads: claimed() } });
  assert.deepEqual(raced.body, { ok: true, id: DRAFT, duplicate: true });
  assert.equal(race.removed.length, 0, 'the files are the saved row\'s');

  // ⚠ The other send's row lands between this one's own-row check and its open-application read:
  // the open application it then finds IS this ticket's, and its files are not orphans.
  const overlap = fakeAdmin({
    objects: draftObjects(),
    afterSelect: (n, rows) => { if (n === 1) rows.push({ id: DRAFT, email: 'ada@example.invalid', provider_type: 'trainer', status: 'pending', created_at: new Date().toISOString() }); },
  });
  const overlapped = await (await applyRoute(overlap)).post({ fields: { uploadTicket: ticketFor(), uploads: claimed() } });
  assert.deepEqual(overlapped.body, { ok: true, id: DRAFT, duplicate: true });
  assert.equal(overlap.removed.length, 0, 'the saved application keeps its documents');

  const open = fakeAdmin({ objects: draftObjects(), rows: [{ id: 'app-first', email: 'ada@example.invalid', provider_type: 'trainer', status: 'pending', created_at: hoursAgo(1) }] });
  const dup = await (await applyRoute(open)).post({ fields: { uploadTicket: ticketFor(), uploads: claimed() } });
  assert.deepEqual(dup.body, { ok: true, id: 'app-first', duplicate: true });
  assert.equal(open.removed.length, 4, 'this request\'s uploads belong to no application now');

  const failing = fakeAdmin({ objects: draftObjects(), insertErrors: [{ code: '23514', message: 'check violation' }] });
  const failed = await (await applyRoute(failing)).post({ fields: { uploadTicket: ticketFor(), uploads: claimed() } });
  assert.equal(failed.status, 500);
  assert.equal(failing.removed.length, 4, 'a failed insert takes the draft back');
});

test('the old multipart path: files over 4 MB in total are refused before anything is stored', async () => {
  const admin = fakeAdmin();
  const r = await applyRoute(admin);
  const big = (name) => new File([new Uint8Array(Math.round(2.2 * MB))], name, { type: 'application/pdf' });
  const res = await r.post({ files: [{ kind: 'resume', file: big('cv.pdf') }, { kind: 'credential', file: big('cert.pdf') }] });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Your files add up to 4.4 MB; the limit for one application is 4 MB in total. Attach a smaller scan or fewer files.');
  assert.equal(inserts(admin).length + admin.uploads.length, 0);
  const atLimit = fakeAdmin();
  const fits = await (await applyRoute(atLimit)).post({ files: [{ kind: 'resume', file: new File([new Uint8Array(4 * MB)], 'cv.pdf', { type: 'application/pdf' }) }] });
  assert.equal(fits.status, 200, '4 MB exactly is within the limit');
});

// ── The app's sender ──────────────────────────────────────────────────────────────────────

const BACKEND = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
function lift(name) {
  const i = BACKEND.search(new RegExp(`\\n(async )?function ${name}\\(`));
  assert.ok(i > 0, `could not find ${name}`);
  const j = BACKEND.indexOf('\n}\n', i);
  return BACKEND.slice(i, j + 3);
}

/** The app's sender, lifted from shapeBackend.js. `respond(n, url, init)` answers each fetch; the
 * bucket records each signed upload, and `failUpload` makes one fail. */
function appSender({ respond, signedIn = false, solve = async () => 'app-token', apiBaseUrl = 'https://shape.test', failUpload = -1 }) {
  const requests = [];
  const stored = [];
  const fetch = async (url, init) => {
    requests.push({ url, init, form: init.body, json: typeof init.body === 'string' ? JSON.parse(init.body) : null });
    return respond(requests.length, url, init);
  };
  const supabase = {
    storage: {
      from: (bucket) => ({
        uploadToSignedUrl: async (path, token, file, opts) => {
          if (stored.length === failUpload) return { data: null, error: { message: 'upload failed' } };
          stored.push({ bucket, path, token, name: file.name, size: file.size, type: file.type, contentType: opts?.contentType });
          return { data: { path }, error: null };
        },
      }),
    },
  };
  const state = { user: signedIn ? { id: 'u-1', email: 'ada@example.invalid' } : null, session: signedIn ? { access_token: 'session-token' } : null };
  const window = { ShapeTurnstile: { solve: async () => { requests.solved = (requests.solved || 0) + 1; return solve(); } } };
  const src = ['applicationToPayload', 'providerApplicationApiBody', 'applicationSendFailed', 'applicationRefusal', 'uploadProviderApplicationDocuments', 'submitProviderApplicationToApi', 'submitProviderApplication'].map(lift).join('\n');
  const submit = new Function(
    'fetch', 'apiBaseUrl', 'state', 'window', 'navigator', 'normalizeRole', 'FormData', 'supabase',
    'DEFAULT_BACKGROUND_CHECK_PROVIDER', 'PROVIDER_APPLICATION_SEND_FAILED', 'applicationFilesProblem',
    `${src}\nreturn submitProviderApplication;`,
  )(
    fetch, apiBaseUrl, state, window, { userAgent: 'test' }, (r) => r, FormData, supabase,
    config.DEFAULT_BACKGROUND_CHECK_PROVIDER, config.PROVIDER_APPLICATION_SEND_FAILED, config.applicationFilesProblem,
  );
  return { submit, requests, stored };
}

/** /api/apply/uploads's answer for these files: a link and token per file, and a ticket. */
function linksFor(files, { draftId = '0b7c1d4e-1111-4222-8333-444455556666' } = {}) {
  return {
    draftId,
    ticket: `${draftId}.trainer.9999999999.${'a'.repeat(64)}`,
    bucket: 'provider-credentials',
    uploads: files.map((f, i) => ({ kind: f.kind, name: f.name, type: f.type, size: f.size, path: `website/${draftId}/${f.kind}/${i + 1}-${f.name}`, token: `tok-${i}` })),
  };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const VALUES = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.invalid', dob: '1990-04-02', years: '7-10 years', cert: 'NASM', bgcheck: true, tos: true, conduct: true, verify: true };

test('with documents the app asks for upload links (with the token), uploads each file to its link, then sends the application with the ticket', async () => {
  const cv = new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' });
  const cert = new File(['%PDF'], 'nasm.pdf', { type: 'application/pdf' });
  // Untyped, as a phone leaves a type it does not know: it goes up typed by its extension.
  const card = new File(['x'], 'cpr.jpg', { type: '' });
  const files = [{ kind: 'resume', file: cv }, { kind: 'credential', file: cert }, { kind: 'credential', file: card }];
  const meta = files.map(({ kind, file }) => ({ kind, name: file.name, type: file.type, size: file.size }));
  // The links route answers with the type the rules settled on.
  const links = linksFor(meta.map((m) => ({ ...m, type: config.applicationFilesProblem ? applicationFiles.applicationFileType(m.name, m.type) : m.type })));
  const { submit, requests, stored } = appSender({
    respond: (n, url) => (String(url).endsWith('/api/apply/uploads') ? json(200, links) : json(200, { ok: true, id: '0b7c1d4e-1111-4222-8333-444455556666' })),
  });
  const out = await submit({ role: 'trainer', values: VALUES, files });
  assert.deepEqual({ stored: out.stored, duplicate: out.duplicate }, { stored: 'api', duplicate: false });
  assert.deepEqual(requests.map((r) => r.url), ['https://shape.test/api/apply/uploads', 'https://shape.test/api/apply']);
  assert.deepEqual(requests[0].json, { providerType: 'trainer', files: meta, turnstileToken: 'app-token' });
  assert.equal(requests.solved, 1, 'one human check for the whole application');
  // ⚠ The storage client sends a File under its own type, so the untyped photo goes up as a typed
  // copy, or the bucket refuses it (Codex on #2319).
  assert.deepEqual(stored.map((u) => u.type), ['application/pdf', 'application/pdf', 'image/jpeg']);
  assert.deepEqual(stored.map((u) => [u.bucket, u.path, u.token, u.name, u.contentType]), [
    ['provider-credentials', 'website/0b7c1d4e-1111-4222-8333-444455556666/resume/1-cv.pdf', 'tok-0', 'cv.pdf', 'application/pdf'],
    ['provider-credentials', 'website/0b7c1d4e-1111-4222-8333-444455556666/credential/2-nasm.pdf', 'tok-1', 'nasm.pdf', 'application/pdf'],
    ['provider-credentials', 'website/0b7c1d4e-1111-4222-8333-444455556666/credential/3-cpr.jpg', 'tok-2', 'cpr.jpg', 'image/jpeg'],
  ]);
  const form = requests[1].form;
  assert.ok(form instanceof FormData);
  assert.equal(form.get('uploadTicket'), links.ticket);
  assert.deepEqual(JSON.parse(form.get('uploads')), links.uploads.map((u) => ({ path: u.path, name: u.name })));
  assert.equal(form.get('turnstileToken'), null, 'the token was spent on the links; the ticket stands in for it');
  for (const kind of ['resume', 'credential']) assert.equal(form.get(kind), null, 'no file rides the application request');
  assert.equal(form.get('providerType'), 'trainer');
  assert.equal(form.get('dob'), '1990-04-02');
  const details = JSON.parse(form.get('details'));
  assert.equal(details.certification, 'NASM');
  assert.equal('documents' in details, false, 'the route records the documents, the app does not claim any');
});

test('without documents the app sends one request with the token, as before', async () => {
  const { submit, requests } = appSender({ respond: () => json(200, { ok: true, id: 'app-1' }) });
  await submit({ role: 'trainer', values: VALUES });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://shape.test/api/apply');
  assert.equal(requests[0].form.get('turnstileToken'), 'app-token');
  assert.equal(requests[0].form.get('uploadTicket'), null);
  assert.equal(requests[0].init.headers.Authorization, undefined);
});

test('a refused link request, or a file that does not upload, stops the application: nothing is sent to the route', async () => {
  const cv = new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' });
  const files = [{ kind: 'resume', file: cv }];
  const meta = [{ kind: 'resume', name: 'cv.pdf', type: 'application/pdf', size: cv.size }];
  const refused = appSender({ respond: () => json(400, { error: 'Captcha check failed — please retry.', code: 'captcha_failed' }) });
  await assert.rejects(refused.submit({ role: 'trainer', values: VALUES, files }), (e) => e.rejected === true && e.message === 'Captcha check failed — please retry.');
  assert.deepEqual(refused.requests.map((r) => r.url), ['https://shape.test/api/apply/uploads']);
  const broken = appSender({ failUpload: 0, respond: (n, url) => (String(url).endsWith('/uploads') ? json(200, linksFor(meta)) : json(200, { ok: true, id: 'x' })) });
  await assert.rejects(broken.submit({ role: 'trainer', values: VALUES, files }), (e) => e.retryable === true && e.message === config.PROVIDER_APPLICATION_SEND_FAILED);
  assert.deepEqual(broken.requests.map((r) => r.url), ['https://shape.test/api/apply/uploads'], 'the application waits for its files');
  const short = appSender({ respond: (n, url) => (String(url).endsWith('/uploads') ? json(200, { ...linksFor(meta), uploads: [] }) : json(200, { ok: true, id: 'x' })) });
  await assert.rejects(short.submit({ role: 'trainer', values: VALUES, files }), (e) => e.retryable === true);
  assert.equal(short.requests.length, 1, 'links that do not match the files are a failed send');
});

test('signed in, the app sends its Bearer token and does not run the human check', async () => {
  const { submit, requests } = appSender({ signedIn: true, respond: () => json(200, { ok: true, id: 'app-2', duplicate: true }) });
  const out = await submit({ role: 'trainer', values: VALUES });
  assert.equal(out.duplicate, true);
  assert.equal(requests[0].init.headers.Authorization, 'Bearer session-token');
  assert.equal(requests.solved, undefined);
  assert.equal(requests[0].form.get('turnstileToken'), null);
});

test('a refusal surfaces in the route\'s words; a failed send says so; nothing is stored around the route', async () => {
  const cases = [
    { name: 'a 4xx refusal', respond: () => json(400, { error: 'You must be 18 or older to apply as a provider.' }), message: 'You must be 18 or older to apply as a provider.', rejected: true },
    { name: 'the network', respond: () => { throw new TypeError('Failed to fetch'); }, message: config.PROVIDER_APPLICATION_SEND_FAILED, retryable: true },
    { name: 'a 5xx', respond: () => json(500, { error: 'Could not submit your application.' }), message: config.PROVIDER_APPLICATION_SEND_FAILED, retryable: true },
    { name: 'a page that is not the route', respond: () => new Response('<html>Bad gateway</html>', { status: 502 }), message: config.PROVIDER_APPLICATION_SEND_FAILED, retryable: true },
    { name: 'a 200 that is not JSON', respond: () => new Response('<html>ok</html>', { status: 200 }), message: config.PROVIDER_APPLICATION_SEND_FAILED, retryable: true },
    { name: 'no human check in the app', solve: async () => '', respond: () => json(400, { error: 'Captcha check failed — please retry.', code: 'captcha_failed' }), message: /couldn't run the human check in the app. Sign in to your Shape account/, rejected: true },
    { name: 'a failed human check', respond: () => json(400, { error: 'Captcha check failed — please retry.', code: 'captcha_failed' }), message: 'Captcha check failed — please retry.', rejected: true },
  ];
  for (const c of cases) {
    const { submit, requests } = appSender({ respond: c.respond, solve: c.solve });
    let err = null;
    try { await submit({ role: 'trainer', values: VALUES }); } catch (e) { err = e; }
    assert.ok(err, `${c.name}: throws`);
    if (c.message instanceof RegExp) assert.match(err.message, c.message, c.name); else assert.equal(err.message, c.message, c.name);
    assert.equal(err.rejected === true, !!c.rejected, `${c.name}: rejected`);
    assert.equal(err.retryable === true, !!c.retryable, `${c.name}: retryable`);
    assert.equal(requests.length, 1, `${c.name}: one request, no fallback write`);
  }
  assert.doesNotMatch(lift('submitProviderApplication'), /supabase|saveLocalRecord|localStorage/, 'no second path for an application');
});

test('files the shared rules refuse are said before any request', async () => {
  const { submit, requests } = appSender({ respond: () => json(200, { ok: true, id: 'x' }) });
  const big = new File([new Uint8Array(11 * MB)], 'scan.pdf', { type: 'application/pdf' });
  await assert.rejects(submit({ role: 'trainer', values: VALUES, files: [{ kind: 'credential', file: big }] }), { message: 'scan.pdf is 11.0 MB; each file can be up to 10 MB.' });
  const exe = new File(['MZ'], 'tool.exe', { type: '' });
  await assert.rejects(submit({ role: 'trainer', values: VALUES, files: [{ kind: 'resume', file: exe }] }), { message: 'tool.exe must be a PDF, DOC, DOCX, PNG, JPEG or WebP file.' });
  const three = [1, 2, 3].map((i) => ({ kind: 'resume', file: new File(['%PDF'], `cv${i}.pdf`, { type: 'application/pdf' }) }));
  await assert.rejects(submit({ role: 'trainer', values: VALUES, files: three }), { message: 'Attach at most 2 files under Resume / CV.' });
  assert.equal(requests.length, 0);
});

test('the app sends the nutritionist fields the website collects, under the website\'s keys', async () => {
  const { submit, requests } = appSender({ respond: () => json(200, { ok: true, id: 'n-1' }) });
  await submit({
    role: 'nutritionist',
    values: {
      ...VALUES, nutrition_role: 'dietitian', rdCredential: 'rdn', cdrId: '1234567',
      licenses: [{ state: 'ny', number: 'NY-1', expires: '2027-01-01' }, { state: '', number: 'orphan', expires: '' }],
      insCarrier: 'HPSO', insPolicy: 'P-9', insExpires: '2027-06-30',
      attest: { independent_contractor: true, maintains_licensure: true, maintains_insurance: true, scope_understood: true },
    },
  });
  const d = JSON.parse(requests[0].form.get('details'));
  assert.equal(d.nutrition_role, 'dietitian');
  assert.equal(d.credential, 'rdn');
  assert.equal(d.cdr_id, '1234567');
  assert.deepEqual(d.state_licenses, [{ state: 'NY', number: 'NY-1', expires: '2027-01-01' }], 'a row with no state is not a license');
  assert.deepEqual([d.insurance_carrier, d.insurance_policy, d.insurance_expires], ['HPSO', 'P-9', '2027-06-30']);
  const trainer = appSender({ respond: () => json(200, { ok: true, id: 't-1' }) });
  await trainer.submit({ role: 'trainer', values: { ...VALUES, cdrId: 'x', insCarrier: 'y' } });
  const t = JSON.parse(trainer.requests[0].form.get('details'));
  assert.equal('cdr_id' in t || 'insurance_carrier' in t || 'credential' in t, false, 'a trainer sends none of them');
});
