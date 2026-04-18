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

## 5. Register the Stripe webhook

The webhook can only be created after you have a prod URL.

1. Stripe dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. Endpoint URL: `https://theshapecommunity.com/api/stripe/webhook`
3. Events to send:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Save. Stripe shows a **Signing secret** — copy it.
5. Back in Vercel → Environment Variables → set `STRIPE_WEBHOOK_SECRET`
   to the value you just copied (Production scope).
6. Trigger a redeploy so the new env var lands (Vercel → Deployments →
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
3. Developers → Webhooks → re-create the endpoint in live mode
4. Vercel → Environment Variables → update `STRIPE_SECRET_KEY` and
   `STRIPE_WEBHOOK_SECRET` to the live values
5. Redeploy

## Known caveats

- **Provider dashboard RLS** — trainers/nutritionists can't see their own
  subscribers yet because there's no `owner_id` column linking
  `auth.users.id` to `trainers.id`. The webhook writes subs via
  service_role so they land regardless; we just can't query them from the
  provider side. Addressed by the next "provider onboarding" task.
- **Phone login** requires Twilio creds in Supabase → Authentication →
  Providers → Phone. See the top-level project notes for that setup.
- **No background jobs yet** — the subscription status relies entirely on
  Stripe webhooks. If a webhook is missed, the row won't update until the
  next event. Stripe retries automatically, so this is usually fine.
