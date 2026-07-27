# Deploy 2a — the pure core: fixture table

**For review before implementation.** Nothing here is built yet.

Scope is `public/newdesign/progressionGuardrail.mjs` and its tests, and nothing
else: no RPC, no kill switch, no publish gate, no builder call sites, no UI.

**Parity is structural, not a checklist item.** Owner requirement: the app and
the website behave identically. That is why the core is ONE module in
`public/newdesign/` — the web builders load it as a native ES module, mobile
imports the same file by relative path (the `varianceBand.mjs` precedent), Node
tests import it directly, and `bsGuardrailCopy` is the single source of every
word. Two surfaces cannot disagree because there is only one implementation and
one set of strings. Server-side, both surfaces POST to the same publish route,
so enforcement is identical by construction.

The fixtures below therefore test parity once, at the module. There is no
per-surface fixture and there should not be — a second copy of these rules is
exactly what this structure exists to prevent.

---

## 0. A contract change I need ruled on first

`SPEC-guardrails.md §4.1` currently hands the core **pre-aggregated weeks**:

```
history.weeks = [{ weekStart, loadAu, sessions, measured }]
```

The two items just carried in cannot live there. "Exclude an unconfirmed
overrun" and "treat `session_rpe = 0` as absent" are **load-derivation** rules —
they decide what a week's `loadAu` even is. If weeks arrive pre-summed, both
rules execute in SQL, which is the one place they are not fixture-testable, and
2a would ship unable to test its own two newest requirements.

**Proposed: the core takes raw sessions and derives the weeks itself.**

```
history = {
  todayISO: 'YYYY-MM-DD',
  sessions: [{
    dateISO:           'YYYY-MM-DD',   // client-local date; the caller resolves the timezone
    durationSec:       number,
    sessionRpe:        number | null,  // null AND 0 both mean ABSENT
    durationConfirmed: boolean         // the member confirmed or typed the minutes
  }]
}

proposedWeek = {
  weekStartISO: 'YYYY-MM-DD',
  sessions: [{ id, plannedMinutes, plannedRpe }]
}
```

The RPC in 2b then returns rows and makes no judgement — which is what
`get_roster_weekly_adherence` already does, and it moves *more* logic into the
testable module rather than less.

**Cost, stated plainly:** the core now does date bucketing, so it owns
Monday-start week maths. `todayISO` and `dateISO` stay inputs, so it remains
pure and deterministic — no clock is ever read.

Everything below assumes this contract. **If you'd rather keep pre-aggregated
weeks, say so and I'll rewrite the table — the two new rules then move to 2b and
become untestable in isolation.**

---

## 1. Derived quantities (the vocabulary the table uses)

| Term | Definition |
|---|---|
| **eligible** session | `durationSec > 0` **and** not an inferred overrun |
| **inferred overrun** | `durationSec > 150 min` **and** `durationConfirmed === false` |
| **rated** session | eligible **and** `sessionRpe` passes the ordered rating rule below |
| **the rating rule** | Applied in this order: **(1)** `null` or exactly **0** → *absent*, not rated. **(2)** not an **integer** → *malformed*. **(3)** an integer outside **[1, 10]** → *malformed*. **(4)** otherwise → *rated*. So `0.5`, `7.5`, `10.5`, `11` and `-2` are all malformed; `0` is absent. **Storable ≠ producible:** `numeric(3,1)` holds one decimal across the whole range, so a fraction anywhere in it is exactly as impossible from a whole-number prompt as `0.5` is, and treating them differently would be worse than either reading alone. ⚠ **Step 2 is the one line to reverse** if half-point RPE (6.5 / 7.5 / 8.5 — a real strength-training convention) is added to the prompt later; the column type is deliberately kept wide enough for it and must **not** be narrowed |
| **session AU** | `sessionRpe × (durationSec / 60)`, rated sessions only |
| **week loadAu** | sum of session AU over that week's rated sessions |
| **measured week** | `rated > eligible / 2` — strictly more than half; exactly half fails |
| **baseline** | median of qualifying measured weeks; needs **3** |
| **gap** | consecutive days with no session over **100 AU** |

Notation below: `S(min, rpe)` is a session; `S(min, rpe, C)` is duration-confirmed.

### Marker convention — ⚠ BOUNDARY-SENSITIVE

A row tagged **⚠ BOUNDARY-SENSITIVE (margin N%)** sits within ~5% of the
threshold that decides its state. **The thresholds are scheduled for a retune
after 4–6 weeks of telemetry** (`SPEC-guardrails.md §13`, "Retuning the
thresholds"), and when that happens these rows flip state *correctly* — the
failure is the retune working, not a regression. The tag exists so that failure
is never read as an unexplained bug.

Two things the tag deliberately does **not** cover:

- **Explicit boundary tests** — F24, F30–F34, F53, F55, F71, F108, F114, F117.
  These assert a threshold's exact edge (`over`, not `at`); being retune-coupled
  is their entire purpose and each already says so in its own row.
- **The 5–7% band**, which is close but outside the convention: F47 (5.9% over
  the cold-start weekly red), F79 and F80 (both 5.9% under their two-session and
  three-session red caps), F45 (6.3% under the six-session amber cap), F49 (7.1%
  over the peak amber bound). Named here so a retune reader can check them
  without re-deriving every margin.

---

## 2. Interpolation utility — `bsInterpolateAnchors`

| # | Input | Expected |
|---|---|---|
| F1 | ramp @ 500 | 40% |
| F2 | ramp @ 1500 | 22% |
| F3 | ramp @ 3000 | 13% |
| F4 | ramp @ 5000 | 9% |
| F5 | ramp @ 1000 (midpoint) | 31% |
| F6 | ramp @ 2250 (midpoint) | 17.5% |
| F7 | ramp @ 4000 (midpoint) | 11% |
| F8 | ramp @ 400 (below first anchor) | 40% — clamped, never extrapolated |
| F9 | ramp @ 6000 (above last) | 9% — clamped |
| F10 | ramp @ 600 · 1680 · 3375 (the reference athletes) | 38.2% · ~20.92% · 12.25% |
| F11 | red @ 500 / 1500 / 3000 / 5000 | 75 / 45 / 30 / 22% |
| F12 | red @ 1000 / 2250 / 4000 | 60 / 37.5 / 26% |
| F13 | return @ 14 / 28 / 56 days | 70 / 55 / 40% |
| F14 | return @ 21 / 42 days | 62.5 / 47.5% |
| F15 | anchors given out of order | same result as sorted — order must not matter |
| F16 | non-finite input (`NaN`, `null`, `'x'`) | returns null; never throws |

---

## 3. Load derivation — the two newly carried rules live here

| # | Scenario | Input | Expected |
|---|---|---|---|
| F17 | ordinary session | `S(60, 7)` | 420 AU |
| F18 | zero duration | `S(0, 7)` | **not eligible** — excluded, never 0 AU |
| F19 | unrated | `S(60, null)` | eligible but **not rated** — contributes no AU |
| F20 | **RPE 0 is ABSENT, not zero effort** | `S(60, 0)` | **not rated** — contributes no AU. It must NOT compute 0 × 60 = 0 AU, which would enter the sum as a real week and deflate the baseline |
| F21 | RPE 0 does not count toward the measured share | 4 sessions, 3 rated 1–10, 1 at RPE 0 | eligible 4, rated 3 → measured |
| F22 | **inferred overrun excluded** | `S(175, 7)` unconfirmed | **not eligible** — the wall-clock timer's word alone is not a measurement |
| F23 | **confirmed overrun included** | `S(175, 7, C)` | 1225 AU — the member asserted it, so it counts |
| F24 | boundary, exactly at the ceiling | `S(150, 7)` unconfirmed | eligible → 1050 AU. Strictly greater than 150 excludes |
| F25 | boundary, one minute over | `S(151, 7)` unconfirmed | not eligible |
| F26 | confirmation is irrelevant below the ceiling | `S(60, 7)` unconfirmed vs confirmed | identical, 420 AU both |
| F27 | an inferred overrun is not "unrated" | 2 sessions: `S(175, 7)` unconfirmed + `S(60, 7)` | eligible 1, rated 1 → measured; loadAu 420 |
| F28 | negative / non-finite duration | `S(-30, 7)`, `S(NaN, 7)` | **malformed, not absent** — see §12 rule C. Reported, never silently dropped |
| F29 | RPE out of range | `S(60, 11)`, `S(60, -2)` | **malformed, not absent** — see §12 rule C. Never clamped, never dropped |
| F130 | **a fraction below the scale** | `S(60, 0.5)` | **malformed.** `numeric(3,1)` accepts it; a whole-number 1–10 prompt cannot produce it, so it can only come from a client-side defect |
| F131 | **a fraction INSIDE the scale — the same defect class** | `S(60, 7.5)` | **malformed.** Exactly as impossible from the prompt as F130. Ruling a mid-range fraction *valid* while a sub-1 fraction is *malformed* would be worse than either reading alone — it would compute a load from a value we know the app never wrote |
| F132 | **a fraction that is also out of range** | `S(60, 10.5)` | **malformed** — caught by the integer test (step 2) before the range test (step 3). Same outcome either way; the order keeps the reported reason honest |
| F133 | **a valid rating arriving as a STRING** | `S(60, '7.0')` | **rated · 420 AU.** `session_rpe` is `numeric`, and PostgREST returns `numeric` as **text** to preserve precision — so a stored `7` crosses the wire as `"7.0"`. **Parse before the integer test** or every valid rating in production reads as malformed. `''`, `true` and `Symbol()` must NOT coerce (they are `0`, `1` and a *throw* respectively under naive `Number()`) — all three are malformed |

---

## 4. Week qualification and baseline

| # | Scenario | Expected |
|---|---|---|
| F30 | 4 eligible, 3 rated | measured |
| F31 | **4 eligible, exactly 2 rated** | **NOT measured** — the boundary is strict |
| F32 | 3 eligible, 2 rated | measured |
| F33 | 2 eligible, 1 rated | NOT measured (1 is not more than 1) |
| F34 | 1 eligible, 1 rated | measured |
| F35 | 2 measured weeks only | regime `cold_start` — 3 are required |
| F36 | 3 measured weeks: 1500 / 2000 / 2500 | baseline **2000** (median) |
| F37 | 3 measured weeks: 400 / 2000 / 2200 | baseline **2000** — one abnormally light week must not drag it down |
| F38 | 3 measured weeks: 2000 / 2100 / 6000 | baseline **2100** — nor may one huge week inflate it |
| F39 | 4 measured weeks: 1000 / 2000 / 2400 / 3000 | baseline **2200** (mean of the middle pair) |
| F40 | a week inside a detected gap | does not qualify; excluded from the median |
| F41 | weeks supplied out of order | identical result — ordering must not matter |
| F42 | two sessions on the same date | both count; a date is not a key |

---

## 5. Cold-start regime (caps scale with proposed session count)

Weekly amber `sessions × 600`, red `sessions × 850`. Peak amber 700, red 1000.

| # | Proposed week | Caps | Expected |
|---|---|---|---|
| F43 | beginner 3 × `S(40, 5)` = 600 AU | 1800 / 2550 | green |
| F44 | intermediate 4 × `S(60, 7)` = 1680 AU | 2400 / 3400 | **green** — the case the original 900/1400 caps made red |
| F45 | advanced 6 × `S(75, 7.5)` = 3375 AU | 3600 / 5100 | **green** |
| F46 | 3 × 700 AU = 2100 | 1800 / 2550 | amber — an over-prescribed unknown client |
| F47 | 4 × `S(90, 10)` = 3600 | 2400 / 3400 | red (curve) |
| F48 | the same 1680 AU compressed into 2 sessions — **an even 840 / 840 split** | 1200 / 1700 | **amber.** Volume is amber (1680 > 1200) and concentration is *also* amber (840 > the 700 peak bound) — but with **2 sessions the compound path is suppressed** by the sub-3-session rule (F79), so two amber axes resolve to amber rather than compounding to red. ⚠ BOUNDARY-SENSITIVE (margin 1.2%) — 1680 is 20 AU under the 1700 two-session red cap. **The split must be stated:** an uneven 1100 / 580 would put the hardest session over the 1000 peak red bound and turn the whole row red |
| F49 | peak bound alone | 3 sessions, 200 + 200 + 750 = 1150 | volume green (cap 1800), **concentration amber** — **both** concentration checks fire: the peak bound (750 > 700) *and* `share_of_week` (750/1150 = 65.2% > 45%). Same axis, so still one amber (F74) |
| F50 | peak red alone | 1 × `S(120, 9)` = 1080 | red — the weekly cap of 850 is also exceeded, but the peak bound is what names it |
| F51 | flags are labelled | any cold-start flag | copy says **"no baseline yet"**, never "estimated" |

---

## 6. Measured regime — baseline 2000, ramp 19%, red 40%

| # | Proposed | Expected |
|---|---|---|
| F52 | 2300 AU | green (ceiling 2380). ⚠ BOUNDARY-SENSITIVE (margin 3.4%) — a ramp-anchor retune that lowers the ceiling below 2300 turns this amber |
| F53 | 2380 AU exactly | green — the boundary is *over*, not *at* |
| F54 | 2500 AU | amber. ⚠ BOUNDARY-SENSITIVE (margin 5.0%) — sits exactly at the convention's edge, 120 AU over the 2380 amber ceiling; a ramp-anchor retune that raises the ceiling turns this green |
| F55 | 2800 AU exactly | amber — red is *over* 2800 |
| F56 | 3000 AU | red, `redPath: 'curve'` |
| F57 | 1200 AU (a deliberate deload) | green — the guardrail never flags going down |

---

## 7. Return regime — baseline 2000

| # | Scenario | Expected |
|---|---|---|
| F58 | last qualifying session 13 days ago | no return rule; ordinary ramp |
| F59 | 14 days | return cap 70% → 1400 |
| F60 | 28 days | return cap 55% → 1100; ramp then 29.2% → amber over 1421 |
| F61 | 56 days | return cap 40% → 800 |
| F62 | 70 days | 40% — clamped, still `return` |
| F63 | **84 days** | regime becomes **`cold_start`** — baseline stale. NOT floored at 40% |
| F64 | a 60 AU session mid-gap | does **not** reset the gap (under the 100 AU floor) |
| F65 | a 140 AU session mid-gap | **does** reset it |
| F66 | week after the return week | re-ramps from the reduced baseline by ordinary rules |
| F67 | gap ends mid-week | the week containing the gap's end is the return week |
| F68 | return copy | says **"no sessions logged in N days"**, never "you took N days off" |

---

## 8. Concentration axis

| # | Scenario | Expected |
|---|---|---|
| F69 | **2 sessions at 50/50** | `share_of_week` **does not apply** — a balanced twice-weekly week must never flag |
| F70 | 3 sessions at 50/30/20 | share applies; 50% > 45% → amber |
| F71 | 3 sessions at 45/30/25 | share exactly 45% → green (the rule is *over*) |
| F72 | `jump_vs_history` fires, share clean | 4 balanced sessions, hardest well above `hardest_logged × (1 + ramp)` → concentration amber |
| F73 | share fires, jump clean | concentration amber |
| F74 | **both fire together** | **ONE axis**, not two — must not satisfy compound red |
| F75 | no measured hardest session | falls back to the cold-start absolute peak bound |

---

## 9. State resolution

| # | Scenario | Expected |
|---|---|---|
| F76 | nothing over any ceiling | green |
| F77 | one axis amber | amber |
| F78 | one axis over the red curve | red, `redPath: 'curve'` |
| F79 | **cold start, 2 × 800 AU** — weekly 1600 (amber, cap 1200/1700), hardest 800 (amber, 700/1000) | **amber** — compound suppressed below 3 sessions |
| F80 | **the same at 3 × 800 AU** — weekly 2400 (amber, 1800/2550), hardest 800 (amber) | **red, `redPath: 'compound'`** |
| F81 | **2 sessions, 1100 + 200** — weekly 1300 (amber), hardest 1100 (**red**) | **red, `redPath: 'curve'`** — suppression touches the compound path only |
| F82 | return-week cap + volume ramp both implicated | **ONE axis** (volume) — the cap modifies the axis, it is not a second one |
| F83 | red payload completeness | names `redPath` and lists every contributing axis |
| F84 | `distribution` axis | present in the registry, **disabled**, never contributes to compound in v1 |

---

## 10. Honest absence and malformed input

| # | Scenario | Expected |
|---|---|---|
| F85 | proposed session missing `plannedRpe` | `state: 'unknown'`, `reason: 'incomplete_week'`, names the session |
| F86 | proposed session missing `plannedMinutes` | same |
| F87 | proposed week with zero sessions | `unknown` / `incomplete_week` — **not green**, no flag raised, and no `NaN` or division anywhere in the result (every cold-start cap is `sessions × k`, which is 0 at zero sessions, so a naive path would flag everything) |
| F88 | `history` null / not an array / garbage rows | `unknown`; never throws |
| F89 | `proposedWeek` null | `unknown`; never throws |
| F90 | determinism | the same inputs return a deeply-equal result across repeated calls |
| F91 | purity | no `Date.now`, no `Math.random`, no I/O — `todayISO` is the only "now" |
| F92 | input is not mutated | `history` and `proposedWeek` are deep-equal to their originals afterward |

---

## 11. Copy — `bsGuardrailCopy`

| # | Scenario | Expected |
|---|---|---|
| F93 | cold start | contains "no baseline yet" |
| F94 | return | contains "no sessions logged in N days" |
| F95 | red via curve | "exceeds the red threshold for this baseline" |
| F96 | red via compound | "multiple limits reached at once" **plus the axis names** |
| F97 | green | returns null — nothing to say |
| F98 | rounding | display rounds here only; every comparison upstream stays unrounded |

---

---

## 12. Rulings added on review — Gaps A and B, and the eight requested rows

### Rule A — the trailing window, defined

Neither "last N calendar weeks" nor "last N qualifying weeks" alone is right:
the first starves a sparse logger, the second reaches back indefinitely into
stale data. The window is therefore **bounded on both axes**:

> **The baseline is the median of the most recent qualifying weeks — at most 4,
> at least 3 — found by searching back at most 12 calendar weeks (84 days) from
> `todayISO`. Fewer than 3 qualifying weeks within that reach → `cold_start`.**

- **At most 4** because a training block is four weeks (the repo's own
  `starterTemplates` cutback lands every 4th week). One block of memory adapts
  at the rate training actually changes, and it keeps F39's 4-week median
  meaningful.
- **At least 3** — unchanged from the spec.
- **12 weeks of reach** deliberately equals the 84-day stale-baseline horizon.
  **One staleness concept, expressed once.** Two different horizons is how they
  come to disagree.

**Interaction with the 84-day rule, stated explicitly.** They are independent
tests measuring different things — the window bounds *how old a qualifying week
may be*, the gap rule measures *how long since any real session*. Both must
pass. Where they disagree — old qualifying weeks still inside reach, but a gap
of 84+ days — **the stale rule wins and routes to `cold_start`**, because a
baseline you cannot trust is worse than no baseline at all. Consequently the
return anchors top out at 56 days (F61–F62); the ≥84-day case is a regime
handoff, never a fifth return fraction.

### Rule B — a baseline below the curve's own domain

Two separate assertions, kept separate on purpose.

**B1 — a baseline of exactly 0 is unreachable by construction**: a week is
measured only when `rated > eligible / 2`, which forces `rated ≥ 1`, and a rated
session has RPE 1–10 over a positive duration, so its AU is positive. That is
exactly the class of reasoning that turns out to be wrong, and the failure is
severe — every ceiling becomes 0, every week goes red, the ratio divides by zero.
`baseline <= 0` is therefore asserted independently and routes to `cold_start`.

**B2 — the floor is 500 AU, the ramp curve's own lowest anchor.**

> **`baseline < 500 AU` → `cold_start`, reason `baseline_below_floor`. No
> percentage is ever computed against it.**

An earlier draft put this at 100 AU, which caught the degenerate 0.02 AU case and
left a real one open: **percentages of a tiny baseline are meaningless.** A
client at 200 AU who adds a second session reaches 400 AU — a 100% increase.
The ramp curve clamps to 40% below its first anchor and the red curve to 75%, so
that week resolves **red** for ordinary beginner progression. The guardrail would
have been at its loudest for the people least able to interpret it.

500 is not a new number: below its lowest anchor the curve is outside its own
domain, so applying it there is extrapolation dressed as measurement. Same
principle as the staleness horizon — **one threshold, expressed once.** Under 500
AU the absolute session-count caps of §6.1 govern, which is what they were
recalibrated to do.

### Rule C — malformed input is reported, never coerced

Absent and malformed are different. `sessionRpe: null` is **absent** — honest,
expected, handled by exclusion. `sessionRpe: 11`, `durationSec: -30` or a
missing `dateISO` are **malformed** — a caller bug. Silently dropping them lets
a client-side defect quietly produce a wrong baseline forever.

> **Malformed history rows return `state: 'unknown'`, `reason:
> 'malformed_history'`, naming the offending rows. Never clamped, never dropped,
> and — per the `varianceBand` precedent — never thrown.**

### The rows

| # | Scenario | Expected |
|---|---|---|
| F99 | **sparse qualifying** — weeks 1/3/5 qualify, 2/4 do not | window takes the 3 qualifying weeks, reaching back 5 calendar weeks. Baseline is their median; the non-qualifying weeks are not zeros in the set |
| F100 | **window hits its reach limit** — only 2 qualifying weeks within 12 calendar weeks, a 3rd at week 14 | `cold_start`. The week-14 data is out of reach and must NOT be pulled in to make three |
| F101 | **stale rule beats the window** — 3 qualifying weeks inside reach, but no qualifying session for 90 days | `cold_start`, not `measured` and not `return` |
| F102 | **more qualifying weeks than the cap** — 7 qualifying weeks in reach | uses the **most recent 4**; weeks 5–7 do not enter the median |
| F103 | **sub-floor baseline** — 4 qualifying weeks, each ~0.02 AU from sub-minute sessions | `cold_start`, `reason: 'baseline_below_floor'`. No ratio computed, no `Infinity`, no `NaN` |
| F104 | **baseline exactly 0** | same route as F103. Asserted even though unreachable by construction — the guard is the point |
| F105 | **single-session week** — 1 × `S(60, 8)` | share-of-week is 100% by arithmetic and **must not flag** (below the 3-session floor). Only the peak bound applies |
| F106 | **history but zero qualifying weeks** — sessions logged, none forming a qualifying week | `cold_start`, `reason: 'no_qualifying_weeks'` |
| F107 | **no history at all** — `sessions: []` | `cold_start`, `reason: 'no_history'`. Distinct from F106: same regime, different reason, because one is "not enough logged" and the other is "logged but unusable" |
| F108 | **exactly 3 qualifying weeks** | `measured` — the handoff boundary, paired with F35's 2 weeks → `cold_start` |
| F109 | **deload then return to normal — a TWO-week deload.** 2 weeks at 2000, then 2 deload weeks at 1200, then a proposed 2000. (The deload's *length* is load-bearing and an earlier draft left it unstated — see F129) | **amber.** The window is the most recent 4 qualifying weeks `[1200, 1200, 2000, 2000]` → median = the mean of the middle pair = **baseline 1600**. Ramp at 1600 = 21.4% → amber over **1942.4**; red at 1600 = 44.0% → red over 2304. Proposed 2000 clears the first, not the second. **Intended**, and the direct consequence of F57 never flagging the decrease that caused it. The most likely real-world false positive; a coach dismisses one amber |
| F129 | **the same pattern with a THREE-week deload.** 1 week at 2000, then 3 deload weeks at 1200, then a proposed 2000. (Numbered out of sequence deliberately — it belongs beside F109, and renumbering F110–F128 would invalidate every existing reference) | **red.** Window `[1200, 1200, 1200, 2000]` → **baseline 1200**. Ramp at 1200 = 27.4% → amber over 1528.8; red at 1200 = 54.0% → **red over 1848**. Proposed 2000 clears both. **This is NOT a defect** — it is the F57 deload property, now quantified: a longer deload pulls the median further down, so the same return-to-normal week escalates from amber to red. ⚠ It is also **publish-blocking for a legitimate coaching pattern** (planned deload → return to normal). Recorded in `SPEC-guardrails.md §13.7`; deload-aware baselines are explicitly out of scope for v1 pending telemetry |
| F110 | malformed — `durationSec: -30` | `unknown` / `malformed_history`, names the row |
| F111 | malformed — `sessionRpe: 11` | `unknown` / `malformed_history` |
| F112 | malformed — missing `dateISO` | `unknown` / `malformed_history` |
| F113 | **baseline 499 AU** | `cold_start`, `reason: 'baseline_below_floor'` — the absolute session-count caps govern |
| F114 | **baseline 500 AU exactly** | `measured` — the floor is *below*, not *at or below*, matching the curve's own first anchor |
| F115 | **the beginner who adds a second session** — baseline 200 AU, proposed 400 AU across 2 sessions | **NOT red.** Under the old 100 AU floor this was a 100% increase against a curve clamped to 40%/75% and resolved red. It now routes to the absolute caps (2 × 600 = 1200 amber) and is **green** |
| F116 | `baseline <= 0` | `cold_start` — asserted separately from F113, per rule B1 |
| F117 | **return band is FLAT between anchors and beyond the last** — 56 / 70 / 83 days | 40% at all three. Same clamp convention as the ramp curve below 500 AU; the band is defined, not undefined (F62 covers 70 days; these pin the whole band) |
| F118 | **`unknown` is not a flag state** | a malformed or incomplete result carries `state: 'unknown'` and **no axes, no ceilings, no red path** — it must be impossible to read it as green *or* as a flag |

### Rule D — what `unknown` does downstream

`unknown` means *we could not measure this*, which is not a finding about the
training. It is also never the coach's fault: malformed history comes from a
logging defect, not from the week they just authored.

> **`unknown` must NOT block publish.** It is not a red, and a coach cannot be
> gated on data quality they did not cause.
>
> **It must be visible to the coach** — stated plainly as "this week could not be
> checked", with the reason, never dressed as a pass.
>
> **It must be recorded in telemetry** with its `reason`, so malformed history
> gets noticed and fixed instead of sitting silent behind a UI that looks fine.

The middle requirement is the load-bearing one. Silently rendering nothing would
be indistinguishable from green, and a coach would reasonably infer the week had
been checked and passed.

Fixture split, because the core cannot test I/O:
- **2a (here):** F118 — the core returns `unknown` with a reason and **no** axes,
  ceilings or red path.
- **2b:** publish succeeds with `state: 'unknown'` and no acknowledgment; a
  `guardrail_evaluated` row is written carrying `state: 'unknown'` and its
  `reason`; the builder shows the could-not-check line.

### Rule E — timezone, and where the conversion belongs ⚠ NEEDS YOUR RULING

**These fixtures do not exist yet, and the current §0 contract cannot host them.**

§0 defines `dateISO` as *already client-local*, with the caller resolving the
zone. Under that contract every timezone scenario executes in SQL — the one place
it is not fixture-testable. That is exactly the objection that moved load
derivation into the core, and I applied it inconsistently.

**Proposed:** the core takes the instant and the zone, and does the conversion.

```
sessions: [{
  startedAtISO: '2026-07-26T23:40:00Z',   // the instant, as stored
  timezone:     'America/New_York',        // IANA, from shape_user_tz
  durationSec, sessionRpe, durationConfirmed
}]
```

`dateISO` is then derived, not supplied, and every scenario below becomes a 2a
fixture. The core stays pure — an instant and a zone are inputs, no clock is
read. The cost is that it now depends on `Intl.DateTimeFormat` for zone maths,
which is available in Node, the browser and the Vite build alike.

| # | Scenario | Expected |
|---|---|---|
| F119 | **Sunday late evening, negative UTC offset** — `2026-08-03T02:40:00Z` in `America/New_York` (EDT, UTC−4 → local **Sun 2026-08-02 22:40**) | buckets to the week starting **Mon 2026-07-27** — the local week it was actually trained in |
| F120 | **the same instant read as UTC** — `2026-08-03T02:40:00Z` is **Mon 2026-08-03** in UTC | buckets to the week starting **Mon 2026-08-03** — the next week. F119 and F120 must differ, which is the whole point. ⚠ The instant must straddle the local Monday boundary: an earlier draft used `2026-08-02T23:40:00Z`, which is Sunday in **both** readings, so the pair could not diverge and F120 would have failed against a correct implementation |
| F121 | **local Monday 00:00 exactly** — `2026-08-03T04:00:00Z` in `America/New_York` | starts the week of **2026-08-03**, not the tail of the previous one |
| F122 | **local Sunday 23:59** | last day of the *previous* Monday-start week |
| F123 | **a week spanning a DST transition** — US spring-forward, 2026-03-08 | the week still contains exactly 7 local days; no session is lost or double-counted, and the 23-hour day does not shift a boundary |
| F124 | **positive UTC offset** — `2026-08-03T21:00:00Z` in `Asia/Tokyo` (local Tue 06:00 the 4th) | buckets to the week starting **2026-08-03**; the date advances rather than retreats |
| F125 | **unknown or invalid zone** | `unknown` / `malformed_history` — never silently bucketed in UTC, matching `shape_user_tz` returning NULL rather than guessing |
| F126 | **DST fall-back, the 25-hour week** — US 2026-11-01, where local 01:30 occurs **twice** | the ambiguous local time resolves **deterministically** (the same input always yields the same bucket), and the week still contains exactly 7 local days. Neither repeated hour creates an eighth day nor drops one |
| F127 | **half-hour offset** — `Asia/Kolkata` (+05:30), instant `2026-08-02T18:45:00Z` → local **Mon 2026-08-03 00:15** | week of **2026-08-03**. ⚠ The instant must fall in the open interval `(18:30Z, 19:00Z)` or the fixture tests nothing: an earlier draft used `19:00:00Z`, which is Mon 08-03 at **both** +05:30 (00:30) and a truncated +05:00 (00:00) — same bucket, so a half-hour-truncating implementation passed. At `18:45Z` the readings diverge: +05:30 → Mon 08-03 (week of 08-03), truncated +05:00 → **Sun 08-02 23:45** (week of 07-27). That divergence is the whole point of the row |
| F128 | **the client's timezone changes mid-window** (travel) | **ALL** history re-buckets under the client's **current** zone — including weeks recorded before the change. Weekly totals therefore shift retroactively; see the property note below |

**Ruled in.** The core takes the instant plus an IANA zone and derives
client-local weeks itself. `dateISO` as pre-localised was the same mistake as
pre-aggregated `loadAu`: it put untestable conversion in SQL.

#### Known property — history re-buckets when a client's timezone changes

**All history is bucketed under the client's CURRENT timezone. There is no
per-session stored zone.** A client who moves from `America/New_York` to
`Asia/Tokyo` will see weeks recorded before the move re-bucket under Tokyo, and
a session near a week boundary can therefore move between weeks. **Weekly totals
shift retroactively, and a baseline can change without any new training.**

This is **accepted and deliberate, not a bug** — recorded here so it is not
"fixed" later by someone who finds it surprising. Storing a per-session zone
would freeze each week under the zone it was trained in, at the cost of a column,
a migration, and a second source of truth for something `shape_user_tz` already
answers. The tradeoff was taken knowingly: travel is rare, the shift is at most a
session or two near a boundary, and the guardrail is advisory.

Note the interaction with the baseline: because bucketing changes, a re-bucketed
week can cross the more-than-half-rated line in either direction and so enter or
leave the qualifying set. That is the same accepted property, one layer down.

### One correction to your list

You asked for the cold-start compound-suppression row using **450 AU × 2**.
Under the original 900/1400 caps that tripped both axes; under the recalibrated
caps it is comfortably **green** (900 weekly against a 1200 two-session amber
cap; 450 hardest against a 700 peak amber). The equivalent case under the
current numbers is **F79 — 800 AU × 2**, which trips both axes and must resolve
amber. F79 already exists and is unchanged; I have not added a 450 × 2 row,
because a fixture asserting green would not test suppression at all.

---

## Status

Items 1–4 (the raw-session contract with client-timezone dates, the strictly-over
150-minute overrun boundary, the 4-week median taking the mean of the middle
pair, and the never-flag-a-decrease property) are **ruled and incorporated**.

Gaps A and B are **ruled in §12** and introduce three new rules — the bounded
trailing window, the baseline floor, and malformed-vs-absent — each with
fixtures. Rule A tightened the return anchors: 56 days is the last fraction, and
≥84 days is a regime handoff rather than a fifth anchor.

Rules D (`unknown` downstream) and E (timezone) were added on the following
review, with the baseline floor raised from 100 AU to **500 AU** — the ramp
curve's own lowest anchor — after the 200 AU beginner case (F115) showed the old
floor left ordinary progression resolving red.

**133 fixtures — all ruled. Nothing blocks implementation.** Rule E was ruled in
(the core takes an instant plus an IANA zone and derives client-local weeks
itself), which brought F119–F128 into 2a; F129 was added on the arithmetic
verification sweep below.

**This table is the definition of done for 2a: a rule with no row here will not
get built.**

### Corrections from the arithmetic verification sweep

Every fixture whose expected value is a *derived number* rather than a state
label was recomputed by hand from its inputs. All of §2, §3, §4, §6, §7, §8, §9
and the calendar checks verified clean. Four rows were corrected:

| Row | Defect | Correction |
|---|---|---|
| F120 | `2026-08-02T23:40:00Z` is Sunday in **both** New York and UTC, so the pair could not diverge | instant → `2026-08-03T02:40:00Z` |
| F109 | outcome was reasoned, not computed: with a **one**-week deload the 4-week median is unchanged at 2000, so a proposed 2000 is a 0% increase → **green**, contradicting F37 | deload length stated explicitly as **two weeks** (baseline 1600 → amber) |
| F127 | `19:00:00Z` buckets to Mon 08-03 at **both** +05:30 and a truncated +05:00 — a half-hour truncation bug passes | instant → `2026-08-02T18:45:00Z` |
| F48 | outcome depended on an unstated split: 840/840 → amber, but 1100/580 → red | split stated as **even 840 / 840**, with the suppression reason |

F49 was checked and is **not** a defect — its stated reason was partial (the peak
bound fires, and so does `share_of_week`); both are named now.

**The lesson the sweep exists to enforce:** an expected value that is *reasoned*
rather than *computed* can be confidently wrong and invisible to review. Three of
the four defects above were of exactly that shape.
