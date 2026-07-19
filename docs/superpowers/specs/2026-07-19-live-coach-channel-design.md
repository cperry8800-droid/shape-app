# Live coach channel — loads + RPE in the coach's live-watch (richer, coach-only)

**Date:** 2026-07-19 · **Status:** spec for owner review — **contains one owner
ratification (§Decision)** · **Migration:** one (owner runs it)

## Why

Live-progress v1 deliberately broadcasts **names + set counts only**, because
its audience can include followers or the public — load figures are the
intimate part (owner decision, #1763). The coach console therefore renders
loads as `—` live, even though **the same coach reads the client's full loads,
reps, and RPE minutes later** in the session logs, the review queue, and
`get_client_lifts`. The coach's live view is poorer than her post-hoc view of
identical data — pure timing artifact, not a privacy boundary.

## The decision this spec asks the owner to ratify

**A coach-only live channel carries loads/reps/RPE, gated on the active coach
link alone — no new member toggle — because it exposes nothing the coach
doesn't already read post-hoc; it changes WHEN, not WHAT.** This deliberately
supersedes v1's "no coach exception" line, which governed the *public* payload
(and still does — the public payload is untouched). It is consistent with the
house rule that "the active coach↔client subscription IS the permission"
(`get_client_lifts`, `get_client_stats`, weekend split, review queue). A member
who is `private` to the public still streams to her own coach — exactly as her
session logs already do.

If the owner instead wants a member toggle for the live-coach channel, the
design below is unchanged except the write is additionally gated on a
`cycle`-style settings flag — a one-line difference the plan can absorb.

## Design

### Transport — a second row, never a second column

`user_activity_live_coach` (migration `2026-07-19-user-activity-live-coach.sql`):
`(user_id PK, payload jsonb, started_at, updated_at, expires_at)` — the v1
table's shape minus `visibility` (the audience is structural, not stamped).
RLS: owner writes own; read = `user_id = auth.uid() OR is_coach_on_client(user_id)`.
**A separate table because RLS is row-level, not column-level** — one row with
a public half and a coach half would leak one to the other's audience (the
lesson that killed the `user_activity` jsonb column in the v1 spec). Realtime
publication membership; `postgres_changes` enforces per-subscriber.

### Payload — extend the ONE module

`liveProgress.mjs` gains `bsLiveCoachPayload(moves, completed, setInputs, …)`:
the v1 payload PLUS per-exercise `sets: [{load, reps, rpe, done}]` (raw strings
as entered, ≤12 chars each, ≤10 sets serialized), and `bsValidLiveCoachPayload`
— the same full-contract validator discipline (sums equal, bounded, typed;
malformed → null → honest-absent). Same push throttle, same generation-guarded
serialized queue: the writer pushes both payloads in one `_liveEnqueue` job so
clear() ordering covers both tables; `clear()` deletes both rows.

### Consumers

- **Mobile `BSProLiveWatch`:** prefers the coach row when readable — the set
  grid shows real loads/reps/RPE as they land (replacing `—`); falls back to
  the public row, then to the neutral line. The demo-roster grid rule is
  untouched.
- **Web coach station** (from the live-progress-web spec): same preference
  order, same validator.

### What it never carries

HR (rides `shape:hrm` locally, never persisted live), notes, video, location.
Sets only — the live mirror of what the session log will say post-hoc.

## Testing

Module vectors for the coach payload + validator (bounds, malformed, sums) ·
writer test that clear() wipes both rows via the serialized queue · RLS proof
post-migration (non-coach authenticated user reads zero rows; the client's own
coach reads; anon nothing). On-device: coach watches live loads land; session
end removes both rows.

## Build

One PR after live-progress-web merges (it consumes the web station):
migration + module extension + writer + both consumers.
