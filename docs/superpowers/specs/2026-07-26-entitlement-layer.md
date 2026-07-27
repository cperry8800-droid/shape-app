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
cause it.

⚠ **Partly FIXED already — #1837 shipped, so do not re-do it.**
`2026-07-26-purchase-plan-snapshot.sql` is on `main` and applied: it adds
`one_time_purchases.plan_snapshot`, a trigger that preserves it, and rewrites
`get_my_purchased_plans()` to a LEFT JOIN falling back to the stored snapshot.
So the *disappearing* half is closed — deleting a plan after its snapshot exists
no longer removes the purchase from the buyer's Library. What remains, and what
this document still needs, is the **mutable** half (a coach editing a plan still
changes what an un-started buyer owns, because content is resolved live rather
than from the snapshot) plus two exceptional gaps: rows purchased **before** that
migration, and deletions racing the webhook that writes the snapshot. Treat the
baseline as "durability of the ROW is solved, durability of the CONTENT is not."


## What must be true before this is build-ready

1. **The run lifecycle is fully specified**, including every transition and who
   performs it: activation, explicit end-and-replace, natural expiry, **refund
   and dispute**, failed materialization, and a coach deleting or editing the
   `coach_plans` row a live run points at. Two cases inside it are **product
   rulings, not derivable ones**, and both are open:
   - **Partial refund** — whether it ends the run, shortens the term, or does
     nothing.
   - **Restoring a won dispute onto a reused slot.** Suspending frees the
     single-active-run slot, which is deliberate — a member in dispute should not
     be blocked from buying something else. But if they start a replacement in
     the same discipline and then WIN, restoring the suspended run unconditionally
     either violates the `(client, discipline)` partial-unique constraint or
     leaves two live candidates with no precedence. The options are: the
     replacement stands and the restored run is credited some other way; the
     restore ends the replacement **with the member's consent**; or restoration
     stops being automatic and becomes a support action. This needs an owner
     ruling — it decides what a member loses when they were right.
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
  in_term       = started_on <= today AND today <= term_ends_on
  entitled      = the run's SOURCE still authorizes it     # see below
  live          = the run's own status is 'active'         # its lifecycle
  active        = live AND in_term AND entitled            # ALL THREE, always

  # ...except that a GRANDFATHERED purchase has no term to be inside:
  legacy        = the purchase is STAMPED grandfathered by the migration
  in_term       = legacy OR (started_on IS NOT NULL AND term_days IS NOT NULL
                             AND started_on <= today AND today <= term_ends_on)
  ```

  ⚠ **A null term means "no expiry", not "expired".** The migration section
  below promises pre-migration buyers keep what they bought — own-forever and
  replayable — and those rows carry no `started_on` and no `term_days`. In SQL
  the comparisons are then NULL, `active` can never be true, and the predicate
  that was written to protect paid access would have **silently revoked it from
  every legacy buyer**: the one group whose access this document explicitly
  refuses to touch. `in_term` therefore short-circuits on a termless purchase.

  Note this is a null-SEMANTICS trap, not a missing case — nothing errors and no
  branch is obviously absent; the rows simply stop matching. Any later reader
  that re-derives this predicate inline must carry the legacy clause with it,
  which is the argument for the predicate being stated once, here.

  ⚠ **Grandfathering keys on the STAMP, never on null-ness — the two are not the
  same set, and the difference is a free-access hole.** An earlier revision wrote
  `termless = started_on IS NULL OR term_days IS NULL`, which is true of a
  grandfathered row *and* of any current-shaped row that simply lacks the fields:
  a partial migration, a bug on the write path, or the coach-assigned path, whose
  term source this document still lists as **unresolved**. Those rows would have
  been handed permanent access by the same clause that protects legacy buyers —
  and they are precisely the rows the migration section says to **quarantine as
  unclassifiable**. So the migration STAMPS what it grandfathered, and only that
  stamp opens this branch; a post-migration run must carry both fields, and one
  that does not is unresolved, not free. Absence of data is not evidence of a
  promise.

  ⚠ **All three, and the run's own lifecycle is the one that is easiest to
  forget.** `in_term` and `entitled` describe the *window* and the *right* — but
  a run can be explicitly **ended or replaced** by the client while both of
  those still hold: the dates have not elapsed and the purchase is still paid.
  A predicate built from only those two would keep serving the outgoing program
  after the client swapped to a new one, and the "one active run" rule below
  would have two live candidates with no way to choose. The stored status is
  also what the refund and expiry transitions actually *write*, so leaving it
  out of the read means the transitions change a value nothing consults.

  ⚠ **`entitled` is source-specific, because a coach-assigned run has no
  purchase to ask.** Writing the rule as `purchase.status = 'paid'` reads as
  universal, and this document requires assigned content to use the *same* run
  model — so that phrasing would make every coach-assigned program permanently
  inactive (or dereference a null purchase) while the client's coaching
  relationship is perfectly valid. The run therefore records **what authorized
  it**, and `entitled` asks that source:

  ```text
  source = 'purchase'      → the one_time_purchases row has status = 'paid'
  source = 'coach_assign'  → the coaching relationship that assigned it is live
  ```

  The assigned branch is deliberately named and **not** specified further here:
  it depends on the immutable assign-time record that conditions 1 + 2 already
  block on, and inventing its predicate now would be the third time this
  document guessed at the coach-assigned path. What matters is that the shape
  is right — one predicate, one source of authority per run — so that closing
  those conditions fills a defined slot instead of reopening this one.

  Both sides of the date comparison run on the SAME frozen clock — freezing only
  the dates while deriving "today" from the mutable `shape_user_tz` (which
  `/api/client/timezone` overwrites on every app open) still moved paid access
  by a day for a member who travels near the boundary. And the lower bound is
  in the predicate itself: a future-dated run must not read as active before
  it starts. A timestamp may still be retained **for audit**, but nothing
  reads it to decide access. One boundary, one predicate, both documents.

  ⚠ **The term is a CEILING on access, never a grant of it — the purchase must
  still be paid.** A date-only predicate answers "has the paid window elapsed?"
  and silently assumes the answer to "was it paid?", which stops being true the
  moment a charge is refunded or disputed. `charge.refunded` today updates
  `one_time_purchases.status` and nothing else, and `get_my_purchased_plans()`
  already filters `status = 'paid'` — the product has *already* decided a
  refunded purchase is not owned. A run reading dates alone would therefore
  disagree with the Library on the same row: the plan vanishes from what you own
  while the materialized Eat/Train content stays live and restartable for the
  rest of the term. Every authoritative read conjoins both terms, and
  `entitled` is derived from the run's source rather than copied onto the run —
  a copy is a second source of truth that drifts the first time a webhook is
  missed.

  **Refund and dispute are therefore lifecycle transitions, and they must be
  written down — but they are NOT the same transition.**

  - **`charge.refunded` → `refunded`.** Terminal: the run stops delivering, frees
    the single-active-run slot, and is not restartable.
  - **`charge.dispute.created` → `disputed`.** **Suspended, and reversible.** It
    stops delivering and frees the slot like a refund, but it is a hold, not an
    ending.
  - **`charge.dispute.closed` is decided by the dispute's OUTCOME, not by the
    event.** Both records read `dispute.status`: won → the purchase returns to
    `paid` and the run returns to `active`; lost → the purchase stays non-paid
    and the run becomes `refunded`, terminally.

  ⚠ **The existing handler is wrong for this, and the fix is not on the run
  side.** `webhook/route.ts` marks the purchase `paid` on *every*
  `charge.dispute.closed`, without inspecting whether the buyer won — so a run
  restored "whenever the purchase is restored" would re-enable paid access after
  a dispute the buyer **lost**. Deriving both records from the outcome is
  therefore a change to the purchase path too, not just an addition to the run
  lifecycle.

  ⚠ **Why dispute cannot be modelled as a refund:** the system already treats it
  as reversible. `webhook/route.ts` handles `charge.dispute.closed` by setting
  `one_time_purchases.status` back to `paid` when the buyer prevails. If the run
  had been marked `refunded`, that restoration would give the buyer back a
  purchase whose program stays dead — `active` requires `live`, and nothing would
  ever set it live again. A member who **won** their dispute would be left worse
  off than before they raised it, and the failure is invisible: the Library shows
  the plan, the purchase reads `paid`, and only the content is missing.

  Two things neither transition may do, both learned from the expiry rule above:
  it must not delete the member's logged history (they ate those meals and did
  those sessions; a refund reverses a sale, not a life), and it must not
  retro-remove awards already granted for completed work. What ends is future
  access. A partial refund is **not** a self-evident case — whether it ends the
  run, shortens the term, or does nothing is a product ruling, and it belongs on
  the condition list rather than in a default the build picks silently.

  ⚠ **The purchase and its run must change ATOMICALLY, and reconciliation is
  mandatory rather than a nicety.** Today the webhook updates
  `one_time_purchases` directly and its handler catches failures and still
  answers **HTTP 200** — which tells Stripe the event was processed, so the retry
  that would repair a half-applied change never comes. A failure between the two
  writes therefore leaves a **non-paid purchase with a still-`active` run**, and
  that state is worse than either endpoint: `entitled` is false so the member
  gets nothing, while the run still occupies the partial-unique active-run slot,
  so they cannot start a replacement either. Paid for nothing, and blocked from
  fixing it. So both records change in one transaction — a single RPC — and
  because a webhook can also simply never arrive, a reconciliation pass must
  detect and repair drift in both directions. Freeing the slot is the part that
  must never be left to a retry, since it is what the member needs to recover on
  their own.

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

  ⚠ **But session creation is still not the moment the buyer decided — bind an
  immutable VERSION at the moment the listing is rendered.** Moving the snapshot
  earlier narrows the gap and does not close it: the buyer reads the plan on its
  page, and the checkout POST happens whenever they get around to pressing the
  button. A coach editing in between is snapshotted at *session* time, so the
  buyer is again charged for something other than what they read. The current
  route makes the mismatch concrete rather than theoretical — it reads only
  `price, published` from `coach_plans` and passes the **client-supplied item
  name** to Stripe, so the payment screen can keep showing the label the buyer
  saw while a session-time content snapshot already holds the coach's new bytes.
  The receipt and the delivery would disagree, and the receipt would be the one
  that looks right.

  So the version must be minted where the buyer's decision is formed: the
  catalogue view resolves a plan **version id**, the checkout POST carries that
  id, and session creation **validates it against the current row** rather than
  re-reading. If it no longer matches, that is not an error to swallow — the
  honest outcomes are to refuse and re-present the changed plan, or to charge
  the version the buyer actually saw. Which of the two is a product ruling and
  belongs on the condition list; what is NOT open is deriving the sold content
  from any read the buyer never saw. And nothing here works while Stripe is told
  the item's name by the client — an authoritative server-read of the label
  belongs with the version, or the receipt keeps asserting a title the snapshot
  does not contain.
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

  ⚠ **But a non-NULL `plan_id` is not evidence of what was SOLD — the row it
  points at is coach-editable, and this document's own durability section is the
  proof.** The whole reason E exists is that `coach_plans` mutates under a
  purchase: a coach can edit a plan after checkout, and the snapshot rule below
  exists precisely because resolving paid content live is wrong. Reading the
  *classification* live re-commits that error at the one moment it is hardest to
  undo — a backfill, run once, over purchases nobody is watching. A plan
  reshaped from multi-week to single-workout since the sale would backfill a
  paid program into an attendance-consumed booking (bought twelve weeks,
  received one session, and it is consumed on first attendance), and the reverse
  turns a single session into a term-bounded program. Stripe's metadata carries
  the `plan_id` but **no sale-time `buildType`**, so for most historical rows
  there is no immutable record of what shape was bought.

  So the live catalogue is **corroborating evidence, not authority**. A row
  classifies as a program only on **immutable, versioned sale-time metadata** —
  and on nothing else.

  ⚠ **Explicitly NOT the charge's line items.** An earlier revision offered them
  as a second acceptable source; they are not one. `checkout-session/route.ts`
  builds the line item's product name from the **client-supplied** `body.item.name`,
  and neither the line item nor today's metadata records a sale-time `buildType` —
  so the charge preserves a label the buyer's browser chose, not the shape the
  coach sold. Classifying from it could turn a historical booking into a program
  or the reverse, silently, during a one-shot backfill. That is the same
  client-trusted-label problem this document already raises against the receipt,
  and it disqualifies line items for the same reason: immutability is not the
  only requirement — the value also has to have been **authoritative when it was
  written**. Absent versioned metadata, the row stays unresolved.

  ⚠ **And "unmodified since the purchase" must be measured from CHECKOUT-SESSION
  CREATION, not from the purchase row.** An earlier revision offered
  `coach_plans.updated_at <= purchase.created_at` as a third form of evidence.
  It is not evidence: the purchase row is written by the **webhook**, so it is
  stamped when payment completes, and this document has already established that
  a coach can edit the plan in the gap between the buyer agreeing to a shape and
  the payment landing. An edit made inside that window satisfies the comparison
  while being exactly the change the rule was meant to catch — the same
  checkout/payment gap the snapshot rule exists for, re-entered from the other
  end. If the comparison is used at all it must run against the **Checkout
  Session's** creation time, which is the moment the buyer saw what they were
  buying. Absent that, the row is **unresolved** — the same
  third outcome the NULL case takes below, for the same reason: the failure
  direction has to favour the person who paid, and an unresolved row is a
  question asked of support rather than an answer invented by a migration.
  Guessing is worse here than in the NULL case, not better, because a non-NULL
  `plan_id` *looks* like evidence and so no one will re-examine it.

  ⚠ **A NULL `plan_id` is UNRESOLVED, never a session.** The rule as stated
  above has a hole that costs a member the thing they paid for: `plan_id` is
  `on delete set null` (`2026-06-08-coach-plans-sale.sql:12`), so a historical
  **program** purchase whose coach has since deleted the plan now reads
  `kind='booking'`, `plan_id=NULL` — indistinguishable *by this rule* from a
  single Tuesday session, and "everything else stays a booking" silently
  classifies it as one. It then never reaches the grandfathering path below,
  and a client who bought a 12-week program owns a consumed session instead.
  So the classifier has **three** outcomes, not two: program · session ·
  **unresolved**. An unresolved row is any row whose sold shape cannot be
  established from immutable sale-time evidence — which covers **both** holes:
  `plan_id` is NULL (this one), *and* `plan_id` is non-NULL but points at a
  catalogue row that may have changed since the sale (the rule above). It is
  recovered from the Stripe session metadata where that exists (the charge knows
  what was sold) and surfaced to support where it does not. It is never
  downgraded by default — the failure direction has to favour the person who
  paid.
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
