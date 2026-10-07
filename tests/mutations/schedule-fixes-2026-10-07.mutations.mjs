// Mutation spec for the coach Schedule fixes (owner, 2026-10-07: "Apply all the fixes first"):
// bookings on the coach's own clock on every reader of /api/calendar and through the reschedule
// round trip; the Schedule page loading the range on screen; and the calendar-sync claims taken
// off the coach-facing pages. Each mutation puts one defect back; the two suites must fail on
// every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/schedule-fixes-2026-10-07.mutations.mjs --fail-on-skipped
const CAL = 'src/app/api/calendar/route.ts';
const MANAGE = 'src/app/api/sessions/manage/route.ts';
const TIME = 'src/lib/time.ts';
const PAGE = 'public/newdesign/dashSchedule.jsx';
const SHELL = 'public/newdesign/pageShell.jsx';
const BACKEND = 'mobile-app/src/services/shapeBackend.js';
const APP_CAL = 'mobile-app/src/broadsheet/iosAppBroadsheetCalendar.jsx';
const COACHES = 'public/newdesign/coaches.jsx';
const COACH = 'public/newdesign/coach.jsx';
const NUTRI = 'public/newdesign/nutritionist.jsx';

export default {
  // dashboard-work-routes pins the capacity panel's read, which goes through the same route.
  test: 'node --test tests/schedule-fixes.test.mjs tests/coaches-page.test.mjs tests/dashboard-work-routes.test.mjs',
  timeoutMs: 180_000,
  mutations: [
    // ── 1 · the route places bookings in the zone ─────────────────────────────────────────
    { name: 'the route reads every booking in UTC again', file: CAL,
      find: 'wall: wallClockInZone(new Date(s.scheduled_at).getTime(), zone) }',
      replace: "wall: wallClockInZone(new Date(s.scheduled_at).getTime(), 'UTC') }" },
    { name: 'the wall clock takes its date from the UTC instant', file: TIME,
      find: "return { date: `${pad(p.y, 4)}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };",
      replace: "return { date: new Date(t).toISOString().slice(0, 10), time: `${pad(p.h)}:${pad(p.mi)}` };" },
    { name: 'the window is not cut back to its local dates', file: CAL,
      find: '=> !!p.wall && p.wall.date >= dFrom && p.wall.date <= dTo);',
      replace: '=> !!p.wall);' },
    { name: 'the read is not widened past the window\'s last UTC day', file: CAL,
      find: 'const toIso = `${widen ? shiftDate(dTo, widen) : dTo}T23:59:59Z`;',
      replace: 'const toIso = `${dTo}T23:59:59Z`;' },
    { name: 'the read is not widened before the window\'s first UTC day', file: CAL,
      find: 'const fromIso = `${widen ? shiftDate(dFrom, -widen) : dFrom}T00:00:00Z`;',
      replace: 'const fromIso = `${dFrom}T00:00:00Z`;' },
    { name: 'a UTC caller\'s read is widened too (the capacity ceiling grows)', file: CAL,
      find: "const widen = zone === 'UTC' ? 0 : 1;",
      replace: 'const widen = 1;' },
    { name: 'the coach\'s stored zone is ignored for the browser\'s', file: CAL,
      find: '    if (zone) return zone;\n',
      replace: '    if (zone && false) return zone;\n' },
    { name: 'a caller who sends no tz is zoned anyway', file: CAL,
      find: "if (sentTz == null) return 'UTC';",
      replace: "if (sentTz == null) sentTz = 'UTC';" },
    { name: 'role no longer picks the provider row', file: CAL,
      find: "const tables = role === 'trainer' ? ['trainers'] : role === 'nutritionist' ? ['nutritionists'] : ['trainers', 'nutritionists'];",
      replace: "const tables = ['trainers', 'nutritionists'];" },
    { name: 'the response stops naming its zone', file: CAL,
      find: '...planWorkouts, ...planMeals], zone });',
      replace: '...planWorkouts, ...planMeals] });' },

    // ── 1 · the reschedule reads the wall clock in the zone it was shown in ───────────────
    // ⚠ REPOINTED 2026-10-07 (step 2): `create` resolves its wall clock with the same line at a
    // shallower indent, so the reschedule's own indentation is what makes this anchor unique.
    { name: 'the reschedule reads the wall clock as UTC whatever it is sent', file: MANAGE,
      find: '    const at = instantInZone(y, mo, d, h, mi, zone);\n    if (!Number.isFinite(at)) {',
      replace: "    const at = instantInZone(y, mo, d, h, mi, 'UTC');\n    if (!Number.isFinite(at)) {" },
    { name: 'a sent zone that is not one is read as UTC', file: MANAGE,
      find: "const zone = sentZone == null || sentZone === '' ? 'UTC' : normalizeZone(sentZone);",
      replace: "const zone = sentZone == null || sentZone === '' ? 'UTC' : normalizeZone(sentZone) || 'UTC';" },
    { name: 'a zoneless reschedule is no longer UTC', file: MANAGE,
      find: "const zone = sentZone == null || sentZone === '' ? 'UTC' : normalizeZone(sentZone);",
      replace: "const zone = sentZone == null || sentZone === '' ? 'America/New_York' : normalizeZone(sentZone);" },
    { name: 'a wall clock the zone never shows is not refused', file: MANAGE,
      find: '    if (!Number.isFinite(at)) {\n',
      replace: '    if (false) {\n' },

    // ── 1 · the website page and overlay ───────────────────────────────────────────────────
    // ⚠ REPOINTED 2026-10-07 (step 2): a move now sends the TARGET time (the grid drags to a new
    // time; the month's day-only drop passes the booking's own), so the body reads `time`.
    { name: 'the page drag drops the zone', file: PAGE,
      find: 'time: time || null, tz: calZone || undefined })',
      replace: 'time: time || null })' },
    { name: 'the page drag sends this browser\'s zone instead of the one it was shown', file: PAGE,
      find: 'time: time || null, tz: calZone || undefined })',
      replace: 'time: time || null, tz: dscBrowserZone() || undefined })' },
    { name: 'the page reads the calendar without a zone', file: PAGE,
      find: '+ "&tz=" + encodeURIComponent(dscBrowserZone() || "");',
      replace: '+ "";' },
    { name: 'the page reads the calendar without its role', file: PAGE,
      find: '+ "&role=" + encodeURIComponent(role) + "&tz="',
      replace: '+ "&tz="' },
    { name: 'the label names this browser\'s zone, not the route\'s', file: PAGE,
      find: '{calZone && <span>Times in {calZone}</span>}',
      replace: '{calZone && <span>Times in {dscBrowserZone()}</span>}' },
    { name: 'the member overlay reads the calendar without a zone', file: SHELL,
      find: 'fetch(`/api/calendar?from=${from}&to=${to}&tz=${encodeURIComponent(tz)}${coachRole}`',
      replace: 'fetch(`/api/calendar?from=${from}&to=${to}${coachRole}`' },
    { name: '"today" is this browser\'s day, not the zone\'s', file: PAGE,
      find: 'const s = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());',
      replace: 'const s = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());' },

    // ── 1 · the app ────────────────────────────────────────────────────────────────────────
    { name: 'the app reads the calendar without a zone', file: BACKEND,
      find: "  qs.set('tz', deviceTimeZone());\n",
      replace: '' },
    { name: 'the app drops the zone the route named', file: BACKEND,
      find: "zone: typeof d?.zone === 'string' && d.zone ? d.zone : null };",
      replace: 'zone: null };' },
    { name: 'the app reschedule drops the zone', file: BACKEND,
      find: '  if (tz) body.tz = tz;\n',
      replace: '' },
    { name: 'the app sheet reschedules without the zone', file: APP_CAL,
      find: "action: 'reschedule', date: newDate, time, tz: event.zone || undefined });",
      replace: "action: 'reschedule', date: newDate, time });" },
    { name: 'the app screen stops sending its role', file: APP_CAL,
      find: 'window.ShapeCalendar.list({ from, to, clientId, role })',
      replace: 'window.ShapeCalendar.list({ from, to, clientId })' },

    // ── 2 · the page loads the range on screen, once ──────────────────────────────────────
    { name: 'the margin goes back to nothing', file: PAGE,
      find: 'const DSC_MARGIN_DAYS = 7;',
      replace: 'const DSC_MARGIN_DAYS = 0;' },
    { name: 'a loaded month is requested again', file: PAGE,
      find: 'const missing = wanted.filter((k) => !(cal && cal.months.has(k)) && !inflight.current.has(k) && !failed.current.has(k));',
      replace: 'const missing = wanted.filter((k) => !inflight.current.has(k) && !failed.current.has(k));' },
    { name: 'contiguous months go one request each', file: PAGE,
      find: 'if (run && dscNextMonthKey(run[run.length - 1]) === k) run.push(k); else runs.push([k]);',
      replace: 'runs.push([k]);' },
    { name: 'a run stops at its first month', file: PAGE,
      find: '"-01&to=" + dscMonthEnd(run[run.length - 1])',
      replace: '"-01&to=" + dscMonthEnd(run[0])' },
    { name: 'an answer on a new clock is merged into the old one', file: PAGE,
      find: 'if (!prev || prev.zone !== zone) return { zone, months: new Set(months), events: res.events.slice() };',
      replace: 'if (!prev) return { zone, months: new Set(months), events: res.events.slice() };' },
    { name: 'a booking that arrives twice is shown twice', file: PAGE,
      find: '  for (const e of res.events) byId.set(e.id, e);\n  return { zone, months: new Set([...prev.months, ...months]), events: [...byId.values()] };',
      replace: '  return { zone, months: new Set([...prev.months, ...months]), events: [...prev.events, ...res.events] };' },
    { name: 'the month grid steps 24 hours at a time again', file: PAGE,
      find: 'for (let i = 0; i < 42; i++) cells.push(dscAddDays(start, i));',
      replace: 'for (let i = 0; i < 42; i++) cells.push(new Date(start.getTime() + i * DSC_DAY));' },
    { name: 'adding days is 24-hour steps again', file: PAGE,
      find: 'function dscAddDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }',
      replace: 'function dscAddDays(d, n) { return new Date(d.getTime() + n * 86400000); }' },
    { name: 'a month step overflows from the 31st again', file: PAGE,
      find: 'view === "month" ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : dscAddDays(c, dir * 7)',
      replace: 'view === "month" ? (() => { const n = new Date(c); n.setMonth(n.getMonth() + dir); return n; })() : dscAddDays(c, dir * 7)' },

    // ── 3 · the claims stay down ───────────────────────────────────────────────────────────
    { name: 'the Coaches page sells two-way sync again', file: COACHES,
      find: '"Week and month views", "Drag a session to move it; the client is notified",',
      replace: '"Week and month views", "Two-way calendar sync",' },
    { name: 'the Coaches page syncs with Google, Apple and Outlook again', file: COACHES,
      find: 'body: "Your week and your month. Clients book inside Shape, into the hours you open, and every booking reads in your own time zone.',
      replace: 'body: "Your week and your month. Clients book inside Shape; the calendar syncs both ways with Google, Apple and Outlook.' },
    { name: 'the Coaches page handles no-shows again', file: COACHES,
      find: '"Bookings color-coded by client, one click to their file"',
      replace: '"No-show and reschedule handling"' },
    { name: 'the nutritionist tab promises intake forms again', file: COACHES,
      find: '"Consults color-coded by client, one click to their file"',
      replace: '"Intake forms before the first consult"' },
    { name: 'the trainer toolkit syncs again', file: COACH,
      find: '{ t: "Scheduling", b: "Clients book inside Shape, into the hours you open in your own time zone.',
      replace: '{ t: "Scheduling", b: "Two-way sync with Google, Apple, Outlook. Clients book inside Shape, into the hours you open in your own time zone.' },
    { name: 'the nutritionist toolkit promises auto-reminders again', file: NUTRI,
      find: 'Drag one to a new day and the client is notified." },',
      replace: 'Drag one to a new day and the client is notified. Auto-reminders." },' },
    { name: 'the setup step connects a calendar again', file: NUTRI,
      find: 'set session pricing, set your open hours, upload plan templates.',
      replace: 'set session pricing, connect your calendar, upload plan templates.' },
  ],
};
