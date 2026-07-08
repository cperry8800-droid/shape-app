// The ONE rule for the community feed's viewing modes. UNIVERSAL is the whole
// community's public activity (exactly the pre-toggle feed); FOLLOWING is the
// viewer's accepted follows + themself, and only there may 'followers'-tier
// posts surface. RLS is the authority — these specs narrow queries, they can
// never widen visibility.
export const BS_FEED_MODES = ['universal', 'following'];

export function bsFeedQuerySpec(mode, uid, followingIds) {
  if (mode !== 'following') return { privacyIn: ['public', 'community'], authorIn: null };
  const ids = Array.isArray(followingIds) ? followingIds : [];
  return {
    privacyIn: ['public', 'community', 'followers'],
    authorIn: [...new Set(uid ? [...ids, uid] : ids)],
  };
}
