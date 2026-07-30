// Folding a session-shaped write into the week it lands in.
//
// The failure this file exists to prevent is data loss. The publish boundary
// REPLACES a client-week; handing it one session would delete every other
// session the coach had scheduled that week. These fixtures pin the merge that
// makes a session-shaped write safe to publish.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsMergeWeekSessions, bsWeekStartOf, bsGroupByWeek } from '../src/lib/week-merge.mjs';
import { normalizeWeekRequest } from '../src/lib/week-publish.mjs';

// Mon 2026-08-03 .. Sun 2026-08-09; "today" is the Monday.
const WEEK = '2026-08-03';
const TODAY = '2026-08-03';
const opts = { weekStartISO: WEEK, todayISO: TODAY };

const row = (date, title, payload = {}) => ({
  title, description: 'from the plan', kind: 'template', scheduled_date: date, payload,
});
const PAIR = { plannedMinutes: 60, plannedRpe: 7 };

test('merge: an incoming session is ADDED, and the existing week survives', () => {
  // The whole point. Publishing the incoming session alone would delete these.
  const out = bsMergeWeekSessions(
    [row('2026-08-04', 'Upper'), row('2026-08-06', 'Lower')],
    [{ title: 'Conditioning', kind: 'custom', scheduledDate: '2026-08-08', payload: {} }],
    opts,
  );
  assert.equal(out.sessions.length, 3);
  assert.deepEqual(out.sessions.map((s) => s.title), ['Upper', 'Lower', 'Conditioning']);
  assert.equal(out.carried, 2);
});

test('merge: sessions come back in date order regardless of arrival order', () => {
  const out = bsMergeWeekSessions(
    [row('2026-08-07', 'Fri'), row('2026-08-04', 'Tue')],
    [{ title: 'Wed', kind: 'custom', scheduledDate: '2026-08-05', payload: {} }],
    opts,
  );
  assert.deepEqual(out.sessions.map((s) => s.scheduledDate), ['2026-08-04', '2026-08-05', '2026-08-07']);
});

test('merge: same day + same title REPLACES, it does not stack', () => {
  // A retry, or the same workout dragged onto the same day twice, is one
  // session. Stacking would double that day's load and trip the guardrail on
  // work the coach never scheduled.
  const out = bsMergeWeekSessions(
    [row('2026-08-04', 'Upper', { note: 'old' })],
    [{ title: 'Upper', kind: 'custom', scheduledDate: '2026-08-04', payload: { note: 'new' } }],
    opts,
  );
  assert.equal(out.sessions.length, 1);
  assert.equal(out.sessions[0].payload.note, 'new');
});

test('merge: two DIFFERENT sessions on one day both stand', () => {
  const out = bsMergeWeekSessions(
    [row('2026-08-04', 'AM row')],
    [{ title: 'PM squat', kind: 'custom', scheduledDate: '2026-08-04', payload: {} }],
    opts,
  );
  assert.equal(out.sessions.length, 2);
});

test('merge: rows OUTSIDE the target week are ignored on both sides', () => {
  // A week publish may only carry its own week; a stray row would fail the
  // whole request rather than be silently rescheduled.
  const out = bsMergeWeekSessions(
    [row('2026-07-30', 'Last week'), row('2026-08-04', 'This week'), row('2026-08-12', 'Next week')],
    [{ title: 'Also next week', kind: 'custom', scheduledDate: '2026-08-13', payload: {} }],
    opts,
  );
  assert.deepEqual(out.sessions.map((s) => s.title), ['This week']);
});

test('merge: PAST rows are never resubmitted, and are reported', () => {
  // The boundary refuses a past-dated session and its replace only clears
  // FUTURE rows, so a past row is not ours to rewrite. Carrying it would fail
  // the entire week on `past_session` — one logged Monday killing the publish.
  const out = bsMergeWeekSessions(
    [row('2026-08-03', 'Mon done'), row('2026-08-06', 'Thu ahead')],
    [{ title: 'Sat add', kind: 'custom', scheduledDate: '2026-08-08', payload: {} }],
    { weekStartISO: WEEK, todayISO: '2026-08-05' },
  );
  assert.deepEqual(out.sessions.map((s) => s.title), ['Thu ahead', 'Sat add']);
  assert.equal(out.skippedPast, 1);
});

test('merge: TODAY is not past — the boundary refuses history, not the present', () => {
  const out = bsMergeWeekSessions(
    [row('2026-08-05', 'Today')],
    [],
    { weekStartISO: WEEK, todayISO: '2026-08-05' },
  );
  assert.deepEqual(out.sessions.map((s) => s.title), ['Today']);
  assert.equal(out.skippedPast, 0);
});

test('merge: a fully-paired merged week declares per_session', () => {
  const out = bsMergeWeekSessions(
    [row('2026-08-04', 'Upper', { ...PAIR })],
    [{ title: 'Lower', kind: 'custom', scheduledDate: '2026-08-06', payload: { ...PAIR } }],
    opts,
  );
  assert.equal(out.capture, 'per_session');
  for (const s of out.sessions) {
    assert.equal(s.loadCapture, 'per_session');
    assert.equal(s.plannedMinutes, 60);
  }
});

test('merge: the pair survives a NORMALIZE-SHAPED incoming session', () => {
  // ⚠ THE REGRESSION THIS FILE MISSED. Every fixture above hands the merge its
  // incoming pair inside `payload`, but that is the DB row's shape — NOT the
  // shape `/api/trainer/week` passes. `normalizeWeekRequest` type-checks the pair
  // onto the TOP LEVEL of each session it emits, and the merge read `payload`
  // alone, so the primary mobile assignment path stripped every newly authored
  // pair, recomputed `capture` as undefined, and published `incomplete_week` →
  // `unknown` — which §7.5 says never blocks. The guardrail switching itself off.
  //
  // Fed the REAL normalizer output rather than a hand-written imitation of it, so
  // the two modules' contract is pinned end to end and cannot drift apart again.
  const norm = normalizeWeekRequest({
    clientId: '11111111-1111-4111-8111-111111111111',
    weekStartISO: WEEK,
    idempotencyKey: '22222222-2222-4222-8222-222222222222',
    capture: 'per_session',
    sessions: [{
      title: 'Lower', scheduledDate: '2026-08-06',
      plannedMinutes: 60, plannedRpe: 7, loadCapture: 'per_session',
    }],
  }, { todayISO: TODAY });
  assert.equal(norm.ok, true);
  // The shape the bug depended on: pair up top, payload empty.
  assert.equal(norm.week.sessions[0].plannedMinutes, 60);
  assert.deepEqual(norm.week.sessions[0].payload, {});

  const out = bsMergeWeekSessions([], norm.week.sessions, opts);
  assert.equal(out.capture, 'per_session');
  assert.equal(out.sessions[0].plannedMinutes, 60);
  assert.equal(out.sessions[0].plannedRpe, 7);
  assert.equal(out.sessions[0].loadCapture, 'per_session');
});

test('merge: a top-level pair wins over a stale one in the payload', () => {
  // Both shapes can arrive on one object once a normalized session carries a
  // payload of its own. The normalizer's type-checked value is the authored one.
  const out = bsMergeWeekSessions(
    [],
    [{
      title: 'Lower', kind: 'custom', scheduledDate: '2026-08-06',
      plannedMinutes: 75, plannedRpe: 8,
      payload: { plannedMinutes: 60, plannedRpe: 7 },
    }],
    opts,
  );
  assert.equal(out.capture, 'per_session');
  assert.equal(out.sessions[0].plannedMinutes, 75);
  assert.equal(out.sessions[0].plannedRpe, 8);
});

test('merge: a CARRIED session with no pair makes the merged week unstamped', () => {
  // The rule judged over the merged week, which is the point of merging. The
  // week genuinely is not fully measured; declaring it captured would put a hole
  // in a week that claims completeness — the malformed case that turns the whole
  // evaluation `unknown` and switches the guardrail off (F158).
  const out = bsMergeWeekSessions(
    [row('2026-08-04', 'Upper')],
    [{ title: 'Lower', kind: 'custom', scheduledDate: '2026-08-06', payload: { ...PAIR } }],
    opts,
  );
  assert.equal(out.capture, undefined);
  for (const s of out.sessions) {
    assert.equal(s.loadCapture, undefined);
    assert.equal('plannedMinutes' in s, false);
  }
});

test('merge: a null-valued pair is ABSENCE, never a zero', () => {
  const out = bsMergeWeekSessions(
    [row('2026-08-04', 'Upper', { plannedMinutes: null, plannedRpe: null })],
    [],
    opts,
  );
  assert.equal(out.capture, undefined);
});

test('merge: an empty week produces no sessions and no stamp', () => {
  const out = bsMergeWeekSessions([], [], opts);
  assert.deepEqual(out.sessions, []);
  assert.equal(out.capture, undefined);
});

test('merge: junk in cannot produce a junk week', () => {
  const out = bsMergeWeekSessions(
    [null, 'nope', { scheduled_date: 'not-a-date' }, row('2026-08-04', 'Real')],
    [null, { scheduledDate: '' }],
    opts,
  );
  assert.deepEqual(out.sessions.map((s) => s.title), ['Real']);
});

test('bsWeekStartOf: a calendar-impossible date is refused, not rolled forward', () => {
  // `Date.UTC(2026, 1, 30)` does NOT return NaN — it rolls Feb 30 into March 2.
  // So the NaN check alone let an impossible date be bucketed into the week of
  // March 2, a week nobody authored, and the publish boundary REPLACES the week
  // it is given. The round-trip is the only check that catches day overflow.
  assert.equal(bsWeekStartOf('2026-02-30'), null);
  assert.equal(bsWeekStartOf('2025-02-29'), null);   // not a leap year
  assert.equal(bsWeekStartOf('2026-04-31'), null);
  assert.equal(bsWeekStartOf('2026-13-01'), null);   // NaN path, still refused
  assert.equal(bsWeekStartOf('2026-00-10'), null);
  // A real leap day still resolves — the guard must not over-refuse.
  assert.equal(bsWeekStartOf('2028-02-29'), '2028-02-28');
  // And the grouping built on it drops the impossible row rather than
  // publishing it into an invented week.
  assert.equal(bsGroupByWeek([{ scheduledDate: '2026-02-30' }]).size, 0);
});

test('bsWeekStartOf: every day of a week maps to its Monday', () => {
  for (const d of ['2026-08-03', '2026-08-04', '2026-08-06', '2026-08-09']) {
    assert.equal(bsWeekStartOf(d), '2026-08-03', d);
  }
  assert.equal(bsWeekStartOf('2026-08-10'), '2026-08-10');
  assert.equal(bsWeekStartOf('nope'), null);
});

test('bsGroupByWeek: a multi-week program splits into one entry per week', () => {
  // dashBuilder authors whole programs; each week is a separate publish, and a
  // session in the wrong group would be caught in the wrong week's replace.
  const g = bsGroupByWeek([
    { scheduledDate: '2026-08-04' },
    { scheduledDate: '2026-08-06' },
    { scheduledDate: '2026-08-11' },
  ]);
  assert.deepEqual([...g.keys()].sort(), ['2026-08-03', '2026-08-10']);
  assert.equal(g.get('2026-08-03').length, 2);
  assert.equal(g.get('2026-08-10').length, 1);
});

test('bsGroupByWeek: an undated session belongs to no week', () => {
  // A weekly-repeat template has no date, so it has no week — it cannot be
  // published through the week boundary and must not be silently placed in one.
  const g = bsGroupByWeek([{ scheduledDate: null }, { scheduledDate: '' }, {}]);
  assert.equal(g.size, 0);
});
