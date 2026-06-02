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

## 6. Instacart (grocery hand-off)  ✅ code ready

Server-to-server — **no user OAuth, no redirect URI**.

| | |
|---|---|
| Env vars | `INSTACART_API_KEY` (required), `INSTACART_CONNECT_URL` (optional) |
| Dashboard | Instacart Developer Platform / Connect |
| `INSTACART_CONNECT_URL` | Defaults to `https://connect.instacart.com`. Use `https://connect.dev.instacart.tools` for the dev catalog. |

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
