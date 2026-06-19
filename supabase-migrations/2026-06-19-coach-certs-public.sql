-- Public read of a VERIFIED coach's certifications, for the living profile. The
-- provider_credentials row is owner-RLS (a public viewer can't read it), so this
-- SECURITY DEFINER RPC exposes ONLY the cert type + number (never the file paths),
-- and ONLY for coaches whose credentials an admin has approved AND who carry the
-- public verified flag. Unverified / self-reported certs are NOT exposed here — the
-- profile keeps showing its own (self-reported) cert list until verification, per
-- the Terms ("self-reported and not independently verified by Shape").
--
-- Idempotent. Pairs with 2026-06-19-coach-credential-verification.sql.

create or replace function public.get_coach_certs(p_user_id uuid)
returns table (cert_type text, cert_number text)
language sql
stable
security definer
set search_path = public
as $$
  select c.t->>'type' as cert_type, c.t->>'number' as cert_number
  from public.provider_credentials pc
  cross join lateral jsonb_array_elements(coalesce(pc.cert_files, '[]'::jsonb)) as c(t)
  where pc.owner_id = p_user_id
    and pc.review_status = 'approved'
    and (c.t->>'type') is not null
    and (c.t->>'type') <> ''
    and (
      exists (select 1 from public.trainers t where t.owner_id = p_user_id and t.verified)
      or exists (select 1 from public.nutritionists n where n.owner_id = p_user_id and n.verified)
    );
$$;

grant execute on function public.get_coach_certs(uuid) to anon, authenticated;
