// Mutation spec for the phone cook screen's oven tile keeping its dish, or its two dishes, inside the tile.
// Each mutation breaks one clause; every one must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/cook-oven-tile-fit-2026-10-08.mutations.mjs --fail-on-skipped
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const IN = '.bsck.dev .cC .oven .in{display:flex;flex-wrap:wrap;align-items:baseline;align-content:center;column-gap:5px;row-gap:1px;min-width:0;padding:0;text-align:left}';
const NAME = '.bsck.dev .cC .oven .in b{flex:0 0 100%;max-width:100%;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
const NOTE = '.bsck.dev .cC .oven .in small{flex:0 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
const TWO = '.bsck.dev .cC .oven .win.two{grid-auto-flow:row;gap:2px}';
const TWO_IN = '.bsck.dev .cC .oven .win.two .in{flex-wrap:nowrap}';
const TWO_NAME = '.bsck.dev .cC .oven .win.two .in b{flex:1 1 0}';
const WIN = '.bsck.dev .cC .oven .win,.bsck.dev .cC .oven.on .win{flex:1;min-width:0;background:none;border:0;padding:0;place-items:center stretch;text-align:left;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:10px}';

export default {
  test: 'node --test tests/cook-oven-tile-fit.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    { name: 'the base rule\'s centred grid comes back', file: CLIENT, find: IN, replace: IN.replace('display:flex;', '') },
    { name: 'the name and the rest share one line', file: CLIENT, find: IN, replace: IN.replace('flex-wrap:wrap;', '') },
    { name: 'the dish cannot shrink below its content', file: CLIENT, find: IN, replace: IN.replace('min-width:0;', '') },
    { name: 'the base rule\'s side padding comes back', file: CLIENT, find: IN, replace: IN.replace('padding:0;', '') },
    { name: 'the name does not take its own line', file: CLIENT, find: NAME, replace: NAME.replace('flex:0 0 100%;', '') },
    { name: 'the name keeps the base rule\'s 88px cap', file: CLIENT, find: NAME, replace: NAME.replace('max-width:100%;', '') },
    { name: 'the name wraps', file: CLIENT, find: NAME, replace: NAME.replace('white-space:nowrap;', '') },
    { name: 'the note wraps', file: CLIENT, find: NOTE, replace: NOTE.replace('white-space:nowrap;', '') },
    { name: 'the note cannot shrink', file: CLIENT, find: NOTE, replace: NOTE.replace('min-width:0;', '') },
    { name: 'the countdown can be squeezed', file: CLIENT,
      find: '.bsck.dev .cC .oven .in .n{flex:none;font-size:14px}', replace: '.bsck.dev .cC .oven .in .n{font-size:14px}' },
    { name: 'two ovens get auto columns that grow to their content', file: CLIENT, find: WIN, replace: WIN.replace('grid-auto-columns:minmax(0,1fr);', '') },
    { name: 'a dish sits at the start of its column instead of filling it', file: CLIENT, find: WIN, replace: WIN.replace('place-items:center stretch;', 'place-items:center start;') },
    // Two ovens (Codex's P2 on the first head).
    { name: 'two ovens go back to side-by-side columns', file: CLIENT, find: TWO, replace: TWO.replace('grid-auto-flow:row;', '') },
    { name: 'a two-oven dish wraps onto a second line', file: CLIENT, find: TWO_IN, replace: TWO_IN.replace('flex-wrap:nowrap', 'flex-wrap:wrap') },
    { name: 'a two-oven name shares the cut by width, taking the note with it', file: CLIENT, find: TWO_NAME, replace: TWO_NAME.replace('flex:1 1 0', 'flex:0 1 auto') },
    { name: 'the window is marked two only past two dishes', file: CLIENT,
      find: "className={`win${ovens.length > 1 ? ' two' : ''}`}", replace: "className={`win${ovens.length > 2 ? ' two' : ''}`}" },
    { name: 'the window is marked two for one dish', file: CLIENT,
      find: "className={`win${ovens.length > 1 ? ' two' : ''}`}", replace: "className={`win${ovens.length > 0 ? ' two' : ''}`}" },
  ],
};
