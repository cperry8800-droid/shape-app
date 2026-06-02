-- Enable Supabase realtime streaming for channel + direct messages so new
-- messages can appear live (open thread) and drive unread badges on the
-- channel / friends lists. Idempotent.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channel_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.channel_messages';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end $$;
