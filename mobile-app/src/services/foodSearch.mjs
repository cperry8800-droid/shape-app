// Real food-database search — the PURE normalize / merge / rank layer for the
// hybrid USDA FoodData Central + Open Food Facts search (spec
// docs/superpowers/specs/2026-07-09-food-database-search-design.md). The
// server route (/api/nutrition/food-search) imports these directly — the
// workoutShare.mjs one-implementation pattern, so the app and the API can
// never drift. No fetch, no window, no Date. Unit vectors live in
// tests/food-search.test.mjs.
//
// A result row is the meal logger's ingredient shape plus provenance:
//   { id, source: 'fdc'|'off', name, brand, qty, kcal, p, c, f,
//     per100g: {kcal,p,c,f}|null, barcode: string|null, servings: [{label, grams}] }
// kcal/p/c/f are integers for the row's default serving. A row that cannot
// state a real kcal is dropped (honest-data — never a fabricated 0).

export const BS_FOOD_RESULT_CAP = 12;

// null/undefined/'' must stay null — Number(null) is 0, which would fabricate
// a 0-kcal row past the honest-data drop check.
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const trimNum = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

// FDC search hit (Foundation / SR Legacy): foodNutrients arrive per 100 g.
// Falls back to an honest '100 g' serving when no gram servingSize exists.
export function normalizeFdcFood(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.description || '').trim();
  if (!name) return null;
  const by = {};
  for (const n of (Array.isArray(raw.foodNutrients) ? raw.foodNutrients : [])) {
    const key = String((n && (n.nutrientNumber ?? n.nutrientId)) ?? '');
    const v = num(n && n.value);
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
// *_serving nutriments; last resort an honest 100 g row. Barcode kept for the
// v2 scanner.
export function normalizeOffProduct(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.product_name || '').trim();
  if (!name) return null;
  const n = raw.nutriments && typeof raw.nutriments === 'object' ? raw.nutriments : {};
  const per100g = {
    kcal: num(n['energy-kcal_100g']),
    p: num(n.proteins_100g),
    c: num(n.carbohydrates_100g),
    f: num(n.fat_100g),
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
  const brand = raw.brands ? (String(raw.brands).split(',')[0].trim() || null) : null;
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
  return nameKey(q).split(' ').some((tok) => tok.length >= 3 && b.includes(tok));
};

// Dedupe near-identical name+brand pairs, rank (exact > prefix > word match;
// generic FDC above branded for whole-food queries, branded lifted on
// brand-looking queries), drop kcal-less rows, cap at BS_FOOD_RESULT_CAP.
export function mergeAndRank(fdcRows, offRows, q) {
  const query = String(q || '').trim().toLowerCase();
  const rows = [...(Array.isArray(fdcRows) ? fdcRows : []), ...(Array.isArray(offRows) ? offRows : [])]
    .filter((r) => r && Number.isFinite(r.kcal));
  const brandIntent = rows.some((r) => r.source === 'off' && brandHit(query, r.brand));
  const qTokens = nameKey(query).split(' ').filter((w) => w.length >= 3);
  const score = (r) => {
    let s = 0;
    const n = r.name.toLowerCase();
    const nk = ` ${nameKey(r.name)}`;
    if (n === query) s += 200;
    if (n.startsWith(query)) s += 100;
    // FDC names are comma-inverted ('Chicken, broilers or fryers, breast…'),
    // so token coverage — every query word present — is the generic match.
    else if (qTokens.length && qTokens.every((w) => nk.includes(` ${w}`))) s += 80;
    else if (` ${n}`.includes(` ${query}`)) s += 50;
    if (brandHit(query, r.brand)) s += 60;
    s += r.source === 'fdc' ? (brandIntent ? 5 : 30) : (brandIntent ? 20 : 0);
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
    .map((x) => x.r);
}
