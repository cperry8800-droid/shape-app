# Shape — Go-Live Checklist

The ordered sequence for taking what's merged into a working live state.

## ⚠ Read this before using the file

**This checklist holds ORDER and VERIFICATION METHOD. It does not hold STATUS,
COUNTS, or LISTS.** That split is deliberate and it is the whole design.

The 2026-05-30 version of this file named six migrations as "most likely
outstanding" and called Eat/Train "editorial demo content (no data model)". By
2026-08-21 there were 200 migrations and Eat/Train had a data model with 21 files
writing `client_workouts`. Nothing was wrong when written; the file simply kept
asserting it. A checklist that copies facts from elsewhere goes stale at the
speed of the thing it copied.

So: **anything with a status, a count, or a membership list is a link here, never
a copy.** If you catch yourself pasting a list into this file, put a command that
computes it instead.

### The authoritative sources

| For | Read |
|---|---|
| **What is still open** | War Room — `/warroom`, `src/lib/warroom.ts` |
| **Which migrations exist** | `ls supabase-migrations/*.sql` |
| **What shipped, when** | `docs/WORKLOG.md` changelog |
| **Current session state** | `ls -t docs/HANDOFF-*.md \| head -1` |

The War Room is the go-live status board. Every item below that has an open/done
state lives there as `status: 'manual'` (owner does it) or `status: 'pending'`
(engineering does it). **This file tells you what order to do them in; the board
tells you which are left.**

---

## 0. Pre-flight

- [ ] Vercel project deploys from `main`; `https://theshapecommunity.com` resolves.
- [ ] **Sign in as an admin, then open `/warroom` and `/console`.**

⚠ **`/api/health` is ADMIN-ONLY and returns 404 — not 403 — to everyone else.**
Do not curl it. It was unauthenticated until 2026-07-30, when an access-control
audit found it serving the last four characters of `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` plus a full map of which integrations were provisioned,
while its own header claimed "no secrets in response". A non-admin gets 404
because an unauthorized caller has no business learning the route exists.

Admin is an **email allowlist** — `getAdminEmails()` in `src/lib/admin-access.ts`,
built from the `ADMIN_EMAILS` and `APPLICATIONS_EMAIL` env vars plus three
built-in defaults. So health checks need a signed-in browser session, not a
terminal.

---

## 1. Database migrations (Supabase SQL editor)

Run any not yet applied. The directory is the source of truth:

```sh
ls supabase-migrations/*.sql | sort
```

⚠ **"Oldest-first, each is a no-op if already applied" is NO LONGER SAFE ADVICE.**
It was true of the handful of migrations that existed in May. It is false now: a
meaningful minority carry an explicit ordering or deploy dependency **in their own
file header**, and at least one breaks production if run early. Find them:

```sh
grep -rilE "run .*after|only after|before the deploy|step [12] of 2|run before" supabase-migrations/*.sql
```

**Read the header of every migration that grep returns before running it.** Two
worked examples, so you know the shape of what those headers say:

- `2026-07-31-coach-insert-lockout.sql` — *"RUN THIS AFTER THE DEPLOY THAT SHIPS
  THE NEW PUBLISH PATH."* Applied against the old code it **breaks the website's
  Publish & Send to Client button**, because that flow would still be inserting
  directly into `client_workouts`.
- `2026-08-04-profiles-pii-lockdown.sql` — *"STEP 2 of 2. Run ONLY after
  `2026-08-03-profiles-display-names.sql` has been applied AND the code that uses
  `get_display_names()` is deployed."* Run early it does not error; it makes two
  analytics routes render the literal string `Former client`.

The general rule those two illustrate: **a migration that removes a permission
must land after the deploy that stops needing it.** There is an unavoidable
breakage window in one direction or the other, so the order is chosen, not
incidental.

**Verify:** Supabase → Table editor. Database → Publications → `supabase_realtime`
includes `notifications`.

---

## 2. Supabase Auth config

- [ ] Authentication → URL Configuration → **Site URL** = `https://theshapecommunity.com`
- [ ] **Redirect URLs**: `…/auth/callback`, plus localhost for dev.
- [ ] (Phone login) Providers → **Phone** → Twilio → Account SID + Auth Token + Messaging Service SID.
- [ ] (Phone login) Rate limits → a sane SMS OTP limit.

**Verify:** Login → Phone → real number → receive code → signed in.

---

## 3. Stripe — go live

- [ ] Stripe dashboard → **Live mode**.
- [ ] Create the platform membership recurring price → copy its Price ID.
- [ ] Developers → API keys → live **Secret key**.
- [ ] Developers → Webhooks → add endpoint (live):
      `https://theshapecommunity.com/api/stripe/webhook`, events
      `checkout.session.completed`, `customer.subscription.updated`,
      `customer.subscription.deleted`, `account.updated`, `charge.refunded`,
      `charge.dispute.created`, `charge.dispute.closed` → copy Signing secret.
- [ ] **Activate Connect** (Connect → Settings) so coach payouts work live.
- [ ] Vercel env (Production): `STRIPE_SECRET_KEY` (sk_live_…),
      `STRIPE_WEBHOOK_SECRET` (whsec_…), `STRIPE_PLATFORM_PRICE_ID` (price_…).
- [ ] Redeploy.

**Verify:** signed in as admin, `/api/health` shows `STRIPE_SECRET_KEY_mode: "live"`
and both other Stripe keys `true`. Then a real subscribe → Stripe → Webhooks
shows **2xx**.

> The coach cut and payout to a connected account only work once that coach has
> completed **live** Connect onboarding — their `stripe_account_status` flips to
> `active` on the `account.updated` webhook. Until then the checkout route
> correctly blocks that coach.

---

## 4. Video calls (Jitsi)

- [ ] Works on the free public `meet.jit.si` with no configuration.
- [ ] (Optional) set `JITSI_DOMAIN` in Vercel to a self-hosted / 8x8 JaaS domain
      for branding and an SLA.

**Verify:** book a video session → coach Confirms → both tap **Join video call**.

---

## 5. Push notifications (app closed / locked)

In-app notifications (toast + feed) work once §1 is done. System push needs:

- [ ] `cd mobile-app && npm i @capacitor/push-notifications && npx cap sync`
- [ ] Firebase service account key → Vercel env `FCM_PROJECT_ID`,
      `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` (keep the escaped newlines).
- [ ] iOS: upload an APNs key to Firebase → Cloud Messaging.
- [ ] Supabase → Database → Webhooks: on `notifications` **Insert**, HTTP POST to
      `…/api/push/dispatch`, header `x-push-secret: <value>`; same value as
      `PUSH_WEBHOOK_SECRET` in Vercel.
- [ ] Native build includes `google-services.json` (Android) + APNs (iOS).

**Verify:** on a real device, trigger a notification with the app backgrounded →
push appears on the lock screen.

---

## 6. Error tracking (Sentry)

⚠ **Web is live. BOTH APP BINARIES SHIP WITH SENTRY DISABLED**, so a crash in the
Android or iOS build is currently invisible. This is a GitHub **Actions secrets**
gap, not a code gap — the workflow already references the names.

- [ ] Android: add the repo secrets `android-build.yml` reads. Find them:
      `grep -n "SENTRY" .github/workflows/android-build.yml`
      ⚠ `VITE_SENTRY_DSN` is the only one that actually enables capture; the other
      three only upload source maps.
- [ ] iOS: create the Codemagic variable group **before** anything references it.
- [ ] Alert rules — without them Sentry files issues that notify nobody.
- [ ] Fire a real test event on **each** surface and confirm delivery.

Status and the per-surface detail live in the War Room's error-tracking section.

---

## 7. Compliance gates (blocking, owner + counsel)

None of this is code. All of it blocks a public launch.

- [ ] **Attorney review** of every document in `docs/legal/` — they are all DRAFT.
      `ls docs/legal/`
- [ ] Appoint an EU/UK **Article 27 representative**; sign DPAs/SCCs with
      sub-processors.
- [ ] ⚠ **The 18+ gate refuses nobody among existing users.** `profiles.over_18`
      is derived by a trigger from `date_of_birth` and is **NULL** for every
      account created before the gate; only an explicit `false` is treated as a
      proven minor, because refusing on NULL would lock out the entire
      pre-existing user base. **A date-of-birth completion flow is required before
      the gate means anything for those accounts.**
- [ ] ⚠ The gate also covers a **subset** of the API surface. Read the real list,
      never a prose copy of it: `GATED_API_PREFIXES` in
      `src/lib/supabase/middleware.ts`. An earlier prose copy omitted two prefixes,
      and every coverage count derived from it was wrong.
- [ ] **The locale catalogs are machine-generated.** A native-speaker pass is the
      standing follow-up before treating any of them as shippable copy.

---

## 8. Android / iOS store builds

- [ ] CI builds a debug APK already. For a signed release add the repo secrets in
      `DEPLOY.md` §9.
- [ ] Native iOS chain — see `docs/native-ios-build-checklist.md`.

---

## 9. Release gates that need real accounts

⚠ **These cannot be run by an agent** — they need seeded, authenticated accounts,
which is exactly why they are still open. Both are on the War Room board.

- [ ] **Cross-member RLS denial vector** — prove account B cannot read account A's
      data through the browser-side read.
- [ ] **Coach-channel denial matrix** — needs three seeded authenticated accounts.

---

## 10. End-to-end smoke test

On the **live** site/app after §1–3, as a brand-new account:

- [ ] Sign up (email **and** phone) → land signed in.
- [ ] Subscribe to a coach with a real card → Stripe webhook 2xx.
- [ ] As the coach: see the **booking request** → **Confirm** → client gets
      "Session confirmed" → **Join video call** works both sides.
- [ ] Coach sends a workout / meal plan → client gets the notification.
- [ ] Client logs an activity → shows in Progress, awards Shape Score, and the
      coach sees it in the client's Progress breakdown.
- [ ] Coach toggles **Pause new bookings** → new checkout is blocked.
- [ ] Chat both directions → each side gets notified.
- [ ] Opt out of check-ins in Settings → confirm the cron stops nudging.

Anything that breaks here is the real punch list.

---

## Known gaps

⚠ **Deliberately not enumerated here** — that list is what rotted last time. The
War Room carries every open item with its current state. Two that are structural
rather than pending, and so are worth naming:

- **Shape Radio is a mock station.** `src/app/api/radio/station/route.ts` returns
  `provider: 'mock'`; there is no real audio until a stream is licensed. Song BPM
  is blocked behind the same thing.
- **Timezone**: bookings store `scheduled_at` as UTC from a wall-clock picker.
  Flagged 2026-05 and **never re-verified since** — treat it as unknown, not as
  known-broken.

## Related

`DEPLOY.md` (prose setup) · `docs/native-ios-build-checklist.md` ·
`docs/WORKLOG.md` (changelog + how-we-work) · `/warroom` (status board)
