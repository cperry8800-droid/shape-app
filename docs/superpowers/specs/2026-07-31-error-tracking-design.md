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
  `malformed_week` (`progressionGuardrail.mjs:2152`, `:2165`, `:2183`). A check matching
  only the first silently misses every malformed proposed week.
  ⚠ **Do not re-type either value in a consumer.** The core now exports the vocabulary —
  `BS_UNKNOWN_REASONS` (`progressionGuardrail.mjs:2464`) and its `BS_MALFORMED_REASONS`
  subset (`:2481`) — so the monitor imports it and a rename breaks a test instead of making
  the malformed check read 0 forever.
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
| 1 | `session_rpe_dropped` count | 25h | count > 0 |
| 2 | malformed | 7d | **any occurrence** (count >= 1) |
| 3 | red rate | 7d | > 5%, and only above the sample floor |
| 4 | unknown rate | 7d | > 10%, and only above the sample floor |

Check 2 reads `guardrail_evaluated` where
**`props->>'unknownReason' IN ('malformed_history', 'malformed_week')`**.
Checks 3 and 4 read `props->>'state'`.

The full `unknownReason` vocabulary is exactly four values: `malformed_history` ·
`malformed_week` · `incomplete_week` · `unscoreable`. They come from the only function that
produces `state: 'unknown'` — the `unknown()` helper at `progressionGuardrail.mjs:2131` —
and are now exported as **`BS_UNKNOWN_REASONS`** (`:2464`), derived from `BS_UNKNOWN_DETAIL`
so the export cannot drift from the copy. The field is NULL on every non-unknown result
(`guardrail-gate.mjs:168`).
⚠ **Do not confuse these with `bsBaseline`'s reasons** (`no_qualifying_weeks`,
`insufficient_weeks`, `baseline_below_floor`, `baseline_unreadable`, and its own separate
`malformed_history` at `:1058`/`:1061`) — those sit on the baseline sub-result and **never
reach telemetry**; only the top-level `result.reason` does.

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
  verdicts     jsonb not null   -- { check_name: { status, value, sample, alertedAt } }
  alerted      boolean not null default false
```

⚠ **`alertedAt` is part of the verdict, not decoration.** It is the timestamp of the last
notification for that check, and the flapping control below reads it back off the previous
run to decide between silence and the weekly re-alert. Persisting a verdict without it
would make every run a fresh transition.

⚠ **`insufficient_sample` carries the stamp forward; only `ok` clears it.** A check that
alerts, drops below the floor for a day, and comes back is *one* open episode — so the
stamp survives the gap. Dropping it there makes a continuing fault re-announce itself as a
new one every time the sample happens to dip, which is the flapping this control exists to
prevent. `ok` clearing the stamp is what lets a genuine recovery-then-relapse notify again.

The verdicts blob also carries a `_read` entry — `{ evaluations, matched, truncated }` —
recording whether the 7-day read saw every matching row. A capped read must never be
indistinguishable from a complete one in the history: with `truncated: true` the rates are
still a valid sample of the newest rows, but `malformed` reporting `ok/0` means "none in
what we saw", not "none". The underscore keeps it out of the check namespace.

Requires one migration. Revoke from `public`, `anon` **and** `authenticated` — not just
`public`, per the bug class the access-control audit closed in #1851.
⚠ **And from `service_role`, which is the role that class is easiest to miss on.** Supabase
default-grants `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` to
`service_role` on every new `public` table (verified against production), so a revoke naming
only the first three leaves `service_role` holding TRUNCATE on an audit trail and makes the
follow-up `grant select, insert` a no-op. Revoke from `service_role` first, then grant back
the two verbs the cron uses, and have the migration's guard assert the **absence** of
TRUNCATE, DELETE and UPDATE — asserting only that SELECT and INSERT exist passes unchanged
over exactly the hole it is meant to catch. Pin `search_path = public, pg_temp` on anything
created.

## The 7-day read

⚠ **Order it, bound it, and make truncation detectable.** PostgREST applies its "Max rows"
setting (default 1000) whether or not a query asks for a limit, and with no `ORDER BY` the
scan over `analytics_events_event_ts_idx (event, ts)` returns **ts-ascending** — so the rows
silently dropped are the **newest**. Adjust writes one row per evaluated week inside a `map`,
so roughly 83 twelve-week regenerations in 7 days reaches 1000. A malformed row from
yesterday then vanishes, `malformed` reports `ok/0`, and a check with no floor and
any-occurrence semantics never fires again.

⚠ **A naive `rows.length === LIMIT` truncation test does not work.** Request a limit *above*
the server's cap and the response is capped instead, so the length never equals the limit and
the check silently reports a complete read. Use an exact count (`count: 'exact'` returns the
true total from Content-Range regardless of any page cap) and compare against what was
actually fetched, paging with `range()` at a page size at or below the plausible cap.

`service_role` carries `statement_timeout = 8s`, so the read needs a hard ceiling as well as
an order.

---

## Heartbeat — who watches the watcher

Layer 2 has the same absence-needs-a-presence-signal problem it was built to solve, one
level up: **if the Vercel cron stops firing, there are no alerts and no signal that alerts
stopped.**

### The mechanism: a provider-agnostic ping to an external dead-man's switch

On a **completed** run the job sends a plain `GET` to whatever URL `HEARTBEAT_PING_URL`
holds. The service on the other end is configured with the expected schedule plus a grace
margin, and **it raises the alarm when an expected ping does not arrive.**

⚠ **Deliberately NOT `Sentry.captureCheckIn`.** Sentry Cron Monitors, Healthchecks.io and
Cronitor **all accept exactly this plain ping**, so nothing is foreclosed — pointing
`HEARTBEAT_PING_URL` at a Sentry monitor URL later is an env-var change, not a code change.
What it buys is that **the heartbeat is not blocked on choosing a provider, and not blocked
on an account that does not exist.** Layer 2 ships before Sentry exists anywhere in this
repo; a check-in call written against an SDK that is not installed would be dead code
pretending to be a dead-man's switch. The route therefore imports nothing from Sentry.

This works because the observer is genuinely outside the system observed:

| Failure | Caught? |
|---|---|
| Vercel cron never fires | ✅ no ping arrives, the monitor alerts |
| Job starts, crashes mid-run | ✅ the ping is the LAST thing a run does |
| Job runs, a check throws | ✅ the catch path returns without pinging |
| The monitoring service is down | ⛔ lose the alarm |

⚠ **`HEARTBEAT_PING_URL` is currently unset, so every run reports `heartbeat: 'skipped'`
and there is no dead-man's switch yet.** That is the honest state, and it is a one-line env
change to close rather than an integration.

⚠ **Two statuses, not three.** A plain GET carries no `in_progress`/`ok`/`error` vocabulary,
so the signal is binary: pinged, or did not. That is enough for the failure this exists to
catch — a run that threw takes the catch path and never reaches the ping, so a crashed run
is indistinguishable from a cron that never fired, and **both are alarms**. Distinguishing
them is what the logs and the run record are for.

⚠ **A HEARTBEAT IS ABOUT THE JOB RUNNING, NOT ABOUT THE CHECKS FINDING NOTHING.** A run
where all four checks report `insufficient_sample` is a **healthy** run and must still ping.
Only an actual failure to complete withholds it.

### ⚠ Why the self-referential option was rejected

The second candidate was *a check inside the job that reads the previous run's record and
alerts if it is stale*. **It cannot work for the failure it is meant to catch.** If the cron
never fires, nothing runs, nothing reads the record, and nothing notices — the record simply
grows staler in silence. **A cron that never fires cannot self-report.** It would catch only
partial failure (the job fires but a check throws), which withholding the ping already
covers.

The run record is still written — flapping control needs the verdict history regardless — it
just is not the heartbeat.

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

⚠ **This section is about Layer 1's delivery of Layer 2's findings, and it is not what makes
the heartbeat work.** The heartbeat is a plain ping to `HEARTBEAT_PING_URL` and is
independent of everything below — see *Heartbeat*. The two are set up separately and either
can land first.

Owner steps, in the Sentry UI:

1. **Alerts → Create Alert → Issues.**
2. Condition: **an issue is first seen**, filtered on **`alert` equals `guardrail-health`**.
3. Action: notify the owner by email (and Slack, if connected).
4. Set the environment filter to **production** so preview deploys do not page.

### The heartbeat's own alarm — separate, and not Sentry-dependent

Configure the schedule + grace margin on whichever service `HEARTBEAT_PING_URL` points at.
If that is a **Sentry Cron Monitor**, its URL is the ping target and the missed-check-in
rule is configured on the monitor; if it is Healthchecks.io or Cronitor, the alarm is
configured there instead and Sentry is not involved at all.

⚠ **This alarm and the issue rule above are separate, whichever provider is chosen.** An
issue rule does not cover a missed ping — a missed ping produces no issue, which is the
entire point.

### Verification — required, not optional

**Fire a test `captureMessage` tagged `alert: guardrail-health` and confirm a notification
actually arrives in the inbox.** Filing an issue in Sentry is not evidence anyone was told.
Then deliberately skip one scheduled ping and confirm the missed-heartbeat alert arrives too
— the heartbeat is worthless unverified, and its whole job is to speak up on a day when
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
| 2 | Set `HEARTBEAT_PING_URL` to a dead-man's-switch endpoint, and configure its schedule + grace margin | Layer 2's heartbeat |
| 3 | Create the Sentry org + three projects; supply three DSNs and a source-map auth token | Layer 1 |
| 4 | Create the Sentry issue alert rule (`alert` = `guardrail-health`) | findings reaching a human |
| 5 | Verify a test notification arrives, and that a skipped ping raises the missed-heartbeat alarm | the whole point |

Items 3–5 are why Layer 2 builds first: it needs only items 1 and 2, and it guards the
failure modes that matter most.

⚠ **Item 2 does NOT depend on item 3.** The heartbeat is a provider-agnostic HTTP ping, so
it can be closed today with any of Sentry Cron Monitors, Healthchecks.io or Cronitor —
picking Sentry later costs an env-var change, not a code change. **Until `HEARTBEAT_PING_URL`
is set the job runs with no dead-man's switch and every run reports `heartbeat: 'skipped'`.**
That gap is real and is the cheapest one on this list to close.

⚠ **Alerts currently reach Vercel logs and no further.** `reportAlerts()` in the route is the
single seam item 4 replaces; until then the job evaluates correctly and notifies nobody.
