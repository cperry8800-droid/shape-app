// Mutation spec for the Morning check-in, part 3 (the website's Today card points to the app and keeps water; the weekly readout answers the app's token; docs/REVIEW-2026-10-19-morning-checkin.md
// §3.6, §3.9, §3.10 and rulings 14-18). One of four part-3 specs, each with its own narrow test
// command. Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/mornings-part3-website-2026-10-20.mutations.mjs --fail-on-skipped
const SITE = 'public/newdesign/dashClient.jsx';
const READOUT = 'src/app/api/ai/weekly-readout/route.ts';

export default {
  test: "node --test tests/website-dash-units.test.mjs tests/weekly-readout-auth.test.mjs tests/weekly-readout-words.test.mjs",
  timeoutMs: 600_000,
  mutations: [
    { name: "the defaulted 3 L is a target", file: SITE, find: "  const n = Number(d && d.targetStoredL);", replace: "  const n = Number(d && (d.targetStoredL ?? d.targetL));" },
    { name: "a zero target draws progress", file: SITE, find: "  return Number.isFinite(n) && n > 0 ? n : null;\n}\nfunction DashTodayCard", replace: "  return Number.isFinite(n) && n >= 0 ? n : null;\n}\nfunction DashTodayCard",
      // A proven no-op: a 0 L target comes back as 0, and every reader tests the target for truth
      // (`hydTarget ? … : …`, `if (t != null)` then the same truth test), so 0 draws exactly what null
      // does: the amount alone. The tests pin that a zero target draws no progress either way.
      expectSurvive: true },
    { name: "a late read overwrites the add", file: SITE, find: "if (hydSeq.current === seq0) setHyd(Number(d.hydrationL) || 0);", replace: "setHyd(Number(d.hydrationL) || 0);" },
    { name: "a failed add shows 0 L", file: SITE, find: "setHyd(shown); setLastDelta(0);", replace: "setHyd(prev); setLastDelta(0);" },
    { name: "the link opens the marketing top", file: SITE, find: "href=\"GetApp.html#notify\"", replace: "href=\"GetApp.html\"" },
    { name: "a stale add answer is shown", file: SITE, find: "        if (seq !== hydSeq.current || !d || !d.ok) return;\n        setHyd(Number(d.hydrationL) || 0);", replace: "        if (!d || !d.ok) return;\n        setHyd(Number(d.hydrationL) || 0);",
      // A proven no-op: hydBusy locks + 250 ml, + 500 ml and Undo while an add is out (each returns
      // early, and the buttons are disabled), so only one POST is ever in flight and its seq is always
      // the current one. The guard stays as belt and braces; what CAN be stale, the day's read, has its
      // own check (seq0), killed above.
      expectSurvive: true },
    { name: "the add's target is never taken", file: SITE, find: '        if ("targetStoredL" in d) setHydTarget(dclWaterTarget(d));\n', replace: "" },
    { name: "a target removed in the app stays", file: SITE, find: 'if ("targetStoredL" in d) setHydTarget(dclWaterTarget(d));', replace: 'if (dclWaterTarget(d) != null) setHydTarget(dclWaterTarget(d));' },
    { name: "an older route's answer clears the target", file: SITE, find: 'if ("targetStoredL" in d) setHydTarget(dclWaterTarget(d));', replace: 'setHydTarget(dclWaterTarget(d));' },
    { name: "the readout serves a caller with no account", file: READOUT, find: "  if (!user) {\n    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });", replace: "  if (false) {\n    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });" },
    { name: "the readout's queries run on the cookie client", file: READOUT, find: "  const supabase = await clientForRequest(request);", replace: "  const supabase = await clientForRequest(new Request('http://x/'));" },
  ],
};
