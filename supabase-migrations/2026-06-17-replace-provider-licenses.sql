-- Atomic license replacement for coach credentials.
--
-- POST /api/coach/credentials replaces a provider's license set by DELETE-then-
-- INSERT. Those are two round-trips: if the INSERT fails (constraint/transient)
-- after the DELETE has committed, the provider's licenses are permanently lost.
--
-- This SECURITY DEFINER RPC does both in ONE function body (a single
-- transaction), so they succeed together or roll back together. owner_id is
-- derived from auth.uid() inside the function (never trusted from the payload),
-- and each row is re-validated (2-letter state, ISO date) — RLS stays
-- authoritative, the client cannot write another user's licenses.
--
-- Idempotent. Safe to re-run.

create or replace function public.replace_provider_licenses(p_licenses jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  delete from public.provider_licenses where owner_id = auth.uid();

  insert into public.provider_licenses (owner_id, state, license_number, expires_on, updated_at)
  select auth.uid(),
         upper(l->>'state'),
         nullif(l->>'license_number', ''),
         case when (l->>'expires_on') ~ '^\d{4}-\d{2}-\d{2}$' then (l->>'expires_on')::date end,
         now()
  from jsonb_array_elements(coalesce(p_licenses, '[]'::jsonb)) as l
  where (l->>'state') ~ '^[A-Za-z]{2}$';
end;
$$;

grant execute on function public.replace_provider_licenses(jsonb) to authenticated;
