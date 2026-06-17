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
  unauthorizedAssignTargets,
  canAssignToClients,
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

// ── coach assign scope (2026-06-17 write-scope hardening) ────────────────────
test('a pro can assign only to clients they actively coach', () => {
  const active = ['c1', 'c2', 'c3'];
  assert.equal(canAssignToClients(['c1'], active), true);
  assert.equal(canAssignToClients(['c1', 'c2'], active), true);
  // c9 is not theirs → rejected (the out-of-scope target).
  assert.equal(canAssignToClients(['c1', 'c9'], active), false);
  assert.equal(canAssignToClients(['c9'], active), false);
});

test('unauthorizedAssignTargets returns exactly the out-of-scope ids', () => {
  assert.deepEqual(unauthorizedAssignTargets(['c1', 'c9', 'c2', 'cX'], ['c1', 'c2', 'c3']), ['c9', 'cX']);
  assert.deepEqual(unauthorizedAssignTargets(['c1', 'c2'], ['c1', 'c2', 'c3']), []);
  // de-dupes the request, coerces to string (uuid vs number safety)
  assert.deepEqual(unauthorizedAssignTargets(['c1', 'c1'], ['c1']), []);
  assert.deepEqual(unauthorizedAssignTargets([7, 8], ['7']), ['8']);
});

test('an empty request, or no active clients, is never authorized', () => {
  assert.equal(canAssignToClients([], ['c1']), false);        // nothing requested
  assert.equal(canAssignToClients(['c1'], []), false);         // pro coaches no one
  assert.equal(canAssignToClients(['c1'], null), false);       // no active list at all
  assert.equal(canAssignToClients(null, ['c1']), false);
});
