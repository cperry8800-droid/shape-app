// mobile-app/src/services/userGoalsRefresh.mjs
//
// ⚠ A SCREEN THAT KEEPS A COPY OF A user_goals DOCUMENT READS IT AGAIN WHEN SOMETHING ELSE CHANGED IT.
// Each screen reads its documents once, as it mounts, and its own edits update its own copy. Nora's
// account setup (set_up_account, src/lib/ai/accountSetup.mjs) writes those documents from her sheet,
// over whatever screen is open, and so does its Undo: Home's goal and Energy card, Eat's goal line,
// Goals, Settings' Training, Nutrition and Preferences rows, and a coach's own profile kept showing
// the old values until they were opened again (Codex on #2566). After a setup card is confirmed or
// undone the app announces the kinds it writes (bsAnnounceUserGoals), and every mounted reader of
// one of them reads it again (a hook from bsUserGoalsRevHook, in that reader's effect deps).

export const BS_USER_GOALS_EVENT = 'shape:userGoals';

// Every user_goals kind the account setup writes (pinned to its allowlist by
// tests/nora-account-setup-surfaces.test.mjs, so a new field's store is announced too).
export const BS_ACCOUNT_SETUP_KINDS = Object.freeze([
  'client_goals', 'client_identity', 'client_onboarding', 'client_settings',
  'client_training_prefs', 'client_nutrition_prefs', 'profile_custom',
]);

const win = () => (typeof window !== 'undefined' ? window : null);

/** Tell the mounted readers of these kinds that the stored documents changed. */
export function bsAnnounceUserGoals(kinds, target = win()) {
  if (!target || typeof target.dispatchEvent !== 'function') return false;
  const list = Array.isArray(kinds) ? kinds.filter((k) => typeof k === 'string' && k) : [];
  if (!list.length) return false;
  // The target's own CustomEvent (a window's), so the event is one that window dispatches.
  const CE = (target && typeof target.CustomEvent === 'function' && target.CustomEvent) || (typeof CustomEvent === 'function' ? CustomEvent : null);
  if (!CE) return false;
  try { target.dispatchEvent(new CE(BS_USER_GOALS_EVENT, { detail: { kinds: list } })); return true; } catch (e) { return false; }
}

/** Calls `fn` when an announcement names any of `kinds`; returns the unsubscribe. */
export function bsOnUserGoals(kinds, fn, target = win()) {
  if (!target || typeof target.addEventListener !== 'function' || typeof fn !== 'function') return () => {};
  const mine = new Set(Array.isArray(kinds) ? kinds : []);
  const onEvt = (e) => {
    const named = e && e.detail && Array.isArray(e.detail.kinds) ? e.detail.kinds : [];
    if (named.some((k) => mine.has(k))) fn(named);
  };
  target.addEventListener(BS_USER_GOALS_EVENT, onEvt);
  return () => target.removeEventListener(BS_USER_GOALS_EVENT, onEvt);
}

/**
 * A hook, made with the module's own React (each broadsheet module brings its own, and the test
 * harness hands each its shim): a number that moves on each announcement naming one of `kinds`.
 * Put it in a read's effect deps and the read runs again.
 */
export function bsUserGoalsRevHook(React) {
  return function useBSUserGoalsRev(kinds) {
    const [rev, setRev] = React.useState(0);
    const key = (Array.isArray(kinds) ? kinds : []).join('|');
    React.useEffect(() => bsOnUserGoals(key ? key.split('|') : [], () => setRev((n) => n + 1)), [key]);
    return rev;
  };
}

// ⚠ AND WHEN THE MEMBER COMES BACK TO THE APP. The website edits the same documents: Edit profile writes
// client_identity (photo, name, handle, location, pronouns) and profile_custom (the Bio, cover, look, climb
// background and the rest), and a screen already open in the app held the copy it read before (owner,
// 2026-11-11: "make sure the app parity works with edits to profile as well"). The app, shown again after
// being away (another app, the browser, a locked phone), re-announces the profile's kinds, and the shell
// re-reads its identity cache (bsHydrateIdentity), so a website edit shows without reopening the screen.
export const BS_PROFILE_KINDS = Object.freeze(['client_identity', 'profile_custom']);

/**
 * Calls `onReturn` when the page is shown again after being hidden for at least `minAwayMs` (a quick
 * flicker re-reads nothing). Returns the unsubscribe.
 */
export function bsOnReturnToApp(onReturn, { doc = (typeof document !== 'undefined' ? document : null), now = () => Date.now(), minAwayMs = 3000 } = {}) {
  if (!doc || typeof doc.addEventListener !== 'function' || typeof onReturn !== 'function') return () => {};
  let hiddenAt = null;
  const onVis = () => {
    if (doc.visibilityState === 'hidden') { hiddenAt = now(); return; }
    if (doc.visibilityState !== 'visible' || hiddenAt == null) return;
    const away = now() - hiddenAt;
    hiddenAt = null;
    if (away >= minAwayMs) { try { onReturn(); } catch (e) { /* a reader's failure is its own */ } }
  };
  doc.addEventListener('visibilitychange', onVis);
  return () => doc.removeEventListener('visibilitychange', onVis);
}
