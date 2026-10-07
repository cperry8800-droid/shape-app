// Mutation spec for the dashboard grid with no edit mode (owner, 2026-10-07: "remove this
// arrange box and have all of these customization and edits done by dragging click etc. a
// more free feel with the boxes and widgets"). Each mutation brings back a mode, breaks a
// handle rule, or breaks the grip's keyboard path or the card's ×; the grid tests must fail.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/dash-grid-direct-edit-2026-10-07.mutations.mjs --fail-on-skipped
const GRID = 'public/newdesign/dashGrid.jsx';

export default {
  test: 'node --test tests/dash-grid-input.test.mjs tests/dash-card-settings.test.mjs tests/dash-widget-catalog.test.mjs',
  timeoutMs: 240_000,
  mutations: [
    // ── No mode ─────────────────────────────────────────────────────────────────────────
    { name: 'moving needs a mode again', file: GRID,
      find: 'grid.enableMove(!!storeState.loaded);',
      replace: 'grid.enableMove(!!storeState.loaded && directDrag);' },
    { name: 'resizing needs a mode again', file: GRID,
      find: 'grid.enableResize(!!storeState.loaded && !mobile && grid.getColumn() > 1);',
      replace: 'grid.enableResize(false);' },
    // ── Handles ─────────────────────────────────────────────────────────────────────────
    { name: 'a touch screen drags the whole card', file: GRID,
      find: 'handle: directDrag ? ".grid-stack-item-content, .dg-grip" : ".dg-grip",',
      replace: 'handle: ".grid-stack-item-content, .dg-grip",' },
    { name: 'a mouse can only drag the grip', file: GRID,
      find: 'handle: directDrag ? ".grid-stack-item-content, .dg-grip" : ".dg-grip",',
      replace: 'handle: ".dg-grip",' },
    { name: 'the grip is rendered by React, a commit too late', file: GRID,
      find: '    opts.el = dgItemShell((widget && widget.title) || spec.key, (e) => gripKeyRef.current(spec.key, e));\n',
      replace: '' },
    { name: 'a pointer change does not re-boot the grid', file: GRID,
      find: '+ ":" + layoutUnavailable + ":" + directDrag} ref={elRef}',
      replace: '+ ":" + layoutUnavailable} ref={elRef}' },
    { name: 'the first frame guesses touch', file: GRID,
      find: 'React.useState(() => typeof window !== "undefined" && !!window.matchMedia && dgFinePointer());',
      replace: 'React.useState(false);' },
    // ── The grip's keys ─────────────────────────────────────────────────────────────────
    { name: 'arrow keys do nothing', file: GRID,
      find: '    e.preventDefault();\n    arrange(key, dir);\n  };',
      replace: '    e.preventDefault();\n  };' },
    { name: 'Home is not the start', file: GRID,
      find: 'k === "Home" ? "top"',
      replace: 'k === "Home" ? 1' },
    { name: 'Shift + Right does not widen', file: GRID,
      find: 'const next = k === "ArrowRight" ? widths.find((w) => w > cur)',
      replace: 'const next = k === "ArrowRight" ? widths.find((w) => w === cur)' },
    { name: 'a keyboard move is not announced with its place', file: GRID,
      find: 'title + " moved to position " + (at + 1) + " of " + nodes.length + "."',
      replace: 'title + " moved."' },
    // ── The × ───────────────────────────────────────────────────────────────────────────
    { name: 'the × hides nothing', file: GRID,
      find: '    if (target) target.focus();\n    hide(key);\n',
      replace: '    if (target) target.focus();\n' },
    { name: 'focus is left to fall to <body>', file: GRID,
      find: '    if (target) target.focus();\n    hide(key);\n',
      replace: '    hide(key);\n' },
    { name: 'the × loses its name', file: GRID,
      find: 'aria-label={"Hide " + title} title={"Hide " + title}',
      replace: 'title={"Hide " + title}' },
    { name: 'the settings gear leaves the card', file: GRID,
      find: '        {dgSettingGroups(w).length > 0 && <DgCardSettings groups={dgSettingGroups(w)} />}\n',
      replace: '' },
  ],
};
