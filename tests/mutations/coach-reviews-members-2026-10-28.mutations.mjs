// Mutation spec for members reading coach reviews (owner, 2026-10-28: "anyone with a shape
// membership can read them", "Rating only" for everyone else): the API, the migration and each
// screen's locked state. Every mutation must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/coach-reviews-members-2026-10-28.mutations.mjs --fail-on-skipped
const API = 'src/app/api/coaches/reviews/route.ts';
const SQL = 'supabase-migrations/2026-10-28-coach-reviews-members.sql';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const MKT = 'mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx';
const TRAINER = 'mobile-app/src/broadsheet/BSTrainerProfile.jsx';
const WEB = 'public/newdesign/livingShared.jsx';

export default {
  test: 'node --test tests/coach-ratings-live.test.mjs tests/trainer-profile.test.mjs tests/review-abuse-hardening.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the API ──
    { name: 'api: a guest counts as a member', file: API,
      find: 'isMeasuredSignedOut(error) ? { member: false, admin: false } : null;', replace: 'isMeasuredSignedOut(error) ? { member: true, admin: false } : null;' },
    { name: 'api: an auth outage counts as a guest', file: API,
      find: 'isMeasuredSignedOut(error) ? { member: false, admin: false } : null;', replace: '{ member: false, admin: false };' },
    { name: 'api: every signed-in reader counts as a member', file: API,
      find: '    return { member: m.isMember, admin: m.isAdmin };', replace: '    return { member: true, admin: m.isAdmin };' },
    { name: 'api: a failed membership read counts as "not a member" (not strict)', file: API,
      find: '{ emailConfirmed: !!user.email_confirmed_at, strict: true }', replace: '{ emailConfirmed: !!user.email_confirmed_at }' },
    { name: 'api: an unknown membership is treated as "not a member"', file: API,
      find: '    return { member: m.isMember, admin: m.isAdmin };\n  } catch {\n    return null;\n  }',
      replace: '    return { member: m.isMember, admin: m.isAdmin };\n  } catch {\n    return { member: false, admin: false };\n  }' },
    { name: 'api: an admin reads with their own session', file: API,
      find: '  if (!reader.admin) return supabase;', replace: '  return supabase;' },
    { name: 'api: everyone reads through the service role', file: API,
      find: '  if (!reader.admin) return supabase;', replace: '  if (false) return supabase;' },
    { name: 'api: ?ids answers a non-member', file: API,
      find: '    if (!reader.member) return NextResponse.json({ reviews: [], locked: true });\n', replace: '' },
    { name: 'api: ?owner answers a non-member', file: API,
      find: "r.owner_id === ownerParam)) : null;\n    if (!reader.member) return rating ? NextResponse.json({ reviews: [], locked: true, ...rating }) : RATINGS_UNREAD();\n",
      replace: "r.owner_id === ownerParam)) : null;\n" },
    { name: 'api: ?owner hides the reviews without saying so', file: API,
      find: "r.owner_id === ownerParam)) : null;\n    if (!reader.member) return rating ? NextResponse.json({ reviews: [], locked: true, ...rating })",
      replace: "r.owner_id === ownerParam)) : null;\n    if (!reader.member) return rating ? NextResponse.json({ reviews: [], ...rating })" },
    { name: 'api: ?owner, the ratings unread, is a locked empty list', file: API,
      find: "r.owner_id === ownerParam)) : null;\n    if (!reader.member) return rating ? NextResponse.json({ reviews: [], locked: true, ...rating }) : RATINGS_UNREAD();",
      replace: "r.owner_id === ownerParam)) : null;\n    if (!reader.member) return NextResponse.json({ reviews: [], locked: true, ...(rating || {}) });" },
    { name: 'api: ?coach answers a non-member', file: API,
      find: "r.coach_slug === slug)) : null;\n    if (!reader.member) return rating ? NextResponse.json({ reviews: [], locked: true, ...rating }) : RATINGS_UNREAD();\n",
      replace: "r.coach_slug === slug)) : null;\n" },
    { name: 'api: ?coach gives a non-member no rating', file: API,
      find: "r.coach_slug === slug)) : null;\n    if (!reader.member) return rating ? NextResponse.json({ reviews: [], locked: true, ...rating })",
      replace: "r.coach_slug === slug)) : null;\n    if (!reader.member) return rating ? NextResponse.json({ reviews: [], locked: true })" },
    { name: 'api: ?coach, the ratings unread, is a locked empty list', file: API,
      find: "r.coach_slug === slug)) : null;\n    if (!reader.member) return rating ? NextResponse.json({ reviews: [], locked: true, ...rating }) : RATINGS_UNREAD();",
      replace: "r.coach_slug === slug)) : null;\n    if (!reader.member) return NextResponse.json({ reviews: [], locked: true, ...(rating || {}) });" },
    { name: 'api: the ratings function is never read', file: API,
      find: '  if (!rpc.error) return ((rpc.data', replace: '  if (false) return ((rpc.data' },
    { name: "api: a member's rating falls back to the capped page", file: API,
      find: '    return NextResponse.json({ reviews, ...(rating || {}) });', replace: '    return NextResponse.json({ reviews, ...(rating || { avg: 0, count: reviews.length }) });' },
    { name: "api: a profile's rating reads every coach's", file: API,
      find: "  const args = scope ? ('owner' in scope ? { p_owner: scope.owner } : { p_slug: scope.slug }) : {};", replace: '  const args = {};' },
    { name: 'api: any failure of the ratings function falls back to the rows', file: API,
      find: "  if (code !== 'PGRST202' && code !== '42883') return null;\n", replace: '' },
    // ── the migration ──
    { name: 'sql: anyone reads every review again', file: SQL,
      find: '  using (user_id = auth.uid() or owner_id = auth.uid() or public.shape_viewer_is_member());',
      replace: '  using (true);' },
    { name: 'sql: the policy opens to anon', file: SQL,
      find: '  for select to authenticated\n', replace: '  for select to anon, authenticated\n' },
    { name: 'sql: a canceled newest subscription still counts', file: SQL,
      find: "         where newest.status in ('active', 'trialing', 'past_due')",
      replace: "         where newest.status in ('active', 'trialing', 'past_due', 'canceled')" },
    { name: 'sql: anon may run the membership check', file: SQL,
      find: 'revoke all on function public.shape_viewer_is_member() from anon;\n', replace: '' },
    { name: 'sql: the ratings ignore the coach asked for', file: SQL,
      find: '  where (p_owner is null or r.owner_id = p_owner)\n    and (p_slug is null or r.coach_slug = p_slug)\n', replace: '' },
    { name: 'sql: the ratings carry the words', file: SQL,
      find: '  select r.coach_slug, r.owner_id, coalesce(sum(r.rating), 0)::bigint, count(*)::bigint\n',
      replace: '  select r.coach_slug, r.owner_id, coalesce(sum(r.rating), 0)::bigint, count(*)::bigint, max(r.body)\n' },
    // ── the screens ──
    { name: 'trainer profile: a locked answer reads as no reviews', file: TRAINER,
      find: 'locked: d.locked === true }); }).catch(() => {});', replace: 'locked: false }); }).catch(() => {});' },
    { name: 'trainer profile: Join skips the account a guest needs', file: TRAINER,
      find: "    if (W.bsRequireAccount && !W.bsRequireAccount(tr('marketplace:listing.reviewsJoin', { defaultValue: 'read the reviews' }))) return;\n", replace: '' },
    { name: 'trainer profile: Join calls the backend bare', file: TRAINER,
      find: '    W.bsStartPlatformCheckout?.();', replace: '    W.ShapeMembershipApi?.startCheckout?.();' },
    { name: 'listing: a locked answer reads as no reviews', file: MKT,
      find: '        setRevLocked(d.locked === true);', replace: '        setRevLocked(false);' },
    { name: 'signal profile: a locked answer reads as no reviews', file: APP,
      find: '        setRevLocked(d.locked === true);', replace: '        setRevLocked(false);' },
    { name: 'website: a locked answer reads as no reviews', file: WEB,
      find: '      setRevLocked(j.locked === true);', replace: '      setRevLocked(false);' },
  ],
};
