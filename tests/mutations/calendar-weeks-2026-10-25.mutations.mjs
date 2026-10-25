// Mutation spec for the Calendar's Weeks view and the route change it needed (a finished
// assigned workout reads done). Each mutation breaks one clause; every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/calendar-weeks-2026-10-25.mutations.mjs --fail-on-skipped
const ROUTE = 'src/app/api/calendar/route.ts';
const CAL = 'mobile-app/src/broadsheet/iosAppBroadsheetCalendar.jsx';
const WEEKS = 'mobile-app/src/broadsheet/BSCalendarWeeks.jsx';

export default {
  test: 'node --test tests/calendar-weeks.test.mjs',
  timeoutMs: 180_000,
  mutations: [
    // ── the route ──
    { name: 'an abandoned session finishes the workout', file: ROUTE,
      find: "      .in('status', ['completed', 'reviewed'])\n",
      replace: '' },
    { name: 'the capped session read keeps arbitrary rows', file: ROUTE,
      find: "      .order('created_at', { ascending: false })\n      .limit(1000);",
      replace: '      .limit(1000);' },
    { name: 'the week is the server\'s, not the zone\'s', file: ROUTE,
      find: 'const zoneToday = wallClockInZone(today.getTime(), zone)?.date ?? today.toISOString().slice(0, 10);',
      replace: 'const zoneToday = today.toISOString().slice(0, 10);' },
    { name: 'last week\'s run ticks this week\'s undated slot', file: ROUTE,
      find: '        if (!day || day < weekISO[0]) continue;\n',
      replace: '' },
    { name: 'the session\'s day is read in UTC', file: ROUTE,
      find: 'const day = Number.isFinite(at) ? wallClockInZone(at, zone)?.date : null;',
      replace: "const day = Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : null;" },
    { name: 'a finished workout stays planned', file: ROUTE,
      find: "      w.status = 'completed';\n",
      replace: '' },
    { name: 'the time it took is dropped', file: ROUTE,
      find: '      w.doneSeconds = sec || null;\n',
      replace: '' },
    // ── the screen ──
    { name: 'the stored view is ignored', file: CAL,
      find: "return localStorage.getItem(_BS_CAL_VIEW_KEY) === 'weeks' ? 'weeks' : 'month';",
      replace: "return 'month';" },
    { name: 'the switch forgets the view', file: CAL,
      find: 'try { localStorage.setItem(_BS_CAL_VIEW_KEY, v); } catch (e) {}',
      replace: '' },
    { name: 'Weeks reads only the month', file: CAL,
      find: "const wk = view === 'weeks' ? bsCalWeeksOf(viewYear, viewMonth) : null;",
      replace: 'const wk = null;' },
    { name: 'a stale read lands', file: CAL,
      find: '.then(d => { if (seq !== loadSeq.current) return; ',
      replace: '.then(d => { ' },
    { name: 'Month draws the days either side of it', file: CAL,
      find: "events.filter((e) => !e.date || e.date.slice(0, 7) === ym)",
      replace: 'events' },
    { name: 'signed out, Weeks offers ＋ Add', file: CAL,
      find: 'onAdd={useServer ? (d) => { setAddOn(d); setShowAdd(true); } : null}',
      replace: 'onAdd={(d) => { setAddOn(d); setShowAdd(true); }}' },
    { name: 'the add sheet opens on the picked Month day, not the Weeks day', file: CAL,
      find: 'day={addOn ? addOn.getDate() : selDay}',
      replace: 'day={selDay}' },
    // ── the weeks list ──
    { name: 'a week starts on Sunday', file: WEEKS,
      find: 'const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));',
      replace: 'const start = new Date(year, month, 1 - first.getDay());' },
    { name: 'rest days count toward the total', file: WEEKS,
      find: "const UNCOUNTED = new Set(['MEAL', 'REST']);",
      replace: "const UNCOUNTED = new Set(['MEAL']);" },
    { name: 'meals are drawn one card each', file: WEEKS,
      find: "const FOLDED = new Set(['MEAL']);",
      replace: 'const FOLDED = new Set();' },
    { name: '＋ Add is offered on days gone', file: WEEKS,
      find: 'const canAdd = onAdd && iso >= todayIso;',
      replace: 'const canAdd = !!onAdd;' },
    { name: 'a finished workout reads its plan instead of its time', file: WEEKS,
      find: "    if (e.state === 'done' && e.doneSec) return fmtSec(e.doneSec);\n",
      replace: '' },
  ],
};
