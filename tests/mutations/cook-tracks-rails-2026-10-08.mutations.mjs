// Mutation spec for the cook screen's tracks drawn as rails (owner's pick A, 2026-10-08).
// Each mutation breaks one clause; every one must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/cook-tracks-rails-2026-10-08.mutations.mjs --fail-on-skipped
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const BOARD = 'mobile-app/src/services/cookBoard.mjs';

export default {
  test: 'node --test tests/cook-tracks-rails.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── what a lane says ──
    { name: 'a running timer outranks the step in front of the cook', file: BOARD,
      find: '  const cur = blocks.find((b) => b && b.current);\n  if (cur) return { kind: \'step\', n: cur.stepNo, of: cur.of };\n',
      replace: '' },
    { name: 'a timer that is up still reads as hands-off', file: BOARD,
      find: "    if (tm) return tm.up ? { kind: 'up' } : { kind: b.hold ? 'hold' : 'timer', left: tm.left };",
      replace: "    if (tm) return { kind: b.hold ? 'hold' : 'timer', left: tm.left };" },
    { name: 'a hands-on step\'s timer reads hands-off', file: BOARD,
      find: "{ kind: b.hold ? 'hold' : 'timer', left: tm.left }",
      replace: "{ kind: 'hold', left: tm.left }" },
    { name: 'a hands-on step\'s timer says no countdown', file: CLIENT,
      find: "    if (st.kind === 'timer') return tr('cook:ck.laneTimer', { defaultValue: 'Timer {time}', time: bsCkMmss(st.left) });\n",
      replace: '' },
    { name: 'a begun dish says "starts", not "next"', file: BOARD,
      find: "  return { kind: blocks.some((b) => b && b.past) ? 'next' : 'starts', at: next.at };",
      replace: "  return { kind: 'starts', at: next.at };" },
    { name: 'the plated screen says nothing special', file: BOARD,
      find: "  if (fit) return { kind: 'count', n: blocks.length };\n",
      replace: '' },
    { name: 'a finished dish names its last step', file: BOARD,
      find: "  if (!next) return { kind: 'done' };",
      replace: "  if (!next) return { kind: 'starts', at: blocks.length ? blocks[blocks.length - 1].at : 0 };" },
    // ── the words ──
    { name: 'next and starts read the same', file: CLIENT,
      find: "    return st.kind === 'next'\n      ? tr('cook:ck.laneNext', { defaultValue: 'Next {time}', time })",
      replace: "    return st.kind === 'nope'\n      ? tr('cook:ck.laneNext', { defaultValue: 'Next {time}', time })" },
    { name: 'without a clock a start time is invented', file: CLIENT,
      find: "    if (!hasClock) return tr('cook:ck.inMin',",
      replace: "    if (false) return tr('cook:ck.inMin'," },
    { name: 'the hands-off countdown is dropped', file: CLIENT,
      find: "tr('cook:ck.laneHold', { defaultValue: 'Hands-off {time}', time: bsCkMmss(st.left) })",
      replace: "tr('cook:ck.laneHold', { defaultValue: 'Hands-off', time: bsCkMmss(st.left) })" },
    // ── the bars ──
    { name: 'a bar carries its step number again', file: CLIENT,
      find: 'const bar = <span key={b.idx} className={cls} style={{ left: X + 1, width: w }} />;',
      replace: 'const bar = <span key={b.idx} className={cls} style={{ left: X + 1, width: w }}>{b.stepNo}</span>;' },
    { name: 'a running hold fades as done', file: CLIENT,
      find: 'const past = b.past && !fit && !(tm && !tm.up);',
      replace: 'const past = b.past && !fit;' },
    { name: 'the plated screen marks the last step current', file: CLIENT,
      find: "b.current && !fit && 'cur'].filter(Boolean).join(' ');",
      replace: "b.current && 'cur'].filter(Boolean).join(' ');" },
    { name: 'the rail is not drawn', file: CLIENT,
      find: '{rb > ra ? <span className="rail" style={{ left: ra, width: rb - ra }} /> : null}',
      replace: '{null}' },
    { name: 'the strip keeps the old chips\' margins', file: CLIENT,
      find: '  const ppm = fit ? (W - 24) / S : (W - 40) / S;',
      replace: '  const ppm = fit ? (W - 24) / S : (W - 48) / S;' },
    // ── the end of the ruler ──
    // ⚠ PROVEN NO-OP, kept so the proof stays beside the code. On the plated screen
    // nm = S, so fx = x(S) = playX, and showEnd needs fx - 6 - endW > playX + 6 + phW + 8,
    // i.e. -6 - endW > 6 + phW + 8 with both widths >= 0: never true. `!fit` only says the
    // intent and skips a translation call; the label cannot be drawn either way.
    { name: 'the plated screen names a ready time', file: CLIENT, expectSurvive: true,
      find: "  const endText = !fit && Number.isFinite(readyAt)",
      replace: "  const endText = Number.isFinite(readyAt)" },
    { name: 'the ready label crowds the playhead\'s', file: CLIENT,
      find: '  const showEnd = !!endText && fx > 0 && fx <= W && fx - 6 - endW > playX + 6 + phW + 8;',
      replace: '  const showEnd = !!endText && fx > 0 && fx <= W;' },
    { name: 'the plan\'s end is named instead of the top bar\'s time', file: CLIENT,
      find: "tr('cook:ck.readyAt', { defaultValue: 'Ready {time}', time: bsCkClockShort(readyAt) })",
      replace: "tr('cook:ck.readyAt', { defaultValue: 'Ready {time}', time: bsCkClockShort(anchor + S * 60000) })" },
    // ── the ruler ──
    { name: 'ruler times run under the ready label', file: CLIENT,
      find: '  if (showEnd) keepOut.push([fx - 6 - endW, fx + 2]);\n',
      replace: '' },
    { name: 'ruler times run under the playhead\'s label', file: CLIENT,
      find: '  const keepOut = [fit ? [playX - 6 - phW, playX + 2] : [playX - 2, playX + 6 + phW]];',
      replace: '  const keepOut = [];' },
    { name: 'a ruler time is cut by the left edge', file: CLIENT,
      find: '      if (X - half < 2 || keepOut.some(',
      replace: '      if (keepOut.some(' },
  ],
};
