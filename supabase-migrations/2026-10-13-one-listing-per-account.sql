-- One listing per role per account. Owner, 2026-10-13: "add the unique index migration".
--
-- Seventeen API routes read a coach's own listing with .maybeSingle() (/api/trainer/analytics
-- among them; Codex on #2324). An account with two trainer rows makes every one of them error,
-- and the coach's dashboards go blank. Nothing in the schema stopped a second row: the only
-- unique indexes on either table are the primary key and the Stripe account.
--
-- This records the rule the code already assumes. Production holds no account with two
-- listings of one role (21 trainer and 22 nutritionist listings, one of each owned,
-- 2026-10-13). Approval (publishProviderRow, src/app/dashboard/applications/actions.ts) is the
-- only writer of a coach-owned row: a coach has no insert policy on either table, and it reads
-- the owner's listing before inserting one.
--
-- Partial, on owner_id is not null: Shape's own listings have no owner, and there are many.
-- If an account already owns two rows the migration stops and says how many, rather than
-- failing on an anonymous constraint error halfway through.
--
-- Re-runnable: both indexes are "if not exists", and the guard checks their exact definitions.

begin;

do $pre$
declare
  v_trainers int;
  v_nutritionists int;
begin
  select count(*) into v_trainers
  from (select owner_id from public.trainers where owner_id is not null group by owner_id having count(*) > 1) d;
  select count(*) into v_nutritionists
  from (select owner_id from public.nutritionists where owner_id is not null group by owner_id having count(*) > 1) d;
  if v_trainers > 0 or v_nutritionists > 0 then
    raise exception 'one listing per account: % account(s) own two or more trainer listings and % own two or more nutritionist listings; merge or remove the extras, then run this again',
      v_trainers, v_nutritionists;
  end if;
end
$pre$;

create unique index if not exists trainers_one_per_owner
  on public.trainers (owner_id) where owner_id is not null;

create unique index if not exists nutritionists_one_per_owner
  on public.nutritionists (owner_id) where owner_id is not null;

-- ── The gate: a migration that cannot prove it worked is not a gate ──────────────────────────
do $guard$
begin
  if coalesce((select pg_get_indexdef(i.indexrelid) from pg_index i join pg_class c on c.oid = i.indexrelid
               where c.relname = 'trainers_one_per_owner' and i.indisvalid and i.indisready), '')
     <> 'CREATE UNIQUE INDEX trainers_one_per_owner ON public.trainers USING btree (owner_id) WHERE (owner_id IS NOT NULL)' then
    raise exception 'trainers_one_per_owner is missing, invalid, or not the unique partial index on owner_id';
  end if;
  if coalesce((select pg_get_indexdef(i.indexrelid) from pg_index i join pg_class c on c.oid = i.indexrelid
               where c.relname = 'nutritionists_one_per_owner' and i.indisvalid and i.indisready), '')
     <> 'CREATE UNIQUE INDEX nutritionists_one_per_owner ON public.nutritionists USING btree (owner_id) WHERE (owner_id IS NOT NULL)' then
    raise exception 'nutritionists_one_per_owner is missing, invalid, or not the unique partial index on owner_id';
  end if;
end
$guard$;

commit;
