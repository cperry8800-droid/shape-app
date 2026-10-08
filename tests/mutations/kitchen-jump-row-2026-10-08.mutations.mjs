// Mutation spec for the Kitchen's jump row lighting the course a tap scrolled to. Each
// mutation breaks one clause; every one must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/kitchen-jump-row-2026-10-08.mutations.mjs --fail-on-skipped
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const RULES = 'mobile-app/src/services/jumpRow.mjs';

export default {
  test: 'node --test tests/kitchen-jump-row.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the shared line ──
    { name: 'the line forgets where the scroller starts (the shipped defect)', file: RULES,
      find: '  return num(hostTop) + num(stickyTop) + num(rowHeight);',
      replace: '  return num(stickyTop) + num(rowHeight);' },
    { name: 'the line forgets the row', file: RULES,
      find: '  return num(hostTop) + num(stickyTop) + num(rowHeight);',
      replace: '  return num(hostTop) + num(stickyTop);' },
    { name: 'the page measures its line without the scroller top', file: CLIENT,
      find: 'bsJumpLine({ hostTop: host.getBoundingClientRect().top, stickyTop,',
      replace: 'bsJumpLine({ hostTop: 0, stickyTop,' },
    // ── the spy ──
    { name: 'the spy needs a course past the line, no slack', file: RULES,
      find: '    if (top - num(line) <= slack) idx = i;',
      replace: '    if (top - num(line) < 0) idx = i;' },
    { name: 'the first course lit is index 0, not the first on the page', file: RULES,
      find: '  return idx >= 0 ? idx : first;',
      replace: '  return idx >= 0 ? idx : 0;' },
    { name: 'the end of the scroll lights nothing new', file: RULES,
      find: '  if (atEnd) {',
      replace: '  if (false) {' },
    { name: 'the end rule lights a course below the screen', file: RULES,
      find: '      if (Number.isFinite(list[i]) && list[i] < viewBottom) { idx = Math.max(idx, i); break; }',
      replace: '      if (Number.isFinite(list[i])) { idx = Math.max(idx, i); break; }' },
    { name: 'a page that cannot scroll is at its end', file: RULES,
      find: '  return max > 0 && num(scrollTop) > 0 && num(scrollTop) >= max - 2;',
      replace: '  return num(scrollTop) >= max - 2;' },
    { name: 'the page never asks whether it is at the end', file: CLIENT,
      find: 'atEnd: bsJumpAtEnd(host), viewBottom',
      replace: 'atEnd: false, viewBottom' },
    // ── the jump ──
    { name: 'the jump lands a row-height short', file: RULES,
      find: '  return Math.max(0, num(scrollTop) + num(top) - num(line));',
      replace: '  return Math.max(0, num(scrollTop) + num(top) - num(line) + 47);' },
    // ── the tap's pin ──
    { name: 'a tap does not light its tab until the scroll lands', file: CLIENT,
      find: '    jumpPin.current = i;\n    setActiveCourse(i);',
      replace: '    jumpPin.current = i;' },
    { name: 'a tap is not pinned', file: CLIENT,
      find: '    jumpPin.current = i;\n    setActiveCourse(i);',
      replace: '    setActiveCourse(i);' },
    { name: 'the spy ignores the pin', file: CLIENT,
      find: '      if (jumpPin.current >= 0) return;\n',
      replace: '' },
    { name: 'a hand scroll never releases the pin', file: CLIENT,
      find: "    const byHand = () => { jumpPin.current = -1; };",
      replace: '    const byHand = () => {};' },
    { name: 'the tab hands the jump no index', file: CLIENT,
      find: 'onClick={() => jumpTo(c.key, i)}',
      replace: 'onClick={() => jumpTo(c.key, 0)}' },
  ],
};
