# Real food-database search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typing in the meal logger's add-food sheet searches a real hybrid food database (USDA FDC + Open Food Facts); results land as normal ingredient rows and recents become real.

**Architecture:** One pure module (`foodSearch.mjs`) is the single source of truth for normalize/merge/rank; the server route imports it directly (the `workoutShare.mjs` pattern — no TS twin). The route does its own auth BEFORE any provider fan-out; the client debounces/aborts and persists recents to `user_goals('food_recents')`.

**Tech Stack:** Node `node --test` for the pure module; Next.js App Router route (nodejs runtime); the existing `shapeBackend.js` window-bridge + `BSLogMealFlow` sheet.

**Spec:** `docs/superpowers/specs/2026-07-09-food-database-search-design.md` (merged #1643).

## Global Constraints

- One build PR (module + route + sheet + recents + War Room) — spec §Phasing.
- Auth via `currentUser(request)` BEFORE any provider fetch — 401 never fans out (spec §2).
- Per-provider timeout ~2.5 s; either side failing degrades to the other; both down → `{ results: [], unavailable: true }` (spec §2).
- No `FDC_API_KEY` → FDC leg quietly skipped (OFF-only results) — a keyless deploy is NOT a failure (spec §2).
- OFF requests carry `User-Agent: Shape/1.0 (privacy@theshapecommunity.com)` (spec §2).
- Rows missing kcal are dropped in `mergeAndRank` — never a fabricated 0 kcal (spec §4); macro values land as integers.
- Result cap 12 (spec §1). Client: debounce 350 ms, `AbortController`, min 2 chars (spec §3).
- Signed-out preview is byte-identical to today (demo FOODS catalog + demo recents) (spec §3).
- Recents: `user_goals('food_recents')`, cap 20, most-recent-first, deduped by name, best-effort write never blocks the add (spec §3). No migration.
- Per commit: JSX parse · `tsc --noEmit` · `VITE_BASE=/m/` build (PowerShell) · full `npm test` · LF check via `tr -cd '\r' | wc -c` (must print 0).
- v1 scope-outs: no barcode scan, no DB cache table, no website parity, no editing a recent's macros (spec §Out of scope).

## File Structure

- Create: `mobile-app/src/services/foodSearch.mjs` — pure normalize/merge/rank (no fetch, no window).
- Create: `tests/food-search.test.mjs` — unit vectors against fixture payloads from both APIs.
- Modify: `package.json` — register the test file.
- Create: `src/app/api/nutrition/food-search/route.ts` — GET route; auth → fan-out → normalize → merge.
- Modify: `mobile-app/src/services/shapeBackend.js` — `window.ShapeFoodSearch.search(q, { signal })`.
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — the add-food sheet's signed-in branch + recents helpers.
- Modify: `src/lib/warroom.ts` — `RAW_ROUTES` + checklist.

---

### Task 1: `foodSearch.mjs` pure module + tests (TDD)

**Files:**
- Create: `mobile-app/src/services/foodSearch.mjs`
- Test: `tests/food-search.test.mjs`
- Modify: `package.json` (test script)

**Interfaces:**
- Produces: `normalizeFdcFood(raw) -> row|null`, `normalizeOffProduct(raw) -> row|null`, `mergeAndRank(fdcRows, offRows, q) -> row[]` where a row is `{ id, source:'fdc'|'off', name, brand:string|null, qty, kcal, p, c, f, per100g:{kcal,p,c,f}|null, barcode?:string|null, servings:[{label,grams}] }` with integer kcal/p/c/f. Task 2 imports all three; Task 3 consumes rows as `{name, qty, kcal, p, c, f}`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/food-search.test.mjs — vectors for the pure food-search layer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFdcFood, normalizeOffProduct, mergeAndRank } from '../mobile-app/src/services/foodSearch.mjs';

const FDC_CHICKEN = {
  fdcId: 171077, description: 'Chicken, broilers or fryers, breast, meat only, cooked, roasted',
  dataType: 'SR Legacy',
  foodNutrients: [
    { nutrientNumber: '208', nutrientName: 'Energy', value: 165, unitName: 'KCAL' },
    { nutrientNumber: '203', nutrientName: 'Protein', value: 31, unitName: 'G' },
    { nutrientNumber: '205', nutrientName: 'Carbohydrate, by difference', value: 0, unitName: 'G' },
    { nutrientNumber: '204', nutrientName: 'Total lipid (fat)', value: 3.6, unitName: 'G' },
  ],
};
const FDC_WITH_SERVING = { ...FDC_CHICKEN, fdcId: 999, description: 'Egg, whole, cooked', servingSize: 50, servingSizeUnit: 'g' };
const FDC_NO_KCAL = { fdcId: 1, description: 'Mystery food', foodNutrients: [{ nutrientNumber: '203', value: 10 }] };

const OFF_BAR = {
  code: '0722252100900', product_name: 'Chocolate Chip Cookie Dough Bar', brands: 'Clif Bar',
  serving_size: '68 g', serving_quantity: 68,
  nutriments: { 'energy-kcal_100g': 368, proteins_100g: 13.2, carbohydrates_100g: 60.3, fat_100g: 7.4 },
};
const OFF_SERVING_ONLY = {
  code: '111', product_name: 'Protein Shake', brands: 'Premier Protein', serving_size: '340 ml',
  nutriments: { 'energy-kcal_serving': 160, proteins_serving: 30, carbohydrates_serving: 5, fat_serving: 3 },
};
const OFF_NO_KCAL = { code: '2', product_name: 'Sparkling Water', brands: 'X', nutriments: {} };

test('normalizeFdcFood: per-100g default serving, integers, honest label', () => {
  const r = normalizeFdcFood(FDC_CHICKEN);
  assert.equal(r.source, 'fdc');
  assert.equal(r.qty, '100 g');
  assert.equal(r.kcal, 165);
  assert.equal(r.p, 31);
  assert.equal(r.f, 4); // 3.6 rounds
  assert.deepEqual(r.per100g, { kcal: 165, p: 31, c: 0, f: 3.6 });
});

test('normalizeFdcFood: serving math from servingSize grams', () => {
  const r = normalizeFdcFood(FDC_WITH_SERVING);
  assert.equal(r.qty, '50 g');
  assert.equal(r.kcal, 83); // 165 * 0.5 → 82.5 → 83
});

test('normalizeFdcFood: kcal-less row → null', () => {
  assert.equal(normalizeFdcFood(FDC_NO_KCAL), null);
});

test('normalizeOffProduct: serving from serving_quantity grams', () => {
  const r = normalizeOffProduct(OFF_BAR);
  assert.equal(r.source, 'off');
  assert.equal(r.brand, 'Clif Bar');
  assert.equal(r.qty, '68 g');
  assert.equal(r.kcal, 250); // 368 * 0.68 → 250.24 → 250
  assert.equal(r.barcode, '0722252100900');
});

test('normalizeOffProduct: per-serving nutriments when no per-100g', () => {
  const r = normalizeOffProduct(OFF_SERVING_ONLY);
  assert.equal(r.qty, '340 ml');
  assert.equal(r.kcal, 160);
  assert.equal(r.p, 30);
});

test('normalizeOffProduct: kcal-less product → null', () => {
  assert.equal(normalizeOffProduct(OFF_NO_KCAL), null);
});

test('mergeAndRank: generic (FDC) above branded for a whole-food query', () => {
  const fdc = [normalizeFdcFood(FDC_CHICKEN)];
  const off = [normalizeOffProduct({ ...OFF_BAR, product_name: 'Chicken breast strips', brands: 'Tyson' })];
  const out = mergeAndRank(fdc, off, 'chicken breast');
  assert.equal(out[0].source, 'fdc');
});

test('mergeAndRank: brand-looking query surfaces the branded row first', () => {
  const fdc = [normalizeFdcFood({ ...FDC_CHICKEN, description: 'Cookie, chocolate chip' })];
  const off = [normalizeOffProduct(OFF_BAR)];
  const out = mergeAndRank(fdc, off, 'clif bar');
  assert.equal(out[0].source, 'off');
});

test('mergeAndRank: dedupes near-identical name+brand, drops kcal-less, caps at 12', () => {
  const dup = normalizeOffProduct(OFF_BAR);
  const many = Array.from({ length: 20 }, (_, i) => ({ ...normalizeOffProduct(OFF_BAR), id: `off-${i}`, name: `Bar ${i}`, brand: null }));
  const out = mergeAndRank([], [dup, { ...dup }, { ...dup, kcal: null }, ...many], 'bar');
  assert.equal(out.filter(r => r.name === dup.name).length, 1);
  assert.ok(out.every(r => Number.isFinite(r.kcal)));
  assert.equal(out.length, 12);
});

test('mergeAndRank: prefix match outranks substring match', () => {
  const a = { id: 'a', source: 'fdc', name: 'Rice, jasmine, cooked', brand: null, qty: '100 g', kcal: 130, p: 3, c: 28, f: 0, per100g: null, servings: [] };
  const b = { id: 'b', source: 'fdc', name: 'Fried rice', brand: null, qty: '100 g', kcal: 190, p: 5, c: 30, f: 6, per100g: null, servings: [] };
  const out = mergeAndRank([b, a], [], 'rice');
  assert.equal(out[0].id, 'a');
});
```

- [ ] **Step 2: Register + run to verify failure**

Add `tests/food-search.test.mjs` to the `test` script list in `package.json` (append at the end). Run: `node --test tests/food-search.test.mjs` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement the module**

```js
// mobile-app/src/services/foodSearch.mjs
// Real food-database search — the PURE normalize / merge / rank layer for the
// hybrid USDA FoodData Central + Open Food Facts search (spec
// docs/superpowers/specs/2026-07-09-food-database-search-design.md). The
// server route (/api/nutrition/food-search) imports these directly — the
// workoutShare.mjs one-implementation pattern, so the app and the API can
// never drift. No fetch, no window, no Date.
//
// A result row is the meal logger's ingredient shape plus provenance:
//   { id, source: 'fdc'|'off', name, brand, qty, kcal, p, c, f,
//     per100g: {kcal,p,c,f}|null, barcode?: string|null, servings: [{label, grams}] }
// kcal/p/c/f are integers for the row's default serving. Rows that cannot
// state a real kcal are dropped (honest-data — never a fabricated 0).

export const BS_FOOD_RESULT_CAP = 12;

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const trimNum = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

// FDC search hit (Foundation / SR Legacy): foodNutrients arrive per 100 g.
// Falls back to an honest '100 g' serving when no gram servingSize exists.
export function normalizeFdcFood(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.description || '').trim();
  if (!name) return null;
  const by = {};
  for (const n of (Array.isArray(raw.foodNutrients) ? raw.foodNutrients : [])) {
    const key = String(n?.nutrientNumber ?? n?.nutrientId ?? '');
    const v = num(n?.value);
    if (key && v != null) by[key] = v;
  }
  const per100g = {
    kcal: by['208'] ?? by['1008'] ?? null,
    p: by['203'] ?? by['1003'] ?? null,
    c: by['205'] ?? by['1005'] ?? null,
    f: by['204'] ?? by['1004'] ?? null,
  };
  if (per100g.kcal == null) return null;
  const sg = num(raw.servingSize);
  const grams = sg && sg > 0 && String(raw.servingSizeUnit || '').trim().toLowerCase().startsWith('g') ? sg : null;
  const scale = (grams || 100) / 100;
  const qty = grams ? `${trimNum(grams)} g` : '100 g';
  return {
    id: `fdc-${raw.fdcId ?? name}`,
    source: 'fdc',
    name,
    brand: raw.brandOwner ? String(raw.brandOwner).trim() : null,
    qty,
    kcal: Math.round(per100g.kcal * scale),
    p: Math.round((per100g.p ?? 0) * scale),
    c: Math.round((per100g.c ?? 0) * scale),
    f: Math.round((per100g.f ?? 0) * scale),
    per100g,
    barcode: null,
    servings: [{ label: qty, grams: grams || 100 }],
  };
}

// OFF product: prefer per-100g nutriments × serving grams; fall back to the
// *_serving nutriments; last resort an honest 100 g row. Barcode kept for v2.
export function normalizeOffProduct(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.product_name || '').trim();
  if (!name) return null;
  const n = raw.nutriments && typeof raw.nutriments === 'object' ? raw.nutriments : {};
  const per100g = {
    kcal: num(n['energy-kcal_100g']),
    p: num(n.proteins_100g), c: num(n.carbohydrates_100g), f: num(n.fat_100g),
  };
  let grams = num(raw.serving_quantity);
  if (grams == null) { const m = /([\d.]+)\s*g\b/i.exec(String(raw.serving_size || '')); grams = m ? Number(m[1]) : null; }
  if (grams != null && grams <= 0) grams = null;
  const servingLabel = String(raw.serving_size || '').trim();
  let qty, kcal, p, c, f;
  if (per100g.kcal != null && grams) {
    const scale = grams / 100;
    qty = servingLabel || `${trimNum(grams)} g`;
    kcal = Math.round(per100g.kcal * scale);
    p = Math.round((per100g.p ?? 0) * scale);
    c = Math.round((per100g.c ?? 0) * scale);
    f = Math.round((per100g.f ?? 0) * scale);
  } else if (num(n['energy-kcal_serving']) != null) {
    qty = servingLabel || '1 serving';
    kcal = Math.round(num(n['energy-kcal_serving']));
    p = Math.round(num(n.proteins_serving) ?? 0);
    c = Math.round(num(n.carbohydrates_serving) ?? 0);
    f = Math.round(num(n.fat_serving) ?? 0);
  } else if (per100g.kcal != null) {
    qty = '100 g';
    kcal = Math.round(per100g.kcal);
    p = Math.round(per100g.p ?? 0);
    c = Math.round(per100g.c ?? 0);
    f = Math.round(per100g.f ?? 0);
  } else {
    return null;
  }
  const brand = raw.brands ? String(raw.brands).split(',')[0].trim() || null : null;
  return {
    id: `off-${raw.code || name}`,
    source: 'off',
    name,
    brand,
    qty,
    kcal, p, c, f,
    per100g: per100g.kcal != null ? per100g : null,
    barcode: raw.code ? String(raw.code) : null,
    servings: [{ label: qty, grams: grams || null }],
  };
}

const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const brandHit = (q, brand) => {
  if (!brand) return false;
  const b = String(brand).toLowerCase();
  return nameKey(q).split(' ').some(tok => tok.length >= 3 && b.includes(tok));
};

// Dedupe near-identical name+brand pairs, rank (exact > prefix > word match;
// generic FDC above branded for whole-food queries, branded up on brand-looking
// queries), drop kcal-less rows, cap at BS_FOOD_RESULT_CAP.
export function mergeAndRank(fdcRows, offRows, q) {
  const query = String(q || '').trim().toLowerCase();
  const rows = [...(Array.isArray(fdcRows) ? fdcRows : []), ...(Array.isArray(offRows) ? offRows : [])]
    .filter(r => r && Number.isFinite(r.kcal));
  const brandIntent = rows.some(r => r.source === 'off' && brandHit(query, r.brand));
  const score = (r) => {
    let s = 0;
    const n = r.name.toLowerCase();
    if (n === query) s += 200;
    if (n.startsWith(query)) s += 100;
    else if (` ${n}`.includes(` ${query}`)) s += 50;
    if (brandHit(query, r.brand)) s += 60;
    s += r.source === 'fdc' ? (brandIntent ? 5 : 20) : (brandIntent ? 20 : 0);
    return s;
  };
  const seen = new Map();
  for (const r of rows) {
    const key = `${nameKey(r.name)}|${nameKey(r.brand)}`;
    const prev = seen.get(key);
    if (!prev || score(r) > score(prev)) seen.set(key, r);
  }
  return [...seen.values()]
    .map((r, i) => ({ r, i, s: score(r) }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .slice(0, BS_FOOD_RESULT_CAP)
    .map(x => x.r);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/food-search.test.mjs` → all pass; then full `npm test` → suite green (was 529 + new vectors).

- [ ] **Step 5: Verify LF + commit**

`tr -cd '\r' < mobile-app/src/services/foodSearch.mjs | wc -c` and same for the test file → both print 0 (else `sed -i 's/\r$//'`). Commit: `feat(nutrition): foodSearch.mjs pure normalize/merge/rank + tests`.

---

### Task 2: `GET /api/nutrition/food-search` route

**Files:**
- Create: `src/app/api/nutrition/food-search/route.ts`

**Interfaces:**
- Consumes: `normalizeFdcFood` / `normalizeOffProduct` / `mergeAndRank` from `../../../../../mobile-app/src/services/foodSearch.mjs`; `currentUser` from `@/lib/request-auth`.
- Produces: `GET ?q=<text>` → `{ results: row[] }` | `{ results: [], unavailable: true }`; 401 `{ error }` unauthenticated. Task 3's `ShapeFoodSearch` consumes this.

- [ ] **Step 1: Write the route**

```ts
// Real food-database search — hybrid USDA FoodData Central + Open Food Facts.
// GET /api/nutrition/food-search?q=<text> → { results } | { results: [], unavailable: true }
//
// Lives under /api/nutrition (membership proxy gate) — but the proxy fails
// open on faults, so like every sibling route this does its OWN auth:
// currentUser(request) (cookie or Bearer) is required BEFORE any provider
// fetch. An unauthenticated request 401s and never fans out (no provider-
// quota burn during a limiter fault).
//
// Providers run in parallel with a ~2.5 s per-leg timeout; either failing
// degrades to the other's results; both down → unavailable: true (the sheet
// shows the honest can't-reach state). No FDC_API_KEY → the FDC leg is
// quietly skipped (OFF-only) — works before the key exists, better after.
// Pure normalize/merge/rank is imported from the unit-tested mobile module
// (the workoutShare one-implementation pattern).

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';
import { normalizeFdcFood, normalizeOffProduct, mergeAndRank } from '../../../../../mobile-app/src/services/foodSearch.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVIDER_TIMEOUT_MS = 2500;
const OFF_USER_AGENT = 'Shape/1.0 (privacy@theshapecommunity.com)';

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

// null = the leg was attempted and FAILED; [] = clean empty.
async function searchFdc(q: string, key: string): Promise<unknown[] | null> {
  try {
    const res = await timedFetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: q, dataType: ['Foundation', 'SR Legacy'], pageSize: 15 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.foods) ? data.foods : [];
  } catch {
    return null;
  }
}

async function searchOff(q: string): Promise<unknown[] | null> {
  try {
    const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
    url.searchParams.set('search_terms', q);
    url.searchParams.set('search_simple', '1');
    url.searchParams.set('action', 'process');
    url.searchParams.set('json', '1');
    url.searchParams.set('page_size', '15');
    url.searchParams.set('fields', 'code,product_name,brands,serving_size,serving_quantity,nutriments');
    const res = await timedFetch(url.toString(), { headers: { 'user-agent': OFF_USER_AGENT } });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.products) ? data.products : [];
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });

  const fdcKey = process.env.FDC_API_KEY || '';
  const [fdc, off] = await Promise.all([
    fdcKey ? searchFdc(q, fdcKey) : Promise.resolve<unknown[]>([]),
    searchOff(q),
  ]);

  // "Unavailable" = every ATTEMPTED provider failed (a keyless FDC skip is
  // not an attempt — OFF alone decides in that case).
  const attempted: Array<unknown[] | null> = fdcKey ? [fdc, off] : [off];
  if (attempted.every(leg => leg === null)) {
    return NextResponse.json({ results: [], unavailable: true });
  }

  const results = mergeAndRank(
    (fdc || []).map(normalizeFdcFood).filter(Boolean),
    (off || []).map(normalizeOffProduct).filter(Boolean),
    q,
  );
  return NextResponse.json({ results });
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` → clean. `next build` is CI's job (local build gate is broken on this machine per memory); parse sanity is covered by tsc.

- [ ] **Step 3: Commit**

`git add src/app/api/nutrition/food-search/route.ts && git commit -m "feat(nutrition): GET /api/nutrition/food-search — auth-first hybrid FDC+OFF fan-out"`

---

### Task 3: Client — `ShapeFoodSearch` bridge + the add-food sheet goes live + real recents

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (new `window.ShapeFoodSearch`, near the other window bridges)
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` (`BSLogMealFlow` + two module-level recents helpers)

**Interfaces:**
- Consumes: Task 2's endpoint; `sessionsAuthHeaders()` + `apiBaseUrl` (existing in shapeBackend); `window.shapeDb.getUserGoals/saveUserGoals` (existing); `bsIngId()`, `setIngs`, `setEditIng` (existing in `BSLogMealFlow`).
- Produces: `window.ShapeFoodSearch.search(q, { signal }) -> Promise<{results, unavailable?}>` (THROWS on failure — the sheet needs the honest error state, unlike `getJsonOrDefault`'s silent fallback).

- [ ] **Step 1: shapeBackend bridge** (place after the `ShapeScoreRecord` block)

```js
// Real food search (meal logger add sheet). Plain authed fetch — NO shared
// cache (queries are too varied to benefit); THROWS on failure so the sheet
// can show the honest can't-reach state instead of a silent empty list.
async function searchFoods(q, { signal } = {}) {
  const query = String(q || '').trim();
  if (query.length < 2) return { results: [] };
  const res = await fetch(`${apiBaseUrl || ''}/api/nutrition/food-search?q=${encodeURIComponent(query)}`, {
    headers: sessionsAuthHeaders(), credentials: 'same-origin', cache: 'no-store', signal,
  });
  if (!res.ok) throw new Error('food_search_failed');
  return await res.json();
}
window.ShapeFoodSearch = { search: searchFoods };
```

- [ ] **Step 2: Module-level recents helpers** (in `iosAppBroadsheetClient.jsx`, above `BSLogMealFlow`)

```js
// Real food recents — user_goals('food_recents'), cap 20, most-recent-first,
// deduped by name. Best-effort: a failed write never blocks the add.
async function bsLoadFoodRecents() {
  try {
    const doc = await window.shapeDb?.getUserGoals?.('food_recents');
    const items = doc && Array.isArray(doc.items) ? doc.items : [];
    return items.filter(x => x && x.name).slice(0, 20);
  } catch (e) { return []; }
}
function bsPushFoodRecent(items, f) {
  const key = String(f.name || '').trim().toLowerCase();
  const rest = (Array.isArray(items) ? items : []).filter(x => String(x?.name || '').trim().toLowerCase() !== key);
  return [{ name: f.name, qty: f.qty || '1 serving', kcal: Math.round(Number(f.kcal) || 0), p: Math.round(Number(f.p) || 0), c: Math.round(Number(f.c) || 0), f: Math.round(Number(f.f) || 0) }, ...rest].slice(0, 20);
}
```

- [ ] **Step 3: `BSLogMealFlow` state + effects** (next to the existing `foodQuery` state)

```js
const [foodResults, setFoodResults] = useStateBSC(null);   // null = idle (no query yet)
const [foodStatus, setFoodStatus] = useStateBSC('idle');   // idle | searching | done | error
const [foodRecents, setFoodRecents] = useStateBSC(null);   // null until loaded

// Load real recents once per sheet open (signed-in only).
React.useEffect(() => {
  if (!signedIn || !showAddFood || foodRecents !== null) return;
  let on = true;
  bsLoadFoodRecents().then(items => { if (on) setFoodRecents(items); });
  return () => { on = false; };
}, [signedIn, showAddFood]);

// Debounced (350 ms), aborted, min-2-chars live search.
React.useEffect(() => {
  if (!signedIn || !showAddFood) return;
  const q = foodQuery.trim();
  if (q.length < 2) { setFoodResults(null); setFoodStatus('idle'); return; }
  const ctl = new AbortController();
  const timer = setTimeout(() => {
    setFoodStatus('searching');
    window.ShapeFoodSearch?.search(q, { signal: ctl.signal })
      .then(data => { if (ctl.signal.aborted) return; setFoodResults(Array.isArray(data.results) ? data.results : []); setFoodStatus(data.unavailable ? 'error' : 'done'); })
      .catch(() => { if (ctl.signal.aborted) return; setFoodResults([]); setFoodStatus('error'); });
  }, 350);
  return () => { clearTimeout(timer); ctl.abort(); };
}, [foodQuery, signedIn, showAddFood]);
```

- [ ] **Step 4: The sheet's signed-in branch** — replace the "Food search is coming" line with the live UI (the signed-out demo block stays byte-identical):

```jsx
{signedIn ? (() => {
  const q = foodQuery.trim();
  const searching = q.length >= 2;
  const liveRows = searching ? (foodResults || []) : (foodRecents || []);
  const statusLine = foodStatus === 'searching' ? 'Searching…'
    : foodStatus === 'error' ? 'Can’t reach the food database — enter manually below'
    : searching ? `${liveRows.length} result${liveRows.length === 1 ? '' : 's'}`
    : (foodRecents === null ? 'Recents' : (liveRows.length ? 'Recents' : 'No recents yet — search or enter manually'));
  const addLiveFood = (f) => {
    setIngs(arr => [...arr, { id: bsIngId(), name: f.name, qty: f.qty || '1 serving', kcal: Math.round(Number(f.kcal) || 0), p: Math.round(Number(f.p) || 0), c: Math.round(Number(f.c) || 0), f: Math.round(Number(f.f) || 0), on: true }]);
    window.__bsToast?.(`Added ${f.name}`, 'ok');
    setShowAddFood(false);
    const next = bsPushFoodRecent(foodRecents, f);
    setFoodRecents(next);
    try { window.shapeDb?.saveUserGoals?.('food_recents', { items: next }); } catch (e) {}
  };
  const editLiveFood = (f) => {
    setShowAddFood(false);
    setEditIng({ index: null, name: f.name, qty: f.qty || '', kcal: String(Math.round(Number(f.kcal) || 0)), p: String(Math.round(Number(f.p) || 0)), c: String(Math.round(Number(f.c) || 0)), f: String(Math.round(Number(f.f) || 0)) });
  };
  return (
    <>
      <input autoFocus value={foodQuery} onChange={(e) => setFoodQuery(e.target.value)} placeholder="Search foods & brands…" style={{ /* same style as the demo input */ }} />
      <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: foodStatus === 'error' ? t.RUST : t.INK50 }}>{statusLine}</div>
      <div style={{ marginTop: 2 }}>
        {liveRows.map((r, i) => (
          <div key={r.id || `${r.name}-${i}`} style={{ /* same row style */ }}>
            <button onClick={() => editLiveFood(r)} style={{ flex: 1, minWidth: 0, minHeight: 44, textAlign: 'left', background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}>
              <div style={{ /* name style */ }}>{r.name}</div>
              <div style={{ /* sub style */ }}>{r.brand ? `${r.brand} · ` : ''}{r.qty} · {r.kcal} kcal · {r.p}P</div>
            </button>
            <button onClick={() => addLiveFood(r)} aria-label={`Add ${r.name}`} style={{ /* same ＋ style */ }}>＋</button>
          </div>
        ))}
        {searching && foodStatus === 'done' && liveRows.length === 0 && <div style={{ /* same empty style */ }}>No matches for “{q}”.</div>}
      </div>
    </>
  );
})() : ( /* existing demo block, unchanged */ )}
```

- [ ] **Step 5: Verify + commit**

JSX parse-check the client file; `npm test`; PowerShell `VITE_BASE=/m/` build exit 0 (or CI as gate); LF check on both touched files. Commit: `feat(nutrition): add-food sheet goes live — real search + recents for signed-in members`.

---

### Task 4: War Room registration + final verification

**Files:**
- Modify: `src/lib/warroom.ts`

- [ ] **Step 1:** Add `['/api/nutrition/food-search', 'GET']` to `RAW_ROUTES` next to the other `/api/nutrition` rows; in the meal-logger/nutrition checklist section add a `done` item ("Real food-database search — hybrid FDC + OFF …") and a `manual` item ("OWNER: create the free FDC_API_KEY (fdc.nal.usda.gov) → Vercel env; route runs OFF-only until then").
- [ ] **Step 2:** Full gate: `npx tsc --noEmit` · `npm test` · JSX parse ×(client) · `node --check` shapeBackend · mobile build · LF on every touched file.
- [ ] **Step 3:** Commit `chore(warroom): register /api/nutrition/food-search + FDC key owner action`, push, open the PR (against main), run the review flow (CI green + CodeRabbit addressed + threads resolved) → squash-merge. WORKLOG entry ships as its own docs PR after.

## Self-Review

- Spec coverage: §1 module+tests (T1), §2 route incl. auth-first/timeouts/degrade/keyless-skip/War-Room (T2+T4), §3 sheet UI/debounce/abort/＋-vs-tap/recents/signed-out-identical (T3), §4 honesty (kcal-drop T1, integers T1/T3, failure copy + manual floor T3). Out-of-scope items untouched.
- No placeholders beyond deliberate "same style as demo" references — the implementer copies the adjacent literal styles in-file (they are 4 lines above in the same diff).
- Types consistent: row shape produced in T1 = consumed in T2 (`mergeAndRank` output serialized as-is) = consumed in T3 (`name/brand/qty/kcal/p/c/f`).
