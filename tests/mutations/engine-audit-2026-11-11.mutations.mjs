// Mutation spec for the engine audit's fixes (2026-11-11): a stored roster read as of its save (F1),
// the reader's own day (F2), Nora's reason from the row's lead (F3), a check-in from before the join
// (F4), the exact share (F6), a nutritionist's Plan ending (F8), the app's records (F9) and the coach's
// Goal slip line (F10).
// Run: node scripts/mutate.mjs --spec tests/mutations/engine-audit-2026-11-11.mutations.mjs --fail-on-skipped
const ENG = 'public/newdesign/dashSignals.js';
const CORE = 'src/lib/ai/notify-core.ts';
const CRON = 'src/app/api/ai/notify/cron/route.ts';
const LIVE = 'src/app/api/ai/notify/route.ts';
const NORA = 'src/lib/ai/coachToday.mjs';
const APP = 'mobile-app/src/services/shapeSignals.js';
const PROS = 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx';
const GOALS = 'public/newdesign/dashGoals.jsx';
const TODAY = 'public/newdesign/dashToday.jsx';
export default {
  test: 'node --test tests/engine-audit-2026-11-11.test.mjs tests/coach-alert-memory.test.mjs tests/nora-coach-today.test.mjs tests/member-engine-reasons.test.mjs tests/dash-signals.test.mjs tests/coach-settings.test.mjs',
  mutations: [
    // ── F2: the zone scope ─────────────────────────────────────────────────────
    { name: 'the scope never moves the clock', file: ENG,
      find: '    try { return fn(wallClock(at, zone)); } finally { _zone = null; _zoneAt = null; }', replace: '    try { return fn(at); } finally { _zone = null; _zoneAt = null; }' },
    { name: 'the scope is never released', file: ENG,
      find: '    try { return fn(wallClock(at, zone)); } finally { _zone = null; _zoneAt = null; }', replace: '    return fn(wallClock(at, zone));' },
    { name: 'a nested scope re-scopes in its own zone', file: ENG,
      find: '    if (_zone || !zoneFormatter(zone)) return fn(at);', replace: '    if (!zoneFormatter(zone)) return fn(at);' },
    { name: 'an instant is never moved inside a scope', file: ENG,
      find: '    return s.length > 10 && EXPLICIT_ZONE.test(s) ? wallClock(d, _zone) : d;', replace: '    return d;' },
    { name: 'a date with no time is moved too', file: ENG,
      find: '    return s.length > 10 && EXPLICIT_ZONE.test(s) ? wallClock(d, _zone) : d;', replace: '    return EXPLICIT_ZONE.test(s) ? wallClock(d, _zone) : d;' },
    { name: 'a time with no zone is moved as an instant', file: ENG,
      find: '    return s.length > 10 && EXPLICIT_ZONE.test(s) ? wallClock(d, _zone) : d;', replace: '    return s.length > 10 ? wallClock(d, _zone) : d;' },
    { name: 'a zone the engine cannot read throws', file: ENG,
      find: '    } catch (e) { f = null; }\n    _zoneFmt[zone] = f;', replace: '    } catch (e) { throw e; }\n    _zoneFmt[zone] = f;' },
    { name: 'the quiet thread\'s signature carries the moved instant', file: ENG,
      find: 'sig: "last:" + instantKey(ts), figures: { days: gap } };', replace: 'sig: "last:" + last.toISOString(), figures: { days: gap } };' },
    { name: 'the reply\'s signature carries the moved instant', file: ENG,
      find: '    var since = own ? parseDate(rw[own]) : null;', replace: '    var since = own ? toDate(rw[own]) : null;' },
    { name: 'a reply\'s hours are counted on the wall clock (Codex on #2703)', file: ENG,
      find: '    var hours = Math.floor((instantNow(now).getTime() - since.getTime()) / 3600000);', replace: '    var hours = Math.floor((now.getTime() - since.getTime()) / 3600000);' },
    { name: 'the scope keeps no real instant', file: ENG,
      find: '  function instantNow(now) { return _zone && _zoneAt ? _zoneAt : now; }', replace: '  function instantNow(now) { return now; }' },
    { name: 'a snooze\'s end is moved to the wall clock', file: ENG,
      find: '        var u = parseDate(d.until);', replace: '        var u = toDate(d.until);' },
    { name: 'a snooze is compared with the wall clock\'s now', file: ENG,
      find: '    var at = instantNow(now instanceof Date ? now : new Date()).getTime();', replace: '    var at = (now instanceof Date ? now : new Date()).getTime();' },
    { name: 'a member\'s latest contact is counted from the unmoved instant', file: ENG,
      find: '      ts = a && b ? (a > b ? lc.trainer : lc.nutritionist) : (a ? lc.trainer : b ? lc.nutritionist : null);', replace: '      ts = a && b ? (a > b ? a : b) : (a || b);' },
    { name: 'a member\'s later contact is picked on the wall clock (Codex on #2703)', file: ENG,
      find: '      var a = parseDate(lc.trainer), b = parseDate(lc.nutritionist);', replace: '      var a = toDate(lc.trainer), b = toDate(lc.nutritionist);' },
    // ── F4: a check-in from before the join ────────────────────────────────────
    { name: 'a check-in from before the join counts', file: ENG,
      find: '    if (last && joinDay && mondayOf(last) < mondayOf(joinDay)) last = null;\n', replace: '' },
    { name: 'the join is compared as a moment, not a week', file: ENG,
      find: '    if (last && joinDay && mondayOf(last) < mondayOf(joinDay)) last = null;', replace: '    if (last && joinDay && last < joinDay) last = null;' },
    // ── F6: the exact share ────────────────────────────────────────────────────
    { name: 'calories compare the rounded share', file: ENG,
      find: '    if ((n.avgCalories - n.targetCalories) * 100 >= THRESHOLDS.LEDGER_OVER_PCT * n.targetCalories) {', replace: '    if (overPct >= THRESHOLDS.LEDGER_OVER_PCT) {' },
    { name: 'calories exactly on the line do not flag', file: ENG,
      find: '    if ((n.avgCalories - n.targetCalories) * 100 >= THRESHOLDS.LEDGER_OVER_PCT * n.targetCalories) {', replace: '    if ((n.avgCalories - n.targetCalories) * 100 > THRESHOLDS.LEDGER_OVER_PCT * n.targetCalories) {' },
    { name: 'protein compares the rounded share', file: ENG,
      find: '    if ((n.targetProtein - n.avgProtein) * 100 >= THRESHOLDS.PROTEIN_UNDER_PCT * n.targetProtein) {', replace: '    if (Math.round(((n.targetProtein - n.avgProtein) / n.targetProtein) * 100) >= THRESHOLDS.PROTEIN_UNDER_PCT) {' },
    { name: 'protein exactly on the line does not flag', file: ENG,
      find: '    if ((n.targetProtein - n.avgProtein) * 100 >= THRESHOLDS.PROTEIN_UNDER_PCT * n.targetProtein) {', replace: '    if ((n.targetProtein - n.avgProtein) * 100 > THRESHOLDS.PROTEIN_UNDER_PCT * n.targetProtein) {' },
    // ── F8 and F10 ─────────────────────────────────────────────────────────────
    { name: 'a nutritionist\'s Plan ending reads as live', file: ENG,
      find: 'help: "Not live yet: Shape can\'t read when a meal plan ends, so this doesn\'t flag for now. Once it can, it flags a plan this many days before it ends when nothing is lined up next."', replace: 'help: "Flag a plan this many days before it ends when nothing is lined up next."' },
    { name: 'the goal line ignores the coach\'s Goal slip', file: ENG,
      find: '    if (thresholds && typeof thresholds === "object") return withThresholds(thresholds, function () { return goalBrief(c, now); });\n', replace: '' },
    { name: 'the goal card ignores the coach\'s line', file: GOALS,
      find: 'slip >= (Number.isFinite(slipLine) ? slipLine : DashSignals.THRESHOLDS.GOAL_SLIP_DAYS);', replace: 'slip >= DashSignals.THRESHOLDS.GOAL_SLIP_DAYS;' },
    { name: 'Today\'s goal line is not given the tuning', file: TODAY,
      find: '  const brief = DashSignals.goalBrief ? DashSignals.goalBrief(rec, new Date(), thresholds || undefined) : null;', replace: '  const brief = DashSignals.goalBrief ? DashSignals.goalBrief(rec, new Date()) : null;' },
    // ── F1: the roster as of its save ──────────────────────────────────────────
    { name: 'the roster is read against the run\'s clock again', file: CORE,
      find: '    const rows = engine.inZone(zone, rosterClock(snapshot, opts.now), (at) =>', replace: '    const rows = engine.inZone(zone, opts.now, (at) =>' },
    { name: 'the roster clock is always the run\'s', file: CORE,
      find: "  return typeof at === 'number' && Number.isFinite(at) && at < now.getTime() ? new Date(at) : now;", replace: '  return now;' },
    { name: 'a save stamped ahead of the run is taken as the clock', file: CORE,
      find: "  return typeof at === 'number' && Number.isFinite(at) && at < now.getTime() ? new Date(at) : now;", replace: "  return typeof at === 'number' && Number.isFinite(at) ? new Date(at) : now;" },
    { name: 'a snooze on a stored roster is held to its save (Codex on #2703)', file: CORE,
      find: '    const clients = liveDismissals(opts.coachContext ? engine.attachCoachContext(raw, opts.coachContext, role) : raw, opts.now);', replace: '    const clients = opts.coachContext ? engine.attachCoachContext(raw, opts.coachContext, role) : raw;' },
    { name: 'a snooze still running is dropped too', file: CORE,
      find: '      return Number.isFinite(t) && t > now.getTime();', replace: '      return false;' },
    // A proven no-op: a kept dismissal whose end can't be read is an ended one to the engine as well
    // (isDismissed: `if (!u || u.getTime() <= at) continue;`), so the flag comes back either way.
    { name: 'an end that can\'t be read holds the flag hidden', file: CORE, expectSurvive: true,
      find: '      return Number.isFinite(t) && t > now.getTime();', replace: '      return !Number.isFinite(t) || t > now.getTime();' },
    { name: 'a dismissal with no end is dropped', file: CORE,
      find: "      if (until == null || until === '') return true;", replace: "      if (until == null || until === '') return false;" },
    // ── F2: the callers' zones ─────────────────────────────────────────────────
    { name: 'a coach\'s roster is read in no zone', file: CORE,
      find: '    const zone = opts.zone || snapshot.tz || null;', replace: '    const zone = null;' },
    { name: 'the zone the snapshot was posted with is not the fallback', file: CORE,
      find: '    const zone = opts.zone || snapshot.tz || null;', replace: '    const zone = opts.zone || null;' },
    { name: 'a member\'s record is read in no zone', file: CORE,
      find: '    const { directive, flags } = engine.inZone(opts.zone || snapshot.tz || null, opts.now, (at) => ({', replace: '    const { directive, flags } = engine.inZone(null, opts.now, (at) => ({' },
    { name: 'the hourly run passes no zone', file: CRON,
      find: 'thresholds, copy, coachContext, zone: prefs.tz, memberPaused, clientBreaks });', replace: 'thresholds, copy, coachContext, memberPaused, clientBreaks });' },
    { name: 'the live route passes no zone', file: LIVE,
      find: 'thresholds, copy, coachContext, zone: prefs.tz, memberPaused });', replace: 'thresholds, copy, coachContext, memberPaused });' },
    { name: 'Nora triages in no zone', file: NORA,
      find: '      try { feed = engine.inZone(zone, now, (at) =>', replace: '      try { feed = engine.inZone(null, now, (at) =>' },
    // ── F3: Nora's reason ──────────────────────────────────────────────────────
    { name: 'Nora\'s reason is the directive\'s again', file: NORA,
      find: '        const lead = r.lead && r.lead.reason ? r.lead : null;', replace: '        const lead = null;' },
    { name: 'Nora\'s reason has no headline', file: ENG,
      find: '    return lever && DIRECTIVE_VERDICTS[lever] ? DIRECTIVE_VERDICTS[lever] : null;', replace: '    return null;' },
    // ── F9: the app ────────────────────────────────────────────────────────────
    { name: 'the app\'s overview records carry no read mark', file: APP,
      find: "  rec.progressRead = { state: 'ready', checkedAt: new Date().toISOString() };\n", replace: '' },
    { name: 'a no-data client is counted On track again (Codex on #2703)', file: PROS,
      find: "  const onTrackRows = pastMode ? [] : rows.filter((r) => !bsProNeedsAttention(r.sig) && !bsProNoRecent(r.sig) && r.sig.sev !== 'past');", replace: "  const onTrackRows = pastMode ? [] : rows.filter((r) => !bsProNeedsAttention(r.sig) && r.sig.sev !== 'past');" },
    { name: 'a no-data client is in no Clients group', file: PROS,
      find: '  const needsRows = pastMode ? [] : rows.filter((r) => bsProNeedsAttention(r.sig) || bsProNoRecent(r.sig));', replace: '  const needsRows = pastMode ? [] : rows.filter((r) => bsProNeedsAttention(r.sig));' },
    { name: 'the Nothing recent group is gone', file: PROS,
      find: "    { sev: 'unknown', label: tr('coach:roster.groupNoRecent', { defaultValue: 'Nothing recent' }) },\n", replace: '' },
    { name: 'the app\'s roster calls a no-data client on plan', file: PROS,
      find: "      : sev === 'unknown' ? coachTr('coach:roster.dirNoRecent', { defaultValue: 'Nothing logged in two weeks — check in with them.' })\n", replace: '' },
  ],
};
