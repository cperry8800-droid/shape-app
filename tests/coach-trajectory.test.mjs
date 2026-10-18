// The practice-trajectory series (review 2026-09-09, R8) — driven with synthetic
// subscription and purchase rows so every bucket rule is pinned: a span opens at
// created_at and closes at its end date only when the status says it ended; a
// payment that is retrying stays counted; MRR uses each row's STORED fee; the
// current week is measured at "now"; the summary figures agree with the series.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrajectory, mondayUTC, openSubsAt, OPEN_SUB_STATUSES, practiceToday, subEndedAt, subNeverStarted, subDeparture, NOT_ENDED_STATUSES, TRAJECTORY_WEEKS } from '../src/lib/coach-trajectory.mjs';

const DAY = 86400000;
const WEEK = 7 * DAY;
// A fixed Wednesday, so "this week" has a Monday two days back.
const NOW = Date.UTC(2026, 8, 9, 15, 0, 0); // 2026-09-09T15:00Z (a Wednesday)
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

const sub = (o) => ({ status: 'active', price_cents: 18000, fee_bps: 1500, ...o });

test('mondayUTC lands on the ISO Monday at 00:00 UTC', () => {
  const m = new Date(mondayUTC(NOW));
  assert.equal(m.getUTCDay(), 1);
  assert.equal(m.toISOString(), '2026-09-07T00:00:00.000Z');
});

test('subEndedAt: the span stays open only while the status is one the house counts', () => {
  assert.equal(subEndedAt({ status: 'active', current_period_end: iso(0) }, NOW), null);
  assert.equal(subEndedAt({ status: 'trialing', current_period_end: iso(DAY) }, NOW), null);
  assert.equal(subEndedAt({ status: 'past_due', current_period_end: iso(DAY) }, NOW), null, 'a retrying payment has not left');
  // The only end date production writes is current_period_end (there is no
  // canceled_at column — the webhook writes { status, current_period_end }).
  assert.equal(subEndedAt({ status: 'canceled', current_period_end: iso(DAY) }, NOW), NOW - DAY);
  assert.equal(subEndedAt({ status: 'unpaid', created_at: iso(10 * DAY) }, NOW), NOW - 10 * DAY);
  assert.equal(subEndedAt({ status: 'paused', current_period_end: iso(2 * DAY) }, NOW), NOW - 2 * DAY);
});

test('subEndedAt CLAMPS to now — a cancelled member paid through next month is gone today', () => {
  // The real production shape: cancelled mid-period, current_period_end still
  // in the future. Read verbatim this counted them active forever and bucketed
  // their departure past the end of the series.
  const future = new Date(NOW + 20 * DAY).toISOString();
  assert.equal(subEndedAt({ status: 'canceled', current_period_end: future }, NOW), NOW);
  const t = buildTrajectory({ subs: [sub({ created_at: iso(40 * DAY), status: 'canceled', current_period_end: future })], now: NOW, weeks: 8 });
  assert.equal(t.summary.activeNow, 0, 'the status says gone, so they are not an active client');
  assert.equal(t.weeks[t.weeks.length - 1].ended, 1, 'and the departure lands in the current week, not off the end');
  assert.equal(t.weeks[t.weeks.length - 1].active, 0);
});

test('an abandoned checkout is neither a join nor a departure', () => {
  assert.equal(subNeverStarted({ status: 'incomplete' }), true);
  assert.equal(subNeverStarted({ status: 'incomplete_expired' }), true);
  assert.equal(subNeverStarted({ status: 'canceled' }), false);
  // All three inside the CURRENT ISO week (NOW is a Wednesday, so 1–2 days back
  // is still this week; 3 would land in the previous bucket).
  const t = buildTrajectory({
    subs: [sub({ created_at: iso(DAY) }), sub({ created_at: iso(2 * DAY), status: 'incomplete' }), sub({ created_at: iso(DAY), status: 'incomplete_expired' })],
    now: NOW, weeks: 4,
  });
  const last = t.weeks[t.weeks.length - 1];
  assert.equal(last.active, 1, 'only the real subscriber counts');
  assert.equal(last.added, 1, 'the two incompletes are not joins');
  assert.equal(last.ended, 0, 'and not departures either');
  assert.equal(t.summary.totalEverSubscribed, 1);
});

test('buckets: added / ended / active / MRR / one-time land in the right weeks', () => {
  const subs = [
    sub({ created_at: iso(10 * WEEK) }),                                                    // A: open for 10 weeks
    sub({ created_at: iso(20 * WEEK), status: 'canceled', current_period_end: iso(5 * WEEK + DAY), price_cents: 22000, fee_bps: 0 }), // B: BYO, ended ~5w ago
    sub({ created_at: iso(2 * DAY), price_cents: 9000, fee_bps: 1500, status: 'past_due' }), // C: this week, payment retrying → still counted
  ];
  const purchases = [
    { status: 'paid', created_at: iso(3 * WEEK + DAY), price_cents: 5000, application_fee_cents: 750 },
    { status: 'refunded', created_at: iso(3 * WEEK + DAY), price_cents: 99999 },            // never counted
  ];
  const t = buildTrajectory({ subs, purchases, now: NOW, weeks: 26 });
  assert.equal(t.weeks.length, 26);
  const last = t.weeks[t.weeks.length - 1];
  assert.equal(last.weekOf, '2026-09-07');
  assert.equal(last.active, 2, 'A and C are open now; B ended');
  assert.equal(last.added, 1, 'C opened this week');
  assert.equal(last.mrrGrossCents, 18000 + 9000);
  assert.equal(last.mrrNetCents, Math.round(18000 * 0.85) + Math.round(9000 * 0.85));

  const byWeek = new Map(t.weeks.map((w) => [w.weekOf, w]));
  const wk = (msAgo) => new Date(mondayUTC(NOW - msAgo)).toISOString().slice(0, 10);
  // B's close (5w + 1d ago) is an `ended` event in that week; it was open the week before.
  assert.equal(byWeek.get(wk(5 * WEEK + DAY)).ended, 1);
  assert.equal(byWeek.get(wk(6 * WEEK + DAY)).active, 2, 'A + B open six weeks back');
  assert.equal(byWeek.get(wk(6 * WEEK + DAY)).mrrNetCents, Math.round(18000 * 0.85) + 22000, 'B is BYO: 0% fee, the coach keeps all of it');
  // A's open (10w ago) is an `added` event in that week.
  assert.equal(byWeek.get(wk(10 * WEEK)).added, 1);
  // Before B existed, nothing was active.
  assert.equal(byWeek.get(wk(22 * WEEK)).active, 0);
  // The paid purchase lands in its week, gross and net; the refund never does.
  const pw = byWeek.get(wk(3 * WEEK + DAY));
  assert.equal(pw.oneTimeCents, 5000);
  assert.equal(pw.oneTimeNetCents, 4250);
  assert.equal(t.weeks.reduce((s, w) => s + w.oneTimeCents, 0), 5000);
});

test('summary: active now vs 30 days ago, this month, churn rate, median tenure', () => {
  const subs = [
    sub({ created_at: iso(100 * DAY) }),                                                       // open, 100d
    sub({ created_at: iso(60 * DAY), status: 'canceled', current_period_end: iso(5 * DAY) }),   // ended Sep 4 (inside 30d AND this month), tenure 55d
    sub({ created_at: iso(5 * DAY) }),                                                         // added this month (Sep 4), tenure 5d
  ];
  const t = buildTrajectory({ subs, now: NOW, weeks: 8 });
  assert.equal(t.summary.activeNow, 2);
  assert.equal(t.summary.active30dAgo, 2, 'the first two were open 30 days ago');
  assert.equal(t.summary.churnRate30dPct, 50, '1 ended of the 2 that were open');
  assert.equal(t.summary.addsThisMonth, 1);
  assert.equal(t.summary.endedThisMonth, 1);
  assert.equal(t.summary.medianTenureDays, 55);
  // A close in the previous calendar month is inside the 30-day window but not "this month".
  const t2 = buildTrajectory({ subs: [sub({ created_at: iso(60 * DAY), status: 'canceled', current_period_end: iso(10 * DAY) })], now: NOW, weeks: 8 });
  assert.equal(t2.summary.endedThisMonth, 0, 'Aug 30 is not September');
  assert.equal(t2.summary.churnRate30dPct, 100);
  assert.equal(t.summary.totalEverSubscribed, 3);
  assert.equal(t.firstSubAt, iso(100 * DAY));
});

test('empty input is an honest zero, never a fabricated series', () => {
  const t = buildTrajectory({ now: NOW });
  assert.equal(t.weeks.length, TRAJECTORY_WEEKS);
  assert.ok(t.weeks.every((w) => w.active === 0 && w.added === 0 && w.ended === 0 && w.mrrNetCents === 0 && w.oneTimeCents === 0));
  assert.equal(t.firstSubAt, null);
  assert.equal(t.summary.churnRate30dPct, null);
  assert.equal(t.summary.medianTenureDays, null);
});

test('a custom fee cut is used for net MRR', () => {
  const t = buildTrajectory({ subs: [sub({ created_at: iso(DAY), price_cents: 10000, fee_bps: 2000 })], now: NOW, weeks: 2, cutCents: (p, bps) => p - Math.round(p * bps / 10000) });
  assert.equal(t.weeks[1].mrrNetCents, 8000);
});

// ── Headcounts are people, not rows (Codex review on #2020) ─────────────────
// Nothing in the schema stops one client holding several subscription rows
// under one provider — a plan change, a re-subscribe, a duplicated checkout.
// Counting rows and labelling them "clients" inflated every headcount against
// the roster, which groups by client_id, so the two disagreed on one screen.

test('two concurrent rows for one client are one active client', () => {
  const t = buildTrajectory({
    subs: [
      sub({ client_id: 'u1', created_at: iso(90 * DAY) }),
      sub({ client_id: 'u1', created_at: iso(40 * DAY) }), // a plan change, same person
      sub({ client_id: 'u2', created_at: iso(30 * DAY) }),
    ],
    now: NOW,
  });
  assert.equal(t.summary.activeNow, 2, 'two people, three rows');
  assert.equal(t.summary.totalEverSubscribed, 2, 'people');
  assert.equal(t.summary.totalSpans, 3, 'and the span count kept separately');
  assert.equal(t.weeks[t.weeks.length - 1].active, 2);
});

test('a mid-membership plan change is not a new client', () => {
  const t = buildTrajectory({
    subs: [
      sub({ client_id: 'u1', created_at: iso(200 * DAY) }),
      sub({ client_id: 'u1', created_at: iso(3 * DAY) }), // opened this month, already a client
    ],
    now: NOW,
  });
  assert.equal(t.summary.addsThisMonth, 0, 'they were already a client the instant before');
  assert.equal(t.summary.activeNow, 1);
});

test('closing one row while another stays open is not a departure', () => {
  const t = buildTrajectory({
    subs: [
      // the old row ended three days ago…
      sub({ client_id: 'u1', status: 'canceled', created_at: iso(200 * DAY), current_period_end: iso(3 * DAY) }),
      // …because this one replaced it a week ago
      sub({ client_id: 'u1', created_at: iso(7 * DAY) }),
    ],
    now: NOW,
  });
  assert.equal(t.summary.endedThisMonth, 0, 'they hold an open span at the end of the window');
  assert.equal(t.summary.activeNow, 1);
});

test('a genuine departure still counts once, however many rows closed', () => {
  const t = buildTrajectory({
    subs: [
      sub({ client_id: 'u1', status: 'canceled', created_at: iso(200 * DAY), current_period_end: iso(4 * DAY) }),
      sub({ client_id: 'u1', status: 'canceled', created_at: iso(100 * DAY), current_period_end: iso(4 * DAY) }),
    ],
    now: NOW,
  });
  assert.equal(t.summary.endedThisMonth, 1, 'one person left, not two');
  assert.equal(t.summary.activeNow, 0);
});

test('a row with no client_id is its own identity, never merged', () => {
  const t = buildTrajectory({
    subs: [
      sub({ client_id: null, created_at: iso(30 * DAY) }),
      sub({ client_id: undefined, created_at: iso(20 * DAY) }),
    ],
    now: NOW,
  });
  assert.equal(t.summary.activeNow, 2, 'two ungroupable rows are two, not one');
});

test('median tenure is still measured over spans, and totalSpans is its denominator', () => {
  const t = buildTrajectory({
    subs: [
      sub({ client_id: 'u1', status: 'canceled', created_at: iso(100 * DAY), current_period_end: iso(90 * DAY) }),
      sub({ client_id: 'u1', created_at: iso(10 * DAY) }),
    ],
    now: NOW,
  });
  assert.equal(t.summary.totalEverSubscribed, 1, 'one person');
  assert.equal(t.summary.totalSpans, 2, 'two memberships');
  // Two spans of ~10 days each — a per-PERSON reading would have been ~100.
  assert.ok(t.summary.medianTenureDays <= 12, `spans, not people: ${t.summary.medianTenureDays}`);
});

// ── The sweep after #2394 round 10: today's figures are the series' latest point, by its rule ──
test('openSubsAt and practiceToday are the latest week, from the same rows: a retrying payment counts, a cancelled or abandoned one does not', () => {
  const future = new Date(NOW + 20 * DAY).toISOString();
  const rows = [
    sub({ client_id: 'a', created_at: iso(40 * DAY), fee_bps: 0 }),
    sub({ client_id: 'a', created_at: iso(10 * DAY), price_cents: 5000 }),            // a's second plan: one client
    sub({ client_id: 'b', created_at: iso(30 * DAY), status: 'past_due' }),            // retrying: still a client
    sub({ client_id: 'c', created_at: iso(20 * DAY), status: 'trialing' }),
    sub({ client_id: 'd', created_at: iso(50 * DAY), status: 'canceled', current_period_end: future }), // paid through, but gone
    sub({ client_id: 'e', created_at: iso(5 * DAY), status: 'incomplete' }),            // never a client
    sub({ client_id: 'f', created_at: iso(60 * DAY), status: 'unpaid' }),               // closed
    sub({ client_id: null, created_at: iso(15 * DAY) }),                                // stands alone
    sub({ client_id: 'g', created_at: null }),                                          // no span at all
    sub({ client_id: 'h', created_at: new Date(NOW + DAY).toISOString() }),             // not open yet
  ];
  const last = buildTrajectory({ subs: rows, now: NOW }).weeks.slice(-1)[0];
  const open = openSubsAt(rows, NOW);
  assert.deepEqual(open.map((r) => r.client_id), ['a', 'a', 'b', 'c', null]);
  const today = practiceToday(rows, { now: NOW });
  assert.deepEqual(today, { clients: last.active, mrrGrossCents: last.mrrGrossCents, mrrNetCents: last.mrrNetCents });
  assert.deepEqual(today, { clients: 4, mrrGrossCents: 18000 * 4 + 5000, mrrNetCents: 18000 + 4250 + 15300 * 3 });
  // A route's own cut is used for the net, as buildTrajectory uses it.
  const cut = (p, bps) => p - Math.round(p * (bps == null ? 1500 : bps) / 10000) - 1;
  assert.equal(practiceToday(rows, { now: NOW, cutCents: cut }).mrrNetCents, buildTrajectory({ subs: rows, now: NOW, cutCents: cut }).weeks.slice(-1)[0].mrrNetCents);
  // The statuses a read asks for are the ones the series keeps open (membership-core.ts ACTIVE_SUB).
  assert.deepEqual(OPEN_SUB_STATUSES, ['active', 'trialing', 'past_due']);
  assert.deepEqual(practiceToday([], { now: NOW }), { clients: 0, mrrGrossCents: 0, mrrNetCents: 0 });
});

// ── The sweep after #2394 round 10: each ended plan is decided when it ended (at its week's close) ──
test('subDeparture: a departure unless another of the client\'s plans was open at the close of its week', () => {
  const ended = (o) => sub({ client_id: 'u1', status: 'canceled', created_at: iso(200 * DAY), current_period_end: iso(40 * DAY), ...o });
  const row = ended({ id: 'r1' });
  // Left 40 days ago, came back 10 days ago: still a departure, and the series counts it too.
  const back = sub({ id: 'r2', client_id: 'u1', created_at: iso(10 * DAY) });
  assert.deepEqual(subDeparture(row, [row, back], NOW), { endedAt: NOW - 40 * DAY, departed: true });
  const t = buildTrajectory({ subs: [row, back], now: NOW, weeks: 12 });
  assert.equal(t.weeks.reduce((s, w) => s + w.ended, 0), 1, 'the series counts the same departure');
  // Another plan opened before the end and still open: not a departure.
  assert.equal(subDeparture(row, [row, sub({ id: 'r3', client_id: 'u1', created_at: iso(50 * DAY) })], NOW).departed, false);
  // …opened the very instant it ended: not a departure either (a plan change).
  assert.equal(subDeparture(row, [row, sub({ id: 'r3', client_id: 'u1', created_at: iso(40 * DAY) })], NOW).departed, false);
  // …open across it and closed since: still not a departure then.
  assert.equal(subDeparture(row, [row, ended({ id: 'r3', created_at: iso(100 * DAY), current_period_end: iso(5 * DAY) })], NOW).departed, false);
  // …retrying (past_due) is open, as the series counts it.
  assert.equal(subDeparture(row, [row, sub({ id: 'r3', client_id: 'u1', status: 'past_due', created_at: iso(100 * DAY) })], NOW).departed, false);
  // Two plans ending at the same moment: each one ended the membership (one departure on the page).
  const twin = ended({ id: 'r4', created_at: iso(150 * DAY) });
  assert.deepEqual([subDeparture(row, [row, twin], NOW).departed, subDeparture(twin, [row, twin], NOW).departed], [true, true]);
  // Not another client's plan, and not a checkout that never started.
  assert.equal(subDeparture(row, [row, sub({ id: 'r5', client_id: 'u2', created_at: iso(100 * DAY) })], NOW).departed, true);
  assert.equal(subDeparture(row, [row, sub({ id: 'r6', client_id: 'u1', status: 'incomplete', created_at: iso(100 * DAY) })], NOW).departed, true);
  // The row itself, read again with an older status (it was active when the history was read),
  // does not vouch for itself.
  assert.equal(subDeparture(row, [{ ...row, status: 'active' }], NOW).departed, true);
  // A row with no client has no other plan to hold.
  assert.equal(subDeparture(ended({ id: 'r7', client_id: null }), [sub({ id: 'r8', client_id: null, created_at: iso(100 * DAY) })], NOW).departed, true);
});

test('subDeparture: the end is the series\' own close, clamped to now; a plan that has not ended is no departure', () => {
  // Cancelled mid-period: the period end is in the future, the departure is now.
  assert.deepEqual(subDeparture(sub({ client_id: 'u1', status: 'canceled', created_at: iso(90 * DAY), current_period_end: iso(-20 * DAY) }), [], NOW), { endedAt: NOW, departed: true });
  // A close before its open is read as the open, as the series reads it.
  assert.equal(subDeparture(sub({ client_id: 'u1', status: 'canceled', created_at: iso(10 * DAY), current_period_end: iso(20 * DAY) }), [], NOW).endedAt, NOW - 10 * DAY);
  // 'unpaid' and 'paused' close the span; open and never-started rows have not ended.
  for (const status of ['unpaid', 'paused']) assert.equal(subDeparture(sub({ client_id: 'u1', status, created_at: iso(90 * DAY), current_period_end: iso(DAY) }), [], NOW).departed, true, status);
  for (const status of ['active', 'trialing', 'past_due', 'incomplete']) assert.deepEqual(subDeparture(sub({ client_id: 'u1', status, created_at: iso(90 * DAY), current_period_end: iso(DAY) }), [], NOW), { endedAt: null, departed: false }, status);
  // The routes' churn read takes every status but these: the series' closed set.
  assert.deepEqual(NOT_ENDED_STATUSES, ['active', 'trialing', 'past_due', 'incomplete', 'incomplete_expired']);
});

// ── Its review: the moment is the close of the ISO week the plan ended in, as leftIn judges it ──
// Judged at the instant a plan ended, a client whose card failed on a Monday and who re-subscribed
// on the Thursday was a departure in the churn list and none in the series (leftIn asks who holds
// no plan at the end of the week), so the pace said no one left while the list said one did.
const week = (t, at) => t.weeks.find((w) => w.weekOf === at);
test('subDeparture: a client back later the same week has not left that week, as the series counts it', () => {
  const now = Date.UTC(2026, 9, 16, 12); // Friday 2026-10-16, the review's moment
  const others = Array.from({ length: 5 }, (_, i) => sub({ id: 'o' + i, client_id: 'o' + i, created_at: '2026-01-05T00:00:00Z' }));
  // The review's case: x's plan ends Monday 2026-09-14 10:00, a new one starts Thursday 2026-09-17.
  const gone = sub({ id: 'x1', client_id: 'x', status: 'unpaid', created_at: '2026-03-02T00:00:00Z', current_period_end: '2026-09-14T10:00:00Z' });
  const back = sub({ id: 'x2', client_id: 'x', created_at: '2026-09-17T09:00:00Z' });
  let subs = [...others, gone, back];
  assert.equal(week(buildTrajectory({ subs, now, weeks: 26 }), '2026-09-14').ended, 0, 'the series: no one left that week');
  assert.deepEqual(subDeparture(gone, subs, now), { endedAt: Date.parse('2026-09-14T10:00:00Z'), departed: false });
  // Back the next Monday instead: a week ended with no plan, a departure in both.
  subs = [...others, gone, { ...back, created_at: '2026-09-21T09:00:00Z' }];
  assert.equal(week(buildTrajectory({ subs, now, weeks: 26 }), '2026-09-14').ended, 1);
  assert.equal(subDeparture(gone, subs, now).departed, true);
  // Back at the week's last instant (Sunday 23:59:59.999): still that week, open at its close.
  subs = [...others, gone, { ...back, created_at: '2026-09-20T23:59:59.999Z' }];
  assert.equal(week(buildTrajectory({ subs, now, weeks: 26 }), '2026-09-14').ended, 0);
  assert.equal(subDeparture(gone, subs, now).departed, false);
});

test('subDeparture: plans one client ended inside one week are each a departure when nothing is open at its close', () => {
  const now = Date.UTC(2026, 9, 16, 12);
  // Left on the Monday, back on the Tuesday, left again on the Wednesday: the series counts one.
  const mon = sub({ id: 'x1', client_id: 'x', status: 'canceled', created_at: '2026-03-02T00:00:00Z', current_period_end: '2026-09-14T10:00:00Z' });
  const wed = sub({ id: 'x2', client_id: 'x', status: 'canceled', created_at: '2026-09-15T08:00:00Z', current_period_end: '2026-09-16T18:00:00Z' });
  let subs = [mon, wed];
  assert.equal(week(buildTrajectory({ subs, now, weeks: 26 }), '2026-09-14').ended, 1);
  assert.deepEqual([subDeparture(mon, subs, now).departed, subDeparture(wed, subs, now).departed], [true, true], 'both ended in that week; the page makes them one');
  // Two plans held together, one ending on the Monday, the other on the Wednesday, nothing after:
  // at the week's close neither is open, so the Monday plan's money left that week too.
  const held = sub({ id: 'x3', client_id: 'x', status: 'canceled', created_at: '2026-04-06T00:00:00Z', current_period_end: '2026-09-16T18:00:00Z' });
  subs = [mon, held];
  assert.equal(week(buildTrajectory({ subs, now, weeks: 26 }), '2026-09-14').ended, 1);
  assert.deepEqual([subDeparture(mon, subs, now).departed, subDeparture(held, subs, now).departed], [true, true]);
  // …and when the other plan runs past the week's close, the Monday one is no departure.
  subs = [mon, { ...held, current_period_end: '2026-09-23T18:00:00Z' }];
  assert.equal(subDeparture(mon, subs, now).departed, false);
});

test('subDeparture: the current week is judged at now, as the series measures it', () => {
  const now = Date.UTC(2026, 9, 16, 12); // its week opened Monday 2026-10-12
  const mon = sub({ id: 'x1', client_id: 'x', status: 'canceled', created_at: '2026-03-02T00:00:00Z', current_period_end: '2026-10-12T10:00:00Z' });
  // Back on the Thursday: not a departure, and the series' current week has none.
  let subs = [mon, sub({ id: 'x2', client_id: 'x', created_at: '2026-10-15T09:00:00Z' })];
  assert.equal(buildTrajectory({ subs, now, weeks: 4 }).weeks.at(-1).ended, 0);
  assert.equal(subDeparture(mon, subs, now).departed, false);
  // Two plans cancelled mid-period both close at now (their period ends are in the future): each
  // is closed at now, so neither vouches for the other, and the series counts the client gone.
  const a = sub({ id: 'x3', client_id: 'y', status: 'canceled', created_at: '2026-03-02T00:00:00Z', current_period_end: '2026-11-02T00:00:00Z' });
  const b = sub({ id: 'x4', client_id: 'y', status: 'canceled', created_at: '2026-05-04T00:00:00Z', current_period_end: '2026-11-04T00:00:00Z' });
  subs = [a, b];
  assert.equal(buildTrajectory({ subs, now, weeks: 4 }).weeks.at(-1).ended, 1);
  assert.deepEqual([subDeparture(a, subs, now), subDeparture(b, subs, now)].map((d) => [d.endedAt, d.departed]), [[now, true], [now, true]]);
});

// Every ended row, decided by subDeparture and counted once per client per week (as the page's
// departures counts them), against the series' weekly ended count, over generated histories.
test('subDeparture agrees with the series\' weekly ended count, week by week, over generated histories', () => {
  const now = Date.UTC(2026, 9, 16, 12);
  let seed = 20261018;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const STATUSES = ['active', 'trialing', 'past_due', 'canceled', 'canceled', 'unpaid', 'paused', 'incomplete', 'incomplete_expired'];
  for (let n = 0; n < 400; n++) {
    const subs = [];
    const rows = 1 + Math.floor(rand() * 7);
    for (let i = 0; i < rows; i++) {
      const start = now - Math.floor(rand() * 20 * WEEK);
      // Ends from just before its start (a data error) to a month past now (cancelled mid-period).
      const end = start - DAY + Math.floor(rand() * (now + 30 * DAY - start + DAY));
      subs.push(sub({ id: 'r' + i, client_id: pick(['a', 'a', 'b', 'c', null]), status: pick(STATUSES), created_at: new Date(start).toISOString(), current_period_end: new Date(end).toISOString() }));
    }
    const series = buildTrajectory({ subs, now, weeks: 30 });
    const left = new Map();
    subs.forEach((r, i) => {
      const d = subDeparture(r, subs, now);
      if (!d.departed) return;
      const at = new Date(mondayUTC(d.endedAt)).toISOString().slice(0, 10);
      if (!left.has(at)) left.set(at, new Set());
      left.get(at).add(r.client_id ?? 'row' + i);
    });
    for (const w of series.weeks) assert.equal(left.get(w.weekOf)?.size ?? 0, w.ended, `history ${n}, week of ${w.weekOf}: ${JSON.stringify(subs)}`);
  }
});
