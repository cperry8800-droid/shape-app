// createPreferredNotification and createNotification (src/lib/notify.ts), run as written against
// a scripted admin client. What a send must never do: go out on preferences it could not read,
// email without the row that records it, or count a rejected duplicate as stored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

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
    ['@/lib/ai/notifications.mjs', notifyLayer],
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
    await notify.createPreferredNotification(client, PREP);
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
    await notify.createPreferredNotification(client, PREP);
    assert.deepEqual(inserted, []);
  }
});

test('no row, no email: an email goes out only once its notification is stored', async (t) => {
  quietLogs(t);
  emails.length = 0;
  const failed = admin({ prefs: EMAIL_ON, insertError: { message: 'insert failed' } });
  await notify.createPreferredNotification(failed.client, PREP);
  assert.equal(failed.inserted.length, 1);
  assert.deepEqual(emails, [], 'emailed with no row to record it');

  const stored = admin({ prefs: EMAIL_ON });
  await notify.createPreferredNotification(stored.client, PREP);
  assert.equal(emails.length, 1, 'the control: a stored row is emailed');
  assert.equal(emails[0].to, 'member@example.com');
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
