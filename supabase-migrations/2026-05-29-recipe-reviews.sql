-- Recipe reviews: star rating + optional written review per recipe slug.
-- Shared by the website (/recipes/<slug>) and the mobile app (Shape Kitchen).
-- Public read; authenticated users create their own. Idempotent, safe to re-run.

create table if not exists public.recipe_reviews (
  id uuid primary key default gen_random_uuid(),
  recipe_slug text not null,
  user_id uuid references auth.users on delete set null,
  author_name text not null default 'Shape member',
  rating int not null check (rating between 1 and 5),
  body text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists recipe_reviews_slug_idx
  on public.recipe_reviews (recipe_slug, created_at desc);
create index if not exists recipe_reviews_user_idx
  on public.recipe_reviews (user_id, created_at desc);

alter table public.recipe_reviews enable row level security;

-- Anyone (signed-out included) can read reviews.
drop policy if exists "read recipe reviews" on public.recipe_reviews;
create policy "read recipe reviews"
  on public.recipe_reviews for select
  to anon, authenticated
  using (true);

-- Authenticated users create reviews attributed to themselves.
drop policy if exists "create own recipe reviews" on public.recipe_reviews;
create policy "create own recipe reviews"
  on public.recipe_reviews for insert
  to authenticated
  with check (user_id = auth.uid());

-- Users can remove their own reviews.
drop policy if exists "delete own recipe reviews" on public.recipe_reviews;
create policy "delete own recipe reviews"
  on public.recipe_reviews for delete
  to authenticated
  using (user_id = auth.uid());
