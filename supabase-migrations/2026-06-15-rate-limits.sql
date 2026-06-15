-- Rate limiting backend: a fixed-window counter table + an atomic SECURITY
-- DEFINER function the Edge proxy calls on every API request.
--
-- The table is RLS-locked with NO policies (only the definer function touches
-- it). check_rate_limit() is granted to anon + authenticated so the proxy's
-- anon-key client can enforce limits for signed-out and signed-in callers
-- alike. Idempotent — safe to re-run.

create table if not exists public.rate_limits (
  bucket      text primary key,
  count       integer not null default 0,
  expires_at  timestamptz not null
);

alter table public.rate_limits enable row level security;
-- (deliberately no policies: deny all direct access; the SECURITY DEFINER
--  function below is the only reader/writer)

create index if not exists rate_limits_expires_idx on public.rate_limits (expires_at);

-- Atomically bump the counter for (key, current time-window) and report whether
-- the caller is still under the limit. Fixed-window: the window id is
-- floor(epoch / window_seconds), so each key+window is one row.
create or replace function public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window  bigint      := floor(extract(epoch from now()) / p_window_seconds);
  v_bucket  text        := p_key || ':' || v_window;
  v_expires timestamptz := to_timestamp((v_window + 1) * p_window_seconds);
  v_count   integer;
begin
  -- Opportunistic GC so the table can't grow unbounded without pg_cron.
  if random() < 0.005 then
    delete from public.rate_limits where expires_at < now();
  end if;

  insert into public.rate_limits as r (bucket, count, expires_at)
       values (v_bucket, 1, v_expires)
  on conflict (bucket)
  do update set count = r.count + 1
  returning r.count into v_count;

  return query
    select (v_count <= p_max),
           greatest(p_max - v_count, 0),
           greatest(ceil(extract(epoch from (v_expires - now())))::int, 0);
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, integer, integer) to anon, authenticated;
