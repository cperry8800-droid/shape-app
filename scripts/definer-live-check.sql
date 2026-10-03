-- READ-ONLY. Lists EVERY SECURITY DEFINER function in `public`, whether anon can EXECUTE it right
-- now, and whether its search_path ends in pg_temp. Trigger and event-trigger functions are
-- INCLUDED and marked `is_trigger`: nothing can call one as an RPC, so its anon_executable decides
-- nothing (the diff script ignores it), but a trigger definer is exactly as exposed to a relation
-- planted in pg_temp as any other, so its pin is checked like the rest. One scope for all three
-- readers of this data (this query, scripts/definer-live-diff.mjs, tests/helpers/definer-live.mjs):
-- anon-executability over the non-trigger rows, the pin over all of them.
--
-- WHY THIS EXISTS. A definer runs with its owner's rights, and Supabase's default privileges
-- grant EXECUTE on every new function to anon and authenticated by name. `revoke ... from
-- public` removes only the implicit PUBLIC grant, so a function whose migration says "revoke
-- from public; grant to authenticated" is still callable by the whole internet. The migrations
-- cannot say what the live database holds (the base tables were created outside them, and
-- privileges get changed by hand), so this reads the catalog itself. It is the authority;
-- tests/definer-grants.test.mjs is a static tripwire for NEW functions and this checks it.
--
-- HOW TO RUN. Paste the whole statement into the Supabase SQL editor and run it. It returns ONE
-- row with ONE column, `rows`, holding a JSON array. Copy that cell and pipe it in:
--
--     pbpaste | node scripts/definer-live-diff.mjs          # macOS; or save the cell to rows.json
--     node scripts/definer-live-diff.mjs < rows.json
--
-- The script accepts the array itself, or the `[{ "rows": [...] }]` wrapper a SQL client puts
-- around a one-cell result. Exit status 0 means every anon-executable definer is accounted for in
-- tests/fixtures/definer-anon-allowlist.json (an entry, or a registered finding).
--
-- HOW TO READ A ROW (the diff script does this for you; this is what it checks):
--   anon_executable = true    the function is callable with no account. It MUST be in the
--                             allow-list's `entries` (with the class that makes it safe) or in
--                             `registeredFindings` (known, named, not yet fixed). A row that is in
--                             neither is a new exposure: fix it with
--                                 revoke execute on function public.<name>(<args>) from public, anon;
--                             (revoking from PUBLIC alone leaves the explicit anon grant standing)
--                             or classify it if anon really must reach it.
--   pg_temp_pinned = false    the search_path does not END in pg_temp, so a caller can plant a
--                             relation or type in their own pg_temp schema and have the definer
--                             resolve it. It MUST be in `registeredPinFindings`, or be fixed with
--                                 alter function public.<name>(<args>) set search_path = public, pg_temp;
--                             `search_path` shows the stored value. A quoted single element such as
--                             "public, pg_temp" is one schema NAMED that, and reads as unpinned here.
--                             This applies to trigger definers too.
--   is_trigger = true         the function returns trigger or event_trigger. Its anon_executable is
--                             ignored (it cannot be called as an RPC); its pin is not.
--   identity_args             the argument list as Postgres prints it. A NAME that appears with more
--                             than one of these (among the non-trigger rows) fails the diff: the
--                             allow-list is by name, so an overload made outside the migrations would
--                             inherit the entry of the function it shares a name with. The diff
--                             refuses a capture that lacks this column.
--   authenticated_executable  informational: signed-in callers.
--
-- This statement only reads pg_proc and pg_namespace and calls has_function_privilege.

with d as (
  select
    p.proname                                                       as proname,
    pg_get_function_identity_arguments(p.oid)                       as identity_args,
    (p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype)) as is_trigger,
    has_function_privilege('anon', p.oid, 'EXECUTE')                as anon_executable,
    has_function_privilege('authenticated', p.oid, 'EXECUTE')       as authenticated_executable,
    sp.val                                                          as search_path,
    coalesce(sp.val ~ '(^|,)[[:space:]]*pg_temp[[:space:]]*$', false) as pg_temp_pinned
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral (
    select (select right(cfg, -length('search_path='))
            from unnest(coalesce(p.proconfig, '{}')) cfg
            where cfg like 'search\_path=%'
            limit 1) as val
  ) sp
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.prosecdef
)
select coalesce(json_agg(to_jsonb(d) order by d.proname, d.identity_args), '[]'::json) as rows
from d;

-- To eyeball the same data as a table instead, run:
--   select proname, identity_args, is_trigger, anon_executable, authenticated_executable, pg_temp_pinned, search_path
--   from (<the CTE above>) d order by is_trigger, anon_executable desc, proname;
