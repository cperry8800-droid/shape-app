# Client weekly readout ("The Readout") — §C of the check-in engine wave

**Date:** 2026-08-17 · **Status:** DRAFT — build-ready except the owner questions in §9
(none block the build; each has a stated default) · **Migrations:** NONE ·
**Parent spec:** `docs/superpowers/specs/2026-08-17-checkin-engine-design.md` §C (line 95) ·
**Authoritative constraint record:** `src/lib/warroom.ts:578` ·
**Implements on:** Opus, one PR (§8)

Every `path:line` in this document was verified by reading the file in the main tree on
2026-08-17. Things that could NOT be verified from this machine are listed in §10 — read
it before trusting any claim about the LIVE database.

---

## 1. Problem

`POST /api/ai/weekly-readout` (`src/app/api/ai/weekly-readout/route.ts`) computes real
Pearson correlations over a member's `daily_health_snapshot` window, asks the model for
3–5 evidence-bound insights, and carries a deterministic fallback — and **nothing calls
it**. Its only repo reference outside its own file is the War Room route inventory
(`src/lib/warroom.ts`). The check-in engine wave (§A/§B/§D, shipped 2026-08-17) made the
daily gauges engine input, but the member still has no weekly review of their own
check-in data. §C wires the orphaned endpoint to a real surface: **"The Readout"**, a
card on the client Progress hub's Overall tab, generated at most once per member per
ISO week, cached server-side.

---

## 2. Verified current state

### 2.1 The route (`src/app/api/ai/weekly-readout/route.ts`)

- `SNAPSHOT_FIELDS` (`:23-44`): 19 metric columns + `snapshot_date`. `hydration_l` is
  already present (`:38`); `energy`, `hunger`, `sleep_quality` are **not**.
- Gating: `requireMembership(request)` at `:220`; the `/api/ai` prefix is also in the
  edge proxy's `GATED_API_PREFIXES` (`src/lib/supabase/middleware.ts:20-28`, `/api/ai`
  at `:23`), so this is a paid-member route on both layers. Body read via `readJson`
  (`:223`) with `allowEmpty: true`.
- ⚠ **`const userId = body.user_id || user.id;` (`:234`)** — the route accepts a
  caller-supplied target user. §4.4 removes this (rationale there).
- Window: `clampWindow(body.window_days, 28)` (`:69-73`, clamp 14–90); `since` is a
  UTC-derived floor (`:236`); the snapshot select (`:238-244`) applies
  `.gte('snapshot_date', since)` (`:242`) and **no ceiling** — a future-dated row
  (the registered `2099-01-01` class, `src/lib/warroom.ts:574`) enters the window.
- Model path `generateReadout` (`:146-217`): `hasOpenAIKey()` gate (`:151`), pairs with
  `n >= 7` capped at 6 (`:153`), strict JSON-schema output (`:109-131`), and insights
  filtered to valid `correlation_key`s (`:208-212`) — a model insight can never cite a
  correlation that was not computed. Deterministic fallback `fallbackReadout`
  (`:79-107`): non-weak pairs with `pValue < 0.2`, top 4.
- Response `ReadoutResponse` (`:59-67`): `source: 'openai' | 'fallback'`, correlations
  (with per-pair `series`), readout. **No cache anywhere; every POST would re-generate.**

### 2.2 The correlation module (`src/lib/correlations.ts`)

- `SnapshotPoint` (`:10-31`) — no `energy` / `hunger` / `sleep_quality` keys.
- `MetricKey` (`:33`) is derived from `SnapshotPoint`, so a pair naming a field absent
  from the type will not compile — but the reverse (a field added to the SELECT string
  and not the type) compiles fine, because `SNAPSHOT_FIELDS` is an untyped
  `.join(',')` and `.returns<SnapshotPoint[]>()` is a cast, not a check.
- `CORRELATION_PAIRS` (`:38-55`) — 10 pairs; none touches the three new fields.
- `computeCorrelations` (`:121-167`) iterates **only** `CORRELATION_PAIRS` (`:127`).
  Value gate: `typeof xVal === 'number'` (`:141`). Pearson needs ≥ 4 points (`:57-58`);
  a null r means the pair is skipped with `continue` (`:148-149`).
- Lag lookup (`:132-137`) does date+1 in UTC on the ISO string — DST-safe, unchanged.

### 2.3 The sibling consumer nobody named

`src/app/api/insights/correlations/route.ts` carries a **second, independent copy of
`SNAPSHOT_FIELDS`** (`:10-31`) and calls the same `computeCorrelations` (`:72`). It has
no UI consumer (repo grep: only `src/lib/warroom.ts:266` and `CODE-AUDIT-REPORT.md`),
but it is a live, membership-gated endpoint. Extending the pair catalog without
extending THIS field list gives that route pairs whose fields are never selected —
silently absent (§3.1 explains why silent). This is the adjacent-sibling the
"miss is next to the fix" rule predicts; it is **in scope for the same PR**.

### 2.4 The storage substrate

`user_goals` (`supabase-migrations/2026-04-20-user-goals.sql`): PK `(user_id, kind)`
(`:15`), RLS owner-only select/insert/update (`:20-37`), **no DELETE policy** (only the
cycle wave added a kind-scoped one for `cycle_settings`). So the caller-RLS client the
route already builds (`createClient()` at `:227`) can read and conditionally write the
member's own `weekly_readout` row — no migration, no admin client.

### 2.5 The UI anchor

`BSClientProgress` (`mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:29111`)
renders the Overall tab with `BSWeekendsCard` (`:29214`, defined `:28841`) and
`BSCrossoverCard` (`:29215`, defined `:28911`). The instrument-plate primitive is
`BSPlate` (`mobile-app/src/broadsheet/iosAppBroadsheet.jsx:1256`, window-exposed).
Native-safe API calls go through `apiBaseUrl` + Bearer in
`mobile-app/src/services/shapeBackend.js` (`apiBaseUrl` at `:55`) — a root-relative
fetch never reaches the backend on a native build (the meal-note lesson,
`docs/WORKLOG.md` 2026-08-14 entry).

---

## 3. Non-negotiable constraints, each with its evidence

### 3.1 The field/pair coupling — one PR, and why the failure is silent

`SNAPSHOT_FIELDS` (both routes), `SnapshotPoint`, and `CORRELATION_PAIRS` must be
extended **in the same PR**. The mechanism, from the code:

- `computeCorrelations` reads **only** what `CORRELATION_PAIRS` names
  (`src/lib/correlations.ts:127`). A field that is selected but appears in no pair is
  never read — no error, no log, no empty-state marker. The readout simply never
  mentions it, and both the model evidence (built from the computed correlations,
  route `:156-165`) and the deterministic fallback (filtered from the same list,
  `:80`) omit it identically.
- The reverse direction is equally silent: a pair whose field is missing from a
  route's `SNAPSHOT_FIELDS` gets `undefined` on every row, fails the
  `typeof === 'number'` gate (`correlations.ts:141`), accumulates zero points, and
  `pearson` returns null below 4 points (`:57-58`) → `continue` (`:149`). The pair
  vanishes from the results with zero signal.
- TypeScript does not catch either direction: the SELECT string is untyped, and
  `.returns<SnapshotPoint[]>()` is a cast.

Both failure directions produce a green build, a green suite, and a readout that looks
finished. That is the definition of the silent-omission failure mode the warroom entry
(`src/lib/warroom.ts:578`) forbids. §7 adds a structural test that makes both
directions fail the build.

### 3.2 Cost bound is server-side, atomic, per member

One model call per member per ISO week, enforced **in the route** under an atomic
per-member claim (§4.3). Never in the UI: the client renders whatever the route
returns; a UI-side cache is a nicety, never the bound (parent spec §C, `:109-116`).
The parent spec offers "per-user advisory lock **or** a conditional claim-then-generate
write" — §4.3 shows the advisory lock cannot work here and mandates the conditional
write.

### 3.3 The weekly cache

`user_goals('weekly_readout')`, shaped `{ week, payload }` plus claim-machinery keys
(§4.3). Week key derivation in §4.2, with the prior art cited.

### 3.4 Honest-absent

`Number(null)` and `Number('')` are both finite `0`. This repo has shipped that exact
fabrication twice: the cycle engine coerced eight missing-sleep rows into a
"significant" 7.6-hour gap from data that does not exist (`docs/WORKLOG.md:1098`, full
entry `:5967`), and the food search nearly shipped a `value: null` nutrient as a
0-kcal row (`docs/WORKLOG.md:8624`). In §C: `computeCorrelations`'s
`typeof xVal === 'number'` gate (`correlations.ts:141`) is the chokepoint and must not
be weakened; a metric with no data appears in **no pair, no insight, no register** —
never a fabricated 0, never a dash standing in for a reading. §10 flags the one
runtime-type risk (PostgREST `numeric` serialization) that must be verified live.

### 3.5 The `.slice(-7)` class

A tail of an array is "the last N observations", not "the last N days"
(`docs/WORKLOG.md:212`, `:1905`). `sleepRecoveryFromProgress`
(`mobile-app/src/services/signalsMap.mjs:118-126`) still carries the defect —
`vals.slice(-7)` at `:123` over an unfiltered series — registered, not fixed
(`src/lib/warroom.ts:575`). **§C must not depend on it and does not**: the readout is
computed server-side from `daily_health_snapshot` rows fetched with an explicit
calendar window; it never reads the engine record, `signalsMap.mjs`, or any
`series.*` tail. Every window in this spec is a real calendar window with an explicit
floor **and** ceiling (§4.4). The fixed sibling, `vitalsFromProgress`
(`signalsMap.mjs:142-183`, calendar cutoff `:155-157`, date-proven filter `:161`), is
the pattern §C's route window follows, not the code it calls.

### 3.6 MEASURED vs ENTERED

Only device-measured data may claim a sync; only member-entered data may be called a
check-in (`docs/WORKLOG.md:1990`, the §B presence-model rule). For §C this binds the
**pair catalog copy** and the **card copy**: `energy`, `hunger`, `sleep_quality` are
member-entered 1–10 gauges (`supabase-migrations/2026-06-25-daily-energy-hunger.sql:6-7`,
`2026-06-26-sleep-quality.sql:6`) and every new pair label/explanation must name them
as ratings ("your 1–10 energy rating"), never as measurements; device metrics
(`recovery_score`, `hrv_ms` — WHOOP/Oura) keep their measured register (the existing
label at `correlations.ts:46` already says "WHOOP recovery score"). The card never
renders a "synced" claim over an entered gauge.

### 3.7 i18n — both files or it ships ungated

New keys ×13 locales (`de en es fr ha id it pcm pt-BR ru tr uk vi` — the extant
catalog directories), registered in BOTH:

- the runtime NS array — `mobile-app/src/i18n/index.js:12` (consumed at `:39`); and
- the catalog-parity test's NS list — `tests/i18n-catalog-complete.test.mjs:10`.

Registering in only one ships ungated: catalogs load via `import.meta.glob`
(`index.js:16`) whether or not the namespace is served, and the parity test iterates
only its own NS list, so an unregistered namespace is invisible to the gate.

---

## 4. Design

### 4.1 Extend the catalog and the field lists together

One commit touches all four surfaces:

1. **`src/lib/correlations.ts` `SnapshotPoint`** gains
   `energy?: number | null; hunger?: number | null; sleep_quality?: number | null;`.
2. **`CORRELATION_PAIRS`** gains pairs covering all three fields. Proposed catalog
   (exact r-direction/lag wording is implementer-tunable; the binding constraints are:
   every new field in ≥ 1 pair, and the ENTERED register of §3.6 in every label):

   | x | y | lag | label sketch |
   | --- | --- | --- | --- |
   | `sleep_hours` | `energy` | 1 | Sleep → next-day energy rating |
   | `workout_minutes` | `energy` | 1 | Training volume → next-day energy rating |
   | `protein_g` | `hunger` | 1 | Protein → next-day hunger rating |
   | `calories` | `hunger` | 0 | Calories ↔ same-day hunger rating |
   | `sleep_quality` | `recovery_score` | 0 | Rested rating ↔ measured recovery |
   | `sleep_hours` | `sleep_quality` | 0 | Hours slept ↔ rested rating |

   This covers the parent spec's named pairs (energy↔sleep, energy↔workout_minutes,
   hunger↔protein/kcal, sleep_quality↔recovery, parent `:97-105`).
3. **Both `SNAPSHOT_FIELDS` strings** gain `energy`, `hunger`, `sleep_quality`:
   `src/app/api/ai/weekly-readout/route.ts:23-44` **and**
   `src/app/api/insights/correlations/route.ts:10-31` (§2.3).
4. The columns exist in the migrations and are recorded APPLIED
   (`2026-06-25-daily-energy-hunger.sql:6-7`, `2026-06-26-sleep-quality.sql:6-15`;
   `mood/stress/soreness` since `2026-05-09-daily-health-snapshot.sql:44-46`) — but
   this repo has documented live schema drift, so the implementer verifies the live
   catalog before merge (§10.1).

**Known-unpaired legacy fields** (verified against `CORRELATION_PAIRS:38-55`):
`hrv_ms`, `resting_hr`, `workout_volume_lb`, `avg_heart_rate`, `fat_g`,
`body_fat_pct`, `mood` are selected today and appear in no pair. That is
pre-existing, not this PR's job to fix — but §7's coupling test freezes this set as
an explicit allowlist so any FUTURE field addition without a pair fails the build
instead of silently repeating this wave's bug.

### 4.2 The week key — derivation, timezone, prior art

**`week = weekMondayOf(clientLocalDay(body.date))`** — a `YYYY-MM-DD` Monday.

- **Which timezone decides the boundary: the member's device-local calendar day.**
  The house doctrine is written at `src/lib/local-day.ts:1-14`: *"the client sends its
  local date (YYYY-MM-DD); the server uses it verbatim"*, UTC fallback for date-less
  callers. `clientLocalDay` (`local-day.ts:17-20`) validates the shape;
  `weekMondayOf` (`local-day.ts:27-32`) derives Monday with noon-UTC-anchored
  arithmetic that cannot slip a day/DST boundary.
- **Prior art, already shipping:** the weekly check-in is keyed exactly this way —
  `src/app/api/client/checkin-kit/route.ts:15` imports both helpers and `:23` returns
  `weekMondayOf(localDay)` as the one-row-per-user-per-week key. Client-side, the
  member-local day is `_localDate()`
  (`mobile-app/src/services/shapeBackend.js:6929-6932`), which is also how
  `snapshot_date` itself is written — so the readout's week boundary agrees with the
  data's own day-bucketing.
- The card's fetch helper sends `date: _localDate()` in the POST body. A body with no
  usable date degrades to the server's UTC day (`clientLocalDay`'s documented
  fallback) — wrong by at most one day near midnight, never fabricated.
- **Monotonic ratchet:** the claim (§4.3) admits only a **strictly newer** week
  (`newWeek > storedWeek`, lexicographic on `YYYY-MM-DD`, which is chronologic). A
  member with two devices in different timezones near a week boundary can therefore
  cost at most ONE early regeneration — the trailing device reads the newer stored
  payload instead of reclaiming backwards, so the pair cannot ping-pong generations.

### 4.3 The cache + the atomic claim

#### Document shape — `user_goals` row `(user_id, kind='weekly_readout')`

```jsonc
{
  "week": "2026-08-17",          // weekMondayOf — the parent spec's `week`
  "status": "pending" | "ready" | "error",
  "claimedAt": "2026-08-19T14:02:11.000Z",  // stamped on every claim win
  "attempts": 1,                  // model attempts spent on this week
  "payload": { /* full ReadoutResponse */ } | null   // the parent spec's `payload`
}
```

`week` + `payload` are the parent-spec contract (`checkin-engine-design.md:110`);
`status`/`claimedAt`/`attempts` are the claim machinery riding in the same doc.

#### Why NOT the advisory lock

The route reaches Postgres through PostgREST on pooled connections; every statement is
its own transaction. A `pg_advisory_xact_lock` (the house pattern —
`supabase-migrations/2026-07-19-cycle-events.sql:196` and 15 siblings) releases at
that statement's commit, and the model call happens in Node **between** statements.
The repo has already paid for this lesson: *"A lock cannot span the two round trips on
a pooled connection"* (`docs/WORKLOG.md:4510`, the week-publish precondition). Of the
parent spec's two options, only the **conditional claim-then-generate write** works.
Precedents for exactly this shape: the guarded-claim RPC
`claim_ai_action_undo` (`supabase-migrations/2026-07-10-ai-audit-undo-claim.sql` —
a guarded UPDATE that reports whether it won, with an explicit release on a failed
follow-through) and the rev-conditioned CAS write `casWriteUserGoals`
(`src/lib/ai/server.ts:85` — rowcount-checked conditional update on `user_goals`
itself, caller-RLS). No migration is needed: each claim step below is ONE guarded
statement, atomic under Postgres row locking, executed on the route's existing
caller-RLS client.

#### The algorithm (route-side, in order)

1. **Read** the row. If `data.week === week && data.status === 'ready'` → return the
   cached `payload` (HTTP 200, `cached: true`). If same week and `pending` with
   `now − claimedAt < STALE_CLAIM_MS` (recommend **3 min** — comfortably above any
   model-call timeout) → HTTP 202 `{ status: 'pending', week }`.
2. **Claim** (each sub-step is one atomic statement; first success wins):
   - Row absent → `insert(..., { ignoreDuplicates })` of a pending doc; a returned row
     = claim won; a duplicate = lost, go to 4.
   - Row present → conditional `UPDATE ... SET data = <pending, attempts carried>`
     with a filter admitting exactly: `data->>'week' < week` (the ratchet, §4.2), OR
     same-week `status = 'error'`, OR same-week stale `pending`
     (`claimedAt < now − STALE_CLAIM_MS`). Check the returned rowcount: 1 = won,
     0 = lost. (PostgREST `.or(...)` filter over `data->>` fields; each branch is
     expressible without casts — `attempts` is enforced at write time in step 3, not
     in the filter, so no jsonb-int casting is needed.)
3. **Generate** (winner only): fetch the window (§4.4), `computeCorrelations`,
   `generateReadout`. Then ONE terminal write (plain update — the winner owns the
   claim):
   - Model succeeded, **or** `hasOpenAIKey()` is false (fallback IS the product —
     no cost was possible) → `status: 'ready'`, `payload` = the full response,
     week closed.
   - Model was attempted and failed (`!result.ok`, empty text, parse failure, all
     insights filtered) → serve the fallback to THIS caller **uncached** and write
     `status: 'error'`, `attempts + 1` — UNLESS `attempts + 1 >= MAX_ATTEMPTS`
     (recommend **3**), in which case cache the fallback as `'ready'` and close the
     week.
4. **Claim lost** → re-read once: `ready` → 200 with the payload; else → 202 pending.

#### The two questions the task requires answered

- **Concurrent double-open:** both tabs POST; the guarded write serializes them —
  exactly one generates, the loser gets 202 and polls (§4.5). At most one model call.
  No wait-on-server (serverless timeout), no client-side gate pretending to be one.
- **Failed generation after a claim — released, or week burned? Recommendation:
  released, with a hard per-week attempt cap of 3.** Justification: (a) a transient
  model outage must not pin a member to the deterministic fallback for up to seven
  days — that punishes the member for infrastructure; (b) an uncapped release turns a
  sustained outage into one model *attempt* per open, which leaks cost — so the claim
  doc counts attempts and the third failure caches the fallback and closes the week,
  bounding the worst week at 3 attempts (~pennies) while the success bound stays
  exactly one completed model generation per member per week; (c) a **crashed**
  generation (claim written, terminal write never reached) is released by the
  stale-pending timeout, so no member can ever be stuck on "pending" forever. The
  strict one-ATTEMPT reading of the bound is a one-constant change
  (`MAX_ATTEMPTS = 1`, which converts "failed call" into "week burned") — flagged in
  §9.2 for the owner, default 3.

The claim/transition rules live in a **pure module** `src/lib/weekly-readout.mjs`
(node-testable, imported by the TS route — the `call-rpc.mjs` / `guardrail-health.mjs`
pattern): `weekKeyOf(dateStr)`, `readoutDecision(storedDoc, week, now)` →
`'serve' | 'pending' | 'claim'` (+ which claim branch), and
`terminalWrite(prevDoc, outcome)` → the next doc. The route stays thin I/O.

### 4.4 Route changes (`src/app/api/ai/weekly-readout/route.ts`)

1. **Pin the subject to the caller: drop the `body.user_id` passthrough (`:234`).**
   This is a correctness necessity once the cache exists, not just hygiene: the cache
   row is written under the CALLER's RLS (`user_goals` insert/update policies pin
   `user_id = auth.uid()`, `2026-04-20-user-goals.sql:26-37`), so a coach POSTing a
   client's `user_id` would compute the client's data but claim/cache under the
   COACH's own row — corrupting the coach's own weekly claim and never caching for
   the client. Nothing consumes the passthrough today (the route has zero callers),
   so nothing is lost. A coach-facing readout, if ever wanted, is its own surface
   with its own keying (§9.4).
2. **Add the ceiling.** The snapshot select keeps `.gte('snapshot_date', since)` and
   gains `.lte('snapshot_date', ceiling)` where `ceiling` = the member-local day
   **+ 1** derived from the same client-sent `date` (§4.2). Tomorrow, not today,
   for the documented reason: `snapshot_date` is the member's LOCAL day, so a member
   ahead of UTC legitimately has a row the server clock hasn't reached
   (`src/lib/warroom.ts:574`). This makes §C's window a real calendar window with an
   explicit floor AND ceiling (§3.5) and keeps the registered future-date residual
   (member path floor-only, `vitalsFromProgress`) from gaining a new victim — §C
   never becomes a consumer of the `2099-01-01` row.
   The floor stays derived from `window_days` (default 28, clamp 14–90 unchanged) but
   is computed off the member-local day rather than `Date.now()` UTC, so floor and
   ceiling share one clock.
3. **Body contract:** `{ date?: 'YYYY-MM-DD', window_days?: number }`. (`user_id`
   is ignored if sent; do not 400 on it — old callers don't exist, but tolerance is
   free.)
4. **Response contract:**
   - 200 `{ status: 'ready', cached: boolean, week, ...ReadoutResponse }`
   - 202 `{ status: 'pending', week }`
   - existing 401/402/500 paths unchanged.
   The cached payload is the full `ReadoutResponse` as generated (correlations with
   series included), so the card renders identically from cache and a future
   evidence-chart needs no server change. Size note: ~tens of KB per member per
   week in one jsonb row — within the `user_goals` blob pattern (the notify snapshot
   precedent); no cap needed v1.
5. Everything else — `requireMembership`, `readJson`, `computeCorrelations`, the
   model prompt, schema, key-filtering, fallback — ships as built.

### 4.5 The card — "The Readout" (client Progress hub, Overall tab)

- **Placement:** `BSClientProgress` Overall tab, rendered directly **above**
  `BSWeekendsCard` (`iosAppBroadsheetClient.jsx:29214`) — the readout is the tab's
  synthesis piece and leads the two narrower reads. Instrument-plate grammar via
  `window.BSPlate` (`iosAppBroadsheet.jsx:1256`), teal accent, mono
  `THE READOUT · WEEK OF {date}` eyebrow, serif head.
- **Fetch:** a new `window.ShapeReadout.get({ date })` in `shapeBackend.js` — POST to
  `${apiBaseUrl}/api/ai/weekly-readout` with the Bearer/cookie pattern every other
  authenticated call uses (`apiBaseUrl` at `shapeBackend.js:55`); never a bare
  root-relative fetch (native builds — the meal-note asymmetry lesson). Body carries
  `date: _localDate()`.
- **Trigger:** on card mount (i.e. opening Progress → Overall), signed-in only. The
  route serves the cache for repeat opens; the card MAY additionally memoize the
  ready payload in module state for the session — a nicety, never the bound (§3.2).
- **States, all honest:**
  - `ready` → summary line + 3–5 insights (headline · detail · recommendation), each
    carrying its evidence meta line from the bound correlation
    (`label · r=… · n days`). **v1 renders no chart** — the `evidence_chart` field
    and series ride in the payload for a later pass (registered §6). A
    `source: 'fallback'` readout renders identically with a quiet
    `DETERMINISTIC · FROM YOUR OWN DATA` marker instead of the model marker — it is
    a real readout, not an error.
  - Empty fallback (`insights: []`, the not-enough-signal summary at route `:82-86`)
    → the summary line renders as the card body; no fabricated insight rows.
  - `pending` (202) → a quiet "Assembling this week's readout…" line; the card
    re-polls with backoff (recommend 2s · 5s · 10s, then stop with a "check back
    shortly" line). Polling re-hits the route, which serves cache/pending cheaply.
  - Route error / network → one quiet unavailable line. Never a retry storm, never
    a fabricated readout.
  - **Signed out → the card does not render at all.** No demo readout: a fabricated
    AI analysis is exactly the honesty violation this repo documents; the labeled
    demo option is parked as an owner question (§9.3). A signed-in non-member gets
    402 from `requireMembership` → the card renders nothing (absence, not an error
    state — the tab must not nag about membership; the paywall owns that).
- **Hook hygiene:** the card adds hooks/effects to a 29k-line module — the
  render-check rule applies (TDZ/hook-order crashes pass every static gate). §7
  mandates a mount test through the real harness.

### 4.6 i18n

- New namespace **`readout`**, following the `cycle`/`cook` feature-namespace
  precedent: append `'readout'` to `mobile-app/src/i18n/index.js:12` AND
  `tests/i18n-catalog-complete.test.mjs:10`, and author
  `mobile-app/src/i18n/catalogs/<loc>/readout.json` for all 13 locales
  (LLM-translated, flagged for the standing human review — house pattern).
- Keys (indicative): `card.eyebrow`, `card.title`, `card.weekOf`, `state.pending`,
  `state.checkBack`, `state.unavailable`, `state.noSignal`, `meta.model`,
  `meta.deterministic`, `meta.evidence` (ICU: `{r}`, `{n}`), `a11y.*`. Flat dotted
  keys, ICU single-brace, Turkish never gluing case suffixes onto `{placeholders}`.
- ⚠ **The generated prose is English-only in v1.** The model output and the
  route-composed fallback strings (`route.ts:79-107`) are English; only the card
  CHROME localizes. Stated on the record rather than silently shipped; the fix
  (locale-aware fallback templates + prompting the model in the member's locale) is
  an owner call (§9.1).

---

## 5. Opted-out members and the known residuals

- **A member who opted out of the daily check-in (`client_settings.dailyCheckin`
  off):** §C reads **stored** `daily_health_snapshot` rows, never the pref and never
  the engine record. Verified mechanism: the opt-out writes a per-uid mirror and
  dispatches `shape:checkinPref` and nothing else (`bsDailyCheckinApply`,
  `iosAppBroadsheetClient.jsx:21139-21141`). So an opted-out member's readout (a) still
  runs — device-synced metrics keep producing pairs; (b) may legitimately reference
  entered gauges from inside the window that were logged **while opted in** — the same
  doctrine as the coach roster flags ("the flag is about data the member really logged
  while opted in", parent spec §3D `:139-145`); entered-gauge pairs then age out of
  the window naturally as no new rows arrive; (c) is never special-cased — absence of
  new data is expressed as pairs failing their n-floors, not as an "opted out" label.
- **§C touches `notify_snapshot` in NO direction.** The registered residual — the
  opt-out does not rewrite the persisted snapshot, and the hourly cron reads those
  rows without consulting the pref (verified: `src/app/api/ai/notify/cron/route.ts:49-53`
  reads `user_goals` kind `notify_snapshot`; the file contains no reference to
  `dailyCheckin`; recorded at `docs/WORKLOG.md:1899` and `src/lib/warroom.ts:573`) —
  is neither fixed nor widened by this work. The readout must not write anything into
  the notify snapshot and must not be added to the cron.
- **The future-date ceiling residual** (coach-only chokepoint; member path
  `vitalsFromProgress` floor-only — `src/lib/warroom.ts:574`) stays open for its
  registered consumers; §C simply refuses to become a new one via §4.4.2's route
  ceiling.
- **`sleepRecoveryFromProgress`'s `.slice(-7)`** (`signalsMap.mjs:123`) stays
  registered-not-fixed; §C has no dependency on it (§3.5).

---

## 6. What deliberately does NOT change

- `computeCorrelations`'s math, thresholds, and the model prompt/schema/key-filter.
- The `/api/insights/correlations` route beyond its `SNAPSHOT_FIELDS` copy (§4.1.3).
- The engine (`signalsMap.mjs` / `dashSignals.js`), the notify pipeline, the coach
  Case File, and every §A/§B/§D surface.
- No migration, no new route, no cron. (A weekly pre-generation cron is the parked
  alternative — parent spec §7.5; unchanged here.)
- Evidence charts (scatter/line per insight): deferred; payload already carries what
  they need. Register in the War Room on merge.
- The website Progress dashboard: mobile-first, per the parent spec's single named
  entry point (`checkin-engine-design.md:106-108`). Web parity is a registered
  follow-up, not silent scope.

---

## 7. Tests & gates

1. **`tests/correlation-coupling.test.mjs`** — the structural guard for §3.1, a
   source-text test (the house pattern where TS can't be imported by `node --test`;
   use `tests/helpers/strip-comments.mjs` first — it exists and has bitten before):
   - every `x:`/`y:` key in `CORRELATION_PAIRS` appears in BOTH routes'
     `SNAPSHOT_FIELDS` strings AND in `SnapshotPoint` (kills pair-without-field,
     forever, in both consumers);
   - `energy`, `hunger`, `sleep_quality` each appear in ≥ 1 pair (kills THIS wave's
     field-without-pair);
   - the legacy-unpaired allowlist is frozen to exactly
     `hrv_ms, resting_hr, workout_volume_lb, avg_heart_rate, fat_g, body_fat_pct,
     mood` — a new selected field outside the allowlist with no pair fails the build.
   Mutation-test the test: drop one new field from one route's SELECT → must fail;
   drop a pair → must fail; restore → green.
2. **`tests/weekly-readout.test.mjs`** — pure-module vectors over
   `src/lib/weekly-readout.mjs`: same week + ready = serve; new week = claim;
   stale pending = claim; fresh pending = pending; error + attempts<3 = claim;
   3rd failure = fallback cached, week closed; **older-week claim refused** (the
   ratchet); no-key generation closes the week; week key = Monday for all seven
   weekdays incl. Sunday, and a malformed date degrades to UTC-today (the
   `clientLocalDay` contract). This satisfies the parent spec's named test ("same
   week = cache hit, new week = regenerate", `checkin-engine-design.md:180`).
3. **Mount test** through `tests/broadsheet-render.test.mjs` (the harness mounts AND
   drives): the Overall tab mounts with the card in loading/ready/pending/absent
   states (stub `window.ShapeReadout`), signed-out renders no card. Render-check
   rule: this is the class parse/tsc/suite/build all miss.
4. **Standard gates:** JSX parse · `tsc --noEmit` · full `npm test` (re-run, never
   carry a suite count forward) · PowerShell `VITE_BASE=/m/` build · every touched
   file LF with zero NUL bytes (verify with `tr -cd '\r' | wc -c`, not `grep -c`) ·
   catalog parity ×13 green **after** proving it fails while a locale file is
   missing (the gate-has-teeth check).
5. **Live verifications before merge** (§10 lists why): the three columns exist in
   the production catalog; one real authenticated POST returns pairs for an
   entered-gauge field (proves the PostgREST numeric/smallint serialization question
   either way).

---

## 8. Build order — ONE PR

The §3.1 coupling makes a split actively harmful; everything lands in one PR
(parent build order: "PR C — weekly readout wiring + i18n"). Internal commit order:

1. `correlations.ts` (type + pairs) + both routes' `SNAPSHOT_FIELDS` +
   `tests/correlation-coupling.test.mjs`.
2. `src/lib/weekly-readout.mjs` (+ `.d.ts`) + `tests/weekly-readout.test.mjs` (TDD).
3. Route: cache/claim wiring, subject pinning, ceiling, response contract.
4. `shapeBackend.js` `window.ShapeReadout` + the card in
   `iosAppBroadsheetClient.jsx` + mount test.
5. i18n: NS registration ×2 files + 13 catalogs.
6. War Room: flip `src/lib/warroom.ts:578` §C to done IN THIS PR (records = minimal
   diff, status flip only) + register the deferred items (charts, web parity,
   prose localization).

Merge gate: CI green + Codex clean on the final head; batch review fixes into one
push (review-quota economy). Pre-push self-review against this repo's documented bug
classes: TDZ/hook order, `Number(null)`, CRLF, stale `?v=` assumptions (none apply —
no newdesign file is touched), and the sibling-consumer sweep (§2.3 already done —
re-grep `computeCorrelations` consumers before push).

---

## 9. Open questions — OWNER rulings (none block the build; defaults stated)

1. **Generated-prose language.** v1 ships model + fallback prose in English while
   the chrome localizes ×13 (§4.6). Accept for launch, or require locale-aware
   generation before §C ships? **Default: ship English prose, register the follow-up.**
2. **`MAX_ATTEMPTS`.** Recommended 3 (bounded retry on model failure, §4.3); the
   strict one-attempt reading of "one model call per member per ISO week" is
   `MAX_ATTEMPTS = 1` and burns the week on a single transient failure.
   **Default: 3.**
3. **Signed-out presentation.** v1 renders no card in the signed-out demo (§4.5); a
   clearly-labeled static example card is possible if the preview experience wants
   it. **Default: absent.**
4. **Coach access.** Pinning the subject to the caller (§4.4.1) removes the
   never-used `body.user_id` capability. A coach-facing readout, if wanted, is its
   own surface (own cache keying, own entry point, likely the Case File).
   **Default: member-only.**
5. **Cadence** (already parked in the parent spec §7.5): on-demand-on-first-open
   (this spec) vs a weekly pre-generation cron. **Default: on-demand.**

---

## 10. What I could NOT verify (honesty section)

1. **The live database.** No live-catalog access from this session. The `energy` /
   `hunger` / `sleep_quality` / `mood` / `stress` / `soreness` columns are verified
   in migrations (§4.1.4) and recorded APPLIED in the WORKLOG, but this repo has
   twice documented that migrations ≠ production ("read the LIVE catalog, never the
   file"). Implementer: confirm the columns before merge; the route has zero callers
   today, so a missing column would surface as a 400 on FIRST real use — after ship.
2. **PostgREST serialization of `numeric` columns.** Most existing pair fields are
   `numeric(…)` (`2026-05-09-daily-health-snapshot.sql:20-46`); `computeCorrelations`
   accepts only `typeof === 'number'` (`correlations.ts:141`). The variance-band
   entry (`docs/WORKLOG.md`, 2026-07-20 build 2/9) measured numerics arriving as
   STRINGS from an RPC; a plain table select may serialize as JSON numbers instead —
   and because this route has never been called, neither behavior has ever been
   observed here. If strings arrive, every numeric pair is silently dead TODAY (the
   safe direction — absence, not fabrication — but silently absent). One live POST
   (§7.5) settles it; if strings, add a strict finite normalizer at the row boundary
   (null for null/`''` — never `Number(null)`), inside the same PR.
3. **Whether the Progress hub's existing chrome is localized.** The i18n rollout's
   surface list never names the Progress hub; the new card's keys are self-contained
   either way (§4.6), but surrounding English chrome may sit beside a localized card.
   Not §C's scope; noted so nobody reads the card as the anomaly.
4. **Model-call billing on failed attempts** (whether a `!result.ok` response bills
   tokens) — treated as "assume it costs" in §4.3's cap design.
5. **The `providers_read_subscriber_snapshots` policy** (parent spec §2 cites it) —
   not re-verified live; irrelevant once §4.4.1 pins the subject to the caller.
