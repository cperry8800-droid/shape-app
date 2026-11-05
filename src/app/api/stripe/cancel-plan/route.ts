// A member cancels a coach plan in Shape's own step (owner, 2026-11-05: "3 - user types response").
//
// Members used to cancel only in Stripe's billing portal, which asked nothing. Now the app's Settings
// and the website's Me page list each coach plan with a Cancel step that asks ONE optional question,
// "Why are you leaving?", answered in the member's own words, and then cancels here, through Stripe,
// at the period's end: the member keeps the plan until then, and it does not renew. The portal on a
// coach's account no longer offers its own cancel (coach-checkout.ts SHAPE_PORTAL_FEATURES).
//
//   GET   the member's open coach plans, each with whether it is set to end and when
//   POST  { subscriptionId, reason? }: cancel that plan at its period's end
//
// ⚠ THE QUESTION NEVER BLOCKS THE CANCELLATION. An empty answer cancels; an answer the database
// can't keep yet (before 2026-11-05-subscription-cancellations.sql) still cancels, and its words still
// reach Stripe as cancellation_details.comment, from where the webhook and the backfill copy them.
// ⚠ THE WORDS ARE PRIVATE TO THAT COACH AND SHAPE: stored on the plan's own subscriptions row, which RLS
// shows only to the member and that coach, and on the plan's own Stripe subscription (the coach's own
// account for a direct charge, Shape's for a plan from before). Nothing public reads them.
//
// The caller is read from the app's Bearer token or the website's cookie (request-auth.ts); the plan
// is read with the member's own client ("clients read own subscriptions"), and written with the
// service role only after it is proven theirs.

import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { acctOpts, isAccountId } from '@/lib/stripe-connect';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';
import { OPEN_SUB_STATUSES } from '../../../../lib/coach-trajectory.mjs';
import { cancellationPatch, memberReason, planEndsAt, withoutCancellation, MEMBER_REASON_MAX } from '../../../../lib/plan-cancellation.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPEN = new Set(OPEN_SUB_STATUSES);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PlanRow = {
  id: string;
  client_id: string;
  provider_role: string | null;
  provider_id: number | null;
  status: string | null;
  price_cents: number | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  stripe_account_id?: string | null;
  cancel_at_period_end?: boolean | null;
  cancel_at?: string | null;
};

const isCoachRole = (r: unknown): r is 'trainer' | 'nutritionist' => r === 'trainer' || r === 'nutritionist';

// Postgres 42703 / PostgREST PGRST204: the column is not there (a database before the migration).
const missingColumn = (err: { code?: string } | null) => err?.code === '42703' || err?.code === 'PGRST204';

// Whether a plan is set to end: true, false, or null for a row not synced yet (it can still be cancelled).
function endingOf(r: PlanRow): boolean | null {
  if (r.cancel_at_period_end === true || !!r.cancel_at) return true;
  if (r.cancel_at_period_end === false) return false;
  return null;
}

const SUPPORT = "This coach has disconnected their payments from Shape, so this plan can't be cancelled here. Contact Shape support and we'll sort it out with you.";

export async function GET(req: Request) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(req);
  // '*' is migration-safe: the cancellation columns are absent before 2026-11-05.
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('client_id', user.id)
    .in('status', OPEN_SUB_STATUSES);
  if (error) return dbError(error, 'cancel-plan list', 503, "Couldn't read your plans just now.");
  const rows = ((data ?? []) as PlanRow[]).filter((r) => r.client_id === user.id && isCoachRole(r.provider_role) && !!r.stripe_subscription_id);
  // The coaches' listing names (public on their profiles), read with the service role.
  const admin = createAdminClient();
  const names = new Map<string, string | null>();
  await Promise.all([...new Set(rows.map((r) => `${r.provider_role}:${r.provider_id}`))].map(async (key) => {
    const [role, id] = key.split(':');
    const { data: coach } = await admin.from(role === 'trainer' ? 'trainers' : 'nutritionists').select('name').eq('id', Number(id)).maybeSingle();
    names.set(key, String((coach as { name?: string | null } | null)?.name || '').trim() || null);
  }));
  return NextResponse.json({
    plans: rows.map((r) => ({
      subscriptionId: r.id,
      providerRole: r.provider_role,
      providerId: r.provider_id,
      name: names.get(`${r.provider_role}:${r.provider_id}`) ?? null,
      priceCents: r.price_cents ?? null,
      renewsAt: r.current_period_end ?? null,
      ending: endingOf(r),
      endsAt: planEndsAt(r),
    })),
    reasonMax: MEMBER_REASON_MAX,
  });
}

export async function POST(req: Request) {
  const user = await currentUser(req);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = await readJson<{ subscriptionId?: unknown; reason?: unknown }>(req, { maxBytes: 16_000 });
  if (!parsed.ok) return parsed.response;
  const subscriptionId = typeof parsed.data?.subscriptionId === 'string' ? parsed.data.subscriptionId : '';
  if (!UUID.test(subscriptionId)) return NextResponse.json({ error: 'Which plan?', reason: 'invalid_plan' }, { status: 400 });
  const reason = memberReason(parsed.data?.reason);

  // The plan, read as the member: RLS shows only their own rows, and the client id is checked too.
  const supabase = await clientForRequest(req);
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('id', subscriptionId)
    .eq('client_id', user.id)
    .maybeSingle();
  if (error) return dbError(error, 'cancel-plan read', 503, "Couldn't read your plan just now. Nothing changed; try again.");
  const row = data as PlanRow | null;
  if (!row || row.client_id !== user.id || !isCoachRole(row.provider_role) || !row.stripe_subscription_id) {
    return NextResponse.json({ error: 'No such plan.', reason: 'no_plan' }, { status: 404 });
  }
  if (!OPEN.has(String(row.status))) {
    return NextResponse.json({ error: 'This plan has already ended.', reason: 'not_active' }, { status: 409 });
  }

  const admin = createAdminClient();
  const account = isAccountId(row.stripe_account_id) ? row.stripe_account_id : null;
  // ⚠ A COACH WHO DISCONNECTED TOOK SHAPE'S ACCESS TO THEIR ACCOUNT WITH THEM (as the billing portal):
  // Shape can't cancel there, so the member is sent to support in words, never shown a bare 500.
  const disconnected = () => NextResponse.json({ error: SUPPORT, reason: 'coach_disconnected' }, { status: 409 });
  if (account) {
    const { data: coachRow, error: coachErr } = await admin
      .from(row.provider_role === 'trainer' ? 'trainers' : 'nutritionists')
      .select('stripe_account_id, stripe_account_status')
      .eq('id', Number(row.provider_id))
      .maybeSingle();
    if (coachErr) return dbError(coachErr, 'cancel-plan coach read', 503, "Couldn't cancel just now. Nothing changed; try again.");
    const c = coachRow as { stripe_account_id?: string | null; stripe_account_status?: string | null } | null;
    if (!c || c.stripe_account_id !== account || c.stripe_account_status === 'disconnected') return disconnected();
  }

  // Cancel at the period's end, through Stripe. The member's words go with it as Stripe's comment, so
  // they are kept even where the database can't hold them yet.
  let updated: Awaited<ReturnType<typeof stripe.subscriptions.update>>;
  try {
    updated = await stripe.subscriptions.update(
      row.stripe_subscription_id,
      { cancel_at_period_end: true, ...(reason ? { cancellation_details: { comment: reason } } : {}) },
      acctOpts(account)
    );
  } catch (err) {
    const e = err as { type?: string; code?: string };
    if (account && (e?.type === 'StripePermissionError' || e?.code === 'account_invalid')) return disconnected();
    return dbError(err, 'cancel-plan stripe update', 502, "Couldn't cancel just now. Nothing changed; try again.");
  }

  // The row follows at once, so the coach's roster says "plan ending" before the webhook arrives. Best
  // effort: the cancellation has happened, and the webhook writes the same columns from Stripe.
  const now = new Date().toISOString();
  const write: Record<string, unknown> = {
    ...cancellationPatch(updated),
    cancel_synced_at: now,
    ...(reason ? { member_cancel_reason: reason, member_cancel_reason_at: now } : {}),
  };
  let reasonSaved = !reason;
  const { error: writeErr } = await admin.from('subscriptions').update(write).eq('id', row.id).eq('client_id', user.id);
  if (!writeErr) reasonSaved = true;
  else if (missingColumn(writeErr)) {
    console.warn('[cancel-plan] cancellation columns not there yet (run 2026-11-05-subscription-cancellations.sql) — the reason is on Stripe only', { subscription: row.id });
    const rest = withoutCancellation(write);
    if (Object.keys(rest).length) await admin.from('subscriptions').update(rest).eq('id', row.id);
  } else {
    console.error('[cancel-plan] the cancellation was made in Stripe but not written to the row — the webhook writes it', { subscription: row.id, error: writeErr.message });
  }

  const periodEnd = updated.items?.data?.[0]?.current_period_end;
  const endsAt = (updated.cancel_at ? new Date(updated.cancel_at * 1000).toISOString() : null)
    ?? (periodEnd ? new Date(periodEnd * 1000).toISOString() : null)
    ?? row.current_period_end
    ?? null;
  return NextResponse.json({ ok: true, endsAt, reasonSaved });
}
