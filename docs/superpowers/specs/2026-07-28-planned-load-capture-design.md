# Planned-load capture — design

**Date:** 2026-07-28
**Branch:** `claude/guardrails-foundation` (see *Branch* below — the name in the
instruction does not match a live branch)
**Status:** ruled, awaiting owner review of this document
**Companion:** `SPEC-guardrails.md` §3.2 / §3.2a / §3.2b / §9.2 / §13

The guardrail's proposed side needs `plannedMinutes` and `plannedRpe`. §3.2
ruled the fields and the storage (`payload` is `jsonb`, so no migration). This
document is the capture design: where a coach states them, how they cross four
hops without dying, and what the core does when they are absent.

---

## 1. What the data looks like

| Where | Key | Type | Written when |
|---|---|---|---|
| session row | `payload.plannedMinutes` | integer | the coach picks a length |
| session row | `payload.plannedRpe` | number 1–10, half-points allowed | the coach picks an effort |
| session row | `payload.loadCapture` | `'per_session' \| 'per_plan'` | the builder collected the pair |
| session row | `payload.adjustMode` | `'deload' \| 'maintain' \| 'progress'` | Adjust regenerates, beside `adjustGen` — **provenance only**; its one reader is the `guardrail_evaluated` telemetry dimension (§5.2) |
| week object | `capture` | `'per_session'` | the builder submits the week to the gate |

**Capture is PER SESSION.** A plan-level pair was proposed and rejected: it makes
share-of-week exactly `1/n` for every plan, so `share_of_week` can never cross
45% at the three sessions it needs to apply at, the hardest-session bound never
fires, and — since concentration is one of only two live axes — `redPath:
'compound'` becomes unreachable. It is also wrong in the dangerous direction: a
real 90/30/30/30 week reports as 45/45/45/45, understating the hardest session by
half and returning a safe number for a concentrated week.

⚠ **HARD RULE — never derive per-session values by dividing a plan-level figure
by session count.** Uniform distribution is an assumption, not a measurement:
the same fabrication as a mean-of-set-RPEs. No "temporarily, until the UI lands"
exception — once a flat week reaches the core it is indistinguishable from a
measured one.

---

## 2. `plannedMinutes` is an ENUM MAPPING, not a parse

**LENGTH is a structured input.** `iosAppBroadsheetPros.jsx:5444` renders it
through the same `chips()` helper as FOCUS and EQUIPMENT, over a closed list of
four: `['30 min', '45 min', '60 min', '75 min']`, state defaulting to `'45 min'`
(`:5251`). It is a picker whose values happen to be strings — not free text.

So `plannedMinutes` is produced by **mapping the chip's own value**, and the
free-text hazard does not arise at the point of capture. The rule, stated so it
survives a later writer that is less disciplined:

- Map only **exact matches** against the known chip values.
- Anything else — a range (`'45-60 minutes'`), prose, an empty string, a value
  from a different builder — is **ABSENT**. Never resolve a range by picking an
  end; a 45-vs-60 resolution is a 33% swing in that session's load, silently, in
  the direction that loosens ceilings.
- A failed mapping yields absent, **never 0**. A zero-minute session scores as
  zero load and reads as a rest day the coach never wrote.

**Telemetry:** a field counting unmapped `length` values. If it fires,
`plannedMinutes` is frequently absent and the volume axis degrades for the
proposed week — that must be known before ship rather than after.

**The web builder has no length concept at all** (`dashBuilder.jsx` carries
`loadType` for weights, nothing for duration), so it needs an explicit numeric
input rather than a mapping.

---

## 3. Production corpus — there isn't one

The owner asked for the parse success rate against existing LENGTH values, and
for the fraction of programs whose blocks are sessions rather than exercises.
**Neither is measurable, because the corpus is empty.** Read 2026-07-28:

| Table | Rows |
|---|---|
| `coach_plans` | **1** — and it carries no `length` key and no `blocks` array |
| `client_workouts` | **0** |
| `workout_sessions` | **0** |

So: 0 rows to measure a mapping against, and 0 plans whose block shape could be
classified. Any percentage quoted here would be invented.

**The structural answer instead**, from what the builder actually emits
(`iosAppBroadsheetPros.jsx:5411-5416`) — the three build types default to:

| Build type | Default outline | Blocks are |
|---|---|---|
| `workout` | `Warm-up · 8 min`, `Main lift`, … | **exercises** |
| `program` | `Mon — Upper (push)`, … 7 day lines | **sessions** (split) |
| `plan` | `Week 1 — Accumulation`, … | **sessions** (week block) |

Two of the three shapes a coach can build are per-session; one is not. That is
the honest available answer, and it is a statement about the builder rather than
about coach behaviour, which nothing yet knows.

⚠ **This must be recorded in §9.2 beside the coverage table**, per the owner: if
plain workouts turn out to dominate, concentration reports `not_evaluable` for
most weeks, the hardest-session check rarely fires, and compound red is
unreachable in practice — v1 would effectively ship with one axis. Honest, and
far better than a fabricated flat week, but it must be stated rather than
discovered from telemetry. **Because there is no history, the telemetry has to
ship WITH the feature; there is no back-fill to measure.**

---

## 4. The stamp, and the two copies of it

The stamp rides on both the week object (which the gate reads) and each row (so a
row re-read later still describes itself). That is two copies of one fact, the
same shape as `duration_seconds` vs `summary.durationSeconds`, and they are free
to drift. Ruled:

- **The week object is authoritative for evaluation.** The row stamp is
  **asserted to agree**, never read independently as a second source.
- **Disagreement in either direction is MALFORMED** — week stamped with rows
  unstamped, or rows stamped with the week unstamped. No builder emits either.
- Both directions get a fixture.

### The declaration table

| Shape | Result | Why |
|---|---|---|
| no stamp | `incomplete_week` / `unknown` (§3.2) | the coach skipped the new inputs — an honest blank |
| `per_session` + **all** sessions carry the pair | evaluate normally | the intended path |
| `per_session` + **some** carry the pair | **malformed** | no builder emits a partial week; a hop dropped the field |
| `per_session` + **none** carry the pair | **malformed** | the same defect, uniform rather than partial |
| `per_plan` + the pair present | volume scores; concentration per §5.1 | the coach stated one figure for a shape with no per-session structure |
| `per_plan` + the pair missing | **malformed** | same defect class as the stamped-but-empty row |
| stamp itself dropped in transit | `unknown`, never malformed | degrades to the safe direction |

⚠ **`per_plan` is a stamp, not the absence of one.** Without it, a plain-workout
plan — whose blocks are exercises, so it has no per-session structure to capture
— would be permanently unstamped and therefore permanently `unknown`, and the
`not_evaluable` state in §5.1 could never occur. The distinction the stamps draw
is *what the builder was able to ask*, which is not the same as what the coach
answered.

⚠ **The stamped-but-empty row is why the stamp earns its cost.** Without it, a
hop stripping the field from *every* session — the likelier bug, since transforms
apply uniformly — is indistinguishable from a coach who skipped the step. Content
inspection alone catches the partial drop and is blind to the uniform one.

**The stamp is written by the builder at the moment it collects the pair.** Never
inferred from contents, never defaulted on.

---

## 5. Core changes

### 5.1 A `not_evaluable` axis state

`bsConcentrationAxis` returns `state: 'not_evaluable'` when the week is stamped
`per_plan` **and carries two or more sessions**. `bsResolveState` excludes it
**entirely** — exactly as it already excludes a disabled axis — so it can raise
neither amber nor red, and cannot contribute to compound. The result names it, so
copy can say what was not measured.

*Why the session count matters.* At two or more sessions, a single plan-level
figure says nothing about distribution — which session is the hard one is
unknowable, so both checks on the axis are unanswerable, not just the share
check. At exactly **one** session the plan-level figure IS that session's figure,
so concentration is evaluable normally (the share check is already omitted below
`BS_SHARE_MIN_SESSIONS`, and the peak check is meaningful).

*Volume still scores in both cases, and this is not the hard rule in reverse.* A
`per_plan` week's total is `sessions × (minutes × rpe)` — a multiplication of the
coach's own claim ("every session is 45 min at RPE 7"), and a total is insensitive
to distribution. What the hard rule forbids is the opposite move: manufacturing
per-session values by dividing a plan-level total, which invents a distribution
that was never stated.

*Chosen over the alternatives:* omitting the axis makes it invisible, which is
this codebase's recurring failure; a boolean flag leaves `state: 'green'` in the
object for anyone who forgets to check the flag. A state value that is neither
green, amber nor red cannot be mistaken for a pass.

*Not the same as the disabled registry.* Disabled is a standing decision about a
measurement declared not honestly computable at all; `not_evaluable` is per-week
and data-driven. Same resolution behaviour, different meaning, and it is reported
rather than silent.

### 5.2 No Adjust bound — regenerated weeks score their captured pairs

**The bound is DELETED (2026-07-29).** `max(authored, mode ceiling)`, the
mode-ceiling constant, and the authored-exceeds-ceiling telemetry field all go.

**Every mode calls one transform, and it writes two keys.** `bsAdjustRegen`
selects a scalar (`adjustRegen.mjs:80`) and passes it to `scaleExercises` (`:136`):

```js
const scale = BS_ADJUST_SCALE[adjustment.intensity] ?? 1;   // deload .85 · maintain 1 · progress 1.025
const exercises = scaleExercises(r.payload?.exercises, scale);
```

`scaleExercises` spreads the move and overwrites **`baseL` and `load` only**, so
`sets`, `reps` and everything else survive by the spread:

```js
return { ...m, baseL: base, load: bsScaleLoad(base, scale) };
```

and `bsScaleLoad` rewrites the first number of a **free-text weight string**,
handing it back byte-identical when the scalar is 1:

```js
if (scale === 1 || !/\d/.test(s)) return s;
return s.replace(/\d+(?:\.\d+)?/, (n) => { … Number(n) * scale … });
```

| Mode | Scalar | What it writes | sRPE effect |
|---|---|---|---|
| `deload` | 0.85 | first number of each load string | **no-op** |
| `maintain` | 1 | nothing — early return | **no-op** |
| `progress` | 1.025 | first number of each load string | **no-op** |

**All three are no-ops in sRPE terms**: none changes `plannedMinutes`,
`plannedRpe`, sets, or session count. Confirmed by running all three over a row
carrying the pair — minutes, effort, sets and reps returned byte-identical.

**So a regenerated week is scored on its own captured pairs, exactly like an
authored one.** No bound, no ceiling, no derived figure.

⚠ **Not "the bound reduces to authored".** A mechanism that always returns its
input is dead code that reads as a safety feature — a later reader assumes the
regenerated week was checked against something. It is removed, not simplified.

**Reinstate only if the transform changes.** If Adjust is ever made to do what
its copy promises — add a set, push RPE toward 8 — it starts writing fields sRPE
reads and a bound becomes a live question again.

**`payload.adjustMode` is KEPT — provenance, with one reader.** The *derived
mechanism* died; the *raw fact* stays, per the store-raw-facts / derive-at-read
doctrine. Its single reader is a new **`guardrail_evaluated` telemetry
dimension** (spec §10.2): `adjustMode` on a regenerated week, **null** on a
coach-authored one, so the retune can ask whether regenerated weeks flag
differently from authored ones. ⚠ **Nothing in the core branches on it** — a
reporting dimension, never a judgment input — and if that dimension is ever
dropped the field goes with it. No field is written and never read.

### 5.3 What Adjust actually does — two premises corrected

1. **Adjust is per ROW, not plan level.** `bsAdjustRegen`'s `emit()` spreads
   `{ ...(row.payload || {}) }` (`adjustRegen.mjs:180`), so a per-session pair
   rides through per session and regenerated weeks keep an **evaluable**
   concentration axis. The owner's conditional does not trigger.
2. **Regeneration never touches minutes or RPE.** `BS_ADJUST_SCALE` is
   `{ deload: 0.85, maintain: 1, progress: 1.025 }` and `bsScaleLoad` rewrites
   the first number in a free-text load string (`"135 lb"` → `"115 lb"`).
   Duration and effort are untouched anywhere in the module, so all three modes
   are **no-ops in sRPE terms**. **What makes the highest-risk path scoreable is
   PER-SESSION CAPTURE (§3.2a), not a bound** — `emit()` spreads the row's
   payload forward, so the coach's authored pair rides through the regeneration
   intact and the regenerated week is scored on that pair directly.

⚠ **The stated ceiling lives in copy that does not describe the code.**
`intensityDesc` (`:2973`) promises deload "pull volume back ~40% and cap
intensity" and progress "add a set to main lifts and nudge top-set loads. Keep
RPE ≤ 8". The transform is a 15% load cut and a 2.5% load bump, with no set
addition and no RPE change. The `progress` ceiling is a coach-facing **promise**,
not a measured property of the transform. It is still the right number to bound
against — it is what the coach was told — but the mismatch is registered rather
than resolved silently, and it is the copy or the constants that should move.

---

## 6. Capture UI

Per-block inputs in the shared draft editor (`BSCoachDraftEditor`, `:4919`),
behind a third opt-in flag alongside `stepAuthoring` and `perDayAuthoring` —
shown only on the shapes where `planOutline.mjs` says a block **is** a session:

| Outline shape | A block is | Sessions written |
|---|---|---|
| split (`bsAssignDayLine`, ≥3 day lines) | one session | one per day line per week |
| week block (`bsAssignWeekLine`, ≥2 week lines) | one session | one per authored week |
| anything else | one **exercise** | one session per week, all blocks inside it |

The shape is read through `planOutline.mjs`, never re-derived — three surfaces
already classify through it and a fourth opinion is how they start disagreeing.

Threading, per writer:

| Writer | Threading |
|---|---|
| mobile coach app | `BSProAssignPage` writes at `:3432` split, `:3443` week block, `:3451` single |
| web builders | `dashBuilder.jsx` already posts `payload: row.payload` (`:207`); needs its own numeric length input |
| Adjust | no capture — `emit()` carries the authored pair through unchanged (§5.2) |

---

## 7. The two structural guards

A new field must cross the draft editor, `onPublish`, every receiver, and the
RPC. Dropping it anywhere kills the feature **without erroring** — the failure
mode `iosAppBroadsheetPros.jsx:5347-5351` already documents.

1. **A full-path presence test** asserting the field at the **far end**, not
   inspecting the code for it.
2. **A perturbation check**: strip the field at one hop **uniformly** and confirm
   a test fails. The uniform case is the one that must not be silently absorbed —
   it is precisely what the stamp exists to catch.

---

## 8. Fixtures

**Capture and declaration**

- unstamped, all blank → `incomplete_week` / `unknown`
- stamped, complete → evaluates
- stamped, partial → malformed
- stamped, all blank → malformed
- stamp dropped in transit → `unknown`, not malformed
- week stamped + rows unstamped → malformed
- rows stamped + week unstamped → malformed
- `per_plan` + the pair present, 1 session → concentration **evaluable**
- `per_plan` + the pair missing → malformed
- a ranged `length` (`'45-60 minutes'`) → `plannedMinutes` **absent**, not 45 or 60

**Concentration**

- a per-session week scoring concentration correctly
- a plan-level-only week scoring volume with concentration `not_evaluable`
- `not_evaluable` excluded from compound red
- a 90/30/30/30 week flagging on concentration where a flat assumption would have
  passed

**Adjust regeneration** *(the five bound fixtures are deleted with the bound)*

- a regenerated row carries `plannedMinutes` / `plannedRpe` through **unchanged**
  under all three modes, and is scored on that pair — no bound, no ceiling

---

## 9. To record in §13

**`plannedRpe` allows half-points; logged `session_rpe` must be a whole number.**
The asymmetry is deliberate and must be written down, or it will be "harmonised"
later and one side will break:

- A logged rating comes from a completion prompt that only ever emits whole
  numbers, so a fraction there can only be a defect.
- A coach authoring a week has no such constraint, and half-points are a real
  coaching convention — F45's reference athlete is planned at RPE 7.5 and must
  compute a load, not report a defect.

**Consequence, stated so it is not mistaken for a bug:** `jump_vs_history`
compares a half-point-capable proposed value against integer-only history. That
is fine mathematically — both sides reduce to AU before comparison — and the
asymmetry is in the inputs, not the check.

---

## Branch

The instruction was to land this on `claude/progression-guardrails` rather than
`claude/ai-plan-draft-contract`. Verified:

- `claude/ai-plan-draft-contract` — **8 unpushed commits, entirely
  `docs/superpowers/`** (the AI plan-draft contract design + plan). Confirmed:
  not this work, and not touched.
- `claude/progression-guardrails` — exists, but is **fully merged into
  `origin/main`** (0 commits ahead; it is PR #1847's merge commit `6b6009edd`).
  Nothing can land on it without reopening merged work.
- `claude/guardrails-foundation` — **12 commits ahead**, based on that merge
  commit. This is the live branch for the guardrail wave and where this document
  lands.
