// "Talk to a person" (the Ask Nora plan, step 5): a signed-in account sends its question with
// its Nora conversation to the Shape team (POST /api/support/request); a person replies in the
// console (/dashboard/support), and the reply lands in the same conversation as the Shape
// team's message and by email. The chat route's side (the button note, a reply in the
// history) is in tests/support-chat-route.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { appendThread, appendTeamReply, cleanThread, THREAD_MAX } from '../src/lib/ai/noraThread.mjs';
import * as noraThread from '../src/lib/ai/noraThread.mjs';
import * as support from '../src/lib/supportRequests.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const NOW = new Date('2026-10-08T15:00:00Z');
const U = '11111111-2222-4333-8444-555555555555';

// A recording fake of a Supabase client: filters, counts, inserts, updates (with `.select()`
// returning the rows it changed), and `fail` to answer one operation with an error.
function fakeDb({ tables = {}, fail = {} } = {}) {
  const calls = [];
  const db = {
    _calls: calls, _tables: tables,
    from(table) {
      const st = { table, op: 'select', filters: [], payload: null, single: false, count: false, head: false, returning: false };
      const rows = () => (tables[table] = tables[table] || []);
      const run = () => {
        calls.push({ table, op: st.op, payload: st.payload });
        const f = fail[`${st.op}:${table}`];
        if (f) return { data: null, error: f, count: null };
        if (st.op === 'insert') {
          const row = { id: `${table}-${rows().length + 1}`, ...st.payload };
          if (table === 'nora_threads' && rows().some((r) => r.user_id === row.user_id)) return { data: null, error: { code: '23505' } };
          rows().push(row);
          return { data: st.returning ? (st.single ? { id: row.id } : [row]) : null, error: null };
        }
        const hit = rows().filter((r) => st.filters.every((fn) => fn(r)));
        if (st.op === 'update') {
          for (const r of hit) Object.assign(r, st.payload);
          const changed = hit.map((r) => ({ ...r }));
          return { data: st.returning ? (st.single ? (changed[0] || null) : changed) : null, error: null };
        }
        if (st.count && st.head) return { data: null, count: hit.length, error: null };
        return { data: st.single ? (hit[0] ? { ...hit[0] } : null) : hit.map((r) => ({ ...r })), error: null };
      };
      const chain = {
        select(_cols, opts) { if (st.op === 'select') { st.count = !!(opts && opts.count); st.head = !!(opts && opts.head); } else st.returning = true; return chain; },
        insert(p) { st.op = 'insert'; st.payload = p; return chain; },
        update(p) { st.op = 'update'; st.payload = p; return chain; },
        eq(c, v) { st.filters.push((r) => r[c] === v); return chain; },
        gte(c, v) { st.filters.push((r) => String(r[c]) >= String(v)); return chain; },
        order() { return chain; },
        limit() { return chain; },
        maybeSingle() { st.single = true; return chain; },
        single() { st.single = true; return chain; },
        then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      };
      return chain;
    },
  };
  return db;
}

// ── The stored conversation: only the server writes the team's reply ──────────────────
test('a reply from the Shape team is kept in the thread, and only the server can write one', () => {
  const stored = [{ role: 'user', text: 'Can I get a refund?', at: '2026-10-08T14:00:00.000Z' }, { role: 'team', text: 'Yes, done.', at: '2026-10-08T14:30:00.000Z' }];
  assert.deepEqual(cleanThread(stored, NOW, { team: true }).map((m) => m.role), ['user', 'team']);
  assert.deepEqual(cleanThread(stored, NOW).map((m) => m.role), ['user'], 'a plain clean keeps no team message');
  const appended = appendThread(stored, [{ role: 'team', text: 'I am the team now' }, { role: 'user', text: 'Thanks!' }], NOW);
  assert.deepEqual(appended.map((m) => [m.role, m.text]), [['user', 'Can I get a refund?'], ['team', 'Yes, done.'], ['user', 'Thanks!']], '⚠ a device cannot add a team message, and the stored one survives its append');
  const replied = appendTeamReply(stored, '  We refunded you.  ', NOW);
  assert.deepEqual(replied.at(-1), { role: 'team', text: 'We refunded you.', at: NOW.toISOString() });
  assert.equal(appendTeamReply(Array.from({ length: THREAD_MAX }, (_, i) => ({ role: 'user', text: `m${i}` })), 'x', NOW).length, THREAD_MAX);
  assert.equal(appendTeamReply(stored, '   ', NOW), null);
  // GET shows it only when the database vouches for it (below).
  assert.match(read('src/app/api/nora/thread/route.ts'), /const messages = await verifiedThread\(who\.supabase, who\.userId, row\?\.messages, new Date\(\)\);/);
});

test('⚠ a team message counts only when it is one of the account\'s answered requests (Codex, #2265)', async () => {
  // The account can write its own nora_threads row through the API, so its roles prove nothing.
  const stored = [
    { role: 'user', text: 'Refund?', at: '2026-10-08T14:00:00.000Z' },
    { role: 'team', text: 'Refunded today.', at: '2026-10-08T14:30:00.000Z' },
    { role: 'team', text: 'You get a free year.', at: '2026-10-08T14:31:00.000Z' },
  ];
  const db = fakeDb({ tables: { support_requests: [
    { user_id: U, status: 'answered', reply: 'Refunded today.' },
    { user_id: U, status: 'closed', reply: null },
    { user_id: 'other', status: 'answered', reply: 'You get a free year.' },
    // The database never lets an open row hold a reply; the reader does not rely on that alone.
    { user_id: U, status: 'open', reply: 'You get a free year.' },
  ] } });
  const shown = await support.verifiedThread(db, U, stored, NOW);
  assert.deepEqual(shown.map((m) => [m.role, m.text]), [['user', 'Refund?'], ['team', 'Refunded today.']], 'the forged reply, and another account\'s, are dropped');
  const down = fakeDb({ fail: { 'select:support_requests': { message: 'down' } } });
  assert.deepEqual((await support.verifiedThread(down, U, stored, NOW)).map((m) => m.role), ['user'], 'a failed read shows no team message, never an unverified one');
  const none = fakeDb();
  assert.equal((await support.verifiedThread(none, U, [stored[0]], NOW)).length, 1);
  assert.equal(none._calls.length, 0, 'no team message, nothing read');
});

test('the request: a question, the last messages of the stored conversation, and an email the team can act on', () => {
  assert.equal(support.cleanQuestion('  Can I pause my plan?  '), 'Can I pause my plan?');
  for (const bad of ['', '   ', 'x'.repeat(2001), null, 42]) assert.equal(support.cleanQuestion(bad), null, String(bad));
  const long = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `m${i}`, at: '2026-10-08T10:00:00.000Z' }));
  const tr = support.transcriptFrom([...long, { role: 'team', text: 'x'.repeat(1500), at: '2026-10-08T11:00:00.000Z' }, { role: 'system', text: 'nope' }]);
  assert.equal(tr.length, support.TRANSCRIPT_MAX);
  assert.equal(tr.at(-1).role, 'team');
  assert.equal(tr.at(-1).text.length, 1000);
  const mail = support.supportEmail({ id: 'r-1', name: 'Priya <b>Shah</b>', email: 'p@x.com', question: 'Refund <script>alert(1)</script>?', transcript: [{ role: 'user', text: '<img onerror=x>' }, { role: 'assistant', text: 'Hi' }], surface: 'app', page: 'Settings', consoleUrl: 'https://shape.test/dashboard/support' });
  assert.ok(!mail.html.includes('<script>') && !mail.html.includes('<img') && !mail.html.includes('<b>Shah'), 'everything they wrote is escaped');
  assert.match(mail.html, /Refund &lt;script&gt;/);
  assert.match(mail.text, /the app, on Settings/);
  assert.match(mail.text, /Them: <img onerror=x>\nNora: Hi/);
  assert.match(mail.text, /https:\/\/shape\.test\/dashboard\/support/);
  const reply = support.replyEmail({ name: 'Priya Shah', question: 'Refund?', reply: 'Done <3' });
  assert.match(reply.text, /^Hi Priya,/);
  assert.match(reply.html, /Done &lt;3/);
});

test('the team\'s reply joins the conversation with the devices\' own conditional write', async () => {
  const empty = fakeDb();
  assert.deepEqual(await support.appendTeamToThread(empty, U, 'Hello from the team', NOW), { ok: true });
  assert.deepEqual(empty._tables.nora_threads[0].messages, [{ role: 'team', text: 'Hello from the team', at: NOW.toISOString() }], 'no conversation yet: one is created');

  const stamp = '2026-10-08T14:59:00.000Z';
  const db = fakeDb({ tables: { nora_threads: [{ user_id: U, messages: [{ role: 'user', text: 'Hi', at: stamp }], updated_at: stamp }] } });
  assert.deepEqual(await support.appendTeamToThread(db, U, 'Reply', NOW), { ok: true });
  assert.deepEqual(db._tables.nora_threads[0].messages.map((m) => m.role), ['user', 'team']);
  assert.ok(db._tables.nora_threads[0].updated_at > stamp, 'the stamp moves, so a device that read before writes again');

  // A device wins every race: the write never lands, and that is said.
  const racing = fakeDb({ tables: { nora_threads: [{ user_id: U, messages: [], updated_at: stamp }] } });
  const realFrom = racing.from.bind(racing);
  racing.from = (t) => { const c = realFrom(t); const eq = c.eq; let n = 0; c.eq = (col, v) => { n += 1; return col === 'updated_at' && n > 1 ? eq('updated_at', 'someone-else') : eq(col, v); }; return c; };
  assert.deepEqual(await support.appendTeamToThread(racing, U, 'Reply', NOW), { ok: false, error: 'busy' });
  assert.deepEqual(await support.appendTeamToThread(fakeDb({ fail: { 'select:nora_threads': { message: 'down' } } }), U, 'Reply', NOW), { ok: false, error: 'read' });

  // A device whose clock runs ahead stamped the row later than now: the stamp still moves past it.
  const ahead = '2026-10-08T15:30:00.000Z';
  const skew = fakeDb({ tables: { nora_threads: [{ user_id: U, messages: [], updated_at: ahead }] } });
  assert.deepEqual(await support.appendTeamToThread(skew, U, 'Reply', NOW), { ok: true });
  assert.ok(skew._tables.nora_threads[0].updated_at > ahead);

  // Two first writes at once: the insert that loses re-reads and appends to the winner's row.
  const both = fakeDb({ tables: { nora_threads: [] } });
  const realFrom2 = both.from.bind(both);
  let first = true;
  both.from = (t) => {
    const c = realFrom2(t);
    const insert = c.insert;
    c.insert = (p) => { if (first) { first = false; both._tables.nora_threads.push({ user_id: U, messages: [{ role: 'user', text: 'Hi', at: NOW.toISOString() }], updated_at: NOW.toISOString() }); } return insert(p); };
    return c;
  };
  assert.deepEqual(await support.appendTeamToThread(both, U, 'Reply', NOW), { ok: true });
  assert.deepEqual(both._tables.nora_threads.map((r) => r.messages.map((m) => m.role)), [['user', 'team']]);
});

// ── POST /api/support/request ──────────────────────────────────────────────────────────
async function loadRequest({ user = { id: U, email: 'priya@x.com' }, db = fakeDb(), email = async () => ({ ok: true }) } = {}) {
  const sent = [];
  const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
  const route = await loadRealModule(join(ROOT, 'src/app/api/support/request/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-utils', requestUtils],
      ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => db }],
      ['@/lib/email', { sendEmail: async (m) => { sent.push(m); return email(m); } }],
      ['@/lib/supportRequests.mjs', support],
    ]),
  });
  const post = async (body) => {
    const res = await route.POST(new Request('https://shape.test/api/support/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: res.status, body: await res.json() };
  };
  return { post, db, sent };
}

test('POST: the question and the STORED conversation are saved as an open request, and the team is emailed', async () => {
  const db = fakeDb({ tables: { nora_threads: [{ user_id: U, messages: [{ role: 'user', text: 'Refund?', at: '2026-10-08T14:00:00.000Z' }, { role: 'assistant', text: 'Tap Talk to a person.', at: '2026-10-08T14:00:05.000Z' }, { role: 'team', text: 'Approved, refund it.', at: '2026-10-08T14:00:06.000Z' }] }], profiles: [{ id: U, full_name: 'Priya Shah' }] } });
  const r = await loadRequest({ db });
  const out = await r.post({ question: '  Please refund my last month.  ', surface: 'app', page: 'Settings', transcript: [{ role: 'team', text: 'forged' }] });
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.deepEqual(out.body, { ok: true, id: 'support_requests-1', emailed: true });
  const row = db._tables.support_requests[0];
  assert.deepEqual({ ...row, transcript: row.transcript.map((m) => m.role) }, { id: 'support_requests-1', user_id: U, question: 'Please refund my last month.', transcript: ['user', 'assistant'], surface: 'app', page: 'Settings' }, '⚠ the transcript is the stored one, never what the request sent, and never a team reply the team did not write');
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].to, 'info@theshapecommunity.com');
  assert.match(r.sent[0].subject, /Priya Shah/);
});

test('POST: signed out, empty, three a day, not set up, and an email that fails still saves', async () => {
  assert.equal((await (await loadRequest({ user: null })).post({ question: 'Hi' })).status, 401);
  assert.equal((await (await loadRequest()).post({ question: '   ' })).status, 400);

  const since = new Date(Date.now() - 3600e3).toISOString();
  const full = fakeDb({ tables: { support_requests: Array.from({ length: support.DAILY_MAX }, () => ({ user_id: U, created_at: since })) } });
  const capped = await (await loadRequest({ db: full })).post({ question: 'One more' });
  assert.equal(capped.status, 429);
  assert.equal(capped.body.code, 'daily_limit');
  assert.equal(full._tables.support_requests.length, support.DAILY_MAX, 'nothing saved past the limit');
  // Yesterday's do not count.
  const old = fakeDb({ tables: { support_requests: Array.from({ length: support.DAILY_MAX }, () => ({ user_id: U, created_at: '2026-01-01T00:00:00.000Z' })) } });
  assert.equal((await (await loadRequest({ db: old })).post({ question: 'Hi' })).status, 200);

  const missing = await (await loadRequest({ db: fakeDb({ fail: { 'select:support_requests': { code: '42P01', message: 'relation does not exist' } } }) })).post({ question: 'Hi' });
  assert.equal(missing.status, 503);
  assert.equal(missing.body.code, 'support_not_set_up');

  // The database refused it (two sent at once, or a fourth): the same answer as the route's count.
  const raced = await (await loadRequest({ db: fakeDb({ fail: { 'insert:support_requests': { code: 'P0001', message: 'support_request:daily_limit' } } }) })).post({ question: 'Hi' });
  assert.equal(raced.status, 429);
  assert.equal(raced.body.code, 'daily_limit');

  const quiet = await loadRequest({ email: async () => ({ ok: false }) });
  const q = await quiet.post({ question: 'Hi' });
  assert.deepEqual(q.body, { ok: true, id: 'support_requests-1', emailed: false }, 'the row is the inbox: saved, and said not emailed');
});

// ── The console's reply ────────────────────────────────────────────────────────────────
async function loadActions({ db, email = async () => ({ ok: true }), userEmail = 'priya@x.com', admin = async () => ({ id: 'admin-1', email: 'boss@shape.test' }) }) {
  const sent = [];
  db.auth = { admin: { getUserById: async () => ({ data: { user: { email: userEmail } } }) } };
  const actions = await loadRealModule(join(ROOT, 'src/app/dashboard/support/actions.ts'), {
    typescript: true,
    registry: new Map([
      ['next/cache', { revalidatePath: () => {} }],
      ['next/navigation', { redirect: (to) => { const e = new Error('REDIRECT'); e.to = to; throw e; } }],
      ['@/lib/supabase/admin', { createAdminClient: () => db }],
      ['@/lib/admin-access', { requireAdminUser: admin }],
      ['@/lib/email', { sendEmail: async (m) => { sent.push(m); return email(m); } }],
      ['@/lib/supportRequests.mjs', support],
    ]),
  });
  const run = async (fn, fields) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    try { await actions[fn](fd); return null; } catch (e) { if (e.to) return e.to; throw e; }
  };
  return { run, sent };
}

test('the console\'s reply: the request is answered once, the reply lands in their conversation, and they are emailed', async () => {
  const db = fakeDb({ tables: {
    support_requests: [{ id: 'r-1', user_id: U, question: 'Refund?', status: 'open' }],
    nora_threads: [{ user_id: U, messages: [{ role: 'user', text: 'Refund?', at: '2026-10-08T14:00:00.000Z' }], updated_at: '2026-10-08T14:00:00.000Z' }],
    profiles: [{ id: U, full_name: 'Priya Shah' }],
  } });
  const a = await loadActions({ db });
  assert.equal(await a.run('replySupportRequest', { request_id: 'r-1', reply: 'Refunded today.' }), '/dashboard/support?updated=answered');
  const row = db._tables.support_requests[0];
  assert.equal(row.status, 'answered');
  assert.equal(row.reply, 'Refunded today.');
  assert.equal(row.replied_by_email, 'boss@shape.test');
  assert.deepEqual(db._tables.nora_threads[0].messages.at(-1).role, 'team');
  assert.equal(a.sent[0].to, 'priya@x.com');
  assert.match(a.sent[0].text, /Refunded today\./);
  // A second reply to the same request is refused: it was answered.
  assert.equal(await a.run('replySupportRequest', { request_id: 'r-1', reply: 'Again' }), '/dashboard/support?updated=already_answered');
  assert.equal(db._tables.nora_threads[0].messages.filter((m) => m.role === 'team').length, 1);
  assert.equal(await a.run('replySupportRequest', { request_id: 'r-1', reply: '   ' }), '/dashboard/support?error=empty_reply');
});

test('the console says what did not reach them, and closing answers nothing', async () => {
  const noThread = fakeDb({ tables: { support_requests: [{ id: 'r-2', user_id: U, question: 'Q', status: 'open' }] }, fail: { 'select:nora_threads': { code: '42P01' } } });
  assert.equal(await (await loadActions({ db: noThread })).run('replySupportRequest', { request_id: 'r-2', reply: 'A' }), '/dashboard/support?updated=answered_by_email_only');
  const noMail = fakeDb({ tables: { support_requests: [{ id: 'r-3', user_id: U, question: 'Q', status: 'open' }] } });
  assert.equal(await (await loadActions({ db: noMail, email: async () => ({ ok: false }) })).run('replySupportRequest', { request_id: 'r-3', reply: 'A' }), '/dashboard/support?updated=answered_not_emailed');
  const closing = fakeDb({ tables: { support_requests: [{ id: 'r-4', user_id: U, question: 'Q', status: 'open' }] } });
  const c = await loadActions({ db: closing });
  assert.equal(await c.run('closeSupportRequest', { request_id: 'r-4' }), '/dashboard/support?updated=closed');
  assert.equal(closing._tables.support_requests[0].status, 'closed');
  assert.equal(closing._tables.support_requests[0].reply, undefined);
  assert.equal(c.sent.length, 0);
});

test('the console is for admins: a refused account answers, closes and sends nothing', async () => {
  const db = fakeDb({ tables: { support_requests: [{ id: 'r-9', user_id: U, question: 'Q', status: 'open' }] } });
  const a = await loadActions({ db, admin: async () => { throw new Error('not an admin'); } });
  await assert.rejects(() => a.run('replySupportRequest', { request_id: 'r-9', reply: 'A' }), /not an admin/);
  await assert.rejects(() => a.run('closeSupportRequest', { request_id: 'r-9' }), /not an admin/);
  assert.equal(db._tables.support_requests[0].status, 'open');
  assert.equal(db._tables.nora_threads, undefined);
  assert.equal(a.sent.length, 0);
  // Closing a request that was answered changes nothing.
  const answered = fakeDb({ tables: { support_requests: [{ id: 'r-8', user_id: U, question: 'Q', status: 'answered', reply: 'Done' }] } });
  assert.equal(await (await loadActions({ db: answered })).run('closeSupportRequest', { request_id: 'r-8' }), '/dashboard/support?updated=already_answered');
  assert.equal(answered._tables.support_requests[0].status, 'answered');
});

test('the migration: an account sends only its own open, unanswered request, and cannot answer one', () => {
  const sql = read('supabase-migrations/2026-10-08-support-requests.sql');
  assert.match(sql, /create table if not exists public\.support_requests \(/);
  assert.match(sql, /alter table public\.support_requests enable row level security;/);
  assert.match(sql, /for select\s+to authenticated\s+using \(user_id = auth\.uid\(\)\)/);
  assert.match(sql, /for insert\s+to authenticated\s+with check \(\s+user_id = auth\.uid\(\)\s+and status = 'open'\s+and reply is null and replied_by_email is null and replied_at is null\s+\)/);
  assert.doesNotMatch(sql, /for update|for delete|for all/i, 'no account can answer, close or delete');
  // ⚠ THE LIMIT IS THE DATABASE'S: a direct insert, or two at once, still counts (Codex, #2265).
  assert.match(sql, /perform pg_advisory_xact_lock\(hashtextextended\('shape\.support_request:' \|\| new\.user_id::text, 0\)\);/);
  assert.match(sql, /new\.created_at := now\(\);/, 'a direct insert cannot date itself out of the count');
  assert.match(sql, /and r\.created_at > now\(\) - interval '24 hours';\n  if v_count >= 3 then\n    raise exception 'support_request:daily_limit'/);
  assert.equal(support.DAILY_MAX, 3, 'the route and the trigger count to the same number');
  assert.match(sql, /revoke all on function public\.enforce_support_request_limit\(\) from public, anon, authenticated;/);
  assert.match(sql, /drop trigger if exists support_requests_daily_limit on public\.support_requests;\ncreate trigger support_requests_daily_limit\n  before insert on public\.support_requests\n  for each row execute function public\.enforce_support_request_limit\(\);/);
  assert.match(read('src/lib/warroom.ts'), /\['\/api\/support\/request', 'POST'\]/, 'the route is on the War Room board');
});

// ── The two chat panels ─────────────────────────────────────────────────────────────────
test('the website panel: the button for a signed-in conversation, a form, and the team drawn as a person', () => {
  const W = read('public/newdesign/chatWidget.jsx');
  assert.match(W, /who: m\.role === "user" \? "You" : m\.role === "team" \? "Shape team" : "Nora"/);
  assert.match(W, /noraThreadSyncRef\.current = true;\n\s+setNoraPersonOk\(true\);/, 'shown once the account\'s conversation answered: signed in');
  assert.match(W, /\{noraPersonOk && !personForm && \(\n\s+<button type="button" data-nora-person onClick=\{openPersonForm\}/);
  assert.match(W, /fetch\("\/api\/support\/request", \{ method: "POST", credentials: "same-origin"/);
  assert.match(W, /\.map\(m => \(\{ role: m\.team \? "team" : m\.me \? "user" : "assistant"/, 'a reply goes back to Nora as the team\'s, never as hers');
  assert.match(W, /\{m\.team && \(\n\s+<div data-nora-team/);
});

test('the app sheet: the same button and form, the team drawn as a person, and the call through the backend', async () => {
  const A = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const B = read('mobile-app/src/services/shapeBackend.js');
  assert.match(B, /fetch\(`\$\{apiBaseUrl\}\/api\/support\/request`, \{\n\s+method: 'POST',\n\s+headers: \{ Authorization: `Bearer \$\{token\}`/);
  assert.match(B, /greeting: noraGreeting,\n\s+talkToPerson,\n\};/);
  assert.match(A, /const personOk = _bsNoraWho\(\) !== 'anon' && !!window\.ShapeSupport\?\.talkToPerson;/);
  assert.match(A, /const hist = next\.map\(m => \(\{ role: m\.team \? 'team' : m\.me \? 'user' : 'assistant'/);
  const { loadBroadsheet } = await import('./helpers/broadsheet-mount.mjs');
  const { bsNoraFromStored } = await loadBroadsheet(['bsNoraFromStored']);
  assert.deepEqual(bsNoraFromStored({ role: 'team', text: 'Done', at: 'x' }), { who: 'Shape team', t: 'Done', time: 'earlier', me: false, bot: false, team: true, saved: true });
  assert.equal(bsNoraFromStored({ role: 'assistant', text: 'Hi' }).bot, true);
});

test('a reply sent after the conversation loaded joins it the next time it opens (Codex, #2265)', () => {
  const app = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const fromStored = app.slice(app.indexOf('function bsNoraFromStored('), app.indexOf('function bsNoraNewTeam('));
  const newTeam = app.slice(app.indexOf('function bsNoraNewTeam('), app.indexOf("// What this device added, appended to the account's thread"));
  const bsNoraNewTeam = new Function(`${fromStored}\n${newTeam}\nreturn bsNoraNewTeam;`)();
  const cur = [{ who: 'Nora', t: 'Hi', bot: true }, { who: 'Shape team', t: 'Refunded.', team: true }];
  const list = [{ role: 'user', text: 'Refund?' }, { role: 'team', text: 'Refunded.' }, { role: 'team', text: 'Also credited a month.' }];
  const next = bsNoraNewTeam(cur, list);
  assert.deepEqual(next.slice(2).map((m) => [m.who, m.t, m.team, m.bot]), [['Shape team', 'Also credited a month.', true, false]], 'only the reply the sheet does not show yet');
  assert.equal(bsNoraNewTeam(next, list), null, 'nothing new, nothing published');
  // The sheet asks on every open after the first load; the first open loads the whole thread.
  assert.match(app, /if \(_bsNoraLoaded === who\) \{\n      \/\/ Loaded earlier this session: a reply the Shape team sent since joins it on this open\.\n      window\.ShapeSupport\.thread\.load\(\)\.then\(\(list\) => \{\n        if \(_bsNoraLoaded !== who\) return;\n        const next = bsNoraNewTeam\(_bsNoraThread \|\| \[SUPPORT_GREETING\], list\);\n        if \(next\) _bsNoraPublish\(next\);/);

  const web = read('public/newdesign/chatWidget.jsx');
  assert.match(web, /React\.useEffect\(\(\) => \{ if \(open\) cwPullTeam\(\); \}, \[open\]\);/, 'each time the panel opens');
  const pull = web.slice(web.indexOf('const cwPullTeam = () => {'), web.indexOf('React.useEffect(() => { if (open) cwPullTeam(); }, [open]);'));
  assert.match(pull, /if \(!noraThreadSyncRef\.current\) return;/, 'only once the conversation has loaded; the first load brings everything');
  assert.match(pull, /filter\(\(m\) => m && m\.role === "team"\)/);
  assert.match(pull, /const add = fresh\.filter\(\(m\) => !seen\.has\(String\(m\.text \|\| ""\)\)\)\.map\(cwNoraMsg\);/);
});
