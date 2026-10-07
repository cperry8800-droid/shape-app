-- A coach's private calendar feed link (2026-10-07, owner-approved coach-tools plan, Schedule
-- "Connect": "A private link that Google, Apple and Outlook can subscribe to, read-only.").
--
-- One row per account: the random token in the link
--   https://theshapecommunity.com/api/calendar/feed/<token>.ics
-- that a calendar app fetches with no session. Read and written by:
--   GET/POST /api/calendar/feed-token  — the coach, through their own session, so RLS below
--                                        holds them to their own row;
--   GET /api/calendar/feed/<token>     — the calendar app; looked up with the service role,
--                                        because there is no caller to ask.
--
-- ===== THE TOKEN IS THE CREDENTIAL =====
-- 32 random bytes, base64url (43 characters), made by the route. The check below refuses
-- anything shorter or outside that alphabet, so an account writing its own row through the
-- API cannot give itself a guessable link. Resetting the link (POST { rotate: true }) writes
-- a new token over the old one, and the old URL answers 404 from that moment.
--
-- ===== WHY THERE IS NO DELETE POLICY =====
-- The coach never removes the row, only replaces the token in it; an account deletion takes
-- it with it (on delete cascade).
--
-- Until this runs, the Settings card says "Calendar feed isn't set up yet" and every feed URL
-- answers 404. Idempotent, safe to re-run.

create table if not exists public.calendar_feed_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null check (token ~ '^[A-Za-z0-9_-]{43,128}$'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

-- The feed looks a link up by its token, and two accounts can never share one.
create unique index if not exists calendar_feed_tokens_token_uidx
  on public.calendar_feed_tokens (token);

alter table public.calendar_feed_tokens enable row level security;

drop policy if exists "calendar feed token: read own" on public.calendar_feed_tokens;
create policy "calendar feed token: read own"
  on public.calendar_feed_tokens for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "calendar feed token: create own" on public.calendar_feed_tokens;
create policy "calendar feed token: create own"
  on public.calendar_feed_tokens for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "calendar feed token: reset own" on public.calendar_feed_tokens;
create policy "calendar feed token: reset own"
  on public.calendar_feed_tokens for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
