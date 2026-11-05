// Mutation spec for P4 of the coach-dashboard wiring (2026-11-05): profile-view counting (the rules,
// the beacon route, the two beacons, the migration and the funnel's read), the Goal page's store
// (start, due, the archive, compare-and-set writes) and pace (the engine's projectGoal against the due
// date), the weekly adherence readings, programs' published_at, and the coach's own Score history.
// A survivor is a missing test, or a proven no-op marked expectSurvive with its proof.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/coach-growth-goals-data-2026-11-05.mutations.mjs --fail-on-skipped
const PV = 'src/lib/profile-views.mjs';
const PV_ROUTE = 'src/app/api/analytics/profile-view/route.ts';
const PV_SQL = 'supabase-migrations/2026-11-05-coach-profile-views.sql';
const PV_WEB = 'public/newdesign/profileView.mjs';
const PV_NEXT = 'src/components/ProfileViewBeacon.tsx';
const CPW = 'public/newdesign/coachProfileWeb.jsx';
const GROWTH = 'src/lib/coach-growth.ts';
const CG = 'public/newdesign/coachGoals.js';
const T_PAGE = 'public/newdesign/trainerGoalPage.jsx';
const N_PAGE = 'public/newdesign/nutritionistGoalPage.jsx';
const DATA = 'public/newdesign/dashData.jsx';
const READ_ROUTE = 'src/app/api/coach/goal-readings/route.ts';
const REC = 'src/lib/coach-goal-readings.ts';
const T_AN = 'src/app/api/trainer/analytics/route.ts';
const N_AN = 'src/app/api/nutritionist/analytics/route.ts';
const R_SQL = 'supabase-migrations/2026-11-05-coach-goal-readings.sql';
const P_SQL = 'supabase-migrations/2026-11-05-coach-plans-published-at.sql';
const HIST = 'src/app/api/coach/score/history/route.ts';

export default {
  test: 'node --test tests/profile-views.test.mjs tests/coach-goals.test.mjs tests/coach-goal-readings.test.mjs tests/coach-analytics-routes.test.mjs tests/coach-growth.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── Profile views: the rules ──
    { name: 'a bot is counted', file: PV, find: '  return BOT_RE.test(s);\n', replace: '  return false;\n' },
    { name: 'a short or missing agent is counted', file: PV, find: '  if (s.length < 12) return true;\n', replace: '' },
    { name: 'a Cubot phone is a bot', file: PV, find: '(?<!cu)bot(?:\\b|[\\/_-])', replace: 'bot(?:\\b|[\\/_-])' },
    { name: 'a headless browser is a person', file: PV, find: '|headless|', replace: '|' },
    { name: 'any role is a listing', file: PV, find: "  if (typeof role !== 'string' || !PROFILE_VIEW_ROLES.includes(role)) return null;\n", replace: '' },
    { name: 'a zero id is a listing', file: PV, find: '!Number.isSafeInteger(id) || id <= 0) return null;', replace: '!Number.isSafeInteger(id)) return null;' },
    { name: 'the beacon keeps its extra fields', file: PV, find: '  return { role, id };\n}', replace: '  return { ...raw, role, id };\n}' },
    { name: 'the buckets are not keyed', file: PV, find: "  const digest = (msg) => (secret\n    ? createHmac('sha256', String(secret)).update(msg).digest('hex')\n    : createHash('sha256').update(msg).digest('hex'));", replace: "  const digest = (msg) => createHash('sha256').update(msg).digest('hex');" },
    { name: 'the view bucket forgets the listing', file: PV, find: 'view: digest(`pview|${addr}|${role}|${id}`).slice(0, 40),', replace: 'view: digest(`pview|${addr}`).slice(0, 40),' },
    { name: 'the bucket is the address itself', file: PV, find: 'addr: digest(`pview-addr|${addr}`).slice(0, 40),', replace: 'addr: addr,' },
    { name: 'the forwarded address is taken whole', file: PV, find: "h('x-forwarded-for').split(',')[0]", replace: "h('x-forwarded-for')" },
    { name: 'the window misses today', file: PV, find: 'return new Date(now - (days - 1) * 86400000)', replace: 'return new Date(now - days * 86400000)' },
    { name: 'the views are read for every role', file: PV, find: "      .eq('provider_role', role)\n      .eq('provider_id', providerId)\n      .gte('day'", replace: "      .eq('provider_id', providerId)\n      .gte('day'" },
    { name: 'an unread count is 0', file: PV, find: '    if (error || !Array.isArray(data)) return null;', replace: '    if (error || !Array.isArray(data)) return 0;' },

    // ── Profile views: the route ──
    { name: 'the route counts under GPC', file: PV_ROUTE, find: '    if (gpcOptOut(request)) return new NextResponse(null, { status: 204 });\n', replace: '' },
    { name: 'the route counts bots', file: PV_ROUTE, find: "    if (isLikelyBot(request.headers.get('user-agent'))) return new NextResponse(null, { status: 204 });\n", replace: '' },
    { name: 'the coach\'s own visit cannot be left out', file: PV_ROUTE, find: '      p_viewer: user?.id ?? null,', replace: '      p_viewer: null,' },
    { name: 'the route stores the address', file: PV_ROUTE, find: '      p_addr: buckets.addr,', replace: '      p_addr: callerAddress(request.headers),' },
    { name: 'a failed store is silent', file: PV_ROUTE, find: "    if (error) console.warn('[profile-view] record failed:', error.message);\n", replace: '' },

    // ── Profile views: the migration ──
    { name: 'the coach\'s own visit counts', file: PV_SQL, find: '  if p_viewer is not null and p_viewer = v_owner then\n    return false;\n  end if;\n', replace: '' },
    { name: 'a listing with no coach makes rows', file: PV_SQL, find: '  if v_owner is null then\n    return false;\n  end if;\n', replace: '' },
    { name: 'reloads count', file: PV_SQL, find: "_rate_limit_bump('fn:pview:' || p_bucket, 1, 1800)", replace: "_rate_limit_bump('fn:pview:' || p_bucket, 100, 1800)" },
    { name: 'anyone reads the counts', file: PV_SQL, find: '    (provider_role = \'trainer\' and exists (\n      select 1 from public.trainers t where t.id = provider_id and t.owner_id = (select auth.uid())))', replace: '    (provider_role = \'trainer\')' },
    { name: 'a signed-in caller can record views', file: PV_SQL, find: 'revoke all on function public.record_coach_profile_view(text, bigint, uuid, text, text) from public, anon, authenticated;', replace: 'revoke all on function public.record_coach_profile_view(text, bigint, uuid, text, text) from public, anon;' },

    // ── Profile views: the beacons ──
    { name: 'the website counts every call', file: PV_WEB, find: '  if (seen.has(key)) return false;\n', replace: '' },
    { name: 'the website ignores consent', file: PV_WEB, find: '    if (!consentAllows(win, rule)) return;\n', replace: '' },
    { name: 'the website counts a test browser', file: PV_WEB, find: '    try { if (win.navigator && win.navigator.webdriver === true) return; } catch (e) { return; }\n', replace: '' },
    { name: 'the website does not wait for the consent script', file: PV_WEB, find: '      if (left > 0) timers.setTimeout(() => attempt(left - 1), PROFILE_VIEW_WAIT_MS);\n', replace: '' },
    { name: 'the website counts with no consent rule', file: PV_WEB, find: "    if (typeof rule !== 'function') {", replace: "    if (typeof rule !== 'function') { send({ role: r, id });" },
    { name: 'the profile counts the coach\'s own page', file: CPW, find: 'if (listed && !isSelf && K.countProfileView)', replace: 'if (listed && K.countProfileView)' },
    { name: 'the Next pages ignore consent', file: PV_NEXT, find: '      if (window.navigator.webdriver === true || !allowedOn(window)) return;', replace: '      if (window.navigator.webdriver === true) return;' },
    { name: 'the Next pages count every render', file: PV_NEXT, find: '    if (sent.has(key)) return;\n', replace: '' },

    // ── The funnel ──
    { name: 'the funnel drops the views', file: GROWTH, find: '    funnel: { views, consults90, signed90: signed },', replace: '    funnel: { views: null, consults90, signed90: signed },' },
    { name: 'the funnel never reads the views', file: GROWTH, find: '  return growthFrom(rows, { existing, consults90, views: await viewsRead });', replace: '  return growthFrom(rows, { existing, consults90 });' },

    // ── Goals: the store ──
    { name: 'a new goal has no start date', file: CG, find: '      if (!isDay(g.startDate)) g.startDate = today;\n', replace: '' },
    { name: 'a past start date takes today\'s figure', file: CG, find: '      if (num(g.start) == null && g.startDate === today) {', replace: '      if (num(g.start) == null) {' },
    { name: 'a rebound goal keeps the old figure\'s start', file: CG, find: '      if (prev && num(input && input.start) === num(prev.start)) delete g.start;\n', replace: '' },
    { name: 'programs published start from the bound figure', file: CG, find: 'var from = g.metric === "programsPublished" ? 0 : g.metric ? num(opts.current) : num(g.cur);', replace: 'var from = g.metric ? num(opts.current) : num(g.cur);' },
    { name: 'a bound goal keeps typed readings', file: CG, find: '      delete g.history;\n', replace: '' },
    { name: 'a typed goal records no readings', file: CG, find: '      if (cur != null && changed) g.history = addReading(had, today, cur);\n', replace: '' },
    // (Round 1: a filter in addReading survived. cleanReadings already keeps one reading a day, the
    // last, so the filter was a no-op; it went, and the rule is mutated where it lives.)
    { name: 'a day keeps its first reading, not its last', file: CG, find: '      byDay[p.on] = v;', replace: '      if (!(p.on in byDay)) byDay[p.on] = v;' },
    { name: 'a day keeps every reading', file: CG, find: '    return Object.keys(byDay).sort().map(function (on) { return { on: on, value: byDay[on] }; });', replace: '    return list(raw).filter(function (p) { return p && isDay(p.on) && num(p.value) != null; }).map(function (p) { return { on: p.on, value: num(p.value) }; });' },
    { name: 'junk days are kept', file: CG, find: '    if (!isDay(out.due)) delete out.due;\n', replace: '' },
    { name: 'Archive deletes the goals', file: CG, find: '    return Object.assign({}, doc, { goals: [], archived: moved.concat(archivedOf(doc)).slice(0, ARCHIVE_MAX) });', replace: '    return Object.assign({}, doc, { goals: [], archived: archivedOf(doc) });' },
    { name: 'Archive loses the last quarter\'s archive', file: CG, find: 'moved.concat(archivedOf(doc)).slice(0, ARCHIVE_MAX)', replace: 'moved.slice(0, ARCHIVE_MAX)' },
    { name: 'Archive keeps no final figure', file: CG, find: '      return Object.assign({}, g, { archivedAt: at, final: f });', replace: '      return Object.assign({}, g, { archivedAt: at, final: null });' },
    { name: 'Archive takes a bound goal\'s typed CURRENT as its end', file: CG, find: ': (g.metric ? null : num(g.cur));', replace: ': num(g.cur);' },
    { name: 'Restore leaves the goal in the archive', file: CG, find: 'archived: arch.filter(function (x) { return x !== hit; }) });', replace: 'archived: arch });' },
    { name: 'Restore keeps the archive stamp', file: CG, find: '    delete g.archivedAt; delete g.final;\n', replace: '' },
    { name: 'a restored goal can share an id', file: CG, find: '    if (goals.some(function (x) { return x && x.id === g.id; })) g.id = newGoalId(opts && opts.now);\n', replace: '' },

    // ── Goals: compare-and-set ──
    { name: 'a conflict is a failure, not a re-read', file: CG, find: '        if (res && res.conflict) continue;\n', replace: '' },
    { name: 'a failed read writes an empty document', file: CG, find: '        if (!cur || typeof cur !== "object") return { ok: false, reason: "unreadable" };', replace: '        if (!cur || typeof cur !== "object") cur = {};' },
    { name: 'the revision does not move', file: CG, find: '{ rev: revOf(cur) + 1 }', replace: '{ rev: revOf(cur) }' },
    { name: 'the write is blind', file: CG, find: '        var res = db.saveUserGoalsIfRev\n          ? await db.saveUserGoalsIfRev(kind, next, revToken(cur), uid)\n          : await db.saveUserGoals(kind, next, { expectedUserId: uid });', replace: '        var res = await db.saveUserGoals(kind, next, { expectedUserId: uid });' },
    { name: 'the read is not bound to the account', file: CG, find: '        var cur = await db.getUserGoals(kind, { expectedUserId: uid });', replace: '        var cur = await db.getUserGoals(kind);' },
    { name: 'a switched account is a plain failure', file: CG, find: '        if (res && res.accountChanged) return { ok: false, reason: "account-changed" };\n', replace: '' },

    // ── Goals: the series and the bound figure ──
    { name: 'programs published before the start count', file: CG, find: '    return readings.programs.published.filter(function (d) { return isDay(d) && d >= since && d <= today; }).length;', replace: '    return readings.programs.published.filter(function (d) { return isDay(d) && d <= today; }).length;' },
    { name: 'a goal with no start date counts every program', file: CG, find: 'function programsSince(goal, now) { return goal && isDay(goal.startDate) ? goal.startDate : quarterStart(now); }', replace: 'function programsSince(goal, now) { return goal && isDay(goal.startDate) ? goal.startDate : "2000-01-01"; }' },
    { name: 'unread programs are none', file: CG, find: '    if (readings.kind !== "live" || !readings.programs || !Array.isArray(readings.programs.published)) return null;', replace: '    if (readings.kind !== "live" || !readings.programs || !Array.isArray(readings.programs.published)) return 0;' },
    { name: 'this week\'s reading is dated the week\'s end', file: CG, find: '        return { on: end > today ? today : end, value: v };', replace: '        return { on: end, value: v };' },
    { name: 'net a month is in cents', file: CG, find: '(num(w.mrrNetCents) == null ? null : Math.round(num(w.mrrNetCents) / 100))', replace: 'num(w.mrrNetCents)' },
    { name: 'unread clients are an empty series', file: CG, find: '      if (!live || live.kind !== "live" || !live.trajectory || !Array.isArray(live.trajectory.weeks)) return null;', replace: '      if (!live || live.kind !== "live" || !live.trajectory || !Array.isArray(live.trajectory.weeks)) return [];' },

    // ── Goals: the outlook ──
    { name: 'today\'s figure is not a reading', file: CG, find: '    if (current != null) pts = cleanReadings(pts.concat([{ on: today, value: current }]));\n', replace: '' },
    { name: 'the start is not read off the start date', file: CG, find: '    if (start == null && isDay(goal.startDate)) start = valueOn(pts, goal.startDate);\n', replace: '' },
    { name: 'late is on track', file: CG, find: '      if (diff <= 0) {', replace: '      if (diff <= 7) {' },
    { name: 'a passed due date is still on pace', file: CG, find: '    if (due && today > due) {', replace: '    if (false) {' },
    { name: 'heading ignores the pace', file: CG, find: '      heading = p.lastValue + (p.ratePerWeek / 7) * daysFrom(p.lastOn, due);', replace: '      heading = p.lastValue;' },
    { name: 'a percent heads past 100 and below none', file: CG, find: '      if (goal.metric || goal.money || goal.pct) heading = Math.max(0, heading);\n', replace: '' },
    { name: 'programs heading reads a decimal', file: CG, find: '    if (goal && (goal.metric === "activeClients" || goal.metric === "programsPublished")) return String(Math.round(v));\n', replace: '' },
    { name: 'a stalled goal with a due date reads stalled', file: CG, find: '    if (!due) return { state: p.state, line: p.state === "far" ? "More than a year away at this pace" : "Pace stalled" };', replace: '    return { state: p.state, line: p.state === "far" ? "More than a year away at this pace" : "Pace stalled" };' },

    // ── Goals: the pages and dashData ──
    { name: 'trainer Archive deletes every goal again', file: T_PAGE, find: '    persistOp((doc) => CoachGoals.archiveGoals(doc, { now: new Date(), finals }), "Archived.");', replace: '    persistOp((doc) => ({ ...doc, goals: [] }), "Archived.");' },
    { name: 'nutritionist Archive deletes every goal again', file: N_PAGE, find: '    persistOp((doc) => CoachGoals.archiveGoals(doc, { now: new Date(), finals }), "Archived.");', replace: '    persistOp((doc) => ({ ...doc, goals: [] }), "Archived.");' },
    { name: 'trainer Archive does not ask', file: T_PAGE, find: '    if (!(await window.ShapeConfirm.open({ title: "Archive these goals?"', replace: '    if (false && !(await window.ShapeConfirm.open({ title: "Archive these goals?"' },
    { name: 'nutritionist Archive does not ask', file: N_PAGE, find: '    if (!(await window.ShapeConfirm.open({ title: "Archive these goals?"', replace: '    if (false && !(await window.ShapeConfirm.open({ title: "Archive these goals?"' },
    { name: 'a failed trainer save leaves the page changed', file: T_PAGE, find: '    setState(before);\n', replace: '' },
    { name: 'a failed nutritionist save leaves the page changed', file: N_PAGE, find: '    setState(before);\n', replace: '' },
    { name: 'the trainer archive is never shown', file: T_PAGE, find: '        {archived.length > 0 && (', replace: '        {false && (' },
    { name: 'the nutritionist card shows no pace', file: N_PAGE, find: '        {outlook && outlook.line && <div', replace: '        {false && <div' },
    { name: 'programs published are not offered', file: DATA, find: '    ["programsPublished", role === "trainer" ? "Programs published since the start date" : "Meal plans published since the start date"],\n', replace: '' },
    { name: 'programs published wait for the analytics read', file: DATA, find: '  if (metric === "programsPublished") return window.CoachGoals ? window.CoachGoals.programsBound(goal, readings) : null;\n', replace: '' },

    // ── The readings: recorded and read ──
    { name: 'an unread figure is recorded', file: REC, find: '  if (value == null || !Number.isFinite(value)) return false;\n', replace: '  if (value == null) value = 0;\n' },
    { name: 'the trainer route records nothing', file: T_AN, find: "  const goalReading = recordGoalReading(supabase, 'trainer', providerId, avgAdherencePct);", replace: '  const goalReading = Promise.resolve(false);' },
    { name: 'the nutritionist route records another figure', file: N_AN, find: "recordGoalReading(supabase, 'nutritionist', providerId, proteinAdherencePct);", replace: "recordGoalReading(supabase, 'nutritionist', providerId, avgLogsPerClient);" },
    { name: 'the readings route reads any listing', file: READ_ROUTE, find: '  const providerId = (owned.find((p) => p.id === wanted) ?? owned[0]).id;', replace: '  const providerId = Number.isFinite(wanted) && wanted > 0 ? wanted : owned[0].id;' },
    { name: 'unpublished programs count', file: READ_ROUTE, find: ".eq('kind', kind).eq('published', true);", replace: ".eq('kind', kind);" },
    { name: 'programs count by their creation day', file: READ_ROUTE, find: "(source === 'published_at' ? r.published_at || r.created_at : r.created_at)", replace: '(r.created_at)' },
    { name: 'a missing column is a failed read', file: READ_ROUTE, find: "  return !!error && (error.code === '42703' || error.code === 'PGRST204' || /published_at/.test(String(error.message || '')));", replace: '  return false;' },
    { name: 'unread readings are an empty history', file: READ_ROUTE, find: "    console.warn('[coach/goal-readings] adherence readings unread:', error.message);\n    return null;", replace: "    console.warn('[coach/goal-readings] adherence readings unread:', error.message);\n    return [];" },
    { name: 'readings come back as text', file: READ_ROUTE, find: ".map((r) => ({ on: String(r.on_day || r.week_of || ''), value: Number(r.value) }))", replace: ".map((r) => ({ on: String(r.on_day || r.week_of || ''), value: r.value as number }))" },

    // ── The readings and published_at: the migrations ──
    { name: 'a reading is written for any listing', file: R_SQL, find: '    if not exists (select 1 from public.trainers t where t.id = p_provider_id and t.owner_id = v_uid) then\n      return false;\n    end if;', replace: '    null;' },
    { name: 'a percent over 100 is a reading', file: R_SQL, find: 'if p_value is null or p_value < 0 or p_value > 100 then', replace: 'if p_value is null or p_value < 0 then' },
    { name: 'a week holds its first reading', file: R_SQL, find: 'do update set value = excluded.value, on_day = excluded.on_day, updated_at = now();', replace: 'do nothing;' },
    { name: 'a republish moves the publish date', file: P_SQL, find: '    if new.published and old.published_at is null then\n      new.published_at := now();', replace: '    if new.published and not old.published then\n      new.published_at := now();' },
    { name: 'a writer sets the publish date', file: P_SQL, find: "    new.published_at := case when new.published then now() else null end;", replace: "    new.published_at := case when new.published then coalesce(new.published_at, now()) else null end;" },
    { name: 'the backfill dates drafts', file: P_SQL, find: 'update public.coach_plans set published_at = created_at\nwhere published and published_at is null;', replace: 'update public.coach_plans set published_at = created_at\nwhere published_at is null;' },
    { name: 'the backfill stamps every plan as edited', file: P_SQL, find: 'alter table public.coach_plans disable trigger coach_plans_touch;\n', replace: '' },

    // ── Score history ──
    { name: 'history reads any listing', file: HIST, find: '  const providerId = (owned.find((p) => p.id === wanted) ?? owned[0]).id;', replace: '  const providerId = Number.isFinite(wanted) && wanted > 0 ? wanted : owned[0].id;' },
    { name: 'history has no ceiling', file: HIST, find: 'Math.min(asked, SCORE_HISTORY_MAX_DAYS)', replace: 'asked' },
    { name: 'history reads the other role\'s days', file: HIST, find: "      .eq('provider_role', role)\n      .eq('provider_id', providerId)\n      .gte('day', since)", replace: "      .eq('provider_id', providerId)\n      .gte('day', since)" },
    { name: 'history comes back newest first', file: HIST, find: ".order('day', { ascending: true });", replace: ".order('day', { ascending: false });" },
    { name: 'a failed history read is an empty one', file: HIST, find: "    console.warn('[coach/score/history] the snapshots read failed — answering 503:', e instanceof Error ? e.message : e);\n    return NextResponse.json({ error: 'Could not read your score history just now.' }, { status: 503 });", replace: "    console.warn('[coach/score/history] the snapshots read failed — answering 503:', e instanceof Error ? e.message : e);" },
  ],
};
