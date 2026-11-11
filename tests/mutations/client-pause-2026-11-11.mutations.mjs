// Mutation spec for a client's break, "away until <date>" (2026-11-11).
// Run: SHAPE_PGLITE=<a folder with node_modules/@electric-sql/pglite> node scripts/mutate.mjs \
//   --spec tests/mutations/client-pause-2026-11-11.mutations.mjs --fail-on-skipped
// ⚠ THE MIGRATION'S BEHAVIOUR IS KILLED BY tests/client-pause-sql.test.mjs, WHICH NEEDS PGLITE: without
// it that file is skipped and the entries marked (db) survive.
const SQL = 'supabase-migrations/2026-11-11-client-pause.sql';
const OV = 'src/lib/shared-overview.ts';
const ENG = 'public/newdesign/dashSignals.js';
const CORE = 'src/lib/ai/notify-core.ts';
const CRON = 'src/app/api/ai/notify/cron/route.ts';
const LIVE = 'src/app/api/ai/notify/route.ts';
const SCORE = 'src/app/api/cron/score-accountability/route.ts';
const PREP = 'src/app/api/cron/prep-reminders/route.ts';
const APP = 'mobile-app/src/services/clientPause.mjs';
const LIB = 'src/lib/client-pause.mjs';
const PROS = 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const ROSTER = 'public/newdesign/dashRoster.jsx';
export default {
  test: 'node --test tests/client-pause.test.mjs tests/client-pause-sql.test.mjs tests/coach-alert-memory.test.mjs tests/member-engine-reasons.test.mjs tests/dash-signals.test.mjs',
  mutations: [
    // ── the migration ──────────────────────────────────────────────────────────
    { name: 'the table has no row level security', file: SQL,
      find: 'alter table public.client_pauses enable row level security;\n', replace: '' },
    { name: 'a signed-in caller reads the table directly', file: SQL,
      find: 'revoke all on table public.client_pauses from public, anon, authenticated;', replace: 'revoke all on table public.client_pauses from public, anon;' },
    { name: 'anyone signed in sets anyone\'s break', file: SQL,
      find: '  elsif public.is_coach_on_client(p_client_id) then', replace: '  elsif true then' },
    { name: 'a break may end any day', file: SQL,
      find: '  if p_until < v_today - 1 or p_until > v_today + 91 then', replace: '  if false then' },
    { name: 'ending early deletes the break, and the days it covered (Codex on #2705) (db)', file: SQL,
      find: '      update public.client_pauses set until_on = v_today - 1 where id = v_cur.id;', replace: '      delete from public.client_pauses where id = v_cur.id;' },
    { name: 'a break begun today is kept when ended, ending before it began (db)', file: SQL,
      find: '    if v_cur.from_on >= v_today then', replace: '    if false then' },
    { name: 'null ends nothing (db)', file: SQL,
      find: '    if v_cur.id is null then\n      return jsonb_build_object(\'paused\', false);\n    end if;\n    if v_cur.from_on', replace: '    if true then\n      return jsonb_build_object(\'paused\', false);\n    end if;\n    if v_cur.from_on' },
    { name: 'a new break rewrites the one that ended (Codex on #2705) (db)', file: SQL,
      find: '  where client_id = p_client_id and until_on >= v_today\n', replace: '  where client_id = p_client_id\n' },
    { name: 'the 90 days are UTC\'s, not the member\'s (Codex on #2705) (db)', file: SQL,
      find: "    v_today := (now() at time zone coalesce(nullif(v_tz, ''), 'UTC'))::date;", replace: "    v_today := (now() at time zone 'UTC')::date;" },
    { name: 'a device a day behind sets a break that ended yesterday (db)', file: SQL,
      find: '  v_until := greatest(p_until, v_today);', replace: '  v_until := p_until;' },
    { name: 'the oldest break is read first (db)', file: SQL,
      find: '  order by p.from_on desc, p.id desc\n  limit 1;\n$$;', replace: '  order by p.from_on, p.id\n  limit 1;\n$$;' },
    { name: 'the first run\'s table is never turned (db)', file: SQL,
      find: "                 where table_schema = 'public' and table_name = 'client_pauses' and column_name = 'from_on') then", replace: "                 where false) then" },
    { name: 'anyone signed in reads anyone\'s break', file: SQL,
      find: '    and (auth.uid() = p_client_id or public.is_coach_on_client(p_client_id))\n', replace: '' },
    { name: 'a break over long ago is still read', file: SQL,
      find: '    and p.until_on >= current_date - 15\n', replace: '\n' },
    { name: 'anon may read breaks', file: SQL,
      find: 'revoke all on function public.get_client_pause(uuid) from public, anon;', replace: 'revoke all on function public.get_client_pause(uuid) from public;' },
    // ── the overview ───────────────────────────────────────────────────────────
    { name: 'the overview never asks for the break', file: OV,
      find: "    supabase.rpc('get_client_pause', { p_client_id: clientId }),", replace: '    Promise.resolve({ data: null, error: null }),' },
    { name: 'a failed read is "no break"', file: OV,
      find: '  const pause = pauseRes.error ? undefined', replace: '  const pause = pauseRes.error ? null' },
    { name: 'a missing function is logged as a failure', file: OV,
      find: '  if (pauseRes.error && !pauseMissing) console.error', replace: '  if (pauseRes.error) console.error' },
    { name: 'the overview always carries a pause key', file: OV,
      find: '    ...(pause === undefined ? {} : { pause }),', replace: '    pause,' },
    // ── the engine ─────────────────────────────────────────────────────────────
    { name: 'a break silences nothing', file: ENG,
      find: '      flags = flags.filter(function (fl) { return !PAUSE_SILENCED[fl.key]; });\n', replace: '' },
    { name: 'no quiet first days back', file: ENG,
      find: '    if (paused && (paused.state === "paused" || paused.fresh)) {', replace: '    if (paused && paused.state === "paused") {' },
    { name: 'their last day away is not away', file: ENG,
      find: '    if (iso(now) <= p.until) return { state: "paused", until: p.until, by: by };', replace: '    if (iso(now) < p.until) return { state: "paused", until: p.until, by: by };' },
    { name: 'the member is told they are back from a break', file: ENG,
      find: '      if (coachView && (f = rulePauseEnded(paused))) flags.push(f);', replace: '      if ((f = rulePauseEnded(paused))) flags.push(f);' },
    { name: 'no "Back from a break"', file: ENG,
      find: '      if (coachView && (f = rulePauseEnded(paused))) flags.push(f);\n', replace: '' },
    { name: 'a break ended long ago still bounds the gaps', file: ENG,
      find: '    if (day >= PAUSE_BOUND_DAYS) return null;\n', replace: '' },
    { name: 'the food gap counts from before the break', file: ENG,
      find: '      if (backDay && last < backDay && (!bounded || joinDay < backDay)) {', replace: '      if (false) {' },
    { name: 'the week they came back in is a missed check-in', file: ENG,
      find: '      last = mondayOf(backDay);', replace: '      last = new Date(mondayOf(backDay).getTime() - 7 * DAY);' },
    { name: 'the quiet thread counts from before the break', file: ENG,
      find: '    if (backDay && last < backDay) {', replace: '    if (false) {' },
    { name: 'a client away with nothing recent reads "Progress unknown"', file: ENG,
      find: ' || (paused && (paused.state === "paused" || paused.fresh)))) ? "green" : "unknown";', replace: '))) ? "green" : "unknown";' },
    { name: 'the record drops the break', file: ENG,
      find: '    if (o && o.pause && typeof o.pause === "object" && typeof o.pause.until === "string") rec.pause = ', replace: '    if (false) rec.pause = ' },
    // ── the push ───────────────────────────────────────────────────────────────
    { name: 'a member on a break is nudged', file: CORE,
      find: "  if (opts.memberPaused) return { audience: 'client', candidates };\n", replace: '' },
    { name: 'the member\'s day is UTC\'s', file: CORE,
      find: "    return !!row && typeof row.until_on === 'string' && ymdInTz(now, tz) <= row.until_on;", replace: "    return !!row && typeof row.until_on === 'string' && ymdInTz(now, 'UTC') <= row.until_on;" },
    { name: 'the hourly run reads the first break, not the latest', file: CORE,
      find: ".eq('client_id', userId).order('until_on', { ascending: false }).limit(1).maybeSingle()", replace: ".eq('client_id', userId).limit(1).maybeSingle()" },
    { name: 'a failed read is a break', file: CORE,
      find: '    if (r.error) return false;\n    const row = (Array.isArray(r.data)', replace: '    if (r.error) return true;\n    const row = (Array.isArray(r.data)' },
    { name: 'the hourly run never asks', file: CRON,
      find: 'thresholds, copy, coachContext, zone: prefs.tz, memberPaused });', replace: 'thresholds, copy, coachContext, zone: prefs.tz });' },
    { name: 'the live route never asks', file: LIVE,
      find: 'thresholds, copy, coachContext, zone: prefs.tz, memberPaused });', replace: 'thresholds, copy, coachContext, zone: prefs.tz });' },
    // ── the Score and prep crons ───────────────────────────────────────────────
    { name: 'a day on a break is penalised', file: SCORE,
      find: '          if (pauseCovers(breaksBy.get(uid), day, to)) return;\n', replace: '' },
    { name: 'a check-in is judged on its Monday alone', file: SCORE,
      find: "\"last week's check-in\", lastSunday);", replace: "\"last week's check-in\");" },
    { name: 'the breaks are read without their first day', file: SCORE,
      find: "          .select('client_id, from_on, until_on')", replace: "          .select('client_id, until_on')" },
    { name: 'a full page of breaks is scored anyway', file: SCORE,
      find: '[sessRes, wosRes, habitsRes, settingsRes, pausesRes].some(', replace: '[sessRes, wosRes, habitsRes, settingsRes].some(' },
    // ── the covering rule (src/lib/client-pause.mjs) ───────────────────────────
    { name: 'a break covers the days before it began (Codex on #2705)', file: LIB,
      find: '  return breaks.some((b) => !!b && b.from <= to && b.until >= from);', replace: '  return breaks.some((b) => !!b && b.until >= from);' },
    { name: 'a break covers the days after it ended', file: LIB,
      find: '  return breaks.some((b) => !!b && b.from <= to && b.until >= from);', replace: '  return breaks.some((b) => !!b && b.from <= to);' },
    { name: 'a row with no first day is kept', file: LIB,
      find: "    if (typeof r.from_on !== 'string' || !DAY.test(r.from_on) || ", replace: '    if (' },
    { name: 'only the last break of a client is kept', file: LIB,
      find: '    const list = out.get(r.client_id) || [];', replace: '    const list = [];' },
    { name: 'a failed pauses read charges the chunk anyway', file: SCORE,
      find: '      if (pausesRes.error && !pausesMissing) {', replace: '      if (false) {' },
    { name: 'a member away is reminded to prep', file: PREP,
      find: '      if (pauseCovers(breaksBy.get(userId), today)) continue;\n', replace: '' },
    // ── the app ────────────────────────────────────────────────────────────────
    { name: 'any day is a valid end', file: APP,
      find: '  return v >= min && v <= max;', replace: '  return true;' },
    { name: 'the app reads a failed read as "no break"', file: APP,
      find: "    if (error) return error.code === 'PGRST202' ? { ok: true, ready: false } : { ok: false };", replace: '    if (error) return { ok: true, ready: true, pause: null };' },
    { name: 'a day out of range is sent', file: APP,
      find: "  if (until != null && !validPauseDay(until)) return { ok: false, error: 'range' };\n", replace: '' },
    { name: 'the last day away does not hold', file: APP,
      find: '  return !!(pause && typeof pause.until === \'string\' && ISO_DAY.test(pause.until) && localDay(now) <= pause.until);', replace: '  return !!(pause && typeof pause.until === \'string\' && ISO_DAY.test(pause.until) && localDay(now) < pause.until);' },
    { name: 'a refusal reads as a failure', file: APP,
      find: "    return { ok: false, error: error.code === '42501' ? 'refused'", replace: "    return { ok: false, error: false ? 'refused'" },
    // ── the screens ────────────────────────────────────────────────────────────
    { name: 'the case file has no break card', file: PROS,
      find: "        {clientUid && <BSClientPauseCard key={'pause:' + clientUid} clientId={clientUid} t={t} />}\n", replace: '' },
    { name: 'the roster never says Away', file: PROS,
      find: "label: away && sev === 'green' ? coachTr('coach:roster.labelAway', { defaultValue: 'AWAY' }) : ", replace: 'label: ' },
    { name: 'Settings has no Away', file: CLIENT,
      find: "            <BSPauseSetting t={t} coach={isCoachRole} />\n", replace: '' },
    { name: 'the website\'s nutritionist panel has no break', file: ROSTER,
      find: '      ["training", "From the trainer side · read-only", DashSecTrainingContext],\n      ["pause", "Away · a break from alerts", DashSecPause],', replace: '      ["training", "From the trainer side · read-only", DashSecTrainingContext],' },
  ],
};
