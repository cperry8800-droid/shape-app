-- Coach-only live channel (spec 2026-07-19, owner-ratified): loads/reps/RPE
-- for the client's ACTIVE COACH only — it changes WHEN the coach reads what
-- the session log will already tell them, not WHAT. A separate table because
-- RLS is row-level, not column-level (the v1 lesson: a jsonb column on
-- user_activity_live would have leaked set data to every authenticated reader
-- of that row, and to every realtime subscriber of it). No visibility column:
-- the audience is structural — the coach link IS the permission, so there is
-- nothing for a member to mis-set. 30-MINUTE rolling expiry (the writer
-- refreshes on every push) so a crashed session's loads — or a row visible to
-- a since-revoked coach — dies fast. Payload bounded at the write boundary by
-- SIZE only; the content contract is enforced by the one shared validator on
-- read (a SQL twin would be exactly the drift the one-module rule prevents).
-- Idempotent — safe to re-run.

create table if not exists public.user_activity_live_coach (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb not null check (pg_column_size(payload) <= 8192),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes'
);

alter table public.user_activity_live_coach enable row level security;

-- Owner: full CRUD — spelled out because the SECURITY INVOKER live_clear()
-- rides this policy's DELETE leg.
drop policy if exists "live coach owner all" on public.user_activity_live_coach;
create policy "live coach owner all" on public.user_activity_live_coach
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Coach read: the active coach↔client subscription IS the permission
-- (the get_client_lifts house rule). Expiry gates the read path directly —
-- a stale row is unreadable to the coach even before cleanup. SELECT only:
-- a coach can never write to a member's live row.
drop policy if exists "live coach read" on public.user_activity_live_coach;
create policy "live coach read" on public.user_activity_live_coach
  for select to authenticated using (
    user_id = auth.uid()
    or (expires_at > now() and public.is_coach_on_client(user_id))
  );

-- One transactional clear for BOTH live rows: session end can never strand a
-- coach row behind a deleted public one. INVOKER — owner RLS is the scope.
-- The data-modifying CTE is executed exactly once and to completion whether or
-- not the outer query reads its output, so both deletes share one snapshot.
create or replace function public.live_clear()
returns void language sql security invoker set search_path = public, pg_temp as $$
  with a as (delete from public.user_activity_live where user_id = auth.uid())
  delete from public.user_activity_live_coach where user_id = auth.uid();
$$;
revoke all on function public.live_clear() from public, anon;
grant execute on function public.live_clear() to authenticated;

-- Expired-row hygiene: rows are PK-bounded (ONE per user, upserted over by the
-- next session and deleted by live_clear on every clean end), so an orphan is
-- at most one ≤8KB unreadable row per user — no scheduled job is warranted.
-- The index makes any future sweep (and the expiry-gated read policy) cheap.
create index if not exists user_activity_live_coach_expires_idx
  on public.user_activity_live_coach (expires_at);

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_activity_live_coach'
  ) then
    alter publication supabase_realtime add table public.user_activity_live_coach;
  end if;
end $$;
