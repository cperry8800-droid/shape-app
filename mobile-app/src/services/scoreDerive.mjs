// Pure Shape Score derivation from raw ledger rows — ONE source of truth for the
// two-number split + high-water rank. Mirrored in src/lib/score-derive.ts (the
// Next score route) and the /api/client/score handler; keep them in sync.
//
//   shapeScore       — the RANK number: Σ delta EXCLUDING store redemptions and
//                      tier bonuses, so spending never demotes you and a bonus never
//                      lifts you; penalties (negative, non-redeem) DO count, so
//                      lapsing dents your rank.
//   spendableBalance — Σ ALL delta (earns − penalties − redemptions): what you redeem.
//   highWaterScore   — the running max of the rank number over time, so the
//                      DISPLAYED tier is high-water-marked (never demotes).
export function deriveScore(rows) {
  const sorted = [...(rows || [])].sort((a, b) => String(a.earned_at).localeCompare(String(b.earned_at)));
  let rank = 0, spendable = 0, high = 0;
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
