# Shape Radio — Phase 1: real licensed player + provider foundation (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Shape Radio's demo UI with a real, licensed, always-on music station — the web + mobile players stream a provider's live broadcast and show live now-playing — built on a swappable `RadioProvider` adapter, with native background audio.

**Architecture:** A licensed radio-as-a-service provider hosts the music + broadcast + royalties. Shape stores the station config in a `radio_station` table, exposes it through two public routes (`/api/radio/station`, `/api/radio/now-playing`), and codes against a `RadioProvider` interface (a `mock` impl for dev/tests, a generic `http` impl that reads the provider's now-playing JSON). The web (`public/radio.html`) and mobile (`iosAppBroadsheetRadio.jsx`) players stream the live URL and poll now-playing; native background audio keeps it playing when locked.

**Tech Stack:** Next.js 16 (App Router, `runtime='nodejs'` route handlers), Supabase (Postgres + RLS, service-role admin client), Capacitor (mobile WebView + native audio), vanilla JS (`public/radio.html`), babel-standalone-free Vite mobile app, `node --test` (`tests/*.mjs`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-19-shape-radio-nora-ai-dj-design.md`. This plan is **Phase 1 only**; Phases 2 (Nora clips) and 3 (Nora DJ Sets) get their own plans.
- **Provider is swappable:** nothing outside `src/lib/radio/` may reference a vendor by name.
- **Degrade, never break:** stream down → "off air" state; now-playing fails → "Shape Radio · Live" with no track; no station configured → "coming soon". Never a broken control.
- **No new member-facing cost:** `/api/radio/*` are public read routes; no AI/TTS in Phase 1.
- **Migrations:** idempotent, `supabase-migrations/YYYY-MM-DD-*.sql`; the owner runs them via a raw GitHub link. Code no-ops until applied.
- **Pure logic in `.mjs`** imported by both the route and the test (same pattern as `src/lib/compliance/nutrition.mjs`); register every new test file in `package.json`'s `test` script.
- **`?v=` cache-bust** is not relevant here (`radio.html` is a standalone page, not a `?v=`-loaded newdesign module).
- **Branch:** all work on `claude/shape-radio-nora-dj` (worktree `C:/Users/cperr/shape-radio-wt`).

## File Structure

- `docs/radio-provider.md` — **create** (Task 0): the chosen provider + its exact stream URL and now-playing endpoint/JSON shape. The single source of provider facts.
- `supabase-migrations/2026-06-19-radio-station.sql` — **create** (Task 1): the `radio_station` singleton config table.
- `src/app/api/radio/station/route.ts` — **create** (Task 1): public GET → station config.
- `src/lib/radio/now-playing.mjs` — **create** (Task 2): pure normalizer (raw provider JSON → `{title,artist,isNora}`).
- `src/lib/radio/provider.ts` — **create** (Task 2): the `RadioProvider` interface (`getNowPlaying()` **and** `getStreamUrl()` so stream resolution lives behind the same adapter seam) + `NowPlaying` type.
- `src/lib/radio/mock.ts` — **create** (Task 2): fixed-data adapter for dev/tests.
- `src/lib/radio/http.ts` — **create** (Task 2): generic adapter that fetches a now-playing URL + normalizes.
- `tests/radio-now-playing.test.mjs` — **create** (Task 2): unit tests for the normalizer.
- `src/lib/radio/index.ts` — **create** (Task 3): `getProvider(config)` selector.
- `src/app/api/radio/now-playing/route.ts` — **create** (Task 3): public GET → live now-playing.
- `public/radio.html` — **modify** (Task 4): swap the demo playlist for the live stream + now-playing poll.
- `mobile-app/src/services/shapeBackend.js` — **modify** (Task 5): `window.ShapeRadioLive` (station + now-playing fetch + poll).
- `mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx` — **modify** (Task 5): real stream playback + live now-playing in `BSRadioContext`/`BSNowPlaying`/`BSRadioScreen`.
- `mobile-app/capacitor.config.ts` + `mobile-app/package.json` — **modify** (Task 6): background-audio plugin + config.
- `docs/WORKLOG.md`, `src/lib/warroom.ts` — **modify** (Task 7): changelog + War Room.

---

### Task 0: Provider selection spike (prerequisite — non-code)

**Files:**
- Create: `docs/radio-provider.md`

**Interfaces:**
- Produces: the **stream URL**, the **now-playing endpoint URL**, and the **now-playing JSON field names** (which keys hold the track title + artist) that Tasks 1–3 consume.

This is a research/procurement spike, not codeable ahead of time — the provider's real endpoints are external facts. Shortlist from the spec: **Radio.co** and **Radio King** (both bundle licensing + expose a now-playing API). LibreTime/Airtime are excluded (no bundled licensing).

- [ ] **Step 1: Sign up for a trial** on Radio.co or Radio King; create a test station with 3–5 royalty-free tracks so playout works end-to-end.

- [ ] **Step 2: Capture the facts.** From the provider dashboard/API docs, record: the **stream URL** (the listen/Icecast URL), the **now-playing endpoint URL** (public JSON), and a **sample now-playing JSON response**.

- [ ] **Step 3: Write `docs/radio-provider.md`** with exactly:
  - `Provider:` <name>
  - `Stream URL:` <url>
  - `Now-playing URL:` <url>
  - `Now-playing JSON sample:` <pasted JSON>
  - `Title field path:` <e.g. `now_playing.title`> · `Artist field path:` <e.g. `now_playing.artist`>

- [ ] **Step 4: Commit.**

```bash
git add docs/radio-provider.md
git commit -m "docs(radio): provider selection + now-playing API facts (Phase 0 spike)"
```

**Acceptance:** `docs/radio-provider.md` contains real values from a live account; the now-playing JSON sample shows which keys carry the title + artist. If those keys are not among `title/track/song/name` (title) or `artist/artist_name/author` (artist), note them — Task 3 Step 5 extends the normalizer's key list to match.

---

### Task 1: `radio_station` config table + `/api/radio/station`

**Files:**
- Create: `supabase-migrations/2026-06-19-radio-station.sql`
- Create: `src/app/api/radio/station/route.ts`

**Interfaces:**
- Consumes: the stream URL from Task 0's `docs/radio-provider.md` (loaded into the seed row by the owner after applying the migration).
- Produces: `GET /api/radio/station` → `{ name: string, streamUrl: string|null, provider: string, configured: boolean }`.

- [ ] **Step 1: Write the migration.**

```sql
-- supabase-migrations/2026-06-19-radio-station.sql
-- Shape Radio station config — a single public-read row holding the licensed
-- provider's stream URL + now-playing endpoint. Writes are service-role only
-- (the future admin Studio). Idempotent.

create table if not exists public.radio_station (
  id int primary key default 1,
  provider text not null default 'mock',         -- 'mock' | 'http'
  station_name text not null default 'Shape Radio',
  stream_url text,                               -- the licensed provider's listen URL
  now_playing_url text,                          -- the provider's public now-playing JSON
  updated_at timestamptz not null default now(),
  constraint radio_station_singleton check (id = 1)
);
alter table public.radio_station enable row level security;
-- Public read: the player needs the stream URL. No write policy → writes are
-- service-role only (RLS denies anon/authenticated writes).
drop policy if exists "radio_station_read" on public.radio_station;
create policy "radio_station_read" on public.radio_station for select
  to anon, authenticated using (true);

insert into public.radio_station (id, provider, station_name)
values (1, 'mock', 'Shape Radio')
on conflict (id) do nothing;
```

- [ ] **Step 2: Write the route.**

```ts
// src/app/api/radio/station/route.ts
// Public station config for the in-app player. No auth (radio is not gated).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('radio_station')
    .select('provider, station_name, stream_url')
    .eq('id', 1)
    .maybeSingle();
  return NextResponse.json({
    name: data?.station_name || 'Shape Radio',
    streamUrl: data?.stream_url || null,
    provider: data?.provider || 'mock',
    configured: !!data?.stream_url,
  });
}
```

- [ ] **Step 3: Typecheck.** Run: `npx tsc --noEmit`. Expected: no new errors.

- [ ] **Step 4: Verify the route compiles + responds.** Run: `npx next build` (or push to the preview and `curl https://<preview>/api/radio/station`). Expected JSON: `{"name":"Shape Radio","streamUrl":null,"provider":"mock","configured":false}` before the migration/seed; `configured:true` once the owner sets `stream_url`.

- [ ] **Step 5: Commit.**

```bash
git add supabase-migrations/2026-06-19-radio-station.sql src/app/api/radio/station/route.ts
git commit -m "feat(radio): radio_station config table + /api/radio/station"
```

**Owner action (post-merge):** apply the migration, then set the row:
`update public.radio_station set provider='http', stream_url='<from docs/radio-provider.md>', now_playing_url='<from doc>' where id=1;`

---

### Task 2: `RadioProvider` interface + normalizer + adapters (pure, TDD)

**Files:**
- Create: `src/lib/radio/now-playing.mjs`
- Create: `src/lib/radio/provider.ts`
- Create: `src/lib/radio/mock.ts`
- Create: `src/lib/radio/http.ts`
- Create: `tests/radio-now-playing.test.mjs`
- Modify: `package.json` (register the test file)

**Interfaces:**
- Produces:
  - `normalizeNowPlaying(raw: object): { title: string|null, artist: string|null, isNora: boolean }` (from `now-playing.mjs`).
  - `type NowPlaying = { title: string|null; artist: string|null; isNora: boolean }` and `interface RadioProvider { getNowPlaying(): Promise<NowPlaying> }` (from `provider.ts`).
  - `mockProvider: RadioProvider` (from `mock.ts`).
  - `httpProvider(nowPlayingUrl: string): RadioProvider` (from `http.ts`).

- [ ] **Step 1: Write the failing test.**

```js
// tests/radio-now-playing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNowPlaying } from '../src/lib/radio/now-playing.mjs';

test('maps common title/artist keys', () => {
  assert.deepEqual(
    normalizeNowPlaying({ title: 'Tempo Lift', artist: 'Some Artist' }),
    { title: 'Tempo Lift', artist: 'Some Artist', isNora: false }
  );
});

test('falls back across alternate key names', () => {
  assert.deepEqual(
    normalizeNowPlaying({ track: 'Push', artist_name: 'DJ X' }),
    { title: 'Push', artist: 'DJ X', isNora: false }
  );
});

test('flags a Nora segment by artist marker', () => {
  const np = normalizeNowPlaying({ title: 'Welcome to Shape Radio', artist: 'Nora' });
  assert.equal(np.isNora, true);
});

test('null-safe on empty/garbage input', () => {
  assert.deepEqual(normalizeNowPlaying(null), { title: null, artist: null, isNora: false });
  assert.deepEqual(normalizeNowPlaying({}), { title: null, artist: null, isNora: false });
});
```

- [ ] **Step 2: Register the test + run it to verify it fails.** Add `tests/radio-now-playing.test.mjs` to the end of the `test` script in `package.json` (append it to the space-separated `node --test ...` file list). Run: `npm test`. Expected: FAIL — `Cannot find module '.../src/lib/radio/now-playing.mjs'`.

- [ ] **Step 3: Write the normalizer.**

```js
// src/lib/radio/now-playing.mjs
// Normalizes a provider's raw now-playing JSON into Shape's shape. Pure — imported
// by the /api/radio/now-playing route AND tests/radio-now-playing.test.mjs.
// isNora marks a segment WE authored (Phase 2+); in Phase 1 there is no Nora
// content so it is always false, but the detector is here so it lights up later.

const TITLE_KEYS = ['title', 'track', 'song', 'name'];
const ARTIST_KEYS = ['artist', 'artist_name', 'author'];

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

export function normalizeNowPlaying(raw) {
  if (!raw || typeof raw !== 'object') return { title: null, artist: null, isNora: false };
  // Some providers nest under `now_playing` / `current_track`.
  const src = raw.now_playing || raw.current_track || raw;
  const title = pick(src, TITLE_KEYS);
  const artist = pick(src, ARTIST_KEYS);
  const isNora = !!artist && artist.toLowerCase().includes('nora');
  return { title, artist, isNora };
}
```

- [ ] **Step 4: Run the test to verify it passes.** Run: `npm test`. Expected: PASS (the 4 new tests green, all existing tests still green).

- [ ] **Step 5: Write the interface + adapters.**

```ts
// src/lib/radio/provider.ts
export type NowPlaying = { title: string | null; artist: string | null; isNora: boolean };
export interface RadioProvider {
  getNowPlaying(): Promise<NowPlaying>;
}
```

```ts
// src/lib/radio/mock.ts
import type { RadioProvider, NowPlaying } from './provider';
export const mockProvider: RadioProvider = {
  async getNowPlaying(): Promise<NowPlaying> {
    return { title: 'Tempo Lift', artist: 'Shape Radio', isNora: false };
  },
};
```

```ts
// src/lib/radio/http.ts
// Generic adapter: fetch the provider's public now-playing JSON + normalize it.
// Works for any radio-as-a-service whose now-playing keys are covered by the
// normalizer (extend now-playing.mjs key lists if Task 0's doc shows others).
import type { RadioProvider, NowPlaying } from './provider';
import { normalizeNowPlaying } from './now-playing.mjs';

export function httpProvider(nowPlayingUrl: string): RadioProvider {
  return {
    async getNowPlaying(): Promise<NowPlaying> {
      const res = await fetch(nowPlayingUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`now-playing ${res.status}`);
      const raw = await res.json();
      return normalizeNowPlaying(raw);
    },
  };
}
```

- [ ] **Step 6: Typecheck.** Run: `npx tsc --noEmit`. Expected: no new errors. (TS resolving the `.mjs` import mirrors `@/lib/compliance/nutrition.mjs`.)

- [ ] **Step 7: Commit.**

```bash
git add src/lib/radio/now-playing.mjs src/lib/radio/provider.ts src/lib/radio/mock.ts src/lib/radio/http.ts tests/radio-now-playing.test.mjs package.json
git commit -m "feat(radio): RadioProvider interface + now-playing normalizer + mock/http adapters"
```

---

### Task 3: Provider selector + `/api/radio/now-playing`

**Files:**
- Create: `src/lib/radio/index.ts`
- Create: `src/app/api/radio/now-playing/route.ts`

**Interfaces:**
- Consumes: `radio_station.provider` + `radio_station.now_playing_url` (Task 1); `mockProvider`, `httpProvider`, `NowPlaying` (Task 2); the now-playing field names from `docs/radio-provider.md` (Task 0).
- Produces: `GET /api/radio/now-playing` → `NowPlaying` JSON (`{title, artist, isNora}`). Stream resolution stays behind the same seam — the `/api/radio/station` route resolves `streamUrl` via the provider's `getStreamUrl()` rather than reading `radio_station` directly, so a provider swap is one adapter file.

- [ ] **Step 1: Write the selector.**

```ts
// src/lib/radio/index.ts
import { mockProvider } from './mock';
import { httpProvider } from './http';
import type { RadioProvider } from './provider';

export type { NowPlaying, RadioProvider } from './provider';

export function getProvider(config: { provider?: string | null; nowPlayingUrl?: string | null }): RadioProvider {
  if (config.provider === 'http' && config.nowPlayingUrl) return httpProvider(config.nowPlayingUrl);
  return mockProvider;
}
```

- [ ] **Step 2: Write the route.**

```ts
// src/app/api/radio/now-playing/route.ts
// Public live now-playing for the player. Degrades to nulls on any provider error
// so the stream UI never breaks. No auth (radio is not gated).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProvider } from '@/lib/radio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('radio_station')
    .select('provider, now_playing_url')
    .eq('id', 1)
    .maybeSingle();
  try {
    const np = await getProvider({ provider: data?.provider, nowPlayingUrl: data?.now_playing_url }).getNowPlaying();
    return NextResponse.json(np);
  } catch {
    return NextResponse.json({ title: null, artist: null, isNora: false });
  }
}
```

- [ ] **Step 3: Reconcile with the real provider JSON.** Open `docs/radio-provider.md` (Task 0). If the documented Title/Artist field paths are NOT covered by `now-playing.mjs`'s `TITLE_KEYS`/`ARTIST_KEYS` (or the nesting is not `now_playing`/`current_track`), extend those lists in `src/lib/radio/now-playing.mjs` and add a test case in `tests/radio-now-playing.test.mjs` mirroring the documented sample JSON. Run: `npm test`. Expected: PASS.

- [ ] **Step 4: Typecheck + build.** Run: `npx tsc --noEmit && npx next build`. Expected: clean.

- [ ] **Step 5: Verify against the live provider** (after the owner sets `provider='http'` + `now_playing_url` on the preview): `curl https://<preview>/api/radio/now-playing` → the real current track's `{title, artist, isNora:false}`.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/radio/index.ts src/app/api/radio/now-playing/route.ts src/lib/radio/now-playing.mjs tests/radio-now-playing.test.mjs
git commit -m "feat(radio): getProvider selector + /api/radio/now-playing"
```

---

### Task 4: Web player — live stream + now-playing poll (`public/radio.html`)

**Files:**
- Modify: `public/radio.html` (the `<script>` block: `SHAPE_RADIO_PLAYLIST` at ~410–416; `loadTrack`/`togglePlay`/`nextTrack`/`prevTrack`/`openRadio` at ~597–709)

**Interfaces:**
- Consumes: `GET /api/radio/station` (Task 1), `GET /api/radio/now-playing` (Task 3).

The existing page already has a real `<audio id="radioAudio">` + a Web Audio visualizer + play/pause/volume + a `mediaSession` + a logged-out preview gate — **keep all of that**. The change is: a live radio stream is ONE continuous URL (the provider controls playout), so there is no client-side per-track playlist. Replace the file-playlist model with: load the stream URL from the config route, and poll now-playing for the title/artist.

- [ ] **Step 1: Replace the demo playlist + `loadTrack` with a live-stream loader.** Replace the `SHAPE_RADIO_PLAYLIST` array (lines ~410–416) and the `loadTrack` function (lines ~597–616) with:

```js
// ===== Shape Radio — live stream =====
// One continuous stream from the licensed provider (config from /api/radio/station).
// The provider controls playout; the client just plays the stream + polls now-playing.
var STREAM_URL = null;
var nowPlayingTimer = null;

function applyNowPlaying(title, artist) {
  npTitle.textContent = title || 'Shape Radio';
  npArtist.textContent = artist || 'Live';
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'Shape Radio', artist: artist || 'Live', album: 'Shape Radio'
      });
    } catch (e) {}
  }
}

function pollNowPlaying() {
  fetch('/api/radio/now-playing', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (np) { if (np) applyNowPlaying(np.title, np.artist); })
    .catch(function () { /* keep last shown; stream still plays */ });
}

function loadStation() {
  return fetch('/api/radio/station', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      STREAM_URL = cfg && cfg.configured ? cfg.streamUrl : null;
      if (STREAM_URL) { audio.src = STREAM_URL; }
      else { applyNowPlaying('Shape Radio', 'Coming soon'); }
      return STREAM_URL;
    })
    .catch(function () { applyNowPlaying('Shape Radio', 'Off air'); return null; });
}
```

- [ ] **Step 2: Make play/pause stream-aware; drop track navigation.** Replace `togglePlay` (lines ~625–638), `nextTrack`/`prevTrack` (lines ~640–655), and the `audio.loop = true` line (~663) with:

```js
function togglePlay() {
  if (!STREAM_URL) { loadStation().then(function (u) { if (u) audio.play().catch(function(){}); }); return; }
  if (!audio.src) audio.src = STREAM_URL;
  if (audio.paused) {
    var p = audio.play();
    if (p && p.catch) p.catch(function (err) { console.warn('[shape-radio] play blocked:', err); syncPlayUI(false); });
    if (!nowPlayingTimer) { pollNowPlaying(); nowPlayingTimer = setInterval(pollNowPlaying, 15000); }
  } else {
    audio.pause();
  }
}
// A live stream is not seekable/loopable — no loop, no prev/next.
audio.loop = false;
```

Then remove the `mediaSession` `previoustrack`/`nexttrack` handlers (lines ~677–678) and hide the prev/next buttons in the markup (set `style="display:none"` on their elements, or delete them) since they don't apply to a live stream.

- [ ] **Step 3: Point `openRadio` at the stream.** In `openRadio` (lines ~699–709) replace `if (!audio.src) loadTrack(0);` with `if (!audio.src) { loadStation().then(function (u) { if (autoPlay && u) audio.play().catch(function(){}); }); return; }` and keep the rest.

- [ ] **Step 4: On stream error, show off-air + retry.** Replace the `error` handler (lines ~664–667) with:

```js
audio.addEventListener('error', function () {
  console.warn('[shape-radio] stream error');
  syncPlayUI(false);
  applyNowPlaying('Shape Radio', 'Off air — retrying…');
  setTimeout(function () { if (STREAM_URL) { audio.src = STREAM_URL; audio.play().catch(function(){}); } }, 5000);
});
```

- [ ] **Step 5: Verify with Playwright** (preview, after the owner set `stream_url`): navigate to `/radio.html`, open the player, click play, then evaluate:

```js
() => ({ src: document.getElementById('radioAudio').src, title: document.getElementById('npTitle').textContent })
```
Expected: `src` equals the provider stream URL; after ~16s the `title` reflects the live track (not a SoundHelix demo). Confirm audio is audible manually.

- [ ] **Step 6: Commit.**

```bash
git add public/radio.html
git commit -m "feat(radio): web player streams the live licensed station + polls now-playing"
```

---

### Task 5: Mobile player — live stream + now-playing poll

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (add `window.ShapeRadioLive`)
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx` (`BS_LIVE_STATION` ~22, `BSRadioContext` provider ~98–211, the 18s carousel `setInterval` ~128–129, `BSNowPlaying` ~491, `BSRadioScreen`)

**Interfaces:**
- Consumes: `GET /api/radio/station`, `GET /api/radio/now-playing`.
- Produces: `window.ShapeRadioLive = { station(): Promise<{name,streamUrl,configured}>, nowPlaying(): Promise<{title,artist,isNora}>, audio(): HTMLAudioElement, play(), pause(), startPolling(cb), stopPolling() }`.

- [ ] **Step 1: Add the live-radio service.** In `mobile-app/src/services/shapeBackend.js`, add (near the other `window.Shape*` services, reusing the file's existing `apiBase`/fetch helper for the API origin):

```js
// ===== Shape Radio (live licensed stream) =====
(function () {
  let el = null, pollTimer = null, pollAbort = null, pollGen = 0;
  function api(path) {
    // mirror the file's existing API base resolution (native Bearer / web same-origin)
    return (window.__SHAPE_API_BASE__ || '') + path;
  }
  function audio() {
    // crossOrigin='anonymous' is part of the STREAM CONTRACT: createMediaElementSource
    // (analyser + Nora avatar) only works for a cross-origin provider stream when the
    // element opts into CORS AND the provider sends Access-Control-Allow-Origin. Without
    // both, the Web Audio graph is blocked/muted for cross-origin stations.
    if (!el) { el = new Audio(); el.preload = 'none'; el.crossOrigin = 'anonymous'; }
    return el;
  }
  async function station() {
    try { const r = await fetch(api('/api/radio/station'), { cache: 'no-store' }); return r.ok ? r.json() : null; }
    catch { return null; }
  }
  async function nowPlaying(signal) {
    try { const r = await fetch(api('/api/radio/now-playing'), { cache: 'no-store', signal }); return r.ok ? r.json() : null; }
    catch { return null; }
  }
  async function play() {
    // streamUrl is PROVIDER-RESOLVED: the station route resolves it via the provider's
    // getStreamUrl() (see Task 2) so the stream lives behind the same adapter seam as
    // now-playing — a provider swap is one file, not cross-layer schema work.
    const cfg = await station();
    if (!cfg || !cfg.configured) return false;
    const a = audio();
    if (a.src !== cfg.streamUrl) a.src = cfg.streamUrl;
    try { await a.play(); return true; } catch { return false; }
  }
  function pause() { if (el) el.pause(); }
  // Self-scheduling poll + cancellation: each cycle settles (or aborts) before the next
  // is scheduled, so slow networks can't stack overlapping requests, and stopPolling
  // aborts the in-flight fetch + drops any late response (no stale UI after teardown).
  function startPolling(cb) {
    stopPolling();
    const gen = ++pollGen;
    const loop = async () => {
      if (gen !== pollGen) return;
      pollAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const np = await nowPlaying(pollAbort ? pollAbort.signal : undefined);
      if (gen !== pollGen) return;
      if (np) cb(np);
      pollTimer = setTimeout(loop, 15000);
    };
    loop();
  }
  function stopPolling() {
    pollGen++;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (pollAbort) { try { pollAbort.abort(); } catch {} pollAbort = null; }
  }
  window.ShapeRadioLive = { station, nowPlaying, audio, play, pause, startPolling, stopPolling };
})();
```

(Use the file's real API-base mechanism in `api()` — match how the other `window.Shape*` services build their URLs; do not invent `__SHAPE_API_BASE__` if the file already exports a helper.)

- [ ] **Step 2: Replace the demo carousel with live now-playing state in `BSRadioContext`.** In `iosAppBroadsheetRadio.jsx`, in the context provider (around lines 109–211): add `const [nowPlaying, setNowPlaying] = useStateBR(null);`, and replace the demo `setInterval` advance (lines ~128–129) with a now-playing poll that runs while the radio is on:

```jsx
useEffectBR(() => {
  if (!radioOn) { window.ShapeRadioLive?.stopPolling?.(); return; }
  window.ShapeRadioLive?.play?.();
  window.ShapeRadioLive?.startPolling?.((np) => setNowPlaying(np));
  return () => window.ShapeRadioLive?.stopPolling?.();
}, [radioOn]);
```

Add `nowPlaying` to the context `value` object (around lines 204–211).

- [ ] **Step 3: Render live now-playing instead of `LIVE.tracks[trackIdx]`.** In `BSNowPlaying` (~491–500) and `BSRadioScreen` (the now-playing display), replace reads of `r.LIVE.tracks[r.trackIdx]` with `r.nowPlaying` — e.g. `const tr = r.nowPlaying || { title: 'Shape Radio', artist: 'Live' };` and use `tr.title` / `tr.artist`. Keep all visual styling (the EQ/visualizer, plate chrome) unchanged.

- [ ] **Step 4: Build the mobile bundle.** From `mobile-app/` (PowerShell): `$env:VITE_BASE='/m/'; npm run build`. Then from the repo root: `Remove-Item -Recurse -Force public/m; Copy-Item -Recurse mobile-app/dist public/m`. Expected: build succeeds; `public/m` updates.

- [ ] **Step 5: Verify.** Parse-check: `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"` → no output (OK). On the preview `/m/` build (or a device), open Radio, toggle it on: audio plays the live stream and the now-playing title updates within ~16s. (Background playback is Task 6.)

- [ ] **Step 6: Commit.**

```bash
git add mobile-app/src/services/shapeBackend.js mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx public/m
git commit -m "feat(radio): mobile player streams the live station + polls now-playing"
```

---

### Task 6: Native background audio

**Files:**
- Modify: `mobile-app/package.json` (declare the background-audio capability)
- Modify: `mobile-app/capacitor.config.ts`
- Modify: iOS `Info.plist` background modes + Android service (applied on the native build)

**Interfaces:**
- Consumes: the mobile player (Task 5) — the same `ShapeRadioLive.audio()` element must keep playing when backgrounded.

Background audio cannot be exercised in the web container — it requires a native build (same constraint as the push-notifications work). This task declares the config so a `npx cap sync` + native build picks it up.

- [ ] **Step 1: Add the background-mode config to `capacitor.config.ts`.** In the `plugins` block, document the audio session intent and ensure the WebView keeps media alive:

```ts
// mobile-app/capacitor.config.ts — add to the config object
// iOS: the audio background mode (declared in Info.plist below) keeps the
// <audio> stream alive when backgrounded; Android needs a foreground service.
```

- [ ] **Step 2: iOS — declare the audio background mode.** In the iOS app's `Info.plist` (generated under `ios/App/App/Info.plist` after `npx cap add ios`), add:

```xml
<key>UIBackgroundModes</key>
<array><string>audio</string></array>
```

- [ ] **Step 3: Android — keep media playing in background.** Ensure a media/foreground-service capability. Document in `package.json` notes that the native build must keep the WebView audio alive (a community plugin such as a background-mode/foreground-service plugin, declared + `npx cap sync`), mirroring how `@capacitor/push-notifications` was added.

- [ ] **Step 4: Document the native-build activation steps** in the commit body + WORKLOG (Task 7): `npm i` the chosen plugin in `mobile-app/`, `npx cap sync`, add the iOS background mode + Android service, then build via Xcode/Android Studio. Verify on-device: start Radio, lock the phone — audio continues.

- [ ] **Step 5: Commit.**

```bash
git add mobile-app/capacitor.config.ts mobile-app/package.json
git commit -m "feat(radio): native background-audio config (activates on the native build)"
```

---

### Task 7: Ship — WORKLOG + War Room

**Files:**
- Modify: `docs/WORKLOG.md`
- Modify: `src/lib/warroom.ts`

- [ ] **Step 1: Add a WORKLOG changelog entry** dated 2026-06-19 describing Phase 1: the `radio_station` table + the two public routes + the `RadioProvider` adapter + the web/mobile live players + the native background-audio config; include the migration raw link `raw.githubusercontent.com/cperry8800-droid/shape-app/main/supabase-migrations/2026-06-19-radio-station.sql` marked **OWNER — run + set stream_url/now_playing_url**, and the native-build activation note.

- [ ] **Step 2: Register the routes in the War Room.** In `src/lib/warroom.ts`, add `/api/radio/station` + `/api/radio/now-playing` to `RAW_ROUTES`, and add a "Shape Radio — real station (Phase 1)" checklist item under a radio/surfaces section (status `done`, with the provider-selection + native-build as `manual` owner steps).

- [ ] **Step 3: Typecheck + commit.** Run: `npx tsc --noEmit`. Expected: clean.

```bash
git add docs/WORKLOG.md src/lib/warroom.ts
git commit -m "docs(radio): WORKLOG + War Room — Shape Radio Phase 1 (real licensed player)"
```

---

## Self-review notes (done while writing)

- **Spec coverage:** Phase 0 (Task 0) · Phase 1 player + provider foundation (Tasks 1–6) · ship/docs (Task 7). Phases 2–3 (Nora clips, DJ Sets) are explicitly deferred to their own plans, per the spec's phased rollout. Error-handling spec items (stream down, now-playing fail, not configured) are covered in Tasks 3–4. Background-audio "day one" is Task 6 (config) + the native-build activation note.
- **Provider seam:** the only provider-gated code is the now-playing field mapping, isolated to `now-playing.mjs` and reconciled against `docs/radio-provider.md` in Task 3 Step 3 — not a placeholder, a real dependency on Task 0's artifact.
- **Type consistency:** `NowPlaying = {title, artist, isNora}` and `getNowPlaying()` are used identically across `provider.ts`, `mock.ts`, `http.ts`, `index.ts`, and both routes. The `radio_station` columns (`provider`, `stream_url`, `now_playing_url`, `station_name`) match between the migration, both routes, and the selector.
