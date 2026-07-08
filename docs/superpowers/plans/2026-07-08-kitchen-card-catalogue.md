# Kitchen Card & Catalogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the "Kitchen Card & Catalogue" wave per `docs/superpowers/specs/2026-07-08-kitchen-card-catalogue-design.md` — restructure/expand/detail the recipe catalog, rebuild the recipe surfaces on one shared `BSKitchenCard`, rebuild the Library as the Catalogue, and port the catalog content to the website.

**Architecture:** Data first (the catalog restructure gates everything), then one shared card component consumed by both recipe renderers, then per-surface rebuilds. Mobile work in `mobile-app/src/broadsheet/` (`shapeKitchenData.js` + `iosAppBroadsheetClient.jsx`); website port in `public/newdesign/recipes.jsx` (content only). Three PRs from branch `claude/kitchen-card-catalogue`: **PR A** = Tasks 1–7, **PR B** = Tasks 8–10, **PR C** = Tasks 11–12.

**Tech Stack:** React JSX inline styles + `useBS()` tokens; node:test for the data test. No new deps, no TS changes, no migration.

## Global Constraints

- **Theme tokens only** in JSX (`t.INK/RULE/HAIR/ACCENT/INK50/INK70/GREEN/RUST/AMBER/BLUE/PAPER/PAPER2`); role gold literal `#a07a2e` (`#8f6d24` light-text tint via existing usage); `BS_LIB_KINDS` keeps fixed hex literals per its existing pattern — grocery `#8a5cf6` → `#3b74b8`.
- **The card is bounded**: header/title/byline/register/figure/ingredients/note ONLY. Directions never render inside the card.
- **Photo honesty**: the figure renders ONLY when `recipe.photo` is truthy; `hero` gradients never render as photos.
- **No behavior change** except two marked improvements: (a) `BSRecipePreview`'s save button currently only flips LOCAL state — wire it to `bsLibToggle` (real save); (b) the macro-split bar is dropped from both recipe pages (the card's register carries macros; the bar isn't in the approved mock).
- **≥44px targets**, `type="button"` on every new button, states never color-only.
- **Verify per task** (repo root): `node -e "require('@babel/parser').parse(require('fs').readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"` (only when that file changed) · `cd mobile-app && VITE_BASE=/m/ npm run build` (exit 0) · `cd .. && npm test` (497 + new data test) · **LF normalize every edited file** (`sed -i 's/\r$//' <file>`) before commit. Do NOT touch `public/m`.
- Line numbers are as of `84544e11` — re-locate by quoted code after shifts.

---

### Task 1: The catalog data-integrity test (fails first)

**Files:**
- Create: `tests/shape-kitchen-data.test.mjs`
- Modify: `package.json` (root) — add the file to the `test` script's file list, matching how existing test files are registered.

**Interfaces:**
- Consumes: `SHAPE_KITCHEN_RECIPES` from `mobile-app/src/broadsheet/shapeKitchenData.js`.
- Produces: the mechanical bar Task 2's content must clear.

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHAPE_KITCHEN_RECIPES } from '../mobile-app/src/broadsheet/shapeKitchenData.js';

const QTY_RE = /\d|pinch|drizzle|handful|to taste|dash|splash|zest|juice of/i;

test('catalog: expanded to the full 35 recipes', () => {
  assert.ok(SHAPE_KITCHEN_RECIPES.length >= 35, `have ${SHAPE_KITCHEN_RECIPES.length}`);
});

test('catalog: every recipe has the required fields', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    for (const f of ['title', 'by', 'byRole', 'diet', 'time', 'servings', 'kcal', 'macros', 'tags', 'hero', 'blurb', 'ingredients', 'steps', 'tip']) {
      assert.ok(r[f] != null && r[f] !== '', `${r.title || '?'} missing ${f}`);
    }
    assert.ok(Number.isFinite(r.macros.p) && Number.isFinite(r.macros.c) && Number.isFinite(r.macros.f), `${r.title} macros`);
  }
});

test('catalog: ingredients are structured {n, m} with a real quantity on every line', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    assert.ok(Array.isArray(r.ingredients) && r.ingredients.length >= 4, `${r.title} needs >=4 ingredients`);
    for (const ing of r.ingredients) {
      assert.equal(typeof ing, 'object', `${r.title}: string ingredient "${ing}"`);
      assert.ok(ing.m && String(ing.m).trim(), `${r.title}: ingredient missing name`);
      assert.ok(ing.n && QTY_RE.test(String(ing.n)), `${r.title}: "${ing.m}" missing a real quantity ("${ing.n}")`);
      assert.ok(!/,/.test(String(ing.m)) || String(ing.m).length < 40, `${r.title}: "${ing.m}" looks like a catch-all line`);
    }
  }
});

test('catalog: steps are detailed (>=4 steps, each >=50 chars, cue-rich)', () => {
  const TIME = /(min|minute|second|hour|overnight)/i;
  const HEAT = /heat|warm|boil|simmer|fry|roast|bake|sear|grill|toast|cook|steam|chill|freeze/i;
  const VESSEL = /pan|pot|skillet|bowl|tray|sheet|dish|oven|blender|jar|container|board|plate|fridge/i;
  const DONE = /golden|tender|crisp|browned|set|thicken|soft|fragrant|firm|combine|smooth|coat/i;
  for (const r of SHAPE_KITCHEN_RECIPES) {
    assert.ok(r.steps.length >= 4, `${r.title}: only ${r.steps.length} steps`);
    for (const s of r.steps) assert.ok(s.length >= 50, `${r.title}: thin step "${s.slice(0, 40)}…"`);
    const joined = r.steps.join(' ');
    assert.ok(TIME.test(joined), `${r.title}: no time cue in steps`);
    // Require >=2 cue families so a no-cook recipe still passes on time + vessel/doneness.
    const families = [TIME, HEAT, VESSEL, DONE].filter((re) => re.test(joined)).length;
    assert.ok(families >= 2, `${r.title}: steps need >=2 cue families, has ${families}`);
  }
});

test('catalog: kcal is macro-consistent within ±15%', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    const est = r.macros.p * 4 + r.macros.c * 4 + r.macros.f * 9;
    const drift = Math.abs(est - r.kcal) / r.kcal;
    assert.ok(drift <= 0.15, `${r.title}: kcal ${r.kcal} vs macro estimate ${est} (${Math.round(drift * 100)}%)`);
  }
});

test('catalog: photo, when present, is a real path (never the hero gradient)', () => {
  for (const r of SHAPE_KITCHEN_RECIPES) {
    if (r.photo != null) assert.ok(/^\/|^https?:/.test(r.photo) && !/gradient/.test(r.photo), `${r.title}: photo "${r.photo}"`);
  }
});
```

- [ ] **Step 2: Register the test file** — open root `package.json`, find the `test` script (a list of `node --test` file args; match the existing pattern exactly) and append `tests/shape-kitchen-data.test.mjs`.

- [ ] **Step 3: Run to verify it FAILS** — `npm test` → the new file fails on `expanded to at least 34` and `structured {n, m}` (26 recipes, string ingredients). The 497 existing tests still pass.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' tests/shape-kitchen-data.test.mjs package.json
git add tests/shape-kitchen-data.test.mjs package.json
git commit -m "test(kitchen): catalog data-integrity bar — structure, detail, macro math (red)"
```

---

### Task 2: Restructure + detail-pass + expand the catalog (turns Task 1 green)

**Files:**
- Modify: `mobile-app/src/broadsheet/shapeKitchenData.js` (whole dataset)
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `addSKRecipeToGrocery` (~6277) + a temporary compat render in `BSShapeKitchenRecipe` (~5261)

**Interfaces:**
- Produces: `SHAPE_KITCHEN_RECIPES` where `ingredients: { n: string, m: string, k?: string }[]` (quantity · name · optional kcal e.g. `'900 kcal'`), optional `photo?: string`, `time` may read `'15 min prep · 25 min cook'`. All other fields keep their names/types. Later tasks rely on exactly this shape.

- [ ] **Step 1: Restructure the 26 existing recipes.** Every `ingredients` entry becomes `{ n, m, k? }`; split catch-alls into per-item lines with real quantities. Example — the first recipe's ingredients become:

```js
    ingredients: [
      { n: '6 oz', m: 'chicken thigh, bone-in' },
      { n: '3/4 cup', m: 'jasmine rice' },
      { n: '1 cup', m: 'low-sodium chicken broth' },
      { n: '2 cloves', m: 'garlic, minced' },
      { n: '1 tsp', m: 'smoked paprika' },
      { n: '1/2 tsp', m: 'fine salt' },
      { n: '1/2 cup', m: 'frozen peas' },
    ],
```

- [ ] **Step 2: Detail pass on all 26** (the spec §7.3 bar): every cooking step carries heat level, vessel, time AND a sensory doneness cue; `time` becomes `'X min prep · Y min cook'` where they differ; each `tip` is copyedited to the typed-note voice (imperative, one thought) and gains a storage/meal-prep sentence where the recipe batches; macro math corrected to within ±15% (adjust macros, not kcal, unless kcal is clearly wrong).

- [ ] **Step 3: Write the 9 new recipes** to the same bar (structured ingredients, ≥4 cue-rich steps, tip + storage note, tags, honest macros, gradient `hero`, existing author roster). The nine, filling the spec's coverage gaps:

1. *Chickpea & spinach curry* — Vegan · batch ×4 · Mara Whitfield
2. *Crispy tofu grain bowl* — Vegan · Tom Okafor
3. *Overnight oats, three ways* — Vegetarian · no-cook breakfast · Mara Whitfield
4. *Sheet-pan salmon & greens* — Seafood · Rae Lindqvist
5. *Garlic shrimp & courgette noodles* — Seafood · low-carb · Tom Okafor
6. *Cottage-cheese protein toast* — Vegetarian · snack · Rae Lindqvist
7. *Date & almond energy bites* — Plant-based · no-cook snack · batch · Mara Whitfield
8. *Turkey chili verde* — Poultry · batch ×4 · Tom Okafor
9. *Lemon-herb chicken meal-prep box* — Poultry · batch ×4 · Rae Lindqvist

- [ ] **Step 4: Fix the structured-ingredient consumers.** In `addSKRecipeToGrocery` (~6277) replace the string-parse mapping:

```js
    const items = (recipe.ingredients || []).map((ing, idx) => {
      // Structured {n: qty, m: name} since the Kitchen Card wave; tolerate
      // legacy strings defensively via the old parser.
      const p = typeof ing === 'string' ? bsSkParseIngredient(ing) : { n: ing.m, q: ing.n };
      return { id: `${id}-${idx}`, n: p.n, q: p.q, meals: recipe.title };
    });
```

In `BSShapeKitchenRecipe` (~5264) make the ingredient row render the structured shape (temporary compat — Task 4 replaces this whole page):

```jsx
              <span style={{ fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK }}>{typeof ing === 'string' ? (t.isMetric ? ing : bsHouseholdStr(ing)) : `${t.isMetric ? ing.n : bsHouseholdQty(ing.n, ing.m)} ${ing.m}`}</span>
```

(Verify `bsHouseholdQty(qty, name)`'s exact signature at the definition before using; adjust if it differs.)

- [ ] **Step 5: Verify** — `npm test`: the Task 1 file is fully GREEN + 497 pass. Parse-check + mobile build green.

- [ ] **Step 6: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/shapeKitchenData.js mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/shapeKitchenData.js mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(kitchen): catalog restructured {n,m,k} + cookable detail pass + 9 new recipes (35 total)"
```

---

### Task 3: `BSKitchenCard` — the shared card component

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — insert above `function BSRecipePreview` (~4718)

**Interfaces:**
- Produces: `BSKitchenCard({ recipe, no, dayLabel })` — normalizes BOTH recipe shapes internally: catalog (`kcal, macros:{p,c,f}, time, servings, by, byRole, blurb, tip, ingredients:{n,m,k}[], photo?`) and day-view (`kcal, p, c, f, prep, portion, coachNote, hero (text), ingredients:{n,m,k}[], photo?`). Renders ONLY the bounded card (no directions, no CTAs).

- [ ] **Step 1: Insert the component**

```jsx
// The Kitchen Card — B+C combo from the 2026-07-08 concept round: a typed
// index card (double-ruled frame) carrying the clipping anatomy. BOUNDED by
// design: header · title · byline · register · figure · ingredients · note.
// Directions/CTAs live on the page, never inside. Shared by the Shape
// Kitchen detail and the Eat-day recipe preview.
function BSKitchenCard({ recipe, no, dayLabel }) {
  const t = useBS();
  const r = recipe || {};
  // Normalize the two recipe shapes (catalog vs day-view).
  const macros = r.macros || { p: r.p, c: r.c, f: r.f };
  const by = r.by || null;
  const byRole = r.byRole || (r.coachNote ? 'Nutritionist' : null);
  const note = r.tip || r.coachNote || null;
  const noteName = (by || 'Coach').split(' ')[0].toUpperCase();
  const timeLabel = r.time || r.prep || '—';
  const servesLabel = r.servings != null ? String(r.servings) : (r.portion || '—');
  const ings = Array.isArray(r.ingredients) ? r.ingredients : [];
  const half = Math.ceil(ings.length / 2);
  const cols = [ings.slice(0, half), ings.slice(half)];
  const qty = (ing) => {
    const q = t.isMetric ? ing.n : bsHouseholdQty(ing.n, ing.m);
    const kc = ing.k ? String(ing.k).replace(/\s*kcal$/i, '') : null;
    return kc ? `${q} · ${kc}` : q;
  };
  const gold = '#a07a2e';
  const Dateline = ({ children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
      <span aria-hidden style={{ flex: 1, height: 1, background: t.HAIR }} />
      <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap' }}>{children}</span>
      <span aria-hidden style={{ flex: 1, height: 1, background: t.HAIR }} />
    </div>
  );
  return (
    <div style={{ margin: `14px ${t.padX}px 0`, border: `1px solid ${t.RULE}`, background: t.PAPER, padding: '16px 16px 18px', position: 'relative' }}>
      <div aria-hidden style={{ position: 'absolute', top: 7, left: 7, right: 7, bottom: 7, border: `1px solid ${t.HAIR}`, pointerEvents: 'none' }} />
      <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase', textAlign: 'center' }}>
        Shape Kitchen · {no != null ? `Recipe Nº ${no}` : (dayLabel || 'Recipe')}
      </div>
      <div style={{ marginTop: 8, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 23, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05, color: t.INK }}>
        {String(r.title || '').replace(/\.$/, '')}<span style={{ color: t.ACCENT }}>.</span>
      </div>
      {by ? (
        <div style={{ marginTop: 6, textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: gold }}>
          From the kitchen of {by}{byRole ? ` · ${byRole}` : ''}
        </div>
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 14 }}>
        {[
          ['Kcal', r.kcal != null ? String(r.kcal) : '—', null],
          ['Macros', macros.p != null ? `${macros.p}P` : '—', macros.c != null ? `${macros.c}C · ${macros.f}F` : null],
          ['Time', timeLabel, null],
          ['Serves', servesLabel, null],
        ].map(([l, v, s]) => (
          <div key={l}>
            <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.14em', fontWeight: 800, textTransform: 'uppercase', color: t.INK50 }}>{l}</div>
            <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            {s ? <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8, color: t.INK50 }}>{s}</div> : null}
          </div>
        ))}
      </div>
      {r.photo ? (
        <div style={{ marginTop: 14 }}>
          <img src={r.photo} alt={`Photograph of ${r.title}`} style={{ display: 'block', width: '100%', height: 150, objectFit: 'cover', border: `1px solid ${t.HAIR}` }} />
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', gap: 10, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
            <span>The plate</span>
            {no != null ? <span>Fig. {no}</span> : null}
          </div>
        </div>
      ) : null}
      <Dateline>The ingredients</Dateline>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16, marginTop: 2 }}>
        {cols.map((col, ci) => (
          <div key={ci}>
            {col.map((ing, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '9px 2px 3px', borderBottom: `1px solid ${bsTHexA(t.ACCENT, 0.3)}` }}>
                <span style={{ fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK, minWidth: 0 }}>{ing.m}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{qty(ing)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      {note ? (
        <div style={{ marginTop: 12, fontFamily: t.MONO, fontSize: 10.5, lineHeight: 1.6, color: t.INK70 }}>
          <b style={{ color: gold, fontWeight: 800 }}>{noteName}:</b> {note}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify** — parse-check + mobile build + tests (component unused yet — still must compile).

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "feat(kitchen): BSKitchenCard — the shared bounded recipe card (B+C combo)"
```

---

### Task 4: Recipe detail (`BSShapeKitchenRecipe`) — the card + the article

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:5189-5324` (the whole page body; keep the reviews state/fetch/submit logic verbatim)

**Interfaces:**
- Consumes: `BSKitchenCard` (Task 3), catalog `no` = `SHAPE_KITCHEN_RECIPES.indexOf(recipe) + 1` (0 → `null`).

- [ ] **Step 1: Rebuild the page render.** Keep lines 5190–5218 (state + reviews fetch/submit + `slug`/`avg`) untouched. Compute the Nº right after `const slug = ...`:

```jsx
  const _no = (() => { const i = SHAPE_KITCHEN_RECIPES.indexOf(recipe); return i >= 0 ? i + 1 : null; })();
```

Replace the whole `return (...)` with:

```jsx
  return (
    <BSPage>
      <BSDetailHeader onBack={onBack} eyebrow={`${r.byRole} · ${r.by}`} kicker="Shape Kitchen" title={r.title} />

      <BSKitchenCard recipe={r} no={_no} />

      {r.blurb && (
        <div style={{ margin: `16px ${t.padX}px 0`, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14, color: t.INK70, lineHeight: 1.5, textAlign: 'center' }}>
          &ldquo;{r.blurb}&rdquo;
        </div>
      )}

      {/* The directions — OUTSIDE the card (owner call): lettered serif steps. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: `18px ${t.padX}px 0` }}>
        <span aria-hidden style={{ flex: 1, height: 1.5, background: t.RULE }} />
        <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>The method</span>
        <span aria-hidden style={{ flex: 1, height: 1.5, background: t.RULE }} />
      </div>
      <div style={{ padding: `2px ${t.padX}px 0` }}>
        {r.steps.map((s, i) => (
          <p key={i} style={{ margin: '10px 0 0', fontFamily: t.DISPLAY, fontSize: 14.5, lineHeight: 1.55, color: t.INK }}>
            <b style={{ fontFamily: t.MONO, fontSize: 10.5, color: t.ACCENT, fontWeight: 700 }}>{String.fromCharCode(97 + i)}.</b> {s}
          </p>
        ))}
      </div>

      {/* CTAs — clipped teal primary + underline save. */}
      <div style={{ padding: `20px ${t.padX}px 0` }}>
        <button type="button" onClick={onAddGrocery} style={{ display: 'block', width: '100%', padding: 14, border: 0, background: groceryAdded ? t.GREEN : t.ACCENT, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)' }}>
          {groceryAdded ? '✓ On your grocery list' : 'Send to grocery list →'}
        </button>
        <BSSaveButton full item={{ id: `recipe:${slug}`, kind: 'recipe', title: r.title, meta: `${r.kcal} kcal · serves ${r.servings}`, coach: r.by }} />
      </div>

      {/* Reviews — press-credit rows; the form stays a quiet form. */}
      <BSSection title="Reviews" meta={reviews.length ? `${avg} ★ · ${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}` : 'Be the first'} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', color: t.INK50, textTransform: 'uppercase' }}>Your rating</span>
          {[1, 2, 3, 4, 5].map(n => (
            <button type="button" key={n} onClick={() => setFormRating(n)} aria-label={`${n} stars`} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, fontSize: 22, lineHeight: 1, color: formRating >= n ? '#f4b860' : t.INK50 }}>★</button>
          ))}
        </div>
        <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Share how it turned out, any tweaks you made…" rows={3}
          style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER2, color: t.INK, border: `1px solid ${t.RULE}`, borderRadius: t.RADIUS_SM, padding: '10px 12px', fontFamily: t.DISPLAY, fontSize: 14, resize: 'vertical', outline: 'none' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" onClick={submitReview} style={{ borderRadius: t.RADIUS_SM, padding: '10px 18px', background: formRating ? t.INK : t.SURFACE, color: formRating ? t.PAPER : t.INK50, border: 0, cursor: formRating ? 'pointer' : 'default', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Post review</button>
        </div>
        <div style={{ marginTop: 14 }}>
          {reviews.map((rv, i) => (
            <div key={rv.id} style={{ borderLeft: `3px solid ${t.HAIR}`, padding: '2px 0 2px 12px', marginTop: i === 0 ? 0 : 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#f4b860', fontSize: 13 }}>{'★★★★★'.slice(0, Math.round(rv.rating))}<span style={{ color: t.INK50 }}>{'★★★★★'.slice(0, 5 - Math.round(rv.rating))}</span></span>
                <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', color: t.INK50 }}>{(rv.author || 'You').toUpperCase()} · {new Date(rv.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
              {rv.text && <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14, color: t.INK, lineHeight: 1.5 }}>{rv.text}</div>}
            </div>
          ))}
        </div>
      </div>

      <BSFooter right="Shape Kitchen" />
    </BSPage>
  );
```

Kills: the gradient hero block + its 999-pill caption, the radius-16 stat grid / ingredients / method / review cards, the bordered Pro-tip card (its content now rides the card's typed note), the macro-split bar (marked improvement), and the `_mp/_totCal/pPct/cPct/fPct` locals (now unused — delete them).

- [ ] **Step 2: Verify** — parse-check, build, `npm test`. Confirm `_mp`-era locals are gone (`grep -n "pPct" mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` shows only `BSRecipePreview`'s + any unrelated hits).

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(kitchen): recipe detail — the Kitchen Card + the article; boxes and pill die"
```

---

### Task 5: Eat-day recipe preview (`BSRecipePreview`) — same card

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx:4718-4867` (whole component)

**Interfaces:**
- Consumes: `BSKitchenCard` (day variant: `dayLabel`, no `no`), `bsLibToggle`/`useBSLibrary` (marked improvement: real save).

- [ ] **Step 1: Rebuild the component**

```jsx
function BSRecipePreview({ recipe, dayLabel, onBack, onAddGrocery, groceryAdded = false }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const r = recipe;
  // Real library save (was a local-only visual toggle — marked improvement).
  const lib = useBSLibrary();
  const _libItem = { id: `recipe:${bsSkSlug(bsNodeText(r.title))}`, kind: 'recipe', title: bsNodeText(r.title), meta: `${r.kcal} kcal`, coach: 'Shape Kitchen' };
  const saved = lib.some(x => x.id === _libItem.id);

  return (
    <BSPage>
      <BSDetailHeader onBack={onBack} eyebrow={`Recipe of the day · ${dayLabel}`} title={r.title} />

      <BSKitchenCard recipe={r} dayLabel={dayLabel} />

      {(r.hero || r.brief) && (
        <div style={{ margin: `16px ${t.padX}px 0`, textAlign: 'center' }}>
          {r.hero ? <div style={{ fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, color: t.INK, lineHeight: 1.4 }}>{r.hero}</div> : null}
          {r.brief ? <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 13.5, color: t.INK70, lineHeight: 1.45 }}>{r.brief}</div> : null}
        </div>
      )}

      {/* The directions — outside the card. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: `18px ${t.padX}px 0` }}>
        <span aria-hidden style={{ flex: 1, height: 1.5, background: t.RULE }} />
        <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>The method</span>
        <span aria-hidden style={{ flex: 1, height: 1.5, background: t.RULE }} />
      </div>
      <div style={{ padding: `2px ${t.padX}px 0` }}>
        {(r.steps || []).map((s, i) => (
          <p key={i} style={{ margin: '10px 0 0', fontFamily: t.DISPLAY, fontSize: 14.5, lineHeight: 1.55, color: t.INK }}>
            <b style={{ fontFamily: t.MONO, fontSize: 10.5, color: t.ACCENT, fontWeight: 700 }}>{String.fromCharCode(97 + i)}.</b> {s}
          </p>
        ))}
      </div>

      <div style={{ padding: `20px ${t.padX}px 0` }}>
        <button type="button" onClick={onAddGrocery} style={{ display: 'block', width: '100%', padding: 14, border: 0, background: groceryAdded ? t.GREEN : t.ACCENT, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)' }}>
          {groceryAdded ? '✓ On your grocery list' : 'Add to grocery list →'}
        </button>
        <div style={{ display: 'flex', gap: 18, marginTop: 4 }}>
          <button type="button" onClick={onBack} style={{ minHeight: 44, padding: '10px 2px', background: 'transparent', border: 0, borderBottom: `2px solid ${bsTHexA(t.INK, 0.35)}`, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>Close</button>
          <button type="button" onClick={() => bsLibToggle(_libItem)} style={{ minHeight: 44, padding: '10px 2px', background: 'transparent', border: 0, borderBottom: `2px solid ${t.ACCENT}`, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: saved ? t.ACCENT : t.INK }}>{saved ? '✓ Saved to library' : '♡ Save recipe'}</button>
        </div>
      </div>

      <BSFooter right="Recipe" />
    </BSPage>
  );
}
```

Kills: `BSHalftone` hero (on this page), the flat 2px-ink stats/ingredients/method sections, the macro-split bar, quick-facts strip (prep/portion now ride the card's register), the solid-ink coach-note block (rides the card's typed note via `coachNote`), the bordered CTA row, and the fake local `saved` state.

- [ ] **Step 2: Verify** — parse-check, build, tests. `r.meta` and `r.accent` become unused here — confirm no dangling references in the new body.

- [ ] **Step 3: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(kitchen): day-view recipe preview joins the Kitchen Card; fake save becomes a real library save"
```

---

### Task 6: Recipes tab (`BSRecipeBox`) — the Nº card stack

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — inside `BSRecipeBox` (~5064 pre-shift): the `Chip` helper, the quick-pill row, the empty state, and the recipe list

**Interfaces:** `onOpenRecipe`, `onSendToGrocery`, `bsLibToggle`, filters/search state — all unchanged.

- [ ] **Step 1: Square the chips.** In the `Chip` helper and the quick-pill buttons and the `Filters ▾` / `Clear` buttons, change every `borderRadius: 999` → `borderRadius: 3`, and change the ACTIVE treatment from filled (`background: on ? (color || t.INK) : 'transparent'` with paper text) to quiet (`background: 'transparent'`, `border: 1px solid ${on ? (color || t.ACCENT) : t.RULE}`, `color: on ? (color || t.ACCENT) : t.INK70`). Add `type="button"` + `aria-pressed={on}` where missing.

- [ ] **Step 2: Replace the recipe list rows.** The `BSPlate` block (~5167–5180) becomes a slim framed Nº card:

```jsx
          const no = SHAPE_KITCHEN_RECIPES.indexOf(r) + 1 || null;
          return (
            <div key={`${r.title}-${i}`} style={{ border: `1px solid ${t.RULE}`, background: t.PAPER, padding: '12px 14px' }}>
              <button type="button" onClick={() => onOpenRecipe(r)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, padding: 0 }}>
                <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: dc }}>{no ? `Nº ${no} · ` : ''}{cat} · {coach}</span>
                <span style={{ display: 'block', marginTop: 5, fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{r.title}</span>
                <span style={{ display: 'block', marginTop: 5, fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.kcal} kcal · {r.macros.p}P / {r.macros.c}C / {r.macros.f}F · {r.time}</span>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
                <button type="button" onClick={() => onSendToGrocery(r)} style={{ minHeight: 44, display: 'flex', flex: 1, alignItems: 'center', gap: 8, background: 'transparent', border: 0, cursor: 'pointer', padding: '8px 0', textAlign: 'left' }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}>Send to grocery</span>
                  <span aria-hidden style={{ flex: 1, borderBottom: `1.5px dotted ${bsTHexA(t.INK, 0.22)}`, transform: 'translateY(-2px)' }} />
                  <span style={{ color: t.ACCENT, fontWeight: 700, fontSize: 12 }}>→</span>
                </button>
                <button type="button" onClick={() => bsLibToggle({ id, kind: 'recipe', title: r.title, meta: `${r.kcal} kcal · serves ${r.servings}`, coach: r.by })} style={{ minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', padding: '8px 0', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: saved ? t.ACCENT : t.INK50, whiteSpace: 'nowrap' }}>{saved ? '✓ Saved' : '♡ Save'}</button>
              </div>
            </div>
          );
```

(Keep the surrounding `list.map` locals — `dc`, `id`, `saved`, `cat`, `coach` — exactly as they are; only the returned JSX changes. The 62px `r.hero` thumb dies.)

- [ ] **Step 3: Unbox the empty state** (~5159): the radius-18 card becomes `<div style={{ padding: '20px 2px', textAlign: 'center', fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14.5, color: t.INK70 }}>…same copy…</div>`.

- [ ] **Step 4: Verify** — parse-check, build, tests. Drive later at the PR A gate.

- [ ] **Step 5: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(kitchen): Recipes tab — Nº card stack, squared chips, plates and pills die"
```

---

### Task 7: PR A gate — drive, ship, merge

- [ ] **Step 1: Browser drive** (`cd mobile-app && MSYS_NO_PATHCONV=1 VITE_BASE=/ npm run dev`, 390px): Recipes tab renders the Nº stack, filters + search work, Send-to-grocery builds + opens the list, ♡ Save toggles; recipe detail shows the card (correct Nº, byline, two-column ruled ingredients with household units on imperial, typed note) + lettered method outside + reviews; **temporarily add `photo: '/icons/icon-192.png'` to one recipe locally** to verify the figure renders + caption, then REVERT it; Eat-day → recipe preview renders the day-variant card + real save. 0px horizontal overflow.
- [ ] **Step 2: Push + PR.** **PR A** `feat(kitchen): The Kitchen Card — catalog restructure/detail/expand + recipe surfaces (spec #1625/#1626)`, base `main`, head `claude/kitchen-card-catalogue`, via the REST API.
- [ ] **Step 3: Gate.** CI green (Web · Mobile · gitleaks) AND CodeRabbit findings addressed → squash-merge → resync (`git fetch origin main && git checkout main && git merge --ff-only origin/main && git branch -f claude/kitchen-card-catalogue main && git checkout claude/kitchen-card-catalogue && git push --force-with-lease`). Keep the branch.

---

### Task 8: Library (`BSClientLibrary`) — the Catalogue

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BS_LIB_KINDS` (~1287) + `BSClientLibrary` (~1382): the stat-tile grid and the item rows

- [ ] **Step 1: Blue.** In `BS_LIB_KINDS`, `grocery: { label: 'Groceries', color: '#8a5cf6' }` → `color: '#3b74b8'`. Also the local stat-grid color list (`['grocery', 'Groceries', '#8a5cf6']` at ~1411) → `'#3b74b8'`.

- [ ] **Step 2: Stat tiles → the typographic index.** Replace the 4-up bordered-tile grid (~1410–1421) with:

```jsx
      <div style={{ padding: `16px ${t.padX}px 4px`, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[['workout', 'Workouts', t.RUST || '#c0533b'], ['meal', 'Meals', t.GREEN || '#5fae7e'], ['recipe', 'Recipes', teal], ['grocery', 'Groceries', '#3b74b8']].map(([k, label, c]) => {
          const on = filter === k;
          const count = items.filter(i => i.kind === k).length;
          return (
            <button type="button" key={k} onClick={() => setFilter(on ? 'all' : k)} aria-pressed={on} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '4px 0', minHeight: 44, textAlign: 'left' }}>
              <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 24, fontWeight: 700, color: on ? t.INK : t.INK70, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
              <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: c }}>{label}</span>
              <span aria-hidden style={{ display: 'block', marginTop: 5, width: 22, height: on ? 3 : 2, background: c }} />
            </button>
          );
        })}
      </div>
```

- [ ] **Step 3: Item rows → tick-divider rows.** Locate the saved-item row render below the search field (bordered `t.PAPER2` cards, radius ~16) and replace each row with:

```jsx
            <button type="button" key={i.id} onClick={() => setOpen(i)} style={{ width: '100%', display: 'grid', gridTemplateColumns: '8px 1fr auto', gap: 10, alignItems: 'baseline', padding: '12px 0', borderTop: idx === 0 ? 0 : `1px solid ${t.HAIR}`, background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left', minHeight: 44 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 1, alignSelf: 'center', background: (BS_LIB_KINDS[i.kind] || {}).color || t.INK50 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{i.title}</span>
                <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.04em' }}>{[(BS_LIB_KINDS[i.kind] || {}).label?.toUpperCase(), i.coach, i.meta].filter(Boolean).join(' · ')}</span>
              </span>
              <span style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, whiteSpace: 'nowrap' }}>{i.savedAt ? new Date(i.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}</span>
            </button>
```

(Adapt the exact locals — `idx`, the list variable name, the existing row's fields — to what the current code has; behavior identical: tap → detail. Kill the row cards + any per-row remove ×.)

- [ ] **Step 4: Empty state** → honest unboxed italic line, marketplace deep-link kept.

- [ ] **Step 5: Verify** — parse-check, build, tests. `grep -c '8a5cf6'` drops by 2 in this file.

- [ ] **Step 6: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(library): The Catalogue — typographic index + tick rows; tiles and purple die"
```

---

### Task 9: Saved-item detail (`BSLibraryDetail`) — unboxed

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — inside `BSLibraryDetail` (~1295): the preview card (~1336–1345) + the save/remove button (~1352–1354). The Start-this-plan CTA + sheet stay byte-identical.

- [ ] **Step 1: Preview card → kind-spine quote.** Replace the radius-18 block with:

```jsx
      <div style={{ padding: `18px ${t.padX}px 0` }}>
        <div style={{ borderLeft: `3px solid ${km.color}`, padding: '2px 0 2px 12px' }}>
          <div style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 15, color: t.INK, lineHeight: 1.5 }}>
            {item.preview || `Saved ${km.label.toLowerCase()} from your coach. Open it on its source page to start, swap, or log.`}
          </div>
        </div>
        {item.savedAt ? <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>Saved {new Date(item.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div> : null}
      </div>
```

- [ ] **Step 2: Save/remove → underline action.** Replace the bordered button with:

```jsx
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <button type="button" onClick={() => { bsLibToggle(item); onBack(); }} style={{ minHeight: 44, padding: '10px 2px', background: 'transparent', border: 0, borderBottom: `2px solid ${saved ? bsTHexA(t.INK, 0.35) : teal}`, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>{saved ? 'Remove from library' : '♡ Save to library'}</button>
      </div>
```

- [ ] **Step 3: Verify** — parse-check, build, tests.

- [ ] **Step 4: Commit**

```bash
sed -i 's/\r$//' mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx
git commit -m "style(library): saved-item detail unboxed — kind-spine quote + underline action"
```

---

### Task 10: PR B gate

- [ ] **Step 1: Browser drive**: Library index counts filter on tap (and untap), search filters, rows open the detail, save/remove round-trips, Start-this-plan sheet still opens for an owned plan item (visual check only). 0px overflow.
- [ ] **Step 2: Push + PR B** `style(library): The Catalogue (spec #1625)` → gate (CI + CodeRabbit findings addressed) → squash-merge → resync. Keep the branch.

---

### Task 11: Website content port (PR C)

**Files:**
- Modify: `public/newdesign/recipes.jsx` (the dataset only)
- Modify: `public/newdesign/Recipes.html:26` + `public/newdesign/RecipeDetail.html:26` (cache-bust)

**Interfaces:** the website renderers consume `ingredients: string[]` and `steps: string[]` — the port PRESERVES that shape.

- [ ] **Step 1: Generate the ported dataset.** Write a throwaway node script in the scratchpad (NOT the repo) that imports `mobile-app/src/broadsheet/shapeKitchenData.js` and emits the website array with identical content, converting each structured ingredient to a display string:

```js
// scratchpad/port-recipes.mjs — run: node scratchpad/port-recipes.mjs > out.txt
import { SHAPE_KITCHEN_RECIPES } from '../shape-app/mobile-app/src/broadsheet/shapeKitchenData.js';
const ser = (v) => JSON.stringify(v);
const lines = SHAPE_KITCHEN_RECIPES.map((r) => `  {
    title: ${ser(r.title)},
    by: ${ser(r.by)}, byRole: ${ser(r.byRole)}, diet: ${ser(r.diet)},
    time: ${ser(r.time)}, servings: ${ser(r.servings)}, kcal: ${ser(r.kcal)}, macros: ${ser(r.macros)},
    tags: ${ser(r.tags)},
    hero: ${ser(r.hero)},
    blurb: ${ser(r.blurb)},
    ingredients: ${ser(r.ingredients.map((i) => `${i.n} ${i.m}${i.k != null ? ` (${i.k} kcal)` : ''}`))},
    steps: ${ser(r.steps)},
    tip: ${ser(r.tip)},
  },`);
console.log(lines.join('\n'));
```

Replace the array body inside `export const`/`const … = [` in `public/newdesign/recipes.jsx` with the generated entries (keep the file's surrounding header comment + export line exactly as-is; keep any non-data code in the file untouched).

- [ ] **Step 2: Cache-bust.** In both HTML files change `src="recipes.jsx"` → `src="recipes.jsx?v=2"`.

- [ ] **Step 3: Verify** — `node -e "require('@babel/parser').parse(require('fs').readFileSync('public/newdesign/recipes.jsx','utf8'),{sourceType:'module',plugins:['jsx']})"` parses; `npx tsc --noEmit` unaffected (no TS); mobile build + tests still green (untouched). Open `Recipes.html` via the site preview at the PR gate to confirm the list renders 35 recipes and a detail page shows ingredients/steps (content-only — design identical).

- [ ] **Step 4: Commit + PR C** `content(web): recipes catalog parity — 35 detailed recipes (spec #1626)` → gate → squash-merge → resync.

```bash
sed -i 's/\r$//' public/newdesign/recipes.jsx public/newdesign/Recipes.html public/newdesign/RecipeDetail.html
git add public/newdesign/recipes.jsx public/newdesign/Recipes.html public/newdesign/RecipeDetail.html
git commit -m "content(web): recipes catalog parity — 35 detailed recipes, ?v=2 cache-bust"
```

---

### Task 12: Worklog + War Room + memory wrap

- [ ] **Step 1:** Append the dated `docs/WORKLOG.md` entry (all three PR numbers, the card composition, the content restructure/expansion, the honesty notes — conditional photo, real preview save — and the open on-device pass) + update the top pointer.
- [ ] **Step 2:** `src/lib/warroom.ts` — add to the Eat/Train (or nutrition) checklist section: the Kitchen Card wave (done) + the owner on-device pass (pending) + "recipe photography for the card figure" (pending, joins the Store-photos item).
- [ ] **Step 3:** Update the auto-memory wave file + `MEMORY.md` index line to COMPLETE.
- [ ] **Step 4:** Commit worklog+warroom, push, PR, **merge as soon as required checks are green — no CodeRabbit wait** (owner's standing rule for worklog/warroom/memory updates).
