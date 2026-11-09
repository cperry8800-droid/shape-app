// Mutation spec for the Score fix (2026-11-05): completion over sessions that have happened, programs
// published from the coach's library, the migration's two functions, and the 30-day note on the
// website's and the app's Score pages. Each mutation undoes one guard; the tests must fail on every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/coach-score-fix-2026-11-05.mutations.mjs --fail-on-skipped
const ROUTE = 'src/app/api/coach/score/route.ts';
const SQL = 'supabase-migrations/2026-11-05-coach-score-past-sessions.sql';
const LB = 'public/newdesign/leaderboards.jsx';
// Both roles' Score tabs are one board since coach dashboard step 4c.
const TR = 'public/newdesign/coachGoalScore.jsx';
const NOTE = 'mobile-app/src/broadsheet/BSScoreFixNote.jsx';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';

export default {
  test: 'node --test tests/coach-score-fix.test.mjs tests/coach-score-route.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── The route ──
    { name: 'a future completed session counts', file: ROUTE,
      find: "      .eq('status', 'completed')\n      .gte('scheduled_at', since90Iso)\n      .lt('scheduled_at', nowIso),",
      replace: "      .eq('status', 'completed')\n      .gte('scheduled_at', since90Iso),\n" },
    { name: 'an unmarked session is missed at once', file: ROUTE,
      find: "      .lt('scheduled_at', graceIso),",
      replace: "      .lt('scheduled_at', nowIso)," },
    { name: 'upcoming bookings are missed', file: ROUTE,
      find: "      .eq('status', 'confirmed')\n      .gte('scheduled_at', since90Iso)\n      .lt('scheduled_at', graceIso),",
      replace: "      .eq('status', 'confirmed')\n      .gte('scheduled_at', since90Iso)," },
    { name: 'never-held sessions are missed', file: ROUTE,
      find: "      .eq('status', 'confirmed')\n",
      replace: "      .in('status', ['confirmed', 'cancelled', 'declined', 'requested'])\n" },
    { name: 'completion is over every booking again', file: ROUTE,
      find: '  const totalSessions = completed + missed;',
      replace: '  const totalSessions = completed + missed + 6;' },
    { name: 'a published single workout is a program', file: ROUTE,
      find: "          .or('detail->>buildType.is.null,detail->>buildType.neq.workout')\n",
      replace: '' },
    { name: 'a draft is a program', file: ROUTE,
      find: "          .eq('published', true)\n",
      replace: '' },
    { name: 'a meal plan is a program', file: ROUTE,
      find: "          .eq('kind', 'program')\n",
      replace: '' },
    { name: 'someone else\'s programs count', file: ROUTE,
      find: "          .eq('owner_id', user.id)\n          .eq('kind', 'program')",
      replace: "          .eq('kind', 'program')" },
    { name: 'the grace is an hour', file: ROUTE,
      find: 'const SCORE_MISSED_AFTER_MS = 24 * 3600 * 1000;',
      replace: 'const SCORE_MISSED_AFTER_MS = 1 * 3600 * 1000;' },
    // ── The migration ──
    { name: 'SQL: upcoming sessions are counted', file: SQL,
      find: "    where s.provider_role = p_role\n      and s.scheduled_at >= (now() - interval '90 days')\n      and s.scheduled_at < now()\n    group by s.provider_id\n  ),\n  progs as (\n    -- Published programs in the coach's library (2026-11-05), by the listing's owner.\n    select t.id",
      replace: "    where s.provider_role = p_role\n      and s.scheduled_at >= (now() - interval '90 days')\n    group by s.provider_id\n  ),\n  progs as (\n    -- Published programs in the coach's library (2026-11-05), by the listing's owner.\n    select t.id" },
    { name: 'SQL: drafts are programs in the leaderboard', file: SQL,
      find: "      and p.published\n      and coalesce(p.detail->>'buildType', 'program') <> 'workout'\n    group by l.id",
      replace: "      and coalesce(p.detail->>'buildType', 'program') <> 'workout'\n    group by l.id" },
    { name: 'SQL: the guard stops checking the programs', file: SQL,
      find: "      raise exception '%: does not count published programs', v_name;",
      replace: '      null;' },
    // ── The note ──
    { name: 'the website note never ends', file: LB,
      find: '  if (!Number.isFinite(start) || at < start || at >= start + COACH_SCORE_FIX_DAYS * 86400000) return null;',
      replace: '  if (!Number.isFinite(start) || at < start) return null;' },
    { name: 'the website note names programs to a nutritionist', file: LB,
      find: '(role === "nutritionist" ? "sessions" : "sessions and programs")',
      replace: '"sessions and programs"' },
    { name: 'the Score board shows the note on the sample', file: TR,
      find: '  const fixNote = read.state === "ok" && typeof coachScoreFixNote === "function" ? coachScoreFixNote(role) : null;',
      replace: '  const fixNote = typeof coachScoreFixNote === "function" ? coachScoreFixNote(role) : null;' },
    { name: 'the app note never ends', file: NOTE,
      find: '  return Number.isFinite(start) && now >= start && now < start + BS_SCORE_FIX_DAYS * 86400000;',
      replace: '  return Number.isFinite(start) && now >= start;' },
    { name: 'the app note leaves {date} unfilled', file: NOTE,
      find: "      {String(text).replace('{date}', date)}",
      replace: '      {String(text)}' },
    { name: 'the app note is off the Score page', file: CLIENT,
      find: '            {profile.live && <BSScoreFixNote role={profile.coachRole} t={t} />}\n',
      replace: '' },
    { name: 'the app and website dates part', file: NOTE,
      find: "export const BS_SCORE_FIX_ON = '2026-11-05';",
      replace: "export const BS_SCORE_FIX_ON = '2026-11-12';" },
  ],
};
