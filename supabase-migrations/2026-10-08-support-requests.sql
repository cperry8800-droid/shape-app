-- "Talk to a person" (2026-10-08, the Ask Nora plan, step 5: '"Talk to a person" with a real
-- inbox, replies in the same thread').
--
-- One row per question a signed-in account sends the Shape team from Nora's chat, on the
-- website or in the app:
--   POST /api/support/request          — the account, through its own session, so RLS below
--                                        holds it to inserting its own open row; the route
--                                        also emails the team inbox;
--   /dashboard/support (the console)   — an admin reads the open rows and replies, with the
--                                        service role; the reply is written here and into
--                                        the account's Nora conversation (nora_threads) as a
--                                        message from the Shape team, and emailed to them.
--
-- ===== WHAT THE ACCOUNT CAN DO =====
-- Read its own rows and insert an OPEN one, with no reply in it. It cannot answer, close or
-- delete a row: there is no update or delete policy, so only the service role can.
--
-- ===== THE TRANSCRIPT =====
-- The last messages of their Nora conversation when they sent it, read by the route from
-- nora_threads (never from the request), so the team sees what Nora already said.
--
-- Until this runs, the button answers "isn't set up yet" and Nora gives the email address.
-- Idempotent, safe to re-run.

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 2000),
  transcript jsonb not null default '[]'::jsonb
    check (jsonb_typeof(transcript) = 'array' and jsonb_array_length(transcript) <= 20),
  surface text not null default 'web' check (surface in ('web', 'app')),
  page text check (page is null or char_length(page) <= 80),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  reply text check (reply is null or char_length(reply) between 1 and 4000),
  replied_by_email text,
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists support_requests_open_idx on public.support_requests (status, created_at desc);
create index if not exists support_requests_user_idx on public.support_requests (user_id, created_at desc);

alter table public.support_requests enable row level security;

drop policy if exists "support request: read own" on public.support_requests;
create policy "support request: read own"
  on public.support_requests for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "support request: send own" on public.support_requests;
create policy "support request: send own"
  on public.support_requests for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and status = 'open'
    and reply is null and replied_by_email is null and replied_at is null
  );
