-- Shape Radio song social: shared like/dislike + comments on the now-playing track.
--
-- A "song" has NO stable id — the now-playing payload is title+artist strings only
-- (src/lib/radio/provider.ts NowPlaying = {title, artist, isNora}). So the key is a
-- normalized `title::artist` composite the client already derives
-- (makeRadioTrackKey in iosAppBroadsheetRadio.jsx). Same track replayed keeps its
-- tally; a live metadata title change forks it — acceptable for a radio surface,
-- where you're reacting to THE TRACK. There was already a device-only version of
-- this in localStorage; this promotes it to a shared backend so counts are visible.
--
-- ⚠ HONESTY: reactions are meaningful only when a real track plays. Today the
-- station is a mock provider (2026-06-19-radio-station.sql seeds provider='mock',
-- no stream), so now-playing is a placeholder and counts would accrue on the demo
-- string. The mechanism is built ahead of the stream (the Nora Sets pattern): the
-- moment a real http provider streams real titles, this exact code lights up on
-- real songs with zero change, because the key derives from whatever title+artist
-- the provider returns.
--
-- Reads are PUBLIC — anyone (signed out included) sees the up/down counts and the
-- comments, because radio is a public-facing surface. Writes require sign-in
-- (auth.uid(), enforced in the RPCs), mirroring community_likes/comments; the radio
-- player is already member-gated in-app, so members are the effective writers.
--
-- Writes are RPC-ONLY by construction: the tables carry a SELECT policy and nothing
-- else, so a member can read but can neither forge a vote nor a comment directly —
-- the SECURITY DEFINER RPCs own the toggle semantics + resolve the author name
-- server-side (unspoofable). The #1775 cycle-settings / tier-rewards pattern.
-- Run on Supabase.

-- ── Key normalizer — one definition the write + read RPCs share, so a vote and a
-- comment on the same track can never disagree about the key. Lowercased, trimmed,
-- length-bounded; empty → null (rejected upstream).
create or replace function public.radio_norm_key(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(left(lower(trim(coalesce(p, ''))), 400), '');
$$;
grant execute on function public.radio_norm_key(text) to anon, authenticated;

create table if not exists public.radio_song_reactions (
  song_key   text not null check (char_length(song_key) between 1 and 400),
  user_id    uuid not null references auth.users(id) on delete cascade,
  vote       text not null check (vote in ('up', 'down')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (song_key, user_id)
);
create index if not exists radio_song_reactions_key_idx on public.radio_song_reactions (song_key);

create table if not exists public.radio_song_comments (
  id          uuid primary key default gen_random_uuid(),
  song_key    text not null check (char_length(song_key) between 1 and 400),
  user_id     uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists radio_song_comments_key_idx on public.radio_song_comments (song_key, created_at desc);

alter table public.radio_song_reactions enable row level security;
alter table public.radio_song_comments enable row level security;

-- Public read (radio is public-facing). NO insert/update/delete policy — every
-- write goes through a definer RPC, so a member can't forge a vote/comment.
drop policy if exists "radio reactions readable by all" on public.radio_song_reactions;
create policy "radio reactions readable by all" on public.radio_song_reactions for select using (true);
drop policy if exists "radio comments readable by all" on public.radio_song_comments;
create policy "radio comments readable by all" on public.radio_song_comments for select using (true);

-- ── Read: counts + my vote + recent comments, in one call. Anyone may call it;
-- myVote resolves off auth.uid() (null when signed out). STABLE — pure read.
create or replace function public.get_radio_song_social(p_song_key text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_key  text := public.radio_norm_key(p_song_key);
  v_up   integer;
  v_down integer;
  v_mine text;
  v_cc   integer;
  v_comm jsonb;
begin
  if v_key is null then
    return jsonb_build_object('up', 0, 'down', 0, 'myVote', null, 'commentCount', 0, 'comments', '[]'::jsonb);
  end if;

  select count(*) filter (where vote = 'up'), count(*) filter (where vote = 'down')
    into v_up, v_down
  from public.radio_song_reactions where song_key = v_key;

  if v_uid is not null then
    select vote into v_mine from public.radio_song_reactions where song_key = v_key and user_id = v_uid;
  end if;

  select count(*) into v_cc from public.radio_song_comments where song_key = v_key;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', author_name, 'body', body, 'at', created_at)), '[]'::jsonb)
    into v_comm
  from (
    select id, author_name, body, created_at
    from public.radio_song_comments
    where song_key = v_key
    order by created_at desc
    limit 40
  ) c;

  return jsonb_build_object(
    'up', coalesce(v_up, 0), 'down', coalesce(v_down, 0),
    'myVote', v_mine, 'commentCount', coalesce(v_cc, 0), 'comments', v_comm
  );
end;
$$;
grant execute on function public.get_radio_song_social(text) to anon, authenticated;

-- ── Write: set / switch / toggle-off a vote. Same vote again OR an explicit null
-- clears it. Returns the fresh social state (read-after-write in the same tx).
create or replace function public.set_radio_song_vote(p_song_key text, p_vote text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_key text := public.radio_norm_key(p_song_key);
  v_existing text;
begin
  if v_uid is null then raise exception 'auth required' using errcode = '28000'; end if;
  if v_key is null then raise exception 'bad_song_key' using errcode = '22023'; end if;
  if p_vote is not null and p_vote not in ('up', 'down') then raise exception 'bad_vote' using errcode = '22023'; end if;

  select vote into v_existing from public.radio_song_reactions where song_key = v_key and user_id = v_uid;

  if p_vote is null or v_existing = p_vote then
    delete from public.radio_song_reactions where song_key = v_key and user_id = v_uid;
  else
    insert into public.radio_song_reactions (song_key, user_id, vote)
    values (v_key, v_uid, p_vote)
    on conflict (song_key, user_id) do update set vote = excluded.vote, updated_at = now();
  end if;

  return public.get_radio_song_social(v_key);
end;
$$;
revoke execute on function public.set_radio_song_vote(text, text) from public, anon;
grant execute on function public.set_radio_song_vote(text, text) to authenticated;

-- ── Write: add a comment on the track. Author name is resolved server-side from
-- profiles (never client-supplied → unspoofable). Returns the fresh social state.
create or replace function public.add_radio_song_comment(p_song_key text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_key  text := public.radio_norm_key(p_song_key);
  v_body text := nullif(left(btrim(coalesce(p_body, '')), 500), '');
  v_name text;
begin
  if v_uid is null then raise exception 'auth required' using errcode = '28000'; end if;
  if v_key is null then raise exception 'bad_song_key' using errcode = '22023'; end if;
  if v_body is null then raise exception 'empty_comment' using errcode = '22023'; end if;

  select coalesce(nullif(btrim(full_name), ''), 'Member') into v_name
  from public.profiles where id = v_uid;
  v_name := coalesce(v_name, 'Member');

  insert into public.radio_song_comments (song_key, user_id, author_name, body)
  values (v_key, v_uid, v_name, v_body);

  return public.get_radio_song_social(v_key);
end;
$$;
revoke execute on function public.add_radio_song_comment(text, text) from public, anon;
grant execute on function public.add_radio_song_comment(text, text) to authenticated;
