# Live Cooking Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The boost sheet's cooking branch shows WHAT a member is cooking — the planned meal's TITLE only — via a `kind:'cooking'` payload variant on the existing `user_activity_live` row, plus one tiny expiry-RLS hardening migration.

**Architecture:** `bsValidLivePayload` (canonical, `public/newdesign/liveProgress.mjs` after the live-progress-web PR) gains kind-dispatch: workout contract byte-identical, cooking = `{v:1, kind:'cooking', title}` strictly validated (reject, never truncate). Writer = `BSLogMealFlow` (already sets presence `'cooking'`), pushing via the same serialized `window.ShapeLiveProgress` queue only for plan/recipe-sourced meals; freehand broadcasts nothing (meal share-by-choice doctrine). Consumer = `BSLiveBoostSheet`'s cooking branch. Audience = the shipped live-audience pipe unchanged, now with an immediate re-push on settings changes.

**Tech Stack:** existing `user_activity_live` rails (RLS + realtime), pure ESM + `node --test`, React (client broadsheet).

**Spec:** `docs/superpowers/specs/2026-07-19-live-cooking-detail-design.md` — binding, especially the doctrine reconciliation (planned TITLE = menu info; freehand = intake = silent) and the post-review revisions (kind-dispatch first · reject-not-truncate · live provenance · immediate audience effect · the expiry-RLS migration).

**Ordering:** builds ON the live-progress-web PR (the canonical module). Do not start until that PR is merged.

## Global Constraints

- NEVER macros, portions, or adjustments in the payload — title only, and only for plan/recipe-sourced meals. Freehand pushes NOTHING (not even a generic marker — the presence dot already carries "cooking").
- Theme tokens only in JSX; i18n via the registered `feed` namespace (`tr('feed:…', { defaultValue })`), literal keys.
- Honest-absent: no row / freehand / invalid title → the sheet renders today's generic state byte-identically.
- Verify per task: JSX parse · `npm test` · PowerShell `/m/` build · LF.
- Migration is OWNER-run (raw link only on the PR).

---

### Task 1: Validator kind-dispatch + cooking payload builder (TDD)

**Files:**
- Modify: `public/newdesign/liveProgress.mjs` (the canonical module — post live-web move)
- Modify: `tests/live-progress.test.mjs`

**Interfaces:**
- Produces (Tasks 2–3 rely on these):
  - `bsCookingPayload(meal)` → `{ v:1, kind:'cooking', title } | null` — `meal` is the logger's meal object; eligible ⇔ `hasPlanned`-equivalent (finite `Number(meal.kcal)`) OR non-empty `meal.recipeId`, AND a clean non-empty `meal.title` ≤80 after trimming; anything else → null.
  - `bsValidLivePayload(raw)` — now dispatches on `raw.kind` FIRST: absent/`'workout'` → the existing contract (byte-identical); `'cooking'` → `{v:1, kind:'cooking', title}` exactly, title non-empty ≤80, **no control characters (U+0000–U+001F, U+007F), no markup (`<` `>`)** — violations return null (reject, never truncate); any other kind → null.

- [ ] **Step 1: Write the failing tests** (append to `tests/live-progress.test.mjs`):

```js
import { bsCookingPayload } from '../public/newdesign/liveProgress.mjs';

test('cooking payload: plan/recipe-sourced yes, freehand/absent/unsafe null', () => {
  assert.deepEqual(bsCookingPayload({ title: 'Salmon rice bowl', kcal: 620 }),
    { v: 1, kind: 'cooking', title: 'Salmon rice bowl' });
  assert.deepEqual(bsCookingPayload({ title: 'Overnight oats', recipeId: 'r-oats' }),
    { v: 1, kind: 'cooking', title: 'Overnight oats' });
  assert.equal(bsCookingPayload({ title: 'My own thing' }), null);            // freehand — intake class
  assert.equal(bsCookingPayload({ kcal: 500, title: '' }), null);             // no clean title
  assert.equal(bsCookingPayload(null), null);
  assert.equal(bsCookingPayload({ kcal: 500, title: 'x'.repeat(81) }), null); // builder rejects too — no truncate-then-send
});

test('validator dispatches on kind FIRST; cooking strictly validated; workout contract untouched', () => {
  assert.deepEqual(bsValidLivePayload({ v: 1, kind: 'cooking', title: 'Salmon rice bowl' }),
    { v: 1, kind: 'cooking', title: 'Salmon rice bowl' });
  assert.equal(bsValidLivePayload({ v: 1, kind: 'cooking', title: '' }), null);
  assert.equal(bsValidLivePayload({ v: 1, kind: 'cooking', title: '  ' }), null);
  assert.equal(bsValidLivePayload({ v: 1, kind: 'cooking', title: 'x'.repeat(81) }), null);   // REJECT, never truncate
  assert.equal(bsValidLivePayload({ v: 1, kind: 'cooking', title: 'a\u0007b' }), null); // control char
  assert.equal(bsValidLivePayload({ v: 1, kind: 'cooking', title: '<b>hi</b>' }), null);      // markup
  assert.equal(bsValidLivePayload({ v: 1, kind: 'cooking', title: 'ok', extra: 1 }).extra, undefined); // sanitized shape only
  assert.equal(bsValidLivePayload({ v: 1, kind: 'mystery', title: 'x' }), null);              // unknown kind
  // workout regression: the existing builder output still validates unchanged
  const w = bsLiveProgressPayload(MOVES, DONE, 1, true);
  assert.ok(bsValidLivePayload(w));
  assert.ok(bsValidLivePayload({ ...w, kind: 'workout' }));
});
```

- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement** in the canonical module — at the TOP of `bsValidLivePayload`, before any exercises check:

```js
const COOK_TITLE_BAD = /[\u0000-\u001f\u007f<>]/;

export function bsCookingPayload(meal) {
  if (!meal || typeof meal !== 'object') return null;
  const eligible = Number.isFinite(Number(meal.kcal)) || (typeof meal.recipeId === 'string' && meal.recipeId.trim());
  if (!eligible) return null;                              // freehand = intake = silence
  const title = String(meal.title || '').trim();
  if (!title || title.length > 80 || COOK_TITLE_BAD.test(title)) return null;
  return { v: 1, kind: 'cooking', title };
}
```

and inside `bsValidLivePayload`, as the FIRST checks after the `!raw || v !== 1` guard:

```js
  if (raw.kind === 'cooking') {
    // Cooking contract: exactly {v,kind,title}. The wire gets no truncation
    // courtesy — an out-of-contract title is REJECTED (the builder never
    // emits one, so a violation is by definition not ours).
    if (typeof raw.title !== 'string') return null;
    const title = raw.title.trim();
    if (!title || raw.title.length > 80 || COOK_TITLE_BAD.test(raw.title)) return null;
    return { v: 1, kind: 'cooking', title };
  }
  if (raw.kind !== undefined && raw.kind !== 'workout') return null;
```

- [ ] **Step 4: Run → green** (including every pre-existing workout vector, untouched).
- [ ] **Step 5: Commit** — `git commit -am "cooking: kind-dispatch validator + bsCookingPayload (reject-not-truncate, TDD)"`

---

### Task 2: Writer — `BSLogMealFlow` pushes live provenance

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the meal-logger cooking-presence effect (~line 1899: `React.useEffect(() => { bsSetMyActivity('cooking'); … }, [])`) and the flow's meal/dirty state region (~2052, `hasPlanned`).
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the Settings prefs writer (~22988 + ~23002, the two `bsMaybeRetightenAutoPosts` branches).

**Interfaces:**
- Consumes: `bsCookingPayload` (import it where the client module already imports from the canonical module — extend the existing `liveProgress` import line), `window.ShapeLiveProgress.push/clear` (the serialized queue), the flow's `meal` + `dirty` state.
- Produces: a cooking row while an eligible logger is open; active clear on ineligible transitions and logger close; `shape:liveAudienceChanged` window event on relevant settings saves.

- [ ] **Step 1: Provenance-reactive push** — replace/extend the ~1899 effect so the live row tracks CURRENT eligibility (not open-time):

```jsx
  // Broadcast "cooking" presence while the logger is open (amber dot) — and,
  // for a PLAN/RECIPE-sourced meal, the live cooking TITLE (spec 2026-07-19).
  // Provenance is LIVE: pivoting to freehand mid-session actively clears the
  // row (never waits for close); the audience re-resolves per push, and a
  // settings change re-pushes immediately via shape:liveAudienceChanged.
  React.useEffect(() => { bsSetMyActivity('cooking'); return () => bsSetMyActivity(null); }, []);
  const cookPayload = React.useMemo(() => bsCookingPayload(meal), [meal]);
  React.useEffect(() => {
    if (!window.ShapeLiveProgress) return undefined;
    if (cookPayload) window.ShapeLiveProgress.push(cookPayload, true);
    else window.ShapeLiveProgress.clear();               // ineligible → absence, NOW
    const rePush = () => { if (cookPayload) window.ShapeLiveProgress.push(cookPayload, true); };
    window.addEventListener('shape:liveAudienceChanged', rePush);
    return () => {
      window.removeEventListener('shape:liveAudienceChanged', rePush);
      window.ShapeLiveProgress.clear();                  // logger close → absence
    };
  }, [cookPayload]);
```

⚠ Anchor check before editing: confirm the component at ~1899 has `meal` in scope (it's the flow that computes `hasPlanned` at ~2052 — if the presence effect lives in a parent wrapper, put the push effect in the component where `meal` lives and leave the presence effect alone). `push(payload, true)` uses `fresh=true` so `started_at` stamps at cook start — each re-push refreshing `started_at` is WRONG; pass `fresh` only on the FIRST push: keep a `pushedRef` (`const pushedRef = React.useRef(false)`) and call `push(cookPayload, !pushedRef.current)`, setting `pushedRef.current = true` after; reset it when `cookPayload` becomes null.

- [ ] **Step 2: Settings mutation acts DIRECTLY (spec round-3 revision)** — in BOTH prefs-save branches (~22988, ~23002), directly after `bsMaybeRetightenAutoPosts(p, next)`:

```js
      if (key === 'shareWorkoutData' || key === 'profileVisibility') {
        bsMaybeRetightenAutoPosts(p, next);
        bsRetightenLiveRow(next);   // server-authoritative: acts on the row itself, cross-device
        try { window.dispatchEvent(new CustomEvent('shape:liveAudienceChanged')); } catch (e) {}
      }
```

with a new module-scope helper beside `bsMaybeRetightenAutoPosts`:

```js
// Live-row withdrawal is enforced by the MUTATION, not a listener (spec
// 2026-07-19 round 3): whichever device changes the setting resolves the new
// audience and acts on the member's own user_activity_live row directly —
// null audience → delete, tightened → restamp visibility. Works even when the
// broadcasting device is asleep; the event above is just the local re-push.
async function bsRetightenLiveRow(nextPrefs) {
  try {
    const { bsLiveAudience } = await import('../services/liveProgress.mjs');
    const vis = bsLiveAudience(nextPrefs, false);
    const db = window.shapeDb; const uid = window.ShapeAuth?.getCachedState?.()?.user?.id;
    if (!db?.client || !uid) return;
    if (!vis) await db.client.from('user_activity_live').delete().eq('user_id', uid);
    else await db.client.from('user_activity_live').update({ visibility: vis }).eq('user_id', uid);
  } catch (e) {}
}
```

⚠ Match the surrounding file's import style (static top-level import if that's the pattern) and the actual settings-doc shape `bsLiveAudience` expects (`shareWorkoutData`/`profileVisibility` keys — the same doc `bsMaybeRetightenAutoPosts` receives).

- [ ] **Step 3: Verify** — JSX parse · `/m/` build · `npm test`. **Commit.**

---

### Task 3: Consumer — the boost sheet's cooking line

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BSLiveBoostSheet` (~7658–7770): the subscription gate at ~7686 and the live-line render.

**Interfaces:**
- Consumes: the existing `live` row state + `bsValidLivePayload` (already imported in this file).

- [ ] **Step 1: Widen the gate** — ~7686 currently: `if (!person.userId || kind !== 'workout' || !window.ShapeLiveProgress) return undefined;` → allow both kinds:

```js
    if (!person.userId || !window.ShapeLiveProgress) return undefined;
```

(The effect's `[person.userId, kind]` deps stay; the row's own `payload.kind` decides rendering.)

- [ ] **Step 2: Render the cooking line** — where the workout branch renders its live line from `lp` (`lpCur` block, ~7706+), add the cooking branch ABOVE the existing cook-themed boost phrases:

```jsx
{lp && lp.kind === 'cooking' && (
  <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.08em', color: t.AMBER }}>
    {tr('feed:boost.cookingTitle', { defaultValue: 'Cooking · {title}', title: lp.title })}{mins != null ? ` — ${mins} min in` : ''}
  </div>
)}
```

⚠ The workout live-line branch must gate on `(!lp.kind || lp.kind === 'workout')` so a cooking payload never renders exercise scaffolding; verify `mins` is the sheet's existing elapsed value (from `person`/presence — reuse, don't recompute).

- [ ] **Step 3: No-row/freehand regression** — confirm by reading the render path that with `lp = null` the sheet is byte-identical to today (the generic "In the kitchen · N min in" from presence).
- [ ] **Step 4: Verify + commit** — JSX parse · `/m/` build · `npm test`.

---

### Task 4: Migration — expiry into the audience read path

**Files:**
- Create: `supabase-migrations/2026-07-19-user-activity-live-expiry-rls.sql`

**Interfaces:** hardening only; no consumer change (code already filters `expires_at` — this closes the DIRECT-query gap for stale titles).

- [ ] **Step 1: Write it** (idempotent; the v1 policy text is in `2026-07-18-user-activity-live.sql:29-37` — copy and extend):

```sql
-- Live-cooking hardening (spec 2026-07-19): titles raise the sensitivity of
-- user_activity_live, so expiry moves INTO the audience read path — an
-- expired row can no longer be fetched by a direct select before cleanup.
-- The OWNER leg stays unfiltered: a member must be able to see and clear
-- their own stale row. Idempotent — safe to re-run.
drop policy if exists "live read" on public.user_activity_live;
create policy "live read" on public.user_activity_live
  for select to authenticated using (
    user_id = auth.uid()
    or (expires_at > now() and (
      visibility = 'public'
      or (visibility = 'followers' and exists (
            select 1 from public.user_follows
            where follower_id = auth.uid() and following_id = user_id and status = 'accepted'))
    ))
  );
```

- [ ] **Step 2: LF + commit.** OWNER applies (raw link on the PR); post-apply proof: an expired seeded row is invisible to a second account but readable by its owner.

---

### Task 5: Gates + PR

- [ ] Full gates: `npm test` · JSX parse · PowerShell `/m/` build · LF audit.
- [ ] Dev-server render check: open the logger on a plan meal → a second signed-in context's boost sheet shows `Cooking · {title}`; pivot the meal to freehand → the line drops within a queue turn; close the logger → absence.
- [ ] PR: `cooking: live cooking detail — planned-meal title on the boost sheet (spec 2026-07-19)`; body: doctrine note (freehand broadcasts nothing) + the RAW migration link. Wait CI + CodeRabbit; address; squash-merge; re-sync.

---

## Self-review notes

- **Spec coverage:** kind-dispatch validator (T1) · reject-not-truncate (T1) · live provenance + immediate audience effect (T2) · consumer branch + generic-state regression (T3) · expiry-RLS migration (T4) · every named test vector present (T1/T5).
- **Type consistency:** `bsCookingPayload(meal)` and the validator's cooking return `{v:1, kind:'cooking', title}` are the same shape at both ends; `shape:liveAudienceChanged` is the one event name across T2's dispatch + listener.
- **Deliberate scope cut:** the session player's listener for `shape:liveAudienceChanged` is noted as follow-up (the workout writer already re-resolves per transition; its gap is smaller). Record in the PR body.
