# Coach waitlist ("waiting room") — design

**Date:** 2026-07-01
**Status:** Approved (brainstorm) → ready for implementation plan

## Problem

Coaches (trainers / nutritionists) can flip an **at capacity** toggle
(`trainers/nutritionists.at_capacity` + `capacity_resume_at`) that blocks new
consultations, subscriptions, and purchases — every buy path is guarded by
`isEffectivelyAtCapacity()`. Today a client who hits a full coach just sees a
dead-end ("at capacity right now, try again later") and is lost.

We want a **per-coach waiting room**: when a coach is at capacity, a signed-in
member can add themselves to that coach's waitlist to be first in line. When the
coach has room again they invite people from the list, and an invited client gets
**first dibs** — they can book/subscribe even while the coach is still "at
capacity" to the general public.

## Decisions (locked during brainstorm)

- **Who can join:** signed-in Shape members only (identified by `client_id`). A
  logged-out visitor is prompted to sign in first.
- **When join is offered:** only while the coach is effectively at capacity.
- **Ordering:** FIFO — "first in line" is the earliest to join (`created_at`).
- **Coach outreach:** coach-triggered. The coach opens their waiting room and taps
  **Invite** on a specific client. No auto-notify of the whole list.
- **Invite payload:** in-app notification (+ optional email) with a **first-dibs
  booking link**, and a per-client bypass so that client can buy while the coach
  stays at capacity to everyone else.
- **Client control:** a client can **leave** while waiting or **decline** after an
  invite, at any time. That frees the spot; the next person becomes #1, whom the
  **coach** then invites (no automatic chaining).
- **Scope:** mobile app **and** website, sharing one backend.
- **Invite validity:** the first-dibs bypass expires 7 days after the invite; the
  coach can re-invite.

## Architecture (Approach A)

One new table + a small set of Next.js API routes reused by both the mobile
broadsheet (via the `shapeBackend` bridge) and the website. **RLS is the
authoritative gate** (per the repo policy): user-initiated actions run on the
**caller-scoped** Supabase client under own-row policies (SELECT/INSERT/UPDATE,
plus a `guard_cols` trigger that freezes the identity/position columns), and
cross-user reads/writes (FIFO position, the coach room roster, invites) go
through **`SECURITY DEFINER` RPCs** (`get_my_waitlists`, `get_coach_waitroom`,
`invite_from_waitlist`) that verify `auth.uid()` ownership internally — the same
pattern as `get_roster_weekend_split` / `get_client_stats`. The service-role /
admin client is reserved for **system-only writes** (the coach/invite
notifications and the Stripe-webhook `booked` flip), matching the existing
`createNotification` / webhook patterns.

### 1. Data model — `public.coach_waitlist` (new migration)

| column | type | notes |
|---|---|---|
| `id` | uuid pk default `gen_random_uuid()` | |
| `created_at` | timestamptz default `now()` | FIFO order ("first in line") |
| `provider_role` | text check in (`trainer`,`nutritionist`) | the coach's role |
| `provider_id` | bigint | the coach (trainers/nutritionists id) |
| `client_id` | uuid references `auth.users` on delete cascade | the member |
| `note` | text null | optional short context (≤ 500 chars) |
| `status` | text check in (`waiting`,`invited`,`booked`,`declined`,`left`) default `waiting` | |
| `invited_at` | timestamptz null | when the coach invited |
| `responded_at` | timestamptz null | when booked / declined / left |
| `invite_expires_at` | timestamptz null | first-dibs validity (`invited_at` + 7d) |

Indexes / constraints:

- **Dedup:** partial unique index on `(provider_role, provider_id, client_id)`
  `where status in ('waiting','invited')` — one active spot per client per coach.
- `(provider_role, provider_id, status, created_at)` — coach-room listing + order.
- `(client_id, status)` — "my waitlists" lookup.

RLS (defense-in-depth; primary auth is in the API):

- `select`: `client_id = auth.uid()` (a client reads only their own rows).
- No client `insert`/`update`/`delete` policies — all mutations go through the
  service-role API. Coach-room reads also go through the API (owner-checked).

Migration is delivered as a raw SQL file under `supabase-migrations/`; per repo
convention the owner runs it (reply with the raw GitHub link).

### 2. API routes — `src/app/api/waitlist/*`

All resolve the caller (cookie session or Bearer token, mirroring
`checkout-session`) and use the admin client for writes + notifications.

- `POST /api/waitlist/join` — body `{ providerId, providerRole, note? }`.
  Requires sign-in. Rejects if the coach is **not** effectively at capacity
  (nothing to wait for). Inserts `status='waiting'`; on unique-conflict returns
  the existing active entry. Notifies the coach. Returns `{ position, status }`.
- `GET  /api/waitlist/mine` — the caller's active entries with computed positions.
- `POST /api/waitlist/withdraw` — body `{ entryId }`. Own row only. `waiting`→
  `left` or `invited`→`declined`; sets `responded_at`. Optionally notifies coach.
- `GET  /api/waitlist/room?providerId&providerRole` — coach only (must own the
  provider via `owner_id`). Returns entries ordered by `created_at` with client
  name/note/status and position.
- `POST /api/waitlist/invite` — body `{ entryId }`. Coach only (owns provider).
  `waiting`/`declined`→`invited`; sets `invited_at`, `invite_expires_at`.
  Notifies the client (in-app + optional email) with the first-dibs link.

Position = rank by `created_at` among `status in ('waiting','invited')` for that
coach.

### 3. First-dibs capacity bypass

New helper `hasActiveWaitlistInvite(admin, clientId, providerRole, providerId)` →
true when a `coach_waitlist` row exists with `status='invited'` and
`invite_expires_at > now()`.

Wire it into the three **signed-in** purchase guards so an invited client is not
blocked by capacity:

- `src/app/purchase/actions.ts` (one-time booking / meal plan)
- `src/app/subscribe/actions.ts` (recurring coach subscription)
- `src/app/api/stripe/checkout-session/route.ts` (mobile checkout)

Each changes `if (isEffectivelyAtCapacity(provider)) block` to also allow when the
caller has an active invite. On a completed purchase the client's entry flips to
`status='booked'` (in the checkout webhook / action).

The anonymous consultation route (`/api/consultation`) stays blocked at capacity;
invited members convert through the signed-in book/subscribe link, where the
bypass applies. (A future enhancement could match an invite by email there.)

### 4. UI (mobile broadsheet + website)

**Client — on a coach profile that is at capacity:**

- Not on the list: **"Join the waiting list"** (+ optional note field).
- Waiting: **"You're #N in line"** + **"Leave the list"**.
- Invited: highlighted **"‹Coach› has room for you — Book now"** (first-dibs link)
  + **"Decline"**.
- Signed-out: **"Sign in to join the waiting list."**

Mobile: `BSSignalCoachProfile` in `iosAppBroadsheetClient.jsx`, with bridge
methods in `mobile-app/src/services/shapeBackend.js` (`window.ShapeWaitlist`).
Website: the trainer/nutritionist profile pages (`public/newdesign/*` +
`public/*-profile.html`).

**Coach — near the capacity toggle (mobile coach app) + on the web dashboard:**

- **"Waiting room (N)"** — list ordered first-in-line: client name, joined date,
  note, status, and an **Invite** button per `waiting`/`declined` entry; `invited`
  shows "invited · expires …", `booked`/`left`/`declined` shown muted or filtered.
- Optional count badge next to the "At capacity" toggle.

House style: quiet rounded list rows for the waiting room; the invited-client CTA
on the client profile is the one live/actionable surface (a `BSPlate`). Theme
tokens only; monochrome symbols; honest states (empty waiting room sells nothing
fake).

### 5. Notifications (reuse `createNotification`)

- Coach on join: type `waitlist_join` — "‹Client› joined your waiting list."
- Client on invite: type `waitlist_invite` — "‹Coach› has room for you — book
  now" (route deep-links to the coach's booking), plus an optional email.
- Optional — coach on leave/decline: `waitlist_left`.

## Rules & edge cases

- Join is allowed only while the coach is effectively at capacity.
- One active entry per (client, coach) — enforced by the partial unique index;
  re-join returns the existing position.
- Leaving/declining frees the spot; the next `waiting` entry becomes #1; the coach
  invites them manually (no auto-chaining).
- An invite's bypass expires after 7 days; the coach can re-invite (resets expiry).
- If the coach turns **off** at capacity, existing entries remain; clients can
  simply book, or the coach can still invite. No mass auto-notify.
- A completed purchase by an invited client sets their entry to `booked`.

## Out of scope (v1 / YAGNI)

- Slot-count queues / auto-invite-next.
- Email-match bypass on the anonymous consultation route.
- Coach reordering of the queue (strict FIFO only).
- Waitlist size caps.

## Testing

- Fee/guard-style unit coverage for `hasActiveWaitlistInvite` and position ranking
  where the runner allows (`.mjs`), otherwise via the API route behavior.
- Manual: join → position → coach invite → first-dibs purchase while at capacity →
  entry `booked`; leave/decline → next becomes #1; dedup; expiry.
- `tsc --noEmit`; web build; mobile build + `public/m` sync.

## Affected files (indicative)

- New: `supabase-migrations/2026-07-01-coach-waitlist.sql`,
  `src/app/api/waitlist/{join,mine,withdraw,room,invite}/route.ts`,
  `src/lib/waitlist.ts` (helpers incl. `hasActiveWaitlistInvite`).
- Edit: `purchase/actions.ts`, `subscribe/actions.ts`,
  `api/stripe/checkout-session/route.ts` (bypass + `booked`),
  `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (client + coach UI),
  `mobile-app/src/services/shapeBackend.js` (`window.ShapeWaitlist`), coach
  dashboard + coach/client profile pages under `public/newdesign/`.
