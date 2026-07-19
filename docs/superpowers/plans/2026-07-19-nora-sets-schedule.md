# Shape Sets Schedule (nora_sets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A real broadcast schedule: `nora_sets` table + `bsSetsNow` module + a COMING UP station on the Shape Sets page, a stream-gated LIVE/coming-soon state on the radio screen, and the same list on the website Radio page.

**Architecture:** Public-read-published-only table (service-role writes, explicit revoke-then-grant, no editor UI in v1); canonical pure `public/newdesign/noraSets.mjs` (`bsSetsNow(rows, now)` → `{live, next, upcoming}`, end-exclusive windows); consumers poll on open (no realtime). The LIVE banner + tune CTA are **gated on `ShapeRadioLive.station()` → `configured:true`** — on the mock provider a live-window set reads "broadcast coming soon."

**Tech Stack:** Postgres RLS + grants, pure ESM + `node --test`, React (radio module + newdesign).

**Spec:** `docs/superpowers/specs/2026-07-19-nora-sets-schedule-design.md` — binding; it SUPERSEDES the 2026-06-19 avatar-DJ sketch's schema and route (nothing was built — repo-verified).

## Global Constraints

- Boundary semantics are law: live = `[starts_at, starts_at + duration_min)` (now === end is NOT live; latest start wins on overlap); next = soonest `starts_at > now` (a live row is never next); upcoming = `now < starts_at ≤ now + 7d` inclusive, ordered `(starts_at asc, id asc)`, cap 10, live row excluded.
- Members NEVER see a LIVE badge over the mock stream — the honest "On the schedule now — broadcast coming soon" line, no tune CTA.
- Times render in the member's locale via `window.ShapeI18n.intlLocale()` (the #1595 rule). i18n keys in the registered `radio` namespace, literal.
- Theme/style: the Shape Sets page is fixed-dark on the Club Shape backdrop (its own CREAM/Glass constants — match in-file style, not `t.PAPER`); the radio screen + muted bar use their existing grammar (#1750 ON AIR red lamp).
- Verify per task: `npm test` · JSX parse · PowerShell `/m/` build · LF. Migration OWNER-run (raw link only).

---

### Task 1: Migration — `nora_sets`

**Files:**
- Create: `supabase-migrations/2026-07-19-nora-sets.sql`

**Interfaces:**
- Produces the table Tasks 3–5 read. OWNER applies; consumers render honest empty states until then (and until rows are authored).

- [ ] **Step 1: Write it:**

```sql
-- Shape Sets broadcast schedule (spec 2026-07-19 — supersedes the 2026-06-19
-- avatar-DJ sketch's nora_sets/route, which were never built). Public read of
-- PUBLISHED rows only; writes are service-role only (schedule authoring is an
-- owner/ops act — v1 ships no editor UI). Defense in depth: client DML is
-- impossible at the GRANT layer even if a policy were ever misconfigured.
-- Not in the realtime publication — consumers poll on open. Idempotent.

create table if not exists public.nora_sets (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (btrim(title) <> ''),
  dj           text not null check (btrim(dj) <> ''),
  blurb        text,                              -- optional flavor line, by design
  starts_at    timestamptz not null,
  duration_min int not null check (duration_min between 10 and 360),
  published    boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.nora_sets enable row level security;

drop policy if exists "nora sets public read" on public.nora_sets;
create policy "nora sets public read" on public.nora_sets
  for select to anon, authenticated using (published);

-- Privilege contract: revoke everything, grant back SELECT only.
revoke all on table public.nora_sets from anon, authenticated;
grant select on table public.nora_sets to anon, authenticated;

create index if not exists nora_sets_starts_idx on public.nora_sets (published, starts_at);
```

- [ ] **Step 2: LF + commit.**

---

### Task 2: Pure module `public/newdesign/noraSets.mjs` (TDD)

**Files:**
- Create: `public/newdesign/noraSets.mjs`
- Create: `tests/nora-sets.test.mjs`

**Interfaces:**
- Produces (Tasks 3–5): `bsSetsNow(rows, now)` → `{ live, next, upcoming }` — `rows` = `[{ id, title, dj, blurb, starts_at, duration_min }]` (ISO strings from PostgREST), `now` = epoch ms or Date; `live`/`next` = a row object or null; `upcoming` = array ≤10. Never throws; malformed rows dropped.

- [ ] **Step 1: Failing tests:**

```js
// tests/nora-sets.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsSetsNow } from '../public/newdesign/noraSets.mjs';

const T0 = Date.parse('2026-07-20T18:00:00Z');
const row = (id, startIso, dur = 60, x = {}) => ({ id, title: `Set ${id}`, dj: 'Nora', starts_at: startIso, duration_min: dur, ...x });

test('end-exclusive live window: start live, end NOT live, latest start wins on overlap', () => {
  const rows = [row('a', '2026-07-20T18:00:00Z', 60), row('b', '2026-07-20T18:30:00Z', 60)];
  assert.equal(bsSetsNow(rows, T0).live.id, 'a');                                  // now == start → live
  assert.equal(bsSetsNow(rows, T0 + 45 * 60000).live.id, 'b');                     // overlap → latest start
  assert.equal(bsSetsNow([row('a', '2026-07-20T17:00:00Z', 60)], T0).live, null);  // now == end → NOT live
});

test('next excludes the live row; upcoming = 7d inclusive, (starts_at, id) order, cap 10, live excluded', () => {
  const live = row('l', '2026-07-20T17:30:00Z', 60);
  const soon = row('s', '2026-07-20T19:00:00Z');
  const week = row('w', '2026-07-27T18:00:00Z');       // exactly now + 7d → INCLUDED
  const far = row('f', '2026-07-27T18:00:01Z');        // past the boundary → excluded
  const r = bsSetsNow([far, week, soon, live], T0);
  assert.equal(r.live.id, 'l');
  assert.equal(r.next.id, 's');                        // never the live row
  assert.deepEqual(r.upcoming.map(x => x.id), ['s', 'w']);
  const dup = [row('b2', '2026-07-20T19:00:00Z'), row('a1', '2026-07-20T19:00:00Z')];
  assert.deepEqual(bsSetsNow(dup, T0).upcoming.map(x => x.id), ['a1', 'b2']);      // equal starts → id order
  const many = Array.from({ length: 14 }, (_, i) => row(`m${String(i).padStart(2, '0')}`, `2026-07-2${1 + (i % 5)}T1${i % 9}:00:00Z`));
  assert.equal(bsSetsNow(many, T0).upcoming.length, 10);
});

test('empty + garbage: never throws, honest nulls', () => {
  assert.deepEqual(bsSetsNow([], T0), { live: null, next: null, upcoming: [] });
  assert.deepEqual(bsSetsNow(null, T0), { live: null, next: null, upcoming: [] });
  const junk = [{ id: 'x' }, row('ok', '2026-07-20T19:00:00Z'), { id: 'bad', starts_at: 'nope', duration_min: 60 }];
  assert.equal(bsSetsNow(junk, T0).next.id, 'ok');
});
```

- [ ] **Step 2: Run → fail. Step 3: Implement:**

```js
// Shape Sets schedule resolver (spec 2026-07-19). CANONICAL COPY — website
// loads it as a native ES module, mobile imports it, tests import directly.
// Pure, injected clock, never throws. Boundary semantics (exact):
//  live: [starts_at, starts_at + duration_min) — now === end is NOT live;
//        latest start wins on overlap.
//  next: soonest starts_at > now (a live row is never next).
//  upcoming: now < starts_at ≤ now + 7 days (inclusive), (starts_at, id)
//            ascending, cap 10, live row excluded by the > now bound.
const WEEK_MS = 7 * 24 * 3600 * 1000;
const CAP = 10;

export function bsSetsNow(rows, now) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const out = { live: null, next: null, upcoming: [] };
  if (!Array.isArray(rows) || !Number.isFinite(t)) return out;
  const clean = rows.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    const s = Date.parse(r.starts_at); const d = Number(r.duration_min);
    return Number.isFinite(s) && Number.isFinite(d) && d > 0;
  }).map((r) => ({ ...r, _s: Date.parse(r.starts_at), _e: Date.parse(r.starts_at) + Number(r.duration_min) * 60000 }));
  const liveCands = clean.filter((r) => r._s <= t && t < r._e);
  liveCands.sort((a, b) => b._s - a._s || String(a.id).localeCompare(String(b.id)));
  out.live = liveCands[0] || null;
  const future = clean.filter((r) => r._s > t);
  future.sort((a, b) => a._s - b._s || String(a.id).localeCompare(String(b.id)));
  out.next = future[0] || null;
  out.upcoming = future.filter((r) => r._s <= t + WEEK_MS).slice(0, CAP);
  return out;
}
```

(Strip the `_s`/`_e` scratch keys before returning if the consumers would serialize rows — they render fields directly, so leaving them is harmless; the tests compare `.id` only. Keep it simple: leave them.)

- [ ] **Step 4: green · Step 5: commit.**

---

### Task 3: Mobile — COMING UP station + data read

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx` — `BSShapeSetsScreen` (~1222+, inside the Glass-card stack) + a small fetch helper at module scope.

**Interfaces:**
- Consumes: `supabase` read via a new `window.ShapeNoraSets.list()` in `shapeBackend.js` (`supabase.from('nora_sets').select('*').eq('published', true).gte('starts_at', <now - 6h ISO>).order('starts_at').limit(40)` → `[] `on error — degrade silent), plus Task 2's module (import at the top of the radio module: `import { bsSetsNow } from '../../../public/newdesign/noraSets.mjs';`).

- [ ] **Step 1: Data layer** — add `window.ShapeNoraSets = { list }` in `shapeBackend.js` beside the other public reads; anon-safe (the table is public-read; a signed-out preview still shows the schedule).
- [ ] **Step 2: The station** — inside `BSShapeSetsScreen`, after the existing example cards, a `Glass` card: mono eyebrow `COMING UP`, dot-leader rows (day + time via `new Intl.DateTimeFormat(window.ShapeI18n?.intlLocale?.() || 'en', { weekday: 'short', hour: 'numeric', minute: '2-digit' })` · serif title · mono dj), honest empty state `tr('radio:sets.empty', { defaultValue: 'Schedule lands with the first broadcast.' })`. Rows from a `useEffect` fetch on mount → `bsSetsNow(rows, Date.now()).upcoming` (plus the live row pinned on top with a `NOW` tag when present).
- [ ] **Step 3: Verify + commit** — JSX parse, `/m/` build, `npm test`.

---

### Task 4: Radio screen gate — LIVE banner vs "broadcast coming soon"

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx` — the radio screen header region (~1117, the `LIVE · 24/7` eyebrow block) + the muted now-playing bar (~684–706).

**Interfaces:**
- Consumes: `window.ShapeRadioLive.station()` → `{ configured, streamUrl }` (`configured:false` = the mock — `shapeBackend.js:5996-5997` is the existing gate) + `ShapeNoraSets.list()` + `bsSetsNow`.

- [ ] **Step 1: One hook** in the radio module:

```jsx
function useBSSetsLive() {
  const [state, setState] = useStateBR({ live: null, next: null, real: false });
  useEffectBR(() => {
    let on = true;
    Promise.all([
      window.ShapeNoraSets ? window.ShapeNoraSets.list() : Promise.resolve([]),
      window.ShapeRadioLive ? window.ShapeRadioLive.station() : Promise.resolve(null),
    ]).then(([rows, cfg]) => {
      if (!on) return;
      const r = bsSetsNow(rows, Date.now());
      setState({ live: r.live, next: r.next, real: !!(cfg && cfg.configured) });
    }).catch(() => {});
    const id = setInterval(() => { /* re-derive liveness each minute from the fetched rows via a ref */ }, 60000);
    return () => { on = false; clearInterval(id); };
  }, []);
  return state;
}
```

(Implementation detail for the interval: keep the fetched `rows` in a ref and re-run `bsSetsNow(rowsRef.current, Date.now())` each tick so a set going live/dead flips the banner without a refetch.)

- [ ] **Step 2: Render** on the radio screen header area:
  - `state.live && state.real` → the **LIVE SET banner**: red-lamp ON AIR grammar (#1750 — copy the wordmark's lamp treatment), `tr('radio:sets.liveBanner', { defaultValue: 'LIVE · {title} · {dj}', title, dj })`; tapping raises/tunes the radio (the existing play path).
  - `state.live && !state.real` → quiet mono line `tr('radio:sets.comingSoon', { defaultValue: 'On the schedule now — broadcast coming soon' })`, NO tune CTA, no lamp.
  - `!state.live && state.next && starts within 60 min` → `tr('radio:sets.upNext', { defaultValue: 'Up next · {title} · {time}', … })` (time via intlLocale).
  - Empty table → nothing.
  The muted now-playing bar gets the same three-state line in its compact grammar (reuse the hook's state via context or by hoisting the hook to the radio provider and threading through `useBSRadio()` — hoist to the provider, expose as `r.sets`).
- [ ] **Step 3: Verify + commit.**

---

### Task 5: Website Radio page — COMING UP list

**Files:**
- Modify: `public/newdesign/radio.jsx` — inside `RadioShapeSets()` (~line 165+).
- Modify: `public/newdesign/Radio.html` — add the supabase vendor+loader tags (grep first — it has none today) + `<script type="module">import * as NS from "/newdesign/noraSets.mjs?v=20260719"; window.ShapeNoraSets = NS;</script>` + bump `radio.jsx?v=20260714` → `?v=20260719`.

**Interfaces:**
- Consumes: `window.shapeDb.client.from('nora_sets')` (anon read — public-read RLS) + `window.ShapeNoraSets.bsSetsNow`.

- [ ] **Step 1: Loaders on Radio.html** (vendor SRI tag byte-copied from ClientApp.html:34 + `/supabase.js` + the module tag). EOL check first.
- [ ] **Step 2: The list** — in `RadioShapeSets`, a `COMING UP` block above/below the editorial copy: fetch on mount, `bsSetsNow(rows, Date.now())`, render `upcoming` as dot-leader rows (mono day/time · serif title · dj) with the honest empty state; no LIVE/tune state on the website in v1 (the site has no stream player integration — schedule list only, per spec's surfaces).
- [ ] **Step 3: Verify + commit** — babel parse · LF/CRLF audit · `?v` bumps.

---

### Task 6: Gates + PR

- [ ] Full gates. Dev-server render check: seed rows via SQL in a branch DB or stub `ShapeNoraSets.list` in the console → COMING UP renders localized rows; a seeded row covering now **on the mock provider** shows "broadcast coming soon" with NO LIVE badge and NO tune CTA (screenshot this — it's the spec's key honesty state).
- [ ] Post-migration RLS/grant proof (OWNER applied): anon reads published only; unpublished invisible; authenticated INSERT/UPDATE/DELETE all fail at the grant layer.
- [ ] PR: `nora-sets: the Shape Sets schedule — COMING UP + stream-gated live state (spec 2026-07-19)`; RAW migration link; note the avatar-DJ supersession. CI + CodeRabbit; squash-merge; re-sync.

---

## Self-review notes

- **Spec coverage:** schema/grants (T1) · module boundary semantics with every named vector (T2) · Shape Sets station (T3) · gated radio auto-show incl. muted bar (T4) · website list (T5) · no-notifications/no-editor stays out (constraints).
- **Type consistency:** `bsSetsNow(rows, now)` identical T2/T3/T4/T5; `window.ShapeNoraSets` = the data-layer object on MOBILE but the MODULE namespace on web — ⚠ rename to avoid collision: mobile data layer = `window.ShapeNoraSets` (`{list}`), web module namespace = `window.ShapeSetsLib` (`{bsSetsNow}`). **Adopt: web loader assigns `window.ShapeSetsLib`; T5's fetch uses `shapeDb.client` + `ShapeSetsLib.bsSetsNow`.** (Fixed here so the two never collide on `/m/` web builds where both exist.)
