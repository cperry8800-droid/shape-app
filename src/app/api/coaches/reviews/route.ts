import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanText(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function clampRating(value: unknown): number {
  const n = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(10, n));
}
type ReviewRow = { id: string; rating: number; body: string | null; author_name: string | null; user_id?: string | null; owner_id?: string | null; created_at: string };
function shape(row: ReviewRow) {
  // ownerId (the coach BEING reviewed) is what the wins wall resolves a pinned id
  // against — a pin only renders when ownerId === the profile owner's uid. NULL for
  // any pre-migration review (there is no backfill), so it never pins.
  return { id: row.id, rating: row.rating, text: row.body ?? '', author: row.author_name ?? 'Member', authorId: row.user_id ?? null, ownerId: row.owner_id ?? null, date: row.created_at };
}

// GET /api/coaches/reviews?coach=<slug>  -> { reviews, avg, count }
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = cleanText(url.searchParams.get('coach'), 160);
  const supabase = await clientForRequest(request);

  // ?ids=<uuid,uuid,uuid> — resolve specific reviews by id, INDEPENDENT of the
  // slug list's 200-row page. The wins wall uses this so a pinned testimonial never
  // vanishes once a popular coach passes 200 reviews. Reviews are public-read; the
  // wall still filters the results to ownerId === the profile owner, so requesting
  // arbitrary ids can never surface another coach's review on this wall.
  const idsParam = cleanText(url.searchParams.get('ids'), 200);
  if (idsParam) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids = idsParam.split(',').map((x) => x.trim().toLowerCase()).filter((x) => uuid.test(x)).slice(0, 3);
    if (!ids.length) return NextResponse.json({ reviews: [] });
    const { data, error } = await supabase.from('coach_reviews').select('*').in('id', ids).limit(3);
    if (error) return NextResponse.json({ reviews: [] });
    return NextResponse.json({ reviews: (data ?? []).map((r) => shape(r as ReviewRow)) });
  }

  if (slug) {
    // select('*') keeps this migration-safe — an explicit owner_id column would
    // 400 pre-migration (PostgREST). shape() picks only the fields it needs.
    const { data, error } = await supabase
      .from('coach_reviews')
      .select('*')
      .eq('coach_slug', slug)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ reviews: [], avg: 0, count: 0 });
    const reviews = (data ?? []).map(shape);
    const count = reviews.length;
    const avg = count ? Math.round((reviews.reduce((s, r) => s + (r.rating || 0), 0) / count) * 10) / 10 : 0;
    return NextResponse.json({ reviews, avg, count });
  }

  const { data, error } = await supabase.from('coach_reviews').select('coach_slug, rating').limit(5000);
  if (error) return NextResponse.json({ summaries: {} });
  const acc: Record<string, { sum: number; count: number }> = {};
  for (const row of (data ?? []) as { coach_slug: string; rating: number }[]) {
    const s = row.coach_slug;
    (acc[s] ||= { sum: 0, count: 0 });
    acc[s].sum += row.rating || 0;
    acc[s].count += 1;
  }
  const summaries: Record<string, { avg: number; count: number }> = {};
  for (const s of Object.keys(acc)) summaries[s] = { avg: Math.round((acc[s].sum / acc[s].count) * 10) / 10, count: acc[s].count };
  return NextResponse.json({ summaries });
}

// POST { coach, kind, rating(1-10), text } — authenticated.
export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const slug = cleanText(body.coach, 160);
  const kind = cleanText(body.kind, 20) === 'nutritionist' ? 'nutritionist' : 'trainer';
  const rating = clampRating(body.rating);
  const text = cleanText(body.text ?? body.body, 800);
  if (!slug) return NextResponse.json({ error: 'Missing coach.' }, { status: 400 });
  if (!rating) return NextResponse.json({ error: 'A star rating is required.' }, { status: 400 });

  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to leave a review.' }, { status: 401 });

  const supabase = await clientForRequest(request);
  let authorName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.email ? user.email.split('@')[0] : '') ||
    'Member';
  try {
    const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    if (prof && (prof as { full_name?: string }).full_name) authorName = (prof as { full_name: string }).full_name;
  } catch {
    /* best effort */
  }

  // owner_id (the coach BEING reviewed) is stamped ENTIRELY by the DB trigger
  // (2026-07-23-coach-reviews-owner-id.sql) from coach_slug — the route never sends
  // it, because the client-scoped insert can't be a trust boundary (a coach could
  // insert directly and forge it, CWE-639). The trigger runs server-side on every
  // write regardless of who inserts; a collision/unresolvable slug leaves it NULL.
  //
  // Upsert so a re-submit (double-tap / retry / two tabs) UPDATES the user's single
  // review instead of inserting a duplicate row that skews the coach's public average.
  // Falls back to a plain insert until the unique-index migration is applied (42P10 =
  // no constraint matching ON CONFLICT).
  const payload: Record<string, unknown> = { coach_slug: slug, coach_kind: kind, user_id: user.id, author_name: authorName, rating, body: text };
  const cols = 'id, rating, body, author_name, user_id, created_at';
  const writeReview = async (p: Record<string, unknown>) => {
    let r = await supabase.from('coach_reviews').upsert(p, { onConflict: 'user_id,coach_slug' }).select(cols).single();
    if (r.error && r.error.code === '42P10') r = await supabase.from('coach_reviews').insert(p).select(cols).single();
    return r;
  };
  const { data, error } = await writeReview(payload);
  if (error) {
    console.error('coach review write failed:', error);
    return NextResponse.json({ error: 'Could not save your review.' }, { status: 500 });
  }
  return NextResponse.json({ review: shape(data as ReviewRow) });
}
