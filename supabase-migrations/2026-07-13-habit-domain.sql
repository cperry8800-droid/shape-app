-- The work domain — PR A (spec docs/superpowers/specs/2026-07-13-work-domain-design.md).
-- Adds an optional life-domain stamp to user_habits so work habits are
-- distinguishable data (the CROSSOVER insights read this; the habit itself
-- earns the same +3 as any other habit — no scoring change here).
--
-- Additive + idempotent. Code degrades cleanly pre-migration (the create
-- route retries without the column; reads use select('*')).

alter table public.user_habits
  add column if not exists domain text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_habits_domain_check'
      and conrelid = 'public.user_habits'::regclass
  ) then
    alter table public.user_habits
      add constraint user_habits_domain_check
      check (domain is null or domain in ('work'));
  end if;
end $$;
