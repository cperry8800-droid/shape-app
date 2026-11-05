// The coach's move (P2, 2026-11-05): the new signals, the coach-action table, the client drafts, dismiss
// and snooze, the care team's routing and joint attention. Driven through the shipped engine
// (public/newdesign/dashSignals.js), and the website's Message draft through dashToday.jsx's own code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { bsReplyWaitLeg } from '../src/lib/coach-client-legs.mjs';

const require_ = createRequire(import.meta.url);
const E = require_('../public/newdesign/dashSignals.js');
const { getTriageFeed, evaluateClient, COACH_ACTIONS, COACH_ACTION_KINDS, coachActionFor, memberDraft, coachBrief, isDismissed,
  attachCoachContext, recordFromOverview, engineSnapshot, findJointAttention, buildMockClients, checkinReviewed, FLAG_DISCIPLINE, DIRECTIVE_PRIORITY } = E;

// Wednesday 2026-11-04, 1:20 pm local.
const NOW = new Date('2026-11-04T13:20:00');
const DAY = 864e5;
const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const ago = (days) => iso(new Date(NOW.getTime() - days * DAY));
const MONDAY = '2026-11-02';
const base = (over = {}) => ({ profile: { id: 'c1', name: 'Sam Rivera', isNew: false }, checkIn: { lastWeekOf: MONDAY }, ...over });
const keys = (row) => row.flags.map((f) => f.key).sort();
const trainer = (rec, t) => getTriageFeed('trainer', [rec], NOW, t)[0];
const nutri = (rec, t) => getTriageFeed('nutritionist', [rec], NOW, t)[0];

// ── the new signals ─────────────────────────────────────────────────────────
test('missed sessions: the trainer\'s, at the threshold, over an evidence floor, tunable', () => {
  const at = (done, planned) => trainer(base({ trainingAdherence: { done, planned, pct: 0 } }));
  assert.deepEqual(keys(at(7, 10)), ['missed_sessions']);
  assert.equal(at(7, 10).flags[0].reason, "3 of 10 booked sessions in the last 6 weeks weren't completed");
  assert.equal(at(7, 10).flags[0].label, 'Missed 3');
  assert.deepEqual(keys(at(8, 10)), [], 'two missed is under the house 3');
  assert.deepEqual(keys(at(0, 3)), [], 'three booked is under the evidence floor of 4');
  assert.deepEqual(keys(at(0, 4)), ['missed_sessions'], 'four booked, none kept');
  assert.deepEqual(keys(trainer(base({ trainingAdherence: { done: 7, planned: 10 } }), E.resolveThresholds({ MISSED_SESSIONS: 4 }).thresholds)), []);
  assert.equal(at(7, 10).lead.action.kind, 'schedule');
  // A nutritionist with a trainer on the client: not theirs. Alone on the client: theirs.
  assert.deepEqual(keys(nutri(base({ trainingAdherence: { done: 7, planned: 10 } }))), []);
  assert.deepEqual(keys(nutri(base({ trainingAdherence: { done: 7, planned: 10 }, pros: { trainer: false, nutritionist: true } }))), ['missed_sessions']);
  // Absence is never a signal.
  assert.deepEqual(keys(trainer(base({ trainingAdherence: { done: null, planned: 10 } }))), []);
});

test('a check-in waiting: only unreviewed, this week or last, with a low rating or a question', () => {
  const ck = (latest) => base({ checkIn: { lastWeekOf: MONDAY, latest: { weekOf: MONDAY, ratings: {}, asked: false, reviewed: false, ...latest } } });
  assert.deepEqual(keys(trainer(ck({ ratings: { sleep: 2 } }))), ['checkin_waiting']);
  assert.equal(trainer(ck({ ratings: { sleep: 2 } })).flags[0].reason, 'Check-in waiting — rated sleep 2/5');
  assert.equal(trainer(ck({ ratings: { stress: 4, energy: 1 }, asked: true })).flags[0].reason, 'Check-in waiting — rated energy 1/5 and stress 4/5, and asked a question');
  assert.equal(trainer(ck({ asked: true })).flags[0].label, 'Question waiting');
  assert.deepEqual(keys(trainer(ck({ ratings: { sleep: 3, stress: 3 } }))), [], 'nothing low, nothing asked');
  assert.deepEqual(keys(trainer(ck({ ratings: { stress: 3 }, asked: true, reviewed: true }))), [], 'reviewed');
  assert.deepEqual(keys(trainer(ck({ asked: true, reviewed: null }))), [], 'an unread review state never says one is waiting');
  assert.deepEqual(keys(trainer(ck({ asked: true, weekOf: '2026-10-26' }))), ['checkin_waiting'], 'last week\'s still waits');
  assert.deepEqual(keys(trainer(base({ checkIn: { lastWeekOf: '2026-10-19', latest: { weekOf: '2026-10-19', asked: true, reviewed: false } } }))).includes('checkin_waiting'), false, 'two weeks back is history');
  assert.deepEqual(keys(trainer(ck({ ratings: { sleep: 9 } }))), [], 'a rating off the 1-5 scale is not read');
  assert.equal(trainer(ck({ asked: true })).lead.action.kind, 'review_checkin');
});

test('a reply waiting: the coach\'s own thread, past the threshold, said in hours then days', () => {
  const rw = (h, role = 'trainer') => base({ replyWait: { [role]: new Date(NOW.getTime() - h * 3600e3).toISOString() } });
  assert.deepEqual(keys(trainer(rw(23))), []);
  assert.equal(trainer(rw(24)).flags[0].reason, 'Their message has waited 24 hours for your reply');
  assert.equal(trainer(rw(50)).flags[0].reason, 'Their message has waited 2 days for your reply');
  assert.deepEqual(keys(nutri(rw(30))), [], 'the trainer\'s thread is not the nutritionist\'s');
  assert.deepEqual(keys(nutri(rw(30, 'nutritionist'))), ['reply_waiting']);
  assert.deepEqual(keys(trainer(rw(30), E.resolveThresholds({ REPLY_WAIT_HOURS: 48 }).thresholds)), []);
  assert.equal(trainer(rw(30)).lead.action.kind, 'reply');
  assert.equal(trainer(rw(30)).lead.action.draft, null, 'they wrote: no draft over their words');
});

test('reply wait leg: the oldest unanswered client message, per role, the coach\'s reply ending it', () => {
  const m = (conv, sender, at) => ({ conversation_id: conv, sender_id: sender, created_at: at });
  const rows = [
    m('t', 'client', '2026-11-03T09:00:00Z'), m('t', 'client', '2026-11-03T10:00:00Z'),
    m('t', 'coach', '2026-11-02T09:00:00Z'), m('t', 'client', '2026-11-01T09:00:00Z'),
    m('dm', null, '2026-11-03T11:00:00Z'), // Shape's own message answers nobody
    m('n', 'coach', '2026-11-03T12:00:00Z'), m('n', 'client', '2026-11-03T08:00:00Z'),
  ];
  const leg = bsReplyWaitLeg(rows, 'client', { trainer: ['t', 'dm'], nutritionist: ['n', 'dm'] });
  assert.equal(leg.trainer, '2026-11-03T09:00:00.000Z');
  assert.equal(leg.nutritionist, null, 'the coach wrote last');
  assert.deepEqual(bsReplyWaitLeg([], 'client', { trainer: ['t'] }), { trainer: null, nutritionist: null });
  assert.deepEqual(bsReplyWaitLeg(rows, 'client', {}), { trainer: null, nutritionist: null }, 'no thread, nothing waiting');
});

test('a program ending with nothing next: by its end date, or its last week; not paused, not lined up', () => {
  const p = (over) => base({ program: { name: 'Block 3', week: 6, weeks: 8, status: 'active', ...over } });
  const inDays = (d) => new Date(NOW.getTime() + d * DAY).toISOString();
  assert.equal(trainer(p({ estimatedEndAt: inDays(5) })).flags[0].reason, '“Block 3” ends in 5 days and nothing is lined up next');
  assert.equal(trainer(p({ estimatedEndAt: inDays(1) })).flags[0].reason, '“Block 3” ends tomorrow and nothing is lined up next');
  assert.equal(trainer(p({ estimatedEndAt: inDays(-3) })).flags[0].reason, '“Block 3” ended 3 days ago and nothing is lined up next');
  assert.deepEqual(keys(trainer(p({ estimatedEndAt: inDays(9) }))), []);
  assert.deepEqual(keys(trainer(p({ estimatedEndAt: inDays(-20) }))), [], 'long over: the leg is stale');
  assert.deepEqual(keys(trainer(p({ estimatedEndAt: inDays(3), nextAssigned: 'Block 4' }))), []);
  assert.deepEqual(keys(trainer(p({ estimatedEndAt: inDays(3), status: 'paused' }))), []);
  assert.equal(trainer(p({ week: 8 })).flags[0].reason, '“Block 3” is in its last week and nothing is lined up next');
  assert.equal(trainer(p({ estimatedEndAt: inDays(3) })).lead.action.label, 'Write the next block');
  assert.equal(nutri(p({ estimatedEndAt: inDays(3) })).lead.action.label, 'Write the next plan');
  // Amber on its own, never red with one other flag: it is the practice's calendar.
  assert.equal(trainer(p({ estimatedEndAt: inDays(3) })).severity, 'amber');
  assert.equal(trainer({ ...p({ estimatedEndAt: inDays(3) }), streaks: { current: 0, best: 9 } }).severity, 'amber');
});

test('a payment retrying is quiet: on the row with its move, never a colour or an alert', () => {
  const r = trainer(base({ payments: { status: 'past_due', paymentRetrying: true }, progressRead: { state: 'ready' }, foodLogs: { lastLoggedOn: ago(1), daysLogged7d: 6 } }));
  assert.deepEqual(keys(r), ['payment_retrying']);
  assert.equal(r.severity, 'green');
  assert.equal(r.lead.key, 'payment_retrying', 'it leads a row nothing louder is on');
  assert.equal(r.lead.action.kind, 'message');
  const both = trainer(base({ payments: { paymentRetrying: true }, lastContact: { trainer: ago(9) } }));
  assert.equal(both.severity, 'amber', 'the contact gap alone colours it');
  assert.equal(both.lead.key, 'contact_gap', 'a quiet flag never leads a louder one');
  assert.equal(coachBrief([r]).row, null, 'the brief is for who needs you');
  // Any one of the three places a surface says it: the website's status, the overview's flag, the app's profile.
  assert.deepEqual(keys(trainer(base({ payments: { status: 'past_due' } }))), ['payment_retrying']);
  assert.deepEqual(keys(trainer(base({ payments: { paymentRetrying: true } }))), ['payment_retrying']);
  assert.deepEqual(keys(trainer(base({ profile: { id: 'c1', name: 'Sam', paymentRetrying: true } }))), ['payment_retrying']);
  assert.deepEqual(keys(trainer(base({ payments: { status: 'active', paymentRetrying: false } }))), []);
  // It never outranks a louder reason: the lowest priority of every coach flag.
  const coachFlags = Object.keys(FLAG_DISCIPLINE).filter((k) => k !== 'hydration_low' && k !== 'payment_retrying');
  for (const k of coachFlags) assert.ok(DIRECTIVE_PRIORITY[k] > DIRECTIVE_PRIORITY.payment_retrying, k);
});

test('a plan ending is a hook until the roster carries it (P3), then a flag', () => {
  assert.deepEqual(keys(trainer(base({ payments: { status: 'active' } }))), []);
  const end = new Date(NOW.getTime() + 6 * DAY).toISOString();
  const r = trainer(base({ payments: { cancelAtPeriodEnd: true, periodEndsAt: end } }));
  assert.deepEqual(keys(r), ['plan_ending']);
  assert.match(r.flags[0].reason, /^Cancelled — their plan ends Tue, Nov 10$/);
  assert.deepEqual(keys(trainer(base({ payments: { cancelAtPeriodEnd: true, periodEndsAt: new Date(NOW.getTime() + 30 * DAY).toISOString() } }))), []);
  assert.deepEqual(keys(trainer(base({ payments: { cancelAtPeriodEnd: false, periodEndsAt: end } }))), []);
});

test('wearable recovery: the device\'s own score, low over the week, with enough readings', () => {
  const rc = (avg7, n) => base({ recovery: { recoveryScore: { avg7, n } } });
  assert.equal(trainer(rc(28, 4)).flags[0].reason, "Their wearable's recovery has averaged 28/100 this week — ease the load");
  assert.deepEqual(keys(trainer(rc(34, 4))), []);
  assert.deepEqual(keys(trainer(rc(33, 3))), ['recovery_low'], 'at the line, at the floor');
  assert.deepEqual(keys(trainer(rc(20, 2))), [], 'two readings is under the floor');
  assert.equal(trainer(rc(28, 4)).lead.action.kind, 'adjust_program');
  assert.equal(nutri({ ...rc(28, 4), pros: { trainer: false, nutritionist: true } }).lead.action.kind, 'message', 'a sole nutritionist messages');
  assert.deepEqual(keys(nutri(rc(28, 4))), ['recovery_low']);
  assert.equal(nutri(rc(28, 4)).flags[0].owned, false, 'routed to the trainer on the client');
  // Coach views only: the member's own directive never sees it.
  assert.equal(evaluateClient(rc(10, 5), NOW, 'client').flags.some((f) => f.key === 'recovery_low'), false);
});

// ── the coach-action table ──────────────────────────────────────────────────
test('every coach flag has exactly one action, of a kind both surfaces can make', () => {
  const coachFlags = Object.keys(FLAG_DISCIPLINE).filter((k) => k !== 'hydration_low');
  for (const k of coachFlags) {
    assert.ok(COACH_ACTIONS[k], k + ' has no coach action');
    for (const role of ['trainer', 'nutritionist']) {
      const a = coachActionFor(k, role, base());
      assert.ok(COACH_ACTION_KINDS.includes(a.kind), k + ' → ' + a.kind);
      assert.ok(a.label);
      if (a.kind === 'message') assert.ok(a.draft, k + ' is a message with no draft');
      else if (a.kind !== 'review_checkin') assert.equal(a.draft, null, k + ' → ' + a.kind + ' carries a client draft');
    }
    assert.ok(DIRECTIVE_PRIORITY[k] != null, k + ' has no priority');
  }
  assert.equal(coachActionFor('hydration_low', 'trainer', base()), null, 'a member-only flag has no coach move');
  assert.equal(coachActionFor('plan_due', 'trainer').label, 'Publish week 1');
  assert.equal(coachActionFor('plan_due', 'nutritionist').label, 'Publish the first plan');
  assert.equal(coachActionFor('screening_flagged', 'trainer').kind, 'read_screening');
  assert.equal(coachActionFor('protein_under', 'nutritionist').kind, 'adjust_plan');
  assert.equal(coachActionFor('protein_under', 'trainer').kind, 'message', 'a sole trainer talks it through');
  assert.equal(coachActionFor('checkin_overdue', 'trainer').nora, true, "Nora's draft exists for it");
});

test('every member draft is the member\'s: no coach reason, ever', () => {
  // Every reason the engine writes across the demo roster, both roles, plus the new signals.
  const reasons = new Set();
  const recs = buildMockClients(NOW).concat([
    base({ screening: 'flagged' }), base({ screening: 'missing' }),
    base({ trainingAdherence: { done: 1, planned: 8 } }),
    base({ replyWait: { trainer: ago(3) } }),
    base({ recovery: { recoveryScore: { avg7: 20, n: 5 } } }),
    base({ payments: { paymentRetrying: true } }),
  ]);
  const rows = getTriageFeed('trainer', recs, NOW).concat(getTriageFeed('nutritionist', recs, NOW));
  for (const r of rows) for (const f of r.flags.concat(r.readOnly)) reasons.add(f.reason.toLowerCase());
  assert.ok(reasons.size >= 15, 'the corpus is too small to prove anything (' + reasons.size + ')');
  for (const k of Object.keys(COACH_ACTIONS)) {
    for (const role of ['trainer', 'nutritionist']) {
      for (const rec of recs) {
        const d = memberDraft(k, rec, role);
        if (!d) continue;
        const low = d.toLowerCase();
        for (const reason of reasons) assert.ok(!low.includes(reason), k + ' draft quotes a coach reason: ' + reason);
        for (const word of ['read it before programming', 'health flag', 'routed', '→', 'dietitian', 'flag']) assert.ok(!low.includes(word), k + ' draft says "' + word + '"');
      }
    }
  }
});

test('a client nobody has written to gets a welcome, not "it has been a while"', () => {
  const never = trainer(base({ profile: { id: 'c1', name: 'Tess B.', joinedAt: new Date(NOW.getTime() - 9 * DAY).toISOString() }, lastContact: { trainer: null } }));
  assert.equal(never.lead.key, 'contact_gap');
  assert.equal(never.lead.sig, 'never');
  assert.match(never.lead.action.draft, /^Hi Tess — welcome aboard!/);
  const quiet = trainer(base({ lastContact: { trainer: new Date(NOW.getTime() - 9 * DAY).toISOString() } }));
  assert.match(quiet.lead.action.draft, /^Hey Sam — it's been a little while/);
  const hello = trainer(base({ onboarding: { trainer: { day: 4, steps: [{ key: 'hello', done: false }] } } }));
  assert.equal(hello.lead.sig, 'hello');
  assert.match(hello.lead.action.draft, /welcome aboard/);
});

test("the lead is the coach's own: a routed flag never leads, however urgent", () => {
  // A nutritionist with a trainer on the client: sleep (35) is the trainer's, the Score (30) is theirs.
  const rec = base({ pros: { trainer: true, nutritionist: true }, recovery: { sleepHours: { avg7: 5, lastNight: 5, target: 7.5, n: 6 } },
    shapeScoreHistory: [{ weekOf: '2026-10-19', points: 70 }, { weekOf: '2026-10-26', points: 60 }] });
  const r = nutri(rec);
  assert.deepEqual(keys(r), ['score_drop', 'sleep_low']);
  assert.equal(r.lead.key, 'score_drop');
  assert.equal(nutri(base({ pros: { trainer: true, nutritionist: true }, streaks: { current: 0, best: 9 } })).lead, null, 'nothing of theirs, nothing asked of them');
});

test("the website's Message draft never pastes the reason (the screening case)", () => {
  const src = readFileSync(new URL('../public/newdesign/dashToday.jsx', import.meta.url), 'utf8');
  const at = src.indexOf('function dashMessageDraft(');
  let depth = 0, end = -1;
  for (let j = src.indexOf('{', at); j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) { end = j + 1; break; } }
  // eslint-disable-next-line no-new-func
  const dashMessageDraft = new Function(src.slice(at, end) + '; return dashMessageDraft;')();
  const flagged = trainer(base({ screening: 'missing', progressRead: { state: 'ready' } }));
  const draft = dashMessageDraft(flagged);
  assert.equal(draft, 'Hi Sam — before our next session, could you fill in your health screening? It takes a few minutes and helps me plan safely.');
  assert.ok(!draft.toLowerCase().includes(flagged.lead.reason.toLowerCase()));
  // A yes on the screening is read, not messaged: no draft at all.
  assert.equal(dashMessageDraft(trainer(base({ screening: 'flagged' }))), null);
  for (const r of getTriageFeed('trainer', buildMockClients(NOW), NOW)) {
    const d = dashMessageDraft(r);
    if (!d) continue;
    for (const f of r.flags) assert.ok(!d.toLowerCase().includes(f.reason.toLowerCase()), r.client.profile.name + ': ' + d);
    assert.ok(!/I'm seeing/.test(d));
  }
});

test('the brief: "{name} first — {reason}", the count behind it, and the clear day', () => {
  const feed = getTriageFeed('trainer', buildMockClients(NOW), NOW);
  const b = coachBrief(feed);
  assert.equal(b.text, 'Marcus T. first — ' + feed[0].lead.reason);
  assert.equal(b.more, feed.filter((r) => r.severity === 'red' || r.severity === 'amber').length - 1);
  assert.deepEqual(coachBrief([]), { text: 'Nothing needs you right now.', row: null, more: 0 });
});

// ── dismiss and snooze ──────────────────────────────────────────────────────
test('a dismissal holds while the reason is the same episode; a snooze until its time too', () => {
  const rec = base({ lastContact: { trainer: new Date(NOW.getTime() - 7 * DAY).toISOString() } });
  const flag = trainer(rec).flags.find((f) => f.key === 'contact_gap');
  assert.ok(flag.sig, 'the flag names its episode');
  const row = (d) => trainer(attachCoachContext([rec], { dismissals: d })[0]);
  const dis = (until, sig = flag.sig, key = 'contact_gap') => [{ client_id: 'c1', reason_key: key, reason_sig: sig, until }];
  assert.deepEqual(keys(row(dis(null))), [], 'dismissed until it changes');
  assert.equal(row(dis(null)).severity, 'green');
  assert.deepEqual(row(dis(null)).dismissed.map((f) => f.key), ['contact_gap'], 'and the row says what was set aside');
  assert.deepEqual(keys(row(dis(new Date(NOW.getTime() + DAY).toISOString()))), [], 'snoozed until tomorrow');
  assert.deepEqual(keys(row(dis(new Date(NOW.getTime() - 1).toISOString()))), ['contact_gap'], 'a snooze that ran out');
  assert.deepEqual(keys(row(dis('not a date'))), ['contact_gap'], 'an unreadable time comes back rather than vanishing');
  assert.deepEqual(keys(row(dis(null, 'last:2026-01-01T00:00:00.000Z'))), ['contact_gap'], 'a new episode comes back');
  assert.deepEqual(keys(row(dis(null, flag.sig, 'food_gap'))), ['contact_gap'], 'another reason does not hide it');
  assert.deepEqual(keys(trainer(attachCoachContext([rec], { dismissals: [{ client_id: 'c2', reason_key: 'contact_gap', reason_sig: flag.sig }] })[0])), ['contact_gap'], 'another client');
  assert.deepEqual(keys(trainer(attachCoachContext([rec], { dismissals: null })[0])), ['contact_gap'], 'an unread table hides nothing');
  // The day it moves on, the sig is the same (last contact did not change), so it stays hidden.
  const later = new Date(NOW.getTime() + 2 * DAY);
  assert.deepEqual(getTriageFeed('trainer', attachCoachContext([rec], { dismissals: dis(null) }), later)[0].flags.map((f) => f.key), []);
  // A three-week check-in, set aside, does not turn the row red on its own.
  const late = base({ checkIn: { lastWeekOf: '2026-10-12' } });
  const lsig = trainer(late).flags[0].sig;
  assert.equal(trainer(late).severity, 'red');
  assert.notEqual(trainer(attachCoachContext([late], { dismissals: [{ client_id: 'c1', reason_key: 'checkin_overdue', reason_sig: lsig }] })[0]).severity, 'red');
  // A routed flag can be set aside too (it leaves the read-only context).
  const routed = base({ nutrition: { avgProtein: 90, targetProtein: 150 } });
  const rsig = trainer(routed).readOnly[0].sig;
  assert.equal(trainer(attachCoachContext([routed], { dismissals: [{ client_id: 'c1', reason_key: 'protein_under', reason_sig: rsig }] })[0]).readOnly.length, 0);
  assert.equal(isDismissed(null, flag, NOW), false);
  assert.equal(isDismissed([{ key: 'contact_gap', sig: null }], flag, NOW), false, 'a dismissal with no episode matches none');
});

test('weekly readings come back the next week; a dismissed check-in comes back when another week is missed', () => {
  const rec = base({ recovery: { sleepHours: { avg7: 5.5, lastNight: 5.5, target: 7.5, n: 6 } } });
  const sig = trainer(rec).flags[0].sig;
  const d = [{ client_id: 'c1', reason_key: 'sleep_low', reason_sig: sig, until: null }];
  assert.deepEqual(keys(trainer(attachCoachContext([rec], { dismissals: d })[0])), []);
  const nextWeek = new Date(NOW.getTime() + 7 * DAY);
  assert.deepEqual(getTriageFeed('trainer', attachCoachContext([rec], { dismissals: d }), nextWeek)[0].flags.map((f) => f.key), ['sleep_low']);
  const ci = base({ checkIn: { lastWeekOf: '2026-10-19' } });
  const csig = trainer(ci).flags[0].sig;
  const cd = [{ client_id: 'c1', reason_key: 'checkin_overdue', reason_sig: csig, until: null }];
  assert.deepEqual(getTriageFeed('trainer', attachCoachContext([ci], { dismissals: cd }), new Date(NOW.getTime() + 7 * DAY))[0].flags.map((f) => f.key), [], 'still the same missed run');
  const filed = base({ checkIn: { lastWeekOf: '2026-10-26' } });
  // Friday, past the grace days: the week after the one filed is due, and it is a new episode.
  assert.equal(getTriageFeed('trainer', attachCoachContext([filed], { dismissals: cd }), new Date(NOW.getTime() + 2 * DAY))[0].flags.length, 1, 'a check-in filed, then missed again: a new episode');
});

// ── the shared builder ──────────────────────────────────────────────────────
test('recordFromOverview: the care team decides who a flag routes to', () => {
  const me = { role: 'trainer', providerId: 7, name: 'Coach', userId: 'u-me', isMe: true };
  const rae = { role: 'nutritionist', providerId: 3, name: 'Rae', userId: 'u-rae', isMe: false };
  const kit = { role: 'trainer', providerId: 9, name: 'Kit', userId: 'u-kit', isMe: false };
  assert.deepEqual(recordFromOverview({ id: 'c1' }, { careTeam: [me] }).pros, { trainer: true, nutritionist: false });
  assert.deepEqual(recordFromOverview({ id: 'c1' }, { careTeam: [me, rae] }).coCoaches, [{ role: 'nutritionist', userId: 'u-rae', name: 'Rae' }]);
  // A partial read names only what it saw: an unseen discipline stays unknown (routing as before).
  assert.deepEqual(recordFromOverview({ id: 'c1' }, { careTeam: [me], careTeamPartial: true }).pros, { trainer: true });
  assert.equal('pros' in recordFromOverview({ id: 'c1' }, {}), false, 'no care team read, no claim');
  // A nutritionist-only client: their trainer flags are theirs.
  const nOnly = recordFromOverview({ id: 'c1' }, { careTeam: [{ ...rae, isMe: true }], scoreHistory: { streak: { current: 0, best: 8 } } });
  const r = nutri(nOnly);
  assert.equal(r.flags.find((f) => f.key === 'streak_broken').owned, true);
  assert.equal(r.severity === 'amber' || r.severity === 'red', true, 'and it counts');
  // Two trainers on one client are a care team, but not a joint-attention pair.
  assert.deepEqual(recordFromOverview({ id: 'c1' }, { careTeam: [me, kit] }).pros, { trainer: true, nutritionist: false });
});

test('recordFromOverview: sleep over the overview\'s own window, gauges without series, the device score', () => {
  const rec = recordFromOverview({ id: 'c1', name: 'A' }, {
    sleep: { avg7: 6.1, latest: 7.0, series7: [{ date: ago(2), value: 5 }, { date: ago(1), value: 6 }, { date: ago(0), value: 0 }] },
    vitals: { energy: { avg7: 3.5, n: 3, series7: [1, 2, 3] }, hunger: { avg7: null, n: 0 }, hydration: { avg7L: 1.2, n: 3, series7: [] } },
    deviceRecovery: { avg7: 41, n: 5 },
  });
  assert.deepEqual(rec.recovery, { sleepHours: { avg7: 5.5, lastNight: 6, target: 7.5, n: 2 }, recoveryScore: { avg7: 41, n: 5 } }, 'a zero is no night');
  assert.deepEqual(rec.vitals, { energy: { avg7: 3.5, n: 3 }, hydration: { avg7L: 1.2, targetL: null, n: 3 } });
  assert.equal(recordFromOverview({ id: 'c1' }, { sleep: { avg7: null, series7: [] } }).recovery, null);
});

test('the check-in summary: no text, a review read from the coach\'s doc, an edit reopens it', () => {
  const ck = { week_of: MONDAY, ratings: { sleep: 2 }, question: 'Swap Friday?', created_at: '2026-11-03T10:00:00Z' };
  const rec = recordFromOverview({ id: 'c1' }, { checkins: [ck] });
  assert.equal(rec.checkIn.latest.asked, true);
  assert.ok(!JSON.stringify(rec.checkIn).includes('Swap Friday'), 'the question text is not on the record');
  const withReview = (review) => attachCoachContext([rec], { reviews: { [MONDAY]: { c1: review } } })[0].checkIn.latest.reviewed;
  assert.equal(withReview({ reviewedAt: '2026-11-03T12:00:00Z' }), true);
  assert.equal(withReview({ reviewedAt: '2026-11-03T09:00:00Z' }), false, 'reviewed before it was submitted');
  assert.equal(withReview({ reviewedAt: '2026-11-03T12:00:00Z', checkinSignature: JSON.stringify(ck) }), true);
  assert.equal(withReview({ reviewedAt: '2026-11-03T12:00:00Z', checkinSignature: JSON.stringify({ ...ck, question: 'edited' }) }), false, 'an edit reopens it');
  assert.equal(attachCoachContext([rec], { reviews: {} })[0].checkIn.latest.reviewed, false, 'a doc with nothing for them: not reviewed');
  assert.equal(attachCoachContext([rec], { reviews: null })[0].checkIn.latest.reviewed, null, 'an unread doc: unknown');
  assert.equal(rec.checkIn.latest.reviewed, null, 'the record itself is untouched');
  assert.equal(checkinReviewed(null, rec.checkIn.latest), false);
});

test('the push snapshot keeps the engine\'s inputs and drops what only a page shows', () => {
  const rec = { profile: { id: 'c1', name: 'A' }, intake: [{ l: 'x' }], checkins: [{ question: 'private' }], coachNotes: [{ text: 'note' }], recentLogs: [], coCoaches: [{ userId: 'x' }],
    payments: { mrrCents: 18000, feeCents: 0, status: 'past_due', paymentRetrying: true, origin: 'coach_link' }, streaks: { current: 0, best: 4 }, pros: { trainer: true } };
  const s = engineSnapshot(rec);
  assert.equal(s.userId, 'c1');
  assert.deepEqual(s.payments, { status: 'past_due', paymentRetrying: true, joinedAt: null, cancelAtPeriodEnd: false, periodEndsAt: null });
  for (const k of ['intake', 'checkins', 'coachNotes', 'recentLogs', 'coCoaches']) assert.equal(k in s, false, k);
  assert.deepEqual(s.streaks, rec.streaks);
  assert.equal(engineSnapshot(null), null);
});

// ── joint attention ─────────────────────────────────────────────────────────
test('joint attention: only with a co-coach on the other side, and it names them', () => {
  const slip = { streaks: { current: 0, best: 10 }, foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 2 } };
  const trainerOnly = base({ ...slip, pros: { trainer: true, nutritionist: false }, coCoaches: [] });
  const nutritionistOnly = base({ ...slip, pros: { trainer: false, nutritionist: true }, coCoaches: [] });
  const shared = base({ ...slip, pros: { trainer: true, nutritionist: true }, coCoaches: [{ role: 'nutritionist', userId: 'u-rae', name: 'Rae' }] });
  const twoTrainers = base({ ...slip, coCoaches: [{ role: 'trainer', userId: 'u-kit', name: 'Kit' }] });
  assert.deepEqual(findJointAttention([trainerOnly], NOW, null, 'trainer'), []);
  assert.deepEqual(findJointAttention([nutritionistOnly], NOW, null, 'nutritionist'), []);
  assert.deepEqual(findJointAttention([twoTrainers], NOW, null, 'trainer'), [], 'a second trainer is not the nutrition side');
  const j = findJointAttention([shared], NOW, null, 'trainer');
  assert.equal(j.length, 1);
  assert.deepEqual(j[0].coCoach, { role: 'nutritionist', userId: 'u-rae', name: 'Rae' });
  assert.deepEqual(j[0].action, { kind: 'care_team', label: 'Start joint note' });
  assert.deepEqual(findJointAttention([shared], NOW, null, 'nutritionist'), [], "the nutritionist's counterpart is a trainer, who is not listed");
});

test("joint attention's note goes to the co-coach's private thread, not the client", () => {
  const src = readFileSync(new URL('../public/newdesign/dashToday.jsx', import.meta.url), 'utf8');
  const body = (name) => { const at = src.indexOf(name); let d = 0; for (let j = src.indexOf('{', at); j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) return src.slice(at, j + 1); } return ''; };
  assert.match(body('async function dashOpenCareTeam('), /\/api\/me\/shared-clients\/" \+ encodeURIComponent\(id\) \+ "\/thread"/);
  assert.match(body('async function dashOpenCareTeam('), /counterpartUserId: co\.userId/);
  assert.match(src, /onClick=\{\(\) => \{ dashOpenCareTeam\(j, role\); \}\}/, 'the button opens the care-team thread');
  assert.doesNotMatch(src, /dashMessageClient\(j\.client\.profile\.name, role, dashJointDraft/, 'the joint note no longer writes to the client');
  // eslint-disable-next-line no-new-func
  const draft = new Function(body('function dashJointDraft(') + '; return dashJointDraft;')();
  const j = { client: { profile: { name: 'Marcus T.' } }, coCoach: { name: 'Rae N.' }, trainingFlags: [{ label: 'Streak broken' }], nutritionFlags: [{ label: 'No logs 3d' }] };
  assert.equal(draft(j, 'trainer'), 'Hi Rae — Marcus is slipping on both sides this week (streak broken + no logs 3d). Can we agree one plan before either of us messages them?');
});
