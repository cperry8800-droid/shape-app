// The week-shaped publish contract — SPEC-guardrails.md §9.4.
//
// What is asserted here is REQUEST SHAPE, never a guardrail verdict. The core
// judges the week; this module only decides whether the request can be placed
// in a week at all. The `malformed` reservation rule from §4.1 governs both
// directions: over-rejecting turns a scoreable week into a hard error,
// under-rejecting feeds the core a week it will silently mis-score.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWeekRequest, weekRequestHash, toProposedWeek, toWorkoutRows,
} from '../src/lib/week-publish.mjs';

const CLIENT = '11111111-1111-4111-8111-111111111111';
const KEY = '22222222-2222-4222-8222-222222222222';

const OK = {
  clientIds: [CLIENT],
  weekStartISO: '2026-08-03',
  idempotencyKey: KEY,
  capture: 'per_session',
  sessions: [
    { title: 'Upper', scheduledDate: '2026-08-03', plannedMinutes: 60, plannedRpe: 8, loadCapture: 'per_session' },
    { title: 'Lower', scheduledDate: '2026-08-05', plannedMinutes: 45, plannedRpe: 7.5, loadCapture: 'per_session' },
  ],
};

const norm = (body, todayISO = '2026-08-01') => normalizeWeekRequest(body, { todayISO });

test('a complete week normalizes', () => {
  const r = norm(OK);
  assert.equal(r.ok, true);
  assert.equal(r.week.sessions.length, 2);
  assert.equal(r.week.capture, 'per_session');
  assert.deepEqual(r.clientIds, [CLIENT]);
});

test('a partial submission is REJECTED as malformed, never scored', () => {
  // §9.4 fixture. A session with no scheduledDate cannot be placed in a week,
  // so the request never reaches the core.
  const bad = { ...OK, sessions: [{ title: 'Upper', plannedMinutes: 60, plannedRpe: 8, loadCapture: 'per_session' }] };
  const r = norm(bad);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'malformed_request');
});

test('a session outside the submitted week is rejected', () => {
  assert.equal(norm({ ...OK, sessions: [{ ...OK.sessions[0], scheduledDate: '2026-08-11' }] }).ok, false);
  assert.equal(norm({ ...OK, sessions: [{ ...OK.sessions[0], scheduledDate: '2026-08-02' }] }).ok, false);
  // The last day of the week is INSIDE it — an off-by-one here silently drops a
  // coach's Sunday session.
  assert.equal(norm({ ...OK, sessions: [{ ...OK.sessions[0], scheduledDate: '2026-08-09' }] }).ok, true);
});

test('a session dated before today is rejected — never publish into the past', () => {
  const r = norm(OK, '2026-08-04');
  assert.equal(r.ok, false);
  assert.equal(r.error, 'past_session');
});

test('a session dated TODAY is accepted', () => {
  // The boundary refuses the PAST, not the present. A coach publishing this
  // morning's session is doing something ordinary.
  assert.equal(norm(OK, '2026-08-03').ok, true);
});

test('a calendar-impossible date is rejected — Date.parse would MOVE it', () => {
  // Date.parse('2026-02-30') does not fail; V8 normalises it to March 2. The
  // round-trip check is the only reliable one (the lesson from Deploy 1).
  const bad = { ...OK, weekStartISO: '2026-02-30', sessions: [{ ...OK.sessions[0], scheduledDate: '2026-02-30' }] };
  assert.equal(norm(bad, '2026-02-01').ok, false);
});

test('an empty week is rejected — there is nothing to publish', () => {
  const r = norm({ ...OK, sessions: [] });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'empty_week');
});

test('a missing idempotency key is rejected — the key is minted at authoring time', () => {
  const { idempotencyKey, ...rest } = OK;
  const r = norm(rest);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'missing_idempotency_key');
});

test('an UNSTAMPED week normalizes — it is incomplete_week at the CORE, not a request error', () => {
  // The stamp lost in transit degrades to the SAFE direction (§3.2a). Rejecting
  // it here would turn an honest blank into a hard failure, and would take the
  // declaration table's whole first row out of reach.
  const { capture, ...rest } = OK;
  const unstamped = { ...rest, sessions: OK.sessions.map(({ loadCapture, ...s }) => s) };
  const r = norm(unstamped);
  assert.equal(r.ok, true);
  assert.equal(r.week.capture, undefined);
  assert.equal(r.week.sessions[0].loadCapture, undefined);
});

test('a STAMPED week with a missing pair normalizes — malformed_week is the CORE\'s call', () => {
  // Rejecting here would report a transport bug as a 400 and rob the core of
  // the one signal that distinguishes "the coach skipped it" from "a hop
  // dropped it". The stamp exists precisely to draw that line.
  const r = norm({ ...OK, sessions: [{ title: 'Upper', scheduledDate: '2026-08-03', loadCapture: 'per_session' }] });
  assert.equal(r.ok, true);
  assert.equal(r.week.sessions[0].plannedMinutes, undefined);
});

test('a non-numeric pair value becomes ABSENT, never coerced to a number', () => {
  const r = norm({ ...OK, sessions: [{ ...OK.sessions[0], plannedMinutes: '60', plannedRpe: null }] });
  assert.equal(r.week.sessions[0].plannedMinutes, undefined);
  assert.equal(r.week.sessions[0].plannedRpe, undefined);
});

test('half-point RPE survives — a coach authoring a week has no whole-number constraint', () => {
  // §13.14: the asymmetry with logged session_rpe is deliberate. Do not
  // "harmonise" it.
  assert.equal(norm(OK).week.sessions[1].plannedRpe, 7.5);
});

test('the hash is stable across session order', () => {
  const a = weekRequestHash(CLIENT, norm(OK).week);
  const b = weekRequestHash(CLIENT, norm({ ...OK, sessions: [OK.sessions[1], OK.sessions[0]] }).week);
  assert.equal(a, b);
});

test('order-stability holds for TWO ID-LESS SESSIONS ON THE SAME DAY', () => {
  // ⚠ THE CASE THE OTHER ORDER TESTS MISS. Every one of them uses sessions on
  // DIFFERENT dates, so `scheduledDate` decides the order and the tie-break
  // never runs. Two sessions on the SAME day with no caller id are the only
  // shape that reaches it — and the tie-break compared the SYNTHESIZED `s${i}`
  // id, which is the submission index wearing a name while the digest stores
  // `id: null`. So the same logical week, submitted in the other order, hashed
  // differently: the ledger saw two legitimate publishes instead of a replay and
  // the week was written TWICE.
  //
  // A double session on one day is not exotic — it is a two-a-day, or a lift
  // plus a conditioning finisher the coach authored as its own row.
  const twoADay = {
    ...OK,
    sessions: [
      { title: 'AM squat', scheduledDate: '2026-08-04', plannedMinutes: 60, plannedRpe: 8, loadCapture: 'per_session' },
      { title: 'PM conditioning', scheduledDate: '2026-08-04', plannedMinutes: 30, plannedRpe: 6, loadCapture: 'per_session' },
    ],
  };
  const a = weekRequestHash(CLIENT, norm(twoADay).week);
  const b = weekRequestHash(CLIENT, norm({ ...twoADay, sessions: [twoADay.sessions[1], twoADay.sessions[0]] }).week);
  assert.equal(a, b);

  // POSITIVE CONTROL — the ordering is stable, not blind: editing one of the two
  // same-day sessions still moves the hash.
  const edited = weekRequestHash(CLIENT, norm({
    ...twoADay,
    sessions: [{ ...twoADay.sessions[0], plannedRpe: 9 }, twoADay.sessions[1]],
  }).week);
  assert.notEqual(a, edited);
});

test('order-stability holds WITH caller ids too', () => {
  const withIds = {
    ...OK,
    sessions: [{ ...OK.sessions[0], id: 'upper-a' }, { ...OK.sessions[1], id: 'lower-b' }],
  };
  const a = weekRequestHash(CLIENT, norm(withIds).week);
  const b = weekRequestHash(CLIENT, norm({ ...withIds, sessions: [withIds.sessions[1], withIds.sessions[0]] }).week);
  assert.equal(a, b);
});

test('a REMAPPED caller id is a content change, a synthesized one is not', () => {
  // The core names the hardest session by id and that verdict is stored in the
  // ledger outcome, so moving a real id across sessions is a different week.
  // `s0`/`s1` are the array index wearing a name and must never do that — or a
  // builder re-sorting an id-less list hits an unrecoverable key conflict.
  const ids = (a, b) => norm({
    ...OK,
    sessions: [{ ...OK.sessions[0], id: a }, { ...OK.sessions[1], id: b }],
  }).week;
  assert.notEqual(weekRequestHash(CLIENT, ids('x', 'y')), weekRequestHash(CLIENT, ids('y', 'x')));
  assert.notEqual(weekRequestHash(CLIENT, ids('x', 'y')), weekRequestHash(CLIENT, norm(OK).week));
});

test('the hash CHANGES when the content changes', () => {
  const a = weekRequestHash(CLIENT, norm(OK).week);
  const b = weekRequestHash(CLIENT, norm({ ...OK, sessions: [{ ...OK.sessions[0], plannedRpe: 9 }, OK.sessions[1]] }).week);
  assert.notEqual(a, b);
});

test('the hash is per CLIENT — the same week to two clients is two records', () => {
  const w = norm(OK).week;
  assert.notEqual(weekRequestHash('a', w), weekRequestHash('b', w));
});

test('the hash separates a dropped session from a reordered one', () => {
  const full = weekRequestHash(CLIENT, norm(OK).week);
  const one = weekRequestHash(CLIENT, norm({ ...OK, sessions: [OK.sessions[0]] }).week);
  assert.notEqual(full, one);
});

// ⚠ EVERY FIELD THE PUBLISH WRITES MUST MOVE THE HASH. A field left out of the
// digest is a field a coach can silently fail to change: the ledger serves the
// first outcome back as `already_delivered` and the edit is dropped with no
// error. These three were genuinely missing and were caught in review.
test('the hash CHANGES when only the description changes', () => {
  const a = weekRequestHash(CLIENT, norm({
    ...OK,
    sessions: [{ ...OK.sessions[0], description: 'Bar speed on the last two.' }, OK.sessions[1]],
  }).week);
  const b = weekRequestHash(CLIENT, norm({
    ...OK,
    sessions: [{ ...OK.sessions[0], description: 'Stop one shy of failure.' }, OK.sessions[1]],
  }).week);
  assert.notEqual(a, b);
});

test('the hash CHANGES when only adjustMode changes', () => {
  // adjustMode is written into the stored row payload by toWorkoutRows, so the
  // same sessions published as a deload and as a progress are two DIFFERENT
  // writes — not a replay of one another.
  const a = weekRequestHash(CLIENT, norm({ ...OK, adjustMode: 'deload' }).week);
  const b = weekRequestHash(CLIENT, norm({ ...OK, adjustMode: 'progress' }).week);
  assert.notEqual(a, b);
  assert.notEqual(a, weekRequestHash(CLIENT, norm(OK).week));
});

test('the hash CHANGES when only the acknowledgment changes', () => {
  const ack = (reasonText) => norm({ ...OK, acknowledgment: { reasonCode: 'returning', reasonText } }).week;
  assert.notEqual(
    weekRequestHash(CLIENT, ack('Back from a deload block.')),
    weekRequestHash(CLIENT, ack('Client asked for the jump.')),
  );
});

test('the hash is INDIFFERENT to payload key order — a rebuilt payload is a replay', () => {
  // The offline queue round-trips the payload through storage, and two builders
  // can emit the same object with keys in a different order. Under
  // JSON.stringify that read as a CONFLICT and hard-errored a genuine replay.
  const withPayload = (payload) => norm({
    ...OK,
    sessions: [{ ...OK.sessions[0], payload }, OK.sessions[1]],
  }).week;
  const a = withPayload({ blocks: [{ move: 'Row', sets: 3 }], note: 'keep it crisp' });
  const b = withPayload({ note: 'keep it crisp', blocks: [{ sets: 3, move: 'Row' }] });
  assert.equal(weekRequestHash(CLIENT, a), weekRequestHash(CLIENT, b));
});

test('the hash separates an ABSENT value from an empty one', () => {
  // undefined (never stamped) and null (stamped blank) must not collide — the
  // §3.2a declaration table turns on exactly that difference.
  const absent = weekRequestHash(CLIENT, norm(OK).week);
  const nulled = weekRequestHash(CLIENT, {
    ...norm(OK).week,
    sessions: norm(OK).week.sessions.map((s, i) => (i ? s : { ...s, loadCapture: null })),
  });
  assert.notEqual(absent, nulled);
});

test('toProposedWeek carries the stamp and the pair, and nothing else', () => {
  const p = toProposedWeek(norm(OK).week);
  assert.equal(p.weekStartISO, '2026-08-03');
  assert.equal(p.capture, 'per_session');
  assert.deepEqual(Object.keys(p.sessions[0]).sort(), ['id', 'loadCapture', 'plannedMinutes', 'plannedRpe']);
});

test('toWorkoutRows carries the pair INTO the stored payload', () => {
  // The second copy of the stamp (capture design §4): a row re-read later still
  // describes itself, and Adjust reads the pair back off it rather than
  // re-deriving it.
  const rows = toWorkoutRows(norm(OK).week);
  assert.equal(rows[0].payload.plannedMinutes, 60);
  assert.equal(rows[0].payload.plannedRpe, 8);
  assert.equal(rows[0].payload.loadCapture, 'per_session');
  assert.equal(rows[0].scheduled_date, '2026-08-03');
});

test('toWorkoutRows does NOT invent pair keys on an unstamped week', () => {
  const { capture, ...rest } = OK;
  const rows = toWorkoutRows(norm({ ...rest, sessions: OK.sessions.map(({ loadCapture, plannedMinutes, plannedRpe, ...s }) => s) }).week);
  assert.equal('plannedMinutes' in rows[0].payload, false);
  assert.equal('loadCapture' in rows[0].payload, false);
});

test('toWorkoutRows stamps adjustMode as PROVENANCE when the week came from Adjust', () => {
  const rows = toWorkoutRows(norm({ ...OK, adjustMode: 'deload' }).week);
  assert.equal(rows[0].payload.adjustMode, 'deload');
});

test('an unknown adjustMode is dropped, not passed through', () => {
  assert.equal(norm({ ...OK, adjustMode: 'taper' }).week.adjustMode, null);
});

test('a caller-supplied payload survives alongside the pair', () => {
  const rows = toWorkoutRows(norm({ ...OK, sessions: [{ ...OK.sessions[0], payload: { exercises: [{ n: 'Squat' }] } }] }).week);
  assert.equal(rows[0].payload.exercises.length, 1);
  assert.equal(rows[0].payload.plannedMinutes, 60);
});

test('an oversized week is rejected', () => {
  const many = Array.from({ length: 41 }, () => ({ ...OK.sessions[0] }));
  assert.equal(norm({ ...OK, sessions: many }).ok, false);
});

test('clientIds are de-duplicated', () => {
  assert.deepEqual(norm({ ...OK, clientIds: [CLIENT, CLIENT] }).clientIds, [CLIENT]);
});

test('a non-uuid client id is rejected', () => {
  assert.equal(norm({ ...OK, clientIds: ['not-a-uuid'] }).ok, false);
});

test('garbage input never throws', () => {
  for (const junk of [null, undefined, 42, 'week', [], { sessions: 'no' }]) {
    assert.equal(norm(junk).ok, false);
  }
});
