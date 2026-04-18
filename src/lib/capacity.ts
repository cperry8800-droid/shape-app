// Single source of truth for "is this provider currently at capacity?".
// A coach is effectively at capacity when:
//   * at_capacity is true, AND
//   * either no resume date is set, or the resume date is still in the future.
// Once the resume date passes, we treat them as accepting again even if
// the DB column hasn't been flipped yet (lazy cleanup happens on next
// dashboard visit).

export function isEffectivelyAtCapacity(provider: {
  at_capacity: boolean | null | undefined;
  capacity_resume_at: string | null | undefined;
}): boolean {
  if (!provider.at_capacity) return false;
  const resume = provider.capacity_resume_at;
  if (!resume) return true;
  return new Date(resume).getTime() > Date.now();
}
