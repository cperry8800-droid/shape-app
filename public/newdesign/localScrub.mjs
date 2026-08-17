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
  // ⚠ SCRUBBED UNCONDITIONALLY, INCLUDING AN UNDELIVERED RECORD — DELIBERATE,
  // and the reason is written here because it reads like a bug and was reported
  // as one. On a shared browser, person A can sign up on the email-confirm path
  // (no session, so nothing can flush yet) and person B's later sign-out then
  // deletes A's pending questionnaire. That IS what happens. It is still the
  // right trade: this record carries PAR-Q answers, injuries and medications,
  // and leaving one account's health data on a shared device after sign-out is
  // the exposure the whole inventory exists to prevent — worse, for the same
  // statute, than re-asking. It is NOT permanent data loss: `healthGate` in
  // iosAppBroadsheetClient.jsx is a REQUIRED, non-escapable pre-app gate keyed
  // on `health_profile.consentAt`, so a member with no delivered intake is made
  // to complete the same PAR-Q before reaching the app — and that document is
  // what the coach read (`get_client_health_profile`) actually surfaces.
  // Do not "fix" this into an owner-scoped keep without revisiting both.
  'shapeClientIntake_v1',   // signup intake — can carry health details
  'shapeClientIntake_v1_synced', // owner email of the intake above — goes with it
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
  'shape.stepGoal',       // account-scoped step target (cloud copy in user_goals) —
                          // inherited indefinitely by a next user with no cloud goal
  'shape.notify.last',    // 30-min notification throttle stamp — suppresses the next
                          // account's evaluation until the previous account's expires
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

// Delete the PWA's CacheStorage buckets (all keys prefixed 'shape-'). The
// service worker registers at scope '/' and only caches same-origin static
// assets as of shape-v133 — but a cache built by an OLDER worker generation
// can hold cross-origin SIGNED media (progress photos, meal-note voice memos,
// credential files — token and all), and CacheStorage otherwise clears only on
// a deploy version bump, never for a departing user on a shared device.
// Returns a promise so a caller that must guarantee completion before a
// navigation (supabase.js signOut) can await it; the scrub below fires it
// fire-and-forget for every other path. Double-delete is a harmless no-op.
//
// ⚠ IRREDUCIBLE RESIDUAL — a page cannot retire its OWN controller, so this
// purge cannot be the last word. On a device still running the pre-v133
// worker, that worker's fetch handler has NO origin check and ends in
// caches.open('shape-v132') + put — and caches.open CREATES a deleted cache —
// so a signed-media GET still in flight when this purge lands can re-create
// the cache after it. Nothing callable from the document prevents that:
// unregister() does not stop the controller of a live page, and neither
// skipWaiting nor clients.claim can preempt a fetch handler already running.
// WHAT REDUCES IT IS THE NEXT WORKER'S INSTALL — reduces, does not close:
// sw.js v133's install deletes EVERY cache unconditionally (caches.keys() →
// delete all, no filter) before opening its own, and it carries skipWaiting()
// + clients.claim(). Sign-out always navigates, and a navigation runs the
// worker update check, so v133 installs and deletes any re-created cache.
// ⚠ THAT IS A MITIGATION, NOT A GUARANTEE — do not record it as one. The
// update runs ASYNCHRONOUSLY alongside the navigation, so the next page can
// be usable before v133 has installed, and an in-flight fetch from the
// discarded document can still land after the install-time delete. The
// uncovered window is therefore any time before v133 takes control — widest
// with no network, where it never installs at all, and on that device v132
// is caching signed media on every page load regardless of sign-out.
// If this ever needs closing, the remedy is a purge on first load UNDER v133
// (cleanup AFTER the new worker controls) — never coordination ahead of the
// navigation, which the page cannot do.
export function shapePurgeShapeCaches() {
  try {
    if (!(window.caches && window.caches.keys)) return Promise.resolve();
    return window.caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.indexOf('shape-') === 0).map((k) => window.caches.delete(k))
    )).catch(() => {});
  } catch (e) { return Promise.resolve(); }
}

// ── CROSS-TAB SIGN-OUT ───────────────────────────────────────────────────────
// WHY: `sessionStorage` is PER TAB, and so is every in-memory cache. Signing
// out in one tab scrubbed and reloaded only THAT document, so a second open tab
// kept shapeLiveWorkout/shapeLiveWorkoutResult and its whole in-memory user
// state until someone closed it — on a shared device, exactly the inheritance
// the scrub exists to stop (recorded as the wave's second residual, #1890).
//
// The mechanism is the `storage` event, which fires in every OTHER same-origin
// document but never in the writer. So the scrub stamps this key last, and each
// surface installs the listener below; siblings scrub and reload themselves.
//
// ⚠ The stamp carries NO user data — a timestamp and a nonce, nothing else.
// ⚠ The nonce is required, not decorative: `storage` fires only when the value
// actually CHANGES, so two sign-outs inside the same millisecond would be
// silent with a bare Date.now().
export const SHAPE_SIGNOUT_STAMP_KEY = 'shape.signedOutAt';

// ⚠ BROADCAST ONLY AFTER THE SERVER SESSION IS GONE. A sibling reacts by
// RELOADING, and a reload re-renders against whatever the server still
// believes: stamped too early, a sibling dashboard tab reloads while its
// cookie is still valid, comes back signed IN, and no second event ever
// arrives to correct it — the departed member left on screen, which is the
// exposure this whole mechanism exists to close. supabase.js and the mobile
// shell already clear the session before their scrub runs; the Next dashboard
// invokes its server action LAST, so it scrubs with broadcast:false and calls
// this once the cookie is actually invalidated.
export function shapeBroadcastSignOut() {
  try {
    // The nonce is required: `storage` fires only on a CHANGED value, so two
    // sign-outs in the same millisecond would otherwise be silent.
    window.localStorage.setItem(
      SHAPE_SIGNOUT_STAMP_KEY,
      String(Date.now()) + ':' + Math.random().toString(36).slice(2)
    );
  } catch (e) {}
}

// ⚠ broadcast:false is LOAD-BEARING for listeners — a sibling that re-stamped
// while handling a stamp would echo the event back and the tabs would scrub
// each other in a loop. Only a real sign-out broadcasts.
//
// ⚠ A RECEIVING TAB MUST RETIRE ITS OWN SDK SESSION, not just its content.
// The scrub deliberately leaves the Supabase token (`shape.auth`) alone,
// because every sign-out path used to call auth.signOut() itself. The Next
// dashboard's does NOT — it clears the cookie session and redirects — so a
// sign-out started there leaves the localStorage token intact, and a sibling
// that only scrubbed and reloaded would restore that session and come back
// signed IN. Each handler below signs out locally (scope:'local' — no network,
// so it cannot hang) BEFORE reloading.
// ⚠ THIS ORIGIN HOSTS TWO SUPABASE CLIENTS WITH DIFFERENT PERSISTED KEYS.
// public/supabase.js pins `storageKey: 'shape.auth'`; mobile's client in
// shapeBackend.js sets none, so auth-js falls back to its default
// `sb-<projectRef>-auth-token`. /m/ ships under the website's origin, so both
// tokens live in ONE localStorage — and a tab that retires only the client it
// happens to have loaded leaves the OTHER one standing. Reopening that surface
// then restores the departed member and can bridge the session back into API
// cookies. So drop BOTH, by name and by the default pattern.
//
// This is storage only: it does not tear down an in-memory client. A surface
// that HAS a client still signs it out (scope:'local') as well — this runs
// alongside as the part that covers the client this document never loaded.
export function shapeDropPersistedAuth() {
  try {
    const ls = window.localStorage;
    try { ls.removeItem('shape.auth'); } catch (e) {}
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (!k) continue;
      if (k.indexOf('sb-') === 0 && k.indexOf('-auth-token') > 0) {
        try { ls.removeItem(k); } catch (e) {}
      }
    }
  } catch (e) {}
}

export function shapeInstallSignOutListener(onSignOut) {
  try {
    if (!(window.addEventListener && window.localStorage)) return () => {};
    const fn = (e) => {
      if (!e || e.key !== SHAPE_SIGNOUT_STAMP_KEY || !e.newValue) return;
      // Handlers retire a local SDK session before reloading, so they are
      // async. Swallow the rejection too — an unhandled one in a storage
      // listener would surface as a page error on a tab that is about to
      // reload anyway.
      try { Promise.resolve(onSignOut()).catch(() => {}); } catch (err) {}
    };
    window.addEventListener('storage', fn);
    return () => { try { window.removeEventListener('storage', fn); } catch (err) {} };
  } catch (e) { return () => {}; }
}

export function shapeScrubLocalUserContent({ extraKeys = [], broadcast = true } = {}) {
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
  // ⚠ THE TOKEN DROP LIVES HERE, AT THE CHOKEPOINT — not at each call site.
  // Both persisted Supabase sessions must go on every sign-out, and hanging
  // that on individual surfaces cost three review rounds: the receiving
  // listeners had it while the INITIATING paths (supabase.js signOut(), the
  // pageShell SDK-less fallback) did not, and a `storage` event never fires in
  // the tab that wrote it — so a member signing out with no sibling tab open
  // kept the other client's token. Every sign-out path already calls this
  // scrub, which is exactly why the broadcast lives here too.
  shapeDropPersistedAuth();
  // Stamp LAST, so the sweeps above can never remove the signal that tells the
  // other tabs to scrub themselves.
  if (broadcast) shapeBroadcastSignOut();
  // Every scrub caller also drops the PWA caches (see above). RETURN the
  // purge promise: a caller whose very next act is a navigation or reload
  // (mobile handleLogout, pageShell's no-supabase fallback) must await it
  // under its own bound, or the departing document is discarded before the
  // caches.delete calls ever dispatch. Callers with no navigation may ignore it.
  return shapePurgeShapeCaches();
}
