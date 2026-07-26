// Cook Mode resume — the pure half.
//
// A resume stamp is a NUMERIC index into a step list, and that list can change
// between the save and the reopen: a coach edits the method, the catalogue ships
// a new version, a different cookable tier resolves different steps. `bsCookKey`
// is derived from the meal id / title, so it stays IDENTICAL across such an edit
// — a matching key is NOT evidence that step 4 is still the same step.
//
// Resuming a renumbered recipe drops the cook mid-method at the wrong
// instruction with nothing on screen to say so. So the stamp records the list it
// was written against (length + a signature of the step at that index), and any
// mismatch yields NO resume rather than a confidently wrong one — the same
// absence-over-invention rule the rest of Cook Mode runs on.

// Bounded, whitespace-normalised signature of one step's text. Accepts the bare
// string and the PR-E authored object shape ({ t, station }).
export const bsCookStepSig = (s) =>
  String(s == null ? '' : (s && typeof s === 'object' && s.t != null ? s.t : s))
    .replace(/\s+/g, ' ').trim().slice(0, 80);

// The record to persist. `day` is the caller's local calendar day.
export function bsCookResumeStamp(key, stepIdx, steps, day) {
  const list = Array.isArray(steps) ? steps : [];
  return { key, stepIdx, len: list.length, at: bsCookStepSig(list[stepIdx]), day };
}

// The stamp if it still describes THIS recipe's current step list today, else
// null. A pre-hardening stamp (no len/at) fails the length check and is
// discarded — one missed resume after deploy, never a wrong one.
export function bsCookResumeValid(stamp, key, steps, day) {
  if (!stamp || typeof stamp !== 'object') return null;
  if (stamp.key !== key) return null;
  if (stamp.day !== day) return null;                          // another day's cook
  if (!Number.isInteger(stamp.stepIdx) || stamp.stepIdx < 0) return null;
  const list = Array.isArray(steps) ? steps : [];
  if (stamp.stepIdx >= list.length) return null;               // list got shorter
  if (stamp.len !== list.length) return null;                  // steps added/removed
  if (stamp.at !== bsCookStepSig(list[stamp.stepIdx])) return null; // that step changed
  return stamp;
}
