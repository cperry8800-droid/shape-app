// Nora's admin help-desk lookup (the Ask Nora plan, step 5): src/lib/ai/adminLookup.mjs over a
// recording fake of the service-role client, so a test reads every write and read in order.
// The route's gate (who is offered it, and a call from anyone else) is in
// tests/support-chat-route.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adminLookupAccount, cleanLookupEmail } from '../src/lib/ai/adminLookup.mjs';
import { fakeDb } from './helpers/fake-admin-db.mjs';

const ADMIN = { id: 'admin-1', email: 'boss@shape.test' };
const MEMBER = { id: 'u-1', email: 'priya@example.com', full_name: 'Priya Shah', role: 'trainer', roles: ['trainer'], created_at: '2026-05-02T10:00:00Z', date_of_birth: '1990-01-01', phone: '+1 555 0100' };

// auth.users: the sign-in identity the lookup finds an account by. u-3 changed their email (the
// profile kept the old one); u-4 can sign in but their profile was never created.
const AUTH = [
  { id: 'u-1', email: 'priya@example.com', created_at: '2026-05-02T10:00:00Z', email_confirmed_at: '2026-05-02T10:05:00Z', last_sign_in_at: '2026-10-07T18:00:00Z' },
  { id: 'u-2', email: 'sam@example.com', created_at: '2026-06-01T00:00:00Z', email_confirmed_at: null, last_sign_in_at: null },
  { id: 'u-3', email: 'kai.new@example.com', created_at: '2026-07-01T00:00:00Z', email_confirmed_at: '2026-07-01T00:00:00Z', last_sign_in_at: '2026-10-01T00:00:00Z' },
  { id: 'u-4', email: 'noprofile@example.com', created_at: '2026-08-01T00:00:00Z', email_confirmed_at: '2026-08-01T00:00:00Z', last_sign_in_at: null },
];
const byEmail = ({ p_email }) => AUTH.filter((u) => u.email === p_email).slice(0, 1).map(({ email, ...rest }) => rest);

const world = (extra = {}) => ({
  rpcs: { admin_account_by_email: byEmail },
  tables: {
    profiles: [MEMBER, { id: 'u-2', email: 'sam@example.com', full_name: 'Sam Lee', role: 'client', roles: [], created_at: '2026-06-01T00:00:00Z' }, { id: 'u-3', email: 'kai.old@example.com', full_name: 'Kai Moana', role: 'client', roles: [], created_at: '2026-07-01T00:00:00Z' }],
    platform_subscriptions: [{ client_id: 'u-1', status: 'active', current_period_end: '2026-11-02T00:00:00Z', price_cents: 500 }],
    subscriptions: [{ client_id: 'u-1', provider_role: 'nutritionist', provider_id: 4, status: 'active', current_period_end: '2026-11-01T00:00:00Z', price_cents: 9900 }],
    trainers: [{ id: 7, owner_id: 'u-1', name: 'Priya Strength', stripe_account_id: 'acct_SECRET123', stripe_account_status: 'restricted', verified: true, at_capacity: false, price: 59.99, session_price: 80 }],
    nutritionists: [{ id: 4, owner_id: 'someone', name: 'Dr. Lee Nutrition', stripe_account_id: null, stripe_account_status: 'pending', verified: false, at_capacity: false, price: 99, meal_plan_price: 120 }],
    ...extra,
  },
});
const membership = async (db, id, email) => ({ isMember: true, isCoach: id === 'u-1', isAdmin: false, isKnownMinor: false, _asked: { id, email } });

test('only a whole email address is looked up', () => {
  assert.equal(cleanLookupEmail('  Priya@Example.COM '), 'priya@example.com');
  for (const bad of ['priya', 'priya@', '@example.com', 'a b@c.com', 'x@y', 'p@e.com, q@e.com', 42, null, `${'a'.repeat(250)}@e.com`]) assert.equal(cleanLookupEmail(bad), null, String(bad));
});

test('⚠ logged BEFORE it reads: the row names the admin and the email, then records what was found', async () => {
  const db = fakeDb(world());
  const r = await adminLookupAccount(db, { admin: ADMIN, email: 'Priya@Example.com', surface: 'app', computeMembership: membership });
  assert.equal(r.ok, true);
  assert.equal(db._calls[0].table, 'admin_lookup_log');
  assert.equal(db._calls[0].op, 'insert', 'the first thing it does is write the log');
  assert.deepEqual(db._logs, [{ id: 'log-1', admin_user_id: 'admin-1', admin_email: 'boss@shape.test', query_email: 'priya@example.com', surface: 'app', found: true, target_user_id: 'u-1', sections: ['account', 'membership', 'plan', 'coaching', 'payouts'] }]);
  assert.equal(db._calls.at(-1).op, 'update', 'and the last is completing it');
});

test('a lookup that cannot be logged does not run', async () => {
  const db = fakeDb({ ...world(), fail: ['insert:admin_lookup_log'] });
  const r = await adminLookupAccount(db, { admin: ADMIN, email: 'priya@example.com', computeMembership: membership });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'log_unavailable');
  assert.deepEqual(db._calls.map((c) => c.table), ['admin_lookup_log'], 'nothing but the failed write');
  const bad = fakeDb(world());
  assert.equal((await adminLookupAccount(bad, { admin: ADMIN, email: 'not an email' })).error, 'bad_email');
  assert.equal(bad._calls.length, 0, 'a malformed address is refused before anything, the log included');
});

test('the help-desk set: who, membership, plan, coaches, payout setup; never a Stripe id, a birth date or a phone', async () => {
  const db = fakeDb(world());
  const r = await adminLookupAccount(db, { admin: ADMIN, email: 'priya@example.com', computeMembership: membership });
  assert.deepEqual(r.account, { name: 'Priya Shah', role: 'trainer', roles: ['trainer'], joined: '2026-05-02', emailConfirmed: true, lastSignIn: '2026-10-07', profile: 'present' });
  assert.deepEqual(r.membership, { member: true, coach: true, admin: false, refusedForAge: false });
  assert.deepEqual(r.platformPlan, { status: 'active', until: '2026-11-02', price: '$5.00' });
  assert.deepEqual(r.coaching, [{ role: 'nutritionist', coach: 'Dr. Lee Nutrition', status: 'active', until: '2026-11-01', price: '$99.00' }]);
  assert.deepEqual(r.payouts, [{ role: 'trainer', listing: 'Priya Strength', connected: true, status: 'restricted', verified: true, atCapacity: false, prices: { monthly: '$59.99', session: '$80.00' } }]);
  const text = JSON.stringify(r);
  for (const secret of ['acct_SECRET123', '1990-01-01', '555 0100', 'u-1']) assert.ok(!text.includes(secret), secret);
  assert.deepEqual(db._calls[1], { rpc: 'admin_account_by_email', args: { p_email: 'priya@example.com' } }, 'found by the sign-in identity, right after the log');
  const profileRead = db._calls.find((c) => c.table === 'profiles');
  assert.equal(profileRead.cols, 'full_name, role, roles', 'the profile read itself selects only the help-desk columns');
  assert.deepEqual(profileRead.filters, ['id=u-1'], 'by the identity\'s id, never by the email it holds');
});

test('no account: said, and logged as not found; a part that cannot be read says unavailable, never none', async () => {
  const none = fakeDb(world());
  const r = await adminLookupAccount(none, { admin: ADMIN, email: 'nobody@example.com', computeMembership: membership });
  assert.deepEqual(r, { ok: true, found: false, email: 'nobody@example.com', message: 'No Shape account has this email address.' });
  assert.equal(none._logs[0].found, false);
  assert.equal(none._logs[0].target_user_id, undefined);

  const down = fakeDb({ ...world(), fail: ['platform_subscriptions', 'subscriptions', 'trainers'] });
  const d = await adminLookupAccount(down, { admin: ADMIN, email: 'priya@example.com' });
  assert.equal(d.platformPlan, 'unavailable');
  assert.equal(d.coaching, 'unavailable');
  assert.equal(d.membership, 'unavailable', 'no membership reader, no guess');
  assert.deepEqual(d.payouts, [], 'the nutritionist listings read, and there are none');
  assert.equal(d.payoutsPartial, true, 'the trainer listings could not be read');
  assert.deepEqual(down._logs[0].sections, ['account', 'payouts']);

  const noAuth = fakeDb({ ...world(), fail: ['rpc:admin_account_by_email'] });
  const p = await adminLookupAccount(noAuth, { admin: ADMIN, email: 'priya@example.com' });
  assert.equal(p.error, 'unavailable');
  assert.equal(noAuth._logs[0].found, null, 'logged, with the outcome unknown');
  assert.ok(!noAuth._calls.some((c) => c.table === 'profiles'), 'and no profile email is used in its place');

  const profileDown = await adminLookupAccount(fakeDb({ ...world(), fail: ['profiles'] }), { admin: ADMIN, email: 'priya@example.com' });
  assert.equal(profileDown.found, true);
  assert.deepEqual([profileDown.account.name, profileDown.account.role, profileDown.account.profile], [null, null, 'unavailable']);

  const plain = await adminLookupAccount(fakeDb(world()), { admin: ADMIN, email: 'sam@example.com', computeMembership: membership });
  assert.equal(plain.platformPlan, 'none');
  assert.deepEqual(plain.coaching, []);
  assert.deepEqual(plain.payouts, []);
});

test('⚠ found by the sign-in identity: a changed email and a missing profile are still accounts (Codex, #2264)', async () => {
  const moved = await adminLookupAccount(fakeDb(world()), { admin: ADMIN, email: 'kai.new@example.com' });
  assert.equal(moved.found, true, 'the profile kept the old address; the account has the new one');
  assert.equal(moved.account.name, 'Kai Moana');
  const old = await adminLookupAccount(fakeDb(world()), { admin: ADMIN, email: 'kai.old@example.com' });
  assert.equal(old.found, false, 'an address the account no longer signs in with is not theirs');

  const db = fakeDb(world());
  const bare = await adminLookupAccount(db, { admin: ADMIN, email: 'noprofile@example.com' });
  assert.equal(bare.found, true);
  assert.deepEqual(bare.account, { name: null, role: null, roles: [], joined: '2026-08-01', emailConfirmed: true, lastSignIn: null, profile: 'missing' });
  assert.equal(db._logs[0].target_user_id, 'u-4');

  const unconfirmed = await adminLookupAccount(fakeDb(world()), { admin: ADMIN, email: 'sam@example.com' });
  assert.equal(unconfirmed.account.emailConfirmed, false);
});

test('the migration: RLS on with no policies, so only the service role reads or writes the log', () => {
  const sql = readFileSync(new URL('../supabase-migrations/2026-10-08-admin-lookup-log.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists public\.admin_lookup_log \(/);
  for (const col of ['admin_user_id uuid references auth.users\\(id\\) on delete set null', 'admin_email text not null', 'query_email text not null', 'found boolean', 'target_user_id uuid references auth.users\\(id\\) on delete set null', "sections text\\[\\] not null default '\\{\\}'"]) assert.match(sql, new RegExp(col), col);
  assert.match(sql, /alter table public\.admin_lookup_log enable row level security;/);
  assert.match(sql, /revoke all on public\.admin_lookup_log from anon, authenticated;/);
  assert.doesNotMatch(sql, /create policy/i, 'no policy: nobody reads it through the API');
  // The identity lookup: a definer over auth.users that only the service role can execute.
  assert.match(sql, /create or replace function public\.admin_account_by_email\(p_email text\)/);
  assert.match(sql, /security definer\nset search_path = public, pg_temp/);
  assert.match(sql, /from auth\.users u\n  where u\.email = lower\(btrim\(p_email\)\)/);
  assert.match(sql, /revoke all on function public\.admin_account_by_email\(text\) from public, anon, authenticated;/, '⚠ by name: Supabase grants anon and authenticated directly');
  assert.match(sql, /grant execute on function public\.admin_account_by_email\(text\) to service_role;/);
});
