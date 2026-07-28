// §9.5 — the guardrail's universe. Owner ruling 2026-07-28.
//
// Device-imported sessions are outside the guardrail entirely: not in the
// numerator, not in the denominator, not scored, not gap-breaking. An unrated
// IN-APP session was asked and not answered (a behavioural signal, and §3.1 is
// right to count it); a device import was never promptable, so it is
// structurally unratable rather than electively unrated.
//
// EVERY FIXTURE HERE IS BUILT TO FAIL WITHOUT THE RULE. Where the rule is what
// changes the verdict, the test asserts BOTH sides — the scoped answer and the
// answer the same rows produce when the out-of-scope ones are stamped in-app.
// A fixture that passes either way would be decoration.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bsSessionInScope,
  bsScopeSessions,
  bsBucketWeeks,
  bsWeekLoad,
  bsBaseline,
  bsHistoryGap,
  bsResolveRegime,
  BS_SESSION_SOURCES_IN_SCOPE,
  BS_SESSION_STATUSES_IN_SCOPE,
} from '../public/newdesign/progressionGuardrail.mjs';

const TODAY = '2026-07-30';              // Thursday -> current Monday 2026-07-27
const WEEKS = ['2026-07-06', '2026-07-13', '2026-07-20'];  // three COMPLETE weeks in reach

// An in-app session the member was asked to rate, and did. 8 x 25min = 200 AU.
const inApp = (date, hour = 9, over = {}) => ({
  startedAtISO: `${date}T${String(hour).padStart(2, '0')}:00:00Z`,
  timezone: 'UTC',
  durationSec: 1500,
  sessionRpe: 8,
  source: 'shape_app',
  status: 'completed',
  ...over,
});

// A watch sync: real duration, no rating, and no rating was ever possible.
const synced = (date, hour = 18, over = {}) => ({
  startedAtISO: `${date}T${String(hour).padStart(2, '0')}:00:00Z`,
  timezone: 'UTC',
  durationSec: 3600,
  sessionRpe: null,
  source: 'strava',
  status: 'completed',
  ...over,
});

const dayIn = (weekStart, offset) => {
  const ms = Date.parse(`${weekStart}T00:00:00Z`) + offset * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
};

// ─── The scope predicate itself ─────────────────────────────────────────────

test('scope: the source list is an ALLOWLIST, so an unrecognised source is OUT', () => {
  // The blocklist alternative silently admits the next device value someone
  // adds to the CHECK constraint. This asserts the failure DIRECTION, which is
  // the whole reason the allowlist was chosen.
  assert.equal(bsSessionInScope(inApp('2026-07-06')), true);
  assert.equal(bsSessionInScope(synced('2026-07-06')), false);
  for (const s of ['apple_watch', 'apple_health', 'wear_os', 'whoop', 'garmin', 'strava']) {
    assert.equal(bsSessionInScope(inApp('2026-07-06', 9, { source: s })), false, `${s} must be out`);
  }
  // A source nobody has invented yet is out WITHOUT anyone editing this file.
  assert.equal(bsSessionInScope(inApp('2026-07-06', 9, { source: 'ring_v3' })), false);
  assert.deepEqual(BS_SESSION_SOURCES_IN_SCOPE, ['shape_app', 'shape_session']);
});

test('scope: `manual` is OUT — deferred deliberately, not overlooked', () => {
  // A hand-entered past workout was not prompted at the time either, so it
  // fails the same test the ruling turns on. If a manual-entry form ever ships
  // WITH an RPE field this is the line that has to change, on purpose.
  assert.equal(bsSessionInScope(inApp('2026-07-06', 9, { source: 'manual' })), false);
});

test('scope: only work that HAPPENED — and `reviewed` counts as happened', () => {
  assert.equal(bsSessionInScope(inApp('2026-07-06', 9, { status: 'completed' })), true);
  // A coach opening a session must never remove it from that client's baseline.
  assert.equal(bsSessionInScope(inApp('2026-07-06', 9, { status: 'reviewed' })), true);
  for (const st of ['planned', 'active', 'abandoned']) {
    assert.equal(bsSessionInScope(inApp('2026-07-06', 9, { status: st })), false, `${st} must be out`);
  }
  assert.deepEqual(BS_SESSION_STATUSES_IN_SCOPE, ['completed', 'reviewed']);
});

test('scope: an ABSENT discriminator is IN scope (the opposite call from malformed)', () => {
  // Both columns are `not null default`, so the DB cannot emit a null one. An
  // absent field means an RPC predating this contract — and under such an RPC
  // every row is in-app anyway, because one writer exists. Reading absence as
  // out-of-scope would vanish an entire history on a contract regression.
  const bare = { startedAtISO: '2026-07-06T09:00:00Z', timezone: 'UTC', durationSec: 1500, sessionRpe: 8 };
  assert.equal(bsSessionInScope(bare), true);
  assert.equal(bsSessionInScope({ ...bare, source: null, status: null }), true);
});

test('scope: a JUNK row stays IN, so the malformed report still names it', () => {
  // Scope is not the place to report a caller bug. Swallowing junk here would
  // hide the very rows §13.8's malformed report exists to surface — and a
  // silently-dropped malformed row is how the guardrail goes quiet.
  assert.equal(bsSessionInScope(null), true);
  assert.equal(bsSessionInScope('nonsense'), true);
  assert.equal(bsSessionInScope({}), true);
  const { malformed } = bsBucketWeeks([null, inApp('2026-07-06')]);
  assert.ok(malformed.length > 0, 'a junk row must still be reported malformed');
});

test('scope: filtering is idempotent, so every entry point can apply it', () => {
  const rows = [inApp('2026-07-06'), synced('2026-07-06'), inApp('2026-07-07')];
  const once = bsScopeSessions(rows);
  assert.deepEqual(bsScopeSessions(once), once);
  assert.equal(once.length, 2);
  assert.equal(bsScopeSessions('not an array'), 'not an array');
});

// ─── FIXTURE 1 — the pinning hazard ─────────────────────────────────────────

test('FIXTURE: a watch-wearing client with mixed in-app and synced sessions reaches MEASURED', () => {
  // Three complete weeks, each: 3 rated in-app sessions (200 AU each -> 600/wk)
  // plus 3 watch syncs. §3.1 qualifies a week as `measured` only when strictly
  // MORE THAN HALF of its non-excluded sessions carry a rating — so counting
  // the syncs makes it 3-of-6, which is not more than half, and the client is
  // pinned in cold_start by their own sync.
  const history = [];
  for (const wk of WEEKS) {
    for (let d = 0; d < 3; d++) history.push(inApp(dayIn(wk, d)));
    for (let d = 0; d < 3; d++) history.push(synced(dayIn(wk, d)));
  }

  const regime = bsResolveRegime(history, TODAY);
  assert.equal(regime.regime, 'measured', 'the syncs must not dilute the rated share');
  assert.equal(regime.baselineAu, 600, 'the baseline is the in-app load only');
  assert.equal(regime.baseline.weeks, 3);

  // THE PROOF THE RULE IS LOAD-BEARING: identical rows, syncs restamped in-app.
  const asIfInApp = history.map((s) => ({ ...s, source: 'shape_app' }));
  const without = bsResolveRegime(asIfInApp, TODAY);
  assert.equal(without.regime, 'cold_start', 'without the scope rule the client IS pinned');
  assert.equal(without.baseline.reason, 'no_qualifying_weeks');
});

test('FIXTURE: a history of ONLY device syncs reads `no_history`, not `no_qualifying_weeks`', () => {
  // The honest reason. `no_qualifying_weeks` would tell a coach we looked at
  // weeks that never entered the universe in the first place.
  const b = bsBaseline(WEEKS.flatMap((wk) => [synced(dayIn(wk, 0)), synced(dayIn(wk, 1))]), TODAY);
  assert.equal(b.basis, 'none');
  assert.equal(b.reason, 'no_history');
});

// ─── FIXTURE 2 — the double-count hazard ────────────────────────────────────

test('FIXTURE: one workout logged in-app AND synced from Strava is counted once', () => {
  // Same client, same day, same session — one row written by the app, one by
  // the sync. There is no dedupe pass and none is needed: the sync copy never
  // enters, so it cannot add a second contribution.
  const day = dayIn(WEEKS[0], 1);
  const both = bsBucketWeeks([inApp(day, 9), synced(day, 9)]);
  assert.equal(both.weeks.length, 1);
  assert.equal(both.weeks[0].loadAu, 200, 'the sync copy must not add load');
  assert.equal(both.weeks[0].eligible, 1, 'and must not enter the denominator');
  assert.equal(both.weeks[0].rated, 1);

  // Same rows, sync restamped in-app: now it double-counts the denominator and
  // the week stops qualifying. That is the behaviour the rule prevents.
  const asIfInApp = bsBucketWeeks([inApp(day, 9), synced(day, 9, { source: 'shape_app' })]);
  assert.equal(asIfInApp.weeks[0].eligible, 2);
  assert.equal(asIfInApp.weeks[0].measured, false);
});

// ─── FIXTURE 3 — prescribed work is not performed work ──────────────────────

test('FIXTURE: a scheduled FUTURE session is excluded from history', () => {
  // A `planned` row is prescribed work. Admitting it would inflate demonstrated
  // capacity and loosen every future ceiling — the expensive direction.
  const future = inApp('2026-08-05', 9, { status: 'planned', durationSec: 5400 });
  const history = WEEKS.flatMap((wk) => [inApp(dayIn(wk, 0)), inApp(dayIn(wk, 1)), inApp(dayIn(wk, 2))]);

  const withPlan = bsResolveRegime([...history, future], TODAY);
  const without = bsResolveRegime(history, TODAY);
  assert.equal(withPlan.regime, 'measured');
  assert.equal(withPlan.baselineAu, without.baselineAu, 'a planned row changes no number');
  assert.equal(withPlan.gapDays, without.gapDays, 'and cannot pull the gap forward');

  // The bucketing never even materialises the future week.
  const { weeks } = bsBucketWeeks([...history, future]);
  assert.ok(!weeks.some((w) => w.weekStartISO === '2026-08-03'), 'no week for a planned session');
});

test('FIXTURE: completed and scheduled in the SAME week — only the completed one scores', () => {
  // The mixed week is the case a date-only filter would miss.
  const day = dayIn(WEEKS[0], 1);
  const { weeks } = bsBucketWeeks([
    inApp(day, 9),                                                  // 200 AU, performed
    inApp(day, 17, { status: 'planned', durationSec: 3600, sessionRpe: 9 }),  // 540 AU, prescribed
  ]);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].loadAu, 200, 'the prescribed session contributes no load');
  assert.equal(weeks[0].eligible, 1);
  assert.equal(weeks[0].hardestAu, 200, 'nor can it become the hardest logged session');
});

// ─── Not gap-breaking ───────────────────────────────────────────────────────

test('FIXTURE: a device sync does NOT reset the return-regime clock', () => {
  // The `return` regime exists to relax ceilings for someone coming back after
  // a real layoff. A watch sync is not evidence they trained in the sense this
  // guardrail measures, so it must not close the gap and quietly deny them it.
  const history = WEEKS.flatMap((wk) => [inApp(dayIn(wk, 0)), inApp(dayIn(wk, 1)), inApp(dayIn(wk, 2))]);
  const lastInApp = dayIn(WEEKS[2], 2);           // 2026-07-22
  const later = [...history, synced('2026-09-10')]; // a sync well after the layoff

  const gap = bsHistoryGap(later, '2026-09-15');
  assert.equal(gap.lastRealISO, lastInApp, 'the gap is measured from the last IN-APP session');

  const withoutRule = bsHistoryGap(
    later.map((s) => ({ ...s, source: 'shape_app', sessionRpe: s.sessionRpe ?? 8 })),
    '2026-09-15',
  );
  assert.equal(withoutRule.lastRealISO, '2026-09-10', 'without the rule the sync closes the gap');
  assert.ok(gap.gapDays > withoutRule.gapDays, 'the sync would have hidden a real layoff');
});

test('scope: bsWeekLoad agrees with bsBucketWeeks — the PARALLEL tally is scoped too', () => {
  // bsBucketWeeks does NOT call bsWeekLoad; it runs the same classify+tally
  // inline. So bsWeekLoad inherits nothing from the scoping applied there, and
  // before this was fixed the two disagreed on identical input (1080 AU vs
  // 480). Not a live defect — nothing outside tests calls it — but it is the
  // one a 2b implementer reaches for, because its docstring reads "derive one
  // week's load from its logged sessions".
  const day = dayIn(WEEKS[0], 1);
  const rows = [inApp(day, 9), synced(day, 18)];
  const w = bsWeekLoad(rows);
  const b = bsBucketWeeks(rows).weeks[0];
  assert.equal(w.loadAu, b.loadAu, 'the two tallies must never disagree');
  assert.equal(w.eligible, b.eligible);
  assert.equal(w.hardestAu, b.hardestAu, 'a device row must not become the hardest session');
  assert.equal(w.loadAu, 200);
});
