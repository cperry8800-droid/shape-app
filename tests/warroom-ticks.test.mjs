import test from 'node:test';
import assert from 'node:assert/strict';
import { declinedLabels, pruneDeclinedTicks } from '../src/lib/warroom-ticks.mjs';

const section = (items) => [{ section: 'S', items }];

test('declinedLabels collects only declined item labels', () => {
  const labels = declinedLabels(
    section([
      { label: 'a', status: 'done' },
      { label: 'b', status: 'pending' },
      { label: 'c', status: 'manual' },
      { label: 'd', status: 'declined' },
    ]),
  );
  assert.deepEqual([...labels], ['d']);
});

test('prunes a tick belonging to a declined item', () => {
  const ticks = { keep: true, dropped: true };
  const next = pruneDeclinedTicks(
    ticks,
    section([
      { label: 'keep', status: 'pending' },
      { label: 'dropped', status: 'declined' },
    ]),
  );
  assert.deepEqual(next, { keep: true });
  assert.notEqual(next, ticks, 'returns a new object when it pruned something');
});

test('returns the same reference when there is nothing to prune', () => {
  const ticks = { keep: true };
  const checklist = section([
    { label: 'keep', status: 'pending' },
    { label: 'other', status: 'declined' },
  ]);
  // 'other' is declined but was never ticked -> no change, so no re-render/write.
  assert.equal(pruneDeclinedTicks(ticks, checklist), ticks);
  // No declined items at all -> also unchanged.
  assert.equal(pruneDeclinedTicks(ticks, section([{ label: 'keep', status: 'pending' }])), ticks);
});

// THE REGRESSION THIS EXISTS FOR: a declined ruling that later flips back to
// pending must NOT come back pre-completed from a stale persisted tick.
test('declined -> pending does not restore completion from a stale tick', () => {
  const label = 'RLS-scope the account-delete storage purge';

  // The operator ticked it while it was still pending work.
  let ticks = { [label]: true };

  // It is then ruled declined: the tick is pruned from state + storage.
  ticks = pruneDeclinedTicks(ticks, section([{ label, status: 'declined' }]));
  assert.deepEqual(ticks, {}, 'tick is dropped when the item becomes declined');

  // The ruling is later reversed back to pending.
  const reopened = section([{ label, status: 'pending' }]);
  assert.equal(pruneDeclinedTicks(ticks, reopened), ticks);
  assert.notEqual(ticks[label], true, 'item is open again, not silently complete');
});

test('tolerates malformed input', () => {
  assert.deepEqual(declinedLabels(null), new Set());
  assert.deepEqual(declinedLabels([{ items: null }]), new Set());
  assert.deepEqual(declinedLabels([{ items: [null, { status: 'declined' }] }]), new Set());
  assert.equal(pruneDeclinedTicks(undefined, null), undefined);
});
