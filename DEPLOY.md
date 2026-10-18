# Deploying Shape to Vercel

One-time setup to get `shape-app` live on Vercel, connected to Supabase and
Stripe, with a custom domain. Everything in this repo is ready to deploy —
the only manual work is clicking through service dashboards.

## 1. Create the Vercel project

1. Go to https://vercel.com/new
2. **Import Git Repository** → pick `cperry8800-droid/shape-app`
3. Framework preset: **Next.js** (auto-detected)
4. Root directory: leave at `./`
5. Build command / output: leave default
6. Don't click Deploy yet — add env vars first (step 2)

## 2. Environment variables

In the Vercel project settings → **Environment Variables**, add all the
values from `.env.example`. Scope each to **Production**, **Preview**, and
**Development** unless noted:

| Name | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://zznufekgjngecelwxndw.supabase.co` | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` | Safe to expose |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | **Secret** — never expose |
| `STRIPE_SECRET_KEY` | `sk_live_...` | Use `sk_test_` for Preview |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Filled in after step 5 |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | `whsec_...` | The coach-accounts destination's secret, step 5 |
| `STRIPE_CONNECT_APPLICATION_ID` | `ca_...` | Shape's Connect application, step 5 |
| `NEXT_PUBLIC_SITE_URL` | `https://theshapecommunity.com` | No trailing slash |
| `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` | `xxxxxxxx-...` | Optional, phone login |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | from developer.spotify.com | Optional, Spotify integration |
| `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` | from strava.com/settings/api | Optional, Strava integration |
| `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET` | from developer.whoop.com | Optional, Whoop integration |
| `GARMIN_CLIENT_ID` / `GARMIN_CLIENT_SECRET` | Garmin Health API v2 | Optional, Garmin integration |

Then click **Deploy**.

### Integration callback URLs

Each third-party OAuth app needs its redirect URI registered. Use:

- Spotify: `https://theshapecommunity.com/api/integrations/spotify/callback`
- Strava:  `https://theshapecommunity.com/api/integrations/strava/callback`
- Whoop:   `https://theshapecommunity.com/api/integrations/whoop/callback`
- Garmin:  `https://theshapecommunity.com/api/integrations/garmin/callback`

Apple Watch does not use web OAuth — data flows in through the native iOS
app via HealthKit. The Integrations page shows it as "Requires iOS app".

## 3. Update Supabase auth redirect URLs

Supabase will block the email-confirm and password-reset callbacks unless
your prod origin is whitelisted.

1. Supabase → **Authentication** → **URL Configuration**
2. Set **Site URL** to `https://theshapecommunity.com`
3. Add to **Redirect URLs** (one per line):
   - `https://theshapecommunity.com/auth/callback`
   - `https://your-preview-*.vercel.app/auth/callback` (optional, for PR previews)
   - `http://localhost:3000/auth/callback` (keep for local dev)

## 4. Point your domain at Vercel

GitHub Pages currently serves `theshapecommunity.com` from the
`shapestartsnow` repo. You have two options:

**Option A — cut over fully**:
1. Vercel project → **Settings** → **Domains** → add `theshapecommunity.com`
2. Vercel gives you DNS records (A or CNAME). Update them at your registrar.
3. Wait for DNS to propagate (~15 min). GitHub Pages will stop resolving.

**Option B — stage it on a subdomain first**:
1. Add `app.theshapecommunity.com` to Vercel instead
2. Point a CNAME at `cname.vercel-dns.com`
3. Test the full flow there, then repeat Option A when ready

Option B is safer — keeps your existing landing page live until you're sure.

## 5. Register the Stripe webhooks

The webhooks can only be created after you have a prod URL. There are two
destinations on the same URL: one for Shape's own account, one for the
coaches' connected accounts. Do both in test mode, then again in live mode.

**A. Your account** (Shape's own payments: memberships, and coach sales
until they move onto the coaches' accounts)

1. Stripe dashboard → **Developers** → **Webhooks** → **Add destination**,
   events from **Your account**
2. Endpoint URL: `https://theshapecommunity.com/api/stripe/webhook`
3. Events to send (the ones `src/app/api/stripe/webhook/route.ts` handles):
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid` (each later month: the payment notices)
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.closed`
4. Save. Stripe shows a **Signing secret**: set it in Vercel as
   `STRIPE_WEBHOOK_SECRET`.

**B. Connected accounts** (the coaches' own Stripe accounts)

1. **Add destination** again, events from **Connected accounts**, the same
   URL. Payload style **Snapshot**.
2. Events to send: every event in A, plus:
   - `account.updated`
   - `account.application.deauthorized`
3. Save. Set its signing secret in Vercel as `STRIPE_CONNECT_WEBHOOK_SECRET`.
4. Set `STRIPE_CONNECT_APPLICATION_ID` to Shape's Connect application id
   (`ca_…`). The Connect settings page may show it as "Unavailable" when
   OAuth is off; the destination's own record names it (`application` on
   the webhook endpoint).

Then trigger a redeploy so the new env vars land (Vercel → Deployments →
latest → ⋯ → Redeploy).

## 6. Smoke test

Run through these on the live site:

- [ ] Home page loads, stat cards show real counts
- [ ] `/trainers`, `/nutritionists`, `/gyms` render and filter works
- [ ] A detail page loads and the Subscribe button is visible
- [ ] Sign up with a real email → confirm link → lands signed in
- [ ] Subscribe to a trainer with test card `4242 4242 4242 4242`
- [ ] Back on `/dashboard/client` the new sub shows up
- [ ] Stripe → Webhooks → the endpoint shows 2xx responses

## 7. Switch Stripe to live mode

When you're ready to accept real money:

1. Stripe dashboard → toggle from **Test mode** to **Live mode** (top right)
2. Developers → API keys → copy the live **Secret key**
3. Developers → Webhooks → re-create both destinations in live mode (step 5)
4. Vercel → Environment Variables → update `STRIPE_SECRET_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` and
   `STRIPE_CONNECT_APPLICATION_ID` to the live values
5. Redeploy

## 8. Enable SMS login (Twilio)

The mobile app's login screen has an **Email / Phone** switch. The phone path
(`signInWithPhone` → SMS code → `verifyPhoneOtp`) is live in the code; it just
needs an SMS provider wired into Supabase. There is no app redeploy required.

1. Create a Twilio account → buy a number (or set up a Messaging Service) with
   SMS capability.
2. Collect: **Account SID**, **Auth Token**, and the **Messaging Service SID**
   (preferred) or the **From** number.
3. Supabase → **Authentication → Providers → Phone** → enable, choose
   **Twilio**, paste the three values, save.
4. (Recommended) Supabase → Authentication → Rate limits → confirm the SMS OTP
   rate limit is sane, and set a sensible OTP expiry.
5. Test from the app: Login → Phone → enter your number → receive the code →
   verify. A brand-new phone auto-creates the account and seeds a profile row.

> Costs: each SMS is billed by Twilio. Watch the rate limits to avoid abuse.

## 9. Android release signing (CI)

`/.github/workflows/android-build.yml` builds a **debug** APK on every push/PR
with no configuration. To also produce a **signed release** APK, add these
repository secrets (Settings → Secrets and variables → Actions); the release
job stays skipped until they exist:

| Secret | How to get it |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 my-release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias inside the keystore |
| `ANDROID_KEY_PASSWORD` | key password |

Keep the keystore itself out of the repo — CI decodes it into the runner's
temp dir at build time only.

## 10. Push notifications (app closed / locked)

In-app notifications work today (live feed + toast). System push, when the app is
**closed or the phone is locked**, goes to **Apple directly for iPhones** and through
**Firebase (FCM) for Android** (`src/lib/push.ts`). Each half switches on by itself
once its settings exist; until then `/api/push/dispatch` is a safe no-op for it.

1. **Supabase Database Webhook** (done 2026-06-21; Database → Webhooks):
   - Table `notifications`, event **Insert**, HTTP **POST**
   - URL `https://theshapecommunity.com/api/push/dispatch`
   - Header `x-push-secret: <value>`, and the same value as `PUSH_WEBHOOK_SECRET` in
     Vercel. This fans every notification out to push with no per-event wiring.
2. **iPhone (APNs)**: Apple Developer → Certificates, Identifiers & Profiles:
   - **Identifiers** → `com.theshapecommunity.app` → tick **Push Notifications** → Save.
   - **Keys** → **＋** → name it "Shape push", tick **Apple Push Notifications service
     (APNs)** → Continue → Register → **Download** the `.p8` file (Apple lets you
     download it once) and note the **Key ID** on that page.
   - Your **Team ID** is at the top right of the Membership page.
   - In Vercel (Production), set `APNS_KEY_ID` = the Key ID, `APNS_TEAM_ID` = the Team
     ID, `APNS_PRIVATE_KEY` = the whole `.p8` file (open it in a text editor and paste
     everything, including the BEGIN and END lines), then redeploy.
   - The next TestFlight build (Codemagic builds one on every push to `main`) is the
     first that can register, because it carries the token hand-off in
     `AppDelegate.swift`.
3. **Android (FCM)**: Firebase console → project `shape-84d22`:
   - The service-account values are set in Vercel (done 2026-06-21): `FCM_PROJECT_ID`,
     `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (Project settings → Service accounts →
     Generate new private key, if they ever need replacing).
   - Project settings → General → **Add app** → Android → package name
     `com.theshapecommunity.app` → Register → **download `google-services.json`**.
   - GitHub → the repo → Settings → Secrets and variables → Actions → **New repository
     secret**: name `GOOGLE_SERVICES_JSON`, value = the whole file's contents.
     `android-build.yml` writes it into the build. It is never committed (it carries a
     Google API key that the secret scan flags), and a build without it never
     registers for push, because the plugin's `register()` without Firebase crashes
     the app (`mobile-app/vite.config.ts`, `__SHAPE_ANDROID_PUSH__`).

**Test it:** install the new build, sign in, turn notifications on (Settings →
Notifications, or the prompt after setting a reminder), and check that a row appears in
`push_tokens`. Then have someone message you with the app closed.

## Database migrations

All SQL lives in `supabase-migrations/` and is applied manually in the Supabase
SQL editor (run any not yet applied, oldest first). The provider dashboards
depend on the owner-id + RLS migrations in particular:

- `2026-04-14-provider-owner-id.sql` — `owner_id` columns + provider-scoped
  policies + the `claim_provider_row()` helper.
- `2026-05-29-provider-rls-hardening.sql` — provider read on `public.profiles`
  + tightened `provider_update_sessions` check.

## Known caveats

- **Provider rows need an `owner_id`.** Dashboards resolve "which provider am
  I" via `trainers/nutritionists.owner_id = auth.uid()`. That column is set
  automatically when a provider completes **Stripe Connect onboarding**
  (`/api/stripe/connect-account`), or manually via the `claim_provider_row()`
  RPC / the `/dashboard/claim` page. A provider row with a null `owner_id`
  won't appear in that user's dashboard — claim it if a row was seeded
  out-of-band.
- **No background jobs yet** — the subscription status relies entirely on
  Stripe webhooks. If a webhook is missed, the row won't update until the
  next event. Stripe retries automatically, so this is usually fine.
