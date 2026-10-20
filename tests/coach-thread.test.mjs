// Client-onboarding review, fix 3a: hiring a coach starts the relationship (H7, M9).
//   - When a coach subscription is saved, the Stripe webhook opens the coach thread with Shape's
//     welcome at the top (once), alerts and emails the coach with the client's name and links
//     (once, only after the save), and emails the member (once). A membership start welcomes the
//     member once.
//   - A coach opens the SAME thread the client sees, from the app and from the website, instead of
//     a member-to-member chat nobody else can find; their side names the thread after the client.
//   - Shape's welcome reads as a note from Shape in every thread view, in the member's language in
//     the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const W = await import('../mobile-app/src/services/shapeWelcome.mjs');
const ROUTES = await import('../public/newdesign/notificationRoutes.mjs');
// The app's notification router, its own module since Codex's tenth round on #2360 (an app that
// starts in a coach role never loads the client module). Run with a window that records what it
// dispatches.
const ROUTER = await import('../mobile-app/src/broadsheet/bsNotificationRoute.mjs');
function routerWith(dispatch) {
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  return (route, data) => {
    const saved = [globalThis.window, globalThis.CustomEvent];
    globalThis.window = { dispatchEvent: dispatch };
    globalThis.CustomEvent = CustomEvent;
    try { return ROUTER.bsRouteNotification(route, data); } finally { [globalThis.window, globalThis.CustomEvent] = saved; }
  };
}
const LOCALES = ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi'];
const SQL = read('supabase-migrations/2026-10-15-coach-thread.sql');
// The code, without its line comments (no string in this file carries a `--`).
const SQL_CODE = SQL.replace(/--[^\n]*/g, '');

// ── The welcome text ─────────────────────────────────────────────────────────────────────────────
test('the welcome: from Shape, naming both people, and recognised by its marker only', () => {
  assert.equal(W.shapeWelcomeText({ client: 'Cara Diaz', coach: 'Tom Trainer' }),
    'Cara and Tom Trainer are now working together on Shape. This thread is where you talk: questions, check-ins and plan changes all land here.');
  assert.match(W.shapeWelcomeText({ coach: 'Tom Trainer' }), /^Your coaching with Tom Trainer starts here\. /, 'no client name');
  assert.match(W.shapeWelcomeText({}), /^Your coaching with your coach starts here\./);
  assert.equal(W.shapeFirstName('  Cara   Diaz '), 'Cara');
  assert.equal(W.shapeFirstName(null), '');
  const row = { sender_id: null, body: 'Hello', metadata: { shape: 'welcome', coach: 'Tom Trainer', client: 'Cara' } };
  assert.equal(W.isShapeWelcome(row), true);
  assert.equal(W.isShapeWelcome({ ...row, sender_id: 'u1' }), false, 'a person can never send one');
  assert.equal(W.isShapeWelcome({ ...row, metadata: { shape: 'other' } }), false);
  assert.equal(W.isShapeWelcome({ ...row, metadata: null }), false);
  assert.equal(W.isShapeWelcome(null), false);
});

test('the welcome in the member\'s language: from its metadata, the body when it cannot be', () => {
  const en = JSON.parse(read('mobile-app/src/i18n/catalogs/en/feed.json'));
  const de = JSON.parse(read('mobile-app/src/i18n/catalogs/de/feed.json'));
  const trFor = (cat) => (key, vars) => {
    const k = key.replace(/^feed:/, '');
    const raw = cat[k];
    if (!raw) return vars.defaultValue;
    return raw.replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? `{${v}}`);
  };
  const row = { sender_id: null, body: 'stored body', metadata: { shape: 'welcome', coach: 'Tom Trainer', client: 'Cara Diaz' } };
  // The English catalog says exactly what the server stores, so both sides read one sentence.
  assert.equal(W.shapeWelcomeShown(row, trFor(en)), W.shapeWelcomeText({ client: 'Cara', coach: 'Tom Trainer' }));
  assert.equal(W.shapeWelcomeShown({ ...row, metadata: { shape: 'welcome', coach: 'Tom Trainer' } }, trFor(en)), W.shapeWelcomeText({ coach: 'Tom Trainer' }));
  assert.match(W.shapeWelcomeShown(row, trFor(de)), /^Cara und Tom Trainer arbeiten jetzt auf Shape zusammen\./);
  assert.equal(W.shapeWelcomeShown(row), 'stored body', 'no translator: the body');
  assert.equal(W.shapeWelcomeShown({ ...row, metadata: { shape: 'welcome' } }, trFor(de)), 'stored body', 'no coach name: the body');
  assert.equal(W.shapeWelcomeShown(row, () => { throw new Error('x'); }), 'stored body');
  assert.equal(W.shapeWelcomeShown(row, (k) => k), 'stored body', 'a raw key is never shown');
  assert.equal(W.shapeWelcomeShown({ sender_id: 'u', body: 'hi', metadata: {} }, trFor(de)), 'hi', 'a person\'s message is untouched');
});

test('the four thread strings in all 13 catalogs, placeholders kept', () => {
  for (const loc of LOCALES) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/feed.json`));
    for (const key of ['thread.yourClient', 'thread.fromShape', 'thread.shapeWelcome', 'thread.shapeWelcomeNoClient']) {
      assert.ok(typeof cat[key] === 'string' && cat[key].trim(), `${loc}: ${key}`);
    }
    assert.ok(cat['thread.shapeWelcome'].includes('{client}') && cat['thread.shapeWelcome'].includes('{coach}'), `${loc}: shapeWelcome placeholders`);
    assert.ok(cat['thread.shapeWelcomeNoClient'].includes('{coach}') && !cat['thread.shapeWelcomeNoClient'].includes('{client}'), `${loc}: shapeWelcomeNoClient placeholders`);
  }
});

// ── The migration ────────────────────────────────────────────────────────────────────────────────
test('migration: the welcome is posted once per thread, by the service role only', () => {
  assert.match(SQL_CODE, /create unique index if not exists messages_shape_welcome_uidx\s+on public\.messages \(conversation_id\)\s+where sender_id is null and \(metadata->>'shape'\) = 'welcome'/);
  assert.match(SQL_CODE, /on conflict \(conversation_id\) where sender_id is null and \(metadata->>'shape'\) = 'welcome'\s+do nothing\s+returning id into v_msg/);
  assert.match(SQL_CODE, /return query select v_conv, v_msg is not null;/, 'it says whether THIS call posted the welcome');
  assert.match(SQL_CODE, /revoke all on function public\.open_coach_thread\(uuid, text, bigint, text, text\) from public, anon, authenticated;\s+grant execute on function public\.open_coach_thread\(uuid, text, bigint, text, text\) to service_role;/);
  assert.match(SQL_CODE, /revoke all on function public\.get_or_create_client_conversation\(uuid, text\) from public, anon;\s+grant execute on function public\.get_or_create_client_conversation\(uuid, text\) to authenticated, service_role;/);
  for (const fn of ['open_coach_thread', 'get_or_create_client_conversation']) {
    const body = SQL_CODE.slice(SQL_CODE.indexOf(`function public.${fn}(`));
    assert.match(body.slice(0, 600), /security definer\s+set search_path = public, pg_temp/, `${fn}: definer, pinned`);
  }
  assert.match(SQL_CODE, /exception when unique_violation then/, 'a lost race reads the winner\'s thread');
});

// Codex on #2360, seventh round: the coach's unread count (dm_unread, mark_conversation_read) goes
// through conversation_participants, so the coach has to be one. Checked on PostgreSQL 16: a hire,
// a coach's new thread and a coach reopening a thread they were missing from all leave both rows;
// an unclaimed listing leaves the client's alone; a second run changes nothing.
test('migration: the coach is a participant of every coach thread, for their unread count', () => {
  const open = SQL_CODE.slice(SQL_CODE.indexOf('function public.open_coach_thread('), SQL_CODE.indexOf('function public.get_or_create_client_conversation('));
  assert.match(open, /select t\.name, t\.owner_id into v_name, v_owner from public\.trainers t where t\.id = p_provider_id;/);
  assert.match(open, /select n\.name, n\.owner_id into v_name, v_owner from public\.nutritionists n where n\.id = p_provider_id;/);
  assert.match(open, /if v_owner is not null then\s+insert into public\.conversation_participants \(conversation_id, user_id, role\)\s+values \(v_conv, v_owner, p_provider_role\)\s+on conflict \(conversation_id, user_id\) do nothing;\s+end if;/);
  const coach = SQL_CODE.slice(SQL_CODE.indexOf('function public.get_or_create_client_conversation('), SQL_CODE.indexOf('revoke all on function public.open_coach_thread'));
  // On the existing-thread path, before it returns, and on a new thread.
  assert.match(coach, /if v_conv is not null then\s+insert into public\.conversation_participants \(conversation_id, user_id, role\)\s+values \(v_conv, v_uid, p_provider_role\)\s+on conflict \(conversation_id, user_id\) do nothing;\s+return v_conv;\s+end if;/);
  assert.match(coach, /values \(v_conv, p_client_id, 'client'\), \(v_conv, v_uid, p_provider_role\)\s+on conflict \(conversation_id, user_id\) do nothing;/);
  // Threads opened before this: the backfill, and the guard that holds it.
  assert.match(SQL_CODE, /insert into public\.conversation_participants \(conversation_id, user_id, role\)\s+select c\.id, coalesce\(t\.owner_id, n\.owner_id\), c\.provider_role\s+from public\.conversations c[\s\S]{0,300}where c\.kind = 'direct' and coalesce\(t\.owner_id, n\.owner_id\) is not null\s+on conflict \(conversation_id, user_id\) do nothing;/);
  assert.match(SQL_CODE, /raise exception 'a direct thread with a claimed listing is missing its coach as a participant';/);
});

test('migration: a coach opens a thread only for their own client, with the listing of that role', () => {
  const body = SQL_CODE.slice(SQL_CODE.indexOf('function public.get_or_create_client_conversation('), SQL_CODE.indexOf('revoke all on function public.open_coach_thread'));
  assert.match(body, /if v_uid is null then\s+raise exception 'Authentication is required\.' using errcode = '42501';/);
  assert.match(body, /from public\.trainers t where t\.owner_id = v_uid/);
  assert.match(body, /from public\.nutritionists n where n\.owner_id = v_uid/);
  // Every leg of the relationship is held to THIS listing (role and id), not to any of the caller's.
  for (const leg of ['subscriptions s', 'sessions s', 'one_time_purchases p']) {
    const at = body.indexOf(`from public.${leg}`);
    assert.ok(at > 0, leg);
    assert.match(body.slice(at, at + 260), /provider_role = p_provider_role and \w\.provider_id = v_pid/, `${leg}: held to the listing`);
  }
  assert.match(body, /s\.status in \('active', 'trialing'\)/);
  assert.match(body, /coalesce\(s\.status, ''\) not in \('cancelled', 'canceled', 'declined'\)\s+and s\.scheduled_at >= now\(\) - interval '90 days'/);
  assert.match(body, /p\.kind = 'booking' and p\.status = 'paid'\s+and p\.created_at >= now\(\) - interval '90 days'/);
  assert.match(body, /raise exception 'This member is not your client\.' using errcode = '42501';/);
  // An existing thread is answered before the check: the coach can already read it through RLS.
  assert.ok(body.indexOf('if v_conv is not null then') < body.indexOf("raise exception 'This member is not your client"));
});

// ── The server: startCoaching / welcomeMember ───────────────────────────────────────────────────
function fakeAdmin({ provider = { name: 'Tom Trainer', owner_id: 'coach-1' }, client = { full_name: 'Cara Diaz' }, rpcResult = { data: [{ thread_id: 'conv-1', welcomed: true }], error: null }, emails = { 'coach-1': 'tom@example.com', 'client-1': 'cara@example.com' } } = {}) {
  const calls = { from: [], rpc: [] };
  const admin = {
    from(table) {
      calls.from.push(table);
      const row = table === 'profiles' ? client : provider;
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: row, error: null }) };
      return q;
    },
    async rpc(name, args) { calls.rpc.push([name, args]); return rpcResult; },
    auth: { admin: { getUserById: async (id) => ({ data: { user: emails[id] ? { email: emails[id] } : null } }) } },
  };
  return { admin, calls };
}

async function loadCoachThread({ stored = true } = {}) {
  const sent = { notifications: [], emails: [] };
  const emails = await loadRealModule(join(ROOT, 'src/lib/coach-application-emails.ts'), { typescript: true });
  const mod = await loadRealModule(join(ROOT, 'src/lib/coach-thread.ts'), {
    typescript: true,
    registry: new Map([
      ['@/lib/notify', { createNotification: async (_c, n) => { sent.notifications.push(n); return typeof stored === 'function' ? stored(n) : stored; } }],
      ['@/lib/email', { sendEmail: async (e) => { sent.emails.push(e); return { ok: true }; } }],
      ['@/lib/coach-application-emails', emails],
    ]),
  });
  return { mod, sent };
}

test('startCoaching: the thread with the welcome, the coach alerted and emailed with the name, the member emailed', async () => {
  const { mod, sent } = await loadCoachThread();
  const { admin, calls } = fakeAdmin();
  const out = await mod.startCoaching(admin, { clientId: 'client-1', providerRole: 'trainer', providerId: 7, subscriptionKey: 'sub_123', monthlyCents: 8500 });
  assert.deepEqual(out, { conversationId: 'conv-1', welcomed: true, coachAlerted: true });
  assert.equal(calls.rpc.length, 1);
  const [name, args] = calls.rpc[0];
  assert.equal(name, 'open_coach_thread');
  assert.deepEqual({ ...args, p_welcome: undefined }, { p_client_id: 'client-1', p_provider_role: 'trainer', p_provider_id: 7, p_welcome: undefined, p_client_name: 'Cara' });
  assert.equal(args.p_welcome, W.shapeWelcomeText({ client: 'Cara', coach: 'Tom Trainer' }));
  assert.equal(sent.notifications.length, 1);
  const n = sent.notifications[0];
  assert.equal(n.userId, 'coach-1');
  assert.equal(n.type, 'new_client');
  assert.equal(n.title, 'New client: Cara Diaz');
  assert.match(n.body, /^Cara Diaz subscribed · \$85\.00\/mo to you\. /);
  assert.equal(n.route, 'chat:conv-1', 'the alert opens the thread (Codex on #2360: "messages" opened nothing)');
  assert.deepEqual(n.data, { dedupe: 'hire:sub_123', clientId: 'client-1', conversationId: 'conv-1', providerRole: 'trainer', side: 'coach' });
  // What a push and the in-app list open (Fable on #2372): the trainer app, from any other app.
  const pushed = ROUTES.canonicalRoute(n.route, n.data);
  assert.equal(pushed, 'chat:coach:trainer:conv-1');
  const p = ROUTES.parseRoute(pushed);
  const detail = { conversationId: p.id, side: p.side, role: p.role, fromNotification: true };
  assert.equal(ROUTER.bsChatOwner(detail, 'client'), 'trainer');
  assert.equal(ROUTER.bsChatOwner(detail, 'nutritionist'), 'trainer');
  assert.equal(ROUTER.bsChatOwner(detail, 'trainer'), null);
  assert.deepEqual(sent.emails.map((e) => [e.to, e.subject]), [
    ['tom@example.com', 'New client: Cara Diaz'],
    ['cara@example.com', "You're working with Tom Trainer on Shape"],
  ]);
  assert.match(sent.emails[0].text, /\/newdesign\/TrainerMessages\.html\?client=client-1/);
  assert.match(sent.emails[0].text, /\/newdesign\/TrainerApp\.html#client\/client-1/);
  assert.match(sent.emails[1].text, /\/newdesign\/ClientApp\.html#team/);
});

test('startCoaching sends each part once: a redelivered event, an existing welcome, an unclaimed listing, a failed open', async () => {
  // A redelivery: the dedupe row exists (createNotification answers false) and the welcome is
  // already there (welcomed false). Nothing is sent again.
  {
    const { mod, sent } = await loadCoachThread({ stored: false });
    const { admin } = fakeAdmin({ rpcResult: { data: [{ thread_id: 'conv-1', welcomed: false }], error: null } });
    const out = await mod.startCoaching(admin, { clientId: 'client-1', providerRole: 'trainer', providerId: 7, subscriptionKey: 'sub_123' });
    assert.deepEqual(out, { conversationId: 'conv-1', welcomed: false, coachAlerted: false });
    assert.equal(sent.emails.length, 0, 'no email without a stored alert or a new welcome');
  }
  // A listing nobody has claimed: no coach to alert; the member is still welcomed.
  {
    const { mod, sent } = await loadCoachThread();
    const { admin } = fakeAdmin({ provider: { name: 'Unclaimed', owner_id: null } });
    const out = await mod.startCoaching(admin, { clientId: 'client-1', providerRole: 'nutritionist', providerId: 9, subscriptionKey: 'sub_9' });
    assert.equal(out.coachAlerted, false);
    assert.equal(sent.notifications.length, 0);
    assert.deepEqual(sent.emails.map((e) => e.to), ['cara@example.com']);
    assert.match(sent.emails[0].text, /thread with your nutritionist/);
  }
  // Before the migration (or a failed open): the coach is still told, the member is not emailed
  // about a thread that was not opened.
  {
    const { mod, sent } = await loadCoachThread();
    const { admin } = fakeAdmin({ rpcResult: { data: null, error: { message: 'missing', code: 'PGRST202' } } });
    const out = await mod.startCoaching(admin, { clientId: 'client-1', providerRole: 'trainer', providerId: 7, subscriptionKey: 'sub_1' });
    assert.deepEqual(out, { conversationId: null, welcomed: false, coachAlerted: true });
    assert.deepEqual(sent.emails.map((e) => e.to), ['tom@example.com']);
    assert.equal(sent.notifications[0].route, 'client', 'no thread: the alert opens the client page');
    // ⚠ AND IT CLAIMS NO THREAD (Codex on #2360, sixth round): neither the alert nor the email says
    // one is open, or that a welcome is waiting in it.
    assert.doesNotMatch(sent.notifications[0].body, /thread with them is open/);
    assert.match(sent.notifications[0].body, /say hello from Messages\.$/);
    assert.doesNotMatch(sent.emails[0].text, /is open|welcome from Shape/);
    assert.match(sent.emails[0].text, /Say hello from Messages:\n.*\/newdesign\/TrainerMessages\.html\?client=client-1/);
  }
  // No name on file: the alert still names "A new client", never "undefined".
  {
    const { mod, sent } = await loadCoachThread();
    const { admin } = fakeAdmin({ client: { full_name: null } });
    await mod.startCoaching(admin, { clientId: 'client-1', providerRole: 'trainer', providerId: 7, subscriptionKey: 'sub_2' });
    assert.equal(sent.notifications[0].title, 'New client: A new client');
    assert.doesNotMatch(JSON.stringify(sent), /undefined|null subscribed/);
  }
  // A throw anywhere never escapes: the payment is already recorded.
  {
    const { mod } = await loadCoachThread();
    const admin = { from() { throw new Error('boom'); } };
    const out = await mod.startCoaching(admin, { clientId: 'client-1', providerRole: 'trainer', providerId: 7, subscriptionKey: 'x' });
    assert.deepEqual(out, { conversationId: null, welcomed: false, coachAlerted: false });
  }
});

test('welcomeMember: once per member, in the app and by email', async () => {
  const { mod, sent } = await loadCoachThread();
  const { admin } = fakeAdmin();
  assert.equal(await mod.welcomeMember(admin, 'client-1'), true);
  assert.deepEqual(sent.notifications.map((n) => [n.userId, n.type, n.title, n.data.dedupe]), [['client-1', 'membership_welcome', 'Welcome to Shape', 'membership-welcome']]);
  assert.deepEqual(sent.emails.map((e) => [e.to, e.subject]), [['cara@example.com', 'Welcome to Shape']]);
  assert.match(sent.emails[0].html, /Welcome to Shape, Cara\./);
  const again = await loadCoachThread({ stored: false });
  assert.equal(await again.mod.welcomeMember(fakeAdmin().admin, 'client-1'), false);
  assert.equal(again.sent.emails.length, 0, 'a second start (the dedupe row exists) sends nothing');
});

test('the emails escape what a person typed', async () => {
  const { mod } = await loadCoachThread();
  const e = mod.coachHireEmail({ clientName: '<b>Eve</b>', role: 'nutritionist', clientId: 'c-1', site: 'https://x.test' });
  assert.doesNotMatch(e.html, /<b>Eve<\/b>/);
  assert.match(e.html, /&lt;b&gt;Eve&lt;\/b&gt;/);
  assert.match(e.text, /https:\/\/x\.test\/newdesign\/NutritionistMessages\.html\?client=c-1/);
  const m = mod.memberHireEmail({ coachName: '<i>Tom</i>', role: 'trainer', firstName: 'Cara', site: 'https://x.test' });
  assert.doesNotMatch(m.html, /<i>Tom<\/i>/);
});

// ── The webhook ──────────────────────────────────────────────────────────────────────────────────
test('webhook: the coach is told only after the subscription is saved, and the nameless bell is gone', () => {
  const src = read('src/app/api/stripe/webhook/route.ts');
  assert.doesNotMatch(src, /'New subscriber'/);
  const at = src.indexOf('await startCoaching(admin, {');
  assert.ok(at > 0);
  const guard = src.slice(src.lastIndexOf('if (', at), at);
  assert.match(guard, /^if \(!subErr && moneyMoved && !subEnded && providerId && \(providerRole === 'trainer' \|\| providerRole === 'nutritionist'\)\) \{/);
  // Only once the money has moved (Codex on #2360): an `unpaid` completion (a bank debit) waits
  // for async_payment_succeeded, which runs this same branch with `paid`.
  assert.match(src, /const moneyMoved = session\.payment_status === 'paid' \|\| session\.payment_status === 'no_payment_required';/);
  assert.ok(src.indexOf('const moneyMoved') < src.indexOf("if (meta?.plan === 'shape_platform')"), 'decided before either branch');
  assert.ok(at > src.indexOf(".from('subscriptions')\n          .upsert("), 'after the save');
  assert.match(src.slice(at, at + 400), /subscriptionKey: subRow\.stripe_subscription_id \|\| session\.id,/);
  // The membership: welcomed only when its row was saved.
  assert.match(src, /const membershipSaved = await upsertPlatformSubscription\(admin, \{/);
  // …and only while Stripe says the membership has not ended (client-onboarding review, L9).
  assert.match(src, /if \(membershipSaved && moneyMoved && !subEnded\) await welcomeMember\(admin, clientId\);/);
  const helper = src.slice(src.indexOf('async function upsertPlatformSubscription('), src.indexOf('export async function POST'));
  assert.match(helper, /return !error;\s*\}\s*$/);
});

// ── The coach's Messages routes ──────────────────────────────────────────────────────────────────
test('coach Messages: the welcome from neither side, names from the profile, and the open-a-thread call', async () => {
  const lib = await loadRealModule(join(ROOT, 'src/lib/coach-messages.ts'), { typescript: true, registry: new Map([['@/lib/supabase/server', {}]]) });
  assert.deepEqual(lib.coachThreadMessage({ id: 'm1', sender_id: null, body: 'Welcome', metadata: { shape: 'welcome' }, created_at: 't' }, 'me'),
    { id: 'm1', body: 'Welcome', mine: false, createdAt: 't', shape: true });
  assert.deepEqual(lib.coachThreadMessage({ id: 'm2', sender_id: 'me', body: 'hi', metadata: {}, created_at: 't' }, 'me'),
    { id: 'm2', body: 'hi', mine: true, createdAt: 't' });
  assert.equal(lib.coachThreadMessage({ id: 'm3', sender_id: null, body: 'x', metadata: { shape: 'other' }, created_at: 't' }, 'me').shape, undefined);
  assert.deepEqual(lib.coachThreadMessage({ id: 'm4', sender_id: 'client-1', body: 'x', metadata: { shape: 'welcome' }, created_at: 't' }, 'me'),
    { id: 'm4', body: 'x', mine: false, createdAt: 't' }, 'a person\'s message is never Shape\'s, whatever its metadata says');

  const rpcs = [];
  const sb = (answer) => ({ rpc: async (n, a) => { rpcs.push([n, a]); return answer; } });
  const names = await lib.clientNames(sb({ data: [{ user_id: 'a', full_name: 'Ana Real' }], error: null }), ['a', 'b', 'a'], new Map([['a', 'Ana Booking'], ['b', 'Bo Booking']]));
  assert.deepEqual([...names], [['a', 'Ana Real'], ['b', 'Bo Booking']], 'the profile name wins, a booking name fills in');
  assert.deepEqual(rpcs.at(-1), ['get_display_names', { p_ids: ['a', 'b'] }]);
  const failed = await lib.clientNames(sb({ data: null, error: { message: 'x' } }), ['a'], new Map([['a', 'Ana Booking']]));
  assert.deepEqual([...failed], [['a', 'Ana Booking']], 'a failed read keeps what was known');

  const id = '00000000-0000-0000-0000-00000000000c';
  assert.deepEqual(await lib.openClientThread(sb({ data: 'conv-9', error: null }), id, 'nutritionist'), { status: 200, body: { ok: true, conversationId: 'conv-9' } });
  assert.deepEqual(rpcs.at(-1), ['get_or_create_client_conversation', { p_client_id: id, p_provider_role: 'nutritionist' }]);
  assert.equal((await lib.openClientThread(sb({ data: null, error: { code: '42501', message: 'no' } }), id, 'trainer')).status, 403);
  assert.equal((await lib.openClientThread(sb({ data: null, error: { code: 'PGRST202', message: 'no' } }), id, 'trainer')).status, 503);
  assert.equal((await lib.openClientThread(sb({ data: null, error: { code: 'XX000', message: 'no' } }), id, 'trainer')).status, 500);
  const before = rpcs.length;
  assert.equal((await lib.openClientThread(sb({}), 'not-a-uuid', 'trainer')).status, 400);
  assert.equal(rpcs.length, before, 'a malformed id never reaches the database');

  for (const role of ['trainer', 'nutritionist']) {
    const route = read(`src/app/api/${role}/messages/route.ts`);
    assert.match(route, /\.select\('id, conversation_id, sender_id, body, metadata, created_at'\)/, `${role}: reads the marker`);
    assert.match(route, /arr\.push\(coachThreadMessage\(m, user\.id\)\);/);
    assert.match(route, /const names = await clientNames\(supabase, conversations\.map\(\(c\) => c\.client_id as string\), nameByClient\);/);
    assert.match(route, new RegExp(`const opened = await openClientThread\\(supabase, body\\.openClientId, '${role}'\\);`));
    const page = read(`public/newdesign/${role === 'trainer' ? 'Trainer' : 'Nutritionist'}Messages.html`);
    assert.match(page, /const wanted = params\.get\('client'\);/);
    assert.match(page, /body: JSON\.stringify\(\{ openClientId: wanted \}\)/);
    assert.match(page, /const pick = selectConv && d\.threads\.find\(t => t\.id === selectConv\);/);
    assert.match(page, /selected\.messages\.map\(\(m\) => m\.shape \? \(/);
    assert.match(page, />From Shape</);
  }
});

// ── The website's coach buttons and chat ─────────────────────────────────────────────────────────
test('website: a coach\'s Message with the client id opens the thread the client sees', () => {
  const src = read('public/newdesign/dashToday.jsx');
  const fn = src.slice(src.indexOf('function dashMessageHref('), src.indexOf('function dashMessageClient('));
  const dashMessageHref = new Function(`${fn}; return dashMessageHref;`)();
  const U = '0f8fad5b-d9cb-469f-a165-70867728950e';
  assert.equal(dashMessageHref('trainer', U), `/newdesign/TrainerMessages.html?client=${U}`);
  assert.equal(dashMessageHref('nutritionist', U, 'Hi there'), `/newdesign/NutritionistMessages.html?client=${U}&draft=Hi%20there`);
  assert.equal(dashMessageHref('client', U), null, 'a member keeps the bubble');
  assert.equal(dashMessageHref('trainer', null), null, 'no id: the bubble, as before');
  assert.equal(dashMessageHref('trainer', 'me'), null);
  assert.equal(dashMessageHref('trainer', 'demo-3'), null, 'a demo client is not an account');
  assert.match(src, /function dashMessageClient\(name, role, draft, clientId\) \{\s+const href = dashMessageHref\(role, clientId, draft\);\s+if \(href\) \{ window\.location\.href = href; return; \}/);
  // The coach call sites pass the id they hold.
  for (const [file, call] of [
    ['public/newdesign/dashRoster.jsx', 'dashMessageDraft(row) : null, rec.profile.id)'],
    ['public/newdesign/dashWeek.jsx', 'dashMessageDraft(row) : null, rec.profile.id)'],
    ['public/newdesign/dashMealBuilder.jsx', 'build your first week.", c.profile.id)'],
    ['public/newdesign/dashToday.jsx', 'dashCongratsDraft(r.client, r.hit), r.client.profile.id)'],
    ['public/newdesign/dashToday.jsx', 'dashMessageDraft(r), c.profile.id)'],
    ['public/newdesign/dashToday.jsx', 'Well done!" : undefined, m.id)'],
    ['public/newdesign/dashToday.jsx', 'proudest of so far?", h.id)'],
    ['public/newdesign/dashToday.jsx', '". ", open.clientId)'],
    // Codex on #2360, fifth round: the joint note between a client's two coaches went to the bubble.
    ['public/newdesign/dashToday.jsx', 'dashJointDraft(j, role), j.client.profile.id)'],
    ['public/newdesign/coachClientDetail.jsx', 'dashMessageClient(data.client.name, myRole, undefined, clientId)'],
  ]) assert.ok(read(file).includes(call), `${file}: ${call}`);
  // The standalone client page (no dashboard helper) goes to the same page.
  const detail = read('public/newdesign/coachClientDetail.jsx');
  assert.match(detail, /Messages\.html\?client=" \+ encodeURIComponent\(clientId\);/);
  assert.match(detail, /\(myRole === "trainer" \|\| myRole === "nutritionist"\) && \/\^\[0-9a-f\]\{8\}-/, 'only a real account id');
});

test('website chat: Shape\'s welcome is a note, not a message from the coach', () => {
  const src = read('public/newdesign/chatWidget.jsx');
  assert.match(src, /if \(!m\.sender_id && m\.metadata && m\.metadata\.shape === "welcome"\) \{\s+return \{ who: "Shape", t: m\.body, time: ts2, me: false, shape: true, userId: null \};/);
  assert.match(src, /\{active\?\.messages\?\.map\(\(m, i\) => \{\s+if \(m && m\.shape\) \{/);
});

// ── The app ──────────────────────────────────────────────────────────────────────────────────────
test('app backend: the coach side names the client, the welcome is from neither side, the coach opens the client\'s thread', async () => {
  const src = read('mobile-app/src/services/shapeBackend.js');
  const fnSrc = (name) => {
    const at = src.indexOf(`function ${name}(`);
    let depth = 0, i = src.indexOf(') {', at) + 2; // the body's brace, not a default parameter's
    for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
    return src.slice(at, i + 1);
  };
  const state = { user: { id: 'coach-1' } };
  const conversationToThread = new Function('state', 'isShapeWelcome', `${fnSrc('conversationToThread')}; return conversationToThread;`)(state, W.isShapeWelcome);
  const conv = { id: 'c1', provider_role: 'trainer', provider_id: 7, client_id: 'client-1', title: 'Tom Trainer', last_message: 'x' };
  const msgs = [
    { id: 'w', sender_id: null, body: 'Welcome', metadata: { shape: 'welcome', coach: 'Tom Trainer' }, created_at: '2026-10-15T00:00:00Z' },
    { id: 'a', sender_id: 'client-1', body: 'Hi coach', metadata: {}, created_at: '2026-10-15T00:01:00Z' },
    { id: 'b', sender_id: 'coach-1', body: 'Hi Cara', metadata: {}, created_at: '2026-10-15T00:02:00Z' },
  ];
  const coachSide = conversationToThread(conv, msgs, { 'client-1': 'Cara Diaz' });
  assert.equal(coachSide.as_coach, true);
  assert.equal(coachSide.who, 'Cara Diaz');
  assert.equal(coachSide.bucket, 'CLIENT');
  assert.deepEqual(coachSide.messages.map((m) => [m.who, m.me, m.coach, !!m.shape]), [['Shape', false, false, true], ['Cara Diaz', false, false, false], ['You', true, false, false]]);
  assert.equal(conversationToThread(conv, [], {}).who, 'Client', 'no name: "Client"');
  state.user.id = 'client-1';
  const clientSide = conversationToThread(conv, msgs, {});
  assert.equal(clientSide.as_coach, false);
  assert.equal(clientSide.who, 'Tom Trainer');
  assert.equal(clientSide.bucket, 'COACH');
  assert.deepEqual(clientSide.messages.map((m) => [m.who, m.me, m.coach, !!m.shape]), [['Shape', false, false, true], ['You', true, false, false], ['Tom Trainer', false, true, false]]);
  // A coach↔coach care-team thread (no provider) keeps its title.
  state.user.id = 'coach-1';
  assert.equal(conversationToThread({ id: 'c2', provider_role: null, client_id: 'client-1', title: 'Care team' }, [], { 'client-1': 'Cara' }).who, 'Care team');

  assert.match(src, /await supabase\.rpc\('get_or_create_client_conversation', \{\s+p_client_id: clientId,\s+p_provider_role: normalizeProviderRoleForMessages\(providerRole\),/);
  assert.match(src, /getOrCreateClientConversation,\s+getConversationThread,/);
  assert.match(fnSrc('listDirectCoachThreads'), /const names = await clientNamesFor\(conversations \|\| \[\]\);/);
  assert.match(fnSrc('clientNamesFor'), /\.filter\(c => c && c\.provider_role && c\.client_id && c\.client_id !== myId\)/);
});

test('app: both coach shells open the client\'s thread first, with their own role', () => {
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  for (const [shell, role] of [['function BSTrainerAppInner(', 'trainer'], ['function BSNutritionistAppInner(', 'nutritionist']]) {
    const at = pros.indexOf(shell);
    const body = pros.slice(at, pros.indexOf("window.addEventListener('shape:proMessageClient', onMsg);", at));
    const client = body.indexOf(`getOrCreateClientConversation({ clientId: uid, providerRole: '${role}' })`);
    const member = body.indexOf('getOrCreateMemberConversation({ otherUserId: uid })');
    assert.ok(client > 0, `${role}: the client's thread`);
    assert.ok(member > client, `${role}: the member chat only as the fallback`);
    assert.match(body.slice(member - 200, member), /if \(!cid && uid && window\.ShapeMessages\?\.getOrCreateMemberConversation\)/);
  }
});

test('app: the thread view loads its history by id, shows the welcome as a note, and a member never lists a client thread', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /import \{ isShapeWelcome, shapeWelcomeShown \} from '\.\.\/services\/shapeWelcome\.mjs';/);
  const thread = client.slice(client.indexOf('function BSChatThread('), client.indexOf('function BSChatThread(') + 9000);
  assert.match(thread, /if \(!thread\.conversationId \|\| \(thread\.messages && thread\.messages\.length\) \|\| !window\.ShapeMessages\?\.getConversationThread\) return;/);
  assert.match(thread, /: \(historyHere && historyHere\.length\) \? historyHere/);
  // One conversation's history never shows in another (Codex on #2360).
  assert.match(thread, /React\.useEffect\(\(\) => \{\s+setHistory\(null\);/);
  assert.match(thread, /res\.data\.conversation_id === id && Array\.isArray\(res\.data\.messages\)\) setHistory\(\{ id, messages: res\.data\.messages \}\)/);
  assert.match(thread, /const historyHere = history && history\.id === thread\.conversationId \? history\.messages : null;/);
  assert.match(client, /<BSChatThread\s+key=\{openChat\.conversation_id \|\| \(openChat\.channelId != null \? 'ch:' \+ openChat\.channelId : 'n:' \+ \(openChat\.n \|\| ''\)\)\}/);
  assert.match(thread, /if \(isShapeWelcome\(row\)\) \{ setExtras/);
  assert.match(client, /if \(m\.shape\) \{\s+return \(/);
  assert.match(client, /\{shapeWelcomeShown\(m\.shape, tr\) \|\| m\.t\}/);
  assert.match(client, /tr\('feed:thread\.fromShape', \{ defaultValue: 'From Shape' \}\)/);
  assert.match(client, /const _coachView = !!roleProp && roleProp !== 'client';\s+const threadRows = \(coachThreads \|\| \[\]\)\.filter\(th => _coachView \|\| !th\.as_coach\)/);
  assert.match(client, /s: th\.as_coach \? tr\('feed:thread\.yourClient', \{ defaultValue: 'Your client' \}\)/);
  assert.match(client, /shape: m\.shape \|\| null,/);
  assert.match(client, /const listed = \(threadRows \|\| \[\]\)\.find\(r => r\.conversation_id === openRequest\.conversationId\);/);
  // Member views that pick "my coach" from these threads never pick one of the account's own clients.
  assert.equal((client.match(/\.filter\(\(?c\)? => !c\.as_coach\)/g) || []).length, 2, 'the dispatch register and the profile chip');
  // The launch telegram's coach note reads the member's threads through bsWireCoachNote (its
  // behaviour is in tests/daily-wire.test.mjs), which skips a thread held as the coach.
  assert.match(read('mobile-app/src/services/dailyWire.mjs'), /\.filter\(\(th\) => th && !th\.as_coach\)/);
  assert.match(read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx'), /return bsWireCoachNote\(res && res\.data\);/);
});

test('the new-client alert opens the thread: the app\'s router and the website\'s inbox both read "chat:<id>"', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const events = [];
  const route = routerWith((e) => events.push([e.type, e.detail]));
  assert.equal(route('chat:conv-9'), true);
  assert.deepEqual(events, [['shape:openConversation', { conversationId: 'conv-9' }]]);
  assert.equal(route('chat:'), false, 'no id, nothing to open');
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  assert.equal((pros.match(/window\.addEventListener\('shape:openConversation', open\);/g) || []).length, 2, 'both coach shells answer it');

  const shell = read('public/newdesign/pageShell.jsx');
  const fn = shell.slice(shell.indexOf('const DASH_INBOX_ROUTES = {'), shell.indexOf('// ⚠ A SHAPE CHECK, NOT A TRUST FALL.'));
  const href = new Function('window', `${fn}; return dashInboxHref;`)({});
  assert.equal(href({ route: 'chat:conv-9' }, 'trainer'), '/newdesign/TrainerMessages.html?conversation=conv-9');
  assert.equal(href({ route: 'chat:conv-9' }, 'nutritionist'), '/newdesign/NutritionistMessages.html?conversation=conv-9');
  assert.equal(href({ route: 'chat:conv-9' }, 'client'), null, 'a member\'s chat is the bubble, not a page');
  for (const role of ['Trainer', 'Nutritionist']) {
    const page = read(`public/newdesign/${role}Messages.html`);
    assert.match(page, /const wantedConv = params\.get\('conversation'\);/);
    assert.match(page, /: Promise\.resolve\(\{ conv: wantedConv, failed: false \}\);/, `${role}: the thread is selected once the inbox loads`);
  }
});

// ── Codex on #2360, fifth round ──────────────────────────────────────────────────────────────────
test('the app opens the membership welcome ("home") and a new client with no thread ("client")', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const events = [];
  const route = routerWith((e) => events.push([e.type, e.detail]));
  assert.equal(route('home', {}), true);
  assert.equal(route('client', { clientId: 'client-1' }), true);
  assert.equal(route('client', {}), false, 'no client named: nothing to open');
  assert.equal(route('client:client-2'), true, 'a push carries the client in its route');
  assert.equal(route('client:'), false);
  assert.deepEqual(events, [['shape:goHome', undefined], ['shape:openClient', { clientId: 'client-1', providerRole: null, fromNotification: true }], ['shape:openClient', { clientId: 'client-2', providerRole: null, fromNotification: true }]]);
  // The member shell lands on Home, clearing the takeovers above the tabs.
  assert.match(client, /const open = \(\) => \{\s+navJumpRef\.current\.navPush\(\); setShowSettings\(false\); setSettingsStart\(''\);\s+setShowCalendar\(false\); setShowSearch\(false\); setShowCycle\(false\); setNotifPerson\(null\);\s+setChatRequest\(null\); setTab\('home'\);\s+\};\s+window\.addEventListener\('shape:goHome', open\);/);
  // Both coach shells answer shape:openClient with the Clients tab and the request, and each
  // Clients screen opens that client once the roster has them, and only them.
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  assert.equal((pros.match(/window\.addEventListener\('shape:openClient', open\);/g) || []).length, 2);
  assert.equal((pros.match(/setOpenClientReq\(\{ clientId, nonce: Date\.now\(\) \}\); setTab\('clients'\);/g) || []).length, 2);
  for (const [fn, list] of [['BSTrainerClients', 'COACH_CLIENTS'], ['BSNutriClients', 'NUTRI_CLIENTS']]) {
    assert.match(pros, new RegExp(`clients:  <${fn} sheet=\\{sheet\\} openRequest=\\{openClientReq\\} onOpenConsumed=\\{\\(\\) => setOpenClientReq\\(null\\)\\} />`), fn);
    const body = pros.slice(pros.indexOf(`function ${fn}(`), pros.indexOf(`function ${fn}(`) + 3000);
    assert.match(body, new RegExp(`if \\(!openRequest \\|\\| !openRequest\\.clientId \\|\\| rosterStatus === 'loading'\\) return;\\s+const hit = ${list}\\.find\\(\\(c\\) => c\\.userId === openRequest\\.clientId\\);\\s+if \\(hit\\) \\{ setPreviewClient\\(null\\); setFullClient\\(hit\\); \\}\\s+onOpenConsumed\\(\\);`), fn);
  }
});

// ── Codex on #2360, third round ──────────────────────────────────────────────────────────────────
test('a Messages page opens the thread it asked for, or none: never another client\'s', async () => {
  const lib = await loadRealModule(join(ROOT, 'src/lib/coach-messages.ts'), { typescript: true, registry: new Map([['@/lib/supabase/server', {}]]) });
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  assert.equal(lib.wantedConversation(new Request(`https://x.test/api/trainer/messages?conversation=${id}`)), id);
  assert.equal(lib.wantedConversation(new Request('https://x.test/api/trainer/messages?conversation=nope')), null);
  assert.equal(lib.wantedConversation(new Request('https://x.test/api/trainer/messages')), null);
  assert.equal(lib.wantedConversation(undefined), null, 'a call with no request (the existing harness) reads none');
  const calls = [];
  const sb = (row) => ({ from: (t) => { const q = { select: () => q, eq: (k, v) => { calls.push([t, k, v]); return q; }, maybeSingle: async () => ({ data: row, error: null }) }; return q; } });
  const listed = [{ id: 'a' }, { id: 'b' }];
  assert.equal(await lib.withWantedConversation(sb(null), listed, null, 'trainer', 4), listed, 'nothing asked for: the list as it is');
  assert.equal(await lib.withWantedConversation(sb(null), listed, 'b', 'trainer', 4), listed, 'already listed: no read');
  assert.equal(calls.length, 0);
  assert.deepEqual((await lib.withWantedConversation(sb({ id }), listed, id, 'nutritionist', 9)).map((c) => c.id), [id, 'a', 'b'], 'older than the 50: read and put first');
  assert.deepEqual(calls, [['conversations', 'kind', 'direct'], ['conversations', 'provider_role', 'nutritionist'], ['conversations', 'provider_id', 9], ['conversations', 'id', id]], 'held to this listing');
  assert.deepEqual((await lib.withWantedConversation(sb(null), listed, id, 'trainer', 4)).map((c) => c.id), ['a', 'b'], 'not this coach\'s: nothing added');
  for (const [role, pre] of [['trainer', 'Trainer'], ['nutritionist', 'Nutritionist']]) {
    const route = read(`src/app/api/${role}/messages/route.ts`);
    assert.match(route, /export async function GET\(request\?: Request\) \{/);
    assert.match(route, /const wanted = wantedConversation\(request\);/);
    assert.match(route, new RegExp(`const conversations = await withWantedConversation\\(supabase, convRows \\?\\? \\[\\], wanted, '${role}', providerId\\);`));
    const page = read(`public/newdesign/${pre}Messages.html`);
    assert.match(page, new RegExp(`fetch\\('/api/${role}/messages' \\+ \\(selectConv \\? '\\?conversation=' \\+ encodeURIComponent\\(selectConv\\) : ''\\)`));
    assert.match(page, /if \(selectConv && !pick\) \{\s+setSelectedId\(null\);\s+setDraft\(""\);\s+setNotice\(/, `${pre}: no fallback to another thread, and no opener left to send`);
  }
});

test('the app\'s thread shows a message once when the history and the live messages overlap', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const thread = client.slice(client.indexOf('function BSChatThread('), client.indexOf('function BSChatThread(') + 12000);
  assert.match(thread, /const seedIds = new Set\(seed\.map\(m => m && m\.id\)\.filter\(Boolean\)\);\s+const allMessages = \[\.\.\.seed, \.\.\.extras\.filter\(e => !\(e && e\.id && seedIds\.has\(e\.id\)\)\)\];/);
  // Every source carries the id: the backend's mapping, the list rows, a live row, a sent row once stored.
  assert.match(read('mobile-app/src/services/shapeBackend.js'), /messages: ordered\.map\(message => \(\{\s+id: message\.id \|\| null,/);
  assert.match(client, /messages: \(th\.messages \|\| \[\]\)\.map\(m => \(\{ id: m\.id \|\| null, who:/);
  assert.match(thread, /setExtras\(e => \[\.\.\.e, \{ id: row\.id \|\| null, who: thread\.who \|\| 'Member'/);
  assert.match(thread, /setExtras\(e => \[\.\.\.e, \{ id: row\.id \|\| null, who: 'Shape'/);
  assert.match(thread, /sent\.then\(res => \{ const id = res && res\.data && res\.data\.id; if \(id\) setExtras\(e => e\.map\(x => x\.tmpId === tmpId \? \{ \.\.\.x, id \} : x\)\); \}\)/);
});

test('a tapped push opens the thread in the coach apps too', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /^Object\.assign\(window, \{ bsRouteNotification \}\);$/m, 'still on window for older callers');
  // ⚠ EVERY SHELL IMPORTS IT (Codex on #2360, tenth round): an app that starts in a coach role never
  // loads the client module, so window.bsRouteNotification was missing there and a tapped push was lost.
  assert.match(client, /^import \{ bsRouteNotification, [^}]*\} from '\.\/bsNotificationRoute\.mjs';$/m);
  assert.doesNotMatch(client, /^function bsRouteNotification\(/m, 'one router, not a copy');
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  assert.match(pros, /^import \{ bsRouteNotification, [^}]*\} from '\.\/bsNotificationRoute\.mjs';$/m, 'the coach shells import the router');
  assert.doesNotMatch(pros, /window\.bsRouteNotification/, 'never through window, which a coach-only start never fills');
  for (const shell of ['function BSTrainerAppInner(', 'function BSNutritionistAppInner(']) {
    const at = pros.indexOf(shell);
    assert.ok(at > 0, shell);
    const body = pros.slice(at, pros.indexOf("window.removeEventListener('shape:pushRoute', fromPush); };", at) + 80);
    assert.match(body, /const fromPush = \(e\) => \{ window\.__bsPushRoute = null; bsRouteNotification\(e && e\.detail && e\.detail\.route\); \};/, shell);
    assert.match(body, /window\.addEventListener\('shape:pushRoute', fromPush\);/, shell);
    assert.match(body, /if \(pending\) \{ window\.__bsPushRoute = null; replay = setTimeout\(\(\) => bsRouteNotification\(pending\), 0\); \}/, `${shell}: a push that landed before the shell mounted, replayed once every listener is up`);
    assert.match(body, /return \(\) => \{ clearTimeout\(replay\);/, `${shell}: an unmount cancels the replay`);
    assert.ok(body.indexOf("window.addEventListener('shape:openConversation', open);") < body.indexOf('const pending = window.__bsPushRoute;'), `${shell}: the conversation listener is up before the pending route fires`);
  }
});

// ── Codex on #2360, fourth round ─────────────────────────────────────────────────────────────────
test('a client thread that cannot be opened leaves the Messages page on nothing, with no opener', () => {
  for (const pre of ['Trainer', 'Nutritionist']) {
    const page = read(`public/newdesign/${pre}Messages.html`);
    assert.match(page, /if \(openFailed\) \{\s+setSelectedId\(null\);\s+setDraft\(""\);\s+return;\s+\}/, `${pre}: no fallback after a failed open`);
    assert.match(page, /return \{ conv: null, failed: true \};\s+\}\)\)\.catch\(\(\) => \{\s+if \(!cancelled\) setNotice\("That conversation couldn't be opened\. Try again from their client page\."\);\s+return \{ conv: null, failed: true \};/, `${pre}: a network failure is a failed open too`);
    assert.match(page, /open\.then\(o => load\(o\.conv, o\.failed\)\)/);
  }
});

test('the thread asked for keeps its history in a busy inbox: its messages are read on their own', async () => {
  const lib = await loadRealModule(join(ROOT, 'src/lib/coach-messages.ts'), { typescript: true, registry: new Map([['@/lib/supabase/server', {}]]) });
  const calls = [];
  const sb = (data, error = null) => ({ from: (t) => { const q = { select: () => q, eq: (k, v) => { calls.push([t, k, v]); return q; }, order: () => q, limit: async (n) => { calls.push([t, 'limit', n]); return { data, error }; } }; return q; } });
  const rows = [{ id: 'n2', created_at: '2026-10-15T10:00:00Z' }, { id: 'n1', created_at: '2026-10-15T09:00:00Z' }];
  assert.equal(await lib.withWantedMessages(sb([]), rows, null, true), rows, 'nothing asked for');
  assert.equal(await lib.withWantedMessages(sb([]), rows, 'c', false), rows, 'not listed (not this coach\'s): not read');
  assert.equal(calls.length, 0);
  const merged = await lib.withWantedMessages(sb([{ id: 'w1', created_at: '2026-01-02T00:00:00Z' }, { id: 'n1', created_at: '2026-10-15T09:00:00Z' }]), rows, 'c', true);
  assert.deepEqual(merged.map((m) => m.id), ['n2', 'n1', 'w1'], 'merged once each, newest first');
  assert.deepEqual(calls, [['messages', 'conversation_id', 'c'], ['messages', 'limit', 200]]);
  assert.equal(await lib.withWantedMessages(sb(null, { message: 'x' }), rows, 'c', true), rows, 'a failed read keeps what was read');
  for (const role of ['trainer', 'nutritionist']) {
    const route = read(`src/app/api/${role}/messages/route.ts`);
    assert.match(route, /const allMsgRows = await withWantedMessages\(supabase, msgRows \?\? \[\], wanted, conversations\.some\(\(c\) => c\.id === wanted\)\);/);
    assert.match(route, /for \(const m of \[\.\.\.allMsgRows\]\.reverse\(\)\) \{/);
  }
});

test('a "New message" notification opens its thread: push, the app\'s list, and the website\'s inbox', async () => {
  const push = await loadRealModule(join(ROOT, 'src/app/api/push/dispatch/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', { NextResponse: { json: () => null } }], ['@/lib/supabase/admin', {}], ['@/lib/push', {}], ['@/lib/email', {}], ['@/lib/ai/notifications.mjs', await import('../src/lib/ai/notifications.mjs')], ['node:crypto', { timingSafeEqual: () => false }], ['crypto', { timingSafeEqual: () => false }]]),
  });
  assert.equal(push.pushRoute({ route: 'messages', data: { conversationId: 'conv-3' } }), 'chat:conv-3');
  assert.equal(push.pushRoute({ route: 'messages', data: {} }), 'messages', 'no id: as it was');
  assert.equal(push.pushRoute({ route: 'sessions', data: { conversationId: 'conv-3' } }), 'sessions', 'only a message notification');
  assert.equal(push.pushRoute({ route: null }), '');
  // A new-client alert with no thread: a push carries only its route, so the client rides in it.
  assert.equal(push.pushRoute({ route: 'client', data: { clientId: 'client-1' } }), 'client:client-1');
  assert.equal(push.pushRoute({ route: 'client', data: {} }), 'client', 'no id: as it was');
  assert.match(read('src/app/api/push/dispatch/route.ts'), /data: \{ route: pushRoute\(record\), type: record\.type \?\? 'general' \},/);

  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const events = [];
  const route = routerWith((e) => events.push(e.detail));
  assert.equal(route('messages', { conversationId: 'conv-3' }), true);
  assert.deepEqual(events, [{ conversationId: 'conv-3' }]);
  // No thread named (an older row): the chat itself (the notification audit).
  assert.equal(route('messages', {}), true);
  assert.deepEqual(events.at(-1), { page: 'messages', id: null, role: null, fromNotification: true });
  assert.match(client, /onRoute=\{\(route, data\) => \{[\s\S]{0,400}if \(bsRouteNotification\(route, data\)\) setShowNotifications\(false\);/);

  const shell = read('public/newdesign/pageShell.jsx');
  const fn = shell.slice(shell.indexOf('const DASH_INBOX_ROUTES = {'), shell.indexOf('// ⚠ A SHAPE CHECK, NOT A TRUST FALL.'));
  const lib = new Function('window', `${fn}; return { dashInboxHref, dashInboxThreadFor };`)({});
  const n = { route: 'messages', data: { conversationId: 'conv-3' } };
  assert.equal(lib.dashInboxHref(n, 'trainer'), '/newdesign/TrainerMessages.html?conversation=conv-3');
  assert.equal(lib.dashInboxThreadFor(n, 'trainer'), null, 'a coach goes to the page');
  assert.equal(lib.dashInboxHref(n, 'client'), null);
  assert.equal(lib.dashInboxThreadFor(n, 'client'), 'conv-3', 'a member\'s row opens the bubble on that thread');
  assert.equal(lib.dashInboxThreadFor({ route: 'messages', data: {} }, 'client'), null);
  assert.match(shell, /const threadId = dashInboxThreadFor\(n, role\);\s+return threadId \? \(/);
  assert.match(shell, /const req = dashInboxChatRequest\(n, threadId\);\s+try \{ if \(window\.__openChat\) window\.__openChat\(req\); else \{ window\.__openChatRequest = req;/);
});

// ── Codex on #2360, ninth round ──────────────────────────────────────────────────────────────────
test('an open thread that receives Shape\'s welcome keeps it read, as it does any other message', () => {
  // Codex, the review of #2360: the welcome branch returned before markConversationRead, so a thread
  // open when coaching started kept an unread badge that survived a reload.
  const src = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const start = src.indexOf('unsub = window.ShapeMessages.subscribeMessages((row) => {');
  assert.ok(start > 0, 'the conversation subscription moved');
  const handler = src.slice(start, src.indexOf('\n      });', start));
  const welcome = handler.slice(handler.indexOf('if (isShapeWelcome(row)) {'));
  const branch = welcome.slice(0, welcome.indexOf('return; }'));
  assert.match(branch, /window\.ShapeUnread\?\.markConversationRead\?\.\(thread\.conversationId\);\s*$/, 'the welcome branch marks the open thread read before it returns');
  assert.equal(handler.split('markConversationRead?.(thread.conversationId)').length - 1, 2, 'the welcome and every other message');
});

// ── Codex on #2360, twelfth round: the sweep ─────────────────────────────────────────────────────
// Rounds three to twelve each found one more surface where a notification this PR sends reached no
// screen. This checks every route the PR emits (chat:, messages, client, home) on every surface at
// once: the app's list and a tapped push (which must open the same place), both coach shells and a
// coach with both listings, and the website's member bubble.
const PUSH = await loadRealModule(join(ROOT, 'src/app/api/push/dispatch/route.ts'), {
  typescript: true,
  registry: new Map([['next/server', { NextResponse: { json: () => null } }], ['@/lib/supabase/admin', {}], ['@/lib/push', {}], ['@/lib/email', {}], ['@/lib/ai/notifications.mjs', await import('../src/lib/ai/notifications.mjs')], ['node:crypto', { timingSafeEqual: () => false }], ['crypto', { timingSafeEqual: () => false }]]),
});
const routed = (route, data) => { const out = []; const ok = routerWith((e) => out.push([e.type, e.detail]))(route, data); return { ok, out }; };

test('every notification this PR sends opens the same screen from the app\'s list and from a push', () => {
  const records = [
    { route: 'chat:c-1', data: { providerRole: 'trainer', clientId: 'u-1', conversationId: 'c-1' } },          // new-client alert, thread open
    { route: 'client', data: { providerRole: 'nutritionist', clientId: 'u-2' } },                               // new-client alert, no thread
    { route: 'client', data: { clientId: 'u-3' } },                                                            // an older alert with no role
    { route: 'messages', data: { conversationId: 'c-4', providerRole: 'trainer' } },                           // "New message", the welcome's included
    { route: 'home', data: {} },                                                                               // the membership welcome
  ];
  for (const rec of records) {
    const list = routed(rec.route, rec.data);
    const push = routed(PUSH.pushRoute(rec));
    assert.equal(list.ok, true, JSON.stringify(rec));
    assert.deepEqual(push, list, 'push and list open the same place: ' + JSON.stringify(rec));
  }
  assert.equal(PUSH.pushRoute(records[1]), 'client:nutritionist:u-2', 'the role rides in the push');
  assert.deepEqual(routed('client:trainer:u-9').out, [['shape:openClient', { clientId: 'u-9', providerRole: 'trainer', fromNotification: true }]]);
  assert.deepEqual(routed('client:u-9').out, [['shape:openClient', { clientId: 'u-9', providerRole: null, fromNotification: true }]]);
  assert.equal(routed('client:trainer:').ok, false, 'a role with no client opens nothing');
});

test('both coach shells answer every route, and a client of the other listing is handed to that role\'s shell', () => {
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  for (const [shell, role, other] of [['function BSTrainerAppInner(', 'trainer', 'nutritionist'], ['function BSNutritionistAppInner(', 'nutritionist', 'trainer']]) {
    const at = pros.indexOf(shell);
    const body = pros.slice(at, pros.indexOf('const [showSettings, setShowSettings] = useStateBSP(false);', at));
    for (const ev of ['shape:openConversation', 'shape:openClient', 'shape:goHome', 'shape:pushRoute']) {
      assert.ok(body.includes(`window.addEventListener('${ev}',`), `${role}: ${ev}`);
    }
    // The handover: the route is left for the other shell, which replays it once its listeners are up.
    assert.match(body, new RegExp(`if \\(\\(other === 'trainer' \\|\\| other === 'nutritionist'\\) && other !== '${role}'\\) \\{\\s+window\\.__bsPushRoute = 'client:' \\+ other \\+ ':' \\+ clientId;\\s+setTweak\\('role', other\\);\\s+return;`), role);
    assert.match(body, /if \(pending\) \{ window\.__bsPushRoute = null; replay = setTimeout\(\(\) => bsRouteNotification\(pending\), 0\); \}/, `${role}: the replay`);
    // Handed over, the route names the receiving shell's own role, so it opens there and goes no further.
    assert.deepEqual(routed(`client:${other}:u-1`).out, [['shape:openClient', { clientId: 'u-1', providerRole: other, fromNotification: true }]]);
    assert.match(body, /const home = \(\) => \{[\s\S]{0,300}setTab\('today'\);\s+\};/, `${role}: home lands on Today`);
  }
});

test('the website bubble opens a member\'s message on its own tab, never the Feed', () => {
  const shell = read('public/newdesign/pageShell.jsx');
  const fn = shell.slice(shell.indexOf('const DASH_INBOX_ROUTES = {'), shell.indexOf('// ⚠ A SHAPE CHECK, NOT A TRUST FALL.'));
  const { dashInboxChatRequest } = new Function('window', `${fn}; return { dashInboxChatRequest };`)({});
  assert.deepEqual(dashInboxChatRequest({ data: { providerRole: 'trainer' } }, 'c-1'), { conversationId: 'c-1', tab: 'circle', who: 'Your trainer', role: 'Trainer · Shape coach' });
  assert.equal(dashInboxChatRequest({ data: { providerRole: 'nutritionist' } }, 'c-1').who, 'Your nutritionist');
  assert.equal(dashInboxChatRequest({ data: {} }, 'c-2').tab, 'friends', 'a member\'s DM');
  // Both tab sources carry those ids.
  for (const src of ['public/newdesign/clientChatThreads.jsx', 'public/newdesign/globalChatButton.js']) {
    const text = read(src);
    assert.match(text, /id: ?"circle"/, src);
    assert.match(text, /id: ?"friends"/, src);
  }
  // The widget: a thread it has not listed goes on the tab asked for, else one that holds threads.
  const widget = read('public/newdesign/chatWidget.jsx');
  assert.match(widget, /const holdsThreads = \(t\) => !!t && !t\.feed && !t\.support;\s+const asked = tabId \? tabs\.findIndex\(t => t\.id === tabId\) : -1;\s+const targetTab = asked >= 0 && holdsThreads\(tabs\[asked\]\) \? asked\s+: holdsThreads\(tabs\[tabIdx\]\) \? tabIdx\s+: Math\.max\(0, tabs\.findIndex\(holdsThreads\)\);/);
});

test('a coach with both listings opens the notification\'s role, not the dashboard they are on', () => {
  const shell = read('public/newdesign/pageShell.jsx');
  const fn = shell.slice(shell.indexOf('const DASH_INBOX_ROUTES = {'), shell.indexOf('// ⚠ A SHAPE CHECK, NOT A TRUST FALL.'));
  const at = (win) => new Function('window', `${fn}; return dashInboxHref;`)(win);
  const inNutri = at({ __shapeCoachShell: 'nutritionist' });
  // A trainer thread from the nutritionist dashboard: the trainer Messages page, which lists it.
  assert.equal(inNutri({ route: 'messages', data: { conversationId: 'c-1', providerRole: 'trainer' } }, 'nutritionist'), '/newdesign/TrainerMessages.html?conversation=c-1');
  assert.equal(inNutri({ route: 'chat:c-2', data: { providerRole: 'trainer' } }, 'nutritionist'), '/newdesign/TrainerMessages.html?conversation=c-2');
  // A trainer client's page from the nutritionist shell: the trainer shell, not a hash switch here.
  assert.equal(inNutri({ route: 'client', data: { clientId: 'u-1', providerRole: 'trainer' } }, 'nutritionist'), 'TrainerApp.html#client/u-1');
  // Its own role: unchanged (a hash switch in the shell).
  assert.equal(inNutri({ route: 'client', data: { clientId: 'u-1', providerRole: 'nutritionist' } }, 'nutritionist'), '#client/u-1');
  assert.equal(inNutri({ route: 'messages', data: { conversationId: 'c-3' } }, 'nutritionist'), '/newdesign/NutritionistMessages.html?conversation=c-3', 'no role named: the shell\'s');
  // A member's view never takes a coach page from it.
  assert.equal(inNutri({ route: 'messages', data: { conversationId: 'c-1', providerRole: 'trainer' } }, 'client'), null);
  // The trigger names the role on every "New message" notification.
  assert.match(SQL_CODE, /create or replace function public\.notify_on_new_message\(\)[\s\S]{0,200}security definer\s+set search_path = public, pg_temp/);
  assert.match(SQL_CODE, /jsonb_build_object\('conversationId', new\.conversation_id\)\s+\|\| case when conv\.provider_role is not null then jsonb_build_object\('providerRole', conv\.provider_role\) else '\{\}'::jsonb end/);
  assert.match(SQL_CODE, /raise exception 'notify_on_new_message does not name the thread''s role';/);
});
