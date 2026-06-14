-- PR Wall — a well-known community channel that auto-collects every PUBLIC
-- member's new personal records. Idempotent / safe to re-run.
--
-- Pieces:
--   1. A single system "PR Wall" channel (created_by null = system-owned).
--   2. pr_wall_posts — a per-user/per-lift ledger of the best value already
--      posted, so a PR is only announced once and never regresses.
--   3. post_my_pr_to_wall(...) — SECURITY DEFINER RPC the client calls when it
--      detects a new PR. It re-checks the caller is PUBLIC, confirms the value
--      beats their last posted best for that lift, posts the message as them,
--      and records the new best. Non-public members post nothing.

-- ── 1. The system channel ───────────────────────────────────────────────────
insert into public.channels (name, description, created_by, last_message, last_message_at)
select 'PR Wall',
       'Every public member''s new personal records, automatically. Set one and you''re on the wall.',
       null, 'New PRs land here.', now()
where not exists (
  select 1 from public.channels where name = 'PR Wall' and created_by is null
);

-- ── 2. Dedupe ledger (best value already posted per user + lift) ─────────────
create table if not exists public.pr_wall_posts (
  user_id   uuid not null references auth.users on delete cascade,
  lift_key  text not null,            -- lower(trimmed lift name)
  lift_label text,                    -- display form
  best_value numeric not null,        -- best value already on the wall
  unit      text,
  posted_at timestamptz not null default now(),
  primary key (user_id, lift_key)
);
alter table public.pr_wall_posts enable row level security;
-- Owner can read their own ledger; all writes go through the RPC (definer).
drop policy if exists "own pr ledger read" on public.pr_wall_posts;
create policy "own pr ledger read" on public.pr_wall_posts
  for select to authenticated using (user_id = auth.uid());

-- ── 3. Post-a-PR RPC ────────────────────────────────────────────────────────
create or replace function public.post_my_pr_to_wall(
  p_lift  text,
  p_value numeric,
  p_unit  text default 'lb',
  p_reps  int  default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_lift text := nullif(trim(p_lift), '');
  v_unit text := coalesce(nullif(trim(p_unit), ''), 'lb');
  v_vis  text;
  v_ch   uuid;
  v_name text;
  v_prev numeric;
  v_body text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  if v_lift is null or p_value is null or p_value <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  -- Public profiles only.
  select public.shape_profile_visibility(v_uid) into v_vis;
  if coalesce(v_vis, 'private') <> 'public' then
    return jsonb_build_object('ok', false, 'reason', 'not_public');
  end if;

  -- Only a genuine improvement over the last value we posted for this lift.
  select best_value into v_prev
    from public.pr_wall_posts
    where user_id = v_uid and lift_key = lower(v_lift);
  if v_prev is not null and p_value <= v_prev then
    return jsonb_build_object('ok', false, 'reason', 'not_a_pr');
  end if;

  select id into v_ch from public.channels
    where name = 'PR Wall' and created_by is null limit 1;
  if v_ch is null then return jsonb_build_object('ok', false, 'reason', 'no_channel'); end if;

  select coalesce(nullif(trim(full_name), ''), 'A member') into v_name
    from public.profiles where id = v_uid;

  -- Record/advance the ledger first (so concurrent calls can't double-post).
  insert into public.pr_wall_posts (user_id, lift_key, lift_label, best_value, unit, posted_at)
    values (v_uid, lower(v_lift), v_lift, p_value, v_unit, now())
    on conflict (user_id, lift_key)
      do update set best_value = excluded.best_value, lift_label = excluded.lift_label,
                    unit = excluded.unit, posted_at = now();

  v_body := round(p_value)::text || ' ' || v_unit || ' ' || v_lift
            || case when p_reps is not null and p_reps > 1 then ' × ' || p_reps::text else '' end
            || ' — new PR';

  insert into public.channel_messages (channel_id, sender_id, author_name, body)
    values (v_ch, v_uid, v_name, v_body);
  update public.channels set last_message = v_body, last_message_at = now() where id = v_ch;

  -- Keep them as a member so it shows in their joined list + counts.
  insert into public.channel_members (channel_id, user_id, role)
    values (v_ch, v_uid, 'member') on conflict do nothing;

  return jsonb_build_object('ok', true, 'posted', true, 'body', v_body);
end;
$$;
grant execute on function public.post_my_pr_to_wall(text, numeric, text, int) to authenticated;
