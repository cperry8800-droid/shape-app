-- Age visibility: an opt-in flag, and one door that returns a birthdate only to
-- someone entitled to derive an age from it.
--
-- ⚠ THE BIRTHDATE IS THE PII; THE AGE IS THE SAFE, DERIVED FORM. The whole point
-- of this migration is that no caller ever receives a date they are not already
-- entitled to. `member_dob_for_viewer()` is the ONLY new read path, it runs as
-- the CALLER rather than with a service key, and the API route above it reduces
-- what it returns to an integer before anything reaches a browser.
--
-- ⚠ WHY A COLUMN AND NOT A KEY IN client_profiles.data. The existing preference
-- blob would have worked for a display toggle, but this flag GATES DISCLOSURE of
-- personal data. `(data->>'age_public')::boolean` is absent / null / 'false' /
-- false depending on who wrote it, and a security decision must not depend on
-- which. A typed NOT NULL DEFAULT false column has exactly two states, lives on
-- the same row as the date it governs (so the function needs no join, and cannot
-- be defeated by a MISSING preferences row), and defaults to private.
--
-- ⚠ AGE IS NOT COMPUTED HERE, DELIBERATELY. Two implementations of the 18+ rule
-- already exist and are held in step by tests/age-derive-mirror.test.mjs; the
-- set_over_18() trigger is a third piece of anniversary arithmetic. Postgres
-- CLAMPS an impossible anniversary (Feb 29 - interval '18 years' -> Feb 28) while
-- JS Date.UTC ROLLS it forward to Mar 1 — a divergence this repo has already been
-- bitten by. Adding age arithmetic here would put a fourth copy in a fourth
-- language. The date crosses to the Node server and ageFromDob() decides, once.

alter table public.profiles
  add column if not exists age_public boolean not null default false;

comment on column public.profiles.age_public is
  'Member opt-in to showing their AGE (never their birthdate) on their public profile. '
  'Default false: absence of a choice is not consent. Coaches see their own clients'' age '
  'regardless of this flag, which is why member_dob_for_viewer() checks the coach '
  'relationship separately rather than folding it into this column.';

-- ── The one read path ────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can see rows the CALLER's RLS hides, and it therefore
-- has to do the whole authorization check itself. Three ways to be entitled:
--
--   1. It is your own row.
--   2. You are the member's coach, through the same active/trialing subscription
--      that `providers_read_subscriber_profiles_base` already uses. ⚠ THAT POLICY
--      ALREADY GIVES COACHES THE RAW DATE for those clients, so this branch grants
--      nothing new — it exists so the route has ONE door to ask rather than two
--      code paths that could drift apart.
--   3. The member opted in.
--
-- ⚠ NULL IS THE REFUSAL, AND IT IS INDISTINGUISHABLE FROM "no date on file".
-- Deliberate: a caller must not be able to tell "this member hid their age" from
-- "this member has not supplied one", because the first is itself a disclosure.
create or replace function public.member_dob_for_viewer(target uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select p.date_of_birth
  from public.profiles p
  where p.id = target
    and auth.uid() is not null              -- never answer an anonymous caller
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
$$;

-- ⚠ REVOKE FROM public AND anon EXPLICITLY. Supabase grants EXECUTE to `public`
-- on a new function by default, and `anon` inherits it — the exact gap this repo
-- has already had to close twice on RPCs. The auth.uid() guard inside would refuse
-- an anonymous caller anyway, but a defence that depends on one clause is not a
-- defence; take the grant away as well.
revoke all on function public.member_dob_for_viewer(uuid) from public;
revoke all on function public.member_dob_for_viewer(uuid) from anon;
grant execute on function public.member_dob_for_viewer(uuid) to authenticated;
