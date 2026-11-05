-- A coach's dismissals, per provider role (2026-11-05, on 2026-11-05-coach-signal-dismissals.sql).
--
-- One auth user can coach as a trainer AND a nutritionist (a `trainers` row and a `nutritionists` row
-- with the same owner_id; a dietitian is on the nutritionist rails). Each role has its own page, its own
-- roster and its own signals, but the key was (coach, client, reason): dismissing the nutritionist's
-- "reply waiting" on a client overwrote the trainer's dismissal of the same reason, and the trainer's
-- came back. A row is now one role's: `provider_role` ('trainer' | 'nutritionist') joins the key.
--
-- The rows already there (none in production when this was written) are each kept for every role the
-- coach holds, since which page set them aside was not recorded: a coach with both listings gets a
-- copy for the nutritionist, and a row stays the trainer's unless the coach holds only a nutritionist
-- listing. A row kept for a role on which the client is not theirs hides nothing.
--
-- Until this runs, the website, the app and the server ask for `provider_role`, the read errors and
-- answers null (nothing is hidden), and a write answers false (the control says it could not save) —
-- as before the table existed. RLS and the four policies are unchanged; the guard checks them again.
--
-- One transaction, re-runnable: the column and the check are added only when missing, the old key is
-- dropped only while it lacks the role, the copies are made only from rows that have no role yet, and
-- the new key is added only when there is none. A guard at the end. Not run by this PR.

begin;
set local lock_timeout = '10s';

-- 1. The column, empty until the rows are filled in below.
alter table public.coach_signal_dismissals add column if not exists provider_role text;

-- 2. The old key goes first: the copies below would collide with it.
-- The key is dropped by its name (the default name 2026-11-05-coach-signal-dismissals.sql gave it, checked
-- live), never through dynamic SQL, which the migration model (tests/definer-grants.test.mjs) can't read.
-- A key by any other name is left in place, and the guard at the end then rolls the whole file back.
do $$
begin
  if exists (select 1 from pg_constraint c
             where c.conrelid = 'public.coach_signal_dismissals'::regclass and c.contype = 'p'
               and c.conname = 'coach_signal_dismissals_pkey'
               and not exists (select 1 from pg_attribute a
                               where a.attrelid = c.conrelid and a.attnum = any (c.conkey) and a.attname = 'provider_role')) then
    alter table public.coach_signal_dismissals drop constraint coach_signal_dismissals_pkey;
  end if;
end;
$$;

-- 3. The rows with no role yet: a copy for the nutritionist when the coach holds both listings, then
--    each original the trainer's, or the nutritionist's when that is the only listing the coach holds.
insert into public.coach_signal_dismissals (coach_id, client_id, reason_key, reason_sig, until, created_at, provider_role)
select d.coach_id, d.client_id, d.reason_key, d.reason_sig, d.until, d.created_at, 'nutritionist'
from public.coach_signal_dismissals d
where d.provider_role is null
  and exists (select 1 from public.trainers t where t.owner_id = d.coach_id)
  and exists (select 1 from public.nutritionists n where n.owner_id = d.coach_id);

update public.coach_signal_dismissals d
set provider_role = case
  when not exists (select 1 from public.trainers t where t.owner_id = d.coach_id)
   and exists (select 1 from public.nutritionists n where n.owner_id = d.coach_id) then 'nutritionist'
  else 'trainer'
end
where d.provider_role is null;

-- 4. Every row has a role, and only one of the two.
alter table public.coach_signal_dismissals alter column provider_role set not null;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.coach_signal_dismissals'::regclass
                   and conname = 'coach_signal_dismissals_provider_role_check') then
    alter table public.coach_signal_dismissals
      add constraint coach_signal_dismissals_provider_role_check check (provider_role in ('trainer', 'nutritionist'));
  end if;
end;
$$;

-- 5. The key: one row per coach, role, client and reason. The website and the app upsert on exactly
--    these columns (onConflict 'coach_id,provider_role,client_id,reason_key').
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.coach_signal_dismissals'::regclass and contype = 'p') then
    alter table public.coach_signal_dismissals
      add constraint coach_signal_dismissals_pkey primary key (coach_id, provider_role, client_id, reason_key);
  end if;
end;
$$;

-- The guard: the key is the four columns, every row has a role it may have, RLS is on, the four
-- policies exist, and anon has nothing.
do $$
declare
  v_cols text[];
begin
  select array_agg(a.attname::text order by a.attname) into v_cols
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.conrelid = 'public.coach_signal_dismissals'::regclass and c.contype = 'p';
  if v_cols is distinct from array['client_id', 'coach_id', 'provider_role', 'reason_key'] then
    raise exception 'coach_signal_dismissals is keyed on %, not (coach_id, provider_role, client_id, reason_key)', v_cols;
  end if;
  if exists (select 1 from public.coach_signal_dismissals where provider_role is null or provider_role not in ('trainer', 'nutritionist')) then
    raise exception 'coach_signal_dismissals has a row without a provider role';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.coach_signal_dismissals'::regclass
                   and conname = 'coach_signal_dismissals_provider_role_check') then
    raise exception 'coach_signal_dismissals is missing its provider role check';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.coach_signal_dismissals'::regclass) then
    raise exception 'coach_signal_dismissals has row level security off';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'coach_signal_dismissals'
      and policyname in ('coach_signal_dismissals_read', 'coach_signal_dismissals_insert',
                         'coach_signal_dismissals_update', 'coach_signal_dismissals_delete')) <> 4 then
    raise exception 'coach_signal_dismissals is missing a policy';
  end if;
  if has_table_privilege('anon', 'public.coach_signal_dismissals', 'select') then
    raise exception 'anon can read coach_signal_dismissals';
  end if;
end;
$$;

commit;
