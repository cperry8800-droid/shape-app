// Which words a coach's profile uses for them: "Her day" / "His day" / "Their day", or their
// first name when they have not said (owner, 2026-10-27: "her day, or his day").
//
// ⚠ ONLY THE PRONOUNS THE COACH WROTE ON THEIR PROFILE DECIDE IT, never their name or photo.
// Anything that is not plainly she, he or they (an empty field, "any", "ze/zir", a typo) reads
// as the coach's first name: "Maya's day", "Work with Maya".

/** 'her' | 'him' | 'them' | null, from the free-text pronouns field ("she/her", "He", "they/them"). */
export function bsCoachPronoun(pronouns) {
  const first = String(pronouns || '').trim().toLowerCase().split(/[\s/,·|]+/)[0] || '';
  if (first === 'she' || first === 'her') return 'her';
  if (first === 'he' || first === 'him') return 'him';
  if (first === 'they' || first === 'them') return 'them';
  return null;
}
