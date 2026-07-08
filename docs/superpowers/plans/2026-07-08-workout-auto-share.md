# Workout Auto-Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Device-synced and in-app-logged workouts auto-post to the member's profile + community feed at the privacy their own settings resolve to (Share toggle × profile visibility → `public` / `followers` / `private`), consistently across all six write sites.

**Architecture:** One pure rule module (`workoutShare.mjs`, mirrored in `src/lib/workout-share.ts`) resolves the post privacy from the member's `user_goals('client_settings')` doc. The five server sync paths (Strava / Apple Health / Oura / Whoop / new Garmin) and the existing in-app session poster all consume it, plus a ±20-minute cross-source dedup guard, a never-loosen rule on re-sync updates, retroactive tightening from Settings, and a one-time first-share notice.

**Tech Stack:** Next.js API routes (TS), Supabase (no migration — Spec 1's `followers` tier is live), plain ES modules + `node --test`, mobile Capacitor/Vite build.

## Global Constraints

- **Dependency:** #1610 + migration `2026-07-08-followers-post-visibility.sql` are on main/applied. Nothing here adds schema.
- **Defaults:** missing settings doc/fields resolve to Share **On** + visibility **Public** → `public` (the Settings pills' first options).
- **The rule:** On+Public → `public` · On+"Just friends" → `followers` · On+Private → `private` · Off+anything → `private`.
- **Never loosen:** sync UPDATE branches must not rewrite `privacy` (strip it from update payloads); loosening settings never touches past posts; tightening updates all past auto-posts (`source_provider is not null`).
- **Dedup:** skip creating a post when another **different-provider** workout post exists within **±20 min** (compare `created_at`, which device posts set to the activity START — the in-app post must too).
- **No +5 farming:** auto-posts never call `award_community_post` (the in-app path currently does — must be gated off).
- **Sleep/recovery never post** (unchanged; Oura/Whoop only post workouts today — don't widen).
- **Base check before editing:** `git fetch origin main && git rev-parse --short HEAD origin/main`; branch `claude/workout-autoshare-build`.
- **CRLF:** `sed -i 's/\r$//' <files>` before every commit. Commits end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Verify per task: JSX/JS parse-check, `npx tsc --noEmit` for TS (baseline = 3 known errors, none in touched files), `VITE_BASE=/m/ npm run build` for mobile changes, full `npm test`.

---

## File structure

- **Create** `mobile-app/src/services/workoutShare.mjs` — pure: `bsWorkoutSharePrivacy(doc)`, `bsIsDuplicateWorkoutPost(rows, startISO, provider)`, `BS_PRIVACY_RANK`.
- **Create** `tests/workout-share.test.mjs`; **modify** `package.json` test list.
- **Create** `src/lib/workout-share.ts` — TS mirror of the pure fns + `resolveWorkoutSharePrivacy(client, userId)` + `findCrossSourceDuplicate(client, userId, startISO, provider)` + `maybeSendFirstShareNotice(client, userId, privacy)`.
- **Modify** `src/app/api/integrations/strava/sync/route.ts` (payload L213-278, loop L441-500), `apple-health/sync/route.ts` (L56-92, L120-146), `oura/sync/route.ts` (L89-127, L144-170), `whoop/sync/route.ts` (L70-131, L171-197), `garmin/webhook/route.ts` (activities loop L148-176).
- **Modify** `mobile-app/src/services/shapeBackend.js` — `saveWorkoutSessionLog` (L2230-2345), `createCommunityPost` (L2459+, add `createdAt`/`autoShare` params), new `tightenAutoPosts`, `ShapeCommunity` export.
- **Modify** `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — both `setPref` handler sites (~L21095-21120): retro-tighten hook on `shareWorkoutData` / `profileVisibility`.

---

### Task 1: Pure rule + dedup module (source of truth) with tests

**Files:**
- Create: `mobile-app/src/services/workoutShare.mjs`
- Create: `tests/workout-share.test.mjs`
- Modify: `package.json:9` (append ` tests/workout-share.test.mjs` inside the test script string)

**Interfaces:**
- Produces: `bsWorkoutSharePrivacy(doc) → 'public'|'followers'|'private'` — `doc` is the raw `client_settings` object (or null). Reads `doc.shareWorkoutData` (`'On'|'Off'`, default `'On'`) and `doc.profileVisibility` (`'Public'|'Just friends'|'Private'`, default `'Public'`).
- Produces: `bsIsDuplicateWorkoutPost(rows, startISO, provider) → boolean` — `rows`: `[{ source_provider, created_at }]`; true when any row has a non-null `source_provider !== provider` and `|created_at − startISO| ≤ 20 min`.
- Produces: `BS_PRIVACY_RANK = { public: 0, followers: 1, private: 2 }` (higher = stricter).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/workout-share.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsWorkoutSharePrivacy, bsIsDuplicateWorkoutPost, BS_PRIVACY_RANK } from '../mobile-app/src/services/workoutShare.mjs';

test('share rule: defaults (missing doc/fields) resolve to public', () => {
  assert.equal(bsWorkoutSharePrivacy(null), 'public');
  assert.equal(bsWorkoutSharePrivacy({}), 'public');
  assert.equal(bsWorkoutSharePrivacy({ profileVisibility: 'Public' }), 'public');
});

test('share rule: visibility maps On+Friends→followers, On+Private→private', () => {
  assert.equal(bsWorkoutSharePrivacy({ shareWorkoutData: 'On', profileVisibility: 'Just friends' }), 'followers');
  assert.equal(bsWorkoutSharePrivacy({ shareWorkoutData: 'On', profileVisibility: 'Private' }), 'private');
});

test('share rule: Off wins over any visibility', () => {
  assert.equal(bsWorkoutSharePrivacy({ shareWorkoutData: 'Off', profileVisibility: 'Public' }), 'private');
  assert.equal(bsWorkoutSharePrivacy({ shareWorkoutData: 'Off', profileVisibility: 'Just friends' }), 'private');
});

test('dedup: different provider within ±20min is a duplicate; same provider / outside window is not', () => {
  const start = '2026-07-08T10:00:00Z';
  const mk = (p, iso) => ({ source_provider: p, created_at: iso });
  assert.equal(bsIsDuplicateWorkoutPost([mk('strava', '2026-07-08T10:10:00Z')], start, 'shape_session'), true);
  assert.equal(bsIsDuplicateWorkoutPost([mk('strava', '2026-07-08T09:41:00Z')], start, 'shape_session'), true);
  assert.equal(bsIsDuplicateWorkoutPost([mk('shape_session', '2026-07-08T10:05:00Z')], start, 'shape_session'), false); // same source (its own upsert dedup owns this)
  assert.equal(bsIsDuplicateWorkoutPost([mk('strava', '2026-07-08T10:21:00Z')], start, 'shape_session'), false);      // outside window
  assert.equal(bsIsDuplicateWorkoutPost([mk(null, '2026-07-08T10:00:00Z')], start, 'shape_session'), false);          // manual post
  assert.equal(bsIsDuplicateWorkoutPost([], start, 'strava'), false);
  assert.equal(bsIsDuplicateWorkoutPost([mk('strava', '2026-07-08T10:00:00Z')], 'not-a-date', 'shape_session'), false); // bad input → never block
});

test('privacy rank orders public < followers < private', () => {
  assert.ok(BS_PRIVACY_RANK.public < BS_PRIVACY_RANK.followers && BS_PRIVACY_RANK.followers < BS_PRIVACY_RANK.private);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/workout-share.test.mjs`
Expected: FAIL — `Cannot find module '.../workoutShare.mjs'`.

- [ ] **Step 3: Implement**

```javascript
// mobile-app/src/services/workoutShare.mjs
// The ONE rule for what privacy an auto-posted workout gets, from the member's
// own client_settings doc: the Share toggle gates everything; profile
// visibility scopes it. Defaults mirror the Settings pills' first options
// (On · Public), so a member who never opened Settings shares publicly.
// Mirrored in src/lib/workout-share.ts (server twin) — keep in sync.
export const BS_PRIVACY_RANK = { public: 0, followers: 1, private: 2 };

export function bsWorkoutSharePrivacy(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  if (String(d.shareWorkoutData || 'On') === 'Off') return 'private';
  const vis = String(d.profileVisibility || 'Public');
  if (vis === 'Private') return 'private';
  if (vis === 'Just friends') return 'followers';
  return 'public';
}

// Cross-source guard: a watch and the phone must not both post one workout.
// True when another DIFFERENT provider's workout post sits within ±20 minutes
// of this activity's start. Same-provider rows are the per-source upsert's
// job; manual posts (null source_provider) never count. Bad dates → false
// (never block a post on unparseable input).
const WINDOW_MS = 20 * 60 * 1000;
export function bsIsDuplicateWorkoutPost(rows, startISO, provider) {
  const start = Date.parse(startISO || '');
  if (!Number.isFinite(start)) return false;
  return (Array.isArray(rows) ? rows : []).some((r) => {
    if (!r || !r.source_provider || r.source_provider === provider) return false;
    const at = Date.parse(r.created_at || '');
    return Number.isFinite(at) && Math.abs(at - start) <= WINDOW_MS;
  });
}
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/workout-share.test.mjs` → PASS (5 tests). Then append ` tests/workout-share.test.mjs` to the `"test"` script string in `package.json:9` and run `npm test` → all pass (473 expected).

- [ ] **Step 5: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/services/workoutShare.mjs tests/workout-share.test.mjs
git add mobile-app/src/services/workoutShare.mjs tests/workout-share.test.mjs package.json
git commit -m "feat(share): pure workout-share rule + cross-source dedup + tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Server twin — resolver, dedup query, first-share notice

**Files:**
- Create: `src/lib/workout-share.ts`

**Interfaces:**
- Consumes: Task 1's semantics (mirrored logic, same vectors).
- Produces (used by Tasks 3–5):
  - `workoutSharePrivacy(doc: Record<string, unknown> | null): 'public'|'followers'|'private'`
  - `resolveWorkoutSharePrivacy(client: SupabaseClient, userId: string): Promise<'public'|'followers'|'private'>` — reads `user_goals` (`user_id` + `kind='client_settings'`, column `data`); any read error → `'private'` (fail-closed, never accidentally publish).
  - `isDuplicateWorkoutPost(rows: Array<{source_provider: string|null; created_at: string|null}>, startISO: string, provider: string): boolean`
  - `findCrossSourceDuplicate(client, userId, startISO, provider): Promise<boolean>` — queries the ±20-min window server-side; query error → `false` (dedup is best-effort, never blocks a sync).
  - `maybeSendFirstShareNotice(client, userId, privacy): Promise<void>` — no-op unless `privacy !== 'private'`; reads the settings doc, and if `data.autoShareNoticeAt` is absent, stamps it (merge + upsert `onConflict: 'user_id,kind'`) and writes one in-app notification via `createNotification` **with a service-role client** (`createAdminClient()` — the caller-scoped sync clients can't insert notifications). Best-effort, never throws.

- [ ] **Step 1: Implement**

```typescript
// src/lib/workout-share.ts
// Server twin of mobile-app/src/services/workoutShare.mjs — keep the pure
// parts in sync with the .mjs (the unit-tested source of truth).
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notify';

export type SharePrivacy = 'public' | 'followers' | 'private';

export function workoutSharePrivacy(doc: Record<string, unknown> | null): SharePrivacy {
  const d = doc && typeof doc === 'object' ? doc : {};
  if (String((d as { shareWorkoutData?: unknown }).shareWorkoutData ?? 'On') === 'Off') return 'private';
  const vis = String((d as { profileVisibility?: unknown }).profileVisibility ?? 'Public');
  if (vis === 'Private') return 'private';
  if (vis === 'Just friends') return 'followers';
  return 'public';
}

// Fail CLOSED on a read error — a transient settings failure must degrade to
// the old behavior (private), never accidentally publish someone's workout.
export async function resolveWorkoutSharePrivacy(client: SupabaseClient, userId: string): Promise<SharePrivacy> {
  try {
    const { data, error } = await client
      .from('user_goals')
      .select('data')
      .eq('user_id', userId)
      .eq('kind', 'client_settings')
      .maybeSingle();
    if (error) return 'private';
    return workoutSharePrivacy((data?.data ?? null) as Record<string, unknown> | null);
  } catch {
    return 'private';
  }
}

const WINDOW_MS = 20 * 60 * 1000;
export function isDuplicateWorkoutPost(
  rows: Array<{ source_provider: string | null; created_at: string | null }>,
  startISO: string,
  provider: string,
): boolean {
  const start = Date.parse(startISO || '');
  if (!Number.isFinite(start)) return false;
  return (rows || []).some((r) => {
    if (!r || !r.source_provider || r.source_provider === provider) return false;
    const at = Date.parse(r.created_at || '');
    return Number.isFinite(at) && Math.abs(at - start) <= WINDOW_MS;
  });
}

// ±20-min different-provider window (device posts stamp created_at = activity
// start). Best-effort: any error → not a duplicate (never block the sync).
export async function findCrossSourceDuplicate(
  client: SupabaseClient, userId: string, startISO: string, provider: string,
): Promise<boolean> {
  const start = Date.parse(startISO || '');
  if (!Number.isFinite(start)) return false;
  try {
    const { data, error } = await client
      .from('community_posts')
      .select('source_provider, created_at')
      .eq('author_id', userId)
      .not('source_provider', 'is', null)
      .neq('source_provider', provider)
      .gte('created_at', new Date(start - WINDOW_MS).toISOString())
      .lte('created_at', new Date(start + WINDOW_MS).toISOString())
      .limit(5);
    if (error) return false;
    return isDuplicateWorkoutPost(data ?? [], startISO, provider);
  } catch {
    return false;
  }
}

// One-time heads-up the first time a member's workout auto-shares beyond
// private. Dedup stamp lives in the same client_settings doc
// (data.autoShareNoticeAt); the notification insert needs service-role
// (notifications RLS has no self-insert path). Best-effort, never throws.
export async function maybeSendFirstShareNotice(
  client: SupabaseClient, userId: string, privacy: SharePrivacy,
): Promise<void> {
  if (privacy === 'private') return;
  try {
    const { data, error } = await client
      .from('user_goals')
      .select('data')
      .eq('user_id', userId)
      .eq('kind', 'client_settings')
      .maybeSingle();
    if (error) return;
    const doc = (data?.data ?? {}) as Record<string, unknown>;
    if (doc.autoShareNoticeAt) return;
    const { error: upErr } = await client
      .from('user_goals')
      .upsert(
        { user_id: userId, kind: 'client_settings', data: { ...doc, autoShareNoticeAt: new Date().toISOString() } },
        { onConflict: 'user_id,kind' },
      );
    if (upErr) return; // couldn't stamp → don't notify (avoids repeat notices)
    await createNotification(createAdminClient(), {
      userId,
      type: 'general',
      title: 'Your workouts now share automatically',
      body: 'Logged and synced workouts show on your profile and in the community feed. Manage this in Settings → Share workout data.',
      route: 'settings',
    });
  } catch { /* best-effort */ }
}
```

- [ ] **Step 2: Typecheck + spot-check the upsert conflict target**

Run: `npx tsc --noEmit` → no NEW errors (baseline 3, none in `workout-share.ts`).
Run (read-only prod check via the Supabase MCP or SQL editor): `select indexdef from pg_indexes where tablename='user_goals';` → confirm a unique index on `(user_id, kind)` backing `onConflict: 'user_id,kind'`. If the unique key differs, adjust `onConflict` to match before proceeding.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' src/lib/workout-share.ts
git add src/lib/workout-share.ts
git commit -m "feat(share): server share resolver + cross-source dedup query + first-share notice

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Strava sync honors the rule (the template route)

**Files:**
- Modify: `src/app/api/integrations/strava/sync/route.ts` — imports (top), `activityPostPayload` (L213-278), the sync loop (L441-500).

**Interfaces:**
- Consumes: `resolveWorkoutSharePrivacy`, `findCrossSourceDuplicate`, `maybeSendFirstShareNotice`, `SharePrivacy` from Task 2.

- [ ] **Step 1: Import + resolve once per sync run**

Add to the imports:
```typescript
import { resolveWorkoutSharePrivacy, findCrossSourceDuplicate, maybeSendFirstShareNotice, type SharePrivacy } from '@/lib/workout-share';
```
In the sync function, right before the `for (const activity of activities)` loop (L441), after `client`/`userId` are in scope:
```typescript
  // The member's own share level — resolved once per sync run (fail-closed to
  // 'private' on any settings read error).
  const sharePrivacy = await resolveWorkoutSharePrivacy(client, userId);
```

- [ ] **Step 2: Thread privacy through the payload builder**

`activityPostPayload` (L213) gains a `sharePrivacy: SharePrivacy` parameter (append it to the signature and every call site). Replace L232 and L265:
```typescript
    privacy: sharePrivacy,
```
```typescript
      tags: sharePrivacy === 'private' ? ['STRAVA', 'PRIVATE'] : ['STRAVA'],
```

- [ ] **Step 3: Never-loosen on update + dedup + notice in the loop**

Replace the write block (L488-497):
```typescript
    if (!existing?.id) {
      // Cross-source guard: another provider (or the in-app logger) already
      // posted this workout within ±20 min → keep the activities row, skip the
      // social post (first-writer-wins, silent).
      const dup = await findCrossSourceDuplicate(client, userId, payload.created_at, 'strava');
      if (dup) continue;
    }

    // Updates never rewrite privacy — the member may have retro-tightened, and
    // a re-sync must not loosen (or re-decide) an existing post's audience.
    const { privacy: _privacy, ...updatePayload } = payload;
    const result = existing?.id
      ? await client.from('community_posts').update(updatePayload).eq('id', existing.id)
      : await client.from('community_posts').insert(payload);

    if (result.error) {
      console.error('[shape-api] strava activity write failed:', result.error.message);
      errors.push('Could not save an activity.');
    } else {
      imported += 1;
      if (!existing?.id) await maybeSendFirstShareNotice(client, userId, sharePrivacy);
    }
```

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit` → no new errors.
```bash
sed -i 's/\r$//' src/app/api/integrations/strava/sync/route.ts
git add src/app/api/integrations/strava/sync/route.ts
git commit -m "feat(share): strava sync posts at the member's resolved share privacy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Apple Health, Oura, Whoop — same recipe, each wired explicitly

**Files:**
- Modify: `src/app/api/integrations/apple-health/sync/route.ts` (builder L56, privacy L70, tags L86, loop L120-146)
- Modify: `src/app/api/integrations/oura/sync/route.ts` (builder L89, privacy L104, tags L121, loop L144-170)
- Modify: `src/app/api/integrations/whoop/sync/route.ts` (builder L70, privacy L104, tags L126, loop L171-197)

**Interfaces:** same as Task 3.

For EACH of the three files, apply exactly:

- [ ] **Step 1 (×3): Import**

```typescript
import { resolveWorkoutSharePrivacy, findCrossSourceDuplicate, maybeSendFirstShareNotice, type SharePrivacy } from '@/lib/workout-share';
```

- [ ] **Step 2 (×3): Resolve once before each file's workout loop**

```typescript
  const sharePrivacy = await resolveWorkoutSharePrivacy(client, userId);
```
(Place after `client` + `userId` resolve; these three routes use the caller-scoped `clientForRequest` client like Strava. Use each file's actual user variable — `user.id` where there is no `userId` local.)

- [ ] **Step 3 (×3): Builder takes `sharePrivacy: SharePrivacy`; replace the hardcoded lines**

- `privacy: 'private',` → `privacy: sharePrivacy,` (apple-health L70 · oura L104 · whoop L104)
- tags: `['APPLE HEALTH', 'PRIVATE']` → `sharePrivacy === 'private' ? ['APPLE HEALTH', 'PRIVATE'] : ['APPLE HEALTH']` (L86); same for `['OURA', …]` (L121) and `['WHOOP', …]` (L126).
- Update every builder call site to pass `sharePrivacy`.

- [ ] **Step 4 (×3): The write block — dedup on insert, strip privacy on update, notice**

Each file's block currently reads:
```typescript
    const result = existing?.id
      ? await client.from('community_posts').update(payload).eq('id', existing.id)
      : await client.from('community_posts').insert(payload);
```
Replace with (substituting each file's provider string — `'apple_health'` / `'oura'` / `'whoop'` — matching that payload's own `source_provider` value, verified in-file):
```typescript
    if (!existing?.id) {
      const dup = await findCrossSourceDuplicate(client, userId, payload.created_at, payload.source_provider);
      if (dup) continue;
    }
    const { privacy: _privacy, ...updatePayload } = payload;
    const result = existing?.id
      ? await client.from('community_posts').update(updatePayload).eq('id', existing.id)
      : await client.from('community_posts').insert(payload);
```
And after each file's success branch (`imported += 1;` or equivalent):
```typescript
      if (!existing?.id) await maybeSendFirstShareNotice(client, userId, sharePrivacy);
```
(If a file's loop uses `continue` unavailable (e.g. `for...of` inside a helper), match its control flow — the guard is "skip this activity's post".)

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → no new errors.
```bash
sed -i 's/\r$//' src/app/api/integrations/apple-health/sync/route.ts src/app/api/integrations/oura/sync/route.ts src/app/api/integrations/whoop/sync/route.ts
git add src/app/api/integrations/apple-health/sync/route.ts src/app/api/integrations/oura/sync/route.ts src/app/api/integrations/whoop/sync/route.ts
git commit -m "feat(share): apple-health/oura/whoop syncs post at the resolved share privacy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Garmin joins the pipeline

**Files:**
- Modify: `src/app/api/integrations/garmin/webhook/route.ts` — activities loop (L148-176).

**Interfaces:**
- Consumes: Task 2 helpers. The webhook runs on `createAdminClient()` (`admin`) and maps `provider_user_id → user_id` (L99-108). Note: the resolver/dedup/notice all accept any `SupabaseClient` — admin included.

- [ ] **Step 1: Import + per-user caches**

```typescript
import { resolveWorkoutSharePrivacy, findCrossSourceDuplicate, maybeSendFirstShareNotice, type SharePrivacy } from '@/lib/workout-share';
```
Before the activities loop (L148), add per-webhook caches (one webhook can carry many users' items):
```typescript
  // Per-user share level + author identity, resolved once per webhook delivery.
  const shareByUser = new Map<string, SharePrivacy>();
  const profileByUser = new Map<string, { full_name?: string | null; role?: string | null } | null>();
  const shareFor = async (uid: string): Promise<SharePrivacy> => {
    if (!shareByUser.has(uid)) shareByUser.set(uid, await resolveWorkoutSharePrivacy(admin, uid));
    return shareByUser.get(uid) as SharePrivacy;
  };
  const profileFor = async (uid: string) => {
    if (!profileByUser.has(uid)) {
      const { data } = await admin.from('profiles').select('full_name, role').eq('id', uid).maybeSingle();
      profileByUser.set(uid, (data ?? null) as { full_name?: string | null; role?: string | null } | null);
    }
    return profileByUser.get(uid) ?? null;
  };
```

- [ ] **Step 2: Post payload + upsert inside the activities loop**

After the existing `admin.from('activities').upsert(...)` (L158-173) and `acts += 1;`, add (mirroring the Whoop payload shape — summary stats only, no streams; reuse the loop's existing `type` / `mins` / `started` / `avgHr` / `maxHr` / `externalId` locals):
```typescript
    // Community post (parity with the other providers). Whoop-shaped summary
    // payload — Garmin push sends no per-second streams.
    const sharePrivacy = await shareFor(uid);
    const profile = await profileFor(uid);
    const distMi = num(a.distanceInMeters) != null ? `${((a.distanceInMeters as number) / 1609.344).toFixed(2)} mi` : null;
    const kcal = num(a.activeKilocalories) != null ? `${Math.round(a.activeKilocalories as number)} kcal` : null;
    const workoutStats: { label: string; value: string }[] = [];
    if (mins != null) workoutStats.push({ label: 'Duration', value: `${mins} min` });
    if (distMi) workoutStats.push({ label: 'Distance', value: distMi });
    if (avgHr != null) workoutStats.push({ label: 'Avg HR', value: `${avgHr} bpm` });
    if (maxHr != null) workoutStats.push({ label: 'Max HR', value: `${maxHr} bpm` });
    if (kcal) workoutStats.push({ label: 'Calories', value: kcal });

    const { data: existingPost, error: postLookupErr } = await admin
      .from('community_posts')
      .select('id')
      .eq('author_id', uid)
      .eq('source_provider', 'garmin')
      .eq('source_activity_id', externalId)
      .maybeSingle();
    if (postLookupErr) { console.error('[shape-api] garmin post lookup failed:', postLookupErr.message); continue; }

    const postPayload = {
      author_id: uid,
      author_name: profile?.full_name || 'Shape member',
      author_role: ((r) => (r === 'trainer' || r === 'nutritionist' || r === 'client' ? r : 'client'))(String(profile?.role || 'client')),
      privacy: sharePrivacy,
      activity_type: type,
      title: type.charAt(0).toUpperCase() + type.slice(1),
      status: 'Imported from Garmin',
      note: [type, distMi, avgHr != null ? `${avgHr} bpm avg HR` : null].filter(Boolean).join(' - ') || 'Imported from Garmin.',
      metrics: {
        provider: 'garmin',
        durationMinutes: mins,
        averageHeartRate: avgHr,
        maxHeartRate: maxHr,
        workoutStats,
        statA: workoutStats[0]?.value ?? '-',
        statB: workoutStats[1]?.value ?? '-',
        statC: workoutStats[2]?.value ?? '-',
        labels: [workoutStats[0]?.label ?? 'Duration', workoutStats[1]?.label ?? 'Distance', workoutStats[2]?.label ?? 'Avg HR'],
        tags: sharePrivacy === 'private' ? ['GARMIN', 'PRIVATE'] : ['GARMIN'],
      },
      source_provider: 'garmin',
      source_activity_id: externalId,
      created_at: started ?? new Date().toISOString(),
    };

    if (!existingPost?.id) {
      const dup = await findCrossSourceDuplicate(admin, uid, postPayload.created_at, 'garmin');
      if (dup) continue;
    }
    const { privacy: _privacy, ...updatePayload } = postPayload;
    const postResult = existingPost?.id
      ? await admin.from('community_posts').update(updatePayload).eq('id', existingPost.id)
      : await admin.from('community_posts').insert(postPayload);
    if (postResult.error) console.error('[shape-api] garmin post write failed:', postResult.error.message);
    else if (!existingPost?.id) await maybeSendFirstShareNotice(admin, uid, sharePrivacy);
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → no new errors.
```bash
sed -i 's/\r$//' src/app/api/integrations/garmin/webhook/route.ts
git add src/app/api/integrations/garmin/webhook/route.ts
git commit -m "feat(share): garmin webhook auto-posts activities like the other providers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: In-app logged sessions — resolve, idempotent id, start-time stamp, dedup, no +5, toast notice

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` — `createCommunityPost` (L2459+), `saveWorkoutSessionLog` (L2230-2345).

**Interfaces:**
- Consumes: `bsWorkoutSharePrivacy` from Task 1 (add to the existing `workoutShare.mjs`… import block at the top of shapeBackend.js: `import { bsWorkoutSharePrivacy } from './workoutShare.mjs';`).
- Produces: `createCommunityPost` gains `createdAt = ''` (ISO string → `created_at` on the insert row when non-empty) and `autoShare = false` (when true, skip the `award_community_post` call). `saveWorkoutSessionLog`'s `privacy` param defaults to `null` = "resolve from settings".

- [ ] **Step 1: `createCommunityPost` params**

Add `createdAt = '',` and `autoShare = false,` to the destructured params (L2459-2471). In the insert-row construction, add:
```javascript
    ...(createdAt ? { created_at: createdAt } : {}),
```
Locate the `award_community_post` call inside `createCommunityPost` (run `grep -n "award_community_post" mobile-app/src/services/shapeBackend.js`) and gate it:
```javascript
    // Auto-shared workout posts never earn the +5 community award — the
    // workout itself already earned its +10 (spec: no double-dipping).
    if (!autoShare) { /* existing award_community_post call, unchanged */ }
```

- [ ] **Step 2: `saveWorkoutSessionLog` — resolve + harden**

Change the signature default (L2237): `privacy = null,`. Before the `createCommunityPost` call (L2280), add:
```javascript
  // Auto-share: no explicit privacy from the caller → the member's own share
  // rule decides (Share toggle × profile visibility). Settings doc read is
  // best-effort; any failure falls back to 'private' (fail-closed).
  let resolvedPrivacy = privacy;
  if (!resolvedPrivacy) {
    try {
      const { data } = await supabase.from('user_goals').select('data')
        .eq('user_id', state.user.id).eq('kind', 'client_settings').maybeSingle();
      resolvedPrivacy = bsWorkoutSharePrivacy(data?.data || null);
    } catch (e) { resolvedPrivacy = 'private'; }
  }
  // Cross-source guard: a device (watch) post for this same workout within
  // ±20 min → skip the social post (the session itself still persisted above).
  let crossDup = false;
  try {
    const w = 20 * 60 * 1000; const s = Date.parse(sessionStartedAt);
    const { data: near } = await supabase.from('community_posts')
      .select('source_provider, created_at')
      .eq('author_id', state.user.id)
      .not('source_provider', 'is', null)
      .neq('source_provider', 'shape_session')
      .gte('created_at', new Date(s - w).toISOString())
      .lte('created_at', new Date(s + w).toISOString())
      .limit(5);
    crossDup = !!(near || []).length;
  } catch (e) { crossDup = false; }
```
Then change the post call: wrap it in `if (!crossDup) { ... }` (when skipped, set `feedPost = null` and keep the return shape `{ ...(feedPost || {}), workoutSession: structured }`), and inside it:
- `privacy,` → `privacy: resolvedPrivacy,`
- tags line (L2322): `tags: ['SENSOR', 'SESSION', ...(resolvedPrivacy === 'private' ? ['PRIVATE'] : [])],`
- `sourceActivityId: `shape-session-${Date.now()}`` → `sourceActivityId: `shape-session-${structured?.data?.id || Date.now()}`` (idempotent by session id)
- add `createdAt: sessionStartedAt,` and `autoShare: true,`
Also update the session row's privacy mapping (L2090) to treat the resolved value: `followers` is a POST tier, not a `workout_sessions` value — map `resolvedPrivacy === 'public' ? 'public' : 'private'` only when the caller passed no explicit privacy (keep the existing mapping when they did). Simplest faithful edit: leave the sessionPayload mapping reading the ORIGINAL `privacy` param but with `privacy || 'private'`.
- **First-run toast** (mobile twin of the server notice; same stamp field): after a successful non-private post,
```javascript
    if (resolvedPrivacy !== 'private') {
      try {
        const { data: sdoc } = await supabase.from('user_goals').select('data')
          .eq('user_id', state.user.id).eq('kind', 'client_settings').maybeSingle();
        const d = (sdoc && sdoc.data) || {};
        if (!d.autoShareNoticeAt) {
          await supabase.from('user_goals').upsert(
            { user_id: state.user.id, kind: 'client_settings', data: { ...d, autoShareNoticeAt: new Date().toISOString() } },
            { onConflict: 'user_id,kind' });
          window.__bsToast?.('Workouts now share to your profile + feed · Settings → Share workout data', 'ok');
        }
      } catch (e) {}
    }
```

- [ ] **Step 3: Parse, build, test, commit**

Run: `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/services/shapeBackend.js','utf8'),{sourceType:'module'})"` (from `mobile-app/`: adjust path) → OK; `cd mobile-app && VITE_BASE=/m/ npm run build` → green; `npm test` → all pass.
```bash
sed -i 's/\r$//' mobile-app/src/services/shapeBackend.js
git add mobile-app/src/services/shapeBackend.js
git commit -m "feat(share): in-app sessions auto-post by the share rule — idempotent, start-stamped, deduped, award-gated

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Settings retro-tighten

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` — new `tightenAutoPosts`, exported on `window.ShapeCommunity` (find the `window.ShapeCommunity = {` / `createPost: createCommunityPost` export around L4515 and add the key).
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — BOTH `setPref` handler sites (the two blocks containing the `onlineVisible` hooks, ~L21095-21120).

**Interfaces:**
- Consumes: `bsWorkoutSharePrivacy`, `BS_PRIVACY_RANK` from Task 1 (import `BS_PRIVACY_RANK` too in shapeBackend.js; the client jsx reads both off a new window bridge — export `window.ShapeWorkoutShare = { rule: bsWorkoutSharePrivacy, rank: BS_PRIVACY_RANK };` next to the other window bridges in shapeBackend.js).
- Produces: `ShapeCommunity.tightenAutoPosts(newPrivacy)` — updates every auto-post (`source_provider is not null`) of mine whose privacy is LOOSER than `newPrivacy`.

- [ ] **Step 1: `tightenAutoPosts` in shapeBackend.js**

```javascript
// Retroactive tightening: when the member's share level gets STRICTER, every
// past auto-post (device + in-app: source_provider is not null) drops to the
// new level. Loosening never touches history (never surprise-publish), and
// manual composer posts (null source_provider) are never touched.
async function tightenAutoPosts(newPrivacy) {
  if (!supabase || !state.user?.id) return { ok: false };
  const looser = newPrivacy === 'private' ? ['public', 'community', 'followers']
    : newPrivacy === 'followers' ? ['public', 'community'] : [];
  if (!looser.length) return { ok: true, updated: 0 };
  const { error } = await supabase
    .from('community_posts')
    .update({ privacy: newPrivacy })
    .eq('author_id', state.user.id)
    .not('source_provider', 'is', null)
    .in('privacy', looser);
  return { ok: !error };
}
```
Add `tightenAutoPosts,` to the `window.ShapeCommunity` export and `window.ShapeWorkoutShare = { rule: bsWorkoutSharePrivacy, rank: BS_PRIVACY_RANK };` beside it.

- [ ] **Step 2: Hook both `setPref` handlers in the client jsx**

In EACH of the two handler blocks (locate: `grep -n "onlineVisible.*setVisible" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` → both hits), add after the existing `onlineVisible` hook line:
```javascript
      if (key === 'shareWorkoutData' || key === 'profileVisibility') {
        // Stricter share level → retro-tighten past auto-posts (fire-and-forget).
        try {
          const ws = window.ShapeWorkoutShare;
          if (ws) {
            const before = ws.rule(prefs); const after = ws.rule(next);
            if (ws.rank[after] > ws.rank[before]) window.ShapeCommunity?.tightenAutoPosts?.(after);
          }
        } catch (e) {}
      }
```
(`prefs` = the pre-change values object, `next` = the post-change one — both already exist in each handler; verify the local names in-file and use them.)

- [ ] **Step 3: Parse, build, test, commit**

Parse-check both files; `VITE_BASE=/m/ npm run build`; `npm test`.
```bash
sed -i 's/\r$//' mobile-app/src/services/shapeBackend.js mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/services/shapeBackend.js mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(share): retroactive tightening — stricter settings pull past auto-posts down

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Verify + ship

- [ ] **Step 1:** Full gate: `npm test` (473) · `npx tsc --noEmit` (no new) · mobile parse ×2 + `VITE_BASE=/m/ npm run build`.
- [ ] **Step 2:** Self-review vs the spec's 9 acceptance criteria — esp. AC1 (default → public + no +5), AC5 (both dedup directions), AC6 (tighten/loosen asymmetry), AC8 (update never rewrites privacy — confirm all 5 server sites strip it).
- [ ] **Step 3:** Push `claude/workout-autoshare-build`, stage (`git push origin claude/workout-autoshare-build:staging --force`), open the PR against main (body: rule table + the six sites + safeguards; end with the Claude Code attribution), wait CI + CodeRabbit, address findings, merge on green+approval per the standing rule.
- [ ] **Step 4:** WORKLOG entry (docs PR, merge on green).

## Self-review (plan vs spec)

- Rule + defaults → T1/T2 ✔ · 4 syncs → T3/T4 ✔ · Garmin → T5 ✔ · in-app → T6 ✔ (incl. the pre-existing poster's idempotency + created_at fixes) · dedup both directions → T2 query + T6 client check ✔ · never-loosen on update → T3/T4/T5 strip ✔ · retro-tighten → T7 ✔ · first-run notice → T2 server + T6 mobile toast, one stamp field ✔ · no +5 → T6 `autoShare` gate ✔ · sleep/recovery unchanged ✔ · no migration ✔.
- Type consistency: `SharePrivacy` (T2) used in T3-T5; `bsWorkoutSharePrivacy`/`BS_PRIVACY_RANK` (T1) used in T6/T7; `tightenAutoPosts(newPrivacy)` produced T7-S1, consumed T7-S2. ✔
- Known judgment calls encoded: fail-closed resolver, best-effort dedup (fail-open), admin client for the notification insert, `followers` never written to `workout_sessions.privacy`.
