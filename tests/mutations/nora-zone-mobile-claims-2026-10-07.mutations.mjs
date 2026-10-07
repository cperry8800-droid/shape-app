// Mutation spec for Nora's reschedule on the coach's own clock and the /mobile preview's
// sync claims (owner, 2026-10-07: "Apply all the fixes first"; both registered by the
// Schedule fixes). Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nora-zone-mobile-claims-2026-10-07.mutations.mjs --fail-on-skipped
const ACT = 'src/lib/ai/actions.mjs';
export default {
  test: 'node --test tests/ai-actions.test.mjs tests/coaches-page.test.mjs',
  timeoutMs: 180_000,
  mutations: [
    { name: 'the move carries no zone', file: ACT,
      find: '    if (zone !== \'UTC\') payload.tz = zone;\n', replace: '' },
    { name: 'the undo carries no zone', file: ACT,
      find: '    if (b.zone && b.zone !== \'UTC\') back.tz = b.zone;\n', replace: '' },
    { name: 'the old slot is read in UTC again', file: ACT,
      find: "var was = noraWallClock(String(sess.data.scheduled_at || ''), zone);",
      replace: "var was = noraWallClock(String(sess.data.scheduled_at || ''), 'UTC');" },
    { name: 'the stored zone is never read', file: ACT,
      find: "var z = r && r.data && typeof r.data.timezone === 'string' ? r.data.timezone.trim() : '';",
      replace: "var z = '';" },
    { name: 'an unknown zone is trusted', file: ACT,
      find: "    if (z) { new Intl.DateTimeFormat('en-US', { timeZone: z }); return z; }",
      replace: '    if (z) return z;' },
    { name: 'the preview does not name the zone', file: ACT,
      find: "var inZone = zone === 'UTC' ? '' : ' (' + zone + ')';", replace: "var inZone = '';" },
    { name: 'the /mobile coach page sells sync again', file: 'public/mobile/coach.jsx',
      find: 'b: "Clients book inside Shape, into the open hours you set in your own time zone. Drag a session to move it; the client is notified." },',
      replace: 'b: "Two-way sync with Google, Apple, Outlook. Clients book inside Shape." },' },
    { name: 'the /mobile member page sells sync again', file: 'public/mobile/clientOverview.jsx',
      find: 'b: "Workouts, meals, check-ins and calls in one place. Your coach sees what you see." },',
      replace: 'b: "Workouts, meals, check-ins, calls. Syncs with Google, Apple, Outlook." },' },
  ],
};
