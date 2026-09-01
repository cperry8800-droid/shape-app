# Shape — Go-Live Checklist

The ordered sequence for taking what's merged into a working live state.

## ⚠ Read this before using the file

**This checklist holds ORDER and VERIFICATION METHOD. It does not hold STATUS,
COUNTS, or LISTS.** That split is deliberate and it is the whole design.

The 2026-05-30 version of this file named six migrations as "most likely
outstanding" and called Eat/Train "editorial demo content (no data model)". Both
were true the day they were written. By the time anyone next opened the file the
migration directory had grown by an order of magnitude and Eat/Train had a real
data model — and the file was still asserting the old shape. A checklist that
copies facts from elsewhere goes stale at the speed of the thing it copied.

⚠ **Counts are omitted above on purpose.** Naming the new numbers here would
recreate the identical defect one revision later.

So: **anything with a status, a count, or a membership list is a link here, never
a copy.** If you catch yourself pasting a list into this file, put a command that
computes it instead.

### The authoritative sources

| For | Read |
| --- | --- |
| **What is still open** | War Room — `/warroom`, `src/lib/warroom.ts` |
| **Which migrations exist** | `ls supabase-migrations/*.sql` |
| **What shipped, when** | `docs/WORKLOG.md` changelog |
| **Current session state** | `ls docs/HANDOFF-*.md \| sort -r \| head -1` |

⚠ **Sort handoffs by the DATE IN THE FILENAME, not `ls -t`.** Modification time is
re-stamped by any checkout, branch switch or edit, so `ls -t` reorders files whose
names say otherwise — in this repo `HANDOFF-2026-08-18.md` currently carries a
later mtime than `HANDOFF-2026-08-19.md` and sorts above it. The names are
zero-padded ISO dates, so a lexical sort is both correct and stable.
⚠ **RESOLVED 2026-09-01 — this read "`docs/WORKLOG.md` documents the `ls -t` form and
has the same defect", and it no longer does.** That bullet is corrected at the source,
spelled identically to the row above so the two files cannot drift into a third form.
Kept because the reason outlives the instance: the defect was recorded HERE for weeks
while the file every session auto-loads went on prescribing the broken command — *a fix
written only where nobody auto-reads it is not a fix.* Worst case is the web container,
where a fresh clone gives every file an identical mtime, so `ls -t` is arbitrary rather
than merely skewed: it returned a handoff **three** revisions stale.

The War Room is the go-live status board. Every item below that has an open/done
state lives there as `status: 'manual'` (owner does it) or `status: 'pending'`
(engineering does it). **This file tells you what order to do them in; the board
tells you which are left.**

---

## 0. Pre-flight

- [ ] Vercel project deploys from `main`; `https://theshapecommunity.com` resolves.
- [ ] **Sign in as an admin, then open `/warroom` and `/console`.**
- [ ] ⚠ **Test the DENIAL side too — a gate is only proven by the request it
      refuses.** Signed **out**, and again as an authenticated **non-admin**, hit
      `/api/health`, `/warroom` and `/console`: each must refuse, and
      `/api/health` must return **404 carrying no configuration data**. Confirming
      only that an admin gets in leaves an open route indistinguishable from a
      closed one.

⚠ **`/api/health` is ADMIN-ONLY and returns 404 — not 403 — to everyone else.**
Do not curl it. It was unauthenticated until 2026-07-30, when an access-control
audit found it serving the last four characters of `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` plus a full map of which integrations were provisioned,
while its own header claimed "no secrets in response". A non-admin gets 404
because an unauthorized caller has no business learning the route exists.

Admin is an **email allowlist** — `getAdminEmails()` in `src/lib/admin-access.ts`
is the authority; read it there. It merges the `ADMIN_EMAILS` and
`APPLICATIONS_EMAIL` env vars with a set of built-in defaults, so confirm the
**effective** list in the deployed environment rather than assuming either source
alone. Health checks therefore need a signed-in browser session, not a terminal.

---

## 1. Database migrations (Supabase SQL editor)

```sh
ls supabase-migrations/*.sql | sort
```

⚠ **THAT COMMAND LISTS FILES, NOT APPLIED STATE, AND NOTHING IN THIS REPO TRACKS
APPLIED STATE.** Migrations here are run by hand in the Supabase SQL editor, which
does **not** write to `supabase_migrations.schema_migrations` — so the migration
history the dashboard and CLI read is populated only by the handful ever applied
through tooling, and is wildly short of the directory. **Do not treat either the
file list or the migration history as a record of what has run.**

To find out whether a specific migration has been applied, **ask the live catalog
for the object it creates or drops.** Worked example — `coach-insert-lockout`
drops a policy, so its absence is the proof it ran:

```sql
select count(*) from pg_policies
where schemaname='public' and tablename='client_workouts'
  and policyname='trainer_insert_on_client_workouts';   -- 0 => the lockout ran
```

⚠ Check that the object was ever **created** by an earlier migration too, or you
cannot tell "applied" from "never existed".

> Adopting Supabase CLI migration tracking (with `migration repair` to backfill
> the hand-run ones) would fix this properly. That is a project, not a checklist
> edit, and it is not started.

### Ordering

⚠ **"Oldest-first, each is a no-op if already applied" is NO LONGER SAFE ADVICE.**
It was true of the handful of migrations that existed in May. It is false now:
many carry an explicit ordering or deploy dependency **in their own file header**,
and at least one breaks production if run early.

⚠ **THERE IS NO COMPLETE GREP FOR THIS, AND DO NOT TRUST ONE.** The headers are
free prose and say it a dozen different ways — `RUN THIS AFTER`, `STEP 2 of 2`,
`Depends on …`, `Order matters: …`. A keyword search written against the phrasings
someone happened to notice **silently under-reports**: the first version of this
section shipped a grep that missed roughly a third of the constrained migrations,
and the two examples that exposed it were found by a reviewer rather than by the
grep. ⚠ **A short result here is not reassurance — it is the failure mode.**
**Read every migration header you are about to run.** The command below is a
starting point for triage, never a clearance:

```sh
grep -rilE "run .*after|only after|before the deploy|step [12] of 2|run before|depends on|order matters|must be applied|prerequisite|apply after" supabase-migrations/*.sql
```

Two worked examples, so you know the shape of what those headers say:

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

⚠ **`/api/health` reports only that `STRIPE_PLATFORM_PRICE_ID` is SET, and the
checkout route uses it without validating it.** A stale, test-mode, inactive or
simply wrong price ID passes that boolean and then charges the wrong thing. Before
the first real checkout, retrieve the Price in **live** mode and confirm its
`active` status, `recurring` interval, product, currency **and amount** are the
ones you intend.

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

⚠ **THE TWO BINARIES ARE CONFIGURED IN DIFFERENT PLACES, AND DOING ONLY ONE LEAVES
THE OTHER DARK.** Android reads **GitHub Actions secrets**; iOS reads a
**Codemagic variable group**. Adding the GitHub secrets does nothing for iOS.
Neither is a code gap — both pipelines already reference the variable names.

**Whether either binary currently captures anything is a status, so check it, do
not read it here** — the War Room's error-tracking section carries the per-surface
state. The check itself: a binary has capture only if its pipeline supplied a DSN
**at the build that produced it**.

- [ ] **Android — GitHub Actions secrets.** Add the ones the workflow reads:
      `grep -n "SENTRY" .github/workflows/android-build.yml`
      ⚠ `VITE_SENTRY_DSN` is the only one that enables capture; the rest upload
      source maps.
- [ ] **iOS — Codemagic variable group.** Create the group **before** anything
      references it: `codemagic.yaml` notes that referencing a group which does
      not exist yet **breaks the iOS build on the next push to main**, which is
      why the DSN and upload vars are deliberately still unwired.
- [ ] ⚠ **Rebuild and re-ship each artifact after configuring it.** Vite inlines
      `import.meta.env.*` at **build** time, so a binary already in TestFlight or
      Play can never be fixed by setting a variable — it has to be built again.
- [ ] Alert rules — without them Sentry files issues that notify nobody.
- [ ] Fire a real test event on **each** surface and confirm delivery.

Status and the per-surface detail live in the War Room's error-tracking section.

---

## 7. Compliance gates (blocking, owner + counsel)

None of this is code. All of it blocks a public launch.

- [ ] **Attorney review** of every document in `docs/legal/` (`ls docs/legal/`).
      Each file states its own status in its header — read that, rather than
      trusting a status recorded here.
- [ ] ⚠ **Article 27 representatives — EU and UK are SEPARATE regimes, and one
      appointment does not satisfy the other.** If Art.3(2) applies under both,
      appoint one representative established in an EU member state **and** one in
      the UK. If counsel concludes an Art.27(2) exception applies, or launch is
      geo-restricted away from those markets, record that analysis instead — the
      exceptions are narrow and rarely fit a commercial service.
- [ ] Sign DPAs/SCCs with sub-processors.
- [ ] ⚠ **The 18+ gate REFUSES an unproven account — but grandfathers the ones
      that predate the rule.** The policy is `mustRefuseForAge()` in
      `src/lib/age-derive.mjs`; read it there, not from a prose copy. A usable
      `date_of_birth` decides in **both** directions, so a proven adult is never
      refused by the cutoff. When the row proves nothing either way, the account's
      `created_at` decides: **on/after `ADULT_PROOF_REQUIRED_FROM` it is refused**,
      before it is grandfathered. A **null/absent profile refuses** — that is
      deliberate, because "no row" is what a failed provisioning write leaves.
      ⚠ Callers must `select created_at` alongside the age columns; a forgotten
      column reads as unplaceable and refuses.
      **What is actually open** is the grandfathered cohort — the accounts created
      before the cutoff, which absence still admits. Closing it needs a
      date-of-birth completion flow **and an owner/counsel decision** on whether to
      un-grandfather them at all. **Test every age-restricted route and action
      against five fixtures**, not three: a valid adult DOB · a valid minor DOB ·
      no proof with `created_at` **before** the cutoff (admits) · no proof with
      `created_at` **on/after** it (refuses) · and an **absent profile** (refuses).
      ⚠ Also confirm each caller actually **selects `created_at`** — a forgotten
      column makes an account unplaceable and it refuses, so the omission shows up
      as a locked-out member rather than as a failing test.
      ⚠ **`src/lib/age-gate.ts`'s own file header contradicted this until
      2026-08-21**, saying absence "is not treated as a claim either way" while
      line ~70 of the same file correctly said absence no longer admits. The
      header has been corrected and now states that absence refuses. Trust
      `mustRefuseForAge()` regardless — a prose copy is what went stale here, and
      this line is the copy that outlived the source it described.
- [ ] ⚠ The gate also covers a **subset** of the API surface. Read the real list,
      never a prose copy of it: `GATED_API_PREFIXES` in
      `src/lib/supabase/middleware.ts`. An earlier prose copy omitted two prefixes,
      and every coverage count derived from it was wrong.
- [ ] **The locale catalogs are machine-generated.** A native-speaker pass is the
      standing follow-up before treating any of them as shippable copy.

---

## 8. Android / iOS store builds

- [ ] Check what CI builds today before assuming a signed release exists —
      `.github/workflows/android-build.yml` is the authority, not this line. For a
      signed release, add the repo secrets named in `DEPLOY.md` §9.
- [ ] Native iOS chain — see `docs/native-ios-build-checklist.md`.

---

## 9. Release gates that need real accounts

⚠ **These cannot be run by an agent** — they need seeded, authenticated accounts,
which is exactly why they are still open. Both are on the War Room board.

⚠ **A DENIAL GATE THAT TESTS ONLY READS CAN PASS WITH A WRITE PATH WIDE OPEN.**
Cover every operation class that crosses a member boundary, not just `select`:

⚠ **"EVERYTHING MUST DENY" IS THE WRONG GATE AND WOULD FAIL ON CORRECT CODE.** An
active coach is *supposed* to read their own client, so the matrix has to be keyed
on the **relationship**, not just on "a different user id". Getting this backwards
is worse than not testing: someone makes the test pass by removing legitimate
coach access.

- [ ] **Cross-member RLS denial vector.** Two axes — who is asking, and for what.
      - **B, an unrelated member, against A:** every operation denies —
        **read · insert · update · delete**, the **SECURITY DEFINER RPCs** taking a
        user id, **storage** objects under A's prefix, and the **server routes**
        that read A by id.
      - **A coach with an ACTIVE relationship to A:** the documented reads
        **succeed** (that is the product), and everything outside them denies —
        no writes to A's private rows, nothing beyond the scope the RPC exposes.
      - **A coach with NO active relationship, or an ENDED one:** denies exactly
        like B. Ending a relationship must actually close the door.
      - **Display-only RPCs** (e.g. `get_display_names`) are the deliberate
        exception: they return display fields to a broad audience by design.
        Assert the **narrow** shape — that they return display fields and **not**
        email, phone, DOB or Stripe ids — rather than asserting they deny.
      ⚠ Run every case against tables that actually **hold A's rows** — a denial
      test over an empty table cannot fail, so it cannot pass either.
- [ ] **Coach-channel denial matrix** — needs three seeded authenticated accounts
      (two members, one coach) and the same operation classes per pair.

---

## 10. End-to-end smoke test

⚠ **Run this LAST — after §1–9, not after §1–3.** The steps below exercise Jitsi
(§4), push notifications (§5), a shipped binary (§8) and seeded accounts (§9), so
running it early fails on unfinished setup rather than on real defects.

⚠ **This needs TWO identities, not one** — a brand-new **client** account, and a
separate seeded authenticated **coach** account with a live listing. A single
account cannot exercise the coach-side permission and notification paths at all,
which is exactly where the interesting failures are. Sign out and back in at each
**⇄ handoff** below.

⚠ **The coach fixture must reach `stripe_account_status = 'active'` BY ACTUALLY
COMPLETING LIVE CONNECT ONBOARDING — do not seed the column.** Setting the flag
directly produces a fixture that passes checkout while leaving the onboarding and
status-gate paths entirely unexercised, which is the same false-pass shape as
testing a denial against an empty table. Walk the real flow, confirm
`stripe_account_id` persists and the status flips via the success page or the
`account.updated` webhook, and exercise a **refresh / re-entry before completion**
so the incomplete-onboarding branch is covered too. Until the status is `active`
the checkout route correctly blocks that coach.

- [ ] **[client]** Sign up (email **and** phone) → land signed in.
- [ ] **[client]** Subscribe to the coach with a real card → Stripe webhook 2xx.
- [ ] **⇄ handoff to the coach account.**
- [ ] **[coach]** See the **booking request** → **Confirm**.
- [ ] **⇄ handoff to the client.** Client gets "Session confirmed" → **Join video
      call** works for both sides.
- [ ] **[coach]** Send a workout / meal plan → **[client]** gets the notification.
- [ ] **[client]** Log an activity → shows in Progress and awards Shape Score →
      **[coach]** sees it in that client's Progress breakdown.
- [ ] **[coach]** Toggle **Pause new bookings** → a new checkout is blocked.
- [ ] Chat both directions → each side gets notified.
- [ ] **[client]** Opt out of check-ins in Settings → confirm the cron stops
      nudging.

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
  **Status unknown** — this was flagged once and never re-checked, so treat it as
  neither confirmed nor cleared. Whether anyone has since verified it belongs in
  the War Room, not here.

## Related

`DEPLOY.md` (prose setup) · `docs/native-ios-build-checklist.md` ·
`docs/WORKLOG.md` (changelog + how-we-work) · `/warroom` (status board)
