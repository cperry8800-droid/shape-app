// The member's health screening (user_goals 'health_profile'): when it is complete, when it is due for
// its yearly review, and what changed between two saves. Pure: the app (first run), the website and the
// server (hasCompletedScreening, the save route that tells the coaches) all read these.
//
// ⚠ SHAPE RECORDS WHAT THE MEMBER REPORTS; IT NEVER INTERPRETS IT (owner, 2026-11-12: "any medication a
// client is on we want to be aware of for insurance and liability reasons", "and any other conditions
// that develop in the future", "add a yearly screening confirming if anything has changed"). Their
// coaches see every answer; a coach, a dietitian or the member's doctor reads it.

/** Days a screening stays current before the member is asked to confirm it again. */
export const HEALTH_REVIEW_DAYS = 365;

const YN = (v) => v === 'yes' || v === 'no';

/** A yes/no the form now asks outright, read off an older profile where it can be: a condition or an
 *  injury written down is a yes. Null when it was never answered. */
export function healthAnswer(doc, key) {
  if (!doc || typeof doc !== 'object') return null;
  if (YN(doc[key])) return doc[key];
  if (key === 'conditionsAny') {
    const tags = Array.isArray(doc.conditionTags) ? doc.conditionTags.filter(Boolean) : [];
    if (tags.length || (typeof doc.conditions === 'string' && doc.conditions.trim())) return 'yes';
  }
  if (key === 'injuriesAny' && typeof doc.injuries === 'string' && doc.injuries.trim()) return 'yes';
  return null;
}

/** When the member last confirmed it: the review stamp, else its last save, else its consent. */
export function healthLastConfirmed(doc) {
  if (!doc || typeof doc !== 'object') return null;
  for (const k of ['confirmedAt', 'updatedAt', 'consentAt']) {
    const v = doc[k];
    if (typeof v === 'string' && Number.isFinite(Date.parse(v))) return v;
  }
  return null;
}

/** Every required answer is in: the consent, the GLP-1 question, and the conditions and injuries
 *  questions (an older profile's written answers count). */
export function healthScreeningComplete(doc) {
  if (!doc || typeof doc !== 'object' || !doc.consentAt) return false;
  return YN(doc.glp1) && healthAnswer(doc, 'conditionsAny') !== null && healthAnswer(doc, 'injuriesAny') !== null;
}

/** Complete, and confirmed within HEALTH_REVIEW_DAYS. */
export function healthScreeningCurrent(doc, now = Date.now()) {
  if (!healthScreeningComplete(doc)) return false;
  const at = Date.parse(healthLastConfirmed(doc) || '');
  return Number.isFinite(at) && now - at < HEALTH_REVIEW_DAYS * 86_400_000;
}

// What a coach is told changed: each part of the screening, by the fields that make it up.
const PARTS = [
  ['screening', ['parq']],
  ['medication', ['rxMeds', 'medications']],
  ['glp1', ['glp1']],
  ['conditions', ['conditionsAny', 'conditions', 'conditionTags']],
  ['injuries', ['injuriesAny', 'injuries']],
  ['pregnancy', ['pregnancy']],
  ['allergies', ['allergies', 'allergyDetails']],
];
export const HEALTH_PARTS = PARTS.map(([p]) => p);
const norm = (v) => {
  if (v == null || v === '') return null;
  if (Array.isArray(v)) return JSON.stringify(v.map((x) => (typeof x === 'string' ? x.trim() : x)));
  return typeof v === 'string' ? v.trim() : JSON.stringify(v);
};

/** The parts of the screening that differ between two saves, in the form's order; [] for none or no
 *  earlier save (a first screening changes nothing a coach had). */
export function healthChangedParts(prev, next) {
  if (!prev || typeof prev !== 'object' || !next || typeof next !== 'object') return [];
  return PARTS.filter(([, fields]) => fields.some((f) => norm(prev[f]) !== norm(next[f]))).map(([p]) => p);
}
