// Regression tests for the two P2 access guards (PR #1287 review):
//   ① goal writes must require an active coach on the client
//   ③ only active/upcoming sessions may be rescheduled
// Pure predicates shared by the API routes (src/lib/access-guards.mjs), run with:
//   node --test tests/access-guards.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSessionReschedulable,
  canWriteClientGoals,
  RESCHEDULABLE_SESSION_STATUSES,
} from '../src/lib/access-guards.mjs';

// ── ③ reschedule guard ──────────────────────────────────────────────────────
test('completed sessions are NOT reschedulable (regression: dragging a past booking)', () => {
  assert.equal(isSessionReschedulable('completed'), false);
});

test('declined / cancelled sessions are NOT reschedulable', () => {
  assert.equal(isSessionReschedulable('declined'), false);
  assert.equal(isSessionReschedulable('cancelled'), false);
});

test('active/upcoming sessions ARE reschedulable', () => {
  assert.equal(isSessionReschedulable('requested'), true);
  assert.equal(isSessionReschedulable('confirmed'), true);
});

test('reschedulable check is case-insensitive and rejects empty/unknown/null', () => {
  assert.equal(isSessionReschedulable('COMPLETED'), false);
  assert.equal(isSessionReschedulable('Confirmed'), true);
  assert.equal(isSessionReschedulable(''), false);
  assert.equal(isSessionReschedulable(null), false);
  assert.equal(isSessionReschedulable(undefined), false);
  assert.equal(isSessionReschedulable('whatever'), false);
});

test('only requested + confirmed are in the reschedulable set', () => {
  assert.deepEqual([...RESCHEDULABLE_SESSION_STATUSES].sort(), ['confirmed', 'requested']);
});

// ── ① coach-only goal writes ────────────────────────────────────────────────
test('a non-coach (incl. a client on their own id) cannot write client goals', () => {
  // is_coach_on_client returns false for a client viewing their own record.
  assert.equal(canWriteClientGoals(false), false);
});

test('an active coach on the client can write goals', () => {
  assert.equal(canWriteClientGoals(true), true);
});

test('goal-write authorization is strict (no truthy coercion of RPC nulls/strings)', () => {
  assert.equal(canWriteClientGoals(undefined), false);
  assert.equal(canWriteClientGoals(null), false);
  assert.equal(canWriteClientGoals('true'), false);
  assert.equal(canWriteClientGoals(1), false);
});
