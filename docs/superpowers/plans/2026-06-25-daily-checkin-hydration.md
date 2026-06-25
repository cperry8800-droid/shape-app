# Daily energy/hunger check-in + hydration logger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two daily-wellness home cards — a once/day Energy + Hunger check-in (1–10) and a dedicated hydration logger (ring + quick-add) — writing to `daily_health_snapshot`.

**Architecture:** Energy/hunger become `daily_health_snapshot` columns written by the existing daily check-in route (`/api/client/checkin`) and read via the progress series; hydration uses a small new `/api/client/hydration` route (signed delta, clamped ≥0) for quick-add + undo (the meal-log accumulator rejects negatives). Two mobile cards model the existing `BSStepsCard`. Client-only beyond one column migration.

**Tech Stack:** Next.js 16 App Router route handlers (TS); Supabase Postgres; React (babel-standalone broadsheet JSX).

## Global Constraints

- **Branch:** `feat/daily-checkin-hydration` (off `main`). Keep after merge.
- **No new colored emoji** in UI copy — text/typographic glyphs only.
- **Mobile build is PowerShell-only** (Git Bash mangles `VITE_BASE=/m/`): `cd mobile-app; $env:VITE_BASE='/m/'; npm run build` then from repo root `Remove-Item -Recurse -Force public\m; Copy-Item -Recurse mobile-app\dist public\m`; confirm `/m/assets/` in `public/m/index.html`.
- **Parse-check JSX:** `node -e "require('./mobile-app/node_modules/@babel/parser').parse(require('fs').readFileSync('<file>','utf8'),{sourceType:'module',plugins:['jsx']})"`.
- **CRLF trap:** after editing any `.ts`/`.js`/`.jsx`, run `tr -cd '\r' < <file> | wc -c`; strip if non-zero. Repo is LF, no BOM. Commit mobile-source with `MSYS_NO_PATHCONV=1 git commit`.
- **tsc baseline:** `npx tsc --noEmit` must be clean (exit 0) after the TS tasks.
- **Migrations:** owner runs them; reply with only the `raw.githubusercontent.com/.../supabase-migrations/2026-06-25-daily-energy-hunger.sql` link. Idempotent; code no-ops for energy/hunger until applied (snapshot reads use `select('*')`).
- **Energy/hunger are 1–10 integers; hydration in liters (stored), displayed metric (ml/L) or imperial (oz) per `t.isMetric`.** Rating colors verbatim: energy `#34d6c5`, hunger `#e8b14a`.
- **Routes are RLS-scoped + membership-gated** by the `/api/client` proxy prefix; no new auth wiring.
- Review stack + CodeRabbit before merge; required CI checks green.

---

### Task 1: Migration — `energy` + `hunger` columns

**Files:**
- Create: `supabase-migrations/2026-06-25-daily-energy-hunger.sql`

**Interfaces:**
- Produces: `daily_health_snapshot.energy smallint` + `daily_health_snapshot.hunger smallint` (1–10), consumed by Tasks 2 & 4.

- [ ] **Step 1: Write the migration**

Create `supabase-migrations/2026-06-25-daily-energy-hunger.sql`:

```sql
-- Daily energy + hunger ratings (1–10) on the per-day snapshot, parallel to the
-- existing mood/stress/soreness columns. Written by /api/client/checkin from the
-- new daily check-in card. Idempotent.

alter table public.daily_health_snapshot
  add column if not exists energy smallint check (energy is null or energy between 1 and 10),
  add column if not exists hunger smallint check (hunger is null or hunger between 1 and 10);
```

- [ ] **Step 2: Verify the SQL is well-formed**

Read it back; confirm both columns are `add column if not exists` with a 1–10 nullable CHECK. (It can't be executed here — the owner applies it.)

- [ ] **Step 3: Commit**

```bash
git add supabase-migrations/2026-06-25-daily-energy-hunger.sql
git commit -m "feat: daily_health_snapshot energy + hunger columns (1-10)"
```

> After merge, send the owner only the raw link:
> `raw.githubusercontent.com/cperry8800-droid/shape-app/main/supabase-migrations/2026-06-25-daily-energy-hunger.sql`

---

### Task 2: Backend — energy/hunger on the daily check-in + progress series

**Files:**
- Modify: `src/app/api/client/checkin/route.ts` (accept `energy`/`hunger`)
- Modify: `src/app/api/client/progress/route.ts` (add `energy`/`hunger` series)
- Modify: `src/lib/health-snapshot.ts:14-37` (add `energy`/`hunger` to `SnapshotPatch`)

**Interfaces:**
- Produces: `POST /api/client/checkin` accepts `{ mood?, energy?, hunger?, stress?, soreness?, date? }` (mood no longer strictly required when energy/hunger present); `GET /api/client/progress` returns `series.energy` + `series.hunger` (arrays of `{date,value}`), consumed by Task 4.

- [ ] **Step 1: Accept energy/hunger in the check-in route**

In `src/app/api/client/checkin/route.ts`, the handler currently requires `mood`. Allow energy/hunger as independent daily fields. Replace the `mood`-required block (lines 32-51) with:

```ts
  const mood = clamp1to10((body as Record<string, unknown>).mood);
  const energy = clamp1to10((body as Record<string, unknown>).energy);
  const hunger = clamp1to10((body as Record<string, unknown>).hunger);
  const stress = clamp1to10((body as Record<string, unknown>).stress);
  const soreness = clamp1to10((body as Record<string, unknown>).soreness);
  if (mood == null && energy == null && hunger == null && stress == null && soreness == null) {
    return NextResponse.json({ error: 'Nothing to log.' }, { status: 400 });
  }

  const supabase = await clientForRequest(request);
  const today = clientLocalDay((body as Record<string, unknown>).date);

  const { data: existing } = await supabase
    .from('daily_health_snapshot')
    .select('id')
    .eq('user_id', user.id)
    .eq('snapshot_date', today)
    .maybeSingle();

  const patch: Record<string, unknown> = {};
  if (mood != null) patch.mood = mood;
  if (energy != null) patch.energy = energy;
  if (hunger != null) patch.hunger = hunger;
  if (stress != null) patch.stress = stress;
  if (soreness != null) patch.soreness = soreness;
```

And change the final response (line 66) from `{ ok: true, mood }` to:

```ts
  return NextResponse.json({ ok: true, mood, energy, hunger });
```

(Update the route's top comment to mention energy/hunger.)

- [ ] **Step 2: Add energy/hunger to the progress series**

In `src/app/api/client/progress/route.ts`, the `seriesFor` helper's key union currently lists snapshot columns. Add `'energy'` and `'hunger'` to the key type union, then add two series next to the others (e.g. near `stepsSeries`):

```ts
  const energySeries = seriesFor('energy');
  const hungerSeries = seriesFor('hunger');
```

And add them to the returned `series` object:

```ts
      energy: energySeries,
      hunger: hungerSeries,
```

(The snapshot query already uses `select('*')`, so this is migration-safe — `energy`/`hunger` simply return empty until the migration is applied.)

- [ ] **Step 3: Add energy/hunger to the SnapshotPatch type**

In `src/lib/health-snapshot.ts`, add to the `SnapshotPatch` type (after `mood?`):

```ts
  energy?: number | null;
  hunger?: number | null;
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0 (clean).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/client/checkin/route.ts src/app/api/client/progress/route.ts src/lib/health-snapshot.ts
git commit -m "feat: daily energy/hunger on /api/client/checkin + progress series"
```

---

### Task 3: Backend — new `/api/client/hydration` route (quick-add + undo)

**Files:**
- Create: `src/app/api/client/hydration/route.ts`
- Modify: `src/lib/warroom.ts` (register the route in `RAW_ROUTES`)

**Interfaces:**
- Produces: `GET /api/client/hydration` → `{ ok, hydrationL, targetL, date }` (today's hydration_l + the hydration target); `POST /api/client/hydration { deltaL, date? }` → applies a signed delta to today's `hydration_l`, **clamped at 0**, returns the new `{ ok, hydrationL, targetL, date }`. Consumed by Task 4.

- [ ] **Step 1: Write the route**

Create `src/app/api/client/hydration/route.ts`:

```ts
// Direct hydration logging for the home Hydration card. GET returns today's
// hydration_l + the user's daily target; POST applies a SIGNED delta (in liters)
// to today's daily_health_snapshot row, clamped at 0 (so undo can't go negative —
// the meal-log accumulator rejects negatives). Merges with device-synced /
// meal-logged hydration for the day. Auth: cookie or Bearer; sits under
// /api/client so the membership proxy gate applies.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';
import { clientLocalDay } from '@/lib/local-day';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_TARGET_L = 3.0;

// Best-effort read of the user's hydration target from client_settings; 3.0 L
// default. client_settings stores per-user prefs as a jsonb `settings` doc keyed
// by the same `hydration_target_l` key the settings UI writes.
async function readTargetL(supabase: Awaited<ReturnType<typeof clientForRequest>>, userId: string): Promise<number> {
  try {
    const { data } = await supabase
      .from('client_settings')
      .select('settings')
      .eq('user_id', userId)
      .maybeSingle();
    const raw = (data as { settings?: Record<string, unknown> } | null)?.settings?.hydration_target_l;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TARGET_L;
  } catch {
    return DEFAULT_TARGET_L;
  }
}

export async function GET(request: Request) {
  const supabase = await clientForRequest(request);
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const today = clientLocalDay(new URL(request.url).searchParams.get('date'));
  const { data } = await supabase
    .from('daily_health_snapshot')
    .select('hydration_l')
    .eq('user_id', user.id)
    .eq('snapshot_date', today)
    .maybeSingle();
  const targetL = await readTargetL(supabase, user.id);
  const hydrationL = Number((data as { hydration_l?: number } | null)?.hydration_l ?? 0) || 0;
  return NextResponse.json({ ok: true, hydrationL, targetL, date: today });
}

export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: false });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const deltaL = Number((body as Record<string, unknown>).deltaL);
  if (!Number.isFinite(deltaL) || deltaL === 0) {
    return NextResponse.json({ error: 'A nonzero deltaL is required.' }, { status: 400 });
  }

  const supabase = await clientForRequest(request);
  const today = clientLocalDay((body as Record<string, unknown>).date);
  const { data: existing } = await supabase
    .from('daily_health_snapshot')
    .select('id, hydration_l')
    .eq('user_id', user.id)
    .eq('snapshot_date', today)
    .maybeSingle();

  const cur = Number((existing as { hydration_l?: number } | null)?.hydration_l ?? 0) || 0;
  const next = Math.max(0, Math.round((cur + deltaL) * 1000) / 1000); // clamp ≥0, mL precision

  const result = (existing && (existing as { id?: string }).id)
    ? await supabase.from('daily_health_snapshot').update({ hydration_l: next }).eq('id', (existing as { id: string }).id)
    : await supabase.from('daily_health_snapshot').insert({ user_id: user.id, snapshot_date: today, hydration_l: next });
  if (result.error) return dbError(result.error, 'hydration write', 500);

  const targetL = await readTargetL(supabase, user.id);
  return NextResponse.json({ ok: true, hydrationL: next, targetL, date: today });
}
```

> NOTE for the implementer: verify how `client_settings` stores `hydration_target_l` (grep `client_settings` + the settings-write path). If it's a flat column rather than a `settings` jsonb, adjust `readTargetL` accordingly; keep the 3.0 default + the try/catch fallback either way.

- [ ] **Step 2: Register in the War Room**

In `src/lib/warroom.ts`, add `/api/client/hydration` to the `RAW_ROUTES` array (match the exact tuple/string format of the neighboring `/api/client/*` entries — read a neighbor first).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/client/hydration/route.ts src/lib/warroom.ts
git commit -m "feat: GET/POST /api/client/hydration (quick-add + undo, clamped >=0)"
```

---

### Task 4: Mobile — helpers + the two home cards

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (extend `logCheckin` for energy/hunger; add `window.ShapeHydration`)
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (add `BSDailyCheckinCard` + `BSHydrationCard`; mount both on the home page)

**Interfaces:**
- Consumes: Task 2's progress `series.energy`/`series.hunger`; Task 3's `/api/client/hydration`; existing `useBS`, `useStateBSC`, `BSPlate`, `t.isMetric`, `_localDate`, `sessionsAuthHeaders`, `cachedClientJson`, `window.ShapeProgress.progress`, `window.ShapeMetrics.invalidate`, the `BSStepsCard` pattern, the `BS_CHECKIN_RATINGS` rating-row idiom.

- [ ] **Step 1: Extend `logCheckin` + add `window.ShapeHydration` (shapeBackend.js)**

Find `async function logCheckin` (~line 3305) and its `window.ShapeCheckin = { log: logCheckin }` (~3319). Thread `energy`/`hunger` through the POST body (it already sends `{ mood, stress, soreness, date }` and calls `invalidateClientMetrics()` after). Add `energy`/`hunger` to the body it posts:

```javascript
    body: JSON.stringify({ mood, energy, hunger, stress, soreness, date: _localDate() }),
```

(Update `logCheckin`'s signature to accept `{ mood, energy, hunger, stress, soreness } = {}` and pass them through. Keep the existing `invalidateClientMetrics()` call so the cards re-read.)

Then add a hydration helper next to `window.ShapeMealLog` (~line 3955):

```javascript
async function getHydration() {
  return getJsonOrDefault(`${apiBaseUrl || ''}/api/client/hydration`, null);
}
async function addHydration(deltaL) {
  const res = await fetch(`${apiBaseUrl || ''}/api/client/hydration`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...sessionsAuthHeaders() },
    body: JSON.stringify({ deltaL, date: _localDate() }),
  });
  invalidateClientMetrics();
  return res.ok ? res.json() : null;
}
window.ShapeHydration = { get: getHydration, add: addHydration };
```

(Verify `getJsonOrDefault` + `sessionsAuthHeaders` + `apiBaseUrl` + `invalidateClientMetrics` are the in-file helpers the other `Shape*` data calls use — they are, e.g. `window.ShapeMealLog`.)

- [ ] **Step 2: Parse-check shapeBackend.js + commit**

```bash
node -e "require('./mobile-app/node_modules/@babel/parser').parse(require('fs').readFileSync('mobile-app/src/services/shapeBackend.js','utf8'),{sourceType:'module',plugins:['jsx']})"
echo "crlf $(tr -cd '\r' < mobile-app/src/services/shapeBackend.js | wc -c)"
git add mobile-app/src/services/shapeBackend.js
MSYS_NO_PATHCONV=1 git commit -m "feat: ShapeCheckin energy/hunger + window.ShapeHydration helpers"
```

- [ ] **Step 3: Add `BSDailyCheckinCard` (iosAppBroadsheetClient.jsx)**

Place it near `BSStepsCard` (~line 14864). It reads today's energy/hunger from `window.ShapeProgress.progress()` (`series.energy`/`series.hunger`), renders two 1–10 tap-rows (the `BS_CHECKIN_RATINGS` idiom; energy teal `#34d6c5`, hunger amber `#e8b14a`), and logs via `window.ShapeCheckin.log`:

```javascript
function BSDailyCheckinCard() {
  const t = useBS();
  const teal = '#34d6c5'; const amber = '#e8b14a';
  const signedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  const [energy, setEnergy] = useStateBSC(null);
  const [hunger, setHunger] = useStateBSC(null);
  const [logged, setLogged] = useStateBSC(false);
  const [editing, setEditing] = useStateBSC(false);
  React.useEffect(() => {
    if (!signedIn || !window.ShapeProgress?.progress) return undefined;
    let on = true;
    const d = new Date();
    const todayIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    window.ShapeProgress.progress().then((p) => {
      if (!on || !p || !p.series) return;
      const e = (p.series.energy || []).find((s) => s.date === todayIso);
      const h = (p.series.hunger || []).find((s) => s.date === todayIso);
      if (e) setEnergy(Math.round(Number(e.value)));
      if (h) setHunger(Math.round(Number(h.value)));
      if (e || h) setLogged(true);
    }).catch(() => {});
    return () => { on = false; };
  }, [signedIn]);

  const Row = ({ label, val, set, c }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70 }}>{label}</span>
        <span style={{ fontFamily: t.DISPLAY, fontSize: 16, color: val ? c : t.INK50 }}>{val || '—'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 4 }}>
        {Array.from({ length: 10 }).map((_, i) => { const v = i + 1; const on = (val || 0) >= v; const sel = val === v;
          return <button key={v} onClick={() => set(v)} aria-label={`${label} ${v} of 10`} style={{ height: 22, borderRadius: 3, border: `1px solid ${sel ? c : t.RULE}`, background: on ? (sel ? c : `${c}66`) : 'transparent', cursor: 'pointer', padding: 0 }} />;
        })}
      </div>
    </div>
  );

  const doLog = () => {
    if (energy == null && hunger == null) return;
    try { window.ShapeCheckin?.log?.({ energy, hunger }); } catch (e) {}
    setLogged(true); setEditing(false);
  };

  const showForm = !logged || editing;
  return (
    <div style={{ borderRadius: 6, border: `1px solid ${t.RULE}`, borderLeft: `3px solid ${bsTHexA(teal, 0.55)}`, background: bsTHexA(t.INK, 0.03), padding: 14, marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal }}>How are you · today</span>
        {logged && !editing && <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, color: t.INK50 }}>Edit</button>}
      </div>
      {showForm ? (
        <>
          <Row label="Energy" val={energy} set={setEnergy} c={teal} />
          <Row label="Hunger" val={hunger} set={setHunger} c={amber} />
          <button onClick={doLog} disabled={energy == null && hunger == null} style={{ marginTop: 4, width: '100%', borderRadius: 5, border: 0, background: (energy == null && hunger == null) ? t.HAIR : teal, color: '#04201d', cursor: 'pointer', padding: '12px', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Log today</button>
        </>
      ) : (
        <div style={{ fontFamily: t.BODY, fontSize: 13, color: t.INK70 }}>Energy <b style={{ color: teal }}>{energy ?? '—'}</b> · Hunger <b style={{ color: amber }}>{hunger ?? '—'}</b> · logged ✓</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add `BSHydrationCard` (iosAppBroadsheetClient.jsx)**

Place it after `BSDailyCheckinCard`. Reads `{ hydrationL, targetL }` via `window.ShapeHydration.get()`, renders a bar toward target + quick-add chips (metric ml / imperial oz) + undo:

```javascript
function BSHydrationCard() {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const signedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  const [val, setVal] = useStateBSC(null);   // liters today
  const [target, setTarget] = useStateBSC(3.0);
  const [lastDelta, setLastDelta] = useStateBSC(0);
  React.useEffect(() => {
    if (!signedIn || !window.ShapeHydration?.get) return undefined;
    let on = true;
    window.ShapeHydration.get().then((d) => { if (on && d && d.ok) { setVal(Number(d.hydrationL) || 0); setTarget(Number(d.targetL) || 3.0); } }).catch(() => {});
    return () => { on = false; };
  }, [signedIn]);

  const add = (deltaL) => {
    const cur = Number(val) || 0;
    const next = Math.max(0, Math.round((cur + deltaL) * 1000) / 1000);
    setVal(next); setLastDelta(deltaL);
    try { window.ShapeHydration?.add?.(deltaL).then((d) => { if (d && d.ok) setVal(Number(d.hydrationL) || 0); }); } catch (e) {}
  };
  const undo = () => { if (lastDelta) { add(-lastDelta); setLastDelta(0); } };

  const cur = Number(val) || 0;
  const pct = target > 0 ? Math.min(1, cur / target) : 0;
  const L = (n) => `${(Math.round(n * 100) / 100)}`;
  const ML = 0.25, ML2 = 0.5, OZ = 0.2366, OZ2 = 0.4732; // 8oz / 16oz in liters
  const chips = t.isMetric ? [['+250 ml', ML], ['+500 ml', ML2]] : [['+8 oz', OZ], ['+16 oz', OZ2]];
  const display = t.isMetric ? `${L(cur)} / ${L(target)} L` : `${Math.round(cur * 33.814)} / ${Math.round(target * 33.814)} oz`;

  return (
    <div style={{ borderRadius: 6, border: `1px solid ${t.RULE}`, borderLeft: `3px solid ${bsTHexA(teal, 0.55)}`, background: bsTHexA(t.INK, 0.03), padding: 14, marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal }}>Hydration · today</span>
        <span style={{ fontFamily: t.DISPLAY, fontSize: 18, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{val == null ? '—' : display}<span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}> · {Math.round(pct * 100)}%</span></span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: t.HAIR, overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: teal, borderRadius: 999 }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {chips.map(([lab, d]) => (
          <button key={lab} onClick={() => add(d)} style={{ flex: 1, borderRadius: 5, border: `1px solid ${teal}66`, background: `${teal}14`, color: t.INK, cursor: 'pointer', padding: '11px', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em' }}>{lab}</button>
        ))}
        <button onClick={undo} disabled={!lastDelta} aria-label="Undo last" style={{ width: 44, borderRadius: 5, border: `1px solid ${t.RULE}`, background: 'transparent', color: lastDelta ? t.INK : t.INK50, cursor: lastDelta ? 'pointer' : 'default', fontFamily: t.MONO, fontSize: 13, fontWeight: 800 }}>↶</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Mount both cards on the home page**

In `BSClientHome` (the home component, search `function BSClientHome`), add the two cards in the day-section near the habits / score cards (locate the habits card render and place these just after it, before the score card). Use the surrounding context to find the exact slot:

```jsx
        <BSDailyCheckinCard />
        <BSHydrationCard />
```

(If `bsTHexA` / `useStateBSC` / `useBS` aren't in scope at the card definitions — they are, `BSStepsCard` uses them — report NEEDS_CONTEXT rather than guessing.)

- [ ] **Step 6: Parse-check + mobile build + resync (PowerShell)**

```bash
node -e "require('./mobile-app/node_modules/@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```
PowerShell:
```powershell
cd mobile-app; $env:VITE_BASE='/m/'; npm run build
cd ..; Remove-Item -Recurse -Force public\m; Copy-Item -Recurse mobile-app\dist public\m
```
Confirm `/m/assets/` in `public/m/index.html`.

- [ ] **Step 7: CRLF check + commit**

```bash
echo "crlf $(tr -cd '\r' < mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx | wc -c)"
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx public/m
MSYS_NO_PATHCONV=1 git commit -m "feat: daily energy/hunger check-in card + hydration logger card"
```

---

### Task 5: Verification + staging

**Files:** none.

- [ ] **Step 1: Full verify**

```bash
npm test
npx tsc --noEmit
node -e "require('./mobile-app/node_modules/@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"
```
Expected: tests green (unaffected); tsc clean; JSX parses.

- [ ] **Step 2: Confirm public/m sync** (PowerShell rebuild + `git status --porcelain public/m` clean; commit if not).

- [ ] **Step 3: Staging click-through**

```bash
git push origin feat/daily-checkin-hydration:staging --force
```
At `https://shape-app-git-staging-…vercel.app/m/` (browser UA): the two home cards render; tap energy/hunger + Log today (persists); +250 ml updates the ring; undo reverses it; imperial shows oz. (Energy/hunger only persist once the owner applies the migration — pre-migration the writes no-op gracefully and the card still renders.)

- [ ] **Step 4: Review + PR**

Run `/code-review` on the diff; open the PR to `main`; CI + CodeRabbit; address findings; squash-merge. Send the owner the migration raw link.

---

## Self-Review (completed by the plan author)

**Spec coverage:** energy/hunger card → Tasks 1,2,4; hydration card → Tasks 3,4; snapshot columns → Task 1; energy/hunger write path → Task 2; hydration quick-add+undo (clamped ≥0, the meal-log accumulator can't decrement) → Task 3; units (metric/imperial chips) → Task 4 Step 4; honest empty states → Task 4 (val `—` until loaded/logged); migration-safe reads (`select('*')`) → Tasks 2,3.

**Type consistency:** `/api/client/hydration` returns `{ ok, hydrationL, targetL, date }` (Task 3); Task 4's `BSHydrationCard` reads exactly `d.hydrationL`/`d.targetL`/`d.ok`. `/api/client/checkin` accepts `energy`/`hunger`; `ShapeCheckin.log({ energy, hunger })` (Task 4) sends those keys. `series.energy`/`series.hunger` (Task 2) are read as `p.series.energy`/`p.series.hunger` (Task 4).

**No placeholders:** complete code for the migration, the hydration route, the helpers, and both cards; precise edits for the checkin/progress extensions. The one verify-in-task note (the exact `client_settings.hydration_target_l` storage shape) carries a concrete default (3.0) + try/catch fallback so it's safe regardless.

## Out of scope

- Coach-facing daily energy/hunger surfacing; reminders/nudges; changing the weekly check-in or the hydration-target setting UI; adding mood to the new card.
