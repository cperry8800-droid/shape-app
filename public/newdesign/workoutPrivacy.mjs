// Shared audience rule for website settings and app workout publishers.
// Narrowest last. 'friends' (mutual follows) is narrower than 'followers', because a friend
// is always a follower (2026-10-30-workout-friends-audience.sql).
export const BS_PRIVACY_RANK = { public: 0, followers: 1, friends: 2, private: 3 };
export function bsWorkoutSharePrivacy(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  if (String(d.shareWorkoutData || 'On') === 'Off') return 'private';
  if (String(d.profileVisibility || 'Public') === 'Private') return 'private';
  if (String(d.shareWorkoutData || 'On') === 'Friends') return 'friends';
  if (String(d.profileVisibility || 'Public') === 'Just friends') return 'followers';
  return 'public';
}
