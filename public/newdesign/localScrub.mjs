// Sign-out content scrub — THE CANONICAL INVENTORY (shared-device hygiene).
//
// WHY ONE UNION LIST: scripts/build-m.sh publishes the mobile app at /m/ under
// the WEBSITE's origin, so the two surfaces share one localStorage and one
// sessionStorage. Separate per-surface inventories therefore leave holes in
// BOTH directions — a member who used the website and signed out through /m/
// kept shapeClientIntake_v1 (health details) and shapeConsultations (contact
// details) for the next device user, and a website sign-out left the mobile
// families (shape.clientIntakes, shape.messages, …) behind the same way.
// Every sign-out path must scrub the UNION, whichever surface it runs on.
//
// CONSUMERS:
//   - Mobile: iosAppBroadsheetMain.jsx handleLogout imports and calls
//     shapeScrubLocalUserContent() (via the services/localScrub.mjs shim) —
//     a real import, so the mobile side can never drift from this file.
//   - Website: pageShell.jsx (window.shapeClearLocalUserContent) and the
//     supabase.js fallback twin are CLASSIC scripts that cannot import an ES
//     module, so they carry inline copies of these lists.
//     tests/local-scrub-sync.test.mjs parses both files and fails the suite
//     when either copy's key set diverges from this module — the KEEP-IN-SYNC
//     comment upgraded to an enforced gate (the store-catalogue-sync pattern).
//
// SCOPE: user content that is sensitive or account-scoped. Device-only
// personal lists with no cloud copy (legacy shapeRecipes_v1 / shapeGrocery*,
// shape-pwa-*) are deliberately KEPT — clearing them destroys the member's own
// data, not a cache. Preferences (tweaks, locale, tour flags, consent) stay.
//
// ⚠ ONE DOCUMENTED PER-SURFACE DIVERGENCE: shape.storeCart (merch cart —
// item ids + quantities only, no address). The website's scrub KEEPS it under
// the device-personal carve-out (pageShell.jsx records that ruling); the
// mobile sign-out has always cleared it and still does, passed as an extraKey
// by its caller. It is therefore NOT in the union below.

export const SHAPE_SCRUB_KEYS = [
  // ── website / newdesign families ──────────────────────────────────────────
  'shapeClientIntake_v1',   // signup intake — can carry health details
  'shapeConsultations',     // bookings — contact details
  'shape.dashMealDrafts',   // coach drafts about named clients
  'shape.dashBuilderDrafts',
  'shape.viewerRole',
  // ── legacy root-page keys (pre-newdesign pages still write these) ────────
  'shapeMealLog', 'shapeWorkoutLog',          // health-behavior logs
  'shapeMealSchedule', 'shapeSchedule',       // the account's schedule
  'shapeWaterToday',                          // hydration log
  'shapeMessagingSetting',                    // messaging privacy setting
  'shapePurchasedWorkouts', 'shapeRedeemedRewards', // purchases + reward codes
  'shapeLibRemovedWorkouts',                  // library tombstones
  'shapeRadioLoggedIn',
  'trainerSalesGoalWeekly', 'trainerSalesGoalMonthly', 'trainerSalesGoalAnnual',
  'nutritionistSalesGoalWeekly', 'nutritionistSalesGoalMonthly', 'nutritionistSalesGoalAnnual',
  // ── mobile /m/ families ──────────────────────────────────────────────────
  'shape.clientCoachThreads',   // DM fallback message text
  'shape.recentSearch',         // other members' names/ids
  'shape.errorLog',             // stacks can embed app-state strings
  'shape.library',              // cloud copy is authoritative
  'shape.recipeGroceryLists',   // cloud-synced via user_goals
  'shape.deletedGroceryIds',    // account-scoped sync tombstones
  'shape.cookResume',
  'shape.radio.musicLibraries',
  'bs_coach_soundtracks',
  'bs_coach_soundtrack_assign',
  // The saveLocalRecord() fallback families (shapeBackend.js): records a
  // failed Supabase write keeps on-device — intake with DOB/medical details,
  // messages, sessions, refund requests, applications. Nothing ever replays
  // them to the server, so clearing loses no durable data.
  'shape.clientIntakes',
  'shape.clientProfiles',
  'shape.clientWorkoutUpdates',
  'shape.coachWorkoutReviewNotes',
  'shape.communityComments',
  'shape.communityPosts',
  'shape.messages',
  'shape.providerApplications',
  'shape.providerAvailability',
  'shape.providerMessages',
  'shape.refundRequests',
  'shape.sessionUpdates',
  'shape.sessions',
  'shape.trainerPlaylists',
  'shape.workoutSessions'
];

// Prefixed families — all account-scoped state a next user would inherit.
// The KEEP-list keys (shapeGrocery*, shapeRecipes_v1, shape-pwa-*) do not
// match these prefixes.
export const SHAPE_SCRUB_PREFIXES = [
  'shape.chat.v2.',       // per-user chat threads
  'shape.dashGoals.',     // per-client goal drafts
  'shape.habits.',        // same-day habit completion (health behavior)
  'shape.dashQueueDone.', // coach programming queue — client IDs marked done
  'shape.dashMealLog.',   // today's meal-log ticks
  'shape.dashMealSwap.',  // today's meal swaps
  'shape.dashNutriSwap.', // nutritionist-side day swaps
  // Legacy role families (profiles, client messages/check-ins, plans,
  // assigned content, widget libs — all account-scoped):
  'shapeTrainer', 'shapeNutritionist', 'shapeClient'
];

// sessionStorage is a SEPARATE store (per-tab; a same-tab sign-out hands it
// to the next user). The legacy live-workout flow is its only writer of user
// CONTENT: clients.html → shapeLiveWorkout (exercises/reps/weights),
// live-workout.html → shapeLiveWorkoutResult (the completed health record).
export const SHAPE_SCRUB_SESSION_KEYS = ['shapeLiveWorkout', 'shapeLiveWorkoutResult'];

export function shapeScrubLocalUserContent({ extraKeys = [] } = {}) {
  try {
    const ls = window.localStorage;
    SHAPE_SCRUB_KEYS.concat(extraKeys).forEach((k) => { try { ls.removeItem(k); } catch (e) {} });
    for (let i = ls.length - 1; i >= 0; i--) {
      const key = ls.key(i);
      if (!key) continue;
      for (let j = 0; j < SHAPE_SCRUB_PREFIXES.length; j++) {
        if (key.indexOf(SHAPE_SCRUB_PREFIXES[j]) === 0) { ls.removeItem(key); break; }
      }
    }
  } catch (e) {}
  try {
    SHAPE_SCRUB_SESSION_KEYS.forEach((k) => { try { window.sessionStorage.removeItem(k); } catch (e) {} });
  } catch (e) {}
}
