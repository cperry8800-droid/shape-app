// Shared audience rule for website settings and app workout publishers.
export const BS_PRIVACY_RANK = { public: 0, followers: 1, private: 2 };
export function bsWorkoutSharePrivacy(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  if (String(d.shareWorkoutData || 'On') === 'Off') return 'private';
  if (String(d.profileVisibility || 'Public') === 'Private') return 'private';
  if (String(d.profileVisibility || 'Public') === 'Just friends') return 'followers';
  return 'public';
}
