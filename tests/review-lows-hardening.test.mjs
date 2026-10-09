// The Lows of the 2026-10-08 security review's app code, L1 to L15. Each section names the
// finding and drives the SHIPPING code (loadRealModule compiles the real files; stubs stand only
// where a network, a database or Stripe would), or pins the one line a finding came down to.
// The database-side Lows (policies) are the owner's decisions and are not here.
//
//   L1   account deletion took effect on one unconfirmed POST. Two requests now: the first earns a
//        ten-minute token bound to the account (428), only a request carrying it deletes.
//   L2   /api/auth/session POST set the browser's session cookies from tokens in the body with
//        no origin check (login CSRF). A cross-site Origin is refused.
//   L3   the coach credentials route handed the admin's working notes to the coach under review.
//   L4   an application file with an EMPTY declared type passed the type check; no cap on count.
//        Checked before the row is written: the type, read off the extension when empty; six files.
//   L5   a radio room's host role came from the request body.
//   L6   push tokens: no cap per account, and a token moving to another account left no trace.
//   L7   the push webhook compared its shared secret with `!==`.
//   L8   the Apple Music developer token (twelve hours of MusicKit on Shape's key) was minted for
//        any visitor.
//   L9   meal-note attachments were stored under whatever type the client declared, behind a
//        signed link good for a year.
//   L10  Stripe return paths were concatenated onto the origin as sent: `//evil.example` left the
//        site.
//   L11  the Connect account webhook picked the coach row by metadata alone.
//   L12  a refund request's purchase or subscription was looked up by id alone, not the filer's.
//   L13  a one-time purchase was recorded on checkout.session.completed whatever its
//        payment_status.
//   L14  APPLICATIONS_EMAIL (an inbox) was an admin, and an admin's email did not have to be
//        confirmed.
//   L15  a stored 'team' message was vouched for by its text alone, so a real reply could be
//        repeated, moved or re-timed by the account's own writes.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const read = (p) => fs.readFileSync(join(ROOT, p), 'utf8');
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
const UID = '55555555-5555-4555-8555-555555555555';
const OTHER = '66666666-6666-4666-8666-666666666666';
const USER = { id: UID, email: 'priya@example.invalid' };

/**
 * A Supabase client whose query chains resolve from `tables`, applying eq/in/order/range, and
 * recording every statement (reads too) as { table, op, filters, payload, inFilter, order, range }.
 */
function recorder({ tables = {}, rpc = null, storage = null, deleteUser = null } = {}) {
  const calls = [];
  const from = (table) => {
    const st = { table, op: 'select', filters: [], payload: null, opts: null, inFilter: null, order: null, range: null };
    const rows = () => (tables[table] = tables[table] ?? []);
    const run = () => {
      calls.push(st);
      let hit = rows().filter((r) => st.filters.every(([c, v]) => r[c] === v) && (!st.inFilter || st.inFilter[1].includes(r[st.inFilter[0]])));
      if (st.op === 'insert' || st.op === 'upsert') {
        const row = { id: `${table}-${rows().length + 1}`, ...st.payload };
        rows().push(row);
        return { data: [row], error: null };
      }
      if (st.op === 'update') { for (const r of hit) Object.assign(r, st.payload); return { data: hit.map((r) => ({ ...r })), error: null }; }
      if (st.op === 'delete') { tables[table] = rows().filter((r) => !hit.includes(r)); return { data: hit, error: null }; }
      if (st.order) { const [c, o] = st.order; const asc = !o || o.ascending !== false; hit = [...hit].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1)); }
      if (st.range) hit = hit.slice(st.range[0], st.range[1] + 1);
      return { data: hit.map((r) => ({ ...r })), error: null };
    };
    const one = async () => { const r = run(); return { data: r.data[0] ?? null, error: r.error }; };
    const q = {
      select() { return q; },
      insert(p) { st.op = 'insert'; st.payload = p; return q; },
      upsert(p, o) { st.op = 'upsert'; st.payload = p; st.opts = o; return q; },
      update(p) { st.op = 'update'; st.payload = p; return q; },
      delete() { st.op = 'delete'; return q; },
      eq(c, v) { st.filters.push([c, v]); return q; },
      in(c, v) { st.inFilter = [c, v]; return q; },
      order(c, o) { st.order = [c, o]; return q; },
      range(a, b) { st.range = [a, b]; return q; },
      limit() { return q; }, neq() { return q; }, gte() { return q; }, lte() { return q; }, gt() { return q; }, lt() { return q; },
      is() { return q; }, not() { return q; }, or() { return q; }, ilike() { return q; }, filter() { return q; },
      maybeSingle: one, single: one,
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return q;
  };
  const client = {
    from,
    rpc: async (name, args) => { calls.push({ rpc: name, args }); return rpc ? rpc(name, args) : { data: null, error: null }; },
    storage: storage ?? { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }), upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.test/x' } }) }) },
    auth: { getUser: async () => ({ data: { user: USER } }), admin: { deleteUser: deleteUser ?? (async () => ({ error: null })) } },
  };
  return { client, calls, tables };
}
const stmts = (calls, table, op) => calls.filter((c) => c.table === table && (!op || c.op === op));

// ── L1 ────────────────────────────────────────────────────────────────────────────────────
process.env.ACCOUNT_DELETE_SECRET = 'test-delete-secret';
const confirm = await loadRealModule(join(ROOT, 'src/lib/delete-confirm.ts'), { typescript: true });

test('L1: the confirmation token is bound to the account, dies in ten minutes, and cannot be forged', () => {
  const t0 = Date.parse('2026-10-09T12:00:00Z');
  const issued = confirm.issueDeleteConfirm(UID, t0);
  assert.ok(issued && issued.token.split('.').length === 3);
  assert.equal(issued.expiresAt, t0 + confirm.DELETE_CONFIRM_TTL_S * 1000);
  assert.equal(confirm.verifyDeleteConfirm(issued.token, UID, t0 + 60_000), true);
  assert.equal(confirm.verifyDeleteConfirm(issued.token, OTHER, t0 + 60_000), false, 'another account cannot spend it');
  assert.equal(confirm.verifyDeleteConfirm(issued.token, UID, t0 + 11 * 60_000), false, 'expired');
  const [uid, exp, sig] = issued.token.split('.');
  assert.equal(confirm.verifyDeleteConfirm(`${uid}.${exp}.${sig.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'))}`, UID, t0), false, 'a changed signature');
  assert.equal(confirm.verifyDeleteConfirm(`${uid}.${Number(exp) + 3600}.${sig}`, UID, t0 + 11 * 60_000), false, 'a changed expiry is a changed signature');
  assert.equal(confirm.verifyDeleteConfirm(`${OTHER}.${exp}.${sig}`, OTHER, t0), false, 'a changed account too');
  for (const bad of [null, '', 'a.b', `${uid}.${exp}`, 42]) assert.equal(confirm.verifyDeleteConfirm(bad, UID, t0), false, String(bad));
  const saved = process.env.ACCOUNT_DELETE_SECRET;
  const savedRl = process.env.RATE_LIMIT_SECRET; const savedSk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.ACCOUNT_DELETE_SECRET; delete process.env.RATE_LIMIT_SECRET; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.equal(confirm.issueDeleteConfirm(UID, t0), null, 'no secret, no token');
    assert.equal(confirm.verifyDeleteConfirm(issued.token, UID, t0), false, 'and nothing verifies');
  } finally {
    process.env.ACCOUNT_DELETE_SECRET = saved;
    if (savedRl !== undefined) process.env.RATE_LIMIT_SECRET = savedRl;
    if (savedSk !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedSk;
  }
});

async function deleteRoute({ user = USER, admin } = {}) {
  let adminMade = 0;
  const route = await loadRealModule(join(ROOT, 'src/app/api/account/delete/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => user }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/delete-confirm', confirm],
      ['@/lib/supabase/admin', { createAdminClient: () => { adminMade += 1; return admin.client; } }],
    ]),
  });
  const post = async (body) => {
    const req = new Request('https://shape.test/api/account/delete', { method: 'POST', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const res = await route.POST(req);
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { post, adminMade: () => adminMade };
}

test('L1: deletion takes two requests, and nothing is touched until the second carries the token', async () => {
  let deleted = 0;
  const admin = recorder({ deleteUser: async () => { deleted += 1; return { error: null }; } });
  const r = await deleteRoute({ admin });
  const first = await r.post(null);
  assert.equal(first.status, 428);
  assert.equal(first.body.confirmRequired, true);
  assert.equal(first.body.expiresInSeconds, 600);
  assert.equal(confirm.verifyDeleteConfirm(first.body.confirmToken, UID), true, 'the token is this account\'s');
  assert.equal(r.adminMade(), 0, 'the first request creates no admin client: no row, no bucket, no auth user is reached');
  assert.equal(deleted, 0);

  const forged = await r.post({ confirmToken: confirm.issueDeleteConfirm(OTHER).token });
  assert.equal(forged.status, 403);
  assert.equal(forged.body.code, 'confirm_invalid');
  assert.equal(r.adminMade(), 0, 'a token for another account deletes nothing');

  const second = await r.post({ confirmToken: first.body.confirmToken });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.authDeleted, true);
  assert.equal(deleted, 1, 'the second request, with the token, deletes');
  assert.ok(stmts(admin.calls, 'user_goals', 'delete').length === 1, 'the purge ran');

  const out = await deleteRoute({ user: null, admin });
  assert.equal((await out.post(null)).status, 401);
});

test('L1: all three delete buttons make the second request with the token', () => {
  for (const file of ['public/newdesign/dashProfileExtras.jsx', 'public/newdesign/clientMeSettings.jsx', 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx']) {
    const src = read(file);
    assert.match(src, /res\.status === 428/, `${file} reads the 428`);
    assert.match(src, /JSON\.stringify\(\{ confirmToken: step\.confirmToken \}\)/, `${file} sends the token back`);
    assert.doesNotMatch(src, /const res = await fetch\(['"]\/api\/account\/delete['"], \{ method: ['"]POST['"], credentials: ['"]same-origin['"] \}\);\n\s+if \(res\.status === 401\)[^\n]*\n\s+if \(!res\.ok\)/, `${file} no longer treats the first answer as final`);
  }
});

// ── L2 ────────────────────────────────────────────────────────────────────────────────────
async function sessionRoute() {
  const sets = [];
  const nativeCors = await loadRealModule(join(ROOT, 'src/lib/native-cors.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  const authCookies = await import(pathToFileURL(join(ROOT, 'src/lib/supabase/auth-cookies.mjs')).href);
  const route = await loadRealModule(join(ROOT, 'src/app/api/auth/session/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['next/headers', { cookies: async () => ({ getAll: () => [], set: () => {} }) }],
      ['@/lib/supabase/server', { createClient: async () => ({ auth: { setSession: async (t) => { sets.push(t); return { error: null }; }, getSession: async () => ({ data: { session: null } }), signOut: async () => ({ error: null }) } }) }],
      ['@/lib/supabase/auth-cookies.mjs', authCookies],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/native-cors', nativeCors],
    ]),
  });
  const post = async (origin) => {
    const headers = { 'content-type': 'application/json' };
    if (origin) headers.origin = origin;
    const res = await route.POST(new Request('https://shape.test/api/auth/session', { method: 'POST', headers, body: JSON.stringify({ access_token: 'a', refresh_token: 'r' }) }));
    return res.status;
  };
  return { post, sets };
}

test('L2: a cross-site POST cannot set the session cookies; Shape\'s own pages, the app and a bare request can', async () => {
  const saved = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.theshapecommunity.com';
  try {
    const r = await sessionRoute();
    assert.equal(await r.post('https://evil.example'), 403);
    assert.equal(await r.post('https://shape.test.evil.example'), 403);
    assert.equal(r.sets.length, 0, 'no session was set for the cross-site page');
    assert.equal(await r.post('https://shape.test'), 200, 'the request\'s own origin');
    assert.equal(await r.post('https://www.theshapecommunity.com'), 200, 'the configured site');
    assert.equal(await r.post('capacitor://localhost'), 200, 'the installed app');
    assert.equal(await r.post('https://localhost'), 200);
    assert.equal(await r.post(null), 200, 'no Origin is not a browser\'s cross-site form');
    assert.equal(r.sets.length, 5);
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = saved;
  }
});

// ── L3 ────────────────────────────────────────────────────────────────────────────────────
test('L3: the coach under review does not read the admin\'s notes', () => {
  const src = read('src/app/api/coach/credentials/route.ts');
  assert.match(src, /\n\s+notes: null,\n/);
  assert.doesNotMatch(src, /notes: \(c\?\.review_notes as string\)/);
});

// ── L4 ────────────────────────────────────────────────────────────────────────────────────
async function applyRoute({ db }) {
  const uploads = [];
  const providerApplications = await loadRealModule(join(ROOT, 'src/lib/provider-applications.ts'), { typescript: true });
  const nutrition = await import(pathToFileURL(join(ROOT, 'src/lib/compliance/nutrition.mjs')).href);
  const ageDerive = await import(pathToFileURL(join(ROOT, 'src/lib/age-derive.mjs')).href);
  const admin = recorder({ storage: { from: () => ({ upload: async (path, bytes, opts) => { uploads.push({ path, size: bytes.length, ...opts }); return { error: null }; } }) } });
  const route = await loadRealModule(join(ROOT, 'src/app/api/apply/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      // L19 (2026-10-10): the application row is written through the service role, so the admin
      // client is the recorder the tests read (`db`), with the storage stub beside it.
      ['@/lib/supabase/admin', { createAdminClient: () => new Proxy(db.client, { get: (t, k) => (k === 'storage' ? admin.client.storage : Reflect.get(t, k)) }) }],
      ['@/lib/email', { sendEmail: async () => ({ ok: true }) }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/provider-applications', providerApplications],
      ['@/lib/compliance/nutrition.mjs', nutrition],
      ['@/lib/age-derive.mjs', ageDerive],
    ]),
  });
  const post = async (files) => {
    const form = new FormData();
    for (const [k, v] of Object.entries({ providerType: 'trainer', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.invalid', dob: '1990-04-02', yearsExperience: '7' })) form.append(k, v);
    form.append('details', JSON.stringify({ background_check_consent: true }));
    for (const f of files) form.append(f.kind, f.file);
    const res = await route.POST(new nextServer.NextRequest('https://shape.test/api/apply', { method: 'POST', body: form }));
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { post, uploads, admin };
}

test('L4: an empty declared type is read off the extension, an unknown one is refused before the row is written, six files at most', async () => {
  const db = recorder();
  const { post, uploads } = await applyRoute({ db });
  // A File with an empty type is serialised in the multipart body as application/octet-stream,
  // which is how the route sees every "no type" upload from a real browser too.
  const bad = await post([{ kind: 'certificate', file: new File(['MZ...'], 'tool.exe', { type: '' }) }]);
  assert.equal(bad.status, 400, JSON.stringify(bad.body));
  assert.match(bad.body.error, /tool\.exe must be a PDF, DOC, DOCX, PNG, JPEG or WebP file\./);
  assert.equal(stmts(db.calls, 'provider_applications', 'insert').length, 0, 'refused BEFORE the application row');
  const declared = await post([{ kind: 'certificate', file: new File(['x'], 'cert.pdf', { type: 'text/html' }) }]);
  assert.equal(declared.status, 400, 'a declared type outside the list is refused whatever the extension says');
  const many = await post(Array.from({ length: 7 }, (_, i) => ({ kind: `certificate_${i}`, file: new File(['%PDF'], `c${i}.pdf`, { type: 'application/pdf' }) })));
  assert.equal(many.status, 400);
  assert.match(many.body.error, /At most 6 files per application\./);
  assert.equal(uploads.length, 0);
  const ok = await post([{ kind: 'certificate', file: new File(['%PDF'], 'cert.PDF', { type: '' }) }, { kind: 'photo', file: new File(['x'], 'me.jpg', { type: 'image/jpeg;charset=binary' }) }]);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(stmts(db.calls, 'provider_applications', 'insert').length, 1);
  assert.deepEqual(uploads.map((u) => u.contentType), ['application/pdf', 'image/jpeg'], 'stored under the type the rule settled on, never the raw declaration');
});

// ── L5 ────────────────────────────────────────────────────────────────────────────────────
test('L5: a radio room\'s host role is the profile\'s, whatever the body says', async () => {
  const db = recorder({ tables: { profiles: [{ id: UID, full_name: 'Priya', role: 'client' }] } });
  const route = await loadRealModule(join(ROOT, 'src/app/api/radio/rooms/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => USER, clientForRequest: async () => db.client }],
      ['@/lib/request-utils', requestUtils],
    ]),
  });
  const res = await route.POST(new Request('https://shape.test/api/radio/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'admin', topic: 'Sunday long run', scheduledAt: '2027-01-10T19:00:00.000Z' }) }));
  assert.ok(res.status < 300, `status ${res.status}`);
  const insert = stmts(db.calls, 'radio_rooms', 'insert')[0];
  assert.ok(insert, 'the room was written');
  assert.equal(insert.payload.host_role, 'client');
  assert.doesNotMatch(read('src/app/api/radio/rooms/route.ts'), /payload\?\.role/, 'the body\'s role is not read at all');
});

// ── L6 ────────────────────────────────────────────────────────────────────────────────────
async function registerRoute({ tables }) {
  const admin = recorder({ tables });
  const infos = [];
  const route = await loadRealModule(join(ROOT, 'src/app/api/push/register/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => USER, clientForRequest: async () => admin.client }],
      ['@/lib/supabase/admin', { createAdminClient: () => admin.client }],
      ['@/lib/request-utils', requestUtils],
    ]),
  });
  const orig = console.info;
  console.info = (...a) => infos.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  try {
    const res = await route.POST(new Request('https://shape.test/api/push/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'tok-new', platform: 'ios' }) }));
    return { status: res.status, admin, infos };
  } finally { console.info = orig; }
}

test('L6: an account keeps its newest 25 tokens, and a token that changes hands is logged', async () => {
  const rows = Array.from({ length: 26 }, (_, i) => ({ token: `tok-${i}`, user_id: UID, platform: 'ios', updated_at: `2026-09-${String(1 + i).padStart(2, '0')}T00:00:00.000Z` }));
  const r = await registerRoute({ tables: { push_tokens: [...rows, { token: 'tok-new', user_id: OTHER, platform: 'ios', updated_at: '2026-09-30T00:00:00.000Z' }] } });
  assert.equal(r.status, 200);
  const prune = stmts(r.admin.calls, 'push_tokens', 'delete')[0];
  assert.ok(prune, 'the overflow is removed');
  assert.deepEqual(prune.filters, [['user_id', UID]], 'only this account\'s rows');
  assert.deepEqual(prune.inFilter[1], ['tok-1', 'tok-0'], 'the two OLDEST tokens go (27 held, 25 kept)');
  assert.equal(r.admin.tables.push_tokens.filter((x) => x.user_id === UID).length, 25);
  assert.equal(r.infos.length, 1, 'one line for the re-point');
  assert.match(r.infos[0], /re-pointed to another account/);
  assert.ok(r.infos[0].includes(OTHER) && r.infos[0].includes(UID), 'naming both accounts');
  const quiet = await registerRoute({ tables: { push_tokens: [{ token: 'tok-new', user_id: UID, platform: 'ios', updated_at: '2026-09-30T00:00:00.000Z' }] } });
  assert.equal(quiet.infos.length, 0, 'the same account re-registering is not a re-point');
  assert.equal(stmts(quiet.admin.calls, 'push_tokens', 'delete').length, 0, 'nothing to prune under the cap');
  // Codex, #2289: an account past 225 tokens (possible before the cap existed) is brought down to
  // 25 in one registration, page by page, not 200 at a time.
  const many = Array.from({ length: 300 }, (_, i) => ({ token: `old-${i}`, user_id: UID, platform: 'ios', updated_at: `2026-0${1 + Math.floor(i / 100)}-${String(1 + (i % 28)).padStart(2, '0')}T${String(Math.floor((i % 100) / 10))}${i % 10}:00:00.000Z` }));
  const big = await registerRoute({ tables: { push_tokens: many } });
  assert.equal(big.status, 200);
  const prunes = stmts(big.admin.calls, 'push_tokens', 'delete');
  assert.deepEqual(prunes.map((p) => p.inFilter[1].length), [200, 76], 'two pages: a full one, then the rest');
  assert.equal(big.admin.tables.push_tokens.filter((x) => x.user_id === UID).length, 25);
  assert.ok(big.admin.tables.push_tokens.some((x) => x.token === 'tok-new'), 'the newest is kept');
});

// ── L7 ────────────────────────────────────────────────────────────────────────────────────
test('L7: the push webhook\'s secret is compared in constant time, and a wrong length does not throw', async () => {
  process.env.PUSH_WEBHOOK_SECRET = 'push-secret-of-some-length';
  const route = await loadRealModule(join(ROOT, 'src/app/api/push/dispatch/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => recorder().client }],
      ['@/lib/push', { pushConfigured: () => false, sendPushToUser: async () => ({ sent: 0 }) }],
    ]),
  });
  const post = async (secret) => (await route.POST(new Request('https://shape.test/api/push/dispatch', { method: 'POST', headers: secret == null ? {} : { 'x-push-secret': secret }, body: '{}' }))).status;
  assert.equal(await post('push-secret-of-some-length'), 200);
  assert.equal(await post('push-secret-of-some-lengtX'), 401);
  assert.equal(await post('short'), 401);
  assert.equal(await post(null), 401);
  const src = read('src/app/api/push/dispatch/route.ts');
  assert.match(src, /import \{ timingSafeEqual \} from 'node:crypto';/);
  assert.match(src, /return x\.length === y\.length && timingSafeEqual\(x, y\);/);
  assert.doesNotMatch(src, /request\.headers\.get\('x-push-secret'\) !== secret/);
});

// ── L8 ────────────────────────────────────────────────────────────────────────────────────
test('L8: the Apple Music developer token is minted for signed-in members only, and the app sends its session for it', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  process.env.APPLE_MUSIC_TEAM_ID = 'TEAM12345';
  process.env.APPLE_MUSIC_KEY_ID = 'KEY12345';
  process.env.APPLE_MUSIC_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const load = (user) => loadRealModule(join(ROOT, 'src/app/api/integrations/apple-music/developer-token/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/request-auth', { currentUser: async () => user }]]),
  });
  const anon = await (await load(null)).GET(new Request('https://shape.test/api/integrations/apple-music/developer-token'));
  assert.equal(anon.status, 401);
  const res = await (await load(USER)).GET(new Request('https://shape.test/api/integrations/apple-music/developer-token'));
  assert.equal(res.status, 200);
  const { developerToken } = await res.json();
  const [h, p, s] = developerToken.split('.');
  const b64 = (x) => Buffer.from(x.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  assert.equal(JSON.parse(b64(h).toString()).kid, 'KEY12345');
  assert.equal(JSON.parse(b64(p).toString()).iss, 'TEAM12345');
  assert.equal(crypto.createVerify('SHA256').update(`${h}.${p}`).verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, b64(s)), true, 'a real ES256 token for a member');
  const app = read('mobile-app/src/services/shapeBackend.js');
  const fetches = [...app.matchAll(/fetch\(`\$\{apiBaseUrl\}\/api\/integrations\/apple-music\/developer-token`(, \{ headers: sessionsAuthHeaders\(\) \})?\)/g)];
  assert.equal(fetches.length, 3, 'all three app callers');
  for (const m of fetches) assert.ok(m[1], 'each sends the session');
});

// ── L9 ────────────────────────────────────────────────────────────────────────────────────
test('L9: a meal-note attachment is stored under a type the bucket accepts, or not at all, behind a 90-day link', () => {
  const src = read('src/app/api/nutrition/meal-note/route.ts');
  assert.match(src, /const SIGNED_URL_TTL = 60 \* 60 \* 24 \* 90; \/\/ 90 days/);
  assert.match(src, /const AUDIO_TYPES = new Set\(\['audio\/webm', 'audio\/ogg', 'audio\/mp4', 'audio\/mpeg', 'audio\/wav', 'audio\/x-m4a', 'audio\/aac'\]\);/);
  assert.match(src, /const IMAGE_TYPES = new Set\(\['image\/jpeg', 'image\/png', 'image\/webp', 'image\/heic', 'image\/heif'\]\);/);
  // the two lists are the bucket's own
  const bucket = read('supabase-migrations/2026-06-03-meal-notes-bucket.sql');
  for (const t of ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']) assert.ok(bucket.includes(`'${t}'`), t);
  assert.match(src, /const declared = String\(file\.type \|\| ''\)\.toLowerCase\(\)\.split\(';'\)\[0\]\.trim\(\);\n\s+const type = declared && declared !== 'application\/octet-stream' \? declared : fallbackType;\n\s+if \(!allowed\.has\(type\)\) \{\n\s+console\.warn\([^\n]*\n\s+return \{ path: null, url: null \};\n\s+\}/, 'refused before the upload');
  assert.match(src, /contentType: type,/);
  assert.doesNotMatch(src, /contentType: file\.type/);
  assert.match(src, /uploadAttachment\(audio as File, `\$\{user\.id\}\/`, 'webm', 'audio\/webm', AUDIO_TYPES\)/);
  assert.match(src, /uploadAttachment\(photo as File, `\$\{user\.id\}\/photo-`, 'jpg', 'image\/jpeg', IMAGE_TYPES\)/);
});

// ── L10 ───────────────────────────────────────────────────────────────────────────────────
const returnPath = await loadRealModule(join(ROOT, 'src/lib/return-path.ts'), { typescript: true });

test('L10: a Stripe return path stays on this origin', () => {
  const f = (v) => returnPath.sameOriginPath(v, '/default');
  assert.equal(f('/purchase/success'), '/purchase/success');
  assert.equal(f('/newdesign/GetApp.html?checkout=cancelled&x=1#top'), '/newdesign/GetApp.html?checkout=cancelled&x=1#top');
  assert.equal(f('//evil.example/x'), '/default', 'protocol-relative');
  assert.equal(f('/\\evil.example'), '/default', 'a backslash reads as a slash in browsers');
  assert.equal(f('https://evil.example/'), '/default');
  assert.equal(f('evil.example'), '/default', 'no leading slash');
  assert.equal(f('/a b'), '/default', 'whitespace');
  assert.equal(f('/x\n'), '/default');
  assert.equal(f(''), '/default');
  assert.equal(f(null), '/default');
  assert.equal(f(42), '/default');
  assert.equal(f('/' + 'a'.repeat(2048)), '/default', 'too long');
  const checkout = read('src/app/api/stripe/checkout-session/route.ts');
  assert.match(checkout, /const successPath = sameOriginPath\(body\.successPath, '\/purchase\/success'\);/);
  assert.match(checkout, /const cancelPath = sameOriginPath\(body\.cancelPath, '\/newdesign\/GetApp\.html\?checkout=cancelled'\);/);
  assert.match(read('src/app/api/stripe/billing-portal/route.ts'), /const path = sameOriginPath\(body\?\.returnPath, '\/m\/'\);/);
});

// ── L11 + L13: the webhook ─────────────────────────────────────────────────────────────────
async function runWebhook(event, { tables = {} } = {}) {
  const platformFee = await import(pathToFileURL(join(ROOT, 'src/lib/platform-fee.mjs')).href);
  const coachOrigin = await import(pathToFileURL(join(ROOT, 'src/lib/coach-origin.mjs')).href);
  const retryable = await loadRealModule(join(ROOT, 'src/lib/db-retryable.ts'), { typescript: true });
  const admin = recorder({ tables });
  const warnings = [];
  const route = await loadRealModule(join(ROOT, 'src/app/api/stripe/webhook/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/stripe', { stripe: { webhooks: { constructEvent: (raw) => JSON.parse(raw) }, paymentIntents: { retrieve: async () => ({ application_fee_amount: 0 }) } } }],
      ['@/lib/supabase/admin', { createAdminClient: () => admin.client }],
      ['@/lib/notify', { createNotification: async () => true }],
      ['@/lib/platform-fee', platformFee],
      ['@/lib/coach-origin.mjs', coachOrigin],
      ['@/lib/db-retryable', retryable],
    ]),
  });
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  const origWarn = console.warn; const origErr = console.error;
  console.warn = (...a) => warnings.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  console.error = () => {};
  try {
    const res = await route.POST(new Request('https://shape.test/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=x' }, body: JSON.stringify(event) }));
    return { status: res.status, admin, warnings };
  } finally { console.warn = origWarn; console.error = origErr; }
}
const session = (type, payment_status, extra = {}) => ({
  id: 'evt_1', type,
  data: { object: { id: 'cs_test_1', mode: 'payment', payment_status, payment_intent: 'pi_1', metadata: {
    client_id: UID, provider_id: '4', provider_role: 'trainer', price_cents: '15500', gross_price_cents: '18000', kind: 'booking', item_name: 'Session', origin: 'marketplace', fee_bps: '1500', ...extra,
  } } },
});

test('L13: a one-time purchase is recorded when it is PAID: not on an unpaid completion, and on the payment event that follows', async () => {
  const unpaid = await runWebhook(session('checkout.session.completed', 'unpaid'));
  assert.equal(unpaid.status, 200);
  assert.equal(stmts(unpaid.admin.calls, 'one_time_purchases', 'upsert').length, 0, 'no purchase row for money that has not moved');
  assert.ok(unpaid.warnings.some((w) => w.includes('completed without payment')), 'and it is said');
  const paid = await runWebhook(session('checkout.session.completed', 'paid'));
  assert.equal(stmts(paid.admin.calls, 'one_time_purchases', 'upsert').length, 1);
  const later = await runWebhook(session('checkout.session.async_payment_succeeded', 'paid'));
  assert.equal(stmts(later.admin.calls, 'one_time_purchases', 'upsert').length, 1, 'the delayed payment lands the same row');
  const failed = await runWebhook(session('checkout.session.async_payment_failed', 'unpaid', { store_credit_ref: 'ref-9' }));
  assert.equal(failed.status, 200);
  assert.deepEqual(failed.admin.calls.filter((c) => c.rpc).map((c) => [c.rpc, c.args]), [['release_store_credit_reservation', { p_ref: 'ref-9' }]], 'a failed delayed payment releases the reserved credit, as an expiry does');
});

test('L11: a Connect account\'s status lands on the row holding ITS id, not the row its metadata names', async () => {
  const account = (metadata) => ({ id: 'evt_2', type: 'account.updated', data: { object: { id: 'acct_7', charges_enabled: true, payouts_enabled: true, requirements: {}, metadata } } });
  const tables = () => ({
    trainers: [{ id: 5, stripe_account_id: 'acct_5', stripe_account_status: 'pending' }, { id: 7, stripe_account_id: 'acct_7', stripe_account_status: 'pending' }],
    nutritionists: [{ id: 7, stripe_account_id: 'acct_N7', stripe_account_status: 'pending' }],
  });
  const r = await runWebhook(account({ provider_role: 'trainer', provider_id: '5' }), { tables: tables() });
  assert.equal(r.status, 200);
  assert.deepEqual(r.admin.tables.trainers.map((t) => [t.id, t.stripe_account_status]), [[5, 'pending'], [7, 'active']], 'row 7, whose account this is; row 5 untouched');
  assert.equal(r.admin.tables.nutritionists[0].stripe_account_status, 'pending', 'a nutritionist with the same numeric id is not touched');
  const updates = stmts(r.admin.calls, 'trainers', 'update');
  assert.deepEqual(updates[0].filters, [['stripe_account_id', 'acct_7']]);
  const noMeta = await runWebhook({ ...account({}), data: { object: { ...account({}).data.object, id: 'acct_N7' } } }, { tables: tables() });
  assert.equal(noMeta.admin.tables.nutritionists[0].stripe_account_status, 'active', 'with no metadata both tables are tried, and the account id finds its row');
  assert.deepEqual(noMeta.admin.tables.trainers.map((t) => t.stripe_account_status), ['pending', 'pending']);
  const nobody = await runWebhook(account({ provider_role: 'trainer', provider_id: '5' }), { tables: { trainers: [], nutritionists: [] } });
  assert.ok(nobody.warnings.some((w) => w.includes('matched no coach')), 'an account with no row is said, never written to another row');
});

// ── L12 ───────────────────────────────────────────────────────────────────────────────────
test('L12: a refund target is looked up as the filer\'s own row', () => {
  const src = read('src/app/dashboard/refunds/actions.ts');
  assert.match(src, /\.from\('one_time_purchases'\)\n\s+\.select\('stripe_payment_intent_id'\)\n\s+\.eq\('id', req\.one_time_purchase_id\)\n\s+\.eq\('client_id', req\.client_id\)/);
  assert.match(src, /\.from\('subscriptions'\)\n\s+\.select\('stripe_subscription_id'\)\n\s+\.eq\('id', req\.subscription_id\)\n\s+\.eq\('client_id', req\.client_id\)/);
});

// ── L14 ───────────────────────────────────────────────────────────────────────────────────
test('L14: the applications inbox is not an admin, and an admin\'s email has to be confirmed', async () => {
  const saved = { a: process.env.ADMIN_EMAILS, b: process.env.APPLICATIONS_EMAIL };
  process.env.ADMIN_EMAILS = 'Boss@Example.test';
  process.env.APPLICATIONS_EMAIL = 'inbox@example.test';
  try {
    let user = null;
    const access = await loadRealModule(join(ROOT, 'src/lib/admin-access.ts'), {
      typescript: true,
      registry: new Map([['@/lib/supabase/server', { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }]]),
    });
    assert.ok(access.getAdminEmails().includes('boss@example.test'));
    assert.ok(!access.getAdminEmails().includes('inbox@example.test'), 'APPLICATIONS_EMAIL grants nothing');
    user = { id: UID, email: 'boss@example.test', email_confirmed_at: null };
    await assert.rejects(access.requireAdminUser(), /Admin access required/, 'allow-listed but unconfirmed');
    user = { id: UID, email: 'inbox@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' };
    await assert.rejects(access.requireAdminUser(), /Admin access required/, 'the inbox, confirmed or not');
    user = { id: UID, email: 'Boss@example.test', email_confirmed_at: '2026-01-01T00:00:00Z' };
    assert.deepEqual(await access.requireAdminUser(), { id: UID, email: 'boss@example.test' });
    const core = await loadRealModule(join(ROOT, 'src/lib/membership-core.ts'), { typescript: true });
    assert.ok(!core.adminEmails().includes('inbox@example.test'), 'the mirror agrees');
    assert.ok(core.adminEmails().includes('boss@example.test'));
    // Codex, #2289: the membership verdict (what the AI routes and the edge gate authorize on)
    // also needs the confirmation, and a caller that passes nothing grants nothing.
    const db = recorder({ tables: { profiles: [{ id: UID, role: 'client', roles: [], date_of_birth: '1990-01-01', over_18: true, created_at: '2026-01-01T00:00:00Z' }] } }).client;
    assert.equal((await core.computeMembership(db, UID, 'boss@example.test', { emailConfirmed: true })).isAdmin, true);
    assert.equal((await core.computeMembership(db, UID, 'boss@example.test', { emailConfirmed: false })).isAdmin, false, 'allow-listed, unconfirmed');
    assert.equal((await core.computeMembership(db, UID, 'boss@example.test')).isAdmin, false, 'a caller that says nothing grants nothing');
    assert.equal((await core.computeMembership(db, UID, 'inbox@example.test', { emailConfirmed: true })).isAdmin, false);
    for (const f of ['src/app/api/ai/generate-plan/route.ts', 'src/app/api/ai/draft-workout/route.ts', 'src/app/api/store/redeem/route.ts', 'src/app/api/store/tier-rewards/route.ts', 'src/app/api/store/checkout/route.ts', 'src/app/api/radio/station/route.ts', 'src/lib/supabase/middleware.ts']) {
      assert.match(read(f), /computeMembership\([^\n]*, \{ emailConfirmed: !!\w+\.email_confirmed_at \}\)/, `${f} passes the confirmation`);
    }
    assert.equal((read('src/app/api/support/chat/route.ts').match(/computeMembership\(actor\.supabase, actor\.user\.id, actor\.user\.email \?\? null, \{ emailConfirmed: !!actor\.user\.email_confirmed_at \}\)/g) ?? []).length, 2, 'both chat call sites');
    assert.match(read('src/lib/ai/adminLookup.mjs'), /opts\.computeMembership\(db, u\.id, q, \{ emailConfirmed: !!u\.email_confirmed_at \}\)/);
  } finally {
    for (const [k, v] of [['ADMIN_EMAILS', saved.a], ['APPLICATIONS_EMAIL', saved.b]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

// ── L15 ───────────────────────────────────────────────────────────────────────────────────
const thread = await import(pathToFileURL(join(ROOT, 'src/lib/ai/noraThread.mjs')).href);
const support = await import(pathToFileURL(join(ROOT, 'src/lib/supportRequests.mjs')).href);

test('L15: a team message is vouched for by the request it names and its text, once; text alone no longer shows it', async () => {
  const NOW = new Date('2026-10-09T12:00:00Z');
  // the shape: only a team message carries a ref, and only a plausible one
  assert.deepEqual(thread.cleanMessage({ role: 'team', text: 'Done.', at: NOW.toISOString(), ref: 'sr-1' }, NOW, { team: true }), { role: 'team', text: 'Done.', at: NOW.toISOString(), ref: 'sr-1' });
  assert.deepEqual(thread.cleanMessage({ role: 'user', text: 'Hi', at: NOW.toISOString(), ref: 'sr-1' }, NOW), { role: 'user', text: 'Hi', at: NOW.toISOString() }, 'a user message carries none');
  assert.deepEqual(thread.cleanMessage({ role: 'team', text: 'Done.', at: NOW.toISOString(), ref: 'x'.repeat(41) }, NOW, { team: true }), { role: 'team', text: 'Done.', at: NOW.toISOString() });
  assert.equal(thread.appendTeamReply([], 'Done.', NOW, 'sr-1').at(-1).ref, 'sr-1');
  assert.equal('ref' in thread.appendTeamReply([], 'Done.', NOW).at(-1), false);
  // the vouching
  const replies = new Map([['sr-1', 'Refunded today.'], ['sr-2', 'You get a free year.']]);
  const shown = support.withVerifiedTeam([
    { role: 'user', text: 'Refund?' },
    { role: 'team', text: 'Refunded today.', ref: 'sr-1' },
    { role: 'team', text: 'Refunded today.' },                 // a copy with no ref: text alone
    { role: 'team', text: 'Refunded today.', ref: 'sr-1' },    // the same reply twice
    { role: 'team', text: 'You get a free year.', ref: 'sr-1' }, // a real text under another request's ref
    { role: 'team', text: 'You get two free years.', ref: 'sr-2' }, // a ref whose reply reads otherwise
    { role: 'team', text: 'You get a free year.', ref: 'sr-2' },
  ], replies);
  assert.deepEqual(shown.map((m) => [m.role, m.text, m.ref]), [['user', 'Refund?', undefined], ['team', 'Refunded today.', 'sr-1'], ['team', 'You get a free year.', 'sr-2']]);
  // the read: a Map by request id
  const db = recorder({ tables: { support_requests: [{ id: 'sr-1', user_id: UID, status: 'answered', reply: ' Refunded today. ' }, { id: 'sr-9', user_id: UID, status: 'answered', reply: null }] } });
  const got = await support.answeredReplies(db.client, UID);
  assert.equal(got.ok, true);
  assert.deepEqual([...got.replies], [['sr-1', 'Refunded today.']]);
  // the console passes the request id with its reply
  assert.match(read('src/app/dashboard/support/actions.ts'), /appendTeamToThread\(db, row\.user_id, reply, now, \{ ref: row\.id \}\)/);
  // and the chat route still quotes a team message to the model by its text only (a weaker use, said so)
  assert.match(read('src/app/api/support/chat/route.ts'), /new Set\(\[\.\.\.replies\.values\(\)\]\.map\(\(r\) => r\.slice\(0, 2000\)\.trim\(\)\)\)/);
});
