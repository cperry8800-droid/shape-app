// Cook Mode resume — the pure half.
//
// A resume stamp is a NUMERIC index into a step list, and that list can change
// between the save and the reopen: a coach edits the method, the catalogue ships
// a new version, a different cookable tier resolves different steps. `bsCookKey`
// is derived from the meal id / title, so it stays IDENTICAL across such an edit
// — a matching key is NOT evidence that step 4 is still the same step.
//
// Resuming a renumbered recipe drops the cook mid-method at the wrong
// instruction with nothing on screen to say so. So the stamp fingerprints the
// WHOLE method it was written against, and any mismatch yields NO resume rather
// than a confidently wrong one — the same absence-over-invention rule the rest
// of Cook Mode runs on.

// One step's text, whitespace-normalised and UNTRUNCATED. Accepts the bare
// string and the PR-E authored object shape ({ t, station }).
//
// Deliberately unbounded: this feeds the fingerprint, and truncating it would
// make every edit past the cut invisible — an "any edit anywhere" contract that
// silently stops applying at character 80.
const normStep = (s) =>
  String(s == null ? '' : (s && typeof s === 'object' && s.t != null ? s.t : s))
    .replace(/\s+/g, ' ').trim();

// Fingerprint of the ENTIRE method: FNV-1a over every step's full normalised
// text, each LENGTH-PREFIXED.
//
// Checking only the list length and the step AT THE SAVED INDEX is not enough: a
// coach can replace or reorder an EARLIER instruction — a substituted
// preparation, an added safety step — without changing either, and the cook
// would resume past a method that changed underneath them.
//
// The length prefix is what makes the concatenation unambiguous, and a separator
// character cannot do that job: there is no character step text is guaranteed
// not to contain. `\s+` normalisation does NOT strip control characters, so even
// U+001F survives and ['ab','c'] would serialise identically to ['a','bc'].
// Prefixing each step with its own length removes the need for an "impossible"
// character entirely.
export const bsCookStepsSig = (steps) => {
  const list = Array.isArray(steps) ? steps : [];
  let joined = '';
  for (const s of list) {
    const t = normStep(s);
    joined += `${t.length}:${t}`;
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${list.length}:${h.toString(36)}`;
};

// A usable recipe identity / calendar day. Required on BOTH sides: without it
// `undefined === undefined` let a stamp carrying NO recipe and NO day validate
// against a caller that also had neither.
const idOk = (v) => typeof v === 'string' && v.trim() !== '';

// The record to persist. `day` is the caller's local calendar day.
export function bsCookResumeStamp(key, stepIdx, steps, day) {
  return { key, stepIdx, sig: bsCookStepsSig(steps), day };
}

// The stamp if it still describes THIS recipe's current method today, else null.
// A pre-hardening stamp (no `sig`) fails the fingerprint check and is discarded —
// one missed resume after deploy, never a wrong one.
export function bsCookResumeValid(stamp, key, steps, day) {
  if (!stamp || typeof stamp !== 'object') return null;
  if (!idOk(key) || !idOk(day)) return null;               // no identity to match on
  if (stamp.key !== key) return null;
  if (stamp.day !== day) return null;                      // another day's cook
  if (!Number.isInteger(stamp.stepIdx) || stamp.stepIdx < 0) return null;
  const list = Array.isArray(steps) ? steps : [];
  if (stamp.stepIdx >= list.length) return null;           // index outside the method
  if (stamp.sig !== bsCookStepsSig(list)) return null;     // the method changed
  return stamp;
}
