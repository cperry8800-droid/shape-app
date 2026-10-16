// Phone-only notifications (owner, 2026-10-16: "that list is good for phone only"). The reminders
// a member sets, the night-before meal-prep reminder, and habit and streak nudges show in the app
// and push to the phone, and the website bell leaves them out. From the website, "Mark all read"
// and "Clear all" leave them alone too, so a reminder the member has not seen in the app stays
// unread there. The app asks without `surface` and gets everything, as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { PHONE_ONLY_TYPES, PHONE_ONLY_IN, isPhoneOnly } from '../public/newdesign/notificationSurfaces.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

function fakeDb(results) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = { table, ops: [] };
      calls.push(q);
      const b = new Proxy({}, {
        get(_, op) {
          if (op === 'then') {
            const r = results.shift() ?? { data: [], error: null };
            // Applied as Postgres would: the `not in` filter, then the cap.
            let data = r.data;
            if (Array.isArray(data)) {
              const not = q.ops.find((o) => o[0] === 'not' && o[1] === 'type' && o[2] === 'in');
              if (not) { const out = not[3].slice(1, -1).split(','); data = data.filter((row) => !out.includes(row.type)); }
              const limit = q.ops.find((o) => o[0] === 'limit');
              if (limit) data = data.slice(0, limit[1]);
            }
            return (res, rej) => Promise.resolve({ ...r, data }).then(res, rej);
          }
          return (...args) => { q.ops.push([op, ...args]); return b; };
        },
      });
      return b;
    },
  };
}
const requestUtils = loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), {
  typescript: true, registry: new Map([['next/server', nextServer]]),
});
const loadRoute = async (db) => loadRealModule(join(ROOT, 'src/app/api/notifications/route.ts'), {
  typescript: true,
  registry: new Map([
    ['next/server', nextServer],
    ['@/lib/request-utils', await requestUtils],
    ['@/lib/request-auth', { clientForRequest: async () => db, currentUser: async () => ({ id: 'u1' }) }],
  ]),
});
const post = (body) => new Request('https://shape.test/api/notifications', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('the phone-only list is the one the owner approved', () => {
  assert.deepEqual([...PHONE_ONLY_TYPES].sort(), [
    'ai_habit_reminder', 'ai_streak_broken', 'habit_reminder', 'meal_prep', 'reminder_checkin',
    'reminder_custom', 'reminder_photo', 'reminder_water', 'reminder_weigh_in', 'streak_broken',
  ]);
  // The AI notify layer stores habit and streak nudges with its prefix: the bare names alone would
  // have let every one of them onto the website.
  const core = readFileSync(join(ROOT, 'src/lib/ai/notify-core.ts'), 'utf8');
  assert.match(core, /type: `ai_\$\{n\.type\}`,/, 'the AI layer changed how it names its rows');
  for (const t of ['habit_reminder', 'streak_broken']) assert.equal(isPhoneOnly('ai_' + t), true, 'ai_' + t + ' reaches the website');
  for (const t of ['message', 'session_booked', 'payment', 'new_client', 'waitlist_invite', 'coach_message', 'directive']) {
    assert.equal(isPhoneOnly(t), false, t + ' left the website');
  }
  assert.equal(PHONE_ONLY_IN, '(' + PHONE_ONLY_TYPES.join(',') + ')');
});

test('the website feed leaves out phone-only types in the query, before the 200-row cap (Codex on #2386)', async () => {
  const at = (i) => new Date(Date.UTC(2026, 9, 16, 21, 0, 0) - i * 60000).toISOString();
  // 250 unread phone reminders, newest first (a month of a few a day), then two notices for the website.
  const rows = [
    ...Array.from({ length: 250 }, (_, i) => ({ id: 'r' + i, type: PHONE_ONLY_TYPES[i % PHONE_ONLY_TYPES.length], title: 'Remind', body: '', route: null, data: {}, read_at: null, created_at: at(i) })),
    { id: 'm1', type: 'message', title: 'Tom replied', body: '', route: 'chat', data: {}, read_at: null, created_at: at(251) },
    { id: 's1', type: 'session_booked', title: 'Booked', body: '', route: null, data: {}, read_at: '2026-10-16T00:00:00Z', created_at: at(252) },
  ];
  const db = fakeDb([{ data: rows, error: null }]);
  let res = await (await loadRoute(db)).GET(new Request('https://shape.test/api/notifications?surface=web'));
  let j = await res.json();
  assert.deepEqual(db.calls[0].ops.find((o) => o[0] === 'not'), ['not', 'type', 'in', PHONE_ONLY_IN], 'the website read is not filtered in the query');
  assert.ok(db.calls[0].ops.findIndex((o) => o[0] === 'not') < db.calls[0].ops.findIndex((o) => o[0] === 'limit'));
  assert.deepEqual(j.notifications.map((n) => n.id), ['m1', 's1'], 'the reminders filled the cap and the website bell read empty');
  assert.equal(j.unread, 1, 'the website badge counts phone reminders');

  // The app asks without `surface` and gets everything, as before.
  const appDb = fakeDb([{ data: rows, error: null }]);
  res = await (await loadRoute(appDb)).GET(new Request('https://shape.test/api/notifications'));
  j = await res.json();
  assert.ok(!appDb.calls[0].ops.some((o) => o[0] === 'not'), 'the app read lost its reminders');
  assert.equal(j.notifications.length, 50);
  assert.equal(j.notifications[0].id, 'r0');
});

test('from the website, mark-all and clear leave phone-only notifications alone; from the app they do not', async () => {
  const before = '2026-10-16T21:00:00.123456+00:00';
  for (const [body, label] of [[{ all: true }, 'mark all read'], [{ clear: true, before }, 'clear all']]) {
    let db = fakeDb([{ data: null, error: null }]);
    assert.equal((await (await loadRoute(db)).POST(post({ ...body, surface: 'web' }))).status, 200);
    assert.deepEqual(db.calls[0].ops.find((o) => o[0] === 'not'), ['not', 'type', 'in', PHONE_ONLY_IN],
      'the website ' + label + ' reaches phone-only notifications');

    db = fakeDb([{ data: null, error: null }]);
    assert.equal((await (await loadRoute(db)).POST(post(body))).status, 200);
    assert.ok(!db.calls[0].ops.some((o) => o[0] === 'not'), 'the app ' + label + ' lost phone-only notifications');
  }
});
