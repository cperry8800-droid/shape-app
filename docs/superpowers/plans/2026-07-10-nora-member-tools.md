# Nora Member Action Tools (PR C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status note:** point-in-time build artifact — the source files (and any PR
review hardening) win on divergence.

**Goal:** Members do real things through Nora — log a weigh-in/water/habit, set a reminder, and look up REAL food macros (`find_food` riding the #1648 hybrid search) — all on the existing proposal rails (preview → confirm → audit → undo), with stale-write-guarded undo everywhere including the existing `log_meal` parity fix.

**Architecture:** A small pure module (`memberTools.mjs`: fuzzy habit matcher + water-unit conversion, tested) feeds four new proposal actions in `actions.mjs` (exact `logMealAction` shape, self-scoped `ctx.actor.id`); `find_food` is a READ tool over a shared `searchFoodsServer(q)` helper extracted from the food-search route (one implementation). Tool schemas ride `MEMBER_TOOLS` in the support-chat route — members only, per the spec's per-request registry. Every undo enforces its predicate IN the atomic statement (zero rows = the honest conflict).

**Tech Stack:** existing proposal scaffold (`proposeChange`/`serverRegistry`) · caller-RLS Supabase + `ctx.call` same-origin endpoints · plain-ESM pure module + `node --test`.

## Global Constraints (binding, from the merged spec #1652)

- **Non-members never SEE the tools** — schemas append to `MEMBER_TOOLS` (already member-gated per-request); the WRITE tools also pass through `proposeChange`'s role gate + each `buildPreview` runs the explicit membership check via `ctx.isMember === true` (the route threads it — defense-in-depth).
- **Undo predicates ride IN the atomic UPDATE/DELETE** — zero affected rows = "changed since — nothing undone" (an Error the confirm route surfaces); never read-then-check. Tables without `updated_at` (client_weigh_ins) condition on the full value snapshot instead.
- **`check_habit` fails closed:** exactly one fuzzy match proceeds; none → the error lists their real habit names; multiple → candidates listed, nothing toggled.
- **`find_food` is a LOOKUP** (no proposal): shared `searchFoodsServer(q)` used by BOTH `/api/nutrition/food-search` and the tool — no second fan-out implementation.
- **`log_meal` undo parity fix ships here:** the existing blind snapshot restore gains the same in-statement guard.
- Honest data: previews never invent values; every figure in a preview/diff comes from the member's own rows or their explicit input.
- No migration; no new env; no new API route (`searchFoodsServer` is a lib extraction). Verification per commit: `npx tsc --noEmit` · `npm test` · LF (`tr -cd '\r' | wc -c` = 0); `public/m` is built at deploy (#1470) — CI's Mobile check is the bundle gate (no mobile source changes expected in this PR).

## File Structure

- Create `src/lib/ai/memberTools.mjs` — pure: `matchHabit(habits, query)`, `waterLiters(amount, unit)`, `REMINDER_KINDS`, `validReminderTime(t)`.
- Create `tests/member-tools.test.mjs` (register in `package.json` after `tests/nora-memory.test.mjs`).
- Create `src/lib/food-search-server.ts` — `searchFoodsServer(q): Promise<{results, unavailable?}>` (the fan-out moved verbatim from the route).
- Modify `src/app/api/nutrition/food-search/route.ts` — thin wrapper over the helper (auth + q parsing stay).
- Modify `src/lib/ai/actions.mjs` — `logWeighInAction`, `logWaterAction`, `checkHabitAction`, `setReminderAction` (+ append to `NORA_ACTIONS`); the `logMealAction.undo` guard.
- Modify `src/app/api/support/chat/route.ts` — 5 schemas into `MEMBER_TOOLS`; the 4 write names into `WRITE_TOOLS`; `find_food` branch in `runTool`; thread `isMember` into the propose ctx.
- Modify `docs/WORKLOG.md` — Latest pointer + dated entry.

---

### Task 1: pure `memberTools.mjs` (TDD)

**Interfaces:**
- `matchHabit(habits, query) -> { habit } | { error: 'not_found', names } | { error: 'ambiguous', candidates }` — habits = `[{id, name}]` (active only; the caller filters `archived_at`). Match = case-insensitive: exact name → wins alone even if others substring-match; else substring/word-prefix containment; ONE hit proceeds, several → ambiguous with `[{id, name}]`, zero → not_found with the real names (cap 12).
- `waterLiters(amount, unit) -> number | null` — `'ml'` → /1000, `'oz'` → ×0.0295735, rounded to 3 dp; null on non-finite/≤0/unknown unit (never guesses a unit).
- `REMINDER_KINDS = ['weigh_in','checkin','water','photo','custom']` (mirrors the route); `validReminderTime(t)` = strict `HH:MM` 24h.

- [ ] **Step 1: failing tests** (`tests/member-tools.test.mjs`):

```js
// Nora's member-tool pure logic. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchHabit, waterLiters, REMINDER_KINDS, validReminderTime } from '../src/lib/ai/memberTools.mjs';

const HABITS = [
  { id: 'h1', name: 'Drink 3 glasses of water' },
  { id: 'h2', name: 'Morning walk' },
  { id: 'h3', name: 'Walk the dog' },
];

test('matchHabit: one clear hit proceeds; exact beats substring; ambiguity and misses fail closed', () => {
  assert.equal(matchHabit(HABITS, 'morning walk').habit.id, 'h2'); // exact (case-insensitive)
  assert.equal(matchHabit(HABITS, 'water').habit.id, 'h1');        // single substring hit
  const amb = matchHabit(HABITS, 'walk');                           // h2 + h3
  assert.equal(amb.error, 'ambiguous');
  assert.deepEqual(amb.candidates.map(c => c.id).sort(), ['h2', 'h3']);
  const miss = matchHabit(HABITS, 'meditate');
  assert.equal(miss.error, 'not_found');
  assert.ok(miss.names.includes('Morning walk'));
  assert.equal(matchHabit([], 'anything').error, 'not_found');
  assert.equal(matchHabit(HABITS, '  ').error, 'not_found'); // blank query never matches everything
});

test('waterLiters converts honestly and never guesses', () => {
  assert.equal(waterLiters(500, 'ml'), 0.5);
  assert.equal(waterLiters(16, 'oz'), 0.473);
  assert.equal(waterLiters(0, 'ml'), null);
  assert.equal(waterLiters(-2, 'oz'), null);
  assert.equal(waterLiters(500, 'cups'), null);
  assert.equal(waterLiters('x', 'ml'), null);
});

test('reminder kinds + time mirror the route contract', () => {
  assert.deepEqual(REMINDER_KINDS, ['weigh_in', 'checkin', 'water', 'photo', 'custom']);
  assert.ok(validReminderTime('07:30') && validReminderTime('23:59'));
  assert.ok(!validReminderTime('7:30') && !validReminderTime('24:00') && !validReminderTime('') && !validReminderTime('07:30pm'));
});
```

- [ ] **Step 2:** run → FAIL (module missing). **Step 3: implement:**

```js
// Pure logic for Nora's member action tools (PR C) — node-tested, no deps.
export const REMINDER_KINDS = ['weigh_in', 'checkin', 'water', 'photo', 'custom'];

export function validReminderTime(t) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
}

// 'ml'/'oz' → liters (3 dp); null on anything non-positive/unknown — the tool
// must never guess a unit into a member's hydration record.
export function waterLiters(amount, unit) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unit === 'ml') return Math.round(n) / 1000;
  if (unit === 'oz') return Math.round(n * 29.5735) / 1000;
  return null;
}

// Fuzzy-match ONE of the member's own active habits. Exactly one hit proceeds;
// everything else fails closed (spec #1652) — never guess-toggles.
export function matchHabit(habits, query) {
  const list = (Array.isArray(habits) ? habits : []).filter((h) => h && h.id && typeof h.name === 'string');
  const q = String(query || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const names = list.map((h) => h.name).slice(0, 12);
  if (!q) return { error: 'not_found', names };
  const exact = list.filter((h) => h.name.toLowerCase() === q);
  if (exact.length === 1) return { habit: exact[0] };
  if (exact.length > 1) return { error: 'ambiguous', candidates: exact.map((h) => ({ id: h.id, name: h.name })) };
  const loose = list.filter((h) => h.name.toLowerCase().includes(q));
  if (loose.length === 1) return { habit: loose[0] };
  if (loose.length > 1) return { error: 'ambiguous', candidates: loose.map((h) => ({ id: h.id, name: h.name })) };
  return { error: 'not_found', names };
}
```

- [ ] **Step 4:** tests pass; register in `package.json`; full `npm test` green. **Step 5: commit** (`feat(nora): memberTools — habit matcher, water units, reminder contract (pure, tested)`).

---

### Task 2: `searchFoodsServer` extraction

**Files:** Create `src/lib/food-search-server.ts`; Modify `src/app/api/nutrition/food-search/route.ts`.

- [ ] Move `timedFetch`, `searchFdc`, `searchOff`, the OFF user-agent, and the merge into the new lib exporting `searchFoodsServer(q: string): Promise<{ results: unknown[]; unavailable?: boolean }>` (same keyless-FDC skip + attempted-legs unavailable logic, verbatim; it imports the same mobile `foodSearch.mjs` normalizers). The route keeps ONLY: auth, q parsing (`trim().slice(0,80)`, `<2 → {results:[]}`), and `NextResponse.json(await searchFoodsServer(q))`.
- [ ] Verify: `npx tsc --noEmit` clean; behavior byte-identical (same JSON shapes). Commit (`refactor(nutrition): extract searchFoodsServer — one fan-out for the route + Nora's find_food`).

---

### Task 3: the four proposal tools + the `log_meal` undo guard (`actions.mjs`)

**Interfaces:** each follows `logMealAction`'s exact shape (`name, roles: ['client','trainer','nutritionist','admin'], source: 'nora', buildPreview, execute, undo`), self-scoped to `ctx.actor.id`; each `buildPreview` starts with `if (ctx.isMember !== true) throw new Error('Becoming a member unlocks this.');` (the route threads `isMember` into `makeCtx`'s product — see Task 4).

- [ ] **`logWeighInAction` (`log_weigh_in { weight, unit? }`):** preview reads today's `client_weigh_ins` row (before), validates `weight` (0 < n < 1500), `unit` in `['lb','kg']` (default from the existing row else `'lb'` EXPLICITLY shown in the summary — never silently assumed); diff = before/after weight+unit. Execute: `ctx.supabase.from('client_weigh_ins').upsert({ user_id: ctx.actor.id, logged_on: today, weight, unit }, { onConflict: 'user_id,logged_on' })` + best-effort `ctx.supabase.rpc('award_my_goal_milestones')` (fire-and-forget catch — the same milestone check the sheet fires). Undo (value-snapshot predicate — the table has no `updated_at`): before-row existed → `.update({ weight: b.weight, unit: b.unit }).eq('user_id',…).eq('logged_on', today).eq('weight', a.weight).eq('unit', a.unit).select('user_id')`; no before-row → `.delete()` with the same `.eq(weight/unit)` predicate; zero rows → `throw new Error('Changed since — nothing undone.')`.
- [ ] **`logWaterAction` (`log_water { amount, unit }`):** preview converts via `waterLiters` (null → throw "Tell me the amount in ml or oz."), reads today's `hydration_l` (before) for an honest diff. Execute: `ctx.call('POST', '/api/client/hydration', { deltaL })` (confirm the field name against the route body parse while implementing; 0-clamped there). Undo: **the accumulator inverse, not a restore** — `ctx.call('POST', '/api/client/hydration', { deltaL: -deltaL })` subtracts exactly what was added and PRESERVES concurrent additions (strictly better than a snapshot restore under the spec's no-blind-overwrite rule; document this deviation in the code comment).
- [ ] **`checkHabitAction` (`check_habit { habit }`):** preview fetches active habits (`ctx.supabase.from('user_habits').select('id, name').eq('user_id', ctx.actor.id).is('archived_at', null)`) → `matchHabit`; not_found → throw listing `names`; ambiguous → throw listing candidate names ("Which one? …"); preview names the matched habit. Execute: `ctx.call('POST', '/api/client/habits', { action: 'toggle', id, date: today })`. Undo: the in-statement completion DELETE — read the completions table/columns from the route's toggle branch while implementing (`user_habit_completions`-style), `.delete().eq('user_id', ctx.actor.id).eq(<habit fk>, id).eq(<date col>, today).select(...)`; zero rows → the conflict Error.
- [ ] **`setReminderAction` (`set_reminder { kind, time, days?, label? }`):** preview validates kind ∈ `REMINDER_KINDS`, `validReminderTime(time)`, days defaulting to `[1,2,3,4,5]` (stated in the summary); execute: `ctx.call('POST', '/api/client/reminders', { kind, label, atTime: time, days })` — keep the returned `id` in `afterState`. Undo: `ctx.supabase.from('user_scheduled_reminders').delete().eq('id', afterState.id).eq('user_id', ctx.actor.id).eq('at_time', time).eq('kind', kind).select('id')` (the value predicate = the in-statement guard; an edited reminder survives undo with the conflict Error).
- [ ] **`log_meal` undo parity fix:** replace the blind restore with the guarded statement — chain the after-value predicate per column (`.eq` for numbers, `.is` for nulls) so the restore applies only while the row still holds what execute wrote:

```js
  async undo(ctx, plan) {
    var b = plan.beforeState || {}; var a = plan.afterState || {};
    var q = ctx.supabase
      .from('daily_health_snapshot')
      .update({ calories: b.calories, protein_g: b.protein_g, carbs_g: b.carbs_g, fat_g: b.fat_g, hydration_l: b.hydration_l })
      .eq('user_id', ctx.actor.id)
      .eq('snapshot_date', b.snapshot_date);
    // The stale-write guard rides IN the statement (spec #1652): every column
    // must still hold what execute wrote — a newer edit → zero rows → conflict.
    [['calories', a.calories], ['protein_g', a.protein_g], ['carbs_g', a.carbs_g], ['fat_g', a.fat_g], ['hydration_l', a.hydration_l]]
      .forEach(function (kv) { q = kv[1] == null ? q.is(kv[0], null) : q.eq(kv[0], kv[1]); });
    var res = await q.select('user_id');
    if (res.error || !Array.isArray(res.data) || !res.data.length) throw new Error('Changed since — nothing undone.');
  },
```

- [ ] Append the four actions to `NORA_ACTIONS`. Verify `npm test` (the registry smoke tests pick them up) + `tsc`. Commit (`feat(nora): member tools — log_weigh_in / log_water / check_habit / set_reminder + guarded log_meal undo`).

---

### Task 4: route wiring (`/api/support/chat`)

- [ ] Add the 5 schemas to `MEMBER_TOOLS` (members only): `log_weigh_in` (weight number required; unit enum lb/kg), `log_water` (amount + unit enum ml/oz required), `check_habit` (habit string required — "the habit as the member said it; the server matches their own list"), `set_reminder` (kind enum; time HH:MM; days int[] 0-6; label for custom), `find_food` (query string — "look up real foods + macros BEFORE proposing log_meal for a named food; never invent macros"). Descriptions must tell Nora the four writes DRAFT a confirm card, and that `find_food` results feed a follow-up `log_meal` with the REAL numbers.
- [ ] Add the four write names to `WRITE_TOOLS` (they route through `propose`). Add the `find_food` READ branch to `runTool` (before the unknown-tool fallthrough): members only (`memoryCtx` gate, same as memory tools), `searchFoodsServer(q)` → top 5 of `results` mapped to `{ name, brand, qty, kcal, protein, carbs, fat }` for the model; `unavailable` → `{ error: 'food_search_unavailable' }`.
- [ ] Thread membership into the proposal ctx: where POST builds `memoryCtx`, also pass `isMember` into `makePropose`'s ctx (extend `makeCtx(actor, request)`'s return with `isMember` via a wrapper: `const ctx = { ...makeCtx(actor, request), isMember: membership?.isMember === true }`) so every `buildPreview`'s defense-in-depth check works. NOTE: `makePropose` currently builds ctx per call — pass the precomputed membership in.
- [ ] Extend `MEMBER_PROMPT_NOTE` with one sentence: the member can also log weigh-ins/water/habits, set reminders, and ask for food lookups (writes always show a confirm card).
- [ ] Verify: `tsc` clean · `npm test` green. Negative-path vectors (per spec): signed-out POST carries no new tool; a member `check_habit` with an ambiguous name returns the candidates and toggles nothing (assert via the pure matcher tests + code read). Commit (`feat(nora): member tool schemas + find_food lookup in support chat (members only)`).

---

### Task 5: WORKLOG + PR

- [ ] WORKLOG Latest pointer + dated entry (tools · rails · undo guards · find_food shared fan-out · the wave now COMPLETE pending owner passes). Commit, push `claude/nora-tools-c`, open the PR via REST, watch CI + CodeRabbit + Codex, address findings, squash-merge, keep the branch.

## Self-Review

1. **Spec coverage (§3):** five tools → Tasks 3-4; exact `logMealAction` shape + self-scope → Task 3; fail-closed habit match → Tasks 1+3; `searchFoodsServer` shared extraction → Task 2; in-statement undo guards incl. the `log_meal` parity fix → Task 3; per-request member registry + in-handler gate → Task 4; no migration/env/routes → constraints. **Deviation (documented):** `log_water`'s undo uses the accumulator inverse (negative delta) instead of a snapshot restore — strictly stronger under the no-blind-overwrite rule (preserves concurrent writes).
2. **Placeholders:** the two "confirm while implementing" notes (hydration body field name; completions table columns) are deliberate READ-then-code steps against live source, not TBDs — the files are named and the checks are one grep each.
3. **Type consistency:** `matchHabit` return shapes consumed exactly in Task 3; `waterLiters` null-contract enforced in `logWaterAction`; `MEMBER_TOOLS`/`WRITE_TOOLS` names match the action `name` fields.
