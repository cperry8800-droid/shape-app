-- A name or location edited in Edit profile reaches every page (owner, 2026-11-11: "make sure these edits
-- and changes actually work", then, of the name reaching the public page and the marketplace card, "yes
-- write the migration").
--
-- The name, handle, location and pronouns a member edits (the website's Edit profile → About → You, the
-- app's Settings → Edit profile) live in their client_identity document (user_goals). Three readers did not
-- follow it:
--   · get_public_profile, every profile card and the coach's public page, returns profiles.full_name;
--   · the marketplace card reads the listing's own name (trainers.name / nutritionists.name);
--   · nobody else could see the location: the card returned none, so it showed to its owner alone.
-- Nothing copied the identity's name to profiles.full_name or to a listing, so a renamed coach kept the
-- old name on their page for everyone else and on the marketplace.
--
--   1. shape_sync_identity_name: when a client_identity document is written with a new name (1 to 80
--      characters once trimmed), the same account's profiles.full_name and its trainer and nutritionist
--      listings take it. Only on a change of name: a photo or pronoun save leaves them alone. It runs as
--      the writer (security invoker): a member may already update their own profile row and listings
--      (the "users update own profile" and "... update own row" policies, and name is not an admin
--      column), so it grants nothing; every update is held to new.user_id.
--   2. get_public_profile returns location: the identity's, trimmed, under the same can_view rule as
--      pronouns (a locked card has none). The returned table gains a column, which create or replace
--      cannot do, so the function is dropped and made again, with its grant (authenticated; anon keeps
--      reaching it through the default ACL, as the allow-list records) in the same transaction. The rest
--      of the body is the live one (2026-10-12-shape-score-fixes.sql), unchanged.
--   3. Backfill: a profile whose identity names it differently takes the identity's name (none on
--      2026-11-11), and an owned listing whose name differs from its owner's profile takes the owner's
--      name. On 2026-11-11 that is one account's two listings, "Marcus Johnson" (trainer) and
--      "Dr. Sarah Mitchell" (nutritionist), which become that account's name, as its page already reads.
--
-- Callers: public/newdesign/livingProfilePage.jsx (row.location → the page's city; the coach page's
-- `where`), mobile-app's public profile reads, marketplace.jsx (the listing's name).
--
-- Re-runnable: create or replace, drop if exists, and updates that change only what differs.

begin;

-- 1. A new name in the identity document is the account's name everywhere.
create or replace function public.shape_sync_identity_name()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n text;
begin
  if new.kind <> 'client_identity' then return new; end if;
  n := btrim(coalesce(new.data->>'name', ''));
  if n = '' or char_length(n) > 80 then return new; end if;
  if tg_op = 'UPDATE' and btrim(coalesce(old.data->>'name', '')) = n then return new; end if;
  update public.profiles set full_name = n where id = new.user_id and full_name is distinct from n;
  update public.trainers set name = n where owner_id = new.user_id and name is distinct from n;
  update public.nutritionists set name = n where owner_id = new.user_id and name is distinct from n;
  return new;
end;
$$;

drop trigger if exists shape_sync_identity_name on public.user_goals;
create trigger shape_sync_identity_name
  after insert or update of data on public.user_goals
  for each row when (new.kind = 'client_identity')
  execute function public.shape_sync_identity_name();

-- 2. The card returns the location its owner wrote, to whoever may see the card's details.
drop function if exists public.get_public_profile(uuid);

create function public.get_public_profile(p_user_id uuid)
returns table(user_id uuid, full_name text, role text, points bigint, bio text, pronouns text, goal text, link text, avatar text, is_public boolean, visibility text, can_view boolean, custom jsonb, username text, location text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with pts as (
    -- The rank basis (shape_rank_points): a card's tier is the tier its owner sees.
    -- It summed every row, so a Store purchase dropped a member a tier for others.
    select public.shape_rank_points(p_user_id) as points
  ),
  ident as (
    select g.data as d
    from public.user_goals g
    where g.user_id = p_user_id and g.kind = 'client_identity'
    limit 1
  ),
  cust as (
    select g.data as d
    from public.user_goals g
    where g.user_id = p_user_id and g.kind = 'profile_custom'
    limit 1
  ),
  visraw as (
    select coalesce(g.data->>'profileVisibility', 'Public') as v
    from public.user_goals g
    where g.user_id = p_user_id and g.kind = 'client_settings'
    limit 1
  ),
  vis as (
    select case
      when lower(coalesce((select v from visraw), 'public')) like 'pub%' then 'public'
      when lower(coalesce((select v from visraw), 'public')) like '%friend%'
        or lower(coalesce((select v from visraw), 'public')) like '%circle%' then 'friends'
      else 'private'
    end as norm
  ),
  fr as (
    select exists (
      select 1
      from public.conversation_participants me
      join public.conversation_participants them
        on them.conversation_id = me.conversation_id
      join public.conversations c on c.id = me.conversation_id
      where me.user_id = auth.uid()
        and them.user_id = p_user_id
        and c.dm_key is not null
    ) as is_friend
  ),
  acc as (
    select
      (select norm from vis) as norm,
      ((select norm from vis) = 'public')
        or (auth.uid() = p_user_id)
        or ((select norm from vis) = 'friends' and (select is_friend from fr))
        as can_view
  )
  select
    p.id,
    coalesce(p.full_name, 'Shape member'),
    p.role,
    (select points from pts),
    case when (select can_view from acc) then (select d->>'bio' from ident) end,
    case when (select can_view from acc) then (select d->>'pronouns' from ident) end,
    case when (select can_view from acc) then (select d->>'goal' from ident) end,
    case when (select can_view from acc) then (select d->>'link' from ident) end,
    (select d->>'photo' from ident),   -- avatar: returned for every card a caller may see
    ((select norm from vis) = 'public'),
    (select norm from acc),
    (select can_view from acc),
    case when (select can_view from acc) then (select d from cust) end,
    p.username,
    case when (select can_view from acc) then nullif(btrim((select d->>'location' from ident)), '') end
  from public.profiles p
  where p.id = p_user_id
    -- L17: a private profile is not a card for a caller with no account.
    and not (auth.uid() is null and (select norm from vis) = 'private');
$$;

grant execute on function public.get_public_profile(uuid) to authenticated;

-- 3. Backfill: profiles to their identity's name, then owned listings to their owner's name.
update public.profiles p
   set full_name = btrim(g.data->>'name')
  from public.user_goals g
 where g.user_id = p.id
   and g.kind = 'client_identity'
   and btrim(coalesce(g.data->>'name', '')) <> ''
   and char_length(btrim(g.data->>'name')) <= 80
   and p.full_name is distinct from btrim(g.data->>'name');

update public.trainers t
   set name = p.full_name
  from public.profiles p
 where p.id = t.owner_id
   and btrim(coalesce(p.full_name, '')) <> ''
   and t.name is distinct from p.full_name;

update public.nutritionists t
   set name = p.full_name
  from public.profiles p
 where p.id = t.owner_id
   and btrim(coalesce(p.full_name, '')) <> ''
   and t.name is distinct from p.full_name;

commit;
