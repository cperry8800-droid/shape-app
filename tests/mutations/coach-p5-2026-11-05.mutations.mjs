// Mutation spec for package P5 (owner, 2026-11-05): the coach notices (check-in, a member's cancel, the
// care-team hand-off, client wins), the shared-client Team view, the grouped bell, group messages,
// programs due, playlists (attach, the workout card's link, tracks, tags, reorder) and the privacy text.
// Every mutation must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/coach-p5-2026-11-05.mutations.mjs --fail-on-skipped
const HANDOFF = 'src/lib/handoff.mjs';
const CARE = 'src/lib/care-team.mjs';
const CANCEL = 'src/lib/client-cancel-notice.mjs';
const MANAGE = 'src/app/api/sessions/manage/route.ts';
const WINS = 'src/lib/client-wins.mjs';
const WINS_CRON = 'src/app/api/cron/client-wins/route.ts';
const GROUP = 'src/lib/group-message.mjs';
const GROUP_ROUTE = 'src/app/api/coach/messages/group/route.ts';
const TEAM = 'src/lib/shared-team.mjs';
const TEAM_ROUTE = 'src/app/api/me/shared-clients/[clientId]/team/route.ts';
const BELL = 'public/newdesign/coachBell.js';
const DELIVERY = 'src/app/api/notifications/delivery/route.ts';
const DUE = 'public/newdesign/programsDue.js';
const ATTACH = 'public/newdesign/playlistAttach.js';
const LINK = 'mobile-app/src/services/playlistLink.mjs';
const TRACKS = 'src/lib/soundtrack-tracks.mjs';
const TRACKS_ROUTE = 'src/app/api/coach/soundtracks/tracks/route.ts';
const SQL = 'supabase-migrations/2026-11-05-coach-notices.sql';
const PRIVACY = 'public/privacy.html';
const SHELL = 'public/newdesign/pageShell.jsx';

export default {
  test: 'node --test tests/coach-p5-notices.test.mjs tests/shared-team.test.mjs tests/coach-bell.test.mjs tests/group-message.test.mjs tests/programs-due.test.mjs tests/playlist-attach.test.mjs tests/privacy-coach-visibility.test.mjs tests/schedule-step2.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── the hand-off line ──
    { name: 'handoff: an unchanged target reads as a change', file: HANDOFF,
      find: 'if (from == null || to == null || from === to) continue;', replace: 'if (from == null || to == null) continue;' },
    { name: 'handoff: two kinds of day fold to "every day" on their start alone', file: HANDOFF,
      find: 'moved.training.from === moved.rest.from && moved.training.to === moved.rest.to', replace: 'moved.training.from === moved.rest.from' },
    { name: 'handoff: raised and lowered swap', file: HANDOFF,
      find: "np(up ? 'handoff.macroUp' : 'handoff.macroDown', {", replace: "np(up ? 'handoff.macroDown' : 'handoff.macroUp', {" },
    { name: 'handoff: a republished menu still posts a line', file: HANDOFF,
      find: "  if (prevDays && clean(prevTitle, 60) === title) return null;\n", replace: '' },
    { name: 'handoff: a rest day reads as a training day', file: HANDOFF,
      find: "String(day.tag || '').toUpperCase() === 'REST' ? 'rest' : 'training'", replace: "'training'" },
    { name: 'handoff: a week-one target of 0 posts a line', file: HANDOFF,
      find: 'if (!Number.isInteger(count) || count < 1) return null;', replace: 'if (!Number.isInteger(count) || count < 0) return null;' },
    // ── posting it ──
    { name: 'care team: the actor is their own co-coach', file: CARE,
      find: "if (!m || !m.userId || m.userId === actorId || out.some((o) => o.userId === m.userId)) continue;", replace: "if (!m || !m.userId || out.some((o) => o.userId === m.userId)) continue;" },
    { name: 'care team: a line already in the thread is posted again', file: CARE,
      find: '        if (!seenErr && Array.isArray(seen) && seen.length) continue;\n', replace: '' },
    { name: 'care team: the line is not marked as a hand-off', file: CARE,
      find: "          kind: 'handoff',", replace: "          kind: 'message'," },
    { name: 'care team: a client nobody else coaches gets a line', file: CARE,
      find: '    if (!others.length) return 0;\n', replace: '' },
    { name: 'care team: the actor is named in any role', file: CARE,
      find: 'const inRole = mine.find((m) => m.role === role);', replace: 'const inRole = null;' },
    // ── a member's own cancel ──
    { name: 'cancel: a booking the coach made for themselves tells them', file: CANCEL,
      find: 'if (!ownerId || ownerId === booking.client_id) return false;', replace: 'if (!ownerId) return false;' },
    { name: 'cancel: no dedupe on the booking', file: CANCEL,
      find: 'dedupe: `client-cancel:${booking.id}`,', replace: '' },
    { name: 'cancel: a listing with no zone does not say UTC', file: CANCEL,
      find: "...(zone ? {} : { timeZoneName: 'short' }),", replace: '' },
    { name: 'cancel: a repeat cancel tells the coach again', file: MANAGE,
      find: "if (action === 'cancel' && isClient && !isCoach && (statusBefore === 'requested' || statusBefore === 'confirmed')) {", replace: "if (action === 'cancel' && isClient && !isCoach) {" },
    { name: 'cancel: the rest of a run tells nobody', file: MANAGE,
      find: "    if (!o.isCoach && o.session.client_id === o.userId) {\n      await tellCoachClientCancelled(", replace: "    if (false) {\n      await tellCoachClientCancelled(" },
    // ── wins ──
    { name: 'wins: a first log is a PR', file: WINS,
      find: '    if (!priorBest.has(key)) continue;\n', replace: '' },
    { name: 'wins: a tie is a PR', file: WINS,
      find: 'if (b.lb > priorBest.get(key))', replace: 'if (b.lb >= priorBest.get(key))' },
    { name: 'wins: kilograms compare as pounds', file: WINS,
      find: "const toLb = (load, unit) => (unit === 'kg' ? load * KG_TO_LB : load);", replace: 'const toLb = (load) => load;' },
    { name: 'wins: a set not done counts', file: WINS,
      find: "const counted = (row) => row && row.completed !== false && moveOf(row) !== '';", replace: "const counted = (row) => row && moveOf(row) !== '';" },
    { name: 'wins: an old milestone is told again', file: WINS,
      find: '  if (reached < addDays(today, -1)) return null;\n', replace: '' },
    // ⚠ A PROVEN NO-OP: currentRun ends its run on today or yesterday and only ever walks BACK from
    // there, so a day after today can never join the run whether or not the set holds it. The filter is
    // kept as a statement of the rule (get_client_score_history's clamp), not as a guard.
    { name: 'wins: a day after today counts (no-op: the run walks back from today)', file: WINS, expectSurvive: true,
      find: "YMD.test(d) && d <= today));", replace: 'YMD.test(d)));' },
    { name: 'wins: a goal met before is news again', file: WINS,
      find: '    if (hist.slice(0, -1).some((p) => meets(p.value, target, start))) continue;\n', replace: '' },
    { name: 'wins: a goal going down is read going up', file: WINS,
      find: 'return start != null && start > target ? value <= target : value >= target;', replace: 'return value >= target;' },
    { name: 'wins: an old reading is a win', file: WINS,
      find: "    if (typeof sinceYmd === 'string' && last.on < sinceYmd) continue;\n", replace: '' },
    { name: 'wins run: a PR reaches the nutritionist', file: WINS_CRON,
      find: "            if (win.kind === 'pr' && coach.role !== 'trainer') continue;\n", replace: '' },
    { name: 'wins run: the dedupe forgets the client', file: WINS_CRON,
      find: 'dedupe: `${win.dedupe}:${clientId}`,', replace: 'dedupe: win.dedupe,' },
    // ── the check-in and hand-off triggers ──
    { name: 'sql: the hand-off is a plain message', file: SQL,
      find: "case when v_handoff then 'care_team_handoff' else 'message' end,", replace: "'message'," },
    { name: 'sql: a check-in edit tells the coach again', file: SQL,
      find: "'dedupe', 'checkin:' || new.user_id::text || ':' || new.week_of::text,", replace: "'dedupe', 'checkin:' || new.user_id::text || ':' || now()::text," },
    { name: 'sql: the client is told of their own check-in', file: SQL,
      find: 'if r.coach_id is null or r.coach_id = new.user_id then', replace: 'if r.coach_id is null then' },
    // ── group messages ──
    { name: 'group: the list need not match the confirm', file: GROUP,
      find: 'if (Number(i.confirmed) !== clientIds.length || raw.length !== clientIds.length) {', replace: 'if (raw.length !== clientIds.length) {' },
    { name: 'group: a repeated client pads the count', file: GROUP,
      find: 'if (Number(i.confirmed) !== clientIds.length || raw.length !== clientIds.length) {', replace: 'if (Number(i.confirmed) !== clientIds.length) {' },
    { name: 'group: one more an hour', file: GROUP,
      find: 'if (lastHour >= GROUP_SENDS_PER_HOUR)', replace: 'if (lastHour > GROUP_SENDS_PER_HOUR)' },
    { name: 'group: one more a day', file: GROUP,
      find: 'if (firstAt.size >= GROUP_SENDS_PER_DAY)', replace: 'if (firstAt.size > GROUP_SENDS_PER_DAY)' },
    { name: 'group: a retry sends again', file: GROUP,
      find: "  if (groupId && firstAt.has(String(groupId).toLowerCase())) return { ok: false, status: 409, code: 'already_sent', error: 'That message was already sent.' };\n", replace: '' },
    { name: 'group: yesterday counts against today', file: GROUP,
      find: 'if (!g || !Number.isFinite(t) || at - t > 24 * 3600_000) continue;', replace: 'if (!g || !Number.isFinite(t)) continue;' },
    { name: 'group route: someone else\'s client is messaged', file: GROUP_ROUTE,
      find: "  if (notMine.length) return NextResponse.json({ error: 'You can only message your own active clients.', code: 'not_your_client', clientIds: notMine }, { status: 403 });\n", replace: '' },
    { name: 'group route: an unreadable limit sends anyway', file: GROUP_ROUTE,
      find: "  if (recentErr) return NextResponse.json({ error: \"Couldn't check how many group messages you've sent. Nothing was sent — try again.\" }, { status: 503 });\n", replace: '' },
    // ── the Team view ──
    { name: 'team route: a stranger reads the team', file: TEAM_ROUTE,
      find: "  if (!team.some((t) => t.owner_id === user.id)) return NextResponse.json({ error: 'You do not coach this client.' }, { status: 403 });\n", replace: '' },
    { name: 'team route: another trainer\'s rows read as the caller\'s', file: TEAM_ROUTE,
      find: 'const ownWorkouts = ((ownW.data ?? []) as Row[]).filter((w) => myTrainerIds.has(Number(w.trainer_id)));', replace: 'const ownWorkouts = (ownW.data ?? []) as Row[];' },
    { name: 'team route: a thread without the co-coach is taken', file: TEAM_ROUTE,
      find: 'members.get(id)?.has(user.id) && members.get(id)?.has(String(counterpart.owner_id))', replace: 'members.get(id)?.has(user.id)' },
    { name: 'team: a cancelled session is on the week', file: TEAM,
      find: "const live = new Set(['requested', 'confirmed', 'completed']);", replace: "const live = new Set(['requested', 'confirmed', 'completed', 'cancelled']);" },
    { name: 'team: an old check-in question is next', file: TEAM,
      find: "if (checkin && String(checkin.week_of || '') >= addDays(start, -7)) {", replace: 'if (checkin) {' },
    // ── the bell ──
    { name: 'bell: a member\'s message needs the coach', file: BELL,
      find: "if (t === 'message') return d.side === 'coach' ? 'needs' : 'fyi';", replace: "if (t === 'message') return 'needs';" },
    { name: 'bell: a request without its session offers Accept', file: BELL,
      find: "if (t === 'booking_request' && typeof d.sessionId === 'string' && d.sessionId) {", replace: "if (t === 'booking_request') {" },
    { name: 'bell: a push turned off reads as reaching the phone', file: BELL,
      find: 'var phone = !muted && !(ch && ch.push === false);', replace: 'var phone = !muted;' },
    { name: 'bell: a reminder reads as held', file: BELL,
      find: "String(n.type || '').indexOf('reminder_') !== 0 && ", replace: '' },
    { name: 'delivery: yesterday\'s pushes count as today\'s', file: DELIVERY,
      find: '.filter((r) => { const at = Date.parse(String(r.created_at || \'\')); return Number.isFinite(at) && ymdIn(new Date(at), dayTz) === today; }).length;', replace: '.length;' },
    { name: 'shell: every role gets the grouped bell', file: SHELL,
      find: 'return typeof window.CoachBellList === "function" && (role === "trainer" || role === "nutritionist")', replace: 'return typeof window.CoachBellList === "function"' },
    // ── programs due ──
    { name: 'due: a client off their plan needs a program', file: DUE,
      find: '      if (c.payments && c.payments.onPlan === false) return;\n', replace: '' },
    { name: 'due: a client with next week written needs one', file: DUE,
      find: '      if (has[String(id)]) return;\n', replace: '' },
    { name: 'due: a cut-short read is counted', file: DUE,
      find: '    if (i.readable === false) return null;\n', replace: '' },
    // ── playlists ──
    { name: 'attach: sending to all drops the workout entries', file: ATTACH,
      find: "      rows = rows.filter(function (e) { return e.kind !== 'all_clients'; });", replace: "      rows = [];" },
    { name: 'attach: an http link is kept', file: ATTACH,
      find: "return /^https:\\/\\/(open\\.spotify\\.com|music\\.apple\\.com)\\//i.test(u) && u.length <= 500 ? u : null;", replace: "return /^https?:\\/\\/(open\\.spotify\\.com|music\\.apple\\.com)\\//i.test(u) && u.length <= 500 ? u : null;" },
    { name: 'attach: a day with another playlist of the same name matches', file: ATTACH,
      find: '    if (p.id) return p.id === row.id;\n', replace: '' },
    { name: 'card: any https link opens', file: LINK,
      find: "const LINK = /^https:\\/\\/(open\\.spotify\\.com|music\\.apple\\.com)\\//i;", replace: "const LINK = /^https:\\/\\//i;" },
    { name: 'tracks: moving down lands one short', file: TRACKS,
      find: 'insert_before: to > from ? to + 1 : to,', replace: 'insert_before: to,' },
    { name: 'tracks: a cleared tag stays', file: TRACKS,
      find: '    if (v === null) delete next[k];\n    else next[k] = v;', replace: '    if (v !== null) next[k] = v;' },
    { name: 'tracks: any word is an energy tag', file: TRACKS,
      find: '    else if (ENERGY.includes(v)) out[k] = v;', replace: '    else out[k] = v;' },
    { name: 'tracks route: a tag write before the migration is tried', file: TRACKS_ROUTE,
      find: "  if (!Object.prototype.hasOwnProperty.call(row, 'track_tags')) {\n    return NextResponse.json({ error: 'Energy tags are not set up yet.', reason: 'not_migrated' }, { status: 503 });\n  }\n", replace: '' },
    { name: 'tracks route: the tag write is not held to the owner', file: TRACKS_ROUTE,
      find: ".update({ track_tags: tags }).eq('id', id).eq('owner_id', user.id);", replace: ".update({ track_tags: tags }).eq('id', id);" },
    // ── privacy ──
    { name: 'privacy: the per-coach control is promised again', file: PRIVACY,
      find: 'turn sharing of your goals and your cycle tracking with your coach(es) on or off,', replace: 'adjust what each coach can see from Settings,' },
  ],
};
