// Real food-database search — hybrid USDA FoodData Central + Open Food Facts.
// GET /api/nutrition/food-search?q=<text> → { results } | { results: [], unavailable: true }
//
// Lives under /api/nutrition (membership proxy gate) — but the proxy
// deliberately fails open on faults, so like every sibling route this does
// its OWN auth: currentUser(request) (cookie or Bearer) is required BEFORE
// any provider fetch. An unauthenticated request 401s and never fans out
// (no provider-quota burn during a limiter fault).
//
// The provider fan-out lives in @/lib/food-search-server — ONE implementation
// shared with Nora's find_food tool (spec #1652). This route owns only auth +
// query parsing.

import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/request-auth';
import { searchFoodsServer, lookupBarcodeServer } from '@/lib/food-search-server';
import { bsValidBarcode } from '../../../../../mobile-app/src/services/foodSearch.mjs';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const params = new URL(request.url).searchParams;

  // Barcode lookup (the v2 scanner) — single OFF product read by GTIN.
  const rawCode = (params.get('barcode') || '').trim();
  if (rawCode) {
    const code = bsValidBarcode(rawCode.slice(0, 32));
    if (!code) return NextResponse.json({ error: 'Invalid barcode.' }, { status: 400 });
    return NextResponse.json(await lookupBarcodeServer(code));
  }

  const q = (params.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ results: [] });

  return NextResponse.json(await searchFoodsServer(q));
}
