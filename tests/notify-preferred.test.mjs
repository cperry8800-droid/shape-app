// createPreferredNotification and createNotification (src/lib/notify.ts), run as written against
// a scripted admin client. What a send must never do: go out on preferences it could not read,
// email without the row that records it, or count a rejected duplicate as stored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { READER_COPY_EN } from './helpers/reader-copy-en.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const notifyLayer = await import('../src/lib/ai/notifications.mjs');

// The admin client, scripted per table: the master mute (notification_settings), the per-type
// toggles (notification_preferences), the email cooldown's count and the insert (notifications).
function admin({ settings = { data: null, error: null }, prefs = { data: [], error: null }, insertError = null, recent = 0 } = {}) {
  const inserted = [];
  const client = {
    from(table) {
      const chain = {
        select() { return chain; }, eq() { return chain; }, gte() { return chain; },
        maybeSingle() { return Promise.resolve(table === 'notification_settings' ? settings : { data: null, error: null }); },
        insert(row) { if (table === 'notifications') inserted.push(row); return Promise.resolve({ error: insertError }); },
        then(res, rej) {
          const out = table === 'notification_preferences' ? prefs : { data: [], error: null, count: recent };
          return Promise.resolve(out).then(res, rej);
        },
      };
      return chain;
    },
    auth: { admin: { getUserById: async () => ({ data: { user: { email: 'member@example.com' } } }) } },
  };
  return { client, inserted };
}

const emails = [];
const notify = await loadRealModule(join(ROOT, 'src/lib/notify.ts'), {
  typescript: true,
  registry: new Map([
    ['@/lib/email', { sendEmail: async (m) => { emails.push(m); } }],
    ['@/lib/ai/notifications.mjs', notifyLayer], ['@/lib/reader-copy', READER_COPY_EN],
  ]),
});

const PREP = { userId: 'u1', type: 'meal_prep', title: 'Prep tonight', body: 'Make 3 tonight.', route: 'prep:x' };
const EMAIL_ON = { data: [{ channel: 'email', enabled: true }], error: null };
const quietLogs = (t) => {
  const lines = [];
  t.mock.method(console, 'error', (...a) => { lines.push(['error', a.join(' ')]); });
  t.mock.method(console, 'info', (...a) => { lines.push(['info', a.join(' ')]); });
  return lines;
};

test('a preference read that fails sends nothing, rather than sending on the defaults', async (t) => {
  const logs = quietLogs(t);
  for (const failed of [
    { settings: { data: null, error: { message: 'settings unreadable' } } },
    { prefs: { data: null, error: { message: 'preferences unreadable' } } },
  ]) {
    emails.length = 0;
    const { client, inserted } = admin({ ...failed });
    assert.equal(await notify.createPreferredNotification(client, PREP), false);
    assert.deepEqual(inserted, [], 'written on preferences it could not read');
    assert.deepEqual(emails, []);
  }
  assert.ok(logs.some(([lvl, l]) => lvl === 'error' && l.includes('could not read preferences')), 'the skipped send is logged');
});

test('a muted member, or one with the type turned off, gets nothing', async () => {
  for (const opts of [
    { settings: { data: { muted: true }, error: null } },
    { prefs: { data: [{ channel: 'inapp', enabled: false }, { channel: 'push', enabled: false }], error: null } },
  ]) {
    const { client, inserted } = admin(opts);
    assert.equal(await notify.createPreferredNotification(client, PREP), false);
    assert.deepEqual(inserted, []);
  }
});

test('no row, no email: an email goes out only once its notification is stored', async (t) => {
  quietLogs(t);
  emails.length = 0;
  // A waitlist invite: one of the types email is offered for (notificationSurfaces.mjs).
  const INVITE = { ...PREP, type: 'waitlist_invite', title: 'Coach Q is taking new clients' };
  const failed = admin({ prefs: EMAIL_ON, insertError: { message: 'insert failed' } });
  assert.equal(await notify.createPreferredNotification(failed.client, INVITE), false, 'a failed insert reads as stored');
  assert.equal(failed.inserted.length, 1);
  assert.deepEqual(emails, [], 'emailed with no row to record it');

  const stored = admin({ prefs: EMAIL_ON });
  assert.equal(await notify.createPreferredNotification(stored.client, INVITE), true);
  assert.equal(emails.length, 1, 'the control: a stored row is emailed');
  assert.equal(emails[0].to, 'member@example.com');
});

test('a type email is not offered for never emails, whatever was saved for it (owner, 2026-10-16)', async (t) => {
  quietLogs(t);
  emails.length = 0;
  const stored = admin({ prefs: EMAIL_ON });
  assert.equal(await notify.createPreferredNotification(stored.client, PREP), true, 'the prep reminder is still stored');
  assert.deepEqual(emails, [], 'a prep reminder was emailed because an old Email switch said so');
  assert.equal(stored.inserted[0].data.channels.email, false, 'the row claims an email went out');
});

// Codex on #2420: the habit cron claimed its place under the daily push cap before the person's
// switches were read, so a friend with this type's push off held a place for nothing and another
// sender asking at that moment was refused it. The place is asked for once the notice pushes.
test("a sender's place under the push cap is asked for only once the notice is known to push", async () => {
  const run = async (opts, n, granted = true) => {
    let asked = 0;
    const { client, inserted } = admin(opts);
    const out = await notify.preferredNotificationOutcome(client, { ...PREP, ...n, claimPush: async () => { asked += 1; return granted; } });
    return { out, asked, row: inserted[0] };
  };
  const pushes = await run({}, {});
  assert.equal(pushes.asked, 1);
  assert.equal(pushes.row.data.channels.push, true);
  const off = await run({ prefs: { data: [{ channel: 'push', enabled: false }], error: null } }, {});
  assert.equal(off.asked, 0, 'push off for the type: no place asked for');
  assert.equal(off.row.data.channels.push, false);
  assert.equal(off.row.data.channels.inapp, true, 'it still lands in the app');
  assert.equal((await run({}, { quiet: true })).asked, 0, 'a quiet notice asks for nothing');
  assert.equal((await run({ settings: { data: { muted: true }, error: null } }, {})).asked, 0, 'nor does a muted member');
  // A type email is offered for, with email on: granted, it pushes and emails.
  const INVITE = { type: 'waitlist_invite', title: 'Coach Q is taking new clients' };
  emails.length = 0;
  const granted = await run({ prefs: EMAIL_ON }, INVITE);
  assert.deepEqual(granted.row.data.channels, { inapp: true, push: true, email: true });
  assert.equal(emails.length, 1);
  emails.length = 0;
  const refused = await run({ prefs: EMAIL_ON }, INVITE, false);
  assert.equal(refused.out, 'stored');
  assert.deepEqual(refused.row.data.channels, { inapp: true, push: false, email: false }, 'refused, it lands as a quiet notice does');
  assert.deepEqual(emails, [], 'and emails nothing');
  assert.equal(refused.row.data.claimPush, undefined);
  assert.ok(!('claimPush' in refused.row), 'the callback is not written to the row');
});

test('createNotification says whether the row was stored, and a rejected duplicate is not an error', async (t) => {
  const logs = quietLogs(t);
  assert.equal(await notify.createNotification(admin().client, PREP), true);
  assert.equal(await notify.createNotification(admin({ insertError: { message: 'boom' } }).client, PREP), false);
  assert.ok(logs.some(([lvl, l]) => lvl === 'error' && l.includes('insert failed')));
  logs.length = 0;
  const dup = { code: '23505', message: 'duplicate key value violates unique constraint "notifications_dedupe_uidx"' };
  assert.equal(await notify.createNotification(admin({ insertError: dup }).client, PREP), false);
  assert.ok(!logs.some(([lvl]) => lvl === 'error'), 'a duplicate the index rejected is logged as an error');
  assert.equal(await notify.createNotification(admin().client, { ...PREP, userId: '' }), false);
});
