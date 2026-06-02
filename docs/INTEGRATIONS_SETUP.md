# Integrations setup

All integration **code is already wired** (OAuth flows, callbacks, token storage,
mobile connect buttons). The only thing standing between a red ✗ and a green ✓ on
the War Room is **setting the provider credentials as environment variables**.

> **Never commit real keys.** Set them in your hosting environment (Vercel → Project
> → Settings → Environment Variables) and, for local dev, in `.env.local` (which is
> git-ignored). `.env.example` lists the names only.

The War Room "Integrations" group reads these env vars directly
(`src/lib/warroom.ts`). A provider flips to ✓ the moment **all** of its variables
are present — no code change or redeploy of app logic required beyond picking up
the new env.

### Live status (production — last verified 2026-06-02)

| Provider | Keys in prod | Notes |
|---|---|---|
| Strava | ✅ set | live |
| Whoop | ✅ set | live |
| Spotify | ✅ set | live (incl. save-coach-playlist) |
| Oura | ❌ not set | code ready — add `OURA_CLIENT_ID/SECRET` |
| Garmin | ❌ not set | code ready — add keys + Garmin program approval |
| Apple Music | env-only check | no OAuth; needs MusicKit key vars |
| Instacart | ⏳ access requested | Developer Platform applications are **gated** — request submitted. Grocery button copies the list to the clipboard until a key exists. |
| Apple Health | n/a (no keys) | native iOS build required (see §5b) |

---

## 0. One prerequisite for every OAuth provider

Set the public site origin so callback URLs resolve correctly in production:

```
NEXT_PUBLIC_SITE_URL=https://your-production-domain.com   # no trailing slash
```

**Why it matters (redirect-URI audit):** the authorize route
(`/api/integrations/[provider]/authorize`) builds the `redirect_uri` from the
*incoming request origin* and stashes it in a short-lived cookie, which the
callback re-uses for the token exchange — so the two always match. However, the
callback's *fallback* (`callbackUrl()` in `src/lib/integrations/oauth.ts`) uses
`NEXT_PUBLIC_SITE_URL`, defaulting to `http://localhost:3000`. If the cookie is
ever missing (e.g. expired, cross-site), an unset `NEXT_PUBLIC_SITE_URL` would
send a `localhost` redirect_uri and the exchange would fail. Set it in prod.

---

## 1. Strava  ✅ code ready

| | |
|---|---|
| Env vars | `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` |
| Dashboard | https://www.strava.com/settings/api |
| Authorization Callback Domain | `your-production-domain.com` (Strava asks for the *domain*, not the full URL) |
| Redirect URI used | `https://your-production-domain.com/api/integrations/strava/callback` |
| Scopes (already configured) | `read,activity:read_all` |

## 2. Whoop  ✅ code ready

| | |
|---|---|
| Env vars | `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` |
| Dashboard | https://developer.whoop.com |
| Redirect URI to register | `https://your-production-domain.com/api/integrations/whoop/callback` |
| Scopes (already configured) | `read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement` |

## 2b. Oura Ring  ✅ code ready (full sync)

| | |
|---|---|
| Env vars | `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET` |
| Dashboard | https://cloud.ouraring.com/oauth/applications |
| Redirect URI to register | `https://your-production-domain.com/api/integrations/oura/callback` |
| Scopes (already configured) | `personal daily heartrate workout session` |
| Sync | `GET /api/integrations/oura/sync` (add `?import=1` to import workouts as private activity rows). Maps readiness → recovery score; detailed sleep → hours / efficiency / resting HR / HRV / avg HR; daily_sleep → sleep score; daily_activity → active calories; workouts → minutes, all into `daily_health_snapshot`. Mobile: Connect / Sync / Import workouts / Disconnect. |

## 3. Garmin  ✅ code ready (needs program approval)

| | |
|---|---|
| Env vars | `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET` |
| Dashboard | Garmin Connect Developer Program (https://developerportal.garmin.com) |
| Redirect URI to register | `https://your-production-domain.com/api/integrations/garmin/callback` |
| Scopes (already configured) | `ACTIVITY_EXPORT HEALTH_EXPORT` |
| Note | Garmin Health API access requires **approval** before production data syncs. The mobile Connect button is now live; it will return an auth error until the credentials + approval are in place. |

## 4. Spotify  ✅ code ready

| | |
|---|---|
| Env vars | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` |
| Dashboard | https://developer.spotify.com/dashboard |
| Redirect URI to register | `https://your-production-domain.com/api/integrations/spotify/callback` |
| Scopes (already configured) | `playlist-read-private playlist-read-collaborative user-read-email` |

## 5. Apple Music (MusicKit)  ✅ code ready

MusicKit authorizes **client-side** (no OAuth redirect URI). The server only mints
a developer token from your MusicKit key.

| | |
|---|---|
| Env vars | `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY` |
| Dashboard | Apple Developer → Certificates, Identifiers & Profiles → **Keys** (enable *Media Services / MusicKit*) |
| `APPLE_MUSIC_PRIVATE_KEY` | The `.p8` contents with newlines escaped as `\n`, e.g. `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----` |
| Domain registration | Register your production domain on the MusicKit identifier so the browser grant works. |

## 5b. Apple Health / Apple Watch (HealthKit)  ✅ code ready — native iOS only

**No env vars, no OAuth, no developer keys.** Apple Watch / Health data is only
reachable from the native iOS app via the HealthKit entitlement — there is no
web API. Reading happens on-device and per-day roll-ups are POSTed to the server.

What's already wired (a **thin in-app native plugin** — no external pod, so no
Capacitor-version / peer-dependency conflicts):
- `ios/App/App/ShapeHealthPlugin.swift` — a `CAPBridgedPlugin` exposing
  `isAvailable`, `requestAuthorization`, and `querySamples`. It's added to the
  Xcode target in `project.pbxproj`, so Capacitor auto-registers it as
  `ShapeHealth`.
- `ios/App/App/App.entitlements` enables `com.apple.developer.healthkit`, and the
  Xcode project points `CODE_SIGN_ENTITLEMENTS` at it.
- `Info.plist` has `NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription`.
- `mobile-app/src/services/healthkit.js` requests authorization and reads steps,
  heart rate, HRV, resting HR, sleep, active energy, distance, and workouts.
- `POST /api/integrations/apple-health/sync` writes `daily_health_snapshot` rows
  (same as WHOOP/Oura) and imports workouts privately.
- Mobile "Manage integrations" → **Apple Health** card (Connect / Sync /
  Disconnect on device; shows "iOS app" on web).

To finish enabling it (one-time, requires a Mac + Xcode):
1. `cd mobile-app && npm run build && npx cap sync ios`.
2. Open `ios/App/App.xcworkspace` in Xcode → **Signing & Capabilities** → confirm
   the **HealthKit** capability is present (the entitlement file already adds it).
3. Build to a real device (HealthKit isn't on the simulator) and ship via
   TestFlight / App Store. On first **Connect**, iOS shows the Health permission
   sheet; granting it lets Shape read the listed types.

> Android equivalent (not included here): the same on-device pattern via **Health
> Connect** would be a separate native plugin.

## 6. Instacart (grocery hand-off)  ✅ code ready · ⏳ access gated

Server-to-server — **no user OAuth, no redirect URI**. We use the **Instacart
Developer Platform (IDP) Products Link API** (`POST /idp/v1/products/products_link`),
which returns a `products_link_url` the app opens (a pre-filled cart page on
instacart.com). This is **not** the heavier Instacart Connect *fulfillment* API
(OAuth `client_credentials`, Connect user accounts) — we don't need that.

| | |
|---|---|
| Env vars | `INSTACART_API_KEY` (required), `INSTACART_CONNECT_URL` (optional) |
| Dashboard | Instacart Developer Platform (the Connect/fulfillment portal is a different product) |
| `INSTACART_CONNECT_URL` | Defaults to `https://connect.instacart.com`. Use `https://connect.dev.instacart.tools` for the dev catalog. |

**Access status:** Instacart is **not accepting new Developer Platform
applications** (no waitlist) as of 2026-06-02 — a partnership request has been
submitted. Until a key exists, the grocery "Send to Instacart" button **copies
the list to the clipboard** (see `instacart/shopping-list` route returning
`{ configured: false, items }`). The moment `INSTACART_API_KEY` is added the
button reverts to opening the pre-filled Instacart cart — no code change.

---

## Verifying after you set keys

1. Add the variables in Vercel (Production + Preview as needed) and redeploy.
2. Open the **War Room** → Integrations group: each provider with complete creds
   shows ✓.
3. In the mobile app → Settings → **Manage integrations**, tap **Connect** on a
   provider and complete the flow. A successful return lands on
   `/newdesign/GetApp.html?...&status=ok&integration=<provider>`.
4. If a connect fails, the return URL carries `status=error` with a reason such as
   `token_exchange_failed`, `state_mismatch`, or
   `Missing <PROVIDER>_CLIENT_ID/SECRET in environment` — the last one means the
   env var didn't load.
