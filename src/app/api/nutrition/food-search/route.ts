// Real food-database search — hybrid USDA FoodData Central + Open Food Facts.
// GET /api/nutrition/food-search?q=<text> → { results } | { results: [], unavailable: true }
//
// Lives under /api/nutrition (membership proxy gate) — but the proxy
// deliberately fails open on faults, so like every sibling route this does
// its OWN auth: currentUser(request) (cookie or Bearer) is required BEFORE
// any provider fetch. An unauthenticated request 401s and never fans out
// (no provider-quota burn during a limiter fault).
//
// Providers run in parallel with a ~2.5 s per-leg timeout; either failing
// degrades to the other's results; both down → unavailable: true (the sheet
// shows the honest can't-reach state, never an error page). No FDC_API_KEY →
// the FDC leg is quietly skipped (OFF-only) — the feature works before the
// owner creates the key and gets better after. Pure normalize/merge/rank is
// imported from the unit-tested mobile module (the workoutShare
// one-implementation pattern — tests/food-search.test.mjs).

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';
import { normalizeFdcFood, normalizeOffProduct, mergeAndRank } from '../../../../../mobile-app/src/services/foodSearch.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  // "Unavailable" = every ATTEMPTED provider failed. A keyless FDC skip is
  // not an attempt — OFF alone decides in that case.
  const attempted: Array<unknown[] | null> = fdcKey ? [fdc, off] : [off];
  if (attempted.every((leg) => leg === null)) {
    return NextResponse.json({ results: [], unavailable: true });
  }

  const results = mergeAndRank(
    (fdc || []).map(normalizeFdcFood).filter(Boolean),
    (off || []).map(normalizeOffProduct).filter(Boolean),
    q,
  );
  return NextResponse.json({ results });
}
