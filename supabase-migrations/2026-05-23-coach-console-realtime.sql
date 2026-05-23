-- 2026-05-23 — Enable Supabase Realtime on the Coach Console feed tables
-- so a client's app updates instantly when their coach hits Send / Add,
-- without polling or pull-to-refresh.
--
-- RLS still gates which rows a client can receive — the
-- coach_focus_banners_client_read / coach_pushed_items_client_read policies
-- from 2026-05-22-coach-console.sql ensure they only see their own rows
-- (client_id = auth.uid()::text).
--
-- Idempotent.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'coach_focus_banners'
  ) then
    alter publication supabase_realtime add table public.coach_focus_banners;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'coach_pushed_items'
  ) then
    alter publication supabase_realtime add table public.coach_pushed_items;
  end if;
end $$;
