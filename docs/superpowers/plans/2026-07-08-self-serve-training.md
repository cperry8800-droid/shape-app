# Self-Serve Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a coach-less member starter templates, a custom builder for any-discipline sessions & multi-week race schedules, an AI draft assist, an open log-as-you-go session, and Start-this-plan for purchased plans — all writing self-authored rows the existing Train/home/calendar/live-session/+10/auto-share pipeline reads unchanged.

**Architecture:** One migration makes `client_workouts` self-writable (nullable `trainer_id` + client self-CRUD RLS + notify-trigger guard). All non-trivial logic lives in pure, unit-tested `.mjs` modules (the repo's source-of-truth pattern); the mobile JSX + one AI route + `/api/client/plan` consume them. No new tables, one new route.

**Tech Stack:** Vite/Capacitor broadsheet SPA (`mobile-app/`), Next 16 API routes (`src/app/api`), Supabase (Postgres + RLS), `node --test` for the pure modules, OpenAI via the existing `src/lib/ai.ts` `callAI` structured-output plumbing.

## Global Constraints

- **Migrations: reply with only the raw GitHub SQL link** — the owner runs it. Idempotent, safe to re-run.
- **Edit/Write on Windows saves CRLF** — after editing any tracked LF file, run `sed -i 's/\r$//' <file>` before committing.
- **Verify before commit:** JSX parse-check (`node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"` from `mobile-app/`), `npx tsc --noEmit` for TS, `npm test` from repo root. Register every new `tests/*.test.mjs` in the root `package.json` `"test"` script.
- **No colored emoji in new code** — typographic symbols (＋ · → ✓ ◇ ✦) or theme-tinted marks only.
- **Two-tier design rule:** the builder is a FORM → quiet Open Ledger grammar (`.bs-uline` fields, typographic indexes, ONE solid-teal CTA). Not instrument plates.
- **Honest data:** self days credit "Programmed by you" — never a fabricated coach name. Signed-out preview is byte-identical to today except a locked builder door.
- **RLS is the authority.** Self rows are `trainer_id IS NULL`; the migration's `with check` pins `trainer_id IS NULL AND client_id = auth.uid()` on every client write.
- **Row cap:** a program materializes at most `weeks × days-per-week` rows; weeks clamp 1–26, the product is validated `≤ 182` — over-cap BLOCKS the save, never truncates.
- **AI draft is human-in-the-loop:** the model returns a STRUCTURED draft that lands in the builder's review; nothing persists until the member saves.

---

### Task 1: Migration — self-authored `client_workouts`

**Files:**
- Create: `supabase-migrations/2026-07-08-self-authored-workouts.sql`

**Interfaces:**
- Produces: a `client_workouts` table where a signed-in member can INSERT/UPDATE/DELETE rows with `trainer_id IS NULL AND client_id = auth.uid()`; coach rows (`trainer_id` set) stay client-untouchable and self rows stay coach-untouchable; the `client_workouts_notify` trigger fires only for coach rows.

- [ ] **Step 1: Write the migration**

```sql
-- Self-authored training: a member with no coach builds their own workouts,
-- programs, and race schedules. Self rows are client_workouts with a NULL
-- trainer_id, written directly by the member under RLS. Coach rows (trainer_id
-- set) remain client-untouchable and self rows coach-untouchable, both ways.
-- Idempotent, safe to re-run.

-- 1. trainer_id becomes nullable (self rows carry NULL; coach rows keep their id).
alter table public.client_workouts alter column trainer_id drop not null;

-- 2. Client self-CRUD: the caller owns the row (their client_id) AND it is a
--    self row (no trainer). with check pins BOTH so a client can never create a
--    coach row, claim one, or move a row to another member.
drop policy if exists "client_insert_self_workouts" on public.client_workouts;
create policy "client_insert_self_workouts"
  on public.client_workouts for insert
  to authenticated
  with check (client_id = auth.uid() and trainer_id is null);

drop policy if exists "client_update_self_workouts" on public.client_workouts;
create policy "client_update_self_workouts"
  on public.client_workouts for update
  to authenticated
  using (client_id = auth.uid() and trainer_id is null)
  with check (client_id = auth.uid() and trainer_id is null);

drop policy if exists "client_delete_self_workouts" on public.client_workouts;
create policy "client_delete_self_workouts"
  on public.client_workouts for delete
  to authenticated
  using (client_id = auth.uid() and trainer_id is null);

-- 3. Guard the "New workout from your coach" notification so a self-save (or a
--    100-row program materialization) never spams the member. Self rows notify
--    nothing. Redefine the trigger function to early-return on a NULL trainer_id.
create or replace function public.client_workouts_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'published' and new.trainer_id is not null then
    insert into public.notifications (user_id, type, title, body, route, data)
    values (
      new.client_id, 'coach_content', 'New workout from your coach',
      coalesce(new.title, 'A new workout is on your Train tab.'),
      'train',
      jsonb_build_object('workout_id', new.id)
    );
  end if;
  return new;
end;
$$;
```

> **Before writing:** open `supabase-migrations/2026-05-30-coach-content-notifications.sql` and copy the EXACT current body of `client_workouts_notify` (column list, notification `type` value, `route`, `data` shape). Reproduce it verbatim and add ONLY the `and new.trainer_id is not null` guard — do not change the copy or columns. The block above is the shape; the real column names win.

- [ ] **Step 2: Verify against the live function**

Read `supabase-migrations/2026-05-30-coach-content-notifications.sql`. Confirm the trigger name is `client_workouts_notify`, it's `after insert`, and the redefinition above matches its columns 1:1 plus the guard. Fix the SQL to match if it differs.

- [ ] **Step 3: Commit**

```bash
git add supabase-migrations/2026-07-08-self-authored-workouts.sql
git commit -m "feat(train): migration — self-authored client_workouts (nullable trainer_id, client self-CRUD RLS, notify guard)"
```

---

### Task 2: Pure module — `starterTemplates.mjs`

The starter catalog: Sessions (one-tap weekly workouts) and Programs (multi-week
progressive schedules incl. marathon/half/10K/tri/Hyrox). Pure data + a shape
validator. Programs are functions of a member-chosen length so a picked template
is just a seed for the builder.

**Files:**
- Create: `mobile-app/src/services/starterTemplates.mjs`
- Test: `tests/starter-templates.test.mjs`

**Interfaces:**
- Produces:
  - `BS_STARTER_SESSIONS: Array<{ id, name, discipline, moves: Array<{name, sets?, reps?, load?, seg?}> }>` — 10 sessions.
  - `BS_STARTER_PROGRAMS: Array<{ id, name, discipline, defaultWeeks, daysPerWeek, build(weeks): Array<{week:number, days: Array<{dow:number, title, moves}>}> }>` — 6 programs.
  - `bsStarterProgram(id, weeks): { name, discipline, weeks: Array<{week, days:[…]}> } | null` — resolves a program to a concrete N-week schedule (clamps weeks 1–26).
  - `bsValidSessionShape(s): boolean` / `bsValidProgramShape(p): boolean` — used by tests + the builder to reject malformed drafts.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { BS_STARTER_SESSIONS, BS_STARTER_PROGRAMS, bsStarterProgram, bsValidSessionShape } from '../mobile-app/src/services/starterTemplates.mjs';

test('sessions: 10 valid shapes, unique ids', () => {
  assert.equal(BS_STARTER_SESSIONS.length, 10);
  assert.ok(BS_STARTER_SESSIONS.every(bsValidSessionShape));
  assert.equal(new Set(BS_STARTER_SESSIONS.map(s => s.id)).size, 10);
});

test('programs: marathon default is 16 weeks, taper at the end', () => {
  const p = BS_STARTER_PROGRAMS.find(p => p.id === 'marathon');
  assert.equal(p.defaultWeeks, 16);
  const sched = bsStarterProgram('marathon', 16);
  assert.equal(sched.weeks.length, 16);
  // the last week's long run is shorter than the peak (taper)
  const longOf = (wk) => Math.max(...sched.weeks[wk].days.flatMap(d => d.moves.map(m => Number((String(m.seg||'').match(/(\d+)\s*mi/)||[])[1]) || 0)));
  assert.ok(longOf(15) < longOf(12), 'taper: final long run < peak long run');
});

test('bsStarterProgram clamps weeks to 1..26 and returns null for unknown id', () => {
  assert.equal(bsStarterProgram('marathon', 40).weeks.length, 26);
  assert.equal(bsStarterProgram('marathon', 0).weeks.length, 1);
  assert.equal(bsStarterProgram('nope', 8), null);
});

test('hyrox program mixes lift rows and segment rows in a day', () => {
  const sched = bsStarterProgram('hyrox', 8);
  const rows = sched.weeks[3].days.flatMap(d => d.moves);
  assert.ok(rows.some(m => m.seg), 'has a segment row');
  assert.ok(rows.some(m => m.sets != null), 'has a lift row');
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --test tests/starter-templates.test.mjs`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the module**

Author `BS_STARTER_SESSIONS` (Push / Pull / Legs / Upper / Lower / Full-body / Conditioning / Easy run / Tempo run / Intervals) with real move lists — lifts as `{name, sets, reps, load:'—'}`, runs as `{name, seg}`. Author `BS_STARTER_PROGRAMS` with a `build(weeks)` per program that generates progressive content:
- Endurance programs (marathon/half/10K/tri): long run/ride builds ~10%/wk from a base, one cutback every 4th week, a 2–3 week taper at the end (final long ≈ 60% of peak); the weekly pattern rotates easy / tempo / long (+ swim/bike for tri, + brick).
- Hyrox: alternate station-strength days (lift rows) with compromised-running intervals (segment rows), mixing both row types within a day.
- Strength block: linear progression, main lift load note ramps by week.

`bsStarterProgram(id, weeks)` clamps `weeks` to `[1,26]`, finds the program, returns `{ name, discipline, weeks: program.build(clamped) }` or `null`. Validators check required keys + that each move is a lift (`sets`+`reps`) or a segment (`seg`).

- [ ] **Step 4: Run the test, verify pass**

Run: `node --test tests/starter-templates.test.mjs` → PASS. Register the file in `package.json` `"test"`.

- [ ] **Step 5: Commit**

```bash
git add mobile-app/src/services/starterTemplates.mjs tests/starter-templates.test.mjs package.json
git commit -m "feat(train): starterTemplates.mjs — sessions + multi-week race/hybrid programs (pure, tested)"
```

---

### Task 3: Pure module — `trainingBuilder.mjs`

The builder's brain: validate a draft, materialize a PROGRAM draft into dated
`client_workouts` insert-payloads, and slot weekly-repeat sessions onto a week.
Timezone-free — dates in, dates out; the caller supplies "today".

**Files:**
- Create: `mobile-app/src/services/trainingBuilder.mjs`
- Test: `tests/training-builder.test.mjs`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `BS_BUILDER_CAP = 182`.
  - `bsProgramRowCount(weeks, daysPerWeek): number`.
  - `bsProgramFits(weeks, daysPerWeek): boolean` — `weeks∈[1,26] && daysPerWeek∈[1,7] && product ≤ 182`.
  - `bsMoveRow(m): { name, sets, reps, load, seg }` — normalize a builder move to the `payload.exercises` shape (segment rows keep `seg`, blank sets/reps).
  - `bsMaterializeProgram({ name, discipline, weeks, startISO, runId }): Array<insertPayload>` where `insertPayload = { title, description, scheduledDate, payload:{ exercises, program:{ id, name, week, day, weeks, runId }, seg? } }`. Days map onto real dates from `startISO`'s Monday; skips days before `startISO`.
  - `bsRepeatSpec({ name, discipline, repeatDow, moves }): { title, payload:{ exercises, repeatDow } }` — the single-row weekly-repeat shape (no `scheduledDate`).
  - `bsSlotRepeats(rows, weekMondayISO): Array<workout|null>[7]` — given self rows carrying `payload.repeatDow`, return a 7-slot week (used by the deck builder in Task 6).

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsProgramFits, bsProgramRowCount, bsMaterializeProgram, bsSlotRepeats, BS_BUILDER_CAP } from '../mobile-app/src/services/trainingBuilder.mjs';

test('cap: 26x7 = 182 fits; anything over the product is rejected', () => {
  assert.equal(BS_BUILDER_CAP, 182);
  assert.equal(bsProgramRowCount(26, 7), 182);
  assert.ok(bsProgramFits(26, 7));
  assert.ok(!bsProgramFits(27, 7));   // weeks > 26
  assert.ok(!bsProgramFits(26, 8));   // days > 7
});

test('materialize: dates land on the right weekdays from the start Monday', () => {
  const rows = bsMaterializeProgram({
    name: 'Marathon', discipline: 'run', startISO: '2026-07-13', runId: 'r1', // Mon
    weeks: [{ week: 1, days: [{ dow: 0, title: 'Easy', moves: [{ name: 'Run', seg: '5 mi · Z2' }] },
                              { dow: 5, title: 'Long', moves: [{ name: 'Run', seg: '12 mi · Z2' }] }] }],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].scheduledDate, '2026-07-13'); // Mon
  assert.equal(rows[1].scheduledDate, '2026-07-18'); // Sat
  assert.equal(rows[0].payload.program.runId, 'r1');
  assert.equal(rows[0].payload.exercises[0].seg, '5 mi · Z2');
});

test('materialize: days strictly before startISO are skipped', () => {
  const rows = bsMaterializeProgram({
    name: 'P', discipline: 'run', startISO: '2026-07-15', runId: 'r', // Wed
    weeks: [{ week: 1, days: [{ dow: 0, title: 'A', moves: [] }, { dow: 3, title: 'B', moves: [] }] }],
  });
  assert.equal(rows.length, 1);           // Mon dropped (before Wed), Thu kept
  assert.equal(rows[0].scheduledDate, '2026-07-16');
});

test('slotRepeats places a repeatDow row on each of its weekdays', () => {
  const week = bsSlotRepeats([{ title: 'Push', payload: { repeatDow: [0, 3], exercises: [] } }], '2026-07-13');
  assert.equal(week[0].title, 'Push');
  assert.equal(week[3].title, 'Push');
  assert.equal(week[1], null);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `node --test tests/training-builder.test.mjs` → FAIL.

- [ ] **Step 3: Write the module**

Implement each export. `bsMaterializeProgram` computes each day's date as `Monday(startISO) + (week-1)*7 + dow` days, formats `YYYY-MM-DD` locally (mirror `bsAssignIso`), drops dates `< startISO`, and stamps `payload.program`. `bsSlotRepeats` walks rows, fills the 7-slot array at each `repeatDow` index (first-writer-wins per slot). Keep it DST-safe by doing date math on a `Date` set to local midnight and using `setDate`.

- [ ] **Step 4: Run the test, verify pass**

Run: `node --test tests/training-builder.test.mjs` → PASS. Register in `package.json`.

- [ ] **Step 5: Commit**

```bash
git add mobile-app/src/services/trainingBuilder.mjs tests/training-builder.test.mjs package.json
git commit -m "feat(train): trainingBuilder.mjs — cap validation, program materialization, weekly-repeat slotting (pure, tested)"
```

---

### Task 4: Pure module — `planOutline.mjs` (extract the coach parsers)

Extract the `bsAssign*` outline parsers out of `iosAppBroadsheetPros.jsx` into a
shared tested module, add `bsMaterializeOutline` for Start-this-plan, and import
them back into the pros app (one implementation, no twin drift).

**Files:**
- Create: `mobile-app/src/services/planOutline.mjs`
- Test: `tests/plan-outline.test.mjs`
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` (replace the 5 local `bsAssign*` fns with an import)

**Interfaces:**
- Produces: `bsAssignSplitBlock`, `bsAssignExercise`, `bsAssignDayLine`, `bsAssignMeal`, `bsAssignIso` (moved verbatim), plus `bsMaterializeOutline({ plan, startISO, weeks, runId }): Array<insertPayload>` — the split-vs-exercise branch logic from `BSProAssignPage.apply` turned into a pure function that returns self-row payloads (`program:{ id:'plan:'+planId, … }`).

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsAssignExercise, bsAssignDayLine, bsMaterializeOutline } from '../mobile-app/src/services/planOutline.mjs';

test('exercise parse: "Back squat — 4 × 6 · RPE 8"', () => {
  const e = bsAssignExercise('Back squat — 4 × 6 · RPE 8');
  assert.equal(e.name, 'Back squat'); assert.equal(e.sets, '4'); assert.equal(e.reps, '6');
});

test('day line: "Mon — Upper (push)" → dow 0', () => {
  assert.equal(bsAssignDayLine('Mon — Upper (push)').dow, 0);
  assert.equal(bsAssignDayLine('Back squat — 4×6'), null);
});

test('materializeOutline: a 3-day split schedules across N weeks, stamped plan runId', () => {
  const plan = { id: 'p9', name: 'PPL', detail: { blocks: [
    { text: 'Mon — Push' }, { text: 'Wed — Pull' }, { text: 'Fri — Legs' }] } };
  const rows = bsMaterializeOutline({ plan, startISO: '2026-07-13', weeks: 2, runId: 'r1' });
  assert.equal(rows.length, 6);
  assert.ok(rows.every(r => r.payload.program.id === 'plan:p9' && r.payload.program.runId === 'r1'));
  assert.equal(rows[0].scheduledDate, '2026-07-13');
});
```

- [ ] **Step 2: Run it, verify it fails** → FAIL.

- [ ] **Step 3: Move the parsers + write `bsMaterializeOutline`**

Cut `BS_ASSIGN_DOW` + the 5 `bsAssign*` functions out of `iosAppBroadsheetPros.jsx` into `planOutline.mjs` verbatim; export them. `bsMaterializeOutline` reproduces `BSProAssignPage.apply`'s split-vs-exercise branch (isSplit when ≥3 day lines) but returns payloads instead of calling the writer — each with `payload.program:{ id:'plan:'+plan.id, name:plan.name, runId }`.

- [ ] **Step 4: Import back into the pros app**

At the top of `iosAppBroadsheetPros.jsx` add `import { bsAssignExercise, bsAssignDayLine, bsAssignMeal, bsAssignIso } from '../services/planOutline.mjs';` and delete the local definitions. `BSProAssignPage` keeps calling them by the same names.

- [ ] **Step 5: Verify + commit**

Run: `node --test tests/plan-outline.test.mjs` → PASS; parse-check `iosAppBroadsheetPros.jsx`; register in `package.json`.

```bash
git add mobile-app/src/services/planOutline.mjs tests/plan-outline.test.mjs mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx package.json
git commit -m "refactor(coach): extract plan-outline parsers to shared planOutline.mjs + bsMaterializeOutline (tested)"
```

---

### Task 5: Backend writer — `ShapeSelfTraining` + plan route window

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (add the writer; export on `window.ShapeSelfTraining`)
- Modify: `src/app/api/client/plan/route.ts` (window dated rows; pass through `repeatDow`, `seg`, `program`, `selfAuthored`)

**Interfaces:**
- Consumes: `bsMaterializeProgram`, `bsRepeatSpec` (Task 3); `bsMaterializeOutline` (Task 4).
- Produces:
  - `window.ShapeSelfTraining = { saveSession, saveProgram, startPurchasedPlan, remove, removeProgram, list }`.
    - `saveSession({ name, discipline, repeatDow, moves, time })` → one INSERT (self row, `trainer_id:null`, `payload.repeatDow`, `payload.exercises`, optional `payload.time`).
    - `saveProgram({ name, discipline, weeks, startISO })` → materialize (Task 3) then batch-insert; returns `{ runId, count }`.
    - `startPurchasedPlan({ plan, startISO, weeks })` → materialize outline (Task 4), insert the NEW block, then delete the prior `plan:<id>` rows with a different `runId` (atomic-in-effect: new lands first).
    - `remove(id)` / `removeProgram(programId)` → delete self rows.
    - `list()` → the member's self rows (for edit/delete).
  - `/api/client/plan` returns each workout with `repeatDow: number[]|null`, `program: {id,name,week,day,weeks,runId}|null`, `selfAuthored: boolean`, and each exercise with `seg: string`.

- [ ] **Step 1: Add `ShapeSelfTraining` to shapeBackend.js**

After the `assignClientWorkout` definition, add self-row helpers that INSERT with `trainer_id: null, client_id: state.user.id, kind: 'custom', status: 'published'`. `saveProgram`/`startPurchasedPlan` generate a `runId` (a short random string, e.g. `'p'+Math.random().toString(36).slice(2,9)` — Math.random is fine in app runtime, only the workflow tool forbids it), insert every row, and only on full success delete the prior block. Expose `window.ShapeSelfTraining`. Also add it to the module's `export {}` block if one lists helpers.

- [ ] **Step 2: Window + pass-through in the plan route**

In `src/app/api/client/plan/route.ts`: change the training query to window dated rows — `.or('scheduled_date.gte.<weekStart>,scheduled_date.is.null')` (keep the existing `.limit(60)` — with the window it can't starve). In the `workouts.map`, add `repeatDow` (from `payload.repeatDow` when an int array, else null), `selfAuthored: w.trainer_id === null`, `program` (from `payload.program`), and add `seg: e.seg != null ? String(e.seg) : ''` to `mapExercises`.

- [ ] **Step 3: Verify**

Run `npx tsc --noEmit` (route typechecks). Parse-check `shapeBackend.js`. There's no unit test for the route (it's an integration boundary; CI's `next build` covers compile). Manually confirm the `.or()` filter string uses the computed `weekStart`.

- [ ] **Step 4: Commit**

```bash
git add mobile-app/src/services/shapeBackend.js src/app/api/client/plan/route.ts
git commit -m "feat(train): ShapeSelfTraining writer + windowed plan route (repeatDow/seg/program/selfAuthored passthrough)"
```

---

### Task 6: Deck rendering — weekly-repeat + program rows on Train

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (`bsBuildTrainProgram`, ~line 3263; the `BSClientTrain` empty-state gate ~3620–3646; the hero coach line ~3691–3695)

**Interfaces:**
- Consumes: `bsSlotRepeats` (Task 3); `/api/client/plan` `selfAuthored`/`program`/`repeatDow`/`seg` (Task 5).

- [ ] **Step 1: Slot repeats + segments in `bsBuildTrainProgram`**

Before the dated-slot loop, run `bsSlotRepeats` over workouts carrying `repeatDow` (import it) and fill empty week slots with them (dated rows win the slot). In `moves`, when an exercise has `seg`, render it as the scheme line (`s: e.seg`, `l: ''`) so segment rows show "10 mi · Z2" instead of a load. Tag self rows `YOURS` (`w.selfAuthored`) and set `coachLine`/byline to "Programmed by you" (or the `program.name · Wn` when `w.program`), never a coach name.

- [ ] **Step 2: Honest self byline on the hero**

In `BSClientTrain` the hero currently hardcodes "Jordan Chen / Coach · Trainer". Gate that block: show it only when the day is a real coach workout (`!cur.selfAuthored` AND a live coach exists); for self days render "Programmed by you" (or `cur.program.name · Week n`). Thread `selfAuthored`/`program` through the day objects `bsBuildTrainProgram` returns.

- [ ] **Step 3: Verify + commit**

Parse-check; `npm test` (Task 3 already covers the slotting logic). Visually confirm nothing regresses for coach-assigned weeks.

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(train): render weekly-repeat + program self rows on the deck; honest self byline"
```

---

### Task 7: The builder — `BSWorkoutBuilder` + Train empty-state door

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (new `BSWorkoutBuilder` component; wire the Train empty-state door + week-strip ＋)

**Interfaces:**
- Consumes: `BS_STARTER_SESSIONS`, `BS_STARTER_PROGRAMS`, `bsStarterProgram` (Task 2); `bsProgramFits`, `bsMoveRow` (Task 3); `window.ShapeSelfTraining` (Task 5).

- [ ] **Step 1: Build the component**

Full-page (`BSPage`, quiet Open Ledger form). Mode index `SESSION` / `PROGRAM`.
- **SESSION**: name (`.bs-uline`), discipline chips (Strength/Run/Ride/Swim/Row/Conditioning/Hybrid), weekday toggles (→ `repeatDow`), optional time, move rows. Each move row is Lift (name + sets × reps + load) or Segment (name + dist/dur + zone → `seg`); a per-row type toggle; move name from a datalist of `BS_MOVE_SWAPS` keys + template moves, or free-type. Save → `ShapeSelfTraining.saveSession`.
- **PROGRAM**: name, discipline, a **length stepper (1–26, clamped)** OR a race-date picker (weeks derive from today→date), days-per-week pattern editor, then a week-by-week review list (expand a week → edit any day's rows). Live `bsProgramFits(weeks, days)` gate — over-cap disables Save with "That's {n} sessions — trim to 182 or fewer." Save → `ShapeSelfTraining.saveProgram`. Picking a starter Program prefills PROGRAM via `bsStarterProgram(id, weeks)`.
- One solid-teal CTA; Cancel is a text-action. On save, close + refresh the Train plan (fire the plan-cache invalidation the app uses).

- [ ] **Step 2: Wire the Train empty-state door**

Replace the `EMPTY_PROGRAM` "No workout assigned" render path in `BSClientTrain` with a **"Build your week."** door: template shelves (Sessions + Programs from Task 2), **BUILD YOUR OWN →**, **✦ Draft it for me** (Task 9 wires the sheet), and **Start an open session** (Task 8). Signed-out preview keeps the demo program (gate on `bsTrainSignedIn`) and shows a locked "Join Shape" door. Once a week exists, a `＋` text-action on the week-strip row opens the builder. Editing a self day offers `EDIT · YOURS` → reopen the builder on that row.

- [ ] **Step 3: Verify + commit**

Parse-check; mobile build (`cd mobile-app && $env:VITE_BASE='/m/'; npm run build` on PowerShell — or note CI builds it). Confirm signed-out is unchanged.

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(train): BSWorkoutBuilder (sessions + multi-week programs, any discipline) + Build-your-week door"
```

---

### Task 8: Open session — log as you go

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (`BSSession` ~19695; add ＋ Add move; add the deck entry point)

**Interfaces:**
- Consumes: existing `saveWorkoutSessionLog` path (unchanged).

- [ ] **Step 1: ＋ Add move in `BSSession`**

Add an `addMove()` (mirrors `addSet` at ~19856) appending `{ n, m: '', s: '', l: '', sets: 1 }` to `moves`, plus a small move-name input for the new row (datalist as in the builder). Render an "＋ Add move" text-action after the last move (next to "＋ Add set"). Allow launching with `moves:[]` and `title:'Open session'`.

- [ ] **Step 2: Deck entry point**

Add "Start an open session" as a text-action on the Train deck (any day) → `setSession(true)` with an empty move list. It saves through the identical `saveWorkoutSessionLog` path — +10, dedup, auto-share all inherited.

- [ ] **Step 3: Verify + commit**

Parse-check. Confirm an empty-start session saves without error (the completed-sets math already tolerates 0).

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(train): open log-as-you-go session (＋ Add move, empty start)"
```

---

### Task 9: AI draft — `/api/ai/draft-program` + builder wiring

**Files:**
- Create: `src/app/api/ai/draft-program/route.ts` (clone the structure of `src/app/api/ai/generate-plan/route.ts`)
- Modify: `mobile-app/src/services/shapeBackend.js` (add `ShapeTrainingAI.draft`)
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (the ✦ Draft sheet in the builder)
- Modify: `src/lib/warroom.ts` (register the route in `RAW_ROUTES`)

**Interfaces:**
- Consumes: `callAI`, `hasOpenAIKey` (`src/lib/ai.ts`).
- Produces: `POST /api/ai/draft-program { goal, weeks, daysPerWeek, discipline, experience }` → `{ program: { name, discipline, weeks: [{week, days:[{dow, title, moves:[{name, sets?, reps?, load?, seg?}]}]}] } }` — the EXACT builder PROGRAM shape. `ShapeTrainingAI.draft(args)` returns it or `null`.

- [ ] **Step 1: Write the route**

Clone `generate-plan/route.ts`. Define a `json_schema` matching the builder PROGRAM shape (weeks → days → typed moves). System prompt: "Generate a safe, progressive training schedule the member will review and edit. Return only JSON matching the schema. Include a taper for endurance goals." Membership: the `/api/ai` prefix is already gated by the proxy — no extra gate needed, but require an authenticated user (`resolveActor` or `currentUser`). Clamp the returned `weeks.length` to the requested weeks and reject/trim if `weeks × maxDaysPerWeek > 182`. On `!hasOpenAIKey()` or a parse failure return `{ program: null, error: 'unavailable' }` (never a silent empty program).

- [ ] **Step 2: Client helper + builder sheet**

Add `ShapeTrainingAI.draft` (POST via `sessionsAuthHeaders`, returns `data.program`). In `BSWorkoutBuilder` add a ✦ Draft sheet: goal free-text, days/week, experience chips, duration prefilled from the length/race-date controls. On submit → `ShapeTrainingAI.draft` → drop the result into PROGRAM mode's week-by-week review (nothing saved). Failure shows "Drafting is unavailable — build manually or try again."

- [ ] **Step 3: Register + verify + commit**

Add the route to `RAW_ROUTES` in `src/lib/warroom.ts`. `npx tsc --noEmit`; parse-check the JSX.

```bash
git add src/app/api/ai/draft-program/route.ts mobile-app/src/services/shapeBackend.js mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx src/lib/warroom.ts
git commit -m "feat(train): ✦ Draft it for me — /api/ai/draft-program structured draft into the builder review"
```

---

### Task 10: Start a purchased plan (Library)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (`BSClientLibrary` / `BSLibraryDetail` — the owned-plan row)

**Interfaces:**
- Consumes: `window.ShapeSelfTraining.startPurchasedPlan` (Task 5); `ShapeCoachPlans.purchased` (existing, returns `detail`).

- [ ] **Step 1: START THIS PLAN action**

On an owned plan in the Library detail, add **START THIS PLAN →** opening a small sheet: start-Monday picker + a weeks override (when the outline is week-based). Confirm → `ShapeSelfTraining.startPurchasedPlan({ plan, startISO, weeks })`. On success toast "On your Train tab · from {Mon d}" and invalidate the plan cache. Re-starting the same plan replaces its block (Task 5 handles the atomic swap).

- [ ] **Step 2: Verify + commit**

Parse-check; confirm a plan with a 3-day split materializes onto the calendar and a re-start doesn't duplicate.

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(train): Start a purchased plan onto the calendar (atomic re-start)"
```

---

### Task 11: Republish `public/m`, final verify, WORKLOG

**Files:**
- Modify: `public/m/**` (rebuilt bundle) — OR rely on CI's Linux build
- Modify: `docs/WORKLOG.md` (dated entry)

- [ ] **Step 1: Full verify**

From repo root: `npm test` (all suites incl. the 3 new ones green). `npx tsc --noEmit`. From `mobile-app/` on PowerShell: `$env:VITE_BASE='/m/'; npm run build`. Per the WORKLOG convention the CI Linux build is the authoritative `public/m` sync — let CI rebuild it, or copy the CI artifact; do NOT commit a local Windows build of the bundle.

- [ ] **Step 2: WORKLOG entry**

Add a dated `### 2026-07-08 — Self-serve training` entry: the migration, the pure modules, the four features, the guardrails (row cap, notify guard, windowed plan route, atomic plan restart), and the open follow-ups (coach visibility into self plans; website parity).

- [ ] **Step 3: Commit + open PR**

```bash
sed -i 's/\r$//' docs/WORKLOG.md
git add docs/WORKLOG.md public/m 2>/dev/null; git commit -m "docs(worklog): self-serve training wave"
```

Open the PR against `main`; wait for CI green + CodeRabbit; address findings; post the migration raw link for the owner.

---

## Self-Review

**Spec coverage:**
- Foundation migration → Task 1 ✓ (nullable trainer_id, self-CRUD RLS, notify guard).
- Plan-route window + passthrough → Task 5 ✓.
- Starter templates (sessions + programs incl. marathon/tri/Hyrox) → Task 2 ✓.
- Custom builder, any discipline, lift+segment rows, weekly-repeat + materialized program, member-chosen length/race date, row-cap validation → Tasks 3 + 7 ✓.
- AI draft (structured, human-in-the-loop) → Task 9 ✓.
- Open session → Task 8 ✓.
- Start purchased plans (shared parsers, atomic restart) → Tasks 4 + 10 ✓.
- Coach interplay (coach wins the slot, honest self byline) → Task 6 ✓.
- Guardrails / signed-out preview → threaded through 6/7; RLS in 1.
- Acceptance criteria 1–9 → each maps to a task's deliverable.

**Placeholder scan:** the pure-module tasks carry real test + implementation direction; the JSX tasks name exact files/anchors/interfaces and the component contract. The UI bodies (builder form, sheets) are written in-context against the live 20k-line file rather than transcribed here — deliberate: spelling every JSX line in the plan would be less reliable than building against the real theme tokens/components, and the interfaces + design rules fully constrain them.

**Type consistency:** `insertPayload.payload.program:{id,name,week,day,weeks,runId}` is used identically in Tasks 3, 4, 5, 6. `seg` is the segment field everywhere (module, route, deck). `repeatDow` is `number[]` (0=Mon) throughout. `bsProgramFits(weeks, daysPerWeek)` signature matches its Task-7 call.

**Scope:** one plan, one feature, sequential tasks each independently testable. Out-of-scope items (meal self-authoring, coach read of self plans, website builder parity) are explicitly deferred.
