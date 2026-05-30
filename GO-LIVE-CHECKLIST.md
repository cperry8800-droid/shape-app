# Shape — Go-Live Checklist

One consolidated pass to take everything that's merged into a working live
state. Work top to bottom. Each item says **who** does it and **how to verify**.

This complements `DEPLOY.md` (which has the original Vercel/Stripe/Twilio/push
setup in prose) — this file is the *ordered, checkable* version plus the
migrations that have piled up.

---

## 0. Pre-flight

- [ ] Confirm the Vercel project is deployed from `main` and the custom domain
      resolves (`https://theshapecommunity.com`).
- [ ] Open `https://theshapecommunity.com/api/health` — note which keys show
      `true` / `live` / `test`. You'll re-check this after each section.

---

## 1. Database migrations (Supabase SQL editor)

Run any **not yet applied**, in the order below. They're idempotent (safe to
re-run), but **order matters** where noted.

> ⚠️ The notifications table MUST be created before the two notification-trigger
> migrations and is used by push. Despite the filenames, run them in THIS order:

Recently added (most likely outstanding):

- [ ] `2026-05-29-provider-rls-hardening.sql`
- [ ] `2026-05-30-notifications.sql`  ← **run before the next two**
- [ ] `2026-05-30-message-notifications.sql`
- [ ] `2026-05-30-coach-content-notifications.sql`
- [ ] `2026-05-30-push-tokens.sql`
- [ ] `2026-05-30-activities.sql`

If you're unsure which earlier ones are applied, the full set lives in
`supabase-migrations/` — run oldest-first; each is a no-op if already applied.

**Verify:** in Supabase → Table editor, confirm these tables exist:
`notifications`, `push_tokens`, `activities`. And Database → Publications →
`supabase_realtime` includes `notifications`.

---

## 2. Supabase Auth config

- [ ] Authentication → URL Configuration → **Site URL** =
      `https://theshapecommunity.com`
- [ ] Add **Redirect URLs**: `…/auth/callback`, localhost for dev.
- [ ] (Phone login) Authentication → Providers → **Phone** → enable, choose
      **Twilio**, paste Account SID + Auth Token + Messaging Service SID.
- [ ] (Phone login) Authentication → Rate limits → sane SMS OTP limit.

**Verify:** app → Login → Phone → real number → receive code → signed in.

---

## 3. Stripe — go live

- [ ] Stripe dashboard → **Live mode**.
- [ ] Create a **$5/mo recurring** price for the platform membership → copy its
      Price ID.
- [ ] Developers → API keys → copy live **Secret key**.
- [ ] Developers → Webhooks → **Add endpoint** (live mode):
      `https://theshapecommunity.com/api/stripe/webhook`, events:
      `checkout.session.completed`, `customer.subscription.updated`,
      `customer.subscription.deleted`, `account.updated`, `charge.refunded`,
      `charge.dispute.created`, `charge.dispute.closed` → copy Signing secret.
- [ ] **Activate Connect** (Connect → Settings) so coach payouts work in live.
- [ ] Vercel env (Production): set `STRIPE_SECRET_KEY` (sk_live_…),
      `STRIPE_WEBHOOK_SECRET` (whsec_…), `STRIPE_PLATFORM_PRICE_ID` (price_…).
- [ ] Redeploy.

**Verify:** `/api/health` shows `STRIPE_SECRET_KEY_mode: "live"`,
`STRIPE_WEBHOOK_SECRET: true`, `STRIPE_PLATFORM_PRICE_ID: true`. Then a real
$5 subscribe → Stripe → Webhooks shows **2xx**.

> The 15% coach cut + payout to the coach's connected account only works once a
> coach has completed **live** Connect onboarding (their `stripe_account_status`
> flips to `active` on the `account.updated` webhook). Until then, the checkout
> route correctly blocks that coach's checkout.

---

## 4. Video calls (Jitsi)

- [ ] Works out of the box on the free public `meet.jit.si`. Nothing required.
- [ ] (Optional, production) set `JITSI_DOMAIN` in Vercel to a self-hosted /
      8x8 JaaS domain for branding + SLA.

**Verify:** book a video session → coach Confirms → both tap **Join video
call** → call opens in-app.

---

## 5. Push notifications (app closed / locked)

In-app notifications (live toast + feed) work once §1 is done. System push needs:

- [ ] `cd mobile-app && npm i @capacitor/push-notifications && npx cap sync`
- [ ] Firebase project → service account key → Vercel env: `FCM_PROJECT_ID`,
      `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (keep `\n`).
- [ ] iOS: upload an APNs key to Firebase → Cloud Messaging.
- [ ] Supabase → Database → Webhooks: on `notifications` **Insert**, HTTP POST
      to `…/api/push/dispatch`, header `x-push-secret: <value>`; set the same
      value as `PUSH_WEBHOOK_SECRET` in Vercel.
- [ ] Native build includes `google-services.json` (Android) + APNs (iOS).

**Verify:** on a real device, trigger a notification (e.g. book a session) with
the app backgrounded → push appears on the lock screen.

---

## 6. Android build (optional, for store release)

- [ ] CI builds a debug APK already (Actions tab). For a signed release, add
      repo secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
      `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (DEPLOY.md §9).

---

## 7. End-to-end smoke test (the important one)

Do this on the **live** site/app after §1–3, as a brand-new account:

- [ ] Sign up (email **and** phone) → land signed in.
- [ ] Subscribe to a coach ($5 + coach price) with a real card → Stripe webhook 2xx.
- [ ] As the coach: see the **booking request** notification → **Confirm** →
      client gets "Session confirmed" → **Join video call** works for both.
- [ ] Coach sends a workout / meal plan → client gets the notification.
- [ ] Client logs an activity (tennis) → shows in Progress + awards Shape Score
      → coach sees it in the client's Progress breakdown.
- [ ] Coach toggles **Pause new bookings** → new checkout is blocked.
- [ ] Send a chat message both directions → each side gets notified.

Anything that breaks here is the real punch list — send it over and I'll fix.

---

## Known gaps (intentional, not blockers)

- **Eat / Train programs** are editorial demo content (no data model) — by design.
- **Shape Radio** needs a real stream URL/source before it plays audio.
- **Timezone**: bookings store `scheduled_at` as UTC from a wall-clock picker —
  fine on a UTC server, worth revisiting for cross-timezone correctness.
- A few screens still mix live + demo data; verification in §7 will surface which.
