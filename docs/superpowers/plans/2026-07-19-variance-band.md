# Compliance Variance Band Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coaches see which clients are steady vs variable week-to-week — a `VARIABLE` roster chip, a Case File line, and a website line — from a new coach-gated weekly-adherence RPC and one pure canonical module.

**Architecture:** A SECURITY DEFINER `get_roster_weekly_adherence(uuid[])` (the `get_roster_weekend_split` pattern, hardened) returns per-client weekly `{week_start, scheduled, completed}` buckets; the pure canonical `public/newdesign/varianceBand.mjs` computes the band client-side (no SQL twin). **No new routes:** mobile calls `supabase.rpc` directly (the `get_client_lifts` pattern at `shapeBackend.js:4028`), web calls `window.shapeDb.client.rpc`. Members never see the band.

**Tech Stack:** Postgres (SECURITY DEFINER + `shape_user_tz`), pure ESM + `node --test`, React (pros module + newdesign).

**Spec:** `docs/superpowers/specs/2026-07-19-compliance-variance-band-design.md` — binding, especially the deterministic pipeline order, the exact result contract, and the garbage-input contract (post-review revisions — re-read before coding).

## Global Constraints

- Band thresholds: **population stdev**, rates ×100 → pp BEFORE comparison, compared **unrounded**: steady ≤ 8.0pp · variable ≥ 18.0pp · between = `band: null`. Display rounds via `Math.round` only inside `bsVarianceCopy`.
- Pipeline order is law: trailing 8 closed ISO weeks (member tz) → drop weeks with <6 scheduled units (zero + thin alike) → survivors are the series → floor ≥4 weeks else the CALL returns `null`.
- Never-shaming: the chip is a coaching signal (`VARIABLE`, quiet mono), steady gets NO chip; members never see any of it.
- Theme tokens in the pros module (`t.*`, `bsProHeat`); newdesign uses its fixed-dark literals.
- i18n: new keys in the existing `coach` namespace (already registered both places — no NS edit). Literal keys only.
- Verify per task: `npm test` · JSX parse for edited babel/jsx · PowerShell `/m/` build · LF (CRLF-tracked HTML checked before edit).
- Migration is OWNER-run: reply with ONLY the raw GitHub link on the PR.

---

### Task 1: Pure module `public/newdesign/varianceBand.mjs` (TDD)

**Files:**
- Create: `public/newdesign/varianceBand.mjs`
- Create: `tests/variance-band.test.mjs`

**Interfaces:**
- Produces (exact — Tasks 3–5 rely on these):
  - `bsVarianceBand(weeks)` → `null` | `{ band: 'steady'|'variable'|null, mean, stdev, min, max, weeks }` — input `weeks` = `[{ week_start: string, scheduled: number, completed: number }]` (the RPC's per-client rows); output figures in pp, `weeks` = integer count of qualifying weeks.
  - `bsVarianceCopy(result)` → `null` | `{ chip: 'VARIABLE'|null, line: string }` — the ONE copy source. Examples pinned by tests: steady → `Week-to-week: holds 65–75%.` · variable → `Week-to-week: swings 38–96% — steady the floor before raising the target.` · middle → `Week-to-week: 55–80% across 6 weeks.`
- Consumes: nothing (pure, import-free — canonical in `public/newdesign/` because web + mobile both render it).

- [ ] **Step 1: Write the failing tests** — vectors that pin the spec's contract exactly:

```js
// tests/variance-band.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsVarianceBand, bsVarianceCopy } from '../public/newdesign/varianceBand.mjs';

const wk = (ws, scheduled, completed) => ({ week_start: ws, scheduled, completed });
// 6 qualifying weeks, tight cluster → steady. Rates: .70 .72 .68 .71 .69 .70
const STEADY = [wk('2026-06-01', 10, 7), wk('2026-06-08', 25, 18), wk('2026-06-15', 25, 17),
  wk('2026-06-22', 7, 5), wk('2026-06-29', 13, 9), wk('2026-07-06', 10, 7)];
// 4 qualifying weeks alternating 1.0 / 0.4 → population stdev = 30pp → variable
const SWING = [wk('2026-06-15', 10, 10), wk('2026-06-22', 10, 4), wk('2026-06-29', 10, 10), wk('2026-07-06', 10, 4)];

test('variable fires on a clear swing; result contract exact', () => {
  const r = bsVarianceBand(SWING);
  assert.equal(r.band, 'variable');
  assert.equal(r.weeks, 4);                       // integer COUNT, not an array
  assert.equal(r.mean, 70);
  assert.equal(r.stdev, 30);
  assert.equal(r.min, 40);
  assert.equal(r.max, 100);
});

test('steady band on a tight cluster', () => {
  const r = bsVarianceBand(STEADY);
  assert.equal(r.band, 'steady');
  assert.ok(r.stdev <= 8);
});

test('band boundaries compare UNROUNDED at 8.0 / 18.0', () => {
  // two weeks at exactly ±8.0pp around the mean → population stdev exactly 8.0 → steady (≤)
  const edge8 = [wk('2026-06-15', 100, 62), wk('2026-06-22', 100, 78), wk('2026-06-29', 100, 62), wk('2026-07-06', 100, 78)];
  assert.equal(bsVarianceBand(edge8).band, 'steady');
  // ±18.0pp → stdev exactly 18.0 → variable (≥)
  const edge18 = [wk('2026-06-15', 100, 52), wk('2026-06-22', 100, 88), wk('2026-06-29', 100, 52), wk('2026-07-06', 100, 88)];
  assert.equal(bsVarianceBand(edge18).band, 'variable');
});

test('dead middle is a REAL result with band null', () => {
  // ±12pp swing → stdev 12 → between the thresholds
  const mid = [wk('2026-06-15', 100, 58), wk('2026-06-22', 100, 82), wk('2026-06-29', 100, 58), wk('2026-07-06', 100, 82)];
  const r = bsVarianceBand(mid);
  assert.equal(r.band, null);
  assert.equal(r.weeks, 4);
});

test('floor: 3 qualifying weeks -> null (the whole call)', () => {
  assert.equal(bsVarianceBand(SWING.slice(0, 3)), null);
});

test('thin + zero weeks are dropped BEFORE the floor, and never enter the stats', () => {
  // 3 solid weeks + a 5-unit thin week + a zero week -> only 3 qualify -> null
  const thin = [...SWING.slice(0, 3), wk('2026-06-08', 5, 0), wk('2026-06-01', 0, 0)];
  assert.equal(bsVarianceBand(thin), null);
  // 4 solid + 1 wild thin week: thin week must NOT swing the stats
  const wild = [...SWING, wk('2026-06-08', 2, 0)];
  assert.equal(bsVarianceBand(wild).weeks, 4);
});

test('garbage: never throws; malformed weeks dropped; duplicates last-wins; non-array null', () => {
  assert.equal(bsVarianceBand(null), null);
  assert.equal(bsVarianceBand('nope'), null);
  const junk = [...SWING, wk('2026-05-25', NaN, 3), wk('2026-05-18', 10, 14), { week_start: '2026-05-11' }, wk('bad-date', 10, 5)];
  assert.equal(bsVarianceBand(junk).weeks, 4);    // only the 4 solid weeks survive
  const dup = [...SWING, wk('2026-07-06', 10, 4)];  // duplicate week_start → last wins, still 4 weeks
  assert.equal(bsVarianceBand(dup).weeks, 4);
});

test('copy binds to the figures and handles null', () => {
  assert.equal(bsVarianceCopy(null), null);
  const v = bsVarianceCopy(bsVarianceBand(SWING));
  assert.equal(v.chip, 'VARIABLE');
  assert.match(v.line, /swings 40–100%/);
  const s = bsVarianceCopy(bsVarianceBand(STEADY));
  assert.equal(s.chip, null);
  assert.match(s.line, /holds 68–72%/);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test` → the new file fails with "Cannot find module".
- [ ] **Step 3: Implement** `public/newdesign/varianceBand.mjs`:

```js
// Compliance variance band (spec 2026-07-19): steady-vs-variable weekly
// adherence for the coach roster + Case File + website line. CANONICAL COPY —
// web loads it as a native ES module, mobile imports it, Node tests import it
// directly. Pure; never throws.
//
// Pipeline (deterministic, the spec's exact order):
//  1. the input IS the trailing ≤8-closed-week window (the RPC's window);
//  2. drop non-qualifying weeks: malformed, or < 6 scheduled units (zero and
//     thin alike — too noisy for a rate); duplicate week_start → last wins;
//  3. the survivors are the series; ≥4 or the whole call returns null.
// Band: POPULATION stdev of the weekly rates in pp, compared UNROUNDED —
// steady ≤ 8.0 · variable ≥ 18.0 · between = band null (a real result, no chip).
const MIN_UNITS = 6;
const MIN_WEEKS = 4;
const STEADY_PP = 8;
const VARIABLE_PP = 18;

const numOrNull = (v) => {
  // STRICT (review round): Number(null)/Number('') are 0 — reject non-number,
  // non-numeric-string inputs outright instead of letting them read as zero.
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
};

export function bsVarianceBand(weeks) {
  if (!Array.isArray(weeks)) return null;
  const byWeek = new Map();
  for (const w of weeks) {
    if (!w || typeof w !== 'object') continue;
    const ws = String(w.week_start || '').slice(0, 10);
    // Anchored full-date parse — no trailing garbage, no invalid dates.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ws) || !Number.isFinite(Date.parse(ws))) continue;
    const sched = numOrNull(w.scheduled); const done = numOrNull(w.completed);
    if (sched === null || done === null) continue;
    if (sched < MIN_UNITS || done < 0 || done > sched) continue;
    byWeek.set(ws, done / sched);                 // duplicate week_start → last wins
  }
  const rates = [...byWeek.values()];
  if (rates.length < MIN_WEEKS) return null;
  const pp = rates.map((r) => r * 100);
  const mean = pp.reduce((s, v) => s + v, 0) / pp.length;
  const stdev = Math.sqrt(pp.reduce((s, v) => s + (v - mean) * (v - mean), 0) / pp.length);
  const band = stdev <= STEADY_PP ? 'steady' : stdev >= VARIABLE_PP ? 'variable' : null;
  return { band, mean, stdev, min: Math.min(...pp), max: Math.max(...pp), weeks: pp.length };
}

// The ONE copy source (crossoverCopy no-drift rule): words and figures from a
// single function, so the Case File and the web line can never disagree.
// Display rounds HERE; comparisons upstream stay unrounded.
export function bsVarianceCopy(result) {
  if (!result) return null;
  const lo = Math.round(result.min); const hi = Math.round(result.max);
  if (result.band === 'variable') {
    return { chip: 'VARIABLE', line: `Week-to-week: swings ${lo}–${hi}% — steady the floor before raising the target.` };
  }
  if (result.band === 'steady') {
    return { chip: null, line: `Week-to-week: holds ${lo}–${hi}%.` };
  }
  return { chip: null, line: `Week-to-week: ${lo}–${hi}% across ${result.weeks} weeks.` };
}
```

- [ ] **Step 4: Run** — `npm test` → all green (verify the edge8/edge18 vectors actually produce stdev exactly 8.0/18.0 — two-value ± cases do by construction).
- [ ] **Step 5: LF check + commit** — `git add public/newdesign/varianceBand.mjs tests/variance-band.test.mjs && git commit -m "variance: canonical bsVarianceBand + bsVarianceCopy (TDD, deterministic pipeline)"`

---

### Task 2: Migration — `get_roster_weekly_adherence`

**Files:**
- Create: `supabase-migrations/2026-07-19-roster-weekly-adherence.sql`

**Interfaces:**
- Produces: `public.get_roster_weekly_adherence(p_client_ids uuid[])` returning `(client_id uuid, week_start date, scheduled numeric, completed numeric)` — one row per client per closed week. Tasks 3–5 feed its rows (grouped per client) into `bsVarianceBand`. OWNER applies it; all code degrades to no-chip/no-line until then.

- [ ] **Step 1: Write the migration** — model on `supabase-migrations/2026-06-27-roster-weekend-split.sql` (read it first — its `allowed`/`tz`/`days` CTE chain is the pattern), with these deltas:

```sql
-- Batched WEEKLY adherence buckets for a coach's roster (spec 2026-07-19 —
-- the variance band). SECURITY DEFINER: habit/snapshot rows are owner-only
-- under RLS, so we read in a definer context but gate EVERY client through
-- the caller's own active subscription — a coach only ever sees their own
-- clients' buckets, and an unauthorized or nonexistent id is simply ABSENT
-- from the result (fail-closed, indistinguishable). search_path pinned with
-- pg_temp; every reference schema-qualified.
create or replace function public.get_roster_weekly_adherence(p_client_ids uuid[])
returns table (client_id uuid, week_start date, scheduled numeric, completed numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Fail CLOSED on an oversized batch (review round: raise, never silently
  -- truncate — a truncated roster would read as "those clients have no data").
  if coalesce(array_length(p_client_ids, 1), 0) > 100 then
    raise exception 'too_many_clients';
  end if;
  return query
  with capped as (
    -- DISTINCT: duplicate ids must not multiply joined rows into the totals.
    select distinct cid from unnest(p_client_ids) as cid
  ),
  allowed as (
    select cid as client_id from capped
    where exists (
      select 1 from public.subscriptions s
      left join public.trainers t on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = cid
        and s.status in ('active','trialing')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  ),
  tz as (  -- the CANONICAL tz helper (spec: shape_user_tz — validated names
           -- only); unknown-tz clients drop out (never fabricate a bucketing
           -- choice), same honest-data rule as the weekend-split RPC.
    select a.client_id, public.shape_user_tz(a.client_id) as zone
    from allowed a
    where public.shape_user_tz(a.client_id) is not null
  ),
  win as (  -- the trailing 8 CLOSED ISO weeks, local to each member
    select client_id, zone,
           date_trunc('week', (now() at time zone zone))::date as this_week_start
    from tz
  ),
  days as (  -- every day of the 8 closed weeks (this week EXCLUDED)
    select w.client_id, w.zone, gs::date as day
    from win w,
         generate_series(w.this_week_start - 56, w.this_week_start - 1, interval '1 day') gs
  ),
  daily_habits as (
    select a.client_id, count(*) as n_daily
    from allowed a
    join public.user_habits h on h.user_id = a.client_id
      and lower(coalesce(h.cadence,'daily')) in ('daily','everyday') and h.archived_at is null
    group by a.client_id
  ),
  per_day as (
    select d.client_id, d.day,
      -- units count SEPARATELY even on the same date (spec):
      coalesce(dh.n_daily, 0)                                                   as habit_sched,
      coalesce(c.done, 0)                                                       as habit_done,
      case when ws.scheduled then 1 else 0 end                                  as workout_sched,
      case when ws.scheduled and wl.done then 1 else 0 end                      as workout_done,
      1                                                                         as nutrition_sched,
      case when coalesce(s.protein_g, 0) >= 10 then 1 else 0 end               as nutrition_done
    from days d
    left join daily_habits dh on dh.client_id = d.client_id
    left join (
      select uh.user_id, uhc.done_on, count(*) as done
      from public.user_habit_completions uhc
      join public.user_habits uh on uh.id = uhc.habit_id
        and lower(coalesce(uh.cadence,'daily')) in ('daily','everyday') and uh.archived_at is null
      where uh.user_id in (select client_id from allowed)
      group by uh.user_id, uhc.done_on
    ) c on c.user_id = d.client_id and c.done_on = d.day
    -- EXISTS, not a join (review round): several workout rows on one date
    -- must not fan per_day out and multiply the habit/nutrition units.
    left join lateral (
      select exists (
        select 1 from public.client_workouts w
        where w.client_id = d.client_id and w.scheduled_date = d.day
        -- apply the repo's published/status predicate here — grep how the
        -- accountability cron filters assigned workouts (e.g. a status or
        -- published column on client_workouts) and mirror it exactly
      ) as scheduled
    ) ws on true
    left join lateral (
      select exists (
        select 1 from public.workout_sessions ws
        where ws.user_id = d.client_id
          and (ws.performed_on between d.day - 1 and d.day + 1)
      ) as done
    ) wl on true
    left join public.daily_health_snapshot s on s.user_id = d.client_id and s.snapshot_date = d.day
  )
  select per_day.client_id, date_trunc('week', per_day.day)::date as week_start,
         sum(habit_sched + workout_sched + nutrition_sched)::numeric as scheduled,
         sum(least(habit_done, habit_sched) + workout_done + nutrition_done)::numeric as completed
  from per_day
  group by per_day.client_id, date_trunc('week', per_day.day)
  order by 1, 2;
end $$;

revoke all on function public.get_roster_weekly_adherence(uuid[]) from public, anon;
grant execute on function public.get_roster_weekly_adherence(uuid[]) to authenticated, service_role;
```

⚠ **Verify the workout/session column names against the repo before finalizing** — `grep -n "scheduled_date\|performed_on" supabase-migrations/*.sql src/app/api/client/train/route.ts`. The weekend-split RPC counts nutrition + habits only; the workout leg here is NEW — mirror the day-window logic the accountability cron uses for "logged workout in a ±1-day window" (`src/app/api/cron/score-accountability/route.ts`). If `workout_sessions` uses a different date column (e.g. `created_at::date`), adjust the lateral to match — the plan's intent is: scheduled = a published `client_workouts` row dated that day; completed = any logged session within ±1 day.

- [ ] **Step 2: Sanity-grep the shapes** — `subscriptions/trainers/nutritionists` join (weekend-split lines 22–28), `client_profiles.timezone`, `user_habits.cadence/archived_at`, `daily_health_snapshot.protein_g`. All must hit in existing migrations/routes.
- [ ] **Step 3: LF check + commit** — `git commit -m "variance: get_roster_weekly_adherence migration (definer, capped, fail-closed)"`. **Do NOT apply** — OWNER runs it; raw link goes on the PR.

---

### Task 3: Mobile data layer + roster chip

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` — add `window.ShapeRosterVariance` next to `window.ShapeRosterWeekend` (~line 4077).
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — the roster live-enrichment effect (~1949–1957) and the roster row chip block (~2122–2124).

**Interfaces:**
- Consumes: Task 1's `bsVarianceBand`/`bsVarianceCopy` (import in the pros module: `import { bsVarianceBand, bsVarianceCopy } from '../../../public/newdesign/varianceBand.mjs';` — mirror the client module's shareCard import style), Task 2's RPC.
- Produces: `window.ShapeRosterVariance.get(clientIds)` → `{ [userId]: <bsVarianceBand result> }` (empty object on any failure — degrade silent); roster rows gain `_var`.

- [ ] **Step 1: Data layer** (`shapeBackend.js`, after `window.ShapeRosterWeekend`):

```js
// Weekly-adherence variance (spec 2026-07-19): direct definer RPC — the
// get_client_lifts pattern, NO route. Degrades to {} pre-migration/on error
// so the roster simply shows no chip.
async function rosterVarianceGet(clientIds) {
  const ids = (clientIds || []).filter(Boolean);
  if (!supabase || !ids.length) return {};
  try {
    const { data, error } = await supabase.rpc('get_roster_weekly_adherence', { p_client_ids: ids });
    if (error || !Array.isArray(data)) return {};
    const byClient = {};
    for (const r of data) (byClient[r.client_id] = byClient[r.client_id] || []).push(r);
    const out = {};
    const { bsVarianceBand } = await import('../../../public/newdesign/varianceBand.mjs');
    for (const [uid, rows] of Object.entries(byClient)) {
      const v = bsVarianceBand(rows);
      if (v) out[uid] = v;
    }
    return out;
  } catch (e) { return {}; }
}
window.ShapeRosterVariance = { get: rosterVarianceGet };
```

(If the file's existing style uses top-level static imports for services, hoist the `import` to the top of `shapeBackend.js` instead of the dynamic import — match `workoutShare.mjs`'s existing import style in that file.)

- [ ] **Step 2: Roster enrichment** (`iosAppBroadsheetPros.jsx` ~1949): alongside the `_wknd` merge, fire `window.ShapeRosterVariance.get(ids)` and merge `_var` the same way (`setLive(rows.map(r => varMap[r.userId] ? { ...r, _var: varMap[r.userId] } : r))` — compose with the `_wknd` merge so neither clobbers the other: run both fetches, merge both keys in one `setLive`).
- [ ] **Step 3: The chip** — next to the WKND chip (~2123), same quiet mono grammar:

```jsx
{c._var && c._var.band === 'variable' && (
  <span style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', color: t.AMBER, whiteSpace: 'nowrap' }}>{tr('coach:roster.variable', { defaultValue: 'VARIABLE' })}</span>
)}
```

(`t.AMBER` — a WATCH-tier signal, deliberately not the rust FLAG color; steady renders nothing.)

- [ ] **Step 4: Verify** — JSX parse · `npm test` · PowerShell `/m/` build. **Commit.**

---

### Task 4: Case File line (mobile)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — the Case File ATTENDANCE/ADHERENCE station (~3879–3890, inside `BSProClientFullProfilePage`'s Profile tab).

**Interfaces:**
- Consumes: `window.ShapeRosterVariance.get([clientId])` (single-id call, same map shape) + `bsVarianceCopy`.

- [ ] **Step 1: Fetch** — in the page's existing per-client effect block (where `ShapeClientStats.get` fires, ~3576 region), add a `_var` state fetched via `window.ShapeRosterVariance.get([clientId])` with the same reset-on-client-change + stale-response guard the other fetches use (the care-team pattern). Demo roster rows (no real `clientId`) skip the fetch → no line.
- [ ] **Step 2: Render** — directly under the ATTENDANCE/ADHERENCE register pair + week bars (~3890), one line, only when a result exists:

```jsx
{varRead && (
  <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: varRead.chip ? t.AMBER : t.INK50 }}>
    {varRead.line}
  </div>
)}
```

where `const varRead = clientVar ? bsVarianceCopy(clientVar) : null;`. The line renders **bare** — `bsVarianceCopy` is the ONE copy source (words + figures baked together, the `crossoverCopy` precedent; ledger-note class, English by design). Wrapping it in `tr()` would invite catalogs to rebuild the sentence from parts and fork the copy source — don't.

- [ ] **Step 3: Verify + commit** — JSX parse · `/m/` build · `npm test`.

---

### Task 5: Website line

**Files:**
- Modify: `public/newdesign/coachClientDetail.jsx` — under the stat grid Card (~line 168) or inside it below the `statGrid` row.
- Modify: `public/newdesign/TrainerClient.html` + `NutritionistClient.html` — add the module loader + bump `coachClientDetail.jsx?v=`.

**Interfaces:**
- Consumes: `window.shapeDb.client.rpc('get_roster_weekly_adherence', { p_client_ids: [clientId] })` (the pages gained the supabase loader in the live-progress-web PR — if this PR lands FIRST, copy that plan's Task 2 loader insertion here) + `window.ShapeVariance.bsVarianceBand/bsVarianceCopy` via a module loader:

```html
<script type="module">import * as VB from "/newdesign/varianceBand.mjs?v=20260719"; window.ShapeVariance = VB;</script>
```

- [ ] **Step 1: Loaders** — insert the `window.ShapeVariance` module tag on both pages (after the supabase tags; add the supabase vendor + `/supabase.js` tags first if the live-web PR hasn't landed — check `grep -n supabase public/newdesign/TrainerClient.html`).
- [ ] **Step 2: Fetch + render** in `CoachClientDetailPage` — a small effect beside the existing shared-overview fetch:

```jsx
const [varRead, setVarRead] = React.useState(null);
React.useEffect(() => {
  setVarRead(null);   // SYNCHRONOUS reset (review round): client A's line must
                      // never sit under client B while B's fetch is in flight,
                      // and missing prereqs must clear any held line too.
  const db = window.shapeDb && window.shapeDb.client; const VB = window.ShapeVariance;
  if (!db || !VB || !clientId) return undefined;
  let on = true;
  db.rpc("get_roster_weekly_adherence", { p_client_ids: [clientId] })
    .then(({ data }) => { if (on && Array.isArray(data)) setVarRead(VB.bsVarianceCopy(VB.bsVarianceBand(data))); })
    .catch(() => {});
  return () => { on = false; };
}, [clientId]);
```

Render under the stat grid inside the same Card:

```jsx
{varRead && <div style={{ marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.06em", color: varRead.chip ? "#e8b14a" : "rgba(242,237,228,0.55)" }}>{varRead.line}</div>}
```

- [ ] **Step 3: `?v=` bump** on both HTML pages (`coachClientDetail.jsx?v=20260719a` if the live-web PR already claimed `20260719`). EOL check before edit.
- [ ] **Step 4: Verify + commit** — babel parse · LF/CRLF audit.

---

### Task 6: Gates + PR

- [ ] `npm test` full · `tsc --noEmit` · PowerShell `/m/` build · JSX parses · LF audit.
- [ ] Post-migration validation (after the OWNER applies): **seeded synthetic fixtures only** — a test coach + test client with authored habit/snapshot rows; assert bucketing + the fail-closed empty set for an unauthorized caller. Never real member adherence data.
- [ ] PR: `variance: steady-vs-variable weekly adherence — roster chip + Case File + web line (spec 2026-07-19)`. The migration handoff follows the ONE house convention (Global Constraints): reply with ONLY the raw GitHub link — no SQL body, no explanation. The PR *description* separately notes that members never see the band. Wait CI + CodeRabbit; address; squash-merge; re-sync.

---

## Self-review notes

- **Spec coverage:** module+copy (T1) · RPC hardened per spec (T2) · roster chip WATCH-tier (T3) · Case File line (T4) · web parity, no new routes (T5) · synthetic validation (T6). Engine WATCH-tier input for `bsRosterSeverity` is spec'd as MAY — deliberately deferred to a follow-up (record in PR body) rather than piling risk into v1.
- **Type consistency:** `bsVarianceBand` input/output identical across T1 tests, T3 data layer, T5 web fetch; `_var` carries the RESULT object, `varRead` the COPY object — named consistently.
- **Order note:** T5 composes with the live-progress-web PR's loader insertion — whichever lands second skips the duplicate supabase tags (both plans carry the guard instruction).
