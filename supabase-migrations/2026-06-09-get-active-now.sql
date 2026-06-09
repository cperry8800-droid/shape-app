-- Active-now roster for the "Training now" presence rail: who is mid-workout /
-- cooking RIGHT NOW (user_activity, not expired) WITH their name · role · points
-- (→ tier) · avatar, so the rail renders real people instead of demo. The activity
-- is already opt-in + shown as the avatar dot, so surfacing the same set here is
-- consistent. SECURITY DEFINER so it can read score_ledger (self-only) + identity
-- for the small active set. Idempotent.
create or replace function public.get_active_now(p_limit int default 24)
returns table (
  user_id uuid,
  kind text,
  full_name text,
  role text,
  points bigint,
  avatar text,
  started_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.user_id,
    a.kind,
    coalesce(p.full_name, 'Shape member') as full_name,
    p.role,
    coalesce((select sum(s.delta) from public.score_ledger s where s.user_id = a.user_id), 0)::bigint as points,
    (select g.data->>'photo' from public.user_goals g where g.user_id = a.user_id and g.kind = 'client_identity' limit 1) as avatar,
    a.started_at
  from public.user_activity a
  join public.profiles p on p.id = a.user_id
  where a.expires_at > now()
    and a.kind in ('workout', 'cooking')
  order by a.started_at desc
  limit greatest(1, least(p_limit, 50));
$$;

grant execute on function public.get_active_now(int) to anon, authenticated;
