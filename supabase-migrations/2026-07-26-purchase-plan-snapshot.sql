-- A paid plan must not vanish when the coach deletes it.
--
-- THE BUG (live today):
--   one_time_purchases.plan_id is `references coach_plans(id) on delete set null`
--   (2026-06-08-coach-plans-sale.sql:12), and get_my_purchased_plans() INNER-joins
--   the live catalogue row with `plan_id is not null` (:45-46). So when a coach
--   deletes a plan, plan_id goes NULL and the purchase disappears from the buying
--   client's Library entirely -- money taken, nothing owned, no trace on the
--   client's side.
--
-- THE FIX:
--   Snapshot the sold plan onto the purchase, and resolve the Library from the
--   live row when it still exists, falling back to the snapshot when it doesn't.
--
-- SCOPE NOTE (deliberate): the live row still WINS when present, so a coach
-- editing a plan keeps propagating exactly as it does today. Whether paid content
-- should be frozen at purchase is a product decision, not a bug -- it belongs to
-- the entitlement spec (docs/superpowers/specs/2026-07-26-entitlement-layer.md).
-- This migration fixes only the disappearance, which is unambiguously wrong.
--
-- Idempotent; safe to re-run.

alter table public.one_time_purchases
  add column if not exists plan_snapshot jsonb;

comment on column public.one_time_purchases.plan_snapshot is
  'Snapshot of the coach_plans row this purchase was for, taken at checkout. '
  'Lets the buyer keep what they paid for if the coach later deletes the plan '
  '(plan_id is ON DELETE SET NULL). Read only as a fallback -- the live row wins.';

-- Backfill every paid purchase whose plan still exists. Purchases whose plan was
-- ALREADY deleted have plan_id = NULL and are unrecoverable here -- the FK nulled
-- the only pointer we had. This stops the bleeding for everything still joinable.
update public.one_time_purchases otp
set plan_snapshot = jsonb_build_object(
      'id', cp.id,
      'kind', cp.kind,
      'name', cp.name,
      'meta', cp.meta,
      'detail', cp.detail,
      'snapshot_at', now(),
      'snapshot_source', 'backfill'
    )
from public.coach_plans cp
where cp.id = otp.plan_id
  and otp.plan_snapshot is null;

-- The buyer's Library. Now a LEFT join: a purchase survives its catalogue row.
create or replace function public.get_my_purchased_plans()
returns table (
  id uuid,
  kind text,
  name text,
  meta text,
  detail jsonb,
  provider_role text,
  purchased_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    -- The live row wins where it exists; the snapshot is the survival path.
    coalesce(cp.id,     (otp.plan_snapshot->>'id')::uuid)  as id,
    coalesce(cp.kind,    otp.plan_snapshot->>'kind')       as kind,
    coalesce(cp.name,    otp.plan_snapshot->>'name')       as name,
    coalesce(cp.meta,    otp.plan_snapshot->>'meta')       as meta,
    coalesce(cp.detail,  otp.plan_snapshot->'detail')      as detail,
    otp.provider_role,
    otp.created_at
  from one_time_purchases otp
  left join coach_plans cp on cp.id = otp.plan_id
  where otp.client_id = auth.uid()
    and otp.status = 'paid'
    -- Gate on a resolvable NAME, not merely an id. Two kinds of row carry an id
    -- with no content and must stay OUT of the Library rather than render an
    -- entry that opens onto nothing:
    --   * a pre-migration purchase whose plan was already deleted (no snapshot);
    --   * a purchase whose plan the coach deleted BETWEEN checkout and payment,
    --     which the webhook records with plan_id NULL and an id-only marker
    --     (snapshot_source = 'plan_deleted_before_payment') so the payment is
    --     still on the books and support can trace it.
    -- Both are real purchases and both stay queryable for refunds/support; they
    -- simply have nothing for the client to open, and inventing a placeholder
    -- would be fabricating a plan.
    and (cp.id is not null or (otp.plan_snapshot->>'name') is not null)
  order by otp.created_at desc;
$$;

revoke execute on function public.get_my_purchased_plans() from public, anon;
grant execute on function public.get_my_purchased_plans() to authenticated;
