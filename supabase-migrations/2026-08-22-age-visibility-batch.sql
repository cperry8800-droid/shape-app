-- One door for the age rule, asked in batches.
--
-- ⚠ WHY THIS REPLACES THE SCALAR FUNCTION IT SHIPPED WITH. The feature now has
-- THREE readers — the member's own profile, a coach's case file, and the coach
-- roster — and the roster asks about a whole client list at once. Keeping a
-- scalar door and adding a batch one would have put the entitlement predicate in
-- two places, and the copy that stops being edited is the one that goes wrong.
-- So the SET-returning form holds the rule and the scalar form is dropped; a
-- caller wanting one member passes an array of one, exactly as the existing
-- get_user_points(p_ids) batch is called from the Case File today.
--
-- ⚠ AN OMITTED ID IS THE ONLY ANSWER FOR EVERY KIND OF "NO". Not entitled, and
-- entitled-but-no-date-on-file, both produce NO ROW — hence the
-- `date_of_birth is not null` clause, which is doing real work rather than
-- tidying. Without it a caller could tell a member who has hidden their age from
-- one who never supplied a birthdate, and the first is a disclosure about a
-- choice they made. This function is callable by any authenticated user through
-- PostgREST, so that has to hold HERE and not merely in the route above it.

-- ── The one read path ────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can see rows the CALLER's RLS hides, and it therefore
-- does the whole authorization check itself. Three ways to be entitled:
--
--   1. It is your own row.
--   2. You are the member's coach, through the same active/trialing subscription
--      that `providers_read_subscriber_profiles_base` already uses. ⚠ THAT POLICY
--      ALREADY GIVES COACHES THE RAW DATE for those clients, so this branch grants
--      nothing new — it exists so every surface asks ONE door.
--   3. The member opted in via profiles.age_public.
--
-- plpgsql rather than sql for ONE reason: the size guard below has to REFUSE,
-- and a sql function can only have silently returned fewer rows than asked for.
create or replace function public.member_dobs_for_viewer(targets uuid[])
returns table (member_id uuid, dob date)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- An empty ask is not an error; it is nothing to answer.
  if targets is null or array_length(targets, 1) is null then
    return;
  end if;

  -- ⚠ REFUSE, NEVER TRUNCATE. Silently answering the first 500 of a larger ask
  -- would render as "these members have no age", which is a claim this function
  -- would not have checked. The route above caps too, but the RPC is directly
  -- callable by any authenticated user, so the cap has to live here as well.
  if array_length(targets, 1) > 500 then
    raise exception 'member_dobs_for_viewer: % ids requested, maximum is 500', array_length(targets, 1)
      using errcode = '22023';
  end if;

  return query
    select p.id, p.date_of_birth
    from public.profiles p
    where p.id = any (targets)
      and p.date_of_birth is not null       -- absence answers exactly like refusal
      and auth.uid() is not null            -- never answer an anonymous caller
      and (
        p.id = auth.uid()
        or p.age_public = true
        or exists (
          select 1
          from public.subscriptions s
          left join public.trainers      t on t.id = s.provider_id and s.provider_role = 'trainer'
          left join public.nutritionists n on n.id = s.provider_id and s.provider_role = 'nutritionist'
          where s.client_id = p.id
            and s.status = any (array['active','trialing'])
            and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
        )
      );
end;
$$;

-- ⚠ REVOKE FROM public AND anon EXPLICITLY. Supabase grants EXECUTE to `public`
-- on a new function by default and `anon` inherits it — the gap this repo has
-- already had to close twice on RPCs. The auth.uid() guard inside would refuse an
-- anonymous caller anyway, but a defence that rests on one clause is not a
-- defence; take the grant away as well.
revoke all on function public.member_dobs_for_viewer(uuid[]) from public;
revoke all on function public.member_dobs_for_viewer(uuid[]) from anon;
grant execute on function public.member_dobs_for_viewer(uuid[]) to authenticated;

-- The scalar form is now dead: its only caller was /api/members/[id]/age, which
-- this wave replaces with the batch route. Dropped rather than left in place —
-- an uncalled second copy of an authorization rule is the copy that drifts.
drop function if exists public.member_dob_for_viewer(uuid);
