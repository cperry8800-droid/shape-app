// The ONE rule for what privacy an auto-posted workout gets, from the member's
// own client_settings doc: the Share toggle gates everything; profile
// visibility scopes it. Defaults mirror the Settings pills' first options
// (On · Public), so a member who never opened Settings shares publicly.
// Mirrored in src/lib/workout-share.ts (server twin) — keep in sync.
export const BS_PRIVACY_RANK = { public: 0, followers: 1, private: 2 };

export function bsWorkoutSharePrivacy(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  if (String(d.shareWorkoutData || 'On') === 'Off') return 'private';
  const vis = String(d.profileVisibility || 'Public');
  if (vis === 'Private') return 'private';
  if (vis === 'Just friends') return 'followers';
  return 'public';
}

// Cross-source guard: a watch and the phone must not both post one workout.
// True when another DIFFERENT provider's workout post sits within ±20 minutes
// of this activity's start. Same-provider rows are the per-source upsert's
// job; manual posts (null source_provider) never count. Bad dates → false
// (never block a post on unparseable input).
const WINDOW_MS = 20 * 60 * 1000;
export function bsIsDuplicateWorkoutPost(rows, startISO, provider) {
  const start = Date.parse(startISO || '');
  if (!Number.isFinite(start)) return false;
  return (Array.isArray(rows) ? rows : []).some((r) => {
    if (!r || !r.source_provider || r.source_provider === provider) return false;
    const at = Date.parse(bsPostActivityStart(r) || '');
    return Number.isFinite(at) && Math.abs(at - start) <= WINDOW_MS;
  });
}

// ⚠ WHEN THE WORKOUT HAPPENED AND WHEN THE POST WAS MADE ARE TWO FACTS, AND
// `created_at` USED TO CARRY BOTH. Every auto-poster stamped `created_at` at the
// activity START — which the dedup above needs, and which the FEED then sorts and
// dates by. So connecting a provider and backfilling a year of history produced
// posts that sorted below 50 newer rows and were never seen, on the one screen
// that exists to show a member their training: the feed reads
// `order('created_at', desc).limit(50)` and the card prints `since(created_at)`.
// The activity's own start lives in `metrics.startedAt` now and `created_at` is
// what the composer has always meant by it — when the post was made — so nothing
// is lost and the two questions stop sharing one answer.
//
// ⚠ A ROW WRITTEN BEFORE THIS CHANGE HAS NO `startedAt`, AND ITS `created_at`
// IS THE ACTIVITY START. That is exactly the fallback, so the dedup keeps working
// across the change rather than treating every legacy row as un-matchable — and
// it is why this reads a row rather than a field.
export function bsPostActivityStart(row) {
  const r = row && typeof row === 'object' ? row : {};
  const m = r.metrics && typeof r.metrics === 'object' ? r.metrics : {};
  const s = typeof m.startedAt === 'string' ? m.startedAt.trim() : '';
  if (s && Number.isFinite(Date.parse(s))) return s;
  const c = typeof r.created_at === 'string' ? r.created_at.trim() : '';
  return c && Number.isFinite(Date.parse(c)) ? c : null;
}

// The activity start as a UTC ISO string, or null. ⚠ NORMALISED AT THE WRITE,
// because the dedup's DB pre-filter compares `metrics->>startedAt` as TEXT and
// providers do not agree on an offset: WHOOP sends `Z`, Strava a local `+02:00`.
// Lexical order is only the real order when every value is written the same way.
export function bsActivityStartISO(value) {
  if (typeof value !== 'string' && !(value instanceof Date)) return null;
  const t = Date.parse(value instanceof Date ? value.toISOString() : value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// The dedup's DB pre-filter, written ONCE because it has two callers (the
// server sync/webhook routes and the in-app session poster) and a window that
// drifts between them is a duplicate post nobody can explain.
//
// ⚠ TWO PLAIN LEGS RATHER THAN ONE `or()`, AND THAT IS A RELIABILITY CALL.
// A malformed PostgREST filter comes back as an `error`, which both callers read
// as "not a duplicate" — so a syntax mistake turns the guard OFF silently. Each
// leg here uses only filter primitives this repo already ships (`is` and `eq` on
// a `->>` extraction, plus ranges), never a `->>` nested inside an `and()` group
// inside an `or()`, which nothing here has exercised. They also fail
// independently: one leg erroring still lets the other decide.
//
// ⚠ THE TWO LEGS MIRROR THE TWO BRANCHES OF `bsPostActivityStart`, AND LEG 2 IS
// DELIBERATELY NOT NARROWED TO `startedAt is null`. That narrowing looked tighter
// and was a MISS: a row whose `startedAt` is present but not a usable instant
// ("not-a-date", an epoch number, a space-separated timestamp, "") sorts outside
// leg 1's lexical range AND is not null, so it matched neither leg — while
// `bsPostActivityStart` dates that row by `created_at` and would have called it a
// duplicate. `metrics` is client-written jsonb with no server-side rule, and
// `createCommunityPost` lets a caller-supplied `metrics.startedAt` through
// unnormalised, so "our writers normalise" does not close it. Leg 2 is now every
// row whose `created_at` is in the window, which is a strict SUPERSET of that
// fallback branch; the JS predicate re-checks each row, so a wider leg costs a few
// rows and can never create a false positive. The caps are 50 rather than 5
// because leg 2 no longer excludes rows leg 1 already covers — a bulk backfill can
// post dozens in one minute, and a cap sized for the old narrow leg would spend
// every slot on them and crowd the real match out.
//
// ⚠ RESIDUAL, NAMED RATHER THAN DISCOVERED LATER: a `startedAt` that IS a usable
// instant but is not written the way `bsActivityStartISO` writes one — an offset
// form like "2026-03-14T04:05:00-04:00" — sorts outside leg 1's lexical range, so
// it is caught only if its `created_at` also falls in the window. Our own writers
// cannot produce it (every one goes through `bsActivityStartISO`, which emits
// UTC with milliseconds), so this needs a row written straight into the jsonb.
// Casting (`metrics->>startedAt::timestamptz`) would make leg 1 exact and is
// DECLINED: one malformed value anywhere in the scanned set raises for the whole
// query, and an erroring query reads as "not a duplicate" — i.e. a single bad row
// would turn the guard off for everyone, which is the failure this design exists
// to avoid.
export function bsDuplicateWindowBounds(startISO) {
  const start = Date.parse(startISO || '');
  if (!Number.isFinite(start)) return null;
  return {
    lo: new Date(start - WINDOW_MS).toISOString(),
    hi: new Date(start + WINDOW_MS).toISOString(),
  };
}

export async function bsFetchDuplicateCandidates(makeQuery, startISO) {
  const b = bsDuplicateWindowBounds(startISO);
  if (!b) return [];
  const [byStart, byCreated] = await Promise.all([
    makeQuery().gte('metrics->>startedAt', b.lo).lte('metrics->>startedAt', b.hi).limit(50),
    makeQuery().gte('created_at', b.lo).lte('created_at', b.hi).limit(50),
  ]);
  const rows = [];
  if (byStart && !byStart.error && Array.isArray(byStart.data)) rows.push(...byStart.data);
  if (byCreated && !byCreated.error && Array.isArray(byCreated.data)) rows.push(...byCreated.data);
  return rows;
}
