// Mutation spec for "Draft with AI" in the builder's day editor (owner, 2026-10-07: "make sure
// there are no gaps in the draft a day with AI"). Each mutation puts one gap back; the suite
// must fail on every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/builder-ai-draft-2026-10-07.mutations.mjs --fail-on-skipped
const B = 'public/newdesign/dashBuilder.jsx';

export default {
  test: 'node --test tests/builder-ai-draft.test.mjs',
  timeoutMs: 240_000,
  mutations: [
    { name: 'the preview calls the trainer-only route', file: B,
      find: '    if (!live) { setSt({ state: "error", error: "Drafting with AI needs a signed-in trainer account. This is the preview." }); return; }\n',
      replace: '' },
    { name: 'an empty brief is sent', file: B,
      find: '    if (!request) { setSt({ state: "error",',
      replace: '    if (false) { setSt({ state: "error",' },
    { name: 'an empty draft is offered as a day', file: B,
      find: '      if (!dDay || !(dDay.blocks || []).some((b) => (b.rows || []).length)) throw new Error(',
      replace: '      if (!dDay) throw new Error(' },
    { name: 'the client the builder was opened for is not sent', file: B,
      find: 'kind: "day", ...(clientId ? { clientId } : {}) })',
      replace: 'kind: "day" })' },
    { name: 'Add replaces the day', file: B,
      find: '    const replace = mode === "replace" || !flat.length;',
      replace: '    const replace = true;' },
    { name: 'the draft renames a day the coach named', file: B,
      find: '...(placeholder && dDay.name ? { name: dDay.name } : {})',
      replace: '...(dDay.name ? { name: dDay.name } : {})' },
    { name: 'Undo stays offered after later edits, and would lose them', file: B,
      find: 'const canUndoDraft = !!aiUndo.current && aiUndo.current.after === JSON.stringify(day.blocks || []);',
      replace: 'const canUndoDraft = !!aiUndo.current;' },
    { name: 'Undo can run twice', file: B,
      find: '    aiUndo.current = null;\n    onChange(u.before);',
      replace: '    onChange(u.before);' },
    { name: 'a new block kind lands at the end, not in builder order', file: B,
      find: '    while (i > 0 && rank(next[i - 1].kind) > rank(db.kind)) i--;\n',
      replace: '' },
    { name: 'the merge changes the day it was given', file: B,
      find: '  const next = blocks.map((b) => ({ ...b, rows: [...(b.rows || [])] }));',
      replace: '  const next = blocks;' },
    { name: 'a template answer is not labelled', file: B,
      find: '        {ready && st.notice && <p className="dai-msg note">{st.notice}</p>}\n',
      replace: '' },
    { name: 'Escape in the brief closes the day too', file: B,
      find: 'else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }',
      replace: 'else if (e.key === "Escape") { onClose(); }' },
    { name: '?plan= opens again on every library refresh', file: B,
      find: '    planOpened.current=true;\n',
      replace: '' },
  ],
};
