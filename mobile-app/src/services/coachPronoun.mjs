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

// A title before the name is not the first name: "Dr. Maya Patel" reads "Maya's day", never
// "Dr.'s day" (the sample nutritionist did). Matched without its dot and in any case; a name that
// is only a title keeps it.
const BS_NAME_TITLES = new Set(['dr', 'dra', 'prof', 'mr', 'mrs', 'ms', 'mx', 'miss', 'sr', 'sra', 'srta', 'dott', 'dottssa', 'coach', 'chef']);
/** The first name a profile addresses the coach by, from their display name. */
export function bsCoachFirstName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && BS_NAME_TITLES.has(parts[0].replace(/\.$/, '').toLowerCase())) parts.shift();
  return parts[0] || '';
}

