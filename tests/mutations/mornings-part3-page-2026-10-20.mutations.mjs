// Mutation spec for the Morning check-in, part 3 (Your mornings' What we've noticed, Nora told its screen, bsNoraOpen's stack, Who sees this; docs/REVIEW-2026-10-19-morning-checkin.md
// §3.6, §3.9, §3.10 and rulings 14-18). One of four part-3 specs, each with its own narrow test
// command. Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/mornings-part3-page-2026-10-20.mutations.mjs --fail-on-skipped
const PAGE = 'mobile-app/src/broadsheet/BSYourMornings.jsx';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const EN = 'mobile-app/src/i18n/catalogs/en/home.json';

export default {
  test: "node --test tests/your-mornings.test.mjs tests/your-mornings-module.test.mjs tests/nora-context.test.mjs tests/checkin-card.test.mjs",
  timeoutMs: 600_000,
  mutations: [
    { name: 'the example gets patterns', file: PAGE, find: 'const own = mine && mine.series ? mine.series : null;', replace: 'const own = series;' },
    { name: "another account's read gets patterns", file: PAGE, find: 'const own = mine && mine.series ? mine.series : null;', replace: 'const own = read && read.series ? read.series : null;' },
    { name: 'patterns end a week back', file: PAGE, find: '(own ? morningPatternsFor(own, todayIso) : null)', replace: '(own ? morningPatternsFor(own, bsCiShift(todayIso, -range)) : null)' },
    { name: 'the empty line with Check-ins off', file: PAGE, find: 'if (!shown.length && !checkinsOn) return null;', replace: 'if (!shown.length && false) return null;' },
    { name: 'Check-ins off hides a pattern that holds', file: PAGE, find: 'if (!shown.length && !checkinsOn) return null;', replace: 'if (!checkinsOn) return null;' },
    { name: 'no empty line', file: PAGE, find: 'if (!shown.length && !checkinsOn) return null;', replace: 'if (!shown.length) return null;' },
    { name: 'the direction is always more', file: PAGE, find: "lead: p.dir === 'more'", replace: 'lead: true' },
    { name: 'the counts swap sides', file: PAGE, find: 'a: p.short.low, n: p.short.n, b: p.full.low, m: p.full.n', replace: 'a: p.full.low, n: p.full.n, b: p.short.low, m: p.short.n' },
    { name: 'Low and Drained swap', file: PAGE, find: 'low: E[1], drained: E[0]', replace: 'low: E[0], drained: E[1]' },
    { name: "the tired line says energy's words", file: PAGE, find: 'tired: R[1], wrecked: R[0]', replace: 'tired: E[1], wrecked: E[0]' },
    { name: 'the follow-up ignores the coach', file: PAGE, find: '        next: coached\n', replace: '        next: !coached\n' },
    { name: 'a nutritionist is no coach', file: PAGE, find: 'const coached = coaching.trainer === true || coaching.nutritionist === true;', replace: 'const coached = coaching.trainer === true;' },
    { name: 'a failed plan read is a coach', file: PAGE, find: 'const coached = coaching.trainer === true || coaching.nutritionist === true;', replace: 'const coached = coaching.trainer !== false || coaching.nutritionist !== false;' },
    { name: 'based on one more', file: PAGE, find: 'n: p.mornings })', replace: 'n: p.mornings + 1 })' },
    { name: 'the section goes under the switch', file: PAGE, find: '            {patternsBlock()}\n            {rangeSwitch}\n', replace: '            {rangeSwitch}\n            {patternsBlock()}\n' },
    { name: 'no Ask Nora', file: PAGE, find: '{BSAskNoraLink ? <BSAskNoraLink', replace: '{false ? <BSAskNoraLink' },
    { name: "Nora is told Home", file: PAGE, find: "window.bsNoraOpen?.({ page: 'Your mornings', label: noraLabel },", replace: "window.bsNoraOpen?.({ page: 'Home', label: noraLabel }," },
    { name: "Nora's screen is never closed", file: PAGE, find: "    return typeof off === 'function' ? off : undefined;\n  }, [noraLabel]);", replace: '    return undefined;\n  }, [noraLabel]);' },
    { name: 'the short-night rule says 7h', file: PAGE, find: 'h: hm(BS_CI_SHORT_NIGHT_H)', replace: 'h: hm(7)' },
    { name: 'who sees this says averages again', file: EN, find: '"checkin.whoBoth": "Your trainer and nutritionist see your answers.",', replace: '"checkin.whoBoth": "Your trainer and nutritionist see your 7-day averages.",' },
    { name: 'a close never restores', file: CLIENT, find: '      if (stack.length) _bsNoraOpen[k] = stack[stack.length - 1].value;\n      else delete _bsNoraOpen[k];', replace: '      delete _bsNoraOpen[k];' },
    { name: 'a close takes every entry', file: CLIENT, find: '.filter((e) => e.token !== token)', replace: '.filter(() => false)' },
    { name: "a close restores the oldest", file: CLIENT, find: "      if (stack.length) _bsNoraOpen[k] = stack[stack.length - 1].value;\n", replace: "      if (stack.length) _bsNoraOpen[k] = stack[0].value;\n" },
    { name: 'every open shares one token', file: CLIENT, find: '  const token = {};\n  const set = [];', replace: '  const token = bsNoraOpen;\n  const set = [];' },
    { name: "a null sets the key", file: CLIENT, find: "    if (patch[k] == null) return;\n    const stack = (_bsNoraOpenStack", replace: "    if (patch[k] === undefined) return;\n    const stack = (_bsNoraOpenStack" },
    { name: "an open does not show at once", file: CLIENT, find: "    _bsNoraOpen[k] = stack[stack.length - 1].value;\n    set.push(k);", replace: "    set.push(k);" },
    { name: "an owner's re-run goes on top", file: CLIENT, find: "    if (!_bsNoraOwnerSeq.has(owner)) _bsNoraOwnerSeq.set(owner, (_bsNoraOpenSeq += 1));\n    seq = _bsNoraOwnerSeq.get(owner);", replace: "    seq = (_bsNoraOpenSeq += 1);" },
    { name: "the stack is never put in order", file: CLIENT, find: "    stack.sort((a, b) => a.seq - b.seq);\n", replace: "" },
    { name: "Home's tab passes no owner", file: CLIENT, find: "label: noraTabLabel }, noraOwner.current)", replace: "label: noraTabLabel })" },
    { name: "Your mornings passes no owner", file: PAGE, find: "label: noraLabel }, noraOwner.current)", replace: "label: noraLabel })" },
  ],
};
