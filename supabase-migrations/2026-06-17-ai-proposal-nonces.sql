-- Single-use proposal tokens (AI confirm). A confirm token is HMAC-signed + has a
-- 10-min TTL, but was replayable within that window — a second confirm of the same
-- token (re-render, two devices, double-tap across a remount) would re-run an
-- accumulating action (e.g. log_meal) twice. This records each confirmed nonce so
-- the confirm path can reject a replay BEFORE re-executing. Idempotent.

create table if not exists public.ai_proposal_nonces (
  nonce text primary key,
  actor_id uuid not null default auth.uid(),
  consumed_at timestamptz not null default now()
);
alter table public.ai_proposal_nonces enable row level security;
-- No direct policies: only the SECURITY DEFINER RPCs below touch this table.

-- Reserve a nonce. Returns true the FIRST time it's seen (caller may proceed),
-- false on a replay (caller must reject). Opportunistically GCs old reservations
-- (well past the 10-min token TTL). The INSERT ... ON CONFLICT DO NOTHING makes
-- the reserve atomic, so concurrent double-confirms can't both win.
create or replace function public.consume_ai_proposal(p_nonce text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  delete from public.ai_proposal_nonces where consumed_at < now() - interval '20 minutes';
  insert into public.ai_proposal_nonces (nonce, actor_id)
    values (p_nonce, auth.uid())
    on conflict (nonce) do nothing;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;
grant execute on function public.consume_ai_proposal(text) to authenticated;

-- Release a reservation the caller made (only their own) — used when execute
-- fails so the human can retry the SAME draft.
create or replace function public.release_ai_proposal(p_nonce text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.ai_proposal_nonces
   where nonce = p_nonce and actor_id = auth.uid();
end;
$$;
grant execute on function public.release_ai_proposal(text) to authenticated;
