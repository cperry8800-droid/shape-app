# Live Progress — Website Coach Station Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The website coach client page (`coachClientDetail.jsx`) gains THE LIVE STATION — a realtime view of a client's in-progress session — consuming the existing `user_activity_live` row under the existing RLS, with `liveProgress.mjs`'s pure half promoted to the ONE canonical copy in `public/newdesign/`.

**Architecture:** Split-with-shim: the pure, import-free functions (`bsLiveProgressPayload`, `bsShouldPushProgress`, `bsValidLivePayload`) move to canonical `public/newdesign/liveProgress.mjs` (the `shareCard.mjs` pattern — web loads it as a native ES module, mobile imports it); `mobile-app/src/services/liveProgress.mjs` becomes a re-export shim that KEEPS `bsLiveAudience` (writer-side — it imports `./workoutShare.mjs`, which the website cannot serve, and the web never resolves an audience). Zero mobile call-site churn. The web station subscribes browser-side via `window.shapeDb.client` realtime — RLS enforces the audience per subscriber; no route is added or extended.

**Tech Stack:** Supabase realtime (self-hosted SRI'd UMD + `public/supabase.js` → `window.shapeDb.client`), native ES module loader, browser-babel React (newdesign), `node --test`.

**Spec:** `docs/superpowers/specs/2026-07-19-live-progress-web-design.md` — binding. Parent: `2026-07-18-live-workout-progress-design.md` (shipped #1763/#1764; migration live).

## Global Constraints

- **No migration, no route.** The `/api/clients/:id/shared-overview` route is NOT extended (a server snapshot can't be live).
- Honest-absent: no readable row → **the station does not exist** (absence — never a "private" label; RLS makes private / not-visible / expired indistinguishable).
- The web station renders ONLY what `bsValidLivePayload` returns; wire data is attacker-shaped until validated. Loads render `—` (the v1 payload carries none).
- newdesign styling: this page is fixed-dark dashboard chrome (`rgba(242,237,228,…)` inks, Fraunces serif, JetBrains Mono eyebrows, teal `#2ee0c4` / gold `#d8b25a` role accents) — match `coachClientDetail.jsx`'s existing constants, NOT the mobile `t.*` tokens.
- `?v=` bumps: `coachClientDetail.jsx` is browser-babel (hand-written `?v` matters on the raw path; the deploy precompile content-hashes it anyway) — bump to `?v=20260719` on BOTH `TrainerClient.html` and `NutritionistClient.html`. Module-loader `<script type="module">` tags carry their own `?v=20260719` (the precompile does NOT rewrite non-babel tags — spotlightTour precedent).
- All files LF (`tr -cd '\r' < f | wc -c` → 0). ⚠ `TrainerClient.html` / `NutritionistClient.html`: check `git ls-files --eol` BEFORE editing — 17 newdesign HTML files are CRLF-tracked; if either is, preserve CRLF.
- Verify per task: JSX parse-check for edited babel files (`node -e "require('@babel/parser').parse(require('fs').readFileSync('<f>','utf8'),{sourceType:'module',plugins:['jsx']})"`) · `node --check` for plain JS · `npm test` · PowerShell `VITE_BASE=/m/` build exit 0 (the import re-point touches mobile; NEVER build from Git Bash).
- Commit per task; PR when the whole plan is done; wait CI + CodeRabbit.

---

### Task 1: Canonical module split — `public/newdesign/liveProgress.mjs` + mobile shim

**Files:**
- Create: `public/newdesign/liveProgress.mjs`
- Rewrite: `mobile-app/src/services/liveProgress.mjs` (becomes the shim)
- Modify: `tests/live-progress.test.mjs:3` (import re-point)

**Interfaces:**
- Consumes: current `mobile-app/src/services/liveProgress.mjs` (move its content verbatim; full file is 87 lines).
- Produces: canonical exports `bsLiveProgressPayload`, `bsShouldPushProgress`, `bsValidLivePayload` from `public/newdesign/liveProgress.mjs` (unchanged signatures — see the file's own JSDoc-style header comments); mobile shim re-exports ALL of those **plus** `bsLiveAudience(settingsDoc, readFailed)` (unchanged). Every existing mobile import site (`iosAppBroadsheetPros.jsx:7`, `iosAppBroadsheetClient.jsx` boost-sheet import, `shapeBackend.js`) keeps importing from `../services/liveProgress.mjs` / `./liveProgress.mjs` — **no call-site edits**.

- [ ] **Step 1: Create `public/newdesign/liveProgress.mjs`** — copy the CURRENT `mobile-app/src/services/liveProgress.mjs` verbatim, then apply exactly two edits: (a) delete line 13 (`import { bsWorkoutSharePrivacy } from './workoutShare.mjs';`) and (b) delete the whole `bsLiveAudience` function (lines 39–43). Replace the header comment's first paragraph with:

```js
// Live workout-progress payload builders + the consumer-side wire validator
// (spec 2026-07-18 · web parity 2026-07-19). CANONICAL COPY — the website
// loads this as a native ES module (→ window.ShapeLiveValidate), the mobile
// app re-exports it from mobile-app/src/services/liveProgress.mjs (which
// also holds bsLiveAudience — writer-side, it needs workoutShare.mjs, a
// path the website is never served), and the Node tests import it directly.
// Pure — no imports, timestamps injected.
```

Everything else (constants, `intSets`, the three functions, every inline comment) is byte-identical to the source.

- [ ] **Step 2: Rewrite `mobile-app/src/services/liveProgress.mjs` as the shim** — full replacement content:

```js
// Mobile entry for live workout progress. The pure payload/validator half is
// CANONICAL in public/newdesign/liveProgress.mjs (the shareCard.mjs pattern —
// one implementation for mobile + website). bsLiveAudience stays HERE because
// it imports workoutShare.mjs, which is not on the web path — and the web
// never resolves an audience (that is the writer's job).
export {
  bsLiveProgressPayload,
  bsShouldPushProgress,
  bsValidLivePayload,
} from '../../../public/newdesign/liveProgress.mjs';
import { bsWorkoutSharePrivacy } from './workoutShare.mjs';

// Audience = the member's own share rule. 'private' → null → the caller
// writes NOTHING (absence, not filtering). A FAILED settings read is null
// too (fail closed — the #1613 lesson).
export function bsLiveAudience(settingsDoc, readFailed) {
  if (readFailed) return null;
  const tier = bsWorkoutSharePrivacy(settingsDoc);
  return tier === 'private' ? null : tier;
}
```

- [ ] **Step 3: Re-point the test import** — `tests/live-progress.test.mjs:3` currently imports all four fns from `../mobile-app/src/services/liveProgress.mjs`. Leave it EXACTLY as is — the shim re-exports everything, so the test now proves the shim surface (which is what mobile consumes). Add one line under the existing import to also prove the canonical file directly:

```js
import { bsValidLivePayload as bsValidCanonical } from '../public/newdesign/liveProgress.mjs';
```

and append one test at the end of the file:

```js
test('mobile shim re-exports the canonical implementation (no twin)', () => {
  assert.equal(bsValidLivePayload, bsValidCanonical);
});
```

- [ ] **Step 4: Run the suite** — `npm test`. Expected: all green including the new identity test (referential equality proves there is ONE implementation).
- [ ] **Step 5: Mobile build** — PowerShell: `cd mobile-app; $env:VITE_BASE='/m/'; npm run build` → exit 0 (Vite resolves the `../../../public/newdesign/` import — the `server.fs.allow:['..']` + shareCard precedent already cover this).
- [ ] **Step 6: LF check** on all three files → 0. **Commit:** `git add -A && git commit -m "live-web: liveProgress.mjs pure half -> canonical public/newdesign copy (mobile shim keeps bsLiveAudience)"`

---

### Task 2: Web loaders — supabase client + the canonical module on both coach client pages

**Files:**
- Modify: `public/newdesign/TrainerClient.html` (script block, after line 13's babel tag)
- Modify: `public/newdesign/NutritionistClient.html` (same insertion)

**Interfaces:**
- Produces: `window.shapeDb.client` (realtime-capable supabase client) + `window.ShapeLiveValidate` (namespace of the canonical module) available before the page's babel scripts run. Task 3 consumes both.

- [ ] **Step 1: Check EOL** — `git ls-files --eol -- public/newdesign/TrainerClient.html public/newdesign/NutritionistClient.html`. If a file shows `i/crlf`, make the edit preserving CRLF (edit via a tool that keeps endings; restore with `unix2dos` if needed).
- [ ] **Step 2: Insert into `TrainerClient.html`**, directly after the `<script src="https://unpkg.com/@babel/standalone…"></script>` line and BEFORE the first `text/babel` tag (copy the vendor tag byte-for-byte from `ClientApp.html:34` — the SRI hash must match):

```html
<script src="/vendor/supabase-js-2.108.2.umd.js" integrity="sha384-nD3dwv4+ZqdYnmZKe/249ImlV04om7xTCcsoSeQYI+RO+XlKPoqAWaJR1M5SJH9p" crossorigin="anonymous"></script>
<script src="/supabase.js"></script>
<!-- Live-progress validator (canonical ES module, spec 2026-07-19): assigns window.ShapeLiveValidate before babel runs the page code. -->
<script type="module">import * as LP from "/newdesign/liveProgress.mjs?v=20260719"; window.ShapeLiveValidate = LP;</script>
```

- [ ] **Step 3: Same insertion in `NutritionistClient.html`** (its script head mirrors TrainerClient's — verify the babel tag line number first, same placement rule).
- [ ] **Step 4: Bump the page's babel tag** in BOTH files: `coachClientDetail.jsx?v=20260713` → `coachClientDetail.jsx?v=20260719` (Task 3 edits that file).
- [ ] **Step 5: Verify** — `grep -n "supabase\|ShapeLiveValidate\|coachClientDetail" public/newdesign/TrainerClient.html public/newdesign/NutritionistClient.html` shows: vendor tag with SRI, `/supabase.js`, the module loader, and `?v=20260719`. EOL unchanged (`git diff` shows only the inserted/edited lines).
- [ ] **Step 6: Commit** — `git commit -am "live-web: supabase client + canonical liveProgress loader on both coach client pages"`

---

### Task 3: THE LIVE STATION on `coachClientDetail.jsx`

**Files:**
- Modify: `public/newdesign/coachClientDetail.jsx` — add the `CKLiveStation` component above `CoachClientDetailPage` (~line 40) and render it as the FIRST child inside the page's `<React.Fragment>` (before the stat-grid `<Card>` at ~line 163).

**Interfaces:**
- Consumes: `window.shapeDb.client` (raw supabase client — `.from()`, `.channel()`; see `public/supabase.js:838`), `window.ShapeLiveValidate.bsValidLivePayload`, the page's `clientId` (already parsed at line 42) and `accent` (line 101).
- Produces: a self-contained station that renders ONLY when a validated live row exists. Nothing else on the page changes.

- [ ] **Step 1: Write the component** (insert after `CKSecHead`, before `CoachClientDetailPage`):

```jsx
// THE LIVE STATION (spec 2026-07-19): a realtime view of the client's
// in-progress session. Consumer-side hygiene ported from the mobile console
// (iosAppBroadsheetPros.jsx BSProLiveWatch): the `evented` TOCTOU guard (a
// late initial fetch never overwrites a newer realtime event/DELETE) and the
// subscription-side expires_at timer (an open page drops the row at expiry).
// No readable row → null — THE STATION DOES NOT EXIST (absence; never a
// "private" label: RLS makes private / not-visible / expired indistinguishable).
function CKLiveStation({ clientId, accent }) {
  const [row, setRow] = React.useState(null);
  React.useEffect(() => {
    const db = window.shapeDb && window.shapeDb.client;
    if (!db || !clientId) return undefined;
    setRow(null);   // SYNCHRONOUS reset on client change — B must never render A's payload, even for a frame (spec review)
    let on = true; let evented = false; let expTimer = null; let channel = null;
    const take = (r, fromEvent) => {
      if (!on) return;
      if (fromEvent) evented = true; else if (evented) return;   // TOCTOU guard
      // Expiry gates EVENTS too (review round): an already-expired realtime
      // INSERT/UPDATE would set no timer and pin the station forever.
      const expMs = r && r.expires_at ? new Date(r.expires_at).getTime() - Date.now() : 0;
      if (r && !(expMs > 0)) r = null;   // expired OR invalid/NaN expiry = absence (NaN fails > 0)
      setRow(r);
      if (expTimer) { clearTimeout(expTimer); expTimer = null; }
      if (r && expMs > 0) expTimer = setTimeout(() => { if (on) setRow(null); }, expMs);
    };
    db.from("user_activity_live")
      .select("payload, started_at, updated_at, expires_at")
      .eq("user_id", clientId).gt("expires_at", new Date().toISOString()).maybeSingle()
      .then(({ data }) => take(data || null, false))
      .catch(() => {});
    try {
      channel = db.channel(`ck-live-${clientId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "user_activity_live", filter: `user_id=eq.${clientId}` },
          (p) => { try { take(p.eventType === "DELETE" ? null : (p.new || null), true); } catch (e) {} })
        .subscribe();
    } catch (e) {}
    return () => { on = false; if (expTimer) clearTimeout(expTimer); if (channel) { try { db.removeChannel(channel); } catch (e) {} } };
  }, [clientId]);
  const lp = row && window.ShapeLiveValidate ? window.ShapeLiveValidate.bsValidLivePayload(row.payload) : null;
  // Workout payloads only (review round): the cooking-detail PR later teaches
  // the validator a {kind:'cooking'} shape with NO exercises — this station
  // must gate on the discriminator or that row would crash the render.
  if (!lp || (lp.kind && lp.kind !== 'workout')) return null;   // absence — the station does not exist
  const started = row.started_at ? new Date(row.started_at).getTime() : null;
  const mins = started != null ? Math.max(0, Math.floor((Date.now() - started) / 60000)) : null;
  return (
    <Card style={{ marginBottom: 16, border: `1px solid ${accent}55` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <CKSecHead>LIVE · IN A SESSION NOW</CKSecHead>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: accent, textTransform: "uppercase" }}>
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: accent, boxShadow: "0 0 8px " + accent, marginRight: 6 }} />
          {lp.resting ? "Resting" : "Working"}{mins != null ? ` · ${mins} min in` : ""} · Sets {lp.setsDone}/{lp.setsTotal}
        </span>
      </div>
      {lp.exercises.map((e, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "baseline", padding: "9px 0", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none" }}>
          <span style={{ fontFamily: "Fraunces, serif", fontSize: 15, color: i === lp.curIdx ? "#f2ede4" : "rgba(242,237,228,0.7)" }}>
            {i === lp.curIdx ? <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: accent, marginRight: 8 }}>NOW ▸</span> : null}{e.n}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.55)" }}>—</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: e.done >= e.total ? accent : "rgba(242,237,228,0.75)" }}>{e.done}/{e.total}</span>
        </div>
      ))}
    </Card>
  );
}
```

The load cell renders the literal `—` alone — loads are honest-absent in v1 (the payload carries none), and a unit suffix would imply a claim.

- [ ] **Step 2: Mount it** — in `CoachClientDetailPage`'s return, insert as the first child inside `<React.Fragment>` (line ~162, before the stat-grid `<Card>`):

```jsx
<CKLiveStation clientId={clientId} accent={accent} />
```

- [ ] **Step 3: Parse-check** — babel parse on `coachClientDetail.jsx` → clean.
- [ ] **Step 4: Commit** — `git commit -am "live-web: THE LIVE STATION on the coach client page (realtime, evented guard, expiry timer)"`

---

### Task 4: Chat-widget presence line — "In a workout · N min"

**Files:**
- Modify: `public/newdesign/chatWidget.jsx` — the profile-preview identity block (~line 1236–1240, where `CwFacetAvatar size={64}` renders with the `tier · roleLabel` line under it).
- Modify: every versioned `chatWidget.jsx?v=` reference → `?v=20260719` (grep first; the 2026-06-09 count was ~82 pages — do a byte-safe replace, preserve CRLF on the CRLF-tracked pages).

**Interfaces:**
- Consumes: `window.shapeDb.client` (only present on pages that load supabase — the read is feature-detected and silently absent otherwise), the preview's `profileFor.userId`.
- Produces: presence-tier info only — kind + minutes from `user_activity` (authenticated-read; NO set detail, no new privacy surface).

- [ ] **Step 1: Add a small hook near the widget's other helpers:**

```jsx
// Presence-tier activity line (spec 2026-07-19): what the member is DOING now
// ('workout' | 'cooking') + minutes in, from the existing authenticated-read
// user_activity table. Presence info only — never set detail (that is the
// coach station's job, behind its own RLS).
function cwUseActivity(userId, open) {
  const [act, setAct] = React.useState(null);
  React.useEffect(() => {
    const db = window.shapeDb && window.shapeDb.client;
    if (!db || !userId || !open) { setAct(null); return undefined; }
    let on = true; let expTimer = null;
    db.from("user_activity").select("kind, started_at, expires_at")
      .eq("user_id", userId).gt("expires_at", new Date().toISOString()).maybeSingle()
      .then(({ data }) => {
        if (!on) return;
        // Require a FINITE future expiry — malformed expires_at (NaN) must read
        // as absence, never an untimed forever-line.
        const expOk = data && data.expires_at && (new Date(data.expires_at).getTime() - Date.now()) > 0;
        setAct(expOk ? data : null);
        // Clear the line AT expiry (review round) — an open preview must not
        // keep saying "In a workout" after the activity row lapses.
        const expMs = data && data.expires_at ? new Date(data.expires_at).getTime() - Date.now() : 0;
        if (expMs > 0) expTimer = setTimeout(() => { if (on) setAct(null); }, expMs);
      })
      .catch(() => { if (on) setAct(null); });
    return () => { on = false; if (expTimer) clearTimeout(expTimer); };
  }, [userId, open]);
  if (!act) return null;
  const mins = act.started_at ? Math.max(0, Math.floor((Date.now() - new Date(act.started_at).getTime()) / 60000)) : null;
  const verb = act.kind === "cooking" ? "In the kitchen" : "In a workout";
  return mins != null ? `${verb} · ${mins} min in` : verb;
}
```

- [ ] **Step 2: Render it** in the profile preview under the `tier · roleLabel` line (the block at ~1239): call `const actLine = cwUseActivity(profileFor && profileFor.userId, true);` in the preview's component scope (NOT inside a conditional — hooks rule), then below the tier/role line:

```jsx
{actLine && <div style={{ marginTop: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "#2ee0c4" }}>{actLine}</div>}
```

⚠ Placement: the preview is rendered inside the widget's main component — if the identity block is inline JSX (not its own component), hoist the hook call to the top level of that component beside its other `React.useState` calls, gated by `profileFor` being open via the hook's `open` arg.

- [ ] **Step 3: Parse-check** `chatWidget.jsx` → clean.
- [ ] **Step 4: `?v=` sweep** — `grep -rln "chatWidget.jsx?v=" public/ *.html` → bump every hit to `?v=20260719` with a byte-safe replace (node script or per-file sed with CRLF check via `git ls-files --eol` — Pricing.html + Community.html are CRLF-tracked). Verify `git diff --stat` shows 1-line diffs per page.
- [ ] **Step 5: Commit** — `git commit -am "live-web: chat-widget presence line (in a workout · N min) + ?v sweep"`

---

### Task 5: Headless browser proof + gates

**Files:** none (verification only).

- [ ] **Step 1: `npm test`** → green (Task 1's identity test included).
- [ ] **Step 2: PowerShell mobile build** → exit 0; `tsc --noEmit` → clean (no TS touched, sanity only).
- [ ] **Step 3: Headless proof on the branch preview** (chrome-devtools MCP or Playwright against the Vercel branch deploy, signed in as the coach account when available — otherwise run the DOM-level proof on a local static serve with a stubbed `window.shapeDb`):
  - Seed: as a linked test client, insert a `user_activity_live` row (public visibility, valid payload) — or run the mobile session player in a second context.
  - Prove: the station renders (exercise rows + NOW marker + Sets m/n); a realtime UPDATE moves the NOW marker; a DELETE removes the station; **no row → no station element in the DOM at all**; loads column reads `—`.
  - Race/timer paths (spec addition): stub `db.from(...).maybeSingle()` to resolve AFTER a synthetic realtime DELETE fires → the station must STAY absent (evented guard); seed a row whose `expires_at` is ~15s out → the station disappears at expiry without any event; feed a malformed payload (`{v:1, exercises:[]}`) → no station.
  - **A → B navigation:** open client A's page (station live), navigate to client B → prove A's channel is removed (`db.removeChannel` called / no `ck-live-A` in `db.getChannels()`) and A's expiry timer can no longer fire into B's page (the effect's `[clientId]` teardown is the mechanism — verify it, don't assume it).
  - **Cross-member RLS denial at the DATA boundary (late #1766 finding + #1768 round, CWE-862):** two DISTINCT authenticated accounts — coach C1 (linked to member M, whose row is `followers`-tier) and stranger S (not a follower, not M's coach). Assert the QUERY/EVENT layer, not just the DOM: capture S's actual `user_activity_live` select result (`data === null`, zero rows) AND S's realtime callback count (0 after C1-visible updates fire), while C1's select returns the row and C1's callback count increments — then also the UI layer (no station element for S, live station for C1). A DOM-only check could pass while unauthorized data reaches the client and is merely hidden.
- [ ] **Step 4: LF/CRLF audit** on every touched file (`git ls-files --eol` + `tr -cd '\r'`), then **final commit + push + PR** — title `live-web: THE LIVE STATION — coach live-watch parity on the website (spec 2026-07-19)`; body links the spec; **no migration** note; wait CI green + CodeRabbit, address findings, squash-merge, re-sync branch.

---

## Self-review notes (writing-plans checklist)

- **Spec coverage:** station (T3) · transport/browser-realtime (T2+T3) · canonical module move (T1) · evented+expiry hygiene (T3 code) · presence line (T4) · testing incl. race/timer paths (T5) · "no route, no migration" (global) — all covered.
- **Type consistency:** `bsValidLivePayload(raw) → {v,title,exercises:[{n,done,total}],curIdx,resting,setsDone,setsTotal}|null` used identically in T1/T3; `window.ShapeLiveValidate` defined T2, consumed T3.
- **Known deviation from spec wording:** the spec says "`liveProgress.mjs` becomes a canonical module" — implemented as the split-with-shim because the file imports `workoutShare.mjs`, which is not web-servable; the validator (the piece parity depends on) is single-implementation, enforced by T1's referential-equality test. Record this in the PR body.
