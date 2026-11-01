// What Nora is doing while she looks something up (speed, 2026-11-01). A round of hers that
// turns out to be a tool call writes no words, so the panel sat on three dots for the lookup
// and the round after it. The chat route now sends a `status` event with one of these keys
// before the tools run, and each panel shows its own words for it ("Checking your plan…") until
// her reply starts: the app from its catalogs (feed:support.status.<key>, all 13 locales), the
// website from its English copy (chatWidget.jsx NORA_STATUS_WORDS).
//
// ⚠ A KEY, NEVER WORDS: the server does not know the panel's language, and a key the panel does
// not know falls back to `lookup` ("Looking that up…"), so a new tool can never show nothing.
//
// Plain ESM, no deps: node:test drives statusForTools() directly.

export const NORA_STATUS_KEYS = Object.freeze(['plan', 'progress', 'account', 'food', 'coaches', 'clients', 'draft', 'lookup']);

const STATUS_OF = Object.freeze({
  get_training_plan: 'plan',
  get_coaching: 'plan',
  get_reminders: 'plan',
  get_habits: 'plan',
  get_recent_workouts: 'progress',
  get_week_summary: 'progress',
  get_mornings: 'progress',
  get_points: 'progress',
  get_account: 'account',
  admin_lookup_account: 'account',
  find_food: 'food',
  recommend_coaches: 'coaches',
  find_client: 'clients',
  get_client_snapshot: 'clients',
  get_coach_today: 'clients',
  // Every change is drafted as a card the member confirms, so a write tool is "getting it ready".
  draft_workout: 'draft',
  draft_meal_plan: 'draft',
  log_meal: 'draft',
  log_weigh_in: 'draft',
  log_water: 'draft',
  check_habit: 'draft',
  set_reminder: 'draft',
  set_client_goal: 'draft',
  assign_workout: 'draft',
  assign_meal_plan: 'draft',
  set_program_detail: 'draft',
  add_review_note: 'draft',
  reschedule_session: 'draft',
  fill_form: 'draft',
});

/** The status for a round's tool calls: the first that has one, else `lookup`. */
export function statusForTools(names) {
  const list = Array.isArray(names) ? names : [];
  for (const n of list) {
    const key = STATUS_OF[String(n)];
    if (key) return key;
  }
  return 'lookup';
}

/** A key a panel can show: one of NORA_STATUS_KEYS, else `lookup`. */
export function cleanStatusKey(key) {
  return NORA_STATUS_KEYS.includes(key) ? key : 'lookup';
}
