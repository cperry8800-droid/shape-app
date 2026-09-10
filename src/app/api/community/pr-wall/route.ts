// POST /api/community/pr-wall — announce the caller's new personal record to the
// PR Wall channel. The server-side RPC (post_my_pr_to_wall) re-checks the caller
// is a PUBLIC profile and that the value actually beats their last posted best,
// so non-public members + non-PRs post nothing. Applies to every role.
import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const bodyResult = await readJson<{
    lift?: unknown;
    value?: unknown;
    unit?: unknown;
    reps?: unknown;
    postId?: unknown;
  } | null>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const lift = String(body?.lift ?? '').trim();
  const value = Number(body?.value);
  const unit = String(body?.unit ?? 'lb').trim() || 'lb';
  const reps = body?.reps != null && Number.isFinite(Number(body.reps)) ? Math.round(Number(body.reps)) : null;
  // The community post this record IS, so the Wall plate can carry its stats,
  // co-sign and reactions. Validated as a uuid HERE because PostgREST rejects
  // the whole call on a malformed one — which would lose the record itself, not
  // just its link. The RPC is still the authority on ownership: it drops an id
  // whose post the caller did not write.
  const rawPostId = String(body?.postId ?? '').trim();
  const postId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawPostId)
    ? rawPostId
    : null;

  if (!lift || !Number.isFinite(value) || value <= 0) {
    return NextResponse.json({ error: 'A lift name and a positive value are required.' }, { status: 400 });
  }

  const client = await clientForRequest(request);
  const base = { p_lift: lift, p_value: value, p_unit: unit, p_reps: reps };
  // ⚠ THE ARGUMENT IS OMITTED WHEN THERE IS NOTHING TO LINK, AND THE CALL
  // FALLS BACK WHEN THE MIGRATION HAS NOT RUN. `p_post_id` only exists on the
  // 5-argument signature (2026-09-10-pr-wall-surface.sql), and that migration
  // DROPS the 4-argument one — so between a deploy and an apply, in either
  // order, one of the two shapes is the wrong one. PostgREST answers an unknown
  // signature with PGRST202, which the app would surface as a silent
  // `{ ok: false }`: the member's record would simply not land, with no message
  // and nothing in the log tying it to a pending migration. Retrying without
  // the id costs one round trip in a window that should be minutes long, and
  // keeps every PR posting through it.
  let { data, error } = await client.rpc('post_my_pr_to_wall',
    postId ? { ...base, p_post_id: postId } : base);
  if (error && postId && /PGRST202|does not exist|Could not find the function/i.test(`${error.code ?? ''} ${error.message ?? ''}`)) {
    ({ data, error } = await client.rpc('post_my_pr_to_wall', base));
  }
  if (error) return dbError(error, 'pr wall post', 500);
  return NextResponse.json(data ?? { ok: false });
}
