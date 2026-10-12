// Mirror of mobile-app/src/services/scoreDerive.mjs — keep in sync.
// Pure Shape Score derivation from raw ledger rows: the RANK number (shapeScore)
// excludes store redemptions so spending never demotes, but counts penalties so
// lapsing dents it; spendableBalance is Σ all delta; highWaterScore is the running
// max of the rank so the displayed tier is high-water-marked (never demotes).

export type LedgerDeltaRow = { delta: number; source_kind: string | null; earned_at: string };

export function deriveScore(rows: LedgerDeltaRow[]): {
  shapeScore: number;
  spendableBalance: number;
  highWaterScore: number;
} {
  const sorted = [...(rows || [])].sort((a, b) => String(a.earned_at).localeCompare(String(b.earned_at)));
  let rank = 0;
  let spendable = 0;
  let high = 0;
  for (const r of sorted) {
    const d = Number(r.delta) || 0;
    spendable += d;
    // A tier bonus is spendable credit, not rank: counting it let the shown tier run
    // up to 3,500 points ahead of the tier that unlocks its rewards. Same basis as the
    // database's shape_rank_points (2026-10-12-shape-score-fixes.sql).
    if (r.source_kind !== 'store_redeem' && r.source_kind !== 'tier_bonus') {
      rank += d;
      if (rank > high) high = rank;
    }
  }
  return { shapeScore: rank, spendableBalance: spendable, highWaterScore: high };
}
