# Error tracking, in two layers — design

**Status:** approved 2026-07-31. Layer 2 builds first; Layer 1 is blocked on an owner
account that does not exist yet.

Two independent systems that answer two different questions:

- **Layer 1 (Sentry)** — *what threw?* Standard crash and exception reporting across the
  three runtimes.
- **Layer 2 (guardrail health)** — *what failed without throwing?* A scheduled check over
  `analytics_events`, because the progression guardrail **never throws by contract** and is
  therefore invisible to Layer 1 by construction.

Layer 2 is not a nice-to-have sitting behind Layer 1. It covers the failure modes that
matter most, and it is the only one of the two that can be built today.

---

## Premise corrections

Recorded so they are not re-litigated. All four were verified against the repo before this
document was written.

- ⚠ **The mobile app is not React Native.** `mobile-app/package.json` declares
  `"name": "shape-capacitor"`; the stack is Capacitor 7 + Vite 8 + React 19, and there is
  **no `react-native` dependency anywhere in the repo**. `mobile-app/ios/` and
  `mobile-app/android/` are Capacitor shells wrapping a WebView, not RN projects.
  `@sentry/wizard -i reactNative` looks for Metro config and RN native build phases; against
  this repo it fails or writes configuration matching nothing. **The correct pairing is
  `@sentry/capacitor` + `@sentry/react`.**
- ⚠ **`malformed_history` is not an event — it is a `reason` VALUE.** The whitelist in
  `track_event` carries exactly three names relevant here: `session_rpe_prompted`,
  `session_rpe_dropped`, `guardrail_evaluated`. Per the core's own doctrine, **one malformed
  row turns the whole evaluation `unknown`** — so malformed is a *subset* of unknown,
  reachable only through the `unknownReason` field. The originally requested name was
  therefore right; only its level was wrong.
  ⚠ **And there are TWO malformed values, not one** — `malformed_history` *and*
  `malformed_week` (`progressionGuardrail.mjs:2137`, `:2150`, `:2168`). A check matching
  only the first silently misses every malformed proposed week.
- ⚠ **`guardrail_evaluated` measures coach activity, not system health.** A 24-hour window
  with no coach work is an ordinary quiet day, not a fault. The originally specified
  "count = 0 over 24h" alert would have fired on most pre-launch days. **Dropped until
  launch** — see *Registered, not built*.
- ⚠ **THE EVENT'S OWN DOCUMENTED WRITE RULE IS WRONG, AND LAYER 2's DENOMINATOR DEPENDS ON
  IT.** `2026-07-29-guardrail-week-publish.sql:266` states the event is *"Written
  SERVER-SIDE AT PUBLISH ONLY, one row per publish regardless of session count."*
  **Both halves of that sentence are false.** There are **two** emission sites —
  `src/lib/week-publish-server.ts:209` (publish) and
  `src/app/api/trainer/adjust/route.ts:327` (**Adjust**) — and the Adjust one sits inside a
  per-evaluation `map`, so a single Adjust request can write **several** rows. The payload
  already anticipates this: `adjustMode` exists precisely to tell the two apart.
  **Consequence for this design: the denominator is EVALUATIONS, not publishes**, it is
  larger than the comment implies, and the 20-evaluation floor will therefore be reached
  sooner than a publish-only reading would predict. Every rate in this document is per
  evaluation. See *Recorded findings*.
- ⚠ **"Coach or client" is not binary.** `public/supabase.js:83` reads `profile.roles` as an
  **array**, with singular `profile.role` as a legacy fallback; `dietitian` is treated as an
  alias for `nutritionist` at line 109. Dual-role accounts are real. A boolean tag would
  erase that distinction exactly where an incident needs it.

The one premise that held: `analytics_events` already carries
`analytics_events_event_ts_idx on (event, ts)` — precisely the index every Layer 2 query
needs. No scan problem.

---

# Layer 2 — guardrail health (build first)

## Where it lives

**Vercel cron**, at `/api/cron/guardrail-health`, daily.

Chosen over Supabase `pg_cron` because five Vercel crons already exist in `vercel.json`
sharing one `CRON_SECRET` authentication pattern, and `/api/cron/analytics-purge` already
reads this exact table from a Vercel cron. `pg_cron` would add a second scheduler with no
existing pattern here, no secret-rotation story, and no straightforward egress for an alert.
**Reusing a pattern already reviewed twice is worth more than any technical edge pg_cron
has.**

Authentication copies `analytics-purge` exactly: `x-cron-secret: <CRON_SECRET>` or
`Authorization: Bearer <CRON_SECRET>`, compared with `timingSafeEqual`.

## The four checks

| # | Check | Window | Fires when |
|---|---|---|---|
| 1 | `session_rpe_dropped` count | 24h | count > 0 |
| 2 | malformed | 7d | **any occurrence** (count >= 1) |
| 3 | red rate | 7d | > 5%, and only above the sample floor |
| 4 | unknown rate | 7d | > 10%, and only above the sample floor |

Check 2 reads `guardrail_evaluated` where
**`props->>'unknownReason' IN ('malformed_history', 'malformed_week')`**.
Checks 3 and 4 read `props->>'state'`.

The full `unknownReason` vocabulary, read off the only function that produces
`state: 'unknown'` (`progressionGuardrail.mjs:2116`), is exactly four values:
`malformed_history` · `malformed_week` · `incomplete_week` · `unscoreable`. The field is
NULL on every non-unknown result (`guardrail-gate.mjs:168`).
⚠ **Do not confuse these with `bsBaseline`'s reasons** (`no_qualifying_weeks`,
`insufficient_weeks`, `baseline_below_floor`, `baseline_unreadable`) — those sit on the
baseline sub-result and **never reach telemetry**.

⚠ **Checks 2 and 4 overlap by construction** — every malformed evaluation is also an
unknown one. That is intended: check 2 is the specific alarm, check 4 the general one.
Check 3 (red) does not overlap either of them; red and unknown are disjoint states.

⚠ **Malformed is countable per EVALUATION, never per ROW.** The core tracks the offending
rows as `issues.malformedHistory`, but `bsTelemetryProps` does not emit `issues` at all, so
the array never reaches telemetry. The job can know *that* an evaluation went malformed, not
*how many rows* caused it. This is why check 2 is "any occurrence" and not a rate — the
denominator for a per-row rate does not exist in the data.

## Thresholds, and why two of them are not the numbers originally asked for

**Rates evaluate over a rolling 7-day window, not 24 hours, and are skipped entirely below
a floor of 20 evaluations**, reporting `insufficient_sample` instead of a number. A rate
needs a denominator, and the denominator here is currently tiny: one unknown out of one
publish is 100% and would trip every threshold in the design.

**Malformed alerts on any occurrence, ignoring the 1% figure.** Two reasons. First, 1% is
not expressible below 100 samples. Second and more important: **malformed is reserved for
shapes no legitimate writer can emit** — that rule cost the guardrail wave four review
rounds. One malformed row therefore means *our own code produced something it should not
have*, which is a code bug, not a rate to trend. Revisit the percentage when volume exists.

## ⚠ Honest pre-launch coverage

**Only two of the four checks can fire before launch.**

| Check | Pre-launch | Why |
|---|---|---|
| `session_rpe_dropped` | ✅ can fire | count-based, no denominator |
| malformed | ✅ can fire | any occurrence, no denominator |
| red rate | ⛔ `insufficient_sample` | needs 20 evaluations in 7d |
| unknown rate | ⛔ `insufficient_sample` | needs 20 evaluations in 7d |

This is correct behaviour, not a defect — a percentage over three publishes is noise, and
alerting on noise is how an alarm gets ignored. But the coverage should be honest on the
page: **until coach volume clears the floor, this job is watching two things, not four.**
The run record stores `insufficient_sample` explicitly rather than a null or a zero, so the
distinction between *"checked, and fine"* and *"could not check"* survives into the history.

## Flapping control

The job persists each run's verdicts and **alerts only on a transition into a bad state**,
plus a weekly re-alert while a bad state persists. Without this, a genuine red-rate problem
notifies every morning until fixed, and the alert trains you to ignore it.

`insufficient_sample` is **not** a state transition in either direction — crossing the floor
for the first time must not read as a new fault.

## Storage

One new table, `guardrail_health_runs`, service-role only. **Not** `analytics_events`,
for three reasons: this is operational state rather than product analytics; the
`analytics-purge` cron deletes from that table on a 12-month cutoff; and `track_event` sets
`user_id = auth.uid()`, which is **NULL** on the service-role connection this job uses.

```
guardrail_health_runs
  id           uuid primary key default gen_random_uuid()
  ran_at       timestamptz not null default now()
  verdicts     jsonb not null   -- { check_name: { status, value, sample } }
  alerted      boolean not null default false
```

Requires one migration. Revoke from `public`, `anon` **and** `authenticated` — not just
`public`, per the bug class the access-control audit closed in #1851. Pin
`search_path = public, pg_temp` on anything created.

---

## Heartbeat — who watches the watcher

Layer 2 has the same absence-needs-a-presence-signal problem it was built to solve, one
level up: **if the Vercel cron stops firing, there are no alerts and no signal that alerts
stopped.**

### The mechanism: Sentry Cron Monitors (external dead-man's switch)

The job sends `Sentry.captureCheckIn({ monitorSlug: 'guardrail-health', status })` —
`in_progress` on entry, `ok` or `error` on exit. The monitor is configured in Sentry with
the expected schedule plus a grace margin, and **Sentry raises the alarm when an expected
check-in does not arrive.**

This works because the observer is genuinely outside the system observed:

| Failure | Caught? |
|---|---|
| Vercel cron never fires | ✅ no check-in arrives, Sentry alerts |
| Job starts, crashes mid-run | ✅ `in_progress` with no terminal status |
| Job runs, a check throws | ✅ `error` status |
| Sentry itself is down | ⛔ lose both the alerts and the alarm |

⚠ **The tradeoff, stated plainly: this makes Sentry load-bearing for the alarm about a
system that is not Sentry.** Accepted, because the likely failure is a Vercel or job
failure and Sentry is external to both; a simultaneous Sentry outage is a smaller risk than
having no dead-man's switch at all. The alternative — a separate service such as
Healthchecks.io or Cronitor — removes even that shared dependency at the cost of a second
account and a second notification setup to keep alive.

### ⚠ Why the self-referential option was rejected

The second candidate was *a check inside the job that reads the previous run's record and
alerts if it is stale*. **It cannot work for the failure it is meant to catch.** If the cron
never fires, nothing runs, nothing reads the record, and nothing notices — the record simply
grows staler in silence. **A cron that never fires cannot self-report.** It would catch only
partial failure (the job fires but a check throws), which the check-in status already
covers.

The run record is still written — flapping control needs the verdict history regardless — it
just is not the heartbeat.

⚠ **The heartbeat is about the JOB running, not about the checks finding anything.** A run
where all four checks report `insufficient_sample` is a **healthy** run and sends `ok`.

---

# Layer 1 — Sentry

Blocked on an owner account. No Sentry package is installed anywhere in the repo and
`.env.example` carries no `SENTRY_*` entries.

## One organization, three projects

| Project | SDK | Covers |
|---|---|---|
| `shape-mobile` | `@sentry/capacitor` + `@sentry/react` | the `/m/` broadsheet in the native shell |
| `shape-web` | `@sentry/nextjs` | Next.js pages **and** all 156 API routes, one install |
| `shape-site` | `@sentry/browser` | the static `public/newdesign/` pages |

Three, not four: `@sentry/nextjs` covers server routes and rendered pages together, and
splitting them would break stack traces that cross the boundary.

## Release tagging

Every event carries `release` set from the git commit SHA — `VERCEL_GIT_COMMIT_SHA` on the
web side, and **the same value injected into `scripts/build-m.sh`** so a mobile error and a
web error from one deploy carry an identical release string. Without that, correlating the
two during an incident means comparing timestamps.

## User context

`id` from the Supabase session, plus **two tags rather than one**:

- `roles` — sorted, comma-joined (`"nutritionist,trainer"`), so dual-role accounts stay visible
- `is_coach` — derived boolean, for the common filter

**No email, no name.** Restricting `profiles` PII at the database in #1851 and then shipping
the same fields to a third party would be incoherent.

## Instrumentation

- The publish route.
- **All Supabase RPC callers via one wrapper** — a thin `callRpc(name, args)` reporting
  failures with the RPC name as a tag. Annotating call sites individually is where this kind
  of work rots: the next new caller silently does not get it.

## Source maps

`sourcemap: 'hidden'` on the `/m/` Vite build. Maps are generated and uploaded to Sentry;
**no `sourceMappingURL` comment ships**, so nothing is publicly reachable.

⚠ This reverses a deliberate decision. `mobile-app/vite.config.*` currently reads
`sourcemap: false` with the comment *"They embed absolute build paths ~5 MB of source to a
public URL."* Hidden maps answer that objection exactly — the concern was public exposure,
and hidden maps are not exposed.

**The website surface needs nothing.** `scripts/build-newdesign.mjs` runs JSX transform only
with **no minification**, so those stack traces are already readable.

## ⚠ Sentry alert rules — required setup, or this ships working and tells nobody

`captureMessage` **creates an issue; it does not notify anyone.** Without a routing rule,
Layer 2 runs correctly, files its findings, and no human ever learns of them.

Owner steps, in the Sentry UI:

1. **Alerts → Create Alert → Issues.**
2. Condition: **an issue is first seen**, filtered on **`alert` equals `guardrail-health`**.
3. Action: notify the owner by email (and Slack, if connected).
4. Set the environment filter to **production** so preview deploys do not page.
5. Repeat for the **cron monitor**: Alerts → Create Alert → **Cron Monitor**, on
   `guardrail-health`, condition **missed check-in** *and* **error status**.
6. ⚠ **The two rules are separate.** An issue rule does not cover a missed check-in — a
   missed check-in produces no issue, which is the entire point.

### Verification — required, not optional

**Fire a test `captureMessage` tagged `alert: guardrail-health` and confirm a notification
actually arrives in the inbox.** Filing an issue in Sentry is not evidence anyone was told.
Then deliberately skip one scheduled check-in and confirm the missed-check-in alert arrives
too — the heartbeat is worthless unverified, and its whole job is to speak up on a day when
nothing else does.

The same standard applies to Layer 1's own smoke test: throw a deliberate error on each of
the three surfaces and confirm each appears **symbolicated, not minified**, tagged with the
right release, and carrying the role tags.

---

## Registered, not built

- **`guardrail_evaluated` count = 0 over 24h** — the "whitelist broken or gate not running"
  check. Dropped for now because the event measures coach activity and would fire on any
  quiet day.
  ⚠ **Enable condition: launch, plus sustained coach publishing above the 20-evaluation
  floor.** What it would need to be correct is a *denominator* — publishes attempted versus
  evaluations recorded — which requires a second whitelisted event and therefore a migration.
  ⚠ **Until it exists, the failure mode it covers is UNCOVERED: the guardrail silently not
  running at all.** That is not hypothetical — `2026-07-29-guardrail-week-publish.sql:246`
  records that `track_event` did not accept `guardrail_evaluated` when the wave shipped, and
  the event *"would have written NOTHING and reported NO ERROR"*. It was caught by a
  pre-flight probe, not by monitoring. Nothing in this design would catch it happening again.

---

## Recorded findings — independent of this spec

Found while verifying the field names for check 2. Recorded here because **the comment is
what the next person builds against**, and both were believed true when this design was
first drafted.

### 1. The field contract has NOT drifted

Stated plainly because it was doubted mid-design: `bsTelemetryProps`
(`src/lib/guardrail-gate.mjs:139`) emits **exactly** the thirteen fields the migration
comment names, under exactly those names — `state`, `regime`, `redPath`, `axes`,
`baselineAu`, `proposedAu`, `ceilingPct`, `overridden`, `reasonCode`, `unknownReason`,
`excludedSessionRate`, `redSuppressed`, `adjustMode`. The `reasonCode` / `unknownReason`
split is a **deliberate, documented, additive** deviation from the spec's single
`reasonCode` (see the function's own header) — two disjoint vocabularies, the coach's
override code and the core's unknown reason, kept in separate columns so later aggregates
are unambiguous. **No action needed.**

### 2. The write rule in the comment IS wrong — scope: one sentence

`2026-07-29-guardrail-week-publish.sql:266` claims *publish only, one row per publish*.
Reality: **two** emission sites, and Adjust can write several rows per request.

**Scope is narrow and bounded** — it is the *when/how-often* sentence, not the field list.
The field list, the grants, the whitelist assertion and the `pg_temp` pin are all correct.
Nothing shipped is broken by it; the risk is entirely that a future reader sizes a
denominator, a rate, or a retention window against "one row per publish" and is wrong by
whatever multiple Adjust contributes.

⚠ **Recommended follow-up, NOT done here:** annotate that comment with a correction banner
in the same style as the `SUPERSEDED` banners added to the three search migrations, since
editing an applied migration's prose is the owner's call. Registered, not built.

## Owner actions

| # | Action | Blocks |
|---|---|---|
| 1 | Run the `guardrail_health_runs` migration | Layer 2 |
| 2 | Create the Sentry org + three projects; supply three DSNs and a source-map auth token | Layer 1 |
| 3 | Create both Sentry alert rules (issue + cron monitor) | alerts reaching a human |
| 4 | Verify a test notification actually arrives | the whole point |

Items 2–4 are why Layer 2 builds first: it needs only item 1, and it guards the failure
modes that matter most.

⚠ **Layer 2's heartbeat depends on Sentry**, so until item 2 lands the job runs without a
dead-man's switch. That gap is real and should not be forgotten when Layer 1 arrives — the
check-in call is part of Layer 2's route but inert until a DSN exists.
