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
table's shape minus `visibility` (the audience is structural, not stamped),
plus a cheap write-boundary bound: `check (pg_column_size(payload) <= 8192)`
(a direct owner write can't park megabytes; the CONTENT contract stays
enforced by the one shared validator on read — a SQL twin of it would be
exactly the drift the one-module rule exists to prevent, and the only author
of a member's own row is that member). RLS: **owner `for all` policy**
(SELECT/INSERT/UPDATE/**DELETE** — the v1 table's exact policy shape, spelled
out because the SECURITY INVOKER `live_clear()` depends on the owner DELETE
leg on BOTH tables); coach read = a separate SELECT policy
`is_coach_on_client(user_id)`. **Expiry is 30 minutes, not v1's 6 hours** —
the writer refreshes it on every push (≤4s apart mid-session), so a live
session never lapses, while a crashed session's loads — or a row visible to a
since-REVOKED coach — dies fast.
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
serialized queue: the writer pushes both payloads in one `_liveEnqueue` job.
**Two-table consistency is engineered, not assumed:** pushes are last-write-
wins upserts, so a one-leg push failure self-heals on the next push (seconds);
**clear() becomes ONE RPC — `live_clear()`** (SECURITY INVOKER; owner RLS is
the scope) that deletes BOTH rows in a single statement/transaction, so session
end can never strand a coach row behind a deleted public one. `expires_at`
stays the crash-path backstop.

### Consumers

- **Mobile `BSProLiveWatch`:** prefers the coach row when readable AND live —
  **`expires_at > now()` is part of the read contract**, so an expired coach
  row (or a late realtime event for one) is ineligible and can never override
  fresher public data; the v1 subscription-side expiry timer runs on the coach
  row too, dropping it from an already-open console the moment it lapses. The
  set grid shows real loads/reps/RPE as they land (replacing `—`); falls back
  to the public row, then to the neutral line. The demo-roster grid rule is
  untouched. **Revocation bound, stated honestly:** RLS stops future reads and
  realtime events the instant a link is revoked, but pixels already delivered
  can't be recalled — the exposure is bounded by (a) component-local state
  only (no persistent cache anywhere; unmount/back drops it instantly) and
  (b) the 30-minute rolling expiry + the subscription-side timer, which
  clears an untouched console at expiry. A revoked coach's console goes dark
  within minutes and can never re-fetch.
- **Web coach station** (from the live-progress-web spec): same preference
  order, same validator.

### What it never carries

HR (rides `shape:hrm` locally, never persisted live), notes, video, location.
Sets only — the live mirror of what the session log will say post-hoc.

## Testing

Module vectors for the coach payload + validator (bounds, malformed, sums) ·
writer test that clear() wipes both rows atomically via `live_clear()` ·
expired-row fallback (consumer drops the coach row at expiry, falls to public)
· `live_clear()` asserts BOTH rows actually deleted (the owner DELETE leg of
each table's `for all` policy is what the invoker RPC rides — proven, not
assumed) · the **full RLS denial matrix** post-migration, every leg an
explicit negative test: a non-coach authenticated user reads zero rows **of
another member** (their OWN row, if any, is the owner policy working — tested
separately as a positive) · a coach reads ONLY their own linked clients
(cross-client read denied) · coach INSERT/UPDATE/DELETE on a client's row
denied · a REVOKED coach link stops reading · anon reads nothing AND an
anonymous realtime subscription receives no events. On-device: coach watches live loads land; session end removes both
rows.

## Build

One PR after live-progress-web merges (it consumes the web station):
migration + module extension + writer + both consumers.
