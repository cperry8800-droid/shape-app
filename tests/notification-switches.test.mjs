// Push and notification fixes (owner, 2026-10-26: "fix 1-7", and "make sure users have the ability
// to customize/toggle which notifications they want").
//
// 1. A member's direct message notifies the other member (2026-10-26-push-notice-fixes.sql).
// 2. Quiet hours are the person's own night: 22:00 to 07:00 (or their saved hours) in their own zone,
//    for every sender, saved settings or not; none when no zone is known.
// 3. A notice in quiet hours is held (data.held_at) and sent once the night is over (/api/cron/push-held).
// 4. Every kind of notification has a switch (notificationSurfaces.mjs PREFERENCE_OF), and the push,
//    the list, the website's bell and the app's toast all read it.
// 5. The daily Shape Score notices answer to the Score switch.
// 6. The hourly Nora job and the daily Score job read everyone, not the first 500.
// 7. Reminders go at their minute and catch up a missed run; payment notices open something; a
//    rejected credential tells the coach; follows, co-signs and waiting-list joins are not repeated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { READER_COPY_EN } from './helpers/reader-copy-en.mjs';
import { PREFERENCE_OF, preferenceTypeFor, switchedOffFilter } from '../public/newdesign/notificationSurfaces.mjs';
import { quietWindow, inQuietHours } from '../src/lib/ai/notifications.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const TIME = await loadRealModule(join(ROOT, 'src/lib/time.ts'), { typescript: true });

// ── 4 and 5. The switch each notification answers to ─────────────────────────────────────────────
test('every kind answers to a switch a person can see', () => {
  const cases = [
    ['workout', null, 'coach_content'], ['program', null, 'coach_content'], ['meal_plan', null, 'coach_content'], ['grocery', null, 'coach_content'],
    ['session_booked', null, 'sessions'], ['session_cancelled', null, 'sessions'], ['booking_request', null, 'sessions'], ['intro_followup', null, 'sessions'],
    ['follow', null, 'follows'], ['follow_request', null, 'follows'], ['follow_accept', null, 'follows'],
    ['payment_receipt', null, 'payments'], ['payment', null, 'payments'], ['platform_payment', null, 'payments'],
    ['score_accountability', null, 'score_drop'], ['score_commitment', null, 'score_drop'],
    ['credential_rejected', null, 'credentials'], ['credential_expiry', null, 'credentials'],
    ['membership_welcome', null, 'account'], ['general', null, 'account'], ['cosign', null, 'coach_cosign'],
    ['message', { side: 'client' }, 'coach_message'], ['message', { side: 'coach' }, 'client_message'],
    ['message', { side: 'member' }, 'direct_message'], ['message', {}, 'message'],
    ['new_client', null, 'new_client'], ['tier_up', null, 'tier_up'], ['ai_directive', null, 'ai_directive'],
  ];
  for (const [type, data, want] of cases) assert.equal(preferenceTypeFor(type, data), want, type);
  assert.equal(preferenceTypeFor('constructor'), 'constructor', 'a prototype key is no switch');
});

// The settings screens: the app's two lists and the website's two pages.
const CLIENT = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
const typesBlock = CLIENT.slice(CLIENT.indexOf('  const TYPES = isCoach'), CLIENT.indexOf('\n', CLIENT.indexOf("    : [['directive'")));
const keysOf = (src) => [...src.matchAll(/\[\s*['"]([a-z_]+)['"],\s*['"]/g)].map((m) => m[1]);
const appCoach = keysOf(typesBlock.slice(0, typesBlock.indexOf("    : [['directive'")));
const appMember = keysOf(typesBlock.slice(typesBlock.indexOf("    : [['directive'")));
const memberWeb = read('public/newdesign/clientMeSettings.jsx');
const webMember = keysOf(memberWeb.slice(memberWeb.indexOf('const NP_TYPES = ['), memberWeb.indexOf('];', memberWeb.indexOf('const NP_TYPES = ['))));
const coachWeb = read('public/newdesign/coachSettings.jsx');
const webCoach = keysOf(coachWeb.slice(coachWeb.indexOf('const CST_COACH_TYPES = ['), coachWeb.indexOf('];', coachWeb.indexOf('const CST_COACH_TYPES = ['))));

test('the app and the website offer the same switches, and every switch a sent kind answers to is offered', () => {
  assert.ok(appMember.length >= 18 && appCoach.length >= 12, `lists not read: ${appMember.length} / ${appCoach.length}`);
  assert.deepEqual([...webMember].sort(), [...appMember].sort(), 'the website and the app list different member switches');
  assert.deepEqual([...webCoach].sort(), [...appCoach].sort(), 'the website and the app list different coach switches');
  const offered = new Set([...appMember, ...appCoach]);
  for (const k of new Set([...Object.values(PREFERENCE_OF), 'coach_message', 'client_message', 'direct_message', 'new_client'])) {
    assert.ok(offered.has(k), `${k} answers notifications but no settings screen offers it`);
  }
  // A member's and a coach's own kinds are on their own list.
  for (const k of ['coach_message', 'direct_message', 'coach_content', 'sessions', 'score_drop', 'follows', 'payments', 'account']) assert.ok(appMember.includes(k), `member: ${k}`);
  for (const k of ['client_red', 'client_amber', 'client_message', 'direct_message', 'new_client', 'sessions', 'payments', 'credentials', 'follows', 'waitlist_join', 'account']) assert.ok(appCoach.includes(k), `coach: ${k}`);
  // Nothing sends checkin_submitted, so its switch changed nothing: offered nowhere.
  assert.ok(!offered.has('checkin_submitted') && !webCoach.includes('checkin_submitted'));
  assert.match(typesBlock, /\['score_drop', 'Shape Score', 'When it dips, and your weekly commitment'\]/);
});

test("every switch row on the app's screen is translated, its English the en catalog's (Codex on #2476)", () => {
  const en = JSON.parse(read('mobile-app/src/i18n/catalogs/en/settings.json'));
  const rowsOf = (src) => [...src.matchAll(/\[\s*'([a-z_]+)',\s*(['"])((?:(?!\2).)*)\2,\s*(['"])((?:(?!\4).)*)\4\s*\]/g)].map((m) => [m[1], m[3], m[5]]);
  const lists = [['coach', rowsOf(typesBlock.slice(0, typesBlock.indexOf("    : [['directive'"))), appCoach],
    ['member', rowsOf(typesBlock.slice(typesBlock.indexOf("    : [['directive'"))), appMember]];
  for (const [side, rows, keys] of lists) {
    assert.deepEqual(rows.map((r) => r[0]), keys, `${side}: rows not read`);
    for (const [type, label, sub] of rows) {
      assert.equal(en[`notifyPrefs.${side}.${type}`], label, `${side}.${type}`);
      assert.equal(en[`notifyPrefs.${side}.${type}.sub`], sub, `${side}.${type}.sub`);
    }
  }
  const screen = CLIENT.slice(CLIENT.indexOf('function BSNotifyPrefs('), CLIENT.indexOf('// ─── SESSIONS & IN-APP VIDEO CALLS'));
  assert.match(screen, /const side = isCoach \? 'coach' : 'member';/, 'a row reads the other side\'s copy');
  assert.match(screen, /\{tr\(`settings:notifyPrefs\.\$\{side\}\.\$\{type\}`, \{ defaultValue: label \}\)\}/);
  assert.match(screen, /\{tr\(`settings:notifyPrefs\.\$\{side\}\.\$\{type\}\.sub`, \{ defaultValue: sub \}\)\}/);
  // Quiet hours hold a notice until they end now; they no longer feed a daily digest.
  assert.equal(en['notifyPrefs.fromSub'], 'Held until quiet hours end');
});

// ── 4. The list and the website's bell honour every App switch ───────────────────────────────────
function fakeDb(results) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = { table, ops: [] };
      calls.push(q);
      const b = new Proxy({}, {
        get(_, op) {
          if (op === 'then') { const r = results.shift() ?? { data: [], error: null }; return (res, rej) => Promise.resolve(r).then(res, rej); }
          return (...args) => { q.ops.push([op, ...args]); return b; };
        },
      });
      return b;
    },
  };
}
const requestUtils = await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) });
const listRoute = (db) => loadRealModule(join(ROOT, 'src/app/api/notifications/route.ts'), {
  typescript: true,
  registry: new Map([['next/server', nextServer], ['@/lib/request-utils', requestUtils], ['@/lib/request-auth', { clientForRequest: async () => db, currentUser: async () => ({ id: 'u1' }) }]]),
});

test('a row nothing stamped is hidden when its switch has the App channel off; a failed switch read hides nothing', async () => {
  const row = (id, type, data = {}) => ({ id, type, title: id, body: '', route: null, data, read_at: null, created_at: '2026-10-26T10:00:00Z' });
  const rows = [row('plan', 'workout'), row('follow', 'follow'), row('dm', 'message', { side: 'member' }), row('stamped', 'ai_directive', { channels: { inapp: false } })];
  // The switches are read first (the query leaves out what they hide), then the rows.
  let db = fakeDb([{ data: [{ type: 'coach_content' }, { type: 'direct_message' }], error: null }, { data: rows, error: null }]);
  let body = await (await (await listRoute(db)).GET(new Request('https://shape.test/api/notifications'))).json();
  assert.deepEqual(body.notifications.map((n) => n.id), ['follow']);
  assert.equal(body.unread, 1);
  const prefsRead = db.calls.find((c) => c.table === 'notification_preferences');
  assert.deepEqual(prefsRead.ops.filter((o) => o[0] === 'eq'), [['eq', 'user_id', 'u1'], ['eq', 'channel', 'inapp'], ['eq', 'enabled', false]]);
  db = fakeDb([{ data: null, error: { message: 'down' } }, { data: rows, error: null }]);
  body = await (await (await listRoute(db)).GET(new Request('https://shape.test/api/notifications'))).json();
  assert.deepEqual(body.notifications.map((n) => n.id), ['plan', 'follow', 'dm'], 'an unreadable switch hides nothing; a stamped row keeps its own stamp');
  const rowsRead = db.calls.find((c) => c.table === 'notifications');
  assert.ok(!rowsRead.ops.some((o) => o[0] === 'or' || (o[0] === 'not' && o[1] === 'type')), 'an unreadable switch filtered the query');
  // The app's toast reads the same switches.
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  assert.match(main, /if \(n\.data && n\.data\.channels && n\.data\.channels\.inapp === false\) return;\s+if \(appOff\.has\(preferenceTypeFor\(n\.type, n\.data\)\)\) return;\s+window\.__bsToast\?\.\(n\.title, 'ok'\);/);
  assert.match(main, /window\.addEventListener\('shape:notifyprefs', readSwitches\);/);
});

test('the toast waits for the first read of the switches, then goes by it (Codex on #2476)', async () => {
  // The app's own effect, run as written against a stand-in window.
  const main = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
  const head = 'useEffectBSM(() => {\n    if (!authUserId || !window.ShapeNotifications?.subscribe) return () => {};';
  const at = main.indexOf(head);
  assert.ok(at > 0, 'the toast effect was not found');
  const effect = new Function('window', 'authUserId', 'preferenceTypeFor', main.slice(at + 'useEffectBSM(() => {'.length, main.indexOf('  }, [authUserId]);', at)));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const mount = (center) => {
    const ui = { toasts: [], send: null };
    const win = {
      ShapeNotifications: { subscribe: (fn) => { ui.send = fn; return () => { ui.send = null; }; } },
      ShapeNotifyPrefs: { center },
      __bsToast: (t) => ui.toasts.push(t),
      addEventListener() {}, removeEventListener() {},
    };
    ui.unmount = effect(win, 'u1', preferenceTypeFor);
    return ui;
  };
  let settle;
  let ui = mount(() => new Promise((r) => { settle = r; }));
  ui.send({ title: 'Followed', type: 'follow', data: {} });
  ui.send({ title: 'Coach', type: 'message', data: { side: 'client' } });
  assert.deepEqual(ui.toasts, [], 'a notice was toasted before the switches were read');
  settle({ prefs: [{ type: 'follows', channel: 'inapp', enabled: false }] });
  await tick();
  assert.deepEqual(ui.toasts, ['Coach'], 'the early notices did not go by the switches once read');
  ui.send({ title: 'Followed again', type: 'follow', data: {} });
  ui.send({ title: 'Plan', type: 'workout', data: {} });
  assert.deepEqual(ui.toasts, ['Coach', 'Plan']);
  ui.unmount();
  // A failed read holds nothing back.
  ui = mount(() => Promise.reject(new Error('down')));
  ui.send({ title: 'Followed', type: 'follow', data: {} });
  await tick();
  assert.deepEqual(ui.toasts, ['Followed']);
  ui.unmount();
  // Nothing is toasted after the app has moved on.
  ui = mount(() => new Promise((r) => { settle = r; }));
  ui.send({ title: 'Late', type: 'workout', data: {} });
  ui.unmount();
  settle({ prefs: [] });
  await tick();
  assert.deepEqual(ui.toasts, []);
});

// A stand-in that applies the list's filters as PostgREST and Postgres would: the type lists, the
// message-side `or`, then the cap. A comparison with a null side is not true, as in SQL.
const listOf = (s) => s.slice(1, -1).split(',');
const fieldOf = (row, f) => (f === 'type' ? row.type : f === 'data->>side' ? (row.data?.side ?? null) : undefined);
const splitTop = (s) => { const out = []; let depth = 0, cur = ''; for (const ch of s) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
function holds(row, expr) {
  const m = /^(type|data->>side)\.(not\.in|neq|is)\.(.+)$/.exec(expr);
  assert.ok(m, `the stand-in cannot read ${expr}`);
  const v = fieldOf(row, m[1]);
  if (m[2] === 'is') { assert.equal(m[3], 'null'); return v === null; }
  if (v === null) return false;
  return m[2] === 'neq' ? v !== m[3] : !listOf(m[3]).includes(v);
}
function kept(row, ops) {
  for (const o of ops) {
    if (o[0] === 'not' && o[2] === 'in') { if (listOf(o[3]).includes(fieldOf(row, o[1]))) return false; }
    else if (o[0] === 'or') { if (!splitTop(o[1]).some((e) => holds(row, e))) return false; }
    else assert.ok(['select', 'is', 'order', 'limit'].includes(o[0]), `the stand-in cannot apply ${o[0]}`);
  }
  return true;
}
function applyingDb(rows, switchesOff) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = { table, ops: [] };
      calls.push(q);
      const b = new Proxy({}, {
        get(_, op) {
          if (op !== 'then') return (...args) => { q.ops.push([op, ...args]); return b; };
          if (table === 'notification_preferences') return (res) => res({ data: switchesOff.map((type) => ({ type })), error: null });
          const lim = q.ops.find((o) => o[0] === 'limit');
          return (res) => res({ data: rows.filter((r) => kept(r, q.ops)).slice(0, lim ? lim[1] : undefined), error: null });
        },
      });
      return b;
    },
  };
}
const live = { db: null };
const liveList = await loadRealModule(join(ROOT, 'src/app/api/notifications/route.ts'), {
  typescript: true,
  registry: new Map([['next/server', nextServer], ['@/lib/request-utils', requestUtils], ['@/lib/request-auth', { clientForRequest: async () => live.db, currentUser: async () => ({ id: 'u1' }) }]]),
});
const listFor = async (rows, switchesOff, url = 'https://shape.test/api/notifications') => {
  live.db = applyingDb(rows, switchesOff);
  const body = await (await liveList.GET(new Request(url))).json();
  return { ids: body.notifications.map((n) => n.id), rowsRead: live.db.calls.find((c) => c.table === 'notifications') };
};

test('a switched-off kind is left out in the query, so 200 of it never hide the older notices (Codex on #2476)', async () => {
  const at = (i) => new Date(Date.UTC(2026, 9, 26, 21) - i * 60000).toISOString();
  const row = (id, type, data, i) => ({ id, type, title: id, body: '', route: null, data, read_at: null, created_at: at(i) });
  // A coach with Client messages off, and 250 client messages newer than a payment and a session.
  const coach = [...Array.from({ length: 250 }, (_, i) => row('m' + i, 'message', { side: 'coach' }, i)),
    // A coach's renewal carries side 'coach' too (payment-notices.ts): only a message answers to its side.
    row('dm', 'message', { side: 'member' }, 251), row('pay', 'payment', { side: 'coach' }, 252), row('sess', 'session_booked', {}, 253)];
  let out = await listFor(coach, ['client_message']);
  assert.deepEqual(out.ids, ['dm', 'pay', 'sess'], 'the client messages filled the cap and the older notices were lost');
  // A member with Followers off, and 250 follows newer than their coach's message and a new plan.
  const member = [...Array.from({ length: 250 }, (_, i) => row('f' + i, i % 2 ? 'follow' : 'follow_request', {}, i)),
    row('coach', 'message', { side: 'client' }, 251), row('plan', 'workout', {}, 252)];
  out = await listFor(member, ['follows']);
  assert.deepEqual(out.ids, ['coach', 'plan']);
  // The website's phone-only filter still applies beside them, and nothing off means no extra filter.
  out = await listFor([row('w', 'reminder_water', {}, 1), row('f', 'follow', {}, 2), row('p', 'payment', {}, 3)], ['follows'], 'https://shape.test/api/notifications?surface=web');
  assert.deepEqual(out.ids, ['p']);
  out = await listFor(member.slice(0, 3), []);
  assert.ok(!out.rowsRead.ops.some((o) => o[0] === 'or' || (o[0] === 'not' && o[1] === 'type')), 'no switch off, yet the query was filtered');
});

test('the query leaves out exactly what each offered switch hides, and never a row the switch would show', async () => {
  const sides = ['client', 'coach', 'member', 'care', undefined];
  const kinds = [...new Set([...Object.keys(PREFERENCE_OF), ...Object.values(PREFERENCE_OF), ...appMember, ...appCoach, 'message', 'reminder_water', 'ai_directive'])];
  // Every kind with every side: payment and hire notices carry a side as well as messages do.
  const universe = kinds.flatMap((type) => sides.map((side) => ({ type, data: side ? { side } : {} })));
  for (const sw of [...new Set([...appMember, ...appCoach, 'message', 'follow'])]) {
    const { rowsRead } = await listFor([], [sw]);
    for (const r of universe) {
      const hides = preferenceTypeFor(r.type, r.data) === sw;
      const leftOut = !kept(r, rowsRead.ops);
      if (sw === 'message') assert.ok(!leftOut || hides, `the bare message switch left out ${r.type} ${JSON.stringify(r.data)}`);
      else assert.equal(leftOut, hides, `${sw}: ${r.type} ${JSON.stringify(r.data)}`);
    }
  }
  // A switch is the reader's own row: anything but a snake_case word never reaches a filter.
  assert.deepEqual(switchedOffFilter(['a),or(type.eq.x', 'follows', 7]), switchedOffFilter(['follows']));
  assert.deepEqual(switchedOffFilter([]), { types: null, sides: null });
});

// ── 2 and 3. The push: switches, quiet hours on the person's own clock, and the hold ─────────────
const st = { admin: null, pushReady: true, sent: [], emails: [] };
function fakeAdmin({ settings = null, prefs = {}, profileTz = null } = {}) {
  const updates = [];
  return {
    updates,
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'member@shape.test' } } }) } },
    from(table) {
      const eqs = {};
      const q = {
        select: () => q, eq: (c, v) => { eqs[c] = v; return q; }, gte: () => q, neq: () => q, not: () => q, is: () => q,
        update: (patch) => { const u = { table, patch }; updates.push(u); return { eq: async (c, v) => { u[c] = v; return { error: null }; } }; },
      };
      const res = () => {
        if (table === 'notification_settings') return { data: settings, error: null };
        if (table === 'client_profiles') return { data: profileTz ? { timezone: profileTz } : null, error: null };
        if (table === 'notification_preferences') return { data: prefs[eqs.type] || [], error: null };
        return { data: [], error: null, count: 0 };
      };
      q.maybeSingle = async () => res();
      q.then = (ok, no) => Promise.resolve(res()).then(ok, no);
      return q;
    },
  };
}
const dispatch = await loadRealModule(join(ROOT, 'src/app/api/push/dispatch/route.ts'), {
  typescript: true,
  registry: new Map([
    ['next/server', nextServer],
    ['@/lib/supabase/admin', { createAdminClient: () => st.admin }],
    ['@/lib/time', TIME],
    ['@/lib/push', { pushConfigured: () => st.pushReady, sendPushToUser: async (_a, userId, p) => { st.sent.push({ userId, ...p }); } }],
    ['@/lib/email', { sendEmail: async (m) => { st.emails.push(m); return { ok: true }; } }],
    ['@/lib/ai/notifications.mjs', await import('../src/lib/ai/notifications.mjs')], ['@/lib/reader-copy', READER_COPY_EN],
  ]),
});
const deliver = async (admin, record, now, { pushReady = true } = {}) => {
  st.admin = admin; st.pushReady = pushReady; st.sent.length = 0; st.emails.length = 0;
  const out = await dispatch.deliverNotice({ user_id: 'u-1', title: 'Hello', body: '', route: null, ...record }, now);
  return { ...out, pushed: st.sent.length, emailed: st.emails.length };
};
const NOON = new Date('2026-10-16T16:00:00Z');   // noon in New York
const NIGHT = new Date('2026-10-16T03:00:00Z');  // 11 pm in New York

test('a push answers its switch for every kind, as the settings screens offer them', async () => {
  const off = (k) => ({ [k]: [{ channel: 'push', enabled: false }] });
  for (const [type, data, k] of [['workout', {}, 'coach_content'], ['session_booked', {}, 'sessions'], ['follow', {}, 'follows'], ['payment_receipt', {}, 'payments'],
    ['score_accountability', {}, 'score_drop'], ['message', { side: 'member' }, 'direct_message'], ['message', { side: 'coach' }, 'client_message'],
    ['credential_expiry', {}, 'credentials'], ['membership_welcome', {}, 'account'], ['new_client', {}, 'new_client']]) {
    assert.deepEqual(await deliver(fakeAdmin({ prefs: off(k) }), { type, data }, NOON), { skipped: 'push_channel_off', pushed: 0, emailed: 0 }, `${type} with ${k} off`);
    assert.deepEqual(await deliver(fakeAdmin(), { type, data }, NOON), { pushed: 1, emailed: 0 }, `${type} with nothing off`);
  }
});

test("quiet hours are the person's own night, saved or not, and none when no zone is known", async () => {
  // The rule every sender reads.
  assert.deepEqual(quietWindow(null, 'America/New_York'), { quietStart: 22, quietEnd: 7, tz: 'America/New_York' });
  assert.deepEqual(quietWindow({ quiet_start: 23, quiet_end: 6 }, 'Asia/Tokyo'), { quietStart: 23, quietEnd: 6, tz: 'Asia/Tokyo' });
  assert.equal(inQuietHours(NIGHT, quietWindow(null, null)), false, 'no zone: never quiet');
  assert.equal(TIME.personZone('Asia/Tokyo', 'America/New_York'), 'Asia/Tokyo');
  assert.equal(TIME.personZone('Not/AZone', 'America/New_York'), 'America/New_York');
  assert.equal(TIME.personZone(null, ''), null);
  // The push: a member who never saved settings, whose app recorded their zone.
  const gate = (a, now) => dispatch.pushAllowed(a, 'u-1', 'message', now);
  assert.deepEqual(await gate(fakeAdmin({ profileTz: 'America/New_York' }), NIGHT), { ok: false, why: 'quiet_hours' }, '11 pm in New York, nothing saved');
  assert.deepEqual(await gate(fakeAdmin({ profileTz: 'America/New_York' }), NOON), { ok: true });
  assert.deepEqual(await gate(fakeAdmin(), NIGHT), { ok: true }, 'no zone known: no quiet hours, rather than a UTC night');
  assert.deepEqual(await gate(fakeAdmin({ settings: { quiet_start: 22, quiet_end: 7, tz: 'America/New_York' }, profileTz: 'Asia/Tokyo' }), NIGHT), { ok: true }, 'noon in Tokyo: the profile zone, where the person is now');
});

test('a notice in quiet hours is held for the morning, not dropped', async () => {
  const at = fakeAdmin({ profileTz: 'America/New_York' });
  const held = await deliver(at, { id: 'n-1', type: 'session_booked', data: { sessionId: 's-1' } }, NIGHT);
  assert.deepEqual(held, { skipped: 'quiet_hours', held: true, pushed: 0, emailed: 0 });
  assert.equal(at.updates.length, 1);
  assert.equal(at.updates[0].id, 'n-1');
  assert.deepEqual(at.updates[0].patch.data, { sessionId: 's-1', held_at: NIGHT.toISOString() }, 'the row keeps its data and gains the hold');
  // Their own reminder is not held: they chose the hour.
  assert.deepEqual(await deliver(fakeAdmin({ profileTz: 'America/New_York' }), { id: 'n-2', type: 'reminder_water', data: {} }, NIGHT), { pushed: 1, emailed: 0 });
  // A row the writer said not to push is not held for a push.
  assert.deepEqual(await deliver(fakeAdmin({ profileTz: 'America/New_York' }), { id: 'n-3', type: 'meal_prep', data: { channels: { push: false } } }, NIGHT), { skipped: 'push_channel_off', pushed: 0, emailed: 0 });
  // An email held with it goes in the morning, even before push is set up.
  const emailOn = { coach_message: [{ channel: 'email', enabled: true }] };
  const coachMsg = { id: 'n-4', type: 'message', data: { side: 'client', conversationId: 'c-1' } };
  const night = fakeAdmin({ profileTz: 'America/New_York', prefs: emailOn });
  assert.deepEqual(await deliver(night, coachMsg, NIGHT, { pushReady: false }), { skipped: 'fcm_not_configured', held: true, pushed: 0, emailed: 0 });
  assert.deepEqual(await deliver(fakeAdmin({ profileTz: 'America/New_York', prefs: emailOn }), coachMsg, NOON, { pushReady: false }), { skipped: 'fcm_not_configured', pushed: 0, emailed: 1 }, 'the morning: emailed');
  // Emailed before it was held: not emailed again.
  assert.deepEqual(await deliver(fakeAdmin({ profileTz: 'America/New_York', prefs: emailOn }), { ...coachMsg, data: { ...coachMsg.data, emailed_at: NIGHT.toISOString() } }, NOON), { pushed: 1, emailed: 0 });
  // The webhook answers what deliverNotice did.
  process.env.PUSH_WEBHOOK_SECRET = 'test-secret';
  st.admin = fakeAdmin({ profileTz: 'America/New_York' }); st.pushReady = true;
  const RealDate = Date;
  globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NIGHT.getTime()); } static now() { return NIGHT.getTime(); } };
  try {
    const res = await dispatch.POST(new Request('https://shape.test/api/push/dispatch', { method: 'POST', headers: { 'x-push-secret': 'test-secret' }, body: JSON.stringify({ record: { id: 'n-5', user_id: 'u-1', type: 'follow', title: 'Ana started following you' } }) }));
    assert.deepEqual(await res.json(), { ok: true, skipped: 'quiet_hours', held: true });
  } finally { globalThis.Date = RealDate; }
});

test('the morning: held notices go once, oldest first, at most three a person, and not one already seen', async () => {
  const delivered = [];
  let heldAgain = new Set();
  const rows = [];
  // Held during the night just gone: minutes before now, in order.
  const add = (id, user, mins, extra = {}) => rows.push({ id, user_id: user, type: 'follow', title: id, body: '', route: null, data: { held_at: 'x', keep: id }, created_at: new Date(Date.now() - (600 - mins) * 60000).toISOString(), read_at: null, ...extra });
  add('a1', 'ann', 0); add('a2', 'ann', 1); add('a3', 'ann', 2); add('a4', 'ann', 3);
  add('b1', 'ben', 4, { read_at: '2026-10-16T05:00:00Z' }); add('b2', 'ben', 5, { cleared_at: '2026-10-16T05:00:00Z' });
  add('c1', 'cat', 6); rows.push({ ...rows[0], data: { held_at: 'x' }, id: 'old', user_id: 'dan', created_at: new Date(Date.now() - 3 * 86400000).toISOString() });
  add('e1', 'eve', 7);
  heldAgain = new Set(['e1']);
  const claims = [];
  const dataOf = (r) => (stored.has(r.id) ? stored.get(r.id) : r.data) || {};
  // The stored data, apart from the rows the job is handed: a read returns copies, as a database does,
  // so a claim never changes the row the job already holds.
  const stored = new Map();
  const admin = {
    from() {
      const f = { not: [], gt: null, idEq: null, patch: null };
      const q = {
        select: () => q, order: () => q, limit: () => q,
        not: (...a) => { f.not.push(a); return q; },
        gt: (_c, v) => { f.gt = v; return q; },
        eq: (_c, v) => { f.idEq = v; return q; },
        update: (patch) => { f.patch = patch; return q; },
      };
      q.then = (ok, no) => {
        if (f.patch) {
          // A claim: only a row still held is taken.
          const row = rows.find((r) => r.id === f.idEq);
          const was = row && dataOf(row).held_at;
          if (was) { stored.set(row.id, f.patch.data); claims.push(row.id); }
          return Promise.resolve({ data: was ? [{ id: row.id }] : [], error: null }).then(ok, no);
        }
        const held = rows.filter((r) => dataOf(r).held_at && (!f.gt || r.created_at > f.gt)).sort((x, y) => x.created_at.localeCompare(y.created_at));
        return Promise.resolve({ data: held.map((r) => ({ ...r, data: { ...dataOf(r) } })), error: null }).then(ok, no);
      };
      return q;
    },
  };
  const cron = await loadRealModule(join(ROOT, 'src/app/api/cron/push-held/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => admin }],
      ['../../push/dispatch/route', { deliverNotice: async (r) => { delivered.push(r.id); assert.equal('held_at' in (r.data || {}), false, 'handed over without its hold'); return heldAgain.has(r.id) ? { held: true } : {}; } }],
    ]),
  });
  assert.equal(cron.heldVerdict({ created_at: '2026-10-16T03:00:00Z', read_at: null }, new Date('2026-10-16T12:00:00Z')), 'send');
  assert.equal(cron.heldVerdict({ created_at: '2026-10-16T03:00:00Z', read_at: 'x' }, new Date('2026-10-16T12:00:00Z')), 'seen');
  assert.equal(cron.heldVerdict({ created_at: '2026-10-14T03:00:00Z', read_at: null }, new Date('2026-10-16T12:00:00Z')), 'stale');
  process.env.CRON_SECRET = 'cron-test';
  assert.equal((await cron.GET(new Request('https://x/api/cron/push-held'))).status, 401);
  const res = await cron.GET(new Request('https://x/api/cron/push-held', { headers: { authorization: 'Bearer cron-test' } }));
  const body = await res.json();
  assert.deepEqual(delivered, ['a1', 'a2', 'a3', 'c1', 'e1'], 'oldest first, three for Ann, none seen or stale');
  assert.deepEqual(body, { ok: true, delivered: 4, letGo: 4, failed: 0 }, "Eve's is held again (still her night), so it is not counted");
  assert.deepEqual(stored.get('a1'), { keep: 'a1' }, 'the hold comes off, the rest of the data stays');
  assert.ok(['a4', 'b1', 'b2', 'old'].every((id) => claims.includes(id)), 'what is not sent is let go');
});

// ── 1 and 7e. The database: direct messages, and no repeated follows or co-signs ──────────────────
test('the migration adds the direct-message branch and the dedupe keys, and checks itself', () => {
  const sql = read('supabase-migrations/2026-10-26-push-notice-fixes.sql').replace(/--[^\n]*/g, '');
  assert.match(sql, /if conv\.dm_key is not null then\s+insert into public\.notifications[\s\S]{0,300}jsonb_build_object\('conversationId', new\.conversation_id, 'side', 'member'\)\s+from public\.conversation_participants cp\s+where cp\.conversation_id = new\.conversation_id\s+and cp\.user_id is distinct from new\.sender_id;\s+return new;\s+end if;/);
  // It comes first, and the care-team and coaching branches stay as they were.
  assert.ok(sql.indexOf("if conv.dm_key is not null then") < sql.indexOf('if conv.provider_role is null and conv.dm_key is null and conv.client_id is not null then'));
  assert.match(sql, /s\.status in \('active', 'trialing', 'past_due'\)/);
  assert.match(sql, /v_side := 'coach';\s+else\s+recipient := conv\.client_id;\s+v_side := 'client';/);
  // Follows by the follower and the UTC day; co-signs by post and coach; each refused quietly.
  assert.match(sql, /'dedupe', v_type \|\| ':' \|\| me::text \|\| ':' \|\| to_char\(\(now\(\) at time zone 'utc'\)::date, 'YYYY-MM-DD'\)\)\s+\)\s+on conflict do nothing;/);
  assert.match(sql, /'dedupe', 'follow_accept:' \|\| me::text \|\| ':' \|\| to_char[\s\S]{0,80}\)\s+on conflict do nothing;/);
  assert.match(sql, /'dedupe', 'cosign:' \|\| p_post_id::text \|\| ':' \|\| me::text\)\s+\)\s+on conflict do nothing;/);
  assert.match(sql, /create index if not exists notifications_held_idx\s+on public\.notifications \(\(data->>'held_at'\)\)\s+where \(data->>'held_at'\) is not null;/);
  assert.match(sql, /raise exception 'notify_on_new_message has no direct-message branch';/);
  assert.match(sql, /raise exception 'a follow or co-sign notice has no dedupe key';/);
  // The website opens a direct message in the bubble, for a coach too.
  const shell = read('public/newdesign/pageShell.jsx');
  const fn = shell.slice(shell.indexOf('const DASH_INBOX_ROUTES = {'), shell.indexOf('// ⚠ A SHAPE CHECK, NOT A TRUST FALL.'));
  const lib = new Function('window', `${fn}; return { dashInboxHref, dashInboxThreadFor };`)({});
  const dm = { route: 'messages', data: { conversationId: 'c-9', side: 'member' } };
  for (const role of ['client', 'trainer']) {
    assert.equal(lib.dashInboxThreadFor(dm, role), 'c-9', role);
    assert.equal(lib.dashInboxHref(dm, role), null, `${role}: no Messages page`);
  }
});

test('a waiting-list join notifies its coach once a day per member', () => {
  assert.match(read('src/app/api/waitlist/join/route.ts'), /dedupe: `waitlist-join:\$\{providerRole\}:\$\{providerId\}:\$\{user\.id\}:\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}`/);
});

// ── 6. Everyone, not the first 500 ───────────────────────────────────────────────────────────────
test('the hourly Nora job and the daily Score job page through everyone', () => {
  const ai = read('src/app/api/ai/notify/cron/route.ts');
  assert.doesNotMatch(ai, /\.limit\(BATCH\)/);
  assert.match(ai, /\.select\('user_id, at:data->at'\)\s+\.eq\('kind', 'notify_snapshot'\)\s+\.order\('user_id', \{ ascending: true \}\)\s+\.range\(from, from \+ PAGE - 1\);/);
  assert.match(ai, /if \(at !== null && at < cutoff\) continue; \/\/ inactive → skip/);
  assert.match(ai, /await Promise\.all\(Array\.from\(\{ length: Math\.min\(CONCURRENCY, queue\.length\) \}, worker\)\);/);
  assert.match(ai, /const queue = rotated\(owners, Math\.floor\(startedAt \/ 3_600_000\)\);/);
  const score = read('src/app/api/cron/score-accountability/route.ts');
  assert.doesNotMatch(score, /\.limit\(BATCH\)/);
  assert.match(score, /\.order\('client_id', \{ ascending: true \}\)\s+\.range\(from, from \+ SUB_PAGE - 1\);/);
});

test('runs that meet the time limit reach everyone within a few hours, not thousands (Codex on #2476)', async () => {
  const { rotationStart, rotated } = await import('../src/lib/run-rotation.mjs');
  assert.deepEqual(rotated(['a', 'b', 'c', 'd', 'e'], 1).sort(), ['a', 'b', 'c', 'd', 'e'], 'a rotation keeps everyone once');
  // Hourly runs that each reach `k` of `n` owners from their start: how many until all were reached.
  const runsToReachAll = (n, k, hour0) => {
    const seen = new Uint8Array(n);
    let left = n;
    for (let r = 0; r < 20000; r++) {
      const start = rotationStart(hour0 + r, n);
      assert.ok(Number.isInteger(start) && start >= 0 && start < n, `start ${start} of ${n}`);
      for (let i = 0; i < k; i++) { const j = (start + i) % n; if (!seen[j]) { seen[j] = 1; left -= 1; } }
      if (!left) return r + 1;
    }
    return Infinity;
  };
  const hour = Math.floor(Date.UTC(2026, 9, 26) / 3_600_000);
  for (const [n, k] of [[10000, 1000], [10000, 300], [50000, 2000], [7, 3]]) {
    for (let h = hour; h < hour + 100; h += 13) {
      const runs = runsToReachAll(n, k, h);
      assert.ok(runs <= 2 * Math.ceil(n / k), `${k} of ${n} a run took ${runs} runs to reach everyone`);
    }
  }
  assert.equal(rotationStart(hour, 0), 0);
  assert.equal(rotationStart(hour, 1), 0);
});

test('the daily Score job stops inside its time and starts elsewhere each day, so the days reach everyone (Codex on #2476)', async () => {
  const { fakeSupabase } = await import('./helpers/fake-supabase.mjs');
  const membership = await loadRealModule(join(ROOT, 'src/lib/membership-core.ts'), { typescript: true });
  const notifyLayer = await import('../src/lib/ai/notifications.mjs');
  const N = 400;
  const ids = Array.from({ length: N }, (_, i) => 'c' + String(i).padStart(3, '0'));
  const RealDate = Date;
  let clock = 0;
  globalThis.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(clock); } static now() { return clock; } };
  process.env.CRON_SECRET = 'score-secret';
  try {
    const reached = new Set();
    let days = 0;
    for (let d = 0; d < 12 && reached.size < N; d++) {
      clock = RealDate.UTC(2026, 9, 26 + d, 6);
      const started = clock;
      const db = fakeSupabase({
        tables: { platform_subscriptions: ids.map((id) => ({ client_id: id, status: 'active' })), sessions: [], client_workouts: [], user_habits: [], user_goals: [] },
        rpcs: {
          sweep_store_credit_reservations: () => 0,
          // Each member's check-in RPC takes a second: 400 members are more than one run's time.
          apply_obligation_penalty: (a) => { clock += 1000; reached.add(a.p_uid); return { applied: false }; },
          award_session_kept: () => ({ awarded: false }),
          settle_commitment: () => ({ settled: false }),
        },
      });
      const mod = await loadRealModule(join(ROOT, 'src/app/api/cron/score-accountability/route.ts'), {
        typescript: true,
        registry: new Map([['next/server', nextServer], ['@/lib/supabase/admin', { createAdminClient: () => db }], ['@/lib/notify', { createNotification: async () => true }],
          ['@/lib/membership-core', membership], ['@/lib/ai/notifications.mjs', notifyLayer]]),
      });
      const body = await (await mod.GET(new Request('https://x/api/cron/score-accountability', { headers: { 'x-cron-secret': 'score-secret' } }))).json();
      assert.ok(clock - started <= 320_000, `a run went on for ${(clock - started) / 1000} s`);
      assert.ok(body.unreached > 0 && body.evaluated + body.unreached === N, JSON.stringify(body));
      days += 1;
    }
    assert.equal(reached.size, N, `after ${days} days, ${N - reached.size} members were never scored`);
    assert.ok(days <= 4, `it took ${days} days to reach everyone; two runs' worth covers them`);
  } finally {
    globalThis.Date = RealDate;
  }
});

// ── 7a. Reminders at their minute ────────────────────────────────────────────────────────────────
test('a reminder goes at its minute, catches up a missed run, and only once a day', async () => {
  const mod = await loadRealModule(join(ROOT, 'src/app/api/cron/reminders/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/supabase/admin', { createAdminClient: () => null }], ['@/lib/notify', { createNotification: async () => true }]]),
  });
  const r = (at, extra = {}) => ({ at_time: at, days: [0, 1, 2, 3, 4, 5, 6], last_fired_on: null, ...extra });
  const local = (h, m, date = '2026-10-26', dow = 1) => ({ minute: h * 60 + m, dow, date });
  const due = mod.reminderDueOn;
  assert.equal(due(r('07:45'), local(7, 44)), null, 'a minute early');
  assert.equal(due(r('07:45'), local(7, 45)), '2026-10-26', 'its minute');
  assert.equal(due(r('07:45:00'), local(7, 50)), '2026-10-26', 'the next run');
  assert.equal(due(r('07:45'), local(8, 15)), '2026-10-26', 'half an hour late: caught up');
  assert.equal(due(r('07:45'), local(8, 16)), null, 'later than that (a reminder saved after its time today): not sent');
  assert.equal(due(r('07:45', { last_fired_on: '2026-10-26' }), local(7, 50)), null, 'once a day');
  assert.equal(due(r('07:45', { days: [2] }), local(7, 50)), null, 'not its day');
  // Across midnight (Codex on #2476): a Monday 23:55 reminder whose run was missed goes at Tuesday
  // 00:00 as Monday's, and does not stop Tuesday's.
  const tue = (h, m) => local(h, m, '2026-10-27', 2);
  assert.equal(due(r('23:55', { days: [1] }), tue(0, 0)), '2026-10-26', 'missed before midnight: caught up as yesterday\'s');
  assert.equal(due(r('23:55', { last_fired_on: '2026-10-26' }), tue(0, 0)), null, 'yesterday\'s already went');
  assert.equal(due(r('23:55', { days: [2] }), tue(0, 0)), null, 'yesterday was not its day');
  assert.equal(due(r('23:55', { last_fired_on: '2026-10-26' }), tue(23, 55)), '2026-10-27', 'today\'s goes on its own day');
  assert.equal(due(r('23:40'), tue(0, 11)), null, 'more than half an hour after');
  assert.equal(due(r('00:10'), tue(0, 5)), null, 'early today is not late yesterday');
  assert.equal(due(r('23:50'), local(0, 5, '2026-11-01', 0)), '2026-10-31', 'the day before the first of a month');
  // The job records the day each went for.
  const job = read('src/app/api/cron/reminders/route.ts');
  assert.match(job, /const date = reminderDueOn\(r, localNow\(r\.tz, now\)\);\s+if \(date\) due\.push\(\{ r, date \}\);/);
  assert.deepEqual(mod.localNow('America/New_York', new Date('2026-10-26T11:45:00Z')), { minute: 7 * 60 + 45, dow: 1, date: '2026-10-26' });
  const crons = JSON.parse(read('vercel.json')).crons;
  assert.equal(crons.find((c) => c.path === '/api/cron/reminders').schedule, '*/5 * * * *');
  assert.equal(crons.find((c) => c.path === '/api/cron/push-held').schedule, '*/15 * * * *');
});

// ── 7b and 7c. A payment notice opens something; a rejected credential tells the coach ───────────
test('payment notices open what they are about, and a rejection is notified', async () => {
  const pn = read('src/lib/payment-notices.ts');
  assert.match(pn, /type: 'platform_payment',\s+\.\.\.toOwner,\s+route: 'admin',/);
  assert.match(pn, /type: 'payment_receipt',\s+\.\.\.memberReceipt\(p, coach\.name\),\s+route: receiptRoute\(p\.paidFor\),/);
  assert.match(pn, /type: 'payment',\s+\.\.\.coachRenewal\(p, client\),\s+route: 'business',/);
  const PN = await loadRealModule(join(ROOT, 'src/lib/payment-notices.ts'), { typescript: true, registry: new Map([['@supabase/supabase-js', {}], ['@/lib/notify', {}], ['@/lib/admin-access', {}]]) });
  assert.deepEqual(['program', 'meal_plan', 'coaching', 'membership'].map(PN.receiptRoute), ['train', 'eat', 'messages', 'home']);
  // The two places they open: a coach's Business page (in the listing's role) and the admin console.
  const R = await import('../public/newdesign/notificationRoutes.mjs');
  assert.equal(R.ROUTES.business, 'coach');
  assert.equal(R.ROUTES.admin, 'either');
  assert.equal(R.canonicalRoute('business', { providerRole: 'nutritionist' }), 'business:nutritionist');
  assert.deepEqual(R.parseRoute('business:nutritionist'), { kind: 'business', id: null, role: 'nutritionist' });
  assert.deepEqual(R.parseRoute('admin'), { kind: 'admin', id: null, role: null });
  assert.match(CLIENT, /const \[showBusiness, setShowBusiness\] = useStateBSC\(initialPage === 'business' \? 'money' : null\);/);
  assert.match(CLIENT, /case 'admin': window\.ShapeStaff\?\.openConsole\?\.\(\); return;/);
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  assert.equal((pros.match(/case 'business': clear\(\); setSettingsStart\('business'\); setShowSettings\(true\); return;/g) || []).length, 2, 'both coach apps open Business');
  assert.match(read('public/newdesign/pageShell.jsx'), /business: "business",/);
  assert.match(read('src/lib/coach-thread.ts'), /type: 'payment',\s+title: `Payment received: \$\{shown\}`,\s+body: `\$\{shown\} bought \$\{what\}\$\{pay\}\.`,\s+route: 'business',/);
  const actions = read('src/app/dashboard/credentials/actions.ts');
  const reject = actions.slice(actions.indexOf('export async function rejectCredential'), actions.indexOf('export async function requestCredentialChanges'));
  assert.match(reject, /type: 'credential_rejected',[\s\S]{0,400}route: 'credentials',[\s\S]{0,200}copy: \{ title: np\('credential\.rejected\.title'\), \.\.\.\(notes \? \{\} : \{ body: np\('credential\.rejected\.body'\) \}\) \}/);
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/notice.json`));
    for (const k of ['credential.rejected.title', 'credential.rejected.body']) assert.ok(typeof cat[k] === 'string' && cat[k].trim(), `${loc}: ${k}`);
  }
});
