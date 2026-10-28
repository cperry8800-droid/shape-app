import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, currentUser, userLookupForRequest } from '@/lib/request-auth';
import { isMeasuredSignedOut } from '@/lib/auth-lookup';
import { readJson } from '@/lib/request-utils';
import { computeMembership } from '@/lib/membership-core';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cleanText(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function clampRating(value: unknown): number {
  const n = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(10, n));
}
// Every row a query matches, a page at a time in a stable order. A single select
// stops at the API's row cap (and these used `.limit(200)` / `.limit(5000)`), so a
// busy coach's average was the newest page's and the marketplace's per-account
// averages dropped coaches once the table outgrew one read (Codex, #2313).
const PAGE = 1000;
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<{ rows: T[]; error: unknown }> {
  const rows: T[] = [];
  for (let i = 0; i < 500; i += 1) {
    const { data, error } = await page(i * PAGE, i * PAGE + PAGE - 1);
    if (error) return { rows, error };
    const got = data || [];
    rows.push(...got);
    if (got.length < PAGE) break;
  }
  return { rows, error: null };
}

type ReviewRow = { id: string; rating: number; body: string | null; author_name: string | null; user_id?: string | null; owner_id?: string | null; created_at: string };
function shape(row: ReviewRow) {
  // ownerId (the coach BEING reviewed) is what the wins wall resolves a pinned id
  // against — a pin only renders when ownerId === the profile owner's uid. NULL for
  // any pre-migration review (there is no backfill), so it never pins.
  return { id: row.id, rating: row.rating, text: row.body ?? '', author: row.author_name ?? 'Member', authorId: row.user_id ?? null, ownerId: row.owner_id ?? null, date: row.created_at };
}

// ⚠ MEMBERS READ THE REVIEWS; EVERYONE SEES THE RATING (owner, 2026-10-28: "anyone with a shape
// membership can read them", and "Rating only" for everyone else). A review's words and author go
// only to a member (computeMembership: an approved coach, an admin, or an active subscription);
// anyone else gets `reviews: []` and `locked: true` with the same average and count. The database
// holds the same line (2026-10-28-coach-reviews-members.sql): coach_reviews is readable by a
// member, a review's author and its coach, and every rating comes from coach_review_ratings(),
// which returns totals and counts only.
// null: the sign-in or the membership couldn't be read. That is unknown, never "not a member", so
// a member is never shown the paywall over a failed read (Codex P2 ×2 on #2492): the answer is a
// 503. Only a sign-in check that measured nobody (src/lib/auth-lookup.ts) is a guest; an auth
// outage answers a null user too.
type Reader = { member: boolean; admin: boolean } | null;
async function readReader(request: Request, supabase: SupabaseClient): Promise<Reader> {
  const { user, error } = await userLookupForRequest(request);
  if (!user) return isMeasuredSignedOut(error) ? { member: false, admin: false } : null;
  try {
    const m = await computeMembership(supabase, user.id, user.email ?? null, { emailConfirmed: !!user.email_confirmed_at, strict: true });
    return { member: m.isMember, admin: m.isAdmin };
  } catch {
    return null;
  }
}
const UNKNOWN = () => NextResponse.json({ error: "Couldn't check your membership just now." }, { status: 503 });
// The client a member's list is read with. An admin (a confirmed address on the allow-list) is a
// member here but not to the table's policy, which can't see the allow-list, so their read would
// come back empty: it goes through the service role (Codex P2 on #2492). Only for a confirmed
// admin, and only these reads, whose filters are a validated uuid or a cleaned slug.
function listClient(reader: { admin: boolean }, supabase: SupabaseClient): SupabaseClient {
  if (!reader.admin) return supabase;
  try { return createAdminClient(); } catch { return supabase; }
}

// Every coach's rating total and count, by slug and by account. From coach_review_ratings(); until
// that migration has run, from the rows as before (the old policy lets anyone read them).
type RatingRow = { coach_slug: string; owner_id: string | null; total: number; count: number };
async function readRatings(supabase: SupabaseClient): Promise<RatingRow[] | null> {
  const rpc = await supabase.rpc('coach_review_ratings');
  if (!rpc.error) return ((rpc.data ?? []) as RatingRow[]).map((r) => ({ coach_slug: r.coach_slug, owner_id: r.owner_id ?? null, total: Number(r.total) || 0, count: Number(r.count) || 0 }));
  // Only a database without the function (before the migration) is read row by row. Any other
  // failure is no rating: after the migration a non-member reads no row, or only their own, so
  // the rows would give an empty or partial average (Codex P2 on #2492).
  const code = (rpc.error as { code?: string }).code;
  if (code !== 'PGRST202' && code !== '42883') return null;
  const { rows, error } = await readAll<{ coach_slug: string; rating: number; owner_id?: string | null }>((from, to) =>
    supabase.from('coach_reviews').select('coach_slug, rating, owner_id').order('id', { ascending: true }).range(from, to));
  if (error) return null;
  return rows.map((r) => ({ coach_slug: r.coach_slug, owner_id: r.owner_id ?? null, total: r.rating || 0, count: 1 }));
}
function ratingOf(rows: RatingRow[]): { avg: number; count: number } {
  const total = rows.reduce((s, r) => s + r.total, 0);
  const count = rows.reduce((s, r) => s + r.count, 0);
  return { avg: count ? Math.round((total / count) * 10) / 10 : 0, count };
}

// GET /api/coaches/reviews?coach=<slug>  -> { reviews, avg, count, locked }
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = cleanText(url.searchParams.get('coach'), 160);
  const supabase = await clientForRequest(request);

  // ?ids=<uuid,uuid,uuid> — resolve specific reviews by id, INDEPENDENT of the
  // slug list's 200-row page. The wins wall uses this so a pinned testimonial never
  // vanishes once a popular coach passes 200 reviews. Members only, as every list; the
  // wall still filters the results to ownerId === the profile owner, so requesting
  // arbitrary ids can never surface another coach's review on this wall.
  const idsParam = cleanText(url.searchParams.get('ids'), 200);
  if (idsParam) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids = idsParam.split(',').map((x) => x.trim().toLowerCase()).filter((x) => uuid.test(x)).slice(0, 3);
    if (!ids.length) return NextResponse.json({ reviews: [] });
    const reader = await readReader(request, supabase);
    if (!reader) return UNKNOWN();
    if (!reader.member) return NextResponse.json({ reviews: [], locked: true });
    const { data, error } = await listClient(reader, supabase).from('coach_reviews').select('*').in('id', ids).limit(3);
    if (error) return NextResponse.json({ reviews: [] });
    return NextResponse.json({ reviews: (data ?? []).map((r) => shape(r as ReviewRow)) });
  }

  // ?owner=<uid> — reviews for a specific coach by the trigger-stamped owner_id, so
  // the wins-wall pin picker is independent of any display-name vs provider-name slug
  // mismatch. Members only, as every list; the picker still filters to a MEMBER's review
  // (authorId !== ownerId).
  const ownerParam = cleanText(url.searchParams.get('owner'), 64);
  if (ownerParam) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(ownerParam)) return NextResponse.json({ reviews: [] });
    const reader = await readReader(request, supabase);
    if (!reader) return UNKNOWN();
    const ratings = await readRatings(supabase);
    const rating = ratings ? ratingOf(ratings.filter((r) => r.owner_id === ownerParam)) : null;
    if (!reader.member) return NextResponse.json({ reviews: [], locked: true, ...(rating || {}) });
    // The list is the newest 200; the average and count are over every review.
    const { data, error } = await listClient(reader, supabase).from('coach_reviews').select('*').eq('owner_id', ownerParam).order('created_at', { ascending: false }).limit(200);
    if (error) return NextResponse.json({ reviews: [], ...(rating || {}) });
    return NextResponse.json({ reviews: (data ?? []).map((r) => shape(r as ReviewRow)), ...(rating || {}) });
  }

  if (slug) {
    const reader = await readReader(request, supabase);
    if (!reader) return UNKNOWN();
    const ratings = await readRatings(supabase);
    const rating = ratings ? ratingOf(ratings.filter((r) => r.coach_slug === slug)) : null;
    if (!reader.member) return NextResponse.json({ reviews: [], locked: true, ...(rating || {}) });
    // select('*') keeps this migration-safe — an explicit owner_id column would
    // 400 pre-migration (PostgREST). shape() picks only the fields it needs.
    const { data, error } = await listClient(reader, supabase)
      .from('coach_reviews')
      .select('*')
      .eq('coach_slug', slug)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ reviews: [], ...(rating || {}) });
    const reviews = (data ?? []).map(shape);
    // No rating when the ratings couldn't be read: the list is the newest 200, so an average of it
    // would be partial for a busier coach (Codex P2 on #2492).
    return NextResponse.json({ reviews, ...(rating || {}) });
  }

  // Every coach's average, keyed two ways: by slug (the old shape) and by the coach's
  // account (`owners`). A listing with an owner reads its rating by account, because a
  // slug is a NAME and the profile name and the listing name can differ. Ratings only: open to all.
  const ratings = await readRatings(supabase);
  if (!ratings) return NextResponse.json({ summaries: {}, owners: {} });
  const bySlug: Record<string, RatingRow[]> = {};
  const byOwner: Record<string, RatingRow[]> = {};
  for (const r of ratings) {
    (bySlug[r.coach_slug] ||= []).push(r);
    if (r.owner_id) (byOwner[r.owner_id] ||= []).push(r);
  }
  const summaries: Record<string, { avg: number; count: number }> = {};
  for (const s of Object.keys(bySlug)) summaries[s] = ratingOf(bySlug[s]);
  const owners: Record<string, { avg: number; count: number }> = {};
  for (const o of Object.keys(byOwner)) owners[o] = ratingOf(byOwner[o]);
  return NextResponse.json({ summaries, owners });
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
  // M4 (2026-10-08 review): a review needs a relationship with the coach, a subscription or a
  // session that happened. coach_review_allowed (2026-10-09-coach-reviews-require-relationship.sql)
  // answers for the caller; the trigger on coach_reviews refuses at the database too, so this read
  // is what makes the refusal a clean 403 rather than a 500. A database without the function yet
  // refuses every review (loudly) rather than publishing one unchecked.
  const { data: allowed, error: allowedErr } = await supabase.rpc('coach_review_allowed', { p_slug: slug, p_kind: kind });
  if (allowedErr) {
    console.error('coach review relationship check failed:', allowedErr);
    return NextResponse.json({ error: 'Reviews are unavailable just now. Please try again later.' }, { status: 503 });
  }
  if (allowed !== true) {
    return NextResponse.json(
      { error: 'You can review a coach once you have subscribed to them or had a session with them.', code: 'relationship_required' },
      { status: 403 }
    );
  }
  const payload: Record<string, unknown> = { coach_slug: slug, coach_kind: kind, user_id: user.id, author_name: authorName, rating, body: text };
  // select('*') (not an explicit column list) so shape() returns the trigger-stamped
  // owner_id in the write response — AND stays migration-safe: naming owner_id explicitly
  // would 400 pre-migration (PostgREST rejects an unknown column), the same reason the GET
  // slug branch uses '*'. Pre-migration '*' just omits owner_id → shape() reads it as null.
  const writeReview = async (p: Record<string, unknown>) => {
    let r = await supabase.from('coach_reviews').upsert(p, { onConflict: 'user_id,coach_slug' }).select('*').single();
    if (r.error && r.error.code === '42P10') r = await supabase.from('coach_reviews').insert(p).select('*').single();
    return r;
  };
  const { data, error } = await writeReview(payload);
  if (error) {
    // The trigger's own refusal (a relationship that ended between the check and the write).
    if (/review_requires_relationship/.test(String(error.message || ''))) {
      return NextResponse.json(
        { error: 'You can review a coach once you have subscribed to them or had a session with them.', code: 'relationship_required' },
        { status: 403 }
      );
    }
    console.error('coach review write failed:', error);
    return NextResponse.json({ error: 'Could not save your review.' }, { status: 500 });
  }
  return NextResponse.json({ review: shape(data as ReviewRow) });
}
