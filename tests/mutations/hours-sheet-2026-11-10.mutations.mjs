// Mutation spec for the Hours & rules sheet made wide and self-explaining (owner, 2026-11-10: "This pop
// up should fill more of screen … how does this work? How do I choose when im available"), and the coach
// Score card's bar drawn as the score ("Im at 80 but the bar is filled"). Every mutation must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/hours-sheet-2026-11-10.mutations.mjs --fail-on-skipped
const S = 'public/newdesign/dashSchedule.jsx';
const G = 'public/newdesign/coachGoalScore.jsx';

export default {
  test: 'node --test tests/schedule-5c.test.mjs tests/goal-score-boards-4c.test.mjs',
  timeoutMs: 240_000,
  mutations: [
    // ── the sheet ──
    { name: 'sheet: a 560px strip again', file: S, find: 'width: "min(1120px, 100vw)", outline: "none",', replace: 'width: "min(560px, 100vw)", outline: "none",' },
    { name: 'sheet: time off and the rules cannot stack', file: S, find: 'paddingTop: 16, display: "flex", flexWrap: "wrap", gap: "24px 48px" }}>', replace: 'paddingTop: 16, display: "flex", gap: "24px 48px" }}>' },
    { name: 'sheet: an empty week says nothing', file: S, find: '{state === "ready" && openMin === 0 && (', replace: '{false && (' },
    { name: 'sheet: a week with hours is told it has none', file: S, find: '{state === "ready" && openMin === 0 && (', replace: '{state === "ready" && (' },

    // ── the editor explains itself ──
    { name: 'editor: no readout while dragging', file: S, find: '    setDrag({ value: p.value, c0, c1, r0, r1 });\n', replace: '' },
    { name: 'editor: the readout outlives the drag', file: S, find: 'const end = () => { p.cleanup(); paintRef.current = null; setDrag(null); };', replace: 'const end = () => { p.cleanup(); paintRef.current = null; };' },
    { name: 'editor: closing reads as opening', file: S, find: '(drag.value ? "Opening " : "Closing ")', replace: '"Opening "' },
    { name: 'editor: the readout drops the last half hour', file: S, find: 'dscClock((drag.r1 + 1) * DSC_HALF)', replace: 'dscClock(drag.r1 * DSC_HALF)' },
    { name: 'editor: the readout names one day for a span', file: S, find: '(drag.c1 > drag.c0 ? "–" + DSC_AVAIL_DAYS[drag.c1][0] : "")', replace: '""' },
    { name: 'editor: Mon–Fri 9–5 starts at 8:30', file: S, find: 'i >= (9 * 60) / DSC_HALF && i < (17 * 60) / DSC_HALF', replace: 'i >= (8.5 * 60) / DSC_HALF && i < (17 * 60) / DSC_HALF' },
    { name: 'editor: Mon–Fri 9–5 runs to 5:30', file: S, find: 'i >= (9 * 60) / DSC_HALF && i < (17 * 60) / DSC_HALF', replace: 'i >= (9 * 60) / DSC_HALF && i <= (17 * 60) / DSC_HALF' },
    { name: 'editor: Mon–Fri 9–5 wipes the weekend', file: S, find: '    const next = cells.map((d) => d.slice());\n    for (const wd of [1, 2, 3, 4, 5])', replace: '    const next = cells.map(() => Array(DSC_CELLS).fill(false));\n    for (const wd of [1, 2, 3, 4, 5])' },
    { name: 'editor: Clear week leaves Monday', file: S, find: 'const clearWeek = () => setCells(Array.from({ length: 7 }, () => Array(DSC_CELLS).fill(false)));', replace: 'const clearWeek = () => setCells(cells.map((d, wd) => (wd === 1 ? d : Array(DSC_CELLS).fill(false))));' },
    { name: 'editor: Clear week live on an empty week', file: S, find: 'onClick={clearWeek} disabled={openMin === 0}', replace: 'onClick={clearWeek} disabled={false}' },
    { name: 'editor: a day\'s hours over its column are not its own', file: S, find: 'const dayMin = (wd) => cells[wd].filter(Boolean).length * DSC_HALF;', replace: 'const dayMin = (wd) => cells[1].filter(Boolean).length * DSC_HALF;' },
    { name: 'editor: the week in words is the stored week', file: S, find: '                const text = dscDaySummary(cells, wd);\n                return (\n                  <React.Fragment key={wd}>\n                    <span style={{ fontFamily: DSC_MONO, fontSize: 10,', replace: '                const text = dscDaySummary(seed.cells, wd);\n                return (\n                  <React.Fragment key={wd}>\n                    <span style={{ fontFamily: DSC_MONO, fontSize: 10,' },
    { name: 'editor: no hover on a cell', file: S, find: '[data-hours-editor] [data-hcell][aria-pressed="false"]:hover{', replace: '[data-hours-editor] [data-hcell][aria-pressed="false"]:focus{' },
    { name: 'editor: the steps name a colour', file: S, find: 'Start a drag on shaded time to close it again.', replace: 'Start a drag on teal to close it again.' },

    // ── the Score card's bar ──
    { name: 'score: the current tier fills whole', file: G, find: 'const fill = past ? 1 : cur ? place.frac : 0;', replace: 'const fill = past ? 1 : cur ? 1 : 0;' },
    { name: 'score: a tier passed is empty', file: G, find: 'const fill = past ? 1 : cur ? place.frac : 0;', replace: 'const fill = past ? 0 : cur ? place.frac : 0;' },
    { name: 'score: the way through the tier unclamped', file: G, find: '  const frac = Math.max(0, Math.min(1, (total - lo) / (hi - lo)));', replace: '  const frac = Math.max(0, (total - lo) / (hi - lo));' },
    { name: 'score: the way through the tier from zero', file: G, find: '  const frac = Math.max(0, Math.min(1, (total - lo) / (hi - lo)));', replace: '  const frac = Math.max(0, Math.min(1, total / hi));' },
  ],
};
