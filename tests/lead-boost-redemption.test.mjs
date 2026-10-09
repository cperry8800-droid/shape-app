// H6 of the 2026-10-08 security review: a Lead Boost is REDEEMED, never granted.
//
// Before: POST /api/lead-boosts inserted an active boost with no points debit and no bound on
// days (and, in production, failed outright: it sent a `payload` column the table does not
// have), while /api/store/redeem refused the item. #2280 dropped the coach write policies. Now
// the route calls redeem_lead_boost, a SECURITY DEFINER function that debits the fixed 7 / 14 /
// 30-day catalogue item and writes the boost in one transaction; the length comes from the
// catalogue row, never from the caller.
//
// The database half is 2026-10-09-store-credit-reservations-and-lead-boost-redemption.sql,
// tested on the PostgreSQL 16 replica of production (a coach's redemption, the refusals, a race).
// What this file pins: the definer model's reading of the function (SECURITY DEFINER, pinned,
// authenticated only), the migration's shape, the catalogue's mapping of a client's `days` to an
// item, and the SHIPPING route driven through loadRealModule against a scripted client.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M from './helpers/definer-model.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'supabase-migrations');
const FILE = '2026-10-09-store-credit-reservations-and-lead-boost-redemption.sql';
const SQL = fs.readFileSync(join(DIR, FILE), 'utf8');
const ROUTE = fs.readFileSync(join(ROOT, 'src/app/api/lead-boosts/route.ts'), 'utf8');
const UID = '33333333-3333-4333-8333-333333333333';

let realModel;
const real = () => (realModel ??= M.replayDir(DIR));

test('redeem_lead_boost is a pinned SECURITY DEFINER a signed-in account can call and an anonymous one cannot', () => {
  const fns = [...real().fns.values()].filter((f) => f.schema === 'public' && f.name === 'redeem_lead_boost');
  assert.equal(fns.length, 1);
  const fn = fns[0];
  assert.equal(fn.sig, 'text,text,bigint');
  assert.equal(fn.definer, true);
  assert.equal(M.pgTempPinned(fn), true);
  const d = M.describeFunction(fn);
  assert.equal(d.anon, false);
  assert.equal(d.authenticated, true);
  assert.equal(M.bodyUsesAuthUid(fn), true, 'the caller is auth.uid(), never an argument');
});

test('the migration\'s shape: the catalogue carries the length, the debit and the boost are one transaction, a refused redemption costs nothing', () => {
  assert.match(SQL, /alter table public\.store_catalogue add column if not exists boost_days integer;/);
  assert.match(SQL, /check \(boost_days is null or boost_days in \(7, 14, 30\)\)/);
  for (const [id, days] of [['lead_boost_7', 7], ['lead_boost_14', 14], ['lead_boost_30', 30]]) {
    assert.match(SQL, new RegExp(`update public\\.store_catalogue set boost_days = ${days}\\s+where id = '${id}'\\s+and boost_days is distinct from ${days};`));
  }
  const body = SQL.slice(SQL.indexOf('create or replace function public.redeem_lead_boost'), SQL.indexOf('revoke all on function public.redeem_lead_boost'));
  assert.match(body, /if not found or v_kind is distinct from 'lead_boost' or v_days is null then\n\s+raise exception 'unknown_item'/, 'only a lead_boost row with a length is a boost');
  // Both role branches, counted: a mutation round found that matching ONCE let the trainer branch
  // hand a coach any trainer row they named while the nutritionist branch still read correctly.
  assert.equal((body.match(/where owner_id = v_uid and \(p_provider_id is null or id = p_provider_id\)\n\s+order by id limit 1;/g) ?? []).length, 2,
    'the caller\'s own provider row, lowest id, or the named one if it is theirs, in the trainer AND the nutritionist branch');
  assert.match(body, /pg_advisory_xact_lock\(hashtext\('shape_store_redeem:' \|\| v_uid::text\)\)/, 'redeem_store_item\'s lock, so two redemptions by one member serialize');
  assert.match(body, /if exists \(select 1 from public\.coach_lead_boosts where provider_id = v_provider_id and status = 'active'\) then\n\s+raise exception 'boost_active'/);
  assert.match(body, /if v_balance < v_cost then\n\s+raise exception 'insufficient_points'/);
  assert.match(body, /insert into public\.score_ledger \(user_id, category, source_kind, source_id, delta, note\)\n\s+values \(v_uid, 'other', 'store_redeem', v_rid, -v_cost,/, 'the points leave the ledger the way redeem_store_item takes them');
  assert.match(body, /\(p_role, v_provider_id, v_days, v_now, v_now \+ make_interval\(days => v_days\), 'active', 'shape_store', v_uid,/, 'the boost\'s length is the catalogue\'s');
  assert.match(body, /exception when unique_violation then\n[\s\S]*?raise exception 'boost_active'/, 'a lost race raises, and the debit rolls back with it');
  assert.doesNotMatch(body, /p_days|duration_days\s*:=\s*p_/, 'no caller-supplied length');
  assert.match(SQL, /revoke all on function public\.redeem_lead_boost\(text, text, bigint\) from anon;\nrevoke all on function public\.redeem_lead_boost\(text, text, bigint\) from authenticated;\ngrant execute on function public\.redeem_lead_boost\(text, text, bigint\) to authenticated;/);
});

const require_ = createRequire(join(ROOT, 'package.json'));
const nextServer = require_('next/server');
let catalogue;
const loadCatalogue = async () => (catalogue ??= await loadRealModule(join(ROOT, 'src/lib/store-catalogue.ts'), { typescript: true }));

test('findLeadBoostItem maps an id or a client\'s days to one of the three boosts, and nothing else', async () => {
  const { findLeadBoostItem } = await loadCatalogue();
  assert.equal(findLeadBoostItem(undefined, 7).id, 'lead_boost_7');
  assert.equal(findLeadBoostItem('', '14').id, 'lead_boost_14');
  assert.equal(findLeadBoostItem('lead_boost_30', undefined).id, 'lead_boost_30');
  assert.equal(findLeadBoostItem('lead_boost_7', 30).id, 'lead_boost_7', 'an item id wins over days');
  assert.equal(findLeadBoostItem(undefined, 36500), undefined, 'a century is not for sale');
  assert.equal(findLeadBoostItem(undefined, 7.5), undefined);
  assert.equal(findLeadBoostItem('merch_cap_black', undefined), undefined, 'a cap is not a boost');
  assert.equal(findLeadBoostItem(undefined, undefined), undefined);
});

/** eq / in / gt filters are applied, so the fallback's "only the caller's own rows" is a real test. */
function scriptedClient({ rpc, boosts = [], providers = {} }) {
  const calls = [];
  const from = (table) => {
    const rows = table === 'coach_lead_boosts' ? boosts : (providers[table] ?? []);
    const filters = [];
    const q = {};
    for (const m of ['select', 'order', 'limit']) q[m] = () => q;
    q.eq = (c, v) => { filters.push((r) => r[c] === v); return q; };
    q.in = (c, vs) => { filters.push((r) => vs.includes(r[c])); return q; };
    q.gt = (c, v) => { filters.push((r) => r[c] > v); return q; };
    const hit = () => rows.filter((r) => filters.every((f) => f(r)));
    q.maybeSingle = async () => ({ data: hit()[0] ?? null, error: null });
    q.then = (res, rej) => Promise.resolve({ data: hit(), error: null }).then(res, rej);
    return q;
  };
  return { calls, client: { from, rpc: async (name, args) => { calls.push({ name, args }); return rpc(name, args); } } };
}

async function post(body, { user = { id: UID }, rpc = async () => ({ data: null, error: null }), boosts, providers = { trainers: [{ id: 4, owner_id: UID }] } } = {}) {
  const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  const { client, calls } = scriptedClient({ rpc, boosts, providers });
  const route = await loadRealModule(join(ROOT, 'src/app/api/lead-boosts/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => client }],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/store-catalogue', await loadCatalogue()],
    ]),
  });
  const req = new Request('https://shape.test/api/lead-boosts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const res = await route.POST(req);
  return { status: res.status, body: await res.json(), calls };
}

const granted = { id: 'b-1', role: 'trainer', providerId: 4, startsAt: '2026-10-09T12:00:00Z', endsAt: '2026-10-16T12:00:00Z', days: 7, cost: 11850, code: 'BOOST-ABCDEF12', balance: 8150 };

test('route: days picks the catalogue item, the function is called for the caller\'s own row, and the boost comes back', async () => {
  const { status, body, calls } = await post({ role: 'trainer', days: 7 }, { rpc: async () => ({ data: granted, error: null }) });
  assert.equal(status, 200);
  assert.deepEqual(calls, [{ name: 'redeem_lead_boost', args: { p_item_id: 'lead_boost_7', p_role: 'trainer', p_provider_id: null } }]);
  assert.equal(body.boost.days, 7);
  assert.equal(body.boost.status, 'active');
  assert.equal(body.boost.cost, 11850);
  assert.equal(body.balance, 8150);
});

test('route: an item id or a named provider row rides through; a length the store does not sell never reaches the database', async () => {
  const a = await post({ role: 'nutritionist', itemId: 'lead_boost_30', providerId: '7' }, { rpc: async () => ({ data: { ...granted, role: 'nutritionist', providerId: 7, days: 30 }, error: null }) });
  assert.deepEqual(a.calls[0].args, { p_item_id: 'lead_boost_30', p_role: 'nutritionist', p_provider_id: 7 });
  const b = await post({ role: 'trainer', days: 36500 });
  assert.equal(b.status, 400);
  assert.deepEqual(b.calls, [], 'refused before any call');
  const c = await post({ role: 'trainer', itemId: 'merch_cap_black' });
  assert.equal(c.status, 400);
  assert.deepEqual(c.calls, []);
  const d = await post({ days: 7 });
  assert.equal(d.status, 400, 'a role is required');
  const e = await post({ role: 'trainer', days: 7 }, { user: null });
  assert.equal(e.status, 401);
  assert.deepEqual(e.calls, []);
});

test('route: the function\'s refusals read as the store\'s statuses, and nothing is granted on the way', async () => {
  const err = (message, code) => async () => ({ data: null, error: { message, code } });
  const a = await post({ role: 'trainer', days: 7 }, { rpc: err('insufficient_points', 'P0001') });
  assert.equal(a.status, 409);
  assert.equal(a.body.code, 'insufficient_points');
  const b = await post({ role: 'trainer', days: 7 }, { rpc: err('no_provider', '42501') });
  assert.equal(b.status, 403);
  const c = await post({ role: 'trainer', days: 7 }, { rpc: err('unknown_item', '22023') });
  assert.equal(c.status, 400);
  const d = await post({ role: 'trainer', days: 7 }, { rpc: err('Could not find the function public.redeem_lead_boost', 'PGRST202') });
  assert.equal(d.status, 503, 'a database without the function says so instead of granting');
  const e = await post({ role: 'trainer', days: 7 }, { rpc: err('not_authenticated', '28000') });
  assert.equal(e.status, 401);
});

test('route: a boost already active comes back as the active one, marked, as the old route did', async () => {
  const existing = { id: 'b-0', provider_role: 'trainer', provider_id: 4, starts_at: '2026-10-08T12:00:00Z', ends_at: '2999-10-22T12:00:00Z', status: 'active', source: 'shape_store', duration_days: 14 };
  const { status, body } = await post({ role: 'trainer', days: 7 }, { rpc: async () => ({ data: null, error: { message: 'boost_active', code: 'P0001' } }), boosts: [existing] });
  assert.equal(status, 200);
  assert.equal(body.alreadyActive, true);
  assert.equal(body.boost.id, 'b-0');
  assert.equal(body.boost.days, 14, 'the active boost\'s own length, not the one asked for');
  const none = await post({ role: 'trainer', days: 7 }, { rpc: async () => ({ data: null, error: { message: 'boost_active', code: 'P0001' } }), boosts: [] });
  assert.equal(none.status, 409);
});

// ── The follow-up (Codex on #2285, read after the merge): the active slot is per provider, role
// included; an elapsed boost expires instead of blocking the next one; the fallback reads only
// the caller's own rows; the reservation sweep runs on a clock. ──────────────────────────────
const FOLLOW_UP = '2026-10-09-lead-boost-active-key-and-expiry.sql';
const SQL2 = fs.readFileSync(join(DIR, FOLLOW_UP), 'utf8');

test('follow-up: the caller\'s elapsed boosts expire under the lock before the check, and the check and the index carry the role', () => {
  const body = SQL2.slice(SQL2.indexOf('create or replace function public.redeem_lead_boost'), SQL2.indexOf('revoke all on function public.redeem_lead_boost'));
  assert.match(body, /pg_advisory_xact_lock\(hashtext\('shape_store_redeem:' \|\| v_uid::text\)\);\n(?:\s*--[^\n]*\n)*\s+update public\.coach_lead_boosts\n\s+set status = 'expired'\n\s+where provider_role = p_role and provider_id = v_provider_id and status = 'active' and ends_at <= v_now;/, 'expired first, under the lock');
  assert.match(body, /if exists \(select 1 from public\.coach_lead_boosts\n\s+where provider_role = p_role and provider_id = v_provider_id and status = 'active'\) then\n\s+raise exception 'boost_active'/);
  assert.ok(body.indexOf("ends_at <= v_now") < body.indexOf("raise exception 'boost_active'"), 'the expiry comes before the refusal');
  assert.match(SQL2, /update public\.coach_lead_boosts set status = 'expired' where status = 'active' and ends_at <= now\(\);\n/, 'every elapsed row, once, before the index is rebuilt');
  assert.match(SQL2, /drop index if exists public\.coach_lead_boosts_active_uniq;\ncreate unique index coach_lead_boosts_active_uniq\n\s+on public\.coach_lead_boosts \(provider_role, provider_id\) where status = 'active';/);
  // the rest of the function is the merged one, unchanged
  const prior = SQL.slice(SQL.indexOf('create or replace function public.redeem_lead_boost'), SQL.indexOf('revoke all on function public.redeem_lead_boost'));
  assert.ok(body.includes(prior.slice(prior.indexOf('  select coalesce(sum(delta), 0)::integer into v_balance'))), 'from the balance read on, byte for byte');
  assert.match(SQL2, /\nbegin;\nset local lock_timeout = '10s';\n/);
  assert.match(SQL2, /\$guard\$;\n\ncommit;\n$/);
  const guard = SQL2.slice(SQL2.indexOf('do $guard$'), SQL2.lastIndexOf('$guard$;'));
  assert.doesNotMatch(guard, /\bexecute\b/);
  for (const m of guard.matchAll(/raise exception '((?:[^']|'')*)'((?:,\s*[\w.()':]+)*)\s*;/g)) {
    const pct = (m[1].match(/%/g) ?? []).length;
    const args = m[2].trim() ? m[2].split(',').filter((s) => s.trim()).length : 0;
    assert.equal(pct, args, `RAISE "${m[1].slice(0, 60)}": ${pct} placeholder(s), ${args} argument(s)`);
  }
  // the replay reads the follow-up AFTER the file it follows, so the model holds the new body
  const fn = [...real().fns.values()].find((f) => f.schema === 'public' && f.name === 'redeem_lead_boost');
  assert.ok(fn && fn.definer && M.pgTempPinned(fn));
  assert.ok(/ends_at <= v_now/.test(fn.body ?? fn.src ?? JSON.stringify(fn)), 'the model\'s redeem_lead_boost is the follow-up\'s');
  assert.ok(M.constraintOrders(M.ORDER_CONSTRAINTS, FILE, FOLLOW_UP), 'the replay constraint names the pair');
});

test('follow-up: on boost_active the route reads back only the caller\'s own, still-running boost', async () => {
  const refused = async () => ({ data: null, error: { message: 'boost_active', code: 'P0001' } });
  const mine = { id: 'b-mine', provider_role: 'trainer', provider_id: 4, starts_at: '2026-10-01T12:00:00Z', ends_at: '2999-01-01T00:00:00Z', status: 'active', source: 'shape_store', duration_days: 30 };
  const theirs = { id: 'b-theirs', provider_role: 'trainer', provider_id: 9, starts_at: '2026-10-09T12:00:00Z', ends_at: '2999-01-01T00:00:00Z', status: 'active', source: 'shape_store', duration_days: 7 };
  const both = await post({ role: 'trainer', days: 7 }, { rpc: refused, boosts: [theirs, mine] });
  assert.equal(both.status, 200);
  assert.equal(both.body.boost.id, 'b-mine', 'the caller\'s row, not the newest active boost of the role');
  const onlyTheirs = await post({ role: 'trainer', days: 7 }, { rpc: refused, boosts: [theirs] });
  assert.equal(onlyTheirs.status, 409, 'another coach\'s boost is never handed back');
  const named = await post({ role: 'trainer', days: 7, providerId: 9 }, { rpc: refused, boosts: [theirs, mine] });
  assert.equal(named.status, 409, 'a named row the caller does not own reads nothing');
  const elapsed = await post({ role: 'trainer', days: 7 }, { rpc: refused, boosts: [{ ...mine, ends_at: '2026-01-01T00:00:00Z' }] });
  assert.equal(elapsed.status, 409, 'an elapsed row is not "the active one"');
  const nutri = await post({ role: 'nutritionist', days: 7 }, { rpc: refused, boosts: [{ ...mine, provider_role: 'nutritionist', provider_id: 7 }], providers: { nutritionists: [{ id: 7, owner_id: UID }] } });
  assert.equal(nutri.status, 200, 'the nutritionist table for a nutritionist');
});

test('follow-up: the stale-reservation sweep runs from the daily cron, best-effort', () => {
  const cron = fs.readFileSync(join(ROOT, 'src/app/api/cron/score-accountability/route.ts'), 'utf8');
  assert.match(cron, /await admin\.rpc\('sweep_store_credit_reservations', \{ p_user_id: null, p_older_than: '48 hours' \}\);/);
  assert.match(cron, /if \(sweepErr\) console\.error\('\[cron\] store credit reservation sweep failed', sweepErr\.message\);/, 'a failed sweep is said, and the run goes on');
  assert.match(cron, /\{ ok: true, evaluated, penalties, rewards, commitments, swept \}/);
  const vercel = JSON.parse(fs.readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  assert.ok(vercel.crons.some((c) => c.path === '/api/cron/score-accountability'), 'the cron is scheduled');
});

test('route: the old path is gone', () => {
  assert.doesNotMatch(ROUTE, /\.from\('coach_lead_boosts'\)\s*\.insert/, 'the route no longer writes the boost row itself');
  assert.doesNotMatch(ROUTE, /payload:/, 'the column the table never had');
  assert.doesNotMatch(ROUTE, /days \* 24 \* 60 \* 60 \* 1000/, 'the route no longer computes a length');
  assert.match(ROUTE, /client\.rpc\('redeem_lead_boost'/);
});
