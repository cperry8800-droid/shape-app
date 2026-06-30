-- Defense-in-depth for member_playlists.url — the URL is user-supplied and is
-- rendered into an anchor href on the profile Music tab (web) + opened on mobile.
-- The web renderer now scheme-sanitizes (http(s) + Spotify/Apple hosts only), but a
-- crafted direct insert could still store a javascript:/data: URL. This CHECK rejects
-- any non-http(s) scheme at the DB for ALL writers (web + mobile), regardless of
-- client-side validation.
--
-- Added NOT VALID so it enforces on every new INSERT/UPDATE without scanning (or
-- failing on) pre-existing rows. Idempotent.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'member_playlists_url_scheme'
      and conrelid = 'public.member_playlists'::regclass
  ) then
    alter table public.member_playlists
      add constraint member_playlists_url_scheme
      check (url is null or url ~* '^https?://') not valid;
  end if;
end $$;
