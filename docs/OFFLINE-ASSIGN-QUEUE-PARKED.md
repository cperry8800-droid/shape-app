# Offline assign queue — PARKED

**Status: parked 2026-07-29. Do not build on this branch until Deploy 2b's
week-shaped publish boundary ships with a server-side idempotency key.**

Split out of PR #1848 (progression guardrails) by owner ruling. The guardrail
spec and the planned-load capture design were green and reviewed; this half kept
producing findings, so it left with its own branch rather than holding them up.

---

## Why it's parked

The queue exists so a coach can assign a week offline and have it deliver on
reconnect, without ever telling them work is saved when it isn't. That promise
needs one question answered reliably:

> **Has this session already been delivered?**

Today it has **three** answers and nothing reconciles them:

| Source | Knows about | Blind to |
|---|---|---|
| The assign screen's own memory (`sentKeysRef`) | What *this screen* sent, this mount | Anything the background drain sent |
| The device queue in `localStorage` | What's still held | Whether a held row already landed |
| The server rows | The truth | Nothing — but it can't be *asked*, because `client_workouts` has no unique key |

`client_workouts` carries **no natural unique key for an assignment**, so the
only available check is a heuristic probe on `(client_id, scheduled_date, title)`
that deliberately fails open on a read error. Every round of review found the
same shape of bug — one pair reconciled, the third drifting:

- **Round 1** — the queue was scoped to the coach who *selected* the work, but
  each write re-resolved the trainer from the live session, so a mid-drain
  account change wrote under the wrong provider.
- **Round 2** — retrying a held week skipped sessions *this screen* had sent, but
  not the ones the **background drain** had sent, so a retry after reconnect
  re-inserted the whole week.
- **Round 3** — a queue write-back failure left a stale snapshot that replays and
  re-notifies; a cap eviction silently discards held work while still reporting
  it as held.

This is a missing invariant, not carelessness. It cannot be closed from the
client.

---

## ⚠ When 2b lands, most of what's here gets DELETED — not extended

**Do not preserve this code out of sunk cost.** Roughly half of what these three
rounds produced exists *only* to approximate an answer the server will give
authoritatively. When the idempotency key exists, the correct move is to delete
it, not to layer the key on top of it.

### Delete

| What | Why it goes |
|---|---|
| `bsAssignmentKey()` + the same-identity collapse in `bsQueueAssignment()` | An identity heuristic standing in for a real key. The key replaces it outright. |
| `assignmentAlreadyWritten()` (`shapeBackend.js`) | A client-side existence probe against `client_workouts`. The server answers this; the probe's fail-open-on-read-error behaviour becomes a liability. |
| `sentKeysRef` + the retry-skip logic (`BSProAssignPage`) | Per-screen memory of what was sent. Obsolete the moment a repeat submission is safe by construction. |
| `bsPartitionByOwner()` + the per-write owner guard in the drain | Client-side ownership enforcement. Requirement (4) of the spec makes this a **server** rejection; keep at most a cheap pre-check, not the boundary. |
| Notification dedupe by `clientId + body` | Re-key off the idempotency key. Body-matching is a proxy that already fails for two different plans in one offline period. |
| The `shape:assignQueue` → screen reconciliation the round-3 P1 asks for | Only needed because the screen can't ask the server. Don't build it — it dies on arrival. |

### Keep

| What | Why it survives |
|---|---|
| `bsClassifyWriteFailure()` | **The module's real invariant** and the thing this work got right: only positive evidence of connectivity loss earns a local hold; everything else surfaces. Independent of any key. |
| The queue itself — `bsPruneQueue()` (age + cap), ordering, `bsMergeAfterDrain()` | Holding work offline and merging concurrent arrivals are genuine, key-independent concerns. |
| Surfacing rejections to the coach (`BSProAssignRejects`, the rejection ledger) | A server rejection still has to reach a human. Its *dedupe* changes; its existence doesn't. |
| Storage-failure honesty (`writeAssignQueue` returning a persisted flag) | A device that cannot persist must not report "held". True regardless of the boundary. |
| The `tests/assign-queue.test.mjs` failure-classification vectors | They pin the invariant above. The identity/dedupe vectors go with their code. |

---

## Open findings, not fixed (carry into the rebuild)

From Codex's review of `98085b86f` — real, verified against the code, deliberately
left rather than patched:

1. **P1 — duplicate insert after a background replay.** With the assign screen
   still mounted, `drainAssignmentQueue` delivers and clears the held week, but
   the screen neither listens for `shape:assignQueue` nor learns those identities.
   It keeps offering "Held — try again", and tapping it re-inserts every replayed
   session. *Resolved by requirement (3): the server reports already-delivered.*
2. **P2 — stale queue after a failed write-back.** The post-drain
   `writeAssignQueue` result is ignored; on failure the original snapshot survives
   and replays later, re-sending notifications. *Resolved by (2) + re-keyed
   notifications.*
3. **P2 — silent cap eviction.** At `BS_ASSIGN_QUEUE_CAP` (200) each new offline
   assignment evicts the oldest while `assignClientWorkout` still returns
   `stored:'queued'`, so a coach is told work is held that no longer exists.
   *Independent of the key — fix in the rebuild; pruning must report what it drops.*

---

## Resuming

1. Ship 2b's week-shaped boundary with the idempotency key meeting all four
   conditions in `SPEC-guardrails.md` §9.4.
2. Rebase this branch on `main`, then **delete the table above's "Delete" column
   first** — before writing anything new. Reconciling new code against bookkeeping
   that is about to be removed is how round 2 and round 3 happened.
3. Re-point the writer at the gated route. `bsReplayQueue` already takes its
   writer by injection precisely so the queue flows through the boundary with no
   change here — that part of the design holds.
