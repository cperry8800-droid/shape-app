// The coach application review, approval and onboarding path (2026-10-12). Each section drives
// the SHIPPING code (loadRealModule compiles the real files; fakes stand only where Supabase,
// Resend or Next's runtime would) or pins the one line a defect came down to.
//
//   1  the applicant is told: an approval email (a set-password link for a new account, sign-in
//      for an existing one) and a rejection email that is generic unless the reviewer writes a
//      note FOR the applicant; the internal review notes are never sent.
//   2  approve is one-shot; an existing listing is filled, never overwritten; the background-check
//      buttons and "Mark in review" do not reopen an approved application.
//   3  rejecting an approved application is refused (it would not take the coach down).
//   4  the one-time price is the applicant's single-session price, never the monthly price.
//   5  reviewer evidence comes from admin_review, never from the applicant's `details`, and only
//      this application's own uploads are signed.
//   6  credentials: admin nav + email on submit, the badge comes off on re-review and on lapsed
//      insurance.
//   7  every answer is on the card, the date of birth with an age, and a waiting-count badge.
//   8  account deletion erases the account's applications and their files.
//   9  the approval link lands: /auth/confirm verifies the token hash.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const read = (p) => fs.readFileSync(join(ROOT, p), 'utf8');

const APP_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_APP = '22222222-2222-4222-8222-222222222222';
const COACH_UID = '33333333-3333-4333-8333-333333333333';
const ADMIN = { id: '44444444-4444-4444-8444-444444444444', email: 'admin@example.invalid' };
const NEW_UID = '55555555-5555-4555-8555-555555555555';

process.env.NEXT_PUBLIC_SITE_URL = 'https://shape.test';
process.env.APPLICATIONS_EMAIL = 'apps@shape.test';

const pa = await loadRealModule(join(ROOT, 'src/lib/provider-applications.ts'), { typescript: true });
const emails = await loadRealModule(join(ROOT, 'src/lib/coach-application-emails.ts'), { typescript: true });
const ageDerive = await import(pathToFileURL(join(ROOT, 'src/lib/age-derive.mjs')).href);
const providerExperience = await import(pathToFileURL(join(ROOT, 'src/lib/provider-experience.mjs')).href);
const verification = await loadRealModule(join(ROOT, 'src/lib/coach-verification.ts'), { typescript: true });

/**
 * A recording service-role client. Tables are arrays of rows; every statement is recorded as
 * { table, op, filters, payload }. Filters apply to reads, updates and deletes, as PostgREST's do.
 */
function fakeAdmin({ tables = {}, users = [], rpc = {}, fail = [], afterRead = null } = {}) {
  const calls = [];
  const generated = [];
  const invited = [];
  const signed = [];
  const removed = [];
  const lists = [];
  let touches = 0;
  const rowsOf = (t) => (tables[t] = tables[t] ?? []);
  const from = (table) => {
    const st = { table, op: 'select', filters: [], payload: null, cols: null, single: false, returning: false, limit: null, order: null };
    const match = (r) => st.filters.every((f) => f.test(r));
    const run = () => {
      calls.push({ table, op: st.op, filters: st.filters.map((f) => f.desc), payload: st.payload, cols: st.cols });
      if (fail.includes(`${st.op}:${table}`) || fail.includes(table)) return { data: null, error: { message: `fake failure on ${st.op} ${table}` } };
      if (st.op === 'upsert') {
        const key = st.conflict || 'id';
        const hit = rowsOf(table).find((r) => r[key] === st.payload[key]);
        if (hit) { Object.assign(hit, st.payload); return { data: st.single ? hit : [hit], error: null }; }
      }
      if (st.op === 'insert' || st.op === 'upsert') {
        const row = { id: st.payload.id ?? `${table}-${rowsOf(table).length + 1}`, ...st.payload };
        if (table === 'trainers' || table === 'nutritionists') row.id = rowsOf(table).length + 101;
        rowsOf(table).push(row);
        return { data: st.single ? row : [row], error: null };
      }
      if (st.op === 'update') {
        const hit = rowsOf(table).filter(match);
        for (const r of hit) Object.assign(r, st.payload);
        // provider_applications_touch: every write moves updated_at.
        if (table === 'provider_applications') for (const r of hit) r.updated_at = `touched-${++touches}`;
        return { data: st.returning ? hit.map((r) => ({ ...r })) : null, error: null };
      }
      if (st.op === 'delete') {
        const hit = rowsOf(table).filter(match);
        tables[table] = rowsOf(table).filter((r) => !hit.includes(r));
        return { data: hit, error: null };
      }
      let hit = rowsOf(table).filter(match).map((r) => ({ ...r }));
      if (st.order) hit.sort((a, b) => (a[st.order] < b[st.order] ? -1 : 1));
      if (st.limit != null) hit = hit.slice(0, st.limit);
      if (st.range) hit = hit.slice(st.range[0], st.range[1] + 1);
      if (afterRead) afterRead({ table, rows: hit, tables });
      if (st.head) return { data: null, count: hit.length, error: null };
      if (st.single) return { data: hit[0] ?? null, error: hit[0] || st.maybe ? null : { message: 'no rows' } };
      return { data: hit, error: null };
    };
    const q = {
      select(cols, opts) { if (st.op === 'select') st.cols = cols; else st.returning = true; if (opts?.head) st.head = true; return q; },
      insert(p) { st.op = 'insert'; st.payload = p; return q; },
      upsert(p, o) { st.op = 'upsert'; st.payload = p; st.conflict = o?.onConflict; return q; },
      update(p) { st.op = 'update'; st.payload = p; return q; },
      delete() { st.op = 'delete'; return q; },
      eq(c, v) { st.filters.push({ desc: `${c}=${v}`, test: (r) => r[c] === v }); return q; },
      neq(c, v) { st.filters.push({ desc: `${c}!=${v}`, test: (r) => r[c] !== v }); return q; },
      in(c, vs) { st.filters.push({ desc: `${c} in ${vs}`, test: (r) => vs.includes(r[c]) }); return q; },
      lt(c, v) { st.filters.push({ desc: `${c}<${v}`, test: (r) => r[c] != null && String(r[c]) < String(v) }); return q; },
      gte(c, v) { st.filters.push({ desc: `${c}>=${v}`, test: (r) => r[c] != null && String(r[c]) >= String(v) }); return q; },
      lte(c, v) { st.filters.push({ desc: `${c}<=${v}`, test: (r) => r[c] != null && String(r[c]) <= String(v) }); return q; },
      order(c) { st.order = c; return q; },
      limit(n) { st.limit = n; return q; },
      range(a, b) { st.range = [a, b]; return q; },
      single() { st.single = true; return q; },
      maybeSingle() { st.single = true; st.maybe = true; return q; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return q;
  };
  const client = {
    from,
    rpc: async (name, args) => {
      calls.push({ rpc: name, args });
      if (fail.includes(`rpc:${name}`)) return { data: null, error: { message: `fake failure on rpc ${name}` } };
      if (rpc[name]) return rpc[name](args);
      // The database's clear_listing_verified (2026-10-13): both listing tables, one owner, one statement.
      if (name === 'clear_listing_verified') {
        const hit = ['trainers', 'nutritionists'].flatMap((t) => rowsOf(t).filter((r) => r.owner_id === args.p_owner && r.verified === true));
        for (const r of hit) Object.assign(r, { verified: false, verified_at: null });
        return { data: hit.length, error: null };
      }
      return { data: null, error: null };
    },
    auth: {
      admin: {
        listUsers: async () => ({ data: { users }, error: null }),
        generateLink: async (params) => {
          generated.push(params);
          if (params.type === 'invite' && users.some((u) => u.email?.toLowerCase() === params.email.toLowerCase())) return { data: { user: null, properties: null }, error: { message: 'already registered' } };
          return { data: { user: { id: NEW_UID, email: params.email }, properties: { hashed_token: params.type === 'invite' ? 'hash/with+chars' : 'recovery-hash', verification_type: params.type } }, error: null };
        },
        inviteUserByEmail: async (email) => { invited.push(email); return { data: { user: { id: NEW_UID } }, error: null }; },
      },
    },
    storage: {
      from: (bucket) => ({
        createSignedUrl: async (path) => { signed.push({ bucket, path }); return { data: { signedUrl: `https://signed.test/${path}` }, error: null }; },
        list: async (prefix) => { lists.push({ bucket, prefix }); const files = (tables[`storage:${bucket}`] ?? []).filter((p) => p.startsWith(`${prefix}/`)).map((p) => ({ name: p.slice(prefix.length + 1), id: p })); return { data: files, error: null }; },
        remove: async (paths) => { removed.push(...paths.map((p) => `${bucket}:${p}`)); tables[`storage:${bucket}`] = (tables[`storage:${bucket}`] ?? []).filter((p) => !paths.includes(p)); return { error: null }; },
      }),
    },
  };
  return { client, calls, tables, generated, invited, signed, removed, lists };
}
const asRecord = (v) => (v && typeof v === 'object' ? v : {});
const stmts = (calls, table, op) => calls.filter((c) => c.table === table && (!op || c.op === op));

async function loadActions(admin, { emailOk = true } = {}) {
  const sent = [];
  const revalidated = [];
  const actions = await loadRealModule(join(ROOT, 'src/app/dashboard/applications/actions.ts'), {
    typescript: true,
    registry: new Map([
      ['next/cache', { revalidatePath: (p) => revalidated.push(p) }],
      ['next/navigation', { redirect: (to) => { const e = new Error('REDIRECT'); e.to = to; throw e; } }],
      ['@/lib/supabase/admin', { createAdminClient: () => admin.client }],
      ['@/lib/admin-access', { requireAdminUser: async () => ADMIN }],
      ['@/lib/email', { sendEmail: async (m) => { sent.push(m); return emailOk ? { ok: true } : { ok: false, error: 'email_not_configured' }; } }],
      ['@/lib/age-derive.mjs', ageDerive],
      ['@/lib/coach-application-emails', emails],
      ['@/lib/provider-applications', pa],
      ['@/lib/provider-experience.mjs', providerExperience],
    ]),
  });
  const run = async (name, fields) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    try {
      await actions[name](fd);
    } catch (e) {
      if (e.message === 'REDIRECT') return new URL(e.to, 'https://shape.test');
      throw e;
    }
    throw new Error(`${name} returned without redirecting`);
  };
  return { run, sent, revalidated };
}

const CLEAR_REVIEW = { background_check: { provider: 'checkr', status: 'clear', requested_at: '2026-10-01T00:00:00Z', completed_at: '2026-10-02T00:00:00Z', report_id: null, updated_by: ADMIN.id, updated_at: '2026-10-02T00:00:00Z' } };
function application(over = {}) {
  return {
    id: APP_ID,
    provider_type: 'trainer',
    first_name: 'Dana',
    last_name: 'Reyes',
    email: 'dana@example.invalid',
    phone: null,
    location: 'Austin',
    specialty: 'Strength, conditioning',
    years_experience: '8',
    monthly_price: '280',
    dob: '1990-05-02',
    status: 'pending',
    review_notes: 'INTERNAL: checked her references, one was lukewarm',
    details: { background_check_consent: 'true', background_check_status: 'consent_received', single_session_price: '55', bio: 'Coach bio.' },
    admin_review: CLEAR_REVIEW,
    updated_at: '2026-10-11T09:00:00.123456+00:00',
    ...over,
  };
}

// ── 5 · the reviewer's record, and the documents ─────────────────────────────────────────
test('5: a background check, an approval block and a report id in the applicant\'s details are ignored', () => {
  const forged = {
    background_check_consent: 'true',
    background_check_status: 'clear',
    background_check_requested_at: '2026-01-01',
    background_check_completed_at: '2026-01-02',
    background_check_report_id: 'rpt_fake',
    approved_provider: { provider_id: 7 },
  };
  const info = pa.backgroundCheckInfo(forged, {});
  assert.equal(info.status, 'consent_received', 'the status is the admin\'s, and the admin has marked nothing');
  assert.equal(info.requestedAt, '');
  assert.equal(info.completedAt, '');
  assert.equal(info.reportId, '');
  assert.equal(pa.isBackgroundCheckClear(forged, {}), false);
  assert.deepEqual(pa.applicantSuppliedReviewKeys(forged), ['approved_provider', 'background_check_requested_at', 'background_check_completed_at', 'background_check_report_id']);
  assert.ok(pa.REVIEW_HIDDEN_DETAIL_KEYS.includes('approved_provider'));

  assert.equal(pa.isBackgroundCheckClear(forged, CLEAR_REVIEW), true, 'the admin\'s clear counts');
  assert.equal(pa.isBackgroundCheckClear({}, CLEAR_REVIEW), false, 'consent is still required');
  assert.equal(pa.backgroundCheckInfo({}, { background_check: { status: 'approved' } }).status, 'missing_consent', 'an unknown status is not a status');

  const next = pa.withAdminBackgroundCheck({ applicant_note: 'x' }, 'requested', ADMIN.id, '2026-10-12T10:00:00Z');
  assert.equal(next.applicant_note, 'x', 'the rest of the record is kept');
  assert.equal(next.background_check.status, 'requested');
  assert.equal(next.background_check.requested_at, '2026-10-12T10:00:00Z');
  assert.equal(next.background_check.updated_by, ADMIN.id);
  const cleared = pa.withAdminBackgroundCheck(next, 'clear', ADMIN.id, '2026-10-13T10:00:00Z');
  assert.equal(cleared.background_check.requested_at, '2026-10-12T10:00:00Z');
  assert.equal(cleared.background_check.completed_at, '2026-10-13T10:00:00Z');
});

test('5: only this application\'s own uploads are signable', () => {
  const ok = (p, uid = null) => pa.applicationDocumentPathAllowed(p, APP_ID, uid);
  assert.equal(ok(`website/${APP_ID}/resume/1-cv.pdf`), true, 'the website route\'s own prefix');
  assert.equal(ok(`${COACH_UID}/resume/1-cv.pdf`, COACH_UID), true, 'the app path, under the applicant\'s own account');
  assert.equal(ok(`website/${OTHER_APP}/resume/1-cv.pdf`), false, 'another application\'s files');
  assert.equal(ok(`${COACH_UID}/resume/1-cv.pdf`, null), false, 'an account folder with no account behind the email');
  assert.equal(ok(`${COACH_UID}/resume/1-cv.pdf`, NEW_UID), false, 'somebody else\'s account folder');
  for (const bad of [`website/${APP_ID}/../${OTHER_APP}/x.pdf`, `website/${APP_ID}//x.pdf`, `/website/${APP_ID}/x.pdf`, `website/${APP_ID}/a\\b.pdf`, `website/${APP_ID}/x\n.pdf`, `website/${APP_ID}`, '', null, 42, 'other-bucket-root.pdf']) {
    assert.equal(ok(bad, COACH_UID), false, JSON.stringify(bad));
  }
  const docs = pa.listApplicationDocuments({ documents: [{ kind: 'resume', path: 'a/b/c.pdf', name: 'c.pdf' }, { path: '' }, null], certProof_path: 'x/y.pdf' });
  assert.deepEqual(docs.map((d) => d.path), ['a/b/c.pdf', 'x/y.pdf']);
});

test('5: the review page signs only allowed paths, reads the check from admin_review, and resolves the app-path account by email', () => {
  const src = read('src/app/dashboard/applications/page.tsx');
  const allowAt = src.indexOf('applicationDocumentPathAllowed(doc.path, row.id, applicantUid)');
  const signAt = src.indexOf(".createSignedUrl(doc.path");
  assert.ok(allowAt > 0 && signAt > allowAt, 'the path check runs before the signature');
  assert.match(src, /admin\.rpc\('admin_account_by_email', \{ p_email: email \}\)/);
  assert.match(src, /backgroundCheckInfo\(details, review\)/);
  assert.doesNotMatch(src, /details\.approved_provider/, 'the approval record is never read from details');
});

// ── 1 · 2 · 4 · approve ──────────────────────────────────────────────────────────────────
test('1/4/9: approving a new applicant provisions without Supabase\'s invite, publishes the single-session price, and emails a set-password link', async () => {
  const admin = fakeAdmin({ tables: { provider_applications: [application()], profiles: [], trainers: [] } });
  const { run, sent } = await loadActions(admin);
  const to = await run('approveApplication', { application_id: APP_ID, review_notes: 'INTERNAL note', applicant_note: '' });
  assert.equal(to.searchParams.get('updated'), 'approved');
  assert.equal(to.searchParams.get('email'), 'sent');
  assert.equal(to.searchParams.get('account'), 'new');

  assert.equal(admin.invited.length, 0, 'no Supabase invite email (its implicit-flow link never landed)');
  assert.equal(admin.generated.length, 1);
  assert.equal(admin.generated[0].type, 'invite');
  assert.equal(admin.generated[0].options.data.role, 'trainer');

  const [listing] = admin.tables.trainers;
  assert.equal(listing.owner_id, NEW_UID);
  assert.equal(listing.price, 280);
  assert.equal(listing.session_price, 55, 'the single-session price, not the monthly one');
  assert.equal(listing.rating, 0);

  const app = admin.tables.provider_applications[0];
  assert.equal(app.status, 'approved');
  assert.equal(app.admin_review.approved_provider.provider_id, listing.id);
  assert.equal(app.admin_review.approved_provider.owner_id, NEW_UID);
  assert.equal(app.admin_review.decision_email.ok, true);
  assert.equal(app.details.approved_provider, undefined, 'nothing is written into the applicant\'s details');

  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'dana@example.invalid');
  const link = 'https://shape.test/auth/confirm?token_hash=hash%2Fwith%2Bchars&type=invite&next=%2Freset-password';
  assert.ok(sent[0].text.includes(link), sent[0].text);
  assert.ok(sent[0].html.includes(link.replace(/&/g, '&amp;')));
  for (const body of [sent[0].text, sent[0].html]) {
    assert.doesNotMatch(body, /INTERNAL/, 'the internal notes are never sent');
    assert.match(body, /profile photo/);
    assert.match(body, /Set up payouts/);
    assert.match(body, /prices/);
  }
});

test('experience: below the 5-year standard, Approve needs the reviewer\'s tick, which is recorded; the listing says the years it was told', async () => {
  for (const [years, label] of [['Less than 1 year', 'Under 1 year'], ['1-2 years', '1 year'], ['3-4 years', '3 years']]) {
    const admin = fakeAdmin({ tables: { provider_applications: [application({ years_experience: years, details: { ...application().details, experience_history: 'Gym A', experience_type: 'Floor' } })], profiles: [], trainers: [] } });
    const { run, sent } = await loadActions(admin);
    const refused = await run('approveApplication', { application_id: APP_ID });
    assert.equal(refused.searchParams.get('notice'), 'experience_tick_required', years);
    assert.equal(admin.tables.trainers.length, 0, 'nothing provisioned without the tick');
    assert.equal(admin.generated.length, 0);
    assert.equal(admin.tables.provider_applications[0].status, 'pending');
    assert.equal(asRecord(admin.tables.provider_applications[0].admin_review).approval_claim, undefined, 'not even claimed');
    assert.equal(sent.length, 0);

    const to = await run('approveApplication', { application_id: APP_ID, experience_exception: 'yes' });
    assert.equal(to.searchParams.get('updated'), 'approved', years);
    const app = admin.tables.provider_applications[0];
    assert.equal(app.admin_review.experience_exception.standard_years, 5);
    assert.equal(app.admin_review.experience_exception.years_experience, years);
    assert.equal(app.admin_review.experience_exception.by, ADMIN.id);
    assert.equal(admin.tables.trainers[0].experience, label);
  }
  // At the standard no tick is asked, none is recorded, and an application with no answer is
  // published with no experience line rather than the "7+ years" it used to claim.
  for (const [years, label] of [['5-7 years', '5 years'], ['15+ years', '15 years'], [null, null]]) {
    const admin = fakeAdmin({ tables: { provider_applications: [application({ years_experience: years })], profiles: [], trainers: [] } });
    const { run } = await loadActions(admin);
    const to = await run('approveApplication', { application_id: APP_ID });
    assert.equal(to.searchParams.get('updated'), 'approved', String(years));
    assert.equal(admin.tables.provider_applications[0].admin_review.experience_exception, null);
    assert.equal(admin.tables.trainers[0].experience ?? null, label, String(years));
  }
  const src = read('src/app/dashboard/applications/page.tsx');
  assert.match(src, /name="experience_exception" value="yes"/);
  assert.match(src, /belowExperienceStandard\(row\.years_experience\)/);
});

test('1: an existing account is reused and still gets the approval email, telling it to sign in', async () => {
  const admin = fakeAdmin({ tables: { provider_applications: [application()], profiles: [{ id: COACH_UID, role: 'client', roles: ['client'], full_name: 'Dana R', date_of_birth: '1990-05-02' }], trainers: [] }, users: [{ id: COACH_UID, email: 'Dana@Example.invalid', last_sign_in_at: '2026-09-01T00:00:00Z' }] });
  const { run, sent } = await loadActions(admin);
  const to = await run('approveApplication', { application_id: APP_ID, applicant_note: 'Welcome aboard, great references.' });
  assert.equal(to.searchParams.get('account'), 'existing');
  assert.equal(admin.generated.length + admin.invited.length, 0, 'no new account, no invite');
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /account you already have/);
  assert.ok(sent[0].text.includes('https://shape.test/newdesign/Login.html'));
  assert.doesNotMatch(sent[0].text, /auth\/confirm/);
  assert.match(sent[0].text, /Welcome aboard, great references\./, 'the note written FOR the applicant is included');
  const profile = admin.tables.profiles[0];
  assert.deepEqual(profile.roles, ['client', 'trainer']);
});

test('1/9: an existing account that has never signed in gets a set-password link, not "sign in as usual"', async () => {
  const admin = fakeAdmin({ tables: { provider_applications: [application()], profiles: [], trainers: [] }, users: [{ id: COACH_UID, email: 'dana@example.invalid', last_sign_in_at: null }] });
  const { run, sent } = await loadActions(admin);
  const to = await run('approveApplication', { application_id: APP_ID });
  assert.equal(to.searchParams.get('account'), 'new');
  assert.deepEqual(admin.generated.map((g) => g.type), ['recovery']);
  assert.ok(sent[0].text.includes('https://shape.test/auth/confirm?token_hash=recovery-hash&type=recovery&next=%2Freset-password'), sent[0].text);
  assert.equal(admin.tables.trainers[0].owner_id, COACH_UID, 'the existing account is the owner');
});

test('1: approval refuses before provisioning anything when the admin_review column is missing', async () => {
  const app = application();
  delete app.admin_review;
  const admin = fakeAdmin({ tables: { provider_applications: [app], profiles: [], trainers: [] } });
  const { run, sent } = await loadActions(admin);
  await assert.rejects(run('approveApplication', { application_id: APP_ID }), /2026-10-12-coach-application-review\.sql/);
  assert.equal(admin.generated.length, 0);
  assert.equal(stmts(admin.calls, 'trainers').length + stmts(admin.calls, 'profiles').length, 0);
  assert.equal(sent.length, 0);
});

test('1: a failed send is reported to the admin, and the approval stands', async () => {
  const admin = fakeAdmin({ tables: { provider_applications: [application()], profiles: [], trainers: [] } });
  const { run } = await loadActions(admin, { emailOk: false });
  const to = await run('approveApplication', { application_id: APP_ID });
  assert.equal(to.searchParams.get('updated'), 'approved');
  assert.equal(to.searchParams.get('email'), 'email_not_configured');
  assert.equal(admin.tables.provider_applications[0].status, 'approved');
  assert.equal(admin.tables.provider_applications[0].admin_review.decision_email.ok, false);
  assert.match(read('src/app/dashboard/applications/page.tsx'), /The applicant was NOT emailed/);
});

test('2: approve is one-shot: an approved application is refused before anything is provisioned', async () => {
  const admin = fakeAdmin({ tables: { provider_applications: [application({ status: 'approved' })], profiles: [], trainers: [{ id: 101, owner_id: COACH_UID, name: 'Coach Edited', rating: 4.9 }] } });
  const { run, sent } = await loadActions(admin);
  const to = await run('approveApplication', { application_id: APP_ID });
  assert.equal(to.searchParams.get('notice'), 'already_approved');
  assert.equal(admin.generated.length, 0);
  assert.equal(sent.length, 0);
  assert.equal(stmts(admin.calls, 'trainers').length, 0, 'the listing is not touched');
  assert.equal(stmts(admin.calls, 'provider_applications', 'update').length, 0);
});

test('2: two Approve clicks at once list the coach once: the claim stops the second before it provisions anything', async () => {
  let raced = false;
  const admin = fakeAdmin({
    tables: { provider_applications: [application()], profiles: [], trainers: [] },
    // The other click's claim lands between this click's read and its own claim.
    afterRead: ({ table, tables }) => {
      if (raced || table !== 'provider_applications') return;
      raced = true;
      tables.provider_applications[0].updated_at = '2026-10-12T21:00:00.000001+00:00';
    },
  });
  const { run, sent } = await loadActions(admin);
  const to = await run('approveApplication', { application_id: APP_ID, review_notes: '', applicant_note: '' });
  assert.equal(to.searchParams.get('notice'), 'approval_conflict');
  assert.equal(admin.tables.trainers.length, 0, 'no second listing');
  assert.equal(admin.generated.length, 0, 'no account provisioned');
  assert.equal(sent.length, 0);
  assert.equal(admin.tables.provider_applications[0].status, 'pending');

  // Uncontended, the claim is taken against the row as read, then the approval goes through.
  const clean = fakeAdmin({ tables: { provider_applications: [application()], profiles: [], trainers: [] } });
  const ok = await (await loadActions(clean)).run('approveApplication', { application_id: APP_ID, review_notes: '', applicant_note: '' });
  assert.equal(ok.searchParams.get('updated'), 'approved');
  const [claim] = stmts(clean.calls, 'provider_applications', 'update');
  assert.ok(claim.filters.includes('updated_at=2026-10-11T09:00:00.123456+00:00'), JSON.stringify(claim.filters));
  assert.ok(claim.payload.admin_review.approval_claim, 'the claim is recorded in admin_review');
  assert.equal(clean.tables.trainers.length, 1);
});

test('2: a click that arrives while the first Approve is still provisioning finds its live claim and stops', async () => {
  // The first click's claim has landed (it is on the row this click reads) and it is still running.
  const live = { ...CLEAR_REVIEW, approval_claim: { at: new Date(Date.now() - 20_000).toISOString(), by: ADMIN.id } };
  const admin = fakeAdmin({ tables: { provider_applications: [application({ admin_review: live })], profiles: [], trainers: [] } });
  const { run, sent } = await loadActions(admin);
  const to = await run('approveApplication', { application_id: APP_ID, review_notes: '', applicant_note: '' });
  assert.equal(to.searchParams.get('notice'), 'approval_in_progress');
  assert.equal(admin.tables.trainers.length, 0, 'no second listing');
  assert.equal(admin.generated.length, 0, 'no account provisioned');
  assert.equal(sent.length, 0);
  assert.equal(stmts(admin.calls, 'provider_applications', 'update').length, 0, 'the live claim is not overwritten');

  // A claim older than the hold belongs to a request that died: a new Approve takes over.
  const stale = { ...CLEAR_REVIEW, approval_claim: { at: new Date(Date.now() - 11 * 60_000).toISOString(), by: ADMIN.id } };
  const later = fakeAdmin({ tables: { provider_applications: [application({ admin_review: stale })], profiles: [], trainers: [] } });
  const ok = await (await loadActions(later)).run('approveApplication', { application_id: APP_ID, review_notes: '', applicant_note: '' });
  assert.equal(ok.searchParams.get('updated'), 'approved');
  assert.equal(later.tables.trainers.length, 1);
  assert.equal(later.tables.provider_applications[0].admin_review.approval_claim, null, 'the approval clears its claim');
});

test('2: a provisioning failure releases the claim, so the admin can approve again at once', async () => {
  const admin = fakeAdmin({ tables: { provider_applications: [application()], profiles: [], trainers: [] }, fail: ['insert:trainers'] });
  const { run, sent } = await loadActions(admin);
  await assert.rejects(run('approveApplication', { application_id: APP_ID, review_notes: '', applicant_note: '' }), (e) => /fake failure on insert trainers/.test(e?.message));
  const app = admin.tables.provider_applications[0];
  assert.equal(app.status, 'pending');
  assert.equal(app.admin_review.approval_claim, null, 'released');
  assert.equal(sent.length, 0);
});

test('5: requesting a screening again clears the last one\'s completion date', () => {
  let review = pa.withAdminBackgroundCheck({}, 'requested', ADMIN.id, '2026-10-01T00:00:00Z');
  review = pa.withAdminBackgroundCheck(review, 'clear', ADMIN.id, '2026-10-02T00:00:00Z');
  assert.equal(review.background_check.completed_at, '2026-10-02T00:00:00Z');
  review = pa.withAdminBackgroundCheck(review, 'needs_review', ADMIN.id, '2026-10-03T00:00:00Z');
  review = pa.withAdminBackgroundCheck(review, 'requested', ADMIN.id, '2026-10-04T00:00:00Z');
  assert.equal(review.background_check.requested_at, '2026-10-04T00:00:00Z');
  assert.equal(review.background_check.completed_at, null, 'an open screening shows no completion');
});

test('2: an existing listing keeps the coach\'s own edits and counters; only empty columns are filled', async () => {
  const existing = { id: 101, owner_id: COACH_UID, name: 'Coach Dana', bio: 'My own bio', price: 300, tags: ['Mine'], specialty: 'Mobility', category: 'Mobility', experience: '9 years', credential: 'NSCA', credential_full: 'NSCA', specialty_type: 'Mobility', color: '#123456', session_price: null, rating: 4.9, subscribers: 37, featured: true, trainer_of_month: true };
  const admin = fakeAdmin({ tables: { provider_applications: [application()], profiles: [], trainers: [existing] }, users: [{ id: COACH_UID, email: 'dana@example.invalid' }] });
  const { run } = await loadActions(admin);
  await run('approveApplication', { application_id: APP_ID });
  const row = admin.tables.trainers[0];
  assert.equal(admin.tables.trainers.length, 1, 'no second listing');
  assert.equal(row.name, 'Coach Dana');
  assert.equal(row.bio, 'My own bio');
  assert.equal(row.price, 300);
  assert.deepEqual(row.tags, ['Mine']);
  assert.equal(row.rating, 4.9);
  assert.equal(row.subscribers, 37);
  assert.equal(row.featured, true);
  assert.equal(row.trainer_of_month, true);
  assert.equal(row.session_price, 55, 'an empty column is filled');
  const [upd] = stmts(admin.calls, 'trainers', 'update');
  assert.deepEqual(Object.keys(upd.payload), ['session_price'], 'and nothing else is written');
});

test('4: a nutritionist\'s single consult fills meal_plan_price; no single price leaves it empty, never the monthly price', async () => {
  for (const [given, expect] of [['150', 150], ['', null], ['$99.50', 99.5]]) {
    const admin = fakeAdmin({ tables: { provider_applications: [application({ provider_type: 'nutritionist', details: { background_check_consent: 'true', single_session_price: given } })], profiles: [], nutritionists: [] } });
    const { run } = await loadActions(admin);
    await run('approveApplication', { application_id: APP_ID });
    const [row] = admin.tables.nutritionists;
    assert.equal(row.price, 280);
    assert.equal(row.meal_plan_price, expect, `single consult ${JSON.stringify(given)}`);
  }
  const admin = fakeAdmin({ tables: { provider_applications: [application({ details: { background_check_consent: 'true' } })], profiles: [], trainers: [] } });
  const { run } = await loadActions(admin);
  await run('approveApplication', { application_id: APP_ID });
  assert.equal(admin.tables.trainers[0].session_price, null, 'a trainer with no single-session price is not sold one at the monthly rate');
});

test('5: approval reads the check from admin_review: a "clear" in the applicant\'s details does not approve', async () => {
  const admin = fakeAdmin({ tables: { provider_applications: [application({ admin_review: {}, details: { background_check_consent: 'true', background_check_status: 'clear' } })], profiles: [], trainers: [] } });
  const { run } = await loadActions(admin);
  await assert.rejects(run('approveApplication', { application_id: APP_ID }), /clear background check/);
  assert.equal(admin.generated.length, 0);
});

test('2: the background-check buttons and "Mark in review" do not reopen an approved application; on others they write admin_review', async () => {
  for (const action of ['markBackgroundCheckRequested', 'markBackgroundCheckNeedsReview', 'markBackgroundCheckClear', 'markApplicationInReview']) {
    const admin = fakeAdmin({ tables: { provider_applications: [application({ status: 'approved' })] } });
    const { run } = await loadActions(admin);
    const to = await run(action, { application_id: APP_ID });
    assert.equal(to.searchParams.get('notice'), 'locked_approved', action);
    assert.equal(admin.tables.provider_applications[0].status, 'approved', action);
    assert.equal(stmts(admin.calls, 'provider_applications', 'update').length, 0, action);
  }
  const admin = fakeAdmin({ tables: { provider_applications: [application({ admin_review: {}, details: { background_check_consent: 'true' } })] } });
  const { run } = await loadActions(admin);
  await run('markBackgroundCheckClear', { application_id: APP_ID });
  const app = admin.tables.provider_applications[0];
  assert.equal(app.status, 'in_review');
  assert.equal(app.admin_review.background_check.status, 'clear');
  assert.equal(app.admin_review.background_check.updated_by, ADMIN.id);
  assert.equal(app.details.background_check_status, undefined, 'the applicant\'s details are not written');
  const [upd] = stmts(admin.calls, 'provider_applications', 'update');
  assert.ok(upd.filters.includes('status!=approved'), 'the write itself cannot land on an approved row');
});

// ── 1 · 3 · reject ───────────────────────────────────────────────────────────────────────
test('1: a rejection email is generic by default and never carries the internal notes', async () => {
  const admin = fakeAdmin({ tables: { provider_applications: [application()] } });
  const { run, sent } = await loadActions(admin);
  const to = await run('rejectApplication', { application_id: APP_ID, review_notes: 'INTERNAL: failed reference check', applicant_note: '' });
  assert.equal(to.searchParams.get('updated'), 'rejected');
  assert.equal(to.searchParams.get('email'), 'sent');
  const app = admin.tables.provider_applications[0];
  assert.equal(app.status, 'rejected');
  assert.equal(app.review_notes, 'INTERNAL: failed reference check', 'kept, internally');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'dana@example.invalid');
  for (const body of [sent[0].text, sent[0].html]) {
    assert.doesNotMatch(body, /INTERNAL|reference/);
    assert.match(body, /not able to approve your application/);
    assert.doesNotMatch(body, /note from the reviewer/i);
  }

  const admin2 = fakeAdmin({ tables: { provider_applications: [application({ status: 'in_review' })] } });
  const r2 = await loadActions(admin2);
  await r2.run('rejectApplication', { application_id: APP_ID, review_notes: 'INTERNAL', applicant_note: 'We need 2 more years of <b>coaching</b> experience.' });
  assert.match(r2.sent[0].text, /We need 2 more years of <b>coaching<\/b> experience\./, 'the applicant note, as written, in the text part');
  assert.match(r2.sent[0].html, /We need 2 more years of &lt;b&gt;coaching&lt;\/b&gt; experience\./, 'and escaped in the HTML');
  assert.equal(admin2.tables.provider_applications[0].admin_review.applicant_note, 'We need 2 more years of <b>coaching</b> experience.');
});

test('3: rejecting an approved application is refused, and so is rejecting twice', async () => {
  const admin = fakeAdmin({ tables: { provider_applications: [application({ status: 'approved' })] } });
  const { run, sent } = await loadActions(admin);
  const to = await run('rejectApplication', { application_id: APP_ID });
  assert.equal(to.searchParams.get('notice'), 'reject_approved');
  assert.equal(admin.tables.provider_applications[0].status, 'approved');
  assert.equal(sent.length, 0);
  assert.equal(stmts(admin.calls, 'provider_applications', 'update').length, 0);
  assert.match(read('src/app/dashboard/applications/page.tsx'), /reject_approved:[^]*Suspend listing[^]*not built yet/);

  const admin2 = fakeAdmin({ tables: { provider_applications: [application({ status: 'rejected' })] } });
  const r2 = await loadActions(admin2);
  assert.equal((await r2.run('rejectApplication', { application_id: APP_ID })).searchParams.get('notice'), 'already_rejected');
  assert.equal(r2.sent.length, 0, 'no second email');
});

test('2/3: the approved card has no Approve, Reject or status buttons', () => {
  const src = read('src/app/dashboard/applications/page.tsx');
  assert.match(src, /const canApprove = !isApproved && bg\.consented && bg\.status === 'clear';/);
  const lockedAt = src.indexOf('{isApproved ? (');
  const formAt = src.indexOf('<form className="mt-5 flex flex-col gap-3">');
  assert.ok(lockedAt > 0 && formAt > lockedAt, 'the action form is the non-approved branch');
});

// ── the emails themselves ────────────────────────────────────────────────────────────────
test('1: the emails escape what they are given and link the coach\'s own pages', () => {
  const a = emails.approvalEmail({ firstName: '<Dana>', role: 'nutritionist', setPasswordUrl: null, site: 'https://x.test' });
  assert.match(a.html, /Welcome to Shape, &lt;Dana&gt;\./);
  assert.ok(a.html.includes('https://x.test/newdesign/NutritionistProfile.html'));
  assert.ok(a.html.includes('https://x.test/newdesign/NutritionistAnalytics.html'));
  assert.match(a.subject, /approved/);
  const c = emails.credentialsSubmittedEmail({ coachName: 'Dana', coachEmail: 'd@x', ownerId: COACH_UID, site: 'https://x.test' });
  assert.ok(c.text.includes('https://x.test/dashboard/credentials?status=pending'));
});

// ── 6 · credentials ──────────────────────────────────────────────────────────────────────
test('6: the badge helper is one database call for that owner, and says when it fails', async () => {
  const admin = fakeAdmin({ tables: {
    trainers: [{ id: 1, owner_id: COACH_UID, verified: true, verified_at: 'x' }, { id: 2, owner_id: NEW_UID, verified: true, verified_at: 'y' }],
    nutritionists: [{ id: 3, owner_id: COACH_UID, verified: true, verified_at: 'z' }],
  } });
  assert.equal(await verification.clearListingVerified(admin.client, COACH_UID), 2);
  // Both tables in one call: the database function clears them in one statement (CodeRabbit, #2315).
  assert.deepEqual(admin.calls, [{ rpc: 'clear_listing_verified', args: { p_owner: COACH_UID } }]);
  assert.equal(admin.tables.trainers[0].verified, false);
  assert.equal(admin.tables.trainers[0].verified_at, null);
  assert.equal(admin.tables.trainers[1].verified, true, 'another coach is untouched');
  assert.equal(admin.tables.nutritionists[0].verified, false);
  assert.equal(await verification.clearListingVerified(admin.client, COACH_UID), 0, 'idempotent');
  const broken = fakeAdmin({ tables: { trainers: [], nutritionists: [] }, fail: ['rpc:clear_listing_verified'] });
  await assert.rejects(verification.clearListingVerified(broken.client, COACH_UID), { message: /fake failure on rpc clear_listing_verified/ });
});

async function credentialsRoute({ before, user }) {
  const prior = typeof before === 'string' ? { review_status: before } : before;
  const own = fakeAdmin({ tables: { provider_credentials: prior ? [{ owner_id: user.id, ...prior }] : [] } });
  // Handed to the route in case it reaches for the service role; it must not (see below).
  const service = fakeAdmin({ tables: { trainers: [{ id: 1, owner_id: user.id, verified: true }], nutritionists: [] } });
  const sent = [];
  const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  const nutrition = await import(pathToFileURL(join(ROOT, 'src/lib/compliance/nutrition.mjs')).href);
  const route = await loadRealModule(join(ROOT, 'src/app/api/coach/credentials/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => own.client }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/compliance/nutrition.mjs', nutrition],
      ['@/lib/supabase/admin', { createAdminClient: () => service.client }],
      ['@/lib/email', { sendEmail: async (m) => { sent.push(m); return { ok: true }; } }],
      ['@/lib/coach-application-emails', emails],
      ['@/lib/coach-verification', verification],
    ]),
  });
  const post = async (body) => {
    const res = await route.POST(new Request('https://shape.test/api/coach/credentials', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  return { post, sent, service, own };
}

test('6: a credential submission mails the applications inbox once, and leaves the badge to the database', async () => {
  const user = { id: COACH_UID, email: 'dana@example.invalid', user_metadata: { full_name: 'Dana Reyes' } };
  const r = await credentialsRoute({ before: 'approved', user });
  const out = await r.post({ action: 'submit' });
  assert.equal(out.status, 200);
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].to, 'apps@shape.test');
  assert.match(r.sent[0].subject, /Dana Reyes/);
  // The badge comes off in the coach's own write (provider_credentials_zz_unverify_listings), so
  // the route makes no service-role write of its own (CodeRabbit, #2315).
  assert.deepEqual(r.service.calls, [], 'no service-role call');
  assert.ok(stmts(r.own.calls, 'provider_credentials', 'upsert').length === 1, 'the submission is the coach\'s own write');

  const at = '2026-10-05T10:00:00.000Z';
  const again = await credentialsRoute({ before: { review_status: 'pending', submitted_at: at, updated_at: at }, user });
  await again.post({ action: 'submit' });
  assert.equal(again.sent.length, 0, 'submitted and not edited since: no second email');

  const save = await credentialsRoute({ before: 'approved', user });
  assert.equal((await save.post({ credentialType: 'rd', attestations: {} })).status, 200);
  assert.deepEqual(save.service.calls, [], 'a saved change makes no service-role call either');
  assert.equal(save.sent.length, 0);
});

test('6: a resubmission after an edit is mailed: an edit puts the row back to pending, which is not "already submitted"', async () => {
  const user = { id: COACH_UID, email: 'dana@example.invalid', user_metadata: { full_name: 'Dana Reyes' } };
  // Submitted on the 1st, asked for changes, edited on the 5th (the guard trigger made it 'pending').
  const edited = await credentialsRoute({ before: { review_status: 'pending', submitted_at: '2026-10-01T10:00:00.000Z', updated_at: '2026-10-05T10:00:00.000Z' }, user });
  assert.equal((await edited.post({ action: 'submit' })).status, 200);
  assert.equal(edited.sent.length, 1, 'the admin hears about the resubmission');
  const never = await credentialsRoute({ before: { review_status: 'pending', submitted_at: null, updated_at: '2026-10-05T10:00:00.000Z' }, user });
  await never.post({ action: 'submit' });
  assert.equal(never.sent.length, 1, 'pending from an edit, never submitted: the first submission is mailed');
  const src = read('src/app/api/coach/credentials/route.ts');
  assert.match(src, /\{ owner_id: user\.id, review_status: 'pending', submitted_at: submittedAt, updated_at: submittedAt \}/, 'one timestamp for both columns');
});

test('6: no coach route or admin rejection writes the badge off itself; the credential write does', () => {
  // Before 2026-10-13 the coach's routes took the badge off with a second, service-role write
  // after the coach's own, one listing table at a time, and said 503 badge_not_cleared when it
  // failed. The database now does it inside the credential write (both happen or neither).
  const creds = stripComments(read('src/app/api/coach/credentials/route.ts'));
  const doc = stripComments(read('src/app/api/coach/credentials/document/route.ts'));
  for (const [name, src] of [['credentials', creds], ['document', doc]]) {
    assert.doesNotMatch(src, /clearListingVerified|badge_not_cleared|from\('(trainers|nutritionists)'\)\s*\.update/, `the ${name} route writes the badge itself`);
  }
  assert.doesNotMatch(creds, /createAdminClient/, 'the credentials route needs no service role at all');
  const actions = stripComments(read('src/app/dashboard/credentials/actions.ts'));
  // Approval and the badge are one transaction (Codex, #2321): a coach edit cannot land between them.
  assert.match(actions, /await admin\.rpc\('approve_provider_credential', \{\s+p_owner: ownerId,\s+p_reviewer: adminUser\.id,/)
  assert.match(actions, /if \(error\) throw error;\n\s+if \(badged === null\) throw new Error\('This coach has no credentials to approve\.'\);/, 'nothing to approve is not announced as verified')
  assert.doesNotMatch(actions, /from\('(trainers|nutritionists)'\)|verified: (true|false)|review_status: 'approved'/, 'no listing write and no approval outside the database function');
  assert.match(stripComments(read('src/app/api/cron/credential-expiry/route.ts')), /badgeCleared = await clearListingVerified\(admin, ownerId\);/, 'the cron clears a badge with no credential write behind it through the one database call');
});

test('6: the credential review is in the admin nav, with a waiting count', () => {
  const layout = read('src/app/dashboard/layout.tsx');
  assert.match(layout, /\{ href: '\/dashboard\/credentials', label: 'Credentials', show: isAdmin, count: waiting\.credentials \}/);
  assert.match(layout, /\{ href: '\/dashboard\/applications', label: 'Applications', show: isAdmin, count: waiting\.applications \}/);
  assert.match(layout, /from\('provider_applications'\)\.select\('id', \{ count: 'exact', head: true \}\)\.eq\('status', 'pending'\)/);
  assert.match(layout, /if \(isAdmin\) \{/, 'counted for admins only');
});

test('6: the cron takes the badge off a verified coach whose insurance has lapsed, and tells them once', async () => {
  process.env.CRON_SECRET = 'cron-test';
  const notes = [];
  const today = new Date().toISOString().slice(0, 10);
  const admin = fakeAdmin({ tables: {
    trainers: [{ id: 1, owner_id: COACH_UID, verified: true }, { id: 2, owner_id: NEW_UID, verified: true }],
    nutritionists: [],
    provider_credentials: [
      { owner_id: COACH_UID, insurance_expires: '2026-01-01', review_status: 'approved', verified_at: 'x' },
      { owner_id: NEW_UID, insurance_expires: '2999-01-01', review_status: 'approved', verified_at: 'y' },
    ],
    provider_licenses: [],
    coach_credential_expiry_reminders: [],
  } });
  const route = await loadRealModule(join(ROOT, 'src/app/api/cron/credential-expiry/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => admin.client }],
      ['@/lib/notify', { createNotification: async (_c, n) => { notes.push(n); return true; } }],
      ['@/lib/coach-verification', verification],
    ]),
  });
  const res = await route.GET(new Request('https://shape.test/api/cron/credential-expiry', { headers: { 'x-cron-secret': 'cron-test' } }));
  const body = await res.json();
  assert.equal(body.unverified, 1, JSON.stringify(body));
  assert.equal(admin.tables.trainers[0].verified, false);
  assert.equal(admin.tables.trainers[1].verified, true, 'current insurance keeps the badge');
  const cred = admin.tables.provider_credentials[0];
  assert.equal(cred.review_status, 'changes_requested');
  assert.equal(cred.verified_at, null);
  assert.match(cred.review_notes, /Insurance expired 2026-01-01/);
  assert.equal(admin.tables.provider_credentials[1].review_status, 'approved');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].userId, COACH_UID);
  assert.equal(notes[0].type, 'credential_expiry');
  assert.ok(today > '2026-01-01');
});

async function cronRun(tables, { fail = [] } = {}) {
  process.env.CRON_SECRET = 'cron-test';
  const notes = [];
  const admin = fakeAdmin({ tables: { nutritionists: [], provider_licenses: [], coach_credential_expiry_reminders: [], ...tables }, fail });
  const route = await loadRealModule(join(ROOT, 'src/app/api/cron/credential-expiry/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => admin.client }],
      ['@/lib/notify', { createNotification: async (_c, n) => { notes.push(n); return true; } }],
      ['@/lib/coach-verification', verification],
    ]),
  });
  const res = await route.GET(new Request('https://shape.test/api/cron/credential-expiry', { headers: { 'x-cron-secret': 'cron-test' } }));
  return { body: await res.json(), admin, notes };
}

test('6: the cron pages past 1,000 verified listings', async () => {
  const owners = Array.from({ length: 1001 }, (_, i) => `owner-${String(i).padStart(4, '0')}`);
  const last = owners[1000];
  const out = await cronRun({
    trainers: owners.map((o, i) => ({ id: i + 1, owner_id: o, verified: true })),
    provider_credentials: [{ owner_id: last, insurance_expires: '2026-01-01', review_status: 'approved' }],
  });
  assert.equal(out.body.unverified, 1, JSON.stringify(out.body));
  assert.equal(out.admin.tables.trainers[1000].verified, false, 'the 1,001st listing is read and unverified');
  assert.ok(stmts(out.admin.calls, 'trainers', 'select').length >= 2, 'read a page at a time');
});

test('6: a credential left approved on lapsed insurance is moved on the next run, badge or no badge; a failed move tells nobody', async () => {
  // A previous run took the badge off but did not move the credential.
  const retry = await cronRun({
    trainers: [{ id: 1, owner_id: COACH_UID, verified: false }],
    provider_credentials: [{ owner_id: COACH_UID, insurance_expires: '2026-01-01', review_status: 'approved' }],
  });
  assert.equal(retry.admin.tables.provider_credentials[0].review_status, 'changes_requested');
  assert.equal(retry.body.unverified, 0, 'no badge was taken off this run');
  assert.equal(retry.notes.length, 1, 'the coach is told once the credential has moved');

  const failing = await cronRun({
    trainers: [{ id: 1, owner_id: COACH_UID, verified: true }],
    provider_credentials: [{ owner_id: COACH_UID, insurance_expires: '2026-01-01', review_status: 'approved' }],
  }, { fail: ['update:provider_credentials'] });
  assert.equal(failing.notes.length, 0, 'a move that failed is not reported to the coach');
  assert.equal(failing.admin.tables.provider_credentials[0].review_status, 'approved', 'left for the next run, which reads approved credentials directly');
});

// ── 7 · the card ─────────────────────────────────────────────────────────────────────────
test('7: every answer is on the card, the date of birth shows with an age, and the counts are the table\'s', () => {
  const src = read('src/app/dashboard/applications/page.tsx');
  assert.doesNotMatch(src, /detailEntries\.slice\(0, 12\)\.map/, 'answers past the twelfth are no longer dropped');
  assert.match(src, /moreDetails\.map\(\(\[key, value\]\) =>/);
  assert.match(src, /const age = dob \? ageFromDob\(dob\) : null;/);
  assert.match(src, /select\('id', \{ count: 'exact', head: true \}\)\.eq\('status', s\)/, 'per-status counts from the table');
  assert.doesNotMatch(src, /\.limit\(100\)/, 'no silent 100-row cap: the list pages');
  assert.match(src, /\.range\(from, from \+ PAGE_SIZE - 1\)/);
});

// ── 8 · account deletion ─────────────────────────────────────────────────────────────────
async function deleteRoute({ user, admin }) {
  process.env.ACCOUNT_DELETE_SECRET = 'test-delete-secret';
  const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  const confirm = await loadRealModule(join(ROOT, 'src/lib/delete-confirm.ts'), { typescript: true });
  admin.deletedUsers = [];
  admin.client.auth.admin.deleteUser = async (uid) => { admin.deletedUsers.push(uid); return { error: null }; };
  const route = await loadRealModule(join(ROOT, 'src/app/api/account/delete/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => user }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/delete-confirm', confirm],
      ['@/lib/supabase/admin', { createAdminClient: () => admin.client }],
    ]),
  });
  const token = confirm.issueDeleteConfirm(user.id).token;
  const res = await route.POST(new Request('https://shape.test/api/account/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmToken: token }) }));
  return { status: res.status, body: await res.json() };
}

test('8: deleting an account erases its coach applications (by its confirmed email) and their files', async () => {
  const mine = { id: APP_ID, email: 'dana@example.invalid' };
  const legacyCase = { id: '77777777-7777-4777-8777-777777777777', email: 'Dana@Example.invalid' };
  const theirs = { id: OTHER_APP, email: 'someone@example.invalid' };
  const admin = fakeAdmin({ tables: {
    provider_applications: [mine, legacyCase, theirs],
    'storage:provider-credentials': [`website/${APP_ID}/resume/1-cv.pdf`, `website/${OTHER_APP}/resume/1-cv.pdf`, `${COACH_UID}/resume/2-cv.pdf`],
  } });
  const out = await deleteRoute({ user: { id: COACH_UID, email: 'Dana@Example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z' }, admin });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.deepEqual(admin.tables.provider_applications.map((r) => r.id), [OTHER_APP], 'both spellings of the email go; another applicant stays');
  assert.deepEqual(admin.tables['storage:provider-credentials'], [`website/${OTHER_APP}/resume/1-cv.pdf`], 'the account folder and its application folder are emptied');
  assert.ok(admin.lists.some((l) => l.bucket === 'provider-credentials' && l.prefix === COACH_UID));
  const [del] = stmts(admin.calls, 'provider_applications', 'delete');
  assert.deepEqual(del.filters, [`id in ${APP_ID},${legacyCase.id}`], 'deleted by the ids found, nothing looser');
});

test('8: an account whose email is unconfirmed erases no application', async () => {
  const admin = fakeAdmin({ tables: { provider_applications: [{ id: APP_ID, email: 'dana@example.invalid' }] } });
  const out = await deleteRoute({ user: { id: COACH_UID, email: 'dana@example.invalid', email_confirmed_at: null }, admin });
  assert.equal(out.status, 200);
  assert.equal(admin.tables.provider_applications.length, 1);
  assert.equal(stmts(admin.calls, 'provider_applications').length, 0);
});

test('8: an application lookup that fails stops the deletion before anything is erased', async () => {
  const admin = fakeAdmin({ tables: { provider_applications: [{ id: APP_ID, email: 'dana@example.invalid' }], user_goals: [{ user_id: COACH_UID }] }, fail: ['select:provider_applications'] });
  const out = await deleteRoute({ user: { id: COACH_UID, email: 'dana@example.invalid', email_confirmed_at: 'x' }, admin });
  assert.equal(out.status, 500);
  assert.equal(admin.tables.user_goals.length, 1, 'no row was purged');
});

test('8: an application row that fails to delete stops the deletion before the account goes, so a retry can still find it', async () => {
  const admin = fakeAdmin({ tables: { provider_applications: [{ id: APP_ID, email: 'dana@example.invalid' }], user_goals: [{ user_id: COACH_UID }] }, fail: ['delete:provider_applications'] });
  const out = await deleteRoute({ user: { id: COACH_UID, email: 'dana@example.invalid', email_confirmed_at: 'x' }, admin });
  assert.equal(out.status, 500);
  assert.match(out.body.error, /application data/);
  assert.deepEqual(admin.deletedUsers, [], 'the auth user (and with it the confirmed email that finds the row) is kept');
  assert.equal(admin.tables.provider_applications.length, 1);
  assert.equal(admin.tables.user_goals.length, 1, 'nothing else was purged either');
});

// ── 9 · the approval link ────────────────────────────────────────────────────────────────
async function confirmRoute(verify) {
  const calls = [];
  const safe = await import(pathToFileURL(join(ROOT, 'src/lib/safe-redirect.mjs')).href);
  const route = await loadRealModule(join(ROOT, 'src/app/auth/confirm/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@supabase/supabase-js', {}],
      ['@/lib/supabase/server', { createClient: async () => ({ auth: { verifyOtp: async (p) => { calls.push(p); return verify(p); } } }) }],
      ['@/lib/safe-redirect.mjs', safe],
    ]),
  });
  const get = async (qs) => {
    const res = await route.GET(new Request(`https://shape.test/auth/confirm?${qs}`));
    return res.headers.get('location');
  };
  return { get, calls };
}

test('9: /auth/confirm verifies the token hash server-side and opens the set-password page', async () => {
  const r = await confirmRoute(() => ({ error: null }));
  assert.equal(await r.get('token_hash=hash%2Fwith%2Bchars&type=invite&next=%2Freset-password'), 'https://shape.test/reset-password');
  assert.deepEqual(r.calls, [{ type: 'invite', token_hash: 'hash/with+chars' }]);
  assert.equal(await r.get('token_hash=abc&type=invite&next=%2F%2Fevil.example'), 'https://shape.test/', 'an off-site next is refused');
  assert.equal(await r.get('token_hash=abc&type=signup&next=%2Freset-password'), 'https://shape.test/forgot-password?link=expired', 'a type it does not issue');
  assert.equal(r.calls.length, 2, 'not verified');
  assert.equal(await r.get('type=invite'), 'https://shape.test/forgot-password?link=expired');

  const bad = await confirmRoute(() => ({ error: { message: 'Token has expired or is invalid' } }));
  assert.equal(await bad.get('token_hash=abc&type=invite&next=%2Freset-password'), 'https://shape.test/forgot-password?link=expired');
  assert.match(read('src/app/forgot-password/page.tsx'), /link === 'expired'/);
});

// ── the migration ────────────────────────────────────────────────────────────────────────
test('the migration adds admin_review in one re-runnable transaction, guarded, and touches no coach table', () => {
  const sql = read('supabase-migrations/2026-10-12-coach-application-review.sql');
  const body = sql.replace(/--[^\n]*/g, '');
  assert.match(body, /^\s*begin;/m);
  assert.match(body, /commit;\s*$/);
  assert.match(body, /alter table public\.provider_applications\s+add column if not exists admin_review jsonb not null default '\{\}'::jsonb;/);
  assert.match(body, /do \$guard\$[^]*raise exception[^]*\$guard\$;/);
  assert.doesNotMatch(body, /alter table (public\.)?(trainers|nutritionists|provider_credentials)\b/i);
  assert.doesNotMatch(body, /create (or replace )?(function|policy)/i);
});
