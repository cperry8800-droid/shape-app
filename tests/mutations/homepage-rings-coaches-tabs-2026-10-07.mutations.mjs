// Mutation spec for the re-fitted homepage "loop" rings (owner, 2026-10-07: "these boxes on
// index page on website need to be better aligned") and the coaches tab row's scrollbar
// (same day: "remove this scroll toggle bar on coaches page"). Each mutation puts back one
// thing the owner saw or breaks one rule the fix carries; the two suites must fail on every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/homepage-rings-coaches-tabs-2026-10-07.mutations.mjs --fail-on-skipped
const PAGE = 'public/newdesign/index.html';
const COACHES = 'public/newdesign/coaches.jsx';

export default {
  test: 'node --test tests/homepage-climb.test.mjs tests/coaches-page.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    // ── The rings ───────────────────────────────────────────────────────────────────────
    { name: 'the rings go back to a 5% inset, through the content', file: PAGE,
      find: '.mo .hl{position:absolute;left:2.5%;right:2.5%;',
      replace: '.mo .hl{position:absolute;left:5%;right:5%;' },
    { name: 'the rings sit 3.5% in, on the content edge', file: PAGE,
      find: '.mo .hl{position:absolute;left:2.5%;right:2.5%;',
      replace: '.mo .hl{position:absolute;left:3.5%;right:3.5%;' },
    { name: 'the Wall ring loses its own inset', file: PAGE,
      find: 'style="top:37.5%;height:17.5%;left:1.25%;right:1.25%"',
      replace: 'style="top:37.5%;height:17.5%"' },
    { name: 'the Wall ring goes back over the NEW PR chip', file: PAGE,
      find: 'style="top:37.5%;height:17.5%;left:1.25%;right:1.25%"',
      replace: 'style="top:33.75%;height:21.75%;left:1.25%;right:1.25%"' },
    { name: 'the grocery ring runs onto the Avocado divider again', file: PAGE,
      find: 'style="top:39%;height:19.25%"',
      replace: 'style="top:39%;height:22.5%"' },
    { name: 'the session ring cuts the LOAD/REPS/RPE labels again', file: PAGE,
      find: 'style="top:11.75%;height:16.25%"',
      replace: 'style="top:12.75%;height:14.25%"' },
    { name: 'the eat ring grows into the menu below', file: PAGE,
      find: 'style="top:19.75%;height:17%"',
      replace: 'style="top:19.75%;height:20%"' },
    // ── The coaches tab row ──────────────────────────────────────────────────────────────
    { name: 'the tab row scrolls vertically again', file: COACHES,
      find: 'overflow-x:auto;overflow-y:hidden;scrollbar-width:none;',
      replace: 'overflow-x:auto;scrollbar-width:none;' },
    { name: 'the tab row draws a Firefox scrollbar', file: COACHES,
      find: 'overflow-y:hidden;scrollbar-width:none;-ms-overflow-style:none}',
      replace: 'overflow-y:hidden;-ms-overflow-style:none}' },
    { name: 'the tab row draws a WebKit scrollbar', file: COACHES,
      find: '        .co-tabs::-webkit-scrollbar{display:none}\n',
      replace: '' },
    { name: 'the tab row stops swiping sideways', file: COACHES,
      find: 'margin-bottom:22px;overflow-x:auto;overflow-y:hidden;',
      replace: 'margin-bottom:22px;overflow:hidden;' },
  ],
};
