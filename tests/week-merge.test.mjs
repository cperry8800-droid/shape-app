// Folding a session-shaped write into the week it lands in.
//
// The failure this file exists to prevent is data loss. The publish boundary
// REPLACES a client-week; handing it one session would delete every other
// session the coach had scheduled that week. These fixtures pin the merge that
// makes a session-shaped write safe to publish.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsMergeWeekSessions, bsWeekStartOf, bsGroupByWeek } from '../src/lib/week-merge.mjs';

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
