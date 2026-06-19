-- supabase-migrations/2026-06-19-radio-station.sql
-- Shape Radio station config — a single public-read row holding the licensed
-- provider's stream URL + now-playing endpoint. Writes are service-role only
-- (the future admin Studio). Idempotent.

create table if not exists public.radio_station (
  id int primary key default 1,
  provider text not null default 'mock',         -- 'mock' | 'http'
  station_name text not null default 'Shape Radio',
  stream_url text,                               -- the licensed provider's listen URL
  now_playing_url text,                          -- the provider's public now-playing JSON
  updated_at timestamptz not null default now(),
  constraint radio_station_singleton check (id = 1)
);
alter table public.radio_station enable row level security;
-- Public read: the player needs the stream URL. No write policy → writes are
-- service-role only (RLS denies anon/authenticated writes).
drop policy if exists "radio_station_read" on public.radio_station;
create policy "radio_station_read" on public.radio_station for select
  to anon, authenticated using (true);

insert into public.radio_station (id, provider, station_name)
values (1, 'mock', 'Shape Radio')
on conflict (id) do nothing;
