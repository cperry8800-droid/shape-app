// Mutation spec for the coach dashboard's correctness fixes (P1, 2026-11-05): Today on the coach's
// clock, the program leg from the assigned days, a past week's own food logs, intro consults, the
// whole analytics roster, the re-read on return, the meal slot, the playlist's tracks and the
// close-account step. Each mutation undoes one guard; the tests must fail on every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/coach-dashboard-p1-2026-11-05.mutations.mjs --fail-on-skipped
const TIME = 'src/lib/time.ts';
const TR_DASH = 'src/app/api/trainer/dashboard/route.ts';
const NU_DASH = 'src/app/api/nutritionist/dashboard/route.ts';
const LEGS = 'src/lib/coach-client-legs.mjs';
const OVERVIEW = 'src/lib/shared-overview.ts';
const DATA = 'public/newdesign/dashData.jsx';
const BUILDER = 'public/newdesign/dashBuilder.jsx';
const WEEK = 'public/newdesign/dashWeek.jsx';
const ROSTER = 'public/newdesign/dashRoster.jsx';
const TODAY = 'public/newdesign/dashToday.jsx';
const TR_AN = 'src/app/api/trainer/analytics/route.ts';
const NU_AN = 'src/app/api/nutritionist/analytics/route.ts';
const SCHED = 'public/newdesign/dashSchedule.jsx';
const MEALS = 'public/newdesign/dashMealCore.js';
const MEAL_UI = 'public/newdesign/dashMealBuilder.jsx';
const PLAYLISTS = 'public/newdesign/trainerPlaylistsPage.jsx';
const PROFILE = 'public/newdesign/dashProfileExtras.jsx';

export default {
  test: 'node --test tests/coach-dashboard-routes.test.mjs tests/coach-program-leg.test.mjs tests/coach-dashboard-fixes.test.mjs tests/coach-dashboard-focus-refresh.test.mjs tests/coach-close-account.test.mjs tests/coach-analytics-routes.test.mjs tests/coach-client-legs.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── 1. Today and this week on the coach's clock ──
    { name: 'a day is 24 hours, DST or not', file: TIME,
      find: '  const end = dayStartInZone(...shiftCivil(p.y, p.mo, p.d, 1), zone);',
      replace: '  const end = start + 86_400_000;' },
    { name: 'a day DST starts after midnight has no start', file: TIME,
      find: '  for (let m = 0; m <= 180; m += 15) {',
      replace: '  for (let m = 0; m <= 0; m += 15) {' },
    { name: 'the week starts on Sunday', file: TIME,
      find: '  const back = (new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay() + 6) % 7;   // 0 = Monday',
      replace: '  const back = (new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay() + 7) % 7;   // 0 = Monday' },
    { name: 'the browser\'s zone beats the listing\'s', file: TIME,
      find: "  return normalizeZone(storedZone) ?? normalizeZone(sentZone) ?? 'UTC';",
      replace: "  return normalizeZone(sentZone) ?? normalizeZone(storedZone) ?? 'UTC';" },
    { name: 'trainer: the browser\'s tz is ignored', file: TR_DASH,
      find: "(trainerRow as { timezone?: unknown } | null)?.timezone, new URL(request.url).searchParams.get('tz'));",
      replace: '(trainerRow as { timezone?: unknown } | null)?.timezone, null);' },
    { name: 'nutritionist: the listing\'s zone is ignored', file: NU_DASH,
      find: "(nutriRow as { timezone?: unknown } | null)?.timezone, new URL(request.url).searchParams.get('tz'));",
      replace: "null, new URL(request.url).searchParams.get('tz'));" },
    { name: 'trainer: Today is the UTC day again', file: TR_DASH,
      find: "    dayZone = dayBoundsInZone(now, zone) && weekBoundsInZone(now, zone) ? zone : 'UTC';",
      replace: "    dayZone = 'UTC';" },
    { name: 'the website sends no zone', file: DATA,
      find: '          _dashJson(dashRoleDashboardUrl(role)).catch(() => null),',
      replace: '          _dashJson("/api/" + role + "/dashboard").catch(() => null),' },

    // ── 2. The program from the assigned days ──
    { name: 'every day of a mid-week start is its own run', file: LEGS,
      find: '    if (!cur || cur.id !== d.id || d.anchor - cur.start > 6 * DAY_MS) {',
      replace: '    if (!cur || cur.id !== d.id || d.anchor - cur.start > 0) {' },
    { name: 'one assigned workout is a program', file: LEGS,
      find: '  const programs = runs.filter((r) => r.count >= 2 && r.name);',
      replace: '  const programs = runs.filter((r) => r.count >= 1 && r.name);' },
    { name: 'the week runs past the block', file: LEGS,
      find: '  const week = isStarted ? Math.min(pick.weeks, Math.floor((todayMs - pick.start) / WEEK) + 1) : null;',
      replace: '  const week = isStarted ? Math.floor((todayMs - pick.start) / WEEK) + 1 : null;' },
    { name: 'the oldest block is current', file: LEGS,
      find: '    ? started.reduce((a, b) => (b.start > a.start || (b.start === a.start && b.last > a.last) ? b : a))',
      replace: '    ? started.reduce((a, b) => (b.start < a.start ? b : a))' },
    { name: 'a block is overdue only the day after its end', file: LEGS,
      find: '    overdue: todayMs >= end,',
      replace: '    overdue: todayMs > end,' },
    { name: 'another trainer\'s days are the caller\'s', file: OVERVIEW,
      find: "        .eq('trainer_id', myTrainerLink)\n",
      replace: '' },
    { name: 'archived days count', file: OVERVIEW,
      find: "        .eq('status', 'published')\n        .not('payload->template->>id', 'is', null)\n",
      replace: "        .not('payload->template->>id', 'is', null)\n" },
    { name: 'a failed read of the days is "Not set"', file: OVERVIEW,
      find: '  const fromCalendar = programDaysErr ? undefined : bsWorkoutProgramLeg(',
      replace: '  const fromCalendar = programDaysErr ? null : bsWorkoutProgramLeg(' },
    { name: 'an assignment row no longer counts', file: OVERVIEW,
      find: '    : fromCalendar ?? (templatesErr ? undefined : bsProgramLeg(assignments ?? [], templateById, mine, Date.now()));',
      replace: '    : fromCalendar;' },

    // ── 3. The builder's playlist count ──
    { name: 'the picker reads track_count again', file: BUILDER,
      find: '  const n = Number(x && x.tracks);',
      replace: '  const n = Number(x && x.track_count);' },

    // ── 4. A past week's own food logs ──
    { name: 'a full window knows everything', file: LEGS,
      find: '  return { days: [...days].sort().reverse(), from: full ? oldest : null };',
      replace: '  return { days: [...days].sort().reverse(), from: null };' },
    { name: 'a burn-only day is a logged day', file: LEGS,
      find: '    if (num(r.dietary_kcal) != null) days.add(day);',
      replace: '    days.add(day);' },
    { name: 'the overview never says a window was full', file: OVERVIEW,
      find: '{ full: (snapRowsDesc ?? []).length >= SNAPSHOT_WINDOW }',
      replace: '{ full: false }' },
    { name: 'a week before the window counts as 0', file: WEEK,
      find: '  if (logDays.from && weekOf < logDays.from) return null;\n',
      replace: '' },
    { name: 'a past week shows the last seven days', file: WEEK,
      find: '  const n = dwkLoggedInWeek(rec.foodLogDays, weekOf);',
      replace: '  const n = rec.foodLogs ? rec.foodLogs.daysLogged7d : null;' },
    { name: 'a past week\'s weigh-in is today\'s', file: WEEK,
      find: '  return list.filter((x) => x.on && String(x.on).slice(0, 10) <= end);',
      replace: '  return list;' },

    // ── 5. The label ──
    { name: 'the column says ADHERENCE again', file: ROSTER,
      find: '["KEPT · 42D", "adherence"]',
      replace: '["ADHERENCE", "adherence"]' },

    // ── 6. Consults are intros ──
    { name: 'trainer: every session is a consult', file: TR_DASH,
      find: "      .eq('intro', true)\n",
      replace: '' },
    { name: 'nutritionist: an unanswered request is a consult', file: NU_DASH,
      find: "const INTRO_KEPT_STATUSES = ['confirmed', 'completed'];",
      replace: "const INTRO_KEPT_STATUSES = ['confirmed', 'completed', 'requested'];" },
    { name: 'trainer: a future intro is a consult', file: TR_DASH,
      find: "      .gte('scheduled_at', since90Iso)\n      .lte('scheduled_at', nowIso);",
      replace: "      .gte('scheduled_at', since90Iso);" },
    { name: 'nutritionist: a failed count is 0', file: NU_DASH,
      find: '    const consults90: number | null = introErr ? null : introCount ?? 0;',
      replace: '    const consults90: number | null = introCount ?? 0;' },
    { name: 'an uncounted consult total reads as "over"', file: TODAY,
      find: '  if (f.signed90 == null || f.consults90 == null) return "unread";',
      replace: '  if (f.signed90 == null) return "unread";' },

    // ── 7. The whole analytics roster ──
    { name: 'trainer: the roster is cut to 12 again', file: TR_AN,
      find: '        .sort((a, b) => (b.workouts30d ?? -1) - (a.workouts30d ?? -1)),',
      replace: '        .sort((a, b) => (b.workouts30d ?? -1) - (a.workouts30d ?? -1)).slice(0, 12),' },
    { name: 'nutritionist: the roster is cut to 12 again', file: NU_AN,
      find: '        .sort((a, b) => (b.daysLogged30d ?? -1) - (a.daysLogged30d ?? -1)),',
      replace: '        .sort((a, b) => (b.daysLogged30d ?? -1) - (a.daysLogged30d ?? -1)).slice(0, 12),' },

    // ── 8. The re-read on return ──
    { name: 'every focus re-reads', file: DATA,
      find: '    if (now - last < minMs) return false;\n',
      replace: '' },
    { name: 'a hidden tab re-reads', file: DATA,
      find: '    if (hidden) return false;\n',
      replace: '' },
    { name: 'a failed roster re-read drops to the preview', file: DATA,
      find: '        if (!roster || !roster[roleKey]) return had ? undefined : demo(today);',
      replace: '        if (!roster || !roster[roleKey]) return demo(today);' },
    { name: 'a garbled re-read drops to the preview', file: DATA,
      find: '      } catch (e) { if (!had) demo(null); }',
      replace: '      } catch (e) { demo(null); }' },
    { name: 'a re-read flashes the columns loading', file: DATA,
      find: '        if (on && !had) setState({ loading: false, clients: base, source: "live", today, planCount });',
      replace: '        if (on) setState({ loading: false, clients: base, source: "live", today, planCount });' },
    { name: 'a failed overview re-read is "unavailable"', file: DATA,
      find: '            if (!overviews[i] && before && before.has(row.id)) return before.get(row.id);\n',
      replace: '' },
    { name: 'a failed dashboard re-read drops Today', file: DATA,
      find: '        const today = todayRes && todayRes[roleKey] ? todayRes : had ? had.today : null;',
      replace: '        const today = todayRes && todayRes[roleKey] ? todayRes : null;' },
    { name: 'the pages do not ask for it', file: TODAY,
      find: '  const { today: live, triage, clients, queue, joint, source } = useDashboard(role, { refreshOnFocus: true });',
      replace: '  const { today: live, triage, clients, queue, joint, source } = useDashboard(role);' },
    { name: 'the Schedule merges a re-read month', file: SCHED,
      find: '          if (res && Array.isArray(res.events)) setCal((prev) => dscReplaceRange(prev, res, run));',
      replace: '          if (res && Array.isArray(res.events)) setCal((prev) => dscMergeRange(prev, res, run));' },
    { name: 'a re-read month keeps its cancelled bookings', file: SCHED,
      find: '  const byId = new Map(prev.events.filter(outside).map((e) => [e.id, e]));',
      replace: '  const byId = new Map(prev.events.map((e) => [e.id, e]));' },
    { name: 'the Schedule re-reads while a booking is moving', file: SCHED,
      find: '    if (dragRef.current || busyRef.current != null || !calRef.current) return;',
      replace: '    if (!calRef.current) return;' },

    // ── 9. The meal slot ──
    { name: 'every meal after the first is Lunch', file: MEALS,
      find: '    for (var i = 0; i < mains.length; i++) if (!taken[mains[i]]) return mains[i];',
      replace: '    if (!taken.Breakfast) return "Breakfast"; return "Lunch";' },
    { name: 'the builder ignores the core', file: MEAL_UI,
      find: '  if (typeof DashMeals.nextSlot === "function") return DashMeals.nextSlot(slots);\n',
      replace: '' },

    // ── 10. The playlist's tracks ──
    { name: 'the sample tracks loop to the count', file: PLAYLISTS,
      find: '  const tracks = trackTotal > 0 ? p.sampleTracks.slice(0, trackTotal) : p.sampleTracks;',
      replace: '  const tracks = [...p.sampleTracks, ...p.sampleTracks, ...p.sampleTracks].slice(0, trackTotal);' },

    // ── 11. The close-account step ──
    { name: 'the step sends without the word', file: PROFILE,
      find: '  const ready = typed.trim().toUpperCase() === PX_CLOSE_WORD && state !== "working" && state !== "deleted";',
      replace: '  const ready = state !== "working" && state !== "deleted";' },
    { name: 'the confirmation token is never spent', file: PROFILE,
      find: '  if (res.status === 428) {',
      replace: '  if (false) {' },
  ],
};
