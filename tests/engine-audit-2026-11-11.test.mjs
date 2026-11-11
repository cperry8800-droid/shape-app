// The engine audit of 2026-11-11 (the coach-alerts review): what each confirmed finding fixed, in the
// one engine every surface runs (public/newdesign/dashSignals.js). The push's half of F1 and F2 is in
// tests/coach-alert-memory.test.mjs and Nora's F2 and F3 in tests/nora-coach-today.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const E = createRequire(import.meta.url)('../public/newdesign/dashSignals.js');
const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const DAY = 864e5;
const LA = 'America/Los_Angeles';
const row = (role, rec, now, zone) => (zone ? E.inZone(zone, now, (at) => E.getTriageFeed(role, [rec], at)) : E.getTriageFeed(role, [rec], now))[0];
const keys = (r) => r.flags.map((f) => f.key);

// ── F2: the reader's own day ────────────────────────────────────────────────
test('inZone reads a check-in on the zone\'s own week: Sunday evening in Los Angeles is not Monday (F2)', () => {
  const rec = { profile: { id: 'c1', name: 'A' }, checkIn: { lastWeekOf: '2026-11-02' }, progressRead: { state: 'ready' }, foodLogs: { lastLoggedOn: '2026-11-15', daysLogged7d: 6 } };
  const sunday = new Date('2026-11-16T02:00:00Z'); // 6 pm Sunday in Los Angeles, 2 am Monday in UTC
  assert.equal(row('trainer', rec, sunday).severity, 'red', 'the server\'s UTC Monday: two weeks');
  const la = row('trainer', rec, sunday, LA);
  assert.equal(la.severity, 'amber');
  assert.deepEqual(la.reasons, ['Check-in due — last was week of 2026-11-02']);
  // Wednesday 7 pm there is Thursday in UTC: the grace (to Thursday) has not begun for the coach.
  const rec2 = { ...rec, checkIn: { lastWeekOf: '2026-11-02' }, foodLogs: { lastLoggedOn: '2026-11-11', daysLogged7d: 6 } };
  const wed = new Date('2026-11-12T03:00:00Z');
  assert.ok(keys(row('trainer', rec2, wed)).includes('checkin_overdue'));
  assert.ok(!keys(row('trainer', rec2, wed, LA)).includes('checkin_overdue'));
});

test('inZone counts a food-log gap and a moment on the zone\'s clock (F2)', () => {
  const rec = { profile: { id: 'c2', name: 'B' }, progressRead: { state: 'ready' }, foodLogs: { lastLoggedOn: '2026-11-09', daysLogged7d: 2 } };
  const at = new Date('2026-11-12T05:00:00Z'); // 9 pm Wednesday in Los Angeles, Thursday in UTC
  assert.ok(keys(row('nutritionist', rec, at)).includes('food_gap'), 'UTC: three days since the 9th');
  assert.ok(!keys(row('nutritionist', rec, at, LA)).includes('food_gap'), 'the coach\'s Wednesday: two');
  // A moment written with its zone moves to the wall clock; a day stays a day.
  const w = E._internals.wallClock(new Date('2026-11-16T02:00:00Z'), LA);
  assert.deepEqual([w.getFullYear(), w.getMonth() + 1, w.getDate(), w.getHours()], [2026, 11, 15, 18]);
  E.inZone(LA, new Date(), () => {
    assert.equal(E._internals.toDate('2026-11-16T02:00:00Z').getHours(), 18);
    assert.equal(E._internals.toDate('2026-11-16T02:00:00+00:00').getHours(), 18);
    assert.equal(E._internals.toDate('2026-11-16').getDate(), 16, 'a date with no time is not moved');
    assert.equal(E._internals.toDate('2026-11-16T09:00:00').getHours(), 9, 'a time with no zone is already local');
  });
  assert.equal(E._internals.toDate('2026-11-16T02:00:00Z').getTime(), Date.parse('2026-11-16T02:00:00Z'), 'outside a scope, nothing moves');
});

test('a scope is one at a time, put back after a throw, and a zone it cannot read leaves the clock as it is (F2)', () => {
  const at = new Date('2026-11-16T02:00:00Z');
  E.inZone(LA, at, (outer) => {
    assert.equal(outer.getHours(), 18);
    E.inZone('Asia/Tokyo', outer, (inner) => assert.equal(inner, outer, 'a nested scope keeps the outer one'));
  });
  assert.throws(() => E.inZone(LA, at, () => { throw new Error('boom'); }), /boom/);
  assert.equal(E._internals.toDate('2026-11-16T02:00:00Z').getTime(), Date.parse('2026-11-16T02:00:00Z'), 'released after the throw');
  for (const z of ['Not/AZone', '', null, undefined, 42]) E.inZone(z, at, (t) => assert.equal(+t, +at, String(z)));
});

test('a flag\'s signature is the same in any zone, so a dismissal made on the phone holds on the server (F2)', () => {
  const at = new Date('2026-11-16T02:00:00Z');
  const rec = { profile: { id: 'c3', name: 'C' }, progressRead: { state: 'ready' }, foodLogs: { lastLoggedOn: '2026-11-15', daysLogged7d: 6 }, checkIn: { lastWeekOf: '2026-11-09' },
    lastContact: { trainer: '2026-11-01T10:00:00Z' }, replyWait: { trainer: '2026-11-14T08:00:00Z' } };
  const sig = (zone, key) => row('trainer', rec, at, zone).flags.find((f) => f.key === key).sig;
  for (const key of ['contact_gap', 'reply_waiting']) {
    assert.equal(sig('Australia/Sydney', key), sig(null, key), key);
    assert.equal(sig(LA, key), sig(null, key), key);
  }
  assert.equal(sig(LA, 'contact_gap'), 'last:2026-11-01T10:00:00.000Z');
  assert.equal(sig(LA, 'reply_waiting'), 'since:2026-11-14T08:00:00.000Z');
  const dismissed = { ...rec, dismissals: [{ key: 'contact_gap', sig: sig(null, 'contact_gap'), until: null }] };
  assert.ok(!keys(row('trainer', dismissed, at, 'Australia/Sydney')).includes('contact_gap'), 'dismissed there, dismissed here');
  // A member's view of their latest contact, from either coach, signs the moment as written.
  const both = { profile: { id: 'c4', name: 'D' }, progressRead: { state: 'ready' }, lastContact: { trainer: '2026-10-20T10:00:00Z', nutritionist: '2026-10-25T10:00:00Z' } };
  const mine = E.inZone(LA, at, (t) => E.evaluateClient(both, t, 'client')).flags.find((f) => f.key === 'contact_gap');
  assert.equal(mine.sig, 'last:2026-10-25T10:00:00.000Z');
});

// Codex on #2703: across a daylight-saving change the wall clock gains or loses an hour, and elapsed
// time must not. 2026-11-01 is the fall-back night in Los Angeles (2 am PDT is 1 am PST at 09:00Z).
test('a reply\'s hours and a snooze\'s end are real elapsed time inside a scope, across a DST change (F2)', () => {
  const tuned = E.resolveThresholds({ REPLY_WAIT_HOURS: 2 }, 'trainer').thresholds;
  const rec = { profile: { id: 'r1', name: 'R' }, progressRead: { state: 'ready' }, foodLogs: { lastLoggedOn: '2026-10-31', daysLogged7d: 6 }, checkIn: { lastWeekOf: '2026-10-26' }, replyWait: { trainer: '2026-11-01T07:00:00Z' } };
  const at = new Date('2026-11-01T09:30:00Z'); // 2.5 hours on, 1:30 am PST on the wall
  const reply = E.inZone(LA, at, (t) => E.getTriageFeed('trainer', [rec], t, tuned))[0].flags.find((f) => f.key === 'reply_waiting');
  assert.ok(reply, 'two and a half hours is over a two-hour line');
  assert.equal(reply.reason, 'Their message has waited 2 hours for your reply');
  // A snooze is held to its own instant, in any zone: one that ended half an hour ago has ended, and
  // one that ends in half an hour still holds.
  const now = new Date('2026-11-11T12:00:00Z');
  const quiet = { profile: { id: 'r2', name: 'S' }, progressRead: { state: 'ready' }, foodLogs: { lastLoggedOn: '2026-11-10', daysLogged7d: 6 }, checkIn: { lastWeekOf: '2026-11-09' }, lastContact: { trainer: '2026-11-01T10:00:00Z' } };
  const sig = E.getTriageFeed('trainer', [quiet], now)[0].flags.find((f) => f.key === 'contact_gap').sig;
  const snoozed = (mins) => ({ ...quiet, dismissals: [{ key: 'contact_gap', sig, until: new Date(+now + mins * 60e3).toISOString() }] });
  const shows = (rec2) => E.inZone('Australia/Sydney', now, (t) => E.getTriageFeed('trainer', [rec2], t))[0].flags.some((f) => f.key === 'contact_gap');
  assert.equal(shows(snoozed(-30)), true, 'a snooze that ended half an hour ago');
  assert.equal(shows(snoozed(30)), false, 'a snooze with half an hour to go');
});

// Codex on #2703: the hour a fall-back repeats puts wall clocks out of order. 08:30Z reads 1:30 am PDT
// in Los Angeles and the later 09:15Z reads 1:15 am PST, so a member's latest contact is picked by
// real instant, whichever coach wrote it.
test('a member\'s latest contact is the later instant, even in the hour a fall-back repeats (F2)', () => {
  const at = new Date('2026-11-08T20:00:00Z');
  const latest = (lastContact) => E.inZone(LA, at, (t) => E.evaluateClient({ profile: { id: 'm1', name: 'M' }, progressRead: { state: 'ready' }, lastContact }, t, 'client'))
    .flags.find((f) => f.key === 'contact_gap');
  assert.equal(latest({ trainer: '2026-11-01T09:15:00Z', nutritionist: '2026-11-01T08:30:00Z' }).sig, 'last:2026-11-01T09:15:00.000Z');
  assert.equal(latest({ trainer: '2026-11-01T08:30:00Z', nutritionist: '2026-11-01T09:15:00Z' }).sig, 'last:2026-11-01T09:15:00.000Z');
  assert.equal(latest({ trainer: null, nutritionist: '2026-11-01T08:30:00Z' }).sig, 'last:2026-11-01T08:30:00.000Z', 'one coach only');
  // …and its days are counted on the member's wall clock: 1 am Nov 2 to 12:30 am Nov 10 in Sydney is seven.
  const syd = E.inZone('Australia/Sydney', new Date('2026-11-09T13:30:00Z'), (t) => E.evaluateClient({ profile: { id: 'm2', name: 'N' }, progressRead: { state: 'ready' },
    lastContact: { trainer: '2026-11-01T14:00:00Z', nutritionist: '2026-10-30T14:00:00Z' } }, t, 'client')).flags.find((f) => f.key === 'contact_gap');
  assert.equal(syd.figures.days, 7);
});

// ── F4: a check-in from before they hired this coach ─────────────────────────
test('a check-in from before the client joined is not one: a new client is not red on day one (F4)', () => {
  const now = new Date('2026-11-11T12:00:00Z');
  const base = { progressRead: { state: 'ready' }, foodLogs: { lastLoggedOn: '2026-11-10', daysLogged7d: 6 } };
  const fresh = { ...base, profile: { id: 'n1', name: 'New', isNew: true, joinedAt: '2026-11-09T15:00:00Z' }, checkIn: { lastWeekOf: '2026-09-28' } };
  const r = row('trainer', fresh, now);
  assert.equal(r.severity, 'green');
  assert.ok(!keys(r).includes('checkin_overdue'), 'the new client\'s pass, as with no check-in at all');
  // Joined six weeks ago and never checked in with this coach: their first one is what is missing.
  const long = { ...base, profile: { id: 'n2', name: 'Old', joinedAt: '2026-09-28T09:00:00Z' }, checkIn: { lastWeekOf: '2026-09-14' } };
  assert.deepEqual(row('trainer', long, now).flags.filter((f) => f.key === 'checkin_overdue').map((f) => f.label), ['No first check-in']);
  // The week they joined counts, filed before or after the moment they did.
  const sameWeek = { ...base, profile: { id: 'n3', name: 'Same', isNew: true, joinedAt: '2026-11-11T09:00:00Z' }, checkIn: { lastWeekOf: '2026-11-09' } };
  assert.ok(!keys(row('trainer', sameWeek, now)).includes('checkin_overdue'));
  // …the week, not the moment: a client who joined on a Wednesday and checked in for that week is
  // three weeks late now, not missing a first check-in.
  const joinWeek = { ...base, profile: { id: 'n5', name: 'Wed', joinedAt: '2026-10-21T09:00:00Z' }, checkIn: { lastWeekOf: '2026-10-19' } };
  assert.match(row('trainer', joinWeek, now).reasons.join(' '), /No check-in for 3 weeks/);
  const stillLate = { ...base, profile: { id: 'n4', name: 'Late', joinedAt: '2026-09-07T09:00:00Z' }, checkIn: { lastWeekOf: '2026-09-28' } };
  assert.match(row('trainer', stillLate, now).reasons.join(' '), /No check-in for 6 weeks/, 'a check-in since joining counts as before');
});

// ── F6: the exact share, not the rounded one ────────────────────────────────
test('calories and protein compare the exact share with the line, and print it rounded (F6)', () => {
  const now = new Date('2026-11-11T12:00:00Z');
  const nut = (n) => ({ profile: { id: 'q', name: 'Q' }, progressRead: { state: 'ready' }, checkIn: { lastWeekOf: '2026-11-09' }, foodLogs: { lastLoggedOn: '2026-11-10', daysLogged7d: 6 }, nutrition: n });
  const flagsFor = (n) => keys(row('nutritionist', nut(n), now));
  assert.ok(!flagsFor({ avgCalories: 2190, targetCalories: 2000 }).includes('ledger_blown'), '9.5% over a 10% line');
  const over = row('nutritionist', nut({ avgCalories: 2200, targetCalories: 2000 }), now).flags.find((f) => f.key === 'ledger_blown');
  assert.equal(over.label, 'Ledger +10%', 'exactly on the line flags');
  assert.ok(!flagsFor({ avgProtein: 128, targetProtein: 150 }).includes('protein_under'), '14.7% under a 15% line');
  assert.ok(flagsFor({ avgProtein: 127.5, targetProtein: 150 }).includes('protein_under'), 'exactly 15% under flags');
});

// ── F8: a nutritionist's Plan ending says it isn't live ─────────────────────
test('a nutritionist\'s Plan ending row says it is not live yet; a trainer\'s Program ending is unchanged (F8)', () => {
  const n = E.tunablesFor('nutritionist').find((t) => t.key === 'PROGRAM_END_DAYS');
  const t = E.tunablesFor('trainer').find((x) => x.key === 'PROGRAM_END_DAYS');
  assert.equal(n.label, 'Plan ending');
  assert.match(n.help, /^Not live yet: Shape can't read when a meal plan ends/);
  assert.equal(t.help, 'Flag a program this many days before it ends when nothing is lined up next.');
});

// ── F10: the coach's own Goal slip line ─────────────────────────────────────
test('the goal line slips at the coach\'s own Goal slip days, and the house line after (F10)', () => {
  const now = new Date();
  const nadia = E.buildMockClients(now).find((c) => /Nadia/.test(c.profile.name));
  assert.ok(nadia, 'the demo client whose goal slipped');
  assert.match(E.goalBrief(nadia, now), /\(ETA \+\d+d this wk\)/, 'the house 7 days');
  const tuned = E.resolveThresholds({ GOAL_SLIP_DAYS: 30 }, 'nutritionist').thresholds;
  assert.doesNotMatch(E.goalBrief(nadia, now, tuned), /ETA/, 'a coach who set 30 days');
  assert.equal(E.THRESHOLDS.GOAL_SLIP_DAYS, 7, 'the house value is back after the call');
  // The website's goal card and Today's line take the coach's set, never the house THRESHOLDS.
  const goals = read('public/newdesign/dashGoals.jsx');
  assert.match(goals, /slip >= \(Number\.isFinite\(slipLine\) \? slipLine : DashSignals\.THRESHOLDS\.GOAL_SLIP_DAYS\)/);
  assert.match(goals, /function DashGoalsSection\(\{ rec, role \}\) \{\n  const slipLine = useDgoSlipLine\(role\);/);
  assert.match(goals, /<DashGoalCard goal=\{g\} compact editable onEdit=\{\(\) => setEditing\(i\)\} slipLine=\{slipLine\} \/>/);
  const today = read('public/newdesign/dashToday.jsx');
  assert.match(today, /DashSignals\.goalBrief\(rec, new Date\(\), thresholds \|\| undefined\)/);
  assert.equal((today.match(/dashContextLine\(rec, units, tuning && tuning\.thresholds\)/g) || []).length, 2, 'both callers pass the tuning');
});

// ── F9: the app's records say the overview answered ─────────────────────────
const day = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
let overviews = {};
globalThis.window = {
  ShapeAuth: { getCachedState: () => ({ user: { id: 'coach-f9' } }) },
  ShapeAssign: { clients: async () => [{ userId: 'u-quiet', name: 'Quiet' }, { userId: 'u-live', name: 'Live' }] },
  ShapeCareTeam: { overviews: async () => overviews },
  DashSignals: E,
};
await loadRealModule(fileURLToPath(new URL('../mobile-app/src/services/shapeSignals.js', import.meta.url)), {
  registry: new Map([['../../../public/newdesign/dashSignals.js', {}]]),
});

test('in the app a client with nothing in two weeks is "no recent data", as on the website, never on plan (F9)', async () => {
  overviews = { 'u-quiet': { stats: {} }, 'u-live': { stats: {}, logs: { lastLoggedOn: day(1), daysLogged7d: 6 } } };
  const rows = await window.ShapeSignals.triageLive('trainer', { force: true });
  const by = Object.fromEntries(rows.map((r) => [r.client.profile.id, r]));
  assert.equal(by['u-quiet'].severity, 'unknown');
  assert.equal(by['u-quiet'].progress.label, 'Insufficient recent data');
  assert.equal(by['u-live'].severity, 'green');
  assert.equal(by['u-live'].client.progressRead.state, 'ready');
  // The roster row says so, in every language the app ships.
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  assert.match(pros, /sev === 'unknown' \? coachTr\('coach:roster\.dirNoRecent'/);
  assert.match(pros, /sev === 'unknown' \? coachTr\('coach:roster\.labelNoRecent'/);
  // …and never under On track (Codex on #2703): Clients gives them a group of their own in Needs you.
  assert.match(pros, /function bsProNoRecent\(sig\) \{ return sig\?\.sev === 'unknown'; \}/);
  assert.match(pros, /const needsRows = pastMode \? \[\] : rows\.filter\(\(r\) => bsProNeedsAttention\(r\.sig\) \|\| bsProNoRecent\(r\.sig\)\);/);
  assert.match(pros, /const onTrackRows = pastMode \? \[\] : rows\.filter\(\(r\) => !bsProNeedsAttention\(r\.sig\) && !bsProNoRecent\(r\.sig\) && r\.sig\.sev !== 'past'\);/);
  assert.match(pros, /\{ sev: 'unknown', label: tr\('coach:roster\.groupNoRecent'/);
  assert.match(pros, /function bsProNeedsAttention\(sig\) \{ return \['red', 'amber', 'new'\]\.includes\(sig\?\.sev\); \}/, 'Today\'s Needs you card is unchanged');
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/coach.json`));
    assert.ok(cat['roster.dirNoRecent'] && cat['roster.labelNoRecent'] && cat['roster.groupNoRecent'], loc);
  }
});
