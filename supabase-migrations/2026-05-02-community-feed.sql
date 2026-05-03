-- Community workout feed: posts, likes, comments, privacy, route/metric payloads.
-- Shared by website and mobile app. Idempotent, safe to re-run.

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users on delete set null,
  author_name text not null default 'Shape member',
  author_role text not null default 'client'
    check (author_role in ('client','trainer','nutritionist','member')),
  privacy text not null default 'community'
    check (privacy in ('public','community','private')),
  activity_type text not null default 'workout',
  title text not null,
  status text,
  note text,
  metrics jsonb not null default '{}'::jsonb,
  route jsonb not null default '{}'::jsonb,
  source_provider text,
  source_activity_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists community_posts_created_idx
  on public.community_posts (created_at desc);
create index if not exists community_posts_author_idx
  on public.community_posts (author_id, created_at desc);
create unique index if not exists community_posts_source_unique_idx
  on public.community_posts (source_provider, source_activity_id)
  where source_provider is not null and source_activity_id is not null;

create table if not exists public.community_likes (
  post_id uuid not null references public.community_posts on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists community_likes_user_idx
  on public.community_likes (user_id, created_at desc);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts on delete cascade,
  user_id uuid references auth.users on delete set null,
  author_name text not null default 'Shape member',
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists community_comments_post_idx
  on public.community_comments (post_id, created_at asc);

alter table public.community_posts enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_comments enable row level security;

create or replace function public.can_view_community_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_posts p
    where p.id = p_post_id
      and (
        p.privacy = 'public'
        or (p.privacy = 'community' and auth.uid() is not null)
        or p.author_id = auth.uid()
      )
  );
$$;

drop policy if exists "read visible community posts" on public.community_posts;
create policy "read visible community posts"
  on public.community_posts for select
  to anon, authenticated
  using (
    privacy = 'public'
    or (privacy = 'community' and auth.uid() is not null)
    or author_id = auth.uid()
  );

drop policy if exists "users create own community posts" on public.community_posts;
create policy "users create own community posts"
  on public.community_posts for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "users update own community posts" on public.community_posts;
create policy "users update own community posts"
  on public.community_posts for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "users delete own community posts" on public.community_posts;
create policy "users delete own community posts"
  on public.community_posts for delete
  to authenticated
  using (author_id = auth.uid());

drop policy if exists "read visible community likes" on public.community_likes;
create policy "read visible community likes"
  on public.community_likes for select
  to anon, authenticated
  using (public.can_view_community_post(post_id));

drop policy if exists "users like visible community posts" on public.community_likes;
create policy "users like visible community posts"
  on public.community_likes for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_view_community_post(post_id));

drop policy if exists "users unlike own community likes" on public.community_likes;
create policy "users unlike own community likes"
  on public.community_likes for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "read visible community comments" on public.community_comments;
create policy "read visible community comments"
  on public.community_comments for select
  to anon, authenticated
  using (public.can_view_community_post(post_id));

drop policy if exists "users comment on visible community posts" on public.community_comments;
create policy "users comment on visible community posts"
  on public.community_comments for insert
  to authenticated
  with check (user_id = auth.uid() and public.can_view_community_post(post_id));

drop policy if exists "users delete own community comments" on public.community_comments;
create policy "users delete own community comments"
  on public.community_comments for delete
  to authenticated
  using (user_id = auth.uid());

create or replace function public.community_posts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists community_posts_touch_updated_at on public.community_posts;
create trigger community_posts_touch_updated_at
  before update on public.community_posts
  for each row execute function public.community_posts_set_updated_at();
