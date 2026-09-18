// Coach plans — published programs / meal plans, shared by the mobile Plans
// page and the website. Owner-scoped via RLS (coach_plans).

import { NextResponse } from 'next/server';
import { isDeepStrictEqual } from 'node:util';
import { readJson, dbError } from '@/lib/request-utils';
import { normalizeWorkoutPlan, normalizeWorkoutDetail } from '../../../../../public/newdesign/workoutDocument.mjs';
import { clientForRequest, currentUser } from '@/lib/request-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SELECT = 'id, kind, name, meta, price, published, detail, created_at';
const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function GET(request: Request) {
  const supabase = await clientForRequest(request);
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const kind = new URL(request.url).searchParams.get('kind');
  let q = supabase.from('coach_plans').select(SELECT).eq('owner_id', user.id).order('created_at', { ascending: false });
  if (kind === 'program' || kind === 'meal_plan') q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) return dbError(error, 'coach plans write', 500);
  return NextResponse.json({ plans: (data ?? []).map(normalizeWorkoutPlan), ownerId: user.id });
}

export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const supabase = await clientForRequest(request);
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const name = clean(body.name, 160);
  if (body.expectedOwnerId && body.expectedOwnerId !== user.id) return NextResponse.json({ error: 'The signed-in account changed. Reopen this draft in its original account.' }, { status: 409 });
  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  const requestedId = typeof body.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) ? body.id : null;
  const insert = {
    ...(requestedId ? { id: requestedId } : {}),
    owner_id: user.id,
    kind: body.kind === 'meal_plan' ? 'meal_plan' : 'program',
    name,
    meta: clean(body.meta, 200) || null,
    price: clean(body.price, 32) || null,
    published: body.published === false ? false : true,
    detail: body.kind === 'meal_plan' ? (body.detail || {}) : { ...normalizeWorkoutDetail(body.detail, { name }), revision: 1 },
  };
  const { data, error } = await supabase.from('coach_plans').insert(insert).select(SELECT).single();
  if (error?.code === '23505' && requestedId) {
    const { data: existing } = await supabase.from('coach_plans').select(SELECT).eq('id', requestedId).eq('owner_id', user.id).single();
    if (existing && (['name', 'kind', 'meta', 'price', 'published', 'detail'] as const).every(key => isDeepStrictEqual(existing[key], insert[key]))) return NextResponse.json({ plan: normalizeWorkoutPlan(existing) });
    return NextResponse.json({ error: 'This draft was already saved. Reload the library to review its latest version.', code: 'revision_conflict' }, { status: 409 });
  }
  if (error) return dbError(error, 'coach plans write', 500);
  return NextResponse.json({ plan: normalizeWorkoutPlan(data) });
}

export async function PATCH(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const supabase = await clientForRequest(request);
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const id = clean(body.id, 64);
  if (body.expectedOwnerId && body.expectedOwnerId !== user.id) return NextResponse.json({ error: 'The signed-in account changed. Reopen this draft in its original account.' }, { status: 409 });
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const { data: current, error: readError } = await supabase.from('coach_plans').select(SELECT).eq('id', id).eq('owner_id', user.id).single();
  if (readError || !current) return NextResponse.json({ error: 'Could not load this plan. Refresh and retry.' }, { status: 404 });
  const oldDetail = current.detail && typeof current.detail === 'object' ? current.detail : {};
  const revision = Number(oldDetail.revision) || 0;
  const supplied = body.detail && typeof body.detail === 'object' ? body.detail as Record<string, unknown> : null;
  const expected = body.expectedRevision ?? supplied?.revision;
  if (current.kind !== 'meal_plan' && ((revision > 0 && expected == null) || (expected != null && Number(expected) !== revision))) {
    return NextResponse.json({ error: 'This plan changed on another device. Keep your draft, refresh the library, and review the latest version.', code: 'revision_conflict' }, { status: 409 });
  }
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string') patch.name = clean(body.name, 160);
  if (typeof body.meta === 'string') patch.meta = clean(body.meta, 200);
  if (typeof body.price === 'string') patch.price = clean(body.price, 32);
  if (typeof body.published === 'boolean') patch.published = body.published;
  const detail = supplied ? { ...oldDetail, ...supplied } : oldDetail;
  patch.detail = current.kind === 'meal_plan' ? detail : { ...normalizeWorkoutDetail(detail, { name: patch.name || current.name }), revision: revision + 1 };
  let update = supabase.from('coach_plans').update(patch).eq('id', id).eq('owner_id', user.id);
  if (current.kind !== 'meal_plan') update = oldDetail.revision == null ? update.is('detail->>revision', null) : update.eq('detail->>revision', String(revision));
  const { data, error } = await update.select(SELECT).maybeSingle();
  if (error) return dbError(error, 'coach plans write', 500);
  if (!data) return NextResponse.json({ error: 'This plan changed while saving. Your draft is retained; reload before retrying.', code: 'revision_conflict' }, { status: 409 });
  return NextResponse.json({ plan: normalizeWorkoutPlan(data) });
}

export async function DELETE(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const supabase = await clientForRequest(request);
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const id = clean(body.id, 64);
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  const { error } = await supabase.from('coach_plans').delete().eq('id', id).eq('owner_id', user.id);
  if (error) return dbError(error, 'coach plans write', 500);
  return NextResponse.json({ ok: true });
}
