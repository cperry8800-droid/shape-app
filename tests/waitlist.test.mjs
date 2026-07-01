// tests/waitlist.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePositions,
  ACTIVE_WAITLIST_STATUSES,
  isActiveWaitlistRow,
} from '../src/lib/waitlist.mjs';

test('computePositions ranks active rows FIFO, skips inactive', () => {
  const rows = [
    { id: 'a', status: 'waiting', created_at: '2026-07-01T10:00:00Z' },
    { id: 'b', status: 'left',    created_at: '2026-07-01T10:01:00Z' },
    { id: 'c', status: 'invited', created_at: '2026-07-01T10:02:00Z', invite_expires_at: '2099-01-01T00:00:00Z' }, // live invite → active
    { id: 'd', status: 'waiting', created_at: '2026-07-01T10:03:00Z' },
  ];
  const pos = computePositions(rows);
  assert.equal(pos.get('a'), 1);
  assert.equal(pos.get('c'), 2);
  assert.equal(pos.get('d'), 3);
  assert.equal(pos.has('b'), false);
});

test('ACTIVE set is EXACTLY waiting+invited', () => {
  // Exact-membership assertion: a stray 'declined'/'left'/'booked' creeping into
  // the active set would break FIFO + the unique-index semantics, so pin it.
  assert.deepEqual([...ACTIVE_WAITLIST_STATUSES].sort(), ['invited', 'waiting']);
  assert.equal(ACTIVE_WAITLIST_STATUSES.size, 2);
  for (const s of ['booked', 'declined', 'left']) {
    assert.equal(ACTIVE_WAITLIST_STATUSES.has(s), false);
  }
});

test('expired invites do not occupy a FIFO slot', () => {
  const now = Date.parse('2026-07-10T00:00:00Z');
  const rows = [
    { id: 'a', status: 'waiting', created_at: '2026-07-01T10:00:00Z' },
    { id: 'b', status: 'invited', created_at: '2026-07-01T09:00:00Z', invite_expires_at: '2026-07-05T00:00:00Z' }, // expired
    { id: 'c', status: 'invited', created_at: '2026-07-01T11:00:00Z', invite_expires_at: '2026-07-20T00:00:00Z' }, // live
  ];
  const pos = computePositions(rows, now);
  assert.equal(pos.has('b'), false); // expired invite no longer blocks the line
  assert.equal(pos.get('a'), 1);
  assert.equal(pos.get('c'), 2);
});

test('isActiveWaitlistRow: expiry + terminal states', () => {
  const now = Date.parse('2026-07-10T00:00:00Z');
  assert.equal(isActiveWaitlistRow({ status: 'waiting' }, now), true);
  assert.equal(isActiveWaitlistRow({ status: 'invited' }, now), false); // no expiry → NOT active (mirrors SQL null>now)
  assert.equal(isActiveWaitlistRow({ status: 'invited', invite_expires_at: '2026-07-20T00:00:00Z' }, now), true);
  assert.equal(isActiveWaitlistRow({ status: 'invited', invite_expires_at: '2026-07-01T00:00:00Z' }, now), false);
  assert.equal(isActiveWaitlistRow({ status: 'declined' }, now), false);
  assert.equal(isActiveWaitlistRow({ status: 'left' }, now), false);
  assert.equal(isActiveWaitlistRow({ status: 'booked' }, now), false);
});
