-- When a coach's program (or a nutritionist's meal plan) was published, for the Goal page's
-- "Publish 2 new programs" (GET /api/coach/goal-readings counts the ones published since the goal's
-- start date).
--
-- ⚠ THE PROGRAMS COACHES PUBLISH ARE coach_plans ROWS. The builder (dashBuilder.jsx,
-- dashMealBuilder.jsx), the app and Nora's drafts all save through /api/coach/plans, whose
-- `published` flag is the Publish switch. coach_program_templates also has a `status` that can read
-- 'published', but nothing sets it today (/api/program-tools/templates inserts drafts only); it gets
-- the same column and the same rule so a reader of either table finds the date in the same place.
--
--   1. published_at on both tables.
--   2. A trigger owns it: set the first time the row is published (inserted published, or switched
--      to published), kept through an unpublish and a republish, and never taken from a writer. So a
--      program first published in September does not count as new in December because it was
--      switched off and on again, and no client can backdate one.
--   3. The backfill: nothing recorded when a published row was published, and a row is published
--      when it is created unless the coach saves it as a draft (the route's default), so its
--      creation date stands in. A row that is not published now gets none.
--
-- Until this runs, the goal route counts published plans by their creation date and says so.
-- One transaction. Idempotent, safe to re-run.

begin;

alter table public.coach_plans add column if not exists published_at timestamptz;
alter table public.coach_program_templates add column if not exists published_at timestamptz;

-- The backfill runs with no trigger on either table: each table's touch trigger would mark every
-- published row as edited just now, and on a re-run the new trigger below would date it today.
-- (The two touch triggers are 2026-06-13-coach-plans.sql's and 2026-05-08-coach-program-tools.sql's.)
drop trigger if exists coach_plans_published_at on public.coach_plans;
drop trigger if exists coach_program_templates_published_at on public.coach_program_templates;
alter table public.coach_plans disable trigger coach_plans_touch;
alter table public.coach_program_templates disable trigger coach_program_templates_touch_updated_at;

update public.coach_plans set published_at = created_at
where published and published_at is null;
update public.coach_program_templates set published_at = created_at
where status = 'published' and published_at is null;

alter table public.coach_plans enable trigger coach_plans_touch;
alter table public.coach_program_templates enable trigger coach_program_templates_touch_updated_at;

create or replace function public.coach_plans_stamp_published()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.published_at := case when new.published then now() else null end;
  else
    new.published_at := old.published_at;
    if new.published and old.published_at is null then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists coach_plans_published_at on public.coach_plans;
create trigger coach_plans_published_at
  before insert or update on public.coach_plans
  for each row execute function public.coach_plans_stamp_published();

create or replace function public.coach_program_templates_stamp_published()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.published_at := case when new.status = 'published' then now() else null end;
  else
    new.published_at := old.published_at;
    if new.status = 'published' and old.published_at is null then
      new.published_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists coach_program_templates_published_at on public.coach_program_templates;
create trigger coach_program_templates_published_at
  before insert or update on public.coach_program_templates
  for each row execute function public.coach_program_templates_stamp_published();

create index if not exists coach_plans_owner_published_idx
  on public.coach_plans (owner_id, kind, published_at)
  where published_at is not null;

-- Guard: raise on anything that did not land.
do $guard$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'coach_plans' and column_name = 'published_at') then
    raise exception 'coach_plans.published_at is missing';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'coach_program_templates' and column_name = 'published_at') then
    raise exception 'coach_program_templates.published_at is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'coach_plans_published_at' and tgrelid = 'public.coach_plans'::regclass and not tgisinternal) then
    raise exception 'coach_plans has no published_at trigger';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'coach_program_templates_published_at' and tgrelid = 'public.coach_program_templates'::regclass and not tgisinternal) then
    raise exception 'coach_program_templates has no published_at trigger';
  end if;
  if exists (select 1 from public.coach_plans where published and published_at is null) then
    raise exception 'a published coach plan has no published_at after the backfill';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.coach_plans'::regclass and tgname = 'coach_plans_touch' and tgenabled = 'D')
     or exists (select 1 from pg_trigger where tgrelid = 'public.coach_program_templates'::regclass and tgname = 'coach_program_templates_touch_updated_at' and tgenabled = 'D') then
    raise exception 'a touch trigger was left disabled';
  end if;
end
$guard$;

commit;
