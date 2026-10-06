// Mutation spec for "a split is cut in the reader's unit" (owner, 2026-10-06:
// "it just cant be [mixed] measuring systems"). Each mutation breaks one clause of
// the fix; every one must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/splits-in-reader-unit-2026-10-06.mutations.mjs --fail-on-skipped
const SPLITS = 'public/newdesign/paceSplits.mjs';
const CARD = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const WEB = 'public/newdesign/communityFeed.jsx';

export default {
  test: 'node --test tests/pace-splits.test.mjs tests/feed-post-units.test.mjs tests/website-feed-units.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the split model ──
    { name: 'the reader\'s unit is ignored: every split is a mile', file: SPLITS,
      find: "const unit = inp.unit === 'km' ? 'km' : 'mi';",
      replace: "const unit = 'mi';" },
    { name: 'a trace bucket is always labelled a mile', file: SPLITS,
      find: "const name = known ? (unit === 'km' ? 'Km' : 'Mile') : 'Split';",
      replace: "const name = known ? 'Mile' : 'Split';" },
    { name: 'a bucket with no distance is labelled by a unit it was not cut by', file: SPLITS,
      find: "const name = known ? (unit === 'km' ? 'Km' : 'Mile') : 'Split';",
      replace: "const name = unit === 'km' ? 'Km' : 'Mile';" },
    { name: 'rows cut in the other unit are never re-cut', file: SPLITS,
      find: 'if (provider && !otherUnit) {',
      replace: 'if (provider) {' },
    { name: 'a converted pace outranks the row\'s own label', file: SPLITS,
      find: "    if (/^(mile|mi)\\b/i.test(label)) return 'mi';\n",
      replace: '' },
    { name: 'rows are re-cut even with no trace to cut', file: SPLITS,
      find: '&& Array.isArray(inp.paceTrace) && inp.paceTrace.length >= 2;',
      replace: ';' },
    { name: 'a distance in miles is not read in kilometres', file: SPLITS,
      find: "(unit === 'km' ? inp.distanceMi * MI_TO_KM : inp.distanceMi)",
      replace: 'inp.distanceMi' },
    // ── the app's session page ──
    { name: 'the page reads its distance in miles only', file: CARD,
      find: "const distM = String(distStat ? distStat[1] : '').match(/(\\d[\\d,]*(?:\\.\\d+)?)\\s*(mi|km)\\b/i);",
      replace: "const distM = String(distStat ? distStat[1] : '').match(/(\\d[\\d,]*(?:\\.\\d+)?)\\s*(mi)\\b/i);" },
    { name: 'the page cuts every split per mile', file: CARD,
      find: "unit: distUnit || ((t.unitPrefs && t.unitPrefs.distance === 'km') ? 'km' : 'mi'), distance, sport,",
      replace: "unit: 'mi', distance, sport," },
    { name: 'a chart marks its distance in miles', file: CARD,
      find: 'color: muted }}>{m} {distUnit}</span>; })}',
      replace: 'color: muted }}>{m} mi</span>; })}' },
    { name: 'the point under a finger is read in miles', file: CARD,
      find: "{distance ? ` · ${(scrub.frac * distance).toFixed(1)} ${distUnit}` : ''}",
      replace: "{distance ? ` · ${(scrub.frac * distance).toFixed(1)} mi` : ''}" },
    { name: 'the cadence bars say miles to a metric reader', file: CARD,
      find: "const unitLabel = (n) => (distUnit === 'km'",
      replace: "const unitLabel = (n) => (false" },
    // ── the website ──
    { name: 'the website reads its distance in miles only', file: WEB,
      find: 'const m = String(v == null ? "" : v).match(/(\\d[\\d,]*(?:\\.\\d+)?)\\s*(mi|km)\\b/i);',
      replace: 'const m = String(v == null ? "" : v).match(/(\\d[\\d,]*(?:\\.\\d+)?)\\s*(mi)\\b/i);' },
    { name: 'the website keeps a mile table for a metric reader', file: WEB,
      find: 'if (cut.source === "trace") {',
      replace: 'if (false) {' },
    { name: 'the website re-cuts in miles whatever the setting', file: WEB,
      find: 'const unit = prefs.distance === "km" ? "km" : "mi";',
      replace: 'const unit = "mi";' },
    { name: 'the website never loads the splits model', file: WEB,
      find: 'import("/newdesign/paceSplits.mjs")',
      replace: 'Promise.resolve({})' },
    { name: 'a website chart marks its distance in miles', file: WEB,
      find: '{mm} {distUnit || "mi"}</span>',
      replace: '{mm} mi</span>' },
  ],
};
