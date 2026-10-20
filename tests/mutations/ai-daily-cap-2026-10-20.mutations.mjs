// Mutation spec for the AI notify engine's daily cap counting every push of the person's day
// (owner, 2026-10-20: a separate PR after #2413): decideNotifications' pushedToday
// (src/lib/ai/notifications.mjs), loadPushedToday (src/lib/ai/notify-core.ts) and both routes
// that call the gate. Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/ai-daily-cap-2026-10-20.mutations.mjs --fail-on-skipped
const GATE = 'src/lib/ai/notifications.mjs';
const CORE = 'src/lib/ai/notify-core.ts';
const LIVE = 'src/app/api/ai/notify/route.ts';
const CRON = 'src/app/api/ai/notify/cron/route.ts';

export default {
  test: 'node --test tests/ai-notify-daily-cap.test.mjs tests/ai-notifications.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── The gate ──
    { name: 'the engine counts only its own sends', file: GATE, find: '  let usedToday = Math.max(state.sentToday, Number.isFinite(pushedToday) ? pushedToday : 0);', replace: '  let usedToday = state.sentToday;' },
    { name: "the day's pushes replace the engine's own count", file: GATE, find: '  let usedToday = Math.max(state.sentToday, Number.isFinite(pushedToday) ? pushedToday : 0);', replace: '  let usedToday = Number.isFinite(pushedToday) ? pushedToday : state.sentToday;' },
    { name: "this run's sends do not count", file: GATE, find: '    state.sentToday += 1;\n    usedToday += 1;', replace: '    state.sentToday += 1;' },

    // ── The day's pushes ──
    { name: 'an in-app-only notice counts as a push', file: CORE, find: 'if (r.data?.channels?.push === true && Number.isFinite(at)', replace: 'if (r.data?.channels && Number.isFinite(at)' },
    { name: "yesterday's pushes count today", file: CORE, find: " && ymdInTz(new Date(at), tz) === today) n += 1;", replace: ') n += 1;' },
    { name: "another person's pushes count", file: CORE, find: ".eq('user_id', userId).gte('created_at', since)", replace: ".gte('created_at', since)" },
    { name: 'a failed read counts as none', file: CORE, find: "counting this engine\\'s own', error.message); return null; }", replace: "counting this engine\\'s own', error.message); return 0; }" },

    // ── The routes ──
    { name: 'the live route leaves the day out', file: LIVE, find: 'Notify.decideNotifications({ candidates, last, prefs, now, audience, checkinOptedOut, pushedToday })', replace: 'Notify.decideNotifications({ candidates, last, prefs, now, audience, checkinOptedOut })' },
    { name: 'the cron leaves the day out', file: CRON, find: 'Notify.decideNotifications({ candidates, last, prefs, now, audience, checkinOptedOut, pushedToday })', replace: 'Notify.decideNotifications({ candidates, last, prefs, now, audience, checkinOptedOut })' },
  ],
};
