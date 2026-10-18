// Where each kind of notification goes beyond the app: which stay off the website, and which may
// be emailed. The server (/api/notifications, the push webhook, lib/ai/notifications.mjs) and the
// app import this file; the website's settings pages, which are not modules, keep a copy that
// tests/notification-email.test.mjs holds to it.
//
// Notifications that belong on the phone only (owner, 2026-10-16: "that list is good for phone
// only"). The website bell leaves them out, and its "Mark all read" and "Clear all" leave them
// alone; the app's list shows them and they push to the phone as before. They are the nudges a
// member acts on where they are: the reminders they set, the night-before meal-prep reminder,
// and habit and streak nudges.
export const PHONE_ONLY_TYPES = Object.freeze([
  'reminder_weigh_in',
  'reminder_checkin',
  'reminder_daily_checkin',
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

// Email is offered only for what belongs in an inbox (owner, 2026-10-16: "Important types only";
// for the rest "dont show period. save those other ones for notifications"; and "for email
// include welcome email and when you tier up"). Every other type is in-app and push only: its
// Email switch is not shown, and an Email setting saved for it earlier never sends. These are
// preference types, the names the settings store (a coach's chat message is `coach_message`).
// The welcome email is not here because it is not a notification setting: it always goes out
// when the membership starts (lib/coach-thread.ts welcomeMember).
export const EMAIL_TYPES = Object.freeze([
  'coach_message',
  'waitlist_invite',
  'tier_up',
  // A coach's: someone joined their waiting list.
  'waitlist_join',
]);

// Email on unless the member turns it off: a tier-up happens a handful of times, ever.
export const EMAIL_ON_BY_DEFAULT = Object.freeze(['tier_up']);

export const isEmailType = (type) => EMAIL_TYPES.includes(type);
export const emailOnByDefault = (type) => EMAIL_ON_BY_DEFAULT.includes(type);
