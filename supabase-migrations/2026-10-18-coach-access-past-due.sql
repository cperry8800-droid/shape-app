-- A client whose renewal payment is retrying keeps their coach (owner, 2026-10-18).
-- Idempotent, safe to re-run.
--
-- Owner, 2026-10-18, asked what a coach should see while Stripe retries a client's failed renewal
-- (subscription status past_due), chose "Keep full access": "They stay normal clients until Stripe
-- gives up: on the list, with logs visible, and the coach can still send them plans. Members keep
-- their membership during the retry, so coaches keep coaching."
--
-- Membership already counts past_due (membership-core.ts ACTIVE_SUB), and so do Business and the
-- dashboards (coach-trajectory.mjs OPEN_SUB_STATUSES). Every check of whether a coach and a client
-- are in a relationship stopped at active and trialing, so during the retry the coach lost the client
-- from their Clients list, RLS hid their logs (a read RLS denies comes back empty, so adherence read
-- red), and their plan writes were refused. This file widens each of those checks to
-- ('active', 'trialing', 'past_due'). Once Stripe gives up the status is canceled or unpaid, and
-- neither is in the list, so access ends then as it ends today on a cancellation. (Which one Stripe
-- writes is the account's failed-payment setting; one that leaves the subscription past due keeps it
-- past_due, and access with it, until someone cancels it.)
--
-- WIDENED (each body is the latest one in this folder, read against production on 2026-10-18 with
-- read-only queries; only the status lists change, and every header restates the function's own
-- volatility, SECURITY DEFINER and search_path):
-- - is_coach_on_client, is_discipline_coach_on_client: the access primitives. Every coach policy
--   that calls them (calendar events, check-ins, compliance, measurements, weigh-ins, progress
--   photos, programs, weekly readouts, score commitments, live activity, shared sessions, meal plan
--   and program-assign inserts, workout review notes) and is_coach_with_client follow.
-- - can_access_conversation, notify_on_new_message, get_or_create_coach_coach_conversation: a
--   care-team thread belongs to the coaches who still coach its client.
-- - get_or_create_client_conversation: a coach opens a thread with their own client.
-- - get_client_coaches, get_my_coach_playlists: the member's own list of their coaches.
-- - get_my_shared_clients: the coach's shared-clients roster (both its own clients and the
--   counterparts).
-- - get_roster_weekend_split, get_roster_weekly_adherence: the roster's stats, gated to the coach's
--   clients.
-- - member_dobs_for_viewer: the coach branch of a client's age (it mirrors the profiles policy below).
-- - publish_client_week, regenerate_client_workouts: plan writes (the routes resolve the same row).
-- - shape_member_board ('team': my coaches and their other clients) and shape_pr_wall ('coach': the
--   members who share my coach): each list defines a member's team for what they see, so it follows
--   the relationship. Both boards still show only members who opted in; nothing new is exposed.
-- - The four policies that inline the check: activities.activities_provider_read,
--   client_profiles.providers_read_subscriber_profiles,
--   daily_health_snapshot.providers_read_subscriber_snapshots and
--   profiles.providers_read_subscriber_profiles_base.
--
-- LEFT ALONE:
-- - get_coach_scores (the public directory) and shape_coach_score_parts (the coach leaderboard):
--   their status filter is a count inside a score (50 points per active subscription), not a
--   relationship, and src/app/api/coach/score/route.ts keeps the same count in step with them. Whether
--   a retrying client should earn the coach score points as Business counts them is the owner's call;
--   if so, all three change together.
-- - admin_overview_stats and get_funnel already count past_due.
--
-- PRODUCTION AGAINST THIS FOLDER (2026-10-18, md5 of each body with its line endings normalised):
-- every widened body matches its latest file here except member_dobs_for_viewer, whose production
-- body is 2026-08-22-age-visibility-server-only.sql's without its comments (the same code), and
-- production stores most bodies with CRLF line endings, which this file does not restate. Of the
-- functions left alone, production's get_coach_scores differs from 2026-07-25-coach-scores-batch.sql
-- in one comment paragraph only. Three of these functions' own files wrote `set search_path = public`
-- (is_discipline_coach_on_client, get_or_create_coach_coach_conversation, get_roster_weekend_split);
-- 2026-08-09-definer-pg-temp-sweep.sql appended pg_temp in production, and a create or replace
-- REPLACES the setting, so this file restates public, pg_temp for every one of them.
--
-- CREATE OR REPLACE keeps each function's owner and its grants; nothing here grants or revokes.
-- shape_pr_wall's latest file drops and creates it; here it is replaced in place, same signature,
-- so its grants stay as they are. The policies are dropped and created in the same transaction, so
-- no coach read is refused in between. The guard at the end refuses to commit unless every widened
-- function and policy names past_due wherever it names trialing, and every function is still a
-- definer pinned to public, pg_temp.

begin;

-- ── is_coach_on_client ── The access primitive (2026-08-02-rpc-grant-lockdown.sql).
create or replace function public.is_coach_on_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.client_id = p_client_id
      and s.status in ('active', 'trialing', 'past_due')
      and (
        (s.provider_role = 'trainer' and exists (
          select 1 from public.trainers t
          where t.id = s.provider_id and t.owner_id = auth.uid()
        ))
        or
        (s.provider_role = 'nutritionist' and exists (
          select 1 from public.nutritionists n
          where n.id = s.provider_id and n.owner_id = auth.uid()
        ))
      )
  );
$$;

-- ── is_discipline_coach_on_client ── Its discipline-scoped twin (2026-06-17-coach-write-scope.sql).
create or replace function public.is_discipline_coach_on_client(p_client_id uuid, p_discipline text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.client_id = p_client_id
      and s.status in ('active', 'trialing', 'past_due')
      and s.provider_role = p_discipline
      and (
        (p_discipline = 'trainer' and exists (
          select 1 from public.trainers t
          where t.id = s.provider_id and t.owner_id = auth.uid()
        ))
        or
        (p_discipline = 'nutritionist' and exists (
          select 1 from public.nutritionists n
          where n.id = s.provider_id and n.owner_id = auth.uid()
        ))
      )
  );
$$;

-- ── can_access_conversation ── Who may open a conversation (2026-10-15-keep-care-team-private.sql).
create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        -- The client of a coach thread. A care-team thread has client_id = the client it is
        -- about and no provider; the client is not one of its people.
        (c.client_id = auth.uid() and c.provider_role is not null)
        -- A participant; on a care-team thread, only while they still coach its client.
        or exists (
          select 1
          from public.conversation_participants cp
          where cp.conversation_id = c.id and cp.user_id = auth.uid()
            and (
              c.provider_role is not null or c.dm_key is not null or c.client_id is null
              or exists (
                select 1 from public.subscriptions s
                where s.client_id = c.client_id
                  and s.status in ('active', 'trialing', 'past_due')
                  and (
                    (s.provider_role = 'trainer' and exists (
                      select 1 from public.trainers t where t.id = s.provider_id and t.owner_id = auth.uid()
                    ))
                    or (s.provider_role = 'nutritionist' and exists (
                      select 1 from public.nutritionists n where n.id = s.provider_id and n.owner_id = auth.uid()
                    ))
                  )
              )
            )
        )
        or (
          c.provider_role = 'trainer'
          and exists (
            select 1 from public.trainers t
            where t.id = c.provider_id and t.owner_id = auth.uid()
          )
        )
        or (
          c.provider_role = 'nutritionist'
          and exists (
            select 1 from public.nutritionists n
            where n.id = c.provider_id and n.owner_id = auth.uid()
          )
        )
      )
  );
$$;

-- ── notify_on_new_message ── The message trigger (2026-10-15-notification-routes.sql).
create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  conv record;
  recipient uuid;
  v_side text;
begin
  select client_id, provider_role, provider_id, dm_key
    into conv
    from public.conversations
   where id = new.conversation_id;
  if not found then
    return new;
  end if;

  -- A care-team thread: the other coaches on it hear, never the client it is about, and only
  -- those who still coach the client.
  if conv.provider_role is null and conv.dm_key is null and conv.client_id is not null then
    insert into public.notifications (user_id, type, title, body, route, data)
    select cp.user_id, 'message', 'New message', left(coalesce(new.body, ''), 80), 'messages',
           jsonb_build_object('conversationId', new.conversation_id, 'careTeam', true, 'side', 'coach')
      from public.conversation_participants cp
     where cp.conversation_id = new.conversation_id
       and cp.user_id is distinct from new.sender_id
       and cp.user_id <> conv.client_id
       and exists (
         select 1 from public.subscriptions s
         where s.client_id = conv.client_id
           and s.status in ('active', 'trialing', 'past_due')
           and (
             (s.provider_role = 'trainer' and exists (
               select 1 from public.trainers t where t.id = s.provider_id and t.owner_id = cp.user_id
             ))
             or (s.provider_role = 'nutritionist' and exists (
               select 1 from public.nutritionists n where n.id = s.provider_id and n.owner_id = cp.user_id
             ))
           )
       );
    return new;
  end if;

  if conv.client_id is not null and conv.client_id = new.sender_id then
    -- Client sent it → notify the coach (provider owner).
    if conv.provider_role = 'trainer' then
      select owner_id into recipient from public.trainers where id = conv.provider_id;
    elsif conv.provider_role = 'nutritionist' then
      select owner_id into recipient from public.nutritionists where id = conv.provider_id;
    end if;
    v_side := 'coach';
  else
    -- Coach (or other) sent it → notify the client.
    recipient := conv.client_id;
    v_side := 'client';
  end if;

  if recipient is null or recipient = new.sender_id then
    return new;
  end if;

  insert into public.notifications (user_id, type, title, body, route, data)
  values (
    recipient,
    'message',
    'New message',
    left(coalesce(new.body, ''), 80),
    'messages',
    jsonb_build_object('conversationId', new.conversation_id)
      || case when conv.provider_role is not null then jsonb_build_object('providerRole', conv.provider_role, 'side', v_side) else '{}'::jsonb end
  );
  return new;
end;
$$;

-- ── get_or_create_coach_coach_conversation ── The care-team thread (2026-05-26-shared-clients.sql).
create or replace function public.get_or_create_coach_coach_conversation(
  p_other_user_id uuid,
  p_client_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_me is null then
    raise exception 'Authentication is required.';
  end if;
  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'Invalid counterpart.';
  end if;

  -- Both users must be active coaches on this client. We check by looking
  -- for an owner_id match against an active subscription.
  if not exists (
    select 1 from public.subscriptions s
    where s.client_id = p_client_id
      and s.status in ('active','trialing','past_due')
      and (
        (s.provider_role = 'trainer' and exists (
          select 1 from public.trainers t where t.id = s.provider_id and t.owner_id = v_me
        ))
        or
        (s.provider_role = 'nutritionist' and exists (
          select 1 from public.nutritionists n where n.id = s.provider_id and n.owner_id = v_me
        ))
      )
  ) then
    raise exception 'Caller is not a coach on this client.';
  end if;

  if not exists (
    select 1 from public.subscriptions s
    where s.client_id = p_client_id
      and s.status in ('active','trialing','past_due')
      and (
        (s.provider_role = 'trainer' and exists (
          select 1 from public.trainers t where t.id = s.provider_id and t.owner_id = p_other_user_id
        ))
        or
        (s.provider_role = 'nutritionist' and exists (
          select 1 from public.nutritionists n where n.id = s.provider_id and n.owner_id = p_other_user_id
        ))
      )
  ) then
    raise exception 'Counterpart is not a coach on this client.';
  end if;

  -- Reuse an existing coach↔coach conversation for this client if any.
  select c.id into v_conversation_id
  from public.conversations c
  where c.kind = 'direct'
    and c.client_id = p_client_id
    and c.provider_role is null
    and c.provider_id is null
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = c.id and cp.user_id = v_me
    )
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = c.id and cp.user_id = p_other_user_id
    )
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.conversations (kind, client_id, title)
  values ('direct', p_client_id, 'Care team')
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values
    (v_conversation_id, v_me, 'member'),
    (v_conversation_id, p_other_user_id, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

-- ── get_or_create_client_conversation ── A coach opens a thread with their client (2026-10-15-coach-thread.sql).
create or replace function public.get_or_create_client_conversation(p_client_id uuid, p_provider_role text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_pid bigint;
  v_name text;
  v_conv uuid;
begin
  if v_uid is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_client_id is null or p_provider_role is null or p_provider_role not in ('trainer', 'nutritionist') then
    raise exception 'A client and a provider role are required.' using errcode = '22023';
  end if;

  if p_provider_role = 'trainer' then
    select t.id, t.name into v_pid, v_name from public.trainers t where t.owner_id = v_uid order by t.id limit 1;
  else
    select n.id, n.name into v_pid, v_name from public.nutritionists n where n.owner_id = v_uid order by n.id limit 1;
  end if;
  if v_pid is null then
    raise exception 'No % listing belongs to this account.', p_provider_role using errcode = '42501';
  end if;

  select c.id into v_conv
  from public.conversations c
  where c.kind = 'direct' and c.provider_role = p_provider_role
    and c.provider_id = v_pid and c.client_id = p_client_id
  limit 1;
  if v_conv is not null then
    -- An existing thread (the client opened it, or the hire did): the coach joins it for their
    -- unread count, as on a new one below.
    insert into public.conversation_participants (conversation_id, user_id, role)
    values (v_conv, v_uid, p_provider_role)
    on conflict (conversation_id, user_id) do nothing;
    return v_conv;
  end if;

  -- Their client, with THIS listing: the same relationship is_coach_with_client counts, held to
  -- the one listing so a coach with both roles cannot open a thread under the role they do not
  -- coach this client in.
  if not (
    exists (
      select 1 from public.subscriptions s
      where s.client_id = p_client_id and s.provider_role = p_provider_role and s.provider_id = v_pid
        and s.status in ('active', 'trialing', 'past_due')
    )
    or exists (
      select 1 from public.sessions s
      where s.client_id = p_client_id and s.provider_role = p_provider_role and s.provider_id = v_pid
        and coalesce(s.status, '') not in ('cancelled', 'canceled', 'declined')
        and s.scheduled_at >= now() - interval '90 days'
    )
    or exists (
      select 1 from public.one_time_purchases p
      where p.client_id = p_client_id and p.provider_role = p_provider_role and p.provider_id = v_pid
        and p.kind = 'booking' and p.status = 'paid'
        and p.created_at >= now() - interval '90 days'
    )
  ) then
    raise exception 'This member is not your client.' using errcode = '42501';
  end if;

  begin
    insert into public.conversations (kind, title, provider_role, provider_id, client_id)
    values ('direct', v_name, p_provider_role, v_pid, p_client_id)
    returning id into v_conv;
  exception when unique_violation then
    select c.id into v_conv
    from public.conversations c
    where c.kind = 'direct' and c.provider_role = p_provider_role
      and c.provider_id = v_pid and c.client_id = p_client_id
    limit 1;
  end;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_conv, p_client_id, 'client'), (v_conv, v_uid, p_provider_role)
  on conflict (conversation_id, user_id) do nothing;

  return v_conv;
end;
$$;

-- ── get_client_coaches ── Every coach a member pays (2026-10-16-client-coaches.sql).
create or replace function public.get_client_coaches(p_client_id uuid)
returns table (provider_role text, provider_id bigint, name text, owner_id uuid, since timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.provider_role,
         s.provider_id,
         coalesce(t.name, n.name)         as name,
         coalesce(t.owner_id, n.owner_id) as owner_id,
         min(s.created_at)                as since
  from public.subscriptions s
  left join public.trainers      t on s.provider_role = 'trainer'      and t.id = s.provider_id
  left join public.nutritionists n on s.provider_role = 'nutritionist' and n.id = s.provider_id
  where auth.uid() is not null
    and p_client_id is not null
    and s.client_id = p_client_id
    and s.status in ('active', 'trialing', 'past_due')
    and (auth.uid() = p_client_id or public.is_coach_on_client(p_client_id))
  group by s.provider_role, s.provider_id, coalesce(t.name, n.name), coalesce(t.owner_id, n.owner_id)
  order by min(s.created_at), s.provider_id;
$$;

-- ── get_my_coach_playlists ── The member's coaches' playlists (2026-10-11-coach-playlists-for-clients.sql).
create or replace function public.get_my_coach_playlists(p_role text)
returns table (
  id uuid,
  name text,
  provider text,
  url text,
  tracks integer,
  duration text,
  bpm text,
  tag text,
  coach_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select auth.uid() as uid
  ),
  -- The caller's coaches of this role, by the account that owns the coach row.
  coaches as (
    select t.owner_id, t.name
      from public.trainers t, me
     where p_role = 'trainer'
       and me.uid is not null
       and t.owner_id is not null
       and (
         exists (select 1 from public.subscriptions s
                  where s.client_id = me.uid and s.provider_role = 'trainer'
                    and s.provider_id = t.id and s.status in ('active', 'trialing', 'past_due'))
         or exists (select 1 from public.client_workouts w
                     where w.client_id = me.uid and w.trainer_id = t.id and w.status = 'published')
       )
    union
    select n.owner_id, n.name
      from public.nutritionists n, me
     where p_role = 'nutritionist'
       and me.uid is not null
       and n.owner_id is not null
       and (
         exists (select 1 from public.subscriptions s
                  where s.client_id = me.uid and s.provider_role = 'nutritionist'
                    and s.provider_id = n.id and s.status in ('active', 'trialing', 'past_due'))
         or exists (select 1 from public.client_meal_plans m
                     where m.client_id = me.uid and m.nutritionist_id = n.id and m.status = 'published')
       )
  )
  select cs.id, cs.name, cs.provider, cs.url, cs.tracks, cs.duration, cs.bpm, cs.tag,
         c.name as coach_name, cs.created_at
    from public.coach_soundtracks cs
    join coaches c on c.owner_id = cs.owner_id
    cross join me
   where (cs.role is null or cs.role = p_role)
     and cs.url is not null and cs.url <> ''
     and (
       cs.attached @> '[{"kind": "all_clients"}]'::jsonb
       or cs.attached @> jsonb_build_array(jsonb_build_object('kind', 'client', 'clientId', me.uid::text))
     )
   order by cs.created_at desc
   limit 20
$$;

-- ── get_my_shared_clients ── The coach's shared-clients roster (2026-08-10-shared-clients-roster.sql).
create or replace function public.get_my_shared_clients(p_client_id uuid default null)
returns table (
  client_id               uuid,
  counterpart_user_id     uuid,
  counterpart_role        text,
  counterpart_provider_id bigint,
  counterpart_name        text
)
language sql
stable
security definer
-- pg_temp LAST and as a BARE IDENTIFIER LIST. Quoting it (to 'public, pg_temp') stores one
-- schema named "public, pg_temp", which does not exist -- the body would then resolve nothing at
-- call time with no error at apply. See 2026-08-09-definer-pg-temp-sweep.sql.
set search_path = public, pg_temp
as $$
  with me as (
    select 'trainer'::text as role, t.id from public.trainers t      where t.owner_id = auth.uid()
    union all
    select 'nutritionist',          n.id from public.nutritionists n where n.owner_id = auth.uid()
  ),
  my_roles as (
    -- The clients I actively coach, AND the role I coach each of them under. A dual-role coach
    -- who coaches one client through both a trainer row and a nutritionist row appears twice for
    -- that client, which is exactly what the counterpart exclusion at the bottom needs.
    select distinct s.client_id, s.provider_role
    from public.subscriptions s
    join me on me.role = s.provider_role and me.id = s.provider_id
    where s.status in ('active', 'trialing', 'past_due')
  ),
  mine as (
    select distinct client_id from my_roles
  )
  -- ⚠ ONE ROW PER (CLIENT, COUNTERPART **OWNER**) -- not per subscription row.
  -- Neither `trainers.owner_id` nor `nutritionists.owner_id` is unique, and `subscriptions`
  -- carries no uniqueness on (client_id, provider_role) (both re-verified live 2026-08-14: the
  -- only unique constraints are the PKs, the partial stripe_account_id indexes, and
  -- subscriptions' unique stripe_subscription_id). So ONE coach holding TWO provider rows of the
  -- counterpart role, with the client actively subscribed to both, is representable -- and this
  -- select would then emit that one human twice.
  --
  -- Every consumer keys the pair by OWNER, not by listing: `shared_client_acks` is
  -- (coach_user_id, client_id, counterpart_user_id), the thread RPC takes p_other_user_id, and
  -- SharedClientsTab's rowKey is `${clientId}|${counterpart.userId}`. Duplicates therefore land as
  -- duplicate React keys, a doubled "needs acknowledging" badge for one person, a shared busy
  -- state (pressing Message on one row spins both), and a single ack that dismisses both -- the
  -- ack is correct, the two rows were never two things.
  --
  -- Deduping is SAFE here rather than lossy, and the exclusion below is why: the caller covers at
  -- least one role for this client, and every role the caller covers is excluded for everyone. So
  -- all surviving rows for a client share the ONE role the caller does not cover -- collapsing
  -- them can never hide a second discipline. `counterpart_provider_id` is the only field that
  -- differs, and no surface reads it (both routes pass it through; nothing renders it).
  --
  -- Ordered by provider_id so the surviving listing is STABLE: which name a coach sees must not
  -- flip between reads.
  select distinct on (s.client_id, coalesce(t.owner_id, n.owner_id))
         s.client_id,
         coalesce(t.owner_id, n.owner_id) as counterpart_user_id,
         s.provider_role                  as counterpart_role,
         s.provider_id                    as counterpart_provider_id,
         coalesce(t.name, n.name)         as counterpart_name
  from public.subscriptions s
  join mine on mine.client_id = s.client_id
  left join public.trainers      t on s.provider_role = 'trainer'      and t.id = s.provider_id
  left join public.nutritionists n on s.provider_role = 'nutritionist' and n.id = s.provider_id
  where auth.uid() is not null
    and s.status in ('active', 'trialing', 'past_due')
    and (p_client_id is null or s.client_id = p_client_id)
    -- an unclaimed listing has no owner, so there is nobody to message
    and coalesce(t.owner_id, n.owner_id) is not null
    -- ⚠ A DUAL-ROLE COACH IS NOT THEIR OWN COUNTERPART. Someone who owns both a trainer and a
    -- nutritionist row and coaches one client through both would otherwise be listed as their
    -- own care team. The ack route rejects that (400) and the thread RPC raises
    -- 'Invalid counterpart.', so it renders as a dead row rather than erroring visibly.
    and coalesce(t.owner_id, n.owner_id) <> auth.uid()
    -- ⚠ EXCLUDE EVERY ROLE I ALREADY COVER FOR THIS CLIENT -- not merely my own provider row.
    -- The earlier version excluded my row by identity, which left a SAME-ROLE coach standing as a
    -- "counterpart": `subscriptions` carries no uniqueness on (client_id, provider_role) (verified
    -- live -- only the PK and a unique stripe_subscription_id), so a client with two active trainers
    -- is representable, and the second trainer came back as the counterpart under a column the UI
    -- heads NUTRITIONIST. This roster is defined as trainer <-> nutritionist by both
    -- /api/me/shared-clients and SharedClientsTab, so that row was simply wrong.
    --
    -- Keyed on the ROLE I coach THIS client under rather than on "the opposite role", because a
    -- dual-role coach has no opposite -- the trap that made the role-flip approach wrong the first
    -- time. It also subsumes the old identity check: my own row's role is by definition a role I
    -- coach that client under. A coach covering one client through BOTH disciplines therefore has
    -- no counterparts at all, which is correct -- they are the entire care team.
    and not exists (
      select 1 from my_roles mr
      where mr.client_id = s.client_id and mr.provider_role = s.provider_role
    )
  -- DISTINCT ON requires its expressions to lead the sort; provider_id is the tiebreak that makes
  -- the surviving row deterministic rather than plan-dependent.
  order by s.client_id, coalesce(t.owner_id, n.owner_id), s.provider_id;
$$;

-- ── get_roster_weekend_split ── Roster stats (2026-06-30-roster-weekend-split-training.sql).
create or replace function public.get_roster_weekend_split(p_client_ids uuid[])
returns table (
  client_id uuid,
  dimension text,        -- 'nutrition' | 'habits' | 'training'
  week_start date,
  weekday_num numeric,
  weekday_den numeric,
  weekend_num numeric,
  weekend_den numeric
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with allowed as (
    select cid as client_id
    from unnest(p_client_ids) as cid
    where exists (
      select 1 from public.subscriptions s
      left join public.trainers t on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = cid
        and s.status in ('active','trialing','past_due')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  ),
  -- Only clients with a CAPTURED timezone — never fabricate a UTC bucketing
  -- choice for a member whose real zone is unknown (honest-data). Unknown-tz
  -- clients drop out → no rows → the route computes 'insufficient' → no chip.
  tz as (
    select a.client_id, cp.timezone as zone
    from allowed a
    join public.client_profiles cp on cp.user_id = a.client_id
    where cp.timezone is not null
  ),
  win as (  -- per client, the local "today" and the 56-day floor
    select client_id, zone,
           (now() at time zone zone)::date as today_local
    from tz
  ),
  -- Clamp the window start to the member's FIRST observed activity (any snapshot,
  -- daily-habit completion, OR scheduled workout) within the 56-day floor — so a
  -- brand-new account doesn't read empty days as a gap. The scheduled-workout term
  -- is essential: a TRAINING-ONLY client has no snapshots/habits, so without it the
  -- least() collapses to today_local and the window covers a single day, hiding the
  -- training dimension for exactly the members it targets.
  activity as (
    select w.client_id, w.today_local,
      greatest(
        w.today_local - 55,
        least(
          coalesce((select min(d.snapshot_date) from public.daily_health_snapshot d
                    where d.user_id = w.client_id and d.snapshot_date > w.today_local - 56 and d.snapshot_date <= w.today_local), w.today_local),
          coalesce((select min(uhc.done_on) from public.user_habit_completions uhc
                    join public.user_habits uh on uh.id = uhc.habit_id and lower(coalesce(uh.cadence,'daily')) in ('daily','everyday') and uh.archived_at is null
                    where uh.user_id = w.client_id and uhc.done_on > w.today_local - 56 and uhc.done_on <= w.today_local), w.today_local),
          coalesce((select min(cw.scheduled_date) from public.client_workouts cw
                    where cw.client_id = w.client_id and cw.status = 'published'
                      and cw.scheduled_date > w.today_local - 56 and cw.scheduled_date <= w.today_local), w.today_local)
        )
      ) as start_local
    from win w
  ),
  days as (  -- expand each client's clamped window, one row per calendar day
    select a.client_id, gs::date as day
    from activity a, generate_series(a.start_local, a.today_local, interval '1 day') gs
  ),
  -- NUTRITION: denominator = every day in the (clamped) window; a day is "logged"
  -- when its snapshot protein clears the floor. Left join so no-snapshot days
  -- count as den+1/num+0 (a miss) — matching the client builder exactly.
  nut as (
    select dy.client_id, 'nutrition'::text as dimension,
           date_trunc('week', dy.day)::date as week_start,
           count(*) filter (where extract(isodow from dy.day) < 6) as weekday_den,
           count(*) filter (where extract(isodow from dy.day) < 6 and coalesce(d.protein_g,0) >= 10) as weekday_num,
           count(*) filter (where extract(isodow from dy.day) >= 6) as weekend_den,
           count(*) filter (where extract(isodow from dy.day) >= 6 and coalesce(d.protein_g,0) >= 10) as weekend_num
    from days dy
    left join public.daily_health_snapshot d on d.user_id = dy.client_id and d.snapshot_date = dy.day
    group by dy.client_id, date_trunc('week', dy.day)
  ),
  -- HABITS: daily-cadence habits only; scheduled = every day in window × #daily habits
  daily_habits as (
    select a.client_id, count(*) as n_daily
    from activity a
    join public.user_habits h on h.user_id = a.client_id and lower(coalesce(h.cadence,'daily')) in ('daily','everyday') and h.archived_at is null
    group by a.client_id
  ),
  hab as (
    select dy.client_id, 'habits'::text as dimension,
           date_trunc('week', dy.day)::date as week_start,
           sum(case when extract(isodow from dy.day) < 6 then dh.n_daily else 0 end) as weekday_den,
           sum(case when extract(isodow from dy.day) < 6 then coalesce(c.done,0) else 0 end) as weekday_num,
           sum(case when extract(isodow from dy.day) >= 6 then dh.n_daily else 0 end) as weekend_den,
           sum(case when extract(isodow from dy.day) >= 6 then coalesce(c.done,0) else 0 end) as weekend_num
    from days dy
    join daily_habits dh on dh.client_id = dy.client_id
    left join (
      select uh.user_id, uhc.done_on, count(*) as done
      from public.user_habit_completions uhc
      join public.user_habits uh on uh.id = uhc.habit_id and lower(coalesce(uh.cadence,'daily')) in ('daily','everyday') and uh.archived_at is null
      where uh.user_id in (select client_id from activity)
      group by uh.user_id, uhc.done_on
    ) c on c.user_id = dy.client_id and c.done_on = dy.day
    group by dy.client_id, date_trunc('week', dy.day)
  ),
  -- TRAINING: a day is in the DENOMINATOR when the client had a workout SCHEDULED
  -- that day (client_workouts.scheduled_date, published); in the NUMERATOR when a
  -- completed workout_session falls on that same LOCAL day. Day-based (a day with
  -- several scheduled workouts counts once) to mirror the other dimensions, and the
  -- session is bucketed into the member's own timezone so "trained that day" lines
  -- up with the coach-set scheduled calendar day. Days without a scheduled workout
  -- contribute 0/0 → they don't dilute the rate (the floor + statistical gate in the
  -- pure module decide whether the dimension is shown at all).
  sched as (
    select cw.client_id, cw.scheduled_date as day
    from public.client_workouts cw
    where cw.client_id in (select client_id from activity)
      and cw.status = 'published'
      and cw.scheduled_date is not null
    group by cw.client_id, cw.scheduled_date
  ),
  trained as (
    select ws.client_id, (coalesce(ws.started_at, ws.created_at) at time zone z.zone)::date as day
    from public.workout_sessions ws
    join tz z on z.client_id = ws.client_id
    where ws.client_id in (select client_id from activity)
      and ws.status = 'completed'
    group by ws.client_id, (coalesce(ws.started_at, ws.created_at) at time zone z.zone)::date
  ),
  trn as (
    select dy.client_id, 'training'::text as dimension,
           date_trunc('week', dy.day)::date as week_start,
           count(*) filter (where extract(isodow from dy.day) < 6 and sc.day is not null) as weekday_den,
           count(*) filter (where extract(isodow from dy.day) < 6 and sc.day is not null and tr.day is not null) as weekday_num,
           count(*) filter (where extract(isodow from dy.day) >= 6 and sc.day is not null) as weekend_den,
           count(*) filter (where extract(isodow from dy.day) >= 6 and sc.day is not null and tr.day is not null) as weekend_num
    from days dy
    left join sched sc on sc.client_id = dy.client_id and sc.day = dy.day
    left join trained tr on tr.client_id = dy.client_id and tr.day = dy.day
    group by dy.client_id, date_trunc('week', dy.day)
  )
  select client_id, dimension, week_start, weekday_num, weekday_den, weekend_num, weekend_den from nut
  union all
  select client_id, dimension, week_start, weekday_num, weekday_den, weekend_num, weekend_den from hab
  union all
  select client_id, dimension, week_start, weekday_num, weekday_den, weekend_num, weekend_den from trn;
$$;

-- ── get_roster_weekly_adherence ── Roster stats (2026-07-19-roster-weekly-adherence.sql).
create or replace function public.get_roster_weekly_adherence(p_client_ids uuid[])
returns table (client_id uuid, week_start date, scheduled numeric, completed numeric)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Fail CLOSED on an oversized batch (review round: raise, never silently
  -- truncate — a truncated roster would read as "those clients have no data").
  if coalesce(array_length(p_client_ids, 1), 0) > 100 then
    raise exception 'too_many_clients';
  end if;
  return query
  with capped as (
    -- DISTINCT: duplicate ids must not multiply joined rows into the totals.
    select distinct cid from unnest(p_client_ids) as cid
  ),
  allowed as (
    select c.cid as client_id from capped c
    where exists (
      select 1 from public.subscriptions s
      left join public.trainers t on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = c.cid
        and s.status in ('active','trialing','past_due')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  ),
  tz as (  -- the CANONICAL tz helper (shape_user_tz — validated pg_timezone_names
           -- only, so `now() at time zone zone` can never raise on a bad stored
           -- value); unknown-tz clients drop out rather than being bucketed in a
           -- fabricated zone (honest-data, same rule as the weekend-split RPC).
    select a.client_id, public.shape_user_tz(a.client_id) as zone
    from allowed a
    where public.shape_user_tz(a.client_id) is not null
  ),
  win as (  -- the trailing 8 CLOSED ISO weeks, local to each member
    select z.client_id, z.zone,
           date_trunc('week', (now() at time zone z.zone))::date as this_week_start
    from tz z
  ),
  days as (  -- every day of the 8 closed weeks (this week EXCLUDED)
    select w.client_id, w.zone, gs::date as day
    from win w,
         generate_series(w.this_week_start - 56, w.this_week_start - 1, interval '1 day') gs
  ),
  -- Habit units are scoped PER DAY, not to a current snapshot (review:
  -- CodeRabbit). A habit added or archived mid-window must only count on the
  -- days it actually existed: counting today's active set against all 8 weeks
  -- would inflate `scheduled` across the weeks before a habit existed (and drop
  -- the weeks an archived one was live), fabricating exactly the week-to-week
  -- swing this RPC exists to measure.
  -- created_at/archived_at are timestamptz — compared in the MEMBER's own zone
  -- so the boundary day matches the day they actually experienced.
  per_day_habits as (
    select d.client_id, d.day, count(h.id) as n_daily
    from days d
    join public.user_habits h
      on h.user_id = d.client_id
     and lower(coalesce(h.cadence,'daily')) in ('daily','everyday')
     and (h.created_at at time zone d.zone)::date <= d.day
     and (h.archived_at is null or (h.archived_at at time zone d.zone)::date > d.day)
    group by d.client_id, d.day
  ),
  completions as (
    select uh.user_id, uhc.done_on, count(*) as done
    from public.user_habit_completions uhc
    join public.user_habits uh on uh.id = uhc.habit_id
      and lower(coalesce(uh.cadence,'daily')) in ('daily','everyday')
    join tz z on z.client_id = uh.user_id
    where uh.user_id in (select a.client_id from allowed a)
      -- the SAME active-on-that-day window as the scheduled side: a completion
      -- must never outlive its habit's scheduled units, or least() below would
      -- silently discard it and under-report that day.
      and (uh.created_at at time zone z.zone)::date <= uhc.done_on
      and (uh.archived_at is null or (uh.archived_at at time zone z.zone)::date > uhc.done_on)
    group by uh.user_id, uhc.done_on
  ),
  per_day as (
    select d.client_id, d.day,
      -- units count SEPARATELY even on the same date (spec):
      coalesce(dh.n_daily, 0)                                                   as habit_sched,
      coalesce(c.done, 0)                                                       as habit_done,
      case when ws.scheduled then 1 else 0 end                                  as workout_sched,
      case when ws.scheduled and wl.done then 1 else 0 end                      as workout_done,
      1                                                                         as nutrition_sched,
      case when coalesce(s.protein_g, 0) >= 10 then 1 else 0 end                as nutrition_done
    from days d
    left join per_day_habits dh on dh.client_id = d.client_id and dh.day = d.day
    left join completions c on c.user_id = d.client_id and c.done_on = d.day
    -- EXISTS, not a join: several workout rows on one date must not fan per_day
    -- out and multiply the habit/nutrition units.
    left join lateral (
      select exists (
        select 1 from public.client_workouts w
        where w.client_id = d.client_id
          and w.scheduled_date = d.day
          and w.status = 'published'   -- mirrors the accountability cron's filter
      ) as scheduled
    ) ws on true
    -- "Logged a workout near that day", mirroring apply_obligation_penalty's
    -- exoneration EXACTLY (bias to counting it done — logging can lag the
    -- session): a snapshot with workout minutes on the day or the next, or any
    -- activity within ±1 day. NOTE: workout_sessions is deliberately NOT used —
    -- it has no per-day date column (client_id/created_at only), and the repo's
    -- authoritative completion signal is the pair below.
    left join lateral (
      select (
        exists (select 1 from public.daily_health_snapshot d2
                where d2.user_id = d.client_id
                  and d2.snapshot_date in (d.day, d.day + 1)
                  and coalesce(d2.workout_minutes, 0) > 0)
        or exists (select 1 from public.activities a2
                   where a2.user_id = d.client_id
                     and (a2.started_at)::date in (d.day - 1, d.day, d.day + 1))
      ) as done
    ) wl on true
    left join public.daily_health_snapshot s on s.user_id = d.client_id and s.snapshot_date = d.day
  )
  select per_day.client_id,
         date_trunc('week', per_day.day)::date as week_start,
         sum(per_day.habit_sched + per_day.workout_sched + per_day.nutrition_sched)::numeric as scheduled,
         -- least(): a stray extra completion can never push a week over 100%.
         sum(least(per_day.habit_done, per_day.habit_sched) + per_day.workout_done + per_day.nutrition_done)::numeric as completed
  from per_day
  group by per_day.client_id, date_trunc('week', per_day.day)
  order by 1, 2;
end $$;

-- ── member_dobs_for_viewer ── A client's age for their coach (2026-08-22-age-visibility-server-only.sql).
create or replace function public.member_dobs_for_viewer(viewer uuid, targets uuid[])
returns table (member_id uuid, dob date)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- An empty ask is not an error; it is nothing to answer.
  if viewer is null or targets is null or array_length(targets, 1) is null then
    return;
  end if;

  -- ⚠ REFUSE, NEVER TRUNCATE. Silently answering the first 500 of a larger ask
  -- would render as "these members have no age", a claim this function would not
  -- have checked. The route caps too; this is the copy that cannot be skipped.
  if array_length(targets, 1) > 500 then
    raise exception 'member_dobs_for_viewer: % ids requested, maximum is 500', array_length(targets, 1)
      using errcode = '22023';
  end if;

  return query
    select p.id, p.date_of_birth
    from public.profiles p
    where p.id = any (targets)
      and p.date_of_birth is not null       -- absence answers exactly like refusal
      and (
        p.id = viewer
        or p.age_public = true
        or exists (
          select 1
          from public.subscriptions s
          left join public.trainers      t on t.id = s.provider_id and s.provider_role = 'trainer'
          left join public.nutritionists n on n.id = s.provider_id and s.provider_role = 'nutritionist'
          where s.client_id = p.id
            and s.status = any (array['active','trialing','past_due'])
            and (t.owner_id = viewer or n.owner_id = viewer)
        )
      );
end;
$$;

-- ── publish_client_week ── Plan writes (2026-09-18-workout-week-preserve-assignments.sql).
create or replace function public.publish_client_week(
  p_coach_user_id uuid,
  p_idempotency_key uuid,
  p_client_id uuid,
  p_week_start date,
  p_request_hash text,
  p_outcome jsonb,
  p_rows jsonb default '[]',
  p_ack jsonb default null,
  p_expected_row_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trainer_id bigint;
  v_existing public.coach_week_publishes%rowtype;
  v_assignment public.client_workouts%rowtype;
  v_row jsonb;
  v_sched date;
  v_title text;
  v_description text;
  v_kind text;
  v_payload jsonb;
  v_assignment_id uuid;
  v_used_ids uuid[] := '{}';
  v_current_ids uuid[];
  v_expected_ids uuid[];
  v_current_snapshot jsonb;
  v_expected_snapshot jsonb;
  v_inserted int := 0;
  v_updated int := 0;
  v_deleted int := 0;
  v_preserved int := 0;
  v_audited boolean := false;
begin
  if p_coach_user_id is null then
    raise exception 'coach is required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_client_id is null or p_week_start is null
      or nullif(trim(p_request_hash), '') is null then
    raise exception 'idempotency key, client, week and request hash are required' using errcode = '22023';
  end if;
  select t.id into v_trainer_id
    from public.subscriptions s join public.trainers t on t.id = s.provider_id
   where s.client_id = p_client_id and s.status in ('active', 'trialing', 'past_due')
     and s.provider_role = 'trainer' and t.owner_id = p_coach_user_id
   limit 1;
  if v_trainer_id is null then
    raise exception 'not this client''s training coach' using errcode = '42501';
  end if;

  -- The same client-wide lock as regenerate_client_workouts, before row locks.
  perform pg_advisory_xact_lock(hashtext('shape_client_schedule'), hashtext(p_client_id::text));
  select * into v_existing from public.coach_week_publishes
   where idempotency_key = p_idempotency_key and client_id = p_client_id;
  if found then
    if v_existing.coach_user_id is distinct from p_coach_user_id then
      raise exception 'idempotency key belongs to another coach' using errcode = '42501';
    end if;
    if v_existing.request_hash is distinct from p_request_hash then
      raise exception 'idempotency key reused with different content' using errcode = '23505';
    end if;
    return jsonb_build_object('status', 'already_delivered', 'outcome', v_existing.outcome);
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]')) <> 'array'
      or jsonb_array_length(coalesce(p_rows, '[]')) > 40 then
    raise exception 'invalid week size' using errcode = '22023';
  end if;

  -- save_workout_session takes this same row lock before inserting its log.
  -- Check logs in a LATER statement so a saver that held the lock first has
  -- committed and is visible under READ COMMITTED. FK inserts also take a
  -- conflicting key-share lock. Stable ordering avoids multi-row deadlocks.
  perform cw.id from public.client_workouts cw
   where cw.client_id = p_client_id and cw.trainer_id = v_trainer_id
     and cw.status = 'published'
     and cw.scheduled_date between p_week_start and (p_week_start + 6)
   order by cw.id for update;

  if p_expected_row_ids is not null then
    select coalesce(array_agg(cw.id order by cw.id), '{}'::uuid[]),
      coalesce(jsonb_agg(jsonb_build_object('id', cw.id, 'title', cw.title,
        'description', cw.description, 'kind', cw.kind, 'scheduled_date', cw.scheduled_date,
        'payload', cw.payload) order by cw.id), '[]'::jsonb)
      into v_current_ids, v_current_snapshot
      from public.client_workouts cw
     where cw.client_id = p_client_id and cw.trainer_id = v_trainer_id
       and cw.status = 'published'
       and cw.scheduled_date between p_week_start and (p_week_start + 6);
    select coalesce(array_agg(distinct x order by x), '{}'::uuid[])
      into v_expected_ids from unnest(p_expected_row_ids) as x;
    if v_current_ids is distinct from v_expected_ids then
      raise exception 'the week changed since it was read' using errcode = '40001';
    end if;
    -- IDs alone no longer detect a changed prescription because updates keep
    -- those IDs. The scoped server read supplies the complete content snapshot.
    if jsonb_typeof(p_rows -> 0 -> 'expectedAssignments') is distinct from 'array' then
      raise exception 'a merged week requires its read snapshot' using errcode = '40001';
    end if;
    select coalesce(jsonb_agg(x order by (x ->> 'id')::uuid), '[]'::jsonb)
      into v_expected_snapshot from jsonb_array_elements(p_rows -> 0 -> 'expectedAssignments') x;
    if v_current_snapshot is distinct from v_expected_snapshot then
      raise exception 'the week content changed since it was read' using errcode = '40001';
    end if;
  end if;

  begin
    insert into public.coach_week_publishes
      (idempotency_key, client_id, coach_user_id, week_start, request_hash, outcome)
    values (p_idempotency_key, p_client_id, p_coach_user_id, p_week_start, p_request_hash, p_outcome);
  exception when unique_violation then
    select * into v_existing from public.coach_week_publishes
     where idempotency_key = p_idempotency_key and client_id = p_client_id;
    if v_existing.request_hash is distinct from p_request_hash
       or v_existing.coach_user_id is distinct from p_coach_user_id then
      raise exception 'idempotency key reused with different content' using errcode = '23505';
    end if;
    return jsonb_build_object('status', 'already_delivered', 'outcome', v_existing.outcome);
  end;
  perform set_config('shape.adjust_regen', '1', true);

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    v_sched := (v_row ->> 'scheduled_date')::date;
    if v_sched is null or v_sched < p_week_start or v_sched > (p_week_start + 6) then
      raise exception 'every session needs a date in the submitted week' using errcode = '22023';
    end if;
    if v_sched < current_date then
      raise exception 'cannot publish into the past' using errcode = '22023';
    end if;
    v_title := coalesce(nullif(trim(v_row ->> 'title'), ''), 'Workout');
    v_description := v_row ->> 'description';
    v_kind := case when v_row ->> 'kind' = 'template' then 'template' else 'custom' end;
    v_payload := coalesce(v_row -> 'payload', '{}'::jsonb);
    v_assignment_id := null;

    if nullif(v_row ->> 'assignmentId', '') is not null then
      v_assignment_id := (v_row ->> 'assignmentId')::uuid;
      select * into v_assignment from public.client_workouts cw
       where cw.id = v_assignment_id and cw.client_id = p_client_id
         and cw.trainer_id = v_trainer_id and cw.status = 'published'
         and cw.scheduled_date between p_week_start and (p_week_start + 6)
         and cw.scheduled_date >= current_date;
      if not found or v_assignment_id = any(v_used_ids) then
        raise exception 'the bound assignment changed or was repeated' using errcode = '40001';
      end if;
    else
      -- Whole-week authors do not read-merge. Reuse exact assignments first,
      -- then the same canonical template day or legacy same-day/title slot.
      select * into v_assignment from public.client_workouts cw
       where cw.client_id = p_client_id and cw.trainer_id = v_trainer_id
         and cw.status = 'published' and cw.scheduled_date = v_sched
         and not (cw.id = any(v_used_ids)) and (
           (cw.title = v_title and cw.description is not distinct from v_description
             and cw.kind = v_kind and cw.payload = v_payload)
           or (cw.payload #>> '{template,id}' = v_payload #>> '{template,id}' and (
             (cw.payload #>> '{template,dayId}' = v_payload #>> '{template,dayId}'
               and cw.payload #> '{template,week}' = v_payload #> '{template,week}')
             or (cw.payload #>> '{template,dayId}' is null
               and v_payload #>> '{template,dayId}' is null
               and cw.payload #> '{template,week}' = v_payload #> '{template,week}'
               and cw.payload #> '{template,day}' = v_payload #> '{template,day}')))
           or (cw.title = v_title and cw.payload #>> '{template,id}' is null
             and v_payload #>> '{template,id}' is null))
       order by (cw.title = v_title and cw.description is not distinct from v_description
         and cw.kind = v_kind and cw.payload = v_payload) desc, cw.id limit 1;
      if found then v_assignment_id := v_assignment.id; end if;
    end if;

    if v_assignment_id is not null then
      v_used_ids := array_append(v_used_ids, v_assignment_id);
      if v_assignment.title = v_title and v_assignment.description is not distinct from v_description
          and v_assignment.kind = v_kind and v_assignment.payload = v_payload
          and v_assignment.scheduled_date = v_sched then
        v_preserved := v_preserved + 1;
        continue;
      end if;
      if exists (select 1 from public.workout_sessions ws where ws.client_workout_id = v_assignment_id) then
        raise exception 'cannot change an assignment that has workout logs' using errcode = '55000';
      end if;
      update public.client_workouts set title = v_title, description = v_description,
        kind = v_kind, payload = v_payload, scheduled_date = v_sched
       where id = v_assignment_id;
      v_updated := v_updated + 1;
    else
      insert into public.client_workouts
        (trainer_id, client_id, title, description, kind, payload, scheduled_date, status)
      values (v_trainer_id, p_client_id, v_title, v_description, v_kind, v_payload, v_sched, 'published')
      returning id into v_assignment_id;
      v_used_ids := array_append(v_used_ids, v_assignment_id);
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  -- Explicit whole-week removal hides omitted rows from the published schedule.
  -- Archive rather than delete: an offline client draft may still need this
  -- assignment ID when it finishes. Logged assignments remain unchanged.
  -- Merged requests carry every row and never remove an unrelated assignment.
  update public.client_workouts cw set status = 'archived'
   where cw.client_id = p_client_id and cw.trainer_id = v_trainer_id and cw.status = 'published'
     and cw.scheduled_date between p_week_start and (p_week_start + 6)
     and cw.scheduled_date >= current_date and not (cw.id = any(v_used_ids))
     and not exists (select 1 from public.workout_sessions ws where ws.client_workout_id = cw.id);
  get diagnostics v_deleted = row_count;

  if v_inserted + v_updated > 0 then
    insert into public.notifications (user_id, type, title, body, route, data)
    values (p_client_id, 'workout', 'Your week from your coach',
      (v_inserted + v_updated) || ' sessions updated for the week of ' || to_char(p_week_start, 'Mon DD'),
      'train', jsonb_build_object('weekStartISO', to_char(p_week_start, 'YYYY-MM-DD'),
        'sessions', v_inserted + v_updated));
  end if;
  if p_ack is not null and jsonb_typeof(p_ack) = 'object' then
    insert into public.ai_audit_log (actor_user_id, actor_role, source, action,
      target_user_id, target_kind, target_id, suggestion, confirmed_payload, before_state, after_state)
    values (p_coach_user_id, 'trainer', 'engine', 'guardrail_red_ack', p_client_id,
      'training_week', to_char(p_week_start, 'YYYY-MM-DD'), p_ack -> 'suggestion',
      jsonb_build_object('acknowledged', true) || coalesce(p_ack -> 'acknowledgment', '{}'::jsonb),
      jsonb_build_object('weekStartISO', to_char(p_week_start, 'YYYY-MM-DD'), 'replaced', v_deleted + v_updated),
      jsonb_build_object('weekStartISO', to_char(p_week_start, 'YYYY-MM-DD'),
        'sessions', v_inserted + v_updated + v_preserved));
    v_audited := true;
  end if;
  return jsonb_build_object('status', 'accepted', 'outcome', p_outcome,
    'inserted', v_inserted, 'replaced', v_deleted + v_updated,
    'preserved', v_preserved, 'updated', v_updated, 'audited', v_audited);
end;
$$;

-- ── regenerate_client_workouts ── Plan writes (2026-09-18-workout-week-preserve-assignments.sql).
create or replace function public.regenerate_client_workouts(
  p_coach_user_id uuid,
  p_client_id uuid,
  p_delete_ids uuid[] default '{}',
  p_inserts jsonb default '[]',
  p_repeat_patches jsonb default '[]',
  p_ack jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_trainer_id bigint;
  v_expected int;
  v_found int;
  v_ins jsonb;
  v_patch jsonb;
  v_title text;
  v_sched date;
  v_dow jsonb;
  v_inserted int := 0;
  v_patched int := 0;
  v_deleted int := 0;
  v_audited boolean := false;
begin
  if p_coach_user_id is null then
    raise exception 'coach identity required' using errcode = '42501';
  end if;
  select t.id into v_trainer_id
  from public.subscriptions s join public.trainers t on t.id = s.provider_id
  where s.client_id = p_client_id and s.provider_role = 'trainer'
    and s.status in ('active', 'trialing', 'past_due') and t.owner_id = p_coach_user_id limit 1;
  if v_trainer_id is null then
    raise exception 'not this client''s training coach' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('shape_client_schedule'), hashtext(p_client_id::text));
  if coalesce(array_length(p_delete_ids, 1), 0) > 400
     or jsonb_array_length(coalesce(p_inserts, '[]')) > 200
     or jsonb_array_length(coalesce(p_repeat_patches, '[]')) > 50 then
    raise exception 'regeneration set too large' using errcode = '22023';
  end if;

  -- Lock in the same order as publishing, before any mutation. The atomic
  -- session saver takes these row locks too; retiring never removes the row.
  perform w.id from public.client_workouts w
  where w.client_id = p_client_id and w.trainer_id = v_trainer_id
    and (w.id = any(p_delete_ids) or w.id in (
      select (value->>'id')::uuid from jsonb_array_elements(coalesce(p_repeat_patches, '[]'))
    )) order by w.id for update;
  v_expected := coalesce(array_length(p_delete_ids, 1), 0);
  if v_expected > 0 then
    select count(*) into v_found from public.client_workouts w
    where w.id = any(p_delete_ids) and w.client_id = p_client_id
      and w.trainer_id = v_trainer_id and w.status = 'published'
      and (w.scheduled_date is null or w.scheduled_date > current_date);
    if v_found <> v_expected then
      raise exception 'delete set contains rows outside the regeneration scope' using errcode = '42501';
    end if;
  end if;
  perform set_config('shape.adjust_regen', '1', true);
  for v_ins in select * from jsonb_array_elements(coalesce(p_inserts, '[]')) loop
    v_title := nullif(btrim(coalesce(v_ins->>'title', '')), '');
    if v_title is null then raise exception 'insert missing a title' using errcode = '22023'; end if;
    v_sched := null;
    if coalesce(v_ins->>'scheduled_date', '') <> '' then
      v_sched := (v_ins->>'scheduled_date')::date;
      if v_sched <= current_date then
        raise exception 'inserts must be strictly future-dated' using errcode = '22023';
      end if;
    end if;
    insert into public.client_workouts
      (trainer_id, client_id, title, description, kind, payload, playlist_id, scheduled_date, status)
    values (v_trainer_id, p_client_id, left(v_title, 200), left(coalesce(v_ins->>'description', ''), 2000),
      case when v_ins->>'kind' = 'template' then 'template' else 'custom' end,
      coalesce(v_ins->'payload', '{}'::jsonb), nullif(v_ins->>'playlist_id', '')::uuid, v_sched, 'published');
    v_inserted := v_inserted + 1;
  end loop;
  for v_patch in select * from jsonb_array_elements(coalesce(p_repeat_patches, '[]')) loop
    v_dow := coalesce(v_patch->'repeatDow', '[]'::jsonb);
    if jsonb_typeof(v_dow) <> 'array' then
      raise exception 'repeat patch needs a repeatDow array' using errcode = '22023';
    end if;
    update public.client_workouts w
      set payload = jsonb_set(coalesce(w.payload, '{}'::jsonb), '{repeatDow}', v_dow)
    where w.id = (v_patch->>'id')::uuid and w.client_id = p_client_id
      and w.trainer_id = v_trainer_id and w.scheduled_date is null and w.status = 'published';
    if not found then
      raise exception 'repeat patch targets a row outside the regeneration scope' using errcode = '42501';
    end if;
    v_patched := v_patched + 1;
  end loop;
  if v_expected > 0 then
    update public.client_workouts w set status = 'archived'
    where w.id = any(p_delete_ids) and w.client_id = p_client_id
      and w.trainer_id = v_trainer_id and w.status = 'published';
    get diagnostics v_deleted = row_count;
    if v_deleted <> v_expected then
      raise exception 'the plan changed since it was read' using errcode = '40001';
    end if;
  end if;
  if p_ack is not null and jsonb_typeof(p_ack) = 'object' then
    insert into public.ai_audit_log (
      actor_user_id, actor_role, source, action, target_user_id, target_kind, target_id,
      suggestion, confirmed_payload, before_state, after_state
    ) values (
      p_coach_user_id, 'trainer', 'engine', 'guardrail_red_ack', p_client_id, 'training_regeneration',
      nullif(btrim(coalesce(p_ack->>'weekStartISO', '')), ''), p_ack -> 'suggestion',
      jsonb_build_object('acknowledged', true) || coalesce(p_ack -> 'acknowledgment', '{}'::jsonb),
      jsonb_build_object('weeks', coalesce(p_ack -> 'weeks', '[]'::jsonb),
        'adjustMode', p_ack ->> 'adjustMode', 'deleteCount', v_expected),
      jsonb_build_object('inserted', v_inserted, 'patched', v_patched, 'deleted', v_deleted)
    );
    v_audited := true;
  end if;
  return jsonb_build_object('inserted', v_inserted, 'patched', v_patched,
    'deleted', v_deleted, 'audited', v_audited);
end;
$$;

-- ── shape_member_board ── The team board (2026-10-15-leaderboards.sql).
create or replace function public.shape_member_board(
  p_scope text default 'everyone',
  p_period text default 'month',
  p_limit integer default 50
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  points bigint,
  rank bigint,
  prev_rank bigint,
  rank_points bigint,
  streak integer,
  training_days integer,
  meal_days integer,
  total bigint,
  is_me boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_today date := (now() at time zone 'UTC')::date;
  v_since timestamptz;
  v_prev_since timestamptz;
  v_prev_until timestamptz := now() - interval '7 days';
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if v_me is null then
    raise exception 'shape_member_board: sign in first' using errcode = '42501';
  end if;
  if p_scope is null or p_scope not in ('everyone', 'following', 'team') then
    raise exception 'shape_member_board: unknown scope %', coalesce(p_scope, '<null>') using errcode = '22023';
  end if;
  if p_period is null or p_period not in ('week', 'month', 'all') then
    raise exception 'shape_member_board: unknown period %', coalesce(p_period, '<null>') using errcode = '22023';
  end if;

  if p_period = 'week' then
    v_since := now() - interval '7 days';
    v_prev_since := now() - interval '14 days';
  elsif p_period = 'month' then
    v_since := date_trunc('month', now());
    v_prev_since := date_trunc('month', now() - interval '7 days');
  else
    v_since := '1970-01-01'::timestamptz;
    v_prev_since := '1970-01-01'::timestamptz;
  end if;

  return query
  with my_coaches as (
    select s.provider_role, s.provider_id
    from public.subscriptions s
    where s.client_id = v_me and s.status in ('active', 'trialing', 'past_due')
  ),
  teammates as (
    select distinct s.client_id as uid
    from public.subscriptions s
    join my_coaches c on c.provider_role = s.provider_role and c.provider_id = s.provider_id
    where s.status in ('active', 'trialing', 'past_due') and s.client_id <> v_me
  ),
  followed as (
    select f.following_id as uid
    from public.user_follows f
    where f.follower_id = v_me and f.status = 'accepted'
  ),
  earners as (
    select distinct l.user_id as uid
    from public.score_ledger l
    where l.earned_at >= least(v_since, v_prev_since)
      and coalesce(l.source_kind, '') not in ('store_redeem', 'tier_bonus')
  ),
  eligible as (
    select e.uid
    from earners e
    left join public.user_goals g on g.user_id = e.uid and g.kind = 'client_privacy_prefs'
    where e.uid = v_me
       or (coalesce(g.data->>'leaderboard', 'on') <> 'off'
           and case p_scope
                 when 'everyone'  then public.shape_profile_visibility(e.uid) = 'public'
                 when 'following' then public.shape_profile_visibility(e.uid) = 'public'
                                       and e.uid in (select uid from followed)
                 else g.data->>'team_board' = 'on'
                      and e.uid in (select uid from teammates)
               end)
  ),
  now_totals as (
    select l.user_id as uid, sum(l.delta)::bigint as pts
    from public.score_ledger l
    join eligible el on el.uid = l.user_id
    where l.earned_at >= v_since
      and coalesce(l.source_kind, '') not in ('store_redeem', 'tier_bonus')
    group by l.user_id
    having sum(l.delta) > 0
  ),
  prev_totals as (
    select l.user_id as uid, sum(l.delta)::bigint as pts
    from public.score_ledger l
    join eligible el on el.uid = l.user_id
    where l.earned_at >= v_prev_since and l.earned_at < v_prev_until
      and coalesce(l.source_kind, '') not in ('store_redeem', 'tier_bonus')
    group by l.user_id
    having sum(l.delta) > 0
  ),
  ranked as (
    select n.uid, n.pts,
           rank() over (order by n.pts desc) as rk,
           count(*) over () as n_total
    from now_totals n
  ),
  prev_ranked as (
    select p.uid, rank() over (order by p.pts desc) as rk
    from prev_totals p
  ),
  -- The top of the board, you, and whoever is next above you (the one "to pass" names), even when
  -- they sit below the top (Fable, #2371: at #60 the line named #50 and skipped #59).
  shown as (
    select r.* from ranked r
    where r.rk <= v_limit
       or r.uid = v_me
       or r.rk = (select max(a.rk) from ranked a
                  where a.rk < (select m.rk from ranked m where m.uid = v_me))
  )
  select
    -- ⚠ Another member's id never leaves (Fable, #2371): get_display_names answers any id with the
    -- full name and photo, which a private profile on the team board was promised teammates would
    -- not see. Your own row keeps yours.
    case when s.uid = v_me then s.uid end,
    case
      when nm.n = '' then 'Shape member'
      when position(' ' in nm.n) = 0 then nm.n
      else split_part(nm.n, ' ', 1) || ' ' || upper(left(regexp_replace(nm.n, '^.* ', ''), 1)) || '.'
    end,
    -- ⚠ The photo only for a public profile, or your own (Codex, #2371). The team board takes a
    -- private profile on its own switch, whose ask names first name, last initial, points and tier,
    -- not the photo. Everyone and Following hold public profiles only, so this changes the team board.
    case when s.uid = v_me or public.shape_profile_visibility(s.uid) = 'public' then p.avatar_url end,
    s.pts,
    s.rk,
    pr.rk,
    public.shape_rank_points(s.uid),
    -- ⚠ Training and nutrition: the caller's own row only. Null for everyone else.
    case when s.uid = v_me then coalesce(st.n, 0)::integer end,
    case when s.uid = v_me then coalesce(td.n, 0)::integer end,
    case when s.uid = v_me then coalesce(md.n, 0)::integer end,
    s.n_total,
    s.uid = v_me
  from shown s
  left join public.profiles p on p.id = s.uid
  -- The name with any run of whitespace (a tab or a newline too, not only spaces) as one space,
  -- and none at either end, so "first name and last initial" holds for every name (Codex, #2371).
  left join lateral (
    select regexp_replace(regexp_replace(coalesce(p.full_name, ''), '^\s+|\s+$', '', 'g'), '\s+', ' ', 'g') as n
  ) nm on true
  left join prev_ranked pr on pr.uid = s.uid
  -- The streak the member's own dashboard shows (/api/client/dashboard): days in a row with a
  -- completed workout, counted back from today, or from yesterday when today has none yet.
  -- Read for the caller's own row only (`s.uid = v_me`), like the two counts below.
  left join lateral (
    with days as (
      select distinct (coalesce(ws.started_at, ws.ended_at, ws.created_at) at time zone 'UTC')::date as d
      from public.workout_sessions ws
      where ws.client_id = s.uid and s.uid = v_me and ws.status = 'completed'
        and (coalesce(ws.started_at, ws.ended_at, ws.created_at) at time zone 'UTC')::date
            between v_today - 400 and v_today
    ),
    islands as (
      select d, d - (row_number() over (order by d))::integer as grp from days
    )
    select count(*) as n
    from islands i
    where (select max(d) from days) >= v_today - 1
      and i.grp = (select i2.grp from islands i2 where i2.d = (select max(d) from days))
  ) st on true
  left join lateral (
    select count(distinct (coalesce(ws.started_at, ws.ended_at, ws.created_at) at time zone 'UTC')::date) as n
    from public.workout_sessions ws
    where ws.client_id = s.uid and s.uid = v_me and ws.status = 'completed'
      and coalesce(ws.started_at, ws.ended_at, ws.created_at) >= v_since
  ) td on true
  left join lateral (
    select count(distinct (l.earned_at at time zone 'UTC')::date) as n
    from public.score_ledger l
    where l.user_id = s.uid and s.uid = v_me and l.category = 'nutrition' and l.source_kind = 'meal_log'
      and l.delta > 0 and l.earned_at >= v_since
  ) md on true
  order by s.rk, s.uid;
end;
$$;

-- ── shape_pr_wall ── The PR wall's coach scope (2026-09-10-pr-wall-prev-race.sql).
create or replace function public.shape_pr_wall(
  p_limit int  default 40,
  p_lift  text default null,
  p_scope text default 'everyone'
)
returns table (
  user_id    uuid,
  full_name  text,
  avatar_url text,
  role       text,
  lift_key   text,
  lift_label text,
  best_value numeric,
  prev_value numeric,
  unit       text,
  reps       int,
  posted_at  timestamptz,
  post_id    uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    w.user_id,
    coalesce(p.full_name, 'Shape member') as full_name,
    p.avatar_url,
    p.role,
    w.lift_key,
    coalesce(w.lift_label, w.lift_key) as lift_label,
    w.best_value,
    w.prev_value,
    w.unit,
    w.reps,
    w.posted_at,
    w.post_id
  from public.pr_wall_posts w
  left join public.profiles p on p.id = w.user_id
  left join public.user_goals g
    on g.user_id = w.user_id and g.kind = 'client_privacy_prefs'
  where public.shape_profile_visibility(w.user_id) = 'public'
    and coalesce(g.data->>'leaderboard', 'on') <> 'off'
    and (p_lift is null or w.lift_key = lower(trim(p_lift)))
    and (
      coalesce(p_scope, 'everyone') = 'everyone'
      or (
        p_scope = 'following'
        and w.user_id in (
          select f.following_id from public.user_follows f
          where f.follower_id = auth.uid() and f.status = 'accepted'
        )
      )
      or (
        p_scope = 'coach'
        and (
          public.is_coach_on_client(w.user_id)
          or exists (
            select 1
            from public.subscriptions mine
            join public.subscriptions theirs
              on theirs.provider_id = mine.provider_id
             and theirs.provider_role = mine.provider_role
            where mine.client_id = auth.uid()
              and mine.status in ('active', 'trialing', 'past_due')
              and theirs.client_id = w.user_id
              and theirs.status in ('active', 'trialing', 'past_due')
          )
        )
      )
    )
  order by w.posted_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$$;

-- ── The four policies that inline the relationship check (2026-05-30-activities.sql,
-- 2026-05-22-client-profiles-provider-read.sql, 2026-05-09-daily-health-snapshot.sql,
-- 2026-05-29-provider-rls-hardening.sql), as production holds them, with past_due added. ──

drop policy if exists "activities_provider_read" on public.activities;
create policy "activities_provider_read"
  on public.activities for select
  to authenticated
  using (
    exists (
      select 1
      from public.subscriptions s
      left join public.trainers t
        on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n
        on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = activities.user_id
        and s.status in ('active','trialing','past_due')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  );

drop policy if exists "providers_read_subscriber_profiles" on public.client_profiles;
create policy "providers_read_subscriber_profiles"
  on public.client_profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.subscriptions s
      left join public.trainers t
        on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n
        on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = client_profiles.user_id
        and s.status in ('active','trialing','past_due')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  );

drop policy if exists "providers_read_subscriber_snapshots" on public.daily_health_snapshot;
create policy "providers_read_subscriber_snapshots"
  on public.daily_health_snapshot for select
  to authenticated
  using (
    exists (
      select 1
      from public.subscriptions s
      left join public.trainers t
        on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n
        on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = daily_health_snapshot.user_id
        and s.status in ('active','trialing','past_due')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  );

drop policy if exists "providers_read_subscriber_profiles_base" on public.profiles;
create policy "providers_read_subscriber_profiles_base"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.subscriptions s
      left join public.trainers t
        on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n
        on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = profiles.id
        and s.status in ('active','trialing','past_due')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  );

-- ── The guard: a migration that cannot prove it worked is not a gate ──────────────────────────
-- Every widened function names past_due as often as it names trialing (so no list was left at two
-- statuses), and is still a SECURITY DEFINER pinned to public, pg_temp; every widened policy names
-- past_due and is still a SELECT policy for authenticated. A failure raises, and the transaction
-- rolls back with it.
do $check$
declare
  v_sig text;
  v_src text;
  v_trialing int;
  v_past_due int;
  v_pol text;
  v_qual text;
begin
  foreach v_sig in array array[
    'public.is_coach_on_client(uuid)',
    'public.is_discipline_coach_on_client(uuid, text)',
    'public.can_access_conversation(uuid)',
    'public.notify_on_new_message()',
    'public.get_or_create_coach_coach_conversation(uuid, uuid)',
    'public.get_or_create_client_conversation(uuid, text)',
    'public.get_client_coaches(uuid)',
    'public.get_my_coach_playlists(text)',
    'public.get_my_shared_clients(uuid)',
    'public.get_roster_weekend_split(uuid[])',
    'public.get_roster_weekly_adherence(uuid[])',
    'public.member_dobs_for_viewer(uuid, uuid[])',
    'public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[])',
    'public.regenerate_client_workouts(uuid, uuid, uuid[], jsonb, jsonb, jsonb)',
    'public.shape_member_board(text, text, integer)',
    'public.shape_pr_wall(integer, text, text)'
  ] loop
    select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
    v_trialing := (length(v_src) - length(replace(v_src, 'trialing', ''))) / length('trialing');
    v_past_due := (length(v_src) - length(replace(v_src, 'past_due', ''))) / length('past_due');
    if v_past_due = 0 or v_past_due <> v_trialing then
      raise exception 'coach access: % names trialing % times and past_due % times', v_sig, v_trialing, v_past_due;
    end if;
    if not exists (
      select 1 from pg_proc p
      where p.oid = v_sig::regprocedure
        and p.prosecdef
        and p.proconfig @> array['search_path=public, pg_temp']
    ) then
      raise exception 'coach access: % is no longer a definer pinned to public, pg_temp', v_sig;
    end if;
  end loop;

  foreach v_pol in array array[
    'activities.activities_provider_read',
    'client_profiles.providers_read_subscriber_profiles',
    'daily_health_snapshot.providers_read_subscriber_snapshots',
    'profiles.providers_read_subscriber_profiles_base'
  ] loop
    select pp.qual into v_qual from pg_policies pp
    where pp.schemaname = 'public'
      and pp.tablename = split_part(v_pol, '.', 1)
      and pp.policyname = split_part(v_pol, '.', 2)
      and pp.cmd = 'SELECT'
      and pp.roles = array['authenticated']::name[];
    if v_qual is null or position('past_due' in v_qual) = 0 then
      raise exception 'coach access: the policy % does not let a coach read a client whose payment is retrying', v_pol;
    end if;
  end loop;
end
$check$;

commit;
