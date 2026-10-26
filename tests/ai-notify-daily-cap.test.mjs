// tests/ai-notify-daily-cap.test.mjs
//
// THE DAILY CAP IS THE PERSON'S ONE LIMIT (owner, 2026-10-20: a separate PR after #2413). The
// AI notify engine counted only its own sends against notification_settings.daily_cap, so a
// day of coach messages or friends' habit pushes never held back its own: a member could get
// their cap in habit pushes at 8 pm and another cap's worth from the engine after. It now reads
// every notice stamped as pushed on the person's own date (loadPushedToday) and caps on the
// larger of that and its own count.
// The places are claimed in the database before anything is sent (owner, 2026-10-21: "yes build
// the cap reservation"; 2026-10-21-push-cap-claims.sql, push-cap.ts, decideAndClaim), so two
// senders deciding in the same minute can't both take the last one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { READER_COPY_EN } from './helpers/reader-copy-en.mjs';
import { clientCandidates, decideNotifications, dailyCap, pushCount } from '../src/lib/ai/notifications.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const pushCap = await loadRealModule(join(ROOT, 'src/lib/push-cap.ts'), { typescript: true });
const core = await loadRealModule(join(ROOT, 'src/lib/ai/notify-core.ts'), {
  typescript: true,
  registry: new Map([
    ['@/lib/ai/notifications.mjs', await import('../src/lib/ai/notifications.mjs')],
    // The reader's language (#2418, reader-copy.ts): loadPrefs and loadPushedToday don't use it.
    ['@/lib/ai/memberTranslator.mjs', { memberLocaleCode: () => 'en' }],
    ['@/lib/reader-copy', READER_COPY_EN],
    ['../../../mobile-app/src/services/leadReason.mjs', await import('../mobile-app/src/services/leadReason.mjs')],
    ['@/lib/roles.mjs', await import('../src/lib/roles.mjs')],
    ['@/lib/notify', { createNotification: async () => true }],
    ['@/lib/email', { sendEmail: async () => ({ ok: true }) }],
    ['@/lib/time', await loadRealModule(join(ROOT, 'src/lib/time.ts'), { typescript: true })],
    ['@/lib/push-cap', pushCap],
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
    // Codex on #2417: in the same batch as the other per-person reads, not a round trip of its own.
    assert.match(src, /const \[last, settings, [^\]]*\bpushedToday\] = await Promise\.all\(\[[^\]]*loadPushedToday\(/, rel);
    assert.doesNotMatch(src, /await loadPushedToday\(/, `${rel}: no read of its own`);
    assert.match(src, /decideAndClaim\(admin, [a-zA-Z.]+, \{ candidates, last, prefs, now, audience, checkinOptedOut, pushedToday[,} ][^;]*\}, prefs\.capTz\)/, rel);
    assert.ok(src.indexOf('loadPushedToday(') < src.indexOf('decideAndClaim('), `${rel}: the count is read first`);
  }
});

// Codex on #2417: the newest 50 rows of any kind let a day of in-app notices hide the morning's
// pushes, so the engine sent a fresh cap's worth. Only pushed rows are read now.
test("a day of in-app notices doesn't hide the morning's pushes", async () => {
  const rows = [
    row('m1', 'ann', 12, { inapp: true, push: true }),
    row('m2', 'ann', 11.5, { inapp: true, push: true }),
    row('m3', 'ann', 11, { inapp: true, push: true }),
    row('m4', 'ann', 10.5, { inapp: true, push: true }),
  ];
  for (let i = 0; i < 60; i += 1) rows.push(row(`q${i}`, 'ann', 10 - i / 10, i % 2 ? { inapp: true, push: false } : null));
  const db = fakeSupabase({ tables: { notifications: rows } });
  assert.equal(await core.loadPushedToday(db, 'ann', NOW, TZ), 4);
  const src = read('src/lib/ai/notify-core.ts');
  assert.match(src, /\.eq\('data->channels->>push', 'true'\)/, 'filtered in the database, before the limit');
});

// Codex on #2417: a digest held from an earlier run went out with a push whether or not the cap
// was spent, so past the cap every hourly run with something held pushed once more.
const held = () => ({
  date: '2026-10-19',
  sentToday: 0,
  pendingDigest: [{ type: 'score_drop', title: 'Down 12', body: 'b', route: 'home', data: {}, priority: 'high', channels: { inapp: true, push: true, email: false }, sig: 's1', key: 'k1', at: +DAY - 3600e3 }],
});
const digestOf = (opts) => decideNotifications({ candidates: [], prefs: { tz: TZ, maxPerDay: 4 }, now: DAY, audience: 'client', ...opts });

test('past the cap the digest lands without a push, and under it a pushed digest counts', () => {
  const spent = digestOf({ last: held(), pushedToday: 4 });
  assert.ok(spent.digest, 'the held items still land');
  assert.equal(spent.digest.channels.push, false);
  assert.equal(spent.digest.channels.inapp, true);
  assert.equal(spent.nextState.sentToday, 0, 'an unpushed digest is not counted');

  const ownSpent = digestOf({ last: { ...held(), sentToday: 4 }, pushedToday: null });
  assert.equal(ownSpent.digest.channels.push, false, "the engine's own count holds it too");

  const room = digestOf({ last: held(), pushedToday: 3 });
  assert.equal(room.digest.channels.push, true);
  assert.equal(room.nextState.sentToday, 1, 'a pushed digest counts against the cap');

  const inAppOnly = held();
  inAppOnly.pendingDigest[0].channels = { inapp: true, push: false, email: false };
  assert.equal(digestOf({ last: inAppOnly, pushedToday: 0 }).nextState.sentToday, 0, 'nothing to push, nothing counted');
});

// Codex on #2417: when every held item wants a push only, taking the push away left the digest
// no channel to land on, yet its items were stamped and cleared, so they were lost.
test('push-only items past the cap stay held, and go out with a push once there is room', () => {
  const pushOnly = held();
  pushOnly.pendingDigest[0].channels = { inapp: false, push: true, email: false };
  const spent = digestOf({ last: pushOnly, pushedToday: 4 });
  assert.equal(spent.digest, null, 'nothing to land on, so nothing is sent');
  assert.equal(spent.nextState.pendingDigest.length, 1, 'the item is still held');
  assert.equal(spent.nextState.types['score_drop:k1'], undefined, 'and not stamped as delivered');

  const tomorrow = decideNotifications({ candidates: [], last: spent.nextState, prefs: { tz: TZ, maxPerDay: 4 }, now: new Date(+DAY + 86400e3), audience: 'client', pushedToday: 0 });
  assert.equal(tomorrow.digest.channels.push, true);
  assert.equal(tomorrow.nextState.pendingDigest.length, 0);
});

// Codex on #2417: in a mixed queue past the cap, the in-app item's digest carried the push-only
// item too, stamped and cleared it, so it reached only the bell the member turned off.
test('past the cap a mixed queue sends what has a channel open and holds the push-only item', () => {
  const mixed = held();
  mixed.pendingDigest = [
    { ...mixed.pendingDigest[0], channels: { inapp: false, push: true, email: false }, sig: 's1', key: 'k1' },
    { ...mixed.pendingDigest[0], title: 'Goal slipping', channels: { inapp: true, push: true, email: false }, sig: 's2', key: 'k2' },
  ];
  const spent = digestOf({ last: mixed, pushedToday: 4 });
  assert.deepEqual(spent.digest.channels, { inapp: true, push: false, email: false });
  assert.equal(spent.digest.data.items.length, 1, 'only the item with the bell open goes out');
  assert.deepEqual(spent.nextState.pendingDigest.map((i) => i.key), ['k1'], 'the push-only item waits');
  assert.ok(spent.nextState.types['score_drop:k2'], 'the delivered item is stamped');
  assert.equal(spent.nextState.types['score_drop:k1'], undefined, 'the held one is not');

  const tomorrow = decideNotifications({ candidates: [], last: spent.nextState, prefs: { tz: TZ, maxPerDay: 4 }, now: new Date(+DAY + 86400e3), audience: 'client', pushedToday: 0 });
  assert.equal(tomorrow.digest.channels.push, true);
  assert.deepEqual(tomorrow.nextState.pendingDigest, []);
});

// Codex on #2417: the day's count from other senders is their pushes, but this engine's own
// in-app-only sends took a place too, so one of them could hold back the push after it.
test('the cap counts and holds pushes only: an in-app-only alert neither takes a place nor waits', () => {
  const inAppDirective = { tz: TZ, maxPerDay: 4, matrix: { directive: { push: false } } };
  const room = decideNotifications({ candidates: cands(), last: {}, prefs: inAppDirective, now: DAY, audience: 'client', pushedToday: 3 });
  assert.deepEqual(room.send.map((i) => [i.type, i.channels.push]), [['directive', false], ['score_drop', true]], 'the in-app alert left the last place to the push');
  assert.equal(room.nextState.sentToday, 1, 'only the push is counted');

  const spent = decideNotifications({ candidates: cands(), last: {}, prefs: inAppDirective, now: DAY, audience: 'client', pushedToday: 4 });
  assert.deepEqual(spent.send.map((i) => i.type), ['directive'], 'past the cap the in-app alert still goes now');
  assert.ok(spent.suppressed.filter((s) => s.reason === 'capped').length === 2, 'the pushes wait for the digest');
});

// Codex on #2417: the habit cron dates the shared cap in the profile's zone first, the engine read
// only the notification settings' zone, so after travel the two senders counted different days.
// Only the cap's day moved: quiet hours stay on the settings' zone, where push delivery reads them.
test("the cap's day and quiet hours are read in the habit cron's zone: profile, then settings", async () => {
  const prefsWith = (tables) => core.loadPrefs(fakeSupabase({ tables }), 'ann');
  const settings = { notification_settings: [{ user_id: 'ann', tz: 'America/New_York' }] };
  const travelled = await prefsWith({ ...settings, client_profiles: [{ user_id: 'ann', timezone: 'Asia/Tokyo' }] });
  assert.equal(travelled.capTz, 'Asia/Tokyo');
  // Owner, 2026-10-26 ("fix 1-7"): quiet hours are the person's own night. Push delivery reads the
  // same zone (pushAllowed, push/dispatch/route.ts), so the engine never pushes what delivery holds.
  assert.equal(travelled.tz, 'Asia/Tokyo', "quiet hours follow the person's profile zone, as push delivery's do");
  assert.equal((await prefsWith({ ...settings })).tz, 'America/New_York', 'no profile zone: the settings zone');
  const nowhere = await prefsWith({});
  assert.equal(nowhere.quietStart, nowhere.quietEnd, 'no zone known: no quiet hours, rather than UTC nights');
  assert.match(read('src/app/api/push/dispatch/route.ts'), /return inQuietHours\(now, quietWindow\(settings, personZone\(profileTz, settings\?\.tz\)\)\);/);
  assert.equal((await prefsWith({ ...settings })).capTz, 'America/New_York', 'no profile zone falls back to the settings');
  assert.equal((await prefsWith({ ...settings, client_profiles: [{ user_id: 'ann', timezone: 'Not/AZone' }] })).capTz, 'America/New_York', 'an unusable profile zone is skipped');
  assert.equal((await prefsWith({ client_profiles: [{ user_id: 'ben', timezone: 'Asia/Tokyo' }] })).capTz, 'UTC', "another person's profile is not read");
  // The habit cron resolves the same order, so both senders date the cap alike.
  assert.match(read('src/app/api/cron/habit-watch/route.ts'), /const tzOf = \(u: string\) => personZone\.get\(u\) \|\| zone\(\(quietOf\.get\(u\) \|\| \{\}\)\.tz\) \|\| 'UTC';/);
  for (const rel of ['src/app/api/ai/notify/route.ts', 'src/app/api/ai/notify/cron/route.ts']) {
    assert.match(read(rel), /loadPushedToday\([^)]*, now, prefs\.capTz\)/, `${rel}: the day's pushes are counted on the cap's day`);
  }
});

test("the engine's own count resets on the cap's day, and quiet hours are read on the settings' clock", () => {
  // 15:00Z: 11 am on the 19th in New York, midnight starting the 20th in Tokyo.
  const prefs = { tz: 'America/New_York', capTz: 'Asia/Tokyo', maxPerDay: 4 };
  const yesterdaysFour = { date: '2026-10-19', sentToday: 4 };
  const fresh = decideNotifications({ candidates: cands(), last: yesterdaysFour, prefs, now: DAY, audience: 'client' });
  assert.equal(fresh.nextState.date, '2026-10-20', "the cap's day is Tokyo's");
  assert.ok(fresh.send.length > 0, "yesterday's four no longer hold today's pushes back");
  // 03:00Z: noon in Tokyo, 11 pm in New York, inside the settings' quiet hours (22 to 7).
  const night = decideNotifications({ candidates: cands(), last: {}, prefs, now: new Date('2026-10-20T03:00:00Z'), audience: 'client' });
  assert.equal(night.send.length, 0, 'held, as push delivery would hold it');
  assert.ok(night.suppressed.every((x) => x.reason === 'quiet_hours'));
});

// Codex on #2417: new pushes were let in before the held digest, so a morning with a cap's worth of
// them left a held push-only item no room, day after day.
test("a held digest that wants a push keeps one place, and the day still pushes no more than the cap", () => {
  const pushOnly = held();
  pushOnly.date = '2026-10-18';
  pushOnly.pendingDigest[0].channels = { inapp: false, push: true, email: false };
  const run = decideNotifications({ candidates: cands(), last: pushOnly, prefs: { tz: TZ, maxPerDay: 3 }, now: DAY, audience: 'client', pushedToday: 0 });
  assert.equal(run.send.length, 2, 'two of the three new pushes go now');
  assert.equal(run.digest.channels.push, true, 'the held item goes out with a push');
  assert.equal(run.digest.data.items.length, 2, 'with the push this run held past the reserved place');
  assert.deepEqual(run.nextState.pendingDigest, []);
  assert.equal(run.nextState.sentToday, 3, 'three pushes in all: the cap');

  const nothingHeld = decideNotifications({ candidates: cands(), last: {}, prefs: { tz: TZ, maxPerDay: 3 }, now: DAY, audience: 'client', pushedToday: 0 });
  assert.equal(nothingHeld.send.length, 3, 'with nothing held, no place is kept back');

  const inAppHeld = held();
  inAppHeld.date = '2026-10-18';
  inAppHeld.pendingDigest[0].channels = { inapp: true, push: false, email: false };
  const bell = decideNotifications({ candidates: cands(), last: inAppHeld, prefs: { tz: TZ, maxPerDay: 3 }, now: DAY, audience: 'client', pushedToday: 0 });
  assert.equal(bell.send.length, 3, 'a held item that wants no push keeps no place');
  assert.equal(bell.digest.channels.push, false);
});

// ── The places, claimed in the database (2026-10-21) ─────────────────────────
const quietly = async (fn) => {
  const warned = [];
  const orig = console.warn;
  console.warn = (...a) => warned.push(a.join(' '));
  try { return { out: await fn(), warned }; } finally { console.warn = orig; }
};
// A database that grants `grant(args)` places and records what it was asked.
const claimsDb = (grant) => {
  const asked = [];
  const tables = { push_cap_claims: [] };
  const db = fakeSupabase({ tables, rpcs: { claim_push_slots: (args) => {
    asked.push(args);
    const granted = grant(args);
    const id = granted > 0 ? `claim-${asked.length}` : null;
    if (id) tables.push_cap_claims.push({ id, user_id: args.p_user, slots: granted });
    return [{ claim_id: id, granted }];
  } } });
  return { db, asked, tables };
};
const input = (over = {}) => ({ candidates: cands(), last: {}, prefs: { tz: TZ, capTz: TZ, maxPerDay: 4 }, now: DAY, audience: 'client', checkinOptedOut: false, pushedToday: 0, ...over });

test('the pushes decided are claimed under the cap, and a full grant keeps the decision', async () => {
  const plain = decideNotifications(input());
  const want = pushCount(plain);
  assert.ok(want >= 2, 'the fixture pushes more than one');
  const { db, asked } = claimsDb((a) => a.p_want);
  const { decided, claim } = await core.decideAndClaim(db, 'ann', input(), TZ);
  assert.deepEqual(asked, [{ p_user: 'ann', p_tz: TZ, p_cap: 4, p_want: want }], "what was decided, on the cap's own day");
  assert.deepEqual(claim, { id: 'claim-1', granted: want });
  assert.deepEqual(decided, plain);
});

test('granted fewer, the engine decides again with only those: the rest wait for the digest', async () => {
  const want = pushCount(decideNotifications(input()));
  const { db } = claimsDb(() => 1);
  const { decided, claim } = await core.decideAndClaim(db, 'ann', input(), TZ);
  assert.equal(claim.granted, 1);
  assert.equal(pushCount(decided), 1, 'one push, the place it holds');
  assert.equal(decided.suppressed.filter((x) => x.reason === 'capped').length, want - 1);
  assert.equal(decided.nextState.pendingDigest.length, want - 1, 'nothing lost: held for the digest');
  // The same decision as a day with every other place taken.
  assert.deepEqual(decided, decideNotifications(input({ pushedToday: 3 })));
});

test('granted none, nothing pushes and every push waits', async () => {
  const want = pushCount(decideNotifications(input()));
  const { db, tables } = claimsDb(() => 0);
  const { decided, claim } = await core.decideAndClaim(db, 'ann', input(), TZ);
  assert.deepEqual(claim, { id: null, granted: 0 });
  assert.equal(pushCount(decided), 0);
  assert.equal(decided.nextState.pendingDigest.length, want);
  assert.deepEqual(tables.push_cap_claims, [], 'nothing granted, nothing held in the database');
});

test('whatever the grant, the second decision pushes no more than it, held digest included', async () => {
  // A held push-only item (one place reserved for the digest) and new pushes, on a day with one
  // push already sent by this engine.
  const last = held();
  last.sentToday = 1;
  last.pendingDigest[0].channels = { inapp: false, push: true, email: false };
  const first = decideNotifications(input({ last, pushedToday: 1 }));
  const want = pushCount(first);
  assert.ok(want >= 2);
  for (let g = 0; g <= want; g += 1) {
    const { db } = claimsDb(() => g);
    const { decided } = await core.decideAndClaim(db, 'ann', input({ last, pushedToday: 1 }), TZ);
    assert.ok(pushCount(decided) <= g, `granted ${g}, pushed ${pushCount(decided)}`);
    const before = first.nextState.pendingDigest.length + first.send.length + (first.digest ? first.digest.data.items.length : 0);
    const after = decided.nextState.pendingDigest.length + decided.send.length + (decided.digest ? decided.digest.data.items.length : 0);
    assert.equal(after, before, `granted ${g}: every item is sent or still held`);
  }
});

test('nothing to push claims nothing', async () => {
  const { db, asked } = claimsDb((a) => a.p_want);
  const muted = await core.decideAndClaim(db, 'ann', input({ prefs: { tz: TZ, capTz: TZ, maxPerDay: 4, muted: true } }), TZ);
  assert.equal(muted.claim, null);
  const inAppOnly = { tz: TZ, capTz: TZ, maxPerDay: 4, matrix: { directive: { push: false }, score_drop: { push: false }, goal_slip: { push: false } } };
  const quiet = await core.decideAndClaim(db, 'ann', input({ prefs: inAppOnly }), TZ);
  assert.equal(quiet.claim, null);
  assert.ok(quiet.decided.send.length > 0, 'the in-app alerts still go');
  assert.equal(asked.length, 0);
});

test("a claim that can't be made keeps the first decision, on the count as read", async () => {
  const db = fakeSupabase({ fail: ['rpc:claim_push_slots'] });
  const { out, warned } = await quietly(() => core.decideAndClaim(db, 'ann', input(), TZ));
  assert.equal(out.claim, null);
  assert.deepEqual(out.decided, decideNotifications(input()));
  assert.ok(warned.some((w) => /could not claim places/.test(w)));
});

test('the claim and the decision use the same cap: an unset or zero cap is the default four', async () => {
  assert.equal(dailyCap({}), 4);
  assert.equal(dailyCap({ maxPerDay: 0 }), 4);
  assert.equal(dailyCap({ maxPerDay: 6 }), 6);
  const { db, asked } = claimsDb((a) => a.p_want);
  await core.decideAndClaim(db, 'ann', input({ prefs: { tz: TZ, capTz: TZ, maxPerDay: 0 } }), TZ);
  assert.equal(asked[0].p_cap, 4);
  await core.decideAndClaim(db, 'ann', input({ prefs: { tz: TZ, capTz: TZ, maxPerDay: 6 } }), TZ);
  assert.equal(asked[1].p_cap, 6, "the person's own cap");
});

test('deciding again from the same state is the same decision, and the state is left as it was', () => {
  const last = held();
  last.types = { 'directive:self': { sig: 'old', sigs: [{ s: 'old', at: +DAY - 1000 }], at: +DAY - 1000 } };
  const before = JSON.stringify(last);
  const a = decideNotifications(input({ last, pushedToday: 2 }));
  const b = decideNotifications(input({ last, pushedToday: 2 }));
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(last), before, "the first decision didn't touch the state the second reads");
});

test('pushCount counts pushed items and a digest that pushes', () => {
  const item = (push) => ({ channels: { inapp: true, push, email: false } });
  assert.equal(pushCount({ send: [item(true), item(false), {}], digest: item(true) }), 3, 'an item without channels pushes, as deliver() sends it');
  assert.equal(pushCount({ send: [], digest: item(false) }), 0);
  assert.equal(pushCount({ send: [item(true)], digest: null }), 1);
});

test('claimPushSlots reads the granted places, and never more than asked', async () => {
  const db = fakeSupabase({ rpcs: { claim_push_slots: () => [{ claim_id: 'c1', granted: 5 }] } });
  assert.deepEqual(await pushCap.claimPushSlots(db, 'ann', { tz: TZ, cap: 4, want: 2 }), { id: 'c1', granted: 2 });
  assert.deepEqual(db._calls[0], { rpc: 'claim_push_slots', args: { p_user: 'ann', p_tz: TZ, p_cap: 4, p_want: 2 } });
  const none = fakeSupabase({ rpcs: { claim_push_slots: () => [{ claim_id: null, granted: 0 }] } });
  assert.deepEqual(await pushCap.claimPushSlots(none, 'ann', { tz: '', cap: 4, want: 1 }), { id: null, granted: 0 });
  assert.equal(none._calls[0].args.p_tz, 'UTC', 'no zone is UTC');
  const asksNothing = fakeSupabase({});
  assert.deepEqual(await pushCap.claimPushSlots(asksNothing, 'ann', { tz: TZ, cap: 4, want: 0 }), { id: null, granted: 0 });
  assert.equal(asksNothing._calls.length, 0, 'nothing wanted, nothing asked');
});

test('an answer that cannot be read is no claim, so the sender keeps the count as read', async () => {
  for (const data of [null, [], [{}], [{ granted: -1 }], [{ granted: 1.5 }], [{ granted: 'lots' }]]) {
    const db = fakeSupabase({ rpcs: { claim_push_slots: () => data } });
    const { out, warned } = await quietly(() => pushCap.claimPushSlots(db, 'ann', { tz: TZ, cap: 4, want: 1 }));
    assert.equal(out, null, JSON.stringify(data));
    assert.ok(warned.length, 'and says so');
  }
  const throws = { rpc: async () => { throw new Error('network'); } };
  assert.equal((await quietly(() => pushCap.claimPushSlots(throws, 'ann', { tz: TZ, cap: 4, want: 1 }))).out, null);
});

test('releasePushClaim deletes the claim, and a release that fails is only logged', async () => {
  const tables = { push_cap_claims: [{ id: 'c1' }, { id: 'c2' }] };
  const db = fakeSupabase({ tables });
  await pushCap.releasePushClaim(db, { id: 'c1', granted: 1 });
  assert.deepEqual(tables.push_cap_claims, [{ id: 'c2' }]);
  await pushCap.releasePushClaim(db, null);
  await pushCap.releasePushClaim(db, { id: null, granted: 0 });
  assert.equal(db._calls.filter((c) => c.op === 'delete').length, 1, 'no claim, nothing to delete');
  const broken = fakeSupabase({ tables, fail: ['push_cap_claims'] });
  const { warned } = await quietly(() => pushCap.releasePushClaim(broken, { id: 'c2', granted: 1 }));
  assert.ok(warned.some((w) => /lapses in five minutes/.test(w)));
});

test('both routes claim what they decided and release it once delivery is done, whatever happens', () => {
  for (const rel of ['src/app/api/ai/notify/route.ts', 'src/app/api/ai/notify/cron/route.ts']) {
    const src = read(rel);
    assert.doesNotMatch(src, /Notify\.decideNotifications\(/, `${rel}: only through decideAndClaim`);
    assert.match(src, /\} finally \{\n\s*\/\/ [^\n]*\n\s*await releasePushClaim\(admin, claim\);\n\s*\}/, rel);
    assert.ok(src.indexOf('decideAndClaim(') < src.indexOf('deliver(admin'), `${rel}: claimed before sending`);
    assert.ok(src.indexOf('deliver(admin') < src.indexOf('releasePushClaim('), `${rel}: released after`);
  }
  // The live route still writes its state before delivering (a failure skips a nudge, never resends).
  const live = read('src/app/api/ai/notify/route.ts');
  assert.ok(live.indexOf("'notify_state', nextState") < live.indexOf('deliver(admin'));
});

test('the migration: a lock per person around the count, live claims counted, closed to all but the service role', () => {
  const sql = read('supabase-migrations/2026-10-21-push-cap-claims.sql');
  const body = sql.slice(sql.indexOf('create or replace function public.claim_push_slots'));
  assert.match(sql, /create table if not exists public\.push_cap_claims/);
  assert.match(sql, /alter table public\.push_cap_claims enable row level security;/);
  assert.doesNotMatch(sql, /create policy/, 'no policy: only the service role, which bypasses RLS');
  assert.match(sql, /revoke all on public\.push_cap_claims from public, anon, authenticated;/);
  assert.match(sql, /revoke all on function public\.claim_push_slots\(uuid, text, int, int\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.claim_push_slots\(uuid, text, int, int\) to service_role;/);
  assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /\bgrant [^;]*\bto [^;]*\b(public|anon|authenticated)\b/, 'nothing granted to anyone but the service role');
  assert.match(body, /language plpgsql security invoker set search_path = public, pg_temp as \$\$/);
  const lock = body.indexOf('pg_advisory_xact_lock(');
  assert.ok(lock > 0 && lock < body.indexOf('from public.notifications n'), 'the lock is taken before anything is counted');
  assert.match(body, /n\.data -> 'channels' ->> 'push' = 'true'/, 'the pushes, as loadPushedToday counts them');
  assert.match(body, /n\.created_at >= now\(\) - interval '30 hours'/);
  assert.match(body, /\(n\.created_at at time zone v_tz\)::date = v_today/, "on the person's own day");
  assert.match(body, /coalesce\(sum\(c\.slots\), 0\) into v_held/, "other senders' places count until they are released");
  assert.match(body, /delete from public\.push_cap_claims c where c\.user_id = p_user and c\.expires_at <= now\(\);/, 'a lapsed claim holds nothing');
  assert.match(body, /now\(\) \+ interval '5 minutes'/);
  assert.match(body, /least\(p_want::bigint, p_cap::bigint - v_used - v_held\)/);
});
