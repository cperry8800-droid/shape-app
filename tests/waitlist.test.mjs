// tests/waitlist.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { computePositions, ACTIVE_WAITLIST_STATUSES } from '../src/lib/waitlist.mjs';

test('computePositions ranks active rows FIFO, skips inactive', () => {
  const rows = [
    { id: 'a', status: 'waiting', created_at: '2026-07-01T10:00:00Z' },
    { id: 'b', status: 'left',    created_at: '2026-07-01T10:01:00Z' },
    { id: 'c', status: 'invited', created_at: '2026-07-01T10:02:00Z' },
    { id: 'd', status: 'waiting', created_at: '2026-07-01T10:03:00Z' },
  ];
  const pos = computePositions(rows);
  assert.equal(pos.get('a'), 1);
  assert.equal(pos.get('c'), 2);
  assert.equal(pos.get('d'), 3);
  assert.equal(pos.has('b'), false);
});

test('ACTIVE set is waiting+invited only', () => {
  assert.equal(ACTIVE_WAITLIST_STATUSES.has('waiting'), true);
  assert.equal(ACTIVE_WAITLIST_STATUSES.has('invited'), true);
  assert.equal(ACTIVE_WAITLIST_STATUSES.has('booked'), false);
});
