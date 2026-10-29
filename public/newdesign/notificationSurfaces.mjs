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

// The switch each kind of notification answers to: the preference type the settings store, for the
// push (/api/push/dispatch), the app's list and the website's bell (/api/notifications) and the
// app's toast. A type not listed answers to its own name, which is the switch for every
// preference-aware writer's type (waitlist_invite, tier_up, meal_prep, friend_habit, new_client,
// shared_client, the AI's). The reminders a member sets (reminder_*) are switched one by one where
// they are set.
// ⚠ EVERY KIND A PERSON CAN RECEIVE HAS A SWITCH (owner, 2026-10-26: "make sure users have the ability
// to customize/toggle which notifications they want"): tests/notification-switches.test.mjs holds the
// settings screens to this map.
// ⚠ BEFORE THESE, ONLY "MUTE EVERYTHING" STOPPED THEM (owner, 2026-10-26: "fix 1-7"): a coach's new
// plans, sessions, follows, payments and a coach's client messages had no switch, and the daily
// Shape Score push ignored the Score switch.
export const PREFERENCE_OF = Object.freeze({
  // What a coach sends a member.
  workout: 'coach_content',
  program: 'coach_content',
  meal_plan: 'coach_content',
  grocery: 'coach_content',
  // Sessions, on either side.
  session_booked: 'sessions',
  session_confirmed: 'sessions',
  session_declined: 'sessions',
  session_rescheduled: 'sessions',
  session_cancelled: 'sessions',
  session_paid: 'sessions',
  intro_followup: 'sessions',
  booking_request: 'sessions',
  // Followers.
  follow: 'follows',
  follow_request: 'follows',
  follow_accept: 'follows',
  // Money: a member's receipt, a coach's sale or renewal, the owners' notice.
  payment_receipt: 'payments',
  payment: 'payments',
  platform_payment: 'payments',
  // The Shape Score: the daily dip and the weekly commitment answer to the Score switch.
  score_accountability: 'score_drop',
  score_commitment: 'score_drop',
  // From Shape itself: the welcome, and a note about the account (workouts now share automatically).
  membership_welcome: 'account',
  general: 'account',
  // A coach's certifications: verified, a fix needed, not verified, a renewal coming up.
  credential_verified: 'credentials',
  credential_changes: 'credentials',
  credential_rejected: 'credentials',
  credential_expiry: 'credentials',
  // The database writes a co-sign as 'cosign'; the setting is "Co-signs".
  cosign: 'coach_cosign',
});

// A message's switch is the recipient's side of it (data.side, the message trigger): a member's own
// coach writing is "Coach messages"; a client or the care team writing to a coach is "Client
// messages"; another member's direct message is "Messages". A row written before `side` has none.
export function preferenceTypeFor(type, data) {
  if (type === 'message') {
    const side = data && typeof data === 'object' ? data.side : null;
    if (side === 'client') return 'coach_message';
    if (side === 'coach') return 'client_message';
    if (side === 'member') return 'direct_message';
    return 'message';
  }
  return Object.prototype.hasOwnProperty.call(PREFERENCE_OF, type) ? PREFERENCE_OF[type] : type;
}

// What a set of switched-off switches hides, as PostgREST lists for a query: `types` for
// `.not('type', 'in', …)` and `sides`, the message sides, for the `data->>side` filter; null when
// there are none. The inverse of preferenceTypeFor, so the list leaves them out before its row cap.
// It never hides a row preferenceTypeFor would show. The one switch it can't express, a bare
// 'message' (a message with no side), is left to the filter after the query. A switch is the
// reader's own row, so anything but a snake_case word is skipped rather than written into a filter.
const SIDE_OF_SWITCH = Object.freeze({ coach_message: 'client', client_message: 'coach', direct_message: 'member' });
export function switchedOffFilter(switches) {
  const off = new Set([...(switches || [])].filter((s) => typeof s === 'string' && /^[a-z0-9_]+$/.test(s)));
  const types = new Set();
  for (const [type, pref] of Object.entries(PREFERENCE_OF)) if (off.has(pref)) types.add(type);
  for (const s of off) if (s !== 'message' && !Object.prototype.hasOwnProperty.call(PREFERENCE_OF, s)) types.add(s);
  const sides = [...off].filter((s) => Object.prototype.hasOwnProperty.call(SIDE_OF_SWITCH, s)).map((s) => SIDE_OF_SWITCH[s]);
  const list = (xs) => (xs.length ? `(${[...xs].sort().join(',')})` : null);
  return { types: list([...types]), sides: list(sides) };
}
