// One message to a chosen set of clients (owner, 2026-11-05: "Nudge all 3", "Note to all"): each client
// gets their own copy in their own thread, a confirm step names the count, and it is rate-limited.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { checkGroupSend, rateDecision, GROUP_SENDS_PER_HOUR, GROUP_SENDS_PER_DAY, GROUP_MAX_RECIPIENTS } from '../src/lib/group-message.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const G = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

test('a send names its role, its clients, its words, the count confirmed and its own id', () => {
  const ok = checkGroupSend({ role: 'trainer', clientIds: [id(1), id(2)], body: '  Hi all  ', confirmed: 2, groupId: G.toUpperCase() });
  assert.deepEqual(ok, { ok: true, role: 'trainer', clientIds: [id(1), id(2)], body: 'Hi all', groupId: G });
  const bad = (over) => checkGroupSend({ role: 'trainer', clientIds: [id(1), id(2)], body: 'Hi', confirmed: 2, groupId: G, ...over });
  assert.equal(bad({ role: 'coach' }).code, 'role');
  assert.equal(bad({ clientIds: [] }).code, 'no_clients');
  assert.equal(bad({ clientIds: ['nope'] }).code, 'bad_client');
  assert.equal(bad({ clientIds: Array.from({ length: GROUP_MAX_RECIPIENTS + 1 }, (_, i) => id(i)), confirmed: GROUP_MAX_RECIPIENTS + 1 }).code, 'too_many');
  assert.equal(bad({ body: '   ' }).code, 'empty');
  assert.equal(bad({ body: 'x'.repeat(2001) }).code, 'too_long');
  // The list changed after the confirm step, or a client repeated to pad the count: nothing sent.
  assert.equal(bad({ confirmed: 3 }).code, 'confirm');
  assert.equal(bad({ confirmed: undefined }).code, 'confirm');
  assert.equal(bad({ clientIds: [id(1), id(1)], confirmed: 2 }).code, 'confirm');
  assert.equal(bad({ groupId: 'x' }).code, 'group_id');
});

test('at most so many sends an hour and a day, each counted once however many clients it reached; a retry is recognised', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  const sends = (n, minsAgo, prefix = 'a') => Array.from({ length: n }, (_, i) => Array.from({ length: 3 }, () => ({ metadata: { groupId: `${prefix}${i}` }, created_at: new Date(now.getTime() - minsAgo * 60000).toISOString() }))).flat();
  assert.deepEqual(rateDecision(sends(GROUP_SENDS_PER_HOUR - 1, 10), now, G), { ok: true });
  assert.equal(rateDecision(sends(GROUP_SENDS_PER_HOUR, 10), now, G).code, 'hourly');
  assert.deepEqual(rateDecision(sends(GROUP_SENDS_PER_HOUR, 61), now, G), { ok: true }, 'an hour on, the hour is free again');
  assert.equal(rateDecision(sends(GROUP_SENDS_PER_DAY, 120), now, G).code, 'daily');
  assert.deepEqual(rateDecision(sends(GROUP_SENDS_PER_DAY, 25 * 60), now, G), { ok: true }, 'yesterday does not count');
  assert.equal(rateDecision([{ metadata: { groupId: G.toUpperCase() }, created_at: now.toISOString() }], now, G).code, 'already_sent');
  assert.deepEqual(rateDecision([{ metadata: {}, created_at: now.toISOString() }, null, { metadata: { groupId: 'z' }, created_at: 'nope' }], now, G), { ok: true });
});

// ── the route ──────────────────────────────────────────────────────────────────────────────────
function fakeDb(answer) {
  const calls = [];
  return {
    calls,
    rpc(name, args) { calls.push({ rpc: name, args }); return Promise.resolve(answer({ rpc: name, args })); },
    from(table) {
      const q = { table, ops: [] };
      calls.push(q);
      const b = new Proxy({}, {
        get(_, op) {
          if (op === 'then') { const r = answer(q); return (res, rej) => Promise.resolve(r).then(res, rej); }
          return (...args) => { q.ops.push([op, ...args]); return b; };
        },
      });
      return b;
    },
  };
}
const routeWith = async (db, user = { id: 'coach-1' }) => {
  const mod = await loadRealModule(join(ROOT, 'src/app/api/coach/messages/group/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => db }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
    ]),
  });
  return async (body) => {
    const res = await mod.POST(new Request('https://x/api/coach/messages/group', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
};
const world = (over = {}) => fakeDb((q) => {
  if (q.table === 'trainers') return { data: [{ id: 7 }], error: null };
  if (q.table === 'subscriptions') return { data: [{ client_id: id(1) }, { client_id: id(2) }], error: null };
  if (q.table === 'messages' && q.ops[0][0] === 'select') return over.recent || { data: [], error: null };
  if (q.rpc === 'get_or_create_client_conversation') return over.open ? over.open(q.args) : { data: 'conv-' + q.args.p_client_id.slice(-1), error: null };
  if (q.table === 'messages') return over.insert ? over.insert(q) : { data: null, error: null };
  return { data: [], error: null };
});

test('each client gets their own copy in their own thread, marked with the send', async () => {
  const db = world();
  const post = await routeWith(db);
  const r = await post({ role: 'trainer', clientIds: [id(1), id(2)], body: 'How is the week going?', confirmed: 2, groupId: G });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { ok: true, sent: 2, failed: [], groupId: G });
  const inserts = db.calls.filter((c) => c.ops && c.ops.some((o) => o[0] === 'insert')).map((c) => c.ops.find((o) => o[0] === 'insert')[1]);
  assert.deepEqual(inserts.map((m) => m.conversation_id), ['conv-1', 'conv-2']);
  for (const m of inserts) {
    assert.equal(m.sender_id, 'coach-1');
    assert.equal(m.body, 'How is the week going?');
    assert.deepEqual(m.metadata, { groupId: G, group: true, recipients: 2 });
  }
  assert.deepEqual(db.calls.filter((c) => c.rpc).map((c) => c.args), [{ p_client_id: id(1), p_provider_role: 'trainer' }, { p_client_id: id(2), p_provider_role: 'trainer' }]);
  // The limit counts the caller's own group messages only.
  const rateRead = db.calls.find((c) => c.table === 'messages' && c.ops[0][0] === 'select');
  assert.ok(rateRead.ops.some((o) => o[0] === 'eq' && o[1] === 'sender_id' && o[2] === 'coach-1'));
});

test('nothing is sent to someone who is not the caller\'s client, past the limit, or when the limit cannot be read', async () => {
  let db = world();
  let r = await (await routeWith(db))({ role: 'trainer', clientIds: [id(1), id(3)], body: 'Hi', confirmed: 2, groupId: G });
  assert.equal(r.status, 403);
  assert.deepEqual(r.body.clientIds, [id(3)]);
  assert.ok(!db.calls.some((c) => c.ops && c.ops.some((o) => o[0] === 'insert')));
  const now = Date.now();
  db = world({ recent: { data: Array.from({ length: GROUP_SENDS_PER_HOUR }, (_, i) => ({ metadata: { groupId: 'g' + i }, created_at: new Date(now - 60000).toISOString() })), error: null } });
  r = await (await routeWith(db))({ role: 'trainer', clientIds: [id(1)], body: 'Hi', confirmed: 1, groupId: G });
  assert.equal(r.status, 429);
  assert.ok(!db.calls.some((c) => c.ops && c.ops.some((o) => o[0] === 'insert')));
  db = world({ recent: { data: null, error: { message: 'down' } } });
  r = await (await routeWith(db))({ role: 'trainer', clientIds: [id(1)], body: 'Hi', confirmed: 1, groupId: G });
  assert.equal(r.status, 503);
  r = await (await routeWith(world(), null))({ role: 'trainer', clientIds: [id(1)], body: 'Hi', confirmed: 1, groupId: G });
  assert.equal(r.status, 401);
  // A thread that will not open is named; the others still go.
  db = world({ open: (a) => (a.p_client_id === id(2) ? { data: null, error: { code: '42501' } } : { data: 'conv-1', error: null }) });
  r = await (await routeWith(db))({ role: 'trainer', clientIds: [id(1), id(2)], body: 'Hi', confirmed: 2, groupId: G });
  assert.deepEqual([r.status, r.body.sent, r.body.failed], [200, 1, [id(2)]]);
});

test('the Clients page offers it with a confirm step that names the count', () => {
  for (const [page, role] of [['trainerClientsPage.jsx', 'trainer'], ['nutritionistClientsPage.jsx', 'nutritionist']]) {
    assert.match(read('public/newdesign/' + page), new RegExp(`source === "live" && typeof window\\.GroupMessageButton === "function" && <window\\.GroupMessageButton role="${role}" triage=\\{triage\\} />`));
  }
  const ui = read('public/newdesign/groupMessage.jsx');
  assert.match(ui, /body: JSON\.stringify\(\{ role, clientIds: ids, body: body\.trim\(\), confirmed: ids\.length, groupId \}\)/);
  assert.match(ui, /Send this to \{ids\.length\} client/);
  assert.match(ui, /setGroupId\(gmbUuid\(\)\); setStep\("confirm"\);/);
  for (const h of ['TrainerApp.html', 'NutritionistApp.html']) assert.match(read('public/newdesign/' + h), /<script type="text\/babel" src="groupMessage\.jsx"><\/script>/);
  assert.match(read('src/lib/warroom.ts'), /\['\/api\/coach\/messages\/group', 'POST'\]/);
});
