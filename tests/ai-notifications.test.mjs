// Proactive notification layer — the guardrails (honest data, dedup, opt-out,
// quiet hours, caps, digest, never-shaming) + the routing. Pure; node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('a directive carries its move kind, so a HELD copy stays identifiable', () => {
  // The held-item purge below cannot key on copy — wording is translated and edited. The
  // action kind is the stable identity, so it is stamped when the candidate is built.
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
  const last = { date: 'never', pendingDigest: [held], types: { 'checkin_due:self': { sig: 'due', at: 1 } } };
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
  assert.deepEqual(on.nextState.types['checkin_due:self'], { sig: 'due', at: 1 }, 'the stamp was cleared for a member who never opted out');
});

// ⚠ CLEARING A STAMP ANOTHER HELD ITEM IS STILL STANDING BEHIND WOULD DOUBLE IT UP. A
// queued item carries no key, and both shapes the purge can match are built with the
// single key 'self' — so a held directive that is NOT the check-in shares the purged
// one's dedup entry. Releasing it would let that same directive be rebuilt and queued a
// second time while the first is still waiting in the digest.
test('a stamp a SURVIVING held item still stands behind is not released', () => {
  const checkin = { type: 'directive', title: 'Your move today', body: 'Send your weekly check-in', route: 'home', data: { move: 'check_in' }, priority: 'high', channels: { push: true } };
  const sleep = { type: 'directive', title: 'Your move today', body: "Log last night's sleep", route: 'home', data: { move: 'recovery' }, priority: 'high', channels: { push: true } };
  const prefs = { ...DEFAULT_PREFS, tz: TZ };
  const stamps = () => ({ 'directive:self': { sig: 'amber|Send it|', at: 1 }, 'coach_message:m1': { sig: 'm1', at: 1 } });

  const survives = decideNotifications({ candidates: [], last: { date: 'never', pendingDigest: [checkin, sleep], types: stamps() }, prefs, now: DAYTIME, audience: 'client', checkinOptedOut: true });
  assert.equal(survives.nextState.pendingDigest.length, 0, 'both held directives should have gone to the digest');
  assert.deepEqual(survives.digest.data.items.map((i) => i.data.move), ['recovery'], 'the wrong directive was purged');
  assert.deepEqual(survives.nextState.types['directive:self'], { sig: 'amber|Send it|', at: 1 },
    'released a stamp the surviving directive is still standing behind');

  // ...and with nothing of that type left, the stamp IS released — and only that one.
  const alone = decideNotifications({ candidates: [], last: { date: 'never', pendingDigest: [checkin], types: stamps() }, prefs, now: DAYTIME, audience: 'client', checkinOptedOut: true });
  assert.equal(alone.nextState.types['directive:self'], undefined, 'the purged directive left its stamp behind');
  assert.deepEqual(alone.nextState.types['coach_message:m1'], { sig: 'm1', at: 1 }, 'the purge cleared an unrelated dedup entry');
});
