// Mutation spec for the approved builder fixes (owner, 2026-10-07: "Apply all the fixes
// first"): members get the coach's blocks, the day's playlist and the coach's videos, and
// the coach's day editor goes quiet. Each mutation puts back one thing the owner saw or
// breaks one rule a fix carries; the suites must fail on every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/builder-fixes-2026-10-07.mutations.mjs --fail-on-skipped
const DOC = 'public/newdesign/workoutDocument.js';
const ROUTE = 'src/app/api/client/plan/route.ts';
const SESSION = 'mobile-app/src/services/workoutSession.mjs';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const TRAIN = 'public/newdesign/dashTrain.jsx';
const BUILDER = 'public/newdesign/dashBuilder.jsx';

export default {
  test: 'node --test tests/builder-fixes-client.test.mjs tests/builder-fixes-editor.test.mjs',
  timeoutMs: 240_000,
  mutations: [
    // ── One rule for what a block is ─────────────────────────────────────────────────────
    { name: 'any string is a block', file: DOC,
      find: "return BLOCK_KINDS.includes(key) ? key : '';",
      replace: 'return key;' },
    { name: 'a block kind is case-sensitive', file: DOC,
      find: "const key = typeof value === 'string' ? value.trim().toLowerCase() : '';",
      replace: "const key = typeof value === 'string' ? value.trim() : '';" },
    { name: 'the document forgets the finisher', file: DOC,
      find: "const BLOCK_KINDS = ['warmup', 'main', 'accessory', 'finisher'];",
      replace: "const BLOCK_KINDS = ['warmup', 'main', 'accessory'];" },
    // ── The plan route ───────────────────────────────────────────────────────────────────
    { name: 'the route drops the block again', file: ROUTE,
      find: '      block: blockKind(e.block),\n',
      replace: '' },
    { name: 'the route passes any block through raw', file: ROUTE,
      find: '      block: blockKind(e.block),\n',
      replace: "      block: e.block != null ? String(e.block) : '',\n" },
    // ── Grouping ─────────────────────────────────────────────────────────────────────────
    { name: 'a stray move opens a heading of its own', file: SESSION,
      find: "const kind = blockKind(m && m.block) || (last ? last.kind : '');",
      replace: 'const kind = blockKind(m && m.block);' },
    { name: 'two blocks of one kind merge into one', file: SESSION,
      find: '    if (last && last.kind === kind) last.moves.push(m);\n    else out.push({ kind, moves: [m] });',
      replace: '    const same = out.find((g) => g.kind === kind);\n    if (same) same.moves.push(m);\n    else out.push({ kind, moves: [m] });' },
    { name: 'a moveless day grows an empty list', file: SESSION,
      find: '  if (!list.length) return [];\n',
      replace: '' },
    // ── The app's workout preview ────────────────────────────────────────────────────────
    { name: 'the preview puts every move under one list again', file: APP,
      find: ': bsMoveBlocks(program.moves).map((g) => ({',
      replace: ': [{ kind: \'\', moves: program.moves }].map((g) => ({' },
    { name: 'the coach\'s Main reads as "Main set" again', file: APP,
      find: "main: tr('session:train.block.main', { defaultValue: 'Main' }),",
      replace: "main: 'Main set'," },
    { name: 'the accessory block loses its name', file: APP,
      find: "accessory: tr('session:train.block.accessory', { defaultValue: 'Accessory' }),",
      replace: "accessory: tr('session:train.block.main', { defaultValue: 'Main' })," },
    { name: 'a day without blocks is filed under an invented Main', file: APP,
      find: "name: g.kind ? blockName[g.kind] : tr('session:train.programKicker', { defaultValue: 'The program' }),",
      replace: 'name: blockName[g.kind] || blockName.main,' },
    // ── The app's playlist ───────────────────────────────────────────────────────────────
    { name: 'the Train mapping drops the playlist again', file: APP,
      find: "      playlist: w.playlist && String(w.playlist.name || '').trim()\n",
      replace: "      playlist: false && String(w.playlist.name || '').trim()\n" },
    { name: 'a nameless playlist is a playlist', file: APP,
      find: "      playlist: w.playlist && String(w.playlist.name || '').trim()\n",
      replace: '      playlist: w.playlist\n' },
    { name: 'the hero shows no playlist chip', file: APP,
      find: '{!isRestDay && cur.playlist && cur.playlist.name && (',
      replace: '{false && cur.playlist && (' },
    { name: 'a coach-set rest chips a soundtrack', file: APP,
      find: '{!isRestDay && cur.playlist && cur.playlist.name && (',
      replace: '{cur.playlist && cur.playlist.name && (' },
    { name: 'the chip opens nothing', file: APP,
      find: "<button type=\"button\" onClick={goRadio} style={{ marginTop: 4, minHeight: 44,",
      replace: "<button type=\"button\" onClick={() => {}} style={{ marginTop: 4, minHeight: 44," },
    { name: 'the chip drops the playlist\'s meta', file: APP,
      find: "♪ {cur.playlist.name}{cur.playlist.meta ? ` · ${cur.playlist.meta}` : ''}",
      replace: '♪ {cur.playlist.name}' },
    // ── The website Train card ───────────────────────────────────────────────────────────
    { name: 'the Train card drops both videos again', file: TRAIN,
      find: '    video: w.video || null, programVideo: w.programVideo || null,\n',
      replace: '' },
    { name: 'the Train card drops the program introduction', file: TRAIN,
      find: '    video: w.video || null, programVideo: w.programVideo || null,\n',
      replace: '    video: w.video || null,\n' },
    // ── Empty defaults ───────────────────────────────────────────────────────────────────
    { name: 'an empty load shows "0" again', file: BUILDER,
      find: 'const value = draft != null ? draft : dbuNoLoad(row.load) ? "" : row.load;',
      replace: 'const value = draft != null ? draft : (row.load ?? "");' },
    { name: 'the empty load has no placeholder', file: BUILDER,
      find: ' placeholder="—" value={value}',
      replace: ' value={value}' },
    { name: 'the typed text is not held', file: BUILDER,
      find: 'const value = draft != null ? draft : dbuNoLoad(row.load) ? "" : row.load;',
      replace: 'const value = dbuNoLoad(row.load) ? "" : row.load;' },
    { name: 'leaving the field keeps the typed 0', file: BUILDER,
      find: 'onBlur={()=>setDraft(null)}',
      replace: 'onBlur={()=>{}}' },
    // ⚠ REPOINTED BY STEP 2 (owner, 2026-10-07): the unit is a cell on the move's line now.
    { name: 'the unit shows with no weight', file: BUILDER,
      find: '{dbuShowsUnit(row) && <select className="ci u"',
      replace: '{true && <select className="ci u"' },
    { name: 'the unit ignores an imported load instruction', file: BUILDER,
      find: "return !dbuNoLoad(row.load) || String(row.loadText ?? '').trim() !== ''\n",
      replace: 'return !dbuNoLoad(row.load)\n' },
    { name: 'the unit ignores the ladder\'s weights', file: BUILDER,
      find: '\n    || ShapeWorkoutDocument.perSetEntries(row).some(e=>!dbuNoLoad(e.load));',
      replace: ';' },
    { name: 'no RPE reads "None" again', file: BUILDER,
      find: '<option value="">—</option>{dbuRpeOptions(row.rpe)',
      replace: '<option value="">None</option>{dbuRpeOptions(row.rpe)' },
    // ── The name once ────────────────────────────────────────────────────────────────────
    // ⚠ REPOINTED BY STEP 2: the card is gone, and the detail beside the list is where a
    // second naming of the move would now land.
    { name: 'the detail names the move again', file: BUILDER,
      find: '    <div className="dfs">\n',
      replace: '    <div className="dfs"><strong>{who}</strong>\n' },
    // ── The demo behind one control ──────────────────────────────────────────────────────
    // ⚠ REPOINTED BY STEP 2: the demo is open in the detail, so the regression is it going
    // missing from there.
    { name: 'the detail drops the demo', file: BUILDER,
      find: "    <div className=\"cb-demo\" role=\"group\" aria-label={'Demo video for ' + who}>",
      replace: "    <div className=\"cb-demo\" role=\"group\" aria-label={'Demo video for ' + who} hidden={!video}>" },
    { name: 'the folded demo does not say it is attached', file: BUILDER,
      find: "video?'Attached':'Optional'",
      replace: "'Optional'" },
    { name: 'the folded demo hides a running upload', file: BUILDER,
      find: "{uploading?'Uploading…':error?'Upload failed'",
      replace: "{error?'Upload failed'" },
    { name: 'the folded demo hides a failed upload', file: BUILDER,
      find: "error?'Upload failed':video?'Attached'",
      replace: "video?'Attached'" },
    { name: 'the move\'s line stops saying it has a demo', file: BUILDER,
      find: "    video && ['▶\uFE0E', 'Has a demo video'],\n",
      replace: '' },
    // ── Folded, one at a time ────────────────────────────────────────────────────────────
    // ⚠ REPOINTED BY STEP 2: the fold became one line per move with one open in the detail.
    { name: 'the first move of each block opens too', file: BUILDER,
      find: 'selected={!!current && current.key === x.key}',
      replace: 'selected={!!current && (current.key === x.key || x.ri === 0)}' },
    { name: 'pressing an open move closes it', file: BUILDER,
      find: '  const select = (key) => { if (!busy && key !== selKey) setSelKey(key); };',
      replace: '  const select = (key) => { if (!busy) setSelKey(key === selKey ? "none" : key); };' },
    { name: 'a move just added is not the one selected', file: BUILDER,
      find: '    const key = String(rows[0].id);\n    setSelKey(key);\n',
      replace: '    const key = String(rows[0].id);\n' },
  ],
};
