-- Shape Score ledger.
-- One row per points-earning event (or deduction). The ClientScore page
-- aggregates the current month by category to render the breakdown,
-- progress bar, and recent-points ledger.
--
-- Categories match the breakdown rows on ClientScore.html so the page
-- can ship without further translation:
--   workouts | adherence | habits | prs | community | endorsements
--   | radio | referrals | other

create table if not exists public.score_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in (
    'workouts','adherence','habits','prs','community',
    'endorsements','radio','referrals','other'
  )),
  source_kind text,    -- e.g. 'habit_toggle','workout_log','plan_day'
  source_id uuid,      -- pointer to originating row (habit_id, workout_id, …)
  delta integer not null,
  note text,
  earned_at timestamptz not null default now()
);

create index if not exists score_ledger_user_earned_idx
  on public.score_ledger (user_id, earned_at desc);
create index if not exists score_ledger_user_cat_earned_idx
  on public.score_ledger (user_id, category, earned_at desc);

-- Prevent double-credit when a single source event posts twice.
create unique index if not exists score_ledger_dedupe_idx
  on public.score_ledger (user_id, source_kind, source_id)
  where source_kind is not null and source_id is not null;

alter table public.score_ledger enable row level security;

drop policy if exists "score_ledger readable by owner" on public.score_ledger;
create policy "score_ledger readable by owner" on public.score_ledger
  for select using (auth.uid() = user_id);

drop policy if exists "score_ledger insertable by owner" on public.score_ledger;
create policy "score_ledger insertable by owner" on public.score_ledger
  for insert with check (auth.uid() = user_id);

drop policy if exists "score_ledger deletable by owner" on public.score_ledger;
create policy "score_ledger deletable by owner" on public.score_ledger
  for delete using (auth.uid() = user_id);
