// What the website's member sign-up asks, and where each answer goes (client-onboarding review,
// fix 2: "one record of who the client is").
//
// ⚠ THE WEBSITE FORM USED TO THROW ITS ANSWERS AWAY (review H4). It asked a goal, experience,
// frequency and a whole health intake, and sent only the name, handle and date of birth. The app
// then asked the goal and the health questions again, and no coach ever saw the website's
// answers. Now the form keeps the answers that are not health data in the account's sign-up
// metadata (an email sign-up has no session until the link is opened, so there is nowhere else
// to keep them), and the first signed-in visit, on the website or in the app, writes them to the
// records the app already reads (POST /api/me/onboarding):
//   - client_goals.primaryGoal: the goal's token, as the app's own goal step writes it;
//   - client_identity.goal: the goal's English label, the display mirror the profile card shows;
//   - client_training_prefs.experience and .sessions_per_week: the Settings tokens;
//   - client_onboarding: whether they want personal coaching, and which, plus intentSeen, so the
//     app does not ask the goal again.
// Health answers are not asked on the website any more: only a member who wants personal coaching
// is screened, and the screening is the app's (and, from fix 2b, the website's) one form.
//
// ⚠ AN ANSWER NEVER OVERWRITES ONE ALREADY ON THE RECORD. The member may have set a goal in the
// app before the website's answers arrive (or set it again since), and that one is theirs.
//
// Pure: no I/O. The route does the reading and writing.

import { BS_PREF_OPTIONS } from '../../mobile-app/src/services/prefOptions.mjs';

// The app's goal vocabulary (BS_PRIMARY_GOALS in iosAppBroadsheetClient.jsx) and the website
// form's copy of it (SU_GOALS in signup.jsx); tests/signup-answers.test.mjs holds all three equal.
export const SIGNUP_GOALS = [
  { id: 'fat_loss', en: 'Lose fat' },
  { id: 'muscle', en: 'Build muscle' },
  { id: 'recomp', en: 'Recomp' },
  { id: 'maintain', en: 'Maintain' },
  { id: 'strength', en: 'Get stronger' },
  { id: 'endurance', en: 'Endurance' },
  { id: 'mobility', en: 'Mobility' },
  { id: 'athletic', en: 'Athletic performance' },
  { id: 'health', en: 'General health' },
  { id: 'tone', en: 'Tone up' },
  { id: 'race', en: 'Run a race' },
  { id: 'postpartum', en: 'Postpartum' },
];

/** What kind of personal coaching a member wants. */
export const COACHING_KINDS = ['training', 'nutrition'];

const ids = (row) => (BS_PREF_OPTIONS[row] || []).map((o) => o.id);
const oneOf = (value, allowed) => (typeof value === 'string' && allowed.includes(value) ? value : null);

/**
 * The answers as the form sent them, checked: anything not on a list is dropped. Null when there
 * is nothing to keep (an app sign-up, an account made before this, or junk).
 */
export function normalizeSignupAnswers(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const goal = oneOf(raw.goal, SIGNUP_GOALS.map((g) => g.id));
  const experience = oneOf(raw.experience, ids('experience'));
  const sessionsPerWeek = oneOf(raw.sessionsPerWeek, ids('sessions_per_week'));
  const wantsCoaching = typeof raw.wantsCoaching === 'boolean' ? raw.wantsCoaching : null;
  const coachingFor = wantsCoaching === true && Array.isArray(raw.coachingFor)
    ? COACHING_KINDS.filter((k) => raw.coachingFor.includes(k))
    : [];
  if (!goal && !experience && !sessionsPerWeek && wantsCoaching === null) return null;
  return { goal, experience, sessionsPerWeek, wantsCoaching, coachingFor };
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const blank = (v) => v === undefined || v === null || v === '';

/**
 * The writes that put the answers on the record, given the documents as they stand ({} for a
 * missing one). Each fills only what is empty. client_onboarding comes LAST and carries
 * `seededAt`, so a run that fails part-way is run again on the next visit, and a finished one is
 * never run twice. Null when the account was seeded already.
 */
export function planOnboardingSeed(answers, docs, nowIso) {
  const onboarding = isObj(docs.client_onboarding) ? docs.client_onboarding : {};
  if (onboarding.seededAt) return null;
  const writes = [];
  const fill = (kind, patch) => {
    const cur = isObj(docs[kind]) ? docs[kind] : {};
    const add = {};
    for (const [k, v] of Object.entries(patch)) if (!blank(v) && blank(cur[k])) add[k] = v;
    if (Object.keys(add).length) writes.push({ kind, data: { ...cur, ...add } });
  };
  if (answers.goal) {
    fill('client_goals', { primaryGoal: answers.goal });
    fill('client_identity', { goal: SIGNUP_GOALS.find((g) => g.id === answers.goal).en });
  }
  fill('client_training_prefs', { experience: answers.experience, sessions_per_week: answers.sessionsPerWeek });
  const next = { ...onboarding, seededAt: nowIso };
  if (answers.goal && !onboarding.intentSeen) next.intentSeen = true;
  if (answers.wantsCoaching !== null && typeof onboarding.wantsCoaching !== 'boolean') {
    next.wantsCoaching = answers.wantsCoaching;
    next.coachingFor = answers.coachingFor;
    next.coachingAt = nowIso;
  }
  writes.push({ kind: 'client_onboarding', data: next });
  return writes;
}
