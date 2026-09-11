// The Instrument Board — the Session details page the owner picked on 2026-09-11
// ("i like the instrument board"), review §3.
//
// The page's promise is GLANCE FIRST, and every rule below is one rule wearing a
// different hat: A TILE, A COLUMN AND A SEGMENT ARE CLAIMS, so none of them may
// exist without a value behind it. A grid padded to six, a PLAN heading over five
// empty cells and a dial drawn for a set nobody rated are the same defect.
//
// The pure rules are DRIVEN and the components are MOUNTED, so an equivalent
// rewrite of either passes and a real regression fails. Nothing here pins a
// spelling: this file has paid for that eight times in one wave.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, drive, THEME } from './helpers/broadsheet-mount.mjs';
import { bsIbTiles, bsIbTileKind, bsIbSetRow, bsIbSetTable, bsIbSplitTable, bsIbZoneSegments } from '../mobile-app/src/services/instrumentBoard.mjs';

const RUN_STATS = [['Avg pace', '7:58 /mi'], ['Duration', '25:31'], ['Avg HR', '161 bpm'],
  ['Calories', '420'], ['Max HR', '178 bpm'], ['Elev gain', '120 ft'], ['Stride', '1.2 m']];

test('the suite is running the shipped rules, not a restatement', () => {
  for (const fn of [bsIbTiles, bsIbTileKind, bsIbSetRow, bsIbSetTable, bsIbSplitTable, bsIbZoneSegments]) {
    assert.equal(typeof fn, 'function');
  }
});

// ── the six tiles ───────────────────────────────────────────────────────────

test('six tiles at most, and everything past them keeps its dot-leader row', () => {
  const { tiles, rest } = bsIbTiles(RUN_STATS);
  assert.equal(tiles.length, 6);
  assert.equal(rest.length, 1);
  // Nothing is dropped on the way: the page shows every scalar it was handed.
  assert.equal(tiles.length + rest.length, RUN_STATS.length);
});

test('a session with four readable stats gets four tiles — the grid is never padded', () => {
  const { tiles, rest } = bsIbTiles(RUN_STATS.slice(0, 4));
  assert.equal(tiles.length, 4);
  assert.equal(rest.length, 0);
  assert.equal(bsIbTiles([]).tiles.length, 0);
});

test('a stat with nothing in it is not an instrument reading nothing', () => {
  // ⚠ An em-dash is this app's own way of writing "we could not read it", so a
  // tile carrying one is an instrument drawn around an absence.
  for (const blank of [null, undefined, '', '   ', '—', '-']) {
    const { tiles } = bsIbTiles([['Avg HR', blank], ['Calories', '420']]);
    assert.deepEqual(tiles.map((x) => x[0]), ['Calories'], `blank ${JSON.stringify(blank)} became a tile`);
  }
});

test('the ranking is the ledger’s, so one session cannot have two ideas about which numbers lead', () => {
  // pace / time / HR lead on a run, whatever order the provider listed them in.
  const shuffled = [['Calories', '420'], ['Avg HR', '161 bpm'], ['Avg pace', '7:58 /mi'], ['Duration', '25:31']];
  const { tiles } = bsIbTiles(shuffled, 3);
  assert.deepEqual(tiles.map((x) => x[0]).sort(), ['Avg HR', 'Avg pace', 'Duration']);
});

test('the needle outranks the ghost on a pace tile, and a plain stat stays plain', () => {
  assert.equal(bsIbTileKind('Avg pace', { hasNeedle: true, hasGhost: true }), 'needle');
  assert.equal(bsIbTileKind('Avg pace', { hasNeedle: false, hasGhost: true }), 'ghost');
  assert.equal(bsIbTileKind('Avg pace', {}), 'plain');
  assert.equal(bsIbTileKind('Avg HR', { hasGhost: true }), 'ghost');
  // A series existing does not entitle every tile to draw one.
  assert.equal(bsIbTileKind('Calories', { hasNeedle: true, hasGhost: true }), 'plain');
});

// ── the set-by-set table ────────────────────────────────────────────────────

test('a live row reads its columns off the row; a demo row is parsed from its note', () => {
  const live = bsIbSetRow(['Set 1', '225 lb × 3', 'RPE 7 · 42s · rest 2:30', { rpe: 7, plan: '225 × 3', rest: '2:30', dur: '42s' }]);
  assert.equal(live.plan, '225 × 3');
  assert.equal(live.rpe, 7);
  assert.equal(live.rest, '2:30');
  const demo = bsIbSetRow(['Set 3', '245 lb × 3', 'RPE 9 · PR']);
  assert.equal(demo.rpe, 9);
  assert.equal(demo.note, 'PR');
  assert.equal(demo.plan, null, 'a demo row invented a prescription');
});

test('what the REST column takes, the note column gives up', () => {
  // Otherwise one row prints `rest 2:30` twice and looks like two measurements.
  const r = bsIbSetRow(['Set 1', '225 lb × 3', 'RPE 7 · 42s · rest 2:30']);
  assert.equal(r.rest, '2:30');
  assert.equal(r.note, '42s');
  assert.doesNotMatch(String(r.note), /rest/i);
});

test('an unrated set gets no dial — 0 is not a rating and null is not a 0', () => {
  for (const rpe of [null, undefined, '', 0, '0', 'n/a', NaN, false]) {
    assert.equal(bsIbSetRow(['Set 1', '225 lb', '', { rpe }]).rpe, null, `rpe ${JSON.stringify(rpe)} drew a dial`);
  }
  assert.equal(bsIbSetRow(['Set 1', '225 lb', '', { rpe: 8.5 }]).rpe, 8.5);
});

test('an optional column exists only when a row has something to put in it', () => {
  const bare = bsIbSetTable([['Set 1', '225 lb × 3', ''], ['Set 2', '245 lb × 3', '']]);
  assert.deepEqual(bare.cols, { plan: false, rpe: false, rest: false, note: false });
  const full = bsIbSetTable([['Set 1', '225 lb × 3', 'RPE 7', { plan: '225 × 3', rpe: 7, rest: '2:30' }]]);
  assert.deepEqual(full.cols, { plan: true, rpe: true, rest: true, note: false });
  // One row among many is enough for the column to exist — the others render empty.
  const some = bsIbSetTable([['Set 1', '225 lb', ''], ['Set 2', '245 lb', '', { plan: '245 × 1' }]]);
  assert.equal(some.cols.plan, true);
});

test('a lone set is not better than anything, and every bar is visible', () => {
  assert.equal(bsIbSetTable([['Set 1', '225 lb × 3', '']]).bestIdx, -1);
  const t = bsIbSetTable([['Set 1', '5 lb', ''], ['Set 2', '500 lb', '']]);
  assert.equal(t.bestIdx, 1);
  // The floor keeps a light set a bar rather than a sliver that reads as missing.
  assert.ok(t.widths.every((w) => w >= 24 && w <= 100), JSON.stringify(t.widths));
});

test('a malformed row never throws — there is no error boundary in the app shell', () => {
  for (const rows of [null, undefined, [null], [[]], [[null, null, null, null]], [['a']]]) {
    assert.doesNotThrow(() => bsIbSetTable(rows), JSON.stringify(rows));
  }
  assert.doesNotThrow(() => bsIbTiles(null));
  assert.doesNotThrow(() => bsIbZoneSegments(null));
  assert.doesNotThrow(() => bsIbSplitTable(null));
});

// ── the zone bar and the split table ────────────────────────────────────────

test('a zone with no time keeps a sliver of the bar and still reports zero', () => {
  const segs = bsIbZoneSegments([['Z1', 32], ['Z2', 0], ['Z3', null]]);
  assert.deepEqual(segs.map((s) => s.pct), [32, 0, 0]);
  // Five segments in one order is what makes two sessions comparable; a collapsed
  // zone would make the bar a different chart each time.
  assert.ok(segs.every((s) => s.flex > 0), 'a zone collapsed to nothing');
  assert.ok(segs[1].flex < 1, 'the sliver is big enough to be misread as time spent');
});

test('the split table truncates and says how many there really are', () => {
  const splits = Array.from({ length: 12 }, (_, i) => ({ label: `Mile ${i + 1}`, hr: 150, cadence: null, elevDelta: null }));
  const st = bsIbSplitTable(splits);
  assert.equal(st.shown.length, 6);
  assert.equal(st.total, 12);
  assert.equal(st.truncated, true, 'a truncated table that does not say so is a page claiming to be the record');
  assert.deepEqual(st.cols, { hr: true, cadence: false, elev: false });
  assert.equal(bsIbSplitTable(splits.slice(0, 4)).truncated, false);
});

// ── the row on its way from the card to the page ────────────────────────────
//
// ⚠ THE DETAIL PAGE IS HANDED ITS ROWS BY THE CARD, THROUGH THE UNIT CONVERTER,
// AND THE CONVERTER TAKES TEXT. Passing the structured fourth element to `uText`
// turned it into "[object Object]" — the columns were destroyed in silence and
// the table fell back to parsing the note, losing the prescription. Found in a
// browser, not by reading, and the mutation that reinstates it SURVIVED the
// first round because nothing here drove this seam.
test('the unit converter carries the structured columns through, and converts the plan', () => {
  const src = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  const at = src.indexOf('const uMeta = (m) =>');
  assert.ok(at > 0, 'uMeta moved');
  const tail = ': rows);';
  const end = src.indexOf(tail, at);
  assert.ok(end > at, 'uStats no longer follows uMeta');
  const body = src.slice(at, end + tail.length);
  assert.ok(body.includes('uStats'), 'the lift missed uStats');
  // A converter that shouts, so a cell that went through it is obvious.
  const t = { uText: (x) => `«${String(x)}»` };
  const { uStats } = new Function('t', `${body}\nreturn { uStats };`)(t);
  const [row] = uStats([['Set 1', '225 lb × 3', 'RPE 7 · rest 2:30', { rpe: 7, plan: '225 lb × 3', rest: '2:30', dur: '42s' }]]);
  assert.equal(typeof row[3], 'object', 'the meta was stringified');
  assert.equal(row[3].rpe, 7, 'the rating went through a text converter');
  assert.equal(row[3].rest, '2:30', 'a duration went through a unit converter');
  assert.equal(row[3].plan, '«225 lb × 3»', 'the prescription carries a load and was NOT converted');
  assert.equal(row[1], '«225 lb × 3»', 'the lifted value stopped being converted');
  assert.equal(row[2], '«RPE 7 · rest 2:30»', 'the note stopped being converted');
  // A row with no meta is untouched by the object branch.
  assert.deepEqual(uStats([['Set 1', '225 lb', 'RPE 7']])[0], ['Set 1', '«225 lb»', '«RPE 7»']);
  // And the parse on the far side still reads what came through.
  assert.equal(bsIbSetRow(row).rpe, 7);
  assert.equal(bsIbSetRow(row).plan, '«225 lb × 3»');
});

// ── the components, mounted ─────────────────────────────────────────────────

const mod = await loadBroadsheet(['BSActivityDetail', 'BSIbTile', 'BSIbTiles', 'BSIbTable', 'BSIbZoneBar']);
const svgsOf = (api, tag) => api.nodes().filter((n) => n.type === tag);

test('a tile draws its ghost, its needle, or neither — never both', () => {
  const base = { label: 'Avg HR', value: '161 bpm', heat: '#34d6c5', t: THEME };
  const ghost = drive(mod.BSIbTile, { ...base, kind: 'ghost', ghostPath: 'M0 0 L100 100', needle: null });
  assert.equal(svgsOf(ghost, 'path').length, 1);
  assert.equal(svgsOf(ghost, 'line').length, 0);
  const needle = drive(mod.BSIbTile, { ...base, label: 'Avg pace', kind: 'needle', ghostPath: 'M0 0 L100 100', needle: { frac: 0.62, lo: '9:10', hi: '7:02' } });
  assert.equal(svgsOf(needle, 'path').length, 0, 'a needle tile also drew a ghost');
  assert.equal(svgsOf(needle, 'line').length, 2, 'the needle band is a baseline and a mark');
  const plain = drive(mod.BSIbTile, { ...base, kind: 'plain', ghostPath: 'M0 0 L100 100', needle: { frac: 0.5, lo: 'a', hi: 'b' } });
  assert.equal(svgsOf(plain, 'path').length + svgsOf(plain, 'line').length, 0, 'a plain tile drew an instrument');
  // The unit is typeset apart from the figure, so it is on the tile either way.
  assert.match(ghost.text, /bpm/);
});

test('the needle states its endpoints once, because a tick mark alone claims nothing', () => {
  const withNeedle = drive(mod.BSIbTiles, {
    tiles: [['Avg pace', '7:58']], rest: [], heat: '#34d6c5', t: THEME,
    ghostFor: () => null, paceTrace: [480, 500, 460, 520, 470], isRide: false,
  });
  assert.match(withNeedle.text, /slowest/i);
  assert.match(withNeedle.text, /fastest/i);
  const without = drive(mod.BSIbTiles, {
    tiles: [['Calories', '420']], rest: [], heat: '#34d6c5', t: THEME,
    ghostFor: () => null, paceTrace: null, isRide: false,
  });
  assert.doesNotMatch(without.text, /slowest/i, 'a band was described for a tile that draws none');
});

test('the zone bar draws one segment per zone and labels every one', () => {
  const api = drive(mod.BSIbZoneBar, { zones: [['Z1', 32], ['Z2', 36], ['Z3', 22], ['Z4', 8], ['Z5', 2]], heat: '#34d6c5', t: THEME });
  assert.equal(api.nodes().filter((n) => n.type === 'span' && n.props['aria-hidden']).length, 5);
  for (const z of ['Z1 32%', 'Z2 36%', 'Z3 22%', 'Z4 8%', 'Z5 2%']) assert.ok(api.text.includes(z), z);
  // No zones is no bar, not an empty one.
  assert.equal(drive(mod.BSIbZoneBar, { zones: [], heat: '#34d6c5', t: THEME }).nodes().length, 0);
});

test('the table draws one heading per column, one bar per row, and marks one best', () => {
  const head = [{ label: 'Set', w: 'auto' }, { label: 'Lifted', w: 'auto', right: true }];
  const rows = [
    { cells: [{ text: 'Set 1' }, { text: '225 lb × 3' }], width: 90, best: false },
    { cells: [{ text: 'Set 2' }, { text: '245 lb × 3' }], width: 100, best: true },
  ];
  const api = drive(mod.BSIbTable, { head, rows, heat: '#34d6c5', t: THEME, muted: '#777' });
  for (const s of ['Set', 'Lifted', 'Set 1', '225 lb × 3', 'Set 2', '245 lb × 3']) assert.ok(api.text.includes(s), s);
  const bars = api.nodes().filter((n) => n.props.style && n.props.style.gridColumn === '1 / -1');
  assert.equal(bars.length, rows.length, 'one bar per row');
  const heated = api.nodes().filter((n) => n.props.style && n.props.style.background === '#34d6c5');
  assert.equal(heated.length, 1, 'the heat marks exactly one row');
});

// ── the page ────────────────────────────────────────────────────────────────

const DETAIL = {
  key: 'k1', focus: 'stats', tc: '#a07a2e', who: 'Quinn Harper', tierDisplay: 'TEMPO', role: 'Client',
  roleKind: 'CLIENT', realTier: 'tempo', city: 'Brooklyn', ago: '2h', typeLabel: 'STRENGTH', verb: 'Respect',
  title: 'Lower push · Block 2', body: 'Bar speed held.', avatarPhoto: null, coSign: null, showRoute: false,
  heroStat: ['Top set', '245 lb'], prDelta: '+10 lb',
  detailStats: [['Top set', '245 lb'], ['Total sets', '18'], ['Avg HR', '136 bpm'], ['Max HR', '159 bpm'], ['Calories', '440'], ['Volume', '9,120 lb'], ['Stride', '1.2 m']],
  zones: [['Z1', 32], ['Z2', 36], ['Z3', 22], ['Z4', 8], ['Z5', 2]],
  trace: [102, 116, 130, 118, 108, 122, 138, 126, 112, 124],
  breakdown: { label: '', rows: [['Set 1', '225 lb × 3', 'RPE 7 · 42s · rest 2:30', { rpe: 7, plan: '225 × 3', rest: '2:30', dur: '42s' }], ['Set 2', '245 lb × 3', 'RPE 9 · PR', null]] },
  followedLikers: [{ name: 'Maya Okafor' }], allLikers: [{ name: 'Maya Okafor' }],
  a: { real: false, body: 'Bar speed held.', postId: null, created_at: null, userId: null },
};
const page = (over = {}) => drive(mod.BSActivityDetail, {
  d: { ...DETAIL, ...(over.d || {}) }, liked: false, count: 12, myExpr: null,
  comments: [{ who: 'A', text: 'nice' }], feedAvatars: {},
  onClose() {}, onReact() {}, onProfile() {}, onOpenLikers() {}, draft: '', setDraft() {}, onSend() {},
});
const has = (api, type) => api.nodes().some((n) => n.type === type);

test('the stats page is the board: tiles, the zone bar and the set table', () => {
  const api = page();
  assert.ok(has(api, mod.BSIbTiles), 'the tiles are not mounted');
  assert.ok(has(api, mod.BSIbZoneBar), 'the zone bar is not mounted');
  assert.ok(has(api, mod.BSIbTable), 'the set table is not mounted');
  const tiles = api.nodes().find((n) => n.type === mod.BSIbTiles);
  // The hero's own stat is never repeated as a tile.
  assert.ok(!tiles.props.tiles.some(([k]) => /top set/i.test(k)), 'the hero stat came back as a tile');
  assert.ok(tiles.props.tiles.length > 0 && tiles.props.tiles.length <= 6);
});

test('the comments page carries none of the board, and the board carries no composer', () => {
  const stats = page(), cmts = page({ d: { focus: 'comments' } });
  for (const type of [mod.BSIbTiles, mod.BSIbZoneBar, mod.BSIbTable]) {
    assert.ok(!has(cmts, type), 'a board component rendered on the comments page');
  }
  assert.ok(cmts.nodes().some((n) => n.type === 'input'), 'the comments composer is missing');
  assert.ok(!stats.nodes().some((n) => n.type === 'input'), 'the composer rendered on the stats page');
  // ⚠ AND THE ACTION BAR IS NOT ON THE COMMENTS PAGE EITHER. That page already
  // carries a reactions block at the top and the composer at the foot; a third
  // bar between them stacks two controls on one edge and offers a second, worse
  // way to do what the composer is for. This assertion is here because the
  // mutation that puts it there SURVIVED the first round.
  const cmtLabels = cmts.buttons().map((b) => b.label);
  assert.ok(!cmtLabels.some((l) => /^\d+ ›$/.test(l)), `the action bar rendered on the comments page: ${JSON.stringify(cmtLabels)}`);
});

test('the sticky bar puts reactions, the comment count and the back-and-forth in reach', () => {
  // ⚠ They were reachable only by scrolling to the END of the comments page, so
  // on the longest sessions the controls were furthest from the reader.
  const labels = page().buttons().map((b) => b.label);
  assert.ok(labels.some((l) => /Respect · 12/.test(l)), `no reaction control: ${JSON.stringify(labels)}`);
  assert.ok(labels.some((l) => /^1 ›$/.test(l)), `no comment count: ${JSON.stringify(labels)}`);
});

test('tapping the count turns the page to the comments, and the stats go with it', () => {
  const api = page();
  assert.ok(has(api, mod.BSIbTiles));
  api.click('1 ›');
  assert.ok(!has(api, mod.BSIbTiles), 'the board stayed up behind the comments');
  assert.ok(api.nodes().some((n) => n.type === 'input'), 'the composer did not arrive');
});

test('the splits link says what is through it, which depends on truncation', () => {
  // ⚠ Measured in a browser: the demo run bucketed into THREE splits, so the
  // table showed all three under a link reading "All 3 splits ›" — an invitation
  // to see what was already on the screen.
  const many = Array.from({ length: 12 }, (_, i) => ({ label: `Mile ${i + 1}`, paceLabel: '8:30/mi', zone: 3, hFrac: 0.5 }));
  const few = many.slice(0, 3);
  const label = (splits) => {
    const api = page({ d: { rawSplits: splits.map((x) => ({ label: x.label, pace: x.paceLabel })) } });
    return api.buttons().map((b) => b.label).find((l) => /splits/i.test(l)) || '';
  };
  // ⚠ The harness's `tr` hands back the defaultValue without interpolating, so
  // the COUNT is asserted in the browser and the CHOICE of sentence here. Which
  // of the two sentences the link uses is the whole rule.
  assert.match(label(many), /All \{n\} splits/i, 'a truncated table hid how many there are');
  assert.doesNotMatch(label(few), /All \{n\} splits/i, 'a whole table offered a link to what is already on screen');
  assert.match(label(few), /full breakdown/i, 'the Splits page lost its own name');
});

test('back undoes the last step, which is not always close', () => {
  // ⚠ Once the bar can turn the page, a Back that always closed would throw away
  // the board a member scrolled through to get to the comments.
  let closed = 0;
  const api = drive(mod.BSActivityDetail, {
    d: { ...DETAIL }, liked: false, count: 12, myExpr: null, comments: [{ who: 'A', text: 'nice' }],
    feedAvatars: {}, onClose() { closed += 1; }, onReact() {}, onProfile() {}, onOpenLikers() {},
    draft: '', setDraft() {}, onSend() {},
  });
  api.click('1 ›');
  assert.ok(api.nodes().some((n) => n.type === 'input'), 'the comments did not open');
  api.click('←');
  assert.equal(closed, 0, 'back closed the page instead of returning to the board');
  assert.ok(has(api, mod.BSIbTiles), 'back did not bring the board back');
  api.click('←');
  assert.equal(closed, 1, 'back on the page it opened on did not close it');
});

test('a session with no zones gets no zone bar, and one with no sets gets no table', () => {
  const noZones = page({ d: { zones: [] } });
  assert.ok(!has(noZones, mod.BSIbZoneBar), 'a zone bar was drawn for a session with no zones');
  assert.ok(has(noZones, mod.BSIbTiles), 'the tiles went with the zones');
  const noSets = page({ d: { breakdown: null } });
  assert.ok(!has(noSets, mod.BSIbTable), 'a table was drawn for a session with no sets');
});
