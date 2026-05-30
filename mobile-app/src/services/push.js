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

export async function registerPush() {
  const PushNotifications = nativePush();
  if (!PushNotifications || registered) return;
  registered = true;
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

export async function unregisterPush(token) {
  if (!token) return;
  try {
    const auth = window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState();
    const accessToken = auth && auth.session && auth.session.access_token;
    const headers = { 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    await fetch('/api/push/register', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({ token }),
    });
  } catch (e) { /* best-effort */ }
}
