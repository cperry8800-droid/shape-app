# Live workout progress — the boost sender (and the coach) see the session as it happens

**Date:** 2026-07-18 · **Status:** owner-approved direction (share-rule audience · Approach A transport) · **Scope:** mobile only

## Why

Two surfaces already promise this and neither delivers it:

- **The boost sheet** (`BSLiveBoostSheet`, #1514) opens on a mid-workout member and shows only the activity kind + "N min in". The registered War Room v2 item: *let a boost sender SEE the workout in progress (current exercise / set count live)*.
- **The coach live-watch** (`BSProLiveWatch`) renders a full move grid with a NOW marker — **all of it hardcoded demo data**, including the elapsed clock. A coach "watching live" is watching fiction.

The session player (`BSSession`) holds everything both need — `moves` (names + schemes), `moveIdx`, the `completed` map, rest state — and already writes presence (`setActivity('workout')` on start, cleared on end). What's missing is one broadcast channel with an enforced audience.

## Owner decisions (ratified in brainstorm, 2026-07-18)

1. **Audience = the existing share rule, strictly.** `bsWorkoutSharePrivacy(doc)` (Share workout data × profile visibility) decides: `public` → any signed-in member · `followers` → accepted followers only · `private` → **no live detail exists at all** (the dot + elapsed stay, as today). **No coach exception** — a coach sees live detail only if they pass the same audience test. **No new toggle** — the two Settings the member already owns express intent for live exactly as they do for post-hoc sharing.
2. **No loads / no RPE in the v1 payload.** The audience can include followers or the public; load figures are the intimate part. The coach still reads real loads post-hoc from session logs. A richer coach-only channel is an explicit v2 candidate, not this build.
3. **Both consumers in one wave** — the boost sheet's live line AND the coach console's real mode ride the same row.
4. **Website: out of scope** (no boost surface there). Register as a follow-up only if wanted.

## Transport — Approach A: a dedicated `user_activity_live` table

Rejected alternatives, for the record: **(B)** a `detail` jsonb column on `user_activity` — RLS is row-level, not column-level, and that table is authenticated-read, so a direct `select detail` (and every realtime push) leaks set data to all signed-in members. **(C)** ephemeral Supabase broadcast channels — no RLS enforcement (channel names are guessable), and no late-joiner state, when the boost sheet opening **mid-workout** is the primary case.

### Migration `2026-07-18-user-activity-live.sql` (additive · idempotent · OWNER runs it)

```sql
create table if not exists public.user_activity_live (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  visibility text not null check (visibility in ('public','followers')),
  payload    jsonb not null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours'
);
```

- **`visibility` is stamped at write time by the owner's client** — the same client-resolves-its-own-rule pattern auto-share uses (#1613). `private` never reaches the table (there is deliberately no `'private'` in the CHECK: a private member's row is *absent*, not filtered — absence can't leak).
- **RLS** — owner: `for all using (user_id = auth.uid()) with check (user_id = auth.uid())`. Read for others:

```sql
create policy "live read" on public.user_activity_live for select to authenticated using (
  user_id = auth.uid()
  or visibility = 'public'
  or (visibility = 'followers' and exists (
        select 1 from public.user_follows
        where follower_id = auth.uid() and following_id = user_id and status = 'accepted'))
);
```

- **Realtime**: add to `supabase_realtime` (same idempotent `pg_publication_tables` guard as `user_activity`). Supabase `postgres_changes` enforces RLS per subscriber, so a follower-tier row is never pushed to a non-follower. **DELETE events carry only the old row's key** (replica identity) — consumers treat DELETE for the watched uid as "session ended", no payload read.
- **Expiry**: 6h safety, mirroring `user_activity` — an abandoned session can't broadcast forever. Reads filter `expires_at > now()` (RLS deliberately does not — matching the house pattern in `get_active_activities`).

### Payload (v1 — target < 1 KB)

```jsonc
{
  "v": 1,
  "title": "Upper Pull — Peak",          // session title (already public-adjacent: it's what auto-share posts)
  "exercises": [ { "n": "Barbell row", "done": 2, "total": 4 } ],  // name + set counts ONLY
  "curIdx": 1,                            // index into exercises; -1 = none active yet
  "resting": true,
  "setsDone": 12, "setsTotal": 20
}
```

No loads, no RPE, no reps figures, no HR (decision 2). `v` guards future shape changes; consumers ignore unknown fields and render nothing on an unknown major shape (honest-absent, never a guess).

## The pure module — `mobile-app/src/services/liveProgress.mjs` (+ tests)

The one implementation both the writer and the tests exercise:

- `bsLiveProgressPayload(moves, completed, moveIdx, resting)` → the payload above, or `null` when there is nothing meaningful yet (no moves). Derives `done/total` per move from the `completed` map exactly as the player's own table does.
- `bsLiveAudience(settingsDoc)` → `'public' | 'followers' | null` — thin wrap of `bsWorkoutSharePrivacy`: `private` → `null` (write nothing). **A failed settings READ resolves `null`** (fail closed — the #1613 Codex-P1 lesson; an empty-but-readable doc keeps the documented On·Public default).
- `bsShouldPushProgress(prevPayload, nextPayload, lastPushAt, now)` → boolean: push only when the payload changed at all (deep equality — a `resting` flip counts; it is the state the viewer watches) **and** ≥ 4000 ms have passed since the last push. An unchanged payload never pushes regardless of time. Pure, timestamp-injected, unit-tested.

## Writer wiring (`BSSession` + `shapeBackend.js`)

- `shapeBackend.js` gains **`window.ShapeLiveProgress = { push(payload), clear(), get(uid), subscribe(uid, cb) }`**:
  - `push`: resolves the audience from the **cached** settings doc (the resolver auto-share already uses — no per-push network read); `null` audience → behaves as `clear()`. Upserts `{user_id, visibility, payload, updated_at, expires_at}` (`onConflict: 'user_id'`). Best-effort — a failed push never touches the workout flow.
  - `clear`: deletes own row. Called from the same paths that call `setActivity(null)` (finish · ✕ End · unmount), so live detail can never outlive the dot.
  - `subscribe(uid, cb)`: one realtime channel on `user_activity_live` filtered `user_id=eq.<uid>`; INSERT/UPDATE → `cb(payload row)`, DELETE → `cb(null)`. Returns an unsubscribe. `get(uid)`: single select (RLS decides; error/absent → `null`).
- `BSSession` pushes through `bsShouldPushProgress` on: set toggle, move change, rest start/end, add/remove set — and once at session start. **Trailing push**: when a change is declined purely on the 4s floor, the player schedules one retry at floor-expiry (cleared on unmount) — otherwise a set toggled 1s after the previous push would never broadcast and the viewer would hold stale state indefinitely. **Mid-session retro-tightening**: each push re-resolves the audience, so flipping Settings to Private mid-workout deletes the row on the next transition (bounded staleness — documented, matches the retro-tighten spirit of #1613).
- **Multi-device**: PK `user_id` — the newest device's upsert simply wins. Acceptable; noted.

## Consumer 1 — the boost sheet (`BSLiveBoostSheet`)

Under the existing "In a workout now · N min in" line, when (and only when) a row is readable:

> **Barbell row** · set 2 of 4 — 12/20 sets · a thin heat fill at `setsDone/setsTotal`

- `get(person.userId)` on open + `subscribe` while open (unsubscribe on close). DELETE mid-view → the line disappears (the honest state; the dot copy remains until presence catches up).
- **No row readable → today's sheet, byte-identical.** Never a fabricated exercise; never "private" copy on the member side (absence is unremarkable — the sheet simply doesn't know more, and saying "they hid this" would leak the *existence* of a setting choice).
- Demo rail people (no `userId`): unchanged demo behavior.
- Cooking (`kind='cooking'`): out of scope — no writer exists; the sheet renders nothing extra.

## Consumer 2 — the coach live-watch (`BSProLiveWatch`)

- Gains a **live mode** when opened with a real `clientId` **and** `get(clientId)` returns a row: the move list renders the payload's `exercises` (name · done/total · NOW spine on `curIdx`), the header counter reads real `SETS d/T`, elapsed derives from the row's `started_at`, `resting` shows as the current move's state line. **Honest-absent loads**: the grid's load column renders `—` in live mode (v1 broadcasts none) — never the demo figures.
- **No readable row** (client is private, not a follower-visible tier for this coach, or simply not in a session): the console keeps the elapsed/kind it already gets from `user_activity` and reads a quiet mono line — `LIVE DETAIL PRIVATE — SET-BY-SET ISN'T SHARED` (coach-side copy is fine: a coach already knows sharing settings exist; contrast the member-side silence above).
- **The demo path stays demo**: the hardcoded grid renders ONLY for demo roster entries (no real `clientId`), preserving the signed-out/demo preview. The fabricated `startedAt` clock dies on the live path.
- Cue-send (`BSLiveBoostSheet`-style DM) unchanged.

## i18n (×13, day one)

New strings ship localized in the already-registered namespaces — **no new namespace**, literal keys only (no dynamic families — the score-contract lesson):

- Member side (`feed:` — the client feed/boost surface): `boost.liveSet` = `set {done, number} of {total, number}`, `boost.liveSets` = `{done, number}/{total, number} sets`.
- Coach side (`coach:`): `live.detailPrivate`, `live.sets` (reuse existing `coach:live.*` family), plus any label the real mode needs that the demo hardcoded.
- Catalog test parity gates it as usual. If the host sheet turns out to carry other unlocalized legacy strings, **register — don't silently expand scope**.

## Testing

- `tests/live-progress.test.mjs`: payload derivation (done/total math, empty moves → null, unknown-shape guard), audience mapping incl. fail-closed on read error, throttle vectors (material change · 4s floor · resting flip · no-change no-push).
- Existing suite stays green (630); JSX parse · tsc · PowerShell `/m/` build · LF, per house gates.
- Browser verification on the dev server: two signed-in contexts (member in a session + a viewer), assert the live line appears/updates/disappears; coach console live mode with a real linked client; private member → viewer sees today's sheet.

## Explicit non-goals (v1)

Loads/RPE/HR in the payload · a coach-only richer channel · website surfaces · cooking detail · spectating from the profile page (the boost sheet + coach console are the only two doors) · any new Settings toggle.

## Rollout / degrade

Code ships before the migration is applied: `push` treats an unknown-relation error as a silent no-op (the pre-migration degrade pattern), both consumers read `null` and render today's UI. The migration is additive; no backfill. Register the OWNER-runs-migration item + the standing on-device pass in the War Room.
