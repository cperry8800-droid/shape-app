# Native iOS App Store build — go-live checklist

The single dependency behind three War Room **P1s**: the iOS App Store build.
Once it ships, the last-mile items resolve:

- **P1 — Activate system push** (the cloud pipeline is already live + verified end-to-end;
  it just needs a device that can receive).
- **P1 — Trainer "sell a plan" paid checkout** (needs a real Stripe charge on device — see the
  Stripe note below; not iOS-specific but part of the same launch).
- **Native-only follow-ups**: Apple Health goes live (HealthKit entitlement already set),
  native Sign in with Apple, and the live Bluetooth HRM (currently Web-Bluetooth-only).

> **Everything below the "Owner steps" line needs a Mac + Xcode + a paid Apple Developer
> account.** It cannot be done from the Windows repo. The repo-side prep (this file's
> "Already in the repo" section) is done.

---

## Already in the repo (verified — no action needed)

- **Native projects exist**: `mobile-app/ios/` and `mobile-app/android/`.
- **Capacitor 7 deps declared** (`mobile-app/package.json`): `@capacitor/push-notifications`,
  `@capacitor-community/bluetooth-le`, `@capacitor/browser`, `@capacitor/ios`.
- **`ios/App/App/App.entitlements`**:
  - `com.apple.developer.healthkit` (HealthKit) ✅
  - `aps-environment = development` (Push/APNs) ✅ — *added 2026-07-01. This is the entitlement
    that lets the app register with APNs. It is set to `development`; see step 4 for the
    App-Store/production nuance.*
- **`ios/App/App/Info.plist`** usage strings: Bluetooth, Camera, HealthKit (share + update),
  Microphone; `UIBackgroundModes = [audio]` (keeps Shape Radio playing when backgrounded).
  - *Note:* `remote-notification` is intentionally **not** in `UIBackgroundModes` — Shape sends
    standard user-facing pushes (alert/badge/sound), not silent/content pushes, so declaring it
    would risk an App Store review flag for an unused background mode.

## Still missing from the repo (owner-provided — has secrets, so not committed)

- **`ios/App/App/GoogleService-Info.plist`** — download from the Firebase console (project
  `shape-84d22`, the iOS app). Required for FCM to deliver on iOS. Drop it into `ios/App/App/`
  and add it to the Xcode target ("Copy Bundle Resources").
- **`android/app/google-services.json`** — the Android equivalent (for the Android release path).

---

## Owner steps (Mac + Xcode)

### 1. Sync the web build into the native project
```bash
cd mobile-app
npm ci
VITE_BASE=/ npm run build        # native serves from ./ , not /m/  (do NOT use VITE_BASE=/m/ here)
npx cap sync ios
```
> The `/m/` base is only for the hosted web build in `public/m`. The **native** app serves its
> bundle locally from `./`, so build the native copy with `VITE_BASE=/` (or unset) before `cap sync`.

### 2. Apple Developer portal (developer.apple.com → Certificates, Identifiers & Profiles)
- On the app's **App ID**, enable the **Push Notifications** and **HealthKit** capabilities
  (Sign in with Apple too, if/when that ships).
- Create an **APNs Authentication Key** (.p8) under Keys → note the Key ID + Team ID.

### 3. Firebase (console.firebase.google.com → project `shape-84d22`)
- **Cloud Messaging → Apple app configuration**: upload the APNs `.p8` key + Key ID + Team ID.
  (FCM relays to APNs; without this, iOS pushes never leave Firebase.)
- **Download `GoogleService-Info.plist`** for the iOS app → place in `ios/App/App/` and add to the
  Xcode target.

### 4. Xcode — capabilities & signing (`ios/App/App.xcworkspace`)
- **Signing & Capabilities**: select the team; with automatic signing, Xcode reads
  `App.entitlements` and shows **Push Notifications** + **HealthKit** already added.
- **Production entitlement**: the committed `aps-environment` is `development` (fine for a
  device debug build + TestFlight internal testing via the dev profile). For an **App Store /
  TestFlight external** build, the distribution provisioning profile carries
  `aps-environment = production` — automatic signing swaps this at archive time, so no manual
  edit is needed. (Only hardcode `production` if you switch to manual signing.)

### 5. Build, run, verify push end-to-end
- Run on a **real device** (the simulator can't receive APNs).
- On sign-in, `registerPush()` (already wired into `getCurrentSession`) registers the token →
  `POST /api/push/register` stores it in `push_tokens`.
- Write a test notification for that user; the Supabase DB Webhook
  (`notifications` INSERT → `POST /api/push/dispatch`, header `x-push-secret`) fires
  `sendPushToUser` → FCM → the device banner. The dispatch route + FCM env are already
  verified live (returns 200; no-ops with `skipped:'fcm_not_configured'` if env is absent).

### 6. Submit
- Archive → upload to App Store Connect → TestFlight → App Store review.
- App Privacy nutrition labels: declare Health data + identifiers per the privacy policy.

---

## Stripe (the "sell a plan" P1 — not iOS-specific)
- **Activate Stripe Connect** for coach payouts (Stripe dashboard) — the destination-charge
  checkout + 15% platform fee are already coded; this toggle is the gate. Verify a real charge
  on the coach-plan Buy flow once live.
- **In-app-purchase caveat**: Apple requires IAP for *digital* content consumed in-app. Shape's
  coach coaching/plans are arguably real-world services (Connect/Stripe is allowed), but confirm
  against App Store Review Guideline 3.1.1 before submitting to avoid a rejection.

## Android release (P2, parallel)
- Add `android/app/google-services.json`.
- Add the `ANDROID_KEYSTORE_*` repo secrets to enable the release-APK CI job
  (`android-build.yml` — the debug-APK job already runs on `mobile-app/**` changes).
