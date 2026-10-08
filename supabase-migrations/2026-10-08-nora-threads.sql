-- One conversation with Nora per account (2026-10-08, the Ask Nora plan, step 4: "One
-- conversation on the website and the app; pick up where you left off; Clear button;
-- listed in Settings").
--
-- Before this, the website kept a signed-in account's thread in that browser only, and the
-- app forgot it when it closed. One row per account now holds the last messages, so a
-- conversation started on a laptop continues on the phone. A visitor's thread stays in the
-- browser; nothing here is written without a session.
--
-- Read and written only by /api/nora/thread, through the caller's own session, so the RLS
-- below holds every account to its own row. The route keeps the last 40 messages, each
-- { role: 'user' | 'assistant', text (<= 4000 characters), at }. Confirm cards are never
-- stored: their signed tokens expire, and a stored one could not be confirmed.
--
-- ===== WHY A DELETE POLICY =====
-- Clear (in the panel, and in Settings → What Nora remembers) removes the row outright,
-- rather than writing an empty one. An account deletion takes the row with it (cascade).
--
-- Until this runs, /api/nora/thread answers 503 and both surfaces keep the thread locally
-- as before. Idempotent, safe to re-run.

create table if not exists public.nora_threads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  -- The route trims to 40 messages of 4000 characters; this is the backstop, with room.
  constraint nora_threads_messages_array check (jsonb_typeof(messages) = 'array'),
  constraint nora_threads_messages_bounded check (jsonb_array_length(messages) <= 60 and pg_column_size(messages) <= 262144)
);

alter table public.nora_threads enable row level security;

drop policy if exists "nora thread: read own" on public.nora_threads;
create policy "nora thread: read own"
  on public.nora_threads for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "nora thread: create own" on public.nora_threads;
create policy "nora thread: create own"
  on public.nora_threads for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "nora thread: save own" on public.nora_threads;
create policy "nora thread: save own"
  on public.nora_threads for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "nora thread: clear own" on public.nora_threads;
create policy "nora thread: clear own"
  on public.nora_threads for delete
  to authenticated
  using (user_id = auth.uid());
