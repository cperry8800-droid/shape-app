// Mutation spec for Shared habits (owner, 2026-10-20: "habits can be public so that friends on app
// will be notified if you don't complete a habit"): the rules (src/lib/habit-watch.mjs), the hourly
// cron (/api/cron/habit-watch), the data layer's states (ShapeHabitWatch in shapeBackend.js), the
// share button and sheet (iosAppBroadsheetHabits.jsx), the migration's guards and the settings
// rows. Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/habit-watch-2026-10-20.mutations.mjs --fail-on-skipped
const RULES = 'src/lib/habit-watch.mjs';
const CRON = 'src/app/api/cron/habit-watch/route.ts';
const DATA = 'mobile-app/src/services/shapeBackend.js';
const UI = 'mobile-app/src/broadsheet/iosAppBroadsheetHabits.jsx';
const SQL = 'supabase-migrations/2026-10-20-habit-watchers.sql';
const WEB = 'public/newdesign/clientMeSettings.jsx';
const ROUTES = 'public/newdesign/notificationRoutes.mjs';
const INBOX = 'public/newdesign/pageShell.jsx';
const MEMBER = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const PROS = 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx';

export default {
  test: 'node --test tests/habit-watch.test.mjs tests/habit-share-sheet.test.mjs tests/notification-routes.test.mjs tests/notified-person.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── The rules ──
    { name: 'any hour sends', file: RULES, find: '    if (hourOf(tz) !== hour) continue;\n', replace: '' },
    { name: 'a habit checked off today still sends', file: RULES, find: '    if (doneOn.has(`${h.id}|${day}`)) continue;\n', replace: '' },
    { name: 'someone no longer connected is still told', file: RULES, find: '      if (!connected(h.user_id, w.watcher_id)) continue;\n', replace: '' },
    { name: "a row can speak for someone else's habit", file: RULES, find: 'w.owner_id !== h.user_id || ', replace: '' },
    { name: 'the owner is told about their own habit', file: RULES, find: ' || w.watcher_id === h.user_id', replace: '' },
    { name: 'a person is told twice', file: RULES, find: ' || seen.has(w.watcher_id)', replace: '' },
    { name: 'an archived habit sends', file: RULES, find: ' || h.archived_at) continue;', replace: ') continue;' },
    { name: 'a weekly habit sends daily', file: RULES, find: "    if (h.cadence && h.cadence !== 'daily') continue;\n", replace: '' },
    { name: 'no zone on file is never anyone\'s evening', file: RULES, find: "const tz = zoneOf(h.user_id) || 'UTC';", replace: "const tz = zoneOf(h.user_id) || 'Pacific/Kiritimati';" },
    { name: "a to-don't reads as not done", file: RULES, find: "  return type === 'avoid'", replace: "  return type === 'never'" },
    { name: 'one key for every evening', file: RULES, find: 'export const habitWatchDedupe = (habitId, day) => `habit:${habitId}:${day}`;', replace: 'export const habitWatchDedupe = (habitId) => `habit:${habitId}`;' },

    // ── The cron ──
    { name: 'private habits are scanned', file: CRON, find: "      .eq('visibility', 'friends')\n", replace: '\n' },
    { name: 'archived habits are scanned', file: CRON, find: "      .is('archived_at', null);", replace: ';' },
    { name: 'a pending follow connects', file: CRON, find: ".from('user_follows').select('follower_id, following_id').eq('status', 'accepted')", replace: ".from('user_follows').select('follower_id, following_id')" },
    { name: 'the evening is UTC for everyone', file: CRON, find: "const due = habits.filter((h) => hourOf(zoneOf.get(h.user_id) || 'UTC') === HABIT_WATCH_HOUR);", replace: "const due = habits.filter(() => hourOf('UTC') === HABIT_WATCH_HOUR);" },
    { name: 'a failed zone read sends anyway', file: CRON, find: '  if (!profiles || !settings) {', replace: '  if (false) {' },
    { name: 'a failed check-off, follow or watcher read sends anyway', file: CRON, find: '  if (!watchers || !completions || !follows || !names) {', replace: '  if (!watchers || !names) {' },
    { name: 'a failed quiet-hours read sends anyway', file: CRON, find: '  if (!quietRows || !peopleZones) {', replace: '  if (false) {' },
    { name: "quiet hours read on UTC, not the person's clock", file: CRON, find: "tz: personZone.get(n.watcherId) || zone(q.tz) || 'UTC',", replace: "tz: zone(q.tz) || 'UTC'," },
    { name: 'the notice is filed under another type', file: CRON, find: "        type: 'friend_habit',", replace: "        type: 'habit_reminder'," },
    { name: 'the notice opens nowhere', file: CRON, find: "        route: 'person',", replace: "        route: 'home'," },
    { name: "the notice rides a follow's route, which opens the reader's own profile", file: CRON, find: "        route: 'person',", replace: "        route: 'profile'," },
    { name: 'the notices go out one at a time', file: CRON, find: 'Array.from({ length: Math.min(SEND_AT_ONCE, notices.length) }, worker)', replace: 'Array.from({ length: Math.min(1, notices.length) }, worker)' },
    { name: 'the notices go out all at once', file: CRON, find: 'Array.from({ length: Math.min(SEND_AT_ONCE, notices.length) }, worker)', replace: 'Array.from({ length: notices.length }, worker)' },
    { name: 'no notice is held back near the limit', file: CRON, find: ' && Date.now() - now < SEND_BUDGET_MS', replace: '' },
    { name: 'what the time ran out on is not reported', file: CRON, find: '  const unsent = notices.length - next;', replace: '  const unsent = 0;' },
    { name: 'the notice does not say whose', file: CRON, find: 'data: { actorId: n.ownerId, ', replace: 'data: { ' },
    { name: 'the wrong secret is let in', file: CRON, find: "  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });", replace: '' },

    // ── Opening the person (Codex on #2413) ──
    { name: 'a push loses the person', file: ROUTES, find: "if ((route === 'profile' || route === 'person') && ID(d.actorId)) return route + ':' + ID(d.actorId);", replace: "if (route === 'profile' && ID(d.actorId)) return 'profile:' + ID(d.actorId);" },
    { name: 'a person route with no one named still opens', file: ROUTES, find: "  if (kind === 'person') return rest ? { kind, id: rest, role: null } : null;", replace: "  if (kind === 'person') return { kind, id: rest || null, role: null };" },
    { name: "the member app opens the reader's own profile", file: MEMBER, find: "        case 'person': clear(); setNotifPerson(d.id || null); return;", replace: "        case 'person': clear(); setTab('me'); return;" },
    { name: 'the main return does not draw the person', file: MEMBER, find: "      {screeningOverlay}\n      {personOverlay}\n", replace: "      {screeningOverlay}\n" },
    { name: 'a step back leaves the person open', file: MEMBER, find: "    // A notified person's profile is no location of its own: any step back closes it.\n    setNotifPerson(null);\n    setShowSearch(loc.overlay === 'search');", replace: "    setShowSearch(loc.overlay === 'search');" },
    { name: 'Back from the person leaves a dead back', file: MEMBER, find: 'onClose={() => { if (!navBack()) setNotifPerson(null); }}', replace: 'onClose={() => setNotifPerson(null)}' },
    { name: 'a coach profile opens as a member\'s', file: MEMBER, find: "        const kind = p.role === 'trainer' ? 'TRAINER' : p.role === 'nutritionist' ? 'NUTRI' : 'CLIENT';", replace: "        const kind = 'CLIENT';" },
    { name: 'an unreadable profile opens nothing', file: MEMBER, find: "        if (!p) { setPerson(bare); return; }", replace: "        if (!p) return;" },
    { name: 'one can message oneself', file: MEMBER, find: 'onMessage={me && person.userId !== me ?', replace: 'onMessage={me ?' },
    { name: 'the trainer app does not draw the person', file: PROS, find: '      {personOverlay}\n      {showTour && <BSProOnboardingTour role="trainer"', replace: '      {showTour && <BSProOnboardingTour role="trainer"' },
    { name: 'the nutritionist app does not draw the person', file: PROS, find: '      {personOverlay}\n      {showTour && <BSProOnboardingTour role="nutritionist"', replace: '      {showTour && <BSProOnboardingTour role="nutritionist"' },
    { name: 'the website inbox opens nothing for a person', file: INBOX, find: 'if (n.route === "profile" || n.route === "person") {', replace: 'if (n.route === "profile") {' },

    // ── The data layer ──
    { name: 'a missing function is a failed read', file: DATA, find: "  if (['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) return true;", replace: "  if (['42883'].includes(code)) return true;" },
    { name: 'any failure is "not switched on"', file: DATA, find: "    if (error) return { kind: habitWatchMissing(error) ? 'not_ready' : 'error' };\n    return { kind: 'ready', people:", replace: "    if (error) return { kind: 'not_ready' };\n    return { kind: 'ready', people:" },
    { name: 'a failed list reads as nobody', file: DATA, find: "    if (error) return { kind: habitWatchMissing(error) ? 'not_ready' : 'error' };\n    if (state.user?.id !== uid)", replace: "    if (error) return { kind: 'ready', byHabit: {} };\n    if (state.user?.id !== uid)" },
    { name: 'the same person is sent twice', file: DATA, find: 'p_watchers: [...new Set(userIds || [])]', replace: 'p_watchers: userIds || []' },

    // ── The button and the sheet ──
    { name: 'the button shows before the watchers have read', file: UI, find: '      {Array.isArray(watchers) && (\n', replace: '      {true && (\n' },
    { name: 'a failed watchers read offers the button', file: UI, find: "setWatch(r && r.kind === 'ready' ? r.byHabit : null)", replace: "setWatch(r && r.byHabit ? r.byHabit : {})" },
    { name: 'a refused save closes as saved', file: UI, find: "    if (!r || r.kind !== 'ready') { window.__bsToast?.(tr('habits:share.saveFailed'", replace: "    if (!r) { window.__bsToast?.(tr('habits:share.saveFailed'" },
    { name: 'saving sends everyone listed', file: UI, find: 'window.ShapeHabitWatch?.set?.(habit.id, [...picked])', replace: 'window.ShapeHabitWatch?.set?.(habit.id, (people && people.people || []).map(p => p.userId))' },
    { name: 'someone no longer connected cannot be dropped', file: UI, find: "...[...picked].filter(id => !people.people.some(p => p.userId === id)).map(id => ({ userId: id, name: tr('habits:share.notConnected', { defaultValue: 'No longer connected' }) }))]", replace: ']' },
    { name: 'Save works before the list has loaded', file: UI, find: "disabled={pending || tooMany || !people || people.kind !== 'ready'}", replace: 'disabled={pending || tooMany}' },
    { name: 'a failed load has no retry', file: UI, find: `note(tr('habits:share.loadFailed', { defaultValue: "Couldn't load your people." }), true)`, replace: `note(tr('habits:share.loadFailed', { defaultValue: "Couldn't load your people." }))` },

    // ── The migration's guards and the settings rows (held by their source checks) ──
    { name: 'anon may run set_habit_watchers', file: SQL, find: 'revoke all on function public.set_habit_watchers(uuid, uuid[]) from public, anon;', replace: '' },
    { name: 'a pending follow can be picked', file: SQL, find: "         where f.status = 'accepted'\n", replace: '         where true\n' },
    { name: 'a signed-out caller is not refused first', file: SQL, find: "  if v_me is null then\n    raise exception 'Authentication required.' using errcode = '42501';\n  end if;\n", replace: '' },
    { name: 'members may write the table directly', file: SQL, find: 'revoke insert, update, truncate, references, trigger on public.habit_watchers from authenticated;', replace: "create policy habit_watchers_insert on public.habit_watchers for insert to authenticated with check (true);" },
    { name: "the website has no Friends' habits switch", file: WEB, find: `  ["friend_habit", "Friends' habits", "When a friend hasn't done a habit they shared with you"],\n`, replace: '' },
  ],
};
