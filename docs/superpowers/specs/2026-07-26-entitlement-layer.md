# The entitlement layer — design

> ⚠ **DRAFT — NOT BUILD-READY.** Nothing in this document may be built from
> until the four conditions in
> **[What must be true before this is build-ready](#what-must-be-true-before-this-is-build-ready)**
> are closed. They sit above the design body, not at the end of the file — the
> design is recorded for continuity, and reading to the end is not the gate. It
> is split out of
> [`2026-07-25-nutrition-week-block-programs.md`](2026-07-25-nutrition-week-block-programs.md),
> where it was section **E**, so the parts of that wave that do not need it are
> not held behind it. **The parent spec's build-ready table is the sole
> authority on per-track status** — this document deliberately restates none of
> it, because a copy here went stale within a day of being written (it said
> C1a was blocked after the parent had unblocked it).

## Why this is its own document

E was written as a section of a nutrition spec, but it is not a nutrition
change. It decides **what a client owns after they pay** — across purchases,
Stripe checkout metadata, run lifecycle, term expiry, replay bounds, and
cross-discipline exclusivity. Nutrition is one consumer of it; training is
another, and training already has a live hole it is meant to close (finding ③
in the parent spec: `startPurchasedPlan` is replayable forever).

**The evidence that it needed splitting is its own review history.** Across five
review rounds on PR #1834, reviewers returned **fifteen findings — every one of
them in this section**, and rounds 2–4 were each caused by the *previous* round's
fix:

| Round | Fix made | What the next round found it opened |
| --- | --- | --- |
| 2 | Key program-week rows on the **run**, not `program_id` (so a re-buy is representable) | Two runs can now be live at once, and the precedence ladder has no tiebreak |
| 3 | Add **single-active-run** + a durable run row | An active run with **zero weeks** (failed materialization) locks the client out until term expiry; and the "coach-assignment id" the run key relied on **does not exist** |
| 3 | Gate legacy classification on `one_time_purchases.created_at` | That column is written by the **webhook on payment**, so a checkout opened pre-migration and paid post-migration is quarantined despite being paid |
| 4 | Gate on the Stripe **session** timestamp instead | A rolling deploy lets the old handler create unstamped legacy sessions *after* the cutoff — same bug, new clock |
| 5 | — (no round-4 fix caused these; they are seams in the NEIGHBOURS of what rounds 2–4 touched) | Durability said "snapshot onto the purchase" without saying **when**, and the purchase row is created at the webhook — a coach editing between checkout-open and payment has the buyer charged for one thing and delivered another · classification had **two** outcomes where a deleted legacy program needs a third (`plan_id` NULL is *unresolved*, not a session) · activation idempotency keyed on the purchase has to express **retry** and **intentional restart** with one key, and those are opposite |

That is the signature of a design whose blast radius exceeds what a section can
hold, not of a document being polished. Each fix was correct in isolation and
opened a seam at its boundary with the next.

⚠ **Round 5 is the one that should settle the question.** Rounds 2–4 could be
read charitably as a fix-chain converging — each round closing the seam the last
one opened, so the end is in sight. Round 5 breaks that reading: its three
findings were **not** caused by round 4's fix. They are in the parts of this
design that had been *written but never scrutinized at depth* — snapshot timing,
the classifier's outcome set, the meaning of an idempotency key. So the supply of
seams is not being drained by fixing them; rounds were finding what rounds
happened to look at. That is a coverage problem, not a convergence problem, and
it is why condition 4 below asks for a pass over the **whole document** rather
than another pass over the last diff.

## ⚠ A LIVE bug surfaced by this work — fix independently, do not wait for E

Review round 4 surfaced a defect that **exists in production today** and is not
caused by anything in this design:

- `one_time_purchases.plan_id` is `references public.coach_plans(id) **on delete
  set null**` (`supabase-migrations/2026-06-08-coach-plans-sale.sql:12`)
- `get_my_purchased_plans()` **inner-joins** the live catalogue row:
  `join coach_plans cp on cp.id = otp.plan_id ... and otp.plan_id is not null`
  (`:45-46`)

So a coach **editing** a plan silently changes what an un-started buyer paid
for, and a coach **deleting** it makes that purchase **disappear from the
client's Library entirely** — money taken, nothing owned, no trace on the
client's side. This wave makes the exposure worse (ruling 3 stretches the
dormant window from "until they open it" to "indefinitely"), but it does not
cause it. **It has its own PR and must not wait on E.**

## What must be true before this is build-ready

1. **The run lifecycle is fully specified**, including every transition and who
   performs it: activation, explicit end-and-replace, natural expiry, failed
   materialization, and a coach deleting or editing the `coach_plans` row a live
   run points at.
2. **Paid AND assigned content is durable** — the snapshot rule below is settled
   and the Library no longer resolves paid content from mutable catalogue rows.
   This must cover **coach-assigned runs, not only purchased ones**: they have
   no purchase to snapshot from and no assignment record to snapshot onto, so
   today they would resolve term and content from a `coach_plans` row the coach
   can edit or delete between assigning and activating. Either assignment
   creates an immutable record, or the durable run is created at assign time and
   *is* that record.
3. **The cross-discipline exclusivity rule is owner-ruled**, not inferred: what
   happens when a client holds a live nutrition run and starts a training one,
   and whether "one active run" is per-discipline or global.
4. **A fresh adversarial pass finds no new seam** — given rounds 2–4 each opened
   one and round 5 found three more in parts no round had yet examined, one
   clean round is the minimum bar, and it must be run against the **whole
   document** rather than against the last diff. Round 5 is the evidence that a
   diff-scoped pass cannot clear this bar: it would have found none of them.

Everything below is the design as it stood at the end of review round 5. It is
recorded so the thinking is not lost, **not** so it can be built from.

---

## The design as reviewed (round 5)

Ruling 6 puts this outside nutrition: it is a **platform** change that also fixes
a live training hole (finding ③). It can be built in parallel with the C tracks and must
land before C2's end-of-program rule.

- **Make the purchase kind real** (finding ②) — `booking` | `program` |
  `meal_plan`, derived from what was bought rather than from the provider's role.
  Everything downstream depends on telling a program from a single session.
- **Give a program purchase a term** and, per ruling 3, a **`started_at` stamp
  set when the client starts it** — not at purchase. A never-started purchase
  has no clock running.
- ⚠ **Snapshot the term LENGTH onto the purchase; never read it from the
  catalogue at expiry time.** Ruling 3 fixes when the clock *starts* but says
  nothing about how long it runs, and the only other source is the coach's
  `coach_plans` row — which the coach can edit at any time. Reading it live
  means a coach shortening their program silently expires clients who already
  paid, lengthening it silently extends them, and deleting the plan row makes
  expiry undefined. Store an immutable **`term_days`** **on the run row,
  snapshotted at activation** — taken from the purchase for a bought program —
  and compute expiry from that alone.

  ⚠ **The boundary is DATE-ONLY, and it is the parent spec's, not a second one.**
  An earlier draft resolved a `term_ends_at` *instant*, which conflicts with the
  nutrition readers: they use the immutable `started_on` / `term_ends_on` dates
  the parent spec now mandates, so an instant-based boundary would end paid
  access on a **different local calendar day** than the surfaces the member is
  actually looking at — for anyone who starts near midnight or whose
  launch-captured timezone later changes. E adopts the parent's fields verbatim
  as the entitlement authority:

  ```text
  started_on    — date, stamped once at activation        (immutable)
  activation_tz — the member's IANA zone at that moment   (immutable)
  today         = current date in activation_tz            # never shape_user_tz
  term_ends_on  = started_on + term_days - 1               # INCLUSIVE
  active        = started_on <= today AND today <= term_ends_on
  ```

  Both sides of the comparison run on the SAME frozen clock — freezing only
  the dates while deriving "today" from the mutable `shape_user_tz` (which
  `/api/client/timezone` overwrites on every app open) still moved paid access
  by a day for a member who travels near the boundary. And the lower bound is
  in the predicate itself: a future-dated run must not read as active before
  it starts. A timestamp may still be retained **for audit**, but nothing
  reads it to decide access. One boundary, one predicate, both documents.

  ⚠ **For a COACH-ASSIGNED run the source is unresolved, not "the assignment."**
  An earlier draft said the term came "from the assignment," but the parent spec
  establishes there is no assignment record to take it from: `BSProAssignPage`
  writes straight through `ShapeAssign` and creates none, and
  `coach_program_assignments` is FK'd to *templates*, not to the `coach_plans`
  row being assigned. Creating the durable run **at activation** does not close
  this either — it means term and content are read from a `coach_plans` row the
  coach may have edited or deleted in the interval, so a coach-assigned run has
  no authoritative snapshot to materialize from. Either the assignment must
  create an immutable record **at assign time**, or the durable run must be
  created at assign time and *be* that record. **This is condition 1 + 2 above
  and is unresolved** — do not build the coach-assigned path until it is ruled. Where a legacy plan carries no stateable duration the purchase is
  **unclassifiable** and takes the rule below — not a guessed default, which
  would be fabricated precision about something a member paid for.
- ⚠ **Snapshot the sold CONTENT too, not just its duration — and note that this
  is a LIVE bug, not only a design gap.** A term snapshot doesn't make a dormant
  entitlement durable while the catalogue underneath it stays mutable. Today
  `one_time_purchases.plan_id` is `references coach_plans(id) **on delete set
  null**` (`2026-06-08-coach-plans-sale.sql:12`) and `get_my_purchased_plans()`
  **inner-joins** the current `coach_plans` row with `plan_id is not null`
  (`:45-46`). So right now: a coach **editing** a plan silently changes what an
  un-started buyer paid for, and a coach **deleting** it makes the purchase
  **disappear from that client's Library entirely** — money taken, nothing
  owned, no trace on the client's side. Ruling 3 makes this worse by design,
  because it stretches the dormant window from "until they open it" to
  "indefinitely, until they start it."

  The build must **snapshot the sold plan's identity, label, and materializable
  content onto the purchase (and onto the run at activation)**, and resolve paid
  content from that snapshot — never from live `coach_plans` at start time. The
  alternative shape is versioning + retaining sold catalogue rows; either works,
  but resolving live does not. The Library must also stop vanishing a paid
  purchase whose `plan_id` went NULL: what a client bought is theirs whether or
  not the coach still sells it.

  ⚠ **A snapshot of `detail` is NOT a snapshot of the plan — the media are
  bytes in a bucket the deletion flow purges.** Plan media and per-exercise
  clips live as objects under `coach-media/<uid>/…`, and `detail` carries only
  their **URLs**. `/api/account/delete` purges the coach's entire owner folder
  (deliberately hardened to do so — >1000-object pagination, sub-folder
  recursion, purge-first ordering, per the 2026-07-24 wave). So a coach
  deleting their account leaves every purchased snapshot pointing at deleted
  objects: the label survives, the demonstration of how to perform the
  content does not. The durability condition therefore covers **bytes, not
  just rows**, and the build must choose one of: **copy sold media into a
  purchase-owned location at snapshot time** (aligns with the checkout-time
  rule above — same moment, same reasoning), **retain sold objects on
  deletion** (which weakens the deletion promise and needs its own ruling), or
  **explicitly rule that media do not survive coach deletion** and say so on
  the purchase surface. Silently shipping the first option's cost or the
  third option's loss is not a choice — it is the conflict going unresolved
  onto whoever hits it first.

  ⚠ **The snapshot must be taken at CHECKOUT-SESSION CREATION, not at the
  webhook.** Those are two different moments with a coach-editable gap between
  them: `checkout-session/route.ts` reads the catalogue to price and display the
  plan, and `webhook/route.ts` creates the purchase row only once payment
  completes. A snapshot taken at webhook time therefore captures whatever the
  plan is *then* — so a coach who edits between the buyer opening checkout and
  the payment landing has the buyer pay for what they were shown and receive
  something else, with the receipt asserting it was the same thing. Capture the
  snapshot (or an immutable plan **version** id) when the session is created,
  carry it through Stripe `metadata`, and have the webhook persist what the
  session already committed to rather than re-reading the catalogue. The webhook
  then has no authority to choose content at all, which is the property that
  makes the guarantee hold: **the buyer is charged for and delivered the same
  bytes.**
- ⚠ **Carry the PURCHASE id, not just the plan id — the per-purchase invariant
  is unrepresentable without it.** Ruling 2 makes a program a *repeatable* sale,
  so a client can buy the same catalog program twice; today nothing downstream
  can tell the new entitlement from the expired one. `get_my_purchased_plans()`
  returns `coach_plans.id`, not `one_time_purchases.id`
  (`2026-06-08-coach-plans-sale.sql:40-47`); the Library dedupes on
  `plan-<plan id>` (`iosAppBroadsheetClient.jsx:1543-1549`); and
  `startPurchasedPlan` receives only that plan id (`:1621`). So a re-buy would
  either re-attach to the OLD expired purchase or overwrite its run instead of
  opening the newly paid term — the client pays and gets nothing new. The build
  must **return the purchase id, thread it through activation and onto the
  materialized rows, and make the server-side term check key on it.** Library
  identity becomes per-purchase, not per-plan.
- ⚠ **Define how a purchased NUTRITION program is started — there is no path
  today.** Rulings 2–3 require a purchased program to sit dormant until the
  client begins it, but the client start flow is training-only:
  `BSLibraryDetail` explicitly excludes `planKind === 'meal_plan'` from
  `canStart` (`iosAppBroadsheetClient.jsx:1592-1594`), and the one call site
  (`:1621`) invokes `ShapeSelfTraining.startPurchasedPlan`. C2 covers *coach*
  assignment, so a nutrition purchase can currently **never start its
  entitlement clock**. The build must state: the activation surface + API, how
  the assign-time conflict choice (ruling 5 — replace vs pause) is obtained when
  the CLIENT is the one starting, and how activation materializes/selects its
  weeks. Without this, E's term is unreachable for half the wave's own subject.
- **Bound the replay, and enforce it on the SERVER.** `startPurchasedPlan`
  currently lets a client restart week 1 forever. The invariant is
  **one active run per `(client, discipline)`** — see the scope note below;
  per-purchase uniqueness follows from it but is strictly weaker and must not be
  implemented in its place. Starting stamps `started_at` (ruling 3) and
  opens the term; re-starting *inside* the term is a **restart of the same run**
  (the existing atomic new-rows-then-delete-old behavior, term unchanged — it
  does not extend the clock); starting *after* the term has elapsed is
  **refused** and offers the re-buy. This must be checked where the rows are
  written, not in the UI — the client owns their own `client_workouts` rows
  under RLS, so a UI-only bound is not a bound at all.
- ⚠ **"Server-enforced" is not enough — the bound must be ATOMIC.** A read-then-
  write check races: two start requests arriving together both read "no active
  run", both pass, and both materialize a run for one purchase — which is
  exactly the unbounded replay the bullet above exists to close, reachable by a
  double-tap. The invariant must be held by the database, not by a sequence of
  statements: a **partial unique index**, plus a **`pg_advisory_xact_lock`**
  taken before the read so the restart path (new-rows-then-delete-old) is
  serialized against a concurrent start rather than interleaved with it. This is
  the house pattern already in use for exactly this class —
  `cycle_set_settings`/`cycle_opt_out` share a per-user advisory lock, and
  `claim_tier_reward` + `redeem_store_item` take one before their guarded
  writes. Activation must also be **idempotent under retry** — but ⚠ **keying
  that on the purchase alone cannot work, because it has to express two
  opposite intents at once.** Ruling 2 permits an intentional within-term
  restart, and a flaky network produces a duplicate of the very same request;
  keyed on the purchase these are the same key, so one rule must serve both. If
  a repeat restarts the run, then a delayed retry silently rematerializes and
  replaces the member's rows — that is not idempotent, it is a second restart.
  If a repeat is a no-op, the deliberate restart is unreachable. The purchase
  identifies *what* is being started; it cannot identify *which attempt*.

  So each activation/restart attempt carries its own **idempotency key**,
  client-generated per user action: a duplicate key returns the ORIGINAL
  result unchanged (the retry case), and a new key is a genuine restart
  request (the intent case). Retry-safety and restart then stop competing for
  one signal, and the advisory lock above still serializes the writes.

  ⚠ **The key is client-generated, so it is not trusted on its own.** A raw key
  is guessable and collidable across accounts, so the stored result is scoped to
  the **authenticated** activation context, not to the key:

  - **Uniqueness is `(client, purchase, operation, idempotency_key)`** — the
    client comes from the session, never the payload. Two members choosing the
    same key cannot see each other's result, and a key replayed against a
    *different* purchase is a different row rather than a false hit.
  - **A key reused with a mismatched payload is REJECTED**, not served the old
    result. Returning the first result for a second, different request would
    silently discard what the member asked for; a `409` tells the caller their
    key is spent.
  - **Retained for the full retry window** — at minimum the longest interval a
    client or Stripe will retry over — so a late duplicate still finds the
    original result rather than falling through and restarting the run.

  ⚠ **The binding scope is (client, discipline) — NOT (purchase).** An earlier
  draft wrote this bound as "one active run per purchase," which the nutrition
  spec then referred to while stating its own, *stronger* rule: at most one
  active nutrition run per client. Those are not the same invariant, and the
  weaker one does not imply the stronger: **two different purchases could each
  activate a nutrition run and both satisfy a purchase-scoped index**, leaving
  two live runs and a precedence ladder with no winner. Per-purchase uniqueness
  is a consequence, not the rule. So the unique index and the advisory-lock key
  are both **`(client, discipline)`**, and the two documents state one
  invariant. ⚠ Whether "discipline" is the right axis at all — i.e. whether a
  live nutrition run should block a training one — is **condition 3 above and is
  unresolved**; until it is ruled, do not build either scope.
- **Honest end state** on both surfaces: the plan stops, the client is told the
  program is complete, and the re-buy is offered. Never a silent empty Eat or
  Train tab.
- **A single session is untouched** — consumed by attendance, not by time.

**Migration + backfill for rows that already exist.** Every historical row is
`kind='booking'` or `'meal_plan'` with no term, so the build must state what
happens to them rather than leave it to the reader:

- **Classification.** A legacy row is a **program** only if it carries a
  `plan_id` whose `coach_plans` row is a program/multi-week kind; everything
  else stays a **single session** (`booking`) or a one-off `meal_plan`. There is
  no other signal — the kind was derived from provider role (finding ②), so it
  cannot be trusted to distinguish them.

  ⚠ **A NULL `plan_id` is UNRESOLVED, never a session.** The rule as stated
  above has a hole that costs a member the thing they paid for: `plan_id` is
  `on delete set null` (`2026-06-08-coach-plans-sale.sql:12`), so a historical
  **program** purchase whose coach has since deleted the plan now reads
  `kind='booking'`, `plan_id=NULL` — indistinguishable *by this rule* from a
  single Tuesday session, and "everything else stays a booking" silently
  classifies it as one. It then never reaches the grandfathering path below,
  and a client who bought a 12-week program owns a consumed session instead.
  So the classifier has **three** outcomes, not two: program · session ·
  **unresolved**. An unresolved row is one whose `plan_id` is NULL *and* whose
  kind cannot otherwise be established; it is recovered from the Stripe session
  metadata where that exists (the charge knows what was sold) and surfaced to
  support where it does not. It is never downgraded by default — the failure
  direction has to favour the person who paid.
- **Grandfathering, stated explicitly.** Legacy program purchases have no
  `started_at` and no term. They are **not** retro-expired — a client who
  already bought keeps what they bought. They carry a null term and behave as
  they do today (own-forever, replayable); the term applies to purchases made
  **after** the migration. Retro-expiring a past purchase would be taking away
  something already paid for.
- ⚠ **Fail-open is scoped to PRE-MIGRATION rows only — it is not a general
  fallback.** An unclassifiable row created *before* the migration is a genuine
  gap in history we chose not to punish a paying client for: it grandfathers
  exactly as above (no term, current behavior). But applying the same rule
  *after* the migration turns "classification failed" into **permanent free
  entitlement**, reachable by any purchase that misses classification — which is
  the opposite of what the term exists to do, and is exploitable by whatever
  makes a row unclassifiable. So the rule is keyed on the **migration
  boundary**, not on the classifier's mood:
  - **legacy-shaped** and unclassifiable → **grandfathered** (no term, behaves
    as today).
  - **current-shaped** and unclassifiable → **no entitlement is granted**, and
    the row is **quarantined and surfaced** (a loud server log + a War Room
    item), because under the current schema the kind is written at checkout from
    what was actually bought (finding ②) — an unclassifiable row there is a
    **bug in our write path, not a legitimate state**, and silently granting it
    forever would hide the bug behind a free program.

  ⚠ **The boundary is a stamped schema version — NOT
  `one_time_purchases.created_at`.** That row is inserted by the **webhook, on
  payment completion**, so its `created_at` records when the money landed, not
  when the session was built. A checkout opened before the migration and paid
  after it therefore lands post-cutoff carrying legacy metadata and no term
  snapshot — and a `created_at >= migration_ts` rule would **quarantine a
  genuinely paid purchase** for nothing but crossing the deploy boundary
  mid-checkout. So the build stamps an explicit **checkout-schema version into
  the Stripe session metadata at session-creation time**, and classification
  reads that. The version travels with the purchase, so it cannot be
  desynchronized by delivery latency, webhook retries, or a redeploy mid-flight.

  ⚠ **An UNSTAMPED session is legacy — always. No time-based fallback.** The
  obvious fallback (use the Stripe session's own creation timestamp when the
  stamp is missing) quietly reintroduces the very bug it was meant to close: on
  a rolling deploy the old checkout handler is still live, so it can create a
  **legacy-shaped, unstamped session AFTER the cutoff** — which a timestamp rule
  then classifies as current and **quarantines a genuinely paid purchase**.
  Absence of the stamp is itself the only reliable proof that the legacy writer
  created the session, and it is proof that no clock can contradict. So:
  **unstamped → legacy → grandfathered**, unconditionally. An unstamped session
  appearing unexpectedly late is a **monitoring** concern — alert on it, page
  someone, fix the writer — but it must never be a reason to deny a client
  something they paid for. Time is evidence about deployment; it is not evidence
  about entitlement.
  - The client-facing state for a quarantined row is the **honest** one — the
    purchase is visible and support can resolve it — never a silent empty tab
    and never a fabricated term.
