// tests/ai-notify-daily-cap.test.mjs
//
// THE DAILY CAP IS THE PERSON'S ONE LIMIT (owner, 2026-10-20: a separate PR after #2413). The
// AI notify engine counted only its own sends against notification_settings.daily_cap, so a
// day of coach messages or friends' habit pushes never held back its own: a member could get
// their cap in habit pushes at 8 pm and another cap's worth from the engine after. It now reads
// every notice stamped as pushed on the person's own date (loadPushedToday) and caps on the
// larger of that and its own count.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { clientCandidates, decideNotifications } from '../src/lib/ai/notifications.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const core = await loadRealModule(join(ROOT, 'src/lib/ai/notify-core.ts'), {
  typescript: true,
  registry: new Map([
    ['@/lib/ai/tone.mjs', await import('../src/lib/ai/tone.mjs')],
    ['@/lib/ai/notifications.mjs', await import('../src/lib/ai/notifications.mjs')],
    ['@/lib/roles.mjs', await import('../src/lib/roles.mjs')],
    ['@/lib/notify', { createNotification: async () => true }],
    ['@/lib/email', { sendEmail: async () => ({ ok: true }) }],
    ['../../../public/newdesign/dashSignals.js', { default: require_('../public/newdesign/dashSignals.js') }],
  ]),
});

// 8:30 pm on Oct 19 in New York: the member's day began 20½ hours ago.
const NOW = new Date('2026-10-20T00:30:00Z');
const TZ = 'America/New_York';
const ago = (h) => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString();
const row = (id, user_id, hoursAgo, channels) => ({ id, user_id, created_at: ago(hoursAgo), type: 'x', data: channels ? { channels } : {} });

test("loadPushedToday counts the pushes of the person's own day, from every sender", async () => {
  const db = fakeSupabase({ tables: { notifications: [
    row('n1', 'ann', 1, { inapp: true, push: true }),     // a coach message, pushed
    row('n2', 'ann', 3, { inapp: true, push: true }),     // a friend's habit, pushed
    row('n3', 'ann', 2, { inapp: true, push: false }),    // in-app only (quiet hours, capped)
    row('n4', 'ann', 2, null),                            // written without the stamp
    row('n5', 'ann', 21, { inapp: true, push: true }),    // 11:30 pm yesterday, her time
    row('n6', 'ben', 1, { inapp: true, push: true }),     // someone else's
  ] } });
  assert.equal(await core.loadPushedToday(db, 'ann', NOW, TZ), 2);
  // The same pushes on another clock: in UTC it is 00:30 on the 20th, so only the last half hour.
  assert.equal(await core.loadPushedToday(db, 'ann', NOW, 'UTC'), 0);
});

test('a failed read is null, so the engine keeps counting its own sends', async () => {
  const warned = [];
  const orig = console.warn;
  console.warn = (...a) => warned.push(a.join(' '));
  try {
    const db = fakeSupabase({ tables: { notifications: [] }, fail: ['notifications'] });
    assert.equal(await core.loadPushedToday(db, 'ann', NOW, TZ), null);
  } finally { console.warn = orig; }
  assert.ok(warned.some((w) => /could not read the day's pushes/.test(w)));
});

// Three high-priority candidates the engine would push.
const cands = () => clientCandidates({
  directive: { verdict: 'Recovery is the lever', reason: 'Sleep was short', action: { label: 'log sleep', kind: 'recovery' }, line: 'Recovery is the lever' },
  flags: [{ key: 'score_drop', reason: 'Down 12' }, { key: 'goal_slip', reason: 'Two weeks later' }],
  tone: 'supportive',
});
const DAY = new Date('2026-10-19T15:00:00Z'); // 11 am in New York, outside quiet hours
const decide = (opts) => decideNotifications({ candidates: cands(), last: {}, prefs: { tz: TZ, maxPerDay: 4 }, now: DAY, audience: 'client', ...opts });

test("the cap counts the day's other pushes: three already leave one place of four", () => {
  const all = decide({});
  assert.ok(all.send.length >= 2, 'the fixture pushes more than one');
  const one = decide({ pushedToday: 3 });
  assert.equal(one.send.length, 1);
  assert.ok(one.suppressed.some((s) => s.reason === 'capped'), 'the rest wait for the digest');
  assert.equal(decide({ pushedToday: 4 }).send.length, 0, 'at the cap, nothing pushes');
});

test("the engine's own count still holds when it is the larger, and a failed read changes nothing", () => {
  const last = { date: '2026-10-19', sentToday: 3 };
  // Its own three are among the day's pushes; one stamped push read back must not reset them.
  assert.equal(decide({ last, pushedToday: 1 }).send.length, 1);
  assert.equal(decide({ last, pushedToday: null }).send.length, 1);
  assert.deepEqual(decide({ pushedToday: null }).send.length, decide({}).send.length, 'null is the old behaviour');
});

test('both the live route and the cron read the day before deciding', () => {
  for (const rel of ['src/app/api/ai/notify/route.ts', 'src/app/api/ai/notify/cron/route.ts']) {
    const src = read(rel);
    assert.match(src, /const pushedToday = await loadPushedToday\(/, rel);
    assert.match(src, /Notify\.decideNotifications\(\{ candidates, last, prefs, now, audience, checkinOptedOut, pushedToday \}\)/, rel);
    assert.ok(src.indexOf('loadPushedToday(') < src.indexOf('Notify.decideNotifications('), `${rel}: the count is read first`);
  }
});
