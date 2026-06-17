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
  } | null>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;

  const lift = String(body?.lift ?? '').trim();
  const value = Number(body?.value);
  const unit = String(body?.unit ?? 'lb').trim() || 'lb';
  const reps = body?.reps != null && Number.isFinite(Number(body.reps)) ? Math.round(Number(body.reps)) : null;

  if (!lift || !Number.isFinite(value) || value <= 0) {
    return NextResponse.json({ error: 'A lift name and a positive value are required.' }, { status: 400 });
  }

  const client = await clientForRequest(request);
  const { data, error } = await client.rpc('post_my_pr_to_wall', {
    p_lift: lift,
    p_value: value,
    p_unit: unit,
    p_reps: reps,
  });
  if (error) return dbError(error, 'pr wall post', 500);
  return NextResponse.json(data ?? { ok: false });
}
