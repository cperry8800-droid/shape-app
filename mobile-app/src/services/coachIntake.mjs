// What a coach sees about who the client is (client-onboarding review, fix 2c: H8, M17).
// get_client_intake (2026-10-15-coach-client-intake.sql) answers the screening, the goal, the
// training and diet preferences and the coaching answer in one read; this turns it into the rows
// both coach views show. Pure: the server (src/lib/shared-overview.ts, for the website, in
// English) and the app's case file (iosAppBroadsheetPros.jsx, with its translator) share it.
//
// The row labels are the member's own Settings labels (settings:training.* / settings:nutrition.*,
// in every catalog), and the values go through the Settings option table, so a coach reads the
// words the member picked, not a stored token.

import { bsPrefOptionLabel } from './prefOptions.mjs';

export const COACH_INTAKE_ROWS = [
  { section: 'training', key: 'primary_goal', labelKey: 'settings:training.primaryGoal', en: 'Primary goal' },
  { section: 'training', key: 'experience', labelKey: 'settings:training.experience', en: 'Experience' },
  { section: 'training', key: 'sessions_per_week', labelKey: 'settings:training.sessionsPerWeek', en: 'Sessions / week' },
  { section: 'training', key: 'equipment', labelKey: 'settings:training.equipment', en: 'Equipment access' },
  { section: 'training', key: 'injuries', labelKey: 'settings:training.injuries', en: 'Injuries & notes' },
  { section: 'training', key: 'preferred_times', labelKey: 'settings:training.preferredTimes', en: 'Preferred times' },
  { section: 'nutrition', key: 'dietary_style', labelKey: 'settings:nutrition.dietaryStyle', en: 'Dietary style' },
  { section: 'nutrition', key: 'allergies', labelKey: 'settings:nutrition.allergies', en: 'Allergies' },
  { section: 'nutrition', key: 'dislikes', labelKey: 'settings:nutrition.dislikes', en: 'Dislikes' },
  { section: 'nutrition', key: 'protein_target_g', labelKey: 'settings:nutrition.proteinTarget', en: 'Protein target (g/day)' },
  { section: 'nutrition', key: 'calorie_range', labelKey: 'settings:nutrition.calorieRange', en: 'Calorie range' },
  { section: 'nutrition', key: 'meal_cadence', labelKey: 'settings:nutrition.mealCadence', en: 'Meal cadence' },
  { section: 'nutrition', key: 'supplements', labelKey: 'settings:nutrition.supplements', en: 'Supplements' },
  { section: 'nutrition', key: 'alcohol', labelKey: 'settings:nutrition.alcohol', en: 'Alcohol' },
  { section: 'nutrition', key: 'hydration_target_l', labelKey: 'settings:nutrition.hydrationTarget', en: 'Hydration target (L/day)' },
];

const label = (tr, key, en) => {
  if (typeof tr !== 'function') return en;
  try {
    const out = tr(key, { defaultValue: en });
    return typeof out === 'string' && out && out !== key ? out : en;
  } catch {
    return en;
  }
};
const text = (v) => (v == null ? '' : typeof v === 'string' ? v.trim() : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');

/**
 * The screening's state for the coach's Needs-you list: 'unknown' when it could not be read,
 * 'missing' when none is on file, 'flagged' when they answered yes to a screening question,
 * 'clear' otherwise.
 */
export function screeningState(health, readFailed) {
  if (readFailed) return 'unknown';
  if (!health || typeof health !== 'object' || !health.consentAt) return 'missing';
  return health.flagged ? 'flagged' : 'clear';
}

/** Whether they want coaching, as one token: 'training' | 'nutrition' | 'both' | 'no' | null (not asked). */
export function coachingAnswer(intake) {
  if (!intake || typeof intake.wantsCoaching !== 'boolean') return null;
  if (!intake.wantsCoaching) return 'no';
  const kinds = Array.isArray(intake.coachingFor) ? intake.coachingFor : [];
  if (kinds.includes('training') && kinds.includes('nutrition')) return 'both';
  if (kinds.includes('nutrition')) return 'nutrition';
  return kinds.includes('training') ? 'training' : 'both';
}

/**
 * The rows a coach view shows, or null when the read answered nothing (not their coach, or the
 * read failed). `goal` is the member's own label (their client_identity mirror), or the token made
 * readable when the mirror is missing; null when they keep their goals to themselves.
 */
export function coachIntakeView(intake, tr) {
  if (!intake || typeof intake !== 'object') return null;
  const rows = (section) => {
    const prefs = intake[section] && typeof intake[section] === 'object' ? intake[section] : {};
    return COACH_INTAKE_ROWS
      .filter((r) => r.section === section)
      .map((r) => {
        const raw = text(prefs[r.key]);
        if (!raw) return null;
        return { key: r.key, label: label(tr, r.labelKey, r.en), value: bsPrefOptionLabel(r.key, raw, tr) || raw };
      })
      .filter(Boolean);
  };
  const token = text(intake.goal);
  const goal = text(intake.goalLabel) || (token ? token.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');
  return {
    goal: goal || null,
    goalShared: intake.goalShared !== false,
    coaching: coachingAnswer(intake),
    training: rows('training'),
    nutrition: rows('nutrition'),
  };
}
