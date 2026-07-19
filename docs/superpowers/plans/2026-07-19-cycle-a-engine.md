# The Cycle — PR A: Migration + Phase Engine + Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Cycle's foundation: the `cycle_events` migration (owner-only RLS, no-future trigger, GUC-guarded RPC-only settings/consent writes, definer coach read, transactional opt-out), the pure deterministic phase engine `cyclePhase.mjs`, and the `window.ShapeCycle` data layer. **No UI in this PR** (PR B–D consume it).

**Architecture:** One migration ships the table + five functions; the canonical engine lives in `public/newdesign/cyclePhase.mjs` (shareCard pattern — three consumers later); `window.ShapeCycle` (shapeBackend) wraps list/log/unlog/settings/optOut/coach-read, every write path RPC-first with honest degrade.

**Tech Stack:** Postgres (RLS + SECURITY DEFINER + GUC-guard triggers), pure ESM + `node --test`, `shapeBackend.js` window-global data layer.

**Spec:** `docs/superpowers/specs/2026-07-19-cycle-awareness-design.md` — **owner-approved, three review rounds folded in; every contract below is final there.** The Doctrine section binds all copy AND code comments. Re-read it first, whole.

## Global Constraints

- **Doctrine (hard):** never speculate about pregnancy (`paused` phase, fixed copy) · not medical advice (verbatim disclaimer, one key) · NO Shape Score points anywhere in this wave · the engine never modifies a plan · absence-not-a-locked-state for the coach.
- Deterministic engine: L = round-half-up(mean of kept intervals) clamped [15,60]; inclusive integer windows via the menstrual > luteal > ovulatory > follicular derivation; the 5-rung confidence ladder (population stdev of intervals) — ALL pinned by the spec's exact vectors.
- Fail-closed + honest-null throughout; migration OWNER-run (raw link only on the PR); no UI, no i18n in this PR.
- Verify per task: `npm test` · `node --check` for shapeBackend · PowerShell `/m/` build (the shim import touches mobile) · LF.

---

### Task 1: Migration — `2026-07-19-cycle-events.sql`

**Files:**
- Create: `supabase-migrations/2026-07-19-cycle-events.sql`

**Interfaces:**
- Produces: `public.cycle_events` (owner-only RLS, unique `(user_id, event_date, kind)`, no-future trigger) · `public.get_client_cycle(uuid)` (definer; coach link AND optIn AND share; raw last-13 starts) · `public.cycle_set_settings(p_opt_in bool, p_share bool, p_consent_kind text, p_granted bool, p_consent_text text)` (invoker; settings + receipt, one transaction, GUC-flagged) · `public.cycle_opt_out()` (invoker; delete events + settings + withdrawal receipt, one transaction) · the two GUC-guard triggers (`cycle_settings_guard` on `user_goals`, `cycle_consent_guard` on `consent_log`).

- [ ] **Step 1: Write it.** The table + trigger + `get_client_cycle` blocks are **verbatim in the spec's Data model section — copy them exactly** (they carry the review-hardened search_path/optIn/tz-fallback details). Append the pieces the spec names but doesn't inline:

```sql
-- ── RPC-only settings/consent writes (GUC-guard, the #1707 shape.adjust_regen
--    pattern): a direct owner upsert of the cycle settings doc, or a direct
--    insert of a cycle consent receipt, raises — flag and receipt can only
--    move together, inside the RPCs below.
create or replace function public.cycle_settings_guard()
returns trigger language plpgsql as $$
begin
  if new.kind = 'cycle_settings'
     and coalesce(current_setting('shape.cycle_rpc', true), '') <> '1' then
    raise exception 'cycle_settings_rpc_only';
  end if;
  return new;
end $$;
drop trigger if exists cycle_settings_guard on public.user_goals;
create trigger cycle_settings_guard before insert or update on public.user_goals
  for each row execute function public.cycle_settings_guard();

create or replace function public.cycle_consent_guard()
returns trigger language plpgsql as $$
begin
  if new.kind in ('cycle_tracking', 'cycle_share')
     and coalesce(current_setting('shape.cycle_rpc', true), '') <> '1' then
    raise exception 'cycle_consent_rpc_only';
  end if;
  return new;
end $$;
drop trigger if exists cycle_consent_guard on public.consent_log;
create trigger cycle_consent_guard before insert on public.consent_log
  for each row execute function public.cycle_consent_guard();

-- ── Settings flip + its receipt, ONE transaction. INVOKER: owner RLS on
--    user_goals + consent_log is the scope. p_consent_kind names which receipt
--    this flip records ('cycle_tracking' | 'cycle_share'); p_granted false =
--    a withdrawal receipt (share-off / opt-out path records its own).
create or replace function public.cycle_set_settings(
  p_opt_in boolean, p_share boolean,
  p_consent_kind text, p_granted boolean, p_consent_text text
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_consent_kind not in ('cycle_tracking', 'cycle_share') then
    raise exception 'bad_consent_kind';
  end if;
  -- Invariants (review round): the flags and the receipt must describe ONE
  -- coherent transition. Sharing requires opt-in; the receipt's granted value
  -- must match the flag it records (tracking receipt ↔ p_opt_in, share
  -- receipt ↔ p_share). Anything else is an incoherent audit row.
  if p_share and not p_opt_in then raise exception 'share_requires_opt_in'; end if;
  if p_consent_kind = 'cycle_tracking' and p_granted <> p_opt_in then
    raise exception 'receipt_flag_mismatch';
  end if;
  if p_consent_kind = 'cycle_share' and p_granted <> p_share then
    raise exception 'receipt_flag_mismatch';
  end if;
  perform set_config('shape.cycle_rpc', '1', true);
  insert into public.user_goals (user_id, kind, data)
  values (auth.uid(), 'cycle_settings',
          jsonb_build_object('optIn', p_opt_in, 'share', p_share))
  on conflict (user_id, kind) do update
    set data = jsonb_build_object('optIn', p_opt_in, 'share', p_share);
  insert into public.consent_log (user_id, kind, granted, consent_text, source)
  values (auth.uid(), p_consent_kind, p_granted, p_consent_text, 'settings');
end $$;
revoke all on function public.cycle_set_settings(boolean, boolean, text, boolean, text) from public, anon;
grant execute on function public.cycle_set_settings(boolean, boolean, text, boolean, text) to authenticated;

-- ── Opt-out: delete EVERYTHING + the withdrawal receipt, one transaction.
--    Idempotent: deletes are no-ops on repeat; a re-run just re-records the
--    withdrawal. Partial state (events outliving consent) is unrepresentable.
create or replace function public.cycle_opt_out()
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_was_sharing boolean;
begin
  perform set_config('shape.cycle_rpc', '1', true);
  select coalesce((data->>'share')::boolean, false) into v_was_sharing
    from public.user_goals where user_id = auth.uid() and kind = 'cycle_settings';
  delete from public.cycle_events where user_id = auth.uid();
  delete from public.user_goals where user_id = auth.uid() and kind = 'cycle_settings';
  -- Withdrawal receipts for EVERY scope that was granted (review round): a
  -- member who was sharing gets a cycle_share withdrawal too, so the ledger
  -- never shows a share grant outliving its tracking basis.
  if coalesce(v_was_sharing, false) then
    insert into public.consent_log (user_id, kind, granted, consent_text, source)
    values (auth.uid(), 'cycle_share', false, 'Coach sharing ended — cycle tracking stopped.', 'settings');
  end if;
  insert into public.consent_log (user_id, kind, granted, consent_text, source)
  values (auth.uid(), 'cycle_tracking', false, 'Stopped cycle tracking — all cycle data deleted.', 'settings');
end $$;
revoke all on function public.cycle_opt_out() from public, anon;
grant execute on function public.cycle_opt_out() to authenticated;
```

⚠ Pre-write checks: `grep -n "on conflict" supabase-migrations/*.sql | grep -i user_goals` — confirm `user_goals` has a unique constraint on `(user_id, kind)` (every `saveUserGoals` upsert relies on it; if the constraint name differs, keep the column form above). Confirm `consent_log` column names against `2026-06-22-consent-log.sql` (they are `user_id, kind, granted, policy_version, consent_text, scope, source` — the inserts above use a valid subset).

- [ ] **Step 2: Assemble the full file** — spec blocks first (table → no-future trigger → `get_client_cycle` → its revoke/grant), then the four appended blocks, one header comment referencing the spec + WA MHMD purpose. Idempotent throughout (`create or replace` / `drop … if exists` / `if not exists`).
- [ ] **Step 3: LF + commit** — `git commit -m "cycle: migration — cycle_events + guarded RPC-only settings/consent + coach read + opt-out"`. **Also add `cycle_events` to the `/api/account/delete` purge list** (`src/app/api/account/delete/route.ts` — find the owned-tables array, add `'cycle_events'`) in this same task; `tsc --noEmit` after.

---

### Task 2: Phase engine — `public/newdesign/cyclePhase.mjs` (TDD)

**Files:**
- Create: `public/newdesign/cyclePhase.mjs`
- Create: `mobile-app/src/services/cyclePhase.mjs` (one-line re-export shim: `export * from '../../../public/newdesign/cyclePhase.mjs';`)
- Create: `tests/cycle-phase.test.mjs`

**Interfaces:**
- Produces (PR B–D consume):
  - `bsDeriveCycle(starts, today)` → `{ phase, day, L, confidence, windows, predictedStart, starts } | { phase: null }` — `phase` ∈ `'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | 'late' | 'paused'` (`'late'` = L < day ≤ L+7, predictions hold; `'paused'` = day > L+7, every prediction field null — PRs B/C consume both) — `starts` = ISO date strings newest-first (the RPC's shape), `today` = ISO date or Date. `windows` = `{ menstrual: [a,b], luteal: [a,b], ovulatory: [a,b]|null, follicular: [a,b]|null }` (inclusive day numbers). `predictedStart` = `{ from, to }` ISO dates (lastStart + L ± the confidence-scaled slop: high ±1 · medium ±2 · low ±4) or null when paused/no-starts.
  - `bsCycleRead(days, cycle)` → `{ metric, phaseA, phaseB, gap, se, copy } | null` — the statistical read, crossoverRead's shape.

- [ ] **Step 1: Failing tests** — pin the spec's vectors EXACTLY:

```js
// tests/cycle-phase.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsDeriveCycle, bsCycleRead } from '../public/newdesign/cyclePhase.mjs';

const D = (s) => s; // ISO helper for readability
// 4 starts, perfect 28s: intervals [28,28,28]
const REG = ['2026-07-01', '2026-06-03', '2026-05-06', '2026-04-08'];

test('L: rounded half-up mean of kept intervals, clamped [15,60]; outliers discarded', () => {
  assert.equal(bsDeriveCycle(REG, '2026-07-10').L, 28);
  // intervals [27, 28] → mean 27.5 → round half-up 28
  assert.equal(bsDeriveCycle(['2026-07-01', '2026-06-04', '2026-05-07'], '2026-07-02').L, 28);
  // a 90-day gap is data-entry noise — excluded from L, not averaged in
  const gap = bsDeriveCycle(['2026-07-01', '2026-04-02', '2026-03-05'], '2026-07-02');
  assert.equal(gap.L, 28);
});

test('windows: textbook L=28 → M 1–5 · F 6–11 · O 12–16 · Lu 17–28', () => {
  const c = bsDeriveCycle(REG, '2026-07-10');
  assert.deepEqual(c.windows, { menstrual: [1, 5], follicular: [6, 11], ovulatory: [12, 16], luteal: [17, 28] });
  assert.equal(c.day, 10);
  assert.equal(c.phase, 'follicular');
});

test('short cycles: L=17/16/15 → M 1–5 · Lu 6–L · O and F EMPTY (never fabricated)', () => {
  for (const L of [17, 16, 15]) {
    const starts = []; let d = new Date('2026-07-01');
    for (let i = 0; i < 4; i++) { starts.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() - L * 86400000); }
    const c = bsDeriveCycle(starts, '2026-07-03');
    assert.deepEqual(c.windows.menstrual, [1, 5]);
    assert.deepEqual(c.windows.luteal, [6, L]);
    assert.equal(c.windows.ovulatory, null);
    assert.equal(c.windows.follicular, null);
  }
});

test('confidence ladder: ordered, population stdev, stdev>5 outranks n=2 medium', () => {
  assert.equal(bsDeriveCycle(['2026-07-01'], '2026-07-02').confidence, 'low');            // n=0
  assert.equal(bsDeriveCycle(['2026-07-01', '2026-06-03'], '2026-07-02').confidence, 'low'); // n=1
  // n=2, intervals [18, 38]: stdev 10 > 5 → LOW (not medium) + widened ovulatory
  const wild = bsDeriveCycle(['2026-07-01', '2026-06-13', '2026-05-06'], '2026-07-02');
  assert.equal(wild.confidence, 'low');
  assert.equal(bsDeriveCycle(REG, '2026-07-02').confidence, 'high');                      // n=3, stdev 0
  // n=2, stdev ≤5 → medium: intervals [27, 29]
  assert.equal(bsDeriveCycle(['2026-07-01', '2026-06-04', '2026-05-06'], '2026-07-02').confidence, 'medium');
});

test('late then paused; no starts → phase null', () => {
  // Day arithmetic against REG (last start 2026-07-01, L=28, L+7=35):
  // Jul 30 = day 30 · Aug 4 = day 35 (the last 'late' day) · Aug 5 = day 36.
  assert.equal(bsDeriveCycle(REG, '2026-07-30').phase, 'late');   // L < 30 ≤ L+7
  assert.equal(bsDeriveCycle(REG, '2026-08-04').phase, 'late');   // day 35 == L+7 boundary, still late
  assert.equal(bsDeriveCycle(REG, '2026-08-05').phase, 'paused'); // day 36 > L+7
  const none = bsDeriveCycle([], '2026-07-10');
  assert.equal(none.phase, null);
  const paused = bsDeriveCycle(REG, '2026-09-01');
  assert.equal(paused.predictedStart, null);                      // every prediction field null
});

test('Date inputs normalize to the LOCAL calendar date (no midnight drift)', () => {
  // Logged starts are date-only; `today` as a Date must resolve to the same
  // day number a plain ISO string does, at any wall-clock time — 23:59 local
  // must NOT read as tomorrow (or yesterday) via UTC epoch math.
  const evening = new Date(2026, 6, 10, 23, 59);   // LOCAL Jul 10, 23:59
  const morning = new Date(2026, 6, 10, 0, 1);     // LOCAL Jul 10, 00:01
  assert.equal(bsDeriveCycle(REG, evening).day, bsDeriveCycle(REG, '2026-07-10').day);
  assert.equal(bsDeriveCycle(REG, morning).day, bsDeriveCycle(REG, '2026-07-10').day);
});

test('predictedStart window scales with confidence', () => {
  const c = bsDeriveCycle(REG, '2026-07-10');                           // high → ±1
  assert.deepEqual(c.predictedStart, { from: '2026-07-28', to: '2026-07-30' });
});

test('bsCycleRead: floors → null; powered + material + significant → fires', () => {
  // days: [{date, phase-resolvable via cycle, sleepH, energy, adherence}] —
  // build 2 complete cycles of synthetic days: luteal sleep 6.5h vs follicular 7.6h
  const mk = (n, phase, sleepH) => Array.from({ length: n }, (_, i) => ({ sleepH, phase }));
  const days = [...mk(12, 'follicular', 7.6), ...mk(12, 'luteal', 6.5)];
  const read = bsCycleRead(days, { completeCycles: 2 });
  assert.ok(read);
  assert.equal(read.metric, 'sleep');
  assert.ok(Math.abs(read.gap) >= 0.5);
  assert.equal(bsCycleRead(days, { completeCycles: 1 }), null);          // <2 cycles → null
  assert.equal(bsCycleRead(days.slice(0, 14), { completeCycles: 2 }), null); // <8 days a bucket → null
  const noise = [...mk(12, 'follicular', 7.2), ...mk(12, 'luteal', 7.0)];
  assert.equal(bsCycleRead(noise, { completeCycles: 2 }), null);         // 12 min < 30-min materiality floor
});
```

⚠ One NEW contract surfaced by writing the vectors: days L < d ≤ L+7 fit no window — the spec's phases stop at L and `paused` starts at L+8. The engine reports **`phase: 'late'`** for that gap (day > L, predictions intact, neutral copy — NOT "late" in the pregnancy sense anywhere in copy; the PHASE KEY is internal). PR B's copy for it: "Cycle day {d} — a new cycle starts when you log it." This is an addition the spec's window algebra implies; note it in the PR body for the owner's eye.

- [ ] **Step 2: Run → fail. Step 3: Implement** — exact algorithm:

```js
// The Cycle — phase engine (spec 2026-07-19, owner-approved). CANONICAL COPY
// (shareCard pattern): website loads it as a native ES module, mobile imports
// the services shim, tests import directly. Pure; deterministic; never throws.
// DOCTRINE (binding): the 'paused'/'late' phases NEVER speculate about causes;
// predictions are windows, not dates; no fabricated precision — empty windows
// stay null.
const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
// Calendar-date semantics (review round): logged starts are DATE-ONLY strings
// (UTC-midnight epoch under Date.parse). A `today` passed as a Date object is
// therefore normalized to its LOCAL calendar date first — the member's wall
// clock decides what "today" is — then parsed the same UTC-midnight way, so
// day arithmetic never drifts ±1 near local midnight.
const parse = (d) => {
  if (d instanceof Date) {
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return Date.parse(local);
  }
  return Date.parse(d);
};

export function bsDeriveCycle(starts, today) {
  const t = parse(today);
  const s = (Array.isArray(starts) ? starts : []).map(parse)
    .filter(Number.isFinite).sort((a, b) => b - a);          // newest first
  if (!s.length || !Number.isFinite(t)) return { phase: null };
  const rawIntervals = [];
  for (let i = 0; i + 1 < s.length && rawIntervals.length < 12; i++) {
    rawIntervals.push(Math.round((s[i] - s[i + 1]) / DAY));
  }
  const kept = rawIntervals.filter((x) => x >= 15 && x <= 60); // outliers discarded, never mutated
  const n = kept.length;
  const mean = n ? kept.reduce((a, b) => a + b, 0) / n : 28;
  const L = Math.min(60, Math.max(15, Math.floor(mean + 0.5)));  // round half-up, clamp
  const stdev = n >= 2 ? Math.sqrt(kept.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n) : null;
  // confidence — the ordered ladder (first match wins)
  let confidence;
  if (n === 0) confidence = 'low';
  else if (n === 1) confidence = 'low';
  else if (stdev > 5) confidence = 'low';
  else if (n >= 3 && stdev <= 3) confidence = 'high';
  else confidence = 'medium';
  const wide = n >= 2 && stdev > 5;
  // windows — menstrual > luteal > ovulatory > follicular, inclusive ints
  const menstrual = [1, 5];
  const luteal = [Math.max(6, L - 11), L];
  const oLo = Math.max(6, L - (wide ? 18 : 16));
  const oHi = Math.min(L - (wide ? 10 : 12), luteal[0] - 1);
  const ovulatory = oHi >= oLo ? [oLo, oHi] : null;
  const fHi = (ovulatory ? ovulatory[0] : luteal[0]) - 1;
  const follicular = fHi >= 6 ? [6, fHi] : null;
  const windows = { menstrual, follicular, ovulatory, luteal };
  const day = Math.floor((t - s[0]) / DAY) + 1;
  if (day > L + 7) return { phase: 'paused', day, L, confidence, windows, predictedStart: null, starts: s.map(iso) };
  let phase = 'late';                                          // L < day ≤ L+7 (see PR-body note)
  if (day <= 5) phase = 'menstrual';
  else if (follicular && day <= follicular[1]) phase = 'follicular';
  else if (ovulatory && day <= ovulatory[1]) phase = 'ovulatory';
  else if (day <= L) phase = 'luteal';
  const slop = confidence === 'high' ? 1 : confidence === 'medium' ? 2 : 4;
  const predicted = s[0] + L * DAY;
  return {
    phase, day, L, confidence, windows,
    predictedStart: { from: iso(predicted - slop * DAY), to: iso(predicted + slop * DAY) },
    starts: s.map(iso),
  };
}
```

and `bsCycleRead(days, cycle)` — buckets `days` (caller-labeled with `phase` + metric fields `sleepH`/`energy`/`rested`/`adherence`/`volume`) into the two most-populated phase buckets, requires `cycle.completeCycles >= 2` AND ≥8 days per compared bucket, computes the gap + two-sample SE (`sqrt(v1/n1 + v2/n2)`), and fires only when the gap clears BOTH the per-metric materiality floor (`sleepH: 0.5` [30 min] · `energy/rested: 1.0` · `adherence: 0.12`) AND `1.65 * se`; returns `{ metric, phaseA, phaseB, gap, se, copy }` with copy built in-module (never-shaming framing per doctrine, figures baked — the crossoverCopy rule) or null. Implement metric-by-metric, picking the LARGEST significant standardized gap when several clear.

- [ ] **Step 4: green · Step 5: shim + `/m/` build proof · Step 6: commit.**

---

### Task 3: Data layer — `window.ShapeCycle`

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (new block near `ShapeWeighIns`)

**Interfaces:**
- Produces (PR B–D consume):
  - `ShapeCycle.list()` → `[isoDate]` newest-first (own `cycle_events` select, `kind='period_start'`, limit 60) — `[]` on error/pre-migration.
  - `ShapeCycle.log(isoDate)` / `ShapeCycle.unlog(isoDate)` → `{ok}` — insert (upsert on the unique key) / delete own row.
  - `ShapeCycle.settings()` → `{ optIn, share } | null` (own `user_goals` read — READ direct is fine; only WRITES are RPC-gated).
  - `ShapeCycle.setSettings({ optIn, share, consentKind, granted, consentText })` → `{ok}` via `supabase.rpc('cycle_set_settings', …)` — **no fallback write** (a direct write would raise on the guard, correctly; pre-migration the RPC is absent → `{ok:false, reason:'unavailable'}` and the UI says so honestly).
  - `ShapeCycle.optOut()` → `{ok}` via `rpc('cycle_opt_out')`, same no-fallback contract.
  - `ShapeCycle.forClient(userId)` → `null | { share:false } | { share:true, starts:[iso] }` via `rpc('get_client_cycle', { p_user_id })`.

- [ ] **Step 1: Implement** the block following the file's house patterns (try/catch every call, `state.user` guards, degrade to honest nulls; ~60 lines). Insert-conflict on `log()` of an existing date = success (idempotent). The no-future trigger's `future_event_date` error surfaces as `{ok:false, reason:'future'}` so PR B's calendar can toast honestly.
- [ ] **Step 2: `node --check` + `/m/` build + commit.**

---

### Task 4: Gates + PR

- [ ] Full: `npm test` (new suite included) · `tsc --noEmit` (the delete-route edit) · `node --check` shapeBackend · PowerShell `/m/` build · LF audit.
- [ ] PR: `cycle A: migration + phase engine + ShapeCycle data layer (spec 2026-07-19)`; body: RAW migration link · the `phase:'late'` addition flagged for the owner · "no UI in this PR — B/C/D follow". CI + CodeRabbit; address; squash-merge; re-sync.
- [ ] Post-migration validation (OWNER applied, read-only + a throwaway test account): direct `cycle_settings` upsert raises · direct cycle consent insert raises · `cycle_set_settings` writes both atomically · future-dated insert raises (`future_event_date`) · `get_client_cycle` grants anon=false/authenticated=true · opt-out empties everything + writes the withdrawal receipt.

---

## Self-review notes

- **Spec coverage:** every migration piece incl. all three review rounds' hardening (T1) · the full deterministic engine with the spec's pinned vectors (T2) · reads with floors/materiality/SE (T2) · data layer incl. the purge-list edit (T1/T3). UI deliberately absent (PR B–D per the spec's build plan).
- **Type consistency:** `bsDeriveCycle`'s return shape is stated once in T2's Interfaces and used by the tests verbatim; `ShapeCycle.*` signatures match what PR B's plan consumes.
- **New contract flagged:** `phase: 'late'` (the L<d≤L+7 gap) — implied by the spec's window algebra, surfaced for the owner in the PR body.
