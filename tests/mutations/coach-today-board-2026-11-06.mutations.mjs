// Mutation spec for the coach Today board (step 3, 2026-11-06): who the brief and Needs you count
// (DashSignals.coachNeeds), the check-ins-reviewed figure, the next appointment, the brief's words,
// the fold at three, and Money's payout gate (public/newdesign/dashToday.jsx). Every mutation must
// be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/coach-today-board-2026-11-06.mutations.mjs --fail-on-skipped
const SIG = 'public/newdesign/dashSignals.js';
const TODAY = 'public/newdesign/dashToday.jsx';

export default {
  test: 'node --test tests/dash-today-board.test.mjs tests/coach-actions.test.mjs',
  timeoutMs: 180_000,
  mutations: [
    // ── who needs the coach ──
    { name: 'needs: amber counts as "needs you" now', file: SIG, find: 'now: needs.filter(function (r) { return r.severity === "red"; }),', replace: 'now: needs,' },
    { name: 'needs: a row without a lead of the coach\'s own counts', file: SIG, find: 'return r && (r.severity === "red" || r.severity === "amber") && r.lead;', replace: 'return r && (r.severity === "red" || r.severity === "amber");' },

    // ── check-ins reviewed ──
    { name: 'reviewed: an unread review counts as reviewed', file: SIG, find: 'if (latest && latest.reviewed === true) { total += 1; done += 1; }', replace: 'if (latest && latest.reviewed !== false) { total += 1; done += 1; }' },
    { name: 'reviewed: a month-old check-in counts', file: SIG, find: '          if (age < 0 || age > 7) return;\n          if (latest && latest.reviewed === true)', replace: '          if (age < 0) return;\n          if (latest && latest.reviewed === true)' },
    { name: 'reviewed: the preview reads as a failed read', file: SIG, find: 'why: unread ? (kpiLive(ctx) ? UNREAD : LIVE_ONLY) :', replace: 'why: unread ? UNREAD :' },

    // ── the next appointment ──
    { name: 'next: a session under way is "next up"', file: TODAY, find: 'if (at <= now || dayOf(at) !== today) continue;', replace: 'if (+r.end <= now || dayOf(at) !== today) continue;' },
    { name: 'next: tomorrow is today', file: TODAY, find: 'if (at <= now || dayOf(at) !== today) continue;', replace: 'if (at <= now) continue;' },
    { name: 'next: a cancelled booking is named', file: TODAY, find: 'if (r.status && (DASH_NOW_STATUSES.indexOf(r.status) === -1 || r.status === "completed")) continue;', replace: '' },
    { name: 'next: the day is UTC\'s, not the coach\'s', file: TODAY, find: 'const tz = Z && zone && Z.normalizeZone(zone) ? zone : (Z ? Z.viewerZone() : null);', replace: 'const tz = "UTC";' },

    // ── the brief's words ──
    { name: 'brief: one client reads plural', file: TODAY, find: 'out.push({ t: (n === 1 ? "1 client needs" : n + " clients need") + " your attention: " });', replace: 'out.push({ t: n + " clients need your attention: " });' },
    { name: 'brief: an unread pulse reads "nobody"', file: TODAY, find: 'return { count: read ? rows.length : null, names,', replace: 'return { count: rows.length, names,' },
    { name: 'brief: an unread day says "No more sessions today."', file: TODAY, find: 'dayRead: !!(day && day.read)', replace: 'dayRead: true' },

    // ── Needs you folds at three ──
    { name: 'needs you: four rows on the first screen', file: TODAY, find: 'const DASH_NEEDS_SHOWN = 3;', replace: 'const DASH_NEEDS_SHOWN = 4;' },
    { name: 'needs you: a client listed twice', file: TODAY, find: '    if (id != null && seen.has(id)) return;\n', replace: '' },

    // ── Money ──
    { name: 'money: the live page prints the sample payout', file: TODAY, find: '  if (!live) {\n    const d = dashDemoKpis().find', replace: '  if (true) {\n    const d = dashDemoKpis().find' },
  ],
};
