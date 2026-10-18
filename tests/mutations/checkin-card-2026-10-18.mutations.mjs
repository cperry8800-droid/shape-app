// Mutation spec for the one-tap daily check-in card (BSCheckinCard.jsx) and its wiring on Home.
// It writes daily_health_snapshot on every tap, so each rule that decides what is written, when,
// and what the member is told must be guarded. Every mutation must be killed. Run from the repo
// root:
//   node scripts/mutate.mjs --spec tests/mutations/checkin-card-2026-10-18.mutations.mjs --fail-on-skipped
const CARD = 'mobile-app/src/broadsheet/BSCheckinCard.jsx';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';

export default {
  test: 'node --test tests/checkin-card.test.mjs tests/broadsheet-checkin-pref.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── What is stored ──
    // A proven no-op. energy, hunger and sleep_quality are smallint (CHECK 1-10), and
    // /api/client/checkin rounds before it writes, so every value read back is a whole
    // number. For a whole n, n/2 is an integer or ends in .5, and Math.ceil and Math.round
    // (which rounds .5 up) agree on both. The two would differ only on a fraction, which
    // nothing can store. The test above pins all ten whole values.
    { name: 'an old 1-10 value reads as the wrong word', file: CARD, expectSurvive: true,
      find: 'return Math.max(0, Math.min(4, Math.ceil(Math.min(10, n) / 2) - 1));',
      replace: 'return Math.max(0, Math.min(4, Math.round(Math.min(10, n) / 2) - 1));' },
    { name: 'the words are stored off the engine thresholds', file: CARD,
      find: 'export const BS_CI_STORED = [2, 4, 6, 8, 10];',
      replace: 'export const BS_CI_STORED = [1, 3, 5, 7, 9];' },
    { name: 'the sleep step drops the Rested pick', file: CARD,
      find: '...(restedValue != null ? { sleepQuality: restedValue } : {})',
      replace: '' },
    { name: 'a glass is metric for everyone', file: CARD,
      find: 'const glassL = t.isMetric ? 0.25 : 0.2366;',
      replace: 'const glassL = 0.25;' },

    // ── Wearable nights ──
    { name: 'no night is read as a wearable one', file: CARD,
      find: "const device = at('sleepEfficiency') != null || at('restingHr') != null || at('hrv') != null;",
      replace: 'const device = false;' },
    { name: 'a wearable night alone counts as a check-in', file: CARD,
      find: '(day.sleep != null && !day.device)',
      replace: '(day.sleep != null)' },
    { name: 'a heart rate alone stops the sleep question', file: CARD,
      find: "if (today.sleep == null && !sleepSkipped) return 'sleep';",
      replace: "if (today.sleep == null && !today.device && !sleepSkipped) return 'sleep';" },
    { name: 'a heart rate alone counts as a worn night', file: CARD,
      find: 'return !!day && !!day.device && day.sleep != null;',
      replace: 'return !!day && !!day.device;' },
    { name: "Same as yesterday copies a wearable's night as typed", file: CARD,
      find: 'if (t.sleep == null && yesterday.sleep != null && !yesterday.device) {',
      replace: 'if (t.sleep == null && yesterday.sleep != null) {' },
    { name: 'a heart rate today keeps the night from being copied', file: CARD,
      find: 'if (t.sleep == null && yesterday.sleep != null && !yesterday.device) {',
      replace: 'if (t.sleep == null && !t.device && yesterday.sleep != null && !yesterday.device) {' },
    { name: 'a skipped night is asked again', file: CARD,
      find: "if (today.sleep == null && !sleepSkipped) return 'sleep';",
      replace: "if (today.sleep == null) return 'sleep';" },
    { name: 'a skip is forgotten when Home remounts', file: CARD,
      find: 'useState(() => (bsCiReadSkip(uid, todayIso) ? todayIso : null))',
      replace: 'useState(() => null)' },
    { name: "a skip holds the next day too", file: CARD,
      find: "function bsCiReadSkip(uid, iso) { try { return window.localStorage.getItem(bsCiSkipKey(uid)) === iso; }",
      replace: "function bsCiReadSkip(uid, iso) { try { return !!window.localStorage.getItem(bsCiSkipKey(uid)); }" },
    { name: 'Edit asks about a wearable night', file: CARD,
      find: "const afterHunger = () => (editing && !bsCiWornNight(today) ? 'sleep' : null);",
      replace: "const afterHunger = () => (editing ? 'sleep' : null);" },

    // ── Same as yesterday, the streak, the usual night ──
    { name: "Same as yesterday overwrites today's energy", file: CARD,
      find: 'if (t.energy == null) patch.energy = yesterday.energy;',
      replace: 'patch.energy = yesterday.energy;' },
    { name: 'the streak starts at an open today', file: CARD,
      find: 'let iso = bsCiAnswered(bsCiDay(series, todayIso)) ? todayIso : bsCiShift(todayIso, -1);',
      replace: 'let iso = todayIso;' },
    { name: "today's first answer does not extend the streak", file: CARD,
      find: '    if (firstToday) setStreak((n) => n + 1);\n',
      replace: '' },
    { name: 'tonight counts toward the usual night', file: CARD,
      find: 'for (let i = 1; i <= 14; i += 1) {',
      replace: 'for (let i = 0; i <= 14; i += 1) {' },
    { name: 'the usual night is not held to 3h-12h', file: CARD,
      find: 'return Math.max(3, Math.min(12, Math.round(mid * 2) / 2));',
      replace: 'return Math.round(mid * 2) / 2;' },

    // ── Saving ──
    { name: 'two taps write at once', file: CARD,
      find: 'const run = bsCiQueue.then(() => window.ShapeCheckin.log(patch));',
      replace: 'const run = window.ShapeCheckin.log(patch);' },
    { name: 'one failed save wedges every later one', file: CARD,
      find: 'bsCiQueue = run.catch(() => {});',
      replace: 'bsCiQueue = run;' },
    { name: 'a failed save keeps the answer on screen', file: CARD,
      find: 'const undo = (msg) => { setToday(before); ',
      replace: 'const undo = (msg) => { ' },
    { name: 'a failed save is not said in the card', file: CARD,
      find: 'setEditing(null); setErr(msg);',
      replace: 'setEditing(null);' },
    { name: 'the signed-out preview writes', file: CARD,
      find: '    if (!signedIn) return;\n    const undo',
      replace: '    const undo' },
    { name: 'the signed-out preview saves a glass', file: CARD,
      find: '    if (!signedIn) return; // the preview counts locally and saves nothing\n',
      replace: '' },
    { name: 'the signed-out preview claims a check-in', file: CARD,
      find: "{signedIn ? <>{tr('home:checkin.done'",
      replace: "{true ? <>{tr('home:checkin.done'" },

    // ── When it asks ──
    { name: "it asks before today's answers are read", file: CARD,
      find: '  if (!ready) return null;\n',
      replace: '' },
    { name: 'it asks about last night at 1 a.m.', file: CARD,
      find: "if (step !== 'done' && now.getHours() < BS_CI_ASK_FROM_HOUR) return null;",
      replace: "if (step !== 'done' && now.getHours() < 0) return null;" },
    { name: 'the done line hides before 4 a.m.', file: CARD,
      find: "if (step !== 'done' && now.getHours() < BS_CI_ASK_FROM_HOUR) return null;",
      replace: 'if (now.getHours() < BS_CI_ASK_FROM_HOUR) return null;' },

    // ── Home ──
    { name: 'the card shows with Check-ins off', file: CLIENT,
      find: "    if (!checkinOn) return null; // pref OFF — Home never nags (spec §3D)\n    return <BSCheckinCard",
      replace: '    return <BSCheckinCard' },
    { name: 'the quiet door shows beside the card', file: CLIENT,
      find: '  if (checkinOn) return null; // the card carries the done line\n',
      replace: '' },
  ],
};
