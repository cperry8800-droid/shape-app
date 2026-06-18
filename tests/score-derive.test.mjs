// Shape Score two-number split + high-water rank. The rank number excludes store
// redemptions (spending never demotes) but counts penalties (lapsing dents it);
// the displayed tier is high-water-marked (never demotes). Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveScore } from '../mobile-app/src/services/scoreDerive.mjs';

test('shapeScore excludes redemptions; spendable includes them', () => {
  const rows = [
    { delta: 800, source_kind: 'activity', earned_at: '2026-06-01T00:00:00Z' },
    { delta: -500, source_kind: 'store_redeem', earned_at: '2026-06-02T00:00:00Z' },
    { delta: -7, source_kind: 'penalty_checkin', earned_at: '2026-06-03T00:00:00Z' },
  ];
  const r = deriveScore(rows);
  assert.equal(r.shapeScore, 793); // 800 - 7 (penalty counts, redeem excluded)
  assert.equal(r.spendableBalance, 293); // 800 - 500 - 7
});

test('highWaterScore is the running max of the rank number over time', () => {
  const rows = [
    { delta: 900, source_kind: 'activity', earned_at: '2026-06-01T00:00:00Z' }, // rank 900
    { delta: -200, source_kind: 'penalty_session', earned_at: '2026-06-05T00:00:00Z' }, // rank 700
    { delta: -500, source_kind: 'store_redeem', earned_at: '2026-06-06T00:00:00Z' }, // rank still 700
  ];
  const r = deriveScore(rows);
  assert.equal(r.shapeScore, 700);
  assert.equal(r.highWaterScore, 900); // peaked at 900 before the penalty
});

test('rows are folded in earned_at order regardless of input order', () => {
  const rows = [
    { delta: -200, source_kind: 'penalty_session', earned_at: '2026-06-05T00:00:00Z' },
    { delta: 900, source_kind: 'activity', earned_at: '2026-06-01T00:00:00Z' },
  ];
  assert.equal(deriveScore(rows).highWaterScore, 900);
});

test('empty / null ledger → all zero', () => {
  assert.deepEqual(deriveScore([]), { shapeScore: 0, spendableBalance: 0, highWaterScore: 0 });
  assert.deepEqual(deriveScore(null), { shapeScore: 0, spendableBalance: 0, highWaterScore: 0 });
});
