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

function scriptedClient({ rpc, boosts = [] }) {
  const calls = [];
  const from = (table) => {
    const rows = table === 'coach_lead_boosts' ? boosts : [];
    const q = {};
    for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q;
    q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    return q;
  };
  return { calls, client: { from, rpc: async (name, args) => { calls.push({ name, args }); return rpc(name, args); } } };
}

async function post(body, { user = { id: UID }, rpc = async () => ({ data: null, error: null }), boosts } = {}) {
  const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  const { client, calls } = scriptedClient({ rpc, boosts });
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
  const existing = { id: 'b-0', provider_role: 'trainer', provider_id: 4, starts_at: '2026-10-08T12:00:00Z', ends_at: '2026-10-22T12:00:00Z', status: 'active', source: 'shape_store', duration_days: 14 };
  const { status, body } = await post({ role: 'trainer', days: 7 }, { rpc: async () => ({ data: null, error: { message: 'boost_active', code: 'P0001' } }), boosts: [existing] });
  assert.equal(status, 200);
  assert.equal(body.alreadyActive, true);
  assert.equal(body.boost.id, 'b-0');
  assert.equal(body.boost.days, 14, 'the active boost\'s own length, not the one asked for');
  const none = await post({ role: 'trainer', days: 7 }, { rpc: async () => ({ data: null, error: { message: 'boost_active', code: 'P0001' } }), boosts: [] });
  assert.equal(none.status, 409);
});

test('route: the old path is gone', () => {
  assert.doesNotMatch(ROUTE, /\.from\('coach_lead_boosts'\)\s*\.insert/, 'the route no longer writes the boost row itself');
  assert.doesNotMatch(ROUTE, /payload:/, 'the column the table never had');
  assert.doesNotMatch(ROUTE, /days \* 24 \* 60 \* 60 \* 1000/, 'the route no longer computes a length');
  assert.match(ROUTE, /client\.rpc\('redeem_lead_boost'/);
});
