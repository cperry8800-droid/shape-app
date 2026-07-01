# Coach Waitlist ("Waiting Room") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in member join a per-coach waiting list when that coach is at capacity, and let the coach invite people back with first-dibs booking.

**Architecture:** One new `public.coach_waitlist` table + a small set of Next.js `/api/waitlist/*` routes (service-role, cookie-or-Bearer auth) reused by the mobile broadsheet (via a `window.ShapeWaitlist` bridge) and the website. A shared `src/lib/waitlist.ts` holds the pure helpers and the `hasActiveWaitlistInvite()` check that the three signed-in purchase guards consult so an invited client bypasses the capacity block. Notifications reuse `createNotification`.

**Tech Stack:** Next.js (App Router, `runtime = 'nodejs'`), Supabase (Postgres + RLS, `@supabase/supabase-js` admin client), Capacitor/Vite broadsheet SPA (React 19), Node `node:test` for pure-logic unit tests.

## Global Constraints

- **Verify base before ANY edit:** `git fetch origin main && git rev-parse --short HEAD origin/main`; if HEAD ≠ origin/main, `git reset --hard origin/main`. Work on branch `claude/coach-waitlist`.
- **LF line endings only.** After any Edit/Write, run `sed -i 's/\r$//' <file>` before staging (the editor writes CRLF on this Windows box; the repo is LF).
- **Migrations are owner-run.** Deliver the SQL as a file under `supabase-migrations/`; do NOT apply it. Reply with the `raw.githubusercontent.com/.../supabase-migrations/<file>.sql` link for the owner to run.
- **Signed-in members only** may join/leave; the coach endpoints require the caller to own the provider (`trainers/nutritionists.owner_id = auth.uid()`).
- **One active entry per (client, coach)** — enforced by a partial unique index.
- **FIFO** ordering by `created_at`. **No auto-chaining** — the coach invites the next person manually.
- **Invite bypass TTL = 7 days** (`WAITLIST_INVITE_TTL_DAYS`).
- **No colored emoji** in new UI; monochrome typographic symbols only. Theme tokens only in the broadsheet (`const t = useBS()`), never hardcoded ink/paper.
- **CI gates:** `npx tsc --noEmit`, `npx next build` (Web); `VITE_BASE=/m/ npm run build` + `public/m` sync (Mobile). `npm test` is NOT a CI gate but must stay green locally.
- **PR flow:** open a PR when the feature branch is ready; wait for CI green + CodeRabbit; address all findings before merge; keep the branch after merge.

---

## File Structure

- **Create** `supabase-migrations/2026-07-01-coach-waitlist.sql` — table, indexes, RLS.
- **Create** `src/lib/waitlist.ts` — types, constants, `resolveRequestUser`, `hasActiveWaitlistInvite`, `computePositions`.
- **Create** `tests/waitlist.test.mjs` — pure-logic tests for `computePositions` + invite-expiry.
- **Create** `src/app/api/waitlist/join/route.ts`, `.../mine/route.ts`, `.../withdraw/route.ts`, `.../room/route.ts`, `.../invite/route.ts`.
- **Modify** `src/app/purchase/actions.ts`, `src/app/subscribe/actions.ts`, `src/app/api/stripe/checkout-session/route.ts` — first-dibs bypass.
- **Modify** `src/app/api/stripe/webhook/route.ts` — flip entry to `booked` on completed purchase.
- **Modify** `mobile-app/src/services/shapeBackend.js` — `window.ShapeWaitlist` bridge.
- **Modify** `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — client CTA on `BSSignalCoachProfile` + coach waiting-room near the capacity toggle.
- **Modify** website coach profile + coach dashboard under `public/newdesign/` (client CTA + coach room).

---

## Task 1: `coach_waitlist` migration

**Files:**
- Create: `supabase-migrations/2026-07-01-coach-waitlist.sql`

**Interfaces:**
- Produces: table `public.coach_waitlist` with columns `id, created_at, provider_role, provider_id, client_id, note, status, invited_at, responded_at, invite_expires_at`; statuses `waiting|invited|booked|declined|left`.

- [ ] **Step 1: Write the migration**

```sql
-- Per-coach waiting list. When a coach is at_capacity, signed-in members join
-- to be first in line; the coach invites them back with first-dibs booking.
-- Idempotent, safe to re-run.

create table if not exists public.coach_waitlist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  provider_id bigint not null,
  client_id uuid not null references auth.users on delete cascade,
  note text,
  status text not null default 'waiting'
    check (status in ('waiting','invited','booked','declined','left')),
  invited_at timestamptz,
  responded_at timestamptz,
  invite_expires_at timestamptz
);

-- One ACTIVE spot per client per coach (waiting or invited).
create unique index if not exists coach_waitlist_active_uniq
  on public.coach_waitlist (provider_role, provider_id, client_id)
  where status in ('waiting','invited');

-- Coach-room listing + FIFO ordering.
create index if not exists coach_waitlist_provider_idx
  on public.coach_waitlist (provider_role, provider_id, status, created_at);

-- "My waitlists" lookup.
create index if not exists coach_waitlist_client_idx
  on public.coach_waitlist (client_id, status);

alter table public.coach_waitlist enable row level security;

-- Defense-in-depth: a client may read only their own rows. All writes and the
-- coach-room read go through the service-role API with explicit auth checks.
drop policy if exists "clients read own waitlist" on public.coach_waitlist;
create policy "clients read own waitlist" on public.coach_waitlist
  for select using (auth.uid() = client_id);
```

- [ ] **Step 2: Verify it parses / is well-formed**

Run: `grep -c "create " supabase-migrations/2026-07-01-coach-waitlist.sql`
Expected: `4` (one table + three indexes lines start with `create`; the unique + two plain indexes + table = 4 `create ` matches).

- [ ] **Step 3: Normalize LF + commit**

```bash
sed -i 's/\r$//' supabase-migrations/2026-07-01-coach-waitlist.sql
git add supabase-migrations/2026-07-01-coach-waitlist.sql
git commit -m "feat(waitlist): coach_waitlist table + RLS migration"
```

- [ ] **Step 4: Note for the owner** — after the branch merges, post the raw GitHub link to this SQL for the owner to run on Supabase. Do NOT apply it here.

---

## Task 2: `src/lib/waitlist.ts` shared helpers (+ unit tests)

**Files:**
- Create: `src/lib/waitlist.ts`
- Test: `tests/waitlist.test.mjs`

**Interfaces:**
- Produces:
  - `WAITLIST_INVITE_TTL_DAYS = 7`
  - `type WaitlistStatus = 'waiting'|'invited'|'booked'|'declined'|'left'`
  - `ACTIVE_WAITLIST_STATUSES: Set<WaitlistStatus>` (`waiting`,`invited`)
  - `computePositions(rows: {id:string; status:string; created_at:string}[]): Map<string, number>` — 1-based rank among active rows by `created_at` asc.
  - `resolveRequestUser(request: Request): Promise<{id:string; email:string|null}|null>` — cookie session OR Bearer token (mirrors checkout-session).
  - `hasActiveWaitlistInvite(admin, clientId: string, providerRole: string, providerId: number): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

```js
// tests/waitlist.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { computePositions, ACTIVE_WAITLIST_STATUSES } from '../src/lib/waitlist.mjs';

test('computePositions ranks active rows FIFO, skips inactive', () => {
  const rows = [
    { id: 'a', status: 'waiting', created_at: '2026-07-01T10:00:00Z' },
    { id: 'b', status: 'left',    created_at: '2026-07-01T10:01:00Z' },
    { id: 'c', status: 'invited', created_at: '2026-07-01T10:02:00Z' },
    { id: 'd', status: 'waiting', created_at: '2026-07-01T10:03:00Z' },
  ];
  const pos = computePositions(rows);
  assert.equal(pos.get('a'), 1);
  assert.equal(pos.get('c'), 2);
  assert.equal(pos.get('d'), 3);
  assert.equal(pos.has('b'), false);
});

test('ACTIVE set is waiting+invited only', () => {
  assert.equal(ACTIVE_WAITLIST_STATUSES.has('waiting'), true);
  assert.equal(ACTIVE_WAITLIST_STATUSES.has('invited'), true);
  assert.equal(ACTIVE_WAITLIST_STATUSES.has('booked'), false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/waitlist.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/waitlist.mjs'`.

- [ ] **Step 3: Create the pure-logic module (testable `.mjs`)**

Put the pure, framework-free logic in `src/lib/waitlist.mjs` so the `node --test` runner (which imports `.mjs` only) can load it:

```js
// src/lib/waitlist.mjs — framework-free waitlist logic (unit-tested).
export const WAITLIST_INVITE_TTL_DAYS = 7;
export const ACTIVE_WAITLIST_STATUSES = new Set(['waiting', 'invited']);

// 1-based FIFO position among ACTIVE rows (waiting|invited), by created_at asc.
export function computePositions(rows) {
  const active = rows
    .filter((r) => ACTIVE_WAITLIST_STATUSES.has(r.status))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const map = new Map();
  active.forEach((r, i) => map.set(r.id, i + 1));
  return map;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/waitlist.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the TypeScript wrapper `src/lib/waitlist.ts`**

Re-export the pure logic and add the DB-touching + request helpers. Importing the `.mjs` from TS is fine (Next bundles it); types are declared here.

```ts
// src/lib/waitlist.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  WAITLIST_INVITE_TTL_DAYS,
  ACTIVE_WAITLIST_STATUSES,
  computePositions,
} from './waitlist.mjs';

export { WAITLIST_INVITE_TTL_DAYS, ACTIVE_WAITLIST_STATUSES, computePositions };

export type WaitlistStatus = 'waiting' | 'invited' | 'booked' | 'declined' | 'left';
export type ProviderRole = 'trainer' | 'nutritionist';

// Resolve the caller from a cookie session OR a Supabase Bearer token (mirrors
// the checkout-session route so mobile + web both work).
export async function resolveRequestUser(
  request: Request
): Promise<{ id: string; email: string | null } | null> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !anon) return null;
    const token = bearer[1];
    const client = createSupabaseClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await client.auth.getUser(token);
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

// True when this client holds a non-expired invite for this coach — the
// first-dibs bypass consulted by the purchase guards.
export async function hasActiveWaitlistInvite(
  admin: SupabaseClient,
  clientId: string,
  providerRole: ProviderRole,
  providerId: number
): Promise<boolean> {
  const { data } = await admin
    .from('coach_waitlist')
    .select('id')
    .eq('client_id', clientId)
    .eq('provider_role', providerRole)
    .eq('provider_id', providerId)
    .eq('status', 'invited')
    .gt('invite_expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}
```

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
sed -i 's/\r$//' src/lib/waitlist.mjs src/lib/waitlist.ts tests/waitlist.test.mjs
git add src/lib/waitlist.mjs src/lib/waitlist.ts tests/waitlist.test.mjs
git commit -m "feat(waitlist): shared helpers (positions, invite check, auth) + tests"
```

---

## Task 3: `POST /api/waitlist/join`

**Files:**
- Create: `src/app/api/waitlist/join/route.ts`

**Interfaces:**
- Consumes: `resolveRequestUser`, `createAdminClient`, `isEffectivelyAtCapacity`, `createNotification`, `readJson`.
- Produces: `POST` accepting `{ providerId:number, providerRole:'trainer'|'nutritionist', note?:string }` → `{ position:number, status:string }` or an error status.

- [ ] **Step 1: Implement the route**

```ts
// src/app/api/waitlist/join/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isEffectivelyAtCapacity } from '@/lib/capacity';
import { createNotification } from '@/lib/notify';
import { readJson } from '@/lib/request-utils';
import { resolveRequestUser, computePositions, type ProviderRole } from '@/lib/waitlist';

export const runtime = 'nodejs';

type Body = { providerId?: number | string; providerRole?: string; note?: string };

export async function POST(request: Request) {
  const user = await resolveRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const parsed = await readJson<Body>(request, { allowEmpty: false });
  if (!parsed.ok) return parsed.response;
  const providerId = Number(parsed.data.providerId ?? 0);
  const providerRole = (String(parsed.data.providerRole ?? '').toLowerCase() === 'nutritionist'
    ? 'nutritionist' : 'trainer') as ProviderRole;
  const note = String(parsed.data.note ?? '').trim().slice(0, 500) || null;
  if (!providerId || !Number.isFinite(providerId)) {
    return NextResponse.json({ error: 'Invalid coach.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: provider } = await admin
    .from(table)
    .select('id, name, owner_id, at_capacity, capacity_resume_at')
    .eq('id', providerId)
    .maybeSingle();
  if (!provider) return NextResponse.json({ error: 'Coach not found.' }, { status: 404 });
  if (!isEffectivelyAtCapacity(provider)) {
    return NextResponse.json({ error: 'This coach is accepting clients — no waitlist needed.' }, { status: 409 });
  }

  // Dedup: return the existing active entry if present.
  const { data: existing } = await admin
    .from('coach_waitlist')
    .select('id, status')
    .eq('provider_role', providerRole).eq('provider_id', providerId)
    .eq('client_id', user.id).in('status', ['waiting', 'invited'])
    .maybeSingle();
  if (!existing) {
    const { error: insErr } = await admin.from('coach_waitlist').insert({
      provider_role: providerRole, provider_id: providerId, client_id: user.id, note, status: 'waiting',
    });
    // 23505 = someone raced us to the unique index; treat as already-joined.
    if (insErr && insErr.code !== '23505') {
      return NextResponse.json({ error: 'Could not join the waitlist.' }, { status: 500 });
    }
    if (!insErr && provider.owner_id) {
      await createNotification(admin, {
        userId: provider.owner_id, type: 'waitlist_join',
        title: 'New waiting-list request',
        body: 'Someone joined your waiting list.', route: 'waitlist',
        data: { providerRole, providerId },
      });
    }
  }

  // Compute this client's position among active rows.
  const { data: rows } = await admin
    .from('coach_waitlist')
    .select('id, client_id, status, created_at')
    .eq('provider_role', providerRole).eq('provider_id', providerId)
    .in('status', ['waiting', 'invited']);
  const mineRow = (rows ?? []).find((r) => r.client_id === user.id);
  const position = mineRow ? (computePositions(rows ?? []).get(mineRow.id) ?? 0) : 0;
  return NextResponse.json({ position, status: mineRow?.status ?? 'waiting' });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' src/app/api/waitlist/join/route.ts
git add src/app/api/waitlist/join/route.ts
git commit -m "feat(waitlist): POST /api/waitlist/join"
```

---

## Task 4: `GET /api/waitlist/mine`

**Files:**
- Create: `src/app/api/waitlist/mine/route.ts`

**Interfaces:**
- Produces: `GET` → `{ entries: { id, providerRole, providerId, status, position, note, invited_at }[] }` for the caller's active entries.

- [ ] **Step 1: Implement**

```ts
// src/app/api/waitlist/mine/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveRequestUser, computePositions } from '@/lib/waitlist';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await resolveRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const admin = createAdminClient();

  const { data: mine } = await admin
    .from('coach_waitlist')
    .select('id, provider_role, provider_id, status, note, invited_at, created_at')
    .eq('client_id', user.id).in('status', ['waiting', 'invited']);

  // Positions need every active row for each coach the client is queued on.
  const entries = [];
  for (const row of mine ?? []) {
    const { data: peers } = await admin
      .from('coach_waitlist')
      .select('id, status, created_at')
      .eq('provider_role', row.provider_role).eq('provider_id', row.provider_id)
      .in('status', ['waiting', 'invited']);
    const position = computePositions(peers ?? []).get(row.id) ?? 0;
    entries.push({
      id: row.id, providerRole: row.provider_role, providerId: row.provider_id,
      status: row.status, note: row.note, invited_at: row.invited_at, position,
    });
  }
  return NextResponse.json({ entries });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' src/app/api/waitlist/mine/route.ts
git add src/app/api/waitlist/mine/route.ts
git commit -m "feat(waitlist): GET /api/waitlist/mine"
```

---

## Task 5: `POST /api/waitlist/withdraw`

**Files:**
- Create: `src/app/api/waitlist/withdraw/route.ts`

**Interfaces:**
- Produces: `POST { entryId:string }` → `{ ok:true, status:'left'|'declined' }`. Own row only; `waiting`→`left`, `invited`→`declined`; a zero-row update returns already-processed.

- [ ] **Step 1: Implement**

```ts
// src/app/api/waitlist/withdraw/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJson } from '@/lib/request-utils';
import { resolveRequestUser } from '@/lib/waitlist';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await resolveRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const parsed = await readJson<{ entryId?: string }>(request, { allowEmpty: false });
  if (!parsed.ok) return parsed.response;
  const entryId = String(parsed.data.entryId ?? '');
  if (!entryId) return NextResponse.json({ error: 'Missing entry.' }, { status: 400 });

  const admin = createAdminClient();
  // Load own active row to decide the terminal status.
  const { data: row } = await admin
    .from('coach_waitlist').select('id, status')
    .eq('id', entryId).eq('client_id', user.id).maybeSingle();
  if (!row || !['waiting', 'invited'].includes(row.status)) {
    return NextResponse.json({ ok: true, status: 'already_processed' });
  }
  const next = row.status === 'invited' ? 'declined' : 'left';
  await admin.from('coach_waitlist')
    .update({ status: next, responded_at: new Date().toISOString() })
    .eq('id', entryId).eq('client_id', user.id).in('status', ['waiting', 'invited']);
  return NextResponse.json({ ok: true, status: next });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' src/app/api/waitlist/withdraw/route.ts
git add src/app/api/waitlist/withdraw/route.ts
git commit -m "feat(waitlist): POST /api/waitlist/withdraw"
```

---

## Task 6: `GET /api/waitlist/room` (coach)

**Files:**
- Create: `src/app/api/waitlist/room/route.ts`

**Interfaces:**
- Consumes: `resolveRequestUser`, `createAdminClient`, `computePositions`.
- Produces: `GET ?providerId&providerRole` → `{ entries: { id, clientId, clientName, note, status, position, created_at, invited_at, invite_expires_at }[] }`. Caller must own the provider.

- [ ] **Step 1: Implement**

```ts
// src/app/api/waitlist/room/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveRequestUser, computePositions, type ProviderRole } from '@/lib/waitlist';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const user = await resolveRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const url = new URL(request.url);
  const providerId = Number(url.searchParams.get('providerId') ?? 0);
  const providerRole = (String(url.searchParams.get('providerRole') ?? '').toLowerCase() === 'nutritionist'
    ? 'nutritionist' : 'trainer') as ProviderRole;
  if (!providerId) return NextResponse.json({ error: 'Invalid coach.' }, { status: 400 });

  const admin = createAdminClient();
  const table = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: provider } = await admin
    .from(table).select('id, owner_id').eq('id', providerId).maybeSingle();
  if (!provider || provider.owner_id !== user.id) {
    return NextResponse.json({ error: 'Not your waiting room.' }, { status: 403 });
  }

  const { data: rows } = await admin
    .from('coach_waitlist')
    .select('id, client_id, note, status, created_at, invited_at, invite_expires_at')
    .eq('provider_role', providerRole).eq('provider_id', providerId)
    .order('created_at', { ascending: true });
  const positions = computePositions(rows ?? []);

  // Resolve client display names (best-effort).
  const entries = [];
  for (const r of rows ?? []) {
    let clientName: string | null = null;
    const { data: prof } = await admin.from('profiles').select('full_name').eq('id', r.client_id).maybeSingle();
    clientName = (prof as { full_name?: string } | null)?.full_name ?? null;
    entries.push({
      id: r.id, clientId: r.client_id, clientName, note: r.note, status: r.status,
      position: positions.get(r.id) ?? null, created_at: r.created_at,
      invited_at: r.invited_at, invite_expires_at: r.invite_expires_at,
    });
  }
  return NextResponse.json({ entries });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' src/app/api/waitlist/room/route.ts
git add src/app/api/waitlist/room/route.ts
git commit -m "feat(waitlist): GET /api/waitlist/room (coach)"
```

---

## Task 7: `POST /api/waitlist/invite` (coach)

**Files:**
- Create: `src/app/api/waitlist/invite/route.ts`

**Interfaces:**
- Consumes: `resolveRequestUser`, `createAdminClient`, `createNotification`, `WAITLIST_INVITE_TTL_DAYS`.
- Produces: `POST { entryId:string }` → `{ ok:true, invite_expires_at:string }`. Caller must own the provider; sets `status='invited'`, `invited_at`, `invite_expires_at`; notifies the client.

- [ ] **Step 1: Implement**

```ts
// src/app/api/waitlist/invite/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notify';
import { readJson } from '@/lib/request-utils';
import { resolveRequestUser, WAITLIST_INVITE_TTL_DAYS } from '@/lib/waitlist';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await resolveRequestUser(request);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const parsed = await readJson<{ entryId?: string }>(request, { allowEmpty: false });
  if (!parsed.ok) return parsed.response;
  const entryId = String(parsed.data.entryId ?? '');
  if (!entryId) return NextResponse.json({ error: 'Missing entry.' }, { status: 400 });

  const admin = createAdminClient();
  const { data: entry } = await admin
    .from('coach_waitlist')
    .select('id, client_id, provider_role, provider_id, status')
    .eq('id', entryId).maybeSingle();
  if (!entry) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });

  // Ownership: caller must own the provider on this entry.
  const table = entry.provider_role === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: provider } = await admin
    .from(table).select('id, name, owner_id').eq('id', entry.provider_id).maybeSingle();
  if (!provider || provider.owner_id !== user.id) {
    return NextResponse.json({ error: 'Not your waiting room.' }, { status: 403 });
  }
  if (!['waiting', 'declined'].includes(entry.status)) {
    return NextResponse.json({ error: 'This client cannot be invited in their current state.' }, { status: 409 });
  }

  const now = new Date();
  const expires = new Date(now.getTime() + WAITLIST_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const { error } = await admin.from('coach_waitlist')
    .update({ status: 'invited', invited_at: now.toISOString(), invite_expires_at: expires.toISOString(), responded_at: null })
    .eq('id', entryId);
  if (error) return NextResponse.json({ error: 'Could not send the invite.' }, { status: 500 });

  await createNotification(admin, {
    userId: entry.client_id, type: 'waitlist_invite',
    title: `${provider.name} has room for you`,
    body: 'Tap to book before this coach reopens to everyone.',
    route: `coach:${entry.provider_role}:${entry.provider_id}`,
    data: { providerRole: entry.provider_role, providerId: entry.provider_id, entryId },
  });
  return NextResponse.json({ ok: true, invite_expires_at: expires.toISOString() });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' src/app/api/waitlist/invite/route.ts
git add src/app/api/waitlist/invite/route.ts
git commit -m "feat(waitlist): POST /api/waitlist/invite (coach)"
```

---

## Task 8: First-dibs bypass in the purchase guards + `booked` on purchase

**Files:**
- Modify: `src/app/purchase/actions.ts` (the `isEffectivelyAtCapacity` guard, ~line 68)
- Modify: `src/app/subscribe/actions.ts` (guard inside `getProviderConnectInfo`, ~line 46)
- Modify: `src/app/api/stripe/checkout-session/route.ts` (guard, ~line 116)
- Modify: `src/app/api/stripe/webhook/route.ts` (payment branch — flip entry to `booked`)

**Interfaces:**
- Consumes: `hasActiveWaitlistInvite(admin, clientId, providerRole, providerId)` from `@/lib/waitlist`.

- [ ] **Step 1: purchase/actions.ts — allow invited clients**

Add the import and change the guard. The action already has `admin` (createAdminClient) and `user`.

```ts
import { hasActiveWaitlistInvite } from '@/lib/waitlist';
// ...
// was: if (isEffectivelyAtCapacity(provider)) redirect(`${backHref}&error=provider_at_capacity`);
if (
  isEffectivelyAtCapacity(provider) &&
  !(await hasActiveWaitlistInvite(admin, user.id, providerRole, providerId))
) {
  redirect(`${backHref}&error=provider_at_capacity`);
}
```

- [ ] **Step 2: subscribe/actions.ts — allow invited clients**

`getProviderConnectInfo` runs before we have `user`; move the capacity decision to `startCheckout` where `user` is known, OR pass the user in. Minimal change: in `startCheckout`, after resolving `user` and before calling `getProviderConnectInfo`, the capacity error is surfaced by `getProviderConnectInfo`. Change `getProviderConnectInfo` to accept an `allowAtCapacity` flag:

```ts
// signature: getProviderConnectInfo(providerRole, providerId, allowAtCapacity = false)
// inside, replace:
//   if (isEffectivelyAtCapacity(provider)) return { error: 'provider_at_capacity' };
// with:
if (!allowAtCapacity && isEffectivelyAtCapacity(provider)) return { error: 'provider_at_capacity' };
```

And in `startCheckout` (after `user` is known):

```ts
import { hasActiveWaitlistInvite } from '@/lib/waitlist';
import { createAdminClient } from '@/lib/supabase/admin';
// ...
const admin = createAdminClient();
const allowAtCapacity = await hasActiveWaitlistInvite(admin, user.id, providerRole, providerId);
priceResult = await getProviderConnectInfo(providerRole, providerId, allowAtCapacity);
```

- [ ] **Step 3: checkout-session/route.ts — allow invited clients**

`user` and `admin` already exist. Replace the capacity block:

```ts
import { hasActiveWaitlistInvite } from '@/lib/waitlist';
// ...
// was: if (isEffectivelyAtCapacity(provider)) { return 409 ... }
if (
  isEffectivelyAtCapacity(provider) &&
  !(await hasActiveWaitlistInvite(admin, user.id, providerRole, providerId))
) {
  return NextResponse.json({ error: 'Provider is currently at capacity.' }, { status: 409 });
}
```

- [ ] **Step 4: webhook — flip the entry to `booked` on a completed coach purchase**

In `checkout.session.completed`, `payment` branch (after the `one_time_purchases` upsert) and in the subscription branch (after the `subscriptions` upsert), mark any active waitlist entry for `(clientId, providerRole, providerId)` as booked:

```ts
// after the purchase/subscription is recorded, in both branches:
if (providerId && providerRole && clientId) {
  await admin.from('coach_waitlist')
    .update({ status: 'booked', responded_at: new Date().toISOString() })
    .eq('client_id', clientId).eq('provider_role', providerRole).eq('provider_id', Number(providerId))
    .in('status', ['waiting', 'invited']);
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
sed -i 's/\r$//' src/app/purchase/actions.ts src/app/subscribe/actions.ts src/app/api/stripe/checkout-session/route.ts src/app/api/stripe/webhook/route.ts
git add src/app/purchase/actions.ts src/app/subscribe/actions.ts src/app/api/stripe/checkout-session/route.ts src/app/api/stripe/webhook/route.ts
git commit -m "feat(waitlist): first-dibs capacity bypass + mark entry booked on purchase"
```

---

## Task 9: `window.ShapeWaitlist` mobile bridge

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (add functions + a `window.ShapeWaitlist = {...}` block, next to `window.ShapeBookings` ~line 3478)

**Interfaces:**
- Produces: `window.ShapeWaitlist = { join, mine, withdraw, room, invite }` — all return parsed JSON; all send the Bearer token via `${apiBaseUrl}`.

- [ ] **Step 1: Add the bridge functions**

Mirror the existing `apiBaseUrl` + `state.session.access_token` fetch pattern used elsewhere in the file.

```js
async function waitlistJoin({ providerId, providerRole, note } = {}) {
  if (!apiBaseUrl || !state.session?.access_token) throw new Error('Sign in to join the waiting list.');
  const res = await fetch(`${apiBaseUrl}/api/waitlist/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, providerRole, note: note || undefined }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not join the waiting list.');
  return json; // { position, status }
}
async function waitlistMine() {
  if (!apiBaseUrl || !state.session?.access_token) return { entries: [] };
  const res = await fetch(`${apiBaseUrl}/api/waitlist/mine`, { headers: { Authorization: `Bearer ${state.session.access_token}` } });
  return res.ok ? res.json() : { entries: [] };
}
async function waitlistWithdraw(entryId) {
  if (!apiBaseUrl || !state.session?.access_token) throw new Error('Sign in first.');
  const res = await fetch(`${apiBaseUrl}/api/waitlist/withdraw`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not update the waiting list.');
  return json;
}
async function waitlistRoom({ providerId, providerRole } = {}) {
  if (!apiBaseUrl || !state.session?.access_token) return { entries: [] };
  const q = new URLSearchParams({ providerId: String(providerId), providerRole }).toString();
  const res = await fetch(`${apiBaseUrl}/api/waitlist/room?${q}`, { headers: { Authorization: `Bearer ${state.session.access_token}` } });
  return res.ok ? res.json() : { entries: [] };
}
async function waitlistInvite(entryId) {
  if (!apiBaseUrl || !state.session?.access_token) throw new Error('Sign in first.');
  const res = await fetch(`${apiBaseUrl}/api/waitlist/invite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not send the invite.');
  return json;
}
```

- [ ] **Step 2: Expose the bridge (next to `window.ShapeBookings`)**

```js
window.ShapeWaitlist = {
  join: waitlistJoin,
  mine: waitlistMine,
  withdraw: waitlistWithdraw,
  room: waitlistRoom,
  invite: waitlistInvite,
};
```

- [ ] **Step 3: Parse-check the file**

Run: `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/services/shapeBackend.js','utf8'),{sourceType:'module',plugins:['jsx']})"`
Expected: no output (parse OK).

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/services/shapeBackend.js
git add mobile-app/src/services/shapeBackend.js
git commit -m "feat(waitlist): window.ShapeWaitlist mobile bridge"
```

---

## Task 10: Client CTA on the mobile coach profile

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — in `BSSignalCoachProfile`, where the at-capacity notice / subscribe CTA renders.

**Interfaces:**
- Consumes: `window.ShapeWaitlist`.

- [ ] **Step 1: Add a waitlist state + effect near the top of `BSSignalCoachProfile`**

Locate `BSSignalCoachProfile({ person, ... })` (~line 9227). Add, alongside the other hooks:

```jsx
const [wl, setWl] = useStateBSC(null); // { status, position, entryId } | null
const wlBusy = useRefBSC(false);
useEffectBSC(() => {
  let live = true;
  (async () => {
    try {
      const r = await window.ShapeWaitlist?.mine?.();
      if (!live) return;
      const mineEntry = (r?.entries || []).find(
        (e) => String(e.providerId) === String(person.providerId) && e.providerRole === (isNutri ? 'nutritionist' : 'trainer')
      );
      setWl(mineEntry ? { status: mineEntry.status, position: mineEntry.position, entryId: mineEntry.id } : null);
    } catch { /* leave null */ }
  })();
  return () => { live = false; };
}, [person.providerId, isNutri]);
```

(Use the file's existing hook aliases — `useStateBSC`/`useEffectBSC`/`useRefBSC` — matching the surrounding code.)

- [ ] **Step 2: Render the CTA where the "at capacity" notice shows**

When the coach is at capacity, replace the dead-end notice with the stateful CTA (a `BSPlate` for the live invited state; quiet button otherwise). Insert where the profile currently renders the capacity notice / subscribe button:

```jsx
{coachAtCapacity && (
  wl?.status === 'invited' ? (
    <BSPlate accent={t.GREEN}>
      <BSEyebrow color={t.GREEN}>You're invited</BSEyebrow>
      <div style={{ fontFamily: t.DISPLAY, fontSize: 18, color: t.INK, margin: '4px 0 10px' }}>
        {person.who} has room for you.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => onBookOrSubscribe?.()} style={primaryBtnStyle}>Book now</button>
        <button onClick={async () => { if (wlBusy.current) return; wlBusy.current = true; try { await window.ShapeWaitlist.withdraw(wl.entryId); setWl(null); } finally { wlBusy.current = false; } }} style={quietBtnStyle}>Decline</button>
      </div>
    </BSPlate>
  ) : wl ? (
    <div style={quietCardStyle}>
      <BSEyebrow color={t.RUST}>On the waiting list</BSEyebrow>
      <div style={{ color: t.INK70, fontSize: 13, margin: '4px 0 10px' }}>You're #{wl.position} in line. {person.who} will invite you when a spot opens.</div>
      <button onClick={async () => { if (wlBusy.current) return; wlBusy.current = true; try { await window.ShapeWaitlist.withdraw(wl.entryId); setWl(null); } finally { wlBusy.current = false; } }} style={quietBtnStyle}>Leave the list</button>
    </div>
  ) : (
    <div style={quietCardStyle}>
      <BSEyebrow color={t.RUST}>At capacity</BSEyebrow>
      <div style={{ color: t.INK70, fontSize: 13, margin: '4px 0 10px' }}>{person.who} isn't taking new clients right now. Join the waiting list to be first in line.</div>
      <button onClick={async () => { if (wlBusy.current) return; wlBusy.current = true; try { const r = await window.ShapeWaitlist.join({ providerId: person.providerId, providerRole: isNutri ? 'nutritionist' : 'trainer' }); setWl({ status: r.status, position: r.position }); } catch (e) { window.bsToast?.(e.message); } finally { wlBusy.current = false; } }} style={primaryBtnStyle}>Join the waiting list</button>
    </div>
  )
)}
```

Reuse the file's existing button/card style objects (match a nearby CTA); `coachAtCapacity` = the profile's existing effective-at-capacity boolean (reuse it; if none exists, derive from the coach row's `at_capacity`/`capacity_resume_at`). Signed-out members: gate the join button behind the existing sign-in prompt used by subscribe.

- [ ] **Step 3: Parse-check**

Run: `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(waitlist): client join/leave/invited CTA on mobile coach profile"
```

---

## Task 11: Coach waiting-room view (mobile)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — near the coach capacity toggle (~line 20088).

**Interfaces:**
- Consumes: `window.ShapeWaitlist.room`, `window.ShapeWaitlist.invite`.

- [ ] **Step 1: Load the room when the coach is a provider**

Add state + effect in the coach settings component that owns `capacity`:

```jsx
const [room, setRoom] = useStateBSC({ entries: [] });
const reloadRoom = useCallbackBSC(async () => {
  const cap = capacity; // has { providerId, role } from getCapacity
  if (!cap?.providerId) return;
  try { setRoom(await window.ShapeWaitlist.room({ providerId: cap.providerId, providerRole: cap.role })); } catch { /* ignore */ }
}, [capacity]);
useEffectBSC(() => { reloadRoom(); }, [reloadRoom]);
```

- [ ] **Step 2: Render the waiting room under the capacity toggle**

```jsx
<div style={{ padding: `10px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
  <BSEyebrow color={t.INK50}>Waiting room ({room.entries.filter(e => e.position).length})</BSEyebrow>
  {room.entries.filter(e => e.position).length === 0 ? (
    <div style={{ color: t.INK50, fontSize: 12, marginTop: 6 }}>No one waiting yet. When you're at capacity, clients can join here.</div>
  ) : room.entries.map((e) => (
    <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: `1px solid ${t.HAIR}` }}>
      <div>
        <div style={{ color: t.INK, fontSize: 14 }}>{e.position ? `#${e.position} · ` : ''}{e.clientName || 'Member'}</div>
        {e.note ? <div style={{ color: t.INK50, fontSize: 12 }}>{e.note}</div> : null}
        <div style={{ color: t.INK50, fontSize: 11 }}>{e.status === 'invited' ? 'Invited' : e.status === 'waiting' ? 'Waiting' : e.status}</div>
      </div>
      {(e.status === 'waiting') && (
        <button onClick={async () => { try { await window.ShapeWaitlist.invite(e.id); await reloadRoom(); } catch (err) { window.bsToast?.(err.message); } }} style={primaryBtnStyle}>Invite</button>
      )}
    </div>
  ))}
</div>
```

- [ ] **Step 3: Parse-check + build**

Run: `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"`
Then from `mobile-app/`: `VITE_BASE=/m/ npm run build`
Expected: parse OK, build succeeds.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(waitlist): coach waiting-room view (mobile)"
```

---

## Task 12: Website — client join CTA on the coach profile

**Files:**
- Modify: `public/trainer-profile.html` and `public/nutritionist-profile.html` — the at-capacity notice block (trainer ~line 297–299 `#…CapacityNotice`; the `effective` at-capacity branch computes ~line 360). The session token comes from `window.shapeDb.getSession()` (already used on these pages, e.g. trainer ~line 373).

**Interfaces:**
- Consumes: `/api/waitlist/{join,mine,withdraw}` — same-origin `fetch` with `Authorization: Bearer <session.access_token>`.

- [ ] **Step 1: Add a container inside the at-capacity notice**

Find the at-capacity notice element (the block shown when `effective` is true, holding "Currently at capacity."). Add a mount point at the end of that block:

```html
<div id="tpWaitlist" style="margin-top:12px;"></div>
```

- [ ] **Step 2: Add the CTA renderer (concrete, no page-specific deps beyond `window.shapeDb`)**

Add this script near the profile's existing capacity logic, and call `renderWaitlistCTA(id, role)` in the branch where `effective` is true AND the viewer is not the owner (the page already computes `effective` and the owner check ~line 373-379). `role` is `'trainer'` on trainer-profile, `'nutritionist'` on nutritionist-profile.

```html
<script>
async function renderWaitlistCTA(providerId, providerRole) {
  var el = document.getElementById('tpWaitlist');
  if (!el) return;
  var session = await window.shapeDb.getSession();
  var token = session && session.access_token;
  if (!token) { el.innerHTML = '<a href="/login">Sign in to join the waiting list →</a>'; return; }
  function authFetch(url, opts) {
    opts = opts || {}; opts.headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {});
    return fetch(url, opts);
  }
  var mine = await authFetch('/api/waitlist/mine').then(function (r) { return r.json(); }).catch(function () { return { entries: [] }; });
  var entry = (mine.entries || []).find(function (e) { return String(e.providerId) === String(providerId) && e.providerRole === providerRole; });
  if (!entry) {
    el.innerHTML = '<button id="wlJoin" class="btn">Join the waiting list</button>';
    document.getElementById('wlJoin').onclick = async function () {
      var r = await authFetch('/api/waitlist/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ providerId: providerId, providerRole: providerRole }) }).then(function (x) { return x.json(); });
      if (r.error) { alert(r.error); return; }
      renderWaitlistCTA(providerId, providerRole);
    };
  } else if (entry.status === 'invited') {
    el.innerHTML = "<strong style='color:#86efac;'>You're invited — book before this coach reopens to everyone.</strong><div style='margin-top:8px;'><button id='wlBook' class='btn'>Book now</button> <button id='wlDecline' class='btn btn-ghost'>Decline</button></div>";
    // Reveal/enable the page's normal Subscribe/Book CTAs for this invited client:
    document.getElementById('wlBook').onclick = function () { document.getElementById('subscribeBtn') && document.getElementById('subscribeBtn').click(); };
    document.getElementById('wlDecline').onclick = async function () {
      await authFetch('/api/waitlist/withdraw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entryId: entry.id }) });
      renderWaitlistCTA(providerId, providerRole);
    };
  } else {
    el.innerHTML = "<div>You're #" + entry.position + " in line.</div><button id='wlLeave' class='btn btn-ghost' style='margin-top:8px;'>Leave the list</button>";
    document.getElementById('wlLeave').onclick = async function () {
      await authFetch('/api/waitlist/withdraw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entryId: entry.id }) });
      renderWaitlistCTA(providerId, providerRole);
    };
  }
}
</script>
```

Discovery for this step: confirm the actual notice element id and the Subscribe button id on each page (grep for `subscribe`/`Book`), and wire `wlBook` to whichever the page uses. Use the page's existing button classes for visual consistency.

- [ ] **Step 3: Verify** — serve the site locally / open a preview; as a signed-in non-owner viewing an at-capacity coach, confirm Join → "#N in line" → Leave, and (after a coach invite) the invited state with a working Book. No console errors.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' public/trainer-profile.html public/nutritionist-profile.html
git add public/trainer-profile.html public/nutritionist-profile.html
git commit -m "feat(waitlist): client join CTA on website coach profiles"
```

---

## Task 13: Website — coach waiting-room (owner view of the profile)

**Files:**
- Modify: `public/trainer-profile.html` and `public/nutritionist-profile.html` — the **owner** branch (`setupOwnerToggle(id, ...)`, trainer ~line 379), where the coach sees their own capacity toggle. The waiting room renders there for the owner.

**Interfaces:**
- Consumes: `/api/waitlist/{room,invite}` — `fetch` with `Authorization: Bearer <session.access_token>`.

- [ ] **Step 1: Add a room mount point near the owner toggle**

Inside the owner-only region (where `setupOwnerToggle` writes its markup / `#tpCapacityMsg` lives), add:

```html
<div id="tpWaitroom" style="margin-top:14px;"></div>
```

- [ ] **Step 2: Add the room renderer and call it from the owner branch**

Add this script and call `renderWaitroom(id, role)` inside the owner branch (the code path that runs when the viewer owns this profile). `role` is `'trainer'` / `'nutritionist'` per page.

```html
<script>
async function renderWaitroom(providerId, providerRole) {
  var el = document.getElementById('tpWaitroom');
  if (!el) return;
  var session = await window.shapeDb.getSession();
  var token = session && session.access_token;
  if (!token) return;
  function authFetch(url, opts) {
    opts = opts || {}; opts.headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {});
    return fetch(url, opts);
  }
  var q = 'providerId=' + encodeURIComponent(providerId) + '&providerRole=' + encodeURIComponent(providerRole);
  var data = await authFetch('/api/waitlist/room?' + q).then(function (r) { return r.json(); }).catch(function () { return { entries: [] }; });
  var active = (data.entries || []).filter(function (e) { return e.position; });
  var html = '<div style="font-weight:600;margin-bottom:6px;">Waiting room (' + active.length + ')</div>';
  if (!active.length) {
    html += '<div style="font-size:0.86rem;color:var(--text-muted);">No one waiting yet. When you\'re at capacity, clients can join here.</div>';
    el.innerHTML = html; return;
  }
  (data.entries || []).forEach(function (e) {
    if (!e.position && e.status !== 'invited') return;
    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-top:1px solid rgba(255,255,255,0.08);">'
      + '<div><div>' + (e.position ? '#' + e.position + ' · ' : '') + (e.clientName || 'Member') + '</div>'
      + (e.note ? '<div style="font-size:0.8rem;color:var(--text-muted);">' + e.note + '</div>' : '')
      + '<div style="font-size:0.75rem;color:var(--text-muted);">' + (e.status === 'invited' ? 'Invited' : 'Waiting') + '</div></div>'
      + (e.status === 'waiting' ? '<button class="btn" data-invite="' + e.id + '">Invite</button>' : '')
      + '</div>';
  });
  el.innerHTML = html;
  Array.prototype.forEach.call(el.querySelectorAll('[data-invite]'), function (btn) {
    btn.onclick = async function () {
      var r = await authFetch('/api/waitlist/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entryId: btn.getAttribute('data-invite') }) }).then(function (x) { return x.json(); });
      if (r.error) { alert(r.error); return; }
      renderWaitroom(providerId, providerRole);
    };
  });
}
</script>
```

Escape `clientName`/`note` if the page has an HTML-escape helper (mirror how it renders other user text); otherwise wrap them with a small `escapeHtml` like `src/app/api/consultation/route.ts` uses.

- [ ] **Step 3: Verify** — view your own coach profile as the owner; confirm the room lists waiting members in order and **Invite** flips them to "Invited" (and the member sees the invite state from Task 12). No console errors.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' public/trainer-profile.html public/nutritionist-profile.html
git add public/trainer-profile.html public/nutritionist-profile.html
git commit -m "feat(waitlist): coach waiting-room on website profile (owner view)"
```

---

## Task 14: End-to-end verification + `public/m` sync + PR

**Files:** none (verification).

- [ ] **Step 1: Rebuild + sync the mobile bundle** — from `mobile-app/`: `VITE_BASE=/m/ npm run build`; from repo root: `rm -rf public/m && cp -r mobile-app/dist public/m` (only if `public/m` is committed in this repo state; if `public/m` is gitignored/deploy-built, skip and rely on CI).
- [ ] **Step 2: Full typecheck + build** — `npx tsc --noEmit` && `npx next build`.
- [ ] **Step 3: Run the unit tests** — `node --test tests/waitlist.test.mjs` → PASS.
- [ ] **Step 4: Manual end-to-end** (two accounts: a coach + a member):
  1. Coach flips **at capacity** on.
  2. Member opens the coach profile → **Join the waiting list** → sees **#1 in line**.
  3. Second member joins → sees **#2**.
  4. Coach opens **Waiting room** → sees both in order → taps **Invite** on #1.
  5. Invited member gets the notification, opens the profile → **Book now** succeeds **even though the coach is still at capacity** (first-dibs bypass); their entry becomes `booked`.
  6. #2 declines/leaves → coach still sees the room; can invite whoever is now #1.
  7. A third, uninvited member still sees the at-capacity/join UI (not booking).
- [ ] **Step 5: Open the PR** — push `claude/coach-waitlist`; open a PR; wait for CI green + CodeRabbit; address findings; then (with the user's OK) squash-merge and post the migration raw-link for the owner to run.

---

## Notes for the implementer

- **Reads that need positions** fetch the coach's active rows and rank in memory via `computePositions` — keep that the single ranking path (don't re-implement ranking in the UI).
- **Ownership** is always checked server-side against `owner_id`; never trust a `providerId` from the client for coach actions.
- **Idempotency:** join tolerates the `23505` unique-violation race; withdraw/invite are safe to repeat (status guards).
- **Honest empty states:** an empty waiting room says so; never render placeholder members.
