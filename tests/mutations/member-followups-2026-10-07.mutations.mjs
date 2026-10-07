// Mutation spec for the member follow-ups registered on #2222 (owner, 2026-10-07: "keep
// going"): the website card's block headings, the app preview's per-move demo, and the app
// calendar's zone label. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/member-followups-2026-10-07.mutations.mjs --fail-on-skipped
const SIG = 'public/newdesign/dashSignals.js';
const CORE = 'public/newdesign/dashBuilderCore.js';
const CARD = 'public/newdesign/dashClient.jsx';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const CAL = 'mobile-app/src/broadsheet/iosAppBroadsheetCalendar.jsx';
export default {
  test: 'node --test tests/builder-fixes-client.test.mjs tests/schedule-fixes.test.mjs',
  timeoutMs: 240_000,
  mutations: [
    { name: 'the card heads every move', file: SIG,
      find: 'var blockLabel = kind && kind !== run ? CARD_BLOCKS[kind] : null;',
      replace: 'var blockLabel = kind ? CARD_BLOCKS[kind] : null;' },
    { name: 'a kindless move starts its own run', file: SIG,
      find: 'var kind = kinds[i] || run;', replace: 'var kind = kinds[i];' },
    { name: 'a move without a block is filed under Main', file: SIG,
      find: 'var kinds = list.map(function (e) { return cardBlockKind(e && e.block); });',
      replace: 'var kinds = list.map(function (e) { return cardBlockKind(e && e.block) || "main"; });' },
    { name: 'any string is a block', file: SIG,
      find: 'return Object.prototype.hasOwnProperty.call(CARD_BLOCKS, key) ? key : "";', replace: 'return key;' },
    { name: 'the card renders no heading', file: CARD,
      find: '{e.blockLabel && <div className="dash-card-block"', replace: '{false && <div className="dash-card-block"' },
    { name: 'the coach preview heads two mains twice', file: CORE,
      find: 'var kindLabel = rows.length && day.blocks[b].kind !== shownKind', replace: 'var kindLabel = rows.length' },
    { name: 'the coach preview names no block', file: CORE,
      find: 'blockLabel: i === 0 ? kindLabel : null,', replace: 'blockLabel: null,' },
    { name: 'the preview shows every demo open', file: APP,
      find: 'const open = demoAt === key;', replace: 'const open = true;' },
    { name: 'the preview offers no demo', file: APP,
      find: '{m.video && (() => {', replace: '{false && (() => {' },
    { name: 'the calendar forgets the zone', file: CAL,
      find: "setServerZone(typeof d.zone === 'string' && d.zone ? d.zone : null);", replace: '' },
    { name: 'the demo month is labelled too', file: CAL,
      find: 'zone={useServer ? serverZone : null}', replace: 'zone={serverZone}' },
  ],
};
