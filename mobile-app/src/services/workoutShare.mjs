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
    const at = Date.parse(r.created_at || '');
    return Number.isFinite(at) && Math.abs(at - start) <= WINDOW_MS;
  });
}
