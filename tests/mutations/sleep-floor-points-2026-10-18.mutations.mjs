// Mutation spec for two sleep rules (owner, 2026-10-18): the engine reads no sleep average below
// SLEEP_MIN_NIGHTS logged nights, and a watch's good night earns +5 Shape Score points
// (supabase-migrations/2026-10-18-sleep-points.sql). The first decides what a member and their
// coaches are told; the second mints points. Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/sleep-floor-points-2026-10-18.mutations.mjs --fail-on-skipped
const ENGINE = 'public/newdesign/dashSignals.js';
const MEMBER = 'mobile-app/src/services/signalsMap.mjs';
const ROSTER = 'src/lib/roster-vitals.mjs';
const SQL = 'supabase-migrations/2026-10-18-sleep-points.sql';
const BACKEND = 'mobile-app/src/services/shapeBackend.js';
const SITE = 'public/newdesign/globalChatButton.js';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';

export default {
  test: 'node --test tests/dash-sleep-triage.test.mjs tests/dash-directive.test.mjs tests/dash-vitals-triage.test.mjs tests/sleep-recovery.test.mjs tests/roster-vitals-window.test.mjs tests/coach-settings.test.mjs tests/sleep-points.test.mjs tests/shape-score-fixes.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── The floor ──
    { name: 'the floor is one night', file: ENGINE,
      find: '    SLEEP_MIN_NIGHTS: 3,',
      replace: '    SLEEP_MIN_NIGHTS: 1,' },
    { name: 'the engine reads any number of nights', file: ENGINE,
      find: '    if (nights < THRESHOLDS.SLEEP_MIN_NIGHTS) return null;\n',
      replace: '' },
    { name: 'a record with no night count passes the floor', file: ENGINE,
      find: '? Number(s.n) : 0;',
      replace: '? Number(s.n) : 99;' },
    { name: "the member's average does not say how many nights", file: MEMBER,
      find: 'target: 7.5, n: last7.length } };',
      replace: 'target: 7.5, n: 7 } };' },
    { name: "the coach's average does not say how many nights", file: ROSTER,
      find: 'target: 7.5, n: Math.min(7, sleep.length) };',
      replace: 'target: 7.5, n: 7 };' },
    { name: "the coach's count runs past the nights averaged", file: ROSTER,
      find: 'n: Math.min(7, sleep.length) };',
      replace: 'n: sleep.length };' },

    // ── The award ──
    { name: 'a short night earns', file: SQL,
      find: 'and s.sleep_hours >= 7 and',
      replace: 'and s.sleep_hours >= 6 and' },
    { name: 'a watch left on the nightstand earns', file: SQL,
      find: 'and s.sleep_hours <= 12\n',
      replace: '\n' },
    { name: 'a typed night earns', file: SQL,
      find: "      and s.sources->>'sleep_hours' in ('apple_health', 'garmin', 'oura', 'whoop')\n",
      replace: '' },
    { name: 'a stamp the member wrote earns without a connected device', file: SQL,
      find: "      and exists (\n        select 1 from public.user_integrations i\n        where i.user_id = v_uid and i.provider = s.sources->>'sleep_hours'\n      )\n",
      replace: '' },
    { name: 'any connected device makes any stamp good', file: SQL,
      find: " and i.provider = s.sources->>'sleep_hours'\n",
      replace: '\n' },
    { name: 'nights from any time back earn', file: SQL,
      find: '      and s.snapshot_date >= v_today - 14\n',
      replace: '' },
    { name: 'future nights earn', file: SQL,
      find: '      and s.snapshot_date <= v_today\n',
      replace: '' },
    { name: 'a night pays more than five', file: SQL,
      find: "      md5('sleep_night:' || v_uid::text || ':' || r.d::text)::uuid,\n      5,",
      replace: "      md5('sleep_night:' || v_uid::text || ':' || r.d::text)::uuid,\n      50," },
    { name: 'a night pays every time it is claimed', file: SQL,
      find: "md5('sleep_night:' || v_uid::text || ':' || r.d::text)::uuid",
      replace: 'gen_random_uuid()' },
    { name: 'a night outside habits does not count in the League', file: SQL,
      find: "      v_uid, 'habits', 'sleep_night',",
      replace: "      v_uid, 'other', 'sleep_night'," },
    { name: 'anon can claim', file: SQL,
      find: 'revoke all on function public.award_sleep_points() from public, anon;',
      replace: 'revoke all on function public.award_sleep_points() from public;' },
    { name: 'the guard lets anon through', file: SQL,
      find: "  if has_function_privilege('anon', 'public.award_sleep_points()', 'EXECUTE') then\n    raise exception 'award_sleep_points is executable by anon';\n  end if;\n",
      replace: '' },
    { name: 'a signed-out call reaches the ledger', file: SQL,
      find: '  if v_uid is null then return; end if;\n\n  v_today',
      replace: '\n  v_today' },
    { name: 'the app never claims on sign-in', file: BACKEND,
      find: "  if (user) { try { window.ShapeSleepPoints?.check?.().catch(() => {}); } catch (e) {} }",
      replace: '' },
    { name: 'the app claims the wrong award', file: BACKEND,
      find: "await supabase.rpc('award_sleep_points');",
      replace: "await supabase.rpc('award_step_points');" },
    { name: 'the website never claims', file: SITE,
      find: 'quiet(cl.rpc("award_sleep_points")), ',
      replace: '' },
    { name: 'the Score page does not list a good night', file: CLIENT,
      find: "      { id: 'goodNight', capKey: 'daily', name: 'A good night', pts: '+5', cap: 'Daily', note: '7h+ from your watch or ring' },\n",
      replace: '' },
    { name: 'a good night has no ledger label', file: CLIENT,
      find: "'session_kept', 'sleep_night', 'work_milestone',",
      replace: "'session_kept', 'work_milestone'," },
  ],
};
