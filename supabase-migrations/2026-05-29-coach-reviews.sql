-- Coach reviews: 1–10 star rating + optional written review for a trainer or
-- nutritionist (keyed by profile slug). Shared by the website public profile
-- pages and the mobile marketplace. Public read; authenticated users create
-- their own. Idempotent, safe to re-run.

create table if not exists public.coach_reviews (
  id uuid primary key default gen_random_uuid(),
  coach_slug text not null,
  coach_kind text not null default 'trainer'
    check (coach_kind in ('trainer','nutritionist')),
  user_id uuid references auth.users on delete set null,
  author_name text not null default 'Shape member',
  rating int not null check (rating between 1 and 10),
  body text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists coach_reviews_slug_idx
  on public.coach_reviews (coach_slug, created_at desc);
create index if not exists coach_reviews_user_idx
  on public.coach_reviews (user_id, created_at desc);

alter table public.coach_reviews enable row level security;

drop policy if exists "read coach reviews" on public.coach_reviews;
create policy "read coach reviews"
  on public.coach_reviews for select
  to anon, authenticated
  using (true);

drop policy if exists "create own coach reviews" on public.coach_reviews;
create policy "create own coach reviews"
  on public.coach_reviews for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "delete own coach reviews" on public.coach_reviews;
create policy "delete own coach reviews"
  on public.coach_reviews for delete
  to authenticated
  using (user_id = auth.uid());
