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
  return Math.max(0, Math.min(5, n));
}
type ReviewRow = { id: string; rating: number; body: string | null; author_name: string | null; created_at: string };
function shape(row: ReviewRow) {
  return { id: row.id, rating: row.rating, text: row.body ?? '', author: row.author_name ?? 'Member', date: row.created_at };
}

// GET /api/recipes/reviews?slug=<slug>  -> { reviews, avg, count }
// GET /api/recipes/reviews              -> { summaries: { [slug]: { avg, count } } }
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = cleanText(url.searchParams.get('slug'), 160);
  const supabase = await clientForRequest(request);

  if (slug) {
    const { data, error } = await supabase
      .from('recipe_reviews')
      .select('id, rating, body, author_name, created_at')
      .eq('recipe_slug', slug)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ reviews: [], avg: 0, count: 0 });
    const reviews = (data ?? []).map(shape);
    const count = reviews.length;
    const avg = count ? Math.round((reviews.reduce((s, r) => s + (r.rating || 0), 0) / count) * 10) / 10 : 0;
    return NextResponse.json({ reviews, avg, count });
  }

  const { data, error } = await supabase
    .from('recipe_reviews')
    .select('recipe_slug, rating')
    .limit(5000);
  if (error) return NextResponse.json({ summaries: {} });
  const acc: Record<string, { sum: number; count: number }> = {};
  for (const row of (data ?? []) as { recipe_slug: string; rating: number }[]) {
    const s = row.recipe_slug;
    (acc[s] ||= { sum: 0, count: 0 });
    acc[s].sum += row.rating || 0;
    acc[s].count += 1;
  }
  const summaries: Record<string, { avg: number; count: number }> = {};
  for (const s of Object.keys(acc)) {
    summaries[s] = { avg: Math.round((acc[s].sum / acc[s].count) * 10) / 10, count: acc[s].count };
  }
  return NextResponse.json({ summaries });
}

// POST { slug, rating, text } — authenticated; attributes the review to the user.
export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const slug = cleanText(body.slug, 160);
  const rating = clampRating(body.rating);
  const text = cleanText(body.text ?? body.body, 600);
  if (!slug) return NextResponse.json({ error: 'Missing recipe.' }, { status: 400 });
  if (!rating) return NextResponse.json({ error: 'A star rating is required.' }, { status: 400 });

  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to leave a review.' }, { status: 401 });

  const supabase = await clientForRequest(request);
  let authorName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.email ? user.email.split('@')[0] : '') ||
    'Member';
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    if (prof && (prof as { full_name?: string }).full_name) {
      authorName = (prof as { full_name: string }).full_name;
    }
  } catch {
    /* profile lookup is best-effort */
  }

  // Upsert so a re-submit updates the user's single review instead of inserting a
  // duplicate that skews the recipe's average. Falls back to insert until the
  // unique-index migration is applied.
  const payload = { recipe_slug: slug, user_id: user.id, author_name: authorName, rating, body: text };
  const cols = 'id, rating, body, author_name, created_at';
  let { data, error } = await supabase.from('recipe_reviews').upsert(payload, { onConflict: 'user_id,recipe_slug' }).select(cols).single();
  if (error && error.code === '42P10') {
    ({ data, error } = await supabase.from('recipe_reviews').insert(payload).select(cols).single());
  }
  if (error) {
    console.error('recipe review write failed:', error);
    return NextResponse.json({ error: 'Could not save your review.' }, { status: 500 });
  }
  return NextResponse.json({ review: shape(data as ReviewRow) });
}
