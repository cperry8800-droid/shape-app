-- Coach read access to a client's goals.
--
-- Client goals live in user_goals(kind='client_goals') as a JSONB document:
--   { share: bool, training: [...], nutrition: [...] }
-- user_goals is self-only (RLS), so a coach can't read it directly. This
-- SECURITY DEFINER RPC lets a coach with an active subscription to the client
-- read the goals — but ONLY when the client has left sharing on (share != false).
--
-- Reuses is_coach_on_client(uuid) from 2026-05-26-shared-clients.sql.
-- Idempotent, safe to re-run.

create or replace function public.get_client_goals(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_data jsonb;
begin
  -- Only a coach actively linked to this client may read.
  if not public.is_coach_on_client(p_user_id) then
    return null;
  end if;

  select g.data into v_data
  from public.user_goals g
  where g.user_id = p_user_id and g.kind = 'client_goals'
  limit 1;

  -- No goals saved yet → empty (still "shared" so the coach sees the section).
  if v_data is null then
    return jsonb_build_object('share', true, 'training', '[]'::jsonb, 'nutrition', '[]'::jsonb);
  end if;

  -- Client turned sharing off → reveal nothing but the fact that it's private.
  if coalesce(v_data->>'share', 'true') = 'false' then
    return jsonb_build_object('share', false);
  end if;

  return v_data;
end;
$$;

grant execute on function public.get_client_goals(uuid) to authenticated;
