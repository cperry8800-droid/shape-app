// Proactive notification layer — the guardrails (honest data, dedup, opt-out,
// quiet hours, caps, digest, never-shaming) + the routing. Pure; node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  clientCandidates, coachCandidates, decideNotifications, NOTIFY_TYPES,
  inQuietHours, localHour, DEFAULT_PREFS, channelsForType, habitReminderCandidates,
  dailyCheckinOn,
} from '../src/lib/ai/notifications.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { evaluateClient, buildDirective } = require('../public/newdesign/dashSignals.js');

const TZ = 'UTC';
const DAYTIME = new Date('2026-06-17T10:00:00Z'); // 10:00 — outside default quiet
// A dedup stamp written moments ago. Fixtures used `at: 1` (1970) until stamps were pruned
// by age — an ancient stamp is now dropped before the test reaches its actual subject.
const LIVE = +new Date('2026-06-17T09:00:00Z');
// What a dedup entry REMEMBERS. The entry holds `{ sig, sigs: [{ s, at }], at }`; asserting
// on that literal shape pins an implementation detail, and it has already changed twice.
const sigsOf = (entry) => (entry && Array.isArray(entry.sigs) ? entry.sigs.map((x) => x.s) : entry && entry.sig ? [entry.sig] : []);
const NIGHT = new Date('2026-06-17T23:30:00Z');   // 23:30 — inside default quiet (22–7)

// A coach-flagged sleep directive (engine output); `line` is the verbatim shown text.
const SLEEP_DIRECTIVE = {
  verdict: 'Recovery is the lever',
  reason: 'Your coach flagged sleep — last night logged 5.9h',
  action: { label: "log last night's sleep", kind: 'recovery' },
  read: { summary30d: '', oneThingNow: "log last night's sleep" },
  cited: ['coach override'],
  line: "Recovery is the lever. Your coach flagged sleep — last night logged 5.9h. When you're ready, log last night's sleep.",
};

// ── HONEST DATA ──────────────────────────────────────────────────────────────
test('no signal → no notification (empty record, green directive, no flags)', () => {
  assert.deepEqual(clientCandidates({ directive: null, flags: [] }), []);
  // a green/on-track directive has no action → not a "move", emits nothing
  const green = { verdict: 'On track', reason: 'Everything holding', action: null, read: { oneThingNow: '' }, line: 'On track.' };
  assert.deepEqual(clientCandidates({ directive: green, flags: [] }), []);
});

test('a flag with no reason produces nothing (no fabricated copy)', () => {
  const rows = [{ clientId: 'c1', clientName: 'A', severity: 'red', reason: '', flags: [{ owned: true, reason: '' }] }];
  assert.deepEqual(coachCandidates({ triageRows: rows, lastSeverity: {} }), []);
});

// ── (a) PREVIEW: client, coach-flagged sleep directive → deep-link Home ──────
test('(a) client gets the coach-flagged sleep directive, deep-linking Home', () => {
  const cands = clientCandidates({ directive: SLEEP_DIRECTIVE, flags: [], tone: 'supportive' });
  assert.equal(cands.length, 1);
  const d = cands[0];
  assert.equal(d.type, 'directive');
  assert.equal(d.route, 'home');                 // deep-link to Home "Your move"
  assert.match(d.body, /sleep/);                 // the real reason, verbatim
  assert.equal(d.body, SLEEP_DIRECTIVE.line);    // notification text === in-app text

  const { send } = decideNotifications({ candidates: cands, last: {}, prefs: { tz: TZ }, now: DAYTIME, audience: 'client' });
  assert.equal(send.length, 1);
  assert.equal(send[0].route, 'home');
  assert.deepEqual(send[0].channels, { inapp: true, push: true, email: false });
});

// ── (b) PREVIEW: coach, a client goes red (nutrition → dietitian) → client ───
test('(b) a nutrition-driven red routes to the dietitian, deep-linking the client', () => {
  const rows = [{
    clientId: 'client-9', clientName: 'Priya', severity: 'red',
    reason: 'Protein 80g vs a 140g target',
    flags: [{ key: 'protein_under', discipline: 'nutrition', owned: true, reason: 'Protein 80g vs a 140g target' }],
  }];
  const cands = coachCandidates({ triageRows: rows, lastSeverity: {} });
  assert.equal(cands.length, 1);
  assert.equal(cands[0].type, 'client_red');
  assert.equal(cands[0].route, 'client');
  assert.equal(cands[0].data.clientId, 'client-9');
  assert.equal(cands[0].data.discipline, 'nutrition');
  assert.match(cands[0].title, /Priya needs you/);
  assert.match(cands[0].body, /80g/);

  const { send } = decideNotifications({ candidates: cands, last: {}, prefs: { tz: TZ }, now: DAYTIME, audience: 'coach' });
  assert.equal(send.length, 1);
  assert.equal(send[0].route, 'client');
});

test('a flag routed to the OTHER pro is not notified to this one', () => {
  const rows = [{ clientId: 'c9', clientName: 'Priya', severity: 'red', reason: 'x', flags: [{ key: 'protein_under', discipline: 'nutrition', owned: false, reason: 'x' }] }];
  assert.deepEqual(coachCandidates({ triageRows: rows, lastSeverity: {} }), []); // owned:false → not mine
});

// ── NOT NAGGING: dedup ───────────────────────────────────────────────────────
test('dedup — the same event does not fire twice', () => {
  const cands = clientCandidates({ directive: SLEEP_DIRECTIVE, flags: [], tone: 'supportive' });
  const first = decideNotifications({ candidates: cands, last: {}, prefs: { tz: TZ }, now: DAYTIME, audience: 'client' });
  assert.equal(first.send.length, 1);
  const second = decideNotifications({ candidates: cands, last: first.nextState, prefs: { tz: TZ }, now: DAYTIME, audience: 'client' });
  assert.equal(second.send.length, 0);
  assert.ok(second.suppressed.some(s => s.reason === 'duplicate'));
});

test('coach: an unchanged severity does not re-nag', () => {
  const rows = [{ clientId: 'c9', clientName: 'Priya', severity: 'red', reason: 'r', flags: [{ owned: true, reason: 'r', discipline: 'nutrition' }] }];
  assert.deepEqual(coachCandidates({ triageRows: rows, lastSeverity: { c9: 'red' } }), []); // already red
});

// ── CONTROL: per-type × per-channel matrix ───────────────────────────────────
test('all channels off for a type → that type is fully opted out', () => {
  const cands = clientCandidates({ directive: SLEEP_DIRECTIVE, flags: [], tone: 'supportive' });
  const { send, suppressed } = decideNotifications({ candidates: cands, last: {}, prefs: { tz: TZ, matrix: { directive: { inapp: false, push: false, email: false } } }, now: DAYTIME, audience: 'client' });
  assert.equal(send.length, 0);
  assert.ok(suppressed.some(s => s.type === 'directive' && s.reason === 'opted_out'));
});

test('push off but in-app on → still sends, channels reflect the choice', () => {
  const cands = clientCandidates({ directive: SLEEP_DIRECTIVE, flags: [], tone: 'supportive' });
  const { send } = decideNotifications({ candidates: cands, last: {}, prefs: { tz: TZ, matrix: { directive: { inapp: true, push: false, email: false } } }, now: DAYTIME, audience: 'client' });
  assert.equal(send.length, 1);
  assert.deepEqual(send[0].channels, { inapp: true, push: false, email: false });
});

test('email is opt-in: off by default, on when chosen', () => {
  assert.deepEqual(channelsForType({}, 'directive'), { inapp: true, push: true, email: false });
  assert.deepEqual(channelsForType({ matrix: { directive: { email: true } } }, 'directive'), { inapp: true, push: true, email: true });
});

test('master mute → nothing sends', () => {
  const cands = clientCandidates({ directive: SLEEP_DIRECTIVE, flags: [], tone: 'supportive' });
  const { send, suppressed } = decideNotifications({ candidates: cands, last: {}, prefs: { muted: true, tz: TZ }, now: DAYTIME, audience: 'client' });
  assert.equal(send.length, 0);
  assert.ok(suppressed.every(s => s.reason === 'muted'));
});

// ── NOT NAGGING: quiet hours (tz-aware) → digest ─────────────────────────────
test('quiet hours hold everything, then a digest lands when they wake', () => {
  assert.equal(inQuietHours(NIGHT, { ...DEFAULT_PREFS, tz: TZ }), true);
  assert.equal(inQuietHours(DAYTIME, { ...DEFAULT_PREFS, tz: TZ }), false);

  const cands = clientCandidates({ directive: SLEEP_DIRECTIVE, flags: [{ key: 'score_drop', reason: 'Down 12 this week' }], tone: 'supportive' });
  // at night: nothing sends, items are held
  const night = decideNotifications({ candidates: cands, last: {}, prefs: { tz: TZ }, now: NIGHT, audience: 'client' });
  assert.equal(night.send.length, 0);
  assert.equal(night.digest, null);
  assert.ok(night.nextState.pendingDigest.length >= 2);
  assert.ok(night.suppressed.every(s => s.reason === 'quiet_hours'));

  // next morning: the held items collapse into ONE digest
  const morning = decideNotifications({ candidates: [], last: night.nextState, prefs: { tz: TZ }, now: DAYTIME, audience: 'client' });
  assert.ok(morning.digest);
  assert.match(morning.digest.title, /updates? for you/);
  assert.equal(morning.nextState.pendingDigest.length, 0);
});

test('timezone shifts the quiet window (LA vs UTC at the same instant)', () => {
  // 2026-06-17T06:00Z = 23:00 the night before in LA → quiet in LA, not in UTC.
  const instant = new Date('2026-06-17T06:00:00Z');
  assert.equal(localHour(instant, 'UTC'), 6);
  assert.equal(localHour(instant, 'America/Los_Angeles'), 23);
  assert.equal(inQuietHours(instant, { ...DEFAULT_PREFS, tz: 'America/Los_Angeles' }), true);
  assert.equal(inQuietHours(instant, { ...DEFAULT_PREFS, tz: 'UTC' }), true); // 6 < 7 → also quiet
});

// ── NOT NAGGING: daily cap → digest ──────────────────────────────────────────
test('over the per-day cap, the extra rolls into the digest', () => {
  const cands = clientCandidates({ directive: SLEEP_DIRECTIVE, flags: [{ key: 'score_drop', reason: 'Down 12' }], goals: [{ label: 'Goal weight' }], tone: 'supportive' });
  // cap of 1: first high-priority sends, the rest is held
  const { send, nextState, suppressed } = decideNotifications({ candidates: cands, last: {}, prefs: { tz: TZ, maxPerDay: 1 }, now: DAYTIME, audience: 'client' });
  assert.equal(send.length, 1);
  assert.ok(nextState.pendingDigest.length >= 1);
  assert.ok(suppressed.some(s => s.reason === 'capped'));
});

// ── never-shaming copy ───────────────────────────────────────────────────────
test('streak copy is a restart, never shame', () => {
  const cands = clientCandidates({ directive: null, flags: [{ key: 'streak_broken', habit: 'water', reason: 'streak ended' }], tone: 'supportive' });
  assert.equal(cands.length, 1);
  assert.match(cands[0].title, /restart/i);
  assert.doesNotMatch((cands[0].title + ' ' + cands[0].body).toLowerCase(), /you (failed|broke|only|never)/);
});

// ── the cron's promise: re-evaluating a stored snapshot surfaces NEW time-based
// events (the engine recomputes against `now`), fires once, then dedups ────────
test('cron: a snapshot whose check-in has since gone overdue fires once, then dedups', () => {
  const now = new Date('2026-06-17T10:00:00Z');
  const monday = (d) => { const x = new Date(d); const day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day); return x.toISOString().slice(0, 10); };
  // a real check-in logged 3 weeks ago → overdue *now* (a time-based event)
  const record = { profile: { id: 'u1', name: 'You' }, checkIn: { lastWeekOf: monday(new Date(now.getTime() - 21 * 86400000)) } };
  const { flags } = evaluateClient(record, now, 'client');
  assert.ok(flags.some(f => f.key === 'checkin_overdue'), 'engine flags the overdue check-in against now');

  const directive = buildDirective(record, now, 'client');
  const cands = clientCandidates({ directive: { ...directive, line: 'x' }, flags, tone: 'supportive' });
  assert.ok(cands.some(c => c.type === 'checkin_due'));

  const r1 = decideNotifications({ candidates: cands, last: {}, prefs: { tz: 'UTC' }, now, audience: 'client' });
  assert.ok(r1.send.some(s => s.type === 'checkin_due'));            // fires once
  const r2 = decideNotifications({ candidates: cands, last: r1.nextState, prefs: { tz: 'UTC' }, now, audience: 'client' });
  assert.ok(!r2.send.some(s => s.type === 'checkin_due'));           // cron re-run → no re-nag
});

// ── PART B: habit reminders (user-scheduled, opt-in, suppress-when-done) ──────
const VITAMINS = { habitId: 'h1', label: 'Take vitamins', at: '09:00', days: [1, 2, 3, 4, 5], tz: 'UTC', enabled: true };

test('(b) a 9am weekday reminder is due on a weekday morning → Habits, gentle, no guilt', () => {
  // DAYTIME = Wed 10:00 UTC → past 09:00, a weekday
  const cands = habitReminderCandidates({ reminders: [VITAMINS], doneToday: [], now: DAYTIME, tone: 'supportive' });
  assert.equal(cands.length, 1);
  assert.equal(cands[0].type, 'habit_reminder');
  assert.match(cands[0].title, /^Time for: Take vitamins$/);            // the cue, not a scold
  assert.doesNotMatch(`${cands[0].title} ${cands[0].body}`, /still|haven'?t|forgot|again/i);
  assert.equal(cands[0].route, 'habits');
  assert.equal(cands[0].data.habitId, 'h1');
  const { send } = decideNotifications({ candidates: cands, last: {}, prefs: { tz: 'UTC' }, now: DAYTIME, audience: 'client' });
  assert.equal(send.length, 1);                                          // fires at its time
});

test('(c) a reminder is SUPPRESSED once the habit is checked off today', () => {
  const cands = habitReminderCandidates({ reminders: [VITAMINS], doneToday: ['h1'], now: DAYTIME, tone: 'supportive' });
  assert.deepEqual(cands, []);                                           // done → no nudge
});

test('never early: before the set time, nothing is due', () => {
  const early = new Date('2026-06-17T08:00:00Z'); // 08:00 < 09:00
  assert.deepEqual(habitReminderCandidates({ reminders: [VITAMINS], doneToday: [], now: early }), []);
});

test('off a scheduled day, nothing is due', () => {
  const weekendOnly = { ...VITAMINS, days: [0, 6] };
  assert.deepEqual(habitReminderCandidates({ reminders: [weekendOnly], doneToday: [], now: DAYTIME }), []); // Wed not in {Sun,Sat}
});

test('snoozed and disabled reminders do not fire', () => {
  const snoozed = { ...VITAMINS, snoozeUntil: new Date(DAYTIME.getTime() + 3600000).toISOString() };
  assert.deepEqual(habitReminderCandidates({ reminders: [snoozed], doneToday: [], now: DAYTIME }), []);
  assert.deepEqual(habitReminderCandidates({ reminders: [{ ...VITAMINS, enabled: false }], doneToday: [], now: DAYTIME }), []);
});

test('reminders dedup per day (an hourly cron fires each once)', () => {
  const cands = habitReminderCandidates({ reminders: [VITAMINS], doneToday: [], now: DAYTIME });
  const r1 = decideNotifications({ candidates: cands, last: {}, prefs: { tz: 'UTC' }, now: DAYTIME, audience: 'client' });
  assert.equal(r1.send.length, 1);
  const r2 = decideNotifications({ candidates: cands, last: r1.nextState, prefs: { tz: 'UTC' }, now: DAYTIME, audience: 'client' });
  assert.equal(r2.send.length, 0); // same day → deduped
});

test('many habits due at once BATCH (cap), they do not spam', () => {
  const reminders = Array.from({ length: 6 }, (_, i) => ({ ...VITAMINS, habitId: `h${i}`, label: `Habit ${i}` }));
  const cands = habitReminderCandidates({ reminders, doneToday: [], now: DAYTIME });
  assert.equal(cands.length, 6);
  const { send, nextState } = decideNotifications({ candidates: cands, last: {}, prefs: { tz: 'UTC', maxPerDay: 4 }, now: DAYTIME, audience: 'client' });
  assert.equal(send.length, 4);              // capped
  assert.equal(nextState.pendingDigest.length, 2); // the rest batch into the digest
});

test('a habit reminder respects the per-channel gate (turn its push off)', () => {
  const cands = habitReminderCandidates({ reminders: [VITAMINS], doneToday: [], now: DAYTIME });
  const { send } = decideNotifications({ candidates: cands, last: {}, prefs: { tz: 'UTC', matrix: { habit_reminder: { inapp: true, push: false, email: false } } }, now: DAYTIME, audience: 'client' });
  assert.equal(send.length, 1);
  assert.equal(send[0].channels.push, false);
});

test('every notify type is informational (carries a deep-link route)', () => {
  for (const [type, meta] of Object.entries(NOTIFY_TYPES)) {
    assert.ok(typeof meta.route === 'string' && meta.route, `${type} has a route`);
    assert.ok(['client', 'coach'].includes(meta.audience));
  }
});

// ── SPEC §3D OPT-OUT, HONOURED SERVER-SIDE ───────────────────────────────────────────────
// ⚠ THE OPT-OUT REACHED THE HOME SCREEN AND NOTHING ELSE. Turning "Daily check-in" off
// stops the Home bulletin nagging, but the stored `notify_snapshot` keeps its check-in
// state and BOTH notify paths recompute from it — so a member who opts out and never
// reopens the app keeps receiving check-in nudges from the cron. The pref has to be read
// where the candidate is BUILT, not only where it is displayed.
//
// ⚠ AND THE CANDIDATE HAS TWO DOORS: an explicit `checkinDueThisWeek` signal AND the
// engine's own `checkin_overdue` flag. Gating the call site would have left the flag
// firing, so the suppression lives here, at the one place both doors pass through.
test('dailyCheckinOn — ON is the DEFAULT, and only an explicit off is off', () => {
  // Mirrors mobile `bsDailyCheckinOn`: absence is ON, so an account that predates the
  // pref — or a failed settings read — can never be silently opted out of its check-in.
  assert.equal(dailyCheckinOn(undefined), true);
  assert.equal(dailyCheckinOn(null), true);
  assert.equal(dailyCheckinOn('On'), true);
  assert.equal(dailyCheckinOn(true), true);
  // The two shapes the settings row actually stores for off.
  assert.equal(dailyCheckinOn('Off'), false);
  assert.equal(dailyCheckinOn(false), false);
});

test('opting out suppresses the check-in nudge from BOTH doors', () => {
  const viaSignal = { checkinDueThisWeek: true, flags: [], directive: null, tone: 'supportive' };
  const viaFlag = { checkinDueThisWeek: false, flags: [{ key: 'checkin_overdue', reason: 'overdue' }], directive: null, tone: 'supportive' };

  // Pref ON (and the default, absent) — today's behaviour, byte-identical.
  assert.equal(clientCandidates(viaSignal).filter((c) => c.type === 'checkin_due').length, 1);
  assert.equal(clientCandidates(viaFlag).filter((c) => c.type === 'checkin_due').length, 1);

  // Pref OFF — neither door fires.
  assert.deepEqual(clientCandidates({ ...viaSignal, checkinOptedOut: true }).filter((c) => c.type === 'checkin_due'), []);
  assert.deepEqual(clientCandidates({ ...viaFlag, checkinOptedOut: true }).filter((c) => c.type === 'checkin_due'), []);
});

test('opting out of the check-in silences ONLY the check-in', () => {
  // ⚠ Over-correction would be its own defect: the member turned off a daily check-in
  // nag, not every notification. A coach message and the one move must still arrive.
  const input = {
    directive: SLEEP_DIRECTIVE,
    flags: [{ key: 'checkin_overdue', reason: 'overdue' }, { key: 'streak_broken', habit: 'Water', reason: 'missed 2 days' }],
    checkinDueThisWeek: true,
    coachEvents: [{ kind: 'message', id: 'm1', coach: 'Sam', preview: 'nice work', conversationId: 'c1' }],
    tone: 'supportive',
    checkinOptedOut: true,
  };
  const types = clientCandidates(input).map((c) => c.type).sort();
  assert.ok(!types.includes('checkin_due'), `check-in survived the opt-out: ${types.join(',')}`);
  assert.ok(types.includes('directive'), `the one move was lost: ${types.join(',')}`);
  assert.ok(types.includes('streak_broken'), `an unrelated flag was lost: ${types.join(',')}`);
  assert.ok(types.includes('coach_message'), `a coach message was lost: ${types.join(',')}`);
});

// ⚠ MY "TWO DOORS" WAS ITSELF AN UNDERCOUNT. Codex found a THIRD and a FOURTH, and the
// third is the HIGHEST-PRIORITY one: `checkin_overdue` carries directive priority 100 in
// dashSignals (escalating with missedWeeks), so buildDirective selects it as the ONE move
// and emits a high-priority "Send your weekly check-in" through the `directive` candidate —
// which the checkin_due gate never touched. Gating the obvious door left the loudest open.
const CHECKIN_DIRECTIVE = {
  verdict: 'Check-in due',
  reason: 'Check-in 2w late',
  action: { label: 'Send your weekly check-in', kind: 'check_in' },
  read: { summary30d: '', oneThingNow: 'Send your weekly check-in' },
  cited: ['checkin_overdue'],
  line: 'Check-in due. Send your weekly check-in.',
};

test('opting out suppresses the check-in DIRECTIVE, not only the checkin_due nudge', () => {
  const base = { flags: [], checkinDueThisWeek: false, tone: 'supportive' };
  // Pref ON — the directive is the one move, exactly as today.
  assert.equal(clientCandidates({ ...base, directive: CHECKIN_DIRECTIVE }).length, 1);
  // Pref OFF — the loudest door closes too.
  assert.deepEqual(clientCandidates({ ...base, directive: CHECKIN_DIRECTIVE, checkinOptedOut: true }), []);
  // ⚠ ...and an UNRELATED directive still arrives. Suppressing every directive because
  // one KIND of it is a check-in would silence the whole "one move" feature.
  const other = clientCandidates({ ...base, directive: SLEEP_DIRECTIVE, checkinOptedOut: true });
  assert.equal(other.length, 1, 'an unrelated directive was lost to the check-in opt-out');
  assert.equal(other[0].type, 'directive');
});

test('a directive carries its lever and move kind, so a HELD copy stays identifiable', () => {
  // The held-item purge below cannot key on copy — wording is translated and edited. The
  // LEVER is the stable identity (the kind is only its engine-built alias, and a coach
  // override can pair any kind with any lever), so both are stamped when the candidate is
  // built and the kind is trusted only for items stamped before the lever existed.
  const [d] = clientCandidates({ directive: CHECKIN_DIRECTIVE, flags: [], tone: 'supportive' });
  assert.equal(d.data.move, 'check_in');
  const [s] = clientCandidates({ directive: SLEEP_DIRECTIVE, flags: [], tone: 'supportive' });
  assert.equal(s.data.move, 'recovery');
});

// ⚠ THE FOURTH DOOR IS A STORED ONE. An item held by quiet hours or the daily cap lives in
// last.pendingDigest, and decideNotifications re-emits held items at the next non-quiet run
// WITHOUT rechecking any preference. Suppressing at the candidate stops it being rebuilt and
// does nothing about the copy already queued, so the next cron could still deliver "your
// weekly check-in is ready" AFTER the member opted out.
test('opting out purges check-in items already HELD in the digest', () => {
  const held = [
    { type: 'checkin_due', title: 'Check-in ready', body: 'b', route: 'checkin', data: {}, priority: 'med', channels: { push: true } },
    { type: 'directive', title: 'Your move today', body: 'Send your weekly check-in', route: 'home', data: { move: 'check_in' }, priority: 'high', channels: { push: true } },
    { type: 'coach_message', title: 'Sam sent a message', body: 'nice work', route: 'chat', data: {}, priority: 'high', channels: { push: true } },
  ];
  const last = { date: 'never', pendingDigest: held };
  const prefs = { ...DEFAULT_PREFS, tz: TZ };

  const out = decideNotifications({ candidates: [], last, prefs, now: DAYTIME, audience: 'client', checkinOptedOut: true });
  assert.ok(out.digest, 'the unrelated held item should still produce a digest');
  // ⚠ ASSERT ON data.items, NOT ON THE COPY. The digest body joins item TITLES, so a held
  // directive's "Send your weekly check-in" lives only in its BODY and never appears in
  // the digest text — an assertion on that string passes whether or not the purge works.
  // Mutation-testing caught exactly that: deleting the directive branch of isCheckinItem
  // left this test green.
  const kinds = out.digest.data.items.map((i) => `${i.type}:${(i.data && i.data.move) || ''}`);
  assert.deepEqual(kinds, ['coach_message:'],
    `the purge kept or dropped the wrong held items: ${JSON.stringify(kinds)}`);
  assert.equal(out.digest.title, '1 update for you', 'the digest count must reflect the purge');

  // Pref ON — every held item still comes through, byte-identical to today.
  const on = decideNotifications({ candidates: [], last, prefs, now: DAYTIME, audience: 'client' });
  const onKinds = on.digest.data.items.map((i) => `${i.type}:${(i.data && i.data.move) || ''}`);
  assert.deepEqual(onKinds, ['checkin_due:', 'directive:check_in', 'coach_message:'],
    `the opt-out leaked into the default path: ${JSON.stringify(onKinds)}`);
});

// ⚠ THE STAMP ONLY HELPS ITEMS BUILT AFTER IT SHIPPED. A `checkin_overdue` directive already
// sitting in someone's notify_state.pendingDigest at rollout was finalized with `data: {}`,
// so it carries no move kind and the purge cannot recognise it — the very first evaluation
// after deploy would still send "your move today" to a member who had opted out.
// An unidentifiable directive is therefore purged WHILE OPTED OUT: we cannot prove it is not
// the check-in, and losing one held directive once is the under-deliver direction this file
// already chooses. New items always carry the stamp, so this is self-limiting.
test('a LEGACY held directive with no move stamp is purged when opted out', () => {
  const legacy = { type: 'directive', title: 'Your move today', body: 'Send your weekly check-in', route: 'home', data: {}, priority: 'high', channels: { push: true } };
  const known = { type: 'directive', title: 'Your move today', body: "Log last night's sleep", route: 'home', data: { move: 'recovery' }, priority: 'high', channels: { push: true } };
  const msg = { type: 'coach_message', title: 'Sam sent a message', body: 'x', route: 'chat', data: {}, priority: 'high', channels: { push: true } };
  const last = { date: 'never', pendingDigest: [legacy, known, msg] };
  const prefs = { ...DEFAULT_PREFS, tz: TZ };

  const out = decideNotifications({ candidates: [], last, prefs, now: DAYTIME, audience: 'client', checkinOptedOut: true });
  const kinds = out.digest.data.items.map((i) => `${i.type}:${(i.data && i.data.move) || '-'}`);
  // ⚠ The IDENTIFIED non-check-in directive must survive — purging every directive would
  // silence the one move for anyone who ever turned the check-in off.
  assert.deepEqual(kinds, ['directive:recovery', 'coach_message:-'],
    `wrong items purged: ${JSON.stringify(kinds)}`);

  // Pref ON — nothing is purged, including the legacy item.
  const on = decideNotifications({ candidates: [], last, prefs, now: DAYTIME, audience: 'client' });
  assert.equal(on.digest.data.items.length, 3, 'the opt-out leaked into the default path');
});

// ⚠ A BUG MY OWN FILTER INTRODUCED. `hadPending` gates "emit the digest now" and it read the
// UNFILTERED last.pendingDigest. So if the only held items were check-in ones — all purged —
// and this same call defers a new low-priority or over-cap candidate, the digest fired
// IMMEDIATELY with that new item: the documented next-evaluation deferral defeated, and for
// an over-cap item the daily cap bypassed. It must read the queue AFTER the purge.
test('purging every held item does not make THIS call emit the digest', () => {
  const heldCheckin = { type: 'checkin_due', title: 'Check-in ready', body: 'b', route: 'checkin', data: {}, priority: 'med', channels: { push: true } };
  const last = { date: 'never', pendingDigest: [heldCheckin] };
  const prefs = { ...DEFAULT_PREFS, tz: TZ };
  // a genuinely LOW-priority candidate, which this layer always defers to the digest
  const fresh = clientCandidates({ directive: null, flags: [{ key: 'streak_broken', habit: 'Water', reason: 'missed 2 days' }], tone: 'supportive' });
  assert.equal(fresh.length, 1, 'fixture must produce exactly one low-priority candidate');

  const out = decideNotifications({ candidates: fresh, last, prefs, now: DAYTIME, audience: 'client', checkinOptedOut: true });
  assert.equal(out.digest, null, 'the freshly deferred item must wait for the NEXT evaluation');
  assert.deepEqual(out.send, [], 'a low-priority item is never sent immediately');
  // ...and it is genuinely held, not dropped.
  assert.equal(out.nextState.pendingDigest.length, 1, 'the new item should be queued for later');
  assert.equal(out.nextState.pendingDigest[0].type, 'streak_broken');
});

// ⚠ A DEDUP STAMP MEANS "HANDLED", AND A PURGED ITEM WAS NEVER HANDLED. Deferring a
// check-in records its signature in state.types so the same nudge is not rebuilt twice.
// The purge above removes the queued copy; the stamp outlived it. And `checkin_due` signs
// itself with the CONSTANT 'due' — there is no later signature to break the tie — so a
// member who opts out while one is queued and then opts back in is deduped forever against
// a notification that never went out. The stamp has to be released with the item.
test('purging an undelivered check-in releases its dedup stamp', () => {
  const held = { type: 'checkin_due', title: 'Check-in ready', body: 'b', route: 'checkin', data: {}, priority: 'med', channels: { inapp: true, push: true } };
  const last = { date: 'never', pendingDigest: [held], types: { 'checkin_due:self': { sig: 'due', at: LIVE } } };
  const prefs = { ...DEFAULT_PREFS, tz: TZ };

  const purged = decideNotifications({ candidates: [], last, prefs, now: DAYTIME, audience: 'client', checkinOptedOut: true });
  assert.equal(purged.nextState.types['checkin_due:self'], undefined, 'the stamp outlived the item it stood for');

  // ...and that is only worth anything if the nudge ACTUALLY ARRIVES once the member
  // turns the pref back on with the check-in still due.
  const rebuilt = clientCandidates({ directive: null, flags: [], checkinDueThisWeek: true, tone: 'supportive' });
  assert.deepEqual(rebuilt.map((c) => c.type), ['checkin_due'], 'fixture must rebuild exactly the check-in candidate');
  const back = decideNotifications({ candidates: rebuilt, last: purged.nextState, prefs, now: DAYTIME, audience: 'client' });
  assert.deepEqual(back.send.map((i) => i.type), ['checkin_due'],
    'the rebuilt check-in was deduped against a nudge that was never delivered');

  // The pref-ON path is untouched: a stamp whose item is still queued survives.
  const on = decideNotifications({ candidates: [], last, prefs, now: DAYTIME, audience: 'client' });
  assert.deepEqual(sigsOf(on.nextState.types['checkin_due:self']), ['due'], 'the stamp was cleared for a member who never opted out');
});

// ⚠ THE LEGACY PATH — items queued before the signature stamp shipped carry none, so they
// cannot be matched to their own dedup entry and fall back to a coarser rule: release only
// when nothing of that type is still held. Right in the ordinary single-item case; in the
// rare two-directive one it is no worse than the bug it replaces, and releasing nothing
// would cost those members the nudge permanently. A
// queued item carries no key, and both shapes the purge can match are built with the
// single key 'self' — so a held directive that is NOT the check-in shares the purged
// one's dedup entry. Releasing it would let that same directive be rebuilt and queued a
// second time while the first is still waiting in the digest.
test('LEGACY, unsignatured: a stamp is released only when nothing of that type survives', () => {
  const checkin = { type: 'directive', title: 'Your move today', body: 'Send your weekly check-in', route: 'home', data: { move: 'check_in' }, priority: 'high', channels: { push: true } };
  const sleep = { type: 'directive', title: 'Your move today', body: "Log last night's sleep", route: 'home', data: { move: 'recovery' }, priority: 'high', channels: { push: true } };
  const prefs = { ...DEFAULT_PREFS, tz: TZ };
  const stamps = () => ({ 'directive:self': { sig: 'amber|Send it|', at: LIVE }, 'coach_message:m1': { sig: 'm1', at: LIVE } });

  const survives = decideNotifications({ candidates: [], last: { date: 'never', pendingDigest: [checkin, sleep], types: stamps() }, prefs, now: DAYTIME, audience: 'client', checkinOptedOut: true });
  assert.equal(survives.nextState.pendingDigest.length, 0, 'both held directives should have gone to the digest');
  assert.deepEqual(survives.digest.data.items.map((i) => i.data.move), ['recovery'], 'the wrong directive was purged');
  assert.deepEqual(sigsOf(survives.nextState.types['directive:self']), ['amber|Send it|'],
    'released a stamp the surviving directive is still standing behind');

  // ...and with nothing of that type left, the stamp IS released — and only that one.
  const alone = decideNotifications({ candidates: [], last: { date: 'never', pendingDigest: [checkin], types: stamps() }, prefs, now: DAYTIME, audience: 'client', checkinOptedOut: true });
  assert.equal(alone.nextState.types['directive:self'], undefined, 'the purged directive left its stamp behind');
  assert.deepEqual(sigsOf(alone.nextState.types['coach_message:m1']), ['m1'], 'the purge cleared an unrelated dedup entry');
});

// ⚠ THE FIFTH DOOR IS THE COACH OVERRIDE, AND THE ACTION KIND CANNOT SEE IT. sanitizeOverride
// validates `lever` against a fixed set that includes 'checkin' but takes ANY 40-char string as
// the action kind, defaulting an omitted one to 'message'; buildDirective keeps that action
// beside the checkin lever. So a coach who overrides the check-in with their own wording emits
// a directive the kind-only gate reads as unrelated. The kind can never separate them either:
// the ENGINE itself emits kind 'message' for the CONTACT lever, so "send me your check-in" and
// "reach out today" are kind-identical and differ only by lever. The lever is the identity.
test('a coach check-in override is suppressed, and a kind-identical contact move is not', () => {
  // built by the REAL engine, not by a fixture that assumes the shape
  const checkin = buildDirective({ coachDirective: { lever: 'checkin', action: { label: 'Send me your check-in', kind: 'message' } } }, DAYTIME, 'client');
  const contact = buildDirective({ coachDirective: { lever: 'contact' } }, DAYTIME, 'client');
  assert.equal(checkin.action.kind, contact.action.kind, 'premise: the two moves must be kind-identical for this test to mean anything');
  assert.equal(checkin.lever, 'checkin');
  assert.equal(contact.lever, 'contact');

  const out = clientCandidates({ directive: { ...checkin, line: 'x' }, flags: [], checkinOptedOut: true, tone: 'supportive' });
  assert.deepEqual(out, [], 'a coach check-in override nudged a member who opted out');

  const kept = clientCandidates({ directive: { ...contact, line: 'x' }, flags: [], checkinOptedOut: true, tone: 'supportive' });
  assert.deepEqual(kept.map((c) => c.type), ['directive'], 'the opt-out swallowed an unrelated coach move of the same kind');

  // pref ON — the check-in override is untouched
  const on = clientCandidates({ directive: { ...checkin, line: 'x' }, flags: [], tone: 'supportive' });
  assert.deepEqual(on.map((c) => c.type), ['directive'], 'the opt-out leaked into the default path');
});

// A HELD copy has to carry the lever for the same reason: the purge cannot re-derive it.
test('a held coach check-in override is purged, and a contact move of the same kind is not', () => {
  const checkin = buildDirective({ coachDirective: { lever: 'checkin', action: { label: 'Send me your check-in', kind: 'message' } } }, DAYTIME, 'client');
  const [c] = clientCandidates({ directive: { ...checkin, line: 'x' }, flags: [], tone: 'supportive' });
  assert.equal(c.data.lever, 'checkin', 'the queued copy cannot be identified without the lever');

  const held = { type: 'directive', title: 'Your move today', body: 'Send me your check-in', route: 'home', data: { move: 'message', lever: 'checkin' }, priority: 'high', channels: { push: true } };
  const reach = { type: 'directive', title: 'Your move today', body: 'Reach out today', route: 'home', data: { move: 'message', lever: 'contact' }, priority: 'high', channels: { push: true } };
  const last = { date: 'never', pendingDigest: [held, reach] };
  const prefs = { ...DEFAULT_PREFS, tz: TZ };

  const out = decideNotifications({ candidates: [], last, prefs, now: DAYTIME, audience: 'client', checkinOptedOut: true });
  assert.deepEqual(out.digest.data.items.map((i) => i.data.lever), ['contact'], 'the purge kept or dropped the wrong held override');
});

// ⚠ THE ORPHANED-STAMP CLASS, PINNED AS IMPOSSIBLE RATHER THAN AS HANDLED. This case cost
// two review rounds on #1915: the stamp is a SINGLE SLOT per (type,key) and the last writer
// owns it, so with two directives held at once — a changed signature is not a duplicate —
// the stored signature belonged to whichever was queued SECOND. First the purge left it
// behind, then the release kept it because a same-type item survived. Now a queued item is
// not stamped at all, so a purge has nothing to orphan and nothing to misattribute.
// Fixtures are QUEUED BY THE REAL PATH, never hand-built.
test('purging one of two held directives cannot strand the other, or itself', () => {
  const prefs = { ...DEFAULT_PREFS, tz: TZ };
  const queue = (directive, last) => decideNotifications({
    candidates: clientCandidates({ directive, flags: [], tone: 'supportive' }),
    last, prefs, now: NIGHT, audience: 'client',
  }).nextState;

  for (const [first, second] of [[SLEEP_DIRECTIVE, CHECKIN_DIRECTIVE], [CHECKIN_DIRECTIVE, SLEEP_DIRECTIVE]]) {
    const both = queue({ ...second }, queue({ ...first }, { date: 'never' }));
    assert.equal(both.pendingDigest.length, 2, 'both directives must be held for this test to mean anything');
    assert.equal(both.types['directive:self'], undefined, 'a held item must leave no stamp to fight over');

    // opt out, outside quiet hours: the check-in goes, the sleep move is delivered.
    const out = decideNotifications({ candidates: [], last: both, prefs, now: DAYTIME, audience: 'client', checkinOptedOut: true });
    assert.deepEqual(out.digest.data.items.map((i) => i.data.move), ['recovery'], 'the wrong held directive was purged');

    // the SURVIVOR was delivered, so it is stamped and does not come round again...
    const sleepAgain = decideNotifications({
      candidates: clientCandidates({ directive: SLEEP_DIRECTIVE, flags: [], tone: 'supportive' }),
      last: out.nextState, prefs, now: DAYTIME, audience: 'client',
    });
    assert.deepEqual(sleepAgain.send, [], 'a delivered move was sent twice');

    // ...and the PURGED one was never delivered, so opting back in must bring it.
    const back = decideNotifications({
      candidates: clientCandidates({ directive: CHECKIN_DIRECTIVE, flags: [], tone: 'supportive' }),
      last: out.nextState, prefs, now: DAYTIME, audience: 'client',
    });
    assert.deepEqual(back.send.map((i) => i.type), ['directive'],
      'the rebuilt check-in was deduped against a nudge that was never delivered');
  }
});

// ⚠ THE MIRROR OF THE COACH-OVERRIDE DOOR, IN THE OVER-SUPPRESSING DIRECTION. Having made
// the lever the identity, the kind was left in as a belt-and-braces `||` — which lets the
// DERIVED alias override the authoritative field. sanitizeOverride takes any 40-char kind,
// so a coach can set lever 'contact' with kind 'check_in', and that member lost their
// coach's actual move to a check-in opt-out. When a lever is present it decides ALONE; the
// kind speaks only for directives stamped before the lever was.
test('a NON-check-in lever survives even when its action kind says check_in', () => {
  const contact = buildDirective({ coachDirective: { lever: 'contact', action: { label: 'Call me back today', kind: 'check_in' } } }, DAYTIME, 'client');
  assert.equal(contact.lever, 'contact');
  assert.equal(contact.action.kind, 'check_in', 'premise: the kind must contradict the lever for this test to mean anything');

  const out = clientCandidates({ directive: { ...contact, line: 'x' }, flags: [], checkinOptedOut: true, tone: 'supportive' });
  assert.deepEqual(out.map((c) => c.type), ['directive'], "the opt-out swallowed the coach's contact move");

  // ...and the same rule on the HELD copy.
  const held = { type: 'directive', title: 'Your move today', body: 'Call me back today', route: 'home', data: { move: 'check_in', lever: 'contact' }, priority: 'high', channels: { push: true } };
  const prefs = { ...DEFAULT_PREFS, tz: TZ };
  const purge = decideNotifications({ candidates: [], last: { date: 'never', pendingDigest: [held] }, prefs, now: DAYTIME, audience: 'client', checkinOptedOut: true });
  // ⚠ assert on the DIGEST, not on the queue: outside quiet hours a surviving held item is
  // emitted and the queue is cleared, so pendingDigest reads 0 whether or not it survived.
  assert.deepEqual((purge.digest ? purge.digest.data.items : []).map((i) => i.data.lever), ['contact'],
    "the held contact move was purged as a check-in");

  // LEGACY, no lever: the kind is all there is, so it still decides.
  const legacy = { type: 'directive', title: 'Your move today', body: 'Send your weekly check-in', route: 'home', data: { move: 'check_in' }, priority: 'high', channels: { push: true } };
  const legacyOut = decideNotifications({ candidates: [], last: { date: 'never', pendingDigest: [legacy] }, prefs, now: DAYTIME, audience: 'client', checkinOptedOut: true });
  assert.equal(legacyOut.digest, null, 'a legacy check-in directive must still be purged — nothing should have survived to emit');
});

// ⚠ THE QUEUE IS THE RECORD FOR A QUEUED ITEM. notify_state.types holds ONE slot per
// (type,key) while pendingDigest can hold several items mapping to it, so a stamp written
// at QUEUE time can be orphaned or misattributed by anything that later removes an item —
// the shape behind two of the review rounds on #1915. A queued item is now recorded by the
// QUEUE, and the stamp is written only when the digest actually delivers it.
test('a deferred item is recorded by the QUEUE, not by a dedup stamp', () => {
  const prefs = { ...DEFAULT_PREFS, tz: TZ };
  const cands = clientCandidates({ directive: SLEEP_DIRECTIVE, flags: [], tone: 'supportive' });
  const held = decideNotifications({ candidates: cands, last: { date: 'never' }, prefs, now: NIGHT, audience: 'client' });
  assert.equal(held.nextState.pendingDigest.length, 1, 'quiet hours must hold it');
  assert.equal(held.nextState.types['directive:self'], undefined,
    'a QUEUED item must not be stamped — the stamp is what a purge can orphan');

  // ...and it is still not queued twice while it waits.
  const again = decideNotifications({ candidates: cands, last: held.nextState, prefs, now: NIGHT, audience: 'client' });
  assert.equal(again.nextState.pendingDigest.length, 1, 'the held item was queued a second time');
  assert.deepEqual(again.suppressed.map((s) => s.reason), ['duplicate']);

  // ...and DELIVERY is what stamps it, so the same move does not come round again.
  const out = decideNotifications({ candidates: [], last: again.nextState, prefs, now: DAYTIME, audience: 'client' });
  assert.ok(out.digest, 'the held item should be delivered outside quiet hours');
  assert.equal(out.nextState.types['directive:self'].sig, cands[0].sig,
    'delivery must stamp what it actually sent');
  const after = decideNotifications({ candidates: cands, last: out.nextState, prefs, now: DAYTIME, audience: 'client' });
  assert.deepEqual(after.send, [], 'a delivered move must not be sent again on the same signature');
});

// ⚠ A CONSTANT SIGNATURE IN A MAP THAT IS NEVER PRUNED MEANS ONCE PER MEMBER, EVER.
// `checkin_due` signed itself 'due' and `streak_broken` signed itself 'broken', while
// score_drop / goal_slip signed with a reason STRING — so each fired at most once in a
// member's lifetime (or once per distinct reason). `habit_reminder` day-scopes its
// signature deliberately, which is what made the others read as an oversight rather than a
// policy. Every self-keyed client candidate now signs with its content AND the week, so it
// can recur at most weekly — still governed by the daily cap, quiet hours and the digest.
test('a self-keyed candidate signs with the WEEK, so it can come round again', () => {
  const flags = [
    { key: 'streak_broken', reason: 'Streak broken — was 12 days' },
    { key: 'score_drop', reason: 'down 40 this week' },
    { key: 'goal_slip', reason: 'behind pace' },
  ];
  const build = (now) => {
    const out = {};
    for (const c of clientCandidates({ directive: null, flags, checkinDueThisWeek: true, now, tone: 'supportive' })) out[c.type] = c.sig;
    return out;
  };
  const wk1 = build(new Date('2026-06-17T10:00:00Z'));   // Wednesday
  const sameWeek = build(new Date('2026-06-19T10:00:00Z')); // Friday, same week
  const wk2 = build(new Date('2026-06-24T10:00:00Z'));   // the Wednesday after

  const types = ['checkin_due', 'streak_broken', 'score_drop', 'goal_slip'];
  for (const t of types) {
    assert.ok(wk1[t], `fixture must produce a ${t} candidate`);
    assert.equal(sameWeek[t], wk1[t], `${t} must not re-fire within the same week`);
    assert.notEqual(wk2[t], wk1[t], `${t} still signs itself the same way every week — it can only ever fire once`);
  }
  // ...and the content still separates two DIFFERENT drops inside one week.
  const other = build(new Date('2026-06-17T10:00:00Z'));
  assert.equal(other.score_drop, wk1.score_drop);
  const changed = clientCandidates({ directive: null, flags: [{ key: 'score_drop', reason: 'down 90 this week' }], now: new Date('2026-06-17T10:00:00Z'), tone: 'supportive' });
  assert.notEqual(changed[0].sig, wk1.score_drop, 'a different reason must still be a different signature');
});

// ⚠ AND THE MAP GREW WITHOUT BOUND. The sigKey is `${type}:${key}`, and coach_message /
// coach_cosign key on the EVENT id — so every message a member ever received left a
// permanent entry in a user_goals blob that is read and rewritten on every cron pass. `at`
// was written and never read; it is now what bounds the map. Dropping an entry can only
// ever cost a duplicate notification, never a silent loss, and nothing that recurs is
// dropped: event ids never repeat and the self-keyed signatures change weekly anyway.
test('dedup stamps are pruned by age, so notify_state cannot grow forever', () => {
  const prefs = { ...DEFAULT_PREFS, tz: TZ };
  const now = new Date('2026-06-17T10:00:00Z');
  const day = 86400000;
  const last = { date: 'never', types: {
    'coach_message:old': { sig: 'old', at: +now - 60 * day },
    'coach_message:recent': { sig: 'recent', at: +now - 3 * day },
    'coach_message:undated': { sig: 'undated' },
  } };
  const out = decideNotifications({ candidates: [], last, prefs, now, audience: 'client' });
  assert.equal(out.nextState.types['coach_message:old'], undefined, 'an ancient stamp must not live forever');
  assert.equal(out.nextState.types['coach_message:undated'], undefined, 'a stamp that cannot be dated is the same unbounded growth');
  assert.deepEqual(sigsOf(out.nextState.types['coach_message:recent']), ['recent'],
    'a live stamp was pruned — that resurrects a notification the member already had');
});

// ⚠ A DEFAULT PARAMETER HIDES AN UNWIRED CALLER. `clientCandidates` defaults `now` to the
// wall clock, so a caller that never passes one still produces plausible signatures — they
// would just be keyed to a different instant than the rest of the pipeline, silently, and
// every test above would stay green because each supplies its own `now`. This asserts the
// real call site.
test('candidatesFor hands clientCandidates the pipeline instant', () => {
  const src = readFileSync(new URL('../src/lib/ai/notify-core.ts', import.meta.url), 'utf8');
  assert.match(src, /clientCandidates\(\{[^;]*now: opts\.now/,
    'opts.now must reach clientCandidates, or the weekly signature keys off the wall clock');
});

// ⚠ THE DEDUP IDENTITY IS (type, KEY, sig) — AND MY QUEUE CHECK DROPPED THE KEY. The stamp
// path keys on `${type}:${key}`, but the queued-item check matched on type and signature
// alone. coachCandidates signs `${severity}:${reason}`, so two DIFFERENT clients in the
// same state share a signature and differ only by key: once the first was held, the second
// was classified a duplicate and dropped from that digest, delaying a red client alert.
test('two held candidates of the same type and signature are told apart by KEY', () => {
  const prefs = { ...DEFAULT_PREFS, tz: TZ };
  const rows = (id, name) => ({ clientId: id, clientName: name, severity: 'red', reason: 'no check-in 3w', flags: [{ owned: true, reason: 'no check-in 3w', discipline: 'training' }] });
  const cands = coachCandidates({ triageRows: [rows('c1', 'Ana'), rows('c2', 'Bo')], lastSeverity: {} });
  assert.equal(cands.length, 2, 'fixture must produce one candidate per client');
  assert.equal(cands[0].sig, cands[1].sig, 'premise: the two must share a signature for this test to mean anything');
  assert.notEqual(cands[0].key, cands[1].key);

  // quiet hours: both are held. The second must NOT be read as a duplicate of the first.
  const out = decideNotifications({ candidates: cands, last: { date: 'never' }, prefs, now: NIGHT, audience: 'coach' });
  assert.equal(out.nextState.pendingDigest.length, 2,
    'a second client in the same state was dropped as a duplicate of the first');
  assert.deepEqual(out.nextState.pendingDigest.map((i) => i.key).sort(), ['c1', 'c2']);

  // ...and the same candidate really is still a duplicate of itself.
  const again = decideNotifications({ candidates: cands, last: out.nextState, prefs, now: NIGHT, audience: 'coach' });
  assert.equal(again.nextState.pendingDigest.length, 2, 'a genuinely duplicate candidate was queued twice');
});

// ⚠ ONE SLOT PER (type,key) CANNOT REMEMBER TWO DELIVERIES — the same single-slot shape
// that caused the orphaned stamps, one layer further on. Two directives can be held at
// once (a changed signature is not a duplicate), and when ONE digest delivers both, the
// second signature overwrote the first. The earlier directive then read as never sent and
// was delivered a SECOND time the moment its content came back round.
test('a digest that delivers two items for one key remembers BOTH signatures', () => {
  const prefs = { ...DEFAULT_PREFS, tz: TZ };
  const queue = (directive, last) => decideNotifications({
    candidates: clientCandidates({ directive, flags: [], tone: 'supportive' }),
    last, prefs, now: NIGHT, audience: 'client',
  }).nextState;

  const both = queue({ ...CHECKIN_DIRECTIVE }, queue({ ...SLEEP_DIRECTIVE }, { date: 'never' }));
  assert.equal(both.pendingDigest.length, 2, 'both directives must be held for this test to mean anything');
  const out = decideNotifications({ candidates: [], last: both, prefs, now: DAYTIME, audience: 'client' });
  assert.equal(out.digest.data.items.length, 2, 'one digest must deliver both');

  // BOTH are now delivered, so NEITHER may be sent again.
  for (const d of [SLEEP_DIRECTIVE, CHECKIN_DIRECTIVE]) {
    const again = decideNotifications({
      candidates: clientCandidates({ directive: d, flags: [], tone: 'supportive' }),
      last: out.nextState, prefs, now: DAYTIME, audience: 'client',
    });
    assert.deepEqual(again.send, [],
      `a directive delivered in that digest was sent again: ${d.action.label}`);
  }

  // ...and a genuinely NEW signature still gets through.
  const fresh = { ...SLEEP_DIRECTIVE, action: { label: 'go to bed an hour earlier', kind: 'log_sleep' } };
  const sent = decideNotifications({
    candidates: clientCandidates({ directive: fresh, flags: [], tone: 'supportive' }),
    last: out.nextState, prefs, now: DAYTIME, audience: 'client',
  });
  assert.deepEqual(sent.send.map((i) => i.type), ['directive'], 'a new move was suppressed as a duplicate');
});

// ⚠ A LIST BOUNDED BY THE ENTRY'S AGE WOULD NEVER EXPIRE FOR A KEY WRITTEN EVERY DAY —
// exactly the unbounded growth this file just finished fixing. Each signature therefore
// carries its OWN age, so an entry touched daily still sheds signatures older than the TTL.
test('an entry kept alive by fresh writes still sheds its old signatures', () => {
  const prefs = { ...DEFAULT_PREFS, tz: TZ };
  const now = new Date('2026-06-17T10:00:00Z');
  const day = 86400000;
  const last = { date: 'never', types: { 'directive:self': { sigs: [
    { s: 'ancient', at: +now - 60 * day },
    { s: 'stale', at: +now - 31 * day },
    { s: 'live', at: +now - 2 * day },
  ], sig: 'live', at: +now - 2 * day } } };
  const out = decideNotifications({ candidates: [], last, prefs, now, audience: 'client' });
  assert.deepEqual(sigsOf(out.nextState.types['directive:self']), ['live'],
    'signatures older than the TTL survived on an entry kept alive by a recent write');
});

// ⚠ THE STATE THE LIVE DEPLOY IS WRITING RIGHT NOW, which this code no longer produces —
// so no other test in this file can exhibit it. Since #1915 production queues an item
// CARRYING its signature AND stamps notify_state.types at the same moment. After the queue
// became the record, that pairing stops being written, but every member already holding one
// still has it: on the first evaluation after rollout the queued copy is purged on opt-out
// and, without the release, the stamp outlives it — the orphaned-stamp bug all over again,
// and permanent for checkin_due, which cannot re-sign inside the same week.
test('a stamp written at queue time by the PREVIOUS deploy is released with its item', () => {
  const prefs = { ...DEFAULT_PREFS, tz: TZ };
  const now = new Date('2026-06-17T10:00:00Z');
  const queuedByOldDeploy = { type: 'checkin_due', key: 'self', sig: 'due:2026-06-15', title: 'Check-in ready', body: 'b', route: 'checkin', data: {}, priority: 'med', channels: { inapp: true, push: true }, at: LIVE };
  const last = { date: 'never', pendingDigest: [queuedByOldDeploy], types: {
    'checkin_due:self': { sig: 'due:2026-06-15', at: LIVE },
    'coach_message:m1': { sig: 'm1', at: LIVE },
  } };

  const out = decideNotifications({ candidates: [], last, prefs, now, audience: 'client', checkinOptedOut: true });
  assert.equal(out.nextState.types['checkin_due:self'], undefined,
    'the stamp outlived the queued item it was written for — that member never gets the nudge');
  assert.deepEqual(sigsOf(out.nextState.types['coach_message:m1']), ['m1'], 'an unrelated entry was released');

  // ...and it must actually ARRIVE once the member opts back in, same week and all.
  const back = decideNotifications({
    candidates: clientCandidates({ directive: null, flags: [], checkinDueThisWeek: true, now, tone: 'supportive' }),
    last: out.nextState, prefs, now, audience: 'client',
  });
  assert.deepEqual(back.send.map((i) => i.type), ['checkin_due'],
    'the rebuilt check-in was deduped against a nudge that was never delivered');
});
