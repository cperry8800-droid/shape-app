-- A coach's energy tag per track (owner, 2026-11-05: "Store per-track energy tags (Easy / Build / Peak)").
-- Idempotent: safe to re-run.
--
-- coach_soundtracks.track_tags: { "<spotify track id>": "easy" | "build" | "peak" }, written by
-- PATCH /api/coach/soundtracks/tracks (src/lib/soundtrack-tracks.mjs mergeTags keeps only those values).
-- The table stays owner-only (coach_soundtracks' RLS); members never read it, so no policy changes.
-- Before this runs, the route reads the track list without tags and answers a tag write with 503.

alter table public.coach_soundtracks
  add column if not exists track_tags jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'coach_soundtracks_track_tags_object') then
    alter table public.coach_soundtracks
      add constraint coach_soundtracks_track_tags_object check (jsonb_typeof(track_tags) = 'object');
  end if;
end $$;

-- ── Check ──
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'coach_soundtracks' and column_name = 'track_tags') then
    raise exception 'coach_soundtracks.track_tags is missing';
  end if;
end $$;
