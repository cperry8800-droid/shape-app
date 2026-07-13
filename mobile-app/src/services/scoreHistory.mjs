// Pure aggregation for "The Record" — the Shape Score history + report. ONE
// algorithm, mirrored in src/lib/scoreHistory.ts (the server twin the
// /api/client/score-record route runs); keep them in sync. Unit-tested in
// tests/score-record.test.mjs.
//
// RANK BASIS: store redemptions are EXCLUDED everywhere (series, byCategory,
// penalties, history, lifetime, earned/lost/net) — the same exclusion as
// scoreDerive.deriveScore, so the report total agrees with the Standing.
// Penalties = negative, non-redeem deltas.

const DAY_MS = 86400000;

export const RANGE_KEYS = ['1w', '1m', '3m', 'all'];
const RANGE_DAYS = { '1w': 7, '1m': 30, '3m': 90, all: null };
const RANGE_BUCKET = { '1w': 'day', '1m': 'day', '3m': 'week', all: 'week' };

// category → display label for the by-source bars.
export const RECORD_CATEGORY_LABELS = {
  workouts: 'Workouts',
  nutrition: 'Nutrition',
  adherence: 'Check-ins',
  habits: 'Habits',
  prs: 'PRs',
  career: 'Career',
  community: 'Community',
  endorsements: 'Endorsements',
  radio: 'Radio',
  referrals: 'Referrals',
  other: 'Other',
};

// history filter buckets (the tight chip set) — maps a row to a filter key.
export function recordFilterBucket(category, delta, sourceKind) {
  if (Number(delta) < 0 && sourceKind !== 'store_redeem') return 'penalty';
  switch (String(category || '')) {
    case 'workouts': return 'workouts';
    case 'habits': return 'habits';
    case 'nutrition': return 'nutrition';
    case 'adherence': return 'checkins';
    case 'prs': return 'prs';
    default: return 'other';
  }
}

function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }
function dayStartMs(ms) { const d = new Date(ms); d.setUTCHours(0, 0, 0, 0); return d.getTime(); }
function weekStartMs(ms) {
  const d = new Date(ms); d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
  return d.getTime();
}

export function bsScoreRecord(rows, opts = {}) {
  const nowMs = opts.now instanceof Date ? opts.now.getTime()
    : (typeof opts.now === 'number' ? opts.now : Date.now());

  // rank-basis rows only, oldest → newest (correct running total).
  const clean = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && r.source_kind !== 'store_redeem')
    .map((r) => ({
      category: String(r.category || 'other'),
      source_kind: r.source_kind || null,
      delta: Number(r.delta) || 0,
      note: r.note || null,
      earned_at: r.earned_at,
      ms: new Date(r.earned_at).getTime(),
    }))
    .filter((r) => Number.isFinite(r.ms))
    .sort((a, b) => a.ms - b.ms);

  const lifetime = clean.reduce((s, r) => s + r.delta, 0);

  const ranges = {};
  for (const key of RANGE_KEYS) {
    const days = RANGE_DAYS[key];
    const cutoff = days == null ? -Infinity : nowMs - days * DAY_MS;
    const inWin = clean.filter((r) => r.ms >= cutoff);

    // cumulative absolute rank — starts from the rank at the window's open.
    let running = clean.filter((r) => r.ms < cutoff).reduce((s, r) => s + r.delta, 0);

    const bucketOf = RANGE_BUCKET[key] === 'week' ? weekStartMs : dayStartMs;
    const byBucket = new Map();
    for (const r of inWin) byBucket.set(bucketOf(r.ms), (byBucket.get(bucketOf(r.ms)) || 0) + r.delta);
    const series = [];
    for (const b of [...byBucket.keys()].sort((a, z) => a - z)) {
      running += byBucket.get(b);
      series.push({ date: isoDay(b), cumulative: running, dayDelta: byBucket.get(b) });
    }

    const cat = new Map(); const pen = new Map();
    let earned = 0, lost = 0;
    for (const r of inWin) {
      if (r.delta >= 0) { earned += r.delta; cat.set(r.category, (cat.get(r.category) || 0) + r.delta); }
      else { lost += -r.delta; const k = r.note || RECORD_CATEGORY_LABELS[r.category] || 'Penalty'; pen.set(k, (pen.get(k) || 0) + r.delta); }
    }
    const byCategory = [...cat.entries()]
      .map(([k, earnedPts]) => ({ key: k, label: RECORD_CATEGORY_LABELS[k] || k, earned: earnedPts }))
      .sort((a, b) => b.earned - a.earned);
    const penalties = [...pen.entries()]
      .map(([note, total]) => ({ note, total }))
      .sort((a, b) => a.total - b.total); // most-negative first

    ranges[key] = { series, byCategory, earned, lost, net: earned - lost, penalties };
  }

  // history — every (non-redeem) row grouped by day, newest first.
  const dayMap = new Map();
  for (const r of clean) {
    const d = isoDay(r.ms);
    if (!dayMap.has(d)) dayMap.set(d, []);
    dayMap.get(d).push({
      note: r.note || RECORD_CATEGORY_LABELS[r.category] || 'Points',
      category: r.category,
      label: RECORD_CATEGORY_LABELS[r.category] || r.category,
      delta: r.delta,
      earned_at: r.earned_at,
      bucket: recordFilterBucket(r.category, r.delta, r.source_kind),
      isPenalty: r.delta < 0,
    });
  }
  const history = [...dayMap.keys()].sort((a, b) => (a < b ? 1 : -1)).map((d) => {
    const dayRows = dayMap.get(d).slice().reverse();
    return { date: d, subtotal: dayRows.reduce((s, r) => s + r.delta, 0), rows: dayRows };
  });

  return { ranges, history, lifetime };
}
