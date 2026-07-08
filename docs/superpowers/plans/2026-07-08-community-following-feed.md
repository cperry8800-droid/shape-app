# Community Feed Universal/Following Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The community feed gains a two-mode viewing lens — UNIVERSAL (today's global public feed, default) and FOLLOWING (posts from your accepted follows + yourself, including their new `followers`-tier posts) — plus the `followers` post privacy tier, RLS-enforced.

**Architecture:** One idempotent migration adds the `followers` tier to the privacy CHECK, `can_view_community_post()`, and the read RLS policy (likes/comments/profile views inherit automatically). A tiny pure module (`feedMode.mjs`) is the single source of the mode→query rule, consumed by the mobile query (`listCommunityPosts`) and mirrored by the web route (`GET /api/community/feed?mode=`). Each surface gets a two-item house underline-index toggle persisted to `localStorage('shape.feedMode')`.

**Tech Stack:** Supabase SQL (RLS), plain ES module + `node --test`, React-in-JSX mobile broadsheet, Next.js route handler, browser-babel website JSX.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-08-community-following-feed-design.md`. Branch: `claude/following-feed-build` (this branch, off `origin/main` ≥ `87a2ece7` which contains the spec).
- **Verify base before ANY edit**: `git fetch origin main && git rev-parse --short HEAD origin/main`.
- **Default mode is `universal`** everywhere; persisted per device via `localStorage('shape.feedMode')`; the only stored value that means Following is the exact string `'following'`.
- **Universal must stay byte-identical in content to today's feed** (`privacy in ('public','community')`, no author filter).
- `followers` posts must NEVER appear in Universal, to anon, or to non-followers — RLS is the authority; client filters are narrowing conveniences only.
- Theme tokens only (`t.*`); mono uppercase labels; 44px targets; `aria-pressed` on toggles; strings stay i18n-extractable (plain literals fine — the feed isn't in the i18n rollout yet).
- Migrations: idempotent; owner runs them — reply with ONLY the raw GitHub link (per WORKLOG convention).
- **CRLF**: after editing, `sed -i 's/\r$//' <file>` on every tracked file before committing.
- Parse-check JSX from `mobile-app/`: `node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`.
- Commits end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Do NOT touch: `award_community_post` (stays `('public','community')` on purpose), the PR Wall, the composer's 3 privacy options, profile feed queries (RLS now handles them).

---

## File structure

- **Create** `supabase-migrations/2026-07-08-followers-post-visibility.sql` — tier + function + policy.
- **Create** `mobile-app/src/services/feedMode.mjs` — pure `bsFeedQuerySpec(mode, uid, followingIds)`.
- **Create** `tests/feed-mode.test.mjs`; **modify** `package.json:9` (append to the test list).
- **Modify** `mobile-app/src/services/shapeBackend.js` — `privacyToDb` (+`'followers'`), `listAcceptedFollowingIds()` (new, cached), `listCommunityPosts(mode)`.
- **Modify** `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — feed-mode state + toggle + mode-aware loader + Following empty state in `BSClientFeed`.
- **Modify** `src/app/api/community/feed/route.ts` — `?mode=following` in GET; `normalizePrivacy` accepts `'followers'`.
- **Modify** `public/newdesign/dashboardCommunity.jsx` — toggle + mode-aware fetch + empty state; **`?v=` bump** in its 6 consumer pages (`ClientApp` / `ClientCommunity` / `TrainerApp` / `TrainerCommunity` / `NutritionistApp` / `NutritionistCommunity` .html).

### Task order
1. Migration → 2. Pure module + tests → 3. Mobile backend → 4. Mobile UI → 5. Web route → 6. Website UI → 7. Full verify + PR.

---

### Task 1: Migration — `followers` post visibility

**Files:**
- Create: `supabase-migrations/2026-07-08-followers-post-visibility.sql`

**Interfaces:**
- Produces: privacy value `'followers'` valid in `community_posts.privacy`; `can_view_community_post()` + the `"read visible community posts"` policy allow author + accepted followers. Consumed by Tasks 3/5 (queries) and by existing likes/comments RLS (no changes needed there).

- [ ] **Step 1: Confirm the `user_follows` SELECT policy is public-read** (the new POLICY subquery runs with invoker rights; `can_view_community_post` is SECURITY DEFINER and doesn't need it, but the policy clause does):

Run: `grep -n "for select" supabase-migrations/2026-06-08-user-follows.sql supabase-migrations/2026-06-08-follow-requests.sql`
Expected: a select policy with `using (true)` (public read). If it is NOT public-read, add `grant`-free select policy notes to the migration header and instead route the policy clause through a `security definer` helper `public.is_accepted_follower(p_author uuid)` — but per `2026-06-08-user-follows.sql` the read policy is `using (true)`, so the direct subquery is expected to work.

- [ ] **Step 2: Write the migration** (mirrors `2026-06-09-community-profile-visibility.sql` exactly):

```sql
-- Followers-only post visibility: 'followers' — visible to the AUTHOR and their
-- ACCEPTED followers (user_follows.status = 'accepted'), nowhere else. This is
-- how a friends-visibility member's activity reaches the feeds of the people
-- who follow them without ever being public. Feed queries additionally scope
-- the FOLLOWING mode client/route-side; this RLS is the authority.
-- Idempotent — safe to re-run.

-- 1) Allow 'followers' in the privacy CHECK constraint.
alter table public.community_posts
  drop constraint if exists community_posts_privacy_check;
alter table public.community_posts
  add constraint community_posts_privacy_check
  check (privacy in ('public', 'community', 'private', 'profile', 'followers'));

-- 2) can_view_community_post: 'followers' readable by the author + accepted followers.
--    (Engagement RLS on community_likes / community_comments gates through this
--    function, so likes/comments on followers posts work with no further change.)
create or replace function public.can_view_community_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_posts p
    where p.id = p_post_id
      and (
        p.privacy = 'public'
        or p.privacy = 'profile'
        or (p.privacy = 'community' and auth.uid() is not null)
        or (p.privacy = 'followers' and (
          p.author_id = auth.uid()
          or exists (
            select 1 from public.user_follows f
            where f.follower_id = auth.uid()
              and f.following_id = p.author_id
              and f.status = 'accepted'
          )
        ))
        or p.author_id = auth.uid()
      )
  );
$$;

-- 3) Read policy mirrors the function (as it does for the other tiers).
drop policy if exists "read visible community posts" on public.community_posts;
create policy "read visible community posts"
  on public.community_posts for select
  to anon, authenticated
  using (
    privacy = 'public'
    or privacy = 'profile'
    or (privacy = 'community' and auth.uid() is not null)
    or (privacy = 'followers' and exists (
      select 1 from public.user_follows f
      where f.follower_id = auth.uid()
        and f.following_id = community_posts.author_id
        and f.status = 'accepted'
    ))
    or author_id = auth.uid()
  );
```

- [ ] **Step 3: Validate read-only against prod** (schema references resolve; do NOT apply): confirm via the Supabase MCP (read-only queries) that `community_posts.privacy`, `user_follows.follower_id/following_id/status`, and the policy name `"read visible community posts"` all exist as referenced.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' supabase-migrations/2026-07-08-followers-post-visibility.sql
git add supabase-migrations/2026-07-08-followers-post-visibility.sql
git commit -m "feat(feed): followers post-visibility tier — migration (CHECK + can_view + read RLS)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

*(Owner runs it — the PR body carries the raw link: `https://raw.githubusercontent.com/cperry8800-droid/shape-app/main/supabase-migrations/2026-07-08-followers-post-visibility.sql`. All code in later tasks degrades cleanly pre-migration: nothing writes `'followers'` yet and Following-mode filters work against existing tiers.)*

---

### Task 2: Pure feed-mode module + tests

**Files:**
- Create: `mobile-app/src/services/feedMode.mjs`
- Create: `tests/feed-mode.test.mjs`
- Modify: `package.json:9` (append ` tests/feed-mode.test.mjs` inside the `"test"` script string)

**Interfaces:**
- Produces: `bsFeedQuerySpec(mode, uid, followingIds) → { privacyIn: string[], authorIn: string[] | null }`. `mode` is `'universal' | 'following'` (anything else = universal). `authorIn` is null for universal; for following it is the deduped `[...followingIds, uid]` (uid skipped when falsy). Consumed by Task 3 (mobile) and mirrored (not imported — route is TS) by Task 5.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/feed-mode.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsFeedQuerySpec } from '../mobile-app/src/services/feedMode.mjs';

test('universal: public+community, no author scoping', () => {
  assert.deepEqual(bsFeedQuerySpec('universal', 'me', ['a', 'b']),
    { privacyIn: ['public', 'community'], authorIn: null });
});

test('unknown/absent mode falls back to universal', () => {
  assert.deepEqual(bsFeedQuerySpec('', 'me', ['a']),
    { privacyIn: ['public', 'community'], authorIn: null });
  assert.deepEqual(bsFeedQuerySpec(undefined, null, null),
    { privacyIn: ['public', 'community'], authorIn: null });
});

test('following: adds followers tier and scopes to follows + self', () => {
  assert.deepEqual(bsFeedQuerySpec('following', 'me', ['a', 'b']),
    { privacyIn: ['public', 'community', 'followers'], authorIn: ['a', 'b', 'me'] });
});

test('following: dedupes and tolerates falsy uid / non-array ids', () => {
  assert.deepEqual(bsFeedQuerySpec('following', 'a', ['a', 'b']).authorIn, ['a', 'b']);
  assert.deepEqual(bsFeedQuerySpec('following', null, null).authorIn, []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/feed-mode.test.mjs`
Expected: FAIL — `Cannot find module '.../feedMode.mjs'`.

- [ ] **Step 3: Implement**

```javascript
// mobile-app/src/services/feedMode.mjs
// The ONE rule for the community feed's viewing modes. UNIVERSAL is the whole
// community's public activity (exactly the pre-toggle feed); FOLLOWING is the
// viewer's accepted follows + themself, and only there may 'followers'-tier
// posts surface. RLS is the authority — these specs narrow queries, they can
// never widen visibility.
export const BS_FEED_MODES = ['universal', 'following'];

export function bsFeedQuerySpec(mode, uid, followingIds) {
  if (mode !== 'following') return { privacyIn: ['public', 'community'], authorIn: null };
  const ids = Array.isArray(followingIds) ? followingIds : [];
  return {
    privacyIn: ['public', 'community', 'followers'],
    authorIn: [...new Set(uid ? [...ids, uid] : ids)],
  };
}
```

- [ ] **Step 4: Run to verify pass, register in the suite, full suite green**

Run: `node --test tests/feed-mode.test.mjs` → PASS (4 tests). Append ` tests/feed-mode.test.mjs` to the `"test"` script in `package.json:9` (before the closing quote). Run `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/services/feedMode.mjs tests/feed-mode.test.mjs
git add mobile-app/src/services/feedMode.mjs tests/feed-mode.test.mjs package.json
git commit -m "feat(feed): pure feed-mode query spec (universal/following) + tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Mobile backend — mode-aware feed query

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` — `privacyToDb` (~line 2386), `listCommunityPosts` (~line 2392), new `listAcceptedFollowingIds` just above it.

**Interfaces:**
- Consumes: `bsFeedQuerySpec` from Task 2 (add `import { bsFeedQuerySpec } from './feedMode.mjs';` next to the other top-of-file service imports).
- Produces: `listCommunityPosts(mode?: 'universal'|'following')` — same return shape as today (`{stored, data, error?}`); exposed unchanged as `window.ShapeCommunity.listPosts` (~line 4449), so callers pass the mode straight through. `listAcceptedFollowingIds() → Promise<string[]>` (accepted follows of the signed-in user, capped 500, cached 60s keyed by uid).

- [ ] **Step 1: `privacyToDb` accepts the new tier** (~line 2386):

```javascript
function privacyToDb(value) {
  const clean = String(value || '').toLowerCase();
  if (clean === 'public' || clean === 'private' || clean === 'profile' || clean === 'followers') return clean;
  return 'community';
}
```

- [ ] **Step 2: Add the cached following-ids reader + rework `listCommunityPosts`** (replace the whole function at ~2392):

```javascript
// Accepted follows of the signed-in user — the FOLLOWING feed's author scope.
// Cached 60s per uid; capped 500 (the .in() filter's practical bound). RLS on
// community_posts remains the authority — this only narrows the query.
let _followingIdsCache = { uid: null, ids: null, at: 0 };
async function listAcceptedFollowingIds() {
  const uid = state.user?.id;
  if (!supabase || !uid) return [];
  const now = Date.now();
  if (_followingIdsCache.uid === uid && _followingIdsCache.ids && now - _followingIdsCache.at < 60000) {
    return _followingIdsCache.ids;
  }
  const { data, error } = await supabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', uid)
    .eq('status', 'accepted')
    .limit(500);
  if (error) return _followingIdsCache.uid === uid ? (_followingIdsCache.ids || []) : [];
  const ids = (data || []).map((r) => r.following_id);
  _followingIdsCache = { uid, ids, at: now };
  return ids;
}

async function listCommunityPosts(mode = 'universal') {
  if (!supabase) return { stored: 'local', data: [] };

  const spec = bsFeedQuerySpec(
    mode,
    state.user?.id || null,
    mode === 'following' ? await listAcceptedFollowingIds() : []
  );
  let query = supabase
    .from('community_posts')
    .select(COMMUNITY_POST_SELECT)
    // Universal: 'profile'/'private'/'followers' never appear. Following:
    // 'followers' allowed, scoped to accepted follows + self (RLS re-checks).
    .in('privacy', spec.privacyIn);
  if (spec.authorIn) query = query.in('author_id', spec.authorIn);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(50);

  if (error) {
    return { stored: 'local', data: [], error };
  }

  return { stored: 'supabase', data: (data || []).map(communityPostFromRow) };
}
```

Also invalidate the cache on sign-out: find the existing sign-out cache clears (search `_followCache` / `signOut`) and add `_followingIdsCache = { uid: null, ids: null, at: 0 };` alongside them.

- [ ] **Step 3: Parse-check + tests**

Run from `mobile-app/`: `node -e "require('@babel/parser').parse(require('fs').readFileSync('src/services/shapeBackend.js','utf8'),{sourceType:'module'})"` → OK. From root: `npm test` → all pass.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/services/shapeBackend.js
git add mobile-app/src/services/shapeBackend.js
git commit -m "feat(feed): mode-aware listCommunityPosts + cached accepted-following ids

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Mobile UI — the toggle + Following empty state

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BSClientFeed`: mode state near the posts state (~line 12556), loader effect (~12565–12594), the COMMUNITY render branch (find the comment `COMMUNITY swaps to the activity feed in the render below`), using the `bsSubTab` helper (~line 12459).

**Interfaces:**
- Consumes: `window.ShapeCommunity.listPosts(mode)` (Task 3); `bsSubTab({key,on,color,onClick,label})` (existing, ~12459); `BSFollowSuggestions` (existing, ~6794); `TEALB` + `muted` locals already in scope in `BSClientFeed`.
- Produces: `feedMode` state (`'universal'|'following'`), persisted to `localStorage('shape.feedMode')`.

- [ ] **Step 1: Mode state** — add next to `const [posts, setPosts] = ...` (~12556):

```javascript
  // Community feed viewing lens — UNIVERSAL (everyone's public activity, the
  // default) vs FOLLOWING (accepted follows + you, incl. their followers-tier
  // posts). Persisted per device; the queries + RLS enforce visibility.
  const [feedMode, setFeedMode] = useStateBSC(() => {
    try { return localStorage.getItem('shape.feedMode') === 'following' ? 'following' : 'universal'; } catch (e) { return 'universal'; }
  });
  const switchFeedMode = (m) => {
    setFeedMode(m);
    try { localStorage.setItem('shape.feedMode', m); } catch (e) {}
  };
```

- [ ] **Step 2: Mode-aware loader** — in the loader effect (~12565): change the call to `const res = await window.ShapeCommunity?.listPosts?.(feedMode);`, change the dep array `[feedNonce]` → `[feedNonce, feedMode]`, and change the success gate so FOLLOWING can honestly land empty: replace `if (active && Array.isArray(res?.data) && res.data.length) {` with

```javascript
        const rows = Array.isArray(res?.data) ? res.data : [];
        // Universal keeps the old behavior (sample until live rows exist).
        // Following must be allowed to be EMPTY — an honest empty state, never
        // the demo sample presented as your follows' activity.
        if (active && (rows.length || (feedMode === 'following' && res?.stored === 'supabase'))) {
```
…and inside, map from `rows` instead of `res.data` (`rows.map(mapPost)`, `rows.map(bsActivityFromPost)`). Everything else in the effect stays.

- [ ] **Step 3: The toggle** — at the head of the COMMUNITY render branch (directly above where the activity feed renders; locate via the `COMMUNITY swaps to the activity feed` comment and the `filter === 'COMMUNITY'` branch):

```javascript
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', padding: `2px ${t.padX}px 0` }}>
          {bsSubTab({ key: 'universal', on: feedMode === 'universal', color: TEALB, onClick: () => switchFeedMode('universal'), label: 'Universal' })}
          {bsSubTab({ key: 'following', on: feedMode === 'following', color: TEALB, onClick: () => switchFeedMode('following'), label: 'Following' })}
        </div>
```

- [ ] **Step 4: Following empty state** — in the same COMMUNITY branch, where the activity cards list renders, when `feedMode === 'following' && postsLive && activityFeed.length === 0` render instead:

```javascript
          <div style={{ padding: `18px ${t.padX}px 8px` }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>Nothing from your people yet.</div>
            <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>Follow members to build this feed</div>
            <div style={{ marginTop: 14 }}><BSFollowSuggestions onOpenProfile={(p) => setViewPerson(p)} /></div>
            <button onClick={() => switchFeedMode('universal')} style={{ marginTop: 14, background: 'transparent', border: 0, cursor: 'pointer', padding: '10px 0', minHeight: 44, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: TEALB }}>See everyone — Universal →</button>
          </div>
```
(Verify the profile-open setter name in scope — `BSClientFeed` opens profiles via its existing person view; if it uses a different setter than `setViewPerson`, pass that. `BSFollowSuggestions` already renders its own Follow pills; if its props differ, match its existing call site — grep `<BSFollowSuggestions`.)

Signed-out preview: `postsLive` never flips (loader keeps the sample), so both modes render the demo set — matches spec AC6 with no extra branch.

- [ ] **Step 5: Parse + build + spot-check**

Parse-check the JSX; from `mobile-app/`: `VITE_BASE=/m/ npm run build` → exit 0.

- [ ] **Step 6: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(feed): Universal/Following toggle + honest Following empty state (mobile)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Web route — `?mode=following`

**Files:**
- Modify: `src/app/api/community/feed/route.ts` — `normalizePrivacy` (line 9) + `GET` (lines 40–52).

**Interfaces:**
- Consumes: existing `clientForRequest`, `currentUser` (already imported in this route for POST).
- Produces: `GET /api/community/feed?mode=following` — same `{posts}` shape; unauthenticated following-mode returns `{posts: []}` (the website renders its empty state). Task 6 consumes.

- [ ] **Step 1: `normalizePrivacy` accepts `'followers'`** (line 9):

```typescript
function normalizePrivacy(input: unknown): 'public' | 'community' | 'private' | 'profile' | 'followers' {
  const value = String(input ?? '').toLowerCase();
  if (value === 'public' || value === 'private' || value === 'profile' || value === 'followers') return value;
  return 'community';
}
```

- [ ] **Step 2: Mode-aware GET** (replace the handler body, keeping `dbError` usage):

```typescript
export async function GET(request: Request) {
  const client = await clientForRequest(request);
  const mode = new URL(request.url).searchParams.get('mode') === 'following' ? 'following' : 'universal';

  let privacyIn: string[] = ['public', 'community'];
  let authorIn: string[] | null = null;
  if (mode === 'following') {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ posts: [] });
    const { data: follows, error: followErr } = await client
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .eq('status', 'accepted')
      .limit(500);
    if (followErr) return dbError(followErr, 'community feed follows read', 400);
    // Accepted follows + self; 'followers'-tier posts may surface here (and
    // only here) — RLS re-checks per row, this filter just narrows the query.
    privacyIn = ['public', 'community', 'followers'];
    authorIn = [...new Set([...(follows ?? []).map((r) => r.following_id as string), user.id])];
  }

  let query = client
    .from('community_posts')
    .select('*, likes:community_likes(user_id), comments:community_comments(id, user_id, author_name, body, created_at)')
    .in('privacy', privacyIn);
  if (authorIn) query = query.in('author_id', authorIn);
  const { data: posts, error } = await query.order('created_at', { ascending: false }).limit(50);

  if (error) return dbError(error, 'community feed read', 400);
  return NextResponse.json({ posts: posts ?? [] });
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → clean (the repo has 3 known baseline errors per memory — clean means no NEW errors in this file).

```bash
sed -i 's/\r$//' src/app/api/community/feed/route.ts
git add src/app/api/community/feed/route.ts
git commit -m "feat(feed): ?mode=following on the community feed route + followers privacy value

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Website UI — toggle + empty state + cache-busts

**Files:**
- Modify: `public/newdesign/dashboardCommunity.jsx` — `CommunityPage` (line ~203): mode state; the live-posts fetch at line ~286; the feed column head; empty state.
- Modify (`?v=` bump on the `dashboardCommunity.jsx` script tag): `public/newdesign/ClientApp.html`, `ClientCommunity.html`, `TrainerApp.html`, `TrainerCommunity.html`, `NutritionistApp.html`, `NutritionistCommunity.html`.

**Interfaces:**
- Consumes: `GET /api/community/feed?mode=following` (Task 5).

- [ ] **Step 1: Mode state + refetch** — in `CommunityPage`, alongside its existing state:

```javascript
  const [feedMode, setFeedMode] = React.useState(() => {
    try { return localStorage.getItem('shape.feedMode') === 'following' ? 'following' : 'universal'; } catch (e) { return 'universal'; }
  });
  const switchFeedMode = (m) => { setFeedMode(m); try { localStorage.setItem('shape.feedMode', m); } catch (e) {} };
```
Change the fetch at ~286 to `fetch('/api/community/feed' + (feedMode === 'following' ? '?mode=following' : ''), { credentials: 'same-origin' })`, add `feedMode` to that effect's dependency array, and track live-emptiness: where the response maps rows into state, when `feedMode === 'following'` apply the rows **even when empty** (mirror Task 4's honest-empty rule; universal keeps the existing demo-fallback behavior). Add `const [liveEmpty, setLiveEmpty] = React.useState(false);` set true when following-mode returns 0 posts, false otherwise.

- [ ] **Step 2: The toggle** — above the feed list in the feed column (house mono underline-index, matching the page's existing tab idiom):

```javascript
        <div style={{ display: 'flex', gap: 18, margin: '0 0 10px' }}>
          {[['universal', 'UNIVERSAL'], ['following', 'FOLLOWING']].map(([m, lab]) => {
            const on = feedMode === m;
            return (
              <button key={m} onClick={() => switchFeedMode(m)} aria-pressed={on} style={{ position: 'relative', background: 'transparent', border: 0, cursor: 'pointer', padding: '8px 2px 10px', fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: on ? INK : 'rgba(15,14,12,0.45)' }}>
                {lab}
                {on && <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 4, height: 2, background: TEAL }} />}
              </button>
            );
          })}
        </div>
```
(Use the file's actual `MONO`/`INK`/`TEAL` locals — grep the top of `dashboardCommunity.jsx` for its shared consts and reuse those exact names.)

- [ ] **Step 3: Following empty state** — where the feed items render, when `feedMode === 'following' && liveEmpty`:

```javascript
          <div style={{ padding: '26px 4px' }}>
            <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600 }}>Nothing from your people yet.</div>
            <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: 'rgba(15,14,12,0.55)' }}>FOLLOW MEMBERS TO BUILD THIS FEED</div>
            <button onClick={() => switchFeedMode('universal')} style={{ marginTop: 12, background: 'transparent', border: 0, cursor: 'pointer', padding: '8px 0', fontFamily: MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: TEAL }}>SEE EVERYONE — UNIVERSAL →</button>
          </div>
```
(Reuse the file's font consts as in Step 2. Website skips follow-suggestions — mobile parity for that piece is a follow-up; note it in the PR body.)

- [ ] **Step 4: `?v=` bumps** — in each of the 6 consumer HTML files, find the `dashboardCommunity.jsx?v=...` script tag and bump the value to `20260708`.

- [ ] **Step 5: Parse-check the browser-babel file** (it is NOT built by CI):

Run from `mobile-app/`: `node -e "require('@babel/parser').parse(require('fs').readFileSync('../public/newdesign/dashboardCommunity.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"` → OK.

- [ ] **Step 6: Commit**

```bash
sed -i 's/\r$//' public/newdesign/dashboardCommunity.jsx
git add public/newdesign/dashboardCommunity.jsx public/newdesign/ClientApp.html public/newdesign/ClientCommunity.html public/newdesign/TrainerApp.html public/newdesign/TrainerCommunity.html public/newdesign/NutritionistApp.html public/newdesign/NutritionistCommunity.html
git commit -m "feat(feed): Universal/Following toggle + empty state on the website community feed

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Full verify + PR

- [ ] **Step 1:** `npm test` (full suite incl. `feed-mode`) → all pass. Mobile build from `mobile-app/`: `VITE_BASE=/m/ npm run build` → exit 0. `npx tsc --noEmit` → no new errors. Parse-check all edited JSX/JS.
- [ ] **Step 2: Acceptance-criteria walk** (spec §Acceptance): Universal content-identical (diff the query filters vs pre-change — `['public','community']`, no author filter) · followers post reachable only via Following by an accepted follower (RLS policy + spec filter) · pending follows excluded (`status='accepted'` in every follow read) · default UNIVERSAL + persistence (`localStorage('shape.feedMode')`) · empty state has suggestions (mobile) + Universal escape, no blank screens · signed-out demo in both modes · pre-migration safe (no `'followers'` writers) · tokens/44px/aria-pressed/`?v=` bumps.
- [ ] **Step 3:** Push, stage (`git push origin claude/following-feed-build:staging --force`), open the build PR against `main` (body: summary + the migration's raw GitHub link + "CodeRabbit is the authoritative gate"), click through staging (toggle both modes, empty state, signed-out), wait CI + CodeRabbit, address findings, merge per standing rule.
- [ ] **Step 4:** WORKLOG entry (own docs PR after merge, per convention): the toggle, the tier, the migration status (owner-run), and the queued Spec 2.

---

## Self-review (plan vs spec)

- **Universal identical to today**: Task 2 spec (`privacyIn ['public','community']`, `authorIn null`) + Tasks 3/5 preserve the exact original filters. ✔
- **`followers` tier + RLS + engagement inheritance**: Task 1 (function + policy; likes/comments gate through the function). ✔
- **Following = accepted follows + self, followers tier visible there only**: Tasks 2/3/5 (`status='accepted'` everywhere, authorIn includes uid). ✔
- **Toggle both surfaces, default universal, persisted, aria-pressed, house style**: Tasks 4/6. ✔
- **Empty state with suggestions + Universal escape**: Task 4 (mobile, `BSFollowSuggestions`); website gets text + escape (suggestions noted as follow-up in PR body — spec §3 requires suggestions on mobile's empty state; website parity of suggestions is a deliberate simplification called out to the owner). ✔
- **Signed-out demo both modes**: Task 4 Step 4 note (loader keeps sample; `postsLive` never flips). ✔
- **Pre-migration safe**: nothing writes `'followers'`; queries only ADD a privacy value that returns no rows pre-migration. ✔
- **Blast-radius**: `award_community_post`, PR Wall, composer, profile feeds untouched (Global Constraints). ✔
- **Type consistency**: `bsFeedQuerySpec(mode, uid, followingIds)` identical in Tasks 2/3; `listCommunityPosts(mode)` in Tasks 3/4; `?mode=following` + `{posts}` in Tasks 5/6; `localStorage('shape.feedMode')` in Tasks 4/6. ✔
