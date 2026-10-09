// The abuse and integrity half of the 2026-10-08 security review's app code: M1, M2, M3, M4,
// M10 and M11. Each section names the finding, drives the SHIPPING code (loadRealModule
// compiles the real files; stubs stand only where a network or a database would), and pins the
// one rule the finding was about.
//
//   M1   the proxy's rate-limit bucket keyed on the `sub` of ANY Bearer token, unverified: a fresh
//        fake sub per request was a fresh 100-a-minute bucket. The subject is now a verified
//        account (getClaims) or the address.
//   M2   /api/contact had no bot check and echoed the sender's text to whatever address the body
//        named, in a Shape-branded mail. Turnstile on the form; the auto-reply names the subject
//        at most.
//   M3   any account could fill a coach's calendar. Both booking routes refuse the (cap + 1)th open
//        request before the insert; the trigger (#2280) refuses at the database too, and its
//        refusal reads as the member's sentence.
//   M4   any signed-in account could rate any coach. A review needs a subscription or a session
//        that happened: coach_review_allowed answers for the caller, a trigger refuses at the
//        database, the route asks first for a clean 403.
//   M10  the Stripe webhook acknowledged every failure with 200, so a transient failure on the
//        purchase or subscription row (what entitlements are read from) left a charged customer
//        with no entitlement and no retry. Retryable failures are 503 now; permanent ones stay 200.
//   M11  Turnstile failed OPEN on any network error; the visitor cookie carried no issue time, so
//        its 30-day life was browser-side only. Fail closed; sign <id>.<issuedAt>.<mac>, refuse
//        after 30 days.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as M from './helpers/definer-model.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
const read = (p) => fs.readFileSync(join(ROOT, p), 'utf8');
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
const UID = '44444444-4444-4444-8444-444444444444';

// ── M1 ────────────────────────────────────────────────────────────────────────────────────
async function proxyBucket({ cookieUser = null, bearer = null, claims = async () => ({ data: null, error: { message: 'bad' } }) } = {}) {
  const keys = [];
  const mw = await loadRealModule(join(ROOT, 'src/lib/supabase/middleware.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@supabase/ssr', { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: cookieUser } }), getClaims: claims }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }],
      ['@supabase/supabase-js', { createClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) }],
      ['@/lib/membership-core', { computeMembership: async () => ({ isMember: false, isKnownMinor: false }), GATE_STAMP_HEADER: 'x-shape-gate', GATE_STAMP_VALUE: 'ok' }],
      ['@/lib/rate-limit', { checkRateLimit: async (sb, key, max, win) => { keys.push({ key, max, win }); return { allowed: true, remaining: 99, resetSeconds: 60, limit: max }; } }],
      ['@/lib/supabase/cookie-options', { applyShapeCookieOptions: (o) => o }],
    ]),
  });
  const headers = { 'x-forwarded-for': '203.0.113.9' };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const res = await mw.updateSession(new nextServer.NextRequest('https://shape.test/api/contact', { method: 'POST', headers }));
  return { status: res.status, keys };
}

// A forged token the way an attacker makes one: a well-formed JWT whose payload names the sub
// they want, signed by nobody. A decoder that does not check the signature reads `attacker-9`.
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const FORGED = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: 'attacker-9', role: 'authenticated', exp: 4102444800 })}.c2lnbmVkLWJ5LW5vYm9keQ`;
const REAL = `${b64url({ alg: 'ES256', kid: 'k1' })}.${b64url({ sub: 'u-verified', exp: 4102444800 })}.cmVhbC1zaWduYXR1cmU`;

test('M1: an anonymous caller with a forged Bearer token counts on its ADDRESS, a verified token on its account, a cookie session on its account', async () => {
  const forged = await proxyBucket({ bearer: FORGED });
  assert.deepEqual(forged.keys, [{ key: 'api:ip:203.0.113.9', max: 100, win: 60 }], 'no bucket of the caller\'s own choosing: the sub inside the token is never read unverified');
  const verified = await proxyBucket({ bearer: REAL, claims: async (t) => (t === REAL ? { data: { claims: { sub: 'u-verified' } }, error: null } : { data: null, error: { message: 'bad' } }) });
  assert.deepEqual(verified.keys, [{ key: 'api:u:u-verified', max: 100, win: 60 }]);
  const thrown = await proxyBucket({ bearer: FORGED, claims: async () => { throw new Error('jwks unreachable'); } });
  assert.deepEqual(thrown.keys, [{ key: 'api:ip:203.0.113.9', max: 100, win: 60 }], 'a verification that cannot run is an anonymous caller, not a trusted one');
  const cookie = await proxyBucket({ cookieUser: { id: 'u-cookie' } });
  assert.deepEqual(cookie.keys, [{ key: 'api:u:u-cookie', max: 100, win: 60 }]);
  assert.doesNotMatch(read('src/lib/rate-limit.ts'), /jwtSub/, 'the unverified reader is gone');
  assert.doesNotMatch(read('src/lib/supabase/middleware.ts'), /jwtSub/, 'nothing decodes a token without verifying it');
});

// ── M2 ────────────────────────────────────────────────────────────────────────────────────
async function contact(body, { verify = async (token) => token === 'good-token' } = {}) {
  const mails = [];
  const inserted = [];
  const route = await loadRealModule(join(ROOT, 'src/app/api/contact/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/server', { createClient: async () => ({ from: () => ({ insert: async (row) => { inserted.push(row); return { error: null }; } }) }) }],
      ['@/lib/email', { sendEmail: async (m) => { mails.push(m); return true; } }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/turnstile', { verifyTurnstile: async (token) => verify(token) }],
    ]),
  });
  const res = await route.POST(new nextServer.NextRequest('https://shape.test/api/contact', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' }, body: JSON.stringify(body) }));
  // the mails are sent without awaiting; give the microtasks a turn
  await new Promise((r) => setTimeout(r, 10));
  return { status: res.status, body: await res.json(), mails, inserted };
}
const MSG = { firstName: 'Ada', lastName: 'L', email: 'ada@example.invalid', subject: 'Membership', message: 'SECRET-WORDS the sender wrote, up to five thousand characters of them' };

test('M2: the contact form carries the bot check, and the auto-reply never repeats the sender\'s words', async () => {
  const refused = await contact({ ...MSG });
  assert.equal(refused.status, 400, 'no token once the check is on');
  assert.match(refused.body.error, /Captcha check failed/);
  assert.equal(refused.inserted.length, 0);
  const ok = await contact({ ...MSG, captchaToken: 'good-token' });
  assert.equal(ok.status, 200);
  assert.equal(ok.inserted.length, 1);
  const reply = ok.mails.find((m) => m.to === 'ada@example.invalid');
  const team = ok.mails.find((m) => m.to !== 'ada@example.invalid');
  assert.ok(reply && team, 'one mail to the sender, one to the team');
  assert.doesNotMatch(reply.text + reply.html, /SECRET-WORDS/, 'the reply is not a relay');
  assert.match(reply.text, /about "Membership"/, 'it names the subject at most');
  assert.match(team.text, /SECRET-WORDS/, 'the team still gets the message');
  const page = read('public/contact.html');
  assert.match(page, /<div id="turnstile-slot"/, 'the widget has a place on the form');
  assert.match(page, /<script src="\/supabase\.js\?v=\d+"><\/script>/, 'the page loads the site key and the shared controller');
  assert.match(page, /captchaToken: captchaToken,/, 'the token rides with the submission');
  assert.match(page, /if \(captchaOn && !captchaToken\) \{/, 'a form with the check on does not submit without a token');
});

// ── M3 ────────────────────────────────────────────────────────────────────────────────────
const bookingRules = await import(pathToFileURL(join(ROOT, 'public/newdesign/bookingRules.mjs')).href);

test('M3: the cap is one number on both sides, the trigger\'s refusal reads as the member\'s sentence, and the routes read before they write', async () => {
  assert.equal(bookingRules.OPEN_REQUESTS_CAP, 20);
  const mig = read('supabase-migrations/2026-10-08-security-review-access-layer.sql');
  assert.match(mig, /if v_count >= 20 then\n\s+raise exception 'booking_rule:open_requests' using errcode = 'P0001', detail = '20';/, 'the database\'s cap is the same twenty');
  assert.deepEqual(bookingRules.bookingRuleRefusal({ code: 'P0001', message: 'booking_rule:open_requests', details: '20' }),
    { reason: 'open_requests', message: 'You already have 20 open requests with this coach. Wait for a reply before sending more.' });
  assert.equal(bookingRules.bookingRuleRefusal({ message: 'booking_rule:open_requests' }).message, bookingRules.openRequestsMessage(20), 'no detail: the shared constant');
  const sb = await loadRealModule(join(ROOT, 'src/lib/session-booking.ts'), { typescript: true, registry: new Map([['@/lib/owned-provider', { isMissingRelation: () => false }]]) });
  const filters = [];
  const db = (answer) => ({ from: (table) => { const q = { select: (cols, opts) => { filters.push({ table, cols, opts }); return q; }, eq: (c, v) => { filters.push({ eq: [c, v] }); return q; }, gt: (c, v) => { filters.push({ gt: [c, v] }); return answer; } }; return q; } });
  const twenty = await sb.countOpenRequests(db({ count: 20, error: null }), { clientId: UID, role: 'trainer', providerId: 4, nowMs: Date.parse('2026-10-09T12:00:00Z') });
  assert.deepEqual(twenty, { ok: true, count: 20 });
  assert.deepEqual(filters.filter((f) => f.eq).map((f) => f.eq), [['client_id', UID], ['provider_role', 'trainer'], ['provider_id', 4], ['status', 'requested']]);
  assert.deepEqual(filters.find((f) => f.gt).gt, ['scheduled_at', '2026-10-09T12:00:00.000Z'], 'only requests still ahead count');
  assert.equal(filters[0].opts.head, true, 'a count, not the rows');
  assert.deepEqual(await sb.countOpenRequests(db({ count: null, error: { message: 'down' } }), { clientId: UID, role: 'trainer', providerId: 4 }), { ok: false }, 'a failed read is never "none open"');
  for (const file of ['src/app/api/consultation/route.ts', 'src/app/api/sessions/request/route.ts']) {
    const src = read(file);
    const check = src.indexOf('countOpenRequests(');
    const write = src.indexOf(".from('sessions')\n    .insert(");
    assert.ok(check > 0 && write > check, `${file}: the count comes before the insert`);
    assert.match(src, /if \(open\.count >= OPEN_REQUESTS_CAP\) \{\n\s+return NextResponse\.json\(\{ error: openRequestsMessage\(OPEN_REQUESTS_CAP\), code: 'open_requests' \}, \{ status: 409 \}\);/, `${file}: a clean 409`);
    assert.match(src, /if \(!open\.ok\) \{\n\s+return NextResponse\.json\(\{ error: "We couldn't check your open requests just now\. Please try again\."/, `${file}: a failed read writes nothing`);
  }
});

// ── M4 ────────────────────────────────────────────────────────────────────────────────────
const DIR = join(ROOT, 'supabase-migrations');
const M4_FILE = '2026-10-09-coach-reviews-require-relationship.sql';
let realModel;
const real = () => (realModel ??= M.replayDir(DIR));

test('M4: coach_review_allowed answers for the caller alone, the trigger refuses at the database, and the migration reads the same relationship on both paths', () => {
  const fn = [...real().fns.values()].find((f) => f.schema === 'public' && f.name === 'coach_review_allowed');
  assert.ok(fn, 'the function is in the model');
  assert.equal(fn.definer, true);
  assert.equal(M.pgTempPinned(fn), true);
  const d = M.describeFunction(fn);
  assert.equal(d.anon, false);
  assert.equal(d.authenticated, true);
  assert.equal(M.bodyUsesAuthUid(fn), true, 'the caller is auth.uid(), never an argument');
  const trg = [...real().fns.values()].find((f) => f.schema === 'public' && f.name === 'coach_reviews_require_relationship');
  assert.ok(trg && trg.trigger && trg.definer && M.pgTempPinned(trg));
  const sql = read(`supabase-migrations/${M4_FILE}`);
  const slugExpr = "regexp_replace(regexp_replace(lower(t.name), '[^a-z0-9]+', '-', 'g'), '(^-|-$)', '', 'g') = p_slug";
  assert.ok(sql.includes(slugExpr) && sql.includes(slugExpr.replace('t.name', 'n.name')), 'the slug rule is the owner trigger\'s, for both kinds');
  assert.match(sql, /and s\.status not in \('pending', 'incomplete'\)/, 'a subscription that never paid is not a relationship');
  assert.match(sql, /and x\.status in \('confirmed', 'completed'\)\n\s+and x\.scheduled_at < now\(\)/, 'a session counts once it happened');
  assert.match(sql, /create trigger coach_reviews_require_relationship\n\s+before insert or update on public\.coach_reviews/);
  assert.match(sql, /if not public\.coach_review_allowed\(new\.coach_slug, new\.coach_kind\) then\n\s+raise exception 'review_requires_relationship' using errcode = '42501';/);
  assert.match(sql, /and new\.coach_slug is not distinct from old\.coach_slug\n\s+and new\.coach_kind is not distinct from old\.coach_kind then\n\s+return new;/, 'a rating edit is not re-checked; a re-point is');
  assert.match(sql, /\nbegin;\nset local lock_timeout = '10s';\n/);
  assert.match(sql, /\$guard\$;\n\ncommit;\n$/);
});

async function review(body, { allowed = { data: true, error: null }, write = { data: { id: 'r-1', rating: 9, body: 'x', author_name: 'A', created_at: '2026-10-09' }, error: null } } = {}) {
  const calls = { rpc: [], writes: 0 };
  const client = {
    rpc: async (name, args) => { calls.rpc.push({ name, args }); return allowed; },
    from: (table) => {
      if (table === 'profiles') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { full_name: 'Ada' } }) }) }) };
      return { upsert: () => ({ select: () => ({ single: async () => { calls.writes += 1; return write; } }) }), insert: () => ({ select: () => ({ single: async () => { calls.writes += 1; return write; } }) }) };
    },
  };
  const route = await loadRealModule(join(ROOT, 'src/app/api/coaches/reviews/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => ({ id: UID, email: 'a@example.invalid', user_metadata: {} }), clientForRequest: async () => client }],
      ['@/lib/request-utils', requestUtils],
    ]),
  });
  const res = await route.POST(new Request('https://shape.test/api/coaches/reviews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json(), calls };
}

test('M4: the route asks the database about the relationship before it writes, and refuses cleanly', async () => {
  const ok = await review({ coach: 'coach-t', kind: 'trainer', rating: 9, text: 'Great' });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.calls.rpc, [{ name: 'coach_review_allowed', args: { p_slug: 'coach-t', p_kind: 'trainer' } }]);
  assert.equal(ok.calls.writes, 1);
  const no = await review({ coach: 'coach-t', kind: 'trainer', rating: 1 }, { allowed: { data: false, error: null } });
  assert.equal(no.status, 403);
  assert.equal(no.body.code, 'relationship_required');
  assert.equal(no.calls.writes, 0, 'nothing written');
  const down = await review({ coach: 'coach-t', kind: 'trainer', rating: 1 }, { allowed: { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } } });
  assert.equal(down.status, 503, 'a database without the function refuses, never publishes unchecked');
  assert.equal(down.calls.writes, 0);
  const raced = await review({ coach: 'coach-t', kind: 'trainer', rating: 1 }, { write: { data: null, error: { code: '42501', message: 'review_requires_relationship' } } });
  assert.equal(raced.status, 403, 'the trigger\'s own refusal reads as the same 403');
});

// ── M10 ───────────────────────────────────────────────────────────────────────────────────
const retryable = await loadRealModule(join(ROOT, 'src/lib/db-retryable.ts'), { typescript: true });

test('M10: what Stripe should retry, and what it should not', () => {
  const yes = [
    { code: 'PGRST000', message: 'Could not connect' }, { code: 'PGRST001' }, { code: 'PGRST002' }, { code: 'PGRST003', message: 'timed out' },
    { code: '08006', message: 'connection failure' }, { code: '53300', message: 'too many connections' }, { code: '57014', message: 'canceling statement due to statement timeout' },
    { code: '40P01', message: 'deadlock detected' }, { code: '40001', message: 'could not serialize access' },
    { status: 503, message: 'Service Unavailable' }, { name: 'AbortError', message: 'The operation was aborted' }, new TypeError('fetch failed'),
    { message: 'read ECONNRESET' }, { message: 'connect ETIMEDOUT 1.2.3.4:443' }, { message: 'outer', cause: { code: 'PGRST003' } },
  ];
  for (const e of yes) assert.equal(retryable.isRetryableDbError(e), true, JSON.stringify(e.message ?? e.code ?? e.name));
  const no = [
    null, undefined, 'string', 42, {}, { code: '23505', message: 'duplicate key value violates unique constraint' }, { code: '42703', message: 'column does not exist' },
    { code: 'PGRST204', message: "Could not find the 'x' column" }, { code: '22023', message: 'invalid parameter' }, { code: 'P0001', message: 'insufficient_points' },
    { code: '42501', message: 'permission denied' }, { status: 400 }, { status: 404 }, { message: 'JSON parse error' }, { message: 'outer', cause: { code: '23505' } },
  ];
  for (const e of no) assert.equal(retryable.isRetryableDbError(e), false, JSON.stringify(e && (e.message ?? e.code ?? e.name)));
  assert.equal(retryable.isRetryableDbError({ cause: { cause: { cause: { cause: { cause: { code: 'PGRST000' } } } } } }), false, 'a cause chain is followed a few steps, not for ever');
});

function scriptedAdmin({ tables = {}, upsertError = null, rpc = async () => ({ data: null, error: null }) } = {}) {
  const from = (table) => {
    const rows = tables[table] ?? [];
    const q = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'lt', 'gt', 'order', 'limit', 'not', 'is', 'or', 'filter']) q[m] = () => q;
    q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    q.single = async () => ({ data: rows[0] ?? null, error: null });
    q.upsert = () => ({ ...q, then: (res, rej) => Promise.resolve({ data: null, error: table === 'one_time_purchases' ? upsertError : null }).then(res, rej) });
    q.update = () => q;
    q.insert = () => q;
    q.then = (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej);
    return q;
  };
  return { from, rpc };
}

async function webhook(event, { upsertError = null, retrieve = async () => ({ application_fee_amount: 0 }) } = {}) {
  const platformFee = await import(pathToFileURL(join(ROOT, 'src/lib/platform-fee.mjs')).href);
  const coachOrigin = await import(pathToFileURL(join(ROOT, 'src/lib/coach-origin.mjs')).href);
  const admin = scriptedAdmin({ tables: { trainers: [{ id: 4, owner_id: null }] }, upsertError });
  const origError = console.error;
  console.error = () => {};
  try {
    const route = await loadRealModule(join(ROOT, 'src/app/api/stripe/webhook/route.ts'), {
      typescript: true,
      registry: new Map([
        ['next/server', nextServer],
        ['@/lib/stripe', { stripe: { webhooks: { constructEvent: (raw) => JSON.parse(raw) }, paymentIntents: { retrieve } } }],
        ['@/lib/supabase/admin', { createAdminClient: () => admin }],
        ['@/lib/notify', { createNotification: async () => true }],
        ['@/lib/platform-fee', platformFee],
        ['@/lib/coach-origin.mjs', coachOrigin],
        ['@/lib/db-retryable', retryable],
      ]),
    });
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    const res = await route.POST(new Request('https://shape.test/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=x' }, body: JSON.stringify(event) }));
    return { status: res.status, body: await res.json() };
  } finally {
    console.error = origError;
  }
}
const purchase = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', mode: 'payment', payment_intent: 'pi_1', metadata: { client_id: UID, provider_id: '4', provider_role: 'trainer', price_cents: '18000', gross_price_cents: '18000', kind: 'booking', item_name: 'Session', origin: 'marketplace', fee_bps: '1500' } } } };

test('M10: a transient failure on the purchase row is 503 (Stripe retries); a permanent one and a clean run are 200', async () => {
  const transient = await webhook(purchase, { upsertError: { code: '57014', message: 'canceling statement due to statement timeout' } });
  assert.equal(transient.status, 503);
  assert.deepEqual(transient.body, { received: false, retry: true, error: 'purchase record not written' });
  const permanent = await webhook(purchase, { upsertError: { code: '23514', message: 'new row violates check constraint' } });
  assert.equal(permanent.status, 200, 'acknowledged and logged, as before: it would fail the same way tomorrow');
  const clean = await webhook(purchase);
  assert.equal(clean.status, 200);
  assert.deepEqual(clean.body, { received: true });
  const network = await webhook(purchase, { retrieve: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(network.status, 503, 'a thrown network failure inside the handler is retried too');
  assert.equal(network.body.retry, true);
  const bug = await webhook(purchase, { retrieve: async () => { throw new TypeError("Cannot read properties of undefined (reading 'x')"); } });
  assert.equal(bug.status, 200, 'a bug is not a reason to retry for three days');
});

// ── M11 ───────────────────────────────────────────────────────────────────────────────────
test('M11: Turnstile fails closed once the secret is set', async () => {
  const mod = await loadRealModule(join(ROOT, 'src/lib/turnstile.ts'), { typescript: true });
  const origFetch = globalThis.fetch;
  const origSecret = process.env.TURNSTILE_SECRET_KEY;
  try {
    delete process.env.TURNSTILE_SECRET_KEY;
    assert.equal(await mod.verifyTurnstile('anything'), true, 'not configured: a no-op');
    process.env.TURNSTILE_SECRET_KEY = 'sk-test';
    assert.equal(await mod.verifyTurnstile(''), false, 'no token');
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    assert.equal(await mod.verifyTurnstile('tok', '203.0.113.9'), false, 'Cloudflare unreachable: closed, not open');
    // A 5xx whose body happens to read `success: true` (a proxy or captive-portal page in the way)
    // is still a failed check: the status is read before the body is believed.
    globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => ({ success: true }) });
    assert.equal(await mod.verifyTurnstile('tok'), false, 'a 5xx from Cloudflare: closed, whatever its body says');
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: false }) });
    assert.equal(await mod.verifyTurnstile('tok'), false);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true }) });
    assert.equal(await mod.verifyTurnstile('tok'), true);
  } finally {
    globalThis.fetch = origFetch;
    if (origSecret == null) delete process.env.TURNSTILE_SECRET_KEY; else process.env.TURNSTILE_SECRET_KEY = origSecret;
  }
});

test('M11: the visitor cookie signs its issue time and dies after 30 days on the server, not only in the browser', async () => {
  const limits = await loadRealModule(join(ROOT, 'src/lib/ai/noraLimits.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/rate-limit', { checkRateLimit: async () => ({ allowed: true, remaining: 1, resetSeconds: 0, limit: 1 }) }],
      ['@/lib/turnstile', { turnstileEnabled: () => false, verifyTurnstile: async () => true }],
    ]),
  });
  const origSecret = process.env.RATE_LIMIT_SECRET;
  try {
    process.env.RATE_LIMIT_SECRET = 'test-secret';
    const id = '9f1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';
    const at = Date.parse('2026-10-09T12:00:00Z');
    const value = await limits.signVisitor(id, at);
    assert.match(value, new RegExp(`^${id}\\.${at}\\.[0-9a-f]{64}$`), '<id>.<issuedAt>.<mac>');
    assert.equal(await limits.readVisitor(value, at + 1000), id);
    assert.equal(await limits.readVisitor(value, at + 29 * 86400 * 1000), id, 'day 29 still proves it');
    assert.equal(await limits.readVisitor(value, at + 31 * 86400 * 1000), null, 'day 31 does not: the life is checked here, not only by Max-Age');
    assert.equal(await limits.readVisitor(value, at - 10 * 60 * 1000), null, 'a cookie from the future is forged');
    const [vid, vat, vmac] = value.split('.');
    assert.equal(await limits.readVisitor(`${vid}.${vat + 1}.${vmac}`, at + 1000), null, 'a changed issue time fails the signature');
    assert.equal(await limits.readVisitor(`${vid}.${vmac}`, at + 1000), null, 'the old <id>.<mac> form is a new visitor: one bot check, then a fresh cookie');
    assert.equal(await limits.readVisitor(`${vid}.${vat}.${vmac.slice(0, -1)}0`, at + 1000), null, 'a tampered mac');
    assert.equal(await limits.readVisitor(vid, at + 1000), null, 'a bare id');
    delete process.env.RATE_LIMIT_SECRET;
    const unsigned = await limits.signVisitor(id, at);
    assert.equal(unsigned, `${id}.${at}`, 'no secret (a local build): unsigned, but still dated');
    assert.equal(await limits.readVisitor(unsigned, at + 1000), id);
    assert.equal(await limits.readVisitor(unsigned, at + 31 * 86400 * 1000), null, 'dated even when unsigned');
  } finally {
    if (origSecret == null) delete process.env.RATE_LIMIT_SECRET; else process.env.RATE_LIMIT_SECRET = origSecret;
  }
});
