// The one derivation both Shape Score standing-chart views (THE LADDER / THIS
// TIER) and the verdict sub-line read. Mirrors the existing hero frac math:
// each tier is an ordinal "lane"; frac is the rank's progress through the
// current lane (curThr -> nextThr), clamped 0..1. Tiers never demote, so a rank
// below the current (high-water) tier floor is "at risk" and clamps to frac 0.
const parseNum = (s) => Number(String(s == null ? '' : s).replace(/[^0-9]/g, '')) || 0;

export function bsScoreStanding(tiers, tierName, total) {
  const list = Array.isArray(tiers) ? tiers : [];
  const laneCount = list.length;
  const score = Number(total) || 0;
  const wantIdx = list.findIndex((x) => String(x && x.name).toLowerCase() === String(tierName).toLowerCase());
  const laneIndex = wantIdx >= 0 ? wantIdx : 0;
  const topTier = laneCount === 0 || laneIndex >= laneCount - 1;
  const curThr = laneCount ? parseNum(list[laneIndex].range) : 0;
  const nextThr = (!topTier && list[laneIndex + 1]) ? parseNum(list[laneIndex + 1].range) : score;
  const nextName = (!topTier && list[laneIndex + 1]) ? String(list[laneIndex + 1].name) : '';
  const span = nextThr - curThr;
  // At-risk = the rank slipped below the current (high-water) tier floor. Compute
  // it first so the top-tier branch can clamp to empty instead of forcing a full
  // bar — a last-rung member below the floor must read as 0%, not complete.
  const atRisk = laneCount > 0 && score < curThr;
  const frac = topTier ? (atRisk ? 0 : 1) : (span > 0 ? Math.max(0, Math.min(1, (score - curThr) / span)) : 1);
  const pct = Math.round(frac * 100);
  const toNext = topTier ? 0 : Math.max(0, nextThr - score);
  return { laneIndex, laneCount, frac, pct, toNext, curThr, nextThr, topTier, atRisk, nextName };
}

// ── The Peak checkpoint (owner call 2026-07-20, pacing option B) ────────────
// Peak (5,000) -> Legend (15,000) is an ~8-month quiet stretch for a committed
// member; 10,000 is the celebrated checkpoint inside it. Pure derivation both
// surfaces + the crossing toast read; NO points attach to it — recognition,
// never economy. Returns null anywhere outside the Peak->Legend lane so no
// other tier ever grows a marker by accident.
export const BS_PEAK_CHECKPOINT = 10000;
export function bsPeakCheckpoint(tiers, tierName, total) {
  const st = bsScoreStanding(tiers, tierName, total);
  // Only meaningful in the lane that CONTAINS the checkpoint value.
  if (st.topTier || !(st.curThr < BS_PEAK_CHECKPOINT && BS_PEAK_CHECKPOINT < st.nextThr)) return null;
  const score = Number(total) || 0;
  const span = st.nextThr - st.curThr;
  return {
    at: BS_PEAK_CHECKPOINT,
    reached: score >= BS_PEAK_CHECKPOINT,
    toGo: Math.max(0, BS_PEAK_CHECKPOINT - score),
    // Where the marker sits along the current lane (for the TIER-zoom bar).
    laneFrac: span > 0 ? (BS_PEAK_CHECKPOINT - st.curThr) / span : 0,
  };
}
