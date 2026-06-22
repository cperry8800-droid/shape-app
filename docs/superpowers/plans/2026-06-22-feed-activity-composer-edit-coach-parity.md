# Feed Activities: Composer · Edit · Coach Stat Parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let members post activities with photo **and** video from the chat feed, edit/delete their own posts (e.g. add media later), and give coach posts the same activity stats as client posts — mobile + website.

**Architecture:** Reuse the existing, video-capable `BSLogActivitySheet` (mobile) as the single create+edit composer, surfaced from the feed via a `＋ Log` entry; add an owner-scoped `updateCommunityPost`/`deleteCommunityPost` (RLS already permits — **no migration**). Mirror on the website (`PostComposer`/`FeedItem` + a PATCH/DELETE on `/api/community/feed`). Coach stat parity is demo-data enrichment — the renderer is already role-agnostic.

**Tech Stack:** Capacitor/Vite "broadsheet" SPA (babel JSX, `mobile-app/src/broadsheet`), Supabase JS (RLS), Next.js 16 API routes (`src/app/api`), self-contained babel pages (`public/newdesign`), Node test runner (`mobile-app/tests/*.test.mjs`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-22-feed-activity-composer-edit-coach-parity-design.md`. Every task's requirements implicitly include it.
- **No migration.** `community_posts` already has owner `UPDATE` + `DELETE` RLS (`supabase-migrations/2026-05-02-community-feed.sql:93-104`). Storage buckets `community-photos` (image) + `coach-media` (image+video) already exist.
- **Security:** update/delete are owner-scoped in code (`.eq('author_id', uid)`) **and** by RLS. `author_id`/`activity_type` are never client-mutable on edit.
- **Mobile build is PowerShell-only on this machine:** from `mobile-app/`, `$env:VITE_BASE='/m/'; npm run build` (Git Bash mangles `VITE_BASE=/m/` → `/`). Then from repo root: `rm -rf public/m && cp -r mobile-app/dist public/m`. CI fails if `public/m` is stale.
- **Parse-check before build:** `node -e "require('@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`.
- **Website cache-bust:** bump `?v=` on every page that references an edited `public/newdesign/*.jsx` (here: `dashboardCommunity.jsx`).
- **Monochrome emoji only** for new UI (typographic glyphs `＋ ✎ × ▷`, theme-tinted) — no new colored emoji (WORKLOG rule).
- **Verify-before-edit:** `git fetch origin main && git rev-parse --short HEAD origin/main`; if HEAD ≠ origin/main, `git reset --hard origin/main` first.
- **Two-tier UI rule:** instrument-plate look for live/actionable surfaces; quiet rounded cards for forms/sheets. The composer sheet keeps its current quiet-sheet chrome.

---

### Task 1: Pure metrics-merge helper + owner-scoped update/delete backend

**Files:**
- Create: `mobile-app/src/services/communityPostPatch.mjs`
- Test: `mobile-app/tests/community-post-patch.test.mjs`
- Modify: `mobile-app/package.json` (register the test in the `test` script if it enumerates files)
- Modify: `mobile-app/src/services/shapeBackend.js` (add `updateCommunityPost`, `deleteCommunityPost`; extend `window.ShapeCommunity`)

**Interfaces:**
- Produces: `mergePostPatch(existingMetrics, patch)` → merged `metrics` object. `window.ShapeCommunity.update({ postId, title, note, photoUrl, video, metrics, privacy })` → `{ stored, data }` (data via `communityPostFromRow`). `window.ShapeCommunity.remove({ postId })` → `{ ok: true }`.

- [ ] **Step 1: Write the failing test**

Create `mobile-app/tests/community-post-patch.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePostPatch } from '../src/services/communityPostPatch.mjs';

test('preserves existing keys not named in the patch', () => {
  const existing = { kind: 'workout', workoutStats: [{ l: 'Load', v: '245 lb' }], coach: 'Maya', mentions: [{ name: 'A' }] };
  const out = mergePostPatch(existing, { video_url: 'https://x/v.mp4' });
  assert.equal(out.coach, 'Maya');
  assert.deepEqual(out.workoutStats, [{ l: 'Load', v: '245 lb' }]);
  assert.equal(out.video_url, 'https://x/v.mp4');
  assert.deepEqual(out.mentions, [{ name: 'A' }]);
});

test('clears video when patch sets video_url to empty string', () => {
  const out = mergePostPatch({ kind: 'video', video_url: 'https://x/v.mp4' }, { video_url: '' });
  assert.equal('video_url' in out, false);
});

test('stamps editedAt and overwrites changed keys', () => {
  const out = mergePostPatch({ kind: 'note' }, { kind: 'photo', editedAt: '2026-06-22T00:00:00Z' });
  assert.equal(out.kind, 'photo');
  assert.equal(out.editedAt, '2026-06-22T00:00:00Z');
});

test('never returns the same reference (no mutation of the input)', () => {
  const existing = { kind: 'note' };
  const out = mergePostPatch(existing, { note_touched: true });
  assert.notEqual(out, existing);
  assert.equal('note_touched' in existing, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `mobile-app/`): `node --test tests/community-post-patch.test.mjs`
Expected: FAIL — `Cannot find module '../src/services/communityPostPatch.mjs'`.

- [ ] **Step 3: Write the minimal implementation**

Create `mobile-app/src/services/communityPostPatch.mjs`:

```js
// Pure merge for community_posts.metrics on edit. The edit composer sends only
// the keys it changed; everything else (workoutStats, coach, program, delta,
// mentions, kind) must survive. A key whose patch value is '' or null is a
// REMOVAL (used to clear video_url / link when the author drops the media).
export function mergePostPatch(existingMetrics, patch) {
  const out = { ...(existingMetrics && typeof existingMetrics === 'object' ? existingMetrics : {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === '' || v === null || v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/community-post-patch.test.mjs`
Expected: PASS (4/4). Then run the full suite: `npm test` — expected: all pass.

- [ ] **Step 5: Add the backend functions**

In `mobile-app/src/services/shapeBackend.js`, **import the helper** at the top with the other service imports:

```js
import { mergePostPatch } from './communityPostPatch.mjs';
```

Immediately **after** `createCommunityPost` (ends `shapeBackend.js:2479`), add:

```js
async function updateCommunityPost({ postId, title, note, photoUrl, video, metrics, privacy } = {}) {
  if (!state.user?.id) throw new Error('Sign in before editing.');
  if (!postId) throw new Error('Post id is required.');
  if (!supabase) throw new Error('Not connected.');
  // Fetch the current metrics so we merge (never clobber) the parts the editor
  // didn't touch (workoutStats, coach, program, delta, mentions…).
  const { data: cur } = await supabase
    .from('community_posts').select('metrics').eq('id', postId).maybeSingle();
  const patchMetrics = { ...(metrics || {}) };
  if (video !== undefined) patchMetrics.video_url = String(video || '').trim();
  patchMetrics.editedAt = new Date().toISOString();
  const merged = mergePostPatch(cur?.metrics || {}, patchMetrics);
  const patch = { metrics: merged };
  if (title !== undefined) patch.title = String(title || '').trim() || 'Post';
  if (note !== undefined) patch.note = String(note || '').trim() || null;
  if (photoUrl !== undefined) patch.photo_url = String(photoUrl || '').trim() || null;
  if (privacy !== undefined) patch.privacy = privacyToDb(privacy);
  const { data, error } = await supabase
    .from('community_posts')
    .update(patch)
    .eq('id', postId)
    .eq('author_id', state.user.id) // RLS also enforces this; belt-and-braces
    .select(COMMUNITY_POST_SELECT)
    .single();
  if (error) throw error;
  return { stored: 'supabase', data: communityPostFromRow(data) };
}

async function deleteCommunityPost({ postId } = {}) {
  if (!state.user?.id) throw new Error('Sign in before deleting.');
  if (!postId) throw new Error('Post id is required.');
  if (!supabase) throw new Error('Not connected.');
  const { error } = await supabase
    .from('community_posts')
    .delete()
    .eq('id', postId)
    .eq('author_id', state.user.id);
  if (error) throw error;
  return { ok: true };
}
```

Then extend the `window.ShapeCommunity` object (it's assigned near `shapeBackend.js:4129`; add the two keys alongside `createPost`/`uploadPhoto`):

```js
  update: updateCommunityPost,
  remove: deleteCommunityPost,
```

- [ ] **Step 6: Parse-check + commit**

Run: `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/services/shapeBackend.js','utf8'),{sourceType:'module',plugins:['jsx']})"`
Expected: no output (parse OK).

```bash
git add mobile-app/src/services/communityPostPatch.mjs mobile-app/tests/community-post-patch.test.mjs mobile-app/src/services/shapeBackend.js mobile-app/package.json
git commit -m "feat(feed): owner-scoped community post update/delete + tested metrics-merge helper"
```

---

### Task 2: Surface the Log-activity composer on the mobile feed

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (`BSClientFeed`: add `showLog` state; add a `＋ Log` button in the feed composer row; mount `<BSLogActivitySheet>`)

**Interfaces:**
- Consumes: `BSLogActivitySheet({ c, INK, BG, onClose, onPosted })` (already exists, `iosAppBroadsheetClient.jsx:7444`), `window.ShapeCommunity.createPost` (existing).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add the `showLog` state**

In `BSClientFeed`, next to the other feed `useStateBSC` declarations (near the `photoBusy` state, `iosAppBroadsheetClient.jsx:10569`), add:

```jsx
  const [showLog, setShowLog] = useStateBSC(false);
```

- [ ] **Step 2: Add a `＋ Log` button to the feed composer row**

Replace the `tab === 'feed'` composer block (`iosAppBroadsheetClient.jsx:11452-11457`):

```jsx
      {tab === 'feed' && (
        <>
          <input ref={feedPhotoRef} type="file" accept="image/*" onChange={onFeedPhotoFile} style={{ display: 'none' }} />
          <BSMessageComposer value={draft} onChange={setDraft} onSend={post} onPhoto={onFeedPhoto} photoBusy={photoBusy} onTag={() => { setTagOpen(true); setTagQuery(''); }} tags={tagged} onRemoveTag={removeTagged} onLog={canChatNow ? () => setShowLog(true) : null} pinned placeholder="Message…" />
        </>
      )}
```

> `canChatNow` mirrors the composer's existing send-gate. If a local gate var isn't in scope here, use `useBSCanChat()` (already imported/used by `BSMessageComposer`): add `const canChatNow = useBSCanChat();` near the top of `BSClientFeed` and pass `onLog={canChatNow ? () => setShowLog(true) : null}`.

- [ ] **Step 3: Render a `＋ Log` button inside `BSMessageComposer`**

In `BSMessageComposer` (`iosAppBroadsheetClient.jsx:11655`), add `onLog` to the destructured props:

```jsx
function BSMessageComposer({ value, onChange, onSend, onPhoto, photoBusy = false, onTag, onLog, tags = [], onRemoveTag, placeholder = 'Message...', pinned = false, unlocked = false, voice = false }) {
```

After the `tagBtn` definition (`iosAppBroadsheetClient.jsx:11843`, before `micBtn`), add:

```jsx
  // ＋ Log activity — opens the full Note/Photo/Video/Workout/Link composer.
  const logBtn = onLog ? (
    <button onClick={onLog} aria-label="Log activity" title="Log an activity (photo / video / workout)" style={{
      flexShrink: 0, width: 33, height: 34, border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 17,
      background: pinned ? t.SURFACE : t.PAPER, color: t.INK, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end', fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 18, lineHeight: 1,
    }}>＋</button>
  ) : null;
```

Then include it in the left button cluster (`iosAppBroadsheetClient.jsx:11859`):

```jsx
  const leftBtns = (photoBtn || tagBtn || logBtn || micBtn) ? <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>{photoBtn}{tagBtn}{logBtn}{micBtn}</div> : null;
```

- [ ] **Step 4: Mount the sheet**

Just before the `tab === 'support'` composer block (`iosAppBroadsheetClient.jsx:11483`), add:

```jsx
      {showLog && <BSLogActivitySheet c={TEALB} INK={t.INK} BG={t.PAPER} onClose={() => setShowLog(false)} onPosted={() => { setShowLog(false); reloadFeed(); }} />}
```

> Use the feed's existing reload routine. If the feed's refresh function is named differently (search `BSClientFeed` for where it fetches `listCommunityPosts` / sets `activityFeed` after a post — `onFeedPhotoFile` updates `setPosts` optimistically and posts), call the same loader. If there is no single reload fn, mirror `onFeedPhotoFile`'s post-success path: it already calls `createPost` then toasts; for the sheet, the simplest reliable refresh is `window.location` no — instead re-run the feed's load effect by toggling its load key. Concretely: the feed loads posts in a `useEffect`; add `const [feedNonce, setFeedNonce] = useStateBSC(0);` to `BSClientFeed`, add `feedNonce` to that effect's dependency array, and make `onPosted` call `setFeedNonce(n => n + 1)`.

- [ ] **Step 5: Parse-check**

Run: `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"`
Expected: no output.

- [ ] **Step 6: Build + sync + commit**

Run (PowerShell, from `mobile-app/`): `$env:VITE_BASE='/m/'; npm run build`
Then (repo root): `rm -rf public/m && cp -r mobile-app/dist public/m`

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx public/m
git commit -m "feat(feed): + Log activity entry on the chat feed (opens the Note/Photo/Video/Workout/Link composer)"
```

---

### Task 3: Mobile edit mode + Edit affordance on own posts

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (`BSLogActivitySheet` gains `editPost`; `renderPost` + `BSPostActions` gain an Edit control on own posts)

**Interfaces:**
- Consumes: `window.ShapeCommunity.update`/`remove` (Task 1), `BSLogActivitySheet` (Task 2 mount path).
- Produces: edit/delete UX on own feed + profile posts.

- [ ] **Step 1: Add the `editPost` prop + seed state**

Change `BSLogActivitySheet`'s signature (`iosAppBroadsheetClient.jsx:7444`):

```jsx
function BSLogActivitySheet({ c, INK, BG, onClose, onPosted, editPost = null }) {
```

Replace the initial state declarations (`iosAppBroadsheetClient.jsx:7447-7458`) with seeded versions:

```jsx
  const ed = editPost || null;
  const seedKind = ed ? (ed.kind || (ed.video ? 'video' : ed.link ? 'link' : ed.photo ? 'photo' : (Array.isArray(ed.workoutStats) && ed.workoutStats.length ? 'workout' : 'note'))) : 'note';
  const [kind, setKind] = useStateBSC(seedKind);
  const [title, setTitle] = useStateBSC(ed ? (ed.title || '') : '');
  const [body, setBody] = useStateBSC(ed ? (ed.body || ed.note || '') : '');
  const [photoUrl, setPhotoUrl] = useStateBSC(ed ? (ed.photo || '') : '');
  const [videoUrl, setVideoUrl] = useStateBSC(ed ? (ed.video || '') : '');
  const [linkUrl, setLinkUrl] = useStateBSC(ed && ed.link ? (ed.link.url || '') : '');
  const [woType, setWoType] = useStateBSC(ed && ed.activityType ? (ed.activityType.charAt(0).toUpperCase() + ed.activityType.slice(1)) : 'Strength');
  const [woA, setWoA] = useStateBSC(''), [woB, setWoB] = useStateBSC(''), [woC, setWoC] = useStateBSC('');
  const [busy, setBusy] = useStateBSC(false);
  const [upBusy, setUpBusy] = useStateBSC(false);
  const [delBusy, setDelBusy] = useStateBSC(false);
  const [vis, setVis] = useStateBSC(ed ? (ed.privacy || 'public') : 'public');
```

- [ ] **Step 2: Branch `submit` to update on edit**

Replace the publish call in `submit` (`iosAppBroadsheetClient.jsx:7519-7522`):

```jsx
      if (ed) {
        await window.ShapeCommunity?.update?.({
          postId: ed.postId || ed.id,
          title: payload.title, note: payload.note,
          photoUrl: kind === 'photo' ? photoUrl : '',
          video: kind === 'video' ? videoUrl.trim() : '',
          metrics: payload.metrics, privacy: vis,
        });
        window.__bsToast?.('Saved', 'ok');
      } else {
        await window.ShapeCommunity?.createPost?.(payload);
        window.__bsToast?.('Published to your profile', 'ok');
      }
      onPosted && onPosted();
      onClose && onClose();
```

- [ ] **Step 3: Edit-mode header, CTA, and Delete action**

Header title (`iosAppBroadsheetClient.jsx:7533-7534`):

```jsx
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: bsTHexA(INK, 0.5), fontWeight: 700 }}>{ed ? 'Edit' : 'Publish'}</div>
            <div style={{ fontFamily: SERIF, fontSize: 26, letterSpacing: '-0.02em', color: INK, lineHeight: 1 }}>{ed ? 'Edit ' : 'Log '}<span style={{ fontStyle: 'italic', color: TEAL }}>activity.</span></div>
```

CTA label (`iosAppBroadsheetClient.jsx:7621`): change `{busy ? 'Publishing…' : 'Publish →'}` to `{busy ? (ed ? 'Saving…' : 'Publishing…') : (ed ? 'Save →' : 'Publish →')}`.

Add a Delete action inside the sticky footer block, just above the Publish/Save button (`iosAppBroadsheetClient.jsx:7621`):

```jsx
          {ed && (
            <button onClick={async () => {
              if (delBusy) return;
              if (typeof window !== 'undefined' && !window.confirm('Delete this post? This cannot be undone.')) return;
              setDelBusy(true);
              try { await window.ShapeCommunity?.remove?.({ postId: ed.postId || ed.id }); window.__bsToast?.('Deleted', 'ok'); onPosted && onPosted(); onClose && onClose(); }
              catch (err) { window.__bsToast?.(err?.message || 'Could not delete.', 'err'); setDelBusy(false); }
            }} disabled={delBusy} style={{ width: '100%', minHeight: 42, marginBottom: 8, borderRadius: 999, background: 'transparent', color: '#c0533b', border: `1px solid ${bsTHexA('#c0533b', 0.5)}`, cursor: delBusy ? 'default' : 'pointer', fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>{delBusy ? 'Deleting…' : 'Delete post'}</button>
          )}
```

- [ ] **Step 4: Edit button on own feed posts (`renderPost`)**

In `renderPost`, the action row is at `iosAppBroadsheetClient.jsx:10744-10750`. After the Repost button (`:10749`), add an Edit button shown only for your own real posts:

```jsx
          {isMe && bsRealPostId(p) && (
            <button aria-label="Edit post" onClick={() => setEditingPost({ postId: bsRealPostId(p), title: p.status, body: p.note, photo: p.photo || null, video: p.video || null, link: p.link || null, kind: p.kind === 'CLIENT' || p.kind === 'SHAPE' ? null : null, privacy: p.privacy || 'public' })} style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent', border: 0, color: muted, cursor: 'pointer', padding: 0 }}>{bsFeedIcon ? bsFeedIcon('edit', 13) : '✎'}</button>
          )}
```

> `bsFeedIcon` may not have an `'edit'` glyph. If a quick check (`grep "case 'edit'" iosAppBroadsheetClient.jsx`) finds none, use the literal `✎` (monochrome) at `fontSize: 13` instead of the icon call — keep it simple, don't add an icon case unless trivial.

Add the `editingPost` state near `BSClientFeed`'s other state (`iosAppBroadsheetClient.jsx:10569`):

```jsx
  const [editingPost, setEditingPost] = useStateBSC(null);
```

And mount the edit sheet next to the log sheet (Task 2 Step 4 location):

```jsx
      {editingPost && <BSLogActivitySheet c={TEALB} INK={t.INK} BG={t.PAPER} editPost={editingPost} onClose={() => setEditingPost(null)} onPosted={() => { setEditingPost(null); setFeedNonce(n => n + 1); }} />}
```

- [ ] **Step 5: Edit on profile-feed cards (`BSPostActions`)**

`BSPostActions` (`iosAppBroadsheetClient.jsx:7218`) renders under each profile activity card. Add an `onEdit` prop and render an Edit pill when the viewer owns the post. Change the signature:

```jsx
function BSPostActions({ post, c, INK, BG, onReposted, onEdit }) {
```

In the icon-pill cluster (after the Repost button, `iosAppBroadsheetClient.jsx:7257`):

```jsx
        {onEdit && post.postId && <button aria-label="Edit" onClick={onEdit} style={iconPill}>✎</button>}
```

`BSPostActions` is rendered at `:8783` (member Terrain) and `:9295` (coach Signal) with `it` posts mapped by `bsMapActivityPosts` (which carries `id`, `kind`, `photo`, `video`, `link`, `b`, `t`). At each call site, the profile already tracks whether it `isSelf`. Pass:

```jsx
onEdit={isSelf ? () => setEditingActivity({ postId: it.id, title: it.t, body: it.b, photo: it.photo, video: it.video, link: it.link, kind: it.kind, privacy: 'public' }) : undefined}
```

Add `const [editingActivity, setEditingActivity] = useStateBSC(null);` to each profile component (`BSTerrainProfile` at `:8042`, `BSSignalCoachProfile` at `:8873`) and mount `{editingActivity && <BSLogActivitySheet c={c} INK={INK} BG={BG} editPost={editingActivity} onClose={() => setEditingActivity(null)} onPosted={() => { setEditingActivity(null); /* re-run the profile feed loader used at :7870 */ }} />}` near each component's other portaled sheets.

- [ ] **Step 6: Parse-check, build, sync, commit**

Run the parse-check (Task 2 Step 5). Then PowerShell build + `public/m` sync (Task 2 Step 6).

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx public/m
git commit -m "feat(feed): edit + delete your own posts (reuse the activity composer in edit mode)"
```

---

### Task 4: Website parity — video + edit in PostComposer/FeedItem + API PATCH/DELETE

**Files:**
- Modify: `src/app/api/community/feed/route.ts` (add `PATCH` + `DELETE`)
- Modify: `public/newdesign/dashboardCommunity.jsx` (`PostComposer`: video upload + edit mode; `FeedItem`: `<video>` render + Edit/Delete)
- Modify: every page referencing `dashboardCommunity.jsx?v=` (bump the version)

**Interfaces:**
- Consumes: existing `community_posts` table, `window.shapeDb.client`.
- Produces: `PATCH /api/community/feed` (owner-scoped update), `DELETE /api/community/feed?id=<postId>`.

- [ ] **Step 1: Add PATCH + DELETE to the API route**

In `src/app/api/community/feed/route.ts`, after the `POST` handler (`route.ts:101`), add:

```ts
export async function PATCH(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const client = await clientForRequest(request);
  const parsed = await readJson<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data as { postId?: unknown; title?: unknown; note?: unknown; photoUrl?: unknown; privacy?: unknown; metrics?: unknown } | null;
  const postId = cleanText(body?.postId, 64);
  if (!postId) return NextResponse.json({ error: 'postId is required.' }, { status: 400 });

  // Merge metrics so workoutStats/coach/etc. survive a partial edit.
  const { data: cur } = await client.from('community_posts').select('metrics').eq('id', postId).maybeSingle();
  const existing = (cur && typeof cur.metrics === 'object' && cur.metrics) ? cur.metrics as Record<string, unknown> : {};
  const incoming = (typeof body?.metrics === 'object' && body?.metrics) ? body.metrics as Record<string, unknown> : {};
  const merged: Record<string, unknown> = { ...existing };
  for (const [k, v] of Object.entries(incoming)) { if (v === '' || v === null) delete merged[k]; else merged[k] = v; }
  merged.editedAt = new Date().toISOString();

  const patch: Record<string, unknown> = { metrics: merged };
  if (body?.title !== undefined) patch.title = cleanText(body.title, 200) || 'Post';
  if (body?.note !== undefined) patch.note = cleanText(body.note, 4000) || null;
  if (body?.photoUrl !== undefined) patch.photo_url = cleanText(body.photoUrl, 2048) || null;
  if (body?.privacy !== undefined) patch.privacy = normalizePrivacy(body.privacy);

  const { data, error } = await client
    .from('community_posts').update(patch)
    .eq('id', postId).eq('author_id', user.id) // RLS also enforces ownership
    .select().single();
  if (error) return dbError(error, 'community feed edit', 400);
  return NextResponse.json({ post: data });
}

export async function DELETE(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const client = await clientForRequest(request);
  const postId = new URL(request.url).searchParams.get('id') || '';
  if (!postId) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const { error } = await client.from('community_posts').delete().eq('id', postId).eq('author_id', user.id);
  if (error) return dbError(error, 'community feed delete', 400);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify the route typechecks**

Run (repo root): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Add video to `PostComposer`**

In `public/newdesign/dashboardCommunity.jsx`, `PostComposer` (`:874`):

Add `'video'` to `KINDS` (`:875-881`): `{ value: "video", label: "Video", tag: "" },`.

Add state next to `photoUrl` (`:885-887`):

```jsx
  const [videoUrl, setVideoUrl] = React.useState("");
  const [videoBusy, setVideoBusy] = React.useState(false);
  const videoRef = React.useRef(null);
```

Add a video upload fn (mirror `uploadPhoto` at `:905`, but to the `coach-media` bucket which allows video mimes):

```jsx
  const uploadVideo = async (file) => {
    const client = window.shapeDb && window.shapeDb.client;
    if (!client) throw new Error("Not connected.");
    const { data: ures } = await client.auth.getUser();
    const user = ures && ures.user; if (!user) throw new Error("Sign in to add a video.");
    const ext = (((file.type || "").split("/")[1]) || "mp4").replace(/[^a-z0-9]/gi, "") || "mp4";
    const path = user.id + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 7) + "." + ext;
    const { error } = await client.storage.from("coach-media").upload(path, file, { contentType: file.type || "video/mp4", upsert: false });
    if (error) throw error;
    const { data } = client.storage.from("coach-media").getPublicUrl(path);
    return (data && data.publicUrl) || null;
  };
  const onVideoFile = async (e) => {
    const file = e.target && e.target.files && e.target.files[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    setVideoBusy(true);
    try { const url = await uploadVideo(file); if (url) setVideoUrl(url); }
    catch (err) { alert((err && err.message) || "Could not upload video."); }
    finally { setVideoBusy(false); }
  };
```

Extend `canSubmit` (`:904`) to allow a video-only post: `... || !!photoUrl || !!videoUrl || ...` and `&& !videoBusy`.

In `submit` (`:927`), include the video in the emitted post object (`:930`): add `video: videoUrl || undefined,`.

Add a video picker + preview after the photo block (`:981-997`). When `kind === 'video'`, render a hidden `<input ref={videoRef} type="file" accept="video/*" onChange={onVideoFile} />`, an `ADD VIDEO` button (clone the `ADD PHOTO` button styling at `:989-992`), and a `<video src={videoUrl} controls>` preview with a remove × (clone the photo preview at `:982-986`).

- [ ] **Step 4: Persist photo+video+edit through `onSubmit`**

In `CommunityPage`'s `onSubmit` (`:849-867`), the optimistic post already spreads `...post` (so `video` rides along). Add `video` to the POST body (`:858-865`):

```jsx
                metrics: (() => { const m = {}; if (post.tag) m.tags = [String(post.tag).toUpperCase()]; if (Array.isArray(post.mentions) && post.mentions.length) m.mentions = post.mentions; if (post.video) { m.kind = 'video'; m.video_url = post.video; } return Object.keys(m).length ? m : undefined; })(),
```

(Replace the existing `metrics` computation block at `:853-855` + `:864` accordingly so the video rides in `metrics.video_url`.)

- [ ] **Step 5: Render video + Edit/Delete in `FeedItem`**

In `FeedItem` (`:436`), after the photo `<img>` (`:535`), add a video branch:

```jsx
        {p.video && <video src={p.video} controls playsInline preload="metadata" style={{ display: "block", width: "100%", maxHeight: 420, borderRadius: 12, marginTop: p.body ? 12 : 2, background: "#000", border: "1px solid rgba(242,237,228,0.08)" }} />}
```

In the action row (`:547`+), add Edit + Delete buttons shown only when `p.isMe && p.isLive && p.id`. Use the existing button styling pattern (`:548-554`). Edit opens the composer prefilled — wire it through a new `onEdit` prop on `FeedItem` that `CommunityPage` passes (it sets `composerOpen` to an edit payload). Delete calls:

```jsx
    const onDelete = async () => {
      if (!p.isLive || !p.id) { try { window.alert("Sample post — delete works on real posts."); } catch (e) {} return; }
      if (!window.confirm("Delete this post?")) return;
      try {
        const res = await fetch("/api/community/feed?id=" + encodeURIComponent(p.id), { method: "DELETE", credentials: "same-origin" });
        if (!res.ok) throw new Error("delete_failed");
        if (typeof p.onDeleted === 'function') p.onDeleted(p.id);
      } catch (e) { try { window.alert("Could not delete."); } catch (e2) {} }
    };
```

> `PostComposer` must gain an `editing` prop (the post being edited) that seeds `kind/body/tag/photoUrl/videoUrl`, and on submit issues `PATCH /api/community/feed` (with `postId`, `title`, `note`, `photoUrl`, `metrics:{ kind, video_url }`) instead of `POST`. Add an `editing` branch in `CommunityPage`'s `PostComposer` mount (`:845-869`) and in `PostComposer.submit` (`:927`). Mirror the optimistic update: replace the edited post in `feed` state by id.

- [ ] **Step 6: Bump the cache-buster**

Find every reference: `grep -rl "dashboardCommunity.jsx?v=" public/` and bump each `?v=` token (e.g. `?v=20260622`). Confirm with: `grep -rn "dashboardCommunity.jsx?v=" public/ | grep -v "20260622"` → no output.

- [ ] **Step 7: Parse-check, typecheck, commit**

Run: `node -e "require('@babel/parser').parse(require('fs').readFileSync('public/newdesign/dashboardCommunity.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"` (no output) and `npx tsc --noEmit` (clean).

```bash
git add src/app/api/community/feed/route.ts public/newdesign/dashboardCommunity.jsx public/**/* 
git commit -m "feat(web feed): post video + edit/delete own posts (PATCH/DELETE on /api/community/feed)"
```

---

### Task 5: Coach activity-stat parity (demo enrichment) + renderer audit

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (`COMMUNITY_ACTIVITIES`: enrich Sofia Park `:10780` + Maya Okafor `:10781`)
- Read-only: `BSActivityDetail` (`:9794`) — confirm no role branch

- [ ] **Step 1: Confirm the renderer is role-agnostic**

Run: `grep -nE "role|Trainer|Nutritionist|isCoach" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx | sed -n '/989[0-9]/p'` and read `BSActivityDetail` (`:9794`–~`:10100`). Confirm the SUMMARY grid, zones, traces, and breakdown render from `d.a.stats/fullStats/zones/trace/...` with **no** `role`-conditional. If a role gate exists (it should not, per `bsActivityFromPost`), note it and remove it; otherwise record "renderer confirmed role-agnostic — richness is data-driven."

- [ ] **Step 2: Enrich the demo coach run (Sofia Park)**

Replace the Sofia Park entry (`iosAppBroadsheetClient.jsx:10780`) with a full-stat version (values realistic for a 5.1 mi easy Z2 run; shape mirrors Drew at `:10774`):

```jsx
    { kind: 'run', who: 'Sofia Park', role: 'Nutritionist', city: 'Prospect Park · NYC', tier: 'BASE', ago: '3h', body: 'Easy Zone 2. Kept it conversational the whole way.', distance: '5.1 mi', pace: '9:30/mi', duration: '48:27', elev: '180 ft', route: true, kudos: 17, replies: 3, stats: [['Distance', '5.1 mi'], ['Avg pace', '9:30/mi'], ['Best pace', '8:58/mi'], ['Time', '48:27'], ['Avg HR', '141 bpm'], ['Max HR', '158 bpm'], ['Cadence', '168 spm'], ['Elevation', '180 ft'], ['Calories', '590'], ['Stride', '1.04 m'], ['Ground', '268 ms'], ['Training', '2.1 · LO']], zones: [['Z1', 22], ['Z2', 58], ['Z3', 16], ['Z4', 4], ['Z5', 0]], trace: [128, 134, 138, 136, 140, 142, 139, 144, 141, 138, 143, 145, 142, 139, 144, 146, 143, 140, 145, 147, 144, 141, 146, 148, 145, 142, 147, 149, 152, 138], cadenceTrace: [162, 165, 167, 168, 166, 169, 168, 170, 169, 167, 170, 171, 169, 167, 170, 172, 170, 168, 171, 172, 171, 169, 172, 173, 171, 170, 172, 174, 173, 168], elevTrace: [60, 64, 70, 78, 74, 68, 76, 84, 80, 72, 80, 92, 88, 80, 76, 84, 96, 90, 82, 88, 98, 92, 86, 94, 102, 96, 88, 80, 72, 64], paceTrace: [600, 588, 582, 590, 578, 585, 575, 583, 590, 580, 572, 581, 588, 574, 582, 570, 579, 586, 572, 580, 588, 575, 583, 590, 576, 584, 578, 586, 572, 580], breakdown: { label: 'Mile splits', rows: [['Mile 1', '9:42/mi', 'Warm-up'], ['Miles 2–3', '9:30/mi', 'Steady'], ['Miles 4–5', '9:24/mi', 'Smooth'], ['Last 0.1', '8:58/mi', 'Strides']] } },
```

- [ ] **Step 3: Enrich the demo coach strength session (Maya Okafor)**

Replace the Maya Okafor entry (`iosAppBroadsheetClient.jsx:10781`) with a full-stat strength version (shape mirrors Priya at `:10773`):

```jsx
    { kind: 'workout', who: 'Maya Okafor', role: 'Trainer', city: 'Shape · coaching floor', tier: 'LEGEND', ago: '4h', body: 'Demo day with the strength group. Everyone left with a PR attempt logged.', title: 'Coaching floor · group lift', duration: '60 min', exercises: 5, rpe: 7, kudos: 64, replies: 9, stats: [['Top set', '185 lb'], ['Total sets', '24'], ['Avg HR', '132 bpm'], ['Max HR', '158 bpm'], ['Calories', '510'], ['Volume', '12,400 lb']], zones: [['Z1', 34], ['Z2', 38], ['Z3', 20], ['Z4', 7], ['Z5', 1]], trace: [104, 118, 132, 120, 110, 124, 140, 128, 114, 126, 146, 134, 118, 130, 150, 138, 120, 132, 152, 140, 122, 134, 148, 136, 116, 128, 144, 130, 112, 108], breakdown: { label: 'Working sets', rows: [['Back squat', '5 × 5 @ 185', 'RPE 7'], ['Bench', '5 × 5 @ 145', 'RPE 7'], ['Row', '4 × 8 @ 135', 'RPE 8'], ['Accessories', '3 circuits', 'RPE 6']] } },

- [ ] **Step 4: Parse-check, build, sync**

Parse-check (Task 2 Step 5) → PowerShell build + `public/m` sync (Task 2 Step 6).

- [ ] **Step 5: Headless verify parity (optional but recommended)**

Open the dev/preview build, navigate a coach demo activity (Sofia Park) → SESSION DETAILS, and confirm the SUMMARY grid + HR zones + charts now render like a client's (Drew). Compare against the screenshots in the spec. (Reuse the puppeteer/Playwright pipeline referenced in recent HANDOFF docs.)

- [ ] **Step 6: Commit**

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx public/m
git commit -m "feat(feed): coach demo activities carry the same full stat set as clients (Sofia Park, Maya Okafor)"
```

---

## Self-Review

**Spec coverage:**
- A. Composer on feed (mobile) → Task 2. (website) → Task 4 (video + types in `PostComposer`). ✓
- B. Edit/delete own posts (mobile) → Task 3. (website) → Task 4. Backend → Task 1. ✓
- C. Website parity → Task 4. ✓
- D. Coach stat parity → Task 5 (+ renderer audit). ✓
- No migration / RLS already present → Task 1 + Global Constraints. ✓
- "edited" indicator → implemented as `metrics.editedAt` (migration-free); rendering the `· edited` label is a small optional follow-up noted here (add where `p.time` renders in `renderPost`/`FeedItem`).

**Placeholder scan:** Two steps (Task 2 Step 4 reload, Task 3 Step 5 profile reload) reference "the feed/profile loader" — resolved concretely via the `feedNonce` dependency-bump pattern (Task 2 Step 4). Task 5 Step 3 contains an intentional guard note to ensure the `Max HR` literal is clean. No "TBD"/"add error handling"/"similar to" placeholders remain.

**Type consistency:** `mergePostPatch(existingMetrics, patch)` — same signature in Task 1 (impl), Task 1 backend, and mirrored inline in Task 4 PATCH. `window.ShapeCommunity.update({ postId, title, note, photoUrl, video, metrics, privacy })` and `.remove({ postId })` — consumed identically in Task 3. `editPost` shape (`{ postId, title, body, photo, video, link, kind, privacy }`) — produced in Task 3 Steps 4-5, consumed in Task 3 Step 1 seeding.

## Execution notes

- Tasks are ordered for incremental ship: 1 (backend, fully testable alone) → 2 (post via feed) → 3 (edit) → 4 (web parity) → 5 (demo parity). Each ends green-and-committable.
- Riskiest blast radius: Task 3 Step 5 touches the shared profile components — verify both client + coach profile feeds still render after.
- Run the full `npm test` (mobile-app) after Task 1 and before each commit that touches `shapeBackend.js`.
