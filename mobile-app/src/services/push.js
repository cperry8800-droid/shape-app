// Native push registration (app closed / phone locked).
//
// Uses the runtime-exposed Capacitor plugin (window.Capacitor.Plugins.
// PushNotifications) rather than a static import, so the web build needs no new
// dependency and this is a no-op until the plugin is installed + a native build
// ships. To activate:
//   1. cd mobile-app && npm i @capacitor/push-notifications && npx cap sync
//   2. add Firebase config (google-services.json / APNs key) — see DEPLOY.md §10
//
// On a native platform it asks permission, registers with FCM/APNs, and POSTs
// the device token to /api/push/register (Bearer-authed via ShapeAuth). Call
// registerPush() once the user is signed in; call unregisterPush(token) on
// logout.

import { signOutGen } from './signOutGen.mjs';

function nativePush() {
  const cap = (typeof window !== 'undefined' && window.Capacitor) || null;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
  return cap.Plugins && cap.Plugins.PushNotifications ? cap.Plugins.PushNotifications : null;
}

function platform() {
  const cap = (typeof window !== 'undefined' && window.Capacitor) || null;
  return (cap && cap.getPlatform && cap.getPlatform()) || 'unknown';
}

let registered = false;
// The device token from the last successful registration — retained so sign-out
// can unassign it (unregisterPush needs the value, and the platform only hands
// it to the 'registration' listener).
let lastToken = null;

export async function registerPush() {
  const PushNotifications = nativePush();
  if (!PushNotifications || registered) return;
  registered = true;
  // Captured BEFORE the first await. The platform hands the token to the
  // 'registration' listener asynchronously, so a sign-out can land between this
  // call and the callback — at which point `lastToken` is still null,
  // teardownPush() has nothing to unassign, and an ungated callback would POST
  // this device's token back onto the account that just signed out. On a shared
  // device the next member then receives the previous member's notifications.
  const gen = signOutGen();
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') { registered = false; return; }

    // Fired with the FCM/APNs token once registration succeeds.
    PushNotifications.addListener('registration', async (token) => {
      const value = token && token.value;
      if (!value) return;
      // A sign-out ran while this registration was in flight — drop the token on
      // the floor. Bailing BEFORE `lastToken` is set is deliberate: nothing was
      // POSTed, so there is nothing for a later teardown to unassign, and
      // retaining it would hand the next teardown a token that was never
      // associated with any account.
      if (signOutGen() !== gen) return;
      lastToken = value; // retained for the sign-out teardown
      try {
        const auth = window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState();
        const accessToken = auth && auth.session && auth.session.access_token;
        const headers = { 'Content-Type': 'application/json' };
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        await fetch('/api/push/register', {
          method: 'POST',
          credentials: 'same-origin',
          headers,
          body: JSON.stringify({ token: value, platform: platform() }),
        });
      } catch (e) { /* best-effort */ }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('[push] registration error', err);
      registered = false;
    });

    await PushNotifications.register();
  } catch (e) {
    console.warn('[push] register failed', e);
    registered = false;
  }
}

// Returns true only when the server CONFIRMED the delete (2xx) — a thrown fetch
// (offline) or a non-2xx both report false, so the caller can keep the token
// for another attempt instead of discarding the only value that can retry.
export async function unregisterPush(token) {
  if (!token) return false;
  try {
    const auth = window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState();
    const accessToken = auth && auth.session && auth.session.access_token;
    const headers = { 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch('/api/push/register', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({ token }),
    });
    return response.ok;
  } catch (e) { return false; }
}

// Sign-out teardown. Call BEFORE the Supabase session is cleared — the DELETE
// is Bearer-authed, so it needs the signing-out account's still-valid token.
// Unassigns this device's token from the account in push_tokens AND resets the
// module flag, so after an in-app A→logout→B switch, B's registerPush() runs a
// real registration instead of early-returning on A's `registered` sentinel —
// without this, the shared device keeps receiving A's notifications.
//
// `lastToken` is cleared only on a CONFIRMED delete: discarding it before the
// attempt leaves the push_tokens row assigned to the signed-out account with no
// value left to retry with when the DELETE fails (offline, non-2xx). Retained,
// a later teardown in this session can try again. Residual, accepted: a failed
// unassign followed by no further sign-in on this device leaves the row until
// the next registration — the register POST upserts on token and re-points the
// row to the new account, which is the recovery path for the shared-device case.
export async function teardownPush() {
  const token = lastToken;
  registered = false;
  // Drop the 'registration' listener. registerPush() adds a new pair on every
  // sign-in, so without this they accumulate across an in-app A→logout→B switch;
  // and the listener is the path a late token takes back onto the signed-out
  // account. The generation check inside the callback is the guard that holds
  // when the callback is ALREADY queued (removal can't recall a dispatched
  // event); this removal is what stops the handle leaking. Both, deliberately —
  // neither one alone closes the whole window.
  const PushNotifications = nativePush();
  if (PushNotifications && PushNotifications.removeAllListeners) {
    try { await PushNotifications.removeAllListeners(); } catch (e) {}
  }
  if (!token) return;
  if (await unregisterPush(token)) lastToken = null;
}
