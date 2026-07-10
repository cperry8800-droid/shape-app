// The hybrid food-search fan-out (USDA FDC + Open Food Facts) — ONE
// implementation shared by GET /api/nutrition/food-search AND Nora's find_food
// tool (spec #1652). Moved verbatim from the route (#1648): parallel legs with
// a ~2.5 s per-leg timeout, either failing degrades to the other, both
// ATTEMPTED legs down → unavailable: true, keyless FDC = a quiet skip
// (OFF-only). Pure normalize/merge/rank imported from the unit-tested mobile
// module (the workoutShare one-implementation pattern).

import { normalizeFdcFood, normalizeOffProduct, mergeAndRank } from '../../mobile-app/src/services/foodSearch.mjs';

const PROVIDER_TIMEOUT_MS = 2500;
// OFF policy asks API consumers to identify themselves.
const OFF_USER_AGENT = 'Shape/1.0 (privacy@theshapecommunity.com)';

// One timer covers the WHOLE leg — headers AND body. fetch() resolves when
// headers arrive, so clearing the timer before res.json() would let a stalling
// provider hold the request open past the advertised per-leg limit; aborting
// the signal also rejects an in-flight body read. null = attempted and FAILED.
// `on404` distinguishes a clean provider "no such record" (the barcode lookup's
// unknown code) from an outage — undefined keeps 404 = failed (search legs).
async function timedJson(url: string, init: RequestInit, on404?: unknown): Promise<unknown | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) return res.status === 404 && on404 !== undefined ? on404 : null;
    return await res.json(); // still under the timer — a stalled body aborts
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// null = the leg was attempted and FAILED; [] = clean empty result.
async function searchFdc(q: string, key: string): Promise<unknown[] | null> {
  const data = (await timedJson(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Foundation + SR Legacy = generic/whole foods — FDC's strength in the hybrid.
    body: JSON.stringify({ query: q, dataType: ['Foundation', 'SR Legacy'], pageSize: 15 }),
  })) as { foods?: unknown[] } | null;
  if (data == null) return null;
  return Array.isArray(data.foods) ? data.foods : [];
}

async function searchOff(q: string): Promise<unknown[] | null> {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', q);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '15');
  url.searchParams.set('fields', 'code,product_name,brands,serving_size,serving_quantity,nutriments');
  const data = (await timedJson(url.toString(), { headers: { 'user-agent': OFF_USER_AGENT } })) as { products?: unknown[] } | null;
  if (data == null) return null;
  return Array.isArray(data.products) ? data.products : [];
}

export type FoodSearchResult = { results: unknown[]; unavailable?: boolean; notFound?: boolean };

// Barcode → ONE product via the OFF v2 product endpoint (OFF rows already
// carry the code; FDC has no barcode index, so this is single-leg).
// Distinguishes honestly: a row · notFound (real answer: no such product /
// no usable macros) · unavailable (the provider couldn't be reached).
const BARCODE_NOT_FOUND = { status: 0 } as const;
export async function lookupBarcodeServer(code: string): Promise<FoodSearchResult> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,brands,serving_size,serving_quantity,nutriments`;
  const data = (await timedJson(url, { headers: { 'user-agent': OFF_USER_AGENT } }, BARCODE_NOT_FOUND)) as
    | { status?: number; product?: unknown }
    | null;
  if (data == null) return { results: [], unavailable: true };
  // OFF signals a missing code as HTTP 404 or a 200 with status 0/no product.
  const row = data.status !== 0 && data.product ? normalizeOffProduct(data.product) : null;
  // A product with no stateable kcal normalizes to null — that is a NOT-FOUND
  // for the logger (honest-data: never a fabricated 0-kcal row), not an outage.
  return row ? { results: [row] } : { results: [], notFound: true };
}

export async function searchFoodsServer(q: string): Promise<FoodSearchResult> {
  const fdcKey = process.env.FDC_API_KEY || '';
  const [fdc, off] = await Promise.all([
    fdcKey ? searchFdc(q, fdcKey) : Promise.resolve<unknown[]>([]),
    searchOff(q),
  ]);

  // "Unavailable" = every ATTEMPTED provider failed. A keyless FDC skip is
  // not an attempt — OFF alone decides in that case.
  const attempted: Array<unknown[] | null> = fdcKey ? [fdc, off] : [off];
  if (attempted.every((leg) => leg === null)) {
    return { results: [], unavailable: true };
  }

  const results = mergeAndRank(
    (fdc || []).map(normalizeFdcFood).filter(Boolean),
    (off || []).map(normalizeOffProduct).filter(Boolean),
    q,
  );
  return { results };
}
