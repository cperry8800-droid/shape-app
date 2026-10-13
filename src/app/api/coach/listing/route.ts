// A coach's own marketplace listing: whether members can find it, what it still needs, and its
// rates. Owner, 2026-10-13: "fix all issues", among them #2318's registered "a hidden coach is
// not told on their dashboard" (only the approval email said it), and the approval email's
// "Set your prices", which pointed at nothing: no page let a coach set a rate, so a coach
// approved without one stayed out of the marketplace for good.
//
// GET  -> { listings: [{ role, id, ready, missing, monthly, oneTime }] }  (one per role held;
//         missing is null when the steps could not be read)
// POST { role: 'trainer' | 'nutritionist', monthly, oneTime? } -> { listing }
//
// Reads and writes run as the coach (RLS: a listing's own row). The rates are not admin
// columns (guard_provider_admin_columns), and listing_ready recomputes on the write.
// Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { listingMissing, parseRate } from '@/lib/listing-readiness.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Role = 'trainer' | 'nutritionist';
const TABLE: Record<Role, 'trainers' | 'nutritionists'> = { trainer: 'trainers', nutritionist: 'nutritionists' };
// The one-time price: a trainer's single session, a nutritionist's single consult (the column
// checkout reads as their rate).
const ONE_TIME: Record<Role, 'session_price' | 'meal_plan_price'> = { trainer: 'session_price', nutritionist: 'meal_plan_price' };

type Row = {
  id: number;
  price: number | string | null;
  stripe_account_status: string | null;
  listing_media: { portrait?: string | null } | null;
  listing_ready: boolean | null;
  session_price?: number | string | null;
  meal_plan_price?: number | string | null;
};

const columns = (role: Role) => `id, price, ${ONE_TIME[role]}, stripe_account_status, listing_media, listing_ready`;

// `avatar` undefined: the profile could not be read, so the steps are not known (missing: null)
// and the coach is not told to add a photo they may already have.
function describe(role: Role, row: Row, avatar: string | null | undefined) {
  const missing = avatar === undefined ? null : listingMissing({
    price: row.price,
    stripeAccountStatus: row.stripe_account_status,
    portrait: row.listing_media?.portrait ?? null,
    avatar,
  });
  const oneTime = row[ONE_TIME[role]];
  return {
    role,
    id: row.id,
    // The database's verdict is the one the marketplace filters on; `missing` says why.
    ready: row.listing_ready === true,
    missing,
    monthly: row.price == null ? null : Number(row.price),
    oneTime: oneTime == null ? null : Number(oneTime),
  };
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);
  const [profile, ...rows] = await Promise.all([
    supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle(),
    ...(['trainer', 'nutritionist'] as const).map((role) =>
      supabase.from(TABLE[role]).select(columns(role)).eq('owner_id', user.id).order('id').limit(1)
    ),
  ]);
  const failed = [profile, ...rows].find((r) => r.error);
  if (failed?.error) {
    console.error('[shape] coach listing read failed:', failed.error.message);
    return NextResponse.json({ error: 'Could not read your listing.' }, { status: 500 });
  }
  const avatar = ((profile.data ?? null) as { avatar_url?: string | null } | null)?.avatar_url ?? null;
  const listings = (['trainer', 'nutritionist'] as const).flatMap((role, i) => {
    const row = ((rows[i].data ?? []) as unknown as Row[])[0];
    return row ? [describe(role, row, avatar)] : [];
  });
  return NextResponse.json({ listings });
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = await readJson<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const role = body.role === 'trainer' || body.role === 'nutritionist' ? (body.role as Role) : null;
  if (!role) return NextResponse.json({ error: 'Say which listing: trainer or nutritionist.' }, { status: 400 });
  const monthly = parseRate(body.monthly);
  if (monthly == null) return NextResponse.json({ error: 'Enter your monthly rate in dollars, for example 120.' }, { status: 400 });
  const oneTimeGiven = body.oneTime != null && String(body.oneTime).trim() !== '';
  const oneTime = oneTimeGiven ? parseRate(body.oneTime) : null;
  if (oneTimeGiven && oneTime == null) {
    return NextResponse.json({ error: `Enter your single ${role === 'trainer' ? 'session' : 'consult'} price in dollars, or leave it empty.` }, { status: 400 });
  }

  const supabase = await clientForRequest(request);
  const { data, error } = await supabase
    .from(TABLE[role])
    .update({ price: monthly, [ONE_TIME[role]]: oneTime })
    .eq('owner_id', user.id)
    .select(columns(role));
  if (error) {
    console.error('[shape] coach rates save failed:', error.message);
    return NextResponse.json({ error: 'Could not save your rates. Please try again.' }, { status: 500 });
  }
  const row = ((data ?? []) as unknown as Row[])[0];
  if (!row) return NextResponse.json({ error: 'Your listing appears once your coach application is approved.' }, { status: 404 });
  // The rates are saved; a failed profile read only leaves the steps unknown.
  const { data: profile, error: profileErr } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle();
  const avatar = profileErr ? undefined : (profile as { avatar_url?: string | null } | null)?.avatar_url ?? null;
  return NextResponse.json({ listing: describe(role, row, avatar) });
}
