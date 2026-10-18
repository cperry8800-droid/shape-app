// Mutation spec for "no −7 for a missed weekly check-in while Check-ins is off" in the
// daily score job. Each mutation breaks one clause; every one must be killed. Run from
// the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/score-checkin-pref-2026-10-18.mutations.mjs --fail-on-skipped
const ROUTE = 'src/app/api/cron/score-accountability/route.ts';

export default {
  test: 'node --test tests/score-accountability-checkin-pref.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    { name: 'the penalty ignores the switch', file: ROUTE,
      find: "if (!checkinOff.has(uid)) await penalize('checkin', null, lastMonday, \"last week's check-in\");",
      replace: "await penalize('checkin', null, lastMonday, \"last week's check-in\");" },
    { name: 'the switch is read backwards', file: ROUTE,
      find: 'return !dailyCheckinOn(d.dailyCheckin) ||',
      replace: 'return dailyCheckinOn(d.dailyCheckin) ||' },
    { name: 'last week is judged by the switch as it is now', file: ROUTE,
      find: ' || (Number.isFinite(since) && since >= weekEnd);',
      replace: ';' },
    { name: 'a change from before the week ended skips it too', file: ROUTE,
      find: '(Number.isFinite(since) && since >= weekEnd)',
      replace: 'Number.isFinite(since)' },
    { name: 'a failed settings read no longer skips the chunk', file: ROUTE,
      find: 'if (sessRes.error || wosRes.error || habitsRes.error || settingsRes.error) {',
      replace: 'if (sessRes.error || wosRes.error || habitsRes.error) {' },
    { name: 'any user_goals doc is read as the settings', file: ROUTE,
      find: "          .eq('kind', 'client_settings')\n",
      replace: '' },
    { name: 'the legacy boolean is no longer read', file: ROUTE,
      find: 'return !dailyCheckinOn(d.dailyCheckin) ||',
      replace: "return !dailyCheckinOn(d.dailyCheckin === false ? undefined : d.dailyCheckin) ||" },
  ],
};
