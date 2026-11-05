// The coach's website bell, grouped (owner, 2026-11-05): Needs you · Good news · For your information,
// one action per notice (Accept a session request, Review a check-in, Message with Nora's draft), how
// each notice reached the coach, and the day's pushes against the limit with the quiet hours.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const require = createRequire(import.meta.url);
const CB = require('../public/newdesign/coachBell.js');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

const n = (type, data = {}, extra = {}) => ({ id: type + Math.random(), type, title: type, body: '', data, read: false, createdAt: '2026-11-04T15:00:00Z', ...extra });

test('each notice lands in the group of what the coach does with it', () => {
  const cases = [
    ['ai_client_red', 'needs'], ['booking_request', 'needs'], ['checkin_submitted', 'needs'], ['session_paid', 'needs'],
    ['new_client', 'good'], ['payment', 'good'], ['client_win', 'good'], ['credential_verified', 'good'], ['waitlist_join', 'good'],
    ['ai_client_amber', 'fyi'], ['shared_client', 'fyi'], ['care_team_handoff', 'fyi'], ['client_cancelled', 'fyi'], ['credential_expiry', 'fyi'], ['follow', 'fyi'], ['ai_digest', 'fyi'], ['general', 'fyi'],
  ];
  for (const [type, group] of cases) assert.equal(CB.groupOf(n(type)), group, type);
  // A message waits on a reply when a client or a co-coach wrote (side 'coach'); a member's DM is FYI.
  assert.equal(CB.groupOf(n('message', { side: 'coach' })), 'needs');
  assert.equal(CB.groupOf(n('message', { side: 'coach', careTeam: true })), 'needs');
  assert.equal(CB.groupOf(n('message', { side: 'member' })), 'fyi');
  const g = CB.groupRows([n('ai_client_red'), n('payment'), n('follow'), n('follow')]);
  assert.deepEqual([g.needs.length, g.good.length, g.fyi.length], [1, 1, 2]);
  assert.equal(CB.summaryOf(g), '1 needs you, 1 is good news and 2 are for your information.');
  assert.equal(CB.summaryOf(CB.groupRows([n('payment'), n('new_client')])), '2 are good news.');
  assert.equal(CB.summaryOf(CB.groupRows([])), '');
});

test('one action per notice, and only where it can be taken', () => {
  assert.deepEqual(CB.actionOf(n('booking_request', { sessionId: 's1' })), { kind: 'accept', label: 'Accept', sessionId: 's1' });
  assert.equal(CB.actionOf(n('booking_request', {})), null, 'no session, nothing to accept');
  assert.deepEqual(CB.actionOf(n('checkin_submitted', { clientId: 'c1' })), { kind: 'review', label: 'Review check-in', clientId: 'c1' });
  assert.deepEqual(CB.actionOf(n('ai_client_red', { clientId: 'c1' })), { kind: 'message', label: 'Message', clientId: 'c1', draftKind: 'checkin' });
  assert.equal(CB.actionOf(n('client_win', { clientId: 'c1' })).draftKind, 'win');
  for (const t of ['payment', 'follow', 'shared_client', 'care_team_handoff', 'ai_client_red']) {
    if (t === 'ai_client_red') assert.equal(CB.actionOf(n(t, {})), null, 'a red alert without its client');
    else assert.equal(CB.actionOf(n(t, { clientId: 'c1' })), null, t);
  }
});

test('how it reached the coach: bell, phone, email, and quiet hours that held it', () => {
  const quiet = { muted: false, cap: 4, pushedToday: 3, quiet: { start: 22, end: 7, tz: 'America/New_York' } };
  // 9 am New York: pushed straight away.
  assert.equal(CB.deliveryText(CB.deliveryOf(n('payment', {}, { createdAt: '2026-11-04T14:00:00Z' }), quiet)), 'Bell · phone');
  // 3 am New York: held, sent when the night ended.
  assert.equal(CB.deliveryText(CB.deliveryOf(n('booking_request', {}, { createdAt: '2026-11-04T08:00:00Z' }), quiet)), 'Bell · phone at 7 am, held overnight');
  // Still held right now.
  assert.equal(CB.deliveryText(CB.deliveryOf(n('follow', { held_at: '2026-11-04T08:00:00Z' }), quiet)), 'Bell · phone after quiet hours (7 am)');
  // Push off for the type, or muted: the bell only. Emailed: said.
  assert.equal(CB.deliveryText(CB.deliveryOf(n('payment', { channels: { inapp: true, push: false } }), quiet)), 'Bell');
  assert.equal(CB.deliveryText(CB.deliveryOf(n('payment'), { ...quiet, muted: true })), 'Bell');
  assert.equal(CB.deliveryText(CB.deliveryOf(n('waitlist_join', { emailed_at: 'x' }, { createdAt: '2026-11-04T14:00:00Z' }), quiet)), 'Bell · phone · email');
  // A reminder the person set is never held.
  assert.equal(CB.deliveryOf(n('reminder_custom', {}, { createdAt: '2026-11-04T08:00:00Z' }), quiet).held, null);
  // Delivery unreadable: the bell and the phone, nothing claimed about quiet hours.
  assert.equal(CB.deliveryText(CB.deliveryOf(n('payment'), null)), 'Bell · phone');
});

test('the footer says the day\'s pushes against the limit, and the quiet hours', () => {
  assert.equal(CB.footerOf({ muted: false, cap: 4, pushedToday: 3, quiet: { start: 22, end: 7, tz: 'UTC' } }), 'Phone today 3 of your 4 · Quiet 10 pm – 7 am');
  assert.equal(CB.footerOf({ muted: false, cap: 6, pushedToday: null, quiet: null }), 'No quiet hours (no time zone on your profile)');
  assert.equal(CB.footerOf({ muted: true, cap: 4, pushedToday: 0, quiet: { start: 0, end: 6, tz: 'UTC' } }), 'Everything is muted · Quiet 12 am – 6 am');
  assert.equal(CB.footerOf(null), null);
  assert.equal(CB.hourLabel(12), '12 pm');
});

// ── the delivery route ─────────────────────────────────────────────────────────────────────────
function fakeDb(answer) {
  const calls = [];
  return {
    calls,
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
const deliveryRoute = (db, user = { id: 'coach-1' }) => loadRealModule(join(ROOT, 'src/app/api/notifications/delivery/route.ts'), {
  typescript: true,
  registry: new Map([['next/server', nextServer], ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => db }]]),
});

test('the delivery route: the limit, today\'s pushes on the person\'s own date, quiet hours in their zone', async () => {
  const now = Date.now();
  const db = fakeDb((q) => {
    if (q.table === 'notification_settings') return { data: { muted: false, quiet_start: 21, quiet_end: 6, tz: 'UTC', daily_cap: 6 }, error: null };
    if (q.table === 'client_profiles') return { data: { timezone: 'America/New_York' }, error: null };
    return { data: [{ created_at: new Date(now - 60_000).toISOString() }, { created_at: new Date(now - 2 * 86400000).toISOString() }], error: null };
  });
  const mod = await deliveryRoute(db);
  const body = await (await mod.GET(new Request('https://x/api/notifications/delivery'))).json();
  assert.equal(body.cap, 6);
  assert.equal(body.pushedToday, 1);
  assert.deepEqual(body.quiet, { start: 21, end: 6, tz: 'America/New_York' });
  const pushRead = db.calls.find((c) => c.table === 'notifications');
  assert.ok(pushRead.ops.some((o) => o[0] === 'eq' && o[1] === 'data->channels->>push' && o[2] === 'true'), 'only pushed rows are counted');
  assert.ok(pushRead.ops.some((o) => o[0] === 'eq' && o[1] === 'user_id' && o[2] === 'coach-1'));
  // No zone anywhere: no quiet hours; nothing saved: the default limit.
  const bare = await deliveryRoute(fakeDb((q) => (q.table === 'notifications' ? { data: null, error: { message: 'x' } } : { data: null, error: null })));
  const b2 = await (await bare.GET(new Request('https://x/api/notifications/delivery'))).json();
  assert.deepEqual(b2, { muted: false, cap: 4, pushedToday: null, quiet: null });
  const anon = await deliveryRoute(fakeDb(() => ({ data: null, error: null })), null);
  assert.equal((await anon.GET(new Request('https://x/api/notifications/delivery'))).status, 401);
});

test('pageShell keeps its header and states, and hands its rows to the grouped list on a coach shell', () => {
  const shell = read('public/newdesign/pageShell.jsx');
  assert.match(shell, /\) : \(\(\) => \{ const renderRow = \(n\) => \{\n\s+const href = dashInboxHref\(n, role, accountCoach\);/);
  assert.match(shell, /return typeof window\.CoachBellList === "function" && \(role === "trainer" \|\| role === "nutritionist"\)\n\s+\? <window\.CoachBellList rows=\{rows\} role=\{role\} markOne=\{markOne\} renderRow=\{renderRow\} \/>\n\s+: rows\.map\(renderRow\); \}\)\(\)\}/);
  // Mark all read and Clear all stay where they were.
  assert.match(shell, />Mark all read<\/button>/);
  assert.match(shell, /onClick=\{\(\) => setConfirming\(true\)\} disabled=\{busy\} style=\{headBtn\("rgba\(var\(--sh-ink-rgb, 242,237,228\),0\.5\)"\)\}>Clear all<\/button>/);
  for (const h of ['TrainerApp.html', 'NutritionistApp.html']) {
    const html = read('public/newdesign/' + h);
    assert.ok(html.indexOf('src="coachBell.js"') > 0 && html.indexOf('src="coachBell.js"') < html.indexOf('src="coachBellList.jsx"'), h);
  }
  const list = read('public/newdesign/coachBellList.jsx');
  assert.match(list, /body: JSON\.stringify\(\{ action: "confirm", sessionId: action\.sessionId \}\)/);
  assert.match(list, /fetch\("\/api\/ai\/draft-message", \{ method: "POST"/);
  assert.match(list, /fetch\("\/api\/conversations\/" \+ encodeURIComponent\(draft\.conversationId\) \+ "\/messages"/);
  assert.match(list, /fetch\("\/api\/ai\/draft-message\/sent"/);
  assert.match(list, /fetch\("\/api\/notifications\/delivery"/);
  assert.match(read('src/lib/warroom.ts'), /\['\/api\/notifications\/delivery', 'GET'\]/);
});
