// Notifications that belong on the phone only (owner, 2026-10-16: "that list is good for phone
// only"). The website bell leaves them out, and its "Mark all read" and "Clear all" leave them
// alone; the app's list shows them and they push to the phone as before. They are the nudges a
// member acts on where they are: the reminders they set, the night-before meal-prep reminder,
// and habit and streak nudges.
export const PHONE_ONLY_TYPES = Object.freeze([
  'reminder_weigh_in',
  'reminder_checkin',
  'reminder_water',
  'reminder_photo',
  'reminder_custom',
  'meal_prep',
  'habit_reminder',
  'streak_broken',
  // The AI notify layer stores its nudges as `ai_<type>` (lib/ai/notify-core.ts deliver), so
  // those are the rows a member actually receives.
  'ai_habit_reminder',
  'ai_streak_broken',
]);

export const isPhoneOnly = (type) => PHONE_ONLY_TYPES.includes(type);

// The PostgREST list for `.not('type', 'in', …)`. Every type is a bare snake_case word, so none
// needs quoting.
export const PHONE_ONLY_IN = `(${PHONE_ONLY_TYPES.join(',')})`;
