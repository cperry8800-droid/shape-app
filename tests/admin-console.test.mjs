// The admin console (/admin): staff levels, who gets in, the Staff page's changes and their
// log, the Overview's numbers, and the migration behind them.
// Run: node --test tests/admin-console.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const levels = await import(pathToFileURL(join(ROOT, 'src/lib/staff-levels.mjs')).href);
const overview = await import(pathToFileURL(join(ROOT, 'src/lib/admin-overview.mjs')).href);
const activity = await import(pathToFileURL(join(ROOT, 'src/lib/admin-activity.mjs')).href);
const clicks = await import(pathToFileURL(join(ROOT, 'src/lib/admin-clicks.mjs')).href);

const OWNER = 'cperry8800@gmail.com';
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const OWNER_ID = '99999999-9999-4999-8999-999999999999';

// ── A write-capable fake of the service-role client ───────────────────────────────────────
// Applies eq filters to the rows it holds, supports insert / update / delete, and records every
// call in order, so a test reads the order of writes (the log before the change) off `calls`.
function fakeDb({ tables = {}, rpcs = {}, fail = [] } = {}) {
  const t = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const calls = [];
  let seq = 0;
  const db = {
    tables: t,
    calls,
    rpc(name, args) {
      calls.push(`rpc:${name}`);
      if (fail.includes(`rpc:${name}`)) return Promise.resolve({ data: null, error: { code: 'XX000', message: 'fake' } });
      return Promise.resolve({ data: rpcs[name] ? rpcs[name](args) : null, error: null });
    },
    from(table) {
      const st = { op: 'select', payload: null, filters: [], single: false };
      const exec = () => {
        calls.push(`${st.op}:${table}`);
        const failKey = fail.find((f) => f === table || f === `${st.op}:${table}`);
        if (failKey) return { data: null, error: { code: table === 'missing' ? '42P01' : 'XX000', message: 'fake failure' } };
        if (fail.includes(`missing:${table}`)) return { data: null, error: { code: 'PGRST205', message: 'no table' } };
        const rows = (t[table] ||= []);
        const match = (r) => st.filters.every(([c, v]) => r[c] === v);
        if (st.op === 'insert') {
          const row = { id: `${table}-${++seq}`, ...st.payload };
          rows.push(row);
          return { data: st.single ? { id: row.id } : [row], error: null };
        }
        if (st.op === 'update') {
          for (const r of rows.filter(match)) Object.assign(r, st.payload);
          return { data: null, error: null };
        }
        if (st.op === 'delete') {
          t[table] = rows.filter((r) => !match(r));
          return { data: null, error: null };
        }
        const found = rows.filter(match);
        return { data: st.single ? found[0] ?? null : found, error: null };
      };
      const chain = {
        select() { return chain; },
        insert(p) { st.op = 'insert'; st.payload = p; return chain; },
        update(p) { st.op = 'update'; st.payload = p; return chain; },
        delete() { st.op = 'delete'; return chain; },
        eq(c, v) { st.filters.push([c, v]); return chain; },
        order() { return chain; },
        limit() { return chain; },
        single() { st.single = true; return chain; },
        maybeSingle() { st.single = true; return chain; },
        then(res, rej) { return Promise.resolve(exec()).then(res, rej); },
      };
      return chain;
    },
  };
  return db;
}

// ── The levels ────────────────────────────────────────────────────────────────────────────
test('levels: each level opens what the levels below it open, and nothing else does', () => {
  const order = ['analyst', 'support', 'admin', 'owner'];
  for (const [i, have] of order.entries()) {
    for (const [j, need] of order.entries()) assert.equal(levels.atLeast(have, need), i >= j, `${have} vs ${need}`);
  }
  for (const bad of [null, undefined, '', 'superuser', 'Owner']) assert.equal(levels.atLeast(bad, 'analyst'), false, String(bad));
  assert.equal(levels.atLeast('owner', 'god'), false, 'an unknown requirement opens for nobody');
});

test('levels: where a level comes from, and that the highest wins', () => {
  const base = { ownerEmails: [OWNER], adminEmails: ['ops@shape.test'] };
  const r = (o) => levels.resolveStaffLevel({ ...base, confirmed: true, ...o });
  assert.equal(r({ email: 'CPerry8800@Gmail.com ' }), 'owner', 'owners by code, in any case');
  assert.equal(r({ email: OWNER, tableLevel: 'analyst' }), 'owner', 'a row never lowers an owner');
  assert.equal(r({ email: 'ops@shape.test' }), 'admin', 'ADMIN_EMAILS is an admin');
  assert.equal(r({ email: 'ops@shape.test', tableLevel: 'support' }), 'admin', 'the higher of the two');
  assert.equal(r({ email: 'ann@x.com', tableLevel: 'support' }), 'support');
  assert.equal(r({ email: 'ann@x.com', tableLevel: 'analyst' }), 'analyst');
  assert.equal(r({ email: 'ann@x.com', tableLevel: 'admin' }), 'admin');
  assert.equal(r({ email: 'ann@x.com', tableLevel: 'owner' }), null, 'a row can never make an owner');
  assert.equal(r({ email: 'ann@x.com', tableLevel: null }), null);
  assert.equal(r({ email: 'ann@x.com' }), null);
  assert.equal(r({ email: OWNER, confirmed: false }), null, 'an unconfirmed address is nobody, even an owner’s');
  assert.equal(r({ email: '' , tableLevel: 'admin' }), null);
});

test('levels: what each level sees in the console', () => {
  const hrefs = (l) => levels.pagesFor(l).map((p) => p.href);
  const people = ['/admin/coaches', '/admin/members', '/admin/requests', '/dashboard/support'];
  assert.deepEqual(hrefs('analyst'), ['/admin'], 'an analyst sees totals, never one person’s numbers');
  assert.deepEqual(hrefs('support'), ['/admin', ...people]);
  assert.deepEqual(hrefs('admin'), ['/admin', ...people, '/admin/activity']);
  assert.deepEqual(hrefs('owner'), ['/admin', ...people, '/admin/activity', '/admin/staff']);
  assert.deepEqual(hrefs(null), []);
  assert.deepEqual(levels.toolsFor('support'), []);
  assert.equal(levels.canOpen('support', '/dashboard/support'), true);
  assert.equal(levels.canOpen('analyst', '/dashboard/support'), false);
  assert.equal(levels.canOpen('support', '/dashboard/refunds'), false);
  assert.equal(levels.canOpen('admin', '/dashboard/refunds'), true);
  assert.equal(levels.canOpen('owner', '/somewhere-else'), false);
  assert.ok(levels.toolsFor('admin').some((t) => t.href === '/dashboard/applications'));
});

test('levels: the Staff page reads an email and a level strictly', () => {
  assert.equal(levels.cleanStaffEmail('  Ann@Example.COM '), 'ann@example.com');
  for (const bad of ['', 'ann', 'ann@x', 'a b@x.com', null, `${'a'.repeat(250)}@x.com`]) assert.equal(levels.cleanStaffEmail(bad), '', String(bad));
  assert.equal(levels.parseAssignableLevel('Support'), 'support');
  for (const bad of ['owner', '', 'root', null]) assert.equal(levels.parseAssignableLevel(bad), '', String(bad));
});

test('levels: an activity row reads as a sentence', () => {
  assert.equal(levels.describeActivity({ action: 'staff.add', target_email: 'ann@x.com', details: { level: 'support' } }), 'added ann@x.com as Support');
  assert.equal(levels.describeActivity({ action: 'staff.change_level', target_email: 'ann@x.com', details: { from: 'support', level: 'admin' } }), 'changed ann@x.com from Support to Admin');
  assert.equal(levels.describeActivity({ action: 'staff.remove', target_email: 'ann@x.com', details: { level: 'analyst' } }), 'removed ann@x.com from staff (was Analyst)');
  assert.equal(levels.describeActivity({ action: 'lookup', target_email: 'bo@x.com', details: { found: false } }), 'looked up bo@x.com through Nora (no account)');
  assert.equal(levels.describeActivity({ action: 'something.new', target_user_id: U1 }), `something.new on ${U1}`, 'an action it does not know still reads');
  assert.equal(levels.describeActivity({ action: 'account.view', target_user_id: U1 }), `opened ${U1}'s account`);
  assert.equal(levels.describeActivity({ action: 'account.freeze', target_email: 'bo@x.com', details: { reason: 'spam' } }), 'froze bo@x.com: "spam"');
  assert.equal(levels.describeActivity({ action: 'account.unfreeze', target_email: 'bo@x.com' }), 'unfroze bo@x.com');
  assert.equal(levels.describeActivity({ action: 'account.remove', target_email: 'bo@x.com', details: { subscriptions: 1 } }), "removed bo@x.com's account and cancelled 1 subscription");
  assert.equal(levels.describeActivity({ action: 'account.remove', target_email: 'bo@x.com', details: { subscriptions: 0 } }), "removed bo@x.com's account");
  assert.equal(levels.describeActivity({ action: 'listing.suspend', target_email: 'bo@x.com', details: { role: 'nutritionist', name: 'Bo N', reason: 'fake' } }), 'suspended the nutritionist listing "Bo N" (bo@x.com): "fake"');
  assert.equal(levels.describeActivity({ action: 'listing.lift', target_email: 'bo@x.com', details: { role: 'trainer' } }), 'put a trainer listing (bo@x.com) back on the marketplace');
  assert.equal(levels.describeActivity({ action: 'request.done', target_email: 'bo@x.com', details: { action: 'Pause' } }), "marked bo@x.com's Pause request done");
  assert.equal(levels.describeActivity({ action: 'request.declined', target_email: 'bo@x.com', details: { action: '<b>' } }), "declined bo@x.com's account request");
});

// ── Who gets in (src/lib/admin-access.ts, the shipping module) ───────────────────────────
// `aal` is the session's assurance level (two-factor): 'aal2' unless a test says otherwise, since
// these tests are about levels; tests/staff-two-factor.test.mjs drives the second factor.
async function loadAccess({ user, db = fakeDb(), adminThrows = false, aal = 'aal2' }) {
  const reads = [];
  const access = await loadRealModule(join(ROOT, 'src/lib/admin-access.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/supabase/server', { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }), getClaims: async () => ({ data: { claims: { aal } }, error: null }) } }) }],
      ['@/lib/staff-two-factor.mjs', await import(pathToFileURL(join(ROOT, 'src/lib/staff-two-factor.mjs')).href)],
      ['@/lib/supabase/admin', { createAdminClient: () => { if (adminThrows) throw new Error('no service key'); reads.push('admin'); return db; } }],
      ['@/lib/staff-levels.mjs', levels],
    ]),
  });
  return { access, reads, db };
}

const confirmed = (email, id = U1) => ({ id, email, email_confirmed_at: '2026-10-01T00:00:00Z' });

test('access: owners, ADMIN_EMAILS and staff rows, each at its level', async () => {
  const saved = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = 'Ops@Shape.test, ';
  try {
    const owner = await loadAccess({ user: confirmed('CPerry8800@gmail.com', OWNER_ID) });
    assert.deepEqual(await owner.access.getStaffMember(), { id: OWNER_ID, email: OWNER, level: 'owner' });
    assert.deepEqual(owner.reads, [], 'an owner is known from code: no database read');

    const ops = await loadAccess({ user: confirmed('ops@shape.test') });
    assert.equal((await ops.access.getStaffMember()).level, 'admin');
    assert.deepEqual(await ops.access.requireAdminUser(), { id: U1, email: 'ops@shape.test' });

    const db = fakeDb({ tables: { staff_members: [{ user_id: U1, level: 'support' }, { user_id: U2, level: 'analyst' }] } });
    const ann = await loadAccess({ user: confirmed('ann@x.com'), db });
    assert.deepEqual(await ann.access.getStaffMember(), { id: U1, email: 'ann@x.com', level: 'support' });
    assert.equal((await ann.access.requireStaff('support')).level, 'support');
    await assert.rejects(ann.access.requireStaff('admin'), /Admin access required/);
    await assert.rejects(ann.access.requireAdminUser(), /Admin access required/, 'the older admin tools stay admin and up');

    const bo = await loadAccess({ user: confirmed('bo@x.com', U2), db });
    assert.equal((await bo.access.requireStaff('analyst')).level, 'analyst');
    await assert.rejects(bo.access.requireStaff('support'), /Admin access required/);

    assert.deepEqual(owner.access.getAdminEmails().sort(), ['chris.perry@shapecommunity.onmicrosoft.com', 'christopher.perry@theshapecommunity.com', OWNER, 'ops@shape.test'].sort());
    assert.deepEqual(owner.access.getEnvAdminEmails(), ['ops@shape.test']);
    assert.ok(!owner.access.getOwnerEmails().includes('ops@shape.test'), 'ADMIN_EMAILS never makes an owner');
  } finally {
    if (saved === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = saved;
  }
});

test('access: nobody else, and a failed read is no access', async () => {
  const db = fakeDb({ tables: { staff_members: [{ user_id: U1, level: 'admin' }] } });
  assert.equal(await (await loadAccess({ user: null })).access.getStaffMember(), null, 'a visitor');
  const unconfirmed = await loadAccess({ user: { id: U1, email: 'ann@x.com', email_confirmed_at: null }, db });
  assert.equal(await unconfirmed.access.getStaffMember(), null, 'a row with an unconfirmed address');
  assert.deepEqual(unconfirmed.reads, [], 'and no read is made for it');
  const ownerUnconfirmed = await loadAccess({ user: { id: OWNER_ID, email: OWNER, email_confirmed_at: null } });
  assert.equal(await ownerUnconfirmed.access.getStaffMember(), null, 'an owner address someone registered without owning it');
  assert.equal(await (await loadAccess({ user: confirmed('nobody@x.com', U2), db })).access.getStaffMember(), null, 'a member with no row');
  const noTable = await loadAccess({ user: confirmed('ann@x.com'), db: fakeDb({ fail: ['missing:staff_members'] }) });
  assert.equal(await noTable.access.getStaffMember(), null, 'before the migration runs');
  const broken = await loadAccess({ user: confirmed('ann@x.com'), db: fakeDb({ fail: ['staff_members'] }) });
  assert.equal(await broken.access.getStaffMember(), null, 'a failed read');
  const noKey = await loadAccess({ user: confirmed('ann@x.com'), adminThrows: true });
  assert.equal(await noKey.access.getStaffMember(), null, 'no service key');
  const ownerNoKey = await loadAccess({ user: confirmed(OWNER, OWNER_ID), adminThrows: true });
  assert.equal((await ownerNoKey.access.getStaffMember()).level, 'owner', 'the owner still gets in without the table');
});

// ── The Staff page's changes ──────────────────────────────────────────────────────────────
async function loadStaffActions({ db, staff = { id: OWNER_ID, email: OWNER, level: 'owner' } }) {
  const asked = [];
  const actions = await loadRealModule(join(ROOT, 'src/app/admin/staff/actions.ts'), {
    typescript: true,
    registry: new Map([
      ['next/cache', { revalidatePath: () => {} }],
      ['next/navigation', { redirect: (to) => { const e = new Error('REDIRECT'); e.to = to; throw e; } }],
      ['@/lib/supabase/admin', { createAdminClient: () => db }],
      ['@/lib/admin-access', {
        getOwnerEmails: () => [OWNER],
        requireStaff: async (min) => { asked.push(min); if (!levels.atLeast(staff.level, min)) throw new Error('Admin access required.'); return staff; },
      }],
      ['@/lib/staff-levels.mjs', levels],
      ['@/lib/admin-activity.mjs', activity],
    ]),
  });
  const run = async (fn, fields) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    try { await actions[fn](fd); return null; } catch (e) { if (e.to) return e.to; throw e; }
  };
  return { run, asked };
}

const accounts = {
  'ann@x.com': { id: U1, email_confirmed_at: '2026-10-01T00:00:00Z' },
  'new@x.com': { id: U2, email_confirmed_at: null },
};
const lookup = { admin_account_by_email: ({ p_email }) => (accounts[p_email] ? [accounts[p_email]] : []) };

test('staff: adding someone logs it first, then saves the row, then marks the log done', async () => {
  const db = fakeDb({ rpcs: lookup, tables: { staff_members: [], admin_activity_log: [] } });
  const a = await loadStaffActions({ db });
  assert.equal(await a.run('saveStaffMember', { email: ' Ann@X.com ', level: 'support' }), '/admin/staff?updated=added');
  assert.deepEqual(a.asked, ['owner'], 'owner only');
  assert.deepEqual(db.calls, ['rpc:admin_account_by_email', 'select:staff_members', 'insert:admin_activity_log', 'insert:staff_members', 'update:admin_activity_log']);
  const [row] = db.tables.staff_members;
  assert.deepEqual({ user_id: row.user_id, email: row.email, level: row.level, added_by: row.added_by, added_by_email: row.added_by_email },
    { user_id: U1, email: 'ann@x.com', level: 'support', added_by: OWNER_ID, added_by_email: OWNER });
  const [log] = db.tables.admin_activity_log;
  assert.deepEqual({ actor: log.actor_email, action: log.action, target: log.target_user_id, email: log.target_email, details: log.details, outcome: log.outcome },
    { actor: OWNER, action: 'staff.add', target: U1, email: 'ann@x.com', details: { level: 'support' }, outcome: 'done' });
});

test('staff: changing a level is its own logged change; the same level changes nothing', async () => {
  const db = fakeDb({ rpcs: lookup, tables: { staff_members: [{ user_id: U1, email: 'ann@x.com', level: 'support', added_by_email: 'first@x.com' }], admin_activity_log: [] } });
  const a = await loadStaffActions({ db });
  assert.equal(await a.run('saveStaffMember', { email: 'ann@x.com', level: 'admin' }), '/admin/staff?updated=changed');
  assert.equal(db.tables.staff_members[0].level, 'admin');
  assert.equal(db.tables.staff_members[0].added_by_email, 'first@x.com', 'who added them is kept');
  assert.deepEqual(db.tables.admin_activity_log.map((l) => [l.action, l.details, l.outcome]), [['staff.change_level', { from: 'support', level: 'admin' }, 'done']]);
  assert.equal(await a.run('saveStaffMember', { email: 'ann@x.com', level: 'admin' }), '/admin/staff?updated=unchanged');
  assert.equal(db.tables.admin_activity_log.length, 1, 'no change, no log');
});

test('staff: what is refused, and that a refusal writes nothing', async () => {
  const db = fakeDb({ rpcs: lookup, tables: { staff_members: [], admin_activity_log: [] } });
  const a = await loadStaffActions({ db });
  assert.equal(await a.run('saveStaffMember', { email: 'not an email', level: 'support' }), '/admin/staff?error=bad_email');
  assert.equal(await a.run('saveStaffMember', { email: 'ann@x.com', level: 'owner' }), '/admin/staff?error=bad_level', 'nobody is made an owner here');
  assert.equal(await a.run('saveStaffMember', { email: OWNER.toUpperCase(), level: 'analyst' }), '/admin/staff?error=already_owner', 'an owner cannot be demoted to a row');
  assert.equal(await a.run('saveStaffMember', { email: 'ghost@x.com', level: 'support' }), '/admin/staff?error=no_account');
  assert.equal(await a.run('saveStaffMember', { email: 'new@x.com', level: 'support' }), '/admin/staff?error=unconfirmed');
  assert.deepEqual([db.tables.staff_members, db.tables.admin_activity_log], [[], []]);

  const failedLookup = fakeDb({ rpcs: lookup, fail: ['rpc:admin_account_by_email'] });
  assert.equal(await (await loadStaffActions({ db: failedLookup })).run('saveStaffMember', { email: 'ann@x.com', level: 'support' }), '/admin/staff?error=lookup_failed');

  const notOwner = await loadStaffActions({ db, staff: { id: U1, email: 'ops@x.com', level: 'admin' } });
  await assert.rejects(notOwner.run('saveStaffMember', { email: 'ann@x.com', level: 'support' }), /Admin access required/, 'an admin cannot manage staff');
  await assert.rejects(notOwner.run('removeStaffMember', { user_id: U1 }), /Admin access required/);
});

test('staff: a change whose log cannot be written does not run; a failed save is logged as failed', async () => {
  const unlogged = fakeDb({ rpcs: lookup, tables: { staff_members: [] }, fail: ['insert:admin_activity_log'] });
  assert.equal(await (await loadStaffActions({ db: unlogged })).run('saveStaffMember', { email: 'ann@x.com', level: 'support' }), '/admin/staff?error=not_logged');
  assert.deepEqual(unlogged.tables.staff_members, [], 'nothing saved');

  const noTable = fakeDb({ rpcs: lookup, fail: ['missing:staff_members'] });
  assert.equal(await (await loadStaffActions({ db: noTable })).run('saveStaffMember', { email: 'ann@x.com', level: 'support' }), '/admin/staff?error=missing_migration');

  const failedSave = fakeDb({ rpcs: lookup, tables: { staff_members: [], admin_activity_log: [] }, fail: ['insert:staff_members'] });
  assert.equal(await (await loadStaffActions({ db: failedSave })).run('saveStaffMember', { email: 'ann@x.com', level: 'support' }), '/admin/staff?error=save_failed');
  assert.deepEqual(failedSave.tables.admin_activity_log.map((l) => l.outcome), ['failed']);
});

test('staff: a removal whose log cannot be written does not run', async () => {
  const db = fakeDb({ tables: { staff_members: [{ user_id: U1, email: 'ann@x.com', level: 'analyst' }] }, fail: ['insert:admin_activity_log'] });
  assert.equal(await (await loadStaffActions({ db })).run('removeStaffMember', { user_id: U1 }), '/admin/staff?error=not_logged');
  assert.deepEqual(db.tables.staff_members.map((r) => r.user_id), [U1], 'still on staff');
});

test('the log: a row is written pending, and stays pending when it cannot be finished', async () => {
  const db = fakeDb({ tables: { admin_activity_log: [] }, fail: ['update:admin_activity_log'] });
  const log = await activity.startActivity(db, { id: OWNER_ID, email: OWNER }, { action: 'staff.add', targetUserId: U1, targetEmail: 'ann@x.com', details: { level: 'support' } });
  assert.equal(typeof log.id, 'string');
  assert.equal(db.tables.admin_activity_log[0].outcome, 'pending', 'pending until the change has run');
  await activity.finishActivity(db, log.id, 'done');
  assert.equal(db.tables.admin_activity_log[0].outcome, 'pending', 'a failed finish leaves it pending, which the log page shows as not confirmed');
  const ok = fakeDb({ tables: { admin_activity_log: [] } });
  const l2 = await activity.startActivity(ok, { id: OWNER_ID, email: OWNER }, { action: 'staff.remove' });
  await activity.finishActivity(ok, l2.id, 'anything else');
  assert.equal(ok.tables.admin_activity_log[0].outcome, 'failed', 'only "done" reads as done');
  assert.deepEqual(await activity.startActivity(fakeDb({ fail: ['missing:admin_activity_log'] }), { id: 'x', email: 'y' }, { action: 'a' }), { error: 'missing_migration' });
});

test('staff: removing someone is logged first, then deleted', async () => {
  const db = fakeDb({ tables: { staff_members: [{ user_id: U1, email: 'ann@x.com', level: 'analyst' }, { user_id: U2, email: 'bo@x.com', level: 'admin' }], admin_activity_log: [] } });
  const a = await loadStaffActions({ db });
  assert.equal(await a.run('removeStaffMember', { user_id: U1 }), '/admin/staff?updated=removed');
  assert.deepEqual(db.tables.staff_members.map((r) => r.user_id), [U2], 'only them');
  assert.deepEqual(db.calls.slice(-3), ['insert:admin_activity_log', 'delete:staff_members', 'update:admin_activity_log']);
  assert.deepEqual(db.tables.admin_activity_log.map((l) => [l.action, l.target_email, l.details, l.outcome]), [['staff.remove', 'ann@x.com', { level: 'analyst' }, 'done']]);
  assert.equal(await a.run('removeStaffMember', { user_id: U1 }), '/admin/staff?updated=already_removed');
  assert.equal(await a.run('removeStaffMember', { user_id: 'x; drop table' }), '/admin/staff?error=missing_member');
  assert.equal(db.tables.admin_activity_log.length, 1);
});

// ── The Overview, the Coaches page and the Members page ───────────────────────────────────
// What the PostgreSQL 16 replica returned for a seeded world; every number was checked by hand
// against the seed before it was saved (the PR describes the seed).
const FIXTURE = JSON.parse(read('tests/fixtures/admin-stats-replica.json'));
const STATS = FIXTURE.overview;

test('overview: money is formatted as dollars, and Shape’s own recurring revenue adds the two sources', () => {
  assert.equal(overview.formatMoney(1000), '$10');
  assert.equal(overview.formatMoney(2750), '$27.50');
  assert.equal(overview.formatMoney(123456789), '$1,234,567.89');
  assert.equal(overview.formatMoney(null), '$0');
  assert.equal(overview.formatCount(12345), '12,345');
  assert.deepEqual([overview.countOf(1, 'review'), overview.countOf(2, 'review'), overview.countOf(1, 'coach', 'coaches'), overview.countOf(0, 'coach', 'coaches')], ['1 review', '2 reviews', '1 coach', '0 coaches']);
  // One paying member at $5, and Shape's cut of two coach subscriptions: 10% of $100 + 15% of $49.99.
  assert.equal(overview.shapeMrrCents(STATS), 500 + 1000 + 750);
});

test('overview: the Score tier ladder, for members and for coaches', () => {
  assert.deepEqual([0, 749, 750, 1999, 2000, 4999, 5000, 14999, 15000, 1e9].map((p) => overview.tierName(p)),
    ['Raw', 'Raw', 'Tempo', 'Tempo', 'Form', 'Form', 'Peak', 'Peak', 'Legend', 'Legend']);
  assert.deepEqual([0, 750, 2000, 5000, 15000].map((p) => overview.tierName(p, true)), ['Certified', 'Pro', 'Elite', 'Master', 'Icon']);
  assert.equal(overview.tierName(null), 'Raw');
  // The replica: members c and d at 0 and 10 (Raw), b at 815 (Tempo: its tier bonus and Store
  // purchase are not rank); coaches e at 0 (Certified) and a at 2,100 (Elite).
  const t = overview.tierBreakdown(STATS);
  assert.deepEqual(t.members.map((r) => [r.name, r.from, r.count]), [['Raw', 0, 2], ['Tempo', 750, 1], ['Form', 2000, 0], ['Peak', 5000, 0], ['Legend', 15000, 0]]);
  assert.deepEqual(t.coaches.map((r) => r.count), [1, 0, 1, 0, 0]);
  assert.deepEqual(overview.tierBreakdown({}).members.map((r) => r.count), [0, 0, 0, 0, 0]);
});

test('overview: every tile reads the number it says it reads', () => {
  const sections = overview.overviewSections(STATS);
  const get = (label) => sections.flatMap((s) => s.tiles).find((t) => t.label === label);
  assert.deepEqual(sections.map((s) => s.key), ['people', 'money', 'applications', 'coaches', 'consultations', 'score', 'activity', 'lists', 'queues']);
  assert.deepEqual([get('Accounts').value, get('Accounts').sub], ['5', '4 confirmed their email']);
  assert.equal(get('Shape’s monthly recurring revenue').value, '$22.50');
  assert.deepEqual([get('Paying members').value, get('Paying members').sub], ['1', '$5 a month']);
  assert.equal(get('Coach subscriptions').sub, '$149.99 a month to coaches; Shape keeps $17.50');
  // Applications: pending (2 days) and in review (20 days) are open, one of each role.
  assert.deepEqual([get('Waiting for review').value, get('Waiting for review').sub], ['2', '1 trainer · 1 nutritionist']);
  const split = overview.overviewSections({ applications: { open: 5, open_trainer: 3, open_nutritionist: 2 } }).flatMap((x) => x.tiles).find((t) => t.label === 'Waiting for review');
  assert.equal(split.sub, '3 trainers · 2 nutritionists', 'each role its own count');
  assert.deepEqual([get('Oldest waiting').value, get('Oldest waiting').sub], ['20 days', 'since it was sent']);
  assert.deepEqual([get('New, 7 days').value, get('New, 7 days').sub], ['2', '3 in 30 days · 5 ever']);
  assert.deepEqual([get('Approved').value, get('Approved').sub], ['1', '1 in 30 days']);
  assert.deepEqual([get('Rejected').value, get('Rejected').sub], ['1', '0 in 30 days']);
  assert.equal(get('Withdrawn').value, '1');
  assert.deepEqual([get('Credentials to review').value, get('Credentials to review').sub], ['1', '1 approved · 0 asked for changes']);
  // Consultations: one open request, one whose time passed unanswered, one confirmed, one done.
  assert.deepEqual([get('Waiting on a coach').value, get('Never answered').value, get('Coming up').value, get('Done, 30 days').value], ['1', '1', '1', '1']);
  assert.deepEqual([get('Requested, 7 days').value, get('Requested, 7 days').sub], ['4', '4 in 30 days']);
  // Score: 15 + 2,100 + 10 earned this week; the 800 and the 500 tier bonus are older.
  assert.deepEqual([get('Points earned, 7 days').value, get('Points earned, all time').value], ['2,125', '3,425']);
  assert.deepEqual([get('Spent in the Store').value, get('Taken back, 30 days').value], ['500', '100']);
  assert.deepEqual([get('Most points from, 30 days').value, get('Most points from, 30 days').sub], ['habits', 'habits 2,100 · workouts 15 · community 10'], 'largest first');
  assert.deepEqual([get('App launch sign-ups').value, get('App launch sign-ups').sub], ['2', '1 in 30 days']);
  assert.equal(get('On a coach’s waitlist').value, '1');
  assert.equal(get('Help requests open').href, '/dashboard/support');
  assert.equal(get('Member role').href, '/admin/members');
  assert.equal(get('Birthdays, next 7 days'), undefined, 'no celebration tiles without their answer');
  // Missing sections read as zero, never as "undefined".
  const empty = overview.overviewSections({}).flatMap((s) => s.tiles);
  assert.ok(empty.every((t) => !/undefined|NaN|null/.test(`${t.value} ${t.sub}`)), 'no undefined, NaN or null on an empty answer');
  assert.equal(empty.find((t) => t.label === 'Oldest waiting').value, 'None');
  // The queues carry their counts, for the summary's first line.
  assert.deepEqual(sections.find((s) => s.key === 'queues').tiles.map((t) => t.count), [1, 1, 1, 2]);
  assert.deepEqual(overview.overviewSections(STATS, { accountRequests: 0 }).find((s) => s.key === 'queues').tiles.map((t) => [t.label, t.count, t.href]).slice(0, 2),
    [['Help requests open', 1, '/dashboard/support'], ['Account requests open', 0, '/admin/requests']], 'a read count of 0 still shows the row');
  assert.equal(get('Applications to review').sub, '1 trainer · 1 nutritionist', 'what is waiting says which roles');
  const splitQueue = overview.overviewSections({ applications: { open: 5, open_trainer: 3, open_nutritionist: 2 } }).flatMap((x) => x.tiles).find((t) => t.label === 'Applications to review');
  assert.equal(splitQueue.sub, '3 trainers · 2 nutritionists');
  assert.deepEqual(overview.waitingLine(overview.overviewSections({}).find((s) => s.key === 'queues').tiles), { total: 0, line: 'Nothing is waiting on the team.' });
});

test('overview: the views split the sections, and the summary’s key numbers open their views', () => {
  const keys = overview.overviewSections(STATS).map((s) => s.key);
  const placed = overview.OVERVIEW_VIEWS.flatMap((v) => v.sections);
  assert.deepEqual([...placed].sort(), keys.filter((k) => k !== 'queues').sort(), 'every section but the queues is in exactly one view');
  assert.equal(new Set(placed).size, placed.length);
  assert.deepEqual(['money', 'growth', '', 'Money', undefined, '__proto__'].map((v) => overview.overviewView(v).key), ['money', 'growth', 'summary', 'summary', 'summary', 'summary']);
  assert.deepEqual([overview.viewHref('summary'), overview.viewHref('money')], ['/admin', '/admin?view=money']);
  const key = overview.keyNumbers(overview.overviewSections(STATS));
  assert.deepEqual(key.map((t) => t.label), ['Accounts', 'New accounts, 7 days', 'Active, 7 days', 'Shape’s monthly recurring revenue', 'Paying members', 'Payment failing', 'Live listings', 'Workouts logged, 7 days']);
  assert.ok(key.every((t) => /^\/admin\?view=(growth|money|coaching|engagement)$/.test(t.href)));
  assert.equal(key.find((t) => t.label === 'Accounts').value, '5', 'the tile’s own number, not a copy');
  assert.deepEqual(overview.keyNumbers([]), []);
  assert.deepEqual([1, 2].map((c) => overview.waitingLine([{ count: c }]).line), ['1 thing is waiting on the team.', '2 things are waiting on the team.']);
});

test('overview: sign-up sources, birthdays and anniversaries read plainly', () => {
  assert.deepEqual(overview.sourceRows([{ source: 'instagram', count: 2 }, { source: 'x', count: 0 }, { count: 1 }, null]), [{ source: 'instagram', count: 2 }, { source: 'not recorded', count: 1 }]);
  assert.deepEqual(overview.sourceRows(undefined), []);
  assert.equal(overview.surfaceLine({ website: 3, app: 1, 'not recorded': 1 }), '3 on the website · 1 in the app · 1 not recorded');
  assert.equal(overview.surfaceLine({}), 'No sign-ups');
  assert.deepEqual([overview.birthdayLabel(10, 14), overview.birthdayLabel(2, 29), overview.birthdayLabel(13, 1), overview.birthdayLabel(null, 1)], ['14 October', '29 February', '', '']);
  assert.deepEqual([0, 1, 2, 30].map(overview.whenLabel), ['today', 'tomorrow', 'in 2 days', 'in 30 days']);
  assert.deepEqual([overview.yearsLabel(1), overview.yearsLabel(3)], ['1 year', '3 years']);
  assert.deepEqual(overview.celebrationCounts(null), { birthdays: { week: 0, today: 0 }, anniversaries: { week: 0, today: 0 } });
  // The replica: four sources over 30 days plus one account from before sources were recorded.
  assert.deepEqual(overview.sourceRows(STATS.signup_sources.sources_all).map((r) => r.source), ['coach link', 'google.com', 'instagram', 'not recorded', 'the app']);
  assert.deepEqual(FIXTURE.members.rows.map((r) => [r.email, r.source]).sort(), [['a@x.com', 'instagram'], ['b@x.com', 'coach link'], ['c@x.com', 'not recorded'], ['d@x.com', 'google.com']]);
});

test('overview: days waiting', () => {
  assert.equal(overview.daysSince('2026-10-01T00:00:00Z', '2026-10-13T12:00:00Z'), 12);
  assert.equal(overview.daysSince('2026-10-14T00:00:00Z', '2026-10-13T00:00:00Z'), 0, 'never negative');
  assert.equal(overview.daysSince(null, '2026-10-13T00:00:00Z'), 0);
});

test('overview: the 30-day columns grow from the baseline, cap at 24 wide, and a zero day draws nothing', () => {
  assert.deepEqual([0, 1, 3, 7, 12, 99, 101].map(overview.niceMax), [1, 1, 5, 10, 20, 100, 200]);
  const daily = Array.from({ length: 30 }, (_, i) => ({ day: `d${i}`, active: i === 29 ? 2 : i === 4 ? 1 : 0 }));
  const { top, total, cols } = overview.dailyColumns(daily, 'active', { width: 600, height: 120 });
  assert.equal(cols.length, 30);
  assert.equal(top, 2);
  assert.equal(total, 3);
  assert.ok(cols.every((c) => c.w <= 24 && c.w > 0));
  assert.ok(cols.every((c) => Math.abs(c.y + c.h - 120) < 1e-9), 'every column ends on the baseline');
  assert.equal(cols[29].h, 120, 'the highest day reaches the top');
  assert.equal(cols[4].h, 60);
  assert.equal(cols[0].h, 0);
  assert.ok(cols[1].x > cols[0].x + cols[0].w, 'a gap between neighbours');
  assert.deepEqual(overview.dailyColumns(null, 'active').cols, []);
  assert.equal(STATS.daily.length, 30, 'the replica answers 30 days');
  assert.equal(STATS.daily.reduce((t, d) => t + d.applications, 0), STATS.applications.new_30d, 'the daily applications add up to the 30-day count');
  assert.deepEqual(overview.DAILY_CHARTS.map((c) => c.key), ['signups', 'active', 'workouts', 'applications']);
});

// The pages, rendered from the replica's answers with the shipping code.
const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
globalThis.React = React;
const funnel = await import(pathToFileURL(join(ROOT, 'src/lib/funnel.mjs')).href);

async function renderPage(rel, { rpc, level = 'owner', searchParams = {}, tables = {} }) {
  const calls = [];
  const ui = await loadRealModule(join(ROOT, 'src/app/admin/ui.tsx'), { typescript: true });
  const link = ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children);
  const admin = {
    createAdminClient: () => ({
      rpc: async (name, args) => { calls.push(`rpc:${name}`); return rpc(name, args); },
      from: (table) => {
        const chain = { select: () => chain, not: () => chain, in: () => chain, eq: () => chain, then: (res, rej) => { calls.push(`select:${table}`); return Promise.resolve(tables[table] ?? { data: [], error: null }).then(res, rej); } };
        return chain;
      },
    }),
  };
  const waiting = await loadRealModule(join(ROOT, 'src/lib/admin-waiting.ts'), { typescript: true, registry: new Map([['@/lib/supabase/admin', admin], ['@/lib/staff-levels.mjs', levels]]) });
  const clicksView = await loadRealModule(join(ROOT, 'src/app/admin/ClicksView.tsx'), {
    typescript: true,
    registry: new Map([['next/link', { __esModule: true, default: link }], ['@/lib/admin-overview.mjs', overview], ['@/lib/admin-clicks.mjs', clicks], ['./ui', ui]]),
  });
  const page = await loadRealModule(join(ROOT, rel), {
    typescript: true,
    registry: new Map([
      ['next/link', { __esModule: true, default: link }],
      ['next/navigation', { redirect: (to) => { const e = new Error('REDIRECT'); e.to = to; throw e; } }],
      ['@/lib/admin-access', { requireStaff: async (min) => { calls.push(min); if (!levels.atLeast(level, min)) throw new Error('Admin access required.'); return { id: OWNER_ID, email: OWNER, level }; } }],
      ['@/lib/supabase/admin', admin],
      ['@/lib/admin-waiting', waiting],
      ['@/lib/staff-levels.mjs', levels],
      ['@/lib/admin-overview.mjs', overview],
      ['@/lib/funnel.mjs', funnel],
      ['@/lib/funnel', {}],
      ['@/lib/admin-clicks.mjs', clicks],
      ['./ClicksView', clicksView],
      ['./ui', ui],
      ['../ui', ui],
    ]),
  });
  try {
    const el = await page.default({ searchParams: Promise.resolve(searchParams) });
    return { html: renderToStaticMarkup(el), calls };
  } catch (e) {
    if (e.to) return { redirect: e.to, calls };
    throw e;
  }
}

const answers = (name, args) => {
  if (name === 'admin_overview_stats') return { data: STATS, error: null };
  if (name === 'admin_coach_stats') return { data: FIXTURE.coaches, error: null };
  if (name === 'admin_member_stats') return { data: { ...FIXTURE.members, _args: args }, error: null };
  if (name === 'admin_upcoming_celebrations') return { data: args?.p_days === 7 ? FIXTURE.celebrations_week : FIXTURE.celebrations, error: null };
  if (name === 'get_funnel') return { data: [{ step: 'signup', count: 4 }, { step: 'onboarding', count: 2 }], error: null };
  return { data: null, error: { code: 'PGRST202' } };
};

// Two account requests are open: counted beside admin_overview_stats, as the sidebar counts them.
const ACCOUNT_REQUESTS = { account_action_requests: { count: 2, error: null } };
const overviewOf = (view, level = 'owner', tables = ACCOUNT_REQUESTS) => renderPage('src/app/admin/page.tsx', { rpc: answers, level, searchParams: view ? { view } : {}, tables });
const h3s = (html) => [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((m) => m[1]);

test('render: the Overview is in views, and between them shows every section, the tiers and four 30-day charts', async () => {
  const { html, calls } = await overviewOf('');
  assert.equal(calls[0], 'analyst', 'the level is checked first');
  assert.deepEqual(calls.slice(1).sort(), ['rpc:admin_overview_stats', 'select:account_action_requests'], 'the summary asks for the stats and the account requests; the funnel and birthdays are Growth’s');
  const views = { summary: html };
  for (const v of ['growth', 'money', 'coaching', 'engagement']) views[v] = (await overviewOf(v)).html;
  const seen = Object.fromEntries(Object.entries(views).map(([k, h]) => [k, h3s(h)]));
  assert.deepEqual(seen.summary, ['Waiting on the team', 'Key numbers', 'Last 30 days'], 'the summary leads with what is waiting');
  assert.deepEqual(seen.growth, ['People', 'Sign-up lists and messages', 'Sign-ups by source', 'Sign-up funnel, last 30 days']);
  assert.deepEqual(seen.money, ['Money']);
  assert.deepEqual(seen.coaching, ['Coach applications', 'Coach listings', 'Consultations and sessions']);
  assert.deepEqual(seen.engagement, ['Activity', 'Shape Score', 'Shape Score tiers']);
  for (const name of ['Raw', 'Tempo', 'Legend', 'Certified', 'Elite', 'Icon']) assert.ok(views.engagement.includes(`>${name} <`), `the ${name} tier row`);
  assert.equal((html.match(/<figure/g) ?? []).length, 4, 'four daily charts on the summary');
  assert.ok(html.includes('$22.50'), 'Shape’s MRR is a key number');
  for (const [v, h] of Object.entries(views)) {
    assert.ok(!/NaN|undefined/.test(h), `no NaN or undefined anywhere on ${v}`);
    assert.ok(h.includes('href="https://dashboard.stripe.com/"') && h.includes('vercel.com/cperry8800-droids-projects/shape-app/analytics'), `${v} links out`);
    assert.equal((h.match(/aria-current="page"/g) ?? []).length, 1, `${v}: one view is marked`);
  }
  assert.ok(views.money.includes('href="/admin?view=money" aria-current="page"'));
  assert.equal((await overviewOf('drop table')).html, html, 'an unknown view is the summary');
});

test('render: the Clicks view reads only the tap counts, for its filters, at the Overview’s level', async () => {
  const CLICKS = {
    from: '2026-10-22', to: '2026-10-28', days: 7, total: 20,
    by_surface: { web: 15, app: 5 }, by_audience: { visitor: 8, member: 12 },
    daily: [{ day: '2026-10-28', clicks: 20 }],
    pages: [{ surface: 'web', page: '/newdesign/Coaches.html', clicks: 15 }],
    targets: [{ surface: 'web', page: '/newdesign/Coaches.html', target: 'Find a coach', clicks: 15 }],
  };
  const asked = [];
  const rpc = (name, args) => { asked.push([name, args]); return name === 'admin_click_stats' ? { data: CLICKS, error: null } : answers(name, args); };
  const { html, calls } = await renderPage('src/app/admin/page.tsx', { rpc, level: 'analyst', searchParams: { view: 'clicks', days: '7', who: 'member' } });
  assert.equal(calls[0], 'analyst', 'an analyst opens it: it is totals, never one person');
  assert.deepEqual(calls.slice(1), ['rpc:admin_click_stats'], 'not the Overview’s own numbers');
  assert.deepEqual(asked[0][1], { p_days: 7, p_surface: null, p_audience: 'member', p_tz: 'America/New_York' });
  assert.ok(html.includes('href="/admin?view=clicks" aria-current="page"'), 'the Clicks tab is open');
  assert.deepEqual(h3s(html), ['Where people tap', 'Pages with the most taps', 'Buttons and links with the most taps']);
  assert.ok(html.includes('Find a coach'));
  assert.ok(html.includes('href="/admin?view=clicks&amp;who=member"'), 'the 30-day link keeps the view and the other filter');
  assert.ok(!/NaN|undefined/.test(html));
  const missing = await renderPage('src/app/admin/page.tsx', { rpc: answers, level: 'analyst', searchParams: { view: 'clicks' } });
  assert.ok(missing.html.includes('Not set up yet: run supabase-migrations/2026-10-28-click-counts.sql'));
  assert.ok((await overviewOf('')).html.includes('Where people tap, on the website and in the app'), 'the summary’s cards open it');
});

test('render: the summary says how much is waiting on the team, and its key numbers open their views', async () => {
  const { html } = await overviewOf('');
  // The replica: one help request, one refund, one credential and two applications are open.
  const q = overview.overviewSections(STATS, { accountRequests: 2 }).find((s) => s.key === 'queues').tiles;
  const { total, line } = overview.waitingLine(q);
  assert.equal(total, 7, 'the open account requests count too, as on the sidebar (Codex, #2390)');
  assert.ok(html.includes(`>${line}</p>`), line);
  assert.ok(html.includes('href="/admin/requests"') && html.includes('Account requests open'));
  const unread = await overviewOf('', 'owner', { account_action_requests: { count: null, error: { code: 'XX000' } } });
  assert.ok(!unread.html.includes('Account requests open') && unread.html.includes('>5 things are waiting on the team.</p>'), 'a count that cannot be read leaves the row out');
  assert.ok(html.indexOf('Waiting on the team') < html.indexOf('Key numbers'), 'what is waiting comes first');
  for (const v of ['growth', 'money', 'coaching', 'engagement']) assert.ok(html.includes(`href="/admin?view=${v}"`), `a key number opens ${v}`);
});

test('render: an analyst’s tiles never link to a page the analyst cannot open', async () => {
  for (const v of ['', 'growth', 'money', 'coaching', 'engagement']) {
    const { html } = await overviewOf(v, 'analyst');
    for (const href of ['/dashboard/applications', '/dashboard/support', '/dashboard/refunds', '/dashboard/credentials', '/admin/members', '/admin/coaches', '/admin/requests']) {
      assert.ok(!html.includes(`href="${href}`), `${v || 'summary'}: no link to ${href}`);
    }
  }
  const owner = await overviewOf('', 'owner');
  assert.ok(owner.html.includes('href="/dashboard/applications"') && owner.html.includes('href="/dashboard/support"'), 'the queues open their pages');
  const growth = await overviewOf('growth', 'owner');
  assert.ok(growth.html.includes('href="/admin/members"'));
  // A link to a part of a page opens for whoever opens the page: the birthdays on Members.
  const support = await overviewOf('growth', 'support');
  assert.ok(support.html.includes('href="/admin/members#birthdays"') && support.html.includes('href="/admin/members#anniversaries"'));
});

test('render: the Overview shows sign-ups by source, and this week’s birthdays and anniversaries as counts', async () => {
  const { html } = await overviewOf('growth', 'analyst');
  assert.ok(html.includes('>Sign-ups by source</h3>'));
  for (const src of ['coach link', 'google.com', 'instagram', 'the app', 'not recorded']) assert.ok(html.includes(`>${src}</span>`), src);
  assert.ok(html.includes('3 on the website · 1 in the app · 1 not recorded'));
  assert.ok(html.includes('Campaigns, last 30 days: launch 1'));
  // Ann's birthday is today and Bea's tomorrow; Eli's second Shape anniversary is today, Cal's first in five days.
  const tiles = overview.overviewSections(STATS, { celebrations: overview.celebrationCounts(FIXTURE.celebrations_week) }).flatMap((x) => x.tiles);
  const b = tiles.find((t) => t.label === 'Birthdays, next 7 days');
  const a = tiles.find((t) => t.label === 'Shape anniversaries, next 7 days');
  assert.deepEqual([b.value, b.sub, a.value, a.sub], ['2', '1 today', '2', '1 today']);
  assert.ok(html.includes('Birthdays, next 7 days') && html.includes('Shape anniversaries, next 7 days'));
  assert.ok(!html.includes('Ann Coach'), 'the Overview names no one: counts only, which an analyst may see');
});

test('render: the Members page lists the coming birthdays (month and day only) and Shape anniversaries', async () => {
  const { html } = await renderPage('src/app/admin/members/page.tsx', { rpc: answers, level: 'support' });
  assert.ok(html.includes('id="birthdays"') && html.includes('id="anniversaries"'));
  assert.ok(html.includes('13 October · today') && html.includes('14 October · tomorrow'));
  assert.ok(html.includes('2 years · today · joined Oct 13, 2024'), 'Eli: two years today, the join date as written');
  assert.ok(html.includes('1 year · in 5 days'), 'Cal: the first year');
  for (const row of [...FIXTURE.celebrations.birthdays, ...FIXTURE.celebrations_week.birthdays]) {
    assert.deepEqual(Object.keys(row).sort(), ['coach', 'day', 'days_until', 'email', 'id', 'month', 'name', 'next']);
  }
  assert.ok(!html.includes('1990') && !html.includes('1985'), 'no birth year anywhere on the page');
  const failed = await renderPage('src/app/admin/members/page.tsx', { rpc: (n, a) => (n === 'admin_upcoming_celebrations' ? { data: null, error: { code: 'XX000' } } : answers(n, a)), level: 'support' });
  assert.ok(failed.html.includes('No birthdays coming up.') && failed.html.includes('>Bea Member<'), 'a failed read hides the lists, never the members');
});

test('render: the Overview says the migration is missing rather than failing', async () => {
  const { html } = await renderPage('src/app/admin/page.tsx', { rpc: () => ({ data: null, error: { code: 'PGRST202' } }) });
  assert.ok(html.includes('Not set up yet: run supabase-migrations/2026-10-13-staff-access-and-admin-stats.sql.'));
});

test('render: the Coaches page shows each coach’s progress, coach tiers, and is support and up', async () => {
  // Trainer 1 (Ann T) has an account; nutritionist 1 (Ann N) shares the id but not the role.
  const owners = { trainers: { data: [{ id: 1, owner_id: U1 }], error: null } };
  const { html, calls } = await renderPage('src/app/admin/coaches/page.tsx', { rpc: answers, level: 'support', tables: owners });
  assert.deepEqual(calls, ['support', 'rpc:admin_coach_stats', 'select:trainers', 'select:nutritionists']);
  assert.equal((html.match(/href="\/admin\/accounts\//g) ?? []).length, 1, 'only the listing with an account links');
  assert.ok(new RegExp(`href="/admin/accounts/${U1}"[^>]*>Ann T<`).test(html), 'Ann T links to her account');
  assert.ok(html.includes('<div class="text-neutral-100">Ann N</div>'), 'a listing is matched by role and id, never id alone');
  const broken = await renderPage('src/app/admin/coaches/page.tsx', { rpc: answers, level: 'support', tables: { trainers: { data: null, error: { code: 'XX000' } } } });
  assert.ok(broken.html.includes('>Ann T<') && !broken.html.includes('/admin/accounts/'), 'a failed owner read leaves the names unlinked, never the coaches unshown');
  assert.ok(html.includes('3 listings · 1 live · 2 paying clients'));
  assert.ok(html.includes('>1 review<') && html.includes('>2 reviews<'), 'singular and plural');
  assert.ok(html.includes('>Ann T<') && html.includes('>Eli T<'));
  assert.ok(html.includes('>Elite<'), 'Ann at 2,100 points is Elite on the coach ladder');
  assert.ok(html.includes('8.5/10'));
  assert.ok(html.includes('$100') && html.includes('Shape keeps $10'));
  assert.ok(html.includes('1 waiting on them'), 'the open consultation');
  assert.ok(!/NaN|undefined/.test(html));
  assert.equal((await renderPage('src/app/admin/coaches/page.tsx', { rpc: answers, level: 'analyst' })).redirect, '/admin', 'an analyst is sent back');
});

test('render: the Members page shows each member’s progress, passes the search and sort, and is support and up', async () => {
  const { html, calls } = await renderPage('src/app/admin/members/page.tsx', { rpc: answers, level: 'support', searchParams: { q: '  bea ', sort: 'points' } });
  assert.deepEqual(calls, ['support', 'rpc:admin_member_stats', 'rpc:admin_upcoming_celebrations']);
  assert.ok(html.includes('Joined') && html.includes(' from instagram'), 'each member’s sign-up source');
  assert.ok(!html.includes(' from not recorded'), 'an unrecorded source is left out, not printed');
  assert.ok(html.includes('>Bea Member<') && html.includes('>Tempo<') && html.includes('815 points'));
  assert.ok(html.includes('>Paying<') && html.includes('2 coaches'));
  assert.ok(html.includes('also coaches'), 'Ann holds a coach role too');
  assert.ok(!/NaN|undefined/.test(html));
  assert.equal((await renderPage('src/app/admin/members/page.tsx', { rpc: answers, level: 'analyst' })).redirect, '/admin');
  const seen = {};
  const spy = (n, a) => { seen[n] = a; return answers(n, a); };
  await renderPage('src/app/admin/members/page.tsx', { rpc: spy, level: 'support', searchParams: { q: '  bea ', sort: 'points' } });
  assert.deepEqual(seen.admin_member_stats, { p_search: 'bea', p_sort: 'points', p_limit: 200 });
  assert.deepEqual(seen.admin_upcoming_celebrations, { p_tz: 'America/New_York', p_days: 30 }, 'the owner’s days, the next 30');
  await renderPage('src/app/admin/members/page.tsx', { rpc: spy, level: 'support', searchParams: { sort: 'drop table' } });
  assert.deepEqual(seen.admin_member_stats, { p_search: null, p_sort: 'active', p_limit: 200 }, 'an unknown sort is the default');
});

// ── The pages and the actions check their own level ───────────────────────────────────────
test('every console page and action checks its own level before it reads anything', () => {
  const gates = [
    ['src/app/admin/page.tsx', 'analyst'],
    ['src/app/admin/staff/page.tsx', 'owner'],
    ['src/app/admin/activity/page.tsx', 'admin'],
    ['src/app/admin/coaches/page.tsx', 'support'],
    ['src/app/admin/members/page.tsx', 'support'],
    ['src/app/admin/requests/page.tsx', 'support'],
    ['src/app/admin/accounts/[id]/page.tsx', 'support'],
    ['src/app/dashboard/support/page.tsx', 'support'],
  ];
  for (const [file, min] of gates) {
    // Inside the page component, where it runs: a loader defined above the component reads
    // nothing until the component calls it.
    const src = stripComments(read(file));
    const body = src.slice(src.indexOf('export default async function'));
    const gate = body.search(new RegExp(`await requireStaff\\('${min}'\\)`));
    assert.ok(gate > 0, `${file} requires ${min}`);
    const firstRead = Math.min(...['createAdminClient()', 'loadStats()', 'loadFunnel()', 'loadCelebrations()'].map((x) => body.indexOf(x)).filter((i) => i >= 0));
    assert.ok(Number.isFinite(firstRead) && gate < firstRead, `${file}: the gate comes before the service role`);
  }
  const staff = stripComments(read('src/app/admin/staff/actions.ts'));
  assert.equal((staff.match(/const owner = await requireStaff\('owner'\);/g) ?? []).length, 3, 'all three Staff actions are owner only');
  const support = stripComments(read('src/app/dashboard/support/actions.ts'));
  assert.equal((support.match(/await requireStaff\('support'\)/g) ?? []).length, 2, 'both help-desk actions are support and up');
  const layout = stripComments(read('src/app/admin/layout.tsx'));
  assert.match(layout, /const staff = await getStaffMember\(\);\n\s+if \(!staff\) \{/);
  assert.match(layout, /if \(!user\) redirect\('\/login\?next=\/admin'\);\n\s+notFound\(\);/, 'a signed-in non-staff account gets a 404');
  for (const f of ['src/app/admin/layout.tsx', 'src/app/admin/page.tsx', 'src/app/admin/staff/page.tsx', 'src/app/admin/activity/page.tsx', 'src/app/admin/coaches/page.tsx', 'src/app/admin/members/page.tsx', 'src/app/admin/requests/page.tsx', 'src/app/admin/accounts/[id]/page.tsx']) {
    assert.match(read(f), /robots: \{ index: false, follow: false \}/, `${f} is not indexed`);
  }
});

test('the sidebar counts what is waiting, only on the pages the level opens, and only after the staff check', async () => {
  const asked = [];
  const db = {
    from: (table) => ({
      select: (cols, opts) => ({
        in: async (column, values) => {
          asked.push(`${table}.${column}=${values.join('|')}`);
          assert.deepEqual([cols, opts], ['*', { count: 'exact', head: true }], 'a head count, never the rows');
          if (table === 'refund_requests') return { count: null, error: { code: 'XX000' } };
          return { count: { support_requests: 2, account_action_requests: 1, provider_applications: 3, provider_credentials: 0 }[table], error: null };
        },
      }),
    }),
  };
  const waiting = await loadRealModule(join(ROOT, 'src/lib/admin-waiting.ts'), {
    typescript: true,
    registry: new Map([['@/lib/supabase/admin', { createAdminClient: () => db }], ['@/lib/staff-levels.mjs', levels]]),
  });
  assert.deepEqual(await waiting.waitingCounts('analyst'), {}, 'an analyst opens no queue');
  assert.deepEqual(asked, [], 'and nothing is read for one');
  assert.deepEqual(await waiting.waitingCounts('support'), { '/dashboard/support': 2, '/admin/requests': 1 }, 'support: the help desk and account requests');
  assert.deepEqual(
    await waiting.waitingCounts('owner'),
    { '/dashboard/support': 2, '/admin/requests': 1, '/dashboard/applications': 3, '/dashboard/credentials': 0 },
    'a count that cannot be read is left out, not shown as 0'
  );
  assert.ok(asked.includes('provider_applications.status=pending|in_review') && asked.includes('provider_credentials.review_status=pending'));
  // The same queues the Overview counts (admin_overview_stats' queues and applications.open).
  const sql = read('supabase-migrations/2026-10-13-staff-access-and-admin-stats.sql');
  for (const q of ["public.support_requests where status = 'open'", "public.refund_requests where status = 'pending'", "public.provider_credentials where review_status = 'pending'", "public.provider_applications where status in ('pending', 'in_review')"]) {
    assert.ok(sql.includes(q), q);
  }
  const layout = stripComments(read('src/app/admin/layout.tsx'));
  assert.ok(layout.indexOf('const staff = await getStaffMember();') < layout.indexOf('await waitingCounts(staff.level)'), 'counted after the staff check, at the staff member’s level');
  // No service key: the client throws, and the badges go, not the console (Codex, #2390).
  const keyless = await loadRealModule(join(ROOT, 'src/lib/admin-waiting.ts'), {
    typescript: true,
    registry: new Map([['@/lib/supabase/admin', { createAdminClient: () => { throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY'); } }], ['@/lib/staff-levels.mjs', levels]]),
  });
  assert.deepEqual(await keyless.waitingCounts('owner'), {});
  assert.equal(await keyless.waitingCount('/admin/requests'), null);
  // A link in the phone's menu closes it, even one to the same path with another ?view= (Codex, #2390).
  const sidebar = stripComments(read('src/app/admin/AdminSidebar.tsx'));
  assert.match(sidebar, /href=\{item\.href\}\s*onClick=\{\(\) => setMenuOn\(null\)\}/);
  assert.match(sidebar, /const menu = menuOn === pathname;/);
});

test('the dashboard: staff get in without a membership, and each tab shows for its level', () => {
  const layout = stripComments(read('src/app/dashboard/layout.tsx'));
  assert.match(layout, /const signIn = await getStaffSignIn\(\);\n\s+const staff = signIn\?\.staff \?\? null;\n\s+const verified = signIn\?\.twoFactor === 'verified';/, 'the tabs read the level; the pages they open need two-factor');
  assert.match(layout, /let isMember = isCoach \|\| Boolean\(staff\);/);
  assert.match(layout, /\{ href: '\/admin', label: 'Admin console', show: Boolean\(staff\) \}/);
  assert.match(layout, /\{ href: '\/dashboard\/support', label: 'Help requests', show: isSupport \}/);
  assert.match(layout, /const isAdmin = atLeast\(staff\?\.level, 'admin'\);/);
  assert.doesNotMatch(layout, /getAdminEmails/, 'the tabs read the level, not the email list');
});

// ── The migration ─────────────────────────────────────────────────────────────────────────
test('migration: service role only, one transaction, guarded', () => {
  const sql = read('supabase-migrations/2026-10-13-staff-access-and-admin-stats.sql');
  const code = sql.replace(/^\s*--.*$/gm, '');
  assert.match(code, /^begin;$/m);
  assert.match(code, /^commit;\s*$/m);
  for (const t of ['staff_members', 'admin_activity_log']) {
    assert.match(code, new RegExp(`alter table public\\.${t} enable row level security;`));
    assert.match(code, new RegExp(`revoke all on public\\.${t} from anon, authenticated;`));
  }
  assert.doesNotMatch(code, /create policy/i, 'no policies: nobody reads these through the API');
  assert.match(code, /level text not null check \(level in \('admin', 'support', 'analyst'\)\)/, 'no row can be an owner');
  assert.match(code, /security definer\nset search_path = public, pg_temp/);
  assert.match(code, /revoke all on function public\.admin_overview_stats\(text\) from public, anon, authenticated;/, '⚠ by name: Supabase grants anon and authenticated directly');
  assert.match(code, /grant execute on function public\.admin_overview_stats\(text\) to service_role;/);
  assert.match(code, /has_function_privilege\('anon', 'public\.admin_overview_stats\(text\)', 'execute'\)/, 'the guard checks the grant it made');
  for (const sig of ['admin_coach_stats\\(\\)', 'admin_member_stats\\(text, text, integer\\)']) {
    assert.match(code, new RegExp(`revoke all on function public\\.${sig} from public, anon, authenticated;`), `${sig}: revoked by name`);
    assert.match(code, new RegExp(`grant execute on function public\\.${sig} to service_role;`));
    assert.match(code, new RegExp(`has_function_privilege\\('authenticated', 'public\\.${sig}', 'execute'\\)`), `${sig}: guarded`);
  }
  assert.equal((code.match(/security definer\nset search_path = public, pg_temp/g) ?? []).length, 4, 'all four definers pinned');
  for (const sig of ['admin_upcoming_celebrations\\(text, integer\\)']) {
    assert.match(code, new RegExp(`revoke all on function public\\.${sig} from public, anon, authenticated;`));
    assert.match(code, new RegExp(`grant execute on function public\\.${sig} to service_role;`));
    assert.match(code, new RegExp(`has_function_privilege\\('anon', 'public\\.${sig}', 'execute'\\)`));
  }
  assert.match(code, /revoke all on function public\.signup_source_label\(jsonb\) from public, anon, authenticated;/);
  assert.doesNotMatch(code, /grant execute on function public\.signup_source_label/, 'the label helper is called only inside the definers');
  // The birthdays carry month and day only: nothing returns the date of birth or its year.
  const cel = code.slice(code.indexOf('create or replace function public.admin_upcoming_celebrations'), code.indexOf('revoke all on function public.admin_upcoming_celebrations'));
  const returned = cel.slice(cel.indexOf('select\n    coalesce(jsonb_agg('));
  assert.doesNotMatch(returned, /date_of_birth/, 'the date of birth is never returned');
  assert.match(cel, /'month', dt\.m, 'day', dt\.d, 'next', dt\.next_day/);
  assert.match(cel, /x\.day >= v_today and \(k\.kind = 'birthday' or x\.day > pe\.joined\)/, 'an anniversary is never the join day itself');
  // The member function returns counts, never a health value.
  const member = code.slice(code.indexOf('create or replace function public.admin_member_stats'), code.indexOf('revoke all on function public.admin_member_stats'));
  for (const col of ['weight_lb', 'body_fat_pct', 'hrv_ms', 'resting_hr', 'sleep_', 'protein_g', 'carbs_g', 'fat_g', 'hydration_l', 'mood', 'stress', 'soreness', 'steps', 'heart_rate', 'recovery_score', 'date_of_birth', 'phone']) {
    assert.ok(!member.includes(col), `${col} is not read at all`);
  }
  // Calories are read only to count a day as logged, never returned.
  assert.deepEqual(member.match(/[a-z.]*(calories|dietary_kcal)[^,)]*/g), ['d.calories', 'd.dietary_kcal']);
  assert.match(member, /and \(coalesce\(d\.calories, 0\) > 0 or coalesce\(d\.dietary_kcal, 0\) > 0\)\) as meal_days_30d/);
  assert.match(member, /position\(q\.term in lower\(coalesce\(u\.email, ''\)\)\) > 0/, 'search is a plain substring, never a LIKE pattern');
  assert.match(member, /least\(greatest\(coalesce\(p_limit, 200\), 1\), 500\)/, 'the limit is clamped');
});
