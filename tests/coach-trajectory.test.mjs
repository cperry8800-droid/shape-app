// The practice-trajectory series (review 2026-09-09, R8) — driven with synthetic
// subscription and purchase rows so every bucket rule is pinned: a span opens at
// created_at and closes at its end date only when the status says it ended; a
// payment that is retrying stays counted; MRR uses each row's STORED fee; the
// current week is measured at "now"; the summary figures agree with the series.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTrajectory, mondayUTC, subEndedAt, subNeverStarted, TRAJECTORY_WEEKS } from '../src/lib/coach-trajectory.mjs';

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
