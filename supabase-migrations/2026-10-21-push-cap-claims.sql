-- The daily push cap, claimed in the database before a push is sent.
--
-- Owner, 2026-10-21: "yes build the cap reservation". notification_settings.daily_cap is the
-- person's one daily limit on pushes (#2417): every notice stamped as pushed on their own day
-- (data.channels.push) counts. Two senders hold to it, the AI notify engine (/api/ai/notify and its
-- cron) and the friends' habits cron (/api/cron/habit-watch). Each read the day's count and then
-- sent, so two of them deciding in the same minute (every hourly cron starts at :00) could each
-- take the last place and pass the cap by one.
--
-- claim_push_slots is where a sender takes its places now. It holds a lock per person for the rest
-- of its transaction, counts the day's pushed notices plus the places other senders hold but have
-- not used yet, and grants at most what is left. The sender sends what it was granted, then deletes
-- its claim: once its notices have landed they count themselves. A claim left by a sender that died
-- lapses after five minutes, so it can hold back a push for those minutes and never for longer.
--
-- Until this runs, the senders count as before (a claim that can't be made sends on the day's count
-- as read). Idempotent, safe to re-run.

create table if not exists public.push_cap_claims (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  slots      int not null check (slots > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists push_cap_claims_user_idx on public.push_cap_claims (user_id, expires_at);

-- Only the service role reads or writes it (it bypasses RLS). With RLS on and no policy, a member's
-- or a visitor's request is refused, and the grants say the same.
alter table public.push_cap_claims enable row level security;
revoke all on public.push_cap_claims from public, anon, authenticated;
grant select, insert, delete on public.push_cap_claims to service_role;

-- Grants up to p_want of the person's places under p_cap on their date today in p_tz, and returns
-- the claim to delete once the notices have landed (null when nothing was granted).
-- ⚠ THE LOCK IS WHAT MAKES IT A RESERVATION. Two claims for one person run one after the other:
-- the second waits for the first to commit, then counts with the first's claim in it. Without it,
-- both would count the same rows and each grant the last place.
-- ⚠ THE DAY IS THE PERSON'S OWN, as the senders read it: the zone they pass (the profile's, then
-- the notification settings', notify-core.ts and habit-watch), counted over the last 30 hours as
-- loadPushedToday does. A zone Postgres can't read is UTC, which is the senders' own fallback.
create or replace function public.claim_push_slots(p_user uuid, p_tz text, p_cap int, p_want int)
returns table (claim_id uuid, granted int)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_tz text := coalesce(nullif(btrim(p_tz), ''), 'UTC');
  v_today date;
  v_used bigint;
  v_held bigint;
  v_granted int;
  v_id uuid;
begin
  if p_user is null or coalesce(p_want, 0) < 1 or coalesce(p_cap, 0) < 1 then
    return query select null::uuid, 0;
    return;
  end if;
  begin
    v_today := (now() at time zone v_tz)::date;
  exception when others then
    v_tz := 'UTC';
    v_today := (now() at time zone 'UTC')::date;
  end;

  perform pg_advisory_xact_lock(hashtextextended('shape.push_cap:' || p_user::text, 0));

  delete from public.push_cap_claims c where c.user_id = p_user and c.expires_at <= now();
  select count(*) into v_used
  from public.notifications n
  where n.user_id = p_user
    and n.created_at >= now() - interval '30 hours'
    and n.data -> 'channels' ->> 'push' = 'true'
    and (n.created_at at time zone v_tz)::date = v_today;
  select coalesce(sum(c.slots), 0) into v_held
  from public.push_cap_claims c
  where c.user_id = p_user;

  v_granted := greatest(0, least(p_want::bigint, p_cap::bigint - v_used - v_held))::int;
  if v_granted > 0 then
    insert into public.push_cap_claims (user_id, slots, expires_at)
    values (p_user, v_granted, now() + interval '5 minutes')
    returning id into v_id;
  end if;
  return query select v_id, v_granted;
end;
$$;
revoke all on function public.claim_push_slots(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.claim_push_slots(uuid, text, int, int) to service_role;

comment on table public.push_cap_claims is
  'Places under a person''s daily push cap that a sender holds while it sends (claim_push_slots). Deleted once the notices land; lapse after 5 minutes.';
