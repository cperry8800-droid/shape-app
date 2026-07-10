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

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

// null = the leg was attempted and FAILED; [] = clean empty result.
async function searchFdc(q: string, key: string): Promise<unknown[] | null> {
  try {
    const res = await timedFetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Foundation + SR Legacy = generic/whole foods — FDC's strength in the hybrid.
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

export type FoodSearchResult = { results: unknown[]; unavailable?: boolean };

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
