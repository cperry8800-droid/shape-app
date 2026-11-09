// Mutation spec for a coach's public stats (owner, 2026-11-09: "coaches should be able to decide what
// they want public"): the coach's choice and its cleaner, the two headline stat keys, the read both
// surfaces call, Make it yours's What's public, and get_coach_public_stats's opt-in guards
// (supabase-migrations/2026-11-09-coach-public-stats.sql). It decides what a coach's page tells the
// public about their practice, so every mutation must be killed but the one marked a proven no-op.
// The SQL mutations are killed by tests/coach-public-stats-sql.test.mjs's database half, which needs
// PGlite: run from the repo root with SHAPE_PGLITE set to a folder that has @electric-sql/pglite:
//   SHAPE_PGLITE=<dir> node scripts/mutate.mjs --spec tests/mutations/coach-public-stats-2026-11-09.mutations.mjs --fail-on-skipped
const PC = 'public/newdesign/profileCustom.mjs';
const CW = 'public/newdesign/coachWork.mjs';
const PS = 'public/newdesign/coachPublicStats.mjs';
const BACKEND = 'mobile-app/src/services/shapeBackend.js';
const MIY = 'mobile-app/src/broadsheet/BSMakeItYours.jsx';
const SQL = 'supabase-migrations/2026-11-09-coach-public-stats.sql';

export default {
  test: 'node --test tests/coach-public-stats.test.mjs tests/coach-public-stats-sql.test.mjs tests/coach-spotlight.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── The cleaner
    { name: 'publicStats keeps the click order', file: PC,
      find: '  return BS_PUBLIC_STATS.filter((k) => seen.includes(k));', replace: '  return [...new Set(seen.filter((k) => BS_PUBLIC_STATS.includes(k)))];' },
    { name: 'publicStats reads the whole list', file: PC,
      find: '  const seen = v.slice(0, BS_PUBLIC_STATS.length * 4);', replace: '  const seen = v.slice();' },
    { name: 'publicStats takes a string for a list', file: PC,
      find: 'export function bsProfilePublicStats(v) {\n  if (!Array.isArray(v)) return [];', replace: 'export function bsProfilePublicStats(v) {\n  if (!v || typeof v.slice !== \'function\') return [];' },
    { name: 'the doc keeps an emptied list', file: PC,
      find: "if (p.length) base.publicStats = p; else delete base.publicStats; }", replace: 'base.publicStats = p; }' },
    { name: 'the doc does not clean publicStats', file: PC,
      find: "  if ('publicStats' in base) { const p = bsProfilePublicStats(base.publicStats); if (p.length) base.publicStats = p; else delete base.publicStats; }\n", replace: '' },
    // ── The headline stat keys
    { name: 'sessions is no figure', file: CW,
      find: "[['years', years], ['sessions', sessions], ['clients', clients],", replace: "[['years', years], ['clients', clients]," },
    { name: 'a trainer cannot pick clients', file: CW,
      find: "trainer: Object.freeze(['rating', 'reviews', 'years', 'sessions', 'clients', 'programs',", replace: "trainer: Object.freeze(['rating', 'reviews', 'years', 'sessions', 'programs'," },
    { name: 'a nutritionist cannot pick sessions', file: CW,
      find: "nutritionist: Object.freeze(['rating', 'reviews', 'years', 'sessions', 'clients', 'recipes',", replace: "nutritionist: Object.freeze(['rating', 'reviews', 'years', 'clients', 'recipes'," },
    // ── The read
    { name: 'a negative count is a figure', file: PS,
      find: '  return Number.isInteger(n) && n >= 0 ? n : null;', replace: '  return Number.isInteger(n) ? n : null;' },
    { name: 'a boolean is a count', file: PS,
      find: "  if (v == null || v === '' || typeof v === 'boolean') return null;", replace: "  if (v == null || v === '') return null;" },
    { name: 'null (private or unread) reads as 0', file: PS,
      find: "  if (v == null || v === '' || typeof v === 'boolean') return null;", replace: "  if (v === '' || typeof v === 'boolean') return null;" },
    { name: 'any number is a year', file: PS,
      find: '  return n === 0 || (n >= 1970 && n <= 9999) ? n : null;', replace: '  return n;' },
    { name: 'a plan key need not be a plan id', file: PS,
      find: '    if (UUID_RE.test(id) && c != null)', replace: '    if (c != null)' },
    { name: 'the plans are not bounded', file: PS,
      find: '    if (out.length >= BS_PUBLIC_PLANS_MAX) break;\n', replace: '' },
    { name: 'a plan id keeps its case', file: PS,
      find: 'out.push([id.toLowerCase(), c]);', replace: 'out.push([id, c]);' },
    { name: 'an error with data is read as figures', file: PS,
      find: "    if (error) return { state: 'error', ...EMPTY };\n", replace: '' },
    { name: 'a throw is ready', file: PS,
      find: "  } catch (e) {\n    return { state: 'error', ...EMPTY };", replace: "  } catch (e) {\n    return { state: 'ready', ...EMPTY };" },
    { name: 'any id reaches the database', file: PS,
      find: " || typeof ownerId !== 'string' || !UUID_RE.test(ownerId)) return", replace: ') return' },
    { name: 'no row is nothing public', file: PS,
      find: "  if (!row || typeof row !== 'object') return { state: 'error', ...EMPTY };", replace: "  if (!row || typeof row !== 'object') return { state: 'ready', ...EMPTY };" },
    { name: 'the read names the wrong argument', file: PS,
      find: '{ p_owner: ownerId }', replace: '{ p_user_id: ownerId }' },
    { name: 'the app reads without its client', file: BACKEND,
      find: '  forOwner: (ownerId) => bsCoachPublicStatsRead(supabase, ownerId),', replace: '  forOwner: (ownerId) => bsCoachPublicStatsRead(null, ownerId),' },
    // ── Make it yours
    { name: 'What\'s public is no change to save', file: MIY,
      find: '|| filmChanged || statsChanged || publicChanged || pinnedChanged', replace: '|| filmChanged || statsChanged || pinnedChanged' },
    // A proven no-op: every write of the editor's doc goes through bsNormalizeProfileCustom (the save,
    // and the demo's onSaved), which drops an empty publicStats; and an empty list and no key read the
    // same everywhere (bsProfilePublicStats([]) is [], and the SQL finds no key in []).
    { name: 'an emptied What\'s public keeps its key', file: MIY, expectSurvive: true,
      find: 'if (p.length) doc.publicStats = p; else delete doc.publicStats; }', replace: 'doc.publicStats = p; }' },
    { name: 'What\'s public is not written', file: MIY,
      find: '    if (publicChanged) { const p = bsProfilePublicStats(publicStats); if (p.length) doc.publicStats = p; else delete doc.publicStats; }\n', replace: '' },
    { name: 'the editor opens on the doc uncleaned', file: MIY,
      find: '      publicStats: bsProfilePublicStats(initial && initial.publicStats),', replace: '      publicStats: Array.isArray(initial && initial.publicStats) ? initial.publicStats : [],' },
    { name: 'a nutritionist reads programs', file: MIY,
      find: "const w = k === 'programClients' && role === 'nutritionist' ? BS_PUBLIC_PLANS_WORDS", replace: "const w = k === 'programClients' && role === 'trainer' ? BS_PUBLIC_PLANS_WORDS" },
    { name: 'the switches are no switches', file: MIY,
      find: 'role="switch" aria-checked={lit} data-public-stat={k}', replace: 'aria-pressed={lit} data-public-stat={k}' },
    // A proven no-op: the state's order never reaches the screen or the doc. The switches are drawn in
    // BS_PUBLIC_STATS's order and every read of the state (the change check, the save) goes through
    // bsProfilePublicStats, which puts the keys in that order.
    { name: 'a switch turned on goes last in the state', file: MIY, expectSurvive: true,
      find: ': BS_PUBLIC_STATS.filter((x) => x === k || on.includes(x)));', replace: ': [...on, k]);' },
    // ── get_coach_public_stats: the opt-in guards
    { name: 'sessions shown without the coach\'s choice', file: SQL,
      find: "(select open from gate) and (select keys from pick) @> array['sessions'] as sessions", replace: '(select open from gate) as sessions' },
    { name: 'clients shown without the coach\'s choice', file: SQL,
      find: "(select open from gate) and (select keys from pick) @> array['clients'] as clients", replace: '(select open from gate) as clients' },
    { name: 'since shown without the coach\'s choice', file: SQL,
      find: "(select open from gate) and (select keys from pick) @> array['since'] as since", replace: '(select open from gate) as since' },
    { name: 'program clients shown without the coach\'s choice', file: SQL,
      find: "(select open from gate) and (select keys from pick) @> array['programClients'] as program_clients", replace: '(select open from gate) as program_clients' },
    { name: 'a private profile is open to all', file: SQL,
      find: "      (select norm from vis) = 'public'\n      or coalesce(auth.uid() = p_owner, false)", replace: "      true\n      or coalesce(auth.uid() = p_owner, false)" },
    { name: 'any conversation makes a friend', file: SQL,
      find: '        and c.dm_key is not null', replace: '        and true' },
    { name: 'an account with no provider row is a coach', file: SQL,
      find: '    ) and exists (select 1 from provs) as open', replace: '    ) as open' },
    { name: 'the choice is read past sixteen entries', file: SQL,
      find: " and x.i <= 16\n", replace: '\n' },
    { name: 'the choice is read from any doc', file: SQL,
      find: "    where g.user_id = p_owner and g.kind = 'profile_custom' and x.i <= 16", replace: "    where g.user_id = p_owner and x.i <= 16" },
    // ── get_coach_public_stats: what each figure counts
    { name: 'a completed session ahead is coached', file: SQL,
      find: "    where s.status = 'completed'\n      and s.scheduled_at < now()\n", replace: "    where s.status = 'completed'\n" },
    { name: 'a session of another role\'s row counts', file: SQL,
      find: "    from public.sessions s\n    join provs p on p.id = s.provider_id and p.role = s.provider_role", replace: "    from public.sessions s\n    join provs p on p.id = s.provider_id" },
    { name: 'clients are counted by subscription', file: SQL,
      find: "      select count(distinct coalesce(s.client_id::text, 'sub:' || s.id::text))::integer", replace: '      select count(*)::integer' },
    { name: 'a closed subscription is an active client', file: SQL,
      find: "    where s.status in ('active', 'trialing', 'past_due')\n    ) end,", replace: '    ) end,' },
    { name: 'a subscription that never started dates the coach', file: SQL,
      find: "          where s.status not in ('pending', 'incomplete', 'incomplete_expired'))", replace: ')' },
    { name: 'since is the UTC year', file: SQL,
      find: "      ) at time zone (select tz from zone)))::integer", replace: "      ) at time zone 'UTC'))::integer" },
    { name: 'since with nothing is null', file: SQL,
      find: '      ) at time zone (select tz from zone)))::integer\n    ), 0) end,', replace: '      ) at time zone (select tz from zone)))::integer\n    )) end,' },
    { name: 'a former client is on a program', file: SQL,
      find: "      and exists (select 1 from open_subs o where o.provider_role = 'trainer' and o.provider_id = cw.trainer_id and o.client_id = cw.client_id)\n", replace: '' },
    { name: 'a past week puts a client on a program', file: SQL,
      find: '      and cw.scheduled_date >= (now() at time zone (select tz from zone))::date\n', replace: '' },
    { name: 'an archived meal plan counts', file: SQL,
      find: "    where m.status = 'published'\n", replace: '    where true\n' },
    { name: 'an unpublished plan is listed', file: SQL,
      find: '      and cp.published\n', replace: '' },
    { name: 'a single-day workout is a program', file: SQL,
      find: "(cp.kind = 'program' and coalesce(cp.detail->>'buildType', 'program') <> 'workout'", replace: "(cp.kind = 'program'" },
    { name: 'no plans is null', file: SQL,
      find: "      from plans pl\n    ), '{}'::jsonb) end;", replace: '      from plans pl\n    )) end;' },
    { name: 'PUBLIC can run it', file: SQL,
      find: 'revoke execute on function public.get_coach_public_stats(uuid) from public;\n', replace: '' },
  ],
};
