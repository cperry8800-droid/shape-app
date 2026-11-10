-- Shape HQ's unread badge (Codex P2 on #2676). Idempotent, safe to re-run. One transaction.
--
-- Shape HQ has no members: it is read, not joined (2026-11-10-channel-pictures-and-shape-hq.sql), and
-- both apps open it without a Join. But a channel's unread count and its read mark live on the
-- member's own channel_members row, so a new announcement badged nobody, and opening HQ marked
-- nothing read. For a channel only Shape posts in (official and read-only):
-- 1. channel_unread() counts, for a member with no row there, what Shape posted there after their
--    account was made. Everyone already on Shape sees the welcome as one unread.
-- 2. mark_channel_read() makes the reader's row the first time they open it (role 'member', read
--    now), and from then on HQ counts like any channel they are in.
-- Every other channel is counted and marked exactly as before.

begin;

create or replace function public.channel_unread()
returns table(channel_id uuid, unread bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.channel_id, count(*)::bigint
  from public.channel_messages m
  join public.channel_members cm on cm.channel_id = m.channel_id and cm.user_id = auth.uid()
  where m.sender_id is distinct from auth.uid()
    and (cm.last_read_at is null or m.created_at > cm.last_read_at)
  group by m.channel_id
  union all
  select m.channel_id, count(*)::bigint
  from public.channel_messages m
  join public.channels c on c.id = m.channel_id and c.official and c.read_only
  where auth.uid() is not null
    and m.sender_id is distinct from auth.uid()
    and not exists (
      select 1 from public.channel_members cm where cm.channel_id = m.channel_id and cm.user_id = auth.uid()
    )
    and m.created_at > coalesce((select u.created_at from auth.users u where u.id = auth.uid()), '-infinity'::timestamptz)
  group by m.channel_id;
$$;

create or replace function public.mark_channel_read(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return; end if;
  update public.channel_members set last_read_at = now()
  where channel_id = p_channel_id and user_id = auth.uid();
  if not found and exists (
    select 1 from public.channels c where c.id = p_channel_id and c.official and c.read_only
  ) then
    insert into public.channel_members (channel_id, user_id, role, last_read_at)
    values (p_channel_id, auth.uid(), 'member', now())
    on conflict (channel_id, user_id) do update set last_read_at = excluded.last_read_at;
  end if;
end;
$$;

-- Grants are kept as they are (create or replace leaves them): both answer nothing without a member.

commit;
