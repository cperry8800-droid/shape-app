// Mutation spec for the coach with both listings (2026-11-05): one auth user owning a trainer row and a
// nutritionist row, or a dietitian. The push keeps a roster and an alert memory per role and the cron runs
// both (src/lib/ai/notify-core.ts, the notify routes); a dietitian's nutrition page is theirs (rosterRole);
// each role reads its own program (public/newdesign/dashSignals.js, src/lib/shared-overview.ts); a
// dismissal is one role's (the engine, and every read and write of coach_signal_dismissals).
// Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/coach-dual-role-2026-11-05.mutations.mjs --fail-on-skipped
const SIG = 'public/newdesign/dashSignals.js';
const CORE = 'src/lib/ai/notify-core.ts';
const LIVE = 'src/app/api/ai/notify/route.ts';
const CRON = 'src/app/api/ai/notify/cron/route.ts';
const OVERVIEW = 'src/lib/shared-overview.ts';
const CTX = 'src/lib/ai/coachContext.mjs';
const NORA = 'src/lib/ai/coachToday.mjs';
const DATA = 'public/newdesign/dashData.jsx';
const APP = 'mobile-app/src/services/shapeSignals.js';
const BACKEND = 'mobile-app/src/services/shapeBackend.js';

export default {
  test: 'node --test tests/coach-alert-memory.test.mjs tests/coach-actions.test.mjs tests/coach-signals-surfaces.test.mjs tests/coach-program-leg.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the role a roster is posted as ──
    { name: 'the exact role: a dietitian is refused the nutritionist page', file: CORE, find: "return actor.roles.some((r) => providerRoleForRole(r) === want) ? asked : actor.role;", replace: "return actor.roles.includes(asked) ? asked : actor.role;" },
    { name: 'any coach role the body names is taken', file: CORE, find: "return actor.roles.some((r) => providerRoleForRole(r) === want) ? asked : actor.role;", replace: 'return asked;' },

    // ── a roster and a memory per role ──
    { name: 'one snapshot key for every role', file: LIVE, find: "await writeUserGoal(actor.supabase, actor.user.id, notifyKind('notify_snapshot', role), snapshot);", replace: "await writeUserGoal(actor.supabase, actor.user.id, 'notify_snapshot', snapshot);" },
    { name: 'one memory for every role (the live route)', file: LIVE, find: "await writeNotifyState(actor.supabase, actor.user.id, role, nextState as Record<string, unknown>);", replace: "await writeUserGoal(actor.supabase, actor.user.id, 'notify_state', nextState);" },
    { name: 'one memory for every role (the cron)', file: CRON, find: "await writeNotifyState(admin, userId, snapshot.role, nextState as Record<string, unknown>);", replace: "await writeUserGoal(admin, userId, 'notify_state', nextState);" },
    { name: 'the cron reads one role only', file: CRON, find: "  for (const snapshot of snapshotsToEvaluate(rows as Array<{ kind?: unknown; data?: unknown }> | null, cutoff)) {", replace: "  for (const snapshot of snapshotsToEvaluate(rows as Array<{ kind?: unknown; data?: unknown }> | null, cutoff).slice(-1)) {" },
    { name: 'the old snapshot is never read', file: CORE, find: "    if (kind === 'notify_snapshot' && isCoachRole(s.role) && byKind.has(notifyKind('notify_snapshot', s.role))) continue;", replace: "    if (kind === 'notify_snapshot' && isCoachRole(s.role)) continue;" },
    { name: 'the old snapshot runs beside its replacement', file: CORE, find: "    if (kind === 'notify_snapshot' && isCoachRole(s.role) && byKind.has(notifyKind('notify_snapshot', s.role))) continue;", replace: '' },
    { name: 'a stale snapshot is run', file: CORE, find: "    if (!s || !active(s)) continue;", replace: '    if (!s) continue;' },
    { name: "the first run since the split forgets who was alerted", file: CORE, find: "  if (!Object.keys(own).length) {", replace: '  if (false) {' },
    { name: "each role counts its own pushes (a second daily budget)", file: CORE, find: "  return shared.date !== undefined ? { ...rest, date: shared.date, sentToday: shared.sentToday } : rest;", replace: '  return memory;' },
    { name: "the day's count never reaches the shared key", file: CORE, find: "  await writeUserGoal(client, userId, 'notify_state', { ...shared, date: nextState.date, sentToday: nextState.sentToday });", replace: '  void shared;' },
    { name: "the other role's held alerts are carried over", file: CORE, find: "    return typeof pr !== 'string' || pr === provider;", replace: '    return true;' },

    // ── each role's program ──
    { name: "the rule reads the one pick, not the role's own", file: SIG, find: '  function ruleProgramEnding(c, now, role) {\n    var p = programForRole(c, role);', replace: '  function ruleProgramEnding(c, now, role) {\n    var p = c.program;' },
    { name: "a role with no program falls back to the other role's", file: SIG, find: '    if (own && c.programs && typeof c.programs === "object") return c.programs[own] || null;', replace: '    if (own && c.programs && typeof c.programs === "object" && c.programs[own]) return c.programs[own];' },
    { name: 'the builder drops each role\'s program', file: SIG, find: '      programs: o && o.programs && typeof o.programs === "object"', replace: '      programs: false' },
    { name: 'the push snapshot drops each role\'s program', file: SIG, find: '"program", "programs", "recovery",', replace: '"program", "recovery",' },
    { name: 'Programs ending reads the one pick', file: SIG, find: '      var p = programForRole(c, role);', replace: '      var p = c && c.program ? c.program : null;' },
    { name: "the overview's nutritionist program is either role's", file: OVERVIEW, find: "    const only = { trainer: role === 'trainer' ? mine.trainer : null, nutritionist: role === 'nutritionist' ? mine.nutritionist : null };", replace: '    const only = mine;' },
    { name: "the overview's trainer program skips the calendar", file: OVERVIEW, find: '      if (fromCalendar) return fromCalendar;\n', replace: '' },

    // ── a dismissal is one role's ──
    { name: "the other role's dismissal hides this one", file: SIG, find: '        if (asRole && typeof d.provider_role === "string" && d.provider_role !== asRole) continue;\n', replace: '' },
    { name: 'the server reads no role', file: CTX, find: ".select('client_id, reason_key, reason_sig, until, provider_role')", replace: ".select('client_id, reason_key, reason_sig, until')" },
    { name: 'the push attaches every role\'s dismissals', file: CORE, find: 'engine.attachCoachContext(raw, opts.coachContext, role)', replace: 'engine.attachCoachContext(raw, opts.coachContext)' },
    { name: "Nora attaches every role's dismissals", file: NORA, find: 'engine.attachCoachContext(group.map((x) => recordFor(x, role)), ctx, role)', replace: 'engine.attachCoachContext(group.map((x) => recordFor(x, role)), ctx)' },
    { name: "the app attaches every role's dismissals", file: APP, find: 'call(e.attachCoachContext, records, ctx, role)', replace: 'call(e.attachCoachContext, records, ctx)' },
    { name: 'the app saves no role', file: APP, find: 'await D.set(clientId, flag, until || null, role)', replace: 'await D.set(clientId, flag, until || null)' },
    { name: "the app's write keys on the old columns", file: BACKEND, find: "{ onConflict: 'coach_id,provider_role,client_id,reason_key' });", replace: "{ onConflict: 'coach_id,client_id,reason_key' });" },
    { name: "the app's undo clears both roles", file: BACKEND, find: ".delete().eq('coach_id', state.user.id).eq('provider_role', providerRole)", replace: ".delete().eq('coach_id', state.user.id)" },
    { name: "the website attaches every role's dismissals", file: DATA, find: 'DashSignals.attachCoachContext(state.clients, coachCtx, role)', replace: 'DashSignals.attachCoachContext(state.clients, coachCtx)' },
    { name: "the website's write saves no role", file: DATA, find: '{ coach_id: uid, provider_role: providerRole, client_id: clientId,', replace: '{ coach_id: uid, client_id: clientId,' },
    { name: "the website's undo clears both roles", file: DATA, find: '.delete().eq("coach_id", uid).eq("provider_role", providerRole)', replace: '.delete().eq("coach_id", uid)' },
  ],
};
