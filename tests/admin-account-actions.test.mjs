// The admin console's account actions (PR 2): the rules (src/lib/admin-account-actions.mjs), the
// shipping server actions (src/app/admin/accounts/actions.ts) against a write-capable fake of the
// service-role client, Supabase Auth's admin API and Stripe, the account and requests pages, and
// the migration behind them. The SQL's behaviour was probed on a PostgreSQL 16 replica.
// Run: node --test tests/admin-account-actions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const rules = await imp('src/lib/admin-account-actions.mjs');
const levels = await imp('src/lib/staff-levels.mjs');
const activity = await imp('src/lib/admin-activity.mjs');
const overview = await imp('src/lib/admin-overview.mjs');
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
// The pages are compiled with the classic JSX runtime, which reads React off the global scope.
globalThis.React = React;

const OWNER = 'cperry8800@gmail.com';
const BO = '11111111-1111-4111-8111-111111111111';
const STAFFER = '22222222-2222-4222-8222-222222222222';
const BOSS = '33333333-3333-4333-8333-333333333333';
const ACTOR = '44444444-4444-4444-8444-444444444444';
const OWNER_ID = '99999999-9999-4999-8999-999999999999';
const REQ = '55555555-5555-4555-8555-555555555555';
const SUPPORT = { id: ACTOR, email: 'sup@shape.test', level: 'support' };
const ADMIN = { id: ACTOR, email: 'adm@shape.test', level: 'admin' };
const OWNER_STAFF = { id: OWNER_ID, email: OWNER, level: 'owner' };

// ── The rules ─────────────────────────────────────────────────────────────────────────────
test('rules: Support freezes and works requests; suspending and removing are Admin and up', () => {
  const can = rules.canDoAccountAction;
  for (const a of ['view', 'freeze', 'unfreeze', 'handle_request']) {
    assert.equal(can('support', a), true, a);
    assert.equal(can('analyst', a), false, `an analyst never ${a}`);
  }
  for (const a of ['suspend_listing', 'lift_listing', 'remove']) {
    assert.equal(can('support', a), false, `support never ${a}`);
    assert.equal(can('admin', a), true, a);
    assert.equal(can('owner', a), true, a);
  }
  assert.equal(can('owner', 'drop_everything'), false, 'an unknown action is nobody’s');
  assert.equal(can(null, 'view'), false);
});

test('rules: nobody acts on themselves or an owner, and only an owner acts on staff', () => {
  const r = (o) => rules.accountRefusal({ actorId: ACTOR, actorLevel: 'admin', targetId: BO, targetEmail: 'bo@x.com', ownerEmails: [OWNER], ...o });
  assert.equal(r({}), '');
  assert.equal(r({ targetId: ACTOR }), 'self');
  assert.equal(r({ targetId: null }), 'self', 'no target is never acted on');
  assert.equal(r({ targetEmail: ' CPerry8800@Gmail.com ' }), 'owner', 'an owner in any case');
  assert.equal(r({ targetEmail: OWNER, actorLevel: 'owner' }), 'owner', 'even by another owner');
  assert.equal(r({ targetStaffLevel: 'analyst' }), 'staff', 'an admin cannot freeze an analyst');
  assert.equal(r({ targetStaffLevel: 'admin', actorLevel: 'support' }), 'staff');
  assert.equal(r({ targetStaffLevel: 'admin', actorLevel: 'owner' }), '', 'an owner can');
});

test('rules: a reason, a note, an outcome and a removal confirmation are read strictly', () => {
  assert.equal(rules.cleanReason('  fake\n\n reviews\t '), 'fake reviews');
  assert.equal(rules.cleanReason('ab'), '', 'too short to say anything');
  assert.equal(rules.cleanReason(null), '');
  assert.equal(rules.cleanReason('x'.repeat(900)).length, 500);
  assert.equal(rules.cleanNote('  ok\u0007 done '), 'ok done');
  assert.equal(rules.cleanNote(''), '', 'a note is optional');
  assert.equal(rules.parseRequestOutcome(' Done '), 'done');
  for (const bad of ['open', '', 'deleted', null]) assert.equal(rules.parseRequestOutcome(bad), '', String(bad));
  assert.equal(rules.confirmsRemoval(' Bo@X.com ', { id: BO, email: 'bo@x.com' }), true);
  assert.equal(rules.confirmsRemoval('bo@x.co', { id: BO, email: 'bo@x.com' }), false);
  assert.equal(rules.confirmsRemoval(BO, { id: BO, email: 'bo@x.com' }), false, 'the email, when there is one');
  assert.equal(rules.confirmsRemoval(BO.toUpperCase(), { id: BO, email: null }), true, 'the id when there is no email');
  assert.equal(rules.confirmsRemoval('', { id: '', email: '' }), false, 'nothing typed confirms nothing');
});

test('rules: a removal cancels each subscription that can still charge, once', () => {
  const ids = rules.subscriptionsToCancel([
    { stripe_subscription_id: 'sub_a', status: 'active' },
    { stripe_subscription_id: 'sub_a', status: 'active' },
    { stripe_subscription_id: 'sub_t', status: 'trialing' },
    { stripe_subscription_id: 'sub_p', status: 'past_due' },
    { stripe_subscription_id: 'sub_u', status: 'unpaid' },
    { stripe_subscription_id: 'sub_i', status: 'incomplete' },
    { stripe_subscription_id: 'sub_z', status: 'paused' },
    { stripe_subscription_id: 'sub_c', status: 'canceled' },
    { stripe_subscription_id: 'sub_x', status: 'incomplete_expired' },
    { stripe_subscription_id: ' ', status: 'active' },
    { stripe_subscription_id: null, status: 'active' },
  ]);
  assert.deepEqual(ids, ['sub_a', 'sub_t', 'sub_p', 'sub_u', 'sub_i', 'sub_z']);
  assert.deepEqual(rules.subscriptionsToCancel(null), []);
});

function fakeStripe(outcomes = {}) {
  const asked = [];
  return {
    asked,
    subscriptions: {
      cancel: async (id) => {
        asked.push(`cancel:${id}`);
        const o = outcomes[id];
        if (o === 'missing') throw Object.assign(new Error('No such subscription'), { code: 'resource_missing' });
        if (o === 'ended' || o === 'error' || o === 'unreadable') throw new Error('stripe says no');
        return { id, status: 'canceled' };
      },
      retrieve: async (id) => {
        asked.push(`retrieve:${id}`);
        if (outcomes[id] === 'unreadable') throw new Error('down');
        return { id, status: outcomes[id] === 'ended' ? 'canceled' : 'active' };
      },
    },
  };
}

test('rules: cancelling counts a subscription Stripe never had, or already ended, as done', async () => {
  const s = fakeStripe({ sub_m: 'missing', sub_e: 'ended', sub_f: 'error', sub_u: 'unreadable' });
  const out = await rules.cancelSubscriptions(s, ['sub_ok', 'sub_m', 'sub_e', 'sub_f', 'sub_u']);
  assert.deepEqual(out.cancelled, ['sub_ok']);
  assert.deepEqual(out.failed, ['sub_f', 'sub_u'], 'still charging, or not known to have ended: failed');
  assert.ok(!s.asked.includes('retrieve:sub_m'), 'a missing one is not looked up again');
  assert.deepEqual(await rules.cancelSubscriptions(s, []), { cancelled: [], failed: [] });
});

// ── A write-capable fake of the service-role client, with Auth's admin API ────────────────
function world({ users = {}, tables = {}, rpcs = {}, fail = [], beforeUpdate } = {}) {
  const t = { admin_activity_log: [], staff_members: [], account_freezes: [], trainers: [], nutritionists: [], platform_subscriptions: [], subscriptions: [], account_action_requests: [], ...tables };
  for (const k of Object.keys(t)) t[k] = t[k].map((r) => ({ ...r }));
  const calls = [];
  const rpcArgs = {};
  let seq = 0;
  const db = {
    tables: t,
    calls,
    rpcArgs,
    users,
    auth: {
      admin: {
        getUserById: async (id) => {
          calls.push('auth:get');
          if (fail.includes('auth:get')) return { data: { user: null }, error: { status: 500, message: 'down' } };
          const u = users[id];
          return u ? { data: { user: { id, ...u } }, error: null } : { data: { user: null }, error: { status: 404, message: 'User not found' } };
        },
        updateUserById: async (id, attrs) => {
          calls.push(`ban:${attrs.ban_duration}`);
          if (fail.includes(`ban:${attrs.ban_duration}`)) return { data: { user: null }, error: { message: 'fake' } };
          if (users[id]) users[id].banned = attrs.ban_duration !== 'none';
          return { data: { user: { id } }, error: null };
        },
      },
    },
    rpc: async (name, args) => {
      calls.push(`rpc:${name}`);
      rpcArgs[name] = args;
      if (fail.includes(`rpc:${name}`)) return { data: null, error: { code: 'XX000', message: 'fake' } };
      return { data: rpcs[name] ? rpcs[name](args) : null, error: null };
    },
    from(table) {
      const st = { op: 'select', payload: null, filters: [], single: false, returning: false };
      const exec = () => {
        calls.push(`${st.op}:${table}`);
        if (fail.includes(`${st.op}:${table}`)) return { data: null, error: { code: 'XX000', message: 'fake failure' } };
        const rows = (t[table] ||= []);
        const match = (r) => st.filters.every((f) => f(r));
        if (st.op === 'insert') {
          const row = { id: `${table}-${++seq}`, ...st.payload };
          rows.push(row);
          return { data: st.single ? { id: row.id } : [row], error: null };
        }
        if (st.op === 'update') {
          if (beforeUpdate) beforeUpdate(table, t);
          const hit = rows.filter(match);
          for (const r of hit) Object.assign(r, st.payload);
          return { data: st.returning ? hit.map((r) => ({ id: r.id })) : null, error: null };
        }
        const found = rows.filter(match);
        return { data: st.single ? found[0] ?? null : found, error: null };
      };
      const chain = {
        select() { if (st.op !== 'select') st.returning = true; return chain; },
        insert(p) { st.op = 'insert'; st.payload = p; return chain; },
        update(p) { st.op = 'update'; st.payload = p; return chain; },
        eq(c, v) { st.filters.push((r) => r[c] === v); return chain; },
        is(c, v) { st.filters.push((r) => (r[c] ?? null) === v); return chain; },
        in(c, vs) { st.filters.push((r) => vs.includes(r[c])); return chain; },
        not(c, op, v) { st.filters.push((r) => (r[c] ?? null) !== v); return chain; },
        order() { return chain; },
        single() { st.single = true; return chain; },
        maybeSingle() { st.single = true; return chain; },
        then(res, rej) { return Promise.resolve(exec()).then(res, rej); },
      };
      return chain;
    },
  };
  return db;
}

const redirectTo = (to) => { const e = new Error('REDIRECT'); e.to = to; throw e; };
const people = () => ({
  [BO]: { email: 'bo@x.com', email_confirmed_at: '2026-10-01T00:00:00Z' },
  [STAFFER]: { email: 'staffer@x.com', email_confirmed_at: '2026-10-01T00:00:00Z' },
  [OWNER_ID]: { email: OWNER, email_confirmed_at: '2026-10-01T00:00:00Z' },
  [ACTOR]: { email: 'me@shape.test', email_confirmed_at: '2026-10-01T00:00:00Z' },
  [BOSS]: { email: 'ops@shape.test', email_confirmed_at: '2026-10-01T00:00:00Z' },
});

async function loadActions(db, staff, { stripe = fakeStripe(), erase } = {}) {
  const erasures = [];
  const actions = await loadRealModule(join(ROOT, 'src/app/admin/accounts/actions.ts'), {
    typescript: true,
    registry: new Map([
      ['next/cache', { revalidatePath: () => {} }],
      ['next/navigation', { redirect: redirectTo }],
      ['@/lib/supabase/admin', { createAdminClient: () => db }],
      ['@/lib/admin-access', {
        getOwnerEmails: () => [OWNER],
        getEnvAdminEmails: () => ['ops@shape.test'],
        requireStaff: async (min) => { if (!levels.atLeast(staff.level, min)) throw new Error('Admin access required.'); return staff; },
      }],
      ['@/lib/staff-levels.mjs', levels],
      ['@/lib/admin-activity.mjs', activity],
      ['@/lib/admin-account-actions.mjs', rules],
      ['@/lib/account-erasure', {
        eraseAccount: async (_db, user, opts) => {
          db.calls.push('erase');
          erasures.push({ user, opts });
          return erase ? erase(user) : { ok: true, tablesPurged: 3, bucketsPurged: 2 };
        },
      }],
      ['@/lib/stripe', { stripe }],
    ]),
  });
  const run = async (fn, fields) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    try { await actions[fn](fd); return null; } catch (e) { if (e.to) return e.to; throw e; }
  };
  return { run, erasures, stripe };
}

const page = (id) => `/admin/accounts/${id}`;
const logRows = (db) => db.tables.admin_activity_log;
const changed = (db) => db.calls.filter((c) => /^(insert|update|ban|rpc|erase)/.test(c));

// ── Freeze and unfreeze ───────────────────────────────────────────────────────────────────
test('freeze: logged first, then the ban, then the records in one call, then marked done', async () => {
  const db = world({ users: people(), rpcs: { admin_freeze_account: () => ({ status: 'frozen', listings: 1, sessions: 2 }) } });
  const a = await loadActions(db, SUPPORT);
  assert.equal(await a.run('freezeAccount', { user_id: BO, reason: '  abusive  messages ' }), `${page(BO)}?updated=frozen`);
  assert.deepEqual(changed(db), ['insert:admin_activity_log', 'ban:876000h', 'rpc:admin_freeze_account', 'update:admin_activity_log']);
  assert.deepEqual(db.rpcArgs.admin_freeze_account, { p_user: BO, p_reason: 'abusive messages', p_by: ACTOR, p_by_email: 'sup@shape.test' });
  assert.equal(logRows(db)[0].action, 'account.freeze');
  assert.equal(logRows(db)[0].target_email, 'bo@x.com');
  assert.deepEqual(logRows(db)[0].details, { reason: 'abusive messages' });
  assert.equal(logRows(db)[0].outcome, 'done');
  assert.equal(db.users[BO].banned, true);
});

test('freeze: a failed record lifts the ban again, so nobody is locked out with no record of why', async () => {
  const db = world({ users: people(), fail: ['rpc:admin_freeze_account'] });
  const a = await loadActions(db, SUPPORT);
  assert.equal(await a.run('freezeAccount', { user_id: BO, reason: 'abuse' }), `${page(BO)}?error=freeze_failed`);
  assert.deepEqual(changed(db), ['insert:admin_activity_log', 'ban:876000h', 'rpc:admin_freeze_account', 'ban:none', 'update:admin_activity_log']);
  assert.equal(db.users[BO].banned, false);
  assert.equal(logRows(db)[0].outcome, 'failed');
  // Codex, #2326: a rollback that fails too is said, not reported as "nothing changed".
  const split = world({ users: people(), fail: ['rpc:admin_freeze_account', 'ban:none'] });
  assert.equal(await (await loadActions(split, SUPPORT)).run('freezeAccount', { user_id: BO, reason: 'abuse' }), `${page(BO)}?error=freeze_split`);
  assert.equal(split.users[BO].banned, true);
  assert.equal(logRows(split)[0].outcome, 'failed');
  const missing = world({ users: people(), rpcs: { admin_freeze_account: () => ({ status: 'missing' }) } });
  await (await loadActions(missing, SUPPORT)).run('freezeAccount', { user_id: BO, reason: 'abuse' });
  assert.ok(changed(missing).includes('ban:none'), 'an answer that is not a freeze is a failure too');
});

test('freeze: a ban that fails changes nothing else; a freeze that lands first is not undone', async () => {
  const db = world({ users: people(), fail: ['ban:876000h'] });
  const a = await loadActions(db, SUPPORT);
  assert.equal(await a.run('freezeAccount', { user_id: BO, reason: 'abuse' }), `${page(BO)}?error=freeze_failed`);
  assert.deepEqual(changed(db), ['insert:admin_activity_log', 'ban:876000h', 'update:admin_activity_log']);
  assert.equal(logRows(db)[0].outcome, 'failed');

  const raced = world({ users: people(), rpcs: { admin_freeze_account: () => ({ status: 'already' }) } });
  const b = await loadActions(raced, SUPPORT);
  assert.equal(await b.run('freezeAccount', { user_id: BO, reason: 'abuse' }), `${page(BO)}?updated=already_frozen`);
  assert.ok(!changed(raced).includes('ban:none'), 'another staff member’s freeze keeps its ban');
  assert.equal(logRows(raced)[0].outcome, 'failed', 'this one changed nothing');
});

test('freeze: refusals, a missing reason, an open freeze and a failed log write nothing', async () => {
  const cases = [
    [SUPPORT, { user_id: OWNER_ID, reason: 'abuse' }, 'refused_owner', {}],
    [{ ...SUPPORT, id: BO }, { user_id: BO, reason: 'abuse' }, 'refused_self', {}],
    [ADMIN, { user_id: STAFFER, reason: 'abuse' }, 'refused_staff', { tables: { staff_members: [{ user_id: STAFFER, level: 'analyst' }] } }],
    [ADMIN, { user_id: BOSS, reason: 'abuse' }, 'refused_staff', {}],
    [SUPPORT, { user_id: BO, reason: 'no' }, 'reason', {}],
    [SUPPORT, { user_id: '00000000-0000-4000-8000-00000000000f', reason: 'abuse' }, 'no_account', {}],
    [SUPPORT, { user_id: BO, reason: 'abuse' }, 'lookup_failed', { fail: ['auth:get'] }],
    [SUPPORT, { user_id: BO, reason: 'abuse' }, 'lookup_failed', { fail: ['select:staff_members'] }],
    [SUPPORT, { user_id: BO, reason: 'abuse' }, 'not_logged', { fail: ['insert:admin_activity_log'] }],
  ];
  for (const [staff, fields, error, opts] of cases) {
    const db = world({ users: people(), ...opts });
    const a = await loadActions(db, staff);
    const to = await a.run('freezeAccount', fields);
    assert.equal(to, `${page(fields.user_id)}?error=${error}`, error);
    assert.deepEqual(changed(db).filter((c) => c !== 'insert:admin_activity_log'), [], `${error}: nothing changed`);
  }
  const open = world({ users: people(), tables: { account_freezes: [{ id: 'f1', user_id: BO, unfrozen_at: null }] } });
  assert.equal(await (await loadActions(open, SUPPORT)).run('freezeAccount', { user_id: BO, reason: 'abuse' }), `${page(BO)}?updated=already_frozen`);
  assert.deepEqual(changed(open), []);
  assert.equal(await (await loadActions(world(), SUPPORT)).run('freezeAccount', { user_id: 'not-an-id', reason: 'abuse' }), '/admin/members?error=missing_account');
  await assert.rejects((await loadActions(world({ users: people() }), { ...SUPPORT, level: 'analyst' })).run('freezeAccount', { user_id: BO, reason: 'abuse' }));
  const boss = world({ users: people(), tables: { staff_members: [{ user_id: STAFFER, level: 'admin' }] }, rpcs: { admin_freeze_account: () => ({ status: 'frozen' }) } });
  assert.equal(await (await loadActions(boss, OWNER_STAFF)).run('freezeAccount', { user_id: STAFFER, reason: 'left Shape' }), `${page(STAFFER)}?updated=frozen`, 'an owner can freeze staff');
});

test('unfreeze: the ban lifted first, then the records; a failed record bans again', async () => {
  const frozen = { account_freezes: [{ id: 'f1', user_id: BO, unfrozen_at: null }] };
  const db = world({ users: people(), tables: frozen, rpcs: { admin_unfreeze_account: () => ({ status: 'unfrozen', listings: 1 }) } });
  const a = await loadActions(db, SUPPORT);
  assert.equal(await a.run('unfreezeAccount', { user_id: BO }), `${page(BO)}?updated=unfrozen`);
  assert.deepEqual(changed(db), ['insert:admin_activity_log', 'ban:none', 'rpc:admin_unfreeze_account', 'update:admin_activity_log']);
  assert.deepEqual(db.rpcArgs.admin_unfreeze_account, { p_user: BO, p_by_email: 'sup@shape.test' });
  assert.equal(logRows(db)[0].outcome, 'done');

  const broken = world({ users: people(), tables: frozen, fail: ['rpc:admin_unfreeze_account'] });
  assert.equal(await (await loadActions(broken, SUPPORT)).run('unfreezeAccount', { user_id: BO }), `${page(BO)}?error=unfreeze_failed`);
  assert.deepEqual(changed(broken), ['insert:admin_activity_log', 'ban:none', 'rpc:admin_unfreeze_account', 'ban:876000h', 'update:admin_activity_log']);
  assert.equal(broken.users[BO].banned, true, 'the records still say frozen, and so does Auth');

  const split = world({ users: people(), tables: frozen, fail: ['rpc:admin_unfreeze_account', 'ban:876000h'] });
  assert.equal(await (await loadActions(split, SUPPORT)).run('unfreezeAccount', { user_id: BO }), `${page(BO)}?error=unfreeze_split`, 'a failed re-ban is said');

  const noUnban = world({ users: people(), tables: frozen, fail: ['ban:none'] });
  assert.equal(await (await loadActions(noUnban, SUPPORT)).run('unfreezeAccount', { user_id: BO }), `${page(BO)}?error=unfreeze_failed`);
  assert.ok(!changed(noUnban).includes('rpc:admin_unfreeze_account'), 'the records stay frozen while the ban does');

  const notFrozen = world({ users: people() });
  assert.equal(await (await loadActions(notFrozen, SUPPORT)).run('unfreezeAccount', { user_id: BO }), `${page(BO)}?updated=not_frozen`);
  assert.deepEqual(changed(notFrozen), []);
  const expired = world({ users: { ...people(), [BO]: { ...people()[BO], banned_until: '2001-01-01T00:00:00Z' } } });
  assert.equal(await (await loadActions(expired, SUPPORT)).run('unfreezeAccount', { user_id: BO }), `${page(BO)}?updated=not_frozen`, 'a ban that has ended is no ban');
});

test('unfreeze: a ban with no freeze on record (a split freeze, or set outside the console) can be lifted', async () => {
  const users = { ...people(), [BO]: { ...people()[BO], banned_until: '2126-10-13T00:00:00Z' } };
  const db = world({ users, rpcs: { admin_unfreeze_account: () => ({ status: 'not_frozen' }) } });
  assert.equal(await (await loadActions(db, SUPPORT)).run('unfreezeAccount', { user_id: BO }), `${page(BO)}?updated=ban_lifted`);
  assert.deepEqual(changed(db), ['insert:admin_activity_log', 'ban:none', 'rpc:admin_unfreeze_account', 'update:admin_activity_log']);
  assert.equal(logRows(db)[0].outcome, 'done', 'lifting the ban is the change asked for');
  assert.equal(db.users[BO].banned, false);
});

// ── Listings ──────────────────────────────────────────────────────────────────────────────
const listings = { trainers: [{ id: 7, name: 'Bo T', owner_id: BO }], nutritionists: [{ id: 7, name: 'Someone N', owner_id: STAFFER }] };

test('suspend: Admin and up, a listing on this account only, logged with its name and reason', async () => {
  await assert.rejects((await loadActions(world({ users: people(), tables: listings }), SUPPORT)).run('suspendListing', { user_id: BO, role: 'trainer', listing_id: '7', reason: 'fake reviews' }));
  const db = world({ users: people(), tables: listings, rpcs: { admin_suspend_listing: () => 'suspended' } });
  const a = await loadActions(db, ADMIN);
  assert.equal(await a.run('suspendListing', { user_id: BO, role: 'trainer', listing_id: '7', reason: 'fake reviews' }), `${page(BO)}?updated=suspended`);
  assert.deepEqual(db.rpcArgs.admin_suspend_listing, { p_role: 'trainer', p_id: 7, p_reason: 'fake reviews', p_source: 'admin', p_by: ACTOR, p_by_email: 'adm@shape.test' });
  assert.deepEqual(logRows(db)[0].details, { role: 'trainer', listing_id: 7, name: 'Bo T', reason: 'fake reviews' });
  assert.equal(logRows(db)[0].outcome, 'done');

  for (const [fields, why] of [
    [{ role: 'nutritionist', listing_id: '7' }, 'the same id in the other role belongs to someone else'],
    [{ role: 'coach', listing_id: '7' }, 'no such role'],
    [{ role: 'trainer', listing_id: '0' }, 'no such id'],
    [{ role: 'trainer', listing_id: '8' }, 'no listing'],
  ]) {
    const w = world({ users: people(), tables: listings });
    assert.equal(await (await loadActions(w, ADMIN)).run('suspendListing', { user_id: BO, reason: 'fake reviews', ...fields }), `${page(BO)}?error=no_listing`, why);
    assert.deepEqual(changed(w), [], why);
  }
  const already = world({ users: people(), tables: listings, rpcs: { admin_suspend_listing: () => 'already' } });
  assert.equal(await (await loadActions(already, ADMIN)).run('suspendListing', { user_id: BO, role: 'trainer', listing_id: '7', reason: 'fake reviews' }), `${page(BO)}?updated=already_suspended`);
  assert.equal(logRows(already)[0].outcome, 'failed');
  const broken = world({ users: people(), tables: listings, fail: ['rpc:admin_suspend_listing'] });
  assert.equal(await (await loadActions(broken, ADMIN)).run('suspendListing', { user_id: BO, role: 'trainer', listing_id: '7', reason: 'fake reviews' }), `${page(BO)}?error=suspend_failed`);
  assert.equal(logRows(broken)[0].outcome, 'failed');
  const noReason = world({ users: people(), tables: listings });
  assert.equal(await (await loadActions(noReason, ADMIN)).run('suspendListing', { user_id: BO, role: 'trainer', listing_id: '7', reason: '' }), `${page(BO)}?error=reason`);
});

test('lift: an admin’s lift never ends a freeze’s suspension', async () => {
  const db = world({ users: people(), tables: listings, rpcs: { admin_lift_listing: () => 'lifted' } });
  assert.equal(await (await loadActions(db, ADMIN)).run('liftListing', { user_id: BO, role: 'trainer', listing_id: '7' }), `${page(BO)}?updated=lifted`);
  assert.deepEqual(db.rpcArgs.admin_lift_listing, { p_role: 'trainer', p_id: 7, p_by_email: 'adm@shape.test', p_source: 'admin' });
  assert.equal(logRows(db)[0].outcome, 'done');
  const frozen = world({ users: people(), tables: listings, rpcs: { admin_lift_listing: () => 'other_source' } });
  assert.equal(await (await loadActions(frozen, ADMIN)).run('liftListing', { user_id: BO, role: 'trainer', listing_id: '7' }), `${page(BO)}?error=lift_frozen`);
  assert.equal(logRows(frozen)[0].outcome, 'failed');
  const none = world({ users: people(), tables: listings, rpcs: { admin_lift_listing: () => 'not_suspended' } });
  assert.equal(await (await loadActions(none, ADMIN)).run('liftListing', { user_id: BO, role: 'trainer', listing_id: '7' }), `${page(BO)}?updated=not_suspended`);
  await assert.rejects((await loadActions(world({ users: people(), tables: listings }), SUPPORT)).run('liftListing', { user_id: BO, role: 'trainer', listing_id: '7' }));
});

// ── Remove ────────────────────────────────────────────────────────────────────────────────
const billing = {
  ...listings,
  platform_subscriptions: [
    { client_id: BO, stripe_subscription_id: 'sub_member', status: 'active' },
    { client_id: BO, stripe_subscription_id: 'sub_old', status: 'canceled' },
    { client_id: STAFFER, stripe_subscription_id: 'sub_other', status: 'active' },
  ],
  subscriptions: [
    { client_id: BO, provider_role: 'nutritionist', provider_id: 3, stripe_subscription_id: 'sub_coach', status: 'trialing' },
    { client_id: STAFFER, provider_role: 'trainer', provider_id: 7, stripe_subscription_id: 'sub_client', status: 'past_due' },
    { client_id: STAFFER, provider_role: 'nutritionist', provider_id: 7, stripe_subscription_id: 'sub_not_his', status: 'active' },
  ],
};

test('remove: Admin and up; every subscription that can charge is cancelled, then the shared erasure runs', async () => {
  await assert.rejects((await loadActions(world({ users: people(), tables: billing }), SUPPORT)).run('removeAccount', { user_id: BO, confirm: 'bo@x.com' }));
  const db = world({ users: people(), tables: billing });
  const a = await loadActions(db, ADMIN);
  assert.equal(await a.run('removeAccount', { user_id: BO, confirm: ' BO@x.com ' }), '/admin/members?updated=removed');
  assert.deepEqual(a.stripe.asked, ['cancel:sub_member', 'cancel:sub_coach', 'cancel:sub_client'], 'their membership, their coach, and their own client; nobody else’s');
  assert.deepEqual(db.calls.filter((c) => /^(insert|update):admin_activity_log|^erase/.test(c)), ['insert:admin_activity_log', 'erase', 'update:admin_activity_log']);
  assert.ok(db.calls.indexOf('insert:admin_activity_log') < db.calls.indexOf('erase'));
  assert.deepEqual(logRows(db)[0].details, { subscriptions: 3 });
  assert.equal(logRows(db)[0].outcome, 'done');
  assert.deepEqual(a.erasures[0].user, { id: BO, email: 'bo@x.com', email_confirmed_at: '2026-10-01T00:00:00Z', banned: false });
  assert.deepEqual(a.erasures[0].opts, { by: 'adm@shape.test' }, 'the audit row names who removed it');
});

test('remove: a subscription that cannot be cancelled stops it before anything is erased', async () => {
  const db = world({ users: people(), tables: billing });
  const a = await loadActions(db, ADMIN, { stripe: fakeStripe({ sub_coach: 'error' }) });
  assert.equal(await a.run('removeAccount', { user_id: BO, confirm: 'bo@x.com' }), `${page(BO)}?error=billing_not_cancelled`);
  assert.equal(a.erasures.length, 0);
  assert.equal(logRows(db)[0].outcome, 'failed');
  const ended = world({ users: people(), tables: billing });
  const b = await loadActions(ended, ADMIN, { stripe: fakeStripe({ sub_coach: 'ended', sub_member: 'missing' }) });
  assert.equal(await b.run('removeAccount', { user_id: BO, confirm: 'bo@x.com' }), '/admin/members?updated=removed', 'already ended or never in Stripe: nothing to stop');
});

test('remove: a wrong confirmation, a refusal or an unread billing table changes nothing', async () => {
  for (const [staff, fields, error, opts] of [
    [ADMIN, { user_id: BO, confirm: 'bo@x.co' }, 'confirm', {}],
    [ADMIN, { user_id: BO, confirm: '' }, 'confirm', {}],
    [ADMIN, { user_id: OWNER_ID, confirm: OWNER }, 'refused_owner', {}],
    [{ ...ADMIN, id: BO }, { user_id: BO, confirm: 'bo@x.com' }, 'refused_self', {}],
    [ADMIN, { user_id: BO, confirm: 'bo@x.com' }, 'billing_read_failed', { fail: ['select:platform_subscriptions'] }],
    [ADMIN, { user_id: BO, confirm: 'bo@x.com' }, 'billing_read_failed', { fail: ['select:subscriptions'] }],
    [ADMIN, { user_id: BO, confirm: 'bo@x.com' }, 'billing_read_failed', { fail: ['select:trainers'] }],
    [ADMIN, { user_id: BO, confirm: 'bo@x.com' }, 'not_logged', { fail: ['insert:admin_activity_log'] }],
  ]) {
    const db = world({ users: people(), tables: billing, ...opts });
    const a = await loadActions(db, staff);
    assert.equal(await a.run('removeAccount', fields), `${page(fields.user_id)}?error=${error}`, error);
    assert.deepEqual(a.stripe.asked, [], `${error}: nothing cancelled`);
    assert.equal(a.erasures.length, 0, `${error}: nothing erased`);
  }
});

test('remove: an erasure that stops is reported where it stopped, and logged failed', async () => {
  for (const stage of ['storage', 'applications', 'auth']) {
    const db = world({ users: people(), tables: billing });
    const a = await loadActions(db, ADMIN, { erase: () => ({ ok: false, stage, tablesPurged: 0, bucketsPurged: 0 }) });
    assert.equal(await a.run('removeAccount', { user_id: BO, confirm: 'bo@x.com' }), `${page(BO)}?error=erase_${stage}`);
    assert.equal(logRows(db)[0].outcome, 'failed');
  }
});

// ── Requests ──────────────────────────────────────────────────────────────────────────────
const openRequest = { account_action_requests: [{ id: REQ, user_id: BO, action: 'Pause', status: 'open' }] };

test('requests: closing one is logged first, closes it only while open, and records who and why', async () => {
  const db = world({ users: people(), tables: openRequest });
  const a = await loadActions(db, SUPPORT);
  assert.equal(await a.run('handleRequest', { request_id: REQ, outcome: 'done', note: ' paused in Stripe ' }), '/admin/requests?updated=done');
  const row = db.tables.account_action_requests[0];
  assert.equal(row.status, 'done');
  assert.equal(row.note, 'paused in Stripe');
  assert.equal(row.handled_by_email, 'sup@shape.test');
  assert.ok(row.handled_at);
  assert.equal(logRows(db)[0].action, 'request.done');
  assert.deepEqual(logRows(db)[0].details, { action: 'Pause', request_id: REQ, note: 'paused in Stripe' });
  assert.equal(logRows(db)[0].outcome, 'done');
  assert.ok(db.calls.indexOf('insert:admin_activity_log') < db.calls.indexOf('update:account_action_requests'));

  const fromAccount = world({ users: people(), tables: openRequest });
  assert.equal(await (await loadActions(fromAccount, SUPPORT)).run('handleRequest', { request_id: REQ, outcome: 'declined', back: 'account', user_id: BO }), `${page(BO)}?updated=declined`);
  assert.equal(fromAccount.tables.account_action_requests[0].note, null, 'no note is null, not ""');
});

test('requests: two staff at once close it once; a closed one, a bad outcome or a failed log changes nothing', async () => {
  const raced = world({ users: people(), tables: openRequest, beforeUpdate: (table, t) => { if (table === 'account_action_requests') t[table][0].status = 'declined'; } });
  assert.equal(await (await loadActions(raced, SUPPORT)).run('handleRequest', { request_id: REQ, outcome: 'done' }), '/admin/requests?updated=already_handled');
  assert.equal(raced.tables.account_action_requests[0].status, 'declined', 'the first close stands');
  assert.equal(logRows(raced)[0].outcome, 'failed');

  const closed = world({ users: people(), tables: { account_action_requests: [{ ...openRequest.account_action_requests[0], status: 'done' }] } });
  assert.equal(await (await loadActions(closed, SUPPORT)).run('handleRequest', { request_id: REQ, outcome: 'declined' }), '/admin/requests?updated=already_handled');
  assert.deepEqual(changed(closed), []);
  for (const [fields, to, opts] of [
    [{ request_id: REQ, outcome: 'open' }, '/admin/requests?error=no_request', {}],
    [{ request_id: 'nope', outcome: 'done' }, '/admin/requests?error=no_request', {}],
    [{ request_id: REQ, outcome: 'done' }, '/admin/requests?error=not_logged', { fail: ['insert:admin_activity_log'] }],
  ]) {
    const w = world({ users: people(), tables: openRequest, ...opts });
    assert.equal(await (await loadActions(w, SUPPORT)).run('handleRequest', fields), to);
    assert.equal(w.tables.account_action_requests[0].status, 'open');
  }
  await assert.rejects((await loadActions(world({ users: people(), tables: openRequest }), { ...SUPPORT, level: 'analyst' })).run('handleRequest', { request_id: REQ, outcome: 'done' }));
});

// ── The account page ──────────────────────────────────────────────────────────────────────
const detail = (o = {}) => ({
  id: BO,
  email: 'bo@x.com',
  created_at: '2026-09-01T12:00:00Z',
  email_confirmed_at: '2026-09-01T12:00:00Z',
  last_sign_in_at: '2026-10-12T12:00:00Z',
  banned_until: null,
  source: 'instagram.com',
  profile: { full_name: 'Bo Member', username: 'bo', role: 'client', roles: ['client', 'trainer'] },
  staff_level: null,
  memberships: [{ status: 'active', price_cents: 500, current_period_end: '2026-11-01T00:00:00Z', created_at: '2026-09-01T12:00:00Z' }],
  coach_subscriptions: [{ provider_role: 'nutritionist', status: 'trialing', price_cents: 9900, created_at: '2026-09-02T12:00:00Z', coach: 'Ann N' }],
  listings: [
    { role: 'trainer', id: 7, name: 'Bo T', live: false, verified: true, suspended_at: '2026-10-10T00:00:00Z', clients_active: 2 },
    { role: 'nutritionist', id: 9, name: 'Bo N', live: true, verified: false, suspended_at: null, clients_active: 1 },
  ],
  freezes: [],
  suspensions: [
    { provider_role: 'trainer', provider_id: 7, listing_name: 'Bo T', reason: 'fake reviews', source: 'admin', suspended_by_email: 'adm@shape.test', suspended_at: '2026-10-10T00:00:00Z', lifted_at: null, lifted_by_email: null },
  ],
  requests: [{ id: REQ, action: 'Pause', status: 'open', note: null, handled_by_email: null, handled_at: null, created_at: '2026-10-11T00:00:00Z' }],
  activity: { workouts_30d: 4, workouts_all: 40, meal_days_30d: 12, checkins_30d: 2, consults_30d: 1, points_30d: 230, rank_points: 2100 },
  ...o,
});

async function renderAccount({ id = BO, staff = SUPPORT, answer = () => ({ data: detail(), error: null }), fail = [], searchParams = {} } = {}) {
  const db = world({ users: people(), fail });
  db.rpc = async (name, args) => { db.calls.push(`rpc:${name}`); db.rpcArgs[name] = args; return answer(name, args); };
  const ui = await loadRealModule(join(ROOT, 'src/app/admin/ui.tsx'), { typescript: true });
  const link = ({ href, children, prefetch, ...rest }) => React.createElement('a', { href, 'data-prefetch': String(prefetch), ...rest }, children);
  const stub = (name) => Object.assign(async () => {}, { displayName: name });
  const mod = await loadRealModule(join(ROOT, 'src/app/admin/accounts/[id]/page.tsx'), {
    typescript: true,
    registry: new Map([
      ['next/link', { __esModule: true, default: link }],
      ['next/navigation', { redirect: redirectTo }],
      ['@/lib/admin-access', {
        getOwnerEmails: () => [OWNER],
        getEnvAdminEmails: () => ['ops@shape.test'],
        requireStaff: async (min) => { db.calls.push(`level:${min}`); if (!levels.atLeast(staff.level, min)) throw new Error('Admin access required.'); return staff; },
      }],
      ['@/lib/supabase/admin', { createAdminClient: () => db }],
      ['@/lib/admin-activity.mjs', activity],
      ['@/lib/admin-overview.mjs', overview],
      ['@/lib/staff-levels.mjs', levels],
      ['@/lib/admin-account-actions.mjs', rules],
      ['../actions', Object.fromEntries(['freezeAccount', 'unfreezeAccount', 'suspendListing', 'liftListing', 'removeAccount', 'handleRequest'].map((n) => [n, stub(n)]))],
      ['../../ui', ui],
    ]),
  });
  try {
    const el = await mod.default({ params: Promise.resolve({ id }), searchParams: Promise.resolve(searchParams) });
    return { html: renderToStaticMarkup(el), db };
  } catch (e) {
    if (e.to) return { redirect: e.to, db };
    throw e;
  }
}

test('account page: opening it is logged before anything is read, and a failed log shows nothing', async () => {
  const { html, db } = await renderAccount();
  assert.deepEqual(db.calls, ['level:support', 'insert:admin_activity_log', 'rpc:admin_account_detail', 'update:admin_activity_log']);
  assert.equal(logRows(db)[0].action, 'account.view');
  assert.equal(logRows(db)[0].target_user_id, BO);
  assert.equal(logRows(db)[0].outcome, 'done');
  assert.equal(logRows(db)[0].target_email, 'bo@x.com', 'named once read, so the row outlives the account');
  assert.ok(html.includes('Bo Member'));
  const failed = await renderAccount({ fail: ['insert:admin_activity_log'] });
  assert.ok(!failed.db.calls.includes('rpc:admin_account_detail'), 'nothing read');
  assert.ok(failed.html.includes('could not be logged') && !failed.html.includes('Bo Member'));
  assert.equal((await renderAccount({ id: 'nope' })).redirect, '/admin/members');
  const analyst = await renderAccount({ staff: { ...SUPPORT, level: 'analyst' } });
  assert.equal(analyst.redirect, '/admin');
  assert.ok(!analyst.db.calls.includes('insert:admin_activity_log'));
});

test('account page: Support sees freeze and the requests; only Admin sees suspend, put back and remove', async () => {
  const sup = (await renderAccount()).html;
  assert.ok(sup.includes('Freeze account') && sup.includes('>Done<') && sup.includes('>Decline<'));
  for (const admin of ['Suspend listing', 'Put it back', 'Remove account']) assert.ok(!sup.includes(admin), `support never sees ${admin}`);
  const adm = (await renderAccount({ staff: ADMIN })).html;
  assert.ok(adm.includes('Put it back'), 'the admin-suspended trainer listing');
  assert.equal((adm.match(/Suspend listing/g) ?? []).length, 1, 'only the live nutritionist listing can be suspended');
  assert.ok(adm.includes('Remove account') && adm.includes('Type their email to confirm'));
  assert.ok(adm.includes('fake reviews') && adm.includes('adm@shape.test'));
  assert.ok(adm.includes('$5/mo') && adm.includes('Ann N') && adm.includes('Free trial') && adm.includes('$99/mo'));
  assert.ok(adm.includes('>Elite<'), 'a coach is ranked on the coach ladder');
  assert.ok(adm.includes('href="https://dashboard.stripe.com/search?query=bo%40x.com"'));
  // The visible text only: React renders a server action's form with a placeholder script.
  const odd = adm.replace(/<script[^>]*>[\s\S]*?<\/script>/g, ' ').replace(/<[^>]*>/g, ' ').match(/.{0,60}(NaN|undefined|null).{0,40}/);
  assert.equal(odd, null, String(odd?.[0]));
});

test('account page: a frozen account shows its freeze and Unfreeze; a freeze’s suspension is not put back here', async () => {
  const frozen = detail({
    freezes: [{ reason: 'abuse', frozen_by_email: 'sup@shape.test', frozen_at: '2026-10-12T00:00:00Z', unfrozen_at: null, unfrozen_by_email: null }],
    suspensions: [{ provider_role: 'trainer', provider_id: 7, listing_name: 'Bo T', reason: 'Account frozen: abuse', source: 'freeze', suspended_by_email: 'sup@shape.test', suspended_at: '2026-10-12T00:00:00Z', lifted_at: null, lifted_by_email: null }],
  });
  const { html } = await renderAccount({ staff: ADMIN, answer: () => ({ data: frozen, error: null }) });
  assert.ok(html.includes('>Frozen</span>') && html.includes('>Unfreeze<') && !html.includes('Freeze account'));
  assert.ok(html.includes('It comes back when the account is unfrozen.'));
  assert.ok(!html.includes('Put it back'));
});

test('account page: an owner’s or a staff member’s account shows why nothing can be done', async () => {
  const owner = (await renderAccount({ staff: ADMIN, answer: () => ({ data: detail({ id: OWNER_ID, email: OWNER }), error: null }) })).html;
  assert.ok(owner.includes('An owner’s account cannot be changed from the console.'));
  for (const f of ['Freeze account', 'Suspend listing', 'Remove account', 'Put it back']) assert.ok(!owner.includes(f), f);
  const staffer = (await renderAccount({ staff: ADMIN, answer: () => ({ data: detail({ staff_level: 'support' }), error: null }) })).html;
  assert.ok(staffer.includes('Staff · Support') && staffer.includes('Only an owner can do that'));
  assert.ok(!staffer.includes('Freeze account'));
  const asOwner = (await renderAccount({ staff: OWNER_STAFF, answer: () => ({ data: detail({ staff_level: 'support' }), error: null }) })).html;
  assert.ok(asOwner.includes('Freeze account') && asOwner.includes('Remove account'), 'an owner can');
});

test('account page: no account, no migration, and a ban made outside the console are each said plainly', async () => {
  assert.ok((await renderAccount({ answer: () => ({ data: null, error: null }) })).html.includes('No account with that id'));
  const missing = await renderAccount({ answer: () => ({ data: null, error: { code: 'PGRST202' } }) });
  assert.ok(missing.html.includes('2026-10-13-admin-account-actions.sql'));
  assert.equal(logRows(missing.db)[0].outcome, 'failed');
  const banned = (await renderAccount({ answer: () => ({ data: detail({ banned_until: '2999-01-01T00:00:00Z' }), error: null }) })).html;
  assert.ok(banned.includes('banned outside') && banned.includes('Lift the ban') && banned.includes('Freeze account'), 'both ways out of a split freeze');
  assert.ok(!(await renderAccount()).html.includes('Lift the ban'), 'no ban, no button');
  assert.ok((await renderAccount({ searchParams: { error: 'freeze_split' } })).html.includes('the ban could not be lifted'));
  assert.ok((await renderAccount({ searchParams: { updated: 'frozen' } })).html.includes('signed out everywhere'));
  assert.ok((await renderAccount({ searchParams: { error: 'billing_not_cancelled' } })).html.includes('was NOT removed'));
});

// ── The requests page ─────────────────────────────────────────────────────────────────────
async function renderRequests({ staff = SUPPORT, rows = [], error = null, searchParams = {} } = {}) {
  const seen = {};
  const ui = await loadRealModule(join(ROOT, 'src/app/admin/ui.tsx'), { typescript: true });
  const link = ({ href, children, prefetch, ...rest }) => React.createElement('a', { href, 'data-prefetch': String(prefetch), ...rest }, children);
  const mod = await loadRealModule(join(ROOT, 'src/app/admin/requests/page.tsx'), {
    typescript: true,
    registry: new Map([
      ['next/link', { __esModule: true, default: link }],
      ['next/navigation', { redirect: redirectTo }],
      ['@/lib/admin-access', { requireStaff: async (min) => { if (!levels.atLeast(staff.level, min)) throw new Error('no'); return staff; } }],
      ['@/lib/supabase/admin', { createAdminClient: () => ({ rpc: async (name, args) => { seen[name] = args; return { data: error ? null : rows, error }; } }) }],
      ['@/lib/admin-account-actions.mjs', rules],
      ['../accounts/actions', { handleRequest: async () => {} }],
      ['../ui', ui],
    ]),
  });
  try {
    return { html: renderToStaticMarkup(await mod.default({ searchParams: Promise.resolve(searchParams) })), seen };
  } catch (e) {
    if (e.to) return { redirect: e.to, seen };
    throw e;
  }
}

test('requests page: Support and up, the open queue by default, each linked to its account', async () => {
  const rows = [
    { id: REQ, user_id: BO, action: 'Pause', status: 'open', note: null, handled_by_email: null, handled_at: null, created_at: '2026-10-11T00:00:00Z', email: 'bo@x.com', name: 'Bo Member' },
    { id: 'r2', user_id: null, action: 'Export', status: 'open', note: null, handled_by_email: null, handled_at: null, created_at: '2026-10-12T00:00:00Z', email: null, name: null },
  ];
  const { html, seen } = await renderRequests({ rows });
  assert.deepEqual(seen.admin_account_requests, { p_status: 'open', p_limit: 200 });
  assert.ok(html.includes(`href="/admin/accounts/${BO}" data-prefetch="false"`), 'linked, never prefetched (opening it is logged)');
  assert.ok(html.includes('Pause their billing in Stripe') && html.includes('a removed account'));
  assert.equal((html.match(/>Done</g) ?? []).length, 2);
  const closed = await renderRequests({ searchParams: { show: 'handled' } });
  assert.deepEqual(closed.seen.admin_account_requests, { p_status: 'handled', p_limit: 200 });
  assert.ok(closed.html.includes('Nothing closed yet.'));
  assert.equal((await renderRequests({ searchParams: { show: 'everything' } })).seen.admin_account_requests.p_status, 'open');
  assert.ok((await renderRequests({ error: { code: 'PGRST202' } })).html.includes('2026-10-13-admin-account-actions.sql'));
  await assert.rejects(renderRequests({ error: { code: 'XX000' } }));
  assert.equal((await renderRequests({ staff: { ...SUPPORT, level: 'analyst' } })).redirect, '/admin');
});

test('the Members page links each name and celebration to the account page without prefetching it', () => {
  const src = stripComments(read('src/app/admin/members/page.tsx'));
  assert.equal((src.match(/<Link href=\{`\/admin\/accounts\/\$\{(r\.id|id)\}`\} prefetch=\{false\}/g) ?? []).length, 2);
  const coaches = stripComments(read('src/app/admin/coaches/page.tsx'));
  assert.match(coaches, /prefetch=\{false\}/);
});

// ── The delete route still runs the one erasure ──────────────────────────────────────────
test('the member’s own deletion and the console’s Remove run the same erasure', () => {
  const route = stripComments(read('src/app/api/account/delete/route.ts'));
  assert.match(route, /import \{ eraseAccount \} from '@\/lib\/account-erasure';/);
  assert.match(route, /const result = await eraseAccount\(admin, user\);/);
  assert.doesNotMatch(route, /auth\.admin\.deleteUser|from\('account_deletions'\)/, 'nothing erased in the route itself');
  const actions = stripComments(read('src/app/admin/accounts/actions.ts'));
  assert.match(actions, /const result = await eraseAccount\(db, target, \{ by: staff\.email \}\);/);
});

// ── The migration ─────────────────────────────────────────────────────────────────────────
test('migration: service role only, guarded, and the suspension column follows the listing rules', () => {
  const code = read('supabase-migrations/2026-10-13-admin-account-actions.sql').replace(/^\s*--.*$/gm, '');
  assert.match(code, /^begin;$/m);
  assert.match(code, /^commit;\s*$/m);
  const fns = [
    'admin_end_sessions\\(uuid\\)',
    'admin_account_detail\\(uuid\\)',
    'admin_suspend_listing\\(text, bigint, text, text, uuid, text\\)',
    'admin_lift_listing\\(text, bigint, text, text\\)',
    'admin_freeze_account\\(uuid, text, uuid, text\\)',
    'admin_unfreeze_account\\(uuid, text\\)',
    'admin_account_requests\\(text, integer\\)',
  ];
  for (const sig of fns) {
    assert.match(code, new RegExp(`revoke all on function public\\.${sig} from public, anon, authenticated;`), `${sig}: revoked by name`);
    assert.match(code, new RegExp(`grant execute on function public\\.${sig} to service_role;`), sig);
    assert.match(code, new RegExp(`'public\\.${sig}'`), `${sig}: the guard checks it`);
  }
  assert.equal((code.match(/security definer\nset search_path = public, pg_temp/g) ?? []).length, 7, 'every definer pinned');
  assert.match(code, /'stripe_account_id','stripe_account_status','suspended_at'\];/, 'a coach cannot set or clear their own suspension');
  assert.match(code, /begin\n  if new\.suspended_at is not null then\n    new\.listing_ready := false;\n    return new;\n  end if;\n  if new\.owner_id is null then/, 'a suspension is checked first, Shape’s own listings included');
  for (const t of ['trainers', 'nutritionists']) {
    assert.match(code, new RegExp(`grant select \\(suspended_at\\) on table public\\.${t} to anon;`), `L16: ${t}`);
  }
  for (const t of ['listing_suspensions', 'account_freezes', 'account_action_requests']) {
    assert.match(code, new RegExp(`alter table public\\.${t} enable row level security;`), t);
  }
  assert.match(code, /exception when unique_violation then\n    return jsonb_build_object\('status', 'already'\);/, 'a concurrent freeze is "already", never an error that lifts the ban');
  assert.match(code, /if v_open\.source <> p_source then\n    return 'other_source';/);
  assert.match(code, /for insert to authenticated\n  with check \(\n    user_id = auth\.uid\(\)\n    and status = 'open'/);
  assert.match(code, /grant insert \(user_id, action\) on public\.account_action_requests to authenticated;/, 'Codex, #2326: two columns, so created_at is the server’s');
  assert.doesNotMatch(code, /grant insert on public\.account_action_requests/, 'never the whole table');
  assert.match(code, /has_column_privilege\('authenticated', 'public\.account_action_requests', 'created_at', 'insert'\)/, 'the guard checks it');
  assert.equal((code.match(/create policy/g) ?? []).length, 1, 'the member’s own insert is the only policy');
  assert.match(code, /delete from auth\.refresh_tokens where user_id = p_user::text;\n  delete from auth\.sessions where user_id = p_user;/);
});
