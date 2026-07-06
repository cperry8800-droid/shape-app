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
  const frac = topTier ? 1 : (span > 0 ? Math.max(0, Math.min(1, (score - curThr) / span)) : 1);
  const pct = Math.round(frac * 100);
  const toNext = topTier ? 0 : Math.max(0, nextThr - score);
  const atRisk = laneCount > 0 && score < curThr;
  return { laneIndex, laneCount, frac, pct, toNext, curThr, nextThr, topTier, atRisk, nextName };
}
